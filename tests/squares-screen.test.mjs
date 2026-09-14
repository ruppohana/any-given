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
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { BIG_GAME, parseBigGame, marbles, DEFAULT_SPLIT } from '../src/lib/squares.ts';
import { handleSquaresPool, squaresStandings } from '../src/squares-pool.ts';
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
const P5_CSS = read('../public/screens/p5-standings.css');
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
  db.exec(read('../migrations/0013_squares_cards.sql'));
  db.exec(read('../migrations/0014_squares_money.sql'));
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
/** An input event, as a phone's keyboard sends it. */
const fire = (n, t) => Promise.all((n.listeners[t] || []).map((fn) => fn({ type: t, target: n })));
const typeIn = async (n, v) => { n.value = String(v); await fire(n, 'input'); };
/** Every word a person reads on a render: its text (never the <style>) and its aria-labels. */
function words(root) {
  const style = root.querySelector('style');
  return root.textContent.slice(style ? style.textContent.length : 0) + ' '
    + root.querySelectorAll('*').map((n) => n.getAttribute('aria-label') || '').join(' ');
}

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
  assert.deepEqual(posts(), [['/api/squares/claim', { pool: 'SQRS01', card: 1, cell: 7 }]]);
  assert.equal(root.querySelector('.sq-status').textContent, 'You can hold 2 squares on this sheet.');
  assert.equal(root.querySelector('.sq-status').dataset.tone, 'err');
  assert.equal(cell(root, 7).dataset.mine, undefined, 'put back');
  /* A square somebody holds: the server says so, and the grid is read again. */
  CALLS = [];
  await cell(root, 20).click(); await settle(60);
  assert.deepEqual(posts(), [['/api/squares/claim', { pool: 'SQRS01', card: 1, cell: 20 }]]);
  assert.equal(root.querySelector('.sq-status').textContent, 'Somebody has that square.');
  /* One of yours: released. */
  CALLS = [];
  await cell(root, 6).click(); await settle(60);
  assert.deepEqual(posts(), [['/api/squares/release', { pool: 'SQRS01', card: 1, cell: 6 }]]);
  assert.equal(root.querySelector('.sq-status').textContent, 'Square 1-7 is open again.');
  assert.equal(cell(root, 6).dataset.mine, undefined);
  /* Now under the limit: claimed. */
  CALLS = [];
  await cell(root, 7).click(); await settle(60);
  assert.deepEqual(posts(), [['/api/squares/claim', { pool: 'SQRS01', card: 1, cell: 7 }]]);
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

test('the commissioner, before kickoff: squares per person, 1 to 100, sent only on Save; after kickoff only the name', async () => {
  assert.deepEqual([P.stepMax(10, 1), P.stepMax(1, -1), P.stepMax(100, 1), P.stepMax('x', 0), P.stepMax(7.6, 0)], [11, 1, 100, 10, 8]);
  as('u-com', [G_SQC]);
  const d = await P.loadSquares(api);
  const root = draw(d);
  const panel = root.querySelector('.sq-commish');
  assert.ok(panel, 'the commissioner\'s panel');
  const save = panel.querySelector('.sq-save');
  assert.deepEqual([save.textContent, save.disabled], ['Save', true], 'nothing to save yet');
  const [minus, plus] = panel.querySelectorAll('.sq-stepb');
  CALLS = [];
  await plus.click(); await plus.click(); await minus.click();
  assert.deepEqual([panel.querySelector('[id="sq-max"]').value, save.disabled], ['11', false]);
  assert.deepEqual(posts(), [], 'the stepper sends nothing by itself');
  await save.click(); await settle(60);
  assert.deepEqual(posts(), [['/api/squares/settings', { pool: 'SQRS01', card: 1, maxPerPerson: 11 }]], 'only what changed');
  assert.equal(root.querySelector('.sq-status').textContent, 'Squares per person: 11.');
  assert.match(root.querySelector('.sq-total').textContent, /^You hold 0 of 11 · /);

  as('u-mem', [G_SQ]);
  assert.equal(draw(await P.loadSquares(api)).querySelector('.sq-commish'), null, 'a member has none');
  Date.now = () => KICKOFF + 1000;
  as('u-com', [G_SQC]);
  const late = draw(await P.loadSquares(api)).querySelector('.sq-commish');
  assert.ok(late.querySelector('[id="sq-name"]'), 'after kickoff the name can still change');
  for (const s of ['[id="sq-price"]', '[id="sq-max"]', '[data-split]', '.sq-draw-start']) assert.equal(late.querySelector(s), null, s + ' is gone');
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
  assert.deepEqual(posts(), [['/api/squares/claim', { pool: 'SQRS01', card: 1, cell: 42 }]], 'signed in, in a squares group: the tap goes on');
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

/* ------------------------------------------------------------ sheets */
/* Jason, 2026-09-13: "keep the same size, the person who is on the page has their squares
   highlighted. we will also need to add additional cards to the same pool" - he calls them
   sheets. The API says `card`; a person reads "sheet". */

test('sheets: the commissioner adds one from the switcher and lands on it; each tab counts yours; a claim goes to the sheet on show; the phone remembers the sheet per group', async () => {
  as('u-mem', [G_SQ]);
  await P.call(api, '/api/squares/claim', { pool: 'SQRS01', card: 1, cell: 5 });
  as('u-com', [G_SQC]);
  await P.call(api, '/api/squares/claim', { pool: 'SQRS01', card: 1, cell: 10 });
  await P.call(api, '/api/squares/claim', { pool: 'SQRS01', card: 1, cell: 11 });
  const d = await P.loadSquares(api);
  assert.equal(STORE.get('ag.sqSheet.SQRS01'), '1');
  const root = draw(d);
  const sw = root.querySelector('.sq-sheets');
  assert.ok(sw, 'the commissioner may add one, so the switcher shows with a single sheet');
  assert.deepEqual([sw.getAttribute('role'), sw.getAttribute('aria-label')], ['group', 'Sheets']);
  assert.deepEqual(sw.querySelectorAll('button').map((b) => b.textContent), ['Sheet 1 · 2 yours', '+ Sheet']);
  /* "+ Sheet" is pinned to the row's right end, outside the tabs that scroll. */
  const chip = sw.querySelector('.sq-addsheet');
  assert.deepEqual([chip.getAttribute('aria-label'), chip.parentNode === sw, sw.querySelector('.sq-sheets-tabs .sq-addsheet'),
    sw.children.map((c) => c.className)], ['Add a sheet', true, null, ['sq-sheets-tabs', 'sq-addsheet']]);
  assert.equal(sw.querySelector('[aria-pressed="true"]').dataset.sheet, '1');
  assert.match(root.querySelector('.sq-total').textContent, /^You hold 2 of 10 · 3 of 100 taken · /, 'one sheet: no name in the line');

  CALLS = [];
  await sw.querySelector('.sq-addsheet').click(); await settle(80);
  assert.deepEqual(posts(), [['/api/squares/card', { pool: 'SQRS01' }]]);
  assert.equal(CALLS.at(-1).url, '/api/squares?pool=SQRS01&card=2', 'then the new sheet');
  assert.equal(root.querySelector('.sq-status').textContent, 'Sheet 2 is added. Its squares are open.');
  assert.equal(STORE.get('ag.sqSheet.SQRS01'), '2');
  assert.deepEqual(root.querySelectorAll('.sq-sheet').map((b) => [b.textContent, b.getAttribute('aria-pressed')]),
    [['Sheet 1 · 2 yours', 'false'], ['Sheet 2 · 0 yours', 'true']]);
  assert.equal(root.querySelector('.sq-sheets > .sq-addsheet') || root.querySelector('.sq-addsheet'), root.querySelector('.sq-sheets').children[1],
    'still pinned after the new sheet');
  assert.match(root.querySelector('.sq-total').textContent, /^Sheet 2 · You hold 0 of 10 · 0 of 100 taken · Locks /, 'the line names the sheet');
  assert.equal(root.querySelector('.sq-sheetname').textContent, 'Sheet 2');
  assert.equal(cell(root, 5).dataset.taken, undefined, 'the same square on another sheet is another square');

  CALLS = [];
  await cell(root, 5).click(); await settle(60);
  assert.deepEqual(posts(), [['/api/squares/claim', { pool: 'SQRS01', card: 2, cell: 5 }]]);
  assert.equal(cell(root, 5).dataset.mine, 'true');
  assert.equal(root.querySelector('.sq-sheet[data-sheet="2"]').textContent, 'Sheet 2 · 1 yours');

  /* Back to sheet 1 - the bare route - and remembered. */
  CALLS = [];
  await root.querySelector('.sq-sheet[data-sheet="1"]').click(); await settle(40);
  assert.deepEqual(CALLS.map((c) => c.url), ['/api/squares?pool=SQRS01']);
  assert.equal(STORE.get('ag.sqSheet.SQRS01'), '1');
  assert.deepEqual([cell(root, 5).dataset.taken, cell(root, 5).dataset.mine, cell(root, 10).dataset.mine], ['true', undefined, 'true']);

  /* The next visit opens the sheet looked at last; one that is gone is sheet 1, and forgotten. */
  const gridCalls = () => CALLS.map((c) => c.url).filter((u) => u.startsWith('/api/squares'));
  STORE.set('ag.sqSheet.SQRS01', '2');
  CALLS = [];
  assert.equal((await P.loadSquares(api)).sq.card, 2);
  assert.deepEqual(gridCalls(), ['/api/squares?pool=SQRS01&card=2']);
  STORE.set('ag.sqSheet.SQRS01', '7');
  CALLS = [];
  const gone = await P.loadSquares(api);
  assert.deepEqual(gridCalls(), ['/api/squares?pool=SQRS01&card=7', '/api/squares?pool=SQRS01']);
  assert.deepEqual([gone.view, gone.sq.card, STORE.get('ag.sqSheet.SQRS01')], ['ready', 1, '1']);
  /* Storage that throws: sheet 1, and nothing breaks. */
  const real = globalThis.localStorage;
  globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() {} };
  try {
    assert.equal(P.savedSheet('SQRS01'), 1);
    assert.doesNotThrow(() => P.saveSheet('SQRS01', 2));
  } finally { globalThis.localStorage = real; }

  /* A member: the sheets, and no Add. */
  as('u-mem', [G_SQ]);
  STORE.delete('ag.sqSheet.SQRS01');
  const m = draw(await P.loadSquares(api));
  assert.deepEqual(m.querySelectorAll('.sq-sheet').map((b) => b.textContent), ['Sheet 1 · 1 yours', 'Sheet 2 · 0 yours']);
  assert.equal(m.querySelector('.sq-addsheet'), null, 'only the commissioner adds a sheet');
  assert.doesNotMatch(words(m), /\bcards?\b/i, 'a person reads "sheet", never "card"');
});

test('the draw: two taps - the first names what it does, Cancel sends nothing, Draw closes the sheet and shows its digits; the other sheet stays open; a member never has it', async () => {
  as('u-com', [G_SQC]);
  await P.call(api, '/api/squares/card', { pool: 'SQRS01' });
  await P.call(api, '/api/squares/claim', { pool: 'SQRS01', card: 2, cell: 7 });
  as('u-mem', [G_SQ]);
  await P.call(api, '/api/squares/claim', { pool: 'SQRS01', card: 2, cell: 8 });
  as('u-com', [G_SQC]);
  STORE.set('ag.sqSheet.SQRS01', '2');
  const root = draw(await P.loadSquares(api));
  assert.equal(root.querySelector('.sq-commish').hidden, true, 'the settings start closed');
  /* The main action is never behind them: directly under the grid, the sheet's own name on it. */
  assert.equal(root.querySelector('.sq-commish .sq-draw-start'), null, 'not inside the settings');
  const kids = root.querySelector('.sq').children;
  const at = kids.findIndex((k) => k.classList.contains('sq-board'));
  assert.ok(at > 0 && kids[at + 1].classList.contains('sq-draw'), 'directly under the grid');
  assert.equal(root.querySelector('.sq-draw-start').textContent, 'Draw Sheet 2’s numbers');
  CALLS = [];
  await root.querySelector('.sq-draw-start').click();
  assert.deepEqual(posts(), [], 'the first tap only asks');
  const ask = root.querySelector('.sq-draw-ask');
  assert.equal(ask.querySelector('.sq-confirm').textContent,
    'Draw Sheet 2’s numbers now? The sheet closes - nobody can claim or give back a square after.');
  assert.deepEqual(ask.querySelectorAll('button').map((b) => b.textContent), ['Draw', 'Cancel']);
  assert.equal(root.querySelector('.sq-draw-no').focused, true, 'focus lands on Cancel, not on Draw');
  await root.querySelector('.sq-draw-no').click();
  assert.equal(root.querySelector('.sq-draw-ask'), null, 'Cancel puts it back');
  assert.deepEqual(posts(), []);
  assert.equal(root.querySelector('.sq-board').dataset.drawn, 'false');

  await root.querySelector('.sq-draw-start').click();
  await root.querySelector('.sq-draw-go').click(); await settle(80);
  assert.deepEqual(posts(), [['/api/squares/draw', { pool: 'SQRS01', card: 2 }]]);
  assert.equal(root.querySelector('.sq-status').textContent, 'Sheet 2’s numbers are drawn. The sheet is closed.');
  assert.equal(root.querySelector('.sq-board').dataset.drawn, 'true');
  const hd = root.querySelectorAll('.sq-hd').map((h) => h.textContent);
  assert.deepEqual([...hd.slice(0, 10)].sort(), [...'0123456789'], 'the digits across the top');
  assert.deepEqual([...hd.slice(10)].sort(), [...'0123456789'], 'and down the side');
  assert.ok(cells(root).every((c) => c.disabled), 'closed: no square takes a tap');
  assert.equal(root.querySelectorAll('.sq-plus').length, 0, 'no "+" once drawn');
  assert.equal(root.querySelector('.sq-total').textContent, 'Sheet 2 · Numbers drawn · closed · You hold 1 · 2 of 100 taken');
  assert.equal(root.querySelector('.sq-rules').textContent, 'The numbers are drawn - this sheet is closed. Nobody can claim or give back a square on it.');
  assert.equal(root.querySelector('.sq-sheet[data-sheet="2"]').dataset.drawn, 'true');
  assert.equal(root.querySelector('.sq-draw-start'), null, 'nothing to draw twice');
  CALLS = [];
  await cell(root, 40).click(); await settle(20);
  assert.deepEqual(posts(), []);

  /* Sheet 1 is still open: "+" on every square, and its own draw. */
  await root.querySelector('.sq-sheet[data-sheet="1"]').click(); await settle(40);
  assert.equal(root.querySelector('.sq-board').dataset.drawn, 'false');
  assert.equal(root.querySelector('.sq-draw-start').textContent, 'Draw Sheet 1’s numbers');
  assert.equal(root.querySelectorAll('.sq-plus').length, 100);

  as('u-mem', [G_SQ]);
  assert.equal(draw(await P.loadSquares(api)).querySelector('.sq-draw-start'), null, 'a member never draws');
});

test('the commissioner’s sheet settings sit behind one row under the sheet header - a real button, closed by default, open state remembered per group; a drawn sheet reads "name only" and starts closed', async () => {
  assert.deepEqual([P.settingsLine({ boxPrice: 0 }, true), P.settingsLine({ boxPrice: 5, split: [25, 25, 25, 25] }, true),
    P.settingsLine({ boxPrice: 1 }, true), P.settingsLine({ boxPrice: 5, locked: true })],
    ['Sheet settings · Points only', 'Sheet settings · 5 marbles a square · 25/25/25/25', 'Sheet settings · 1 marble a square · 25/25/25/25',
     'Sheet settings · name only']);
  as('u-com', [G_SQC]);
  const root = draw(await P.loadSquares(api));
  const board = root.querySelector('.sq-board');
  assert.deepEqual(board.children.slice(0, 2).map((c) => c.className), ['sq-sheethd', 'sq-set'], 'under the sheet header, above the grid');
  const row = root.querySelector('.sq-setrow');
  assert.deepEqual([row.tagName, row.type, row.textContent], ['BUTTON', 'button', 'Sheet settings · Points only']);
  assert.deepEqual([row.getAttribute('aria-expanded'), row.getAttribute('aria-controls')], ['false', 'sq-settings']);
  const body = root.querySelector('.sq-commish');
  assert.deepEqual([body.id, body.hidden, body.getAttribute('aria-label')], ['sq-settings', true, 'Sheet settings'], 'closed by default');
  for (const s of ['[id="sq-name"]', '[id="sq-price"]', '[data-split]', '.sq-quickb', '.sq-preview', '[id="sq-max"]', '.sq-save']) {
    assert.ok(body.querySelector(s), s + ' is behind the row');
  }
  assert.deepEqual([body.querySelector('.sq-draw-start'), !!root.querySelector('.sq-draw-start')], [null, true],
    'the draw stays out, visible with the settings closed');
  assert.equal(root.querySelector('.sq-commish .sq-h'), null, 'the row names it; no second heading');
  await row.click();
  assert.deepEqual([row.getAttribute('aria-expanded'), body.hidden, STORE.get('ag.sqSettings.SQRS01')], ['true', false, '1']);

  /* Remembered for the group: the next visit opens it; closing it is remembered too. */
  const again = draw(await P.loadSquares(api));
  assert.deepEqual([again.querySelector('.sq-setrow').getAttribute('aria-expanded'), again.querySelector('.sq-commish').hidden], ['true', false]);
  await again.querySelector('.sq-setrow').click();
  assert.deepEqual([STORE.get('ag.sqSettings.SQRS01'), again.querySelector('.sq-commish').hidden], ['0', true]);
  const real = globalThis.localStorage;
  globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() {} };
  try {
    assert.equal(P.savedSettingsOpen('SQRS01'), false, 'blocked storage: closed');
    assert.doesNotThrow(() => P.saveSettingsOpen('SQRS01', true));
  } finally { globalThis.localStorage = real; }

  /* The row carries the price and split. */
  await P.call(api, '/api/squares/settings', { pool: 'SQRS01', card: 1, boxPrice: 5, split: [20, 20, 20, 40] });
  const dr = draw(await P.loadSquares(api));
  assert.equal(dr.querySelector('.sq-setrow').textContent, 'Sheet settings · 5 marbles a square · 20/20/20/40');
  /* Opened, the draw's first tap redraws the screen - it stays open; the draw closes it. */
  await dr.querySelector('.sq-setrow').click();
  await dr.querySelector('.sq-draw-start').click();
  assert.deepEqual([dr.querySelector('.sq-commish').hidden, !!dr.querySelector('.sq-draw-ask')], [false, true]);
  await dr.querySelector('.sq-draw-go').click(); await settle(80);
  const r2 = dr.querySelector('.sq-setrow');
  assert.deepEqual([r2.textContent, r2.getAttribute('aria-expanded'), dr.querySelector('.sq-commish').hidden],
    ['Sheet settings · name only', 'false', true], 'it does not sit open over a closed sheet');
  assert.ok(dr.querySelector('.sq-commish [id="sq-name"]'));
  assert.equal(dr.querySelector('.sq-commish [id="sq-price"]'), null);
  await r2.click();
  assert.deepEqual([dr.querySelector('.sq-commish').hidden, STORE.get('ag.sqSettings.SQRS01')], [false, '1'],
    'opened on a drawn sheet: the name, and the group’s remembered state untouched');

  as('u-mem', [G_SQ]);
  assert.equal(draw(await P.loadSquares(api)).querySelector('.sq-setrow'), null, 'a member has no settings');
  assert.match(CSS, /\.scr-squares \.sq-setrow\[aria-expanded="true"\] \.sq-chev \{/);
});

test('a sheet drawn behind your back: a Draw or a claim on it says so in the screen’s words, and the sheet is read again - closed', async () => {
  as('u-com', [G_SQC]);
  await P.call(api, '/api/squares/card', { pool: 'SQRS01' });
  STORE.set('ag.sqSheet.SQRS01', '2');
  as('u-mem', [G_SQ]);
  const mem = draw(await P.loadSquares(api));
  as('u-com', [G_SQC]);
  const com = draw(await P.loadSquares(api));
  await com.querySelector('.sq-draw-start').click();
  assert.equal((await P.call(api, '/api/squares/draw', { pool: 'SQRS01', card: 2 })).ok, true, 'drawn from another phone');
  CALLS = [];
  await com.querySelector('.sq-draw-go').click(); await settle(80);
  assert.deepEqual(posts(), [['/api/squares/draw', { pool: 'SQRS01', card: 2 }]]);
  assert.deepEqual([com.querySelector('.sq-status').textContent, com.querySelector('.sq-status').dataset.tone],
    ['This sheet’s numbers are already drawn.', 'ok']);
  assert.equal(com.querySelector('.sq-board').dataset.drawn, 'true');

  as('u-mem', [G_SQ]);
  CALLS = [];
  await cell(mem, 12).click(); await settle(80);
  assert.deepEqual(posts(), [['/api/squares/claim', { pool: 'SQRS01', card: 2, cell: 12 }]]);
  assert.equal(mem.querySelector('.sq-status').textContent, 'The numbers are drawn - this sheet is closed.');
  assert.equal(cell(mem, 12).dataset.mine, undefined, 'put back');
  assert.ok(cells(mem).every((c) => c.disabled), 'read again: closed');
});

test('refusals in the screen’s own words - "sheet", never "card" - for every code whose sentence names one; the rest are the server’s', async () => {
  as('u-com', [G_SQC]);
  await P.call(api, '/api/squares/card', { pool: 'SQRS01' });
  await P.call(api, '/api/squares/settings', { pool: 'SQRS01', card: 2, maxPerPerson: 1 });
  as('u-mem', [G_SQ]);
  await P.call(api, '/api/squares/claim', { pool: 'SQRS01', card: 2, cell: 1 });
  const limit = await P.call(api, '/api/squares/claim', { pool: 'SQRS01', card: 2, cell: 2 });
  const nocard = await P.call(api, '/api/squares?pool=SQRS01&card=3');
  const bad = await P.call(api, '/api/squares/claim', { pool: 'SQRS01', card: 2, cell: 100 });
  as('u-com', [G_SQC]);
  assert.equal((await P.call(api, '/api/squares/draw', { pool: 'SQRS01', card: 2 })).ok, true);
  const twice = await P.call(api, '/api/squares/draw', { pool: 'SQRS01', card: 2 });
  const closed = await P.call(api, '/api/squares/claim', { pool: 'SQRS01', card: 2, cell: 3 });
  for (let i = 3; i <= 10; i++) await P.call(api, '/api/squares/card', { pool: 'SQRS01' });
  const many = await P.call(api, '/api/squares/card', { pool: 'SQRS01' });
  Date.now = () => KICKOFF + 1000;
  const late = await P.call(api, '/api/squares/claim', { pool: 'SQRS01', card: 1, cell: 3 });
  const said = [limit, nocard, bad, twice, closed, many, late].map((r) => [r.j.error, P.sheetText(r, 'x', 10)]);
  assert.deepEqual(said, [
    ['limit', 'You can hold 1 square on this sheet.'],
    ['no_card', 'That sheet is not in this group.'],
    ['bad_cell', 'Pick a square on the sheet.'],
    ['already_drawn', 'This sheet’s numbers are already drawn.'],
    ['drawn', 'The numbers are drawn - this sheet is closed.'],
    ['too_many', 'A group can run up to 10 sheets.'],
    ['locked', 'The sheets locked at kickoff.']]);
  for (const [, t] of said) assert.doesNotMatch(t, /\bcards?\b/i);
  assert.equal(P.sheetText({ ok: false, status: 409, j: { error: 'taken', message: 'Somebody has that square.' } }, 'x'), 'Somebody has that square.');
  assert.equal(P.sheetText({ offline: true }, 'x'), 'No connection. Nothing was changed.');
});

test('yours are filled with the accent, initials in the on-accent color; somebody else’s keep theirs on the quieter surface; "+" only on open squares before the draw; the squares keep their size', async () => {
  as('u-com', [G_SQC]);
  await P.call(api, '/api/squares/claim', { pool: 'SQRS01', cell: 20 });
  as('u-mem', [G_SQ]);
  await P.call(api, '/api/squares/claim', { pool: 'SQRS01', cell: 5 });
  await P.call(api, '/api/squares/claim', { pool: 'SQRS01', cell: 6 });
  const root = draw(await P.loadSquares(api));
  assert.equal(root.querySelector('.sq-sheets'), null, 'one sheet and no Add: no switcher');
  assert.deepEqual(root.querySelectorAll('.sq-cell[data-mine="true"]').map((b) => [b.dataset.cell, b.querySelector('.sq-ini').textContent]),
    [['5', 'ME'], ['6', 'ME']]);
  assert.deepEqual(root.querySelectorAll('.sq-cell[data-taken="true"]').filter((b) => !b.dataset.mine)
    .map((b) => [b.dataset.cell, b.querySelector('.sq-ini').textContent]), [['20', 'CO']]);
  const plus = root.querySelectorAll('.sq-plus');
  assert.equal(plus.length, 97, 'every open square, and only those');
  assert.ok(plus.every((p) => p.textContent === '+' && p.getAttribute('aria-hidden') === 'true' && !p.parentNode.dataset.taken));
  assert.deepEqual([cell(root, 5).querySelector('.sq-plus'), cell(root, 20).querySelector('.sq-plus')], [null, null]);
  assert.equal(root.querySelector('.sq-sheetname').textContent, 'Sheet 1');
  assert.equal(root.querySelector('.sq-sheetmeta').textContent, 'Points only');

  assert.match(CSS, /\.scr-squares \.sq-cell\[data-mine="true"\] \{ border-color: var\(--accent\); background: var\(--accent\); color: var\(--on-accent\); \}/);
  assert.match(CSS, /\.scr-squares \.sq-cell\[data-mine="true"\] \.sq-tag \{ color: var\(--on-accent\); \}/);
  assert.match(CSS, /\.scr-squares \.sq-cell\[data-mine="true"\]\[data-current="true"\] \{ outline-color: var\(--fg\); \}/, 'the ring shows on your own');
  assert.match(CSS, /\.scr-squares \.sq-cell\[data-taken="true"\] \{ background: var\(--surface-2\); \}/);
  assert.match(CSS, /\.scr-squares \.sq-plus \{[^}]*color: var\(--dim\);[^}]*opacity: \.55;/);
  assert.match(CSS, /\.scr-squares \.sq-cell \{[^}]*min-height: 30px;/, 'the squares keep their size');
  assert.doesNotMatch(TOKENS.slice(TOKENS.indexOf('prefers-color-scheme: dark')), /--on-accent:/, 'one on-accent in both themes');
  assert.match(CSS, /\.scr-squares \.sq-sheets-tabs \{[^}]*min-width: 0;[^}]*overflow-x: auto;/, 'the tabs scroll inside themselves');
  assert.match(CSS, /\.scr-squares \.sq-addsheet \{ flex: none;/, 'the add chip never shrinks or scrolls');
  assert.doesNotMatch(CSS.match(/\.scr-squares \.sq-sheets \{[^}]*\}/)[0], /overflow/, 'the row itself does not scroll - only its tabs');

  assert.equal(draw({ view: 'signed-out', noSample: true }).querySelectorAll('.sq-plus').length, 100, 'the pool itself: all open');
  Date.now = () => KICKOFF + 1000;
  const k = draw(await P.loadSquares(api));
  assert.equal(k.querySelectorAll('.sq-plus').length, 0, 'drawn at kickoff: open squares are blank');
  assert.equal(cell(k, 5).dataset.mine, 'true', 'still yours, still filled');
});

test('the summary line per sheet: the sheet’s name leads once there are two; drawn before kickoff it says closed; from kickoff, the score', async () => {
  as('u-com', [G_SQC]);
  const one = (await P.call(api, '/api/squares?pool=SQRS01')).j;
  assert.equal(P.summaryLine(one, BEFORE, PT), 'You hold 0 of 10 · 0 of 100 taken · Locks Sun, Feb 14 · 3:30 PM');
  await P.call(api, '/api/squares/card', { pool: 'SQRS01' });
  await P.call(api, '/api/squares/claim', { pool: 'SQRS01', card: 2, cell: 4 });
  await P.call(api, '/api/squares/settings', { pool: 'SQRS01', card: 2, name: 'The big one' });
  const two = (await P.call(api, '/api/squares?pool=SQRS01&card=2')).j;
  assert.equal(P.summaryLine(two, BEFORE, PT), 'The big one · You hold 1 of 10 · 1 of 100 taken · Locks Sun, Feb 14 · 3:30 PM');
  assert.equal(P.summaryLine((await P.call(api, '/api/squares?pool=SQRS01')).j, BEFORE, PT),
    'Sheet 1 · You hold 0 of 10 · 0 of 100 taken · Locks Sun, Feb 14 · 3:30 PM');
  await P.call(api, '/api/squares/draw', { pool: 'SQRS01', card: 2 });
  assert.equal(P.summaryLine((await P.call(api, '/api/squares?pool=SQRS01&card=2')).j, BEFORE),
    'The big one · Numbers drawn · closed · You hold 1 · 1 of 100 taken');
  Date.now = () => KICKOFF + 5 * 3600000;
  FEED = PLAYED;
  assert.equal(P.summaryLine((await P.call(api, '/api/squares?pool=SQRS01&card=2')).j, Date.now()), 'The big one · Final · NE 13 – SEA 29 · You hold 1');
  assert.deepEqual([P.sheetLabel({ card: 2, mine: 3 }), P.sheetLabel({ card: 3, name: 'Late', mine: 0 }), P.sheetName({ card: 4, name: '  ' })],
    ['Sheet 2 · 3 yours', 'Late · 0 yours', 'Sheet 4']);
  assert.deepEqual([P.gridUrl('SQRS01', 1), P.gridUrl('SQRS01', 3), P.gridUrl('a b', 0)],
    ['/api/squares?pool=SQRS01', '/api/squares?pool=SQRS01&card=3', '/api/squares?pool=a%20b']);
});

/* ------------------------------------------------------------ marbles */
/* Jason: "sometimes we have a $1 box/sheet and maybe a $5 box sheet" - then "call them
   marbles for all i care". A box price is a count of marbles. No "$", no money. */

test('marbles: the commissioner names a sheet and sets its box price, its split (the running sum shown) and squares per person - Save sends only what changed; after the draw, the name only', async () => {
  assert.deepEqual([0, 1, 2, 1000, 1234.9].map(P.priceLine), ['Points only', '1 marble a square', '2 marbles a square', '1,000 marbles a square', '1,234 marbles a square']);
  /* Jason: "the comish will assist in the cost per square and the payout. assume all marbles are
     distributed" - the pot is the whole sheet, so the commissioner sees every quarter's marbles. */
  assert.deepEqual(P.potPreview('5', ['25', '25', '25', '25']),
    { pot: 500, amounts: [125, 125, 125, 125], text: 'Pot 500 marbles · 1st quarter 125 · Halftime 125 · 3rd quarter 125 · Final 125' });
  assert.equal(P.potPreview(3, [33, 33, 33, 1]).text, 'Pot 300 marbles · 1st quarter 99 · Halftime 99 · 3rd quarter 99 · Final 3', 'the final takes what rounding leaves');
  assert.deepEqual([P.potPreview(0, []).text, P.potPreview('', DEFAULT_SPLIT).text, P.potPreview(5, [30, 30, 30, 30]).text],
    ['Points only - no pot.', 'The cost per square is 0 to 1,000 marbles.', 'Pot 500 marbles · the payouts have to add up to 100%']);
  as('u-com', [G_SQC]);
  await P.call(api, '/api/squares/card', { pool: 'SQRS01' });
  const root = draw(await P.loadSquares(api));
  const panel = () => root.querySelector('.sq-commish');
  const q = (s) => panel().querySelector(s);
  assert.deepEqual([q('[id="sq-name"]').value, q('[id="sq-name"]').placeholder, q('[id="sq-price"]').value], ['', 'Sheet 1', '0']);
  assert.deepEqual(panel().querySelectorAll('[data-split]').map((i) => i.value), ['25', '25', '25', '25']);
  assert.equal(q('.sq-sum').textContent, 'Total 100%');
  assert.equal(q('.sq-save').disabled, true, 'nothing to save yet');
  assert.equal(root.querySelector('.sq-pot'), null, 'a points-only sheet has no pot');
  const labels = panel().querySelectorAll('.sq-label').map((l) => l.textContent);
  assert.ok(labels.includes('Cost per square') && labels.includes('Payouts'), 'plain words: ' + labels.join(', '));
  assert.deepEqual(panel().querySelectorAll('.sq-quickb').map((b) => b.textContent), ['Even (25/25/25/25)', 'Final pays most (20/20/20/40)']);
  assert.equal(q('.sq-preview').textContent, 'Points only - no pot.');
  const amounts = () => panel().querySelectorAll('.sq-split-m').map((m) => m.textContent);

  /* Sheet 1: 1 marble a square - the pot and each quarter's marbles, live; the price alone is sent. */
  CALLS = [];
  await typeIn(q('[id="sq-price"]'), 1);
  assert.equal(q('.sq-preview').textContent, 'Pot 100 marbles · 1st quarter 25 · Halftime 25 · 3rd quarter 25 · Final 25');
  assert.deepEqual(amounts(), ['25', '25', '25', '25'], 'each quarter\'s marbles under its box');
  assert.equal(q('.sq-save').disabled, false);
  await q('.sq-save').click(); await settle(80);
  assert.deepEqual(posts(), [['/api/squares/settings', { pool: 'SQRS01', card: 1, boxPrice: 1 }]]);
  assert.equal(root.querySelector('.sq-status').textContent, '1 marble a square.');
  assert.equal(root.querySelector('.sq-sheetmeta').textContent, '1 marble a square');
  assert.ok(root.querySelector('.sq-pot'), 'a priced sheet has its pot');
  assert.equal(root.querySelector('.sq-pot .sq-h').textContent, 'Pot 100 marbles', 'the whole sheet, before a square is claimed');

  /* Sheet 2: a name, 5 marbles, the quick splits, and a split that has to add to 100. */
  await root.querySelector('.sq-sheet[data-sheet="2"]').click(); await settle(40);
  await typeIn(q('[id="sq-name"]'), '  The   big one ');
  await typeIn(q('[id="sq-price"]'), 5);
  assert.equal(q('.sq-preview').textContent, 'Pot 500 marbles · 1st quarter 125 · Halftime 125 · 3rd quarter 125 · Final 125');
  await q('.sq-quickb[data-quick="final"]').click();
  assert.deepEqual(panel().querySelectorAll('[data-split]').map((i) => i.value), ['20', '20', '20', '40']);
  assert.deepEqual([q('.sq-sum').textContent, q('.sq-preview').textContent, amounts()],
    ['Total 100%', 'Pot 500 marbles · 1st quarter 100 · Halftime 100 · 3rd quarter 100 · Final 200', ['100', '100', '100', '200']]);
  const split = panel().querySelectorAll('[data-split]');
  await typeIn(split[0], 40);
  assert.deepEqual([q('.sq-sum').textContent, q('.sq-preview').textContent, amounts(), q('.sq-save').disabled],
    ['Total 120% - it has to be 100', 'Pot 500 marbles · the payouts have to add up to 100%', ['–', '–', '–', '–'], true]);
  await q('.sq-quickb[data-quick="even"]').click();
  assert.deepEqual([panel().querySelectorAll('[data-split]').map((i) => i.value), q('.sq-sum').textContent], [['25', '25', '25', '25'], 'Total 100%']);
  await typeIn(split[0], 40);
  assert.deepEqual([q('.sq-sum').textContent, q('.sq-sum').dataset.tone, q('.sq-save').disabled], ['Total 115% - it has to be 100', 'err', true]);
  await typeIn(split[1], 20); await typeIn(split[2], 20);
  assert.deepEqual([q('.sq-sum').textContent, q('.sq-save').disabled], ['Total 105% - it has to be 100', true]);
  await typeIn(split[3], '');
  assert.equal(q('.sq-save').disabled, true, 'a blank box is not a zero');
  await typeIn(split[3], 20);
  assert.deepEqual([q('.sq-sum').textContent, q('.sq-sum').dataset.tone, q('.sq-save').disabled], ['Total 100%', 'ok', false]);
  CALLS = [];
  await q('.sq-save').click(); await settle(80);
  assert.deepEqual(posts(), [['/api/squares/settings', { pool: 'SQRS01', card: 2, name: 'The big one', boxPrice: 5, split: [40, 20, 20, 20] }]],
    'squares per person did not change, so it is not sent');
  assert.equal(root.querySelector('.sq-status').textContent, 'Name: The big one · 5 marbles a square · The pot splits 40% / 20% / 20% / 20%.');
  assert.deepEqual([root.querySelector('.sq-sheetname').textContent, root.querySelector('.sq-sheetmeta').textContent], ['The big one', '5 marbles a square']);
  assert.equal(q('.sq-preview').textContent, 'Pot 500 marbles · 1st quarter 200 · Halftime 100 · 3rd quarter 100 · Final 100');
  assert.deepEqual(root.querySelectorAll('.sq-sheet').map((b) => b.textContent), ['Sheet 1 · 0 yours', 'The big one · 0 yours']);
  assert.equal(root.querySelector('.sq-setrow').textContent, 'Sheet settings · 5 marbles a square · 40/20/20/20');
  assert.deepEqual(panel().querySelectorAll('[data-split]').map((i) => i.value), ['40', '20', '20', '20'], 'read back from the server');

  /* Out of range or blank cannot be saved; back where it was is nothing to save. */
  await typeIn(q('[id="sq-price"]'), 1001);
  assert.deepEqual([q('.sq-save').disabled, q('.sq-preview').textContent], [true, 'The cost per square is 0 to 1,000 marbles.']);
  await typeIn(q('[id="sq-price"]'), ''); assert.equal(q('.sq-save').disabled, true);
  await typeIn(q('[id="sq-price"]'), 5); assert.equal(q('.sq-save').disabled, true);
  assert.equal(P.sheetText(await P.call(api, '/api/squares/settings', { pool: 'SQRS01', card: 2, boxPrice: -1 }), 'x'), 'A box costs 0 to 1,000 marbles.');

  /* Drawn: the price, the split, the limit and the draw are gone; the name still saves. */
  await root.querySelector('.sq-draw-start').click();
  await root.querySelector('.sq-draw-go').click(); await settle(80);
  for (const s of ['[id="sq-price"]', '[id="sq-max"]', '[data-split]']) assert.equal(q(s), null, s + ' is gone');
  assert.equal(root.querySelector('.sq-draw-start'), null, 'no draw on a drawn sheet');
  CALLS = [];
  await typeIn(q('[id="sq-name"]'), 'Big one, drawn');
  await q('.sq-save').click(); await settle(80);
  assert.deepEqual(posts(), [['/api/squares/settings', { pool: 'SQRS01', card: 2, name: 'Big one, drawn' }]]);
  assert.equal(root.querySelector('.sq-sheetname').textContent, 'Big one, drawn');
  const w = words(root);
  assert.doesNotMatch(w, /\$|money|dollar/i, 'marbles, never money');
  assert.doesNotMatch(w, /\bcards?\b/i);
});

test('the pot is the whole sheet: what each moment pays up front, then a winner, rolled to the next moment, an unclaimed final - and your line; the board sums every sheet and P5 puts In and Won beside the points', async () => {
  as('u-com', [G_SQC]);
  await P.call(api, '/api/squares/card', { pool: 'SQRS01' });
  await P.call(api, '/api/squares/settings', { pool: 'SQRS01', card: 1, boxPrice: 1 });
  await P.call(api, '/api/squares/settings', { pool: 'SQRS01', card: 2, name: 'The big one', boxPrice: 5, split: [40, 20, 20, 20] });
  /* The big one: commish holds 39 (the final) and 40; member 3 (the 1st quarter) and 5 - 9 and 2 are nobody's.
     Sheet 1: commish holds 3; member 5, 6 and 7 - the half, the 3rd quarter and the final land on nobody. */
  await P.call(api, '/api/squares/claim', { pool: 'SQRS01', card: 2, cell: 39 });
  await P.call(api, '/api/squares/claim', { pool: 'SQRS01', card: 2, cell: 40 });
  await P.call(api, '/api/squares/claim', { pool: 'SQRS01', card: 1, cell: 3 });
  as('u-mem', [G_SQ]);
  await P.call(api, '/api/squares/claim', { pool: 'SQRS01', card: 2, cell: 3 });
  await P.call(api, '/api/squares/claim', { pool: 'SQRS01', card: 2, cell: 5 });
  for (const c of [5, 6, 7]) await P.call(api, '/api/squares/claim', { pool: 'SQRS01', card: 1, cell: c });

  STORE.set('ag.sqSheet.SQRS01', '2');
  const pre = await P.loadSquares(api);
  assert.equal(pre.sq.pot, 500, 'a hundred squares at 5, claimed or not - "assume all marbles are distributed"');
  assert.deepEqual(P.payoutLines(pre.sq).map((l) => l.text), ['1st quarter · 40% · 200 marbles',
    'Halftime · 20% · 100 marbles', '3rd quarter · 20% · 100 marbles', 'Final · 20% · 100 marbles']);
  assert.equal(P.youLine(pre.sq), 'You: 10 marbles in · 0 won');

  /* TEST INPUT: a known draw on both sheets, then last February's final. */
  DB.prepare('UPDATE squares_grid SET rows_digits = ?, cols_digits = ? WHERE pool_id = ?')
    .run(JSON.stringify(IDENTITY.rows), JSON.stringify(IDENTITY.cols), 'SQRS01');
  Date.now = () => KICKOFF + 5 * 3600000;
  FEED = PLAYED;
  const f = await P.loadSquares(api, { force: true });
  const lines = P.payoutLines(f.sq).map((l) => l.text);
  assert.deepEqual(lines, ['1st quarter · 40% · 200 marbles · member', 'Halftime · 100 marbles · rolled to the 3rd quarter',
    '3rd quarter · 200 marbles · rolled to the final', 'Final · 20% · 300 marbles (200 rolled in) · commish']);
  assert.equal(P.youLine(f.sq), 'You: 10 marbles in · 200 won');
  const root = draw(f);
  const pot = root.querySelector('.sq-pot');
  assert.equal(pot.querySelector('.sq-h').textContent, 'Pot 500 marbles');
  assert.deepEqual(pot.querySelectorAll('.sq-pay').map((li) => li.textContent), lines);
  assert.deepEqual(pot.querySelectorAll('.sq-pay').map((li) => [li.dataset.mine, li.dataset.nobody]),
    [['true', undefined], [undefined, 'true'], [undefined, 'true'], [undefined, undefined]]);
  assert.equal(pot.querySelector('.sq-you').textContent, 'You: 10 marbles in · 200 won');
  assert.equal(root.querySelector('.sq-foot').textContent, P.RULES_FULL + ' The standings rank by points; the marbles are counted beside them.');
  assert.doesNotMatch(words(root), /\$|money|dollar/i);

  /* Sheet 1, 1 marble a square: a hundred in the pot, and the final on nobody's square. */
  const s1 = (await P.call(api, '/api/squares?pool=SQRS01')).j;
  assert.deepEqual(P.payoutLines(s1).map((l) => l.text), ['1st quarter · 25% · 25 marbles · commish',
    'Halftime · 25 marbles · rolled to the 3rd quarter', '3rd quarter · 50 marbles · rolled to the final', 'Final · 75 marbles · nobody’s square']);
  assert.equal(P.youLine(s1), 'You: 3 marbles in · 0 won');

  /* The board, summed over both sheets by the real server - and P5's reading of it. */
  const rows = await squaresStandings(ENV, 'SQRS01', Date.now(), async () => new Response(JSON.stringify(PLAYED)));
  assert.deepEqual(rows.map((r) => [r.name, r.points, r.marblesIn, r.marblesWon]), [['commish', 4, 11, 325], ['member', 1, 13, 200]]);
  const S = new Function([lift(P5_SRC, 'function safeName('), lift(P5_SRC, 'function shapeF1Rows('),
    lift(P5_SRC, 'function squaresUnits('), lift(P5_SRC, 'function squaresAddPot('), lift(P5_SRC, 'function squaresHasPot('),
    'return { shapeF1Rows, squaresUnits, squaresAddPot, squaresHasPot };'].join('\n'))();
  assert.match(code(P5_SRC), /if \(sport === 'squares'\) squaresAddPot\(rows, ss\.rows \|\| \[\]\);/, 'the squares board, and only it');
  const shaped = S.squaresAddPot(S.shapeF1Rows(rows, 'member', 'commish'), rows);
  assert.deepEqual(shaped.map((r) => [r.displayName, r.rank, r.points, r.potIn, r.potWon]),
    [['commish', 1, 4, 11, 325], ['member', 2, 1, 13, 200]]);
  assert.equal(S.squaresHasPot(shaped), true);
  assert.equal(S.squaresHasPot(shaped.map((r) => ({ ...r, potIn: 0 }))), false, 'a points-only board keeps its one column');
  for (const n of [0, 1, 2, 999, 1000, 12345, 2.7, -3, 'x']) assert.equal(S.squaresUnits(n), marbles(n), 'P5 mirrors src/lib/squares.ts marbles(' + n + ')');
  const C5 = code(P5_SRC);
  assert.match(C5, /if \(mb\) head\.append\(el\('span', 'p5-col', 'In'\), el\('span', 'p5-col', 'Won'\)\);/);
  assert.match(C5, /\(mb \? ' p5-table--pot' : ''\)/);
  assert.match(C5, /el\('span', 'p5-num num p5-pot', String\(r\.potIn\)\), el\('span', 'p5-num num p5-pot', String\(r\.potWon\)\), s\);/);
  assert.match(P5_CSS, /\.scr-p5-standings \.p5-table--pot \.p5-row \{ grid-template-columns: 26px 24px 22px minmax\(0, 1fr\) 40px 44px 52px; \}/);
  assert.ok(flat(P5_SRC).includes(' In and Won count marbles, summed over every sheet.'));
  assert.doesNotMatch(flat(P5_SRC), /\$\s?\d|dollar/i);
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

test('Home: Big Game squares in Football between the NFL and college football - our own drawn mark with the game\'s day under it - there on Sept 13, gone on Feb 16, 2027', async () => {
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
  /* Jason, 2026-09-13: "do the big game squares on the home tile next" - our own drawn
     mark (a squares grid with one square lit), never the NFL's or the game's. */
  assert.equal(H.HOME_MARKS.squares, '/logos/leagues/squares-500.svg');
  for (const f of ['squares-500.svg', 'squares-500-dark.svg']) {
    assert.ok(existsSync(new URL('../public/logos/leagues/' + f, import.meta.url)), f + ' is on disk');
  }
  assert.ok(sq.querySelector('img.lg-league-logo'), 'the tile carries the mark');
  assert.equal(sq.querySelector('.lg-league-n'), null, 'the mark stands for the name');
  assert.equal(sq.querySelector('.lg-league-c').textContent, H.homeDatedCap('squares'), 'the day under it, like the NCAA Men / Women captions');
  assert.equal(sq.dataset.label, 'Big Game squares, ' + H.homeDatedCap('squares'));
  if (new Date(KICKOFF).getTimezoneOffset() > 0) assert.equal(H.homeDatedCap('squares'), 'Sun, Feb 14', 'in the Americas, Sunday the 14th');
  assert.equal(fb.querySelectorAll('.lg-fam-mark').length, 3, 'the collapsed header shows the two shields and the grid');

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
  assert.equal(G1.sportNote('squares'), 'Claim squares on a 10 × 10 sheet until its numbers are drawn - at kickoff, or '
    + 'earlier when the commissioner draws a sheet. The numbers 0–9 are drawn at random for each team, and a drawn sheet is '
    + 'closed. A group can run more than one sheet, and your points add up across them. At the end of each quarter the '
    + 'square where the last digits of the two scores meet scores points - 1st quarter 1, halftime 2, 3rd quarter 1, final 3 '
    + '(overtime counts in the final). A square nobody claimed scores nobody.');
  assert.equal(P.RULES_FULL, G1.SQUARES_RULES, 'the grid and group create say the same rules');
  assert.ok(P.RULES_SHORT.includes('at kickoff, or earlier when the commissioner draws a sheet') && P.RULES_SHORT.includes('a drawn sheet is closed'));
  assert.equal(G1.periodLabel('squares', 0), 'A 10 × 10 sheet on the Big Game - or several');
  assert.equal(G1.picksLine({ sport: 'squares', ats: true }), 'Squares on 10 × 10 sheets, scored in points');
  assert.equal(G1.shareText('grid-x', 'BCD234', 'squares'),
    'Join my group grid-x on Any Given. Claim your squares on the Big Game sheets before the numbers are drawn, scored in points. Code BCD234');
  assert.ok(flat(G1_SRC).includes('Set up each sheet, and claim squares before the numbers are drawn.')
    && flat(G1_SRC).includes('Claim squares before the numbers are drawn.'), 'the group page row, commissioner and member');
  assert.ok(flat(P2_SRC).includes('A 10 × 10 sheet on the Big Game - or several. Claim squares until the numbers are drawn;'));
  for (const s of [G1_SRC, G2_SRC, P2_SRC]) assert.doesNotMatch(flat(s), /One grid|One 10 × 10 grid|Big Game grid before kickoff|claim yours before kickoff/);
  const C = code(G1_SRC);
  assert.match(C, /if \(poolSport\(form\.sport\) === 'squares'\) \{ location\.hash = '#\/squares'; return; \}/);
  assert.match(C, /if \(isSquares\(sport\)\) \{\s*rows\.push\(\['The sheets'/, 'the group page opens the sheets');
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
  assert.match(code(G2_SRC), /if \(isSquares\(sport\)\) nav\.appendChild\(door\('#\/squares', 'The sheets'/);
  for (const s of [G1_SRC, G2_SRC]) assert.ok(!flat(s).includes('The grid'), 'the label is "The sheets"');
  assert.ok(flat(G2_SRC).includes('Add sheets, set each one up and draw its numbers, and see who holds what.'));

  assert.equal(G3.hasNoSpread('squares'), true);
  assert.equal(G3.isDaySport('squares'), false);
  assert.ok(G3_SRC.includes("squares: 'Big Game squares'"), 'the League row');
  const F3 = flat(G3_SRC);
  assert.ok(F3.includes('Or it plays Big Game squares - sheets of a hundred squares on the Big Game, each claimed until its numbers are drawn.'));
  assert.ok(F3.includes('The 1st quarter is worth 1 point, halftime 2, the 3rd quarter 1 and the final 3. Overtime counts in the final.'));
  assert.ok(F3.includes('A square nobody claimed scores nobody.'));
  assert.ok(F3.includes('Claim squares until a sheet’s numbers are drawn - at kickoff, or earlier when the commissioner draws it.'));
  assert.ok(F3.includes('A drawn sheet is closed - nobody can claim or give back a square on it.'));
  assert.ok(F3.includes('Add sheets until kickoff, and draw a sheet’s numbers early. Before a sheet is drawn, set how many '
    + 'squares each person may hold on it; name it any time.'));
  assert.ok(G3.SQUARES_RULES.includes('until its numbers are drawn: at kickoff, or earlier when the commissioner draws a sheet'));
  assert.doesNotMatch(F3, /\$|dollar|money/i);
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
