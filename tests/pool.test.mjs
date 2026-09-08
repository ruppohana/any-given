/**
 * tests/pool.test.mjs — M7, the pool scorer.
 *
 * 🔴 WHAT IS REAL AND WHAT IS NOT. Read this before believing any number below.
 *
 * REAL, and it is all that exists on disk:
 *   - `fixtures/teams.json`      — 760 real team identities, read, never edited.
 *   - `fixtures/real-*-260905-final.json` — three complete real ESPN games from the
 *     2026 season. This file reads the REAL final scores, the REAL kickoff times, the
 *     REAL team ids and the REAL DraftKings spreads out of them and scores against
 *     those. Nothing about the three-game slate is written by me.
 *
 * NOT REAL, named here rather than buried:
 *   - Any slate longer than three games. There is no captured slate in `fixtures/` and
 *     `CONTRACT.md` §1 forbids writing one. The 131-game scale run pairs REAL teams
 *     from `teams.json` into SYNTHETIC fixtures with synthetic kickoffs and synthetic
 *     scores. It proves the scorer holds at 131; it is NOT a close against a real week.
 *   - Every void. None of the three real games was cancelled, postponed, tied or
 *     pushed. Each void case sets `status`/`spread`/scores on a real game shell.
 *   - Every pre-kickoff state. The three fixtures are final captures; a `scheduled`
 *     state is the same real game rewound by setting `status` and moving `now`.
 *   - Parlays of 4, 5 and 6 legs. Only three real games exist, and a leg may not
 *     repeat a game.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  PARLAY_MIN_LEGS,
  PARLAY_MAX_LEGS,
  DEFAULT_SCORING,
  CROWD_MIN_N,
  CROWD_MIN_MINORITY,
  resolveGame,
  voidReason,
  isPickEditable,
  pickState,
  pickPointsFor,
  crowdSplit,
  crowdSuppression,
  validateParlay,
  parlayWorth,
  resolveParlay,
  parlayState,
  scopeIsEditable,
  firstKickoffOfWeek1,
  applyScope,
  scoreWeek,
  standings,
  tiebreakActual,
} from '../src/lib/pool.ts';

/* ================================================================== *
 * REAL DATA LOADERS
 * ================================================================== */

const FIX = (name) => new URL(`../fixtures/${name}`, import.meta.url);

const TEAMS = JSON.parse(readFileSync(FIX('teams.json'), 'utf8')).teams;
const team = (id) => {
  const t = TEAMS[id];
  if (!t) throw new Error(`teams.json has no team ${id}`);
  return t;
};

/** Read one real captured ESPN game into a SlateGame. Nothing is invented here. */
function realGame(file) {
  const j = JSON.parse(readFileSync(FIX(file), 'utf8'));
  const comp = j.header.competitions[0];
  const home = comp.competitors.find((c) => c.homeAway === 'home');
  const away = comp.competitors.find((c) => c.homeAway === 'away');
  const pc = j.pickcenter && j.pickcenter[0];
  return {
    id: comp.id,
    week: j.header.week,
    kickoffUtc: Date.parse(comp.date),
    home: team(home.team.id),
    away: team(away.team.id),
    spread: pc && typeof pc.spread === 'number' ? pc.spread : null,
    status: comp.status.type.completed ? 'final' : 'scheduled',
    homeScore: Number(home.score),
    awayScore: Number(away.score),
  };
}

const OU = realGame('real-utep-at-ou-260905-final.json');   // OU 51, UTEP 0,  OU -40.5
const OSU = realGame('real-ball-at-osu-260905-final.json'); // OSU 56, BALL 3, OSU -50.5
const ORE = realGame('real-bois-at-ore-260905-final.json'); // ORE 34, BOIS 27, ORE -24.5

const REAL_SLATE = [OU, OSU, ORE];
const gameMap = (list) => new Map(list.map((g) => [g.id, g]));
const REAL = gameMap(REAL_SLATE);

const AFTER = Date.parse('2026-09-06T00:00:00Z');  // every real game is final by here
const BEFORE = Date.parse('2026-09-04T00:00:00Z'); // before every real kickoff

/** A real game with fields overridden. Every use of this is a state that was NOT
 *  captured — it is named as invented in the header of this file. */
const shell = (g, over) => ({ ...g, ...over });

/* ================================================================== *
 * 1 · THE REAL THREE-GAME SLATE
 * ================================================================== */

test('real fixtures load with the real scores, spreads and kickoffs', () => {
  assert.equal(OU.id, '401856664');
  assert.equal(OU.home.abbrev, 'OU');
  assert.equal(OU.away.abbrev, 'UTEP');
  assert.equal(OU.homeScore, 51);
  assert.equal(OU.awayScore, 0);
  assert.equal(OU.spread, -40.5);
  assert.equal(OSU.homeScore, 56);
  assert.equal(OSU.awayScore, 3);
  assert.equal(OSU.spread, -50.5);
  assert.equal(ORE.homeScore, 34);
  assert.equal(ORE.awayScore, 27);
  assert.equal(ORE.spread, -24.5);
  // Real navy-on-navy: Ohio State and Ball State share primary ba0c2f.
  assert.equal(OSU.home.primary, OSU.away.primary);
});

test('straight result: all three real home teams won', () => {
  for (const g of REAL_SLATE) assert.equal(resolveGame(g, false), 'home');
});

test('against the spread on REAL DraftKings lines: OU and OSU cover, Oregon does not', () => {
  assert.equal(resolveGame(OU, true), 'home');   // 51 - 40.5 = 10.5 > 0
  assert.equal(resolveGame(OSU, true), 'home');  // 56 - 50.5 = 5.5 > 3
  assert.equal(resolveGame(ORE, true), 'away');  // 34 - 24.5 = 9.5 < 27
});

test('scoring the real slate at 3 games, straight and ATS', () => {
  const picks = [
    { userId: 'u1', gameId: OU.id, side: 'home' },
    { userId: 'u1', gameId: OSU.id, side: 'home' },
    { userId: 'u1', gameId: ORE.id, side: 'home' },
    { userId: 'u2', gameId: OU.id, side: 'away' },
    { userId: 'u2', gameId: OSU.id, side: 'home' },
    { userId: 'u2', gameId: ORE.id, side: 'away' },
  ];
  const straight = scoreWeek({ week: 1, games: REAL_SLATE, ats: false, picks, now: AFTER });
  const s1 = straight.find((r) => r.userId === 'u1');
  const s2 = straight.find((r) => r.userId === 'u2');
  assert.deepEqual([s1.pickPoints, s1.correct, s1.wrong, s1.voided], [3, 3, 0, 0]);
  assert.deepEqual([s2.pickPoints, s2.correct, s2.wrong, s2.voided], [1, 1, 2, 0]);

  const ats = scoreWeek({ week: 1, games: REAL_SLATE, ats: true, picks, now: AFTER });
  const a1 = ats.find((r) => r.userId === 'u1');
  const a2 = ats.find((r) => r.userId === 'u2');
  // u1 took three home sides; Oregon did not cover, so ATS costs u1 a point.
  assert.deepEqual([a1.pickPoints, a1.correct, a1.wrong], [2, 2, 1]);
  assert.deepEqual([a2.pickPoints, a2.correct, a2.wrong], [2, 2, 1]);
});

test('a real 3-leg parlay: lands straight, loses ATS, on the same three games', () => {
  const legs = [
    { gameId: OU.id, side: 'home' },
    { gameId: OSU.id, side: 'home' },
    { gameId: ORE.id, side: 'home' },
  ];
  const won = resolveParlay(legs, REAL, false, AFTER);
  assert.equal(won.outcome, 'won');
  assert.equal(won.state, 'won');
  assert.equal(won.points, DEFAULT_SCORING.parlayWorth[3]);
  assert.equal(won.reduced, false);

  const lost = resolveParlay(legs, REAL, true, AFTER);
  assert.equal(lost.outcome, 'lost');
  assert.equal(lost.state, 'lost');
  assert.equal(lost.points, 0);
});

/* ================================================================== *
 * 2 · 🔴 THE ONE VOID PATH — every case, and they all leave by one door
 * ================================================================== */

test('ONE VOID PATH: cancellation, postponement, tie and push are indistinguishable', () => {
  const cancelled = shell(OU, { status: 'void' });
  const postponed = shell(OU, { status: 'void' }); // the same state, deliberately
  const tied = shell(OU, { homeScore: 24, awayScore: 24 });
  const pushed = shell(OU, { spread: -51, homeScore: 51, awayScore: 0 }); // 51-51-0 = 0

  assert.equal(resolveGame(cancelled, false), 'void');
  assert.equal(resolveGame(postponed, false), 'void');
  assert.equal(resolveGame(tied, false), 'void');
  assert.equal(resolveGame(pushed, true), 'void');

  // Four different real-world events, one value. That is the rule.
  const all = [cancelled, postponed, tied].map((g) => resolveGame(g, false));
  all.push(resolveGame(pushed, true));
  assert.deepEqual(all, ['void', 'void', 'void', 'void']);

  assert.equal(voidReason(cancelled, false), 'status_void');
  assert.equal(voidReason(tied, false), 'tie');
  assert.equal(voidReason(pushed, true), 'push');
});

test('a void scores zero FOR EVERYBODY, whichever side they took', () => {
  const v = shell(ORE, { status: 'void' });
  const games = [OU, OSU, v];
  const rows = scoreWeek({
    week: 1,
    games,
    ats: false,
    now: AFTER,
    picks: [
      { userId: 'a', gameId: v.id, side: 'home' },
      { userId: 'b', gameId: v.id, side: 'away' },
    ],
  });
  for (const r of rows) {
    assert.equal(r.pickPoints, 0);
    assert.equal(r.voided, 1);
    assert.equal(r.correct, 0);
    assert.equal(r.wrong, 0);
  }
  assert.equal(pickState('home', v, false, AFTER), 'void');
  assert.equal(pickState('away', v, false, AFTER), 'void');
});

test('a push is a void, not a loss and not a win — same as a cancellation', () => {
  const pushed = shell(ORE, { spread: -7, homeScore: 34, awayScore: 27 }); // exactly 7
  assert.equal(resolveGame(pushed, true), 'void');
  assert.equal(pickState('home', pushed, true, AFTER), 'void');
  assert.equal(pickState('away', pushed, true, AFTER), 'void');
  assert.equal(pickPointsFor('home', pushed, true), 0);
  assert.equal(pickPointsFor('away', pushed, true), 0);
});

test('a final game with a missing score is NOT a void — it stays unresolved', () => {
  const broken = shell(OU, { homeScore: null });
  assert.equal(resolveGame(broken, false), null);
  assert.equal(voidReason(broken, false), null);
  assert.equal(pickState('home', broken, false, AFTER), 'locked');
});

/* ================================================================== *
 * 3 · 🔴 THE PARLAY STATE MACHINE — every state, enumerated
 * ================================================================== */

/** 🔴 SYNTHETIC. Only three real games exist and a leg may not repeat a game, so
 *  parlays of 4, 5 and 6 legs need shells. Real team identities, invented pairing,
 *  invented kickoff, invented score. Named as invented in this file's header. */
function synthSlate(n, opts = {}) {
  const ids = Object.keys(TEAMS);
  const base = Date.parse('2026-09-12T16:00:00Z');
  const out = [];
  for (let i = 0; i < n; i++) {
    const h = team(ids[(i * 2) % ids.length]);
    const a = team(ids[(i * 2 + 1) % ids.length]);
    out.push({
      id: `s${i}`,
      week: opts.week ?? 2,
      kickoffUtc: base + (i % 8) * 3600_000,
      home: h,
      away: a,
      spread: null,
      status: opts.status ?? 'final',
      homeScore: opts.status === 'scheduled' ? null : 20 + (i % 17),
      awayScore: opts.status === 'scheduled' ? null : 10 + (i % 13),
    });
  }
  return out;
}

test('PARLAY STATE MACHINE — all eight contract states plus the two void outcomes', () => {
  const slate = synthSlate(8, { status: 'scheduled' });
  const map = gameMap(slate);
  const pre = slate[0].kickoffUtc - 3600_000;   // before every kickoff
  const post = slate[7].kickoffUtc + 86_400_000; // after every kickoff
  const legsOf = (k) => slate.slice(0, k).map((g) => ({ gameId: g.id, side: 'home' }));

  const table = [];
  const row = (label, res) => {
    table.push(
      `${label.padEnd(34)} state=${res.state.padEnd(13)} outcome=${res.outcome.padEnd(8)}` +
      ` legs=${res.originalLegCount}->${res.survivingLegCount} worth=${String(res.worth).padStart(2)}` +
      ` pts=${String(res.points).padStart(2)} voided=${res.voidedLegs.length} reduced=${res.reduced}`,
    );
    return res;
  };

  // --- empty
  const empty = row('empty', resolveParlay([], map, false, pre));
  assert.equal(empty.state, 'empty');
  assert.equal(empty.worth, 0);

  // --- under_min (1 and 2 legs)
  for (const k of [1, 2]) {
    const r = row(`under_min (${k} leg)`, resolveParlay(legsOf(k), map, false, pre));
    assert.equal(r.state, 'under_min');
    assert.equal(r.worth, 0);
  }

  // --- valid (3, 4, 5 legs)
  for (const k of [3, 4, 5]) {
    const r = row(`valid (${k} legs)`, resolveParlay(legsOf(k), map, false, pre));
    assert.equal(r.state, 'valid');
    assert.equal(r.worth, DEFAULT_SCORING.parlayWorth[k]);
    assert.equal(r.outcome, 'pending');
  }

  // --- at_max (6 legs)
  const atMax = row('at_max (6 legs)', resolveParlay(legsOf(6), map, false, pre));
  assert.equal(atMax.state, 'at_max');
  assert.equal(atMax.worth, DEFAULT_SCORING.parlayWorth[6]);

  // --- 🔴 partial_lock: legs lock INDEPENDENTLY. Three legs, one game has kicked.
  const half = slate[0].kickoffUtc + 60_000; // leg 0 kicked, legs 1 and 2 have not
  const partial = row('partial_lock (1 of 3 kicked)', resolveParlay(legsOf(3), map, false, half));
  assert.equal(partial.state, 'partial_lock');
  assert.deepEqual(partial.legs.map((l) => l.locked), [true, false, false]);
  assert.equal(partial.outcome, 'pending');

  // --- locked: every leg's own game has kicked, none has finished
  const locked = row('locked (all kicked, none final)', resolveParlay(legsOf(3), map, false, post));
  assert.equal(locked.state, 'locked');
  assert.equal(locked.outcome, 'pending');
  assert.deepEqual(locked.legs.map((l) => l.locked), [true, true, true]);

  // --- won
  const finals = gameMap(synthSlate(8));
  const finalLegs = [...finals.values()].slice(0, 4).map((g) => ({
    gameId: g.id,
    side: g.homeScore > g.awayScore ? 'home' : 'away',
  }));
  const won = row('won (4 legs)', resolveParlay(finalLegs, finals, false, post));
  assert.equal(won.state, 'won');
  assert.equal(won.outcome, 'won');
  assert.equal(won.points, DEFAULT_SCORING.parlayWorth[4]);

  // --- lost: one leg on the wrong side
  const lostLegs = finalLegs.map((l, i) =>
    i === 2 ? { ...l, side: l.side === 'home' ? 'away' : 'home' } : l);
  const lost = row('lost (1 of 4 missed)', resolveParlay(lostLegs, finals, false, post));
  assert.equal(lost.state, 'lost');
  assert.equal(lost.points, 0);

  // --- 🔴 one leg void, 6 -> 5 surviving. NOT killed. NOT silent.
  const voided1 = new Map(finals);
  const vId = [...finals.keys()][1];
  voided1.set(vId, shell(finals.get(vId), { status: 'void' }));
  const sixLegs = [...finals.values()].slice(0, 6).map((g) => ({
    gameId: g.id,
    side: g.homeScore > g.awayScore ? 'home' : 'away',
  }));
  const reduced = row('one leg void (6->5, won)', resolveParlay(sixLegs, voided1, false, post));
  assert.equal(reduced.outcome, 'won');
  assert.equal(reduced.survivingLegCount, 5);
  assert.equal(reduced.reduced, true);
  assert.deepEqual(reduced.voidedLegs, [vId]);
  assert.equal(reduced.points, DEFAULT_SCORING.parlayWorth[5]);
  assert.match(reduced.note, /voided/);
  assert.equal(reduced.legs.find((l) => l.gameId === vId).result, 'void');

  // --- 🔴 voided below the minimum: 4 legs, 2 void, 2 survive -> the PARLAY voids
  const voided2 = new Map(finals);
  const vIds = [...finals.keys()].slice(0, 2);
  for (const id of vIds) voided2.set(id, shell(finals.get(id), { status: 'void' }));
  const below = row('void below min (4->2)', resolveParlay(finalLegs, voided2, false, post));
  assert.equal(below.outcome, 'void');
  assert.equal(below.voidReason, 'voided_below_min');
  assert.equal(below.points, 0);
  assert.equal(below.survivingLegCount, 2);
  assert.match(below.note, /under the 3-leg minimum/);
  assert.match(below.note, /no points won, no points lost/);

  // --- 🔴 a void does NOT beat a loss: a missed leg is still a loss
  const voidedAndLost = new Map(voided1);
  const mixed = row('1 void + 1 miss (6 legs)', resolveParlay(
    sixLegs.map((l, i) => (i === 3 ? { ...l, side: l.side === 'home' ? 'away' : 'home' } : l)),
    voidedAndLost, false, post,
  ));
  assert.equal(mixed.outcome, 'lost');
  assert.equal(mixed.points, 0);

  // --- never valid: 2 legs, both games kicked and finished
  const never = row('never_valid (2 legs, all final)', resolveParlay(
    finalLegs.slice(0, 2), finals, false, post,
  ));
  assert.equal(never.outcome, 'void');
  assert.equal(never.voidReason, 'never_valid');

  console.log('\n  PARLAY STATE MACHINE — every state exercised\n  ' + '-'.repeat(94));
  for (const line of table) console.log('  ' + line);
  console.log('');
});

test('parlay worth is whole points in this pool, never odds', () => {
  assert.equal(parlayWorth(2), 0);
  assert.equal(parlayWorth(7), 0);
  for (let k = PARLAY_MIN_LEGS; k <= PARLAY_MAX_LEGS; k++) {
    const w = parlayWorth(k);
    assert.ok(Number.isInteger(w) && w > 0, `worth(${k}) = ${w}`);
  }
  // strictly increasing with legs — the high-variance swing
  const ws = [3, 4, 5, 6].map((k) => parlayWorth(k));
  for (let i = 1; i < ws.length; i++) assert.ok(ws[i] > ws[i - 1]);
});

test('3 min and 6 max are enforced in the SCORER, not only the UI', () => {
  const slate = synthSlate(8, { status: 'scheduled' });
  const map = gameMap(slate);
  const now = slate[0].kickoffUtc - 3600_000;
  const picks = new Map(slate.map((g) => [g.id, 'home']));
  const legs = (k) => slate.slice(0, k).map((g) => ({ gameId: g.id, side: 'home' }));

  assert.equal(validateParlay(legs(2), picks, map, now).errors[0].code, 'too_few_legs');
  assert.equal(validateParlay(legs(7), picks, map, now).errors[0].code, 'too_many_legs');
  assert.equal(validateParlay(legs(3), picks, map, now).ok, true);
  assert.equal(validateParlay(legs(6), picks, map, now).ok, true);
  // and the scorer refuses to pay them
  assert.equal(resolveParlay(legs(7), map, false, now).worth, 0);
});

test('a leg must come from a pick already made, and must agree with it', () => {
  const slate = synthSlate(4, { status: 'scheduled' });
  const map = gameMap(slate);
  const now = slate[0].kickoffUtc - 3600_000;

  const noPick = validateParlay(
    slate.slice(0, 3).map((g) => ({ gameId: g.id, side: 'home' })),
    new Map([[slate[0].id, 'home'], [slate[1].id, 'home']]), map, now,
  );
  assert.equal(noPick.ok, false);
  assert.ok(noPick.errors.some((e) => e.code === 'no_pick_on_game'));

  const disagrees = validateParlay(
    slate.slice(0, 3).map((g) => ({ gameId: g.id, side: 'home' })),
    new Map(slate.map((g, i) => [g.id, i === 1 ? 'away' : 'home'])), map, now,
  );
  assert.ok(disagrees.errors.some((e) => e.code === 'leg_disagrees_with_pick'));

  const dupe = validateParlay(
    [slate[0], slate[0], slate[1]].map((g) => ({ gameId: g.id, side: 'home' })),
    new Map(slate.map((g) => [g.id, 'home'])), map, now,
  );
  assert.ok(dupe.errors.some((e) => e.code === 'duplicate_game'));

  const kicked = validateParlay(
    slate.slice(0, 3).map((g) => ({ gameId: g.id, side: 'home' })),
    new Map(slate.map((g) => [g.id, 'home'])), map, slate[3].kickoffUtc + 1,
  );
  assert.ok(kicked.errors.some((e) => e.code === 'game_already_kicked'));
});

/* ================================================================== *
 * 4 · PICK LOCK — editable until that game kicks
 * ================================================================== */

test('a pick is editable until its own kickoff and not one millisecond after', () => {
  const g = shell(OU, { status: 'scheduled', homeScore: null, awayScore: null });
  assert.equal(isPickEditable(g, g.kickoffUtc - 1), true);
  assert.equal(isPickEditable(g, g.kickoffUtc), false);
  assert.equal(isPickEditable(g, g.kickoffUtc + 1), false);
  assert.equal(pickState('home', g, false, g.kickoffUtc - 1), 'picked');
  assert.equal(pickState('home', g, false, g.kickoffUtc), 'locked');
  assert.equal(pickState(null, g, false, g.kickoffUtc - 1), 'unpicked');
  assert.equal(pickState('home', shell(g, { status: 'in_progress' }), false, AFTER), 'in_progress');
});

test('each game locks on its own clock — the slate is half-locked all Saturday', () => {
  // Three REAL kickoffs, three hours apart. At 16:45Z only OU and OSU have kicked.
  const mid = Date.parse('2026-09-05T16:45:00Z');
  const open = REAL_SLATE.filter((g) => isPickEditable(shell(g, { status: 'scheduled' }), mid));
  assert.deepEqual(open.map((g) => g.home.abbrev), ['ORE']);
});

/* ================================================================== *
 * 5 · CROWD — the pool's own split, after the tap, with the small-n rule
 * ================================================================== */

test('crowd is NEVER shown before the viewer has picked', () => {
  const sides = ['home', 'home', 'home', 'away', 'away', 'away'];
  assert.equal(crowdSplit(sides, false), null);
  assert.equal(crowdSuppression(sides, false), 'not_picked');
  assert.notEqual(crowdSplit(sides, true), null);
});

test(`SMALL-N RULE: suppressed below n=${CROWD_MIN_N}, and suppressed for a lone dissenter at any n`, () => {
  // The brief's own example: a pool of four, 75% is three people and it identifies them.
  assert.equal(crowdSplit(['home', 'home', 'home', 'away'], true), null);
  assert.equal(crowdSuppression(['home', 'home', 'home', 'away'], true), 'small_n');

  // n = 5, minority 2 -> shown
  assert.deepEqual(crowdSplit(['home', 'home', 'home', 'away', 'away'], true),
    { home: 3, away: 2, n: 5 });

  // n = 17, minority 1 -> suppressed. "94% took Oregon" names one person.
  const lone = Array(16).fill('home').concat(['away']);
  assert.equal(crowdSplit(lone, true), null);
  assert.equal(crowdSuppression(lone, true), 'lone_dissenter');

  // unanimous names nobody -> shown
  const unanimous = Array(8).fill('home');
  assert.deepEqual(crowdSplit(unanimous, true), { home: 8, away: 0, n: 8 });

  assert.equal(CROWD_MIN_MINORITY, 2);
});

/* ================================================================== *
 * 6 · SCOPE — a property of the pool, locked at the first kickoff of week 1
 * ================================================================== */

const poolOf = (over = {}) => ({
  id: 'PLKRTZ',
  name: 'The Office',
  commissionerId: 'u1',
  scope: 'all',
  scopeArg: null,
  rankingSource: null,
  ats: false,
  season: 2026,
  scopeLockedAt: null,
  memberCount: 8,
  ...over,
});

test('scope is editable until the first kickoff of week 1, then locked', () => {
  const lock = firstKickoffOfWeek1(REAL_SLATE);
  assert.equal(lock, OU.kickoffUtc); // the real earliest week-1 kickoff on the slate
  const p = poolOf({ scopeLockedAt: lock });
  assert.equal(scopeIsEditable(p, lock - 1), true);
  assert.equal(scopeIsEditable(p, lock), false);
  assert.equal(scopeIsEditable(poolOf(), AFTER), true); // never locked yet
});

test('scope filters the slate for everybody, never per user', () => {
  const ranked = new Set([OU.home.id, OSU.home.id]); // 201, 194
  assert.equal(applyScope(REAL_SLATE, poolOf({ scope: 'all' })).length, 3);
  assert.deepEqual(
    applyScope(REAL_SLATE, poolOf({ scope: 'top25' }), { rankedTeamIds: ranked }).map((g) => g.id),
    [OU.id, OSU.id],
  );
  assert.deepEqual(
    applyScope(REAL_SLATE, poolOf({ scope: 'ranked_v_ranked' }), { rankedTeamIds: ranked }), [],
  );
  assert.deepEqual(
    applyScope(REAL_SLATE, poolOf({ scope: 'handpick', scopeArg: `${ORE.id},${OU.id}` }))
      .map((g) => g.id).sort(),
    [OU.id, ORE.id].sort(),
  );
  const conf = new Map([[OU.home.id, 'big12'], [OU.away.id, 'big12'], [OSU.home.id, 'b1g']]);
  assert.deepEqual(
    applyScope(REAL_SLATE, poolOf({ scope: 'conference', scopeArg: 'big12' }),
      { conferenceOfTeam: conf }).map((g) => g.id),
    [OU.id],
  );
  // a scope that needs data it was not given throws rather than inventing a list
  assert.throws(() => applyScope(REAL_SLATE, poolOf({ scope: 'top25' })), /rankedTeamIds/);
});

/* ================================================================== *
 * 7 · STANDINGS AND THE ONE TIEBREAKER
 * ================================================================== */

test('the tiebreaker is one predicted combined total, on a REAL final score', () => {
  assert.equal(tiebreakActual(ORE), 61); // 34 + 27, real
  assert.equal(tiebreakActual(OU), 51);
  assert.equal(tiebreakActual(shell(ORE, { status: 'void' })), null);
  assert.equal(tiebreakActual(shell(ORE, { status: 'scheduled' })), null);
});

test('ties break on the tiebreaker, and a VOID tiebreak game leaves ties standing', () => {
  const rows = [
    { userId: 'a', displayName: 'Ann', weekPoints: 9, seasonPoints: 9, parlayPoints: 0, predictedTotal: 55 },
    { userId: 'b', displayName: 'Bob', weekPoints: 9, seasonPoints: 9, parlayPoints: 0, predictedTotal: 62 },
    { userId: 'c', displayName: 'Cal', weekPoints: 7, seasonPoints: 7, parlayPoints: 0, predictedTotal: 61 },
  ];
  // real actual = 61, so Bob misses by 1 and Ann by 6
  const t = standings({ rows, basis: 'week', tiebreak: { game: ORE }, selfUserId: 'c' });
  assert.deepEqual(t.map((r) => [r.displayName, r.rank]), [['Bob', 1], ['Ann', 2], ['Cal', 3]]);
  assert.equal(t.find((r) => r.userId === 'c').isSelf, true);

  // the tiebreak game voided -> the tiebreaker did not happen, ties stand level
  const v = standings({ rows, basis: 'week', tiebreak: { game: shell(ORE, { status: 'void' }) } });
  assert.deepEqual(v.map((r) => r.rank), [1, 1, 3]);
});

test('a member with no tiebreak prediction sorts behind everyone who made one', () => {
  const rows = [
    { userId: 'a', displayName: 'Ann', weekPoints: 5, seasonPoints: 5, parlayPoints: 0, predictedTotal: null },
    { userId: 'b', displayName: 'Bob', weekPoints: 5, seasonPoints: 5, parlayPoints: 0, predictedTotal: 90 },
  ];
  const t = standings({ rows, basis: 'week', tiebreak: { game: ORE } });
  assert.deepEqual(t.map((r) => r.displayName), ['Bob', 'Ann']);
});

test('movement is prior rank minus rank, and is 0 for a member who just joined', () => {
  const rows = [
    { userId: 'a', displayName: 'Ann', weekPoints: 9, seasonPoints: 20, parlayPoints: 5, priorRank: 3 },
    { userId: 'b', displayName: 'Bob', weekPoints: 8, seasonPoints: 19, parlayPoints: 0, priorRank: 1 },
    { userId: 'c', displayName: 'Cal', weekPoints: 1, seasonPoints: 1, parlayPoints: 0, priorRank: null },
  ];
  const t = standings({ rows, basis: 'season' });
  assert.deepEqual(t.map((r) => [r.displayName, r.rank, r.movement]),
    [['Ann', 1, 2], ['Bob', 2, -1], ['Cal', 3, 0]]);
});

test('the parlay is called out where it moved somebody', () => {
  const rows = [
    { userId: 'a', displayName: 'Ann', weekPoints: 6, seasonPoints: 6, parlayPoints: 0 },
    { userId: 'b', displayName: 'Bob', weekPoints: 9, seasonPoints: 9, parlayPoints: 5 },
  ];
  const t = standings({ rows, basis: 'week' });
  assert.equal(t[0].displayName, 'Bob');
  assert.equal(t[0].parlayPoints, 5);
  // 4 picks + a 3-leg parlay beats 6 picks and no parlay. That is the swing.
  assert.equal(t[0].weekPoints - t[0].parlayPoints, 4);
});

/* ================================================================== *
 * 8 · SCALE — 3 games and 131 games
 *
 * 🔴 131 is the REAL measurement (BUILD dispatch, 2026-09-08: a college football week
 *    is 131 games, not 60 — sixty is the FBS slice). The GAMES here are synthetic.
 * ================================================================== */

test('the scorer holds at 3 games (REAL) and at 131 games (synthetic, flagged)', () => {
  const three = scoreWeek({
    week: 1, games: REAL_SLATE, ats: false, now: AFTER,
    picks: REAL_SLATE.map((g) => ({ userId: 'u', gameId: g.id, side: 'home' })),
  });
  assert.equal(three[0].pickPoints, 3);
  assert.equal(three[0].correct, 3);

  const big = synthSlate(131);
  assert.equal(big.length, 131);
  const map = gameMap(big);
  const users = 12;
  const picks = [];
  for (let u = 0; u < users; u++) {
    for (let i = 0; i < big.length; i++) {
      picks.push({ userId: `u${u}`, gameId: big[i].id, side: (i + u) % 3 === 0 ? 'away' : 'home' });
    }
  }
  const parlays = [];
  for (let u = 0; u < users; u++) {
    parlays.push({
      userId: `u${u}`,
      legs: big.slice(u, u + 4).map((g) => ({
        gameId: g.id, side: g.homeScore > g.awayScore ? 'home' : 'away',
      })),
    });
  }
  const t0 = performance.now();
  const rows = scoreWeek({ week: 2, games: big, ats: false, now: AFTER + 30 * 86400_000, picks, parlays });
  const ms = performance.now() - t0;

  assert.equal(rows.length, users);
  for (const r of rows) {
    assert.equal(r.correct + r.wrong + r.voided + r.pending, 131);
    assert.equal(r.weekPoints, r.pickPoints + r.parlayPoints);
    assert.equal(r.parlay.outcome, 'won');
    assert.equal(r.parlayPoints, DEFAULT_SCORING.parlayWorth[4]);
  }
  const board = standings({
    rows: rows.map((r) => ({
      userId: r.userId, displayName: r.userId,
      weekPoints: r.weekPoints, seasonPoints: r.weekPoints, parlayPoints: r.parlayPoints,
    })),
    basis: 'week',
  });
  assert.equal(board.length, users);
  assert.equal(board[0].rank, 1);

  console.log(`\n  SCALE: 3 real games -> ${three[0].pickPoints} pts.` +
    ` 131 synthetic games x ${users} users x (131 picks + 1 parlay) scored in ${ms.toFixed(1)} ms.` +
    `\n  top of board: ${board[0].displayName} ${board[0].weekPoints} pts` +
    ` (${board[0].weekPoints - board[0].parlayPoints} picks + ${board[0].parlayPoints} parlay)\n`);
});

test('crowd holds at 131 games with a per-game n', () => {
  const big = synthSlate(131);
  let shown = 0, suppressed = 0;
  for (let i = 0; i < big.length; i++) {
    // n varies per game, 1..12, which is what a real pool looks like
    const n = (i % 12) + 1;
    const sides = Array.from({ length: n }, (_, k) => (k % 4 === 0 ? 'away' : 'home'));
    if (crowdSplit(sides, true) === null) suppressed++; else shown++;
  }
  assert.equal(shown + suppressed, 131);
  assert.ok(suppressed > 0 && shown > 0);
  console.log(`  CROWD at 131 games: ${shown} shown, ${suppressed} suppressed by the small-n rule\n`);
});

/* ================================================================== *
 * 9 · THE WORD SCAN — CONTRACT §5 "Words", BUILD-BRIEF §3
 * ================================================================== */

const SRC = readFileSync(new URL('../src/lib/pool.ts', import.meta.url), 'utf8');

/** The file with every comment removed. Doctrine written in a comment is not shipped
 *  code — this module's own header says "the pool does not use Marbles" and must. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Every string a user could ever be shown. Keywords and comments are not copy. */
function userFacingStrings(src) {
  const out = [];
  const re = /(['"`])(?:\\.|(?!\1)[\s\S])*\1/g;
  const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  let m;
  while ((m = re.exec(stripped)) !== null) out.push(m[0]);
  return out;
}

test('no purchasable-currency vocabulary reaches a user-facing string', () => {
  const banned = ['credit', 'coin', 'top-up', 'topup', 'purchase', 'refill', 'wallet', 'checkout'];
  const strings = userFacingStrings(SRC);
  assert.ok(strings.length > 10, 'the scanner found strings to scan');
  for (const s of strings) {
    for (const w of banned) {
      assert.ok(!s.toLowerCase().includes(w), `banned word "${w}" in ${s}`);
    }
  }
});

test('🔴 the pool does not use Marbles, and no board sums the two halves', () => {
  // Comments are stripped: this module's own header STATES the rule and must keep saying so.
  const lower = CODE.toLowerCase();
  for (const w of ['marble', 'stake', 'balance', 'payout', 'bank', 'profit']) {
    assert.ok(!lower.includes(w), `pool.ts code must not mention "${w}" — that is the live layer`);
  }
  // and nothing user-facing names them either
  for (const s of userFacingStrings(SRC)) {
    for (const w of ['marble', 'stake', 'balance', 'bank']) {
      assert.ok(!s.toLowerCase().includes(w), `"${w}" in user-facing string ${s}`);
    }
  }
});

test('no odds are displayed: everything user-facing is whole points', () => {
  for (const s of userFacingStrings(SRC)) {
    assert.ok(!/[+-]\d{3}\b/.test(s), `American odds in ${s}`);        // -110, +250
    assert.ok(!/\b\d+\s*\/\s*\d+\b/.test(s), `fractional odds in ${s}`); // 5/2
    assert.ok(!/\bodds\b/i.test(s), `the word "odds" in ${s}`);
  }
  for (let k = PARLAY_MIN_LEGS; k <= PARLAY_MAX_LEGS; k++) {
    assert.ok(Number.isInteger(parlayWorth(k)));
  }
});
