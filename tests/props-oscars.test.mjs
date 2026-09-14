/* THE OSCARS - the settle reader, ahead of the set. Jason, 2026-09-14: "do the oscars set next".
 * The 99th Academy Awards are Sunday, March 14, 2027; the nominations are announced Thursday,
 * January 21, 2027, and the oscars-set routine builds the ready set from them that morning. It
 * settles like the Emmys, from the winners Wikipedia's editors mark on the ceremony page.
 *
 * Real captures (Wikipedia REST HTML, read 2026-09-14):
 *   fixtures/props/wiki-98th_Academy_Awards.html   the March 2026 ceremony, every winner marked
 *   fixtures/props/wiki-99th_Academy_Awards.html   the 2027 ceremony's page: the timeline, no nominees yet
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { winnersFromWikiAwards, categoriesFromWikiAwards, findCategory, matchOption } from '../src/lib/props-settle.ts';

const page = (n) => readFileSync(new URL('../fixtures/props/wiki-' + n + '.html', import.meta.url), 'utf8');
const O98 = page('98th_Academy_Awards');
const O99 = page('99th_Academy_Awards');
const E77 = page('77th_Primetime_Emmy_Awards');

test('the Oscars page marks its winner inside the bold - every category read, the dagger never kept', () => {
  const w = winnersFromWikiAwards(O98);
  assert.equal(w.size, 24, 'every category on the 98th ceremony\'s page');
  assert.deepEqual(categoriesFromWikiAwards(O98).length, 24);
  assert.match(w.get('Best Picture'), /^One Battle After Another/);
  assert.equal(w.get('Best Directing'), 'Paul Thomas Anderson – One Battle After Another');
  assert.ok([...w.values()].every((v) => !v.includes('‡')), 'no dagger left on a line');
  /* The Emmys' way - the dagger after the bold - still reads exactly as before. */
  assert.equal(winnersFromWikiAwards(E77).size, 26);
});

test('an Oscars ballot\'s options map onto the winner the way the Emmys\' do', () => {
  const w = winnersFromWikiAwards(O98);
  assert.equal(matchOption(['Bugonia', 'One Battle After Another', 'Sinners'], findCategory(w, 'Best Picture')), 'One Battle After Another');
  assert.equal(matchOption(['Paul Thomas Anderson, One Battle After Another', 'Ryan Coogler, Sinners'], findCategory(w, 'Best Directing')),
    'Paul Thomas Anderson, One Battle After Another', 'a person and a film, like the Emmys\' acting ballots');
});

test('the 2027 ceremony\'s page: nominations announced Jan 21, the ceremony Mar 14 - and nothing to answer yet', () => {
  assert.equal(winnersFromWikiAwards(O99).size, 0);
  const t = O99.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(t, /January 21, 2027 Nominations announced/);
  assert.match(t, /March 14, 2027 Ceremony/);
});
