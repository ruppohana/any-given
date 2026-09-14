/* UFC AND CRICKET - Jason, 2026-09-13: "do the ufc and cricket next".
 *
 * Two day sports graded by ESPN's winner flag, not a score. Real captures, 2026-09-13:
 *   fixtures/feed/espn-ufc-scoreboard-260912.json   Noche UFC: Silva vs. Delgado - 13 bouts, final
 *   fixtures/feed/espn-ufc-scoreboard-260919.json   UFC 331: Van vs. Pantoja 2 - 13 bouts, scheduled
 *   fixtures/feed/espn-cricket-cpl-260912.json      Barbados Tridents v Jamaica Kingsmen - Tridents won
 *   fixtures/feed/espn-cricket-cpl-260910.json      Barbados Tridents v St Kitts and Nevis Patriots
 *   fixtures/feed/espn-cricket-cpl-260830.json      St Kitts v Antigua - "No result (abandoned with a toss)"
 *   fixtures/feed/espn-cricket-nzind-261022.json    New Zealand v India, the tour's first T20 - scheduled
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { parseUfcDay, parseCricketDay, captureDay } from '../src/slate-day.ts';
import { DAY_SPORTS, isDaySport, isWinnerDay } from '../src/lib/day.ts';
import { POOL_SPORTS, pickSides, hasNoSpread, gradeSql, isWinnerSport } from '../src/lib/groups.ts';
import { resolveGame, pickState } from '../src/lib/pool.ts';

const feed = (f) => JSON.parse(readFileSync(new URL('../fixtures/feed/' + f, import.meta.url), 'utf8'));
const NOCHE = parseUfcDay(feed('espn-ufc-scoreboard-260912.json'), '20260912');
const UFC331 = parseUfcDay(feed('espn-ufc-scoreboard-260919.json'), '20260919');
const CPL12 = parseCricketDay(feed('espn-cricket-cpl-260912.json'), '20260912');
const CPL10 = parseCricketDay(feed('espn-cricket-cpl-260910.json'), '20260910');
const CPL30 = parseCricketDay(feed('espn-cricket-cpl-260830.json'), '20260830');
const NZIND = parseCricketDay(feed('espn-cricket-nzind-261022.json'), '20261022');
const NOW = Date.UTC(2026, 8, 13, 18);

test('two day sports, two sides, no spread, graded by the winner flag', () => {
  assert.ok(POOL_SPORTS.includes('ufc') && POOL_SPORTS.includes('cricket'));
  assert.ok(isDaySport('ufc') && isDaySport('cricket'));
  assert.ok(isWinnerDay('ufc') && isWinnerSport('cricket'));
  assert.deepEqual(pickSides('ufc'), ['home', 'away'], 'no draw pick - a drawn bout is void');
  assert.ok(hasNoSpread('ufc') && hasNoSpread('cricket'));
  assert.equal(DAY_SPORTS.ufc.path, 'mma/ufc');
  assert.deepEqual(DAY_SPORTS.cricket.leagues.slice(0, 3), ['8623', '22547', '24469'], 'the CPL, the Asian Games, India in New Zealand');
});

test('a real UFC card: 13 bouts, each a final with the winner ESPN flagged, split prelims / main card', () => {
  assert.equal(NOCHE.length, 13);
  assert.ok(NOCHE.every((g) => g.status === 'final' && (g.winner === 'home' || g.winner === 'away')));
  assert.equal(NOCHE.filter((g) => g.card === 'Main card').length, 6, 'the 21:00Z segment');
  assert.equal(NOCHE.filter((g) => g.card === 'Prelims').length, 7, 'the 18:00Z segment');
  const main = NOCHE.find((g) => g.name === 'Jean Silva vs. Jose Miguel Delgado');
  assert.ok(main, 'the main event is a game');
  assert.equal(main.winner, 'home', 'Jean Silva, listed first');
  assert.equal(main.weightClass, 'Featherweight');
  assert.equal(main.event, 'Noche UFC: Silva vs. Delgado');
  const fighter = main.teams[0];
  assert.equal(fighter.name, 'Jean Silva');
  assert.match(fighter.logo, /teamlogos\/countries\/500\/[a-z]+\.png$/, 'a country flag stands in for a crest');
  assert.match(fighter.record, /^\d+-\d+-\d+$/);
  /* Graded as the pool grades it. */
  assert.equal(pickState('home', main, false, NOW), 'won');
  assert.equal(pickState('away', main, false, NOW), 'lost');
});

test('UFC 331 a week out: every bout scheduled, lockable at its segment\'s start, no winner yet', () => {
  assert.equal(UFC331.length, 13);
  assert.ok(UFC331.every((g) => g.status === 'scheduled' && g.winner === null));
  assert.ok(UFC331.every((g) => Number.isFinite(g.kickoffUtc)));
  assert.equal(resolveGame(UFC331[0], false), null, 'nothing decided before the fight');
});

test('cricket: a result is the winner ESPN flagged (the string "true"); no result is void', () => {
  assert.equal(CPL12.length, 1);
  const g = CPL12[0];
  assert.equal(g.status, 'final');
  assert.equal(g.winner, 'home', 'Barbados Tridents');
  assert.equal(g.summary, 'Tridents won by 2 wkts (0b rem)');
  assert.equal(g.homeScoreText, '151/8 (20 ov, target 151)');
  assert.equal(g.homeScore, null, 'text, never a number the grader could read');
  assert.equal(g.format, 'T20');
  assert.equal(g.competition, 'Caribbean Premier League');
  assert.equal(pickState('home', g, false, NOW), 'won');

  assert.equal(CPL10[0].status, 'final');
  const abandoned = CPL30[0];
  assert.match(abandoned.summary, /^No result/);
  assert.equal(abandoned.status, 'void');
  assert.equal(abandoned.winner, null);
  assert.equal(resolveGame(abandoned, false), 'void');
  assert.equal(pickState('home', abandoned, false, NOW), 'void', 'nobody wins or loses a washout');

  assert.equal(NZIND.length, 1, 'the tour\'s first T20 is a limited-overs match');
  assert.equal(NZIND[0].status, 'scheduled');
  assert.equal(NZIND[0].homeScoreText, null);
});

test('the standings SQL grades both by the winner, and a washout or a draw counts for nobody', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE game (id TEXT PRIMARY KEY, status TEXT, void INTEGER, home_score INTEGER, away_score INTEGER, spread REAL, winner TEXT);
           CREATE TABLE pick (user_id TEXT, game_id TEXT, side TEXT, spread_at REAL);`);
  const games = [...NOCHE, ...CPL12, ...CPL10, ...CPL30];
  const ig = db.prepare('INSERT INTO game VALUES (?, ?, 0, NULL, NULL, NULL, ?)');
  for (const g of games) ig.run(g.id, g.status === 'void' ? 'void' : g.status, g.winner);
  const ip = db.prepare('INSERT INTO pick VALUES (?, ?, ?, NULL)');
  for (const g of games) { ip.run('home', g.id, 'home'); ip.run('right', g.id, g.winner || 'home'); }
  const count = (sport) => {
    const G = gradeSql(sport, false);
    return Object.fromEntries(db.prepare(`SELECT p.user_id AS id,
        SUM(CASE WHEN g.status = 'final' AND g.void = 0 AND ${G.counted} AND p.side = ${G.result} THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN g.status = 'final' AND g.void = 0 AND ${G.counted} THEN 1 ELSE 0 END) AS played
      FROM pick p JOIN game g ON g.id = p.game_id GROUP BY p.user_id`).all().map((r) => [r.id, [r.wins, r.played]]));
  };
  const r = count('ufc');
  const decided = games.filter((g) => g.winner).length;
  assert.deepEqual(r.right, [decided, decided], 'every decided bout and match, and not the washout');
  assert.equal(r.home[0], games.filter((g) => g.winner === 'home').length);
});

test('a cricket day is gathered from every competition in season; one that fails costs only its own', async () => {
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(String(url));
    if (url.includes('/cricket/8623/')) return new Response(JSON.stringify(feed('espn-cricket-cpl-260912.json')));
    if (url.includes('/cricket/24469/')) return new Response('down', { status: 503 });
    return new Response(JSON.stringify({ events: [] }));
  };
  const kv = new Map();
  const env = { LIVE: { get: async (k) => kv.get(k) ?? null, put: async (k, v, o) => { assert.ok(o.expirationTtl >= 60); kv.set(k, v); } } };
  const r = await captureDay(env, 'cricket', '20260912', fakeFetch, NOW);
  assert.equal(calls.length, DAY_SPORTS.cricket.leagues.length, 'one request per competition');
  assert.ok(calls.every((u) => u.includes('site.web.api.espn.com') && u.includes('dates=20260912')));
  assert.equal(r.wrote, 1, 'the CPL match, despite the tour that answered 503');
  assert.equal(JSON.parse(kv.get('day:cricket:20260912')).games[0].winner, 'home');
  await assert.rejects(() => captureDay(env, 'cricket', '20260913', async () => new Response('x', { status: 500 }), NOW),
    /espn 500/, 'when no competition answers, the capture fails - it never writes an empty day');
});
