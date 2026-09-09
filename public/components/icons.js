/* THE ICON SET. One family, one grid, one stroke.
 *
 * 🔴 WHY THESE ARE DRAWN AND NOT GENERATED. Jason asked whether Higgsfield could
 * produce them. It cannot, and the reason is not quality: an icon in this app has
 * to be VECTOR, MONOCHROME and inherit `currentColor`, because the same mark is
 * dim on a card, accent on a price, and white inside the nav's filled pill - and
 * it flips with the theme. A raster image is one color, at one size, forever.
 * Higgsfield is the right tool for the imagery around these - a hero, a share
 * card, a reaction card - and the wrong one for the marks themselves.
 *
 * 🔴 AND NO ICON FONT, NO THIRD PARTY, which is a standing constraint in
 * DESIGN.md. The navigation is the one element whose job is to be reliably
 * there, and a font is a network request that can fail.
 *
 * ── THE RULES OF THE FAMILY, and they are what "consistency" means here ──
 *
 *   ONE GRID       24x24, every mark, no exceptions
 *   ONE STROKE     1.9, round cap, round join
 *   OUTLINE ONLY   a filled icon among outlined ones reads as SELECTED even
 *                  when it is not, and the nav pill already carries that signal
 *   NO DETAIL      anything under ~2 grid units disappears at 20px, which is
 *                  the size four of these are always drawn at
 *   currentColor   never a hex. The mark takes the color of the text around it
 *
 * Sizes in use: 20px in the nav, 16px on a row, 14px inline, 48px on a sheet.
 */

const NS = 'http://www.w3.org/2000/svg';

/* Every path is one string on a 24 grid. Kept as data rather than as functions
 * so the whole family can be reviewed at once - which is the only way to see
 * whether it IS a family. */
export const ICONS = {
  /* ---- NAVIGATION. The five that are on screen constantly. ---- */
  home:      'M3.5 10.5 12 4l8.5 6.5V19a1 1 0 0 1-1 1h-5v-5h-5v5h-5a1 1 0 0 1-1-1z',
  slate:     'M4 7a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 10h16M8 4v4M16 4v4',
  picks:     'M4 8a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2a2 2 0 0 0 0 4v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a2 2 0 0 0 0-4zM9.5 12.4l1.8 1.8 3.2-3.6',
  standings: 'M6 20v-6M12 20V6M18 20v-9',
  /* The ball. Tilted, because the tilt is what separates a football from an eye -
   * the same lesson the header mark cost three attempts to learn. */
  live:      'M3.4 12C6.6 7 17.4 7 20.6 12 17.4 17 6.6 17 3.4 12ZM9 12h6M11 10.6v2.8M13 10.6v2.8',

  /* ---- PLAY OUTCOMES. The live layer's vocabulary, and the smallest drawn. ---- */
  /* A run: a path that goes THROUGH the line. Ground game, forward. */
  run:       'M4 18c3.5 0 4.5-8 8-8s4.5 8 8 8M4 6h16',
  /* A pass: an arc over the top. The two must be distinguishable in peripheral
   * vision, because they are the two most-tapped controls in the app - so one is
   * a line through and the other is a line over. */
  pass:      'M4 17c4-9 12-9 16 0M18.5 13.5 20 17l-3.4.8',
  /* Six points: the ball crossing a plane. */
  score:     'M5 5v14M5 12h9M14 8l4 4-4 4',
  /* A turnover: two arrows exchanging. */
  turnover:  'M6 9h11l-2.6-2.6M18 15H7l2.6 2.6',
  /* A call: a pointer with a burst - the moment of tapping. */
  call:      'M6 4l12 7-5 1.6L10.4 18z',
  check:     'M4.5 12.5 9 17l10.5-11',
  cross:     'M6 6l12 12M18 6 6 18',

  /* ---- STATE ---- */
  lock:      'M6.5 10.5h11a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-7.5a1 1 0 0 1 1-1zM8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5',
  /* A dash, not a zero. Empty and nought are different facts. */
  dash:      'M6 12h12',
  loading:   'M12 4v3.5M12 16.5V20M4 12h3.5M16.5 12H20M6.3 6.3l2.5 2.5M15.2 15.2l2.5 2.5M17.7 6.3l-2.5 2.5M8.8 15.2l-2.5 2.5',
  offline:   'M4 4l16 16M8.8 12.6a5 5 0 0 1 3-1.5M5.4 9.2a10 10 0 0 1 4-2.4M18.6 9.2a10 10 0 0 0-5-2.6M12 17.5h.01',
  error:     'M12 4.5 21 19.5H3zM12 10.5v4M12 17h.01',

  /* ---- ACTIONS ---- */
  swap:      'M7 8h11l-2.8-2.8M17 16H6l2.8 2.8',
  plus:      'M12 6v12M6 12h12',
  info:      'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 11v5.5M12 7.8h.01',
  share:     'M12 15V4.5M8.5 8 12 4.5 15.5 8M5.5 13.5V19a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-5.5'
};

/**
 * One mark.
 * @param name  a key of ICONS
 * @param px    drawn size. 20 in the nav, 16 on a row, 14 inline
 * @param cls   an extra class, so a caller can size or color it
 */
export function icon(name, px, cls) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(px || 20));
  svg.setAttribute('height', String(px || 20));
  svg.setAttribute('class', 'ag-ico' + (cls ? ' ' + cls : ''));
  /* 🔴 HIDDEN FROM SCREEN READERS, ALWAYS. Every one of these sits beside a word
   * that already says the thing - the nav label, the button text. An icon that
   * announces itself makes the reader hear everything twice. */
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', ICONS[name] || ICONS.info);
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', 'currentColor');
  p.setAttribute('stroke-width', '1.9');
  p.setAttribute('stroke-linecap', 'round');
  p.setAttribute('stroke-linejoin', 'round');
  if (name === 'live') p.setAttribute('transform', 'rotate(-32 12 12)');
  svg.appendChild(p);
  return svg;
}

export const ICON_CSS = `
.ag-ico { display: block; flex: 0 0 auto; }
/* The spinner is the one mark that moves, and it moves slowly - a fast spinner
   reads as panic on a screen that is only waiting for a football play. */
.ag-ico.is-spin { animation: ag-spin 1.4s linear infinite; }
@keyframes ag-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .ag-ico.is-spin { animation: none; } }
`;
