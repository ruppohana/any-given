/* tests/p5-standings.test.mjs — P5, the pool standings screen.
 *
 * 🔴 WHAT IS REAL HERE AND WHAT IS NOT.
 *
 *   REAL: fixtures/teams.json (760 captured team identities) and
 *         fixtures/real-utep-at-ou-260905-final.json (Oklahoma 51, UTEP 0, final).
 *         The tiebreak numbers below are read out of that fixture, not chosen.
 *   REAL: src/lib/pool.ts — the actual ranking implementation. Node 24 strips types,
 *         so this test imports the shipping module rather than a copy of it.
 *   SYNTHETIC: every member name and every point total. No pool has ever been played,
 *         so there is no fixture of one. NO FIXTURE WAS WRITTEN — the synthetic rows
 *         live in the screen's previewData, which is view data for a preview route.
 *
 * WHAT THIS FILE IS ACTUALLY FOR. The screen must not rank; `rank` and `movement`
 * arrive already computed. But a browser ES module cannot import a .ts file, so the
 * preview's ranks are written out as literals. This test EXTRACTS THOSE LITERALS FROM
 * THE SCREEN FILE ITSELF, feeds the same roster to the real `standings()`, and asserts
 * they match. If anyone edits a number in the screen, this fails.
 *
 * The second half is static analysis of the screen and its stylesheet against the
 * CONTRACT §5 checks — the ones that fail a piece silently and that no rendering test
 * would catch either.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { standings, DEFAULT_SCORING, resolveGame, tiebreakActual } from '../src/lib/pool.ts';
import { teamVars, normalizeColor, tooClose } from '../public/components/team-chip.js';
import { dash, signed, signClass } from '../public/components/fmt.js';

const SCREEN_SRC = readFileSync(new URL('../public/screens/p5-standings.screen.js', import.meta.url), 'utf8');
const CSS_SRC = readFileSync(new URL('../public/screens/p5-standings.css', import.meta.url), 'utf8');
/** The §5 word and property checks are about what SHIPS, not about the comments
 *  that explain it. This file's own header names Marbles and box-shadow in order to
 *  say they are absent, and a scanner that cannot tell those apart is a scanner that
 *  makes every author delete their reasoning. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[^\S\n]*\/\/.*$/gm, '');
}

const TEAMS = JSON.parse(readFileSync(new URL('../fixtures/teams.json', import.meta.url), 'utf8')).teams;
const GAME = JSON.parse(readFileSync(new URL('../fixtures/real-utep-at-ou-260905-final.json', import.meta.url), 'utf8'));

/** Pull a top-level array literal out of the screen source and evaluate it.
 *  The screen is the source of truth; this test never keeps a second copy. */
function literal(name) {
  const m = new RegExp('const\\s+' + name + '\\s*=\\s*\\[').exec(SCREEN_SRC);
  assert.ok(m, `screen no longer declares ${name}`);
  const start = m.index;
  const from = SCREEN_SRC.indexOf('[', start);
  let depth = 0, end = -1;
  for (let i = from; i < SCREEN_SRC.length; i++) {
    const ch = SCREEN_SRC[i];
    if (ch === '[') depth++;
    else if (ch === ']') { depth--; if (depth === 0) { end = i; break; } }
  }
  assert.ok(end > from, `could not find the end of ${name}`);
  return new Function('return ' + SCREEN_SRC.slice(from, end + 1))();
}

const OFFICE_WEEK = literal('OFFICE_WEEK');
const OFFICE_SEASON = literal('OFFICE_SEASON');
const TIES_NAMES = literal('TIES_NAMES');
const TIES_POINTS = literal('TIES_POINTS');
const TIES_RANKS = literal('TIES_RANKS');

const toInput = (r, priorRank) => ({
  userId: r.userId,
  displayName: r.displayName,
  weekPoints: r.weekPoints,
  seasonPoints: r.seasonPoints,
  parlayPoints: r.parlayPoints,
  priorRank: priorRank ?? null,
});

/* ------------------------------------------------------------------ *
 * 1. The screen's ranks are pool.ts's ranks
 * ------------------------------------------------------------------ */

test('the week table is exactly what standings() produces — order and ranks', () => {
  // Deliberately shuffled in, so the order below comes from pool.ts and not from me.
  const shuffled = [...OFFICE_WEEK].reverse().map((r) => toInput(r));
  const out = standings({ rows: shuffled, basis: 'week', selfUserId: 'u_sam' });

  assert.deepEqual(out.map((r) => r.userId), OFFICE_WEEK.map((r) => r.userId));
  assert.deepEqual(out.map((r) => r.rank), OFFICE_WEEK.map((r) => r.rank));
  console.log('    week ranks:', out.map((r) => r.rank).join(','),
              '| order:', out.map((r) => r.displayName).join(' > '));

  // Competition ranking: Dana K. and Reggie are level on 6, share rank 4, next is 6.
  assert.equal(out.filter((r) => r.rank === 4).length, 2);
  assert.ok(!out.some((r) => r.rank === 5), 'the rank after a two-way tie must skip');
  assert.equal(out.find((r) => r.userId === 'u_sam').isSelf, true);
});

test('the season table is exactly what standings() produces, movements included', () => {
  /* Last week's published season order. Test-owned: the screen stores only the
   * resulting movement, so this is what proves those +1/-1/+2 are real. */
  const PRIOR = { u_marcus: 1, u_dana: 2, u_reggie: 3, u_sam: 4, u_priya: 5, u_elena: 6, u_wendell: 7, u_bo: 8 };
  const rows = [...OFFICE_SEASON].reverse().map((r) => toInput(r, PRIOR[r.userId]));
  const out = standings({ rows, basis: 'season', selfUserId: 'u_sam' });

  assert.deepEqual(out.map((r) => r.userId), OFFICE_SEASON.map((r) => r.userId));
  assert.deepEqual(out.map((r) => r.rank), OFFICE_SEASON.map((r) => r.rank));
  assert.deepEqual(out.map((r) => r.movement), OFFICE_SEASON.map((r) => r.movement));
  console.log('    season movement:', out.map((r) => r.displayName + ' ' + signed(r.movement)).join(', '));

  // Both directions of the fixed scale are exercised, or the --up/--down check is empty.
  assert.ok(out.some((r) => r.movement > 0), 'no --up row in the season table');
  assert.ok(out.some((r) => r.movement < 0), 'no --down row in the season table');
  assert.equal(signClass(1), 'up');
  assert.equal(signClass(-1), 'down');
});

test('the twenty-member ties table: four level at the top, next rank is 5', () => {
  const rows = TIES_NAMES.map((n, i) => ({
    userId: 'u_' + n.toLowerCase(),
    displayName: n,
    weekPoints: TIES_POINTS[i],
    seasonPoints: 40 - i,
    parlayPoints: 0,
  }));
  const out = standings({ rows: [...rows].reverse(), basis: 'week', selfUserId: 'u_rae' });

  assert.deepEqual(out.map((r) => r.rank), TIES_RANKS);
  assert.equal(out.filter((r) => r.rank === 1).length, 4);
  assert.ok(!out.some((r) => [2, 3, 4].includes(r.rank)), 'ranks 2-4 must be skipped');
  assert.equal(out.find((r) => r.isSelf).rank, 18,
    'self must be OFF the first screen — that is what the pinned card is for');
  console.log('    tie groups:', TIES_RANKS.join(','));
});

test('the tiebreak is one real game, and it breaks the four-way tie', () => {
  const c = GAME.header.competitions[0];
  const home = c.competitors.find((x) => x.homeAway === 'home');
  const away = c.competitors.find((x) => x.homeAway === 'away');
  const game = {
    id: 'tiebreak', week: 6, kickoffUtc: 0,
    home: { id: home.team.id, abbrev: home.team.abbreviation, name: home.team.displayName, short: home.team.location, primary: null, secondary: null },
    away: { id: away.team.id, abbrev: away.team.abbreviation, name: away.team.displayName, short: away.team.location, primary: null, secondary: null },
    spread: null, status: 'final',
    homeScore: Number(home.score), awayScore: Number(away.score),
  };
  assert.equal(resolveGame(game, false), 'home');
  const actual = tiebreakActual(game);
  assert.equal(actual, 51, 'Oklahoma 51, UTEP 0 — read from the fixture');
  console.log('    tiebreak game:', away.team.location, 'at', home.team.location, '=', actual, 'combined');

  const four = ['Ana', 'Bo', 'Chris', 'Dana'].map((n, i) => ({
    userId: 'u_' + n.toLowerCase(), displayName: n,
    weekPoints: 8, seasonPoints: 40 - i, parlayPoints: 0,
    predictedTotal: [70, 52, 45, 49][i],   // misses 19, 1, 6, 2
  }));
  const out = standings({ rows: four, basis: 'week', tiebreak: { game } });
  assert.deepEqual(out.map((r) => r.displayName), ['Bo', 'Dana', 'Chris', 'Ana']);
  assert.deepEqual(out.map((r) => r.rank), [1, 2, 3, 4], 'a landed tiebreak leaves no shared rank');
});

test('the final state has NO shared rank — the landed tiebreak separates them', () => {
  const preds = Object.fromEntries(literal('FINAL_PREDICTIONS').map((p) => [p.userId, p.predictedTotal]));
  const expected = Object.fromEntries(literal('FINAL_WEEK_RANKS_PAIRS').map((p) => [p.userId, p.rank]));

  const c = GAME.header.competitions[0];
  const home = c.competitors.find((x) => x.homeAway === 'home');
  const away = c.competitors.find((x) => x.homeAway === 'away');
  const game = {
    id: 'tiebreak', week: 6, kickoffUtc: 0,
    home: { id: home.team.id, abbrev: home.team.abbreviation, name: home.team.displayName, short: home.team.location, primary: null, secondary: null },
    away: { id: away.team.id, abbrev: away.team.abbreviation, name: away.team.displayName, short: away.team.location, primary: null, secondary: null },
    spread: null, status: 'final', homeScore: Number(home.score), awayScore: Number(away.score),
  };

  const rows = OFFICE_WEEK.map((r) => Object.assign(toInput(r), { predictedTotal: preds[r.userId] ?? null }));
  const out = standings({ rows, basis: 'week', tiebreak: { game }, selfUserId: 'u_sam' });
  for (const [userId, rank] of Object.entries(expected)) {
    assert.equal(out.find((r) => r.userId === userId).rank, rank, `${userId} should rank ${rank}`);
  }
  const ranks = out.map((r) => r.rank);
  assert.equal(new Set(ranks).size, ranks.length, 'a landed tiebreak must leave no shared rank');
  console.log('    final ranks:', ranks.join(','), '(week table, tiebreak landed at 51)');
});

test('the parlay ladder printed in the footer is the real one', () => {
  assert.deepEqual({ ...DEFAULT_SCORING.parlayWorth }, { 3: 3, 4: 6, 5: 12, 6: 20 });
  assert.ok(SCREEN_SRC.includes('3 legs 3 points · 4 legs 6 · 5 legs 12 · 6 legs 20'),
    'the footer line must match DEFAULT_SCORING');
});

test('the parlay callouts are true of the data, not decoration', () => {
  /* "Called out where it moved somebody" = the count of people this row would sit
   * behind without its parlay. Recomputed here from the screen's own numbers. */
  const passed = (row, rows, key) => {
    if (row.parlayPoints <= 0) return 0;
    const without = row[key] - row.parlayPoints;
    return rows.filter((o) => o.userId !== row.userId && o[key] > without && o[key] <= row[key]).length;
  };
  const bo = OFFICE_WEEK.find((r) => r.userId === 'u_bo');
  const sam = OFFICE_WEEK.find((r) => r.userId === 'u_sam');
  assert.equal(passed(bo, OFFICE_WEEK, 'weekPoints'), 6);
  assert.equal(passed(sam, OFFICE_WEEK, 'weekPoints'), 3);
  // Every row with no parlay points gets no callout at all.
  for (const r of OFFICE_WEEK.filter((x) => x.parlayPoints === 0)) {
    assert.equal(passed(r, OFFICE_WEEK, 'weekPoints'), 0);
  }
  console.log('    week callouts: Bo past 6, Sam R. past 3, everyone else none');
});

/* ------------------------------------------------------------------ *
 * 2. The teams on the rows are the real file's, including the hard cases
 * ------------------------------------------------------------------ */

test('every team abbreviation on a row exists in the real 760', () => {
  const byAbbrev = {};
  for (const t of Object.values(TEAMS)) byAbbrev[t.abbrev] = t;
  const used = new Set([...OFFICE_WEEK, ...OFFICE_SEASON].map((r) => r.team));
  for (const ab of used) assert.ok(byAbbrev[ab], `${ab} is not in fixtures/teams.json`);

  const states = [...used].map((ab) => teamVars(byAbbrev[ab]).state);
  assert.ok(states.includes('two'), 'no two-color team on the board');
  assert.ok(states.includes('one'), 'no one-color team on the board');
  assert.ok(states.includes('none'), 'no null-primary team on the board — 401 of 760 are');
  console.log('    chip states on the board:', [...used].map((ab, i) => ab + ':' + states[i]).join(' '));
});

test('the board renders navy, yellow AND null — and navy lands next to navy', () => {
  const byAbbrev = {};
  for (const t of Object.values(TEAMS)) byAbbrev[t.abbrev] = t;
  const order = OFFICE_WEEK.map((r) => byAbbrev[r.team]);

  const navy = order.filter((t) => { const p = normalizeColor(t.primary); return p && tooClose(p, '#0c2340', 90); });
  const yellow = order.filter((t) => { const p = normalizeColor(t.primary); return p && tooClose(p, '#ffc627', 90); });
  const nulls = order.filter((t) => normalizeColor(t.primary) === null);
  assert.ok(navy.length >= 2, 'need at least two navy primaries to test navy-on-navy');
  assert.ok(yellow.length >= 1, 'yellow is the primary that breaks first on white');
  assert.ok(nulls.length >= 1, 'a null primary is a defined state, not an edge case');

  // At least one VERTICALLY ADJACENT pair must actually clash, in each table.
  const clashes = (rows) => {
    let n = 0;
    for (let i = 1; i < rows.length; i++) {
      const a = normalizeColor(byAbbrev[rows[i].team].primary);
      const b = normalizeColor(byAbbrev[rows[i - 1].team].primary);
      if (tooClose(a, b)) n++;
    }
    return n;
  };
  assert.ok(clashes(OFFICE_WEEK) >= 1, 'the week table never puts two near-identical primaries together');
  assert.ok(clashes(OFFICE_SEASON) >= 1, 'the season table never puts two near-identical primaries together');
  console.log('    adjacent clashes — week:', clashes(OFFICE_WEEK), 'season:', clashes(OFFICE_SEASON));
});

test('a dash is not a zero — the pre-week table', () => {
  assert.equal(dash(null), '—');
  assert.equal(dash(0), '0');
  assert.ok(SCREEN_SRC.includes("phase = 'pre'") || SCREEN_SRC.includes("'pre'"),
    'the pre-week state must exist');
  assert.ok(SCREEN_SRC.includes('a dash is not a zero'), 'the pre-week note must say so');
});

/* ------------------------------------------------------------------ *
 * 3. CONTRACT §5 — the checks that fail a piece silently
 * ------------------------------------------------------------------ */

test('the pool board never says Marbles, and never says any of the purchase words', () => {
  const banned = ['marble', 'credit', 'coin', 'top-up', 'purchase', ' buy ', 'refill'];
  const js = stripComments(SCREEN_SRC).toLowerCase();
  const css = stripComments(CSS_SRC).toLowerCase();
  for (const w of banned) {
    assert.ok(!js.includes(w), `screen ships the word "${w.trim()}"`);
    assert.ok(!css.includes(w), `stylesheet ships the word "${w.trim()}"`);
  }
  // And the comment that names the OTHER board is still there, deliberately.
  assert.ok(SCREEN_SRC.includes('LiveStandingsRow is the other'));
});

test('no shadows, no hard-coded accent, no :root, no team color at :root', () => {
  const css = stripComments(CSS_SRC);
  /* Depth is ONE shared token since 2026-09-09, when Jason picked Deuce's
   * surface - a white card lifting off a grey ground. The ban became a rule
   * about ownership rather than about existence: exactly one shadow, defined
   * centrally, and no screen invents its own. See p2-slate's version. */
  for (const d of (css.match(/box-shadow:\s*[^;]+/g) || [])) {
    assert.match(d, /var\(--lift\)|none/,
      `a hand-rolled shadow: "${d.trim()}" - depth is var(--lift) or nothing`);
  }
  assert.ok(!/var\(--maroon\)|var\(--gold\)/.test(css), 'read --accent, never --maroon or --gold');
  assert.ok(!/:root/.test(css), 'a pool component must never write at :root');
  assert.ok(!/--team-a\s*:|--team-b\s*:/.test(css), 'team vars are set per element by team-chip.js');
  assert.ok(/var\(--accent\)/.test(CSS_SRC), 'the highlight reads --accent so it survives the dark swap');
  assert.ok(/var\(--up\)/.test(CSS_SRC) && /var\(--down\)/.test(CSS_SRC), 'movement uses the fixed scale');
});

test('every stylesheet rule is scoped to this screen', () => {
  const selectors = CSS_SRC
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('}')
    .map((b) => b.split('{')[0].trim())
    .filter((s) => s && !s.startsWith('@'));
  for (const sel of selectors) {
    for (const part of sel.split(',')) {
      const p = part.trim();
      if (!p) continue;
      assert.ok(p.startsWith('.scr-p5-standings'), `unscoped selector: "${p}"`);
    }
  }
  console.log('    scoped selectors:', selectors.length);
});

test('every number is tabular and the row is the measured 42px', () => {
  assert.ok(/font-variant-numeric:\s*tabular-nums/.test(CSS_SRC), 'figures must not reflow as they settle');
  assert.ok(/min-height:\s*42px/.test(CSS_SRC), 'the Sofascore row, measured at 3x off a 402pt capture');
  // The toggle is a CONTROL and gets the full tap target; the row is a LINK and does not.
  assert.ok(/\.p5-tab[\s\S]{0,200}min-height:\s*var\(--tap-min\)/.test(CSS_SRC),
    'the basis toggle is a control and must be 44px');
  assert.ok(!/var\(--t-bank\)|font-size:\s*30px/.test(CSS_SRC),
    'the pool has no 30px figure — that is the live layer bank');
});

test('the screen fetches nothing, declares no types, and uses the SHARED chip', () => {
  /* The `bar` export is a path to a captured reference image and is the one .PNG
   * this file is allowed to name — strip it before scanning for marks. */
  const js = stripComments(SCREEN_SRC).replace(/export const bar = .*/, '');
  /* SCOPED TO render(), 2026-09-09 - the same narrowing p2 and p4 already carry,
   * for the same reason. The contract rule is that the SCREEN is pure: render()
   * takes data as an argument and never reaches the network, so a layout can be
   * driven from a fixture with no server. previewData is the data PROVIDER, not
   * part of the rendered screen, and it is where the world board and this
   * device's pools are read.
   *
   * Asserting over the whole file conflated the two, and would have forced the
   * honest route - a real board off D1 - to be replaced by invented rows to
   * satisfy a purity rule about a different function. */
  const renderBody = js.slice(js.indexOf('export function render'));
  assert.ok(!/fetch\s*\(|XMLHttpRequest|WebSocket/.test(renderBody),
    'render() reached the network - data arrives as an argument');
  /* 🔴 THIS ASSERTION IS INVERTED ON PURPOSE, 2026-09-08. It used to demand the
   * shared TEAM CHIP in the mark slot, and it was enforcing the wrong thing.
   * Jason, on this exact row: "for the icons for each person, make up something
   * for a person who won a week, they get a logo, 2 weeks gets one, etc not 2
   * color, crap."
   *
   * A two-color chip beside a PERSON identifies a TEAM — the same two colors for
   * everybody who picked it, on every row, distinguishing nobody. The badge is
   * still a SHARED component, which was the real rule; it is simply the right
   * shared component. */
  assert.ok(!/team-chip\.js/.test(SCREEN_SRC), 'a person is not identified by a team');
  assert.ok(SCREEN_SRC.includes("from '/components/badge.js'"), 'the badge is the shared component');
  assert.ok(!/createElementNS/.test(js), 'a second chip was written here');
  assert.ok(!/espncdn|<img|logo|\.svg|\.png|\.jpg/i.test(js), 'no marks, no logo, no CDN image, ever');
  assert.ok(!/type\s+StandingsRow|interface\s+StandingsRow/.test(js), 'types are imported, never re-declared');
  assert.ok(SCREEN_SRC.includes('LiveStandingsRow is the other'), 'the file must name the board it is NOT');
});

test('the screen declares every state the dispatch named, and each is a route', () => {
  const m = SCREEN_SRC.match(/export const states = \[([\s\S]*?)\];/);
  assert.ok(m, 'no states export');
  const states = m[1].split(',').map((s) => s.trim().replace(/['"\s]/g, '')).filter(Boolean);
  for (const need of ['ready', 'settling', 'final', 'ties', 'midseason', 'empty', 'loading', 'offline', 'error']) {
    assert.ok(states.includes(need), `missing state: ${need}`);
  }
  console.log('    states:', states.join(' '));
});

/* ------------------------------------------------------------------ *
 * 4. The group state - #/gstandings, the Standings tab of Group pools
 *
 * The close for this state is the browser run against the local Worker. What
 * is pinned here is what the screen PROMISES: which board it asks for, that the
 * current group comes from group.js, the doors, the words, and the shaping of
 * the API's rows. The rows fed to the shaper below are in the API's own shape
 * ({id, name, picks, wins, played}) and are test inputs, not a fixture.
 * ------------------------------------------------------------------ */

/** Pull one top-level function out of the screen source by brace matching. */
function fnSource(name) {
  const m = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(SCREEN_SRC);
  assert.ok(m, `screen no longer declares ${name}`);
  const open = SCREEN_SRC.indexOf('{', SCREEN_SRC.indexOf(')', m.index));
  let depth = 0, end = -1;
  for (let i = open; i < SCREEN_SRC.length; i++) {
    const ch = SCREEN_SRC[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  assert.ok(end > open, `could not find the end of ${name}`);
  return SCREEN_SRC.slice(m.index, end + 1);
}

const G = new Function(fnSource('safeName') + '\n' + fnSource('shapeGroupRows') + '\n'
  + fnSource('recordText') + '\nreturn { safeName, shapeGroupRows, recordText };')();

test('group state: it is a declared state and it asks for THIS group\'s board', () => {
  const m = SCREEN_SRC.match(/export const states = \[([\s\S]*?)\];/);
  assert.ok(/'group'/.test(m[1]), 'the group state is not declared');
  const load = fnSource('loadGroupBoard');
  assert.ok(load.includes("'/api/pool/standings?sport=' + sport + '&pool=' + encodeURIComponent(g.id)"),
    'the group board must query pool=<group id>');
  assert.ok(load.includes("q + '&week=' + week"), 'the week board');
  assert.ok(load.includes("q + '&week=0'"), 'the season board - week=0 is the API\'s whole season');
  assert.ok(load.includes("'/api/group/detail?id='"), 'the commissioner comes from detail');
  assert.ok(/state === 'group'\) return loadGroupBoard\(\)/.test(SCREEN_SRC), 'previewData routes the group state');
});

test('group state: the current group comes from group.js, never from ag.scope or ag.group', () => {
  assert.ok(/import \{[^}]*myGroups[^}]*pickCurrent[^}]*groupSwitcher[^}]*\} from '\/components\/group\.js'/.test(SCREEN_SRC),
    'myGroups, pickCurrent and groupSwitcher come from the shared component');
  const js = stripComments(SCREEN_SRC);
  assert.ok(!js.includes('ag.group'), 'the group key is read and written only by group.js');
  const load = fnSource('loadGroupBoard');
  assert.ok(load.includes('pickCurrent(') && load.includes('myGroups('));
  assert.ok(!load.includes('ag.scope'), 'the group board must not read the main board\'s scope');
  const draw = fnSource('drawGroup');
  assert.ok(!draw.includes('scopePicker') && !draw.includes('inviteRow'),
    'the main board\'s world/group selector does not appear on #/gstandings');
  assert.ok(draw.includes('groupSwitcher('), 'the switcher is at the top of the group board');
});

test('group state: the doors - no group to #/g, empty to #/gpicks, signed out to the sheet', () => {
  const js = stripComments(SCREEN_SRC);
  assert.ok(js.includes("location.hash = '#/g';"), 'the no-group card must open #/g');
  assert.ok(js.includes("location.hash = '#/gpicks';"), 'the empty state must open #/gpicks');
  assert.ok(js.includes("'Make your picks'"), 'the empty door is labeled "Make your picks"');
  assert.ok(js.includes('window.agOpenSignIn()'), 'signed out opens the sign-in sheet');
  const draw = fnSource('drawGroup');
  for (const ph of ["'signed-out'", "'offline'", "'error'", "'no-group'"]) {
    assert.ok(draw.includes(ph), `drawGroup does not handle ${ph}`);
  }
  assert.ok(fnSource('reloadGroup').includes("stateBlock('loading'"), 'switching shows a loading state');
});

test('group state: no betting words anywhere in what ships', () => {
  const js = stripComments(SCREEN_SRC);
  const css = stripComments(CSS_SRC);
  const bad = /\b(marbles?|stakes?|staked|staking|odds|prices?|priced|bets?|betting|wager\w*)\b/i;
  assert.ok(!bad.test(js), `screen ships "${(js.match(bad) || [])[0]}"`);
  assert.ok(!bad.test(css), `stylesheet ships "${(css.match(bad) || [])[0]}"`);
  const draw = fnSource('drawGroup');
  assert.ok(!/Parlay|live board/i.test(draw), 'the group board prints no parlay ladder and never mentions the live board');
});

test('group state: no email address is ever drawn', () => {
  const js = stripComments(SCREEN_SRC);
  assert.ok(!/\.email\b/.test(js), 'the screen reads an email field');
  assert.ok(!/[a-z0-9._-]+@[a-z0-9-]+\.[a-z]{2,}/i.test(js), 'the screen carries an address literal');
  assert.equal(G.safeName('e1'), 'e1');
  assert.equal(G.safeName('someone@example.com'), 'Someone');
  assert.equal(G.safeName(''), 'Someone');
  assert.equal(G.safeName(null), 'Someone');
  const { weekRows } = G.shapeGroupRows(
    [{ id: 'a', name: 'x@y.org', picks: 1, wins: 0, played: 0 }],
    [{ id: 'a', name: 'x@y.org', picks: 1, wins: 0, played: 0 }], '', '');
  assert.equal(weekRows[0].displayName, 'Someone');
});

test('group state: nobody final yet - no rank, alphabetical, a dash not a zero', () => {
  const api = [
    { id: 't-e3', name: 'e3', picks: 3, wins: 0, played: 0 },
    { id: 't-e1', name: 'e1', picks: 5, wins: 0, played: 0 },
    { id: 't-e2', name: 'e2', picks: 0, wins: 0, played: 0 }
  ];
  const { weekRows } = G.shapeGroupRows(api, api, 'e1', 'e1');
  assert.deepEqual(weekRows.map((r) => r.displayName), ['e1', 'e2', 'e3']);
  assert.deepEqual(weekRows.map((r) => r.rank), [0, 0, 0]);
  assert.ok(weekRows.every((r) => r.weekPoints === null), 'no final game is a dash, never 0');
  assert.equal(weekRows.find((r) => r.isSelf).displayName, 'e1');
  assert.equal(weekRows.find((r) => r.isCommish).displayName, 'e1');
  assert.equal(weekRows.filter((r) => r.isSelf).length, 1);
});

test('group state: competition ranking on wins, week and season kept apart', () => {
  /* The API's order: wins desc, picks desc. */
  const week = [
    { id: 'b', name: 'bo', picks: 4, wins: 2, played: 3 },
    { id: 'a', name: 'al', picks: 4, wins: 2, played: 2 },
    { id: 'c', name: 'cy', picks: 2, wins: 0, played: 2 },
    { id: 'd', name: 'di', picks: 1, wins: 0, played: 0 }
  ];
  const season = [
    { id: 'a', name: 'al', picks: 9, wins: 6, played: 7 },
    { id: 'c', name: 'cy', picks: 8, wins: 4, played: 6 },
    { id: 'b', name: 'bo', picks: 8, wins: 4, played: 7 },
    { id: 'd', name: 'di', picks: 1, wins: 0, played: 0 }
  ];
  const { weekRows, seasonRows } = G.shapeGroupRows(week, season, 'cy', 'al');
  assert.deepEqual(weekRows.map((r) => r.userId), ['b', 'a', 'c', 'd'], 'the server order holds inside a tie');
  assert.deepEqual(weekRows.map((r) => r.rank), [1, 1, 3, 3], 'level share a rank, the next one skips');
  assert.deepEqual(seasonRows.map((r) => r.rank), [1, 2, 2, 4]);
  const cy = weekRows.find((r) => r.userId === 'c');
  assert.equal(cy.weekPoints, 0, 'two final games and no winners is a zero');
  assert.equal(cy.seasonPoints, 4);
  assert.equal(cy.isSelf, true);
  assert.equal(weekRows.find((r) => r.userId === 'd').weekPoints, null);
  assert.equal(seasonRows.find((r) => r.userId === 'a').isCommish, true);
  console.log('    week ranks:', weekRows.map((r) => r.displayName + ' ' + r.rank).join(', '));
});

test('group state: the record line reads the API\'s wins, played and picks', () => {
  assert.equal(G.recordText({ wins: 0, played: 0, picks: 0 }), 'No picks yet');
  assert.equal(G.recordText({ wins: 0, played: 0, picks: 1 }), '1 pick · none final');
  assert.equal(G.recordText({ wins: 0, played: 0, picks: 5 }), '5 picks · none final');
  assert.equal(G.recordText({ wins: 2, played: 3, picks: 5 }), '2–1 · 5 picks');
});

/* ------------------------------------------------------------------ *
 * 5. All five sports, and the boast - 2026-09-12
 *
 * Jason: "complete the pool revision, but do all the sports for the pool" and
 * "ability to boast via x and text". Every row fed below is a TEST INPUT in the
 * frozen contract's own shape - football {id, name, picks, wins, played}, F1
 * {id, name, points, events, wins, picks, played} - and not a fixture. No F1 or
 * basketball group has been played. The origin is a test value too.
 * ------------------------------------------------------------------ */

/** A top-level `const NAME = {...}` or `[...]`, by bracket matching. */
function constSource(name) {
  const m = new RegExp('const\\s+' + name + '\\s*=\\s*').exec(SCREEN_SRC);
  assert.ok(m, `screen no longer declares ${name}`);
  const from = m.index + m[0].length;
  const open = SCREEN_SRC[from], close = open === '{' ? '}' : ']';
  let depth = 0;
  for (let i = from; i < SCREEN_SRC.length; i++) {
    if (SCREEN_SRC[i] === open) depth++;
    else if (SCREEN_SRC[i] === close) { depth--; if (depth === 0) return 'const ' + name + ' = ' + SCREEN_SRC.slice(from, i + 1) + ';'; }
  }
  assert.fail(`could not find the end of ${name}`);
}

const S = new Function([constSource('SPORT_LABEL'), fnSource('groupSport'), fnSource('sportLabel'),
  fnSource('boardKind'), fnSource('safeName'), fnSource('shapeF1Rows'), fnSource('weekendsText'),
  fnSource('ordinal'), fnSource('boastText'), fnSource('boastLinks'), fnSource('boastFor'),
  'return { groupSport, sportLabel, boardKind, shapeF1Rows, weekendsText, ordinal, boastText, boastLinks, boastFor };'
].join('\n'))();

/** loadGroupBoard with group.js, fetch and storage stubbed; records every URL asked for. */
function groupLoader(group, answer) {
  const calls = [];
  const fakeFetch = async (u) => {
    calls.push(u);
    /* REAL Responses: a body reads once, as in a browser. The first version of this
       fake returned objects that could be read any number of times, and hid a board
       that read the same season response twice and called itself "offline". */
    if (u.startsWith('/api/group/detail')) return new Response(JSON.stringify({ members: [{ name: 'al', you: true }], commissioner: 'al' }), { status: 200 });
    const week = Number(new URL(u, 'http://t').searchParams.get('week'));
    return new Response(JSON.stringify(answer(week)), { status: 200 });
  };
  const load = new Function('myGroups', 'pickCurrent', 'fetch', 'window', 'localStorage', [
    constSource('GROUP_WEEK'), constSource('SPORT_LABEL'), fnSource('groupSport'), fnSource('boardKind'),
    fnSource('safeName'), fnSource('shapeGroupRows'), fnSource('shapeF1Rows'), fnSource('loadGroupBoard'),
    'return loadGroupBoard;'].join('\n'))(
    async () => ({ signedIn: true, groups: [group] }), (gs) => gs[0], fakeFetch, {}, { getItem: () => null });
  return { load, calls, standings: () => calls.filter((u) => u.startsWith('/api/pool/standings')) };
}

test('five sports: every group sport has its label, and nothing is forced to football', () => {
  assert.equal(S.sportLabel('college-football'), 'College football');
  assert.equal(S.sportLabel('nfl'), 'NFL');
  assert.equal(S.sportLabel('mens-college-basketball'), 'College basketball');
  assert.equal(S.sportLabel('nba'), 'NBA');
  assert.equal(S.sportLabel('f1'), 'Formula 1');
  for (const s of ['college-football', 'nfl', 'mens-college-basketball', 'nba', 'f1']) assert.equal(S.groupSport(s), s);
  assert.equal(S.groupSport('curling'), 'college-football', 'an unknown sport keeps the old default');
  assert.equal(S.groupSport(undefined), 'college-football');
  assert.deepEqual(['college-football', 'nfl', 'mens-college-basketball', 'nba', 'f1'].map(S.boardKind),
    ['week', 'week', 'season', 'season', 'points']);
  const load = fnSource('loadGroupBoard');
  assert.ok(load.includes('groupSport(g.sport)'), 'the group sport is normalized to the five');
  assert.ok(!/g\.sport === 'nfl' \? 'nfl' : 'college-football'/.test(load), 'the two-sport force is gone');
  assert.ok(SCREEN_SRC.includes('sportLabel(d.sport)'), 'the sub line names the sport through the one label table');
});

test('F1: points board, ranked on points, weekends entered, a dash until anything scores', () => {
  /* Test input, in the order the API sends it: points desc, then weekends. */
  const api = [
    { id: 'b', name: 'bo', points: 14, events: 3, wins: 14, picks: 3, played: 3 },
    { id: 'a', name: 'al', points: 14, events: 2, wins: 14, picks: 2, played: 2 },
    { id: 'c', name: 'cy', points: 5, events: 1, wins: 5, picks: 1, played: 1 },
    { id: 'd', name: 'di', points: 0, events: 0, wins: 0, picks: 0, played: 0 }
  ];
  const rows = S.shapeF1Rows(api, 'cy', 'al');
  assert.deepEqual(rows.map((r) => r.userId), ['b', 'a', 'c', 'd'], 'the server order holds inside a tie');
  assert.deepEqual(rows.map((r) => r.rank), [1, 1, 3, 4], 'competition ranking on points');
  assert.deepEqual(rows.map((r) => r.seasonPoints), [14, 14, 5, null], 'no weekend entered is a dash');
  assert.equal(rows.find((r) => r.isSelf).userId, 'c');
  assert.equal(rows.find((r) => r.isCommish).userId, 'a');
  assert.ok(rows.every((r) => r.weekRec === null && r.seasonRec === null), 'no W-L record on an F1 row');
  assert.equal(S.weekendsText(0), 'No weekends yet');
  assert.equal(S.weekendsText(1), '1 weekend entered');
  assert.equal(S.weekendsText(3), '3 weekends entered');

  const none = S.shapeF1Rows([
    { id: 'z', name: 'zed', points: 0, events: 1, wins: 0, picks: 1, played: 1 },
    { id: 'm', name: 'mo', points: 0, events: 1, wins: 0, picks: 1, played: 1 }
  ], '', '');
  assert.deepEqual(none.map((r) => r.displayName), ['mo', 'zed'], 'nothing scored: alphabetical');
  assert.deepEqual(none.map((r) => r.rank), [0, 0]);
  assert.ok(none.every((r) => r.seasonPoints === null), 'a weekend entered is not a weekend scored');
  console.log('    F1 ranks:', rows.map((r) => r.displayName + ' ' + r.rank + ' (' + r.seasonPoints + ')').join(', '));
});

test('F1: the group board asks once, reads unit points, and has no week', async () => {
  const f = groupLoader({ id: 'F1GRP', name: 'Pit Wall', sport: 'f1', members: 3 }, () => ({
    unit: 'points', week: 0,
    rows: [
      { id: 'a', name: 'al', points: 9, events: 2, wins: 9, picks: 2, played: 2 },
      { id: 'b', name: 'bo', points: 4, events: 2, wins: 4, picks: 2, played: 2 }
    ]
  }));
  const out = await f.load();
  assert.deepEqual(f.standings(), ['/api/pool/standings?sport=f1&pool=F1GRP&week=0']);
  assert.equal(out.board, 'points');
  assert.equal(out.pool.week, 0);
  assert.deepEqual(out.seasonRows.map((r) => [r.displayName, r.rank, r.seasonPoints]), [['al', 1, 9], ['bo', 2, 4]]);
  assert.equal(out.weekPicks, 4, 'weekends entered stand in for picks, so the empty state stays off');
  const draw = fnSource('drawGroup');
  assert.ok(/if \(kind === 'week'\) host\.appendChild\(toggle\(pool\)\)/.test(draw), 'only football gets the week toggle');
  assert.ok(SCREEN_SRC.includes("data.board === 'points' ? 'Points' : 'Season'"), 'the one column is headed Points');
});

test('basketball: the season board only, never a day number as a week', async () => {
  for (const sport of ['mens-college-basketball', 'nba']) {
    const f = groupLoader({ id: 'HOOPS1', name: 'Hoops', sport, week: 20260912, members: 2 }, (week) => ({
      week,
      rows: [
        { id: 'a', name: 'al', picks: 6, wins: 4, played: 5 },
        { id: 'b', name: 'bo', picks: 6, wins: 3, played: 5 }
      ]
    }));
    const out = await f.load();
    assert.deepEqual(f.standings(), ['/api/pool/standings?sport=' + sport + '&pool=HOOPS1&week=0'],
      sport + ' must read week=0 and nothing else');
    assert.equal(out.board, 'season');
    assert.equal(out.pool.week, 0);
    assert.deepEqual(out.seasonRows.map((r) => [r.displayName, r.rank, r.seasonPoints]), [['al', 1, 4], ['bo', 2, 3]]);
  }
  /* Football is unchanged: its week, then its season. */
  const nfl = groupLoader({ id: 'NFLGRP', name: 'Sundays', sport: 'nfl', members: 1 }, (week) => ({ week, rows: [] }));
  await nfl.load();
  assert.deepEqual(nfl.standings(), [
    '/api/pool/standings?sport=nfl&pool=NFLGRP&week=1',
    '/api/pool/standings?sport=nfl&pool=NFLGRP&week=0'
  ]);
});

test('boast: the words - ordinal, rank of members, group name', () => {
  assert.equal(S.boastText(2, 6, 'The Fourth Floor', false), "I'm 2nd of 6 in The Fourth Floor on Any Given");
  assert.equal(S.boastText(1, 6, 'The Fourth Floor', true), "I'm tied for 1st of 6 in The Fourth Floor on Any Given");
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101].map(S.ordinal),
    ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st']);
});

test('boast: X intent URL-encoded, and sms body in the one form both phones read', () => {
  const text = "I'm 2nd of 6 in The Fourth Floor on Any Given";
  const url = 'https://anygiven.test/?pool=ABC123';
  const { x, sms } = S.boastLinks(text, url);
  assert.ok(x.startsWith('https://twitter.com/intent/tweet?'));
  const u = new URL(x);
  assert.equal(u.searchParams.get('text'), text);
  assert.equal(u.searchParams.get('url'), url);
  assert.ok(!/[ '\n]/.test(x), 'the intent carries no raw space, quote or newline');
  assert.ok(sms.startsWith('sms:?&body='));
  assert.equal(decodeURIComponent(sms.slice('sms:?&body='.length)), text + '\n' + url);
  assert.ok(!/[ \n]/.test(sms), 'the body is encoded');
  console.log('    X:', x);
  console.log('    sms:', sms);
});

test('boast: no row without a rank, and the link is the group code', () => {
  const g = { id: 'ABC123', name: 'The Fourth Floor' };
  const pool = { memberCount: 6 };
  const origin = 'https://anygiven.test';
  const row = (id, rank, isSelf) => ({ userId: id, displayName: id, rank, isSelf });
  assert.equal(S.boastFor([row('a', 1, false), row('b', 2, false)], pool, g, origin), null, 'not on the board');
  assert.equal(S.boastFor([row('a', 0, true), row('b', 0, false)], pool, g, origin), null, 'unranked');
  assert.equal(S.boastFor([], pool, g, origin), null);
  assert.equal(S.boastFor([row('a', 1, true)], pool, null, origin), null, 'no group');

  const b = S.boastFor([row('a', 1, false), row('b', 2, true), row('c', 3, false)], pool, g, origin);
  assert.equal(b.text, "I'm 2nd of 6 in The Fourth Floor on Any Given");
  assert.equal(b.url, 'https://anygiven.test/?pool=ABC123');
  assert.equal(new URL(b.x).searchParams.get('url'), b.url);
  const t = S.boastFor([row('a', 1, true), row('b', 1, false)], pool, g, origin);
  assert.equal(t.text, "I'm tied for 1st of 6 in The Fourth Floor on Any Given");

  const draw = fnSource('drawGroup');
  assert.ok(/const brag = boastFor\(/.test(draw) && /if \(brag\) host\.appendChild\(boastRow\(brag\)\)/.test(draw),
    'the row is drawn only when boastFor returns something');
  const br = fnSource('boastRow');
  assert.ok(br.includes('navigator.share') && /if \(typeof navigator !== 'undefined' && navigator\.share\)/.test(br),
    'Share only where the native sheet exists');
  assert.ok(/\.p5-boast-go\s*\{[^}]*min-height:\s*var\(--tap-min\)/.test(CSS_SRC), 'each boast action is 44px');
  assert.ok(/\.p5-boast\s*\{[^}]*grid-auto-columns:\s*minmax\(0,\s*1fr\)/.test(CSS_SRC),
    'the actions share one row and can shrink - no sideways scroll');
  assert.ok(/\.p5-table--one \.p5-row\s*\{\s*grid-template-columns:\s*26px 24px 22px minmax\(0, 1fr\) 58px/.test(CSS_SRC),
    'the one-figure board drops the week column');
});
