/* THE LIVE GAME — the call card, wired to the real feed.
 *
 * This is the one screen that is not fed from fixtures. It polls the Worker,
 * holds what it gets behind the user's own delay, asks whatever question the
 * situation makes interesting, and settles against the play that actually
 * happened.
 *
 * 🔴 THE DELAY IS THE MECHANIC, NOT A TAX ON IT. ESPN tells you a play happened
 * AFTER it happened. Being deliberately behind the television is what turns that
 * into a real window: the app shows you the state as of 45 seconds ago, you call
 * what happens next, and on the screen in front of you the snap has not been
 * taken. Set the delay to zero and the app is a scoreboard - it can only tell you
 * what already happened.
 *
 * 🔴 THE QUESTION CHANGES. Run-or-pass asked 120 times is a mechanic, not a game.
 * The catalog decides what this moment is worth asking - a fourth down is a
 * coach's decision, a kickoff is a returner's, a third down is a matchup - and
 * the app asks that instead.
 */

import { CALL_TYPES, byId, offerFor, settle, settleDrive } from '/src/catalog.js';
import { teamChip, applyTeamVars } from '/components/team-chip.js';
import { stateBlock, STATES_CSS } from '/components/states.js';
import { signed, signClass, clock } from '/components/fmt.js';

export const id = 'live-game';
export const title = 'Live — the call';
export const bar = null;   /* No comp. Nobody ships this. */
export const states = ['live'];

const POLL_MS = 5000;
const STAKES = [5, 10, 25];
const START_BANK = 200;
const MAX_PAYOUT = 6;

/* ------------------------------------------------------------------ */

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const store = {
  get(k, d) { try { const v = localStorage.getItem('ag.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('ag.' + k, JSON.stringify(v)); } catch {} }
};

function deviceId() {
  let id = store.get('device', null);
  if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); store.set('device', id); }
  return id;
}

/* ------------------------------------------------------------------ *
 * State the screen owns
 * ------------------------------------------------------------------ */

const S = {
  key: null,
  raw: null,            // last pushed state from the Worker
  delayMs: store.get('delayMs', 45000),
  name: store.get('name', ''),
  stake: store.get('stake', 10),
  calls: store.get('calls', {}),   // afterPlayId -> { type, choice, stake, p }
  seenIntro: !!store.get('seenIntro', 0),
  bank: START_BANK,
  board: [],
  timer: null
};

/**
 * 🔴 THE HOLD. Everything the screen renders is the game as it stood `delayMs`
 * ago - not the newest play. This is one filter and it is the whole feature: a
 * play is visible only once it is older than the delay.
 */
function held(raw, delayMs, now) {
  if (!raw) return null;
  /* The feed carries no per-play wall clock, so the poller's own read time is the
   * best evidence of when a play became known. A play is released when the state
   * that first carried it is older than the delay. */
  const cutoff = now - delayMs;
  const asOf = raw.pushedAt || raw.fetchedAt || 0;
  const visible = asOf <= cutoff ? raw.plays : raw.plays.slice(0, Math.max(0, raw.plays.length - 1));
  return { ...raw, plays: visible, holding: raw.plays.length - visible.length };
}

/** What question does this moment ask? */
function questionFor(state) {
  const last = state.plays[state.plays.length - 1];
  if (!last) return null;
  const s = (last.text || '').toLowerCase();

  /* A drive starts when the possession that is about to snap is not the one that
   * snapped last - a kickoff, a punt, a turnover. That is read off the drive id
   * the feed already gives every play, never inferred from the down. */
  const prev = state.plays[state.plays.length - 2] || null;
  const isDriveStart = !prev || prev.driveId !== last.driveId || /kickoff|punt|intercept|fumble/.test(s);

  /* A drive call already running is not re-offered, and it does not block the
   * snap questions underneath it - that is the point of two timescales. */
  const openDriveCall = Object.values(S.calls).some(
    (c) => c.scope === 'drive' && c.driveId === last.driveId
  );

  return offerFor({
    down: state.situation?.down ?? null,
    distance: state.situation?.distance ?? null,
    isKickoff: /kickoff/.test(s),
    isPunt: /punt/.test(s),
    isFieldGoalAttempt: /field goal/.test(s),
    isDriveStart,
    openDriveCall
  });
}

/** Price from what this offense has done tonight, with the prior stated. */
function priceFor(type, state, offenseTeamId) {
  const rel = state.plays.filter((p) => p.offenseTeamId === offenseTeamId);
  const counts = {};

  /* 🔴 THE PRIOR IS MEASURED WHERE IT CAN BE, not one-each. A four-way question
   * with a flat prior prices every tile at 25% and 4x - a made-up number wearing
   * a decimal point, and on a drive question it says a punt and a field goal are
   * equally likely, which 69 real drives say they are not (38% against 13%).
   *
   * So the prior is the catalog's counted distribution, weighted as four snaps
   * of evidence, and the in-game counts move it from there. Where a type has no
   * measured rates it falls back to one-each, which is the honest flat prior. */
  const PRIOR_WEIGHT = 4;
  for (const c of type.choices) {
    counts[c.id] = type.rates?.[c.id] != null ? type.rates[c.id] * PRIOR_WEIGHT : 1;
  }
  let n = type.choices.reduce((a, c) => a + counts[c.id], 0);
  const priorN = n;                                    // the prior is not evidence

  if (type.id === 'run_pass') {
    for (const p of rel) if (p.kind === 'run' || p.kind === 'pass') { counts[p.kind]++; n++; }
  }
  if (type.id === 'script') {
    /* Both halves off the same play, so the tendency the model learns tonight is
     * the one the tile is actually asking about. */
    for (const p of rel) {
      if (p.kind !== 'run' && p.kind !== 'pass') continue;
      const got = /1st down|first down|touchdown/i.test(p.text || '');
      counts[`${p.kind}_${got ? 'yes' : 'no'}`]++; n++;
    }
  }
  return type.choices.map((c) => {
    const p = (counts[c.id] || 1) / n;
    return {
      choice: c,
      p: Math.round(p * 1000) / 1000,
      pays: Math.min(MAX_PAYOUT, Math.round((1 / p) * 100) / 100),
      samples: Math.max(0, Math.round(n - priorN))
    };
  });
}

/* ------------------------------------------------------------------ *
 * Settling — against the play that actually arrived
 * ------------------------------------------------------------------ */

/**
 * ONE settlement path, used for my own bank and for everybody else's row on the
 * board. Two paths would drift, and the day they drifted the board would say
 * somebody was winning while their own phone said otherwise.
 *
 * 🔴 THE PAYOUT IS DERIVED FROM p WHEN IT HAS TO BE. A call made on this device
 * carries the price it was shown; a call read back off the board carries only
 * `p`, because that is what the server was sent. Same formula either way —
 * stake / p, capped — so the two cannot disagree.
 */
function payoutOf(call) {
  if (typeof call.pays === 'number') return call.pays;
  const p = typeof call.p === 'number' && call.p > 0 ? call.p : 0.5;
  return Math.min(MAX_PAYOUT, Math.round((1 / p) * 100) / 100);
}

function settleOne(call, state) {
  const pays = payoutOf(call);

  /* 🔴 A DRIVE CALL RUNS FOR MINUTES AND LANDS ONCE. It is not settled by the
   * next snap — it is settled by the drive ending, against the result the feed
   * states. While the drive is live the call sits open underneath whatever snap
   * question is being asked on top of it, which is the whole reason the catalog
   * has two timescales. */
  if (call.scope === 'drive') {
    const drive = (state.drives || []).find((d) => d.id === call.driveId);
    if (!drive || !drive.ended) return { open: true, delta: -call.stake };
    const dp = state.plays.filter((p) => p.driveId === call.driveId);
    const r = settleDrive(call.type, call.choice, { result: drive.result, plays: dp });
    if (r.landed === null) return { void: true, because: r.because, delta: 0 };
    return { landed: r.landed, because: r.because,
             delta: r.landed ? Math.round(call.stake * pays) - call.stake : -call.stake };
  }

  const i = state.plays.findIndex((p) => p.id === call.afterPlayId);
  const next = i >= 0 ? state.plays[i + 1] : null;
  if (!next) return { open: true, delta: -call.stake };

  /* 🔴 THE LEAGUE IS PART OF THE SETTLEMENT, not decoration. A sack is a pass in
   * the NFL and a rush in college — every operator rulebook says so in the same
   * words — and a sack turns up on 16% of real drives. Passing the wrong league
   * here does not error; it quietly grades the call the other way. */
  const r = settle(call.type, call.choice, { text: next.text, typeText: next.typeText || '' },
                   { down: call.down, distance: call.distance, sport: state.sport });
  if (r.landed === null) return { void: true, because: r.because, delta: 0, play: next };
  return { landed: r.landed, because: r.because, play: next,
           delta: r.landed ? Math.round(call.stake * pays) - call.stake : -call.stake };
}

function settleAll(state) {
  let bank = START_BANK;
  const rows = [];
  for (const [afterPlayId, call] of Object.entries(S.calls)) {
    const c = { ...call, afterPlayId };
    const r = settleOne(c, state);
    if (r.open) { rows.push({ ...c, open: true }); bank -= call.stake; continue; }
    if (r.void) { rows.push({ ...c, void: true, because: r.because }); continue; }
    bank += r.delta;
    rows.push({ ...c, landed: r.landed, delta: r.delta, because: r.because, play: r.play });
  }
  S.bank = bank;
  return rows.reverse();
}

/**
 * 🔴 THE BOARD RANKS ON PROFIT. Not on how many times somebody tapped.
 *
 * It counted calls until 2026-09-08, which is an attendance sheet: "Jason · 3
 * calls" beside "Mike · 3 calls" tells two people watching the same game
 * absolutely nothing about which of them is reading it better. Settled doctrine
 * has always said the live board ranks on PROFIT — balance minus start — and the
 * screen simply did not do it. Every number it needed was already on the wire.
 *
 * 🔴 AND THE ARITHMETIC BEING LOCAL IS NOT THE THING THE DOCTRINE FORBIDS. The
 * rule is that a client must not decide its own outcome. Here every input is
 * server-held — the calls come from /api/board, the plays from /api/state — and
 * every viewer recomputes the same board from the same data. Nobody can change
 * what anybody else sees. It is one deterministic function over shared inputs,
 * which is exactly why it must be the SAME function my own bank uses.
 */
function boardRows(state) {
  const byPerson = new Map();
  for (const c of S.board) {
    const row = byPerson.get(c.deviceId)
      || { deviceId: c.deviceId, name: c.name, at: 0, profit: 0, open: 0, won: 0, lost: 0, voided: 0 };
    /* The newest name a device sent wins, so naming yourself after your first
     * call renames you on the board rather than leaving a stranger up there. */
    if (c.at > row.at && c.name) { row.name = c.name; row.at = c.at; }
    const r = settleOne(c, state);
    if (r.open) row.open++;
    else if (r.void) row.voided++;
    else { row.profit += r.delta; if (r.landed) row.won++; else row.lost++; }
    byPerson.set(c.deviceId, row);
  }
  /* Profit first. A tie breaks on who has resolved more, so somebody sitting on
   * one lucky call does not outrank somebody who has been playing all night. */
  return [...byPerson.values()].sort((a, b) => b.profit - a.profit || (b.won + b.lost) - (a.won + a.lost));
}

/* ------------------------------------------------------------------ *
 * Render
 * ------------------------------------------------------------------ */

export async function previewData() { return {}; }

export function render(root, _data, _state) {
  root.innerHTML = '';
  const style = el('style');
  style.textContent = STATES_CSS + CSS;
  root.appendChild(style);

  const wrap = el('div', 'lg');
  root.appendChild(wrap);

  S.key = new URLSearchParams(location.search).get('game') || store.get('gameKey', 'nfl:401872656');
  store.set('gameKey', S.key);

  paint(wrap);
  if (S.timer) clearInterval(S.timer);
  S.timer = setInterval(() => poll(wrap), POLL_MS);
  poll(wrap);
}

async function poll(wrap) {
  try {
    const [stateRes, boardRes] = await Promise.all([
      fetch('/api/state/' + S.key),
      fetch('/api/board/' + S.key)
    ]);
    if (stateRes.ok) S.raw = await stateRes.json();
    if (boardRes.ok) S.board = (await boardRes.json()).calls || [];
    paint(wrap);
  } catch { /* offline is a state the screen draws, not an exception */ }
}

function paint(wrap) {
  wrap.innerHTML = '';
  const now = Date.now();

  /* ---- the delay, first, because it is the thing that makes this work ---- */
  wrap.appendChild(delayBar());

  /* Under the bar it explains, and above everything else, because it changes how
   * to read the whole screen. It goes the moment they say so, or the moment they
   * make a call - somebody who has already played does not need telling. */
  if (!S.seenIntro && !Object.keys(S.calls).length) wrap.appendChild(introCard(wrap));

  if (!S.raw) {
    wrap.appendChild(stateBlock('loading', { rows: 3, body: 'Waiting for the first push from the poller…' }));
    return;
  }

  /* The staleness is read off the RAW push, never off the held copy - the delay
   * is a thing we do on purpose and must never be mistaken for a dead feed. It
   * sits under the delay bar and above the game, because it changes how to read
   * everything below it. */
  const stale = staleBar(S.raw, now);
  if (stale) wrap.appendChild(stale);

  const state = held(S.raw, S.delayMs, now);
  const age = Math.round((now - (S.raw.pushedAt || now)) / 1000);

  /* ---- the game ---- */
  const head = el('div', 'lg-head');
  const away = state.teams[state.awayTeamId], home = state.teams[state.homeTeamId];
  /* The league goes with the chip, because a team id is only unique inside one. */
  const league = (S.key || '').split(':')[0] === 'nfl' ? 'nfl' : 'college-football';
  if (away) head.appendChild(teamChip({ id: state.awayTeamId, ...away }, { size: 22, league }));
  head.appendChild(el('span', 'lg-score num', `${state.awayScore} – ${state.homeScore}`));
  if (home) head.appendChild(teamChip({ id: state.homeTeamId, ...home }, { size: 22, league }));
  const meta = el('span', 'lg-meta num');
  meta.textContent = state.status === 'pre' ? 'Not started'
    : state.situation ? `Q${state.situation.quarter} ${state.situation.clock}` : state.status;
  head.appendChild(meta);
  wrap.appendChild(head);

  if (state.status === 'pre') {
    wrap.appendChild(stateBlock('empty', {
      title: 'Kickoff has not happened',
      body: 'The poller is running and this screen will fill in on the first play. '
          + 'Set your delay now — it has to be set before the first play is ever shown.'
    }));
    return;
  }

  /* ---- the bank ---- */
  const rows = settleAll(state);
  const bank = el('div', 'card lg-bank');
  const bal = el('div', 'lg-bal num', String(S.bank));
  bank.append(bal, el('span', 'lg-unit', 'Marbles'));
  const d = el('span', 'lg-delta num ' + signClass(S.bank - START_BANK));
  d.textContent = signed(S.bank - START_BANK);
  bank.appendChild(d);
  wrap.appendChild(bank);

  /* ---- the question ---- */
  const type = questionFor(state);
  const last = state.plays[state.plays.length - 1];
  const already = last ? S.calls[last.id] : null;

  /* 🔴 A FINISHED GAME DOES NOT ASK YOU WHAT HAPPENS NEXT. Caught in a screenshot
   * on 2026-09-08: the head read Q4 0:00 with a final score above a card asking
   * "Run or pass — and do they get the first down?" over four priced tiles. There
   * is no next play. Anything staked there could never settle, and the app was
   * inviting it.
   *
   * It matters tonight rather than in theory: every game ends, so every session
   * of this app finishes on this screen. The last thing it shows should be what
   * happened, not a question it cannot answer. */
  if (state.status === 'final') {
    const done = el('div', 'card lg-done');
    done.appendChild(el('div', 'lg-done-h', 'Final'));
    done.appendChild(el('div', 'lg-done-b',
      S.bank === START_BANK
        ? 'You finished level.'
        : `You finished ${S.bank > START_BANK ? 'up' : 'down'} ${Math.abs(S.bank - START_BANK)}, on ${S.bank} Marbles.`));
    wrap.appendChild(done);
  } else if (type && last && !already) {
    const card = el('div', 'card lg-call');
    card.appendChild(el('div', 'lg-q', type.question));
    const sub = el('div', 'lg-sub', state.situation?.downDistanceText || last.text.slice(0, 70));
    card.appendChild(sub);

    const ladder = el('div', 'lg-stakes');
    for (const s of STAKES) {
      const b = el('button', 'lg-stake' + (s === S.stake ? ' is-on' : ''), String(s));
      b.onclick = () => { S.stake = s; store.set('stake', s); paint(wrap); };
      ladder.appendChild(b);
    }
    card.appendChild(ladder);

    const priced = priceFor(type, state, state.situation?.offenseTeamId || last.offenseTeamId);
    const tiles = el('div', 'lg-tiles' + (priced.length > 3 ? ' is-4' : ''));
    for (const o of priced) {
      const b = el('button', 'lg-tile');
      b.appendChild(el('span', 'lg-tile-label', o.choice.label));
      /* 🔴 THE PRICE IS ON THE TILE, BEFORE THE TAP. */
      b.appendChild(el('span', 'lg-tile-win num', '+' + (Math.round(S.stake * o.pays) - S.stake)));
      b.appendChild(el('span', 'lg-tile-x num', o.pays + '× · ' + Math.round(o.p * 100) + '%'));
      b.onclick = () => makeCall(wrap, type, o, last, state);
      tiles.appendChild(b);
    }
    card.appendChild(tiles);
    card.appendChild(el('p', 'lg-note',
      priced[0].samples < 6
        ? 'Priced off a prior — the model has barely seen this game yet'
        : `${priced[0].samples} snaps from this offense tonight`));
    wrap.appendChild(card);
  } else if (already) {
    const c = el('div', 'card lg-called');
    c.appendChild(el('div', 'lg-q', `You called ${already.label}`));
    c.appendChild(el('div', 'lg-sub', 'Waiting on the snap.'));
    wrap.appendChild(c);
  }

  /* ---- what happened ---- */
  if (rows.length) {
    const list = el('div', 'card lg-rows');
    for (const r of rows.slice(0, 8)) {
      const row = el('div', 'lg-row' + (r.open ? ' is-open' : r.void ? ' is-void' : r.landed ? ' is-up' : ' is-down'));
      row.appendChild(el('span', 'lg-row-label', r.label));
      row.appendChild(el('span', 'lg-row-why', r.open ? 'open' : r.because || ''));
      const v = el('span', 'lg-row-delta num');
      v.textContent = r.open ? '—' : r.void ? '0' : signed(r.delta);
      row.appendChild(v);
      list.appendChild(row);
    }
    wrap.appendChild(list);
  }

  /* ---- who are you? asked AFTER the first call, never before ---- */
  if (!S.name && Object.keys(S.calls).length) wrap.appendChild(nameCard(wrap));

  /* ---- the board: everybody on this game, ranked on what they have made ---- */
  const board = boardRows(state);
  if (board.length) {
    const me = deviceId();
    const b = el('div', 'card lg-board');
    b.appendChild(el('div', 'lg-board-h', board.length === 1 ? 'On this game' : 'On this game · by profit'));
    board.forEach((p, i) => {
      const row = el('div', 'lg-brow' + (p.deviceId === me ? ' is-me' : ''));
      row.appendChild(el('span', 'lg-brank num', String(i + 1)));
      row.appendChild(el('span', 'lg-bname', p.name + (p.deviceId === me ? ' · you' : '')));
      /* The record is the context the profit needs. A +40 off one call and a +40
       * off eleven are not the same person, and the board should say so. */
      const rec = [];
      if (p.won || p.lost) rec.push(`${p.won}-${p.lost}`);
      if (p.open) rec.push(`${p.open} open`);
      if (p.voided) rec.push(`${p.voided} void`);
      row.appendChild(el('span', 'lg-brec num', rec.join(' · ')));
      const v = el('span', 'lg-bprofit num ' + signClass(p.profit));
      v.textContent = signed(p.profit);
      row.appendChild(v);
      b.appendChild(row);
    });
    wrap.appendChild(b);
  }

  wrap.appendChild(el('p', 'lg-foot',
    `feed ${age}s old · holding ${state.holding} play${state.holding === 1 ? '' : 's'} behind your ${S.delayMs / 1000}s delay`));
}

/**
 * 🔴 NOTHING STANDS BETWEEN A STRANGER AND THEIR FIRST CALL.
 *
 * This used to open `prompt()` — a browser dialog, as the very first thing
 * somebody handed the link would ever see, and one that several mobile browsers
 * suppress outright. When it is suppressed the function returns early and the
 * TAP DOES NOTHING, silently, forever. Your friend would have concluded the app
 * was broken and they would have been right.
 *
 * Settled doctrine already had the answer and it was not being followed: a
 * display name is the most that may be asked, AND IT COMES AFTER THE FIRST PICK.
 * So the call lands first, unnamed, and the name is asked for afterwards — in
 * the page, as a real field, and skippable.
 */
async function makeCall(wrap, type, offer, afterPlay, state) {
  S.calls[afterPlay.id] = {
    type: type.id, choice: offer.choice.id, label: offer.choice.label,
    stake: S.stake, pays: offer.pays, p: offer.p,
    /* A drive call is settled by the drive it belongs to, not by the next snap,
     * so both travel with it. */
    scope: type.scope, driveId: afterPlay.driveId,
    down: state.situation?.down ?? null, distance: state.situation?.distance ?? null
  };
  store.set('calls', S.calls);
  paint(wrap);
  try {
    await fetch('/api/call', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        key: S.key, deviceId: deviceId(), name: S.name,
        afterPlayId: afterPlay.id, type: type.id, choice: offer.choice.id,
        stake: S.stake, p: offer.p
      })
    });
  } catch { /* the call is already local; the board catches up */ }
}

/**
 * 🔴 A FROZEN FEED MUST LOOK FROZEN. This is the second half of the poller fix
 * and it is the half that reaches the phone.
 *
 * On 2026-09-08 the poller died after 36 minutes with no error. The Worker kept
 * serving the last state it had been pushed, so this screen went on rendering a
 * game head, a score, a board and a delay bar that said BEHIND ON PURPOSE — a
 * completely healthy-looking page in front of a game that had stopped existing.
 * Nobody watching could have told.
 *
 * A blank screen sends somebody to find out why; a stale one does not. So the
 * staleness is drawn, in the app, above everything else.
 *
 * THE THRESHOLD IS DERIVED, NEVER GUESSED. Live, the poller pushes every 10s, so
 * anything past ~45s is three missed pushes and not a slow network. Before
 * kickoff it deliberately pushes every five minutes — see the backoff in
 * poll.mjs — so the same 45s rule there would cry wolf all evening. The bar
 * knows which regime it is in because the state says so.
 */
export function staleness(state, now) {
  const at = state?.pushedAt || state?.fetchedAt || 0;
  if (!at) return null;
  const age = Math.max(0, now - at);
  /* Pre-kickoff the poller is on a five-minute cycle on purpose. Twelve minutes
   * is two missed slow pushes, which is a real fault rather than the backoff. */
  const limit = state.status === 'pre' ? 12 * 60 * 1000 : 45 * 1000;
  return age > limit ? { age, limit } : null;
}

function staleBar(state, now) {
  const s = staleness(state, now);
  if (!s) return null;
  const secs = Math.round(s.age / 1000);
  const ago = secs < 90 ? `${secs}s` : `${Math.round(secs / 60)} min`;
  const bar = el('div', 'lg-stale');
  bar.appendChild(el('span', 'lg-stale-l', 'THE FEED HAS STOPPED'));
  bar.appendChild(el('span', 'lg-stale-b',
    `Nothing new for ${ago}. What is below is the last thing we were told, not the game.`));
  return bar;
}

/**
 * The name field. A real input in the page — not a browser dialog — because a
 * dialog is suppressible, unstyleable, and arrives before the person has any
 * reason to answer it.
 *
 * It appears only once a call has actually been made, which is the moment the
 * question earns itself: there is now a row on the board that says "Someone",
 * and naming it is obviously worth doing. Skipping is a real option and leaves
 * them as Someone, which is a perfectly good way to play.
 */
function nameCard(wrap) {
  const c = el('div', 'card lg-name');
  c.appendChild(el('div', 'lg-name-h', "You're on the board as Someone"));
  c.appendChild(el('div', 'lg-name-b', 'Put a name to it so the others know who they are up against.'));

  const rowEl = el('div', 'lg-name-row');
  const input = el('input', 'lg-name-i');
  input.type = 'text';
  input.maxLength = 24;
  input.placeholder = 'Your name';
  /* No autofocus: it would throw the keyboard up over the call card mid-drive,
   * which is the opposite of what somebody watching a game wants. */
  input.autocomplete = 'nickname';

  const save = el('button', 'lg-name-go', 'Save');
  const commit = () => {
    const v = input.value.trim().slice(0, 24);
    if (!v) return;
    S.name = v;
    store.set('name', v);
    claimCalls();          // rename the rows already on the board
    paint(wrap);
  };
  save.onclick = commit;
  input.onkeydown = (e) => { if (e.key === 'Enter') commit(); };

  const skip = el('button', 'lg-name-skip', 'Stay anonymous');
  skip.onclick = () => { S.name = 'Someone'; store.set('name', 'Someone'); paint(wrap); };

  rowEl.append(input, save);
  c.append(rowEl, skip);
  return c;
}

/**
 * 🔴 A NAME ARRIVING LATE HAS TO REACH THE CALLS ALREADY MADE, or the person who
 * just named themselves still shows up as a stranger beside their own results.
 *
 * Re-posting a call the server already has is safe by construction: the key is
 * game + device + the play it was made after, so the choice, the stake and the
 * price cannot be changed by this. Only the name can. That is the whole reason
 * one-call-per-snap was enforced by the KEY rather than by a check.
 */
function claimCalls() {
  for (const [afterPlayId, call] of Object.entries(S.calls)) {
    fetch('/api/call', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        key: S.key, deviceId: deviceId(), name: S.name,
        afterPlayId, type: call.type, choice: call.choice, stake: call.stake, p: call.p
      })
    }).catch(() => { /* the next call carries the name anyway */ });
  }
}

/**
 * 🔴 THE COLD OPEN. What somebody sees when they have never been here before.
 *
 * Everything about this app hangs off ONE counter-intuitive fact and nothing on
 * screen said it: THE DELAY IS THE GAME. A stranger handed the link finds a
 * slider labelled "BEHIND ON PURPOSE · 45s" sitting above a football game, and
 * the obvious move — the move anybody makes with a slider marked delay — is to
 * drag it to zero and be live. That single tap turns the whole thing into a
 * scoreboard that can only report what already happened, and they would conclude
 * the app is pointless. They would be right about what they were holding.
 *
 * So it is explained once, before the first call, in the words the mechanic
 * actually works in — and it is dismissible, because an explanation that keeps
 * arriving is an obstacle. Jason, on a different panel: "i dont need this every
 * fucking time either."
 */
function introCard(wrap) {
  const c = el('div', 'card lg-intro');
  c.appendChild(el('div', 'lg-intro-h', 'You are 45 seconds behind, and that is the point'));
  c.appendChild(el('p', 'lg-intro-b',
    'The feed only tells us a play happened after it happened. So the app shows you the game '
    + 'as it stood 45 seconds ago — which means when it asks what happens next, on your '
    + 'television the snap genuinely has not been taken yet. That gap is the whole game.'));
  c.appendChild(el('p', 'lg-intro-b',
    'Slide it to zero and there is no gap left to call into. It becomes a scoreboard.'));
  const go = el('button', 'lg-intro-go', 'Got it');
  go.onclick = () => { store.set('seenIntro', 1); S.seenIntro = true; paint(wrap); };
  c.appendChild(go);
  return c;
}

function delayBar() {
  const bar = el('div', 'lg-delay');
  const text = () => (S.delayMs === 0 ? 'LIVE — no delay' : `BEHIND ON PURPOSE · ${S.delayMs / 1000}s`);
  const label = el('span', 'lg-delay-l', text());
  if (S.delayMs === 0) label.classList.add('is-live');
  const input = el('input');
  input.type = 'range'; input.min = '0'; input.max = '90'; input.step = '5';
  input.value = String(S.delayMs / 1000);
  input.setAttribute('aria-label', 'How far behind the television you are, in seconds');

  /* 🔴 ZERO IS ALLOWED AND IS NAMED. The slider is user-set and always on -
   * settled doctrine, and it is not this screen's job to prevent a choice. It IS
   * this screen's job to say what the choice costs, at the moment it is made,
   * rather than letting somebody discover it by finding every question
   * unanswerable. */
  const warn = el('p', 'lg-delay-warn', 'No gap left to call into — this is a scoreboard now.');
  warn.hidden = S.delayMs !== 0;

  input.oninput = () => {
    S.delayMs = Number(input.value) * 1000;
    store.set('delayMs', S.delayMs);
    label.textContent = text();
    label.classList.toggle('is-live', S.delayMs === 0);
    warn.hidden = S.delayMs !== 0;
  };
  bar.append(label, input, warn);
  return bar;
}

const CSS = `
.lg { display: grid; gap: 10px; }
.lg-delay { display: grid; gap: 4px; padding: 8px 10px; border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--card); }
.lg-delay-l { font-size: var(--t-micro); font-weight: 700; letter-spacing: .04em; color: var(--accent); }
/* The stale bar reads as a fault, not as a status line. It borrows --down rather
   than team color, which is the same rule the result components follow. */
.lg-stale { display: grid; gap: 3px; padding: 10px; border-radius: var(--radius-card);
  border: 1px solid var(--down); background: color-mix(in srgb, var(--down) 10%, var(--card)); }
.lg-stale-l { font-size: var(--t-micro); font-weight: 800; letter-spacing: .06em; color: var(--down); }
.lg-stale-b { font-size: var(--t-micro); color: var(--ink); }
.lg-delay-warn { font-size: var(--t-micro); color: var(--down); font-weight: 700; margin: 2px 0 0; }
.lg-intro { display: grid; gap: 8px; padding: 14px 12px; }
.lg-intro-h { font-size: var(--t-emph); font-weight: 800; line-height: 1.25; }
.lg-intro-b { font-size: var(--t-micro); color: var(--dim); margin: 0; line-height: 1.5; }
.lg-intro-go { justify-self: start; font: inherit; font-weight: 800; margin-top: 2px;
  min-height: var(--tap-min); padding: 0 20px; border: 0;
  border-radius: var(--radius-card); background: var(--accent); color: var(--bg); }
.lg-done { display: grid; gap: 4px; padding: 14px 12px; }
.lg-done-h { font-size: var(--t-micro); font-weight: 800; letter-spacing: .06em; color: var(--dim); }
.lg-done-b { font-size: var(--t-emph); font-weight: 800; }
.lg-name { display: grid; gap: 6px; padding: 12px; }
.lg-name-h { font-weight: 800; font-size: var(--t-emph); }
.lg-name-b { font-size: var(--t-micro); color: var(--dim); }
.lg-name-row { display: grid; grid-template-columns: 1fr auto; gap: 8px; margin-top: 2px; }
.lg-name-i { font: inherit; font-size: var(--t-body); padding: 10px; border: 1px solid var(--line);
  border-radius: var(--radius-card); background: var(--bg); color: var(--ink); min-width: 0; }
.lg-name-go { font: inherit; font-weight: 800; padding: 10px 16px; border: 0;
  border-radius: var(--radius-card); background: var(--accent); color: var(--bg); }
.lg-name-skip { font: inherit; font-size: var(--t-micro); color: var(--dim);
  background: none; border: 0; padding: 4px 0 0; text-align: left; text-decoration: underline; }
/* The board is a ranking now, so it is laid out as one: rank, name, record, profit. */
.lg-brow { display: grid; grid-template-columns: 20px 1fr auto auto; gap: 10px; align-items: baseline;
  padding: 9px 0; border-top: 1px solid var(--line); }
.lg-brow:first-of-type { border-top: 0; }
.lg-brow.is-me { font-weight: 800; }
.lg-brank { color: var(--dim); font-size: var(--t-micro); }
.lg-bname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lg-brec { color: var(--dim); font-size: var(--t-micro); }
.lg-bprofit { font-weight: 800; }
.lg-delay-l.is-live { color: var(--down); }
.lg-delay input { width: 100%; accent-color: var(--accent); }
.lg-head { display: flex; align-items: center; gap: 8px; }
.lg-score { font-size: var(--t-score); font-weight: 800; }
.lg-meta { margin-left: auto; font-size: var(--t-micro); color: var(--dim); }
.lg-bank { display: flex; align-items: baseline; gap: 6px; padding: 10px 12px; }
.lg-bal { font-size: var(--t-bank); font-weight: 800; }
.lg-unit { font-size: var(--t-micro); color: var(--dim); }
.lg-delta { margin-left: auto; font-size: var(--t-figure); font-weight: 700; }
.lg-call, .lg-called { padding: 12px; }
.lg-q { font-size: var(--t-emph); font-weight: 800; }
.lg-sub { font-size: var(--t-micro); color: var(--dim); margin-top: 2px; }
.lg-stakes { display: flex; gap: 6px; margin: 10px 0; }
.lg-stake { min-width: 56px; min-height: var(--tap-min); font-weight: 700; }
.lg-stake.is-on { border-color: var(--accent); color: var(--accent); }
/* 🔴 FOUR TILES DO NOT FIT ACROSS A PHONE. Column auto-flow was fine while every
   question was a coin flip and silently crushes a four-way one: at 375px the
   four columns measured 108 / 77 / 77 / 89, sized to their own text, so the
   tiles are uneven AND too narrow. Requirement 7.5 exactly - a layout bug no
   test can see. Two and three go across; four goes two-by-two.
   And no backticks in this block: it lives inside a template literal, and one
   of them ended the string and took the whole screen down. */
.lg-tiles { display: grid; grid-auto-flow: column; gap: 8px; }
.lg-tiles.is-4 { grid-auto-flow: row; grid-template-columns: 1fr 1fr; }
.lg-tile { display: grid; gap: 2px; padding: 10px; min-height: 76px; text-align: left; }
.lg-tile-label { font-weight: 800; font-size: var(--t-emph); }
.lg-tile-win { font-size: var(--t-figure); font-weight: 800; }
.lg-tile-x { font-size: var(--t-micro); color: var(--dim); }
.lg-note { font-size: var(--t-micro); color: var(--dim); margin: 8px 0 0; }
.lg-rows, .lg-board { padding: 4px 12px; }
.lg-board-h { font-size: var(--t-micro); color: var(--dim); padding: 8px 0 2px; letter-spacing: .04em; }
.lg-row { display: flex; align-items: center; gap: 8px; min-height: 38px; border-bottom: 1px solid var(--line); }
.lg-row:last-child { border-bottom: 0; }
.lg-row-label { font-weight: 700; font-size: var(--t-body); }
.lg-row-why { font-size: var(--t-micro); color: var(--dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lg-row-delta { margin-left: auto; font-weight: 700; }
.lg-row.is-up .lg-row-delta { color: var(--up); }
.lg-row.is-down .lg-row-delta { color: var(--down); }
.lg-row.is-void .lg-row-delta, .lg-row.is-open .lg-row-delta { color: var(--dim); }
.lg-foot { font-size: var(--t-micro); color: var(--dim); margin: 4px 2px 0; }
`;
