/* Number and time formatting. EVERY NUMBER IN THIS APP IS TABULAR - a figure that
 * reflows as it ticks is a figure nobody trusts. The .num class in tokens.css does
 * the font work; this file does the value work. */

export function n(v) { return v == null ? '\u2014' : String(v); }

/** A dash is not a zero. Office Pool distinguishes them and it is right to:
 *  'no games yet' and '0 games' are different facts. */
export function dash(v) { return (v == null || v === '') ? '\u2014' : String(v); }

/** Signed delta, for --up / --down. FIXED SCALE, never team color. */
export function signed(v) {
  if (v == null) return '\u2014';
  return (v > 0 ? '+' : v < 0 ? '\u2212' : '') + Math.abs(v);
}
export function signClass(v) { return v > 0 ? 'up' : v < 0 ? 'down' : ''; }

/** A price, as it appears ON THE TILE, BEFORE THE TAP.
 *  payout = 1/p, capped at 6. The cap is settled and is not a display choice. */
export function payoutLabel(p, cap) {
  if (cap === undefined) cap = 6;
  if (!p || p <= 0) return '\u2014';
  const x = Math.min(1 / p, cap);
  return x.toFixed(2).replace(/\.00$/, '') + '\u00d7';
}

/** The pool's own crowd split. 🔴 NOBODY SEES ANYTHING UNTIL THE GAME LOCKS.
 *
 * Jason, 2026-09-08: "Nobody sees anything until after the lock." This replaces
 * the after-you-pick rule from earlier the same day, and it is simpler in the
 * way that matters - it removes the leak instead of thresholding it.
 *
 * The old rule needed a floor at n=5 and a lone-dissenter rule, because a
 * percentage among four people names them, and both numbers were guesses at
 * where identification begins. After kickoff there is nothing left to protect:
 * the picks are locked, the game is running, and knowing who took which side
 * changes nothing anybody can do about it.
 *
 * It also closes a hole nobody had named: under the old rule the split was
 * PURCHASABLE WITH A TAP - pick the game, read the number, change your pick.
 *
 * The floors are kept and never fire after a lock. They exist for a screen that
 * chooses to show a split before kickoff, which nothing does today.
 *
 * Returns null for "show nothing" - not a dash, so a screen can tell "no number
 * yet" from "there will never be one" if it needs to. */
export function crowdLabel(share, n, gameHasLocked, minN) {
  if (minN === undefined) minN = 5;
  if (!gameHasLocked) return null;
  if (share == null || !n) return null;
  if (n < minN) return null;
  const taken = Math.round(share * n);
  if (Math.min(taken, n - taken) === 1) return null;
  return Math.round(share * 100) + '%';
}

/** Why the crowd figure is absent. `not_locked` is the common answer and it is
 *  the one a screen may safely say out loud - it names no person. */
export function crowdSuppression(share, n, gameHasLocked, minN) {
  if (minN === undefined) minN = 5;
  if (!gameHasLocked) return 'not_locked';
  if (share == null || !n) return 'no_data';
  if (n < minN) return 'small_n';
  const taken = Math.round(share * n);
  if (Math.min(taken, n - taken) === 1) return 'lone_dissenter';
  return null;
}

/** Kickoff, local. A pick is editable until THIS moment and locks at it. */
export function kickoff(ms) {
  const d = new Date(ms);
  return d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** The snap clock. mm:ss, monospaced by tabular-nums, never reflowing. */
export function clock(seconds) {
  if (seconds == null) return '\u2014';
  const s = Math.max(0, Math.round(seconds));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

/** n of m picked - the progress element. Office Pool ships '0 of 131 picked - 0%'
 *  and CBS ships '0/15 Picks'; POOL-SCREENS P2 asks for it and never specified it. */
export function progress(made, total) {
  if (!total) return '\u2014';
  return `${made} of ${total} picked \u00b7 ${Math.round((made / total) * 100)}%`;
}
