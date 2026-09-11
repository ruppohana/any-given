/* G2 - THE COMMISSIONER'S TOOLS. #/gcommish, under the group bar's Info tab.
 *
 * Jason, 2026-09-11: "if i stated the group i am the commisiner. and can set up
 * the different rules ... the commish should be able to kick someone out of the
 * group as well as send other invites asa they see fit. they are responsible to
 * kindness."
 *
 * So this screen is four jobs and a promise, for ONE group - the current one,
 * `pickCurrent()` from components/group.js, changed by the switcher at the top:
 *
 *   THE PROMISE   the kindness line the commissioner accepted, shown first,
 *                 because every control below it is how the promise is kept
 *   THE NAME      rename, 40 characters (src/lib/groups.ts LIMITS.nameMax)
 *   THE SPREAD    the group's against-the-spread setting
 *   INVITES       the code and link to share, and an email box
 *   MEMBERS       mute and remove, per member, never on yourself
 *
 * WHAT EACH CONTROL ACTUALLY DOES, read off src/groups.ts rather than assumed:
 *
 *   MUTE blocks /api/group/message and nothing else. A muted member still picks
 *   and still sits on the standings. The copy says exactly that.
 *
 *   REMOVE deletes the member's picks in this group, deletes the membership and
 *   writes a pool_removed row - so /api/group/join answers 403 `removed` from then
 *   on, code or no code. There is no undo in the API, so it takes two taps, the
 *   second on an in-page confirm row that says they cannot rejoin.
 *
 *   THE SPREAD SETTING is stored on the pool row. /api/pool/standings scores a
 *   group straight up (src/worker.ts: "Straight up, which is what a group pool
 *   is") and never reads it. So the line under the switch says the setting is
 *   saved and the standings still count winners - it does not promise a scoring
 *   change the server does not make.
 *
 *   INVITES take up to 20 addresses a batch. The server keeps the first 20 valid
 *   ones and drops the rest WITHOUT listing them in `bad`, so this screen counts
 *   before it sends and refuses a 21st rather than letting it vanish.
 *
 * EMAIL ADDRESSES: members are handles. The only addresses this screen ever
 * prints are the ones the commissioner typed that did not parse (`bad[]`) - their
 * own input, echoed back so they can fix it.
 *
 * DATA arrives from previewData (the one place a group screen may call the API,
 * CONTRACT-GROUPS.md §3). A person's tap calls the API from its handler, then the
 * screen reloads its data and repaints. Every error `message` is shown verbatim.
 */
import { myGroups, pickCurrent, groupSwitcher, forgetGroups, GROUP_CSS,
         SCOPE_CHOICES, scopeText, scopeNote, collegeConferences } from '/components/group.js';
import { pageHeader, HEADER_CSS } from '/components/header.js';
import { stateBlock, STATES_CSS } from '/components/states.js';

export const id = 'g2-commish';
export const title = 'Commissioner - rename, invite, mute and remove';
export const bar = null;
export const states = ['ready', 'empty', 'not-commish', 'no-group', 'signed-out', 'loading', 'offline', 'error'];

/* src/lib/groups.ts LIMITS, restated because a browser module cannot import a
 * .ts file. tests/g2-commish.test.mjs holds these equal to the real LIMITS. */
const NAME_MAX = 40;
const BATCH_MAX = 20;

/* States the design harness draws without a network. Everything else is read
 * from the Worker, and the view it lands on is decided by what comes back. */
const STATIC = ['loading', 'offline', 'error', 'signed-out', 'no-group'];

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
const sportName = (s) => (s === 'nfl' ? 'NFL' : 'College football');
const at = (name) => '@' + String(name || '');

/** One API call. Never throws; `offline` is a network failure, not a status. */
async function call(url, body) {
  const f = (typeof window !== 'undefined' && window.agApiFetch) || fetch;
  const opts = body === undefined ? undefined : {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  };
  try {
    const r = await f(url, opts);
    let j = {};
    try { j = (await r.json()) || {}; } catch { /* an empty body is still an answer */ }
    return { ok: r.ok, status: r.status, j };
  } catch {
    return { ok: false, status: 0, j: {}, offline: true };
  }
}

/** Everything the screen draws, from the Worker. */
async function load(opts) {
  const base = { noSample: true };
  const mine = await myGroups(opts);
  if (!mine.signedIn) return { ...base, view: 'signed-out' };
  if (mine.error === 'offline') return { ...base, view: 'offline' };
  if (mine.error) return { ...base, view: 'error', message: '' };
  const groups = mine.groups || [];
  if (!groups.length) return { ...base, view: 'no-group', groups };

  const g = pickCurrent(groups);
  const out = { ...base, groups, currentId: g.id, kindness: mine.kindness || '',
                conferences: g.sport === 'nfl' ? [] : await collegeConferences() };
  const r = await call('/api/group/detail?id=' + encodeURIComponent(g.id));
  if (r.offline) return { ...out, view: 'offline' };
  if (r.status === 401) return { ...out, view: 'signed-out' };
  if (!r.ok) return { ...out, view: 'error', message: r.j.message || '' };
  const detail = r.j;
  if (!detail.you || detail.you.role !== 'commissioner') return { ...out, view: 'not-commish', detail };
  return { ...out, view: 'ready', detail };
}

export async function previewData(fixtures, state) {
  /* Nothing on this screen is made up, so the shell's sample-data banner stays
   * off (app.js reads `noSample`). */
  if (STATIC.includes(state)) return { noSample: true, view: state };
  return load();
}

/** The distinct things typed into the email box - the count the 20 applies to. */
function typed(text) {
  const seen = new Set();
  for (const t of String(text || '').split(/[\s,;]+/)) {
    const v = t.trim().toLowerCase();
    if (v) seen.add(v);
  }
  return [...seen];
}

let SEQ = 0;

export function render(root, data, state) {
  root.innerHTML = '';
  root.classList.add('scr-g2-commish');
  const style = el('style');
  style.textContent = [STATES_CSS, HEADER_CSS, GROUP_CSS].join('\n');
  root.appendChild(style);
  const host = el('div', 'g2');
  root.appendChild(host);

  /* Reload and repaint INSIDE the host, so anything the shell put beside it (the
   * ad slot) survives an action. The sequence number drops a slow answer that a
   * newer one has already replaced - two quick switches must not land out of
   * order. */
  async function refresh(opts, flash) {
    const seq = ++SEQ;
    if (opts && opts.loading) paint({ view: 'loading', groups: null });
    const next = await load(opts && opts.force ? { force: true } : undefined);
    if (seq !== SEQ) return;
    if (flash) next.flash = flash;
    paint(next);
  }

  paint(data || {});

  function paint(d) {
    host.textContent = '';
    const view = d.view || (STATIC.includes(state) ? state : 'error');
    const detail = d.detail || null;
    const group = detail && detail.group;

    let sub = null;
    if (view === 'ready' && group) {
      sub = plural((detail.members || []).length, 'member', 'members') + ' · ' + sportName(group.sport);
    } else if (view === 'not-commish' && detail && detail.commissioner) {
      sub = 'Run by ' + at(detail.commissioner);
    }
    host.appendChild(pageHeader({ title: 'Commissioner', noTitle: true, sub }));

    /* THE SWITCHER, on every view that knows your groups - including a group
     * that failed to load, so a broken one never traps you in it. */
    if (d.groups && d.groups.length && ['ready', 'not-commish', 'error', 'offline'].includes(view)) {
      const top = el('div', 'g2-top');
      top.appendChild(groupSwitcher(d.groups, d.currentId, () => refresh({ loading: true })));
      host.appendChild(top);
    }

    if (view === 'loading') {
      host.appendChild(stateBlock('loading', { rows: 5, body: 'Loading your group…' }));
      return;
    }
    if (view === 'offline') {
      host.appendChild(stateBlock('offline', {
        body: 'Your group could not be reached. Nothing was changed.',
        action: { label: 'Try again', onClick: () => refresh({ loading: true, force: true }) }
      }));
      return;
    }
    if (view === 'error') {
      host.appendChild(stateBlock('error', {
        body: d.message || 'Your group did not load.',
        action: { label: 'Try again', onClick: () => refresh({ loading: true, force: true }) }
      }));
      return;
    }
    if (view === 'signed-out') { paintSignedOut(); return; }
    if (view === 'no-group') { paintNoGroup(); return; }
    if (view === 'not-commish') { paintNotCommish(d); return; }
    paintReady(d);
  }

  /* ---------------------------------------------------------------- doors */

  function door(href, t, b) {
    const a = el('a', 'g2-door');
    a.href = href;
    a.appendChild(el('span', 'g2-door-t', t));
    a.appendChild(el('span', 'g2-chev', '›'));
    a.appendChild(el('span', 'g2-door-b', b));
    return a;
  }

  function doors() {
    const nav = el('nav', 'g2-card g2-doors');
    nav.setAttribute('aria-label', 'Group');
    nav.appendChild(door('#/g', 'Group page', 'Members, messages and the group’s home.'));
    nav.appendChild(door('#/grules', 'Group rules', 'How picks in this group are scored.'));
    return nav;
  }

  function goButton(href, label) {
    const a = el('a', 'g2-btn g2-btn--primary g2-go', label);
    a.href = href;
    return a;
  }

  /* ---------------------------------------------------------------- the other states */

  function paintSignedOut() {
    const box = stateBlock('empty', {
      title: 'Sign in to run your group',
      body: 'Groups are people who know each other by handle, so they need an account.'
    });
    const b = el('button', 'g2-btn g2-btn--primary g2-go', 'Sign in');
    b.type = 'button';
    const msg = el('p', 'g2-msg');
    msg.setAttribute('role', 'status');
    b.addEventListener('click', async () => {
      if (typeof window === 'undefined' || !window.agOpenSignIn) {
        msg.textContent = 'Sign-in is not available on this page.';
        return;
      }
      const ok = await window.agOpenSignIn();
      if (ok) { forgetGroups(); await refresh({ loading: true, force: true }); }
    });
    box.append(b, msg);
    host.appendChild(box);
  }

  function paintNoGroup() {
    const box = stateBlock('empty', {
      title: 'You are not in a group yet',
      body: 'Start a group or join one with a code on the group page. Whoever starts a group is its commissioner.'
    });
    box.appendChild(goButton('#/g', 'Go to the group page'));
    host.appendChild(box);
  }

  function paintNotCommish(d) {
    const detail = d.detail || {};
    const group = detail.group || {};
    const box = el('div', 'g2-card g2-only');
    box.appendChild(el('p', 'g2-only-t', 'Only the commissioner can change this group'));
    box.appendChild(el('p', 'g2-only-b',
      (detail.commissioner ? at(detail.commissioner) + ' is the commissioner of ' + (group.name || 'this group') + '. '
        : '') + 'You can write to them from the group page.'));
    /* If you run a different group, say which, and the switcher above takes you. */
    const mineToRun = (d.groups || []).filter((x) => x.role === 'commissioner' && x.id !== d.currentId);
    if (mineToRun.length) {
      box.appendChild(el('p', 'g2-note',
        'You are the commissioner of ' + mineToRun.map((x) => x.name).join(', ') + '. Pick it in the list above.'));
    }
    box.appendChild(goButton('#/g', 'Back to the group page'));
    host.appendChild(box);
    host.appendChild(doors());
  }

  /* ---------------------------------------------------------------- ready */

  function paintReady(d) {
    const detail = d.detail;
    const group = detail.group;
    const members = detail.members || [];
    const flashFor = (where) => {
      if (!d.flash || d.flash.where !== where) return null;
      const p = el('p', 'g2-msg g2-msg--ok', d.flash.text);
      p.setAttribute('role', 'status');
      return p;
    };

    /* 1 - THE PROMISE. First, because it is what every control below is for. */
    const kind = detail.kindness || d.kindness || '';
    if (kind) {
      const pr = el('section', 'g2-card g2-promise');
      pr.setAttribute('aria-label', 'Your promise as commissioner');
      pr.appendChild(el('p', 'g2-k g2-k--accent', 'Your promise as commissioner'));
      pr.appendChild(el('p', 'g2-promise-t', kind));
      host.appendChild(pr);
    }

    host.appendChild(nameSection(group, flashFor('name')));
    host.appendChild(atsSection(group, flashFor('ats')));
    if (group.sport !== 'nfl') host.appendChild(scopeSection(group, d.conferences || [], flashFor('scope')));
    if (detail.invite) host.appendChild(inviteSection(group, detail.invite));
    host.appendChild(membersSection(group, members, flashFor('members')));
    host.appendChild(doors());
  }

  function section(labelText, forId) {
    const s = el('section', 'g2-sec');
    const h = el(forId ? 'label' : 'h2', 'g2-h', labelText);
    if (forId) h.setAttribute('for', forId);
    s.appendChild(h);
    return { s, h };
  }

  function msgLine() {
    const m = el('p', 'g2-msg');
    m.setAttribute('role', 'status');
    return m;
  }
  function say(m, text, kind) {
    m.textContent = text || '';
    m.className = 'g2-msg' + (kind ? ' g2-msg--' + kind : '');
  }

  /* ---- the name ---- */
  function nameSection(group, flash) {
    const { s } = section('Group name', 'g2-name');
    const form = el('form', 'g2-card');
    form.setAttribute('novalidate', '');
    const row = el('div', 'g2-row');
    const inp = el('input', 'g2-in');
    inp.id = 'g2-name';
    inp.type = 'text';
    inp.maxLength = NAME_MAX;
    inp.setAttribute('maxlength', String(NAME_MAX));
    inp.setAttribute('autocomplete', 'off');
    inp.value = group.name || '';
    const save = el('button', 'g2-btn g2-btn--primary', 'Save');
    save.type = 'submit';
    row.append(inp, save);
    const count = el('p', 'g2-meta num');
    const m = msgLine();
    const sync = () => {
      count.textContent = String(inp.value || '').length + ' of ' + NAME_MAX;
      save.disabled = String(inp.value || '').trim() === String(group.name || '').trim();
    };
    sync();
    inp.addEventListener('input', () => { sync(); say(m, ''); });
    form.addEventListener('submit', async (e) => {
      if (e && e.preventDefault) e.preventDefault();
      if (save.disabled) return;
      save.disabled = true;
      save.textContent = 'Saving…';
      const r = await call('/api/group/settings', { id: group.id, name: inp.value });
      if (r.ok) {
        /* The name is in every screen's cached group list - drop it. */
        forgetGroups();
        await refresh(undefined, { where: 'name', text: 'Group name saved.' });
        return;
      }
      save.textContent = 'Save';
      save.disabled = false;
      say(m, r.j.message || (r.offline ? 'No connection. Nothing was changed.' : 'That did not save.'), 'bad');
    });
    form.append(row, count, m);
    if (flash) form.appendChild(flash);
    s.appendChild(form);
    return s;
  }

  /* ---- against the spread ---- */
  function atsSection(group, flash) {
    const { s, h } = section('Pick against the spread');
    h.id = 'g2-ats-l';
    const card = el('div', 'g2-card');
    const on = !!group.ats;
    const sw = el('button', 'g2-switch');
    sw.type = 'button';
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-checked', String(on));
    sw.setAttribute('aria-labelledby', 'g2-ats-l');
    sw.appendChild(el('span', 'g2-switch-t', on ? 'On' : 'Off'));
    const track = el('span', 'g2-track');
    track.appendChild(el('span', 'g2-knob'));
    sw.appendChild(track);
    /* Worded to what the server does today - see the header of this file. */
    const note = el('p', 'g2-note',
      'On: a pick counts when its team covers the spread it was picked at, and a spread that lands exactly counts for nobody. Off: pick who wins.');
    const m = msgLine();
    sw.addEventListener('click', async () => {
      if (sw.disabled) return;
      sw.disabled = true;
      const r = await call('/api/group/settings', { id: group.id, ats: !on });
      if (r.ok) {
        forgetGroups();
        await refresh(undefined, { where: 'ats', text: !on ? 'Against the spread is on.' : 'Against the spread is off.' });
        return;
      }
      sw.disabled = false;
      say(m, r.j.message || (r.offline ? 'No connection. Nothing was changed.' : 'That did not save.'), 'bad');
    });
    card.append(sw, note, m);
    if (flash) card.appendChild(flash);
    s.appendChild(card);
    return s;
  }

  /* ---- which games (a college group) ----
   * Jason, 2026-09-11: "We need a toggle for when setting up the group or the
   * [commissioner] can change. When looking at the games for that group you should
   * only see what is configured for the group." */
  function scopeSection(group, confs, flash) {
    const { s, h } = section('Which games');
    h.id = 'g2-scope-l';
    const card = el('div', 'g2-card');
    const cur = { scope: group.scope || 'all', arg: group.scopeArg || '' };
    let pick = cur.scope, arg = cur.arg;
    const seg = el('div', 'g2-seg');
    seg.setAttribute('role', 'radiogroup');
    seg.setAttribute('aria-labelledby', 'g2-scope-l');
    const btns = SCOPE_CHOICES.map((o) => {
      const b = el('button', 'g2-seg-b', o.label);
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.dataset.v = o.value;
      b.addEventListener('click', () => { pick = o.value; paint(); });
      seg.appendChild(b);
      return b;
    });
    const sel = el('select', 'g2-sel');
    sel.setAttribute('aria-label', 'Conference');
    const ph = el('option', '', confs.length ? 'Choose a conference' : 'The conference list loads with this week’s games');
    ph.value = '';
    sel.appendChild(ph);
    const names = confs.map((c) => c.name);
    /* The group's own conference stays choosable in a week it has no games. */
    if (cur.arg && !names.includes(cur.arg)) names.unshift(cur.arg);
    for (const n of names) {
      const c = confs.find((x) => x.name === n);
      const o = el('option', '', n + (c ? ' · ' + c.count + (c.count === 1 ? ' game' : ' games') + ' this week' : ''));
      o.value = n;
      sel.appendChild(o);
    }
    sel.value = arg;
    sel.addEventListener('change', () => { arg = sel.value; paint(); });
    const note = el('p', 'g2-note', '');
    const save = el('button', 'g2-btn g2-btn--primary g2-wide', 'Save');
    save.type = 'button';
    const m = msgLine();
    function paint() {
      for (const b of btns) b.setAttribute('aria-checked', String(b.dataset.v === pick));
      sel.hidden = pick !== 'conference';
      note.textContent = scopeNote(pick) + ' Changing it changes the games everyone in the group sees, '
        + 'starting now. Picks already made still count.';
      const same = pick === cur.scope && (pick !== 'conference' || arg === cur.arg);
      save.disabled = same || (pick === 'conference' && !arg);
    }
    paint();
    save.addEventListener('click', async () => {
      if (save.disabled) return;
      save.disabled = true;
      save.textContent = 'Saving…';
      const r = await call('/api/group/settings',
        { id: group.id, scope: pick, scopeArg: pick === 'conference' ? arg : null });
      if (r.ok) {
        forgetGroups();
        await refresh(undefined, { where: 'scope', text: 'This group now picks from ' + scopeText(pick, arg) + '.' });
        return;
      }
      save.textContent = 'Save';
      paint();
      say(m, r.j.message || (r.offline ? 'No connection. Nothing was changed.' : 'That did not save.'), 'bad');
    });
    card.append(seg, sel, note, save, m);
    if (flash) card.appendChild(flash);
    s.appendChild(card);
    return s;
  }

  /* ---- invites ---- */
  function inviteSection(group, invite) {
    const { s } = section('Invite');

    const share = el('div', 'g2-card g2-inv');
    share.appendChild(el('p', 'g2-k', 'Invite code'));
    /* SHOWN, not only copied: six characters with no vowels, made to be read
     * aloud or typed on another device. */
    share.appendChild(el('p', 'g2-code num', invite.code));
    share.appendChild(el('p', 'g2-link', invite.link));
    const sb = el('button', 'g2-btn g2-btn--primary g2-wide', 'Share invite');
    sb.type = 'button';
    const sm = msgLine();
    sb.addEventListener('click', async () => {
      const text = 'Join ' + group.name + ' on Any Given. Code ' + invite.code;
      const nav = typeof navigator !== 'undefined' ? navigator : {};
      if (nav.share) {
        try { await nav.share({ title: group.name, text, url: invite.link }); return; }
        catch (e) { if (e && e.name === 'AbortError') return; /* else fall back */ }
      }
      try {
        await nav.clipboard.writeText(text + ' ' + invite.link);
        say(sm, 'Copied', 'ok');
        return;
      } catch { /* no clipboard permission */ }
      say(sm, 'Copy the link above to share it.');
    });
    share.append(sb, sm);
    s.appendChild(share);

    const mail = el('div', 'g2-card g2-mail');
    const lab = el('label', 'g2-k', 'Invite by email');
    lab.setAttribute('for', 'g2-emails');
    const ta = el('textarea', 'g2-in g2-ta');
    ta.id = 'g2-emails';
    ta.rows = 3;
    ta.setAttribute('rows', '3');
    ta.setAttribute('autocomplete', 'off');
    ta.setAttribute('spellcheck', 'false');
    ta.setAttribute('placeholder', 'Type or paste email addresses');
    const meta = el('p', 'g2-meta num');
    const send = el('button', 'g2-btn g2-btn--primary g2-wide', 'Send invitations');
    send.type = 'button';
    const m = msgLine();
    const badBox = el('div', 'g2-badbox');
    const sync = () => {
      const n = typed(ta.value).length;
      meta.textContent = n + ' of ' + BATCH_MAX + ' · separate with commas, spaces or new lines';
      send.disabled = n === 0;
    };
    sync();
    ta.addEventListener('input', () => { sync(); say(m, ''); badBox.textContent = ''; });
    const showBad = (bad) => {
      badBox.textContent = '';
      if (!bad || !bad.length) return;
      badBox.appendChild(el('p', 'g2-bad-h', 'These did not look like email addresses:'));
      const ul = el('ul', 'g2-bad');
      for (const b of bad) ul.appendChild(el('li', null, b));
      badBox.appendChild(ul);
    };
    send.addEventListener('click', async () => {
      const n = typed(ta.value).length;
      if (!n || send.disabled) return;
      /* The server keeps the first 20 and drops the rest unreported, so a 21st
       * is refused here, before anything is sent. */
      if (n > BATCH_MAX) {
        say(m, 'That is ' + n + ' addresses. Send ' + BATCH_MAX + ' at a time.', 'bad');
        return;
      }
      send.disabled = true;
      send.textContent = 'Sending…';
      const r = await call('/api/group/invite', { id: group.id, emails: ta.value });
      send.textContent = 'Send invitations';
      send.disabled = false;
      const bad = Array.isArray(r.j.bad) ? r.j.bad : [];
      if (r.ok) {
        const sent = Number(r.j.sent) || 0;
        if (sent > 0) {
          say(m, 'Sent ' + plural(sent, 'invitation', 'invitations') + '.', 'ok');
          /* What did not parse stays in the box, so it can be fixed in place. */
          ta.value = bad.join('\n');
          sync();
        } else {
          say(m, 'None of the invitations went out. Try again in a moment.', 'bad');
        }
      } else {
        say(m, r.j.message || (r.offline ? 'No connection. Nothing was sent.' : 'The invitations did not go out.'), 'bad');
      }
      showBad(bad);
    });
    mail.append(lab, ta, meta, send, m, badBox,
      el('p', 'g2-note', 'Invitations come from Any Given, signed with your handle. Your email address is not shown to anyone.'));
    s.appendChild(mail);
    return s;
  }

  /* ---- members ---- */
  function membersSection(group, members, flash) {
    const { s } = section('Members · ' + members.length);
    s.appendChild(el('p', 'g2-note g2-note--top',
      'Mute stops someone sending messages to you or the group. They can still pick and stay on the standings.'));
    if (flash) s.appendChild(flash);

    const list = el('ul', 'g2-card g2-members');
    let openConfirm = null;     // one confirm row open at a time

    for (const mem of members) {
      const li = el('li', 'g2-m');
      const row = el('div', 'g2-m-row');
      const who = el('div', 'g2-m-who');
      who.appendChild(el('span', 'g2-m-name', at(mem.name)));
      const tags = el('span', 'g2-tags');
      if (mem.you) tags.appendChild(el('span', 'g2-tag', 'you'));
      if (mem.role === 'commissioner') tags.appendChild(el('span', 'g2-tag g2-tag--c', 'commissioner'));
      if (mem.muted) tags.appendChild(el('span', 'g2-tag g2-tag--m', 'muted'));
      if (tags.children && tags.children.length !== 0) who.appendChild(tags);
      row.appendChild(who);
      li.appendChild(row);

      /* NEVER ON YOURSELF. The server refuses it too (400 `self`); the screen
       * does not offer it. */
      if (!mem.you) {
        const act = el('div', 'g2-m-act');
        const mute = el('button', 'g2-btn', mem.muted ? 'Unmute' : 'Mute');
        mute.type = 'button';
        mute.setAttribute('aria-label', (mem.muted ? 'Unmute ' : 'Mute ') + at(mem.name));
        const rm = el('button', 'g2-btn g2-btn--danger', 'Remove');
        rm.type = 'button';
        rm.setAttribute('aria-label', 'Remove ' + at(mem.name));
        act.append(mute, rm);
        row.appendChild(act);
        const m = msgLine();
        li.appendChild(m);

        mute.addEventListener('click', async () => {
          if (mute.disabled) return;
          mute.disabled = true;
          const r = await call('/api/group/mute', { id: group.id, ref: mem.ref, muted: !mem.muted });
          if (r.ok) {
            await refresh(undefined, { where: 'members', text: mem.muted
              ? at(mem.name) + ' can send messages again.'
              : at(mem.name) + ' is muted. They can still pick.' });
            return;
          }
          mute.disabled = false;
          say(m, r.j.message || (r.offline ? 'No connection. Nothing was changed.' : 'That did not go through.'), 'bad');
        });

        /* TAP ONE: open the confirm row. Nothing is sent. */
        rm.addEventListener('click', () => {
          if (openConfirm && openConfirm.li !== li) openConfirm.close();
          if (openConfirm && openConfirm.li === li) return;
          const box = el('div', 'g2-confirm');
          box.appendChild(el('p', 'g2-confirm-t',
            'Remove ' + at(mem.name) + ' from ' + group.name + '? Their picks in this group are deleted, and they cannot rejoin this group, even with the code.'));
          const bRow = el('div', 'g2-row g2-row--end');
          const keep = el('button', 'g2-btn', 'Keep ' + at(mem.name));
          keep.type = 'button';
          const yes = el('button', 'g2-btn g2-btn--danger-fill', 'Remove ' + at(mem.name));
          yes.type = 'button';
          const cm = msgLine();
          bRow.append(keep, yes);
          box.append(bRow, cm);
          li.appendChild(box);
          const close = () => { box.remove(); openConfirm = null; };
          openConfirm = { li, close };
          keep.addEventListener('click', close);
          /* TAP TWO: the only thing on this screen that sends a remove. */
          yes.addEventListener('click', async () => {
            if (yes.disabled) return;
            yes.disabled = true;
            keep.disabled = true;
            yes.textContent = 'Removing…';
            const r = await call('/api/group/remove', { id: group.id, ref: mem.ref });
            if (r.ok) {
              forgetGroups();
              await refresh(undefined, { where: 'members',
                text: at(mem.name) + ' was removed. They cannot rejoin ' + group.name + '.' });
              return;
            }
            yes.disabled = false;
            keep.disabled = false;
            yes.textContent = 'Remove ' + at(mem.name);
            say(cm, r.j.message || (r.offline ? 'No connection. Nobody was removed.' : 'That did not go through.'), 'bad');
          });
        });
      }
      list.appendChild(li);
    }
    s.appendChild(list);
    if (members.filter((x) => !x.you).length === 0) {
      s.appendChild(el('p', 'g2-note', 'Nobody else is in ' + group.name + ' yet. Share the invite above.'));
    }
    return s;
  }
}
