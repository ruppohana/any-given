/* L3 - NOTIFICATIONS, AND THE SPOILER RULE.
 *
 * BAR, opened before a line was written:
 *   reference/sofascore-teardown/screens/IMG_5201.PNG
 *     The iOS permission sheet fires ON TOP OF the favorites grid, mid-task, with
 *     the user halfway through typing "Arizona". Nothing on the screen behind it
 *     mentions notifications. The two buttons are `Don't Allow` and `Allow`, and
 *     the whole product's alerting is decided by a stranger's reflex.
 *   reference/sofascore-teardown/screens/IMG_5202.PNG
 *     The screen the prompt was covering: a bare search field, "Enter any team,
 *     athlete, league, or tournament name." Nothing about alerts. The prompt was
 *     unrelated to what the user was doing.
 *   reference/sofascore-teardown/screens/IMG_5203.PNG
 *     "Never miss a play" - the priming screen, with three sample alerts drawn
 *     inside a phone outline - arriving AFTER the answer. Its own samples read:
 *       "61' goal: [1] - 0 L. Modric"
 *       "Q2 started: 31 - 28"
 *       "Finished: 2 - 3 Alcaraz"
 *     A live score in every one of the three.
 *
 * TWO RULES COME OUT OF THAT, and the first one is fatal to get wrong.
 *
 * 1. EVERY NOTIFICATION IS HELD BY THE SAME DELAY AS THE FEED, OR IT CARRIES NO
 *    STATE AT ALL. Any Given is deliberately behind the television. A push that
 *    races the feed destroys the entire premise: the phone spoils the play
 *    before the app shows it. "Q2 started: 31 - 28" is the exact failure.
 *    So there are two kinds of notification in this app and only two:
 *      HELD      holdsState: true   sendAt = event + delay. May name anything.
 *      STATELESS holdsState: false  sendAt = event.        May name NOTHING.
 *    `leaks()` below is the machine that enforces the second one, at runtime,
 *    not only in the test - a stateless body that fails is REPLACED by the
 *    generic nudge before it can be sent.
 *
 * 2. PRIME FIRST, PROMPT SECOND. One `Don't Allow` is permanent and there is no
 *    second ask. So the OS prompt is fired by exactly one control on the
 *    `priming` state, after the user has read what will arrive - and "Not now"
 *    never fires it. Sofascore does this in the wrong order and IMG_5201 is what
 *    that costs.
 *
 * WEB PUSH IS NOT iOS PUSH, and the web ships first. Chrome and Firefox will ask
 * again after a dismissal; Safari on iOS will not send at all until the page has
 * been added to the Home Screen. That is a copy problem, so it is copy, on the
 * `priming` and `denied` states, keyed off `data.platform`.
 *
 * DEDUPE, AND WHY IT IS IN THIS FILE. `close_game` fires on EVERY qualifying
 * play. Measured, not assumed: 17 of them in real-bois-at-ore-260905-final.json,
 * all carrying detect.ts's key `close:4`. detect.ts emits `reason.key` for
 * exactly this and NOTHING CONSUMES IT. `plan()` does. Seventeen plays become
 * one push.
 *
 * WHERE THE SAMPLE COPY COMES FROM. Never from an example sentence. The test
 * runs the real parser and the real detector over the three captured fixtures
 * and pushes every real detection through the same copy functions the screen
 * uses. In the browser, where a .ts module cannot be imported, `alertsFromSummary`
 * reads ESPN's OWN flags - `scoringPlay`, `isTurnover`, `type.text`, `period`,
 * `clock`, `homeScore`/`awayScore`, `wallclock` - and the test asserts its key
 * set is IDENTICAL to detect.ts's on all three fixtures. It is a reader, not a
 * second detector.
 */
import { stateBlock, STATES_CSS } from '/components/states.js';
import { teamChip, TEAM_CHIP_CSS } from '/components/team-chip.js';

export const id = 'l3-notifications';
export const title = 'Notifications - the spoiler rule';
export const bar = 'reference/sofascore-teardown/screens/IMG_5203.PNG';

export const states = [
  'priming', 'prompt-pending', 'granted', 'denied',
  'preferences', 'quiet-hours', 'loading', 'offline', 'error'
];

/* ================================================================== */
/* 1 - THE GUARD                                                       */
/* ================================================================== */

/** Words that name a score, a result, or who did what. A stateless body may
 *  contain none of them. `goal` covers "field goal"; `landed`/`missed` cover the
 *  user's own call, which is a spoiler about a play just as surely as a score is. */
export const SPOILER_WORDS = [
  'touchdown', 'touchdowns', 'td', 'tds',
  'intercept', 'intercepts', 'intercepted', 'interception', 'interceptions',
  'fumble', 'fumbles', 'fumbled', 'safety', 'sack', 'sacked',
  'punt', 'punts', 'punted', 'goal', 'goals', 'kicked',
  'score', 'scores', 'scored', 'scoring', 'scoreline',
  'won', 'win', 'wins', 'winning', 'winner',
  'lost', 'lose', 'loses', 'losing', 'loss', 'loser', 'beat', 'beats', 'beaten',
  'defeat', 'defeated', 'victory', 'upset', 'blowout', 'comeback', 'collapse',
  'lead', 'leads', 'leading', 'trail', 'trails', 'trailing',
  'tie', 'tied', 'ties', 'ahead', 'behind', 'margin',
  'final', 'finished', 'over', 'ended', 'halftime',
  'point', 'points', 'yard', 'yards',
  'landed', 'lands', 'missed', 'misses', 'streak', 'record'
];

/** A score can be spelled out as easily as it can be typed. */
export const NUMBER_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen', 'twenty', 'thirty', 'forty', 'fifty',
  'sixty', 'seventy', 'eighty', 'ninety', 'hundred',
  'first', 'second', 'third', 'fourth', 'half', 'quarter', 'double', 'triple'
];

/** Multi-word forms a token scan cannot see. */
export const SPOILER_PHRASES = [
  'field goal', 'pick six', 'turnover on downs', 'one score', 'no good',
  'up by', 'down by', 'game over', 'walk off', 'in front'
];

/**
 * Everything in `text` that a stateless notification may not say.
 *
 * @param {string} text
 * @returns {string[]} the offending tokens. EMPTY MEANS SAFE TO SEND IMMEDIATELY.
 */
export function leaks(text) {
  const s = String(text == null ? '' : text);
  const found = [];
  if (/[0-9]/.test(s)) found.push('digit');
  const low = s.toLowerCase();
  for (const p of SPOILER_PHRASES) if (low.indexOf(p) >= 0) found.push(p);
  for (const w of low.split(/[^a-z']+/)) {
    if (!w) continue;
    if (SPOILER_WORDS.indexOf(w) >= 0) found.push(w);
    if (NUMBER_WORDS.indexOf(w) >= 0) found.push(w);
  }
  return Array.from(new Set(found));
}

/* ================================================================== */
/* 2 - THE COPY. This is the deliverable.                              */
/* ================================================================== */

/** The matchup, as a notification says it. Away at home, names in type, no mark. */
export function matchup(ctx) {
  return `${ctx.awayShort} at ${ctx.homeShort}`;
}

/**
 * THE STATELESS SET. Fires immediately. Names no score, no result, no player,
 * no event. Every one of these is run through `leaks()` on the way out, and the
 * test asserts the whole table is clean.
 *
 * The canonical member is `nudge`: the app is allowed to say that SOMETHING
 * happened, because "something happened" is what a person watching the game
 * already knows. It is not allowed to say what.
 */
export const STATELESS = {
  nudge: (ctx) =>
    `Something just happened in ${matchup(ctx)}. Open the app when you are ready.`,
  call_open: (ctx) =>
    `A call is open in ${matchup(ctx)}. It closes at the snap.`,
  kickoff_soon: (ctx) =>
    `${matchup(ctx)} is about to start. Your picks lock at kickoff.`,
  picks_due: () =>
    `Your picks for this week are still open. They lock when the games start.`,
  call_settled: () =>
    `Your call has settled. Open the app to see it.`,
  board_moved: () =>
    `Something changed on your pool board. Take a look when you have a minute.`,
  bank_reset: () =>
    `Your Marbles are reset for tonight. Nothing in the bank is ever for sale.`,
  connection_dropped: (ctx) =>
    `Any Given dropped its connection to ${matchup(ctx)}. Alerts still arrive.`,
  delay_on: () =>
    `Your delay is on. Any alert that names something waits for you.`
};

/** The one line that names nothing at all, not even the game. It is the floor
 *  under `notify()`: a school whose own name trips the guard - a digit, or a
 *  nickname on the list - must not push the substitution into a loop. */
export const GENERIC_SAFE = 'Something just happened. Open the app when you are ready.';

/**
 * THE HELD SET. Delayed by exactly the delay the feed is delayed by, so it lands
 * with the play rather than ahead of it. Free to name anything.
 *
 * The sentence is detect.ts's own `reason.headline` - which requirement 7.7
 * already made a human line - normalized into push copy, plus the star the
 * PARSER emitted (7.2: never re-derived here) and the score line.
 *
 * `final` IS IN THIS SET AND CANNOT LEAVE IT. "The game is over" is a spoiler
 * for a viewer who still has forty-five seconds of a one-score game left. There
 * is no stateless final.
 */
export const HELD_KINDS = [
  'touchdown', 'field_goal', 'safety', 'interception', 'fumble', 'turnover',
  'downs', 'big_play', 'red_zone', 'close_game', 'overtime',
  'call_settled', 'final'
];

/** Which held kinds carry the player. A failed fourth down should not name the
 *  receiver who caught it two yards short. */
const NAMES_THE_STAR = ['touchdown', 'big_play', 'interception', 'field_goal'];

/** detect.ts writes "Touchdown - BOIS". A push says "Touchdown, BOIS." */
function sentence(headline) {
  const s = String(headline || '')
    .replace(/\s+—\s+/g, ', ')
    /* One score separator in the app. detect.ts writes "BOIS 27 - ORE 34" for
     * its own log line; a push that sits next to a held touchdown must not use a
     * different dash from it. Typography only - no number is touched. */
    .replace(/(\d)\s+-\s+([A-Z])/g, '$1 – $2')
    .trim();
  return /[.!?]$/.test(s) ? s : s + '.';
}

/**
 * The body of a held notification, built from ONE real detection.
 * @param {{event:string, headline:string, star:{name:string}|null,
 *          score:{home:number,away:number}|null}} alert
 * @param {{homeAbbrev:string, awayAbbrev:string}} ctx
 */
export function heldBody(alert, ctx) {
  const parts = [sentence(alert.headline)];
  if (alert.star && NAMES_THE_STAR.indexOf(alert.event) >= 0) parts.push(alert.star.name + '.');
  /* detect.ts already puts the score in some headlines. Never twice. */
  if (alert.score && !/[0-9]/.test(alert.headline)) {
    parts.push(`${ctx.awayAbbrev} ${alert.score.away} – ${ctx.homeAbbrev} ${alert.score.home}`);
  }
  return parts.join(' ');
}

/** Your own call, settled. Held: the outcome of a play is the play. */
export function callSettledBody(call) {
  const sign = call.delta > 0 ? '+' : '−';
  const verb = call.landed === null ? 'was voided' : (call.landed ? 'landed' : 'missed');
  if (call.landed === null) return `Your ${call.side} call ${verb}. Your stake is back. Bank ${call.bank}.`;
  return `Your ${call.side} call ${verb}. ${sign}${Math.abs(call.delta)} Marbles. Bank ${call.bank}.`;
}

/** Full time. Held, always. */
export function finalBody(ctx, score) {
  return `Final. ${ctx.awayAbbrev} ${score.away} – ${ctx.homeAbbrev} ${score.home}.`;
}

/* ================================================================== */
/* 3 - BUILDING A `Notification`                                       */
/* ================================================================== */

/**
 * One `Notification`, exactly as `src/lib/types.ts` declares it:
 *   { kind: string, body: string, holdsState: boolean, sendAt: number }
 *
 * A stateless body that leaks NEVER LEAVES THIS FUNCTION. It is replaced by the
 * generic nudge, which is the one sentence that is safe by construction. The
 * substitution is silent to the user and loud to `plan()`, which counts it.
 *
 * @param {string} kind
 * @param {string} body
 * @param {{holdsState:boolean, at:number, delayMs:number, ctx:object}} o
 */
export function notify(kind, body, o) {
  const at = Number(o.at);
  const delayMs = Math.max(0, Number(o.delayMs) || 0);
  if (o.holdsState) return { kind, body, holdsState: true, sendAt: at + delayMs };
  let safe = body;
  if (leaks(safe).length) safe = STATELESS.nudge(o.ctx || {});
  if (leaks(safe).length) safe = GENERIC_SAFE;
  return { kind, body: safe, holdsState: false, sendAt: at };
}

/**
 * The title line a phone draws above the body. Presentation, not payload - the
 * `Notification` type has no title - but it reaches the lock screen, so it is
 * held to the same rule and the test checks it.
 */
export function notificationTitle(ctx, n) {
  return n.holdsState ? matchup(ctx) : 'Any Given…';
}

/* ================================================================== */
/* 4 - THE QUEUE. Dedupe, quiet hours, preferences.                    */
/* ================================================================== */

/** Default preference set. The three MINOR events are off: a punt is not a push. */
export const DEFAULT_PREFS = {
  touchdown: true, field_goal: true, safety: true,
  interception: true, fumble: true, turnover: true, downs: true,
  big_play: true, red_zone: false, close_game: true, overtime: true,
  punt: false, kickoff: false, fourth_down: false,
  call_settled: true, final: true,
  nudge: true, call_open: true, kickoff_soon: true, picks_due: true
};

/** 11 PM to 8 AM, local, off by default. A held alert that would land inside the
 *  window is DROPPED, never queued: an alert about a play from four hours ago
 *  spoils nothing and says nothing. Late is the product; useless is not. */
export const DEFAULT_QUIET = { on: false, startHour: 23, endHour: 8 };

function inQuiet(ms, quiet) {
  if (!quiet || !quiet.on) return false;
  const h = new Date(ms).getHours();
  return quiet.startHour <= quiet.endHour
    ? (h >= quiet.startHour && h < quiet.endHour)
    : (h >= quiet.startHour || h < quiet.endHour);
}

/**
 * Turn every real alert in a game into the notifications that would actually be
 * sent, and say what happened to the rest.
 *
 * CONSUMES `reason.key`. detect.ts has emitted it since it was written and no
 * caller has ever read it. In real-bois-at-ore, `close_game` produces 17 reasons
 * carrying one key; without this, seventeen pushes go out during the last four
 * minutes of a one-score game.
 *
 * @returns {{sent: Notification[], deduped: number, muted: number,
 *            undated: number, quieted: number, substituted: number}}
 */
export function plan(alerts, opts) {
  opts = opts || {};
  const delayMs = Math.max(0, Number(opts.delayMs) || 0);
  const prefs = Object.assign({}, DEFAULT_PREFS, opts.prefs || {});
  const quiet = Object.assign({}, DEFAULT_QUIET, opts.quiet || {});
  const ctx = opts.ctx || {};
  const seen = new Set();
  const sent = [];
  let deduped = 0, muted = 0, undated = 0, quieted = 0, substituted = 0;

  for (const a of alerts) {
    if (prefs[a.event] === false) { muted++; continue; }
    /* NO TIMESTAMP, NO PUSH - and the key is NOT claimed. One real play in
     * real-bois-at-ore carries no `wallclock`, and it is the FIRST of the 17
     * close_game reasons. Claiming the key before this check silently swallowed
     * the whole event: the one alert that matters most in a one-score fourth
     * quarter never went out, and the dedupe counter said it had worked. */
    if (a.at == null) { undated++; continue; }
    if (seen.has(a.key)) { deduped++; continue; }
    seen.add(a.key);

    const held = HELD_KINDS.indexOf(a.event) >= 0;
    const body = held ? heldBody(a, ctx) : STATELESS.nudge(ctx);
    const n = notify(a.event, body, { holdsState: held, at: a.at, delayMs, ctx });
    if (!held && n.body !== body) substituted++;
    if (inQuiet(n.sendAt, quiet)) { quieted++; continue; }
    sent.push(n);
  }
  sent.sort((x, y) => x.sendAt - y.sendAt);
  return { sent, deduped, muted, undated, quieted, substituted };
}

/* ================================================================== */
/* 5 - THE FEED READER (browser side)                                  */
/* ================================================================== */

/**
 * Real events out of a captured ESPN summary, using ESPN'S OWN FLAGS ONLY.
 *
 * This is NOT a second detector and it re-implements none of detect.ts's text
 * work - no touchdown grammar, no NO PLAY rule, no possession-per-drive. It
 * reads `scoringPlay`, `type.text`, `isTurnover`, `period`, `clock`, the two
 * scores and `wallclock`, which are fields the feed supplies.
 *
 * It exists because a browser cannot import `src/lib/detect.ts`, and the
 * screen's samples must come from a real game. `tests/l3-notifications.test.mjs`
 * asserts that its `touchdown`, `field_goal` and `close_game` KEY SETS are
 * identical to detect.ts's across all three fixtures - so the two cannot drift
 * without a test failing.
 *
 * The close-game thresholds and key format are detect.ts's published DEFAULTS
 * (`closeGameMargin: 8`, `closeGameSeconds: 300`, key `close:<quarter>`), cited
 * rather than chosen.
 */
export function alertsFromSummary(summary, teamsFile) {
  const comp = summary.header.competitions[0];
  const home = comp.competitors.find((c) => c.homeAway === 'home');
  const away = comp.competitors.find((c) => c.homeAway === 'away');
  const all = (teamsFile && teamsFile.teams) || {};
  const identity = (t) => all[t.team.id] || {
    id: t.team.id, abbrev: t.team.abbreviation, name: t.team.displayName,
    short: t.team.location, primary: null, secondary: null
  };
  const ctx = {
    gameId: summary.header.id,
    homeAbbrev: home.team.abbreviation, awayAbbrev: away.team.abbreviation,
    homeShort: home.team.location, awayShort: away.team.location,
    home: identity(home), away: identity(away),
    /* The header's own final score, not the last alert's - an alert list is not
     * guaranteed to contain the last play of the game. */
    finalScore: { home: Number(home.score), away: Number(away.score) }
  };

  const alerts = [];
  const secondsOf = (c) => {
    const m = /^(\d{1,3}):(\d{2})$/.exec((c && c.displayValue) || '');
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };

  for (const drive of summary.drives.previous || []) {
    for (const p of drive.plays || []) {
      const type = (p.type || {}).text || '';
      const text = p.text || '';
      const at = p.wallclock ? Date.parse(p.wallclock) : null;
      const score = { home: Number(p.homeScore), away: Number(p.awayScore) };
      const quarter = (p.period || {}).number || 0;
      const clock = (p.clock || {}).displayValue || '';
      const base = { at, score, quarter, clock, star: null, playId: p.id };
      const abbrev = (id) => (id === home.team.id ? ctx.homeAbbrev : ctx.awayAbbrev);
      const teamId = ((p.start || {}).team || {}).id || '';

      if (/field goal/i.test(type)) {
        const good = !/no good|blocked/i.test(text);
        alerts.push(Object.assign({}, base, {
          event: 'field_goal', key: 'fg:' + p.id,
          headline: `${good ? 'Field goal good' : 'Field goal missed'} — ${abbrev(teamId)}`
        }));
      } else if (p.scoringPlay && /\bSAFETY\b/.test(text)) {
        alerts.push(Object.assign({}, base, {
          event: 'safety', key: 'sf:' + p.id, headline: `Safety — ${abbrev(teamId)}`
        }));
      } else if (p.scoringPlay && !/extra point/i.test(type)) {
        alerts.push(Object.assign({}, base, {
          event: 'touchdown', key: 'td:' + p.id, headline: `Touchdown — ${abbrev(teamId)}`
        }));
      }
      if (p.isTurnover) {
        alerts.push(Object.assign({}, base, {
          event: 'turnover', key: 'to:' + p.id, headline: `Turnover — ${abbrev(teamId)}`
        }));
      }
      const secs = secondsOf(p.clock);
      if (quarter >= 4 && secs !== null && secs <= 300 &&
          Math.abs(score.home - score.away) <= 8) {
        alerts.push(Object.assign({}, base, {
          event: 'close_game', key: 'close:' + quarter,
          headline: `One-score game late — ${ctx.awayAbbrev} ${score.away} - ${ctx.homeAbbrev} ${score.home}`
        }));
      }
    }
  }
  alerts.sort((a, b) => (a.at || 0) - (b.at || 0));
  return { ctx, alerts };
}

/**
 * The same shape, from REAL detect.ts output. Used by the test, which can import
 * TypeScript; kept here so both sides go through one copy layer.
 * @param {Array} detections  detect.ts PlayDetection[]
 * @param {Record<string,number>} wallclock  play id -> epoch ms
 */
export function alertsFromDetections(detections, wallclock) {
  const out = [];
  for (const d of detections) {
    for (const r of d.reasons) {
      out.push({
        event: r.event, key: r.key, headline: r.headline,
        at: wallclock[d.playId] == null ? null : wallclock[d.playId],
        score: d.score, quarter: d.quarter, clock: d.clock,
        star: d.star, playId: d.playId
      });
    }
  }
  return out;
}

/* ================================================================== */
/* 6 - PREVIEW DATA. Real games only.                                  */
/* ================================================================== */

/** The screen-flow document's own figure for a couch viewer's lag. The delay is
 *  a user-set slider and this screen renders whatever it is handed, zero
 *  included - it never decides one. */
const PREVIEW_DELAY_MS = 45000;

export async function previewData(fixtures, state) {
  const games = [];
  for (const name of fixtures.games) {
    const summary = await fixtures.load(name);
    const read = alertsFromSummary(summary, fixtures.teams);
    const p = plan(read.alerts, { delayMs: PREVIEW_DELAY_MS, ctx: read.ctx });
    games.push({ name, ctx: read.ctx, raw: read.alerts, plan: p });
  }
  /* The two identity states no fixture team is in. Real rows out of the real
   * 760-team file, so the game list is drawn against a yellow primary and
   * against a team with no captured color at all. */
  /* THE FEATURED GAME IS THE ONE THE RULE MATTERS MOST IN, not the first on the
   * list. A one-score fourth quarter is where a racing push does its damage, and
   * it is the only one of the three that exercises the dedupe at all: 17
   * qualifying plays in real-bois-at-ore, one alert. Chosen by the data, so it
   * moves if the fixtures do. */
  games.sort((a, b) => {
    const cg = (x) => x.raw.filter((r) => r.event === 'close_game').length;
    return cg(b) - cg(a);
  });
  const all = Object.values(fixtures.teams.teams);
  const yellow = all.find((t) => /^(f|e)[0-9a-f]{1}(c|d|e)/i.test(t.primary || '') && t.secondary);
  const none = all.find((t) => !t.primary || t.primary === '000000');
  return {
    delayMs: PREVIEW_DELAY_MS,
    platform: 'web',
    games,
    hardTeams: { yellow: yellow || null, none: none || null },
    quiet: { on: state === 'quiet-hours', startHour: 23, endHour: 8 },
    prefs: DEFAULT_PREFS
  };
}

/* ================================================================== */
/* 7 - RENDER                                                          */
/* ================================================================== */

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function delayLabel(ms) {
  if (!ms) return 'off';
  return ms % 60000 === 0 ? (ms / 60000) + ' min' : Math.round(ms / 1000) + 's';
}

function timeLabel(ms) {
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** One notification, drawn as a phone draws it: app mark, title, body, badge.
 *  The mark is the wordmark's own ellipsis - never a team logo, never an image. */
function alertCard(ctx, n, opts) {
  opts = opts || {};
  const card = el('div', 'l3-alert card');
  card.dataset.holds = String(n.holdsState);

  const mark = el('span', 'l3-mark', '…');
  mark.setAttribute('aria-hidden', 'true');
  card.appendChild(mark);

  const body = el('div', 'l3-alert-main');
  const head = el('div', 'l3-alert-head');
  head.appendChild(el('span', 'l3-alert-title', notificationTitle(ctx, n)));
  head.appendChild(el('span', 'l3-alert-time num', timeLabel(n.sendAt)));
  body.appendChild(head);
  body.appendChild(el('p', 'l3-alert-body', n.body));
  if (opts.teams !== false) {
    const chips = el('div', 'l3-alert-teams');
    chips.appendChild(teamChip(ctx.away, { size: 16, adjacentTo: ctx.home }));
    chips.appendChild(teamChip(ctx.home, { size: 16, adjacentTo: ctx.away }));
    body.appendChild(chips);
  }
  card.appendChild(body);

  const badge = el('span', n.holdsState ? 'l3-badge l3-badge-held num' : 'l3-badge l3-badge-now',
    n.holdsState ? 'held +' + delayLabel(opts.delayMs) : 'now');
  badge.title = n.holdsState
    ? 'Delayed by exactly the delay your feed is on, so it lands with the play'
    : 'Sent immediately, and it names nothing';
  card.appendChild(badge);
  return card;
}

function ruleBlock(data) {
  const box = el('div', 'l3-rule card');
  box.appendChild(el('p', 'l3-rule-lead',
    data.delayMs
      ? `You are watching ${delayLabel(data.delayMs)} behind. So is every alert that names anything.`
      : 'Your delay is off, so alerts arrive with the feed - which is the same instant.'));
  const list = el('ul', 'l3-rule-list');
  const a = el('li');
  a.appendChild(el('span', 'l3-badge l3-badge-held num', 'held'));
  a.appendChild(el('span', null, 'Names a score, a play or a player. Waits exactly as long as you do.'));
  const b = el('li');
  b.appendChild(el('span', 'l3-badge l3-badge-now', 'now'));
  b.appendChild(el('span', null, 'Arrives immediately, and names nothing at all.'));
  list.append(a, b);
  box.appendChild(list);
  box.appendChild(el('p', 'l3-rule-foot',
    'There is no third kind. Full time is held too - "the game is over" spoils a one-score finish just as fast as the score does.'));
  return box;
}

const PLATFORM_NOTE = {
  web: 'Your browser will ask next. If you dismiss it, most browsers will ask again later.',
  ios: 'On iPhone, add Any Given to your Home Screen first - Safari sends nothing from a tab. Then iOS asks once, and once only.'
};

function primaryButton(label) {
  const b = el('button', 'l3-btn l3-btn-primary', label);
  b.type = 'button';
  return b;
}

function secondaryButton(label) {
  const b = el('button', 'l3-btn', label);
  b.type = 'button';
  return b;
}

function samples(data, root) {
  const g = data.games[0];
  const list = el('div', 'l3-samples');
  /* Three real alerts out of a real game: one held score, one held late-game
   * line that seventeen plays collapsed into, and the stateless nudge. */
  const held = g.plan.sent.filter((n) => n.holdsState);
  const close = g.plan.sent.find((n) => n.kind === 'close_game');
  const shown = [];
  for (const n of [held[0], close, held[held.length - 1]]) {
    if (n && shown.indexOf(n) < 0 && shown.length < 2) shown.push(n);
  }
  for (const n of shown) list.appendChild(alertCard(g.ctx, n, { delayMs: data.delayMs }));
  const nudge = notify('nudge', STATELESS.nudge(g.ctx),
    { holdsState: false, at: shown.length ? shown[0].sendAt : Date.now(), delayMs: data.delayMs, ctx: g.ctx });
  list.appendChild(alertCard(g.ctx, nudge, { delayMs: data.delayMs }));
  root.appendChild(list);
  const cap = el('p', 'l3-cap',
    `Real alerts from ${matchup(g.ctx)}, September 5. Sofascore's own samples in the same place read "Q2 started: 31 - 28".`);
  root.appendChild(cap);
}

function prefRow(data, kind, label, held, sample) {
  const row = el('div', 'l3-pref');
  const lab = el('label', 'l3-pref-label');
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'l3-check';
  cb.checked = data.prefs[kind] !== false;
  lab.appendChild(cb);
  const txt = el('span', 'l3-pref-text');
  txt.appendChild(el('span', 'l3-pref-name', label));
  txt.appendChild(el('span', 'l3-pref-sample', sample));
  lab.appendChild(txt);
  row.appendChild(lab);
  row.appendChild(el('span', held ? 'l3-badge l3-badge-held num' : 'l3-badge l3-badge-now',
    held ? 'held' : 'now'));
  return row;
}

export function render(root, data, state) {
  root.innerHTML = '';
  root.classList.add('scr-l3-notifications');
  const style = document.createElement('style');
  style.textContent = [STATES_CSS, TEAM_CHIP_CSS].join('\n');
  root.appendChild(style);

  if (state === 'loading') {
    root.appendChild(stateBlock('loading', { rows: 3, body: 'Checking what your browser already decided…' }));
    return;
  }
  if (state === 'error') {
    root.appendChild(stateBlock('error', {
      title: 'Alert settings did not load',
      body: 'Nothing changed. Your existing alerts are unaffected and still held by your delay.',
      action: { label: 'Try again' }
    }));
    return;
  }
  if (state === 'offline') {
    root.appendChild(stateBlock('offline', {
      title: 'No connection to the game',
      body: 'One server polls the feed and your phone holds one connection. That connection dropped - and alerts are the fallback, not the casualty. They arrive from the server, still held by your delay.',
      since: Date.now() - 62000,
      action: { label: 'Reconnect' }
    }));
    const n = el('p', 'l3-note',
      'Nothing you have called is at risk. A call already placed settles on the server whether this phone is listening or not.');
    root.appendChild(n);
    return;
  }

  const g = data.games[0];
  const h = el('h1', 'l3-h');
  root.appendChild(h);
  const sub = el('p', 'l3-sub');
  root.appendChild(sub);

  if (state === 'priming') {
    h.textContent = 'Alerts that do not spoil it';
    sub.textContent = 'Read this before we ask. We only get to ask once.';
    root.appendChild(ruleBlock(data));
    samples(data, root);
    const actions = el('div', 'l3-actions');
    const yes = primaryButton('Turn on alerts');
    yes.dataset.firesPrompt = 'true';
    const no = secondaryButton('Not now');
    no.dataset.firesPrompt = 'false';
    actions.append(yes, no);
    root.appendChild(actions);
    root.appendChild(el('p', 'l3-note',
      '"Not now" does not ask your browser anything, so nothing gets decided by accident. ' + PLATFORM_NOTE[data.platform || 'web']));
    return;
  }

  if (state === 'prompt-pending') {
    h.textContent = 'Your browser is asking now';
    sub.textContent = 'The question came from you, not from us, and this screen is what it is on top of.';
    const wait = el('div', 'l3-pending card');
    wait.appendChild(el('p', 'l3-pending-lead', 'Answer the box at the top of the window.'));
    wait.appendChild(el('p', 'l3-pending-body',
      'If nothing appeared, your browser has already answered for you - alerts are blocked at the site level and only you can change that.'));
    wait.appendChild(el('p', 'l3-pending-body',
      'Whatever you choose, the app behind this works exactly the same. Alerts are a convenience, never a gate.'));
    root.appendChild(wait);
    root.appendChild(ruleBlock(data));
    return;
  }

  if (state === 'granted') {
    h.textContent = 'Alerts are on';
    sub.textContent = `${g.plan.sent.length} would have reached you during ${matchup(g.ctx)}.`;
    const summary = el('div', 'l3-counts card');
    const rows = [
      ['Sent', g.plan.sent.length, 'one per real moment'],
      ['Collapsed', g.plan.deduped, 'repeats of a moment you were already told about'],
      ['Muted', g.plan.muted + g.plan.undated, 'kinds you switched off, and plays the feed gave no time for']
    ];
    for (const [k, v, why] of rows) {
      const r = el('div', 'l3-count');
      r.appendChild(el('span', 'l3-count-n num', String(v)));
      const t = el('span', 'l3-count-t');
      t.appendChild(el('b', null, k));
      t.appendChild(el('span', 'l3-count-why', why));
      r.appendChild(t);
      summary.appendChild(r);
    }
    root.appendChild(summary);
    root.appendChild(ruleBlock(data));
    samples(data, root);
    const actions = el('div', 'l3-actions');
    actions.append(secondaryButton('Send me a test alert'), secondaryButton('Choose what arrives'));
    root.appendChild(actions);
    return;
  }

  if (state === 'denied') {
    h.textContent = 'Alerts are off, and we cannot ask again';
    sub.textContent = 'That answer is permanent from our side. It only unlocks from yours.';
    const what = el('div', 'l3-denied card');
    what.appendChild(el('p', 'l3-denied-lead',
      'Nothing in Any Given is behind this. The delay, the calls, the board and the pool all work exactly as they did a minute ago.'));
    const ul = el('ul', 'l3-denied-list');
    for (const line of [
      'While the app is open, alerts appear in the app instead - held by the same delay.',
      'A call you have placed settles whether you are looking or not.',
      'Your picks lock at kickoff with or without a reminder.'
    ]) ul.appendChild(el('li', null, line));
    what.appendChild(ul);
    root.appendChild(what);

    const how = el('div', 'l3-denied card');
    how.appendChild(el('p', 'l3-denied-lead', 'If you want them back:'));
    const steps = el('ol', 'l3-denied-list');
    const forWeb = [
      'Tap the icon to the left of the address bar.',
      'Set Notifications to Allow.',
      'Reload this page.'
    ];
    const forIos = [
      'Add Any Given to your Home Screen from the Share menu.',
      'Open it from the Home Screen icon, not from Safari.',
      'Settings › Notifications › Any Given.'
    ];
    for (const line of (data.platform === 'ios' ? forIos : forWeb)) steps.appendChild(el('li', null, line));
    how.appendChild(steps);
    root.appendChild(how);
    root.appendChild(el('p', 'l3-note',
      'We will not ask again, and there is no banner about this on any other screen. One refusal is an answer, not the start of a negotiation.'));
    return;
  }

  if (state === 'preferences' || state === 'quiet-hours') {
    h.textContent = state === 'quiet-hours' ? 'Quiet hours' : 'What arrives';
    sub.textContent = state === 'quiet-hours'
      ? 'Between these hours nothing arrives at all.'
      : 'Every line below is the copy that actually gets sent.';

    if (state === 'quiet-hours') {
      const q = el('div', 'l3-quiet card');
      const row = el('div', 'l3-quiet-row');
      for (const [label, val] of [['From', data.quiet.startHour], ['Until', data.quiet.endHour]]) {
        const f = el('label', 'l3-quiet-field');
        f.appendChild(el('span', 'l3-quiet-label', label));
        const sel = document.createElement('select');
        sel.className = 'l3-select num';
        for (let i = 0; i < 24; i++) {
          const o = document.createElement('option');
          o.value = String(i);
          o.textContent = (i % 12 === 0 ? 12 : i % 12) + (i < 12 ? ' AM' : ' PM');
          if (i === val) o.selected = true;
          sel.appendChild(o);
        }
        f.appendChild(sel);
        row.appendChild(f);
      }
      q.appendChild(row);
      q.appendChild(el('p', 'l3-quiet-note',
        'A held alert that would land inside the window is dropped, never saved for the morning. Being late is this app’s whole idea; being four hours late is just noise.'));
      root.appendChild(q);
    }

    root.appendChild(ruleBlock(data));

    const list = el('div', 'l3-prefs card');
    /* NOT ONE OF THESE SAMPLES IS WRITTEN BY HAND. Each is the body that was
     * actually generated for a real play in one of the three captured games -
     * looked up across all of them, because no single game contains every kind.
     * A hand-written example on this screen would be the exact thing the brief
     * says is wrong with the reference: sample copy nobody ever had to send. */
    const anywhere = (kind) => {
      for (const game of data.games) {
        const hit = game.plan.sent.find((n) => n.kind === kind);
        if (hit) return { n: hit, ctx: game.ctx };
      }
      return null;
    };
    list.appendChild(el('p', 'l3-prefs-head', 'Held — waits for your delay'));
    for (const [kind, label] of [['touchdown', 'Scores'], ['field_goal', 'Kicks'],
                                 ['turnover', 'Turnovers'], ['close_game', 'Close late']]) {
      const hit = anywhere(kind);
      if (hit) list.appendChild(prefRow(data, kind, label, true, hit.n.body));
    }
    list.appendChild(prefRow(data, 'call_settled', 'Your calls', true,
      callSettledBody({ side: 'pass', landed: true, delta: 25, bank: 118 })));
    list.appendChild(prefRow(data, 'final', 'Full time', true, finalBody(g.ctx, g.ctx.finalScore)));

    list.appendChild(el('p', 'l3-prefs-head', 'Now — names nothing, so it cannot wait'));
    list.appendChild(prefRow(data, 'call_open', 'A call is open', false, STATELESS.call_open(g.ctx)));
    list.appendChild(prefRow(data, 'nudge', 'Something happened', false, STATELESS.nudge(g.ctx)));
    list.appendChild(prefRow(data, 'kickoff_soon', 'Kickoff', false, STATELESS.kickoff_soon(g.ctx)));
    list.appendChild(prefRow(data, 'picks_due', 'Picks still open', false, STATELESS.picks_due()));
    root.appendChild(list);

    const dedupe = el('p', 'l3-note',
      `One alert per moment, not one per play. ${g.raw.filter((a) => a.event === 'close_game').length} plays in ` +
      `${matchup(g.ctx)} qualified as a one-score finish; ${g.plan.sent.filter((n) => n.kind === 'close_game').length} alert went out.`);
    root.appendChild(dedupe);

    /* THE GAME LIST, drawn against the identities that break a two-color chip.
     * Every row here is a real team out of fixtures/teams.json. */
    const gl = el('div', 'l3-games card');
    gl.appendChild(el('p', 'l3-prefs-head', 'Which games'));
    /* EVERY ROW IS A <label>, so the 44px row is the tap target rather than the
     * 22px box inside it. A checkbox on its own is a 22px target and fails. */
    for (const game of data.games) {
      const r = el('label', 'l3-game');
      const chips = el('span', 'l3-game-chips');
      chips.appendChild(teamChip(game.ctx.away, { size: 18, adjacentTo: game.ctx.home }));
      chips.appendChild(teamChip(game.ctx.home, { size: 18, adjacentTo: game.ctx.away }));
      r.appendChild(chips);
      r.appendChild(el('span', 'l3-game-name', matchup(game.ctx)));
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.className = 'l3-check'; cb.checked = true;
      r.appendChild(cb);
      gl.appendChild(r);
    }
    for (const t of [data.hardTeams.yellow, data.hardTeams.none]) {
      if (!t) continue;
      const r = el('label', 'l3-game');
      const chips = el('span', 'l3-game-chips');
      chips.appendChild(teamChip(t, { size: 18 }));
      r.appendChild(chips);
      r.appendChild(el('span', 'l3-game-name', t.short || t.name));
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.className = 'l3-check';
      r.appendChild(cb);
      gl.appendChild(r);
    }
    root.appendChild(gl);
    root.appendChild(el('p', 'l3-note',
      'The last two rows are teams with a yellow primary and with no captured color at all - 401 of the 760 schools on file are in the second state.'));
    return;
  }
}
