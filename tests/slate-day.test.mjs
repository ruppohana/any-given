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

test('the win price uses basketball\'s measured spread of outcomes, not football\'s', () => {
  const hoops = gameWinnerProbs(-10, SPORT).home;
  const cfb = gameWinnerProbs(-10, 'college-football').home;
  assert.ok(hoops > 0.8 && hoops < 0.83, 'a 10-point favourite wins ~81% at sd 11.2, got ' + hoops.toFixed(3));
  assert.ok(hoops > cfb + 0.05, 'narrower than football');
});
