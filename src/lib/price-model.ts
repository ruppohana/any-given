/* 🔴 WHAT A DERIVED MARKET IS ACTUALLY WORTH.
 *
 * Jason sent one screenshot and it is the whole argument for this file:
 * Miami -59.5 against Florida A&M, FIRST HALF WINNER, and all three tiles say
 * 2.00x - Miami, Florida A&M, and Tie.
 *
 * 🔴 THOSE THREE PRICES IMPLY A 150% PROBABILITY. It is not that the board was
 * flat, which would merely be dull. It is that the board was INCOHERENT: a
 * three-way market whose choices each pay 2.00x is stating that the three
 * outcomes are each 50% likely, and one of them is Florida A&M leading Miami
 * at half time. Measured across this week's real slate, 91% of every tile in
 * the app was exactly 2.00x for the same reason.
 *
 * WHERE 2.00x WAS RIGHT, AND IT STAYS. p6-allgames prices anything with a
 * posted line at 2.00x on the argument that a line IS the market's own
 * estimate of the point where both sides are equally likely. That argument is
 * correct and this file does not touch it:
 *
 *     spread, total, team totals   ->  still 2.00x, still for that reason
 *     whole-game winner            ->  still the moneyline, converted
 *
 * What it was wrong about is every market with NO posted line of its own - the
 * halves, the four quarters, first to score, the winning margin. Those were
 * defaulting to 2.00x not because anything estimated them at even money but
 * because nothing estimated them at all.
 *
 * 🔴 THE MODEL IS THE POSTED LINE, PUSHED THROUGH TIME. It invents no opinion
 * about the teams - every number here comes out of the two figures the book
 * already published, the spread and the total, which is what doctrine means by
 * "priced by the model" rather than by us:
 *
 *   1. Final margin is Normal(mean = -spread, sd). The spread IS the mean; a
 *      book publishing -7 is saying it expects the home side to win by 7.
 *   2. A fraction f of the game carries a fraction f of the mean and, because
 *      variance adds over independent time, sqrt(f) of the deviation. That
 *      single line is what makes a first quarter closer to a coin flip than
 *      the game is, without anybody deciding that it should be.
 *   3. A tie needs a width, because football scores are lumpy rather than
 *      continuous. See TIE_WIDTH.
 *
 * 🔴 AND THE PRICES IN A MARKET ARE NORMALISED TO SUM TO 1 BEFORE ANY CAP.
 * That is the specific defect in the screenshot and it cannot come back: the
 * choices of one market are exhaustive and mutually exclusive, so their
 * probabilities sum to one by definition, and any set that does not is a bug
 * whatever the individual numbers look like.
 */

/* Sigma of the FINAL MARGIN, in points. Both are the standard figures for
 * their sport rather than anything fitted here - college is wider because
 * college has far more mismatches in it, which is the same reason its slate
 * is 86 games and the NFL's is 16. */
const SD_MARGIN: Record<string, number> = {
  nfl: 13.5,
  'college-football': 16.5,
};

/* 🔴 HOW THE GAME'S SCORING IS SPREAD ACROSS IT, and the quarters are NOT
 * even. Second and fourth quarters carry noticeably more than first and third
 * - the two-minute drill happens twice a game and both times at the end of a
 * half. Using 0.25 for each would price a first quarter and a second quarter
 * identically, which is wrong in a way anybody who watches football would
 * spot immediately. */
const QUARTER_SHARE = [0.21, 0.29, 0.22, 0.28];

/* 🔴 A TIE NEEDS A WIDTH BECAUSE FOOTBALL IS NOT CONTINUOUS. A normal
 * distribution gives any exact value probability zero, so P(margin === 0) off
 * a continuous model is 0 and the Tie tile would price at infinity. Real
 * football piles up on a handful of margins and 0 is one of the commonest, so
 * the mass near zero is taken as the density there times an effective width.
 *
 * 2.6 is set so that an EVENLY MATCHED first half - spread 0 - prices a tie at
 * about 9%, which is what half-time ties actually run at. It is a calibration
 * against a known rate, not a taste. There is a test for it. */
const TIE_WIDTH = 2.6;

/* 🔴 HOW MUCH A CURRENT LEAD PULLS THE NEXT PERIOD BACK. Jason: "Then the
 * odds should change, right." Right - and this is the only honest way the
 * score can change them.
 *
 * The spread does not move when a game goes 21-0. The two teams are as good
 * as they were at kickoff, so the naive answer is that a future period should
 * price exactly as it did pre-game. That is wrong for a reason that has
 * nothing to do with ability: BEHAVIOUR CHANGES. A side up three scores plays
 * the clock, runs the ball, punts on fourth; the side down three throws on
 * every down and stops the clock. The leader is not trying to win the fourth
 * quarter, they are trying to end it.
 *
 * So the expected margin in a period yet to be played is the pregame
 * expectation pulled back toward zero in proportion to the current lead. At
 * 0.12 points per point of lead:
 *
 *     home -3, up 21 at the half  ->  H2 expectation 1.5 becomes +0.24
 *     home -3, up 35 at the half  ->  H2 expectation 1.5 becomes -0.60
 *
 * A team 35 up being a slight underdog in the second half is the correct
 * shape - that is garbage time, and everybody watching knows it.
 *
 * 🔴 WHAT THIS DELIBERATELY DOES NOT DO IS MOVE A LINE. Only the WINNER
 * markets reprice off the score. The half and quarter TOTALS keep their
 * derived line, because that line is what settlement reads and moving it
 * live would settle somebody's bet against a number that was never on their
 * tile. That is the same defect the parlay's stored `lines` exists to
 * prevent, and the fix is the same one - store the line per bet - which
 * singles do not do yet. Named as the gap rather than half-built. */
const LEAD_REGRESSION = 0.12;

/* 🔴 THE FLOOR, AND IT IS A PRODUCT RULE RATHER THAN A MATHEMATICAL ONE. A
 * tile at 1.01x is not a bet, it is a rounding error with a tap target - and
 * the old board carried 24 of them. Below this a market is NOT OFFERED at all,
 * rather than offered at a price nobody should take. Anything at exactly the
 * floor is a genuine near-certainty being sold honestly cheap. */
export const MIN_PRICE = 1.1;

/** The two-way ceiling. Doctrine, unchanged. */
export const MAX_PRICE = 6;

/* 🔴 A THREE-WAY MARKET GETS 20x, AND 6x IS A TWO-WAY NUMBER. Jason settled it
 * 2026-09-10 after asking the right question - "how does everyone else do it?"
 *
 * Researched rather than argued, and the answer is that nobody does it our
 * way at all. The pick'em products do not price: CBS shows spreads and never
 * a number, Office Pool has no combined payoff. Sportsbooks price everything
 * live and cap in DOLLARS, not multiples, so no book anywhere has a 6x. There
 * is no bar for this and it is stated rather than invented.
 *
 * Two real data points argue the same way:
 *
 *   Armchair Quarterback - the only app on disk shipping a live call layer -
 *   pays a fixed ladder by NUMBER OF OPTIONS: 50 points for the two-way
 *   run/pass call, 220 for the six-way grid. More outcomes, longer price, and
 *   4.4x between them.
 *
 *   A real book prices a full-game NFL tie around +4000, which is 41x.
 *
 * 6x was strangling every three-way market in the app: a half-time tie is
 * genuinely 8-16x and was being sold at 6, and the band was dropping both
 * half-winner markets outright rather than print it.
 *
 * 🔴 THE BAND SCALES WITH THE CAP - twice it, always. A true price further out
 * than double the ceiling cannot be sold honestly at the ceiling, whatever the
 * ceiling is. That is what keeps `neither` on first-to-score - a 0-0 final,
 * about 1 game in 2000 - off the board at 20x exactly as it was at 6x, rather
 * than the band being a second number to remember. */
export const MAX_PRICE_3WAY = 20;

/** The ceiling for this market: 6x on a two-way, 20x once there is a third
 *  outcome. Read off the choices rather than a list of market ids, so a market
 *  added later gets the right one without anybody updating a table. */
export function capFor(market: { choices?: { id: string }[] }): number {
  const n = market && Array.isArray(market.choices) ? market.choices.length : 2;
  return n >= 3 ? MAX_PRICE_3WAY : MAX_PRICE;
}

/* 🔴 THE MIRROR OF THE FLOOR, AND IT EXISTS BECAUSE THE CAP CANNOT SAY NO.
 *
 * A floor stops us offering a bet that pays nothing. Nothing stopped the
 * opposite: `neither` on first-to-score is a 0-0 final, about 1 game in 2000,
 * whose honest price is ~2000x. The 6x cap does not refuse that bet, it just
 * quietly pays it at 6 - a tile selling something for a three-hundredth of
 * what it is worth, sitting next to a coin flip at 2.00x and looking like the
 * better deal because the number is bigger.
 *
 * So above this, the market is not offered. 12x is two full doublings past the
 * cap: anything whose true price is further out than that cannot be sold
 * honestly at 6, and the right answer is not to sell it. */
export const trueCeiling = (cap: number) => cap * 2;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Standard normal CDF, Abramowitz & Stegun 26.2.17. Accurate to ~7.5e-8,
 *  which is several orders of magnitude finer than a price rounded to 2dp. */
export function normCdf(z: number): number {
  const s = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t
    - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + s * y);
}

function normPdf(z: number): number {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}

/**
 * WHAT FRACTION OF THE GAME THIS MARKET COVERS. Returns null for a market that
 * is not a slice of time at all.
 */
export function shareOf(scope: string, period?: number): number | null {
  if (scope === 'game') return 1;
  if (scope === 'half') {
    /* markets.ts numbers the first half `period: 2` - it means "through the
       end of period 2", which is how scoreAfterPeriod reads it. So the FIRST
       half is periods 1-2 and the second half is 3-4. */
    if (period === 2) return QUARTER_SHARE[0] + QUARTER_SHARE[1];
    if (period === 4) return QUARTER_SHARE[2] + QUARTER_SHARE[3];
    return null;
  }
  if (scope === 'quarter' && isNum(period) && period >= 1 && period <= 4) {
    return QUARTER_SHARE[period - 1];
  }
  return null;
}

/** The margin distribution over a slice of the game, from the posted spread. */
export function marginDist(spread: number, share: number, sport: string, lead = 0) {
  const sd = SD_MARGIN[sport] ?? SD_MARGIN['college-football'];
  const base = -spread * share;       // ESPN convention: home number, negative = home favoured
  const pull = isNum(lead) ? LEAD_REGRESSION * lead * share : 0;
  return {
    mu: base - pull,                  // a lead pulls the NEXT period back toward level
    sigma: sd * Math.sqrt(share),     // variance adds over time, deviation goes as sqrt
  };
}

/**
 * P(home) / P(away) / P(tie) over a slice of the game.
 *
 * 🔴 NORMALISED, ALWAYS. The three come out of one distribution so they
 * already sum to about 1, and they are divided through anyway - a rounding
 * drift of a thousandth is not worth the class of bug it leaves open.
 */
export function winnerProbs(spread: number, share: number, sport: string, lead = 0) {
  const { mu, sigma } = marginDist(spread, share, sport, lead);
  const tie = Math.min(0.4, normPdf(-mu / sigma) / sigma * TIE_WIDTH);
  const rest = 1 - tie;
  /* P(home leads) among the non-tie mass. */
  const pHome = 1 - normCdf((0 - mu) / sigma);
  const home = pHome * rest;
  const away = (1 - pHome) * rest;
  const s = home + away + tie;
  return { home: home / s, away: away / s, tie: tie / s };
}

/**
 * P of each winning-margin bucket, over the whole game. `1-6`, `7-13`, `14+`.
 *
 * 🔴 A TIE IS NOT A BUCKET AND IS NOT SILENTLY FOLDED INTO ONE. markets.ts
 * offers three buckets and none of them is 0, so a tied game settles through
 * the void path. Its mass is therefore removed here and the three buckets are
 * normalised over what is left - pricing them as though a tie were impossible
 * would overstate every one of them.
 */
export function marginProbs(spread: number, sport: string) {
  const { mu, sigma } = marginDist(spread, 1, sport);
  /* |margin| in a band, summed from both tails of the distribution. */
  const band = (lo: number, hi: number) => {
    const p = (a: number, b: number) => normCdf((b - mu) / sigma) - normCdf((a - mu) / sigma);
    return p(lo, hi) + p(-hi, -lo);
  };
  const raw = {
    '1-6': band(0.5, 6.5),
    '7-13': band(6.5, 13.5),
    '14+': band(13.5, 200),
  };
  /* 🔴 TIE IS A FOURTH BUCKET, NOT A VOID, and I had this backwards. The
     comment that stood here argued at length that a tied game voids the market
     so the three buckets should be normalised over the non-tie mass. Then I
     read the market: markets.ts offers `1-6 | 7-13 | 14+ | tie`. It is a
     choice you can take. Normalising it away priced the other three as though
     the tie mass did not exist, overstating all of them, and left `tie`
     unpriced entirely so the whole market was dropped as unofferable.
     Reasoning about a data structure instead of opening it - twice in one
     file, since `neither` on first_to_score was the same mistake. */
  const tie = Math.min(0.4, normPdf(-mu / sigma) / sigma * TIE_WIDTH);
  const s = (raw['1-6'] + raw['7-13'] + raw['14+']) || 1;
  const keep = 1 - tie;
  return {
    '1-6': raw['1-6'] / s * keep,
    '7-13': raw['7-13'] / s * keep,
    '14+': raw['14+'] / s * keep,
    tie,
  };
}

/**
 * P(home scores first).
 *
 * 🔴 MUCH FLATTER THAN WINNING, AND DELIBERATELY SO. Who scores first is one
 * possession, decided largely by a coin toss and a single drive, so it barely
 * tracks a 40-point spread. Modelled as the winner probability of a slice
 * about one drive long - which lands a 21-point favourite near 60% rather than
 * near 95%, and that is the right shape. Ties are impossible here, so the two
 * are normalised across each other only.
 */
export function firstToScoreProbs(spread: number, sport: string) {
  const w = winnerProbs(spread, 0.08, sport);
  const s = w.home + w.away || 1;
  /* 🔴 `neither` IS A REAL CHOICE ON THIS MARKET - a 0-0 final. It is also
     about one game in two thousand, which is the interesting part: see the
     band rule in priceMarket. Modelled rather than omitted, because a choice
     with no probability drops the whole market and that is what it was
     silently doing. */
  const NEITHER = 0.0005;
  const rest = 1 - NEITHER;
  return { home: w.home / s * rest, away: w.away / s * rest, neither: NEITHER };
}

/**
 * A PROBABILITY BECOMES A PRICE. `stake / p`, two decimals, capped at 6x.
 * Returns null BELOW THE FLOOR, which is how a market says "do not offer this"
 * rather than printing a number nobody should take.
 */
export function priceFromP(p: number, cap: number = MAX_PRICE): number | null {
  if (!isNum(p) || p <= 0) return null;
  const raw = Math.round((1 / p) * 100) / 100;
  if (raw < MIN_PRICE) return null;
  return Math.min(cap, raw);
}

/**
 * PRICE EVERY CHOICE IN ONE MARKET FOR ONE GAME.
 *
 * The single entry point the board calls. Returns `offerable: false` when this
 * market should not be drawn for this game at all.
 *
 * 🔴 A MARKET WITH A NEAR-CERTAIN SIDE IS NOT OFFERED, EVEN THOUGH ITS OTHER
 * SIDES PRICE FINE. Miami -59.5 puts the first-half winner at 99.1% / 0.5% /
 * 0.3%. Miami falls below the floor and disappears, which leaves a market
 * showing Florida A&M at 6.00x and Tie at 6.00x - two big numbers, no
 * favourite, and nothing on the screen saying that both are 200-to-1 shots
 * being sold at 6.
 *
 * That is worse than the flat board it replaces. A tile's price is the only
 * thing telling you what you are taking, and the cap has already flattened
 * both of these into the same number as a coin flip on a good game. So the
 * rule is: if ANY outcome is a near-certainty, the market is a formality
 * rather than a proposition, and it does not get drawn. Mismatches therefore
 * show fewer markets, which is the honest answer - there is less to bet on in
 * a 59-point game, and pretending otherwise is what produced the screenshot.
 */
export function priceMarket(
  game: any,
  market: { id: string; scope: string; period?: number; needsLine?: string; choices: { id: string }[] },
  sport: string,
): { offerable: boolean; prices: Record<string, number> } {
  const none = { offerable: false, prices: {} };
  if (!game || !market) return none;
  const spread = game.spread;

  /* A posted line prices itself at 2.00x both ways - unchanged, and the reason
     is in this file's header. Jason, 2026-09-10: "Against the spread I get
     even odds." Yes, and that is correct rather than a gap. */
  if (market.needsLine) {
    const prices: Record<string, number> = {};
    for (const c of market.choices) prices[c.id] = 2;
    return { offerable: true, prices };
  }

  /* Everything below needs the spread to have an opinion at all. Without one
     there is no model, and 2.00x is then an honest statement of ignorance
     rather than a default nobody chose. */
  if (!isNum(spread)) {
    const prices: Record<string, number> = {};
    for (const c of market.choices) prices[c.id] = 2;
    return { offerable: true, prices };
  }

  /* 🔴 THE LEAD ONLY EXISTS WHILE THE GAME DOES. A scheduled game has no
     score to read and a final one has nothing left to price, so both go
     through at zero and the pregame model is unchanged. */
  const lead = (game.status === 'in_progress'
    && isNum(game.homeScore) && isNum(game.awayScore))
    ? game.homeScore - game.awayScore : 0;

  let probs: Record<string, number> | null = null;
  if (market.id === 'margin') {
    probs = marginProbs(spread, sport) as unknown as Record<string, number>;
  } else if (market.id === 'first_to_score') {
    probs = firstToScoreProbs(spread, sport) as unknown as Record<string, number>;
  } else {
    const share = shareOf(market.scope, market.period);
    if (share === null) return none;
    /* 🔴 THE WHOLE-GAME WINNER IS LEFT ALONE. It has a moneyline, which is a
       real price from a real book, and a model built out of the spread has
       nothing to add to it. p6-allgames still owns that one. */
    if (market.id === 'winner') return none;
    probs = winnerProbs(spread, share, sport, lead) as unknown as Record<string, number>;
  }

  const cap = capFor(market);
  const ceiling = trueCeiling(cap);
  const prices: Record<string, number> = {};
  for (const c of market.choices) {
    const p = probs[c.id];
    if (!isNum(p) || p <= 0) return none;
    /* The band, checked on the TRUE price before the cap flattens it. Both
       ends drop the whole market rather than the one choice: a market missing
       an outcome is not the same market, and the remaining tiles would be
       priced against a set that no longer sums to one. */
    const truePrice = 1 / p;
    if (truePrice < MIN_PRICE || truePrice > ceiling) return none;
    const price = priceFromP(p, cap);
    if (price === null) return none;
    prices[c.id] = price;
  }
  return { offerable: true, prices };
}

/* 🔴 WHEN A MARKET CLOSES, AND IT IS NOT ALWAYS KICKOFF.
 *
 * Jason, 2026-09-10: "So I can only bet on who wins the second half until
 * kick?" Yes, and it was the single worst rule in the board.
 *
 * Everything shut at kickoff because kickoff was the only moment the slate
 * knew about. So a fourth-quarter winner closed at the coin toss - three
 * hours before the thing it is about starts, on a proposition nobody could
 * possibly have resolved yet. An app whose entire thesis is that there is
 * something to do WHILE you watch was closing every in-game market before the
 * game began.
 *
 * 🔴 THE RULE: A MARKET CLOSES WHEN ITS OWN PERIOD STARTS. Not before, not at
 * kickoff. Full-game markets and anything covering period 1 still close at
 * kickoff, because their subject begins then. Everything else stays open
 * exactly as long as it is genuinely undecided:
 *
 *     winner, spread, total, margin, first to score, team totals
 *                        -> kickoff. The whole game is their subject
 *     first half, Q1     -> kickoff
 *     Q2                 -> the start of the second quarter
 *     second half, Q3    -> half time
 *     Q4                 -> the start of the fourth quarter
 *
 * So a Sunday afternoon has a rolling board rather than one that empties at
 * 1pm: the second half of the early game is live while you are watching the
 * first, which is the product.
 *
 * 🔴 AND THE PRICE DOES NOT NEED A LIVE LINE TO DO THIS. A future period is
 * priced off the pregame spread scaled to that period, exactly as it is
 * before kickoff - the relative strength of two teams is what the spread
 * says, and it does not stop being true at half time. What this deliberately
 * does NOT model is game state: a side down 28 in the fourth throws on every
 * down, which moves a Q4 total more than it moves a Q4 winner. Naming that as
 * a known gap rather than pretending the number is a live price.
 */
export function marketClosesAtPeriod(market: { scope: string; period?: number }): number {
  if (market.scope === 'game') return 1;
  if (market.scope === 'half') {
    /* markets.ts numbers a half by the period it ENDS on: 2 is the first half,
       4 is the second. The second half opens at period 3. */
    return market.period === 4 ? 3 : 1;
  }
  if (market.scope === 'quarter' && isNum(market.period)) return market.period;
  return 1;
}

/**
 * IS THIS MARKET STILL OPEN FOR THIS GAME?
 *
 * 🔴 A FINAL GAME IS SHUT WHATEVER THE PERIOD SAYS, and that guard is first
 * for a reason: a finished game's status object still reports `period: 4`, so
 * a Q4 market read off the period alone would look open on a game that ended
 * an hour ago. The same trap as reading a scheduled game's period, from the
 * other end.
 */
export function marketIsOpen(game: any, market: { scope: string; period?: number }, now: number): boolean {
  if (!game || !market) return false;
  if (game.status === 'final') return false;
  if (game.status !== 'in_progress') {
    /* Not started: open until the clock reaches kickoff. */
    return isNum(game.kickoffUtc) && isNum(now) && now < game.kickoffUtc;
  }
  /* Running: open only while the game has not reached this market's period.
     An unknown period on a live game closes everything except full-game
     markets, which are shut anyway - absent beats guessed. */
  if (!isNum(game.period)) return false;
  return game.period < marketClosesAtPeriod(market);
}

/* 🔴 QUARTER SCORES BECOME A PLAY LIST, SO NOTHING ELSE HAS TO CHANGE.
 *
 * Every period market in the catalogue settles through `scoreAfterPeriod`,
 * which reads a chronological PLAY LIST where each play carries the score
 * after it. That is exactly right for the live screen, which has the plays -
 * and impossible for the All games board, which has 86 games and no play list
 * for any of them. So the halves and quarters could be offered, priced and
 * staked, and then nothing in the app could ever resolve them. A market you
 * can take and cannot settle is worse than one that does not exist.
 *
 * The slate now captures `periodsHome` / `periodsAway` from ESPN's linescores.
 * This turns those into the smallest play list that answers the same
 * questions: one synthetic entry per completed quarter, carrying the
 * CUMULATIVE score at the end of it.
 *
 * 🔴 IT REUSES settleMarket RATHER THAN FORKING IT, which is the whole point.
 * A second settlement path for the same fifteen markets is two things to keep
 * in agreement, and the live screen and the board would eventually disagree
 * about who won a first half. Same function, same rules, a different way of
 * arriving at the input.
 *
 * `quarter` is the field name because that is what scoreAfterPeriod reads -
 * see maxQuarter in markets.ts. Getting that wrong produces an empty list and
 * a market that says "not final yet" forever.
 */
export function playsFromPeriods(game: any): any[] {
  const h = game && Array.isArray(game.periodsHome) ? game.periodsHome : null;
  const a = game && Array.isArray(game.periodsAway) ? game.periodsAway : null;
  if (!h || !a || !h.length) return [];
  /* Overtime periods exist in the linescore and are kept: markets.ts already
     decides what to do with them (the second half owns overtime), and
     truncating here would be this module quietly overruling that. */
  const n = Math.min(h.length, a.length);
  const out: any[] = [];
  let ch = 0, ca = 0;
  for (let i = 0; i < n; i++) {
    const ph = Number(h[i]), pa = Number(a[i]);
    if (!isNum(ph) || !isNum(pa)) break;
    ch += ph; ca += pa;
    out.push({ quarter: i + 1, homeScore: ch, awayScore: ca });
  }
  return out;
}
