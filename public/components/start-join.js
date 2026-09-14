/* START OR JOIN, ON THE POOL ITSELF. Jason, 2026-09-13, asked whether somebody new
 * who taps a pool should meet a sign-in screen or "tease the next screen", and chose
 * "Pool first" - for a visitor who is signed out, and for somebody signed in who is
 * in no group of that pool. The settled rule underneath it (vault decision
 * email-is-required-2026-09-10) is "first pick is fine": the pool opens for anyone.
 *
 * So every pool screen shows the pool, and on it one card with the two ways in -
 * Start a group, Join a group - and, at the first pick of somebody signed in with
 * no group, the same two in a small inline sheet. Never a full-screen wall.
 *
 * Start and Join both land on the group page (#/g, g1-group.screen.js). Which form
 * opens there is carried in `ag.groupForm` ('start' | 'join'), read once by g1 and
 * cleared; the sport rides in `ag.sport`, the key g1's Start form already opens on.
 * Signed out, the sign-in sheet comes first - g1 would only ask for it anyway.
 */
export const GROUP_FORM_KEY = 'ag.groupForm';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function btn(cls, text, onClick) {
  const b = el('button', cls, text);
  b.type = 'button';
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

/** Signed in, the way every screen reads it: a session and a handle on this phone. */
export function signedInHere() {
  try { return !!(localStorage.getItem('ag.session') && localStorage.getItem('ag.handle')); } catch { return false; }
}

/** 'start' or 'join' - anything else is Start. */
export function formOf(which) { return which === 'join' ? 'join' : 'start'; }

/** The form g1 should open, read once and cleared. '' when none was asked for. */
export function takeGroupForm() {
  let v = '';
  try { v = localStorage.getItem(GROUP_FORM_KEY) || ''; localStorage.removeItem(GROUP_FORM_KEY); } catch { v = ''; }
  return v === 'start' || v === 'join' ? v : '';
}

/** Start or Join: signed out, the sign-in sheet first (a cancelled sheet goes
 *  nowhere); then the sport and the form are remembered and the group page opens.
 *  Resolves true when it navigated. */
export async function goStartJoin(which, sport) {
  if (!signedInHere()) {
    const open = typeof window !== 'undefined' && window.agOpenSignIn;
    if (typeof open !== 'function' || !(await open())) return false;
  }
  try {
    if (sport) localStorage.setItem('ag.sport', JSON.stringify(sport));
    localStorage.setItem(GROUP_FORM_KEY, formOf(which));
  } catch { /* private mode - the group page still opens, on Start and Join */ }
  location.hash = '#/g';
  return true;
}

/** What the first pick of somebody with no group of this pool should do.
 *  Signed out: the sign-in sheet - 'signed-in' once it is done, 'cancelled' if
 *  not (the screen reloads on 'signed-in': a group may be there now). Signed in:
 *  'no-group', and the screen shows startJoinSheet where the tap was. */
export async function noGroupTap() {
  if (signedInHere()) return 'no-group';
  const open = typeof window !== 'undefined' && window.agOpenSignIn;
  if (typeof open !== 'function') return 'cancelled';
  return (await open()) ? 'signed-in' : 'cancelled';
}

function pair(sport) {
  const row = el('div', 'ag-sj-row');
  const s = btn('ag-sj-btn ag-sj-btn--primary', 'Start a group', () => goStartJoin('start', sport));
  s.dataset.sj = 'start';
  const j = btn('ag-sj-btn', 'Join a group', () => goStartJoin('join', sport));
  j.dataset.sj = 'join';
  row.append(s, j);
  return row;
}

/** The card on the pool: a line, then Start a group and Join a group.
 *  opts.title / opts.body replace the words; body '' leaves the line out. */
export function startJoinCard(sport, opts) {
  const o = opts || {};
  const c = el('section', 'ag-sj');
  c.dataset.sport = sport || '';
  c.setAttribute('aria-label', 'Start or join a group');
  c.appendChild(el('p', 'ag-sj-t', o.title || 'Play it with friends'));
  const body = o.body == null
    ? 'Picks count in a group. Start one and invite people, or join with the code someone sent you.' : o.body;
  if (body) c.appendChild(el('p', 'ag-sj-b', body));
  c.appendChild(pair(sport));
  return c;
}

/** The small inline sheet at the first pick of somebody signed in with no group:
 *  why the pick cannot save yet, the same two buttons, and Not now. */
export function startJoinSheet(sport, opts) {
  const o = opts || {};
  const c = el('section', 'ag-sj ag-sj--sheet');
  c.dataset.sport = sport || '';
  c.setAttribute('role', 'group');
  c.setAttribute('aria-label', 'Save your picks to a group');
  c.appendChild(el('p', 'ag-sj-t', o.title || 'Save it to a group'));
  c.appendChild(el('p', 'ag-sj-b', o.body
    || 'A pick counts once you are in a group. Start one and invite people, or join with a code.'));
  c.appendChild(pair(sport));
  const x = btn('ag-sj-x', 'Not now', () => { if (o.onClose) o.onClose(); else c.remove(); });
  x.dataset.sj = 'close';
  c.appendChild(x);
  return c;
}

export const START_JOIN_CSS = `
.ag-sj { display: grid; gap: 8px; padding: 12px; min-width: 0; border: 1px solid var(--line);
  border-radius: var(--radius-card); background: var(--card); color: var(--fg); }
.ag-sj--sheet { border: 2px solid var(--accent); }
.ag-sj-t { margin: 0; font-size: var(--t-emph); font-weight: 800; line-height: 1.3; }
.ag-sj-b { margin: 0; font-size: var(--t-body); line-height: 1.45; color: var(--dim); }
.ag-sj-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.ag-sj-btn { min-height: var(--tap-min); padding: 8px 12px; font: inherit; font-weight: 800; line-height: 1.2;
  border: 1px solid var(--accent); border-radius: var(--radius-button); background: var(--card);
  color: var(--accent); cursor: pointer; overflow-wrap: anywhere; }
.ag-sj-btn--primary { background: var(--accent); color: var(--on-accent); }
.ag-sj-x { justify-self: start; min-height: var(--tap-min); padding: 0 4px; font: inherit; font-weight: 700;
  color: var(--dim); background: transparent; border: 0; text-decoration: underline; cursor: pointer; }
`;
