/* S2 - SETTINGS AND IDENTITY. Display name, followed team, theme, THE DELAY
 * SLIDER, notifications.
 *
 * THE BAR, and all four were opened before a line was written:
 *   reference/sofascore-teardown/screens/IMG_5198.PNG
 *     - the favorites grid BEFORE ANY ACCOUNT. `Skip` top-right, in the same
 *       weight as the wordmark. Nothing is asked before the grid.
 *   IMG_5199.PNG - the search field focused, empty, with one line of guidance:
 *       "Enter any team, athlete, league, or tournament name."
 *   IMG_5200.PNG - "Arizona" typed, results INSTANT and mixing entity types:
 *       Diamondbacks, Cardinals, Wildcats, Coyotes, Sun Devils, two players.
 *       Every row is anchored by a CREST.
 *   reference/armchair-quarterback-teardown/screens/
 *     AQB-LIVE-signup-form-dob-required.png
 *       - THE COUNTER-EXAMPLE. Seven fields - Email, Player Name, First, Last,
 *         DATE OF BIRTH, Password, Confirm - plus a terms checkbox, standing in
 *         front of every screen they have.
 *
 * WHAT THAT MAKES THIS SCREEN, and none of it is a choice made here:
 *
 * 1. THERE IS NO DATE-OF-BIRTH FIELD, and no email, and no password. 18+ is a
 *    RATING, answered honestly on the store questionnaire - never a door. The
 *    Armchair screen above is the thing this product is defined against, so the
 *    absence is stated on screen rather than merely implemented.
 * 2. A PERSON IS A DISPLAY NAME AND A DEVICE until they choose otherwise. In
 *    first-run there is not even a name field: the name is asked AFTER the first
 *    pick, so here it is a dim line saying so.
 * 3. SKIP EXISTS AND IS HONORED. It is visible in first-run at the top of the
 *    chooser, in the same weight as everything else, exactly as Sofascore has
 *    it - and skipping lands on a working app with default tokens.
 * 4. SOFASCORE'S GRID LEANS ON A CREST PER ROW AND WE HAVE NONE. Measured, not
 *    assumed: of 760 schools in fixtures/teams.json, 401 have no usable primary
 *    and 393 have no secondary at all. So the chooser is a LIST, not a grid -
 *    a 3-up grid of crest-shaped holes is a grid of nothing. The row carries the
 *    shared teamChip and then the name in type, which is the whole no-marks
 *    argument, and the list here is the real 760 in one scroller so the null
 *    case is the majority of what you see rather than an edge case in a corner.
 *
 * 5. THE DELAY IS THE ONE CONTROL NO COMPETITOR HAS. screen-flow stage 2: it is
 *    a default with a slider, not a fork; it must be set before the first play
 *    is ever shown and be re-reachable in one tap. So in first-run it sits
 *    directly under the chooser, above theme and alerts.
 *    L2 OWNS THE DELAY SCREEN AND ITS BOARD. This file owns the control only -
 *    there is no board, no play, no held queue drawn here.
 *
 * 6. THE SPOILER RULE IS JOINED TO THE SLIDER, ON SCREEN. Sofascore's own
 *    priming samples read "Q2 started: 31 - 28" - live score in the body. For a
 *    delayed app that is fatal. Every alert that carries state is held by the
 *    same delay as the feed, and this is the screen where a user can see that
 *    the two settings are one setting. L3 OWNS THE PRIMING AND THE COPY of the
 *    alerts themselves; this owns the preference rows.
 *
 * 7. DENSITY IS THE VIEWER'S, SCOPE IS THE POOL'S. Office Pool ships a
 *    Compact / Detailed toggle with a live example row rendered inside the
 *    control (README, measured 2026-09-08). Taken whole, because a per-user
 *    slate FILTER is forbidden - everyone picks the same games or the standings
 *    mean nothing - and a density toggle changes the rendering, not the slate.
 *    The example row is the real UTEP at Oklahoma fixture, not a mock.
 *
 * 8. THERE IS NO PURCHASE ROW, no top-up, no restore purchases, and no balance
 *    on this screen. Nothing that affects play can be bought, so a settings
 *    screen has nothing to sell. The balance is Marbles and it lives in the live
 *    layer.
 *
 * TYPES: this is browser JS with no build step, so it cannot import
 * src/lib/types.ts. It re-declares nothing either - the shapes it consumes are
 * TeamIdentity and Notification from that file, referenced in JSDoc only.
 * 🔴 There is NO settings/preferences type in src/lib/types.ts. The `prefs`
 * object below is a STUB and is named as one in the return.
 */
import { teamChip, TEAM_CHIP_CSS } from '/components/team-chip.js';
import { stateBlock, STATES_CSS } from '/components/states.js';
import { kickoff } from '/components/fmt.js';

export const id = 's2-settings';
export const title = 'Settings and identity';
export const bar = 'reference/sofascore-teardown/screens/IMG_5198.PNG';

/* `first-run` is this screen's empty: a settings screen with nothing set yet.
 * There is no separate `empty` - an account-less app has no state where settings
 * exist but are absent. */
export const states = ['ready', 'first-run', 'loading', 'offline', 'error'];

/** The delay, in seconds. 0-90 in 5s steps.
 *  GROUNDED, not picked: ncaalive/poller.py records "ESPN+ is typically 30-60s
 *  behind live, cable 5-15s". The reference server accepts 0-600s; a 600s slider
 *  cannot be aimed with a thumb, so the travel covers the measured range with
 *  headroom and the two named marks are the two real cases. */
const DELAY_MIN = 0, DELAY_MAX = 90, DELAY_STEP = 5, DELAY_DEFAULT = 45;

/** Alert kinds. `holdsState` is the field on Notification in src/lib/types.ts,
 *  and it is what decides whether the delay holds this alert or not. The BODY of
 *  each alert is L3's - only the preference row is here. */
const ALERTS = [
  { kind: 'call_settled', label: 'A call of yours settles', holdsState: true },
  { kind: 'snap_open', label: 'The snap clock opens', holdsState: true },
  { kind: 'final', label: 'A game you picked goes final', holdsState: true },
  { kind: 'kickoff', label: 'Kickoff of a game you picked', holdsState: false },
  { kind: 'picks_due', label: 'Your picks lock in an hour', holdsState: false },
  { kind: 'pool_joined', label: 'Somebody joins your pool', holdsState: false }
];

export async function previewData(fixtures, state) {
  const all = Object.values(fixtures.teams.teams);
  const teams = all.slice().sort(function (a, b) {
    return (a.short || a.name).localeCompare(b.short || b.name);
  });

  /* The density example is a REAL CAPTURED GAME, loaded from the fixture, with
   * both teams resolved back to their real identities in teams.json. Nothing in
   * that row is written here. */
  let example = null;
  try {
    const g = await fixtures.load('real-utep-at-ou');
    const c = g.header.competitions[0];
    const home = c.competitors.find(function (x) { return x.homeAway === 'home'; });
    const away = c.competitors.find(function (x) { return x.homeAway === 'away'; });
    example = {
      id: c.id,
      kickoffUtc: Date.parse(c.date),
      venue: (g.gameInfo && g.gameInfo.venue && g.gameInfo.venue.fullName) || null,
      home: fixtures.teams.teams[home.team.id],
      away: fixtures.teams.teams[away.team.id]
    };
  } catch (e) {
    example = null;   /* a fixture that will not load is a state, not a crash */
  }

  /* Deliberately a YELLOW primary as the already-followed team, because yellow
   * is the one that breaks first on --card:#ffffff, and the alphabetical list
   * underneath opens on navies and nulls. All three color states are on screen
   * at once without cherry-picking the list. */
  const followed = state === 'first-run'
    ? null
    : (teams.find(function (t) { return t.abbrev === 'ASU'; }) || null);

  return {
    teams: teams,
    total: all.length,
    example: example,
    /* 🔴 STUB. There is no settings type in src/lib/types.ts to import. */
    prefs: {
      displayName: state === 'first-run' ? '' : 'Jason',
      followedTeamId: followed ? followed.id : null,
      theme: 'system',
      delaySeconds: DELAY_DEFAULT,
      density: 'detailed',
      alertsOn: true,
      alerts: ALERTS.reduce(function (m, a) { m[a.kind] = true; return m; }, {})
    },
    followed: followed,
    lastSync: Date.now() - 47000
  };
}

/* ------------------------------------------------------------------ helpers */

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function card(titleText, noteText) {
  const c = el('section', 'card s2-card');
  const h = el('h2', 's2-h', titleText);
  c.appendChild(h);
  if (noteText) c.appendChild(el('p', 's2-note', noteText));
  return c;
}

/** A segmented control. Buttons, 44px, accent on the chosen one - and the accent
 *  is read from --accent so it is maroon in light and gold on dark without this
 *  file knowing which it is in. */
function segmented(label, options, value, onPick) {
  const wrap = el('div', 's2-seg');
  wrap.setAttribute('role', 'radiogroup');
  wrap.setAttribute('aria-label', label);
  options.forEach(function (o) {
    const b = el('button', 's2-seg-b', o.label);
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(o.value === value));
    b.addEventListener('click', function () {
      Array.prototype.forEach.call(wrap.children, function (n) {
        n.setAttribute('aria-checked', String(n === b));
      });
      onPick(o.value);
    });
    wrap.appendChild(b);
  });
  return wrap;
}

/** A switch. role=switch rather than a styled checkbox: one element, 44px tall,
 *  no shadow, and the knob is a hairline box like everything else here. */
function toggle(labelText, on, tag, onChange) {
  const row = el('div', 's2-toggle-row');
  const b = el('button', 's2-switch');
  b.type = 'button';
  b.setAttribute('role', 'switch');
  b.setAttribute('aria-checked', String(!!on));
  b.appendChild(el('span', 's2-knob'));
  const lab = el('span', 's2-toggle-label', labelText);
  const id = 's2-sw-' + Math.random().toString(36).slice(2, 8);
  lab.id = id;
  b.setAttribute('aria-labelledby', id);
  row.appendChild(lab);
  if (tag) row.appendChild(el('span', 's2-tag', tag));
  row.appendChild(b);
  b.addEventListener('click', function () {
    const next = b.getAttribute('aria-checked') !== 'true';
    b.setAttribute('aria-checked', String(next));
    if (onChange) onChange(next);
  });
  return row;
}

/* -------------------------------------------------------------- the sections */

/** WHO YOU ARE. No email, no password, NO DATE OF BIRTH. */
function identitySection(data, state) {
  const c = card('You');
  const first = state === 'first-run';

  if (first) {
    /* The name is asked AFTER the first pick. So in first-run there is no field
     * here at all - a settings screen that opens with an empty name box is a
     * one-field signup form, which is the counter-example wearing less. */
    c.appendChild(el('p', 's2-defer',
      'You are this device. We will ask for a name after your first pick, so the ' +
      'people in your pool know who beat them.'));
  } else {
    const lab = el('label', 's2-label', 'Display name');
    lab.setAttribute('for', 's2-name');
    const input = el('input', 's2-input');
    input.id = 's2-name';
    input.type = 'text';
    input.maxLength = 24;
    input.value = data.prefs.displayName || '';
    input.placeholder = 'Anonymous';
    input.setAttribute('autocomplete', 'nickname');
    input.setAttribute('enterkeyhint', 'done');
    c.appendChild(lab);
    c.appendChild(input);
    c.appendChild(el('p', 's2-note',
      'Only the people in your pool see this. Change it whenever you like.'));
  }

  /* The absence, said out loud. This is the Armchair screen answered. */
  const none = el('p', 's2-none');
  none.append(
    document.createTextNode('No email. No password. '),
    el('b', null, 'No date of birth.'),
    document.createTextNode(' Nothing here can be bought.')
  );
  c.appendChild(none);
  return c;
}

/** THE FOLLOWED TEAM. A list, not a grid, because 401 of 760 have no color. */
function teamSection(data, state, opts) {
  opts = opts || {};
  const first = state === 'first-run';
  const c = card('Your team');

  /* SKIP. Visible, in first-run, at the top of the chooser - where Sofascore
   * puts it - and it is honored: the app runs on default tokens without one. */
  if (first) {
    const head = el('div', 's2-skip-row');
    head.appendChild(el('p', 's2-note',
      'Follow a school and the app opens on its games. Entirely optional.'));
    const skip = el('button', 's2-skip', 'Skip');
    skip.type = 'button';
    skip.addEventListener('click', function () {
      c.dataset.skipped = 'true';
      list.hidden = true;
      search.hidden = true;
      skipped.hidden = false;
    });
    head.appendChild(skip);
    c.appendChild(head);
  }

  const current = el('div', 's2-current');
  if (data.followed) {
    current.appendChild(teamChip(data.followed, { size: 26 }));
    const nm = el('span', 's2-current-name', data.followed.short || data.followed.name);
    const clear = el('button', 's2-linkbtn', 'Clear');
    clear.type = 'button';
    clear.addEventListener('click', function () { current.hidden = true; });
    current.append(nm, clear);
    c.appendChild(current);
  }

  const search = el('input', 's2-input s2-search');
  search.type = 'search';
  search.placeholder = 'Search ' + data.total + ' schools';
  search.setAttribute('aria-label', 'Search schools');
  search.setAttribute('autocomplete', 'off');
  search.setAttribute('enterkeyhint', 'search');
  c.appendChild(search);

  const skipped = el('p', 's2-note',
    'Skipped. The app works on its own colors, and you can pick a school any time.');
  skipped.hidden = true;
  c.appendChild(skipped);

  const list = el('div', 's2-list');
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Schools');
  c.appendChild(list);

  const count = el('p', 's2-note s2-count num');
  c.appendChild(count);

  /* 🔴 NO INNER SCROLLER. The first version put all 760 in a 268px box and it
   * was rendered at 393px and scrolled with a thumb: the wheel is captured by
   * the box, so the page stops moving and the delay slider below it becomes
   * unreachable while your finger is anywhere near the middle of the screen.
   * That is invisible to every test in this repo and took ten seconds to see.
   *
   * So the list shows a page of eight and SEARCH IS THE PATH TO THE OTHER 752 -
   * which is what IMG_5199 and IMG_5200 actually teach. The eight are the real
   * alphabetical head of the file, not a flattering pick: two of the first eight
   * have no color at all, which is the honest ratio for a file where 401 of 760
   * do not. */
  const PAGE = 8;
  function draw(q) {
    const needle = (q || '').trim().toLowerCase();
    /* RANKED, not filtered. Typing OU against an unranked substring filter
     * returned App State, Assumption and Averett - "ou" is inside Mountaineers -
     * and Oklahoma was not on the page at all. A search that buries the exact
     * abbreviation under eight accidents is worse than no search, and it is the
     * one behavior IMG_5200 actually demonstrates. Rank: exact abbreviation,
     * then a name that starts with it, then a name that contains it, then the
     * full name. Ties keep the alphabetical order the file arrived in. */
    function rank(t) {
      const ab = (t.abbrev || '').toLowerCase();
      const sh = (t.short || '').toLowerCase();
      const nm = (t.name || '').toLowerCase();
      if (ab === needle) return 0;
      if (sh.indexOf(needle) === 0) return 1;
      if (ab.indexOf(needle) === 0) return 2;
      if (sh.indexOf(needle) > 0) return 3;
      if (nm.indexOf(needle) >= 0) return 4;
      return -1;
    }
    const rows = needle
      ? data.teams
          .map(function (t) { return { t: t, r: rank(t) }; })
          .filter(function (x) { return x.r >= 0; })
          .sort(function (a, b) { return a.r - b.r; })
          .map(function (x) { return x.t; })
      : data.teams;
    list.textContent = '';
    if (!rows.length) {
      list.appendChild(el('p', 's2-note s2-nomatch',
        'No school matches that. Try the city, or the nickname.'));
      count.textContent = '0 of ' + data.total + ' schools';
      return;
    }
    rows.slice(0, PAGE).forEach(function (t) {
      const b = el('button', 's2-team');
      b.type = 'button';
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', String(!!(data.followed && data.followed.id === t.id)));
      b.appendChild(teamChip(t, { size: 22 }));
      b.appendChild(el('span', 's2-team-name', t.short || t.name));
      list.appendChild(b);
    });
    count.textContent = rows.length > PAGE
      ? (needle
          ? PAGE + ' of ' + rows.length + ' matches · keep typing to narrow it'
          : PAGE + ' of ' + data.total + ' schools · type to find yours')
      : rows.length + ' of ' + data.total + ' schools';
  }
  search.addEventListener('input', function () { draw(search.value); });
  draw('');

  c.appendChild(el('p', 's2-note',
    'No logos anywhere in this app. A school is its colors, its abbreviation and ' +
    'its name in type - and 401 of the 760 have no color on file, so those read as ' +
    'a dashed outline rather than as black.'));

  if (opts.queued) {
    c.appendChild(el('p', 's2-queued', 'Saved on this device. Your pool sees it when you are back.'));
  }
  return c;
}

/** 🔴 THE DELAY. The one control no competitor ships. Always on, user-set. */
function delaySection(data) {
  const c = card('Broadcast delay');

  const read = el('p', 's2-delay-read num');
  const warn = el('p', 's2-delay-warn');
  const input = el('input', 's2-range');
  input.type = 'range';
  input.min = String(DELAY_MIN);
  input.max = String(DELAY_MAX);
  input.step = String(DELAY_STEP);
  input.value = String(data.prefs.delaySeconds);
  input.setAttribute('aria-label', 'Broadcast delay in seconds');

  function paint() {
    const v = Number(input.value);
    input.setAttribute('aria-valuetext', v ? v + ' seconds behind' : 'Live, no delay');
    read.textContent = v ? v + 's behind your television' : 'Live - no delay';
    /* Zero is reachable and it is labeled, because a slider whose floor is a
     * lie is a fork wearing a slider. It is also the only setting on this
     * screen that can spoil the game, so it says so. */
    warn.hidden = v !== 0;
  }
  warn.textContent =
    'At Live the app runs ahead of almost every television. You will read the ' +
    'touchdown before you see it.';
  input.addEventListener('input', paint);
  paint();

  c.appendChild(read);
  c.appendChild(input);

  /* THE MARKS SIT AT THEIR TRUE POSITION ON THE TRACK, not evenly spaced. An
   * evenly-spaced row of four labels put "Cable 10s" at a third of the travel
   * when 10 of 90 is an ninth of it - a scale that lies about where a value is
   * is worse than no scale, and it was visible the moment it was rendered at
   * 393px rather than reasoned about. Three marks, each at its real percentage:
   * 0, 45 (exactly half of 90) and 90. The cable and stream ranges are in the
   * sentence underneath, where a range belongs. */
  const scale = el('div', 's2-scale num');
  [[0, 'Live'], [45, '45s'], [90, '90s']].forEach(function (m) {
    const s = el('span', 's2-mark', m[1]);
    s.style.left = ((m[0] - DELAY_MIN) / (DELAY_MAX - DELAY_MIN) * 100) + '%';
    if (m[0] === DELAY_MIN) s.dataset.edge = 'start';
    if (m[0] === DELAY_MAX) s.dataset.edge = 'end';
    scale.appendChild(s);
  });
  c.appendChild(scale);
  c.appendChild(warn);
  c.appendChild(el('p', 's2-note',
    'Any Given holds every play, every price and every alert until your picture ' +
    'catches up. Being behind is the point - set this to match what you are ' +
    'watching. Streams usually run 30-60 seconds late, cable 5-15.'));
  return c;
}

function themeSection(data) {
  const c = card('Theme');
  /* Setting data-theme on the root is exactly the contract tokens.css declares:
   * :root[data-theme="dark"] wins, and removing the attribute falls back to
   * prefers-color-scheme. Nothing here writes a token. */
  c.appendChild(segmented('Theme', [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'System' }
  ], data.prefs.theme, function (v) {
    if (v === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = v;
  }));
  c.appendChild(el('p', 's2-note',
    'System follows your phone, including the switch at sunset.'));
  return c;
}

/** DENSITY - the viewer's, with a live example row inside the control. */
function densitySection(data) {
  const c = card('Slate density');
  const demo = el('div', 's2-demo');
  demo.dataset.density = data.prefs.density;

  function drawDemo() {
    demo.textContent = '';
    const g = data.example;
    if (!g) {
      demo.appendChild(el('p', 's2-note', 'No fixture loaded, so there is nothing to preview.'));
      return;
    }
    const row = el('div', 's2-demo-row');
    const teamsBox = el('div', 's2-demo-teams');
    teamsBox.appendChild(teamChip(g.away, { size: 20 }));
    teamsBox.appendChild(el('span', 's2-demo-at', 'at'));
    teamsBox.appendChild(teamChip(g.home, { size: 20 }));
    row.appendChild(teamsBox);

    if (demo.dataset.density === 'compact') {
      /* Compact is the abbreviation and the time and nothing else. The first
       * version kept the full names beside the chips and the row ellipsed at
       * 393px - "UTEP at Oklaho…" - which is a compact mode that is neither
       * compact nor legible. The chip already carries the abbreviation, so the
       * second copy of the name was the thing to cut. */
      row.appendChild(el('span', 's2-demo-when num', kickoff(g.kickoffUtc)));
    } else {
      const stack = el('div', 's2-demo-stack');
      stack.appendChild(el('span', 's2-demo-line', g.away.name));
      stack.appendChild(el('span', 's2-demo-line', g.home.name));
      stack.appendChild(el('span', 's2-demo-when num',
        kickoff(g.kickoffUtc) + (g.venue ? ' · ' + g.venue : '')));
      row.appendChild(stack);
    }
    demo.appendChild(row);
  }

  c.appendChild(segmented('Slate density', [
    { value: 'compact', label: 'Compact' },
    { value: 'detailed', label: 'Detailed' }
  ], data.prefs.density, function (v) { demo.dataset.density = v; drawDemo(); }));
  c.appendChild(demo);
  drawDemo();
  c.appendChild(el('p', 's2-note',
    'This changes how the slate looks to you, on this device. It never changes ' +
    'which games are in the pool - everybody picks the same slate or the ' +
    'standings mean nothing.'));
  return c;
}

/** ALERT PREFERENCES. The wording of each alert belongs to L3; the rows are here,
 *  and so is the sentence that joins them to the slider above. */
function alertsSection(data) {
  const c = card('Alerts');
  const rows = el('div', 's2-rows');
  rows.hidden = !data.prefs.alertsOn;

  c.appendChild(toggle('Alerts on this device', data.prefs.alertsOn, null, function (on) {
    rows.hidden = !on;
  }));
  ALERTS.forEach(function (a) {
    rows.appendChild(toggle(a.label, data.prefs.alerts[a.kind],
      a.holdsState ? 'held' : 'no state', null));
  });
  c.appendChild(rows);
  c.appendChild(el('p', 's2-note',
    'Anything tagged held names a score, a play or a result, so it waits out your ' +
    'broadcast delay before it reaches your phone. Move the slider and these move ' +
    'with it. Nothing tagged no state ever carries a number.'));
  return c;
}

/* -------------------------------------------------------------------- render */

/* 🔴 THE BALANCE LINE LIVES HERE NOW. It used to sit on the call card, on every
 * snap of every game, and Jason removed it 2026-09-08: "do i need to state every
 * single time that marbles cannot be bought? no."
 *
 * DESIGN.md requires the line to stay ON SCREEN, and that requirement survives -
 * it moved rather than went. The call card carries the UNIT ("200 Marbles"),
 * which is what tells a user, a reviewer and a regulator it is not money; this
 * section carries the SENTENCE, once, where somebody would look for it.
 *
 * Deleting it from here would be a change to the legal position, not an edit. */
function balanceSection() {
  const sec = section('The balance');
  const row = el('div', 's2-row');
  row.appendChild(el('div', 's2-row-label', 'Marbles'));
  const v = el('div', 's2-row-value');
  v.textContent = 'Cannot be bought';
  row.appendChild(v);
  sec.appendChild(row);
  sec.appendChild(el('p', 's2-note',
    'Marbles cannot be bought, sold, cashed out or transferred, and nothing that '
    + 'affects play is ever for sale. Everybody starts every game on the same '
    + 'number and it resets at the next kickoff, so nobody is ever out.'));
  return sec;
}

export function render(root, data, state) {
  root.innerHTML = '';
  root.classList.add('scr-s2-settings');

  const style = document.createElement('style');
  style.textContent = [TEAM_CHIP_CSS, STATES_CSS].join('\n');
  root.appendChild(style);

  const h = el('h1', 's2-title', state === 'first-run' ? 'Set up Any Given…' : 'Settings');
  root.appendChild(h);
  root.appendChild(el('p', 's2-sub',
    state === 'first-run'
      ? 'All of it optional. None of it an account.'
      : 'No account. This is your device.'));

  if (state === 'loading') {
    root.appendChild(stateBlock('loading', { rows: 5, body: 'Reading your settings…' }));
    return;
  }

  if (state === 'error') {
    root.appendChild(stateBlock('error', {
      title: 'Your settings did not load',
      body: 'Nothing you had set has been lost. What is on this device is below and still works.',
      action: { label: 'Try again' }
    }));
    /* An error on the network does not disable the controls that never needed
     * it. The alternative is a blank screen that also cannot change the theme. */
    root.appendChild(delaySection(data));
    root.appendChild(themeSection(data));
    root.appendChild(densitySection(data));
    return;
  }

  if (state === 'offline') {
    root.appendChild(stateBlock('offline', {
      title: 'You are offline',
      body: 'Every setting here lives on this device, so all of it still works. ' +
            'Your name and your school reach your pool when you reconnect.',
      since: data.lastSync,
      action: { label: 'Try again' }
    }));
    root.appendChild(identitySection(data, 'ready'));
    root.appendChild(teamSection(data, 'ready', { queued: true }));
    root.appendChild(delaySection(data));
    root.appendChild(themeSection(data));
    root.appendChild(densitySection(data));
    root.appendChild(alertsSection(data));
    return;
  }

  if (state === 'first-run') {
    /* ORDER IS THE DECISION HERE. The chooser leads, Skip is in it, the delay is
     * second because screen-flow stage 2 requires it to be set before the first
     * play is ever shown, and the name is not asked at all. */
    root.appendChild(teamSection(data, 'first-run'));
    root.appendChild(delaySection(data));
    root.appendChild(themeSection(data));
    root.appendChild(alertsSection(data));
    root.appendChild(identitySection(data, 'first-run'));
    return;
  }

  root.appendChild(identitySection(data, 'ready'));
  root.appendChild(teamSection(data, 'ready'));
  root.appendChild(delaySection(data));
  root.appendChild(themeSection(data));
  root.appendChild(densitySection(data));
  root.appendChild(alertsSection(data));
  root.appendChild(balanceSection());
}
