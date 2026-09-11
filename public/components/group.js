/* THE CURRENT GROUP, AND THE DROPDOWN THAT CHANGES IT. Session-owned, shared by
 * every screen in the group section - CONTRACT-GROUPS.md §3.
 *
 * Jason, 2026-09-11: "if i am part of more than one group, then i need a dropdown
 * to enter different selections for the different groups." So which group you are
 * in is ONE value, `ag.group`, read and written only here - the picks, the
 * standings and the group page all agree on it because none of them keeps its own.
 *
 * It is deliberately not `ag.scope`: that key is the main Standings' world/group
 * selector and keeps its own meaning.
 */
export const GROUP_KEY = 'ag.group';

let CACHE = null;           /* { at, value } - one fetch serves a screen and its switcher */
const TTL = 20_000;

export function currentGroupId() {
  try { return localStorage.getItem(GROUP_KEY) || ''; } catch { return ''; }
}

export function setCurrentGroupId(id) {
  try {
    if (id) localStorage.setItem(GROUP_KEY, String(id));
    else localStorage.removeItem(GROUP_KEY);
  } catch { /* private mode - the choice lasts the page */ }
}

function signedIn() {
  try { return !!(localStorage.getItem('ag.session') && localStorage.getItem('ag.handle')); } catch { return false; }
}

/** Drop the cached list - after a create, join, leave or rename. */
export function forgetGroups() { CACHE = null; }

/**
 * My groups. Never throws.
 * @returns {Promise<{signedIn:boolean, groups:Array<{id,name,sport,week,ats,members,role}>, kindness:string, error?:'offline'|'error'}>}
 */
export async function myGroups(opts) {
  const force = !!(opts && opts.force);
  if (!signedIn()) return { signedIn: false, groups: [], kindness: '' };
  if (!force && CACHE && Date.now() - CACHE.at < TTL) return CACHE.value;
  try {
    const r = await (window.agApiFetch || fetch)('/api/group/mine');
    if (r.status === 401) return { signedIn: false, groups: [], kindness: '' };
    if (!r.ok) return { signedIn: true, groups: [], kindness: '', error: 'error' };
    const j = await r.json();
    const value = { signedIn: true, groups: Array.isArray(j.groups) ? j.groups : [], kindness: j.kindness || '' };
    CACHE = { at: Date.now(), value };
    return value;
  } catch {
    return { signedIn: signedIn(), groups: [], kindness: '', error: 'offline' };
  }
}

/** The stored group if it is still one of mine, else the first; stored and returned. */
export function pickCurrent(groups) {
  if (!groups || !groups.length) return null;
  const id = currentGroupId();
  const g = groups.find((x) => x.id === id) || groups[0];
  if (g.id !== id) setCurrentGroupId(g.id);
  return g;
}

/**
 * The switcher: a labeled <select> with 2+ groups, the name as plain text with one,
 * nothing with none. `onChange(id)` runs after the new id is stored.
 */
export function groupSwitcher(groups, currentId, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'ag-gsw';
  if (!groups || !groups.length) return wrap;
  if (groups.length === 1) {
    const one = document.createElement('span');
    one.className = 'ag-gsw-one';
    one.textContent = groups[0].name;
    wrap.appendChild(one);
    return wrap;
  }
  const id = 'ag-gsw-' + Math.random().toString(36).slice(2, 8);
  const lab = document.createElement('label');
  lab.className = 'ag-gsw-l';
  lab.setAttribute('for', id);
  lab.textContent = 'Group';
  const sel = document.createElement('select');
  sel.className = 'ag-gsw-s';
  sel.id = id;
  for (const g of groups) {
    const o = document.createElement('option');
    o.value = g.id;
    o.textContent = g.name + (g.role === 'commissioner' ? ' · commissioner' : '');
    sel.appendChild(o);
  }
  sel.value = currentId && groups.some((g) => g.id === currentId) ? currentId : groups[0].id;
  sel.addEventListener('change', () => {
    setCurrentGroupId(sel.value);
    if (onChange) onChange(sel.value);
  });
  wrap.append(lab, sel);
  return wrap;
}

export const GROUP_CSS = `
.ag-gsw { display: flex; align-items: center; gap: 8px; min-width: 0; }
.ag-gsw-l { font-size: var(--t-micro); font-weight: 800; letter-spacing: .08em;
  text-transform: uppercase; color: var(--dim); }
.ag-gsw-s { flex: 1 1 auto; min-width: 0; max-width: 100%; min-height: var(--tap-min);
  padding: 0 12px; font: inherit; font-weight: 700; color: var(--fg);
  background: var(--card); border: 1px solid var(--line); border-radius: var(--radius-button); }
.ag-gsw-one { font-size: var(--t-emph); font-weight: 800; color: var(--fg);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;
