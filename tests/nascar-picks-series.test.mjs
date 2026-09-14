/* NASCAR RACE DAY, ALL THREE NATIONAL SERIES - public/screens/nascar-picks.screen.js.
 *
 * Jason, 2026-09-13: "add the O'Reilly and Truck series too". The route id is
 * the series (#/nascar, #/nascar-oreilly, #/nascar-truck), the feed is read with
 * ?series=, the groups are filtered to it, and the Cup keeps every key it had.
 *
 * 🔴 WHAT IS REAL HERE AND WHAT IS NOT.
 *   REAL: fixtures/nascar/espn-oreilly-scoreboard-260912.json + oreilly-260912-race-core.json -
 *         the O'Reilly Auto Parts Series at World Wide Technology, final.
 *   REAL: fixtures/nascar/espn-truck-scoreboard-260918.json + truck-260918-race-core.json -
 *         the Truck Series at Bristol before the race, with RAM in the field.
 *   REAL: fixtures/nascar/espn-nascar-scoreboard-260913.json + wwt-2026-race-core-pre.json -
 *         the Cup at WWT before the race. All three read with the shipping parseNascar.
 *   REAL: cleanNascarPicks / makesOf (src/lib/nascar.ts), NASCAR_SERIES (src/nascar-feed.ts),
 *         POOL_SPORTS (src/lib/groups.ts) and the ROUTES table in public/app.js (read as text).
 *   TEST INPUTS, NOT FIXTURES: the groups, and location.hash.
 *
 * The screen is loaded exactly as tests/nascar-picks.test.mjs loads it: the
 * shipped file with its four server-absolute imports re-based onto the real files.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseNascar, makesOf, cleanNascarPicks, MAKES } from '../src/lib/nascar.ts';
import { NASCAR_SERIES } from '../src/nascar-feed.ts';
import { POOL_SPORTS } from '../src/lib/groups.ts';

const SRC = readFileSync(new URL('../public/screens/nascar-picks.screen.js', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../public/screens/nascar-picks.css', import.meta.url), 'utf8');
const APP = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const href = (p) => JSON.stringify(new URL(p, import.meta.url).href);
const PATHS = {
  "'/components/states.js'": href('../public/components/states.js'),
  "'/components/header.js'": href('../public/components/header.js'),
  "'/components/group.js'": href('../public/components/group.js'),
  "'/components/start-join.js'": href('../public/components/start-join.js'),
  "'/src/lib/nascar.js'": href('../src/lib/nascar.ts')
};
let rebased = SRC;
for (const [from, to] of Object.entries(PATHS)) {
  assert.ok(rebased.includes(from), 'the screen no longer imports ' + from);
  rebased = rebased.replace(from, to);
}

/* The browser globals the module reaches for, and nothing more. */
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
globalThis.window = globalThis;
let HASH = '';
Object.defineProperty(globalThis, 'location', { configurable: true, get: () => ({ hash: HASH }) });

const NAS = await import('data:text/javascript;base64,' + Buffer.from(rebased, 'utf8').toString('base64'));
const GROUP = await import('../public/components/group.js');

const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

const load = (p) => JSON.parse(readFileSync(new URL('../fixtures/nascar/' + p, import.meta.url), 'utf8'));
const CUP = parseNascar(load('espn-nascar-scoreboard-260913.json'), load('wwt-2026-race-core-pre.json'));
const ORL = parseNascar(load('espn-oreilly-scoreboard-260912.json'), load('oreilly-260912-race-core.json'));
const TRK = parseNascar(load('espn-truck-scoreboard-260918.json'), load('truck-260918-race-core.json'));
const FEED = { nascar: CUP, 'nascar-oreilly': ORL, 'nascar-truck': TRK };
const BEFORE_TRUCKS = TRK.start - 60 * 60 * 1000;

/* GET /api/group/mine's shape - test inputs. */
const grp = (id, name, sport) => ({ id, name, sport, week: null, ats: false, scope: 'all', scopeArg: '', members: 4, role: 'member' });
const G_F1 = grp('PITWAL', 'Pit wall', 'f1');
const G_CUP = grp('TURN4X', 'Turn four', 'nascar');
const G_ORL = grp('ORLY01', 'Parts counter', 'nascar-oreilly');
const G_TRK = grp('TRUCK1', 'Truck stop', 'nascar-truck');
const G_TRK2 = grp('TRUCK2', 'Bristol night', 'nascar-truck');
const ALL = [G_F1, G_CUP, G_ORL, G_TRK, G_TRK2];

const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });

/** The frozen contract: /api/nascar/current?series= (the Cup when absent or
 *  unknown - the Worker's own fallback), and the pool routes where THE GROUP'S
 *  SPORT decides which race. Stores with the library's own cleanNascarPicks. */
function fakeApi({ feed = FEED, stored = {}, groups = ALL, now = BEFORE_TRUCKS, ignoreSeries = false } = {}) {
  const calls = [];
  const db = { ...stored };
  const api = async (url, init) => {
    calls.push({ url, init });
    if (url.startsWith('/api/nascar/current')) {
      const q = url.includes('?') ? new URLSearchParams(url.slice(url.indexOf('?') + 1)).get('series') : null;
      const s = !ignoreSeries && q && Object.hasOwn(NASCAR_SERIES, q) ? q : 'nascar';
      const ev = feed[s];
      return ev ? json({ schema: 1, series: s, label: NASCAR_SERIES[s].label, event: ev, fetchedAt: now })
        : json({ error: 'no NASCAR race on the feed' }, 404);
    }
    if (url === '/api/group/mine') return json({ groups });
    const poolOf = (id) => groups.find((g) => g.id === id);
    if (url.startsWith('/api/pool/racepicks?pool=')) {
      const pool = decodeURIComponent(url.split('=')[1]);
      const g = poolOf(pool);
      return json({ pool, sport: g.sport, eventId: feed[g.sport].id, picks: db[pool] || {} });
    }
    if (url === '/api/pool/racepick') {
      const b = JSON.parse(init.body);
      const ev = feed[poolOf(b.pool).sport];
      if (b.eventId !== ev.id) return json({ error: 'event_over', eventId: ev.id }, 409);
      db[b.pool] = cleanNascarPicks(ev, b.picks, db[b.pool] || {}, now);
      return json({ ok: true, pool: b.pool, sport: poolOf(b.pool).sport, eventId: ev.id, picks: db[b.pool] });
    }
    return json({ error: 'no route' }, 404);
  };
  return { api, calls, db };
}

async function onRoute(hash, api, fn) {
  HASH = hash;
  window.agApiFetch = api;
  try { return await fn(); } finally { delete window.agApiFetch; HASH = ''; }
}
const signIn = () => { STORE.set('ag.session', 't'); STORE.set('ag.handle', 'e1'); };
const fresh = () => { STORE.clear(); GROUP.forgetGroups(); };

/* ------------------------------------------------------------ the fixtures */

test('the three races these tests play: the Cup and the Trucks before the flag, the O\'Reilly race final', () => {
  assert.equal(CUP.state, 'pre');
  assert.equal(TRK.state, 'pre');
  assert.equal(ORL.state, 'final');
  assert.equal(TRK.track, 'Bristol');
  assert.equal(new Set([CUP.id, ORL.id, TRK.id]).size, 3, 'three different races');
});

/* ------------------------------------------------------------ the series from the hash */

test('the series is the route id; anything else is the Cup', () => {
  assert.deepEqual(NAS.SERIES_IDS, ['nascar', 'nascar-oreilly', 'nascar-truck']);
  assert.equal(NAS.seriesFromHash('#/nascar'), 'nascar');
  assert.equal(NAS.seriesFromHash('#/nascar-oreilly'), 'nascar-oreilly');
  assert.equal(NAS.seriesFromHash('#/nascar-truck'), 'nascar-truck');
  assert.equal(NAS.seriesFromHash('#/nascar-truck?from=home'), 'nascar-truck');
  for (const h of [undefined, '', '#', '#/', '#/f1', '#/nascar-xfinity', '#/nascar-trucks', '#/NASCAR-TRUCK']) {
    assert.equal(NAS.seriesFromHash(h), 'nascar', String(h) + ' is the Cup');
  }
  /* The same three ids everywhere the contract names them. */
  for (const s of NAS.SERIES_IDS) {
    assert.ok(Object.hasOwn(NASCAR_SERIES, s), s + ' is a feed series');
    assert.equal(NAS.SERIES[s].label, NASCAR_SERIES[s].label, 'the sub line says what the server calls it');
    assert.ok(POOL_SPORTS.includes(s), s + ' is a group sport');
    assert.match(APP, new RegExp("id:\\s*'" + s + "',\\s*dest:\\s*'slate',\\s*screen:\\s*'nascar-picks'"), s + ' is a route to this screen');
  }
});

/* ------------------------------------------------------------ the feed per series */

test('the feed URL per series - the Cup keeps the bare address it always read', () => {
  assert.equal(NAS.feedUrl('nascar'), '/api/nascar/current');
  assert.equal(NAS.feedUrl(undefined), '/api/nascar/current');
  assert.equal(NAS.feedUrl('nascar-oreilly'), '/api/nascar/current?series=nascar-oreilly');
  assert.equal(NAS.feedUrl('nascar-truck'), '/api/nascar/current?series=nascar-truck');
});

test('each route reads its own race off its own feed; the banner stays off on all three', async () => {
  for (const [hash, s, url] of [
    ['#/nascar', 'nascar', '/api/nascar/current'],
    ['#/nascar-oreilly', 'nascar-oreilly', '/api/nascar/current?series=nascar-oreilly'],
    ['#/nascar-truck', 'nascar-truck', '/api/nascar/current?series=nascar-truck']
  ]) {
    fresh();
    const { api, calls } = fakeApi();
    await onRoute(hash, api, async () => {
      const d = await NAS.previewData({}, 'ready');
      assert.deepEqual(calls.map((c) => c.url), [url], hash + ': the feed and nothing else, signed out');
      assert.equal(d.event.id, FEED[s].id);
      assert.equal(d.series, s);
      assert.equal(d.fromFeed, true);
      assert.equal(d.noSample, true);
    });
  }
  assert.deepEqual(await NAS.previewData({}, 'loading'), {}, 'harness states touch nothing');
});

test('a re-read keeps the series it was asked for, whatever the hash says', async () => {
  fresh();
  const { api, calls } = fakeApi();
  await onRoute('#/nascar', api, async () => {
    const d = await NAS.previewData(null, 'ready', 'nascar-oreilly');
    assert.equal(calls[0].url, '/api/nascar/current?series=nascar-oreilly');
    assert.equal(d.event.id, ORL.id);
  });
  assert.ok(code(SRC).includes("previewData(null, 'ready', series)"), 'render\'s re-read passes its own series');
});

test('a feed that answers for another series is not shown as this one', async () => {
  fresh();
  const { api } = fakeApi({ ignoreSeries: true });      /* answers the Cup whatever is asked */
  await onRoute('#/nascar-truck', api, async () => {
    const d = await NAS.previewData({}, 'ready');
    assert.deepEqual(d, { event: null, fromFeed: false, noSample: true, series: 'nascar-truck' });
  });
});

test('no race on the feed, per series: the empty state, no group call, the banner still off', async () => {
  fresh(); signIn();
  const { api, calls } = fakeApi({ feed: { ...FEED, 'nascar-truck': null } });
  await onRoute('#/nascar-truck', api, async () => {
    const d = await NAS.previewData({}, 'ready');
    assert.deepEqual(d, { event: null, noSample: true, series: 'nascar-truck' });
    assert.deepEqual(calls.map((c) => c.url), ['/api/nascar/current?series=nascar-truck']);
  });
  assert.equal(NAS.emptyBody('nascar-truck'), 'The next Truck Series race shows here as soon as ESPN lists it.');
  assert.equal(NAS.emptyBody('nascar-oreilly'), 'The next O\'Reilly race shows here as soon as ESPN lists it.');
  assert.equal(NAS.emptyBody('nascar'), 'The next Cup race shows here as soon as ESPN lists it.');
  const render = code(SRC).slice(code(SRC).indexOf('export function render'));
  assert.ok(render.includes('body: emptyBody(series)'));
});

/* ------------------------------------------------------------ groups per series */

test('groups filtered per series: a group of one series never appears in another', () => {
  assert.deepEqual(NAS.nascarGroupsOf(ALL, 'nascar').map((g) => g.id), ['TURN4X']);
  assert.deepEqual(NAS.nascarGroupsOf(ALL, 'nascar-oreilly').map((g) => g.id), ['ORLY01']);
  assert.deepEqual(NAS.nascarGroupsOf(ALL, 'nascar-truck').map((g) => g.id), ['TRUCK1', 'TRUCK2']);
  assert.deepEqual(NAS.nascarGroupsOf(ALL).map((g) => g.id), ['TURN4X'], 'no series named is the Cup');
  assert.deepEqual(NAS.nascarGroupsOf(ALL, 'junk').map((g) => g.id), ['TURN4X']);
});

test('signed in on the Truck route: only Truck groups, the Truck choice, the Truck race\'s picks', async () => {
  fresh(); signIn();
  STORE.set('ag.nascar.group', 'TURN4X');
  STORE.set('ag.nascar-truck.group', 'TRUCK2');
  const { api, calls } = fakeApi({ stored: { TRUCK2: { make: 'RAM' } } });
  await onRoute('#/nascar-truck', api, async () => {
    const d = await NAS.previewData({}, 'ready');
    assert.deepEqual(calls.map((c) => c.url),
      ['/api/nascar/current?series=nascar-truck', '/api/group/mine', '/api/pool/racepicks?pool=TRUCK2']);
    assert.deepEqual(d.groups.map((g) => g.id), ['TRUCK1', 'TRUCK2'], 'no Cup, O\'Reilly or F1 group offered');
    assert.equal(d.groupId, 'TRUCK2', 'the remembered Truck group');
    assert.deepEqual(d.picks, { make: 'RAM' });
    assert.deepEqual(JSON.parse(STORE.get('ag.nascar-truck.' + TRK.id)), { make: 'RAM' }, 'the Truck race\'s own key');
    assert.equal(STORE.get('ag.nascar.group'), 'TURN4X', 'the Cup\'s choice is not touched');
    assert.equal(STORE.has('ag.group'), false);
  });
});

test('signed in on the O\'Reilly route with nothing remembered: the O\'Reilly group, written to its own key', async () => {
  fresh(); signIn();
  const { api } = fakeApi({ stored: { ORLY01: { race: ORL.order.slice(0, 3) } } });
  await onRoute('#/nascar-oreilly', api, async () => {
    const d = await NAS.previewData({}, 'ready');
    assert.equal(d.groupId, 'ORLY01');
    assert.equal(STORE.get('ag.nascar-oreilly.group'), 'ORLY01');
    assert.equal(STORE.has('ag.nascar.group'), false, 'the Cup key is not written from another series');
    const v = NAS.raceDayView(d.event, d.picks, Date.now());
    assert.equal(v.final, true);
    assert.equal(v.totalText, '9 points this race', 'the O\'Reilly podium, exactly');
  });
});

test('in a Cup group only: the Truck route plays on this phone and offers a Truck group', async () => {
  fresh(); signIn();
  const { api, calls } = fakeApi({ groups: [G_F1, G_CUP] });
  await onRoute('#/nascar-truck', api, async () => {
    const d = await NAS.previewData({}, 'ready');
    assert.deepEqual(d.groups, []);
    assert.equal(d.groupId, undefined);
    assert.deepEqual(calls.map((c) => c.url), ['/api/nascar/current?series=nascar-truck', '/api/group/mine']);
  });
  assert.equal(NAS.SERIES['nascar-truck'].invite, 'start a NASCAR Truck group');
  assert.equal(NAS.SERIES['nascar-oreilly'].invite, 'start a NASCAR O\'Reilly group');
  assert.equal(NAS.SERIES.nascar.invite, 'start a NASCAR group');
});

/* ------------------------------------------------------------ storage */

test('the Cup\'s storage keys are the ones it always had; the others name their series', () => {
  assert.equal(NAS.localKey(CUP.id), 'ag.nascar.' + CUP.id);
  assert.equal(NAS.localKey(CUP.id, 'nascar'), 'ag.nascar.' + CUP.id);
  assert.equal(NAS.groupKey('nascar'), 'ag.nascar.group');
  assert.equal(NAS.groupKey(undefined), 'ag.nascar.group');
  assert.equal(NAS.groupKey('nascar'), NAS.NASCAR_GROUP_KEY);
  assert.equal(NAS.localKey(ORL.id, 'nascar-oreilly'), 'ag.nascar-oreilly.' + ORL.id);
  assert.equal(NAS.localKey(TRK.id, 'nascar-truck'), 'ag.nascar-truck.' + TRK.id);
  assert.equal(NAS.groupKey('nascar-oreilly'), 'ag.nascar-oreilly.group');
  assert.equal(NAS.groupKey('nascar-truck'), 'ag.nascar-truck.group');
});

test('Cup picks already on a phone are read from the old keys, and another series never disturbs them', async () => {
  fresh(); signIn();
  const cupPicks = { race: [CUP.drivers[0].id, CUP.drivers[1].id, CUP.drivers[2].id] };
  STORE.set('ag.nascar.group', 'TURN4X');
  STORE.set('ag.nascar.' + CUP.id, JSON.stringify(cupPicks));
  const before = JSON.stringify([...STORE]);

  const a = fakeApi({ stored: { TRUCK1: { make: 'Ford' } } });
  await onRoute('#/nascar-truck', a.api, () => NAS.previewData({}, 'ready'));
  assert.equal(STORE.get('ag.nascar.group'), 'TURN4X');
  assert.equal(STORE.get('ag.nascar.' + CUP.id), JSON.stringify(cupPicks), 'the Truck route left the Cup picks alone');
  assert.ok(JSON.stringify([...STORE]).length > before.length, 'the Truck race wrote its own keys');

  GROUP.forgetGroups();
  /* The server already has the phone's top three, so nothing is posted and the
     outcome does not hang on the clock. */
  const b = fakeApi({ stored: { TURN4X: { ...cupPicks, make: 'Ford' } } });
  await onRoute('#/nascar', b.api, async () => {
    const d = await NAS.previewData({}, 'ready');
    assert.deepEqual(b.calls.map((c) => c.url), ['/api/nascar/current', '/api/group/mine', '/api/pool/racepicks?pool=TURN4X']);
    assert.equal(d.groupId, 'TURN4X', 'the Cup group remembered under ag.nascar.group');
    assert.deepEqual(d.picks, { ...cupPicks, make: 'Ford' });
    assert.deepEqual(JSON.parse(STORE.get('ag.nascar.' + CUP.id)), { ...cupPicks, make: 'Ford' }, 'still ag.nascar.<eventId>');
  });
});

/* ------------------------------------------------------------ the makes */

test('the Truck Series offers RAM; the Cup and O\'Reilly offer their three', () => {
  assert.deepEqual(NAS.makeChoices(TRK), [['Chevrolet', 'Chevrolet'], ['Ford', 'Ford'], ['Toyota', 'Toyota'], ['RAM', 'RAM']]);
  assert.deepEqual(NAS.makeChoices(CUP).map(([m]) => m), MAKES);
  assert.deepEqual(NAS.makeChoices(ORL).map(([m]) => m), makesOf(ORL));
  assert.ok(NAS.makeChoices(TRK).every(([m]) => cleanNascarPicks(TRK, { make: m }, {}, BEFORE_TRUCKS).make === m),
    'every make offered is one the server accepts');
  assert.equal(NAS.raceDayView(TRK, { make: 'RAM' }, BEFORE_TRUCKS).make.pick, 'RAM');
  assert.equal(NAS.raceDayView(CUP, { make: 'RAM' }, CUP.start - 3600e3).make.pick, '', 'no RAM in the Cup field');
  const ram = TRK.drivers.find((d) => d.make === 'RAM');
  assert.ok(NAS.driverLabel(ram).endsWith(' · RAM'));
  const js = code(SRC);
  assert.ok(js.includes("choices(m, 'make', makeChoices(ev)"), 'the make card is drawn from the field');
  assert.ok(!/\bMAKES\b/.test(js), 'the fixed three are not the screen\'s list any more');
  assert.ok(js.includes("if (opts.length > 3) row.dataset.many = 'true';"));
  assert.match(CSS, /\.scr-nascar \.nas-choices\[data-many="true"\]\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
    'four makes sit two by two');
});

test('a RAM pick saved to a Truck group is stored as sent', async () => {
  const { api, calls } = fakeApi();
  const res = await NAS.postNascarPicks(api, 'TRUCK1', TRK.id, { make: 'RAM', darkHorse: TRK.drivers.find((d) => d.start >= 11).id });
  assert.equal(res.kind, 'ok');
  assert.equal(res.picks.make, 'RAM');
  assert.equal(JSON.parse(calls[0].init.body).eventId, TRK.id);
});

/* ------------------------------------------------------------ the chips */

test('the series chips: Cup · O\'Reilly · Trucks, each a link to its route, the current one marked', () => {
  assert.deepEqual(NAS.seriesChips('nascar-truck'), [
    { id: 'nascar', label: 'Cup', href: '#/nascar', on: false },
    { id: 'nascar-oreilly', label: 'O\'Reilly', href: '#/nascar-oreilly', on: false },
    { id: 'nascar-truck', label: 'Trucks', href: '#/nascar-truck', on: true }
  ]);
  assert.deepEqual(NAS.seriesChips('junk').map((c) => c.on), [true, false, false], 'anything else lights the Cup');
  for (const s of NAS.SERIES_IDS) {
    const chips = NAS.seriesChips(s);
    assert.equal(chips.filter((c) => c.on).length, 1);
    assert.ok(chips.every((c) => NAS.seriesFromHash(c.href) === c.id), 'every chip lands on its own series');
  }
  const js = code(SRC);
  const render = js.slice(js.indexOf('export function render'));
  const nav = render.indexOf('root.appendChild(seriesNav(series));');
  assert.ok(nav > 0, 'render draws the switch');
  assert.ok(nav < render.indexOf("stateBlock('loading'") && nav < render.indexOf("stateBlock('empty'"),
    'the switch is there while loading and with no race - the way to the other races');
  assert.ok(js.includes("a.setAttribute('aria-current', 'page')"), 'the current chip is marked for a screen reader too');
  const plain = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const chip = plain.match(/\.scr-nascar \.nas-chip\s*\{([^}]*)\}/);
  assert.ok(chip, 'no rule for .nas-chip');
  assert.match(chip[1], /min-height:\s*44px/, 'a 44px reach');
  assert.match(chip[1], /flex:\s*1 1 0/, 'three equal chips');
  assert.match(chip[1], /min-width:\s*0/, 'they shrink to a phone');
  assert.match(plain, /\.scr-nascar \.nas-chip\[data-on="true"\]\s*\{[^}]*var\(--accent\)/, 'the current one is lit');
  /* Found at 393px: with no race on the feed the grid rows stretched to fill the
     100dvh shell and the chips measured 700px tall. */
  assert.match(plain, /\.scr-nascar\s*\{[^}]*align-content:\s*start/, 'rows keep their own height on a short screen');
});

/* ------------------------------------------------------------ copy */

test('copy per series: the sub line names the series, the footer is the same on all three', () => {
  assert.equal(NAS.subLine('nascar', CUP), 'NASCAR Cup Series · World Wide Technology Raceway');
  /* The renamed Xfinity Series says so, once (Jason, 2026-09-13: "Same series, new name"). */
  assert.equal(NAS.subLine('nascar-oreilly', ORL), 'NASCAR O\'Reilly Auto Parts Series (formerly Xfinity) · World Wide Technology');
  assert.equal(NAS.SERIES['nascar-oreilly'].chip, 'O\'Reilly', 'never on the chip');
  assert.equal(NAS.subLine('nascar-truck', TRK), 'NASCAR Truck Series · Bristol');
  assert.equal(NAS.subLine('nascar-truck', null), 'NASCAR Truck Series');
  const js = code(SRC);
  assert.equal(js.split('Any Given is not associated in any way with NASCAR.').length, 2, 'one disclaimer, not one per series');
  /* Pool first (2026-09-13): the line became the Start / Join card, which still names the series. */
  assert.ok(js.includes('upFirst(S.invite)'), 'the start-a-group card names the series');
  assert.ok(NAS.soloCard('nascar-truck').body.includes('Start a NASCAR Truck group'));
  assert.ok(NAS.soloCard('nascar-oreilly').body.includes('Start a NASCAR O\'Reilly group'));
});
