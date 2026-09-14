/* THE WORDS AND THE LIVE REFRESH FOR A FIGHT AND A CRICKET MATCH.
 *
 * Found 2026-09-13 after UFC and cricket shipped: My picks told a UFC card that picks
 * lock "at kickoff", and the All games screen's live refresh turned a void (a drawn
 * bout, a washed-out match) back into "not started" and dropped cricket's result line
 * and score text until the page reloaded.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const P4 = readFileSync(new URL('../public/screens/p4-picks.screen.js', import.meta.url), 'utf8');
const P6 = readFileSync(new URL('../public/screens/p6-allgames.screen.js', import.meta.url), 'utf8');

test('My picks says when a bout and a cricket match lock, in their own words', () => {
  assert.ok(P4.includes("data.noun === 'bout'"));
  assert.ok(P4.includes('its part of the card starts - prelims or main card'));
  assert.ok(P4.includes('locks at the first ball'));
});

test('the live refresh keeps a void and carries cricket\'s result line and score text', () => {
  assert.ok(P6.includes("n.status === 'void' ? 'void' : 'scheduled'"));
  assert.ok(P6.includes("if (typeof n.summary === 'string') g.summary = n.summary;"));
  assert.ok(P6.includes('if (n.homeScoreText !== undefined) g.homeScoreText = n.homeScoreText;'));
});
