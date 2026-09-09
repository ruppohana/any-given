/* AD SLOTS, RESERVED NOW SO THEY ARE NOT RETROFITTED LATER.
 *
 * Jason, 2026-09-08: "We need placeholders for adds." Right, and the reason to
 * do it before there is an advertiser is that AN AD IS A LAYOUT DECISION, not a
 * later insertion. Sofascore's own capture — the reference this app's slate is
 * measured against — pins a banner above its tab bar, and every screen in that
 * app is designed around the fact that the bottom 60px belong to somebody else.
 * A product that discovers this after it ships loses a row of content on every
 * screen, or covers one.
 *
 * 🔴 WHAT IS DELIBERATELY NOT HERE: a network, a tag, an iframe, an id, a
 * tracking pixel. This is a reserved rectangle and nothing else. The moment a
 * third-party script is dropped into a live game it can reflow the page under
 * somebody's thumb while they are calling a snap — which is the one interaction
 * this whole app exists for. Whatever fills these has to be size-locked and
 * measured, and that is a decision with a person's name on it rather than a
 * default.
 *
 * 🔴 AND NOT ON THE CALL. The tiles carry a price and a countdown; an
 * advertisement beside them is the one place this app must never put one. The
 * slots are the slate, the standings, the recap — the places somebody is
 * browsing rather than deciding.
 */

/** Where a slot may appear. Named rather than positional so a screen asks for a
 *  role and the component decides the shape. */
const SHAPES = {
  /* Pinned above the tab bar, the Sofascore position. 50px is the standard
   * mobile banner height; the container reserves 60 with its padding so content
   * above it is never overlapped. */
  banner: { h: 50, label: 'Banner' },
  /* Between groups in a long list — a day break on the slate, say. Taller,
   * because it is scrolled past rather than pinned. */
  inline: { h: 100, label: 'Inline' }
};

/**
 * A reserved, labelled rectangle.
 *
 * @param kind   'banner' | 'inline'
 * @param note   what would go here, in plain words, so the placeholder is
 *               self-explaining to anybody who opens the app before it sells
 */
export function adSlot(kind, note) {
  const shape = SHAPES[kind] || SHAPES.inline;
  const box = document.createElement('div');
  box.className = 'ag-ad ag-ad--' + kind;
  box.style.minHeight = shape.h + 'px';
  /* 🔴 IT ANNOUNCES ITSELF AS EMPTY. A grey rectangle with no words reads as a
   * broken image or a failed load, and somebody will report it as a bug. */
  box.setAttribute('role', 'note');
  box.setAttribute('aria-label', 'Advertising space, currently empty');

  const l = document.createElement('span');
  l.className = 'ag-ad-l';
  l.textContent = 'AD SPACE';
  const n = document.createElement('span');
  n.className = 'ag-ad-n';
  n.textContent = note || `${shape.label} · reserved, nothing sold yet`;
  box.append(l, n);
  return box;
}

export const AD_CSS = `
.ag-ad { display: grid; place-content: center; gap: 2px; text-align: center;
  border: 1px dashed var(--line); border-radius: 10px; color: var(--dim);
  background: color-mix(in srgb, var(--card) 60%, transparent); }
.ag-ad-l { font-size: 10px; font-weight: 800; letter-spacing: .1em; }
.ag-ad-n { font-size: 11px; opacity: .8; }
/* The banner sits in the flow above the tab bar rather than floating over it —
   a slot that overlays content is a slot that hides a row somebody needed. */
.ag-ad--banner { margin: 4px 0 0; }
.ag-ad--inline { margin: 10px 0; }
`;
