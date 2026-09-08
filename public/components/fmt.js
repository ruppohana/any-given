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
 *
 * SUPPRESS. DO NOT FALL BACK TO A COUNT. This returned "2 of 3" below n=8, and
 * P2 put that on screen, where it names two people by arithmetic. src/lib/pool.ts
 * had already reasoned it the other way and it is right: A COUNT IS MORE PRECISE
 * THAN A PERCENTAGE, so it fails the identification test harder, not softer.
 * Two files, one rule, and the screen consumed the wrong one.
 *
 *   n < 5                 -> null. Every percentage is a named handful
 *   minority is exactly 1 -> null. One dissenter is identified by arithmetic at
 *                            ANY pool size - "94% took Oregon" among seventeen
 *                            people is a public accusation
 *   minority is 0         -> shown. Unanimous names nobody
 *
 * Returns null rather than a dash, so a screen can tell "no number yet" from
 * "we are not going to tell you" and say which. */
export function crowdLabel(share, n, minN) {
  if (minN === undefined) minN = 5;
  if (share == null || !n) return null;
  if (n < minN) return null;
  const taken = Math.round(share * n);
  if (Math.min(taken, n - taken) === 1) return null;
  return Math.round(share * 100) + '%';
}

/** Why the crowd figure is absent, so a screen can say which. */
export function crowdSuppression(share, n, picked, minN) {
  if (minN === undefined) minN = 5;
  if (!picked) return 'not_picked';
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
