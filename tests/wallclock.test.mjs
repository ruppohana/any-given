/* A PLAY CANNOT HAVE HAPPENED IN THE FUTURE.
 *
 * Found live on SF at LAR, 2026-09-10: ESPN's NFL core feed stamped every
 * play's wallclock a DAY ahead ("2026-09-12T00:40:00Z" against a `modified`
 * of "2026-09-11T00:40Z"), so the delay held every play as not-yet-happened
 * and the live screen showed nothing but the scorebug. These pin the
 * correction to exactly the impossible case and nothing else.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeWallclock } from '../src/live.ts';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-09-11T00:42:08Z');

test('the real SF at LAR stamp - a day ahead - comes back to the right day', () => {
  const espn = Date.parse('2026-09-12T00:40:00Z');
  assert.equal(sanitizeWallclock(espn, NOW), Date.parse('2026-09-11T00:40:00Z'));
});

test('the time of day survives to the second - only the date moves', () => {
  const espn = Date.parse('2026-09-12T00:41:15Z');
  assert.equal(new Date(sanitizeWallclock(espn, NOW)).toISOString(), '2026-09-11T00:41:15.000Z');
});

test('two days ahead snaps back two days', () => {
  assert.equal(sanitizeWallclock(NOW - 30000 + 2 * DAY, NOW), NOW - 30000);
});

test('a correct wallclock is untouched', () => {
  const ok = Date.parse('2026-09-11T00:40:07Z');   // the FAMU stamp from the same minute
  assert.equal(sanitizeWallclock(ok, NOW), ok);
});

test('a wallclock in the past is never touched - finished games and replays carry old stamps', () => {
  const old = Date.parse('2026-09-05T20:00:00Z');
  assert.equal(sanitizeWallclock(old, NOW), old);
});

test('a few minutes of clock skew is tolerated, not "corrected"', () => {
  assert.equal(sanitizeWallclock(NOW + 4 * 60 * 1000, NOW), NOW + 4 * 60 * 1000);
});

test('absent stays absent', () => {
  assert.equal(sanitizeWallclock(null, NOW), null);
  assert.equal(sanitizeWallclock(NaN, NOW), NaN);
});
