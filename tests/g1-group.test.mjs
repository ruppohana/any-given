/* G1 - the group page (#/g). What this file pins, and what it cannot.
 *
 * The screen is browser code with server-absolute imports, so it is loaded here
 * with its import lines stripped (the p2-slate pattern). Only the pure helpers
 * run; they touch neither the DOM nor an imported binding. There is no fake DOM
 * and no invented group: the layout and every state were closed in a real
 * browser at 393px against the local Worker, not here.
 *
 * Pinned:
 *   - the states it declares, and which view each myGroups() answer becomes
 *   - the kindness pledge gates Create, and Create only ever sends pledge: true
 *   - no email address anywhere, and nothing reads a member's address
 *   - no live-board words anywhere in the group page
 *   - the in-page two-tap leave (never window.confirm), and the commissioner's
 *     leave question names the longest-standing member
 *   - the limits match src/lib/groups.ts, every var() is a defined token, no shadow
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const JS = readFileSync(new URL('../public/screens/g1-group.screen.js', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../public/screens/g1-group.css', import.meta.url), 'utf8');
const LIB = readFileSync(new URL('../src/lib/groups.ts', import.meta.url), 'utf8');

/** Comments out, so a rule quoted in a comment is not read as a breach of it. */
function code(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
const CJS = code(JS);
const CCSS = code(CSS);

const mod = await import('data:text/javascript;base64,' +
  Buffer.from(JS.replace(/^import[^;]*;$/gm, ''), 'utf8').toString('base64'));

const KINDNESS = (LIB.match(/KINDNESS\s*=\s*\n?\s*'([^']+)'/) || [])[1];

/* ------------------------------------------------------------ the states */

test('declares every state the group contract asks for', () => {
  for (const s of ['ready', 'no-group', 'signed-out', 'loading', 'offline', 'error', 'empty']) {
    assert.ok(mod.states.includes(s), 'missing state ' + s);
  }
  assert.equal(mod.id, 'g1-group');
  assert.equal(typeof mod.render, 'function');
  assert.equal(typeof mod.previewData, 'function');
});

test('each myGroups() answer maps to one view', () => {
  assert.equal(mod.viewFor({ signedIn: false, groups: [], kindness: '' }), 'signed-out');
  assert.equal(mod.viewFor(null), 'signed-out');
  assert.equal(mod.viewFor({ signedIn: true, groups: [], kindness: 'k', error: 'offline' }), 'offline');
  assert.equal(mod.viewFor({ signedIn: true, groups: [], kindness: '', error: 'error' }), 'error');
  assert.equal(mod.viewFor({ signedIn: true, groups: [], kindness: 'k' }), 'no-group');
  assert.equal(mod.viewFor({ signedIn: true, groups: [{ id: 'X' }], kindness: 'k' }), 'ready');
});

test('harness states other than ready never touch the network and carry no group', async () => {
  const realFetch = globalThis.fetch;
  let called = 0;
  globalThis.fetch = () => { called++; throw new Error('no network in a harness state'); };
  try {
    for (const s of ['no-group', 'empty', 'signed-out', 'loading', 'offline', 'error']) {
      const d = await mod.previewData({}, s);
      assert.equal(d.view, s === 'empty' ? 'no-group' : s);
      assert.equal(d.noSample, true, 'the sample-data banner must not cover a group page');
      assert.equal(d.detail, undefined, 'a harness state must not invent a group');
      assert.equal(d.groups, undefined);
    }
    assert.equal(called, 0);
  } finally { globalThis.fetch = realFetch; }
});

/* ------------------------------------------------------------ the pledge */

test('Create stays off until the pledge is ticked - and the pledge has words', () => {
  assert.ok(KINDNESS, 'could not read KINDNESS from src/lib/groups.ts');
  assert.equal(mod.canCreate({ pledged: false, kindness: KINDNESS, name: 'A-Test' }), false);
  assert.equal(mod.canCreate({ pledged: true, kindness: KINDNESS, name: 'A-Test' }), true);
  assert.equal(mod.canCreate({ pledged: 'yes', kindness: KINDNESS }), false, 'only a real tick counts');
  assert.equal(mod.canCreate({ pledged: true, kindness: '' }), false, 'a box beside no sentence is no pledge');
  assert.equal(mod.canCreate(null), false);
  /* The screen wires the button to it, not to its own copy of the rule. */
  assert.match(CJS, /create\.disabled\s*=\s*!canCreate\(form\)/);
  assert.match(CJS, /if\s*\(!canCreate\(form\)\)\s*return;/, 'submit re-checks the pledge');
});

test('Create sends pledge: true, a real sport and the spread choice', () => {
  const p = mod.createPayload({ name: 'A-Test', sport: 'nfl', ats: true, pledged: true, kindness: KINDNESS });
  assert.deepEqual(p, { name: 'A-Test', sport: 'nfl', pledge: true, ats: true });
  const q = mod.createPayload({ name: 'A-Two', sport: 'anything', pledged: true, kindness: KINDNESS });
  assert.equal(q.sport, 'college-football');
  assert.equal(q.ats, false);
});

test('the pledge text on screen is the API string, never a copy of it', () => {
  assert.equal(CJS.includes(KINDNESS), false, 'the kindness sentence is hard-coded in the screen');
  assert.match(CJS, /kindness:\s*data\.kindness/);
});

/* ---------------------------------------------------------- privacy */

test('no email address anywhere, and nothing reads one', () => {
  assert.equal(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(CJS), false, 'an email address is in the screen');
  assert.equal(/\.email\b/.test(CJS), false, 'the screen reads an .email field');
  assert.equal(/type\s*=\s*['"]email['"]|\.type\s*=\s*['"]email['"]/.test(CJS), false, 'an email input');
  assert.equal(/emails\s*:/.test(CJS), false, 'invites by address belong to the commissioner screen');
  /* Handles only: the member row prints the handle. */
  assert.match(CJS, /'@' \+ m\.name/);
  /* And it says so where the email is written. */
  assert.ok(JS.includes('Nobody sees anyone’s email address'), 'the privacy line is missing');
});

test('no live-board words in the group page', () => {
  const words = /\b(marbles?|stakes?|staked|staking|odds|prices?|priced|bets?|betting|wagers?|wagering)\b/i;
  const strings = (CJS.match(/(['"`])(?:\\.|(?!\1).)*\1/g) || []).join('\n');
  assert.equal(words.test(strings), false, 'a betting word in a string: ' + (strings.match(words) || [])[0]);
  assert.equal(words.test(CCSS), false, 'a betting word in the stylesheet');
});

test('US spelling', () => {
  assert.equal(/\b(colour|centre|grey|behaviour|cancelled|favourite|organis)/i.test(JS + CSS), false);
});

/* ------------------------------------------------------------ leaving */

test('leave is two taps in the page, never window.confirm', () => {
  assert.equal(/\bconfirm\s*\(/.test(CJS), false);
  assert.equal(/\b(alert|prompt)\s*\(/.test(CJS), false);
  assert.match(CJS, /'\/api\/group\/leave'/);
});

test('the commissioner is told the group passes on; the last one out is told it closes', () => {
  const g = { id: 'ABC234', name: 'A-Test' };
  const commish = mod.leaveQuestion({ group: g, you: { role: 'commissioner' },
    members: [{ role: 'commissioner' }, { role: 'player' }] });
  assert.match(commish, /longest-standing member/);
  const last = mod.leaveQuestion({ group: g, you: { role: 'commissioner' }, members: [{ role: 'commissioner' }] });
  assert.match(last, /closes/);
  const player = mod.leaveQuestion({ group: g, you: { role: 'player' }, members: [{}, {}] });
  assert.match(player, /^Leave A-Test\?/);
  assert.equal(/longest-standing/.test(player), false);
});

/* ---------------------------------------------------------- the API */

test('errors are the server message, verbatim', () => {
  assert.equal(mod.errorText({ error: 'no_mailer', message: 'Email is not set up yet.' }, 'x'),
    'Email is not set up yet.');
  assert.equal(mod.errorText({ error: 'full' }, 'fallback'), 'fallback');
  assert.equal(mod.errorText(null, 'fallback'), 'fallback');
});

test('every group call goes through agApiFetch, and render never fetches', () => {
  assert.match(CJS, /window\.agApiFetch\)\s*\|\|\s*fetch/);
  for (const route of ['/api/group/detail', '/api/group/create', '/api/group/join',
                       '/api/group/message', '/api/group/leave']) {
    assert.ok(CJS.includes("'" + route), 'missing ' + route);
  }
  const renderBody = CJS.slice(CJS.indexOf('export function render('), CJS.indexOf('async function refresh('));
  assert.equal(/fetch\(|api\(|load\(/.test(renderBody), false, 'render() reaches the network');
  /* After create, join and leave the cached list is dropped and the current group set. */
  assert.equal((CJS.match(/forgetGroups\(\);/g) || []).length >= 3, true);
  assert.equal((CJS.match(/setCurrentGroupId\(/g) || []).length >= 3, true);
});

test('message payload shape is {id, to, body} to commish or group', () => {
  assert.match(CJS, /'\/api\/group\/message',\s*\{\s*id:\s*d\.group\.id,\s*to,\s*body:\s*ta\.value\s*\}/);
  assert.match(CJS, /compose\(d, open,/);
  assert.ok(CJS.includes("'commish'") && CJS.includes("'group'"));
});

test('the invite prefill reads a code, and a successful join consumes the key', () => {
  assert.equal(mod.prefillCode({ id: 'bcd 234', name: 'x' }), 'BCD234');
  assert.equal(mod.prefillCode(null), '');
  assert.equal(mod.prefillCode('ABC'), '');
  /* An invite link lands here (app.js, amended 2026-09-11), so this page owns
   * the key: cleared after setCurrentGroupId on a join, and nowhere before it. */
  const join = CJS.slice(CJS.indexOf("'/api/group/join'"));
  assert.match(join, /setCurrentGroupId\(j\.group\.id\);[\s\S]{0,300}removeItem\(['"]ag\.pendingPool['"]\)/);
  assert.equal((CJS.match(/removeItem\(['"]ag\.pendingPool/g) || []).length, 1, 'cleared in one place only');
});

/* ---------------------------------------------------------- the limits */

test('the field limits match src/lib/groups.ts', () => {
  assert.equal(mod.NAME_MAX, Number((LIB.match(/nameMax:\s*(\d+)/) || [])[1]));
  assert.equal(mod.MESSAGE_MAX, Number((LIB.match(/messageMax:\s*(\d+)/) || [])[1]));
  assert.equal(mod.counterText(0, 1000), '0 / 1000');
});

/* ---------------------------------------------------------- the design rules */

test('every var() resolves to a defined token', () => {
  const files = ['../public/styles/tokens.css', '../public/styles/shell.css',
                 '../public/components/group.js', '../public/components/header.js',
                 '../public/components/states.js'];
  const text = files.map((f) => readFileSync(new URL(f, import.meta.url), 'utf8')).join('\n');
  const defined = new Set();
  for (const m of code(text).matchAll(/(--[a-z0-9-]+)\s*:/gi)) defined.add(m[1]);
  const missing = new Set();
  for (const m of (CCSS + CJS).matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) if (!defined.has(m[1])) missing.add(m[1]);
  assert.deepEqual([...missing], [], 'undefined: ' + [...missing].join(', '));
});

test('no shadow, no hard-coded maroon or gold, no icon font', () => {
  assert.equal(/box-shadow/i.test(CCSS + CJS), false);
  assert.equal(/--maroon|--gold/.test(CCSS + CJS), false);
  assert.equal(/@font-face|font-awesome|material-icons/i.test(CCSS + CJS), false);
  assert.equal(/:root/.test(CCSS), false, 'nothing is set at :root');
  for (const rule of CCSS.split('}')) {
    if (!rule.trim()) continue;
    assert.ok(/^\s*\.scr-g1-group\b/.test(rule.split('{')[0].split(',').map((s) => s.trim()).join('\n'))
      || rule.split('{')[0].split(',').every((s) => s.trim().startsWith('.scr-g1-group')),
      'unscoped rule: ' + rule.split('{')[0].trim());
  }
});

test('every control is a 44px target and every figure is tabular', () => {
  for (const cls of ['.g1-btn', '.g1-primary', '.g1-danger', '.g1-choice', '.g1-input', '.g1-seg-b',
                     '.g1-switch', '.g1-pledge', '.g1-door', '.g1-code', '.g1-link']) {
    /* The rule that NAMES the class bare - `.g1-primary {` or `.g1-btn,` - not a
     * modifier like `.g1-primary[data-done]` that happens to come first. */
    const m = new RegExp(cls.replace('.', '\\.') + '\\s*[,{]').exec(CCSS);
    assert.ok(m, cls + ' has no rule');
    const at = m.index;
    const block = CCSS.slice(CCSS.indexOf('{', at), CCSS.indexOf('}', at));
    /* A switch may be a 30px pill whose ::after reaches the other 14px - the
     * settings switch, adopted after Jason's "This toggle looks bad." (2026-09-11).
     * 30 + 7 + 7 is still a 44px target. */
    if (cls === '.g1-switch' && /height:\s*30px/.test(block)
        && /\.g1-switch::after\s*\{[^}]*inset:\s*-7px/.test(CCSS)) continue;
    assert.match(block, /min-height:\s*var\(--tap-min\)/, cls + ' is under 44px');
  }
  for (const cls of ['.g1-count', '.g1-code', '.g1-meta', '.g1-sec-h']) {
    const at = CCSS.indexOf(cls + ' {');
    const block = CCSS.slice(at, CCSS.indexOf('}', at));
    assert.match(block, /tabular-nums/, cls + ' is not tabular');
  }
});

test('the header is the shared template with no title of its own', () => {
  assert.match(CJS, /pageHeader\(\{\s*title:\s*'Group',\s*noTitle:\s*true/);
  assert.match(CJS, /groupSwitcher\(data\.groups, data\.currentId/);
  for (const label of ['Commissioner tools', 'Group rules', 'Start another group', 'Join another group',
                       'Leave group', 'Email the commissioner', 'Email the group', 'Start a group', 'Join a group']) {
    assert.ok(CJS.includes("'" + label + "'"), 'missing the label ' + label);
  }
  assert.ok(CJS.includes("'#/gcommish'") && CJS.includes("'#/grules'"));
});
