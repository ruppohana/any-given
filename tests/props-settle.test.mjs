/* READY SETS SETTLE THEMSELVES - Jason, 2026-09-13: "i am not entering anything by
 * hand, if you cannot get the information from their website or something then what
 * good are you?"
 *
 * Real pages, captured 2026-09-13 through Wikipedia's REST API (the URL the Worker reads):
 *   fixtures/props/wiki-77th_Primetime_Emmy_Awards.html  last year's, winners marked (bold + ‡)
 *   fixtures/props/wiki-78th_Primetime_Emmy_Awards.html  this year's, the night before - nominees only
 * The settler runs against SQLite (D1 is SQLite) with the real prop_question table.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { winnersFromWikiAwards, categoriesFromWikiAwards, matchOption, findCategory } from '../src/lib/props-settle.ts';
import { PROP_TEMPLATES } from '../src/lib/props.ts';
import { settleReadySets, wikiHtmlUrl } from '../src/props-settle-run.ts';

const page = (n) => readFileSync(new URL('../fixtures/props/wiki-' + n + '.html', import.meta.url), 'utf8');
const P77 = page('77th_Primetime_Emmy_Awards');
const P78 = page('78th_Primetime_Emmy_Awards');
const EMMYS = PROP_TEMPLATES['emmys-2026'];

test('last year\'s page: every marked winner, by its category heading', () => {
  const w = winnersFromWikiAwards(P77);
  assert.equal(w.size, 26);
  assert.match(w.get('Outstanding Drama Series'), /^The Pitt/);
  assert.match(w.get('Outstanding Comedy Series'), /^The Studio/);
  assert.match(w.get('Outstanding Limited or Anthology Series'), /^Adolescence/);
  assert.match(w.get('Outstanding Lead Actor in a Drama Series'), /^Noah Wyle/);
  assert.match(w.get('Outstanding Reality Competition Program'), /^The Traitors/);
});

test('this year\'s page the night before: no winners, and every question\'s heading is on it', () => {
  assert.equal(winnersFromWikiAwards(P78).size, 0, 'nothing is answered before the show');
  const heads = new Set(categoriesFromWikiAwards(P78));
  for (const q of EMMYS.questions) assert.ok(heads.has(q.key), 'no heading on the page for: ' + q.key);
  assert.deepEqual(EMMYS.source, { kind: 'wiki-awards', page: '78th_Primetime_Emmy_Awards' });
});

test('a winner maps onto exactly one option, or none', () => {
  assert.equal(matchOption(['The Pitt', 'Pluribus', 'Slow Horses'], 'The Pitt (HBO Max)'), 'The Pitt');
  assert.equal(matchOption(['Noah Wyle, The Pitt', 'Gary Oldman, Slow Horses'],
    'Noah Wyle – The Pitt as Dr. Michael "Robby" Robinavitch (HBO Max)'), 'Noah Wyle, The Pitt');
  assert.equal(matchOption(['Abbott Elementary', 'Hacks'], 'The Studio ( Apple TV+ )'), null, 'last year\'s winner is not this year\'s nominee');
  assert.equal(matchOption(["Matthew Rhys, Widow's Bay", 'Matthew Rhys, The Beast in Me'],
    'Matthew Rhys – The Beast in Me as Nile Jarvis (Netflix)'), 'Matthew Rhys, The Beast in Me', 'two options with one name: the whole option decides');
  assert.equal(findCategory(winnersFromWikiAwards(P77), 'outstanding drama series'), 'The Pitt (HBO Max)');
});

/* D1 on SQLite, with the real table. */
function db() {
  const d = new DatabaseSync(':memory:');
  d.exec(readFileSync(new URL('../migrations/0011_props.sql', import.meta.url), 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => d.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: d.prepare(sql).all(...args) }),
    run: async () => ({ meta: { changes: Number(d.prepare(sql).run(...args).changes) } })
  });
  return { d, DB: { prepare: (sql) => stmt(sql), batch: async (l) => { for (const s of l) await s.run(); } } };
}
function load(d, pool) {
  const ins = d.prepare('INSERT INTO prop_question VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0)');
  EMMYS.questions.forEach((q, i) => ins.run(pool, 'emmys-2026-' + (i + 1), i + 1, q.text, JSON.stringify(q.options), q.points, q.lockAt));
}

test('after the lock, the settler writes every group\'s answers from the page - and only what it names', async () => {
  const { d, DB } = db();
  load(d, 'OFFICE'); load(d, 'FAMILY');
  /* A commissioner already answered one question by hand: it is never overwritten. */
  d.prepare("UPDATE prop_question SET answer = 'Paradise' WHERE pool_id = 'FAMILY' AND qid = 'emmys-2026-1'").run();
  const urls = [];
  const fakeFetch = async (u) => { urls.push(String(u)); return new Response(P77, { status: 200 }); };  // last year's page stands in
  const before = await settleReadySets({ DB }, Date.UTC(2026, 8, 14, 23, 0), fakeFetch, { force: true });
  assert.deepEqual(before, [], 'nothing is read before the lock');
  assert.equal(urls.length, 0);

  const after = await settleReadySets({ DB }, Date.UTC(2026, 8, 15, 3, 0), fakeFetch, { force: true });
  assert.deepEqual(urls, [wikiHtmlUrl('78th_Primetime_Emmy_Awards')]);
  assert.equal(after[0].winnersOnPage, 26);
  const ans = (pool, n) => d.prepare('SELECT answer FROM prop_question WHERE pool_id = ? AND qid = ?').get(pool, 'emmys-2026-' + n).answer;
  /* Last year's winners that are also this year's nominees get answered; the rest wait. */
  assert.equal(ans('OFFICE', 1), 'The Pitt', 'Drama Series');
  assert.equal(ans('FAMILY', 1), 'Paradise', 'a commissioner\'s answer stands');
  assert.equal(ans('OFFICE', 2), null, 'The Studio is not a 2026 Comedy nominee - no guess');
  assert.equal(ans('OFFICE', 4), 'Noah Wyle, The Pitt', 'Lead Actor, Drama');
  assert.equal(ans('FAMILY', 4), 'Noah Wyle, The Pitt', 'every group that loaded the set');
  assert.equal(ans('OFFICE', 7), 'Jean Smart, Hacks', 'Lead Actress, Comedy');
  assert.equal(ans('OFFICE', 14), 'The Traitors', 'Reality Competition');
});

/* ------------------------------------------------------------ reality TV */
import { castRows, answersFromCast } from '../src/lib/props-settle.ts';

test('Survivor: the contestants table names the Sole Survivor and the first vote (real Survivor 50)', () => {
  const rows = castRows(page('Survivor_50_In_the_Hands_of_the_Fans'));
  assert.deepEqual(answersFromCast('wiki-survivor', rows), { winner: 'Aubry Bracco', 'first-out': 'Jenna Lewis-Dougherty' });
  /* This season's page the week before: every castaway listed, nobody out. */
  const s51 = castRows(page('Survivor_51'));
  assert.deepEqual(answersFromCast('wiki-survivor', s51), {});
  const names = new Set(s51.map((r) => r.name));
  for (const o of PROP_TEMPLATES['survivor-51'].questions[0].options) assert.ok(names.has(o), 'not on the page: ' + o);
});

test('Dancing with the Stars: the winner, and a double elimination voids "eliminated first" (real season 34)', () => {
  const rows = castRows(page('Dancing_with_the_Stars_American_TV_series_season_34'));
  assert.deepEqual(answersFromCast('wiki-dwts', rows), { winner: 'Robert Irwin', 'first-out': 'void' },
    'Baron Davis and Corey Feldman went out together in week 1 - nobody could have picked that');
  const d35 = castRows(page('Dancing_with_the_Stars_American_TV_series_season_35'));
  assert.deepEqual(answersFromCast('wiki-dwts', d35), {});
  const names = new Set(d35.map((r) => r.name));
  for (const o of PROP_TEMPLATES['dwts-35'].questions[0].options) assert.ok(names.has(o), 'not on the page: ' + o);
});

test('The Traitors: the first murdered, the first banished, and whether a Traitor won (real seasons 3 and 4)', () => {
  assert.deepEqual(answersFromCast('wiki-traitors', castRows(page('The_Traitors_American_TV_series_season_4'))),
    { 'first-murdered': 'Ian Terry', 'first-banished': 'Porsha Williams', 'traitor-wins': 'Yes' }, 'Rob Rausch won as a Traitor');
  assert.deepEqual(answersFromCast('wiki-traitors', castRows(page('The_Traitors_American_TV_series_season_3'))),
    { 'first-murdered': 'Dorinda Medley', 'first-banished': 'Wells Adams', 'traitor-wins': 'No' }, 'four Faithful winners');
  /* New Blood the week before: 22 names, nothing written yet. */
  const nb = castRows(page('The_Traitors_New_Blood'));
  assert.deepEqual(answersFromCast('wiki-traitors', nb), {});
  const names = new Set(nb.map((r) => r.name));
  const T = PROP_TEMPLATES['traitors-new-blood'];
  assert.equal(T.questions[0].options.length, 22);
  for (const o of T.questions[0].options) assert.ok(names.has(o), 'not on the page: ' + o);
  assert.deepEqual(T.questions[2].options, ['Yes', 'No']);
  assert.ok(T.questions.every((q) => q.lockAt === Date.UTC(2026, 8, 18, 0, 0, 0)), '8 PM ET Thursday the 17th');
});

test('the reality sets settle through the same run: Survivor from its page, nobody typing', async () => {
  const { d, DB } = db();
  const S = PROP_TEMPLATES['survivor-51'];
  const ins = d.prepare('INSERT INTO prop_question VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0)');
  S.questions.forEach((q, i) => ins.run('TRIBE', 'survivor-51-' + (i + 1), i + 1, q.text, JSON.stringify(q.options), q.points, q.lockAt));
  /* Last season's page, with this season's names swapped in for the two who finished, stands in
     for the night the page is updated - the parser and the run are the real ones. */
  const html = page('Survivor_50_In_the_Hands_of_the_Fans').replaceAll('Aubry Bracco', 'Ana Sani').replaceAll('Jenna Lewis-Dougherty', 'Devin Way');
  const r = await settleReadySets({ DB }, Date.UTC(2026, 8, 24, 5, 0), async () => new Response(html), { force: true, only: 'survivor-51' });
  assert.equal(r[0].settled, 2);
  const ans = (n) => d.prepare('SELECT answer FROM prop_question WHERE qid = ?').get('survivor-51-' + n).answer;
  assert.equal(ans(1), 'Ana Sani');
  assert.equal(ans(2), 'Devin Way');
});

test('a failed read settles nothing and says why', async () => {
  const { d, DB } = db();
  load(d, 'OFFICE');
  const r = await settleReadySets({ DB }, Date.UTC(2026, 8, 15, 3, 0), async () => new Response('nope', { status: 503 }), { force: true });
  assert.equal(r[0].error, 'wikipedia 503');
  assert.equal(d.prepare('SELECT COUNT(*) AS n FROM prop_question WHERE answer IS NOT NULL').get().n, 0);
});
