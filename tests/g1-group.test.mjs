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
 *   - nine sports, in POOL_SPORTS order (2026-09-12, "do all the sports for the
 *     pool", "do nascar next", then MLB, the NHL and the WNBA): one native select
 *     grouped by family, the payload per sport, college basketball's two
 *     which-games choices, no spread for the races (F1, NASCAR), the day sports
 *     held equal to src/lib/day.ts, and the word each sport's picks lock at
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DAY_SPORTS as SERVER_DAY } from '../src/lib/day.ts';

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

test('Create sends pledge: true, a real sport and the spread choice (NFL: no scope)', () => {
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

/* ---------------------------------------------------------- nine sports
 * Jason, 2026-09-12: "complete the pool revision, but do all the sports for the
 * pool", "do nascar next", then "keep working on making it larger and more
 * robust" - MLB, the NHL, the WNBA. The ids are src/lib/groups.ts POOL_SPORTS,
 * read here as text with its comments out (the array carries one). */

const POOL_SPORTS = ((code(LIB).match(/POOL_SPORTS\s*=\s*\[([^\]]+)\]/) || [])[1] || '')
  .split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
const HAS = { name: 'A-Test', pledged: true };
const NEW3 = ['mlb', 'nhl', 'wnba'];

test('the Sport control offers all thirteen, in POOL_SPORTS order, with their labels', () => {
  /* NASCAR's O'Reilly and Truck series joined 2026-09-13, then the Premier League and MLS. */
  assert.deepEqual(POOL_SPORTS, ['college-football', 'nfl', 'mens-college-basketball', 'nba', 'f1', 'nascar',
    'mlb', 'nhl', 'wnba', 'nascar-oreilly', 'nascar-truck', 'epl', 'mls']);
  assert.deepEqual(mod.SPORTS.map((s) => s[0]), POOL_SPORTS, 'the screen and the server disagree on the sports');
  assert.deepEqual(mod.SPORTS.map((s) => s[1]), ['College football', 'NFL', 'College basketball', 'NBA', 'Formula 1',
    'NASCAR', 'MLB', 'NHL', 'WNBA', 'NASCAR O’Reilly', 'NASCAR Trucks', 'Premier League', 'MLS']);
  for (const [id, label] of mod.SPORTS) assert.equal(mod.sportLabel(id), label);
  assert.equal(mod.sportLabel('curling'), 'College football', 'an unknown sport reads as the server reads it');
  assert.equal(mod.sportLabel(undefined), 'College football');
});

test('one native select, grouped by family - every sport in exactly one', () => {
  assert.deepEqual(mod.SPORT_FAMILIES, [
    ['Football', ['college-football', 'nfl']],
    ['Basketball', ['mens-college-basketball', 'nba', 'wnba']],
    ['Baseball', ['mlb']],
    ['Hockey', ['nhl']],
    ['Racing', ['f1', 'nascar', 'nascar-oreilly', 'nascar-truck']],
    ['Soccer', ['epl', 'mls']]
  ]);
  const flat = mod.SPORT_FAMILIES.flatMap((f) => f[1]);
  assert.equal(new Set(flat).size, flat.length, 'a sport is in two families');
  assert.deepEqual([...flat].sort(), [...POOL_SPORTS].sort(), 'a sport is in no family, so it cannot be chosen');
  /* The control is built from that list: a <select> with a real <label>, one
   * <optgroup> a family, each option's words from sportLabel. */
  assert.match(CJS, /const sportSel = el\('select', 'g1-input g1-sport'\)/);
  assert.match(CJS, /sportLab\.setAttribute\('for', sportId\)/);
  assert.match(CJS, /for \(const \[fam, ids\] of SPORT_FAMILIES\)/);
  assert.match(CJS, /document\.createElement\('optgroup'\)/);
  assert.match(CJS, /og\.label = fam;/);
  assert.match(CJS, /el\('option', '', sportLabel\(v\)\)/);
  assert.match(CJS, /sportSel\.value = form\.sport;/, 'the select does not open on the default');
  assert.match(CJS, /form\.sport = poolSport\(sportSel\.value\);/);
  /* The nine-button grid is gone, not left behind hidden. */
  assert.doesNotMatch(CJS + CCSS, /g1-seg--sport/);
  assert.doesNotMatch(CJS, /'Sport'\);\s*\n\s*const seg/);
});

test('the sport default is ag.sport when it is one of the nine, else college football', () => {
  for (const s of POOL_SPORTS) assert.equal(mod.poolSport(s), s);
  for (const s of ['soccer', '', null, undefined, 42, 'MLB']) assert.equal(mod.poolSport(s), 'college-football');
  assert.match(CJS, /return poolSport\(JSON\.parse\(localStorage\.getItem\('ag\.sport'\)\)\)/);
  assert.match(CJS, /const sport0 = poolSport\(data\.sportDefault\)/);
});

test('nine sports on a 393px phone: one full-width 44px select', () => {
  /* The select is a .g1-input, which carries the full width and the 44px. */
  assert.match(CCSS, /\.scr-g1-group \.g1-input,\s*\.scr-g1-group \.g1-ta \{\s*width: 100%; min-height: var\(--tap-min\);/);
  assert.match(CCSS, /\.scr-g1-group \.g1-sport \{/);
  const TOKENS = readFileSync(new URL('../public/styles/tokens.css', import.meta.url), 'utf8');
  assert.match(TOKENS, /--tap-min:\s*44px;/);
  /* Which games still uses the segmented buttons, 44px each. */
  assert.match(CCSS, /\.scr-g1-group \.g1-seg \{ display: grid; grid-template-columns: 1fr 1fr;/);
  assert.match(CCSS, /\.scr-g1-group \.g1-seg-b \{\s*min-height: var\(--tap-min\);/);
  /* A hidden which-games button and the hidden spread row must actually hide:
   * display: grid / flex beats the browser's own [hidden]. */
  assert.match(CCSS, /\.g1-seg-b\[hidden\] \{ display: none; \}/);
  assert.match(CCSS, /\.g1-switch-row\[hidden\] \{ display: none; \}/);
  /* The line under the select says how the chosen sport plays, and the select
   * points at it. */
  assert.match(CJS, /sportSel\.setAttribute\('aria-describedby', sportLine\.id\)/);
  assert.match(CJS, /function paintSport\(\) \{ sportLine\.textContent = sportNote\(form\.sport\); \}/);
});

test('what Create sends, per sport', () => {
  assert.deepEqual(mod.createPayload({ ...HAS, sport: 'college-football' }),
    { name: 'A-Test', sport: 'college-football', pledge: true, ats: false, scope: 'all', scopeArg: null });
  assert.deepEqual(mod.createPayload({ ...HAS, sport: 'college-football', scope: 'conference', scopeArg: 'Big Ten', ats: true }),
    { name: 'A-Test', sport: 'college-football', pledge: true, ats: true, scope: 'conference', scopeArg: 'Big Ten' });
  assert.deepEqual(mod.createPayload({ ...HAS, sport: 'nfl', scope: 'top25' }),
    { name: 'A-Test', sport: 'nfl', pledge: true, ats: false }, 'NFL is always all games');
  assert.deepEqual(mod.createPayload({ ...HAS, sport: 'mens-college-basketball' }),
    { name: 'A-Test', sport: 'mens-college-basketball', pledge: true, ats: false, scope: 'top25', scopeArg: null },
    'college basketball starts at the Top 25');
  assert.deepEqual(mod.createPayload({ ...HAS, sport: 'mens-college-basketball', scope: 'all', ats: true }),
    { name: 'A-Test', sport: 'mens-college-basketball', pledge: true, ats: true, scope: 'all', scopeArg: null });
  assert.deepEqual(mod.createPayload({ ...HAS, sport: 'mens-college-basketball', scope: 'conference', scopeArg: 'Big Ten' }),
    { name: 'A-Test', sport: 'mens-college-basketball', pledge: true, ats: false, scope: 'top25', scopeArg: null },
    'a conference is never sent for basketball - it is not offered');
  assert.deepEqual(mod.createPayload({ ...HAS, sport: 'nba', scope: 'top25', ats: true }),
    { name: 'A-Test', sport: 'nba', pledge: true, ats: true });
  assert.deepEqual(mod.createPayload({ ...HAS, sport: 'f1', scope: 'top25', ats: true }),
    { name: 'A-Test', sport: 'f1', pledge: true, ats: false }, 'F1 never sends the spread on');
  assert.deepEqual(mod.createPayload({ ...HAS, sport: 'nascar', scope: 'conference', scopeArg: 'SEC', ats: true }),
    { name: 'A-Test', sport: 'nascar', pledge: true, ats: false }, 'NASCAR never sends the spread on, nor a scope');
  /* MLB, the NHL and the WNBA send exactly what the NBA sends: every game, so no
   * scope, and the spread when it is on. */
  for (const s of NEW3) {
    assert.deepEqual(mod.createPayload({ ...HAS, sport: s, scope: 'conference', scopeArg: 'SEC', ats: true }),
      { name: 'A-Test', sport: s, pledge: true, ats: true }, s + ' sends a scope or drops the spread');
    assert.deepEqual(mod.createPayload({ ...HAS, sport: s }),
      { name: 'A-Test', sport: s, pledge: true, ats: false }, s + ' turns the spread on by itself');
    const nba = mod.createPayload({ ...HAS, sport: 'nba', scope: 'top25', ats: true });
    assert.deepEqual(mod.createPayload({ ...HAS, sport: s, scope: 'top25', ats: true }), { ...nba, sport: s },
      s + ' is not sent the way an NBA group is');
  }
});

test('the races are F1 and NASCAR, through one helper', () => {
  assert.deepEqual(POOL_SPORTS.filter(mod.isRacing), ['f1', 'nascar', 'nascar-oreilly', 'nascar-truck']);
  assert.equal(mod.isRacing('curling'), false, 'an unknown sport is college football, not a race');
  /* The races and soccer send no spread - one helper, hasNoSpread (2026-09-13). */
  assert.match(CJS, /ats: !hasNoSpread\(sport\) && !!\(form && form\.ats\)/);
});

test('which games: three for college football, All games and Top 25 for college basketball, none else', () => {
  assert.deepEqual(mod.scopeValues('college-football'), ['all', 'top25', 'conference']);
  assert.deepEqual(mod.scopeValues('mens-college-basketball'), ['all', 'top25']);
  for (const s of ['nfl', 'nba', 'f1', 'nascar', ...NEW3]) assert.deepEqual(mod.scopeValues(s), [], s);
  for (const s of NEW3) assert.equal(mod.defaultScope(s), 'all');
  assert.equal(mod.defaultScope('mens-college-basketball'), 'top25');
  assert.equal(mod.defaultScope('college-football'), 'all');
  assert.match(mod.basketballScopeNote('top25'), /A college basketball day can have 150 games\.$/);
  assert.match(mod.basketballScopeNote('all'), /A college basketball day can have 150 games\.$/);
  /* The screen hides what a sport does not offer, and shows the conference list
   * only for college football. */
  assert.match(CJS, /b\.hidden = !offered\.includes\(b\.dataset\.v\)/);
  assert.match(CJS, /confSel\.hidden = !\(form\.sport === 'college-football' && form\.scope === 'conference'\)/);
});

test('a conference is required only for college football set to one conference', () => {
  const k = { pledged: true, kindness: KINDNESS };
  assert.equal(mod.canCreate({ ...k, sport: 'college-football', scope: 'conference', scopeArg: '' }), false);
  assert.equal(mod.canCreate({ ...k, sport: 'college-football', scope: 'conference', scopeArg: 'SEC' }), true);
  for (const s of ['nfl', 'mens-college-basketball', 'nba', 'f1', 'nascar', ...NEW3]) {
    assert.equal(mod.canCreate({ ...k, sport: s, scope: 'conference', scopeArg: '' }), true, s);
  }
});

test('F1 and NASCAR hide the against-the-spread switch; MLB, NHL and WNBA keep it', () => {
  assert.match(CJS, /function paintAts\(\) \{\s*sw\.hidden = hasNoSpread\(form\.sport\);/);
  assert.match(CJS, /paintSport\(\); paintScope\(\); paintAts\(\);/, 'changing sport repaints the note, scope and switch');
  for (const s of NEW3) assert.equal(mod.isRacing(s), false, s + ' would hide the spread');
});

test('the spread switch names MLB\'s run line and the NHL\'s puck line', () => {
  assert.equal(mod.spreadNote('mlb'), 'In MLB the spread is the run line.');
  assert.equal(mod.spreadNote('nhl'), 'In the NHL the spread is the puck line.');
  for (const s of ['college-football', 'nfl', 'mens-college-basketball', 'nba', 'wnba', 'f1', 'nascar', 'curling']) {
    assert.equal(mod.spreadNote(s), '', s);
  }
  assert.match(CJS, /spreadNote\(form\.sport\)/, 'the switch note does not say it');
});

test('MLB, NHL and WNBA play like the NBA: a day at a time, through one helper', () => {
  assert.deepEqual(POOL_SPORTS.filter(mod.isDaySport), ['mens-college-basketball', 'nba', 'mlb', 'nhl', 'wnba', 'epl', 'mls']);
  assert.deepEqual([...mod.DAY_SPORTS].sort(), Object.keys(SERVER_DAY).sort(),
    'the screen and src/lib/day.ts disagree on which sports pick a day at a time');
  assert.equal(mod.isDaySport('curling'), false, 'an unknown sport is college football, not a day sport');
  for (const s of NEW3) {
    assert.equal(mod.periodLabel(s, 20260912), 'A day at a time', s + ' prints its day as a week');
    assert.equal(mod.periodLabel(s, null), 'A day at a time');
    assert.equal(mod.picksLine({ sport: s, ats: true }), 'Picks against the spread');
    assert.equal(mod.picksLine({ sport: s, ats: false }), 'Picks straight up - who wins');
    assert.equal(mod.shareText('A-Test', 'BCD234', s),
      'Join my group A-Test on Any Given. Pick the winners each day, scored in points. Code BCD234');
  }
  /* No sport list typed inline where the helper belongs. */
  assert.doesNotMatch(CJS, /=== 'nba' \|\| s === 'mens-college-basketball'/);
});

test('picks lock at the sport\'s own word: tip-off, first pitch, puck drop, kickoff', () => {
  const want = { 'college-football': 'kickoff', nfl: 'kickoff', 'mens-college-basketball': 'tip-off', nba: 'tip-off',
    wnba: 'tip-off', mlb: 'first pitch', nhl: 'puck drop', f1: '', nascar: '', 'nascar-oreilly': '', 'nascar-truck': '',
    epl: 'kickoff', mls: 'kickoff' };
  for (const s of POOL_SPORTS) assert.equal(mod.lockWord(s), want[s], s);
  assert.equal(mod.sportNote('mlb'), 'Pick the winners a day at a time. Every pick locks at first pitch.');
  assert.equal(mod.sportNote('nhl'), 'Pick the winners a day at a time. Every pick locks at puck drop.');
  assert.equal(mod.sportNote('wnba'), 'Pick the winners a day at a time. Every pick locks at tip-off.');
  assert.equal(mod.sportNote('mens-college-basketball'), 'Pick the winners a day at a time. Every pick locks at tip-off.');
  assert.equal(mod.sportNote('nfl'), 'Pick the winners each week. Every pick locks at kickoff.');
  assert.equal(mod.sportNote('curling'), 'Pick the winners each week. Every pick locks at kickoff.');
  assert.match(mod.sportNote('f1'), /scored in points\. Each pick locks when its session starts\.$/);
  assert.match(mod.sportNote('nascar'), /scored in points\. Every pick locks at the green flag\.$/);
});

test('NASCAR on the group card: race days, points, and its own share line', () => {
  assert.equal(mod.sportLabel('nascar'), 'NASCAR');
  assert.equal(mod.periodLabel('nascar', null), 'Race days');
  assert.equal(mod.periodLabel('nascar', 3), 'Race days', 'a NASCAR group never prints a week number');
  assert.equal(mod.picksLine({ sport: 'nascar', ats: true }), 'Race day picks, scored in points');
  assert.equal(mod.shareText('A-Test', 'BCD234', 'nascar'),
    'Join my group A-Test on Any Given. Pick the race: the top three, the winning make, the pole-sitter and a dark horse, scored in points. Code BCD234');
});

test('the group card: football unchanged, basketball by the day, F1 in points', () => {
  assert.equal(mod.periodLabel('nfl', 3), 'Week 3');
  assert.equal(mod.periodLabel('college-football', null), 'Week not set');
  assert.equal(mod.periodLabel('mens-college-basketball', 20261115), 'A day at a time');
  assert.equal(mod.periodLabel('nba', 20261115), 'A day at a time');
  assert.equal(mod.periodLabel('f1', null), 'Race weekends');
  assert.equal(mod.picksLine({ sport: 'nfl', ats: true }), 'Picks against the spread');
  assert.equal(mod.picksLine({ sport: 'college-football', ats: false }), 'Picks straight up - who wins');
  assert.equal(mod.picksLine({ sport: 'f1', ats: true }), 'Race weekend picks, scored in points');
  assert.equal(mod.shareText('A-Test', 'BCD234'),
    'Join my group A-Test on Any Given. Pick the winners each week, scored in points. Code BCD234');
  assert.match(mod.shareText('A-Test', 'BCD234', 'f1'), /Pick the race weekend/);
  assert.match(mod.shareText('A-Test', 'BCD234', 'nba'), /each day/);
});
