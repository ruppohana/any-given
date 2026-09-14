/* BIG GAME SQUARES - #/squares, the pool of a group whose sport is 'squares'.
 *
 * Jason, 2026-09-13, asked for "that usual thing" - the office grid - on the Big
 * Game, then "do the big game squares next". The app never says the game's name:
 * it is the NFL's trademark, so every word on this screen says "the Big Game".
 *
 * A group runs one or more SHEETS - 10 x 10 grids, each with its own claims, limit and
 * draw (Jason: "we will also need to add additional cards to the same pool"; he calls
 * them sheets - "sometimes we start with 2 sheets", so a person reads "sheet" and the
 * API says `card`). Members claim squares until a sheet's numbers are drawn: by the
 * commissioner's "Draw the numbers" (two taps), or at kickoff for a sheet nobody drew.
 * The server draws the digits 0-9 at random, once down the left for the home team (the
 * rows) and once across the top for the away team (the columns), and a drawn sheet is
 * closed. At the end of the 1st quarter, halftime, the end of the 3rd and the final,
 * the square where the last digit of each score meets scores that moment's points,
 * summed over every sheet on the standings. A square nobody claimed scores nobody.
 *
 * "keep the same size, the person who is on the page has their squares highlighted":
 * the squares stay ~30px at 393px; yours are filled with the accent. Before a draw an
 * open square carries a faint "+".
 *
 * The Worker is src/squares-pool.ts; the rules are src/lib/squares.ts, the one copy
 * this screen imports too (BIG_GAME, PERIODS, cellOf). The server is the only clock:
 * the lock is read against the `now` it sent, carried forward on this phone's clock,
 * and a claim after kickoff is refused there whatever this screen thinks.
 *
 * 🔴 POOL FIRST (Jason, 2026-09-13). Somebody signed out, or signed in with no squares
 * group, sees the grid itself - empty, "?" for the digits, "Home team" / "Away team" -
 * with a Start a group / Join a group pair on it. The first tap on a square asks:
 * signed out, the sign-in sheet (then the claim goes on if a group is there); signed
 * in with no group, a small inline Start / Join sheet. Never a full-screen wall.
 *
 * 🔴 IT RE-DRAWS A HOST, NOT #root. The shell appends the ad slot to #root after the
 * first render (props.screen.js draws the same way).
 */
import { stateBlock, STATES_CSS } from '/components/states.js';
import { pageHeader, HEADER_CSS } from '/components/header.js';
import { myGroups, currentGroupId, setCurrentGroupId, groupSwitcher, forgetGroups, GROUP_CSS } from '/components/group.js';
import { startJoinCard, startJoinSheet, noGroupTap, START_JOIN_CSS } from '/components/start-join.js';
import {
  BIG_GAME, PERIODS, SQUARES_LIMITS, cellOf, marbles, DEFAULT_SPLIT, MAX_BOX, SHEET_NAME_MAX,
  cleanSheetName, cleanSplit, cleanBoxPrice, sheetPayouts
} from '/src/lib/squares.js';

export const id = 'squares';
export const title = 'Big Game squares';
export const bar = null;
export const states = ['ready', 'signed-out', 'no-group', 'loading', 'offline', 'error'];

export const SQUARES_SPORT = 'squares';

/** The rules, two lines - under the grid a person has not played yet. The points
 *  are src/lib/squares.ts PERIODS. */
export const RULES_SHORT = 'Claim squares until the numbers are drawn - at kickoff, or earlier when the commissioner '
  + 'draws a sheet. The numbers 0–9 are drawn at random for each team, and a drawn sheet is closed. At each quarter '
  + 'the square where the last digits of the two scores meet scores points.';
export const RULES_FULL = 'Claim squares on a 10 × 10 sheet until its numbers are drawn - at kickoff, or earlier when '
  + 'the commissioner draws a sheet. The numbers 0–9 are drawn at random for each team, and a drawn sheet is closed. '
  + 'A group can run more than one sheet, and your points add up across them. At the end of each quarter the square '
  + 'where the last digits of the two scores meet scores points - 1st quarter 1, halftime 2, 3rd quarter 1, final 3 '
  + '(overtime counts in the final). A square nobody claimed scores nobody.';

/* ------------------------------------------------------------------ *
 * PURE - tests/squares-screen.test.mjs runs these against responses built by
 * the real src/squares-pool.ts from the real ESPN captures.
 * ------------------------------------------------------------------ */

/** Only the groups that play squares. */
export function squaresGroupsOf(groups) {
  return (Array.isArray(groups) ? groups : []).filter((g) => g && g.id && g.sport === SQUARES_SPORT);
}

/** The current group when it plays squares, else the first that does. */
export function chooseGroup(groups, currentId) {
  if (!groups || !groups.length) return null;
  return groups.find((g) => g.id === currentId) || groups[0];
}

/** Two letters for a square: the first of two words, or the first two of one.
 *  "Ann Lee" -> "AL", "commish" -> "CO", "@cora" -> "CO". */
export function initials(name) {
  const s = String(name == null ? '' : name).trim().replace(/^@+/, '');
  if (!s) return '';
  const words = s.split(/[\s._-]+/).filter(Boolean);
  const letters = words.length > 1 ? [Array.from(words[0])[0], Array.from(words[1])[0]] : Array.from(words[0] || s).slice(0, 2);
  return letters.join('').toUpperCase();
}

const HEX = /^#[0-9a-f]{6}$/i;

/** One side of the grid: the team once ESPN names it, "Home team" / "Away team"
 *  while it is TBD. `color` is null when there is none to use - the CSS falls back
 *  to --team-null. */
export function sideOf(team, home) {
  if (!team) {
    return { name: home ? 'Home team' : 'Away team', abbrev: home ? 'Home' : 'Away', color: null, known: false };
  }
  const color = HEX.test(String(team.primary || '')) ? String(team.primary) : null;
  return { name: String(team.name || team.short || team.abbrev), abbrev: String(team.abbrev || team.short || ''), color, known: true };
}

const SHORT = { q1: 'Q1', half: 'HT', q3: 'Q3', final: 'F' };

/** A winning square's mark: the moments it hit, then their points - "HT+2", "Q1·F+4". */
export function winTag(list) {
  if (!list || !list.length) return '';
  return list.map((r) => SHORT[r.key] || r.label).join('·') + '+' + list.reduce((n, r) => n + (Number(r.points) || 0), 0);
}

/** Everything the grid draws, from GET /api/squares. */
export function gridModel(d) {
  const digits = d && d.digits && Array.isArray(d.digits.rows) && Array.isArray(d.digits.cols) ? d.digits : null;
  const game = (d && d.game) || null;
  const home = sideOf(game && game.home, true);
  const away = sideOf(game && game.away, false);
  const wins = new Map();
  for (const r of (d && d.results) || []) {
    if (!wins.has(r.cell)) wins.set(r.cell, []);
    wins.get(r.cell).push(r);
  }
  /* The square the score is on now - the one the next moment pays, and at the final
     the final's own. Only once there is a draw and a score. */
  let current = null;
  if (digits && game && (game.status === 'live' || game.status === 'final')
      && Number.isFinite(game.homeScore) && Number.isFinite(game.awayScore)) {
    current = cellOf(digits, game.homeScore, game.awayScore);
  }
  const cells = Array.from({ length: SQUARES_LIMITS.cells }, (_, i) => {
    const c = (d && Array.isArray(d.cells) && d.cells[i]) || null;
    const row = Math.floor(i / 10), col = i % 10;
    const w = wins.get(i) || [];
    return {
      i, row, col, taken: !!c, mine: !!(c && c.mine), name: c ? String(c.name || '') : '', text: c ? initials(c.name) : '',
      rowDigit: digits ? digits.rows[row] : null, colDigit: digits ? digits.cols[col] : null,
      wins: w.map((r) => ({ key: r.key, label: r.label, points: r.points })), tag: winTag(w), current: i === current
    };
  });
  const q = (a) => (digits ? a.map(String) : Array(10).fill('?'));
  return { drawn: !!digits, rows: q(digits ? digits.rows : []), cols: q(digits ? digits.cols : []), home, away, cells, current };
}

/** What a square is called aloud: where it sits, who holds it, what it won. */
export function cellLabel(c, m) {
  const where = m.drawn ? m.home.abbrev + ' ' + c.rowDigit + ', ' + m.away.abbrev + ' ' + c.colDigit
    : 'Row ' + (c.row + 1) + ', column ' + (c.col + 1);
  const who = c.mine ? 'yours' : c.taken ? (c.name || 'taken') : 'open';
  const won = c.wins.map((w) => w.label + ' square, ' + w.points + (w.points === 1 ? ' point' : ' points'));
  return [where, who, ...won, ...(c.current ? ['the score is on it now'] : [])].join(', ');
}

const WEEK = 6 * 86400000;

/** "Locks Sun 3:30 PM" within the week, "Locks Sun, Feb 14 · 3:30 PM" past it, "Locked"
 *  from kickoff on - in the phone's own time zone (`tz` is for the tests), the way
 *  props.screen.js says a question's lock. */
export function lockText(lockAt, now, tz) {
  if (!(now < lockAt)) return 'Locked';
  const o = tz ? { timeZone: tz } : {};
  const d = new Date(lockAt);
  const time = d.toLocaleTimeString('en-US', { ...o, hour: 'numeric', minute: '2-digit' });
  if (lockAt - now < WEEK) return 'Locks ' + d.toLocaleDateString('en-US', { ...o, weekday: 'short' }) + ' ' + time;
  return 'Locks ' + d.toLocaleDateString('en-US', { ...o, weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + time;
}

/** "Sun, Feb 14" - the game's day, in the phone's time zone. */
export function gameDay(ms, tz) {
  return new Date(ms).toLocaleDateString('en-US', { ...(tz ? { timeZone: tz } : {}), weekday: 'short', month: 'short', day: 'numeric' });
}

/** "NE 13 – SEA 29", home first (the home team is the rows), or '' with no score. */
export function scoreText(g) {
  if (!g || !Number.isFinite(g.homeScore) || !Number.isFinite(g.awayScore)) return '';
  const h = g.home ? g.home.abbrev : 'Home', a = g.away ? g.away.abbrev : 'Away';
  return h + ' ' + g.homeScore + ' – ' + a + ' ' + g.awayScore;
}

/* ---- sheets. The API's `card` is a person's "sheet". ---- */

/** A sheet's name - the commissioner's, else "Sheet 2". `c` is a `cards[]` item, or
 *  sheetOf() of the sheet on show (GET /api/squares `name` is the GROUP's name). */
export function sheetName(c) {
  const n = String((c && c.name) || '').trim();
  return n || 'Sheet ' + (Number(c && c.card) || 1);
}

/** The sheet on show, in the shape of a `cards[]` item. */
export function sheetOf(sq) {
  return { card: Number(sq && sq.card) || 1, name: String((sq && sq.sheetName) || ''), boxPrice: Number(sq && sq.boxPrice) || 0,
           drawn: !!(sq && sq.drawn), taken: Number(sq && sq.taken) || 0, mine: Number(sq && sq.myCount) || 0 };
}

/** The group's sheets from GET /api/squares, or just the one on show. */
export function sheetsOf(d) {
  if (d && Array.isArray(d.cards) && d.cards.length) return d.cards;
  return [sheetOf(d)];
}

/** A switcher button: "Sheet 2 · 3 yours". */
export function sheetLabel(c) {
  return sheetName(c) + ' · ' + (Number(c && c.mine) || 0) + ' yours';
}

/** More than one sheet, or the commissioner may add one: the switcher shows. */
export function showsSheets(d) {
  return sheetsOf(d).length > 1 || !!(d && d.canAddCard);
}

const SHEET_KEY = 'ag.sqSheet.';

/** The last sheet this phone looked at in a group - 1 when it has none, or storage
 *  is blocked. */
export function savedSheet(groupId) {
  try {
    const n = Number(localStorage.getItem(SHEET_KEY + groupId));
    return Number.isInteger(n) && n >= 1 ? n : 1;
  } catch { return 1; }
}

export function saveSheet(groupId, n) {
  try { localStorage.setItem(SHEET_KEY + groupId, String(n)); } catch { /* a blocked store just forgets */ }
}

/** GET /api/squares for a sheet - the bare route for sheet 1, the server's default. */
export function gridUrl(pool, card) {
  const n = Number(card) || 1;
  return '/api/squares?pool=' + encodeURIComponent(pool) + (n > 1 ? '&card=' + n : '');
}

/* ---- marbles. A sheet's box price is a count of MARBLES (src/lib/squares.ts) - never
 * dollars, never "money". The app shows the pot and the payouts; it holds nothing. ---- */

/** Under a sheet's name: "5 marbles a square", or "Points only" at 0. */
export function priceLine(boxPrice) {
  const n = Number(boxPrice) || 0;
  return n > 0 ? marbles(n) + ' a square' : 'Points only';
}

const blankish = (v) => String(v == null ? '' : v).trim() === '';

/** The commissioner's live sum while setting a sheet up. Jason: "assume all marbles are
 *  distributed" - the pot is the whole sheet, 100 squares x the cost per square, claimed
 *  or not (src/squares-pool.ts), so every quarter's payout is known before anyone claims:
 *  "Pot 500 marbles · 1st quarter 125 · Halftime 125 · 3rd quarter 125 · Final 125". */
export function potPreview(boxPrice, split) {
  const price = blankish(boxPrice) ? null : cleanBoxPrice(boxPrice);
  if (price == null) return { pot: null, amounts: null, text: 'The cost per square is 0 to ' + marbles(MAX_BOX) + '.' };
  if (price === 0) return { pot: 0, amounts: null, text: 'Points only - no pot.' };
  const pot = price * SQUARES_LIMITS.cells;
  const sp = !Array.isArray(split) || split.some(blankish) ? null : cleanSplit(split.map(Number));
  if (!sp) return { pot, amounts: null, text: 'Pot ' + marbles(pot) + ' · the payouts have to add up to 100%' };
  const amounts = sheetPayouts(pot, sp, []).map((p) => p.amount);
  return { pot, amounts, text: 'Pot ' + marbles(pot) + ' · ' + PERIODS.map((p, i) => p.label + ' ' + amounts[i].toLocaleString('en-US')).join(' · ') };
}

/** The commissioner's two quick splits. */
export const QUICK_SPLITS = [['even', 'Even (25/25/25/25)', DEFAULT_SPLIT], ['final', 'Final pays most (20/20/20/40)', [20, 20, 20, 40]]];

const ROLL_TO = { half: 'halftime', q3: 'the 3rd quarter', final: 'the final' };

/** A priced sheet's payouts, one line per scoring moment (GET /api/squares `payouts`) -
 *  known before a square is claimed, since the pot is the whole sheet: "1st quarter · 25%
 *  · 125 marbles", then once it has passed "... · Ann", "Halftime · 125 marbles · rolled
 *  to the 3rd quarter" or "Final · 375 marbles · nobody’s square". `amount` already
 *  carries what rolled in; how much is the amount less the moment's own share of the
 *  pot - the same sheetPayouts the server uses, with nothing settled. */
export function payoutLines(sq) {
  const list = sq && Array.isArray(sq.payouts) ? sq.payouts : [];
  const own = sheetPayouts(Number(sq && sq.pot) || 0, sq && sq.split, []);
  return list.map((p, i) => {
    const amount = Number(p.amount) || 0;
    const base = own.find((o) => o.key === p.key);
    const carry = Math.max(0, amount - (base ? base.amount : 0));
    const next = list[i + 1];
    let text;
    if (p.rolled) text = p.label + ' · ' + marbles(amount) + ' · rolled to ' + (ROLL_TO[next && next.key] || 'the next quarter');
    else if (p.unclaimed) text = p.label + ' · ' + marbles(amount) + ' · nobody’s square';
    else text = p.label + ' · ' + p.percent + '% · ' + marbles(amount) + (carry ? ' (' + carry.toLocaleString('en-US') + ' rolled in)' : '')
      + (p.settled ? ' · ' + (p.name || 'Someone') : '');
    return { key: p.key, text, settled: !!p.settled, mine: !!p.mine, nobody: !!(p.rolled || p.unclaimed) };
  });
}

/** "You: 15 marbles in · 25 won" - this sheet. */
export function youLine(sq) {
  const won = Math.max(0, Math.floor(Number(sq && sq.marblesWon) || 0));
  return 'You: ' + marbles(Number(sq && sq.marblesIn) || 0) + ' in · ' + won.toLocaleString('en-US') + ' won';
}

/** Where the commissioner's sheet settings start: the sheet as the server has it. A
 *  sheet with no name of its own starts blank, with "Sheet 2" as the placeholder. */
export function draftOf(sq) {
  const card = Number(sq && sq.card) || 1;
  const nm = String((sq && sq.sheetName) || '');
  const split = sq && Array.isArray(sq.split) && sq.split.length === 4 ? sq.split : DEFAULT_SPLIT;
  return { name: nm === 'Sheet ' + card ? '' : nm, boxPrice: String(Number(sq && sq.boxPrice) || 0),
           split: split.map(String), max: Number(sq && sq.maxPerPerson) || SQUARES_LIMITS.maxDefault };
}

export const splitSum = (split) => (split || []).reduce((a, v) => a + (Number(v) || 0), 0);

/** What Save sends: only the fields that changed, and `ok` false while one is not valid.
 *  After the draw (`open` false) only the name can change. */
export function draftChanges(sq, draft, open) {
  const start = draftOf(sq);
  const body = {};
  let ok = true;
  const nm = cleanSheetName(draft.name);
  if (nm !== cleanSheetName(start.name)) body.name = nm;
  if (open) {
    const blank = (v) => String(v == null ? '' : v).trim() === '';
    const price = blank(draft.boxPrice) ? null : cleanBoxPrice(draft.boxPrice);
    if (price == null) ok = false;
    else if (price !== Number(start.boxPrice)) body.boxPrice = price;
    const split = draft.split.some(blank) ? null : cleanSplit(draft.split.map(Number));
    if (!split) ok = false;
    else if (split.some((v, i) => v !== Number(start.split[i]))) body.split = split;
    const max = stepMax(draft.max, 0);
    if (max !== Number(start.max)) body.maxPerPerson = max;
  }
  return { body, ok, changed: Object.keys(body).length > 0 };
}

/** What a Save changed, from the server's answer: "5 marbles a box · Squares per person: 11." */
export function savedText(j) {
  const parts = [];
  if (j && j.sheetName !== undefined) parts.push('Name: ' + j.sheetName);
  if (j && j.boxPrice !== undefined) parts.push(priceLine(j.boxPrice));
  if (j && Array.isArray(j.split)) parts.push('The pot splits ' + j.split.map((v) => v + '%').join(' / '));
  if (j && j.maxPerPerson !== undefined) parts.push('Squares per person: ' + j.maxPerPerson);
  return (parts.join(' · ') || 'Saved') + '.';
}

/** The pinned line. Open: what you hold, what is taken, when it locks. Drawn before
 *  kickoff: closed. From kickoff: Locked and the score - Final once it is. With more
 *  than one sheet it starts with the sheet's name. */
export function summaryLine(d, now, tz) {
  const mine = Number(d && d.myCount) || 0;
  const max = Number(d && d.maxPerPerson) || SQUARES_LIMITS.maxDefault;
  const taken = Number(d && d.taken) || 0;
  const kicked = !(now < Number(d && d.lockAt));
  const locked = (d && d.locked === true) || kicked;
  const pre = d && Array.isArray(d.cards) && d.cards.length > 1 ? sheetName(sheetOf(d)) + ' · ' : '';
  if (!locked) return pre + 'You hold ' + mine + ' of ' + max + ' · ' + taken + ' of 100 taken · ' + lockText(Number(d.lockAt), now, tz);
  if (!kicked) return pre + 'Numbers drawn · closed · You hold ' + mine + ' · ' + taken + ' of 100 taken';
  const st = scoreText(d.game);
  if (st && d.game.status === 'final') return pre + 'Final · ' + st + ' · You hold ' + mine;
  if (st) return pre + 'Locked · ' + st + ' · You hold ' + mine;
  return pre + 'Locked · You hold ' + mine + ' · ' + taken + ' of 100 taken';
}

export const pointsText = (n) => n + (n === 1 ? ' pt' : ' pts');
const lastDigit = (n) => String(((Number(n) % 10) + 10) % 10);

/** Under the grid: every scoring moment - its score, its square and who holds it
 *  once it has passed ("Halftime · NE 0 – SEA 9 · square 09 · Ann · +2", or
 *  "nobody’s square"), what it is worth while it is to come. The square is named by
 *  the two digits that meet: home first, as the rows are. */
export function resultsList(d) {
  const got = new Map(((d && d.results) || []).map((r) => [r.key, r]));
  const g = (d && d.game) || null;
  const h = g && g.home ? g.home.abbrev : 'Home', a = g && g.away ? g.away.abbrev : 'Away';
  return ((d && Array.isArray(d.periods) && d.periods.length ? d.periods : PERIODS)).map((p) => {
    const r = got.get(p.key);
    if (!r) return { key: p.key, label: p.label, points: p.points, done: false, mine: false, nobody: false,
                     text: p.label + ' · ' + pointsText(p.points) + ' · to come' };
    const nobody = r.name == null;
    return {
      key: p.key, label: p.label, points: p.points, done: true, mine: !!r.mine, nobody,
      text: p.label + ' · ' + h + ' ' + r.home + ' – ' + a + ' ' + r.away + ' · square ' + lastDigit(r.home) + lastDigit(r.away)
        + ' · ' + (nobody ? 'nobody’s square' : (r.name || 'Someone') + ' · +' + r.points)
    };
  });
}

/** The commissioner's stepper: a whole number of squares per person, 1 to 100. */
export function stepMax(v, delta) {
  const n = Math.round(Number(v));
  const base = Number.isFinite(n) ? n : SQUARES_LIMITS.maxDefault;
  return Math.min(SQUARES_LIMITS.maxMax, Math.max(1, base + (Number(delta) || 0)));
}

/** A grid to look at before anybody has a group: empty, no draw, the Big Game's
 *  kickoff - the same shape GET /api/squares answers with. */
export function previewGrid(now) {
  return { cells: Array(SQUARES_LIMITS.cells).fill(null), digits: null, game: null, results: [], periods: PERIODS,
           lockAt: BIG_GAME.kickoffUtc, locked: !(now < BIG_GAME.kickoffUtc), myCount: 0, taken: 0,
           maxPerPerson: SQUARES_LIMITS.maxDefault };
}

/** One sentence for a failed call: the server's own words when it sent some. */
export function failText(r, fallback) {
  if (r && r.offline) return 'No connection. Nothing was changed.';
  return (r && r.j && typeof r.j.message === 'string' && r.j.message) || fallback;
}

/** A refusal in this screen's words. The server's sentences say "card"; a person reads
 *  "sheet", so every code whose sentence names a card is said here - the rest are the
 *  server's own. `maxSheets` is GET /api/squares maxCards. */
export function sheetText(r, fallback, maxSheets) {
  const j = (r && !r.offline && r.j) || {};
  const max = Number(j.max);
  const most = Number(maxSheets);
  switch (j.error) {
    case 'drawn': return 'The numbers are drawn - this sheet is closed.';
    case 'locked': return 'The sheets locked at kickoff.';
    case 'already_drawn': return 'This sheet’s numbers are already drawn.';
    case 'limit': return max > 0 ? 'You can hold ' + max + (max === 1 ? ' square' : ' squares') + ' on this sheet.'
      : 'You hold as many squares as this sheet allows.';
    case 'too_many': return most > 0 ? 'A group can run up to ' + most + ' sheets.' : 'This group cannot add another sheet.';
    case 'no_card': return 'That sheet is not in this group.';
    case 'bad_cell': return 'Pick a square on the sheet.';
    default: return failText(r, fallback);
  }
}

/* ------------------------------------------------------------------ *
 * DATA - fetched in previewData and after a tap, never during a draw.
 * ------------------------------------------------------------------ */

const apiFn = () => (typeof window !== 'undefined' && window.agApiFetch) || fetch;

/** One call. Never throws. */
export async function call(api, url, body) {
  const opts = body === undefined ? undefined
    : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
  try {
    const r = await api(url, opts);
    let j = {};
    try { j = (await r.json()) || {}; } catch { /* an empty body is still an answer */ }
    return { ok: r.ok, status: r.status, j };
  } catch { return { ok: false, status: 0, j: {}, offline: true }; }
}

/** Claim a free square, or let one of yours go - the one write a member makes. */
export function cellAction(d, i) {
  const c = d && d.sq && Array.isArray(d.sq.cells) ? d.sq.cells[i] : null;
  return c && c.mine ? { path: '/api/squares/release', release: true } : { path: '/api/squares/claim', release: false };
}

/** The screen's whole state from the Worker. Never throws. */
export async function loadSquares(api, opts) {
  const base = { noSample: true };
  const mine = await myGroups(opts);
  if (!mine || !mine.signedIn) return { ...base, view: 'signed-out' };
  if (mine.error === 'offline') return { ...base, view: 'offline' };
  if (mine.error) return { ...base, view: 'error' };
  let groups = squaresGroupsOf(mine.groups);
  /* Twice at most: a cached list can name a group you have left. */
  for (let attempt = 0; attempt < 2; attempt++) {
    const g = chooseGroup(groups, currentGroupId());
    if (!g) return { ...base, view: 'no-group' };
    setCurrentGroupId(g.id);
    /* The sheet this phone last looked at in the group; one that is gone is sheet 1. */
    const want = savedSheet(g.id);
    let r = await call(api, gridUrl(g.id, want));
    if (r.status === 404 && r.j.error === 'no_card' && want !== 1) r = await call(api, gridUrl(g.id, 1));
    if (r.offline) return { ...base, view: 'offline', groups, groupId: g.id };
    if (r.status === 401) return { ...base, view: 'signed-out' };
    if (r.ok && Array.isArray(r.j.cells)) {
      saveSheet(g.id, Number(r.j.card) || 1);
      return { ...base, view: 'ready', groups, groupId: g.id, sq: r.j, skew: (Number(r.j.now) || Date.now()) - Date.now() };
    }
    if ((r.status === 403 || r.status === 409) && attempt === 0) {
      forgetGroups();
      setCurrentGroupId('');
      const again = await myGroups({ force: true });
      groups = squaresGroupsOf(again && again.groups);
      continue;
    }
    return { ...base, view: 'error', groups, groupId: g.id, message: failText(r, 'The grid did not load.') };
  }
  return { ...base, view: 'error', message: 'The grid did not load.' };
}

export async function previewData(fixtures, state) {
  /* Only `ready` - the route a person reaches - touches the network. Nothing on this
   * screen is sample data, so the shell's banner stays off. */
  if (state && state !== 'ready') return { noSample: true, view: state };
  return loadSquares(apiFn());
}

/* ------------------------------------------------------------------ *
 * RENDER
 * ------------------------------------------------------------------ */

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function btn(cls, text, onClick) {
  const b = el('button', cls, text);
  b.type = 'button';
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

export function render(root, data, state) {
  root.innerHTML = '';
  root.classList.add('scr-squares');
  const style = el('style');
  style.textContent = [STATES_CSS, HEADER_CSS, GROUP_CSS, START_JOIN_CSS].join('\n');
  root.appendChild(style);
  const host = el('div', 'sq');
  root.appendChild(host);
  draw(host, data || {}, state);
}

let SEQ = 0;

/** Load and draw again - after a switch or a sign-in. A slower answer that a newer
 *  one has replaced is dropped. `then` runs on the fresh state (the claim a signed-out
 *  tap was making). */
async function refresh(host, status, loading, then) {
  const seq = ++SEQ;
  if (loading) draw(host, { view: 'loading' }, 'loading');
  const next = await loadSquares(apiFn(), { force: true });
  if (seq !== SEQ || !host.isConnected) return;
  if (status) next.status = status;
  draw(host, next, 'ready');
  if (then) then(next);
}

/** Read a sheet again for the group on screen, keeping the view - after a claim, a
 *  release, a setting, a draw or a new sheet, or to switch to sheet `card`. */
async function reloadGrid(host, d, status, card) {
  const seq = ++SEQ;
  const want = Number(card) || Number(d.sq && d.sq.card) || 1;
  let r = await call(apiFn(), gridUrl(d.groupId, want));
  if (r.status === 404 && r.j.error === 'no_card' && want !== 1) r = await call(apiFn(), gridUrl(d.groupId, 1));
  if (seq !== SEQ || !host.isConnected) return;
  if (r.ok && Array.isArray(r.j.cells)) {
    const was = Number(d.sq && d.sq.card) || 1;
    d.sq = r.j;
    d.skew = (Number(r.j.now) || Date.now()) - Date.now();
    const shown = Number(r.j.card) || 1;
    saveSheet(d.groupId, shown);
    /* Another sheet has its own limit and its own draw. */
    if (shown !== was) { d.draft = null; d.confirmDraw = null; }
  }
  d.status = status || (r.ok ? null : { tone: 'err', text: sheetText(r, 'The sheet did not load.', d.sq && d.sq.maxCards) });
  draw(host, d, 'ready');
}

function draw(host, d, state) {
  host.innerHTML = '';
  const view = d.view || state || 'error';
  const sq = d.sq || null;
  const sub = view === 'ready' && sq
    ? (sq.name || 'Your group') + ' · ' + gameDay(sq.game && sq.game.kickoffUtc ? sq.game.kickoffUtc : sq.lockAt)
    : { 'signed-out': 'The Big Game · ' + gameDay(BIG_GAME.kickoffUtc), 'no-group': 'The Big Game · ' + gameDay(BIG_GAME.kickoffUtc),
        loading: 'Loading the grid…', offline: 'Offline', error: 'Something went wrong' }[view] || '';
  host.appendChild(pageHeader({ title: 'Big Game squares', noTitle: true, sub,
    right: view === 'signed-out' ? signInLink(host) : null }));

  if (view === 'loading') { host.appendChild(stateBlock('loading', { rows: 6, body: 'Loading the grid…' })); return; }
  if (view === 'offline') {
    host.appendChild(stateBlock('offline', { title: 'You are offline', body: 'The grid did not load. Your squares are safe.',
      action: { label: 'Try again', onClick: () => refresh(host, null, true) } }));
    return;
  }
  if (view === 'error') {
    host.appendChild(stateBlock('error', { body: d.message || 'The grid did not load. Your squares are safe.',
      action: { label: 'Try again', onClick: () => refresh(host, null, true) } }));
    return;
  }
  if (view === 'signed-out') { signedOutView(host, d); return; }
  if (view === 'no-group') { poolPreview(host, d, false); return; }
  drawReady(host, d);
}

/* ------------------------------------------------------------ pool first */

/** Signed out: the grid itself, and the first tap asks you to sign in. The one place
 *  the signed-out answer lives - poolPreview draws it. */
function signedOutView(host, d) {
  poolPreview(host, d, true);
}

/** A quiet Sign in in the header, for anybody who wants it before tapping. */
function signInLink(host) {
  const b = btn('sq-signin', 'Sign in', async () => {
    if (typeof window === 'undefined' || typeof window.agOpenSignIn !== 'function') return;
    if (await window.agOpenSignIn()) { forgetGroups(); refresh(host, null, true); }
  });
  return b;
}

/** The grid before a group - signed out, or signed in with no squares group: empty,
 *  "?" digits, "Home team" / "Away team", the lock and the rules, a Start / Join pair.
 *  A tap: signed out, the sign-in sheet and then the claim if a group is there;
 *  signed in, a small inline Start / Join sheet. */
function poolPreview(host, d, signedOut) {
  const now = Date.now();
  const sq = previewGrid(now);
  const bar = el('div', 'sq-total num', lockText(sq.lockAt, now));
  bar.dataset.preview = signedOut ? 'signed-out' : 'no-group';
  host.appendChild(bar);
  host.appendChild(startJoinCard(SQUARES_SPORT, {
    title: 'Play the Big Game grid with friends',
    body: 'Squares are claimed in a group. Start one and invite people, or join with the code someone sent you.'
  }));
  const slot = el('div', 'sq-sheetslot');
  host.appendChild(slot);
  const openSheet = () => {
    if (slot.firstChild) return;
    const s = startJoinSheet(SQUARES_SPORT, { title: 'Claim it in a group',
      body: 'A square is yours once you are in a group. Start one and invite people, or join with a code.',
      onClose: () => { slot.innerHTML = ''; } });
    slot.appendChild(s);
    const first = s.querySelector && s.querySelector('button');
    if (first && first.focus) first.focus();
  };
  if (d.openSheet) openSheet();
  host.appendChild(board(gridModel(sq), { mode: 'preview', onTap: async (i) => {
    const r = await noGroupTap();
    if (r === 'no-group') { openSheet(); return; }
    if (r !== 'signed-in') return;
    forgetGroups();
    /* Signed in now: in a squares group, the claim goes on; in none, the sheet. */
    refresh(host, null, true, (next) => {
      if (next.view === 'ready' && next.sq && !next.sq.locked && !next.sq.cells[i]) tapCell(host, next, i);
      else if (next.view === 'no-group') { next.openSheet = true; draw(host, next, 'ready'); }
    });
  } }));
  host.appendChild(el('p', 'sq-rules', RULES_SHORT));
  host.appendChild(resultsBlock(sq));
}

/* ---------------------------------------------------------------- a group */

function drawReady(host, d) {
  const sq = d.sq;
  const now = () => Date.now() + (Number(d.skew) || 0);
  const locked = sq.locked === true || !(now() < Number(sq.lockAt));
  const isCommish = sq.role === 'commissioner';

  const top = el('div', 'sq-top');
  top.appendChild(groupSwitcher(d.groups || [], d.groupId, () => refresh(host, null, true)));
  const sl = el('a', 'sq-link', 'Standings ›');
  sl.href = '#/gstandings';
  sl.addEventListener('click', () => setCurrentGroupId(d.groupId));
  top.appendChild(sl);
  host.appendChild(top);

  /* The sheets, above everything that belongs to one of them. */
  if (showsSheets(sq)) host.appendChild(sheetSwitcher(host, d));

  const bar = el('div', 'sq-total num', summaryLine(sq, now()));
  bar.dataset.squares = d.groupId;
  if (locked) bar.dataset.locked = 'true';
  host.appendChild(bar);

  /* The server's own sentence for a taken square or the limit - inline, never an alert. */
  const st = el('p', 'sq-status', d.status ? d.status.text : '');
  st.setAttribute('role', 'status');
  if (d.status) st.dataset.tone = d.status.tone;
  host.appendChild(st);

  /* The commissioner's settings: everything before the draw, the name after it. */
  if (isCommish) host.appendChild(commishPanel(host, d, !locked));

  const m = gridModel(sq);
  const kicked = !(now() < Number(sq.lockAt));
  const priced = Number(sq.boxPrice) > 0;
  host.appendChild(board(m, { mode: locked ? 'locked' : 'open', busy: d.busy || {}, onTap: (i) => tapCell(host, d, i),
    sheet: sheetOf(sq) }));
  host.appendChild(el('p', 'sq-rules', !locked
    ? 'Tap an empty square to claim it; tap one of yours to let it go. Yours are filled in. The numbers are drawn at '
      + 'kickoff, or earlier when the commissioner draws this sheet.'
    : kicked
      ? 'The numbers are drawn and the sheet is closed. Each quarter’s square is marked; the square the score is on now is ringed.'
      : 'The numbers are drawn - this sheet is closed. Nobody can claim or give back a square on it.'));
  if (priced) host.appendChild(potBlock(sq));
  host.appendChild(resultsBlock(sq));
  host.appendChild(el('p', 'sq-foot', RULES_FULL + (priced
    ? ' The standings rank by points; the marbles are counted beside them.' : ' Points are the only score.')));
}

/** A tap on the grid before kickoff: claim a free square, release one of yours. The
 *  square fills at once and is put back if the server says no - with its sentence. */
async function tapCell(host, d, i) {
  const sq = d.sq;
  if (!sq || sq.locked) return;
  d.busy = d.busy || {};
  if (d.busy[i]) return;
  const act = cellAction(d, i);
  const before = sq.cells[i];
  let me = '';
  try { me = localStorage.getItem('ag.handle') || ''; } catch { me = ''; }
  d.busy[i] = true;
  if (act.release) { sq.cells[i] = null; sq.myCount = Math.max(0, (Number(sq.myCount) || 0) - 1); sq.taken = Math.max(0, (Number(sq.taken) || 0) - 1); }
  else if (!before) { sq.cells[i] = { name: me, mine: true }; sq.myCount = (Number(sq.myCount) || 0) + 1; sq.taken = (Number(sq.taken) || 0) + 1; }
  d.status = { tone: 'busy', text: 'Saving…' };
  if (host.isConnected) draw(host, d, 'ready');
  const r = await call(apiFn(), act.path, { pool: d.groupId, card: Number(sq.card) || 1, cell: i });
  delete d.busy[i];
  const name = 'Square ' + (Math.floor(i / 10) + 1) + '-' + ((i % 10) + 1);
  if (r.ok) {
    reloadGrid(host, d, { tone: 'ok', text: act.release ? name + ' is open again.' : name + ' is yours.' });
    return;
  }
  /* Put it back as it was, then say why - the server's words. */
  sq.cells[i] = before;
  if (act.release) { sq.myCount = (Number(sq.myCount) || 0) + 1; sq.taken = (Number(sq.taken) || 0) + 1; }
  else if (!before) { sq.myCount = Math.max(0, (Number(sq.myCount) || 0) - 1); sq.taken = Math.max(0, (Number(sq.taken) || 0) - 1); }
  const status = { tone: 'err', text: sheetText(r, 'That square did not go through.', sq.maxCards) };
  /* Taken, drawn or locked: the sheet on screen is out of date, so read it again. */
  if (r.status === 409 && ['taken', 'drawn', 'locked', 'not_yours'].includes(r.j.error)) { reloadGrid(host, d, status); return; }
  d.status = status;
  if (host.isConnected) draw(host, d, 'ready');
}

/* -------------------------------------------------------------- the grid */

/** The board: the away team across the top, the home team down the left, the digits
 *  (or "?") on each side, and the hundred squares. `mode` 'open' and 'preview' take
 *  taps; 'locked' does not. Team color is scoped to this element. */
function board(m, opts) {
  const o = opts || {};
  const wrap = el('section', 'card sq-board');
  wrap.setAttribute('aria-label', 'The grid: ' + m.home.name + ' down the side, ' + m.away.name + ' across the top');
  wrap.dataset.mode = o.mode || 'open';
  wrap.dataset.drawn = String(m.drawn);
  if (m.home.color) wrap.style.setProperty('--team-a', m.home.color);
  if (m.away.color) wrap.style.setProperty('--team-b', m.away.color);

  /* The sheet's own header: its name, then its box price - or "Points only". */
  if (o.sheet) {
    const hd = el('div', 'sq-sheethd');
    hd.appendChild(el('h2', 'sq-sheetname', sheetName(o.sheet)));
    hd.appendChild(el('p', 'sq-sheetmeta num', priceLine(o.sheet.boxPrice)));
    wrap.appendChild(hd);
  }

  const away = el('div', 'sq-axis sq-axis--away', m.away.name);
  wrap.appendChild(away);
  const body = el('div', 'sq-body');
  const home = el('div', 'sq-axis sq-axis--home', m.home.name);
  body.appendChild(home);

  const grid = el('div', 'sq-grid');
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', m.drawn ? 'The squares' : 'The squares - the numbers are not drawn yet');
  grid.appendChild(el('span', 'sq-corner'));
  for (let c = 0; c < 10; c++) {
    const h = el('span', 'sq-hd sq-hd--col num', m.cols[c]);
    h.setAttribute('aria-hidden', 'true');
    grid.appendChild(h);
  }
  const tappable = o.mode === 'open' || o.mode === 'preview';
  /* Before a draw an open square reads as claimable; once drawn, open squares are blank. */
  const plus = tappable && !m.drawn;
  for (let r = 0; r < 10; r++) {
    const h = el('span', 'sq-hd sq-hd--row num', m.rows[r]);
    h.setAttribute('aria-hidden', 'true');
    grid.appendChild(h);
    for (let c = 0; c < 10; c++) {
      const cell = m.cells[r * 10 + c];
      const b = el('button', 'sq-cell');
      b.type = 'button';
      b.dataset.cell = String(cell.i);
      if (plus && !cell.taken) {
        const p = el('span', 'sq-plus', '+');
        p.setAttribute('aria-hidden', 'true');
        b.appendChild(p);
      } else b.appendChild(el('span', 'sq-ini', cell.text));
      if (cell.tag) b.appendChild(el('span', 'sq-tag num', cell.tag));
      if (cell.taken) b.dataset.taken = 'true';
      if (cell.mine) b.dataset.mine = 'true';
      if (cell.wins.length) b.dataset.win = 'true';
      if (cell.current) b.dataset.current = 'true';
      if (o.busy && o.busy[cell.i]) b.dataset.busy = 'true';
      b.setAttribute('aria-label', cellLabel(cell, m));
      if (!tappable) b.disabled = true;
      else b.addEventListener('click', () => { if (o.onTap) o.onTap(cell.i); });
      grid.appendChild(b);
    }
  }
  body.appendChild(grid);
  wrap.appendChild(body);
  return wrap;
}

/** A priced sheet's pot, what each moment pays, and your line - all in marbles. */
function potBlock(sq) {
  const sec = el('section', 'card sq-card sq-pot');
  sec.setAttribute('aria-label', 'The pot');
  sec.appendChild(el('h2', 'sq-h num', 'Pot ' + marbles(sq.pot)));
  const ol = el('ol', 'sq-res sq-pays');
  for (const l of payoutLines(sq)) {
    const li = el('li', 'sq-res-i sq-pay num', l.text);
    li.dataset.key = l.key;
    li.dataset.done = String(l.settled);
    if (l.mine) li.dataset.mine = 'true';
    if (l.nobody) li.dataset.nobody = 'true';
    ol.appendChild(li);
  }
  sec.appendChild(ol);
  sec.appendChild(el('p', 'sq-you num', youLine(sq)));
  return sec;
}

function resultsBlock(sq) {
  const sec = el('section', 'card sq-card sq-results');
  sec.setAttribute('aria-label', 'The quarters');
  sec.appendChild(el('h2', 'sq-h', 'The quarters'));
  const ol = el('ol', 'sq-res');
  for (const r of resultsList(sq)) {
    const li = el('li', 'sq-res-i num', r.text);
    li.dataset.key = r.key;
    li.dataset.done = String(r.done);
    if (r.mine) li.dataset.mine = 'true';
    if (r.nobody) li.dataset.nobody = 'true';
    ol.appendChild(li);
  }
  sec.appendChild(ol);
  return sec;
}

/* ------------------------------------------------------ the commissioner */

const SPLIT_LABEL = { q1: '1st qtr', half: 'Half', q3: '3rd qtr', final: 'Final' };

/** The commissioner's sheet settings. Before the draw (`open`): the sheet's name, its box
 *  price in marbles, how its pot splits over the four moments - four whole percents that
 *  add to 100, the running sum shown - and squares per person, then the draw. After the
 *  draw: the name only. Nothing is sent until Save, and Save sends only what changed. */
function commishPanel(host, d, open) {
  const sq = d.sq;
  const card = Number(sq.card) || 1;
  const panel = el('section', 'card sq-card sq-commish');
  panel.setAttribute('aria-label', 'Commissioner');
  panel.appendChild(el('h2', 'sq-h', showsSheets(sq) ? 'Commissioner · ' + sheetName(sheetOf(sq)) : 'Commissioner'));
  if (!d.draft) d.draft = draftOf(sq);
  const dr = d.draft;
  const err = el('p', 'sq-err');
  err.setAttribute('role', 'alert');
  const save = btn('sq-primary sq-save', 'Save');
  let sum = null, maxIn = null, preview = null;
  const splitIns = [], amountEls = [];
  const paint = () => {
    const c = draftChanges(sq, dr, open);
    save.disabled = !c.changed || !c.ok;
    if (sum) {
      const s = splitSum(dr.split);
      sum.textContent = 'Total ' + s + '%' + (s === 100 ? '' : ' - it has to be 100');
      sum.dataset.tone = s === 100 ? 'ok' : 'err';
    }
    /* The pot and each quarter's payout, live, as the cost or the split changes. */
    if (preview) {
      const pv = potPreview(dr.boxPrice, dr.split);
      preview.textContent = pv.text;
      amountEls.forEach((m, i) => { m.textContent = pv.amounts ? pv.amounts[i].toLocaleString('en-US') : '–'; });
    }
    if (maxIn) maxIn.value = String(dr.max);
  };
  const field = (id, label, input) => {
    const l = el('label', 'sq-label', label);
    l.setAttribute('for', id);
    input.id = id;
    panel.append(l, input);
  };

  const name = el('input', 'sq-in sq-in--text');
  name.type = 'text'; name.maxLength = SHEET_NAME_MAX; name.autocomplete = 'off';
  name.placeholder = 'Sheet ' + card;
  name.value = dr.name;
  name.addEventListener('input', () => { dr.name = name.value; paint(); });
  field('sq-name', 'Sheet name', name);

  if (open) {
    const price = el('input', 'sq-in num');
    price.type = 'number'; price.min = '0'; price.max = String(MAX_BOX); price.step = '1'; price.inputMode = 'numeric';
    price.value = String(dr.boxPrice);
    price.addEventListener('input', () => { dr.boxPrice = price.value; paint(); });
    field('sq-price', 'Cost per square', price);
    panel.appendChild(el('p', 'sq-note', 'In marbles. 0 plays this sheet for points only.'));

    /* "the comish will assist in the cost per square and the payout" - the split, with
       two quick ones, each quarter's marbles under its box, the sum, and the pot. */
    panel.appendChild(el('p', 'sq-label', 'Payouts'));
    const quick = el('div', 'sq-quick');
    for (const [key, label, v] of QUICK_SPLITS) {
      const b = btn('sq-ghost sq-quickb', label, () => {
        v.forEach((x, i) => { dr.split[i] = String(x); if (splitIns[i]) splitIns[i].value = String(x); });
        paint();
      });
      b.dataset.quick = key;
      quick.appendChild(b);
    }
    panel.appendChild(quick);
    const split = el('div', 'sq-split');
    split.setAttribute('role', 'group');
    split.setAttribute('aria-label', 'Payouts, in percent of the pot');
    PERIODS.forEach((p, i) => {
      const cell = el('label', 'sq-split-i');
      cell.appendChild(el('span', 'sq-split-l', SPLIT_LABEL[p.key] || p.label));
      const inp = el('input', 'sq-in num');
      inp.type = 'number'; inp.min = '0'; inp.max = '100'; inp.step = '1'; inp.inputMode = 'numeric';
      inp.value = String(dr.split[i]);
      inp.dataset.split = String(i);
      inp.setAttribute('aria-label', p.label + ', percent of the pot');
      inp.addEventListener('input', () => { dr.split[i] = inp.value; paint(); });
      splitIns.push(inp);
      cell.appendChild(inp);
      const m = el('span', 'sq-split-m num', '');
      m.setAttribute('aria-hidden', 'true');
      amountEls.push(m);
      cell.appendChild(m);
      split.appendChild(cell);
    });
    panel.appendChild(split);
    sum = el('p', 'sq-sum num');
    sum.setAttribute('aria-live', 'polite');
    panel.appendChild(sum);
    preview = el('p', 'sq-preview num');
    preview.setAttribute('aria-live', 'polite');
    panel.appendChild(preview);

    const lab = el('label', 'sq-label', 'Squares per person');
    lab.setAttribute('for', 'sq-max');
    const row = el('div', 'sq-step');
    maxIn = el('input', 'sq-in num');
    maxIn.id = 'sq-max';
    maxIn.type = 'number'; maxIn.min = '1'; maxIn.max = String(SQUARES_LIMITS.maxMax); maxIn.step = '1';
    maxIn.inputMode = 'numeric';
    const minus = btn('sq-stepb', '−', () => { dr.max = stepMax(dr.max, -1); paint(); });
    minus.setAttribute('aria-label', 'One fewer');
    const plus = btn('sq-stepb', '+', () => { dr.max = stepMax(dr.max, 1); paint(); });
    plus.setAttribute('aria-label', 'One more');
    maxIn.addEventListener('change', () => { dr.max = stepMax(maxIn.value, 0); paint(); });
    row.append(minus, maxIn, plus);
    panel.append(lab, row);
    panel.appendChild(el('p', 'sq-note', 'Lowering it takes nobody’s squares away - it stops new claims past it.'));
  }

  save.addEventListener('click', async () => {
    const c = draftChanges(sq, dr, open);
    if (!c.changed || !c.ok) return;
    save.disabled = true; save.textContent = 'Saving…'; err.textContent = '';
    const r = await call(apiFn(), '/api/squares/settings', { pool: d.groupId, card, ...c.body });
    if (r.ok) { d.draft = null; reloadGrid(host, d, { tone: 'ok', text: savedText(r.j) }); return; }
    /* Drawn or locked meanwhile: the sheet on screen is out of date. */
    if (r.status === 409) { d.draft = null; reloadGrid(host, d, { tone: 'err', text: sheetText(r, 'That did not save.') }); return; }
    save.textContent = 'Save';
    paint();
    err.textContent = sheetText(r, 'That did not save.');
  });
  panel.append(save, err);
  panel.appendChild(el('p', 'sq-note', open
    ? 'The price, the split and squares per person can change until this sheet’s numbers are drawn; the name, any time.'
    : 'The numbers are drawn, so only the name can change.'));
  paint();
  if (open) panel.appendChild(drawBlock(host, d));
  return panel;
}

/** "a way to randomize the numbers": draw this sheet's numbers now. Two taps - the
 *  first asks, naming what it does to everyone; the second draws. The server draws
 *  them (src/squares-pool.ts), once. */
function drawBlock(host, d) {
  const sq = d.sq;
  const n = Number(sq.card) || 1;
  const box = el('div', 'sq-draw');
  box.appendChild(el('p', 'sq-label', 'The numbers'));
  if (d.confirmDraw !== n) {
    box.appendChild(el('p', 'sq-note', 'Draw this sheet’s numbers now, or they are drawn at kickoff. '
      + 'They are drawn at random - nobody chooses them.'));
    box.appendChild(btn('sq-ghost sq-draw-start', 'Draw the numbers', () => {
      d.confirmDraw = n;
      d.status = null;
      draw(host, d, 'ready');
      const no = host.querySelector && host.querySelector('.sq-draw-no');
      if (no && no.focus) no.focus();
    }));
    return box;
  }
  const ask = el('div', 'sq-draw-ask');
  const q = el('p', 'sq-confirm', 'Draw ' + sheetName(sheetOf(sq)) + '’s numbers now? The sheet closes - nobody can claim or '
    + 'give back a square after.');
  q.id = 'sq-draw-q';
  ask.appendChild(q);
  const row = el('div', 'sq-draw-row');
  const go = btn('sq-primary sq-draw-go', d.drawing ? 'Drawing…' : 'Draw', () => drawSheet(host, d));
  go.setAttribute('aria-describedby', 'sq-draw-q');
  const no = btn('sq-ghost sq-draw-no', 'Cancel', () => { d.confirmDraw = null; draw(host, d, 'ready'); });
  go.disabled = no.disabled = !!d.drawing;
  row.append(go, no);
  ask.appendChild(row);
  box.appendChild(ask);
  return box;
}

/** The second tap: POST /api/squares/draw, then the sheet again - drawn and closed. */
async function drawSheet(host, d) {
  if (d.drawing) return;
  const n = Number(d.sq.card) || 1;
  const name = sheetName(sheetOf(d.sq));
  d.drawing = true;
  draw(host, d, 'ready');
  const r = await call(apiFn(), '/api/squares/draw', { pool: d.groupId, card: n });
  d.drawing = false;
  d.confirmDraw = null;
  if (r.ok) { reloadGrid(host, d, { tone: 'ok', text: name + '’s numbers are drawn. The sheet is closed.' }); return; }
  const status = { tone: r.j && r.j.error === 'already_drawn' ? 'ok' : 'err', text: sheetText(r, 'The numbers were not drawn.') };
  /* Drawn already, or kickoff came: read the sheet again. */
  if (r.status === 409) { reloadGrid(host, d, status); return; }
  d.status = status;
  if (host.isConnected) draw(host, d, 'ready');
}

/* ------------------------------------------------------------ the sheets */

/** A segmented row of the group's sheets - "Sheet 2 · 3 yours", the one on show
 *  pressed - and, for the commissioner before kickoff, "+ Add a sheet". It scrolls
 *  inside itself; the page never scrolls sideways. */
function sheetSwitcher(host, d) {
  const sq = d.sq;
  const cur = Number(sq.card) || 1;
  const row = el('div', 'sq-sheets');
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', 'Sheets');
  for (const c of sheetsOf(sq)) {
    const n = Number(c.card) || 1;
    const b = btn('sq-sheet', sheetLabel(c), () => { if (n !== cur) switchSheet(host, d, n); });
    b.dataset.sheet = String(n);
    b.setAttribute('aria-pressed', String(n === cur));
    b.setAttribute('aria-label', sheetName(c) + ', ' + (Number(c.mine) || 0) + ' of your squares' + (c.drawn ? ', numbers drawn' : ''));
    if (c.drawn) b.dataset.drawn = 'true';
    row.appendChild(b);
  }
  if (sq.canAddCard) {
    const add = btn('sq-sheet sq-addsheet', d.adding ? 'Adding…' : '+ Add a sheet', () => addSheet(host, d));
    add.disabled = !!d.adding;
    row.appendChild(add);
  }
  /* The one on show stays in view when there are more than fit. */
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      const on = row.querySelector('[aria-pressed="true"]');
      if (on && on.offsetLeft + on.offsetWidth > row.clientWidth) row.scrollLeft = on.offsetLeft - 8;
    });
  }
  return row;
}

function switchSheet(host, d, n) {
  saveSheet(d.groupId, n);
  d.confirmDraw = null;
  d.status = null;
  reloadGrid(host, d, null, n);
}

/** "+ Add a sheet": POST /api/squares/card, then the new sheet. */
async function addSheet(host, d) {
  if (d.adding) return;
  d.adding = true;
  d.status = { tone: 'busy', text: 'Adding a sheet…' };
  draw(host, d, 'ready');
  const r = await call(apiFn(), '/api/squares/card', { pool: d.groupId });
  d.adding = false;
  const n = Number(r.j && r.j.card);
  if (r.ok && n) {
    saveSheet(d.groupId, n);
    reloadGrid(host, d, { tone: 'ok', text: sheetName({ card: n }) + ' is added. Its squares are open.' }, n);
    return;
  }
  const status = { tone: 'err', text: sheetText(r, 'The sheet was not added.', d.sq && d.sq.maxCards) };
  if (r.status === 409) { reloadGrid(host, d, status); return; }
  d.status = status;
  if (host.isConnected) draw(host, d, 'ready');
}
