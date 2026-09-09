/* The chip, run against all 760 real teams in fixtures/teams.json.
 * NOT invented data - this file is derived from sports-live/ncaalive/colors.json,
 * captured from the feed 2026-09-06. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { teamVars, normalizeColor, tooClose, luminance } from '../public/components/team-chip.js';

const DB = JSON.parse(readFileSync(new URL('../fixtures/teams.json', import.meta.url), 'utf8'));
const TEAMS = Object.values(DB.teams);

test('every one of the 760 real teams resolves to a defined state', () => {
  assert.equal(TEAMS.length, 760);
  const counts = { two: 0, one: 0, none: 0 };
  for (const t of TEAMS) {
    const r = teamVars(t);
    assert.ok(r.state in counts, `undefined state for ${t.abbrev}`);
    assert.ok(r.vars['--team-a'], `no --team-a for ${t.abbrev}`);
    assert.ok(r.vars['--team-b'], `no --team-b for ${t.abbrev}`);
    counts[r.state]++;
  }
  console.log('    state counts:', JSON.stringify(counts));
  // 401 have no usable primary => state 'none'. Measured, not assumed.
  assert.equal(counts.none, 401);
  assert.equal(counts.two + counts.one + counts.none, 760);
});

test('black is absence, not a color', () => {
  assert.equal(normalizeColor('000000'), null);
  assert.equal(normalizeColor('#000000'), null);
  assert.equal(normalizeColor(null), null);
  assert.equal(normalizeColor('8C1D40'), '#8c1d40');
});

test('no team ever renders a raw #000000 fill', () => {
  for (const t of TEAMS) {
    const v = teamVars(t).vars;
    assert.notEqual(v['--team-a'], '#000000');
    assert.notEqual(v['--team-b'], '#000000');
  }
});

test('the three-value test set - navy, yellow, null', () => {
  const navy = { abbrev: 'NVY', primary: '002855', secondary: null };
  const yellow = { abbrev: 'YEL', primary: 'FFC627', secondary: null };
  const nul = { abbrev: 'NUL', primary: null, secondary: null };
  assert.equal(teamVars(navy).state, 'one');
  assert.equal(teamVars(yellow).state, 'one');
  assert.equal(teamVars(nul).state, 'none');
  // The pair the live board never had to survive.
  assert.ok(luminance('#ffc627') > 0.5, 'yellow is light - it breaks first on white');
  assert.ok(luminance('#002855') < 0.1, 'navy is dark - it breaks on #120a0e');
});

test('adjacency - every PAIR, navy against navy included', () => {
  assert.equal(tooClose('#002855', '#002a5c'), true, 'near-identical navies must be flagged');
  assert.equal(tooClose('#002855', '#ffc627'), false);
  assert.equal(tooClose(null, '#002855'), false, 'a null is not a clash, it is its own state');
});

test('how many real PAIRS on a 131-game slate would clash', () => {
  // Not an assertion - a measurement, printed so the number is on the record.
  let clashes = 0, pairs = 0;
  for (let i = 0; i + 1 < TEAMS.length; i += 2) {
    const a = normalizeColor(TEAMS[i].primary), b = normalizeColor(TEAMS[i + 1].primary);
    pairs++;
    if (tooClose(a, b)) clashes++;
  }
  console.log(`    ${clashes} of ${pairs} arbitrary real pairs clash on primary`);
  assert.ok(pairs > 0);
});

test('a team whose two colors are the same color has ONE color', () => {
  // Real rows from fixtures/teams.json, not constructed.
  const georgetown = { abbrev: 'GTWN', primary: '110e42', secondary: '001c58' };
  const sandiego   = { abbrev: 'USD',  primary: '2f99d4', secondary: '2f99d4' };
  const asu        = { abbrev: 'ASU',  primary: '8c1d40', secondary: 'ffc627' };
  assert.equal(teamVars(georgetown).state, 'one', 'navy on navy is not two colors');
  assert.equal(teamVars(sandiego).state, 'one', 'identical hexes are not two colors');
  assert.equal(teamVars(asu).state, 'two', 'maroon and gold genuinely are two');
});

test('how many real teams collapse from two colors to one', () => {
  let two = 0, collapsed = 0;
  for (const t of TEAMS) {
    const p = normalizeColor(t.primary), s = normalizeColor(t.secondary);
    if (p && s) { two++; if (teamVars(t).state === 'one') collapsed++; }
  }
  console.log(`    ${collapsed} of ${two} nominally two-color teams collapse to one`);
  assert.equal(collapsed, 6);
});

/* 🔴 THE MARKS KEY HAS ONE FORMAT. Added 2026-09-09.
 *
 * Logos defaulted on at boot and turned themselves off the moment anybody
 * opened the settings sheet, because two writers disagreed: setMarks() writes
 * the raw string `on`, and the generic settings writer JSON-stringified it to
 * `"on"` with quotes. Boot assigns whatever is stored straight to
 * dataset.marks, and marksOn() compares it to the bare string - so choosing
 * "On" was the action that broke it, and choosing "Off" worked. That is why it
 * read as a bad default rather than as a broken toggle.
 *
 * This asserts over app.js as text because the boot path needs a real document
 * and a real localStorage. It is a guard against the two writers coming back,
 * not a test of the DOM. */
test('nothing JSON-stringifies the marks key, and only "off" means off', async () => {
  const { readFileSync } = await import('node:fs');
  const raw = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  /* 🔴 STRIP THE COMMENTS FIRST. The first version of this test failed against
   * correct code, because the comment explaining the bug QUOTES the bad call -
   * "setMarks(), NOT set('marks', v)". A guard that reads source as text has to
   * read the code, or the clearest possible explanation of a mistake becomes
   * indistinguishable from the mistake. */
  const app = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  /* The generic writer must never be handed 'marks'. */
  assert.ok(!/set\(\s*['"]marks['"]/.test(app),
    "the generic JSON writer is writing ag.marks again - use setMarks(), which writes the raw format boot reads");

  /* setMarks writes raw, and it is the only thing that writes the key. */
  const writers = (app.match(/localStorage\.setItem\(\s*['"]ag\.marks['"]/g) || []).length;
  assert.equal(writers, 1, 'ag.marks must have exactly one writer');
  assert.ok(/localStorage\.setItem\('ag\.marks', on \? 'on' : 'off'\)/.test(app),
    'setMarks must write the bare strings, not JSON');

  /* And the reader defaults ON, treating anything unrecognised as on so the
   * phones already holding '"on"' repair themselves. */
  assert.ok(/stored === 'off' \|\| stored === '"off"'/.test(app),
    'boot must read only an explicit off as off, in either stored format');
});
