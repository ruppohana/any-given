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
