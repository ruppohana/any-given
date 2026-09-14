/* F1 PICKS, PLAYED WITH A GROUP - public/screens/f1-picks.screen.js.
 *
 * Jason, 2026-09-12: "complete the pool revision, but do all the sports for the
 * pool". An F1 group picks the race weekend together, saved on the server.
 *
 * 🔴 WHAT IS REAL HERE AND WHAT IS NOT.
 *   REAL: fixtures/feed/espn-f1-scoreboard-260912.json - the Spanish GP as ESPN
 *         served it on 2026-09-12: qualifying final, the race to come. Read with
 *         the shipping parseF1. Every driver id below comes out of it.
 *   REAL: the server's own cleanF1Picks (src/f1-pool.ts). The fake API in this
 *         file stores what THAT function returns, so a test that passes here is
 *         passing against the rule the Worker enforces, not one written twice.
 *   REAL: components/group.js - myGroups() and its signed-in gate run as shipped.
 *   TEST INPUTS, NOT FIXTURES: the groups ({id, name, sport, ...}) - the shape of
 *         GET /api/group/mine in the frozen contract. No group has played F1 yet.
 *
 * The screen is browser code with server-absolute imports, so it is loaded with
 * those four paths re-based onto the real files (the l1-cold pattern): THE CODE
 * UNDER TEST IS THE SHIPPED FILE. There is no fake DOM - render() is closed in a
 * real browser at 393px, not here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseF1, isPickLocked } from '../src/lib/f1.ts';
import { cleanF1Picks } from '../src/f1-pool.ts';

const SRC = readFileSync(new URL('../public/screens/f1-picks.screen.js', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../public/screens/f1-picks.css', import.meta.url), 'utf8');
const href = (p) => JSON.stringify(new URL(p, import.meta.url).href);
const PATHS = {
  "'/components/states.js'": href('../public/components/states.js'),
  "'/components/header.js'": href('../public/components/header.js'),
  "'/components/group.js'": href('../public/components/group.js'),
  "'/components/start-join.js'": href('../public/components/start-join.js'),
  "'/src/lib/f1.js'": href('../src/lib/f1.ts')
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

const F1 = await import('data:text/javascript;base64,' + Buffer.from(rebased, 'utf8').toString('base64'));
const GROUP = await import('../public/components/group.js');

/** Comments out, so a rule quoted in a comment is not read as a breach of it. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

const EV = parseF1(JSON.parse(readFileSync(new URL('../fixtures/feed/espn-f1-scoreboard-260912.json', import.meta.url), 'utf8')));
const RACE = EV.sessions.find((s) => s.kind === 'race');
const NOW = RACE.start - 60 * 1000;          /* a minute before the lights: qualifying shut, the race open */
const locked = (k) => isPickLocked(EV, k, NOW);
const NOR = '5579', ANT = '5829', VER = '4665';
const OTHER = EV.drivers.find((x) => ![NOR, ANT, VER].includes(x.id)).id;

/* The groups GET /api/group/mine answers with - contract shape, test inputs. */
const G_NFL = { id: 'NFL111', name: 'Sunday league', sport: 'nfl', week: 2, ats: false, scope: 'all', scopeArg: '', members: 4, role: 'member' };
const G_A = { id: 'PITWAL', name: 'Pit wall', sport: 'f1', week: null, ats: false, scope: 'all', scopeArg: '', members: 3, role: 'commissioner' };
const G_B = { id: 'PADDOK', name: 'Paddock club', sport: 'f1', week: null, ats: false, scope: 'all', scopeArg: '', members: 6, role: 'member' };

const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });

/** The frozen contract, with the Worker's own cleanF1Picks doing the storing.
 *  `fail` answers every call with that status; 'throw' is a dropped network. */
function fakeApi({ stored = {}, eventId = EV.id, fail = null, groups = [G_NFL, G_A, G_B] } = {}) {
  const calls = [];
  const db = { picks: stored };
  const api = async (url, init) => {
    calls.push({ url, init });
    if (fail === 'throw') throw new TypeError('Failed to fetch');
    if (url === '/api/group/mine') return json({ groups });
    if (typeof fail === 'number') return json({ error: 'nope' }, fail);
    if (url.startsWith('/api/pool/f1picks?pool=')) return json({ pool: decodeURIComponent(url.split('=')[1]), eventId, picks: db.picks });
    if (url === '/api/pool/f1pick') {
      const b = JSON.parse(init.body);
      if (b.eventId !== eventId) return json({ error: 'event_over', eventId }, 409);
      db.picks = cleanF1Picks(EV, b.picks, db.picks, NOW);
      return json({ ok: true, pool: b.pool, eventId, picks: db.picks });
    }
    return json({ error: 'no route' }, 404);
  };
  return { api, calls, db };
}

/* ------------------------------------------------------------ the fixture */

test('the Spanish GP is the weekend these tests play: qualifying shut, the race open', () => {
  assert.equal(EV.name.includes('Spanish'), true);
  assert.equal(locked('qual'), true);
  assert.equal(locked('race'), false);
  assert.equal(locked('fastest'), false);
  assert.equal(locked('sprint'), true, 'no sprint this weekend');
  assert.ok(EV.drivers.some((x) => x.id === OTHER));
});

/* ------------------------------------------------------------ which group */

test('only F1 groups play the weekend; the remembered one wins, else the first', () => {
  const f1 = F1.f1GroupsOf([G_NFL, G_A, null, G_B, { id: 'X', sport: 'college-football' }]);
  assert.deepEqual(f1.map((g) => g.id), [G_A.id, G_B.id]);
  assert.deepEqual(F1.f1GroupsOf(undefined), []);
  assert.equal(F1.chooseF1Group(f1, G_B.id), G_B);
  assert.equal(F1.chooseF1Group(f1, 'GONE00'), G_A, 'a group you left falls back to the first');
  assert.equal(F1.chooseF1Group(f1, ''), G_A);
  assert.equal(F1.chooseF1Group([], G_A.id), null);
  assert.equal(F1.F1_GROUP_KEY, 'ag.f1.group');
});

/* ------------------------------------------------------------ server over local */

test('server over local: the group\'s pick wins, the phone fills only an OPEN gap', () => {
  const local = { qual: [VER, NOR, ANT], race: [NOR, ANT, VER], fastest: VER, dnf: '1-2' };
  const server = { race: [ANT, NOR, VER], poleWins: 'yes' };
  const m = F1.mergeF1Picks(server, local, locked);
  assert.deepEqual(m.race, [ANT, NOR, VER], 'the stored race pick is shown, not the phone\'s');
  assert.equal(m.poleWins, 'yes');
  assert.equal(m.fastest, VER, 'open and missing on the server - the phone\'s fills it');
  assert.equal(m.dnf, '1-2');
  assert.equal('qual' in m, false, 'qualifying is shut and the group never had it - it cannot count, so it is not shown');
  m.race[0] = OTHER;
  assert.equal(server.race[0], ANT, 'the merge copies; it never edits the server answer');
  assert.deepEqual(F1.mergeF1Picks({ race: ['', '', ''] }, local, locked).race, [NOR, ANT, VER],
    'three empty slots are no pick - the phone\'s shows through');
  assert.deepEqual(F1.mergeF1Picks({ qual: [NOR, ANT, VER] }, {}, locked).qual, [NOR, ANT, VER],
    'a shut pick the server HAS is shown - it is what scores');
  assert.deepEqual(F1.mergeF1Picks(null, null, locked), {});
});

test('what the group does not have yet', () => {
  const server = { race: [ANT, NOR, VER], poleWins: 'yes' };
  const m = F1.mergeF1Picks(server, { race: [NOR, ANT, VER], fastest: VER, dnf: '1-2' }, locked);
  assert.deepEqual(F1.unsentKeys(m, server), ['fastest', 'dnf']);
  assert.deepEqual(F1.unsentKeys(server, server), []);
  assert.deepEqual(F1.unsentKeys({ race: ['', '', ''] }, {}), [], 'an empty pick is nothing to send');
});

/* ------------------------------------------------------------ the payload */

test('the payload is the whole picks object, and the Worker\'s own cleaner takes every open pick', () => {
  const p = F1.f1PickPayload('PITWAL', EV.id, { race: [NOR], qual: [VER], fastest: '', poleWins: 'no', dnf: '3+', junk: 1 });
  assert.deepEqual(Object.keys(p), ['pool', 'eventId', 'picks']);
  assert.equal(p.pool, 'PITWAL');
  assert.equal(p.eventId, EV.id);
  assert.deepEqual(p.picks.race, [NOR, '', ''], 'three slots, an empty one is ""');
  assert.deepEqual(p.picks.qual, [VER, '', '']);
  assert.equal('fastest' in p.picks, false, 'an unset answer is left out');
  assert.equal('junk' in p.picks, false);
  const kept = cleanF1Picks(EV, p.picks, {}, NOW);
  assert.deepEqual(kept.race, [NOR, '', '']);
  assert.equal(kept.poleWins, 'no');
  assert.equal(kept.dnf, '3+');
  assert.equal('qual' in kept, false, 'qualifying is shut - the server refuses it, which is why its answer replaces ours');
});

test('this phone\'s copy after a reply: stored replaces sent, nothing else is thrown away', () => {
  const local = { qual: [VER, NOR, ANT], race: [NOR, ANT, VER] };
  const after = F1.keepLocal(local, { race: [ANT, NOR, VER], poleWins: 'yes' });
  assert.deepEqual(after, { qual: [VER, NOR, ANT], race: [ANT, NOR, VER], poleWins: 'yes' });
  assert.deepEqual(local.race, [NOR, ANT, VER], 'a new object');
  assert.deepEqual(F1.keepLocal(null, null), {});
});

/* ------------------------------------------------------------ saving */

test('a save posts JSON and shows what was STORED - a shut pick keeps its old value', async () => {
  const { api, calls } = fakeApi({ stored: { qual: [NOR, ANT, VER] } });
  const res = await F1.postF1Picks(api, G_A.id, EV.id, { qual: [VER, VER, VER], race: [OTHER, NOR, ''], fastest: NOR });
  assert.equal(res.kind, 'ok');
  assert.deepEqual(res.picks.qual, [NOR, ANT, VER], 'the phone sent a changed qualifying; the group kept the real one');
  assert.deepEqual(res.picks.race, [OTHER, NOR, '']);
  assert.equal(res.picks.fastest, NOR);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/pool/f1pick');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[0].init.body), F1.f1PickPayload(G_A.id, EV.id, { qual: [VER, VER, VER], race: [OTHER, NOR, ''], fastest: NOR }));
});

test('a weekend that has moved on is a 409 - the screen reads the event again', async () => {
  const { api } = fakeApi({ eventId: '999999' });
  const res = await F1.postF1Picks(api, G_A.id, EV.id, { race: [NOR, '', ''] });
  assert.deepEqual(res, { kind: 'over', eventId: '999999' });
  assert.ok(code(SRC).includes("res.kind === 'over'") && code(SRC).includes('reread()'), 'the screen re-reads on a 409');
});

test('a failed save is one line, and the picks stay on this phone', async () => {
  for (const [fail, text] of [
    [403, 'You are not in this group now. Kept on this phone.'],
    [401, 'Sign in to play with your group. Kept on this phone.'],
    [500, 'Not saved with your group. Kept on this phone.'],
    ['throw', 'Offline. Kept on this phone.']
  ]) {
    const res = await F1.postF1Picks(fakeApi({ fail }).api, G_A.id, EV.id, { race: [NOR, '', ''] });
    assert.equal(res.kind, 'error');
    assert.equal(res.text, text);
  }
  for (const s of [0, 400, 401, 403, 404, 500]) {
    for (const loading of [true, false]) {
      const t = F1.groupErrorText(s, loading);
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
  const { api, calls, db } = fakeApi({ stored: { race: [ANT, NOR, VER] } });
  const local = { qual: [VER, NOR, ANT], race: [NOR, ANT, VER], fastest: VER };
  const r = await F1.loadGroupPicks(api, EV, G_A, local, NOW);
  assert.deepEqual(calls.map((c) => c.url), ['/api/pool/f1picks?pool=PITWAL', '/api/pool/f1pick']);
  assert.deepEqual(r.picks, { race: [ANT, NOR, VER], fastest: VER });
  assert.deepEqual(r.stored, db.picks, 'shown = stored after the sync');
  assert.equal(r.status.tone, 'ok');
  assert.equal(r.status.text, 'The picks on this phone were added to Pit wall.');
  assert.equal(r.moved, undefined);
});

test('loading a group with nothing to add sends nothing', async () => {
  const { api, calls } = fakeApi({ stored: { race: [ANT, NOR, VER], fastest: VER } });
  const r = await F1.loadGroupPicks(api, EV, G_A, { race: [NOR, ANT, VER] }, NOW);
  assert.equal(calls.length, 1, 'a GET and no POST');
  assert.deepEqual(r.picks, { race: [ANT, NOR, VER], fastest: VER });
  assert.equal(r.status, null);
});

test('a group that will not load shows the phone\'s picks and says so', async () => {
  const local = { qual: [VER, NOR, ANT], race: [NOR, ANT, VER] };
  for (const [fail, text] of [[403, 'You are not in this group now. Showing the picks on this phone.'],
    ['throw', 'Offline. Showing the picks on this phone.']]) {
    const r = await F1.loadGroupPicks(fakeApi({ fail }).api, EV, G_A, local, NOW);
    assert.deepEqual(r.picks, local);
    assert.notEqual(r.picks, local, 'a copy - an edit never reaches back into the stored object');
    assert.equal(r.stored, null, 'nothing read, so nothing overwrites the phone');
    assert.deepEqual(r.status, { tone: 'err', text });
  }
  const moved = await F1.loadGroupPicks(fakeApi({ eventId: '999999' }).api, EV, G_A, local, NOW);
  assert.equal(moved.moved, true, 'the server is on another weekend');
});

/* ------------------------------------------------------------ previewData, end to end */

async function withFeed(fn) {
  const realFetch = globalThis.fetch;
  const feedCalls = [];
  globalThis.fetch = async (url) => {
    feedCalls.push(String(url));
    if (url === '/api/f1/current') return json({ event: EV, extras: null });
    return json({ error: 'not the feed' }, 404);
  };
  try { return await fn(feedCalls); } finally { globalThis.fetch = realFetch; delete window.agApiFetch; }
}

test('signed out: the screen is what it was - no group call, no sign-in sheet, the phone\'s picks', async () => {
  STORE.clear(); GROUP.forgetGroups();
  const { api, calls } = fakeApi();
  window.agApiFetch = api;
  await withFeed(async (feed) => {
    window.agApiFetch = api;
    const d = await F1.previewData({}, 'ready');
    assert.deepEqual(feed, ['/api/f1/current']);
    assert.equal(calls.length, 0, 'myGroups() asks nothing of a phone that is not signed in');
    assert.equal(d.event.id, EV.id);
    assert.deepEqual(d.groups, []);
    assert.equal(d.signedIn, false);
    assert.equal(d.groupId, undefined);
    assert.equal(d.picks, undefined, 'render reads the phone, exactly as before');
  });
  assert.deepEqual(await F1.previewData({}, 'loading'), {}, 'harness states still touch nothing');
});

test('signed in: only F1 groups, the remembered one, its server picks, and the phone brought level', async () => {
  STORE.clear(); GROUP.forgetGroups();
  STORE.set('ag.session', 't'); STORE.set('ag.handle', 'e1');
  STORE.set('ag.f1.group', G_B.id);
  STORE.set('ag.f1.' + EV.id, JSON.stringify({ qual: [VER, NOR, ANT], race: [NOR, ANT, VER] }));
  const { api, calls } = fakeApi({ stored: { race: [ANT, NOR, VER], dnf: '0' } });
  await withFeed(async () => {
    window.agApiFetch = api;
    const d = await F1.previewData({}, 'ready');
    assert.deepEqual(calls.map((c) => c.url), ['/api/group/mine', '/api/pool/f1picks?pool=PADDOK']);
    assert.deepEqual(d.groups.map((g) => g.id), [G_A.id, G_B.id], 'the NFL group is not offered');
    assert.equal(d.groupId, G_B.id, 'the remembered group');
    assert.deepEqual(d.picks, { race: [ANT, NOR, VER], dnf: '0' }, 'server over local; the shut qualifying pick is not the group\'s');
    assert.deepEqual(JSON.parse(STORE.get('ag.f1.' + EV.id)), { qual: [VER, NOR, ANT], race: [ANT, NOR, VER], dnf: '0' },
      'the phone keeps its own qualifying and takes the group\'s race');
    assert.equal(STORE.has('ag.group'), false, 'loading never moves the group section\'s current group');
  });
});

test('signed in with nothing remembered: the first F1 group, and the choice is written', async () => {
  STORE.clear(); GROUP.forgetGroups();
  STORE.set('ag.session', 't'); STORE.set('ag.handle', 'e1');
  const { api } = fakeApi({ groups: [G_NFL, G_A, G_B] });
  await withFeed(async () => {
    window.agApiFetch = api;
    const d = await F1.previewData({}, 'ready');
    assert.equal(d.groupId, G_A.id);
    assert.equal(STORE.get('ag.f1.group'), G_A.id);
  });
});

test('signed in, in no F1 group: local play and the #/g line', async () => {
  STORE.clear(); GROUP.forgetGroups();
  STORE.set('ag.session', 't'); STORE.set('ag.handle', 'e1');
  const { api, calls } = fakeApi({ groups: [G_NFL] });
  await withFeed(async () => {
    window.agApiFetch = api;
    const d = await F1.previewData({}, 'ready');
    assert.deepEqual(d.groups, []);
    assert.equal(d.groupId, undefined);
    assert.deepEqual(calls.map((c) => c.url), ['/api/group/mine'], 'no picks call without an F1 group');
  });
});

/* ------------------------------------------------------------ what render promises */

test('render: the doors, the pool-only switch, and the disclaimer', () => {
  const js = code(SRC);
  const render = js.slice(js.indexOf('export function render'));
  assert.ok(render.includes("'Playing in'"));
  assert.ok(render.includes("gl.href = '#/gstandings';"), 'the group board');
  assert.ok(render.includes("gl.addEventListener('click', () => setCurrentGroupId(group.id));"),
    'the group section\'s current group is set to THIS group before the link is followed');
  /* Pool first (2026-09-13): in no F1 group the screen shows the Start / Join card,
     not a line to #/g - tests/pool-first.test.mjs taps it. A groups error keeps its line. */
  assert.ok(render.includes("startJoinCard('f1', SOLO_CARD)"), 'no group: the Start / Join card');
  assert.ok(F1.SOLO_CARD.body.includes('Start an F1 group'), 'the card says which group to start');
  assert.ok(render.includes("'Your groups did not load, so these picks are on this phone only.'"), 'a groups error is not "no group"');
  assert.ok(render.includes('if (globalThis.AG_POOL_ONLY !== true) {') && render.includes("rp.href = '#/f1live';"),
    'Replay a race is hidden in 100% pool, not deleted');
  assert.ok(render.includes('Any Given is not associated in any way with the Formula 1 companies.'));
  assert.ok(render.includes("'Picks are saved on this phone. '"), 'alone, the footer is word for word what it was');
  assert.ok(render.includes('d.picks = res.picks;'), 'a reply replaces what is shown');
  assert.ok(render.includes('writeChoice(g.id);'), 'switching group is remembered in ag.f1.group');
  assert.ok(!js.includes("'ag.group'"), 'the group key is written only by components/group.js');
  assert.ok(!/\bconfirm\s*\(|\balert\s*\(/.test(js), 'no browser dialogs');
});

test('css: scoped, every new control a 44px reach, nothing wider than a phone', () => {
  const plain = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = plain.split('}').map((b) => b.split('{')[0].trim()).filter((s) => s && !s.startsWith('@'));
  for (const sel of selectors) for (const part of sel.split(',')) assert.ok(part.trim().startsWith('.scr-f1'), 'unscoped: ' + part);
  /* '.f1-invite a' left with the link (2026-09-13, pool first): its Start / Join
     buttons are START_JOIN_CSS's, held to 44px in tests/pool-first.test.mjs. */
  for (const ctl of ['.f1-grow', '.f1-glink', '.f1-sel', '.f1-choice']) {
    const m = plain.match(new RegExp('\\.scr-f1 ' + ctl.replace(/[.]/g, '\\.') + '\\s*\\{([^}]*)\\}'));
    assert.ok(m, 'no rule for ' + ctl);
    assert.match(m[1], /min-height:\s*44px/, ctl + ' is under 44px');
  }
  assert.ok(!/(?:^|[^-])width:\s*(?:[4-9]\d{2}|\d{4,})px/.test(plain), 'a fixed width past 393px');
  assert.ok(/\.f1-grow\s*\{[^}]*minmax\(0,\s*1fr\)/.test(plain), 'the select column can shrink');
});
