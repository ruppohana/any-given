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
  /* 🔴 FIVE NOW, AND LIVE IS BACK. Jason, 2026-09-10: "Let's add a live button
   * to the bottom nav. Have it go directly to the last live game you had up."
   *
   * The "four, not five" note below was right when it was written and both of
   * its reasons have since gone: the bar showed WORDS, and five of them wrapped
   * to two rows at 375px - the words are gone, and five 24px icons fit the
   * pill with room to spare. And Home WAS the game, so Live duplicated it -
   * Home is now the front door with three doors, and getting back to the game
   * you were watching took three taps. This is one. */
  { id: 'live',      label: 'Live',      href: '/live/:game' },
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
  /* 🔴 A CLAPPERBOARD - A SLATE. Jason, 2026-09-10: "slate icon, make the same
   * style", sending a page of film slates. The calendar said "the week", which
   * is true and generic; the clapperboard is the word itself, and it reads at
   * 24px because the tilted clapper is a shape nothing else in the bar has.
   * Outline, 1.9 stroke, round caps, same grid - the family rule holds. Path
   * adapted from Lucide's "clapperboard" (ISC license), relative moves made
   * absolute so it concatenates into one path. */
  slate: 'M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3ZM6.2 5.3l3.1 3.9M12.4 3.4l3.1 4M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z',
  /* A ticket with a check - your card, and the things on it that landed. */
  picks: 'M4 8a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2a2 2 0 0 0 0 4v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a2 2 0 0 0 0-4zM9.5 12.5l1.8 1.8 3.2-3.6',
  /* Three bars of different heights. A leaderboard, not a chart. */
  standings: 'M6 20v-6M12 20V6M18 20v-9',
  /* 🔴 A BROADCAST, NOT A BALL. Jason, 2026-09-10, sending the picture:
   * "live icon" - a dot with arcs radiating either side. The tilted football
   * said "football", which every tab in this app already is; the arcs say ON
   * AIR, which is the one thing this tab has that the others do not. Two arcs
   * a side, not his three: at 24px the third merges into the second. The dot
   * is drawn separately in navIcon, filled and red. */
  live: 'M8.6 8.6a4.8 4.8 0 0 0 0 6.8M15.4 8.6a4.8 4.8 0 0 1 0 6.8M5.7 5.7a8.9 8.9 0 0 0 0 12.6M18.3 5.7a8.9 8.9 0 0 1 0 12.6'
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
  svg.appendChild(path);
  /* The on-air dot, in the bar's own color. It was red for one deploy and
     Jason: "make the all the same style, so, not red." One family - a mark
     that is always red competes with the filled pill for which tab is lit. */
  if (id === 'live') {
    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('cx', '12'); dot.setAttribute('cy', '12'); dot.setAttribute('r', '2.3');
    dot.setAttribute('fill', 'currentColor');
    svg.appendChild(dot);
  }
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
    /* 🔴 THE LABEL BECOMES THE ACCESSIBLE NAME, NOT VISIBLE TEXT. Jason,
     * 2026-09-09: "remove the words under the icons."
     *
     * The word is still on the element - it has to be, because an icon-only
     * control with no accessible name is a button that reads out as "link" to a
     * screen reader, and the navigation is the last place in an app where that
     * is acceptable. So the span stays in the DOM and CSS hides it on the pill,
     * where four 10px words were the least legible thing on the screen, and
     * shows it again on the desktop rail, where a sidebar with room for words
     * should use them. */
    a.setAttribute('aria-label', d.label);
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

     🔴 IT FLOATS OVER THE PAGE, AND IT STILL RESERVES ITS SPACE. Jason,
     2026-09-09: "Can the bottom nav bar look like it floats over the bottom of
     the page beneath."

     It was `position: sticky`, which keeps the pill in the document flow - so
     the page ENDED at the top of the bar and nothing ever passed behind it. A
     pill with a shadow sitting on a hard edge does not read as floating; it
     reads as welded, which is what his screenshot shows. What makes something
     look like it is above a page is seeing the page continue underneath it.

     🔴 SO IT GOES FIXED, AND THE SPACE IT USED TO OCCUPY IS GIVEN BACK AS
     PADDING - see --nav-space in shell.css. That distinction is the whole
     doctrine: an element may overlay content, but it may never make content
     unreachable. Fixed alone would leave the last card of the week sitting
     permanently under the bar with no way to scroll it clear, which is the ad
     rule broken by the navigation itself.

     The scrim below does the rest: content dissolves into the ground as it
     passes under the pill instead of being cut by its edge. */
  '.ag-nav { position: fixed; left: 0; right: 0; bottom: 0; z-index: 30; display: grid;',
  '  grid-template-columns: repeat(5, 1fr); gap: 2px;',
  /* 🔴 TRANSLUCENT, WITH THE OPAQUE VERSION AS THE FLOOR. Jason, 2026-09-10:
     "Can the nav bar be transparent to some extent?" - asked one message after
     the scrim stopped painting a grey plinth under it, and the two are the same
     idea arriving twice: a bar only reads as floating if the page is visibly
     behind it.

     🔴 THE DECLARATION ORDER IS LOAD-BEARING. `var(--card)` stays as the plain
     background and the translucent version is applied only inside @supports.
     Without a working backdrop-filter, 70% white over a moving scoreboard is
     not "subtle", it is unreadable - the icons sit on whatever colour happens
     to be passing underneath. The blur is what makes transparency legible, so
     transparency is not applied unless the blur is.

     Safari needs the -webkit- prefix on iOS and it is where this will mostly be
     seen, so both the query and the property are doubled. */
  '  background: var(--card); border: 1px solid var(--line);',
  /* 🔴 A LIGHT RING AS WELL AS THE LIFT. Jason: "Add an outline. Light."
     The 1px hairline is there and it is not enough on its own: a white capsule
     on #ebebeb differs from its ground by 20 values, and a 0.67px device pixel
     of #e0e0e0 between them disappears. A 1px spread shadow draws the whole
     capsule edge - corners included, at the exact radius, with no rounding
     mismatch a border can have - and being a shadow it stays LIGHT: it is 5%
     black over the ground rather than a drawn line competing with the icons. */
  '  border-radius: var(--radius-nav);',
  '  box-shadow: 0 0 0 1px rgba(16, 20, 16, .05), var(--float);',
  '  width: min(560px, calc(100% - 20px)); margin-inline: auto;',
  /* 🔴 15px HIGHER. Jason: "Move the tool bar up 15 pix." It sat 8px off the
     bottom edge, which on a phone with a home indicator put it right on top of
     the indicator's own strip - two floating things competing for the same band.
     23px clears it and lets the scrim do its work underneath. */
  /* 🔴 ONE TOKEN, AND THE FADE IS INDEPENDENT OF IT. Jason: "Can I move the nav
     bar down without losing the transparency?" Yes - the scrim is its own fixed
     element (see body::after below), anchored to the bottom of the VIEWPORT
     rather than to the pill, so the bar can sit anywhere in that band and the
     gradient behind it does not move or change. Back when the scrim was a
     ::before on the nav those two were welded together and this question would
     have had a different answer. */
  '  margin-bottom: calc(var(--nav-lift) + env(safe-area-inset-bottom, 0px)); padding: 4px; }',
  /* Icons only on the pill. They grow, because they are now carrying the whole
     meaning of the control rather than sharing it with a word. */
  '.ag-nav-item > span { position: absolute; width: 1px; height: 1px; padding: 0;',
  '  margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }',
  /* 🔴 A 2px OPTICAL NUDGE, NOT A LAYOUT FIX. Jason: "Center the icons
     vertically in the nav bar. They look 3-5 pix higher."
     Measured, the box is centred exactly - 10px above the icon, 10px below, in a
     44px item. So this is not a centring bug and moving the BOX would break the
     tap target. What is off is the ink: these glyphs are drawn on a 24 grid whose
     strokes sit high in it (the house peaks at y=4, the bars end at y=20), so
     their optical centre is above their geometric one. Type has the same problem
     and the same answer - trust the eye over the box, and move the mark, not the
     frame. */
  '.ag-nav-ico { width: 24px; height: 24px; transform: translateY(2px); }',
  /* The active pill keeps its own centring - the nudge is on the mark inside. */
  '.ag-nav-item { position: relative; }',
  /* 🔴 BLUR 10, NOT 18. Jason, 2026-09-10: "I don't see the transparency's.
     Change the blur to 10 pix."
     18px was smearing everything behind the bar into one flat tone, which is
     the failure mode of a heavy blur: it is doing a great deal of work to
     produce something indistinguishable from opaque paint. 10px still hides
     text but leaves a logo's shape and colour readable as a shape, which is
     the only thing that says "there is a page under here".

     🔴 AND THE OPACITY CAME DOWN WITH IT, because the blur was never the
     reason he could not see it. 70% of --card is 70% WHITE, and in his
     screenshot the thing behind the bar is a white game card - no opacity
     makes white over white visible. The effect only ever exists where
     something that is NOT the card colour passes under the bar: a mark, a
     score, the grey ground between cards. 62% is as far as this can go before
     a grey icon starts to lose its footing on a dark team colour sliding
     underneath it. */
  '@supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {',
  /* 🔴 45%, NOT 62%. Jason, once the scrim came off: "Worked, make it more
     transparent." 62% was chosen while the bar was still looking at a wall,
     so it was never a judgement about how much page to show - it was the
     largest number that made no difference. With a real backdrop behind it,
     45% is where a mark under the bar reads as that mark rather than as a
     smudge, and the icons still hold: they are drawn on --dim over a 45%
     wash of --card, which stays above 3:1 against every team colour in the
     file because the wash never fully clears. */
  '  .ag-nav { background: color-mix(in srgb, var(--card) 45%, transparent);',
  '    -webkit-backdrop-filter: blur(10px) saturate(1.6);',
  '    backdrop-filter: blur(10px) saturate(1.6); }',
  /* 🔴 AND THE SCRIM COMES OFF, BECAUSE IT WAS THE THING BEING SEEN THROUGH.
     Jason, twice: "I don't see the transparency's", then "You tell me."

     Three values were rendered on the deployed slate - 62%, 45%, 30% - and
     they were indistinguishable. The computed style was correct at every one
     of them (background `color(srgb 1 1 1 / 0.3)`, backdrop-filter
     `blur(10px) saturate(1.6)`), which ruled out the CSS not applying and left
     only the question of what was behind the glass. Measured:

       scrim        y 708 -> 800
       fully --bg   y 774
       pill         y 747 -> 800

     The scrim is a fixed sibling at z-index 29 and the pill is 30, so the
     pill's backdrop samples THE SCRIM, not the page - and the lower half of
     the pill sits over the part of the scrim that has already reached flat
     #ebebeb. The bar was a window onto a wall. Lowering its opacity revealed
     more wall, which is why 30% looked like 62%.

     🔴 THE BLUR IS THE SCRIM NOW, AND IT IS THE BETTER ONE. Both exist to stop
     content being cut by the bar's edge. A gradient does it by painting the
     page ground over the content BEFORE it reaches the bar; a backdrop blur
     does it at the bar itself, and leaves the shape and colour of what is
     under there legible instead of erasing it. Keeping both means the gradient
     wins and the blur has nothing left to blur.

     It costs nothing in the gutters, which was the thing to check before
     deleting it: the pill is `min(560px, 100% - 20px)` centred and .ag-main
     pads by 10px, so the strips either side of the pill are exactly the page
     padding. There is no card content out there to leave unfaded. */
  '  body::after { display: none; }',
  '}',
  /* THE SCRIM. Not a bar and not a border - a short fade of the page's own
     ground behind the pill, so what scrolls under it goes out on a gradient. An
     edge says "cut off"; a fade says "there is more, and it is behind this".
     `pointer-events: none` because it must never eat a tap meant for a card.

     🔴 IT IS A SIBLING OF THE NAV, NOT A ::before ON IT, AND THAT IS THE WHOLE
     BUG JASON PHOTOGRAPHED. It was `.ag-nav::before { z-index: -1 }`, which
     reads as "put it behind the nav" and does not do that. A negative z-index
     child is painted behind its parent's CONTENT but IN FRONT OF its parent's
     BACKGROUND, and it cannot escape the parent at all once the parent
     establishes a stacking context - which `position: fixed; z-index: 30` does.
     So the gradient was drawn straight over the pill's white background: the
     bar lost its surface entirely and the icons were left floating on the page.

     🔴 "BEHIND" IS NOT A PROPERTY AN ELEMENT HAS OVER ITS OWN PARENT. To sit
     under the pill and over the page, the scrim has to be a separate fixed
     element one z-index below it. */
  /* 🔴 IT STOPS AT THE BOTTOM OF THE PILL, NOT AT THE BOTTOM OF THE SCREEN.
     Jason, 2026-09-10: "What is the grey below the bottom of the nav bar?"

     Measured on the deployed app at 375x812 before answering, because the
     candidates - this, the 1px ring, and --float's 24px shadow - are
     indistinguishable by eye and only one of them was it:

       scrim        y 720 -> 812      (92px, bottom: 0)
       fully --bg   y 786             (the 72% stop)
       pill         y 747 -> 800
       VISIBLE      y 800 -> 812      12px of flat #ebebeb, full width

     So the fade finished 14px ABOVE the bottom of the pill and everything
     below it was a flat slab of page-ground painted over whatever card was
     scrolling underneath. Invisible on Home, where the ground is already
     #ebebeb; obvious on the slate, where a white game card runs full-bleed
     under the bar. That is what he photographed.

     🔴 AND IT WAS THE ONE THING MOST AT ODDS WITH THE POINT OF THE BAR. The
     scrim's job is that content going under the pill leaves on a gradient
     rather than on a cut - but content EXITS AT THE PILL'S TOP EDGE. Below the
     pill there is nothing to fade out, only 12px of lift, and an opaque plinth
     under a floating bar is precisely the thing that stops it floating. The
     pill was welded to a grey step.

     Anchoring it to the pill's own bottom edge - the same expression the pill
     uses for its margin, so the two cannot drift apart - puts the whole flat
     section of the gradient BEHIND the pill where it was always meant to be,
     and lets the card show through underneath. The gutters either side stay
     covered, because this is still full width; only the vertical extent
     changed. */
  'body::after { content: ""; position: fixed; left: 0; right: 0;',
  '  bottom: calc(var(--nav-lift) + env(safe-area-inset-bottom, 0px));',
  /* 🔴 SHORTER. Jason: "Reduce the bleed outside of the nav bar. Not so far."
     At 132px the fade started most of a card above the pill, so a game card was
     washing out while it was still the thing you were reading. The scrim only
     has to cover the pill and a little above it - just enough that content goes
     out on a gradient instead of a cut. Past that it stops being a scrim and
     becomes a haze over the bottom of the page. */
  '  height: 92px; z-index: 29; pointer-events: none;',
  '  background: linear-gradient(to bottom, transparent, var(--bg) 72%); }',
  '.ag-nav-item { display: flex; flex-direction: column; align-items: center;',
  '  justify-content: center; gap: 2px; min-height: var(--tap-min);',
  '  font-size: 10px; font-weight: 700; border-radius: var(--radius-nav-item);',
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
  '    box-shadow: none; margin: 0; width: auto; height: 100%; padding: 12px 0; }',
  /* No scrim on the side rail - nothing scrolls under a column. */
  '  body::after { display: none; }',
  '  .ag-nav-item { flex-direction: row; justify-content: flex-start; gap: 10px;',
  '    padding: 0 16px; font-size: var(--t-body); }',
  /* The rail has room for words, so it uses them. */
  '  .ag-nav-item > span { position: static; width: auto; height: auto; margin: 0;',
  '    overflow: visible; clip-path: none; }',
  '  .ag-nav-item[aria-current="page"] { background: none; color: var(--accent);',
  '    border-radius: 0; border-left: 2px solid var(--accent); }',
  '}'
].join('\n');
