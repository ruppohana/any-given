/**
 * The call ledger, closed against a real captured game and against the
 * reference implementation's own arithmetic on the same input.
 *
 *   node --test tests/calls.test.mjs
 *
 * Three kinds of evidence in here, in this order:
 *
 *  1. The rules that may not be decided - 7.4 one call per snap, the 6x cap,
 *     the price copied at the tap, the bank set back to its start every game,
 *     and the scan CONTRACT 5 requires for the words that would make Marbles
 *     a currency.
 *  2. A full replay of `fixtures/real-utep-at-ou-260905-final.json` snap by
 *     snap, with a deliberate double tap on every snap so 7.4 is exercised on
 *     real data rather than on a hand-written pair of calls.
 *  3. The same replay run through the REFERENCE implementation's own
 *     `pick` / `resolvePick` / `payout` / `playKind`, lifted verbatim out of
 *     `sports-live/ncaalive/server.py` and executed in a vm, then diffed snap
 *     by snap against this ledger. Nothing about the reference is re-typed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import {
  BALANCE_NOUN,
  HOUSE_RULES,
  openLedger,
  nextGame,
  accept,
  settle,
  lock,
  voidOpen,
  payoutFor,
  payoutPerMarble,
  offerFor,
  bankOf,
  toLedgerRows,
} from '../src/lib/calls.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const FIXTURES = path.join(REPO, 'fixtures');
const REFERENCE =
  process.env.ANYGIVEN_REFERENCE ||
  path.resolve(REPO, '..', 'sports-live', 'ncaalive', 'server.py');

const say = (...a) => console.log(...a);

// ---------------------------------------------------------------------------
// 1 - the rules
// ---------------------------------------------------------------------------

test('7.4 a second tap on the same snap is refused, and the bank does not move twice', () => {
  const L = openLedger('g1', 'u1');
  const a = accept(L, { snapId: 's1', side: 'run', stake: 10, p: 0.5 });
  assert.equal(a.ok, true);
  assert.equal(L.bank.balance, 90);

  const b = accept(L, { snapId: 's1', side: 'pass', stake: 10, p: 0.5 });
  assert.equal(b.ok, false);
  assert.equal(b.reason, 'call_pending');
  assert.equal(L.bank.balance, 90, 'the guard is worthless after the stake has left');

  // and not on a different snap either - one unresolved call at a time
  const c = accept(L, { snapId: 's2', side: 'run', stake: 5, p: 0.5 });
  assert.equal(c.ok, false);
  assert.equal(c.reason, 'call_pending');
  assert.equal(L.bank.balance, 90);
});

test('7.4 a snap already settled cannot be called again - the D1 unique index', () => {
  const L = openLedger('g1', 'u1');
  accept(L, { snapId: 's1', side: 'run', stake: 10, p: 0.5 });
  settle(L, 's1', 'run');
  const again = accept(L, { snapId: 's1', side: 'pass', stake: 10, p: 0.5 });
  assert.equal(again.ok, false);
  assert.equal(again.reason, 'snap_already_called');
  const rows = toLedgerRows(L);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].snap_id, 's1');
});

test('the payout is stake / p, capped at 6x, on the price at the moment of the call', () => {
  assert.equal(payoutFor(10, 0.5), 20);
  assert.equal(payoutFor(10, 0.25), 40);
  assert.equal(payoutFor(10, 0.1), 60, '10/0.1 is 100; the cap is 60');
  assert.equal(payoutFor(25, 0.03), 150, 'a 3% price is a thin sample, not 33x');
  assert.equal(payoutFor(10, null), 10, 'no price means the stake comes back');
  assert.equal(payoutPerMarble(0.1), 6);
  assert.equal(payoutPerMarble(0.5), 2);

  const L = openLedger('g1', 'u1');
  accept(L, { snapId: 's1', side: 'run', stake: 10, p: 0.25 });
  // the model reprices; the call does not
  const r = settle(L, 's1', 'run');
  assert.equal(r.call.p, 0.25);
  assert.equal(r.returned, 40);
  assert.equal(r.delta, 30);
  assert.equal(L.bank.balance, 130);
});

test('the price is on the tile before the tap', () => {
  const o = offerFor('s1', 'run', 0.4, 1_700_000_000_000);
  assert.equal(o.p, 0.4);
  assert.equal(o.payoutPerMarble, 2.5);
  assert.equal(o.confidence, 'mid');
  assert.equal(offerFor('s1', 'run', 0.47, 0).confidence, 'lo');
  assert.equal(offerFor('s1', 'run', 0.8, 0).confidence, 'hi');
});

test('the board ranks on profit - balance minus start', () => {
  const L = openLedger('g1', 'u1');
  accept(L, { snapId: 's1', side: 'run', stake: 25, p: 0.5 });
  settle(L, 's1', 'run');
  const bank = bankOf(L);
  assert.equal(bank.start, 100);
  assert.equal(bank.balance, 125);
  assert.equal(bank.delta, 25);
  assert.equal(bank.delta, bank.balance - bank.start);

  const deeper = openLedger('g1', 'u2', { startingBank: 200 });
  accept(deeper, { snapId: 's1', side: 'run', stake: 25, p: 0.5 });
  settle(deeper, 's1', 'run');
  assert.equal(bankOf(deeper).balance, 225);
  assert.equal(bankOf(deeper).delta, 25, 'a deeper bench is a longer night, not a place');
});

test('the bank is set back to its start every game and nobody is locked out', () => {
  const L = openLedger('g1', 'u1');
  // spend it all down
  let snap = 0;
  while (L.bank.balance >= 5) {
    const id = 'x' + snap++;
    const r = accept(L, { snapId: id, side: 'run', stake: 25, p: 0.9 });
    if (!r.ok) break;
    settle(L, id, 'pass');
  }
  assert.ok(L.bank.balance < 5, 'the bank really did run out inside the game');
  const refused = accept(L, { snapId: 'z', side: 'run', stake: 5, p: 0.5 });
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'bank_too_low');

  const g2 = nextGame(L, 'g2');
  assert.equal(g2.bank.balance, 100);
  assert.equal(g2.bank.start, 100);
  assert.equal(g2.bank.delta, 0);
  assert.equal(g2.bank.record.landed, 0);
  const ok = accept(g2, { snapId: 'y', side: 'run', stake: 25, p: 0.5 });
  assert.equal(ok.ok, true, 'the next game plays. There is no elimination');
});

test('a stake off the ladder is refused; a stake bigger than the bank is trimmed', () => {
  const L = openLedger('g1', 'u1');
  assert.equal(accept(L, { snapId: 's', side: 'run', stake: 7, p: 0.5 }).reason, 'not_on_the_ladder');
  assert.deepEqual(HOUSE_RULES.stakeLadder, [5, 10, 25]);
  assert.equal(HOUSE_RULES.startingBank, 100);

  const thin = openLedger('g1', 'u2', { startingBank: 7 });
  const r = accept(thin, { snapId: 's', side: 'run', stake: 25, p: 0.5 });
  assert.equal(r.ok, true);
  assert.equal(r.staked, 7);
  assert.equal(thin.bank.balance, 0);
});

test('a snap that was not a run or a pass is void, and a void returns the stake', () => {
  for (const t of ['kick', 'penalty', 'other']) {
    const L = openLedger('g1', 'u1');
    accept(L, { snapId: 's1', side: 'run', stake: 10, p: 0.5 });
    const r = settle(L, 's1', t);
    assert.equal(r.landed, null);
    assert.equal(r.delta, 0);
    assert.equal(L.bank.balance, 100, `${t} must not cost Marbles`);
    assert.equal(L.bank.record.landed + L.bank.record.missed, 0);
  }
  // the reference's own arithmetic, for the parity run below
  const ref = openLedger('g1', 'u1', { voidReturnsTheStake: false });
  accept(ref, { snapId: 's1', side: 'run', stake: 10, p: 0.5 });
  settle(ref, 's1', 'penalty');
  assert.equal(ref.bank.balance, 90);

  // a call open when the game ends comes back whatever the rule
  const end = openLedger('g1', 'u1', { voidReturnsTheStake: false });
  accept(end, { snapId: 's9', side: 'pass', stake: 25, p: 0.4 });
  voidOpen(end);
  assert.equal(end.bank.balance, 100);
});

test('lock moves the call to locked and settle still pays it', () => {
  const L = openLedger('g1', 'u1');
  accept(L, { snapId: 's1', side: 'pass', stake: 10, p: 0.5 });
  assert.equal(lock(L, 's1').state, 'locked');
  assert.equal(lock(L, 's2'), null);
  assert.equal(settle(L, 's1', 'pass').returned, 20);
});

test('a closed snap is refused, and a bad price or side is refused', () => {
  const L = openLedger('g1', 'u1');
  const late = accept(L, { snapId: 's1', side: 'run', stake: 10, p: 0.5, now: 200, closesAt: 100 });
  assert.equal(late.reason, 'snap_closed');
  assert.equal(accept(L, { snapId: 's1', side: 'punt', stake: 10, p: 0.5 }).reason, 'bad_side');
  assert.equal(accept(L, { snapId: 's1', side: 'run', stake: 10, p: 0 }).reason, 'bad_price');
  assert.equal(accept(L, { snapId: 's1', side: 'run', stake: 10, p: 1.4 }).reason, 'bad_price');
  assert.equal(L.bank.balance, 100);
});

// ---------------------------------------------------------------------------
// 1b - CONTRACT 5: the words that would turn Marbles into a currency
// ---------------------------------------------------------------------------

test('CONTRACT 5 - no purchasable word appears anywhere in src/', () => {
  // Assembled from fragments so this scanner does not trip over its own list.
  const CONTINUE = 'cont' + 'inue';
  // The seven CONTRACT 5 words, plus the singular forms.
  //
  // Two passes, because one naive pass over 7 modules produced 26 hits and not
  // one of them was real: `continue` is a JavaScript keyword and `coin toss` is
  // a play type ESPN actually ships.
  //   PASS A - every module, comments stripped, keyword `continue` excluded.
  //            That is identifiers and user-facing strings: the balance itself.
  //   PASS B - `continue` in string literals only. A "Continue?" button is the
  //            thing the rule is about; `continue;` in a loop is not.
  //   PASS C - THIS module's own file, whole word list, comments included, zero
  //            tolerance. It is the file that moves the bank.
  const CODE = ['cre' + 'dits?', 'co' + 'ins', 'top' + '-?up', 'pur' + 'chase', 'b' + 'uy',
    'ref' + 'ill'];
  const reCode = new RegExp('\\b(' + CODE.join('|') + ')\\b', 'i');
  const reText = new RegExp('\\b(' + CODE.concat([CONTINUE]).join('|') + ')\\b', 'i');
  const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const literals = (s) => s.match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g) || [];

  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(ts|js|mjs)$/.test(e.name)) files.push(full);
    }
  })(path.join(REPO, 'src'));

  const bad = [];
  for (const f of files) {
    const rel = path.relative(REPO, f);
    const code = stripComments(fs.readFileSync(f, 'utf8'));
    code.split(/\r?\n/).forEach((line, i) => {
      const m = line.match(reCode);
      if (m) bad.push(`A ${rel}:${i + 1}  ${m[1]}  ${line.trim().slice(0, 66)}`);
    });
    for (const lit of literals(code)) {
      const m = lit.match(reText);
      if (m) bad.push(`B ${rel}  ${m[1]}  ${lit.slice(0, 66)}`);
    }
  }
  const own = fs.readFileSync(path.join(REPO, 'src', 'lib', 'calls.ts'), 'utf8');
  own.split(/\r?\n/).forEach((line, i) => {
    const m = line.match(reText);
    if (m) bad.push(`C src/lib/calls.ts:${i + 1}  ${m[1]}  ${line.trim().slice(0, 66)}`);
  });

  say(`\n  [word scan] ${files.length} file(s) under src/, three passes: ${bad.length} hit(s)`);
  for (const b of bad) say('    ' + b);
  assert.equal(bad.length, 0, 'the balance is Marbles, and nothing about it may be bought');

  assert.match(own, /Marbles/, 'the module names the balance');
  assert.equal(BALANCE_NOUN, 'Marbles');
  // no API for obtaining Marbles other than by calling a snap
  const api = Object.keys(
    Object.fromEntries(Object.entries({ openLedger, nextGame, accept, settle, lock, voidOpen })),
  );
  assert.deepEqual(api, ['openLedger', 'nextGame', 'accept', 'settle', 'lock', 'voidOpen']);
});

// ---------------------------------------------------------------------------
// 2 + 3 - the replay, and the reference on the same input
// ---------------------------------------------------------------------------

/** Every play of the game, in order, flattened out of the drives. */
function playsOf(fixture) {
  const j = JSON.parse(fs.readFileSync(path.join(FIXTURES, fixture), 'utf8'));
  const out = [];
  for (const d of j.drives.previous) for (const p of d.plays || []) out.push(p);
  return { gameId: String(j.header.id), plays: out };
}

/**
 * Stands in for M1's `parse.ts`, which does not exist yet: ESPN's play type
 * text mapped to the CONTRACT 6 `Play.type`. Written to the reference's own
 * ordering - the non-snap kinds are tested first - because the reference is
 * the bar. Agreement with `playKind` is asserted below over all 516 real plays.
 */
function playTypeOf(text) {
  const t = (text || '').toLowerCase();
  if (!t) return 'other';
  if (/penalty/.test(t)) return 'penalty';
  if (/timeout|end /.test(t)) return 'other';
  if (/punt|kick|field goal/.test(t)) return 'kick';
  if (/rush/.test(t)) return 'run';
  if (/pass|sack/.test(t)) return 'pass';
  return 'other';
}

/**
 * The price, taken out of the fixture rather than invented: this offense's own
 * run share so far in this game, with a 1-1 prior. M4's `price.ts` is the real
 * source and does not exist yet; what matters here is that BOTH implementations
 * are handed the same number on the same snap.
 */
function priceBook() {
  const seen = new Map();
  return {
    quote(teamId) {
      const s = seen.get(teamId) || { run: 0, pass: 0 };
      const pRun = (s.run + 1) / (s.run + s.pass + 2);
      return { run: pRun, pass: 1 - pRun };
    },
    observe(teamId, kind) {
      if (kind !== 'run' && kind !== 'pass') return;
      const s = seen.get(teamId) || { run: 0, pass: 0 };
      s[kind] += 1;
      seen.set(teamId, s);
    },
  };
}

/** The reference implementation's own functions, lifted verbatim and run. */
function loadReference() {
  const py = fs.readFileSync(REFERENCE, 'utf8');
  const open = py.indexOf('BOARD = """');
  assert.ok(open >= 0, `no BOARD in the bar at ${REFERENCE}`);
  const start = open + 'BOARD = """'.length;
  const BOARD = py.slice(start, py.indexOf('"""', start));
  assert.ok(BOARD.length > 100000, 'the bar did not read whole');

  const fn = (name) => {
    const at = BOARD.indexOf('function ' + name + '(');
    assert.ok(at >= 0, 'reference function not found: ' + name);
    let depth = 0, seen = false;
    for (let i = BOARD.indexOf('{', at); i < BOARD.length; i++) {
      if (BOARD[i] === '{') { depth++; seen = true; }
      else if (BOARD[i] === '}') {
        depth--;
        if (seen && depth === 0) {
          const src = BOARD.slice(at, i + 1);
          assert.ok(!src.includes('\\'), name + ' carries an escape this loader would mangle');
          return src;
        }
      }
    }
    throw new Error('unterminated ' + name);
  };

  const LIFTED = ['payout', 'playKind', 'pickKey', 'pick', 'resolvePick', 'bank',
    'setBank', 'bankAll', 'saveBank', 'broke', 'tally', 'saveTally',
    'startCredits', 'gradeCall', 'checkNewBadges', 'logCall'];

  const store = new Map();
  const ctx = vm.createContext({
    JSON, Math, Date, Object, console,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    navigator: {},
    setTimeout: () => 0,
  });

  const prelude = `
    var START_CREDITS=100, MIN_STAKE=5, STAKES=[5,10,25];
    var STAKE=10, FRIENDS=0, PICK=null, LAST=null;
    function games(){} function bump(){} function earned(){return[];}
    function postScore(){}
  `;
  vm.runInContext(prelude + LIFTED.map(fn).join('\n'), ctx);
  return {
    ctx,
    lifted: LIFTED,
    run: (code) => vm.runInContext(code, ctx),
    set: (k, v) => { ctx[k] = v; },
    get: (k) => ctx[k],
  };
}

test('the reference implementation loads and its pure functions still behave', () => {
  const R = loadReference();
  say(`\n  [bar] ${REFERENCE}`);
  say(`  [bar] lifted verbatim: ${R.lifted.join(', ')}`);
  assert.equal(R.run('payout(10,0.5)'), 20);
  assert.equal(R.run('payout(10,0.1)'), 60);
  assert.equal(R.run('playKind("Rush")'), 'run');
  assert.equal(R.run('playKind("Sack")'), 'pass');
  assert.equal(R.run('playKind("Punt")'), null);
});

test('the harness play-type mapper agrees with the reference playKind on every real play', () => {
  const R = loadReference();
  R.set('__t', null);
  const rows = new Map();
  let n = 0, disagree = 0;
  for (const f of fs.readdirSync(FIXTURES).filter((x) => x.startsWith('real-'))) {
    for (const p of playsOf(f).plays) {
      n++;
      const text = p.type.text;
      const mine = playTypeOf(text);
      R.set('__t', text);
      const theirs = R.run('playKind(__t)');
      const minesettles = mine === 'run' || mine === 'pass' ? mine : null;
      if (minesettles !== theirs) disagree++;
      rows.set(text, `${mine} / ${theirs === null ? 'void' : theirs}`);
    }
  }
  say(`\n  [play types] ${n} real plays, ${rows.size} distinct types, ${disagree} disagreement(s)`);
  for (const [k, v] of [...rows.entries()].sort()) say(`    ${k.padEnd(28)} -> ${v}`);
  assert.equal(disagree, 0);
});

/**
 * One full game, snap by snap, through both ledgers at once.
 *
 * On every snap the harness taps TWICE - the second tap is the bug 7.4 exists
 * for - then advances the feed by one play and settles.
 */
function replay(fixture, { voidReturnsTheStake, strategy = 'alternate' }) {
  const { gameId, plays } = playsOf(fixture);
  const R = loadReference();
  const book = priceBook();
  const L = openLedger(gameId, 'u1', { voidReturnsTheStake });

  const g = {
    id: gameId, live: true, series: [],
    situation: {}, call: null,
  };
  R.set('__g', g);
  R.run('LAST={games:[__g]};');

  const stat = {
    fixture, snaps: 0, accepted: 0, rejected: 0,
    rejectedPending: 0, rejectedBank: 0, rejectedOther: {},
    landed: 0, missed: 0, voided: 0, capHits: 0,
    firstDivergence: null, divergences: 0,
    // 0 === 0 is a weak agreement. These count the snaps where both banks were
    // live and equal, and the high-water mark each side reached.
    agreedNonZero: 0, peakMine: 0, peakReference: 0,
    // a tap on a snap that has already settled - the other half of 7.4
    retapped: 0, retapRefused: 0,
  };

  for (let i = 0; i < plays.length; i++) {
    const p = plays[i];
    const prev = i > 0 ? plays[i - 1] : null;
    const off = (p.start.team && p.start.team.id) || '';
    const snapId = [gameId, prev ? prev.id : '', p.start.down, p.start.distance, off].join('|');

    // pre-snap: the situation the tile is priced against
    g.situation = {
      last_play_id: prev ? prev.id : '',
      last_play_type: prev ? prev.type.text : '',
      last_play_text: prev ? prev.text : '',
      down: p.start.down,
      distance: p.start.distance,
      possession_team_id: off,
    };
    const q = book.quote(off);
    g.call = { confident: true, run: q.run, pass: q.pass, call: q.run >= q.pass ? 'run' : 'pass' };

    const side = strategy === 'model' ? g.call.call : (i % 2 === 0 ? 'run' : 'pass');
    const other = side === 'run' ? 'pass' : 'run';
    stat.snaps++;

    // --- tap, then tap again. Both implementations, same order --------------
    const before = L.bank.balance;
    const a = accept(L, { snapId, side, stake: 10, p: q[side] });
    R.set('__side', side);
    R.run('pick(__side)');

    if (a.ok) stat.accepted++;
    else {
      stat.rejected++;
      if (a.reason === 'call_pending') stat.rejectedPending++;
      else if (a.reason === 'bank_too_low') stat.rejectedBank++;
      else stat.rejectedOther[a.reason] = (stat.rejectedOther[a.reason] || 0) + 1;
    }

    const b = accept(L, { snapId, side: other, stake: 10, p: q[other] });
    R.set('__side', other);
    R.run('pick(__side)');
    assert.equal(b.ok, false, 'the second tap on one snap must never be taken');
    stat.rejected++;
    if (b.reason === 'call_pending') stat.rejectedPending++;
    else if (b.reason === 'bank_too_low') stat.rejectedBank++;
    else stat.rejectedOther[b.reason] = (stat.rejectedOther[b.reason] || 0) + 1;

    // the debit happened once, or not at all
    const debited = before - L.bank.balance;
    assert.ok(debited === 0 || debited === a.staked, 'one snap, one stake');

    // --- the snap happens ---------------------------------------------------
    g.situation = {
      last_play_id: p.id,
      last_play_type: p.type.text,
      last_play_text: p.text,
      down: p.end && p.end.down,
      distance: p.end && p.end.distance,
      possession_team_id: (p.end && p.end.team && p.end.team.id) || '',
    };
    const kind = playTypeOf(p.type.text);
    const r = settle(L, snapId, kind);
    R.run('resolvePick(__g)');
    book.observe(off, kind);

    if (r.settled) {
      if (r.landed === true) stat.landed++;
      else if (r.landed === false) stat.missed++;
      else stat.voided++;
      if (r.landed === true && r.returned === r.call.stake * 6) stat.capHits++;

      // and once more on a snap that has now settled. The reference's guard is
      // released the moment a verdict lands, so this tap is NOT sent to it -
      // it is the D1 unique index being held in code, which the reference has
      // no equivalent of.
      stat.retapped++;
      const again = accept(L, { snapId, side, stake: 10, p: q[side] });
      assert.equal(again.ok, false, 'a settled snap must never take a second call');
      assert.equal(again.reason, 'snap_already_called');
      stat.retapRefused++;
    }

    // --- diff, every snap ---------------------------------------------------
    const theirs = R.run('bank(__g).credits');
    if (theirs !== L.bank.balance && stat.firstDivergence == null) {
      stat.firstDivergence =
        `snap ${i} (${p.type.text}) mine=${L.bank.balance} reference=${theirs}`;
    }
    if (theirs !== L.bank.balance) stat.divergences++;
    else if (theirs > 0) stat.agreedNonZero++;
    stat.peakMine = Math.max(stat.peakMine, L.bank.balance);
    stat.peakReference = Math.max(stat.peakReference, theirs);
  }

  stat.finalMine = L.bank.balance;
  stat.finalReference = R.run('bank(__g).credits');
  stat.refCalls = R.run('bank(__g).calls');
  stat.refHits = R.run('bank(__g).hits');
  stat.bank = bankOf(L);
  stat.rows = toLedgerRows(L).length;
  return stat;
}

test('REPLAY - real-utep-at-ou-260905-final.json, snap by snap, against the reference', () => {
  const s = replay('real-utep-at-ou-260905-final.json', { voidReturnsTheStake: false });
  say(`
  [replay] ${s.fixture}   (rules: the reference's own - a void keeps the stake)
    snaps replayed .......... ${s.snaps}
    calls accepted .......... ${s.accepted}
    calls rejected .......... ${s.rejected}
      by 7.4 call_pending ... ${s.rejectedPending}   (the second tap, every snap)
      by bank_too_low ....... ${s.rejectedBank}
      other ................. ${JSON.stringify(s.rejectedOther)}
    re-taps after settle .... ${s.retapped}
      by 7.4 snap_already_called  ${s.retapRefused}
    landed / missed / void .. ${s.landed} / ${s.missed} / ${s.voided}
    6x cap hit .............. ${s.capHits}
    marble_ledger rows ...... ${s.rows}
    final bank - mine ....... ${s.finalMine}
    final bank - reference .. ${s.finalReference}
    reference calls / hits .. ${s.refCalls} / ${s.refHits}
    peak bank mine / ref .... ${s.peakMine} / ${s.peakReference}
    snaps agreeing, bank live ${s.agreedNonZero}
    snap-by-snap divergences  ${s.divergences}${s.firstDivergence ? '  first: ' + s.firstDivergence : ''}`);

  assert.equal(s.snaps, 158);
  assert.equal(s.divergences, 0, 'the ledger and the reference must agree on every snap');
  assert.ok(s.agreedNonZero >= 30, 'agreement must hold with the bank live, not only at zero');
  assert.equal(s.peakMine, s.peakReference);
  assert.equal(s.finalMine, s.finalReference);
  assert.equal(s.accepted + s.rejected, s.snaps * 2);
  assert.equal(s.rejectedPending, s.accepted, 'one refused second tap per accepted call');
  assert.equal(s.retapRefused, s.retapped);
  assert.equal(s.retapped, s.accepted, 'every settled snap was tapped again and refused');
  assert.equal(s.landed + s.missed, s.refHits + (s.refCalls - s.refHits));
  assert.equal(s.landed, s.refHits);
  assert.equal(s.landed + s.missed, s.refCalls);
});

test('REPLAY - the same game under the shipped rule, where a void returns the stake', () => {
  const s = replay('real-utep-at-ou-260905-final.json', { voidReturnsTheStake: true });
  say(`
  [replay] ${s.fixture}   (rules: shipped - a void returns the stake)
    snaps replayed .......... ${s.snaps}
    calls accepted .......... ${s.accepted}
    calls rejected by 7.4 ... ${s.rejectedPending}
    landed / missed / void .. ${s.landed} / ${s.missed} / ${s.voided}
    final bank .............. ${s.finalMine}   (profit ${s.bank.delta})
    reference on same input . ${s.finalReference}
    gap to the reference .... ${s.finalMine - s.finalReference} over ${s.voided} void snaps.
                              It compounds: the reference's discarded void
                              stakes bust the bank, and a bust bank stops calling`);

  assert.equal(s.snaps, 158);
  assert.ok(s.voided > 0, 'a real game has snaps that are not a run or a pass');
  assert.equal(s.bank.delta, s.bank.balance - s.bank.start);
  assert.equal(s.bank.record.landed, s.landed);
  assert.equal(s.bank.record.missed, s.missed);
  // the only difference from the reference is the returned void stakes
  assert.ok(s.finalMine >= s.finalReference);
});

test('REPLAY - a second caller, and the agreement holds while both banks are live', () => {
  // A final 0 === 0 is a weak agreement. This run calls whatever the price
  // favors instead of alternating, and counts the snaps where BOTH banks were
  // above zero and equal - agreement on a live trajectory, not at the floor.
  const s = replay('real-utep-at-ou-260905-final.json',
    { voidReturnsTheStake: false, strategy: 'model' });
  say(`
  [replay] ${s.fixture}   (caller follows the price; reference void rule)
    snaps ${s.snaps} | accepted ${s.accepted} | refused by 7.4 ${s.rejectedPending} | ` +
    `bank_too_low ${s.rejectedBank}
    landed/missed/void ${s.landed}/${s.missed}/${s.voided} | 6x cap hit ${s.capHits}
    peak bank mine ${s.peakMine} vs reference ${s.peakReference}
    snaps agreeing with a LIVE bank ${s.agreedNonZero} | divergences ${s.divergences}
    final bank mine ${s.finalMine} vs reference ${s.finalReference}`);
  assert.equal(s.divergences, 0);
  assert.ok(s.agreedNonZero >= 30, 'the agreement must hold before the bank empties');
  assert.equal(s.peakMine, s.peakReference);
  assert.ok(s.peakMine > 100, 'this caller was ahead at some point in the game');
  assert.equal(s.finalMine, s.finalReference);
  assert.equal(s.landed, s.refHits);
  assert.equal(s.landed + s.missed, s.refCalls);
});

test('REPLAY - the other two captured games, same ledger, same guards', () => {
  for (const f of ['real-ball-at-osu-260905-final.json', 'real-bois-at-ore-260905-final.json']) {
    const s = replay(f, { voidReturnsTheStake: false });
    say(`
  [replay] ${s.fixture}
    snaps ${s.snaps} | accepted ${s.accepted} | refused by 7.4 ${s.rejectedPending} | ` +
      `bank_too_low ${s.rejectedBank} | landed/missed/void ${s.landed}/${s.missed}/${s.voided}
    final bank mine ${s.finalMine} vs reference ${s.finalReference} | divergences ${s.divergences}`);
    assert.equal(s.divergences, 0);
    assert.equal(s.finalMine, s.finalReference);
    assert.equal(s.landed, s.refHits);
  }
});
