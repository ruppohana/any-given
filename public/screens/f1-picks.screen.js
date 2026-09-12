/* F1 PICKS - the qualifying and race top three, the fastest lap, and two more.
 *
 * Jason, 2026-09-12: "F1, pick qualifying in p1, p2 and p3. 1st, 2nd and 3rd."
 * Then "Add final 1/2/3 fastest lap. Etc."
 *
 * Reached from Home: The Games -> Racing -> the F1 shield. Scored in POINTS -
 * src/lib/f1.ts says why it is not Marbles yet - and every pick shows what it
 * is worth before it is made, then settles off ESPN's own session results.
 * Each pick locks when its own session starts: qualifying at qualifying, the
 * race picks at the lights.
 *
 * Picks are kept on this phone for now (`ag.f1.<eventId>`), like The slate's
 * stakes; a group leaderboard is the next piece.
 */
import { stateBlock, STATES_CSS } from '/components/states.js';
import { pageHeader } from '/components/header.js';
import { POINTS, scoreWeekend, isPickLocked, sessionFor, dnfBand } from '/src/lib/f1.js';

export async function previewData(fixtures, state) {
  if (state && state !== 'ready') return {};
  try {
    const r = await fetch('/api/f1/current', { cache: 'no-store' });
    if (!r.ok) return { event: null };
    const d = await r.json();
    return { event: d.event || null, extras: d.extras || null, fromFeed: !!d.event };
  } catch { return { event: null }; }
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function load(key) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v && typeof v === 'object' ? v : {}; }
  catch { return {}; }
}

/** "Sun 6:00 AM", "On now", "Final". */
function whenText(s, now) {
  if (s.state === 'final') return 'Final';
  if (s.state === 'live' || now >= s.start) return 'On now';
  return new Date(s.start).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

function driverTag(d, fallback) {
  const t = el('span', 'f1-drv');
  const dot = el('span', 'f1-dot');
  if (d && d.color) dot.style.background = '#' + d.color;
  t.appendChild(dot);
  t.appendChild(el('span', null, d ? d.short : fallback));
  return t;
}

function ptsTag(n) {
  const p = el('span', 'f1-pts num', n == null ? '' : n > 0 ? '+' + n : '0');
  if (n > 0) p.dataset.hit = 'true';
  return p;
}

export function render(root, data, state) {
  root.classList.add('scr-f1');
  root.innerHTML = '';
  const style = el('style');
  style.textContent = STATES_CSS;
  root.appendChild(style);

  const d = data || {};
  const ev = d.event;
  /* 🔴 "RACE WEEKEND", NOT "F1 PICKS". Formula 1's guidelines allow its name
     to inform, never to brand - so the screen is named for what it is, and
     "Formula 1" appears only as the fact of which series. */
  root.appendChild(pageHeader({
    title: 'Race weekend',
    noTitle: true,
    sub: 'Formula 1' + (ev ? ' · ' + ev.name + (ev.city ? ', ' + ev.city : '') : '')
  }));
  if (state === 'loading') {
    root.appendChild(stateBlock('loading', { rows: 4, body: 'Reading the weekend…' }));
    return;
  }
  if (!ev) {
    root.appendChild(stateBlock('empty', {
      title: 'No Grand Prix on the feed',
      body: 'The next race weekend shows here as soon as ESPN lists it.'
    }));
    return;
  }

  const key = 'ag.f1.' + ev.id;
  const picks = load(key);
  const now = Date.now();
  const byId = new Map(ev.drivers.map((x) => [x.id, x]));
  const drivers = ev.drivers.slice().sort((a, b) => a.short.localeCompare(b.short));
  const save = () => { try { localStorage.setItem(key, JSON.stringify(picks)); } catch { /* private mode */ } };
  const redraw = () => render(root, d, state);
  const score = scoreWeekend(ev, picks, d.extras || null);

  /* The running total, pinned - the one figure about you rather than the race. */
  const bar = el('div', 'f1-total num', score.total + (score.total === 1 ? ' point' : ' points') + ' this weekend');
  root.appendChild(bar);
  /* What each pick is worth, before any is made - the rule on the tile. */
  root.appendChild(el('p', 'f1-rule',
    'Exact spot ' + POINTS.exact + ' · right driver, wrong spot ' + POINTS.inTop3
    + ' · fastest lap ' + POINTS.fastest + ' · retirements ' + POINTS.dnf
    + ' · pole-sitter ' + POINTS.poleWins));

  const card = (title, s) => {
    const c = el('section', 'card f1-card');
    const h = el('div', 'f1-h');
    h.appendChild(el('span', 'f1-title', title));
    if (s) h.appendChild(el('span', 'f1-when', whenText(s, now)));
    c.appendChild(h);
    root.appendChild(c);
    return c;
  };

  const driverSelect = (label, value, onPick) => {
    const sel = document.createElement('select');
    sel.className = 'f1-sel';
    sel.setAttribute('aria-label', label);
    const first = document.createElement('option');
    first.value = ''; first.textContent = 'Pick a driver';
    sel.appendChild(first);
    for (const x of drivers) {
      const o = document.createElement('option');
      o.value = x.id;
      o.textContent = x.short + (x.team ? ' · ' + x.team : '') + (x.number ? ' #' + x.number : '');
      sel.appendChild(o);
    }
    sel.value = value || '';
    sel.addEventListener('change', () => onPick(sel.value));
    return sel;
  };

  /* Three slots - P1, P2, P3. The same driver cannot sit in two of them. */
  const top3 = (k, title) => {
    const s = sessionFor(ev, k);
    if (!s) return;
    const c = card(title, s);
    const locked = isPickLocked(ev, k, now);
    const mine = Array.isArray(picks[k]) ? picks[k].slice() : [];
    const res = score[k];
    for (let i = 0; i < 3; i++) {
      const row = el('div', 'f1-row');
      row.appendChild(el('span', 'f1-pos num', 'P' + (i + 1)));
      if (locked) {
        row.appendChild(driverTag(byId.get(mine[i]), 'No pick'));
        const a = s.state === 'final' ? byId.get(s.order[i]) : null;
        row.appendChild(el('span', 'f1-actual', a ? a.short : ''));
        row.appendChild(ptsTag(res ? res[i] : null));
      } else {
        row.appendChild(driverSelect(title + ' P' + (i + 1), mine[i], (v) => {
          const next = Array.isArray(picks[k]) ? picks[k].slice() : ['', '', ''];
          for (let j = 0; j < 3; j++) if (j !== i && next[j] === v) next[j] = '';
          next[i] = v;
          picks[k] = next;
          save(); redraw();
        }));
      }
      c.appendChild(row);
    }
  };

  const choices = (c, k, opts, locked, result) => {
    const row = el('div', 'f1-choices');
    row.setAttribute('role', 'group');
    for (const [v, label] of opts) {
      const b = el('button', 'f1-choice', label);
      b.type = 'button';
      if (picks[k] === v) b.dataset.on = 'true';
      if (locked) b.disabled = true;
      else b.addEventListener('click', () => { picks[k] = v; save(); redraw(); });
      row.appendChild(b);
    }
    c.appendChild(row);
    if (result) c.appendChild(result);
  };

  top3('qual', 'Qualifying top 3');
  top3('sprint', 'Sprint top 3');
  top3('race', 'Race top 3');

  const race = sessionFor(ev, 'race');
  const qual = sessionFor(ev, 'qual');
  if (race) {
    const raceLocked = isPickLocked(ev, 'fastest', now);

    const f = card('Fastest lap', race);
    const frow = el('div', 'f1-row f1-row-one');
    if (raceLocked) {
      frow.appendChild(driverTag(byId.get(picks.fastest), 'No pick'));
      const who = d.extras && d.extras.fastest ? byId.get(d.extras.fastest) : null;
      frow.appendChild(el('span', 'f1-actual', who ? who.short : ''));
      frow.appendChild(ptsTag(score.fastest));
    } else {
      frow.appendChild(driverSelect('Fastest lap', picks.fastest, (v) => { picks.fastest = v; save(); redraw(); }));
    }
    f.appendChild(frow);

    const pole = qual && qual.state === 'final' ? byId.get(qual.order[0]) : null;
    const p = card(pole ? 'Does ' + pole.short + ' win from pole?' : 'Does the pole-sitter win?', race);
    choices(p, 'poleWins', [['yes', 'Yes'], ['no', 'No']], raceLocked,
      score.poleWins == null ? null : ptsTag(score.poleWins));

    const r = card('How many retire?', race);
    choices(r, 'dnf', [['0', 'None'], ['1-2', '1–2'], ['3+', '3 or more']], raceLocked,
      score.dnf == null ? null : (() => {
        const n = el('p', 'f1-note', (d.extras && Number.isFinite(d.extras.retired) ? d.extras.retired + ' retired · ' : '')
          + (score.dnf > 0 ? '+' + score.dnf : '0'));
        return n;
      })());
  }

  root.appendChild(el('p', 'f1-note f1-foot',
    'Picks are saved on this phone. Results come from the published session order; a pick locks when its session starts. '
    + 'Any Given is not associated in any way with the Formula 1 companies.'));
}
