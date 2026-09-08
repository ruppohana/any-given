/**
 * board.ts — THE LIVE BOARD.
 *
 * One game, one row per person, ranked on what they MADE from what they were
 * given. Not on the pile.
 *
 * A referral buys a deeper bench — more calls before the Marbles run out — and
 * it buys nothing at all in the standings, because a board that ranked on the
 * pile would put the hardest recruiter on top of something that is not
 * football. That is the whole reason `profit = balance - start` is the sort key
 * and `balance` is not. Ported from `sports-live/ncaalive/board.py`, whose
 * `game()` ranks `(-profit, calls, name)`.
 *
 * 🔴 THE POOL SCORE AND THE STAKE PROFIT NEVER SUM. A weekly pool score is
 * points; a per-game stake profit is Marbles. Nothing in this file reads,
 * writes, or produces a pool point — there is no `weekPoints`, no
 * `seasonPoints` and no `parlayPoints` on the row this module emits, and that
 * absence is deliberate. Filling a field named "points" with Marbles is exactly
 * how the two boards get added together by somebody downstream.
 *
 * 🔴 Nobody is eliminated. This module ranks; it never gates. A balance of zero
 * is a row on the board like any other, and the bank refills at the next game.
 *
 * 🔴 The balance is Marbles. Never credits.
 *
 * Pure. No I/O, no storage, no clock. The ledger arrives as an argument, which
 * is what lets a Durable Object recompute the whole board from its own log
 * after a restart, and what lets a test replay a real game through it.
 */

// ---------------------------------------------------------------------------
// The vocabulary — CONTRACT.md §6, restated here because this module may not
// import `src/lib/calls.ts` (M5 owns it) and the repo has no session-owned
// shared types file. See COULD NOT CLOSE.
// ---------------------------------------------------------------------------

export type CallSide = 'run' | 'pass';

/** CONTRACT.md §6 `Call`. */
export type Call = {
  snapId: string;
  side: CallSide;
  /** Marbles. */
  stake: number;
  /** The price AT THE MOMENT OF THE CALL. */
  p: number;
  state: 'open' | 'locked' | 'settled';
  landed: boolean | null;
  /** + payout - stake, or - stake. Null until settled. */
  delta: number | null;
};

/** CONTRACT.md §6 `Bank`. */
export type Bank = {
  balance: number;
  start: number;
  /** balance - start. THE LIVE BOARD RANKS ON THIS. */
  delta: number;
  record: { landed: number; missed: number };
  streak: number;
};

/**
 * One row of the ledger: a call, plus who made it.
 *
 * CONTRACT.md §6 `Call` carries no `userId` — on the wire it does not need one,
 * because §8 `call` is client → DO and the DO knows the user from the socket.
 * A board is the one place that has to attribute a call, so the ledger row is
 * a `Call` with the owner attached.
 */
export type LedgerEntry = Call & { userId: string };

/**
 * Somebody in this game. `start` is their bank at kickoff — 100, plus whatever
 * referrals bought them. Supply `start` directly, or `referrals` and let
 * `startFor` do it.
 */
export type BoardMember = {
  userId: string;
  displayName: string;
  start?: number;
  referrals?: number;
};

/**
 * One row of the LIVE board.
 *
 * Shares its identity and placement fields with CONTRACT.md §6 `StandingsRow`
 * — `rank`, `userId`, `displayName`, `movement`, `isSelf` — so one row
 * component can draw either board. It deliberately does NOT carry
 * `weekPoints`, `seasonPoints` or `parlayPoints`: those are pool points, this
 * board is Marbles, and the two never sum. See COULD NOT CLOSE.
 */
export type LiveStandingsRow = {
  rank: number;
  userId: string;
  displayName: string;
  /** Marbles in hand: start + settled deltas - Marbles still on the table. */
  balance: number;
  /** The bank at kickoff. Differs between people; referrals move it. */
  start: number;
  /** 🔴 balance - start. THE SORT KEY. */
  profit: number;
  /** Stakes riding on calls that have not settled. Already out of `balance`. */
  committed: number;
  /** How many calls it took. The first tiebreak: fewer is better. */
  calls: number;
  landed: number;
  missed: number;
  /** Settled, voided calls. Stake returned. Neither landed nor missed. */
  voided: number;
  /** + n landed in a row, - n missed in a row, 0 for neither. */
  streak: number;
  /** + up, - down. 0 when no previous board was supplied. Fixed scale. */
  movement: number;
  isSelf: boolean;
};

export type BoardOptions = {
  /** Marks the row that is also pinned above the table. */
  selfUserId?: string | null;
  /** userId -> the rank they held on the last board. Drives `movement`. */
  previousRanks?: Record<string, number> | null;
  /** Rows returned. The reference caps at 50. */
  limit?: number;
};

// ---------------------------------------------------------------------------
// The constants that are not settings
// ---------------------------------------------------------------------------

/**
 * Everyone starts a game on the same number, and the number is not a setting.
 * A board where two people played different games is not a board.
 * `sports-live/ncaalive/board.py`: START_CREDITS = 100.
 */
export const START_MARBLES = 100;

/** Per friend. Buys bench, never position. */
export const REFERRAL_BONUS = 20;

/** So the deepest bench is 200, not unbounded. */
export const REFERRAL_CAP = 5;

/** "Top five" on a board of four is everybody. */
export const MIN_FIELD_FOR_PLACING = 8;

const MAX_MARBLES = 100000;
const MAX_CALLS = 10000;

/** `sports-live/ncaalive/board.py` NAME_RE, character for character. */
const NAME_RE = /^[A-Za-z0-9 ._'\-]{1,24}$/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampInt(n: unknown, lo: number, hi: number): number {
  const v = Math.trunc(Number(n));
  if (!Number.isFinite(v)) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

/** The bank a player opens a game with, given how many friends joined. */
export function startFor(referrals: number | null | undefined): number {
  const n = clampInt(referrals ?? 0, 0, REFERRAL_CAP);
  return START_MARBLES + REFERRAL_BONUS * n;
}

/**
 * A name somebody typed, or null. Whitespace collapses rather than rejecting —
 * a pasted name with a newline in it is a name, not an attack.
 */
export function cleanName(name: unknown): string | null {
  const s = String(name ?? '').trim().replace(/\s+/g, ' ');
  return NAME_RE.test(s) ? s : null;
}

/** Ledger order, filtered to one person. Order matters: the streak reads it. */
function entriesFor(userId: string, ledger: readonly LedgerEntry[]): LedgerEntry[] {
  return ledger.filter((e) => e && e.userId === userId);
}

// ---------------------------------------------------------------------------
// The bank
// ---------------------------------------------------------------------------

/**
 * One person's bank in one game, computed from their calls.
 *
 * A stake leaves the bank when the call is made and comes back inside the
 * settlement, so:
 *
 *     balance = start + Σ delta (settled) - Σ stake (open | locked)
 *
 * That is the number you may stake against, and it is why an unsettled call
 * shows as Marbles you no longer have: they are on the table. `delta` is
 * already net of the stake per CONTRACT §6, so nothing is counted twice.
 *
 * A settled call with `landed === null` is VOID — the play did not happen, for
 * everybody. Its stake comes back, it counts as neither landed nor missed, and
 * it does not break a streak.
 */
export function bankFor(
  userId: string,
  ledger: readonly LedgerEntry[],
  start: number = START_MARBLES,
): Bank {
  const st = clampInt(start, 1, MAX_MARBLES);
  const mine = entriesFor(userId, ledger);

  let realized = 0;
  let committed = 0;
  let landed = 0;
  let missed = 0;

  for (const e of mine) {
    if (e.state === 'settled') {
      realized += Number(e.delta ?? 0) || 0;
      if (e.landed === true) landed += 1;
      else if (e.landed === false) missed += 1;
    } else {
      committed += clampInt(e.stake, 0, MAX_MARBLES);
    }
  }

  const balance = clampInt(st + realized - committed, 0, MAX_MARBLES);

  return {
    balance,
    start: st,
    delta: balance - st,
    record: { landed, missed },
    streak: streakOf(mine),
  };
}

/**
 * The run at the tail of the ledger: + n landed in a row, - n missed in a row.
 *
 * The reference is in two minds about this and the renderer is the half that is
 * right. `server.py:2506` does `b.streak = won ? (b.streak||0)+1 : 0`, which can
 * never go negative — and `server.py:3059-3060` renders `st < -1` as
 * "N off the pace". A negative streak is drawn by a UI that the scorer cannot
 * produce. Signed here, so the strip has something to draw. Flagged as the one
 * deliberate divergence from the reference.
 */
function streakOf(mine: readonly LedgerEntry[]): number {
  let run = 0;
  for (let i = mine.length - 1; i >= 0; i--) {
    const e = mine[i];
    if (e.state !== 'settled') continue;
    if (e.landed === null || e.landed === undefined) continue; // void: no break
    const won = e.landed === true;
    if (run === 0) run = won ? 1 : -1;
    else if (won && run > 0) run += 1;
    else if (!won && run < 0) run -= 1;
    else break;
  }
  return run;
}

// ---------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------

/**
 * One game's board: most MADE, then fewest calls to make it, then by name.
 *
 * `board.py:165` — `rows.sort(key=lambda r: (-profit, calls, name))`. The name
 * comparison is by code point, not by locale: `localeCompare` folds case and
 * would order a board differently from the reference on the same input.
 * `userId` is the final tiebreak so the order is total; the reference cannot
 * reach it, because one name is one row per game there.
 */
export function computeBoard(
  members: readonly BoardMember[],
  ledger: readonly LedgerEntry[],
  opts: BoardOptions = {},
): LiveStandingsRow[] {
  const selfUserId = opts.selfUserId ?? null;
  const previousRanks = opts.previousRanks ?? null;
  const limit = opts.limit == null ? 50 : clampInt(opts.limit, 0, MAX_MARBLES);

  const rows = members.map((m) => {
    const start = m.start != null ? clampInt(m.start, 1, MAX_MARBLES) : startFor(m.referrals);
    const bank = bankFor(m.userId, ledger, start);
    const mine = entriesFor(m.userId, ledger);
    const voided = mine.filter((e) => e.state === 'settled' && (e.landed === null || e.landed === undefined)).length;
    const committed = mine.reduce(
      (a, e) => (e.state === 'settled' ? a : a + clampInt(e.stake, 0, MAX_MARBLES)),
      0,
    );

    return {
      rank: 0,
      userId: m.userId,
      displayName: cleanName(m.displayName) ?? m.displayName,
      balance: bank.balance,
      start: bank.start,
      profit: bank.delta,
      committed,
      calls: clampInt(mine.length, 0, MAX_CALLS),
      landed: bank.record.landed,
      missed: bank.record.missed,
      voided,
      streak: bank.streak,
      movement: 0,
      isSelf: selfUserId != null && m.userId === selfUserId,
    } satisfies LiveStandingsRow;
  });

  rows.sort((a, b) => {
    if (a.profit !== b.profit) return b.profit - a.profit;
    if (a.calls !== b.calls) return a.calls - b.calls;
    if (a.displayName !== b.displayName) return a.displayName < b.displayName ? -1 : 1;
    return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
  });

  rows.forEach((r, i) => {
    r.rank = i + 1;
    const was = previousRanks ? previousRanks[r.userId] : undefined;
    r.movement = typeof was === 'number' && Number.isFinite(was) ? was - r.rank : 0;
  });

  return rows.slice(0, limit);
}

/** How many people played this game. A placing needs a field. */
export function field(rows: readonly LiveStandingsRow[]): number {
  return rows.length;
}

/** Whether a placing badge means anything yet. Eight, per the reference. */
export function canPlace(rows: readonly LiveStandingsRow[]): boolean {
  return field(rows) >= MIN_FIELD_FOR_PLACING;
}
