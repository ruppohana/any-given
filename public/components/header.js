/* 🔴 ONE HEADER, EVERY SCREEN. Jason, 2026-09-09: "How about a universal header
 * on every page. A template if you will. So it looks more consistant."
 *
 * He is describing a real inconsistency rather than a preference. Every screen
 * had invented its own top: the live game led with a delay bar, the slate with a
 * kicker over a pool name, My picks with an h1 and a meta line, the standings
 * with a different h1 and a different meta line - four type scales, four
 * vertical rhythms, four places the eye had to re-learn where it was. The three
 * dots then floated over all of them in absolute position, landing on whatever
 * happened to be in the top right of that particular screen.
 *
 * 🔴 THE PART THAT IS NOT COSMETIC: on a phone the top ~60px is the only thing
 * on screen the whole time, and it is what tells somebody WHICH SCREEN THEY ARE
 * ON. Four different answers to that question is why the slate and My picks read
 * as the same list, and why Home kept feeling "lost" - the page had no fixed
 * point that said where you were.
 *
 * The template is three slots and nothing else:
 *
 *   WHERE YOU ARE   the screen's name, always in the same place at the same size
 *   WHAT IT IS      one line under it, optional - a league, a week, a count
 *   THE MENU        the three dots, in the header rather than floating over it
 *
 * 🔴 NO BACK BUTTON, deliberately. The bottom nav is the navigation and a second
 * way back is a second mental model. A phone already has a back gesture.
 */

/**
 * @param opts {{ title, sub, tag, right }}
 *   title  the screen's name. Required - a header with no name is a spacer
 *   sub    one line of context, or null
 *   tag    a short pill beside the title (the league, usually), or null
 *   right  an element to sit left of the menu, or null
 */
/* The one menu button, held outside the DOM so a screen wipe cannot lose it. */
let KEPT_GEAR = null;

export function pageHeader(opts) {
  const o = opts || {};
  const h = document.createElement('header');
  h.className = 'ag-hd';

  const l = document.createElement('div');
  l.className = 'ag-hd-l';

  /* 🔴 THE LEAGUE MARK IS THE ANCHOR, NOT A WORD IN A PILL. Jason, 2026-09-09:
   * "In the ncaa pages can we consistently have the ncaa logo and an icon of a
   * football? Consistency and anchoring?"
   *
   * A pill reading "College" is a label somebody has to READ, in the one place
   * on a phone that is supposed to be recognised without reading. The NCAA
   * shield and the NFL shield are known at a glance and at 20px, they are
   * already self-hosted for the sport picker, and putting the same mark in the
   * same corner of every screen in a league is what makes six different screens
   * feel like one app.
   *
   * The football beside it is the constant - it says which app you are in, and
   * it is what stays the same when the league mark changes. That pairing is the
   * anchor: one half never moves, the other tells you where you are.
   *
   * 🔴 DRAWN, NOT FETCHED. The football is an inline SVG rather than an image
   * because it is on every screen: a network request that appears six times in a
   * session and can fail is the wrong shape for the one element whose job is to
   * be reliably there. */
  if (o.league) {
    const badge = document.createElement('div');
    badge.className = 'ag-hd-badge';

    const img = document.createElement('img');
    img.className = 'ag-hd-lg';
    img.src = '/logos/leagues/' + (o.league === 'nfl' ? 'nfl' : 'ncaa') + '-500.png';
    img.width = 30; img.height = 30;
    img.alt = o.league === 'nfl' ? 'NFL' : 'NCAA';
    img.decoding = 'sync';
    /* A mark that fails to load leaves the football and the title, which still
     * say what this is. It never leaves a broken-image glyph. */
    img.addEventListener('error', () => img.remove());
    badge.appendChild(img);

    /* 🔴 THE FOOTBALL IS GONE. Jason: "the NFL logo, kill the football."
     *
     * It went through three drawings - a blob that read as a circle, a vesica
     * that read as an eye, and a tilted one with a seam that finally read as a
     * football - and the argument for it was that it is the CONSTANT beside a
     * league mark that changes: it says which app you are in.
     *
     * That argument was never wrong, it was just answered elsewhere in the
     * meantime. The nav carries the app's identity on every screen, the domain
     * is in the address bar, and this header now sits on a page whose whole top
     * third is a scoreboard. A second identity mark next to a league logo is
     * two things competing to be the anchor, and the league one wins because it
     * is the one that changes between NFL and college - which is the question a
     * header is actually answering.
     *
     * Three iterations to draw it well and then deleted. That is not waste; it
     * is what it costs to find out a mark is not needed, and the finding is
     * only available once the thing is good enough to judge. */
    l.appendChild(badge);
  }

  const t = document.createElement('h1');
  t.className = 'ag-hd-t';
  t.textContent = o.title || '';
  l.appendChild(t);

  if (o.sub) {
    const s = document.createElement('p');
    s.className = 'ag-hd-s';
    s.textContent = o.sub;
    l.appendChild(s);
  }
  h.appendChild(l);

  const r = document.createElement('div');
  r.className = 'ag-hd-r';
  if (o.right) r.appendChild(o.right);
  /* 🔴 THE MENU LIVES IN THE TOP BAR NOW, AND THIS NO LONGER TAKES IT.
   * Jason, 2026-09-10: "Good but I lost the ellipsis."
   *
   * There is one #gear in the document and this used to relocate it into
   * whichever page header was on screen. That was the right answer while the
   * only alternative was a button floating loose in the corner. It became the
   * wrong one the moment a persistent .ag-topbar existed: the boot code moved
   * the gear into the bar, then the first render moved it straight back out
   * into a header that scrolls away - so the control was correct for about
   * one frame and then gone.
   *
   * Two owners of one singleton is the bug. The bar wins, because "stays put"
   * is the whole reason Jason asked for the bar.
   *
   * 🔴 AND THE OLD HAZARD IS GONE WITH IT rather than merely avoided: the gear
   * used to be adopted into a container that screens empty with
   * `root.innerHTML = ''`, which once deleted the button from the app until a
   * reload. The bar is outside `#root`, so nothing any screen does can remove
   * it, and the KEPT_GEAR rescue this file used to need is no longer load-
   * bearing. */
  h.appendChild(r);
  return h;
}

export const HEADER_CSS = `
.ag-hd { display: flex; align-items: flex-start; justify-content: space-between;
  gap: 12px; margin: 0 0 12px; min-height: 44px; }
.ag-hd-l { min-width: 0; }
/* 🔴 SECTION SIZE, NOT SCORE SIZE. Jason, 2026-09-09: "What are we designing
   towards? We have styles saved and available. Let's pick one."

   We already had one and I had been drifting from it. DESIGN.md - "Any Given -
   Style Reference" - sets the scale and, more importantly, the RULE about it:
   type runs small and tight, the working range is 11-13px, and it buys
   legibility from contrast and whitespace rather than size, with THREE OR FOUR
   DELIBERATE LARGE MOMENTS PER SCREEN: the score, the bank balance, the call.

   I built this header at --t-score, which is 24px and is the SCORE's size, and
   put it on every screen. That spends one of a page's three large moments on a
   label that never changes and that nobody is reading twice - and on the slate,
   a screen whose whole job is 24 dense rows, it was the loudest thing present.

   17px is Section: panel headings, which is exactly what a page title is. The
   large moments go back to the things that earn them - the score on the game,
   the bank on the call card, the matchup on the Upcoming card. */
.ag-hd-t { margin: 0; font-size: var(--t-section); font-weight: 800; line-height: 1.2;
  display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
/* TABULAR, because this line carries numbers on every screen - a week, a
   member count, a payout multiple - and figures that change width as they change
   value make a header jitter on a timer-driven screen. The rule used to live on
   each screen's own sub line; it belongs to the template now. */
.ag-hd-s { margin: 1px 0 0; font-size: var(--t-micro); color: var(--dim);
  line-height: 1.35; font-variant-numeric: tabular-nums; }
/* THE ANCHOR — the league mark and the football, same place on every screen.
   Above the title rather than beside it, so a long title can never push it off
   the row or wrap underneath it. */
.ag-hd-badge { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.ag-hd-lg { display: block; object-fit: contain; }
.ag-hd-ball { display: block; color: var(--dim); flex: 0 0 auto; }
.ag-hd-r { display: flex; align-items: center; gap: 6px; flex: 0 0 auto; }
/* 🔴 THE MENU STOPS FLOATING. It was position:fixed in the top right, over
   whatever each screen happened to put there - which on the slate was the word
   HOME in the sticky bar. In the header it is laid out with everything else and
   can never overlap anything. */
.ag-hd .ag-gear { position: static; margin: 0; }
`;
