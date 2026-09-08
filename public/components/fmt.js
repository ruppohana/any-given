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

/** The pool's own crowd split. NEVER shown before the pick.
 *  Small-n: in a pool of four, 75% is three people and it identifies them. */
export function crowdLabel(share, n, threshold) {
  if (threshold === undefined) threshold = 8;
  if (share == null || !n) return '\u2014';
  if (n < threshold) return `${Math.round(share * n)} of ${n}`;
  return Math.round(share * 100) + '%';
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
