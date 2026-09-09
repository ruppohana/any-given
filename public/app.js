/* THE APP - all sixteen screens in one navigable shell, running on the real
 * fixtures with no network.
 *
 * WHY THIS EXISTS. Jason, 2026-09-08: "honestly i need to see it run before i
 * make all these decisions." The preview harness renders one screen in one state
 * at a time, which is the right tool for closing a piece and the wrong one for
 * judging a product. This is the same sixteen modules, mounted in one shell, with
 * the tabs wired and state carried between them.
 *
 * It is NOT the Worker. There is no server, no Durable Object, no D1 and no feed
 * - every screen is fed from fixtures/, exactly as its own tests feed it. What it
 * proves is the shape and the flow; what it cannot prove is anything live.
 *
 * 🔴 MARKS DEFAULT ON, decided by Jason 2026-09-08 after seeing it run. The
 * switch stays, because the two-color chip is the fallback for marks-off, a team
 * with no logo, and a logo that fails to load - and because a default flip is the
 * whole escape hatch if a school or a conference ever writes.
 */

import { navBar, NAV_CSS } from '/components/nav.js';
import { STATES_CSS } from '/components/states.js';
import { TEAM_CHIP_CSS } from '/components/team-chip.js';
import { adSlot, AD_CSS } from '/components/ad.js';

/* Every route is a screen module and one of its own declared states. Nothing here
 * invents a screen; if a piece was never built, the route says so out loud. */
const ROUTES = [
  { id: 'slate',     dest: 'slate',     screen: 'p2-slate',        state: 'ready-short', label: 'The slate (3 real games)' },
  { id: 'slate131',  dest: 'slate',     screen: 'p2-slate',        state: 'ready',       label: 'The slate (131 games)' },
  { id: 'picks',     dest: 'picks',     screen: 'p4-picks',        state: 'ready',       label: 'My picks' },
  { id: 'parlay',    dest: 'picks',      screen: 'p3-parlay',       state: 'valid',       label: 'The parlay' },
  { id: 'standings', dest: 'standings', screen: 'p5-standings',    state: 'ready',       label: 'Standings' },
  { id: 'invite',    dest: 'slate',     screen: 'p1-invite',       state: 'ready',       label: 'Invite landing' },
  { id: 'create',    dest: 'slate',     screen: 'p6-create',       state: 'create',      label: 'Create a pool' },
  { id: 'rules',     dest: 'live',      screen: 's6-rules',        state: 'ready',       label: 'Rules' },
  /* 🔴 THE ONLY ROUTE THAT IS NOT FIXTURES. It polls the Worker, holds what it
   * gets behind the user's own delay, and settles against the play that actually
   * happened. Everything else here is a design surface; this one is the product. */
  { id: 'live',      dest: 'home',      screen: 'live-game',       state: 'live',        label: '🔴 LIVE — the real game' },
  { id: 'now',       dest: 'live',      screen: 'l4-now',          state: 'open',        label: 'The call (fixtures)' },
  { id: 'landed',    dest: 'live',      screen: 'l7-result',       state: 'landed',      label: 'Result — landed' },
  { id: 'missed',    dest: 'live',      screen: 'l7-result',       state: 'missed',      label: 'Result — missed' },
  { id: 'game',      dest: 'live',      screen: 'l5-game',         state: 'final',       label: 'The game' },
  { id: 'board',     dest: 'live',      screen: 'l6-board',        state: 'ready',       label: 'Board and badges' },
  { id: 'delay',     dest: 'live',      screen: 'l2-delay',        state: 'ready',       label: 'Broadcast delay' },
  { id: 'cold',      dest: 'live',      screen: 'l1-cold',         state: 'ready',       label: 'Cold launch' },
  { id: 'alerts',    dest: 'live',      screen: 'l3-notifications', state: 'priming',    label: 'Notifications' },
  { id: 'share',     dest: 'live',      screen: 's4-share',        state: 'landed',      label: 'Share card' },
  { id: 'settings',  dest: 'live',      screen: 's2-settings',     state: 'ready',       label: 'Settings' },
  { id: 'offline',   dest: 'live',      screen: 's1-shell',        state: 'offline',     label: 'Offline' }
];

/* All sixteen screens are built. P3, P4, P6 and S6 were dispatched without a bar
 * - no comparable exists on disk for any of them - and each says so in its own
 * return rather than pretending otherwise. */

const fixtures = {
  teams: null,
  games: ['real-utep-at-ou', 'real-ball-at-osu', 'real-bois-at-ore'],
  load: async (n) => (await fetch('/fixtures/' + n + '-260905-final.json')).json()
};

const cache = new Map();
async function screenModule(name) {
  if (!cache.has(name)) cache.set(name, import('/screens/' + name + '.screen.js'));
  return cache.get(name);
}
function ensureCss(name) {
  const href = '/screens/' + name + '.css';
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = href;
  document.head.appendChild(l);
}

function currentRoute() {
  /* 🔴 THE FALLBACK IS THE GAME, not the first row of the ROUTES table. An
   * unknown or empty hash used to land on the college slate, which is how the
   * real domain opened on a design surface instead of on the product. */
  const id = (location.hash || '#/live').replace(/^#\//, '');
  return ROUTES.find((r) => r.id === id) || ROUTES.find((r) => r.id === 'live') || ROUTES[0];
}

async function mount() {
  const route = currentRoute();
  const root = document.getElementById('root');
  root.innerHTML = '';
  root.className = 'ag-main';

  /* 🔴 GUARDED, because the picker does not exist outside ?dev=1 — and this
   * exact line blanked the entire app the first time the bar was removed:
   * `null.value` threw before a single screen rendered, so every route drew
   * nothing at all. The same shape as four of the five bugs found on the live
   * domain an hour earlier, written by me while fixing them. */
  const picker = document.getElementById('picker');
  if (picker) picker.value = route.id;

  ensureCss(route.screen);
  root.classList.add('scr-' + route.screen);

  /* 🔴 SAY WHEN THE GAMES ARE NOT REAL. Jason, 2026-09-08, looking at My picks:
   * "These are not correct games, right?" They are not. Notre Dame did not beat
   * Auburn 24-20 last Thursday — the pool screens run on PREVIEW DATA: real team
   * identities out of teams.json, invented matchups, spreads and finals.
   *
   * That is correct for a design surface and indefensible without a label. A
   * fabricated final score presented in the same type as a real one is the
   * "never invent a fixture" rule leaking out of the test suite and into the
   * product, where the person reading it has no way to tell.
   *
   * The live layer is exempt: it is the only route on the feed. */
  /* 🔴 AFTER THE RENDER, NEVER BEFORE IT. This was appended here and then wiped
   * on the very next line: every screen's render() opens with
   * `root.innerHTML = ''`, so the banner was created, destroyed and never seen —
   * on every screen, every time. Nothing errored. It simply was not there.
   *
   * The same trap the ad slot fell into one commit earlier, in a different
   * costume: code that runs and has no effect. */
  let lastData = null;
  try {
    const mod = await screenModule(route.screen);
    const data = mod.previewData ? await mod.previewData(fixtures, route.state) : {};
    lastData = data;
    mod.render(root, data, route.state);
  } catch (e) {
    const box = document.createElement('div');
    box.className = 'state state-error';
    const h = document.createElement('p'); h.className = 'state-title'; h.textContent = 'That screen did not load';
    const p = document.createElement('p'); p.className = 'state-body'; p.textContent = String(e && e.message || e);
    box.append(h, p);
    root.appendChild(box);
  }
  /* 🔴 THE BANNER MUST NOT LIE IN EITHER DIRECTION. The slate now reads the real
   * week off the feed, so calling those games made up would be as wrong as
   * calling the invented ones real. The screen reports whether its rows came off
   * the wire and this reads that — it does not guess from the route. */
  if (route.dest !== 'home' && route.screen !== 'live-game' && !lastData?.fromFeed) {
    const b = document.createElement('p');
    b.className = 'ag-sample';
    b.textContent = 'Sample data — these games, spreads and scores are made up. '
      + 'Only the live game is on the real feed.';
    root.insertBefore(b, root.firstChild);
  }

  /* 🔴 THE AD SLOT IS PART OF THE LAYOUT, drawn by the shell so every screen is
   * built knowing the bottom of the viewport is not entirely its own. It is NOT
   * drawn on the live game: the tiles carry a price and a clock, and an
   * advertisement beside a decision somebody has forty seconds to make is the
   * one place this app must never put one. */
  if (route.screen !== 'live-game') {
    root.appendChild(adSlot('banner'));
  }

  drawNav(route.dest);
}

function drawNav(active) {
  const old = document.querySelector('.ag-nav');
  if (old) old.remove();
  const nav = navBar(active, {
    liveAvailable: true,
    /* 🔴 `live` MAPPED TO `now` — THE FIXTURE SCREEN, NOT THE GAME. Jason,
     * 2026-09-08: "selecting pass or run does not highlight the selection and
     * grey out the selection not taken." It does, on the real screen. He was
     * tapping tiles on a STATIC DESIGN MOCK, because the Live tab in the bottom
     * bar led there.
     *
     * That mapping made sense when every screen was a design surface and `now`
     * was the only call card that existed. It stopped making sense the moment
     * the app had a real one, and nothing caught it because both screens look
     * almost identical — which is precisely why the mock was built. */
    hrefFor: (d) => '#/' + ({ home: 'live', slate: 'slate', picks: 'picks', standings: 'standings', live: 'live' }[d.id] || d.id)
  });
  document.querySelector('.ag-shell').appendChild(nav);
}

/* MARKS. Persisted per device, like every other preference: there is no account. */
function setMarks(on) {
  document.documentElement.dataset.marks = on ? 'on' : 'off';
  try { localStorage.setItem('ag.marks', on ? 'on' : 'off'); } catch {}
  const box = document.getElementById('marks');
  if (box) box.checked = on;
  cache.clear();          // screens build their chips once, so re-mount to swap
  mount();
}

/**
 * 🔴 WHAT anygiven.app OPENS ON. Jason, 2026-09-08: "i thought we were trying to
 * push the nfl version since the game is tomorrow" — and the reason he had not
 * seen it is that the root of the real domain opened a DESIGN HARNESS. A select
 * with twenty entries, a Logos checkbox, a theme dropdown, and the actual game
 * as one option in the middle of the list.
 *
 * That is the right front door for judging screens and the wrong one for a
 * person handed a link during a game. A stranger opening it does not find the
 * product; they find the workshop.
 *
 * So the default is THE LIVE GAME, and the harness moves behind ?dev=1. Nothing
 * is deleted — every screen is still reachable, and the bar still appears for
 * anyone who asks for it.
 */
const DEV = new URLSearchParams(location.search).has('dev');

async function boot() {
  const style = document.createElement('style');
  /* 🔴 AD_CSS WAS IMPORTED AND NEVER JOINED. The ad slots rendered with no rules
   * at all — "AD SPACEBanner · reserved, nothing sold yet" ran together as one
   * unstyled line at the foot of the slate, which is exactly what a reserved
   * rectangle looks like when nothing reserves it.
   *
   * An unused import is invisible: no error, no warning, and the component works
   * in every respect except the one that matters. */
  style.textContent = [NAV_CSS, STATES_CSS, TEAM_CHIP_CSS, AD_CSS].join('\n');
  document.head.appendChild(style);

  fixtures.teams = await (await fetch('/fixtures/teams.json')).json();

  let marks = 'on';   /* 🔴 DEFAULT ON, Jason 2026-09-08 after seeing it run */
  try { marks = localStorage.getItem('ag.marks') || 'on'; } catch {}
  document.documentElement.dataset.marks = marks;
  const marksBox = document.getElementById('marks');
  if (marksBox) {
    marksBox.checked = marks === 'on';
    marksBox.addEventListener('change', (e) => setMarks(e.target.checked));
  }

  const bar = document.querySelector('.ag-bar');
  if (!DEV) {
    /* The bar is REMOVED, not hidden — a hidden toolbar is still in the tab
     * order and still read aloud, and a person on a phone during a game should
     * not be able to tab into a screen picker. */
    if (bar) bar.remove();
  } else {
    const picker = document.getElementById('picker');
    for (const r of ROUTES) {
      const o = document.createElement('option');
      o.value = r.id; o.textContent = r.label;
      picker.appendChild(o);
    }
    picker.addEventListener('change', () => { location.hash = '#/' + picker.value; });

    const theme = document.getElementById('theme');
    theme.addEventListener('change', () => {
      if (theme.value === 'system') delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme = theme.value;
    });
  }

  /* 🔴 NO HASH MEANS THE GAME, not the first entry in a list. */
  if (!location.hash || location.hash === '#/' || location.hash === '#') {
    location.replace(location.pathname + location.search + '#/live');
  }

  buildSettings();

  window.addEventListener('hashchange', mount);
  await mount();
}

/**
 * 🔴 THE WHEEL. Everything that is a SETTING rather than the game.
 *
 * Jason, 2026-09-08: "We will need a wheel at the top for all the 'stuff' like
 * light vs dark, faq, user info, all that shit... As well as the adjust in
 * there." The delay slider is the reason this is not just tidiness — it had been
 * living permanently at the top of the live screen, on every render, for a
 * control set once. Things you touch once belong behind a wheel; the game does
 * not.
 *
 * It floats over the shell rather than being drawn by any screen, so every route
 * has it and no route has to know about it.
 */
function buildSettings() {
  const dlg = document.getElementById('settings');
  const gear = document.getElementById('gear');
  if (!dlg || !gear) return;

  const get = (k, d) => { try { const v = localStorage.getItem('ag.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } };
  const set = (k, v) => { try { localStorage.setItem('ag.' + k, JSON.stringify(v)); } catch {} };

  const box = document.createElement('div');
  box.className = 'ag-sheet-in';
  const h = document.createElement('h2'); h.textContent = 'Settings';
  box.appendChild(h);

  /* --- theme --- */
  box.appendChild(seg('Appearance', [['system', 'Auto'], ['light', 'Light'], ['dark', 'Dark']],
    () => document.documentElement.dataset.theme || 'system',
    (v) => { if (v === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = v; }));

  /* --- marks --- */
  box.appendChild(seg('Team logos', [['on', 'On'], ['off', 'Off']],
    () => document.documentElement.dataset.marks || 'on',
    (v) => { document.documentElement.dataset.marks = v; set('marks', v); cache.clear(); mount(); }));

  /* --- the delay, which is why this exists --- */
  const d = document.createElement('div'); d.className = 'ag-set';
  const dl = document.createElement('div'); dl.className = 'ag-set-l'; dl.textContent = 'BROADCAST DELAY';
  const dv = document.createElement('div'); dv.className = 'ag-row';
  const dvL = document.createElement('span');
  const r = document.createElement('input');
  r.type = 'range'; r.min = '0'; r.max = '90'; r.step = '5'; r.value = String((get('delayMs', 45000)) / 1000);
  const label = () => { dvL.textContent = r.value === '0' ? 'Live — no gap to call into' : r.value + ' seconds behind'; };
  label();
  r.oninput = () => { set('delayMs', Number(r.value) * 1000); label(); };
  dv.appendChild(dvL);
  d.append(dl, dv, r);
  box.appendChild(d);

  /* --- who you are --- */
  const n = document.createElement('div'); n.className = 'ag-set';
  const nl = document.createElement('div'); nl.className = 'ag-set-l'; nl.textContent = 'YOUR NAME ON THE BOARD';
  const ni = document.createElement('input'); ni.type = 'text'; ni.maxLength = 24;
  ni.placeholder = 'Someone'; ni.value = get('name', '') || '';
  ni.oninput = () => set('name', ni.value.trim().slice(0, 24));
  n.append(nl, ni);
  box.appendChild(n);

  /* --- the FAQ, short, and the one line that is not optional --- */
  const f = document.createElement('div'); f.className = 'ag-set';
  const fl = document.createElement('div'); fl.className = 'ag-set-l'; fl.textContent = 'HOW IT WORKS';
  const fp = document.createElement('p'); fp.className = 'ag-faq';
  fp.textContent = 'You are shown the game a few seconds behind on purpose, so when it asks what '
    + 'happens next the snap genuinely has not been taken. Marbles cannot be bought, sold or cashed '
    + 'out, everybody starts each game on the same number, and it resets at the next kickoff — so '
    + 'nobody is ever out. No account: this is your device.';
  f.append(fl, fp);
  box.appendChild(f);

  const close = document.createElement('button');
  close.className = 'ag-close'; close.textContent = 'Done';
  close.onclick = () => { dlg.close(); mount(); };
  box.appendChild(close);

  dlg.appendChild(box);
  gear.addEventListener('click', () => { gear.setAttribute('aria-expanded', 'true'); dlg.showModal(); });
  dlg.addEventListener('close', () => gear.setAttribute('aria-expanded', 'false'));
  /* Clicking the backdrop closes it, which is what everybody expects and what
     <dialog> does not do on its own. */
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

  function seg(labelText, opts, read, write) {
    const wrapEl = document.createElement('div'); wrapEl.className = 'ag-set';
    const l = document.createElement('div'); l.className = 'ag-set-l'; l.textContent = labelText.toUpperCase();
    const g = document.createElement('div'); g.className = 'ag-seg';
    const paint = () => { for (const b of g.children) b.setAttribute('aria-pressed', String(b.dataset.v === read())); };
    for (const [v, t] of opts) {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.v = v; b.textContent = t;
      b.onclick = () => { write(v); paint(); };
      g.appendChild(b);
    }
    paint();
    wrapEl.append(l, g);
    return wrapEl;
  }
}

boot();
