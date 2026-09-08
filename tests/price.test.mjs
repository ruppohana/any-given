/**
 * price.test.mjs — the pricer, judged against the reference implementation.
 *
 * §1 of the contract allows a module to close against exactly one thing: **the reference
 * implementation's output on the same input.** So this file does not assert that the pricer
 * returns numbers that look right. It pulls real pre-snap situations out of the three captured
 * fixtures, prices every one of them in JS against the real 22 MB trained model, runs
 * `ncaalive.tendency.TendencyModel.predict()` over the identical situations in Python, and
 * diffs them key for key.
 *
 * **No fixture is written here.** The contexts are read out of `fixtures/real-*-260905-final.json`
 * — files this agent did not write and did not touch. The only thing that goes to disk is an
 * intermediate handoff in the OS temp directory so Python can read what JS extracted, and it is
 * deleted afterwards.
 *
 * The reference payout formula is not restated either — it is lifted at run time out of
 * `sports-live/ncaalive/server.py` and evaluated, so a change on that side shows up here as a
 * failure rather than as a comment that has quietly gone stale.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  contextOf,
  probeKeys,
  keyFor,
  resolve,
  round3,
  confidenceOf,
  payoutPerMarble,
  payoutFor,
  priceSnapSync,
  priceSnap,
  fromCounts,
  distanceBucket,
  fieldBucket,
  scoreBucket,
  clockBucket,
  PAYOUT_CAP,
  DEFAULT_MIN_SAMPLES,
} from '../src/lib/price.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const FIXTURES = path.join(REPO, 'fixtures');
const REFERENCE = 'C:\\Claude\\Knowledge\\sports-live';
const MODEL_PATH = path.join(REFERENCE, 'tendency.json');
const SERVER_PY = path.join(REFERENCE, 'ncaalive', 'server.py');

const FIXTURE_FILES = [
  'real-utep-at-ou-260905-final.json',
  'real-ball-at-osu-260905-final.json',
  'real-bois-at-ore-260905-final.json',
];

// ---------------------------------------------------------------------------
// Pull real PRE-SNAP situations out of a captured game
// ---------------------------------------------------------------------------

function clockSeconds(display) {
  if (typeof display !== 'string') return null;
  const m = /^(\d+):(\d{1,2})$/.exec(display.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Every snap in the game, described by the state that existed BEFORE it.
 *
 * `start.down`, `start.distance` and `start.yardsToEndzone` are pre-snap by definition — they
 * are where the ball was when it was snapped. The clock and the score are taken from the
 * PREVIOUS play, because a play's own `clock` and score are what they became after it ran.
 * A pricer that read this play's own score would be reading the future.
 */
function situationsFrom(file) {
  const doc = JSON.parse(fs.readFileSync(path.join(FIXTURES, file), 'utf-8'));
  const competitors = doc?.header?.competitions?.[0]?.competitors ?? [];
  const homeId = competitors.find((c) => c.homeAway === 'home')?.id ?? null;

  const flat = [];
  for (const drive of doc?.drives?.previous ?? []) {
    const team = drive?.team ?? {};
    for (const play of drive?.plays ?? []) flat.push({ play, offenseId: team.id ?? null, offense: team.shortDisplayName ?? null });
  }

  const out = [];
  for (let i = 1; i < flat.length; i++) {
    const { play, offenseId, offense } = flat[i];
    const prev = flat[i - 1].play;
    const start = play?.start ?? {};
    const down = start.down;
    if (!(down >= 1 && down <= 4)) continue; // not a scrimmage down; nothing to price

    const homeScore = prev.homeScore ?? 0;
    const awayScore = prev.awayScore ?? 0;
    const isHome = offenseId != null && String(offenseId) === String(homeId);
    const scoreDiff = isHome ? homeScore - awayScore : awayScore - homeScore;

    out.push({
      game: file,
      snapId: String(play.id),
      team: offense,
      down,
      distance: start.distance ?? null,
      yardsToGoal: start.yardsToEndzone ?? null,
      scoreDiff,
      period: play?.period?.number ?? null,
      secondsLeft: clockSeconds(prev?.clock?.displayValue),
      closesAt: 1757030000000,
    });
  }
  return out;
}

function allSituations() {
  return FIXTURE_FILES.flatMap(situationsFrom);
}

// ---------------------------------------------------------------------------
// The reference: the trained model, and Python's own predict()
// ---------------------------------------------------------------------------

const haveModel = fs.existsSync(MODEL_PATH);
const haveServer = fs.existsSync(SERVER_PY);

let MODEL = null;
function model() {
  if (!MODEL) MODEL = JSON.parse(fs.readFileSync(MODEL_PATH, 'utf-8'));
  return MODEL;
}

function pythonPredictions(situations) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anygiven-price-'));
  const inp = path.join(dir, 'situations.json');
  const outp = path.join(dir, 'predictions.json');
  const script = path.join(dir, 'drive.py');
  fs.writeFileSync(inp, JSON.stringify(situations), 'utf-8');
  fs.writeFileSync(
    script,
    [
      'import json, os, sys',
      `ROOT = ${JSON.stringify(REFERENCE)}`,
      'sys.path.insert(0, ROOT)',
      'from ncaalive.tendency import TendencyModel',
      'm = TendencyModel.load(os.path.join(ROOT, "tendency.json"))',
      `rows = json.load(open(${JSON.stringify(inp)}, encoding="utf-8"))`,
      'out = []',
      'for r in rows:',
      '    p = m.predict(r["team"] if r["team"] else "ALL", down=r["down"],',
      '                  distance=r["distance"], yards_to_goal=r["yardsToGoal"],',
      '                  score_diff=r["scoreDiff"], period=r["period"],',
      '                  seconds_left=r["secondsLeft"])',
      '    out.append(p)',
      `json.dump(out, open(${JSON.stringify(outp)}, "w", encoding="utf-8"))`,
      'print("ok", len(out))',
    ].join('\n'),
    'utf-8',
  );
  const stdout = execFileSync('python', [script], {
    cwd: REFERENCE,
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const preds = JSON.parse(fs.readFileSync(outp, 'utf-8'));
  fs.rmSync(dir, { recursive: true, force: true });
  return { preds, stdout: stdout.trim() };
}

/** The reference payout function, lifted verbatim out of server.py rather than restated. */
function referencePayout() {
  const src = fs.readFileSync(SERVER_PY, 'utf-8');
  const m = /function payout\(stake, ?p\)\{[\s\S]*?\n\}/.exec(src);
  assert.ok(m, 'payout() not found in server.py — the reference moved');
  return new Function(`${m[0]}; return payout;`)();
}

// ---------------------------------------------------------------------------
// 1 · Buckets and back-off — the port, against the reference's own test values
// ---------------------------------------------------------------------------

test('buckets match tendency.py, including the unknown state', () => {
  assert.equal(distanceBucket(2), 'short');
  assert.equal(distanceBucket(7), 'mid');
  assert.equal(distanceBucket(10), 'long');
  assert.equal(distanceBucket(18), 'verylong');
  assert.equal(fieldBucket(5), 'goalline');
  assert.equal(fieldBucket(18), 'redzone');
  assert.equal(fieldBucket(95), 'pinned');
  assert.equal(scoreBucket(-21), 'down3+');
  assert.equal(scoreBucket(0), 'even');
  assert.equal(scoreBucket(21), 'up3+');
  assert.equal(clockBucket(4, 90), 'q4late');
  assert.equal(clockBucket(4, 400), 'q4');
  assert.equal(clockBucket(1, 60), 'q1');
  assert.equal(distanceBucket(null), '?');
  assert.equal(fieldBucket('x'), '?');
  assert.equal(scoreBucket(null), '?');
});

test('a key is built exactly as _key() builds it', () => {
  const ctx = contextOf(3, 4, 44, -3, 3, 252);
  assert.equal(keyFor('Oklahoma', 'full', ctx), 'Oklahoma|full|3|mid|front|even|q3');
  assert.equal(keyFor('Oklahoma', 'global', ctx), 'Oklahoma|global');
  const keys = probeKeys('Oklahoma', ctx);
  assert.equal(keys.length, 12);
  assert.equal(keys[0], 'Oklahoma|full|3|mid|front|even|q3');
  assert.equal(keys[6], 'ALL|full|3|mid|front|even|q3');
});

test('down 0 buckets as unknown, the way `_int(down) or "?"` does', () => {
  assert.equal(contextOf(0, 10, 50, 0, 1, 600).down, '?');
  assert.equal(contextOf(null, 10, 50, 0, 1, 600).down, '?');
  assert.equal(contextOf(3, 10, 50, 0, 1, 600).down, '3');
});

test('thin rows back off rather than answering', () => {
  const ctx = contextOf(1, 10, 60, 0, 1, 600);
  const rows = new Array(12).fill(null);
  rows[0] = { run: 5, pass: 5 }; // team|full — under min_samples
  rows[4] = { run: 60, pass: 40 }; // team|down
  const p = resolve('ASU', ctx, rows, DEFAULT_MIN_SAMPLES);
  assert.equal(p.level, 'down');
  assert.equal(p.samples, 100);
  assert.equal(p.run, 0.6);
});

test('nothing known returns null rather than a coin flip', () => {
  const ctx = contextOf(3, 7, 50, 0, 2, 300);
  assert.equal(resolve('ASU', ctx, new Array(12).fill(null)), null);
  assert.equal(
    priceSnapSync(
      { snapId: 's', team: 'ASU', down: 3, distance: 7, closesAt: 0 },
      fromCounts({}),
    ),
    null,
  );
});

test('an unknown team falls back to the league and says so', () => {
  const ctx = contextOf(1, 10, 60, 0, 1, 600);
  const rows = new Array(12).fill(null);
  rows[6] = { run: 60, pass: 40 }; // ALL|full
  const p = resolve('Nobody', ctx, rows);
  assert.equal(p.basis, 'league');
  assert.equal(p.level, 'full');
});

// ---------------------------------------------------------------------------
// 2 · Rounding — where a naive port silently changes the price
// ---------------------------------------------------------------------------

test('round3 is Python round(x, 3): ties to even, not away from zero', () => {
  assert.equal(round3(2 / 32), 0.062); // 0.0625 exactly. Math.round gives 0.063
  assert.equal(round3(6 / 32), 0.188); // 0.1875 exactly -> up, to even
  assert.equal(round3(1 / 3), 0.333);
  assert.equal(round3(2 / 3), 0.667);
  assert.equal(round3(0), 0);
  assert.equal(round3(1), 1);
  assert.notEqual(round3(2 / 32), Math.round((2 / 32) * 1000) / 1000);
});

// ---------------------------------------------------------------------------
// 3 · The rules that are not this module's to change
// ---------------------------------------------------------------------------

test('payout is stake / p, capped at 6x', () => {
  assert.equal(payoutFor(10, 0.5), 20);
  assert.equal(payoutFor(10, 0.25), 40);
  assert.equal(payoutFor(10, 0.1), 60); // 100 uncapped
  assert.equal(payoutFor(10, 0.03), 60); // 333 uncapped
  assert.equal(payoutFor(25, 0.02), 150);
  assert.equal(payoutPerMarble(0.5), 2);
  assert.equal(payoutPerMarble(0.1), PAYOUT_CAP);
  assert.equal(payoutPerMarble(1), 1);
});

test('the cap is on the multiple, never on the stake', () => {
  for (const stake of [5, 10, 25]) {
    assert.equal(payoutFor(stake, 0.001), stake * PAYOUT_CAP);
    assert.ok(payoutFor(stake, 0.9) < stake * PAYOUT_CAP);
  }
});

test('confidence is three fixed steps and lo is a defined answer', () => {
  const ctx = contextOf(1, 10, 60, 0, 1, 600);
  const at = (i, row) => {
    const rows = new Array(12).fill(null);
    rows[i] = row;
    return confidenceOf(resolve('ASU', ctx, rows));
  };
  assert.equal(at(0, { run: 90, pass: 90 }), 'hi'); // full, 180 >= 90
  assert.equal(at(0, { run: 20, pass: 20 }), 'mid'); // full, 40 < 90
  assert.equal(at(3, { run: 500, pass: 500 }), 'mid'); // no_field is never confident
  assert.equal(at(4, { run: 5000, pass: 5000 }), 'lo'); // down alone is broad
  assert.equal(at(5, { run: 400000, pass: 300000 }), 'lo'); // global is broad
  const steps = new Set(['hi', 'mid', 'lo']);
  assert.equal(steps.size, 3);
});

test('the offer carries the price BEFORE the tap — no play is read', () => {
  const rows = new Array(12).fill(null);
  rows[0] = { run: 70, pass: 30 };
  const priced = priceSnapSync(
    {
      snapId: 'snap-1',
      team: 'Oklahoma',
      down: 1,
      distance: 10,
      yardsToGoal: 60,
      scoreDiff: 0,
      period: 1,
      secondsLeft: 600,
      closesAt: 1757030000000,
    },
    { minSamples: 30, get: () => rows },
  );
  assert.equal(priced.offers.length, 2);
  assert.deepEqual(
    priced.offers.map((o) => o.side),
    ['run', 'pass'],
  );
  for (const o of priced.offers) {
    assert.equal(o.snapId, 'snap-1');
    assert.equal(o.closesAt, 1757030000000);
    assert.ok(o.p > 0 && o.p <= 1);
    assert.ok(o.payoutPerMarble > 0 && o.payoutPerMarble <= PAYOUT_CAP);
    assert.ok(['hi', 'mid', 'lo'].includes(o.confidence));
  }
  assert.equal(priced.offers[0].p, 0.7);
  assert.equal(priced.offers[1].p, 0.3);
});

test('an async source and a sync source give the same price', async () => {
  const rows = new Array(12).fill(null);
  rows[1] = { run: 44, pass: 56 };
  const input = {
    snapId: 'snap-2',
    team: 'Oregon',
    down: 2,
    distance: 6,
    yardsToGoal: 44,
    scoreDiff: 4,
    period: 3,
    secondsLeft: 252,
    closesAt: 1,
  };
  const sync = priceSnapSync(input, { get: () => rows });
  const async_ = await priceSnap(input, { get: async () => rows });
  assert.deepEqual(async_, sync);
});

test('a D1-shaped source is asked for all twelve keys in one call', async () => {
  let calls = 0;
  let asked = null;
  const source = {
    minSamples: 30,
    async get(keys) {
      calls++;
      asked = keys;
      return keys.map((k) => (k.startsWith('Oklahoma|no_score') ? { run: 61, pass: 39 } : null));
    },
  };
  const priced = await priceSnap(
    { snapId: 's', team: 'Oklahoma', down: 3, distance: 2, yardsToGoal: 15, scoreDiff: 0, period: 2, secondsLeft: 90, closesAt: 0 },
    source,
  );
  assert.equal(calls, 1, 'one round trip, not one per level');
  assert.equal(asked.length, 12);
  assert.equal(priced.model.level, 'no_score');
  assert.equal(priced.offers[0].p, 0.61);
});

// ---------------------------------------------------------------------------
// 4 · THE CLOSE — real fixture contexts, priced, diffed against Python
// ---------------------------------------------------------------------------

test('the fixtures yield real pre-snap situations', () => {
  const sits = allSituations();
  assert.ok(sits.length > 200, `only ${sits.length} situations`);
  for (const s of sits.slice(0, 25)) {
    assert.ok(s.down >= 1 && s.down <= 4);
    assert.equal(typeof s.snapId, 'string');
  }
  const perGame = FIXTURE_FILES.map((f) => `${f}: ${sits.filter((s) => s.game === f).length}`);
  console.log(`\n  situations extracted -> ${perGame.join(' | ')}  (total ${sits.length})`);
});

test('every real situation prices identically to the Python reference', { skip: !haveModel ? `no model at ${MODEL_PATH}` : false }, () => {
  const sits = allSituations();
  const counts = model().counts;
  const minSamples = model().min_samples ?? DEFAULT_MIN_SAMPLES;
  const source = fromCounts(counts, minSamples);

  const mine = sits.map((s) => ({ s, priced: priceSnapSync(s, source) }));
  const { preds, stdout } = pythonPredictions(sits);
  assert.equal(preds.length, sits.length, 'python returned a different number of rows');

  let exact = 0;
  let nulls = 0;
  let worst = { d: 0, key: null };
  const mismatches = [];

  for (let i = 0; i < sits.length; i++) {
    const s = sits[i];
    const got = mine[i].priced;
    const want = preds[i];
    const ctx = contextOf(s.down, s.distance, s.yardsToGoal, s.scoreDiff, s.period, s.secondsLeft);

    if (want === null) {
      nulls++;
      if (got !== null) mismatches.push(`${s.snapId}: python null, js priced`);
      continue;
    }
    assert.ok(got, `${s.snapId}: python priced, js returned null`);

    const answering = want.basis === 'league' ? 'ALL' : s.team || 'ALL';
    const key = keyFor(answering, want.level, ctx);
    const dRun = Math.abs(got.offers[0].p - want.run);
    const dPass = Math.abs(got.offers[1].p - want.pass);
    const d = Math.max(dRun, dPass);
    if (d > worst.d) worst = { d, key, js: [got.offers[0].p, got.offers[1].p], py: [want.run, want.pass] };

    const same =
      got.offers[0].p === want.run &&
      got.offers[1].p === want.pass &&
      got.model.samples === want.samples &&
      got.model.level === want.level &&
      got.model.basis === want.basis &&
      got.model.confident === want.confident;
    if (same) exact++;
    else if (mismatches.length < 10)
      mismatches.push(
        `${key}  js{p=${got.offers[0].p}/${got.offers[1].p} n=${got.model.samples} ${got.model.level}/${got.model.basis}} ` +
          `py{p=${want.run}/${want.pass} n=${want.samples} ${want.level}/${want.basis}}`,
      );
  }

  // -- the numbers this piece is being asked for --
  const priced = mine.filter((m) => m.priced).map((m) => m.priced);
  const offers = priced.flatMap((p) => p.offers);
  const capped = offers.filter((o) => o.payoutPerMarble === PAYOUT_CAP).length;
  const zeroP = offers.filter((o) => o.p === 0).length;
  const steps = { hi: 0, mid: 0, lo: 0 };
  for (const p of priced) steps[p.offers[0].confidence]++;
  const levels = {};
  const bases = {};
  const leagueTeams = {};
  for (let i = 0; i < sits.length; i++) {
    const p = mine[i].priced;
    if (!p) continue;
    levels[p.model.level] = (levels[p.model.level] || 0) + 1;
    bases[p.model.basis] = (bases[p.model.basis] || 0) + 1;
    if (p.model.basis === 'league')
      leagueTeams[sits[i].team] = (leagueTeams[sits[i].team] || 0) + 1;
  }
  // The hardest price in the set — the one the cap is actually protecting against.
  let longest = { p: 2, key: null, samples: 0 };
  for (let i = 0; i < sits.length; i++) {
    const pr = mine[i].priced;
    if (!pr) continue;
    for (const o of pr.offers)
      if (o.p < longest.p)
        longest = {
          p: o.p,
          side: o.side,
          key: keyFor(
            pr.model.basis === 'league' ? 'ALL' : sits[i].team || 'ALL',
            pr.model.level,
            pr.model.context,
          ),
          samples: pr.model.samples,
          payout25: payoutFor(25, o.p),
          uncapped25: Math.round(25 / o.p),
        };
  }

  console.log(`\n  python driver: ${stdout}`);
  console.log(`  contexts priced          ${priced.length} / ${sits.length}   (python null: ${nulls})`);
  console.log(`  matched reference exactly ${exact} / ${sits.length - nulls}`);
  console.log(`  largest divergence        ${worst.d}  ${worst.key ?? '-'}`);
  console.log(`  6x cap binds              ${capped} / ${offers.length} offers   (p === 0: ${zeroP})`);
  console.log(`  confidence                hi ${steps.hi} | mid ${steps.mid} | lo ${steps.lo}`);
  console.log(`  level answered            ${JSON.stringify(levels)}`);
  console.log(`  basis                     ${JSON.stringify(bases)}`);
  console.log(`  league fallback by team   ${JSON.stringify(leagueTeams)}`);
  console.log(
    `  longest price in the set  p=${longest.p} ${longest.side} on ${longest.samples} plays ` +
      `-> 25 Marbles pays ${longest.payout25}, uncapped ${longest.uncapped25}   ${longest.key}`,
  );
  if (mismatches.length) console.log(`  MISMATCHES:\n    ${mismatches.join('\n    ')}`);

  assert.equal(mismatches.length, 0, 'the pricer disagrees with the reference');
  assert.equal(exact, sits.length - nulls);
  assert.equal(worst.d, 0);
});

test('the payout matches the reference payout() lifted out of server.py', { skip: !haveServer ? `no server.py at ${SERVER_PY}` : false }, () => {
  const ref = referencePayout();
  let checked = 0;
  const sits = haveModel ? allSituations() : [];
  const source = haveModel ? fromCounts(model().counts, model().min_samples) : null;
  const ps = new Set();
  for (const s of sits) {
    const priced = source ? priceSnapSync(s, source) : null;
    if (priced) for (const o of priced.offers) ps.add(o.p);
  }
  for (let i = 1; i <= 999; i++) ps.add(i / 1000);
  for (const p of ps) {
    if (p <= 0) continue;
    for (const stake of [5, 10, 25]) {
      assert.equal(payoutFor(stake, p), ref(stake, p), `payout(${stake}, ${p})`);
      checked++;
    }
  }
  assert.equal(payoutFor(10, null), ref(10, null), 'the no-locked-price path');
  console.log(`\n  payout checked against server.py on ${checked} (stake, p) pairs`);
});
