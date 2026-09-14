/* THE NWSL, NCAA WOMEN'S VOLLEYBALL, AND THE COUNTDOWNS - the server half, on real captures.
 * Jason, 2026-09-13: "dont ask do any that appear valid. if any are out of season put a
 * countdown clock on the page."
 *
 * Real captures (ESPN, read 2026-09-13):
 *   fixtures/feed/espn-nwsl-scoreboard-260912.json / -260913.json   NWSL match days (a 1-1 draw on the 13th)
 *   fixtures/feed/espn-wvb-scoreboard-260912.json                   every D-I volleyball match on Saturday the 12th
 *   fixtures/feed/espn-wvb-scoreboard-251221.json                   the 2025 national final, Texas A&M 3-0 Kentucky
 *   fixtures/feed/espn-{nba,nhl,mcbb,mch}-scoreboard-nodate-260913.json   each league's season calendar
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDay } from '../src/slate-day.ts';
import { DAY_SPORTS, isSoccerDay } from '../src/lib/day.ts';
import { POOL_SPORTS, isSoccerSport, pickSides } from '../src/lib/groups.ts';
import { resolveGame } from '../src/lib/pool.ts';
import { nextGameFromCalendar, seasonNext } from '../src/season-next.ts';
import { UPCOMING, upcomingOn, upcomingAt, countdownText } from '../src/lib/upcoming.ts';

const load = (f) => JSON.parse(readFileSync(new URL('../fixtures/feed/' + f, import.meta.url), 'utf8'));
const SEP13 = Date.UTC(2026, 8, 13, 18, 0, 0);

test('the NWSL: a soccer day sport on ESPN\'s free feed, and a draw is a pick', () => {
  assert.ok(POOL_SPORTS.includes('nwsl'));
  assert.equal(DAY_SPORTS.nwsl.path, 'soccer/usa.nwsl');
  assert.ok(isSoccerDay('nwsl') && isSoccerSport('nwsl'));
  assert.deepEqual(pickSides('nwsl'), ['home', 'away', 'draw']);
  const sun = parseDay(load('espn-nwsl-scoreboard-260913.json'), 'nwsl', '20260913');
  assert.equal(sun.length, 2);
  const draw = sun.find((g) => g.homeScore === g.awayScore);
  assert.ok(draw, 'Portland 1, Chicago 1');
  assert.equal(draw.status, 'final');
  assert.equal(resolveGame({ ...draw, sport: 'nwsl' }, false), 'draw');
  const was = sun.find((g) => g.homeScore === 0 && g.awayScore === 3);
  assert.equal(resolveGame({ ...was, sport: 'nwsl' }, false), 'away', 'Boston won 3-0 at Washington');
  assert.equal(parseDay(load('espn-nwsl-scoreboard-260912.json'), 'nwsl', '20260912').length, 3, 'a Saturday night game is Saturday, Eastern');
});

test('NCAA women\'s volleyball: every Division I match, scored in sets, never a draw', () => {
  assert.ok(POOL_SPORTS.includes('womens-college-volleyball'));
  assert.equal(DAY_SPORTS['womens-college-volleyball'].groups, '', 'no groups filter: groups=50 lists only nine');
  assert.deepEqual(pickSides('womens-college-volleyball'), ['home', 'away']);
  const sat = parseDay(load('espn-wvb-scoreboard-260912.json'), 'womens-college-volleyball', '20260912');
  assert.ok(sat.length >= 100, 'a full Saturday: ' + sat.length);
  const finals = sat.filter((g) => g.status === 'final');
  assert.ok(finals.length > 0);
  assert.ok(finals.every((g) => g.homeScore !== g.awayScore && Math.max(g.homeScore, g.awayScore) === 3), 'best of five - someone wins three sets');
  for (const g of finals.slice(0, 20)) assert.equal(resolveGame({ ...g, sport: 'womens-college-volleyball' }, false), g.homeScore > g.awayScore ? 'home' : 'away');
  const title = parseDay(load('espn-wvb-scoreboard-251221.json'), 'womens-college-volleyball', '20251221');
  assert.equal(title.length, 1);
  assert.deepEqual([title[0].homeScore, title[0].awayScore], [0, 3], 'Texas A&M swept Kentucky');
});

test('an off-season pool\'s next game comes from ESPN\'s own season calendar', () => {
  assert.equal(nextGameFromCalendar(load('espn-nba-scoreboard-nodate-260913.json'), SEP13), Date.parse('2026-10-03T07:00Z'));
  assert.equal(nextGameFromCalendar(load('espn-nhl-scoreboard-nodate-260913.json'), SEP13), Date.parse('2026-09-19T07:00Z'));
  assert.equal(nextGameFromCalendar(load('espn-mcbb-scoreboard-nodate-260913.json'), SEP13), Date.parse('2026-11-02T08:00Z'));
  assert.equal(nextGameFromCalendar(load('espn-mch-scoreboard-nodate-260913.json'), SEP13), Date.parse('2026-10-02T07:00Z'));
  assert.equal(nextGameFromCalendar({}, SEP13), null);
  assert.equal(nextGameFromCalendar({ leagues: [{ calendar: ['2026-09-01T07:00Z'] }] }, SEP13), null, 'nothing ahead');
});

test('the season route: ESPN once, then KV; a sport with no one calendar is refused', async () => {
  const kv = new Map();
  const env = { LIVE: { get: async (k) => kv.get(k) ?? null, put: async (k, v, o) => { assert.ok(o.expirationTtl > 0 && o.expirationTtl < 2 ** 31); kv.set(k, v); } } };
  const urls = [];
  const fake = async (u) => { urls.push(String(u)); return new Response(JSON.stringify(load('espn-nba-scoreboard-nodate-260913.json'))); };
  const a = await seasonNext(env, 'nba', SEP13, fake);
  assert.deepEqual(a, { sport: 'nba', label: 'NBA', nextAt: Date.parse('2026-10-03T07:00Z') });
  assert.deepEqual(urls, ['https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard']);
  assert.deepEqual(await seasonNext(env, 'nba', SEP13 + 3600000, fake), a);
  assert.equal(urls.length, 1, 'the second look is KV');
  assert.equal(await seasonNext(env, 'cricket', SEP13, fake), null, 'cricket is gathered from several competitions');
  assert.equal(await seasonNext(env, 'nfl', SEP13, fake), null, 'not a day sport');
  const broken = await seasonNext({}, 'nhl', SEP13, async () => new Response('no', { status: 503 }));
  assert.deepEqual(broken, { sport: 'nhl', label: DAY_SPORTS.nhl.label, nextAt: null });
});

test('what is coming: every dated event ahead of the 13th, soonest first, a countdown by calendar day', () => {
  const ids = UPCOMING.map((u) => u.id);
  assert.equal(new Set(ids).size, ids.length, 'no id twice');
  assert.ok(UPCOMING.every((u) => u.tab === 'sports' || u.tab === 'nonsports'));
  assert.ok(UPCOMING.every((u) => !u.date || upcomingAt(u) > SEP13), 'nothing on the list has happened yet');
  assert.ok(UPCOMING.every((u) => !/super\s*bowl/i.test(u.label + u.when)), 'the Big Game, never its name');
  const sports = upcomingOn('sports', SEP13);
  assert.equal(sports[0].id, 'breeders-cup');
  assert.deepEqual(sports.filter((u) => u.date).map((u) => upcomingAt(u)), [...sports.filter((u) => u.date).map((u) => upcomingAt(u))].sort((a, b) => a - b));
  assert.ok(sports.findIndex((u) => !u.date) > sports.findLastIndex((u) => u.date), 'undated after dated');
  assert.equal(upcomingOn('nonsports', SEP13)[0].id, 'golden-globes');
  const oscars = UPCOMING.find((u) => u.id === 'oscars');
  const bc = UPCOMING.find((u) => u.id === 'breeders-cup');
  assert.equal(countdownText(oscars, SEP13, 'America/New_York'), 'in 182 days');
  assert.equal(countdownText(bc, SEP13, 'America/New_York'), 'in 47 days');
  assert.equal(countdownText(bc, Date.UTC(2026, 9, 29, 18), 'America/New_York'), 'tomorrow');
  assert.equal(countdownText(bc, Date.UTC(2026, 9, 30, 18), 'America/New_York'), 'today');
  assert.ok(!upcomingOn('sports', Date.UTC(2026, 9, 31, 12)).some((u) => u.id === 'breeders-cup'), 'gone after its day');
  assert.equal(countdownText(UPCOMING.find((u) => !u.date), SEP13), null);
});

test('the Breeders\' Cup countdown steps aside once its ready set is open', () => {
  assert.equal(UPCOMING.find((u) => u.id === 'breeders-cup').set, 'breeders-cup-2026');
  assert.ok(upcomingOn('sports', SEP13).some((u) => u.id === 'breeders-cup'), 'no set yet: the countdown shows');
  assert.ok(!upcomingOn('sports', SEP13, ['breeders-cup-2026']).some((u) => u.id === 'breeders-cup'), 'the set is open: its tile stands in');
  assert.ok(upcomingOn('sports', SEP13, ['emmys-2026']).some((u) => u.id === 'breeders-cup'), 'another set changes nothing');
});
