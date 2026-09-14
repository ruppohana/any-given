/* THE BREEDERS' CUP - the settle reader, ahead of the set. Jason, 2026-09-13: "dont ask do any
 * that appear valid." The 2026 Breeders' Cup is Oct 30-31; its set gets its horses once the
 * fields are drawn, and settles from the year's Wikipedia page, whose races table carries each
 * race's winner once it is run.
 *
 * Real capture (Wikipedia REST HTML, read 2026-09-13):
 *   fixtures/props/wiki-breeders-cup-2025.html   the 2025 Breeders' Cup at Del Mar, every race run
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { breedersCupWinners, findCategory, matchOption } from '../src/lib/props-settle.ts';

const P25 = readFileSync(new URL('../fixtures/props/wiki-breeders-cup-2025.html', import.meta.url), 'utf8');

test('the races table: every race and its winner, the country bred dropped (real 2025 page)', () => {
  const w = breedersCupWinners(P25);
  assert.equal(w.size, 14, 'fourteen Breeders\' Cup races');
  assert.equal(w.get('Classic'), 'Forever Young');
  assert.equal(w.get('Mile'), 'Notable Speech');
  assert.equal(w.get('Dirt Mile'), 'Nysos');
  assert.equal(w.get('Juvenile Turf Sprint'), 'Cy Fair');
  assert.equal(w.get('Juvenile Fillies'), 'Super Corredora');
  assert.equal(w.get('Juvenile Fillies Turf'), 'Balantina');
  assert.equal(w.get('Juvenile'), 'Ted Noffey');
  assert.ok([...w.values()].every((h) => h && !/\([A-Z]{2,4}\)$/.test(h)), 'no bred-in code left on a name');
});

test('a question keyed by race name finds its winner, and a field of horses maps onto one', () => {
  const w = breedersCupWinners(P25);
  assert.equal(findCategory(w, 'classic'), 'Forever Young', 'by name, any case');
  assert.equal(matchOption(['Sierra Leone', 'Forever Young', 'Fierceness'], findCategory(w, 'Classic')), 'Forever Young');
  assert.equal(findCategory(w, 'Not a race'), null);
  assert.equal(breedersCupWinners('<table><tr><th>Race name</th><th>Winner (Bred)</th></tr><tr><td>Classic</td><td></td></tr></table>').size, 0,
    'a race not yet run answers nothing');
});
