/* A queued edit, and the one thing that decides it.
 *
 * Jason, 2026-09-08: "que and pending." Two screens had made different offline
 * promises and one of them was lying to the same user about the same pick. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rulePendingEdit, hasPendingEdit, pickDisplaySides } from '../src/lib/pool.ts';

const FIX = 'fixtures/real-utep-at-ou-260905-final.json';
const doc = JSON.parse(readFileSync(new URL('../' + FIX, import.meta.url), 'utf8'));
const comp = ((doc.header || {}).competitions || [])[0] || {};
const KICKOFF = Date.parse(comp.date);

const game = {
  id: comp.id, week: 1, kickoffUtc: KICKOFF,
  home: { id: 'h' }, away: { id: 'a' },
  spread: null, status: 'scheduled', homeScore: null, awayScore: null
};
const games = new Map([[game.id, game]]);
const MIN = 60_000;

test('the kickoff is real, read off a captured game', () => {
  assert.ok(Number.isFinite(KICKOFF), `no kickoff in ${FIX}`);
  console.log(`    kickoff ${new Date(KICKOFF).toISOString()} from ${FIX}`);
});

test('an edit that ARRIVES before kickoff is accepted', () => {
  const edit = { gameId: game.id, side: 'home', madeAt: KICKOFF - 2 * MIN };
  assert.equal(rulePendingEdit(edit, games, KICKOFF - 1 * MIN), 'accepted');
});

test('🔴 an edit MADE before kickoff and ARRIVING after it is REJECTED', () => {
  /* The case that separated the two screens: edit at 12:58 with no signal,
   * kickoff at 13:00, reconnect at 13:05. The slate promised it was saved. It
   * was not, and it cannot be - the pick locked while the phone was dark. */
  const edit = { gameId: game.id, side: 'home', madeAt: KICKOFF - 2 * MIN };
  assert.equal(rulePendingEdit(edit, games, KICKOFF + 5 * MIN), 'rejected_kicked_off');
});

test('🔴 the phone clock is evidence, never authority', () => {
  /* madeAt says an hour BEFORE kickoff; the edit arrives an hour AFTER. A rule
   * that trusted madeAt would accept it, and would hand every user a way to pick
   * after the game starts by setting their clock back. */
  const liar = { gameId: game.id, side: 'away', madeAt: KICKOFF - 60 * MIN };
  assert.equal(rulePendingEdit(liar, games, KICKOFF + 60 * MIN), 'rejected_kicked_off');
});

test('a game that is no longer on the slate rejects rather than throws', () => {
  const edit = { gameId: 'not-a-game', side: 'home', madeAt: KICKOFF - MIN };
  assert.equal(rulePendingEdit(edit, games, KICKOFF - MIN), 'rejected_no_game');
});

test('a pending edit is NEVER drawn as the pick', () => {
  const pick = { side: 'home', pending: { gameId: game.id, side: 'away', madeAt: 1 } };
  const d = pickDisplaySides(pick);
  assert.equal(d.confirmed, 'home', 'the confirmed side is still the pick');
  assert.equal(d.pending, 'away', 'and the queued one is shown as queued');
  assert.ok(hasPendingEdit(pick));
  assert.equal(hasPendingEdit({ side: 'home' }), false);
  assert.equal(hasPendingEdit(null), false);
});
