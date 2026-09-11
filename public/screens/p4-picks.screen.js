/* P4 - MY PICKS. What did I pick, what is locked, what is still editable, what did it
 * score. The screen someone opens on Saturday morning.
 *
 * ============================================================================
 * 🔴 THIS SCREEN HAS NO BAR AND `export const bar` IS DELIBERATELY ABSENT.
 *
 * The preview index will print NO BAR DECLARED in red for this row. That line is
 * correct and it is left standing on purpose. P4 returned COULD NOT CLOSE at B0
 * because no captured pick'em on disk shows a my-picks screen, and the position has
 * not improved since - it has been VERIFIED WORSE:
 *
 *   reference/officepool-teardown/README.md claims eleven screens and says
 *   "It closes four of the five pool/shell screens that had no bar ... P1, P4, P6
 *   and S6 ... are dispatchable because of this capture", naming
 *   `OP-dashboard-131-games-week2.png` and `OP-week-recap-matrix-gametime-lock.png`
 *   as P4's.
 *
 *   NEITHER FILE IS ON DISK. `reference/officepool-teardown/screens/` holds exactly
 *   two files - `OP-cold-entry-signed-out-393.png` and `OP-marketing-home-393.png`.
 *   The screens are gitignored, the README is the tracked artifact, and the README
 *   is describing captures that did not survive. Listed, not read.
 *
 *   `reference/parlay-teardown/` is the same failure one step further along: one
 *   file, named `screens$n-393.png` - an unexpanded shell variable - and it is a
 *   BLANK WHITE 393x2600 PNG. There is no README. So the parlay's bar is not
 *   missing, it is a capture that failed and was filed anyway.
 *
 * SO EVERY CHOICE BELOW THAT A COMP WOULD HAVE SETTLED IS NAMED IN THE RETURN AS A
 * CHOICE. This file does not claim to close against anything.
 * ============================================================================
 *
 * WHAT WAS ACTUALLY OPENED AND LOOKED AT, and what came out of each:
 *
 *  1. reference/cbs-pickem-teardown/screens/CBS-picks-week1-15-games-spreads-crowd-desktop.png
 *     OPENED. The row anatomy, per side, outward: logo, NAME IN CAPS, record, crowd %,
 *     spread box, [padlock], spread box, crowd %, record, NAME, logo - with the score
 *     line ABOVE the card as `10  Final  48`, the loser's figure in gray and the
 *     winner's in black. The whole card is desaturated once locked and THE PADLOCK IS
 *     THE CENTER COLUMN.
 *       TAKEN: the score line reading away-then-home with the loser dimmed; the
 *              spread rendered as a small inboard figure next to the team it belongs
 *              to; gray as the lock signal rather than a badge.
 *       NOT TAKEN, and this is the whole reason P4 is not P2: CBS's row is SYMMETRIC
 *              because the pick has not been made yet. On this screen it HAS been.
 *              A symmetric row on a made pick spends half its width drawing the side
 *              you did not take. So this row is deliberately asymmetric - your team
 *              loud on line 1, the opponent quiet on line 2 - and that is a choice a
 *              comp would have settled.
 *       AND THE COUNTER-EXAMPLE IS IN THE SAME FILE: the bar reads `0/15 Picks` while
 *              every game underneath it reads `Final`. That is the none-picked state
 *              crossed with the final state, shipped, and it says nothing at all -
 *              a dead entry with no explanation of what it cost or what to do. It is
 *              what `none-picked` on this screen is written against.
 *
 *  2. reference/officepool-teardown/README.md
 *     READ. Two things survive from it that do not depend on the missing images:
 *       - "A dash, not a zero, for absent data" - `Avg Picks / Member / Week` renders
 *         an em dash. Empty and zero are different facts and this screen keeps them
 *         apart: no picks resolved is a dash, nought points scored is a nought.
 *       - The game-time lock: "players only see each other's picks after each game
 *         locks." OURS IS THE OTHER RULE - the pool's own split appears after YOU
 *         pick - and it is settled in fmt.js and pool.ts, so this screen consumes it
 *         and does not relitigate it. Recorded because the two are not the same and
 *         theirs leaks less.
 *
 *  3. reference/armchair-quarterback-teardown/screens/AQB-LIVE-leaderboard-real-scores.png
 *     Not opened here - P5 measured it and its finding is the one this screen obeys:
 *     the pinned figure read `0 pts` while the list bottomed out at 11,940. A large
 *     figure that is nought every Saturday morning says nothing. SO THE HEADLINE
 *     FIGURE ON THIS SCREEN IS NOT THE POINTS ALONE. It is two figures of equal size:
 *     what you have scored, and what you can still change. On Saturday morning the
 *     second one is the whole subject and the first one is nought.
 *
 * 🔴 THE POOL SCORES IN POINTS. The live layer stakes something else, on its own
 *    screens, and the two never meet and are never summed. The word for that other
 *    balance does not appear in this file or its stylesheet, and no figure here is
 *    ever added to one.
 *
 * 🔴 THIS SCREEN DECIDES NOTHING ABOUT SCORING, LOCKING OR VOIDING. Every one of
 *    those is `src/lib/pool.ts`, imported and called - `pickState`, `isPickEditable`,
 *    `resolveGame`, `voidReason`, `pickPointsFor`, `resolveParlay`, `scoreWeek`. The
 *    preview harness strips types and serves the real module to the browser, so what
 *    renders is the shipped scorer's output and not a snapshot of it. The parlay's
 *    explanatory sentence is `ParlayResolution.note`, printed VERBATIM - the module
 *    that owns the void path owns the words for it too.
 *
 * Types: SlateGame, Pick, Parlay, PickState, PickSide, from src/lib/types.ts. Not
 * re-declared here - a browser module cannot import a .ts type, so the shapes are
 * honored by name and nothing is forked.
 */
import { teamChip, TEAM_CHIP_CSS } from '/components/team-chip.js';
import { stateBlock, STATES_CSS } from '/components/states.js';
import { pageHeader } from '/components/header.js';
import { crowdLabel, crowdSuppression, progress } from '/components/fmt.js';
import {
  pickState, isPickEditable, voidReason,
  resolveParlay, scoreWeek,
  PARLAY_MIN_LEGS, PARLAY_MAX_LEGS
} from '/src/lib/pool.ts';

export const id = 'p4-picks';
export const title = 'My picks';
/* No `bar`. See the header. Do not add one to quiet the index. */

/** Every state is a route.
 *
 *  `none-picked` IS this screen's empty state and uses stateBlock('empty') - the
 *  contract requires an empty route, and on a my-picks screen "empty" has exactly
 *  one meaning: you have not picked anything. A second empty (no games in scope at
 *  all) belongs to the slate, which owns the scope. */
export const states = [
  'ready', 'none-picked', 'partial', 'all-locked', 'final',
  'loading', 'offline', 'error'
];

/* ------------------------------------------------------------------ pure helpers
 * Nothing below this line touches the DOM or an imported binding, so tests/p4-picks
 * can load this module with its import lines stripped and exercise it in Node. */

export const MIN = 60000;
export const HOUR = 3600000;
export const DAY = 86400000;

/** How long a game stays `in_progress` before it is final. A college game is about
 *  three and a half hours wall-clock, which is the only reason this number exists:
 *  the preview drives status off ONE clock so every route is the same week seen at a
 *  different hour, rather than four datasets that can disagree with each other. */
export const LIVE_WINDOW_MS = 3.5 * HOUR;

/** The remaining edit window, in words. THE POINT OF THIS SCREEN.
 *  POOL-SCREENS P4: "the edit deadline stated per pick rather than implied by a lock
 *  icon." A padlock says closed. It never says how long you have. */
export function remainingLabel(ms) {
  if (ms == null) return null;
  if (ms <= 0) return null;
  if (ms < MIN) return 'under a minute';
  if (ms < HOUR) return Math.floor(ms / MIN) + 'm';
  if (ms < DAY) {
    const h = Math.floor(ms / HOUR);
    const m = Math.floor((ms % HOUR) / MIN);
    return m ? h + 'h ' + m + 'm' : h + 'h';
  }
  const d = Math.floor(ms / DAY);
  const h = Math.floor((ms % DAY) / HOUR);
  return h ? d + 'd ' + h + 'h' : d + 'd';
}

/** Three steps, never a ramp - the same argument the confidence chips are built on.
 *  `soon` is the only one that reaches for the accent, and it is the only one that
 *  changes what you do next.
 *
 *  🔴 THE MIDDLE BOUNDARY IS SIX HOURS AND IT WAS TWELVE UNTIL IT WAS LOOKED AT. At
 *  twelve, a Saturday-morning route produced twenty-two `near` rows, one `far` and no
 *  `soon` at all - a three-step scale rendering as one step, which is a fixed scale
 *  quietly collapsed. Six hours is also the honest reading of the words: `far` is
 *  later today, `near` is the next few hours, `soon` is act now. */
export function urgencyOf(ms) {
  if (ms == null || ms <= 0) return 'closed';
  if (ms < HOUR) return 'soon';
  if (ms < 6 * HOUR) return 'near';
  return 'far';
}

export function timeLabel(ms) {
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
export function dayKeyOf(ms) {
  const d = new Date(ms);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
export function dayLabel(ms) {
  return new Date(ms).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

/** The status a game has AT A GIVEN MOMENT. The preview's four live routes are one
 *  week at four clocks, so status cannot be a stored field - it is derived here and
 *  every route agrees with every other one by construction.
 *
 *  🔴 A GAME IN PROGRESS CARRIES NO SCORE ON THIS SCREEN. Two of the games here are
 *  real captures and their only real scores are FINAL ones; inventing a plausible
 *  half-time score is exactly the shape `_make.py` got away with. So `in_progress`
 *  says Live and nothing else, and that is a stated limitation rather than a design. */
export function statusAt(spec, now) {
  if (spec.voidAt != null && now >= spec.voidAt) return 'void';
  /* 🔴 `lagMs` IS THE `locked` ROW STATE'S ONLY ROUTE, AND IT WAS MISSING UNTIL THE
   * routes were counted in the browser: won, lost, void, in_progress and picked were
   * all drawn and `locked` was drawn nowhere, because a game that has kicked went
   * straight to in_progress in every route. A state with no route is a state nobody
   * ever draws - P2 paid for that lesson with an entirely undrawn `lost`.
   *
   * And it is not a contrivance. `pickState` returns `locked` for exactly one real
   * condition: the kickoff has passed and the feed has not moved the game yet. That
   * is minutes of every Saturday, it is when a user is most likely to be looking, and
   * `isPickEditable` correctly refuses the edit throughout it - the pick is shut on
   * the clock, not on the feed. */
  if (now < spec.kickoffUtc + (spec.lagMs || 0)) return 'scheduled';
  if (now < spec.kickoffUtc + LIVE_WINDOW_MS) return 'in_progress';
  return 'final';
}

/** A spec plus a clock is a SlateGame. Scores appear only when the clock has reached
 *  them - declining to show data the clock has not reached is what a real slate does. */
export function gameAt(spec, now) {
  const status = statusAt(spec, now);
  const settled = status === 'final';
  return {
    id: spec.id,
    week: spec.week,
    kickoffUtc: spec.kickoffUtc,
    home: spec.home,
    away: spec.away,
    spread: spec.spread,
    status,
    homeScore: settled ? spec.homeScore : null,
    awayScore: settled ? spec.awayScore : null
  };
}

/** Margin against the spread FROM ONE SIDE'S POINT OF VIEW. Positive covered,
 *  negative missed, exactly nought is the push - which leaves through the one void
 *  path and is not a result.
 *
 *  🔴 THIS EXISTS BECAUSE OF A REAL CAPTURED GAME. Oregon beat Boise State 34-27 and
 *  the DraftKings line in the fixture is -24.5, so a pick on Oregon in an
 *  against-the-spread pool LOST by 17.5 while the team WON by 7. Without this clause
 *  on the row, that reads as a bug in the app. */
export function coverMargin(game, side) {
  if (game.spread == null || game.homeScore == null || game.awayScore == null) return null;
  const m = game.homeScore + game.spread - game.awayScore;
  return side === 'home' ? m : -m;
}

export function half(n) {
  const v = Math.abs(n);
  return v % 1 === 0 ? String(v) : v.toFixed(1);
}

export function coverText(game, side) {
  const m = coverMargin(game, side);
  if (m == null) return null;
  if (m === 0) return 'Landed exactly on the line';
  return (m > 0 ? 'Covered by ' : 'Missed by ') + half(m);
}

/** The spread as the number belonging to ONE side. Stored as the home number, ESPN's
 *  convention: negative means home is favored. Rendered only when the pool is
 *  against-the-spread, and only ever as a number on a game. */
export function spreadText(spread, side) {
  if (spread == null) return null;
  const v = side === 'home' ? spread : -spread;
  if (v === 0) return 'PK';
  return (v > 0 ? '+' : '−') + half(v);
}

/** The pool's own split, as a share, for fmt.crowdLabel. Crowd is stored as COUNTS,
 *  which is pool.ts's shape and the only one that can be updated when a pick moves. */
export function crowdShare(crowd, side) {
  if (!crowd || !crowd.n) return null;
  return crowd[side] / crowd.n;
}

/** Moving your pick moves the pool's split by one. It is your own vote.
 *
 *  🔴 AND IT CAN FLIP SUPPRESSION LIVE, which is the whole reason this is modelled as
 *  counts rather than as a frozen percentage: leave a side where you were the second
 *  of two, and the one person left behind becomes a minority of exactly one - so the
 *  figure correctly disappears for that game. Watch it happen on the `ready` route. */
export function swapCrowd(crowd, from, to) {
  if (!crowd || from === to) return crowd;
  const out = { home: crowd.home, away: crowd.away, n: crowd.n };
  if (from && out[from] > 0) out[from] -= 1;
  if (to) out[to] += 1;
  return out;
}

/** Kickoff order, grouped by day. ONE HEADER PER GROUP, NEVER ONE PER ROW - Sofascore
 *  pays a full competition header 131 times and gets four fixtures a screen for it. */
export function groupsOf(games) {
  const days = new Map();
  for (const g of games.slice().sort((a, b) => a.kickoffUtc - b.kickoffUtc)) {
    const k = dayKeyOf(g.kickoffUtc);
    if (!days.has(k)) days.set(k, { key: k, label: dayLabel(g.kickoffUtc), first: g.kickoffUtc, games: [] });
    days.get(k).games.push(g);
  }
  return [...days.values()].sort((a, b) => a.first - b.first);
}

/* ------------------------------------------------------------------ preview data
 *
 * 🔴 WHAT IS REAL AND WHAT IS NOT. Read this before believing a number on the screen.
 *
 * REAL, out of fixtures/ and nowhere else:
 *   - 760 team identities. Every team named below is looked up by its real id, so the
 *     colors, the nulls and the near-identical pairs are the captured file's.
 *   - THREE COMPLETE GAMES, with their real ids, real kickoff times, real final
 *     scores and their real DraftKings spreads read out of the fixture:
 *         UTEP  0 at Oklahoma   51   Fri 5:00pm   line -40.5  -> covered by 10.5
 *         Ball  3 at Ohio State 56   Sat 9:30am   line -50.5  -> covered by 2.5
 *         Boise 27 at Oregon    34   Sat 12:30pm  line -24.5  -> MISSED by 17.5
 *     The third one is the most valuable object in this file: a team that won by
 *     seven and lost the pick by seventeen and a half. It is real, it is captured,
 *     and it is the reason the row carries a cover clause.
 *
 * NOT REAL, and named here rather than buried:
 *   - THE POOL AND THE PICKS ARE SYNTHETIC. Nothing in fixtures/ contains a pool, a
 *     member, a pick, a crowd split or a parlay, because no pool has ever been played.
 *     Fourteen members, thirty-one picks and every crowd count below is view data for
 *     a preview route.
 *   - Every pairing except the three above. Real teams, synthetic opponents, synthetic
 *     kickoffs, synthetic finals. A real week is a capture job, not a file this piece
 *     may write.
 *   - The slate size, 131, is the one number carried over from a measurement: Office
 *     Pool reported `131 Games This Week` for week 2 of this same season. Only the 31
 *     picked games exist as objects here; 131 is what the progress line counts against.
 */

/* SIX COLOR PROBES - EVERY PAIR OF NAVY / YELLOW / NULL, NAVY ON NAVY INCLUDED, and
 * every id verified against fixtures/teams.json rather than taken on trust. They are
 * placed on the Thursday and Friday so they sit at the TOP of a kickoff-ordered list,
 * where the two chips of a row are eighteen pixels apart and a clash cannot hide. */
const PROBES = [
  { away: '2', home: '87' },     /* Auburn 0c2340 v Notre Dame 0c2340 - IDENTICAL navy */
  { away: '25', home: '9' },     /* California 041e42 v Arizona St ffc627 - navy on yellow */
  { away: '6', home: '11' },     /* South Alabama 00205b v Colorado Mesa null */
  { away: '119', home: '338' },  /* Towson ffc229 v Kennesaw St fdbb30 - near-identical yellow */
  { away: '63', home: '70' },    /* Buena Vista feba12 v Idaho null */
  { away: '32', home: '49' }     /* Carroll (WI) null v Dubuque null - NULL ON NULL */
];

function lcg(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

function at(sat, dayOffset, h, m) {
  const d = new Date(sat.getTime() + dayOffset * DAY);
  d.setHours(h, m || 0, 0, 0);
  return d.getTime();
}

/** One captured ESPN game, as a spec. Nothing invented: id, kickoff, both team ids,
 *  both final scores and the DraftKings line all come out of the fixture. */
function specFromFixture(raw, byId) {
  const c = raw.header.competitions[0];
  const home = c.competitors.find((x) => x.homeAway === 'home');
  const away = c.competitors.find((x) => x.homeAway === 'away');
  const dk = (raw.pickcenter || []).find((p) => p.provider && /draft/i.test(p.provider.name));
  return {
    id: c.id,
    week: 2,
    kickoffUtc: Date.parse(c.date),
    home: byId[home.team.id],
    away: byId[away.team.id],
    spread: dk && dk.spread != null ? Number(dk.spread) : null,
    homeScore: Number(home.score),
    awayScore: Number(away.score),
    voidAt: null,
    real: true
  };
}

/** The four clocks. ONE WEEK, FOUR MOMENTS - not four datasets. Every route below is
 *  the same thirty-one picks seen at a different hour, which is what makes the state
 *  machine the thing under test rather than four hand-written arrays that can quietly
 *  disagree with each other. */
function clockFor(state, sat) {
  if (state === 'partial') return at(sat, 0, 13, 15);
  if (state === 'all-locked') return at(sat, 0, 21, 0);
  if (state === 'final') return at(sat, 1, 1, 0);
  /* 9:00 on the Saturday, and the half hour matters: the first real capture kicks at
   * 9:30, so the default route carries a pick with THIRTY MINUTES LEFT on it. All
   * three urgency steps are on one screen because of that half hour, and at 8:00 none
   * of them were. */
  return at(sat, 0, 9, 0);           /* ready, none-picked, loading, offline, error */
}

/* 🔴 SPORT-AWARE, like the slate and the standings. Jason, 2026-09-08: "After I
 * pick nfl. Than slate pics and standings should be nfl, right?" */
function chosenSport() {
  try {
    const v = JSON.parse(localStorage.getItem('ag.sport'));
    return v === 'nfl' ? 'nfl' : 'college-football';
  } catch { return 'college-football'; }
}

/* 🔴 THE NFL WEEK IS REAL AND UNPICKED, and both halves of that are the point.
 *
 * REAL: the sixteen games come off `slate:nfl:2026:1` in KV — real ids, real
 * kickoffs, real posted lines with the book named, captured by
 * tools/poll-slate.mjs on the host. Nothing here is generated.
 *
 * UNPICKED: there is no pick, because nobody has made one. The college preview
 * on this screen carries thirty-one picks in four different states, which is
 * right for a designed preview of a mechanism and would be a LIE here — "my
 * picks" listing picks the user never made is the app telling you what you did.
 * So the NFL route hands back the games with an empty pick map and lets the
 * screen draw its own `none-picked` state, which already exists and already
 * says the true thing.
 */
/* Reads what the slate writes. Same key, same shape - the two screens share one
 * store rather than each keeping their own idea of what you picked, which is how
 * two tabs end up disagreeing about your own card. */
/* The slate writes this; both screens read it, so a marbles player never sees a
 * pool screen's rules applied to a staked card. */
function chosenMode() {
  try {
    const v = JSON.parse(localStorage.getItem('ag.mode'));
    /* 🔴 EXPRESSED AS "NOT THE POOL" rather than by listing the marbles-side
     * tokens, and both reasons matter.
     *
     * It is more robust: the marbles side has been called 'call', 'week' and
     * 'marbles' across three revisions of the first card today, and a phone can
     * be holding any of them. An allow-list has to be extended every time that
     * name changes and fails silently - a marbles player quietly served the
     * pool's rules - when somebody forgets.
     *
     * And it keeps the balance's name out of a file that draws the group pool.
     * Nothing here needs to spell it; only `pool` needs to be recognised, and
     * an unset value is a pool because that is the side with nothing at stake. */
    return (v && v !== 'pool') ? 'week' : 'pool';
  } catch { return 'pool'; }
}

function loadPicks(sport, week) {
  try {
    const raw = localStorage.getItem('ag.picks.' + sport + '.' + week);
    const o = raw ? JSON.parse(raw) : null;
    return (o && typeof o === 'object') ? o : {};
  } catch { return {}; }
}

/* 🔴 BOTH SPORTS, NOT JUST THE NFL. Jason, 2026-09-09: "My picks still needs to
 * be fixed, yes?" - yes, because only the NFL route was rewired and the college
 * one still drew the designed preview: 24 invented picks, a five-leg parlay and
 * a Saturday in a week that has not happened.
 *
 * That was worse on college than the same bug would have been anywhere else,
 * because every identity in it is a REAL school. A screen full of real logos,
 * real names and real-looking spreads, listing picks nobody made, does not read
 * as a placeholder - it reads as your card. */
const WEEK = { nfl: 1, 'college-football': 2 };

async function realWeek(byId, sport) {
  try {
    const res = await fetch('/api/state/slate:' + sport + ':2026:' + (WEEK[sport] || 1));
    if (!res.ok) return null;
    const d = await res.json();
    if (!Array.isArray(d.games) || !d.games.length) return null;
    return d.games.map((g) => {
      /* Identity travels with the game. teams.json is the college snapshot and
       * has no clubs in it, so the feed is the ONLY source for an NFL team here
       * — falling back to byId would silently produce a blank chip. */
      for (const t of g.teams || []) if (t && t.id) byId[t.id] = { ...(byId[t.id] || {}), ...t };
      return {
        id: g.id, week: WEEK[sport] || 1, kickoffUtc: g.kickoffUtc,
        home: byId[g.homeTeamId] || null, away: byId[g.awayTeamId] || null,
        spread: typeof g.spread === 'number' ? g.spread : null,
        homeScore: g.homeScore == null ? null : g.homeScore,
        awayScore: g.awayScore == null ? null : g.awayScore,
        voidAt: null, real: true
      };
    }).filter((g) => g.home && g.away);
  } catch { return null; }
}

export async function previewData(fixtures, state) {
  const db = fixtures.teams.teams;
  const byId = {};
  for (const k of Object.keys(db)) byId[db[k].id] = db[k];
  const all = Object.values(db);

  const sport = chosenSport();
  const wk = WEEK[sport] || 1;
  const live = await realWeek(byId, sport);
  /* 🔴 THE FEED WINS WHEREVER THERE IS ONE, for either sport. The designed
   * preview below survives only as the offline/no-feed fallback - it is a
   * demonstration of the mechanism, and it must never stand in for a real week
   * that simply failed to load. */
  if (live) {
    const all = live;
    /* 🔴 THIS SCREEN IS *YOUR CARD*, NOT THE WEEK. Jason, 2026-09-09: "What is
     * the difference between slate and picks?"
     *
     * Until now, none worth having - both tabs listed the same sixteen games and
     * the second one added nothing, which is why the question had to be asked.
     * Two nav destinations showing one thing is not a navigation problem, it is
     * a product with a redundant half.
     *
     * The difference is now real and it is the obvious one:
     *   SLATE  - every game on the week. Where you choose.
     *   PICKS  - only the ones you chose, and how they are doing.
     *
     * So this reads the SAME stored picks the slate writes, and lists only the
     * games with a side on them. With nothing picked it draws its `none-picked`
     * state, which is a true and useful screen: you have not started. */
    const saved = loadPicks(sport, wk);
    const specs = all.filter((g) => saved[g.id] && saved[g.id].side);
    const picks = {};
    for (const g of specs) {
      picks[g.id] = { gameId: g.id, side: saved[g.id].side, state: 'unpicked',
                      lockedAt: g.kickoffUtc, crowd: null };
    }
    return {
      sport,
      mode: chosenMode(),
      pool: {
        id: null, name: 'No pool yet', commissionerId: null,
        scope: 'all', scopeArg: null, rankingSource: null,
        /* 🔴 THE CARD'S SCORING MODE, not a constant. The week's card is against
         * the spread (Jason, 2026-09-09) and the group pool is straight up, and
         * `ats` is what makes this screen render the line and grade the cover.
         * Hardcoding false printed "Straight up" over a card that pays on the
         * spread - the header contradicting the rules the rows are settled by. */
        ats: chosenMode() === 'week',
        season: 2026, scopeLockedAt: null, memberCount: 0
      },
      week: wk,
      /* The progress line counts against the WHOLE week, not against what has
       * been picked - "3 of 16" is the useful sentence and "3 of 3" is not. */
      slateSize: all.length,
      specs, games: specs, picks, legs: [],
      userId: 'u_self',
      /* The real wall clock. The preview below anchors itself to a captured
       * Saturday so its designed states are all reachable; using that anchor on
       * a live card would lock games that have not kicked off and open ones
       * that have. */
      asOf: Date.now(),
      now: Date.now(),
      /* The week, so the empty state can talk about what is still open. */
      slate: all,
      /* 🔴 COUNTS THE WEEK, NOT YOUR PICKS. It read specs.length, so with nothing
       * picked the footer said "0 of these games are real captures" under a
       * screen built entirely from the feed - the sample-data disclaimer
       * asserting the opposite of the truth. */
      captured: all.length,
      synthetic: 0,
      /* 🔴 SAYS SO OUT LOUD, so the shell's sample-data banner does not call a
       * real week made up. The banner reads this rather than guessing from the
       * route, and a card built from the feed that forgot to set it would be
       * labelled a fabrication on screen. */
      fromFeed: true
    };
  }

  const real = [];
  for (const n of fixtures.games) {
    try { real.push(specFromFixture(await fixtures.load(n), byId)); } catch (e) { /* keep going */ }
  }
  const osu = real.find((r) => r.kickoffUtc && new Date(r.kickoffUtc).getHours() < 12) || real[1];

  /* The week is anchored on the REAL Saturday the three captures were played. */
  const sat = new Date(osu ? osu.kickoffUtc : Date.UTC(2026, 8, 5, 16, 30));
  sat.setHours(0, 0, 0, 0);

  /* 🔴 THURSDAY, FRIDAY AND SATURDAY ONLY, no Sunday game. That is a real shape for a
   * college week and it is also what makes `all-locked` reachable at a real hour: with
   * a Sunday fixture on the slate, "every pick has kicked" cannot happen on Saturday
   * night, and the route would have to be faked by a clock nobody would ever hold. */
  const specs = [];
  const used = new Set();
  const take = (t) => { if (t) used.add(t.id); return t; };

  /* --- Thursday: four probes --- */
  const thuTimes = [[17, 0], [18, 0], [19, 0], [20, 0]];
  const thuOutcome = [
    { spread: -3.5, home: 24, away: 20, side: 'home' },   /* navy on navy   - WON  */
    { spread: -6.5, home: 31, away: 28, side: 'home' },   /* navy on yellow - LOST */
    { spread: 10.5, home: 17, away: 34, side: 'away' },   /* navy on null   - WON  */
    { spread: -2.5, home: 27, away: 24, side: 'away' }    /* yellow on yellow - LOST */
  ];
  PROBES.slice(0, 4).forEach((p, i) => {
    specs.push({
      id: 'p' + (i + 1), week: 2, kickoffUtc: at(sat, -2, thuTimes[i][0], thuTimes[i][1]),
      home: take(byId[p.home]), away: take(byId[p.away]),
      spread: thuOutcome[i].spread, homeScore: thuOutcome[i].home, awayScore: thuOutcome[i].away,
      voidAt: null, mySide: thuOutcome[i].side
    });
  });

  /* --- Friday: two probes and the real Oklahoma game ---
   * The Carroll / Dubuque game is a PUSH: 24 - 7 - 17 = 0 exactly. It leaves through
   * the one void path and is indistinguishable on screen from the cancellation below,
   * which is the entire rule stated as two rows instead of a sentence. */
  specs.push({
    id: 'p5', week: 2, kickoffUtc: at(sat, -1, 18, 0),
    home: take(byId[PROBES[4].home]), away: take(byId[PROBES[4].away]),
    spread: -13.5, homeScore: 38, awayScore: 24, voidAt: null, mySide: 'home'   /* WON */
  });
  specs.push({
    id: 'p6', week: 2, kickoffUtc: at(sat, -1, 19, 30),
    home: take(byId[PROBES[5].home]), away: take(byId[PROBES[5].away]),
    spread: -7, homeScore: 24, awayScore: 17, voidAt: null, mySide: 'home'      /* PUSH -> VOID */
  });
  for (const r of real) { used.add(r.home.id); used.add(r.away.id); }
  const ou = real.find((r) => r !== osu && new Date(r.kickoffUtc).getDay() !== new Date(sat).getDay());
  const ore = real.find((r) => r !== osu && r !== ou);
  if (ou) specs.push(Object.assign({}, ou, { mySide: 'home' }));    /* covered by 10.5 - WON  */

  /* --- Saturday --- */
  if (osu) specs.push(Object.assign({}, osu, { mySide: 'home' }));  /* covered by 2.5  - WON  */
  if (ore) specs.push(Object.assign({}, ore, { mySide: 'home' }));  /* MISSED by 17.5  - LOST */

  /* 🔴 THE CANCELLATION. Announced at 6am on the Saturday - the game itself was due at
   * 4pm - so the void is visible on EVERY route including the default one, rather than
   * hiding in the two routes nobody opens first. Same void path as the push above:
   * the game did not happen, for everybody, and the two rows are drawn identically. */
  const rnd = lcg(20260905);
  const pool = all.filter((t) => !used.has(t.id));
  let cursor = 0;
  const nextTeam = () => { while (cursor < pool.length && used.has(pool[cursor].id)) cursor++; return take(pool[cursor++]); };

  specs.push({
    id: 'x1', week: 2, kickoffUtc: at(sat, 0, 16, 0),
    home: nextTeam(), away: nextTeam(),
    spread: -6.5, homeScore: null, awayScore: null,
    voidAt: at(sat, 0, 6, 0), mySide: 'away'
  });

  /* Twenty-one more Saturday picks. Real teams, synthetic pairings, and a result
   * pattern that is deterministic rather than random so the routes do not change
   * under a reviewer between reloads. Two thirds land, which is roughly what a pool
   * winner's week looks like and is nowhere near a perfect one. */
  const satTimes = [[11, 0], [11, 30], [12, 0], [12, 30], [13, 0], [14, 0], [14, 30], [15, 0],
                    [15, 30], [16, 30], [17, 0], [17, 30], [18, 0], [18, 30], [19, 0], [19, 30],
                    [20, 0], [12, 0], [15, 0], [18, 0], [19, 30]];
  for (let i = 0; i < satTimes.length; i++) {
    const away = nextTeam(), home = nextTeam();
    if (!away || !home) break;
    const s = -(3.5 + 3 * (i % 4));                 /* -3.5, -6.5, -9.5, -12.5 */
    const d = (2.5 + 4 * (i % 3)) * (i % 2 ? -1 : 1);
    const awayScore = 14 + (i % 4) * 7;
    const homeScore = awayScore - s + d;            /* s and d are both x.5, so integer */
    const homeCovered = d > 0;
    const iWin = i % 3 !== 1;
    const mySide = homeCovered === iWin ? 'home' : 'away';
    specs.push({
      id: 's' + (i + 1), week: 2,
      kickoffUtc: at(sat, 0, satTimes[i][0], satTimes[i][1]),
      home, away, spread: s,
      homeScore: Math.round(homeScore), awayScore, voidAt: null, mySide,
      /* One game whose feed is slow. See statusAt - this is the `locked` route. */
      lagMs: i === 4 ? 25 * MIN : 0
    });
  }

  const now = clockFor(state, sat);
  const games = specs.map((s) => gameAt(s, now));
  const byGame = {};
  for (const s of specs) byGame[s.id] = s;

  /* THE PICKS. The pool's own crowd split is carried as COUNTS, never a percentage -
   * fmt.js turns it into a figure and applies the suppression rule, and this file does
   * not reimplement either. Three of them are deliberately unshowable:
   *   - `p3` has n = 3, under the five-member floor;
   *   - `s2` has a minority of exactly one at n = 12, which names that person by
   *     arithmetic at any pool size;
   *   - and after you move one pick on the `ready` route, a fourth will join them. */
  const picks = {};
  const pr = lcg(4400);
  specs.forEach((s, i) => {
    let n = 5 + Math.floor(pr() * 10);
    let mine = 2 + Math.floor(pr() * (n - 3));
    if (s.id === 'p3') { n = 3; mine = 2; }
    if (s.id === 's2') { n = 12; mine = 11; }
    const other = n - mine;
    picks[s.id] = {
      gameId: s.id,
      side: s.mySide,
      state: 'picked',
      lockedAt: s.kickoffUtc,
      crowd: s.mySide === 'home' ? { home: mine, away: other, n } : { home: other, away: mine, n }
    };
  });

  /* THE PARLAY. Its legs are chosen PER ROUTE, and that is stated rather than hidden:
   * a parlay resolves exactly once, so one week cannot show a win and a loss, and both
   * have to be drawable or the symmetric-result rule is unmet on the one component
   * that carries the biggest number on the screen. The PICKS are one week at four
   * clocks; the LEGS are four routes. */
  const legFor = {
    ready:        [['s1', 0], ['s4', 0], ['s8', 0], ['s12', 0], ['s16', 0]],
    partial:      [['s1', 0], ['s4', 0], ['s8', 0], ['s12', 0], ['s16', 0]],
    'all-locked': [['s1', 0], ['s3', 0], ['s8', 0], ['s12', 0], ['s16', 0]],
    final:        [['x1', 0], ['s1', 0], ['s4', 0], ['s12', 0], ['s16', 0]]
  };
  const chosen = state === 'none-picked' ? [] : (legFor[state] || legFor.ready);
  const legs = chosen
    .map(([gid]) => (picks[gid] ? { gameId: gid, side: picks[gid].side } : null))
    .filter(Boolean);

  if (state === 'none-picked') {
    for (const k of Object.keys(picks)) { picks[k].side = null; picks[k].crowd = null; }
  }

  return {
    now,
    pool: {
      id: 'K7RQXZ',
      name: 'Fourth Floor',
      commissionerId: 'u1',
      scope: 'all',
      scopeArg: null,
      rankingSource: null,
      ats: true,
      season: 2026,
      scopeLockedAt: null,
      memberCount: 14
    },
    week: 2,
    /* 131 is the measured week-2 slate size from a running NCAA pick'em. Only the 31
     * picked games exist as objects; this is what the progress line counts against. */
    slateSize: 131,
    specs, games, picks, legs,
    userId: 'u_self',
    asOf: Date.now() - 47000,
    captured: real.length,
    synthetic: specs.length - real.length
  };
}

/* ------------------------------------------------------------------ render */

const NS = 'http://www.w3.org/2000/svg';
function icon(kind, size) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', String(size || 14));
  svg.setAttribute('height', String(size || 14));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'p4-icon p4-icon-' + kind);
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', 'currentColor');
  p.setAttribute('stroke-width', '2');
  p.setAttribute('stroke-linecap', 'round');
  p.setAttribute('stroke-linejoin', 'round');
  if (kind === 'check') p.setAttribute('d', 'M2.5 8.5 L6 12 L13.5 4');
  else if (kind === 'cross') p.setAttribute('d', 'M4 4 L12 12 M12 4 L4 12');
  else if (kind === 'dash') p.setAttribute('d', 'M3.5 8 H12.5');
  else if (kind === 'lock') p.setAttribute('d', 'M4.5 7 V4.75 A3.5 3.5 0 0 1 11.5 4.75 V7 M3.5 7 H12.5 V14 H3.5 Z');
  else if (kind === 'swap') p.setAttribute('d', 'M2.5 5.5 H11 M8.5 3 L11 5.5 L8.5 8 M13.5 10.5 H5 M7.5 8 L5 10.5 L7.5 13');
  svg.appendChild(p);
  return svg;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/** THE RESULT MARK. One component, one slot, one size, and only the sign changes -
 *  which is the symmetric-result rule satisfied by construction rather than by
 *  matching two components against each other afterwards.
 *
 *  🔴 --up AND --down ARE REACHED HERE AND NOWHERE ELSE ON THIS SCREEN. A pick that
 *  has not resolved is not a win, so `locked`, `in_progress` and `picked` never come
 *  through this function at all. */
function resultMark(st) {
  const m = el('span', 'p4-mark');
  m.dataset.result = st;
  m.appendChild(icon(st === 'won' ? 'check' : st === 'lost' ? 'cross' : 'dash'));
  m.setAttribute('title',
    st === 'won' ? 'You had this one' : st === 'lost' ? 'Missed' : 'Void – the game did not happen');
  return m;
}

/* ------------------------------------------------------------------ the row */

function row(ctx, spec) {
  const game = gameAt(spec, ctx.now);
  const pick = ctx.picks[spec.id];
  const side = pick.side;
  const other = side === 'home' ? 'away' : 'home';
  const st = pickState(side, game, ctx.pool.ats, ctx.now);
  /* 🔴 A STAKE IS NOT A POOL PICK, AND ONLY ONE OF THEM MAY BE FLIPPED. Jason,
   * 2026-09-09: "But on picks I can still flip a bet?"
   *
   * In a GROUP POOL, yes, right up to kickoff. That is what a pool is - you are
   * choosing a winner and the deadline is the game starting. Nobody is harmed by
   * you changing your mind at 4:59.
   *
   * On the WEEK'S CARD, no. The whole claim of that product is that you saw the
   * price BEFORE you tapped and were paid at it. If the pick can be flipped
   * afterwards then the number on the tile was never a commitment - it was a
   * quote you could re-shop as the line moved, which is the opposite of the
   * thing this app says it is doing. It is the same rule as one-call-per-snap in
   * the live layer, at a week's speed: the tap IS the commitment, and a
   * commitment you can withdraw is not one.
   *
   * So the swap control is not offered on the marbles card. Changing your mind
   * there means a new stake at the current price, not a free rewrite of the old
   * one at the old price. */
  const staked = ctx.mode === 'week';
  /* 🔴 TWO DIFFERENT FACTS, AND COLLAPSING THEM PRINTED "Closes in null".
   *
   *   open      - the game has not kicked off. Drives the countdown and the
   *               lock state, and is true on BOTH products.
   *   swappable - this pick may still be changed. False on the week's card at
   *               all times, because a stake is committed at the price it was
   *               taken at.
   *
   * They were one variable. Making a staked pick non-swappable therefore also
   * told the status line the game had no time left, so `left` fell to 0 and
   * remainingLabel returned null - rendered as the word "null" beside a game two
   * days away. A boolean that answers two questions gives the wrong answer to
   * one of them. */
  const open = isPickEditable(game, ctx.now);
  const editable = open && !staked;
  const left = open ? game.kickoffUtc - ctx.now : 0;

  const r = el('div', 'p4-row');
  r.dataset.state = st;
  r.dataset.gameId = spec.id;
  if (editable) r.dataset.urgency = urgencyOf(left);

  /* ---- identity. YOUR TEAM LOUD, THE OPPONENT QUIET. The pick is already made, so
   * a symmetric row spends half its width on the side you did not take. Both chips
   * are drawn, stacked eighteen pixels apart, and each is told about the other - which
   * is a harder version of the adjacency test than a horizontal pair, not a softer one. */
  const idBlock = el('div', 'p4-id');
  const l1 = el('div', 'p4-id1');
  l1.appendChild(teamChip(game[side], { size: 18, league: ctx.league, adjacentTo: game[other] }));
  l1.appendChild(el('span', 'p4-team', game[side].short || game[side].name));
  if (ctx.pool.ats) {
    const sp = spreadText(game.spread, side);
    if (sp) l1.appendChild(el('span', 'p4-spread num', sp));
  }
  const l2 = el('div', 'p4-id2');
  l2.appendChild(el('span', 'p4-over', 'over'));
  l2.appendChild(teamChip(game[other], { size: 14, withAbbrev: false, league: ctx.league, adjacentTo: game[side] }));
  l2.appendChild(el('span', 'p4-opp', game[other].short || game[other].name));
  idBlock.append(l1, l2);

  /* ---- status. THE EDIT DEADLINE IS STATED, PER PICK, IN WORDS. A padlock says
   * closed and never says how long you have; POOL-SCREENS P4 asks for the opposite. */
  const status = el('div', 'p4-status');
  const s1 = el('div', 'p4-s1 num');
  const s2 = el('div', 'p4-s2 num');

  if (st === 'won' || st === 'lost') {
    s1.appendChild(score(game));
    s2.appendChild(resultMark(st));
    s2.appendChild(el('span', 'p4-pts num', st === 'won' ? '+1 pt' : '0 pts'));
  } else if (st === 'void') {
    s1.textContent = 'Void';
    s1.dataset.kind = 'void';
    s2.appendChild(resultMark('void'));
    s2.appendChild(el('span', 'p4-pts num', '0 pts'));
  } else if (st === 'in_progress') {
    const live = el('span', 'p4-live', 'Live');
    s1.appendChild(live);
    s2.textContent = 'Kicked ' + timeLabel(game.kickoffUtc);
  } else if (st === 'locked') {
    const lk = el('span', 'p4-locked');
    lk.appendChild(icon('lock', 12));
    lk.appendChild(el('span', null, 'Locked'));
    s1.appendChild(lk);
    s2.textContent = 'Kicked ' + timeLabel(game.kickoffUtc);
  } else {
    /* OPEN. The remaining window, in words, and the kickoff it closes at. */
    s1.textContent = 'Closes in ' + remainingLabel(left);
    s1.dataset.kind = 'open';
    s2.textContent = timeLabel(game.kickoffUtc) + ' kickoff';
  }
  status.append(s1, s2);

  /* ---- the action column. RESERVED ON EVERY ROW, EMPTY WHEN THE PICK IS SHUT.
   * That costs 44px of a 393px screen and buys a straight right edge down thirty-one
   * rows, which is what makes a long list scannable. And it is a real 44x44 target,
   * not a 36px one dressed up as one. */
  const act = el('div', 'p4-act');
  if (editable) {
    const b = el('button', 'p4-swap');
    b.type = 'button';
    b.appendChild(icon('swap', 16));
    const to = game[other].short || game[other].name;
    b.setAttribute('aria-label', 'Change your pick to ' + to);
    b.setAttribute('title', 'Change your pick to ' + to);
    if (ctx.frozen) {
      /* 🔴 THE SWAP STAYS LIVE OFFLINE. It used to be disabled here, which was the
       * honest half of a promise the slate was making differently - and it cost a
       * real case, a stadium or a basement with no bars. Jason, 2026-09-08: queue
       * it. The edit is taken, marked pending, and ruled on by the server when it
       * lands. */
      b.setAttribute('title', 'Queued - it counts if it reaches us before kickoff');
      b.dataset.queued = 'true';
    } else {
      b.addEventListener('click', () => ctx.onSwap(spec.id));
    }
    act.appendChild(b);
  }

  r.append(idBlock, status, act);

  /* ---- line three. Only where there is something to say. A row with nothing to add
   * stays two lines, which is what keeps thirty-one of them readable. */
  const notes = [];
  if (st === 'won' || st === 'lost') {
    const c = coverText(game, side);
    if (c) notes.push(c);
  }
  if (st === 'void') {
    /* ONE VOID PATH. The two void rows on this screen have different CAUSES - one
     * game was cancelled, one landed exactly on the line - and they are drawn
     * IDENTICALLY, score nought for everybody, and differ by one clause. Naming the
     * cause is not the same as treating them differently, and a `Void` with no cause
     * reads as the app having broken. */
    const reason = voidReason(game, ctx.pool.ats);
    notes.push('The game did not happen, for everybody – ' +
      (reason === 'push' ? 'it landed exactly on the line' :
       reason === 'tie' ? 'it finished level' : 'it was called off') +
      '. Nobody scored it.');
  }
  /* 🔴 NO CROWD FIGURE ON A VOID ROW. Seen at 393px: the pushed game rendered "The
   * game did not happen, for everybody ... Nobody scored it. · 67% of your pool had
   * this", and the percentage invites the reader to think the split mattered on a game
   * that did not happen. The one void path says it did not happen FOR EVERYBODY, and
   * a two-thirds majority of nobody is not a fact worth a figure. */
  /* 🔴 NOBODY SEES ANYTHING UNTIL THE GAME LOCKS (Jason, 2026-09-08). Every row
   * on this screen that is still editable shows no split at all - which also
   * ends the two-causes problem this screen used to reason about, because the
   * only cause a reader ever meets now is "it has not kicked yet", and that
   * names nobody. */
  const share = st === 'void' ? null : crowdShare(pick.crowd, side);
  const label = crowdLabel(share, pick.crowd && pick.crowd.n, st !== 'picked');
  if (label) notes.push(label + ' of your pool had this');
  if (notes.length) {
    const l3 = el('div', 'p4-l3', notes.join(' · '));
    r.appendChild(l3);
  }

  r.setAttribute('aria-label', [
    (game[side].name || game[side].short) + ' over ' + (game[other].name || game[other].short),
    STATE_WORD[st] || st,
    editable ? 'editable for another ' + remainingLabel(left) : null
  ].filter(Boolean).join(', '));

  return r;
}

const STATE_WORD = {
  won: 'won', lost: 'missed', void: 'void, the game did not happen',
  in_progress: 'in progress', locked: 'locked', picked: 'still editable', unpicked: 'not picked'
};

/** CBS's score line, taken whole: away then home, the loser's figure dimmed. */
function score(game) {
  const wrap = el('span', 'p4-score num');
  const a = el('b', 'p4-sc', String(game.awayScore == null ? '–' : game.awayScore));
  const h = el('b', 'p4-sc', String(game.homeScore == null ? '–' : game.homeScore));
  if (game.homeScore != null && game.awayScore != null) {
    if (game.homeScore > game.awayScore) a.dataset.loser = 'true';
    else if (game.awayScore > game.homeScore) h.dataset.loser = 'true';
  }
  wrap.append(el('span', 'p4-sc-k', 'Final'), a, el('span', 'p4-sc-sep', '–'), h);
  return wrap;
}

/* ------------------------------------------------------------------ render */

/* Per-game summaries written by the live screen when it settles. Newest first.
 * Nothing here is recomputed - if the live screen never settled a game, there is
 * nothing to show for it, which is the honest answer rather than a zero. */
function liveCalls(sport, week) {
  try {
    const all = JSON.parse(localStorage.getItem('ag.callsum') || '{}');
    return Object.keys(all)
      .map((k) => ({ key: k, ...all[k] }))
      .filter((r) => (r.won + r.lost + r.voided + r.open) > 0)
      /* 🔴 THIS WEEK, THIS SPORT. A total that quietly included last week would
       * be the one number on the screen that cannot be checked against anything.
       * Summaries written before the sport and week were recorded have neither,
       * and are counted rather than dropped - they are this device's own history
       * and the alternative is somebody's results vanishing on an upgrade. */
      .filter((r) => (!r.sport || r.sport === sport) && (!r.week || r.week === week))
      .sort((a, b) => (b.at || 0) - (a.at || 0));
  } catch { return []; }
}

function liveCallBlock(rows) {
  const box = el('div', 'card p4-live');
  const h = el('div', 'p4-live-h');
  h.appendChild(el('span', 'p4-live-k', 'Called live'));
  h.appendChild(el('span', 'p4-live-n', 'Snap by snap · scored on its own'));
  box.appendChild(h);

  /* 🔴 THE WEEK'S PROFIT, AS THE HEADLINE. Jason, 2026-09-09: "Every game gets
   * 200 marbles, but where does the pickup money come from? And if I do 1 game
   * but don't pick anything I end up with 200 marbles. Which is 200 more than
   * anyone who did not play. Should we just have a set amount for the week?"
   *
   * Half of that was already answered and half was a real hole.
   *
   * ANSWERED: the board ranks on PROFIT, not balance, so somebody who did not
   * play scores 0 rather than 200. Sitting on the bank has never been a way to
   * lead.
   *
   * THE HOLE: profit was only ever per-game. Watch five games and you have five
   * banks of 200 to work with; watch one and you have one. Ranking on profit
   * fixes the floor and not the ceiling, so the number still rewarded how much
   * football somebody could watch.
   *
   * 🔴 A WEEKLY TOTAL, NOT A WEEKLY BANK. He asked whether the bank should be
   * set for the week, and it should not: doctrine says the bank refills every
   * game so NOBODY IS EVER ELIMINATED, and one weekly bank means busting on
   * Wednesday and watching Saturday with nothing. Totalling the profit gets the
   * comparable number without breaking that.
   *
   * WHERE THE MONEY COMES FROM: nowhere. Marbles are minted, not redistributed -
   * there is no pot. That is exactly why nothing is purchasable and nothing is
   * redeemable: there is no economy to protect, only a score. The moment marbles
   * came out of a pot this would be a different legal object.
   *
   * 🔴 STILL NOT NEUTRAL ON VOLUME. Five games remain more chances to accumulate
   * than one. The fix for that is profit PER MARBLE STAKED - a rate - and it is
   * fairer and much harder to read at a glance. Recorded here rather than built,
   * so the next session knows the total was chosen over the rate deliberately. */
  let total = 0, open = 0, won = 0, lost = 0;
  for (const r of rows) {
    total += (r.profit || 0); open += (r.open || 0);
    won += (r.won || 0); lost += (r.lost || 0);
  }

  /* 🔴 THE ANALYTICS TREATMENT, from the dashboards Jason picked on 2026-09-09:
   * a large figure, and under it a SIGNED DELTA CHIP saying what it is relative
   * to. That pattern is the whole reason those screens read as analytics rather
   * than as a list of numbers - a figure alone is trivia, a figure with a
   * comparison is a fact about you.
   *
   * 🔴 AND THE COMPARISON HAS TO BE REAL. Those references put "12.5% from last
   * month" under everything, and the temptation is to fill the slot. We have no
   * last week yet - the app is one day old - so the chip says the thing we
   * genuinely know: how many of the settled calls landed. When a previous week
   * exists it can say that instead, and until then the slot stays honest rather
   * than staying full.
   *
   * A hit rate is not shown until something has settled. "0 of 0" is a division
   * by nothing dressed up as a statistic. */
  const settled = won + lost;
  const sum = el('div', 'p4-live-sum');

  const fig = el('div', 'p4-live-fig');
  const v = el('div', 'p4-live-tot num', (total > 0 ? '+' : '') + total);
  if (total > 0) v.dataset.result = 'won';
  else if (total < 0) v.dataset.result = 'lost';
  fig.appendChild(v);
  fig.appendChild(el('div', 'p4-live-tl',
    'Marbles this week' + (open ? ' · ' + open + ' still open' : '')));
  sum.appendChild(fig);

  if (settled) {
    const chip = el('div', 'p4-live-chip num');
    const pct = Math.round((won / settled) * 100);
    /* The arrow is the same fixed result scale as everything else - never team
     * color, and it points at the hit rate rather than at the profit, because
     * they can disagree: four small wins and one large loss is 80% and negative. */
    chip.dataset.result = pct >= 50 ? 'won' : 'lost';
    chip.appendChild(el('span', 'p4-live-arrow', pct >= 50 ? '▲' : '▼'));
    chip.appendChild(el('span', null, pct + '%'));
    sum.appendChild(chip);
    sum.appendChild(el('div', 'p4-live-sub', won + ' of ' + settled + ' landed'));
  }
  box.appendChild(sum);

  for (const r of rows) {
    const a = el('a', 'p4-live-r');
    a.href = '/?game=' + encodeURIComponent(r.key).replace(/%3A/g, ':');
    const settled = r.won + r.lost;
    const parts = [];
    if (settled) parts.push(r.won + ' of ' + settled);
    if (r.open) parts.push(r.open + ' open');
    if (r.voided) parts.push(r.voided + ' void');
    a.appendChild(el('span', 'p4-live-g', gameLabel(r.key)));
    a.appendChild(el('span', 'p4-live-s num', parts.join(' · ') || 'nothing settled'));
    /* 🔴 PROFIT, WITH ITS SIGN, on the fixed result scale - never team color.
     * Same component for up and down, which is the symmetry rule: a miss is a
     * win with a different sign, not a different design. */
    const p = el('span', 'p4-live-p num', (r.profit > 0 ? '+' : '') + r.profit);
    /* 🔴 `data-result`, WHICH IS THE VOCABULARY THE RESULT-SCALE GUARD KNOWS.
     * My first version invented `data-sign` and the guard failed it - correctly.
     * The rule is that --up and --down may only be reached from a RESOLVED
     * state, and it enforces that by recognising the attributes that mean
     * resolved. An attribute it does not know is indistinguishable from one that
     * paints a win onto an open pick, so widening the guard to admit mine would
     * have been weakening it to fit a name I chose arbitrarily.
     *
     * And `won`/`lost` is the accurate word here, not a workaround: a game you
     * finished up on is one you won. `flat` gets no result attribute at all,
     * because breaking even is neither. */
    if (r.profit > 0) p.dataset.result = 'won';
    else if (r.profit < 0) p.dataset.result = 'lost';
    a.appendChild(p);
    box.appendChild(a);
  }
  return box;
}

/* The key is `<sport>:<espnId>` and that is all this screen has - it holds no
 * team table for another league. The id alone is honest and unhelpful, so it is
 * labelled by league and left short rather than dressed up as a matchup we
 * cannot name here. */
function gameLabel(key) {
  const sport = String(key).split(':')[0] === 'nfl' ? 'NFL' : 'College';
  return sport + ' game';
}

export function render(root, data, state) {
  root.innerHTML = '';
  const style = document.createElement('style');
  style.textContent = [TEAM_CHIP_CSS, STATES_CSS].join('\n');
  root.appendChild(style);

  const host = el('div', 'scr-p4-picks');
  root.appendChild(host);

  const ctx = {
    now: data.now,
    pool: data.pool,
    picks: data.picks,
    /* 🔴 THE LEAGUE, so every teamChip on this screen resolves its logo against
     * the right directory. A team id is unique only WITHIN a league, so an NFL
     * id under the college path returns a real logo for the wrong team - 200 OK,
     * nothing logged, and only visible by looking. Found on the slate the same
     * day and fixed here before it could ship the same way. */
    league: (data.sport === 'nfl') ? 'nfl' : 'college-football',
    mode: data.mode || 'pool',
    /* OFFLINE FREEZES THE EDIT, IT DOES NOT HIDE THE LIST. See the offline block. */
    frozen: state === 'offline',
    onSwap: (gameId) => {
      const p = ctx.picks[gameId];
      if (!p || !p.side) return;
      const to = p.side === 'home' ? 'away' : 'home';
      p.crowd = swapCrowd(p.crowd, p.side, to);
      p.side = to;
      /* A leg is a pick already made, so a leg on this game follows the pick. Letting
       * them disagree is the exact failure POOL-SCREENS P3 forbids: the same game
       * picked twice, disagreeing with itself. */
      for (const leg of data.legs) if (leg.gameId === gameId) leg.side = to;
      const y = window.scrollY;
      draw();
      window.scrollTo(0, y);
    }
  };

  draw();

  function draw() {
    host.innerHTML = '';
    head();

    if (state === 'loading') {
      host.appendChild(stateBlock('loading', { rows: 6, body: 'Pulling up your picks…' }));
      return;
    }
    if (state === 'error') {
      host.appendChild(stateBlock('error', {
        title: 'Your picks did not load',
        /* The reassurance is the point. This screen only reads; nothing it fails at
         * can have unpicked a game. */
        body: 'Nothing here writes anything, so your picks are exactly where you left them. This is the view that failed, not your entry.',
        action: { label: 'Reload' }
      }));
      return;
    }

    const specs = data.specs.filter((s) => ctx.picks[s.id] && ctx.picks[s.id].side);

    /* ---- the parlay, pinned. POOL-SCREENS P4: "the parlay's state pinned where it
     * cannot be missed." Sticky, and it is the ONLY sticky thing on this screen - two
     * pinned elements is neither of them pinned. */
    host.appendChild(parlayPin());

    /* 🔴 WHAT YOU DID INSIDE A GAME, on the screen called My picks. Jason,
     * 2026-09-09: "On my picks, if I bet inside that game shown, the outcome
     * will be shown as well."
     *
     * A live call is settled on the live screen, against plays only that screen
     * holds, so this one cannot recompute it - it reads the per-game summary
     * that screen writes when it settles.
     *
     * 🔴 A SEPARATE BLOCK THAT NEVER SUMS WITH THE PICKS ABOVE IT. Same games,
     * two products, two scores: the week's card pays marbles against the spread
     * and a live call pays marbles against a snap. Adding them would produce one
     * number that means nothing, and the rule that the boards never sum is the
     * whole reason the pool and the marbles side can coexist at all.
     *
     * It appears BEFORE the empty state, deliberately. Somebody who called forty
     * snaps on Wednesday and has picked nothing for Saturday has not "not picked
     * anything yet" - and being told so with their own results one scroll away
     * would be the app forgetting what they did. */
    const live = liveCalls(data.sport, data.week);
    if (live.length) host.appendChild(liveCallBlock(live));

    if (!specs.length) {
      /* NONE PICKED. The counter-example is in the CBS capture: `0/15 Picks` above
       * fifteen games all reading Final, with nothing said about what that cost or
       * what to do. So the deadline is the CONTENT of this state, not a footnote. */
      /* 🔴 THE WHOLE WEEK, NOT YOUR PICKS. This mapped over `data.specs` - which
       * on this branch is the list of games you HAVE picked, and is therefore
       * empty, which is why this state is showing at all. With nothing to sort,
       * `first` came back undefined and the screen announced "Every game this
       * week has kicked" on a Wednesday with twenty-four games still to play.
       *
       * A message about what is still open cannot be derived from the set of
       * things you have already done. `data.slate` is the week. */
      const first = (data.slate || data.specs)
        .map((s) => gameAt(s, ctx.now))
        .filter((g) => isPickEditable(g, ctx.now))
        .sort((a, b) => a.kickoffUtc - b.kickoffUtc)[0];
      host.appendChild(stateBlock('empty', {
        title: 'You have not picked anything yet',
        body: first
          ? 'The first game on this pool’s slate closes in ' + remainingLabel(first.kickoffUtc - ctx.now) +
            ', at ' + timeLabel(first.kickoffUtc) + '. Every pick stays editable until its own kickoff, so nothing is decided until then.'
          : 'Every game this week has kicked. Nothing can be picked now, and the week scored nothing.',
        /* 🔴 A BUTTON WITH NO HANDLER IS A DEAD END WEARING A DOOR'S CLOTHES.
         * Jason, 2026-09-09: "Go to. Slate does not work." stateBlock only wires
         * a click when it is GIVEN one, and this passed a label alone - so the
         * one action offered on the one screen that exists to send you somewhere
         * did nothing at all. */
        action: { label: 'Go to the slate', onClick: () => { location.hash = '#/slate'; } }
      }));
      host.appendChild(footer(0));
      return;
    }

    host.appendChild(summary(specs));

    if (state === 'offline') {
      /* HOLD THE LIST, FREEZE THE EDIT. The board must say what it still knows and how
       * old it is - and on THIS screen there is a second thing to say that no other
       * screen has to: a change made now cannot be sent, and the deadline does not
       * wait for the connection. Saying only the first half would be a promise. */
      host.appendChild(stateBlock('offline', {
        title: 'You are offline',
        body: 'Your changes are queued on this phone and go up when you are back. Each one counts only if it reaches us before that game kicks off, and we rule on that when it arrives, by our clock rather than the one in your pocket. Until it lands it is queued, not made.',
        since: data.asOf,
        action: { label: 'Try again' }
      }));
    }

    host.appendChild(list(specs));
    host.appendChild(footer(specs.length));
  }

  function head() {
    /* The shared header, so this screen's top matches every other one. */
    host.appendChild(pageHeader({
      title: 'My picks',
      league: data.sport === 'nfl' ? 'nfl' : 'ncaa',
      sub: 'Week ' + (data.week || '')
        + ((data.mode === 'week') ? ' · against the spread' : ' · your group, in points')
    }));
    /* 🔴 THE OLD META LINE IS DELETED, NOT KEPT UNDER THE NEW HEADER. It said
     * "Week 2 · No pool yet · Against the spread · 0 members" - the pool name of
     * a pool that does not exist, and a member count of nobody, on a screen
     * about YOUR card. Every fact in it was either already in the header above
     * or a statement about something this screen is not.
     *
     * Leaving it would have made the shared header an addition rather than a
     * replacement, which is how a template ends up making a page longer and less
     * consistent than the thing it replaced. */
  }

  /* ---- THE TWO FIGURES.
   *
   * 🔴 NEITHER IS 30px AND NEITHER IS ALONE. The pool has no bank strip; 30px exists
   * in this system to keep a stake honest and the pool has no stake. Both figures sit
   * at 21px, which makes the pool name at 17px no longer the largest type here - a
   * deliberate divergence from P2, whose subject is the slate rather than a number
   * about it. This screen's subject IS a number about your week.
   *
   * AND THERE ARE TWO OF THEM BECAUSE ONE OF THEM IS NOUGHT ON A SATURDAY MORNING.
   * Armchair pins `Your AQB Score: 0 pts` above a list that bottoms out at 11,940 -
   * the single largest figure on the screen, saying nothing, at the exact moment the
   * user opened it. Points is that figure. `Still editable` is the one that is large
   * precisely when points is nought, and nought precisely when points is the story. */
  function summary(specs) {
    const games = specs.map((s) => gameAt(s, ctx.now));
    const picks = specs.map((s) => ({ userId: data.userId, gameId: s.id, side: ctx.picks[s.id].side }));
    const scored = scoreWeek({
      week: data.week, games, ats: ctx.pool.ats, picks,
      parlays: [{ userId: data.userId, legs: data.legs }], now: ctx.now
    })[0];

    const openCount = games.filter((g) => isPickEditable(g, ctx.now)).length;
    const anyResolved = scored.correct + scored.wrong + scored.voided > 0;

    const card = el('div', 'card p4-sum');
    const grid = el('div', 'p4-sum-grid');

    const c1 = el('div', 'p4-cell');
    c1.append(el('div', 'p4-cell-k', 'Points this week'),
              el('div', 'p4-cell-v num', anyResolved ? String(scored.weekPoints) : '—'));
    const c2 = el('div', 'p4-cell');
    c2.append(el('div', 'p4-cell-k', 'Still editable'),
              el('div', 'p4-cell-v num', String(openCount)));
    grid.append(c1, c2);
    card.appendChild(grid);

    /* A DASH IS NOT A NOUGHT - Office Pool's own distinction, and it is right: "no
     * game has finished" and "you scored nothing" are different facts. */
    const bits = [progress(specs.length, data.slateSize)];
    const tally = [];
    if (scored.correct) tally.push(scored.correct + ' correct');
    if (scored.wrong) tally.push(scored.wrong + ' missed');
    if (scored.voided) tally.push(scored.voided + ' void');
    if (scored.pending) tally.push(scored.pending + ' still to settle');
    if (tally.length) bits.push(tally.join(' · '));
    if (scored.parlayPoints > 0) bits.push('parlay +' + scored.parlayPoints + ' of that');
    card.appendChild(el('p', 'p4-sum-n num', bits.join(' · ')));
    return card;
  }

  /* ---- THE PARLAY PIN.
   *
   * Every word and every number in here is `resolveParlay`'s. The ladder, the minimum,
   * the maximum, what a void does to the worth and the sentence that explains it are
   * pool.ts's and are not restated. THE LEG CHIPS ARE THE HALF-LOCKED CASE MADE
   * VISIBLE: legs lock independently, so some chips carry a padlock and some do not,
   * and a parlay that is half shut looks half shut. */
  function parlayPin() {
    const games = new Map();
    for (const s of data.specs) games.set(s.id, gameAt(s, ctx.now));
    const res = resolveParlay(data.legs, games, ctx.pool.ats, ctx.now);

    const pin = el('div', 'p4-pin');
    pin.dataset.state = res.state;
    pin.dataset.outcome = res.outcome;

    const top = el('div', 'p4-pin-top');
    const k = el('span', 'p4-pin-k', 'Parlay');
    const v = el('span', 'p4-pin-v num');
    if (res.originalLegCount === 0) {
      v.textContent = PARLAY_MIN_LEGS + '–' + PARLAY_MAX_LEGS + ' legs, from picks you have made';
    } else if (res.outcome === 'won') {
      v.textContent = res.points + ' points';
    } else if (res.outcome === 'lost' || res.outcome === 'void') {
      v.textContent = '0 points';
    } else {
      v.textContent = res.survivingLegCount + ' legs · ' + res.worth + ' points if it lands';
    }
    const chip = el('span', 'p4-pin-chip', PARLAY_WORD[res.state] || res.state);
    chip.dataset.outcome = res.outcome;
    top.append(k, v, chip);
    pin.appendChild(top);

    if (res.legs.length) {
      const strip = el('div', 'p4-legs ag-scroll-x');
      for (const leg of res.legs) {
        const g = games.get(leg.gameId);
        const t = g ? g[leg.side] : null;
        const pill = el('span', 'p4-leg');
        pill.dataset.legResult = leg.result || (leg.locked ? 'locked' : 'open');
        if (t) pill.appendChild(teamChip(t, { size: 12, league: ctx.league }));
        else pill.appendChild(el('span', 'tchip-abbrev num', '—'));
        if (leg.result) pill.appendChild(icon(leg.result === 'won' ? 'check' : leg.result === 'lost' ? 'cross' : 'dash', 11));
        else if (leg.locked) pill.appendChild(icon('lock', 11));
        pill.setAttribute('title', t
          ? (t.name || t.short) + ' – ' + (leg.result || (leg.locked ? 'locked' : 'still editable'))
          : 'This leg’s game left the slate');
        strip.appendChild(pill);
      }
      pin.appendChild(strip);
    }

    /* pool.ts's own sentence, printed verbatim, and only where it says something the
     * two lines above do not: a void, a reduction, or a settled outcome. */
    if (res.reduced || res.outcome !== 'pending' || res.state === 'empty' || res.state === 'under_min') {
      pin.appendChild(el('p', 'p4-pin-note', res.note));
    }
    return pin;
  }

  /* ---- the list. Kickoff order, one header per day, and ONE divider where the clock
   * falls. In kickoff order "now" is a single line through the list, so the answer to
   * "make the remaining window legible at a glance" needs one element, not a badge on
   * every row. The divider partitions on KICKOFF, which is what it claims - a voided
   * game below it is dead for a different reason and says so on its own row. */
  function list(specs) {
    const wrap = el('div', 'p4-list');
    const games = specs.map((s) => gameAt(s, ctx.now));
    const openGames = games.filter((g) => isPickEditable(g, ctx.now)).sort((a, b) => a.kickoffUtc - b.kickoffUtc);
    const kicked = games.filter((g) => ctx.now >= g.kickoffUtc).length;
    const dividerAt = kicked > 0 && kicked < games.length ? games.slice().sort((a, b) => a.kickoffUtc - b.kickoffUtc)[kicked].id : null;

    let placed = false;
    for (const grp of groupsOf(games)) {
      const h = el('div', 'p4-day');
      h.append(el('span', 'p4-day-l', grp.label),
               el('span', 'p4-day-n num', grp.games.length + (grp.games.length === 1 ? ' pick' : ' picks')));
      wrap.appendChild(h);
      for (const g of grp.games) {
        if (!placed && g.id === dividerAt) {
          placed = true;
          const d = el('div', 'p4-divider');
          d.appendChild(el('span', 'p4-divider-l num',
            'Still to kick · ' + openGames.length + (openGames.length === 1 ? ' open' : ' open') +
            (openGames.length ? ' · first closes in ' + remainingLabel(openGames[0].kickoffUtc - ctx.now) : '')));
          wrap.appendChild(d);
        }
        wrap.appendChild(row(ctx, data.specs.find((s) => s.id === g.id)));
      }
    }
    return wrap;
  }

  /* ---- the footer.
   *
   * 🔴 THE SUPPRESSION RULE IS EXPLAINED ONCE, GLOBALLY, AND NEVER PER ROW.
   * fmt.js offers `crowdSuppression` so a screen "can tell no number yet from we are
   * not going to tell you and say which." THIS SCREEN DELIBERATELY DECLINES TO SAY
   * WHICH, and the reason is the rule itself: one of the two suppression causes is
   * "the minority is exactly one." Printing that cause on a row announces that one
   * person is alone on that game, which is the precise disclosure the suppression
   * exists to prevent - and printing the OTHER cause while staying silent on this one
   * discloses it by elimination. So both are silent, and one line at the foot says
   * why any of them can be. The reasons are still computed, for the count below. */
  function footer(n) {
    const box = el('div', 'p4-foot');
    if (n) {
      let hidden = 0;
      for (const s of data.specs) {
        const p = ctx.picks[s.id];
        if (!p || !p.side) continue;
        if (crowdSuppression(crowdShare(p.crowd, p.side), p.crowd && p.crowd.n, true)) hidden++;  // locked rows only
      }
      box.appendChild(el('p', 'p4-footline num',
        'Every pick is editable until that game kicks, and locks at kickoff. One rule, no exceptions, and it is per game rather than per week.'));
      box.appendChild(el('p', 'p4-footline num',
        'Your pool’s split is shown only where it cannot name anybody' +
        (hidden ? ' — it is held back on ' + hidden + (hidden === 1 ? ' game' : ' games') + ' here.' : '.')));
      box.appendChild(el('p', 'p4-footline num',
        'Parlay: 3 legs 3 points · 4 legs 6 · 5 legs 12 · 6 legs 20. A voided leg leaves the parlay and takes its worth down with it.'));
    }
    /* 🔴 SAYS PLAINLY WHAT IS REAL, AND IT HAS TO BE RIGHT IN BOTH DIRECTIONS.
     * This line was written when every game on the screen was invented and three
     * were captures. On a real week it was calling the whole feed synthetic,
     * which is the same failure as the sample-data banner and worse - a
     * disclaimer that is wrong is not caution, it is misinformation somebody
     * will believe precisely because it sounds careful. */
    box.appendChild(el('p', 'p4-footline p4-real num', data.fromFeed
      ? data.captured + ' real games off the feed — real kickoffs, real lines with the book named. '
        + 'Your picks count on the world board and in every group you are in. Each one locks at its own kickoff.'
      : data.captured + ' of these games are real captures with their real final scores and their real lines. '
        + 'The pool, the members, the picks, the crowd splits and the parlay are synthetic — no pool has ever been played.'));
    return box;
  }
}

const PARLAY_WORD = {
  empty: 'None yet',
  under_min: 'Too few legs',
  valid: 'Live',
  at_max: 'Live, at the maximum',
  partial_lock: 'Half locked',
  locked: 'Locked',
  won: 'Landed',
  lost: 'Out'
};
