/**
 * Any Given - the call ledger.
 *
 * One user, one game. Accept a call, enforce the rules, settle it against the
 * play that resolved it, move the bank.
 *
 * THE BALANCE IS MARBLES. It starts at `startingBank` every game and it is set
 * back to that at the next game: finite inside a game, restored at kickoff of
 * the next one. Nobody is ever locked out of the app and there is no
 * elimination. Nothing here may ever grow a way to obtain Marbles other than by
 * calling a snap - that is a change to the legal position of the whole product,
 * not a feature, and it is not this module's to make.
 *
 * The board ranks on PROFIT - `balance - start` - so a deeper bench is worth a
 * longer night and nothing at all in the standings.
 *
 * 7.4 ONE CALL PER SNAP. Two guards, because the bug was real: a second tap
 * while a call was pending took a second stake, threw the first one away
 * unreturned, and replaced the pick - so you paid twice and only one of them
 * could ever settle. Silent, and 332 tests passed the whole time it was there.
 *   - `call_pending`      a call is unresolved. Nothing else is accepted
 *   - `snap_already_called` this snap has been called once already, ever.
 *                         That is the D1 constraint `one_call_per_snap`
 * Both guards run BEFORE the stake leaves the bank. A guard after the debit is
 * worthless.
 *
 * The price is copied AT THE MOMENT OF THE CALL. The model reprices every snap;
 * without the copy, the payout shown on the tile and the payout paid are two
 * different numbers.
 *
 * Reference implementation: sports-live `ncaalive/server.py`, functions `pick`,
 * `resolvePick`, `payout`, `playKind`. Read, not translated.
 */

// ---------------------------------------------------------------- vocabulary

/** CONTRACT 6. The word for the balance. There is no other one. */
export const BALANCE_NOUN = 'Marbles';

export type CallSide = 'run' | 'pass';
export type Confidence = 'hi' | 'mid' | 'lo';

/** What the parser (M1 `parse.ts`) says a play was. Only run and pass settle a
 *  call: a kick, a penalty or anything else is not the offense choosing. */
export type PlayType = 'run' | 'pass' | 'kick' | 'penalty' | 'other';

/** THE PRICE IS ON THE TILE, BEFORE THE TAP. */
export type CallOffer = {
  snapId: string;
  side: CallSide;
  p: number;
  payoutPerMarble: number;
  confidence: Confidence;
  closesAt: number;
};

export type CallState = 'open' | 'locked' | 'settled';

export type Call = {
  snapId: string;
  side: CallSide;
  stake: number;
  p: number;
  state: CallState;
  landed: boolean | null;
  delta: number | null;
};

export type Bank = {
  balance: number;
  start: number;
  delta: number;
  record: { landed: number; missed: number };
  streak: number;
};

// -------------------------------------------------------------------- rules

/**
 * Every number the house runs on, in one object, because NOT ONE OF THEM HAS
 * BEEN TESTED AGAINST A REAL GAME. The ladder and the starting bank are
 * settled-for-now, not settled-forever, and B2 will move them. They are
 * parameters so that moving them is a call site, not a rewrite.
 */
export type LedgerRules = {
  /** Marbles at kickoff. The same for everybody in the game. */
  startingBank: number;
  /** The chips a stake may be. Untested against a real game. */
  stakeLadder: number[];
  /** `stake / p`, never more than this multiple of the stake. */
  maxPayoutMultiple: number;
  /** A snap that was not a run or a pass returns the stake untouched. The
   *  reference discards it; see the divergence note on `settle`. */
  voidReturnsTheStake: boolean;
};

export const HOUSE_RULES: LedgerRules = {
  startingBank: 100,
  stakeLadder: [5, 10, 25],
  maxPayoutMultiple: 6,
  voidReturnsTheStake: true,
};

export type RejectReason =
  /** 7.4 - a call is unresolved. This is the guard the bug was about. */
  | 'call_pending'
  /** 7.4 - this snap has already been called once. One call per snap, ever. */
  | 'snap_already_called'
  /** The snap clock ran out before the tap landed. */
  | 'snap_closed'
  | 'not_on_the_ladder'
  /** Fewer Marbles than the smallest chip. Inside this game only - the bank is
   *  set back to its start at the next game, and this is never elimination. */
  | 'bank_too_low'
  | 'bad_side'
  | 'bad_price';

// ------------------------------------------------------------------- ledger

export type Ledger = {
  gameId: string;
  userId: string;
  rules: LedgerRules;
  bank: Bank;
  /** The one unresolved call, or null. Never a list. */
  pending: Call | null;
  /** Settled calls, in the order they settled. */
  history: Call[];
  /** Every snap this user has called in this game. 7.4 is enforced on this. */
  called: Set<string>;
  seq: number;
};

/** A fresh ledger for one user in one game. The bank is at its start; every
 *  game begins here, whatever happened in the last one. */
export function openLedger(
  gameId: string,
  userId: string,
  rules: Partial<LedgerRules> = {},
): Ledger {
  const r: LedgerRules = { ...HOUSE_RULES, ...rules };
  return {
    gameId,
    userId,
    rules: r,
    bank: {
      balance: r.startingBank,
      start: r.startingBank,
      delta: 0,
      record: { landed: 0, missed: 0 },
      streak: 0,
    },
    pending: null,
    history: [],
    called: new Set<string>(),
    seq: 0,
  };
}

/** The next game. The same person, the same rules, the bank back at its start
 *  and the record blank. There is no state in which a user cannot play. */
export function nextGame(ledger: Ledger, gameId: string): Ledger {
  return openLedger(gameId, ledger.userId, ledger.rules);
}

/** What a stake returns if the call is right - gross, because the stake left
 *  the bank at the tap. The cap is on the multiple, not on the stake: a model
 *  saying 3% is telling you the sample is thin, not offering 33x. */
export function payoutFor(
  stake: number,
  p: number | null,
  maxMultiple: number = HOUSE_RULES.maxPayoutMultiple,
): number {
  if (p == null || !(p > 0)) return stake;
  return Math.min(stake * maxMultiple, Math.round(stake / p));
}

/** The number that goes on the tile, before the tap. `1 / p`, capped. */
export function payoutPerMarble(
  p: number | null,
  maxMultiple: number = HOUSE_RULES.maxPayoutMultiple,
): number {
  if (p == null || !(p > 0)) return 1;
  return Math.min(maxMultiple, 1 / p);
}

/** Three steps, never a ramp. */
export function confidenceOf(p: number): Confidence {
  const edge = Math.abs(p - 0.5);
  if (edge >= 0.2) return 'hi';
  if (edge >= 0.08) return 'mid';
  return 'lo';
}

/** The offer for one side of one snap, priced. */
export function offerFor(
  snapId: string,
  side: CallSide,
  p: number,
  closesAt: number,
  rules: LedgerRules = HOUSE_RULES,
): CallOffer {
  return {
    snapId,
    side,
    p,
    payoutPerMarble: payoutPerMarble(p, rules.maxPayoutMultiple),
    confidence: confidenceOf(p),
    closesAt,
  };
}

export type CallRequest = {
  snapId: string;
  side: CallSide;
  /** A chip off the ladder. Trimmed to the balance if the balance is smaller. */
  stake: number;
  /** The price the tile showed. Copied here and never looked up again. */
  p: number;
  now?: number;
  closesAt?: number;
};

export type AcceptResult =
  | { ok: true; call: Call; bank: Bank; staked: number }
  | { ok: false; reason: RejectReason; bank: Bank };

/**
 * Take a call, or say why not.
 *
 * Order matters and is the whole point: every guard is above the debit.
 */
export function accept(ledger: Ledger, req: CallRequest): AcceptResult {
  const bank = ledger.bank;

  // 7.4, guard one. One unresolved call at a time, on any snap.
  if (ledger.pending) return { ok: false, reason: 'call_pending', bank };

  // 7.4, guard two. One call per snap for the life of the game - the same rule
  // the unique index `one_call_per_snap` holds in D1.
  if (ledger.called.has(req.snapId))
    return { ok: false, reason: 'snap_already_called', bank };

  if (req.side !== 'run' && req.side !== 'pass')
    return { ok: false, reason: 'bad_side', bank };

  if (typeof req.p !== 'number' || !(req.p > 0) || req.p > 1)
    return { ok: false, reason: 'bad_price', bank };

  if (req.closesAt != null && req.now != null && req.now > req.closesAt)
    return { ok: false, reason: 'snap_closed', bank };

  if (!ledger.rules.stakeLadder.includes(req.stake))
    return { ok: false, reason: 'not_on_the_ladder', bank };

  const smallest = Math.min(...ledger.rules.stakeLadder);
  if (bank.balance < smallest) return { ok: false, reason: 'bank_too_low', bank };

  // The stake leaves the bank on the call, not on the result, so the number on
  // the tile is what comes back rather than what you net.
  const stake = Math.min(req.stake, bank.balance);
  bank.balance -= stake;
  bank.delta = bank.balance - bank.start;

  const call: Call = {
    snapId: req.snapId,
    side: req.side,
    stake,
    p: req.p, // the price AT THE MOMENT OF THE CALL
    state: 'open',
    landed: null,
    delta: null,
  };
  ledger.pending = call;
  ledger.called.add(req.snapId);
  ledger.seq += 1;
  return { ok: true, call, bank, staked: stake };
}

/** The ball is snapped. The call can no longer be pulled; it can only settle. */
export function lock(ledger: Ledger, snapId: string): Call | null {
  const c = ledger.pending;
  if (!c || c.snapId !== snapId || c.state !== 'open') return null;
  c.state = 'locked';
  return c;
}

export type SettleResult =
  | { settled: false }
  | {
      settled: true;
      call: Call;
      snapId: string;
      landed: boolean | null;
      /** null when the snap was not a run or a pass. */
      outcome: CallSide | null;
      delta: number;
      returned: number;
      bank: Bank;
    };

/**
 * Settle the pending call against the play that resolved it.
 *
 * Only a run or a pass settles a call. A kick, a penalty, a timeout or the end
 * of a period is not the offense choosing anything, so the snap is void.
 *
 * DIVERGENCE FROM THE REFERENCE, DELIBERATE: `resolvePick` in server.py drops
 * the pick on a void play (`if(!was){PICK=null;return;}`) with the stake already
 * gone from the bank - so a penalty costs you Marbles on a snap that was never
 * yours to read. Here a void returns the stake and moves nothing else: no
 * record, no streak. Set `voidReturnsTheStake:false` for the reference's own
 * arithmetic. CONTRACT 5 has one void path and it means the play did not happen.
 */
export function settle(
  ledger: Ledger,
  snapId: string,
  resolvedBy: PlayType | { type: PlayType },
): SettleResult {
  const call = ledger.pending;
  if (!call || call.snapId !== snapId) return { settled: false };

  const type: PlayType =
    typeof resolvedBy === 'string' ? resolvedBy : resolvedBy && resolvedBy.type;
  const outcome: CallSide | null =
    type === 'run' || type === 'pass' ? type : null;
  const bank = ledger.bank;

  if (outcome == null) {
    const returned = ledger.rules.voidReturnsTheStake ? call.stake : 0;
    bank.balance += returned;
    bank.delta = bank.balance - bank.start;
    call.state = 'settled';
    call.landed = null;
    call.delta = returned - call.stake;
    ledger.pending = null;
    ledger.history.push(call);
    return {
      settled: true,
      call,
      snapId,
      landed: null,
      outcome: null,
      delta: call.delta,
      returned,
      bank,
    };
  }

  const landed = call.side === outcome;
  const returned = landed
    ? payoutFor(call.stake, call.p, ledger.rules.maxPayoutMultiple)
    : 0;
  bank.balance += returned;
  bank.delta = bank.balance - bank.start;
  if (landed) {
    bank.record.landed += 1;
    bank.streak = (bank.streak || 0) + 1;
  } else {
    bank.record.missed += 1;
    bank.streak = 0;
  }
  call.state = 'settled';
  call.landed = landed;
  call.delta = returned - call.stake;
  ledger.pending = null;
  ledger.history.push(call);
  return {
    settled: true,
    call,
    snapId,
    landed,
    outcome,
    delta: call.delta,
    returned,
    bank,
  };
}

/** The game ended, or the feed lost the snap, with a call still open. The
 *  stake comes back. A call that can never settle is not a loss. */
export function voidOpen(ledger: Ledger): SettleResult {
  const c = ledger.pending;
  if (!c) return { settled: false };
  const kept = ledger.rules.voidReturnsTheStake;
  ledger.rules = { ...ledger.rules, voidReturnsTheStake: true };
  const out = settle(ledger, c.snapId, 'other');
  ledger.rules = { ...ledger.rules, voidReturnsTheStake: kept };
  return out;
}

/** A copy, so a view cannot write to the bank by holding it. */
export function bankOf(ledger: Ledger): Bank {
  const b = ledger.bank;
  return {
    balance: b.balance,
    start: b.start,
    delta: b.balance - b.start,
    record: { landed: b.record.landed, missed: b.record.missed },
    streak: b.streak,
  };
}

/** The rows D1 keeps: `marble_ledger`, one per accepted call. `payout` is null
 *  until the snap settles. The unique index on (game, user, snap) is 7.4 held
 *  by the database as well as by the code above. */
export function toLedgerRows(ledger: Ledger): Array<{
  game_id: string;
  user_id: string;
  seq: number;
  snap_id: string;
  side: CallSide;
  stake: number;
  p: number;
  payout: number | null;
  balance_after: number;
}> {
  const rows = [];
  let running = ledger.bank.start;
  let seq = 0;
  const all = ledger.pending ? ledger.history.concat([ledger.pending]) : ledger.history;
  for (const c of all) {
    seq += 1;
    running -= c.stake;
    const back = c.state === 'settled' ? c.stake + (c.delta ?? 0) : null;
    if (back != null) running += back;
    rows.push({
      game_id: ledger.gameId,
      user_id: ledger.userId,
      seq,
      snap_id: c.snapId,
      side: c.side,
      stake: c.stake,
      p: c.p,
      payout: back,
      balance_after: running,
    });
  }
  return rows;
}
