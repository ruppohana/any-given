/* L2 - the broadcast delay, tested against the REAL captured game.
 *
 * Rule zero: a test whose data you also invented is the same assumption written
 * twice. So nothing in this file makes up a play, a timestamp or a gap. Every
 * assertion runs over fixtures/real-utep-at-ou-260905-final.json, whose plays
 * carry ESPN's own `wallclock` stamps - which is the only reason the hold can be
 * tested at all rather than described.
 *
 * The screen module is browser code and imports '/components/*.js', which node
 * cannot resolve. It is loaded here by rewriting those specifiers to real file:
 * URLs and importing the result - THE ACTUAL SOURCE ON DISK, not a copy of it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const src = await readFile(join(ROOT, 'public', 'screens', 'l2-delay.screen.js'), 'utf8');
const rewritten = src.replace(/'\/components\/([^']+)'/g,
  (_m, f) => JSON.stringify(pathToFileURL(join(ROOT, 'public', 'components', f)).href));
const L2 = await import('data:text/javascript;base64,' + Buffer.from(rewritten).toString('base64'));

const teams = JSON.parse(await readFile(join(ROOT, 'fixtures', 'teams.json'), 'utf8'));
const fixtures = {
  teams,
  load: async (name) => JSON.parse(await readFile(join(ROOT, 'fixtures', name + '-260905-final.json'), 'utf8'))
};

const data = await L2.previewData(fixtures, 'ready');
const { plays, anchorMs } = data;

/* ------------------------------------------------------ the fixture itself */

test('the real game supplies wallclock-stamped plays, in order', () => {
  assert.ok(plays.length > 100, 'expected a full game, got ' + plays.length + ' plays');
  for (let i = 1; i < plays.length; i++) {
    assert.ok(plays[i].wall >= plays[i - 1].wall, 'plays must be sorted ascending by wallclock');
  }
  for (const p of plays) {
    assert.ok(Number.isFinite(p.wall), 'every play carries a parsed wallclock');
    assert.ok(typeof p.text === 'string' && p.text.length > 0);
  }
});

test('real snap-to-snap gaps are what set the size of the hold', () => {
  const gaps = [];
  for (let i = 1; i < plays.length; i++) gaps.push((plays[i].wall - plays[i - 1].wall) / 1000);
  gaps.sort((a, b) => a - b);
  const q = (f) => gaps[Math.floor(gaps.length * f)];
  /* MEASURED, not chosen: p25 39s, MEDIAN 45s, p75 60s over 157 real gaps. The
   * reference implementation's documented `--delay 45  # ESPN+ runs ~45s late`
   * turns out to be exactly the median snap-to-snap gap in a real 2026 game, so
   * a 45s hold sits on one play about half the time and none the other half.
   * That is why the strip has to read "nothing waiting" as comfortably as it
   * reads "2 plays waiting" - an empty queue at 45s is the normal case. */
  assert.equal(q(0.25), 39);
  assert.equal(q(0.5), 45);
  assert.equal(q(0.75), 60);
  assert.equal(L2.DEFAULT_DELAY_MS / 1000, q(0.5));
});

/* ----------------------------------------------------------- the hold math */

test('at the default delay the board is genuinely behind, and something is held', () => {
  const w = L2.holdWindow(plays, anchorMs, L2.DEFAULT_DELAY_MS, null);
  assert.ok(w.heldCount >= 1, 'nothing was held - the delay is doing no work');
  assert.ok(w.released.length >= 1, 'nothing was released - there is no board to hold');
  const arrived = plays.filter((p) => p.wall <= anchorMs);
  assert.equal(w.released.length + w.held.length, arrived.length, 'released + held is everything that has arrived');
  assert.ok(w.released.length < arrived.length, 'the board is behind what the client already has');
  assert.notEqual(w.current.id, arrived[arrived.length - 1].id, 'the board must not be showing the newest play it holds');
  assert.ok(w.ageMs >= 0);
});

test('NOTHING PAST THE CUTOFF CAN REACH THE BOARD - the spoiler proof', () => {
  const w = L2.holdWindow(plays, anchorMs, L2.DEFAULT_DELAY_MS, null);
  const cutoff = anchorMs - L2.DEFAULT_DELAY_MS;
  for (const p of w.released) assert.ok(p.wall <= cutoff, 'released a play newer than the cutoff');
  for (const p of w.held) assert.ok(p.wall > cutoff, 'held a play older than the cutoff');
  const heldIds = new Set(w.held.map((p) => p.id));
  assert.ok(!heldIds.has(w.current.id), 'the play on screen is also in the queue');
});

test('the countdown is the real arithmetic on the next real play', () => {
  const w = L2.holdWindow(plays, anchorMs, L2.DEFAULT_DELAY_MS, null);
  assert.equal(w.nextReleaseInMs, w.held[0].wall + L2.DEFAULT_DELAY_MS - anchorMs);
  assert.ok(w.nextReleaseInMs > 0 && w.nextReleaseInMs <= L2.DEFAULT_DELAY_MS);
});

test('the hold shrinks and grows monotonically with the slider', () => {
  let last = -1;
  for (const ms of L2.PRESETS_MS) {
    const w = L2.holdWindow(plays, anchorMs, ms, null);
    assert.ok(w.heldCount >= last, 'a longer delay must never hold fewer plays');
    last = w.heldCount;
  }
});

test('delay zero holds nothing and shows the newest play', () => {
  const w = L2.holdWindow(plays, anchorMs, 0, null);
  assert.equal(w.heldCount, 0);
  assert.equal(w.current.id, plays.filter((p) => p.wall <= anchorMs).pop().id);
  assert.equal(w.nextReleaseInMs, null);
});

/* -------------------------------------------------------------- offline */

test('offline: the delay is a buffer, and it drains one second per second', () => {
  const drop = anchorMs;
  const a = L2.holdWindow(plays, drop, L2.DEFAULT_DELAY_MS, drop);
  const b = L2.holdWindow(plays, drop + 10000, L2.DEFAULT_DELAY_MS, drop);
  assert.equal(a.bufferMs - b.bufferMs, 10000, 'the buffer must drain in real time');
  assert.ok(b.released.length >= a.released.length, 'held plays keep releasing while offline');
  assert.ok(b.heldCount <= a.heldCount);
});

test('offline: the buffer runs out and the board freezes rather than lying', () => {
  const drop = anchorMs;
  const newest = plays.filter((p) => p.wall <= drop).pop();
  const dry = newest.wall + L2.DEFAULT_DELAY_MS + 1000;
  const w = L2.holdWindow(plays, dry, L2.DEFAULT_DELAY_MS, drop);
  assert.equal(w.bufferMs, 0);
  assert.equal(w.heldCount, 0);
  assert.equal(w.current.id, newest.id, 'frozen on the last thing it actually knew');
  const later = L2.holdWindow(plays, dry + 60000, L2.DEFAULT_DELAY_MS, drop);
  assert.equal(later.released.length, w.released.length, 'a frozen board must not invent progress');
});

test('offline: at the drop, the buffer left is the delay minus how stale you are', () => {
  const drop = anchorMs;
  const newest = plays.filter((p) => p.wall <= drop).pop();
  const w = L2.holdWindow(plays, drop, L2.DEFAULT_DELAY_MS, drop);
  assert.equal(w.bufferMs, L2.DEFAULT_DELAY_MS - (drop - newest.wall));
});

/* ---------------------------------------------------------------- the tile */

test('the price on the tile comes off real released plays and is capped', async () => {
  const { payoutLabel } = await import(pathToFileURL(join(ROOT, 'public', 'components', 'fmt.js')).href);
  const w = L2.holdWindow(plays, anchorMs, L2.DEFAULT_DELAY_MS, null);
  const t = L2.tendency(w.released, w.current.offenseId);
  assert.ok(t, 'no tendency from a third of a real game');
  assert.ok(t.n > 0 && t.pRun >= 0 && t.pRun <= 1);
  assert.ok(Math.abs(t.pRun + t.pPass - 1) < 1e-9);
  assert.ok(['hi', 'mid', 'lo'].includes(t.confidence));
  for (const p of [t.pRun, t.pPass]) {
    if (!p) continue;
    const x = Number(payoutLabel(p).replace('×', ''));
    assert.ok(x <= 6, 'payout exceeded the 6x cap: ' + x);
  }
});

test('confidence is the sample count, never the lean (types.ts amendment 2)', () => {
  const many = Array.from({ length: 60 }, (_, i) => ({ offenseId: 'X', kind: i < 30 ? 'run' : 'pass' }));
  const few = Array.from({ length: 5 }, (_, i) => ({ offenseId: 'X', kind: i < 4 ? 'run' : 'pass' }));
  assert.equal(L2.tendency(many, 'X').confidence, 'hi');   // p = 0.50, a total guess
  assert.equal(L2.tendency(few, 'X').confidence, 'lo');    // p = 0.80, a strong lean
});

/* ------------------------------------------------------------- the screen */

test('the module declares every state the delay actually has', () => {
  for (const s of ['ready', 'setting', 'caught-up', 'empty', 'loading', 'offline', 'error']) {
    assert.ok(L2.states.includes(s), 'missing state: ' + s);
  }
  assert.equal(L2.id, 'l2-delay');
  assert.ok(L2.bar.endsWith('AQB-locked-play-in-progress.png'));
});

test('the slider offers zero and the 45s the reference implementation documents', () => {
  assert.ok(L2.PRESETS_MS.includes(0));
  assert.ok(L2.PRESETS_MS.includes(45000));
  assert.equal(L2.DEFAULT_DELAY_MS, 45000);
  assert.equal(L2.holdLabel(45000), '45s');
  assert.equal(L2.holdLabel(90000), '1:30');
  assert.equal(L2.holdLabel(0), '0s');
});

test('previewData resolves both teams out of the real 760-team file', () => {
  assert.equal(data.home.abbrev, 'OU');
  assert.equal(data.away.abbrev, 'UTEP');
  assert.equal(teams.teams[data.homeId].name, data.home.name);
});

test('the color-survival rail is real rows, not chosen colors', () => {
  const p = data.palette;
  for (const k of ['navy', 'navyB', 'yellow', 'none']) {
    assert.ok(p[k], 'no ' + k + ' team found in the real file');
    assert.equal(teams.teams[p[k].id].abbrev, p[k].abbrev, k + ' is not a row from teams.json');
  }
  assert.ok(p.navy.id !== p.navyB.id, 'navy-on-navy needs two different teams');
  assert.equal(p.none.primary === null || p.none.primary === '000000', true);
});

/* ------------------------------------------------------------------ *
 * A frozen feed must LOOK frozen — 2026-09-08
 * ------------------------------------------------------------------ */

test('🔴 the stale rule fires on a dead poller and not on the pre-kickoff backoff', async () => {
  /* What this defends. The poller died after 36 minutes with no error line. The
   * Worker went on serving the last state it held, so the live screen rendered a
   * score, a board and a delay bar over a game that had stopped. A blank screen
   * sends somebody to find out why; a stale one does not.
   *
   * The threshold is derived rather than picked: live pushes are every 10s, so
   * 45s is three missed pushes. Pre-kickoff the poller deliberately drops to a
   * five-minute cycle, so the same rule there would cry wolf all evening. */
  const src = await import('node:fs').then((fs) =>
    fs.readFileSync(new URL('../public/screens/live-game.screen.js', import.meta.url), 'utf8'));

  /* The screen cannot be imported here - it needs a DOM - so the rule is lifted
   * and run. That is honest about what is being tested: the arithmetic, not the
   * markup, and the markup is checked in the browser. */
  const body = src.slice(src.indexOf('export function staleness'));
  const fn = new Function('return ' + body.slice(body.indexOf('('), body.indexOf('\n}') + 2)
    .replace(/^\(/, 'function ('))();

  const NOW = 1_700_000_000_000;
  const live = (ageMs) => fn({ status: 'live', pushedAt: NOW - ageMs }, NOW);
  const pre = (ageMs) => fn({ status: 'pre', pushedAt: NOW - ageMs }, NOW);

  assert.equal(live(10_000), null, 'one poll interval is not stale');
  assert.equal(live(40_000), null, 'three intervals minus a network hiccup is not stale');
  assert.ok(live(60_000), 'a minute with no push during a live game IS stale');
  assert.ok(live(36 * 60_000), 'the actual failure - 36 minutes and gone');

  assert.equal(pre(60_000), null, 'the pre-kickoff backoff is five minutes, not a fault');
  assert.equal(pre(9 * 60_000), null, 'still inside two slow cycles');
  assert.ok(pre(20 * 60_000), 'twenty minutes before kickoff with nothing pushed IS a fault');

  /* No timestamp at all is not a staleness claim - it is a state we have never
   * been given, and the empty screen already covers that. */
  assert.equal(fn({ status: 'live' }, NOW), null);
  assert.equal(fn(null, NOW), null);
});
