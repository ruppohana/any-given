/* S3 - EMPTY, LOADING, OFFLINE, ERROR. Session-owned, built once, used by every
 * screen that has data. A screen without these four is not a finished screen.
 *
 * DESIGN-BRIEF section 8 calls this the largest single gap in the project: roughly
 * forty states across thirteen screens and not one of them drawn. Three of the
 * four are load-bearing rather than housekeeping:
 *
 *  - OFFLINE DURING A LIVE GAME is a decision about trust, not a spinner. The
 *    premise of this app is ONE server polling and ONE connection to the phone.
 *    When that drops, the board must say what it still knows and how old it is.
 *    Nobody captured has this screen, because nobody captured is delayed on
 *    purpose. It is the one state in the app with no bar anywhere.
 *
 *  - EMPTY BEFORE THE SEASON. A football app is dead six months a year.
 *
 *  - EMPTY PRE-GAME is an opportunity, not a gap: five days out is when
 *    anticipation is highest, and the incumbent fills it with a 0-1 head-to-head
 *    and a poll nobody voted in.
 *
 * Bar: AQB-LIVE-ncaa-tab-no-games-found.png - a real empty state, badly done: a
 * bare centered line in an otherwise blank tab, with no way forward.
 */

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/**
 * @param {'empty'|'loading'|'offline'|'error'} kind
 * @param {object} opts { title, body, action: {label, onClick}, since }
 */
export function stateBlock(kind, opts) {
  opts = opts || {};
  const box = el('div', 'state state-' + kind);
  box.setAttribute('role', kind === 'error' ? 'alert' : 'status');

  if (kind === 'loading') {
    /* No spinner. A skeleton of the shape that is coming, so the layout does not
     * jump when it arrives - which is the same argument as tabular numbers. */
    box.setAttribute('aria-busy', 'true');
    const sk = el('div', 'state-skeleton');
    for (let i = 0; i < (opts.rows || 3); i++) sk.appendChild(el('div', 'state-skeleton-row'));
    box.appendChild(sk);
    box.appendChild(el('p', 'state-body', opts.body || 'Loading\u2026'));
    return box;
  }

  box.appendChild(el('p', 'state-title', opts.title || DEFAULT_TITLE[kind]));
  if (opts.body) box.appendChild(el('p', 'state-body', opts.body));

  /* OFFLINE SAYS HOW OLD WHAT YOU ARE LOOKING AT IS. That is the trust decision:
   * a delayed app that goes quiet is indistinguishable from a delayed app that is
   * working, and the user cannot tell without being told. */
  if (kind === 'offline' && opts.since != null) {
    const age = el('p', 'state-age num');
    const secs = Math.max(0, Math.round((Date.now() - opts.since) / 1000));
    age.textContent = `Last update ${secs}s ago \u00b7 showing what we have`;
    box.appendChild(age);
  }

  if (opts.action) {
    const b = el('button', 'state-action', opts.action.label);
    if (opts.action.onClick) b.addEventListener('click', opts.action.onClick);
    box.appendChild(b);
  }
  return box;
}

const DEFAULT_TITLE = {
  empty:   'Nothing here yet',
  offline: 'You are offline',
  error:   'That did not load'
};

export const STATES_CSS = [
  '.state { padding: 28px 16px; text-align: center; color: var(--dim); }',
  '.state-title { margin: 0 0 4px; font-size: var(--t-emph); font-weight: 600; color: var(--fg); }',
  '.state-body { margin: 0; font-size: var(--t-body); max-width: 28em; margin-inline: auto; }',
  '.state-age { margin: 8px 0 0; font-size: var(--t-micro); color: var(--dim); }',
  '.state-action { margin-top: 14px; padding: 0 16px; min-height: var(--tap-min); }',
  '.state-skeleton { display: grid; gap: 8px; }',
  '.state-skeleton-row { height: 44px; border-radius: var(--radius-card); background: var(--track); }',
  '@media (prefers-reduced-motion: no-preference) {',
  '  .state-skeleton-row { animation: ag-pulse 1.4s ease-in-out infinite; }',
  '  @keyframes ag-pulse { 0%,100% { opacity: .55 } 50% { opacity: .9 } }',
  '}'
].join('\n');
