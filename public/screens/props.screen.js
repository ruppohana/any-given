/* QUESTIONS - #/props, the pool for everything ESPN does not score.
 *
 * Jason, 2026-09-13: "add cricket too, and non sports, golf, oscars, everything
 * damn it that hits a certain viewship" and "is survivor a thing?". A group whose
 * sport is 'props' plays questions: the commissioner writes them - or loads a
 * ready set, the 2026 Emmys first - everyone picks one option per question before
 * it locks, and the commissioner enters the answer. A right answer scores the
 * question's points; a question answered void scores nobody.
 *
 * The rules are src/lib/props.ts, the one copy the Worker (src/props-pool.ts)
 * uses too, so this screen cleans a question and scores a card exactly the way
 * the server does. The server is the only clock: every lock is read against the
 * `now` the server sent, carried forward on this phone's clock.
 *
 * 🔴 THE COMMISSIONER'S ANSWER IS TWO TAPS. The Emmys are entered live, with a
 * phone in one hand. Choosing the answer only selects it; a separate Save button
 * that names the answer sends it. The same rule as Remove on the commissioner's
 * page: nothing that changes everybody's score happens on one tap.
 *
 * 🔴 IT RE-DRAWS A HOST, NOT #root. The shell appends the ad slot to #root after
 * the first render (g1-group draws the same way).
 */
import { stateBlock, STATES_CSS } from '/components/states.js';
import { pageHeader, HEADER_CSS } from '/components/header.js';
import { myGroups, currentGroupId, setCurrentGroupId, groupSwitcher, forgetGroups, GROUP_CSS } from '/components/group.js';
import { cleanQuestion, isOpen, scoreProps, VOID, PROPS_LIMITS, PROP_TEMPLATES } from '/src/lib/props.js';

export const id = 'props';
export const title = 'Questions - awards, TV, anything';
export const bar = null;
export const states = ['ready', 'signed-out', 'no-group', 'loading', 'offline', 'error'];

export const PROPS_SPORT = 'props';
/** Which ready set Home's Awards & TV tile was tapped for - live-game.screen.js
 *  writes it with store.set, so it is JSON. Offered first to a commissioner. */
export const TEMPLATE_KEY = 'ag.propsTemplate';

/* ------------------------------------------------------------------ *
 * PURE - tests/props-screen.test.mjs runs these against the real
 * src/lib/props.ts and its real templates.
 * ------------------------------------------------------------------ */

/** Only the groups that play questions. */
export function propsGroupsOf(groups) {
  return (Array.isArray(groups) ? groups : []).filter((g) => g && g.id && g.sport === PROPS_SPORT);
}

/** The current group when it plays questions, else the first that does. */
export function chooseGroup(groups, currentId) {
  if (!groups || !groups.length) return null;
  return groups.find((g) => g.id === currentId) || groups[0];
}

/** The remembered ready set, if it is one this app has. */
export function rememberedTemplate(raw) {
  let v = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { /* a bare id */ } }
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(PROP_TEMPLATES, v) ? v : '';
}

const WEEK = 6 * 86400000;

/** "Locks Mon 5:00 PM" within the week, "Locks Wed, Sep 23 · 5:00 PM" past it,
 *  "Locked" from the lock on. `tz` is for the tests; the phone uses its own. */
export function lockText(q, now, tz) {
  if (!isOpen(q, now)) return 'Locked';
  const o = tz ? { timeZone: tz } : {};
  const d = new Date(q.lockAt);
  const time = d.toLocaleTimeString('en-US', { ...o, hour: 'numeric', minute: '2-digit' });
  if (q.lockAt - now < WEEK) {
    return 'Locks ' + d.toLocaleDateString('en-US', { ...o, weekday: 'short' }) + ' ' + time;
  }
  return 'Locks ' + d.toLocaleDateString('en-US', { ...o, weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + time;
}

export const pointsText = (n) => n + (n === 1 ? ' pt' : ' pts');

/** Everything one question's card shows. Counts only ever exist for a locked
 *  question (the server sends none before), and are shown only then. */
export function questionView(q, pick, counts, now) {
  const open = isOpen(q, now);
  const settled = q.answer != null;
  const voided = q.answer === VOID;
  const mine = typeof pick === 'string' && q.options.includes(pick) ? pick : '';
  const c = !open && counts && typeof counts === 'object' ? counts : null;
  let result = '', won = null, pts = null;
  if (settled && voided) { result = 'Void - this one scores nobody'; pts = 0; }
  else if (settled && !mine) { result = 'No pick - the answer was ' + q.answer; won = false; pts = 0; }
  else if (settled) {
    won = mine === q.answer;
    pts = won ? q.points : 0;
    result = won ? 'You got it · +' + q.points : 'Not this one · 0';
  } else if (!open) result = mine ? 'Locked · waiting for the answer' : 'Locked · no pick';
  return {
    qid: q.qid, text: q.text, points: q.points, open, locked: !open, settled, voided, pick: mine, won, pts, result,
    lock: lockText(q, now),
    total: c ? Object.values(c).reduce((a, n) => a + (Number(n) || 0), 0) : null,
    options: q.options.map((o) => ({
      label: o,
      on: o === mine,
      answer: settled && !voided && o === q.answer,
      count: c ? (Number(c[o]) || 0) : null
    }))
  };
}

/** The pinned line: your points so far, and how many you have right. */
export function totalLine(questions, picks) {
  const qs = Array.isArray(questions) ? questions : [];
  const s = scoreProps(qs, picks || {});
  const answered = qs.filter((q) => picks && typeof picks[q.qid] === 'string').length;
  if (!s.settled) {
    return { points: 0, text: answered ? answered + ' of ' + qs.length + ' picked · no answers in yet' : 'No picks yet' };
  }
  return { points: s.points, text: s.points + (s.points === 1 ? ' point' : ' points') + ' · ' + s.correct + ' of ' + s.settled + ' right' };
}

/** How many of a ready set are in this group - its questions are `<id>-1..n`. */
export function loadedCount(templateId, questions) {
  const pre = templateId + '-';
  return (Array.isArray(questions) ? questions : []).filter((q) => String(q.qid).startsWith(pre)).length;
}

/** The ready sets a commissioner is offered: the server's open list, the one
 *  Home remembered first, and none that is already all here. */
export function offeredTemplates(templates, remembered, questions) {
  const list = (Array.isArray(templates) ? templates : [])
    .filter((t) => t && t.id && loadedCount(t.id, questions) < (Number(t.count) || 0));
  return list.sort((a, b) => (b.id === remembered) - (a.id === remembered));
}

/** 'YYYY-MM-DDTHH:MM', local, for a datetime-local input: the next whole hour. */
export function defaultLockLocal(now) {
  const d = new Date(now);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
}

/** The add-a-question form -> what POST /api/props/questions takes, cleaned by
 *  the same cleanQuestion the server runs, or the one sentence that says why not. */
export function formQuestion(form, now) {
  const f = form || {};
  const text = String(f.text || '').trim();
  if (!text) return { ok: false, error: 'Write the question.' };
  const options = String(f.options || '').split(/\n/).map((s) => s.trim()).filter(Boolean);
  const lockAt = new Date(String(f.lock || '')).getTime();
  if (!Number.isFinite(lockAt)) return { ok: false, error: 'Choose when it locks.' };
  if (lockAt <= now) return { ok: false, error: 'Choose a lock time in the future.' };
  const q = cleanQuestion({ text, options, points: f.points, lockAt }, now);
  if (!q) return { ok: false, error: 'Give at least two different options, one per line.' };
  return { ok: true, question: q };
}

/** One sentence for a failed call: the server's own words when it sent some. */
export function failText(r, fallback) {
  if (r && r.offline) return 'No connection. Nothing was changed.';
  return (r && r.j && typeof r.j.message === 'string' && r.j.message) || fallback;
}

/* ------------------------------------------------------------------ *
 * DATA - fetched in previewData and after a tap, never during a draw.
 * ------------------------------------------------------------------ */

const apiFn = () => (typeof window !== 'undefined' && window.agApiFetch) || fetch;

/** One call. Never throws. */
export async function call(api, url, body) {
  const opts = body === undefined ? undefined
    : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
  try {
    const r = await api(url, opts);
    let j = {};
    try { j = (await r.json()) || {}; } catch { /* an empty body is still an answer */ }
    return { ok: r.ok, status: r.status, j };
  } catch { return { ok: false, status: 0, j: {}, offline: true }; }
}

function readTemplate() { try { return rememberedTemplate(localStorage.getItem(TEMPLATE_KEY)); } catch { return ''; } }
function forgetTemplate() { try { localStorage.removeItem(TEMPLATE_KEY); } catch { /* private mode */ } }

/** The screen's whole state from the Worker. Never throws. */
export async function loadProps(api, opts) {
  const base = { noSample: true, template: readTemplate() };
  const mine = await myGroups(opts);
  if (!mine || !mine.signedIn) return { ...base, view: 'signed-out' };
  if (mine.error === 'offline') return { ...base, view: 'offline' };
  if (mine.error) return { ...base, view: 'error' };
  let groups = propsGroupsOf(mine.groups);
  /* Twice at most: a cached list can name a group you have left. */
  for (let attempt = 0; attempt < 2; attempt++) {
    const g = chooseGroup(groups, currentGroupId());
    if (!g) return { ...base, view: 'no-group', otherGroups: (mine.groups || []).length };
    setCurrentGroupId(g.id);
    const r = await call(api, '/api/props?pool=' + encodeURIComponent(g.id));
    if (r.offline) return { ...base, view: 'offline', groups, groupId: g.id };
    if (r.status === 401) return { ...base, view: 'signed-out' };
    if (r.ok && Array.isArray(r.j.questions)) {
      return { ...base, view: 'ready', groups, groupId: g.id, props: r.j,
               skew: (Number(r.j.now) || Date.now()) - Date.now() };
    }
    if ((r.status === 403 || r.status === 409) && attempt === 0) {
      forgetGroups();
      setCurrentGroupId('');
      const again = await myGroups({ force: true });
      groups = propsGroupsOf(again && again.groups);
      continue;
    }
    return { ...base, view: 'error', groups, groupId: g.id, message: failText(r, 'The questions did not load.') };
  }
  return { ...base, view: 'error', message: 'The questions did not load.' };
}

export async function previewData(fixtures, state) {
  /* Only `ready` - the route a person reaches - touches the network. Nothing on
   * this screen is sample data, so the shell's banner stays off. */
  if (state && state !== 'ready') return { noSample: true, view: state };
  return loadProps(apiFn());
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
  root.classList.add('scr-props');
  const style = el('style');
  style.textContent = [STATES_CSS, HEADER_CSS, GROUP_CSS].join('\n');
  root.appendChild(style);
  const host = el('div', 'pr');
  root.appendChild(host);
  draw(host, data || {}, state);
}

let SEQ = 0;

/** Load and draw again - after a tap, a switch, a sign-in. A slower answer that a
 *  newer one has replaced is dropped. */
async function refresh(host, flash, loading) {
  const seq = ++SEQ;
  if (loading) draw(host, { view: 'loading' }, 'loading');
  const next = await loadProps(apiFn(), { force: true });
  if (seq !== SEQ || !host.isConnected) return;
  if (flash) next.flash = flash;
  draw(host, next, 'ready');
}

function draw(host, d, state) {
  host.innerHTML = '';
  const view = d.view || state || 'error';
  const p = d.props || null;
  const sub = view === 'ready' && p
    ? (p.name || 'Your group') + ' · ' + p.questions.length + (p.questions.length === 1 ? ' question' : ' questions')
    : { 'signed-out': 'Sign in to play', 'no-group': 'Awards, TV, anything', loading: 'Loading the questions…',
        offline: 'Offline', error: 'Something went wrong' }[view] || '';
  host.appendChild(pageHeader({ title: 'Questions', noTitle: true, sub }));

  if (view === 'loading') { host.appendChild(stateBlock('loading', { rows: 4, body: 'Loading the questions…' })); return; }
  if (view === 'offline') {
    host.appendChild(stateBlock('offline', { title: 'You are offline', body: 'The questions did not load. Your picks are safe.',
      action: { label: 'Try again', onClick: () => refresh(host, null, true) } }));
    return;
  }
  if (view === 'error') {
    host.appendChild(stateBlock('error', { body: d.message || 'The questions did not load. Your picks are safe.',
      action: { label: 'Try again', onClick: () => refresh(host, null, true) } }));
    return;
  }
  if (view === 'signed-out') { host.appendChild(signedOut(host)); return; }
  if (view === 'no-group') { host.appendChild(noGroup(d)); return; }
  drawReady(host, d);
}

function signedOut(host) {
  const c = el('div', 'card pr-card pr-gate');
  c.appendChild(el('h2', 'pr-h', 'Sign in to play questions'));
  c.appendChild(el('p', 'pr-p', 'Questions groups are invite-only, so they go with your account. '
    + 'Other members see your handle and nothing else.'));
  const b = btn('pr-primary', 'Sign in', async () => {
    if (typeof window === 'undefined' || !window.agOpenSignIn) return;
    b.disabled = true;
    const ok = await window.agOpenSignIn();
    b.disabled = false;
    if (ok) { forgetGroups(); refresh(host, null, true); }
  });
  c.appendChild(b);
  return c;
}

function noGroup(d) {
  const t = d.template ? PROP_TEMPLATES[d.template] : null;
  const c = el('div', 'card pr-card pr-gate');
  c.appendChild(el('h2', 'pr-h', t ? 'Start a group for ' + t.name : 'Start a questions group'));
  c.appendChild(el('p', 'pr-p', 'A questions group picks answers instead of games - the Emmys, Survivor, the Oscars, '
    + 'the Draft, cricket, anything. The commissioner writes the questions or loads a ready set, and enters the answers. '
    + 'Scored in points.'));
  const a = el('a', 'pr-primary', t ? 'Start a group for ' + t.name : 'Start a questions group');
  a.href = '#/g';
  /* The group page's Start form opens on ag.sport (g1-group chosenSport). */
  a.addEventListener('click', () => { try { localStorage.setItem('ag.sport', JSON.stringify(PROPS_SPORT)); } catch { /* private */ } });
  c.appendChild(a);
  const j = el('a', 'pr-link', 'Join one with a code');
  j.href = '#/g';
  c.appendChild(j);
  return c;
}

function drawReady(host, d) {
  const p = d.props;
  const isCommish = p.role === 'commissioner';
  const now = () => Date.now() + (Number(d.skew) || 0);
  const picks = p.picks && typeof p.picks === 'object' ? p.picks : (p.picks = {});
  const questions = p.questions.slice().sort((a, b) => a.position - b.position || String(a.qid).localeCompare(String(b.qid)));
  const redraw = () => { if (host.isConnected) draw(host, d, 'ready'); };
  const say = (tone, text) => { d.flash = null; d.status = { tone, text }; };

  /* The group, and the switch between questions groups. */
  const top = el('div', 'pr-top');
  top.appendChild(groupSwitcher(d.groups || [], d.groupId, () => refresh(host, null, true)));
  const sl = el('a', 'pr-link', 'Standings ›');
  sl.href = '#/gstandings';
  sl.addEventListener('click', () => setCurrentGroupId(d.groupId));
  top.appendChild(sl);
  host.appendChild(top);

  /* The one figure about you, pinned. */
  const tot = totalLine(questions, picks);
  const bar = el('div', 'pr-total num', tot.text);
  bar.dataset.props = d.groupId;
  host.appendChild(bar);

  const st = el('p', 'pr-status', d.status ? d.status.text : d.flash || '');
  st.setAttribute('role', 'status');
  if (d.status) st.dataset.tone = d.status.tone;
  host.appendChild(st);

  if (isCommish) host.appendChild(commishPanel(host, d, questions, now));

  if (!questions.length) {
    host.appendChild(stateBlock('empty', isCommish
      ? { title: 'No questions yet', body: 'Load a ready set above, or add your own. Everyone in the group picks once they are in.' }
      : { title: 'Your commissioner hasn’t added questions yet', body: 'They show up here as soon as they do.' }));
    return;
  }

  for (const q of questions) host.appendChild(questionCard(host, d, q, now, isCommish, say, redraw));

  host.appendChild(el('p', 'pr-foot', 'One pick a question, until it locks. Nobody sees how the group picked a question '
    + 'until it has locked. A right answer scores the points on the question; a void question scores nobody. '
    + 'Points are the only score.'));
}

/* ---------------------------------------------------------- a question */

function questionCard(host, d, q, now, isCommish, say, redraw) {
  const p = d.props;
  const v = questionView(q, p.picks[q.qid], p.counts && p.counts[q.qid], now());
  const card = el('section', 'card pr-q');
  card.dataset.qid = q.qid;
  if (v.settled) card.dataset.settled = v.voided ? 'void' : 'true';
  const head = el('div', 'pr-q-h');
  head.appendChild(el('h3', 'pr-q-t', v.text));
  head.appendChild(el('span', 'pr-q-pts num', pointsText(v.points)));
  card.appendChild(head);
  const meta = el('p', 'pr-q-lock num', v.lock + (v.total != null ? ' · ' + v.total + (v.total === 1 ? ' pick' : ' picks') : ''));
  if (v.locked) meta.dataset.locked = 'true';
  card.appendChild(meta);

  const list = el('div', 'pr-opts');
  list.setAttribute('role', 'group');
  list.setAttribute('aria-label', v.text);
  for (const o of v.options) {
    const b = el('button', 'pr-opt');
    b.type = 'button';
    b.appendChild(el('span', 'pr-opt-l', o.label));
    if (o.answer) b.appendChild(el('span', 'pr-opt-a', 'Answer'));
    if (o.count != null) b.appendChild(el('span', 'pr-opt-n num', String(o.count)));
    if (o.on) { b.dataset.on = 'true'; b.setAttribute('aria-pressed', 'true'); } else b.setAttribute('aria-pressed', 'false');
    if (o.answer) b.dataset.answer = 'true';
    if (o.on && v.settled && !v.voided) b.dataset.won = String(o.answer);
    if (!v.open) b.disabled = true;
    else b.addEventListener('click', () => pick(host, d, q, o.label, say, redraw));
    list.appendChild(b);
  }
  card.appendChild(list);

  if (v.result) {
    const r = el('p', 'pr-q-res', v.result);
    if (v.won === true) r.dataset.won = 'true';
    if (v.won === false) r.dataset.won = 'false';
    card.appendChild(r);
  }

  if (isCommish) card.appendChild(v.open ? deleteRow(host, d, q) : answerBox(host, d, q, v));
  return card;
}

/** A member's pick: shown at once, sent, and put back if the server says no. */
async function pick(host, d, q, choice, say, redraw) {
  const p = d.props;
  const before = p.picks[q.qid];
  if (before === choice) return;
  p.picks[q.qid] = choice;
  const seq = d.pickSeq = (d.pickSeq || 0) + 1;
  say('busy', 'Saving…');
  redraw();
  const r = await call(apiFn(), '/api/props/pick', { pool: d.groupId, qid: q.qid, choice });
  if (seq !== d.pickSeq) return;          /* a later pick is on its way */
  if (r.ok) { say('ok', 'Saved: ' + choice); redraw(); return; }
  if (before === undefined) delete p.picks[q.qid]; else p.picks[q.qid] = before;
  if (r.status === 409) { refresh(host, 'That question has locked. Your pick was not changed.'); return; }
  say('err', failText(r, 'That pick did not go through.'));
  redraw();
}

/** Before its lock: delete, two taps, and the second says what it does. */
function deleteRow(host, d, q) {
  const row = el('div', 'pr-admin');
  const b = btn('pr-btn pr-btn--quiet', 'Delete question', () => {
    b.hidden = true;
    const box = el('div', 'pr-confirm');
    box.appendChild(el('p', 'pr-confirm-q', 'Delete this question? Any picks on it go with it.'));
    const r2 = el('div', 'pr-row2');
    const no = btn('pr-btn', 'Keep it', () => { box.remove(); b.hidden = false; });
    const yes = btn('pr-btn pr-btn--danger', 'Delete it');
    const m = el('p', 'pr-err');
    m.setAttribute('role', 'alert');
    yes.addEventListener('click', async () => {
      yes.disabled = true; no.disabled = true; yes.textContent = 'Deleting…';
      const r = await call(apiFn(), '/api/props/delete', { pool: d.groupId, qid: q.qid });
      if (r.ok) { refresh(host, 'Question deleted.'); return; }
      yes.disabled = false; no.disabled = false; yes.textContent = 'Delete it';
      m.textContent = failText(r, 'That did not go through.');
    });
    r2.append(no, yes);
    box.append(r2, m);
    row.appendChild(box);
  });
  row.appendChild(b);
  return row;
}

/** After its lock: ENTER THE ANSWER. Choose one (or void), then Save names it. */
function answerBox(host, d, q, v) {
  const box = el('div', 'pr-ans');
  const open = d.answering === q.qid;
  if (!open) {
    const b = btn(v.settled ? 'pr-btn' : 'pr-primary', v.settled ? 'Change the answer' : 'Enter the answer', () => {
      d.answering = q.qid; d.chosen = v.settled ? q.answer : '';
      draw(host, d, 'ready');
      const again = host.querySelector('[data-qid="' + q.qid.replace(/["\\]/g, '') + '"] .pr-ans');
      if (again && again.scrollIntoView) again.scrollIntoView({ block: 'nearest' });
    });
    box.appendChild(b);
    return box;
  }
  box.dataset.open = 'true';
  box.appendChild(el('p', 'pr-ans-h', 'Which is the answer?'));
  const list = el('div', 'pr-ans-opts');
  list.setAttribute('role', 'radiogroup');
  list.setAttribute('aria-label', 'The answer to ' + q.text);
  const choices = [...q.options.map((o) => [o, o]), [VOID, 'Void - nobody scores']];
  for (const [val, label] of choices) {
    const b = btn('pr-ans-b' + (val === VOID ? ' pr-ans-b--void' : ''), label, () => { d.chosen = val; draw(host, d, 'ready'); });
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(d.chosen === val));
    if (d.chosen === val) b.dataset.on = 'true';
    list.appendChild(b);
  }
  box.appendChild(list);
  const m = el('p', 'pr-err');
  m.setAttribute('role', 'alert');
  const row = el('div', 'pr-row2');
  const cancel = btn('pr-btn', 'Cancel', () => { d.answering = null; d.chosen = ''; draw(host, d, 'ready'); });
  const label = !d.chosen ? 'Choose the answer' : d.chosen === VOID ? 'Save: void' : 'Save: ' + d.chosen;
  const save = btn('pr-primary pr-save', label, async () => {
    if (!d.chosen) return;
    save.disabled = true; cancel.disabled = true; save.textContent = 'Saving…';
    const r = await call(apiFn(), '/api/props/settle', { pool: d.groupId, qid: q.qid, answer: d.chosen });
    if (r.ok) {
      const said = d.chosen === VOID ? 'Void - nobody scores on it.' : 'Answer saved: ' + d.chosen + '.';
      d.answering = null; d.chosen = '';
      refresh(host, said);
      return;
    }
    save.disabled = false; cancel.disabled = false; save.textContent = label;
    m.textContent = failText(r, 'The answer was not saved.');
  });
  if (!d.chosen) save.disabled = true;
  row.append(cancel, save);
  box.append(row, m);
  if (v.settled) {
    const clear = btn('pr-btn pr-btn--quiet', 'Clear the answer', async () => {
      clear.disabled = true;
      const r = await call(apiFn(), '/api/props/settle', { pool: d.groupId, qid: q.qid, answer: null });
      if (r.ok) { d.answering = null; d.chosen = ''; refresh(host, 'Answer cleared. Nobody scores on it until you enter one.'); return; }
      clear.disabled = false;
      m.textContent = failText(r, 'That did not go through.');
    });
    box.appendChild(clear);
  }
  return box;
}

/* ------------------------------------------------------ the commissioner */

function commishPanel(host, d, questions, now) {
  const p = d.props;
  const panel = el('section', 'card pr-card pr-commish');
  panel.setAttribute('aria-label', 'Commissioner');
  panel.appendChild(el('h2', 'pr-h', 'Commissioner'));
  const offered = offeredTemplates(p.templates, d.template, questions);
  for (const t of offered) {
    const have = loadedCount(t.id, questions);
    const b = btn(t.id === offered[0].id ? 'pr-primary pr-tpl' : 'pr-btn pr-tpl',
      (have ? 'Load the rest of ' : 'Load ') + t.name + ' · ' + t.count + ' questions');
    b.dataset.template = t.id;
    b.addEventListener('click', async () => {
      b.disabled = true; b.textContent = 'Loading ' + t.name + '…';
      const r = await call(apiFn(), '/api/props/template', { pool: d.groupId, template: t.id });
      if (r.ok) {
        if (t.id === d.template) forgetTemplate();
        refresh(host, (Number(r.j.added) || 0) + ' questions from ' + t.name + ' added.');
        return;
      }
      b.disabled = false; b.textContent = 'Load ' + t.name;
      d.status = { tone: 'err', text: failText(r, t.name + ' did not load.') };
      draw(host, d, 'ready');
    });
    panel.appendChild(b);
    if (t.when) panel.appendChild(el('p', 'pr-note', t.when));
  }
  const slot = el('div', 'pr-addslot');
  const add = btn('pr-btn', d.adding ? 'Close' : 'Add a question', () => { d.adding = !d.adding; draw(host, d, 'ready'); });
  add.setAttribute('aria-expanded', String(!!d.adding));
  panel.appendChild(add);
  if (d.adding) slot.appendChild(addForm(host, d, now));
  panel.appendChild(slot);
  panel.appendChild(el('p', 'pr-note', questions.length
    ? 'When a question locks, its card below gets an Enter the answer button.'
    : 'Everyone in the group can pick as soon as a question is here.'));
  return panel;
}

function addForm(host, d, now) {
  const f = d.form || (d.form = { text: '', options: '', points: 1, lock: defaultLockLocal(now()) });
  const form = el('form', 'pr-form');
  form.noValidate = true;
  const field = (label, input, idp) => {
    const id = 'pr-' + idp;
    const l = el('label', 'pr-label', label);
    l.setAttribute('for', id);
    input.id = id;
    form.append(l, input);
  };
  const text = el('input', 'pr-in');
  text.type = 'text'; text.maxLength = PROPS_LIMITS.text; text.value = f.text;
  text.placeholder = 'Who wins Best Picture?';
  text.autocomplete = 'off';
  text.addEventListener('input', () => { f.text = text.value; });
  field('Question', text, 'text');
  const opts = el('textarea', 'pr-in pr-ta');
  opts.rows = 5; opts.value = f.options;
  opts.placeholder = 'One option per line';
  opts.addEventListener('input', () => { f.options = opts.value; });
  field('Options, one per line (2 to ' + PROPS_LIMITS.options + ')', opts, 'opts');
  const row = el('div', 'pr-row2');
  const pts = el('select', 'pr-in');
  for (let i = 1; i <= PROPS_LIMITS.pointsMax; i++) {
    const o = el('option', '', String(i));
    o.value = String(i);
    pts.appendChild(o);
  }
  pts.value = String(f.points || 1);
  pts.addEventListener('change', () => { f.points = Number(pts.value); });
  const lock = el('input', 'pr-in');
  lock.type = 'datetime-local'; lock.value = f.lock;
  lock.addEventListener('input', () => { f.lock = lock.value; });
  const c1 = el('div', 'pr-col'); const c2 = el('div', 'pr-col');
  const l1 = el('label', 'pr-label', 'Points'); l1.setAttribute('for', 'pr-pts'); pts.id = 'pr-pts';
  const l2 = el('label', 'pr-label', 'Locks'); l2.setAttribute('for', 'pr-lock'); lock.id = 'pr-lock';
  c1.append(l1, pts); c2.append(l2, lock);
  row.append(c1, c2);
  form.appendChild(row);
  const err = el('p', 'pr-err');
  err.setAttribute('role', 'alert');
  const go = el('button', 'pr-primary', 'Add question');
  go.type = 'submit';
  form.append(go, err);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const res = formQuestion(f, now());
    if (!res.ok) { err.textContent = res.error; return; }
    go.disabled = true; go.textContent = 'Adding…'; err.textContent = '';
    const r = await call(apiFn(), '/api/props/questions', { pool: d.groupId, questions: [res.question] });
    if (r.ok) {
      d.form = null; d.adding = false;
      refresh(host, 'Question added.');
      return;
    }
    go.disabled = false; go.textContent = 'Add question';
    err.textContent = failText(r, 'The question was not added.');
  });
  return form;
}
