/* markets.test.mjs — the per-game markets, settled against a REAL game.
 *
 * 🔴 RULE ZERO. Nothing here is closed against data this file wrote. There is
 * no fixture in this file and none is created by it. Every number asserted
 * below was worked out BY HAND from one captured game and hard-coded:
 *
 *   fixtures/real-ne-at-sea-260909-final.json
 *   New England at Seattle, 2026-09-09, FINAL, 179 real plays.
 *
 *   final          SEA (home) 13, NE (away) 10   — SEA won
 *   end of Q1      home  0, away  0
 *   end of Q2      home  0, away  7
 *   end of Q3      home  3, away 10
 *   posted line    SEA -3, total 44.5            — from the game's own feed
 *
 * Everything else follows from those five lines with arithmetic done here, in
 * this comment, before a line of the module was run:
 *
 *   spread    13 + (-3) = 10, away 10            -> EXACTLY LEVEL. A push.
 *   total     13 + 10 = 23 vs 44.5               -> under
 *   h1 total  44.5 / 2 = 22.25 -> 22.5 line, first half 0 + 7 = 7  -> under
 *   Q1 alone  home 0 - 0 = 0,  away 0 - 0 = 0    -> tie
 *   Q2 alone  home 0 - 0 = 0,  away 7 - 0 = 7    -> away
 *   Q3 alone  home 3 - 0 = 3,  away 10 - 7 = 3   -> tie
 *   Q4 alone  home 13 - 3 = 10, away 10 - 10 = 0 -> home
 *   home tt   44.5/2 - (-3)/2 = 23.75, home 13   -> under
 *   away tt   44.5/2 + (-3)/2 = 20.75, away 10   -> under
 *   first     the only score of the first half was NE's -> away
 *   margin    |13 - 10| = 3                      -> the 1-6 bucket
 *
 * The push and the two tied quarters are not contrived — this real game
 * happens to exercise the one void path and the tie choice for free, which is
 * why it is the game this suite is built on.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');

/* Node 24 strips the .ts types itself, exactly as tools/preview.mjs does for
 * the browser, so both runtimes execute the same source file. */
const M = await import(pathToFileURL(path.join(REPO, 'src/markets.ts')).href);

const RAW_TEXT = readFileSync(
  path.join(REPO, 'fixtures', 'real-ne-at-sea-260909-final.json'), 'utf8');
const RAW = JSON.parse(RAW_TEXT);

/* ── the play list, flattened and put into the module's shape ─────────────
 * drives.previous[].plays plus drives.current.plays, in feed order, which is
 * chronological. Only field NAMES are translated: period.number -> quarter,
 * type.text -> typeText. No score is computed, reordered or repaired here —
 * doing any of that would make this suite grade the module against this
 * file's arithmetic instead of against the game. */
function flattenPlays(doc) {
  const d = doc.drives || {};
  const raw = [
    ...(d.previous || []).flatMap((drive) => drive.plays || []),
    ...((d.current && d.current.plays) || []),
  ];
  return raw.map((p) => ({
    quarter: p.period?.number,
    homeScore: p.homeScore,
    awayScore: p.awayScore,
    text: p.text || '',
    typeText: p.type?.text || '',
    scoringPlay: !!p.scoringPlay,
  }));
}

const PLAYS = flattenPlays(RAW);

const COMP = RAW.header.competitions[0];
const HOME = COMP.competitors.find((c) => c.homeAway === 'home');
const AWAY = COMP.competitors.find((c) => c.homeAway === 'away');
const PICK = RAW.pickcenter[0];

/* The real game, assembled from the captured feed and nowhere else. */
const GAME = {
  id: RAW.header.id,
  homeTeamId: HOME.id,
  awayTeamId: AWAY.id,
  homeScore: Number(HOME.score),
  awayScore: Number(AWAY.score),
  status: COMP.status.type.name === 'STATUS_FINAL' ? 'final' : 'in_progress',
  spread: PICK.spread,        // the HOME number, ESPN convention: SEA -3
  total: PICK.overUnder,      // 44.5
};

const settle = (m, c, g = GAME, p = PLAYS) => M.settleMarket(m, c, g, p);

/* ══════════════════════════════════════════════════════════════════════════
 * 0 — THE FIXTURE IS WHAT THIS SUITE SAYS IT IS
 * Asserted against the hard-coded truths at the top, so that a fixture swap
 * fails HERE with an obvious message instead of somewhere downstream as a
 * mysterious settlement change.
 * ═════════════════════════════════════════════════════════════════════════ */

test('the captured game is NE 10 at SEA 13, final, 179 plays, SEA -3 / 44.5', () => {
  assert.equal(PLAYS.length, 179);
  assert.equal(GAME.homeTeamId, '26');      // SEA
  assert.equal(GAME.awayTeamId, '17');      // NE
  assert.equal(GAME.homeScore, 13);
  assert.equal(GAME.awayScore, 10);
  assert.equal(GAME.status, 'final');
  assert.equal(GAME.spread, -3);
  assert.equal(GAME.total, 44.5);
});

test('every one of the 179 plays carries quarter, homeScore and awayScore', () => {
  /* Rule 5 rests on this being true of the real feed, so it is checked rather
   * than assumed. 179 of 179, or the rule is built on sand. */
  const complete = PLAYS.filter((p) =>
    Number.isInteger(p.quarter) &&
    typeof p.homeScore === 'number' &&
    typeof p.awayScore === 'number');
  assert.equal(complete.length, 179);
});

/* ══════════════════════════════════════════════════════════════════════════
 * 1 — THE CATALOG
 * ═════════════════════════════════════════════════════════════════════════ */

/* 🔴 FIFTEEN NOW. h2_winner and h2_total were added 2026-09-10 because Jason
 * asked "So I can only bet on who wins the second half until kick?" and the
 * honest answer was that he could not bet on it at all - there was an h1 of
 * each and no h2, so a scope named "half" was really about the first one. The
 * catalogue looked complete because every other scope came in a full set.
 *
 * This census test is the reason the gap was findable at all, and it is why
 * it stays a literal list rather than a count. */
test('GAME_MARKETS is exactly the fifteen agreed markets, in order', () => {
  assert.deepEqual(M.GAME_MARKETS.map((m) => m.id), [
    'winner', 'spread', 'total',
    'h1_winner', 'h1_total', 'h2_winner', 'h2_total',
    'q1_winner', 'q2_winner', 'q3_winner', 'q4_winner',
    'team_total_home', 'team_total_away',
    'first_to_score', 'margin',
  ]);
});

test('every market is structurally sound: scope, period, line, choices', () => {
  for (const m of M.GAME_MARKETS) {
    assert.ok(typeof m.id === 'string' && m.id.length > 0, `${m.id}: id`);
    assert.ok(typeof m.label === 'string' && m.label.length > 0, `${m.id}: label`);
    assert.ok(['game', 'half', 'quarter'].includes(m.scope), `${m.id}: scope`);

    /* A period belongs to a period market and to nothing else. A game-scope
     * market carrying one would be read by a view as a quarter market. */
    if (m.scope === 'game') {
      assert.equal(m.period, undefined, `${m.id}: game scope must carry no period`);
    } else {
      assert.ok(Number.isInteger(m.period) && m.period >= 1 && m.period <= 4,
        `${m.id}: period out of range`);
    }
    if (m.needsLine !== undefined) {
      assert.ok(['spread', 'total'].includes(m.needsLine), `${m.id}: needsLine`);
    }
    assert.ok(m.choices.length >= 2, `${m.id}: needs at least two choices`);
    assert.equal(new Set(m.choices.map((c) => c.id)).size, m.choices.length,
      `${m.id}: duplicate choice id`);
    for (const c of m.choices) {
      assert.ok(typeof c.label === 'string' && c.label.length > 0, `${m.id}/${c.id}: label`);
    }
  }
});

test('the catalog is a fresh structure, not shared arrays a caller can corrupt', () => {
  const a = M.GAME_MARKETS.find((m) => m.id === 'q1_winner');
  const b = M.GAME_MARKETS.find((m) => m.id === 'q2_winner');
  assert.notEqual(a.choices, b.choices);
  assert.notEqual(a.choices[0], b.choices[0]);
});

/* ══════════════════════════════════════════════════════════════════════════
 * 2 — scoreAfterPeriod, DERIVED FROM THE PLAY LIST (rule 5)
 * ═════════════════════════════════════════════════════════════════════════ */

test('scoreAfterPeriod reproduces the four real period boundaries', () => {
  assert.deepEqual(M.scoreAfterPeriod(PLAYS, 1), { home: 0, away: 0 });
  assert.deepEqual(M.scoreAfterPeriod(PLAYS, 2), { home: 0, away: 7 });
  assert.deepEqual(M.scoreAfterPeriod(PLAYS, 3), { home: 3, away: 10 });
  assert.deepEqual(M.scoreAfterPeriod(PLAYS, 4), { home: 13, away: 10 });
});

test('scoreAfterPeriod returns null for a period the game never reached', () => {
  assert.equal(M.scoreAfterPeriod(PLAYS, 5), null);   // no overtime was played
  assert.equal(M.scoreAfterPeriod(PLAYS, 9), null);
});

test('scoreAfterPeriod validates the period instead of testing it for truth', () => {
  /* 0 is falsy and 0 is not a period. -1 is truthy-adjacent nonsense. Neither
   * may be quietly coerced into "the first quarter". */
  assert.equal(M.scoreAfterPeriod(PLAYS, 0), null);
  assert.equal(M.scoreAfterPeriod(PLAYS, -1), null);
  assert.equal(M.scoreAfterPeriod(PLAYS, 1.5), null);
  assert.equal(M.scoreAfterPeriod(PLAYS, NaN), null);
  assert.equal(M.scoreAfterPeriod(PLAYS, undefined), null);
  assert.equal(M.scoreAfterPeriod(PLAYS, '2'), null);
});

test('scoreAfterPeriod survives an empty, absent or unusable play list', () => {
  assert.equal(M.scoreAfterPeriod([], 1), null);
  assert.equal(M.scoreAfterPeriod(null, 1), null);
  assert.equal(M.scoreAfterPeriod(undefined, 1), null);
  assert.equal(M.scoreAfterPeriod([{ text: 'no period, no score' }], 1), null);
});

test('scoreAfterPeriod truncated to the first half sees the first half only', () => {
  const firstHalf = PLAYS.filter((p) => p.quarter <= 2);
  assert.deepEqual(M.scoreAfterPeriod(firstHalf, 1), { home: 0, away: 0 });
  assert.deepEqual(M.scoreAfterPeriod(firstHalf, 2), { home: 0, away: 7 });
  assert.equal(M.scoreAfterPeriod(firstHalf, 3), null);
});

/* ══════════════════════════════════════════════════════════════════════════
 * 3 — SETTLING THE REAL GAME
 * ═════════════════════════════════════════════════════════════════════════ */

test('winner: SEA (home) won 13-10', () => {
  const home = settle('winner', 'home');
  assert.equal(home.landed, true);
  assert.match(home.because, /13/);
  assert.match(home.because, /10/);
  assert.equal(settle('winner', 'away').landed, false);
});

test('spread: 13 with -3 is exactly 10 against 10 — a PUSH, both sides void', () => {
  /* The single most valuable case in this fixture: a real game whose real
   * posted line landed exactly. Both choices must return the same void. */
  assert.deepEqual(settle('spread', 'home'), { landed: null, because: 'push' });
  assert.deepEqual(settle('spread', 'away'), { landed: null, because: 'push' });
});

test('total: 23 points against a posted 44.5 is under', () => {
  const under = settle('total', 'under');
  assert.equal(under.landed, true);
  assert.match(under.because, /23/);
  assert.match(under.because, /44\.5/);
  assert.equal(settle('total', 'over').landed, false);
});

test('h1_winner: 0-7 at the half, away', () => {
  assert.equal(settle('h1_winner', 'away').landed, true);
  assert.equal(settle('h1_winner', 'home').landed, false);
  assert.equal(settle('h1_winner', 'tie').landed, false);
});

test('h1_total: the half line is 22.5, and the sentence says where it came from', () => {
  const under = settle('h1_total', 'under');
  assert.equal(under.landed, true);
  assert.equal(settle('h1_total', 'over').landed, false);
  /* Rule 1's one sanctioned derived line, and the condition on it: the
   * reason must state the halving out loud rather than presenting 22.5 as a
   * number somebody posted. */
  assert.match(under.because, /22\.5/);
  assert.match(under.because, /44\.5/);
  assert.match(under.because, /halved/i);
  assert.match(under.because, /nearest 0\.5/i);
});

test('the four quarters settle on their own scoring, not on the running score', () => {
  /* Q3 is the case that catches a module reading the running score: at the
   * end of Q3 the board says 3-10 (away well ahead) but the quarter ITSELF
   * was 3-3, a tie. */
  assert.equal(settle('q1_winner', 'tie').landed, true);
  assert.equal(settle('q1_winner', 'home').landed, false);
  assert.equal(settle('q1_winner', 'away').landed, false);

  assert.equal(settle('q2_winner', 'away').landed, true);
  assert.equal(settle('q2_winner', 'home').landed, false);
  assert.equal(settle('q2_winner', 'tie').landed, false);

  assert.equal(settle('q3_winner', 'tie').landed, true);
  assert.equal(settle('q3_winner', 'away').landed, false);
  assert.match(settle('q3_winner', 'tie').because, /home 3/);
  assert.match(settle('q3_winner', 'tie').because, /away 3/);

  assert.equal(settle('q4_winner', 'home').landed, true);
  assert.equal(settle('q4_winner', 'away').landed, false);
  assert.match(settle('q4_winner', 'home').because, /home 10/);
});

test('team totals split the posted total by the posted spread', () => {
  const h = settle('team_total_home', 'under');
  assert.equal(h.landed, true);                       // 13 vs 23.75
  assert.equal(settle('team_total_home', 'over').landed, false);
  assert.match(h.because, /23\.75/);

  const a = settle('team_total_away', 'under');
  assert.equal(a.landed, true);                       // 10 vs 20.75
  assert.equal(settle('team_total_away', 'over').landed, false);
  assert.match(a.because, /20\.75/);
});

test('first_to_score: NE, the away side, took the only first-half score', () => {
  const away = settle('first_to_score', 'away');
  assert.equal(away.landed, true);
  assert.match(away.because, /Q2/);
  assert.equal(settle('first_to_score', 'home').landed, false);
  assert.equal(settle('first_to_score', 'neither').landed, false);
});

test('margin: a three point game lands the 1-6 bucket and nothing else', () => {
  assert.equal(settle('margin', '1-6').landed, true);
  assert.equal(settle('margin', '7-13').landed, false);
  assert.equal(settle('margin', '14+').landed, false);
  assert.equal(settle('margin', 'tie').landed, false);
  assert.match(settle('margin', '1-6').because, /3/);
});

test('across the whole catalog, a market lands exactly one choice or voids entirely', () => {
  /* The invariant a scoring screen depends on. Twelve markets decide, and the
   * spread is the one that voids — every choice on it null, with one reason. */
  let decided = 0;
  let voided = 0;
  for (const m of M.GAME_MARKETS) {
    const verdicts = m.choices.map((c) => settle(m.id, c.id));
    const nulls = verdicts.filter((v) => v.landed === null);
    const wins = verdicts.filter((v) => v.landed === true);
    if (nulls.length > 0) {
      assert.equal(nulls.length, m.choices.length,
        `${m.id}: a market cannot void for some choices and settle for others`);
      assert.equal(new Set(verdicts.map((v) => v.because)).size, 1,
        `${m.id}: one void, one reason`);
      voided++;
    } else {
      assert.equal(wins.length, 1, `${m.id}: expected exactly one winning choice`);
      decided++;
    }
    for (const v of verdicts) {
      assert.ok(typeof v.because === 'string' && v.because.length > 0,
        `${m.id}: every verdict carries a reason`);
    }
  }
  /* 14 of 15: the spread pushes on this fixture, which is the void path and
     is asserted separately above. Was 12 of 13 before the second-half pair. */
  assert.equal(decided, 14);
  assert.equal(voided, 1);      // the spread, and only the spread
});

/* ══════════════════════════════════════════════════════════════════════════
 * 4 — RULE 1: NO LINE MEANS NO MARKET, AND NO BOOK IS EVER NAMED
 * ═════════════════════════════════════════════════════════════════════════ */

test('a market that needs a spread it does not have is absent, not invented', () => {
  for (const spread of [null, undefined, NaN, '−3', 'off']) {
    const g = { ...GAME, spread };
    assert.deepEqual(settle('spread', 'home', g), { landed: null, because: 'no posted line' });
    /* And the team totals, which need the spread even though they are
     * declared against the total. */
    assert.deepEqual(settle('team_total_home', 'over', g), { landed: null, because: 'no posted line' });
    assert.deepEqual(settle('team_total_away', 'over', g), { landed: null, because: 'no posted line' });
    /* Everything that does not need a line is unaffected. */
    assert.equal(settle('winner', 'home', g).landed, true);
    assert.equal(settle('margin', '1-6', g).landed, true);
  }
});

test('a market that needs a total it does not have is absent, not invented', () => {
  for (const total of [null, undefined, NaN, 'o44.5']) {
    const g = { ...GAME, total };
    assert.deepEqual(settle('total', 'over', g), { landed: null, because: 'no posted line' });
    assert.deepEqual(settle('h1_total', 'over', g), { landed: null, because: 'no posted line' });
    assert.deepEqual(settle('team_total_home', 'over', g), { landed: null, because: 'no posted line' });
    assert.deepEqual(settle('team_total_away', 'under', g), { landed: null, because: 'no posted line' });
    assert.equal(settle('h1_winner', 'away', g).landed, true);
  }
});

test('the captured feed names a sportsbook and nothing this module returns does', () => {
  /* The temptation is real and it is in the file: the line this suite uses
   * arrives inside a provider block with a book's name and two logo URLs. */
  assert.match(RAW_TEXT, /Draft Kings/);
  assert.equal(PICK.provider.name, 'Draft Kings');

  const BOOKS = /draft\s?kings|fan\s?duel|caesars|bet\s?365|bet\s?mgm|espn\s?bet|bovada|pinnacle|sportsbook|wynn|hard rock|\bbook\b/i;
  const games = [
    GAME,
    { ...GAME, status: 'in_progress' },
    { ...GAME, spread: null, total: null },
    { ...GAME, homeScore: 10, awayScore: 10 },
  ];
  let checked = 0;
  for (const g of games) {
    for (const m of M.GAME_MARKETS) {
      for (const c of m.choices) {
        const v = settle(m.id, c.id, g);
        assert.doesNotMatch(v.because, BOOKS, `${m.id}/${c.id} named a book`);
        checked++;
      }
    }
  }
  /* 39 choices across the fifteen markets: 2+2+2 + 3+2 + 3+2 + 3*4 + 2+2 + 3 + 4. */
  const choices = M.GAME_MARKETS.reduce((n, m) => n + m.choices.length, 0);
  assert.equal(choices, 39);
  assert.equal(checked, 4 * 39);
});

/* ══════════════════════════════════════════════════════════════════════════
 * 5 — RULE 2: NOT FINAL IS NOT A RESULT
 * ═════════════════════════════════════════════════════════════════════════ */

test('an unfinished game settles no game-scope market, however obvious it looks', () => {
  /* Every play of the real game, but the status the feed carried while it was
   * still being played. The scoreboard already reads 13-10 and NE has already
   * scored first — and none of that is a result yet. */
  const live = { ...GAME, status: 'in_progress' };
  for (const id of ['winner', 'spread', 'total', 'team_total_home',
    'team_total_away', 'first_to_score', 'margin']) {
    const m = M.GAME_MARKETS.find((x) => x.id === id);
    for (const c of m.choices) {
      assert.deepEqual(settle(id, c.id, live), { landed: null, because: 'not final yet' },
        `${id}/${c.id} settled a live game`);
    }
  }
});

test('a scheduled or voided game is not final either', () => {
  for (const status of ['scheduled', 'in_progress', 'void', undefined, 'FINAL']) {
    assert.deepEqual(settle('winner', 'home', { ...GAME, status }, []),
      { landed: null, because: 'not final yet' });
  }
});

test('a period settles as soon as a later period proves it over, and not before', () => {
  /* Mid-third-quarter: the first half is history and can be settled, the
   * quarter being played cannot, and the fourth has not happened. */
  const throughQ3 = PLAYS.filter((p) => p.quarter <= 3);
  const live = { ...GAME, status: 'in_progress' };

  assert.equal(settle('q1_winner', 'tie', live, throughQ3).landed, true);
  assert.equal(settle('q2_winner', 'away', live, throughQ3).landed, true);
  assert.equal(settle('h1_winner', 'away', live, throughQ3).landed, true);

  assert.deepEqual(settle('q3_winner', 'tie', live, throughQ3),
    { landed: null, because: 'not final yet' });     // still being played
  assert.deepEqual(settle('q4_winner', 'home', live, throughQ3),
    { landed: null, because: 'not final yet' });     // never reached
});

test('the last period of a live game waits for final, even with every play in hand', () => {
  const live = { ...GAME, status: 'in_progress' };
  assert.deepEqual(settle('q4_winner', 'home', live, PLAYS),
    { landed: null, because: 'not final yet' });
  /* And the moment it is final, the same plays settle it. */
  assert.equal(settle('q4_winner', 'home', GAME, PLAYS).landed, true);
});

test('a half market on a game with no plays at all is absent, not 0-0', () => {
  for (const id of ['h1_winner', 'h1_total', 'q1_winner']) {
    const m = M.GAME_MARKETS.find((x) => x.id === id);
    for (const c of m.choices) {
      assert.deepEqual(settle(id, c.id, GAME, []), { landed: null, because: 'not final yet' });
    }
  }
});

test('a final game with no score anywhere stays unsettled rather than scoring 0-0', () => {
  const broken = { ...GAME, homeScore: null, awayScore: null };
  assert.deepEqual(settle('winner', 'home', broken, []), { landed: null, because: 'not final yet' });
  /* With the plays still in hand it recovers, because the plays carry it. */
  assert.equal(settle('winner', 'home', broken, PLAYS).landed, true);
});

/* ══════════════════════════════════════════════════════════════════════════
 * 6 — RULE 3: ONE VOID PATH
 * ═════════════════════════════════════════════════════════════════════════ */

test('a total that lands exactly is the same void as a spread that does', () => {
  /* A what-if line, not this game's posted one: the real game produced 23
   * points, so a 23 total is an exact landing. */
  const g = { ...GAME, total: 23 };
  assert.deepEqual(settle('total', 'over', g), { landed: null, because: 'push' });
  assert.deepEqual(settle('total', 'under', g), { landed: null, because: 'push' });
});

test('a drawn game voids a market with no tie choice and settles one that has it', () => {
  /* A constructed 10-10, because the real game was not drawn. The play list
   * still belongs to the real game and is only used by the period markets. */
  const drawn = { ...GAME, homeScore: 10, awayScore: 10 };
  assert.deepEqual(settle('winner', 'home', drawn), { landed: null, because: 'push' });
  assert.deepEqual(settle('winner', 'away', drawn), { landed: null, because: 'push' });
  assert.equal(settle('margin', 'tie', drawn).landed, true);   // the bucket exists, so it settles
  assert.equal(settle('margin', '1-6', drawn).landed, false);
  /* And the quarter markets, which carry a tie choice, never take the void
   * path for a tied quarter — Q1 and Q3 of this real game were both tied. */
  assert.equal(settle('q1_winner', 'tie').landed, true);
  assert.equal(settle('q3_winner', 'tie').landed, true);
});

test('a first-half total that lands exactly pushes on the derived line', () => {
  /* First half was 7 points. A posted total of 14 halves to a 7.0 line. */
  const g = { ...GAME, total: 14 };
  assert.deepEqual(settle('h1_total', 'over', g), { landed: null, because: 'push' });
  assert.deepEqual(settle('h1_total', 'under', g), { landed: null, because: 'push' });
});

test('there are exactly three void reasons in the whole module', () => {
  const seen = new Set();
  const games = [
    GAME,
    { ...GAME, status: 'in_progress' },
    { ...GAME, status: 'void' },
    { ...GAME, spread: null },
    { ...GAME, total: null },
    { ...GAME, total: 23 },
    { ...GAME, homeScore: 10, awayScore: 10 },
    { ...GAME, homeScore: null, awayScore: null },
  ];
  for (const g of games) {
    for (const plays of [PLAYS, [], PLAYS.filter((p) => p.quarter <= 2)]) {
      for (const m of M.GAME_MARKETS) {
        for (const c of m.choices) {
          const v = settle(m.id, c.id, g, plays);
          if (v.landed === null) seen.add(v.because);
        }
      }
    }
  }
  assert.deepEqual([...seen].sort(), ['no posted line', 'not final yet', 'push']);
});

/* ══════════════════════════════════════════════════════════════════════════
 * 7 — RULE 4: VALIDITY, NEVER TRUTHINESS
 * ═════════════════════════════════════════════════════════════════════════ */

test('a pick-em spread of 0 is a real line and settles', () => {
  /* `if (spread)` is false at a pick-em. This is the shape that shipped
   * "-1 & 10" and "0 yards to the end zone", so it gets its own test. */
  const g = { ...GAME, spread: 0 };
  const home = settle('spread', 'home', g);
  assert.equal(home.landed, true);                    // 13 + 0 = 13 vs 10
  assert.notEqual(home.because, 'no posted line');
  assert.equal(settle('spread', 'away', g).landed, false);
  /* And the team totals split evenly on a pick-em: 22.25 each. */
  assert.match(settle('team_total_home', 'under', g).because, /22\.25/);
  assert.equal(settle('team_total_home', 'under', g).landed, true);
});

test('a total of 0 is a real line and settles', () => {
  const g = { ...GAME, total: 0 };
  const over = settle('total', 'over', g);
  assert.equal(over.landed, true);                    // 23 points over a 0 line
  assert.notEqual(over.because, 'no posted line');
  assert.equal(settle('h1_total', 'over', g).landed, true);   // 7 over a 0 half line
});

test('a 0-0 period is a real score, not a missing one', () => {
  /* Q1 finished 0-0 and the tie must land. A module reading the score for
   * truthiness sees nothing here and reports the quarter as unplayed. */
  const q1 = settle('q1_winner', 'tie');
  assert.equal(q1.landed, true);
  assert.notEqual(q1.because, 'not final yet');
  assert.match(q1.because, /home 0/);
  assert.match(q1.because, /away 0/);
});

test('a 0-0 shutout still settles the winner and the margin', () => {
  const nilnil = { ...GAME, homeScore: 0, awayScore: 0 };
  assert.deepEqual(settle('winner', 'home', nilnil), { landed: null, because: 'push' });
  assert.equal(settle('margin', 'tie', nilnil).landed, true);
});

test('a negative team-total line is still a line', () => {
  /* A 20 point total with a home side favored by 30 is absurd, and the point
   * is that absurd arithmetic must not be mistaken for missing arithmetic. */
  const g = { ...GAME, total: 20, spread: -30 };
  const v = settle('team_total_away', 'over', g);     // away line 20/2 - 15 = -5
  assert.equal(v.landed, true);                       // away scored 10, over -5
  assert.match(v.because, /-5/);
});

/* ══════════════════════════════════════════════════════════════════════════
 * 8 — CALLER ERRORS ARE NOT GAME STATES
 * ═════════════════════════════════════════════════════════════════════════ */

test('an unknown market or choice is null, and never one of the three reasons', () => {
  /* 🔴 THIS LIST USED TO LEAD WITH `h2_winner`, as its example of a market
     that does not exist. It exists now - added 2026-09-10 - and this test
     failing is how that landed. Worth keeping the note: the suite had a
     second-half market written down as the canonical MISSING one, which is
     about as clear a signal of the gap as a codebase can give, and it sat
     here unread until Jason asked the question directly. */
  const bad = [
    settle('h3_winner', 'home'),
    settle('', 'home'),
    settle('winner', 'tie'),
    settle('total', 'push'),
    settle('margin', '20+'),
  ];
  for (const v of bad) {
    assert.equal(v.landed, null);
    assert.ok(!['no posted line', 'not final yet', 'push'].includes(v.because),
      `a caller error read as a settlement outcome: ${v.because}`);
  }
});

test('settleMarket does not throw on a missing game or a missing play list', () => {
  for (const m of M.GAME_MARKETS) {
    for (const c of m.choices) {
      assert.equal(M.settleMarket(m.id, c.id, undefined, undefined).landed, null);
      assert.equal(M.settleMarket(m.id, c.id, null, null).landed, null);
      assert.equal(M.settleMarket(m.id, c.id, {}, 'not a list').landed, null);
    }
  }
});

test('settling nothing mutates the game, the plays or the catalog', () => {
  const before = JSON.stringify({ game: GAME, plays: PLAYS, markets: M.GAME_MARKETS });
  for (const m of M.GAME_MARKETS) for (const c of m.choices) settle(m.id, c.id);
  assert.equal(JSON.stringify({ game: GAME, plays: PLAYS, markets: M.GAME_MARKETS }), before);
});
