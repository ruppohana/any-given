/* BIG GAME PROPS - a ready set that settles itself off ESPN's game summary. Jason, 2026-09-14:
 * "do the big game props set next". Sunday, February 14, 2027; the teams are set after the
 * conference championships, so every question is one either side can answer.
 *
 * Real captures (ESPN's NFL summary, read 2026-09-14):
 *   fixtures/feed/espn-nfl-big-game-summary-260208.json   last February's game, final: Seattle 29,
 *        New England 13 - quarters SEA 3-6-3-17, NE 0-0-0-13, nine scoring plays, a field goal first
 *   fixtures/feed/espn-nfl-big-game-summary-270214.json   next February's game, scheduled, TBD at TBD
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { bigGameAnswers, BIG_GAME_PROPS_OPTIONS } from '../src/lib/biggame-props.ts';
import { PROP_TEMPLATES, templatesOpen } from '../src/lib/props.ts';
import { BIG_GAME } from '../src/lib/squares.ts';
import { settleReadySets, espnSummaryUrl } from '../src/props-settle-run.ts';
import { upcomingOn } from '../src/lib/upcoming.ts';

const feed = (f) => JSON.parse(readFileSync(new URL('../fixtures/feed/' + f, import.meta.url), 'utf8'));
const LAST = feed('espn-nfl-big-game-summary-260208.json');
const NEXT = feed('espn-nfl-big-game-summary-270214.json');
const SET = PROP_TEMPLATES['big-game-props-2027'];
const Q = Object.fromEntries(SET.questions.map((q) => [q.key, q]));

test('last February\'s game answers every question from ESPN\'s summary', () => {
  assert.deepEqual(bigGameAnswers(LAST), {
    total: '40 to 49',             /* 29 + 13 = 42 */
    margin: '15 or more points',   /* 16 */
    overtime: 'No',
    'top-quarter': '4th quarter',  /* 17 + 13 = 30 */
    'first-score': 'Field goal',   /* Jason Myers, 33 yards, 1st quarter */
    'long-td': 'No'                /* the longest touchdown was a 45-yard interception return */
  });
  assert.deepEqual(bigGameAnswers(NEXT), {}, 'nothing is answered before the game is final');
  assert.deepEqual(bigGameAnswers(null), {});
});

test('overtime, a tied top quarter and a long touchdown (TEST INPUT - the real game, changed where named)', () => {
  const clone = () => JSON.parse(JSON.stringify(LAST));
  /* An overtime period on each side: the total and the margin include it; it is never a quarter. */
  const ot = clone();
  const [h, a] = ['home', 'away'].map((ha) => ot.header.competitions[0].competitors.find((c) => c.homeAway === ha));
  h.linescores.push({ displayValue: '0' }); a.linescores.push({ displayValue: '6' }); a.score = '35';
  const o = bigGameAnswers(ot);
  assert.deepEqual([o.overtime, o.total, o.margin, o['top-quarter']], ['Yes', '40 to 49', '15 or more points', '4th quarter']);
  /* Two quarters tied for the most: no single pick called it. */
  const tie = clone();
  const [th, ta] = ['home', 'away'].map((ha) => tie.header.competitions[0].competitors.find((c) => c.homeAway === ha));
  th.linescores = ['10', '10', '0', '0'].map((v) => ({ displayValue: v })); ta.linescores = ['0', '0', '3', '3'].map((v) => ({ displayValue: v }));
  assert.equal(bigGameAnswers(tie)['top-quarter'], 'void');
  /* A 64-yard touchdown. */
  const long = clone();
  long.scoringPlays[4].text = 'AJ Barner 64 Yd pass from Sam Darnold (Jason Myers Kick)';
  assert.equal(bigGameAnswers(long)['long-td'], 'Yes');
});

test('the set: six questions either side can answer, every answer one of its own options, locked at kickoff', () => {
  assert.deepEqual(SET.source, { kind: 'espn-nfl-game', page: BIG_GAME.eventId });
  assert.ok(SET.questions.every((q) => q.lockAt === BIG_GAME.kickoffUtc), 'kickoff - the same as the squares');
  for (const [key, opts] of Object.entries(BIG_GAME_PROPS_OPTIONS)) assert.deepEqual(Q[key].options, [...opts], key);
  for (const [key, ans] of Object.entries(bigGameAnswers(LAST))) assert.ok(Q[key].options.includes(ans), key + ': ' + ans);
  assert.ok(!/super\s*bowl/i.test(JSON.stringify(SET)), 'the Big Game, never its name');
  assert.ok(templatesOpen(Date.UTC(2026, 8, 14)).some((t) => t.id === 'big-game-props-2027'));
  assert.ok(!templatesOpen(BIG_GAME.kickoffUtc).some((t) => t.id === 'big-game-props-2027'), 'gone at kickoff');
  assert.ok(!upcomingOn('sports', Date.UTC(2026, 8, 14)).some((u) => u.id === 'big-game-props'), 'the countdown steps aside for the open set');
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
  SET.questions.forEach((q, i) => ins.run('OFFICE', 'big-game-props-2027-' + (i + 1), i + 1, q.text, JSON.stringify(q.options), q.points, q.lockAt));
  const ans = (key) => d.prepare('SELECT answer FROM prop_question WHERE qid = ?').get('big-game-props-2027-' + (SET.questions.indexOf(Q[key]) + 1)).answer;
  return { ans, DB: { prepare: (sql) => stmt(sql), batch: async (l) => { for (const s of l) await s.run(); } } };
}

test('it settles through the same run - ESPN\'s summary, last February\'s game standing in', async () => {
  const { ans, DB } = db();
  const urls = [];
  const fake = async (u) => { urls.push(String(u)); return new Response(JSON.stringify(LAST)); };
  assert.deepEqual(await settleReadySets({ DB }, BIG_GAME.kickoffUtc - 60000, fake, { force: true, only: 'big-game-props-2027' }), [], 'nothing is read before kickoff');
  const r = await settleReadySets({ DB }, BIG_GAME.kickoffUtc + 5 * 3600 * 1000, fake, { force: true, only: 'big-game-props-2027' });
  assert.deepEqual(urls, [espnSummaryUrl('401873270')]);
  assert.equal(r[0].settled, 6);
  assert.deepEqual(['total', 'margin', 'first-score', 'top-quarter', 'overtime', 'long-td'].map(ans),
    ['40 to 49', '15 or more points', 'Field goal', '4th quarter', 'No', 'No']);
  /* The game still scheduled on ESPN settles nothing; a failed read says it was ESPN. */
  const two = db();
  assert.equal((await settleReadySets({ DB: two.DB }, BIG_GAME.kickoffUtc + 3600000, async () => new Response(JSON.stringify(NEXT)), { force: true, only: 'big-game-props-2027' }))[0].settled, 0);
  const bad = await settleReadySets({ DB: two.DB }, BIG_GAME.kickoffUtc + 3600000, async () => new Response('no', { status: 503 }), { force: true, only: 'big-game-props-2027' });
  assert.equal(bad[0].error, 'espn 503');
});
