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
  parlayLocksAt, parlayIsComposable, legIsAddable,
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

/* 🔴 THE LADDER PAYS FOR ITS OWN RISK AT EVERY STEP, which is the whole
 * reason the parlay got a ceiling of its own.
 *
 * This test used to assert the opposite and PASS: at the doctrinal 6x cap
 * every parlay from three legs upward paid identically, and three is the
 * minimum - so a fourth leg bought nothing but a higher chance of losing.
 * Jason moved the cap to 50 on that evidence, 2026-09-10. The assertion is
 * inverted here on purpose and with him having said so; it is not a test that
 * drifted to match the code. */
test('every added leg increases the return, up to the cap', () => {
  const evens = (n) => Array(n).fill(2);
  assert.equal(PARLAY_MAX_PAYOUT, 250);
  assert.equal(parlayPrice(evens(2)), 4);
  assert.equal(parlayPrice(evens(3)), 8);
  assert.equal(parlayPrice(evens(4)), 16);
  assert.equal(parlayPrice(evens(5)), 32);
  assert.equal(parlayPrice(evens(6)), 64);        // uncapped: see below
  for (let n = PARLAY_MIN_LEGS; n < PARLAY_MAX_LEGS; n++) {
    assert.ok(parlayPrice(evens(n + 1)) > parlayPrice(evens(n)),
      n + ' legs must pay less than ' + (n + 1));
  }
});

/* 🔴 THE PROPERTY JASON ASKED FOR, AS A TEST. "a 6 parlay should win big."
 *
 * A cap must not bite a PLAUSIBLE parlay. Six coin flips is the most ordinary
 * six-leg bet there is and it is the headline of the whole feature, so if the
 * ceiling ever trims it again this fails. That is the guard - not the value
 * 250, which is free to move as long as it stays past the end of the ladder
 * rather than on top of it. */
test('the cap never touches an ordinary six-leg parlay', () => {
  const evens = (n) => Array(n).fill(2);
  assert.equal(parlayPrice(evens(PARLAY_MAX_LEGS)), 2 ** PARLAY_MAX_LEGS,
    'six coin flips must pay their true price, uncapped');
  assert.ok(PARLAY_MAX_PAYOUT > 2 ** PARLAY_MAX_LEGS,
    'the ceiling must sit past the end of the all-evens ladder');
});

/* And it still ends the long-shot tail, which is the only thing it is for.
 * Each leg is capped at 6x by the single-call rule, so six maximum-price legs
 * would otherwise multiply to 46,656x - one bet that ends the board. */
test('the cap still ends the tail a chain of long shots would run to', () => {
  assert.equal(parlayPrice(Array(6).fill(6)), PARLAY_MAX_PAYOUT);
  assert.equal(parlayPrice(Array(6).fill(2.6)), PARLAY_MAX_PAYOUT);
});

/* The single-call cap is untouched, and that is the point of a separate one. */
test('the parlay ceiling is its own - 6x still caps a single call', () => {
  assert.equal(parlayPrice([100], 6), 6);
  assert.notEqual(PARLAY_MAX_PAYOUT, 6);
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

test('all legs land: won, and it pays the product of the legs', () => {
  const g = [finished('1', 24, 10), finished('2', 30, 3), finished('3', 17, 14)];
  const r = settleStakeParlay(
    [leg('1'), leg('2'), leg('3')],
    gamesOf(...g),
    playsOf(['1', platesFor(24, 10)], ['2', platesFor(30, 3)], ['3', platesFor(17, 14)]),
    10);
  assert.equal(r.state, 'won');
  assert.equal(r.price, 8, 'three legs of 2.00x, uncapped at the 50x ceiling');
  assert.equal(r.returns, 80);
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

/* ------------------------------------------------- the line, and the gate */

/* 🔴 THE BUG JASON'S QUESTION FOUND. "Does the spread change during the game
 * or all gate at kick?" It changes - slate-cron re-reads odds for every event
 * every ten minutes, finals included - so a leg must settle against the line
 * it was TAKEN at, never the one currently on the game. */
test('a spread leg settles against the line it was taken at, not the live one', () => {
  const legAt3 = {
    gameId: '1', marketId: 'spread', choiceId: 'home', price: 2,
    lines: { spread: -3 },
  };
  /* Home won by 5. Against the taken line of -3 that COVERS. The game object
   * now carries -7, moved after the bet, against which it would not. */
  const game = { ...finished('1', 25, 20), spread: -7 };
  const r = settleStakeParlay(
    [legAt3, { ...leg('2'), lines: null }, { ...leg('3'), lines: null }],
    gamesOf(game, finished('2', 30, 3), finished('3', 17, 14)),
    playsOf(['1', platesFor(25, 20)], ['2', platesFor(30, 3)], ['3', platesFor(17, 14)]),
    10);
  assert.equal(r.legs[0].result, 'won', 'settled at -3, the line on the tile');
  assert.equal(r.state, 'won');
});

test('the live line cannot rescue a leg either - it moves both ways', () => {
  const legAt7 = {
    gameId: '1', marketId: 'spread', choiceId: 'home', price: 2,
    lines: { spread: -7 },
  };
  const game = { ...finished('1', 25, 20), spread: -3 };  // moved in our favour
  const r = settleStakeParlay([legAt7], gamesOf(game),
    playsOf(['1', platesFor(25, 20)]), 10);
  assert.equal(r.legs[0].result, 'lost', 'won by 5, needed 7');
});

/* A leg written by a build that did not record its line. We do not know what
 * it was taken at, so it did not happen - never a silent fall back to live. */
test('a spread leg with no stored line voids rather than using the current one', () => {
  const r = settleStakeParlay(
    [{ gameId: '1', marketId: 'spread', choiceId: 'home', price: 2 },
      leg('2'), leg('3'), leg('4')],
    gamesOf({ ...finished('1', 25, 20), spread: -3 }, finished('2', 30, 3),
      finished('3', 17, 14), finished('4', 21, 7)),
    playsOf(['1', platesFor(25, 20)], ['2', platesFor(30, 3)],
      ['3', platesFor(17, 14)], ['4', platesFor(21, 7)]),
    10);
  assert.deepEqual(r.voidedLegs, ['1']);
  assert.equal(r.state, 'won');
});

/* 🔴 THE GATE. Legs resolve independently; the COMPOSITION locks at the first
 * kickoff, or you could build the rest of a parlay around a result you have. */
test('the parlay locks at the first leg to kick, not at each leg', () => {
  const games = gamesOf(
    { id: '1', kickoffUtc: 1000, status: 'scheduled' },
    { id: '2', kickoffUtc: 5000, status: 'scheduled' },
    { id: '3', kickoffUtc: 9000, status: 'scheduled' });
  const legs = [leg('1'), leg('2'), leg('3')];
  assert.equal(parlayLocksAt(legs, games), 1000);
  assert.equal(parlayIsComposable(legs, games, 999), true);
  assert.equal(parlayIsComposable(legs, games, 1000), false, 'shut at the first kick');
  assert.equal(parlayIsComposable(legs, games, 6000), false,
    'still shut while legs 2 and 3 are yet to play');
});

test('an empty parlay has no lock time and stays composable', () => {
  assert.equal(parlayLocksAt([], new Map()), null);
  assert.equal(parlayIsComposable([], new Map(), Date.now()), true);
});

test('a game that has kicked, is running or is final cannot be joined', () => {
  assert.equal(legIsAddable({ kickoffUtc: 100, status: 'scheduled' }, 99), true);
  assert.equal(legIsAddable({ kickoffUtc: 100, status: 'scheduled' }, 100), false);
  assert.equal(legIsAddable({ kickoffUtc: 1e12, status: 'in_progress' }, 0), false);
  assert.equal(legIsAddable({ kickoffUtc: 1e12, status: 'final' }, 0), false);
  assert.equal(legIsAddable(null, 0), false);
});
