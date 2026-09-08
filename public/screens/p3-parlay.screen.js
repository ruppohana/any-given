/* P3 - THE PARLAY. One parlay of 3-6 legs. One.
 *
 * 🔴 BAR: THERE IS NONE, AND `bar` IS DECLARED NULL DELIBERATELY.
 *
 * Five pick'em products were captured for this project and NOT ONE OF THEM SHIPS A
 * PARLAY. POOL-SCREENS P3 records the gap itself: "BAR - 🔴 COULD NOT CLOSE." So this
 * file cannot claim a close against a comp, and it does not pretend to. CONTRACT §1:
 * "NEVER INVENT A BAR. An invented bar produces a clean run, a confident verdict and no
 * signal at all." The preview index will print NO BAR DECLARED against this screen. That
 * line is TRUE and it should stay true until somebody captures one.
 *
 * The one adjacent document on disk is
 * `sports-live/docs/design/sportsbook-bet-slip-and-settlement-2026-09-06.md`, read whole
 * before a line of this was drawn. It is about SETTLEMENT IN A BETTING REGISTER, and it
 * is not a bar - a sportsbook layout is a different decision and was never made. What it
 * is good for is the refusal list, and this screen takes that list seriously:
 *
 *   TAKEN, because it is about honesty rather than handle:
 *     - "Lock the price at the tap, and say so." Here the equivalent is the LADDER: what
 *       a leg count is worth is a published table, printed on the screen, not a number
 *       computed at you. Nothing on this screen can move under the user except a VOID,
 *       and a void is announced in words.
 *     - "Somewhere for a settled result to go." The parlay does not clear when it
 *       resolves; the legs stay, with their marks, which is what makes it screenshottable
 *       AFTER the fact and not only before.
 *
 *   REFUSED, all four, and the fourth is why this file exists at all:
 *     - No slip that follows you. This is a destination, not a drawer.
 *     - No stake field, no quick amounts, no balance, no confirm. NOTHING IS STAKED HERE.
 *       The pool scores in points; the live layer stakes Marbles; the two never meet.
 *     - No number that recalculates as you type, because there is nothing to type.
 *     - Their note refuses PARLAYS OUTRIGHT for the live layer - "they pay for compounding
 *       improbable outcomes" - and it is right about the live layer. The pool is the other
 *       half of the product: it is flat by design, it is scored weekly in whole points, and
 *       POOL-SCREENS P3 asks for exactly one high-variance swing inside it. Jason settled
 *       this 2026-09-08. Recorded in COULD NOT CLOSE so nobody re-derives the refusal and
 *       thinks they have found a contradiction.
 *
 * 🔴 EVERY RULE ON THIS SCREEN IS RUN BY src/lib/pool.ts. NOTHING IS REIMPLEMENTED.
 * The browser imports the real module - the preview harness strips the types and serves
 * it as JavaScript, which is how l5-game runs winprob.ts - so `resolveParlay`,
 * `validateParlay`, `parlayWorth` and the 3/6/12/20 ladder on this screen are the same
 * functions the Worker will call, not a copy of their logic. The ladder is READ from
 * DEFAULT_SCORING: change it there and this screen changes with it.
 *
 * WHAT THIS SCREEN MAY NOT DECIDE, and does not: the ladder (Jason, 2026-09-08), the
 * minimum and maximum (POOL-SCREENS P3), how a void resolves (the one void path, in
 * pool.ts), whether the pool and the live layer ever sum (never).
 */
import { teamChip, TEAM_CHIP_CSS } from '/components/team-chip.js';
import { stateBlock, STATES_CSS } from '/components/states.js';
import { dash } from '/components/fmt.js';
import {
  DEFAULT_SCORING, PARLAY_MIN_LEGS, PARLAY_MAX_LEGS,
  parlayWorth, resolveParlay, validateParlay, isPickEditable
} from '/src/lib/pool.ts';

export const id = 'p3-parlay';
export const title = 'The parlay';

/* 🔴 NULL ON PURPOSE. See the header. Five captured pick'em products, zero parlays. */
export const bar = null;
export const barNote =
  'No comparable exists. Five pick’em products captured, none of them ships a parlay. ' +
  'The nearest document on disk is a sportsbook SETTLEMENT note in a betting register ' +
  'and is not a bar: sports-live/docs/design/sportsbook-bet-slip-and-settlement-2026-09-06.md';

/* EVERY STATE IS A ROUTE, and every one of them is NAMED BY pool.ts RATHER THAN BY THIS
 * FILE - previewData builds legs, games and a clock, and `screenState(resolveParlay(...))`
 * decides which name comes out. tests/p3-parlay.test.mjs asserts the route name and the
 * module's answer are the same string for all eleven. A route whose name this file simply
 * declared would be a screen judged against its own opinion.
 *
 * `no_picks` is the S3 empty and it is a DIFFERENT state from `empty`: no legs with picks
 * available is a screen with work to do on it; no picks at all is a screen with nowhere to
 * go but the slate. Collapsing them would have made the first one a dead end. */
export const states = [
  'empty', 'under_min', 'valid', 'at_max', 'partial_lock', 'locked',
  'won', 'lost', 'reduced', 'void',
  'no_picks', 'loading', 'offline', 'error'
];

/* ------------------------------------------------------------------ pure helpers
 * These use pool.ts and nothing else. No DOM, no component import - which is what lets
 * the test load this module with only the /components/ imports stripped and the pool.ts
 * import repointed at the real file. */

/**
 * The screen's state name, folded from what pool.ts returns.
 *
 * 🔴 THE DRIFT THIS EXISTS TO ABSORB, and it is real: `src/lib/types.ts` amendment 3 says
 * ParlayState includes 'void'. `src/lib/pool.ts` declares its own ParlayState WITHOUT it
 * and flags that as its own COULD NOT CLOSE, returning `outcome: 'void'` alongside
 * `state: 'locked'` instead. So a parlay voided below the minimum reports LOCKED, which
 * is the one answer a screen must not print - it says the thing is still alive.
 *
 * One function, one place, tested against the module. Not a fix to pool.ts, which this
 * piece does not own.
 * @param {{state:string, outcome:string}} res  a ParlayResolution
 */
export function screenState(res) {
  if (res.outcome === 'void') return 'void';
  return res.state;
}

/** The published ladder, READ from pool.ts rather than written here. 3·3 4·6 5·12 6·20.
 *  A sportsbook computes a return at you; this prints the whole table and marks where you
 *  are on it, which is the entire anti-slip decision of this screen in one component. */
export function ladderRungs(scoring) {
  const s = scoring || DEFAULT_SCORING;
  const out = [];
  for (let n = PARLAY_MIN_LEGS; n <= PARLAY_MAX_LEGS; n++) out.push({ legs: n, worth: parlayWorth(n, s) });
  return out;
}

/** Legs in kickoff order. THE ORDER IS THE STATE MACHINE: legs lock at their own kickoff,
 *  so sorted by kickoff the locked ones are a prefix and the boundary is a line that can
 *  be drawn. A leg whose game left the slate sorts last - it is a void, not a mystery. */
export function legOrder(legs, games) {
  return legs.slice().sort((a, b) => {
    const ga = games.get(a.gameId), gb = games.get(b.gameId);
    if (!ga && !gb) return 0;
    if (!ga) return 1;
    if (!gb) return -1;
    return ga.kickoffUtc - gb.kickoffUtc;
  });
}

/**
 * Where the lock line goes, or -1 for "do not draw one".
 *
 * 🔴 IT IS ONLY DRAWN WHEN IT CANNOT LIE. A leg also locks when its game VOIDS, which can
 * happen before kickoff - a cancellation on the Thursday of a Saturday game - and then the
 * locked legs are no longer a prefix of the kickoff order. In that case every leg carries
 * its own padlock and no line is drawn, because a line through a list that is not sorted
 * by the thing the line divides is a diagram of something that is not true.
 * @param {{locked:boolean}[]} legs  ordered legs, as returned by resolveParlay
 */
export function lockLineIndex(legs) {
  let i = 0;
  while (i < legs.length && legs[i].locked) i++;
  if (i === 0 || i === legs.length) return -1;              /* all open, or all locked */
  for (let j = i; j < legs.length; j++) if (legs[j].locked) return -1;  /* not a prefix */
  return i;
}

/**
 * Why this pick cannot become a leg, using the REAL validator. 3-6 is "enforced in the UI
 * before it is enforced in the scorer" (POOL-SCREENS P3) - and the way to do that without
 * writing the rule twice is to ask the scorer's own validator about the proposed set.
 *
 * `too_few_legs` is dropped because adding a leg is never blocked for being short, and
 * errors about OTHER legs are dropped because a locked leg already in the parlay is not a
 * reason to refuse a new one.
 */
export function addLegErrors(gameId, side, legs, picks, games, now) {
  const next = legs.concat([{ gameId: gameId, side: side }]);
  return validateParlay(next, picks, games, now).errors.filter(
    (e) => e.code !== 'too_few_legs' && (e.gameId === undefined || e.gameId === gameId));
}

/** The picks that could still become legs: made, not already a leg, game not kicked. */
export function addablePicks(picks, games, legs, now) {
  const inParlay = new Set(legs.map((l) => l.gameId));
  const out = [];
  for (const p of Object.values(picks)) {
    if (!p.side || inParlay.has(p.gameId)) continue;
    const g = games.get(p.gameId);
    if (!g || !isPickEditable(g, now)) continue;
    out.push(p);
  }
  return out.sort((a, b) => games.get(a.gameId).kickoffUtc - games.get(b.gameId).kickoffUtc);
}

/** Picks that are past the door: made, not a leg, already kicked or voided. Counted, not
 *  listed - a row you cannot act on is a row that costs a screen and buys nothing. */
export function shutPicks(picks, games, legs, now) {
  const inParlay = new Set(legs.map((l) => l.gameId));
  let n = 0;
  for (const p of Object.values(picks)) {
    if (!p.side || inParlay.has(p.gameId)) continue;
    const g = games.get(p.gameId);
    if (g && !isPickEditable(g, now)) n++;
  }
  return n;
}

/** The figure at the top. `null` renders as an em dash: a parlay that is not yet a parlay
 *  is worth NOTHING RATHER THAN ZERO, and those are different facts (fmt.js says so too). */
export function headlineFigure(res) {
  if (res.outcome === 'pending') return res.worth > 0 ? res.worth : null;
  return res.points;
}

export function headlineCaption(res) {
  if (res.outcome === 'pending') {
    /* A middot, not a dash: the figure itself is an em dash in this state and "— points —
     * under the 3-leg minimum" reads as one broken sentence with two dashes in it. */
    return res.worth > 0
      ? 'points if every leg lands'
      : 'points · ' + PARLAY_MIN_LEGS + ' legs is the minimum';
  }
  return res.points === 1 ? 'point' : 'points';
}

/**
 * Whether pool.ts's own sentence adds anything the figure and the ladder have not already
 * said. On a live four-leg parlay the note reads "4 legs live. Worth 6 points." directly
 * under a 21px `6` and a caption reading "points if every leg lands" - the same fact three
 * times, and the third one is the one a reader stops trusting. It is printed where it
 * carries something new: a result, a void, or a parlay that is not yet a parlay.
 */
export function shouldSay(res) {
  return res.outcome !== 'pending' || res.worth === 0;
}

/** The count on the card. 🔴 IT COUNTS SURVIVORS ONCE A LEG HAS VOIDED. Drawn first as a
 *  flat `legs.length of 6`, which put "5 of 6 legs" directly above a banner reading "this
 *  is a 4-leg parlay now" - the screen contradicting itself in adjacent lines, in the one
 *  state the whole rule is about. */
export function legCountLabel(res, legCount) {
  if (res.voidedLegs.length) {
    return res.survivingLegCount + ' of ' + res.originalLegCount + ' legs left';
  }
  return legCount + ' of ' + PARLAY_MAX_LEGS + ' legs';
}

/**
 * The line, from the point of view of the side taken. `spread` is stored as the HOME
 * number, ESPN's convention and pool.ts's stated convention: negative means home is
 * favored. RENDERED ONLY WHEN pool.ats IS TRUE.
 *
 * 🔴 THIS FUNCTION EXISTS BECAUSE THE SCREEN WAS WRONG WITHOUT IT, and it was invisible
 * until the `lost` route was looked at in a browser. Oregon BEAT Boise State 34-27 and the
 * leg carried a red miss mark with nothing beside it - a screen showing a team that won as
 * a loss, with no explanation on it anywhere. In an against-the-spread pool the line IS the
 * reason, so it is on the leg.
 *
 * P2 has the same function for the same convention. It is not shared because
 * public/components/ is session-owned and a screen may not add to it - recorded as a
 * COULD NOT CLOSE rather than solved by importing another screen's module.
 */
export function sideSpread(spread, side) {
  if (spread === null || spread === undefined) return null;
  const v = side === 'home' ? spread : -spread;
  if (v === 0) return 'PK';
  const s = Math.abs(v) % 1 === 0 ? String(Math.abs(v)) : Math.abs(v).toFixed(1);
  return (v > 0 ? '+' : '−') + s;
}

const VERDICT_WORD = { won: 'Landed', lost: 'Missed', void: 'Void' };

/* ------------------------------------------------------------------ preview data
 *
 * 🔴 WHAT IS REAL AND WHAT IS NOT, stated before anything else, because this is the whole
 * of rule zero on a screen with no bar.
 *
 * REAL, down to the score and the number: the `won` and `lost` routes. Both are THE THREE
 * CAPTURED GAMES, all of them, which is exactly the three-leg minimum:
 *
 *     UTEP  0 at Oklahoma  51    OU  -40.5   covered
 *     Ball  3 at Ohio St   56    OSU -50.5   covered
 *     Boise 27 at Oregon   34    ORE -24.5   DID NOT COVER
 *
 * Take all three home teams. Straight up, all three won: the parlay LANDS, 3 points.
 * The identical three legs against the spread LOSE, because Oregon won by 7 into 24.5.
 * Same games, same picks, one flag - and `pool.ts` produces `won` and `lost` from real
 * finals and real captured spreads. Nothing on either route is invented, including the
 * lines, which come out of each fixture's own `pickcenter`.
 *
 * NOT REAL, and it cannot be: everything with more than three legs, and every void.
 * fixtures/ holds three games. A 4, 5 or 6-leg parlay needs games that do not exist, and a
 * void needs a game that was cancelled, postponed, tied or pushed - there is no such
 * capture, and all three real lines are half-points, so a push is arithmetically
 * impossible from them. Those routes pair REAL TEAM IDENTITIES from fixtures/teams.json at
 * SYNTHETIC kickoffs. That is P2's precedent and its rule: real identities, synthetic
 * pairings, SAID PLAINLY ON THE SCREEN in the footnote every route renders. A fixture was
 * not written and must not be - `_make.py` invented a play-text shape once and 306 tests
 * passed while the app named the wrong player in every real game.
 *
 * THE SIX PAIRS ARE THE COLOR REQUIREMENT, not decoration. CONTRACT §5: a pool component
 * must be rendered against navy, yellow and null AND AGAINST EVERY PAIR OF THOSE, navy on
 * navy included. Both teams in a leg are drawn - your side carries the rail and the chip,
 * the opponent carries a second chip on the line below - so the pair is genuinely adjacent
 * here, and the six-leg route is the six pairs.
 */

/** Twelve DISTINCT real teams, verified against fixtures/teams.json by the test beside
 *  this file. [away, home]. The same probe set P2 uses, for the same reason. */
const PROBE_IDS = [
  ['2', '87'],      /* Auburn 0c2340 v Notre Dame 0c2340 - NAVY ON NAVY, identical primary */
  ['25', '9'],      /* California 041e42 v Arizona St ffc627 - navy on yellow */
  ['6', '11'],      /* South Alabama 00205b v Colorado Mesa null - navy on null */
  ['119', '338'],   /* Towson ffc229 v Kennesaw St fdbb30 - YELLOW ON YELLOW, near-identical */
  ['63', '70'],     /* Buena Vista feba12 v Idaho null - yellow on null */
  ['32', '49']      /* Carroll (WI) null v Dubuque null - NULL ON NULL */
];
/* Three more real pairs so the pick list is longer than the parlay - a parlay chosen from
 * exactly six candidates is not a choice. */
const EXTRA_IDS = [['201', '194'], ['2483', '68'], ['2638', '2050']];

function slateGame(o) {
  return {
    id: o.id, week: 2, kickoffUtc: o.kickoffUtc, home: o.home, away: o.away,
    spread: o.spread === undefined ? null : o.spread,
    status: o.status || 'scheduled',
    homeScore: o.homeScore === undefined ? null : o.homeScore,
    awayScore: o.awayScore === undefined ? null : o.awayScore
  };
}

/** One captured ESPN game -> a SlateGame. Id, kickoff, both team ids, both final scores
 *  and THE SPREAD all come out of the fixture. Nothing is chosen here. */
function fromFixture(raw, byId) {
  const c = raw.header.competitions[0];
  const home = c.competitors.find((x) => x.homeAway === 'home');
  const away = c.competitors.find((x) => x.homeAway === 'away');
  const pc = raw.pickcenter && raw.pickcenter[0];
  return slateGame({
    id: c.id,
    kickoffUtc: Date.parse(c.date),
    home: byId[home.team.id], away: byId[away.team.id],
    spread: pc && typeof pc.spread === 'number' ? pc.spread : null,
    status: 'final',
    homeScore: Number(home.score), awayScore: Number(away.score)
  });
}

/** The synthetic slate: nine real pairs at nine kickoffs across one Saturday. */
function syntheticGames(byId, sat) {
  const out = [];
  const pairs = PROBE_IDS.concat(EXTRA_IDS);
  for (let i = 0; i < pairs.length; i++) {
    const away = byId[pairs[i][0]], home = byId[pairs[i][1]];
    if (!away || !home) continue;
    const d = new Date(sat);
    d.setHours(9 + i, (i % 2) * 30, 0, 0);
    out.push(slateGame({ id: 's' + (i + 1), kickoffUtc: d.getTime(), home: home, away: away }));
  }
  return out;
}

/** ROUTE -> which games, which legs, which clock. The state name is NOT set here: it is
 *  whatever `screenState(resolveParlay(...))` returns, and the test proves they match. */
export async function previewData(fixtures, state) {
  const db = fixtures.teams.teams;
  const byId = {};
  for (const k of Object.keys(db)) byId[db[k].id] = db[k];

  const real = [];
  for (const n of fixtures.games) {
    try { real.push(fromFixture(await fixtures.load(n), byId)); } catch (e) { /* keep going */ }
  }
  real.sort((a, b) => a.kickoffUtc - b.kickoffUtc);

  const HOUR = 3600000;

  /* ---- THE TWO REAL ROUTES. Three captured games, three legs, the home side of each. */
  if (state === 'won' || state === 'lost') {
    const ats = state === 'lost';
    return {
      now: real.length ? real[real.length - 1].kickoffUtc + 4 * HOUR : Date.now(),
      pool: pool({ name: 'Saturday Regulars', ats: ats, memberCount: 14 }),
      games: real,
      picks: picksFor(real, real.map((g) => ({ gameId: g.id, side: 'home' }))),
      legs: real.map((g) => ({ gameId: g.id, side: 'home' })),
      captured: real.length, synthetic: 0
    };
  }

  /* ---- EVERY OTHER ROUTE. Real identities, synthetic pairings and kickoffs. */
  const sat = new Date(real.length ? real[1].kickoffUtc : Date.UTC(2026, 8, 5, 16, 30));
  sat.setHours(0, 0, 0, 0);
  const games = syntheticGames(byId, sat.getTime());
  const first = games[0].kickoffUtc;
  const last = games[games.length - 1].kickoffUtc;

  const legsOf = (n) => games.slice(0, n).map((g) => ({ gameId: g.id, side: g.id === 's2' ? 'away' : 'home' }));

  let legs = [];
  let now = first - 2 * HOUR;                 /* before anything kicks: everything editable */

  if (state === 'no_picks') {
    return {
      now: now, pool: pool({}), games: games, picks: {}, legs: [],
      captured: 0, synthetic: games.length
    };
  }
  if (state === 'empty') legs = [];
  else if (state === 'under_min') legs = legsOf(2);
  else if (state === 'valid') legs = legsOf(4);
  else if (state === 'at_max') legs = legsOf(PARLAY_MAX_LEGS);
  else if (state === 'partial_lock') { legs = legsOf(5); now = games[1].kickoffUtc + 30 * 60000; }
  else if (state === 'locked') { legs = legsOf(4); now = games[3].kickoffUtc + 30 * 60000; }
  else if (state === 'reduced') { legs = legsOf(5); now = games[1].kickoffUtc + 30 * 60000; }
  else if (state === 'void') { legs = legsOf(5); now = last + 4 * HOUR; }
  else legs = legsOf(4);                       /* loading / offline / error carry a shape */

  /* ---- THE TWO VOID ROUTES, and they are two different lessons.
   *
   * `reduced` is ONE void inside a live five-leg parlay: the game was cancelled, four legs
   * survive, THE PARLAY IS STILL ALIVE and its worth has fallen from 12 to 6. That is the
   * case POOL-SCREENS calls out - "it does not silently reduce it to 2 legs without saying
   * so on screen" - and it is the one a reader has to be told about while it still matters,
   * not afterwards. Two legs have kicked, so it is also half-locked at the same time.
   *
   * `void` is THREE voids out of five: two survive, under the minimum, so the whole parlay
   * is void. The two survivors are FINALS AND BOTH LANDED - two checks and a void verdict
   * on one card, which is the entire point: a parlay reduced below three is NEITHER WON
   * NOR LOST. It did not happen. Reading it as a loss is the mistake this route exists to
   * make impossible. */
  const voidCount = state === 'reduced' ? 1 : state === 'void' ? 3 : 0;
  for (let i = 0; i < voidCount; i++) games[i].status = 'void';

  for (const g of games) {
    if (g.status === 'void' || now < g.kickoffUtc) continue;
    if (state === 'void') {
      /* Synthetic scores, and the footnote says so. The home side takes each of them,
       * which is the side both surviving legs are on. */
      g.status = 'final';
      g.homeScore = 24 + (Number(g.id.slice(1)) % 3) * 7;
      g.awayScore = 17;
    } else {
      g.status = 'in_progress';
    }
  }

  return {
    now: now,
    pool: pool({ name: 'Big Ten, eight of us', memberCount: 8 }),
    games: games,
    picks: picksFor(games, legs),
    legs: legs,
    captured: 0, synthetic: games.length
  };
}

function pool(o) {
  return {
    id: 'K7RQXZ',
    name: o.name || 'Big Ten, eight of us',
    commissionerId: 'u1',
    scope: 'conference', scopeArg: null, rankingSource: null,
    ats: !!o.ats, season: 2026, scopeLockedAt: null,
    memberCount: o.memberCount || 8
  };
}

/** A LEG IS A PICK ALREADY MADE. So every leg has a pick behind it, on the same side, and
 *  a few more picks exist that are not legs - that is what the lower half of the screen
 *  is for. Deterministic: the preview must not change under you between reloads. */
function picksFor(games, legs) {
  const bySide = {};
  for (const l of legs) bySide[l.gameId] = l.side;
  const picks = {};
  for (let i = 0; i < games.length; i++) {
    const g = games[i];
    const side = bySide[g.id] || (i % 3 === 2 ? null : i % 2 === 0 ? 'home' : 'away');
    if (!side) continue;
    picks[g.id] = { gameId: g.id, side: side, state: 'picked', lockedAt: g.kickoffUtc, crowd: null };
  }
  return picks;
}

/* ------------------------------------------------------------------ render */

const NS = 'http://www.w3.org/2000/svg';
function icon(kind) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '14'); svg.setAttribute('height', '14');
  svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'p3-icon');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', 'currentColor');
  p.setAttribute('stroke-width', '2');
  p.setAttribute('stroke-linecap', 'round');
  p.setAttribute('stroke-linejoin', 'round');
  if (kind === 'check') p.setAttribute('d', 'M2.5 8.5 L6 12 L13.5 4');
  else if (kind === 'cross') p.setAttribute('d', 'M4 4 L12 12 M12 4 L4 12');
  else if (kind === 'dash') p.setAttribute('d', 'M3.5 8 H12.5');
  else if (kind === 'plus') p.setAttribute('d', 'M8 3.5 V12.5 M3.5 8 H12.5');
  else if (kind === 'lock') p.setAttribute('d', 'M4.5 7 V4.75 A3.5 3.5 0 0 1 11.5 4.75 V7 M3.5 7 H12.5 V14 H3.5 Z');
  svg.appendChild(p);
  return svg;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function timeLabel(ms) {
  return new Date(ms).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

/** The score FROM THE SIDE YOU TOOK - your number first, always. A leg is a thing you own
 *  and reading it should not require working out which end of the score is yours. */
function scoreLine(game, side) {
  const mine = side === 'home' ? game.homeScore : game.awayScore;
  const opp = side === 'home' ? game.awayScore : game.homeScore;
  return (game.status === 'final' ? '' : 'Live ') + mine + '–' + opp;
}

/** THE RESULT MARK. One component, one geometry, one size - only the sign changes. That is
 *  the symmetric-result rule satisfied by construction rather than by holding two
 *  components up against each other, and it is deliberately the same 18px ringed glyph P2
 *  uses on the slate, so a win looks the same in both halves of the pool. */
function mark(result) {
  const m = el('span', 'p3-mark');
  m.dataset.result = result;
  m.appendChild(icon(result === 'won' ? 'check' : result === 'lost' ? 'cross' : 'dash'));
  m.setAttribute('title', result === 'won' ? 'This leg landed'
    : result === 'lost' ? 'This leg missed' : 'Void — the game did not happen');
  return m;
}

/** THE LADDER. Four rungs, read from pool.ts, printed whole, with the current one lit.
 *  A sportsbook shows you one number it worked out for you; this shows the entire table
 *  and where you stand on it, which is the difference between a price and a rule. */
function ladder(count) {
  const wrap = el('div', 'p3-ladder');
  wrap.setAttribute('role', 'list');
  wrap.setAttribute('aria-label', 'What each leg count is worth, in this pool’s points');
  for (const r of ladderRungs()) {
    const cell = el('div', 'p3-rung');
    cell.setAttribute('role', 'listitem');
    if (r.legs === count) cell.dataset.on = 'true';
    else if (r.legs < count) cell.dataset.past = 'true';
    cell.append(el('span', 'p3-rung-n num', r.legs + ' legs'),
                el('span', 'p3-rung-w num', String(r.worth)));
    wrap.appendChild(cell);
  }
  return wrap;
}

/** One leg. Both teams are drawn: the side taken carries the rail and the full name, the
 *  opponent carries a second chip directly beneath it - so every color pair in the probe
 *  set is genuinely adjacent on this screen and not merely present on it. */
function legRow(ctx, leg, resolved, editable) {
  const game = ctx.games.get(leg.gameId);
  const li = el('li', 'p3-leg');
  li.dataset.result = resolved.result || 'open';
  li.dataset.locked = String(resolved.locked);

  if (!game) {
    li.append(el('div', 'p3-leg-main', 'This game left the slate'));
    li.appendChild(mark('void'));
    return li;
  }

  const mine = game[leg.side];
  const opp = game[leg.side === 'home' ? 'away' : 'home'];
  const body = el('div', 'p3-leg-main');

  const l1 = el('div', 'p3-l1');
  l1.appendChild(teamChip(mine, { size: 18, withAbbrev: false, adjacentTo: opp }));
  l1.appendChild(el('span', 'p3-team', mine.short || mine.name));
  body.appendChild(l1);

  const l2 = el('div', 'p3-l2');
  l2.appendChild(el('span', 'p3-vs', leg.side === 'home' ? 'vs' : 'at'));
  l2.appendChild(teamChip(opp, { size: 14, adjacentTo: mine }));
  /* THE LINE IS ON THE LEG WHENEVER THE POOL IS AGAINST THE SPREAD - it is the whole
   * reason a team that won can be a miss, and without it that row is unreadable. */
  if (ctx.pool.ats) {
    const sp = sideSpread(game.spread, leg.side);
    if (sp) l2.appendChild(el('span', 'p3-spread num', sp));
  }
  /* WHAT THIS SLOT SAYS IS NEVER THE SAME FACT AS THE PADLOCK BESIDE IT. The first cut
   * printed "Locked" here on every locked leg, next to a padlock glyph saying the same
   * thing - P2's rule, learned on nine rows of the word LOCKED running down one screen:
   * the glyph IS the label. So this slot carries the GAME's state - live, a score, a
   * cancellation, a kickoff time - and the right-hand slot carries the LEG's. */
  const when = el('span', 'p3-when num');
  when.textContent = game.status === 'void' ? 'Did not happen'
    : game.homeScore !== null && game.awayScore !== null ? scoreLine(game, leg.side)
      : game.status === 'in_progress' ? 'Live'
        : resolved.locked ? 'Kicked off' : timeLabel(game.kickoffUtc);
  l2.appendChild(when);
  body.appendChild(l2);

  li.appendChild(body);

  /* THE RIGHT-HAND SLOT HOLDS EXACTLY ONE THING, and which one IS the state machine:
   * a remove control while the leg is yours, a padlock once its own game kicked, a mark
   * once it resolved. Not three columns, not a badge stack - one slot. */
  if (resolved.result) {
    li.appendChild(mark(resolved.result));
  } else if (resolved.locked) {
    const lk = el('span', 'p3-lockglyph');
    lk.appendChild(icon('lock'));
    lk.setAttribute('title', 'Locked at kickoff — this leg is no longer editable');
    li.appendChild(lk);
  } else if (editable) {
    const b = el('button', 'p3-drop');
    b.type = 'button';
    b.setAttribute('aria-label', 'Remove ' + (mine.name || mine.short) + ' from the parlay');
    b.appendChild(icon('cross'));
    b.addEventListener('click', () => ctx.onDrop(leg.gameId));
    li.appendChild(b);
  }
  return li;
}

/** THE VERDICT. One component. `data-outcome` is the only thing that changes between a
 *  win, a miss and a void - same mark size, same word slot, same line. */
function verdict(res) {
  const box = el('div', 'p3-verdict');
  box.dataset.outcome = res.outcome;
  box.setAttribute('role', 'status');
  box.appendChild(mark(res.outcome));
  box.appendChild(el('span', 'p3-v-word', VERDICT_WORD[res.outcome]));
  return box;
}

export function render(root, data, state) {
  root.classList.add('scr-p3-parlay');
  root.innerHTML = '';
  const style = el('style');
  style.textContent = [TEAM_CHIP_CSS, STATES_CSS].join('\n');
  root.appendChild(style);

  head(root, data);

  if (state === 'loading') {
    root.appendChild(stateBlock('loading', { rows: 4, body: 'Reading your picks…' }));
    return;
  }
  if (state === 'offline') {
    root.appendChild(stateBlock('offline', {
      body: 'Every leg you added is saved on this phone and will go up when you are back. '
        + 'Nothing has been dropped, and no leg locks early because you were offline.',
      since: Date.now() - 74000,
      action: { label: 'Try again' }
    }));
    return;
  }
  if (state === 'error') {
    root.appendChild(stateBlock('error', {
      title: 'The parlay did not load',
      body: 'Your picks are safe and so is the parlay. This is the view, not your entry.',
      action: { label: 'Reload' }
    }));
    return;
  }

  const gamesMap = new Map(data.games.map((g) => [g.id, g]));
  const ctx = {
    pool: data.pool, games: gamesMap, picks: data.picks, now: data.now,
    legs: data.legs.slice(),
    onDrop: (gameId) => { ctx.legs = ctx.legs.filter((l) => l.gameId !== gameId); paint(); },
    onAdd: (gameId, side) => {
      if (addLegErrors(gameId, side, ctx.legs, pickMap(ctx.picks), gamesMap, ctx.now).length) return;
      ctx.legs = ctx.legs.concat([{ gameId: gameId, side: side }]);
      paint();
    }
  };

  const body = el('div', 'p3-body');
  root.appendChild(body);
  const paint = () => { body.innerHTML = ''; build(body, ctx, state); };
  paint();

  /* SAYS PLAINLY WHAT IS REAL. The three captured games carry their own final scores and
   * their own captured lines; anything past three legs is real team identities at
   * synthetic kickoffs, because fixtures/ holds three games and a fourth is a capture job. */
  const note = el('p', 'p3-note');
  note.textContent = data.captured
    ? `${data.captured} games, all captured from the feed — finals and lines included`
    : `${data.synthetic} games · real team identities, synthetic pairings and kickoff times. `
      + 'A 4, 5 or 6-leg parlay and every void need games that do not exist in fixtures/';
  root.appendChild(note);
}

function pickMap(picks) {
  const m = new Map();
  for (const p of Object.values(picks)) if (p.side) m.set(p.gameId, p.side);
  return m;
}

function build(body, ctx, route) {
  const res = resolveParlay(ctx.legs, ctx.games, ctx.pool.ats, ctx.now);
  const st = screenState(res);
  const ordered = legOrder(ctx.legs, ctx.games);
  const resolvedByGame = new Map(res.legs.map((l) => [l.gameId, l]));
  const orderedResolved = ordered.map((l) => resolvedByGame.get(l.gameId) || { locked: false, result: null });
  const terminal = res.outcome !== 'pending';

  const addable = addablePicks(ctx.picks, ctx.games, ctx.legs, ctx.now);
  const shut = shutPicks(ctx.picks, ctx.games, ctx.legs, ctx.now);

  /* NOTHING PICKED AT ALL is the one state on this screen with nowhere to go but the
   * slate, so it is the only one that gets the S3 empty block. An empty PARLAY with picks
   * waiting is not empty - the work is right there underneath it. */
  if (!ctx.legs.length && !addable.length && !shut) {
    body.appendChild(stateBlock('empty', {
      title: 'Nothing to build a parlay from yet',
      body: 'A leg is a pick you have already made — that is what stops the same game being '
        + 'picked twice and disagreeing with itself. Pick some games and they show up here.',
      action: { label: 'Go to the slate' }
    }));
    return;
  }

  /* ---------------- the slip: the thing people screenshot ---------------- */
  const card = el('section', 'card p3-slip');
  card.dataset.state = st;

  const top = el('div', 'p3-slip-top');
  top.append(el('span', 'p3-k', 'This week’s parlay'),
             el('span', 'p3-count num', legCountLabel(res, ctx.legs.length)));
  card.appendChild(top);

  const fig = el('div', 'p3-worth');
  const n = headlineFigure(res);
  fig.append(el('b', 'p3-worth-n num', dash(n)),
             el('span', 'p3-worth-u', headlineCaption(res)));
  card.appendChild(fig);

  card.appendChild(ladder(res.survivingLegCount || ctx.legs.length));

  if (terminal) card.appendChild(verdict(res));

  /* 🔴 THE VOID IS NEVER SILENT, AND IT NAMES THE PRICE. pool.ts returns `reduced` and the
   * legs that went; what it cannot know is that a reader needs the BEFORE and the AFTER in
   * the same sentence. A five-leg parlay that quietly becomes a four-leg parlay has gone
   * from 12 points to 6 and nothing on the screen would have said so. */
  if (res.reduced) {
    const b = el('div', 'p3-reduced');
    b.setAttribute('role', 'status');
    b.appendChild(el('span', 'p3-red-k', 'Reduced'));
    b.appendChild(el('span', 'p3-red-b num',
      `${res.voidedLegs.length === 1 ? 'One leg' : res.voidedLegs.length + ' legs'} voided. `
      + `This is a ${res.survivingLegCount}-leg parlay now, worth ${res.worth} points `
      + `instead of ${parlayWorth(res.originalLegCount)}.`));
    card.appendChild(b);
  }

  /* The sentence pool.ts wrote, printed verbatim where it carries something the figure and
   * the ladder have not. It is the module's own words for what just happened and there is
   * no second version of it anywhere in this file. */
  if (shouldSay(res)) card.appendChild(el('p', 'p3-say', res.note));

  if (ctx.legs.length) {
    const list = el('ol', 'p3-legs');
    const lineAt = lockLineIndex(orderedResolved);
    for (let i = 0; i < ordered.length; i++) {
      if (i === lineAt) list.appendChild(lockLine(lineAt, ordered.length));
      list.appendChild(legRow(ctx, ordered[i], orderedResolved[i], !terminal));
    }
    card.appendChild(list);
  }
  body.appendChild(card);

  /* ---------------- the pool of legs: picks already made ---------------- */
  if (terminal) {
    body.appendChild(el('p', 'p3-closed', 'The week is settled. Next week’s parlay opens with next week’s slate.'));
    return;
  }

  const pick = el('section', 'p3-pool');
  const ph = el('div', 'p3-pool-head');
  ph.append(el('span', 'p3-k', 'From your picks'),
            el('span', 'p3-pool-n num', addable.length + (addable.length === 1 ? ' available' : ' available')));
  pick.appendChild(ph);

  /* AT THE MAXIMUM THE SCREEN SAYS WHAT TO DO ABOUT IT, because pool.ts's note for `at_max`
   * says what the parlay is worth and not how to change it. Under the minimum there is no
   * second sentence here: the module's own note above already says how many more to add,
   * and two sentences telling a reader to add one more leg is the count arriving twice. */
  const full = ctx.legs.length >= PARLAY_MAX_LEGS;
  if (full) {
    pick.appendChild(el('p', 'p3-gate', PARLAY_MAX_LEGS + ' legs is the maximum. Remove one to swap it.'));
  }

  if (addable.length) {
    const ul = el('ul', 'p3-cands');
    for (const p of addable) ul.appendChild(candidateRow(ctx, p, full));
    pick.appendChild(ul);
  } else {
    pick.appendChild(el('p', 'p3-gate', 'Every pick you have made is either in the parlay or already kicked off.'));
  }

  if (shut) {
    pick.appendChild(el('p', 'p3-shut num',
      shut + (shut === 1 ? ' other pick has' : ' other picks have') + ' already kicked off and cannot be added.'));
  }
  pick.appendChild(el('p', 'p3-why',
    'A leg is a pick you already made. Change the pick on the slate and the leg changes with it — '
    + 'that is what stops one game being picked two ways at once.'));
  body.appendChild(pick);
}

/** THE LOCK LINE. The one thing on this screen that had to be invented rather than
 *  borrowed: a parlay can be HALF-LOCKED, and five padlocks scattered down a list say
 *  "some of these" without ever saying where the boundary is. Legs are in kickoff order,
 *  so the boundary is a real line in a sorted list - it is drawn only when the locked legs
 *  really are a prefix (see lockLineIndex), and never otherwise. */
function lockLine(index, total) {
  const d = el('li', 'p3-lockline');
  d.setAttribute('role', 'separator');
  /* "No longer editable" rather than "locked", because a leg also leaves your hands when
   * its game is CANCELLED, and calling a cancellation a lock is a small lie in the one
   * place on this screen where the reader is being told what they can still change. */
  d.appendChild(el('span', 'p3-lockline-t num',
    index + (index === 1 ? ' leg' : ' legs') + ' no longer editable · '
    + (total - index) + ' still yours'));
  return d;
}

function candidateRow(ctx, p, full) {
  const game = ctx.games.get(p.gameId);
  const mine = game[p.side];
  const opp = game[p.side === 'home' ? 'away' : 'home'];
  const li = el('li', 'p3-cand');

  const bodyEl = el('div', 'p3-leg-main');
  const l1 = el('div', 'p3-l1');
  l1.appendChild(teamChip(mine, { size: 18, withAbbrev: false, adjacentTo: opp }));
  l1.appendChild(el('span', 'p3-team', mine.short || mine.name));
  bodyEl.appendChild(l1);
  const l2 = el('div', 'p3-l2');
  l2.appendChild(el('span', 'p3-vs', p.side === 'home' ? 'vs' : 'at'));
  l2.appendChild(teamChip(opp, { size: 14, adjacentTo: mine }));
  if (ctx.pool.ats) {
    const sp = sideSpread(game.spread, p.side);
    if (sp) l2.appendChild(el('span', 'p3-spread num', sp));
  }
  l2.appendChild(el('span', 'p3-when num', timeLabel(game.kickoffUtc)));
  bodyEl.appendChild(l2);
  li.appendChild(bodyEl);

  const b = el('button', 'p3-add');
  b.type = 'button';
  b.appendChild(icon('plus'));
  b.appendChild(el('span', 'p3-add-t', 'Add'));
  b.setAttribute('aria-label', 'Add ' + (mine.name || mine.short) + ' to the parlay');
  if (full) {
    b.disabled = true;
    b.setAttribute('title', PARLAY_MAX_LEGS + ' legs is the maximum');
  } else {
    b.addEventListener('click', () => ctx.onAdd(p.gameId, p.side));
  }
  li.appendChild(b);
  return li;
}

/** The head. The pool name at 17px is the largest TEXT on this screen; the worth figure at
 *  21px is the largest FIGURE, and 21 is the scale's own "figure" size. The 24px score and
 *  the 30px bank belong to the live layer, where a stake has to be kept honest. THE POOL
 *  HAS NO STAKE, so it does not get that size and this screen does not reach for it. */
function head(root, data) {
  root.appendChild(el('h1', 'p3-h', 'The parlay'));
  const p = data && data.pool;
  const bits = ['One a week', PARLAY_MIN_LEGS + ' to ' + PARLAY_MAX_LEGS + ' legs'];
  if (p) {
    bits.unshift(p.name);
    bits.push(p.ats ? 'Against the spread' : 'Straight up');
  }
  root.appendChild(el('p', 'p3-sub num', bits.join(' · ')));
}
