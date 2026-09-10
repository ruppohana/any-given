/* THE PRICE MODEL.
 *
 * 🔴 BAR: none, and Jason's own question is why it is stated rather than
 * invented. "How does everyone else do it?" - researched, and nobody does
 * this. The pick'em products do not price at all (CBS shows spreads and never
 * a number; Office Pool has no combined payoff). Sportsbooks price live and
 * cap in dollars, not multiples. Armchair Quarterback, the only app on disk
 * with a live call layer, pays a fixed ladder by number of options - 50 points
 * for the two-way call, 220 for the six-way - and reveals it AFTER the tap.
 *
 * So this is judged as a blind field against properties, not against a comp.
 * The properties are the ones a person would notice being wrong.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/lib/price-model.ts';
import { GAME_MARKETS } from '../src/markets.ts';

const CFB = 'college-football';
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

/* ------------------------------------------------------ the core property */

/* 🔴 THE DEFECT IN JASON'S SCREENSHOT, AS A TEST. Miami -59.5, first half
 * winner, three tiles reading 2.00x / 2.00x / 2.00x - which between them claim
 * a 150% probability. Whatever else changes, a market's choices are exhaustive
 * and mutually exclusive, so they sum to one. */
test('every market on every spread sums to exactly one', () => {
  for (const spread of [-59.5, -28, -14.5, -7, -3, 0, 3, 14.5, 45]) {
    for (const share of [1, 0.21, 0.29, 0.5]) {
      const w = M.winnerProbs(spread, share, CFB);
      assert.ok(Math.abs(sum(w) - 1) < 1e-9, `winner ${spread}/${share}`);
    }
    assert.ok(Math.abs(sum(M.marginProbs(spread, CFB)) - 1) < 1e-9, `margin ${spread}`);
    assert.ok(Math.abs(sum(M.firstToScoreProbs(spread, CFB)) - 1) < 1e-9, `fts ${spread}`);
  }
});

test('no probability is ever negative or above one', () => {
  for (const spread of [-70, -20, 0, 20, 70]) {
    for (const p of Object.values(M.winnerProbs(spread, 0.21, CFB))) {
      assert.ok(p >= 0 && p <= 1, `${spread}: ${p}`);
    }
  }
});

/* ------------------------------------------------------------- direction */

/* The whole point of the model: a shorter slice of the game is closer to a
 * coin flip, because the mean scales with time and the deviation with its
 * square root. Nobody decided this - it falls out. */
test('a favourite is less certain over a quarter than over the game', () => {
  const game = M.winnerProbs(-14, 1, CFB).home;
  const half = M.winnerProbs(-14, M.shareOf('half', 2), CFB).home;
  const q1 = M.winnerProbs(-14, M.shareOf('quarter', 1), CFB).home;
  assert.ok(game > half, 'game must be more certain than a half');
  assert.ok(half > q1, 'a half must be more certain than a quarter');
});

test('a bigger spread makes the favourite likelier, monotonically', () => {
  let last = 0;
  for (const s of [0, -3, -7, -14, -28, -45]) {
    const p = M.winnerProbs(s, 0.5, CFB).home;
    assert.ok(p > last, `${s} must beat the previous spread`);
    last = p;
  }
});

/* 🔴 1e-9, NOT 1e-12, AND THE REASON IS THE CDF RATHER THAN THE MODEL.
 * normCdf is Abramowitz & Stegun 26.2.17, accurate to about 7.5e-8, so a
 * perfectly symmetric input comes back a few parts in a billion apart. That
 * is thirteen thousand times finer than the last digit of a price rounded to
 * 2dp, so the tolerance is set where the approximation actually lives instead
 * of where an exact function would. Tightening it back to 1e-12 tests the
 * error term of a polynomial, not the symmetry of the model. */
test('an even game is symmetric, to far below the last printed digit', () => {
  const w = M.winnerProbs(0, 0.5, CFB);
  assert.ok(Math.abs(w.home - w.away) < 1e-9, `${w.home} vs ${w.away}`);
  assert.equal(M.priceFromP(w.home), M.priceFromP(w.away), 'and identical once priced');
});

/* 🔴 THE QUARTERS ARE NOT EQUAL AND THAT IS DELIBERATE. Second and fourth
 * carry more scoring than first and third - the two-minute drill happens twice
 * a game, both times at the end of a half. Using 0.25 each would price Q1 and
 * Q2 identically, which is wrong in a way anybody who watches football spots. */
test('the quarters carry different shares, and they sum to the game', () => {
  const q = [1, 2, 3, 4].map((n) => M.shareOf('quarter', n));
  assert.ok(Math.abs(q.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.ok(q[1] > q[0], 'Q2 scores more than Q1');
  assert.ok(q[3] > q[2], 'Q4 scores more than Q3');
  assert.equal(M.shareOf('half', 2), q[0] + q[1]);
  assert.equal(M.shareOf('half', 4), q[2] + q[3]);
  assert.equal(M.shareOf('game'), 1);
});

/* TIE_WIDTH is calibrated, not chosen: an even first half ties about 9% of
 * the time in real football. If somebody retunes the constant this is the
 * thing that must stay true. */
test('an even first half ties at about the real-world rate', () => {
  const tie = M.winnerProbs(0, M.shareOf('half', 2), 'nfl').tie;
  assert.ok(tie > 0.07 && tie < 0.13, `half-time tie priced at ${tie}`);
});

/* ------------------------------------------------------------ the ceiling */

/* 🔴 6x IS A TWO-WAY NUMBER. Jason settled 20x for three-way markets on
 * 2026-09-10 after asking how everyone else does it - Armchair pays a six-way
 * 4.4x what it pays a two-way, and a book prices a full-game tie near 41x. */
test('a three-way market gets 20x and a two-way keeps 6x', () => {
  assert.equal(M.capFor({ choices: [{ id: 'a' }, { id: 'b' }] }), 6);
  assert.equal(M.capFor({ choices: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }), 20);
  assert.equal(M.capFor({ choices: [{}, {}, {}, {}] }), 20, 'four outcomes is not two');
});

test('the band is always twice the cap, whatever the cap is', () => {
  assert.equal(M.trueCeiling(6), 12);
  assert.equal(M.trueCeiling(20), 40);
});

test('a price below the floor is not offered rather than shown at 1.01x', () => {
  assert.equal(M.priceFromP(0.995), null);
  assert.equal(M.priceFromP(0.99), null);
  assert.ok(M.priceFromP(0.5) === 2);
});

/* ------------------------------------------------- what gets drawn at all */

const marketsOn = (game, sport) => GAME_MARKETS
  .filter((m) => m.id !== 'winner' && !m.needsLine)
  .filter((m) => M.priceMarket(game, m, sport).offerable)
  .map((m) => m.id);

/* 🔴 A MISMATCH DRAWS FEWER MARKETS, AND THAT IS THE HONEST ANSWER. Miami
 * -59.5 has no first-half proposition worth taking; the old board offered one
 * anyway at 2.00x a side. */
test('a 59-point mismatch offers no derived market at all', () => {
  assert.deepEqual(marketsOn({ spread: -59.5, total: 62.5 }, CFB), []);
});

test('a normal game offers its halves, its quarters and the margin', () => {
  const ids = marketsOn({ spread: -3, total: 44.5 }, 'nfl');
  for (const want of ['h1_winner', 'h2_winner', 'q1_winner', 'q4_winner', 'margin']) {
    assert.ok(ids.includes(want), `${want} should be offered on a -3 game`);
  }
});

/* 🔴 `neither` ON FIRST-TO-SCORE IS A 0-0 FINAL - about 1 game in 2000. The
 * cap does not refuse that bet, it quietly pays it at the ceiling, which is a
 * tile selling something for a fraction of its worth while looking like the
 * best number on the screen. The band refuses it instead, and it stays refused
 * at 20x exactly as it was at 6x. */
test('first to score is never offered while `neither` is a choice', () => {
  for (const s of [-45, -14, -3, 0, 3, 14]) {
    assert.ok(!marketsOn({ spread: s, total: 45 }, CFB).includes('first_to_score'),
      `offered at spread ${s}`);
  }
});

test('with no spread there is no model, and 2.00x says so honestly', () => {
  const r = M.priceMarket({ total: 44.5 }, GAME_MARKETS.find((m) => m.id === 'q1_winner'), 'nfl');
  assert.equal(r.offerable, true);
  assert.deepEqual(Object.values(r.prices), [2, 2, 2]);
});

/* A posted line is the market's own estimate of the even point. Jason:
 * "Against the spread I get even odds." Yes, and it must stay that way. */
test('a market with a posted line is 2.00x both ways, untouched', () => {
  for (const id of ['spread', 'total', 'h1_total', 'h2_total', 'team_total_home']) {
    const r = M.priceMarket({ spread: -14, total: 52.5 }, GAME_MARKETS.find((m) => m.id === id), CFB);
    assert.equal(r.offerable, true, id);
    for (const v of Object.values(r.prices)) assert.equal(v, 2, id);
  }
});

test('the whole-game winner is left to the moneyline, not modelled here', () => {
  const r = M.priceMarket({ spread: -7, total: 44 }, GAME_MARKETS.find((m) => m.id === 'winner'), 'nfl');
  assert.equal(r.offerable, false, 'p6-allgames owns this one');
});

/* --------------------------------------------------------- the close rule */

const openOn = (game) => GAME_MARKETS.filter((m) => M.marketIsOpen(game, m, 1000)).map((m) => m.id);

/* 🔴 JASON'S QUESTION, AS A TEST. "So I can only bet on who wins the second
 * half until kick?" Not any more. */
test('the second half stays open through the whole first half', () => {
  assert.ok(openOn({ status: 'in_progress', period: 1 }).includes('h2_winner'));
  assert.ok(openOn({ status: 'in_progress', period: 2 }).includes('h2_winner'));
  assert.ok(!openOn({ status: 'in_progress', period: 3 }).includes('h2_winner'),
    'shut once the second half starts');
});

test('each quarter closes when its own quarter starts, and not before', () => {
  for (const q of [1, 2, 3, 4]) {
    const open = openOn({ status: 'in_progress', period: q });
    for (const n of [1, 2, 3, 4]) {
      assert.equal(open.includes(`q${n}_winner`), n > q,
        `in Q${q}, Q${n} should be ${n > q ? 'open' : 'shut'}`);
    }
  }
});

test('everything is open before kickoff and nothing after full time', () => {
  assert.equal(openOn({ status: 'scheduled', kickoffUtc: 2000 }).length, GAME_MARKETS.length);
  assert.deepEqual(openOn({ status: 'scheduled', kickoffUtc: 500 }), [], 'past kickoff');
  assert.deepEqual(openOn({ status: 'final', period: 4 }), []);
});

/* 🔴 A FINISHED GAME STILL REPORTS period: 4, so the final guard has to come
 * before the period check or a Q4 market reads as open on a game that ended an
 * hour ago. Absent beats guessed, from the other end. */
test('an in-progress game with no period known closes everything', () => {
  assert.deepEqual(openOn({ status: 'in_progress', period: null }), []);
});
