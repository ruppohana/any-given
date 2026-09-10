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

/* ------------------------------------------------- the score moves the price */

const h2 = GAME_MARKETS.find((m) => m.id === 'h2_winner');
const atHalf = (hs, as) => ({
  spread: -3, total: 44.5, status: 'in_progress', period: 2, homeScore: hs, awayScore: as,
});
const h2Price = (g) => M.priceMarket(g, h2, 'nfl').prices;

/* 🔴 JASON: "Then the odds should change, right." They do now, and the reason
 * is behaviour rather than ability. The spread does not move when a game goes
 * 21-0 - the teams are as good as they were - but the LEADER STOPS TRYING TO
 * WIN and starts trying to end it. */
test('a lead pulls the next period back toward level', () => {
  const flat = h2Price({ spread: -3, total: 44.5, status: 'scheduled', kickoffUtc: 9e12 });
  const up21 = h2Price(atHalf(28, 7));
  assert.ok(up21.home > flat.home, 'leading big makes you a longer price to win the second half');
  assert.ok(up21.away < flat.away, 'and the trailing side shortens');
});

test('a big enough lead makes the leader an underdog for the next period', () => {
  const p = h2Price(atHalf(42, 7));
  assert.ok(p.home > p.away,
    `up 35 the home side should be the longer price: home ${p.home} away ${p.away}`);
});

test('it works in both directions, symmetrically', () => {
  const up = h2Price(atHalf(28, 7));
  const down = h2Price(atHalf(7, 28));
  assert.ok(down.home < up.home && down.away > up.away);
});

/* The pregame model must be untouched by a field that does not exist yet. */
test('a scheduled game prices exactly as it did before any of this', () => {
  const sched = M.winnerProbs(-3, 0.5, 'nfl', 0);
  const noLead = M.winnerProbs(-3, 0.5, 'nfl');
  assert.deepEqual(sched, noLead);
  const g = { spread: -3, total: 44.5, status: 'scheduled', kickoffUtc: 9e12 };
  assert.deepEqual(h2Price(g), h2Price({ ...g, homeScore: 28, awayScore: 7 }),
    'a score on a scheduled game is not a lead');
});

test('a final game is not repriced - there is nothing left to price', () => {
  const g = { spread: -3, total: 44.5, status: 'final', period: 4, homeScore: 42, awayScore: 7 };
  assert.equal(M.marketIsOpen(g, h2, Date.now()), false);
});

/* 🔴 THE TOTALS DO NOT MOVE, AND THAT IS DELIBERATE. Their line is what
 * settlement reads, so repricing one live would settle a bet against a number
 * that was never on the tile - the same defect the parlay's stored `lines`
 * exists to prevent. Singles do not store a line yet, so this stays fixed
 * until they do. */
test('a totals market is not moved by the score', () => {
  const t = GAME_MARKETS.find((m) => m.id === 'h2_total');
  const flat = M.priceMarket({ spread: -3, total: 44.5, status: 'scheduled' }, t, 'nfl');
  const live = M.priceMarket(atHalf(42, 7), t, 'nfl');
  assert.deepEqual(flat.prices, live.prices);
});

/* ------------------------------------------- quarter scores as a play list */

/* 🔴 THE REAL GAME, NOT AN INVENTED ONE. Villanova at Miami, event
 * 401752835, verified against ESPN's own linescores endpoint before this was
 * written: MIA 52 by quarters 7/14/10/21, VILL 6 by 0/0/0/6. Rule zero — a
 * fixture is only evidence if it came from the feed. */
const REAL = {
  id: '401752835', status: 'final', homeScore: 52, awayScore: 6,
  spread: -59.5, total: 62.5,
  periodsHome: [7, 14, 10, 21], periodsAway: [0, 0, 0, 6],
};

test('quarter scores become a cumulative play list', () => {
  assert.deepEqual(M.playsFromPeriods(REAL), [
    { quarter: 1, homeScore: 7, awayScore: 0 },
    { quarter: 2, homeScore: 21, awayScore: 0 },
    { quarter: 3, homeScore: 31, awayScore: 0 },
    { quarter: 4, homeScore: 52, awayScore: 6 },
  ]);
});

/* 🔴 `quarter`, NOT `period`. scoreAfterPeriod reads p.quarter — getting the
 * field name wrong produces an empty list and a market that says "not final
 * yet" forever, on a game that finished hours ago. */
test('the field is named the one scoreAfterPeriod actually reads', () => {
  const [first] = M.playsFromPeriods(REAL);
  assert.ok('quarter' in first, 'scoreAfterPeriod reads `quarter`');
});

test('a game that has not started yields no plays rather than 0-0', () => {
  assert.deepEqual(M.playsFromPeriods({ status: 'scheduled' }), []);
  assert.deepEqual(M.playsFromPeriods({ periodsHome: [], periodsAway: [] }), []);
  assert.deepEqual(M.playsFromPeriods(null), []);
});

test('overtime periods are kept, not truncated at four', () => {
  const ot = M.playsFromPeriods({ periodsHome: [7, 7, 7, 7, 6], periodsAway: [7, 7, 7, 7, 0] });
  assert.equal(ot.length, 5);
  assert.deepEqual(ot[4], { quarter: 5, homeScore: 34, awayScore: 28 });
});

/* The whole point: every period market settles off the slate, with no play
   list anywhere, through the SAME settleMarket the live screen uses. */
test('every period market on the real game settles from the slate alone', async () => {
  const { settleMarket } = await import('../src/markets.ts');
  const plays = M.playsFromPeriods(REAL);
  const check = (id, choice, want) =>
    assert.equal(settleMarket(id, choice, REAL, plays).landed, want, id + '/' + choice);
  check('h1_winner', 'home', true);      // 21-0 at the half
  check('h1_winner', 'away', false);
  check('h2_winner', 'home', true);      // 31-6 after the half
  check('h2_winner', 'away', false);
  check('q1_winner', 'home', true);      // 7-0
  check('q4_winner', 'home', true);      // 21-6
  check('margin', '14+', true);          // won by 46
  check('winner', 'home', true);
  /* 62.5 halved is 31.25, rounded to 31.5. First half was 21, second was 37. */
  check('h1_total', 'over', false);
  check('h2_total', 'over', true);
});

/* ------------------------------------------------ the slate mapper's shape */

/* 🔴 THE GUARD FOR A BUG THAT HAPPENED THREE TIMES IN ONE DAY.
 *
 * p6-allgames' fetchSlate used to rebuild each game key by key, so every
 * field the capture started writing was invisible to the screen until
 * somebody added a line to the mapper - `period` (every in-play market read
 * as shut), `rankHome` (no Top 25 chip), `conferences` (one "All" chip). None
 * of them errored; the feature just quietly did nothing.
 *
 * It spreads the raw game now. This asserts the PROPERTY - an unknown field
 * survives - rather than listing today's fields, because a list would have to
 * be updated by exactly the person who forgets to update the mapper. */
test('the slate mapper passes through a field it has never heard of', async () => {
  const src = await import('node:fs').then((fs) =>
    fs.readFileSync('public/screens/p6-allgames.screen.js', 'utf8'));
  const body = src.slice(src.indexOf('export async function fetchSlate'));
  const ret = body.slice(body.indexOf('return {'), body.indexOf('}).filter('));
  assert.ok(/\.\.\.g,/.test(ret),
    'fetchSlate must spread the raw game, not allow-list its keys');
});
