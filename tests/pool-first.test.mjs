/* POOL FIRST - the screens somebody in no group of a sport lands on.
 *
 * Jason, 2026-09-13, chose "Pool first": a tap on a pool from Home, signed in or
 * out, in no group of that sport, lands on the pool itself - its games and one
 * card with Start a group / Join a group - never a sign-in wall or the group
 * page's form. The first pick asks: signed out, the sign-in sheet; signed in,
 * a small inline sheet with the same two. Never a full-screen wall.
 *
 * Four screens, driven here through render() and real taps:
 *   p2 browse (#/pool) on an NBA day   - the day's games, no pick sent or kept
 *   p2 public slate (#/slate), the NFL  - the pair on top, picks exactly as before
 *   f1-picks (#/f1)                     - the weekend on this phone, the pair, the sheet
 *   nascar-picks (#/nascar, ...)        - race day, the same
 *
 * 🔴 WHAT IS REAL. The games are the captured ESPN days read with the shipping
 * parsers - fixtures/feed/espn-nba-scoreboard-261021.json (opening night, all
 * scheduled) and espn-nfl-scoreboard-260908.json through src/slate-day.ts parseDay,
 * the Spanish GP through parseF1, WWT and Bristol through parseNascar. The clock is
 * set just before each one starts, so every pick is open. start-join.js, group.js,
 * states.js, header.js, fmt.js and team-chip.js are the shipped modules. TEST
 * INPUTS, NOT FIXTURES: the groups (GET /api/group/mine's contract shape).
 * p6-allgames' filter chips are stubbed as "no chips" - p6 imports /src modules
 * Node cannot resolve here, and the chips are not what this file is about.
 *
 * The DOM below is the smallest one these screens run on. Layout is closed in a
 * real browser at 393px, not here.
 */
import { test, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDay } from '../src/slate-day.ts';
import { DAY_SPORTS } from '../src/lib/day.ts';
import { parseF1 } from '../src/lib/f1.ts';
import { cleanF1Picks } from '../src/f1-pool.ts';
import { parseNascar, cleanNascarPicks } from '../src/lib/nascar.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const feed = (f) => JSON.parse(read('../fixtures/feed/' + f));
const race = (f) => JSON.parse(read('../fixtures/nascar/' + f));

/* ------------------------------------------------------------ a small DOM */

const camel = (s) => s.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
function all(n, out = []) { out.push(n); for (const c of n.children) all(c, out); return out; }
/** One compound selector: tag, .classes, [attr] / [attr="v"]. No combinators. */
function matches(x, sel) {
  const m = /^([a-z0-9]*)((?:\.[\w-]+)*)((?:\[[^\]]+\])*)$/i.exec(sel.trim());
  if (!m) throw new Error('the test DOM does not read this selector: ' + sel);
  if (m[1] && x.tagName !== m[1].toUpperCase()) return false;
  for (const c of m[2].match(/\.[\w-]+/g) || []) if (!x.classList.contains(c.slice(1))) return false;
  for (const a of m[3].match(/\[[^\]]+\]/g) || []) {
    const am = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(a);
    const v = am[1].startsWith('data-') ? x.dataset[camel(am[1].slice(5))] : x.attrs[am[1]];
    if (v == null) return false;
    if (am[2] !== undefined && String(v) !== am[2]) return false;
  }
  return true;
}
function mk(tag) {
  const n = {
    tagName: String(tag).toUpperCase(), children: [], parent: null, attrs: {}, dataset: {},
    style: { setProperty(k, v) { n.style[k] = v; } }, listeners: {}, _text: '', className: '',
    classList: {
      list: () => (n.className ? String(n.className).split(/\s+/).filter(Boolean) : []),
      add(...cs) { const l = n.classList.list(); for (const c of cs) if (!l.includes(c)) l.push(c); n.className = l.join(' '); },
      remove(...cs) { n.className = n.classList.list().filter((x) => !cs.includes(x)).join(' '); },
      contains: (c) => n.classList.list().includes(c),
      toggle(c, on) { if (on) n.classList.add(c); else n.classList.remove(c); return !!on; }
    },
    get textContent() { return n._text + n.children.map((c) => c.textContent).join(''); },
    set textContent(v) { n._text = v == null ? '' : String(v); for (const c of n.children) c.parent = null; n.children = []; },
    get innerHTML() { return ''; },
    set innerHTML(v) { n.textContent = ''; },
    appendChild(c) { if (c.parent) c.remove(); c.parent = n; n.children.push(c); return c; },
    append(...cs) { for (const c of cs) n.appendChild(typeof c === 'string' ? Object.assign(mk('#text'), { _text: c }) : c); },
    insertBefore(c, ref) {
      if (c.parent) c.remove();
      const i = ref ? n.children.indexOf(ref) : -1;
      c.parent = n;
      if (i < 0) n.children.push(c); else n.children.splice(i, 0, c);
      return c;
    },
    before(c) { n.parent.insertBefore(c, n); },
    after(c) { if (c.parent) c.remove(); const p = n.parent; p.children.splice(p.children.indexOf(n) + 1, 0, c); c.parent = p; },
    remove() { if (!n.parent) return; n.parent.children.splice(n.parent.children.indexOf(n), 1); n.parent = null; },
    replaceWith(c) {
      const p = n.parent; if (!p) return;
      if (c.parent) c.remove();
      p.children.splice(p.children.indexOf(n), 1, c); c.parent = p; n.parent = null;
    },
    contains(x) { for (let q = x; q; q = q.parent) if (q === n) return true; return false; },
    get previousElementSibling() { const p = n.parent; return p ? p.children[p.children.indexOf(n) - 1] || null : null; },
    setAttribute(k, v) { n.attrs[k] = String(v); },
    getAttribute(k) { return k in n.attrs ? n.attrs[k] : null; },
    removeAttribute(k) { delete n.attrs[k]; },
    addEventListener(t, f) { (n.listeners[t] = n.listeners[t] || []).push(f); },
    dispatch(t) {
      const e = { type: t, target: n, stopPropagation() {}, preventDefault() {} };
      for (const f of n.listeners[t] || []) f(e);
      if (t === 'click' && typeof n.onclick === 'function') n.onclick(e);
    },
    click() { n.dispatch('click'); },
    querySelectorAll(sel) { return all(n).slice(1).filter((x) => matches(x, sel)); },
    querySelector(sel) { return n.querySelectorAll(sel)[0] || null; }
  };
  return n;
}

/* ------------------------------------------------------------ the world */

const STORE = new Map();
globalThis.localStorage = {
  getItem: (k) => (STORE.has(k) ? STORE.get(k) : null),
  setItem: (k, v) => { STORE.set(k, String(v)); },
  removeItem: (k) => { STORE.delete(k); },
  clear: () => STORE.clear()
};
globalThis.window = globalThis;
globalThis.document = {
  createElement: mk, createElementNS: (_ns, t) => mk(t),
  createTextNode: (s) => Object.assign(mk('#text'), { _text: String(s) }),
  body: mk('body'), documentElement: mk('html')
};
let HASH = '#/';
Object.defineProperty(globalThis, 'location', {
  configurable: true, value: { get hash() { return HASH; }, set hash(v) { HASH = String(v); } }
});
globalThis.requestAnimationFrame = (f) => setTimeout(f, 0);

const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });

const NBA = parseDay(feed('espn-nba-scoreboard-261021.json'), 'nba', '20261021');
const NBA_DAY = '20261021';
const NBA_NOON = Date.UTC(2026, 9, 21, 17, 0);          /* 1 PM Eastern, six hours before tip-off */
const NFL = parseDay(feed('espn-nfl-scoreboard-260908.json'), 'nfl', '20260908');
const NFL_BEFORE = Date.UTC(2026, 8, 9, 12, 0);         /* the morning before the opener */
const F1EV = parseF1(feed('espn-f1-scoreboard-260912.json'));
const F1_NOW = F1EV.sessions.find((s) => s.kind === 'race').start - 60 * 1000;   /* the race still open */
const CUP = parseNascar(race('espn-nascar-scoreboard-260913.json'), race('wwt-2026-race-core-pre.json'));
const TRK = parseNascar(race('espn-truck-scoreboard-260918.json'), race('truck-260918-race-core.json'));

/* GET /api/group/mine's shape - test inputs. */
const grp = (id, sport) => ({ id, name: id + ' crew', sport, week: null, ats: false, scope: 'all', scopeArg: '', members: 3, role: 'member' });
const G_NFL = grp('NFL111', 'nfl');
const G_NBA = grp('HOOPS1', 'nba');
const G_NBA2 = grp('HOOPS2', 'nba');
const G_F1 = grp('PITWAL', 'f1');
const G_CUP = grp('TURN4X', 'nascar');

/** Every call any screen makes, answered from the fixtures. The pool writes are the
 *  shipped cleaners, so a pick "saved to a group" here is what the Worker keeps. */
let CALLS = [];
function world({ groups = [], day = null, slate = null, f1 = null, nascar = null, now = Date.now() } = {}) {
  CALLS = [];
  const api = async (url, init) => {
    const u = String(url);
    CALLS.push({ url: u, body: init && init.body ? JSON.parse(init.body) : null });
    if (u === '/api/group/mine') return json({ groups });
    if (u.startsWith('/api/day/')) return day ? json({ games: day }) : json({ error: 'no day' }, 404);
    if (u.startsWith('/api/state/slate:')) return slate ? json({ games: slate }) : json({ error: 'no slate' }, 404);
    if (u === '/api/f1/current') return f1 ? json({ event: f1, extras: null }) : json({ error: 'none' }, 404);
    if (u.startsWith('/api/nascar/current')) return nascar ? json({ schema: 1, event: nascar }) : json({ error: 'none' }, 404);
    if (u.startsWith('/api/pool/f1picks?pool=')) return json({ pool: u.split('=')[1], eventId: F1EV.id, picks: {} });
    if (u === '/api/pool/f1pick') { const b = JSON.parse(init.body); return json({ ok: true, eventId: F1EV.id, picks: cleanF1Picks(F1EV, b.picks, {}, now) }); }
    if (u.startsWith('/api/pool/racepicks?pool=')) return json({ pool: u.split('=')[1], eventId: nascar.id, picks: {} });
    if (u === '/api/pool/racepick') { const b = JSON.parse(init.body); return json({ ok: true, eventId: nascar.id, picks: cleanNascarPicks(nascar, b.picks, {}, now) }); }
    if (u === '/api/pool/pick') return json({ ok: true });
    return json({ error: 'no route' }, 404);
  };
  globalThis.fetch = api;
  window.agApiFetch = api;
}
/** Calls to one URL - or, for a prefix ending in '/', every URL under it. Exact by
 *  default: '/api/pool/f1pick' must not also count the '/api/pool/f1picks?pool=' read. */
const called = (u) => CALLS.filter((c) => (u.endsWith('/') ? c.url.startsWith(u) : c.url === u));

/** The sign-in sheet (window.agOpenSignIn -> Promise<boolean>). `ok` signs this phone
 *  in before it resolves, as components/signin.js does. Returns the list of opens. */
function signInSheet(ok) {
  const opens = [];
  window.agOpenSignIn = async () => {
    opens.push(1);
    if (ok) { STORE.set('ag.session', 't'); STORE.set('ag.handle', 'h1'); }
    return ok;
  };
  return opens;
}
const signIn = () => { STORE.set('ag.session', 't'); STORE.set('ag.handle', 'h1'); };
const settle = async () => { for (let i = 0; i < 40; i++) await new Promise((r) => setImmediate(r)); };

const realNow = Date.now;
const at = (ms) => { Date.now = () => ms; };

/* ------------------------------------------------------------ the modules */

const SJ = await import('../public/components/start-join.js');
const GROUP = await import('../public/components/group.js');
const STATES = await import('../public/components/states.js');
const HEADER = await import('../public/components/header.js');
const FMT = await import('../public/components/fmt.js');
const CHIP = await import('../public/components/team-chip.js');

/* p2 is loaded the way tests/p2-slate.test.mjs loads it - import lines stripped - with
   every imported name installed as the real thing (p6's chips aside). */
const P2_SRC = read('../public/screens/p2-slate.screen.js').replace(/\r\n/g, '\n');
Object.assign(globalThis, {
  teamChip: CHIP.teamChip, TEAM_CHIP_CSS: CHIP.TEAM_CHIP_CSS, applyTeamVars: CHIP.applyTeamVars,
  stateBlock: STATES.stateBlock, STATES_CSS: STATES.STATES_CSS, pageHeader: HEADER.pageHeader,
  progress: FMT.progress, crowdLabel: FMT.crowdLabel,
  filterOptions: () => [], gamePasses: () => true, FILTER_ALL: 'all', filterKey: (s) => 'ag.filter.' + s,
  overlayLive: async (list) => list,
  myGroups: GROUP.myGroups, pickCurrent: GROUP.pickCurrent, groupSwitcher: GROUP.groupSwitcher, GROUP_CSS: GROUP.GROUP_CSS,
  noGroupTap: SJ.noGroupTap, startJoinCard: SJ.startJoinCard, startJoinSheet: SJ.startJoinSheet, START_JOIN_CSS: SJ.START_JOIN_CSS
});
for (const m of P2_SRC.matchAll(/^import\s*\{([^}]*)\}\s*from\s*'[^']+';$/gm)) {
  for (const name of m[1].split(',').map((s) => s.trim()).filter(Boolean)) {
    assert.ok(name in globalThis, 'p2 imports ' + name + ' and this file does not install it');
  }
}
const stripImports = (s) => s.replace(/^import\s[\s\S]*?from\s+'[^']*';$/gm, '').replace(/^import[^;]*;$/gm, '');
const P2 = await import('data:text/javascript;base64,' + Buffer.from(stripImports(P2_SRC), 'utf8').toString('base64'));

/* f1 and nascar are loaded the way their own tests load them: server-absolute
   imports re-based onto the real files. */
const rebase = (src, paths) => {
  let out = src;
  for (const [from, to] of Object.entries(paths)) {
    assert.ok(out.includes(from), 'the screen no longer imports ' + from);
    out = out.replace(from, JSON.stringify(new URL(to, import.meta.url).href));
  }
  return 'data:text/javascript;base64,' + Buffer.from(out, 'utf8').toString('base64');
};
const COMMON = {
  "'/components/states.js'": '../public/components/states.js',
  "'/components/header.js'": '../public/components/header.js',
  "'/components/group.js'": '../public/components/group.js',
  "'/components/start-join.js'": '../public/components/start-join.js'
};
const F1 = await import(rebase(read('../public/screens/f1-picks.screen.js'), { ...COMMON, "'/src/lib/f1.js'": '../src/lib/f1.ts' }));
const NAS = await import(rebase(read('../public/screens/nascar-picks.screen.js'), { ...COMMON, "'/src/lib/nascar.js'": '../src/lib/nascar.ts' }));

const FIX = { teams: JSON.parse(read('../fixtures/teams.json')), games: [], load: async () => { throw new Error('none'); } };

beforeEach(() => {
  STORE.clear(); GROUP.forgetGroups(); HASH = '#/';
  delete window.agOpenSignIn; delete window.agAuthRequired;
  world();
});
afterEach(() => { Date.now = realNow; });
after(() => { if (window.__agPoolLiveTimer) clearInterval(window.__agPoolLiveTimer); });

/* ------------------------------------------------------------ what every screen shares */

const cards = (root) => root.querySelectorAll('.ag-sj').filter((c) => !c.classList.contains('ag-sj--sheet'));
const sheets = (root) => root.querySelectorAll('.ag-sj--sheet');

/** The pair is there once, for this sport, and - signed in - each button stores the
 *  sport and the form and opens the group page. */
async function pairOpensTheGroupPage(root, sport) {
  const c = cards(root);
  assert.equal(c.length, 1, 'one Start / Join card');
  assert.equal(c[0].dataset.sport, sport);
  const start = c[0].querySelector('button[data-sj="start"]');
  const join = c[0].querySelector('button[data-sj="join"]');
  assert.ok(start && join, 'Start a group and Join a group');
  assert.equal(start.textContent, 'Start a group');
  assert.equal(join.textContent, 'Join a group');
  HASH = '#/here';
  start.click(); await settle();
  assert.equal(STORE.get('ag.groupForm'), 'start');
  assert.equal(STORE.get('ag.sport'), JSON.stringify(sport), 'the Start form opens on this sport');
  assert.equal(HASH, '#/g');
  HASH = '#/here';
  join.click(); await settle();
  assert.equal(STORE.get('ag.groupForm'), 'join');
  assert.equal(HASH, '#/g');
}

test('the Start / Join buttons are a 44px reach, and every no-group screen carries their CSS', () => {
  assert.match(SJ.START_JOIN_CSS, /\.ag-sj-btn \{[^}]*min-height: var\(--tap-min\)/);
  assert.match(SJ.START_JOIN_CSS, /\.ag-sj-x \{[^}]*min-height: var\(--tap-min\)/);
  for (const [name, src] of [['p2', P2_SRC], ['f1', read('../public/screens/f1-picks.screen.js')], ['nascar', read('../public/screens/nascar-picks.screen.js')]]) {
    assert.ok(src.includes('START_JOIN_CSS'), name + ' puts START_JOIN_CSS in its style');
  }
});

/* ------------------------------------------------------------ p2 browse (#/pool) */

async function nbaPool({ groups = [], signedIn = false } = {}) {
  at(NBA_NOON);
  if (signedIn) signIn();
  STORE.set('ag.sport', JSON.stringify('nba'));
  world({ day: NBA, groups });
  const d = await P2.previewData(FIX, 'browse');
  const root = mk('div');
  P2.render(root, d, 'browse');
  return { d, root };
}

test('browse is a route of p2, and Home\'s day sports all land on a pool, never a door elsewhere', async () => {
  assert.ok(P2.states.includes('browse'));
  for (const sport of Object.keys(DAY_SPORTS)) {
    STORE.set('ag.sport', JSON.stringify(sport));
    world();                                  /* no day on the feed: an empty pool */
    const d = await P2.previewData(FIX, 'browse');
    assert.equal(d.browseState, 'empty', sport);
    assert.equal(d.sport, sport);
    assert.equal(d.noSample, true, 'nothing on the browse pool is made up');
  }
});

test('p2 browse, NBA, signed out: the day\'s games under the pair - no sign-in wall, no group call', async () => {
  const { d, root } = await nbaPool();
  assert.equal(d.browseState, 'ready');
  assert.equal(d.day, NBA_DAY);
  assert.equal(d.games.length, NBA.length, 'every game on the captured day');
  assert.deepEqual(CALLS.map((c) => c.url), ['/api/day/nba/' + NBA_DAY], 'signed out, myGroups asks nothing');
  assert.equal(root.querySelectorAll('.p2-row').length, NBA.length);
  assert.ok(root.textContent.includes('NBA · Today · pick the winners · scored in points'), 'the sub line names the sport');
  assert.equal(root.querySelector('.p2-gcard'), null, 'no gate card');
  const c = cards(root);
  assert.equal(c.length, 1);
  assert.ok(root.children.indexOf(c[0]) < root.children.indexOf(root.querySelector('.p2-list')), 'the pair is above the games');
  assert.ok(root.querySelector('.p2-days'), 'the day bar, as a group of the sport has');
  assert.equal(root.querySelector('.p2-tb'), null, 'no tiebreak - there is no group whose tie it breaks');
});

test('p2 browse, signed out: the first pick opens the sign-in sheet and nothing is sent or kept', async () => {
  const { root } = await nbaPool();
  const opens = signInSheet(false);
  root.querySelector('.p2-zone[data-side="home"]').click();
  await settle();
  assert.equal(opens.length, 1, 'window.agOpenSignIn');
  assert.equal(called('/api/pool/pick').length, 0, 'no pick is sent');
  assert.ok(![...STORE.keys()].some((k) => k.startsWith('ag.picks.')), 'no pick is kept');
  assert.equal(root.querySelector('.p2-zone[data-pick="on"]'), null, 'no row shows a pick');
  assert.equal(sheets(root).length, 0, 'a closed sign-in sheet leaves the pool as it was');
  assert.equal(HASH, '#/');
});

test('p2 browse: signing in with no NBA group stays on the pool, with the sheet at the game tapped', async () => {
  const { root } = await nbaPool({ groups: [G_NFL] });
  signInSheet(true);
  const zone = root.querySelectorAll('.p2-zone[data-side="away"]')[2];
  zone.click();
  await settle();
  assert.equal(HASH, '#/', 'still the pool');
  assert.equal(called('/api/group/mine').length, 1, 'reloaded after signing in');
  const s = sheets(root);
  assert.equal(s.length, 1);
  assert.equal(s[0].previousElementSibling.dataset.gameId, zone.dataset.game, 'right under the row');
  assert.equal(called('/api/pool/pick').length, 0);
});

test('p2 browse: signing in with an NBA group makes it current and opens #/gpicks', async () => {
  const { root } = await nbaPool({ groups: [G_NFL, G_NBA] });
  signInSheet(true);
  root.querySelector('.p2-zone[data-side="home"]').click();
  await settle();
  assert.equal(HASH, '#/gpicks');
  assert.equal(STORE.get('ag.group'), G_NBA.id);
  assert.equal(called('/api/pool/pick').length, 0, 'the tap was not a pick in the group');
});

test('p2 browse, signed in with no NBA group: a pick opens the inline sheet beside its row and sends nothing', async () => {
  const { d, root } = await nbaPool({ groups: [G_NFL], signedIn: true });
  assert.equal(d.browseState, 'ready', 'an NFL group is not an NBA group');
  const opens = signInSheet(true);
  const rows = root.querySelectorAll('.p2-row');
  rows[0].querySelector('.p2-zone[data-side="home"]').click();
  await settle();
  assert.equal(opens.length, 0, 'signed in: no sign-in sheet');
  let s = sheets(root);
  assert.equal(s.length, 1, 'the inline sheet');
  assert.equal(s[0].previousElementSibling, rows[0], 'beside the row tapped');
  assert.deepEqual(s[0].querySelectorAll('button').map((b) => b.dataset.sj), ['start', 'join', 'close']);
  assert.equal(called('/api/pool/pick').length, 0, 'no pick is sent');
  assert.ok(![...STORE.keys()].some((k) => k.startsWith('ag.picks.')), 'no pick is kept');
  assert.equal(root.querySelector('.p2-zone[data-pick="on"]'), null);

  rows[3].querySelector('.p2-zone[data-side="away"]').click();
  await settle();
  s = sheets(root);
  assert.equal(s.length, 1, 'one sheet at a time');
  assert.equal(s[0].previousElementSibling, rows[3], 'it moves to the new row');

  s[0].querySelector('button[data-sj="close"]').click();
  assert.equal(sheets(root).length, 0, 'Not now closes it');
  assert.equal(d.sheetFor, null);

  await pairOpensTheGroupPage(root, 'nba');
  rows[1].querySelector('.p2-zone[data-side="home"]').click();
  await settle();
  HASH = '#/here';
  sheets(root)[0].querySelector('button[data-sj="join"]').click();
  await settle();
  assert.equal(STORE.get('ag.groupForm'), 'join', 'the sheet\'s Join is the same door');
  assert.equal(HASH, '#/g');
});

test('p2 browse with a group of the sport hands over to #/gpicks, that group current', async () => {
  at(NBA_NOON);
  signIn();
  STORE.set('ag.sport', JSON.stringify('nba'));
  STORE.set('ag.group', G_NFL.id);
  world({ day: NBA, groups: [G_NFL, G_NBA, G_NBA2] });
  const d = await P2.previewData(FIX, 'browse');
  assert.equal(d.browseState, 'handover');
  assert.equal(d.group.id, G_NBA.id, 'the first NBA group - the stored one is not NBA');
  assert.equal(STORE.get('ag.group'), G_NBA.id);
  assert.equal(called('/api/day/').length, 0, 'no pool is loaded for somebody who has one');
  P2.render(mk('div'), d, 'browse');
  assert.equal(HASH, '#/gpicks');

  GROUP.forgetGroups();
  STORE.set('ag.group', G_NBA2.id);
  const again = await P2.previewData(FIX, 'browse');
  assert.equal(again.group.id, G_NBA2.id, 'a stored NBA group stays current');
});

test('p2 browse, not a day sport: a door to that sport\'s own screen, and nothing fetched', async () => {
  const want = { f1: '#/f1', nascar: '#/nascar', 'nascar-oreilly': '#/nascar-oreilly', 'nascar-truck': '#/nascar-truck',
    props: '#/props', squares: '#/squares', nfl: '#/slate', 'college-football': '#/slate', '': '#/slate' };
  for (const [sport, href] of Object.entries(want)) {
    STORE.clear();
    if (sport) STORE.set('ag.sport', JSON.stringify(sport));
    world();
    const d = await P2.previewData(FIX, 'browse');
    assert.equal(d.browseState, 'elsewhere', sport);
    assert.equal(CALLS.length, 0, sport + ': nothing fetched');
    const root = mk('div');
    P2.render(root, d, 'browse');
    const a = root.querySelector('a.p2-gcta');
    assert.equal(a && a.href, href, sport);
    assert.equal(root.querySelector('.p2-row'), null);
  }
});

test('p2 browse, an empty day: the pair and the day bar still there, and a day chip re-reads the pool', async () => {
  at(NBA_NOON);
  STORE.set('ag.sport', JSON.stringify('nba'));
  world();
  const d = await P2.previewData(FIX, 'browse');
  const root = mk('div');
  P2.render(root, d, 'browse');
  assert.equal(d.browseState, 'empty');
  assert.equal(cards(root).length, 1);
  assert.ok(root.querySelector('.state-empty'));
  const tomorrow = root.querySelectorAll('button.p2-day').find((b) => b.textContent === 'Tomorrow');
  world({ day: NBA });
  tomorrow.click();
  await settle();
  assert.deepEqual(CALLS.map((c) => c.url), ['/api/day/nba/20261022'], 'the chosen day, through the browse state');
  assert.equal(STORE.get('ag.poolday.nba'), '20261022');
  assert.equal(root.querySelectorAll('.p2-row').length, NBA.length);
  assert.equal(HASH, '#/');
});

/* ------------------------------------------------------------ p2 public slate (#/slate) */

test('the public NFL slate: the pair on top, and a pick works exactly as before - the world board, no sheet', async () => {
  at(NFL_BEFORE);
  STORE.set('ag.sport', JSON.stringify('nfl'));
  world({ slate: NFL });
  const d = await P2.previewData(FIX, 'ready-short');
  assert.equal(d.sport, 'nfl');
  assert.equal(d.games.length, NFL.length);
  const root = mk('div');
  P2.render(root, d, 'ready-short');
  const c = cards(root);
  assert.equal(c.length, 1);
  assert.equal(c[0].dataset.sport, 'nfl');
  assert.ok(root.children.indexOf(c[0]) < root.children.indexOf(root.querySelector('.p2-list')));

  const opens = signInSheet(false);
  const zone = root.querySelector('.p2-zone[data-side="home"]');
  zone.click();
  await settle();
  assert.equal(opens.length, 0, 'the public slate asks nothing at a pick');
  const post = called('/api/pool/pick');
  assert.equal(post.length, 1, 'the pick goes to the world board');
  assert.equal(post[0].body.gameId, zone.dataset.game);
  assert.equal(post[0].body.sport, 'nfl');
  assert.equal(post[0].body.poolId, undefined, 'never into a group');
  assert.equal(JSON.parse(STORE.get('ag.picks.nfl.1'))[zone.dataset.game].side, 'home', 'kept on this phone');
  assert.equal(sheets(root).length, 0, 'no no-group sheet here');

  /* Signed out, Start asks for sign-in first - and a cancelled sheet goes nowhere. */
  HASH = '#/slate';
  c[0].querySelector('button[data-sj="start"]').click();
  await settle();
  assert.equal(opens.length, 1);
  assert.equal(HASH, '#/slate');
  signIn();
  await pairOpensTheGroupPage(root, 'nfl');
});

test('the week\'s card (marbles) is not a group product and carries no pair', async () => {
  at(NFL_BEFORE);
  STORE.set('ag.sport', JSON.stringify('nfl'));
  STORE.set('ag.mode', JSON.stringify('marbles'));
  world({ slate: NFL });
  const d = await P2.previewData(FIX, 'ready-short');
  assert.equal(d.mode, 'week');
  const root = mk('div');
  P2.render(root, d, 'ready-short');
  assert.equal(cards(root).length, 0);
});

/* ------------------------------------------------------------ f1-picks (#/f1) */

async function f1Screen({ groups = [], signedIn = false } = {}) {
  at(F1_NOW);
  HASH = '#/f1';
  if (signedIn) signIn();
  world({ f1: F1EV, groups, now: F1_NOW });
  const d = await F1.previewData({}, 'ready');
  const root = mk('div');
  F1.render(root, d, 'ready');
  return { d, root };
}
const f1Choice = (root, k, label) => root.querySelector('[data-pick-key="' + k + '"]')
  .querySelectorAll('button.f1-choice').find((b) => b.textContent === label);

test('f1, in no F1 group: the pair replaces the #/g line, and the groups-error line is kept', async () => {
  const { root } = await f1Screen();
  assert.equal(root.querySelector('.f1-invite'), null);
  assert.equal(root.querySelectorAll('a').filter((a) => a.href === '#/g').length, 0, 'no bare line to #/g');
  assert.ok(cards(root)[0].textContent.includes(F1.SOLO_CARD.body));
  signIn();
  await pairOpensTheGroupPage(root, 'f1');

  const root2 = mk('div');
  F1.render(root2, { event: F1EV, groups: [], groupsError: 'offline' }, 'ready');
  assert.equal(cards(root2).length, 0, 'groups that did not load are not "no group"');
  assert.ok(root2.querySelector('.f1-invite').textContent.includes('did not load'));
});

test('f1, signed out: the first pick is kept on this phone and opens the sign-in sheet, once', async () => {
  const { root } = await f1Screen();
  const opens = signInSheet(false);
  f1Choice(root, 'poleWins', 'Yes').click();
  await settle();
  assert.equal(opens.length, 1, 'window.agOpenSignIn');
  assert.equal(JSON.parse(STORE.get('ag.f1.' + F1EV.id)).poleWins, 'yes', 'the pick is on this phone');
  f1Choice(root, 'poleWins', 'No').click();
  await settle();
  assert.equal(opens.length, 1, 'asked once a visit');
  assert.equal(called('/api/pool/f1pick').length, 0);
  assert.equal(sheets(root).length, 0);
});

test('f1, signed out, signing in with an F1 group: the screen reloads into it and the phone\'s pick is sent', async () => {
  const { root } = await f1Screen({ groups: [G_NFL, G_F1] });
  signInSheet(true);
  f1Choice(root, 'poleWins', 'Yes').click();
  await settle();
  assert.ok(root.textContent.includes('Playing in'), 'the group is picked up');
  assert.equal(cards(root).length, 0);
  const sent = called('/api/pool/f1pick');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].body.pool, G_F1.id);
  assert.equal(sent[0].body.picks.poleWins, 'yes', 'what the phone had goes to the group');
});

test('f1, signed out, signing in with still no F1 group: the inline sheet opens at the card picked', async () => {
  const { root } = await f1Screen({ groups: [G_NFL] });
  signInSheet(true);
  f1Choice(root, 'poleWins', 'Yes').click();
  await settle();
  const s = sheets(root);
  assert.equal(s.length, 1);
  assert.equal(s[0].previousElementSibling.dataset.pickKey, 'poleWins');
});

test('f1, signed in with no F1 group: the pick is kept here, the inline sheet opens beside it, once a visit', async () => {
  const { root } = await f1Screen({ groups: [G_NFL], signedIn: true });
  const opens = signInSheet(true);
  f1Choice(root, 'dnf', 'None').click();
  await settle();
  assert.equal(opens.length, 0, 'signed in: no sign-in sheet');
  let s = sheets(root);
  assert.equal(s.length, 1);
  assert.equal(s[0].previousElementSibling.dataset.pickKey, 'dnf', 'beside the card picked');
  assert.ok(s[0].textContent.includes(F1.SOLO_SHEET.body));
  assert.equal(JSON.parse(STORE.get('ag.f1.' + F1EV.id)).dnf, '0', 'today\'s local save');
  assert.equal(called('/api/pool/f1pick').length, 0, 'nothing sent to a group');

  f1Choice(root, 'poleWins', 'No').click();
  await settle();
  assert.equal(sheets(root).length, 1, 'still the one sheet across a redraw');
  sheets(root)[0].querySelector('button[data-sj="close"]').click();
  assert.equal(sheets(root).length, 0);
  f1Choice(root, 'poleWins', 'Yes').click();
  await settle();
  assert.equal(sheets(root).length, 0, 'not again this visit');

  HASH = '#/f1';
  f1Choice(root, 'dnf', '1–2').click();
  await settle();
  await pairOpensTheGroupPage(root, 'f1');
});

/* ------------------------------------------------------------ nascar-picks (#/nascar, ...) */

async function raceDay(hash, ev, { groups = [], signedIn = false } = {}) {
  const now = ev.start - 60 * 60 * 1000;          /* an hour before the green flag */
  at(now);
  HASH = hash;
  if (signedIn) signIn();
  world({ nascar: ev, groups, now });
  const d = await NAS.previewData({}, 'ready');
  const root = mk('div');
  NAS.render(root, d, 'ready');
  return { d, root };
}
const makeBtn = (root, make) => root.querySelector('[data-pick-key="make"]')
  .querySelectorAll('button.nas-choice').find((b) => b.textContent === make);

test('nascar, in no Cup group: the pair names the series, signed out the first pick asks for sign-in once', async () => {
  const { root } = await raceDay('#/nascar', CUP);
  assert.equal(root.querySelector('.nas-invite'), null);
  assert.ok(cards(root)[0].textContent.includes('Start a NASCAR group'));
  const opens = signInSheet(false);
  makeBtn(root, 'Ford').click();
  await settle();
  assert.equal(opens.length, 1, 'window.agOpenSignIn');
  assert.equal(JSON.parse(STORE.get('ag.nascar.' + CUP.id)).make, 'Ford', 'kept on this phone');
  makeBtn(root, 'Toyota').click();
  await settle();
  assert.equal(opens.length, 1, 'asked once a visit');
  assert.equal(called('/api/pool/racepick').length, 0);
});

test('nascar, signed out, signing in with a Cup group: race day reloads into the group with the phone\'s pick', async () => {
  const { root } = await raceDay('#/nascar', CUP, { groups: [G_CUP] });
  signInSheet(true);
  makeBtn(root, 'Ford').click();
  await settle();
  assert.ok(root.textContent.includes('Playing in'));
  const sent = called('/api/pool/racepick');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].body.pool, G_CUP.id);
  assert.equal(sent[0].body.picks.make, 'Ford');
});

test('nascar, signed in with no Cup group: the pick is kept here and the inline sheet opens beside it', async () => {
  const { root } = await raceDay('#/nascar', CUP, { groups: [G_F1], signedIn: true });
  const opens = signInSheet(true);
  makeBtn(root, 'Chevrolet').click();
  await settle();
  assert.equal(opens.length, 0);
  const s = sheets(root);
  assert.equal(s.length, 1);
  assert.equal(s[0].previousElementSibling.dataset.pickKey, 'make');
  assert.ok(s[0].textContent.includes(NAS.soloSheet('nascar').body));
  assert.equal(called('/api/pool/racepick').length, 0, 'nothing sent to a group');
  assert.equal(JSON.parse(STORE.get('ag.nascar.' + CUP.id)).make, 'Chevrolet');
  s[0].querySelector('button[data-sj="close"]').click();
  assert.equal(sheets(root).length, 0);
  await pairOpensTheGroupPage(root, 'nascar');
});

test('nascar, the Truck Series route: the pair is for a Truck group', async () => {
  const { root } = await raceDay('#/nascar-truck', TRK, { groups: [G_CUP], signedIn: true });
  assert.ok(cards(root)[0].textContent.includes('Start a NASCAR Truck group'), 'a Cup group is not a Truck group');
  await pairOpensTheGroupPage(root, 'nascar-truck');
});
