/* G1 - THE GROUP PAGE. `#/g`, the Info tab of the Group pools bar.
 *
 * Jason, 2026-09-11, verbatim: "if i am not part of a group, we are missing a
 * step. we need to invite people or join another group. so we need a button to
 * start a group, with a name and then invite people to this invite only group.
 * if i am part of a group, great then i can pick games. if i am part of more than
 * one group, then i need a dropdown ... if i stated the group i am the
 * commisiner ... if i am part of a group, i would like a button an email to the
 * commish or the group."
 *
 * So this screen is two screens that share an address:
 *
 *   IN NO GROUP     the missing step. Two buttons - Start a group, Join a group -
 *                   and the form behind each. Nothing else competes with them.
 *   IN A GROUP      the switcher (a dropdown at 2+), what the group is, who is in
 *                   it, the two email buttons, the doors to the commissioner's
 *                   tools and the group's rules, start/join another, and leave.
 *
 * 🔴 POINTS ONLY, AND HANDLES ONLY. Nothing in the group section uses the live
 * board's words, and no member's address is ever shown or asked for: an email to
 * the commissioner or the group is relayed by Any Given and nobody sees anyone's
 * address. The screen says so where the email is written (CONTRACT-GROUPS §5).
 *
 * 🔴 DATA LOADS IN previewData, AND ONLY THERE AT MOUNT. render() never fetches.
 * A tap (Create, Join, Send, Leave, the switcher) calls the API from its handler
 * and then re-draws from a fresh load - CONTRACT-GROUPS §3.
 *
 * 🔴 IT RE-DRAWS A HOST, NOT #root. The shell appends the ad slot to #root after
 * the first render; wiping #root on every tap would take the slot with it. The
 * standings screen draws into a host div for the same reason.
 */
import { currentGroupId, setCurrentGroupId, myGroups, pickCurrent, groupSwitcher,
         forgetGroups, GROUP_CSS, SCOPE_CHOICES, scopeNote, collegeConferences } from '/components/group.js';
import { stateBlock, STATES_CSS } from '/components/states.js';
import { pageHeader, HEADER_CSS } from '/components/header.js';

export const id = 'g1-group';
export const title = 'Group - start or join, members, messages';
export const bar = null;

/** `no-group` is this screen's empty state: the list of your groups is empty,
 *  and the page becomes the start-or-join step. `empty` is kept as its alias so
 *  the harness's usual state name still lands somewhere true. */
export const states = ['ready', 'no-group', 'empty', 'signed-out', 'loading', 'offline', 'error'];

/* The limits, as src/lib/groups.ts LIMITS has them. The server enforces them;
 * these only size the fields and the counters. tests/g1-group.test.mjs reads the
 * .ts file and fails if the two ever disagree. */
export const NAME_MAX = 40;
export const MESSAGE_MAX = 1000;

/* ------------------------------------------------------------------ *
 * PURE HELPERS - no DOM, no imported binding. The test loads this module with
 * its import lines stripped, which is only legal because these touch neither.
 * ------------------------------------------------------------------ */

/** Which view a `myGroups()` answer is. */
export function viewFor(mine) {
  if (!mine || mine.signedIn === false) return 'signed-out';
  if (mine.error === 'offline') return 'offline';
  if (mine.error) return 'error';
  if (!Array.isArray(mine.groups) || mine.groups.length === 0) return 'no-group';
  return 'ready';
}

/** The pledge gates Create. Ticked, and the pledge's own words actually on
 *  screen - a box beside a sentence that did not load is a promise to nothing. */
export function canCreate(form) {
  return !!(form && form.pledged === true && typeof form.kindness === 'string' && form.kindness.trim()
    && !(form.sport !== 'nfl' && form.scope === 'conference' && !String(form.scopeArg || '').trim()));
}

/** What Create sends. `pledge: true` is only ever sent from a ticked box. A college
 *  group also sends which games it picks from; an NFL group is all games. */
export function createPayload(form) {
  const college = !(form && form.sport === 'nfl');
  const scope = form && (form.scope === 'top25' || form.scope === 'conference') ? form.scope : 'all';
  return {
    name: String((form && form.name) || ''),
    sport: college ? 'college-football' : 'nfl',
    pledge: true,
    ats: !!(form && form.ats),
    ...(college ? { scope, scopeArg: scope === 'conference' ? String(form.scopeArg || '') : null } : {})
  };
}

export function sportLabel(s) {
  return s === 'nfl' ? 'NFL' : 'College football';
}

/** A member count, pluralized. */
export function membersLine(n) {
  const k = Number(n) || 0;
  return k + (k === 1 ? ' member' : ' members');
}

/** The error a person reads is the server's own sentence, verbatim. */
export function errorText(json, fallback) {
  return json && typeof json.message === 'string' && json.message ? json.message : fallback;
}

/** The second-tap question. A commissioner is told where the group goes. */
export function leaveQuestion(detail) {
  const name = (detail && detail.group && detail.group.name) || 'this group';
  const role = detail && detail.you && detail.you.role;
  const n = detail && Array.isArray(detail.members) ? detail.members.length : 0;
  if (role === 'commissioner') {
    if (n <= 1) return 'You are the only one in ' + name + ', so leaving closes it for good.';
    return 'You are the commissioner. If you leave, ' + name
      + ' passes to its longest-standing member. Your picks in it are removed.';
  }
  return 'Leave ' + name + '? Your picks in it are removed. You can rejoin with the code.';
}

export function counterText(n, max) {
  return n + ' / ' + max;
}

/** A code out of `ag.pendingPool` (what app.js stores from an invite link), for
 *  the Join field. Read here; the join handler clears it once the person is in -
 *  since 2026-09-11 an invite lands on this page, not the slate. */
export function prefillCode(pending) {
  if (!pending || typeof pending !== 'object') return '';
  return String(pending.id || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

export function shareText(groupName, code) {
  return 'Join my group ' + groupName + ' on Any Given. Pick the winners each week, scored in points. Code ' + code;
}

/* ------------------------------------------------------------------ *
 * DATA
 * ------------------------------------------------------------------ */

function api(url, body) {
  const f = (typeof window !== 'undefined' && window.agApiFetch) || fetch;
  return body === undefined
    ? f(url)
    : f(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

function readPending() {
  try { return JSON.parse(localStorage.getItem('ag.pendingPool') || 'null'); } catch { return null; }
}

function chosenSport() {
  try { return JSON.parse(localStorage.getItem('ag.sport')) === 'nfl' ? 'nfl' : 'college-football'; }
  catch { return 'college-football'; }
}

/** Everything the page shows, fetched. Never throws. */
async function load(force) {
  let mine = await myGroups({ force: !!force });
  const base = { noSample: true, kindness: mine.kindness || '', prefill: prefillCode(readPending()),
                 sportDefault: chosenSport(), conferences: await collegeConferences() };
  let view = viewFor(mine);
  if (view !== 'ready') return Object.assign(base, { view });

  /* Twice at most: a cached list can name a group you were removed from or that
   * closed, and the honest answer is the list as it is now, not an error. */
  for (let attempt = 0; attempt < 2; attempt++) {
    const cur = pickCurrent(mine.groups);
    let r;
    try { r = await api('/api/group/detail?id=' + encodeURIComponent(cur.id)); }
    catch { return Object.assign(base, { view: 'offline' }); }
    if (r.status === 401) return Object.assign(base, { view: 'signed-out' });
    let j = null;
    try { j = await r.json(); } catch { j = null; }
    if (r.ok && j && j.group) {
      return Object.assign(base, { view: 'ready', groups: mine.groups, currentId: cur.id, detail: j,
                                   kindness: j.kindness || base.kindness });
    }
    if ((r.status === 403 || r.status === 404) && attempt === 0) {
      forgetGroups();
      setCurrentGroupId('');
      mine = await myGroups({ force: true });
      view = viewFor(mine);
      if (view !== 'ready') return Object.assign(base, { view, kindness: mine.kindness || base.kindness });
      continue;
    }
    return Object.assign(base, { view: 'error', message: errorText(j, 'Your group did not load.') });
  }
  return Object.assign(base, { view: 'error', message: 'Your group did not load.' });
}

export async function previewData(fixtures, state) {
  /* Only `ready` - the route a person reaches - touches the network. The other
   * states are the harness's, and they carry no invented group: a group page
   * full of made-up people is the app telling you who your friends are. */
  if (state && state !== 'ready') {
    return { noSample: true, view: state === 'empty' ? 'no-group' : state, kindness: '',
             prefill: '', sportDefault: 'college-football' };
  }
  return load(false);
}

/* ------------------------------------------------------------------ *
 * RENDER
 * ------------------------------------------------------------------ */

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

export function render(root, data, state) {
  root.innerHTML = '';
  root.classList.add('scr-g1-group');
  const style = document.createElement('style');
  style.textContent = [STATES_CSS, HEADER_CSS, GROUP_CSS].join('\n');
  root.appendChild(style);
  const host = el('div', 'g1');
  root.appendChild(host);
  draw(host, data || {}, state);
}

/** Show the skeleton, load, draw. What every tap ends with. */
async function refresh(host, flash) {
  draw(host, { view: 'loading' }, 'loading');
  const next = await load(true);
  if (flash) next.flash = flash;
  draw(host, next, 'ready');
}

function draw(host, data, state) {
  host.innerHTML = '';
  const view = data.view || (state === 'empty' ? 'no-group' : state) || 'ready';

  const subs = {
    'signed-out': 'Sign in to see your groups',
    'no-group': 'You are not in a group yet',
    loading: 'Loading your groups…',
    offline: 'Offline',
    error: 'Something went wrong'
  };
  let sub = subs[view] || '';
  if (view === 'ready') {
    const n = (data.groups || []).length;
    sub = n > 1 ? 'You are in ' + n + ' groups' : 'Your group';
  }
  host.appendChild(pageHeader({ title: 'Group', noTitle: true, sub }));

  if (data.flash) {
    const f = el('p', 'g1-flash', data.flash);
    f.setAttribute('role', 'status');
    host.appendChild(f);
  }

  if (view === 'loading') {
    host.appendChild(stateBlock('loading', { rows: 4, body: 'Loading your groups…' }));
    return;
  }
  if (view === 'offline') {
    host.appendChild(stateBlock('offline', {
      title: 'You are offline',
      body: 'Your groups did not load. Nothing was changed.',
      action: { label: 'Try again', onClick: () => refresh(host) }
    }));
    return;
  }
  if (view === 'error') {
    host.appendChild(stateBlock('error', {
      body: data.message || 'Your groups did not load. Nothing was changed.',
      action: { label: 'Try again', onClick: () => refresh(host) }
    }));
    return;
  }
  if (view === 'signed-out') { host.appendChild(signedOutCard(host)); return; }
  if (view === 'no-group') { host.appendChild(onboarding(host, data, 'first')); return; }
  drawGroup(host, data);
}

/* ------------------------------------------------------------ signed out */

function signedOutCard(host) {
  const c = el('div', 'card g1-card');
  c.appendChild(el('h2', 'g1-h', 'Sign in to see your groups'));
  c.appendChild(el('p', 'g1-p',
    'Groups are invite-only, so everyone in one has an account and a handle. '
    + 'Other members see your handle and nothing else.'));
  const can = typeof window !== 'undefined' && typeof window.agOpenSignIn === 'function';
  const b = btn('g1-primary', 'Sign in', async () => {
    b.disabled = true;
    const ok = await window.agOpenSignIn();
    b.disabled = false;
    if (ok) refresh(host);
  });
  if (!can) b.disabled = true;
  c.appendChild(b);
  return c;
}

/* ------------------------------------------------------ start or join
 * `mode` 'first' is the missing step - nobody here is in a group yet. 'another'
 * is the same two forms under a group you already have. */

function onboarding(host, data, mode) {
  const wrap = el('section', 'g1-onboard');
  wrap.setAttribute('aria-label', mode === 'first' ? 'Start or join a group' : 'Start or join another group');

  if (mode === 'first') {
    const intro = el('div', 'g1-intro');
    intro.appendChild(el('h2', 'g1-h', 'Start a group or join one'));
    intro.appendChild(el('p', 'g1-p',
      'A group is friends who pick the winners each week, scored in points against each other. '
      + 'Nothing else rides on it. Start one and invite people, or join with the code someone sent you.'));
    wrap.appendChild(intro);
  }

  const choices = el('div', 'g1-choices');
  const startB = btn('g1-choice', mode === 'first' ? 'Start a group' : 'Start another group');
  const joinB = btn('g1-choice', mode === 'first' ? 'Join a group' : 'Join another group');
  choices.append(startB, joinB);
  wrap.appendChild(choices);

  const slot = el('div', 'g1-formslot');
  wrap.appendChild(slot);

  let open = '';
  const show = (which) => {
    open = open === which ? '' : which;
    startB.setAttribute('aria-expanded', String(open === 'start'));
    joinB.setAttribute('aria-expanded', String(open === 'join'));
    slot.innerHTML = '';
    if (open === 'start') slot.appendChild(startForm(host, data));
    if (open === 'join') slot.appendChild(joinForm(host, data));
    const first = slot.querySelector('input, textarea');
    if (first && open) first.focus();
  };
  startB.addEventListener('click', () => show('start'));
  joinB.addEventListener('click', () => show('join'));
  startB.setAttribute('aria-expanded', 'false');
  joinB.setAttribute('aria-expanded', 'false');

  /* An invite link left a code behind: the Join form opens with it filled in. */
  if (mode === 'first' && data.prefill) show('join');
  return wrap;
}

function startForm(host, data) {
  const form = { name: '', sport: data.sportDefault === 'nfl' ? 'nfl' : 'college-football', ats: false,
                 scope: 'all', scopeArg: '', pledged: false, kindness: data.kindness || '' };
  const c = el('form', 'card g1-card g1-form');
  c.noValidate = true;
  c.appendChild(el('h2', 'g1-h', 'Start a group'));

  /* The name. */
  const nameId = 'g1-name-' + Math.random().toString(36).slice(2, 7);
  const lab = el('label', 'g1-label', 'Group name');
  lab.setAttribute('for', nameId);
  const nameRow = el('div', 'g1-labelrow');
  const nameCount = el('span', 'g1-count num', counterText(0, NAME_MAX));
  nameRow.append(lab, nameCount);
  const name = el('input', 'g1-input');
  name.id = nameId; name.type = 'text'; name.maxLength = NAME_MAX;
  name.autocomplete = 'off'; name.placeholder = 'The Fourth Floor';
  name.addEventListener('input', () => { form.name = name.value; nameCount.textContent = counterText(name.value.length, NAME_MAX); });
  c.append(nameRow, name);

  /* The sport. Two, and only two, because the schedule is two feeds. */
  c.appendChild(el('span', 'g1-label', 'Sport'));
  const seg = el('div', 'g1-seg');
  seg.setAttribute('role', 'radiogroup');
  seg.setAttribute('aria-label', 'Sport');
  const segBtns = [];
  for (const [v, t] of [['nfl', 'NFL'], ['college-football', 'College football']]) {
    const b = btn('g1-seg-b', t, () => { form.sport = v; paintSeg(); paintScope(); });
    b.setAttribute('role', 'radio');
    b.dataset.v = v;
    segBtns.push(b);
    seg.appendChild(b);
  }
  const paintSeg = () => { for (const b of segBtns) b.setAttribute('aria-checked', String(b.dataset.v === form.sport)); };
  paintSeg();
  c.appendChild(seg);

  /* WHICH GAMES - a college group only. Jason, 2026-09-11: "All games is fine for
   * NFL. But it is tough for NCAA. We need a toggle for when setting up the group." */
  const scopeBox = el('div', 'g1-scope');
  scopeBox.appendChild(el('span', 'g1-label', 'Which games'));
  const scopeSeg = el('div', 'g1-seg g1-seg--3');
  scopeSeg.setAttribute('role', 'radiogroup');
  scopeSeg.setAttribute('aria-label', 'Which games');
  const scopeBtns = SCOPE_CHOICES.map((o) => {
    const b = btn('g1-seg-b', o.label, () => { form.scope = o.value; paintScope(); });
    b.setAttribute('role', 'radio');
    b.dataset.v = o.value;
    scopeSeg.appendChild(b);
    return b;
  });
  const confSel = el('select', 'g1-input g1-conf');
  confSel.setAttribute('aria-label', 'Conference');
  const confs = Array.isArray(data.conferences) ? data.conferences : [];
  const ph = el('option', '', confs.length ? 'Choose a conference' : 'The conference list loads with this week’s games');
  ph.value = '';
  confSel.appendChild(ph);
  for (const cf of confs) {
    const o = el('option', '', cf.name + ' · ' + cf.count + (cf.count === 1 ? ' game' : ' games') + ' this week');
    o.value = cf.name;
    confSel.appendChild(o);
  }
  confSel.addEventListener('change', () => { form.scopeArg = confSel.value; paint(); });
  const scopeLine = el('p', 'g1-note', '');
  scopeBox.append(scopeSeg, confSel, scopeLine);
  c.appendChild(scopeBox);
  function paintScope() {
    scopeBox.hidden = form.sport === 'nfl';
    for (const b of scopeBtns) b.setAttribute('aria-checked', String(b.dataset.v === form.scope));
    confSel.hidden = form.scope !== 'conference';
    scopeLine.textContent = scopeNote(form.scope) + ' The commissioner can change it later.';
    if (typeof paint === 'function') paint();
  }

  /* Against the spread - optional, off by default. */
  const sw = el('div', 'g1-switch-row');
  const swText = el('div', 'g1-switch-text');
  swText.appendChild(el('span', 'g1-switch-label', 'Pick against the spread'));
  /* The commissioner's option - Jason, 2026-09-11: "the comish has the option."
   * `/api/pool/standings` scores the cover when it is on, against the line the
   * pick was made at. */
  swText.appendChild(el('span', 'g1-note', 'Off: pick who wins. On: your team has to cover the '
    + 'spread you picked at. The commissioner can change it later.'));
  const swB = btn('g1-switch', '', () => { form.ats = !form.ats; swB.setAttribute('aria-checked', String(form.ats)); });
  swB.setAttribute('role', 'switch');
  swB.setAttribute('aria-checked', 'false');
  swB.setAttribute('aria-label', 'Pick against the spread');
  swB.appendChild(el('span', 'g1-knob'));
  sw.append(swText, swB);
  c.appendChild(sw);

  /* THE KINDNESS PLEDGE. The API's own sentence, never a paraphrase of it. */
  const pl = el('label', 'g1-pledge');
  const box = el('input', 'g1-check');
  box.type = 'checkbox';
  const plText = el('span', 'g1-pledge-t', form.kindness || 'The commissioner pledge did not load. Try again in a moment.');
  pl.append(box, plText);
  if (!form.kindness) box.disabled = true;
  c.appendChild(pl);

  const create = el('button', 'g1-primary', 'Create group');
  create.type = 'submit';
  const why = el('p', 'g1-why');
  const err = el('p', 'g1-err');
  err.setAttribute('role', 'alert');
  function paint() {
    create.disabled = !canCreate(form);
    const needConf = form.sport !== 'nfl' && form.scope === 'conference' && !String(form.scopeArg || '').trim();
    why.textContent = !create.disabled ? ''
      : needConf ? 'Choose the conference.'
      : (form.kindness ? 'Tick the pledge to start the group. As commissioner, you keep it kind.' : '');
  }
  box.addEventListener('change', () => { form.pledged = box.checked; paint(); });
  paintScope();
  c.append(create, why, err);

  c.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!canCreate(form)) return;
    create.disabled = true; create.textContent = 'Creating…'; err.textContent = '';
    let r, j = null;
    try {
      r = await api('/api/group/create', createPayload(form));
      try { j = await r.json(); } catch { j = null; }
    } catch {
      err.textContent = 'No connection. Nothing was created - try again in a moment.';
      create.textContent = 'Create group'; paint();
      return;
    }
    if (!r.ok || !j || !j.group) {
      err.textContent = errorText(j, 'That did not work. Nothing was created.');
      create.textContent = 'Create group'; paint();
      return;
    }
    forgetGroups();
    setCurrentGroupId(j.group.id);
    host.dataset.created = JSON.stringify({ id: j.group.id, invite: j.invite || null });
    refresh(host, j.group.name + ' is started. You are its commissioner.');
  });
  return c;
}

function joinForm(host, data) {
  const c = el('form', 'card g1-card g1-form');
  c.noValidate = true;
  c.appendChild(el('h2', 'g1-h', 'Join a group'));
  const cid = 'g1-code-' + Math.random().toString(36).slice(2, 7);
  const lab = el('label', 'g1-label', 'Invite code');
  lab.setAttribute('for', cid);
  const inp = el('input', 'g1-input g1-input--code num');
  inp.id = cid; inp.type = 'text'; inp.maxLength = 20;
  inp.autocomplete = 'off'; inp.spellcheck = false;
  inp.setAttribute('autocapitalize', 'characters');
  inp.placeholder = 'Six letters and numbers';
  if (data.prefill) inp.value = data.prefill;
  c.append(lab, inp);
  c.appendChild(el('p', 'g1-note', 'Any case, any spacing - it is read the same way.'));

  const go = el('button', 'g1-primary', 'Join');
  go.type = 'submit';
  const err = el('p', 'g1-err');
  err.setAttribute('role', 'alert');
  c.append(go, err);

  c.addEventListener('submit', async (e) => {
    e.preventDefault();
    go.disabled = true; go.textContent = 'Joining…'; err.textContent = '';
    let r, j = null;
    try {
      r = await api('/api/group/join', { code: inp.value });
      try { j = await r.json(); } catch { j = null; }
    } catch {
      err.textContent = 'No connection. Try again in a moment.';
      go.disabled = false; go.textContent = 'Join';
      return;
    }
    if (!r.ok || !j || !j.group) {
      /* no_group, removed, full, code_required - the server's sentence, as written. */
      err.textContent = errorText(j, 'That code did not work.');
      go.disabled = false; go.textContent = 'Join';
      return;
    }
    forgetGroups();
    setCurrentGroupId(j.group.id);
    /* The invite is used: an invite link lands here (app.js, 2026-09-11) and
     * nothing else reads the key, so it is cleared once the person is in. */
    try { localStorage.removeItem('ag.pendingPool'); } catch { /* private window */ }
    refresh(host, 'You are in ' + j.group.name + '.');
  });
  return c;
}

/* ---------------------------------------------------------------- a group */

function drawGroup(host, data) {
  const d = data.detail;
  const g = d.group;
  const isCommish = d.you && d.you.role === 'commissioner';

  /* The group, and the control that changes it. The switcher IS the name: plain
   * text with one group, a dropdown with two or more - so the name is on screen
   * exactly once. */
  const head = el('section', 'card g1-card g1-group');
  head.setAttribute('aria-label', 'This group');
  const sw = groupSwitcher(data.groups, data.currentId, () => refresh(host));
  sw.classList.add('g1-switcher');
  head.appendChild(sw);
  head.appendChild(el('p', 'g1-meta num',
    sportLabel(g.sport) + ' · ' + (g.week != null ? 'Week ' + g.week : 'Week not set') + ' · '
    + membersLine((d.members || []).length)));
  head.appendChild(el('p', 'g1-ats', g.ats ? 'Picks against the spread' : 'Picks straight up - who wins'));
  head.appendChild(el('p', 'g1-role',
    isCommish ? 'You are the commissioner.' : 'Commissioner: @' + (d.commissioner || 'nobody')));
  host.appendChild(head);

  /* 🔴 A SPONSOR'S BANNER, WHEN A BUSINESS HAS PUT ONE ON THIS POOL. Jason,
   * 2026-09-12: "send a banner and we can put it on your private pool." Set
   * only by us after approval (tools/sponsor.mjs); branding only - the pool
   * stays free and nothing here touches play. Marked "Sponsored" so nobody
   * mistakes it for the app, and only an image we host under /sponsors/ is
   * ever drawn. */
  const sp = g.sponsor;
  if (sp && sp.image && String(sp.image).startsWith('/sponsors/')) {
    const box = el(sp.url ? 'a' : 'div', 'card g1-sponsor');
    if (sp.url) { box.href = sp.url; box.target = '_blank'; box.rel = 'noopener sponsored'; }
    const img = document.createElement('img');
    img.className = 'g1-sponsor-img';
    img.src = sp.image;
    img.alt = sp.name || 'Sponsor';
    img.loading = 'lazy';
    box.appendChild(img);
    box.appendChild(el('span', 'g1-sponsor-l', 'Sponsored by ' + (sp.name || 'a sponsor')));
    host.appendChild(box);
  }

  /* The invite - the commissioner's to share. Right after Create it leads. */
  let created = null;
  try { created = host.dataset.created ? JSON.parse(host.dataset.created) : null; } catch { created = null; }
  delete host.dataset.created;
  const invite = d.invite || (created && created.id === g.id ? created.invite : null);
  if (isCommish && invite) host.appendChild(inviteCard(g, invite, !!(created && created.id === g.id)));

  host.appendChild(membersBlock(d));
  host.appendChild(messagesBlock(host, d, isCommish));
  host.appendChild(doors(isCommish));
  host.appendChild(onboarding(host, data, 'another'));
  host.appendChild(leaveBlock(host, d));
}

function inviteCard(g, invite, fresh) {
  const c = el('section', 'card g1-card g1-invite');
  c.setAttribute('aria-label', 'Invite');
  c.appendChild(el('h2', 'g1-h', fresh ? 'Now invite people' : 'Invite people'));
  c.appendChild(el('p', 'g1-p', 'The group is invite-only. Send the link, or read out the code.'));
  c.appendChild(el('span', 'g1-label', 'Code'));
  c.appendChild(el('div', 'g1-code num', invite.code));
  c.appendChild(el('span', 'g1-label', 'Link'));
  const link = el('div', 'g1-link num', invite.link);
  c.appendChild(link);

  const done = el('p', 'g1-ok');
  done.setAttribute('role', 'status');
  const share = btn('g1-primary', 'Share invite', async () => {
    const text = shareText(g.name, invite.code);
    if (navigator.share) {
      try { await navigator.share({ title: 'Any Given', text, url: invite.link }); return; }
      catch (e) { if (e && e.name === 'AbortError') return; /* else fall through to copy */ }
    }
    try {
      await navigator.clipboard.writeText(text + ' ' + invite.link);
      share.textContent = 'Copied';
      share.dataset.done = 'true';
      done.textContent = 'Copied the invite link. Paste it into a text or an email.';
      return;
    } catch { /* no clipboard permission */ }
    /* Neither worked: the link is on screen - select it so it can be copied by hand. */
    try {
      const range = document.createRange();
      range.selectNodeContents(link);
      const sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(range);
    } catch { /* nothing more to do */ }
    done.textContent = 'Could not copy. The link above is selected - copy it from there.';
  });
  c.append(share, done);
  return c;
}

function membersBlock(d) {
  const sec = el('section', 'g1-sec');
  sec.setAttribute('aria-label', 'Members');
  const members = Array.isArray(d.members) ? d.members : [];
  sec.appendChild(el('h2', 'g1-sec-h num', 'Members · ' + members.length));
  const list = el('ol', 'g1-members');
  for (const m of members) {
    const li = el('li', 'g1-mem');
    li.appendChild(el('span', 'g1-mem-name', '@' + m.name));
    const tags = el('span', 'g1-tags');
    if (m.role === 'commissioner') tags.appendChild(el('span', 'g1-tag g1-tag--c', 'commissioner'));
    if (m.you) tags.appendChild(el('span', 'g1-tag g1-tag--you', 'you'));
    if (m.muted) tags.appendChild(el('span', 'g1-tag', 'muted'));
    li.appendChild(tags);
    list.appendChild(li);
  }
  sec.appendChild(list);
  if (members.length <= 1) {
    sec.appendChild(el('p', 'g1-note g1-alone',
      d.you && d.you.role === 'commissioner'
        ? 'Nobody else is in yet. Share the invite above and they appear here.'
        : 'Nobody else is in yet.'));
  }
  return sec;
}

function messagesBlock(host, d, isCommish) {
  const sec = el('section', 'g1-sec');
  sec.setAttribute('aria-label', 'Messages');
  sec.appendChild(el('h2', 'g1-sec-h', 'Messages'));
  const row = el('div', 'g1-msgbtns');
  const slot = el('div', 'g1-compose-slot');
  const muted = !!(d.you && d.you.muted);

  let open = '';
  const openCompose = (to) => {
    open = open === to ? '' : to;
    for (const b of row.children) b.setAttribute('aria-expanded', String(b.dataset.to === open));
    slot.innerHTML = '';
    if (open) slot.appendChild(compose(d, open, () => { open = ''; slot.innerHTML = '';
      for (const b of row.children) b.setAttribute('aria-expanded', 'false'); }));
  };
  /* The commissioner writing to the commissioner is writing to themselves. */
  if (!isCommish) {
    const b = btn('g1-btn', 'Email the commissioner', () => openCompose('commish'));
    b.dataset.to = 'commish';
    row.appendChild(b);
  }
  const bg = btn('g1-btn', 'Email the group', () => openCompose('group'));
  bg.dataset.to = 'group';
  row.appendChild(bg);
  for (const b of row.children) { b.setAttribute('aria-expanded', 'false'); if (muted) b.disabled = true; }
  sec.appendChild(row);
  if (muted) sec.appendChild(el('p', 'g1-note', 'The commissioner has muted your messages in this group.'));
  sec.appendChild(slot);
  return sec;
}

function compose(d, to, close) {
  const c = el('form', 'card g1-card g1-compose');
  c.noValidate = true;
  const tid = 'g1-msg-' + Math.random().toString(36).slice(2, 7);
  const who = to === 'commish'
    ? 'To the commissioner, @' + (d.commissioner || '')
    : 'To everyone in ' + d.group.name;
  const lab = el('label', 'g1-label', who);
  lab.setAttribute('for', tid);
  const count = el('span', 'g1-count num', counterText(0, MESSAGE_MAX));
  const top = el('div', 'g1-labelrow');
  top.append(lab, count);
  const ta = el('textarea', 'g1-ta');
  ta.id = tid; ta.maxLength = MESSAGE_MAX; ta.rows = 5;
  ta.placeholder = to === 'commish' ? 'Write to the commissioner…' : 'Write to the group…';
  ta.addEventListener('input', () => { count.textContent = counterText(ta.value.length, MESSAGE_MAX); });
  c.append(top, ta);
  c.appendChild(el('p', 'g1-note g1-private',
    'This goes by email through Any Given. Nobody sees anyone’s email address - not theirs, not yours. '
    + 'They see your handle.'));

  const bar = el('div', 'g1-row2');
  const cancel = btn('g1-btn', 'Cancel', close);
  const send = el('button', 'g1-primary', 'Send');
  send.type = 'submit';
  bar.append(cancel, send);
  const err = el('p', 'g1-err');
  err.setAttribute('role', 'alert');
  const ok = el('p', 'g1-ok');
  ok.setAttribute('role', 'status');
  c.append(bar, err, ok);

  c.addEventListener('submit', async (e) => {
    e.preventDefault();
    send.disabled = true; send.textContent = 'Sending…'; err.textContent = ''; ok.textContent = '';
    let r, j = null;
    try {
      r = await api('/api/group/message', { id: d.group.id, to, body: ta.value });
      try { j = await r.json(); } catch { j = null; }
    } catch {
      err.textContent = 'No connection. Your message was not sent - it is still here.';
      send.disabled = false; send.textContent = 'Send';
      return;
    }
    send.disabled = false; send.textContent = 'Send';
    if (!r.ok || !j || !j.ok) {
      /* no_mailer, muted, limit, self, empty, nobody - verbatim. */
      err.textContent = errorText(j, 'Your message was not sent.');
      return;
    }
    ta.value = '';
    count.textContent = counterText(0, MESSAGE_MAX);
    ok.textContent = 'Sent to ' + (j.sent === 1 ? '1 person.' : (j.sent || 0) + ' people.');
  });
  return c;
}

function doors(isCommish) {
  const nav = el('nav', 'card g1-doors');
  nav.setAttribute('aria-label', 'Group pages');
  const rows = [];
  if (isCommish) rows.push(['Commissioner tools', 'Invite by email, remove or mute members, change the settings.', '#/gcommish']);
  rows.push(['Group rules', 'How the group scores, when picks lock, and how ties break.', '#/grules']);
  for (const [h, b, href] of rows) {
    const a = el('a', 'g1-door');
    a.href = href;
    a.appendChild(el('span', 'g1-door-t', h));
    a.appendChild(el('span', 'g1-door-chev', '›'));
    a.appendChild(el('span', 'g1-door-b', b));
    nav.appendChild(a);
  }
  return nav;
}

function leaveBlock(host, d) {
  const sec = el('section', 'g1-sec g1-leave');
  sec.setAttribute('aria-label', 'Leave this group');
  const b = btn('g1-danger', 'Leave group', () => ask());
  sec.appendChild(b);

  /* TWO TAPS, IN THE PAGE. The first only asks; nothing is removed until the
   * second, and the question says what the second one does. */
  const ask = () => {
    b.hidden = true;
    const box = el('div', 'g1-confirm');
    box.setAttribute('role', 'group');
    box.appendChild(el('p', 'g1-confirm-q', leaveQuestion(d)));
    const row = el('div', 'g1-row2');
    const no = btn('g1-btn', 'Stay', () => { box.remove(); b.hidden = false; });
    const yes = btn('g1-danger g1-danger--solid', 'Leave group');
    const err = el('p', 'g1-err');
    err.setAttribute('role', 'alert');
    yes.addEventListener('click', async () => {
      yes.disabled = true; no.disabled = true; yes.textContent = 'Leaving…'; err.textContent = '';
      let r, j = null;
      try {
        r = await api('/api/group/leave', { id: d.group.id });
        try { j = await r.json(); } catch { j = null; }
      } catch {
        err.textContent = 'No connection. You are still in the group.';
        yes.disabled = false; no.disabled = false; yes.textContent = 'Leave group';
        return;
      }
      if (!r.ok || !j || !j.ok) {
        err.textContent = errorText(j, 'That did not work. You are still in the group.');
        yes.disabled = false; no.disabled = false; yes.textContent = 'Leave group';
        return;
      }
      forgetGroups();
      /* Cleared, so the next load picks whichever group is left - or none. */
      if (currentGroupId() === d.group.id) setCurrentGroupId('');
      refresh(host, j.closed ? d.group.name + ' is closed. You were the last one in.' : 'You left ' + d.group.name + '.');
    });
    row.append(no, yes);
    box.append(row, err);
    sec.appendChild(box);
    no.focus();
  };
  return sec;
}
