/* EVERY SPORT IN THE POOL - the server half, on captured data.
 *
 * Jason, 2026-09-12: "complete the pool revision, but do all the sports for the
 * pool". A group can be college football, NFL, college basketball, NBA or F1.
 *
 * fixtures/feed/espn-f1-scoreboard-260912.json   Spanish GP: qualifying final, race to come
 * fixtures/feed/espn-f1-scoreboard-260906.json   Italian GP: the whole weekend final
 * fixtures/f1/italian-gp-2026-race-core.json     that race's core documents
 * fixtures/feed/espn-mbb-scoreboard-261102.json  the 2026-27 college basketball opener (TBD tips)
 * fixtures/feed/espn-mbb-scoreboard-260307.json  a finished day (UNC at Duke)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { POOL_SPORTS, poolSport, worldPoolId, cleanScope, isCollegeSport } from '../src/lib/groups.ts';
import { cleanF1Picks, f1Standings } from '../src/f1-pool.ts';
import { parseF1, raceExtras, scoreWeekend } from '../src/lib/f1.ts';
import { parseDay, writeDayGames } from '../src/slate-day.ts';

const load = (p) => JSON.parse(readFileSync(new URL('../fixtures/' + p, import.meta.url), 'utf8'));
const SPAIN = parseF1(load('feed/espn-f1-scoreboard-260912.json'));
const ITALY = parseF1(load('feed/espn-f1-scoreboard-260906.json'));
const ITALY_X = raceExtras(load('f1/italian-gp-2026-race-core.json'));

test('eighteen sports and questions, and anything else is a college football group', () => {
  /* NASCAR joined 2026-09-12 ("do nascar next"), then MLB, NHL and WNBA ("keep
     working on making it larger"), then NASCAR's O'Reilly and Truck series, then
     the Premier League and MLS (tests/soccer-pool.test.mjs). */
  assert.deepEqual([...POOL_SPORTS], ['college-football', 'nfl', 'mens-college-basketball', 'nba', 'f1', 'nascar',
    'mlb', 'nhl', 'wnba', 'nascar-oreilly', 'nascar-truck', 'epl', 'mls',
    'ucl', 'laliga', 'ligamx', 'mens-college-hockey', 'womens-college-basketball', 'props', 'ufc', 'cricket', 'golf-cup',
    /* Big Game squares, 2026-09-13 (tests/squares.test.mjs). */
    'squares']);
  for (const s of POOL_SPORTS) assert.equal(poolSport(s), s);
  assert.equal(poolSport('curling'), 'college-football');
  assert.equal(poolSport(undefined), 'college-football');
  assert.equal(worldPoolId('nfl'), 'world-nfl');
  assert.equal(worldPoolId('college-football'), 'world-cfb', 'the two boards that already exist keep their ids');
  assert.equal(worldPoolId('nba'), 'world-nba');
});

test('only the college sports choose their games; the rest play everything', () => {
  assert.deepEqual(cleanScope('mens-college-basketball', 'top25', null), { scope: 'top25', arg: null });
  for (const s of ['nfl', 'nba', 'f1']) assert.deepEqual(cleanScope(s, 'top25', null), { scope: 'all', arg: null }, s);
  assert.deepEqual(cleanScope(null, 'top25', null), { scope: 'top25', arg: null }, 'a row from before the sport column is college football');
  assert.equal(isCollegeSport('nba'), false);
});

test('F1: a locked pick keeps what was stored, an open one takes a valid change', () => {
  const now = Date.parse('2026-09-12T20:00:00Z');   // qualifying over, race tomorrow
  const stored = { qual: ['5579', '5829', '4665'] };
  const out = cleanF1Picks(SPAIN, {
    qual: ['4665', '5579', '5829'],                 // qualifying has run - refused
    race: ['5579', '5829', '4665'], fastest: '5579', poleWins: 'yes', dnf: '1-2',
    sprint: ['5579', '', '']                        // no sprint this weekend - refused
  }, stored, now);
  assert.deepEqual(out.qual, stored.qual, 'nobody picks a qualifying they have watched');
  assert.deepEqual(out.race, ['5579', '5829', '4665']);
  assert.equal(out.fastest, '5579');
  assert.equal(out.poleWins, 'yes');
  assert.equal(out.dnf, '1-2');
  assert.equal('sprint' in out, false);
});

test('F1: a driver twice, a driver not racing, or a made-up answer changes nothing', () => {
  const now = Date.parse('2026-09-12T20:00:00Z');
  const stored = { race: ['5579', '', ''], dnf: '0' };
  assert.deepEqual(cleanF1Picks(SPAIN, { race: ['5579', '5579', ''] }, stored, now).race, ['5579', '', '']);
  assert.deepEqual(cleanF1Picks(SPAIN, { race: ['999999', '', ''] }, stored, now).race, ['5579', '', '']);
  assert.equal(cleanF1Picks(SPAIN, { dnf: 'lots' }, stored, now).dnf, '0');
  assert.deepEqual(cleanF1Picks(SPAIN, { race: ['', '', ''] }, stored, now).race, ['', '', ''], 'clearing a row is allowed while it is open');
  const after = Date.parse('2026-09-13T20:00:00Z');   // the race has started
  assert.deepEqual(cleanF1Picks(SPAIN, { race: ['5829', '', ''] }, stored, after).race, ['5579', '', '']);
});

function fakeDb(tables) {
  return {
    prepare(sql) {
      return {
        bind() {
          return {
            all: async () => ({ results: sql.includes('FROM member') ? tables.member : sql.includes('FROM f1_pick') ? tables.f1_pick : [] })
          };
        }
      };
    }
  };
}
const fakeKv = (m) => ({ get: async (k) => (k in m ? m[k] : null) });

test('F1 season board: points over every weekend entered, from the kept result', async () => {
  const winnerPick = { race: [ITALY.sessions.find((s) => s.kind === 'race').order[0], '', ''], fastest: ITALY_X.fastest };
  const env = {
    DB: fakeDb({
      member: [{ user_id: 'u1', display_name: 'Ann' }, { user_id: 'u2', display_name: 'Bo' }, { user_id: 'u3', display_name: 'Cy' }],
      f1_pick: [
        { user_id: 'u1', event_id: ITALY.id, picks: JSON.stringify(winnerPick) },
        { user_id: 'u2', event_id: ITALY.id, picks: JSON.stringify({ poleWins: 'no' }) }
      ]
    }),
    LIVE: fakeKv({ ['f1:event:' + ITALY.id]: JSON.stringify({ event: ITALY, extras: ITALY_X }) })
  };
  const rows = await f1Standings(env, 'ABC123');
  assert.deepEqual(rows.map((r) => r.name), ['Ann', 'Bo', 'Cy']);
  assert.equal(rows[0].points, scoreWeekend(ITALY, winnerPick, ITALY_X).total);
  assert.equal(rows[0].points, 6, 'the winner in the right slot (3) and the fastest lap (3)');
  assert.equal(rows[0].wins, rows[0].points, 'the football board\'s names carry the points');
  assert.equal(rows[2].events, 0, 'a member who entered nothing is on the board at zero');
});

test('basketball games go into the results table by day, never a game without a tip time', async () => {
  const batches = [];
  const env = { DB: { prepare: () => ({ bind: (...a) => a }), batch: async (list) => { batches.push(...list); } } };
  const opener = parseDay(load('feed/espn-mbb-scoreboard-261102.json'), 'mens-college-basketball', '20261102');
  const timed = opener.filter((g) => !g.tbd);
  assert.ok(opener.length > timed.length, 'the opener has TBD tips');
  assert.equal(await writeDayGames(env, 'mens-college-basketball', '20261102', opener), timed.length);
  assert.equal(batches.length, timed.length);
  assert.ok(batches.every((a) => a[2] === 20261102), 'the pool week is the day');
  assert.ok(batches.every((a) => a[10] === 'mens-college-basketball'));

  batches.length = 0;
  const done = parseDay(load('feed/espn-mbb-scoreboard-260307.json'), 'mens-college-basketball', '20260307');
  await writeDayGames(env, 'mens-college-basketball', '20260307', done);
  const finals = batches.filter((a) => a[7] === 'final');
  assert.ok(finals.length > 0);
  assert.ok(finals.every((a) => Number.isFinite(a[8]) && Number.isFinite(a[9])), 'a final carries both scores');
  assert.equal(await writeDayGames({}, 'nba', '20260307', done), 0, 'no database, nothing written');
});
