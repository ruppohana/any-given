/* P2 - THE SLATE. The densest screen in the app.
 *
 * BAR (all four opened, not read about, 2026-09-08):
 *
 *  1. reference/cbs-pickem-teardown/screens/CBS-picks-week1-15-games-spreads-crowd-desktop.png
 *     THE PICK IS THE ROW. One card per game, split into two dashed tap zones with a
 *     padlock between them, the score line sitting ABOVE the card. Outward ordering per
 *     side: logo, NAME IN CAPS, record, crowd %, spread, [lock], spread, crowd %, record,
 *     NAME, logo. And `AWAY / 0-of-15 Picks / HOME` is ONE element doing column labels and
 *     progress at the same time. Taken whole.
 *
 *  2. reference/cbs-pickem-teardown/screens/CBS-picks-tiebreakers-total-points.png
 *     FOUR tiebreak fields - `Total Points for LVILLE`, `... MISS`, `... SMU`, `... FSU`.
 *     That is a national-contest answer. Ours is ONE field on one named game, because a
 *     conference-scoped pool is eight games and four fields would outweigh the slate.
 *
 *  3. reference/armchair-quarterback-teardown/screens/AQB-schedule-upcoming-games.png
 *     THE DENSITY TARGET. helmet / city-small-over-name-bold / centered kickoff / team /
 *     helmet, hairline divided, NO per-row header and NO card - eight rows a screen. And
 *     the elegant part: on a live game the KICKOFF TIME IS REPLACED IN PLACE by a play
 *     button. Same slot, no badge, no extra column. That is the center column in this file.
 *
 *  4. reference/sofascore-teardown/screens/IMG_5204.PNG
 *     THE FAILURE MODE, by contrast. An NCAA mark + `Football > Regular season` + a US
 *     flag + `USA` repeated ABOVE EVERY SINGLE FIXTURE, roughly 40% of each card, four to
 *     five fixtures a screen. Its day header `Sat - Sep 05` is per group and is correct;
 *     the competition header is the same information paid for 131 times.
 *     => THE GROUP HEADER IS PER GROUP, NEVER PER ROW. That is the whole layout.
 *
 * 🔴 THE NUMBER THAT DESIGNS THIS SCREEN: a college week is 131 games, not 60. Measured
 * 2026-09-08 off a running NCAA pick'em. Sixty is the FBS slice. Four shipped products,
 * four non-answers: Sofascore scrolls forever, Armchair ships a `Search Teams` box, CBS
 * curates to 15, Office Pool ships a flat list of all 131. SEARCH IS WHAT GETS BUILT WHEN
 * GROUPING WAS NOT SOLVED - so there is no search box here. There is a scope (the pool's,
 * set on P6, not a control on this screen) and, inside it, grouping by day and kickoff
 * window with a sticky header per group.
 *
 * 🔴 THE HEADLINE FIGURE IS DELIBERATELY UNASSIGNED, and this file assigns it NOTHING.
 * The largest type on this screen is the pool name at 17px. The progress count sits at
 * 15px inside the sticky label bar. Office Pool's `Welcome back, Jason!` at ~36px is the
 * largest type on its dashboard and says nothing; 30px exists in this system to keep a
 * STAKE honest and the pool has no stake. The subject of this screen is the slate.
 *
 * WHAT THIS SCREEN MAY NOT DECIDE, and does not: the scope (P6), whether spreads render
 * (pool.ats), the point values (pool.ts), the crowd suppression threshold (fmt.js).
 */
import { teamChip, TEAM_CHIP_CSS, applyTeamVars } from '/components/team-chip.js';
import { stateBlock, STATES_CSS } from '/components/states.js';
import { progress, crowdLabel } from '/components/fmt.js';

export const id = 'p2-slate';
export const title = 'The slate';
export const bar = 'reference/cbs-pickem-teardown/screens/CBS-picks-week1-15-games-spreads-crowd-desktop.png';

/* The five required states, plus ONE extra route. `ready` is the 131-game slate with
 * against-the-spread ON - the worst case, because if it holds with spreads it holds
 * without. `ready-short` is the three REAL fixture games with ats off - the 3-row case.
 * A layout that only works at fifteen rows is broken, so both are routes, not a claim. */
export const states = ['ready', 'ready-short', 'empty', 'loading', 'offline', 'error'];

/* ------------------------------------------------------------------ pure helpers
 * Nothing below this line touches the DOM or an imported binding, so tests/p2-slate
 * can load this module with its imports stripped and exercise it in Node. */

/** Kickoff windows. A college Saturday is four of these and the group header is the
 *  only place the window is ever named - Sofascore's mistake was per-row. */
export const KICK_WINDOWS = [
  { key: 'morning', label: 'Morning', until: 12 },
  { key: 'afternoon', label: 'Afternoon', until: 16 },
  { key: 'evening', label: 'Evening', until: 19 },
  { key: 'night', label: 'Night', until: 24 }
];

export function windowOf(ms) {
  const h = new Date(ms).getHours();
  for (const w of KICK_WINDOWS) if (h < w.until) return w;
  return KICK_WINDOWS[KICK_WINDOWS.length - 1];
}

export function dayKeyOf(ms) {
  const d = new Date(ms);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function dayLabel(ms) {
  return new Date(ms).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function dayChipLabel(ms) {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { weekday: 'short' }) + ' ' + d.getDate();
}

export function timeLabel(ms) {
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** A day splits into kickoff windows ONLY when it has more games than this.
 *
 *  🔴 THIS NUMBER IS THE WHOLE "3 AND 131" REQUIREMENT. Grouping unconditionally by day
 *  AND window gave three games three headers - one header per row, which is Sofascore's
 *  repeated competition header arriving through the back door, in the layout written to
 *  avoid it. Seen at 393px on the `ready-short` route, not reasoned about.
 *
 *  The rule that falls out is the honest one: a subdivision has to earn itself. A
 *  Saturday with 71 games needs four windows. A Saturday with two does not. */
export const WINDOW_SPLIT_MIN = 6;

/** Day, then - only where the day is big enough to need it - kickoff window.
 *  ONE HEADER PER GROUP. NEVER ONE PER ROW. */
export function groupsOf(games) {
  const days = new Map();
  for (const g of games.slice().sort((a, b) => a.kickoffUtc - b.kickoffUtc)) {
    const dk = dayKeyOf(g.kickoffUtc);
    if (!days.has(dk)) days.set(dk, []);
    days.get(dk).push(g);
  }
  const out = [];
  for (const [dk, list] of days) {
    if (list.length <= WINDOW_SPLIT_MIN) {
      out.push({ key: dk, dayKey: dk, day: dayLabel(list[0].kickoffUtc), window: null, first: list[0].kickoffUtc, games: list });
      continue;
    }
    const byWin = new Map();
    for (const g of list) {
      const w = windowOf(g.kickoffUtc);
      if (!byWin.has(w.key)) byWin.set(w.key, { key: dk + '|' + w.key, dayKey: dk, day: dayLabel(g.kickoffUtc), window: w.label, first: g.kickoffUtc, games: [] });
      byWin.get(w.key).games.push(g);
    }
    for (const grp of byWin.values()) out.push(grp);
  }
  return out.sort((a, b) => a.first - b.first);
}

/** What the header says. The window is named only where the day was actually split. */
export function groupLabel(g) {
  return g.window ? g.day + ' · ' + g.window : g.day;
}

/** Below this the whole slate is a short scroll and a jump strip is a control that costs
 *  more than it saves. 131 needs it; 3 does not, and 8 - the conference-scoped pool this
 *  screen has to hold at - does not either. */
export const JUMP_STRIP_MIN = 24;

/** The distinct days, for the jump strip. This is GROUPING MADE NAVIGABLE, not a filter:
 *  every member of the pool sees the same slate or the standings mean nothing. Scope is
 *  the pool's, navigation is the viewer's. */
export function daysOf(groups) {
  const out = [];
  const seen = new Map();
  for (const g of groups) {
    let d = seen.get(g.dayKey);
    if (!d) { d = { dayKey: g.dayKey, label: dayChipLabel(g.first), anchor: g.key, count: 0 }; seen.set(g.dayKey, d); out.push(d); }
    d.count += g.games.length;
  }
  return out;
}

/** `spread` is stored as the HOME number, ESPN's convention: negative means home is
 *  favored. Rendered on every game that HAS a posted line, in both scoring modes -
 *  the number is information, and `ats` is only about whether it decides the pick.
 *  There are no odds on this screen and there never will be. */
export function spreadText(spread, side) {
  if (spread == null) return null;
  const v = side === 'home' ? spread : -spread;
  if (v === 0) return 'PK';
  const s = Math.abs(v) % 1 === 0 ? String(Math.abs(v)) : Math.abs(v).toFixed(1);
  return (v > 0 ? '+' : '\u2212') + s;
}

/** Which side won, once a game is final. Null on a tie, which resolves through the one
 *  void path rather than through a winner. */
export function winnerOf(game) {
  if (game.status !== 'final' || game.homeScore == null || game.awayScore == null) return null;
  if (game.homeScore === game.awayScore) return null;
  return game.homeScore > game.awayScore ? 'home' : 'away';
}

/**
 * The PickState for one row. Stays inside the CONTRACT §6 union - there is no eighth
 * member. `--up` / `--down` are reached ONLY by `won` and `lost`: a pick that has not
 * resolved is not a win, and nothing here paints an unresolved pick green.
 */
export function pickStateOf(game, pick, now) {
  if (game.status === 'void') return 'void';
  const side = pick && pick.side;
  const started = game.status !== 'scheduled' || now >= game.kickoffUtc;
  if (!side) return started ? 'locked' : 'unpicked';
  if (game.status === 'final') {
    const w = winnerOf(game);
    if (w == null) return 'void';          /* a tie is the game not happening, for everybody */
    return w === side ? 'won' : 'lost';
  }
  if (game.status === 'in_progress') return 'in_progress';
  return started ? 'locked' : 'picked';
}

export function countPicked(games, picks) {
  let n = 0;
  for (const g of games) if (picks[g.id] && picks[g.id].side) n++;
  return n;
}

/* ------------------------------------------------------------------ preview data
 * REAL TEAMS, REAL FIXTURE GAMES, SYNTHETIC PAIRINGS. Stated plainly because it is the
 * one thing a reader has to know: fixtures/ holds three captured games and 760 captured
 * team identities. A real 131-game slate is a capture job, NOT a file this piece writes -
 * `_make.py` invented a play-text shape once and 306 tests passed while the app named the
 * wrong player in every real game. So the three real games below are real down to their
 * kickoff, their final score and their records; games 4..131 pair REAL teams from
 * fixtures/teams.json against each other at synthetic kickoff times. */

/* EVERY PAIR OF NAVY / YELLOW / NULL, NAVY ON NAVY INCLUDED. Twelve DISTINCT real teams
 * out of fixtures/teams.json - no team appears twice, because a team playing twice in a
 * week is a data error a reviewer would spend their attention on instead of the colors.
 * These six are placed together in the first group ON PURPOSE: the two-color chip doing
 * the identification job a logo does in all four captured products is the first thing to
 * draw and has never been drawn, so it goes above the fold where it can be looked at. */
const PROBE_IDS = [
  ['2', '87'],      /* Auburn 0c2340 v Notre Dame 0c2340 - NAVY ON NAVY, IDENTICAL primary */
  ['25', '9'],      /* California 041e42 v Arizona State ffc627 - navy on yellow */
  ['6', '11'],      /* South Alabama 00205b v Colorado Mesa null - navy on null */
  ['119', '338'],   /* Towson ffc229 v Kennesaw St fdbb30 - YELLOW ON YELLOW, near-identical */
  ['63', '70'],     /* Buena Vista feba12 v Idaho null - yellow on null */
  ['32', '49']      /* Carroll (WI) null v Dubuque null - NULL ON NULL */
];
const PROBE_N = PROBE_IDS.length;

function lcg(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

function slateGame(o) {
  return {
    id: o.id, week: 2, kickoffUtc: o.kickoffUtc, home: o.home, away: o.away,
    spread: o.spread == null ? null : o.spread,
    status: o.status || 'scheduled',
    homeScore: o.homeScore == null ? null : o.homeScore,
    awayScore: o.awayScore == null ? null : o.awayScore,
    homeRecord: o.homeRecord || null, awayRecord: o.awayRecord || null
  };
}

/** Turn one captured ESPN game into a SlateGame. Nothing invented - id, kickoff, both
 *  team ids, both final scores and both records come out of the fixture. */
function fromFixture(raw, teamsById) {
  const c = raw.header.competitions[0];
  const home = c.competitors.find((x) => x.homeAway === 'home');
  const away = c.competitors.find((x) => x.homeAway === 'away');
  const rec = (t) => (t.record && t.record[0] && t.record[0].displayValue) || null;
  return slateGame({
    id: c.id,
    kickoffUtc: Date.parse(c.date),
    home: teamsById[home.team.id], away: teamsById[away.team.id],
    status: 'final',
    homeScore: Number(home.score), awayScore: Number(away.score),
    homeRecord: rec(home), awayRecord: rec(away)
  });
}

/**
 * 🔴 THE REAL SLATE, OFF THE FEED. Jason: "Fix the stale ncaa cards, put in the
 * real data... Put in the real data and schedule?"
 *
 * Everything below this used real TEAM IDENTITIES and invented the rest — the
 * matchups, the kickoffs, the spreads, the finals. That is defensible for a
 * design surface and indefensible in a product, because a fabricated final score
 * set in the same type as a real one gives the reader no way to tell.
 *
 * `tools/poll-slate.mjs` reads the week off ESPN's core API on the host and
 * pushes it to KV, exactly as the game poller does — real ids, real kickoffs,
 * real posted lines with the book named, real scores as they land. This reads
 * that.
 *
 * 🔴 AND A GAME WITH NO POSTED LINE STAYS null. A pool "against the spread" with
 * an invented number is worse than one with no number: it looks authoritative
 * and it is fiction.
 */
/* 🔴 THE SPORT IS THE ONE THE USER CHOSE, read from the same key the live layer
 * writes. Jason, 2026-09-08: "NFL slate is college."
 *
 * It was: the sport gate set `ag.sport`, the live board honoured it, and this
 * screen fetched a hardcoded `slate:college-football:2026:2` regardless. So
 * picking NFL and tapping the slate produced Villanova at Louisville — the pool
 * half silently answering a question about a different sport.
 *
 * Same shape as the pool-from-the-NFL-page bug: a fork that only half the app
 * was told about. A choice the user makes has to reach every screen that could
 * contradict it, or it is not a choice — it is a preference one screen keeps to
 * itself. */
export function chosenSport() {
  try {
    const v = JSON.parse(localStorage.getItem('ag.sport'));
    return v === 'nfl' ? 'nfl' : 'college-football';
  } catch { return 'college-football'; }
}

/* 🔴 THE WEEK'S CARD IS A MARBLE PRODUCT AND THE OFFICE POOL IS NOT. Jason,
 * 2026-09-08: "Office pool is a completely separate section. And don't we also
 * have the weeks picks for the marbles?"
 *
 * Both land on this screen, because both are "pick from the same sixteen
 * games". Everything that differs is what a row COSTS and what it PAYS, so the
 * mode is read once here and the row decides. */
export function chosenMode() {
  try {
    const v = JSON.parse(localStorage.getItem('ag.mode'));
    /* 🔴 THE SLATE IN MARBLES MODE *IS* THE WEEK'S CARD. There is no third
     * value: the first card asks marbles-or-pool, and a marbles player who
     * reaches this screen has reached the weekly half of that product by
     * definition — the live half is a different screen entirely. Reading a
     * separate `ag.speed` here would let the two disagree. */
    /* 'call' and 'week' are the retired three-way ids; a phone still holding
     * one of them is a marbles player, and reading them as 'pool' would show a
     * marbles player a points screen. */
    return (v === 'marbles' || v === 'call' || v === 'week') ? 'week' : 'pool';
  } catch { return 'pool'; }
}

/* 🔴 THE PRICE COMES OFF THE POSTED LINE, WHICH IS REAL, THROUGH A CONVERSION
 * THAT IS AN APPROXIMATION — and the difference is stated rather than hidden.
 *
 * The spread on every one of the sixteen NFL games is captured from the feed
 * with the book named. Turning points into a win probability is a model, and
 * this is the standard logistic one: p = 1 / (1 + exp(spread / s)). The scale
 * `s` differs by sport because a college point is worth less than an NFL point
 * — college games are higher-variance and the same number moves the
 * probability less far.
 *
 * 🔴 IT IS NOT A NO-VIG MONEYLINE AND MUST NOT BE PRINTED AS ONE. It is our
 * price for our marbles, which is why the payout is capped at 6x per doctrine
 * rather than running off to infinity on a 40-point mismatch. A 42-point
 * favorite is not a 1.001x proposition, it is a question nobody should be
 * offered, and the cap plus the floor is what says so.
 */
const SPREAD_SCALE = { nfl: 4.1, 'college-football': 5.6 };

export function probFromSpread(spread, side, sport) {
  if (typeof spread !== 'number') return null;
  /* Stored as the HOME number, ESPN's convention: negative means home favored. */
  const own = side === 'home' ? spread : -spread;
  const s = SPREAD_SCALE[sport] || SPREAD_SCALE.nfl;
  const p = 1 / (1 + Math.exp(own / s));
  /* 🔴 CLAMPED AT 0.90, WHICH IS OUR OWN BAR AND NOT AN ARBITRARY NUMBER.
   * "A question 90% one way is not a question" is the line the player market
   * was measured against and killed by - 76% of NFL drives end with nobody
   * scoring. Pricing a 14-point favorite at 1.06x would have this screen
   * offering exactly the proposition that rule rejects, three rows down from a
   * real one. The floor keeps the shape of the sentence honest: nothing here
   * pays less than 1.11x, and a game that wants to is a game where the pick is
   * not interesting. */
  return Math.min(0.90, Math.max(0.16, p));
}

/** `stake / p`, capped at 6x - the doctrine payout, as a multiple. */
export function priceFromSpread(spread, side, sport) {
  const p = probFromSpread(spread, side, sport);
  if (p == null) return null;
  return Math.min(6, Math.round((1 / p) * 100) / 100);
}

/* The two sports are not on the same week. College is in week 2 on this date and
 * the NFL is in week 1 — the opener is Wednesday. A single week number would put
 * one of them on an empty key. */
const WEEK = { 'college-football': 2, nfl: 1 };

async function realSlate(byId, sport) {
  const season = 2026, week = WEEK[sport] || 1;
  try {
    const res = await fetch(`/api/state/slate:${sport}:${season}:${week}`);
    if (!res.ok) return null;
    const d = await res.json();
    if (!Array.isArray(d.games) || !d.games.length) return null;
    return d.games.map((g) => {
      /* Identity travels WITH the game, because the shipped team file is a
       * snapshot and the feed is not. Fall back to it only for what is missing. */
      for (const t of g.teams || []) if (t && t.id) byId[t.id] = { ...(byId[t.id] || {}), ...t };
      return slateGame({
        id: g.id, kickoffUtc: g.kickoffUtc,
        home: byId[g.homeTeamId] || null, away: byId[g.awayTeamId] || null,
        spread: typeof g.spread === 'number' ? g.spread : null,
        status: g.status === 'final' ? 'final' : g.status === 'in_progress' ? 'in_progress' : 'scheduled',
        homeScore: g.homeScore, awayScore: g.awayScore
      });
    }).filter((g) => g.home && g.away);
  } catch { return null; }
}

export async function previewData(fixtures, state) {
  const db = fixtures.teams.teams;
  const byId = {};
  for (const k of Object.keys(db)) byId[db[k].id] = db[k];
  const all = Object.values(db);

  /* The feed first. Only if it has nothing to say do we fall back to the
   * captured games and the generated week below. */
  const sport = chosenSport();
  const mode = chosenMode();
  const live = await realSlate(byId, sport);

  const real = [];
  for (const n of fixtures.games) {
    try { real.push(fromFixture(await fixtures.load(n), byId)); } catch (e) { /* keep going */ }
  }

  /* TWO ROUTES, AND THE SPLIT IS ABOUT HONESTY ABOUT THE CLOCK.
   *
   * `ready-short` is the THREE REAL CAPTURED GAMES - real ids, real kickoffs, real final
   * scores, real records - with the clock after them. That is the 3-row case and it is
   * the only place on this screen where nothing at all is synthetic.
   *
   * `ready` is the 131-row density case, and it carries NONE of them. The captured games
   * are finals on the Friday and Saturday; a 131-game slate you can still pick needs a
   * clock BEFORE the week. Both cannot be true at once, and a final game dated in the
   * future is exactly the kind of invented shape `_make.py` got away with while 306 tests
   * passed. So `ready` is built from REAL TEAM IDENTITIES with SYNTHETIC PAIRINGS and
   * SYNTHETIC KICKOFFS, said plainly in the footnote the screen renders. */
  /* 🔴 THE NFL NEVER FALLS BACK. Everything below this line — the 131-row
   * generated week, the color probes, the synthetic pairings — is drawn from
   * `teams.json`, which is the COLLEGE database. There is no NFL team in it, so
   * a fallback under an NFL heading cannot produce an NFL game; it produces
   * Villanova at Louisville with the wrong label on top, which is precisely the
   * bug being fixed and worse, because it would then be deliberate.
   *
   * 32 clubs and 16 games is a week that is either captured or not. When it is
   * not, this returns nothing and the screen draws its EMPTY state, which is an
   * honest answer. */
  const short = state === 'ready-short';
  if (sport === 'nfl') {
    const nfl = live || [];
    const tb = nfl.find((g) => g.status === 'scheduled') || nfl[nfl.length - 1];
    return {
      /* 🔴 Date.now(), NOT the `now` below. That binding is a `let` declared ~110
       * lines further down, so naming it here is a temporal dead zone reference
       * that throws "Cannot access 'now' before initialization" and takes the
       * whole screen with it.
       *
       * And the two are not interchangeable even once it exists: the college
       * route deliberately ANCHORS its clock to the captured Saturday so the
       * designed preview sits in the middle of a real week. The NFL route is
       * reading a live feed, so its clock is the actual wall clock. Reusing the
       * anchored one would date a real slate to a fixture's afternoon. */
      now: Date.now(), sport: 'nfl', mode, games: nfl, picks: {},
      /* No pool exists yet in either sport, and an NFL slate must not inherit
       * the college mock's Big Ten scope on its way past. */
      pool: {
        id: null, name: 'No pool yet', commissionerId: null,
        scope: 'all', scopeArg: null, rankingSource: null,
        ats: false, season: 2026, scopeLockedAt: null, memberCount: 0
      },
      tiebreak: { gameId: tb && tb.id, predictedTotal: null },
      captured: nfl.length, synthetic: 0, fromFeed: nfl.length > 0
    };
  }
  const target = short ? real.length : 131;
  const ats = !short;
  /* 🔴 THE FEED WINS WHERE THERE IS ONE. `live` is the real week off ESPN,
   * pushed to KV by tools/poll-slate.mjs. When it is there the generated week
   * below never runs — no invented matchup, no invented line, no invented final.
   * When it is not, the fallback still draws and the footer still says how many
   * of the rows were captured, so the screen can never quietly claim more real
   * data than it has. */
  const games = live ? live.slice() : (short ? real.slice() : []);
  const fromFeed = live ? live.length : 0;

  /* Week 2 runs Thu 3 Sep -> Sun 6 Sep 2026, anchored on the real fixtures' own Saturday. */
  const sat = new Date(real.length ? real[1].kickoffUtc : Date.UTC(2026, 8, 5, 16, 30));
  sat.setHours(0, 0, 0, 0);
  const DAY = 86400000;
  const dayOffsets = [-2, -1, 0, 0, 0, 0, 1];     /* Thu, Fri, Sat x4, Sun - a real college week */
  const hours = [9, 12, 12, 15, 16, 17, 19, 19, 20];

  const rnd = lcg(20260905);
  const used = new Set(games.flatMap((g) => [g.home.id, g.away.id]));
  const pool = all.filter((t) => !used.has(t.id));
  let cursor = 0;
  const nextTeam = () => { while (cursor < pool.length && used.has(pool[cursor].id)) cursor++; const t = pool[cursor++]; if (t) used.add(t.id); return t; };

  const pairs = [];
  /* The color probes belong to the 131-row route only. `ready-short` is the THREE REAL
   * CAPTURED GAMES and nothing else - adding six synthetic pairings to it would make the
   * one route where nothing is invented into a route where two thirds of it is. */
  if (!short) {
    for (const [a, b] of PROBE_IDS) if (byId[a] && byId[b]) { pairs.push([byId[a], byId[b]]); used.add(a); used.add(b); }
  }
  while (games.length + pairs.length < target) {
    const a = nextTeam(), b = nextTeam();
    if (!a || !b) break;
    pairs.push([a, b]);
  }

  for (let i = 0; i < pairs.length; i++) {
    const [away, home] = pairs[i];
    let d;
    if (i < PROBE_N && !short) {
      /* The six color probes share the Thursday morning window so they land in one group,
       * contiguous, at the top. `now` is set to 10:45 below, so three of them have kicked
       * off and three are still open - which puts every color pair AND four of the seven
       * row states on the first screen at 393px. */
      d = new Date(sat.getTime() - 2 * DAY);
      d.setHours(9, i * 30, 0, 0);
    } else {
      d = new Date(sat.getTime() + dayOffsets[i % dayOffsets.length] * DAY);
      d.setHours(hours[(i * 3) % hours.length], (i % 4) * 15, 0, 0);
    }
    const r = rnd();
    /* The first four rows are forced to final, final, void and in_progress. Looking at
     * this at 393px is the only thing that closes it, and a resolved state that is 60
     * rows down cannot be looked at. The rest are seeded at roughly a real proportion. */
    const forced = ['final', 'final', 'void', 'in_progress'][i];
    const status = forced || (r < 0.06 ? 'final' : r < 0.10 ? 'in_progress' : r < 0.115 ? 'void' : 'scheduled');
    const hs = status === 'scheduled' ? null : Math.floor(rnd() * 45);
    const as = status === 'scheduled' ? null : Math.floor(rnd() * 45);
    if (live) break;                 // the feed already gave us the week
    games.push(slateGame({
      id: 'g' + (i + 1),
      kickoffUtc: d.getTime(),
      home, away,
      spread: r < 0.12 ? null : Math.round((rnd() * 56 - 28) * 2) / 2,
      status, homeScore: hs, awayScore: as,
      homeRecord: (1 - (i % 2)) + '-' + (i % 2), awayRecord: (i % 2) + '-' + (1 - (i % 2))
    }));
  }

  /* The picks. Deterministic so the preview does not change under you between reloads.
   * Every row state in the union is present in the first two groups on purpose. */
  /* 🔴 NO INVENTED PICKS OVER REAL GAMES. Everything below seeds a deterministic
   * set of picks and crowd splits so the preview shows every row state. That is
   * right for a design surface and a lie on a real slate — it had Louisville
   * highlighted as though somebody had chosen it. */
  const picks = {};
  const pr = lcg(77);
  for (let i = 0; !live && i < games.length; i++) {
    const g = games[i];
    const take = short ? i === 1 : pr() < 0.42;
    const side = take ? (pr() < 0.5 ? 'home' : 'away') : null;
    /* THE POOL'S OWN SPLIT, never global, and NULL UNTIL THIS USER HAS PICKED.
     * A number before the tap is a nudge; after it, a conversation. */
    const n = side ? 3 + Math.floor(pr() * 12) : 0;
    const h = side ? Math.round((0.2 + pr() * 0.6) * n) / n : 0;
    picks[g.id] = {
      gameId: g.id, side, state: 'unpicked', lockedAt: g.kickoffUtc,
      crowd: side ? { home: h, away: 1 - h, n } : null
    };
  }


  /* THE CLOCK. `ready-short` sits after the three real finals. `ready` sits at 10:45 on
   * the Thursday - three of the six color probes have kicked off and three have not, so
   * every color pair AND four of the seven row states are on the first screen at 393px. */
  const anchor = new Date(sat.getTime() - 2 * DAY);
  anchor.setHours(10, 45, 0, 0);
  let now = anchor.getTime();
  if (short && real.length === 3) {
    /* Between the second and third captured kickoff. Two of the three are genuinely over
     * and carry their real final scores; the third has not kicked off yet, so its result
     * is WITHHELD rather than shown early - status back to `scheduled`, scores back to
     * null. That is not inventing data, it is declining to show data the clock has not
     * reached, which is what a real slate does. It is also the only way a 3-row route has
     * a row you can actually tap. */
    now = real[1].kickoffUtc + 90 * 60000;
    for (const g of games) {
      if (g.kickoffUtc > now) { g.status = 'scheduled'; g.homeScore = null; g.awayScore = null; }
    }
  }
  /* The tiebreak names ONE game of the week and it must be a game still to be played -
   * computed AFTER the clock above has settled which those are. */
  /* EVERY ROW STATE MUST HAVE SOMEWHERE TO BE LOOKED AT. Measured in the browser rather
   * than assumed: the first pass produced won 3, locked 13, void 2, in_progress 3,
   * picked 43, unpicked 67 - and ZERO `lost`, because the seeded picks happened to land
   * on the winner in all three resolved games. A state with no route is a state nobody
   * ever draws. So the first two finals are pinned to a win and a miss. */
  const finals = games.filter((g) => g.status === 'final' && winnerOf(g));
  /* Same rule: on a real slate there is nobody to have picked these, so this
   * block is skipped entirely rather than guarded field by field. */
  if (!live && finals.length >= 2) {
    const w = winnerOf(finals[0]);
    picks[finals[0].id].side = w;
    picks[finals[1].id].side = winnerOf(finals[1]) === 'home' ? 'away' : 'home';
    for (const f of [finals[0], finals[1]]) {
      if (!picks[f.id].crowd) picks[f.id].crowd = seedCrowd(f.id, 14);
    }
  }

  const tiebreakGame = games.find((g) => g.status === 'scheduled') || games[games.length - 1];

  return {
    now,
    sport,
    mode,
    /* 🔴 A REAL SLATE CANNOT WEAR AN INVENTED POOL. Jason: "From the nfl page,
     * the pool goes to the ncaa page where Louisville is already selected...
     * It also says big 10."
     *
     * Both are the same fault. The games came off the feed and everything AROUND
     * them was still the mock: a pool called "Big Ten, eight of us" with a Big
     * Ten scope over a slate containing Florida A&M and Howard, eight members
     * who do not exist, and a pick already made on a game nobody chose.
     *
     * A fabricated pick is worse than a fabricated name. A name is wallpaper; a
     * highlighted team is the app telling you what YOU did. */
    pool: live ? {
      id: null,
      name: 'No pool yet',
      commissionerId: null,
      scope: 'all', scopeArg: null, rankingSource: null,
      ats: false, season: 2026, scopeLockedAt: null,
      memberCount: 0
    } : {
      id: 'K7RQXZ',
      name: short ? 'Big Ten, eight of us' : 'Saturday Regulars',
      commissionerId: 'u1',
      scope: short ? 'conference' : 'all',
      scopeArg: short ? 'Big Ten' : null,
      rankingSource: null,
      ats, season: 2026, scopeLockedAt: null,
      memberCount: short ? 8 : 14
    },
    games, picks,
    tiebreak: { gameId: tiebreakGame && tiebreakGame.id, predictedTotal: null },
    /* 🔴 COUNT WHAT IS ACTUALLY CAPTURED, not what was loaded. The first version read
     * `games.length - real.length` and the 131-row route printed "3 captured from the
     * feed" while carrying none of them - a footnote asserting real data that was not
     * there, which is the exact failure `_make.py` got away with. Caught by reading the
     * rendered line at 393px. */
    /* Counts what is ACTUALLY on the wire, never what was loaded. */
    captured: fromFeed || (short ? real.length : 0),
    synthetic: games.length - (fromFeed || (short ? real.length : 0)),
    fromFeed: fromFeed > 0
  };
}

/* ------------------------------------------------------------------ render */

const NS = 'http://www.w3.org/2000/svg';
function icon(kind) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '14'); svg.setAttribute('height', '14');
  svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'p2-icon p2-icon-' + kind);
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', 'currentColor');
  p.setAttribute('stroke-width', '2');
  p.setAttribute('stroke-linecap', 'round');
  p.setAttribute('stroke-linejoin', 'round');
  if (kind === 'check') p.setAttribute('d', 'M2.5 8.5 L6 12 L13.5 4');
  else if (kind === 'cross') p.setAttribute('d', 'M4 4 L12 12 M12 4 L4 12');
  else if (kind === 'dash') p.setAttribute('d', 'M3.5 8 H12.5');
  else if (kind === 'lock') { p.setAttribute('d', 'M4.5 7 V4.75 A3.5 3.5 0 0 1 11.5 4.75 V7 M3.5 7 H12.5 V14 H3.5 Z'); }
  svg.appendChild(p);
  return svg;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/** ONE tap zone. THE PICK IS A TAP ON A SIDE - at 393px there is no room for a row and
 *  a control beside it, which is the reason CBS split its card in two and the reason
 *  this is a <button> rather than a row with a checkbox at the end. */
function zone(ctx, game, side) {
  const team = game[side];
  const b = el('button', 'p2-zone');
  b.type = 'button';
  b.dataset.side = side;
  b.dataset.game = game.id;
  applyTeamVars(b, team);          /* --team-a / --team-b, PER ELEMENT. Never at :root */

  /* SPREAD AND CROWD SIT ON DIFFERENT LINES, and that is a measurement rather than a
   * preference. The first render at 393px put both inboard on line 2 and `James Madison`
   * came out as `James Madis...`. A truncated school name is the identification job
   * failing - and with no marks anywhere in this product, the name in type IS the
   * identification. So the crowd rides with the record on line 1 and the spread rides
   * with the name on line 2, which gives the name back about 40px. */
  const pick = ctx.picks[game.id];
  const l1 = el('div', 'p2-l1');
  const chip = teamChip(team, { size: 18, adjacentTo: game[side === 'home' ? 'away' : 'home'] });
  const rec = el('span', 'p2-rec num', game[side + 'Record'] || '');
  const crowdWrap = el('span', 'p2-meta');
  /* 🔴 CROWD IS THE POOL'S OWN AND NOBODY SEES ANYTHING UNTIL THE GAME LOCKS.
   * Jason, 2026-09-08 - this replaces the after-you-pick rule from earlier the same
   * day. Before kickoff the slot is empty for everybody; at kickoff the split appears
   * for everybody at once, and by then nobody can act on it.
   *
   * It also closes a hole the old rule had: the split used to be purchasable with a
   * tap - pick the game, read the number, change your pick. */
  /* 🔴 ctx.now, NOT now. A bare `now` here threw "now is not defined" and the
   * error boundary swallowed the rest of the slate — the pool header and the
   * first row drew, then nothing. Found 2026-09-08 by walking every screen on
   * the deployed domain; two lines below this one already say `ctx.now`, which
   * is what makes the typo invisible on a read. */
  const locked = !!(game && game.kickoffUtc != null && ctx.now >= game.kickoffUtc);
  if (locked && pick && pick.crowd) {
    const c = el('span', 'p2-crowd num', crowdLabel(pick.crowd[side], pick.crowd.n, true));
    if (side === pick.side) c.dataset.mine = 'true';
    crowdWrap.appendChild(c);
  }

  /* THE RESULT MARK. Symmetric by construction: ONE component, ONE slot, ONE size, and
   * only the sign changes. --up / --down are reached here and nowhere else on this screen.
   * It is a FLEX ITEM, not an absolutely positioned badge - the first render pinned it to
   * the corner and it landed on top of the crowd figure the moment crowd moved to line 1.
   * A mark that can overlap is a mark that will. */
  const st = pickStateOf(game, pick, ctx.now);
  const mine = pick && pick.side === side;
  if (mine && (st === 'won' || st === 'lost' || st === 'void')) {
    const m = el('span', 'p2-result');
    m.dataset.result = st;
    m.appendChild(icon(st === 'won' ? 'check' : st === 'lost' ? 'cross' : 'dash'));
    m.setAttribute('title', st === 'won' ? 'You had this one' : st === 'lost' ? 'Missed' : 'Void - the game did not happen');
    if (side === 'home') crowdWrap.prepend(m); else crowdWrap.appendChild(m);
  }

  if (side === 'home') { l1.append(crowdWrap, rec, chip); } else { l1.append(chip, rec, crowdWrap); }

  const l2 = el('div', 'p2-l2');
  const nm = el('span', 'p2-name', team.short || team.name);
  const meta = el('span', 'p2-meta');
/* 🔴 THE LINE IS PUBLISHED WHETHER OR NOT THE POOL SCORES BY IT. Jason,
   * 2026-09-08: "Aren't we publishing the spread on the pool?"
   *
   * It was gated on `pool.ats`, and that conflated two different things. `ats`
   * is a SCORING RULE — does beating the number win you the game. Showing the
   * number is INFORMATION, and it is the single most useful thing on a pick row
   * in a straight-up pool too: it is how you know Miami over Florida A&M is not
   * a pick anybody gets credit for having made.
   *
   * The regression was mine and it came in sideways. Replacing the mock pool
   * with a real "No pool yet" set `ats: false`, and a line captured off the feed
   * with the book named — 16 of 16 NFL games carry one — stopped rendering
   * because a scoring flag said so.
   *
   * A null spread still renders nothing. A game with no posted line shows no
   * number, never a zero and never an invented one. */
  {
    const sp = spreadText(game.spread, side);
    if (sp) meta.appendChild(el('span', 'p2-spread num', sp));
    /* 🔴 THE PRICE IS ON THE ROW, BEFORE THE TAP. This is the differentiator
     * doctrine names, applied to the week's card rather than to a live tile:
     * Armchair's tile says nothing about what it pays and the figure appears in
     * the banner that congratulates you afterwards. A payout somebody learns
     * after choosing is not a price, it is a reveal.
     *
     * Only in `week`. The office pool has no price because it has no stake. */
    if (ctx.mode === 'week') {
      const px = priceFromSpread(game.spread, side, ctx.sport);
      if (px != null) {
        const b = el('span', 'p2-price num', px.toFixed(2) + '×');
        /* At the floor the model is saying "this is not a question". Marked so
         * the row reads as one to skip rather than one to take. */
        if (px <= 1.12) b.classList.add('is-thin');
        meta.appendChild(b);
      }
    }
  }
  if (side === 'home') { l2.append(meta, nm); } else { l2.append(nm, meta); }
  b.append(l1, l2);

  if (mine) b.dataset.pick = 'on';

  const open = st === 'unpicked' || st === 'picked';
  b.disabled = !open;
  b.setAttribute('aria-pressed', String(pick && pick.side === side));
  b.setAttribute('aria-label', (team.name || team.short) + (open ? '' : ' \u2013 locked'));
  if (open) b.addEventListener('click', () => ctx.onPick(game.id, side));
  return b;
}

/** The center column. AQB's move, and it is the elegant part of that screen: the kickoff
 *  time is REPLACED IN PLACE by the live state. Same slot, no badge, no extra column. */
function center(ctx, game) {
  const c = el('div', 'p2-center num');
  if (game.status === 'void') {
    c.dataset.kind = 'void';
    c.appendChild(el('span', 'p2-c-lo', 'Void'));
    return c;
  }
  if (game.status === 'final' || game.status === 'in_progress') {
    const w = winnerOf(game);
    const top = el('span', 'p2-c-lo', game.status === 'final' ? 'Final' : 'Live');
    if (game.status === 'in_progress') top.dataset.live = 'true';
    const sc = el('span', 'p2-score');
    const a = el('b', 'p2-sc', String(game.awayScore == null ? '\u2013' : game.awayScore));
    const h = el('b', 'p2-sc', String(game.homeScore == null ? '\u2013' : game.homeScore));
    if (w === 'home') a.dataset.loser = 'true';
    if (w === 'away') h.dataset.loser = 'true';
    sc.append(a, el('span', 'p2-sc-sep', '\u2013'), h);
    c.append(top, sc);
    return c;
  }
  if (ctx.now >= game.kickoffUtc) {
    /* THE PADLOCK ALONE. First render at 393px put the word `LOCKED` under it on every
     * row and nine of them ran down the middle of one screen - which is Sofascore's
     * repeated competition header arriving in a column instead of a card. The glyph is
     * the label. */
    c.dataset.kind = 'locked';
    c.appendChild(icon('lock'));
    c.setAttribute('title', 'Locked at kickoff');
    return c;
  }
  c.dataset.kind = 'time';
  c.appendChild(el('span', 'p2-time', timeLabel(game.kickoffUtc)));
  return c;
}

function row(ctx, game) {
  const r = el('div', 'p2-row');
  r.dataset.state = pickStateOf(game, ctx.picks[game.id], ctx.now);
  r.dataset.gameId = game.id;
  r.append(zone(ctx, game, 'away'), center(ctx, game), zone(ctx, game, 'home'));
  return r;
}

export function render(root, data, state) {
  root.classList.add('scr-p2-slate');
  root.innerHTML = '';
  const style = el('style');
  style.textContent = [TEAM_CHIP_CSS, STATES_CSS].join('\n');
  root.appendChild(style);

  if (state === 'loading') {
    head(root, data, null);
    root.appendChild(stateBlock('loading', { rows: 7, body: 'Building this week\u2019s slate\u2026' }));
    return;
  }
  if (state === 'offline') {
    head(root, data, null);
    root.appendChild(stateBlock('offline', {
      /* 🔴 ONE PROMISE, BOTH SCREENS. This said the picks were SAVED and would go
       * up later; P4 disabled editing and said a late change would not count. Same
       * user, same pick, and one of them was lying - edit at 12:58 with no signal,
       * kickoff at 13:00, reconnect at 13:05. Jason settled it 2026-09-08: queue it,
       * show it as pending, and let the SERVER rule on arrival. */
      body: 'Your changes are queued on this phone and go up when you are back. Each one counts only if it reaches us before that game kicks off, and we rule on that when it arrives, by our clock rather than the one in your pocket. Until it lands it is queued, not made.',
      since: Date.now() - 62000,
      action: { label: 'Try again' }
    }));
    return;
  }
  if (state === 'error') {
    head(root, data, null);
    root.appendChild(stateBlock('error', {
      title: 'The slate did not load',
      body: 'Your picks are safe. This is the schedule, not your entry.',
      action: { label: 'Reload' }
    }));
    return;
  }
  if (state === 'empty') {
    head(root, { pool: { name: 'Ranked only', scope: 'ranked_v_ranked', ats: false, memberCount: 9 }, games: [], picks: {} }, null);
    root.appendChild(stateBlock('empty', {
      title: 'No games in this scope this week',
      /* NOT a dead end. AQB's empty NCAA tab is one centered line with no way forward,
       * and that is the thing this is written against. The scope is the commissioner's,
       * so the way forward is the other two destinations, not a filter on this screen. */
      body: 'This pool is set to ranked vs ranked. Week 2 has no game where both teams are ranked. The scope is the commissioner\u2019s and it is editable until week 1 kicks off.',
      action: { label: 'See the standings' }
    }));
    return;
  }

  /* ---- ready ---- */
  const ctx = {
    pool: data.pool, picks: data.picks, now: data.now,
    /* Which product this screen is being used as, and which league's points the
     * price model is reading. Both travel in ctx so row() and zone() never touch
     * localStorage - render() stays pure DOM over its argument. */
    mode: data.mode || 'pool', sport: data.sport || 'college-football',
    onPick: (gameId, side) => {
      const p = ctx.picks[gameId];
      p.side = p.side === side ? null : side;
      /* The crowd arrives WITH the pick and leaves with it. It is not cached from a
       * previous tap, because the rule is about what you see before you commit. */
      p.crowd = p.side ? (p.crowd || seedCrowd(gameId, ctx.pool.memberCount)) : null;
      const old = root.querySelector('.p2-row[data-game-id="' + cssEsc(gameId) + '"]');
      const game = data.games.find((g) => g.id === gameId);
      if (old && game) old.replaceWith(row(ctx, game));
      paintProgress();
    }
  };

  head(root, data, null);

  const groups = groupsOf(data.games);
  const days = daysOf(groups);

  /* THE JUMP STRIP. 131 games is roughly 8,000px of scroll and Sunday is unreachable
   * without it. This is GROUPING MADE NAVIGABLE and it is NOT a search box and NOT a
   * filter: it changes where you are, never which games exist. */
  if (days.length > 1 && data.games.length >= JUMP_STRIP_MIN) {
    const strip = el('div', 'p2-days ag-scroll-x');
    strip.setAttribute('role', 'group');
    strip.setAttribute('aria-label', 'Jump to a day');
    for (const d of days) {
      const b = el('button', 'p2-day');
      b.type = 'button';
      b.append(el('span', 'p2-day-l', d.label), el('span', 'p2-day-n num', String(d.count)));
      b.addEventListener('click', () => {
        const t = root.querySelector('.p2-grp[data-key="' + cssEsc(d.anchor) + '"]');
        if (t) t.scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
      strip.appendChild(b);
    }
    root.appendChild(strip);
  }

  /* CBS's `AWAY / 0-of-15 Picks / HOME` - ONE element doing column labels and progress at
   * the same time. Sticky, so progress is visible without leaving the screen. */
  const bar = el('div', 'p2-bar');
  bar.append(el('span', 'p2-bar-l', 'AWAY'), el('span', 'p2-bar-p num'), el('span', 'p2-bar-l', 'HOME'));
  root.appendChild(bar);
  const paintProgress = () => {
    bar.querySelector('.p2-bar-p').textContent = progress(countPicked(data.games, ctx.picks), data.games.length);
  };
  paintProgress();

  const list = el('div', 'p2-list');
  for (const g of groups) {
    const h = el('div', 'p2-grp');
    h.dataset.key = g.key;
    h.append(el('span', 'p2-grp-d', groupLabel(g)),
             el('span', 'p2-grp-n num', g.games.length + (g.games.length === 1 ? ' game' : ' games')));
    list.appendChild(h);
    for (const game of g.games) list.appendChild(row(ctx, game));
  }
  root.appendChild(list);

  /* THE TIEBREAK. ONE field, one named game of the week, at the foot. CBS ships four -
   * `Total Points for LVILLE`, `MISS`, `SMU`, `FSU` - which is a national-contest answer.
   * A conference-scoped pool is about eight picks and four fields would outweigh the
   * slate they break a tie on. */
  const tb = data.games.find((g) => g.id === (data.tiebreak && data.tiebreak.gameId)) || data.games[0];
  if (tb) {
    const card = el('div', 'card p2-tb');
    card.append(el('div', 'p2-tb-k', 'Tiebreaker'));
    const rowEl = el('label', 'p2-tb-row');
    rowEl.append(el('span', 'p2-tb-q', 'Combined points in ' + (tb.away.short || tb.away.name) + ' at ' + (tb.home.short || tb.home.name)));
    const input = el('input', 'p2-tb-in num');
    input.type = 'number'; input.inputMode = 'numeric'; input.min = '0'; input.max = '200';
    input.placeholder = '\u2014';
    input.setAttribute('aria-label', 'Predicted combined points');
    rowEl.appendChild(input);
    card.appendChild(rowEl);
    card.append(el('p', 'p2-tb-n', 'One number, the same game for everybody. It breaks a tie and does nothing else.'));
    root.appendChild(card);
  }

  /* SAYS PLAINLY WHAT IS REAL. Every team on this screen is a real identity out of
   * fixtures/teams.json; the pairings and kickoffs on the 131-row route are not, because
   * a real 131-game slate is a capture job and not a file this piece may write. */
  const note = el('p', 'p2-note');
  const cap = data.captured || 0;
  note.textContent = !data.synthetic
    ? `${data.games.length} games, all captured from the feed`
    : cap
      ? `${data.games.length} games \u00b7 ${cap} captured from the feed, ${data.synthetic} paired from real team identities for this preview`
      : `${data.games.length} games \u00b7 real team identities, synthetic pairings and kickoff times. A real ${data.games.length}-game slate is a capture job`;
  root.appendChild(note);
}

function seedCrowd(gameId, n) {
  let s = 0;
  for (let i = 0; i < gameId.length; i++) s = (s * 31 + gameId.charCodeAt(i)) >>> 0;
  const m = Math.max(1, n);
  const h = Math.round((0.2 + (s % 61) / 100) * m) / m;
  return { home: h, away: 1 - h, n: m };
}

function cssEsc(s) { return String(s).replace(/["\\]/g, '\\$&'); }

/** The head. NOTHING SITS IN FRONT OF THE SLATE - no account wall, no install prompt, no
 *  interstitial. The pool name at 17px is the largest type on this screen and that is the
 *  whole answer to the unassigned headline figure. */
const SPORT_NAME = { nfl: 'NFL', 'college-football': 'College' };

function head(root, data, _) {
  const h = el('h1', 'p2-h', (data && data.pool && data.pool.name) || 'The slate');
  root.appendChild(h);
  /* 🔴 THE SCREEN SAYS WHICH SPORT IT IS SHOWING. The bug was invisible for as
   * long as it was because nothing on the slate ever named a league — sixteen
   * college games and sixteen NFL games are the same screen until one of them
   * says so. A row that can be wrong has to be a row that can be READ as wrong. */
  const sp = (data && data.sport) || 'college-football';
  const tag = el('span', 'p2-league', SPORT_NAME[sp] || 'College');
  h.appendChild(tag);
  /* 🔴 THE SCREEN SAYS WHICH HALF OF THE APP IT IS. Jason, 2026-09-08: "is this
   * the office pool or the betting for the marbles?" — and that he had to ask
   * is the finding. Two halves, one bottom nav, and nothing on the screen
   * distinguished them.
   *
   * It is the pool: a group picking winners for a week, scored against each
   * other in POINTS. No price, no payout, no bank, and the two boards never sum.
   *
   * 🔴 AND IT SAYS SO WITHOUT NAMING THE OTHER HALF. The first draft of this
   * line ended "no marbles" and a test caught it: a pool screen that mentions
   * the balance to deny it is still a pool screen with the balance written on
   * it. The separation is defended by the word that IS here — "group pool",
   * "points" — never by a disclaimer about the word that is not. */
  const kicker = el('p', 'p2-half', (data && data.mode) === 'week'
    ? "The week's card · staked in marbles · priced off the line"
    : 'Office pool · your group · scored in points');
  root.insertBefore(kicker, h);
  const p = data && data.pool;
  if (p) {
    const bits = [SCOPE_LABEL[p.scope] || 'All games'];
    if (p.scopeArg) bits[0] = p.scopeArg;
    bits.push(p.ats ? 'Against the spread' : 'Straight up');
    bits.push(p.memberCount + (p.memberCount === 1 ? ' member' : ' members'));
    const sub = el('p', 'p2-sub num', bits.join(' \u00b7 '));
    root.appendChild(sub);
  }
}

const SCOPE_LABEL = {
  all: 'All games', top25: 'Top 25', conference: 'One conference',
  ranked_v_ranked: 'Ranked vs ranked', handpick: 'The commissioner\u2019s pick'
};
