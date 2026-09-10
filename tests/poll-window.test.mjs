/* WHEN A GAME DESERVES A POLLER.
 *
 * 🔴 THE BUG THIS EXISTS FOR: the rule used to be `status === 'in_progress'`,
 * which sounds obviously right and is not. The cron runs every ten minutes,
 * so a game that kicked at 5:00 could have no poller until 5:10 - ten minutes
 * of a live game with no feed, on a product whose premise is being a few
 * seconds behind the television. And /api/poller/ensure applied the same test
 * to the STORED slate, which is itself up to ten minutes stale, so the one
 * action a person takes when the feed looks dead was refused by data that had
 * not caught up.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pollDecision, shouldPoll, PRE_KICK_MS, MAX_GAME_MS } from '../src/lib/poll-window.ts';

const KICK = 1_000_000_000_000;
const g = (status, kickoffUtc = KICK) => ({ status, kickoffUtc });

test('a game in progress polls, whatever the clock says', () => {
  assert.equal(shouldPoll(g('in_progress'), KICK - 5 * 60 * 60 * 1000), true);
  assert.equal(shouldPoll(g('in_progress'), KICK + 60 * 60 * 1000), true);
});

/* 🔴 THE WINDOW OPENS BEFORE KICKOFF, and it must be WIDER THAN THE CRON
 * INTERVAL or the gap narrows instead of closing. At 15 minutes against a
 * 10-minute cron, at least one run must see every game before it kicks. */
test('the window opens before kickoff, wider than the ten-minute cron', () => {
  assert.ok(PRE_KICK_MS > 10 * 60 * 1000,
    'a window no wider than the cron interval can be stepped over entirely');
  assert.equal(shouldPoll(g('scheduled'), KICK - PRE_KICK_MS), true, 'exactly at the edge');
  assert.equal(shouldPoll(g('scheduled'), KICK - PRE_KICK_MS - 1), false, 'a millisecond early');
  assert.equal(shouldPoll(g('scheduled'), KICK - 60 * 1000), true, 'a minute out');
});

/* The whole point: a stale slate still says `scheduled` after kickoff. */
test('a scheduled game that has actually kicked still polls', () => {
  assert.equal(shouldPoll(g('scheduled'), KICK + 9 * 60 * 1000), true);
  assert.equal(pollDecision(g('scheduled'), KICK + 9 * 60 * 1000).why, 'kicking off');
});

test('final is the one status taken as a refusal', () => {
  assert.equal(shouldPoll(g('final', KICK), KICK + 60 * 1000), false);
  assert.equal(pollDecision(g('final'), KICK).why, 'that game is final');
});

/* A stuck record must not poll for a week. */
test('a game long past its kickoff stops polling even if it never went final', () => {
  assert.equal(shouldPoll(g('scheduled'), KICK + MAX_GAME_MS - 1), true);
  assert.equal(shouldPoll(g('scheduled'), KICK + MAX_GAME_MS), false);
  assert.equal(pollDecision(g('scheduled'), KICK + MAX_GAME_MS).why, 'that game is long over');
});

test('every refusal says which one it is, so the API can pass it through', () => {
  assert.equal(pollDecision(null, KICK).why, 'no game by that id on any slate');
  assert.equal(pollDecision(g('scheduled', null), KICK).why, 'no kickoff time on that game');
  assert.equal(pollDecision(g('scheduled'), KICK - 3600e3).why, 'that game has not kicked off yet');
});

/* 🔴 TONIGHT, WITH REAL NUMBERS. SF at LAR kicks 5:35 PM Pacific =
 * 00:35Z. At 12:58 PM Pacific - when this was written - it must NOT poll; by
 * 5:25 it must. Both sides asserted, because a window is two edges. */
test('tonight: SF at LAR, 5:35 PM Pacific', () => {
  const kick = Date.parse('2026-09-11T00:35:00Z');
  const at = (iso) => shouldPoll({ status: 'scheduled', kickoffUtc: kick }, Date.parse(iso));
  assert.equal(at('2026-09-10T19:58:00Z'), false, '12:58 PM Pacific - four hours out');
  assert.equal(at('2026-09-11T00:15:00Z'), false, '5:15 PM - twenty minutes out');
  assert.equal(at('2026-09-11T00:25:00Z'), true, '5:25 PM - inside the window');
  assert.equal(at('2026-09-11T00:40:00Z'), true, 'five minutes in, slate still says scheduled');
});
