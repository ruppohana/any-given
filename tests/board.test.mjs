/**
 * tests/board.test.mjs — the live board, checked against the reference.
 *
 * The close is CONTRACT.md §1: a ledger derived by REPLAYING a real captured
 * fixture, run through `src/lib/board.ts`, then run through
 * `sports-live/ncaalive/board.py` on the same input and diffed.
 *
 * 🔴 No fixture is written here. Every landed/missed outcome in the replay is
 * the actual type of the actual next snap in
 * `fixtures/real-utep-at-ou-260905-final.json`. The only invented things are
 * the five callers' STRATEGIES — which side each would have taken — and those
 * are named in the report as an invention.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

import {
  computeBoard,
  bankFor,
  startFor,
  cleanName,
  field,
  canPlace,
  START_MARBLES,
  REFERRAL_CAP,
  MIN_FIELD_FOR_PLACING,
} from '../src/lib/board.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const FIXTURES = path.join(ROOT, 'fixtures');
const REFERENCE = 'C:\\Claude\\Knowledge\\sports-live';

// ---------------------------------------------------------------------------
// The replay — a ledger built out of a real game
// ---------------------------------------------------------------------------

/** ESPN play type -> the side of a call it settles. Anything else is not a snap. */
const RUN_TYPES = new Set(['Rush', 'Rushing Touchdown']);
const PASS_TYPES = new Set([
  'Pass Reception',
  'Pass Incompletion',
  'Passing Touchdown',
  'Sack',
  'Interception',
  'Pass Interception Return',
]);

function snapsFrom(fixtureName) {
  const raw = JSON.parse(fs.readFileSync(path.join(FIXTURES, fixtureName), 'utf8'));
  const plays = (raw.drives?.previous ?? []).flatMap((d) => d.plays ?? []);
  const out = [];
  for (const p of plays) {
    const t = p?.type?.text ?? '';
    const outcome = RUN_TYPES.has(t) ? 'run' : PASS_TYPES.has(t) ? 'pass' : null;
    if (!outcome) continue;
    out.push({
      snapId: String(p.id),
      outcome,
      down: p?.start?.down ?? null,
      typeText: t,
    });
  }
  return out;
}

/**
 * Five callers, five strategies, one real game.
 *
 * Referrals differ on purpose: Eve opens on 200 Marbles and Ann on 100, which
 * is the case the profit rule exists for.
 */
const CALLERS = [
  { userId: 'u-ann', displayName: 'Ann', referrals: 0, pick: (s, prev) => 'run' },
  { userId: 'u-bo', displayName: 'Bo', referrals: 0, pick: (s, prev) => 'pass' },
  { userId: 'u-cy', displayName: 'Cy', referrals: 1, pick: (s, prev) => prev ?? 'run' },
  {
    userId: 'u-dee',
    displayName: 'Dee',
    referrals: 3,
    pick: (s, prev) => (prev === 'run' ? 'pass' : 'run'),
  },
  {
    userId: 'u-eve',
    displayName: 'Eve',
    referrals: 5,
    pick: (s) => (s.down != null && s.down <= 2 ? 'run' : 'pass'),
  },
];

const STAKES = [5, 10, 25];

/**
 * Build the ledger. The price of each side is the run/pass rate the real game
 * has actually shown so far, so nothing about the money is made up either;
 * payout is `1 / p` capped at 6, per CONTRACT §5.
 *
 * `openTail` leaves the last N snaps' calls unsettled, which is what exercises
 * committed Marbles — money on the table, out of the balance, not yet realized.
 */
function replay(fixtureName, { openTail = 0 } = {}) {
  const snaps = snapsFrom(fixtureName);
  const ledger = [];
  const balance = new Map(CALLERS.map((c) => [c.userId, startFor(c.referrals)]));
  let runsSoFar = 0;
  let prev = null;

  snaps.forEach((snap, i) => {
    const seen = i;
    const pRun = seen === 0 ? 0.5 : Math.min(0.9, Math.max(0.1, runsSoFar / seen));
    const open = i >= snaps.length - openTail;

    CALLERS.forEach((c, ci) => {
      const side = c.pick(snap, prev);
      const stake = STAKES[(i + ci) % STAKES.length];
      const bal = balance.get(c.userId);
      if (stake > bal) return; // the DO's gate: you cannot stake what you do not hold
      const p = side === 'run' ? pRun : 1 - pRun;
      const payoutPerMarble = Math.min(6, 1 / p);

      if (open) {
        balance.set(c.userId, bal - stake);
        ledger.push({
          userId: c.userId,
          snapId: snap.snapId,
          side,
          stake,
          p,
          state: 'open',
          landed: null,
          delta: null,
        });
        return;
      }

      const landed = side === snap.outcome;
      const delta = landed ? Math.round(stake * payoutPerMarble) - stake : -stake;
      balance.set(c.userId, bal + delta);
      ledger.push({
        userId: c.userId,
        snapId: snap.snapId,
        side,
        stake,
        p,
        state: 'settled',
        landed,
        delta,
      });
    });

    runsSoFar += snap.outcome === 'run' ? 1 : 0;
    prev = snap.outcome;
  });

  return { snaps, ledger, members: CALLERS.map(({ pick, ...m }) => m) };
}

// ---------------------------------------------------------------------------
// 1 — the rules that must not be re-earned
// ---------------------------------------------------------------------------

test('everyone starts on the same number, and it is not a setting', () => {
  assert.equal(START_MARBLES, 100);
  assert.equal(startFor(0), 100);
  assert.equal(startFor(2), 140);
  assert.equal(startFor(99), 100 + 20 * REFERRAL_CAP); // 200, capped
});

test('🔴 a referral buys a deeper bench and never a place', () => {
  // Ann made 40 on a bank of 100. Bo made 10 on a bank of 140 and is richer.
  const ledger = [
    settled('u-ann', 's1', 'run', 60, 40),
    settled('u-bo', 's1', 'pass', 60, 10),
  ];
  const rows = computeBoard(
    [
      { userId: 'u-ann', displayName: 'Ann', start: 100 },
      { userId: 'u-bo', displayName: 'Bo', start: 140 },
    ],
    ledger,
  );
  assert.deepEqual(rows.map((r) => r.displayName), ['Ann', 'Bo']);
  assert.equal(rows[0].profit, 40);
  assert.equal(rows[1].profit, 10);
  assert.ok(rows[1].balance > rows[0].balance, 'Bo is richer and still second');
});

test('a loss ranks below a gain however deep the bench', () => {
  const rows = computeBoard(
    [
      { userId: 'u-ann', displayName: 'Ann', start: 100 },
      { userId: 'u-bo', displayName: 'Bo', start: 200 },
    ],
    [settled('u-ann', 's1', 'run', 10, 10), settled('u-bo', 's1', 'pass', 20, -20)],
  );
  assert.deepEqual(rows.map((r) => r.displayName), ['Ann', 'Bo']);
});

test('a tie on profit goes to the fewer calls, then to the name', () => {
  const ledger = [
    settled('u-ann', 's1', 'run', 10, 20),
    settled('u-ann', 's2', 'run', 10, 20),
    settled('u-bo', 's1', 'pass', 10, 40),
    settled('u-cy', 's1', 'run', 10, 40),
  ];
  const rows = computeBoard(
    [
      { userId: 'u-cy', displayName: 'Cy' },
      { userId: 'u-ann', displayName: 'Ann' },
      { userId: 'u-bo', displayName: 'Bo' },
    ],
    ledger,
  );
  // All three made 40. Bo and Cy took one call each; Bo sorts before Cy.
  assert.deepEqual(rows.map((r) => r.displayName), ['Bo', 'Cy', 'Ann']);
  assert.deepEqual(rows.map((r) => r.rank), [1, 2, 3]);
});

test('🔴 nobody is eliminated — a broke player is still a row', () => {
  const rows = computeBoard(
    [
      { userId: 'u-ann', displayName: 'Ann' },
      { userId: 'u-bust', displayName: 'Bust' },
    ],
    [settled('u-ann', 's1', 'run', 10, 5), settled('u-bust', 's1', 'pass', 100, -100)],
  );
  assert.equal(rows.length, 2);
  const bust = rows.find((r) => r.displayName === 'Bust');
  assert.equal(bust.balance, 0);
  assert.equal(bust.profit, -100);
  assert.equal(bust.rank, 2);
});

test('the balance never goes below zero', () => {
  const b = bankFor('u-x', [settled('u-x', 's1', 'run', 500, -500)], 100);
  assert.equal(b.balance, 0);
  assert.equal(b.delta, -100);
});

test('one void path — the stake comes back, the record is untouched, the streak holds', () => {
  const ledger = [
    settled('u-x', 's1', 'run', 10, 30),
    { userId: 'u-x', snapId: 's2', side: 'pass', stake: 10, p: 0.5, state: 'settled', landed: null, delta: 0 },
    settled('u-x', 's3', 'run', 10, 30),
  ];
  const b = bankFor('u-x', ledger, 100);
  assert.equal(b.balance, 160);
  assert.deepEqual(b.record, { landed: 2, missed: 0 });
  assert.equal(b.streak, 2, 'a void does not break a run');
  const row = computeBoard([{ userId: 'u-x', displayName: 'X' }], ledger)[0];
  assert.equal(row.voided, 1);
  assert.equal(row.calls, 3);
});

test('an unsettled call is Marbles on the table, out of the balance', () => {
  const ledger = [
    settled('u-x', 's1', 'run', 10, 30),
    { userId: 'u-x', snapId: 's2', side: 'pass', stake: 25, p: 0.4, state: 'open', landed: null, delta: null },
    { userId: 'u-x', snapId: 's3', side: 'run', stake: 5, p: 0.6, state: 'locked', landed: null, delta: null },
  ];
  const b = bankFor('u-x', ledger, 100);
  assert.equal(b.balance, 100 + 30 - 30);
  const row = computeBoard([{ userId: 'u-x', displayName: 'X' }], ledger)[0];
  assert.equal(row.committed, 30);
  assert.equal(row.profit, 0);
});

test('the streak is signed — landed runs positive, missed runs negative', () => {
  const miss = (id) => settled('u-x', id, 'run', 10, -10);
  const win = (id) => settled('u-x', id, 'run', 10, 20);
  assert.equal(bankFor('u-x', [win('a'), win('b'), win('c')], 100).streak, 3);
  assert.equal(bankFor('u-x', [win('a'), miss('b'), miss('c')], 100).streak, -2);
  assert.equal(bankFor('u-x', [miss('a'), win('b')], 100).streak, 1);
  assert.equal(bankFor('u-x', [], 100).streak, 0);
});

test('movement comes from the previous board, and is zero without one', () => {
  const members = [
    { userId: 'u-ann', displayName: 'Ann' },
    { userId: 'u-bo', displayName: 'Bo' },
  ];
  const ledger = [settled('u-bo', 's1', 'run', 10, 50), settled('u-ann', 's1', 'pass', 10, 10)];
  const plain = computeBoard(members, ledger);
  assert.deepEqual(plain.map((r) => r.movement), [0, 0]);
  const moved = computeBoard(members, ledger, { previousRanks: { 'u-ann': 1, 'u-bo': 2 } });
  assert.equal(moved.find((r) => r.userId === 'u-bo').movement, 1);
  assert.equal(moved.find((r) => r.userId === 'u-ann').movement, -1);
});

test('isSelf marks exactly one row', () => {
  const rows = computeBoard(
    [
      { userId: 'u-ann', displayName: 'Ann' },
      { userId: 'u-bo', displayName: 'Bo' },
    ],
    [],
    { selfUserId: 'u-bo' },
  );
  assert.deepEqual(rows.map((r) => r.isSelf), [false, true]);
});

test('a placing needs a field of eight', () => {
  const few = computeBoard(
    Array.from({ length: 7 }, (_, i) => ({ userId: `u${i}`, displayName: `P${i}` })),
    [],
  );
  assert.equal(field(few), 7);
  assert.equal(canPlace(few), false);
  const enough = computeBoard(
    Array.from({ length: MIN_FIELD_FOR_PLACING }, (_, i) => ({ userId: `u${i}`, displayName: `P${i}` })),
    [],
  );
  assert.equal(canPlace(enough), true);
});

test('names: collapsed, bounded, and markup refused', () => {
  assert.equal(cleanName('  Jason  R '), 'Jason R');
  assert.equal(cleanName("O'Neill-Smith"), "O'Neill-Smith");
  assert.equal(cleanName('hi\nthere'), 'hi there');
  for (const bad of ['', '   ', '<script>x</script>', 'a'.repeat(25), 'drop; table', null])
    assert.equal(cleanName(bad), null, String(bad));
});

// ---------------------------------------------------------------------------
// 2 — 🔴 the boards never sum
// ---------------------------------------------------------------------------

test('🔴 no row this module emits carries a pool point', () => {
  const { members, ledger } = replay('real-utep-at-ou-260905-final.json');
  for (const row of computeBoard(members, ledger)) {
    for (const banned of ['weekPoints', 'seasonPoints', 'parlayPoints', 'points', 'score'])
      assert.ok(!(banned in row), `live row carries ${banned} — a pool field`);
  }
});

test('🔴 the module says Marbles and never credits', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'board.ts'), 'utf8');
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  for (const word of ['credit', 'coin', 'top-up', 'purchase', 'wager', 'payout', 'prize', 'cash'])
    assert.ok(!code.toLowerCase().includes(word), `board.ts code contains "${word}"`);
});

// ---------------------------------------------------------------------------
// 3 — the fixture replay
// ---------------------------------------------------------------------------

test('the replay is built from real snaps, not invented ones', () => {
  const { snaps, ledger } = replay('real-utep-at-ou-260905-final.json');
  assert.equal(snaps.length, 112, 'run/pass snaps in UTEP at OU');
  assert.equal(snaps.filter((s) => s.outcome === 'run').length, 69);
  assert.equal(snaps.filter((s) => s.outcome === 'pass').length, 43);
  assert.ok(ledger.length > 300, `ledger is thin: ${ledger.length}`);
  // every settled outcome traces to a real play id in the fixture
  const ids = new Set(snaps.map((s) => s.snapId));
  for (const e of ledger) assert.ok(ids.has(e.snapId), `phantom snap ${e.snapId}`);
});

test('the board over a real game is consistent with its own ledger', () => {
  const { members, ledger } = replay('real-utep-at-ou-260905-final.json', { openTail: 2 });
  const rows = computeBoard(members, ledger, { selfUserId: 'u-ann' });
  assert.equal(rows.length, 5);
  for (const r of rows) {
    assert.equal(r.profit, r.balance - r.start, `${r.displayName}: profit is not balance - start`);
    assert.equal(r.calls, r.landed + r.missed + r.voided + ledgerOpen(ledger, r.userId));
    assert.ok(r.balance >= 0);
  }
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i - 1].profit >= rows[i].profit, 'the board is not ranked on profit');
    assert.equal(rows[i].rank, i + 1);
  }
  assert.ok(rows.some((r) => r.committed > 0), 'the open tail put nothing on the table');
});

test('all three fixtures replay and rank', () => {
  for (const f of [
    'real-utep-at-ou-260905-final.json',
    'real-ball-at-osu-260905-final.json',
    'real-bois-at-ore-260905-final.json',
  ]) {
    const { members, ledger, snaps } = replay(f);
    const rows = computeBoard(members, ledger);
    assert.equal(rows.length, 5, f);
    assert.ok(snaps.length > 90, `${f}: ${snaps.length} snaps`);
    assert.ok(rows[0].profit >= rows[4].profit, f);
  }
});

// ---------------------------------------------------------------------------
// 4 — parity with the reference implementation, on the same input
// ---------------------------------------------------------------------------

const PY = pythonOnPath();

test('🔴 board.py ranks the same replay identically', { skip: parityskip() }, () => {
  const { members, ledger } = replay('real-utep-at-ou-260905-final.json', { openTail: 2 });
  const rows = computeBoard(members, ledger);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `anygiven-board-${randomUUID()}-`));
  const rowsPath = path.join(dir, 'rows.json');
  const outPath = path.join(dir, 'out.json');
  const scriptPath = path.join(dir, 'parity.py');

  fs.writeFileSync(
    rowsPath,
    JSON.stringify(
      rows.map((r) => ({
        name: r.displayName,
        credits: r.balance,
        calls: r.calls,
        hits: r.landed,
        start: r.start,
      })),
    ),
  );
  fs.writeFileSync(scriptPath, PARITY_PY);

  const res = spawnSync(PY, [scriptPath, rowsPath, outPath], {
    cwd: REFERENCE,
    encoding: 'utf8',
  });
  assert.equal(res.status, 0, `board.py shim failed:\n${res.stderr}`);

  const ref = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  fs.rmSync(dir, { recursive: true, force: true });

  assert.deepEqual(
    rows.map((r) => r.displayName),
    ref.map((r) => r.name),
    'the two boards are in different orders',
  );
  assert.deepEqual(
    rows.map((r) => r.profit),
    ref.map((r) => r.profit),
    'the two boards disagree on profit',
  );
});

test('🔴 board.py ranks the deep-bench case identically', { skip: parityskip() }, () => {
  const cases = [
    { name: 'Ann', credits: 140, calls: 20, hits: 11, start: 100 },
    { name: 'Bo', credits: 150, calls: 12, hits: 9, start: 140 },
    { name: 'Cy', credits: 180, calls: 6, hits: 2, start: 200 },
    { name: 'Dee', credits: 140, calls: 12, hits: 9, start: 100 },
  ];
  const rows = computeBoard(
    cases.map((c) => ({ userId: `u-${c.name}`, displayName: c.name, start: c.start })),
    cases.flatMap((c, i) =>
      Array.from({ length: c.calls }, (_, k) => ({
        userId: `u-${c.name}`,
        snapId: `s${i}-${k}`,
        side: 'run',
        stake: 1,
        p: 0.5,
        state: 'settled',
        landed: k < c.hits,
        delta: k === 0 ? c.credits - c.start : 0,
      })),
    ),
  );

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `anygiven-board-${randomUUID()}-`));
  const rowsPath = path.join(dir, 'rows.json');
  const outPath = path.join(dir, 'out.json');
  const scriptPath = path.join(dir, 'parity.py');
  fs.writeFileSync(rowsPath, JSON.stringify(cases));
  fs.writeFileSync(scriptPath, PARITY_PY);
  const res = spawnSync(PY, [scriptPath, rowsPath, outPath], { cwd: REFERENCE, encoding: 'utf8' });
  assert.equal(res.status, 0, `board.py shim failed:\n${res.stderr}`);
  const ref = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  fs.rmSync(dir, { recursive: true, force: true });

  assert.deepEqual(rows.map((r) => r.displayName), ref.map((r) => r.name));
  assert.deepEqual(rows.map((r) => r.profit), ref.map((r) => r.profit));
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function settled(userId, snapId, side, stake, delta) {
  return {
    userId,
    snapId,
    side,
    stake,
    p: 0.5,
    state: 'settled',
    landed: delta > 0,
    delta,
  };
}

function ledgerOpen(ledger, userId) {
  return ledger.filter((e) => e.userId === userId && e.state !== 'settled').length;
}

function pythonOnPath() {
  for (const bin of ['python', 'python3', 'py']) {
    const r = spawnSync(bin, ['--version'], { encoding: 'utf8' });
    if (r.status === 0) return bin;
  }
  return null;
}

function parityskip() {
  if (!PY) return 'no python on PATH';
  if (!fs.existsSync(path.join(REFERENCE, 'ncaalive', 'board.py')))
    return `reference not at ${REFERENCE}`;
  return false;
}

/** A shim over the reference. It posts our rows and prints its own ranking. */
const PARITY_PY = `import json, os, sys, tempfile
sys.path.insert(0, os.getcwd())
from ncaalive.board import Board

rows = json.load(open(sys.argv[1], encoding="utf-8"))
b = Board(os.path.join(tempfile.mkdtemp(), "board.json"))
for r in rows:
    b.post("g-parity", r["name"], r["credits"], r["calls"], r["hits"],
           start=r["start"])
out = [{"name": r["name"], "profit": r["profit"], "credits": r["credits"],
        "calls": r["calls"]} for r in b.game("g-parity")]
json.dump(out, open(sys.argv[2], "w", encoding="utf-8"))
`;
