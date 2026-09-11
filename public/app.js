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
import { HEADER_CSS } from '/components/header.js';
import { apiFetch, openSignIn, openProfileEdit } from '/components/signin.js';

/* 🔴 SIGN-IN, EXPOSED ONCE FOR EVERY SCREEN. Screens call
 * `(window.agApiFetch || fetch)(...)` rather than importing it, because the
 * p2 tests evaluate the screen module with its import lines stripped - an
 * import there would be a ReferenceError in the suite. The server decides
 * whether a person must sign in (REQUIRE_EMAIL); apiFetch just answers it. */
window.agApiFetch = apiFetch;
window.agOpenSignIn = openSignIn;

/* Every route is a screen module and one of its own declared states. Nothing here
 * invents a screen; if a piece was never built, the route says so out loud. */
const ROUTES = [
  { id: 'slate',     dest: 'slate',     screen: 'p2-slate',        state: 'ready-short', label: 'The slate (3 real games)' },
  { id: 'slate131',  dest: 'slate',     screen: 'p2-slate',        state: 'ready',       label: 'The slate (131 games)' },
  /* 🔴 THE WEEK'S MARKETS. The second of the three doors on Home - winner,
   * spread, total, halves, quarters, team totals, first to score and margin,
   * on every game of the week. Reached at #/allgames from the front door. */
  { id: 'allgames',  dest: 'slate',     screen: 'p6-allgames',     state: 'ready',       label: 'All games' },
  { id: 'picks',     dest: 'picks',     screen: 'p4-picks',        state: 'ready',       label: 'My picks' },
  { id: 'parlay',    dest: 'picks',      screen: 'p3-parlay',       state: 'valid',       label: 'The parlay (pool, points)' },
  /* 🔴 TWO PARLAYS, TWO ROUTES, AND THEY ARE NOT THE SAME PRODUCT. p3 is the
   * POOL's - points, whole-game sides, a fixed 3/6/12/20 ladder, nothing
   * staked. p7 is the ALL GAMES one - Marbles across any market in the
   * catalogue, paying the product of the legs. They never sum, so they never
   * share a screen or a route. */
  { id: 'buildparlay', dest: 'slate',    screen: 'p7-parlay',       state: 'ready',       label: 'Build a parlay (marbles)' },
  { id: 'standings', dest: 'standings', screen: 'p5-standings',    state: 'ready',       label: 'Standings' },
  { id: 'invite',    dest: 'slate',     screen: 'p1-invite',       state: 'ready',       label: 'Invite landing' },
  { id: 'create',    dest: 'slate',     screen: 'p6-create',       state: 'create',      label: 'Create a pool' },
  /* Rules lives under More now, so the More tab is the one lit while you read it. */
  { id: 'rules',     dest: 'info',      screen: 's6-rules',        state: 'ready',       label: 'Rules' },
  { id: 'info',      dest: 'info',      screen: 's9-more',         state: 'ready',       label: 'More' },
  /* 🔴 THE ONLY ROUTE THAT IS NOT FIXTURES. It polls the Worker, holds what it
   * gets behind the user's own delay, and settles against the play that actually
   * happened. Everything else here is a design surface; this one is the product. */
  /* 🔴 HOME IS ITS OWN SCREEN, NOT THE GAME WITH A CARD ON TOP. Jason said
   * "Home should start here" three times, and each time I stapled the hub onto
   * the live screen instead of building the thing he was pointing at. A landing
   * that scrolls straight into the game IS the game. */
  { id: 'home',      dest: 'home',      screen: 'live-game',       state: 'home',        label: 'Home' },
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
  const id = (location.hash || '#/home').replace(/^#\//, '');
  return ROUTES.find((r) => r.id === id) || ROUTES.find((r) => r.id === 'home') || ROUTES[0];
}

let TITLE_OBS = null;
let ROOT_OBS = null;

/* 🔴 A SCREEN THAT RE-RENDERS ITSELF DETACHES THE NODE WE ARE WATCHING.
 *
 * wireTopbarTitle observes the page's h1, and mount() calls it after the
 * render. That covers navigation and nothing else: several screens re-render
 * in place without going through mount at all - the slate's filter chips and
 * All games' both call `render(root, data, state)` directly - which throws
 * the observed h1 away and leaves the observer watching a detached node.
 * The bar then keeps whatever state it had, so the title sat visible over a
 * page that was showing its own title. Exactly the duplication the observer
 * exists to prevent, reappearing the moment anybody used a filter.
 *
 * One MutationObserver on #root, watching only direct children, re-wires it.
 * Cheaper than making every self-rendering screen remember to call back, and
 * it cannot be forgotten by a screen that does not exist yet. */
function watchRoot() {
  if (ROOT_OBS) return;
  const root = document.getElementById('root');
  if (!root || typeof MutationObserver !== 'function') return;
  ROOT_OBS = new MutationObserver(() => wireTopbarTitle());
  ROOT_OBS.observe(root, { childList: true });
}

/* 🔴 THE DEFAULT DELAY IS 30s NOW, NOT 45. Jason, 2026-09-10, FAMU at Miami:
 * "We are at least 2 plays behind." Measured the same minute: ESPN posts a
 * play 27-37s after the snap on its own, and the 45s delay was holding ZERO
 * plays - it was stacking on top of ESPN's lag rather than covering it. 45 was
 * calibrated on the opener against a stream 39s behind; tonight's TV was
 * closer to live. At 30 the app shows each play about as soon as ESPN has it.
 *
 * ONE-TIME MOVE for a device still holding exactly the old default. After it
 * runs once, whatever anybody sets - 45 included - is left alone. */
(function moveOldDefaultDelay() {
  try {
    if (localStorage.getItem('ag.delayDefaultV') === '30') return;
    if (JSON.parse(localStorage.getItem('ag.delayMs')) === 45000) {
      localStorage.setItem('ag.delayMs', JSON.stringify(30000));
    }
    localStorage.setItem('ag.delayDefaultV', '30');
  } catch { /* no storage - the defaults below are 30 anyway */ }
})();

/* 🔴 WHO IS SIGNED IN, IN THE TOP BAR. Jason, 2026-09-10: "on the header, can we
 * add the handle they enter, right justified." Painted from storage at once (so
 * it is there on the first frame), then again whenever sign-in state moves: the
 * sheet fires `ag:auth`, the settings row calls this after sign-out, delete and
 * a handle change, the boot check calls it after the server answers, and
 * `storage` covers another tab. No session or no handle - nothing shows. */
function paintWho() {
  const w = document.getElementById('topbar-who');
  if (!w) return;
  let tok = '', h = '';
  try { tok = localStorage.getItem('ag.session') || ''; h = localStorage.getItem('ag.handle') || ''; } catch { /* private */ }
  const on = !!(tok && h);
  w.hidden = !on;
  w.textContent = on ? '@' + h : '';
  if (on) w.setAttribute('aria-label', 'Signed in as @' + h); else w.removeAttribute('aria-label');
}
window.addEventListener('ag:auth', paintWho);
window.addEventListener('storage', (e) => { if (!e.key || /^ag\.(session|handle)$/.test(e.key)) paintWho(); });
paintWho();

function wireTopbarTitle() {
  watchRoot();
  const tb = document.getElementById('topbar-title');
  if (!tb) return;
  if (TITLE_OBS) { TITLE_OBS.disconnect(); TITLE_OBS = null; }
  const h1 = document.querySelector('#root .ag-hd-t');
  /* No page title to defer to - a design-harness route, or a screen that
     never had one - so the bar keeps its own. Absent beats guessed. */
  if (!h1) { tb.dataset.show = 'true'; return; }
  tb.dataset.show = 'false';
  TITLE_OBS = new IntersectionObserver(([e]) => {
    tb.dataset.show = e.isIntersecting ? 'false' : 'true';
  }, { rootMargin: '-44px 0px 0px 0px', threshold: 0 });
  TITLE_OBS.observe(h1);
}

const TITLES = {
  home: 'Any Given…',
  live: 'Call it live',
  allgames: 'All games',
  buildparlay: 'Build a parlay',
  slate: 'The slate',
  slate131: 'The slate',
  picks: 'My picks',
  parlay: 'The parlay',
  standings: 'Standings',
  create: 'Create a pool',
  invite: 'Invite',
  rules: 'Rules',
  info: 'More',
  settings: 'Settings',
};

/* 🔴 "ANY GIVEN…" COMPLETES ITSELF ON THE FRONT DOOR. Jason, 2026-09-11: "i
 * also want the title at the top to be 'ANY GIVEN...' then rotate 'Saturday',
 * 'Sunday', 'Team', 'Roster' and any others you can think of." It is the
 * wordmark idea from the cold launch (the name finishing its own sentence),
 * with the beat kept: the ellipsis shows first, then the words. It opens on the
 * day's own word - Saturday on a Saturday - and holds on it under reduced
 * motion. Only the home route spins; every other screen names itself. */
const GIVEN_WORDS = ['Saturday', 'Sunday', 'Team', 'Roster', 'Snap', 'Down', 'Drive',
  'Play', 'Game', 'Week', 'Monday Night'];
let GIVEN_TIMER = null;
function stopGiven() {
  if (GIVEN_TIMER) { clearTimeout(GIVEN_TIMER); GIVEN_TIMER = null; }
}
function spinGiven(tb) {
  stopGiven();
  const day = new Date().getDay();
  let i = Math.max(0, GIVEN_WORDS.indexOf(day === 0 ? 'Sunday' : day === 1 ? 'Monday Night' : 'Saturday'));
  /* The ellipsis STAYS, and the word follows it: "Any Given… Saturday". Jason,
   * 2026-09-11: "add '... ' after Given on the splash page". It was replaced by
   * the first word; the pause is the beat, so it never leaves. */
  tb.textContent = 'Any Given…';
  tb.setAttribute('aria-label', 'Any Given');
  const w = document.createElement('span');
  w.className = 'ag-given';
  w.textContent = '';
  tb.appendChild(w);
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  /* No leading space in the word: .ag-given is inline-block, which drops it, so
   * the gap after the ellipsis is a margin in index.html's style block. */
  if (still) { w.textContent = GIVEN_WORDS[i]; return; }
  const next = (delay) => {
    GIVEN_TIMER = setTimeout(() => {
      if (!w.isConnected) { stopGiven(); return; }
      w.classList.add('is-out');
      GIVEN_TIMER = setTimeout(() => {
        w.textContent = GIVEN_WORDS[i];
        i = (i + 1) % GIVEN_WORDS.length;
        w.classList.remove('is-out');
        next(2600);
      }, 250);
    }, delay);
  };
  next(1400);
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

  /* 🔴 THE BAR SAYS WHERE YOU ARE. A persistent header with a fixed word on it
   * is furniture; one that names the screen is orientation, and it is the only
   * thing on this app that survives a scroll. TITLES is deliberately short of
   * the route list - a route with no entry keeps "Any Given", which is right
   * for the design-harness routes: they are not places a person navigates to. */
  const tb = document.getElementById('topbar-title');
  stopGiven();
  if (tb) {
    tb.removeAttribute('aria-label');
    if (route.id === 'home') spinGiven(tb);
    else tb.textContent = TITLES[route.id] || 'Any Given…';
  }
  /* 🔴 THE BAR TITLE ONLY APPEARS ONCE THE PAGE'S OWN TITLE HAS GONE.
   *
   * Adding the bar put the screen's name on screen twice - "Build a parlay"
   * in the bar and "Build a parlay" as the h1 a hundred and thirty pixels
   * below it. That is the rule this app's own header comment already states,
   * arriving one element further up: "a header may not repeat what the
   * element directly under it already says."
   *
   * The answer is not to delete one of them. The large title is the screen's
   * identity and the bar title is what you need AFTER it has scrolled away -
   * so the bar shows its title only when the h1 is off screen, which is the
   * behaviour every phone OS already taught people. Nothing is duplicated and
   * nothing is lost.
   *
   * IntersectionObserver rather than a scroll handler: a scroll listener on a
   * 130,000px board firing on every frame is exactly the kind of thing that
   * makes a long list feel cheap.
   *
   * 🔴 CALLED AFTER THE RENDER. It was here, before it, and the h1 it looks
   * for does not exist yet at this point - so every screen fell to the "no
   * page title, keep the bar's own" branch and the duplication stayed
   * exactly as it was. Nothing errored; the feature simply had no effect.
   *
   * The trap is already written down forty lines below, about the sample-data
   * banner: "AFTER THE RENDER, NEVER BEFORE IT. This was appended here and
   * then wiped on the very next line... Nothing errored. It simply was not
   * there." Same function, same mistake, one commit apart. */

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
    wireTopbarTitle();
  } catch (e) {
    const box = document.createElement('div');
    box.className = 'state state-error';
    const h = document.createElement('p'); h.className = 'state-title'; h.textContent = 'That screen did not load';
    const p = document.createElement('p'); p.className = 'state-body'; p.textContent = String(e && e.message || e);
    box.append(h, p);
    root.appendChild(box);
    /* An error screen has no h1, so the bar keeps its own title - which is
       the one time you most want to know where you are. */
    wireTopbarTitle();
  }
  /* 🔴 THE BANNER MUST NOT LIE IN EITHER DIRECTION. The slate now reads the real
   * week off the feed, so calling those games made up would be as wrong as
   * calling the invented ones real. The screen reports whether its rows came off
   * the wire and this reads that — it does not guess from the route. */
  /* `noSample`: a screen with nothing made up on it (the rules) says so, and
   * gets no banner - "these games are made up" over a page of rules is the
   * banner lying in the other direction. */
  if (route.dest !== 'home' && route.screen !== 'live-game' && !lastData?.fromFeed && !lastData?.noSample) {
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
    hrefFor: (d) => '#/' + ({ home: 'home', slate: 'slate', picks: 'picks', standings: 'standings', live: 'live' }[d.id] || d.id)
  });
  /* 🔴 THE LIVE TAB SAYS WHERE IT CAME FROM. The front door's College/NFL
   * buttons also land on #/live, and there the league just picked must win -
   * so "open the last game you had up" can only be keyed to a tap on THIS
   * tab. A flag rather than a URL parameter: a parameter would outlive the
   * navigation, which is exactly the ?game= bug fixed an hour ago. And a tap
   * on the tab you are already on changes no hash, so it re-mounts by hand. */
  const liveTab = nav.querySelector('[data-dest="live"]');
  if (liveTab) liveTab.addEventListener('click', () => {
    window.__agGoLast = true;
    if (location.hash === '#/live') mount();
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

  /* 🔴 DEFAULT ON, Jason 2026-09-08 after seeing it run, and re-confirmed
   * 2026-09-09: "Logos keep defaulting off. Turn them on."
   *
   * Anything that is not exactly 'off' is read as on. That is deliberate rather
   * than sloppy: the key was being written in two formats (see the settings
   * sheet below), so every phone that ever opened that panel is holding '"on"'
   * with quotes. Treating an unrecognised value as ON repairs those in place
   * instead of leaving them dark until somebody clears their storage. Only the
   * one string that means off, means off. */
  let marks = 'on';
  try {
    const stored = localStorage.getItem('ag.marks');
    marks = (stored === 'off' || stored === '"off"') ? 'off' : 'on';
  } catch {}
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

  /* 🔴 A GROUP INVITE OPENS THE GROUP'S SLATE. Found 2026-09-10: the standings
   * screen's "Copy invite" has been sending `/?pool=CODE` since 2026-09-09 and
   * nothing anywhere read it - a friend who tapped it got the front door and
   * no sign of the group they were invited to.
   *
   * Doctrine: nothing sits in front of the slate, and an invite link opens the
   * ACTUAL slate. So the code is looked up, remembered as the group being
   * joined, the league switched to the group's, and the person lands on the
   * games with a line saying whose group this is. Their first pick joins them
   * (see p2-slate). Used once and taken out of the address, for the same
   * reason as ?game= - a query string outlives every navigation after it. */
  /* 🔴 IS SIGN-IN REQUIRED, AND IS THIS PHONE STILL SIGNED IN? Asked once, not
   * awaited - the first paint must not wait on it. The slate reads
   * window.agAuthRequired to decide whether a pick opens the sign-in sheet
   * first (Jason: "first pick is fine"). A saved session the server no longer
   * knows is dropped here, so the menu never claims somebody is signed in
   * when every request would say otherwise. */
  try {
    const tok = localStorage.getItem('ag.session') || '';
    fetch('/api/auth/me', { headers: tok ? { authorization: 'Bearer ' + tok } : {} })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        window.agAuthRequired = !!(j && j.required);
        if (!ok && tok) { try { localStorage.removeItem('ag.session'); } catch { /* private */ } }
        if (ok && j.handle) { try { localStorage.setItem('ag.handle', j.handle); } catch { /* private */ } }
        paintWho();
      })
      .catch(() => { /* offline: the server still decides on each request */ });
  } catch { /* no storage */ }

  const poolCode = new URLSearchParams(location.search).get('pool');
  if (poolCode) {
    try {
      const r = await fetch('/api/pool/info?code=' + encodeURIComponent(poolCode));
      if (r.ok) {
        const info = await r.json();
        localStorage.setItem('ag.pendingPool', JSON.stringify(info));
        localStorage.setItem('ag.sport', JSON.stringify(info.sport));
      }
    } catch { /* a dead or offline invite still opens the slate */ }
    try {
      const q = new URLSearchParams(location.search);
      q.delete('pool');
      const qs = q.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + '#/slate');
    } catch { location.hash = '#/slate'; }
  }

  /* 🔴 NO HASH MEANS THE GAME, not the first entry in a list. */
  if (!location.hash || location.hash === '#/' || location.hash === '#') {
    /* An invite carries a game, so it goes straight to it; anything else lands
     * on Home. */
    location.replace(location.pathname + location.search
      + (new URLSearchParams(location.search).get('game') ? '#/live' : '#/home'));
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

  /* 🔴 NO LOGO TOGGLE IN THE SHEET. Jason, 2026-09-10: "remove the logo
   * toggle. We need it in the backend but not the user."
   *
   * A `seg('Team logos', On/Off)` lived here and it was the wrong kind of
   * control to ship. Marks are not a taste setting - they are a LICENSING
   * position, priced at ~$16,875 for the college marks and unresolved. A switch
   * asks the user to decide something that is ours to decide, and worse, it
   * advertises that the answer is currently arguable.
   *
   * 🔴 THE MECHANISM IS UNTOUCHED, ONLY THE CONTROL IS GONE. setMarks() still
   * exists, `ag.marks` is still read at boot, dataset.marks still drives every
   * chip, and teamChip still falls back to two colors and an abbreviation.
   * Nothing about how it WORKS changed - which is what "we need it in the
   * backend" asks for.
   *
   * Where it can still be flipped: the ?dev bar's Logos checkbox, which is the
   * harness and is hidden from everybody else, and setMarks() from a console.
   * That is the right home for it - a build-time position with a developer
   * switch, rather than a product feature with a user switch. */

  /* 🔴 THE BUILD, WHERE A PERSON CAN READ IT. Several times today a change
   * was deployed, correct, and reported as missing - and the only way to
   * settle it was to curl the origin from a laptop. A phone holding a stale
   * bundle looks exactly like a feature that was never built, and neither
   * of us could tell them apart from a screenshot.
   *
   * It is the last row of the menu and it is deliberately dull: this is
   * diagnostic furniture, not a setting. */
  const bi = document.createElement('div');
  bi.className = 'ag-build';
  bi.textContent = 'Build ' + (window.__BUILD__ || 'dev');
  box.appendChild(bi);

  /* --- the delay, which is why this exists --- */
  const d = document.createElement('div'); d.className = 'ag-set';
  const dl = document.createElement('div'); dl.className = 'ag-set-l'; dl.textContent = 'BROADCAST DELAY';
  const dv = document.createElement('div'); dv.className = 'ag-row';
  const dvL = document.createElement('span');
  const r = document.createElement('input');
  r.type = 'range'; r.min = '0'; r.max = '90'; r.step = '5'; r.value = String((get('delayMs', 30000)) / 1000);
  const label = () => { dvL.textContent = r.value === '0' ? 'Live — no gap to call into' : r.value + ' seconds behind'; };
  label();
  /* 🔴 IT ANNOUNCES ITSELF, because this sheet opens ON TOP of a screen that is
   * already mounted. The live board seeds its own delay from the same
   * `ag.delayMs` key and re-reads it every paint - but a sheet open over a
   * quiet board means no paint is coming, so the slider would move and the
   * board would go on holding the old number with nothing anywhere disagreeing
   * out loud. A same-document write fires no `storage` event (that one is for
   * OTHER tabs), so the write has to say so itself. */
  r.oninput = () => {
    const ms = Number(r.value) * 1000;
    set('delayMs', ms);
    label();
    window.dispatchEvent(new CustomEvent('ag:delay', { detail: ms }));
  };
  dv.appendChild(dvL);
  d.append(dl, dv, r);
  box.appendChild(d);

  /* --- your account ---
   * 🔴 THE WAY IN THAT ISN'T A WALL. The sign-in sheet opens by itself only
   * when the server demands it (REQUIRE_EMAIL); this row is how somebody signs
   * in on purpose - to carry their picks to a new phone, or to check which
   * address they used - and how they sign out. Added 2026-09-10 so Jason could
   * run the first real code end to end before enforcement is switched on. */
  const acc = document.createElement('div'); acc.className = 'ag-set';
  const accL = document.createElement('div'); accL.className = 'ag-set-l'; accL.textContent = 'YOUR ACCOUNT';
  const accRow = document.createElement('div'); accRow.className = 'ag-row';
  const lsGet = (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
  const paintAccount = () => {
    accRow.textContent = '';
    paintWho();   /* sign-out, delete and a handle change all land here */
    const token = lsGet('ag.session'), email = lsGet('ag.email'), handle = lsGet('ag.handle');
    const who = document.createElement('span');
    who.textContent = token && email ? (handle ? '@' + handle + ' · ' + email : email) : 'Not signed in';
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = token ? 'Sign out' : 'Sign in with email';
    b.style.cssText = 'font:inherit;font-weight:700;min-height:36px;padding:0 12px;margin-left:auto;'
      + 'border:1px solid var(--line);border-radius:var(--radius-button,10px);background:var(--card);color:var(--fg)';
    b.onclick = async () => {
      if (token) {
        try { await fetch('/api/auth/logout', { method: 'POST', headers: { authorization: 'Bearer ' + token } }); } catch { /* offline */ }
        try { localStorage.removeItem('ag.session'); } catch { /* private */ }
        paintAccount();
        return;
      }
      /* 🔴 CLOSE THIS SHEET FIRST. It is a modal <dialog>, which lives in the
       * browser's top layer; the sign-in sheet is a fixed div, and no z-index
       * beats the top layer. Opened from here it sat BEHIND the menu and only
       * appeared when "Done" was tapped - Jason, 2026-09-10. */
      dlg.close();
      if (await openSignIn()) paintAccount();
    };
    accRow.append(who, b);

    /* Signed in: change the handle, or delete the account. Jason, 2026-09-10:
     * "we also need a change handle option, a sign out option an privacy sub
     * page". Delete is Apple's requirement for any app that creates accounts
     * (App Review 5.1.1(v)) - and the privacy page promises it. */
    accMore.textContent = '';
    if (token) {
      const ch = mkBtn('Change handle');
      /* Same top-layer rule as sign-in: close the menu, then open the sheet. */
      ch.onclick = async () => { dlg.close(); if (await openProfileEdit()) paintAccount(); };
      const del = mkBtn('Delete account');
      del.style.color = 'var(--down, #c0392b)';
      del.onclick = () => confirmDelete(token);
      accMore.append(ch, del);
    }
    /* The handle IS the name on every board once signed in. */
    n.hidden = !!token;
  };
  const accMore = document.createElement('div');
  accMore.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:8px';
  const mkBtn = (text) => {
    const x = document.createElement('button');
    x.type = 'button'; x.textContent = text;
    x.style.cssText = 'font:inherit;font-weight:700;min-height:36px;padding:0 12px;'
      + 'border:1px solid var(--line);border-radius:var(--radius-button,10px);background:var(--card);color:var(--fg)';
    return x;
  };
  /* Two taps, the second one red and spelled out. Nothing is deleted on the first. */
  const confirmDelete = (token) => {
    accMore.textContent = '';
    const warn = document.createElement('p'); warn.className = 'ag-faq';
    warn.textContent = 'This deletes your account, your picks and your group memberships. It can’t be undone.';
    const no = mkBtn('Cancel'); no.onclick = paintAccount;
    const yes = mkBtn('Delete for good');
    yes.style.background = 'var(--down, #c0392b)'; yes.style.color = '#fff'; yes.style.borderColor = 'transparent';
    yes.onclick = async () => {
      yes.disabled = true; yes.textContent = 'Deleting…';
      try {
        const r = await fetch('/api/auth/delete', { method: 'POST',
          headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
          body: JSON.stringify({ confirm: true }) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        for (const k of ['ag.session', 'ag.email', 'ag.handle']) { try { localStorage.removeItem(k); } catch { /* private */ } }
        paintAccount();
      } catch {
        yes.disabled = false; yes.textContent = 'Delete for good';
        warn.textContent = 'That didn’t go through. Try again in a moment.';
      }
    };
    accMore.append(warn, no, yes);
  };

  /* --- who you are - only until there is a handle --- */
  const n = document.createElement('div'); n.className = 'ag-set';
  const nl = document.createElement('div'); nl.className = 'ag-set-l'; nl.textContent = 'YOUR NAME ON THE BOARD';
  const ni = document.createElement('input'); ni.type = 'text'; ni.maxLength = 24;
  ni.placeholder = 'Someone'; ni.value = get('name', '') || '';
  ni.oninput = () => set('name', ni.value.trim().slice(0, 24));
  n.append(nl, ni);

  paintAccount();
  acc.append(accL, accRow, accMore);
  box.appendChild(acc);
  box.appendChild(n);

  /* --- privacy: the page the sign-in sheet links to, reachable from here too --- */
  const pv = document.createElement('div'); pv.className = 'ag-set';
  const pvL = document.createElement('div'); pvL.className = 'ag-set-l'; pvL.textContent = 'PRIVACY';
  const pvA = document.createElement('a');
  pvA.href = '/privacy.html'; pvA.target = '_blank'; pvA.rel = 'noopener';
  pvA.textContent = 'Privacy policy — what we keep and how to delete it';
  pvA.style.cssText = 'color:var(--fg);font-weight:700';
  pv.append(pvL, pvA);
  box.appendChild(pv);

  /* --- the FAQ, short, and the one line that is not optional --- */
  const f = document.createElement('div'); f.className = 'ag-set';
  const fl = document.createElement('div'); fl.className = 'ag-set-l'; fl.textContent = 'HOW IT WORKS';
  const fp = document.createElement('p'); fp.className = 'ag-faq';
  fp.textContent = 'You are shown the game a few seconds behind on purpose, so when it asks what '
    + 'happens next the snap genuinely has not been taken. Marbles cannot be bought, sold or cashed '
    + 'out, everybody starts each game on the same number, and it resets at the next kickoff — so '
    + 'nobody is ever out. You sign in with your email, so nobody else can make your picks.';
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
