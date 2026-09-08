/* L5 — THE GAME TAB.
 *
 * The brief is explicit and it is the whole scope rule:
 *   docs/design/brief-now-tab-2026-09-05.md — "The Game tab ... is a real
 *   analytics screen and it works. DO NOT REDESIGN IT."
 * So this is a PORT. Dumbbell head-to-head, form sparklines, efficiency block,
 * leaders, win-probability line, drive chart — the same six things in the same
 * order, re-measured nowhere.
 *
 * BARS, both opened, both real:
 *
 *  1. `python tools/preview.py fixtures/02_red_zone.json --rich` in
 *     C:\Claude\Knowledge\sports-live, at 393px. The reference implementation's
 *     own Game tab. What it actually shows, top to bottom: SCORING, HEAD TO HEAD
 *     (a dumbbell — two dots on one shared track, per stat), <TEAM> FORM (three
 *     sparklines with a trend pill), <TEAM> EFFICIENCY, LEADERS, then a bare
 *     `ASU WIN PROBABILITY 37%` label over an unframed line with NO axis, NO
 *     center line, NO markers and NO reason attached, then DRIVES (own goal /
 *     midfield / end zone, one row per drive, result at the right).
 *     The win-probability line is the panel this piece is for: 7.7 and 7.8 are
 *     both about the fact that it says nothing.
 *
 *  2. reference/sofascore-teardown/screens/IMG_5212.PNG … IMG_5214.PNG —
 *     PAIRED HORIZONTAL BARS. One row per stat: value left, label centered,
 *     value right, and two tracks that grow OUT FROM A SHARED CENTER GUTTER,
 *     each scaled to max(a, b). Reads at arm's length, which is the couch test.
 *     screen-flow-2026-09-07 Stage 4 names this as the ONE thing the teardown
 *     contributes here. It replaces the dumbbell and nothing else changes.
 *     (IMG_5218 is the counter-example — five days out, a 0–1 head-to-head and
 *     a poll nobody voted in. That is what `pre-game` below has to beat.)
 *
 * ── WHERE ORIENTATION IS APPLIED, AND THAT IT IS APPLIED ONCE (7.6) ────────
 *
 *   NOWHERE IN THIS FILE. `winprob.ts::orientSeries` is the only place a flip
 *   happens in this codebase; `buildWinProbChart` calls it once and everything
 *   this view draws — the line, the fill, the call markers, the key moments,
 *   the momentum tracks and the sentence above them — is computed from the
 *   already-oriented `WpPoint[]`. Grep this file for `1 -` and for `flip`:
 *   there is no arithmetic against `homePct` anywhere, and `tests/l5-game.test.mjs`
 *   asserts that against this file's own source text.
 *
 *   The bug that rule was written for is the reference's momentum panel: the
 *   summary bar was pre-oriented and its three parts were not, so the bar
 *   pointed at the opposing team while the sentence above it named yours.
 *   `momentumFrom()` below takes ONE argument that knows about sides — the
 *   already-oriented chart — and derives every track and the sentence from it,
 *   so there is no second frame for the first one to disagree with.
 *
 * ── THE SPLIT THIS FILE KEEPS ─────────────────────────────────────────────
 *
 *   `previewData()` STANDS IN FOR THE SERVER. In production `GameRoom` calls
 *   the same modules and ships the result over the socket (CONTRACT §8 `state`).
 *   `render()` IS THE VIEW: it maps `t` and `pct` onto SVG coordinates and does
 *   nothing else. No fetch, no join, no flip.
 */

import { teamChip, teamVars, applyTeamVars, normalizeColor, tooClose, luminance, TEAM_CHIP_CSS }
  from '/components/team-chip.js';
import { stateBlock, STATES_CSS } from '/components/states.js';
import { signed, signClass, dash } from '/components/fmt.js';

/* THE REAL MODULES, imported not reimplemented. tools/preview.mjs strips the
 * types server-side, so the browser runs the same file node --test does. */
import { buildWinProbChart, CENTER } from '/src/lib/winprob.ts';
import { detect } from '/src/lib/detect.ts';
import { parsePlays } from '/src/lib/parse.ts';

export const id = 'l5-game';
export const title = 'The Game tab - win probability, drives, momentum, who';
export const bar = 'reference/sofascore-teardown/screens/IMG_5212.PNG';
export const states = ['live', 'pre-game', 'halftime', 'final', 'loading', 'offline', 'error'];

const NS = 'http://www.w3.org/2000/svg';

/* ══════════════════════════════════════════════════════════════════════════
 * 1 · READING THE FEED  (the server's half — never called from render)
 * ═════════════════════════════════════════════════════════════════════════ */

function s(v) { return v === null || v === undefined || v === '' ? null : String(v); }
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }

export function competitors(summary) {
  const c = summary && summary.header && summary.header.competitions;
  return (c && c[0] && c[0].competitors) || [];
}

/** Every play object in the summary, in order, deduped — ESPN repeats the
 *  active drive in both `previous` and `current`. */
export function rawPlays(summary) {
  const d = (summary && summary.drives) || {};
  const buckets = [];
  if (Array.isArray(d.previous)) buckets.push(...d.previous);
  if (d.current) buckets.push(d.current);
  const seen = new Set(), out = [];
  for (const drive of buckets) {
    if (!Array.isArray(drive.plays)) continue;
    for (const p of drive.plays) {
      const id = s(p.id) || s(p.sequenceNumber);
      if (id === null || seen.has(id)) continue;
      seen.add(id); out.push(p);
    }
  }
  return out;
}

/**
 * CONTRACT §6 amendment 5 — `GameFacts` is the side channel the detector cannot
 * work without and the parser does not emit. Everything here is lifted straight
 * off the feed; nothing is derived and nothing is guessed.
 */
export function gameFactsFrom(summary) {
  const comps = competitors(summary);
  const home = comps.find((c) => c.homeAway === 'home') || null;
  const away = comps.find((c) => c.homeAway === 'away') || null;
  const facts = {
    homeTeamId: home ? s(home.id) || s(home.team && home.team.id) : undefined,
    awayTeamId: away ? s(away.id) || s(away.team && away.team.id) : undefined,
    abbrev: {}, score: {}, endYardsToGoal: {}, scoring: {}, turnover: {}, espnType: {},
  };
  for (const c of comps) {
    const id = s(c.id) || s(c.team && c.team.id);
    if (id) facts.abbrev[id] = (c.team && c.team.abbreviation) || id;
  }
  for (const p of rawPlays(summary)) {
    const id = s(p.id) || s(p.sequenceNumber);
    if (!id) continue;
    if (p.homeScore !== undefined && p.awayScore !== undefined) {
      facts.score[id] = { home: Number(p.homeScore), away: Number(p.awayScore) };
    }
    const e = p.end || {};
    if (e.yardsToEndzone !== undefined) facts.endYardsToGoal[id] = num(e.yardsToEndzone);
    facts.scoring[id] = Boolean(p.scoringPlay);
    if (p.isTurnover !== undefined) facts.turnover[id] = Boolean(p.isTurnover);
    const t = p.type && p.type.text;
    if (t) facts.espnType[id] = String(t);
  }
  return facts;
}

/** playId -> DetectedEvent[]. What `buildWinProbChart` wants for 7.7. */
export function eventsFrom(detections) {
  const out = {};
  for (const d of detections) if (d.events && d.events.length) out[d.playId] = d.events;
  return out;
}

/** playId -> the WRITTEN headline. detect.ts composes these; nothing else does. */
export function headlinesFrom(detections) {
  const out = {};
  for (const d of detections) {
    if (!d.primary) continue;
    const r = (d.reasons || []).find((x) => x.event === d.primary);
    if (r) out[d.playId] = { headline: r.headline, detail: r.detail, quarter: d.quarter, clock: d.clock, star: d.star };
  }
  return out;
}

/**
 * Cut a finished game short at a win-probability row, so `live` and `halftime`
 * are the SAME REAL GAME seen earlier rather than a game somebody typed.
 * Nothing is added. Rows, drives and plays past the cut are dropped, and the
 * header score is set from the last surviving play, which is where it came from.
 */
export function cutAt(summary, wpIndex) {
  const rows = (summary.winprobability || []).slice(0, wpIndex + 1);
  const lastId = rows.length ? s(rows[rows.length - 1].playId) : null;

  const keep = new Set();
  let hit = false;
  const drives = [];
  for (const d of (summary.drives && summary.drives.previous) || []) {
    if (hit) break;
    const plays = [];
    for (const p of d.plays || []) {
      const id = s(p.id) || s(p.sequenceNumber);
      plays.push(p); if (id) keep.add(id);
      if (id !== null && id === lastId) { hit = true; break; }
    }
    drives.push({ ...d, plays });
    if (hit) break;
  }

  const last = drives.length ? drives[drives.length - 1] : null;
  const lastPlay = last && last.plays.length ? last.plays[last.plays.length - 1] : null;
  const homeScore = lastPlay ? Number(lastPlay.homeScore) : 0;
  const awayScore = lastPlay ? Number(lastPlay.awayScore) : 0;
  const period = lastPlay && lastPlay.period ? lastPlay.period.number : 1;
  const clock = lastPlay && lastPlay.clock ? lastPlay.clock.displayValue : '15:00';

  const comp = (summary.header.competitions[0]) || {};
  const competitorsOut = (comp.competitors || []).map((c) => ({
    ...c, score: String(c.homeAway === 'home' ? homeScore : awayScore),
  }));

  return {
    ...summary,
    winprobability: rows,
    drives: { previous: drives.slice(0, -1), current: last || null },
    header: {
      ...summary.header,
      competitions: [{
        ...comp,
        competitors: competitorsOut,
        status: {
          type: { id: '2', name: 'STATUS_IN_PROGRESS', state: 'in', completed: false, description: 'In Progress' },
          period, displayClock: clock,
        },
      }],
    },
  };
}

/**
 * The same game before kickoff: ESPN's own pre-kick win-probability row, the
 * real DraftKings line, and NOTHING ELSE — no plays, no drives, and a scoreline
 * of 0–0 rather than the final one the file also contains.
 *
 * That last part is not housekeeping. Left alone the header read
 * `UTEP 0 · Oklahoma 51 · Not started`, which is a screen that contradicts
 * itself in its own first two lines.
 */
export function beforeKickoff(summary) {
  const comp = (summary.header.competitions[0]) || {};
  return {
    ...summary,
    winprobability: (summary.winprobability || []).slice(0, 1),
    drives: { previous: [], current: null },
    boxscore: { teams: [], players: [] },
    leaders: [],
    header: {
      ...summary.header,
      competitions: [{
        ...comp,
        competitors: (comp.competitors || []).map((c) => ({ ...c, score: '0' })),
        status: {
          type: { id: '1', name: 'STATUS_SCHEDULED', state: 'pre', completed: false, description: 'Scheduled' },
        },
      }],
    },
  };
}

/* ══════════════════════════════════════════════════════════════════════════
 * 2 · 7.8 — THE USER'S OWN CALLS
 * ═════════════════════════════════════════════════════════════════════════ */

/**
 * 🔴 A NAMED STUB, and it is named again in the return.
 *
 * There is no captured call history in `fixtures/` and CONTRACT §1 forbids
 * writing one. What is real here is the OUTCOME: `landed` is
 * `play.type === side` read off M1's parser on the real play, so a marker that
 * is filled is filled because that snap really was a pass. The synthetic parts
 * are WHICH snaps a user called and the price `p` — `price.ts` needs a tendency
 * model this preview does not load.
 */
export function callsFromPlays(plays, opts) {
  const o = opts || {};
  const every = o.every || 11;
  const openLast = o.openLast === true;
  const out = [];
  const ladder = [5, 10, 25];
  let k = 0;
  for (let i = 0; i < plays.length; i++) {
    const p = plays[i];
    if (p.type !== 'run' && p.type !== 'pass') continue;
    if (i % every !== 0) continue;
    const side = k % 2 === 0 ? 'pass' : 'run';
    const stake = ladder[k % ladder.length];
    const pr = side === 'pass' ? 0.58 : 0.42;                 // STUB — see above
    const landed = p.type === side;                            // REAL
    out.push({
      snapId: p.id, side, stake, p: pr, state: 'settled', landed,
      delta: landed ? Math.round(stake * Math.min(1 / pr, 6)) - stake : -stake,
      priceIsStub: true,
    });
    k++;
  }
  if (openLast && out.length) {
    const l = out[out.length - 1];
    l.state = 'open'; l.landed = null; l.delta = null;
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
 * 3 · MOMENTUM — 7.6. One frame, derived from the oriented chart.
 * ═════════════════════════════════════════════════════════════════════════ */

/**
 * Three tracks and an overall, all in [-1, +1], POSITIVE = the team the chart
 * is drawn for. Nothing here reads `homePct`, so nothing here can disagree with
 * the line above it.
 *
 * @param chart      the WinProbChart — already oriented, once
 * @param detections detect() output, for explosive plays and turnovers
 * @param drives     the drive rows this view already built
 */
export function momentumFrom(chart, detections, drives) {
  const us = chart.orientation.teamId;
  const pts = chart.points;
  if (!pts.length || !us) return null;

  /* win prob — the last quarter of the series, in the oriented frame. */
  const from = pts[Math.max(0, pts.length - Math.max(6, Math.round(pts.length / 8)))];
  const wp = clamp((pts[pts.length - 1].pct - from.pct) * 4);

  /* drives — the last four, ours minus theirs, scored + / 0 / -. */
  const recentDrives = drives.slice(-4);
  let dScore = 0;
  for (const d of recentDrives) {
    const mine = d.teamId === us;
    const v = d.kind === 'score' ? 1 : d.kind === 'turnover' ? -1 : 0;
    dScore += mine ? v : -v;
  }
  const dr = clamp(dScore / Math.max(1, recentDrives.length));

  /* explosives — big plays in the last 20 snaps, ours minus theirs. */
  const recent = detections.slice(-20);
  let x = 0, xn = 0;
  for (const d of recent) {
    if (!d.events || d.events.indexOf('big_play') < 0) continue;
    xn++; x += d.offenseTeamId === us ? 1 : -1;
  }
  const ex = xn ? clamp(x / xn) : 0;

  const parts = [
    { name: 'win prob', value: wp },
    { name: 'drives', value: dr },
    { name: 'explosives', value: ex },
  ];
  const overall = clamp(parts.reduce((a, b) => a + b.value, 0) / parts.length);
  return {
    overall, parts,
    /* THE SENTENCE AND THE BAR ARE THE SAME NUMBER. That is the whole of 7.6. */
    towardUs: overall >= 0,
    magnitude: Math.abs(overall) < 0.12 ? 'Even' : Math.abs(overall) < 0.45 ? 'Edge' : 'Swing',
  };
}
function clamp(v) { return Math.max(-1, Math.min(1, v)); }

/* ══════════════════════════════════════════════════════════════════════════
 * 4 · THE DRIVE CHART
 * ═════════════════════════════════════════════════════════════════════════ */

const SCORE_RESULTS = /^(TD|FG)$/;
const TURNOVER_RESULTS = /^(INT|FUMBLE|DOWNS|SF|INT TD|FUMBLE TD)$/;

/**
 * 🔴 ESPN's drive `yardLine` IS ABSOLUTE FIELD POSITION, NOT OFFENSE-RELATIVE.
 *
 * 0 is the HOME team's goal line and 100 is the away team's, so the home team's
 * drives count UP the field and the away team's count DOWN it. Measured on all
 * three real games, and it is not close:
 *
 *     bois-at-ore   ORE (home) 7 forward / 0 reversed   BOIS 2 / 13
 *     ball-at-osu   OSU (home) 3 / 0                    BALL 2 / 11
 *     utep-at-ou    OU  (home) 5 / 0                    UTEP 0 / 12
 *
 * (`end - start === yards` is the test, and ESPN supplies `yards`, so this is
 * checked against the feed rather than believed.) Drawn raw, every away drive
 * ran backwards down the chart and every away touchdown finished at its own
 * goal line — visible in one look and invisible to every test in this repo.
 *
 * So both ends are normalized here, ONCE, into the offense's own frame:
 * 0 = own goal, 100 = the end zone it is attacking.
 *
 * 🔴 AND THEN A TOUCHDOWN REACHES THE END ZONE. ESPN's `end.yardLine` on a
 * scoring drive is the last snap's spot, not where the ball finished, so a
 * 62-yard touchdown drive that started at midfield draws as though it stopped
 * at midfield. No test catches that either; only looking does.
 */
export function driveRows(summary, teamsById) {
  const list = [];
  const d = (summary && summary.drives) || {};
  const all = [...((d.previous) || [])];
  if (d.current) all.push(d.current);

  const comps = competitors(summary);
  const homeId = s((comps.find((c) => c.homeAway === 'home') || {}).id)
    || s(((comps.find((c) => c.homeAway === 'home') || {}).team || {}).id);

  for (const dr of all) {
    if (!dr || !dr.team) continue;
    const abbrev = dr.team.abbreviation || dr.team.abbrev || '';
    const teamId = s(dr.team.id) || abbrevToId(summary, abbrev);
    const res = String(dr.shortDisplayResult || dr.result || '').toUpperCase();
    const isScore = Boolean(dr.isScore) || SCORE_RESULTS.test(res);
    const kind = isScore ? 'score' : TURNOVER_RESULTS.test(res) ? 'turnover' : 'neutral';
    const own = (y) => (y === null ? null : (teamId === homeId ? y : 100 - y));
    const start = own(num(dr.start && dr.start.yardLine));
    let end = own(num(dr.end && dr.end.yardLine));
    if (res === 'TD') end = 100;
    list.push({
      teamId, abbrev, team: (teamsById && teamId && teamsById[teamId]) || null,
      result: dr.displayResult || dr.result || '', short: res, kind,
      plays: num(dr.offensivePlays), yards: num(dr.yards),
      start: start === null ? 0 : start,
      end: end === null ? (start === null ? 0 : start) : end,
      inProgress: d.current === dr,
      period: dr.start && dr.start.period ? dr.start.period.number : null,
    });
  }
  return list;
}

function abbrevToId(summary, abbrev) {
  for (const c of competitors(summary)) {
    if ((c.team && c.team.abbreviation) === abbrev) return s(c.id) || s(c.team.id);
  }
  return null;
}

/* ══════════════════════════════════════════════════════════════════════════
 * 5 · HEAD TO HEAD — the Sofascore paired bars (IMG_5212–5214)
 * ═════════════════════════════════════════════════════════════════════════ */

const BOX_ROWS = [
  ['totalYards', 'Total yards'],
  ['rushingYards', 'Rushing yards'],
  ['netPassingYards', 'Passing yards'],
  ['firstDowns', 'First downs'],
  ['thirdDownEff', 'Third down'],
  ['turnovers', 'Turnovers'],
  ['possessionTime', 'Possession'],
];

/** The FINAL boxscore, which is only truthful once the game is over. */
export function h2hFromBoxscore(summary) {
  const teams = (summary.boxscore && summary.boxscore.teams) || [];
  if (teams.length !== 2) return [];
  const get = (t, k) => (t.statistics || []).find((x) => x.name === k);
  const out = [];
  for (const [key, label] of BOX_ROWS) {
    const a = get(teams[0], key), b = get(teams[1], key);
    if (!a || !b) continue;
    out.push({
      label,
      a: { teamId: s(teams[0].team.id), text: a.displayValue, value: statValue(key, a.displayValue) },
      b: { teamId: s(teams[1].team.id), text: b.displayValue, value: statValue(key, b.displayValue) },
    });
  }
  return out;
}

/**
 * ONE CONVENTION FOR THE WHOLE SCREEN: the team you follow is ABOVE the center
 * line on the curve and on the RIGHT of every bar. The boxscore arrives in
 * ESPN's own order and the momentum tracks grow right for the followed team, so
 * without this the two panels pointed opposite ways on the same screen and each
 * one was internally correct. That is the 7.6 failure wearing a different hat.
 */
export function orderH2H(rows, followId) {
  if (!rows.length || !followId) return rows;
  if (String(rows[0].b.teamId) === String(followId)) return rows;
  if (String(rows[0].a.teamId) !== String(followId)) return rows;
  return rows.map((r) => ({ label: r.label, a: r.b, b: r.a }));
}

/** `4-15` -> 26.7 (%), `31:54` -> 1914 (s), `274` -> 274. */
export function statValue(key, display) {
  const d = String(display || '');
  if (key === 'thirdDownEff' || key === 'fourthDownEff') {
    const m = /^(\d+)-(\d+)$/.exec(d);
    return m && Number(m[2]) ? (Number(m[1]) / Number(m[2])) * 100 : 0;
  }
  if (key === 'possessionTime') {
    const m = /^(\d+):(\d{2})$/.exec(d);
    return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
  }
  const n = Number(d.replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Mid-game, the boxscore carries END-OF-GAME totals and putting them on a
 * screen labelled `live` would be a lie. These five are exact at any cut
 * because every one of them is counted off the plays that have happened.
 * (`tests/l5-game.test.mjs` checks the third-down row against ESPN's own
 * `thirdDownEff` at the full cut: 4-15 and 4-12, exactly.)
 */
/** A snap that never happened. ESPN counts a third-down interception as an
 *  attempt and a timeout as nothing, which is the difference between 5-10 and
 *  ESPN's own 5-11 on real-ball-at-osu. */
const ADMIN = /timeout|end of .{0,14}(quarter|half|game)|coin toss/i;
export function isSnap(p) {
  if (p.type === 'penalty' || p.type === 'kick') return false;
  if (p.type === 'run' || p.type === 'pass') return true;
  return !ADMIN.test(p.text || '');
}

export function h2hFromPlays(plays, detections, driveList, ids) {
  const acc = {};
  const seed = (id) => (acc[id] || (acc[id] = { snaps: 0, third: 0, thirdOk: 0, boom: 0, giveaway: 0, drives: 0 }));
  seed(ids.a); seed(ids.b);
  for (const p of plays) {
    const a = acc[p.offenseTeamId];
    if (!a) continue;
    if (!isSnap(p)) continue;
    a.snaps++;
    if (p.down === 3) { a.third++; if (p.distance !== null && p.yards >= p.distance) a.thirdOk++; }
  }
  for (const d of detections) {
    const a = acc[d.offenseTeamId];
    if (!a) continue;
    if (d.events.indexOf('big_play') >= 0) a.boom++;
    if (d.events.indexOf('turnover') >= 0 || d.events.indexOf('interception') >= 0 ||
        d.events.indexOf('fumble') >= 0) a.giveaway++;
  }
  for (const d of driveList) if (acc[d.teamId]) acc[d.teamId].drives++;

  const row = (label, pick, fmt) => ({
    label,
    a: { teamId: ids.a, text: fmt(acc[ids.a]), value: pick(acc[ids.a]) },
    b: { teamId: ids.b, text: fmt(acc[ids.b]), value: pick(acc[ids.b]) },
  });
  return [
    row('Snaps', (x) => x.snaps, (x) => String(x.snaps)),
    row('Third down', (x) => (x.third ? (x.thirdOk / x.third) * 100 : 0), (x) => `${x.thirdOk}-${x.third}`),
    row('Explosive plays', (x) => x.boom, (x) => String(x.boom)),
    row('Giveaways', (x) => x.giveaway, (x) => String(x.giveaway)),
    row('Drives', (x) => x.drives, (x) => String(x.drives)),
  ];
}

/* ══════════════════════════════════════════════════════════════════════════
 * 6 · FORM SPARKLINES + EFFICIENCY (ported from the reference's two panels)
 * ═════════════════════════════════════════════════════════════════════════ */

/** Yards per play over a team's last four drives. Real plays, counted. */
export function formSeries(plays, driveIds, teamId) {
  const byDrive = new Map();
  for (const p of plays) {
    if (p.offenseTeamId !== teamId) continue;
    if (p.type !== 'run' && p.type !== 'pass') continue;
    const a = byDrive.get(p.driveId) || { n: 0, y: 0 };
    a.n++; a.y += p.yards; byDrive.set(p.driveId, a);
  }
  const order = driveIds.filter((d) => byDrive.has(d));
  const last = order.slice(-4).map((d) => {
    const a = byDrive.get(d);
    return Math.round((a.y / a.n) * 10) / 10;
  });
  return last;
}

export function efficiencyFor(plays, detections, teamId) {
  let snaps = 0, third = 0, thirdOk = 0, boom = 0, comp = 0, att = 0;
  for (const p of plays) {
    if (p.offenseTeamId !== teamId) continue;
    if (p.type === 'pass') { att++; if (/pass complete/i.test(p.text)) comp++; }
    if (!isSnap(p)) continue;
    snaps++;
    if (p.down === 3) { third++; if (p.distance !== null && p.yards >= p.distance) thirdOk++; }
  }
  for (const d of detections) {
    if (d.offenseTeamId !== teamId) continue;
    if (d.events.indexOf('big_play') >= 0) boom++;
  }
  return { snaps, third, thirdOk, boom, comp, att };
}

/* ══════════════════════════════════════════════════════════════════════════
 * 7 · LEADERS + WHO (7.2)
 * ═════════════════════════════════════════════════════════════════════════ */

const LEADER_CATS = ['passingYards', 'rushingYards', 'receivingYards', 'totalTackles'];
const LEADER_LABEL = { passingYards: 'Passing', rushingYards: 'Rushing', receivingYards: 'Receiving', totalTackles: 'Tackles' };

export function leaderRows(summary) {
  const out = [];
  for (const cat of LEADER_CATS) {
    let best = null;
    for (const teamBlock of summary.leaders || []) {
      const g = (teamBlock.leaders || []).find((x) => x.name === cat);
      const l = g && g.leaders && g.leaders[0];
      if (!l) continue;
      const v = Number(l.value);
      if (!best || (Number.isFinite(v) && v > best.value)) {
        best = {
          value: Number.isFinite(v) ? v : 0,
          cat: LEADER_LABEL[cat] || cat,
          teamId: s(teamBlock.team && teamBlock.team.id),
          name: (l.athlete && (l.athlete.shortName || l.athlete.displayName)) || '',
          jersey: (l.athlete && l.athlete.jersey) || null,
          line: l.displayValue || '',
        };
      }
    }
    if (best) out.push(best);
  }
  return out;
}

/**
 * 🔴 7.2 — READ `play.star`. NEVER DERIVE THE STAR FROM PLAY TEXT.
 * The parenthesized group at the end of a play is the TACKLER, and the naive
 * rule disagrees with the real star on 410 of 462 real plays. `parse.ts` emits
 * it explicitly with an explicit role; this function only picks the last play
 * that has one.
 */
export function whoFrom(plays, calls, window) {
  const w = window === undefined ? 14 : window;
  const byCall = new Map((calls || []).map((c) => [String(c.snapId), c]));

  /* The brief's item 2: "the play that settled your call is the play whose ball
   * carrier you want named." So a call inside the recent window wins the card —
   * that is what makes the verdict and the player ONE moment rather than two
   * panels, and it is why the player card used to read as trivia. */
  const from = Math.max(0, plays.length - w);
  for (let i = plays.length - 1; i >= from; i--) {
    const p = plays[i];
    if (p.star && byCall.has(String(p.id))) {
      return { play: p, star: p.star, call: byCall.get(String(p.id)) };
    }
  }
  for (let i = plays.length - 1; i >= 0; i--) {
    const p = plays[i];
    if (!p.star) continue;
    return { play: p, star: p.star, call: byCall.get(String(p.id)) || null };
  }
  return null;
}

/* ══════════════════════════════════════════════════════════════════════════
 * 8 · THE VIEW MODEL — one function, so the test can hold it
 * ═════════════════════════════════════════════════════════════════════════ */

export function buildGameView(summary, opts) {
  const o = opts || {};
  const teamsById = o.teamsById || {};
  const comps = competitors(summary);
  const home = comps.find((c) => c.homeAway === 'home') || null;
  const away = comps.find((c) => c.homeAway === 'away') || null;
  const homeId = home ? s(home.id) || s(home.team.id) : null;
  const awayId = away ? s(away.id) || s(away.team.id) : null;
  const followId = o.followTeamId || homeId;

  const plays = parsePlays(summary);
  const facts = gameFactsFrom(summary);
  const detections = detect(plays, facts);
  const events = eventsFrom(detections);
  const headlines = headlinesFrom(detections);

  const calls = o.calls || [];
  /* ONE call — the chart, the markers and the key moments come out together and
   * the view never joins any of it. CONTRACT 7.6 / 7.7 / 7.8. */
  const chart = buildWinProbChart(summary, {
    teamId: followId, calls, events, keyMomentMinDelta: o.keyMomentMinDelta ?? 0.05,
  });

  /* The written headline is attached HERE, on the server side of the line.
   * `chart.keyMoments` already carries the ORIENTED wpDelta; detect.ts carries
   * the sentence. Neither number is recomputed. */
  const keyMoments = chart.keyMoments.map((m) => ({
    ...m,
    headline: (headlines[m.playId] && headlines[m.playId].headline) || m.event.replace(/_/g, ' '),
    detail: (headlines[m.playId] && headlines[m.playId].detail) || null,
    quarter: headlines[m.playId] ? headlines[m.playId].quarter : null,
    clock: headlines[m.playId] ? headlines[m.playId].clock : null,
  }));
  const topMoments = keyMoments
    .map((m, i) => ({ m, i }))
    .sort((x, y) => Math.abs(y.m.wpDelta) - Math.abs(x.m.wpDelta) || x.i - y.i)
    .slice(0, 3)
    .map((x) => x.m)
    .sort((x, y) => keyMoments.indexOf(x) - keyMoments.indexOf(y));

  const driveList = driveRows(summary, teamsById);
  const driveIds = [];
  for (const p of plays) if (driveIds[driveIds.length - 1] !== p.driveId) driveIds.push(p.driveId);

  const status = (summary.header.competitions[0] || {}).status || {};
  const st = (status.type && status.type.state) || 'post';

  return {
    followId, homeId, awayId,
    home: teamsById[homeId] || null,
    away: teamsById[awayId] || null,
    homeAbbrev: chart.homeAbbrev, awayAbbrev: chart.awayAbbrev,
    homeScore: home ? Number(home.score) : null,
    awayScore: away ? Number(away.score) : null,
    statusText: (status.type && (status.type.shortDetail || status.type.description)) || '',
    period: status.period || null,
    displayClock: status.displayClock || null,
    live: st === 'in',
    chart, keyMoments, topMoments, calls,
    momentum: momentumFrom(chart, detections, driveList),
    drives: driveList,
    leaders: leaderRows(summary),
    /* A finished game has no "just now", so the card is your LAST call and the
     * player on it. A live one only combines them when the call is recent —
     * otherwise "who just did that" would name a play from ten snaps ago. */
    who: whoFrom(plays, calls, st === 'post' ? plays.length : 14),
    h2h: orderH2H(st === 'post'
      ? h2hFromBoxscore(summary)
      : h2hFromPlays(plays, detections, driveList, { a: awayId, b: homeId }), followId),
    h2hSource: st === 'post' ? 'boxscore' : 'plays',
    form: {
      us: formSeries(plays, driveIds, followId),
      them: formSeries(plays, driveIds, followId === homeId ? awayId : homeId),
    },
    efficiency: efficiencyFor(plays, detections, followId),
    spread: pickcenter(summary),
    kickoff: kickoffInfo(summary),
    playCount: plays.length,
  };
}

function pickcenter(summary) {
  const p = (summary.pickcenter || [])[0];
  if (!p) return null;
  return { details: p.details || null, overUnder: num(p.overUnder) };
}

/** Kickoff and venue, both straight off the feed. On a pre-game screen these
 *  are two of the few things that are actually knowable five days out. */
function kickoffInfo(summary) {
  const comp = (summary.header && summary.header.competitions && summary.header.competitions[0]) || {};
  const venue = (summary.gameInfo && summary.gameInfo.venue) || {};
  const addr = venue.address || {};
  const when = comp.date ? new Date(comp.date) : null;
  return {
    when: when && !Number.isNaN(when.getTime()) ? when.getTime() : null,
    venue: venue.fullName || null,
    city: addr.city ? [addr.city, addr.state].filter(Boolean).join(', ') : null,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
 * 9 · previewData — THE SERVER'S STAND-IN
 * ═════════════════════════════════════════════════════════════════════════ */

/* Which real game each state is drawn from, and why that one.
 *   live      bois-at-ore cut two snaps after the biggest swing in the corpus —
 *             a Q4 62-yard touchdown worth +28.8 points at index 149 of 179.
 *   final     the same game, ORIENTED TO THE AWAY TEAM so the flip is exercised.
 *             Boise St's primary is 0033a0 — the NAVY case.
 *   halftime  ball-at-osu, cut at the end of Q2. Both primaries are ba0c2f —
 *             an IDENTICAL PAIR in the real file, which is the adjacency case
 *             the live board never had to survive.
 *   pre-game  utep-at-ou at row 0: ESPN's own pre-kick number and DraftKings'
 *             line, with no plays behind either. UTEP's ff8200 is the light
 *             primary that breaks first on white.
 */
export async function previewData(fixtures, state) {
  const teamsById = (fixtures.teams && fixtures.teams.teams) || {};
  if (state === 'loading' || state === 'error') return { teamsById };

  const which = state === 'halftime' ? 'real-ball-at-osu'
    : state === 'pre-game' ? 'real-utep-at-ou'
    : 'real-bois-at-ore';
  const raw = await fixtures.load(which);

  let summary = raw, follow = null, calls = [];
  const comps = competitors(raw);
  const homeId = s((comps.find((c) => c.homeAway === 'home') || {}).id);
  const awayId = s((comps.find((c) => c.homeAway === 'away') || {}).id);

  if (state === 'live' || state === 'offline') {
    summary = cutAt(raw, 152);
    follow = homeId;
  } else if (state === 'halftime') {
    const rows = raw.winprobability || [];
    const plays = parsePlays(raw);
    const byId = new Map(plays.map((p) => [p.id, p]));
    let cut = rows.length - 1;
    for (let i = 0; i < rows.length; i++) {
      const p = byId.get(s(rows[i].playId));
      if (p && p.quarter >= 3) { cut = Math.max(0, i - 1); break; }
    }
    summary = cutAt(raw, cut);
    follow = awayId;
  } else if (state === 'pre-game') {
    summary = beforeKickoff(raw);
    follow = homeId;
  } else {
    follow = awayId;                       // final — the FLIPPED case
  }

  if (state !== 'pre-game') {
    calls = callsFromPlays(parsePlays(summary), { every: 11, openLast: state === 'live' });
  }

  const view = buildGameView(summary, { teamsById, followTeamId: follow, calls });
  view.stale = state === 'offline' ? Date.now() - 47000 : null;
  return { view, teamsById, state };
}

/* ══════════════════════════════════════════════════════════════════════════
 * 10 · THE VIEW.  Coordinates only.
 * ═════════════════════════════════════════════════════════════════════════ */

const VB_W = 700, VB_H = 240, PAD_X = 10, PAD_Y = 12;
const px = (t) => PAD_X + t * (VB_W - PAD_X * 2);
/* `frac` is a 0..1 SCREEN FRACTION, not a probability. The inversion below is
 * SVG's y-axis pointing down and nothing else — the deliberately unambiguous
 * naming is so `1 - pct` never appears in this file, where it would read as a
 * second orientation flip. tests/l5-game.test.mjs asserts that. */
const py = (frac) => PAD_Y + (1 - frac) * (VB_H - PAD_Y * 2);
const CY = py(CENTER);                          // 🔴 THE ONE CENTER LINE

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = text;
  return e;
}
function svg(tag, attrs) {
  const e = document.createElementNS(NS, tag);
  for (const k of Object.keys(attrs || {})) e.setAttribute(k, String(attrs[k]));
  return e;
}
function panel(heading) {
  const p = el('section', 'card l5-panel');
  if (heading) p.appendChild(el('h2', 'l5-h', heading));
  return p;
}
function teamColor(team) {
  return teamVars(team).vars['--team-a'];
}
function pct1(v) { return `${Math.round(v * 100)}%`; }

export function render(root, data, state) {
  root.innerHTML = '';
  /* ADD, never assign — the harness's own `.ag-main` measure cap lives on this
   * element and `className =` silently removes it. */
  root.classList.add('scr-l5-game');
  const style = el('style');
  style.textContent = [STATES_CSS, TEAM_CHIP_CSS].join('\n');
  root.appendChild(style);

  if (state === 'loading') {
    root.appendChild(el('h1', 'l5-title', 'Game'));
    root.appendChild(stateBlock('loading', { rows: 5, body: 'Reading the drive chart\u2026' }));
    return;
  }
  if (state === 'error') {
    root.appendChild(el('h1', 'l5-title', 'Game'));
    root.appendChild(stateBlock('error', {
      title: 'The game panels did not load',
      body: 'The score and your calls are safe. Only the charts are missing.',
      action: { label: 'Reload' },
    }));
    return;
  }

  const v = data && data.view;
  if (!v) { root.appendChild(stateBlock('error', { body: 'No game data.' })); return; }

  root.appendChild(scoreHead(v, state));

  if (state === 'offline') {
    root.appendChild(stateBlock('offline', {
      title: 'The feed dropped',
      body: 'One server polls and your phone holds one connection. Everything below is what we had when it went.',
      since: v.stale,
      action: { label: 'Try again' },
    }));
  }

  root.appendChild(winProbPanel(v, state));
  if (state === 'pre-game') { root.appendChild(pregamePanel(v)); return; }

  if (v.momentum) root.appendChild(momentumPanel(v));
  if (v.who) root.appendChild(whoPanel(v));
  if (v.h2h.length) root.appendChild(h2hPanel(v));
  if (v.form.us.length) root.appendChild(formPanel(v));
  if (v.leaders.length) root.appendChild(leadersPanel(v));
  if (v.drives.length) root.appendChild(drivesPanel(v));
}

/* ---- the score head ---------------------------------------------------- */

function scoreHead(v, state) {
  const wrap = el('header', 'l5-head');

  const row = el('div', 'l5-score');
  for (const side of ['away', 'home']) {
    const team = side === 'home' ? v.home : v.away;
    const abbrev = side === 'home' ? v.homeAbbrev : v.awayAbbrev;
    const score = side === 'home' ? v.homeScore : v.awayScore;
    const id = side === 'home' ? v.homeId : v.awayId;
    const line = el('div', 'l5-score-row' + (id === v.followId ? ' is-following' : ''));
    line.appendChild(teamChip(team || { abbrev, name: abbrev, primary: null, secondary: null },
      { adjacentTo: side === 'home' ? v.away : v.home, size: 20 }));
    const nm = el('span', 'l5-score-name', (team && team.short) || abbrev || '\u2014');
    const sc = el('span', 'l5-score-num num', score === null ? '\u2014' : String(score));
    line.append(nm, sc);
    row.appendChild(line);
  }
  wrap.appendChild(row);

  const meta = el('p', 'l5-meta num');
  /* OFFLINE KEEPS THE CLOCK IT HAD. `In Progress` beside a panel that says the
   * feed dropped is the screen disagreeing with itself, and the whole point of
   * the offline state is saying how old what you are looking at is. */
  const clockText = (state === 'live' || state === 'offline') && v.period
    ? `Q${v.period} ${v.displayClock || ''}`.trim() + (state === 'offline' ? ' when the feed went' : '')
    : state === 'halftime' ? 'Halftime'
    : state === 'pre-game' ? 'Not started'
    : v.statusText || 'Final';
  const followAb = v.followId === v.homeId ? v.homeAbbrev : v.awayAbbrev;
  meta.textContent = `${clockText} \u00b7 every chart below is drawn for ${followAb}`;
  wrap.appendChild(meta);
  return wrap;
}

/* ---- 7.6 / 7.7 / 7.8 --------------------------------------------------- */

function winProbPanel(v, state) {
  const c = v.chart;
  const usAb = v.followId === v.homeId ? v.homeAbbrev : v.awayAbbrev;
  const themAb = v.followId === v.homeId ? v.awayAbbrev : v.homeAbbrev;
  const usTeam = v.followId === v.homeId ? v.home : v.away;
  const themTeam = v.followId === v.homeId ? v.away : v.home;

  const p = panel(null);
  p.classList.add('l5-wp');
  /* SCOPED PER ELEMENT. Never at :root — the accent is not touched. */
  p.style.setProperty('--wp-us', teamColor(usTeam));
  p.style.setProperty('--wp-them', teamColor(themTeam));
  if (tooClose(normalizeColor(usTeam && usTeam.primary), normalizeColor(themTeam && themTeam.primary))) {
    p.dataset.clash = 'true';
  }

  const head = el('div', 'l5-wp-head');
  head.appendChild(el('h2', 'l5-h', `${usAb} win probability`));
  const now = el('span', 'l5-wp-now num', c.summary ? pct1(c.summary.pct) : '\u2014');
  head.appendChild(now);
  p.appendChild(head);

  /* ONE POINT IS NOT A LINE. Before kickoff there is exactly one real row —
   * ESPN's pre-kick number — and drawn as a curve it was a flat rule sitting on
   * the center line, saying nothing at the moment anticipation is highest. So
   * the same number becomes a SPLIT BAR: both teams, one shared 100%, readable
   * from the couch. It is the same center line and the same two colors. */
  if (c.points.length < 2) {
    p.appendChild(preKickBar(c, usAb, themAb));
  } else {
    p.appendChild(wpChart(v, usAb, themAb));

    /* 7.8 — the legend says what a mark means, because nobody else has these. */
    const marked = c.markers.length;
    const landed = c.markers.filter((m) => m.fill === 'filled').length;
    const legend = el('div', 'l5-legend');
    legend.appendChild(keyMark('filled', 'landed'));
    legend.appendChild(keyMark('hollow', 'missed'));
    if (c.markers.some((m) => m.fill === 'open')) legend.appendChild(keyMark('open', 'in flight'));
    const tally = el('span', 'l5-legend-tally num',
      marked ? `${landed} of ${marked} landed` : 'no calls yet on this game');
    legend.appendChild(tally);
    p.appendChild(legend);
  }

  if (c.summary && c.summary.biggestSwing && state !== 'pre-game') {
    const b = c.summary.biggestSwing;
    const line = el('p', 'l5-swing');
    const who = b.delta >= 0 ? usAb : themAb;
    line.innerHTML = '';
    line.appendChild(el('b', 'num ' + (b.delta >= 0 ? 'up' : 'down'),
      `${who} ${signed(Math.round(Math.abs(b.delta) * 100))}`));
    line.appendChild(document.createTextNode(' \u00b7 biggest single swing of the game'));
    p.appendChild(line);
  }

  /* 🔴 7.7 — WHY THE LINE MOVED. detect.py has computed these all along and
   * the original never showed one. IBM SlamTracker's Key moment is the model. */
  if (v.topMoments.length) {
    const wrap = el('div', 'l5-moments');
    wrap.appendChild(el('h3', 'l5-h3', 'Why it moved'));
    v.topMoments.forEach((m, i) => {
      const r = el('div', 'l5-moment');
      r.appendChild(el('span', 'l5-moment-n num', String(i + 1)));
      const b = el('div', 'l5-moment-b');
      const t = el('p', 'l5-moment-h', m.headline);
      /* detect.ts writes a `detail` for the plays that carry one — the scoring
       * description. It is the sentence, so it is shown rather than summarized. */
      b.appendChild(t);
      if (m.detail && m.detail !== m.headline) b.appendChild(el('p', 'l5-moment-d', m.detail));
      const meta = el('p', 'l5-moment-m num');
      const when = m.quarter ? `Q${m.quarter} ${m.clock || ''}`.trim() : '';
      const swing = `${m.wpDelta >= 0 ? usAb : themAb} ${signed(Math.round(Math.abs(m.wpDelta) * 100))}`;
      meta.textContent = when ? `${when} \u00b7 ${swing}` : swing;
      meta.classList.add(m.wpDelta >= 0 ? 'up' : 'down');
      b.appendChild(meta);
      r.appendChild(b);
      wrap.appendChild(r);
    });
    p.appendChild(wrap);
  }
  return p;
}

/** The pre-kick reading as one shared 100%. `1 - pct` is not written here
 *  either: the opponent's share is `flex: 1` and the browser does the sum. */
function preKickBar(c, usAb, themAb) {
  const box = el('div', 'l5-prekick');
  const bar = el('div', 'l5-prekick-bar');
  const us = el('div', 'l5-prekick-us');
  us.style.width = (c.summary ? c.summary.pct * 100 : 50) + '%';
  const them = el('div', 'l5-prekick-them');
  bar.append(us, them);
  box.appendChild(bar);

  const labels = el('div', 'l5-prekick-labels');
  const l = el('span', 'l5-prekick-l num', usAb);
  const r = el('span', 'l5-prekick-r num', themAb);
  labels.append(l, r);
  box.appendChild(labels);
  return box;
}

function keyMark(kind, label) {
  const w = el('span', 'l5-key');
  const g = svg('svg', { viewBox: '0 0 20 20', width: 13, height: 13, 'aria-hidden': 'true', class: 'l5-key-mark' });
  g.appendChild(callMarkerShape(kind, 10, 10, 7));
  w.appendChild(g);
  w.appendChild(el('span', null, label));
  return w;
}

/** ONE component for landed and missed. The sign is the fill, nothing else. */
function callMarkerShape(fill, cx, cy, r) {
  const c = svg('circle', { cx, cy, r, class: 'l5-mark l5-mark--' + fill });
  return c;
}

function wpChart(v, usAb, themAb) {
  const c = v.chart;
  const box = el('div', 'l5-chart');
  const g = svg('svg', {
    viewBox: `0 0 ${VB_W} ${VB_H}`, width: '100%', class: 'l5-chart-svg',
    role: 'img',
    'aria-label': `Win probability for ${usAb} against ${themAb}. ` +
      (c.summary ? `Now ${pct1(c.summary.pct)}. ` : '') + `${c.markers.length} of your calls marked.`,
  });

  const defs = svg('defs');
  const clipTop = svg('clipPath', { id: 'l5-clip-top' });
  clipTop.appendChild(svg('rect', { x: 0, y: 0, width: VB_W, height: CY }));
  const clipBot = svg('clipPath', { id: 'l5-clip-bot' });
  clipBot.appendChild(svg('rect', { x: 0, y: CY, width: VB_W, height: VB_H - CY }));
  defs.append(clipTop, clipBot);
  g.appendChild(defs);

  const pts = c.points;
  if (pts.length >= 2) {
    /* ONE polygon, closed to THE ONE CENTER LINE, clipped twice. That is what
     * makes a diverging chart share a center rather than draw two of them. */
    const d = polygonPath(pts);
    g.appendChild(svg('path', { d, class: 'l5-fill l5-fill--us', 'clip-path': 'url(#l5-clip-top)' }));
    g.appendChild(svg('path', { d, class: 'l5-fill l5-fill--them', 'clip-path': 'url(#l5-clip-bot)' }));
  } else if (pts.length === 1) {
    const p0 = pts[0];
    const top = p0.pct >= CENTER;
    g.appendChild(svg('rect', {
      x: PAD_X, width: VB_W - PAD_X * 2,
      y: top ? py(p0.pct) : CY, height: Math.abs(py(p0.pct) - CY),
      class: 'l5-fill ' + (top ? 'l5-fill--us' : 'l5-fill--them'),
    }));
  }

  /* quarter rules — from chart.periodBoundaries, not from a clock guess */
  for (const b of c.periodBoundaries) {
    if (b.index === 0) continue;
    const t = pts[b.index] ? pts[b.index].t : 0;
    g.appendChild(svg('line', { x1: px(t), x2: px(t), y1: PAD_Y, y2: VB_H - PAD_Y, class: 'l5-rule' }));
    /* The Q1 rule lands within a few pixels of the y-axis, where its label sits
     * underneath the bottom side label. The rule stays; the label goes, because
     * "the left edge is the start of the game" needs no caption. */
    if (px(t) < 80) continue;
    const lbl = svg('text', { x: px(t) + 5, y: VB_H - PAD_Y - 4, class: 'l5-qlabel' });
    lbl.textContent = 'Q' + b.period;
    g.appendChild(lbl);
  }

  /* 🔴 THE ONE CENTER LINE. Every offset in `chart` is already against it. */
  g.appendChild(svg('line', { x1: PAD_X, x2: VB_W - PAD_X, y1: CY, y2: CY, class: 'l5-center' }));

  if (pts.length >= 2) g.appendChild(svg('path', { d: linePath(pts), class: 'l5-line' }));

  /* key-moment ticks, keyed to the numbered list below */
  v.topMoments.forEach((m, i) => {
    const pt = pts.find((p) => p.playId === m.playId);
    if (!pt) return;
    const x = px(pt.t);
    g.appendChild(svg('line', { x1: x, x2: x, y1: PAD_Y, y2: VB_H - PAD_Y, class: 'l5-moment-rule' }));
    g.appendChild(svg('circle', { cx: x, cy: PAD_Y + 9, r: 9, class: 'l5-moment-dotbg' }));
    const t = svg('text', { x, y: PAD_Y + 12.5, class: 'l5-moment-dot' });
    t.textContent = String(i + 1);
    g.appendChild(t);
  });

  /* 🔴 7.8 — YOUR CALLS, ON THE CURVE. `marker.t` and `marker.pct` are read
   * straight off the oriented point. No lookup, no flip, no arithmetic. */
  for (const m of c.markers) {
    const cx = px(m.t), cy = py(m.pct);
    g.appendChild(svg('circle', { cx, cy, r: 11, class: 'l5-mark-halo' }));
    const shape = callMarkerShape(m.fill, cx, cy, 8);
    const title = svg('title');
    title.textContent = `You called ${m.side}` +
      (m.landed === null ? ' \u2014 still open' : m.landed ? ' \u2014 landed' : ' \u2014 missed') +
      ` (Q${m.period || '?'} ${m.clock || ''})`;
    shape.appendChild(title);
    g.appendChild(shape);
  }

  box.appendChild(g);

  /* 🔴 THE SIDE LABELS ARE VERTICAL, because the axis is.
   *
   * They were a left / center / right row under the chart for one draft and it
   * read as a horizontal axis: `BOIS ... EVEN ... ORE` says "time runs from
   * Boise to Oregon", which is nonsense, while the thing it was labelling is
   * ABOVE and BELOW the center line. One convention now holds the whole screen:
   * THE TEAM YOU FOLLOW IS ABOVE THE CENTER, AND ON THE RIGHT OF EVERY BAR. */
  const up = el('span', 'l5-side l5-side--us num', usAb);
  const down = el('span', 'l5-side l5-side--them num', themAb);
  const even = el('span', 'l5-side l5-side--even num', 'even');
  box.append(up, even, down);
  return box;
}

function linePath(pts) {
  let d = '';
  for (let i = 0; i < pts.length; i++) {
    d += (i ? 'L' : 'M') + px(pts[i].t).toFixed(2) + ' ' + py(pts[i].pct).toFixed(2) + ' ';
  }
  return d.trim();
}
function polygonPath(pts) {
  return `M${px(pts[0].t).toFixed(2)} ${CY.toFixed(2)} ` + linePath(pts).slice(1) +
    ` L${px(pts[pts.length - 1].t).toFixed(2)} ${CY.toFixed(2)} Z`;
}

/* ---- pre-game ---------------------------------------------------------- */

/**
 * 🟢 Five days out is when anticipation is highest and the incumbent fills it
 * with a 0–1 head-to-head and a poll nobody voted in (IMG_5218). Everything on
 * this panel is a number: ESPN's own pre-kick win probability, drawn on the
 * same center line the live chart uses, and DraftKings' line and total.
 */
function kickoffLabel(ms) {
  return new Date(ms).toLocaleString(undefined,
    { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function pregamePanel(v) {
  const p = panel('Before a snap');
  const usAb = v.followId === v.homeId ? v.homeAbbrev : v.awayAbbrev;
  const c = v.chart;

  const rows = [];
  if (c.summary) rows.push([`${usAb} to win`, pct1(c.summary.pct), 'model']);
  if (v.spread && v.spread.details) rows.push(['Line', v.spread.details, 'DraftKings']);
  if (v.spread && v.spread.overUnder) rows.push(['Total', String(v.spread.overUnder), 'DraftKings']);
  if (v.kickoff && v.kickoff.when) rows.push(['Kickoff', kickoffLabel(v.kickoff.when), 'local time']);
  if (v.kickoff && v.kickoff.venue) rows.push(['Venue', v.kickoff.venue, v.kickoff.city || '']);

  const list = el('div', 'l5-pre');
  for (const [k, val, src] of rows) {
    const r = el('div', 'l5-pre-row');
    r.appendChild(el('span', 'l5-pre-k', k));
    r.appendChild(el('span', 'l5-pre-v num', val));
    r.appendChild(el('span', 'l5-pre-s', src));
    list.appendChild(r);
  }
  p.appendChild(list);
  p.appendChild(el('p', 'l5-note',
    'The drive chart, the momentum tracks and your call markers all fill in from the first snap. Nothing here is a poll.'));
  return p;
}

/* ---- momentum (7.6) ---------------------------------------------------- */

function momentumPanel(v) {
  const m = v.momentum;
  const usAb = v.followId === v.homeId ? v.homeAbbrev : v.awayAbbrev;
  const themAb = v.followId === v.homeId ? v.awayAbbrev : v.homeAbbrev;
  const p = panel(null);
  p.classList.add('l5-mom');
  /* The same two colors as the curve, scoped the same way, so the tracks and the
   * line above them are the same two teams to the eye as well as to the data. */
  p.style.setProperty('--wp-us', teamColor(v.followId === v.homeId ? v.home : v.away));
  p.style.setProperty('--wp-them', teamColor(v.followId === v.homeId ? v.away : v.home));

  const head = el('div', 'l5-mom-head');
  head.appendChild(el('span', 'l5-mom-side', themAb));
  /* THE SENTENCE AND THE BAR READ THE SAME NUMBER — `m.overall`. */
  const mid = el('span', 'l5-mom-title');
  mid.appendChild(document.createTextNode(m.magnitude === 'Even' ? 'Even' : m.magnitude + ' to '));
  if (m.magnitude !== 'Even') mid.appendChild(el('b', null, m.towardUs ? usAb : themAb));
  head.appendChild(mid);
  head.appendChild(el('span', 'l5-mom-side', usAb));
  p.appendChild(head);

  const tracks = el('div', 'l5-tracks');
  tracks.appendChild(momTrack('Overall', m.overall, true));
  for (const part of m.parts) tracks.appendChild(momTrack(part.name, part.value, false));
  p.appendChild(tracks);

  p.appendChild(el('p', 'l5-note',
    'Last four drives, explosive plays in the last twenty snaps, and which way win probability turned \u2014 what just happened, not what happens next.'));
  return p;
}

/** One track, one shared center. `v` is already in the oriented frame. */
function momTrack(label, value, strong) {
  const r = el('div', 'l5-track' + (strong ? ' is-strong' : ''));
  r.appendChild(el('span', 'l5-track-l', label));
  const bar = el('div', 'l5-track-bar');
  const fill = el('div', 'l5-track-fill');
  const half = Math.abs(value) * 50;
  if (value >= 0) { fill.style.left = '50%'; fill.style.width = half + '%'; fill.classList.add('is-us'); }
  else { fill.style.right = '50%'; fill.style.width = half + '%'; fill.classList.add('is-them'); }
  bar.appendChild(fill);
  r.appendChild(bar);
  return r;
}

/* ---- who (7.2) --------------------------------------------------------- */

/**
 * The settled call and the player who settled it are ONE card, and the
 * standalone panel suppresses itself while a verdict is up. That is the brief's
 * item 2, shipped in `whoBody()` on 2026-09-06 and ported here whole.
 */
function whoPanel(v) {
  const w = v.who;
  const settled = w.call && w.call.state === 'settled';
  const p = panel(null);
  p.classList.add('l5-who');
  if (settled) p.classList.add('is-verdict', w.call.landed ? 'is-won' : 'is-lost');

  const team = w.star.teamId === v.homeId ? v.home : v.away;
  applyTeamVars(p, team);

  const badge = el('div', 'l5-who-badge num', w.star.jersey ? String(w.star.jersey) : '\u2014');
  /* The jersey number sits ON the team's primary, so its ink is chosen from that
   * color's luminance rather than assumed. Reversed white on ASU's ffc627 is the
   * failure this answers, and ffc627 is a real primary in the file. */
  const prim = normalizeColor(team && team.primary);
  badge.style.color = prim && luminance(prim) > 0.45 ? 'var(--fg)' : 'var(--card)';
  p.appendChild(badge);

  const body = el('div', 'l5-who-body');
  const head = el('p', 'l5-who-name');
  head.appendChild(el('b', null, w.star.name));
  head.appendChild(document.createTextNode(
    ` \u00b7 ${w.play.yards} yd ${w.play.type === 'pass' ? 'pass' : w.play.type}`));
  body.appendChild(head);

  if (settled) {
    /* SAME COMPONENT, DIFFERENT SIGN. Win and miss are not two designs. */
    const verdict = el('p', 'l5-who-verdict num ' + signClass(w.call.delta));
    verdict.textContent =
      `You called ${w.call.side} \u00b7 ${w.call.landed ? 'landed' : 'missed'} \u00b7 ${signed(w.call.delta)} Marbles`;
    body.appendChild(verdict);
  } else if (w.call) {
    const open = el('p', 'l5-who-verdict num');
    open.textContent = `Your ${w.call.side} call is still open \u00b7 ${w.call.stake} Marbles staked`;
    body.appendChild(open);
  } else {
    const role = el('p', 'l5-who-role', roleLine(w.star.role));
    body.appendChild(role);
  }
  p.appendChild(body);
  return p;
}

function roleLine(role) {
  return role === 'passer' ? 'threw it'
    : role === 'receiver' ? 'caught it'
    : role === 'kicker' ? 'kicked it'
    : role === 'carrier' ? 'carried it'
    : String(role);
}

/* ---- head to head — the Sofascore paired bars -------------------------- */

function h2hPanel(v) {
  const p = panel('Head to head');
  /* Ohio State and Ball State are BOTH ba0c2f in the real file, so a two-color
   * comparison between them is one color twice. The bars stay in team color —
   * that is the data — and the losing-side track is knocked back and outlined
   * so the pair separates at arm's length, which is the same treatment the
   * chip uses for an adjacent clash. */
  const aT = v.h2h.length && v.h2h[0].a.teamId === v.homeId ? v.home : v.away;
  const bT = v.h2h.length && v.h2h[0].b.teamId === v.homeId ? v.home : v.away;
  if (tooClose(normalizeColor(aT && aT.primary), normalizeColor(bT && bT.primary))) {
    p.dataset.clash = 'true';
  }
  const teams = el('div', 'l5-h2h-head');
  const aTeam = v.h2h[0].a.teamId === v.homeId ? v.home : v.away;
  const bTeam = v.h2h[0].b.teamId === v.homeId ? v.home : v.away;
  const aAb = v.h2h[0].a.teamId === v.homeId ? v.homeAbbrev : v.awayAbbrev;
  const bAb = v.h2h[0].b.teamId === v.homeId ? v.homeAbbrev : v.awayAbbrev;
  teams.appendChild(el('span', 'l5-h2h-team num', aAb));
  teams.appendChild(el('span', 'l5-h2h-src', v.h2hSource === 'boxscore' ? 'final' : 'so far'));
  teams.appendChild(el('span', 'l5-h2h-team num', bAb));
  p.appendChild(teams);

  for (const row of v.h2h) {
    const r = el('div', 'l5-h2h-row');
    r.style.setProperty('--h2h-a', teamColor(aTeam));
    r.style.setProperty('--h2h-b', teamColor(bTeam));

    const top = el('div', 'l5-h2h-top');
    top.appendChild(el('span', 'l5-h2h-va num', row.a.text));
    top.appendChild(el('span', 'l5-h2h-lab', row.label));
    top.appendChild(el('span', 'l5-h2h-vb num', row.b.text));
    r.appendChild(top);

    const max = Math.max(row.a.value, row.b.value, 1);
    const bars = el('div', 'l5-h2h-bars');
    const ta = el('div', 'l5-h2h-track l5-h2h-track--a');
    const fa = el('div', 'l5-h2h-fill l5-h2h-fill--a');
    fa.style.width = (row.a.value / max) * 100 + '%';
    ta.appendChild(fa);
    const tb = el('div', 'l5-h2h-track l5-h2h-track--b');
    const fb = el('div', 'l5-h2h-fill l5-h2h-fill--b');
    fb.style.width = (row.b.value / max) * 100 + '%';
    tb.appendChild(fb);
    bars.append(ta, tb);
    r.appendChild(bars);
    p.appendChild(r);
  }
  return p;
}

/* ---- form + efficiency ------------------------------------------------- */

function formPanel(v) {
  const usAb = v.followId === v.homeId ? v.homeAbbrev : v.awayAbbrev;
  const p = panel(`${usAb} form`);

  const e = v.efficiency;
  p.appendChild(sparkRow('Yards per play', v.form.us));
  p.appendChild(statRow('Third down', e.third ? `${e.thirdOk}-${e.third}` : '\u2014'));
  p.appendChild(statRow('Explosive plays', String(e.boom), '25+ yards'));
  p.appendChild(statRow('Snaps', String(e.snaps)));
  /* NO COMPLETIONS ROW. A play-derived count came out 14/32 against ESPN's own
   * 15/29, because a sack and an interception are attempts in one counting and
   * not the other. A number that is nearly right is worse here than no number:
   * this panel's whole claim is that every figure on it was counted off real
   * plays. `boxscore.completionAttempts` is exact and is on the final head to
   * head, where it is truthful. */
  return p;
}

function sparkRow(label, series) {
  const r = el('div', 'l5-form-row');
  r.appendChild(el('span', 'l5-form-l', label));
  const trend = series.length >= 2 ? series[series.length - 1] - series[0] : 0;
  const g = svg('svg', { viewBox: '0 0 120 28', width: 120, height: 28, class: 'l5-spark', 'aria-hidden': 'true' });
  if (series.length >= 2) {
    const lo = Math.min(...series), hi = Math.max(...series), span = hi - lo || 1;
    let d = '';
    series.forEach((val, i) => {
      const x = 2 + (i / (series.length - 1)) * 116;
      const y = 24 - ((val - lo) / span) * 20;
      d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
    });
    g.appendChild(svg('path', { d: d.trim(), class: 'l5-spark-line ' + (trend >= 0 ? 'is-up' : 'is-down') }));
  }
  r.appendChild(g);
  const pill = el('span', 'l5-pill num ' + (trend >= 0 ? 'is-up' : 'is-down'),
    series.length ? String(series[series.length - 1]) : '\u2014');
  r.appendChild(pill);
  return r;
}

function statRow(label, value, hint) {
  const r = el('div', 'l5-stat-row');
  const l = el('span', 'l5-stat-l', label);
  if (hint) { const h = el('span', 'l5-stat-hint', ' ' + hint); l.appendChild(h); }
  r.appendChild(l);
  r.appendChild(el('span', 'l5-stat-v num', value));
  return r;
}

/* ---- leaders ----------------------------------------------------------- */

function leadersPanel(v) {
  const p = panel('Leaders');
  for (const l of v.leaders) {
    const r = el('div', 'l5-leader');
    r.appendChild(el('span', 'l5-leader-cat', l.cat));
    const b = el('div', 'l5-leader-b');
    const nm = el('p', 'l5-leader-name');
    if (l.jersey) nm.appendChild(el('span', 'l5-leader-j num', '#' + l.jersey));
    nm.appendChild(el('b', null, ' ' + l.name));
    const team = l.teamId === v.homeId ? v.home : v.away;
    applyTeamVars(r, team);
    b.appendChild(nm);
    b.appendChild(el('p', 'l5-leader-line num', l.line));
    r.appendChild(b);
    p.appendChild(r);
  }
  return p;
}

/* ---- the drive chart --------------------------------------------------- */

function drivesPanel(v) {
  const p = panel('Drives');
  const axis = el('div', 'l5-axis');
  axis.appendChild(el('span', null, 'own goal'));
  axis.appendChild(el('span', null, 'midfield'));
  axis.appendChild(el('span', null, 'end zone'));
  p.appendChild(axis);

  for (const d of v.drives.slice(-8)) {
    const r = el('div', 'l5-drive' + (d.inProgress ? ' is-live' : ''));
    applyTeamVars(r, d.team);
    r.appendChild(el('span', 'l5-drive-t num', d.abbrev));

    const track = el('div', 'l5-drive-track');
    const from = Math.max(0, Math.min(100, d.start));
    const to = Math.max(0, Math.min(100, d.end));
    const lo = Math.min(from, to), hi = Math.max(from, to);
    const bar = el('div', 'l5-drive-bar l5-drive-bar--' + d.kind);
    bar.style.left = lo + '%';
    bar.style.width = Math.max(1.5, hi - lo) + '%';
    track.appendChild(bar);
    const ball = el('span', 'l5-drive-ball l5-drive-ball--' + d.kind);
    ball.style.left = to + '%';
    track.appendChild(ball);
    r.appendChild(track);

    r.appendChild(el('span', 'l5-drive-r num is-' + d.kind, d.short || d.result));
    p.appendChild(r);
  }

  const note = el('p', 'l5-note num');
  const shown = Math.min(8, v.drives.length);
  note.textContent = `${shown} of ${v.drives.length} drives \u00b7 a touchdown reaches the end zone`;
  p.appendChild(note);
  return p;
}
