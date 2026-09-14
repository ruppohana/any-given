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

test('a failed read settles nothing and says why', async () => {
  const { d, DB } = db();
  load(d, 'OFFICE');
  const r = await settleReadySets({ DB }, Date.UTC(2026, 8, 15, 3, 0), async () => new Response('nope', { status: 503 }), { force: true });
  assert.equal(r[0].error, 'wikipedia 503');
  assert.equal(d.prepare('SELECT COUNT(*) AS n FROM prop_question WHERE answer IS NOT NULL').get().n, 0);
});
