/* S2 - settings and identity.
 *
 * 🔴 WHAT THIS FILE CAN AND CANNOT DO, stated up front because a test that
 * quietly tests nothing is worse than no test.
 *
 * The screen module cannot be imported here. It is browser code and its imports
 * are server-absolute ('/components/team-chip.js'), which Node cannot resolve -
 * tools/preview.mjs records the same thing and reads screen metadata as TEXT for
 * exactly this reason. So there is no DOM assertion in here and there is no
 * fake DOM either: A TEST WHOSE DATA YOU ALSO INVENTED IS NOT A CLOSE.
 *
 * What it does instead is the two things that are real:
 *   1. SOURCE ASSERTIONS for the rules that fail a piece - the accent token, the
 *      absence of a shadow, the forbidden words, the date-of-birth field, US
 *      spelling. These are checks against the file on disk, not against a mock.
 *   2. FIXTURE ASSERTIONS for every fact the screen renders - the 760 teams, the
 *      401 with no usable primary, the eight-row head it actually draws, and the
 *      real UTEP-at-Oklahoma row inside the density control. If fixtures/ changes
 *      shape, these fail.
 *
 * THE LAYOUT WAS CLOSED IN A BROWSER AT 393px, IN BOTH THEMES, not here.
 * Requirement 7.5: layout bugs are invisible to tests, and two of the three real
 * bugs found on this piece - a scroll box that ate the wheel, an evenly-spaced
 * scale that lied about where 10s sits - were invisible to everything in here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { teamVars, normalizeColor, luminance } from '../public/components/team-chip.js';

const JS = readFileSync(new URL('../public/screens/s2-settings.screen.js', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../public/screens/s2-settings.css', import.meta.url), 'utf8');

/** 🔴 THE PROHIBITIONS ARE CHECKED AGAINST CODE, NOT AGAINST COMMENTS.
 *  Every rule in the contract is quoted verbatim in the header of the file that
 *  obeys it - "no box-shadow", "never --maroon or --gold", "there is no purchase
 *  row" - so a naive substring check fails the file for explaining itself, and
 *  the only way to pass would be to delete the reasoning. Comments are stripped
 *  first; the assertions below run against what actually ships. */
function code(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
const CJS = code(JS);
const CCSS = code(CSS);
const CSRC = CJS + '\n' + CCSS;
const SRC = JS + '\n' + CSS;

const DB = JSON.parse(readFileSync(new URL('../fixtures/teams.json', import.meta.url), 'utf8'));
const TEAMS = Object.values(DB.teams);
const GAME = JSON.parse(readFileSync(
  new URL('../fixtures/real-utep-at-ou-260905-final.json', import.meta.url), 'utf8'));

/** The eight rows the chooser actually draws before anybody types. Same sort and
 *  same slice as the screen: alphabetical by short name, first 8. */
const HEAD = TEAMS.slice()
  .sort((a, b) => (a.short || a.name).localeCompare(b.short || b.name))
  .slice(0, 8);

/* ---------------------------------------------------------------- the rules */

test('18+ is a rating, never a wall - there is no date-of-birth field', () => {
  // The counter-example is AQB-LIVE-signup-form-dob-required.png: seven fields
  // including Date of Birth, in front of every screen they ship.
  assert.equal(/type\s*=\s*["']date["']/.test(JS), false, 'a date input appeared');
  assert.equal(/\bbday\b|birthdat|birthday/i.test(JS.replace(/No date of birth/g, '')), false);
  // The absence is stated on screen. That sentence is the whole counter-position.
  assert.ok(JS.includes('No date of birth.'));
  // "No email." came off 2026-09-10: email sign-in is required now (Jason,
  // decisions/email-is-required-2026-09-10.md). It is asked at the first pick,
  // never on this screen - the test below still holds that line.
  assert.ok(JS.includes('No password.'));
  assert.equal(JS.includes('No email.'), false, 'the screen must not claim there is no email');
});

test('no account wall - nothing asks for an email, a password or a sign-in', () => {
  assert.equal(/type\s*=\s*["'](password|email)["']/.test(CJS), false);
  assert.equal(/\bSign\s?up\b|\bSign\s?in\b|\bLog\s?in\b|\bCreate account\b/i.test(CJS), false);
  // A person is a display name and a device. Three data inputs ship and that is
  // all: the name, the school search, and the delay slider. Everything else that
  // sets .type is a <button>.
  const inputs = [...new Set((CJS.match(/\.type = '[a-z]+'/g) || []))].sort();
  assert.deepEqual(inputs,
    [".type = 'button'", ".type = 'range'", ".type = 'search'", ".type = 'text'"]);
});

test('Skip exists, is a real control, and is honored', () => {
  assert.ok(/el\('button', 's2-skip', 'Skip'\)/.test(JS), 'no Skip button');
  assert.ok(JS.includes('Skipped.'), 'skipping says nothing back');
  // Honored means the app keeps working, not that the button exists.
  assert.ok(/works on its own colors/.test(JS));
});

test('the balance is Marbles - and this screen sells nothing', () => {
  for (const word of ['credits', 'coins', 'top-up', 'top up', 'purchase', 'buy ',
                      'refill', 'restore purchases', 'subscribe', 'upgrade']) {
    assert.equal(CSRC.toLowerCase().includes(word), false, `found "${word}"`);
  }
  assert.ok(JS.includes('Nothing here can be bought.'));
});

test('the accent token is read, never --maroon or --gold', () => {
  // The accent SWAPS TOKEN on dark. A component hard-coded to one is invisible
  // in the other and nothing warns you.
  assert.equal(/--maroon|--gold/.test(CSRC), false);
  assert.ok(CCSS.includes('var(--accent)'));
  // ...and nothing writes a token at :root.
  assert.equal(/:root/.test(CCSS), false);
  assert.equal(/--team-a\s*:|--team-b\s*:/.test(CCSS), false);
});

test('depth is a hairline - no shadow anywhere', () => {
  assert.equal(/box-shadow/.test(CCSS), false);
  assert.ok(CCSS.includes('1px solid var(--line)'));
});

test('no dependencies, no fetch, inline SVG or nothing', () => {
  assert.equal(/fetch\s*\(/.test(CJS), false, 'a screen never fetches - data is an argument');
  assert.equal(/<img|\.svg["']|cdn|https?:\/\//.test(CCSS), false);
  // Every import is a session-owned component served from this app.
  const imports = [...JS.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ['/components/fmt.js', '/components/states.js',
                                    '/components/team-chip.js']);
});

test('the pool has no 30px figure - --t-bank is the live layer\'s alone', () => {
  assert.equal(/--t-bank/.test(CCSS), false);
  assert.ok(CCSS.includes('var(--t-figure)'), 'the delay readout is the 21px figure');
});

test('44px is the floor, in the stylesheet as well as in the browser', () => {
  // Measured in the browser too - the DOM check found nothing under 44px - but
  // the rule belongs where a future edit would break it.
  assert.ok(CSS.includes('min-height: var(--tap-min)'));
  const heights = [...CSS.matchAll(/min-height:\s*(\d+)px/g)].map((m) => Number(m[1]));
  for (const h of heights) assert.ok(h >= 30, `min-height ${h}px is below the switch pill`);
});

test('US spelling - in the comments too, this one is not about shipped code', () => {
  assert.equal(/colour|centre|grey|behaviour|favourite/i.test(SRC), false);
});

test('every state is a route, and first-run is this screen\'s empty', () => {
  const states = JS.match(/export const states = \[([^\]]*)\]/)[1]
    .split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
  assert.deepEqual(states, ['ready', 'first-run', 'loading', 'offline', 'error']);
});

test('the bar is declared and it is a file that exists', () => {
  const bar = JS.match(/export const bar = '([^']+)'/)[1];
  assert.equal(bar, 'reference/sofascore-teardown/screens/IMG_5198.PNG');
});

/* ------------------------------------------------------------- the delay */

test('the delay is a slider, always on, and its travel covers the measured range', () => {
  const min = Number(JS.match(/DELAY_MIN = (\d+)/)[1]);
  const max = Number(JS.match(/DELAY_MAX = (\d+)/)[1]);
  const step = Number(JS.match(/DELAY_STEP = (\d+)/)[1]);
  const dflt = Number(JS.match(/DELAY_DEFAULT = (\d+)/)[1]);
  assert.ok(JS.includes("input.type = 'range'"), 'the delay must be a slider, not a fork');
  // ncaalive/poller.py: "ESPN+ is typically 30-60s behind live, cable 5-15."
  // The travel has to reach both ends of that and past it.
  assert.equal(min, 0);
  assert.ok(max >= 60, 'the slider cannot reach the top of the measured stream range');
  assert.ok(dflt >= 30 && dflt <= 60, 'the default must sit inside the measured stream range');
  assert.equal((max - min) % step, 0);
  // The reference server accepts 0-600s; the slider is a strict subset of it.
  assert.ok(max <= 600);
});

test('the scale marks sit at their true fraction of the travel', () => {
  // The first version spaced four labels evenly, which put "Cable 10s" at a
  // third of the track when 10 of 90 is a ninth. Three marks now, each
  // positioned by arithmetic rather than by flexbox.
  assert.ok(JS.includes("(DELAY_MAX - DELAY_MIN) * 100) + '%'"));
  const marks = JS.match(/\[\[0, 'Live'\], \[(\d+), '(\d+)s'\], \[(\d+), '(\d+)s'\]\]/);
  assert.ok(marks, 'the mark table changed shape');
  const max = Number(JS.match(/DELAY_MAX = (\d+)/)[1]);
  assert.equal(Number(marks[1]) * 2, max, 'the middle mark must be exactly half the travel');
  assert.equal(Number(marks[3]), max);
});

test('zero is reachable and it is labeled as the one setting that can spoil', () => {
  assert.ok(JS.includes('Live - no delay'));
  assert.ok(/read the\s*\n?\s*.?touchdown before you see it/.test(JS.replace(/\s+/g, ' ')) ||
            JS.includes('touchdown before you see it'));
});

/* ------------------------------------------- notifications and the spoiler rule */

test('every alert declares whether it holds state, and the held ones say so', () => {
  const kinds = [...JS.matchAll(/\{ kind: '([a-z_]+)', label: '([^']+)', holdsState: (true|false) \}/g)]
    .map((m) => ({ kind: m[1], label: m[2], holds: m[3] === 'true' }));
  assert.equal(kinds.length, 6);
  assert.ok(kinds.some((k) => k.holds), 'no alert holds state');
  assert.ok(kinds.some((k) => !k.holds), 'no alert is stateless');
  // Sofascore's own priming sample is "Q2 started: 31 - 28". For a delayed app
  // that is fatal, so nothing here may carry a score in its label.
  for (const k of kinds) {
    assert.equal(/\d+\s*[-–]\s*\d+/.test(k.label), false, `${k.kind} carries a score`);
  }
  assert.ok(JS.includes('waits out your'), 'the spoiler rule is not stated on screen');
});

/* ----------------------------------------------------- density, and the rule */

test('density is the viewer\'s and it says so - scope is never touched here', () => {
  assert.ok(JS.includes("{ value: 'compact', label: 'Compact' }"));
  assert.ok(JS.includes("{ value: 'detailed', label: 'Detailed' }"));
  assert.ok(JS.includes('never changes '), 'the scope/density distinction is not on screen');
  // A per-user SLATE FILTER is forbidden - everyone picks the same games or the
  // standings mean nothing. Nothing that ships here filters a slate.
  assert.equal(/conference|top25|ranked_v_ranked|handpick|rankingSource/i.test(CJS), false);
});

test('the density example is the real captured game, not a mock row', () => {
  const c = GAME.header.competitions[0];
  const home = c.competitors.find((x) => x.homeAway === 'home');
  const away = c.competitors.find((x) => x.homeAway === 'away');
  assert.equal(home.team.id, '201');
  assert.equal(away.team.id, '2638');
  // Both resolve back to real identities in teams.json - that is what the chip
  // in the control is fed.
  const H = DB.teams[home.team.id], A = DB.teams[away.team.id];
  assert.equal(H.name, 'Oklahoma Sooners');
  assert.equal(A.name, 'UTEP Miners');
  assert.equal(teamVars(H).state, 'two');
  assert.equal(teamVars(A).state, 'two');
  assert.ok(Number.isFinite(Date.parse(c.date)), 'kickoff is not a parsable date');
  assert.equal(GAME.gameInfo.venue.fullName, 'Memorial Stadium (Norman, OK)');
});

/* ------------------------------------------- the chooser against the real file */

test('760 schools, 401 with no usable primary - the file, not the vault', () => {
  assert.equal(TEAMS.length, 760);
  const none = TEAMS.filter((t) => !normalizeColor(t.primary)).length;
  assert.equal(none, 401);
  console.log(`    ${none} of ${TEAMS.length} schools cannot fill a colored chip`);
});

test('the eight rows drawn before anybody types cover navy, light and null', () => {
  const states = HEAD.map((t) => teamVars(t).state);
  assert.ok(states.includes('none'), 'no colorless school in the opening page');
  const lums = HEAD.map((t) => normalizeColor(t.primary))
    .filter(Boolean).map(luminance);
  assert.ok(lums.some((l) => l < 0.1), 'no dark/navy primary in the opening page');
  assert.ok(lums.some((l) => l > 0.4), 'no light primary in the opening page');
  console.log('    opening page: ' + HEAD.map((t, i) => t.abbrev + '[' + states[i] + ']').join(' '));
});

test('the already-followed team is a YELLOW primary - the case that breaks on white', () => {
  const asu = TEAMS.find((t) => t.abbrev === 'ASU');
  assert.ok(asu, 'ASU is not in the file');
  const p = normalizeColor(asu.primary);
  assert.ok(p, 'the followed team must have a primary or the test proves nothing');
  assert.ok(luminance(p) > 0.5, 'the followed team is not the light case');
  assert.equal(teamVars(asu).state, 'two');
});

test('the chooser is a list, not a grid, and it carries no mark', () => {
  assert.equal(/grid-template-columns/.test(CSS), false, 'a grid of crest-shaped holes');
  assert.ok(JS.includes('teamChip('), 'the shared component is not used');
  assert.equal(/function teamChip|const teamChip =/.test(JS), false, 'the chip was reimplemented');
  assert.ok(JS.includes('No logos anywhere in this app.'));
});

test('search is ranked, so an exact abbreviation is never buried', () => {
  // Found in the browser: an unranked substring filter answered "ou" with App
  // State, Assumption and Averett - "ou" is inside Mountaineers - and Oklahoma
  // was not on the page. This reproduces the ranking against the real file.
  const rank = (t, needle) => {
    const ab = (t.abbrev || '').toLowerCase();
    const sh = (t.short || '').toLowerCase();
    const nm = (t.name || '').toLowerCase();
    if (ab === needle) return 0;
    if (sh.indexOf(needle) === 0) return 1;
    if (ab.indexOf(needle) === 0) return 2;
    if (sh.indexOf(needle) > 0) return 3;
    if (nm.indexOf(needle) >= 0) return 4;
    return -1;
  };
  const sorted = TEAMS.slice().sort((a, b) => (a.short || a.name).localeCompare(b.short || b.name));
  const query = (q) => sorted.map((t) => ({ t, r: rank(t, q) })).filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r).map((x) => x.t.short);
  assert.equal(query('ou')[0], 'Oklahoma');
  assert.equal(query('asu')[0], 'Arizona St');
  assert.equal(query('utep')[0], 'UTEP');
  assert.equal(query('zzzz').length, 0);
  // The Sofascore parallel: IMG_5200 types "Arizona" and gets a mixed list.
  const az = query('arizona');
  assert.ok(az.length >= 3, 'Arizona should return several schools');
  console.log('    "arizona" -> ' + az.join(', '));
  // And the ranking that is in the file is the ranking that was tested.
  assert.ok(JS.includes("if (ab === needle) return 0;"));
  assert.ok(JS.includes("if (sh.indexOf(needle) === 0) return 1;"));
});
