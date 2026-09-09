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
  { id: 'live',      dest: 'live',      screen: 'live-game',       state: 'live',        label: '🔴 LIVE — the real game' },
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
  try {
    const mod = await screenModule(route.screen);
    const data = mod.previewData ? await mod.previewData(fixtures, route.state) : {};
    mod.render(root, data, route.state);
  } catch (e) {
    const box = document.createElement('div');
    box.className = 'state state-error';
    const h = document.createElement('p'); h.className = 'state-title'; h.textContent = 'That screen did not load';
    const p = document.createElement('p'); p.className = 'state-body'; p.textContent = String(e && e.message || e);
    box.append(h, p);
    root.appendChild(box);
  }
  drawNav(route.dest);
}

function drawNav(active) {
  const old = document.querySelector('.ag-nav');
  if (old) old.remove();
  const nav = navBar(active, {
    liveAvailable: true,
    hrefFor: (d) => '#/' + ({ slate: 'slate', picks: 'picks', standings: 'standings', live: 'now' }[d.id] || d.id)
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
  style.textContent = [NAV_CSS, STATES_CSS, TEAM_CHIP_CSS].join('\n');
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

  window.addEventListener('hashchange', mount);
  await mount();
}

boot();
