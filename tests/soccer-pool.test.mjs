/* SOCCER IN THE POOL - THE ONE POOL WHERE A DRAW IS A PICK.
 *
 * Jason, 2026-09-12: "complete the pool revision, but do all the sports for the
 * pool". The Premier League and MLS play a day at a time, like the NBA - but a
 * level final is a result there, not the void path. On 2026-09-12, four of seven
 * Premier League matches ended level (BOU-BRE 2-2, CHE-HUL 2-2, LIV-FUL 0-0,
 * TOT-EVE 0-0). Voiding those would have thrown away most of the day.
 *
 * The grading SQL is run for real, in SQLite (D1 is SQLite), on the captured
 * EPL day - the fragments are the ones src/worker.ts puts in the standings query.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { DAY_SPORTS, isDaySport, dayClock } from '../src/lib/day.ts';
import { POOL_SPORTS, poolSport, isSoccerSport, hasNoSpread, pickSides, gradeSql, worldPoolId } from '../src/lib/groups.ts';
import { parseDay } from '../src/slate-day.ts';
import { resolveGame, pickState, pickPointsFor, voidReason } from '../src/lib/pool.ts';

const load = (p) => JSON.parse(readFileSync(new URL('../fixtures/feed/' + p, import.meta.url), 'utf8'));
const W = readFileSync(new URL('../src/worker.ts', import.meta.url), 'utf8');
const GR = readFileSync(new URL('../src/groups.ts', import.meta.url), 'utf8');

test('the Premier League and MLS are day sports on ESPN\'s soccer paths', () => {
  assert.equal(DAY_SPORTS.epl.path, 'soccer/eng.1');
  assert.equal(DAY_SPORTS.mls.path, 'soccer/usa.1');
  assert.ok(isDaySport('epl') && isDaySport('mls'));
  assert.ok(POOL_SPORTS.includes('epl') && POOL_SPORTS.includes('mls'));
  assert.equal(poolSport('epl'), 'epl');
  assert.equal(worldPoolId('mls'), 'world-mls');
});

test('three sides in soccer, two everywhere else; no spread in soccer or a race', () => {
  assert.deepEqual(pickSides('epl'), ['home', 'away', 'draw']);
  assert.deepEqual(pickSides('mls'), ['home', 'away', 'draw']);
  for (const s of ['college-football', 'nfl', 'nba', 'mlb', 'nhl']) assert.deepEqual(pickSides(s), ['home', 'away'], s);
  assert.ok(isSoccerSport('epl') && !isSoccerSport('nfl'));
  assert.ok(hasNoSpread('epl') && hasNoSpread('mls') && hasNoSpread('f1') && hasNoSpread('nascar-truck'));
  assert.equal(hasNoSpread('nfl'), false);
});

test('the pick route takes a draw only for soccer, and a soccer group never stores a spread', () => {
  assert.ok(W.includes('if (!b.gameId || !pickSides(poolSport(b.sport)).includes(String(b.side))) {'));
  assert.ok(W.includes('const G = gradeSql(sport, ats);'));
  assert.ok(W.includes('AND p.side = ${G.result}'));
  assert.equal((W.match(/AND \$\{G\.counted\}/g) || []).length, 2, 'wins and played both use the same counted rule');
  assert.equal((GR.match(/!hasNoSpread\(/g) || []).length, 2, 'create and settings both refuse a spread');
});

test('a soccer clock is ESPN\'s own minute', () => {
  assert.equal(dayClock('epl', 2, "67'", 'STATUS_SECOND_HALF'), "67'");
  assert.equal(dayClock('mls', 1, "45'+2'", 'STATUS_FIRST_HALF'), "45'+2'");
  assert.equal(dayClock('epl', 1, "45'", 'STATUS_HALFTIME'), 'Halftime');
  assert.equal(dayClock('nba', 3, '4:10'), '3rd 4:10', 'the NBA clock is untouched');
});

/* The standings arithmetic, on the real day. */
function grade(sport, ats, games, picks) {
  const db = new DatabaseSync(':memory:');
  /* `winner` since migration 0010: a level soccer knockout that one side still won. */
  db.exec(`CREATE TABLE game (id TEXT PRIMARY KEY, status TEXT, void INTEGER, home_score INTEGER, away_score INTEGER, spread REAL, winner TEXT);
           CREATE TABLE pick (user_id TEXT, game_id TEXT, side TEXT, spread_at REAL);`);
  const ig = db.prepare('INSERT INTO game VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (const g of games) ig.run(g.id, g.status, 0, g.homeScore, g.awayScore, g.spread ?? null, g.winner ?? null);
  const ip = db.prepare('INSERT INTO pick VALUES (?, ?, ?, NULL)');
  for (const [u, id, side] of picks) ip.run(u, id, side);
  const G = gradeSql(sport, ats);
  const rows = db.prepare(`SELECT p.user_id AS id,
      SUM(CASE WHEN g.status = 'final' AND g.void = 0 AND g.home_score IS NOT NULL AND g.away_score IS NOT NULL
               AND ${G.counted} AND p.side = ${G.result} THEN 1 ELSE 0 END) AS wins,
      SUM(CASE WHEN g.status = 'final' AND g.void = 0 AND g.home_score IS NOT NULL AND g.away_score IS NOT NULL
               AND ${G.counted} THEN 1 ELSE 0 END) AS played
    FROM pick p JOIN game g ON g.id = p.game_id GROUP BY p.user_id ORDER BY p.user_id`).all();
  db.close();
  return Object.fromEntries(rows.map((r) => [r.id, { wins: r.wins, played: r.played }]));
}

test('on the real EPL day, a draw pick wins a level final and every match counts as played', () => {
  const games = parseDay(load('espn-epl-scoreboard-260912.json'), 'epl', '20260912');
  assert.equal(games.length, 7);
  const homeWins = games.filter((g) => g.homeScore > g.awayScore).length;
  const awayWins = games.filter((g) => g.homeScore < g.awayScore).length;
  const picks = [];
  for (const g of games) {
    picks.push(['draw-every-game', g.id, 'draw']);
    picks.push(['home-every-game', g.id, 'home']);
    picks.push(['away-every-game', g.id, 'away']);
    const right = g.homeScore > g.awayScore ? 'home' : g.homeScore < g.awayScore ? 'away' : 'draw';
    picks.push(['all-right', g.id, right]);
  }
  const r = grade('epl', false, games, picks);
  assert.deepEqual(r['draw-every-game'], { wins: 4, played: 7 });
  assert.deepEqual(r['home-every-game'], { wins: homeWins, played: 7 });
  assert.deepEqual(r['away-every-game'], { wins: awayWins, played: 7 });
  assert.deepEqual(r['all-right'], { wins: 7, played: 7 });
  /* A soccer group asked for the spread still grades straight up. */
  assert.deepEqual(grade('epl', true, games, picks), r);
});

test('the screens\' grader agrees: a draw pick wins a level soccer final, nothing voids', () => {
  const games = parseDay(load('espn-epl-scoreboard-260912.json'), 'epl', '20260912');
  let draws = 0;
  for (const g of games) {
    const out = resolveGame(g, false);
    assert.equal(resolveGame(g, true), out, 'a soccer game never grades against a spread');
    assert.equal(voidReason(g, false), null);
    if (g.homeScore === g.awayScore) {
      draws++;
      assert.equal(out, 'draw');
      assert.equal(pickState('draw', g, false, Date.now()), 'won');
      assert.equal(pickState('home', g, false, Date.now()), 'lost');
      assert.equal(pickPointsFor('draw', g, false), 1);
    } else {
      assert.equal(pickState('draw', g, false, Date.now()), 'lost');
    }
  }
  assert.equal(draws, 4);
  /* The same level score in the NFL is still a tie, and a tie voids. */
  const tie = { ...games.find((g) => g.homeScore === g.awayScore), sport: 'nfl' };
  assert.equal(resolveGame(tie, false), 'void');
});

test('outside soccer a level final is still the one void path', () => {
  const games = [{ id: 'g1', status: 'final', homeScore: 20, awayScore: 20 }, { id: 'g2', status: 'final', homeScore: 27, awayScore: 20 }];
  const r = grade('nfl', false, games, [['u', 'g1', 'home'], ['u', 'g2', 'home'], ['d', 'g1', 'draw']]);
  assert.deepEqual(r.u, { wins: 1, played: 1 });
  assert.deepEqual(r.d, { wins: 0, played: 0 }, 'a tie voids, so even a stray draw pick is not played');
});
