/* BIG GAME SQUARES - the Worker half. Jason, 2026-09-13: "for the super bowl, can we
 * create squares people can pick? that usual thing?" - "only the super bowl and we cannot
 * say superbowl, right?" The app says "the Big Game" (src/lib/squares.ts).
 *
 * A group whose sport is 'squares' plays one 10 x 10 grid on the Big Game.
 *
 *   GET  /api/squares?pool=<code>           the grid, who holds what, the draw, the results
 *   POST /api/squares/claim    {pool, cell} before kickoff, a free square, under the limit
 *   POST /api/squares/release  {pool, cell} before kickoff, one of your own
 *   POST /api/squares/settings {pool, maxPerPerson}   commissioner, before kickoff
 *   squaresStandings(env, pool)             the board - /api/pool/standings calls it
 *   drawDueGrids(env, now)                  the cron: every grid past kickoff gets its draw
 *
 * 🔴 THE LOCK IS KICKOFF, ON THE SERVER'S CLOCK, AND THE DRAW COMES AFTER IT. Claims are
 * refused from kickoff on; the digits are drawn at random at kickoff, once per grid, by
 * the server (crypto.getRandomValues) - so nobody can have picked a square knowing its
 * numbers, and nobody, the commissioner included, chooses them. The draw is written once
 * (`WHERE rows_digits IS NULL`), so two requests at kickoff cannot draw twice.
 *
 * 🔴 RESULTS COME FROM ESPN'S SCOREBOARD, NEVER FROM A PHONE. The quarter lines are read
 * off the NFL scoreboard (site.web.api, which answers Cloudflare) and cached in KV - a
 * minute on game day, six hours otherwise.
 */
import { sessionAccount } from './auth.ts';
import {
  BIG_GAME, SQUARES_LIMITS, PERIODS, drawDigits, isDraw, parseBigGame, squaresResults, squaresPoints,
  cleanMax, cleanCell, type BigGame
} from './lib/squares.ts';

type Json = (body: unknown, status?: number, ttl?: number) => Response;

const PATHS = ['/api/squares', '/api/squares/claim', '/api/squares/release', '/api/squares/settings'];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const HOUR = 60 * 60 * 1000;

/** The Big Game off ESPN, cached in KV. Game day (an hour before kickoff to six after)
 *  refreshes every minute; any other time every six hours. A failed read serves the last
 *  good copy. */
export async function bigGame(env: any, now = Date.now(), fetchImpl: typeof fetch = fetch): Promise<BigGame | null> {
  const key = 'squares:game:' + BIG_GAME.eventId;
  let cached: { at: number; game: BigGame } | null = null;
  try { cached = env?.LIVE ? JSON.parse((await env.LIVE.get(key)) || 'null') : null; } catch { cached = null; }
  const gameDay = now >= BIG_GAME.kickoffUtc - HOUR && now <= BIG_GAME.kickoffUtc + 6 * HOUR;
  const fresh = gameDay ? 60 * 1000 : 6 * HOUR;
  if (cached && now - cached.at < fresh && cached.game?.status !== 'live') return cached.game;
  if (cached && cached.game?.status === 'live' && now - cached.at < 60 * 1000) return cached.game;
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

const parseDigits = (s: unknown): number[] | null => {
  try { const v = JSON.parse(String(s)); return Array.isArray(v) ? v.map(Number) : null; } catch { return null; }
};

/** The group's grid, made on first sight, its lock moved with ESPN's kickoff while it is
 *  still ahead, and its digits drawn once kickoff has passed. */
async function gridOf(env: any, poolId: string, now: number, game: BigGame | null) {
  await env.DB.prepare(
    'INSERT OR IGNORE INTO squares_grid (pool_id, event_id, lock_at, max_per_person, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(poolId, BIG_GAME.eventId, game?.kickoffUtc || BIG_GAME.kickoffUtc, SQUARES_LIMITS.maxDefault, now).run();
  let g = await env.DB.prepare('SELECT * FROM squares_grid WHERE pool_id = ?').bind(poolId).first() as any;
  const lockAt = Number(g.lock_at);
  /* A kickoff ESPN moves is followed only while both times are still ahead - a lock
     that has passed never reopens. */
  if (game && Number.isFinite(game.kickoffUtc) && game.kickoffUtc !== lockAt && now < lockAt && now < game.kickoffUtc) {
    await env.DB.prepare('UPDATE squares_grid SET lock_at = ? WHERE pool_id = ?').bind(game.kickoffUtc, poolId).run();
    g = { ...g, lock_at: game.kickoffUtc };
  }
  if (now >= Number(g.lock_at) && g.rows_digits == null) {
    await drawOne(env, poolId, now);
    g = await env.DB.prepare('SELECT * FROM squares_grid WHERE pool_id = ?').bind(poolId).first() as any;
  }
  const rows = parseDigits(g.rows_digits), cols = parseDigits(g.cols_digits);
  return { lockAt: Number(g.lock_at), max: Number(g.max_per_person) || SQUARES_LIMITS.maxDefault,
           draw: isDraw({ rows, cols }) ? { rows: rows as number[], cols: cols as number[] } : null,
           drawnAt: g.drawn_at == null ? null : Number(g.drawn_at) };
}

async function drawOne(env: any, poolId: string, now: number) {
  const d = drawDigits();
  await env.DB.prepare('UPDATE squares_grid SET rows_digits = ?, cols_digits = ?, drawn_at = ? WHERE pool_id = ? AND rows_digits IS NULL')
    .bind(JSON.stringify(d.rows), JSON.stringify(d.cols), now, poolId).run();
}

/** The cron: every grid whose kickoff has passed gets its draw, even if nobody looks. */
export async function drawDueGrids(env: any, now = Date.now()) {
  if (!env?.DB) return 0;
  const due = ((await env.DB.prepare('SELECT pool_id FROM squares_grid WHERE rows_digits IS NULL AND lock_at <= ?')
    .bind(now).all()).results || []) as any[];
  for (const r of due) await drawOne(env, String(r.pool_id), now);
  return due.length;
}

async function claimsOf(env: any, poolId: string) {
  return ((await env.DB.prepare(
    `SELECT c.cell AS cell, c.user_id AS user_id, m.display_name AS name
       FROM squares_cell c LEFT JOIN member m ON m.pool_id = c.pool_id AND m.user_id = c.user_id
      WHERE c.pool_id = ?`
  ).bind(poolId).all()).results || []) as any[];
}

/** What a phone may see of the game: never ESPN's id, name or headline. */
const publicGame = (g: BigGame | null) => g && {
  kickoffUtc: g.kickoffUtc, status: g.status, period: g.period, clock: g.clock,
  home: g.home, away: g.away, homeScore: g.homeScore, awayScore: g.awayScore
};

/** The board: every member, their points from the squares that hit. `wins`, `picks` and
 *  `played` carry the football board's names, as the other points boards do. */
export async function squaresStandings(env: any, poolId: string, now = Date.now(), fetchImpl: typeof fetch = fetch) {
  const members = ((await env.DB.prepare('SELECT user_id, display_name FROM member WHERE pool_id = ?')
    .bind(poolId).all()).results || []) as any[];
  const game = await bigGame(env, now, fetchImpl);
  const grid = await gridOf(env, poolId, now, game);
  const claims = await claimsOf(env, poolId);
  const owners = new Map<number, string>(claims.map((c) => [Number(c.cell), String(c.user_id)]));
  const results = squaresResults(grid.draw, owners, game);
  const pts = squaresPoints(results);
  const held = new Map<string, number>();
  for (const c of claims) held.set(String(c.user_id), (held.get(String(c.user_id)) || 0) + 1);
  return members.map((m) => {
    const id = String(m.user_id);
    const p = pts.get(id) || { points: 0, hits: 0 };
    return { id, name: String(m.display_name || ''), points: p.points, hits: p.hits, squares: held.get(id) || 0 };
  })
    .sort((a, b) => b.points - a.points || b.hits - a.hits || a.name.localeCompare(b.name))
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
  const now = Date.now();
  const game = await bigGame(env, now, fetchImpl);
  const grid = await gridOf(env, poolId, now, game);
  const locked = now >= grid.lockAt;
  const lockedRes = () => json({ error: 'locked', message: 'The grid locked at kickoff.', locked: true }, 409);

  if (p === '/api/squares' && !post) {
    const claims = await claimsOf(env, poolId);
    const owners = new Map<number, string>(claims.map((c) => [Number(c.cell), String(c.user_id)]));
    const names = new Map<number, string>(claims.map((c) => [Number(c.cell), String(c.name || '')]));
    const cells = Array.from({ length: SQUARES_LIMITS.cells }, (_, i) =>
      owners.has(i) ? { name: names.get(i) || '', mine: owners.get(i) === uid } : null);
    const results = squaresResults(grid.draw, owners, game).map((r) => ({
      key: r.key, label: r.label, points: r.points, home: r.home, away: r.away, cell: r.cell,
      name: r.userId ? (names.get(r.cell) || '') : null, mine: r.userId === uid
    }));
    return json({
      pool: poolId, name: m.name, role: m.role, now, game: publicGame(game),
      lockAt: grid.lockAt, locked, maxPerPerson: grid.max,
      digits: grid.draw, cells, myCount: claims.filter((c) => String(c.user_id) === uid).length,
      taken: claims.length, results, periods: PERIODS
    });
  }

  if (p === '/api/squares/claim' && post) {
    if (locked) return lockedRes();
    const cell = cleanCell(b.cell);
    if (cell == null) return json({ error: 'bad_cell', message: 'Pick a square on the grid.' }, 400);
    /* One statement: a free square, and only while you hold fewer than the limit. */
    const r = await env.DB.prepare(
      `INSERT OR IGNORE INTO squares_cell (pool_id, cell, user_id, claimed_at)
       SELECT ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM squares_cell WHERE pool_id = ? AND user_id = ?) < ?`
    ).bind(poolId, cell, uid, now, poolId, uid, grid.max).run();
    if (!(r?.meta?.changes > 0)) {
      const owner = await env.DB.prepare('SELECT user_id FROM squares_cell WHERE pool_id = ? AND cell = ?').bind(poolId, cell).first() as any;
      if (owner && String(owner.user_id) === uid) return json({ ok: true, cell, already: true });
      if (owner) return json({ error: 'taken', message: 'Somebody has that square.' }, 409);
      return json({ error: 'limit', message: `You can hold ${grid.max} square${grid.max === 1 ? '' : 's'} in this group.`, max: grid.max }, 409);
    }
    return json({ ok: true, cell });
  }

  if (p === '/api/squares/release' && post) {
    if (locked) return lockedRes();
    const cell = cleanCell(b.cell);
    if (cell == null) return json({ error: 'bad_cell', message: 'Pick a square on the grid.' }, 400);
    const r = await env.DB.prepare('DELETE FROM squares_cell WHERE pool_id = ? AND cell = ? AND user_id = ?').bind(poolId, cell, uid).run();
    if (!(r?.meta?.changes > 0)) return json({ error: 'not_yours', message: 'That square is not yours.' }, 409);
    return json({ ok: true, cell });
  }

  if (p === '/api/squares/settings' && post) {
    if (!isCommish) return json({ error: 'commissioner_only', message: 'Only the commissioner can do that.' }, 403);
    if (locked) return lockedRes();
    const max = cleanMax(b.maxPerPerson);
    if (max == null) return json({ error: 'bad_max', message: `Squares per person is 1 to ${SQUARES_LIMITS.maxMax}.` }, 400);
    /* Lowering it takes nobody's squares away; it stops new claims past it. */
    await env.DB.prepare('UPDATE squares_grid SET max_per_person = ? WHERE pool_id = ?').bind(max, poolId).run();
    return json({ ok: true, maxPerPerson: max });
  }

  return json({ error: 'not found' }, 404);
}
