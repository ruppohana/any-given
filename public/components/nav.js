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
  /* 🔴 HOME IS FIRST AND IT IS THE GAME. Jason, 2026-09-08: "the bottom nav bar
   * should have 'home' or something to start." The bar opened on Slate — a
   * pool's week — which is the front door of the POOL rather than of the app,
   * and left somebody who had wandered off with no obvious way back to the thing
   * they came for. */
  { id: 'home',      label: 'Home',      href: '/live/:game' },
  { id: 'slate',     label: 'Slate',     href: '/p/:pool/week/:week' },
  /* 🔴 FOUR, NOT FIVE. Home and Live both led to the live game once Home was
   * added, so the bar carried a duplicate AND wrapped to two rows at 375px —
   * "Live" alone on a second line under the other four. Home IS the game; the
   * separate Live tab is what Home replaced. */
  /* 🔴 "My picks", not "Picks". Jason, 2026-09-09 - he asked for the rename and
   * then corrected my "Your picks" to "My picks" in the next message.
   *
   * It is not decoration. Slate and this tab both list games, and the one-word
   * label made them read as two views of the same list - which is exactly the
   * confusion that produced "What is the difference between slate and picks?".
   * The possessive is the whole answer in one word: that one is the week,
   * this one is MINE.
   *
   * First person because the app is speaking as the person using it, the way
   * every other label here does. "Your picks" is the app talking ABOUT them. */
  { id: 'picks',     label: 'My picks',  href: '/p/:pool/me' },
  { id: 'standings', label: 'Standings', href: '/p/:pool/standings' },
];

/** Which destination a cold open lands on. Origin decides, never a guess. */
export function coldStart(ctx) {
  ctx = ctx || {};
  if (ctx.fromInvite) return 'slate';
  if (ctx.liveGameId) return 'live';
  return 'slate';
}

/* 🔴 ICONS, AND THEY ARE DRAWN HERE RATHER THAN FETCHED. Jason, 2026-09-09:
 * "Big pic. Icons."
 *
 * Every reference he picked leads with an icon in the nav - Deuce and the
 * finance dashboards both - and ours was four words. On a floating pill at
 * 375px, four 11px words is the least legible thing on the screen and the one
 * element that is always present.
 *
 * 🔴 INLINE SVG, NO ICON FONT, NO THIRD PARTY. That is a standing constraint in
 * DESIGN.md and it is not fussiness: an icon font is a network request that can
 * fail, and the one element whose job is to be reliably there is the navigation.
 * These are four paths, drawn on the same 24 grid, at the same 1.9 stroke, so
 * they read as one family rather than four borrowed glyphs.
 *
 * 🔴 CONSISTENCY IS THE POINT - Jason said so twice today. Same grid, same
 * stroke, same cap, same corner radius, and every one is an OUTLINE: a filled
 * icon among outlined ones reads as selected even when it is not, which is
 * exactly the signal the pill is already carrying. */
const NAV_PATHS = {
  /* A house. Home is the front door, so it is literally a door. */
  home: 'M3.5 10.5 12 4l8.5 6.5V19a1 1 0 0 1-1 1h-5v-5h-5v5h-5a1 1 0 0 1-1-1z',
  /* A calendar: the week, which is what a slate is. */
  slate: 'M4 7a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 10h16M8 4v4M16 4v4',
  /* A ticket with a check - your card, and the things on it that landed. */
  picks: 'M4 8a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2a2 2 0 0 0 0 4v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a2 2 0 0 0 0-4zM9.5 12.5l1.8 1.8 3.2-3.6',
  /* Three bars of different heights. A leaderboard, not a chart. */
  standings: 'M6 20v-6M12 20V6M18 20v-9',
  /* A ball, tilted, for the live game - the same shape as the header mark so
   * the two places the app draws a football agree. */
  live: 'M3.4 12C6.6 7 17.4 7 20.6 12 17.4 17 6.6 17 3.4 12Z'
};

function navIcon(id) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('class', 'ag-nav-ico');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', NAV_PATHS[id] || NAV_PATHS.home);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.9');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  if (id === 'live') path.setAttribute('transform', 'rotate(-32 12 12)');
  svg.appendChild(path);
  return svg;
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
    a.appendChild(navIcon(d.id));
    a.appendChild(document.createElement('span')).textContent = d.label;
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
  /* 🔴 A FLOATING PILL, WHICH IS THE MOST RECOGNISABLE THING ABOUT DEUCE. Jason
     picked that system on 2026-09-09. Its nav is not a bar welded to the bottom
     edge - it is a rounded white pill lifted off the ground with a margin all
     round, and the current tab is a FILLED pill inside it rather than a colored
     word under a 2px rule.

     Why the filled pill is the better signal here and not just the fashionable
     one: at 375px the four labels are 11px, and a 2px underline on 11px type is
     a hairline under a whisper. A filled shape is legible at a glance in a dark
     room at arm's length, which is the actual design case for this bar.

     🔴 IT STILL RESERVES ITS OWN SPACE. `position: sticky` keeps it in the flow,
     so content scrolls to a natural end above it rather than under it - the ad
     doctrine's rule about a slot that overlays content, applied to the nav. */
  '.ag-nav { position: sticky; bottom: 0; z-index: 10; display: grid;',
  '  grid-template-columns: repeat(4, 1fr); gap: 2px;',
  '  background: var(--card); border: 1px solid var(--line);',
  '  border-radius: var(--radius-pill); box-shadow: var(--lift);',
  '  margin: 6px 10px calc(6px + env(safe-area-inset-bottom, 0px)); padding: 4px; }',
  '.ag-nav-item { display: flex; flex-direction: column; align-items: center;',
  '  justify-content: center; gap: 2px; min-height: var(--tap-min);',
  '  font-size: 10px; font-weight: 700; border-radius: var(--radius-pill);',
  '  text-decoration: none; color: var(--dim); }',
  '.ag-nav-ico { display: block; }',
  /* The filled pill. Accent ground, page color on top - never accent-on-white,
     which at 11px is the same whisper the underline was. */
  '.ag-nav-item[aria-current="page"] { color: var(--on-accent); background: var(--accent);',
  '  box-shadow: none; border-top: 0; margin-top: 0; }',
  '.ag-nav-item[data-unavailable="true"] { color: var(--dim); opacity: .45; pointer-events: none; }',
  /* S5: on a real window the bar moves to the side. Desktop is a SECOND LAYOUT,
   * not a variant - see shell.css. */
  '@media (min-width: 900px) {',
  '  .ag-nav { position: static; grid-template-columns: 1fr; align-content: start;',
  '    border: 0; border-right: 1px solid var(--line); border-radius: 0;',
  '    box-shadow: none; margin: 0; height: 100%; padding: 12px 0; }',
  '  .ag-nav-item { flex-direction: row; justify-content: flex-start; gap: 10px;',
  '    padding: 0 16px; font-size: var(--t-body); }',
  '  .ag-nav-item[aria-current="page"] { background: none; color: var(--accent);',
  '    border-radius: 0; border-left: 2px solid var(--accent); }',
  '}'
].join('\n');
