/* WOMEN'S COLLEGE BASKETBALL - Jason, 2026-09-13: "add women's college basketball too".
 *
 * fixtures/feed/espn-wcbb-scoreboard-260307.json - a real Division I day (groups=50):
 * 72 games, all final, every one a conference game (conference tournament week).
 * Without groups=50 ESPN returns 10 featured games - which is why the path carries it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDay } from '../src/slate-day.ts';
import { DAY_SPORTS, isDaySport, dayClock } from '../src/lib/day.ts';
import { POOL_SPORTS, poolSport, isCollegeSport, cleanScope, pickSides, hasNoSpread, worldPoolId } from '../src/lib/groups.ts';

const DAY = parseDay(JSON.parse(readFileSync(new URL('../fixtures/feed/espn-wcbb-scoreboard-260307.json', import.meta.url), 'utf8')),
  'womens-college-basketball', '20260307');

test('a Division I day sport, two sides, and a college sport', () => {
  const cfg = DAY_SPORTS['womens-college-basketball'];
  assert.equal(cfg.path, 'basketball/womens-college-basketball');
  assert.equal(cfg.groups, '50', 'Division I, not the featured handful');
  assert.equal(cfg.periods, 4, 'four quarters');
  assert.ok(isDaySport('womens-college-basketball'));
  assert.ok(POOL_SPORTS.includes('womens-college-basketball'));
  assert.equal(poolSport('womens-college-basketball'), 'womens-college-basketball');
  assert.equal(worldPoolId('womens-college-basketball'), 'world-womens-college-basketball');
  assert.ok(isCollegeSport('womens-college-basketball'));
  assert.deepEqual(pickSides('womens-college-basketball'), ['home', 'away']);
  assert.equal(hasNoSpread('womens-college-basketball'), false);
});

test('a college group chooses its games: all, the Top 25, or one conference', () => {
  assert.deepEqual(cleanScope('womens-college-basketball', 'top25', null), { scope: 'top25', arg: null });
  assert.deepEqual(cleanScope('womens-college-basketball', 'all', null), { scope: 'all', arg: null });
});

test('the real day parses: 72 finals, each with its conference and the Top 25 ranks', () => {
  assert.equal(DAY.length, 72);
  for (const g of DAY) {
    assert.equal(g.status, 'final', g.shortName);
    assert.equal(g.sport, 'womens-college-basketball');
    assert.ok(g.conferences.length >= 1, g.shortName + ' has a conference');
    assert.ok(g.homeScore !== g.awayScore, 'basketball does not end level');
  }
  const confs = new Set(DAY.flatMap((g) => g.conferences));
  for (const c of ['Big East', 'Big Ten', 'SEC', 'ACC', 'Big 12']) assert.ok(confs.has(c), c);
  assert.ok(DAY.filter((g) => g.rankHome || g.rankAway).length >= 10, 'ranked teams carry their rank');
});

test('the clock counts four quarters, halftime after the second, then overtime', () => {
  assert.equal(dayClock('womens-college-basketball', 1, '8:12'), '1st 8:12');
  assert.equal(dayClock('womens-college-basketball', 2, '0:00'), 'Halftime');
  assert.equal(dayClock('womens-college-basketball', 3, '0:00'), 'End 3rd');
  assert.equal(dayClock('womens-college-basketball', 5, '2:10'), 'OT 2:10');
});
