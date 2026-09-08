/**
 * winprob.test.mjs — src/lib/winprob.ts
 *
 * Rule zero: a piece is done when it RAN. This suite closes against two things
 * that exist outside the model and neither was written here:
 *
 *   1. The three REAL captured fixtures in fixtures/, including ESPN's own
 *      `winprobability` array — a real captured series.
 *   2. The REFERENCE IMPLEMENTATION's output on the same three files, produced
 *      by actually running `ncaalive/espn.py` in Python and diffing.
 *
 * The reference lives at ../sports-live (sibling of this repo, as CONTRACT §0
 * names it). If it is not on disk, the reference-diff tests FAIL rather than
 * skip — a run with no reference is not a close.
 *
 * NO FIXTURE IS WRITTEN OR MODIFIED ANYWHERE IN THIS FILE.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CENTER,
  buildWinProbChart,
  extractWinProbability,
  orientSeries,
  resolveFlip,
  winProbabilitySeries,
} from '../src/lib/winprob.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const FIX = path.join(REPO, 'fixtures');
const REFERENCE = path.resolve(REPO, '..', 'sports-live');

const FIXTURES = [
  'real-utep-at-ou-260905-final.json',
  'real-ball-at-osu-260905-final.json',
  'real-bois-at-ore-260905-final.json',
];

const load = (name) => JSON.parse(readFileSync(path.join(FIX, name), 'utf8'));

// ─────────────────────────────────────────────── the reference, actually run ──

/**
 * Run the Python reference on the three fixtures and return its output.
 *
 * This shells out to a real interpreter and imports the real `ncaalive.espn`.
 * Nothing here is a re-implementation of it.
 */
function runReference() {
  assert.ok(
    existsSync(path.join(REFERENCE, 'ncaalive', 'espn.py')),
    `The reference implementation is not on disk at ${REFERENCE}. ` +
      `CONTRACT §0 names it; without it this piece cannot close.`,
  );

  const script = `
import json, sys
sys.path.insert(0, r"${REFERENCE}")
from ncaalive.espn import extract_win_probability, win_probability_series
out = {}
for n in ${JSON.stringify(FIXTURES)}:
    with open(r"${FIX}" + "\\\\" + n, encoding="utf-8") as f:
        s = json.load(f)
    out[n] = {"series": win_probability_series(s),
              "current": extract_win_probability(s)}
sys.stdout.write(json.dumps(out))
`;

  const py = ['python', 'python3', 'py'];
  let lastErr = null;
  for (const bin of py) {
    try {
      const raw = execFileSync(bin, ['-c', script], {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      });
      return JSON.parse(raw);
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`Could not run the Python reference (${py.join(', ')}): ${lastErr?.message}`);
}

let REF = null;
const reference = () => (REF ??= runReference());

// ──────────────────────────────────────────────── 1 · vs the REFERENCE output ──

test('reference diff — the series matches ncaalive/espn.py on all three real fixtures', () => {
  const ref = reference();
  const report = [];

  for (const name of FIXTURES) {
    const mine = winProbabilitySeries(load(name));
    const theirs = ref[name].series;

    assert.equal(mine.length, theirs.length, `${name}: point count`);

    let maxDiv = 0;
    let worst = null;
    for (let i = 0; i < mine.length; i++) {
      assert.equal(mine[i].playId, theirs[i].play_id, `${name}[${i}]: play_id`);
      const d = Math.abs(mine[i].homePct - theirs[i].home_pct);
      if (d > maxDiv) {
        maxDiv = d;
        worst = { i, playId: mine[i].playId, mine: mine[i].homePct, theirs: theirs[i].home_pct };
      }
    }
    assert.equal(maxDiv, 0, `${name}: max |divergence| from reference — worst ${JSON.stringify(worst)}`);
    report.push(`  ${name}: ${mine.length} points, max |div| = ${maxDiv}`);
  }
  console.log('reference series diff:\n' + report.join('\n'));
});

test('reference diff — extractWinProbability matches ncaalive/espn.py', () => {
  const ref = reference();
  for (const name of FIXTURES) {
    const mine = extractWinProbability(load(name));
    const theirs = ref[name].current;
    assert.equal(mine.homePct, theirs.home_pct, `${name}: home_pct`);
    assert.equal(mine.playId, theirs.play_id, `${name}: play_id`);
    assert.equal(mine.secondsLeft, theirs.seconds_left, `${name}: seconds_left`);
    assert.equal(mine.source, theirs.source, `${name}: source`);
    assert.equal(mine.samples, theirs.samples, `${name}: samples`);
  }
});

// ───────────────────────────────────── 2 · vs ESPN's own captured wp array ──

test("captured feed — every point equals ESPN's own winprobability row, in order", () => {
  for (const name of FIXTURES) {
    const raw = load(name);
    const espn = raw.winprobability;
    const points = buildWinProbChart(raw).points;

    assert.equal(points.length, espn.length, `${name}: length vs ESPN`);
    let maxDiv = 0;
    for (let i = 0; i < espn.length; i++) {
      assert.equal(points[i].playId, String(espn[i].playId), `${name}[${i}]: playId order`);
      maxDiv = Math.max(maxDiv, Math.abs(points[i].pct - espn[i].homeWinPercentage));
    }
    assert.equal(maxDiv, 0, `${name}: max |div| from ESPN's captured array`);
  }
});

test('captured feed — the play join lands on every row but the pregame one', () => {
  for (const name of FIXTURES) {
    const points = buildWinProbChart(load(name)).points;
    const unjoined = points.filter((p) => !p.joined);
    assert.equal(unjoined.length, 1, `${name}: expected exactly the pregame row unjoined`);
    assert.equal(unjoined[0].index, 0, `${name}: the unjoined row is index 0`);
    for (const p of points.slice(1)) {
      assert.ok(p.period !== null && p.clock !== null, `${name}[${p.index}]: period + clock`);
      assert.ok(typeof p.text === 'string' && p.text.length > 0, `${name}[${p.index}]: play text`);
    }
  }
});

test('captured feed — 2026 rows carry no secondsLeft, so it is derived and labeled', () => {
  for (const name of FIXTURES) {
    const raw = load(name);
    assert.ok(
      raw.winprobability.every((r) => r.secondsLeft === undefined),
      `${name}: fixture unexpectedly has secondsLeft — this test's premise is stale`,
    );
    const points = buildWinProbChart(raw).points;
    assert.ok(points.every((p) => p.secondsLeftSource !== 'feed'));
    const derived = points.filter((p) => p.secondsLeftSource === 'derived');
    assert.ok(derived.length > 100, `${name}: expected most rows derived, got ${derived.length}`);
    // Overtime and the unjoined pregame row are the only nulls, and never a guess.
    for (const p of points) {
      if (p.secondsLeft === null) continue;
      assert.ok(p.period >= 1 && p.period <= 4, `${name}[${p.index}]: derived only in regulation`);
      assert.ok(p.secondsLeft >= 0 && p.secondsLeft <= 3600);
    }
  }
});

// ───────────────────────────────── 3 · 7.6 — orientation is applied ONCE ──

test('7.6 — the source applies a flip in exactly one place', () => {
  const src = readFileSync(path.join(REPO, 'src', 'lib', 'winprob.ts'), 'utf8');
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
    .replace(/^\s*\/\/.*$/gm, '');      // line comments

  const flips = code.split('\n').filter((l) => /\b1 - \w/.test(l));
  assert.equal(
    flips.length,
    1,
    `orientation must be applied once; found ${flips.length}:\n${flips.join('\n')}`,
  );
  assert.match(flips[0], /flipped \? 1 - s\.homePct/);
});

test('7.6 — one center line, and every offset in the object is against it', () => {
  const raw = load('real-bois-at-ore-260905-final.json');
  const chart = buildWinProbChart(raw, {
    teamId: '68', // BOIS, the away team — the flipped case
    calls: [{ snapId: raw.winprobability[149].playId, side: 'pass', stake: 10, p: 0.42, landed: false, delta: -10 }],
  });

  assert.equal(chart.center, CENTER);
  for (const p of chart.points) assert.equal(p.offset, p.pct - chart.center);
  for (const m of chart.markers) assert.equal(m.offset, m.pct - chart.center);
  assert.equal(chart.summary.offset, chart.summary.pct - chart.center);
});

test('7.6 — the summary bar and the points cannot disagree about orientation', () => {
  // The recorded bug: the summary was pre-oriented, the parts were not, so the
  // bar pointed at the opponent while the sentence named your team.
  const raw = load('real-bois-at-ore-260905-final.json');
  const home = buildWinProbChart(raw, { teamId: '2483' }); // ORE won 34-27
  const away = buildWinProbChart(raw, { teamId: '68' });   // BOIS lost

  assert.equal(home.orientation.flipped, false);
  assert.equal(away.orientation.flipped, true);

  // The winner's summary leads; the loser's does not. Same object, same frame.
  assert.equal(home.summary.leading, true);
  assert.equal(away.summary.leading, false);
  assert.equal(home.summary.pct, home.points.at(-1).pct);
  assert.equal(away.summary.pct, away.points.at(-1).pct);
  assert.ok(Math.abs(home.summary.pct + away.summary.pct - 1) < 1e-12);

  // The biggest swing flips sign with everything else, not on its own.
  assert.ok(Math.abs(home.summary.biggestSwing.delta + away.summary.biggestSwing.delta) < 1e-12);
  assert.equal(home.summary.biggestSwing.index, away.summary.biggestSwing.index);
});

test('7.6 — flipping twice is the identity, on real data', () => {
  const samples = winProbabilitySeries(load('real-ball-at-osu-260905-final.json'));
  const twice = orientSeries(orientSeries(samples, true).map((p) => ({ ...p, homePct: p.pct })), true);
  for (let i = 0; i < samples.length; i++) {
    assert.ok(Math.abs(twice[i].pct - samples[i].homePct) < 1e-12, `index ${i}`);
  }
});

test('7.6 — an unknown team id falls back to home and says so', () => {
  const chart = buildWinProbChart(load('real-utep-at-ou-260905-final.json'), { teamId: '999999' });
  assert.equal(chart.orientation.flipped, false);
  assert.equal(chart.orientation.teamId, chart.homeTeamId);
  assert.equal(chart.orientation.appliedIn, 'orientSeries');
});

test('7.6 — resolveFlip decides, and is the only decision', () => {
  assert.equal(resolveFlip('68', '2483', '68').flipped, true);
  assert.equal(resolveFlip('2483', '2483', '68').flipped, false);
  assert.equal(resolveFlip(null, '2483', '68').flipped, false);
  assert.equal(resolveFlip(undefined, null, null).teamId, null);
});

// ──────────────────── 4 · 7.8 — the chart carries the user's own calls ──

/** Real play ids from the real fixture. Nothing invented but the calls. */
function callsFrom(raw, spec) {
  return spec.map(([i, landed, side, stake, p, delta]) => ({
    snapId: String(raw.winprobability[i].playId),
    side, stake, p, landed, delta,
    state: landed === null ? 'open' : 'settled',
  }));
}

test('7.8 — landed is filled, missed is hollow, open is open', () => {
  const raw = load('real-bois-at-ore-260905-final.json');
  const chart = buildWinProbChart(raw, {
    teamId: '2483',
    calls: callsFrom(raw, [
      [149, true, 'pass', 10, 0.38, 16],
      [80, false, 'run', 25, 0.55, -25],
      [170, null, 'pass', 5, 0.47, null],
    ]),
  });

  assert.equal(chart.markers.length, 3);
  assert.deepEqual(chart.markers.map((m) => m.fill), ['hollow', 'filled', 'open']);
  assert.deepEqual(chart.markers.map((m) => m.index), [80, 149, 170]);
  assert.equal(chart.unjoinedCalls.length, 0);
});

test('7.8 — a marker sits exactly on its point, so the view joins nothing', () => {
  const raw = load('real-ball-at-osu-260905-final.json');
  const spec = [[17, true, 'pass', 10, 0.4, 15], [100, false, 'run', 5, 0.6, -5]];
  for (const teamId of ['194', '2050', null]) {  // home, away, unset
    const chart = buildWinProbChart(raw, { teamId, calls: callsFrom(raw, spec) });
    assert.equal(chart.markers.length, 2, `teamId ${teamId}`);
    for (const m of chart.markers) {
      const p = chart.points[m.index];
      assert.equal(m.pct, p.pct, 'marker y === point y');
      assert.equal(m.offset, p.offset);
      assert.equal(m.t, p.t);
      assert.equal(m.playId, p.playId);
      assert.equal(m.period, p.period);
      assert.equal(m.clock, p.clock);
    }
  }
});

test('7.8 — markers ride the flip with the line, and the price never does', () => {
  const raw = load('real-bois-at-ore-260905-final.json');
  const calls = callsFrom(raw, [[149, true, 'pass', 10, 0.38, 16]]);
  const home = buildWinProbChart(raw, { teamId: '2483', calls });
  const away = buildWinProbChart(raw, { teamId: '68', calls });

  assert.ok(Math.abs(home.markers[0].pct + away.markers[0].pct - 1) < 1e-12, 'y flips with the line');
  assert.equal(home.markers[0].p, 0.38, 'the call price is not a win probability');
  assert.equal(away.markers[0].p, 0.38);
  assert.equal(home.markers[0].stake, away.markers[0].stake);
});

test('7.8 — a call that joins no play is surfaced, never dropped and never guessed', () => {
  const raw = load('real-utep-at-ou-260905-final.json');
  const chart = buildWinProbChart(raw, {
    calls: [
      { snapId: 'not-a-play-id', side: 'run', stake: 5, p: 0.5, landed: true, delta: 5 },
      ...callsFrom(raw, [[50, true, 'run', 5, 0.5, 5]]),
    ],
  });
  assert.equal(chart.markers.length, 1);
  assert.equal(chart.unjoinedCalls.length, 1);
  assert.equal(chart.unjoinedCalls[0].snapId, 'not-a-play-id');
});

test('7.8 — no calls is a real state, not an empty chart', () => {
  const chart = buildWinProbChart(load('real-utep-at-ou-260905-final.json'));
  assert.equal(chart.markers.length, 0);
  assert.equal(chart.unjoinedCalls.length, 0);
  assert.equal(chart.points.length, 158);
  assert.ok(chart.summary !== null);
});

// ──────────────────────────────────── 5 · 7.7 — why the line moved ──

test('7.7 — key moments come from a supplied event map, never invented', () => {
  const raw = load('real-bois-at-ore-260905-final.json');
  const bigId = String(raw.winprobability[149].playId);
  const chart = buildWinProbChart(raw, {
    teamId: '2483',
    events: { [bigId]: ['big_play', 'touchdown'] },
  });
  assert.equal(chart.keyMoments.length, 1);
  assert.equal(chart.keyMoments[0].playId, bigId);
  assert.equal(chart.keyMoments[0].event, 'touchdown', 'the ranked event, not the first');
  assert.equal(chart.keyMoments[0].wpDelta, chart.points[149].delta);
  assert.ok(chart.keyMoments[0].text.length > 0);

  assert.deepEqual(buildWinProbChart(raw).keyMoments, [], 'no map, no moments');
});

test('7.7 — a small move with an event is not a key moment', () => {
  const raw = load('real-bois-at-ore-260905-final.json');
  const points = buildWinProbChart(raw).points;
  const quiet = points.find((p) => p.delta !== null && Math.abs(p.delta) < 0.01 && p.playId);
  const chart = buildWinProbChart(raw, { events: { [quiet.playId]: ['punt'] } });
  assert.deepEqual(chart.keyMoments, []);
});

// ───────────────────── 6 · the reference's own unit cases, ported ──

const synth = (rows, predictor) => {
  const d = {
    winprobability: rows.map((v, i) => ({
      playId: `p${i}`, homeWinPercentage: v, secondsLeft: 900 - i,
    })),
  };
  if (predictor !== undefined) d.predictor = { homeTeam: { gameProjection: predictor } };
  return d;
};

test('port — the last row is the live number', () => {
  const wp = extractWinProbability(synth([0.5, 0.62, 0.71]));
  assert.equal(wp.homePct, 0.71);
  assert.equal(wp.source, 'live');
  assert.equal(wp.samples, 3);
});

test('port — predictor is the pregame fallback, and live beats it', () => {
  const wp = extractWinProbability({ predictor: { homeTeam: { gameProjection: '82.4' } } });
  assert.ok(Math.abs(wp.homePct - 0.824) < 1e-12);
  assert.equal(wp.source, 'pregame');
  assert.equal(extractWinProbability(synth([0.4], '90')).source, 'live');
});

test('port — missing data is null, not an exception', () => {
  assert.equal(extractWinProbability({}), null);
  assert.equal(extractWinProbability({ winprobability: [] }), null);
  assert.equal(extractWinProbability({ winprobability: [{ playId: 'x' }] }), null);
  assert.equal(extractWinProbability({ winprobability: [{ homeWinPercentage: 'not a number' }] }), null);
  assert.deepEqual(winProbabilitySeries({}), []);
  assert.equal(buildWinProbChart({}).summary, null);
  assert.equal(buildWinProbChart({}).current, null);
});

test('port — the series is oldest first, and a garbage row is skipped', () => {
  const s = winProbabilitySeries(synth([0.5, 0.6, 0.7]));
  assert.deepEqual(s.map((r) => r.homePct), [0.5, 0.6, 0.7]);
  assert.equal(s[0].playId, 'p0');
  assert.deepEqual(s.map((r) => r.t), [0, 0.5, 1]);
  const dirty = winProbabilitySeries({
    winprobability: [{ playId: 'a', homeWinPercentage: 0.4 },
                     { playId: 'b', homeWinPercentage: 'x' },
                     { playId: 'c', homeWinPercentage: 0.6 }],
  });
  assert.deepEqual(dirty.map((r) => r.playId), ['a', 'c']);
  assert.deepEqual(dirty.map((r) => r.index), [0, 1]);
});

test('port — a feed secondsLeft is used and labeled as fed', () => {
  const s = winProbabilitySeries(synth([0.5, 0.6]));
  assert.equal(s[0].secondsLeft, 900);
  assert.equal(s[0].secondsLeftSource, 'feed');
});

// ─────────────────────────────────────── 7 · shape the view depends on ──

test('the chart is one addressable structure — no join left for the view', () => {
  const raw = load('real-bois-at-ore-260905-final.json');
  const chart = buildWinProbChart(raw, { teamId: '68', calls: callsFrom(raw, [[149, false, 'pass', 10, 0.38, -10]]) });
  assert.deepEqual(Object.keys(chart).sort(), [
    'awayAbbrev', 'awayTeamId', 'center', 'current', 'homeAbbrev', 'homeTeamId',
    'keyMoments', 'markers', 'orientation', 'periodBoundaries', 'points',
    'summary', 'unjoinedCalls',
  ]);
  assert.equal(chart.homeAbbrev, 'ORE');
  assert.equal(chart.awayAbbrev, 'BOIS');
  assert.deepEqual(chart.periodBoundaries.map((b) => b.period), [1, 2, 3, 4]);
  assert.ok(chart.periodBoundaries.every((b) => chart.points[b.index].period === b.period));
});

test('every point is in [0,1] and every offset in [-0.5,0.5], both orientations', () => {
  for (const name of FIXTURES) {
    const raw = load(name);
    for (const teamId of [null, String(raw.header.competitions[0].competitors.find((c) => c.homeAway === 'away').id)]) {
      for (const p of buildWinProbChart(raw, { teamId }).points) {
        assert.ok(p.pct >= 0 && p.pct <= 1, `${name}[${p.index}] pct ${p.pct}`);
        assert.ok(p.offset >= -0.5 && p.offset <= 0.5);
      }
    }
  }
});
