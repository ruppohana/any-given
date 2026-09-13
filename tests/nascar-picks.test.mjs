/* NASCAR RACE DAY, ALONE AND WITH A GROUP - public/screens/nascar-picks.screen.js.
 *
 * Jason, 2026-09-12: "do nascar next". A NASCAR group plays the Cup race in
 * points, saved on the server - the F1 weekend's shape (tests/f1-picks-group.test.mjs).
 *
 * 🔴 WHAT IS REAL HERE AND WHAT IS NOT.
 *   REAL: fixtures/nascar/espn-nascar-scoreboard-260913.json + wwt-2026-race-core-pre.json -
 *         World Wide Technology Raceway before the green flag, as ESPN served it.
 *   REAL: fixtures/nascar/espn-nascar-scoreboard-260906.json + darlington-2026-race-core.json -
 *         Darlington, final. Both read with the shipping parseNascar; every driver id
 *         below comes out of them.
 *   REAL: cleanNascarPicks (src/lib/nascar.ts) - the function the Worker stores
 *         with. The fake API in this file stores what IT returns, so a test that
 *         passes here passes against the rule the server enforces.
 *   REAL: components/group.js - myGroups() and its signed-in gate run as shipped.
 *   TEST INPUTS, NOT FIXTURES: the groups ({id, name, sport, ...}) - the shape of
 *         GET /api/group/mine in the frozen contract. No group has played NASCAR yet.
 *
 * The screen is browser code with server-absolute imports, so it is loaded with
 * those four paths re-based onto the real files: THE CODE UNDER TEST IS THE
 * SHIPPED FILE. There is no fake DOM - render() is closed in a real browser at
 * 393px, not here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseNascar, isLocked, isDarkHorse, cleanNascarPicks, scoreNascar, NPOINTS, MAKES } from '../src/lib/nascar.ts';

const SRC = readFileSync(new URL('../public/screens/nascar-picks.screen.js', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../public/screens/nascar-picks.css', import.meta.url), 'utf8');
const href = (p) => JSON.stringify(new URL(p, import.meta.url).href);
const PATHS = {
  "'/components/states.js'": href('../public/components/states.js'),
  "'/components/header.js'": href('../public/components/header.js'),
  "'/components/group.js'": href('../public/components/group.js'),
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

const NAS = await import('data:text/javascript;base64,' + Buffer.from(rebased, 'utf8').toString('base64'));
const GROUP = await import('../public/components/group.js');

/** Comments out, so a rule quoted in a comment is not read as a breach of it. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

const load = (p) => JSON.parse(readFileSync(new URL('../fixtures/nascar/' + p, import.meta.url), 'utf8'));
const EV = parseNascar(load('espn-nascar-scoreboard-260913.json'), load('wwt-2026-race-core-pre.json'));
const DAR = parseNascar(load('espn-nascar-scoreboard-260906.json'), load('darlington-2026-race-core.json'));
const NOW = EV.start - 60 * 60 * 1000;       /* an hour before the green flag: everything open */
const LATE = EV.start + 30 * 60 * 1000;      /* half an hour in: everything shut */
const at = (ev, slot) => ev.drivers.find((d) => d.start === slot);
const LOG = at(EV, 1).id, LAR = at(EV, 2).id, BLA = at(EV, 3).id, BEL = at(EV, 4).id;
const BACK = at(EV, 20).id;                   /* a dark horse */
const BACK2 = at(EV, 30).id;

/* The groups GET /api/group/mine answers with - contract shape, test inputs. */
const G_F1 = { id: 'PITWAL', name: 'Pit wall', sport: 'f1', week: null, ats: false, scope: 'all', scopeArg: '', members: 3, role: 'member' };
const G_A = { id: 'TURN4X', name: 'Turn four', sport: 'nascar', week: null, ats: false, scope: 'all', scopeArg: '', members: 3, role: 'commissioner' };
const G_B = { id: 'INFLD2', name: 'Infield crew', sport: 'nascar', week: null, ats: false, scope: 'all', scopeArg: '', members: 6, role: 'member' };

const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });

/** The frozen contract, with the library's own cleanNascarPicks doing the storing.
 *  `fail` answers every pool call with that status; 'throw' is a dropped network. */
function fakeApi({ stored = {}, eventId = EV.id, fail = null, groups = [G_F1, G_A, G_B], now = NOW, feed = EV } = {}) {
  const calls = [];
  const db = { picks: stored };
  const api = async (url, init) => {
    calls.push({ url, init });
    if (fail === 'throw') throw new TypeError('Failed to fetch');
    if (url === '/api/nascar/current') return feed ? json({ schema: 1, event: feed, fetchedAt: now }) : json({ error: 'no NASCAR race on the feed' }, 404);
    if (url === '/api/group/mine') return json({ groups });
    if (typeof fail === 'number') return json({ error: 'nope' }, fail);
    if (url.startsWith('/api/pool/racepicks?pool=')) return json({ pool: decodeURIComponent(url.split('=')[1]), sport: 'nascar', eventId, picks: db.picks });
    if (url === '/api/pool/racepick') {
      const b = JSON.parse(init.body);
      if (b.eventId !== eventId) return json({ error: 'event_over', eventId }, 409);
      db.picks = cleanNascarPicks(EV, b.picks, db.picks, now);
      return json({ ok: true, pool: b.pool, sport: 'nascar', eventId, picks: db.picks });
    }
    return json({ error: 'no route' }, 404);
  };
  return { api, calls, db };
}

/* ------------------------------------------------------------ the fixtures */

test('WWT is the race these tests play: open an hour before, shut after the flag; Darlington is final', () => {
  assert.equal(EV.state, 'pre');
  assert.equal(isLocked(EV, NOW), false);
  assert.equal(isLocked(EV, LATE), true);
  assert.equal(EV.track, 'World Wide Technology Raceway');
  assert.equal(DAR.state, 'final');
  assert.ok(isDarkHorse(EV, BACK) && isDarkHorse(EV, BACK2) && !isDarkHorse(EV, LOG));
});

/* ------------------------------------------------------------ which group */

test('only NASCAR groups play race day; the remembered one wins, else the first', () => {
  const n = NAS.nascarGroupsOf([G_F1, G_A, null, G_B, { id: 'X', sport: 'nfl' }]);
  assert.deepEqual(n.map((g) => g.id), [G_A.id, G_B.id]);
  assert.deepEqual(NAS.nascarGroupsOf(undefined), []);
  assert.equal(NAS.chooseNascarGroup(n, G_B.id), G_B);
  assert.equal(NAS.chooseNascarGroup(n, 'GONE00'), G_A, 'a group you left falls back to the first');
  assert.equal(NAS.chooseNascarGroup([], G_A.id), null);
  assert.equal(NAS.NASCAR_GROUP_KEY, 'ag.nascar.group');
  assert.equal(NAS.localKey(EV.id), 'ag.nascar.' + EV.id);
});

/* ------------------------------------------------------------ server over local */

test('server over local: the group\'s pick wins, the phone fills a gap only while the race is open', () => {
  const local = { race: [LAR, LOG, BLA], make: 'Chevrolet', darkHorse: BACK };
  const server = { race: [LOG, LAR, BLA], poleWins: 'yes' };
  const open = NAS.mergeNascarPicks(server, local, false);
  assert.deepEqual(open.race, [LOG, LAR, BLA], 'the stored top three is shown, not the phone\'s');
  assert.equal(open.poleWins, 'yes');
  assert.equal(open.make, 'Chevrolet', 'open and missing on the server - the phone\'s fills it');
  assert.equal(open.darkHorse, BACK);
  open.race[0] = BEL;
  assert.equal(server.race[0], LOG, 'the merge copies; it never edits the server answer');

  const shut = NAS.mergeNascarPicks(server, local, true);
  assert.deepEqual(shut, { race: [LOG, LAR, BLA], poleWins: 'yes' },
    'after the flag a pick the group never had cannot count, so it is not shown');
  assert.deepEqual(NAS.mergeNascarPicks({ race: ['', '', ''] }, local, false).race, [LAR, LOG, BLA],
    'three empty slots are no pick - the phone\'s shows through');
  assert.deepEqual(NAS.mergeNascarPicks(null, null, false), {});
});

test('what the group does not have yet', () => {
  const server = { race: [LOG, LAR, BLA], poleWins: 'yes' };
  const m = NAS.mergeNascarPicks(server, { race: [LAR, LOG, BLA], make: 'Ford', darkHorse: BACK }, false);
  assert.deepEqual(NAS.unsentKeys(m, server), ['make', 'darkHorse']);
  assert.deepEqual(NAS.unsentKeys(server, server), []);
  assert.deepEqual(NAS.unsentKeys({ race: ['', '', ''] }, {}), [], 'an empty pick is nothing to send');
});

/* ------------------------------------------------------------ the payload */

test('the payload is the whole picks object, and the server\'s own cleaner takes every valid pick', () => {
  const p = NAS.nascarPickPayload('TURN4X', EV.id, { race: [LOG], make: 'Ford', poleWins: 'no', darkHorse: '', junk: 1 });
  assert.deepEqual(Object.keys(p), ['pool', 'eventId', 'picks']);
  assert.equal(p.pool, 'TURN4X');
  assert.equal(p.eventId, EV.id);
  assert.deepEqual(p.picks, { race: [LOG, '', ''], make: 'Ford', poleWins: 'no' },
    'three slots with "" for an empty one; an unset answer and anything unknown left out');
  assert.deepEqual(cleanNascarPicks(EV, p.picks, {}, NOW), { race: [LOG, '', ''], make: 'Ford', poleWins: 'no' });
  const full = NAS.nascarPickPayload('TURN4X', EV.id, { race: [LOG, LAR, BLA], make: 'Toyota', poleWins: 'yes', darkHorse: BACK });
  assert.deepEqual(cleanNascarPicks(EV, full.picks, {}, NOW), full.picks, 'a full valid set is stored as sent');
});

test('this phone\'s copy after a reply: stored replaces sent, nothing else is thrown away', () => {
  const local = { race: [LAR, LOG, BLA], darkHorse: BACK };
  const after = NAS.keepLocal(local, { race: [LOG, LAR, BLA], make: 'Ford' });
  assert.deepEqual(after, { race: [LOG, LAR, BLA], darkHorse: BACK, make: 'Ford' });
  assert.deepEqual(local.race, [LAR, LOG, BLA], 'a new object');
  assert.deepEqual(NAS.keepLocal(null, null), {});
});

/* ------------------------------------------------------------ saving */

test('a save posts JSON to /api/pool/racepick and shows what was STORED', async () => {
  const { api, calls } = fakeApi({ stored: { make: 'Ford' } });
  /* LOG starts on pole - not a dark horse, so the server refuses that one pick. */
  const sent = { race: [BEL, LAR, ''], make: 'Toyota', darkHorse: LOG };
  const res = await NAS.postNascarPicks(api, G_A.id, EV.id, sent);
  assert.equal(res.kind, 'ok');
  assert.deepEqual(res.picks, { make: 'Toyota', race: [BEL, LAR, ''] }, 'the refused dark horse is not shown as saved');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/pool/racepick');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[0].init.body), NAS.nascarPickPayload(G_A.id, EV.id, sent));
});

test('after the green flag nothing changes - the server keeps what it had and the screen shows it', async () => {
  const { api } = fakeApi({ stored: { make: 'Ford', race: [LOG, LAR, BLA] }, now: LATE });
  const res = await NAS.postNascarPicks(api, G_A.id, EV.id, { make: 'Toyota', race: [BEL, '', ''] });
  assert.deepEqual(res, { kind: 'ok', picks: { make: 'Ford', race: [LOG, LAR, BLA] } });
});

test('a race that has moved on is a 409 - the screen reads the race again', async () => {
  const { api } = fakeApi({ eventId: '999999' });
  const res = await NAS.postNascarPicks(api, G_A.id, EV.id, { race: [LOG, '', ''] });
  assert.deepEqual(res, { kind: 'over', eventId: '999999' });
  assert.ok(code(SRC).includes("res.kind === 'over'") && code(SRC).includes('reread()'), 'the screen re-reads on a 409');
});

test('a failed save is one line, and the picks stay on this phone', async () => {
  for (const [fail, text] of [
    [403, 'You are not in this group now. Kept on this phone.'],
    [401, 'Sign in to play with your group. Kept on this phone.'],
    [400, 'This group does not play race day. Kept on this phone.'],
    [500, 'Not saved with your group. Kept on this phone.'],
    ['throw', 'Offline. Kept on this phone.']
  ]) {
    const res = await NAS.postNascarPicks(fakeApi({ fail }).api, G_A.id, EV.id, { race: [LOG, '', ''] });
    assert.equal(res.kind, 'error');
    assert.equal(res.text, text);
  }
  for (const s of [0, 400, 401, 403, 404, 500]) {
    for (const loading of [true, false]) {
      const t = NAS.groupErrorText(s, loading);
      assert.ok(!t.includes('\n') && t.length < 80, 'one short line: ' + t);
      assert.ok(t.endsWith('on this phone.'), 'it always says where the picks still are: ' + t);
    }
  }
  /* The screen writes the phone BEFORE it posts, and an error never touches it. */
  const save = code(SRC).slice(code(SRC).indexOf('const save = () =>'));
  assert.ok(save.indexOf('writeLocal(keepLocal(load(key), picks))') < save.indexOf('send()'), 'here first, whatever the network does');
});

/* ------------------------------------------------------------ loading */

test('loading a group: its picks shown, the phone\'s open extras sent once, what counts is what shows', async () => {
  const { api, calls, db } = fakeApi({ stored: { race: [LOG, LAR, BLA] } });
  const local = { race: [LAR, LOG, BLA], darkHorse: BACK };
  const r = await NAS.loadGroupPicks(api, EV, G_A, local, NOW);
  assert.deepEqual(calls.map((c) => c.url), ['/api/pool/racepicks?pool=TURN4X', '/api/pool/racepick']);
  assert.deepEqual(r.picks, { race: [LOG, LAR, BLA], darkHorse: BACK });
  assert.deepEqual(r.stored, db.picks, 'shown = stored after the sync');
  assert.equal(r.status.tone, 'ok');
  assert.equal(r.status.text, 'The picks on this phone were added to Turn four.');
  assert.equal(r.moved, undefined);
});

test('loading a group with nothing to add sends nothing; after the flag the phone adds nothing', async () => {
  const a = fakeApi({ stored: { race: [LOG, LAR, BLA], make: 'Ford' } });
  const r = await NAS.loadGroupPicks(a.api, EV, G_A, { race: [LAR, LOG, BLA] }, NOW);
  assert.equal(a.calls.length, 1, 'a GET and no POST');
  assert.deepEqual(r.picks, { race: [LOG, LAR, BLA], make: 'Ford' });
  assert.equal(r.status, null);

  const b = fakeApi({ stored: { make: 'Ford' }, now: LATE });
  const late = await NAS.loadGroupPicks(b.api, EV, G_A, { race: [LAR, LOG, BLA], darkHorse: BACK }, LATE);
  assert.equal(b.calls.length, 1, 'nothing is sent after the green flag');
  assert.deepEqual(late.picks, { make: 'Ford' });
});

test('a group that will not load shows the phone\'s picks and says so', async () => {
  const local = { race: [LAR, LOG, BLA], make: 'Ford' };
  for (const [fail, text] of [[403, 'You are not in this group now. Showing the picks on this phone.'],
    [404, 'No race on the server yet. Showing the picks on this phone.'],
    ['throw', 'Offline. Showing the picks on this phone.']]) {
    const r = await NAS.loadGroupPicks(fakeApi({ fail }).api, EV, G_A, local, NOW);
    assert.deepEqual(r.picks, local);
    assert.notEqual(r.picks, local, 'a copy - an edit never reaches back into the stored object');
    assert.equal(r.stored, null, 'nothing read, so nothing overwrites the phone');
    assert.deepEqual(r.status, { tone: 'err', text });
  }
  const moved = await NAS.loadGroupPicks(fakeApi({ eventId: '999999' }).api, EV, G_A, local, NOW);
  assert.equal(moved.moved, true, 'the server is on another race');
});

/* ------------------------------------------------------------ previewData, end to end */

async function withApi(api, fn) {
  window.agApiFetch = api;
  try { return await fn(); } finally { delete window.agApiFetch; }
}

test('signed out: the feed and nothing else - no group call, no sign-in sheet, the phone\'s picks', async () => {
  STORE.clear(); GROUP.forgetGroups();
  const { api, calls } = fakeApi();
  await withApi(api, async () => {
    const d = await NAS.previewData({}, 'ready');
    assert.deepEqual(calls.map((c) => c.url), ['/api/nascar/current'], 'myGroups() asks nothing of a phone that is not signed in');
    assert.equal(d.event.id, EV.id);
    assert.deepEqual(d.groups, []);
    assert.equal(d.signedIn, false);
    assert.equal(d.groupId, undefined);
    assert.equal(d.picks, undefined, 'render reads the phone');
  });
  assert.deepEqual(await NAS.previewData({}, 'loading'), {}, 'harness states touch nothing');
});

test('no race on the feed: an empty event, and no group call', async () => {
  STORE.clear(); GROUP.forgetGroups();
  STORE.set('ag.session', 't'); STORE.set('ag.handle', 'e1');
  const { api, calls } = fakeApi({ feed: null });
  await withApi(api, async () => {
    const d = await NAS.previewData({}, 'ready');
    /* noSample: nothing on this screen is made up, so the app's "Sample data"
       banner stays off even with no race (found at 393px, 2026-09-13). */
    /* `series` (2026-09-13): the data says which series it was read for - here the Cup. */
    assert.deepEqual(d, { event: null, noSample: true, series: 'nascar' });
    assert.deepEqual(calls.map((c) => c.url), ['/api/nascar/current']);
  });
});

test('signed in: only NASCAR groups, the remembered one, its server picks, and the phone brought level', async () => {
  STORE.clear(); GROUP.forgetGroups();
  STORE.set('ag.session', 't'); STORE.set('ag.handle', 'e1');
  STORE.set('ag.nascar.group', G_B.id);
  STORE.set('ag.nascar.' + EV.id, JSON.stringify({ race: [LAR, LOG, BLA] }));
  const { api, calls } = fakeApi({ stored: { race: [LOG, LAR, BLA], make: 'Ford' } });
  await withApi(api, async () => {
    const d = await NAS.previewData({}, 'ready');
    assert.deepEqual(calls.map((c) => c.url), ['/api/nascar/current', '/api/group/mine', '/api/pool/racepicks?pool=INFLD2']);
    assert.deepEqual(d.groups.map((g) => g.id), [G_A.id, G_B.id], 'the F1 group is not offered');
    assert.equal(d.groupId, G_B.id, 'the remembered group');
    assert.deepEqual(d.picks, { race: [LOG, LAR, BLA], make: 'Ford' }, 'server over local');
    assert.deepEqual(JSON.parse(STORE.get('ag.nascar.' + EV.id)), { race: [LOG, LAR, BLA], make: 'Ford' },
      'the phone takes the group\'s picks');
    assert.equal(STORE.has('ag.group'), false, 'loading never moves the group section\'s current group');
  });
});

test('signed in with nothing remembered: the first NASCAR group, and the choice is written', async () => {
  STORE.clear(); GROUP.forgetGroups();
  STORE.set('ag.session', 't'); STORE.set('ag.handle', 'e1');
  const { api } = fakeApi();
  await withApi(api, async () => {
    const d = await NAS.previewData({}, 'ready');
    assert.equal(d.groupId, G_A.id);
    assert.equal(STORE.get('ag.nascar.group'), G_A.id);
  });
});

test('signed in, in no NASCAR group: local play and the #/g line', async () => {
  STORE.clear(); GROUP.forgetGroups();
  STORE.set('ag.session', 't'); STORE.set('ag.handle', 'e1');
  const { api, calls } = fakeApi({ groups: [G_F1] });
  await withApi(api, async () => {
    const d = await NAS.previewData({}, 'ready');
    assert.deepEqual(d.groups, []);
    assert.equal(d.groupId, undefined);
    assert.deepEqual(calls.map((c) => c.url), ['/api/nascar/current', '/api/group/mine'], 'no picks call without a NASCAR group');
  });
});

/* ------------------------------------------------------------ what is drawn */

test('the rule line is built from NPOINTS, before any pick', () => {
  assert.equal(NAS.ruleLine(), 'Exact spot 3 · right driver, wrong spot 1 · winning make 2 · pole-sitter wins 1 · dark horse 2');
  assert.equal(NAS.ruleLine({ exact: 9, inTop3: 8, make: 7, poleWins: 6, darkHorse: 5 }),
    'Exact spot 9 · right driver, wrong spot 8 · winning make 7 · pole-sitter wins 6 · dark horse 5',
    'every figure comes from the table, none is typed');
  assert.ok(code(SRC).includes("el('p', 'nas-rule', ruleLine())"), 'render draws it');
  assert.equal(NAS.darkHorseLine(), 'Starts 11th or worse, finishes in the top ten');
});

test('driver options: every car, "#22 Logano · Ford", by number, no two alike', () => {
  const logano = EV.drivers.find((d) => d.id === LOG);
  assert.equal(NAS.driverLabel(logano), '#22 Logano · Ford');
  assert.equal(NAS.carTag(logano), '#22 Logano');
  const opts = NAS.raceOptions(EV);
  assert.equal(opts.length, 36);
  assert.equal(new Set(opts.map((o) => o.label)).size, 36, 'two Dillons, told apart by the number');
  const nums = opts.map((o) => Number(o.label.slice(1, o.label.indexOf(' '))));
  assert.deepEqual(nums, nums.slice().sort((a, b) => a - b));
  assert.ok(opts.every((o) => MAKES.some((m) => o.label.endsWith(' · ' + m))), 'every option says its make');
});

test('the dark horse list: only cars starting 11th or worse, from the grid, back of the order last', () => {
  const opts = NAS.darkHorseOptions(EV);
  assert.equal(opts.length, 26, '36 cars, the front ten out');
  assert.ok(opts.every((o) => isDarkHorse(EV, o.value)), 'every option is one the server accepts');
  const starts = opts.map((o) => EV.drivers.find((d) => d.id === o.value).start);
  assert.equal(starts[0], 11);
  assert.deepEqual(starts, starts.slice().sort((a, b) => a - b));
  const first = EV.drivers.find((d) => d.start === 11);
  assert.equal(opts[0].label, NAS.driverLabel(first) + ' · starts 11th');
  assert.ok(opts.every((o) => cleanNascarPicks(EV, { darkHorse: o.value }, {}, NOW).darkHorse === o.value));
  assert.equal(NAS.darkHorseOptions(EV, LOG).length, 27, 'a stored pick is never hidden');
  const noGrid = { ...EV, drivers: EV.drivers.map((d) => ({ ...d, start: null })) };
  assert.equal(NAS.darkHorseOptions(noGrid).length, 36, 'no grid yet: every car can be one');
});

test('one driver never sits in two slots', () => {
  assert.deepEqual(NAS.placeInSlot(undefined, 1, LOG), ['', LOG, '']);
  assert.deepEqual(NAS.placeInSlot([LOG, LAR, BLA], 2, LOG), ['', LAR, LOG], 'moved, not doubled');
  assert.deepEqual(NAS.placeInSlot([LOG, LAR, BLA], 0, ''), ['', LAR, BLA], 'cleared');
  const r = NAS.placeInSlot([LOG, LAR], 2, BEL);
  assert.deepEqual(cleanNascarPicks(EV, { race: r }, {}, NOW).race, [LOG, LAR, BEL]);
});

test('the pole question names the pole-sitter, or asks unnamed with no grid', () => {
  assert.equal(NAS.poleQuestion(EV), 'Does Logano win from pole?');
  const noGrid = { ...EV, drivers: EV.drivers.map((d) => ({ ...d, start: null })) };
  assert.equal(NAS.poleQuestion(noGrid), 'Does the pole-sitter win?');
});

test('open: every card takes a pick, nothing is scored, the total reads 0', () => {
  const v = NAS.raceDayView(EV, { race: [LOG, '', BLA], make: 'Ford', darkHorse: BACK }, NOW);
  assert.equal(v.locked, false);
  assert.equal(v.final, false);
  assert.equal(v.totalText, '0 points this race');
  assert.deepEqual(v.race.map((r) => [r.pos, r.pick, r.pickText, r.actualText, r.pts]),
    [['P1', LOG, '#22 Logano', '', null], ['P2', '', 'No pick', '', null], ['P3', BLA, '#12 Blaney', '', null]]);
  assert.equal(v.make.pick, 'Ford');
  assert.equal(v.poleWins.pick, '');
  assert.equal(v.poleWins.title, 'Does Logano win from pole?');
  assert.equal(v.darkHorse.pick, BACK);
  assert.ok(NAS.lockText(EV, NOW).startsWith('Locks at the green flag · '));
});

test('locked, not final: the picks shown, no result, no points - null, never a 0 that reads as a miss', () => {
  const v = NAS.raceDayView(EV, { race: [LOG, LAR, BLA], make: 'Ford', poleWins: 'yes' }, LATE);
  assert.equal(v.locked, true);
  assert.equal(v.final, false);
  assert.ok(v.race.every((r) => r.pts === null && r.actualText === ''));
  assert.deepEqual([v.make.pts, v.poleWins.pts, v.darkHorse.pts], [null, null, null]);
  assert.equal(v.darkHorse.pickText, 'No pick');
  assert.equal(NAS.lockText(EV, LATE), 'Locked at the green flag');
});

test('final (Darlington): the actual result and the points on every card, and the total is the scorer\'s', () => {
  const [p1, p2, p3] = DAR.order;
  const gibbs = DAR.drivers.find((d) => d.name === 'Ty Gibbs');
  assert.ok(gibbs.start >= 11 && DAR.order.indexOf(gibbs.id) === 1, 'Gibbs started 28th and finished 2nd - a real dark horse');
  const picks = { race: [p1, p3, DAR.order[5]], make: 'Toyota', poleWins: 'no', darkHorse: gibbs.id };
  const v = NAS.raceDayView(DAR, picks, Date.parse('2026-09-12T00:00:00Z'));
  assert.equal(v.locked, true);
  assert.equal(v.final, true);
  assert.deepEqual(v.race.map((r) => [r.pickText, r.actualText, r.pts]), [
    ['#20 Bell', '#20 Bell', 3],
    ['#45 Reddick', '#54 Gibbs', 1],
    [NAS.carTag(DAR.drivers.find((d) => d.id === DAR.order[5])), '#45 Reddick', 0]
  ]);
  assert.equal(p2, gibbs.id);
  assert.deepEqual([v.make.actualText, v.make.pts], ['Bell · Toyota', 2]);
  assert.deepEqual([v.poleWins.title, v.poleWins.actualText, v.poleWins.pts], ['Does Reddick win from pole?', 'Reddick finished 3rd', 1]);
  assert.deepEqual([v.darkHorse.pickText, v.darkHorse.actualText, v.darkHorse.pts], ['#54 Gibbs', 'Finished 2nd', 2]);
  assert.equal(v.total, scoreNascar(DAR, picks).total);
  assert.equal(v.total, 3 + 1 + 0 + 2 + 1 + 2);
  assert.equal(v.totalText, '9 points this race');
  assert.equal(NAS.lockText(DAR, Date.now()), 'Final');

  const none = NAS.raceDayView(DAR, {}, Date.now());
  assert.deepEqual(none.race.map((r) => [r.pickText, r.pts]), [['No pick', 0], ['No pick', 0], ['No pick', 0]]);
  assert.deepEqual([none.make.pts, none.poleWins.pts, none.darkHorse.pts, none.darkHorse.actualText], [0, 0, 0, '']);
  assert.equal(none.totalText, '0 points this race');
  assert.equal(NAS.raceDayView(DAR, { race: [p1, '', ''] }, 0).totalText, '3 points this race');
});

test('ordinals', () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 36].map(NAS.ordinal),
    ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '36th']);
});

/* ------------------------------------------------------------ what render promises */

test('render: the name, the doors, the disclaimer', () => {
  const js = code(SRC);
  const render = js.slice(js.indexOf('export function render'));
  assert.ok(render.includes("title: 'Race day'"), 'named for what it is');
  /* 2026-09-13, three series: the sub line names the route's series - and the
     Cup's reads exactly as it did (tests/nascar-picks-series.test.mjs has the rest). */
  assert.ok(render.includes('sub: subLine(series, ev)'), 'NASCAR only as the fact of the series');
  assert.equal(NAS.subLine('nascar', EV), 'NASCAR Cup Series · World Wide Technology Raceway');
  assert.equal(NAS.subLine('nascar', null), 'NASCAR Cup Series');
  assert.ok(render.includes("'Playing in'"));
  assert.ok(render.includes("gl.href = '#/gstandings';"), 'the group board');
  assert.ok(render.includes("gl.addEventListener('click', () => setCurrentGroupId(group.id));"),
    'the group section\'s current group is set to THIS group before the link is followed');
  assert.ok(render.includes("a.href = '#/g';") && render.includes('S.invite'), 'no group: one line to #/g');
  assert.equal(NAS.SERIES.nascar.invite, 'start a NASCAR group', 'the Cup\'s line, word for word');
  assert.equal(NAS.emptyBody('nascar'), 'The next Cup race shows here as soon as ESPN lists it.', 'the Cup\'s empty state, word for word');
  assert.ok(render.includes('Any Given is not associated in any way with NASCAR.'));
  assert.ok(render.includes("'Picks are saved on this phone. '"));
  assert.ok(render.includes('d.picks = res.picks;'), 'a reply replaces what is shown');
  assert.ok(render.includes('writeChoice(g.id, series);'), 'switching group is remembered in ag.nascar.group');
  assert.ok(render.includes("stateBlock('loading'") && render.includes("stateBlock('empty'"), 'loading and empty states');
  assert.ok(['Race top 3', 'Winning make', 'Dark horse'].every((t) => render.includes("card('" + t + "')")));
  assert.ok(render.includes('card(v.poleWins.title)'));
  assert.ok(!js.includes("'ag.group'"), 'the group key is written only by components/group.js');
  assert.ok(!/\bconfirm\s*\(|\balert\s*\(/.test(js), 'no browser dialogs');
  assert.ok(!/\bfetch\(/.test(js.replace(/\|\|\s*fetch/g, '')), 'every call goes through (window.agApiFetch || fetch)');
});

test('css: scoped, every control a 44px reach, nothing wider than a phone', () => {
  const plain = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = plain.split('}').map((b) => b.split('{')[0].trim()).filter((s) => s && !s.startsWith('@'));
  for (const sel of selectors) for (const part of sel.split(',')) assert.ok(part.trim().startsWith('.scr-nascar'), 'unscoped: ' + part);
  for (const ctl of ['.nas-grow', '.nas-glink', '.nas-invite a', '.nas-sel', '.nas-choice', '.nas-row']) {
    const m = plain.match(new RegExp('\\.scr-nascar ' + ctl.replace(/[.]/g, '\\.') + '\\s*\\{([^}]*)\\}'));
    assert.ok(m, 'no rule for ' + ctl);
    assert.match(m[1], /min-height:\s*44px/, ctl + ' is under 44px');
  }
  assert.ok(!/(?:^|[^-])width:\s*(?:[4-9]\d{2}|\d{4,})px/.test(plain), 'a fixed width past 393px');
  assert.ok(/\.nas-row\s*\{[^}]*minmax\(0,\s*1fr\)/.test(plain), 'the select column can shrink');
});
