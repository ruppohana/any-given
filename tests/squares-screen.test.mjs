/* BIG GAME SQUARES, THE SCREENS - public/screens/squares.screen.js, the client half of a
 * 'squares' group, and every other screen that has to know the sport. Jason, 2026-09-13:
 * "do the big game squares next". The app says "the Big Game", never the game's name.
 *
 * 🔴 NOTHING HERE IS A HAND-WRITTEN RESPONSE. Every grid below is what the REAL
 * src/squares-pool.ts answers - run on SQLite through migrations/0012_squares.sql with the
 * clock pinned, exactly as tests/squares.test.mjs runs it - from the REAL ESPN captures:
 *   fixtures/feed/espn-nfl-big-game-270214.json  next February's game, TBD at TBD
 *   fixtures/feed/espn-nfl-big-game-260208.json  last February's final: Seattle 29, New England 13
 * TEST INPUTS, NOT FIXTURES: which groups /api/group/mine lists, and - as the server test
 * does - one known draw, so the squares that hit are known.
 *
 * The screen is loaded with its server-absolute imports re-based onto the real files and
 * drawn into tests/fake-dom.mjs. The layout closed at 393px in real Chrome, not here.
 */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { BIG_GAME, parseBigGame } from '../src/lib/squares.ts';
import { handleSquaresPool } from '../src/squares-pool.ts';
import { POOL_SPORTS, hasNoSpread } from '../src/lib/groups.ts';
import { templatesOpen, PROP_TEMPLATES } from '../src/lib/props.ts';
import { themeMark } from '../public/components/team-chip.js';
import { makeDom, settle } from './fake-dom.mjs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const SRC = read('../public/screens/squares.screen.js');
const CSS = read('../public/screens/squares.css');
const APP = read('../public/app.js');
const TOKENS = read('../public/styles/tokens.css');
const HOME_SRC = read('../public/screens/live-game.screen.js');
const G1_SRC = read('../public/screens/g1-group.screen.js');
const G2_SRC = read('../public/screens/g2-commish.screen.js');
const G3_SRC = read('../public/screens/g3-group-rules.screen.js');
const P5_SRC = read('../public/screens/p5-standings.screen.js');
const P2_SRC = read('../public/screens/p2-slate.screen.js');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const flat = (s) => (code(s).match(/'(?:[^'\\\n]|\\.)*'/g) || []).map((x) => x.slice(1, -1)).join('');

/* ------------------------------------------------------------ the world */

const STORE = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true, writable: true,
  value: {
    getItem: (k) => (STORE.has(k) ? STORE.get(k) : null),
    setItem: (k, v) => { STORE.set(k, String(v)); },
    removeItem: (k) => { STORE.delete(k); },
    clear: () => STORE.clear()
  }
});
const DOM = makeDom();
globalThis.document = DOM.document;
globalThis.window = globalThis;
globalThis.location = { hash: '#/squares' };
/* A message goes inline, on the page - never in an alert(). */
globalThis.alert = () => { throw new Error('alert() was called'); };
let SIGNINS = 0;
let SIGNIN_AS = null;          /* who the sign-in sheet signs in, or null for a closed sheet */
globalThis.agOpenSignIn = async () => {
  SIGNINS++;
  if (!SIGNIN_AS) return false;
  as(SIGNIN_AS.who, SIGNIN_AS.groups);
  return true;
};

const href = (p) => JSON.stringify(new URL(p, import.meta.url).href);
const PATHS = {
  "'/components/states.js'": href('../public/components/states.js'),
  "'/components/header.js'": href('../public/components/header.js'),
  "'/components/group.js'": href('../public/components/group.js'),
  "'/components/start-join.js'": href('../public/components/start-join.js'),
  "'/src/lib/squares.js'": href('../src/lib/squares.ts')
};
let rebased = SRC;
for (const [from, to] of Object.entries(PATHS)) {
  assert.ok(rebased.includes(from), 'the screen no longer imports ' + from);
  rebased = rebased.replace(from, to);
}
const P = await import('data:text/javascript;base64,' + Buffer.from(rebased, 'utf8').toString('base64'));
const GROUP = await import('../public/components/group.js');

/* The server, as tests/squares.test.mjs runs it. */
const feed = (f) => JSON.parse(read('../fixtures/feed/' + f));
const LAST = feed('espn-nfl-big-game-260208.json');
const NEXT = feed('espn-nfl-big-game-270214.json');
/* After the game: last February's final standing in under next February's id and kickoff. */
const PLAYED = JSON.parse(JSON.stringify(LAST));
PLAYED.events[0].id = BIG_GAME.eventId;
PLAYED.events[0].date = PLAYED.events[0].competitions[0].date = new Date(BIG_GAME.kickoffUtc).toISOString();
const PLAYED_GAME = parseBigGame(PLAYED, BIG_GAME.eventId);
const IDENTITY = { rows: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], cols: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] };

function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE account (id TEXT PRIMARY KEY, email TEXT, handle TEXT, first_name TEXT, last_name TEXT, verified_at INTEGER);
           CREATE TABLE session (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL, device_id TEXT NOT NULL, created_at INTEGER NOT NULL);
           CREATE TABLE pool (id TEXT PRIMARY KEY, name TEXT, sport TEXT NOT NULL DEFAULT 'college-football');
           CREATE TABLE member (pool_id TEXT, user_id TEXT, display_name TEXT, role TEXT, PRIMARY KEY (pool_id, user_id));`);
  db.exec(read('../migrations/0012_squares.sql'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; }
  });
  return { db, DB: { prepare: (sql) => stmt(sql), batch: async (list) => { for (const s of list) await s.run(); return []; } } };
}
const BEFORE = Date.UTC(2026, 8, 13, 18, 0, 0);
const KICKOFF = BIG_GAME.kickoffUtc;
const realNow = Date.now;
const tokens = {};
let DB = null, ENV = null, WHO = null, MINE = [], FEED = NEXT, CALLS = [];
function setup() {
  const { db, DB: D } = d1();
  for (const [id, handle] of [['u-com', 'commish'], ['u-mem', 'member'], ['u-out', 'outsider']]) {
    db.prepare('INSERT INTO account (id, email, handle, verified_at) VALUES (?, ?, ?, 1)').run(id, handle + '@example.com', handle);
    const tok = createHash('sha256').update(id).digest('hex');
    tokens[id] = tok;
    db.prepare('INSERT INTO session VALUES (?, ?, ?, 0)').run(createHash('sha256').update(tok).digest('hex'), id, 'd');
  }
  db.exec(`INSERT INTO pool VALUES ('SQRS01', 'Office squares', 'squares'), ('NFLG01', 'Sunday', 'nfl');
           INSERT INTO member VALUES ('SQRS01', 'u-com', 'commish', 'commissioner'), ('SQRS01', 'u-mem', 'member', 'player'),
                                     ('NFLG01', 'u-com', 'commish', 'commissioner'), ('NFLG01', 'u-mem', 'member', 'player');`);
  DB = db; ENV = { DB: D };
}
const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
/** The phone's fetch: /api/group/mine from the test's list, /api/squares* through the real Worker. */
function api(url, opts) {
  const method = (opts && opts.method) || 'GET';
  CALLS.push({ url: String(url), method, body: opts && opts.body ? JSON.parse(opts.body) : undefined });
  const path = String(url).split('?')[0];
  if (path === '/api/group/mine') return Promise.resolve(json({ groups: MINE, kindness: 'k' }));
  const init = { method, headers: { 'content-type': 'application/json' } };
  if (WHO) init.headers.authorization = 'Bearer ' + tokens[WHO];
  if (opts && opts.body) init.body = opts.body;
  return handleSquaresPool(new Request('https://anygiven.app' + url, init), ENV, path, json,
    async () => new Response(JSON.stringify(FEED))).then((r) => r || json({ error: 'not found' }, 404));
}
globalThis.agApiFetch = api;
const posts = () => CALLS.filter((c) => c.method === 'POST').map((c) => [c.url, c.body]);

const G_SQ = { id: 'SQRS01', name: 'Office squares', sport: 'squares', role: 'player' };
const G_SQC = { ...G_SQ, role: 'commissioner' };
const G_NFL = { id: 'NFLG01', name: 'Sunday', sport: 'nfl', role: 'player' };
/** Signed in on this phone as `who`, in `groups`. */
function as(who, groups) {
  WHO = who; MINE = groups;
  STORE.set('ag.session', 't-' + who);
  STORE.set('ag.handle', who === 'u-com' ? 'commish' : 'member');
  GROUP.forgetGroups();
}
function draw(d) { const root = DOM.mount(); P.render(root, d, 'ready'); return root; }
const cells = (root) => root.querySelectorAll('button.sq-cell');
const cell = (root, i) => root.querySelector('button.sq-cell[data-cell="' + i + '"]');
const PT = 'America/Los_Angeles';

beforeEach(() => {
  STORE.clear(); CALLS = []; SIGNINS = 0; SIGNIN_AS = null; WHO = null; MINE = []; FEED = NEXT;
  GROUP.forgetGroups();
  setup();
  Date.now = () => BEFORE;
  location.hash = '#/squares';
});
afterEach(() => { Date.now = realNow; });

/* ------------------------------------------------------------ before kickoff */

test('the grid before kickoff, from the real server: 100 open squares, "?" for every digit, Home team and Away team, locking at kickoff in the phone\'s time', async () => {
  as('u-mem', [G_NFL, G_SQ]);
  const d = await P.loadSquares(api);
  assert.equal(d.view, 'ready');
  assert.deepEqual(d.groups.map((g) => g.id), ['SQRS01'], 'only squares groups in the switcher');
  assert.equal(STORE.get('ag.group'), 'SQRS01', 'made the current group');
  assert.deepEqual(CALLS.map((c) => c.url), ['/api/group/mine', '/api/squares?pool=SQRS01']);
  const m = P.gridModel(d.sq);
  assert.equal(m.cells.length, 100);
  assert.ok(m.cells.every((c) => !c.taken && !c.mine && c.text === '' && c.tag === '' && !c.current));
  assert.deepEqual([m.drawn, m.rows, m.cols], [false, Array(10).fill('?'), Array(10).fill('?')]);
  assert.deepEqual([m.home.name, m.away.name, m.home.color, m.away.color], ['Home team', 'Away team', null, null], 'TBD is no team');
  /* Sunday Feb 14, 2027, 23:30 UTC - 3:30 PM on the west coast, 6:30 PM in the east. */
  assert.equal(P.summaryLine(d.sq, BEFORE, PT), 'You hold 0 of 10 · 0 of 100 taken · Locks Sun, Feb 14 · 3:30 PM');
  assert.equal(P.summaryLine(d.sq, BEFORE, 'America/New_York'), 'You hold 0 of 10 · 0 of 100 taken · Locks Sun, Feb 14 · 6:30 PM');
  assert.equal(P.lockText(KICKOFF, KICKOFF - 3600000, PT), 'Locks Sun 3:30 PM', 'inside the week, the weekday');
  assert.equal(P.lockText(KICKOFF, KICKOFF, PT), 'Locked', 'locked AT kickoff, as the server says');
  assert.equal(P.gameDay(KICKOFF, PT), 'Sun, Feb 14');

  const root = draw(d);
  assert.equal(cells(root).length, 100);
  assert.equal(root.querySelectorAll('.sq-hd').filter((h) => h.textContent === '?').length, 20, 'ten down, ten across');
  assert.deepEqual(root.querySelectorAll('.sq-axis').map((a) => a.textContent), ['Away team', 'Home team']);
  const board = root.querySelector('.sq-board');
  assert.deepEqual([board.style.props['--team-a'], board.style.props['--team-b']], [undefined, undefined],
    'no team color while TBD - the stylesheet\'s neutral');
  assert.equal(root.querySelector('.sq-total').textContent, P.summaryLine(d.sq, BEFORE));
  assert.ok(cells(root).every((b) => !b.disabled), 'every square takes a tap');
  assert.equal(root.querySelector('.sq-commish'), null, 'a member has no commissioner panel');
  assert.deepEqual(root.querySelectorAll('.sq-res-i').map((li) => li.textContent),
    ['1st quarter · 1 pt · to come', 'Halftime · 2 pts · to come', '3rd quarter · 1 pt · to come', 'Final · 3 pts · to come']);
});

test('claims: initials, yours, and the server\'s own words for a taken square and the limit - inline, never an alert', async () => {
  assert.deepEqual(['Ann Lee', 'commish', '@cora', 'a', '', 'ann_lee', null].map(P.initials), ['AL', 'CO', 'CO', 'A', '', 'AL', '']);
  as('u-com', [G_SQC]);
  assert.equal((await P.call(api, '/api/squares/claim', { pool: 'SQRS01', cell: 20 })).ok, true);
  assert.equal((await P.call(api, '/api/squares/settings', { pool: 'SQRS01', maxPerPerson: 2 })).j.maxPerPerson, 2);
  as('u-mem', [G_SQ]);
  const taken = await P.call(api, '/api/squares/claim', { pool: 'SQRS01', cell: 20 });
  assert.equal(P.failText(taken, 'x'), 'Somebody has that square.');
  assert.equal(P.failText({ offline: true }, 'x'), 'No connection. Nothing was changed.');
  await P.call(api, '/api/squares/claim', { pool: 'SQRS01', cell: 5 });
  await P.call(api, '/api/squares/claim', { pool: 'SQRS01', cell: 6 });
  const d = await P.loadSquares(api);
  const m = P.gridModel(d.sq);
  assert.deepEqual([m.cells[5].text, m.cells[5].mine, m.cells[6].mine, m.cells[20].text, m.cells[20].mine],
    ['ME', true, true, 'CO', false]);
  assert.equal(P.cellLabel(m.cells[20], m), 'Row 3, column 1, commish');
  assert.deepEqual(P.cellAction(d, 5), { path: '/api/squares/release', release: true });
  assert.deepEqual(P.cellAction(d, 7), { path: '/api/squares/claim', release: false });

  /* On the screen. Over the limit: the square is put back and the server's sentence shows. */
  const root = draw(d);
  assert.equal(cell(root, 5).dataset.mine, 'true');
  assert.equal(cell(root, 20).dataset.taken, 'true');
  assert.equal(cell(root, 20).querySelector('.sq-ini').textContent, 'CO');
  CALLS = [];
  await cell(root, 7).click(); await settle(60);
  assert.deepEqual(posts(), [['/api/squares/claim', { pool: 'SQRS01', cell: 7 }]]);
  assert.equal(root.querySelector('.sq-status').textContent, 'You can hold 2 squares in this group.');
  assert.equal(root.querySelector('.sq-status').dataset.tone, 'err');
  assert.equal(cell(root, 7).dataset.mine, undefined, 'put back');
  /* A square somebody holds: the server says so, and the grid is read again. */
  CALLS = [];
  await cell(root, 20).click(); await settle(60);
  assert.deepEqual(posts(), [['/api/squares/claim', { pool: 'SQRS01', cell: 20 }]]);
  assert.equal(root.querySelector('.sq-status').textContent, 'Somebody has that square.');
  /* One of yours: released. */
  CALLS = [];
  await cell(root, 6).click(); await settle(60);
  assert.deepEqual(posts(), [['/api/squares/release', { pool: 'SQRS01', cell: 6 }]]);
  assert.equal(root.querySelector('.sq-status').textContent, 'Square 1-7 is open again.');
  assert.equal(cell(root, 6).dataset.mine, undefined);
  /* Now under the limit: claimed. */
  CALLS = [];
  await cell(root, 7).click(); await settle(60);
  assert.deepEqual(posts(), [['/api/squares/claim', { pool: 'SQRS01', cell: 7 }]]);
  assert.equal(root.querySelector('.sq-status').textContent, 'Square 1-8 is yours.');
  assert.equal(cell(root, 7).dataset.mine, 'true');
  assert.equal(root.querySelector('.sq-total').textContent, 'You hold 2 of 2 · 3 of 100 taken · Locks Sun, Feb 14 · '
    + new Date(KICKOFF).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }));
});

/* ------------------------------------------------------------ at kickoff, and after */

test('at kickoff: locked, the digits drawn, no square takes a tap; after the game every moment is marked and the square the score is on is ringed', async () => {
  as('u-mem', [G_SQ]);
  await P.call(api, '/api/squares/claim', { pool: 'SQRS01', cell: 39 });
  as('u-com', [G_SQC]);
  await P.call(api, '/api/squares/claim', { pool: 'SQRS01', cell: 3 });

  Date.now = () => KICKOFF + 1000;
  as('u-mem', [G_SQ]);
  const d = await P.loadSquares(api);
  assert.equal(d.sq.locked, true);
  const m = P.gridModel(d.sq);
  assert.equal(m.drawn, true);
  assert.deepEqual([...m.rows].sort(), ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'], 'the drawn digits, not "?"');
  assert.equal(P.summaryLine(d.sq, Date.now()), 'Locked · You hold 1 · 2 of 100 taken', 'locked, and no score before one exists');
  const root = draw(d);
  assert.ok(cells(root).every((b) => b.disabled), 'no tapping after kickoff');
  CALLS = [];
  await cell(root, 40).click(); await settle(20);
  assert.deepEqual(posts(), []);
  assert.equal(root.querySelectorAll('.sq-hd').filter((h) => h.textContent === '?').length, 0);

  /* TEST INPUT: a known draw, then the final. */
  DB.prepare('UPDATE squares_grid SET rows_digits = ?, cols_digits = ? WHERE pool_id = ?')
    .run(JSON.stringify(IDENTITY.rows), JSON.stringify(IDENTITY.cols), 'SQRS01');
  Date.now = () => KICKOFF + 5 * 3600000;
  FEED = PLAYED;
  const f = await P.loadSquares(api, { force: true });
  const fm = P.gridModel(f.sq);
  assert.deepEqual([fm.home.name, fm.away.name, fm.home.color, fm.away.color],
    [PLAYED_GAME.home.name, PLAYED_GAME.away.name, PLAYED_GAME.home.primary, PLAYED_GAME.away.primary]);
  assert.equal(fm.home.color, '#002a5c');
  assert.deepEqual(fm.cells.filter((c) => c.tag).map((c) => [c.i, c.tag]), [[2, 'Q3+1'], [3, 'Q1+1'], [9, 'HT+2'], [39, 'F+3']]);
  assert.equal(fm.current, 39, 'at the final, the square the score is on is the final\'s');
  assert.equal(P.cellLabel(fm.cells[39], fm), 'NE 3, SEA 9, yours, Final square, 3 points, the score is on it now');
  assert.deepEqual(P.resultsList(f.sq).map((r) => r.text), [
    '1st quarter · NE 0 – SEA 3 · square 03 · commish · +1',
    'Halftime · NE 0 – SEA 9 · square 09 · nobody’s square',
    '3rd quarter · NE 0 – SEA 12 · square 02 · nobody’s square',
    'Final · NE 13 – SEA 29 · square 39 · member · +3']);
  assert.deepEqual(P.resultsList(f.sq).map((r) => [r.done, r.mine, r.nobody]),
    [[true, false, false], [true, false, true], [true, false, true], [true, true, false]]);
  assert.equal(P.summaryLine(f.sq, Date.now()), 'Final · NE 13 – SEA 29 · You hold 1');
  assert.equal(P.scoreText(f.sq.game), 'NE 13 – SEA 29');

  const r2 = draw(f);
  const board = r2.querySelector('.sq-board');
  assert.equal(board.style.props['--team-a'], '#002a5c', 'the home color, on the board element');
  assert.equal(board.style.props['--team-b'], PLAYED_GAME.away.primary);
  assert.deepEqual(r2.querySelectorAll('.sq-cell[data-win="true"]').map((b) => b.dataset.cell), ['2', '3', '9', '39']);
  assert.deepEqual(r2.querySelectorAll('.sq-cell[data-current="true"]').map((b) => b.dataset.cell), ['39']);
  assert.equal(cell(r2, 39).querySelector('.sq-tag').textContent, 'F+3');
  assert.deepEqual(r2.querySelectorAll('.sq-res-i').map((li) => li.textContent), P.resultsList(f.sq).map((r) => r.text));
  assert.equal(r2.querySelector('.sq-total').dataset.locked, 'true');
  assert.deepEqual(r2.querySelectorAll('.sq-axis').map((a) => a.textContent), [PLAYED_GAME.away.name, PLAYED_GAME.home.name]);
});

/* ------------------------------------------------------------ the commissioner */

test('the commissioner, before kickoff: squares per person, 1 to 100, sent only on Save; nobody has it after kickoff', async () => {
  assert.deepEqual([P.stepMax(10, 1), P.stepMax(1, -1), P.stepMax(100, 1), P.stepMax('x', 0), P.stepMax(7.6, 0)], [11, 1, 100, 10, 8]);
  as('u-com', [G_SQC]);
  const d = await P.loadSquares(api);
  const root = draw(d);
  const panel = root.querySelector('.sq-commish');
  assert.ok(panel, 'the commissioner\'s panel');
  const save = panel.querySelector('.sq-save');
  assert.deepEqual([save.textContent, save.disabled], ['Save: 10', true], 'nothing to save yet');
  const [minus, plus] = panel.querySelectorAll('.sq-stepb');
  CALLS = [];
  await plus.click(); await plus.click(); await minus.click();
  assert.deepEqual([save.textContent, save.disabled], ['Save: 11', false]);
  assert.deepEqual(posts(), [], 'the stepper sends nothing by itself');
  await save.click(); await settle(60);
  assert.deepEqual(posts(), [['/api/squares/settings', { pool: 'SQRS01', maxPerPerson: 11 }]]);
  assert.equal(root.querySelector('.sq-status').textContent, 'Squares per person: 11.');
  assert.match(root.querySelector('.sq-total').textContent, /^You hold 0 of 11 · /);

  as('u-mem', [G_SQ]);
  assert.equal(draw(await P.loadSquares(api)).querySelector('.sq-commish'), null, 'a member has none');
  Date.now = () => KICKOFF + 1000;
  as('u-com', [G_SQC]);
  assert.equal(draw(await P.loadSquares(api)).querySelector('.sq-commish'), null, 'and nobody after kickoff');
});

/* ------------------------------------------------------------ pool first */

test('signed out: the grid itself - no sign-in wall - and the first tap on a square opens the sign-in sheet, then the claim goes on', async () => {
  const d = await P.loadSquares(api);
  assert.deepEqual(d, { noSample: true, view: 'signed-out' });
  assert.deepEqual(CALLS, [], 'a signed-out phone asks nothing');
  const root = draw(d);
  assert.equal(cells(root).length, 100);
  assert.equal(root.querySelectorAll('.sq-hd').filter((h) => h.textContent === '?').length, 20);
  assert.deepEqual(root.querySelectorAll('.sq-axis').map((a) => a.textContent), ['Away team', 'Home team']);
  const lock = root.querySelector('.sq-total').textContent;
  assert.equal(lock, P.lockText(KICKOFF, Date.now()));
  assert.match(lock, /^Locks Sun, Feb 1[45] · \d{1,2}:30 [AP]M$/, 'the Big Game\'s day, in the phone\'s own time');
  assert.equal(root.querySelector('.sq-rules').textContent, P.RULES_SHORT);
  assert.deepEqual(root.querySelectorAll('[data-sj]').map((b) => b.dataset.sj), ['start', 'join'], 'the Start / Join pair, on the pool');
  assert.equal(root.querySelector('.sq-signin').textContent, 'Sign in', 'a quiet Sign in in the header');
  assert.ok(!/sign in to/i.test(root.textContent), 'no full-screen sign-in card');

  await cell(root, 42).click(); await settle(20);
  assert.equal(SIGNINS, 1, 'the first tap opens the sign-in sheet');
  assert.deepEqual(CALLS, [], 'a closed sheet claims nothing');

  SIGNIN_AS = { who: 'u-mem', groups: [G_SQ] };
  await cell(root, 42).click(); await settle(120);
  assert.equal(SIGNINS, 2);
  assert.deepEqual(posts(), [['/api/squares/claim', { pool: 'SQRS01', cell: 42 }]], 'signed in, in a squares group: the tap goes on');
  assert.equal(cell(root, 42).dataset.mine, 'true');
});

test('signed in with no squares group: the grid, the Start / Join pair, and the first tap opens a small sheet - never a wall', async () => {
  as('u-mem', [G_NFL]);
  const d = await P.loadSquares(api);
  assert.equal(d.view, 'no-group');
  assert.deepEqual(CALLS.map((c) => c.url), ['/api/group/mine'], 'no grid is asked for with no squares group');
  const root = draw(d);
  assert.equal(cells(root).length, 100);
  assert.equal(root.querySelector('.ag-sj--sheet'), null);
  assert.equal(root.querySelector('.sq-signin'), null, 'already signed in');
  await cell(root, 0).click(); await settle(20);
  assert.equal(SIGNINS, 0, 'no sign-in sheet for somebody signed in');
  const sheet = root.querySelector('.ag-sj--sheet');
  assert.ok(sheet, 'a small inline sheet');
  assert.deepEqual(sheet.querySelectorAll('[data-sj]').map((b) => b.dataset.sj), ['start', 'join', 'close']);
  assert.deepEqual(posts(), [], 'nothing is claimed without a group');
  await sheet.querySelector('[data-sj="close"]').click();
  assert.equal(root.querySelector('.ag-sj--sheet'), null, 'Not now closes it');

  /* Start and Join: the group page, with the form and the sport. */
  await root.querySelector('.ag-sj [data-sj="start"]').click();
  assert.deepEqual([STORE.get('ag.groupForm'), STORE.get('ag.sport'), location.hash], ['start', JSON.stringify('squares'), '#/g']);
  await root.querySelector('.ag-sj [data-sj="join"]').click();
  assert.equal(STORE.get('ag.groupForm'), 'join');
});

test('harness states touch no network and carry no group', async () => {
  for (const s of ['signed-out', 'no-group', 'loading', 'offline', 'error']) {
    assert.deepEqual(await P.previewData({}, s), { noSample: true, view: s });
  }
  assert.deepEqual(CALLS, []);
  for (const s of ['ready', 'signed-out', 'no-group', 'loading', 'offline', 'error']) assert.ok(P.states.includes(s));
  for (const s of ['loading', 'offline', 'error']) assert.ok(draw({ view: s }).querySelector('.state'), s + ' draws its state block');
});

/* ------------------------------------------------------------ Home */

function liftHome(name) {
  const m = new RegExp('\\n((?:async )?function ' + name + '\\(|const ' + name + ' = )').exec(HOME_SRC);
  assert.ok(m, name + ' is declared at the top level of live-game.screen.js');
  const start = m.index + 1;
  const end = HOME_SRC.slice(start).search(/\n(\}|\};|\];)\n/);
  return HOME_SRC.slice(start, HOME_SRC.indexOf('\n', start + end + 1));
}
const HOME_PIECES = ['el', 'store', 'HOME_FAMILIES', 'HOME_MARKS', 'HOME_DATED', 'homeLeaguesAt', 'homeDatedCap', 'homeMarkDark',
  'homeSportDest', 'HOME_SHOW_NAMES', 'HOME_SPORT_SETS', 'isSportSet', 'homeSetCap', 'homeSetList', 'homeSetFamily', 'setTile',
  'homeShowTap', 'homeFamilies', 'homeFamily', 'homeOpenMap', 'homeFamWanted', 'homeAccordion', 'homeFamOpen', 'homeFamToggle',
  'leagueTile', 'soloTile', 'mineMark', 'homeSportTap'];
function loadHome() {
  const loc = { hash: '#/' };
  const deps = { S: {}, document: DOM.document, location: loc, currentGroupId: GROUP.currentGroupId,
    setCurrentGroupId: GROUP.setCurrentGroupId, templatesOpen, PROP_TEMPLATES, themeMark };
  const names = Object.keys(deps);
  const H = new Function(...names, HOME_PIECES.map(liftHome).join('\n\n') + '\nreturn { ' + HOME_PIECES.join(', ') + ' };')(
    ...names.map((n) => deps[n]));
  return { ...H, loc };
}

test('Home: Big Game squares in Football between the NFL and college football - a words tile with the game\'s day - there on Sept 13, gone on Feb 16, 2027', async () => {
  const H = loadHome();
  assert.equal(H.HOME_DATED.squares, BIG_GAME.kickoffUtc, 'Home\'s date is the server\'s kickoff');
  const football = H.HOME_FAMILIES.find((f) => f.h === 'Football');
  assert.deepEqual(football.leagues.map((l) => l[0]), ['nfl', 'squares', 'college-football'], 'the NCAA stays last');
  const SEP13 = Date.UTC(2026, 8, 13, 19), FEB16 = Date.UTC(2027, 1, 16, 12);
  assert.deepEqual(H.homeLeaguesAt(football, SEP13).map((l) => l[0]), ['nfl', 'squares', 'college-football']);
  assert.ok(H.homeLeaguesAt(football, KICKOFF + 20 * 3600000).some((l) => l[0] === 'squares'), 'still there the night of the game');
  assert.deepEqual(H.homeLeaguesAt(football, FEB16).map((l) => l[0]), ['nfl', 'college-football']);

  const fb = H.homeFamilies(SEP13).querySelector('.lg-fam[data-fam="football"]');
  assert.deepEqual(fb.querySelectorAll('.lg-league').map((b) => b.dataset.sport), ['nfl', 'squares', 'college-football']);
  assert.equal(fb.rollRow.className, 'lg-fam-row n3', 'three across');
  const sq = fb.querySelector('.lg-league[data-sport="squares"]');
  assert.equal(sq.querySelector('img'), null, 'a words tile, like Cricket');
  assert.equal(sq.querySelector('.lg-league-n').textContent, 'Big Game squares');
  assert.equal(sq.querySelector('.lg-league-c').textContent, H.homeDatedCap('squares'));
  assert.equal(sq.dataset.label, 'Big Game squares, ' + H.homeDatedCap('squares'));
  if (new Date(KICKOFF).getTimezoneOffset() > 0) assert.equal(H.homeDatedCap('squares'), 'Sun, Feb 14', 'in the Americas, Sunday the 14th');
  assert.equal(fb.querySelectorAll('.lg-fam-mark').length, 2, 'the collapsed header shows the two shields - no mark for the game');

  const gone = H.homeFamilies(FEB16).querySelector('.lg-fam[data-fam="football"]');
  assert.equal(gone.querySelector('.lg-league[data-sport="squares"]'), null, 'gone a day after kickoff');
  assert.equal(gone.rollRow.className, 'lg-fam-row n2');

  /* The tap: the grid - with a group, or without one (pool first). */
  assert.deepEqual(H.homeSportDest('squares', [], ''), { sport: 'squares', groupId: '', hash: '#/squares' });
  assert.deepEqual(H.homeSportDest('squares', [{ id: 'SQ1', sport: 'squares' }], ''), { sport: 'squares', groupId: 'SQ1', hash: '#/squares' });
  await sq.onclick();
  assert.deepEqual([STORE.get('ag.sport'), H.loc.hash], [JSON.stringify('squares'), '#/squares']);
});

/* ------------------------------------------------------------ every screen knows it */

const stripImports = (s) => s.replace(/^import\s[\s\S]*?from\s+'[^']*';$/gm, '').replace(/^import[^;]*;$/gm, '');
const loadStripped = (src) => import('data:text/javascript;base64,' + Buffer.from(stripImports(src), 'utf8').toString('base64'));
const G1 = await loadStripped(G1_SRC);
const G3 = await loadStripped(G3_SRC);
function lift(src, head) {
  const at = src.indexOf('\n' + head);
  assert.ok(at >= 0, head + ' is not declared at the top level');
  const start = at + 1;
  const mm = /\n(\}|\};|\];)\n/.exec(src.slice(start));
  return src.slice(start, start + mm.index + mm[0].length - 1).replace(/^export /, '');
}

test('group create: "Big Game squares" in the Football family, kickoff, no spread and no which-games, the rules - and a new group lands on its grid', () => {
  assert.deepEqual(G1.SPORTS.map((s) => s[0]), [...POOL_SPORTS]);
  assert.deepEqual(G1.SPORTS[POOL_SPORTS.indexOf('squares')], ['squares', 'Big Game squares']);
  assert.deepEqual(G1.SPORT_FAMILIES.find((f) => f[0] === 'Football'), ['Football', ['college-football', 'nfl', 'squares']],
    'in POOL_SPORTS order');
  assert.equal(G1.sportLabel('squares'), 'Big Game squares');
  assert.equal(G1.poolSport('squares'), 'squares');
  assert.equal(G1.hasNoSpread('squares'), hasNoSpread('squares'));
  assert.equal(G1.hasNoSpread('squares'), true);
  assert.equal(G1.isDaySport('squares'), false);
  assert.deepEqual(G1.scopeValues('squares'), []);
  assert.deepEqual(G1.createPayload({ name: 'grid-x', pledged: true, sport: 'squares', ats: true, scope: 'top25' }),
    { name: 'grid-x', sport: 'squares', pledge: true, ats: false }, 'never a spread or a scope');
  assert.equal(G1.lockWord('squares'), 'kickoff');
  assert.equal(G1.sportNote('squares'), 'Claim squares on a 10 × 10 grid until kickoff. At kickoff the numbers 0–9 are drawn '
    + 'at random for each team. At the end of each quarter the square where the last digits of the two scores meet scores '
    + 'points - 1st quarter 1, halftime 2, 3rd quarter 1, final 3 (overtime counts in the final). A square nobody claimed scores nobody.');
  assert.equal(P.RULES_FULL, G1.SQUARES_RULES, 'the grid and group create say the same rules');
  assert.equal(G1.periodLabel('squares', 0), 'One grid, the Big Game');
  assert.equal(G1.picksLine({ sport: 'squares', ats: true }), 'Squares on a 10 × 10 grid, scored in points');
  assert.equal(G1.shareText('grid-x', 'BCD234', 'squares'),
    'Join my group grid-x on Any Given. Claim your squares on the Big Game grid before kickoff, scored in points. Code BCD234');
  const C = code(G1_SRC);
  assert.match(C, /if \(poolSport\(form\.sport\) === 'squares'\) \{ location\.hash = '#\/squares'; return; \}/);
  assert.match(C, /if \(isSquares\(sport\)\) \{\s*rows\.push\(\['The grid'/, 'the group page opens the grid');
  /* Pool first: a pool's Start or Join says which form this page opens - read once, signed in. */
  assert.match(C, /if \(view === 'ready' \|\| view === 'no-group'\) base\.openForm = readGroupForm\(\);/);
  assert.match(C, /else if \(data\.openForm === 'start' \|\| data\.openForm === 'join'\) show\(data\.openForm\);/);
});

test('commissioner, group rules and standings: the label, no spread switch, the rules, and a points board footnoted with the squares that hit', () => {
  const head = G2_SRC.slice(G2_SRC.indexOf('const SPORT_NAMES = {'), G2_SRC.indexOf('/** Which-games choices'));
  const H2 = new Function(head.replace(/^export /gm, '') + '\nreturn { sportName, hasNoSpread, isSquares };')();
  assert.equal(H2.sportName('squares'), 'Big Game squares');
  assert.equal(H2.hasNoSpread('squares'), true);
  assert.match(code(G2_SRC), /if \(!hasNoSpread\(group\.sport\)\) host\.appendChild\(atsSection/);
  assert.match(code(G2_SRC), /if \(isSquares\(sport\)\) nav\.appendChild\(door\('#\/squares', 'The grid'/);

  assert.equal(G3.hasNoSpread('squares'), true);
  assert.equal(G3.isDaySport('squares'), false);
  assert.ok(G3_SRC.includes("squares: 'Big Game squares'"), 'the League row');
  const F3 = flat(G3_SRC);
  assert.ok(F3.includes('Or it plays Big Game squares - one grid of a hundred squares on the Big Game, claimed until kickoff.'));
  assert.ok(F3.includes('The 1st quarter is worth 1 point, halftime 2, the 3rd quarter 1 and the final 3. Overtime counts in the final.'));
  assert.ok(F3.includes('A square nobody claimed scores nobody.'));
  assert.ok(F3.includes('Set how many squares each person may hold, until kickoff.'));
  assert.match(code(G3_SRC), /: isSquares\(sport\) \? 'Points, from the squares that hit'/);

  const S = new Function([lift(P5_SRC, 'const SPORT_LABEL = {'), lift(P5_SRC, 'function groupSport('),
    'function sportLabel(s) { return SPORT_LABEL[groupSport(s)]; }', lift(P5_SRC, 'function boardKind('),
    'return { sportLabel, boardKind, groupSport };'].join('\n'))();
  assert.deepEqual([S.sportLabel('squares'), S.boardKind('squares'), S.groupSport('squares')], ['Big Game squares', 'points', 'squares']);
  assert.ok(flat(P5_SRC).includes('Points from the squares that hit: 1 for the 1st quarter, 2 at halftime, 1 for the 3rd quarter and 3 for '
    + 'the final - overtime counts in the final. A square nobody claimed scores nobody.'));
  assert.match(code(P5_SRC), /if \(sqs\) \{ location\.hash = '#\/squares'; return; \}/, 'an empty board sends you to the grid');
  const squaresText = new Function(lift(P5_SRC, 'function squaresText(') + '\nreturn squaresText;')();
  assert.deepEqual([squaresText({ squares: 3, hits: 1 }), squaresText({ squares: 1, hits: 0 }), squaresText({})],
    ['3 squares · 1 hit', '1 square', 'No squares yet']);
});

test('the slate and the router: a squares group\'s pool is its grid, at #/squares under the group bar', () => {
  assert.ok(P2_SRC.includes("squares: 'Big Game squares'"), 'the slate names it');
  assert.match(code(P2_SRC), /if \(sport === 'squares'\) return \{ \.\.\.base, groups, group, sport, groupState: 'squares', raceHref: '#\/squares' \};/);
  assert.match(code(P2_SRC), /if \(gs === 'f1' \|\| gs === 'nascar' \|\| gs === 'props' \|\| gs === 'squares'\) \{/);
  assert.match(P2_SRC, /squares: \{ title: 'This group plays Big Game squares', [^}]*cta: 'Open the grid', href: '#\/squares' \}/);
  assert.match(APP, /\{ id: 'squares',\s+dest: 'g-pool',\s+nav: 'group', screen: 'squares',\s+state: 'ready',/);
  const betting = (APP.match(/const BETTING_ROUTES = new Set\(\[([^\]]+)\]\)/) || [])[1];
  assert.ok(betting && !betting.includes("'squares'"), 'a pool route, never a betting route');
  assert.match(APP, /squares: 'Big Game squares',/);
});

test('the stylesheet: eleven columns that shrink to the card, team color scoped to the board with a neutral, tokens that exist, no shadows', () => {
  const vars = [...new Set([...CSS.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]))].filter((v) => v !== '--team-a' && v !== '--team-b');
  for (const v of vars) assert.match(TOKENS, new RegExp(v + ':'), v + ' is not a token');
  assert.match(CSS, /\.scr-squares \.sq-grid \{ display: grid; grid-template-columns: 26px repeat\(10, minmax\(0, 1fr\)\);/);
  assert.match(CSS, /\.scr-squares \.sq-board \{ --team-a: var\(--team-null\); --team-b: var\(--team-null\);/);
  assert.doesNotMatch(code(CSS), /:root/, 'never a :root overwrite');
  assert.doesNotMatch(code(SRC), /documentElement|:root/);
  assert.match(SRC, /if \(m\.home\.color\) wrap\.style\.setProperty\('--team-a', m\.home\.color\);/);
  assert.doesNotMatch(code(CSS), /box-shadow/);
  assert.match(CSS, /\.scr-squares \.sq-step \{ display: grid; grid-template-columns: var\(--tap-min\) minmax\(0, 1fr\) var\(--tap-min\);/);
  assert.match(CSS, /\.scr-squares \.sq-in \{[^}]*font-size: 16px;/, '16px, so iOS does not zoom');
});

/* ------------------------------------------------------------ the name */

test('the app never says the NFL\'s trademarked name for the game - no file under public/ does', () => {
  const root = fileURLToPath(new URL('../public/', import.meta.url));
  const TEXT = new Set(['.js', '.mjs', '.css', '.html', '.json', '.webmanifest', '.svg', '.txt', '.md']);
  const hits = [];
  let read = 0;
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (TEXT.has(extname(e.name).toLowerCase())) {
        read++;
        if (/super\s*bowl/i.test(readFileSync(p, 'utf8'))) hits.push(p);
      }
    }
  };
  walk(root);
  assert.ok(read > 50, 'the scan read the public files (' + read + ')');
  assert.deepEqual(hits, []);
});
