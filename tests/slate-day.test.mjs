/* BASKETBALL ON THE SLATE, ONE DAY AT A TIME - read off two real scoreboards.
 *
 * fixtures/feed/espn-mbb-scoreboard-260307.json  92 finished games (ranks, conferences, channels)
 * fixtures/feed/espn-mbb-scoreboard-261102.json  78 scheduled games, the 2026-27 opener
 *
 * Both captured from the feed on 2026-09-12; nothing here is written by hand.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDay, captureDay, serveDay, isStale } from '../src/slate-day.ts';
import { dayOf, addDays, dayLabel, hoopsClock, isDaySport, CONF_SHORT } from '../src/lib/day.ts';
import { gameWinnerProbs } from '../src/lib/price-model.ts';

const feed = (f) => JSON.parse(readFileSync(new URL('../fixtures/feed/' + f, import.meta.url), 'utf8'));
const FINAL = feed('espn-mbb-scoreboard-260307.json');
const OPENER = feed('espn-mbb-scoreboard-261102.json');
const SPORT = 'mens-college-basketball';

/* A KV that refuses what KV refuses - a TTL in milliseconds would pass a
   forgiving fake and fail in production (the four-emails lesson, 2026-09-11). */
function fakeKv() {
  const m = new Map();
  return {
    m,
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async put(k, v, o) {
      if (typeof v !== 'string') throw new Error('KV values are strings');
      if (o && o.expirationTtl != null) {
        const t = o.expirationTtl;
        if (!Number.isInteger(t) || t < 60 || t > 2147483647) throw new Error('Value out of range');
      }
      m.set(k, v);
    }
  };
}
const fetchOf = (payload) => async () => new Response(JSON.stringify(payload), { status: 200 });

test('a finished day reads whole: 92 games, final, scored, ranked, in conferences', () => {
  const g = parseDay(FINAL, SPORT, '20260307');
  assert.equal(g.length, 92);
  assert.ok(g.every((x) => x.status === 'final'), 'every game final');
  assert.ok(g.every((x) => Number.isFinite(x.homeScore) && Number.isFinite(x.awayScore)), 'every game scored');
  const duke = g.find((x) => x.shortName === 'UNC @ DUKE');
  assert.ok(duke, 'UNC at Duke is on the day');
  assert.deepEqual([duke.homeScore, duke.awayScore], [76, 61]);
  assert.equal(duke.rankHome, 1, 'Duke #1');
  assert.deepEqual(duke.conferences, ['ACC']);
  assert.equal(duke.broadcast, 'ESPN');
  assert.match(duke.teams[0].record, /^\d+-\d+$/);
  assert.deepEqual(duke.periodsHome.reduce((a, b) => a + b, 0), 76, 'halves add up to the final');
  assert.ok(g.every((x, i) => i === 0 || x.kickoffUtc >= g[i - 1].kickoffUtc), 'in tip order');
});

test('the opener reads as scheduled, unscored, and with no line offers no line', () => {
  const g = parseDay(OPENER, SPORT, '20261102');
  assert.equal(g.length, 78);
  assert.ok(g.every((x) => x.status === 'scheduled' && x.homeScore === null && x.awayScore === null));
  assert.ok(g.every((x) => x.spread === null), 'no line posted yet, none invented');
  assert.equal(g.filter((x) => x.tbd === true).length, 64, 'ESPN has not set 64 of the 78 tip times');
  assert.equal(parseDay(FINAL, SPORT, '20260307').filter((x) => x.tbd).length, 0, 'a played day has none');
  assert.ok(g.every((x) => x.teams.length === 2 && x.teams.every((t) => t.id && t.name)), 'identity travels with the game');
});

test('today is the Eastern date, rolled over at 6 AM', () => {
  assert.equal(dayOf(Date.parse('2026-11-03T05:30:00Z')), '20261102', '12:30 AM Eastern is still last night');
  assert.equal(dayOf(Date.parse('2026-11-03T11:30:00Z')), '20261103', '6:30 AM Eastern is the new day');
  assert.equal(addDays('20261130', 1), '20261201');
  assert.equal(addDays('20270101', -1), '20261231');
  assert.equal(dayLabel('20261102', '20261102'), 'Today');
  assert.equal(dayLabel('20261103', '20261102'), 'Tomorrow');
  assert.equal(dayLabel('20261106', '20261102'), 'Fri, Nov 6');
});

test('the clock speaks in halves, not quarters', () => {
  assert.equal(hoopsClock(1, '12:34'), '1st 12:34');
  assert.equal(hoopsClock(1, '0:00'), 'Halftime');
  assert.equal(hoopsClock(2, '0:45'), '2nd 0:45');
  assert.equal(hoopsClock(2, '0:00'), 'End 2nd');
  assert.equal(hoopsClock(3, '2:10'), 'OT 2:10');
  assert.equal(hoopsClock(4, '1:00'), '2OT 1:00');
  assert.equal(hoopsClock(1, '5:00', 'STATUS_HALFTIME'), 'Halftime');
});

test('basketball is a day sport and football is not; the conference table is counted', () => {
  assert.equal(isDaySport(SPORT), true);
  assert.equal(isDaySport('college-football'), false);
  assert.equal(isDaySport('nfl'), false);
  assert.equal(CONF_SHORT['2'], 'ACC');
  assert.equal(CONF_SHORT['7'], 'Big Ten');
});

test('a captured day goes to KV in seconds, and an empty capture never wipes a good one', async () => {
  const env = { LIVE: fakeKv() };
  const r = await captureDay(env, SPORT, '20260307', fetchOf(FINAL));
  assert.equal(r.wrote, 92);
  assert.equal(JSON.parse(env.LIVE.m.get('day:' + SPORT + ':20260307')).games.length, 92);
  const again = await captureDay(env, SPORT, '20260307', fetchOf({ events: [] }));
  assert.equal(again.wrote, 0);
  assert.equal(JSON.parse(env.LIVE.m.get('day:' + SPORT + ':20260307')).games.length, 92, 'still 92');
});

test('a fresh day is served from KV; a stale live day is refetched', async () => {
  const env = { LIVE: fakeKv() };
  const now = Date.parse('2026-11-03T01:00:00Z');   // 8 PM Eastern, Nov 2
  let calls = 0;
  const f = async () => { calls++; return new Response(JSON.stringify(OPENER), { status: 200 }); };
  const first = await serveDay(env, SPORT, '20261102', now, f);
  assert.equal(first.games.length, 78); assert.equal(calls, 1);
  const second = await serveDay(env, SPORT, '20261102', now + 1000, f);
  assert.equal(second.games.length, 78); assert.equal(calls, 1, 'fresh - no refetch');
  const live = { fetchedAt: now, games: [{ status: 'in_progress', kickoffUtc: now }] };
  assert.equal(isStale(live, now + 30 * 1000), false);
  assert.equal(isStale(live, now + 60 * 1000), true, 'a live day is old after 45 seconds');
  const quiet = { fetchedAt: now, games: [{ status: 'scheduled', kickoffUtc: now + 86400000 }] };
  assert.equal(isStale(quiet, now + 5 * 60 * 1000), false, 'a quiet day keeps for ten minutes');
  const far = await serveDay({ LIVE: fakeKv() }, SPORT, '20270301', now, f);
  assert.equal(far, null); assert.equal(calls, 1, 'a far-off day is never fetched on demand');
});

test('the NBA reads a day the same way: finals in quarters, East and West, the feed\'s own crest', () => {
  const NBA_FINAL = feed('espn-nba-scoreboard-260301.json');
  const NBA_OPEN = feed('espn-nba-scoreboard-261021.json');
  const g = parseDay(NBA_FINAL, 'nba', '20260301');
  assert.equal(g.length, 11);
  assert.ok(g.every((x) => x.status === 'final'));
  assert.ok(g.every((x) => x.periodsHome && x.periodsHome.length >= 4), 'four quarters (or more)');
  assert.ok(g.every((x) => x.periodsHome.reduce((a, b) => a + b, 0) === x.homeScore), 'quarters add up to the final');
  assert.ok(g.every((x) => x.conferences.every((c) => c === 'East' || c === 'West') && x.conferences.length >= 1), 'East / West');
  assert.ok(g.every((x) => x.teams.every((t) => /^https:\/\/a\.espncdn\.com\/i\/teamlogos\/nba\//.test(t.logo))), 'crest URL from the feed');
  assert.ok(g.every((x) => x.rankHome === null && x.rankAway === null), 'no ranks in the NBA');
  const o = parseDay(NBA_OPEN, 'nba', '20261021');
  assert.equal(o.length, 11);
  assert.ok(o.every((x) => x.status === 'scheduled' && x.tbd === false), 'every opening-night tip time is set');
  assert.ok(o.filter((x) => x.spread !== null).length >= 1, 'lines already posted for opening night');
  assert.equal(isDaySport('nba'), true);
});

test('the NBA clock counts quarters: halftime after the 2nd, overtime after the 4th', async () => {
  const { dayClock } = await import('../src/lib/day.ts');
  assert.equal(dayClock('nba', 1, '5:32'), '1st 5:32');
  assert.equal(dayClock('nba', 1, '0:00'), 'End 1st');
  assert.equal(dayClock('nba', 2, '0:00'), 'Halftime');
  assert.equal(dayClock('nba', 3, '0:00'), 'End 3rd');
  assert.equal(dayClock('nba', 4, '1:10'), '4th 1:10');
  assert.equal(dayClock('nba', 5, '3:00'), 'OT 3:00');
  assert.equal(dayClock('nba', 6, '0:30'), '2OT 0:30');
  assert.equal(dayClock('mens-college-basketball', 3, '2:10'), 'OT 2:10', 'college unchanged');
});

test('the win price uses basketball\'s measured spread of outcomes, not football\'s', () => {
  const hoops = gameWinnerProbs(-10, SPORT).home;
  const cfb = gameWinnerProbs(-10, 'college-football').home;
  assert.ok(hoops > 0.8 && hoops < 0.83, 'a 10-point favourite wins ~81% at sd 11.2, got ' + hoops.toFixed(3));
  assert.ok(hoops > cfb + 0.05, 'narrower than football');
  const nba = gameWinnerProbs(-10, 'nba').home;
  assert.ok(nba > 0.74 && nba < 0.78, 'the NBA\'s measured sd 14.3: a 10-point favourite ~76%, got ' + nba.toFixed(3));
});
