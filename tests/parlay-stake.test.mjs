/* THE STAKED PARLAY.
 *
 * 🔴 BAR: none exists, and that is declared rather than invented. Five pick'em
 * products were captured for this project and not one ships a parlay; the pool
 * parlay's own header records the same COULD NOT CLOSE. So this is judged as a
 * blind field against its written rule set - CONTRACT §1 - and the rules it is
 * judged against are the ones in the module header, not ones made up here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PARLAY_MAX_PAYOUT, PARLAY_MIN_LEGS, PARLAY_MAX_LEGS,
  parlayPrice, parlayReturns, validateStakeParlay, settleStakeParlay,
} from '../src/lib/parlay-stake.ts';

const leg = (gameId, marketId = 'winner', choiceId = 'home', price = 2) =>
  ({ gameId, marketId, choiceId, price });

/* A finished game the market layer can actually settle. `plays` carry the score
 * AFTER each play, which is what settleMarket reads. */
const finished = (id, home, away) => ({
  id, status: 'final', homeScore: home, awayScore: away,
  homeTeamId: 'H' + id, awayTeamId: 'A' + id,
});
const platesFor = (home, away) => [
  { period: 4, homeScore: home, awayScore: away },
];

/* ------------------------------------------------------------------ price */

test('the product of the legs, rounded once', () => {
  assert.equal(parlayPrice([2, 2], 100), 4);
  assert.equal(parlayPrice([1.85, 2.1], 100), 3.89);   // 3.885 -> 3.89, once
  assert.equal(parlayPrice([1.5, 1.5, 1.5], 100), 3.38);
});

test('an empty set pays nothing, not evens', () => {
  assert.equal(parlayPrice([]), 0);
  assert.equal(parlayPrice(null), 0);
});

test('a bad leg price poisons the whole price rather than being skipped', () => {
  assert.equal(parlayPrice([2, 0]), 0);
  assert.equal(parlayPrice([2, -1]), 0);
  assert.equal(parlayPrice([2, NaN]), 0);
});

/* 🔴 THE FINDING, RECORDED AS A TEST RATHER THAN AS A NOTE.
 *
 * At the doctrinal 6x cap every parlay of three legs or more pays exactly the
 * same, and three is the MINIMUM. So a fourth leg strictly increases the chance
 * of losing for no increase in return - the product is dominated at its own
 * floor. This test passes today and is the argument for the cap being Jason's
 * to move; if he moves it, this test is the one that must be rewritten, on
 * purpose, with him having said so. */
test('at the 6x cap a parlay is flat from its own minimum leg count', () => {
  const evens = (n) => Array(n).fill(2);
  assert.equal(PARLAY_MAX_PAYOUT, 6);
  assert.equal(parlayPrice(evens(2)), 4);          // under the cap
  assert.equal(parlayPrice(evens(3)), 6);          // 8   -> capped
  assert.equal(parlayPrice(evens(4)), 6);          // 16  -> capped
  assert.equal(parlayPrice(evens(5)), 6);          // 32  -> capped
  assert.equal(parlayPrice(evens(6)), 6);          // 64  -> capped
  const three = parlayPrice(evens(PARLAY_MIN_LEGS));
  const six = parlayPrice(evens(PARLAY_MAX_LEGS));
  assert.equal(three, six, 'the minimum and maximum parlay pay the same');
});

test('returns round once, to whole marbles', () => {
  assert.equal(parlayReturns(25, 6), 150);
  assert.equal(parlayReturns(10, 3.89), 39);
  assert.equal(parlayReturns(0, 6), 0);
});

/* --------------------------------------------------------------- validate */

test('three legs is legal, two is not, seven is not', () => {
  assert.equal(validateStakeParlay([leg('1'), leg('2'), leg('3')]).ok, true);
  const few = validateStakeParlay([leg('1'), leg('2')]);
  assert.equal(few.ok, false);
  assert.ok(few.errors.some((e) => e.code === 'too_few_legs'));
  const many = validateStakeParlay(
    ['1', '2', '3', '4', '5', '6', '7'].map((g) => leg(g)));
  assert.ok(many.errors.some((e) => e.code === 'too_many_legs'));
});

/* 🔴 THE CORRELATION RULE. Three markets on one game are not three events. */
test('two legs from the same game is refused even when the markets differ', () => {
  const r = validateStakeParlay([
    leg('G1', 'winner', 'home'),
    leg('G1', 'h1_winner', 'home'),
    leg('G2', 'winner', 'away'),
  ]);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.code === 'same_game_twice' && e.detail === 'G1'));
});

test('a leg with no price is refused - nothing goes on the tile unpriced', () => {
  const r = validateStakeParlay([leg('1'), leg('2'), leg('3', 'winner', 'home', 0)]);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.code === 'no_price'));
});

test('every broken rule is reported, not just the first', () => {
  const r = validateStakeParlay([leg('G1'), leg('G1', 'total', 'over', 0)]);
  const codes = r.errors.map((e) => e.code).sort();
  assert.deepEqual(codes, ['no_price', 'same_game_twice', 'too_few_legs']);
});

/* ---------------------------------------------------------------- settle */

const gamesOf = (...gs) => new Map(gs.map((g) => [g.id, g]));
const playsOf = (...pairs) => new Map(pairs);

test('all legs land: won, and it pays the capped product', () => {
  const g = [finished('1', 24, 10), finished('2', 30, 3), finished('3', 17, 14)];
  const r = settleStakeParlay(
    [leg('1'), leg('2'), leg('3')],
    gamesOf(...g),
    playsOf(['1', platesFor(24, 10)], ['2', platesFor(30, 3)], ['3', platesFor(17, 14)]),
    10);
  assert.equal(r.state, 'won');
  assert.equal(r.price, 6);
  assert.equal(r.returns, 60);
});

test('one leg lost is the whole parlay, and it returns nothing', () => {
  const r = settleStakeParlay(
    [leg('1'), leg('2'), leg('3')],
    gamesOf(finished('1', 24, 10), finished('2', 3, 30), finished('3', 17, 14)),
    playsOf(['1', platesFor(24, 10)], ['2', platesFor(3, 30)], ['3', platesFor(17, 14)]),
    10);
  assert.equal(r.state, 'lost');
  assert.equal(r.returns, 0);
});

/* 🔴 A void REDUCES rather than kills, and the price comes down with it. */
test('a game that left the slate voids its leg and reprices the rest', () => {
  const r = settleStakeParlay(
    [leg('1'), leg('2'), leg('3'), leg('gone')],
    gamesOf(finished('1', 24, 10), finished('2', 30, 3), finished('3', 17, 14)),
    playsOf(['1', platesFor(24, 10)], ['2', platesFor(30, 3)], ['3', platesFor(17, 14)]),
    10);
  assert.equal(r.state, 'won');
  assert.deepEqual(r.voidedLegs, ['gone']);
  assert.equal(r.reduced, true);
  assert.match(r.note, /Reduced to 3 legs/);
});

test('below the minimum surviving legs the whole parlay voids and the stake comes back', () => {
  const r = settleStakeParlay(
    [leg('1'), leg('gone1'), leg('gone2')],
    gamesOf(finished('1', 24, 10)),
    playsOf(['1', platesFor(24, 10)]),
    25);
  assert.equal(r.state, 'void');
  assert.equal(r.returns, 25, 'a void is not a loss');
  assert.equal(r.price, 0);
  assert.match(r.note, /stake is back/);
});

/* 🔴 ORDER MATTERS: a loss outranks a void, or a cancelled game would refund a
 * stake that was already gone. */
test('a lost leg beats a void down to below the minimum', () => {
  const r = settleStakeParlay(
    [leg('1'), leg('gone1'), leg('gone2')],
    gamesOf(finished('1', 3, 30)),
    playsOf(['1', platesFor(3, 30)]),
    25);
  assert.equal(r.state, 'lost');
  assert.equal(r.returns, 0);
  assert.match(r.note, /but a leg lost/);
});

test('an unfinished leg holds the parlay live rather than settling it', () => {
  const r = settleStakeParlay(
    [leg('1'), leg('2'), leg('3')],
    gamesOf(finished('1', 24, 10), finished('2', 30, 3),
      { id: '3', status: 'in_progress', homeScore: 7, awayScore: 0 }),
    playsOf(['1', platesFor(24, 10)], ['2', platesFor(30, 3)], ['3', []]),
    10);
  assert.equal(r.state, 'live');
});

/* 🔴 A PUSH IS A VOID - same path, no special case. A market needing a line
 * that was never posted reports 'no posted line' and takes the same exit. */
test('a leg whose line was never posted leaves by the void path', () => {
  const r = settleStakeParlay(
    [leg('1'), leg('2'), leg('3'), leg('4', 'spread', 'home')],
    gamesOf(finished('1', 24, 10), finished('2', 30, 3), finished('3', 17, 14),
      finished('4', 20, 10)),   // no `spread` field on it
    playsOf(['1', platesFor(24, 10)], ['2', platesFor(30, 3)],
      ['3', platesFor(17, 14)], ['4', platesFor(20, 10)]),
    10);
  assert.deepEqual(r.voidedLegs, ['4']);
  assert.equal(r.state, 'won');
});

/* 🔴 A LEG NAMING A MARKET THIS BUILD NO LONGER HAS. Legs live in
 * localStorage and outlive deploys. If this fell into the pending branch the
 * parlay would sit live forever with a stake locked behind it. */
test('a leg naming a market that no longer exists voids rather than hanging', () => {
  const r = settleStakeParlay(
    [leg('1'), leg('2'), leg('3'), leg('4', 'market_we_deleted', 'home')],
    gamesOf(finished('1', 24, 10), finished('2', 30, 3), finished('3', 17, 14),
      finished('4', 20, 10)),
    playsOf(['1', platesFor(24, 10)], ['2', platesFor(30, 3)],
      ['3', platesFor(17, 14)], ['4', platesFor(20, 10)]),
    10);
  assert.deepEqual(r.voidedLegs, ['4']);
  assert.equal(r.state, 'won', 'not live - it must be able to settle');
});
