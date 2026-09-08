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
 *      NOT TAKEN: the mark column. Any Given has no logos, ever. The two-color chip
 *             from /components/team-chip.js holds that slot - the SHARED component,
 *             not a second one written here.
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
import { teamChip, TEAM_CHIP_CSS } from '/components/team-chip.js';
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
  return base;
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
  style.textContent = [STATES_CSS, TEAM_CHIP_CSS].join('\n');
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

    const h = el('h1', 'p5-h', 'Standings');
    const sub = el('p', 'p5-sub num',
      pool.name + ' · ' + pool.memberCount + ' members · ' + (pool.scope || ''));
    host.append(h, sub);

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

    const rows = basis === 'week' ? data.weekRows : data.seasonRows;
    if (!rows || rows.length === 0) {
      host.appendChild(stateBlock('empty', {
        title: 'Nobody in this pool yet',
        body: 'Share the invite code and the table fills itself.',
        action: { label: 'Copy invite link' }
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
    const me = rows.find((r) => r.isSelf) || null;
    const card = el('div', 'card p5-self');
    if (!me) {
      card.classList.add('p5-self--none');
      card.appendChild(el('p', 'p5-self-none', 'You are watching this pool. Join it to appear in the table.'));
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
    const card = el('div', 'card p5-table');

    /* Sofascore's header treatment: short caps, --dim, over the NUMERIC columns
     * only. Rank and name are unlabelled because they need no label. */
    const head = el('div', 'p5-head');
    head.append(el('span', null, ''), el('span', null, ''), el('span', null, ''), el('span', null, ''));
    const wk = el('span', 'p5-col' + (basis === 'week' ? ' p5-col--on' : ''), 'Wk');
    const sea = el('span', 'p5-col' + (basis === 'season' ? ' p5-col--on' : ''), 'Sea');
    head.append(wk, sea);
    card.appendChild(head);

    const list = el('ol', 'p5-rows');
    let prevTeam = null;
    rows.forEach((r) => {
      list.appendChild(rowEl(r, rows, prevTeam));
      prevTeam = r.teamIdentity;
    });
    card.appendChild(list);
    return card;
  }

  function rowEl(r, rows, prevTeam) {
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

    /* The chip is the SHARED component. adjacentTo is the row above, which is what
     * makes navy-against-navy and yellow-against-yellow visible instead of theoretical. */
    const chipSlot = el('span', 'p5-chip');
    if (r.teamIdentity) {
      chipSlot.appendChild(teamChip(r.teamIdentity, { size: 18, withAbbrev: false, adjacentTo: prevTeam }));
    }

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

    if (tb) {
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
