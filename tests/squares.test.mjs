/* BIG GAME SQUARES - the server half, run for real. Jason, 2026-09-13: "for the super bowl,
 * can we create squares people can pick? that usual thing?", "only the super bowl and we
 * cannot say superbowl, right?", then "do the big game squares next".
 *
 * Real captures (ESPN's NFL scoreboard, read 2026-09-13):
 *   fixtures/feed/espn-nfl-big-game-260208.json  last February's game, final: Seattle 29, New England 13
 *                                                (SEA 3-6-3-17, NE 0-0-0-13)
 *   fixtures/feed/espn-nfl-big-game-270214.json  next February's: event 401873270, Feb 14 23:30Z, TBD at TBD
 *
 * src/squares-pool.ts is driven through its own routes on SQLite (migrations/0012_squares.sql as
 * written) with the clock pinned.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  BIG_GAME, PERIODS, parseBigGame, periodScores, drawDigits, isDraw, cellOf, squaresResults, squaresPoints, cleanMax, cleanCell
} from '../src/lib/squares.ts';
import { handleSquaresPool, squaresStandings, drawDueGrids } from '../src/squares-pool.ts';
import { POOL_SPORTS, hasNoSpread } from '../src/lib/groups.ts';

const feed = (f) => JSON.parse(readFileSync(new URL('../fixtures/feed/' + f, import.meta.url), 'utf8'));
const LAST = feed('espn-nfl-big-game-260208.json');
const NEXT = feed('espn-nfl-big-game-270214.json');
const LX = parseBigGame(LAST, '401772988');
const IDENTITY = { rows: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], cols: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] };

/* ------------------------------------------------------------ pure */

test('a pool sport of its own, no spread, and next February\'s game is the one on the scoreboard', () => {
  assert.ok(POOL_SPORTS.includes('squares'));
  assert.ok(hasNoSpread('squares'));
  const g = parseBigGame(NEXT, BIG_GAME.eventId);
  assert.equal(g.kickoffUtc, BIG_GAME.kickoffUtc, 'Sunday Feb 14, 2027, 6:30 PM ET');
  assert.equal(g.status, 'scheduled');
  assert.equal(g.home, null, 'TBD is no team');
  assert.equal(g.away, null);
  assert.deepEqual(periodScores(g), []);
  assert.equal(parseBigGame(NEXT, '1'), null);
});

test('last February\'s game: the four scoring moments, cumulative, the final from the final score', () => {
  assert.equal(LX.status, 'final');
  assert.equal(LX.home.abbrev, 'NE');
  assert.equal(LX.away.abbrev, 'SEA');
  assert.equal(LX.home.primary, '#002a5c');
  assert.deepEqual(periodScores(LX).map((s) => [s.key, s.home, s.away, s.points]),
    [['q1', 0, 3, 1], ['half', 0, 9, 2], ['q3', 0, 12, 1], ['final', 13, 29, 3]]);
  assert.deepEqual(PERIODS.map((p) => p.points), [1, 2, 1, 3], 'the final is worth the most');
  /* TEST INPUT - the same game stopped in the 3rd quarter, and at halftime. */
  const q3 = { ...LX, status: 'live', statusName: 'STATUS_IN_PROGRESS', period: 3, homeLines: [0, 0, 0], awayLines: [3, 6, 1] };
  assert.deepEqual(periodScores(q3).map((s) => s.key), ['q1', 'half']);
  const ht = { ...LX, status: 'live', statusName: 'STATUS_HALFTIME', period: 2, homeLines: [0, 0], awayLines: [3, 6] };
  assert.deepEqual(periodScores(ht).map((s) => [s.key, s.away]), [['q1', 3], ['half', 9]]);
  const noLines = { ...LX, status: 'live', statusName: 'STATUS_IN_PROGRESS', period: 3, homeLines: [], awayLines: [] };
  assert.deepEqual(periodScores(noLines), [], 'missing lines are left out, never guessed');
});

test('the draw is two permutations of 0-9; a square is where the last digits meet', () => {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const d = drawDigits(rand);
  assert.ok(isDraw(d));
  assert.ok(isDraw(drawDigits()), 'the crypto source');
  assert.equal(isDraw({ rows: [0, 0, 1, 2, 3, 4, 5, 6, 7, 8], cols: IDENTITY.cols }), false);
  assert.equal(cellOf(IDENTITY, 13, 29), 39, 'row: New England 3, column: Seattle 9');
  assert.equal(cellOf({ rows: [9, 8, 7, 6, 5, 4, 3, 2, 1, 0], cols: IDENTITY.cols }, 13, 29), 69);
  const owners = new Map([[39, 'ann'], [3, 'bo']]);
  const r = squaresResults(IDENTITY, owners, LX);
  assert.deepEqual(r.map((x) => [x.key, x.cell, x.userId]), [['q1', 3, 'bo'], ['half', 9, null], ['q3', 2, null], ['final', 39, 'ann']]);
  const pts = squaresPoints(r);
  assert.deepEqual(pts.get('ann'), { points: 3, hits: 1 });
  assert.deepEqual(pts.get('bo'), { points: 1, hits: 1 });
  assert.deepEqual(squaresResults(null, owners, LX), [], 'no draw, no results');
  assert.deepEqual([cleanMax(0), cleanMax(5), cleanMax(101), cleanCell(99), cleanCell(100), cleanCell('7'), cleanCell(1.5)], [null, 5, null, 99, null, 7, null]);
});

/* ------------------------------------------------------------ the routes */

function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE account (id TEXT PRIMARY KEY, email TEXT, handle TEXT, first_name TEXT, last_name TEXT, verified_at INTEGER);
           CREATE TABLE session (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL, device_id TEXT NOT NULL, created_at INTEGER NOT NULL);
           CREATE TABLE pool (id TEXT PRIMARY KEY, name TEXT, sport TEXT NOT NULL DEFAULT 'college-football');
           CREATE TABLE member (pool_id TEXT, user_id TEXT, display_name TEXT, role TEXT, PRIMARY KEY (pool_id, user_id));`);
  db.exec(readFileSync(new URL('../migrations/0012_squares.sql', import.meta.url), 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; }
  });
  return { db, DB: { prepare: (sql) => stmt(sql), batch: async (list) => { for (const s of list) await s.run(); return []; } } };
}

const BEFORE = Date.UTC(2026, 8, 13, 18, 0, 0);
const realNow = Date.now;
const tokens = {};
function setup() {
  Date.now = () => BEFORE;
  const { db, DB } = d1();
  for (const [id, handle] of [['u-com', 'commish'], ['u-mem', 'member'], ['u-out', 'outsider']]) {
    db.prepare('INSERT INTO account (id, email, handle, verified_at) VALUES (?, ?, ?, 1)').run(id, handle + '@example.com', handle);
    const tok = createHash('sha256').update(id).digest('hex');
    tokens[id] = tok;
    db.prepare('INSERT INTO session VALUES (?, ?, ?, 0)').run(createHash('sha256').update(tok).digest('hex'), id, 'd');
  }
  db.exec(`INSERT INTO pool VALUES ('SQRS01', 'Office squares', 'squares'), ('NFLG01', 'Sunday', 'nfl');
           INSERT INTO member VALUES ('SQRS01', 'u-com', 'commish', 'commissioner'), ('SQRS01', 'u-mem', 'member', 'player'),
                                     ('NFLG01', 'u-com', 'commish', 'commissioner');`);
  return { db, env: { DB } };
}
/* Next February's scoreboard as ESPN serves it today; after the game, last February's
   final standing in under next February's event id and kickoff (TEST INPUT). */
const scoreboard = (payload) => async () => new Response(JSON.stringify(payload));
const PLAYED = JSON.parse(JSON.stringify(LAST));
PLAYED.events[0].id = BIG_GAME.eventId;
PLAYED.events[0].date = PLAYED.events[0].competitions[0].date = new Date(BIG_GAME.kickoffUtc).toISOString();

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
async function call(env, who, path, body, fetchImpl = scoreboard(NEXT)) {
  const url = 'https://anygiven.app' + path;
  const init = { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' } };
  if (who) init.headers.authorization = 'Bearer ' + tokens[who];
  if (body) init.body = JSON.stringify(body);
  const res = await handleSquaresPool(new Request(url, init), env, new URL(url).pathname, json, fetchImpl);
  return { status: res.status, body: await res.json() };
}

test('who may play: signed out, an outsider, and a football group are refused', async () => {
  const { env } = setup();
  try {
    assert.equal((await call(env, null, '/api/squares?pool=SQRS01')).body.error, 'email_required');
    assert.equal((await call(env, 'u-out', '/api/squares?pool=SQRS01')).status, 403);
    assert.equal((await call(env, 'u-com', '/api/squares?pool=NFLG01')).status, 409);
  } finally { Date.now = realNow; }
});

test('before kickoff: an empty grid, locked at kickoff, no numbers yet - and never the game\'s name', async () => {
  const { env } = setup();
  try {
    const r = await call(env, 'u-mem', '/api/squares?pool=SQRS01');
    assert.equal(r.status, 200);
    assert.equal(r.body.cells.length, 100);
    assert.ok(r.body.cells.every((c) => c === null));
    assert.equal(r.body.lockAt, BIG_GAME.kickoffUtc);
    assert.equal(r.body.locked, false);
    assert.equal(r.body.digits, null, 'the numbers are drawn at kickoff');
    assert.equal(r.body.maxPerPerson, 10);
    assert.equal(r.body.game.home, null);
    assert.doesNotMatch(JSON.stringify(r.body), /super\s*bowl/i, 'ESPN\'s headline never reaches a phone');
  } finally { Date.now = realNow; }
});

test('claiming: a free square is yours, a taken one is not, the limit holds, and only your own comes back', async () => {
  const { env } = setup();
  try {
    assert.equal((await call(env, 'u-mem', '/api/squares/claim', { pool: 'SQRS01', cell: 5 })).status, 200);
    assert.equal((await call(env, 'u-com', '/api/squares/claim', { pool: 'SQRS01', cell: 5 })).body.error, 'taken');
    assert.equal((await call(env, 'u-mem', '/api/squares/claim', { pool: 'SQRS01', cell: 5 })).body.already, true);
    assert.equal((await call(env, 'u-mem', '/api/squares/claim', { pool: 'SQRS01', cell: 100 })).status, 400);
    assert.equal((await call(env, 'u-mem', '/api/squares/settings', { pool: 'SQRS01', maxPerPerson: 2 })).status, 403, 'commissioner only');
    assert.equal((await call(env, 'u-com', '/api/squares/settings', { pool: 'SQRS01', maxPerPerson: 0 })).status, 400);
    assert.equal((await call(env, 'u-com', '/api/squares/settings', { pool: 'SQRS01', maxPerPerson: 2 })).body.maxPerPerson, 2);
    assert.equal((await call(env, 'u-mem', '/api/squares/claim', { pool: 'SQRS01', cell: 6 })).status, 200);
    const over = await call(env, 'u-mem', '/api/squares/claim', { pool: 'SQRS01', cell: 7 });
    assert.deepEqual([over.status, over.body.error, over.body.max], [409, 'limit', 2]);
    assert.equal((await call(env, 'u-com', '/api/squares/release', { pool: 'SQRS01', cell: 6 })).body.error, 'not_yours');
    assert.equal((await call(env, 'u-mem', '/api/squares/release', { pool: 'SQRS01', cell: 6 })).status, 200);
    const g = await call(env, 'u-mem', '/api/squares?pool=SQRS01');
    assert.deepEqual(g.body.cells[5], { name: 'member', mine: true });
    assert.equal(g.body.cells[6], null);
    assert.equal(g.body.myCount, 1);
    assert.deepEqual((await call(env, 'u-com', '/api/squares?pool=SQRS01')).body.cells[5], { name: 'member', mine: false });
  } finally { Date.now = realNow; }
});

test('at kickoff: the grid locks, the numbers are drawn once, and the results score from ESPN\'s lines', async () => {
  const { db, env } = setup();
  try {
    await call(env, 'u-mem', '/api/squares/claim', { pool: 'SQRS01', cell: 39 });
    await call(env, 'u-com', '/api/squares/claim', { pool: 'SQRS01', cell: 3 });
    Date.now = () => BIG_GAME.kickoffUtc + 1000;
    const a = await call(env, 'u-mem', '/api/squares?pool=SQRS01');
    assert.equal(a.body.locked, true);
    assert.ok(isDraw(a.body.digits), 'drawn at kickoff');
    const b = await call(env, 'u-com', '/api/squares?pool=SQRS01');
    assert.deepEqual(b.body.digits, a.body.digits, 'drawn once - a second look sees the same numbers');
    assert.equal((await call(env, 'u-mem', '/api/squares/claim', { pool: 'SQRS01', cell: 40 })).body.error, 'locked');
    assert.equal((await call(env, 'u-mem', '/api/squares/release', { pool: 'SQRS01', cell: 39 })).body.error, 'locked');
    assert.equal((await call(env, 'u-com', '/api/squares/settings', { pool: 'SQRS01', maxPerPerson: 5 })).body.error, 'locked');

    /* TEST INPUT: a known draw, so the squares that hit are known. */
    db.prepare('UPDATE squares_grid SET rows_digits = ?, cols_digits = ? WHERE pool_id = ?')
      .run(JSON.stringify(IDENTITY.rows), JSON.stringify(IDENTITY.cols), 'SQRS01');
    Date.now = () => BIG_GAME.kickoffUtc + 5 * 3600 * 1000;
    const fin = await call(env, 'u-mem', '/api/squares?pool=SQRS01', null, scoreboard(PLAYED));
    assert.deepEqual(fin.body.results.map((r) => [r.key, r.home, r.away, r.cell, r.name, r.mine]), [
      ['q1', 0, 3, 3, 'commish', false], ['half', 0, 9, 9, null, false], ['q3', 0, 12, 2, null, false], ['final', 13, 29, 39, 'member', true]]);
    assert.equal(fin.body.game.status, 'final');
    assert.equal(fin.body.game.awayScore, 29);
    const rows = await squaresStandings(env, 'SQRS01', Date.now(), scoreboard(PLAYED));
    assert.deepEqual(rows.map((r) => [r.name, r.points, r.hits, r.squares]), [['member', 3, 1, 1], ['commish', 1, 1, 1]]);
    assert.equal(rows[0].wins, 3, 'the football board\'s names carry the points');
  } finally { Date.now = realNow; }
});

test('the cron draws every grid past kickoff, once, even if nobody looks', async () => {
  const { db, env } = setup();
  try {
    await call(env, 'u-com', '/api/squares?pool=SQRS01');     // the grid is made on first sight
    assert.equal(await drawDueGrids(env, BEFORE), 0, 'nothing is due before kickoff');
    assert.equal(await drawDueGrids(env, BIG_GAME.kickoffUtc), 1);
    const first = db.prepare('SELECT rows_digits, cols_digits FROM squares_grid').get();
    assert.ok(isDraw({ rows: JSON.parse(first.rows_digits), cols: JSON.parse(first.cols_digits) }));
    assert.equal(await drawDueGrids(env, BIG_GAME.kickoffUtc + 60000), 0, 'never drawn twice');
    assert.deepEqual(db.prepare('SELECT rows_digits, cols_digits FROM squares_grid').get(), first);
  } finally { Date.now = realNow; }
});
