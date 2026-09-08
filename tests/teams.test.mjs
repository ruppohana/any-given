/* teams.ts against the REAL 22 MB tendency.json and the REAL 760-team file.
 * Nothing here is invented; the whole point of the module is a measurement. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeResolver, modelKeyFor, canonical, candidates, hasUsablePrimary } from '../src/lib/teams.ts';

const DB = JSON.parse(readFileSync(new URL('../fixtures/teams.json', import.meta.url), 'utf8'));
const TEAMS = Object.values(DB.teams);

const MODEL_PATH = 'C:/Claude/Knowledge/sports-live/tendency.json';
let MODEL_KEYS = null;
try {
  const m = JSON.parse(readFileSync(MODEL_PATH, 'utf8'));
  MODEL_KEYS = new Set(Object.keys(m.counts).map((k) => k.split('|')[0]));
  MODEL_KEYS.delete('ALL');
} catch { /* the model is not committed; the measurement test skips */ }

test('the reference bug is real - an ESPN abbreviation is not a model key', { skip: !MODEL_KEYS }, () => {
  // ncaalive/tendency.py feeds game.abbrev(off) into this table.
  assert.equal(MODEL_KEYS.has('OU'), false);
  assert.equal(MODEL_KEYS.has('OSU'), false);
  assert.equal(MODEL_KEYS.has('ORE'), false);
  // ...while the real keys are school names.
  assert.equal(MODEL_KEYS.has('Oklahoma'), true);
  assert.equal(MODEL_KEYS.has('Boise State'), true);
});

test('coverage against the real model, measured not estimated', { skip: !MODEL_KEYS }, () => {
  const resolve = makeResolver(MODEL_KEYS);
  const how = { exact: 0, normalized: 0, alias: 0, null: 0 };
  const reached = new Set();
  for (const t of TEAMS) {
    const r = resolve(t);
    how[r ? r.how : 'null']++;
    if (r) reached.add(r.key);
  }
  console.log(`    model keys: ${MODEL_KEYS.size}  reached: ${reached.size}  (${Math.round(reached.size / MODEL_KEYS.size * 100)}%)`);
  console.log(`    by route: ${JSON.stringify(how)}`);
  const missed = [...MODEL_KEYS].filter((k) => !reached.has(k)).sort();
  console.log(`    still unreachable: ${missed.length}`);
  if (missed.length) console.log('   ', missed.slice(0, 12).join(' | '));
  // Was 215 by exact match alone. Anything below that is a regression.
  assert.ok(reached.size > 215, `expected better than raw exact match, got ${reached.size}`);
});

test('the three fixture teams resolve, because they are what gets priced', { skip: !MODEL_KEYS }, () => {
  const resolve = makeResolver(MODEL_KEYS);
  const find = (short) => TEAMS.find((t) => t.short === short);
  for (const short of ['Oklahoma', 'Ohio State', 'Oregon', 'Boise St', 'UTEP', 'Ball State']) {
    const t = find(short);
    assert.ok(t, `no team named ${short} in teams.json`);
    const r = resolve(t);
    assert.ok(r, `${short} does not resolve to a model key - it would price off the league`);
    console.log(`    ${short.padEnd(12)} -> ${r.key.padEnd(14)} (${r.how})`);
  }
});

test('an unresolvable team returns null, never a silent fallback', () => {
  const keys = new Set(['Oklahoma']);
  const r = modelKeyFor({ id: 'x', abbrev: 'ZZZ', name: 'Nowhere Tech', short: 'Nowhere', primary: null, secondary: null }, keys);
  assert.equal(r, null);
});

test('St reads as both State and Saint', () => {
  assert.ok(candidates('Boise St').includes('boise state'));
  assert.ok(candidates('St Thomas').includes('saint thomas'));
});

test('N reads as both North and Northern', () => {
  const c = candidates('N Dakota St');
  assert.ok(c.includes('north dakota state'));
  assert.ok(c.includes('northern dakota state'));
});

test('canonical folds punctuation and ampersands', () => {
  assert.equal(canonical('North Carolina A&T'), 'north carolina a and t');
  assert.equal(canonical('St. Thomas (MN)'), 'st thomas mn');
});

test('black is not a usable primary', () => {
  assert.equal(hasUsablePrimary({ primary: '000000' }), false);
  assert.equal(hasUsablePrimary({ primary: null }), false);
  assert.equal(hasUsablePrimary({ primary: '841617' }), true);
  const usable = TEAMS.filter(hasUsablePrimary).length;
  console.log(`    ${usable} of ${TEAMS.length} teams have a usable primary`);
  assert.equal(TEAMS.length - usable, 401);
});
