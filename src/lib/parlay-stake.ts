/* 🔴 THE STAKED PARLAY - the All games one, not the pool one.
 *
 * Jason: "all games, where you can place bets on the entire list, plus first by
 * quarter and half and others and parlays." Then: "Ok. Build the parlay."
 *
 * 🔴 THERE ARE NOW TWO PARLAYS AND THEY MUST NOT BE MERGED. src/lib/pool.ts
 * already has one, and it is a different instrument in every way that matters:
 *
 *              POOL PARLAY (pool.ts)         STAKED PARLAY (here)
 *   currency   points, nothing staked        Marbles, staked
 *   legs       one side of a whole game      any market in GAME_MARKETS
 *   worth      a fixed 3/6/12/20 ladder      the product of the legs' prices
 *   board      the pool standings            the live board, ranked on profit
 *
 * They never sum - settled doctrine - so they cannot share a resolver. What
 * they DO share is the rules that are about fairness rather than about
 * currency, and those are imported rather than restated: the 3-6 leg range and
 * the void path both come from pool.ts, so a change there cannot leave the two
 * halves of the app disagreeing about what a parlay is.
 *
 * 🔴 ONE LEG PER GAME, and this is the rule with real weight behind it. Nothing
 * else stops somebody building "home wins" + "home wins the first half" +
 * "home covers" out of a single game. Multiplying those three prices together
 * asserts that they are independent events, and they are very nearly the same
 * event. The product would be a number we know to be wrong, printed on the tile
 * before the tap - which is the one thing this product promises not to do.
 */
import { PARLAY_MIN_LEGS, PARLAY_MAX_LEGS } from './pool.ts';
import { settleMarket } from '../markets.ts';

export { PARLAY_MIN_LEGS, PARLAY_MAX_LEGS };

/* 🔴 250x, AND THE CAP NOW ONLY TRIMS THE ABSURD TAIL. Jason, 2026-09-10:
 * "a 6 parlay should win big."
 *
 * It did not, and 50 was the reason. The most ORDINARY six-leg parlay there
 * is - six coin flips at 2.00x - prices at 64x, so a 50 ceiling trimmed the
 * exact bet that is supposed to be the headline. The cap was biting at the
 * top of the ladder instead of past the end of it.
 *
 * 🔴 THAT IS THE RULE THIS NUMBER NOW FOLLOWS: A CAP MUST NOT BITE A
 * PLAUSIBLE PARLAY. It exists to stop a chain of long shots compounding into
 * a number that makes every other row on the board pointless - not to shave
 * the ordinary case. Anywhere it touches something a person would actually
 * build, it is set wrong.
 *
 *     legs of 2.00x    2 ->   4      4 ->  16      6 ->  64   all uncapped
 *     the tail         six legs averaging 2.6x  ->  308  ->  250
 *
 * 🔴 WHY IT CANNOT SIMPLY BE REMOVED. Each leg is already capped at 6x by the
 * single-call rule, so six maximum-price legs multiply to 6^6 = 46,656x. A
 * 25-marble stake would return over a million against a bank that starts at a
 * few hundred - one bet that ends the board for everybody on it. The tail is
 * real and it needs an end; 250 is where it stops being a game.
 *
 * The three numbers and what each is for, so none is ever read as the others:
 *
 *     6x    one call            keeps the BOARD from being all lottery tickets
 *     50x   -- retired --       bit the ordinary six-fold. See above
 *     250x  one parlay          ends the long-shot tail, touches nothing else
 *
 * Still not a financial control. Marbles cannot be bought, sold or cashed out
 * and the bank refills every game, so every one of these is about what the
 * board looks like, never about exposure.
 */
export const PARLAY_MAX_PAYOUT = 250;

export type StakeLeg = {
  gameId: string;
  marketId: string;
  choiceId: string;
  /** What the tile said this leg paid, at the moment it was added. */
  price: number;
  /* 🔴 THE LINE AS IT STOOD WHEN THE LEG WAS TAKEN, AND IT IS NOT OPTIONAL
   * DECORATION. Jason, 2026-09-10: "Does the spread change during the game or
   * all gate at kick?"
   *
   * It changes. src/slate-cron.ts re-reads the odds endpoint for EVERY event
   * every ten minutes, live and final ones included, and overwrites `spread`
   * and `total` on the captured game. So the game object a leg settles
   * against at 4pm is not the one it was priced against at noon.
   *
   * Without this field a spread leg had a FROZEN PRICE and a FLOATING LINE -
   * the worst of both. Somebody takes SEA -3 at 2.00x, the book moves to
   * SEA -7 by kickoff, and the leg quietly settles against -7 while the tile
   * still says what it said. That is the one thing this product promises does
   * not happen: nothing may move under the user after the tap.
   *
   * Stored as a pair rather than one number because the team-total markets
   * read both, and a leg that carries half of what it needs is a leg that
   * settles against a stale half. */
  lines?: { spread?: number | null; total?: number | null } | null;
};

export type LegResult = StakeLeg & {
  result: 'won' | 'lost' | 'void' | null;
  /** Present only when `result` is null, and it is settleMarket's own `because`. */
  pending?: string;
};

export type StakeParlayResolution = {
  state: 'live' | 'won' | 'lost' | 'void';
  legs: LegResult[];
  /** Legs that left through the void path. */
  voidedLegs: string[];
  /** True when a void shrank the parlay and the price was recomputed. */
  reduced: boolean;
  /** The price actually being paid, after any reduction and the cap. */
  price: number;
  /** Whole Marbles returned. 0 on a loss, the stake back on a void. */
  returns: number;
  note: string | null;
};

/* 🔴 THE FOUR WAYS A LEG LEAVES, NAMED ONCE. settleMarket reports five reasons
 * for `landed: null` and only one of them means "wait".
 *
 *   'push'            the market tied. Rule 3 in markets.ts: one void path
 *   'no posted line'  the market never existed for this game
 *   'unknown market'  the leg names a market this build no longer has
 *   'unknown choice'  ditto, for the side
 *   'not final yet'   the ONLY one that is still pending
 *
 * The last two matter more than they look. A leg stored in localStorage
 * survives a deploy that renames or drops a market, and if that leg fell into
 * the pending branch the parlay would sit "live" forever, unsettleable, with a
 * stake locked behind it. Voiding is the honest answer: it cannot be judged,
 * so it did not happen - which is the same sentence as every other void here.
 *
 * 🔴 AND THE FIELD IS `because`, NOT `reason`. Reading `v.reason` returned
 * undefined for every verdict, so every unsettleable leg looked pending and no
 * leg could ever void. Caught by the test that asserts the no-line path, which
 * is the whole argument for writing that test before believing the code. */
const VOIDS = new Set(['push', 'no posted line', 'unknown market', 'unknown choice']);

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const round2 = (x: number) => Math.round(x * 100) / 100;

/**
 * WHAT A SET OF LEGS PAYS PER MARBLE.
 *
 * The product of the legs, rounded ONCE at the end and then capped. Rounding
 * each leg on the way through compounds the error into the number the user is
 * shown, and the legs arrive at 2dp already.
 *
 * An empty set pays nothing rather than 1x - a parlay of no legs is not a stake
 * at evens, it is not a parlay.
 */
export function parlayPrice(
  legPrices: readonly number[],
  cap: number = PARLAY_MAX_PAYOUT,
): number {
  if (!Array.isArray(legPrices) || legPrices.length === 0) return 0;
  let p = 1;
  for (const x of legPrices) {
    if (!isNum(x) || x <= 0) return 0;
    p *= x;
  }
  return Math.min(cap, round2(p));
}

/** Whole Marbles back on a winning parlay. Rounded once, here, so the tile and
 *  the settlement line can never print two different answers. */
export function parlayReturns(stake: number, price: number): number {
  if (!isNum(stake) || !isNum(price)) return 0;
  return Math.round(stake * price);
}

/**
 * IS THIS A LEGAL PARLAY? Returns the reasons, never a bare boolean - a screen
 * that can only say "no" makes the user guess which rule they broke.
 *
 * 🔴 The one-leg-per-game rule is enforced here rather than in the view,
 * because a view that enforces it is a view that can be bypassed by a stale
 * localStorage entry written by a build that did not.
 */
export function validateStakeParlay(
  legs: readonly StakeLeg[],
): { ok: boolean; errors: { code: string; detail?: string }[] } {
  const errors: { code: string; detail?: string }[] = [];
  const list = Array.isArray(legs) ? legs : [];
  if (list.length < PARLAY_MIN_LEGS) {
    errors.push({ code: 'too_few_legs', detail: list.length + ' of ' + PARLAY_MIN_LEGS });
  }
  if (list.length > PARLAY_MAX_LEGS) {
    errors.push({ code: 'too_many_legs', detail: list.length + ' of ' + PARLAY_MAX_LEGS });
  }
  const seenGames = new Set<string>();
  const seenLegs = new Set<string>();
  for (const leg of list) {
    if (!leg || !leg.gameId || !leg.marketId || !leg.choiceId) {
      errors.push({ code: 'malformed_leg' });
      continue;
    }
    const key = leg.gameId + '|' + leg.marketId + '|' + leg.choiceId;
    if (seenLegs.has(key)) errors.push({ code: 'duplicate_leg', detail: key });
    seenLegs.add(key);
    if (seenGames.has(leg.gameId)) {
      errors.push({ code: 'same_game_twice', detail: leg.gameId });
    }
    seenGames.add(leg.gameId);
    if (!isNum(leg.price) || leg.price <= 0) {
      errors.push({ code: 'no_price', detail: leg.gameId });
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * SETTLE IT.
 *
 * 🔴 ONE VOID PATH, AND IT IS THE POOL'S. A leg that cannot settle leaves, the
 * survivors decide the parlay, and the price is recomputed on what is left - so
 * a void makes a parlay easier and cheaper, never a loss. If fewer than
 * PARLAY_MIN_LEGS survive, the whole thing voids and the stake comes back. Same
 * sentence as everywhere else in this app: it did not happen, for everybody.
 *
 * 🔴 A PUSH IS A VOID. settleMarket reports 'push' and 'no posted line' as
 * distinct reasons, and they are distinct facts, but they have identical
 * consequences for the person holding the leg: there is no result to be right
 * about. Giving them separate treatments would be exactly the special case the
 * one-void-path rule exists to forbid.
 *
 * 🔴 AND ONE LOSS IS ENOUGH, checked BEFORE the survivor count. A parlay with a
 * lost leg is over whatever happens to the rest; resolving it as a void because
 * two other legs were later cancelled would hand back a stake that was already
 * gone.
 */
/**
 * THE GAME AS THIS LEG SAW IT. A shallow copy with the leg's own stored line
 * put back, so settlement reads the number that was on the tile.
 *
 * 🔴 A LEG WITH NO STORED LINE ON A MARKET THAT NEEDS ONE IS NOT SETTLED
 * AGAINST THE CURRENT LINE - it is left with nothing, so settleMarket reports
 * 'no posted line' and the leg leaves by the void path. That is the honest
 * answer for a leg written by an older build that did not record its line:
 * we do not know what it was taken at, so it did not happen. Falling back to
 * the live line would be silently doing the exact thing this field exists to
 * prevent, and it would never error.
 */
function atTakenLine(game: any, leg: StakeLeg): any {
  const l = leg.lines;
  if (!l) return { ...game, spread: undefined, total: undefined };
  return {
    ...game,
    spread: isNum(l.spread) ? l.spread : undefined,
    total: isNum(l.total) ? l.total : undefined,
  };
}

/**
 * WHEN THE PARLAY STOPS BEING COMPOSABLE - the FIRST leg's kickoff, not each
 * leg's own.
 *
 * 🔴 THIS IS THE POOL'S RULE AND IT IS DELIBERATELY THE SAME ONE. Jason:
 * "Parts of the parlay gate at kick, yes?" - the LEGS resolve independently,
 * so a parlay is routinely half-decided while the rest is still to play. What
 * does NOT stay open is the composition: once any leg has kicked, no leg may
 * be added, dropped or switched.
 *
 * The alternative - letting each leg lock on its own clock - reads as more
 * flexible and is unplayable. It lets somebody watch the Thursday leg win and
 * then build the rest of the parlay around a result they already have, at
 * prices set before it. The price of a parlay is a claim about six unknown
 * outcomes; the moment one is known, that claim is false.
 */
export function parlayLocksAt(
  legs: readonly StakeLeg[],
  games: ReadonlyMap<string, any>,
): number | null {
  let first: number | null = null;
  for (const leg of (Array.isArray(legs) ? legs : [])) {
    const g = games.get(leg.gameId);
    if (!g || !isNum(g.kickoffUtc)) continue;
    if (first === null || g.kickoffUtc < first) first = g.kickoffUtc;
  }
  return first;
}

/** Whether legs may still be added, dropped or switched. */
export function parlayIsComposable(
  legs: readonly StakeLeg[],
  games: ReadonlyMap<string, any>,
  now: number,
): boolean {
  const at = parlayLocksAt(legs, games);
  return at === null || now < at;
}

/**
 * MAY THIS LEG BE ADDED RIGHT NOW? A game that has kicked, is running or is
 * final cannot be joined to a parlay - the same gate the All games board uses
 * on a single call, restated here so the module and not the view is the thing
 * that enforces it.
 */
export function legIsAddable(game: any, now: number): boolean {
  if (!game) return false;
  if (game.status === 'in_progress' || game.status === 'final') return false;
  return isNum(game.kickoffUtc) && isNum(now) && now < game.kickoffUtc;
}

export function settleStakeParlay(
  legs: readonly StakeLeg[],
  games: ReadonlyMap<string, any>,
  playsByGame: ReadonlyMap<string, any[]>,
  stake: number,
): StakeParlayResolution {
  const out: LegResult[] = [];
  const voidedLegs: string[] = [];
  const survivorPrices: number[] = [];
  let anyLost = false;
  let anyPending = false;

  for (const leg of (Array.isArray(legs) ? legs : [])) {
    const game = games.get(leg.gameId);
    if (game === undefined) {
      /* A leg whose game left the slate is the same event as a cancellation. */
      out.push({ ...leg, result: 'void' });
      voidedLegs.push(leg.gameId);
      continue;
    }
    const plays = playsByGame.get(leg.gameId) || [];
    const v: any = settleMarket(leg.marketId, leg.choiceId, atTakenLine(game, leg), plays);
    if (v.landed === true) {
      out.push({ ...leg, result: 'won' });
      survivorPrices.push(leg.price);
    } else if (v.landed === false) {
      out.push({ ...leg, result: 'lost' });
      survivorPrices.push(leg.price);
      anyLost = true;
    } else if (VOIDS.has(v.because)) {
      out.push({ ...leg, result: 'void' });
      voidedLegs.push(leg.gameId);
    } else {
      out.push({ ...leg, result: null, pending: v.because });
      survivorPrices.push(leg.price);
      anyPending = true;
    }
  }

  const surviving = survivorPrices.length;
  const reduced = voidedLegs.length > 0 && surviving >= PARLAY_MIN_LEGS;
  const price = parlayPrice(survivorPrices);

  if (anyLost) {
    return {
      state: 'lost', legs: out, voidedLegs, reduced, price, returns: 0,
      note: voidedLegs.length
        ? voidedLegs.length + ' leg' + (voidedLegs.length === 1 ? '' : 's')
          + ' voided, but a leg lost.'
        : null,
    };
  }
  if (surviving < PARLAY_MIN_LEGS) {
    return {
      state: 'void', legs: out, voidedLegs, reduced: false, price: 0,
      returns: Math.round(isNum(stake) ? stake : 0),
      note: 'Only ' + surviving + ' leg' + (surviving === 1 ? '' : 's') + ' left of the '
        + PARLAY_MIN_LEGS + ' a parlay needs. Voided - your stake is back.',
    };
  }
  if (anyPending) {
    return {
      state: 'live', legs: out, voidedLegs, reduced, price,
      returns: parlayReturns(stake, price),
      note: reduced
        ? 'Reduced to ' + surviving + ' legs. Now paying ' + price.toFixed(2) + '×.'
        : null,
    };
  }
  return {
    state: 'won', legs: out, voidedLegs, reduced, price,
    returns: parlayReturns(stake, price),
    note: reduced
      ? 'Reduced to ' + surviving + ' legs. Paid ' + price.toFixed(2) + '×.'
      : null,
  };
}
