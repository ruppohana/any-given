/* QUESTIONS, THE SCREEN - public/screens/props.screen.js, the client half of a
 * 'props' group. Jason, 2026-09-13: "add cricket too, and non sports, golf,
 * oscars, everything"; the Emmys are Monday September 14, 2026, 5 PM PT.
 *
 * 🔴 WHAT IS REAL HERE AND WHAT IS NOT.
 *   REAL: src/lib/props.ts - PROP_TEMPLATES (the 2026 Emmys, Survivor 51),
 *         cleanQuestion, isOpen, scoreProps, templatesOpen. The screen imports the
 *         same file the Worker does; every question below is a real template
 *         question run through the real cleanQuestion.
 *   REAL: components/group.js - myGroups() and its signed-in gate, as shipped.
 *   TEST INPUTS, NOT FIXTURES: the groups and the answers of GET /api/props - the
 *         shape of the frozen contract (src/props-pool.ts). No Emmy has been won
 *         yet, so every "answer" here is a test input, never a claimed result.
 *
 * The screen is browser code with server-absolute imports, so it is loaded with
 * those paths re-based onto the real files: THE CODE UNDER TEST IS THE SHIPPED
 * FILE. render() is closed in a real browser at 393px, not here.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PROP_TEMPLATES, cleanQuestion, templatesOpen, scoreProps, VOID, PROPS_LIMITS } from '../src/lib/props.ts';
import { POOL_SPORTS, hasNoSpread } from '../src/lib/groups.ts';

const SRC = readFileSync(new URL('../public/screens/props.screen.js', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../public/screens/props.css', import.meta.url), 'utf8');
const APP = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const TOKENS = readFileSync(new URL('../public/styles/tokens.css', import.meta.url), 'utf8');
const href = (p) => JSON.stringify(new URL(p, import.meta.url).href);
const PATHS = {
  "'/components/states.js'": href('../public/components/states.js'),
  "'/components/header.js'": href('../public/components/header.js'),
  "'/components/group.js'": href('../public/components/group.js'),
  "'/src/lib/props.js'": href('../src/lib/props.ts')
};
let rebased = SRC;
for (const [from, to] of Object.entries(PATHS)) {
  assert.ok(rebased.includes(from), 'the screen no longer imports ' + from);
  rebased = rebased.replace(from, to);
}

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

const P = await import('data:text/javascript;base64,' + Buffer.from(rebased, 'utf8').toString('base64'));
const GROUP = await import('../public/components/group.js');

const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

const EMMYS = PROP_TEMPLATES['emmys-2026'];
const SURV = PROP_TEMPLATES['survivor-51'];
const LOCK = Date.UTC(2026, 8, 15, 0, 0, 0);
const SEP13 = Date.UTC(2026, 8, 13, 19, 0, 0);   /* noon Pacific, the day before */
const AFTER = LOCK + 3 * 3600000;                  /* the show is on */
const PT = 'America/Los_Angeles';

/** The Emmys as the server stores them: cleaned by the real cleanQuestion, with
 *  the qids src/props-pool.ts gives a template (`<id>-<n>`). */
const asStored = (t, now) => t.questions.map((q, i) => ({ qid: t.id + '-' + (i + 1), position: i + 1, answer: null, ...cleanQuestion(q, now) }));
const EQ = asStored(EMMYS, SEP13);

/* ------------------------------------------------------------ the real sets */

test('the ready sets are src/lib/props.ts\'s own: the 2026 Emmys (14, all at the broadcast) and Survivor 51 (2)', () => {
  assert.equal(EMMYS.name, 'The 2026 Emmys');
  assert.equal(EQ.length, 14);
  assert.ok(EQ.every((q) => q.lockAt === LOCK), 'every Emmys question locks at 2026-09-15T00:00Z - 5 PM Pacific on the 14th');
  assert.deepEqual(EQ.slice(0, 3).map((q) => q.points), [3, 3, 3], 'the big three are worth 3');
  assert.equal(SURV.questions.length, 2);
  /* Soonest first - Dancing with the Stars (Sept 16) joined 2026-09-13. */
  assert.deepEqual(templatesOpen(SEP13).map((t) => t.id), ['emmys-2026', 'dwts-35', 'survivor-51']);
  /* A questions group has no spread - the server's own rule. */
  assert.ok(POOL_SPORTS.includes('props'));
  assert.equal(hasNoSpread('props'), true);
});

/* ------------------------------------------------------------ the pure half */

test('only questions groups, the current one first', () => {
  const G = [{ id: 'NFL1', sport: 'nfl' }, { id: 'Q1', sport: 'props', name: 'Emmys night' }, { id: 'Q2', sport: 'props', name: 'Survivor' }];
  assert.deepEqual(P.propsGroupsOf(G).map((g) => g.id), ['Q1', 'Q2']);
  assert.deepEqual(P.propsGroupsOf(null), []);
  assert.equal(P.chooseGroup(P.propsGroupsOf(G), 'Q2').id, 'Q2');
  assert.equal(P.chooseGroup(P.propsGroupsOf(G), 'NFL1').id, 'Q1', 'a current group of another sport falls to the first');
  assert.equal(P.chooseGroup([], 'Q1'), null);
});

test('the remembered set is one this app has, however Home stored it', () => {
  assert.equal(P.rememberedTemplate(JSON.stringify('emmys-2026')), 'emmys-2026', 'store.set writes JSON');
  assert.equal(P.rememberedTemplate('survivor-51'), 'survivor-51');
  assert.equal(P.rememberedTemplate(JSON.stringify('')), '', 'your own questions');
  assert.equal(P.rememberedTemplate('"oscars-2027"'), '', 'a set the app does not have');
  assert.equal(P.rememberedTemplate(null), '');
  assert.equal(P.TEMPLATE_KEY, 'ag.propsTemplate');
});

test('the lock reads in the phone\'s own time: "Locks Mon 5:00 PM", a date past a week, then "Locked"', () => {
  assert.equal(P.lockText(EQ[0], SEP13, PT), 'Locks Mon 5:00 PM');
  assert.equal(P.lockText(EQ[0], LOCK - 1, PT), 'Locks Mon 5:00 PM');
  assert.equal(P.lockText(EQ[0], LOCK, PT), 'Locked', 'locked AT the lock time, as isOpen says');
  const sq = asStored(SURV, SEP13)[0];
  assert.equal(P.lockText(sq, SEP13, PT), 'Locks Wed, Sep 23 · 5:00 PM', 'ten days out carries the date');
  assert.equal(P.lockText(sq, SEP13, 'America/New_York'), 'Locks Wed, Sep 23 · 8:00 PM');
});

test('a question before its lock: pickable, and nobody sees the split even if counts arrive', () => {
  const q = EQ[0];
  const v = P.questionView(q, 'The Pitt', { 'The Pitt': 4 }, SEP13);
  assert.equal(v.open, true);
  assert.equal(v.pick, 'The Pitt');
  assert.equal(v.total, null);
  assert.ok(v.options.every((o) => o.count === null), 'counts are only for a locked question');
  assert.deepEqual(v.options.filter((o) => o.on).map((o) => o.label), ['The Pitt']);
  assert.equal(v.result, '');
  assert.equal(v.options.length, q.options.length);
  assert.equal(P.questionView(q, 'Not a nominee', null, SEP13).pick, '', 'a pick that is not an option is not shown');
});

test('a question after its lock: the split, then the answer - right, wrong, void, no pick', () => {
  const q = EQ[3];     /* Lead Actor, Drama - worth 2 */
  const counts = { [q.options[0]]: 3, [q.options[4]]: 1 };
  const locked = P.questionView(q, q.options[0], counts, AFTER);
  assert.equal(locked.locked, true);
  assert.equal(locked.total, 4);
  assert.deepEqual(locked.options.map((o) => o.count), [3, 0, 0, 0, 1]);
  assert.equal(locked.result, 'Locked · waiting for the answer');
  assert.equal(P.questionView(q, undefined, counts, AFTER).result, 'Locked · no pick');

  /* TEST INPUT: an answer, not a result. */
  const settled = { ...q, answer: q.options[4] };
  const right = P.questionView(settled, q.options[4], counts, AFTER);
  assert.deepEqual([right.won, right.pts, right.result], [true, 2, 'You got it · +2']);
  assert.deepEqual(right.options.filter((o) => o.answer).map((o) => o.label), [q.options[4]]);
  const wrong = P.questionView(settled, q.options[0], counts, AFTER);
  assert.deepEqual([wrong.won, wrong.pts, wrong.result], [false, 0, 'Not this one · 0']);
  const none = P.questionView(settled, undefined, counts, AFTER);
  assert.equal(none.result, 'No pick - the answer was ' + q.options[4]);
  const voided = P.questionView({ ...q, answer: VOID }, q.options[0], counts, AFTER);
  assert.deepEqual([voided.voided, voided.won, voided.pts, voided.result], [true, null, 0, 'Void - this one scores nobody']);
  assert.ok(voided.options.every((o) => !o.answer), 'void marks no option as the answer');
});

test('the pinned total is scoreProps\'s own figure', () => {
  assert.equal(P.totalLine(EQ, {}).text, 'No picks yet');
  const picks = { [EQ[0].qid]: EQ[0].options[0], [EQ[1].qid]: EQ[1].options[1], [EQ[3].qid]: EQ[3].options[2] };
  assert.equal(P.totalLine(EQ, picks).text, '3 of 14 picked · no answers in yet');
  /* TEST INPUTS: two answers entered, one void. */
  const qs = EQ.map((q, i) => (i === 0 ? { ...q, answer: q.options[0] } : i === 1 ? { ...q, answer: q.options[0] }
    : i === 3 ? { ...q, answer: VOID } : q));
  const t = P.totalLine(qs, picks);
  const s = scoreProps(qs, picks);
  assert.deepEqual([t.points, s.points, s.correct, s.settled], [3, 3, 1, 2]);
  assert.equal(t.text, '3 points · 1 of 2 right');
});

test('ready sets offered: the one Home remembered first, none that is already all here', () => {
  const open = templatesOpen(SEP13);
  assert.deepEqual(P.offeredTemplates(open, '', []).map((t) => t.id), ['emmys-2026', 'dwts-35', 'survivor-51']);
  assert.deepEqual(P.offeredTemplates(open, 'survivor-51', []).map((t) => t.id), ['survivor-51', 'emmys-2026', 'dwts-35']);
  assert.equal(P.loadedCount('emmys-2026', EQ), 14);
  assert.deepEqual(P.offeredTemplates(open, 'emmys-2026', EQ).map((t) => t.id), ['dwts-35', 'survivor-51'], 'the Emmys are in');
  assert.deepEqual(P.offeredTemplates(open, '', EQ.slice(0, 5)).map((t) => t.id), ['emmys-2026', 'dwts-35', 'survivor-51'],
    'half a set is offered again (the server loads only what is missing)');
  assert.deepEqual(P.offeredTemplates(undefined, '', []), []);
});

test('add a question: the next whole hour by default, and the same cleanQuestion the server runs', () => {
  const now = new Date(2026, 8, 13, 14, 37).getTime();
  assert.equal(P.defaultLockLocal(now), '2026-09-13T15:00');
  const ok = P.formQuestion({ text: '  Who wins Best Picture?  ', options: 'Sinners\n\nOne Battle After Another\nsinners\n', points: 3, lock: '2026-09-13T15:00' }, now);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.question, cleanQuestion({ text: 'Who wins Best Picture?', options: ['Sinners', 'One Battle After Another', 'sinners'], points: 3,
    lockAt: new Date('2026-09-13T15:00').getTime() }, now));
  assert.deepEqual(ok.question.options, ['Sinners', 'One Battle After Another'], 'a repeat in another case is dropped');
  assert.equal(P.formQuestion({ text: '', options: 'a\nb', lock: '2026-09-13T15:00' }, now).error, 'Write the question.');
  assert.equal(P.formQuestion({ text: 'Q', options: 'only one', lock: '2026-09-13T15:00' }, now).error,
    'Give at least two different options, one per line.');
  assert.equal(P.formQuestion({ text: 'Q', options: 'a\nb', lock: '2026-09-13T14:00' }, now).error, 'Choose a lock time in the future.');
  assert.equal(P.formQuestion({ text: 'Q', options: 'a\nb', lock: '' }, now).error, 'Choose when it locks.');
  assert.equal(P.formQuestion({ text: 'Q', options: 'a\nb', points: 99, lock: '2026-09-13T15:00' }, now).question.points, PROPS_LIMITS.pointsMax);
});

/* ------------------------------------------------------------ the data */

const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
let CALLS = [];
let ROUTE = {};
function api(url, opts) {
  CALLS.push({ url: String(url), body: opts && opts.body ? JSON.parse(opts.body) : undefined });
  const path = String(url).split('?')[0];
  const h = ROUTE[path];
  if (!h) return Promise.resolve(json({ error: 'not found' }, 404));
  return Promise.resolve(h(String(url), opts));
}
globalThis.agApiFetch = api;
const signIn = () => { STORE.set('ag.session', 't'); STORE.set('ag.handle', 'cora'); };
const G_Q = { id: 'QQQ111', name: 'Emmys night', sport: 'props', members: 3, role: 'commissioner' };
const G_Q2 = { id: 'QQQ222', name: 'Survivor pool', sport: 'props', members: 5, role: 'member' };
const G_NFL = { id: 'NFL111', name: 'Sundays', sport: 'nfl', members: 4, role: 'member' };
const PROPS_OK = (pool) => ({ pool, name: 'Emmys night', role: 'commissioner', now: SEP13, questions: [], picks: {}, counts: {},
  templates: templatesOpen(SEP13), limits: PROPS_LIMITS });

beforeEach(() => { STORE.clear(); CALLS = []; ROUTE = {}; GROUP.forgetGroups(); });

test('signed out: the sign-in view, and nothing is asked of the server', async () => {
  const d = await P.loadProps(api);
  assert.equal(d.view, 'signed-out');
  assert.equal(d.noSample, true);
  assert.deepEqual(CALLS, []);
});

test('signed in, no questions group: the start view, carrying the set Home remembered', async () => {
  signIn();
  STORE.set('ag.propsTemplate', JSON.stringify('emmys-2026'));
  ROUTE['/api/group/mine'] = () => json({ groups: [G_NFL], kindness: 'k' });
  const d = await P.loadProps(api);
  assert.equal(d.view, 'no-group');
  assert.equal(d.template, 'emmys-2026');
  assert.deepEqual(CALLS.map((c) => c.url), ['/api/group/mine'], 'no questions are asked for with no questions group');
});

test('ready: the questions group is chosen over the NFL one, made current, and read with the server clock', async () => {
  signIn();
  STORE.set('ag.group', G_NFL.id);
  ROUTE['/api/group/mine'] = () => json({ groups: [G_NFL, G_Q, G_Q2], kindness: 'k' });
  ROUTE['/api/props'] = (url) => json(PROPS_OK(new URL(url, 'http://x').searchParams.get('pool')));
  const d = await P.loadProps(api);
  assert.equal(d.view, 'ready');
  assert.deepEqual(d.groups.map((g) => g.id), [G_Q.id, G_Q2.id], 'only questions groups in the switcher');
  assert.equal(d.groupId, G_Q.id);
  assert.equal(STORE.get('ag.group'), G_Q.id);
  assert.equal(CALLS[1].url, '/api/props?pool=' + G_Q.id);
  assert.ok(Math.abs(Date.now() + d.skew - SEP13) < 5000, 'locks are read against the server\'s now');
  assert.equal(d.props.templates.length, 3, 'the Emmys, Dancing with the Stars and Survivor are all open on the 13th');
});

test('a group you have left: asked once more with a fresh list, then the start view', async () => {
  signIn();
  let n = 0;
  ROUTE['/api/group/mine'] = () => json({ groups: n++ === 0 ? [G_Q] : [], kindness: 'k' });
  ROUTE['/api/props'] = () => json({ error: 'not_a_member', message: 'You are not in this group.' }, 403);
  const d = await P.loadProps(api);
  assert.equal(d.view, 'no-group');
  assert.deepEqual(CALLS.map((c) => c.url), ['/api/group/mine', '/api/props?pool=' + G_Q.id, '/api/group/mine']);
});

test('offline and a server error: each its own view, the server\'s sentence kept', async () => {
  signIn();
  ROUTE['/api/group/mine'] = () => json({ groups: [G_Q], kindness: 'k' });
  ROUTE['/api/props'] = () => { throw new TypeError('Failed to fetch'); };
  assert.equal((await P.loadProps(api)).view, 'offline');
  ROUTE['/api/props'] = () => json({ error: 'no database', message: 'Try again soon.' }, 503);
  const e = await P.loadProps(api, { force: true });
  assert.deepEqual([e.view, e.message], ['error', 'Try again soon.']);
});

test('every write is the frozen contract\'s shape', async () => {
  ROUTE['/api/props/pick'] = () => json({ ok: true });
  const r = await P.call(api, '/api/props/pick', { pool: 'QQQ111', qid: 'emmys-2026-1', choice: 'The Pitt' });
  assert.equal(r.ok, true);
  assert.deepEqual(CALLS[0].body, { pool: 'QQQ111', qid: 'emmys-2026-1', choice: 'The Pitt' });
  ROUTE['/api/props/settle'] = () => json({ error: 'not_locked', message: 'Answer it once it has locked - people can still change their picks.' }, 409);
  const s = await P.call(api, '/api/props/settle', { pool: 'QQQ111', qid: 'emmys-2026-1', answer: 'The Pitt' });
  assert.equal(P.failText(s, 'x'), 'Answer it once it has locked - people can still change their picks.');
  assert.equal(P.failText({ offline: true }, 'x'), 'No connection. Nothing was changed.');
  /* Every path the screen posts to is one src/props-pool.ts serves. */
  const posted = [...new Set([...code(SRC).matchAll(/'(\/api\/props[a-z/]*)'/g)].map((m) => m[1]))].sort();
  assert.deepEqual(posted, ['/api/props/delete', '/api/props/pick', '/api/props/questions', '/api/props/settle', '/api/props/template']);
  assert.match(code(SRC), /'\/api\/props\?pool=' \+ encodeURIComponent\(g\.id\)/);
});

test('harness states touch no network and carry no group', async () => {
  for (const s of ['signed-out', 'no-group', 'loading', 'offline', 'error']) {
    const d = await P.previewData({}, s);
    assert.deepEqual(d, { noSample: true, view: s });
  }
  assert.deepEqual(CALLS, []);
  for (const s of ['ready', 'signed-out', 'no-group', 'loading', 'offline', 'error']) assert.ok(P.states.includes(s));
});

/* ------------------------------------------------------------ the rules on screen */

test('the commissioner\'s answer is two taps: choosing only selects, Save names the answer and sends it', () => {
  const c = code(SRC);
  const box = c.slice(c.indexOf('function answerBox('), c.indexOf('function commishPanel('));
  /* Choosing an option sets d.chosen and redraws - it never calls the server. */
  assert.match(box, /\(\) => \{ d\.chosen = val; draw\(host, d, 'ready'\); \}/);
  assert.match(box, /'Save: ' \+ d\.chosen/);
  assert.match(box, /if \(!d\.chosen\) save\.disabled = true;/);
  assert.equal((box.match(/'\/api\/props\/settle'/g) || []).length, 2, 'one send for Save, one for Clear the answer');
  assert.match(box, /\[VOID, 'Void - nobody scores'\]/);
  /* Delete is two taps too, and only before a lock. */
  assert.match(c, /isCommish\) card\.appendChild\(v\.open \? deleteRow\(host, d, q\) : answerBox\(host, d, q, v\)\)/);
});

test('#/props is a group-bar pool route, not a betting route, and titled Questions', () => {
  assert.match(APP, /\{ id: 'props',\s+dest: 'g-pool',\s+nav: 'group', screen: 'props',\s+state: 'ready',/);
  const betting = (APP.match(/const BETTING_ROUTES = new Set\(\[([^\]]+)\]\)/) || [])[1];
  assert.ok(betting && !betting.includes("'props'"));
  assert.match(APP, /props: 'Questions',/);
});

test('the stylesheet: tokens that exist, 44px options, 52px answer buttons, no shadows', () => {
  const vars = [...new Set([...CSS.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]))];
  for (const v of vars) assert.match(TOKENS, new RegExp(v + ':'), v + ' is not a token');
  assert.match(CSS, /\.scr-props \.pr-opt \{[^}]*min-height: var\(--tap-min\)/);
  assert.match(CSS, /\.scr-props \.pr-ans-b \{[^}]*min-height: 52px/);
  assert.match(CSS, /\.scr-props \.pr-save \{ min-height: 52px; \}/);
  assert.doesNotMatch(code(CSS), /box-shadow/);
  assert.match(TOKENS, /--tap-min:\s*44px;/);
});
