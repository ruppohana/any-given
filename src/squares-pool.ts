/* BIG GAME SQUARES - the Worker half. Jason, 2026-09-13: "for the super bowl, can we
 * create squares people can pick? that usual thing?" - "only the super bowl and we cannot
 * say superbowl, right?" The app says "the Big Game" (src/lib/squares.ts).
 *
 * A group whose sport is 'squares' plays the Big Game on one or more 10 x 10 SHEETS
 * ("we will also need to add additional cards to the same pool"; "sometimes we start with 2
 * sheets ... i dont want 3 different groups"). The API calls a sheet a `card`. Each sheet has
 * its own claims, limit, draw, name and box price in MARBLES ("call them marbles for all i
 * care"); a person's points, marbles in and marbles won are summed over every sheet.
 *
 *   GET  /api/squares?pool=<code>&card=<n>      a sheet (1 by default), the list of sheets
 *   POST /api/squares/claim    {pool, card, cell}   before the sheet is drawn or kickoff
 *   POST /api/squares/release  {pool, card, cell}   the same, one of your own
 *   POST /api/squares/settings {pool, card, name?, boxPrice?, split?, maxPerPerson?}   commissioner
 *   POST /api/squares/draw     {pool, card}         commissioner: draw this sheet's numbers now
 *   POST /api/squares/card     {pool}               commissioner: add another sheet
 *   squaresStandings(env, pool)                     the board - /api/pool/standings calls it
 *   drawDueGrids(env, now)                          the cron: every sheet past kickoff is drawn
 *
 * 🔴 NOBODY CLAIMS A SQUARE KNOWING ITS NUMBERS. A sheet closes the moment its numbers are
 * drawn - by the commissioner's "Draw the numbers" ("a way to randomize the numbers"), or at
 * kickoff for a sheet nobody drew. The draw is the server's (crypto.getRandomValues), written
 * once (`WHERE rows_digits IS NULL`), so two taps cannot draw twice and nobody, the
 * commissioner included, chooses the numbers.
 *
 * 🔴 MARBLES, NEVER DOLLARS. A box price, a pot and a payout are counts of marbles on the
 * sheet - not the live board's Marbles balance, never bought, never cashed. No dollar amount
 * is stored or shown anywhere (vault: decisions/squares-track-the-money-2026-09-13.md).
 *
 * 🔴 RESULTS COME FROM ESPN'S SCOREBOARD, NEVER FROM A PHONE. The quarter lines are read
 * off the NFL scoreboard (site.web.api, which answers Cloudflare) and cached in KV - a
 * minute on game day, six hours otherwise.
 */
import { sessionAccount } from './auth.ts';
import {
  BIG_GAME, SQUARES_LIMITS, PERIODS, drawDigits, isDraw, parseBigGame, squaresResults, squaresPoints,
  cleanMax, cleanCell, cleanBoxPrice, cleanSplit, cleanSheetName, sheetPayouts, DEFAULT_SPLIT, type BigGame
} from './lib/squares.ts';

type Json = (body: unknown, status?: number, ttl?: number) => Response;

const PATHS = ['/api/squares', '/api/squares/claim', '/api/squares/release', '/api/squares/settings',
  '/api/squares/draw', '/api/squares/card'];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const HOUR = 60 * 60 * 1000;
/** Sheets a group may run. */
export const MAX_CARDS = 10;

/** A sheet number from a phone: 1 to MAX_CARDS, else sheet 1. */
export function cleanCard(v: unknown): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= MAX_CARDS ? n : 1;
}

/** The Big Game off ESPN, cached in KV. Game day (an hour before kickoff to six after)
 *  refreshes every minute; any other time every six hours. A failed read serves the last
 *  good copy. */
export async function bigGame(env: any, now = Date.now(), fetchImpl: typeof fetch = fetch): Promise<BigGame | null> {
  const key = 'squares:game:' + BIG_GAME.eventId;
  let cached: { at: number; game: BigGame } | null = null;
  try { cached = env?.LIVE ? JSON.parse((await env.LIVE.get(key)) || 'null') : null; } catch { cached = null; }
  const gameDay = now >= BIG_GAME.kickoffUtc - HOUR && now <= BIG_GAME.kickoffUtc + 6 * HOUR;
  const fresh = gameDay || cached?.game?.status === 'live' ? 60 * 1000 : 6 * HOUR;
  if (cached && now - cached.at < fresh) return cached.game;
  try {
    const r = await fetchImpl(`https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${BIG_GAME.dates}`,
      { headers: { 'user-agent': UA, accept: 'application/json' } });
    if (!r.ok) throw new Error('espn ' + r.status);
    const game = parseBigGame(await r.json(), BIG_GAME.eventId);
    if (!game) throw new Error('the game is not on the scoreboard');
    if (env?.LIVE) { try { await env.LIVE.put(key, JSON.stringify({ at: now, game }), { expirationTtl: 60 * 60 * 24 * 7 }); } catch { /* fine */ } }
    return game;
  } catch {
    return cached ? cached.game : null;
  }
}

const parseJsonArr = (s: unknown): number[] | null => {
  try { const v = JSON.parse(String(s)); return Array.isArray(v) ? v.map(Number) : null; } catch { return null; }
};
const drawOf = (g: any) => {
  const rows = parseJsonArr(g.rows_digits), cols = parseJsonArr(g.cols_digits);
  return isDraw({ rows, cols }) ? { rows: rows as number[], cols: cols as number[] } : null;
};

/** Sheet 1 exists from the first look; every lock follows ESPN's kickoff while both are ahead. */
async function ensurePool(env: any, poolId: string, now: number, game: BigGame | null) {
  await env.DB.prepare(
    'INSERT OR IGNORE INTO squares_grid (pool_id, card, event_id, lock_at, max_per_person, created_at) VALUES (?, 1, ?, ?, ?, ?)'
  ).bind(poolId, BIG_GAME.eventId, game?.kickoffUtc || BIG_GAME.kickoffUtc, SQUARES_LIMITS.maxDefault, now).run();
  /* A kickoff ESPN moves is followed only while it and the stored lock are still ahead -
     a lock that has passed never reopens. */
  if (game && Number.isFinite(game.kickoffUtc) && now < game.kickoffUtc) {
    await env.DB.prepare('UPDATE squares_grid SET lock_at = ? WHERE pool_id = ? AND lock_at > ? AND lock_at <> ?')
      .bind(game.kickoffUtc, poolId, now, game.kickoffUtc).run();
  }
}

async function drawOne(env: any, poolId: string, card: number, now: number): Promise<boolean> {
  const d = drawDigits();
  const r = await env.DB.prepare(
    'UPDATE squares_grid SET rows_digits = ?, cols_digits = ?, drawn_at = ? WHERE pool_id = ? AND card = ? AND rows_digits IS NULL'
  ).bind(JSON.stringify(d.rows), JSON.stringify(d.cols), now, poolId, card).run();
  return (r?.meta?.changes || 0) > 0;
}

/** Every sheet of the group, each drawn if kickoff has passed. */
async function cardsOf(env: any, poolId: string, now: number) {
  const read = async () => ((await env.DB.prepare('SELECT * FROM squares_grid WHERE pool_id = ? ORDER BY card').bind(poolId).all()).results || []) as any[];
  let rows = await read();
  const due = rows.filter((g) => now >= Number(g.lock_at) && g.rows_digits == null);
  if (due.length) {
    for (const g of due) await drawOne(env, poolId, Number(g.card), now);
    rows = await read();
  }
  return rows.map((g) => {
    const card = Number(g.card);
    const split = cleanSplit(parseJsonArr(g.split));
    return {
      card, lockAt: Number(g.lock_at), max: Number(g.max_per_person) || SQUARES_LIMITS.maxDefault,
      draw: drawOf(g), drawnAt: g.drawn_at == null ? null : Number(g.drawn_at),
      name: cleanSheetName(g.name) || 'Sheet ' + card,
      boxPrice: Number(g.box_marbles) || 0,
      split: split || DEFAULT_SPLIT
    };
  });
}

/** The cron: every sheet whose kickoff has passed gets its draw, even if nobody looks. */
export async function drawDueGrids(env: any, now = Date.now()) {
  if (!env?.DB) return 0;
  const due = ((await env.DB.prepare('SELECT pool_id, card FROM squares_grid WHERE rows_digits IS NULL AND lock_at <= ?')
    .bind(now).all()).results || []) as any[];
  for (const r of due) await drawOne(env, String(r.pool_id), Number(r.card), now);
  return due.length;
}

async function claimsOf(env: any, poolId: string) {
  return ((await env.DB.prepare(
    `SELECT c.card AS card, c.cell AS cell, c.user_id AS user_id, m.display_name AS name
       FROM squares_cell c LEFT JOIN member m ON m.pool_id = c.pool_id AND m.user_id = c.user_id
      WHERE c.pool_id = ?`
  ).bind(poolId).all()).results || []) as any[];
}

/** What a phone may see of the game: never ESPN's id, name or headline. */
const publicGame = (g: BigGame | null) => g && {
  kickoffUtc: g.kickoffUtc, status: g.status, period: g.period, clock: g.clock,
  home: g.home, away: g.away, homeScore: g.homeScore, awayScore: g.awayScore
};

/** One sheet's results and marbles, from its claims. */
function sheetOutcome(c: any, claims: any[], game: BigGame | null) {
  const here = claims.filter((x) => Number(x.card) === c.card);
  const owners = new Map<number, string>(here.map((x) => [Number(x.cell), String(x.user_id)]));
  const results = squaresResults(c.draw, owners, game);
  /* The pot is the FULL sheet - 100 squares x the cost of one. Jason, 2026-09-13: "the
     comish will assist in the cost per square and the payout. assume all marbles are
     distributed." Every quarter's payout is known before a square is claimed. */
  const pot = c.boxPrice * SQUARES_LIMITS.cells;
  const payouts = sheetPayouts(pot, c.split, results);
  return { here, owners, results, pot, payouts };
}

/** The board: every member - points from the squares that hit, and marbles in and won - over
 *  every sheet. `wins`, `picks` and `played` carry the football board's names, as the other
 *  points boards do. */
export async function squaresStandings(env: any, poolId: string, now = Date.now(), fetchImpl: typeof fetch = fetch) {
  const members = ((await env.DB.prepare('SELECT user_id, display_name FROM member WHERE pool_id = ?')
    .bind(poolId).all()).results || []) as any[];
  const game = await bigGame(env, now, fetchImpl);
  await ensurePool(env, poolId, now, game);
  const cards = await cardsOf(env, poolId, now);
  const claims = await claimsOf(env, poolId);
  const results: { points: number; userId: string | null }[] = [];
  const marblesIn = new Map<string, number>(), marblesWon = new Map<string, number>();
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) || 0) + v);
  for (const c of cards) {
    const o = sheetOutcome(c, claims, game);
    results.push(...o.results);
    for (const x of o.here) add(marblesIn, String(x.user_id), c.boxPrice);
    for (const p of o.payouts) if (p.settled && p.userId) add(marblesWon, p.userId, p.amount);
  }
  const pts = squaresPoints(results);
  const held = new Map<string, number>();
  for (const c of claims) held.set(String(c.user_id), (held.get(String(c.user_id)) || 0) + 1);
  return members.map((m) => {
    const id = String(m.user_id);
    const p = pts.get(id) || { points: 0, hits: 0 };
    return { id, name: String(m.display_name || ''), points: p.points, hits: p.hits, squares: held.get(id) || 0,
             marblesIn: marblesIn.get(id) || 0, marblesWon: marblesWon.get(id) || 0 };
  })
    .sort((a, b) => b.points - a.points || b.marblesWon - a.marblesWon || b.hits - a.hits || a.name.localeCompare(b.name))
    .map((r) => ({ ...r, wins: r.points, picks: r.squares, played: results.length }));
}

export async function handleSquaresPool(req: Request, env: any, p: string, json: Json, fetchImpl: typeof fetch = fetch): Promise<Response | null> {
  if (!PATHS.includes(p)) return null;
  if (!env.DB) return json({ error: 'no database' }, 503);
  const s = await sessionAccount(req, env);
  if (!s) return json({ error: 'email_required', message: 'Sign in to play.' }, 401);
  const uid = String(s.accountId);
  const url = new URL(req.url);
  const post = req.method === 'POST';
  const b: any = post ? await req.json().catch(() => ({})) : {};
  const poolId = String((post ? b.pool : url.searchParams.get('pool')) || '').toUpperCase().trim();
  if (!poolId) return json({ error: 'pool_required', message: 'Which group?' }, 400);

  const m = await env.DB.prepare(
    'SELECT m.role AS role, p.sport AS sport, p.name AS name FROM member m JOIN pool p ON p.id = m.pool_id WHERE m.pool_id = ? AND m.user_id = ?'
  ).bind(poolId, uid).first() as any;
  if (!m) return json({ error: 'not_a_member', message: 'You are not in this group.' }, 403);
  if (m.sport !== 'squares') return json({ error: 'not_a_squares_group', message: 'This group does not play squares.' }, 409);
  const isCommish = m.role === 'commissioner';
  const onlyCommish = () => json({ error: 'commissioner_only', message: 'Only the commissioner can do that.' }, 403);
  const now = Date.now();
  const game = await bigGame(env, now, fetchImpl);
  await ensurePool(env, poolId, now, game);
  const cards = await cardsOf(env, poolId, now);
  const kickoff = cards[0]?.lockAt || BIG_GAME.kickoffUtc;
  const started = now >= kickoff;

  /* ---- add a sheet: the commissioner, before kickoff, up to MAX_CARDS ---- */
  if (p === '/api/squares/card' && post) {
    if (!isCommish) return onlyCommish();
    if (started) return json({ error: 'locked', message: 'Sheets can be added until kickoff.', locked: true }, 409);
    if (cards.length >= MAX_CARDS) return json({ error: 'too_many', message: `A group can run up to ${MAX_CARDS} sheets.` }, 409);
    const next = Math.max(...cards.map((c) => c.card)) + 1;
    await env.DB.prepare(
      'INSERT OR IGNORE INTO squares_grid (pool_id, card, event_id, lock_at, max_per_person, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(poolId, next, BIG_GAME.eventId, kickoff, cards[0]?.max || SQUARES_LIMITS.maxDefault, now).run();
    return json({ ok: true, card: next, cards: cards.length + 1 });
  }

  const cardNo = cleanCard(post ? b.card : url.searchParams.get('card'));
  const grid = cards.find((c) => c.card === cardNo);
  if (!grid) return json({ error: 'no_card', message: 'That sheet is not in this group.', cards: cards.map((c) => c.card) }, 404);
  const drawn = !!grid.draw;
  const closedRes = () => started
    ? json({ error: 'locked', message: 'The sheets locked at kickoff.', locked: true }, 409)
    : json({ error: 'drawn', message: 'The numbers are drawn - this sheet is closed.', locked: true }, 409);

  if (p === '/api/squares' && !post) {
    const claims = await claimsOf(env, poolId);
    const o = sheetOutcome(grid, claims, game);
    const names = new Map<number, string>(o.here.map((c) => [Number(c.cell), String(c.name || '')]));
    const cells = Array.from({ length: SQUARES_LIMITS.cells }, (_, i) =>
      o.owners.has(i) ? { name: names.get(i) || '', mine: o.owners.get(i) === uid } : null);
    const results = o.results.map((r) => ({
      key: r.key, label: r.label, points: r.points, home: r.home, away: r.away, cell: r.cell,
      name: r.userId ? (names.get(r.cell) || '') : null, mine: r.userId === uid
    }));
    const nameOf = (id: string | null) => {
      if (!id) return null;
      const c = o.here.find((x) => String(x.user_id) === id);
      return c ? String(c.name || '') : '';
    };
    const myCount = o.here.filter((c) => String(c.user_id) === uid).length;
    return json({
      pool: poolId, name: m.name, role: m.role, now, game: publicGame(game),
      card: cardNo,
      cards: cards.map((c) => ({
        card: c.card, name: c.name, boxPrice: c.boxPrice, drawn: !!c.draw,
        taken: claims.filter((x) => Number(x.card) === c.card).length,
        mine: claims.filter((x) => Number(x.card) === c.card && String(x.user_id) === uid).length
      })),
      maxCards: MAX_CARDS, canAddCard: isCommish && !started && cards.length < MAX_CARDS,
      lockAt: grid.lockAt, locked: started || drawn, drawn, drawnAt: grid.drawnAt, maxPerPerson: grid.max,
      sheetName: grid.name, boxPrice: grid.boxPrice, split: grid.split, pot: o.pot,
      payouts: o.payouts.map((p) => ({ key: p.key, label: p.label, percent: p.percent, amount: p.amount,
        settled: p.settled, rolled: p.rolled, unclaimed: p.unclaimed, name: nameOf(p.userId), mine: p.userId === uid })),
      marblesIn: myCount * grid.boxPrice,
      marblesWon: o.payouts.filter((p) => p.settled && p.userId === uid).reduce((a, p) => a + p.amount, 0),
      digits: grid.draw, cells, myCount, taken: o.here.length, results, periods: PERIODS
    });
  }

  if (p === '/api/squares/claim' && post) {
    if (started || drawn) return closedRes();
    const cell = cleanCell(b.cell);
    if (cell == null) return json({ error: 'bad_cell', message: 'Pick a square on the sheet.' }, 400);
    /* One statement: a free square, and only while you hold fewer than this sheet's limit. */
    const r = await env.DB.prepare(
      `INSERT OR IGNORE INTO squares_cell (pool_id, card, cell, user_id, claimed_at)
       SELECT ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM squares_cell WHERE pool_id = ? AND card = ? AND user_id = ?) < ?`
    ).bind(poolId, cardNo, cell, uid, now, poolId, cardNo, uid, grid.max).run();
    if (!(r?.meta?.changes > 0)) {
      const owner = await env.DB.prepare('SELECT user_id FROM squares_cell WHERE pool_id = ? AND card = ? AND cell = ?')
        .bind(poolId, cardNo, cell).first() as any;
      if (owner && String(owner.user_id) === uid) return json({ ok: true, card: cardNo, cell, already: true });
      if (owner) return json({ error: 'taken', message: 'Somebody has that square.' }, 409);
      return json({ error: 'limit', message: `You can hold ${grid.max} square${grid.max === 1 ? '' : 's'} on this sheet.`, max: grid.max }, 409);
    }
    return json({ ok: true, card: cardNo, cell });
  }

  if (p === '/api/squares/release' && post) {
    if (started || drawn) return closedRes();
    const cell = cleanCell(b.cell);
    if (cell == null) return json({ error: 'bad_cell', message: 'Pick a square on the sheet.' }, 400);
    const r = await env.DB.prepare('DELETE FROM squares_cell WHERE pool_id = ? AND card = ? AND cell = ? AND user_id = ?')
      .bind(poolId, cardNo, cell, uid).run();
    if (!(r?.meta?.changes > 0)) return json({ error: 'not_yours', message: 'That square is not yours.' }, 409);
    return json({ ok: true, card: cardNo, cell });
  }

  if (!isCommish) return onlyCommish();

  /* The commissioner's sheet settings. A name can change any time; the box price, the
     payout split and the per-person limit only while the sheet is open (before its draw
     and before kickoff) - nobody's stake changes under a square they already hold after
     the numbers are known. Each field is optional; one at least has to be valid. */
  if (p === '/api/squares/settings' && post) {
    const sets: string[] = [], args: any[] = [];
    const out: any = { ok: true, card: cardNo };
    if (b.name !== undefined) {
      const nm = cleanSheetName(b.name);
      sets.push('name = ?'); args.push(nm || null); out.sheetName = nm || 'Sheet ' + cardNo;
    }
    const money = b.boxPrice !== undefined || b.split !== undefined || b.maxPerPerson !== undefined;
    if (money && (started || drawn)) return closedRes();
    if (b.boxPrice !== undefined) {
      const v = cleanBoxPrice(b.boxPrice);
      if (v == null) return json({ error: 'bad_price', message: 'A box costs 0 to 1,000 marbles.' }, 400);
      sets.push('box_marbles = ?'); args.push(v); out.boxPrice = v;
    }
    if (b.split !== undefined) {
      const v = cleanSplit(b.split);
      if (!v) return json({ error: 'bad_split', message: 'The four payouts are whole percents that add up to 100.' }, 400);
      sets.push('split = ?'); args.push(JSON.stringify(v)); out.split = v;
    }
    if (b.maxPerPerson !== undefined) {
      const v = cleanMax(b.maxPerPerson);
      if (v == null) return json({ error: 'bad_max', message: `Squares per person is 1 to ${SQUARES_LIMITS.maxMax}.` }, 400);
      /* Lowering it takes nobody's squares away; it stops new claims past it. */
      sets.push('max_per_person = ?'); args.push(v); out.maxPerPerson = v;
    }
    if (!sets.length) return json({ error: 'nothing_to_change', message: 'Nothing to change.' }, 400);
    await env.DB.prepare(`UPDATE squares_grid SET ${sets.join(', ')} WHERE pool_id = ? AND card = ?`)
      .bind(...args, poolId, cardNo).run();
    return json(out);
  }

  /* "a way to randomize the numbers": the commissioner draws a sheet's numbers early -
     once, by the server - and the sheet closes. */
  if (p === '/api/squares/draw' && post) {
    if (started) return json({ error: 'locked', message: 'The numbers were drawn at kickoff.', locked: true }, 409);
    if (drawn) return json({ error: 'already_drawn', message: 'This sheet\'s numbers are already drawn.', digits: grid.draw }, 409);
    await drawOne(env, poolId, cardNo, now);
    const g = await env.DB.prepare('SELECT * FROM squares_grid WHERE pool_id = ? AND card = ?').bind(poolId, cardNo).first() as any;
    return json({ ok: true, card: cardNo, digits: drawOf(g) });
  }

  return json({ error: 'not found' }, 404);
}
