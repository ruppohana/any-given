/* THE PRESIDENTS CUP - team match play, match by match. Jason, 2026-09-13: "do the ...
 * presidents cup next". Sept 24-27, 2026; the Ryder Cup is the same shape in 2027.
 *
 * Real captures:
 *   fixtures/feed/espn-golf-presidents-cup-2024.json          the 2024 Presidents Cup, final:
 *        USA 18.5 - International 11.5, 30 matches, three halved
 *   fixtures/feed/espn-golf-presidents-cup-2024-players.json  every pair's players, from ESPN's
 *        core API (competitions/<c>/competitors/<pair>/roster -> athletes/<id>)
 *   fixtures/feed/espn-golf-ryder-cup-2025.json               the 2025 Ryder Cup - session order check
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { parseGolfCupDay, golfCupPlayers } from '../src/slate-day.ts';
import { DAY_SPORTS, isWinnerDay } from '../src/lib/day.ts';
import { POOL_SPORTS, pickSides, hasNoSpread, gradeSql } from '../src/lib/groups.ts';
import { resolveGame, pickState } from '../src/lib/pool.ts';

const feed = (f) => JSON.parse(readFileSync(new URL('../fixtures/feed/' + f, import.meta.url), 'utf8'));
const PC = feed('espn-golf-presidents-cup-2024.json');
const PLAYERS = feed('espn-golf-presidents-cup-2024-players.json');
const RC = feed('espn-golf-ryder-cup-2025.json');
const DAYS = ['20240926', '20240927', '20240928', '20240929'];
const ALL = DAYS.flatMap((d) => parseGolfCupDay(PC, d, PLAYERS));
const NOW = Date.UTC(2026, 8, 13);

test('a pool sport of its own: match by match, three sides (a halved match is a pick), no spread', () => {
  assert.ok(POOL_SPORTS.includes('golf-cup'));
  assert.equal(DAY_SPORTS['golf-cup'].path, 'golf/pga');
  assert.ok(isWinnerDay('golf-cup'));
  assert.deepEqual(pickSides('golf-cup'), ['home', 'away', 'draw']);
  assert.ok(hasNoSpread('golf-cup'));
});

test('the real 2024 Presidents Cup: 30 matches and the cup, each on its own day, sessions named', () => {
  assert.equal(ALL.length, 31);
  assert.deepEqual(DAYS.map((d) => parseGolfCupDay(PC, d, PLAYERS).length), [6, 5, 8, 12], 'the cup rides on Thursday');
  const cup = ALL.find((g) => g.overall);
  assert.equal(cup.day, '20240926');
  assert.equal(cup.winner, 'home', 'USA 18.5 - 11.5');
  assert.equal(cup.homeScoreText, '18.5');
  assert.equal(cup.kickoffUtc, Math.min(...ALL.filter((g) => !g.overall).map((g) => g.kickoffUtc)), 'locks with the first match');
  const count = (s) => ALL.filter((g) => g.session === s).length;
  assert.deepEqual([count('Four-ball'), count('Foursomes'), count('Singles')], [9, 9, 12]);
  assert.ok(ALL.every((g) => g.status === 'final'));
});

test('a halved match is a result - the draw pick wins it - and a pair carries its two players', () => {
  const halved = ALL.filter((g) => g.winner === 'draw');
  assert.equal(halved.length, 3);
  for (const g of halved) {
    assert.equal(g.homeScoreText, 'Halved');
    assert.equal(resolveGame(g, false), 'draw');
    assert.equal(pickState('draw', g, false, NOW), 'won');
    assert.equal(pickState('home', g, false, NOW), 'lost');
  }
  const first = ALL.find((g) => g.id === '11530');
  assert.equal(first.session, 'Four-ball');
  assert.equal(first.teams[0].team, 'USA');
  assert.equal(first.teams[1].team, 'INTL');
  assert.match(first.teams[0].name, / \/ /, 'two players, from the core API');
  assert.equal(first.winner, 'home');
  assert.equal(first.homeScoreText, '1 Up');
  assert.match(first.teams[0].logo, /countries\/500\/usa\.png$/);
  assert.match(first.teams[1].logo, /countries\/500\/intl\.png$/);
  const singles = ALL.filter((g) => g.session === 'Singles');
  assert.ok(singles.every((g) => !g.teams[0].name.includes('/')), 'one player a side on Sunday');
  assert.ok(singles.some((g) => g.teams[0].name === 'Xander Schauffele'));
  /* Without the players, a pair still reads as its team. */
  const bare = parseGolfCupDay(PC, '20240926', null).find((g) => g.id === '11530');
  assert.equal(bare.teams[0].name, 'USA');
});

test('a won match carries its score line on the winner\'s side only - the loser\'s is null', () => {
  const sun = parseGolfCupDay(PC, '20240929', PLAYERS);
  const m = sun.find((g) => g.teams[0].name === 'Scottie Scheffler');
  assert.equal(m.teams[1].name, 'Hideki Matsuyama');
  assert.equal(m.winner, 'away');
  assert.equal(m.homeScoreText, null);
  assert.match(m.awayScoreText, /^\d & \d$|Up$/);
  for (const g of ALL.filter((x) => !x.overall && (x.winner === 'home' || x.winner === 'away'))) {
    const [w, l] = g.winner === 'home' ? [g.homeScoreText, g.awayScoreText] : [g.awayScoreText, g.homeScoreText];
    assert.ok(w && !l, `${g.id}: the line is the winner's`);
  }
});

test('the 2025 Ryder Cup: foursomes then four-ball on Friday, singles Sunday - the same session map', () => {
  const fri = parseGolfCupDay(RC, '20250926', null).filter((g) => !g.overall);
  assert.deepEqual([...new Set(fri.map((g) => g.session))], ['Foursomes', 'Four-ball']);
  const sun = parseGolfCupDay(RC, '20250928', null);
  assert.ok(sun.every((g) => g.session === 'Singles'));
  assert.equal(parseGolfCupDay(RC, '20250926', null)[0].teams[1].team, 'EUR');
});

test('the standings SQL counts a halved match as played and the draw pick right', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE game (id TEXT PRIMARY KEY, status TEXT, void INTEGER, home_score INTEGER, away_score INTEGER, spread REAL, winner TEXT);
           CREATE TABLE pick (user_id TEXT, game_id TEXT, side TEXT, spread_at REAL);`);
  const ig = db.prepare('INSERT INTO game VALUES (?, ?, 0, NULL, NULL, NULL, ?)');
  for (const g of ALL) ig.run(g.id, g.status, g.winner);
  const ip = db.prepare('INSERT INTO pick VALUES (?, ?, ?, NULL)');
  for (const g of ALL) { ip.run('usa', g.id, 'home'); ip.run('right', g.id, g.winner); }
  const G = gradeSql('golf-cup', false);
  const rows = Object.fromEntries(db.prepare(`SELECT p.user_id AS id,
      SUM(CASE WHEN g.status = 'final' AND g.void = 0 AND ${G.counted} AND p.side = ${G.result} THEN 1 ELSE 0 END) AS wins,
      SUM(CASE WHEN g.status = 'final' AND g.void = 0 AND ${G.counted} THEN 1 ELSE 0 END) AS played
    FROM pick p JOIN game g ON g.id = p.game_id GROUP BY p.user_id`).all().map((r) => [r.id, [r.wins, r.played]]));
  assert.deepEqual(rows.right, [31, 31], 'every match and the cup - a halve included');
  assert.equal(rows.usa[0], ALL.filter((g) => g.winner === 'home').length);
});

test('a pair\'s players come from the core API once, then from KV', async () => {
  const one = { events: [{ id: '401656722', name: 'Presidents Cup', competitions: [PC.events[0].competitions[1]] }] };
  const pairId = String(PC.events[0].competitions[1].competitors[0].id);
  const kv = new Map();
  const env = { LIVE: { get: async (k) => kv.get(k) ?? null, put: async (k, v, o) => { assert.ok(o.expirationTtl >= 60); kv.set(k, v); } } };
  const calls = [];
  const fake = async (url) => {
    calls.push(String(url));
    if (url.includes('/roster')) {
      const other = url.includes('/competitors/' + pairId + '/') ? [2230, 10140] : [1, 2];
      return new Response(JSON.stringify({ entries: other.map((id) => ({ playerId: id })) }));
    }
    const id = url.split('/athletes/')[1];
    return new Response(JSON.stringify({ displayName: { '2230': 'Patrick Cantlay', '10140': 'Xander Schauffele', '1': 'A One', '2': 'B Two' }[id] }));
  };
  const first = await golfCupPlayers(env, one, fake);
  assert.deepEqual(first[pairId], ['Patrick Cantlay', 'Xander Schauffele']);
  const n = calls.length;
  const again = await golfCupPlayers(env, one, fake);
  assert.deepEqual(again, first);
  assert.equal(calls.length, n, 'the second capture asks ESPN for nothing');
  assert.ok(calls.every((u) => u.startsWith('https://sports.core.api.espn.com/v2/sports/golf/')));
});
