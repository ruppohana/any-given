/* P3 - the parlay.
 *
 * 🔴 THIS FILE IS NOT THE CLOSE, AND ON THIS SCREEN THAT MATTERS MORE THAN ANYWHERE ELSE.
 * Requirement 7.5: layout bugs are invisible to tests. And this screen has NO BAR - five
 * captured pick'em products, not one of them ships a parlay - so there is no reference to
 * diff against either. The close is a real browser at 393px, on all fourteen routes, LOOKED
 * AT. What is below is the part a browser cannot check.
 *
 * WHAT MAKES IT EVIDENCE RATHER THAN AN OPINION WRITTEN TWICE:
 *
 *  1. THE SCREEN DOES NOT IMPLEMENT THE PARLAY. src/lib/pool.ts does, and the screen
 *     imports it - the browser gets the real module because the preview harness strips the
 *     types and serves it as JavaScript. So these tests run THE SAME FUNCTIONS THE WORKER
 *     WILL, against the screen's own preview data. If the screen and the scorer ever
 *     disagree, there is nowhere for the disagreement to hide.
 *  2. EVERY ROUTE NAME IS CHECKED AGAINST WHAT pool.ts CALLS IT. A route named `won` that
 *     the module calls `pending` fails here.
 *  3. THE TWO ROUTES THAT MATTER MOST ARE ENTIRELY REAL. `won` and `lost` are the three
 *     captured games, their real finals and their real captured spreads - and the same
 *     three legs land straight up and lose against the spread, because Oregon won by 7
 *     into a captured 24.5. That arithmetic is done below from the fixture files
 *     themselves, not from anything this piece wrote.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC_URL = new URL('../public/screens/p3-parlay.screen.js', import.meta.url);
const CSS_URL = new URL('../public/screens/p3-parlay.css', import.meta.url);
const SRC = readFileSync(SRC_URL, 'utf8');
const CSS = readFileSync(CSS_URL, 'utf8');

/* The lint reads CODE, NOT COMMENTARY - P2 learned this by failing three checks on the
 * sentences explaining the rules. A lint that fires on its own explanation gets deleted. */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
const CODE = strip(SRC);
const CSSCODE = strip(CSS);

/* Load the screen in Node. Its /components/ imports are browser-absolute and Node cannot
 * resolve them, so those three lines come out. The pool.ts import DOES NOT - it is
 * repointed at the real file, because the whole claim of this piece is that the screen runs
 * the real scorer rather than a copy of it. Stripping it would test the copy. */
const POOL_HREF = new URL('../src/lib/pool.ts', import.meta.url).href;
const mod = await import('data:text/javascript;base64,' + Buffer.from(
  SRC.replace(/^import\s*\{[^}]*\}\s*from\s*'\/components\/[^']*';$/gm, '')
     .replace("'/src/lib/pool.ts'", JSON.stringify(POOL_HREF)),
  'utf8').toString('base64'));

const pool = await import(POOL_HREF);

/* ------------------------------------------------------------------ the fixtures */

const DB = JSON.parse(readFileSync(new URL('../fixtures/teams.json', import.meta.url), 'utf8'));
const GAME_NAMES = ['real-utep-at-ou', 'real-ball-at-osu', 'real-bois-at-ore'];
const RAW = Object.fromEntries(GAME_NAMES.map((n) => [n,
  JSON.parse(readFileSync(new URL(`../fixtures/${n}-260905-final.json`, import.meta.url), 'utf8'))]));

/** The harness's own fixture object, reproduced exactly: teams, three game names, load(). */
const FIXTURES = { teams: DB, games: GAME_NAMES, load: async (n) => RAW[n] };

const byId = Object.fromEntries(Object.values(DB.teams).map((t) => [t.id, t]));
const norm = (c) => {
  if (!c) return null;
  const h = String(c).trim().replace(/^#/, '').toLowerCase();
  return /^[0-9a-f]{6}$/.test(h) && h !== '000000' ? h : null;
};

const resolve = (d) => pool.resolveParlay(d.legs, new Map(d.games.map((g) => [g.id, g])), d.pool.ats, d.now);

/* ------------------------------------------------------------------ the real games
 * Everything in this block is read off the captured files. Nothing is asserted about data
 * this piece created, which is the difference between evidence and an assumption written
 * twice - `_make.py` invented a play-text shape and 306 tests passed against it. */

test('the three captured games are three real finals with three real captured lines', () => {
  const seen = [];
  for (const n of GAME_NAMES) {
    const c = RAW[n].header.competitions[0];
    const home = c.competitors.find((x) => x.homeAway === 'home');
    const away = c.competitors.find((x) => x.homeAway === 'away');
    const pc = RAW[n].pickcenter && RAW[n].pickcenter[0];
    assert.equal(c.status.type.name, 'STATUS_FINAL');
    assert.ok(byId[home.team.id] && byId[away.team.id], 'both teams are in teams.json');
    assert.equal(typeof pc.spread, 'number', 'the line is captured, not chosen');
    seen.push(`${away.team.abbreviation} ${away.score} at ${home.team.abbreviation} ${home.score} (${pc.details})`);
  }
  console.log('    real games:', seen.join(' | '));
  assert.equal(seen.length, 3, 'three captured games - which is exactly the three-leg minimum');
});

test('THE WHOLE REAL CLOSE: the same three home teams LAND straight up and LOSE against the spread', () => {
  /* Read from the fixtures, arithmetic done here, so the claim does not depend on the
   * screen, on pool.ts, or on anything this piece wrote. */
  const rows = GAME_NAMES.map((n) => {
    const c = RAW[n].header.competitions[0];
    const h = c.competitors.find((x) => x.homeAway === 'home');
    const a = c.competitors.find((x) => x.homeAway === 'away');
    const spread = RAW[n].pickcenter[0].spread;
    return { abbrev: h.team.abbreviation, margin: Number(h.score) - Number(a.score), spread: spread };
  });
  for (const r of rows) assert.ok(r.margin > 0, `${r.abbrev} won straight up`);
  const covered = rows.map((r) => r.margin + r.spread > 0);
  console.log('    ' + rows.map((r, i) => `${r.abbrev} by ${r.margin} into ${r.spread} -> ${covered[i] ? 'covered' : 'DID NOT COVER'}`).join(' | '));
  assert.deepEqual(covered, [true, true, false], 'Oregon won by 7 into a captured 24.5');
});

test('all twelve color-probe teams are real, and they are every pair the pool must survive', () => {
  /* CONTRACT §5: navy, yellow and null, AND EVERY PAIR OF THOSE, navy on navy included.
   * The leg row draws BOTH teams - the side taken and its opponent - so the pair is
   * genuinely adjacent here rather than merely present. */
  const pairs = [['2', '87'], ['25', '9'], ['6', '11'], ['119', '338'], ['63', '70'], ['32', '49']];
  for (const [a, b] of pairs) {
    assert.ok(byId[a] && byId[b], `${a} / ${b} missing from teams.json`);
    assert.ok(CODE.includes(`'${a}'`) && CODE.includes(`'${b}'`), `probe pair ${a}/${b} not in the screen`);
  }
  assert.equal(norm(byId['2'].primary), norm(byId['87'].primary), 'navy on navy - byte-identical');
  assert.ok(norm(byId['119'].primary) && norm(byId['338'].primary), 'yellow on yellow');
  assert.equal(norm(byId['11'].primary), null, 'navy on null');
  assert.equal(norm(byId['70'].primary), null, 'yellow on null');
  assert.equal(norm(byId['32'].primary), null);
  assert.equal(norm(byId['49'].primary), null, 'null on null');
  /* And one real fixture pair is a color collision on its own: Ohio State and Ball State
   * are both ba0c2f. The two teams in a leg can be the same color in the REAL data. */
  assert.equal(norm(byId['194'].primary), norm(byId['2050'].primary));
});

/* ------------------------------------------------------------------ every route is named
 * by pool.ts, not by this file */

test('every parlay route resolves to the state pool.ts gives it', async () => {
  const want = {
    empty: 'empty', under_min: 'under_min', valid: 'valid', at_max: 'at_max',
    partial_lock: 'partial_lock', locked: 'locked', won: 'won', lost: 'lost', void: 'void'
  };
  const seen = [];
  for (const [route, state] of Object.entries(want)) {
    const d = await mod.previewData(FIXTURES, route);
    const res = resolve(d);
    const got = mod.screenState(res);
    seen.push(`${route}=${got}`);
    assert.equal(got, state, `route ${route} rendered a ${got}`);
  }
  console.log('    ' + seen.join('  '));
  /* Every route in the export list has data behind it - a state with no route is a state
   * nobody ever draws. */
  for (const s of Object.keys(want)) assert.ok(mod.states.includes(s), `${s} is not a route`);
  for (const s of ['reduced', 'no_picks', 'loading', 'offline', 'error']) {
    assert.ok(mod.states.includes(s), `${s} is not a route`);
  }
});

test('the won route is 3 real legs, 3 real finals, 3 points - and NOTHING in it is synthetic', async () => {
  const d = await mod.previewData(FIXTURES, 'won');
  assert.equal(d.synthetic, 0);
  assert.equal(d.captured, 3);
  assert.equal(d.legs.length, pool.PARLAY_MIN_LEGS);
  assert.equal(d.pool.ats, false);
  const res = resolve(d);
  assert.equal(res.outcome, 'won');
  assert.equal(res.points, 3, 'three legs pays three points on the ladder Jason set');
  assert.deepEqual(res.legs.map((l) => l.result), ['won', 'won', 'won']);
  /* The ids are the captured game ids, not ids this file made up. */
  const real = new Set(GAME_NAMES.map((n) => RAW[n].header.competitions[0].id));
  for (const l of d.legs) assert.ok(real.has(l.gameId), `${l.gameId} is not a captured game id`);
});

test('the lost route is the SAME three real legs with the pool against the spread', async () => {
  const w = await mod.previewData(FIXTURES, 'won');
  const l = await mod.previewData(FIXTURES, 'lost');
  assert.deepEqual(l.legs, w.legs, 'same legs, same sides - the only difference is pool.ats');
  assert.equal(l.pool.ats, true);
  assert.equal(l.synthetic, 0);
  const res = resolve(l);
  assert.equal(res.outcome, 'lost');
  assert.equal(res.points, 0);
  /* Two covered, one did not. The miss is Oregon and it comes from the captured line. */
  assert.deepEqual(res.legs.map((x) => x.result), ['won', 'won', 'lost']);
  /* And the figure at the top is 0 rather than the 3 it would have paid - a miss shows what
   * it scored, in the same slot and the same size as a win. */
  assert.equal(mod.headlineFigure(res), 0);
});

test('🔴 a voided leg does NOT kill the parlay, and the reduction is stated with its price', async () => {
  const d = await mod.previewData(FIXTURES, 'reduced');
  const res = resolve(d);
  assert.equal(res.originalLegCount, 5);
  assert.equal(res.voidedLegs.length, 1);
  assert.equal(res.survivingLegCount, 4, 'four legs survive - the parlay is still alive');
  assert.equal(res.reduced, true, 'and it must say so');
  assert.equal(res.outcome, 'pending');
  assert.equal(pool.parlayWorth(5), 12);
  assert.equal(res.worth, 6, 'a five-leg parlay quietly becoming a four-leg parlay costs 6 points');
  /* It is half-locked at the same time, which is the state machine's hard part. */
  assert.equal(mod.screenState(res), 'partial_lock');
  console.log(`    reduced: 5 legs -> 4, worth 12 -> ${res.worth}, state ${mod.screenState(res)}`);
});

test('🔴 reduced below three is VOID - neither won nor lost - even with every survivor landing', async () => {
  const d = await mod.previewData(FIXTURES, 'void');
  const res = resolve(d);
  assert.equal(res.voidedLegs.length, 3);
  assert.equal(res.survivingLegCount, 2);
  assert.equal(res.outcome, 'void');
  assert.equal(res.voidReason, 'voided_below_min');
  assert.equal(res.points, 0);
  /* BOTH SURVIVORS LANDED. Two checks and a void verdict on one card: this is the route
   * that makes "a void is not a loss" impossible to misread. */
  const landed = res.legs.filter((l) => l.result === 'won').length;
  assert.equal(landed, 2, 'both surviving legs won and the parlay is still void');
  assert.ok(/no points won, no points lost/.test(res.note));
  /* 🔴 AND THE FOLD IS LOAD-BEARING: pool.ts reports state 'locked' here, because its own
   * ParlayState union has no 'void' member (it flags that as its own COULD NOT CLOSE) while
   * types.ts amendment 3 says it does. A screen that printed `state` would say a dead
   * parlay is still running. */
  assert.equal(res.state, 'locked');
  assert.equal(mod.screenState(res), 'void');
});

/* ------------------------------------------------------------------ the pure helpers */

test('the ladder is READ from pool.ts, never written here: 3·3 4·6 5·12 6·20', () => {
  const rungs = mod.ladderRungs();
  assert.deepEqual(rungs, [{ legs: 3, worth: 3 }, { legs: 4, worth: 6 }, { legs: 5, worth: 12 }, { legs: 6, worth: 20 }]);
  assert.equal(rungs.length, pool.PARLAY_MAX_LEGS - pool.PARLAY_MIN_LEGS + 1);
  /* Change the ladder in pool.ts and the screen follows. This proves the screen is not
   * carrying its own copy of the numbers. */
  const other = { pickPoints: 1, atsPickPoints: 1, parlayWorth: { 3: 1, 4: 2, 5: 3, 6: 4 } };
  assert.deepEqual(mod.ladderRungs(other).map((r) => r.worth), [1, 2, 3, 4]);
  /* NO ODDS, in any notation, anywhere in either file. */
  assert.ok(!/\bodds\b/i.test(CODE + CSSCODE), 'the word appears');
  assert.ok(!/[+−-]\d{3}\b/.test(CODE), 'an American price got in');
  assert.ok(!/\bto\s?1\b|\/1\b|\bdecimal\b/i.test(CODE), 'a fractional or decimal price got in');
});

test('3 and 6 are enforced in the UI, using the scorer’s own validator', () => {
  const t = (h) => new Date(2026, 8, 5, h, 0, 0, 0).getTime();
  const g = (id, h) => ({ id, week: 2, kickoffUtc: t(h), home: byId['201'], away: byId['2638'], spread: null, status: 'scheduled', homeScore: null, awayScore: null });
  const games = new Map([['a', g('a', 9)], ['b', g('b', 12)], ['c', g('c', 15)], ['d', g('d', 16)],
                         ['e', g('e', 17)], ['f', g('f', 18)], ['g', g('g', 19)], ['h', g('h', 20)]]);
  const picks = new Map([...games.keys()].map((k) => [k, 'home']));
  const now = t(8);
  const legs = (n) => [...games.keys()].slice(0, n).map((k) => ({ gameId: k, side: 'home' }));

  /* At the maximum, one more is refused - and refused by validateParlay, not by a number
   * written into the screen. */
  const atMax = mod.addLegErrors('g', 'home', legs(6), picks, games, now);
  assert.deepEqual(atMax.map((e) => e.code), ['too_many_legs']);
  /* Under the minimum, adding is never blocked for being short. */
  assert.deepEqual(mod.addLegErrors('c', 'home', legs(2), picks, games, now), []);
  /* A LEG IS A PICK ALREADY MADE. A game with no pick cannot become a leg at all - which
   * is what stops one game being picked two ways at once. */
  const noPick = mod.addLegErrors('h', 'home', legs(3), new Map([...picks].filter(([k]) => k !== 'h')), games, now);
  assert.deepEqual(noPick.map((e) => e.code), ['no_pick_on_game']);
  /* And a leg may not disagree with the pick behind it. */
  const wrongSide = mod.addLegErrors('d', 'away', legs(3), picks, games, now);
  assert.deepEqual(wrongSide.map((e) => e.code), ['leg_disagrees_with_pick']);
  /* A game that already kicked cannot be added. */
  /* Adding to a parlay whose first leg has kicked is refused by the composition
   * lock now - the parlay is one object with one payoff and it freezes when the
   * first of its legs starts. Decided by Jason 2026-09-08 after this screen
   * showed the exploit: watch three legs land, then add a fourth. */
  assert.deepEqual(mod.addLegErrors('a', 'home', legs(0), picks, games, t(10)).map((e) => e.code),
    ['parlay_composition_locked']);
  /* An error about ANOTHER leg is not a reason to refuse this one - a half-locked parlay
   * must still be editable below the line. */
  const halfLocked = mod.addLegErrors('h', 'home', legs(3), picks, games, t(13));
  assert.deepEqual(halfLocked, [], 'two legs have kicked and the fourth is still addable');
});

test('the lock line is drawn only where it cannot lie', () => {
  const L = (...flags) => flags.map((f) => ({ locked: f }));
  assert.equal(mod.lockLineIndex(L(true, true, false, false)), 2, 'a genuine half-lock');
  assert.equal(mod.lockLineIndex(L(false, false, false)), -1, 'nothing locked - no line');
  assert.equal(mod.lockLineIndex(L(true, true, true)), -1, 'all locked - no line');
  /* 🔴 THE CASE THAT MADE THIS A FUNCTION. A leg also locks when its game is CANCELLED,
   * which can happen before kickoff, so the locked legs stop being a prefix of the kickoff
   * order. A divider through that list is a picture of something untrue: every leg gets its
   * own padlock instead. */
  assert.equal(mod.lockLineIndex(L(true, false, true, false)), -1);
  assert.equal(mod.lockLineIndex(L(false, true, false)), -1);
  assert.equal(mod.lockLineIndex([]), -1);
});

test('🔴 the line is on the leg whenever the pool is against the spread', async () => {
  /* FOUND BY LOOKING, NOT BY THINKING. The `lost` route drew Oregon with a red miss mark
   * and nothing else - a team that WON 34-27 shown as a loss with no explanation anywhere
   * on the screen. Requirement 7.5 in one screenshot. */
  assert.equal(mod.sideSpread(-24.5, 'home'), '−24.5');
  assert.equal(mod.sideSpread(-24.5, 'away'), '+24.5');
  assert.equal(mod.sideSpread(3, 'home'), '+3');
  assert.equal(mod.sideSpread(0, 'home'), 'PK');
  assert.equal(mod.sideSpread(null, 'home'), null, 'no line is not a line of zero');
  /* And it is the CAPTURED line: the fixture says ORE -24.5 and the screen carries it. */
  const d = await mod.previewData(FIXTURES, 'lost');
  const ore = d.games.find((g) => g.home.abbrev === 'ORE');
  assert.equal(ore.spread, RAW['real-bois-at-ore'].pickcenter[0].spread);
  assert.equal(mod.sideSpread(ore.spread, 'home'), '−24.5');
  /* Gated on pool.ats - the straight-up route has the same field and must not show it. */
  const w = await mod.previewData(FIXTURES, 'won');
  assert.equal(w.pool.ats, false);
  assert.ok(/if \(ctx\.pool\.ats\)/.test(CODE), 'the line is gated on pool.ats');
  assert.equal((CODE.match(/if \(ctx\.pool\.ats\)/g) || []).length, 2, 'gated on the leg AND on the candidate');
});

test('the card never says two different things about how many legs it has', async () => {
  /* "5 of 6 legs" printed directly above "this is a 4-leg parlay now" - the screen
   * contradicting itself in adjacent lines, in the one state the void rule is about. */
  const red = resolve(await mod.previewData(FIXTURES, 'reduced'));
  assert.equal(mod.legCountLabel(red, 5), '4 of 5 legs left');
  const vd = resolve(await mod.previewData(FIXTURES, 'void'));
  assert.equal(mod.legCountLabel(vd, 5), '2 of 5 legs left');
  const ok = resolve(await mod.previewData(FIXTURES, 'valid'));
  assert.equal(mod.legCountLabel(ok, 4), '4 of 6 legs');
});

test('the module’s sentence is printed where it carries something new', async () => {
  /* On a live four-leg parlay it reads "4 legs live. Worth 6 points." under a 21px 6 and a
   * caption saying the same thing - the same fact three times, and the third is the one a
   * reader stops trusting. */
  assert.equal(mod.shouldSay(resolve(await mod.previewData(FIXTURES, 'valid'))), false);
  assert.equal(mod.shouldSay(resolve(await mod.previewData(FIXTURES, 'at_max'))), false);
  for (const route of ['empty', 'under_min', 'won', 'lost', 'void']) {
    assert.equal(mod.shouldSay(resolve(await mod.previewData(FIXTURES, route))), true, route);
  }
  /* The reduction is never silent either way: when the note is suppressed the banner is
   * there, and it carries the price the note does not. */
  const red = resolve(await mod.previewData(FIXTURES, 'reduced'));
  assert.equal(red.reduced, true);
  assert.ok(/p3-reduced/.test(CODE) && /instead of/.test(CODE), 'the banner names the before and the after');
});

test('legs are ordered by kickoff, and a game that left the slate sorts last', () => {
  const games = new Map([
    ['a', { id: 'a', kickoffUtc: 300 }], ['b', { id: 'b', kickoffUtc: 100 }], ['c', { id: 'c', kickoffUtc: 200 }]
  ]);
  const order = mod.legOrder([{ gameId: 'a' }, { gameId: 'gone' }, { gameId: 'b' }, { gameId: 'c' }], games);
  assert.deepEqual(order.map((l) => l.gameId), ['b', 'c', 'a', 'gone']);
});

test('the candidate list is picks already made, still open, not already legs', async () => {
  const d = await mod.previewData(FIXTURES, 'valid');
  const games = new Map(d.games.map((g) => [g.id, g]));
  const addable = mod.addablePicks(d.picks, games, d.legs, d.now);
  const inParlay = new Set(d.legs.map((l) => l.gameId));
  assert.ok(addable.length > 0, 'a parlay chosen from nothing is not a choice');
  for (const p of addable) {
    assert.ok(p.side, 'every candidate is a pick that was actually made');
    assert.ok(!inParlay.has(p.gameId), 'a leg is not offered as a candidate');
    assert.ok(games.get(p.gameId).kickoffUtc > d.now, 'a kicked game cannot be added');
  }
  /* At the maximum the list still exists - you swap, you do not start again. */
  const m = await mod.previewData(FIXTURES, 'at_max');
  assert.equal(m.legs.length, 6);
  assert.ok(mod.addablePicks(m.picks, new Map(m.games.map((g) => [g.id, g])), m.legs, m.now).length > 0);
});

test('a parlay that is not yet a parlay is worth NOTHING, not zero', async () => {
  for (const route of ['empty', 'under_min']) {
    const res = resolve(await mod.previewData(FIXTURES, route));
    assert.equal(mod.headlineFigure(res), null, 'null renders as an em dash, never as 0');
    assert.ok(/minimum/.test(mod.headlineCaption(res)));
  }
  /* Once it resolves, the figure is what it SCORED - same slot for a win and a miss. */
  assert.equal(mod.headlineFigure(resolve(await mod.previewData(FIXTURES, 'won'))), 3);
  assert.equal(mod.headlineFigure(resolve(await mod.previewData(FIXTURES, 'lost'))), 0);
  assert.equal(mod.headlineFigure(resolve(await mod.previewData(FIXTURES, 'void'))), 0);
});

test('no_picks is a different state from empty, and it is the only dead end', async () => {
  const d = await mod.previewData(FIXTURES, 'no_picks');
  assert.deepEqual(d.legs, []);
  assert.deepEqual(Object.keys(d.picks), [], 'nothing picked at all');
  const e = await mod.previewData(FIXTURES, 'empty');
  assert.deepEqual(e.legs, []);
  assert.ok(Object.keys(e.picks).length >= 3, 'an empty parlay with picks waiting is not empty');
});

/* ------------------------------------------------------------------ CONTRACT §5 lint */

test('§5 - no marks of our own, no CDN image, no logo', () => {
  assert.ok(!/espncdn|\.png|<img|teamlogos|src\s*=/i.test(CODE), 'a mark got in');
  assert.ok(!/background-image|url\(/i.test(CSSCODE), 'an image url got into the CSS');
});

test('§5 - depth is a hairline. No box-shadow anywhere', () => {
  assert.ok(!/box-shadow/i.test(CSSCODE));
  assert.ok(!/box-shadow/i.test(CODE));
});

test('§5 - read --accent, never --maroon or --gold, and never write a team var at :root', () => {
  assert.ok(!/--maroon|--gold/.test(CSSCODE), 'hard-coded accent - invisible in one theme');
  assert.ok(!/--maroon|--gold/.test(CODE));
  assert.ok(/var\(--accent\)/.test(CSSCODE), 'the accent is read');
  assert.ok(!/:root/.test(CSSCODE), 'a pool component wrote at :root');
  assert.ok(!/setProperty\(\s*['"]--team/.test(CODE), 'team vars are set by team-chip.js, per element');
  assert.ok(/teamChip\(/.test(CODE), 'the shared chip component does the scoping');
});

test('§5 - no dependency, no icon font, no chart library, inline SVG only', () => {
  assert.ok(!/from ['"][^/.]/.test(CODE), 'a bare package specifier is an npm dependency');
  assert.ok(!/@import|font-face|fa-|material-icons/i.test(CSSCODE));
  assert.ok(/createElementNS/.test(CODE), 'the glyphs are inline SVG');
  /* The ladder is DOM boxes and a hairline, which is why there is no chart library. */
  assert.ok(/p3-ladder/.test(CSSCODE) && /p3-rung/.test(CSSCODE));
});

test('§5 - every number is tabular', () => {
  for (const cls of ['p3-worth-n', 'p3-count', 'p3-rung-n', 'p3-rung-w', 'p3-when', 'p3-sub',
                     'p3-pool-n', 'p3-shut', 'p3-red-b', 'p3-lockline-t', 'p3-spread']) {
    const re = new RegExp(`['"\`]${cls}[^'"\`]*num`);
    assert.ok(re.test(CODE), `${cls} is not marked .num`);
  }
});

test('§5 - the words. Nothing here is staked, bought or priced', () => {
  for (const w of ['credits', 'coins', 'top-up', 'purchase', 'buy', 'refill',
                   'colour', 'centre', 'grey', 'behaviour']) {
    assert.ok(!new RegExp('\\b' + w + '\\b', 'i').test(CODE + CSSCODE), `"${w}" appears`);
  }
  /* THE POOL SCORES IN POINTS. It has no bank, no balance, no stake and no Marbles - the
   * live layer has those, and the two halves must never be summed. */
  for (const w of ['Marble', 'stake', 'wager', 'balance', 'bankroll', 'payout', 'cash']) {
    assert.ok(!new RegExp('\\b' + w + '\\b', 'i').test(CODE), `"${w}" appears in the screen`);
  }
  assert.ok(/points/.test(CODE), 'the pool scores in points and says so');
  /* No 30px figure. The pool has no bank strip and must not inherit one to fill the hole. */
  assert.ok(!/--t-bank/.test(CSSCODE));
  const sizes = [...CSSCODE.matchAll(/font-size:\s*(\d+)px/g)].map((m) => Number(m[1]));
  console.log('    literal font sizes in the CSS:', sizes.length ? sizes.join(', ') : 'none - all tokens');
  assert.ok(sizes.every((n) => n <= 17), 'literal sizes stay at or under the section size');
  assert.ok(/--t-figure/.test(CSSCODE), 'the worth figure is the scale’s own 21px figure');
  assert.ok(!/--t-score/.test(CSSCODE), 'the 24px score belongs to the live layer');
});

test('§5 - the screen never fetches. Data arrives as an argument', () => {
  const body = CODE.slice(CODE.indexOf('export function render'));
  assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket/.test(body), 'render() reached the network');
});

test('§5 - tap targets. Nothing a thumb hits is under 44px', () => {
  assert.ok(/\.p3-drop[^}]*min-height:\s*var\(--tap-min\)/s.test(CSSCODE), 'remove');
  assert.ok(/\.p3-add\b[^}]*min-height:\s*var\(--tap-min\)/s.test(CSSCODE), 'add');
  /* The rows themselves are not controls - the control inside them is - but they still
   * clear 44px so the two lines and two chips have room. */
  assert.ok(/\.p3-leg[^}]*min-height:\s*56px/s.test(CSSCODE));
  assert.ok(/\.p3-cand[^}]*min-height:\s*56px/s.test(CSSCODE));
});

test('§5 - the symmetric result: one component, one geometry, the sign is a data attribute', () => {
  /* There is exactly ONE mark builder and ONE verdict builder in this file. A win and a
   * miss cannot drift apart because there is nothing for them to drift between. */
  assert.equal((CODE.match(/function mark\(/g) || []).length, 1);
  assert.equal((CODE.match(/function verdict\(/g) || []).length, 1);
  assert.equal((CODE.match(/\.p3-mark \{/g) || []).length, 0, 'the mark is styled in the CSS, once');
  assert.equal((CSSCODE.match(/\.scr-p3-parlay \.p3-mark \{/g) || []).length, 1);
  for (const o of ['won', 'lost', 'void']) {
    assert.ok(new RegExp(`p3-mark\\[data-result="${o}"\\]`).test(CSSCODE), `${o} mark`);
    assert.ok(new RegExp(`p3-verdict\\[data-outcome="${o}"\\]`).test(CSSCODE), `${o} verdict`);
  }
});

test('the bar is declared NULL, not invented', () => {
  assert.equal(mod.bar, null, 'five captured pick’em products, zero parlays');
  assert.ok(/sportsbook-bet-slip-and-settlement/.test(mod.barNote), 'and the nearest document is named');
  assert.equal(mod.id, 'p3-parlay');
});
