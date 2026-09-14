/* HOME STARTS WITH THE SPORTS.
 *
 * Jason, 2026-09-13: "since the front page is only 1 button now, start with the
 * sports." With POOL_ONLY on, Home is the hero and a sport chooser; a tap lands
 * on the group of that sport if you are in one (#/gpicks), else on the group
 * page (#/g), whose Start form opens on the sport just chosen.
 *
 * Then, the same day: "maybe a sports tag on the left and a non-sports tag on the
 * right?" - two tabs - and "we should probably roll up the sports up under the
 * headers" - each family a roll-up, open where you have a group, remembered.
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
/* The real theme helper the league marks go through. */
import { themeMark } from '../public/components/team-chip.js';
/* The real list of what is coming - Home's Coming up rows are read off it (2026-09-13). */
import { upcomingOn, upcomingAt, countdownText } from '../src/lib/upcoming.ts';

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

const PIECES = ['el', 'store', 'HOME_FAMILIES', 'HOME_MARKS', 'HOME_DATED', 'homeLeaguesAt', 'homeDatedCap', 'homeAccordion',
  'homeMarkDark', 'homeSportDest', 'HOME_SHOW_NAMES',
  'HOME_OWN', 'HOME_SPORT_SETS', 'isSportSet', 'homeSetCap', 'homeShowList', 'homeSetList', 'homeSetFamily', 'setTile', 'homeShows', 'showTile', 'homeShowTap', 'HOME_TABS', 'homeSports', 'homePanel',
  /* Coming up, under each tab (2026-09-13) - tests/season-countdown.test.mjs runs it. */
  'homeComingUp', 'homeComingPaint', 'homeComingDate', 'homeComingRefresh', 'homeComingWatch',
  'homeTabNow', 'homeTabTo', 'homeFamilies', 'homeFamily', 'homeOpenMap', 'homeFamWanted', 'homeFamOpen',
  'homeFamToggle', 'leagueTile', 'soloTile', 'mineMark', 'markHomeGroups', 'loadHomeGroups', 'homeSportTap', 'homeScreen'];
const BODY = PIECES.map(lift).join('\n\n');

/* ------------------------------------------------------------ a minimal DOM */

function all(node, out = []) { out.push(node); for (const c of node.children) all(c, out); return out; }
function mk(tag) {
  const node = {
    tagName: String(tag).toLowerCase(), children: [], attrs: {}, dataset: {}, hidden: false,
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
    focus() { node.focused = true; },
    querySelectorAll(sel) { return all(node).slice(1).filter((n) => n.classList.contains(sel.slice(1))); }
  };
  return node;
}
const byClass = (root, c) => all(root).filter((n) => n.classList.contains(c));
const tiles = (root) => byClass(root, 'lg-league');
/* The Sports tab's tiles, and the Non-sports tab's (Awards & TV). */
const sportTiles = (root) => tiles(root).filter((b) => !b.classList.contains('lg-show'));
const showTiles = (root) => byClass(root, 'lg-show');
const tile = (root, id) => sportTiles(root).find((b) => b.dataset.sport === id);
const show = (root, tpl) => showTiles(root).find((b) => b.dataset.template === tpl);
const fam = (root, key) => byClass(root, 'lg-fam').find((f) => f.dataset.fam === key);
/* A one-league family has no roll-up (Jason: "baseball is only mlb so it does not need a
   dropdown") - it is never "open", it is simply there. */
const isOpen = (f) => !!f.rollH && f.rollH.getAttribute('aria-expanded') === 'true';
const openFams = (root) => byClass(root, 'lg-fam').filter(isOpen).map((f) => f.dataset.fam);
const tabsOf = (root) => byClass(root, 'lg-hometab');
const panel = (root, id) => byClass(root, 'lg-homepanel').find((p) => p.dataset.tab === id);
const SEP13 = Date.UTC(2026, 8, 13, 19, 0, 0);   /* the day before the Emmys */
/* The ready sets that are sports and so live on the Sports tab (the Cycling Worlds, the
   Breeders' Cup), read off the shipped screen - never a list restated here. */
const SPORT_SET_IDS = new Function(lift('HOME_SPORT_SETS') + ';return HOME_SPORT_SETS;')().map(([id]) => id);
const dayOf = (ms) => new Date(ms).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const settle = () => new Promise((r) => setTimeout(r, 0));

/* ------------------------------------------------------------ the world */

const mem = new Map();
let STORAGE_OFF = false;     /* a phone whose storage throws - private mode, blocked site data */
const guard = () => { if (STORAGE_OFF) throw new Error('SecurityError'); };
globalThis.localStorage = {
  getItem: (k) => { guard(); return mem.has(k) ? mem.get(k) : null; },
  setItem: (k, v) => { guard(); mem.set(k, String(v)); },
  removeItem: (k) => { guard(); mem.delete(k); }
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
    templatesOpen, PROP_TEMPLATES, themeMark,
    /* Coming up reads the real list of what is coming (2026-09-13). */
    upcomingOn, upcomingAt, upcomingCountdown: countdownText,
    heroBlock: stub('hero'), modeCard: stub('modeCard'), sportCard: stub('sportCard'),
    goCard: stub('goCard'), marblesCard: stub('marblesCard')
  };
  const names = Object.keys(deps);
  return new Function(...names, BODY + '\nreturn { ' + PIECES.join(', ') + ' };')(...names.map((n) => deps[n]));
}

beforeEach(() => {
  STORAGE_OFF = false;
  mem.clear(); CALLS = []; ANSWER = async () => reply([]);
  GROUP.forgetGroups();
  delete globalThis.AG_POOL_ONLY;
});

/* ------------------------------------------------------------ the families */

test('the families, in Jason\'s order, carry every POOL_SPORTS id exactly once', () => {
  const { HOME_FAMILIES } = load();
  assert.deepEqual(HOME_FAMILIES.map((f) => f.h),
    ['Football', 'Basketball', 'Volleyball', 'Baseball', 'Hockey', 'Racing', 'Soccer', 'Combat', 'Cricket', 'Golf']);
  assert.deepEqual(HOME_FAMILIES.map((f) => f.leagues), [
    /* The NCAA last in every family - Jason, 2026-09-13: "put the ncaa logo last in the list".
       Big Game squares (2026-09-13) between the two shields. */
    [['nfl', 'NFL'], ['squares', 'Big Game squares'], ['college-football', 'College football']],
    /* The NCAA shields carry a caption each - Men, Women (2026-09-13). */
    [['nba', 'NBA'], ['wnba', 'WNBA'], ['mens-college-basketball', 'College basketball', 'Men'],
      ['womens-college-basketball', 'Women’s college basketball', 'Women']],
    /* Women's college volleyball, 2026-09-13 - one league, a solo row after basketball. */
    [['womens-college-volleyball', 'Women’s college volleyball']],
    [['mlb', 'MLB']],
    [['nhl', 'NHL'], ['mens-college-hockey', 'College hockey', 'Men']],
    /* The three NASCAR series share the drawn flag, a caption each. */
    [['f1', 'Formula 1'], ['nascar', 'NASCAR Cup', 'Cup'], ['nascar-oreilly', "NASCAR O'Reilly", 'O’Reilly'],
      ['nascar-truck', 'NASCAR Trucks', 'Trucks']],
    /* The NWSL (2026-09-13) last in Soccer, as in POOL_SPORTS. */
    [['epl', 'Premier League'], ['mls', 'MLS'], ['ucl', 'Champions League'], ['laliga', 'La Liga'], ['ligamx', 'Liga MX'],
      ['nwsl', 'NWSL']],
    /* UFC and cricket, 2026-09-13 - day sports graded by ESPN's winner flag. */
    [['ufc', 'UFC']],
    [['cricket', 'Cricket']],
    /* The Presidents Cup, 2026-09-13 - team match play, after Cricket. */
    [['golf-cup', 'Presidents Cup']]
  ]);
  const ids = HOME_FAMILIES.flatMap((f) => f.leagues.map(([id]) => id));
  assert.equal(new Set(ids).size, ids.length, 'no sport twice');
  /* Every pool sport but questions, which is the Non-sports tab (2026-09-13). */
  assert.deepEqual([...ids, 'props'].sort(), [...POOL_SPORTS].sort(), 'every pool sport and nothing else');
});

/* ------------------------------------------------------------ Awards & TV
 * Jason, 2026-09-13: "now we need the front page to separate sports and
 * non-sports". The tiles are src/lib/props.ts's own ready sets, open ones only. */

test('Awards & TV: each open ready set, soonest first, dated by its broadcast, then Your own questions', () => {
  const { homeShowList } = load();
  const on13 = homeShowList(SEP13);
  assert.deepEqual(on13.map((s) => s.id), ['emmys-2026', 'dwts-35', 'traitors-new-blood', 'survivor-51', 'big-brother-28', ''], 'five sets are open on the 13th');
  assert.deepEqual(on13.map((s) => s.label), ['The Emmys', 'Dancing with the Stars', 'The Traitors', 'Survivor 51', 'Big Brother', 'Your own questions']);
  /* The Emmys lock 2026-09-15T00:00Z, Dancing with the Stars 2026-09-16T00:00Z, The Traitors
     2026-09-18T00:00Z, Survivor 51 2026-09-24T00:00Z. */
  assert.equal(on13[0].cap, dayOf(PROP_TEMPLATES['emmys-2026'].questions[0].lockAt));
  assert.equal(on13[1].cap, dayOf(PROP_TEMPLATES['dwts-35'].questions[0].lockAt));
  assert.equal(on13[2].cap, dayOf(PROP_TEMPLATES['traitors-new-blood'].questions[0].lockAt));
  assert.equal(on13[3].cap, dayOf(PROP_TEMPLATES['survivor-51'].questions[0].lockAt));
  if (new Date(SEP13).getTimezoneOffset() > 0) {
    assert.equal(on13[0].cap, 'Mon, Sep 14', 'in the Americas the Emmys read as Monday the 14th');
    assert.equal(on13[1].cap, 'Tue, Sep 15', 'and the premiere as Tuesday the 15th');
    assert.equal(on13[2].cap, 'Thu, Sep 17');
    assert.equal(on13[3].cap, 'Wed, Sep 23');
  }
  /* The Big Brother finale locks 2026-10-02T00:00Z - Thursday the 1st in the Americas. */
  assert.equal(on13[4].cap, dayOf(PROP_TEMPLATES['big-brother-28'].questions[0].lockAt));
  assert.match(on13[5].cap, /Oscars/);
  /* Each set leaves the list as it locks; after all of them, only your own. */
  assert.deepEqual(homeShowList(Date.UTC(2026, 8, 15, 0, 0, 1)).map((s) => s.id), ['dwts-35', 'traitors-new-blood', 'survivor-51', 'big-brother-28', '']);
  assert.deepEqual(homeShowList(Date.UTC(2026, 8, 16, 0, 0, 1)).map((s) => s.id), ['traitors-new-blood', 'survivor-51', 'big-brother-28', '']);
  assert.deepEqual(homeShowList(Date.UTC(2026, 8, 25)).map((s) => s.id), ['big-brother-28', '']);
  assert.deepEqual(homeShowList(Date.UTC(2026, 9, 3)).map((s) => s.id), ['']);
  /* The same list src/lib/props.ts offers a commissioner - less the Cycling Worlds, a
     sport, which are on the Sports tab (2026-09-13, "do the cycling worlds next"). */
  assert.ok(templatesOpen(SEP13).some((t) => t.id === 'worlds-2026'), 'the server offers the Worlds on the 13th');
  assert.deepEqual(on13.filter((s) => s.id).map((s) => s.id),
    templatesOpen(SEP13).map((t) => t.id).filter((id) => !SPORT_SET_IDS.includes(id)));
});

test('Awards & TV layout: two across, and Your own questions fills an odd row or takes its own', () => {
  const { homeShows } = load();
  /* Five sets on the 13th (odd): Your own questions fills the last pair - six, three rows of two. */
  const three = homeShows(SEP13);
  assert.deepEqual(byClass(three, 'lg-fam-row').map((r) => [r.className, r.children.length]),
    [['lg-fam-row n2', 6]]);
  /* Four after the Emmys (even): Your own questions takes its own row. */
  const two = homeShows(Date.UTC(2026, 8, 15, 1));
  assert.deepEqual(byClass(two, 'lg-fam-row').map((r) => [r.className, r.children.length]), [['lg-fam-row n2', 4], ['lg-fam-row n1', 1]]);
  /* Three after Dancing with the Stars locks (odd): it fills the last pair again - four, two rows of two. */
  const one = homeShows(Date.UTC(2026, 8, 16));
  assert.deepEqual(byClass(one, 'lg-fam-row').map((r) => [r.className, r.children.length]),
    [['lg-fam-row n2', 4]]);
  assert.deepEqual(showTiles(one).map((b) => b.dataset.template), ['traitors-new-blood', 'survivor-51', 'big-brother-28', '']);
  /* After the Big Brother finale locks (Oct 1, 8 PM ET) no set is open. */
  const none = homeShows(Date.UTC(2026, 9, 3));
  assert.deepEqual(byClass(none, 'lg-fam-row').map((r) => [r.className, r.children.length]), [['lg-fam-row n1', 1]]);
  for (const b of showTiles(three)) assert.equal(b.dataset.sport, 'props', 'every Awards & TV tile is a questions group');
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
    assert.equal(loc.hash, '#/props', 'signed out: the questions pool itself - pool first');
  }
  await show(wrap, '').onclick();
  assert.equal(mem.get('ag.propsTemplate'), JSON.stringify(''), 'your own questions forgets any set');
  assert.equal(loc.hash, '#/props');

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

/* 🔴 EVERY MARK FROM OUR ORIGIN (2026-09-13, "are we not capturing the rest of
 * the logos?"). The NBA's was hot-linked and every league after it was words. */
test('every league with a mark shows it from our origin, light and dark; only cricket and the Presidents Cup are words', () => {
  const { HOME_MARKS, HOME_FAMILIES, homeMarkDark } = load();
  const ids = HOME_FAMILIES.flatMap((f) => f.leagues.map(([id]) => id));
  /* Racing and combat carry marks since Jason asked (2026-09-13: "racing logos?"): F1's
     and UFC's own, NASCAR our drawn flag. Cricket: ESPN's marks are per competition. The
     Presidents Cup (2026-09-13) has no mark: a text tile, the way Cricket's is. Big Game
     squares carries our own drawn squares grid ("do the big game squares on the home tile
     next") - never the NFL's mark, which the game's is. */
  assert.deepEqual(ids.filter((id) => !HOME_MARKS[id]).sort(), ['cricket', 'golf-cup']);
  assert.equal(HOME_MARKS.squares, '/logos/leagues/squares-500.svg', 'our drawn grid');
  for (const [id, src] of Object.entries(HOME_MARKS)) {
    assert.match(src, /^\/logos\/leagues\/[a-z0-9]+-500\.(png|svg)$/, id);
    assert.ok(existsSync(new URL('../public' + src, import.meta.url)), src + ' is on disk');
    assert.ok(existsSync(new URL('../public' + homeMarkDark(src), import.meta.url)), homeMarkDark(src) + ' is on disk');
  }
  assert.equal(HOME_MARKS.nba, '/logos/leagues/nba-500.png', 'the NBA from our origin now, not ESPN');
  assert.equal(HOME_MARKS['womens-college-basketball'], HOME_MARKS['mens-college-basketball'], 'the same NCAA shield');
  assert.equal(HOME_MARKS['mens-college-hockey'], HOME_MARKS['mens-college-basketball'], 'college hockey too');
});

/* ------------------------------------------------------------ Cycling Worlds
 * Jason, 2026-09-13: "do the cycling worlds next". A ready questions set
 * (src/lib/props.ts worlds-2026) that is a SPORT: a Cycling family on the Sports tab,
 * one row, never a Non-sports tile - there while the set is open, gone once it locks. */

test('Cycling Worlds: a one-row Cycling family on the Sports tab on Sept 13, gone on Sept 28, and never a Non-sports tile', async () => {
  const M = load();
  const SEP28 = Date.UTC(2026, 8, 28);
  const worlds = PROP_TEMPLATES['worlds-2026'];
  assert.equal(worlds.name, 'Cycling Worlds 2026');
  const lastLock = Math.max(...worlds.questions.map((q) => q.lockAt));
  assert.ok(lastLock < SEP28 && lastLock > SEP13, 'the set locks between the two clocks');

  const on13 = M.homeSetList(SEP13);
  /* The Worlds' family; the Breeders' Cup joins it on the tab once a routine adds its set. */
  assert.deepEqual(on13.filter((s) => s.id === 'worlds-2026').map((s) => [s.id, s.h, s.label]), [['worlds-2026', 'Cycling', 'Cycling Worlds']]);
  assert.deepEqual(SPORT_SET_IDS, ['worlds-2026', 'breeders-cup-2026']);
  assert.equal(on13[0].cap, dayOf(Math.min(...worlds.questions.map((q) => q.lockAt))), 'dated by its first race');
  assert.ok(!M.homeShowList(SEP13).some((s) => s.id === 'worlds-2026'), 'not in the Non-sports list');

  const fams = M.homeFamilies(SEP13);
  assert.deepEqual(fams.children.map((f) => f.dataset.fam).slice(-2), ['golf', 'cycling'], 'Cycling after Golf');
  const cyc = fams.children[fams.children.length - 1];
  assert.equal(cyc.children.length, 1, 'one row');
  const b = cyc.soloRow;
  assert.equal(cyc.children[0], b);
  assert.ok(b.classList.contains('lg-league') && b.classList.contains('lg-fam-solo'));
  assert.equal(b.classList.contains('lg-show'), false, 'a Sports row, not a show tile');
  assert.deepEqual([b.tagName, b.dataset.sport, b.dataset.template], ['button', 'props', 'worlds-2026']);
  assert.equal(byClass(b, 'lg-fam-t')[0].textContent, 'Cycling');
  assert.equal(byClass(b, 'lg-league-n')[0].textContent, 'Cycling Worlds');
  assert.equal(byClass(b, 'lg-show-c')[0].textContent, on13[0].cap);
  assert.equal(byClass(cyc, 'lg-chev').length, 0, 'nothing opens');
  assert.equal(b.getAttribute('aria-label'), 'Cycling Worlds, ' + on13[0].cap);

  /* Gone once its last question has locked, as a show tile goes. */
  assert.deepEqual(M.homeSetList(SEP28), []);
  assert.ok(!M.homeFamilies(SEP28).children.some((f) => f.dataset.fam === 'cycling'));
  assert.ok(!M.homeShowList(SEP28).some((s) => s.id === 'worlds-2026'));

  /* The tap is a show tile's: the set remembered, then the questions flow. */
  await b.onclick();
  assert.equal(mem.get('ag.propsTemplate'), JSON.stringify('worlds-2026'));
  assert.equal(mem.get('ag.sport'), JSON.stringify('props'));
  assert.equal(loc.hash, '#/props', 'signed out: the questions pool itself - pool first');
});

/* ------------------------------------------------------------ where a tap goes */

/* 🔴 POOL FIRST (Jason, 2026-09-13): with no group of that sport the tap lands on the
   pool itself - football's public slate, a race's picks, the questions, the squares
   grid, and #/pool for every day sport - never on the group page's forms. */
test('homeSportDest: a group of that sport -> #/gpicks; none -> that sport\'s pool, never #/g', () => {
  const { homeSportDest: d } = load();
  const G = [{ id: 'A', sport: 'nfl' }, { id: 'B', sport: 'nba' }, { id: 'C', sport: 'nfl' },
             { id: 'OLD', sport: null }, { id: 'R', sport: 'nascar-truck' }, { id: 'U', sport: 'ufc' }];
  assert.deepEqual(d('nfl', [], ''), { sport: 'nfl', groupId: '', hash: '#/slate' }, 'no groups: the NFL slate');
  assert.deepEqual(d('nfl', undefined, ''), { sport: 'nfl', groupId: '', hash: '#/slate' }, 'not loaded');
  assert.deepEqual(d('college-football', [], ''), { sport: 'college-football', groupId: '', hash: '#/slate' });
  assert.deepEqual(d('mlb', G, 'A'), { sport: 'mlb', groupId: '', hash: '#/pool' }, 'groups, none of that sport: its pool');
  for (const [s, h] of [['f1', '#/f1'], ['nascar', '#/nascar'], ['nascar-oreilly', '#/nascar-oreilly'], ['nascar-truck', '#/nascar-truck'],
    ['props', '#/props'], ['squares', '#/squares'], ['nba', '#/pool'], ['epl', '#/pool'], ['golf-cup', '#/pool']]) {
    assert.deepEqual(d(s, [], ''), { sport: s, groupId: '', hash: h }, s);
  }
  assert.deepEqual(d('squares', [{ id: 'SQ', sport: 'squares' }], ''), { sport: 'squares', groupId: 'SQ', hash: '#/squares' },
    'a squares group\'s pool is its grid');
  assert.deepEqual(d('nfl', G, ''), { sport: 'nfl', groupId: 'A', hash: '#/gpicks' }, 'the first of that sport');
  assert.equal(d('nfl', G, 'C').groupId, 'C', 'the current group wins when it is of that sport');
  assert.equal(d('nfl', G, 'B').groupId, 'A', 'a current group of another sport does not');
  assert.equal(d('college-football', G, '').groupId, 'OLD', 'a row from before the sport column is college football');
  assert.deepEqual(d('nascar-truck', G, ''), { sport: 'nascar-truck', groupId: 'R', hash: '#/gpicks' }, 'a racing group');
  assert.deepEqual(d('ufc', G, ''), { sport: 'ufc', groupId: 'U', hash: '#/gpicks' }, 'a UFC group');
  assert.deepEqual(d('cricket', G, ''), { sport: 'cricket', groupId: '', hash: '#/pool' }, 'no cricket group');
});

/* ------------------------------------------------------------ the chooser */

test('signed out: two tabs, every family rolled up with its marks small, no request, a tap goes to that sport\'s pool', async () => {
  globalThis.AG_POOL_ONLY = true;
  const M = load();
  const wrap = mk('div');
  M.homeScreen(wrap);
  assert.deepEqual(wrap.children.map((n) => n.stub || n.className), ['hero', 'lg-sports']);
  assert.deepEqual(wrap.children[1].children.map((n) => n.className),
    ['lg-hometabs', 'lg-homepanel', 'lg-homepanel', 'lg-mygroups']);
  /* The tabs: a real tablist, Sports on the left and chosen. */
  const bar = byClass(wrap, 'lg-hometabs')[0];
  assert.equal(bar.getAttribute('role'), 'tablist');
  const tb = tabsOf(wrap);
  assert.deepEqual(tb.map((t) => t.textContent), ['Sports', 'Non-sports']);
  assert.deepEqual(tb.map((t) => [t.tagName, t.type, t.getAttribute('role'), t.getAttribute('aria-selected')]),
    [['button', 'button', 'tab', 'true'], ['button', 'button', 'tab', 'false']]);
  assert.deepEqual(tb.map((t) => t.getAttribute('aria-controls')), ['lg-panel-sports', 'lg-panel-nonsports']);
  assert.deepEqual([panel(wrap, 'sports').hidden, panel(wrap, 'nonsports').hidden], [false, true]);
  assert.equal(panel(wrap, 'sports').getAttribute('role'), 'tabpanel');
  assert.equal(panel(wrap, 'sports').getAttribute('aria-labelledby'), 'lg-tab-sports');

  /* Then, while it is open, the ready set that is a sport - the Cycling Worlds, a questions group. */
  /* A dated league (Big Game squares) is there until a day after its game. */
  assert.deepEqual(sportTiles(wrap).map((b) => b.dataset.sport),
    [...M.HOME_FAMILIES.flatMap((f) => M.homeLeaguesAt(f, Date.now()).map(([id]) => id)), ...M.homeSetList(Date.now()).map(() => 'props')],
    'every sport, in order');
  assert.equal(byClass(panel(wrap, 'sports'), 'lg-league').length, sportTiles(wrap).length, 'all on the Sports tab');
  assert.deepEqual(showTiles(wrap).map((b) => b.dataset.template),
    [...templatesOpen(Date.now()).map((t) => t.id).filter((id) => !SPORT_SET_IDS.includes(id)), ''],
    'the open sets, then your own - never the Worlds, which are a sport');
  assert.equal(byClass(panel(wrap, 'nonsports'), 'lg-show').length, showTiles(wrap).length, 'all on the Non-sports tab');

  /* The roll-ups: the header is the button, and it names the panel it opens. */
  const heads = byClass(wrap, 'lg-fam-h');
  assert.deepEqual(heads.map((h) => h.textContent),
    ['Football', 'Basketball', 'Hockey', 'Racing', 'Soccer'], 'only a family with more than one league rolls up');
  const rolls = byClass(wrap, 'lg-fam').filter((f) => f.rollH);
  for (const f of rolls) {
    assert.equal(f.rollH.tagName, 'button');
    assert.equal(f.rollH.type, 'button');
    assert.equal(f.rollH.getAttribute('aria-controls'), f.rollRow.id, f.dataset.fam + ' controls its tiles');
    assert.equal(f.rollRow.getAttribute('aria-labelledby'), f.rollH.id);
  }
  /* 🔴 One league, ONE ROW (Jason, 2026-09-13: "baseball should only be 1 line, right?"):
     no heading over a tile. The family's name on the left, the league's mark on the right
     where a roll-up shows its marks, no chevron - and the row is the league's own button. */
  const solos = byClass(wrap, 'lg-fam').filter((f) => !f.rollH);
  /* Then Cycling while the Worlds are open - a ready set that is a sport (2026-09-13). */
  assert.deepEqual(solos.map((f) => f.dataset.fam),
    ['volleyball', 'baseball', 'combat', 'cricket', 'golf', ...M.homeSetList(Date.now()).map((s) => s.h.toLowerCase())]);
  for (const f of solos) {
    assert.equal(f.children.length, 1, f.dataset.fam + ' is one row, not a heading and a tile');
    const b = f.children[0];
    assert.equal(f.soloRow, b);
    assert.deepEqual([b.tagName, b.type, b.hidden], ['button', 'button', false]);
    assert.ok(b.classList.contains('lg-league') && b.classList.contains('lg-fam-solo'), 'the row is the tile');
    assert.equal(byClass(b, 'lg-fam-t')[0].textContent,
      { volleyball: 'Volleyball', baseball: 'Baseball', combat: 'Combat', cricket: 'Cricket', golf: 'Golf', cycling: 'Cycling' }[f.dataset.fam], 'the name on the left');
    assert.equal(byClass(f, 'lg-fam-solo-h').length, 0, 'no separate heading');
    assert.equal(byClass(f, 'lg-fam-row').length, 0, 'no row of tiles under it');
    assert.equal(byClass(f, 'lg-league').length, 1);
    assert.equal(byClass(f, 'lg-chev').length, 0, 'no chevron where nothing opens');
  }
  /* On the right: the mark, or with none, the league's name - unless it only repeats the family's. */
  const rightOf = (id) => byClass(tile(wrap, id), 'lg-fam-mark').map((m) => m.src)
    .concat(byClass(tile(wrap, id), 'lg-league-n').map((n) => n.textContent));
  assert.deepEqual(rightOf('mlb'), ['/logos/leagues/mlb-500.png'], 'the MLB mark on the right');
  assert.deepEqual(rightOf('ufc'), ['/logos/leagues/ufc-500.png'], 'the UFC mark on the right');
  assert.deepEqual(rightOf('cricket'), [], '"Cricket" twice would say nothing');
  assert.deepEqual(rightOf('golf-cup'), ['Presidents Cup'], 'no mark: the league in the tile\'s words');
  assert.equal(byClass(tile(wrap, 'mlb'), 'lg-fam-marks')[0].getAttribute('aria-hidden'), 'true');
  assert.equal(tile(wrap, 'mlb').getAttribute('aria-label'), 'MLB', 'the row is named for its league, as the tile was');
  /* Football is three across while Big Game squares is on it, two after. */
  const football = M.homeLeaguesAt(M.HOME_FAMILIES[0], Date.now()).length;
  assert.deepEqual(byClass(panel(wrap, 'sports'), 'lg-fam-row').map((r) => r.className),
    ['lg-fam-row n' + football, 'lg-fam-row n2', 'lg-fam-row n2', 'lg-fam-row n2', 'lg-fam-row n2'],
    'two or three across - and a one-league family has no row of tiles at all');
  /* No group, no storage: every roll-up starts collapsed, marks showing. */
  assert.deepEqual(openFams(wrap), []);
  assert.ok(rolls.every((f) => f.rollRow.hidden === true && f.rollMarks.hidden === false
    && f.rollH.getAttribute('aria-expanded') === 'false'));
  const L = (n) => '/logos/leagues/' + n + '-500.png';
  assert.deepEqual(rolls.map((f) => [f.dataset.fam, byClass(f.rollMarks, 'lg-fam-mark').map((m) => m.src)]), [
    /* Big Game squares' own drawn grid sits between the NFL and the NCAA. */
    ['football', [L('nfl'), '/logos/leagues/squares-500.svg', L('ncaa')]],
    ['basketball', [L('nba'), L('wnba'), L('ncaa')]],
    ['hockey', [L('nhl'), L('ncaa')]],
    ['racing', [L('f1'), '/logos/leagues/nascar-500.svg']],
    /* The NWSL's mark last, as its tile is (2026-09-13). */
    ['soccer', [L('epl'), L('mls'), L('ucl'), L('laliga'), L('ligamx'), L('nwsl')]]
  ], 'each mark once, small, in the collapsed header - the NCAA last');
  assert.equal(fam(wrap, 'soccer').rollMarks.getAttribute('aria-hidden'), 'true', 'the name is the label, not the marks');
  for (const m of byClass(wrap, 'lg-fam-mark')) assert.equal(m.dataset.logoDark, m.src.replace(/-500\.(png|svg)$/, '-500-dark.$1'));

  /* The tiles. */
  assert.equal(tile(wrap, 'womens-college-basketball').children[0].tagName, 'img');
  assert.equal(byClass(tile(wrap, 'womens-college-basketball'), 'lg-league-c')[0].textContent, 'Women');
  assert.equal(byClass(tile(wrap, 'mens-college-basketball'), 'lg-league-c')[0].textContent, 'Men');
  assert.equal(tile(wrap, 'womens-college-basketball').getAttribute('aria-label'), 'Women’s college basketball');
  assert.equal(tile(wrap, 'mens-college-hockey').children[0].tagName, 'img', 'college hockey is the NCAA shield');
  assert.equal(byClass(tile(wrap, 'mens-college-hockey'), 'lg-league-c')[0].textContent, 'Men');
  assert.equal(tile(wrap, 'mens-college-hockey').getAttribute('aria-label'), 'College hockey');
  /* MLB is a one-league row now - its mark is checked with the solos above. */
  for (const id of ['nba', 'wnba', 'nhl', 'epl', 'mls', 'ucl', 'laliga', 'ligamx']) {
    const img = tile(wrap, id).children[0];
    assert.equal(img.tagName, 'img', id + ' is its mark');
    assert.equal(img.src, '/logos/leagues/' + id + '-500.png');
    assert.equal(img.dataset.logoDark, '/logos/leagues/' + id + '-500-dark.png');
  }
  assert.equal(tile(wrap, 'nfl').children[0].tagName, 'img', 'NFL is its shield');
  /* UFC is a one-league row now - its mark is checked with the solos above. */
  assert.equal(tile(wrap, 'f1').children[0].tagName, 'img', 'f1 is its mark');
  assert.equal(tile(wrap, 'f1').children[0].src, '/logos/leagues/f1-500.png');
  for (const [id, cap] of [['nascar', 'Cup'], ['nascar-oreilly', 'O’Reilly'], ['nascar-truck', 'Trucks']]) {
    assert.equal(tile(wrap, id).children[0].src, '/logos/leagues/nascar-500.svg', id + ' is the drawn flag');
    assert.equal(byClass(tile(wrap, id), 'lg-league-c')[0].textContent, cap, 'a caption tells the three flags apart');
  }
  assert.equal(byClass(tile(wrap, 'cricket'), 'lg-league-logo').length + byClass(tile(wrap, 'cricket'), 'lg-fam-mark').length, 0,
    'cricket is words');
  assert.equal(tile(wrap, 'cricket').textContent, 'CricketYour group', 'its one row: the name, and the Your group label it can show');
  assert.equal(tile(wrap, 'nfl').getAttribute('aria-label'), 'NFL', 'a mark tile still says its name');
  const my = byClass(wrap, 'lg-mygroups')[0];
  assert.equal(my.textContent, 'My groups');
  assert.equal(my.href, '#/g');
  await settle();
  assert.deepEqual(CALLS, [], 'a signed-out phone asks nothing');
  assert.equal(tiles(wrap).some((b) => b.classList.contains('is-mine')), false);
  assert.deepEqual(openFams(wrap), [], 'still all collapsed');

  await tile(wrap, 'college-football').onclick();
  assert.equal(mem.get('ag.sport'), JSON.stringify('college-football'), 'stored the way store.set stores it');
  assert.equal(loc.hash, '#/slate', 'pool first: the college slate, not the group page');
  assert.equal(mem.has('ag.group'), false, 'no group chosen');
  await tile(wrap, 'ufc').onclick();
  assert.equal(mem.get('ag.sport'), JSON.stringify('ufc'));
  assert.equal(loc.hash, '#/pool', 'a day sport\'s pool');
});

test('signed in: the first paint does not wait; once the list lands the tiles say "Your group" and their families open', async () => {
  globalThis.AG_POOL_ONLY = true;
  signIn();
  let release;
  ANSWER = () => new Promise((r) => { release = () => r(reply([{ id: 'G-NFL', sport: 'nfl' }, { id: 'G-TRK', sport: 'nascar-truck' }])); });
  const M = load();
  const wrap = mk('div');
  M.homeScreen(wrap);
  /* Every pool sport but questions, less a dated league whose day has passed, plus a sport set. */
  const gone = M.HOME_FAMILIES.reduce((n, f) => n + f.leagues.length - M.homeLeaguesAt(f, Date.now()).length, 0);
  assert.equal(sportTiles(wrap).length, POOL_SPORTS.length - 1 - gone + M.homeSetList(Date.now()).length, 'drawn while the request is still out');
  assert.equal(tiles(wrap).some((b) => b.classList.contains('is-mine')), false, 'and nothing claimed yet');
  assert.deepEqual(openFams(wrap), [], 'and nothing opened yet');
  assert.deepEqual(CALLS, ['/api/group/mine']);

  /* A repaint of the same Home, the way paintScreen does it: emptied, redrawn. */
  wrap.children = [];
  M.homeScreen(wrap);
  assert.deepEqual(CALLS, ['/api/group/mine'], 'one request per mount, not per paint');

  release(); await settle();
  assert.deepEqual(tiles(wrap).filter((b) => b.classList.contains('is-mine')).map((b) => b.dataset.sport),
    ['nfl', 'nascar-truck'], 'the answer is written into the tiles on screen now');
  /* 🔴 ONE family opens, not every one with a group (2026-09-13, the accordion): the
     first in Home order that holds a group of yours. */
  assert.deepEqual(openFams(wrap), ['football'], 'the first family with a group opens - one, never two');
  assert.equal(fam(wrap, 'football').rollMarks.hidden, true, 'an open family drops its small marks');
  assert.equal(fam(wrap, 'racing').rollH.getAttribute('aria-expanded'), 'false', 'racing has a group too, and stays closed');
  assert.equal(tile(wrap, 'nfl').getAttribute('aria-label'), 'NFL, your group');
  assert.equal(tile(wrap, 'nba').getAttribute('aria-label'), 'NBA');
  assert.equal(mem.has('ag.homeOpen'), false, 'opened by the group, not a remembered choice');

  /* A later mount draws from the loaded list: open on the first paint. */
  const w2 = mk('div');
  M.homeScreen(w2);
  assert.deepEqual(openFams(w2), ['football']);
});

/* 🔴 AN ACCORDION. Jason, 2026-09-13: "if you open a new drop down close any other open". */
test('the roll-ups are an accordion: opening B closes A, closing the open one leaves none, and the one open is remembered', () => {
  globalThis.AG_POOL_ONLY = true;
  const M = load();
  const wrap = mk('div');
  M.homeScreen(wrap);
  const hk = fam(wrap, 'hockey');
  const sc = fam(wrap, 'soccer');
  hk.rollH.onclick();
  assert.equal(isOpen(hk), true);
  assert.deepEqual([hk.rollRow.hidden, hk.rollMarks.hidden, hk.classList.contains('is-open')], [false, true, true]);
  assert.equal(mem.get('ag.homeOpen'), JSON.stringify('hockey'));
  sc.rollH.onclick();
  assert.deepEqual(openFams(wrap), ['soccer'], 'opening soccer closed hockey');
  assert.deepEqual([hk.rollRow.hidden, hk.rollMarks.hidden, hk.classList.contains('is-open')], [true, false, false]);
  assert.equal(mem.get('ag.homeOpen'), JSON.stringify('soccer'));
  sc.rollH.onclick();
  assert.deepEqual(openFams(wrap), [], 'closing the open one leaves none');
  assert.equal(mem.get('ag.homeOpen'), JSON.stringify(''));
  hk.rollH.onclick();
  /* Every header says what it is. */
  for (const f of byClass(wrap, 'lg-fam').filter((x) => x.rollH)) {
    assert.equal(f.rollH.getAttribute('aria-expanded'), f.dataset.fam === 'hockey' ? 'true' : 'false', f.dataset.fam);
    assert.equal(f.rollRow.hidden, f.dataset.fam !== 'hockey');
  }

  /* A fresh visit reads the one back. */
  const w2 = mk('div');
  load().homeScreen(w2);
  assert.deepEqual(openFams(w2), ['hockey']);
});

test('a remembered choice wins over a group: none stays none, one stays that one; an old map keeps its first open family', async () => {
  globalThis.AG_POOL_ONLY = true;
  signIn();
  ANSWER = async () => reply([{ id: 'G-NFL', sport: 'nfl' }, { id: 'G-NHL', sport: 'nhl' }, { id: 'G-MLB', sport: 'mlb' }]);
  const draw = async () => { GROUP.forgetGroups(); const M = load(); const w = mk('div'); M.homeScreen(w); await settle(); return w; };

  mem.set('ag.homeOpen', JSON.stringify(''));
  let wrap = await draw();
  assert.equal(tile(wrap, 'nfl').classList.contains('is-mine'), true);
  assert.deepEqual(openFams(wrap), [], 'all closed was chosen: no family opens for a group');
  /* Baseball is one league - no roll-up to open; its one row is simply there, marked. */
  assert.equal(fam(wrap, 'baseball').soloRow.hidden, false);
  assert.equal(tile(wrap, 'mlb').classList.contains('is-mine'), true);

  mem.set('ag.homeOpen', JSON.stringify('soccer'));
  assert.deepEqual(openFams(await draw()), ['soccer'], 'the remembered one, not the families with groups');

  /* The map an older build stored: its first open family, or none. */
  mem.set('ag.homeOpen', JSON.stringify({ football: false, hockey: true, soccer: true }));
  assert.deepEqual(openFams(await draw()), ['hockey']);
  mem.set('ag.homeOpen', JSON.stringify({ football: false }));
  assert.deepEqual(openFams(await draw()), [], 'a map with nothing open is none');
  for (const f of byClass(wrap, 'lg-fam').filter((x) => x.rollH)) assert.ok(['true', 'false'].includes(f.rollH.getAttribute('aria-expanded')));
});

test('the tabs: Sports by default, a tap or an arrow key switches, and the choice is remembered', () => {
  globalThis.AG_POOL_ONLY = true;
  const M = load();
  const wrap = mk('div');
  M.homeScreen(wrap);
  const [sp, np] = tabsOf(wrap);
  np.onclick();
  assert.deepEqual(tabsOf(wrap).map((t) => t.getAttribute('aria-selected')), ['false', 'true']);
  assert.deepEqual(tabsOf(wrap).map((t) => t.tabIndex), [-1, 0], 'only the chosen tab is in the tab order');
  assert.deepEqual([panel(wrap, 'sports').hidden, panel(wrap, 'nonsports').hidden], [true, false]);
  assert.equal(np.classList.contains('is-on'), true);
  assert.equal(mem.get('ag.homeTab'), JSON.stringify('nonsports'));

  np.onkeydown({ key: 'ArrowLeft', preventDefault() {} });
  assert.deepEqual(tabsOf(wrap).map((t) => t.getAttribute('aria-selected')), ['true', 'false'], 'an arrow key moves');
  assert.equal(sp.focused, true, 'and focus goes with it');
  assert.equal(mem.get('ag.homeTab'), JSON.stringify('sports'));
  sp.onkeydown({ key: 'Enter', preventDefault() {} });
  assert.deepEqual(tabsOf(wrap).map((t) => t.getAttribute('aria-selected')), ['true', 'false'], 'another key does nothing');

  mem.set('ag.homeTab', JSON.stringify('nonsports'));
  const w2 = mk('div');
  load().homeScreen(w2);
  assert.deepEqual([panel(w2, 'sports').hidden, panel(w2, 'nonsports').hidden], [true, false], 'remembered');
  mem.set('ag.homeTab', JSON.stringify('bogus'));
  const w3 = mk('div');
  load().homeScreen(w3);
  assert.deepEqual([panel(w3, 'sports').hidden, panel(w3, 'nonsports').hidden], [false, true], 'anything else is Sports');
});

test('no storage: Sports and all collapsed, and a choice still survives a repaint', () => {
  globalThis.AG_POOL_ONLY = true;
  STORAGE_OFF = true;
  const M = load();
  const wrap = mk('div');
  M.homeScreen(wrap);
  assert.deepEqual([panel(wrap, 'sports').hidden, panel(wrap, 'nonsports').hidden], [false, true]);
  assert.deepEqual(openFams(wrap), []);
  fam(wrap, 'soccer').rollH.onclick();
  tabsOf(wrap)[1].onclick();
  wrap.children = [];
  M.homeScreen(wrap);
  assert.deepEqual(openFams(wrap), ['soccer'], 'the family, in memory');
  assert.equal(panel(wrap, 'nonsports').hidden, false, 'and the tab');
  STORAGE_OFF = false;
  assert.equal(mem.size, 0, 'nothing was written');
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
  assert.equal(loc.hash, '#/f1', 'and F1\'s own picks open - pool first');
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
