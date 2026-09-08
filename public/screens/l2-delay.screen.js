/* L2 - THE BROADCAST DELAY.
 *
 * The user is on a couch next to a television that is already showing the game.
 * This app is DELIBERATELY BEHIND so it cannot spoil the play. screen-flow Stage 2:
 * "Being late is a feature and the interface has to say so out loud, or a user who
 * is 45 seconds behind their television reads the app as broken."
 *
 * THE BAR, opened before a line of this was written:
 *   reference/armchair-quarterback-teardown/screens/AQB-locked-play-in-progress.png
 *   reference/armchair-quarterback-teardown/screens/AQB-locked-binary-you-selected-pass.png
 * Armchair Quarterback's answer is a full-width green panel reading PLAY IN
 * PROGRESS / Your gameplay selection screen will be live at the end of this play,
 * with YOU SELECTED: PASS beneath it. It covers the selection grid for the whole
 * play; the two tiles that survive underneath sit at roughly a fifth opacity and
 * cannot be read; the header row - teams, down and distance, both scores - is
 * dimmed with it. AND THERE IS NO NUMBER ANYWHERE ON IT. "at the end of this play"
 * is the only thing it will tell you about when the wait ends.
 *
 * IT WORKS, AND IT COSTS THEM THE MOMENT. COUNTER-POSITIONING row 4 is the answer
 * and it is settled, not mine to re-open:
 *
 *   THE DELAY HOLDS THE BOARD, IT DOES NOT REPLACE IT.
 *
 * So there is no overlay in this file, no scrim, no dimming, and no state in which
 * the board is not fully legible - including while the slider itself is open. The
 * three things Armchair's panel takes away are the three things that stay:
 *   1. the board, at full contrast, always
 *   2. a NUMBER - how far behind, and how long until the next play lands
 *   3. a control, one tap from anywhere, because the delay is user-set
 *
 * WHAT IS SETTLED AND IS NOT DECIDED HERE:
 *   - an always-on slider, user-set. Not a fork, not a shutter
 *   - set before the first play is ever shown, re-reachable in one tap
 *   - applied CLIENT-SIDE by holding the event queue (CONTRACT section 8). The
 *     Durable Object sends in real time; this client is deliberately behind
 *   - every notification is held by the same delay or carries no state at all.
 *     THE CONTROL IS OURS AND THE NOTIFICATION COPY IS L3'S, so this screen states
 *     the consequence of the setting and writes none of the alerts
 *
 * WHERE THE NUMBERS COME FROM. Nothing here is invented. Every play in
 * fixtures/real-utep-at-ou-260905-final.json carries a real `wallclock` stamp, so
 * the hold is computed the way the shipped client computes it - a cutoff at
 * now - delay, plays past it held, plays before it released. The gaps between real
 * snaps in that game run 39-41 seconds, which is why a 45-second delay holds one
 * or two plays and not ten. The countdown on screen is that arithmetic, ticking.
 *
 * OFFLINE IS THE ONE STATE WITH NO BAR ANYWHERE (DESIGN-BRIEF section 8 records it
 * as COULD NOT CLOSE: nobody captured is delayed on purpose). The position taken
 * here: THE DELAY IS A BUFFER, and when the connection drops the buffer is what
 * you are watching. The board keeps moving for exactly as long as the hold, says
 * so in seconds, and then freezes and says that instead. Calls close at the drop,
 * because a play that has already happened cannot be honestly called.
 */
import { stateBlock, STATES_CSS } from '/components/states.js';
import { teamChip, TEAM_CHIP_CSS } from '/components/team-chip.js';
import { clock, payoutLabel } from '/components/fmt.js';

export const id = 'l2-delay';
export const title = 'The broadcast delay';
export const bar = 'reference/armchair-quarterback-teardown/screens/AQB-locked-play-in-progress.png';
/* `empty` is not in the dispatch's list and is here because CONTRACT section 4
 * requires it and because it is the state the settled rule actually names: the
 * delay must be set BEFORE THE FIRST PLAY IS EVER SHOWN, and the only screen on
 * which that is possible is the one with no game running yet. */
export const states = ['ready', 'setting', 'caught-up', 'empty', 'loading', 'offline', 'error'];

/* 45s is the reference implementation's own documented anchor, not a guess:
 * run.py's example reads `--delay 45   # ESPN+ runs ~45s late`. */
export const DEFAULT_DELAY_MS = 45000;
export const PRESETS_MS = [0, 15000, 30000, 45000, 60000, 90000];
export const MAX_DELAY_MS = 120000;

/* ------------------------------------------------------------------ the math
 * PURE. No DOM. This is what tests/l2-delay.test.mjs runs against the real
 * wallclock stamps in the fixture, and it is the same function the screen draws.
 */

/**
 * The client-side hold. `plays` MUST be sorted ascending by `wall`.
 * @param {{wall:number}[]} plays        every play the client has been sent
 * @param {number} nowMs                 wall clock now
 * @param {number} delayMs               the user's setting
 * @param {number|null} knownUpToMs      the last moment data arrived. null = live.
 *                                       Set it to model a dropped connection.
 */
export function holdWindow(plays, nowMs, delayMs, knownUpToMs) {
  const cutoff = nowMs - delayMs;
  /* A PLAY CANNOT ARRIVE BEFORE IT HAPPENS. Clamping arrivals at `now` is not
   * housekeeping - without it, a fixture of a finished game hands the client the
   * whole rest of the fourth quarter and the strip reports "104 plays waiting"
   * at a zero delay. Caught by tests/l2-delay.test.mjs against the real game. */
  const horizon = (knownUpToMs == null) ? nowMs : Math.min(nowMs, knownUpToMs);
  const known = plays.filter((p) => p.wall <= horizon);
  const released = known.filter((p) => p.wall <= cutoff);
  const held = known.filter((p) => p.wall > cutoff);
  const next = held.length ? held[0] : null;
  const newest = known.length ? known[known.length - 1] : null;
  return {
    released,
    held,
    /* What the board is showing. NOT the newest play - that is the whole point. */
    current: released.length ? released[released.length - 1] : null,
    heldCount: held.length,
    nextReleaseInMs: next ? Math.max(0, next.wall + delayMs - nowMs) : null,
    /* How long this client can keep drawing new plays with NO new data. The delay
     * is a buffer and this is how much of it is left. Offline lives on this. */
    bufferMs: newest ? Math.max(0, newest.wall + delayMs - nowMs) : 0,
    /* How stale what you are looking at is, in seconds. */
    ageMs: released.length ? Math.max(0, nowMs - released[released.length - 1].wall) : null
  };
}

/** The crudest possible tendency, counted off the plays this client has RELEASED.
 *  Confidence is the SAMPLE COUNT, never the lean - types.ts amendment 2. */
export function tendency(released, offenseId) {
  let run = 0, pass = 0;
  for (const p of released) {
    if (p.offenseId !== offenseId) continue;
    if (p.kind === 'run') run++;
    else if (p.kind === 'pass') pass++;
  }
  const n = run + pass;
  if (!n) return null;
  return { n, pRun: run / n, pPass: pass / n, confidence: n >= 40 ? 'hi' : n >= 15 ? 'mid' : 'lo' };
}

/** Seconds, always tabular, always with a unit. `45s`, `1:30`. */
export function holdLabel(ms) {
  const s = Math.round(ms / 1000);
  return s < 60 ? s + 's' : clock(s);
}

/* ------------------------------------------------------------- preview data */

const GAME = 'real-utep-at-ou';

function kindOf(typeText) {
  const t = String(typeText || '').toLowerCase();
  if (/rush/.test(t)) return 'run';
  if (/pass|sack/.test(t)) return 'pass';
  if (/kick|punt|field goal/.test(t)) return 'kick';
  if (/penalty/.test(t)) return 'penalty';
  return 'other';
}

export async function previewData(fixtures, state) {
  const roster = fixtures.teams.teams;
  const raw = await fixtures.load(GAME);
  const comp = raw.header.competitions[0];
  const homeId = comp.competitors.find((c) => c.homeAway === 'home').team.id;
  const awayId = comp.competitors.find((c) => c.homeAway === 'away').team.id;

  const plays = [];
  for (const d of raw.drives.previous || []) {
    for (const p of d.plays || []) {
      if (!p.wallclock || !p.text) continue;
      plays.push({
        id: p.id,
        wall: Date.parse(p.wallclock),
        quarter: p.period ? p.period.number : null,
        clock: p.clock ? p.clock.displayValue : null,
        down: p.start ? p.start.down : null,
        distance: p.start ? p.start.distance : null,
        yardsToGoal: p.start ? p.start.yardsToEndzone : null,
        offenseId: (p.start && p.start.team) ? p.start.team.id : (d.team ? d.team.id : null),
        text: p.text,
        kind: kindOf(p.type && p.type.text),
        homeScore: p.homeScore,
        awayScore: p.awayScore,
        driveResult: d.displayResult || null
      });
    }
  }
  plays.sort((a, b) => a.wall - b.wall);

  /* A real moment in a real game, chosen by position rather than by hand-picking
   * one that flatters the layout: a third of the way in, six seconds after a snap. */
  const anchorPlay = plays[Math.floor(plays.length * 0.34)];
  const anchorMs = anchorPlay.wall + 6000;

  /* The team-color survival rail. Real rows out of the real 760-team file, found
   * by scanning it rather than by naming ids: a navy, a second navy for the
   * navy-on-navy pair, a yellow that also has NO SECONDARY, and a team with no
   * captured color at all. Reachable in the browser as #navy / #navy-navy /
   * #yellow / #none - a preview affordance, not a shipped feature. */
  const all = Object.values(roster);
  const lum = (h) => {
    const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const hex = (t) => (/^[0-9a-f]{6}$/.test(String(t.primary || '').toLowerCase()) ? String(t.primary).toLowerCase() : null);
  const isNavy = (t) => {
    const h = hex(t); if (!h || h === '000000') return false;
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return b > r + 20 && b > g + 10 && lum(h) < 0.10;
  };
  const isYellow = (t) => {
    const h = hex(t); if (!h || h === '000000') return false;
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return r > 200 && g > 150 && b < 90;
  };
  const navies = all.filter(isNavy);
  const palette = {
    navy: navies[0] || null,
    navyB: navies[1] || null,
    yellow: all.find((t) => isYellow(t) && !t.secondary) || all.find(isYellow) || null,
    none: all.find((t) => !hex(t) || hex(t) === '000000') || null
  };

  return {
    home: roster[homeId], away: roster[awayId], homeId, awayId,
    plays, anchorMs,
    totalPlays: plays.length,
    palette,
    initialDelayMs: state === 'caught-up' ? 0 : DEFAULT_DELAY_MS
  };
}

/* ------------------------------------------------------------------- render */

const VIEWS = new WeakMap();

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export function render(root, data, state) {
  root.classList.add('scr-l2-delay');

  const prev = VIEWS.get(root);
  if (prev && prev.timer) clearInterval(prev.timer);

  const view = {
    state,
    data,
    delayMs: data && data.initialDelayMs != null ? data.initialDelayMs : DEFAULT_DELAY_MS,
    nowMs: data ? data.anchorMs : Date.now(),
    /* OFFLINE: the connection dropped at the anchor and fourteen seconds have
     * passed, so part of the buffer has already drained. It keeps draining while
     * you look at it, which is the state's entire argument. */
    knownUpToMs: state === 'offline' && data ? data.anchorMs : null,
    panelOpen: state === 'setting',
    lastReleased: -1,
    refs: {}
  };
  /* Fourteen seconds have already passed since the drop, so the buffer is part
   * drained and visibly draining. `#dry` jumps past the end of it, because the
   * frozen board is the half of this state that matters and waiting out a real
   * 25-second countdown to look at it is not a review anyone will do twice. */
  if (state === 'offline' && data) {
    view.nowMs = data.anchorMs + ((location.hash === '#dry') ? 180000 : 14000);
  }
  VIEWS.set(root, view);

  draw(root, view);

  if (state !== 'error' && state !== 'loading' && data) {
    view.timer = setInterval(() => tick(root, view), 1000);
  }
  if (!root.dataset.l2Hash) {
    root.dataset.l2Hash = '1';
    window.addEventListener('hashchange', () => {
      const v = VIEWS.get(root);
      if (v) render(root, v.data, v.state);
    });
  }
}

/* One second of real time. A FULL REDRAW ONLY WHEN A PLAY ACTUALLY LANDS - if the
 * whole subtree were rebuilt every tick the slider would lose focus mid-drag and
 * the play text would flicker once a second for no reason. */
function tick(root, view) {
  view.nowMs += 1000;
  const w = window_(view);
  if (w.released.length !== view.lastReleased) { draw(root, view); return; }
  paintCountdown(view, w);
}

function window_(view) {
  return holdWindow(view.data.plays, view.nowMs, view.delayMs, view.knownUpToMs);
}

/** #navy / #navy-navy / #yellow / #none swap the two identities for real rows out
 *  of teams.json, so the board can be looked at against every color case. */
function pair(view) {
  const d = view.data, p = d.palette, h = (location.hash || '').replace('#', '');
  if (h === 'navy' && p.navy) return { home: p.navy, away: d.away, label: 'navy primary' };
  if (h === 'navy-navy' && p.navy && p.navyB) return { home: p.navy, away: p.navyB, label: 'navy on navy' };
  if (h === 'yellow' && p.yellow) return { home: p.yellow, away: d.away, label: 'yellow primary, no secondary' };
  if (h === 'none' && p.none) return { home: p.none, away: d.away, label: 'no captured color' };
  return { home: d.home, away: d.away, label: null };
}

function draw(root, view) {
  root.innerHTML = '';
  view.refs = {};

  const style = el('style');
  style.textContent = [STATES_CSS, TEAM_CHIP_CSS].join('\n');
  root.appendChild(style);

  if (view.state === 'error') {
    root.appendChild(strip(root, view, null));
    root.appendChild(stateBlock('error', {
      title: 'The feed did not load',
      body: 'Your delay is still set and still applies. Nothing you have called has been lost.',
      action: { label: 'Reload' }
    }));
    return;
  }

  if (view.state === 'empty') {
    /* NO GAME YET, AND THIS IS WHERE THE SETTING BELONGS. Every other screen in
     * the live layer offers the control after plays have started arriving, which
     * is already one play too late to avoid a spoiler. */
    root.appendChild(strip(root, view, null));
    if (view.panelOpen) root.appendChild(panel(root, view));
    const b = stateBlock('empty', {
      title: 'No game is running',
      body: 'Your delay is set and waiting. Set it now, before kickoff, and the first play of the game is already held — there is no first play to be spoiled by.',
      action: { label: view.panelOpen ? 'Done' : 'Set the delay', onClick: () => { view.panelOpen = !view.panelOpen; draw(root, view); } }
    });
    root.appendChild(b);
    return;
  }

  if (view.state === 'loading') {
    /* THE STRIP IS DRAWN FIRST AND IS NOT PART OF THE LOAD. The delay is a client
     * setting; it is known before a single play has arrived, which is what makes
     * "set it before the first play is ever shown" possible at all. */
    root.appendChild(strip(root, view, null));
    root.appendChild(stateBlock('loading', { rows: 4, body: 'Waiting for the first play, then holding it ' + holdLabel(view.delayMs) + '.' }));
    return;
  }

  const w = window_(view);
  view.lastReleased = w.released.length;

  root.appendChild(strip(root, view, w));
  if (view.panelOpen) root.appendChild(panel(root, view));
  root.appendChild(board(root, view, w));
}

/* ---------------------------------------------------------------- the strip
 * ALWAYS ON, ALWAYS FIRST, NEVER COVERING ANYTHING. It is the one-tap route to
 * the control from every screen in the live layer, and it is the thing that says
 * out loud that being late is on purpose.
 */
function strip(root, view, w) {
  const offline = view.state === 'offline';
  const live = view.delayMs === 0;
  const box = el('section', 'l2-hold card');
  box.dataset.mode = offline ? 'offline' : live ? 'live' : 'holding';
  box.setAttribute('role', 'status');

  const top = el('div', 'l2-hold-top');

  const fig = el('div', 'l2-hold-fig');
  fig.appendChild(el('span', 'l2-hold-key', offline ? 'Connection lost' : live ? 'No delay' : 'Behind on purpose'));
  const big = el('span', 'l2-hold-num num');
  big.textContent = offline && w ? holdLabel(w.bufferMs) : live ? 'live' : holdLabel(view.delayMs);
  fig.appendChild(big);
  view.refs.big = big;
  top.appendChild(fig);

  /* ONE TAP. From anywhere in the live layer, this is the control. */
  const btn = el('button', 'l2-hold-btn', view.panelOpen ? 'Done' : live ? 'Add a delay' : 'Adjust');
  btn.setAttribute('aria-expanded', String(view.panelOpen));
  btn.addEventListener('click', () => { view.panelOpen = !view.panelOpen; draw(root, view); });
  top.appendChild(btn);
  box.appendChild(top);

  /* The rail. Its whole job is to prove the app is working rather than stuck -
   * a static number cannot tell "deliberately behind" from "frozen", and a
   * moving one can. Armchair's panel has neither. */
  const rail = el('div', 'l2-rail');
  const fill = el('div', 'l2-rail-fill');
  rail.appendChild(fill);
  view.refs.fill = fill;
  box.appendChild(rail);

  const line = el('p', 'l2-hold-line');
  line.setAttribute('aria-live', 'polite');
  view.refs.line = line;
  box.appendChild(line);

  if (!offline && !live) {
    const pips = el('div', 'l2-pips');
    pips.setAttribute('aria-hidden', 'true');
    view.refs.pips = pips;
    box.appendChild(pips);
  }

  if (live) {
    const warn = el('p', 'l2-warn');
    warn.textContent = 'The app is now as fast as the feed and may be ahead of your television. Anything it shows, and every alert it sends, can reach you before the play does.';
    box.appendChild(warn);
  }

  if (w) {
    paintCountdown(view, w);
  } else {
    /* No feed yet, and the delay still applies and still says so. */
    fill.style.width = '0%';
    line.textContent = live
      ? 'No delay is set. The first play will land the moment the feed has it.'
      : `The first play will be held ${holdLabel(view.delayMs)} before it reaches you.`;
  }
  return box;
}

/* The only thing that changes on a quiet tick. */
function paintCountdown(view, w) {
  const r = view.refs;
  const offline = view.state === 'offline';
  const live = view.delayMs === 0;

  if (r.big) r.big.textContent = offline ? holdLabel(w.bufferMs) : live ? 'live' : holdLabel(view.delayMs);

  if (r.fill) {
    let pct = 0;
    if (offline) pct = view.delayMs ? (w.bufferMs / view.delayMs) * 100 : 0;
    else if (!live && w.nextReleaseInMs != null && view.delayMs) pct = (1 - w.nextReleaseInMs / view.delayMs) * 100;
    else pct = 100;
    r.fill.style.width = Math.max(0, Math.min(100, pct)).toFixed(1) + '%';
  }

  if (r.line) {
    if (offline) {
      r.line.textContent = w.bufferMs > 0
        ? `The delay is a buffer and it is what you are watching now. ${w.heldCount === 1 ? '1 play is' : w.heldCount + ' plays are'} still held · the board keeps moving for ${holdLabel(w.bufferMs)}, then stops.`
        : `Buffer empty. The board is frozen where you see it and the game has moved on without it.`;
    } else if (live) {
      r.line.textContent = 'Every play lands the moment the feed has it.';
    } else {
      const held = w.heldCount === 0 ? 'nothing waiting'
        : w.heldCount === 1 ? '1 play waiting' : w.heldCount + ' plays waiting';
      const next = w.nextReleaseInMs == null ? '' : ` · next in ${Math.ceil(w.nextReleaseInMs / 1000)}s`;
      r.line.textContent = `Everything below is the game as it stood ${holdLabel(view.delayMs)} ago, so it cannot get ahead of your television. ${held}${next}.`;
    }
  }

  if (r.pips) {
    /* A HELD PLAY IS A COUNT, NEVER ITS CONTENT. One pip per play in the queue and
     * not one word of what happened in it - the same rule that makes a push
     * reading "Q2 started: 31 - 28" fatal applies to the app's own chrome. */
    const want = Math.min(w.heldCount, 8);
    while (r.pips.children.length > want) r.pips.lastChild.remove();
    while (r.pips.children.length < want) r.pips.appendChild(el('span', 'l2-pip'));
  }
}

/* ---------------------------------------------------------------- the panel
 * IT EXPANDS IN PLACE ABOVE THE BOARD. It is not a modal, not a sheet and not a
 * takeover, because the moment the control covers the board this screen has
 * become the thing it is defined against.
 */
function panel(root, view) {
  const box = el('section', 'l2-panel card');

  const h = el('h2', 'l2-panel-h', 'How far behind your television?');
  box.appendChild(h);

  const read = el('div', 'l2-read');
  const rn = el('span', 'l2-read-num num', holdLabel(view.delayMs));
  const rl = el('span', 'l2-read-lab', view.delayMs === 0 ? 'no delay · live with the feed' : 'behind the feed');
  read.append(rn, rl);
  box.appendChild(read);

  const slider = el('input', 'l2-slider');
  slider.type = 'range';
  slider.min = '0'; slider.max = String(MAX_DELAY_MS / 1000); slider.step = '5';
  slider.value = String(Math.round(view.delayMs / 1000));
  slider.setAttribute('aria-label', 'Broadcast delay in seconds');
  slider.addEventListener('input', () => {
    view.delayMs = Number(slider.value) * 1000;
    rn.textContent = holdLabel(view.delayMs);
    rl.textContent = view.delayMs === 0 ? 'no delay · live with the feed' : 'behind the feed';
    live(root, view);
  });
  slider.addEventListener('change', () => draw(root, view));
  box.appendChild(slider);

  const scale = el('div', 'l2-scale num');
  scale.append(el('span', null, '0'), el('span', null, '60s'), el('span', null, '2:00'));
  box.appendChild(scale);

  const row = el('div', 'l2-presets');
  for (const ms of PRESETS_MS) {
    const b = el('button', 'l2-preset num', ms === 0 ? 'Live' : holdLabel(ms));
    if (ms === view.delayMs) b.dataset.on = 'true';
    b.setAttribute('aria-pressed', String(ms === view.delayMs));
    b.addEventListener('click', () => { view.delayMs = ms; draw(root, view); });
    row.appendChild(b);
  }
  box.appendChild(row);

  const help = el('p', 'l2-help', 'Cable is close to live; a streaming app is usually 45 to 60 seconds behind it. If you are not sure, set it long — too far behind is a wait, too far ahead is a spoiled play.');
  box.appendChild(help);

  /* Nobody knows their own stream's offset in seconds. They do know when they saw
   * the ball snapped, so the honest control is a stopwatch rather than a guess. */
  const cal = el('button', 'l2-cal', 'Tap when the next snap happens on TV');
  cal.addEventListener('click', () => {
    const w = window_(view);
    const newest = w.held.length ? w.held[w.held.length - 1] : w.current;
    if (!newest) return;
    view.delayMs = Math.max(0, Math.min(MAX_DELAY_MS, Math.round((view.nowMs - newest.wall) / 5000) * 5000));
    draw(root, view);
  });
  box.appendChild(cal);

  /* THE SPOILER RULE, stated where the setting is made. The control is this
   * screen's; the wording of the alerts themselves is L3's and is not written
   * here. What this screen owes the user is the consequence of the number. */
  const note = el('p', 'l2-note');
  note.textContent = view.delayMs === 0
    ? 'Alerts follow this setting. At zero they arrive live, carrying the score, and your phone will beat your television to the play. Change it any time from the strip above.'
    : `Alerts are held the same ${holdLabel(view.delayMs)}, so nothing buzzes about a play the app has not shown you. Change it any time from the strip above.`;
  box.appendChild(note);

  return box;
}

/* Slider drag: repaint the strip's numbers without rebuilding the slider. */
function live(root, view) {
  const w = window_(view);
  view.lastReleased = w.released.length;
  paintCountdown(view, w);
  const b = root.querySelector('.l2-board');
  if (b) {
    const fresh = board(root, view, w);
    b.replaceWith(fresh);
  }
  const hold = root.querySelector('.l2-hold');
  if (hold) hold.dataset.mode = view.state === 'offline' ? 'offline' : view.delayMs === 0 ? 'live' : 'holding';
}

/* ---------------------------------------------------------------- the board
 * THE PART ARMCHAIR COVERS. It is drawn at full contrast in every state this
 * screen has, including while the panel above it is open.
 */
function board(root, view, w) {
  const box = el('section', 'l2-board');
  const d = view.data;
  const p = pair(view);
  const cur = w.current;

  const sc = el('div', 'l2-score card');
  sc.appendChild(scoreSide(p.away, cur ? cur.awayScore : null, p.home));
  const mid = el('div', 'l2-score-mid num');
  mid.appendChild(el('span', 'l2-q', cur ? 'Q' + cur.quarter : '—'));
  mid.appendChild(el('span', 'l2-clock', cur ? cur.clock : '—'));
  sc.appendChild(mid);
  sc.appendChild(scoreSide(p.home, cur ? cur.homeScore : null, p.away, true));
  box.appendChild(sc);

  const stale = el('p', 'l2-stale num');
  /* NOT the same number as the delay, and it must not look like it: the delay is
   * the hold, this is how long ago the play on screen actually happened. At a 45s
   * hold and a 39-60s gap between real snaps they differ by half a minute, and
   * the first draft read "As of 74s ago" directly under "45s" like a contradiction. */
  stale.textContent = w.ageMs == null
    ? 'No play has landed yet'
    : `Last play landed ${Math.round(w.ageMs / 1000)}s ago · ${w.released.length} of ${d.totalPlays} plays in`;
  box.appendChild(stale);
  if (p.label) {
    const tag = el('p', 'l2-stale', 'Color check: ' + p.label);
    box.appendChild(tag);
  }

  const play = el('article', 'l2-play card');
  const sit = el('p', 'l2-sit num');
  sit.textContent = cur
    ? `${ord(cur.down)} & ${cur.distance == null ? '—' : cur.distance} · ${abbrevOf(cur.offenseId, d, p)} ball · ${cur.yardsToGoal == null ? '—' : cur.yardsToGoal} to the end zone`
    : 'Waiting for the first play';
  play.appendChild(sit);
  /* Raw feed text. A view NEVER derives the star from it - requirement 7.2, and
   * the parenthesized group at the end is the tackler. The shipped board renders
   * Play.star, which parse.ts emits and this preview has no access to. */
  play.appendChild(el('p', 'l2-text', cur ? cur.text : '—'));
  if (cur && cur.driveResult) play.appendChild(el('p', 'l2-drive', 'Drive: ' + cur.driveResult));
  box.appendChild(play);

  box.appendChild(tiles(view, w));
  return box;
}

function scoreSide(team, score, other, alignRight) {
  const s = el('div', 'l2-side' + (alignRight ? ' l2-side-r' : ''));
  s.appendChild(teamChip(team, { adjacentTo: other, size: 20 }));
  const n = el('span', 'l2-pts num', score == null ? '—' : String(score));
  s.appendChild(n);
  return s;
}

function ord(n) {
  if (n == null) return '—';
  return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : n + 'th';
}

function abbrevOf(offenseId, d, p) {
  if (offenseId === d.homeId) return p.home ? p.home.abbrev : '—';
  if (offenseId === d.awayId) return p.away ? p.away.abbrev : '—';
  return '—';
}

/* The selection tiles. THESE ARE THE THING ARMCHAIR'S PANEL SITS ON TOP OF, so
 * their being readable and tappable while the delay holds is the evidence this
 * piece exists to produce. The price is on the tile before the tap, always. */
function tiles(view, w) {
  const wrap = el('div', 'l2-tiles');
  const offline = view.state === 'offline';
  const cur = w.current;
  const t = cur ? tendency(w.released, cur.offenseId) : null;

  for (const side of ['run', 'pass']) {
    const b = el('button', 'l2-tile');
    b.dataset.side = side;
    const pr = t ? (side === 'run' ? t.pRun : t.pPass) : null;
    b.disabled = offline || !pr;
    const head = el('span', 'l2-tile-side', side === 'run' ? 'Run' : 'Pass');
    const price = el('span', 'l2-tile-price num', pr ? payoutLabel(pr) : '—');
    const conf = el('span', 'l2-tile-conf c-' + (t ? t.confidence : 'lo'), t ? t.confidence : 'lo');
    b.append(head, price, conf);
    wrap.appendChild(b);
  }

  const why = el('p', 'l2-why');
  why.textContent = offline
    ? 'Calls are closed while the connection is down. A play that has already happened cannot be called, and the app will not pretend otherwise.'
    : 'The price is what a Marble pays if the call lands, and it is here before you tap it.';
  wrap.appendChild(why);
  return wrap;
}
