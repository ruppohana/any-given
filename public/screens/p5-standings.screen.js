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

export const id = 'p5-standings';
export const title = 'Standings - beat your office';
export const bar = 'reference/sofascore-teardown/screens/IMG_5226.PNG';

/** Every state is a route. `crowded` is the 200-member density check and `ties`
 *  is the twenty-row one - both exist because the bar is measured in rows per
 *  screen and a screen that is only ever drawn at eight rows proves nothing. */
export const states = [
  'ready', 'settling', 'final', 'ties', 'midseason', 'crowded',
  'empty', 'loading', 'offline', 'error'
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
  style.textContent = [STATES_CSS, BADGE_CSS].join('\n');
  root.appendChild(style);

  const host = el('div', 'scr-p5-standings');
  root.appendChild(host);

  /* The toggle is the only piece of state this screen owns. It is a view control,
   * not data: it swaps which pre-ranked array is drawn. */
  let basis = 'week';
  draw();

  function draw() {
    host.innerHTML = '';
    const pool = (data && data.pool) || { name: 'Pool', week: 0, memberCount: 0 };

    /* THE SHARED HEADER. "1 members" is fixed here as well - the option list
     * got the plural right and this line built the same sentence a second time
     * and got it wrong, which is the argument for one template in miniature. */
    host.appendChild(pageHeader({
      title: 'Standings',
      league: data.sport === 'nfl' ? 'nfl' : 'ncaa',
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

  function table(rows) {
    const card = el('div', 'p5-table');

    /* Sofascore's header treatment: short caps, --dim, over the NUMERIC columns
     * only. Rank and name are unlabelled because they need no label. */
    const head = el('div', 'p5-head');
    head.append(el('span', null, ''), el('span', null, ''), el('span', null, ''), el('span', null, ''));
    const wk = el('span', 'p5-col' + (basis === 'week' ? ' p5-col--on' : ''), 'Wk');
    const sea = el('span', 'p5-col' + (basis === 'season' ? ' p5-col--on' : ''), 'Sea');
    head.append(wk, sea);
    card.appendChild(head);

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
    a.href = '#member-' + r.userId;

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
    nameCell.appendChild(el('span', 'p5-name', r.displayName));

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

    a.setAttribute('aria-label',
      (r.rank ? (tied ? 'Tied ' : '') + 'Rank ' + r.rank + ', ' : 'Unranked, ') + r.displayName +
      (r.isSelf ? ' (you)' : '') + ', ' + dash(r.weekPoints) + ' points this week, ' +
      dash(r.seasonPoints) + ' this season');

    a.append(rank, mv, chipSlot, nameCell, w, s);
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

function movementText(m) {
  if (!m) return 'no change';
  return (m > 0 ? 'up ' : 'down ') + Math.abs(m);
}
