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
    img.width = 22; img.height = 22;
    img.alt = o.league === 'nfl' ? 'NFL' : 'NCAA';
    img.decoding = 'sync';
    /* A mark that fails to load leaves the football and the title, which still
     * say what this is. It never leaves a broken-image glyph. */
    img.addEventListener('error', () => img.remove());
    badge.appendChild(img);

    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '18'); svg.setAttribute('height', '18');
    svg.setAttribute('class', 'ag-hd-ball');
    svg.setAttribute('aria-hidden', 'true');
    const ball = document.createElementNS(NS, 'path');
    /* A prolate spheroid on its long axis with a lace line - the shape reads as
     * a football at 18px, which a detailed one does not. */
    ball.setAttribute('d', 'M3.6 12c0-3.6 4-8.4 8.4-8.4S20.4 8.4 20.4 12s-4 8.4-8.4 8.4S3.6 15.6 3.6 12z');
    ball.setAttribute('fill', 'none');
    ball.setAttribute('stroke', 'currentColor');
    ball.setAttribute('stroke-width', '1.7');
    const lace = document.createElementNS(NS, 'path');
    lace.setAttribute('d', 'M9 12h6M11 10.2v3.6M13 10.2v3.6');
    lace.setAttribute('fill', 'none');
    lace.setAttribute('stroke', 'currentColor');
    lace.setAttribute('stroke-width', '1.7');
    lace.setAttribute('stroke-linecap', 'round');
    svg.append(ball, lace);
    badge.appendChild(svg);
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
  /* 🔴 THE MENU IS MOVED, NOT COPIED. There is exactly one #gear in the document
   * and this relocates it into whichever header is currently on screen, so it
   * cannot end up drawn twice or left behind on a screen that has gone. A
   * cloned button would need its own listener and would drift from the original
   * the first time one of them was changed. */
  const gear = document.getElementById('gear');
  if (gear) r.appendChild(gear);
  h.appendChild(r);
  return h;
}

export const HEADER_CSS = `
.ag-hd { display: flex; align-items: flex-start; justify-content: space-between;
  gap: 12px; margin: 0 0 12px; min-height: 44px; }
.ag-hd-l { min-width: 0; }
/* The screen's name, at one size everywhere. --t-score is the largest type
   outside the live layer's bank strip, and a page title is the one thing that
   earns it on every screen. */
.ag-hd-t { margin: 0; font-size: var(--t-score); font-weight: 800; line-height: 1.15;
  letter-spacing: -0.01em; display: flex; align-items: baseline; gap: 8px;
  flex-wrap: wrap; }
/* TABULAR, because this line carries numbers on every screen - a week, a
   member count, a payout multiple - and figures that change width as they change
   value make a header jitter on a timer-driven screen. The rule used to live on
   each screen's own sub line; it belongs to the template now. */
.ag-hd-s { margin: 2px 0 0; font-size: var(--t-body); color: var(--dim);
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
