/* l5-game.test.mjs — the Game tab.
 *
 * 🔴 RULE ZERO. Nothing in this file is closed against data this file wrote.
 * Every assertion below is against one of exactly three things:
 *
 *   1. the three REAL captured games in fixtures/ — 179, 178 and 158 real
 *      win-probability rows and 516 real plays,
 *   2. the REAL modules — winprob.ts, detect.ts, parse.ts, run unmodified,
 *   3. ESPN's OWN boxscore, used as the oracle for the numbers this screen
 *      derives from plays (third-down efficiency: 4-15 and 4-12, exactly).
 *
 * NO FIXTURE IS WRITTEN OR MODIFIED ANYWHERE IN THIS FILE.
 *
 * 7.5 is NOT closed here and cannot be: layout bugs are invisible to tests.
 * The screen closes in a real browser at 393px. This suite closes the DATA
 * the browser then draws, and the two invariants a screenshot cannot check —
 * that orientation is applied once, and that it is applied in winprob.ts.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const FIX = path.join(REPO, 'fixtures');

const load = (n) => JSON.parse(readFileSync(path.join(FIX, `${n}-260905-final.json`), 'utf8'));
const TEAMS = JSON.parse(readFileSync(path.join(FIX, 'teams.json'), 'utf8')).teams;

/* ── loading the screen module ────────────────────────────────────────────
 * A screen module is BROWSER code: its specifiers are server-absolute
 * ('/components/team-chip.js', '/src/lib/winprob.ts') because that is what the
 * preview harness serves. Node cannot resolve those, so they are rewritten to
 * real paths and the file is written to a UNIQUELY NAMED temp directory.
 *
 * The unique name is not decoration. A fixed /tmp name shared between sessions
 * destroyed 1,858 bytes of live work on 2026-08-29 — mkdtemp is the fix.
 *
 * Node 24 strips the .ts types itself, exactly as tools/preview.mjs does for the
 * browser, so BOTH runtimes execute the same src/lib source. */
const SCREEN_SRC = readFileSync(path.join(REPO, 'public', 'screens', 'l5-game.screen.js'), 'utf8');
const dir = mkdtempSync(path.join(tmpdir(), 'ag-l5-'));
const shimmed = path.join(dir, 'l5.mjs');
writeFileSync(shimmed, SCREEN_SRC.replace(/from '\/(components|src)\//g,
  (_m, g) => `from '${pathToFileURL(path.join(REPO, g === 'components' ? 'public/components' : 'src')).href}/`));
const L5 = await import(pathToFileURL(shimmed).href);

/* The real modules, for the diff. */
const WP = await import(pathToFileURL(path.join(REPO, 'src/lib/winprob.ts')).href);
const PARSE = await import(pathToFileURL(path.join(REPO, 'src/lib/parse.ts')).href);

const ORE = '2483', BOIS = '68';

/* ══════════════════════════════════════════════════════════════════════════
 * 7.6 — A DIVERGING CHART SHARES ONE CENTER, AND ORIENTATION IS APPLIED ONCE
 * ═════════════════════════════════════════════════════════════════════════ */

test('7.6 — this view applies NO orientation of its own', () => {
  /* The recorded bug is a SECOND flip in the view: the momentum summary bar was
   * pre-oriented and its parts were not. So the check is on the source text,
   * the same way winprob.ts checks itself. */
  const body = SCREEN_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  /* The ONLY `1 - x` allowed is SVG's y-axis, and its argument is named `frac`
   * precisely so this check can be exact rather than approximate. */
  const ONE_MINUS = /1[ 	]*-[ 	]*(?!frac[^A-Za-z0-9_$])[A-Za-z_$]/;
  assert.equal(ONE_MINUS.test(body), false,
    'a `1 - something` in the view — the only permitted one is `1 - frac`, the SVG y-axis');
  assert.equal(/pct|Pct/.test(body.replace(/pct1|[.]pct(?![A-Za-z])|pct:/g, '')), false,
    'the view is doing arithmetic on a probability');
  assert.equal(/homePct/.test(body), false, 'the view reads the RAW home-oriented number');
  assert.equal(/flipped/.test(body), false, 'the view branches on the flip');
  assert.equal(WP.buildWinProbChart(load('real-bois-at-ore'), {}).orientation.appliedIn,
    'orientSeries', 'the module still names where the one flip happens');
});

test('7.6 — the flip is real, and flipping it twice would show', () => {
  const g = load('real-bois-at-ore');
  const home = L5.buildGameView(g, { teamsById: TEAMS, followTeamId: ORE });
  const away = L5.buildGameView(g, { teamsById: TEAMS, followTeamId: BOIS });
  assert.equal(home.chart.orientation.flipped, false);
  assert.equal(away.chart.orientation.flipped, true);
  for (let i = 0; i < home.chart.points.length; i++) {
    assert.ok(Math.abs(home.chart.points[i].pct + away.chart.points[i].pct - 1) < 1e-9,
      `points ${i} are not mirror images — something flipped twice`);
  }
  /* The real game: Oregon 34, Boise St 27. Oregon's line ends at 1, Boise's at 0. */
  assert.equal(home.chart.summary.pct, 1);
  assert.equal(away.chart.summary.pct, 0);
});

test('7.6 — the momentum bar and the sentence read ONE number', () => {
  for (const [file, follow] of [['real-bois-at-ore', ORE], ['real-bois-at-ore', BOIS],
                                ['real-ball-at-osu', '194'], ['real-utep-at-ou', '2638']]) {
    const v = L5.buildGameView(load(file), { teamsById: TEAMS, followTeamId: follow });
    const m = v.momentum;
    assert.ok(m, `${file}/${follow}: no momentum`);
    assert.equal(m.towardUs, m.overall >= 0,
      'the sentence names a team the bar does not point at — the 7.6 bug, exactly');
    assert.ok(m.overall >= -1 && m.overall <= 1);
    for (const p of m.parts) assert.ok(p.value >= -1 && p.value <= 1, `${p.name} is off the center scale`);
  }
});

test('7.6 — flipping the follow team flips every momentum track', () => {
  const g = load('real-bois-at-ore');
  const a = L5.buildGameView(g, { teamsById: TEAMS, followTeamId: ORE }).momentum;
  const b = L5.buildGameView(g, { teamsById: TEAMS, followTeamId: BOIS }).momentum;
  assert.ok(Math.abs(a.overall + b.overall) < 1e-9, 'the overall is not symmetric');
  for (let i = 0; i < a.parts.length; i++) {
    assert.equal(a.parts[i].name, b.parts[i].name);
    assert.ok(Math.abs(a.parts[i].value + b.parts[i].value) < 1e-9,
      `${a.parts[i].name} is not symmetric — a second frame exists`);
  }
});

/* ══════════════════════════════════════════════════════════════════════════
 * 7.8 — THE CHART CARRIES THE USER'S OWN CALLS
 * ═════════════════════════════════════════════════════════════════════════ */

test('7.8 — every call lands on the curve, filled or hollow, and joins a real snap', () => {
  const g = load('real-bois-at-ore');
  const plays = PARSE.parsePlays(g);
  const calls = L5.callsFromPlays(plays, { every: 11 });
  assert.ok(calls.length >= 8, `only ${calls.length} calls built from 181 real plays`);

  const v = L5.buildGameView(g, { teamsById: TEAMS, followTeamId: ORE, calls });
  assert.ok(v.chart.markers.length > 0, 'no markers on the curve — 7.8 is not drawn');
  assert.equal(v.chart.unjoinedCalls.length + v.chart.markers.length, calls.length);

  const byId = new Map(v.chart.points.map((p) => [p.playId, p]));
  for (const m of v.chart.markers) {
    assert.ok(['filled', 'hollow', 'open'].includes(m.fill));
    const pt = byId.get(m.playId);
    assert.ok(pt, 'a marker sits on a play the line does not have');
    /* THE MARKER READS THE ORIENTED POINT. If the view re-derived it, this fails. */
    assert.equal(m.pct, pt.pct);
    assert.equal(m.offset, pt.offset);
    assert.equal(m.t, pt.t);
  }
  const landed = v.chart.markers.filter((m) => m.fill === 'filled').length;
  const missed = v.chart.markers.filter((m) => m.fill === 'hollow').length;
  console.log(`    ${v.chart.markers.length} markers on the curve: ${landed} landed, ${missed} missed`);
  assert.ok(landed > 0 && missed > 0, 'both fills must actually occur, or one is never seen');
});

test('7.8 — `landed` is a fact about the real play, not a coin flip', () => {
  const plays = PARSE.parsePlays(load('real-bois-at-ore'));
  const byId = new Map(plays.map((p) => [p.id, p]));
  for (const c of L5.callsFromPlays(plays, { every: 11 })) {
    assert.equal(c.landed, byId.get(c.snapId).type === c.side);
  }
});

test('7.8 — an open call is drawn, and is the third defined fill', () => {
  const plays = PARSE.parsePlays(load('real-bois-at-ore'));
  const calls = L5.callsFromPlays(plays, { every: 11, openLast: true });
  const v = L5.buildGameView(load('real-bois-at-ore'), { teamsById: TEAMS, followTeamId: ORE, calls });
  assert.equal(v.chart.markers.filter((m) => m.fill === 'open').length, 1);
});

/* ══════════════════════════════════════════════════════════════════════════
 * 7.7 — SHOW WHY THE LINE MOVED
 * ═════════════════════════════════════════════════════════════════════════ */

test('7.7 — key moments exist, carry a written headline, and are ORIENTED', () => {
  const g = load('real-bois-at-ore');
  const ore = L5.buildGameView(g, { teamsById: TEAMS, followTeamId: ORE });
  const bois = L5.buildGameView(g, { teamsById: TEAMS, followTeamId: BOIS });
  assert.ok(ore.keyMoments.length >= 5, `only ${ore.keyMoments.length} key moments on a real game`);
  assert.equal(ore.topMoments.length, 3);

  for (const m of ore.keyMoments) {
    assert.ok(m.headline && m.headline.length > 4, 'a key moment with no sentence');
    assert.ok(m.event, 'a key moment with no event');
    assert.notEqual(m.headline, m.text, 'the headline is the raw play text — detect.ts was not used');
  }
  /* Same play, opposite sign, because the delta is in the oriented frame. */
  const a = new Map(ore.keyMoments.map((m) => [m.playId, m.wpDelta]));
  for (const m of bois.keyMoments) assert.ok(Math.abs(a.get(m.playId) + m.wpDelta) < 1e-9);

  const top = ore.topMoments[0];
  console.log(`    top moment: ${top.event} ${(top.wpDelta * 100).toFixed(1)}pt — ${top.headline}`);
});

test('7.7 — the biggest real swing in the corpus is found and drawn', () => {
  const v = L5.buildGameView(load('real-bois-at-ore'), { teamsById: TEAMS, followTeamId: ORE });
  const b = v.chart.summary.biggestSwing;
  assert.equal(b.index, 149);
  assert.equal(Math.round(b.delta * 1000) / 10, 28.8, 'the +28.8 point Q4 touchdown');
  assert.ok(v.topMoments.some((m) => m.playId === b.playId),
    'the biggest swing of the game is not one of the three drawn key moments');
});

/* ══════════════════════════════════════════════════════════════════════════
 * 7.2 — THE STAR IS READ, NEVER DERIVED
 * ═════════════════════════════════════════════════════════════════════════ */

test('7.2 — the who-panel reads play.star and never a tackler', () => {
  const body = SCREEN_SRC.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(/\.text\s*\.\s*match|lastIndexOf\('\('|\/\\\(\[\^\)\]/.test(body), false,
    'the view is picking a name out of play text');
  for (const f of ['real-bois-at-ore', 'real-ball-at-osu', 'real-utep-at-ou']) {
    const plays = PARSE.parsePlays(load(f));
    const who = L5.whoFrom(plays, []);
    assert.ok(who && who.star && who.star.name, `${f}: no star`);
    assert.notEqual(who.star.role, 'tackler', 'the tackler was named as the star');
    assert.equal(who.star, who.play.star, 'the star was rebuilt rather than read');
  }
});

test('7.2 — no play in any real game ever emits a tackler as its star', () => {
  let n = 0;
  for (const f of ['real-bois-at-ore', 'real-ball-at-osu', 'real-utep-at-ou']) {
    for (const p of PARSE.parsePlays(load(f))) if (p.star) { n++; assert.notEqual(p.star.role, 'tackler'); }
  }
  console.log(`    ${n} stars across the three real games, zero tacklers`);
  assert.ok(n > 400, `only ${n} stars — the parser is not being reached`);
});

test('the settled call and the player are ONE object', () => {
  const g = load('real-bois-at-ore');
  const plays = PARSE.parsePlays(g);
  const last = [...plays].reverse().find((p) => p.star);
  const calls = [{ snapId: last.id, side: 'pass', stake: 10, p: 0.58, state: 'settled', landed: true, delta: 7 }];
  const who = L5.whoFrom(plays, calls);
  assert.equal(who.call.snapId, last.id, 'the verdict and the star did not arrive together');
  /* And with no call on that play the panel still stands alone. */
  assert.equal(L5.whoFrom(plays, []).call, null);
});

/* ══════════════════════════════════════════════════════════════════════════
 * THE DRIVE CHART
 * ═════════════════════════════════════════════════════════════════════════ */

test('a touchdown reaches the end zone, on every real drive in all three games', () => {
  let tds = 0, drives = 0;
  for (const f of ['real-bois-at-ore', 'real-ball-at-osu', 'real-utep-at-ou']) {
    for (const d of L5.driveRows(load(f), TEAMS)) {
      drives++;
      assert.ok(d.start >= 0 && d.start <= 100, `start off the field: ${d.start}`);
      assert.ok(d.end >= 0 && d.end <= 100, `end off the field: ${d.end}`);
      if (d.short === 'TD') { tds++; assert.equal(d.end, 100, 'a touchdown drawn short of the end zone'); }
    }
  }
  console.log(`    ${drives} real drives, ${tds} touchdowns, every one drawn to 100`);
  assert.ok(tds >= 10 && drives >= 70);
});

/* Found by LOOKING, not by testing: every away drive ran backwards down the
 * chart and every away touchdown finished at its own goal line. ESPN's drive
 * `yardLine` is absolute field position — 0 at the home goal — so the away
 * team's numbers count down. The oracle is ESPN's own `yards` on each drive. */
test('every drive runs toward the end zone it is attacking, both teams', () => {
  for (const f of ['real-bois-at-ore', 'real-ball-at-osu', 'real-utep-at-ou']) {
    const g = load(f);
    const rows = L5.driveRows(g, TEAMS);
    const raw = (g.drives.previous || []);
    const fwd = {}, rev = {};
    rows.forEach((r, i) => {
      if (r.short === 'TD') return;                 // end is overridden to 100
      const y = Number(raw[i] && raw[i].yards);
      if (!Number.isFinite(y)) return;
      const k = r.teamId;
      if (r.end - r.start === y) fwd[k] = (fwd[k] || 0) + 1;
      if (r.start - r.end === y && y !== 0) rev[k] = (rev[k] || 0) + 1;
    });
    const ids = [...new Set(rows.map((r) => r.teamId))];
    assert.equal(ids.length, 2, `${f}: not two teams`);
    for (const id of ids) {
      assert.ok((fwd[id] || 0) > 0, `${f}: team ${id} has no drive that gains ground forward`);
      assert.equal(rev[id] || 0, 0, `${f}: team ${id} is drawn running the wrong way`);
    }
    console.log(`    ${f}: forward ${ids.map((i) => `${i}=${fwd[i] || 0}`).join(' ')}, reversed none`);
  }
});

test('the followed team is on the right of every head-to-head row', () => {
  const g = load('real-bois-at-ore');
  for (const follow of [ORE, BOIS]) {
    const v = L5.buildGameView(g, { teamsById: TEAMS, followTeamId: follow });
    assert.ok(v.h2h.length);
    for (const r of v.h2h) {
      assert.equal(String(r.b.teamId), follow, 'the followed team is not on the right');
      assert.notEqual(String(r.a.teamId), follow);
    }
  }
});

test('a drive knows its team, and the null-color case is a defined state', () => {
  const rows = L5.driveRows(load('real-bois-at-ore'), TEAMS);
  for (const d of rows) assert.ok(d.teamId, `drive ${d.abbrev} has no team id`);
  const ids = new Set(rows.map((d) => d.teamId));
  assert.deepEqual([...ids].sort(), [BOIS, ORE].sort());
  /* A drive whose team is missing from teams.json must still draw. */
  const orphan = L5.driveRows(load('real-bois-at-ore'), {});
  assert.equal(orphan.length, rows.length);
  assert.equal(orphan[0].team, null);
});

/* ══════════════════════════════════════════════════════════════════════════
 * HEAD TO HEAD — the derived numbers, against ESPN's own boxscore
 * ═════════════════════════════════════════════════════════════════════════ */

test('the play-derived third down matches ESPN exactly, on all three games', () => {
  for (const f of ['real-bois-at-ore', 'real-ball-at-osu', 'real-utep-at-ou']) {
    const g = load(f);
    const v = L5.buildGameView(g, { teamsById: TEAMS, followTeamId: null });
    const derived = L5.h2hFromPlays(
      PARSE.parsePlays(g),
      [],
      L5.driveRows(g, TEAMS),
      { a: v.awayId, b: v.homeId },
    ).find((r) => r.label === 'Third down');

    const box = {};
    for (const t of g.boxscore.teams) {
      const s = t.statistics.find((x) => x.name === 'thirdDownEff');
      box[String(t.team.id)] = s.displayValue;
    }
    assert.equal(derived.a.text, box[v.awayId], `${f}: away third down`);
    assert.equal(derived.b.text, box[v.homeId], `${f}: home third down`);
    console.log(`    ${f}: third down ${derived.a.text} / ${derived.b.text} — matches ESPN`);
  }
});

test('the final head-to-head is the real boxscore, and every bar is measurable', () => {
  const g = load('real-bois-at-ore');
  const rows = L5.h2hFromBoxscore(g);
  assert.equal(rows.length, 7);
  for (const r of rows) {
    assert.ok(Number.isFinite(r.a.value) && Number.isFinite(r.b.value), `${r.label} has no number`);
    assert.ok(r.a.text && r.b.text, `${r.label} has no display value`);
  }
  assert.equal(rows.find((r) => r.label === 'Total yards').a.text, '274');
  assert.equal(rows.find((r) => r.label === 'Total yards').b.text, '497');
  /* `4-15` is 26.7% and `31:54` is 1914 seconds — a bar cannot be drawn off text. */
  assert.equal(Math.round(L5.statValue('thirdDownEff', '4-15') * 10) / 10, 26.7);
  assert.equal(L5.statValue('possessionTime', '31:54'), 1914);
  assert.equal(L5.statValue('totalYards', '274'), 274);
});

/* ══════════════════════════════════════════════════════════════════════════
 * THE STATES — every one is a real game, cut, never a game somebody typed
 * ═════════════════════════════════════════════════════════════════════════ */

test('cutAt keeps a real prefix of a real game and invents nothing', () => {
  const g = load('real-bois-at-ore');
  const cut = L5.cutAt(g, 152);
  assert.equal(cut.winprobability.length, 153);
  for (let i = 0; i < 153; i++) {
    assert.deepEqual(cut.winprobability[i], g.winprobability[i], 'a row was altered');
  }
  const before = L5.rawPlays(g).map((p) => p.id);
  const after = L5.rawPlays(cut).map((p) => p.id);
  assert.ok(after.length < before.length, 'nothing was cut');
  assert.deepEqual(after, before.slice(0, after.length), 'the prefix is not a prefix');

  const v = L5.buildGameView(cut, { teamsById: TEAMS, followTeamId: ORE });
  assert.equal(v.live, true, 'a cut game does not read as in progress');
  assert.equal(v.homeScore, 34);      // read off the last surviving play
  assert.equal(v.awayScore, 27);
  assert.ok(v.chart.points.length === 153);
  assert.ok(v.drives.length > 0 && v.drives[v.drives.length - 1].inProgress,
    'the last drive of a live game is not marked in progress');
});

test('halftime is a real first half, and pre-game is one real row', () => {
  const g = load('real-ball-at-osu');
  const plays = PARSE.parsePlays(g);
  const byId = new Map(plays.map((p) => [p.id, p]));
  let cut = 0;
  for (let i = 0; i < g.winprobability.length; i++) {
    const p = byId.get(String(g.winprobability[i].playId));
    if (p && p.quarter >= 3) { cut = i - 1; break; }
  }
  const half = L5.buildGameView(L5.cutAt(g, cut), { teamsById: TEAMS, followTeamId: '2050' });
  const last = half.chart.points[half.chart.points.length - 1];
  assert.ok(last.period <= 2, `halftime ends in Q${last.period}`);
  assert.ok(half.drives.length > 5);

  const pre = L5.buildGameView(L5.beforeKickoff(g), { teamsById: TEAMS, followTeamId: '194' });
  assert.equal(pre.chart.points.length, 1);
  assert.equal(pre.drives.length, 0);
  assert.equal(pre.keyMoments.length, 0, 'a key moment before a snap');
  assert.equal(pre.chart.markers.length, 0);
  assert.ok(pre.chart.summary, 'no pre-kick number to show');
  /* A screen that says "not started" beside a 56-3 scoreline contradicts itself
   * in its own first two lines. It did, until this was looked at. */
  assert.equal(pre.homeScore, 0);
  assert.equal(pre.awayScore, 0);
  assert.equal(pre.live, false);
  assert.ok(pre.spread && pre.spread.details, 'no real line to show before kickoff');
});

test('every state renders from a real fixture and produces a whole view', () => {
  const cases = [
    ['live', 'real-bois-at-ore', 152, ORE],
    ['final', 'real-bois-at-ore', null, BOIS],
    ['halftime', 'real-ball-at-osu', 90, '2050'],
  ];
  for (const [name, file, cut, follow] of cases) {
    const g = load(file);
    const s = cut === null ? g : L5.cutAt(g, cut);
    const calls = L5.callsFromPlays(PARSE.parsePlays(s), { every: 11, openLast: name === 'live' });
    const v = L5.buildGameView(s, { teamsById: TEAMS, followTeamId: follow, calls });
    assert.ok(v.chart.points.length > 20, `${name}: no curve`);
    assert.ok(v.chart.markers.length > 0, `${name}: no call markers`);
    assert.ok(v.topMoments.length > 0, `${name}: nothing says why the line moved`);
    assert.ok(v.drives.length > 0, `${name}: no drives`);
    assert.ok(v.leaders.length >= 3, `${name}: no leaders`);
    assert.ok(v.h2h.length >= 5, `${name}: no head-to-head rows`);
    assert.ok(v.who && v.who.star, `${name}: no who-panel`);
    assert.ok(v.momentum, `${name}: no momentum`);
    assert.equal(v.h2hSource, name === 'final' ? 'boxscore' : 'plays');
    console.log(`    ${name.padEnd(9)} ${v.chart.points.length} pts · ${v.chart.markers.length} calls · ` +
      `${v.keyMoments.length} moments · ${v.drives.length} drives · h2h from ${v.h2hSource}`);
  }
});

/* ══════════════════════════════════════════════════════════════════════════
 * THE DESIGN RULES THAT FAIL A PIECE
 * ═════════════════════════════════════════════════════════════════════════ */

const CSS = readFileSync(path.join(REPO, 'public', 'screens', 'l5-game.css'), 'utf8');

test('the CSS reads --accent, never --maroon or --gold, and casts no shadow', () => {
  const rules = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(/--maroon|--gold/.test(rules), false, 'a hard-coded accent — invisible in one theme');
  assert.equal(/box-shadow/.test(rules), false, 'depth is 1px solid var(--line)');
  assert.equal(/colour|centre|grey|behaviour/i.test(rules), false, 'US spelling');
  assert.ok(/var\(--accent\)/.test(rules), 'the accent is never read');
  assert.ok(/var\(--grass\)/.test(rules), 'the drive chart has no ground');
});

test('every rule is scoped, and no team color is written at :root', () => {
  const rules = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of rules.matchAll(/(^|\})\s*([^{}@]+)\{/g)) {
    const sel = m[2].trim();
    if (!sel || sel.startsWith('@') || sel.startsWith('from') || sel.startsWith('to')) continue;
    for (const one of sel.split(',')) {
      assert.ok(one.trim().startsWith('.scr-l5-game'), `unscoped selector: ${one.trim()}`);
    }
  }
  assert.equal(/:root/.test(rules), false, 'a screen wrote at :root');
  assert.equal(/--team-a\s*:/.test(rules), false, 'a team color is being assigned in CSS');
});

test('no dependency, no mark, no ESPN image, and every figure is tabular', () => {
  const body = SCREEN_SRC;
  /* The declared bar IS a .PNG path and is the one legitimate one, so it is
   * removed before the check rather than the check being weakened. */
  const noBar = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^export const bar =.*$/m, '');
  assert.equal(/espncdn|\.png|logo/i.test(noBar), false, 'a logo or an ESPN CDN URL');
  assert.equal(/\bimport\s+[^;]*from\s+'(?!\/)/.test(body), false, 'a bare package import');
  assert.equal(/fetch\(/.test(body.replace(/\/\*[\s\S]*?\*\//g, '')), false,
    'a screen that fetches fails its piece');
  assert.equal(/credits|top-up|coins/i.test(body.replace(/\/\*[\s\S]*?\*\//g, '')), false,
    'the balance is Marbles');
  /* Every element that carries a number carries .num. */
  const numbered = ['l5-score-num', 'l5-wp-now', 'l5-moment-m', 'l5-h2h-va', 'l5-h2h-vb',
    'l5-stat-v', 'l5-pre-v', 'l5-leader-line', 'l5-drive-r', 'l5-who-verdict'];
  for (const cls of numbered) {
    const re = new RegExp(`'[^']*${cls}[^']*'`, 'g');
    const hits = [...body.matchAll(re)].map((m) => m[0]);
    assert.ok(hits.length, `${cls} is never created`);
    assert.ok(hits.some((h) => /\bnum\b/.test(h)), `${cls} is a figure without tabular-nums`);
  }
});

const { teamVars } = await import(
  pathToFileURL(path.join(REPO, 'public/components/team-chip.js')).href);

test('team color survives navy, yellow and null — and an identical pair', () => {
  const navy = TEAMS[BOIS];                     // 0033a0 — the real navy in the corpus
  const yellow = Object.values(TEAMS).find((t) => t.primary
    && /^(f{2}|e[a-f])/i.test(t.primary) && /^[a-f0-9]{6}$/i.test(t.primary)
    && parseInt(t.primary.slice(2, 4), 16) > 0xb0 && parseInt(t.primary.slice(4), 16) < 0x60);
  const none = Object.values(TEAMS).find((t) => !t.primary);
  assert.equal(teamVars(navy).vars['--team-a'], '#0033a0');
  assert.ok(yellow, 'no yellow-primary team in the real file');
  assert.equal(teamVars(yellow).vars['--team-a'], '#' + yellow.primary.toLowerCase());
  assert.equal(teamVars(none).vars['--team-a'], 'var(--team-null)');
  console.log(`    navy ${navy.abbrev} #${navy.primary} · yellow ${yellow.abbrev} #${yellow.primary} · null ${none.abbrev}`);

  /* The real identical pair: Ohio State and Ball State are both ba0c2f. */
  assert.equal(TEAMS['194'].primary.toLowerCase(), TEAMS['2050'].primary.toLowerCase());
  const v = L5.buildGameView(load('real-ball-at-osu'), { teamsById: TEAMS, followTeamId: '2050' });
  assert.ok(v.home && v.away, 'the clash game does not resolve both teams');
});


/* ------------------------------------------------------------------ *
 * A screen that does not PARSE is a blank page, and no unit test sees it
 * ------------------------------------------------------------------ */

test('🔴 every screen module parses — a blank page no unit test can see', async () => {
  /* What this caught, 2026-09-08: a CSS comment written inside the live screen's
   * CSS template literal quoted a property name in backticks. The first one
   * ENDED the string. Nothing 404ed, nothing logged, nothing the app surfaced
   * threw - the screen simply did not render, and the nav around it looked
   * perfectly healthy.
   *
   * Every other test in this repo imports the pure modules. Not one imports a
   * screen, because screens need a DOM - so 547 passing tests said nothing at
   * all about a screen that could not be parsed. The cheapest possible check for
   * the most expensive possible failure.
   *
   * `node --check` on a .mjs copy is a PARSE WITHOUT AN EXECUTE: it reads the
   * module exactly as the browser's parser does, needs no DOM, and runs none of
   * the code. The copy exists only so the extension says ESM. */
  const { readdirSync, copyFileSync, mkdtempSync } = await import('node:fs');
  const { execFileSync } = await import('node:child_process');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');

  const dir = new URL('../public/screens/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.screen.js'));
  assert.ok(files.length >= 10, 'the screens are where we think they are');

  const tmp = mkdtempSync(join(tmpdir(), 'ag-parse-'));
  for (const f of files) {
    const to = join(tmp, f.replace('.js', '.mjs'));
    copyFileSync(new URL(f, dir), to);
    try {
      execFileSync(process.execPath, ['--check', to], { stdio: 'pipe' });
    } catch (e) {
      assert.fail(f + ' does not parse: ' + String(e.stderr || e).split('\n').slice(0, 3).join(' '));
    }
  }
  console.log('    ' + files.length + ' screen modules parse');
});
