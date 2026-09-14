/* G2 - the commissioner's tools. What this file pins, and what it cannot.
 *
 * LAYOUT IS CLOSED IN A REAL BROWSER AT 393px, against the running Worker and
 * the local D1. Nothing here says anything about how the screen looks.
 *
 * What this file does: it runs the REAL screen module - its imports pointed at
 * the real components/group.js, header.js and states.js - against a minimal DOM,
 * and taps it. So "remove needs two taps" is a tap, a check that nothing was
 * sent, a second tap, and a check of exactly what was sent - not a regex.
 *
 * 🔴 THE API ANSWERS BELOW ARE SHAPED FROM CONTRACT-GROUPS.md §2, not captured.
 * They carry the fields the table names and nothing more, and the words that
 * belong to the server (the kindness line, the limits) are imported from
 * src/lib/groups.ts rather than retyped. They are not a fixture and prove nothing
 * about the Worker; the browser run against the Worker is that proof.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KINDNESS, LIMITS, POOL_SPORTS } from '../src/lib/groups.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const JS = read('../public/screens/g2-commish.screen.js');
const CSS = read('../public/screens/g2-commish.css');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
const JSC = strip(JS);
const CSSC = strip(CSS);

/* ------------------------------------------------------------ a minimal DOM */

function makeDom() {
  const mk = (tag) => {
    const listeners = {};
    const node = {
      tagName: String(tag).toLowerCase(),
      children: [], attrs: {}, dataset: {}, parent: null,
      _class: '', _text: '',
      style: { setProperty() {} },
      get className() { return node._class; },
      set className(v) { node._class = String(v); },
      classList: {
        add(...cs) {
          const have = node._class ? node._class.split(/\s+/) : [];
          for (const c of cs) if (c && !have.includes(c)) have.push(c);
          node._class = have.join(' ');
        },
        contains(c) { return (node._class || '').split(/\s+/).includes(c); }
      },
      get textContent() { return node._text + node.children.map((c) => c.textContent).join(''); },
      set textContent(v) { node._text = v == null ? '' : String(v); for (const c of node.children) c.parent = null; node.children = []; },
      set innerHTML(v) { if (v === '') { node._text = ''; node.children = []; } },
      appendChild(c) { c.parent = node; node.children.push(c); return c; },
      append(...cs) { for (const c of cs) node.appendChild(typeof c === 'string' ? Object.assign(mk('#text'), { _text: c }) : c); },
      remove() { if (node.parent) { node.parent.children = node.parent.children.filter((x) => x !== node); node.parent = null; } },
      setAttribute(k, v) { node.attrs[k] = String(v); },
      getAttribute(k) { return node.attrs[k]; },
      removeAttribute(k) { delete node.attrs[k]; },
      addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
      /* Returns the handlers' promises, so a test can await what a tap started. */
      fire(t, ev) { return Promise.all((listeners[t] || []).map((fn) => fn(ev || { preventDefault() {} }))); }
    };
    return node;
  };
  return { createElement: mk, createElementNS: (ns, t) => mk(t), createTextNode: (t) => Object.assign(mk('#text'), { _text: t }) };
}

function all(node, out = []) { out.push(node); for (const c of node.children) all(c, out); return out; }
const byClass = (root, c) => all(root).filter((n) => n.classList.contains(c));
const byTag = (root, t) => all(root).filter((n) => n.tagName === t);
const buttons = (root, label) => byTag(root, 'button').filter((b) => b.textContent === label);
const settle = () => new Promise((r) => setTimeout(r, 0));

/* ------------------------------------------------------------ the world */

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};

let CALLS = [];
let ROUTES = {};
function reply(status, body) { return { ok: status >= 200 && status < 300, status, json: async () => body }; }
async function fakeFetch(url, opts) {
  const path = String(url).split('?')[0];
  const body = opts && opts.body ? JSON.parse(opts.body) : undefined;
  CALLS.push({ path, url: String(url), body });
  const h = ROUTES[path];
  if (!h) throw new Error('no route for ' + path);
  return h(body, url);
}
globalThis.window = { agApiFetch: fakeFetch };
globalThis.document = makeDom();

/* The real components, by file URL, in place of the browser's absolute paths. */
const comp = (n) => new URL('../public/components/' + n, import.meta.url).href;
const src = JS.replace(/from '\/components\/([a-z-]+\.js)'/g, (_, n) => `from '${comp(n)}'`);
const mod = await import('data:text/javascript;base64,' + Buffer.from(src, 'utf8').toString('base64'));
const GROUP = await import(comp('group.js'));

/* Shaped from CONTRACT-GROUPS.md §2. */
const G = { id: 'BCDFGH', name: 'B-Test', sport: 'nfl', week: null, ats: false, members: 3, role: 'commissioner' };
const G2 = { id: 'JKLMNP', name: 'B-Other', sport: 'nfl', week: null, ats: false, members: 2, role: 'player' };
function detail(over = {}) {
  return Object.assign({
    group: { id: G.id, name: G.name, sport: 'nfl', week: null, ats: false, createdAt: 1, pledged: true },
    you: { role: 'commissioner', muted: false },
    commissioner: 'b1',
    members: [
      { ref: 'r-b1', name: 'b1', role: 'commissioner', you: true, muted: false },
      { ref: 'r-b2', name: 'b2', role: 'player', you: false, muted: false },
      { ref: 'r-b3', name: 'b3', role: 'player', you: false, muted: false }
    ],
    invite: { code: G.id, link: 'https://anygiven.app/?pool=' + G.id },
    mailer: false,
    kindness: KINDNESS
  }, over);
}

function world({ signedIn = true, groups = [G], det = detail() } = {}) {
  store.clear();
  if (signedIn) { store.set('ag.session', 'tok'); store.set('ag.handle', 'b1'); }
  GROUP.forgetGroups();
  CALLS = [];
  ROUTES = {
    '/api/group/mine': () => reply(200, { groups, kindness: KINDNESS }),
    '/api/group/detail': () => reply(200, det)
  };
}

async function mount(state = 'ready') {
  const root = document.createElement('div');
  const data = await mod.previewData({}, state);
  mod.render(root, data, state);
  return { root, data };
}

const text = (root) => all(root).map((n) => [n._text, n.attrs['aria-label'], n.attrs.placeholder, n.value]
  .filter((x) => typeof x === 'string').join(' ')).join(' ');

/* ------------------------------------------------------------ 1 · the states */

test('every state is declared, the static ones render with no network', async () => {
  const want = ['ready', 'empty', 'not-commish', 'no-group', 'signed-out', 'loading', 'offline', 'error'];
  assert.deepEqual([...mod.states].sort(), [...want].sort());
  for (const s of ['loading', 'offline', 'error', 'signed-out', 'no-group']) {
    world();
    const { root, data } = await mount(s);
    assert.equal(data.view, s);
    assert.equal(CALLS.length, 0, `${s} reached the network in the harness`);
    assert.ok(root.children.length > 1, `${s} drew nothing`);
  }
});

test('signed out: a sign-in prompt that calls agOpenSignIn and re-renders on success', async () => {
  world({ signedIn: false });
  const { root, data } = await mount();
  assert.equal(data.view, 'signed-out');
  assert.match(text(root), /Sign in to run your group/);
  let opened = 0;
  window.agOpenSignIn = async () => { opened++; store.set('ag.session', 'tok'); store.set('ag.handle', 'b1'); return true; };
  await buttons(root, 'Sign in')[0].fire('click');
  assert.equal(opened, 1);
  assert.match(text(root), /Your promise as commissioner/, 'did not re-render into the group after sign-in');
  delete window.agOpenSignIn;
});

test('offline and error: offline says nothing changed, an error message is shown verbatim', async () => {
  world();
  ROUTES['/api/group/mine'] = () => { throw new TypeError('Failed to fetch'); };
  let { root } = await mount();
  assert.match(text(root), /could not be reached\. Nothing was changed/);

  world();
  ROUTES['/api/group/detail'] = () => reply(404, { error: 'no_group', message: 'That group is gone.' });
  ({ root } = await mount());
  assert.match(text(root), /That group is gone\./);
});

test('no group: a door to #/g', async () => {
  world({ groups: [] });
  const { root, data } = await mount();
  assert.equal(data.view, 'no-group');
  assert.ok(byTag(root, 'a').some((a) => a.href === '#/g'), 'no door to the group page');
});

test('not the commissioner: plain words, a door to #/g, and no controls', async () => {
  world({ groups: [G2, G], det: detail({ you: { role: 'player', muted: false }, invite: null,
    members: detail().members.map((m) => ({ ref: m.ref, name: m.name, role: m.role, you: m.name === 'b2' })) }) });
  store.set('ag.group', G2.id);
  const { root, data } = await mount();
  assert.equal(data.view, 'not-commish');
  assert.match(text(root), /Only the commissioner can change this group/);
  assert.ok(byTag(root, 'a').some((a) => a.href === '#/g'));
  assert.equal(buttons(root, 'Remove').length + buttons(root, 'Mute').length, 0);
  assert.equal(byClass(root, 'g2-code').length, 0, 'the invite code leaked to a player');
  assert.match(text(root), /You are the commissioner of B-Test/, 'the other group you run is not named');
  assert.equal(byTag(root, 'select').length, 1, 'no switcher with two groups');
});

test('the switcher moves the screen to the other group', async () => {
  world({ groups: [G2, G] });
  store.set('ag.group', G2.id);
  ROUTES['/api/group/detail'] = (b, url) => reply(200, String(url).includes(G.id)
    ? detail() : detail({ you: { role: 'player', muted: false }, invite: null }));
  const { root } = await mount();
  assert.match(text(root), /Only the commissioner/);
  const sel = byTag(root, 'select')[0];
  sel.value = G.id;
  await sel.fire('change');
  await settle(); await settle();
  assert.match(text(root), /Your promise as commissioner/);
});

/* ------------------------------------------------------------ 2 · ready */

test('the kindness line is shown, from the API, word for word', async () => {
  world();
  const { root } = await mount();
  const p = byClass(root, 'g2-promise-t');
  assert.equal(p.length, 1);
  assert.equal(p[0].textContent, KINDNESS);
});

test('members are handles, you and the commissioner are marked, no email address anywhere', async () => {
  world();
  const { root } = await mount();
  const names = byClass(root, 'g2-m-name').map((n) => n.textContent);
  assert.deepEqual(names, ['@b1', '@b2', '@b3']);
  const tags = byClass(root, 'g2-tag').map((n) => n.textContent);
  assert.ok(tags.includes('you') && tags.includes('commissioner'));
  assert.doesNotMatch(text(root), /[^\s@]+@[^\s@]+\.[a-z]{2,}/i);
  /* And the code never reads an address off a member. */
  assert.doesNotMatch(JSC, /\.email\b/);
});

test('no mute or remove on your own row', async () => {
  world();
  const { root } = await mount();
  const mine = byClass(root, 'g2-m')[0];
  assert.equal(byTag(mine, 'button').length, 0);
  assert.equal(buttons(root, 'Remove').length, 2);
});

test('REMOVE TAKES TWO TAPS: the first sends nothing, the second sends exactly {id, ref}', async () => {
  world();
  ROUTES['/api/group/remove'] = () => reply(200, { ok: true, removed: 'b3' });
  const { root } = await mount();
  const rm = byTag(root, 'button').find((b) => b.attrs['aria-label'] === 'Remove @b3');
  await rm.fire('click');
  assert.equal(CALLS.filter((c) => c.path === '/api/group/remove').length, 0, 'one tap removed somebody');
  const confirm = byClass(root, 'g2-confirm');
  assert.equal(confirm.length, 1);
  assert.match(confirm[0].textContent, /cannot rejoin this group/);

  /* Keep closes it, and still nothing is sent. */
  await buttons(root, 'Keep @b3')[0].fire('click');
  assert.equal(byClass(root, 'g2-confirm').length, 0);
  assert.equal(CALLS.filter((c) => c.path === '/api/group/remove').length, 0);

  await rm.fire('click');
  await buttons(root, 'Remove @b3')[0].fire('click');
  const sent = CALLS.filter((c) => c.path === '/api/group/remove');
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].body, { id: G.id, ref: 'r-b3' });
  assert.doesNotMatch(JSC, /window\.confirm|\bconfirm\s*\(/, 'a browser dialog instead of the in-page row');
});

test('mute sends {id, ref, muted} and the line says what mute does', async () => {
  world();
  ROUTES['/api/group/mute'] = () => reply(200, { ok: true, muted: true });
  const { root } = await mount();
  assert.match(text(root), /Mute stops someone sending messages to you or the group\. They can still pick/);
  await byTag(root, 'button').find((b) => b.attrs['aria-label'] === 'Mute @b2').fire('click');
  const sent = CALLS.filter((c) => c.path === '/api/group/mute');
  assert.deepEqual(sent[0].body, { id: G.id, ref: 'r-b2', muted: true });
});

test('rename posts {id, name}, drops the cached group list, and shows a server message verbatim', async () => {
  world();
  ROUTES['/api/group/settings'] = (b) => reply(200, { ok: true, group: { id: G.id, name: b.name, ats: false } });
  const { root } = await mount();
  const inp = byTag(root, 'input')[0];
  assert.equal(inp.maxLength, LIMITS.nameMax);
  inp.value = 'B-Renamed';
  await inp.fire('input');
  const before = CALLS.filter((c) => c.path === '/api/group/mine').length;
  await byTag(root, 'form')[0].fire('submit');
  assert.deepEqual(CALLS.find((c) => c.path === '/api/group/settings').body, { id: G.id, name: 'B-Renamed' });
  assert.equal(CALLS.filter((c) => c.path === '/api/group/mine').length, before + 1, 'forgetGroups was not called');

  world();
  ROUTES['/api/group/settings'] = () => reply(400, { error: 'name_required', message: 'A group needs a name.' });
  const r2 = await mount();
  const i2 = byTag(r2.root, 'input')[0];
  i2.value = '   ';
  await i2.fire('input');
  await byTag(r2.root, 'form')[0].fire('submit');
  assert.match(text(r2.root), /A group needs a name\./);
});

test('the spread switch posts {id, ats} and says what it scores', async () => {
  /* Scored since 2026-09-11 (Jason: "the comish has the option"): against the
   * line each pick was made at, and a push counts for nobody. The sentence used
   * to say the standings ignored it, which was true until then. */
  world();
  ROUTES['/api/group/settings'] = () => reply(200, { ok: true, group: { id: G.id, name: G.name, ats: true } });
  const { root } = await mount();
  const sw = byTag(root, 'button').find((b) => b.attrs.role === 'switch');
  assert.equal(sw.attrs['aria-checked'], 'false');
  assert.match(text(root), /covers the spread it was picked at/);
  assert.match(text(root), /lands exactly counts for nobody/);
  assert.doesNotMatch(text(root), /either way/, 'the old "does not change the score" line is gone');
  await sw.fire('click');
  assert.deepEqual(CALLS.find((c) => c.path === '/api/group/settings').body, { id: G.id, ats: true });
});

test('invite: the code is shown, 21 addresses are refused unsent, errors and bad[] are verbatim', async () => {
  world();
  ROUTES['/api/group/invite'] = () => reply(503, { error: 'no_mailer', message: 'Email is not set up yet. Share the link instead.', bad: ['not-an-address'] });
  const { root } = await mount();
  assert.equal(byClass(root, 'g2-code')[0].textContent, G.id);
  assert.match(text(root), /Invitations come from Any Given/);
  const ta = byTag(root, 'textarea')[0];
  const send = buttons(root, 'Send invitations')[0];

  ta.value = Array.from({ length: LIMITS.invitesPerBatch + 1 }, (_, i) => 'p' + i + '@x.test').join(', ');
  await ta.fire('input');
  await send.fire('click');
  assert.equal(CALLS.filter((c) => c.path === '/api/group/invite').length, 0, 'a 21st address was sent');
  assert.match(text(root), /Send 20 at a time/);

  ta.value = 'a@x.test\nnot-an-address';
  await ta.fire('input');
  await send.fire('click');
  assert.deepEqual(CALLS.find((c) => c.path === '/api/group/invite').body, { id: G.id, emails: 'a@x.test\nnot-an-address' });
  assert.match(text(root), /Email is not set up yet\. Share the link instead\./);
  assert.ok(byClass(root, 'g2-bad').length === 1 && /not-an-address/.test(byClass(root, 'g2-bad')[0].textContent));
});

test('share falls back to the clipboard and says Copied', async () => {
  world();
  let copied = '';
  const real = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async (t) => { copied = t; } } } });
  const { root } = await mount();
  await buttons(root, 'Share invite')[0].fire('click');
  assert.match(copied, /BCDFGH/);
  assert.ok(byClass(root, 'g2-msg').some((m) => m.textContent === 'Copied'));
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: real });
});

test('empty: a group of one says so', async () => {
  world({ det: detail({ members: [detail().members[0]] }) });
  const { root } = await mount('empty');
  assert.match(text(root), /Nobody else is in B-Test yet/);
});

/* ------------------------------------------------------------ 3 · the rules */

test('no betting words, in the code, the stylesheet or on screen', async () => {
  const words = /\b(marbles?|stakes?|staked|odds|prices?|bets?|betting|wagers?)\b/i;
  assert.doesNotMatch(JSC, words);
  assert.doesNotMatch(CSSC, words);
  world();
  const { root } = await mount();
  assert.doesNotMatch(text(root), words);
});

test('the screen restates the limits it enforces exactly as src/lib/groups.ts has them', () => {
  assert.match(JS, new RegExp('const NAME_MAX = ' + LIMITS.nameMax + ';'));
  assert.match(JS, new RegExp('const BATCH_MAX = ' + LIMITS.invitesPerBatch + ';'));
});

test('design rules: scoped, no shadow, 44px targets, --accent, tabular, US spelling, no bare fetch', () => {
  const selectors = CSSC.split('}').map((b) => b.split('{')[0].trim()).filter(Boolean);
  for (const s of selectors) for (const part of s.split(',')) assert.ok(part.trim().startsWith('.scr-g2-commish'), 'unscoped: ' + part);
  assert.doesNotMatch(CSSC + JSC, /box-shadow/);
  assert.doesNotMatch(CSSC + JSC, /--maroon|--gold/);
  assert.match(CSSC, /var\(--accent\)/);
  assert.match(CSSC, /1px solid var\(--line\)/);
  for (const cls of ['g2-btn', 'g2-in', 'g2-switch', 'g2-door', 'g2-m-row']) {
    assert.match(CSSC, new RegExp('\\.' + cls + ' \\{[^}]*min-height: var\\(--tap-min\\)'), cls + ' under 44px');
  }
  assert.match(CSSC, /\.scr-g2-commish \{ font-variant-numeric: tabular-nums; \}/);
  for (const re of [/\bcolour/i, /\bcentre\b/i, /\bgrey\b/i, /\bbehaviour/i, /\bfavourite/i]) {
    assert.doesNotMatch(JSC + CSSC, re);
  }
  assert.doesNotMatch(JSC.replace(/window\.agApiFetch\) \|\| fetch/, ''), /\bfetch\s*\(/);
  assert.doesNotMatch(JSC, /<img|createElement\(['"]img|https?:\/\//);
});

test('every var() in the stylesheet resolves to a defined token', () => {
  const defs = ['../public/styles/tokens.css', '../public/styles/shell.css',
    '../public/components/states.js', '../public/components/header.js', '../public/components/group.js',
    '../public/components/nav.js'].map(read).join('\n');
  const defined = new Set([...strip(defs).matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]));
  const missing = [...new Set([...CSSC.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)].map((m) => m[1]))].filter((v) => !defined.has(v));
  assert.deepEqual(missing, []);
});

/* ------------------------------------------------------------ 4 · nine sports
 * Jason, 2026-09-12: "complete the pool revision, but do all the sports for the
 * pool", "do nascar next", then "keep working on making it larger" - MLB, the
 * NHL, the WNBA. Same shaped answers as above, with the group's sport changed. */

function sportWorld(sport, scope = 'all') {
  const g = { ...G, sport };
  world({ groups: [g], det: detail({ group: { ...detail().group, sport, scope, scopeArg: null } }) });
}
const stateCalls = () => CALLS.filter((c) => c.path.startsWith('/api/state/'));

test('sportName gives the nineteen labels, and an unknown sport reads as college football', () => {
  assert.deepEqual([...POOL_SPORTS], ['college-football', 'nfl', 'mens-college-basketball', 'nba', 'f1', 'nascar',
    'mlb', 'nhl', 'wnba', 'nascar-oreilly', 'nascar-truck', 'epl', 'mls',
    'ucl', 'laliga', 'ligamx', 'mens-college-hockey', 'womens-college-basketball', 'props']);
  assert.deepEqual(POOL_SPORTS.map(mod.sportName),
    ['College football', 'NFL', 'College basketball', 'NBA', 'Formula 1', 'NASCAR', 'MLB', 'NHL', 'WNBA',
      'NASCAR O’Reilly', 'NASCAR Trucks', 'Premier League', 'MLS',
      'Champions League', 'La Liga', 'Liga MX', 'College hockey', 'Women’s college basketball', 'Questions']);
  assert.equal(mod.sportName('curling'), 'College football');
  /* Women's college basketball takes the men's two choices; college hockey plays every game;
     a questions group has no which-games and no spread. */
  assert.deepEqual(POOL_SPORTS.map((s) => mod.scopeValues(s).length), [3, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0]);
  assert.equal(mod.hasNoSpread('props'), true);
  assert.equal(mod.isProps('props'), true);
  assert.match(JS.replace(/\/\*[\s\S]*?\*\//g, ' '), /if \(isProps\(sport\)\) nav\.appendChild\(door\('#\/props', 'The questions'/);
  /* The races are the two with no spread - one helper, not two comparisons. */
  assert.deepEqual(POOL_SPORTS.filter(mod.isRacing), ['f1', 'nascar', 'nascar-oreilly', 'nascar-truck']);
  assert.equal(mod.isRacing('curling'), false);
});

test('the header names the sport', async () => {
  for (const [s, label] of [['f1', 'Formula 1'], ['nascar', 'NASCAR'], ['nba', 'NBA'], ['mens-college-basketball', 'College basketball'],
    ['mlb', 'MLB'], ['nhl', 'NHL'], ['wnba', 'WNBA']]) {
    sportWorld(s);
    const { root } = await mount();
    assert.match(text(root), new RegExp('3 members · ' + label));
  }
});

test('college football keeps all three which-games choices, the conference list and the spread', async () => {
  sportWorld('college-football');
  const { root } = await mount();
  assert.match(text(root), /Which games/);
  for (const l of ['All games', 'Top 25', 'Conference']) assert.equal(buttons(root, l).length, 1, l);
  assert.equal(byTag(root, 'select').length, 1, 'the conference list is gone');
  assert.ok(byTag(root, 'button').some((b) => b.attrs.role === 'switch'));
});

test('college basketball: All games and Top 25 only, no conference list, and it saves', async () => {
  sportWorld('mens-college-basketball', 'top25');
  ROUTES['/api/group/settings'] = () => reply(200, { ok: true });
  const { root } = await mount();
  assert.match(text(root), /Which games/);
  assert.equal(buttons(root, 'All games').length, 1);
  assert.equal(buttons(root, 'Top 25').length, 1);
  assert.equal(buttons(root, 'Conference').length, 0, 'conferences are football-only');
  assert.equal(byTag(root, 'select').length, 0, 'a conference list on a basketball group');
  assert.equal(stateCalls().length, 0, 'loaded the football conference list for a basketball group');
  assert.equal(buttons(root, 'Top 25')[0].attrs['aria-checked'], 'true');
  assert.match(text(root), /A college basketball day can have 150 games\./);
  assert.equal(byClass(root, 'g2-seg')[0].style.gridTemplateColumns, '1fr 1fr');
  /* The spread still applies to basketball. */
  assert.ok(byTag(root, 'button').some((b) => b.attrs.role === 'switch'));

  await buttons(root, 'All games')[0].fire('click');
  const save = byClass(root, 'g2-wide').find((b) => b.textContent === 'Save');
  assert.equal(save.disabled, false);
  await save.fire('click');
  assert.deepEqual(CALLS.find((c) => c.path === '/api/group/settings').body,
    { id: G.id, scope: 'all', scopeArg: null });
});

test('NBA: every game, so no which-games section; the spread stays', async () => {
  sportWorld('nba');
  const { root } = await mount();
  assert.doesNotMatch(text(root), /Which games/);
  assert.ok(byTag(root, 'button').some((b) => b.attrs.role === 'switch'));
  assert.equal(stateCalls().length, 0);
});

test('F1: no spread setting and no which-games section', async () => {
  sportWorld('f1');
  const { root } = await mount();
  assert.equal(byTag(root, 'button').filter((b) => b.attrs.role === 'switch').length, 0, 'a spread switch on an F1 group');
  assert.doesNotMatch(text(root), /against the spread|Which games/i);
  /* Rename, invites and members are still there. */
  assert.equal(byTag(root, 'input')[0].value, G.name);
  assert.equal(byClass(root, 'g2-code')[0].textContent, G.id);
  assert.equal(buttons(root, 'Remove').length, 2);
});

test('MLB, NHL and WNBA: run like the NBA - every game, the spread switch, no which-games', async () => {
  for (const [s, label] of [['mlb', 'MLB'], ['nhl', 'NHL'], ['wnba', 'WNBA']]) {
    sportWorld(s);
    ROUTES['/api/group/settings'] = () => reply(200, { ok: true, group: { id: G.id, name: G.name, ats: true } });
    const { root } = await mount();
    assert.match(text(root), new RegExp('3 members · ' + label));
    assert.doesNotMatch(text(root), /Which games/, s + ' offers a which-games choice');
    assert.equal(buttons(root, 'Top 25').length + buttons(root, 'Conference').length, 0);
    assert.equal(stateCalls().length, 0, 'loaded the football conference list for ' + s);
    const sw = byTag(root, 'button').filter((b) => b.attrs.role === 'switch');
    assert.equal(sw.length, 1, s + ' has no spread switch');
    assert.match(text(root), /covers the spread it was picked at/);
    await sw[0].fire('click');
    assert.deepEqual(CALLS.find((c) => c.path === '/api/group/settings').body, { id: G.id, ats: true });
    /* Rename, invites and members are all there. */
    assert.equal(byClass(root, 'g2-code')[0].textContent, G.id);
    assert.equal(buttons(root, 'Remove').length, 2);
  }
});

test('the spread note names MLB\'s run line and the NHL\'s puck line, and nobody else\'s', async () => {
  assert.equal(mod.spreadNote('mlb'), 'In MLB the spread is the run line.');
  assert.equal(mod.spreadNote('nhl'), 'In the NHL the spread is the puck line.');
  for (const s of ['college-football', 'nfl', 'mens-college-basketball', 'nba', 'wnba', 'f1', 'nascar', 'curling']) {
    assert.equal(mod.spreadNote(s), '', s);
  }
  for (const [s, re] of [['mlb', /run line/], ['nhl', /puck line/]]) {
    sportWorld(s);
    const { root } = await mount();
    assert.match(text(root), re, s + ' does not name its line on screen');
  }
  for (const s of ['wnba', 'nba', 'nfl']) {
    sportWorld(s);
    const { root } = await mount();
    assert.doesNotMatch(text(root), /run line|puck line/, s + ' names another sport\'s line');
  }
});

test('NASCAR: no spread setting and no which-games section, like F1', async () => {
  sportWorld('nascar');
  const { root } = await mount();
  assert.match(text(root), /3 members · NASCAR/);
  assert.equal(byTag(root, 'button').filter((b) => b.attrs.role === 'switch').length, 0, 'a spread switch on a NASCAR group');
  assert.doesNotMatch(text(root), /against the spread|Which games/i);
  assert.equal(stateCalls().length, 0, 'loaded the football conference list for a NASCAR group');
  /* Rename, invites and members are still there. */
  assert.equal(byTag(root, 'input')[0].value, G.name);
  assert.equal(byClass(root, 'g2-code')[0].textContent, G.id);
  assert.equal(buttons(root, 'Remove').length, 2);
});
