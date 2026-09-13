/* A KNOCKOUT HAS A WINNER - and three more soccer leagues and college hockey.
 *
 * Jason, 2026-09-13: "for soccer we are only doing MLS and premier?" then, of a
 * knockout match decided on penalties: "a knockout round has a winner, that is the
 * winner". And: "college hockey?"
 *
 * Real captures, through the real parser and the real grading SQL (SQLite - D1 is
 * SQLite):
 *   fixtures/feed/espn-ucl-scoreboard-260530.json       the 2026 Champions League final:
 *                                                        PSG 1-1 Arsenal, PSG on penalties (4-3)
 *   fixtures/feed/espn-worldcup-scoreboard-260629.json  a World Cup knockout day: two
 *                                                        shootouts and one match won in normal time
 *   fixtures/feed/espn-epl-scoreboard-260912.json       a league day - its four draws stay draws
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { parseDay } from '../src/slate-day.ts';
import { resolveGame, pickState } from '../src/lib/pool.ts';
import { gradeSql, isSoccerSport, POOL_SPORTS, hasNoSpread, pickSides } from '../src/lib/groups.ts';
import { DAY_SPORTS, isSoccerDay } from '../src/lib/day.ts';

const feed = (f) => JSON.parse(readFileSync(new URL('../fixtures/feed/' + f, import.meta.url), 'utf8'));
const FINAL = parseDay(feed('espn-ucl-scoreboard-260530.json'), 'ucl', '20260530');
/* A World Cup day is not a pool league; it is parsed as a soccer day because it is
   the only captured day with more than one shootout on it. */
const WC = parseDay(feed('espn-worldcup-scoreboard-260629.json'), 'ucl', '20260629');
const EPL = parseDay(feed('espn-epl-scoreboard-260912.json'), 'epl', '20260912');
const NOW = Date.UTC(2026, 8, 13);

test('three more soccer leagues and college hockey, on ESPN\'s own paths', () => {
  assert.equal(DAY_SPORTS.ucl.path, 'soccer/uefa.champions');
  assert.equal(DAY_SPORTS.laliga.path, 'soccer/esp.1');
  assert.equal(DAY_SPORTS.ligamx.path, 'soccer/mex.1');
  assert.equal(DAY_SPORTS['mens-college-hockey'].path, 'hockey/mens-college-hockey');
  for (const s of ['ucl', 'laliga', 'ligamx']) {
    assert.ok(isSoccerSport(s) && isSoccerDay(s) && hasNoSpread(s), s);
    assert.deepEqual(pickSides(s), ['home', 'away', 'draw'], s);
    assert.ok(POOL_SPORTS.includes(s), s);
  }
  assert.ok(POOL_SPORTS.includes('mens-college-hockey'));
  assert.equal(isSoccerSport('mens-college-hockey'), false);
  assert.deepEqual(pickSides('mens-college-hockey'), ['home', 'away'], 'college hockey has no draw pick');
});

test('the Champions League final: level after extra time, PSG through on penalties - PSG won it', () => {
  assert.equal(FINAL.length, 1);
  const g = FINAL[0];
  assert.equal(g.statusName, 'STATUS_FINAL_PEN');
  assert.equal(g.status, 'final');
  assert.equal(g.homeScore, g.awayScore, 'the shootout is not in the score');
  assert.equal(g.winner, 'home', 'PSG, at home in the listing, went through');
  assert.equal(g.penHome, 4);
  assert.equal(g.penAway, 3);
  assert.equal(resolveGame(g, false), 'home');
  assert.equal(pickState('home', g, false, NOW), 'won');
  assert.equal(pickState('draw', g, false, NOW), 'lost', 'a knockout has a winner - the draw pick loses');
  assert.equal(pickState('away', g, false, NOW), 'lost');
});

test('a knockout day: each shootout goes to the side that went through; a normal-time win is untouched', () => {
  const pens = WC.filter((g) => g.statusName === 'STATUS_FINAL_PEN');
  assert.equal(pens.length, 2);
  for (const g of pens) {
    assert.ok(g.winner === 'home' || g.winner === 'away', g.shortName);
    assert.equal(resolveGame(g, false), g.winner, g.shortName);
    assert.ok(Number.isInteger(g.penHome) && Number.isInteger(g.penAway) && g.penHome !== g.penAway, g.shortName);
    assert.equal(g.winner, g.penHome > g.penAway ? 'home' : 'away', 'the flag agrees with the shootout');
  }
  const ft = WC.find((g) => g.statusName === 'STATUS_FULL_TIME');
  assert.equal(ft.winner, null);
  assert.equal(ft.penHome, null);
});

test('a league-phase draw carries no winner and stays a draw', () => {
  const draws = EPL.filter((g) => g.homeScore === g.awayScore);
  assert.equal(draws.length, 4);
  for (const g of draws) {
    assert.equal(g.winner, null);
    assert.equal(resolveGame(g, false), 'draw');
  }
});

test('the standings SQL reads the winner before the score', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE game (id TEXT PRIMARY KEY, status TEXT, void INTEGER, home_score INTEGER, away_score INTEGER, spread REAL, winner TEXT);
           CREATE TABLE pick (user_id TEXT, game_id TEXT, side TEXT, spread_at REAL);`);
  const ig = db.prepare('INSERT INTO game VALUES (?, ?, ?, ?, ?, ?, ?)');
  const all = [...FINAL, ...WC, ...EPL.filter((g) => g.homeScore === g.awayScore)];
  for (const g of all) ig.run(g.id, g.status, 0, g.homeScore, g.awayScore, null, g.winner ?? null);
  const ip = db.prepare('INSERT INTO pick VALUES (?, ?, ?, NULL)');
  for (const g of all) {
    ip.run('draw', g.id, 'draw');
    ip.run('right', g.id, resolveGame(g, false));
  }
  const G = gradeSql('ucl', false);
  const rows = db.prepare(`SELECT p.user_id AS id,
      SUM(CASE WHEN g.status = 'final' AND g.void = 0 AND ${G.counted} AND p.side = ${G.result} THEN 1 ELSE 0 END) AS wins,
      SUM(CASE WHEN g.status = 'final' AND g.void = 0 AND ${G.counted} THEN 1 ELSE 0 END) AS played
    FROM pick p JOIN game g ON g.id = p.game_id GROUP BY p.user_id`).all();
  db.close();
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  /* 1 final + 3 World Cup + 4 league draws = 8 played. The draw pick wins only the
     four league draws; every shootout went to a side. */
  assert.equal(by.right.wins, all.length);
  assert.equal(by.right.played, all.length);
  assert.equal(by.draw.wins, 4);
});
