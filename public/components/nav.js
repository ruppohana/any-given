/* S1 - NAVIGATION. Session-owned, and it was UNSPECCED WITH NO BAR: nothing in
 * the project described how the pool and the live board coexist in one shell.
 * A shell invented three times by three sub-agents is the fan-out failure this
 * whole apparatus exists to prevent, so it is decided here, once.
 *
 * THE PROBLEM, as DESIGN-BRIEF section 4 states it: the live layer ships three
 * tabs today - now, game, board - and THE POOL IS A FOURTH DESTINATION NOTHING
 * PLACES. And there are TWO COLD STARTS, not one: a stranger opening an invite
 * link, and a returning user opening the icon on Saturday. They want different
 * first screens.
 *
 * THE DECISION.
 *
 * 1. FOUR DESTINATIONS, not three tabs plus an orphan: Slate, Picks, Standings,
 *    Live. The first three are the pool - the half that leads, because it is the
 *    only invite loop this product has. Live is the whole live layer behind one
 *    door, with its own now/game/board strip inside.
 *
 * 2. THE POOL IS ALWAYS REACHABLE AND THE LIVE LAYER IS NOT ALWAYS PRESENT.
 *    A football app is dead six months a year and the live tab has nothing in it
 *    for most of a week. It renders as UNAVAILABLE with a reason, never hidden -
 *    a destination that disappears reads as a broken build.
 *
 * 3. THE TWO COLD STARTS RESOLVE BY ORIGIN, NOT BY GUESS:
 *      an invite link          -> Slate. Always. NOTHING SITS IN FRONT OF IT.
 *      the icon, game live     -> Live
 *      the icon, no game live  -> Slate
 *    A stranger who followed a link is here for the pool they were invited to,
 *    and asking them anything first is the thing this product is defined against.
 *
 * 4. TABS ARE LINKS, AND EVERY DESTINATION HAS A URL. The invite link IS the
 *    distribution strategy, so a pool, a week, a game and a standings view each
 *    need an address that survives being pasted into a group text. sports-live
 *    was one page and had none of this.
 */

export const DESTINATIONS = [
  { id: 'slate',     label: 'Slate',     href: '/p/:pool/week/:week' },
  { id: 'picks',     label: 'Picks',     href: '/p/:pool/me' },
  { id: 'standings', label: 'Standings', href: '/p/:pool/standings' },
  { id: 'live',      label: 'Live',      href: '/live/:game' }
];

/** Which destination a cold open lands on. Origin decides, never a guess. */
export function coldStart(ctx) {
  ctx = ctx || {};
  if (ctx.fromInvite) return 'slate';
  if (ctx.liveGameId) return 'live';
  return 'slate';
}

export function navBar(active, opts) {
  opts = opts || {};
  const nav = document.createElement('nav');
  nav.className = 'ag-nav';
  nav.setAttribute('aria-label', 'Main');

  for (const d of DESTINATIONS) {
    const a = document.createElement('a');
    a.className = 'ag-nav-item';
    a.dataset.dest = d.id;
    a.href = opts.hrefFor ? opts.hrefFor(d) : '#' + d.id;
    a.textContent = d.label;
    if (d.id === active) a.setAttribute('aria-current', 'page');
    /* Unavailable, never hidden. A tab that vanishes reads as a broken build. */
    if (d.id === 'live' && !opts.liveAvailable) {
      a.setAttribute('aria-disabled', 'true');
      a.dataset.unavailable = 'true';
      a.title = opts.liveReason || 'No game in progress';
    }
    nav.appendChild(a);
  }
  return nav;
}

export const NAV_CSS = [
  /* Bottom bar on a phone, because one-handed at night is the design case. */
  '.ag-nav { position: sticky; bottom: 0; z-index: 10; display: grid;',
  '  grid-template-columns: repeat(4, 1fr); background: var(--card);',
  '  border-top: 1px solid var(--line); padding-bottom: env(safe-area-inset-bottom, 0); }',
  '.ag-nav-item { display: flex; align-items: center; justify-content: center;',
  '  min-height: var(--tap-min); font-size: var(--t-micro); font-weight: 600;',
  '  text-decoration: none; color: var(--dim); }',
  '.ag-nav-item[aria-current="page"] { color: var(--accent); box-shadow: none;',
  '  border-top: 2px solid var(--accent); margin-top: -1px; }',
  '.ag-nav-item[data-unavailable="true"] { color: var(--dim); opacity: .45; pointer-events: none; }',
  /* S5: on a real window the bar moves to the side. Desktop is a SECOND LAYOUT,
   * not a variant - see shell.css. */
  '@media (min-width: 900px) {',
  '  .ag-nav { position: static; grid-template-columns: 1fr; align-content: start;',
  '    border-top: 0; border-right: 1px solid var(--line); height: 100%; padding: 12px 0; }',
  '  .ag-nav-item { justify-content: flex-start; padding: 0 16px; font-size: var(--t-body); }',
  '  .ag-nav-item[aria-current="page"] { border-top: 0; border-left: 2px solid var(--accent); margin-top: 0; }',
  '}'
].join('\n');
