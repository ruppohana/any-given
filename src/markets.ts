/* markets.ts — the per-game betting markets, and the settlement of them.
 *
 * This module is PURE. It reads a game and a list of plays and returns a
 * verdict. It fetches nothing, imports nothing, and knows nothing about a
 * screen. Every rule below is stated once, here, so that a view can never
 * settle a market by accident and two views can never disagree about one.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * THE FOUR RULES THIS FILE EXISTS TO ENFORCE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 🔴 1. A MARKET WITHOUT ITS LINE IS ABSENT, NEVER DERIVED.
 *    If the feed did not post a spread, there is no spread market — there is
 *    `{ landed: null, because: 'no posted line' }`. We do NOT reconstruct a
 *    line from a moneyline, from a win probability, or from last year. A made
 *    up number that looks like a line is worse than a blank, because a blank
 *    is obviously missing and a number is quietly wrong.
 *    And NOTHING that leaves this file names a sportsbook. The feed ships a
 *    provider name beside every line it carries; that name is theirs, this is
 *    a free pool between friends, and repeating it turns a game into an
 *    advertisement. The line is "the posted total", always.
 *
 * 🔴 2. ABSENT BEATS GUESSED. A game that is not final does not have a final
 *    score, so every game-scope market returns `'not final yet'` — including
 *    the ones that LOOK settleable early, like first-to-score. A period that
 *    has not been reached, or that is still being played, is the same answer.
 *    One gate, applied the same way everywhere, because the moment a market
 *    gets its own "well, this one can settle early" exception, the next one
 *    gets a worse one.
 *
 * 🔴 3. THERE IS ONE VOID PATH AND IT IS SPELLED 'push'.
 *    An exact tie against a spread, an exact tie against a total, and a drawn
 *    game on a market with no tie choice are the SAME event: the proposition
 *    did not happen, so nobody won and nobody lost. src/lib/pool.ts already
 *    settled this argument for the pool — `resolveGame` sends a push, a tie, a
 *    cancellation and a postponement out of one door as `'void'`. This file
 *    holds the same line. A per-market special case is how a scoring screen
 *    ends up with four kinds of nothing.
 *
 * 🔴 4. NEVER TEST A NUMBER FOR TRUTHINESS WHEN YOU MEAN VALIDITY.
 *    This codebase shipped "-1 & 10", "0 yards to the end zone" and
 *    "undefined & goal" in ONE night, every one of them from `x ? a : b` where
 *    x was a legitimate 0 or -1. A pick'em game has `spread === 0`. A shutout
 *    quarter has `homeScore === 0`. Both are real and both are falsy. So every
 *    number in this file goes through `isNum` or `isPeriod`, and there is not
 *    one bare `if (spread)` anywhere below.
 *
 * 🔴 5. EVERY PERIOD SCORE IS DERIVED FROM THE PLAY LIST. Never from a
 *    linescore array, never from a separate per-quarter field. Each play in
 *    this feed carries `quarter`, `homeScore` and `awayScore` AFTER that play
 *    — verified 179 of 179 on the captured NE at SEA game — so the score at
 *    the end of a period is simply the score on the last play of it. One
 *    source, and it is the same source the rest of the app already reads.
 */

/* ------------------------------------------------------------------ *
 * The catalog
 * ------------------------------------------------------------------ */

export type GameMarket = {
  id: string;            // 'winner' | 'spread' | 'total' | 'h1_winner' | ...
  label: string;         // 'Winner', 'Against the spread'
  scope: 'game' | 'half' | 'quarter';
  period?: number;       // 1..4 for quarter markets, 1|2 for halves
  needsLine?: 'spread' | 'total';   // absent = settles with no posted line
  choices: { id: string; label: string }[];
};

/* 🔴 FRESH ARRAYS, NOT A SHARED CONSTANT. `GAME_MARKETS` is exported and a
 * view will hold onto it. If every home/away market pointed at one array
 * object, a single caller sorting or splicing "its" choices would silently
 * reorder every other market in the app. These cost nothing at module load. */
const homeAway = () => [
  { id: 'home', label: 'Home' },
  { id: 'away', label: 'Away' },
];
const homeAwayTie = () => [
  { id: 'home', label: 'Home' },
  { id: 'away', label: 'Away' },
  { id: 'tie', label: 'Tie' },
];
const overUnderChoices = () => [
  { id: 'over', label: 'Over' },
  { id: 'under', label: 'Under' },
];

/* The quarter markets are generated because writing them four times is four
 * chances to typo a period number, and the period is the part that decides
 * which plays get counted. The labels stay explicit and greppable: 'Q3 winner'. */
const quarterWinners: GameMarket[] = [1, 2, 3, 4].map((q) => ({
  id: `q${q}_winner`,
  label: `Q${q} winner`,
  scope: 'quarter',
  period: q,
  choices: homeAwayTie(),
}));

export const GAME_MARKETS: GameMarket[] = [
  {
    id: 'winner',
    label: 'Winner',
    scope: 'game',
    choices: homeAway(),
    /* No `needsLine`: a straight winner settles off the scoreboard alone.
     * There is deliberately no 'tie' choice — a drawn game voids by rule 3,
     * the same way the pool's own `resolveGame` voids it. */
  },
  {
    id: 'spread',
    label: 'Against the spread',
    scope: 'game',
    needsLine: 'spread',
    choices: homeAway(),
  },
  {
    id: 'total',
    label: 'Total points',
    scope: 'game',
    needsLine: 'total',
    choices: overUnderChoices(),
  },
  {
    id: 'h1_winner',
    label: 'First half winner',
    scope: 'half',
    period: 2,   // 🔴 the END of the first half is the end of period 2.
    choices: homeAwayTie(),
  },
  {
    id: 'h1_total',
    label: 'First half total',
    scope: 'half',
    period: 2,
    needsLine: 'total',
    choices: overUnderChoices(),
  },
  /* 🔴 THE SECOND HALF, WHICH DID NOT EXIST. Jason, 2026-09-10: "So I can only
   * bet on who wins the second half until kick?" - the honest answer was that
   * he could not bet on it at all. `h1_winner` and `h1_total` were here and
   * there was no h2 of either, so a market named after a half was really a
   * market about the first one, and the catalogue looked complete because
   * every OTHER scope came in a full set.
   *
   * These two are the most valuable markets on the board and it is a
   * consequence of the close rule, not of the sport: a second-half market
   * stays open through the whole first half, so it is the one proposition
   * somebody watching at 1:40pm can still take. Everything else on a live
   * game has already shut. */
  {
    id: 'h2_winner',
    label: 'Second half winner',
    scope: 'half',
    period: 4,
    choices: homeAwayTie(),
  },
  {
    id: 'h2_total',
    label: 'Second half total',
    scope: 'half',
    period: 4,
    needsLine: 'total',
    choices: overUnderChoices(),
  },
  ...quarterWinners,
  {
    id: 'team_total_home',
    label: 'Home team total',
    scope: 'game',
    /* 🔴 THIS ONE NEEDS BOTH LINES AND THE TYPE HAS ONE SLOT. A team total is
     * the posted total split by the posted spread, so it is unsettleable
     * without either of them. `needsLine` says 'total' because that is the
     * headline number a view would label it with; `settleMarket` checks BOTH
     * and returns 'no posted line' if either is missing. Do not read the
     * declaration as the whole requirement. */
    needsLine: 'total',
    choices: overUnderChoices(),
  },
  {
    id: 'team_total_away',
    label: 'Away team total',
    scope: 'game',
    needsLine: 'total',
    choices: overUnderChoices(),
  },
  {
    id: 'first_to_score',
    label: 'First to score',
    scope: 'game',
    choices: [
      { id: 'home', label: 'Home' },
      { id: 'away', label: 'Away' },
      { id: 'neither', label: 'Neither' },
    ],
  },
  {
    id: 'margin',
    label: 'Winning margin',
    scope: 'game',
    /* The bucket ids are the buckets, written the way they are spoken. A view
     * that wants prettier labels has `label`; the id stays literal so a row in
     * a database is readable a year later without a lookup table. */
    choices: [
      { id: '1-6', label: '1-6 points' },
      { id: '7-13', label: '7-13 points' },
      { id: '14+', label: '14 or more' },
      { id: 'tie', label: 'Tie' },
    ],
  },
];

/* ------------------------------------------------------------------ *
 * Validity, never truthiness — rule 4
 * ------------------------------------------------------------------ */

/** A real, finite number. `0` and `-3` are real numbers; `null`, `undefined`,
 *  `NaN`, `''` and `'3'` are not. This is the whole of rule 4 in one place. */
function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** A period is a whole number from 1 up. Zero is not a period, 1.5 is not a
 *  period, and `Number(undefined)` is NaN rather than a quiet 0. Periods above
 *  4 are legal on purpose: overtime is period 5. */
function isPeriod(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1;
}

/** How a line reads in a sentence. `-3` stays `-3`, `44.5` stays `44.5`. */
function num(v: number): string {
  return String(v);
}

/* ------------------------------------------------------------------ *
 * The verdict
 * ------------------------------------------------------------------ */

type Verdict = { landed: boolean | null; because: string };

/* Every one of these builds a NEW object. A shared constant would be one
 * caller's `verdict.because = ...` away from rewriting the reason on every
 * unsettled market in the app. */
const notFinal = (): Verdict => ({ landed: null, because: 'not final yet' });
const noLine = (): Verdict => ({ landed: null, because: 'no posted line' });
const push = (): Verdict => ({ landed: null, because: 'push' });

/* A caller error, not a game state. It is returned rather than thrown so that
 * a view rendering a stale market id shows a blank cell instead of taking the
 * whole screen down — but it is deliberately NOT one of the three strings
 * above, so it can never be mistaken for a real settlement outcome. */
const unknownMarket = (): Verdict => ({ landed: null, because: 'unknown market' });
const unknownChoice = (): Verdict => ({ landed: null, because: 'unknown choice' });

/* ------------------------------------------------------------------ *
 * Scores, read off the plays — rule 5
 * ------------------------------------------------------------------ */

/** The highest period any play belongs to. 0 for an empty or unusable list. */
function maxQuarter(plays: any[]): number {
  let max = 0;
  for (const p of plays) {
    const q = p?.quarter;
    if (isPeriod(q) && q > max) max = q;
  }
  return max;
}

/**
 * Score at the end of a period, computed from the play list.
 *
 * The list is chronological and every play carries the score AFTER it, so the
 * end of a period is the last play whose quarter is at or before it. `null`
 * means the period was never reached, or that no play at or before it carried
 * a usable score.
 *
 * 🔴 WHAT THIS DOES NOT KNOW: whether the period is FINISHED. Mid-way through
 * the third quarter, `scoreAfterPeriod(plays, 3)` returns the score right now,
 * which is a running score and not an end-of-period one. That gate needs the
 * game's status, which this function does not take, so `settleMarket` owns it
 * — see `periodIsComplete`. Do not settle anything off this function alone.
 */
export function scoreAfterPeriod(plays: any[], period: number): { home: number; away: number } | null {
  if (!Array.isArray(plays)) return null;
  if (!isPeriod(period)) return null;   // 0, -1, 1.5, undefined — all not periods

  const reached = maxQuarter(plays);
  if (reached < period) return null;    // the game never got there

  let out: { home: number; away: number } | null = null;
  for (const p of plays) {
    const q = p?.quarter;
    if (!isPeriod(q)) continue;         // a play with no period places nothing
    if (q > period) continue;
    const h = p?.homeScore;
    const a = p?.awayScore;
    if (!isNum(h) || !isNum(a)) continue;
    out = { home: h, away: a };         // chronological, so the last write wins
  }
  return out;
}

/** Points scored in one period ALONE — the difference across its boundary. */
function scoreInPeriod(plays: any[], period: number): { home: number; away: number } | null {
  const end = scoreAfterPeriod(plays, period);
  if (end === null) return null;
  /* Before period 1 the score is 0-0 by definition, and there is no period 0
   * to read it from. Every later period reads the one before it. */
  const start = period === 1 ? { home: 0, away: 0 } : scoreAfterPeriod(plays, period - 1);
  if (start === null) return null;
  return { home: end.home - start.home, away: end.away - start.away };
}

/**
 * Is that period actually over?
 *
 * Two ways to know, and both are evidence rather than inference: a play exists
 * in a LATER period, or the game is final. Anything else — including "the
 * clock says 0:00" — is the app guessing, and rule 2 says absent beats guessed.
 */
function periodIsComplete(plays: any[], period: number, game: any): boolean {
  if (maxQuarter(plays) > period) return true;
  return isFinal(game);
}

function isFinal(game: any): boolean {
  /* The house string, normalized upstream by src/feed/espn.ts: 'scheduled' |
   * 'in_progress' | 'final' | 'void'. A voided game is NOT final, so it takes
   * the 'not final yet' path with everything else that has no result. That is
   * rule 3 read the other way round: one door for nothing-happened. */
  return game?.status === 'final';
}

/**
 * The final score. Preference is the game's own numbers, because that is what
 * the scoreboard says and it is what a player will compare against. The play
 * list is the fallback for a feed that finalized before its header caught up.
 * `null` when neither can produce two real numbers — broken data stays
 * unsettled rather than quietly scoring 0-0 for everybody.
 */
function finalScore(game: any, plays: any[]): { home: number; away: number } | null {
  if (isNum(game?.homeScore) && isNum(game?.awayScore)) {
    return { home: game.homeScore, away: game.awayScore };
  }
  const reached = maxQuarter(plays);
  if (reached >= 1) {
    const last = scoreAfterPeriod(plays, reached);
    if (last !== null) return last;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Settlement helpers — one implementation each, shared by every market
 * ------------------------------------------------------------------ */

/** home / away / tie off two numbers. `winner` has no tie choice, so a level
 *  game voids there; the half and quarter markets carry one and settle it. */
function sideVerdict(
  home: number,
  away: number,
  choiceId: string,
  hasTieChoice: boolean,
  because: string,
): Verdict {
  if (home === away) {
    if (!hasTieChoice) return push();          // rule 3: a draw is the void
    return { landed: choiceId === 'tie', because: `${because} - tie` };
  }
  const winner = home > away ? 'home' : 'away';
  return { landed: choiceId === winner, because: `${because} - ${winner}` };
}

/** over / under against a line, with the one void path on an exact landing. */
function totalVerdict(points: number, line: number, choiceId: string, because: string): Verdict {
  if (points === line) return push();          // rule 3, again, same door
  const over = points > line;
  return { landed: choiceId === (over ? 'over' : 'under'), because: `${because} - ${over ? 'over' : 'under'}` };
}

/* ------------------------------------------------------------------ *
 * settleMarket
 * ------------------------------------------------------------------ */

/**
 * Settle one choice on one market.
 *
 * game:  { id, homeTeamId, awayTeamId, homeScore, awayScore, status,
 *          spread, total }   — spread is the HOME number, ESPN convention, so
 *          SEA -3 is `spread: -3` and the home team must win by more than 3.
 * plays: chronological, each carrying the score AFTER that play.
 *
 * Returns `landed: true | false` once the market is decided, and
 * `landed: null` with one of exactly three reasons when it is not:
 * 'no posted line', 'not final yet', 'push'.
 */
export function settleMarket(
  marketId: string,
  choiceId: string,
  game: any,
  plays: any[],
): Verdict {
  const market = GAME_MARKETS.find((m) => m.id === marketId);
  if (market === undefined) return unknownMarket();
  if (!market.choices.some((c) => c.id === choiceId)) return unknownChoice();

  const list = Array.isArray(plays) ? plays : [];

  /* ── the line gate, first, because it is true before kickoff ──────────
   * A market whose line was never posted does not exist for this game, and
   * saying so is cheaper and more honest than saying "not final yet" about a
   * market that will never settle at all. Rule 1. */
  const spread = game?.spread;
  const total = game?.total;
  if (market.needsLine === 'spread' && !isNum(spread)) return noLine();
  if (market.needsLine === 'total' && !isNum(total)) return noLine();
  /* The team totals need the OTHER one too — see the note on their entries. */
  if ((marketId === 'team_total_home' || marketId === 'team_total_away') && !isNum(spread)) return noLine();

  /* ── the time gate ────────────────────────────────────────────────────
   * Rule 2, applied identically to every market of a scope. A game-scope
   * market waits for final even when it looks decidable early: once a market
   * earns an exception, so does the next one, and a screen full of
   * half-settled propositions is how a friendly pool starts an argument. */
  if (market.scope === 'game' && !isFinal(game)) return notFinal();

  const period = market.period;
  if (market.scope !== 'game') {
    if (!isPeriod(period)) return unknownMarket();   // a catalog bug, not a game state
    if (!periodIsComplete(list, period, game)) return notFinal();
  }

  switch (marketId) {
    /* ── game scope ─────────────────────────────────────────────────── */

    case 'winner': {
      const s = finalScore(game, list);
      if (s === null) return notFinal();
      return sideVerdict(s.home, s.away, choiceId, false,
        `final home ${num(s.home)}, away ${num(s.away)}`);
    }

    case 'spread': {
      const s = finalScore(game, list);
      if (s === null) return notFinal();
      if (!isNum(spread)) return noLine();
      /* The house formula, identical to resolveGame() in src/lib/pool.ts:
       * the home number is ADDED to the home score. Two implementations of
       * one arithmetic is two answers waiting to disagree. */
      const adjusted = s.home + spread;
      return sideVerdict(adjusted, s.away, choiceId, false,
        `home ${num(s.home)} with ${num(spread)} = ${num(adjusted)} vs away ${num(s.away)}`);
    }

    case 'total': {
      const s = finalScore(game, list);
      if (s === null) return notFinal();
      if (!isNum(total)) return noLine();
      const points = s.home + s.away;
      return totalVerdict(points, total, choiceId,
        `home ${num(s.home)} + away ${num(s.away)} = ${num(points)} vs the posted total ${num(total)}`);
    }

    case 'team_total_home':
    case 'team_total_away': {
      const s = finalScore(game, list);
      if (s === null) return notFinal();
      if (!isNum(total) || !isNum(spread)) return noLine();
      /* A team total is the posted total split by the posted spread: the
       * favorite's share is half the total plus half the margin it is
       * favored by. With the home number negative for a home favorite that
       * is `total/2 - spread/2` for home and `total/2 + spread/2` for away,
       * and the two always add back up to the total.
       *
       * 🔴 NOT ROUNDED. Halving a .5 total gives a .25 line, which is a real
       * line and cannot push. Rounding it to something prettier would move
       * the line by a quarter point and invent a push that the numbers do
       * not contain — the exact thing rule 1 forbids. Only the first-half
       * total rounds, because it is specified to. */
      const home = marketId === 'team_total_home';
      const line = home ? total / 2 - spread / 2 : total / 2 + spread / 2;
      const points = home ? s.home : s.away;
      return totalVerdict(points, line, choiceId,
        `${home ? 'home' : 'away'} ${num(points)} vs ${num(line)}, ` +
        `from the posted total ${num(total)} and spread ${num(spread)}`);
    }

    case 'first_to_score': {
      const s = finalScore(game, list);
      if (s === null) return notFinal();
      const first = firstScore(list);
      if (first === null) {
        /* Nobody scored all game. Rare, real, and the reason the third choice
         * exists rather than the market being voided. */
        return { landed: choiceId === 'neither', because: 'nobody scored' };
      }
      return {
        landed: choiceId === first.side,
        /* The quarter is stated only when the play actually carried one. An
         * unplaced play is not "Q0" and it is not "Q1" either. */
        because: first.quarter === null
          ? `${first.side} scored first`
          : `${first.side} scored first, Q${num(first.quarter)}`,
      };
    }

    case 'margin': {
      const s = finalScore(game, list);
      if (s === null) return notFinal();
      const m = Math.abs(s.home - s.away);
      /* 🔴 ORDER MATTERS AND ZERO IS FIRST. `m === 0` is checked before any
       * range, because 0 is falsy and every previous version of this shape in
       * this codebase got that wrong. */
      const bucket = m === 0 ? 'tie' : m <= 6 ? '1-6' : m <= 13 ? '7-13' : '14+';
      return { landed: choiceId === bucket, because: `final margin ${num(m)} - ${bucket}` };
    }

    /* ── half scope ─────────────────────────────────────────────────── */

    case 'h1_winner': {
      const end = scoreAfterPeriod(list, 2);
      if (end === null) return notFinal();
      return sideVerdict(end.home, end.away, choiceId, true,
        `end of Q2: home ${num(end.home)}, away ${num(end.away)}`);
    }

    case 'h1_total': {
      const end = scoreAfterPeriod(list, 2);
      if (end === null) return notFinal();
      if (!isNum(total)) return noLine();
      /* 🔴 THIS LINE IS OURS, NOT THE FEED'S, AND THE SENTENCE SAYS SO.
       * No half-time total is posted in this feed, so the market halves the
       * full-game total and rounds to the nearest half point — 44.5 becomes
       * 22.5. That is a derived line, which rule 1 would normally forbid, so
       * it is allowed here on one condition: `because` states out loud where
       * it came from, every single time, and never presents it as posted. */
      const line = Math.round((total / 2) * 2) / 2;
      const points = end.home + end.away;
      return totalVerdict(points, line, choiceId,
        `half line ${num(line)}, being the posted total ${num(total)} halved and rounded ` +
        `to the nearest 0.5; first half home ${num(end.home)} + away ${num(end.away)} = ${num(points)}`);
    }

    /* 🔴 THE SECOND HALF IS A SUBTRACTION, AND OVERTIME BELONGS TO IT.
     * `scoreAfterPeriod(list, 4)` is the score at the end of regulation and
     * the halftime score comes off it. A game that goes to overtime keeps
     * counting into the second half rather than being voided: the market is
     * named for a half of football, an overtime is a continuation of the
     * second half in every way a viewer experiences it, and the alternative -
     * voiding every overtime game - would hand back stakes on the most
     * exciting finishes in the sport. Stated here because it is a real choice
     * and not an oversight. */
    case 'h2_winner': {
      const half = scoreAfterPeriod(list, 2);
      const end = finalScore(game, list);
      if (half === null || end === null) return notFinal();
      return sideVerdict(end.home - half.home, end.away - half.away, choiceId, true,
        `second half: home ${num(end.home - half.home)}, away ${num(end.away - half.away)} ` +
        `(final ${num(end.home)}-${num(end.away)} less half time ${num(half.home)}-${num(half.away)})`);
    }

    case 'h2_total': {
      const half = scoreAfterPeriod(list, 2);
      const end = finalScore(game, list);
      if (half === null || end === null) return notFinal();
      if (!isNum(total)) return noLine();
      /* Derived exactly as h1_total's is, and said out loud for the same
         reason: no half total is posted, so this one is ours. */
      const line = Math.round((total / 2) * 2) / 2;
      const points = (end.home - half.home) + (end.away - half.away);
      return totalVerdict(points, line, choiceId,
        `half line ${num(line)}, being the posted total ${num(total)} halved and rounded ` +
        `to the nearest 0.5; second half ${num(points)} points`);
    }

    /* ── quarter scope ──────────────────────────────────────────────── */

    case 'q1_winner':
    case 'q2_winner':
    case 'q3_winner':
    case 'q4_winner': {
      if (!isPeriod(period)) return unknownMarket();
      const only = scoreInPeriod(list, period);
      if (only === null) return notFinal();
      return sideVerdict(only.home, only.away, choiceId, true,
        `Q${num(period)} alone: home ${num(only.home)}, away ${num(only.away)}`);
    }
  }

  /* Unreachable while the catalog and this switch agree. If they ever stop
   * agreeing, a new market must read as unsettled rather than as a loss. */
  return unknownMarket();
}

/**
 * Who scored first, read off the score carried by each play.
 *
 * 🔴 THE SCORE DELTA IS THE ORACLE, NOT THE `scoringPlay` FLAG AND NOT THE
 * TEXT. The flag is present on this feed (5 of 179 plays on the captured
 * game) but it says THAT a score happened, not WHO it was for — and deciding
 * that from the sentence means parsing a team out of prose, which is exactly
 * the mistake that put a tackler's name on a touchdown. The scoreboard moved,
 * and it moved for exactly one team.
 */
function firstScore(plays: any[]): { side: 'home' | 'away'; quarter: number | null } | null {
  let prevHome = 0;
  let prevAway = 0;
  for (const p of plays) {
    const h = p?.homeScore;
    const a = p?.awayScore;
    if (!isNum(h) || !isNum(a)) continue;
    if (h > prevHome || a > prevAway) {
      const side = h - prevHome >= a - prevAway ? 'home' : 'away';
      const q = p?.quarter;
      return { side, quarter: isPeriod(q) ? q : null };
    }
    prevHome = h;
    prevAway = a;
  }
  return null;
}
