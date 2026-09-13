/* P5 - STANDINGS. Beat your office. Weekly and season, in one place.
 *
 * BAR, all three opened before a line was written:
 *
 *  reference/sofascore-teardown/screens/IMG_5226.PNG
 *    A Big 12 conference table: rank - mark - name - P - W-L-T - PCT. Measured off
 *    the capture: 1206px on a 402pt device = 3x, row pitch 126px = 42pt. Short caps
 *    headers in --dim over the NUMERIC columns only; rank and name carry no header.
 *    Arizona St. sits at rank 1 in a FULL-BLEED TINTED ROW - no border, no rule, no
 *    chevron. Nine rows plus a tab bar, two dropdowns and an ad rail fit one screen,
 *    so twenty read in two.
 *      TAKEN: the column set, the tint-not-border highlight, the caps headers over
 *             numbers only, the 42px row.
 *      NOT TAKEN: the club crest. Any Given has no logos, ever.
 *
 *      🔴 AND WHAT HOLDS THAT SLOT CHANGED, 2026-09-08. It was a two-color team
 *             chip, and that was wrong for a reason worth writing down: Sofascore's
 *             crest identifies the SUBJECT OF THE ROW, and on this screen the
 *             subject is a PERSON, not a team. The chip put the same two colors on
 *             every row of everybody who picked that team and distinguished nobody.
 *             Jason: "for the icons for each person, make up something for a person
 *             who won a week, they get a logo, 2 weeks gets one, etc not 2 color,
 *             crap."
 *             So the slot carries an EARNED BADGE from /components/badge.js - the
 *             same system L6 draws, shared rather than copied. Most rows have
 *             nothing in it, which is the point: a mark that everybody has is not a
 *             mark. The sentence this replaces is deleted rather than kept, because
 *             a superseded rule standing beside the current one is a second
 *             instruction.
 *
 *  reference/armchair-quarterback-teardown/screens/AQB-leaderboard.png
 *  reference/armchair-quarterback-teardown/screens/AQB-LIVE-leaderboard-real-scores.png
 *    "Your AQB Score: 48,120 pts" pinned in a dark strip ABOVE the card, then a
 *    three-trophy podium, then rank - helmet glyph - name - right-aligned total.
 *    In the LIVE capture the pinned score reads 0 pts while the visible list bottoms
 *    out at 11,940 - the user is nowhere on screen and the pin is the only place they
 *    exist. THAT is the argument for pinning, and it is the take.
 *      NOT TAKEN: the podium. Three trophies cost a third of the first screen to say
 *             what 1 - 2 - 3 already says, and an office pool of eight has no podium
 *             in it. The helmet glyph is the same picture on every row and identifies
 *             nobody; the chip at least carries data.
 *
 * 🔴 THIS IS THE POOL BOARD AND IT SCORES IN POINTS. LiveStandingsRow is the other
 *    board and it carries Marbles. The word Marbles does not appear in this file or
 *    its stylesheet, and no figure here is ever added to one from the live layer.
 *
 * 🔴 THIS SCREEN DOES NOT RANK. `rank` and `movement` arrive on StandingsRow, already
 *    computed by `standings()` in src/lib/pool.ts, which implements competition
 *    ranking (level users share a rank, the next rank skips). The week table and the
 *    season table are two pre-ranked arrays, so the toggle swaps an array and never
 *    re-sorts. See COULD NOT CLOSE for why previewData carries literal ranks.
 *
 * Types: StandingsRow, from src/lib/types.ts. Not re-declared here - a browser module
 * cannot import a .ts file, so the shape is honored and the field names are exact.
 */
import { stateBlock, STATES_CSS } from '/components/states.js';
import { pageHeader } from '/components/header.js';
/* The badge is the shared component - read the header of badge.js for why a
 * person's row does not carry a team's two colors. */
import { badgePin, BADGE_CSS } from '/components/badge.js';
import { dash, signed, signClass } from '/components/fmt.js';
/* The current group is ONE value, read and written only by group.js
 * (CONTRACT-GROUPS.md §1). This screen never touches the key itself. */
import { myGroups, pickCurrent, groupSwitcher, GROUP_CSS } from '/components/group.js';

export const id = 'p5-standings';
export const title = 'Standings - beat your office';
export const bar = 'reference/sofascore-teardown/screens/IMG_5226.PNG';

/** Every state is a route. `crowded` is the 200-member density check and `ties`
 *  is the twenty-row one - both exist because the bar is measured in rows per
 *  screen and a screen that is only ever drawn at eight rows proves nothing. */
export const states = [
  'ready', 'settling', 'final', 'ties', 'midseason', 'crowded',
  'empty', 'loading', 'offline', 'error',
  /* #/gstandings - the Standings tab of Group pools. Its sub-states (signed out,
   * no group, empty, offline, error) are decided in previewData from what the
   * API answered, because they are facts about the person, not design routes. */
  'group'
];

/* ------------------------------------------------------------------ *
 * PREVIEW DATA
 *
 * 🔴 THE SCORES BELOW ARE SYNTHETIC AND THE MEMBER NAMES ARE INVENTED. Nothing in
 *    fixtures/ contains a pool, because no pool has ever been played. What is REAL:
 *      - every team is looked up by abbreviation out of fixtures/teams.json, so the
 *        colors, the nulls and the near-identical pairs are the real file's;
 *      - the tiebreak game is fixtures/real-utep-at-ou-260905-final.json, Oklahoma
 *        51 UTEP 0, combined 51 - read off the fixture, not chosen.
 *    No fixture was written. This is view data for a preview route.
 *
 * 🔴 AND THE RANKS ARE LITERAL, IN RANK ORDER, ON PURPOSE. The screen must not rank,
 *    and a browser module cannot import pool.ts to do it properly, so the numbers are
 *    written out and tests/p5-standings.test.mjs feeds the identical roster to the
 *    real `standings()` from src/lib/pool.ts and asserts it produces exactly these
 *    ranks, this order and these movements. If they ever drift, that test fails.
 * ------------------------------------------------------------------ */

/** userId, name, team abbrev, and the two bases. Rank order is array order. */
const OFFICE_WEEK = [
  { userId: 'u_bo',      displayName: 'Bo',        team: 'GTWN', rank: 1, weekPoints: 15, seasonPoints: 30, parlayPoints: 12, movement: 0 },
  { userId: 'u_sam',     displayName: 'Sam R.',    team: 'ASU',  rank: 2, weekPoints: 11, seasonPoints: 39, parlayPoints: 6,  movement: 0, isSelf: true },
  { userId: 'u_marcus',  displayName: 'Marcus T.', team: 'CONN', rank: 3, weekPoints: 7,  seasonPoints: 44, parlayPoints: 0,  movement: 0 },
  { userId: 'u_dana',    displayName: 'Dana K.',   team: 'CAL',  rank: 4, weekPoints: 6,  seasonPoints: 41, parlayPoints: 0,  movement: 0 },
  { userId: 'u_reggie',  displayName: 'Reggie',    team: 'TOW',  rank: 4, weekPoints: 6,  seasonPoints: 38, parlayPoints: 0,  movement: 0 },
  { userId: 'u_elena',   displayName: 'Elena V.',  team: 'COMU', rank: 6, weekPoints: 5,  seasonPoints: 29, parlayPoints: 0,  movement: 0 },
  { userId: 'u_priya',   displayName: 'Priya S.',  team: 'IDHO', rank: 7, weekPoints: 4,  seasonPoints: 33, parlayPoints: 0,  movement: 0 },
  { userId: 'u_wendell', displayName: 'Wendell',   team: 'AUB',  rank: 8, weekPoints: 2,  seasonPoints: 26, parlayPoints: 0,  movement: 0 }
];

const OFFICE_SEASON = [
  { userId: 'u_marcus',  displayName: 'Marcus T.', team: 'CONN', rank: 1, weekPoints: 7,  seasonPoints: 44, parlayPoints: 6,  movement: 0 },
  { userId: 'u_dana',    displayName: 'Dana K.',   team: 'CAL',  rank: 2, weekPoints: 6,  seasonPoints: 41, parlayPoints: 3,  movement: 0 },
  { userId: 'u_sam',     displayName: 'Sam R.',    team: 'ASU',  rank: 3, weekPoints: 11, seasonPoints: 39, parlayPoints: 18, movement: 1, isSelf: true },
  { userId: 'u_reggie',  displayName: 'Reggie',    team: 'TOW',  rank: 4, weekPoints: 6,  seasonPoints: 38, parlayPoints: 3,  movement: -1 },
  { userId: 'u_priya',   displayName: 'Priya S.',  team: 'IDHO', rank: 5, weekPoints: 4,  seasonPoints: 33, parlayPoints: 0,  movement: 0 },
  { userId: 'u_bo',      displayName: 'Bo',        team: 'GTWN', rank: 6, weekPoints: 15, seasonPoints: 30, parlayPoints: 26, movement: 2 },
  { userId: 'u_elena',   displayName: 'Elena V.',  team: 'COMU', rank: 7, weekPoints: 5,  seasonPoints: 29, parlayPoints: 0,  movement: -1 },
  { userId: 'u_wendell', displayName: 'Wendell',   team: 'AUB',  rank: 8, weekPoints: 2,  seasonPoints: 26, parlayPoints: 3,  movement: -1 }
];

/** The tiebreak game finished 51 combined. These are the two level members' predicted
 *  totals, and the ranks that fall out of them: Dana misses by 2, Reggie by 9. */
const FINAL_PREDICTIONS = [
  { userId: 'u_dana', predictedTotal: 49 },
  { userId: 'u_reggie', predictedTotal: 60 }
];
const FINAL_WEEK_RANKS_PAIRS = [
  { userId: 'u_dana', rank: 4 },
  { userId: 'u_reggie', rank: 5 }
];
const FINAL_WEEK_RANKS = Object.fromEntries(FINAL_WEEK_RANKS_PAIRS.map((r) => [r.userId, r.rank]));

/** Twenty members with a four-way tie at the top and five more tie groups under it.
 *  Within a tie `standings()` orders on displayName, so these are alphabetical. */
const TIES_NAMES = ['Ana', 'Bo', 'Chris', 'Dana', 'Eli', 'Fran', 'Gus', 'Hana', 'Ivan', 'Jo',
                    'Kai', 'Lena', 'Mo', 'Nina', 'Omar', 'Pia', 'Quinn', 'Rae', 'Sam', 'Tess'];
const TIES_POINTS = [8, 8, 8, 8, 7, 7, 6, 6, 6, 5, 5, 5, 4, 4, 4, 3, 3, 2, 2, 1];
const TIES_RANKS  = [1, 1, 1, 1, 5, 5, 7, 7, 7, 10, 10, 10, 13, 13, 13, 16, 16, 18, 18, 20];
/** Real abbreviations, cycled so navy lands next to navy and null next to null. */
const TIES_TEAMS = ['CONN', 'CAL', 'ASU', 'TOW', 'COMU', 'IDHO', 'AUB', 'GTWN', 'UAB', 'ARK'];

function tiesRows() {
  return TIES_NAMES.map((n, i) => ({
    userId: 'u_' + n.toLowerCase(),
    displayName: n,
    team: TIES_TEAMS[i % TIES_TEAMS.length],
    rank: TIES_RANKS[i],
    weekPoints: TIES_POINTS[i],
    seasonPoints: 40 - i,
    parlayPoints: i === 1 ? 6 : 0,
    movement: 0,
    isSelf: n === 'Rae'          // rank 18 of 20 - off the first screen, which is
  }));                           // the whole reason the self card is pinned.
}

/** 200 members. The density check, and the reason a row is 42px and not 56. */
function crowdedRows() {
  const out = [];
  for (let i = 0; i < 200; i++) {
    /* STRICTLY DESCENDING IN BOTH COLUMNS, so ranks 1..200 are honest with no ties -
     * this state is about density, and a table where rank 1 and rank 2 hold the same
     * score would look like a competition-ranking bug instead. Three digits on
     * purpose: it is what proves the 44px number columns do not wrap at 200 members. */
    out.push({
      userId: 'u_' + i,
      displayName: 'Member ' + String(i + 1).padStart(3, '0'),
      team: TIES_TEAMS[i % TIES_TEAMS.length],
      rank: i + 1,
      weekPoints: 200 - i,
      seasonPoints: 600 - 2 * i,
      parlayPoints: i % 17 === 0 ? 12 : 0,
      movement: (i % 7) - 3,
      isSelf: i === 137
    });
  }
  return out;
}

function attachTeams(rows, byAbbrev) {
  return rows.map((r) => Object.assign({}, r, {
    isSelf: r.isSelf === true,
    teamIdentity: byAbbrev[r.team] || null
  }));
}

/* 🔴 THE SPORT REACHES THIS SCREEN TOO. Jason, 2026-09-08: "After I pick nfl.
 * Than slate pics and standings should be nfl, right?" Right, and it did not —
 * the sport gate wrote `ag.sport`, the live board and the slate honoured it, and
 * this table went on drawing an eight-person Big 12 office pool whatever the
 * user had chosen.
 *
 * A choice that only some screens honour is worse than no choice at all: it
 * makes the app look like it disagrees with itself. */
/* THE SCOPE. Jason, 2026-09-09: "A dropdown on the standings page for the group
 * or the world?" - two boards over the same picks.
 *
 * WORLD is everybody who picked this week: no invite, no setup, and you have a
 * rank the moment you make your first pick. GROUP is a pool you started or were
 * invited to.
 *
 * THE WORLD BOARD IS NOT A NICE EXTRA, IT IS THE COLD START. A group pool of one
 * person is not a pool: if the only board were your group, this screen would be
 * empty until somebody had talked three friends into installing the app, and an
 * empty screen on day one is how an app stops being opened. The world has
 * everybody in it from the first pick; the group is what you graduate to. */
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
  } catch (e) { return 'anon'; }
}

function storedScope() {
  try { return localStorage.getItem('ag.scope') || 'world'; } catch (e) { return 'world'; }
}

function chosenSport() {
  try {
    const v = JSON.parse(localStorage.getItem('ag.sport'));
    return v === 'nfl' ? 'nfl' : 'college-football';
  } catch { return 'college-football'; }
}

export async function previewData(fixtures, state) {
  /* The group board shares nothing with the preview office below - no fixture,
   * no invented member, no tiebreak game - so it leaves before any of it loads. */
  if (state === 'group') return loadGroupBoard();

  const all = Object.values(fixtures.teams.teams);
  const byAbbrev = {};
  for (const t of all) byAbbrev[t.abbrev] = t;

  /* The tiebreak game is a real fixture, read for its real combined total. */
  let tiebreak = { label: 'Oklahoma vs UTEP', actual: null, decided: false };
  try {
    const g = await fixtures.load('real-utep-at-ou');
    const c = g.header.competitions[0];
    const home = c.competitors.find((x) => x.homeAway === 'home');
    const away = c.competitors.find((x) => x.homeAway === 'away');
    const final = c.status && c.status.type && c.status.type.completed === true;
    tiebreak = {
      label: away.team.location + ' at ' + home.team.location,
      actual: final ? Number(home.score) + Number(away.score) : null,
      decided: final
    };
  } catch (e) { /* the preview still draws; the footer says "not yet played" */ }

  const base = {
    pool: { name: 'Fourth Floor', week: 6, memberCount: 8, scope: 'Big 12 only' },
    tiebreak: { label: tiebreak.label, actual: null, decided: false, myPrediction: 48 },
    weekRows: attachTeams(OFFICE_WEEK, byAbbrev),
    seasonRows: attachTeams(OFFICE_SEASON, byAbbrev),
    joinedWeek: {},
    /* 🔴 BADGES ARE SPARSE ON PURPOSE, and this is the point of drawing them at
     * all. Everybody has a team, so a team chip put a mark on every single row
     * and distinguished nobody. Two people in an eight-person pool have won
     * something; the rest have an empty slot, which is a fact about them rather
     * than a hole in the layout.
     *
     * These ids are the same shape earnedIds() emits - family + threshold - so
     * the preview and the real thing read the identical vocabulary. */
    badges: {
      u_dana: ['win1', 'top3'],
      u_reggie: ['win5', 'top3', 'crazy1'],
      u_marcus: ['day1']
    },
    asOf: Date.now() - 41000,
    phase: 'ready'
  };

  if (state === 'settling') {
    base.phase = 'settling';
    base.gamesLive = 4;
    /* Positions are moving as games finish, so the WEEK table has movement too. */
    base.weekRows = base.weekRows.map((r, i) => Object.assign({}, r, { movement: [0, 2, -1, 0, 1, -2, 0, 0][i] }));
  } else if (state === 'final') {
    /* 🔴 A LANDED TIEBREAK LEAVES NO SHARED RANK. Dana K. and Reggie are level on 6
     * all week; the moment Oklahoma-UTEP finishes at 51 combined, their predictions
     * separate them and the T disappears. Showing "Final: 51" over a live tie would
     * read as the tiebreaker having done nothing. FINAL_PREDICTIONS is what pool.ts
     * is fed to produce these ranks - see the test. */
    base.phase = 'final';
    base.tiebreak = Object.assign({}, base.tiebreak, { actual: tiebreak.actual, decided: tiebreak.decided });
    base.weekRows = base.weekRows.map((r) => Object.assign({}, r, {
      rank: FINAL_WEEK_RANKS[r.userId] != null ? FINAL_WEEK_RANKS[r.userId] : r.rank
    }));
  } else if (state === 'ties') {
    const rows = attachTeams(tiesRows(), byAbbrev);
    base.pool = { name: 'The Whole Floor', week: 6, memberCount: 20, scope: 'Top 25' };
    base.weekRows = rows;
    base.seasonRows = rows.map((r, i) => Object.assign({}, r, { rank: i + 1, parlayPoints: 0 }));
    base.phase = 'settling';
    base.gamesLive = 2;
  } else if (state === 'crowded') {
    const rows = attachTeams(crowdedRows(), byAbbrev);
    base.pool = { name: 'The Whole Company', week: 6, memberCount: 200, scope: 'All games' };
    base.weekRows = rows;
    base.seasonRows = rows;
  } else if (state === 'midseason') {
    base.joinedWeek = { u_elena: 4 };
  } else if (state === 'empty') {
    /* Nobody has a rank before the week kicks, so the table is alphabetical. Leaving
     * it in last week's finishing order would imply a standing that does not exist. */
    base.phase = 'pre';
    base.weekRows = base.weekRows
      .map((r) => Object.assign({}, r, {
        rank: 0, weekPoints: null, seasonPoints: null, parlayPoints: 0, movement: 0
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
    base.seasonRows = base.weekRows;
  }
  /* 🔴 NO NFL POOL EXISTS, SO THE NFL TABLE IS EMPTY — it is not the college one
   * relabelled, and it is not eight invented people with NFL abbreviations
   * beside their names.
   *
   * Everything above this line is built from `fixtures/teams.json`, which holds
   * 760 COLLEGE schools and no clubs. There is no pool server yet in either
   * sport; the college table is a designed preview standing in for one, and it
   * is honest only because every identity in it is a real school.
   *
   * Ported to the NFL it would be neither: invented people, invented points, and
   * team chips resolved out of a database that cannot answer. A standings table
   * is the one screen whose entire content is a claim about what other people
   * did, so a fabricated row here is not a placeholder — it is the app telling
   * you your friends scored something.
   *
   * The empty state already exists and says the true thing: nobody in this pool
   * yet, share the invite. */
  /* 🔴 NEITHER SPORT HAS A POOL, SO NEITHER GETS A TABLE. Jason, 2026-09-09:
   * "Fix the ncaa standings."
   *
   * The NFL was emptied first and college was left on the designed preview -
   * eight named people, week 6, a Big 12 scope, ranks and points. Every identity
   * in it is a REAL school, which is exactly what made it dangerous: it does not
   * read as a mock, it reads as your pool.
   *
   * 🔴 A STANDINGS TABLE IS THE ONE SCREEN WHOSE ENTIRE CONTENT IS A CLAIM ABOUT
   * WHAT OTHER PEOPLE DID. A fabricated slate row is a wrong fixture; a
   * fabricated standings row is the app telling you your friends scored
   * something. There is no pool server yet in either sport, so the honest answer
   * in both is the empty state that already exists and already says the true
   * thing: nobody in this pool yet, share the invite.
   *
   * The preview is not deleted - it is what the design harness renders behind
   * ?dev, and it is how this screen's layout was measured. It simply stops
   * standing in for a pool that does not exist. */
  /* 🔴 ONLY ON THE ROUTE A REAL PERSON REACHES. `ready` is what the bottom nav
   * links to; every other state here is a design surface behind ?dev, and those
   * exist to exercise settling, ties, a 200-person table and the tie-break -
   * none of which can be demonstrated with an empty table.
   *
   * So the preview keeps its job as a preview and stops doing a job it was never
   * meant to do, which was standing in for a pool on the live route. */
  const sport = chosenSport();
  if (state === 'ready') {
    const nfl = sport === 'nfl';
    const week = nfl ? 1 : 2;
    const device = deviceId();
    let scope = storedScope();
    let mine = [];
    let rows = [];
    try {
      const r = await (window.agApiFetch || fetch)('/api/pool/mine?device=' + encodeURIComponent(device));
      mine = ((await r.json()).pools) || [];
    } catch (e) { mine = []; }
    /* A remembered group scope with no group left is not an error - it is
     * somebody whose pool was deleted, or cleared storage. Fall back rather than
     * heading an empty board with a pool that is gone. */
    if (scope !== 'world' && !mine.some(function (x) { return x.id === scope; })) {
      scope = mine.length ? mine[0].id : 'world';
    }
    try {
      const q = '/api/pool/standings?sport=' + sport + '&week=' + week
        + (scope === 'world' ? '' : '&pool=' + encodeURIComponent(scope));
      rows = ((await (await fetch(q)).json()).rows) || [];
    } catch (e) { rows = []; }

    const here = scope === 'world' ? null : mine.filter(function (x) { return x.id === scope; })[0];
    const board = rows.map(function (r, i) {
      return {
        userId: r.id,
        displayName: r.name || 'Someone',
        rank: i + 1,
        /* A DASH, NOT A ZERO, for a week nothing has settled in. Empty and
         * nought are different facts and this screen keeps them apart. */
        weekPoints: r.played ? r.wins : null,
        seasonPoints: r.played ? r.wins : null,
        parlayPoints: 0, movement: 0, team: null,
        picks: r.picks, played: r.played
      };
    });
    return Object.assign({}, base, {
      sport,
      scope: scope, myPools: mine, deviceId: device,
      pool: {
        name: scope === 'world' ? 'The world' : (here ? here.name : 'Your group'),
        week: week, memberCount: board.length, scope: 'All games'
      },
      phase: board.length ? 'live' : 'pre',
      weekRows: board, seasonRows: board, joinedWeek: {}, badges: {},
      tiebreak: { label: null, actual: null, decided: false, myPrediction: null },
      /* 🔴 NOTHING ON THIS SCREEN IS INVENTED ANY MORE, so the shell's
       * sample-data banner must not appear over it. The banner reads this flag,
       * and an empty table carrying "these games, spreads and scores are made
       * up" is a disclaimer about content that is not there - which teaches
       * people to ignore the banner on the screens where it is true. */
      fromFeed: true
    });
  }
  base.sport = sport;
  return base;
}

/* ------------------------------------------------------------------ *
 * THE GROUP STATE - #/gstandings, the Standings tab of Group pools.
 *
 * Jason, 2026-09-11: "under group pools we also need a seperate standings
 * page." Same table, same pin, same week/season toggle as the main board; what
 * changes is WHICH board. It is the current group from components/group.js -
 * never `ag.scope`, which stays the main Standings' world/group selector - and
 * the rows are that group's own picks, scored by /api/pool/standings.
 *
 * 🔴 POINTS ONLY, AND NO PARLAY LADDER. A group scores one point per winner
 *    picked, straight up, in the query. Nothing here sums with the live board,
 *    and the main board's parlay footer is not printed: it is not how a group
 *    is scored.
 *
 * 🔴 MEMBERS ARE HANDLES. The API row's `name` is the handle the member joined
 *    with. Anything shaped like an address is drawn as "Someone" - the group
 *    section never prints one, whatever arrives.
 * ------------------------------------------------------------------ */

/** The week a group plays when it is not a one-week group. The same numbers as
 *  the main board's `ready` state above and p2-slate's WEEK: picks are written
 *  under the slate's week, so a board on any other week would read none. */
const GROUP_WEEK = { nfl: 1, 'college-football': 2 };

/* 🔴 ALL FIVE SPORTS. Jason, 2026-09-12: "complete the pool revision, but do all
 * the sports for the pool". This used to force every group to nfl or college
 * football, so a basketball or F1 group read a football board with nobody's
 * picks on it. The keys are the server's (src/lib/groups.ts POOL_SPORTS). */
const SPORT_LABEL = {
  'college-football': 'College football',
  nfl: 'NFL',
  'mens-college-basketball': 'College basketball',
  nba: 'NBA',
  f1: 'Formula 1',
  nascar: 'NASCAR',
  mlb: 'MLB',
  nhl: 'NHL',
  wnba: 'WNBA',
  'nascar-oreilly': 'NASCAR O’Reilly',
  'nascar-truck': 'NASCAR Trucks',
  /* Soccer (2026-09-13): a day at a time, like the NBA - so the season board. */
  epl: 'Premier League',
  mls: 'MLS',
  /* 2026-09-13: three more soccer leagues, college hockey, women's college
   * basketball - every one a day at a time, so the season board. */
  ucl: 'Champions League',
  laliga: 'La Liga',
  ligamx: 'Liga MX',
  'mens-college-hockey': 'College hockey',
  'womens-college-basketball': 'Women’s college basketball'
};

/** The soccer leagues - src/lib/groups.ts isSoccerSport. */
function isSoccerBoard(s) { return ['epl', 'mls', 'ucl', 'laliga', 'ligamx'].includes(s); }

/** A group's sport as one of the five; anything else is college football, as before. */
function groupSport(s) {
  return Object.prototype.hasOwnProperty.call(SPORT_LABEL, s) ? s : 'college-football';
}

function sportLabel(s) { return SPORT_LABEL[groupSport(s)]; }

/** Which board a sport gets. Football: week and season. Basketball picks a day
 *  at a time and its "week" is a date, so it gets the SEASON board only. F1 is
 *  scored in points over the weekends entered - one board, no week. */
function boardKind(s) {
  const k = groupSport(s);
  /* NASCAR too (2026-09-12): a race scored in points, one board. */
  if (k === 'f1' || k.startsWith('nascar')) return 'points';
  /* Every league that picks a day at a time (MLB, NHL, WNBA joined 2026-09-12). */
  if (k === 'mens-college-basketball' || k === 'nba' || k === 'mlb' || k === 'nhl' || k === 'wnba') return 'season';
  /* College hockey and women's college basketball (2026-09-13) too. */
  if (k === 'mens-college-hockey' || k === 'womens-college-basketball') return 'season';
  /* Every soccer league picks a day at a time too: its "week" is a date. */
  if (['epl', 'mls', 'ucl', 'laliga', 'ligamx'].includes(k)) return 'season';
  return 'week';
}

/** An F1 group's rows -> the one table drawn. The API has already ordered them
 *  by points; the rank is competition ranking on points, the same rule as
 *  football's wins. Until somebody has a point nothing has scored, so nobody has
 *  a rank and every figure is a dash - a weekend entered is not a weekend scored. */
function shapeF1Rows(api, youName, commishName) {
  const you = String(youName || '').toLowerCase();
  const boss = String(commishName || '').toLowerCase();
  const list = (api || []).map((r) => {
    const name = safeName(r && r.name);
    return {
      userId: String(r && r.id),
      displayName: name,
      points: Number(r && (r.points != null ? r.points : r.wins)) || 0,
      events: Number(r && (r.events != null ? r.events : r.played)) || 0,
      weekRec: null,
      seasonRec: null,
      parlayPoints: 0,
      movement: 0,
      rank: 0,
      isSelf: !!you && name.toLowerCase() === you,
      isCommish: !!boss && name.toLowerCase() === boss
    };
  });
  const scored = list.some((r) => r.points > 0);
  for (const r of list) {
    r.seasonPoints = scored && r.events ? r.points : null;
    r.weekPoints = r.seasonPoints;
  }
  if (!scored) return list.sort((a, b) => a.displayName.localeCompare(b.displayName));
  for (const r of list) r.rank = 1 + list.filter((o) => o.points > r.points).length;
  return list.sort((a, b) => a.rank - b.rank);
}

/** An F1 row's second line: weekends entered, never a W-L record. */
function weekendsText(n) {
  if (!n) return 'No weekends yet';
  return n + (n === 1 ? ' weekend' : ' weekends') + ' entered';
}

function safeName(n) {
  const s = String(n == null ? '' : n).trim();
  if (!s || /\S+@\S+\.\S+/.test(s)) return 'Someone';
  return s;
}

/** API rows -> the two pre-ranked tables the renderer draws.
 *  The API returns rows ordered wins desc, picks desc and carries no rank, so the
 *  rank is derived here and it is competition ranking on wins: level members
 *  share a rank and the next one skips. Before any game in that basis has gone
 *  final nobody has a rank at all, and the table is alphabetical - an order
 *  would imply a standing that does not exist yet. */
function shapeGroupRows(weekApi, seasonApi, youName, commishName) {
  const you = String(youName || '').toLowerCase();
  const boss = String(commishName || '').toLowerCase();
  const index = (list) => { const m = {}; for (const r of list || []) m[r.id] = r; return m; };
  const wkBy = index(weekApi);
  const ssBy = index(seasonApi);
  const rec = (r) => ({
    wins: Number(r && r.wins) || 0,
    played: Number(r && r.played) || 0,
    picks: Number(r && r.picks) || 0
  });
  const build = (list, key) => {
    const rows = (list || []).map((r) => {
      const w = rec(wkBy[r.id]);
      const s = rec(ssBy[r.id]);
      const name = safeName(r.name);
      return {
        userId: String(r.id),
        displayName: name,
        /* A dash, not a zero, until one of your picks has a final result. */
        weekPoints: w.played ? w.wins : null,
        seasonPoints: s.played ? s.wins : null,
        weekRec: w,
        seasonRec: s,
        parlayPoints: 0,
        movement: 0,
        rank: 0,
        isSelf: !!you && name.toLowerCase() === you,
        isCommish: !!boss && name.toLowerCase() === boss
      };
    });
    if (!rows.some((r) => r[key].played > 0)) {
      return rows.sort((a, b) => a.displayName.localeCompare(b.displayName));
    }
    for (const r of rows) r.rank = 1 + rows.filter((o) => o[key].wins > r[key].wins).length;
    return rows.sort((a, b) => a.rank - b.rank);
  };
  return { weekRows: build(weekApi, 'weekRec'), seasonRows: build(seasonApi, 'seasonRec') };
}

/** Everything the group state draws, from the API. Never throws: every failure
 *  is a `groupPhase` the renderer has words for. Called by previewData, and by
 *  the screen's own switch / retry / sign-in handlers before they re-render. */
async function loadGroupBoard(opts) {
  const out = {
    group: true,
    /* Nothing on this board is invented, so the sample-data banner stays off. */
    fromFeed: true,
    groupPhase: 'ready',
    groups: [],
    current: null,
    sport: null,
    message: '',
    pool: { name: 'Group pools', week: 0, memberCount: 0, scope: 'All games' },
    weekRows: [],
    seasonRows: [],
    weekPicks: 0,
    joinedWeek: {},
    badges: {},
    phase: 'live',
    tiebreak: { label: null, actual: null, decided: false, myPrediction: null }
  };
  const mine = await myGroups(opts);
  out.groups = mine.groups || [];
  if (!mine.signedIn) return Object.assign(out, { groupPhase: 'signed-out' });
  if (mine.error === 'offline') return Object.assign(out, { groupPhase: 'offline' });
  if (mine.error) return Object.assign(out, { groupPhase: 'error' });

  const g = pickCurrent(out.groups);
  if (!g) return Object.assign(out, { groupPhase: 'no-group' });

  const sport = groupSport(g.sport);
  const kind = boardKind(sport);
  /* Basketball's week is a day and F1 has none: both read the season board only. */
  const seasonOnly = kind !== 'week';
  const week = seasonOnly ? 0
    : (Number.isInteger(g.week) && g.week > 0 ? g.week : GROUP_WEEK[sport]);
  out.current = g;
  out.sport = sport;
  out.board = kind;
  out.pool = { name: g.name, week, memberCount: Number(g.members) || 0, scope: 'All games' };

  const q = '/api/pool/standings?sport=' + sport + '&pool=' + encodeURIComponent(g.id);
  let wk, ss, detail = null;
  try {
    const [a0, b, c] = await Promise.all([
      seasonOnly ? null : fetch(q + '&week=' + week),
      /* week=0 is the API's whole season: every week of this sport in this group. */
      fetch(q + '&week=0'),
      (window.agApiFetch || fetch)('/api/group/detail?id=' + encodeURIComponent(g.id)).catch(() => null)
    ]);
    const a = a0 || b;
    if (!a.ok || !b.ok) {
      let msg = '';
      try { msg = (await (a.ok ? b : a).json()).message || ''; } catch { /* not JSON */ }
      return Object.assign(out, { groupPhase: 'error', message: msg });
    }
    /* 🔴 A SEASON-ONLY BOARD FETCHES ONCE, SO IT IS READ ONCE. `a` IS `b` for
       F1 and basketball, and a response body cannot be read twice - the second
       .json() threw, the catch below called a working board "offline". Found at
       393px against the local Worker, 2026-09-12; the tests' fake fetch handed
       back objects that could be read any number of times. */
    ss = await b.json();
    wk = a0 ? await a0.json() : ss;
    if (c && c.ok) { try { detail = await c.json(); } catch { detail = null; } }
  } catch (e) {
    return Object.assign(out, { groupPhase: 'offline' });
  }

  let handle = '';
  try { handle = localStorage.getItem('ag.handle') || ''; } catch { /* private mode */ }
  const youRow = detail && Array.isArray(detail.members) ? detail.members.find((m) => m.you) : null;
  const youName = (youRow && youRow.name) || handle;
  const commish = detail && detail.commissioner ? detail.commissioner
    : (g.role === 'commissioner' ? youName : null);

  /* F1 comes back in points, and the response says so. */
  if (ss.unit === 'points' || kind === 'points') {
    out.board = 'points';
    const rows = shapeF1Rows(ss.rows || [], youName, commish);
    out.weekRows = rows;
    out.seasonRows = rows;
    out.weekPicks = rows.reduce((n, r) => n + r.events, 0);
    out.pool.week = 0;
    out.pool.memberCount = rows.length || out.pool.memberCount;
    return out;
  }

  const shaped = shapeGroupRows(wk.rows || [], ss.rows || [], youName, commish);
  out.weekRows = shaped.weekRows;
  out.seasonRows = shaped.seasonRows;
  out.weekPicks = (wk.rows || []).reduce((n, r) => n + (Number(r.picks) || 0), 0);
  /* The server forces a one-week group onto its own week; say the week it used. */
  out.pool.week = seasonOnly ? 0 : (Number(wk.week) || week);
  out.pool.memberCount = shaped.weekRows.length || out.pool.memberCount;
  return out;
}

/* The scope control. A select rather than a segmented row, because the group
 * list is unbounded - somebody can be in six pools - and a segmented control
 * that grows is a row that eventually scrolls sideways. */
function scopePicker(data) {
  const wrap = el('div', 'p5-scope');
  const sel = document.createElement('select');
  sel.className = 'p5-scope-sel';
  sel.setAttribute('aria-label', 'Which board');

  const world = document.createElement('option');
  world.value = 'world';
  world.textContent = 'The world';
  sel.appendChild(world);

  for (const po of (data.myPools || [])) {
    const o = document.createElement('option');
    o.value = po.id;
    o.textContent = po.name + ' · ' + po.members + (po.members === 1 ? ' member' : ' members');
    sel.appendChild(o);
  }
  sel.value = data.scope || 'world';
  sel.onchange = () => {
    try { localStorage.setItem('ag.scope', sel.value); } catch (e) {}
    /* A full reload, because the board is fetched in previewData - the screen
     * itself never reaches the network, which is the contract. */
    location.reload();
  };
  wrap.appendChild(sel);

  /* THE WAY INTO A GROUP IS ALWAYS PRESENT, not only when the board is empty.
   * Somebody looking at the world board is exactly the person who has not
   * started a pool yet. */
  /* THE WAY INTO A GROUP IS ALWAYS PRESENT, not only when the board is empty.
   * Somebody looking at the world board is exactly the person who has not
   * started a pool yet. */
  const add = el('button', 'p5-scope-add', (data.myPools || []).length ? 'New group' : 'Start a group');
  add.onclick = () => startFlow(data);
  wrap.appendChild(add);
  return wrap;
}

/* 🔴 IT IS A GROUP, NOT A POOL, IN EVERY WORD A PERSON READS. Jason,
 * 2026-09-09: "This is a group, not a pool."
 *
 * He is right and it is not a synonym swap. "Pool" is the thing you are IN with
 * money in most of the world - an office pool, a betting pool - and this product
 * spends its whole life not being that. "Group" says people you know and says
 * nothing about a stake. The storage still calls the row a pool, because the
 * schema, the endpoints and the D1 tables are internal and renaming them buys
 * nothing but a migration.
 *
 * THE INVITE, ON THE GROUP YOU ARE LOOKING AT. Jason, 2026-09-09: "Where is the
 * add/invite. Etc for the pools?"
 *
 * Nowhere, which was the gap: you could create a pool and then had no way to get
 * anybody into it. A pool of one is the failure state this whole screen is meant
 * to avoid, and the app was manufacturing it.
 *
 * THE CODE IS SHOWN AS WELL AS COPIED. A copy button alone fails the case it
 * exists for - somebody reading the code down the phone to their father, or
 * typing it into a message on another device. The code is six characters with no
 * vowels precisely so it can be read aloud, and hiding it behind a clipboard
 * throws that away. */
function inviteRow(data) {
  const c = el('div', 'card p5-inv');
  const left = el('div', 'p5-inv-l');
  left.appendChild(el('div', 'p5-inv-k', 'Invite code'));
  left.appendChild(el('div', 'p5-inv-code num', data.scope));
  c.appendChild(left);

  const b = el('button', 'p5-inv-go', 'Copy invite');
  b.onclick = async () => {
    /* The link carries the code, so a friend who taps it never types anything.
     * The code stays visible for the friend who cannot tap it. */
    const url = location.origin + '/?pool=' + encodeURIComponent(data.scope);
    const text = 'Join my pool on Any Given - code ' + data.scope;
    try {
      if (navigator.share) { await navigator.share({ title: 'Any Given', text, url }); return; }
    } catch (e) { /* dismissed the sheet: fall through to the clipboard */ }
    try {
      await navigator.clipboard.writeText(text + ' - ' + url);
      b.textContent = 'Copied';
      return;
    } catch (e) { /* no permission */ }
    /* A LINK THEY CAN STILL GET. If both routes are unavailable the button must
     * not simply do nothing - it shows the URL to select by hand. */
    b.textContent = url;
  };
  c.appendChild(b);
  return c;
}

/* NO POOL YET: the two ways in, side by side, and nothing else. */
function poolStart(data) {
  const c = el('div', 'card p5-start');
  c.appendChild(el('div', 'p5-start-h', 'You are not in a group yet'));
  c.appendChild(el('p', 'p5-start-b',
    'A group is people you know, scored against each other in points. Start one and '
    + 'share the code, or put in a code somebody sent you. Your picks are already '
    + 'counting on the world board either way.'));

  const a = el('button', 'p5-start-go', 'Start a group');
  a.onclick = () => startFlow(data);
  c.appendChild(a);

  const row = el('div', 'p5-join');
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'p5-join-in';
  inp.placeholder = 'Invite code';
  inp.maxLength = 8;
  /* Uppercased as they type: the codes are printed uppercase, and a field that
   * quietly disagrees with the thing being copied looks broken. */
  inp.oninput = () => { inp.value = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); };
  const go = el('button', 'p5-join-go', 'Join');
  const fail = (msg) => {
    go.disabled = false; go.textContent = 'Join';
    const old2 = c.querySelector('.p5-join-err');
    if (old2) old2.remove();
    /* THE ERROR GOES WHERE THE TYPING HAPPENED. An alert would take the code off
     * screen while telling them it was wrong. */
    c.appendChild(el('p', 'p5-join-err', msg));
  };
  go.onclick = async () => {
    const code = inp.value.trim();
    if (!code) { inp.focus(); return; }
    go.disabled = true; go.textContent = 'Joining...';
    try {
      const r = await (window.agApiFetch || fetch)('/api/pool/join', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deviceId: data.deviceId, code })
      });
      const j = await r.json();
      if (!r.ok) { fail(j.error || 'That code did not work.'); return; }
      try { localStorage.setItem('ag.scope', j.poolId); } catch (e) {}
      location.reload();
    } catch (e) { fail('No connection. Try again in a moment.'); }
  };
  row.append(inp, go);
  c.appendChild(row);
  return c;
}

async function startFlow(data) {
  /* ONE FIELD, AND IT IS OPTIONAL. Naming a pool is the only thing asked before
   * it exists, and a blank name is a pool called "Our pool" rather than a form
   * that refuses to submit. */
  const name = prompt('Name your group', 'Our group');
  if (name === null) return;
  try {
    const r = await (window.agApiFetch || fetch)('/api/pool/create', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId: data.deviceId, poolName: name || 'Our group',
                             sport: data.sport })
    });
    const j = await r.json();
    if (!r.ok) return;
    try { localStorage.setItem('ag.scope', j.poolId); } catch (e) {}
    location.reload();
  } catch (e) { /* offline: the button does not fire and the world board stands */ }
}

/* ------------------------------------------------------------------ *
 * THE ONE DERIVED VALUE - did the parlay move somebody?
 *
 * POOL-SCREENS P5: "the parlay's contribution called out where it moved somebody."
 * That is not a field on StandingsRow and it is not a ranking: it is a count of the
 * people this row would be BEHIND if its parlay had not landed. Zero means the
 * parlay changed the table for this person not at all, and the callout stays off.
 * ------------------------------------------------------------------ */
function passedByParlay(row, rows, basis) {
  const pts = (r) => (basis === 'week' ? r.weekPoints : r.seasonPoints);
  const p = pts(row);
  if (row.parlayPoints <= 0 || p == null) return 0;
  const without = p - row.parlayPoints;
  let n = 0;
  for (const other of rows) {
    if (other.userId === row.userId) continue;
    const q = pts(other);
    if (q != null && q > without && q <= p) n++;
  }
  return n;
}

/* ------------------------------------------------------------------ *
 * RENDER
 * ------------------------------------------------------------------ */

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export function render(root, data, state) {
  root.innerHTML = '';
  const style = document.createElement('style');
  style.textContent = [STATES_CSS, BADGE_CSS].concat(state === 'group' ? [GROUP_CSS] : []).join('\n');
  root.appendChild(style);

  const host = el('div', 'scr-p5-standings');
  root.appendChild(host);

  /* The toggle is the only piece of state this screen owns. It is a view control,
   * not data: it swaps which pre-ranked array is drawn. */
  let basis = 'week';
  draw();

  function draw() {
    host.innerHTML = '';
    /* #/gstandings has its own top and its own ways in; the table, the pin and
     * the toggle below are shared with the main board unchanged. */
    if (state === 'group') { drawGroup(); return; }
    const pool = (data && data.pool) || { name: 'Pool', week: 0, memberCount: 0 };

    /* THE SHARED HEADER. "1 members" is fixed here as well - the option list
     * got the plural right and this line built the same sentence a second time
     * and got it wrong, which is the argument for one template in miniature. */
    /* 🔴 NO LEAGUE MARK AND NO h1. Jason, 2026-09-10: "standings does the same
     * think, clean it up as well" - same as the slate and My picks. The top bar
     * says "Standings"; this keeps only the sub line. */
    host.appendChild(pageHeader({
      title: 'Standings',
      noTitle: true,
      sub: pool.name + ' · ' + pool.memberCount
        + (pool.memberCount === 1 ? ' member' : ' members')
    }));

    if (state === 'loading') {
      host.appendChild(stateBlock('loading', { rows: 8, body: 'Counting the week…' }));
      return;
    }
    if (state === 'error') {
      host.appendChild(stateBlock('error', {
        body: 'The standings did not load. Your picks and your points are safe — nothing here writes anything.',
        action: { label: 'Reload' }
      }));
      return;
    }

    host.appendChild(toggle(pool));

    /* OFFLINE HOLDS THE BOARD RATHER THAN REPLACING IT. states.js: "the board must
     * say what it still knows and how old it is." A leaderboard that goes blank is
     * indistinguishable from a leaderboard where everybody scored nothing. */
    if (state === 'offline') {
      host.appendChild(stateBlock('offline', {
        title: 'You are offline',
        body: 'These are the standings as of your last update. They can have moved.',
        since: data.asOf,
        action: { label: 'Try again' }
      }));
    }

    /* THE SCOPE SELECTOR, ABOVE THE TABLE. Two boards over the same picks: the
     * world, which needs no invite and has you in it from your first pick, and a
     * group you started or were invited to. */
    host.appendChild(scopePicker(data));
    /* Only on a group: there is no invite to the world, and offering one would
     * imply the world board is something you can be left out of. */
    if (data.scope && data.scope !== 'world') host.appendChild(inviteRow(data));

    const rows = basis === 'week' ? data.weekRows : data.seasonRows;
    if (!rows || rows.length === 0) {
      /* NOT IN A POOL IS NOT AN EMPTY TABLE, IT IS A DIFFERENT SCREEN. Jason,
       * 2026-09-09: "if you are not in a pool already, you have to start a pool
       * or get in invite."
       *
       * "Nobody in this pool yet - copy invite link" is right for a pool you
       * HAVE and nobody has joined. Shown to somebody with no pool at all it
       * offers to share a link to nothing: a dead end that looks like a feature.
       * Two different states, two sets of words, two buttons. */
      if (data.scope !== 'world' || !(data.myPools || []).length) {
        host.appendChild(poolStart(data));
        return;
      }
      host.appendChild(stateBlock('empty', {
        title: 'Nobody has picked yet this week',
        body: 'The world board fills as people make their first pick. Yours counts the moment you make it.',
        action: { label: 'Go to the slate', onClick: () => { location.hash = '#/slate'; } }
      }));
      return;
    }

    if (data.phase === 'pre') {
      host.appendChild(note('Week ' + pool.week + ' has not kicked. Nobody has scored yet — a dash is not a zero.'));
    } else if (data.phase === 'settling') {
      host.appendChild(note(data.gamesLive + ' games still playing · positions can still move', 'live'));
    } else if (data.phase === 'final') {
      host.appendChild(note('Week ' + pool.week + ' is final.'));
    }

    host.appendChild(selfCard(rows, pool));
    host.appendChild(table(rows));
    host.appendChild(footer(rows, pool));
  }

  /* ---------------------------------------------------------------- group
   * The Standings tab of Group pools. Every state here is decided by
   * loadGroupBoard from what the API answered; this only draws it. */
  function groupSub(d) {
    if (!d || !d.current) return 'Group pools';
    const p = d.pool;
    return sportLabel(d.sport) + (d.board && d.board !== 'week' ? ' · Season · ' : ' · Week ' + p.week + ' · ')
      + p.memberCount + (p.memberCount === 1 ? ' member' : ' members');
  }

  /* Switch, retry and sign-in all land here: say it is loading, read the board
   * again, and draw it fresh. The toggle goes back to the week. */
  async function reloadGroup(opts) {
    host.innerHTML = '';
    host.appendChild(pageHeader({ title: 'Standings', noTitle: true, sub: groupSub(data) }));
    host.appendChild(stateBlock('loading', { rows: 5, body: 'Loading the group standings…' }));
    const next = await loadGroupBoard(opts);
    render(root, next, state);
  }

  function groupSignIn() {
    const c = el('div', 'card p5-start');
    c.appendChild(el('div', 'p5-start-h', 'Sign in to see your group'));
    c.appendChild(el('p', 'p5-start-b',
      'Group standings are for the people in the group. Sign in and your groups are here.'));
    const b = el('button', 'p5-start-go', 'Sign in');
    b.type = 'button';
    b.onclick = async () => {
      if (typeof window.agOpenSignIn !== 'function') return;
      if (await window.agOpenSignIn()) reloadGroup({ force: true });
    };
    c.appendChild(b);
    return c;
  }

  /* Not in a group is not an empty table - it is the step before one. */
  function groupStart() {
    const c = el('div', 'card p5-start');
    c.appendChild(el('div', 'p5-start-h', 'You are not in a group yet'));
    c.appendChild(el('p', 'p5-start-b',
      'A group is people you know, picking winners each week and scored against each '
      + 'other in points. Start one and invite them, or join with the code from an invite.'));
    const b = el('button', 'p5-start-go', 'Start or join a group');
    b.type = 'button';
    b.onclick = () => { location.hash = '#/g'; };
    c.appendChild(b);
    return c;
  }

  function drawGroup() {
    const d = data || {};
    const pool = d.pool || { name: 'Group pools', week: 0, memberCount: 0 };
    host.appendChild(pageHeader({ title: 'Standings', noTitle: true, sub: groupSub(d) }));

    if (d.groupPhase === 'signed-out') { host.appendChild(groupSignIn()); return; }
    if (d.groupPhase === 'offline') {
      host.appendChild(stateBlock('offline', {
        title: 'You are offline',
        body: 'The group standings did not load. Your picks are safe — nothing here writes anything.',
        action: { label: 'Try again', onClick: () => reloadGroup({ force: true }) }
      }));
      return;
    }
    if (d.groupPhase === 'error') {
      host.appendChild(stateBlock('error', {
        /* The API's own message, verbatim, when it sent one. */
        body: d.message || 'The group standings did not load. Your picks are safe — nothing here writes anything.',
        action: { label: 'Reload', onClick: () => reloadGroup({ force: true }) }
      }));
      return;
    }
    if (d.groupPhase === 'no-group' || !d.current) { host.appendChild(groupStart()); return; }

    const sw = el('div', 'p5-gsw');
    sw.appendChild(groupSwitcher(d.groups, d.current.id, () => reloadGroup()));
    host.appendChild(sw);
    /* One board, no toggle: basketball and F1 read the season only. */
    const kind = d.board || 'week';
    const f1 = kind === 'points';
    if (kind === 'week') host.appendChild(toggle(pool));
    else basis = 'season';

    if (!d.weekPicks) {
      host.appendChild(stateBlock('empty', {
        title: kind === 'week' ? 'No picks in yet for week ' + pool.week
          : (f1 ? 'No weekends entered yet' : 'No picks in yet this season'),
        body: 'Nobody in ' + d.current.name + (kind === 'week' ? ' has picked this week.' : ' has picked yet.')
          + ' The table fills as the picks come in.',
        action: { label: 'Make your picks', onClick: () => { location.hash = '#/gpicks'; } }
      }));
    }

    const rows = (basis === 'week' ? d.weekRows : d.seasonRows) || [];
    const key = basis === 'week' ? 'weekRec' : 'seasonRec';
    const anyScore = f1 ? rows.some((r) => r.seasonPoints != null)
      : rows.some((r) => r[key] && r[key].played > 0);
    if (!anyScore) {
      host.appendChild(note((f1 ? 'No weekend has scored yet'
        : (basis === 'week' ? 'No game this week' : 'No game this season') + ' has gone final yet')
        + '. Nobody has scored — a dash is not a zero.'));
    }
    host.appendChild(selfCard(rows, pool));
    const brag = boastFor(rows, pool, d.current, location.origin);
    if (brag) host.appendChild(boastRow(brag));
    host.appendChild(table(rows));
    const foot = el('div', 'p5-foot');
    foot.appendChild(el('p', 'p5-footline', f1
      /* The numbers are src/lib/f1.ts POINTS and scoreTop3, read, not chosen. */
      ? 'Points from every Grand Prix weekend you enter. In qualifying, the sprint and the race: 3 for a driver '
        + 'in the exact spot, 1 for the right driver in the wrong spot. 3 for the fastest lap, 1 for the pole call, '
        + '2 for the retirements. Scored as each session finishes.'
      /* Soccer (2026-09-13): a level final is a result - the draw pickers score it
       * (src/lib/groups.ts gradeSql) - so "a tie counts for nobody" would be false. */
      /* A knockout won on penalties counts for the side that went through
       * (src/lib/groups.ts gradeSql reads game.winner first). */
      : isSoccerBoard(d.sport)
        ? 'A point for every right pick - a winner or the draw - once the match is final. A void game counts for nobody.'
          + ' A knockout decided on penalties counts for the side that went through.'
        : 'A point for every winner you pick, once the game is final. A tie or a void game counts for nobody.'));
    host.appendChild(foot);
  }

  /* 🔴 BOAST. Jason, 2026-09-12: "ability to boast via x and text". The same
   * three routes as the live game's invite - the native sheet, X's compose
   * window, a new text - and the same rule: the app fills in the words and the
   * person presses send. Only once you have a rank: a brag with no standing
   * behind it is an advert. */
  function boastRow(b) {
    const wrap = el('div', 'p5-boast');
    wrap.setAttribute('aria-label', 'Tell people where you stand');
    if (typeof navigator !== 'undefined' && navigator.share) {
      const s = el('button', 'p5-boast-go', 'Share');
      s.type = 'button';
      s.onclick = async () => {
        try { await navigator.share({ title: 'Any Given', text: b.text, url: b.url }); }
        catch { /* they closed the sheet; that is not a failure */ }
      };
      wrap.appendChild(s);
    }
    const x = el('a', 'p5-boast-go');
    x.href = b.x;
    x.target = '_blank';
    x.rel = 'noopener noreferrer';
    x.setAttribute('aria-label', 'Post it on X');
    x.append(el('span', 'p5-boast-mark', '𝕏'), el('span', null, 'Post it'));
    const t = el('a', 'p5-boast-go', 'Text it');
    t.href = b.sms;
    t.setAttribute('aria-label', 'Text it to a friend');
    wrap.append(x, t);
    return wrap;
  }

  function toggle(pool) {
    const wrap = el('div', 'p5-toggle');
    wrap.setAttribute('role', 'tablist');
    wrap.setAttribute('aria-label', 'Standings basis');
    for (const [key, label] of [['week', 'Week ' + pool.week], ['season', 'Season']]) {
      const b = el('button', 'p5-tab', label);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(basis === key));
      b.addEventListener('click', () => { basis = key; draw(); });
      wrap.appendChild(b);
    }
    return wrap;
  }

  function note(text, kind) {
    const p = el('p', 'p5-note' + (kind ? ' p5-note--' + kind : ''), text);
    return p;
  }

  /* THE PIN. Armchair's take, and the reason for it is in the LIVE capture: the
   * user's own score sat at 0 while the visible list bottomed out at 11,940. */
  function selfCard(rows, pool) {
    /* 🔴 `isSelf` COMES FROM THE DEVICE ID, and nothing was setting it - so the
     * person who had just created the group was told "You are watching this
     * pool. Join it to appear in the table" while standing first in that very
     * table. The flag exists on the preview's rows and was never derived for a
     * real board. */
    const me = rows.find((r) => r.isSelf || (data.deviceId && r.userId === data.deviceId)) || null;
    const card = el('div', 'card p5-self');
    if (!me) {
      card.classList.add('p5-self--none');
      card.appendChild(el('p', 'p5-self-none',
        'You are looking at this group without being in it. Make a pick and you are on the table.'));
      return card;
    }
    const pts = basis === 'week' ? me.weekPoints : me.seasonPoints;

    const rank = el('div', 'p5-self-rank num', me.rank ? ordinal(me.rank) : '—');
    const mid = el('div', 'p5-self-mid');
    const nm = el('div', 'p5-self-name');
    nm.append(el('span', null, me.displayName), el('span', 'p5-you', 'you'));
    const of = el('div', 'p5-self-of num',
      (me.rank ? 'of ' + pool.memberCount : 'unranked') +
      (me.movement ? ' · ' + movementText(me.movement) : ''));
    mid.append(nm, of);

    const right = el('div', 'p5-self-right');
    const fig = el('div', 'p5-self-pts num', dash(pts));
    const unit = el('div', 'p5-self-unit', basis === 'week' ? 'points this week' : 'points this season');
    right.append(fig, unit);

    card.append(rank, mid, right);

    const passed = passedByParlay(me, rows, basis);
    if (passed > 0) {
      const line = el('p', 'p5-self-parlay num',
        'Your parlay is ' + signed(me.parlayPoints) + ' of that — it put you past ' +
        passed + (passed === 1 ? ' person.' : ' people.'));
      card.appendChild(line);
    }
    return card;
  }

  /* The board has one figure, not two: a basketball or F1 group. */
  function oneCol() { return state === 'group' && !!data && !!data.board && data.board !== 'week'; }

  function table(rows) {
    const card = el('div', 'p5-table' + (oneCol() ? ' p5-table--one' : ''));

    /* Sofascore's header treatment: short caps, --dim, over the NUMERIC columns
     * only. Rank and name are unlabelled because they need no label. */
    const head = el('div', 'p5-head');
    head.append(el('span', null, ''), el('span', null, ''), el('span', null, ''), el('span', null, ''));
    if (oneCol()) {
      head.appendChild(el('span', 'p5-col p5-col--on', data.board === 'points' ? 'Points' : 'Season'));
      card.appendChild(head);
    } else {
    /* Spelled out. Jason, 2026-09-11: "go ahead and spell out season. i read
     * Seattle when i see SEA." In a football app a three-letter cap is a team. */
    const wk = el('span', 'p5-col' + (basis === 'week' ? ' p5-col--on' : ''), 'Week');
    const sea = el('span', 'p5-col' + (basis === 'season' ? ' p5-col--on' : ''), 'Season');
    head.append(wk, sea);
    card.appendChild(head);
    }

    const list = el('ol', 'p5-rows');
    /* `prevTeam` is gone with the chip. It existed so navy-against-navy and
       yellow-against-yellow were visible rather than theoretical, and there are
       no team colors on this screen to collide any more. */
    rows.forEach((r) => {
      list.appendChild(rowEl(r, rows));
    });
    card.appendChild(list);
    return card;
  }

  function rowEl(r, rows) {
    const li = el('li', 'p5-li');
    const a = el('a', 'p5-row' + (r.isSelf ? ' p5-row--self' : ''));
    /* Not on the group board: a group row's id is an account id, it belongs in
     * no URL, and there is no member page for the hash to open. */
    if (!data.group) a.href = '#member-' + r.userId;

    const tied = rows.filter((x) => x.rank === r.rank).length > 1 && r.rank > 0;
    const rank = el('span', 'p5-rank num');
    if (tied) rank.appendChild(el('span', 'p5-tie', 'T'));
    rank.appendChild(el('span', null, r.rank ? String(r.rank) : '—'));

    const mv = el('span', 'p5-mv num');
    if (r.movement) {
      mv.classList.add(signClass(r.movement));
      mv.textContent = (r.movement > 0 ? '▲' : '▼') + Math.abs(r.movement);
      mv.title = movementText(r.movement);
    }

    /* 🔴 THE MARK SLOT CARRIES A BADGE, NOT A TEAM. Jason, on this exact row:
     * "for the icons for each person, make up something for a person who won a
     * week, they get a logo, 2 weeks gets one, etc not 2 color, crap."
     *
     * A two-color chip beside a PERSON identifies a TEAM. It is the same two
     * colors for everybody who picked that team, it says nothing about who is
     * reading the week well, and on a standings row it is decoration wearing
     * data's clothes. A badge can only be there because that person did
     * something — and the slot the Sofascore bar puts a club crest in is exactly
     * the slot an earned mark belongs in.
     *
     * Nobody's badge is a real state and is drawn as NOTHING, never as a
     * placeholder. The column still reserves its width so twenty names stay in
     * one vertical line; an empty badge slot must not ragged the list.
     *
     * The component is shared with L6 — one badge system, specced once, per the
     * frozen contract. */
    const chipSlot = el('span', 'p5-chip');
    const held = (data.badges && data.badges[r.userId]) || [];
    const pin = badgePin(held, 20);
    if (pin) chipSlot.appendChild(pin);
    /* 🔴 NO "+N" HERE, and L6 keeps its. Tried and reverted the same evening: a
     * counter after the badge pushed the name, so "Dana K." and "Reggie" no
     * longer started where "Elena V." did, and the column went ragged on exactly
     * the three rows that had something to show.
     *
     * The Sofascore bar this screen is measured against is a vertical rhythm —
     * nine rows on one screen, twenty in two — and that only works if a name
     * begins in the same place on every row. L6's board is four columns of its
     * own and has the room. The tooltip on the pin still names every badge held,
     * and the case is where a collection belongs. */

    const nameCell = el('span', 'p5-namecell');
    if (data.group) {
      /* The group row: the handle, the commissioner marked, and under it the
       * record the API gives for the basis on show. */
      nameCell.classList.add('p5-namecell--g');
      const top = el('span', 'p5-nametop');
      top.appendChild(el('span', 'p5-name', r.displayName));
      if (r.isCommish) {
        const c = el('span', 'p5-tag p5-tag--commish', 'commish');
        c.title = r.displayName + ' is the commissioner';
        top.appendChild(c);
      }
      /* F1 has no wins and losses: the second line is weekends entered. */
      nameCell.append(top, el('span', 'p5-rec num', data.board === 'points' ? weekendsText(r.events)
        : recordText(basis === 'week' ? r.weekRec : r.seasonRec)));
    } else {
      nameCell.appendChild(el('span', 'p5-name', r.displayName));
    }

    const joined = data.joinedWeek ? data.joinedWeek[r.userId] : null;
    if (joined) {
      const j = el('span', 'p5-tag p5-tag--joined num', 'joined wk ' + joined);
      j.title = r.displayName + ' joined in week ' + joined + '. The season column covers fewer weeks.';
      nameCell.appendChild(j);
    } else {
      const passed = passedByParlay(r, rows, basis);
      if (passed > 0) {
        const p = el('span', 'p5-tag p5-tag--parlay num', 'parlay ' + signed(r.parlayPoints));
        p.title = 'The parlay put ' + r.displayName + ' past ' + passed +
                  (passed === 1 ? ' person.' : ' people.');
        nameCell.appendChild(p);
      }
    }

    const w = el('span', 'p5-num num' + (basis === 'week' ? ' p5-num--on' : ''), dash(r.weekPoints));
    const s = el('span', 'p5-num num' + (basis === 'season' ? ' p5-num--on' : ''), dash(r.seasonPoints));

    const one = oneCol();
    a.setAttribute('aria-label',
      (r.rank ? (tied ? 'Tied ' : '') + 'Rank ' + r.rank + ', ' : 'Unranked, ') + r.displayName +
      (r.isSelf ? ' (you)' : '') + (r.isCommish ? ', commissioner' : '') + ', ' +
      (one ? dash(r.seasonPoints) + ' points this season'
        : dash(r.weekPoints) + ' points this week, ' + dash(r.seasonPoints) + ' this season'));

    if (one) a.append(rank, mv, chipSlot, nameCell, s);
    else a.append(rank, mv, chipSlot, nameCell, w, s);
    li.appendChild(a);
    return li;
  }

  function footer(rows, pool) {
    const box = el('div', 'p5-foot');
    const tb = data.tiebreak;
    const anyTie = rows.some((r) => r.rank > 0 && rows.filter((x) => x.rank === r.rank).length > 1);

    /* 🔴 A TIEBREAK WITH NO GAME IS NOT A TIEBREAK. It printed "Ties break on
     * your predicted combined points in null" - a sentence built from a label
     * that was never set, because the real board carries no tiebreak game yet.
     * A missing value is a line that does not render, never a line with the word
     * null in it. */
    if (tb && tb.label) {
      const line = el('p', 'p5-footline num');
      if (tb.decided && tb.actual != null) {
        line.textContent = 'Ties break on your predicted combined points in ' + tb.label +
          '. Final: ' + tb.actual + ' combined' +
          (tb.myPrediction != null ? ' · you said ' + tb.myPrediction : '') + '.';
      } else {
        line.textContent = 'Ties break on your predicted combined points in ' + tb.label +
          '. Not played yet' + (tb.myPrediction != null ? ' · you said ' + tb.myPrediction : '') + '.';
      }
      box.appendChild(line);
    }
    if (anyTie && !(tb && tb.decided)) {
      box.appendChild(el('p', 'p5-footline num',
        'Level scores share a rank and the next rank skips. They stay level until that game is played.'));
    }
    for (const uid of Object.keys(data.joinedWeek || {})) {
      const r = rows.find((x) => x.userId === uid);
      if (!r) continue;
      box.appendChild(el('p', 'p5-footline num',
        r.displayName + ' joined in week ' + data.joinedWeek[uid] +
        ' — the season column is a shorter season, not a worse one.'));
    }
    box.appendChild(el('p', 'p5-footline num',
      'Parlay: 3 legs 3 points · 4 legs 6 · 5 legs 12 · 6 legs 20.'));
    return box;
  }
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** The brag: "I'm 2nd of 6 in The Fourth Floor on Any Given". A shared rank
 *  says so - a tie claimed as a clean 2nd is the one boast somebody will check. */
function boastText(rank, of, groupName, tied) {
  return "I'm " + (tied ? 'tied for ' : '') + ordinal(rank) + ' of ' + of
    + ' in ' + (String(groupName || '').trim() || 'my group') + ' on Any Given';
}

/** X's web intent and a new text, built the way live-game.screen.js builds its
 *  own: URLSearchParams for X, and `sms:?&body=` - the one form iOS and Android
 *  both read. The link carries the code, so a friend who taps it can join. */
function boastLinks(text, url) {
  return {
    x: 'https://twitter.com/intent/tweet?' + new URLSearchParams({ text, url }),
    sms: 'sms:?&body=' + encodeURIComponent(text + '\n' + url)
  };
}

/** Everything the boast row draws, or null with no rank to boast about. */
function boastFor(rows, pool, group, origin) {
  const me = (rows || []).find((r) => r.isSelf) || null;
  if (!me || !me.rank || !group || !group.id) return null;
  const tied = rows.filter((r) => r.rank === me.rank).length > 1;
  const of = (pool && pool.memberCount) || rows.length;
  const text = boastText(me.rank, of, group.name, tied);
  const url = origin + '/?pool=' + encodeURIComponent(group.id);
  return Object.assign({ text, url }, boastLinks(text, url));
}

function movementText(m) {
  if (!m) return 'no change';
  return (m > 0 ? 'up ' : 'down ') + Math.abs(m);
}

/** A group row's second line: wins and losses of FINAL games, then picks made.
 *  "2–1 · 5 picks". Nothing final yet says so rather than printing 0–0. */
function recordText(rec) {
  if (!rec || !rec.picks) return 'No picks yet';
  const picks = rec.picks + (rec.picks === 1 ? ' pick' : ' picks');
  if (!rec.played) return picks + ' · none final';
  return rec.wins + '–' + (rec.played - rec.wins) + ' · ' + picks;
}
