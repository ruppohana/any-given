/* P4 - MY PICKS.
 *
 * 🔴 THIS FILE IS NOT THE CLOSE, AND THIS PIECE HAS NO CLOSE. P4 has no comparable on
 * disk (see the screen module's header for what was verified missing), so nothing here
 * or anywhere else can say the screen is right. What this file can do is the part a
 * browser cannot check:
 *
 *   1. that every number the screen prints is the REAL SCORER'S, by running
 *      src/lib/pool.ts over the exact data previewData produces;
 *   2. that the three captured games are read correctly, including the one that makes
 *      this screen's hardest row necessary;
 *   3. that the pure helpers behave at their boundaries;
 *   4. that the source obeys the CONTRACT §5 rules that fail a piece silently.
 *
 * NOTHING BELOW IS ASSERTED AGAINST DATA THIS PIECE INVENTED AND THEN CHECKED AGAINST
 * ITSELF. The three games come out of fixtures/, the 760 teams come out of
 * fixtures/teams.json, and every scoring assertion is checked against pool.ts rather
 * than against a number written here.
 *
 * 🔴 TZ IS PINNED. The preview builds its week with local setHours, so the clock and
 * the synthetic kickoffs shift together under any zone - but the three REAL kickoffs
 * are absolute and do not. Under UTC the Oklahoma game lands on the Saturday and Ohio
 * State has not kicked at the `partial` clock, so route-by-route state counts are
 * genuinely different. Pacific is the vault's zone and the zone the screen was
 * measured in, so it is pinned here rather than left to whatever CI runs in.
 */
process.env.TZ = 'America/Los_Angeles';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  pickState, isPickEditable, resolveGame, voidReason, resolveParlay, scoreWeek,
  parlayWorth, PARLAY_MIN_LEGS, PARLAY_MAX_LEGS, DEFAULT_SCORING
} from '../src/lib/pool.ts';
/* fmt.js is a plain browser module with NO imports, so Node loads it as it ships.
 * The crowd rule is asserted against the shipped file, not against a copy of it. */
import { crowdLabel, crowdSuppression, progress } from '../public/components/fmt.js';

const SRC_URL = new URL('../public/screens/p4-picks.screen.js', import.meta.url);
const CSS_URL = new URL('../public/screens/p4-picks.css', import.meta.url);
const SRC = readFileSync(SRC_URL, 'utf8');
const CSS = readFileSync(CSS_URL, 'utf8');

/* THE LINT READS CODE, NOT COMMENTARY. A lint that fires on the sentence explaining
 * the rule is a lint that gets deleted, so block comments come out first. */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
const CODE = strip(SRC);
const CSSCODE = strip(CSS);

/* The screen is BROWSER code - its imports are server-absolute and Node cannot resolve
 * them. Everything below the "pure helpers" line in that file is written to touch
 * neither the DOM nor an imported binding, which is what makes this legal. */
const mod = await import('data:text/javascript;base64,' +
  Buffer.from(SRC.replace(/^import\s[\s\S]*?from\s+'[^']*';$/gm, '').replace(/^import[^;]*;$/gm, ''), 'utf8').toString('base64'));

const DB = JSON.parse(readFileSync(new URL('../fixtures/teams.json', import.meta.url), 'utf8'));
const GAME_NAMES = ['real-utep-at-ou', 'real-ball-at-osu', 'real-bois-at-ore'];
const RAW = Object.fromEntries(GAME_NAMES.map((n) => [n,
  JSON.parse(readFileSync(new URL(`../fixtures/${n}-260905-final.json`, import.meta.url), 'utf8'))]));

const fixtures = {
  teams: DB,
  games: GAME_NAMES,
  load: async (n) => RAW[n]
};

const ROUTES = ['ready', 'none-picked', 'partial', 'all-locked', 'final'];
const data = {};
for (const r of ROUTES) data[r] = await mod.previewData(fixtures, r);

/* ------------------------------------------------------------------ the real games */

test('the three captured games are read whole - ids, kickoffs, finals and the DraftKings line', () => {
  const seen = [];
  for (const n of GAME_NAMES) {
    const c = RAW[n].header.competitions[0];
    const home = c.competitors.find((x) => x.homeAway === 'home');
    const away = c.competitors.find((x) => x.homeAway === 'away');
    const dk = (RAW[n].pickcenter || []).find((p) => p.provider && /draft/i.test(p.provider.name));
    assert.equal(c.status.type.name, 'STATUS_FINAL');
    assert.ok(Number.isFinite(Date.parse(c.date)));
    assert.ok(dk && dk.spread != null, `${n} has no DraftKings line`);
    seen.push(`${away.team.abbreviation} ${away.score} at ${home.team.abbreviation} ${home.score} (${dk.spread})`);
  }
  console.log('    real games:', seen.join(' | '));
  assert.equal(seen.length, 3);
});

/* 🔴 THE ROW THAT DESIGNED THIS SCREEN, and it is real rather than argued. */
test('Oregon WON by 7 and LOST the pick by 17.5 - checked against pool.ts, not against a number written here', () => {
  const spec = data.final.specs.find((s) => s.id === RAW['real-bois-at-ore'].header.competitions[0].id);
  assert.ok(spec, 'the Oregon game is not on the preview slate');
  const g = mod.gameAt(spec, data.final.now);

  assert.equal(g.status, 'final');
  assert.equal(g.homeScore - g.awayScore, 7, 'Oregon won the game by 7');
  assert.equal(g.spread, -24.5);

  /* Straight up, Oregon is the winner. Against the spread, pool.ts says the away side. */
  assert.equal(resolveGame({ ...g, spread: null }, false), 'home');
  assert.equal(resolveGame(g, true), 'away');
  assert.equal(pickState('home', g, true, data.final.now), 'lost');

  /* And the clause the row prints, which is the only thing stopping that reading as a bug. */
  assert.equal(mod.coverMargin(g, 'home'), -17.5);
  assert.equal(mod.coverText(g, 'home'), 'Missed by 17.5');
  assert.equal(mod.coverText(g, 'away'), 'Covered by 17.5');
});

test('Ohio State won by 53 and covered by 2.5 - the other end of the same clause', () => {
  const spec = data.final.specs.find((s) => s.id === RAW['real-ball-at-osu'].header.competitions[0].id);
  const g = mod.gameAt(spec, data.final.now);
  assert.equal(g.homeScore - g.awayScore, 53);
  assert.equal(mod.coverMargin(g, 'home'), 2.5);
  assert.equal(pickState('home', g, true, data.final.now), 'won');
});

/* ------------------------------------------------------------------ the preview data */

test('31 picks, 3 of them real captures, every team a real identity out of teams.json', () => {
  const byId = {};
  for (const k of Object.keys(DB.teams)) byId[DB.teams[k].id] = DB.teams[k];
  const d = data.ready;
  assert.equal(d.specs.length, 31);
  assert.equal(d.captured, 3);
  assert.equal(d.synthetic, 28);
  assert.equal(d.slateSize, 131);
  for (const s of d.specs) {
    assert.ok(byId[s.home.id], `home ${s.home.id} is not in teams.json`);
    assert.ok(byId[s.away.id], `away ${s.away.id} is not in teams.json`);
    assert.notEqual(s.home.id, s.away.id, `${s.id} has a team playing itself`);
  }
  /* No team appears twice in a week - a data error a reviewer would spend their
   * attention on instead of the thing being reviewed. */
  const seen = new Set();
  for (const s of d.specs) for (const t of [s.home.id, s.away.id]) {
    assert.ok(!seen.has(t), `team ${t} appears twice`);
    seen.add(t);
  }
});

test('every pair of navy / yellow / null is on the slate, navy on navy included', () => {
  const byId = {};
  for (const k of Object.keys(DB.teams)) byId[DB.teams[k].id] = DB.teams[k];
  const norm = (c) => {
    if (!c) return null;
    const h = String(c).trim().replace(/^#/, '').toLowerCase();
    return /^[0-9a-f]{6}$/.test(h) && h !== '000000' ? h : null;
  };
  /* The ids the screen names, verified against the real file rather than trusted. */
  assert.equal(norm(byId['2'].primary), norm(byId['87'].primary), 'Auburn and Notre Dame must share a primary');
  assert.equal(norm(byId['11'].primary), null, 'Colorado Mesa must have no usable primary');
  assert.equal(norm(byId['32'].primary), null);
  assert.equal(norm(byId['49'].primary), null);

  const states = data.ready.specs.slice(0, 31).flatMap((s) => [s.home, s.away])
    .map((t) => (norm(t.primary) ? 'has' : 'null'));
  assert.ok(states.filter((x) => x === 'null').length >= 5,
    'the null-primary case must be on screen in quantity - it is 401 of 760 in the real file');
});

/* ------------------------------------------------------------------ the routes */

function score(d) {
  const games = d.specs.map((s) => mod.gameAt(s, d.now));
  const picks = d.specs.filter((s) => d.picks[s.id].side)
    .map((s) => ({ userId: d.userId, gameId: s.id, side: d.picks[s.id].side }));
  return scoreWeek({
    week: d.week, games, ats: d.pool.ats, picks,
    parlays: [{ userId: d.userId, legs: d.legs }], now: d.now
  })[0];
}

function counts(d) {
  const out = {};
  for (const s of d.specs) {
    const p = d.picks[s.id];
    if (!p.side) continue;
    const st = pickState(p.side, mod.gameAt(s, d.now), d.pool.ats, d.now);
    out[st] = (out[st] || 0) + 1;
  }
  return out;
}

test('every PickState in the union has a route - including `locked`, which had none until it was counted', () => {
  const all = {};
  for (const r of ['ready', 'partial', 'all-locked', 'final']) {
    const c = counts(data[r]);
    console.log('   ', r.padEnd(11), JSON.stringify(c));
    for (const k of Object.keys(c)) all[k] = (all[k] || 0) + c[k];
  }
  for (const st of ['won', 'lost', 'void', 'in_progress', 'locked', 'picked']) {
    assert.ok(all[st] > 0, `PickState '${st}' is drawn on no route - a state with no route is a state nobody ever draws`);
  }
  /* `unpicked` is the whole of the none-picked route. */
  const np = data['none-picked'];
  assert.equal(Object.values(np.picks).filter((p) => p.side).length, 0);
});

test('the four live routes are ONE week at four clocks - same games, same picks, only `now` moves', () => {
  const sig = (d) => d.specs.map((s) => s.id + ':' + d.picks[s.id].side).join(',');
  const base = sig(data.ready);
  for (const r of ['partial', 'all-locked', 'final']) {
    assert.equal(sig(data[r]), base, `${r} does not carry the same picks as ready`);
  }
  assert.ok(data.ready.now < data.partial.now);
  assert.ok(data.partial.now < data['all-locked'].now);
  assert.ok(data['all-locked'].now < data.final.now);
});

test('every pick is editable until its own kickoff and shut at it - checked per pick, per route', () => {
  for (const r of ['ready', 'partial', 'all-locked', 'final']) {
    const d = data[r];
    for (const s of d.specs) {
      const g = mod.gameAt(s, d.now);
      const editable = isPickEditable(g, d.now);
      if (g.status === 'void') { assert.equal(editable, false, `${s.id} is void and must not be editable`); continue; }
      assert.equal(editable, d.now < s.kickoffUtc, `${r}/${s.id} disagrees with its own kickoff`);
    }
  }
  /* all-locked means exactly that: nothing left to change. */
  const d = data['all-locked'];
  assert.equal(d.specs.filter((s) => isPickEditable(mod.gameAt(s, d.now), d.now)).length, 0);
  /* and the default route has something to change, or the screen has no subject. */
  const r0 = data.ready;
  assert.ok(r0.specs.filter((s) => isPickEditable(mod.gameAt(s, r0.now), r0.now)).length > 0);
});

test('a locked pick is shut on the CLOCK even when the feed has not moved the game', () => {
  const d = data.partial;
  const lagged = d.specs.find((s) => s.lagMs);
  assert.ok(lagged, 'no lagged game on the slate');
  const g = mod.gameAt(lagged, d.now);
  assert.equal(g.status, 'scheduled', 'the feed has not moved it');
  assert.equal(isPickEditable(g, d.now), false, 'and the pick is shut anyway');
  assert.equal(pickState(d.picks[lagged.id].side, g, d.pool.ats, d.now), 'locked');
});

test('the week score the screen prints is scoreWeek\'s, and its parts add up to the picks made', () => {
  for (const r of ['ready', 'partial', 'all-locked', 'final']) {
    const d = data[r];
    const s = score(d);
    const made = d.specs.filter((x) => d.picks[x.id].side).length;
    assert.equal(s.correct + s.wrong + s.voided + s.pending, made, `${r} loses picks between the tallies`);
    assert.equal(s.weekPoints, s.pickPoints + s.parlayPoints);
    assert.equal(s.pickPoints, s.correct * DEFAULT_SCORING.atsPickPoints);
    console.log('   ', r.padEnd(11), `points ${s.weekPoints} = ${s.pickPoints} picks + ${s.parlayPoints} parlay`,
      `| ${s.correct}W ${s.wrong}L ${s.voided}V ${s.pending}P`);
  }
  /* Nothing has resolved into points on the opening route beyond the Thursday/Friday
   * games, and everything has by the last one. */
  assert.ok(score(data.final).weekPoints > score(data.ready).weekPoints);
  assert.equal(score(data['none-picked']) === undefined || score(data['none-picked']).weekPoints, 0);
});

test('🔴 ONE VOID PATH - a push and a cancellation are indistinguishable in everything except the reason', () => {
  const d = data.final;
  const voids = d.specs.filter((s) => resolveGame(mod.gameAt(s, d.now), d.pool.ats) === 'void');
  assert.equal(voids.length, 2, 'the final route must carry both void causes');

  const reasons = voids.map((s) => voidReason(mod.gameAt(s, d.now), d.pool.ats)).sort();
  assert.deepEqual(reasons, ['push', 'status_void']);

  /* Different causes, identical consequence: nought points, for everybody, and the
   * same PickState whichever side was taken. */
  for (const s of voids) {
    const g = mod.gameAt(s, d.now);
    assert.equal(pickState('home', g, true, d.now), 'void');
    assert.equal(pickState('away', g, true, d.now), 'void');
  }
  const sc = score(d);
  assert.equal(sc.voided, 2);
});

test('the parlay: both outcomes are drawn, legs lock independently, and a void reduces it out loud', () => {
  const gamesOf = (d) => new Map(d.specs.map((s) => [s.id, mod.gameAt(s, d.now)]));
  const res = {};
  for (const r of ['ready', 'partial', 'all-locked', 'final']) {
    const d = data[r];
    res[r] = resolveParlay(d.legs, gamesOf(d), d.pool.ats, d.now);
    console.log('   ', r.padEnd(11), res[r].state, '|', res[r].outcome, '|', res[r].note);
  }

  /* 3..6 legs, enforced in the UI before the scorer. */
  for (const r of ROUTES.filter((x) => x !== 'none-picked')) {
    const n = data[r].legs.length;
    assert.ok(n >= PARLAY_MIN_LEGS && n <= PARLAY_MAX_LEGS, `${r} has ${n} legs`);
  }

  assert.equal(res.ready.state, 'valid');
  assert.equal(res.ready.legs.filter((l) => l.locked).length, 0);
  assert.equal(res.ready.worth, parlayWorth(5));

  /* 🔴 HALF LOCKED. The state machine's hard part, and the reason the leg strip exists. */
  assert.equal(res.partial.state, 'partial_lock');
  const lockedLegs = res.partial.legs.filter((l) => l.locked).length;
  assert.ok(lockedLegs > 0 && lockedLegs < res.partial.legs.length,
    'partial_lock must have some legs shut and some open');

  assert.equal(res['all-locked'].outcome, 'lost');
  assert.ok(res['all-locked'].legs.some((l) => l.result === null),
    'the parlay is dead while a leg is still unplayed - that is the case worth drawing');

  /* 🔴 A VOIDED LEG DOES NOT KILL THE PARLAY AND IS NEVER SILENT. */
  assert.equal(res.final.outcome, 'won');
  assert.equal(res.final.reduced, true);
  assert.equal(res.final.voidedLegs.length, 1);
  assert.equal(res.final.survivingLegCount, 4);
  assert.equal(res.final.worth, parlayWorth(4));
  assert.notEqual(res.final.worth, parlayWorth(5));
  assert.match(res.final.note, /voided/);

  /* Both signs of the one component. */
  const outcomes = new Set(Object.values(res).map((x) => x.outcome));
  assert.ok(outcomes.has('won') && outcomes.has('lost'),
    'a win and a miss must both be reachable or the symmetric-result rule is unmet');

  /* Every leg is a pick already made, on the same side. */
  for (const r of ['ready', 'partial', 'all-locked', 'final']) {
    for (const leg of data[r].legs) {
      assert.equal(leg.side, data[r].picks[leg.gameId].side, `${r}: a leg disagrees with its pick`);
    }
  }
});

/* ------------------------------------------------------------------ the crowd rule */

test('the crowd rule comes from fmt.js, and the gate is the LOCK', () => {
  /* 🔴 REWRITTEN 2026-09-08. Jason: "Nobody sees anything until after the lock."
   *
   * This used to require BOTH suppression causes on the default route, because
   * the old rule revealed a split as soon as the viewer had picked and the floors
   * were the only protection. They are not the protection now - the kickoff is. */
  const d = data.ready;
  let editableWithLabel = 0, lockedShown = 0;
  for (const s of d.specs) {
    const p = d.picks[s.id];
    if (!p.side) continue;
    const share = mod.crowdShare(p.crowd, p.side);
    const locked = s.kickoffUtc <= d.now;   // the screen's own gate
    const label = crowdLabel(share, p.crowd.n, locked);
    if (!locked && label !== null) editableWithLabel++;
    if (locked && label !== null) lockedShown++;
    assert.equal(label === null, crowdSuppression(share, p.crowd.n, locked) !== null, `${s.id}`);
  }
  assert.equal(editableWithLabel, 0, 'a game that has not kicked shows no split to anybody');
  console.log(`    ${lockedShown} locked games show a split; every editable one shows none`);
});

test('swapping a pick can never reveal a split, because the gate is the kickoff', () => {
  /* The old version of this test moved a pick and watched suppression flip. That
   * was the right check for the old rule and it is the EXPLOIT under the new one:
   * the split used to be purchasable with a tap. It is not now. */
  const d = data.ready;
  const open = d.specs.filter((s) => s.kickoffUtc > d.now && d.picks[s.id].side);
  assert.ok(open.length > 0, 'the route needs editable rows for this to mean anything');
  for (const s of open) {
    const p = d.picks[s.id];
    const flipped = p.side === 'home' ? 'away' : 'home';
    assert.equal(crowdLabel(mod.crowdShare(p.crowd, p.side), p.crowd.n, false), null);
    assert.equal(crowdLabel(mod.crowdShare(p.crowd, flipped), p.crowd.n, false), null);
  }
  /* swapCrowd itself is unchanged and still moves one person, never the total. */
  const before = { home: 2, away: 6, n: 8 };
  const after = mod.swapCrowd(before, 'home', 'away');
  assert.deepEqual(after, { home: 1, away: 7, n: 8 });
  assert.equal(after.n, before.n, 'moving your own pick never changes how many picked');
  console.log(`    ${open.length} editable rows: no split before or after a swap`);
});

/* ------------------------------------------------------------------ pure helpers */

test('the remaining window reads in words at every boundary', () => {
  const M = mod.MIN, H = mod.HOUR, D = mod.DAY;
  assert.equal(mod.remainingLabel(0), null);
  assert.equal(mod.remainingLabel(-1), null);
  assert.equal(mod.remainingLabel(30 * 1000), 'under a minute');
  assert.equal(mod.remainingLabel(45 * M), '45m');
  assert.equal(mod.remainingLabel(59 * M + 59000), '59m');
  assert.equal(mod.remainingLabel(H), '1h');
  assert.equal(mod.remainingLabel(3 * H + 12 * M), '3h 12m');
  assert.equal(mod.remainingLabel(D), '1d');
  assert.equal(mod.remainingLabel(2 * D + 4 * H), '2d 4h');
});

test('urgency is three steps and nothing between them', () => {
  const M = mod.MIN, H = mod.HOUR;
  assert.equal(mod.urgencyOf(0), 'closed');
  assert.equal(mod.urgencyOf(59 * M), 'soon');
  assert.equal(mod.urgencyOf(H), 'near');
  assert.equal(mod.urgencyOf(5 * H + 59 * M), 'near');
  assert.equal(mod.urgencyOf(6 * H), 'far');
  assert.equal(new Set([mod.urgencyOf(10 * M), mod.urgencyOf(3 * H), mod.urgencyOf(20 * H)]).size, 3);

  /* All three must be on the default route, or a three-step scale is rendering as one. */
  const d = data.ready;
  const steps = new Set(d.specs
    .filter((s) => isPickEditable(mod.gameAt(s, d.now), d.now))
    .map((s) => mod.urgencyOf(s.kickoffUtc - d.now)));
  assert.deepEqual([...steps].sort(), ['far', 'near', 'soon']);
});

test('the spread is one side\'s number, and a pick\'em is a pick\'em', () => {
  assert.equal(mod.spreadText(-24.5, 'home'), '−24.5');
  assert.equal(mod.spreadText(-24.5, 'away'), '+24.5');
  assert.equal(mod.spreadText(-7, 'home'), '−7');
  assert.equal(mod.spreadText(0, 'home'), 'PK');
  assert.equal(mod.spreadText(null, 'home'), null);
});

test('statusAt derives one week from one clock, and a cancellation lands when it is announced', () => {
  const k = Date.UTC(2026, 8, 5, 20, 0);
  const s = { kickoffUtc: k, voidAt: null };
  assert.equal(mod.statusAt(s, k - 1), 'scheduled');
  assert.equal(mod.statusAt(s, k), 'in_progress');
  assert.equal(mod.statusAt(s, k + mod.LIVE_WINDOW_MS - 1), 'in_progress');
  assert.equal(mod.statusAt(s, k + mod.LIVE_WINDOW_MS), 'final');

  const cancelled = { kickoffUtc: k, voidAt: k - 10 * mod.HOUR };
  assert.equal(mod.statusAt(cancelled, k - 11 * mod.HOUR), 'scheduled');
  assert.equal(mod.statusAt(cancelled, k - 9 * mod.HOUR), 'void');
  assert.equal(mod.statusAt(cancelled, k + mod.DAY), 'void');

  /* And a game in progress carries NO score - the real captures have real FINAL scores
   * and nothing else, so a half-time number would be a shape this piece invented. */
  const g = mod.gameAt({ ...s, homeScore: 34, awayScore: 27, id: 'x', week: 2, home: {}, away: {}, spread: -3 }, k + 60000);
  assert.equal(g.status, 'in_progress');
  assert.equal(g.homeScore, null);
  assert.equal(g.awayScore, null);
});

test('grouping is by DAY - one header per group, never one per row', () => {
  const d = data.ready;
  const games = d.specs.map((s) => mod.gameAt(s, d.now));
  const groups = mod.groupsOf(games);
  assert.equal(groups.reduce((a, g) => a + g.games.length, 0), games.length, 'a game fell out of a group');
  assert.ok(groups.length >= 2 && groups.length <= 4, `${groups.length} day groups for 31 picks`);
  assert.ok(groups.length < games.length / 4, 'a header per handful of rows is Sofascore\'s mistake in a new place');
  /* Kickoff order, within and across groups. */
  let last = -Infinity;
  for (const g of groups) for (const x of g.games) { assert.ok(x.kickoffUtc >= last); last = x.kickoffUtc; }
});

test('the progress line is fmt.js\'s, counted against the measured 131-game week', () => {
  const d = data.ready;
  const made = d.specs.filter((s) => d.picks[s.id].side).length;
  assert.equal(progress(made, d.slateSize), '31 of 131 picked · 24%');
  assert.equal(progress(0, d.slateSize), '0 of 131 picked · 0%');
});

/* ------------------------------------------------------------------ the source lint
 * CONTRACT §5 - the checks that fail a piece silently, read off the two files this
 * piece wrote. */

test('CONTRACT §5: no shadow, no dependency, no CDN mark, no fetch', () => {
  assert.doesNotMatch(CSSCODE, /box-shadow/i, 'depth is 1px solid var(--line)');
  assert.doesNotMatch(CODE, /box-shadow/i);
  assert.doesNotMatch(CODE, /\bfetch\s*\(/, 'a screen that fetches fails its piece - data arrives as an argument');
  assert.doesNotMatch(CODE, /espncdn|\.png|\.svg\b|<img|createElement\(['"]img/i,
    'no image, no mark of its own - teamChip owns that decision');
  assert.doesNotMatch(CSSCODE, /@import|url\(https?:/i);
  assert.doesNotMatch(CODE, /from\s+['"](?!\/)/, 'no npm package, no bundler');
});

test('CONTRACT §5: --accent is read and the accent tokens are never named or set at :root', () => {
  assert.doesNotMatch(CSSCODE, /--maroon|--gold/, 'the accent SWAPS TOKEN on dark');
  assert.doesNotMatch(CODE, /--maroon|--gold/);
  assert.match(CSSCODE, /var\(--accent\)/);
  assert.doesNotMatch(CSSCODE, /:root/, 'a pool component never writes at :root');
  assert.doesNotMatch(CSSCODE, /--team-a|--team-b/, 'team-chip.js sets those per element');
});

test('CONTRACT §5: --up and --down are RESULT ONLY', () => {
  /* Every rule that reaches the fixed result scale must be selecting on a resolved
   * state. An unresolved pick is not a win and nothing here may paint one. */
  const lines = CSSCODE.split('\n').filter((l) => /var\(--up\)|var\(--down\)/.test(l));
  assert.ok(lines.length > 0, 'the result scale is used somewhere');
  for (const l of lines) {
    assert.match(l, /data-result="(won|lost)"|data-outcome="(won|lost)"|data-leg-result="(won|lost)"|data-state="(won|lost)"/,
      `--up/--down reached outside a resolved state: ${l.trim()}`);
  }
});

test('CONTRACT §5: the pool scores in POINTS - no balance vocabulary anywhere near it', () => {
  for (const w of ['marble', 'credit', 'coin', 'top-up', 'topup', 'purchase', ' buy ', 'refill', 'stake', 'wager', 'odds']) {
    assert.ok(!CODE.toLowerCase().includes(w), `the pool must not say "${w.trim()}"`);
    assert.ok(!CSSCODE.toLowerCase().includes(w), `the stylesheet must not say "${w.trim()}"`);
  }
  assert.match(CODE, /points/i);
});

test('CONTRACT §5: tabular numbers, 44px taps, US spelling', () => {
  /* Every figure carries .num, which tokens.css makes tabular. */
  assert.match(CODE, /'p4-cell-v num'/);
  assert.match(CODE, /'p4-s1 num'/);
  assert.match(CODE, /'p4-pin-v num'/);
  assert.match(CSSCODE, /var\(--tap-min\)|44px/);
  assert.match(CSSCODE, /\.p4-swap[\s\S]{0,200}44px/, 'the one control on this screen must be a real 44px target');
  for (const w of ['colour', 'centre', 'grey', 'behaviour', 'analyse', 'catalogue']) {
    assert.ok(!SRC.toLowerCase().includes(w), `US spelling: "${w}"`);
    assert.ok(!CSS.toLowerCase().includes(w), `US spelling: "${w}"`);
  }
});

test('the screen decides nothing it may not decide - the scorer, the lock and the void are pool.ts\'s', () => {
  /* Every rule named in the dispatch as not this screen's to decide is imported and
   * called rather than reimplemented. */
  for (const fn of ['pickState', 'isPickEditable', 'voidReason', 'resolveParlay', 'scoreWeek']) {
    assert.match(CODE, new RegExp('\\b' + fn + '\\b'), `${fn} must come from pool.ts`);
  }
  assert.match(CODE, /from '\/src\/lib\/pool\.ts'/);
  assert.match(CODE, /from '\/components\/fmt\.js'/);
  assert.match(CODE, /from '\/components\/team-chip\.js'/);
  /* The crowd rule is consumed, not rewritten. */
  assert.doesNotMatch(CODE, /Math\.round\(share\s*\*\s*100\)/, 'the percentage is fmt.crowdLabel\'s');
  /* pool.ts owns the ladder; this file must not restate the numbers as logic. */
  assert.doesNotMatch(CODE, /parlayWorth\s*=\s*\{/);
});

test('the screen declares no bar, and that is the finding rather than an oversight', () => {
  assert.doesNotMatch(CODE, /export const bar/,
    'P4 has no comparable on disk. A declared bar here would be an invented one, which produces a clean run and no signal.');
  assert.match(SRC, /NO BAR/);
  /* The five required routes exist, and none-picked is this screen's empty. */
  const listed = (SRC.match(/export const states = \[([\s\S]*?)\]/) || [])[1];
  for (const s of ['ready', 'none-picked', 'partial', 'all-locked', 'final', 'loading', 'offline', 'error']) {
    assert.ok(listed.includes(`'${s}'`), `state '${s}' is not a route`);
  }
  assert.match(CODE, /stateBlock\('empty'/, 'the contract requires an empty route');
  assert.match(CODE, /stateBlock\('loading'/);
  assert.match(CODE, /stateBlock\('offline'/);
  assert.match(CODE, /stateBlock\('error'/);
});

test('offline holds the list AND freezes the edit - the deadline does not wait for the connection', () => {
  assert.match(CODE, /frozen: state === 'offline'/);
  assert.match(CODE, /if \(ctx\.frozen\)[\s\S]{0,120}disabled = true/);
  assert.match(SRC, /does not count/);
});
