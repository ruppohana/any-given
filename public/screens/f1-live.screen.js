/* F1 RACE REPLAY - the live picks, played lap by lap on a finished race.
 *
 * Jason, 2026-09-12: "build the f1 live picks on the free history". The race
 * comes off OpenF1's public timing history (src/f1-replay.ts); the picks and
 * their settling are src/lib/f1-live.ts, the same functions a live race will
 * use. Step the race a lap at a time, call what happens next - who pits, who
 * sets the next fastest lap, a safety car, whether the leader holds, whether a
 * gap closes - and each call settles the lap it is answered. Nothing after the
 * lap on screen is read.
 *
 * Reached from Race weekend (#/f1). Scored in points; kept on this phone
 * (`ag.f1live.<session>`).
 */
import { stateBlock, STATES_CSS } from '/components/states.js';
import { pageHeader } from '/components/header.js';
import { offers, scoreLive, lapTime, bestAt, lapOf, LIVE_POINTS } from '/src/lib/f1-live.js';

const RACE_KEY = 'ag.f1live.race';

async function getJson(u) {
  const r = await fetch(u, { cache: 'no-store' });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

export async function previewData(fixtures, state) {
  if (state && state !== 'ready') return {};
  try {
    const { races } = await getJson('/api/f1/replays');
    if (!races || !races.length) return { races: [], tl: null };
    let key = null;
    try { key = Number(localStorage.getItem(RACE_KEY)); } catch { /* private mode */ }
    if (!races.some((r) => r.key === key)) key = races[0].key;
    const tl = await getJson('/api/f1/replay/' + key);
    return { races, key, tl };
  } catch { return { races: [], tl: null, failed: true }; }
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function load(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    if (v && typeof v === 'object' && Array.isArray(v.picks)) return v;
  } catch { /* fall through */ }
  return { lap: 0, picks: [] };
}

export function render(root, data, state) {
  root.classList.add('scr-f1l');
  root.innerHTML = '';
  const style = el('style');
  style.textContent = STATES_CSS;
  root.appendChild(style);

  const d = data || {};
  const tl = d.tl;
  root.appendChild(pageHeader({
    title: 'Race replay', noTitle: true,
    sub: 'Formula 1' + (tl ? ' · ' + tl.meeting + (tl.circuit ? ', ' + tl.circuit : '') : '')
  }));
  if (state === 'loading') {
    root.appendChild(stateBlock('loading', { rows: 4, body: 'Loading the race…' }));
    return;
  }
  if (!tl) {
    root.appendChild(stateBlock(d.failed ? 'error' : 'empty', d.failed
      ? { title: 'The timing history did not answer', body: 'Try again in a minute.' }
      : { title: 'No finished race yet', body: 'A race shows here an hour after the chequered flag.' }));
    return;
  }

  const key = 'ag.f1live.' + tl.session;
  const st = load(key);
  const lap = Math.max(0, Math.min(tl.laps, Number(st.lap) || 0));
  const save = () => { try { localStorage.setItem(key, JSON.stringify(st)); } catch { /* private mode */ } };
  const redraw = () => render(root, d, state);
  const byN = new Map(tl.drivers.map((x) => [x.n, x]));
  const acr = (n) => (byN.get(Number(n)) || { acr: String(n) }).acr;
  const score = scoreLive(tl, st.picks, lap);

  /* Another race, if there is more than one finished. */
  if (d.races && d.races.length > 1) {
    const sel = document.createElement('select');
    sel.className = 'f1l-sel f1l-race';
    sel.setAttribute('aria-label', 'Race');
    for (const r of d.races) {
      const o = document.createElement('option');
      o.value = String(r.key);
      o.textContent = r.name + ' · ' + new Date(r.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      sel.appendChild(o);
    }
    sel.value = String(tl.session);
    sel.addEventListener('change', async () => {
      try { localStorage.setItem(RACE_KEY, sel.value); } catch { /* private mode */ }
      sel.disabled = true;
      try { d.tl = await getJson('/api/f1/replay/' + sel.value); } catch { d.tl = null; d.failed = true; }
      redraw();
    });
    root.appendChild(sel);
  }

  /* The lap and the total, pinned. */
  const bar = el('div', 'f1l-bar');
  bar.appendChild(el('span', 'f1l-lap num', lap === 0 ? 'Lights out' : lap >= tl.laps ? 'Chequered flag' : 'Lap ' + lap + ' of ' + tl.laps));
  bar.appendChild(el('span', 'f1l-total num', score.total + (score.total === 1 ? ' point' : ' points')));
  root.appendChild(bar);

  const ctl = el('div', 'f1l-ctl');
  const step = (label, n, cls) => {
    const b = el('button', 'f1l-btn' + (cls ? ' ' + cls : ''), label);
    b.type = 'button';
    const to = n === 0 ? 0 : Math.min(tl.laps, lap + n);
    if ((n > 0 && lap >= tl.laps) || (n === 0 && lap === 0)) b.disabled = true;
    b.addEventListener('click', () => {
      if (n === 0) st.picks = [];
      st.lap = to; save(); redraw();
    });
    ctl.appendChild(b);
  };
  step('Start over', 0, 'is-quiet');
  step('+5 laps', 5);
  step(lap === 0 ? 'Go' : 'Next lap', 1, 'is-main');
  root.appendChild(ctl);

  /* What happened on this lap - the feed line. */
  const inLap = [];
  if (lap > 0) {
    for (const n of tl.neutral) if (lapOf(tl, n.t) === lap) inLap.push(n.kind === 'RED' ? 'Red flag' : n.kind === 'SC' ? 'Safety car' : 'Virtual safety car');
    for (const p of tl.pits) if (lapOf(tl, p.t) === lap) inLap.push(acr(p.d) + ' pits');
    for (const b of tl.bests) if (b.lap > 1 && lapOf(tl, b.t) === lap) inLap.push(acr(b.d) + ' fastest lap ' + lapTime(b.s));
  }
  const now = el('section', 'card f1l-card');
  const nh = el('div', 'f1l-h');
  nh.appendChild(el('span', 'f1l-title', 'Running order'));
  const b = bestAt(tl, tl.ends[lap]);
  if (b && lap > 1) nh.appendChild(el('span', 'f1l-dim', 'Fastest ' + acr(b.d) + ' ' + lapTime(b.s)));
  now.appendChild(nh);
  if (inLap.length) now.appendChild(el('p', 'f1l-feed', inLap.join(' · ')));
  /* Top five by default: at 393px a ten-row order pushed every call below the
     fold, so each "Next lap" tap meant a scroll to see what you had called. */
  const order = tl.order[lap] || [];
  const shown = st.all ? order : order.slice(0, 5);
  const list = el('ol', 'f1l-order');
  shown.forEach((n, i) => {
    const li = el('li', 'f1l-o');
    li.appendChild(el('span', 'f1l-pos num', String(i + 1)));
    const drv = el('span', 'f1l-drv');
    const dot = el('span', 'f1l-dot');
    const x = byN.get(n);
    if (x && x.color) dot.style.background = '#' + x.color;
    drv.appendChild(dot);
    drv.appendChild(el('span', null, acr(n)));
    if (x && x.team) drv.appendChild(el('span', 'f1l-team', x.team));
    li.appendChild(drv);
    const g = (tl.gaps[lap] || [])[i];
    li.appendChild(el('span', 'f1l-gap num', i === 0 ? (lap ? 'Leader' : 'Pole') : g == null ? '' : '+' + g.toFixed(1)));
    list.appendChild(li);
  });
  now.appendChild(list);
  if (order.length > 5) {
    const more = el('button', 'f1l-more', st.all ? 'Top five' : 'All ' + order.length);
    more.type = 'button';
    more.addEventListener('click', () => { st.all = !st.all; save(); redraw(); });
    now.appendChild(more);
  }
  root.appendChild(now);

  /* The calls open at this lap - one of each kind at a time. */
  const openKinds = new Set(score.rows.filter((r) => r.res.state === 'open').map((r) => r.pick.kind));
  const offerList = lap < tl.laps ? offers(tl, lap) : [];
  if (offerList.length) root.appendChild(el('h2', 'f1l-sec', 'Call it'));
  for (const o of offerList) {
    const c = el('section', 'card f1l-card');
    const h = el('div', 'f1l-h');
    h.appendChild(el('span', 'f1l-title', o.q));
    h.appendChild(el('span', 'f1l-worth num', 'Worth ' + o.points));
    c.appendChild(h);
    if (o.note) c.appendChild(el('p', 'f1l-dim', o.note));
    const mine = score.rows.find((r) => r.res.state === 'open' && r.pick.kind === o.kind);
    if (mine) {
      c.appendChild(el('p', 'f1l-mine', 'Your call: ' + mine.pick.label + ' · made on lap ' + mine.pick.lap
        + (mine.pick.by ? ' · settles after lap ' + mine.pick.by : ' · settles when it happens')));
    } else {
      const call = (v, label) => {
        st.picks.push({ kind: o.kind, lap, choice: v, q: o.q, label, by: o.by });
        save(); redraw();
      };
      if (o.options.length <= 2) {
        const row = el('div', 'f1l-choices');
        for (const [v, label] of o.options) {
          const btn = el('button', 'f1l-choice', label);
          btn.type = 'button';
          btn.addEventListener('click', () => call(v, label));
          row.appendChild(btn);
        }
        c.appendChild(row);
      } else {
        const sel = document.createElement('select');
        sel.className = 'f1l-sel';
        sel.setAttribute('aria-label', o.q);
        const first = document.createElement('option');
        first.value = ''; first.textContent = 'Pick a driver';
        sel.appendChild(first);
        for (const [v, label] of o.options) {
          const opt = document.createElement('option');
          opt.value = v;
          const x = byN.get(Number(v));
          opt.textContent = label + (x && x.team ? ' · ' + x.team : '');
          sel.appendChild(opt);
        }
        sel.addEventListener('change', () => { if (sel.value) call(sel.value, sel.selectedOptions[0].textContent.split(' · ')[0]); });
        c.appendChild(sel);
      }
    }
    root.appendChild(c);
  }
  /* Open calls whose kind is not on offer any more (the window ran past the race). */
  for (const r of score.rows) {
    if (r.res.state !== 'open' || offerList.some((o) => o.kind === r.pick.kind)) continue;
    const c = el('section', 'card f1l-card');
    c.appendChild(el('span', 'f1l-title', r.pick.q));
    c.appendChild(el('p', 'f1l-mine', 'Your call: ' + r.pick.label + ' · made on lap ' + r.pick.lap));
    root.appendChild(c);
  }

  const done = score.rows.filter((r) => r.res.state !== 'open').reverse();
  if (done.length) {
    root.appendChild(el('h2', 'f1l-sec', 'Settled'));
    const c = el('section', 'card f1l-card');
    for (const r of done) {
      const row = el('div', 'f1l-res');
      const txt = el('div', 'f1l-rtxt');
      txt.appendChild(el('span', 'f1l-rq', 'Lap ' + r.pick.lap + ' · ' + r.pick.q));
      txt.appendChild(el('span', 'f1l-dim', 'You: ' + r.pick.label + ' · '
        + (r.res.state === 'void' ? 'Void - ' + (r.res.why || '') : 'It was: ' + r.res.answer)
        + (r.res.at != null ? ' (lap ' + r.res.at + ')' : '')));
      row.appendChild(txt);
      const p = el('span', 'f1l-pts num', r.res.state === 'void' ? 'Void' : r.res.points > 0 ? '+' + r.res.points : '0');
      p.dataset.state = r.res.state;
      row.appendChild(p);
      c.appendChild(row);
    }
    root.appendChild(c);
  }

  root.appendChild(el('p', 'f1l-dim f1l-foot',
    'A finished race, replayed from public timing data (OpenF1). Nothing after the lap on screen is read. '
    + 'Driver picks are worth ' + LIVE_POINTS.pitNext + ', yes-or-no calls ' + LIVE_POINTS.neutral10
    + '. A race stopped with a red flag voids the calls open across it, except the safety-car call. '
    + 'Any Given is not associated in any way with the Formula 1 companies.'));
}
