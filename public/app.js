/* THE APP - the twelve screens in one navigable shell, running on the real
 * fixtures with no network.
 *
 * WHY THIS EXISTS. Jason, 2026-09-08: "honestly i need to see it run before i
 * make all these decisions." The preview harness renders one screen in one state
 * at a time, which is the right tool for closing a piece and the wrong one for
 * judging a product. This is the same twelve modules, mounted in one shell, with
 * the tabs wired and state carried between them.
 *
 * It is NOT the Worker. There is no server, no Durable Object, no D1 and no feed
 * - every screen is fed from fixtures/, exactly as its own tests feed it. What it
 * proves is the shape and the flow; what it cannot prove is anything live.
 *
 * 🔴 The MARKS switch in the header is the deliverable of a decision Jason
 * reopened and then held: logos on, logos off, same screen, one tap. The default
 * is not decided and this is how it gets decided.
 */

import { navBar, NAV_CSS } from '/components/nav.js';
import { STATES_CSS } from '/components/states.js';
import { TEAM_CHIP_CSS } from '/components/team-chip.js';

/* Every route is a screen module and one of its own declared states. Nothing here
 * invents a screen; if a piece was never built, the route says so out loud. */
const ROUTES = [
  { id: 'slate',     dest: 'slate',     screen: 'p2-slate',        state: 'ready-short', label: 'The slate (3 real games)' },
  { id: 'slate131',  dest: 'slate',     screen: 'p2-slate',        state: 'ready',       label: 'The slate (131 games)' },
  { id: 'standings', dest: 'standings', screen: 'p5-standings',    state: 'ready',       label: 'Standings' },
  { id: 'invite',    dest: 'slate',     screen: 'p1-invite',       state: 'ready',       label: 'Invite landing' },
  { id: 'now',       dest: 'live',      screen: 'l4-now',          state: 'open',        label: 'The call' },
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

/* P3 the parlay, P4 my picks and P6 create were never dispatched - no comparable
 * exists on disk for any of them, and a piece whose bar does not exist is not
 * built. The Picks tab says that rather than showing an empty screen. */
const NOT_BUILT = {
  picks: {
    title: 'My picks is not built',
    body: 'P3 the parlay, P4 my picks and P6 create a pool have no comparable on '
        + 'disk, and a screen whose bar does not exist is not dispatched. They are '
        + 'the capture list, not an oversight.'
  }
};

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
  const id = (location.hash || '#/slate').replace(/^#\//, '');
  if (id === 'picks') return { id: 'picks', dest: 'picks', notBuilt: NOT_BUILT.picks };
  return ROUTES.find((r) => r.id === id) || ROUTES[0];
}

async function mount() {
  const route = currentRoute();
  const root = document.getElementById('root');
  root.innerHTML = '';
  root.className = 'ag-main';

  document.getElementById('picker').value = route.id;

  if (route.notBuilt) {
    const box = document.createElement('div');
    box.className = 'state state-empty';
    const h = document.createElement('p'); h.className = 'state-title'; h.textContent = route.notBuilt.title;
    const p = document.createElement('p'); p.className = 'state-body'; p.textContent = route.notBuilt.body;
    box.append(h, p);
    root.appendChild(box);
    drawNav(route.dest);
    return;
  }

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
  document.getElementById('marks').checked = on;
  cache.clear();          // screens build their chips once, so re-mount to swap
  mount();
}

async function boot() {
  const style = document.createElement('style');
  style.textContent = [NAV_CSS, STATES_CSS, TEAM_CHIP_CSS].join('\n');
  document.head.appendChild(style);

  fixtures.teams = await (await fetch('/fixtures/teams.json')).json();

  let marks = 'off';
  try { marks = localStorage.getItem('ag.marks') || 'off'; } catch {}
  document.documentElement.dataset.marks = marks;
  document.getElementById('marks').checked = marks === 'on';
  document.getElementById('marks').addEventListener('change', (e) => setMarks(e.target.checked));

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

  window.addEventListener('hashchange', mount);
  await mount();
}

boot();
