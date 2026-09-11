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
import { pageHeader } from '/components/header.js';
import { progress, crowdLabel } from '/components/fmt.js';
/* 🔴 THE FILTER IS IMPORTED, NOT REIMPLEMENTED. Two screens deciding
   separately what "Top 25" means is how one of them ends up counting a game
   the other does not - and the counts are printed on the chips, so the
   disagreement would be visible and unexplainable. p6 owns the rule. */
import { filterOptions, gamePasses, FILTER_ALL, filterKey, overlayLive } from '/screens/p6-allgames.screen.js';
/* GROUP POOLS - the current group and its switcher. Read and written only through
   this component (CONTRACT-GROUPS §1, §3). Used in the `group` state alone. */
import { myGroups, pickCurrent, groupSwitcher, GROUP_CSS } from '/components/group.js';

export const id = 'p2-slate';
export const title = 'The slate';
export const bar = 'reference/cbs-pickem-teardown/screens/CBS-picks-week1-15-games-spreads-crowd-desktop.png';

/* The five required states, plus ONE extra route. `ready` is the 131-game slate with
 * against-the-spread ON - the worst case, because if it holds with spreads it holds
 * without. `ready-short` is the three REAL fixture games with ats off - the 3-row case.
 * A layout that only works at fifteen rows is broken, so both are routes, not a claim. */
export const states = ['ready', 'ready-short', 'empty', 'loading', 'offline', 'error', 'group'];

/* 🔴 THE GROUP STATE - `#/gpicks`, the Pool tab of Group pools (CONTRACT-GROUPS §1).
 * Jason, 2026-09-11: "if i am part of a group, great then i can pick games. if i am
 * part of more than one group, then i need a dropdown to enter different selections
 * for the different groups."
 *
 * Everything the group state says is here, in one place, so the test can read every
 * word of it. Points only: nothing staked, no balance, no book language. Members are
 * handles. The no-group card is NOT a dead end - Home's "Group pools" door lands on
 * this screen, so a person in no group is sent to #/g to start or join one. */
export const GROUP_COPY = {
  sub: ' · pick the winners · scored in points',
  subAts: ' · against the spread · scored in points',
  subNoWeek: 'Pick the winners · scored in points',
  rules: { label: 'How it’s scored', href: '#/grules' },
  door: { label: 'Group info ›', href: '#/g' },
  signedOut: {
    title: 'Sign in to pick with your group',
    body: 'Group pools are invite-only, so they go with your account. Sign in and your groups are right here.',
    cta: 'Sign in'
  },
  noGroup: {
    title: 'You are not in a group yet',
    body: 'Group pools are invite-only. Start one and invite your friends, or join one with the code from an invite.',
    cta: 'Start or join a group',
    href: '#/g'
  },
  empty: { title: 'No games on this group’s week yet', body: 'They show up here as soon as the schedule is posted.' },
  offline: { title: 'You are offline', body: 'Your groups did not load. The picks you already made are safe.', cta: 'Try again' },
  error: { title: 'Your groups did not load', body: 'The picks you already made are safe. This is the page, not your entry.', cta: 'Try again' },
  loading: 'Loading your group…',
  refused: 'That pick did not go through.',
  unsent: 'That pick did not reach us. Check your connection and tap it again.'
};

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
/* 🔴 THE WEEK'S CARD IS AGAINST THE SPREAD. Jason, 2026-09-09: "Group pool.
 * Straight up. Weeks card against the spread. So no blowout games."
 *
 * The last sentence is the reason, and it is exactly right. Straight up, a
 * 56.5-point line is not a question - the model said so by saturating, and 19 of
 * 24 college games came back greyed. AGAINST THE SPREAD every one of them is a
 * live question again: Miami are enormous favorites and whether they win by more
 * than 56 is genuinely open. The spread is the instrument that makes a mismatched
 * fixture playable, which is what it was invented for.
 *
 * So the blowout treatment is deleted from the card rather than kept as a
 * special case. It existed to describe a pricing failure that ATS removes.
 *
 * 🔴 A PUSH IS A VOID, not a loss and not a win - one void path, per doctrine.
 * Landing exactly on the number is the game not having happened, for everybody.
 * That is why the line is carried to the half point wherever a book posts one.
 */
export function coversSpread(game, side) {
  if (game.status !== 'final' || game.homeScore == null || game.awayScore == null) return null;
  if (typeof game.spread !== 'number') return null;
  /* Stored as the HOME number, ESPN's convention: negative means home favored. */
  const m = game.homeScore + game.spread - game.awayScore;
  if (m === 0) return 'push';
  const covered = m > 0 ? 'home' : 'away';
  return covered === side ? 'won' : 'lost';
}

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
export function pickStateOf(game, pick, now, mode) {
  if (game.status === 'void') return 'void';
  const side = pick && pick.side;
  const started = game.status !== 'scheduled' || now >= game.kickoffUtc;
  if (!side) return started ? 'locked' : 'unpicked';
  if (game.status === 'final') {
    /* 🔴 THE TWO PRODUCTS SETTLE DIFFERENTLY ON THE SAME GAME, which is the
     * whole point of them being two products. The pool asks who won; the week's
     * card asks who covered. A game can be a win in one and a loss in the other,
     * and that is correct rather than a contradiction - it is also why the two
     * boards never sum. */
    /* 🔴 THE MARKET IS PART OF THE PICK, so it is part of the settlement. A row
     * taken on the WINNER is graded on who won; the same row taken on the SPREAD
     * is graded on who covered. Reading the pool's mode alone would settle a
     * moneyline pick against a line the person deliberately declined. */
    /* 'ats' is a GROUP with against-the-spread on (group.ats): graded on the
     * cover like the week's card, and - unlike it - never priced. */
    if ((mode === 'week' || mode === 'ats') && (!pick || pick.market !== 'winner')) {
      const r = coversSpread(game, side);
      /* No posted line means nothing to cover, so it falls back to the winner
       * rather than voiding a game that was really played. */
      if (r === 'push') return 'void';
      if (r) return r === 'won' ? 'won' : 'lost';
    }
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
    /* 🔴 RANK AND CONFERENCE TRAVEL. Same allow-list mapper hazard p6 had
       three times today: this rebuilds a game key by key, so a field the
       capture starts writing is invisible here until somebody adds a line -
       and the symptom is a filter that renders one chip, never an error. */
    rankHome: typeof o.rankHome === 'number' ? o.rankHome : null,
    rankAway: typeof o.rankAway === 'number' ? o.rankAway : null,
    conferences: Array.isArray(o.conferences) ? o.conferences : [],
    id: o.id, week: 2, kickoffUtc: o.kickoffUtc, home: o.home, away: o.away,
    venue: o.venue || null, broadcast: o.broadcast || null,
    spreadProvider: o.spreadProvider || null,
    spread: o.spread == null ? null : o.spread,
    status: o.status || 'scheduled',
    homeScore: o.homeScore == null ? null : o.homeScore,
    awayScore: o.awayScore == null ? null : o.awayScore,
    homeRecord: o.homeRecord || null, awayRecord: o.awayRecord || null,
    /* Per-team form rides on the team objects, which are merged from the
       capture - so it needs no line here. The last meeting is about the PAIR
       and has nowhere else to live. */
    lastMeeting: o.lastMeeting || null
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

/* 🔴 THE PRICE AGAINST THE SPREAD IS 2.00x, BOTH SIDES, AND THAT IS THE HONEST
 * NUMBER RATHER THAN A PLACEHOLDER.
 *
 * A posted line is the market's best estimate of the point at which the two
 * sides are equally likely - that is what it is FOR. So p is 0.50 either way and
 * `stake / p` is exactly 2. Varying it would mean claiming we know better than
 * the book about which side of its own number is the value, which we do not and
 * have no data to support.
 *
 * 🔴 AND WE TAKE NO VIG, so it really is 2.00 and not 1.91. A book prices both
 * sides under 2 because that gap is its revenue. Nothing here is bought and
 * nothing is redeemable, so there is no house to pay - shaving the payout would
 * be imitating the shape of a sportsbook while having none of its reasons.
 *
 * THE PRICE STILL APPEARS BEFORE THE TAP, unchanged doctrine. That it is the
 * same number on every row is a fact about the product, not a reason to hide it:
 * an ATS card is a card of coin flips, and saying so plainly is better than
 * implying a spread of prices this data cannot support.
 *
 * A game with no posted line has no ATS price and cannot be graded ATS. It falls
 * back to the winner - see pickStateOf.
 */
/* 🔴 PICKS SURVIVE A RELOAD. Jason, 2026-09-09: "My picks did not stick."
 *
 * They lived in an object built by previewData and thrown away on the next
 * render - fine for a designed preview that ships its own picks, useless the
 * moment somebody makes a real one.
 *
 * 🔴 SCOPED BY SPORT AND WEEK, because the two slates are different cards and a
 * game id is unique only within one. A shared bucket would put last week's picks
 * on this week's rows, which is worse than losing them: it is the app claiming
 * you picked something you did not.
 *
 * 🔴 STILL NOT A SERVER. There is no pool backend yet, so this is a per-device
 * memory - not shared, not authoritative, and to be REPLACED by real storage
 * rather than extended. Said here so the next session does not mistake it for
 * the pool.
 */
/* 🔴 A DEVICE ID, WHICH IS THE ONLY IDENTITY THIS APP HAS. No account, no email,
 * no password - doctrine says nothing sits in front of the slate and the most
 * that may be asked is a display name, after the first pick. Generated once and
 * kept; if storage is cleared you become a new person, which is the honest
 * consequence of having asked for nothing. */
function deviceId() {
  try {
    let v = localStorage.getItem('ag.device');
    /* The live screen used to store it JSON-quoted; unwrap and write back bare. */
    if (v && v[0] === '"') { v = v.replace(/"/g, ''); localStorage.setItem('ag.device', v); }
    if (!v) {
      v = 'd' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('ag.device', v);
    }
    return v;
  } catch { return 'anon'; }
}

/* 🔴 THE PICK GOES TO THE SERVER AS WELL AS TO THIS PHONE, and the local write
 * is NOT replaced by the network one.
 *
 * localStorage is what makes the row highlight instantly and survive a reload
 * with no signal; D1 is what puts you on a board other people can see. Sending
 * only to the server would make every tap wait on a round trip and vanish on a
 * subway; storing only locally is what we had, and it is a note to yourself.
 *
 * Failure is deliberately silent HERE and visible nowhere else yet: the pick is
 * already saved locally, so a dropped request costs a place on the world board
 * and never the pick. When there is a pool worth being wrong about, this needs a
 * retry queue - and that is a real gap, not a decision. */
/* 🔴 A PICK ON THE PUBLIC SLATE NEVER JOINS A GROUP. CONTRACT-GROUPS §1, amended
 * 2026-09-11: an invite link now opens #/g, where the group page fills Join with
 * the code. A group's picks are its own, so a slate pick could never count there -
 * the first-pick join that lived here is gone, and this screen keeps no invite. */
function postPick(sport, week, game, side) {
  try {
    /* Through the sign-in sheet's fetch: it sends the session when there is
       one, and if the server says an email is required it asks for it and
       retries. See components/signin.js. */
    (window.agApiFetch || fetch)('/api/pool/pick', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        deviceId: deviceId(),
        name: (localStorage.getItem('ag.name') || '').replace(/^"|"$/g, ''),
        gameId: String(game.id), side, sport, week,
        spread: typeof game.spread === 'number' ? game.spread : null,
        kickoffUtc: game.kickoffUtc
      })
    }).catch(() => {});
  } catch { /* no storage, no network, no problem - the pick is still on screen */ }
}

/* 🔴 A GROUP'S PICKS ARE ITS OWN BUCKET. A person in two groups picks differently in
 * each (Jason, 2026-09-11), so the group id is part of the key; the public slate's
 * key is untouched. Still per-device: the server has no route that returns a
 * person's picks for one pool, so this is what makes a group pick survive a reload. */
function picksKey(sport, week, gid) {
  return gid ? 'ag.picks.g.' + gid + '.' + sport + '.' + week : 'ag.picks.' + sport + '.' + week;
}

/** The body of a group pick. `poolId` IS the group's id - that is what puts the pick
 *  in that group and nowhere else. */
export function groupPickBody(groupId, game, side, sport, week) {
  return {
    poolId: String(groupId), gameId: String(game.id), side, sport, week,
    spread: typeof game.spread === 'number' ? game.spread : null,
    kickoffUtc: game.kickoffUtc
  };
}

/** What a refused pick says: the server's own words, verbatim (CONTRACT-GROUPS §2). */
export function pickRefusal(body, status) {
  const said = body && (body.message || body.error);
  if (said) return String(said);
  return status ? GROUP_COPY.refused : GROUP_COPY.unsent;
}

/* A group pick goes to the server and the answer comes back, because a group can
 * refuse it - 403 not a member, 409 kicked off - and a pick the server refused must
 * not stay highlighted on the row. */
async function postGroupPick(groupId, game, side, sport, week) {
  try {
    const r = await (window.agApiFetch || fetch)('/api/pool/pick', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(groupPickBody(groupId, game, side, sport, week))
    });
    if (r.ok) return { ok: true, status: r.status };
    let j = null;
    try { j = await r.json(); } catch { j = null; }
    return { ok: false, status: r.status, message: pickRefusal(j, r.status) };
  } catch {
    return { ok: false, status: 0, message: pickRefusal(null, 0) };
  }
}

/* Stored picks carry only a side. Everything else a row needs is rebuilt against
 * the games actually on the card, so a pick for a game that has left the slate
 * is dropped rather than carried as a ghost. */
function hydrate(stored, games) {
  const out = {};
  for (const g of games) {
    const st = stored[g.id] || {};
    out[g.id] = { gameId: g.id, side: st.side || null, market: st.market || null,
                  state: 'unpicked', lockedAt: g.kickoffUtc, crowd: null };
  }
  return out;
}

function loadPicks(sport, week, gid) {
  try {
    const raw = localStorage.getItem(picksKey(sport, week, gid));
    const o = raw ? JSON.parse(raw) : null;
    return (o && typeof o === 'object') ? o : {};
  } catch { return {}; }
}

function savePicks(sport, week, picks, gid) {
  try {
    /* Only the side is persisted. The crowd is derived and the state is computed
     * from the clock, so a stored copy of either could contradict the live one -
     * and a stored `state` would survive a kickoff it should not. */
    const out = {};
    for (const k of Object.keys(picks || {})) {
      /* The market is persisted even with no side yet: somebody who switches a
       * row to Winner and then scrolls away has expressed a preference about
       * that game, and losing it means the price they were looking at changes
       * back under them. */
      const p = picks[k];
      if (p && (p.side || p.market)) {
        out[k] = {};
        if (p.side) out[k].side = p.side;
        if (p.market) out[k].market = p.market;
      }
    }
    localStorage.setItem(picksKey(sport, week, gid), JSON.stringify(out));
  } catch { /* a private window is allowed to forget */ }
}

/* 🔴 TWO MARKETS ON THE SAME GAME. Jason, 2026-09-09: "What about the
 * availability to switch from points to money line by game. So you can pick and
 * underdog and get a better payout?"
 *
 * This is the thing that going against the spread cost, handed back per row.
 * ATS makes every mismatch playable and flattens every price to 2.00x, so a
 * twenty-four game card became twenty-four identical coin flips - honest, and
 * with nothing to choose between the rows.
 *
 * The WINNER market restores the range without bringing the blowout problem
 * back, because the spread is always right there on the same row. Kansas +5.5
 * pays 2.00x to cover or 3.67x to win outright; taking the dog straight up is a
 * real decision with a real price, and taking Miami -56.5 to win is a decision
 * the model will price at the floor and dim, which is the honest answer rather
 * than a refusal.
 *
 * 🔴 THE MARKET IS STORED ON THE PICK, not on the screen. It decides the payout
 * AND the settlement, so a pick that did not carry its own market would be
 * graded by whatever the row happened to be showing later. Same reason the
 * spread is stored at pick time.
 *
 * Default is the spread: it is the pool half's own rule, it is the shape most
 * people know from an office pool, and it is the one that makes every game
 * worth picking.
 */
export function marketOf(pick) {
  return (pick && pick.market === 'winner') ? 'winner' : 'spread';
}

export function priceAts(spread) {
  return typeof spread === 'number' ? 2 : null;
}

/** `stake / p`, capped at 6x - the doctrine payout, as a multiple.
 *
 *  🔴 NO LONGER USED BY THE WEEK'S CARD, which went against the spread on
 *  2026-09-09 and prices at a flat 2.00x. Kept and still tested because it is
 *  the straight-up pricing model - the shape the live layer uses, and the one
 *  a moneyline card would need if that product is ever wanted. Deleting it
 *  would throw away a measured piece of work to save nothing. */
export function priceFromSpread(spread, side, sport) {
  const p = probFromSpread(spread, side, sport);
  if (p == null) return null;
  return Math.min(6, Math.round((1 / p) * 100) / 100);
}

/* The two sports are not on the same week. College is in week 2 on this date and
 * the NFL is in week 1 — the opener is Wednesday. A single week number would put
 * one of them on an empty key. */
const WEEK = { 'college-football': 2, nfl: 1 };

async function realSlate(byId, sport, weekArg) {
  const season = 2026, week = weekArg || WEEK[sport] || 1;
  try {
    const res = await fetch(`/api/state/slate:${sport}:${season}:${week}`);
    if (!res.ok) return null;
    const d = await res.json();
    if (!Array.isArray(d.games) || !d.games.length) return null;
    const list = d.games.map((g) => {
      /* Identity travels WITH the game, because the shipped team file is a
       * snapshot and the feed is not. Fall back to it only for what is missing. */
      for (const t of g.teams || []) if (t && t.id) byId[t.id] = { ...(byId[t.id] || {}), ...t };
      return slateGame({
        id: g.id, kickoffUtc: g.kickoffUtc,
        venue: g.venue || null, broadcast: g.broadcast || null,
        spreadProvider: g.spreadProvider || null,
        home: byId[g.homeTeamId] || null, away: byId[g.awayTeamId] || null,
        spread: typeof g.spread === 'number' ? g.spread : null,
        status: g.status === 'final' ? 'final' : g.status === 'in_progress' ? 'in_progress' : 'scheduled',
        homeScore: g.homeScore, awayScore: g.awayScore,
        rankHome: g.rankHome, rankAway: g.rankAway, conferences: g.conferences,
        lastMeeting: g.lastMeeting || null
      });
    }).filter((g) => g.home && g.away);
    /* 🔴 THE SAME LIVE OVERLAY AS ALL GAMES, and this is the screen that
     * needs it most: an invite link opens HERE. The pool slate built its
     * games through its own mapper rather than fetchSlate, so the held
     * live score never reached it - during FAMU at Miami it would have
     * shown a game in progress as not started. Imported from p6 rather
     * than restated, so both screens hold to the same delay and close on
     * the same real clock. */
    /* 🔴 THE OVERLAY FAILS SOFT - IT MUST NEVER COST THE SLATE. First
     * version awaited it bare, inside the same try as the slate fetch, so
     * any throw from the overlay landed in `catch { return null }` and
     * dropped the ENTIRE pool slate - the screen an invite link opens,
     * blanked by an enhancement. The ship gate caught it: the p2 tests load
     * this module with its import lines stripped, overlayLive is not
     * defined there, and previewData came back with zero games.
     *
     * That environment is artificial and the lesson is not: live scores are
     * a garnish on a slate that is already correct without them. If the
     * overlay fails for ANY reason, the slate's own values stand. */
    try { return await overlayLive(list, sport); } catch { return list; }
  } catch { return null; }
}

/* 🔴 THE GROUP STATE'S DATA - the one place this screen asks the API about groups
 * (CONTRACT-GROUPS §3). The slate is the GROUP's sport and week, never the sport the
 * main app has selected: an NFL group and a college group are one dropdown apart,
 * and neither may borrow the other's slate or picks. Never throws. */
async function groupData(fixtures) {
  const reload = () => groupData(fixtures);
  const base = {
    groupMode: true, noSample: true, reload, mode: 'pool',
    games: [], picks: {}, groups: [], group: null, now: Date.now(),
    captured: 0, synthetic: 0, fromFeed: false
  };
  let mine = null;
  try { mine = await myGroups({ force: true }); } catch { mine = null; }
  if (!mine) return { ...base, groupState: 'error' };
  if (!mine.signedIn) return { ...base, groupState: 'signed-out' };
  if (mine.error) return { ...base, groupState: mine.error === 'offline' ? 'offline' : 'error' };
  const groups = Array.isArray(mine.groups) ? mine.groups : [];
  const group = pickCurrent(groups);
  if (!group) return { ...base, groups, groupState: 'no-group' };

  /* 🔴 THE BUCKET IS THE PERSON'S AS WELL AS THE GROUP'S. Found at 393px: d2
   * signed in on the phone d1 had just used and was shown d1's D-NFL pick as their
   * own, while the server had d2 at 0 picks. A device is not a person, and the
   * handle is the only account fact this phone holds. */
  let who = '';
  try { who = localStorage.getItem('ag.handle') || ''; } catch { who = ''; }
  const scope = who + '.' + group.id;
  const sport = group.sport === 'nfl' ? 'nfl' : 'college-football';
  /* A one-week group plays its own week; a season group plays the week this screen
   * already reads for that sport. */
  const week = Number.isInteger(group.week) && group.week > 0 ? group.week : (WEEK[sport] || 1);
  const byId = {};
  const db = (fixtures && fixtures.teams && fixtures.teams.teams) || {};
  for (const k of Object.keys(db)) byId[db[k].id] = db[k];
  const games = (await realSlate(byId, sport, week)) || [];
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const tb = games.find((g) => g.status === 'scheduled') || games[games.length - 1];
  /* 🔴 THE SERVER'S COPY OF YOUR PICKS IN THIS GROUP, MERGED OVER THE PHONE'S.
   * Session, 2026-09-11: `/api/pool/picks` exists now, so a pick made on another
   * device, or copied into the group by migration 0007, shows here. The server's
   * side wins where both exist - it is the one that is scored. A market the phone
   * chose is kept. Offline or signed out, the phone's copy stands. */
  const local = loadPicks(sport, week, scope);
  try {
    const r = await (window.agApiFetch || fetch)('/api/pool/picks?pool=' + encodeURIComponent(group.id)
      + '&sport=' + sport + '&week=' + week);
    if (r && r.ok) {
      const j = await r.json();
      for (const p of (j && Array.isArray(j.picks) ? j.picks : [])) {
        if (!p || !p.gameId || (p.side !== 'home' && p.side !== 'away')) continue;
        local[String(p.gameId)] = { ...(local[String(p.gameId)] || {}), side: p.side };
      }
      savePicks(sport, week, local, scope);
    }
  } catch { /* offline or no window: the phone's copy stands */ }
  return {
    ...base, groups, group, sport, week,
    groupState: games.length ? 'ready' : (offline ? 'offline' : 'empty'),
    /* 'ats' grades on the cover; neither group mode is ever priced. */
    mode: group.ats ? 'ats' : 'pool',
    pickScope: scope,
    games, picks: hydrate(local, games),
    pool: {
      id: group.id, name: group.name, commissionerId: null,
      scope: 'all', scopeArg: null, rankingSource: null,
      ats: !!group.ats, season: 2026, scopeLockedAt: null,
      memberCount: group.members || 0
    },
    tiebreak: { gameId: tb && tb.id, predictedTotal: null },
    captured: games.length, synthetic: 0, fromFeed: games.length > 0
  };
}

export async function previewData(fixtures, state) {
  /* Group pools first, and nothing below it: the group state never falls back to
   * a generated week or to the main app's chosen sport. */
  if (state === 'group') return groupData(fixtures);
  const db = fixtures.teams.teams;
  const byId = {};
  for (const k of Object.keys(db)) byId[db[k].id] = db[k];
  const all = Object.values(db);

  /* The feed first. Only if it has nothing to say do we fall back to the
   * captured games and the generated week below. */
  const sport = chosenSport();
  const mode = chosenMode();
  const savedPicks = loadPicks(sport, WEEK[sport] || 1);
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
      now: Date.now(), sport: 'nfl', mode, games: nfl, week: WEEK.nfl,
      picks: hydrate(loadPicks('nfl', WEEK.nfl), nfl),
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

  /* 🔴 A REAL SLATE'S PICKS COME FROM STORAGE, and this needs its own statement
   * rather than a line inside the loop above - which is gated on `!live` and so
   * never runs on a real slate at all. The first version of this fix put the
   * restore inside that loop, wrote the stored pick correctly on every tap, and
   * read it back never. It looked like a persistence bug and was a control-flow
   * one: dead code in a branch that cannot execute.
   *
   * Caught by tapping a row on the deployed site, reloading, and finding the
   * value in localStorage and no highlight on the row - which is exactly the
   * check that the passing test suite could not make. */
  if (live) Object.assign(picks, hydrate(savedPicks, games));


  /* THE CLOCK. `ready-short` sits after the three real finals. `ready` sits at 10:45 on
   * the Thursday - three of the six color probes have kicked off and three have not, so
   * every color pair AND four of the seven row states are on the first screen at 393px. */
  const anchor = new Date(sat.getTime() - 2 * DAY);
  anchor.setHours(10, 45, 0, 0);
  let now = anchor.getTime();
  /* 🔴 A REAL SLATE RUNS ON THE REAL CLOCK. The anchored time above exists so
   * the DESIGNED PREVIEW sits in the middle of a week with some games kicked off
   * and some not - it is a staging device for a screen full of invented
   * kickoffs, and it is right for that.
   *
   * Applied to a live feed it is a lie in both directions: an anchor in the past
   * leaves a game that has already kicked off looking pickable, and an anchor in
   * the future locks a game nobody can play yet. `pickStateOf` compares `now`
   * against the real kickoff, so the wrong clock silently decides which rows a
   * thumb may touch. */
  if (live) now = Date.now();
  /* 🔴 FIXTURE ANCHORING IS FOR FIXTURES ONLY - `!live` IS THE WHOLE FIX.
   * The line just above already moves a live slate onto the real clock.
   * Then this block ran anyway, because /slate is the `ready-short` route and
   * the three captured fixtures always load - so it re-anchored `now` to the
   * fixture Saturday (real[1] + 90 minutes, 5 September) and reset every
   * game kicking after that back to `scheduled` with its scores nulled.
   *
   * That is every real game this season. Found at 5:22 PM with FAMU at
   * Miami 0-14 in the first quarter: overlayLive wrote in_progress and the
   * score, this block wiped both, and the pool slate - the screen an invite
   * link opens - showed a game in progress as "Next up". overlayLive itself
   * was correct in isolation; the bug was a later step undoing it.
   *
   * The anchor was right when this route could only show the three
   * captured finals. It has been wrong since the slate started coming off
   * the feed, and nothing showed it until a real game was live. */
  if (!live && short && real.length === 3) {
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
    week: WEEK[sport] || 1,
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

  const pick = ctx.picks[game.id];
  const st = pickStateOf(game, pick, ctx.now, ctx.mode);
  const mine = pick && pick.side === side;

  /* 🔴 REWRITTEN AS A LINEAR STACK, 2026-09-09. Jason named the order -
   * "Patriots / Spread / Payout" - then, seeing it come out as spread, record,
   * crest, name: "Make it look like the snapshot. Try harder."
   *
   * He was right twice. The block had grown out of a two-line layout - an `l1`
   * holding crest + record + crowd, an `l2` holding the name - and I kept
   * appending new lines to the end of a function whose first two rows were
   * built earlier and in a different order. The output order was an accident of
   * edit history rather than a decision.
   *
   * So it is one list now, top to bottom, and the order is the only thing this
   * function decides:
   *
   *      ⬤        crest, 32px          the thing the eye lands on
   *   Patriots     the name             for anyone who does not know the crest
   *     +3.5       the spread           what you are deciding about
   *    3.35x       the payout           what it pays you (WINNER market only)
   *   14-3 last yr context               rank, record, or last season
   *
   * Nothing here is conditional on `side` any more either. The old code mirrored
   * the row order for the home team so the two blocks faced each other, which
   * made sense when they were horizontal strips either side of a divider. In a
   * centred stack it just meant the two columns disagreed about what came
   * first. */
  b.appendChild(teamChip(team, {
    /* 🔴 44, AND EVERYTHING ELSE BELOW IT. Jason: "Larger logo. All info below
     * the logo." It went 18 -> 32 -> 44 across the afternoon, and each step was
     * paid for by taking something off the crest's line. At 44 it is the first
     * thing seen and the block reads top-down: WHO, then the numbers about them. */
    size: 44,
    league: ctx.sport === 'nfl' ? 'nfl' : 'college-football',
    adjacentTo: game[side === 'home' ? 'away' : 'home']
  }));

  b.appendChild(el('div', 'p2-name', team.short || team.name));

  /* 🔴 EVERY LINE IS ALWAYS DRAWN, EVEN WHEN IT IS EMPTY. Jason, 2026-09-09,
   * with a zoom on one block: "They should align center."
   *
   * The two blocks are centred INDIVIDUALLY, which is not the same as being
   * aligned WITH EACH OTHER. A ranked team gets a "#7" line and an unranked one
   * does not, so one stack is four rows and the other three - centre each and
   * the crests sit at different heights, the names sit at different heights, and
   * the row looks broken in a way that is hard to name and impossible to unsee.
   *
   * So the stack has a FIXED SHAPE: crest, name, spread, payout, context - and a
   * missing value renders an empty line of the same height rather than nothing.
   * The two sides then agree row for row whatever the feed gave us, which is
   * what "align center" actually requires when the contents differ. */
  const sp = typeof game.spread === 'number' ? spreadText(game.spread, side) : null;
  b.appendChild(el('div', 'p2-spread num', sp || ' '));

  /* 🔴 THE PAYOUT IS ABSENT ON THE SPREAD MARKET - Jason: "Betting the spread is
   * always 2x. Why show it." It is stated once in the header, where a rule
   * belongs. On WINNER it is drawn every time, because there it varies and it is
   * the whole reason to take the underdog. */
  if (ctx.mode === 'week' && marketOf(pick) === 'winner') {
    const px = typeof game.spread === 'number'
      ? priceFromSpread(game.spread, side, ctx.sport) : null;
    const pay = el('div', 'p2-price num', px != null ? px.toFixed(2) + '×' : ' ');
    if (px != null && px <= 1.12) pay.classList.add('is-thin');
    b.appendChild(pay);
  }

  /* 🔴 THE CONTEXT LINE IS OFF THE ROW. Jason, 2026-09-09: "Get rid of 5-5 last
   * year. Put that in the info card."
   *
   * Right, and it is the same judgement that killed the info card two hours ago
   * arriving from the other side. Then, the row carried five facts and the modal
   * repeated all of them - so the modal had no job. Now the row carries four -
   * crest, name, spread, payout - and "12-5 last yr" is the one that is NOT part
   * of the decision. It is background you might want once, not something you
   * read on every one of sixteen rows.
   *
   * A row holds what you are deciding with. A detail view holds what you might
   * want to check. The line moved because the row changed, which is the honest
   * reason a thing moves. */

  /* The pool's split, only once the game has locked, and the verdict once it has
   * been played. Both are afterwards-facts and sit at the foot of the stack. */
  const locked = !!(game && game.kickoffUtc != null && ctx.now >= game.kickoffUtc);
  if (locked && pick && pick.crowd) {
    const c = el('div', 'p2-crowd num', crowdLabel(pick.crowd[side], pick.crowd.n, true));
    if (side === pick.side) c.dataset.mine = 'true';
    b.appendChild(c);
  }
  if (mine && (st === 'won' || st === 'lost' || st === 'void')) {
    const m = el('div', 'p2-result');
    m.dataset.result = st;
    m.appendChild(icon(st === 'won' ? 'check' : st === 'lost' ? 'cross' : 'dash'));
    b.appendChild(m);
  }

  if (mine) b.dataset.pick = 'on';
  const open = st === 'unpicked' || st === 'picked';
  b.disabled = !open;
  b.setAttribute('aria-pressed', String(pick && pick.side === side));
  b.setAttribute('aria-label', (team.name || team.short) + (open ? '' : ' – locked'));
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

  /* 🔴 THE MARKET SWITCH, UNDER THE TIME - where Jason asked for it, and the
   * right place for it: dead centre, between the two sides it re-prices, so it
   * is obvious the choice applies to the whole row rather than to one team.
   *
   * Only on the priced card. In the group pool there is one way to be right and
   * a switch would be offering a choice that changes nothing. */
  if (ctx.mode === 'week' && typeof game.spread === 'number') {
    const mk = marketOf(ctx.picks[game.id]);
    const sw = el('div', 'p2-mkt');
    for (const o of [{ id: 'spread', l: 'Spread' }, { id: 'winner', l: 'Winner' }]) {
      const b = el('button', 'p2-mkt-b' + (mk === o.id ? ' is-on' : ''), o.l);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(mk === o.id));
      b.title = o.id === 'spread'
        ? 'Beat the number. Both sides pay 2.00×'
        : 'Just win. The underdog pays more';
      b.onclick = (e) => {
        e.stopPropagation();
        ctx.onMarket(game.id, o.id);
      };
      sw.appendChild(b);
    }
    c.appendChild(sw);
  }

  /* 🔴 THE INFO LINK. Jason, 2026-09-09: "how about an 'info' hyperlink under the
   * time that pulls up a head to head card on that game." Then, when asked
   * whether to ship it with the facts already on the row: "Yes something worth
   * opening."
   *
   * So it opens on records, AP rank, the book that posted the line, the venue
   * and the channel - none of it derived, all of it captured by the poller for
   * this. A card that repeats the three facts already printed on the row is a
   * link somebody taps once. */
  return c;
}

/* 🔴 THE INFO CARD IS DELETED. Jason, 2026-09-09: "The info card is useless.
 * All that info is on the past page."
 *
 * He is right and it is worth being precise about how it died, because it was
 * built two hours earlier to his own spec and it was correct then. It opened on
 * Record, Last season, The line, Spread pays, Winner pays.
 *
 * Then the row became a Deuce card - time, channel, status, both prices, both
 * spreads, all on the face of it - and the modal became a copy of the card
 * behind it. Every line except one was already on screen, and the exception
 * ("Record 0-0" in week 1) was true and worthless.
 *
 * 🔴 A DETAIL VIEW HAS TO EARN ITS TAP, and the honest measure is what it says
 * that the row cannot. When the row got richer, the modal's job disappeared -
 * so the fix is not to redesign it, it is to notice that it has nothing left to
 * do. The one fact worth keeping went where it belonged: onto the row, under
 * each team, in the slot Deuce fills with "World #1".
 */

/* 🔴 A CARD PER GAME, REBUILT RATHER THAN PATCHED. Jason, 2026-09-09, holding
 * our slate against Deuce's Match Schedule: "Not close." Then, when I began
 * layering new CSS over the old three-column grid: "Scrap and start over."
 *
 * Both were right. The row was `1fr 76px 1fr` with the time wedged in a 76px
 * middle column, and every new thing - the market switch, the info link - had
 * been pushed into that column until it was three controls stacked in 76px. You
 * cannot reach Deuce's shape by adding rules to that; the grid itself was the
 * problem.
 *
 * THE SHAPE NOW, which is Deuce's with our function:
 *
 *   ┌──────────────────────────────────────────┐
 *   │ 5:00 PM   info            [Spread|Winner]│   when it is, how it is played
 *   │ ┌────────────────┐  at  ┌───────────────┐│
 *   │ │ ⬤ Florida A&M  │      │ ⬤ Miami       ││   the two sides, each a tap
 *   │ │ +56.5   2.00×  │      │ −56.5  2.00×  ││   target 60px tall
 *   │ └────────────────┘      └───────────────┘│
 *   └──────────────────────────────────────────┘
 *
 * 🔴 THE DENSITY ARGUMENT IS PARTLY CONCEDED AND IT IS WORTH SAYING WHY. Rows
 * were measured against CBS to fit 24 games in few screens. That is right for a
 * SEARCH - find one game - and wrong for a CARD you work down deciding each
 * line, which is what the week's card is. Six a screen you read beats nine you
 * scan past.
 *
 * What is NOT conceded: no repeated league header per card. That is Sofascore's
 * mistake and it costs 40% of every one of its cards. */
function row(ctx, game) {
  const r = el('div', 'p2-row');
  r.dataset.state = pickStateOf(game, ctx.picks[game.id], ctx.now, ctx.mode);

  /* 🔴 PAST, NOW, NEXT - the week has a shape and the list should show it.
   * Jason: "past games as past, upcoming as upcoming. Next in line can be
   * larger and prominent."
   *
   * A flat chronological list of 24 identical cards makes somebody read every
   * one to find where they are in the week. Three states do that work for them:
   * what is done recedes, what is next is unmissable, everything else waits its
   * turn.
   *
   * 🔴 PAST IS DIMMED, NEVER HIDDEN. A finished game is the evidence for the
   * standings and the answer to "did I get that one" - and a list that silently
   * drops rows is a list you cannot trust to be the week. */
  const done = game.status === 'final' || game.status === 'void';
  if (done) r.dataset.when = 'past';
  else if (game.status === 'in_progress') r.dataset.when = 'live';
  else if (game.id === ctx.nextGameId) r.dataset.when = 'next';
  else r.dataset.when = 'upcoming';
  if (ctx.mode === 'week') r.dataset.market = marketOf(ctx.picks[game.id]);
  r.dataset.gameId = game.id;

  /* 🔴 DEUCE'S MATCH ROW, COLUMN FOR COLUMN. Jason: "Build the slate like this."
   *
   *   ┌────────────┬─────────────────────────────┬──────────────┐
   *   │ 09:00 AM   │  ⬤ Djokovic  VS  ⬤ Alcaraz  │ Round of 16  │
   *   │ Center Court│    World #1      World #2   │ Best of 3    │
   *   │ [Upcoming] │                             │              │
   *   └────────────┴─────────────────────────────┴──────────────┘
   *
   * WHEN on the left with a status pill under it, the two COMPETITORS in the
   * middle with VS between, and what KIND of contest it is on the right. Every
   * column maps onto something we already have and the mapping is exact:
   *
   *   time / court / status   ->  kickoff, channel, and the pick's own state
   *   the two competitors     ->  our two tap targets, which is the one place
   *                               ours does more than Deuce - its blocks are
   *                               decorative and these are the whole interaction
   *   round / best-of         ->  which market you are playing and the info link
   *
   * That last column is the useful accident: Deuce puts the RULES of the contest
   * there, and Spread-or-Winner is exactly that - the rule this row settles by. */
  /* Says out loud why this card is bigger. An unexplained highlight reads as a
   * rendering bug rather than as emphasis. */
  if (r.dataset.when === 'next') r.appendChild(el('div', 'p2-when-tag', 'Next up'));

  /* 🔴 THE THREE-COLUMN ROW IS GONE AND THE CARD IS TWO STACKED BANDS. Jason,
   * 2026-09-09, on the screenshot: "Find another place for the spread/winner."
   * And, of the left column: "Start time/date to large."
   *
   * Both are the same 393px arithmetic. `52px | 1fr | 60px` spent 112px of fixed
   * column plus gutters on two pieces of METADATA, and left the two things you
   * actually tap sharing what was left. The Spread/Winner switch was floating in
   * a 60px gutter beside the home team's crest, vertically centred against
   * nothing, reading as though it belonged to that team - which is the exact
   * misreading the switch was moved to the centre to avoid, arriving from the
   * other side.
   *
   *   ┌──────────────────────────────────────────────┐
   *   │ 10:00 AM · FOX · [Open]      [Spread|Winner] │  ← the strip: when, how
   *   │ ┌──────────────┐   VS   ┌──────────────────┐ │
   *   │ │  ⬤ Saints    │        │   ⬤ Lions        │ │  ← the decision, full width
   *   │ │  +7  6.00×   │        │   −7   1.18×     │ │
   *   │ └──────────────┘        └──────────────────┘ │
   *   └──────────────────────────────────────────────┘
   *
   * The strip is metadata and reads as metadata: one line, small type, kickoff
   * and channel and state running together. The teams get the whole width.
   *
   * 🔴 AND THE TIME IS SMALL NOW ON PURPOSE. It was `--t-body` at weight 800 in
   * a column of its own, which made the loudest thing on a pick card the hour it
   * starts. The hour is how you find your place in the day; the pick is the
   * point. Deuce is read wrongly if its time column is read as emphasis - the
   * type there is small and grey, and the players are the size. */
  const top = el('div', 'p2-top');
  const when = el('div', 'p2-when');
  when.appendChild(el('span', 'p2-time', timeLabel(game.kickoffUtc)));
  if (game.broadcast) when.appendChild(el('span', 'p2-chan', game.broadcast));
  /* 🔴 NO PILL FOR "OPEN" OR "PICKED". Jason, 2026-09-09: "I don't need picked
   * or opens obvious."
   *
   * Both were saying something the card already says louder. A picked game has
   * an accent-outlined, accent-tinted block halfway down it - you cannot miss it
   * and you do not need a word confirming it. And "Open" is the absence of a
   * pick, which is what an un-outlined card IS. Every row on a fresh slate was
   * carrying a chip that meant "nothing has happened here yet".
   *
   * 🔴 THE OTHER FIVE STAY, because each one says something no part of the card
   * can: Locked, Live, Won, Lost, Void are all facts about the GAME rather than
   * about your input, and none of them is inferable from the block. This is the
   * rule the info card is built on, applied to a chip - it earns its place by
   * saying what is not already there. */
  const pill = statusPill(ctx, game);
  if (pill.dataset.state !== 'unpicked' && pill.dataset.state !== 'picked') {
    when.appendChild(pill);
  }
  top.append(when, rules(ctx, game));
  r.appendChild(top);

  const sides = el('div', 'p2-sides');
  /* 🔴 AWAY, THEN "@", THEN HOME - AND THE ORDER IS THE MEANING. Jason,
   * 2026-09-09: "Make the home team on the right, always. Which you have.
   * Change vs to @."
   *
   * "VS" came from Deuce, where two tennis players meet on neutral ground and
   * neither side of the screen means anything. Football is not neutral: every
   * game is played at somebody's place, the spread is quoted on the home team,
   * and "Florida A&M @ Miami" is how every scoreboard, every broadcast and every
   * newspaper in the sport writes it.
   *
   * So the glyph is not decoration - it is the only thing on the card that says
   * WHERE the game is. With "VS" between them the left/right order was an
   * arbitrary convention somebody had to learn; with "@" it is a sentence. */
  /* 🔴 THE @ BECOMES THE SCORE ONCE THE GAME HAS STARTED - which is what
   * center() was written to do and had stopped doing. Its own comment says
   * "the kickoff time is REPLACED IN PLACE by the live state. Same slot, no
   * badge, no extra column." Then the Deuce redesign rebuilt this row with a
   * bare '@' separator and nothing called center() again, so an in-progress
   * or final game had nowhere to show its score. Found on FAMU at Miami,
   * 0-14 in the first quarter, drawn on the pool slate as "Next up" with no
   * score at all - while previewData held status in_progress the whole time.
   * The data was right; the one function that could draw it was dead code. */
  const mid = (game.status === 'in_progress' || game.status === 'final')
    ? center(ctx, game) : el('span', 'p2-at', '@');
  sides.append(zone(ctx, game, 'away'), mid, zone(ctx, game, 'home'));
  r.appendChild(sides);
  return r;
}

/* The status pill - Deuce's "Upcoming" chip, saying the thing that actually
 * matters here: whether this row can still be picked. */
/* 🔴 THE INFO CARD, REBUILT AND DELIBERATELY THINNER THAN THE FIRST ONE.
 *
 * The first version opened on Record, Last season, The line, Spread pays and
 * Winner pays - and it died when the row grew to carry the last three itself.
 * Jason: "The info card is useless. All that info is on the past page."
 *
 * It is back because the row went the other way: it now carries the four things
 * you decide with - crest, name, spread, payout - and the context came off it.
 * So this holds exactly what the row does NOT, and nothing else:
 *
 *   records, this season and last     the argument for or against the spread
 *   AP rank                           college only, absent when unranked
 *   where and on what                 venue and channel
 *
 * 🔴 IF IT EVER AGAIN SHOWS SOMETHING THE ROW SHOWS, IT IS DEAD AGAIN. That is
 * the test to apply before adding a line here, and it is the one this card
 * failed the first time.
 */
function openInfo(game, ctx) {
  const old = document.getElementById('p2-info-dlg');
  if (old) old.remove();

  const d = document.createElement('dialog');
  d.id = 'p2-info-dlg';
  d.className = 'p2-dlg';

  const head = el('div', 'p2-dlg-h');
  head.appendChild(el('div', 'p2-dlg-t',
    (game.away.short || game.away.name) + ' at ' + (game.home.short || game.home.name)));
  const meta = [timeLabel(game.kickoffUtc), dayLabel(game.kickoffUtc)];
  if (game.venue) meta.push(game.venue);
  if (game.broadcast) meta.push('on ' + game.broadcast);
  head.appendChild(el('div', 'p2-dlg-s', meta.join(' · ')));
  d.appendChild(head);

  const t = el('div', 'p2-h2h');
  const hdr = el('div', 'p2-h2h-r p2-h2h-hd');
  hdr.appendChild(el('span', 'p2-h2h-l', ''));
  hdr.appendChild(el('span', 'p2-h2h-v', game.away.abbrev || '–'));
  hdr.appendChild(el('span', 'p2-h2h-v', game.home.abbrev || '–'));
  t.appendChild(hdr);

  const line = (label, a, b2) => {
    /* A row where NEITHER side has the fact is not drawn. A card of dashes is
     * the thing this card exists not to be. */
    if (a == null && b2 == null) return;
    const r = el('div', 'p2-h2h-r');
    r.appendChild(el('span', 'p2-h2h-l', label));
    r.appendChild(el('span', 'p2-h2h-v num', a == null ? '–' : String(a)));
    r.appendChild(el('span', 'p2-h2h-v num', b2 == null ? '–' : String(b2)));
    t.appendChild(r);
  };
  const A = game.away, H = game.home;
  line('Record', A.record, H.record);
  line('Last season', A.lastRecord, H.lastRecord);
  line('AP rank', A.rank ? '#' + A.rank : null, H.rank ? '#' + H.rank : null);
  /* 🔴 FORM, NEWEST FIRST, AS FIVE LETTERS. Read left to right it is the last
   * five games in order, which is how every football table in the world prints
   * it. Not a sparkline and not a percentage - W L W W T is the whole fact and
   * it fits in one cell. */
  line('Last five', A.form || null, H.form || null);
  d.appendChild(t);

  /* 🔴 THE LAST MEETING, WHICH IS WHAT "HEAD TO HEAD" MEANS IN PRACTICE. Jason
   * asked for the ultimate record; the feed has no such number for either
   * league and a derived one could only honestly be labelled "since 2002", so
   * this is the fact that does exist - the last time these two played.
   *
   * ABSENT, NOT HEDGED, when they have not met inside five games. An empty
   * head-to-head line is worse than no line: it implies we looked all the way
   * back and found nothing, and we looked back five games. */
  if (game.lastMeeting && game.lastMeeting.score) {
    const m = game.lastMeeting;
    const who = m.winnerId == null ? 'Tied'
      : ((m.winnerId === H.id ? (H.short || H.name) : (A.short || A.name)) + ' won');
    const when = m.dateUtc
      ? new Date(m.dateUtc).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
      : null;
    d.appendChild(el('div', 'p2-h2h-last',
      'Last meeting: ' + who + ' ' + m.score + (when ? ', ' + when : '')));
  }

  d.appendChild(el('p', 'p2-dlg-n',
    'The line is the market’s, not ours — read from the public feed.'));

  const close = el('button', 'p2-dlg-x', 'Close');
  close.onclick = () => d.close();
  d.appendChild(close);
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  d.addEventListener('close', () => d.remove());
  document.body.appendChild(d);
  d.showModal();
}

function statusPill(ctx, game) {
  const st = pickStateOf(game, ctx.picks[game.id], ctx.now, ctx.mode);
  const WORD = { unpicked: 'Open', picked: 'Picked', locked: 'Locked',
                 in_progress: 'Live', won: 'Won', lost: 'Lost', void: 'Void' };
  const p = el('span', 'p2-pill', WORD[st] || 'Open');
  p.dataset.state = st;
  return p;
}

/* The right-hand column: how this row settles, and a way to read more. */
function rules(ctx, game) {
  const c = el('div', 'p2-rules');
  if (ctx.mode === 'week' && typeof game.spread === 'number') {
    const mk = marketOf(ctx.picks[game.id]);
    const sw = el('div', 'p2-mkt');
    for (const o of [{ id: 'spread', l: 'Spread' }, { id: 'winner', l: 'Winner' }]) {
      const b = el('button', 'p2-mkt-b' + (mk === o.id ? ' is-on' : ''), o.l);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(mk === o.id));
      b.title = o.id === 'spread'
        ? 'Beat the number. Both sides pay 2.00×'
        : 'Just win. The underdog pays more';
      b.onclick = (e) => { e.stopPropagation(); ctx.onMarket(game.id, o.id); };
      sw.appendChild(b);
    }
    c.appendChild(sw);
  }
  const info = el('button', 'p2-info', 'info');
  info.type = 'button';
  info.setAttribute('aria-label', 'Records and rank for this game');
  info.onclick = (e) => { e.stopPropagation(); openInfo(game, ctx); };
  c.appendChild(info);
  return c;
}


export function render(root, data, state) {
  root.classList.add('scr-p2-slate');
  root.innerHTML = '';
  /* Every render counts, so a group reload that lands after the person has moved
     on - another group, another screen - can tell it is stale and draw nothing. */
  root.__p2Seq = (root.__p2Seq || 0) + 1;
  const grp = state === 'group';
  const style = el('style');
  style.textContent = [TEAM_CHIP_CSS, STATES_CSS].concat(grp ? [GROUP_CSS] : []).join('\n');
  root.appendChild(style);

  /* Group pools, before any slate: signed out, in no group, loading, offline, an
   * empty week. Each one has a way forward - see groupGate(). */
  if (grp && (!data || data.groupState !== 'ready')) {
    if (window.__agPoolLiveTimer) { clearInterval(window.__agPoolLiveTimer); window.__agPoolLiveTimer = null; }
    groupGate(root, data || {}, state);
    return;
  }

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
    /* The first game that has not finished. Computed once for the whole render
     * rather than per row, so 24 rows cannot disagree about which one is next. */
    nextGameId: (() => {
      const up = (data.games || [])
        /* 🔴 A LIVE GAME IS NOT "NEXT UP". This excluded only final and void,
           so during FAMU at Miami the game in progress was flagged as the next
           one to pick - on a row you can no longer pick at all. Next means the
           next game that has not started. */
        .filter((g) => g.status !== 'final' && g.status !== 'void' && g.status !== 'in_progress')
        .sort((a, b) => a.kickoffUtc - b.kickoffUtc);
      return up.length ? up[0].id : null;
    })(),
    week: data.week || 1,
    /* The group this slate is being picked for. Null on every other state. */
    groupId: grp && data.group ? data.group.id : null,
    /* Where this person's picks in this group are kept on the phone. */
    pickScope: grp && data.group ? data.pickScope : null,
    /* 🔴 SWITCHING THE MARKET DOES NOT CLEAR THE PICK. Somebody who took Kansas
     * and then wants Kansas outright has not changed their mind about Kansas -
     * making them tap the team again would be the app forgetting what they just
     * said. The price under their pick changes, which is the whole point of the
     * control. */
    onMarket: (gameId, market) => {
      const p = (ctx.picks[gameId] || (ctx.picks[gameId] = { side: null, crowd: null }));
      if (marketOf(p) === market) return;
      p.market = market;
      savePicks(ctx.sport, ctx.week, ctx.picks);
      const g = (data.games || []).find((x) => x.id === gameId);
      if (p.side && g) postPick(ctx.sport, ctx.week, g, p.side);
      const oldRow = root.querySelector('.p2-row[data-game-id="' + cssEsc(gameId) + '"]');
      if (oldRow && g) oldRow.replaceWith(row(ctx, g));
    },
    onPick: (gameId, side) => {
      /* 🔴 SIGN IN AT THE FIRST PICK, BEFORE THE PICK. Jason: "first pick is
       * fine." When the server requires an account and this phone has none,
       * the tap opens the sign-in sheet first and the pick happens only once
       * it succeeds. Picking first and asking after would show a pick on the
       * row that the server had refused - a pick that looks made and counts
       * for nothing is the worst state this screen could be in. */
      let signedIn = false;
      try { signedIn = !!(localStorage.getItem('ag.session') && localStorage.getItem('ag.handle')); } catch { /* private */ }
      if (window.agAuthRequired && !signedIn && window.agOpenSignIn) {
        window.agOpenSignIn().then((ok) => { if (ok) ctx.onPick(gameId, side); });
        return;
      }
      /* 🔴 CREATE THE ROW IF IT IS NOT THERE. Jason, 2026-09-09: "This weeks
       * card does not allow me to pick."
       *
       * `ctx.picks` used to be pre-populated with an entry per game, because the
       * only slates that existed were designed previews carrying thirty-one
       * picks in four states. The real slates hand back `picks: {}` - correctly,
       * because nobody has picked anything - and this line then read `undefined`
       * and threw on the assignment below. EVERY tap on a real slate died in the
       * handler, silently: no row changed, no error surfaced, the screen just
       * did not respond.
       *
       * The empty map was the honest thing to return. The handler assuming a
       * pre-seeded row was the bug, and it only survived this long because the
       * preview data hid it. */
      const p = (ctx.picks[gameId] || (ctx.picks[gameId] = { side: null, crowd: null }));
      const before = p.side;
      p.side = p.side === side ? null : side;
      /* Written on every tap rather than on some later commit. There is no
       * "save" on this screen and there should not be one - the tap IS the
       * commit, so anything that does not survive it never happened. */
      savePicks(ctx.sport, ctx.week, ctx.picks, ctx.pickScope);
      /* Un-picking is a local state today: there is no DELETE, so the server
       * keeps the last side you chose. Named rather than hidden - it is the
       * next thing this endpoint needs. */
      if (p.side) {
        const g = (data.games || []).find((x) => x.id === gameId);
        /* 🔴 A GROUP PICK WAITS FOR ITS ANSWER. The group can refuse it - 403 not a
         * member, 409 kicked off - and a refused pick must not stay highlighted. It
         * goes back to what it was, and the server's own sentence goes on the row. */
        if (g && ctx.groupId) {
          const gid = ctx.groupId, chosen = p.side;
          postGroupPick(gid, g, chosen, ctx.sport, ctx.week).then((res) => {
            if (res.ok || p.side !== chosen) return;
            p.side = before;
            savePicks(ctx.sport, ctx.week, ctx.picks, ctx.pickScope);
            const cur = root.querySelector('.p2-row[data-game-id="' + cssEsc(gameId) + '"]');
            if (cur) {
              const fresh = row(ctx, g);
              const m = el('p', 'p2-gmsg', res.message);
              m.setAttribute('role', 'alert');
              fresh.appendChild(m);
              cur.replaceWith(fresh);
            }
            paintProgress();
          });
        } else if (g) postPick(ctx.sport, ctx.week, g, p.side);
      }
      /* The crowd arrives WITH the pick and leaves with it. It is not cached from a
       * previous tap, because the rule is about what you see before you commit.
       * Never in a group: a seeded split there would be a crowd that does not exist. */
      p.crowd = p.side && !ctx.groupId ? (p.crowd || seedCrowd(gameId, ctx.pool.memberCount)) : null;
      const old = root.querySelector('.p2-row[data-game-id="' + cssEsc(gameId) + '"]');
      const game = data.games.find((g) => g.id === gameId);
      if (old && game) old.replaceWith(row(ctx, game));
      paintProgress();
    }
  };

  head(root, data, null);
  /* The group state: which group, the dropdown, and the door to the group's page. */
  if (grp) groupBar(root, data, state);

  /* The "You're invited" line is gone (CONTRACT-GROUPS §1, amended 2026-09-11):
   * an invite opens #/g now, and the slate shows no invite. */

  /* 🔴 THE SAME FILTERS AS ALL GAMES. This screen is 86 rows and 22 screens
   * of scroll, and it is the one an INVITE LINK OPENS - the first thing
   * somebody sees. It had a jump strip, which moves you around the week, and
   * nothing at all for "show me the games worth looking at".
   *
   * The jump strip and this are not the same tool and both stay: one changes
   * where you are, this changes which games exist. The strip's own comment
   * says so - "it is NOT a filter" - and that was a correct description of a
   * gap rather than an argument against filling it. */
  const fsport = (data && data.sport) || 'college-football';
  let filter = FILTER_ALL;
  try { filter = localStorage.getItem(filterKey(fsport)) || FILTER_ALL; } catch { /* private */ }
  const fopts = filterOptions(data.games);
  if (!fopts.some((o) => o.id === filter)) filter = FILTER_ALL;

  if (fopts.length > 1) {
    const chips = el('div', 'p2-filters ag-scroll-x');
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', 'Filter the week');
    for (const o of fopts) {
      const b = el('button', 'p2-filter');
      b.type = 'button';
      b.appendChild(el('span', 'p2-filter-l', o.label));
      b.appendChild(el('span', 'p2-filter-n num', String(o.n)));
      if (o.id === filter) { b.dataset.on = 'true'; b.setAttribute('aria-current', 'true'); }
      b.onclick = () => {
        try { localStorage.setItem(filterKey(fsport), o.id); } catch { /* private */ }
        render(root, data, state);
      };
      chips.appendChild(b);
    }
    requestAnimationFrame(() => {
      if (chips.scrollWidth > chips.clientWidth + 2) chips.classList.add('is-scrollable');
    });
    root.appendChild(chips);
  }

  const shown = data.games.filter((g) => gamePasses(g, filter));
  const groups = groupsOf(shown);
  /* 🔴 THE DAY JUMP STRIP IS GONE. Jason, 2026-09-11, circling "Thu 10 · Fri 11 ·
   * Sat 12" under the filter pills: "i dont need the date/date on this page." The
   * day sections below already carry their own headers and roll up, so the strip
   * was a second row of pills saying what the list says. daysOf() stays - it is
   * the grouping, and it is tested on its own. */

  /* CBS's `AWAY / 0-of-15 Picks / HOME` - ONE element doing column labels and progress at
   * the same time. Sticky, so progress is visible without leaving the screen. */
  /* 🔴 THE COLUMN LABELS ARE GONE. Jason, 2026-09-09: "remove home/away at the
   * top", sent with a screenshot of "HOME" with the app's own ⋮ menu sitting on
   * top of it.
   *
   * They were CBS's, doing two jobs in one element - naming the columns and
   * showing progress - and that was a good trade when the row was a wide table
   * with a team at each edge. It is not one now: the card says "@" between the
   * two teams, which names both columns better than a pair of headings can,
   * because it is on the row you are actually reading rather than pinned to the
   * top of the screen.
   *
   * 🔴 AND A LABEL THAT IS RIGHT ONCE STOPS BEING WORTH ITS COLLISION. Pinned at
   * the top right, "HOME" was the one piece of text guaranteed to sit under the
   * fixed menu button. The fix for a label fighting a control is usually not to
   * move the control. */
  const bar = el('div', 'p2-bar');
  bar.append(el('span', 'p2-bar-p num'));
  root.appendChild(bar);
  const paintProgress = () => {
    bar.querySelector('.p2-bar-p').textContent = progress(countPicked(data.games, ctx.picks), data.games.length);
  };
  paintProgress();

  const list = el('div', 'p2-list');
  for (const g of groups) {
    /* 🔴 THE DAY IS A CARD AND THE GAMES ARE CARDS ON IT. Jason, 2026-09-09:
     * "The date has a card, and the games have a card on that card. Look at the
     * original."
     *
     * Deuce nests, and I had flattened it: a day label sitting on the ground with
     * loose cards under it. The nesting is doing real work - it is what makes a
     * day a THING you can see the extent of, rather than a heading you have to
     * remember you are still under. On a 24-game week that is the difference
     * between reading a list and reading a schedule.
     *
     * So: a day card, its header inside it, and the games as inset blocks on it.
     * That is three levels of surface, which is one more than this app has used
     * anywhere - and it is why the inset blocks are a shade of the ground rather
     * than white-on-white. */
    /* 🔴 THE DAY ROLLS UP, AND A PAST DAY ROLLS UP ON ITS OWN. Jason,
     * 2026-09-09: "You can roll up the date. Past dates should roll up
     * automatically."
     *
     * Deuce's day header carries "5 Matches ⌄" and the chevron is not
     * decoration - it is the control. Ours had the count and no chevron, which
     * is the affordance removed and the promise left behind.
     *
     * 🔴 AND THIS IS HOW "PAST IS DIMMED, NEVER HIDDEN" SURVIVES A 24-GAME WEEK.
     * By Sunday night ten finished games sit above the ones you can still pick,
     * and dimming ten cards still costs ten cards of scroll. Rolled up, a
     * finished day is one line that still says the date and still says how many
     * - so it is present, countable and one tap from open. That is a different
     * thing from dropping it, which is what the rule forbids.
     *
     * <details> rather than a class and a click handler: it ships the keyboard
     * behaviour, the aria-expanded state and Ctrl-F opening a closed section for
     * free, and every one of those is something a hand-rolled toggle omits. */
    const day = el('details', 'p2-day');
    const allPast = g.games.every((x) => x.status === 'final' || x.status === 'void');
    day.open = !allPast;
    if (allPast) day.dataset.when = 'past';
    const h = el('summary', 'p2-grp');
    h.dataset.key = g.key;
    const right = el('span', 'p2-grp-r');
    right.append(el('span', 'p2-grp-n num', g.games.length + (g.games.length === 1 ? ' game' : ' games')),
                 el('span', 'p2-chev', '⌄'));
    h.append(el('span', 'p2-grp-d', groupLabel(g)), right);
    day.appendChild(h);
    /* 🔴 THE GAMES GO IN A REAL WRAPPER, AND THIS IS THE FIX FOR FOUR ROUNDS OF
     * "add a gap between the cards".
     *
     * `.p2-day` is a <details> with `display: grid`, and a <details> does NOT lay
     * its children out the way it looks like it does. The summary is one grid
     * item; EVERYTHING AFTER IT IS SLOTTED INTO A SINGLE ANONYMOUS BOX that is
     * the second grid item. So `gap` on the day card separated the header from
     * the block of games and separated nothing inside it - eight game cards in a
     * Sunday day card sat flush against each other with a zero gap.
     *
     * 🔴 AND NOTHING IN THE CSS SAID SO. The rule read `gap: 16px`, the property
     * computed as `16px`, and the distance between two adjacent cards measured
     * ZERO. I raised that number twice - 6 to 10, 10 to 16 - and reasoned at
     * length about surface tone explaining why the space did not read, while
     * Jason sent the same photograph of two touching cards four times. He was
     * describing the defect accurately every time and I was measuring the
     * stylesheet instead of the screen.
     *
     * The wrapper makes the games a grid of their own, where a gap means what it
     * says. */
    const games = el('div', 'p2-games');
    for (const game of g.games) games.appendChild(row(ctx, game));
    day.appendChild(games);
    list.appendChild(day);
  }
  root.appendChild(list);

  /* THE TIEBREAK. ONE field, one named game of the week, at the foot. CBS ships four -
   * `Total Points for LVILLE`, `MISS`, `SMU`, `FSU` - which is a national-contest answer.
   * A conference-scoped pool is about eight picks and four fields would outweigh the
   * slate they break a tie on. */
  /* 🔴 THE POOL SLATE'S LIVE ROWS KEEP MOVING TOO. All games got a 30-second
   * live refresh tonight and this screen did not, so a pool slate left open
   * during a game froze its score at whatever it was when the page drew -
   * on a live row, a number that looks current and is not.
   *
   * Same cadence and same rules as All games: every 30 seconds the games in
   * the poll window are re-overlaid (held for display, real for closing) and
   * ONLY their rows are swapped, so an open day card, the filter and the
   * scroll position are untouched. One timer on window, cleared on every
   * render and the moment the root stops being this screen. */
  if (window.__agPoolLiveTimer) { clearInterval(window.__agPoolLiveTimer); window.__agPoolLiveTimer = null; }
  const inPlay = data.games.filter((g) => g.status !== 'final' && g.status !== 'void'
    && g.kickoffUtc != null && Date.now() >= g.kickoffUtc - 15 * 60 * 1000
    && Date.now() < g.kickoffUtc + 6 * 60 * 60 * 1000);
  if (inPlay.length) {
    window.__agPoolLiveTimer = setInterval(async () => {
      if (!document.body.contains(root) || !root.classList.contains('scr-p2-slate')) {
        clearInterval(window.__agPoolLiveTimer); window.__agPoolLiveTimer = null; return;
      }
      try { await overlayLive(inPlay, fsport); } catch { return; }
      for (const g of inPlay) {
        const old = root.querySelector('.p2-row[data-game-id="' + String(g.id).replace(/"/g, '') + '"]');
        if (old) old.replaceWith(row(ctx, g));
      }
    }, 30000);
  }

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
  /* 🔴 THE LINE THE INFO CARD USED TO CARRY. It said "the line is the market's,
   * not ours - we never post a number of our own", and deleting that modal must
   * not delete the claim. It is doctrine: this app shows a market number and
   * never authors one, and losing the sentence would turn an attributed line
   * into an unattributed one that reads as ours. It belongs in a footnote, which
   * is where a standing statement about the data belongs anyway. */
  /* Not named `src` - a guard on this screen looks for `src =` to catch an
   * image sneaking in, and it was right to flag it. */
  const sourceNote = el('p', 'p2-note');
  sourceNote.textContent = 'The line is the market’s, not ours — read from the public feed. '
    + 'We never post a number of our own.';
  root.appendChild(sourceNote);

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
  /* THE SHARED HEADER. The kicker, the h1, the league pill and the meta line
   * were four separate elements invented on this screen; they are now the
   * template's title, tag and sub, at the same size they are on every other
   * screen. */
  const sp = (data && data.sport) || 'college-football';
  const wk = (data && data.week) || '';
  /* 🔴 "No pool yet" IS GONE FROM THIS HEADER. Jason, 2026-09-09: "What is no
   * pool yet and college in the header for."
   *
   * Nothing, on this screen. The pool NAME was the h1 here because this started
   * as a group-pool screen, and on the week's card - a marbles product with no
   * pool anywhere in it - the title said "No pool yet" over sixteen priced
   * games. A header that names something the screen does not contain is worse
   * than a plain one.
   *
   * The title is now what the screen IS, and the league is a mark rather than
   * the word "College" in a pill. */
  /* 🔴 NO LEAGUE MARK AND NO h1 ON THE SLATE. Jason, 2026-09-10: "remove the
   * ncaa logo off this page" / "as well as the slate below the ncaa logo".
   * The top bar names the screen; the page keeps only its one sub line. */
  /* Group pools: its own sub line, and "How it's scored" opens the GROUP's rules. */
  const gsub = data && data.groupMode
    ? (data.group && wk ? 'Week ' + wk + (data.mode === 'ats' ? GROUP_COPY.subAts : GROUP_COPY.sub) : GROUP_COPY.subNoWeek)
    : null;
  root.appendChild(pageHeader({
    title: (data && data.mode) === 'week' ? "The week's card" : 'The slate',
    noTitle: true,
    sub: gsub || ((data && data.mode) === 'week'
      ? 'Week ' + wk + ' · against the spread · every pick pays 2.00×'
      /* "your group" read wrong for anybody only in the everyone-in pool, and
       * the line never said what to do. Jason, 2026-09-10: yes to "pick the
       * winners". */
      : 'Week ' + wk + ' · pick the winners · scored in points'),
    /* Jason, 2026-09-11: yes to a "How it's scored" line into the rules. */
    link: gsub ? GROUP_COPY.rules : { label: 'How it’s scored', href: '#/rules' }
  }));
  /* 🔴 THE OLD HEADER IS DELETED, NOT HIDDEN BEHIND THE NEW ONE. It was four
   * elements invented on this screen - a kicker in caps, an h1 carrying the
   * POOL NAME, a league pill and a meta line - and the template now says all of
   * it in a title, a league mark and one sub line.
   *
   * Keeping them and hiding the h1 was my first attempt and it is the trap a
   * template exists to avoid: a shared header that ADDS to each screen's own
   * header makes the page longer and less consistent than what it replaced. */
  /* The pool's own meta line is gone too: "All games - Straight up - 0 members"
   * described a pool the week's card does not have, and the group's scoring
   * mode is now in the header's sub line where it belongs. */
}

const SCOPE_LABEL = {
  all: 'All games', top25: 'Top 25', conference: 'One conference',
  ranked_v_ranked: 'Ranked vs ranked', handpick: 'The commissioner\u2019s pick'
};

/* ------------------------------------------------------------------ group state
 * Drawn only on #/gpicks. Nothing here fetches: the dropdown, sign-in and "Try
 * again" all go back through data.reload(), which is previewData's own group branch
 * (CONTRACT-GROUPS \u00a73 - render never fetches). */

/** Reload the group state and draw it - unless the person has moved on meanwhile. */
function regroup(root, data, state) {
  if (!data || typeof data.reload !== 'function') return;
  render(root, { ...data, groupState: 'loading' }, state);
  const mine = root.__p2Seq;
  const here = () => root.__p2Seq === mine && root.classList.contains('scr-p2-slate');
  data.reload()
    .then((d) => { if (here()) render(root, d, state); })
    .catch(() => { if (here()) render(root, { ...data, groupState: 'error' }, state); });
}

/** Which group, and the door to its page. A dropdown with two groups or more, the
 *  group's name with one. Switching re-draws with that group's sport, week and picks. */
function groupBar(root, data, state) {
  const bar = el('div', 'p2-gbar');
  const groups = data.groups || [];
  if (groups.length) {
    bar.appendChild(groupSwitcher(groups, data.group ? data.group.id : '', () => regroup(root, data, state)));
  }
  const door = el('a', 'p2-gdoor', GROUP_COPY.door.label);
  door.href = GROUP_COPY.door.href;
  bar.appendChild(door);
  root.appendChild(bar);
}

/** Every group state that is not a slate. Each one has a way forward. */
function groupGate(root, data, state) {
  head(root, data, null);
  const gs = data.groupState;
  if (gs === 'loading') {
    root.appendChild(stateBlock('loading', { rows: 5, body: GROUP_COPY.loading }));
    return;
  }
  if (gs === 'signed-out' || gs === 'no-group') {
    const c = gs === 'signed-out' ? GROUP_COPY.signedOut : GROUP_COPY.noGroup;
    const card = el('div', 'p2-gcard');
    card.dataset.gate = gs;
    card.appendChild(el('p', 'p2-gcard-h', c.title));
    card.appendChild(el('p', 'p2-gcard-b', c.body));
    if (gs === 'signed-out') {
      const b = el('button', 'p2-gcta', c.cta);
      b.type = 'button';
      b.onclick = () => {
        if (!window.agOpenSignIn) return;
        window.agOpenSignIn().then((ok) => { if (ok) regroup(root, data, state); });
      };
      card.appendChild(b);
    } else {
      /* \ud83d\udd34 THE NO-GROUP DOOR. Home's "Group pools" lands here; this is the step. */
      const a = el('a', 'p2-gcta', c.cta);
      a.href = GROUP_COPY.noGroup.href;
      card.appendChild(a);
    }
    root.appendChild(card);
    return;
  }
  if (gs === 'empty') {
    groupBar(root, data, state);
    root.appendChild(stateBlock('empty', GROUP_COPY.empty));
    return;
  }
  const c = gs === 'offline' ? GROUP_COPY.offline : GROUP_COPY.error;
  root.appendChild(stateBlock(gs === 'offline' ? 'offline' : 'error', {
    title: c.title, body: c.body,
    action: { label: c.cta, onClick: () => regroup(root, data, state) }
  }));
}
