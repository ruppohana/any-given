/* HOME STARTS WITH THE SPORTS.
 *
 * Jason, 2026-09-13: "since the front page is only 1 button now, start with the
 * sports." With POOL_ONLY on, Home is the hero and a sport chooser; a tap lands
 * on the group of that sport if you are in one (#/gpicks), else on the group
 * page (#/g), whose Start form opens on the sport just chosen.
 *
 * The screen is browser code - server-absolute imports and a DOM - so, as
 * tests/l2-delay.test.mjs does for staleness, the Home pieces are LIFTED out of
 * the shipped source by name and run. Nothing here restates them. The group list
 * comes from the REAL components/group.js, with fetch and storage stubbed; the
 * families are checked against the REAL src/lib/groups.ts POOL_SPORTS.
 *
 * Layout is closed in a browser at 393px, not here.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { POOL_SPORTS } from '../src/lib/groups.ts';
/* The real ready sets - Home's Awards & TV tiles are read off these, never invented. */
import { templatesOpen, PROP_TEMPLATES } from '../src/lib/props.ts';

const SRC = readFileSync(new URL('../public/screens/live-game.screen.js', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n');

/** A top-level declaration, by name, through its closing line at column 0. */
function lift(name) {
  const m = new RegExp('\\n((?:async )?function ' + name + '\\(|const ' + name + ' = )').exec(SRC);
  assert.ok(m, name + ' is declared at the top level');
  const start = m.index + 1;
  const end = SRC.slice(start).search(/\n(\}|\};|\];)\n/);
  assert.ok(end > 0, name + ' closes');
  const from = start + end + 1;
  return SRC.slice(start, SRC.indexOf('\n', from));
}

const PIECES = ['el', 'store', 'HOME_FAMILIES', 'HOME_MARKS', 'homeSportDest', 'HOME_SHOW_NAMES', 'HOME_OWN',
  'homeShowList', 'homeShows', 'showTile', 'homeShowTap', 'homeSports', 'leagueTile',
  'mineMark', 'markHomeGroups', 'loadHomeGroups', 'homeSportTap', 'homeScreen'];
const BODY = PIECES.map(lift).join('\n\n');

/* ------------------------------------------------------------ a minimal DOM */

function all(node, out = []) { out.push(node); for (const c of node.children) all(c, out); return out; }
function mk(tag) {
  const node = {
    tagName: String(tag).toLowerCase(), children: [], attrs: {}, dataset: {},
    style: { setProperty() {} }, isConnected: true, _class: '', _text: '',
    get className() { return node._class; },
    set className(v) { node._class = String(v); },
    classList: {
      has() { return node._class ? node._class.split(/\s+/) : []; },
      add(c) { const h = node.classList.has(); if (!h.includes(c)) h.push(c); node._class = h.join(' '); },
      remove(c) { node._class = node.classList.has().filter((x) => x !== c).join(' '); },
      contains(c) { return node.classList.has().includes(c); },
      toggle(c, on) { if (on) node.classList.add(c); else node.classList.remove(c); return !!on; }
    },
    get textContent() { return node._text + node.children.map((c) => c.textContent).join(''); },
    set textContent(v) { node._text = v == null ? '' : String(v); node.children = []; },
    appendChild(c) { node.children.push(c); return c; },
    setAttribute(k, v) { node.attrs[k] = String(v); },
    getAttribute(k) { return node.attrs[k]; },
    querySelectorAll(sel) { return all(node).slice(1).filter((n) => n.classList.contains(sel.slice(1))); }
  };
  return node;
}
const byClass = (root, c) => all(root).filter((n) => n.classList.contains(c));
const tiles = (root) => byClass(root, 'lg-league');
/* The Sports section's tiles, and the Awards & TV section's. */
const sportTiles = (root) => tiles(root).filter((b) => !b.classList.contains('lg-show'));
const showTiles = (root) => byClass(root, 'lg-show');
const tile = (root, id) => sportTiles(root).find((b) => b.dataset.sport === id);
const show = (root, tpl) => showTiles(root).find((b) => b.dataset.template === tpl);
const SEP13 = Date.UTC(2026, 8, 13, 19, 0, 0);   /* the day before the Emmys */
const dayOf = (ms) => new Date(ms).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const settle = () => new Promise((r) => setTimeout(r, 0));

/* ------------------------------------------------------------ the world */

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k)
};
let CALLS = [];
let ANSWER = null;             /* () => Promise<Response-ish> for /api/group/mine */
globalThis.window = {
  agApiFetch: async (url) => { CALLS.push(String(url)); return ANSWER(); }
};
globalThis.document = { createElement: mk, createElementNS: (_ns, t) => mk(t) };
const GROUP = await import('../public/components/group.js');

function reply(groups) { return { ok: true, status: 200, json: async () => ({ groups, kindness: '' }) }; }
function signIn() { mem.set('ag.session', 't'); mem.set('ag.handle', 'h'); }

let STUBS, S, loc;
function load() {
  S = {}; loc = { hash: '#/' };
  STUBS = { calls: [] };
  const stub = (name) => (...a) => { STUBS.calls.push(name); const n = mk('div'); n.stub = name; return n; };
  const deps = {
    S, document: globalThis.document, location: loc,
    myGroups: GROUP.myGroups, currentGroupId: GROUP.currentGroupId, setCurrentGroupId: GROUP.setCurrentGroupId,
    templatesOpen, PROP_TEMPLATES,
    heroBlock: stub('hero'), modeCard: stub('modeCard'), sportCard: stub('sportCard'),
    goCard: stub('goCard'), marblesCard: stub('marblesCard')
  };
  const names = Object.keys(deps);
  return new Function(...names, BODY + '\nreturn { ' + PIECES.join(', ') + ' };')(...names.map((n) => deps[n]));
}

beforeEach(() => {
  mem.clear(); CALLS = []; ANSWER = async () => reply([]);
  GROUP.forgetGroups();
  delete globalThis.AG_POOL_ONLY;
});

/* ------------------------------------------------------------ the families */

test('the families, in Jason\'s order, carry every POOL_SPORTS id exactly once', () => {
  const { HOME_FAMILIES } = load();
  assert.deepEqual(HOME_FAMILIES.map((f) => f.h), ['Football', 'Basketball', 'Baseball', 'Hockey', 'Racing', 'Soccer']);
  assert.deepEqual(HOME_FAMILIES.map((f) => f.leagues), [
    [['college-football', 'College football'], ['nfl', 'NFL']],
    /* The two NCAA shields carry a caption each - Men, Women (2026-09-13). */
    [['mens-college-basketball', 'College basketball', 'Men'], ['womens-college-basketball', 'Women’s college basketball', 'Women'],
      ['nba', 'NBA'], ['wnba', 'WNBA']],
    [['mlb', 'MLB']],
    [['nhl', 'NHL'], ['mens-college-hockey', 'College hockey']],
    [['f1', 'Formula 1'], ['nascar', 'NASCAR Cup'], ['nascar-oreilly', "NASCAR O'Reilly"], ['nascar-truck', 'NASCAR Trucks']],
    [['epl', 'Premier League'], ['mls', 'MLS'], ['ucl', 'Champions League'], ['laliga', 'La Liga'], ['ligamx', 'Liga MX']]
  ]);
  const ids = HOME_FAMILIES.flatMap((f) => f.leagues.map(([id]) => id));
  assert.equal(new Set(ids).size, ids.length, 'no sport twice');
  /* Every pool sport but questions, which has its own section - Awards & TV (2026-09-13). */
  assert.deepEqual([...ids, 'props'].sort(), [...POOL_SPORTS].sort(), 'every pool sport and nothing else');
});

/* ------------------------------------------------------------ Awards & TV
 * Jason, 2026-09-13: "now we need the front page to separate sports and
 * non-sports". The tiles are src/lib/props.ts's own ready sets, open ones only. */

test('Awards & TV: each open ready set, dated by its broadcast, then Your own questions', () => {
  const { homeShowList } = load();
  const on13 = homeShowList(SEP13);
  assert.deepEqual(on13.map((s) => s.id), ['emmys-2026', 'survivor-51', ''], 'both sets are open on the 13th');
  assert.deepEqual(on13.map((s) => s.label), ['The Emmys', 'Survivor 51', 'Your own questions']);
  /* The Emmys lock 2026-09-15T00:00Z (5 PM Pacific on the 14th); Survivor 51 2026-09-24T00:00Z. */
  assert.equal(on13[0].cap, dayOf(PROP_TEMPLATES['emmys-2026'].questions[0].lockAt));
  assert.equal(on13[1].cap, dayOf(PROP_TEMPLATES['survivor-51'].questions[0].lockAt));
  if (new Date(SEP13).getTimezoneOffset() > 0) {
    assert.equal(on13[0].cap, 'Mon, Sep 14', 'in the Americas the Emmys read as Monday the 14th');
    assert.equal(on13[1].cap, 'Wed, Sep 23');
  }
  assert.match(on13[2].cap, /Oscars/);
  /* After the Emmys lock only Survivor is offered; after both, only your own. */
  assert.deepEqual(homeShowList(Date.UTC(2026, 8, 15, 0, 0, 1)).map((s) => s.id), ['survivor-51', '']);
  assert.deepEqual(homeShowList(Date.UTC(2026, 8, 25)).map((s) => s.id), ['']);
  /* The same list src/lib/props.ts offers a commissioner. */
  assert.deepEqual(on13.filter((s) => s.id).map((s) => s.id), templatesOpen(SEP13).map((t) => t.id));
});

test('Awards & TV layout: two across, and Your own questions fills an odd row or takes its own', () => {
  const { homeShows } = load();
  const two = homeShows(SEP13);
  assert.deepEqual(byClass(two, 'lg-fam-row').map((r) => [r.className, r.children.length]),
    [['lg-fam-row n2', 2], ['lg-fam-row n1', 1]]);
  const one = homeShows(Date.UTC(2026, 8, 16));
  assert.deepEqual(byClass(one, 'lg-fam-row').map((r) => [r.className, r.children.length]), [['lg-fam-row n2', 2]]);
  assert.deepEqual(showTiles(one).map((b) => b.dataset.template), ['survivor-51', '']);
  const none = homeShows(Date.UTC(2026, 8, 25));
  assert.deepEqual(byClass(none, 'lg-fam-row').map((r) => [r.className, r.children.length]), [['lg-fam-row n1', 1]]);
  for (const b of showTiles(two)) assert.equal(b.dataset.sport, 'props', 'every Awards & TV tile is a questions group');
});

test('Awards & TV tap: remembers the set and goes where a sport tile goes - #/props in a questions group', async () => {
  globalThis.AG_POOL_ONLY = true;
  const M = load();
  const wrap = mk('div');
  M.homeScreen(wrap);
  const emmys = show(wrap, 'emmys-2026');
  /* Only while the Emmys are still open on the real clock. */
  if (emmys) {
    await emmys.onclick();
    assert.equal(mem.get('ag.sport'), JSON.stringify('props'));
    assert.equal(mem.get('ag.propsTemplate'), JSON.stringify('emmys-2026'));
    assert.equal(loc.hash, '#/g', 'signed out: the group page, Start on questions');
  }
  await show(wrap, '').onclick();
  assert.equal(mem.get('ag.propsTemplate'), JSON.stringify(''), 'your own questions forgets any set');
  assert.equal(loc.hash, '#/g');

  signIn();
  GROUP.forgetGroups();
  ANSWER = async () => reply([{ id: 'G-NFL', sport: 'nfl' }, { id: 'G-Q', sport: 'props' }]);
  mem.set('ag.group', 'G-NFL');
  const M2 = load();
  const w2 = mk('div');
  M2.homeScreen(w2);
  await settle();
  assert.deepEqual(showTiles(w2).filter((b) => b.classList.contains('is-mine')).length, showTiles(w2).length,
    'every Awards & TV tile says Your group');
  await show(w2, '').onclick();
  assert.equal(mem.get('ag.group'), 'G-Q', 'the questions group is now the current group');
  assert.equal(loc.hash, '#/props');
  assert.deepEqual(M2.homeSportDest('props', [{ id: 'G-Q', sport: 'props' }], ''), { sport: 'props', groupId: 'G-Q', hash: '#/props' });
});

test('the marks are the ones page 2 already drew; every other league is its name', () => {
  const { HOME_MARKS } = load();
  assert.deepEqual(Object.keys(HOME_MARKS).sort(), ['college-football', 'mens-college-basketball', 'nba', 'nfl', 'womens-college-basketball']);
  assert.equal(HOME_MARKS.nba, 'https://a.espncdn.com/i/teamlogos/leagues/500/nba.png', 'the ESPN league mark page 2 used');
  assert.equal(HOME_MARKS['womens-college-basketball'], HOME_MARKS['mens-college-basketball'], 'the same NCAA shield');
  for (const id of ['nfl', 'college-football', 'mens-college-basketball', 'womens-college-basketball']) {
    assert.match(HOME_MARKS[id], /^\/logos\/leagues\/(nfl|ncaa)-500\.png$/);
    assert.ok(existsSync(new URL('../public' + HOME_MARKS[id], import.meta.url)), HOME_MARKS[id] + ' is on disk');
  }
});

/* ------------------------------------------------------------ where a tap goes */

test('homeSportDest: a group of that sport -> #/gpicks, none -> #/g', () => {
  const { homeSportDest: d } = load();
  const G = [{ id: 'A', sport: 'nfl' }, { id: 'B', sport: 'nba' }, { id: 'C', sport: 'nfl' },
             { id: 'OLD', sport: null }, { id: 'R', sport: 'nascar-truck' }];
  assert.deepEqual(d('nfl', [], ''), { sport: 'nfl', groupId: '', hash: '#/g' }, 'no groups');
  assert.deepEqual(d('nfl', undefined, ''), { sport: 'nfl', groupId: '', hash: '#/g' }, 'not loaded');
  assert.deepEqual(d('mlb', G, 'A'), { sport: 'mlb', groupId: '', hash: '#/g' }, 'groups, none of that sport');
  assert.deepEqual(d('nfl', G, ''), { sport: 'nfl', groupId: 'A', hash: '#/gpicks' }, 'the first of that sport');
  assert.equal(d('nfl', G, 'C').groupId, 'C', 'the current group wins when it is of that sport');
  assert.equal(d('nfl', G, 'B').groupId, 'A', 'a current group of another sport does not');
  assert.equal(d('college-football', G, '').groupId, 'OLD', 'a row from before the sport column is college football');
  assert.deepEqual(d('nascar-truck', G, ''), { sport: 'nascar-truck', groupId: 'R', hash: '#/gpicks' }, 'a racing group');
});

/* ------------------------------------------------------------ the chooser */

test('signed out: every tile, no request, and a tap goes to the group page on that sport', async () => {
  globalThis.AG_POOL_ONLY = true;
  const M = load();
  const wrap = mk('div');
  M.homeScreen(wrap);
  assert.deepEqual(wrap.children.map((n) => n.stub || n.className), ['hero', 'lg-sports']);
  /* Two sections, in this order: Sports, then Awards & TV. */
  assert.deepEqual(byClass(wrap, 'lg-sec-h').map((h) => h.textContent), ['Sports', 'Awards & TV']);
  assert.deepEqual(wrap.children[1].children.map((n) => n.className),
    ['lg-sec-h', 'lg-fams', 'lg-sec-h', 'lg-shows', 'lg-mygroups']);
  assert.deepEqual(sportTiles(wrap).map((b) => b.dataset.sport),
    M.HOME_FAMILIES.flatMap((f) => f.leagues.map(([id]) => id)), 'all eighteen, in order');
  assert.deepEqual(showTiles(wrap).map((b) => b.dataset.template),
    [...templatesOpen(Date.now()).map((t) => t.id), ''], 'the open sets, then your own');
  assert.deepEqual(byClass(wrap, 'lg-fam-h').map((h) => h.textContent), ['Football', 'Basketball', 'Baseball', 'Hockey', 'Racing', 'Soccer']);
  /* The Sports rows only - Awards & TV draws its own (tested below). */
  assert.deepEqual(byClass(byClass(wrap, 'lg-fams')[0], 'lg-fam-row').map((r) => r.className),
    ['lg-fam-row n2', 'lg-fam-row n2', 'lg-fam-row n1', 'lg-fam-row n2', 'lg-fam-row n2', 'lg-fam-row n2'], 'two or three across');
  /* Baseball is the one family of one now, so it takes the full width rather than half a row. */
  assert.deepEqual(byClass(wrap, 'lg-fam').map((f) => f.classList.contains('is-one')), [false, false, false, false, false, false]);
  /* The two NCAA shields say Men and Women under them; the name is still the label. */
  assert.equal(tile(wrap, 'womens-college-basketball').children[0].tagName, 'img');
  assert.equal(byClass(tile(wrap, 'womens-college-basketball'), 'lg-league-c')[0].textContent, 'Women');
  assert.equal(byClass(tile(wrap, 'mens-college-basketball'), 'lg-league-c')[0].textContent, 'Men');
  assert.equal(tile(wrap, 'womens-college-basketball').getAttribute('aria-label'), 'Women’s college basketball');
  assert.equal(tile(wrap, 'mens-college-hockey').children[0].textContent, 'College hockey', 'college hockey is words');
  assert.equal(tile(wrap, 'nfl').children[0].tagName, 'img', 'NFL is its shield');
  assert.equal(tile(wrap, 'f1').children[0].textContent, 'Formula 1', 'F1 is words');
  assert.equal(tile(wrap, 'nfl').getAttribute('aria-label'), 'NFL', 'a mark tile still says its name');
  const my = byClass(wrap, 'lg-mygroups')[0];
  assert.equal(my.textContent, 'My groups');
  assert.equal(my.href, '#/g');
  await settle();
  assert.deepEqual(CALLS, [], 'a signed-out phone asks nothing');
  assert.equal(tiles(wrap).some((b) => b.classList.contains('is-mine')), false);

  await tile(wrap, 'college-football').onclick();
  assert.equal(mem.get('ag.sport'), JSON.stringify('college-football'), 'stored the way store.set stores it');
  assert.equal(loc.hash, '#/g');
  assert.equal(mem.has('ag.group'), false, 'no group chosen');
});

test('signed in: the first paint does not wait, and the tiles say "Your group" once the list lands', async () => {
  globalThis.AG_POOL_ONLY = true;
  signIn();
  let release;
  ANSWER = () => new Promise((r) => { release = () => r(reply([{ id: 'G-NFL', sport: 'nfl' }, { id: 'G-TRK', sport: 'nascar-truck' }])); });
  const M = load();
  const wrap = mk('div');
  M.homeScreen(wrap);
  assert.equal(sportTiles(wrap).length, POOL_SPORTS.length - 1, 'drawn while the request is still out');
  assert.equal(tiles(wrap).some((b) => b.classList.contains('is-mine')), false, 'and nothing claimed yet');
  assert.deepEqual(CALLS, ['/api/group/mine']);

  /* A repaint of the same Home, the way paintScreen does it: emptied, redrawn. */
  wrap.children = [];
  M.homeScreen(wrap);
  assert.deepEqual(CALLS, ['/api/group/mine'], 'one request per mount, not per paint');

  release(); await settle();
  assert.deepEqual(tiles(wrap).filter((b) => b.classList.contains('is-mine')).map((b) => b.dataset.sport),
    ['nfl', 'nascar-truck'], 'the answer is written into the tiles on screen now');
  assert.equal(tile(wrap, 'nfl').getAttribute('aria-label'), 'NFL, your group');
  assert.equal(tile(wrap, 'nba').getAttribute('aria-label'), 'NBA');
});

test('a tap with a group of that sport makes it current and opens its picks', async () => {
  globalThis.AG_POOL_ONLY = true;
  signIn();
  ANSWER = async () => reply([{ id: 'G-NBA', sport: 'nba' }, { id: 'G-NFL', sport: 'nfl' }, { id: 'G-TRK', sport: 'nascar-truck' }]);
  mem.set('ag.group', 'G-NBA');
  const M = load();
  const wrap = mk('div');
  M.homeScreen(wrap);
  await settle();
  await tile(wrap, 'nfl').onclick();
  assert.equal(mem.get('ag.sport'), JSON.stringify('nfl'));
  assert.equal(mem.get('ag.group'), 'G-NFL', 'the NFL group is now the current group');
  assert.equal(loc.hash, '#/gpicks');
  await tile(wrap, 'nascar-truck').onclick();
  assert.equal(mem.get('ag.group'), 'G-TRK', 'a racing group the same way - its pool page shows the race');
  assert.equal(loc.hash, '#/gpicks');
  await tile(wrap, 'f1').onclick();
  assert.equal(mem.get('ag.sport'), JSON.stringify('f1'));
  assert.equal(mem.get('ag.group'), 'G-TRK', 'no F1 group: the current group is left alone');
  assert.equal(loc.hash, '#/g', 'and the group page opens on F1');
});

test('a tap before the list lands waits for it rather than sending a member to the Start form', async () => {
  globalThis.AG_POOL_ONLY = true;
  signIn();
  let release;
  ANSWER = () => new Promise((r) => { release = () => r(reply([{ id: 'G-MLB', sport: 'mlb' }])); });
  const M = load();
  const wrap = mk('div');
  M.homeScreen(wrap);
  const tap = tile(wrap, 'mlb').onclick();
  await settle();
  assert.equal(loc.hash, '#/', 'not yet');
  release(); await tap;
  assert.equal(loc.hash, '#/gpicks');
  assert.equal(mem.get('ag.group'), 'G-MLB');
});

/* ------------------------------------------------------------ POOL_ONLY off */

test('with AG_POOL_ONLY off, Home is exactly what it was: hero, then the step it is on', () => {
  for (const off of [undefined, false]) {
    if (off === undefined) delete globalThis.AG_POOL_ONLY; else globalThis.AG_POOL_ONLY = off;
    const cases = [
      [{ homeStep: 'mode' }, ['hero', 'modeCard']],
      [{ homeStep: 'go' }, ['hero', 'goCard']],
      [{ homeStep: 'sport', mode: 'pool' }, ['hero', 'sportCard']],
      [{ homeStep: 'sport', mode: 'allgames' }, ['hero', 'sportCard', 'marblesCard']]
    ];
    for (const [state, want] of cases) {
      const M = load();
      Object.assign(S, state);
      const wrap = mk('div');
      M.homeScreen(wrap);
      assert.deepEqual(STUBS.calls, want, JSON.stringify({ off, state }));
      assert.equal(tiles(wrap).length, 0, 'no sport chooser');
      assert.equal(CALLS.length, 0, 'and no group request');
    }
  }
  /* And on: the chooser, and none of the doors. */
  globalThis.AG_POOL_ONLY = true;
  const M = load();
  S.homeStep = 'sport'; S.mode = 'allgames';
  M.homeScreen(mk('div'));
  assert.deepEqual(STUBS.calls, ['hero'], 'pool-only draws no door, page 2 or page 3');
});
