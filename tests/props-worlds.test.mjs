/* THE CYCLING WORLDS - a ready set that settles itself from Wikipedia's medal table.
 * Jason, 2026-09-13: "do the cycling worlds next". Montréal, September 20-27, 2026.
 *
 * Real captures (Wikipedia REST HTML, read 2026-09-13):
 *   fixtures/props/wiki-worlds-2025.html   Kigali 2025, run: Pogačar, Evenepoel, Vallieres, Reusser, Australia
 *   fixtures/props/wiki-worlds-2024.html   Zurich 2024, run: Pogačar, Evenepoel, Kopecky, Grace Brown, Australia
 *   fixtures/props/wiki-worlds-2026.html   Montréal the week before: the schedule, no medal table yet
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { medalsFromWiki, findEvent, pickOption } from '../src/lib/props-settle.ts';
import { PROP_TEMPLATES, templatesOpen } from '../src/lib/props.ts';
import { settleReadySets, wikiHtmlUrl } from '../src/props-settle-run.ts';

const page = (n) => readFileSync(new URL('../fixtures/props/wiki-' + n + '.html', import.meta.url), 'utf8');
const W24 = page('worlds-2024'), W25 = page('worlds-2025'), W26 = page('worlds-2026');
const W = PROP_TEMPLATES['worlds-2026'];
const Q = Object.fromEntries(W.questions.map((q) => [q.key, q]));

test('the medal table: the five elite golds, never an under-23 or junior row (real 2025 and 2024)', () => {
  const m = medalsFromWiki(W25);
  assert.equal(m.size, 5);
  assert.match(findEvent(m, "Men's road race"), /^Tadej Pogačar Slovenia/);
  assert.match(findEvent(m, "Men's time trial"), /^Remco Evenepoel Belgium/);
  assert.match(findEvent(m, "Women's road race"), /^Magdeleine Vallieres Canada/);
  assert.match(findEvent(m, "Women's time trial"), /^Marlen Reusser Switzerland/);
  assert.match(findEvent(m, 'relay'), /^Australia /);
  const m24 = medalsFromWiki(W24);
  assert.equal(m24.size, 5);
  assert.match(findEvent(m24, "Women's road race"), /^Lotte Kopecky Belgium/);
  assert.match(findEvent(m24, "Women's time trial"), /^Grace Brown Australia/);
  assert.match(findEvent(m24, "Men's road race"), /^Tadej Pogačar/, "the men's key never reads the women's row");
});

test('Montréal the week before: no medals yet, and each race locks at its own start on the schedule', () => {
  assert.equal(medalsFromWiki(W26).size, 0, 'nothing is answered before a race is run');
  assert.deepEqual(W.source, { kind: 'wiki-medals', page: '2026_UCI_Road_World_Championships' });
  /* Eastern Daylight Time is UTC-4. */
  assert.equal(Q["Women's time trial"].lockAt, Date.UTC(2026, 8, 20, 13, 0), 'Sunday the 20th, 9:00');
  assert.equal(Q["Men's time trial"].lockAt, Date.UTC(2026, 8, 20, 16, 45), 'Sunday the 20th, 12:45');
  assert.equal(Q.relay.lockAt, Date.UTC(2026, 8, 22, 12, 30), 'Tuesday the 22nd, 8:30');
  assert.equal(Q["Women's road race"].lockAt, Date.UTC(2026, 8, 26, 13, 0), 'Saturday the 26th, 9:00');
  assert.equal(Q["Men's road race"].lockAt, Date.UTC(2026, 8, 27, 13, 0), 'Sunday the 27th, 9:00');
  /* The schedule on the real page says so. */
  assert.match(W26.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '), /26 September 09:00 14:10 Elite women/);
  for (const q of W.questions) assert.match(q.options.at(-1), /^(Someone else|Another nation)$/, 'every race has its catch-all, last');
  assert.ok(templatesOpen(Date.UTC(2026, 8, 13)).some((t) => t.id === 'worlds-2026'));
});

test('a result settles the rider it names, the catch-all for a winner nobody listed, and waits on a near miss', () => {
  const men = Q["Men's road race"].options, women = Q["Women's road race"].options, relay = Q.relay.options;
  assert.equal(pickOption(men, 'Tadej Pogačar Slovenia'), 'Tadej Pogačar');
  assert.equal(pickOption(men, 'Tadej Pogacar Slovenia'), 'Tadej Pogačar', 'accents or not');
  assert.equal(pickOption(men, "Ben O'Connor Australia"), 'Someone else');
  /* The page spells a listed rider another way: her surname is there, so no catch-all - it waits. */
  assert.equal(pickOption(women, 'Katarzyna Niewiadoma Poland'), null);
  assert.equal(pickOption(women, 'Kasia Niewiadoma Poland'), 'Kasia Niewiadoma');
  assert.equal(pickOption(relay, 'Australia Michael Matthews Lucas Plapp Jay Vine Brodie Chapman'), 'Australia');
  assert.equal(pickOption(relay, 'Denmark Mads Pedersen Mattias Skjelmose'), 'Another nation');
  assert.equal(pickOption(['Yes', 'No'], 'Maybe'), null, 'no catch-all, no guess');
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
  W.questions.forEach((q, i) => ins.run('PELOTON', 'worlds-2026-' + (i + 1), i + 1, q.text, JSON.stringify(q.options), q.points, q.lockAt));
  const ans = (key) => d.prepare('SELECT answer FROM prop_question WHERE qid = ?').get('worlds-2026-' + (W.questions.indexOf(Q[key]) + 1)).answer;
  return { ans, DB: { prepare: (sql) => stmt(sql), batch: async (l) => { for (const s of l) await s.run(); } } };
}

test('the settler writes each race once it has locked, from the page - last year\'s standing in', async () => {
  const { ans, DB } = db();
  const urls = [];
  const fake = async (u) => { urls.push(String(u)); return new Response(W25); };
  /* Monday the 21st: both time trials have locked; the relay and the road races have not. */
  const mon = await settleReadySets({ DB }, Date.UTC(2026, 8, 21, 4, 0), fake, { force: true, only: 'worlds-2026' });
  assert.equal(mon[0].settled, 2);
  assert.deepEqual(urls, [wikiHtmlUrl('2026_UCI_Road_World_Championships')]);
  assert.equal(ans("Women's time trial"), 'Marlen Reusser');
  assert.equal(ans("Men's time trial"), 'Remco Evenepoel');
  assert.equal(ans("Men's road race"), null, 'not run yet - not read');
  const mon2 = await settleReadySets({ DB }, Date.UTC(2026, 8, 28, 4, 0), fake, { force: true, only: 'worlds-2026' });
  assert.equal(mon2[0].settled, 3);
  assert.equal(ans('relay'), 'Australia');
  assert.equal(ans("Women's road race"), 'Magdeleine Vallieres');
  assert.equal(ans("Men's road race"), 'Tadej Pogačar');
});

test('a winner nobody listed pays the catch-all through the same run (the real 2024 page: Grace Brown)', async () => {
  const { ans, DB } = db();
  await settleReadySets({ DB }, Date.UTC(2026, 8, 28, 4, 0), async () => new Response(W24), { force: true, only: 'worlds-2026' });
  assert.equal(ans("Women's time trial"), 'Someone else', 'Grace Brown is not on the list');
  assert.equal(ans("Women's road race"), 'Lotte Kopecky');
  assert.equal(ans('relay'), 'Australia');
});
