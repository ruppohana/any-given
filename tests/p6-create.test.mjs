/* P6 - create and commission a pool.
 *
 * 🔴 WHAT THIS FILE CAN AND CANNOT SETTLE, first, because requirement 7.5 is the
 * reason it is the size it is.
 *
 * It CANNOT import p6-create.screen.js. That module's imports are server-absolute
 * ('/components/team-chip.js') because it is browser code with no build step, and
 * Node cannot resolve them - the trap tools/preview.mjs records in its own header.
 * So there is no DOM here and NOT ONE ASSERTION ABOUT LAYOUT.
 *
 * LAYOUT IS CLOSED IN A REAL BROWSER AT 393px AND NOWHERE ELSE. What this file
 * does instead is the two things a test genuinely can settle:
 *
 *   1. THE CONTRACT'S AND THE DISPATCH'S FAILURE LISTS, mechanized against the
 *      source text - the rules that fail the piece regardless of how it looks.
 *   2. THE SCREEN'S ASSUMPTIONS ABOUT REAL DATA, run against the three captured
 *      games and the 760-team file. Every number below was MEASURED from those
 *      files. None of it was written to make a test pass, and nothing in this
 *      repo's fixtures/ was written by this piece.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeColor, teamVars } from '../public/components/team-chip.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const JS = read('../public/screens/p6-create.screen.js');
const CSS = read('../public/screens/p6-create.css');

/* THE CODE CHECKS RUN ON THE CODE, NOT THE COMMENTS. This screen's header quotes
 * the teardown it is defined against, so `Survivor`, `prize pool`, `Password` and
 * `deadline` all legitimately appear in the file as the NAMES OF THINGS IT DOES
 * NOT DO. Both files use only block comments. */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
const JSC = strip(JS);
const CSSC = strip(CSS);

const TEAMS = JSON.parse(read('../fixtures/teams.json')).teams;
const GAMES = [
  'real-utep-at-ou-260905-final.json',
  'real-ball-at-osu-260905-final.json',
  'real-bois-at-ore-260905-final.json'
].map((f) => JSON.parse(read('../fixtures/' + f)));

/* --------------------------------------------- 1 · the rules that fail a piece */

test('the scope selector is drawn BEFORE the name in every editable route', () => {
  /* 🟢 The one ordering decision on this screen. Office Pool asks for the name
   * first; scope is the only control here that changes what the pool IS, so it
   * goes above it. Checked as source order in the three routes that draw both. */
  const bodies = JSC.split('root.appendChild(head(');
  let checked = 0;
  for (const b of bodies.slice(1)) {
    const scope = b.indexOf('scopeSection(');
    const name = b.indexOf('nameSection(');
    if (scope < 0 || name < 0) continue;
    assert.ok(scope < name, 'nameSection is drawn before scopeSection in one route');
    checked++;
  }
  assert.equal(checked, 3, `expected create + error + offline to draw both, got ${checked}`);
});

test('all five scopes ship, and Top 25 is the default', () => {
  for (const v of ['ranked_v_ranked', 'conference', 'top25', 'handpick', 'all']) {
    assert.ok(JSC.includes(`'${v}'`), `missing scope: ${v}`);
  }
  assert.match(JSC, /scope:\s*'top25'/);
  assert.match(JSC, /'Default'/);
});

test('a ranking scope names its source on screen, and both lists are named', () => {
  /* 🔴 Top 25 is the AP poll early and the CFP poll from November and they are
   * DIFFERENT LISTS. The source is a control, not a note. */
  assert.match(JSC, /'ap'/);
  assert.match(JSC, /'cfp'/);
  assert.match(JSC, /AP poll/);
  assert.match(JSC, /CFP poll/);
  /* And it travels with the scope everywhere the scope is written down. */
  assert.match(JSC, /function scopeLabel/);
  assert.match(JSC, /rankingSource/);
});

test('scope is the pool’s, never a per-user filter, and the screen says so', () => {
  assert.match(JSC, /everybody picks the same games or the standings mean nothing/i);
  /* No filter vocabulary anywhere in the controls. */
  assert.equal(/\bmy teams only\b|\bfilter the slate\b|\bhide games\b/i.test(JSC), false);
});

test('one lock rule, and no deadline menu - the ten-option counter-example', () => {
  assert.match(JSC, /first kickoff of week 1/i);
  assert.match(JSC, /There is no deadline menu/i);
  /* Their ten policies, by their own words, must not have been copied in. */
  for (const re of [/30 min(utes)? before/i, /Sunday 10:00/i, /entire week/i,
                    /\bdeadline policy\b/i]) {
    assert.equal(re.test(JSC), false, `a deadline policy leaked in: ${re}`);
  }
});

test('no elimination, no pool types, no survivor mode', () => {
  assert.match(JSC, /Nobody is ever eliminated/i);
  assert.equal(/\bsurvivor mode\b/i.test(JSC.replace(/There is no survivor mode\./i, ' ')), false);
  assert.equal(/\bpool type\b/i.test(JSC), false);
  assert.equal(/\beliminat(ed|ion)\b/i.test(JSC.replace(/Nobody is ever eliminated\./i, ' ')), false);
});

test('nothing is for sale and no balance word is near this screen', () => {
  /* The pool scores in POINTS. Marbles are the live layer's and must not appear
   * here at all - a pool screen that says Marbles has joined the two boards. */
  /* `odds` survives once, as the name of the thing this screen refuses - the same
   * move S2 makes with the date of birth. It is stripped for the check rather
   * than exempted by a looser pattern, so a second use would still fail. */
  const money = JSC.replace(/No odds anywhere, ever/i, ' ');
  for (const re of [/\bcredits?\b/i, /\bcoins?\b/i, /\btop-?up\b/i, /\bpurchase\b/i,
                    /\bbuy\b/i, /\brefill\b/i, /\bMarbles\b/, /\$\d/, /\bentry fee\b/i,
                    /\bsubscri/i, /\bper month\b/i, /\bpayout\b/i, /\bodds\b/i,
                    /\bwager\b/i, /\bbet\b/i, /\bstake\b/i]) {
    assert.equal(re.test(money), false, `p6-create.screen.js contains ${re}`);
  }
  /* And it states the absence, the way S2 states the missing date of birth -
   * because `$0 Prize Pool` is a first-class stat tile in the product this is
   * defined against. */
  assert.match(JSC, /no pot, no prize pool/i);
});

test('spreads appear only when against-the-spread is on, and never as odds', () => {
  assert.match(JSC, /ats:\s*false/);           // default off
  assert.match(JSC, /No odds anywhere, ever/i);
  assert.match(JSC, /as a plain number on each game/i);
});

test('both invite affordances ship, and both are copyable in one tap', () => {
  assert.match(JSC, /inviteBase/);
  assert.match(JSC, /copyBtn\(url/);
  assert.match(JSC, /copyBtn\(data\.pool\.id\)/);
  /* The code is 6 characters, URL-safe, and carries no vowel - src/lib/types.ts
   * Pool.id. Checked on the actual stub rather than on a comment about it. */
  const m = JS.match(/id:\s*'([A-Z0-9]+)',\s*\/\/ the invite code/);
  assert.ok(m, 'no invite code in the stub pool');
  assert.equal(m[1].length, 6);
  assert.equal(/[AEIOU]/.test(m[1]), false, `the invite code has a vowel: ${m[1]}`);
  assert.match(m[1], /^[A-Z0-9]{6}$/);
});

test('both destructive actions get a confirm, and neither uses a browser dialog', () => {
  assert.match(JSC, /destructive\('Remove'/);
  assert.match(JSC, /destructive\('Close this pool'/);
  assert.equal(/\bwindow\.confirm\(|[^.\w]confirm\(/.test(JSC), false,
    'a native confirm() dialog is used instead of an inline confirm');
  assert.equal(/\balert\(|\bprompt\(/.test(JSC), false);
});

test('every route is declared, and the seven the dispatch names are all there', () => {
  const m = JS.match(/export\s+const\s+states\s*=\s*\[([^\]]*)\]/);
  const states = m[1].split(',').map((s) => s.trim().replace(/['"]/g, '')).filter(Boolean);
  for (const s of ['create', 'created', 'active', 'locked', 'loading', 'offline', 'error']) {
    assert.ok(states.includes(s), `missing state: ${s}`);
  }
  assert.equal(states.length, 7);
  /* And every one of them is actually reachable in render(), not just declared. */
  for (const s of ['created', 'active', 'locked', 'loading', 'offline', 'error']) {
    assert.ok(new RegExp(`state === '${s}'`).test(JSC), `state ${s} is declared but never rendered`);
  }
});

test('depth is a hairline - not one box-shadow in either file', () => {
  assert.equal(/box-shadow/i.test(CSSC), false);
  assert.equal(/box-shadow/i.test(JSC), false);
  assert.match(CSSC, /1px solid var\(--line\)/);
});

test('reads --accent, never --maroon or --gold, and never writes :root', () => {
  assert.equal(/--maroon/.test(CSSC + JSC), false);
  assert.equal(/--gold/.test(CSSC + JSC), false);
  assert.match(CSSC, /var\(--accent\)/);
  assert.equal(/:root/.test(CSSC), false);
  /* 🔴 A POOL COMPONENT NEVER SETS A TEAM COLOR ITSELF. team-chip.js owns
   * --team-a / --team-b, per element, and this screen only calls it. */
  assert.equal(/setProperty\(/.test(JSC), false);
  assert.equal(/--team-a|--team-b/.test(JSC + CSSC), false);
});

test('the filled control is one full-width button and the rest are hairlines', () => {
  /* Selection is a border and a 3px bar; a filled row would put five accent
   * slabs on a 393px card. The switch track reading --accent is the house
   * pattern S2 already ships. What must be unique is the ACTION. */
  assert.match(CSS, /\.p6-primary\s*\{[^}]*background:\s*var\(--accent\)/);
  assert.match(CSS, /\.p6-primary\s*\{[^}]*color:\s*var\(--card\)/);   // swaps with the accent
  assert.match(CSS, /\.p6-primary\s*\{[^}]*width:\s*100%/);
  const fullWidthFilled = (CSSC.match(/width:\s*100%/g) || []).length;
  assert.ok(fullWidthFilled <= 2, 'more than one full-width block claims the screen');
  assert.equal(/\.p6-scope\[aria-checked="true"\]\s*\{[^}]*background:/.test(CSSC), false,
    'the chosen scope row is filled rather than marked');
});

test('every rule is scoped, so a pool screen cannot leak into the shell', () => {
  const selectors = CSSC
    .split('}')
    .map((b) => b.split('{')[0].trim())
    .filter(Boolean)
    .filter((s) => !s.startsWith('@') && s !== '');
  assert.ok(selectors.length > 20, `only ${selectors.length} selectors parsed`);
  for (const s of selectors) {
    assert.ok(s.startsWith('.scr-p6-create'), `unscoped selector: ${s}`);
  }
});

test('every tappable thing clears 44px', () => {
  for (const cls of ['p6-scope', 'p6-seg-b', 'p6-conf', 'p6-game', 'p6-input',
                     'p6-switch', 'p6-copy', 'p6-link', 'p6-code', 'p6-danger',
                     'p6-confirm-no', 'p6-primary']) {
    const re = new RegExp(`\\.${cls}[^{]*\\{[^}]*min-height:\\s*var\\(--tap-min\\)`);
    assert.match(CSS, re, `${cls} does not declare min-height: var(--tap-min)`);
  }
  /* The two confirm buttons share one rule, so the yes side is covered by the
   * no side's selector - assert the shared rule names both. */
  assert.match(CSS, /\.p6-confirm-no,\s*\n\.scr-p6-create \.p6-confirm-yes/);
});

test('no dependency, no fetch, no mark, no CDN image', () => {
  const code = JSC.replace(/export const bar[^\n]*\n/, '');
  assert.equal(/\bfetch\s*\(/.test(code), false);       // data arrives as an argument
  assert.equal(/<img|createElement\(['"]img/i.test(code), false);
  assert.equal(/espncdn|\.png|\.svg\b/i.test(code), false);
  assert.equal(/background-image|url\(/i.test(CSSC), false);
  assert.equal(/require\(|from ['"][a-z@]/.test(code), false);   // every import is a local path
  /* 🔴 THE ONE http STRING IS THE INVITE LINK ITSELF, which is the product, not
   * an asset this page loads. Asserted as exactly one, so a CDN cannot arrive
   * later under cover of the exemption. */
  const urls = code.match(/https?:\/\/[^'"\s]+/g) || [];
  assert.equal(urls.length, 1, `expected only the invite base, got ${JSON.stringify(urls)}`);
  assert.match(urls[0], /\/j\/$/);
});

test('numbers are tabular and US spelling holds', () => {
  assert.match(JS, /\bnum\b/);
  for (const re of [/\bcolour/i, /\bcentre\b/i, /\bgrey\b/i, /\bbehaviour/i,
                    /\bfavourite/i, /\borganis/i]) {
    assert.equal(re.test(JSC + CSSC), false, `British spelling ${re}`);
  }
  /* Every figure on this screen carries .num: the counts, the code, the kickoff,
   * the member meta and the summary line. */
  for (const cls of ['p6-summary num', 'p6-code num', 'p6-link num',
                     'p6-scope-count num', 'p6-game-when num', 'p6-member-meta num']) {
    assert.ok(JSC.includes(cls), `missing tabular class: ${cls}`);
  }
});

test('no Babe Ruth, no 1932, no called shot', () => {
  assert.equal(/1932|wrigley|called shot|babe ruth/i.test(JSC + CSSC), false);
});

test('the bar is declared and the file it names exists on disk', () => {
  const m = JS.match(/export\s+const\s+bar\s*=\s*'([^']+)'/);
  assert.ok(m, 'no bar declared');
  const p = new URL('../../' + m[1], import.meta.url);
  assert.doesNotThrow(() => readFileSync(p), `bar file not on disk: ${m[1]}`);
  /* 🔴 AND IT IS A README, NOT A COMP. Asserted so the next reader cannot mistake
   * a prose teardown for a screenshot this screen was measured against. The three
   * create-dialog captures that README describes are gitignored and are not here. */
  assert.match(m[1], /README\.md$/);
});

/* ------------------------------------------------- 2 · the real data it assumes */

test('there is no conference in the team file, so the chooser cannot be filled', () => {
  /* 🔴 THE REASON THE CONFERENCE SCOPE RENDERS AN EMPTY STATE. Measured, not
   * assumed: the file is six fields and conference is not one of them. Inventing
   * a conference list here would be fixtures/_make.py again. */
  const fields = new Set();
  for (const t of Object.values(TEAMS)) for (const k of Object.keys(t)) fields.add(k);
  assert.deepEqual([...fields].sort(), ['abbrev', 'id', 'name', 'primary', 'secondary', 'short']);
  assert.equal(fields.has('conference'), false);
  /* And the screen does not carry a hard-coded one. */
  for (const re of [/\bBig Ten\b/, /\bBig 12\b/, /\bPac-12\b/, /\bSEC\b/, /\bACC\b/,
                    /\bMountain West\b/, /\bSun Belt\b/]) {
    assert.equal(re.test(JSC), false, `an invented conference name is in the source: ${re}`);
  }
  assert.match(JSC, /conferences:\s*null/);
  assert.match(JSC, /No conference list in this build/);
});

test('the hand-pick chooser offers exactly the three real captured games', () => {
  assert.equal(GAMES.length, 3);
  for (const doc of GAMES) {
    const c = doc.header.competitions[0];
    const home = c.competitors.find((x) => x.homeAway === 'home');
    const away = c.competitors.find((x) => x.homeAway === 'away');
    assert.ok(TEAMS[home.team.id] && TEAMS[away.team.id], 'a captured team is not in teams.json');
    assert.equal(doc.header.week, 1);
    assert.ok(Number.isFinite(Date.parse(c.date)));
  }
  /* The screen renders data.games.length rather than a written number, so this
   * cannot drift when a fourth capture lands. */
  assert.match(JSC, /data\.games\.length \+ ' games are captured/);
});

test('the lock timestamp is READ from the captures, never chosen', () => {
  /* DESIGN-BRIEF 16.4: scope locks at the first kickoff of week 1. That moment is
   * real data - the minimum kickoff across the three captures - and the screen
   * takes it from the sorted list rather than writing a date. */
  const kicks = GAMES.map((d) => Date.parse(d.header.competitions[0].date)).sort((a, b) => a - b);
  assert.equal(kicks[0], 1788566400000);            // 2026-09-05T00:00Z, measured
  assert.match(JSC, /firstKickoff = games\.length \? games\[0\]\.kickoffUtc : null/);
  assert.match(JSC, /scopeLockedAt: state === 'locked' \? firstKickoff : null/);
  /* No hand-written epoch and no hand-written date anywhere in the source. */
  assert.equal(/\b1[0-9]{12}\b/.test(JSC), false, 'a hard-coded epoch is in the source');
  assert.equal(/new Date\(20\d\d/.test(JSC), false);
});

test('131 is the measured week, and the source of the number is on screen', () => {
  /* The teardown measured `131 Games This Week` in a live NCAA pool, week 2,
   * 2026-09-08. Every vault document said sixty. The screen prices every scope
   * against 131 and NAMES where the number came from, because a count with no
   * source is the same failure as a Top 25 with no poll. */
  assert.match(JSC, /const WEEK_GAMES = 131/);
  assert.match(JSC, /measured in a live college pool/i);
  assert.match(JSC, /2026-09-08/);
  assert.equal(/\bsixty games\b/i.test(JSC.replace(/said sixty/i, ' ')), false);
  /* The approximations say they are approximations. */
  assert.match(JSC, /'about ' \+ s\.approx/);
  assert.match(JSC, /The other counts are approximate/i);
});

test('the real slate already contains an exact primary collision', () => {
  /* Ohio State ba0c2f against Ball State ba0c2f, in a captured game - so the
   * navy-on-navy pair is in the hand-pick chooser rather than in a hypothesis,
   * and the rows pass adjacentTo for exactly this. */
  assert.equal(normalizeColor(TEAMS['194'].primary), normalizeColor(TEAMS['2050'].primary));
  assert.equal(normalizeColor(TEAMS['194'].primary), '#ba0c2f');
  assert.match(JSC, /adjacentTo: g\.home/);
  assert.match(JSC, /adjacentTo: g\.away/);
});

test('every team the chooser draws resolves to a defined chip state', () => {
  const states = new Set();
  for (const doc of GAMES) {
    for (const x of doc.header.competitions[0].competitors) {
      const s = teamVars(TEAMS[x.team.id]).state;
      assert.ok(['two', 'one', 'none'].includes(s));
      states.add(s);
    }
  }
  /* 🔴 REPORTED, NOT ASSERTED AS COVERAGE. The six teams in the three captures do
   * NOT include a null primary, so the null pair cannot be shown on this screen
   * from real data - it is named in the COULD NOT CLOSE rather than faked with an
   * invented team. */
  console.log(`    chip states reachable in the hand-pick chooser: ${[...states].sort().join(', ')}`);
  assert.equal(states.has('none'), false,
    'a null-primary team is now in the captures - the COULD NOT CLOSE can be retired');
});

test('401 of 760 have no usable primary - the number the chip fallback exists for', () => {
  const none = Object.values(TEAMS).filter((t) => !normalizeColor(t.primary));
  assert.equal(Object.keys(TEAMS).length, 760);
  assert.equal(none.length, 401);   // measured, not assumed
});
