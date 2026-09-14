/* THE BIG BROTHER 28 FINALE - a ready set that settles itself from the season's infobox.
 * Jason, 2026-09-13: "do the big brother finale set next". CBS, Thursday, October 1, 2026.
 *
 * Real captures (Wikipedia REST HTML, read 2026-09-13):
 *   fixtures/props/wiki-bb-27.html   Big Brother 27, finished: Ashley Hollis won, Vince Panaro
 *                                    runner-up, Keanu Soto America's Favorite Houseguest
 *   fixtures/props/wiki-bb-28.html   Big Brother 28 with seven HouseGuests still in the house
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { infoboxAnswers, norm } from '../src/lib/props-settle.ts';
import { PROP_TEMPLATES, templatesOpen } from '../src/lib/props.ts';
import { settleReadySets, wikiHtmlUrl } from '../src/props-settle-run.ts';

const page = (n) => readFileSync(new URL('../fixtures/props/wiki-' + n + '.html', import.meta.url), 'utf8');
const B27 = page('bb-27'), B28 = page('bb-28');
const BB = PROP_TEMPLATES['big-brother-28'];
const LOCK = Date.UTC(2026, 9, 2, 0, 0, 0);

test('the infobox: last season names its winner, runner-up and America\'s Favorite; this season, none yet', () => {
  assert.deepEqual(infoboxAnswers(B27), { winner: 'Ashley Hollis', 'runner-up': 'Vince Panaro', afh: 'Keanu Soto' });
  assert.deepEqual(infoboxAnswers(B28), {}, 'nothing is answered before the finale');
  assert.deepEqual(infoboxAnswers('<p>no infobox</p>'), {});
});

test('the set: the seven still in the house to win, all seventeen for America\'s Favorite, locked at 8 PM Eastern on the 1st', () => {
  assert.deepEqual(BB.source, { kind: 'wiki-bb', page: 'Big_Brother_28_(American_season)' });
  assert.deepEqual(BB.questions.map((q) => q.key), ['winner', 'runner-up', 'afh']);
  assert.deepEqual(BB.questions.map((q) => q.points), [5, 3, 2]);
  assert.ok(BB.questions.every((q) => q.lockAt === LOCK), '8 PM ET Thursday, October 1');
  const text = B28.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(text, /scheduled to conclude on October 1, 2026/);
  const pageNorm = norm(text);
  for (const o of BB.questions[2].options) assert.ok(pageNorm.includes(norm(o)), 'on the page: ' + o);
  assert.equal(BB.questions[0].options.length, 7);
  assert.deepEqual(BB.questions[1].options, BB.questions[0].options);
  assert.equal(BB.questions[2].options.length, 17);
  assert.ok(!BB.questions[0].options.includes('Angela Murray'), 'an evicted HouseGuest cannot win');
  /* The seven are the page's own "Participating" rows. */
  const hg = B28.slice(B28.search(/>HouseGuests</)).split(/<\/table>/i)[0];
  const rows = hg.split(/<tr\b[^>]*>/i).slice(2).map((r) => r.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  const inHouse = rows.filter((r) => !/Evicted|Eliminated/.test(r)).map((r) => BB.questions[0].options.find((o) => r.startsWith(o))).filter(Boolean);
  assert.deepEqual(inHouse.sort(), [...BB.questions[0].options].sort());
  assert.ok(templatesOpen(Date.UTC(2026, 8, 13)).some((t) => t.id === 'big-brother-28'));
  assert.ok(!templatesOpen(LOCK).some((t) => t.id === 'big-brother-28'), 'gone once it locks');
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
  const ins = d.prepare('INSERT INTO prop_question VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0)');
  BB.questions.forEach((q, i) => ins.run('HOUSE', 'big-brother-28-' + (i + 1), i + 1, q.text, JSON.stringify(q.options), q.points, q.lockAt));
  const ans = (n) => d.prepare('SELECT answer FROM prop_question WHERE qid = ?').get('big-brother-28-' + n).answer;
  return { ans, DB: { prepare: (sql) => stmt(sql), batch: async (l) => { for (const s of l) await s.run(); } } };
}

test('it settles through the same run - last season\'s page, with this season\'s names standing in', async () => {
  const { ans, DB } = db();
  /* TEST INPUT: last season's finished page, its three names swapped for three of this season's. */
  const html = B27.replaceAll('Ashley Hollis', 'Dee Valladares').replaceAll('Vince Panaro', 'Rick Devens').replaceAll('Keanu Soto', 'Kamu Kirk');
  const urls = [];
  const fake = async (u) => { urls.push(String(u)); return new Response(html); };
  assert.deepEqual(await settleReadySets({ DB }, LOCK - 60000, fake, { force: true, only: 'big-brother-28' }), [], 'nothing is read before the lock');
  const r = await settleReadySets({ DB }, LOCK + 4 * 3600 * 1000, fake, { force: true, only: 'big-brother-28' });
  assert.deepEqual(urls, [wikiHtmlUrl('Big_Brother_28_(American_season)')]);
  assert.equal(r[0].settled, 3);
  assert.deepEqual([ans(1), ans(2), ans(3)], ['Dee Valladares', 'Rick Devens', 'Kamu Kirk']);
});

test('this season\'s real page the night before settles nothing', async () => {
  const { ans, DB } = db();
  const r = await settleReadySets({ DB }, LOCK + 3600 * 1000, async () => new Response(B28), { force: true, only: 'big-brother-28' });
  assert.equal(r[0].settled, 0);
  assert.deepEqual([ans(1), ans(2), ans(3)], [null, null, null]);
});
