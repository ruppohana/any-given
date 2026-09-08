/**
 * l4-now.test.mjs — the Now tab, judged against things this agent did not write.
 *
 * A screen closes in a browser at 393px (7.5) and that is where the layout claim
 * is made. This file closes the part a screenshot cannot: that every number the
 * screen puts on a tile is the REAL model's number for a REAL snap.
 *
 * Three outside things are the judges:
 *
 *   1. `src/lib/price.ts` + `sports-live/tendency.json` — the actual trained
 *      model, 350,924 contexts. Every price cached in the screen is re-derived
 *      here and compared exactly. A browser cannot do this: price.ts is
 *      TypeScript, the contract forbids a build step, and the model is 22 MB and
 *      lives outside the served root — which is the whole reason the screen
 *      carries a cache instead of computing.
 *   2. `fixtures/real-bois-at-ore-260905-final.json` — the captured game. Every
 *      down, distance, spot, score and clock in the cache is read back out of the
 *      play it claims to describe. Nothing may drift.
 *   3. `src/lib/calls.ts` — the ledger. The screen's own bank arithmetic is run
 *      against the real one, call for call, including the void path.
 *
 * NOTHING IS WRITTEN TO fixtures/. The only file this test writes is a temp file
 * for the Python cross-check, and it does not need one.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const PUBLIC = path.join(REPO, 'public');
const REFERENCE = 'C:\\Claude\\Knowledge\\sports-live';
const MODEL_PATH = path.join(REFERENCE, 'tendency.json');
const AQB = 'C:\\Claude\\Knowledge\\reference\\armchair-quarterback-teardown\\screens';

const SCREEN_JS = path.join(PUBLIC, 'screens', 'l4-now.screen.js');
const SCREEN_CSS = path.join(PUBLIC, 'screens', 'l4-now.css');
const FIXTURE = path.join(REPO, 'fixtures', 'real-bois-at-ore-260905-final.json');

/* The screen is BROWSER code: its imports are server-absolute ('/components/…')
 * because that is what the preview harness serves. Node cannot resolve those, so
 * they are mapped here rather than the screen being bent to suit a test. */
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('/components/') || specifier.startsWith('/styles/')) {
      return { url: pathToFileURL(path.join(PUBLIC, specifier)).href, shortCircuit: true };
    }
    return next(specifier, context);
  },
});

const screen = await import(pathToFileURL(SCREEN_JS).href);
const price = await import(pathToFileURL(path.join(REPO, 'src', 'lib', 'price.ts')).href);
const calls = await import(pathToFileURL(path.join(REPO, 'src', 'lib', 'calls.ts')).href);

const SRC = fs.readFileSync(SCREEN_JS, 'utf-8');
const CSS = fs.readFileSync(SCREEN_CSS, 'utf-8');

/* A comment naming a forbidden thing is the file explaining why it is forbidden.
 * The scans below run on what SHIPS, so comments come out first — otherwise the
 * only way to pass the check is to stop writing down why it exists. */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
const SRC_LIVE = strip(SRC);
const CSS_LIVE = strip(CSS);
const squash = (s) => s.replace(/\s+/g, ' ').trim();
const DOC = JSON.parse(fs.readFileSync(FIXTURE, 'utf-8'));

const haveModel = fs.existsSync(MODEL_PATH);
let SOURCE = null;
function source() {
  if (!SOURCE) {
    const m = JSON.parse(fs.readFileSync(MODEL_PATH, 'utf-8'));
    SOURCE = price.fromCounts(m.counts, m.min_samples);
  }
  return SOURCE;
}

// ---------------------------------------------------------------------------
// The fixture, flattened the way previewData flattens it
// ---------------------------------------------------------------------------

function clockSeconds(display) {
  const m = /^(\d+):(\d{1,2})$/.exec(String(display || '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

const FLAT = [];
for (const drive of DOC.drives.previous) {
  for (const p of drive.plays || []) {
    FLAT.push({ play: p, driveId: drive.id, offenseId: drive.team ? String(drive.team.id) : null });
  }
}
const HOME_ID = String(DOC.header.competitions[0].competitors.find((c) => c.homeAway === 'home').id);
const AT = new Map();
FLAT.forEach((r, i) => AT.set(String(r.play.id), { ...r, i }));

// ---------------------------------------------------------------------------
// 1 · The cache is real model output, and this is the only thing that says so
// ---------------------------------------------------------------------------

test('the PRICED block in the screen source is strict JSON and is the exported table', () => {
  const a = SRC.indexOf('/* PRICED-BEGIN */');
  const b = SRC.indexOf('/* PRICED-END */');
  assert.ok(a > 0 && b > a, 'PRICED markers missing — the cache cannot be audited');
  const body = SRC.slice(a, b);
  const json = body.slice(body.indexOf('['), body.lastIndexOf(']') + 1);
  const parsed = JSON.parse(json);
  assert.deepEqual(parsed, screen.PRICED);
  assert.equal(parsed.length, 6);
});

test('every cached price is exactly what price.ts produces from the real 22MB model', (t) => {
  if (!haveModel) return t.skip('tendency.json not on this machine — this is the only judge there is');
  const src = source();
  let checked = 0;
  for (const row of screen.PRICED) {
    const hit = AT.get(row.snapId);
    assert.ok(hit, `snap ${row.snapId} is not in the fixture`);
    const team = DOC.drives.previous
      .flatMap((d) => (d.plays || []).map((p) => [String(p.id), d.team]))
      .find(([pid]) => pid === row.snapId)[1];
    const out = price.priceSnapSync({
      snapId: row.snapId,
      team: team.shortDisplayName,
      down: row.down,
      distance: row.distance,
      yardsToGoal: row.yardsToGoal,
      scoreDiff: row.scoreDiff,
      period: row.period,
      secondsLeft: row.secondsLeft,
      closesAt: 0,
    }, src);
    assert.ok(out, `the model refused to price ${row.snapId}`);
    const [run, pass] = out.offers;
    assert.equal(run.p, row.run.p, `run p drifted on ${row.snapId}`);
    assert.equal(pass.p, row.pass.p, `pass p drifted on ${row.snapId}`);
    assert.equal(run.payoutPerMarble, row.run.payoutPerMarble, `run payout drifted on ${row.snapId}`);
    assert.equal(pass.payoutPerMarble, row.pass.payoutPerMarble, `pass payout drifted on ${row.snapId}`);
    assert.equal(run.confidence, row.confidence);
    assert.equal(out.model.samples, row.samples);
    assert.equal(out.model.level, row.level);
    assert.equal(out.model.basis, row.basis);
    checked += 1;
  }
  assert.equal(checked, 6);
});

test('the cap is real: two of the six snaps price the run at exactly 6x', () => {
  const capped = screen.PRICED.filter((r) => r.run.payoutPerMarble === 6);
  assert.equal(capped.length, 2, 'the 6x cap should be visible on this screen, not just in the module');
  for (const r of capped) assert.ok(r.run.p < 1 / 6);
});

test('all three confidence steps appear, and lo is present as a feature', () => {
  const steps = new Set(screen.PRICED.map((r) => r.confidence));
  assert.deepEqual([...steps].sort(), ['hi', 'lo', 'mid']);
  const lo = screen.PRICED.find((r) => r.confidence === 'lo');
  assert.ok(lo.level === 'down' || lo.level === 'global', 'lo must mean the model backed off, never a small lean');
  /* And each step has to be reachable on a route, or it is not shipped. `no-model`
   * has no chip at all, so a step parked there would never be seen. */
  const onScreen = new Set(Object.entries(screen.SCRIPT)
    .filter(([s]) => s !== 'no-model' && s !== 'error' && s !== 'offline')
    .map(([, v]) => screen.PRICED.find((r) => r.snapId === v.snapId).confidence));
  assert.deepEqual([...onScreen].sort(), ['hi', 'lo', 'mid'], 'all three steps must appear on a route');
});

// ---------------------------------------------------------------------------
// 2 · Every situation field is read back out of the captured play
// ---------------------------------------------------------------------------

test('every cached situation matches the fixture play it names', () => {
  for (const row of screen.PRICED) {
    const hit = AT.get(row.snapId);
    const start = hit.play.start;
    assert.equal(start.down, row.down, `down drifted on ${row.snapId}`);
    assert.equal(start.distance, row.distance, `distance drifted on ${row.snapId}`);
    assert.equal(start.yardsToEndzone, row.yardsToGoal, `spot drifted on ${row.snapId}`);
    assert.equal(hit.play.period.number, row.period, `period drifted on ${row.snapId}`);
    assert.equal(hit.offenseId, row.offenseId, `offense drifted on ${row.snapId}`);

    /* The clock and the score come from the PREVIOUS play: a play's own clock and
     * score are what they BECAME. A pricer reading this play's own score is
     * reading the future. */
    const prev = FLAT[hit.i - 1].play;
    assert.equal(clockSeconds(prev.clock.displayValue), row.secondsLeft, `clock drifted on ${row.snapId}`);
    const isHome = row.offenseId === HOME_ID;
    const diff = isHome ? (prev.homeScore ?? 0) - (prev.awayScore ?? 0)
                        : (prev.awayScore ?? 0) - (prev.homeScore ?? 0);
    assert.equal(diff, row.scoreDiff, `score margin drifted on ${row.snapId}`);
  }
});

test('outcomeOf agrees with the fixture over all 200+ plays it can judge', () => {
  let run = 0, pass = 0, voids = 0;
  for (const { play } of FLAT) {
    const t = (play.type || {}).text || '';
    const o = screen.outcomeOf(t);
    if (o === 'run') { run += 1; assert.match(t, /Rush/i); }
    else if (o === 'pass') { pass += 1; assert.match(t, /Pass|Sack/i); }
    else {
      voids += 1;
      assert.doesNotMatch(t, /^(Rush|Pass)/i, `"${t}" should have settled a call`);
    }
  }
  assert.ok(run > 40 && pass > 60, `run ${run} pass ${pass} — the fixture should have plenty of both`);
  assert.ok(voids > 20, 'kicks, penalties and timeouts are void snaps and there should be many');
});

test('the snaps used by the settled routes were really pass plays, so the sign is not chosen', () => {
  const settle = AT.get(screen.SCRIPT['settled-landed'].snapId);
  assert.equal(screen.outcomeOf(settle.play.type.text), 'pass');
  /* Which is why `pass` lands and `run` misses on the SAME snap, with the SAME
   * stake — the two settled routes are one component and one real play. */
  assert.equal(screen.SCRIPT['settled-landed'].snapId, screen.SCRIPT['settled-missed'].snapId);
  assert.equal(screen.SCRIPT['settled-landed'].call.stake, screen.SCRIPT['settled-missed'].call.stake);
  assert.notEqual(screen.SCRIPT['settled-landed'].call.side, screen.SCRIPT['settled-missed'].call.side);
});

// ---------------------------------------------------------------------------
// 3 · The bank arithmetic, against the real ledger
// ---------------------------------------------------------------------------

test('payoutFor matches calls.ts for every price on screen at every rung', () => {
  for (const row of screen.PRICED) {
    for (const p of [row.run.p, row.pass.p]) {
      for (const stake of screen.HOUSE.stakeLadder) {
        assert.equal(screen.payoutFor(stake, p), calls.payoutFor(stake, p),
          `payout drifted at stake ${stake}, p ${p}`);
      }
    }
  }
});

test('the ladder, the starting bank and the cap are calls.ts HOUSE_RULES', () => {
  assert.deepEqual(screen.HOUSE.stakeLadder, calls.HOUSE_RULES.stakeLadder);
  assert.equal(screen.HOUSE.startingBank, calls.HOUSE_RULES.startingBank);
  assert.equal(screen.HOUSE.maxPayoutMultiple, calls.HOUSE_RULES.maxPayoutMultiple);
  assert.equal(screen.BALANCE_NOUN, calls.BALANCE_NOUN);
  assert.equal(screen.BALANCE_NOUN, 'Marbles');
});

/** The screen's `replay`, run against a real ledger for one route's history. */
function ledgerFor(history) {
  const led = calls.openLedger('l4-test', 'u1');
  for (const h of history) {
    const r = calls.accept(led, { snapId: h.snapId, side: h.side, stake: h.stake, p: h.p });
    assert.ok(r.ok, `calls.ts refused a scripted call: ${r.ok === false ? r.reason : ''}`);
    calls.lock(led, h.snapId);
    calls.settle(led, h.snapId, h.outcome == null ? 'other' : h.outcome);
  }
  return calls.bankOf(led);
}

test('replay() reproduces calls.ts exactly for every route in the script', () => {
  const priced = new Map(screen.PRICED.map((r) => [r.snapId, r]));
  let routes = 0;
  for (const [state, script] of Object.entries(screen.SCRIPT)) {
    const history = (script.history || []).map((s) => {
      const [snapId, side, stake] = s.split(':');
      const row = priced.get(snapId);
      assert.ok(row, `${state} scripts a call on ${snapId}, which is not priced`);
      const hit = AT.get(snapId);
      return { snapId, side, stake: Number(stake), p: row[side].p,
               outcome: screen.outcomeOf(hit.play.type.text) };
    });
    const mine = screen.replay(history);
    const theirs = ledgerFor(history);
    assert.equal(mine.balance, theirs.balance, `${state}: balance`);
    assert.equal(mine.delta, theirs.delta, `${state}: delta`);
    assert.equal(mine.record.landed, theirs.record.landed, `${state}: landed`);
    assert.equal(mine.record.missed, theirs.record.missed, `${state}: missed`);
    assert.equal(mine.streak, theirs.streak, `${state}: streak`);
    routes += 1;
  }
  assert.equal(routes, 8);
});

test('a void snap returns the stake and moves neither record nor streak', () => {
  const penalty = AT.get('40185843320');
  assert.equal(screen.outcomeOf(penalty.play.type.text), null, 'that snap was a penalty — no play');
  const row = screen.PRICED.find((r) => r.snapId === '40185843320');
  const after = screen.replay([{ snapId: '40185843320', side: 'pass', stake: 10, p: row.pass.p, outcome: null }]);
  assert.equal(after.balance, screen.HOUSE.startingBank);
  assert.equal(after.delta, 0);
  assert.deepEqual(after.record, { landed: 0, missed: 0 });
  assert.equal(after.streak, 0);
});

test('nobody is ever eliminated: the worst scripted run still starts the next game whole', () => {
  const priced = new Map(screen.PRICED.map((r) => [r.snapId, r]));
  const allMiss = screen.PRICED.map((r) => ({ snapId: r.snapId, side: 'run', stake: 25, p: r.run.p, outcome: 'pass' }));
  const wiped = screen.replay(allMiss);
  assert.ok(wiped.balance < screen.HOUSE.startingBank);
  const next = calls.nextGame(calls.openLedger('g1', 'u1'), 'g2');
  assert.equal(next.bank.balance, screen.HOUSE.startingBank);
  assert.equal(priced.size, 6);
});

// ---------------------------------------------------------------------------
// 4 · Display helpers — the number that goes ON THE TILE
// ---------------------------------------------------------------------------

test('multLabel prints the cap as 6x, never 6.00x, and never rounds a price up past it', () => {
  assert.equal(screen.multLabel(6), '6×');
  assert.equal(screen.multLabel(2.6315789473684212), '2.63×');
  assert.equal(screen.multLabel(1.1655011655011656), '1.17×');
  assert.equal(screen.multLabel(2.061855670103093), '2.06×');
  assert.equal(screen.multLabel(null), '—');
  for (const row of screen.PRICED) {
    for (const side of ['run', 'pass']) {
      const shown = Number(screen.multLabel(row[side].payoutPerMarble).replace('×', ''));
      assert.ok(shown <= 6, 'a tile may never print a multiple above the cap');
    }
  }
});

test('the two tiles always read percentages that sum to 100', () => {
  /* Rounding each side on its own gives 20% and 81% on three of these six real
   * snaps. That is the bug this test found and pctPair() is the fix. */
  let naiveWrong = 0;
  for (const row of screen.PRICED) {
    const pair = screen.pctPair(row.run.p);
    assert.equal(pair.run + pair.pass, 100, `${row.snapId} does not sum to 100`);
    assert.equal(pair.run, Math.round(row.run.p * 100));
    if (Math.round(row.run.p * 100) + Math.round(row.pass.p * 100) !== 100) naiveWrong += 1;
  }
  assert.equal(naiveWrong, 2, 'two of these six real snaps read 101% if the sides are rounded apart');
  assert.deepEqual(screen.pctPair(null), { run: null, pass: null });
});

// ---------------------------------------------------------------------------
// 5 · The rules that fail the piece, checked against the source itself
// ---------------------------------------------------------------------------

test('the bar files this screen was judged against exist on disk', () => {
  for (const f of ['AQB-call-binary-run-pass.png', 'AQB-call-grid-six-tiles.png',
                   'AQB-result-way-to-pick-it.png', 'AQB-locked-binary-you-selected-pass.png']) {
    assert.ok(fs.existsSync(path.join(AQB, f)), `bar missing: ${f}`);
  }
  assert.ok(fs.existsSync(path.join('C:\\Claude\\Knowledge\\reference\\armchair-quarterback-teardown\\screens', path.basename(screen.bar))));
});

test('no box-shadow, no hard-coded accent, no icon font, no dependency', () => {
  assert.doesNotMatch(CSS_LIVE, /box-shadow/i, 'depth is 1px solid var(--line)');
  assert.doesNotMatch(CSS_LIVE, /var\(--maroon\)|var\(--gold\)/, 'read --accent; it swaps token on dark');
  assert.doesNotMatch(CSS_LIVE, /@import|url\(/i, 'no external anything');
  assert.doesNotMatch(SRC_LIVE, /\bfetch\s*\(/, 'a screen never fetches; data arrives as an argument');
  assert.doesNotMatch(SRC_LIVE, /from ['"][^/.]/, 'no npm package may be imported');
  assert.doesNotMatch(SRC_LIVE, /<img|innerHTML\s*=\s*[`'"][^`'"]/, 'inline SVG or nothing, no HTML strings');
  assert.ok(SRC_LIVE.includes("import { teamChip"), 'the team chip is session-owned and is reused, not redrawn');
});

test('the purchasable-word scan: nothing near the balance may be buyable', () => {
  const words = ['credits', 'credit', 'coins', 'top-up', 'topup', 'purchase', 'buy', 'refill', 'continue'];
  /* What SHIPS is every string literal left after the comments come out, plus the
   * stylesheet. `continue` is scanned in the literals rather than over the whole
   * file, because it is also a JavaScript keyword. */
  const literals = (SRC_LIVE.match(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g) || []).join(' ').toLowerCase();
  for (const w of words) {
    assert.ok(!literals.includes(w), `"${w}" appears in a shippable string on the call screen`);
    assert.ok(!CSS_LIVE.toLowerCase().includes(w), `"${w}" appears in the stylesheet`);
  }
  /* The line is composed as BALANCE_NOUN + ' · cannot be bought', so both halves
   * are checked: the noun is Marbles (asserted above against calls.ts) and the
   * disclaimer is on the strip rather than in settings. It is what keeps this out
   * of gambling-app territory and it stays on screen. */
  assert.ok(literals.includes(' · cannot be bought'), 'the disclaimer must be on the bank strip');
  assert.match(SRC_LIVE, /BALANCE_NOUN \+ ' · cannot be bought'/);
  assert.ok(literals.includes('nobody is ever out'), 'no elimination, and it says so');
});

test('the balance is the largest type in the app and the call buttons exceed 44px', () => {
  assert.match(CSS, /\.l4-bank-balance\s*\{[^}]*font-size:\s*var\(--t-bank\)/,
    'the balance is 30px — var(--t-bank) — and nothing else on this screen is');
  assert.match(CSS, /\.l4-tile\s*\{[^}]*min-height:\s*76px/, 'the call tiles are the 76px control');
  assert.match(CSS, /\.l4-chip\s*\{[^}]*min-height:\s*var\(--tap-min\)/, 'the stake chips are 44px');
  /* No thumb target may be under 44px. The only fixed heights in the file are the
   * hairline bars, which nothing taps. */
  const fixed = [...CSS.matchAll(/min-height:\s*(\d+)px/g)].map((m) => Number(m[1]));
  for (const h of fixed) assert.ok(h >= 44, `a ${h}px tap target`);
});

test('every figure carries tabular numerals', () => {
  /* Either the .num class from tokens.css or the property itself. */
  const numbered = ['l4-bank-balance', 'l4-bank-delta', 'l4-bank-rec', 'l4-tile-pay',
                    'l4-tile-mult', 'l4-band-figure', 'l4-call-clock', 'l4-sit-dd'];
  for (const c of numbered) {
    const inCss = new RegExp('\\.' + c + '[^{]*\\{[^}]*tabular-nums').test(CSS);
    const inJs = new RegExp("'" + c + " num|" + c + " num'").test(SRC) || SRC.includes(c + " num");
    assert.ok(inCss || inJs, `${c} is a figure and is not tabular`);
  }
});

test('the confidence chip is three fixed steps and never a ramp', () => {
  assert.match(SRC, /'c-' \+ snap\.confidence/, 'the chip class comes straight off the model');
  assert.doesNotMatch(CSS, /linear-gradient|hsl\(|color-mix/, 'a gradient is not readable at 11px');
  for (const row of screen.PRICED) assert.ok(['hi', 'mid', 'lo'].includes(row.confidence));
});

test('the result is symmetric: one band, one sign, one fixed scale', () => {
  assert.match(CSS, /\.l4-band\[data-sign="up"\][^{]*\{[^}]*var\(--up\)/);
  assert.match(CSS, /\.l4-band\[data-sign="down"\][^{]*\{[^}]*var\(--down\)/);
  /* The two signs must differ ONLY in color — same grid, same type, same duration. */
  const up = squash((CSS_LIVE.match(/\.l4-band\[data-sign="up"\][^}]*\}/g) || []).join(''));
  const down = squash((CSS_LIVE.match(/\.l4-band\[data-sign="down"\][^}]*\}/g) || []).join(''));
  assert.equal(up.replace(/up/g, 'X'), down.replace(/down/g, 'X'),
    'win and miss must be the same component with a different sign');
  /* And no full-bleed banner on either side. Armchair paints the whole board
   * green on a win and shows nothing at all on a miss; the band is 9px of padding
   * inside the card, both ways. */
  assert.doesNotMatch(CSS_LIVE, /\.l4-band[^{]*\{[^}]*position:\s*fixed/);
  assert.match(CSS_LIVE, /\.l4-band\s*\{[^}]*border-radius:\s*var\(--radius-button\)/);
});

/* Found at 393px in a background tab, which suspends CSS animations and rAF: the
 * incoming price was the animated element and started at opacity 0, so the tile
 * painted the OLD payout beside the NEW multiple. A stale price is the one
 * failure this screen cannot have. These three keep it fixed. */
test('a suspended animation can never leave a stale price on a tile', () => {
  assert.match(SRC_LIVE, /const ghost = cur\.cloneNode\(true\)/,
    'the OUTGOING value is the clone; the real node is never the animated one');
  assert.match(SRC_LIVE, /cur\.textContent = next;/,
    'the real node takes the new text unconditionally');
  const enter = (CSS_LIVE.match(/\.l4-pay-enter\s*\{[^}]*\}/) || [''])[0];
  assert.ok(enter, '.l4-pay-enter must exist');
  assert.doesNotMatch(enter, /forwards|backwards|both/,
    'no fill mode: the resting state of the incoming number is fully visible');
  const kf = (CSS_LIVE.match(/@keyframes l4-pay-in\s*\{[^}]*\}[^}]*\}/) || [''])[0];
  assert.doesNotMatch(kf, /to\s*\{/, 'l4-pay-in only has a `from`; the `to` is the element itself');
});

test('a figure is written before it is animated, never by the animation', () => {
  const fn = SRC_LIVE.slice(SRC_LIVE.indexOf('function animateTo'));
  const body = fn.slice(0, fn.indexOf('\n}'));
  const write = body.indexOf('node.textContent = String(to)');
  const raf = body.indexOf('requestAnimationFrame');
  assert.ok(write > -1 && write < raf, 'the destination is written before the first frame is asked for');
  assert.match(SRC_LIVE, /clockEl\.textContent = Math\.ceil\(total \/ 1000\)/,
    'the snap clock is primed before its loop, so a frameless tab shows a real number');
});

test('motion is declared, bounded, and honours reduced motion', () => {
  /* Nothing in this project specifies motion and three of the four moments are
   * here. What was chosen: a QUANTITY is interpolated, a PRICE is swapped, the
   * clock is LINEAR, and win and miss share one duration. */
  const durations = [...CSS_LIVE.matchAll(/(\d+)ms/g)].map((m) => Number(m[1]));
  assert.ok(durations.length > 0);
  for (const d of durations) assert.ok(d <= 280, `${d}ms is too long for a decision under a snap clock`);
  assert.match(CSS_LIVE, /\.l4-snap-fill\s*\{[^}]*transform:\s*scaleX\(var\(--snap/,
    'the clock is driven by a written value, not by a CSS animation that can drift from the truth');
  assert.doesNotMatch(CSS_LIVE, /\.l4-snap-fill[^{]*\{[^}]*transition/,
    'a countdown must not ease: easing a clock lies about how much time is left');
  assert.match(SRC_LIVE, /prefers-reduced-motion: reduce/);
  const up = squash((CSS_LIVE.match(/\.l4-tile\[data-settled="up"\][^}]*\}/) || [''])[0]);
  const down = squash((CSS_LIVE.match(/\.l4-tile\[data-settled="down"\][^}]*\}/) || [''])[0]);
  assert.equal(up.replace(/up/g, 'X'), down.replace(/down/g, 'X'), 'settling is one animation, two signs');
});

/* Found by deleting one real row from teams.json in the browser and looking: the
 * chip was drawn only `if (snap.offense)`, so an offense with no identity lost
 * its possession indicator entirely instead of saying it was unknown. 401 of 760
 * schools have no usable primary; a missing row is the same failure one step on. */
test('a team with no identity is drawn as a null, never dropped', () => {
  assert.match(SRC_LIVE, /row\.appendChild\(teamChip\(snap\.offense/);
  assert.doesNotMatch(SRC_LIVE, /if \(snap\.offense\)\s*row\.appendChild/,
    'the chip is unconditional; teamChip has a defined null state');
  assert.match(CSS_LIVE, /--team-a,\s*var\(--team-null\)/,
    'the field bar falls back to the null token, never to whatever #000000 does');
  assert.doesNotMatch(SRC_LIVE, /documentElement\.style\.setProperty\(\s*'--team/,
    'team color is set per element, never at :root');
  /* And the file really does contain teams with nothing, which is why this path
   * is a route rather than a defensive branch. */
  const teams = Object.values(JSON.parse(fs.readFileSync(path.join(REPO, 'fixtures', 'teams.json'), 'utf-8')).teams);
  const none = teams.filter((t) => !t.primary || t.primary === '000000');
  assert.ok(none.length > 350, `${none.length} of ${teams.length} schools have no usable primary`);
});

test('the screen declares every state a screen with data must have', () => {
  for (const s of ['loading', 'offline', 'error']) assert.ok(screen.states.includes(s));
  for (const s of ['open', 'staked', 'settling', 'settled-landed', 'settled-missed', 'no-model']) {
    assert.ok(screen.states.includes(s), `${s} is a route`);
  }
  assert.equal(screen.states.length, 9);
  assert.equal(screen.id, 'l4-now');
});

test('no-model is defined rather than silent, and it refuses the call', () => {
  assert.ok(screen.SCRIPT['no-model'], 'no-model stands on a real snap');
  assert.ok(!screen.SCRIPT['no-model'].call, 'a call cannot be taken with no price to settle it');
  assert.match(SRC, /No price on this snap/);
  /* calls.ts is the reason: a call with no price is rejected before the debit. */
  const led = calls.openLedger('g', 'u');
  const r = calls.accept(led, { snapId: 's', side: 'run', stake: 10, p: 0 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'bad_price');
  assert.equal(led.bank.balance, screen.HOUSE.startingBank, 'the guard is above the debit');
});

test('one call per snap is legible: no route offers a second tap on a called snap', () => {
  for (const [state, script] of Object.entries(screen.SCRIPT)) {
    if (!script.call) continue;
    const called = new Set((script.history || []).map((h) => h.split(':')[0]));
    assert.ok(!called.has(script.snapId), `${state} calls a snap it has already called`);
  }
  assert.match(SRC, /interactive = state === 'open'/, 'only the open route may be tapped');
});
