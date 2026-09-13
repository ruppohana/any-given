/* MLB, NHL AND WNBA IN THE POOL, AND THE RULES THAT KEEP A DAY SPORT HONEST.
 *
 * Jason, 2026-09-12: "keep working on making it larger and more robust."
 *
 * fixtures/feed/espn-mlb-scoreboard-260912.json   15 MLB games, all final
 * fixtures/feed/espn-nhl-scoreboard-260110.json   14 NHL games, one decided in a shootout
 * Captured from ESPN 2026-09-13; nothing here is written by hand.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DAY_SPORTS, isDaySport } from '../src/lib/day.ts';
import { POOL_SPORTS } from '../src/lib/groups.ts';
import { parseDay, writeDayGames } from '../src/slate-day.ts';

const load = (p) => JSON.parse(readFileSync(new URL('../fixtures/feed/' + p, import.meta.url), 'utf8'));
const WORKER = readFileSync(new URL('../src/worker.ts', import.meta.url), 'utf8');

test('three more leagues play a day at a time, and a group can pick any of them', () => {
  for (const s of ['mlb', 'nhl', 'wnba']) {
    assert.ok(isDaySport(s), s + ' is a day sport');
    assert.ok(POOL_SPORTS.includes(s), s + ' is a pool sport');
  }
  assert.equal(DAY_SPORTS.mlb.path, 'baseball/mlb');
  assert.equal(DAY_SPORTS.nhl.path, 'hockey/nhl');
  assert.equal(DAY_SPORTS.wnba.path, 'basketball/wnba');
});

test('an MLB day reads like any other: 15 finals, scores in, no college conference borrowed', () => {
  const games = parseDay(load('espn-mlb-scoreboard-260912.json'), 'mlb', '20260912');
  assert.equal(games.length, 15);
  assert.ok(games.every((g) => g.status === 'final' && Number.isFinite(g.homeScore) && Number.isFinite(g.awayScore)));
  assert.ok(games.every((g) => g.homeScore !== g.awayScore), 'baseball has no ties');
  assert.ok(games.every((g) => g.teams.every((t) => t.conference === null)), 'CONF_SHORT is college\'s table, never a pro league\'s');
});

test('an NHL shootout still has a winner in the final score, so it is graded, not voided', () => {
  const games = parseDay(load('espn-nhl-scoreboard-260110.json'), 'nhl', '20260110');
  assert.equal(games.length, 14);
  const so = games.find((g) => /SO/.test(g.statusName) || (g.name || '').includes('Edmonton') && (g.name || '').includes('Los Angeles'));
  assert.ok(so, 'the LA at Edmonton shootout');
  assert.equal(so.status, 'final');
  assert.notEqual(so.homeScore, so.awayScore, 'ESPN counts the shootout goal - 4-3 - so the margin is not zero');
});

test('the day capture writes pro games to the results table under the day', async () => {
  const rows = [];
  const env = { DB: { prepare: () => ({ bind: (...a) => a }), batch: async (l) => { rows.push(...l); } } };
  const games = parseDay(load('espn-nhl-scoreboard-260110.json'), 'nhl', '20260110');
  assert.equal(await writeDayGames(env, 'nhl', '20260110', games), 14);
  assert.ok(rows.every((a) => a[2] === 20260110 && a[10] === 'nhl'));
});

test('robustness: yesterday is re-read, a day-sport pick needs a real game, and the feeds report their age', () => {
  assert.ok(WORKER.includes('for (const day of [addDays(today, -1), today, addDays(today, 1)]) {'),
    'a game that went final after its day\'s last run is still graded');
  assert.ok(WORKER.includes("if (!g && isDaySport(sport)) {") && WORKER.includes("error: 'unknown_game'"),
    'no pick locks at a time the phone chose');
  assert.ok(WORKER.includes("if (p === '/api/health/feeds') {"));
});
