/* NASCAR RACE DAY - the race top three, the winning make, the pole, a dark horse.
 *
 * Jason, 2026-09-12: "do nascar next". A NASCAR group plays the Cup race in
 * POINTS, the way an F1 group plays the weekend (public/screens/f1-picks.screen.js,
 * which this screen follows piece for piece). What each pick is worth is on the
 * screen before any pick is made, and it settles off ESPN's published finishing
 * order - src/lib/nascar.ts holds the rules, this file only draws them.
 *
 * 🔴 THREE SERIES, ONE SCREEN. Jason, 2026-09-13: "add the O'Reilly and Truck
 * series too". The route id IS the series - #/nascar (Cup), #/nascar-oreilly,
 * #/nascar-truck (app.js ROUTES) - and it is also the group's sport and the
 * feed's ?series=. Anything else is the Cup. The Cup keeps every address it
 * had: /api/nascar/current with no query, `ag.nascar.<eventId>`,
 * `ag.nascar.group` - so nobody's Cup picks vanish. The other two use
 * `ag.<series>.<eventId>` and `ag.<series>.group`. The winning-make choices come
 * from the field (makesOf), because the Truck Series fields RAM.
 *
 * Everything locks at once, at the green flag (`isLocked` - the race's start
 * time). There are no sessions, so there is one lock, not one per card.
 *
 * Picks are always kept on this phone (`ag.<series>.<eventId>`).
 *
 * 🔴 AND A NASCAR GROUP PLAYS IT TOGETHER, ON THE SERVER. With one or more
 * groups of this series the race is picked FOR a group - "Playing in" chooses
 * which (`ag.<series>.group`), the server's picks are shown over this phone's, and every
 * change is saved here AND posted whole to /api/pool/racepick. After the green
 * flag the server keeps what it had whatever the phone sends, so its answer
 * REPLACES what is shown - never the other way round. Signed out, or in no
 * group of this series, the screen plays on this phone alone, plus one line to #/g.
 *
 * 🔴 "RACE DAY", NOT "NASCAR PICKS". NASCAR's marks may say which series this
 * is and nothing more - so the name appears only on the sub line, as a fact.
 */
import { stateBlock, STATES_CSS } from '/components/states.js';
import { pageHeader } from '/components/header.js';
import { myGroups, setCurrentGroupId } from '/components/group.js';
import { NPOINTS, makesOf, DARK_HORSE_FROM, isLocked, poleSitter, isDarkHorse, scoreNascar } from '/src/lib/nascar.js';

/* ---- the series, pure - tests/nascar-picks-series.test.mjs ---- */

/** NASCAR's three national series, keyed by route id = group sport = feed series. */
export const SERIES = {
  nascar: { chip: 'Cup', label: 'Cup Series', race: 'Cup race', invite: 'start a NASCAR group' },
  /* 🔴 THE OLD XFINITY SERIES. Jason, 2026-09-13: "The NASCAR O'Reilly Auto Parts
     Series is just the renamed Xfinity Series, effective 2026 ... Same series, new
     name." The label stays the server's (ESPN's) name; `aka` tells a fan who knows
     the old one, once, in the header - never on the chip. */
  'nascar-oreilly': { chip: "O'Reilly", label: "O'Reilly Auto Parts Series", aka: 'formerly Xfinity', race: "O'Reilly race", invite: "start a NASCAR O'Reilly group" },
  'nascar-truck': { chip: 'Trucks', label: 'Truck Series', race: 'Truck Series race', invite: 'start a NASCAR Truck group' }
};
export const SERIES_IDS = Object.keys(SERIES);

/** One of the three, or the Cup. */
export function seriesOf(s) {
  return Object.prototype.hasOwnProperty.call(SERIES, String(s)) ? String(s) : 'nascar';
}

/** '#/nascar-truck' -> 'nascar-truck'; anything else -> 'nascar'. */
export function seriesFromHash(hash) {
  return seriesOf(String(hash || '').replace(/^#\/?/, '').split(/[?&/]/)[0]);
}

function currentSeries() {
  return seriesFromHash(typeof location !== 'undefined' && location ? location.hash : '');
}

/** The Cup keeps the address it has always read; the other two name themselves. */
export function feedUrl(series) {
  const s = seriesOf(series);
  return s === 'nascar' ? '/api/nascar/current' : '/api/nascar/current?series=' + encodeURIComponent(s);
}

/** "NASCAR Cup Series · World Wide Technology Raceway" - the series as a fact. */
export function subLine(series, ev) {
  const s = SERIES[seriesOf(series)];
  return 'NASCAR ' + s.label + (s.aka ? ' (' + s.aka + ')' : '') + (ev && ev.track ? ' · ' + ev.track : '');
}

/** The empty state's line - the Truck Series may be between races. */
export function emptyBody(series) {
  return 'The next ' + SERIES[seriesOf(series)].race + ' shows here as soon as ESPN lists it.';
}

/** The switch at the top: all three, each a link to its own route, this one marked. */
export function seriesChips(current) {
  const c = seriesOf(current);
  return SERIES_IDS.map((id) => ({ id, label: SERIES[id].chip, href: '#/' + id, on: id === c }));
}

/* ---- the group, pure - tests/nascar-picks.test.mjs ---- */

/** Which NASCAR group this phone last played in. Not `ag.group`: that is the
 *  group section's current group, written only by components/group.js. */
export const NASCAR_GROUP_KEY = 'ag.nascar.group';
export const PICK_KEYS = ['race', 'make', 'poleWins', 'darkHorse'];
/** 🔴 The Cup's keys are the ones it always had - 'ag.nascar.group' and
 *  'ag.nascar.<eventId>' - because the Cup's series id is 'nascar'. */
export const groupKey = (series) => 'ag.' + seriesOf(series) + '.group';
/** This phone's copy of one race's picks. */
export const localKey = (eventId, series) => 'ag.' + seriesOf(series) + '.' + eventId;

/** Only the groups that play THIS series' race day - a Truck group never
 *  appears on the Cup, and the other way round. */
export function nascarGroupsOf(groups, series) {
  const s = seriesOf(series);
  return (Array.isArray(groups) ? groups : []).filter((g) => g && g.sport === s);
}

/** The remembered group if it is still one of mine, else the first. */
export function chooseNascarGroup(groups, storedId) {
  if (!groups || !groups.length) return null;
  return groups.find((g) => g.id === storedId) || groups[0];
}

/** A pick that says something: a named driver in any slot, or a chosen answer. */
export function hasPick(v) {
  if (Array.isArray(v)) return v.some((x) => typeof x === 'string' && x !== '');
  return typeof v === 'string' && v !== '';
}

const copy = (v) => (Array.isArray(v) ? v.slice() : v);

/** SERVER OVER LOCAL, key by key. The group's stored pick wins; this phone's
 *  fills a gap only while the race is still open - a pick the server never had
 *  cannot count once the green flag has dropped, so the group view does not
 *  show it. `locked` is one boolean: every pick locks at the same moment. */
export function mergeNascarPicks(server, local, locked) {
  const s = server && typeof server === 'object' ? server : {};
  const l = local && typeof local === 'object' ? local : {};
  const out = {};
  for (const k of PICK_KEYS) {
    if (hasPick(s[k])) out[k] = copy(s[k]);
    else if (!locked && hasPick(l[k])) out[k] = copy(l[k]);
  }
  return out;
}

/** The picks shown that the group does not have yet. */
export function unsentKeys(picks, server) {
  const s = server && typeof server === 'object' ? server : {};
  return PICK_KEYS.filter((k) => hasPick(picks && picks[k]) && JSON.stringify(picks[k]) !== JSON.stringify(s[k]));
}

/** POST /api/pool/racepick's body: the whole picks object, three slots for the
 *  top three with '' for an empty one, an unset answer left out. */
export function nascarPickPayload(pool, eventId, picks) {
  const p = picks && typeof picks === 'object' ? picks : {};
  const out = {};
  for (const k of PICK_KEYS) {
    const v = p[k];
    if (k === 'race') {
      if (Array.isArray(v)) out.race = [0, 1, 2].map((i) => (typeof v[i] === 'string' ? v[i] : ''));
    } else if (typeof v === 'string' && v !== '') out[k] = v;
  }
  return { pool: String(pool), eventId: String(eventId), picks: out };
}

/** This phone's copy after the server answers: what was stored replaces what
 *  was sent, and nothing the server did not mention is thrown away. */
export function keepLocal(local, stored) {
  return Object.assign({}, local && typeof local === 'object' ? local : {}, stored && typeof stored === 'object' ? stored : {});
}

/** One line, and it always says the picks are still here. */
export function groupErrorText(status, loading) {
  const head = status === 0 ? 'Offline.'
    : status === 401 ? 'Sign in to play with your group.'
    : status === 403 ? 'You are not in this group now.'
    : status === 400 ? 'This group does not play race day.'
    : status === 404 ? 'No race on the server yet.'
    : loading ? 'Your group picks did not load.' : 'Not saved with your group.';
  return head + (loading ? ' Showing the picks on this phone.' : ' Kept on this phone.');
}

/** Save the whole picks object for a group. Never throws.
 *  -> { kind: 'ok', picks } | { kind: 'over', eventId } | { kind: 'error', status, text } */
export async function postNascarPicks(api, pool, eventId, picks) {
  let r;
  try {
    r = await api('/api/pool/racepick', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(nascarPickPayload(pool, eventId, picks))
    });
  } catch { return { kind: 'error', status: 0, text: groupErrorText(0, false) }; }
  let j = null;
  try { j = await r.json(); } catch { j = null; }
  if (r.ok && j && j.picks && typeof j.picks === 'object') return { kind: 'ok', picks: j.picks };
  if (r.status === 409 && j && j.error === 'event_over') return { kind: 'over', eventId: j.eventId || null };
  return { kind: 'error', status: r.status, text: groupErrorText(r.status, false) };
}

/** A group's picks for this race, shown over this phone's. Picks the phone has
 *  and the group does not are sent once, so what is shown is what counts.
 *  -> { picks, stored, status, moved? } - `stored` is the server's copy, or null
 *  when it could not be read. Never throws. */
export async function loadGroupPicks(api, ev, group, local, now) {
  const err = (text) => ({ tone: 'err', text });
  const mine = keepLocal(local, null);
  let r;
  try { r = await api('/api/pool/racepicks?pool=' + encodeURIComponent(group.id)); }
  catch { return { picks: mine, stored: null, status: err(groupErrorText(0, true)) }; }
  let j = null;
  try { j = await r.json(); } catch { j = null; }
  if (!r.ok || !j) return { picks: mine, stored: null, status: err(groupErrorText(r.status, true)) };
  if (String(j.eventId) !== String(ev.id)) {
    return { moved: true, picks: mine, stored: null, status: err('That race is over. Reload for the next one.') };
  }
  const server = j.picks && typeof j.picks === 'object' ? j.picks : {};
  const picks = mergeNascarPicks(server, local, isLocked(ev, now));
  if (!unsentKeys(picks, server).length) return { picks, stored: server, status: null };
  const res = await postNascarPicks(api, group.id, ev.id, picks);
  if (res.kind === 'ok') {
    return { picks: res.picks, stored: res.picks, status: { tone: 'ok', text: 'The picks on this phone were added to ' + group.name + '.' } };
  }
  if (res.kind === 'over') return { moved: true, picks, stored: server, status: err('That race is over. Reload for the next one.') };
  return { picks, stored: server, status: err(res.text) };
}

/* ---- what is drawn, pure - tests/nascar-picks.test.mjs ---- */

/** 1st, 2nd, 3rd, 4th ... 11th, 12th, 13th ... 21st. */
export function ordinal(n) {
  const v = Math.abs(Math.trunc(Number(n)));
  if (!Number.isFinite(v)) return String(n);
  const t = v % 100;
  const s = t >= 11 && t <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[v % 10] || 'th';
  return v + s;
}

/** What each pick is worth, before any is made - built from NPOINTS, so the
 *  line cannot say one thing while the scorer does another. */
export function ruleLine(points) {
  const p = points || NPOINTS;
  return 'Exact spot ' + p.exact + ' · right driver, wrong spot ' + p.inTop3
    + ' · winning make ' + p.make + ' · pole-sitter wins ' + p.poleWins
    + ' · dark horse ' + p.darkHorse;
}

/** The dark horse card's one line, off the same threshold the server uses. */
export function darkHorseLine() {
  return 'Starts ' + ordinal(DARK_HORSE_FROM) + ' or worse, finishes in the top ten';
}

/** "#22 Logano" - the car, for a locked pick and a result. */
export function carTag(d) {
  if (!d) return '';
  return (d.number ? '#' + d.number + ' ' : '') + d.short;
}

/** "#22 Logano · Ford" - a driver option. */
export function driverLabel(d) {
  return carTag(d) + (d && d.make ? ' · ' + d.make : '');
}

const byNumber = (a, b) => (Number(a.number) || 999) - (Number(b.number) || 999) || a.short.localeCompare(b.short);

/** Every car, by number - the order the label leads with. */
export function raceOptions(ev) {
  return ev.drivers.slice().sort(byNumber).map((d) => ({ value: d.id, label: driverLabel(d) }));
}

/** The winning-make choices: the makes in THIS field (makesOf - the one the
 *  server validates against), so a Truck race offers RAM and the Cup does not. */
export function makeChoices(ev) {
  return makesOf(ev).map((m) => [m, m]);
}

/** The dark horse choices: cars that start 11th or worse, from the back of the
 *  front ten down. `keep` (the stored pick) is always offered so a pick made
 *  before the grid was set is never hidden. */
export function darkHorseOptions(ev, keep) {
  const list = ev.drivers.filter((d) => isDarkHorse(ev, d.id) || d.id === keep);
  list.sort((a, b) => (a.start || 999) - (b.start || 999) || byNumber(a, b));
  return list.map((d) => ({ value: d.id, label: driverLabel(d) + (d.start ? ' · starts ' + ordinal(d.start) : '') }));
}

/** The top three after `v` goes in slot `i`: one driver never sits in two slots,
 *  so the other slot holding `v` is emptied. */
export function placeInSlot(race, i, v) {
  const next = Array.isArray(race) ? [0, 1, 2].map((j) => (typeof race[j] === 'string' ? race[j] : '')) : ['', '', ''];
  for (let j = 0; j < 3; j++) if (j !== i && v && next[j] === v) next[j] = '';
  next[i] = v || '';
  return next;
}

/** "Does Logano win from pole?" - or, with no grid yet, the question unnamed. */
export function poleQuestion(ev) {
  const p = poleSitter(ev);
  return p ? 'Does ' + p.short + ' win from pole?' : 'Does the pole-sitter win?';
}

/** "Locks at the green flag · Sun 12:00 PM", "Locked at the green flag", "Final". */
export function lockText(ev, now) {
  if (ev.state === 'final') return 'Final';
  if (isLocked(ev, now)) return 'Locked at the green flag';
  return 'Locks at the green flag · ' + new Date(ev.start).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

/** Everything a card shows: open or locked, the pick, and once final the actual
 *  result and the points. Points are null until final - never 0, which would
 *  read as a miss. */
export function raceDayView(ev, picks, now) {
  const p = picks && typeof picks === 'object' ? picks : {};
  const by = new Map(ev.drivers.map((d) => [d.id, d]));
  const locked = isLocked(ev, now);
  const score = scoreNascar(ev, p);
  const final = score.race !== null;
  const mine = Array.isArray(p.race) ? p.race : [];
  const race = [0, 1, 2].map((i) => {
    const id = typeof mine[i] === 'string' ? mine[i] : '';
    return {
      pos: 'P' + (i + 1), pick: id,
      pickText: by.has(id) ? carTag(by.get(id)) : 'No pick',
      actualText: final ? carTag(by.get(ev.order[i])) : '',
      pts: final ? score.race[i] : null
    };
  });
  const winner = final ? by.get(ev.order[0]) : null;
  const pole = poleSitter(ev);
  let poleText = '';
  if (final && pole) {
    const at = ev.order.indexOf(pole.id);
    poleText = at === 0 ? pole.short + ' won from pole'
      : at > 0 ? pole.short + ' finished ' + ordinal(at + 1) : pole.short + ' did not finish';
  }
  const dh = typeof p.darkHorse === 'string' ? p.darkHorse : '';
  const dhAt = dh ? ev.order.indexOf(dh) : -1;
  return {
    locked, final,
    total: score.total,
    totalText: score.total + (score.total === 1 ? ' point' : ' points') + ' this race',
    race,
    make: {
      pick: makesOf(ev).includes(p.make) ? p.make : '',
      actualText: winner ? winner.short + ' · ' + (winner.make || '') : '',
      pts: final ? score.make : null
    },
    poleWins: {
      title: poleQuestion(ev),
      pick: p.poleWins === 'yes' || p.poleWins === 'no' ? p.poleWins : '',
      actualText: poleText,
      pts: final ? score.poleWins : null
    },
    darkHorse: {
      pick: dh,
      pickText: by.has(dh) ? carTag(by.get(dh)) : 'No pick',
      actualText: final && dh ? (dhAt >= 0 ? 'Finished ' + ordinal(dhAt + 1) : 'Not classified') : '',
      pts: final ? score.darkHorse : null
    }
  };
}

/* ---- the data ---- */

const api = () => (typeof window !== 'undefined' && window.agApiFetch) || fetch;

function readChoice(series) { try { return localStorage.getItem(groupKey(series)) || ''; } catch { return ''; } }
function writeChoice(id, series) { try { localStorage.setItem(groupKey(series), String(id)); } catch { /* private mode */ } }

async function readEvent(series) {
  try {
    const r = await api()(feedUrl(series), { cache: 'no-store' });
    if (!r.ok) return { event: null, noSample: true, series };
    const d = await r.json();
    /* A feed that answers for another series is not this race. */
    const ev = (d && d.event && (!d.series || d.series === series)) ? d.event : null;
    /* Off the real feed, so the app's "Sample data - made up" banner stays off
       (app.js reads fromFeed / noSample). Found signed in at 393px, 2026-09-13:
       the banner sat over the live WWT race. */
    return { event: ev, fromFeed: !!ev, noSample: true, series };
  } catch { return { event: null, noSample: true, series }; }
}

/** One group's picks into `out`, and this phone's copy brought level. */
async function playIn(out, g, series) {
  const key = localKey(out.event.id, series);
  const local = load(key);
  const res = await loadGroupPicks(api(), out.event, g, local, Date.now());
  if (res.stored) { try { localStorage.setItem(key, JSON.stringify(keepLocal(local, res.stored))); } catch { /* private mode */ } }
  return Object.assign(out, { groupId: g.id, picks: res.picks, status: res.status, moved: !!res.moved });
}

/** `series` defaults to the route (location.hash); render's re-read passes its own. */
export async function previewData(fixtures, state, series) {
  if (state && state !== 'ready') return {};
  const s = seriesOf(series || currentSeries());
  let out = { event: null };
  /* Twice at most: a server already on the next race means the feed is read again. */
  for (let tries = 0; tries < 2; tries++) {
    out = await readEvent(s);
    if (!out.event) return out;
    /* myGroups() asks nothing of a phone that is not signed in, so a stranger
       never meets the sign-in sheet here. */
    const mine = await myGroups();
    out.groups = nascarGroupsOf(mine && mine.groups, s);
    out.signedIn = !!(mine && mine.signedIn);
    out.groupsError = (mine && mine.error) || null;
    const g = chooseNascarGroup(out.groups, readChoice(s));
    if (!g) return out;
    writeChoice(g.id, s);
    await playIn(out, g, s);
    if (!out.moved) break;
  }
  return out;
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

function ptsTag(n) {
  const p = el('span', 'nas-pts num', n == null ? '' : n > 0 ? '+' + n : '0');
  if (n > 0) p.dataset.hit = 'true';
  return p;
}

/** Cup · O'Reilly · Trucks - links, so the other races are one tap away. */
function seriesNav(series) {
  const nav = el('nav', 'nas-series');
  nav.setAttribute('aria-label', 'NASCAR series');
  for (const c of seriesChips(series)) {
    const a = el('a', 'nas-chip', c.label);
    a.href = c.href;
    if (c.on) { a.dataset.on = 'true'; a.setAttribute('aria-current', 'page'); }
    nav.appendChild(a);
  }
  return nav;
}

export function render(root, data, state) {
  root.classList.add('scr-nascar');
  root.innerHTML = '';
  const style = el('style');
  style.textContent = STATES_CSS;
  root.appendChild(style);

  const d = data || {};
  /* The series the data was read for; the route when there is none (loading). */
  const series = seriesOf(d.series || currentSeries());
  const S = SERIES[series];
  const ev = d.event;
  root.appendChild(pageHeader({
    title: 'Race day',
    noTitle: true,
    sub: subLine(series, ev)
  }));
  root.appendChild(seriesNav(series));
  if (state === 'loading') {
    root.appendChild(stateBlock('loading', { rows: 4, body: 'Reading race day…' }));
    return;
  }
  if (!ev) {
    root.appendChild(stateBlock('empty', {
      title: 'No race on the feed',
      body: emptyBody(series)
    }));
    return;
  }

  const key = localKey(ev.id, series);
  const groups = Array.isArray(d.groups) ? d.groups : [];
  const group = groups.find((g) => g.id === d.groupId) || null;
  /* In a group the picks are the group's, held on `d` across redraws; alone
     they are this phone's, read fresh each time. */
  if (group && (!d.picks || typeof d.picks !== 'object')) d.picks = {};
  const picks = group ? d.picks : load(key);
  const now = Date.now();
  const redraw = () => render(root, d, state);
  /* A reply that lands after you have left the screen must not draw it back. */
  const mounted = () => !!root.querySelector('[data-nascar-race="' + ev.id + '"]');
  const writeLocal = (v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode */ } };
  const reread = async () => {
    const fresh = await previewData(null, 'ready', series);
    if (!mounted()) return;
    for (const k of Object.keys(d)) delete d[k];
    Object.assign(d, fresh);
    redraw();
  };
  const send = () => {
    const seq = d.seq = (d.seq || 0) + 1;
    const g = group;
    d.status = { tone: 'busy', text: 'Saving with ' + g.name + '…' };
    postNascarPicks(api(), g.id, ev.id, picks).then((res) => {
      if (seq !== d.seq) return;             /* a later change is on its way */
      if (res.kind === 'ok') {
        d.picks = res.picks;                 /* what was STORED, not what was sent */
        writeLocal(keepLocal(load(key), res.picks));
        d.status = { tone: 'ok', text: 'Saved with ' + g.name };
      } else if (res.kind === 'over') {
        d.status = { tone: 'busy', text: 'That race is over. Reading the next one…' };
        if (mounted()) redraw();
        reread();
        return;
      } else {
        d.status = { tone: 'err', text: res.text };
      }
      if (mounted()) redraw();
    });
  };
  const save = () => {
    if (!group) { writeLocal(picks); return; }
    writeLocal(keepLocal(load(key), picks));  /* here first, whatever the network does */
    send();
  };
  const v = raceDayView(ev, picks, now);
  const locked = v.locked;

  /* The running total, pinned - the one figure about you rather than the race. */
  const bar = el('div', 'nas-total num', v.totalText);
  bar.dataset.nascarRace = ev.id;
  root.appendChild(bar);

  if (group) {
    /* PLAYING IN. A dropdown only when there is a choice, the name as plain
       text with one - as components/group.js draws it. */
    const gc = el('section', 'card nas-card nas-group');
    const row = el('div', 'nas-grow');
    const lab = el('label', 'nas-glabel', 'Playing in');
    row.appendChild(lab);
    if (groups.length > 1) {
      const sel = document.createElement('select');
      sel.className = 'nas-sel';
      sel.id = 'nas-group-' + ev.id;
      lab.setAttribute('for', sel.id);
      for (const g of groups) {
        const o = document.createElement('option');
        o.value = g.id; o.textContent = g.name;
        sel.appendChild(o);
      }
      sel.value = group.id;
      sel.addEventListener('change', () => {
        const g = groups.find((x) => x.id === sel.value);
        if (!g) return;
        writeChoice(g.id, series);
        d.groupId = g.id;
        d.picks = keepLocal(load(key), null);  /* this phone's, until the group answers */
        d.seq = (d.seq || 0) + 1;            /* drop any reply for the old group */
        d.status = { tone: 'busy', text: 'Reading ' + g.name + '…' };
        redraw();
        const seq = d.seq;
        const next = { event: ev };
        playIn(next, g, series).then(() => {
          if (seq !== d.seq) return;         /* switched again, or picked meanwhile */
          if (next.moved) { reread(); return; }
          Object.assign(d, { groupId: next.groupId, picks: next.picks, status: next.status });
          if (mounted()) redraw();
        });
      });
      row.appendChild(sel);
    } else {
      row.appendChild(el('span', 'nas-gname', group.name));
    }
    gc.appendChild(row);
    const st = el('p', 'nas-gstatus', d.status ? d.status.text : '');
    st.setAttribute('role', 'status');
    if (d.status) st.dataset.tone = d.status.tone;
    gc.appendChild(st);
    const gl = el('a', 'nas-glink', 'Group standings');
    gl.href = '#/gstandings';
    /* The group section shows its CURRENT group - set it to this one first. */
    gl.addEventListener('click', () => setCurrentGroupId(group.id));
    gc.appendChild(gl);
    root.appendChild(gc);
  } else {
    const inv = el('p', 'nas-invite');
    if (d.groupsError) {
      inv.textContent = 'Your groups did not load, so these picks are on this phone only.';
    } else {
      inv.appendChild(el('span', null, 'Pick race day with friends: '));
      const a = el('a', null, S.invite);
      a.href = '#/g';
      inv.appendChild(a);
    }
    root.appendChild(inv);
  }
  /* What each pick is worth, before any is made - the rule on the tile. */
  root.appendChild(el('p', 'nas-rule', ruleLine()));
  root.appendChild(el('p', 'nas-lock', lockText(ev, now)));

  const card = (title) => {
    const c = el('section', 'card nas-card');
    const h = el('div', 'nas-h');
    h.appendChild(el('span', 'nas-title', title));
    if (locked) h.appendChild(el('span', 'nas-when', v.final ? 'Final' : 'Locked'));
    c.appendChild(h);
    root.appendChild(c);
    return c;
  };

  const driverSelect = (label, value, options, onPick) => {
    const sel = document.createElement('select');
    sel.className = 'nas-sel';
    sel.setAttribute('aria-label', label);
    const first = document.createElement('option');
    first.value = ''; first.textContent = 'Pick a driver';
    sel.appendChild(first);
    for (const x of options) {
      const o = document.createElement('option');
      o.value = x.value; o.textContent = x.label;
      sel.appendChild(o);
    }
    sel.value = value || '';
    sel.addEventListener('change', () => onPick(sel.value));
    return sel;
  };

  /* A locked pick: the car, the actual result, the points. */
  const settledRow = (cls, lead, pickText, actualText, pts) => {
    const row = el('div', cls);
    if (lead) row.appendChild(el('span', 'nas-pos num', lead));
    row.appendChild(el('span', 'nas-tag', pickText));
    row.appendChild(el('span', 'nas-actual', actualText));
    row.appendChild(ptsTag(pts));
    return row;
  };

  const resultRow = (actualText, pts) => {
    if (!v.final) return null;
    const row = el('div', 'nas-res');
    row.appendChild(el('span', 'nas-actual', actualText));
    row.appendChild(ptsTag(pts));
    return row;
  };

  const choices = (c, k, opts, result) => {
    const row = el('div', 'nas-choices');
    row.setAttribute('role', 'group');
    /* Four makes (RAM in the Truck Series) sit two by two - nascar-picks.css. */
    if (opts.length > 3) row.dataset.many = 'true';
    for (const [val, label] of opts) {
      const b = el('button', 'nas-choice', label);
      b.type = 'button';
      if (picks[k] === val) b.dataset.on = 'true';
      if (locked) b.disabled = true;
      else b.addEventListener('click', () => { picks[k] = val; save(); redraw(); });
      row.appendChild(b);
    }
    c.appendChild(row);
    if (result) c.appendChild(result);
  };

  /* Race top 3 - P1, P2, P3. The same driver cannot sit in two of them. */
  const t = card('Race top 3');
  const raceOpts = raceOptions(ev);
  v.race.forEach((r, i) => {
    if (locked) {
      t.appendChild(settledRow('nas-row', r.pos, r.pickText, r.actualText, r.pts));
      return;
    }
    const row = el('div', 'nas-row');
    row.appendChild(el('span', 'nas-pos num', r.pos));
    row.appendChild(driverSelect('Race top 3 ' + r.pos, r.pick, raceOpts, (val) => {
      picks.race = placeInSlot(picks.race, i, val);
      save(); redraw();
    }));
    t.appendChild(row);
  });

  const m = card('Winning make');
  choices(m, 'make', makeChoices(ev), resultRow(v.make.actualText, v.make.pts));

  const p = card(v.poleWins.title);
  choices(p, 'poleWins', [['yes', 'Yes'], ['no', 'No']], resultRow(v.poleWins.actualText, v.poleWins.pts));

  const h = card('Dark horse');
  h.appendChild(el('p', 'nas-note', darkHorseLine()));
  if (locked) {
    h.appendChild(settledRow('nas-row nas-row-one', null, v.darkHorse.pickText, v.darkHorse.actualText, v.darkHorse.pts));
  } else {
    const row = el('div', 'nas-row nas-row-one');
    row.appendChild(driverSelect('Dark horse', v.darkHorse.pick, darkHorseOptions(ev, v.darkHorse.pick), (val) => {
      picks.darkHorse = val;
      save(); redraw();
    }));
    h.appendChild(row);
  }

  root.appendChild(el('p', 'nas-note nas-foot',
    (group ? 'Picks are saved on this phone and with ' + group.name + '. ' : 'Picks are saved on this phone. ')
    + 'Results come from the published race order; every pick locks at the green flag. '
    + 'Any Given is not associated in any way with NASCAR.'));
}
