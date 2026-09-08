/**
 * tests/l6-board.test.mjs — the live board screen and the badge case.
 *
 * WHAT THIS CLOSES AGAINST, per CONTRACT.md §1:
 *   1. `fixtures/real-utep-at-ou-260905-final.json` — a real captured game. The
 *      replay's run/pass outcomes are the actual `type.text` of the actual
 *      plays. NO FIXTURE IS WRITTEN HERE.
 *   2. `src/lib/board.ts` itself — the screen imports it in the browser through
 *      a type-strip, and the strip is asserted BYTE-IDENTICAL to the real
 *      module on that replay. A strip that mangled anything would reorder a
 *      board silently; this is the thing that makes it loud.
 *
 * WHAT IT CANNOT CLOSE: layout. Requirement 7.5 — a browser at 393px is the
 * only thing that closes a screen, and this file is not it. See the report.
 *
 * The screen module is BROWSER code: its imports are server-absolute
 * ('/components/fmt.js') and Node cannot resolve them, which is exactly why
 * tools/preview.mjs reads screen metadata as text rather than importing. So the
 * pure exports are loaded here by rewriting those import lines to local stubs
 * and importing the result from a UNIQUELY NAMED temp file — /tmp is shared
 * between sessions and a fixed name is a recorded loss.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

import {
  computeBoard, startFor, canPlace, MIN_FIELD_FOR_PLACING, START_MARBLES
} from '../src/lib/board.ts';

const ROOT = new URL('..', import.meta.url);
const readRoot = (p) => fs.readFileSync(new URL(p, ROOT), 'utf8');

const SCREEN_SRC = readRoot('public/screens/l6-board.screen.js');
const CSS_SRC = readRoot('public/screens/l6-board.css');
const BOARD_SRC = readRoot('src/lib/board.ts');
const FIXTURE = JSON.parse(readRoot('fixtures/real-utep-at-ou-260905-final.json'));

/** Load the screen's pure exports in Node. */
async function loadScreen() {
  const stubbed = SCREEN_SRC.replace(
    /^import[\s\S]*?from '\/components\/[^']*';$/gm,
    ''
  );
  assert.ok(!/from '\/components\//.test(stubbed), 'every browser import was rewritten');
  const file = path.join(os.tmpdir(), `l6-board-${process.pid}-${randomUUID()}.mjs`);
  fs.writeFileSync(file, stubbed);
  try { return await import(pathToFileURL(file).href); }
  finally { try { fs.unlinkSync(file); } catch { /* best effort */ } }
}

const SCREEN = await loadScreen();

/** Import board.ts the way the browser does: through the screen's own strip. */
async function loadStrippedBoard() {
  const file = path.join(os.tmpdir(), `l6-board-ts-${process.pid}-${randomUUID()}.mjs`);
  fs.writeFileSync(file, SCREEN.stripTypes(BOARD_SRC));
  try { return await import(pathToFileURL(file).href); }
  finally { try { fs.unlinkSync(file); } catch { /* best effort */ } }
}

const MEMBERS = SCREEN.CALLERS.map(({ pick, ...m }) => m);
const SNAPS = SCREEN.snapsFrom(FIXTURE);

/** Comments in this file quote the rules they enforce — "never credits", "no
 *  box-shadow", "balance - start". A grep that cannot tell a rule from a
 *  violation of it fails on the sentence explaining the rule, so the banned-text
 *  checks below run against CODE ONLY. Strings survive: user-facing copy is
 *  exactly what those checks are for. */
function codeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');
}
const SCREEN_CODE = codeOnly(SCREEN_SRC);
const CSS_CODE = codeOnly(CSS_SRC);

// ---------------------------------------------------------------------------
// 1 — the fixture is real, and it is the only data here
// ---------------------------------------------------------------------------

test('the replay runs off a real captured game, not a written one', () => {
  assert.ok(SNAPS.length > 100, `only ${SNAPS.length} snaps — wrong fixture?`);
  const ids = new Set(SNAPS.map((s) => s.snapId));
  assert.equal(ids.size, SNAPS.length, 'every snap id is a real distinct play id');
  const sides = new Set(SNAPS.map((s) => s.outcome));
  assert.deepEqual([...sides].sort(), ['pass', 'run']);
  console.log(`    ${SNAPS.length} real snaps from real-utep-at-ou-260905-final.json`);
});

// ---------------------------------------------------------------------------
// 2 — 🔴 the screen imports board.ts. It does not reimplement it.
// ---------------------------------------------------------------------------

test('🔴 the browser type-strip of board.ts is identical to the real module', async () => {
  const stripped = await loadStrippedBoard();
  assert.deepEqual(
    Object.keys(stripped).sort(),
    ['MIN_FIELD_FOR_PLACING', 'REFERRAL_BONUS', 'REFERRAL_CAP', 'START_MARBLES',
      'bankFor', 'canPlace', 'cleanName', 'computeBoard', 'field', 'startFor'],
    'the strip kept every export'
  );
  assert.equal(stripped.START_MARBLES, START_MARBLES);
  assert.equal(stripped.MIN_FIELD_FOR_PLACING, MIN_FIELD_FOR_PLACING);

  for (const opts of [{ take: SNAPS.length }, { take: 200, openTail: 4 }, { take: 12 }]) {
    const a = SCREEN.replay(SNAPS, startFor, opts);
    const b = SCREEN.replay(SNAPS, stripped.startFor, opts);
    assert.equal(JSON.stringify(a), JSON.stringify(b), 'startFor agrees');
    const real = computeBoard(MEMBERS, a, { selfUserId: 'u-cy' });
    const via = stripped.computeBoard(MEMBERS, b, { selfUserId: 'u-cy' });
    assert.equal(JSON.stringify(via), JSON.stringify(real),
      `stripped board differs on ${JSON.stringify(opts)}`);
  }
  console.log('    stripped board.ts === real board.ts on three real replays');
});

test('the screen contains no sort, no rank assignment and no profit arithmetic', () => {
  // It renders `data.rows` in the order given. board.ts owns the order.
  assert.ok(!/\.sort\s*\(/.test(SCREEN_CODE), 'the screen must never sort a board');
  assert.ok(!/balance\s*-\s*(start|r\.start)/.test(SCREEN_CODE),
    'the screen must never recompute profit');
  assert.ok(!/rank\s*[:=]\s*(?!0)/.test(SCREEN_CODE.replace(/rank: 1, movement: 0/g, '')),
    'the screen must never assign a rank');
});

// ---------------------------------------------------------------------------
// 3 — 🔴 it ranks on PROFIT, never on balance
// ---------------------------------------------------------------------------

test('🔴 on the real replay the board ranks on profit and NOT on balance', () => {
  const ledger = SCREEN.replay(SNAPS, startFor, { take: SNAPS.length });
  const rows = computeBoard(MEMBERS, ledger, { selfUserId: 'u-cy' });

  // sorted descending by profit
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i - 1].profit >= rows[i].profit,
      `profit out of order at ${i}: ${rows[i - 1].profit} then ${rows[i].profit}`);
  }
  // and it is a DIFFERENT order from ranking on balance — the rule has teeth on
  // this exact data, which is the only reason the test is worth running.
  const byBalance = [...rows].sort((a, b) => b.balance - a.balance).map((r) => r.userId);
  const byProfit = rows.map((r) => r.userId);
  assert.notDeepEqual(byProfit, byBalance,
    'ranking on balance produced the same order — this replay no longer proves the rule');
  console.log('    by profit :', rows.map((r) => `${r.displayName} ${r.profit >= 0 ? '+' : ''}${r.profit} (bal ${r.balance}, start ${r.start})`).join('  '));
  console.log('    by balance:', byBalance.join(', '), '<- REORDERED');
});

test('🔴 a referral buys a deeper bench and never a place', () => {
  const ledger = SCREEN.replay(SNAPS, startFor, { take: SNAPS.length });
  const rows = computeBoard(MEMBERS, ledger, { selfUserId: 'u-cy' });
  const eve = rows.find((r) => r.userId === 'u-eve');   // 5 referrals -> start 200
  const ann = rows.find((r) => r.userId === 'u-ann');   // 0 referrals -> start 100
  assert.equal(eve.start, 200);
  assert.equal(ann.start, 100);
  const richer = rows.reduce((a, b) => (b.balance > a.balance ? b : a));
  assert.ok(richer.rank !== 1 || richer.profit === rows[0].profit,
    'the richest row took first place without the best profit');
});

// ---------------------------------------------------------------------------
// 4 — 🔴 the two boards never sum
// ---------------------------------------------------------------------------

test('🔴 no pool quantity exists anywhere on this screen', () => {
  for (const word of ['weekPoints', 'seasonPoints', 'parlayPoints', 'StandingsRow']) {
    // `LiveStandingsRow` mentions are fine; the bare pool row type is not.
    const hits = SCREEN_SRC.split('\n').filter((l) => l.includes(word) && !l.includes('LiveStandingsRow'));
    // A comment naming the OTHER board is how the next reader is told they are
    // different, so only code lines fail.
    const code = hits.filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l));
    assert.deepEqual(code, [], `${word} appears in code: ${code.join(' | ')}`);
  }
  const rowFields = ['balance', 'start', 'profit', 'committed', 'calls', 'landed', 'missed', 'voided', 'streak'];
  for (const f of rowFields) {
    assert.ok(new RegExp(`\\b${f}\\b`).test(SCREEN_SRC), `LiveStandingsRow.${f} is never read`);
  }
});

test('the balance is Marbles, and nothing near it can be bought', () => {
  const banned = /\b(credits?|coins?|top-?up|purchase|buy|refill\b)/i;
  const offenders = SCREEN_CODE.split('\n')
    .map((l, i) => [i + 1, l])
    .filter(([, l]) => banned.test(l))
    // "refill" is allowed in the sentence "Marbles refill every game" - that is
    // the bank refilling, not a purchase. Anything else fails.
    .filter(([, l]) => !/Marbles refill every game/.test(l));
  assert.deepEqual(offenders, [], `banned currency words: ${JSON.stringify(offenders)}`);
  assert.ok(/Marbles/.test(SCREEN_CODE));
  assert.ok(!banned.test(CSS_CODE));
});

// ---------------------------------------------------------------------------
// 5 — the badge set
// ---------------------------------------------------------------------------

const KEYS = ['win', 'top', 'day', 'crazy', 'ref'];

test('🔴 the ring is the constant: one color, all fifteen, earned and locked', () => {
  const rings = new Set();
  for (const key of KEYS) {
    for (const tier of [0, 1, 2]) {
      for (const locked of [false, true]) {
        const svg = SCREEN.badgeSvg(key, tier, locked, 34);
        const m = [...svg.matchAll(/r="10\.9"[^/]*stroke="([^"]+)"/g)].map((x) => x[1]);
        assert.equal(m.length, 1, `${key}/${tier}/${locked}: one ring, found ${m.length}`);
        rings.add(m[0]);
      }
    }
  }
  assert.equal(rings.size, 1, `the ring changed color: ${[...rings].join(', ')}`);
  console.log('    ring:', [...rings][0], 'across 15 badges x earned/locked');
});

test('🔴 tier lives in the pips and nowhere else', () => {
  for (const key of KEYS) {
    const svgs = [0, 1, 2].map((t) => SCREEN.badgeSvg(key, t, false, 34));
    // strip the pip row; everything else must be byte-identical across tiers.
    const body = svgs.map((s) => s.replace(/<circle cx="[\d.]+" cy="27"[^>]*\/>/g, ''));
    assert.equal(body[0], body[1], `${key}: bronze and silver differ outside the pips`);
    assert.equal(body[1], body[2], `${key}: silver and gold differ outside the pips`);
    // and the pips DO change
    assert.notEqual(svgs[0], svgs[1], `${key}: bronze and silver are the same drawing`);
    assert.notEqual(svgs[1], svgs[2], `${key}: silver and gold are the same drawing`);
  }
});

test('a locked tier is the same mark in outline, not a padlock', () => {
  for (const key of KEYS) {
    const on = SCREEN.badgeSvg(key, 1, false, 34);
    const off = SCREEN.badgeSvg(key, 1, true, 34);
    const glyph = (s) => (s.match(/<g fill="[^"]*"[^>]*>([\s\S]*?)<\/g>/) || [])[1];
    assert.equal(glyph(off), glyph(on), `${key}: the locked glyph is a different drawing`);
    assert.ok(!/padlock|lock|\?/.test(off), `${key}: locked badge drew something other than the mark`);
  }
});

test('🔴 the badge metals are a fixed scale and cannot be reached by team color', () => {
  for (const key of KEYS) {
    for (const tier of [0, 1, 2]) {
      for (const locked of [false, true]) {
        const svg = SCREEN.badgeSvg(key, tier, locked, 34);
        assert.ok(!/--accent|--team-a|--team-b|--maroon|--gold/.test(svg),
          `${key}/${tier}: a team or accent token reached the badge`);
      }
    }
  }
});

test('the pips are big enough to read at 34px — the thing the reference gets wrong', () => {
  const svg = SCREEN.badgeSvg('win', 1, false, 34);
  const r = Number((svg.match(/cy="27" r="([\d.]+)"/) || [])[1]);
  const viewW = Number((svg.match(/viewBox="0 0 (\d+)/) || [])[1]);
  const px = (r * 2 * 34) / viewW;
  // sports-live/ncaalive/server.py:2615 uses r=0.95 on a 24 box => 2.7px across.
  const reference = (0.95 * 2 * 34) / 24;
  assert.ok(px >= 4, `pip is ${px.toFixed(2)}px across at 34px`);
  console.log(`    pip diameter at 34px: ${px.toFixed(2)}px (reference implementation: ${reference.toFixed(2)}px)`);
});

test('five families of three — a badge you have earned still has somewhere to go', () => {
  const src = SCREEN_SRC.match(/const FAMILIES = \[([\s\S]*?)\n\];/)[1];
  assert.equal((src.match(/^\s{2}\['/gm) || []).length, 5);
  for (const key of KEYS) assert.ok(src.includes(`'${key}'`), `${key} missing`);
  // the names are the reference's own, deliberately unchanged
  for (const n of ['Game winner', 'Top five', 'Day winner', 'Crazy call', 'Recruiter']) {
    assert.ok(src.includes(n), `${n} was renamed in code — that is a proposal, not a commit`);
  }
});

// ---------------------------------------------------------------------------
// 6 — the states, and what each one has to carry
// ---------------------------------------------------------------------------

test('every state named in the dispatch is a route', () => {
  const states = SCREEN.states;
  for (const s of ['ready', 'alone', 'settling', 'final', 'empty', 'loading', 'offline', 'error']) {
    assert.ok(states.includes(s), `${s} is not a route`);
  }
  assert.ok(states.includes('just-unlocked'));
  console.log('    routes:', states.join(', '));
});

test('🔴 alone: a leaderboard of two is not a leaderboard, and the screen says so', () => {
  assert.ok(/aloneBlock/.test(SCREEN_SRC));
  assert.ok(/only one on this board/i.test(SCREEN_SRC));
  // and the table is REPLACED rather than shown with one row
  assert.ok(/state === 'alone' \|\| data\.rows\.length < 2/.test(SCREEN_SRC));
  assert.equal(MIN_FIELD_FOR_PLACING, 8);
  assert.equal(canPlace(new Array(7).fill({})), false);
  assert.equal(canPlace(new Array(8).fill({})), true);
});

test('settling leaves Marbles committed, and the row still says so', () => {
  const ledger = SCREEN.replay(SNAPS, startFor, { take: 200, openTail: 4 });
  const rows = computeBoard(MEMBERS, ledger, { selfUserId: 'u-cy' });
  const committed = rows.filter((r) => r.committed > 0);
  assert.ok(committed.length >= 3, `only ${committed.length} rows have Marbles on the table`);
  for (const r of committed) {
    assert.equal(r.balance, r.start + rows.find((x) => x.userId === r.userId).profit);
  }
  console.log('    committed:', committed.map((r) => `${r.displayName} ${r.committed}`).join(', '));
});

test('nobody is eliminated — a zero balance is a row like any other', () => {
  const rows = computeBoard(
    [{ userId: 'z', displayName: 'Zed', start: 100 }],
    [{ userId: 'z', snapId: 's', side: 'run', stake: 100, p: 0.5, state: 'settled', landed: false, delta: -100 }]
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].balance, 0);
  const dead = /eliminat\w*|locked out|out of the game|game over|no Marbles left/i;
  const copy = SCREEN_CODE.replace(/Nobody is knocked out and nothing here can be bought\./g, '');
  assert.ok(!dead.test(copy), 'the screen tells somebody they are out');
});

// ---------------------------------------------------------------------------
// 7 — the design rules that fail a piece
// ---------------------------------------------------------------------------

test('no box-shadow, no --maroon, no --gold, no dependency', () => {
  assert.ok(!/box-shadow/i.test(CSS_CODE), 'depth is 1px solid var(--line)');
  assert.ok(!/--maroon|--gold/.test(CSS_CODE), 'read --accent; the accent swaps token on dark');
  assert.ok(!/--maroon|--gold/.test(SCREEN_CODE), 'read --accent, never the two it swaps between');
  assert.ok(/var\(--accent\)/.test(CSS_CODE), 'the accent indirection is never read');
  assert.ok(!/@import|from ['"]https?:|<img|icon-font|\.woff/.test(SCREEN_CODE + CSS_CODE));
  assert.ok(!/espncdn|logo/i.test(SCREEN_CODE + CSS_CODE), 'no marks, ever');
});

test('every rule is scoped and nothing is written at :root', () => {
  const rules = CSS_CODE
    .split('}').map((s) => s.split('{')[0].trim()).filter(Boolean)
    .filter((s) => !s.startsWith('@') && s !== '');
  for (const sel of rules) {
    assert.ok(!/(^|\s|,):root/.test(sel), `:root written by a screen: ${sel}`);
    for (const part of sel.split(',').map((s) => s.trim())) {
      if (!part) continue;
      assert.ok(/^\.(scr-l6-board|l6-)/.test(part), `unscoped selector: ${part}`);
    }
  }
});

test('every figure is tabular', () => {
  // .num carries font-variant-numeric from tokens.css. Every element that gets
  // a number in it must carry it.
  const numbered = [
    'l6-score', 'l6-place', 'l6-move', 'l6-made', 'l6-stat-v',
    'l6-chip', 'l6-c-pos', 'l6-c-hit', 'l6-c-made', 'l6-sub', 'l6-bcount', 'l6-fam-p'
  ];
  for (const cls of numbered) {
    const re = new RegExp(`'[^']*\\b${cls}\\b[^']*num|'${cls} num|'l6-[a-z-]* num[^']*'`, '');
    assert.ok(new RegExp(`${cls}[^']*num|num[^']*${cls}`).test(SCREEN_SRC),
      `.${cls} takes a number and is not .num`);
    void re;
  }
});

test('the tap minimum binds controls, and a standings row is a link', () => {
  assert.ok(/\.l6-invite\s*\{[^}]*min-height:\s*var\(--tap-min\)/.test(CSS_SRC));
  assert.ok(/\.l6-row\s*\{[^}]*min-height:\s*52px/.test(CSS_SRC));
  assert.ok(/el\('a', 'l6-row'/.test(SCREEN_SRC), 'a standings row is an anchor, not a button');
});

test('US spelling', () => {
  const bad = /\b(colour|centre|grey|behaviour|analyse|catalogue)\w*/i;
  for (const [name, src] of [['screen', SCREEN_SRC], ['css', CSS_SRC]]) {
    const hits = src.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => bad.test(l));
    assert.deepEqual(hits, [], `${name}: ${JSON.stringify(hits)}`);
  }
});

test('the screen never fetches at render time', () => {
  const render = SCREEN_SRC.slice(SCREEN_SRC.indexOf('export function render'));
  assert.ok(!/fetch\(/.test(render), 'a screen that fetches fails its piece');
});
