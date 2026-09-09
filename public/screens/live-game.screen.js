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

import { CALL_TYPES, byId, offerFor, settle, settleDrive, movedChains } from '/src/catalog.js';
/* 🔴 THE COMMENTARY COMES OUT OF detect.ts, which already existed and was never
 * shown. Jason, 2026-09-08: "Are we giving color commentary during the game? As
 * cards as well?" We were not, and every piece of it was already built:
 * detect() ranks each play by severity, names the event, writes a headline and a
 * detail, and carries a per-play STAR with a ROLE — carrier, passer, receiver,
 * kicker — which is requirement 7.2 done properly rather than a view guessing at
 * the name in the parentheses.
 *
 * Nothing here writes commentary. It renders what the detector already said. */
import { detect } from '/src/lib/detect.js';
/* 🔴 A REAL IMAGE FILE, not an unfurled card. The og:image can say which game is
 * on; it can never say what YOU just called, because it is one picture per URL
 * cached hard by the crawler. Web Share Level 2 attaches an actual PNG. */
import { shareResult, shareReaction, MOMENTS } from '/components/sharecard.js';
import { teamChip, applyTeamVars } from '/components/team-chip.js';
import { stateBlock, STATES_CSS } from '/components/states.js';
import { adSlot } from '/components/ad.js';
import { signed, signClass, clock } from '/components/fmt.js';

export const id = 'live-game';
export const title = 'Live — the call';
export const bar = null;   /* No comp. Nobody ships this. */
export const states = ['live'];

const POLL_MS = 5000;
const STAKES = [5, 10, 25];
const START_BANK = 200;
const MAX_PAYOUT = 6;

/* 🔴 ONE GAME PER SPORT, NAMED, and this is a rig rather than a schedule. The
 * poller pushes one game at a time and the key it writes is `<sport>:<espnId>`;
 * a slate that lets you pick any game needs the pool routes and a poller per
 * game, which is the build after this one. Tonight there is one NFL game on the
 * wire, which is the one being tested — and a college key that nothing is
 * pushing to is honest: the screen says nobody is polling it. */
/* 🔴 THE GAME IS LOOKED UP, NOT WRITTEN DOWN. Jason, 2026-09-09: "All the card
 * info is still stale and not the upcoming info."
 *
 * The table below is a pair of constants, and a constant is stale the moment its
 * game kicks off. It was right on the day it was typed and it is wrong for every
 * day after: on Thursday morning the NFL card would still be pointing at
 * Wednesday's opener, showing a finished game as "what's on", with a countdown
 * that had run out.
 *
 * The slate already knows. `slate:<sport>:<season>:<week>` is captured from the
 * feed and carries every game with its real kickoff and its real status, so the
 * next game is a query over data we already hold rather than a fact somebody has
 * to remember to edit.
 *
 * 🔴 NOT-FINAL, ORDERED BY KICKOFF — never "the first scheduled one". A game
 * that is IN PROGRESS is the one you want to be watching, and filtering to
 * `scheduled` would skip past a live game to advertise tomorrow's.
 *
 * The constants stay as the fallback, because a network failure must not leave
 * the home card with nothing to point at. */
const SLATE_WEEK = { nfl: 1, 'college-football': 2 };

async function nextGameKey(sport) {
  try {
    const wk = SLATE_WEEK[sport] || 1;
    const res = await fetch('/api/state/slate:' + sport + ':2026:' + wk);
    if (!res.ok) return null;
    const d = await res.json();
    const up = (d.games || [])
      .filter((g) => g && g.id && g.status !== 'final')
      .sort((a, b) => a.kickoffUtc - b.kickoffUtc);
    return up.length ? sport + ':' + up[0].id : null;
  } catch { return null; }
}

const GAME_FOR = {
  /* NE @ SEA, Wed 9 Sep 5:20pm Pacific - the 2026 NFL opener. */
  'nfl': 'nfl:401872656',
  /* 🔴 A REAL COLLEGE GAME, and it answers "why can't college be ready at the
   * same time" - it CAN. College shares every line of this file: the same
   * catalog, the same settlers, the same board. It was not live for one reason
   * and it was not a code reason - nothing was polling a college game, and the
   * id here was a placeholder.
   *
   * MIA @ FAMU, Thu 10 Sep 5:00pm Pacific. The day after the NFL opener, which
   * is simply when the next college game is. */
  'college-football': 'college-football:401858213'
};

const SPORT_LABEL = { 'nfl': 'NFL', 'college-football': 'College' };

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
  noGame: false,
  delayOpen: false,
  /* 🔴 NO DEFAULT. Jason, 2026-09-08: "the initial decision needs to pick between
   * NFL and NCAA football." Defaulting to either one answers the question on the
   * user's behalf and then hides it — and the two sports are not interchangeable
   * here: the tendency model is 697,997 COLLEGE plays and the sack rule is
   * graded the opposite way by league. Guessing wrong grades calls wrong.
   * `null` means the choice has not been made, and the screen asks. */
  sport: store.get('sport', null),
  /* 'call' = the live layer, 'pool' = the weekly picks. Null until asked. */
  /* 🔴 MIGRATED, NOT READ RAW. The first card has been re-cut twice today and
   * every phone that opened the app in between is holding a value this build no
   * longer understands — 'call' and 'week' were the old three-way's ids.
   *
   * Left alone they are the worst possible state: truthy, so the mode gate is
   * satisfied and the first card never draws, and unequal to 'marbles', so the
   * speed row never draws either. Somebody who chose "Call the game" an hour ago
   * would land on a hub with a question missing and no way to reach it.
   *
   * Both old marble ids fold into 'marbles'; anything else is dropped to null so
   * the card asks again, which is the honest outcome for a value we cannot
   * interpret. */
  mode: (() => {
    const v = store.get('mode', null);
    if (v === 'call' || v === 'week' || v === 'marbles') return 'marbles';
    return v === 'pool' ? 'pool' : null;
  })(),
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
    /* The red zone asks its own question, and the router cannot know it without
     * this. */
    yardsToGoal: state.situation?.yardsToGoal ?? null,
    /* 🔴 THE SEED. The question rotates so a snap is not the same bet 120 times a
     * night, and it rotates DETERMINISTICALLY on the play everybody is calling
     * after — so two people watching one game are answering the same thing and
     * the board compares like with like. Forget this and the rotation still
     * "works", silently, per device. */
    afterPlayId: last.id,
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
  /* 🔴 THE PRIOR IS PER SPORT. `rates` was measured on three college games and
   * `ratesNfl` on eight real NFL ones, and they are genuinely different football:
   * the NFL passes 60% of snaps against college's 51%, and runs middle on 19% of
   * plays against college's 38%. Feeding one sport's numbers to the other is the
   * same class of error as grading a sack by the wrong league's rule. */
  const table = (state.sport === 'nfl' && type.ratesNfl) ? type.ratesNfl : type.rates;
  for (const c of type.choices) {
    counts[c.id] = table?.[c.id] != null ? table[c.id] * PRIOR_WEIGHT : 1;
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
      /* The SAME rule the settler uses. A regex here and a down there is how the
       * price and the payout come to disagree about the same play. */
      const got = movedChains(p, { distance: p.distance }).got;
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
  /* 🔴 THE WHOLE PLAY, not two fields of it. `startDown`/`endDown`/`endTeamId`
   * are how a first down is read in the NFL, where the sentence never says so —
   * passing only text and typeText silently reverted that fix to the college
   * grammar. */
  const r = settle(call.type, call.choice, next,
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
  /* 🔴 THE GAME'S RESULT, WRITTEN WHERE ANOTHER SCREEN CAN READ IT. Jason,
   * 2026-09-09: "On my picks, if I bet inside that game shown, the outcome will
   * be shown as well."
   *
   * It did not, and the reason is structural rather than an oversight: a live
   * call is settled HERE, on this screen, against plays this screen is holding.
   * Nothing else in the app can reproduce that - My picks would have to fetch
   * every game's whole play list and re-run the settler to learn that you got
   * three of five right on Wednesday.
   *
   * So the screen that already knows writes down what it knows. A per-game
   * summary, keyed by the game, updated on every settle: how many landed, how
   * many missed, how many voided, and the profit. Small, and it is the only
   * thing another screen actually needs.
   *
   * 🔴 A SUMMARY, NOT A LEDGER. It records what happened in a game you played;
   * it is not a balance and nothing spends from it. The bank still resets every
   * game, and these numbers never sum with the pool's points. */
  saveCallSummary(rows);
  return rows.reverse();
}

/** Per-game, per-device. Read by My picks; never read back by this screen. */
function saveCallSummary(rows) {
  if (!S.key || !rows.length) return;
  try {
    const all = JSON.parse(localStorage.getItem('ag.callsum') || '{}');
    let won = 0, lost = 0, voided = 0, open = 0, profit = 0;
    for (const r of rows) {
      if (r.open) { open++; continue; }
      if (r.void) { voided++; continue; }
      if (r.landed) won++; else lost++;
      profit += (r.delta || 0);
    }
    all[S.key] = { won, lost, voided, open, profit, at: Date.now() };
    localStorage.setItem('ag.callsum', JSON.stringify(all));
  } catch { /* a private window is allowed to forget */ }
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
  return [...byPerson.values()].sort(BOARD_ORDER);
}

/* ------------------------------------------------------------------ *
 * Render
 * ------------------------------------------------------------------ */

export async function previewData() { return {}; }

export function render(root, _data, screenState) {
  root.innerHTML = '';
  const style = el('style');
  style.textContent = STATES_CSS + CSS;
  root.appendChild(style);

  const wrap = el('div', 'lg');
  root.appendChild(wrap);

  /* An explicit ?game= always wins - that is how a specific game is shared and
   * how the fixtures are replayed. Otherwise the key follows the chosen sport. */
  const forced = new URLSearchParams(location.search).get('game');
  S.isHome = screenState === 'home';
  S.key = forced || (S.sport ? GAME_FOR[S.sport] : null);
  /* Recorded on the state, not just held in this closure: the 5-minute
   * re-check runs long after mount() has returned and has to know that this
   * session came in on an invite link naming its own game. Reading an
   * undefined S.forced there would silently retarget somebody's invite to
   * whatever is next on the slate. */
  S.forced = !!forced;
  /* Reset on arrival, so Home is a door and not a wizard somebody is stuck in. */
  S.homeStep = 'mode';
  if (forced) { S.sport = forced.split(':')[0] === 'nfl' ? 'nfl' : 'college-football'; }

  paint(wrap);
  if (S.timer) clearInterval(S.timer);
  S.timer = setInterval(() => poll(wrap), POLL_MS);
  poll(wrap);

  /* The constant gets the first paint out immediately; the lookup corrects it a
   * moment later. Doing it the other way round would hold a blank screen behind
   * a network round trip on every load, to fix a card that is only wrong once a
   * week. An invite link is never overridden — it names its own game. */
  if (!forced && S.sport) {
    refreshKey(wrap, S.sport);
    /* Re-checked on a slow cycle so a card left open through a kickoff moves on
     * to the next game by itself rather than counting down past zero. */
    if (S.keyTimer) clearInterval(S.keyTimer);
    S.keyTimer = setInterval(() => { if (!S.forced && S.sport) refreshKey(wrap, S.sport); }, 300000);
  }
}

/* 🔴 THE BOARD COMPARATOR, NAMED. Profit first, highest at the top; a tie breaks
 * on how much has been RESOLVED, so somebody sitting on one lucky open call does
 * not outrank somebody who has settled four.
 *
 * It is a named constant rather than an inline arrow because the test that owns
 * this rule cannot import a screen — a screen needs a DOM — so it lifts the
 * comparator out of the source and runs it. Its matcher took "the first .sort in
 * the file", and on 2026-09-09 a slate lookup added an earlier one: the test
 * quietly began asserting the ranking doctrine against a kickoff-time sort, and
 * failed. It had warned about exactly this in its own comment.
 *
 * A rule that a test finds by POSITION is a rule that moves when unrelated code
 * moves. Naming it is the fix; the test now matches the name. */
const BOARD_ORDER = (a, b) => b.profit - a.profit || (b.won + b.lost) - (a.won + a.lost);

/* What Home actually shows: which game, its status, the score, and the countdown
 * rounded to the minute it displays. Anything not in here cannot change a pixel
 * on that screen, and anything in here forces a redraw. */
function homeSignature() {
  const r = S.raw;
  if (!r) return 'none:' + String(S.key) + ':' + String(S.noGame);
  const mins = r.kickoffUtc ? Math.floor((r.kickoffUtc - Date.now()) / 60000) : 0;
  return [S.key, r.status, r.awayScore, r.homeScore, mins,
          r.situation && r.situation.clock, S.mode, S.sport].join('|');
}

async function refreshKey(wrap, sport) {
  const k = await nextGameKey(sport);
  /* Guard the sport as well as the value: the lookup is async and somebody can
   * switch leagues while it is in flight, which would point the NFL card at a
   * college game with no error anywhere. */
  if (!k || k === S.key || sport !== S.sport) return;
  S.key = k; S.raw = null; S.board = []; S.noGame = false;
  paint(wrap); poll(wrap);
}

async function poll(wrap) {
  try {
    const [stateRes, boardRes] = await Promise.all([
      fetch('/api/state/' + S.key),
      fetch('/api/board/' + S.key)
    ]);
    if (stateRes.ok) { S.raw = await stateRes.json(); S.noGame = false; }
    /* 🔴 404 IS AN ANSWER, NOT A SILENCE. The Worker says "nothing pushed for
     * that game yet" and this used to ignore it and keep drawing a skeleton, so
     * a sport nobody is polling looked identical to a sport that was one second
     * from loading — forever. */
    else if (stateRes.status === 404) S.noGame = true;
    if (boardRes.ok) S.board = (await boardRes.json()).calls || [];

    /* 🔴 A REPAINT THAT CHANGES NOTHING IS THE BLINK. Jason, twice: "The logos
     * blink." / "Logos still blink."
     *
     * The first fix - dropping loading="lazy" and holding decoded bitmaps in a
     * module cache - treated the symptom and left the cause standing: paint()
     * does `wrap.innerHTML = ''` and rebuilds every node every 5 seconds. Fresh
     * <img> elements enter the document each cycle, and even a warm cache cannot
     * make that free. It got quieter and it did not stop.
     *
     * So the screen only repaints when something a viewer could SEE has changed.
     * The signature is deliberately coarse - the countdown is at minute
     * resolution, because "Kicks in 17h 15m" is identical for sixty seconds and
     * repainting it twelve times inside that minute buys nothing.
     *
     * 🔴 Home only. The live board has a running clock, a play feed and a stale
     * indicator that all want the tick, and this must never be the reason a
     * called snap is late on screen. */
    if (S.isHome) {
      const sig = homeSignature();
      if (sig === S.lastSig) return;
      S.lastSig = sig;
    }
    paint(wrap);
  } catch { /* offline is a state the screen draws, not an exception */ }
}

function paint(wrap) {
  wrap.innerHTML = '';
  const now = Date.now();

  /* ---- the delay, first, because it is the thing that makes this work ----
   *
   * 🔴 EXCEPT ON HOME. Jason, 2026-09-09: "why the 45 seconds again?"
   *
   * Because it was drawn unconditionally at the top of every paint, including a
   * landing page where there is no live feed, nothing being held back and
   * nothing to be behind. "45s BEHIND ON PURPOSE" above a menu is a boast about
   * a mechanic the person has not reached yet, and it reads as an error - behind
   * WHAT? The delay is the most important idea in this product and putting it
   * where it cannot be true is the fastest way to make it look like noise.
   *
   * It belongs on the game, where it is a live fact about what you are seeing. */
  if (!S.isHome) wrap.appendChild(delayBar());

  /* 🔴 HOME IS DECIDED FIRST, BEFORE ANY GAME STATE IS CONSULTED. It used to sit
   * below the loading guard, the no-game branch and the two choice gates, so on
   * a cold Home with no sport chosen the poll 404'd, S.noGame went true, and the
   * front door rendered "No game game is being polled" - an error about a game
   * nobody had asked for yet.
   *
   * Home does not read the feed at all. It asks two questions and leaves, so
   * every guard below this line is about a screen it is not. */
  if (S.isHome) { homeScreen(wrap); return; }

  /* 🔴 THE SPORT IS ASKED BEFORE ANYTHING ELSE IS SHOWN, and nothing below it
   * renders until it is answered. Not a default with a switch buried in
   * settings: the two sports grade a sack the opposite way and the tendency
   * model is college-only, so a wrong guess does not look wrong — it just
   * settles calls the other way. */
  /* 🔴 MODE FIRST, THEN SPORT. Jason worked through both orders in one minute —
   * "ncaa football then pools or betting?" and then "Or pools vs betting then the
   * sports" — and the second is right.
   *
   * WHAT ARE YOU HERE FOR is the bigger fork and the more human question. It
   * decides which app you are in: two different rhythms, a week against a snap,
   * and two boards that settled doctrine says NEVER SUM. Sport is the narrower
   * question underneath it, and it means something different on each side — for
   * the pool it picks a slate, for calling it decides how a sack SETTLES.
   *
   * Asking sport first made somebody answer a rules question before they knew
   * which rules they were choosing.
   *
   * 🔴 BOTH ARE SKIPPED ENTIRELY FOR AN INVITE. Doctrine: nothing sits in front
   * of the slate, and an invite link opens the actual slate. A friend's link has
   * already answered both by existing.
   *
   * AND THE WORD IS NOT "BETTING". The balance is Marbles, it cannot be bought,
   * there is no cash-out — calling it betting hands over the first objection
   * anybody raises, for free, in our own UI. You call the game. */
  /* 🔴 HOME IS A HOME SCREEN, NOT A DOOR THAT LOCKS BEHIND YOU. Jason said it
   * twice — "Home should start here", then "Home still goes here" over the
   * pre-game screen. The fork was a one-time gate: answered once, stored, never
   * seen again, so Home dropped you straight into the game with no way to see
   * the other half of the app existed.
   *
   * It shows every time now, and it does NOT block — the game renders underneath
   * it. That is the difference between a hub and a wall: you always know both
   * things are there, and you never have to answer anything to get to the one
   * you came for.
   *
   * An invite link is exempt. `?game=` means somebody sent you a specific game
   * and the choice is already made, which is doctrine: nothing sits in front of
   * a link a friend sent. */
  const invited = !!new URLSearchParams(location.search).get('game');
  /* 🔴 HOME OWNS THESE TWO QUESTIONS NOW, so these gates must not answer them
   * first. They ran before the isHome branch below and returned the bare card,
   * which meant homeScreen's own version - the one that also shows the marbles
   * explainer under the league question - could never execute. The gates stay
   * for every OTHER route, where landing on a game with no sport chosen still
   * has to ask rather than guess. */
  if (!S.isHome && !S.mode) { wrap.appendChild(modeCard(wrap)); return; }
  if (!S.isHome && !S.sport) { wrap.appendChild(sportCard(wrap)); return; }

  /* 🔴 HOME IS A DESTINATION, AND IT STOPS HERE. Jason said "Home should start
   * here" three times and each time I put the hub ON TOP of the game — which is
   * still the game, with a card above it. A landing you scroll straight through
   * is not a landing.
   *
   * Home shows the two halves, the sport, what is on and when, and how to bring
   * somebody. Calling the game is a TAP AWAY rather than the thing underneath. */
  /* 🔴 NO HUB STRIP ON THE GAME. It was here to let somebody switch mode or
   * league without leaving, and that was a reasonable answer while Home was a
   * summary. Home is now the front door and is one tap away in the nav, so this
   * strip is the same two questions asked a second time, on top of the game
   * they were asked in order to reach. Deleted rather than hidden: a control
   * that duplicates the door is how the page stopped having a subject. */

  /* 🔴 THE WAY OUT GOES ABOVE EVERY EARLY RETURN. It was appended near the
   * FOOTER, which paint() never reaches on a pre-kickoff game — it returns after
   * the empty state. So a phone with College stored sat on "Kickoff has not
   * happened" for a game the owner did not want, with no visible way to change
   * it: the same dead end as before, moved four inches down the file.
   *
   * Anything whose job is to get somebody UNSTUCK cannot live after a return
   * that only fires when they are stuck. */
  /* 🔴 THE ORPHAN CHIP IS GONE. Jason: "NFL change button?" It sat directly under
   * a card that already asks what you are doing, doing the same job in a
   * different shape — two controls, two visual languages, one question. The
   * sport now lives INSIDE the hub as a second row, so the card answers both
   * halves of "where am I" in one place. */

  /* Under the bar it explains, and above everything else, because it changes how
   * to read the whole screen. It goes the moment they say so, or the moment they
   * make a call - somebody who has already played does not need telling. */
  if (!S.seenIntro && !Object.keys(S.calls).length) wrap.appendChild(introCard(wrap));

  if (!S.raw) {
    /* 🔴 A DEAD END WITH NO DOOR IS WORSE THAN AN ERROR. Jason's phone had
     * College stored, nothing is polling a college game, and the screen sat on
     * "Waiting for the first push from the poller…" with no way to change it —
     * because the sport gate was built one-way. A choice that cannot be
     * unmade is not a choice, it is a trap with a nice first screen. */
    if (S.noGame) {
      const c = el('div', 'card lg-nogame');
      /* "No game game is being polled" - the fallback already said "game". */
      c.appendChild(el('div', 'lg-nogame-h', S.sport
        ? `No ${SPORT_LABEL[S.sport]} game is being polled`
        : 'No game is being polled'));
      c.appendChild(el('p', 'lg-nogame-b',
        'One game is on the wire at a time while this is a rig. Nothing is watching '
        + `${SPORT_LABEL[S.sport] || 'that sport'} right now.`));
      const b = el('button', 'lg-nogame-go', 'Pick a different sport');
      b.onclick = () => { S.sport = null; S.noGame = false; store.set('sport', null); paint(wrap); };
      c.appendChild(b);
      wrap.appendChild(c);
      return;
    }
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

  /* 🔴 AFTER `state` EXISTS. The first version called this from the top of
   * paint(), above `const state = held(...)` — a temporal dead zone reference
   * that threw before anything rendered, so Home drew the delay line and
   * nothing else. That is the THIRD time tonight a block was placed above the
   * thing it reads: the stale bar, the sport switch, and now this.
   *
   * Home is a destination and it stops here — it does not fall through into the
   * game. */
  /* (Home is handled at the top of paint now - see there.) */
  const age = Math.round((now - (S.raw.pushedAt || now)) / 1000);

  /* ---- the game ---- */
  const head = el('div', 'lg-head');
  const away = state.teams[state.awayTeamId], home = state.teams[state.homeTeamId];
  /* The league goes with the chip, because a team id is only unique inside one. */
  const league = (S.key || '').split(':')[0] === 'nfl' ? 'nfl' : 'college-football';
  /* 🔴 THE GAME HEAD IS WHERE A CREST DOES ITS JOB, so it is sized for that and
   * not for a list row. 22 was the slate's number, carried over — and a slate row
   * is one of sixty while this is the only place on screen that says WHICH GAME
   * you are in. Jason: "Logos not in and to small." */
  if (away) head.appendChild(teamChip({ id: state.awayTeamId, ...away }, { size: 34, league }));
  head.appendChild(el('span', 'lg-score num', `${state.awayScore} – ${state.homeScore}`));
  if (home) head.appendChild(teamChip({ id: state.homeTeamId, ...home }, { size: 34, league }));
  const meta = el('span', 'lg-meta num');
  meta.textContent = state.status === 'pre' ? 'Not started'
    : state.situation ? `Q${state.situation.quarter} ${state.situation.clock}` : state.status;
  head.appendChild(meta);
  /* 🔴 WHERE IT IS ON. Jason: "Do we also want to add where the game is
   * televised, if it is." Yes — and it belongs on the LIVE header, not only
   * before kickoff, because this app is useless without the game on a screen in
   * front of you. Somebody who opens it mid-game and cannot find the broadcast
   * is holding a scoreboard. `if it is` is the whole condition: no channel in the
   * feed means no line, never a guess. */
  if (state.broadcast) head.appendChild(el('span', 'lg-tv', state.broadcast));
  wrap.appendChild(head);

  if (state.status === 'pre') {
    wrap.appendChild(pregame(state, now, wrap));
    /* 🔴 WHAT ELSE IS ON. Jason, 2026-09-09: "What do you see when there are
     * multiple games?" - and the honest answer was NOTHING. This screen followed
     * one game, the front door offered one game, and on a Saturday with twenty
     * kickoffs the app silently picked one and never mentioned the rest.
     *
     * That is fine on Wednesday, when the opener is the only game there is, and
     * indefensible on Saturday. So the next few kickoffs after this one are
     * listed under it, tappable, with the count so the number is never a
     * surprise - and the full list is one tap away on the slate.
     *
     * THREE, not all of them. A pre-game screen that turns into a second slate
     * has stopped being about a game; the slate already exists and is better at
     * being a slate. Three is enough to say "there is more than this one". */
    alsoOn(wrap, state, now);
    /* 🔴 THE THINGS THAT USED TO BE ON HOME LIVE HERE NOW, because Home became
     * the front door and a front door carries one question. Everything ABOUT a
     * game belongs on the game: the week's card for the same league, the invite
     * that opens this fixture, and the ad slot - which is allowed here only
     * because a pre-game screen is a browsing screen. It disappears the moment
     * the game starts and tiles carrying a price and a countdown appear, which
     * is the ad doctrine's actual rule rather than a place on the page. */
    const wk = el('button', 'lg-mode lg-go lg-wide');
    wk.appendChild(el('span', 'lg-mode-h', S.mode === 'pool' ? 'Open your group' : "The week's card"));
    wk.appendChild(el('span', 'lg-mode-b', S.mode === 'pool'
      ? 'Pick the week for points' : 'Against the spread, every pick pays 2.00×'));
    wk.onclick = () => { location.hash = '#/slate'; };
    wrap.appendChild(wk);

    /* 🔴 NO SECOND INVITE. pregame() already appends one, and adding another
     * here put the same button on the screen twice - the kind of duplicate that
     * survives because both copies work. Found by reading the rendered text
     * rather than the code: "Invite a friend ... Post it ... The week's card ...
     * Invite a friend". */
    wrap.appendChild(adSlot('banner', 'Your ad here · reserved, nothing sold yet'));
    return;
  }

  /* ---- the bank ---- */
  const rows = settleAll(state);
  const bank = el('div', 'card lg-bank');
  /* 🔴 A NUMBER WITH NO SENTENCE IS A SCORE. Jason: "add 'you have...' above the
   * 200." A bare 200 could be points, a rank, or a countdown; "You have 200
   * Marbles" is the only reading that says it is YOURS and that it is a stake
   * you are about to spend. It also seats the balance in the one sentence the
   * legal position rests on — a thing you HAVE, never a thing you bought. */
  bank.appendChild(el('div', 'lg-bank-lead', 'You have'));
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
  } else if (already && last) {
    /* 🔴 THE TILES STAY, AND THE ONE YOU TOOK IS LIT. Jason, 2026-09-08: "when
     * you select a run or pass, it should highlight, it does not do that now."
     *
     * It used to replace the whole card with a line of text, which throws away
     * the two things worth looking at while you wait: WHAT YOU TOOK, in the same
     * place you tapped it, and WHAT IT PAYS. A sentence saying "You called Run"
     * is an acknowledgement; the lit tile is the bet. */
    const type2 = byId(already.type);
    const card = el('div', 'card lg-call is-called');
    card.appendChild(el('div', 'lg-q', type2 ? type2.question : 'Your call'));
    card.appendChild(el('div', 'lg-sub', 'Locked in — waiting on the snap.'));
    if (type2) {
      const tiles = el('div', 'lg-tiles' + (type2.choices.length > 3 ? ' is-4' : ''));
      for (const ch of type2.choices) {
        const mine = ch.id === already.choice;
        const b = el('div', 'lg-tile' + (mine ? ' is-mine' : ' is-faded'));
        b.appendChild(el('span', 'lg-tile-label', ch.label));
        if (mine) {
          b.appendChild(el('span', 'lg-tile-win num',
            '+' + (Math.round(already.stake * payoutOf(already)) - already.stake)));
          b.appendChild(el('span', 'lg-tile-x num',
            payoutOf(already) + '× · ' + already.stake + ' Marbles'));
        }
        tiles.appendChild(b);
      }
      card.appendChild(tiles);
    }
    wrap.appendChild(card);
  }

  /* ---- what just happened, in words ---- */
  const said = commentary(state);
  if (said) wrap.appendChild(said);

  /* ---- and a picture of it, if it was worth one ---- */
  const react = reactions(state, wrap);
  if (react) wrap.appendChild(react);

  /* ---- brag about the best one ---- */
  const brag = bragButton(state, rows);
  if (brag) wrap.appendChild(brag);

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

  wrap.appendChild(inviteButton(state));

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
/**
 * The first question, and the only one asked before the game is shown.
 *
 * 🔴 IT IS NOT A COSMETIC PREFERENCE. A sack settles as a PASS in the NFL and a
 * RUSH in college — every operator rulebook says so in the same words — and the
 * tendency model behind the prices is 697,997 COLLEGE plays with no NFL
 * equivalent. Picking the wrong one does not produce an error; it produces calls
 * that grade the other way and prices drawn from the wrong sport.
 *
 * Changeable afterwards from the same place, because somebody who watches both
 * should not have to clear their browser to switch.
 */
/* The marbles explainer, on the front door where somebody has just chosen to
 * play them - not on every pre-game screen for the rest of the season. */
function marblesCard() {
  const q = el('div', 'card lg-what');
  q.appendChild(el('div', 'lg-what-h', `You start with ${START_BANK} Marbles`));
  q.appendChild(el('p', 'lg-what-b',
    'Everybody starts on the same number and it resets next game, so nobody is ever out. '
    + 'They cannot be bought.'));
  const ul = el('div', 'lg-qlist');
  const preview = ['script', 'drive_end', 'direction', 'fourth_down', 'kickoff_return', 'three_and_out'];
  for (const id of preview) {
    const t = byId(id);
    if (!t) continue;
    const row = el('div', 'lg-qrow');
    row.appendChild(el('span', 'lg-qtext', t.question));
    row.appendChild(el('span', 'lg-qn num', t.perGame >= 100 ? 'every snap' : `~${t.perGame}×`));
    ul.appendChild(row);
  }
  q.appendChild(ul);
  q.appendChild(el('p', 'lg-what-b', 'The question changes with the situation — a fourth down is a '
    + 'coach’s decision, a kickoff is a returner’s.'));
  return q;
}

function sportCard(wrap) {
  const c = el('div', 'card lg-sport');
  c.appendChild(el('div', 'lg-sport-h', 'Which are you watching?'));
  c.appendChild(el('p', 'lg-sport-b', S.mode === 'pool'
    ? 'Which slate your group is picking from.'
    : 'It changes how calls are settled and how they are priced — a sack counts as a pass in the NFL '
      + 'and as a run in college, and the model behind the prices is built on college play-by-play.'));
  const row = el('div', 'lg-sport-row');
  for (const id of ['nfl', 'college-football']) {
    const b = el('button', 'lg-sport-pick');
    /* The league's own mark, self-hosted like the club crests. Jason:
     * "use the nfl logo and the ncaa logo." */
    const img = document.createElement('img');
    img.className = 'lg-sport-logo';
    img.src = `/logos/leagues/${id === 'nfl' ? 'nfl' : 'ncaa'}-500.png`;
    img.alt = ''; img.width = 44; img.height = 44;
    b.appendChild(img);
    b.appendChild(el('span', 'lg-sport-name', SPORT_LABEL[id]));
    b.onclick = () => {
      S.sport = id; store.set('sport', id);
      S.key = GAME_FOR[id];
      S.raw = null; S.board = [];
      /* Pool mode has its own screen. This one owns the live layer only. */
      if (S.mode === 'pool') { location.hash = '#/slate'; return; }
      /* 🔴 THE SECOND CARD IS THE LAST ONE. Answering it is the whole reason
       * somebody opened the front door, so it takes them THROUGH rather than
       * repainting Home with a third thing on it. */
      if (S.isHome) { location.hash = '#/live'; return; }
      paint(wrap);
      poll(wrap);
      refreshKey(wrap, id);
    };
    row.appendChild(b);
  }
  c.appendChild(row);
  return c;
}

/**
 * The second question. Sport first because it changes how calls SETTLE; mode
 * second because it changes which app you are in.
 */
function modeCard(wrap, compact) {
  const c = el('div', 'card lg-sport' + (compact ? ' is-compact' : ''));
  if (compact) {
    /* 🔴 THE MARK COMPLETES, WITH THE PAUSE IN IT. Jason: "Any Given… Snap". The
     * ellipsis is the whole joke — the stem is a setup and the completion is the
     * punchline, and printing "Any Given Snap" flat throws the beat away. */
    const h = el('div', 'lg-sport-h lg-mark');
    h.appendChild(el('span', 'lg-mark-stem', 'Any Given…'));
    h.appendChild(el('span', 'lg-mark-end', ' Snap'));
    c.appendChild(h);
  } else {
    c.appendChild(el('div', 'lg-sport-h', 'What are you here for?'));
  }
  if (!compact) {
    c.appendChild(el('p', 'lg-sport-b',
      'Two halves. One stakes marbles at a price you can see before you tap; the '
      + 'other is your group picking a week for points. They keep separate scores '
      + 'and never add together.'));
  }

  /* 🔴 TWO ON THE FIRST CARD, AND THE SEAM IS WHAT IS AT STAKE. Jason,
   * 2026-09-09: "First card, simulated betting or weekly group pools. You pick
   * the title… Then ncaa or nfl… on the next card."
   *
   * The three-way version put calling, the week's card and the pool side by side
   * and made somebody choose a SPEED and a PRODUCT in one tap. Wrong shape: two
   * of those three are the same product, they share one balance, and the third
   * shares nothing with either. So the first question is the only one that
   * actually branches — marbles or points — and the speed is settled afterwards,
   * inside the half that has two speeds.
   *
   *   marbles · you stake marbles at a price. Live snap-by-snap, or a week's
   *             card. Nothing purchasable, nothing redeemable, one bank that
   *             refills every game
   *   pool    · POINTS, your group, nothing staked and nothing to spend
   *
   * 🔴 THE TITLES ARE MINE TO PICK AND THEY ARE NOT "SIMULATED BETTING".
   * "Simulated betting" is an accurate description and a terrible name: it
   * volunteers the word this product spends the rest of its life not being, and
   * it is the first word a reviewer reads. "Play the marbles" says the same
   * thing using the app's own noun — the one that is deliberately not "credits",
   * for the same reason.
   *
   * 🔴 "GROUP POOLS", PLURAL. Jason, 2026-09-09: "Group pools not pool." It went
   * through "Run a pool" and then "Group pool" before landing here, and the
   * plural is the correct one for the same reason his phrasing kept it: this
   * button is the door to a SECTION, not to one pool object. A person can be in
   * several - the office, the family, the group chat - and the singular quietly
   * promises there is only ever one, which is a claim the product does not make
   * and would have to walk back the first time somebody joins a second. */
  const row = el('div', 'lg-mode-row');
  const opts = [
    { id: 'marbles', h: 'Play the marbles', b: 'Stake marbles at a price you see first. Live, or a card for the week.' },
    { id: 'pool', h: 'Your group', b: 'People you know, a week at a time, scored in points. Nothing staked.' }
  ];
  for (const o of opts) {
    const b = el('button', 'lg-mode');
    b.appendChild(el('span', 'lg-mode-h', o.h));
    b.appendChild(el('span', 'lg-mode-b', o.b));
    if (compact && o.id === S.mode) b.classList.add('is-on');
    b.onclick = () => {
      S.mode = o.id; store.set('mode', o.id);
      /* On the front door the first card advances to the second. Everywhere
       * else this card is a setting being changed in place. */
      if (S.isHome) S.homeStep = 'sport';
      paint(wrap);
    };
    row.appendChild(b);
  }
  c.appendChild(row);

  /* 🔴 THE SPORT IS THE SECOND CARD, and it is drawn whether or not the first
   * one has been answered — Jason, 2026-09-09: "Then ncaa or nfl… on the next
   * card." Kept inside the same hub because two taps that belong together read
   * as one decision; the rows are what separate them, not two screens. */
  if (compact) {
    const sr = el('div', 'lg-mode-row lg-sportrow');
    for (const id of ['nfl', 'college-football']) {
      const b = el('button', 'lg-mode lg-sportpick' + (id === S.sport ? ' is-on' : ''));
      const img = document.createElement('img');
      img.className = 'lg-sportpick-logo';
      img.src = `/logos/leagues/${id === 'nfl' ? 'nfl' : 'ncaa'}-500.png`;
      img.alt = ''; img.width = 22; img.height = 22;
      b.appendChild(img);
      b.appendChild(el('span', 'lg-mode-h', SPORT_LABEL[id]));
      b.onclick = () => {
        if (id === S.sport) return;
        S.sport = id; store.set('sport', id);
        /* The constant paints now; the slate lookup corrects it, same as mount. */
        S.key = GAME_FOR[id]; S.raw = null; S.board = []; S.noGame = false;
        paint(wrap); poll(wrap); refreshKey(wrap, id);
      };
      /* On Home the mode buttons navigate rather than gate: "Call the game" is a
       * door, not a setting. */
      sr.appendChild(b);
    }
    c.appendChild(sr);

    /* The doors used to be a third row here. They moved to homeScreen's step 3,
     * because this card is reached from the live board too - where the question
     * "live or weekly?" is being answered by the screen you are already on. */
  }
  return c;
}

/**
 * The landing. Everything a person needs to decide what they are doing, and
 * nothing they have to scroll past to get there.
 */
/* 🔴 HOME IS A SEQUENCE OF PAGES, NOT ONE STACKED HUB. Jason, 2026-09-09:
 * "First page is play for the marbles or group pool, only."
 *
 * The hub put every question on one card - mode, then league, then speed, three
 * rows deep - and called that progressive because the later rows only appeared
 * once the earlier ones were answered. It is not progressive, it is a form. The
 * first thing somebody sees on the first screen of this app should be ONE
 * question with two answers and nothing else competing for the tap.
 *
 * So each step owns the screen:
 *
 *   1 · marbles or group pool     - and nothing else on the page
 *   2 · NFL or College            - and nothing else on the page
 *   3 · the game, how to enter it, and the invite
 *
 * Step 3 does NOT re-draw steps 1 and 2 as rows. It carries a single line
 * saying what you picked, which changes it. That is the difference between a
 * landing and a settings page, and it is why the earlier orphan "NFL · change"
 * chip was wrong in a way this is not: that chip floated beside a hub that was
 * already asking the same question two rows below it. */
function homeScreen(wrap) {
  /* 🔴 HOME IS THE FORK. ALWAYS. Jason settled this on 2026-09-09, after saying
   * "Home button still goes here" seven times and my guessing wrong every time.
   *
   * The model I kept rebuilding was "Home is where you land once you have
   * chosen", so it drew a hub with the game on it. His is "Home is the front
   * door": it asks the question every time, even when the answer is already
   * stored, because the point of a front door is that it is where you START -
   * not a summary of where you have been.
   *
   * That makes these two genuinely different screens rather than one screen with
   * a state in it:
   *
   *   HOME   - one question, two answers. Then the league. Then you leave.
   *   /live  - the game, and everything belonging to it: the Upcoming card, the
   *            week's card, the invite, the ad slot.
   *
   * S.homeStep is TRANSIENT and resets on every arrival, which is what keeps
   * this a door rather than a wizard somebody can be stranded halfway down. The
   * stored mode and sport are NOT cleared - they still mark the current choice
   * and they are what every other screen reads. */
  if (S.homeStep === 'sport') {
    wrap.appendChild(sportCard(wrap));
    /* The rules of the thing they just chose, under the question that follows
     * it. Marbles only - the group pool has no bank and no price, and showing
     * it here would be explaining a product they did not pick. */
    if (S.mode === 'marbles') wrap.appendChild(marblesCard());
    return;
  }
  wrap.appendChild(modeCard(wrap));
}

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

/**
 * 🔴 A CONTROL YOU SET ONCE DOES NOT DESERVE THE TOP OF THE SCREEN FOREVER.
 * Jason, 2026-09-08: "why do i have the behind on purpose on the top all the
 * time?"
 *
 * Because it was drawn as a full card with a live slider on every render, above
 * the game, permanently — spending the most valuable space in the app on a
 * setting that is correct within ten seconds of arriving and never touched
 * again. The delay is still the mechanic and still has to be VISIBLE, because a
 * person needs to know they are behind. Visible is one line. Adjustable is a tap.
 */
/** "5h 42m" / "18m" / "any second now". Coarse on purpose: a second-by-second
 *  countdown to something four hours away is a fidget, not information. */
function untilLabel(ms) {
  if (ms <= 0) return 'any second now';
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ${m % 60}m` : `${Math.round(h / 24)} days`;
}

/**
 * 🔴 THE SCREEN NOBODY DESIGNED, AND IT IS ON FOR NINETEEN HOURS.
 *
 * Jason, 2026-09-08: "This page looks pretty lame... Uninspiring." He was
 * looking at the state the app spends the ENTIRE TIME BEFORE A GAME in — the
 * one he and the friend he invites will open first — and it was a heading
 * saying kickoff had not happened, a paragraph apologising for that, and a wall
 * of black.
 *
 * The pre-game screen has plenty that is true to say. When it starts. Where, and
 * on what channel. What you will be given. What you are going to be asked. Who
 * else is already here. None of it needed a feed we did not have; it needed
 * somebody to write the screen instead of an empty state.
 */
/* The other games in this league, after this one, soonest first. */
async function alsoOn(wrap, state, now) {
  const key = S.key;
  const sport = (key || '').split(':')[0] === 'nfl' ? 'nfl' : 'college-football';
  let games = [];
  try {
    const res = await fetch('/api/state/slate:' + sport + ':2026:' + (SLATE_WEEK[sport] || 1));
    if (!res.ok) return;
    games = ((await res.json()).games || [])
      .filter((g) => g && g.status !== 'final' && g.kickoffUtc > (state.kickoffUtc || now)
                     && String(g.id) !== String((key || '').split(':')[1]))
      .sort((a, b) => a.kickoffUtc - b.kickoffUtc);
  } catch { return; }
  if (!games.length) return;

  /* 🔴 APPENDED ONLY IF THE SCREEN IS STILL THE ONE THAT ASKED. This resumes
   * after an await and paint() empties the container, so without the guard a
   * slow response drops a list of college games at the foot of an NFL screen -
   * or under a game that has since kicked off and repainted. The key is captured
   * before the fetch and compared after it; nothing else is a reliable identity
   * for "the screen I was drawing". */
  if (S.key !== key || !wrap.isConnected) return;

  const box = el('div', 'card lg-also');
  const h = el('div', 'lg-also-h');
  h.appendChild(el('span', 'lg-also-k', 'Also on'));
  h.appendChild(el('span', 'lg-also-n num',
    games.length === 1 ? '1 more game' : games.length + ' more games'));
  box.appendChild(h);

  for (const g of games.slice(0, 3)) {
    const teams = {};
    for (const t of (g.teams || [])) if (t && t.id) teams[t.id] = t;
    const a = teams[g.awayTeamId], hm = teams[g.homeTeamId];
    const row = el('a', 'lg-also-r');
    /* 🔴 A REAL QUERY STRING, NOT ONE INSIDE THE HASH. mount() reads
     * location.search, so '#/live?game=...' puts the parameter somewhere nothing
     * looks - the link would navigate and then show whatever game was already
     * loaded, silently. Same shape the invite button builds, colon and all. */
    row.href = '/?game=' + encodeURIComponent(sport + ':' + g.id).replace(/%3A/g, ':');
    row.appendChild(el('span', 'lg-also-t',
      ((a && (a.short || a.abbrev)) || '?') + ' at ' + ((hm && (hm.short || hm.abbrev)) || '?')));
    row.appendChild(el('span', 'lg-also-w num', untilLabel(g.kickoffUtc - now)));
    box.appendChild(row);
  }

  if (games.length > 3) {
    const more = el('a', 'lg-also-more', 'See the whole week →');
    more.href = '#/slate';
    box.appendChild(more);
  }
  wrap.appendChild(box);
}

function pregame(state, now, wrap) {
  const box = el('div', 'lg-pre');

  if (state.kickoffUtc) {
    const c = el('div', 'card lg-count');
    c.appendChild(el('div', 'lg-count-k', 'KICKOFF'));
    c.appendChild(el('div', 'lg-count-v num', untilLabel(state.kickoffUtc - now)));
    const when = new Date(state.kickoffUtc);
    const bits = [when.toLocaleDateString(undefined, { weekday: 'long' }),
                  when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })];
    if (state.venue) bits.push(state.venue);
    if (state.broadcast) bits.push('on ' + state.broadcast);
    c.appendChild(el('div', 'lg-count-b', bits.join(' · ')));
    box.appendChild(c);
  }

  /* 🔴 WHAT YOU WILL BE ASKED, BEFORE YOU ARE ASKED IT. The catalog is the
   * product and it was completely invisible until the first snap. Showing the
   * questions in advance is the difference between waiting for an app to load
   * and waiting for a game to start. Frequencies are the measured ones. */
  /* 🔴 THE MARBLES EXPLAINER MOVED TO THE SPORT CARD. Jason, 2026-09-09: "Add
   * the marbles info on this page... and remove it from this page" - the sport
   * card, and off the pre-game.
   *
   * Right, and the reason is that it is an ONBOARDING explanation wearing a
   * game screen's clothes. "You start with 200 Marbles" and a list of the six
   * questions is what somebody needs the first time they choose to play the
   * marbles - which happens on the front door, one tap earlier. On the pre-game
   * it was the tallest thing on the screen, every single game, forever,
   * explaining the rules to somebody who had already read them. */

  box.appendChild(inviteButton(state));

  /* Who is already here, if anybody. Silence when nobody is, rather than an
   * empty box announcing that nobody came. */
  if (S.board.length) {
    const names = [...new Set(S.board.map((c) => c.name).filter(Boolean))];
    if (names.length) {
      const w = el('div', 'card lg-waiting');
      w.appendChild(el('div', 'lg-what-h', names.length === 1 ? '1 person is here' : `${names.length} people are here`));
      w.appendChild(el('p', 'lg-what-b', names.join(' · ')));
      box.appendChild(w);
    }
  }
  return box;
}

/**
 * 🔴 THE CALL IS THE GAME; THE COMMENTARY IS WHY IT WAS A GAME.
 *
 * A board of numbers tells you that you lost ten Marbles. It does not tell you
 * that a 38-yard completion on 3rd and 9 is why. detect.ts has ranked every play
 * by severity since it was written and nothing had ever drawn the result.
 *
 * ONLY SEVERITY 2 AND 3. Every snap is an event to a detector; three or four a
 * quarter are a MOMENT. A commentary feed that speaks on every play is a
 * transcript, and nobody reads a transcript during a game.
 *
 * And it obeys the delay like everything else — it is fed the HELD plays, so the
 * app never tells you about a play your television has not shown you.
 */
function commentary(state) {
  let dets = [];
  try {
    dets = detect(state.plays.map((p) => ({
      id: p.id, driveId: p.driveId, offenseTeamId: p.offenseTeamId,
      quarter: p.quarter, clock: p.clock, text: p.text, typeText: p.typeText,
      scoringPlay: p.scoringPlay, homeScore: p.homeScore, awayScore: p.awayScore,
      statYardage: p.statYardage, down: p.startDown, distance: p.distance,
      /* 🔴 PASSED THROUGH, NEVER RE-DERIVED. This was omitted and the star line
       * rendered empty on every play — 7.2's whole point is that the parser says
       * who the play was about and a view repeats it. */
      star: p.star, yards: p.statYardage ?? 0
    })), {
      homeTeamId: state.homeTeamId, awayTeamId: state.awayTeamId,
      /* 🔴 `abbrev` EXISTS FOR EXACTLY THIS and was never passed. detect.ts
       * documents it as "team id → the abbreviation a headline uses", falls back
       * to the raw id when it is missing, and that is how "Touchdown — 17"
       * reached the screen.
       *
       * The first fix was a string substitution over the finished headline, and
       * it was WORSE than the bug: New England's id is 17, so "4th & 17" became
       * "4th & Patriots". Replacing ids inside prose replaces distances, yardage
       * and scores that happen to share the digits. The detector already knew how
       * to do this properly; it just had nothing to do it with. */
      abbrev: Object.fromEntries(Object.entries(state.teams || {})
        .map(([id, t]) => [id, t.abbrev || t.short || id]))
    });
  } catch { return null; }

  const big = dets.filter((d) => (d.reasons || []).some((r) => r.severity >= 2)).slice(-4).reverse();
  if (!big.length) return null;

  const card = el('div', 'card lg-say');
  card.appendChild(el('div', 'lg-say-h', 'What just happened'));
  for (const d of big) {
    const r = (d.reasons || []).filter((x) => x.severity >= 2).sort((a, b) => b.severity - a.severity)[0];
    if (!r) continue;
    const row = el('div', 'lg-sayrow');
    const t = state.teams[d.offenseTeamId];
    const head = el('div', 'lg-say-line');
    head.appendChild(el('span', 'lg-say-when num', `Q${d.quarter} ${d.clock}`));
    head.appendChild(el('b', 'lg-say-head', r.headline));
    row.appendChild(head);
    row.appendChild(el('div', 'lg-say-detail', r.detail));
    /* The star, with the role the parser gave it. Never re-derived here — the
     * parenthesised name at the end of a play is the TACKLER, and a view that
     * works that out for itself gets it wrong. */
    if (d.star && d.star.name) {
      /* The role in the words a person uses, and the jersey where the feed gave
       * one — the 2026 grammar carries numbers and the older one does not. */
      const who = (d.star.jersey ? '#' + d.star.jersey + ' ' : '') + d.star.name;
      const side = d.star.teamId && state.teams[d.star.teamId];
      row.appendChild(el('div', 'lg-say-star',
        `${who} · ${d.star.role}${side ? ' · ' + side.abbrev : ''}`));
    }
    card.appendChild(row);
  }
  return card;
}

/**
 * 🔴 INVITE A FRIEND. Jason, 2026-09-08: "We also need to put an invite a friend
 * button somewhere." It is the whole product — a board with one person on it is
 * a solitaire game with extra steps — and until now the only way to get somebody
 * else in was for Jason to paste a URL himself.
 *
 * THE LINK CARRIES THE GAME, so a friend lands on the thing you are watching
 * rather than on whatever sport their own device last chose. That is the same
 * `?game=` parameter the fixtures replay uses, and it is why it exists.
 *
 * navigator.share is the native sheet on a phone — the one that offers Messages,
 * which is how this actually gets sent. Clipboard is the desktop fallback, and
 * neither is assumed: a browser with neither still gets a link it can select.
 */
function inviteButton(state) {
  /* 🔴 THE COLON IS NOT ENCODED, and this is not fussiness. The key is
   * `nfl:401872656`, and encodeURIComponent turns it into `nfl%3A401872656` —
   * so a link somebody posts in public reads as
   * `anygiven.app/?game=nfl%3A401872656`. That is a URL that looks broken, or
   * tracked, and it is the first thing a stranger sees of this app.
   *
   * A colon is legal in a query value under RFC 3986; only the delimiters have
   * to be escaped. Everything else stays encoded, so a key that ever contains a
   * genuine delimiter is still safe. */
  const url = `${location.origin}/?game=${encodeURIComponent(S.key).replace(/%3A/g, ':')}`;
  const wrapEl = el('div', 'lg-invite-wrap');
  const b = el('button', 'lg-invite');
  b.appendChild(el('span', 'lg-invite-h', 'Invite a friend'));
  b.appendChild(el('span', 'lg-invite-b', 'They land on this game. No account, no install.'));
  b.onclick = async () => {
    const text = 'Call the game with me — no account, nothing to install.';
    try {
      if (navigator.share) { await navigator.share({ title: 'Any Given', text, url }); return; }
    } catch { return; /* they cancelled the sheet; that is not a failure */ }
    try {
      await navigator.clipboard.writeText(url);
      b.querySelector('.lg-invite-b').textContent = 'Link copied — paste it to them';
      return;
    } catch { /* no clipboard permission */ }
    /* 🔴 A LINK THEY CAN STILL GET. If both routes are unavailable the button
     * must not simply do nothing — it shows the URL to select by hand. */
    b.querySelector('.lg-invite-b').textContent = url;
  };
  wrapEl.appendChild(b);
  wrapEl.appendChild(postToX(state, url));
  return wrapEl;
}

/* 🔴 NO REDDIT BUTTON, AND NO SECOND PLATFORM AT ALL. Jason asked twice —
 * "Really, Redit?" then "Again, Redit?" — and the second ask is the answer.
 *
 * The argument for it was that a game thread is a PLACE rather than a person.
 * True, and it does not survive the objection: navigator.share already offers
 * Reddit on a phone alongside every other installed app, so the button bought a
 * second route to somewhere the OS sheet already goes. X keeps its button
 * because the pre-filled text plus hashtags is the thing the native sheet
 * cannot do.
 *
 * A row of branded buttons re-implements the operating system, worse.
 */

/**
 * 🔴 X's WEB INTENT — no API key, no SDK, no script from their origin.
 * Jason, 2026-09-08: "What about opening X and prepopulating a tweet?" Yes, and
 * it is one URL: /intent/tweet with text and url. It opens THEIR compose window
 * with the words already in it, and a person still has to press post. Nothing is
 * ever published by this app.
 *
 * 🔴 THE TEXT IS THE PRODUCT, AND IT CHANGES WITH THE MOMENT. "Come play my app"
 * is an advertisement nobody sends. What people actually post is a RESULT — so
 * once there is a settled call to brag about, the tweet is the brag and the app
 * is the footnote. Before that it is the matchup.
 *
 * And it never says "bet". The balance is Marbles, they cannot be bought, and a
 * post that says betting is the first objection arriving in our own words.
 */
function postToX(state, url) {
  const a = el('a', 'lg-x');
  a.href = 'https://twitter.com/intent/tweet?' + new URLSearchParams({ text: xText(state), url });
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.appendChild(el('span', 'lg-x-mark', '𝕏'));
  a.appendChild(el('span', 'lg-x-l', 'Post it'));
  return a;
}

/**
 * 🔴 HASHTAGS FROM THE TEAMS ACTUALLY PLAYING. Jason: "Can we regenerate X
 * hashtags for the teams playing?" They come off the same abbreviations already
 * in the state — no table to maintain, and nothing to go stale when a team is
 * added or a game changes.
 *
 * #NEvsSEA is the shape the sport itself uses, and it is what somebody following
 * the game is already watching. Adding it is the difference between posting into
 * your own followers and posting into the conversation about the game.
 *
 * TWO, NEVER FIVE. A post carrying a stack of tags reads as marketing and gets
 * treated as marketing. The matchup tag puts it in the game's stream; the app
 * tag is how anybody finds the others playing.
 */
function hashtags(state) {
  const away = state && state.teams ? state.teams[state.awayTeamId] : null;
  const home = state && state.teams ? state.teams[state.homeTeamId] : null;
  const clean = (v) => (v || '').replace(/[^A-Za-z0-9]/g, '');
  const a = clean(away && away.abbrev), h = clean(home && home.abbrev);
  return a && h ? `#${a}vs${h} #AnyGivenSnap` : '#AnyGivenSnap';
}

function xText(state) {
  const away = state && state.teams ? state.teams[state.awayTeamId] : null;
  const home = state && state.teams ? state.teams[state.homeTeamId] : null;
  const game = away && home ? `${away.short} at ${home.short}` : 'this game';

  /* The best settled call so far, if there is one — the thing worth posting. */
  let best = null;
  for (const c of Object.values(S.calls)) {
    const r = settleOne({ ...c }, state || { plays: [], drives: [] });
    if (r && r.landed === true && (!best || r.delta > best.delta)) best = { ...c, delta: r.delta };
  }
  const tags = hashtags(state);
  if (best) {
    return `Called "${best.label}" at ${payoutOf(best)}× on ${game} and it hit. `
      + `+${best.delta} Marbles.

${tags}`;
  }
  const n = S.bank - START_BANK;
  if (n > 0) return `Up ${n} Marbles calling plays on ${game}.

${tags}`;
  return `Calling the plays on ${game} before they happen.

${tags}`;
}

/**
 * 🔴 IT ONLY APPEARS WHEN THERE IS SOMETHING TO SAY. A share button with nothing
 * behind it is an ask; a share button attached to a call that just landed at 6×
 * is a person wanting to tell somebody. The difference is whether the app is
 * begging to be spread or being spread.
 *
 * The BEST settled call, not the last — nobody posts the one they lost.
 */
/**
 * 🔴 REACTION CARDS, OFFERED ONLY WHEN THE MOMENT IS ACTUALLY ON THE SCREEN.
 * Jason: "Can we not make generic touchdown images? For people to hit during the
 * game... It would be awesome advertising, no?"
 *
 * Yes — and the reason it works is the reason advertising usually does not:
 * nobody posts an advert, everybody posts a touchdown. So the card is the
 * MOMENT, big, with the real score and crests, and the wordmark sits in the
 * corner where a broadcaster puts a bug.
 *
 * A permanent row of share buttons would be a toolbar nobody touches. These
 * appear because a touchdown just happened, on the play the detector flagged,
 * and they go when the next drive starts — which is exactly the window in which
 * somebody wants to say something.
 *
 * 🔴 AND THEY ARE DRAWN FROM THE HELD STATE. The score on a shared picture is
 * the score this app was showing, delay included. A card built from the live
 * feed would leak a play the sender has not seen — the one place this app could
 * spoil its own mechanic.
 */
function reactions(state, wrap) {
  const last = state.plays[state.plays.length - 1];
  if (!last) return null;
  const recent = state.plays.slice(-3);

  const found = [];
  const add = (k, line) => { if (!found.some((f) => f.k === k)) found.push({ k, line }); };
  for (const p of recent) {
    const t = (p.text || '').toLowerCase();
    if (/touchdown/.test(t)) add('touchdown', p.text);
    else if (/intercepted|fumble.*recovered by/.test(t)) add('turnover', p.text);
    else if (/field goal.*(is good|good)/.test(t) && !/no good/.test(t)) add('field_goal', p.text);
    else if (p.startDown === 4 && /rush|pass/.test((p.typeText || '').toLowerCase())) add('fourth_down', p.text);
    else if ((p.statYardage || 0) >= 40) add('big_play', p.text);
  }
  if (!found.length) return null;

  const card = el('div', 'card lg-react');
  card.appendChild(el('div', 'lg-react-h', 'Send it'));
  const row = el('div', 'lg-react-row');
  for (const f of found.slice(0, 3)) {
    const m = MOMENTS[f.k];
    const b = el('button', 'lg-react-b');
    b.style.setProperty('--m', m.tint);
    b.appendChild(el('span', 'lg-react-w', m.word));
    row.appendChild(b);
    b.onclick = async () => {
      const before = b.querySelector('.lg-react-w').textContent;
      b.querySelector('.lg-react-w').textContent = '…';
      const r = await shareReaction(state, f.k, f.line, xText(state));
      b.querySelector('.lg-react-w').textContent =
        r === 'shared' ? 'SENT' : r === 'downloaded' ? 'SAVED' : before;
    };
  }
  card.appendChild(row);
  return card;
}

function bragButton(state, rows) {
  const landed = (rows || []).filter((r) => r.landed === true && r.delta > 0);
  if (!landed.length) return null;
  const best = landed.reduce((a, b) => (a.delta >= b.delta ? a : b));

  const b = el('button', 'lg-brag');
  b.appendChild(el('span', 'lg-brag-h', `Share it — ${best.label} at ${payoutOf(best)}×`));
  b.appendChild(el('span', 'lg-brag-b', 'Makes a picture with the score and your call on it.'));
  b.onclick = async () => {
    const sub = b.querySelector('.lg-brag-b');
    sub.textContent = 'Drawing it…';
    const r = await shareResult(state, best, xText(state));
    sub.textContent = r === 'shared' ? 'Sent.'
      : r === 'downloaded' ? 'Saved to your downloads — attach it to a post.'
      : r === 'cancelled' ? 'Makes a picture with the score and your call on it.'
      : 'This browser cannot make the picture. The link still works.';
  };
  return b;
}

function delayBar() {
  if (S.delayOpen || !S.seenIntro) return delayPanel();
  const line = el('button', 'lg-delayline');
  line.appendChild(el('span', 'lg-delayline-l',
    S.delayMs === 0 ? 'LIVE — no delay' : `${S.delayMs / 1000}s behind`));
  line.appendChild(el('span', 'lg-delayline-a', 'adjust'));
  if (S.delayMs === 0) line.classList.add('is-live');
  line.onclick = () => { S.delayOpen = true; paint(document.querySelector('.lg').parentNode); };
  return line;
}

function delayPanel() {
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
  if (S.seenIntro) {
    const done = el('button', 'lg-delay-done', 'Done');
    done.onclick = () => { S.delayOpen = false; paint(document.querySelector('.lg').parentNode); };
    bar.appendChild(done);
  }
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
.lg-delay-done { justify-self: start; font: inherit; font-size: var(--t-micro); font-weight: 700;
  margin-top: 4px; min-height: 32px; padding: 0 14px; border: 1px solid var(--line);
  border-radius: var(--radius-card); background: var(--card); color: var(--fg); }
/* One line, not a card. It still says you are behind — that is the part that
   must never disappear — and the slider is one tap away. */
.lg-delayline { display: flex; align-items: baseline; gap: 8px; width: 100%;
  font: inherit; font-size: var(--t-micro); text-align: left;
  background: none; border: 0; padding: 2px 2px 0; color: var(--dim); }
.lg-delayline-l { font-weight: 700; letter-spacing: .04em; color: var(--accent); }
.lg-delayline.is-live .lg-delayline-l { color: var(--down); }
.lg-delayline-a { text-decoration: underline; }
.lg-react { display: grid; gap: 8px; padding: 12px; }
.lg-react-h { font-size: var(--t-micro); font-weight: 800; letter-spacing: .06em; color: var(--dim); }
.lg-react-row { display: flex; gap: 8px; flex-wrap: wrap; }
.lg-react-b { font: inherit; padding: 10px 14px; min-height: var(--tap-min);
  border: 2px solid var(--m); border-radius: var(--radius-card);
  background: color-mix(in srgb, var(--m) 12%, var(--card)); color: var(--m); }
.lg-react-w { font-size: var(--t-micro); font-weight: 800; letter-spacing: .06em; }
.lg-brag { display: grid; gap: 3px; text-align: left; font: inherit; width: 100%;
  padding: 13px 12px; border: 2px solid var(--up); border-radius: var(--radius-card);
  background: color-mix(in srgb, var(--up) 10%, var(--card)); color: var(--fg); }
.lg-brag-h { font-size: var(--t-emph); font-weight: 800; color: var(--up); }
.lg-brag-b { font-size: var(--t-micro); color: var(--dim); }
/* 🔴 TWO COLUMNS, NOT THREE. Jason, 2026-09-09: "The right side of the cards
   should align."

   It was 1fr auto auto, from when a Reddit button sat beside the X one. That
   button was deleted and the track was not, so the grid still reserved a third
   column and, more to the point, a SECOND GAP after it - about 16px of nothing
   between the X button and the right edge. Every other card on the page ran to
   the edge and this one row stopped short of it.

   An empty grid track is invisible; its gap is not. That is the whole bug, and
   it is why removing a child from a grid means checking the template. */
.lg-invite-wrap { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: stretch; }
.lg-x { display: grid; place-content: center; gap: 2px; text-decoration: none;
  padding: 0 14px; border: 1px solid var(--line); border-radius: var(--radius-card);
  background: var(--card); color: var(--fg); }
.lg-x-mark { font-size: 18px; line-height: 1; text-align: center; }
.lg-x-l { font-size: var(--t-micro); color: var(--dim); }
/* 🔴 THE INVITE IS QUIET. Jason, 2026-09-09: "The card for the game is more
   important than the invite a friend, but the outline suggests otherwise."
   Exactly right, and it was the one loud element on the page: a gold border AND
   a tinted fill, against a game card wearing the same hairline as everything
   else. Emphasis is a ranking, and this had the third thing on the page winning
   it. The accent stays on the WORDS so it still reads as an action; the box
   goes back to the standard card treatment. */
.lg-invite { display: grid; gap: 2px; text-align: left; font: inherit; width: 100%;
  padding: 13px 12px; border: 1px solid var(--line); border-radius: var(--radius-card);
  background: var(--card); color: var(--fg); }
.lg-invite-h { font-size: var(--t-emph); font-weight: 800; color: var(--accent); }
.lg-invite-b { font-size: var(--t-micro); color: var(--dim); overflow-wrap: anywhere; }
/* The channel reads as a label, not as a score. */
.lg-tv { font-size: var(--t-micro); font-weight: 700; letter-spacing: .04em; color: var(--dim);
  border: 1px solid var(--line); border-radius: var(--radius-chip); padding: 1px 6px; }
.lg-say { display: grid; gap: 0; padding: 4px 12px 8px; }
.lg-say-h { font-size: var(--t-micro); font-weight: 800; letter-spacing: .06em; color: var(--dim); padding: 8px 0 2px; }
.lg-sayrow { padding: 9px 0; border-top: 1px solid var(--line); }
.lg-say-line { display: flex; gap: 8px; align-items: baseline; }
.lg-say-when { font-size: var(--t-micro); color: var(--dim); white-space: nowrap; }
.lg-say-head { font-size: var(--t-body); }
.lg-say-detail { font-size: var(--t-micro); color: var(--dim); margin-top: 2px; line-height: 1.45; }
.lg-say-star { font-size: var(--t-micro); color: var(--accent); margin-top: 3px; font-weight: 700; }
.lg-pre { display: grid; gap: 10px; }
.lg-count { display: grid; gap: 2px; padding: 16px 12px; }
.lg-count-k { font-size: var(--t-micro); font-weight: 800; letter-spacing: .08em; color: var(--dim); }
.lg-count-v { font-size: var(--t-bank); font-weight: 800; line-height: 1.05; color: var(--accent); }
.lg-count-b { font-size: var(--t-micro); color: var(--dim); margin-top: 2px; }
.lg-what { display: grid; gap: 6px; padding: 14px 12px; }
.lg-what-h { font-size: var(--t-emph); font-weight: 800; }
.lg-what-b { font-size: var(--t-micro); color: var(--dim); margin: 0; line-height: 1.5; }
.lg-qlist { display: grid; margin: 6px 0 4px; }
.lg-qrow { display: flex; justify-content: space-between; gap: 10px; align-items: baseline;
  padding: 7px 0; border-top: 1px solid var(--line); }
.lg-qrow:first-child { border-top: 0; }
.lg-qtext { font-size: var(--t-body); }
.lg-qn { font-size: var(--t-micro); color: var(--dim); white-space: nowrap; }
.lg-waiting { display: grid; gap: 4px; padding: 14px 12px; }
.lg-nogame { display: grid; gap: 8px; padding: 16px 12px; }
.lg-nogame-h { font-size: var(--t-emph); font-weight: 800; }
.lg-nogame-b { font-size: var(--t-micro); color: var(--dim); margin: 0; line-height: 1.5; }
.lg-nogame-go { justify-self: start; font: inherit; font-weight: 800; margin-top: 4px;
  min-height: var(--tap-min); padding: 0 18px; border: 0;
  border-radius: var(--radius-card); background: var(--accent); color: var(--bg); }
.lg-switch { justify-self: start; font: inherit; font-size: var(--t-micro); font-weight: 700;
  color: var(--accent); background: none; border: 1px solid var(--line);
  border-radius: var(--radius-chip); padding: 4px 10px; min-height: 30px; }
.lg-sport { display: grid; gap: 8px; padding: 16px 12px; }
.lg-sport-h { font-size: var(--t-section); font-weight: 800; }
.lg-sport-b { font-size: var(--t-micro); color: var(--dim); margin: 0; line-height: 1.5; }
.lg-sport-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 4px; }
.lg-mode-row { display: grid; gap: 10px; margin-top: 6px; }
.lg-mode { display: grid; gap: 3px; text-align: left; font: inherit; padding: 14px 12px;
  border: 1px solid var(--line); border-radius: var(--radius-card);
  background: var(--card); color: var(--fg); }
.lg-mode-h { font-size: var(--t-emph); font-weight: 800; }
/* The hub version is a strip, not a page: two choices, no essay, and the one you
   are in is marked so the card reads as WHERE YOU ARE rather than as a question
   being asked again. */
.lg-sport.is-compact { padding: 12px; gap: 6px; }
/* THE MODE ROW AND THE SPORT ROW SHARE A CLASS, so a bare 1fr 1fr sized both and
   a third mode wrapped into a 2+1 orphan. The mode row is scoped by :not() so the
   two grids can disagree, which they must.

   NO BACKTICKS IN THIS COMMENT, and that is not a style note. The first version
   quoted the class name in backticks, inside a template literal, and the
   backtick CLOSED THE STRING. What followed parsed as arithmetic on undefined
   identifiers, so node --check passed and every screen died at runtime on
   "mode is not defined". Second time tonight. See the parse guard. */
/* Every row on the hub is two across now that the first card is a pair. */
.lg-sport.is-compact .lg-mode-row { grid-template-columns: 1fr 1fr; }
/* The pool has one door, not two, so its row is full width rather than a button
   beside a gap. */
.lg-gorow.is-one { grid-template-columns: 1fr; }
/* One line: what you picked on the left, the way out of it on the right. */
.lg-picked { display: flex; align-items: baseline; justify-content: space-between;
  gap: 10px; margin: 2px 0 4px; }
.lg-picked-w { font-size: var(--t-micro); font-weight: 700; color: var(--dim);
  letter-spacing: .04em; text-transform: uppercase; }
.lg-picked-c { font: inherit; font-size: var(--t-micro); font-weight: 700;
  background: none; border: 0; padding: 6px 2px; color: var(--accent);
  text-decoration: underline; }
/* The GO row is the only place on the hub that navigates, so it carries its
   subtitle where the rows above it hide theirs - a door says where it leads. */
.lg-sport.is-compact .lg-gorow .lg-mode-b { display: block; }
.lg-gorow .lg-mode { border-color: color-mix(in srgb, var(--accent) 40%, var(--line)); }
.lg-gorow .lg-mode-h { color: var(--accent); }
.lg-sport.is-compact .lg-mode { padding: 10px 12px; gap: 1px; }
.lg-sport.is-compact .lg-mode-h { font-size: var(--t-body); }
.lg-sport.is-compact .lg-mode-b { display: none; }
.lg-hgame { display: grid; gap: 6px; padding: 14px 12px; text-decoration: none; color: var(--fg); }
/* 🔴 THE GAME CARD IS THE SUBJECT OF THE PAGE, so it carries the emphasis the
   invite used to steal: the accent border and the tint. It is also the tallest
   and the widest thing here, which is the other half of saying so. */
.lg-hgame { border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 7%, var(--card)); }
/* One word above the crests saying what the card is. */
.lg-hgame-k { font-size: var(--t-micro); font-weight: 800; letter-spacing: .1em;
  text-transform: uppercase; color: var(--accent); margin-bottom: 2px; }
/* What else is on tonight. A short list, not a second slate. */
.lg-also { display: grid; gap: 2px; padding: 12px; }
.lg-also-h { display: flex; align-items: baseline; justify-content: space-between;
  gap: 8px; margin-bottom: 4px; }
.lg-also-k { font-size: var(--t-micro); font-weight: 800; letter-spacing: .1em;
  text-transform: uppercase; color: var(--dim); }
.lg-also-n { font-size: var(--t-micro); color: var(--dim); }
.lg-also-r { display: flex; align-items: baseline; justify-content: space-between;
  gap: 10px; min-height: 44px; padding: 4px 0; text-decoration: none; color: var(--fg);
  border-top: 1px solid var(--line); font-size: var(--t-body); }
.lg-also-w { color: var(--dim); font-size: var(--t-micro); white-space: nowrap; }
.lg-also-more { display: block; padding: 10px 0 2px; font-size: var(--t-micro);
  font-weight: 800; color: var(--accent); text-decoration: none; }
/* The page title, out of a card and at the top where a title belongs. */
.lg-home-mark { display: flex; align-items: baseline; gap: 0;
  font-size: var(--t-score); font-weight: 800; padding: 2px 2px 0; }
/* The second door, edge to edge. */
.lg-wide { width: 100%; text-align: left; }
/* The matchup is the card's HEADLINE, at the share card's proportions - figure
   size, which is the largest type outside the live layer's own bank strip. */
.lg-hgame-t { font-size: var(--t-figure); font-weight: 800; line-height: 1.2;
  letter-spacing: -0.01em; }
/* The quiet connector the share card uses. It separates two crests; it is not a
   thing to read, so it gets the smallest size and the dim color. */
.lg-at { font-size: var(--t-body); font-weight: 700; color: var(--dim); }
.lg-hgame-b { font-size: var(--t-body); color: var(--dim); }
.lg-hgame-go { font-size: var(--t-emph); font-weight: 800; color: var(--accent); margin-top: 4px; }
.lg-mark { display: flex; align-items: baseline; gap: 0; }
.lg-mark-stem { color: var(--dim); font-weight: 700; }
.lg-mark-end { color: var(--accent); font-weight: 800; }
.lg-sportrow { margin-top: 2px; }
.lg-sportpick { display: flex; align-items: center; justify-content: center; gap: 8px; }
.lg-sportpick-logo { display: block; object-fit: contain; }
.lg-mode.is-on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, var(--card)); }
.lg-mode.is-on .lg-mode-h { color: var(--accent); }
.lg-mode-b { font-size: var(--t-micro); color: var(--dim); line-height: 1.45; }
.lg-sport-logo { display: block; margin: 0 auto 6px; object-fit: contain; }
.lg-sport-name { display: block; font-size: var(--t-body); }
.lg-sport-pick { font: inherit; font-size: var(--t-emph); font-weight: 800; min-height: 52px;
  border: 1px solid var(--line); border-radius: var(--radius-card);
  background: var(--card); color: var(--fg); }
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
/* The lead sits on its own line above the figure, so the row underneath keeps
   the baseline alignment the balance, the unit and the delta all share. */
.lg-bank { display: flex; align-items: baseline; gap: 6px; padding: 10px 12px; flex-wrap: wrap; }
.lg-bank-lead { flex: 0 0 100%; font-size: var(--t-micro); color: var(--dim);
  letter-spacing: .04em; margin-bottom: -2px; }
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
/* 🔴 THE TILE HAD NO RADIUS AT ALL. Jason: "maybe round the corners?" It went
   unnoticed while the tiles were borderless — with nothing drawn at the edge
   there were no corners to see. The moment the taken one got a 2px accent
   border, the square box appeared in a card whose own corners are rounded and
   in an app where every other surface is.
   Every tile takes the radius, not just the lit one, so the shape does not
   change when you tap. */
.lg-tile { display: grid; gap: 2px; padding: 10px; min-height: 76px; text-align: left;
  border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--card); }
/* 🔴 THE CHOICE IS THE BIGGEST THING ON THE TILE. Jason: "make the word 'Run'
   and 'Pass' larger." It was set at --t-emph, the same size as a card heading,
   while the PAYOUT below it was --t-figure and won the tile. The number matters
   and it is not what you are choosing between — you are choosing a word, at
   arm's length, in a room with a television on. */
.lg-tile-label { font-weight: 800; font-size: var(--t-section); line-height: 1.15; }
.lg-tile-win { font-size: var(--t-figure); font-weight: 800; }
.lg-tile-x { font-size: var(--t-micro); color: var(--dim); }
/* The taken tile keeps the accent it was tapped with; the others recede rather
   than disappear, so the choice still reads as a choice that was made. */
.lg-tile.is-mine { border: 2px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, var(--card)); }
/* 🔴 THE ONES NOT TAKEN STAY VISIBLE AS TILES. At .38 opacity with no border
   they read as loose grey text rather than as the options they were — you could
   no longer see that it had been a choice between four things. They keep their
   outline and recede instead. */
.lg-tile.is-faded { opacity: .55; border-style: dashed; background: transparent; }
.lg-call.is-called .lg-tile { cursor: default; }
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
