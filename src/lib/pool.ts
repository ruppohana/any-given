/**
 * pool.ts — the pool scorer, the parlay resolver, and THE ONE VOID PATH.
 *
 * Owner: M7. Greenfield: the pool does not exist in `sports-live`, so this module's
 * bar is the written rule set, not a program —
 *   BUILD-BRIEF.md §2a, §3      (the pool, the economy, the separation)
 *   POOL-SCREENS.md P3, P5      (the parlay state machine, standings + ties)
 *   DESIGN-BRIEF.md §16.1-16.4  (tiebreak, crowd, no Marbles, scope lock)
 *   CONTRACT.md §5, §6          (types, and the checks that fail a piece)
 *
 * 🔴 THE POOL SCORES IN POINTS. IT DOES NOT USE MARBLES.
 *    Settled 2026-09-08. The live layer stakes Marbles; the two halves never meet and
 *    must never be summed. Nothing in this file names a balance, a bank or a stake.
 *
 * 🔴 THERE IS ONE VOID PATH. A push, a cancellation, a postponement and a voided
 *    parlay leg all resolve to the same thing: the game did not happen, for everybody.
 *    Every void in this module goes through `resolveGame()`. There are no special cases.
 *
 * 🔴 NO ODDS. Everything a user is shown here is a whole number of this pool's points.
 *    Spreads exist only as `SlateGame.spread`, and only when `Pool.ats` is true.
 *
 * No dependencies. Pure functions. Nothing here fetches, reads a clock, or touches D1.
 * `now` is always an argument.
 */

/* ------------------------------------------------------------------ *
 * Types — CONTRACT.md §6, restated locally.
 *
 * COULD NOT CLOSE: `TeamIdentity` will also be declared by `src/lib/teams.ts`
 * (session-owned, not yet on disk). When it lands, delete this copy and import it.
 * There is no runtime coupling — Node strips these.
 * ------------------------------------------------------------------ */

export type TeamIdentity = {
  id: string;
  abbrev: string;
  name: string;
  short: string;
  primary: string | null;
  secondary: string | null;
};

export type Scope = 'ranked_v_ranked' | 'conference' | 'top25' | 'handpick' | 'all';
export type RankingSource = 'ap' | 'cfp';

export type Pool = {
  id: string;
  name: string;
  commissionerId: string;
  scope: Scope;
  scopeArg: string | null;
  rankingSource: RankingSource | null;
  ats: boolean;
  season: number;
  scopeLockedAt: number | null;
  memberCount: number;
};

export type GameStatus = 'scheduled' | 'in_progress' | 'final' | 'void';

export type SlateGame = {
  id: string;
  week: number;
  kickoffUtc: number;
  home: TeamIdentity;
  away: TeamIdentity;
  /** 🔴 CONVENTION, fixed here because nothing else fixed it: the spread is the HOME
   *  team's number, negative when the home team is favored. That is ESPN's
   *  `pickcenter[].spread` convention and the three real fixtures agree with it
   *  (`OU -40.5`, `OSU -50.5`, `ORE -24.5`, all three home). Rendered only when
   *  `Pool.ats`. */
  spread: number | null;
  status: GameStatus;
  homeScore: number | null;
  awayScore: number | null;
};

export type PickSide = 'home' | 'away';
export type PickState =
  | 'unpicked' | 'picked' | 'locked' | 'in_progress'
  | 'won' | 'lost' | 'void';

export type Crowd = { home: number; away: number; n: number };

export type Pick = {
  gameId: string;
  side: PickSide | null;
  state: PickState;
  lockedAt: number;
  crowd: Crowd | null;
};

/** The editing/lock state machine. CONTRACT.md §6, unchanged.
 *  🔴 COULD NOT CLOSE: this union has no `void` member, and POOL-SCREENS P3 lists
 *  "one leg void" as a screen state. A parlay that voids OUT (fewer than 3 legs
 *  survive) reports `state: 'locked'` with `outcome: 'void'` on its resolution.
 *  See `resolveParlay`. */
export type ParlayState =
  | 'empty' | 'under_min' | 'valid' | 'at_max' | 'partial_lock' | 'locked' | 'won' | 'lost';

export type ParlayLeg = {
  gameId: string;
  side: PickSide;
  locked: boolean;
  result: 'won' | 'lost' | 'void' | null;
};

export type Parlay = {
  week: number;
  legs: ParlayLeg[];
  state: ParlayState;
  /** In this pool's POINTS. Never odds. */
  worth: number;
};

export type Tiebreak = { gameId: string; predictedTotal: number | null };

export type StandingsRow = {
  rank: number;
  userId: string;
  displayName: string;
  weekPoints: number;
  seasonPoints: number;
  parlayPoints: number;
  movement: number;
  isSelf: boolean;
};

/* ------------------------------------------------------------------ *
 * Constants
 * ------------------------------------------------------------------ */

/** BUILD-BRIEF §2a and POOL-SCREENS P3: "3 minimum, 6 maximum, enforced in the UI
 *  before it is enforced in the scorer." Both are enforced here as well. */
export const PARLAY_MIN_LEGS = 3;
export const PARLAY_MAX_LEGS = 6;

export type Scoring = {
  /** Points for one correct straight pick. */
  pickPoints: number;
  /** Points for one correct against-the-spread pick. */
  atsPickPoints: number;
  /** legs -> points. Keys must cover PARLAY_MIN_LEGS..PARLAY_MAX_LEGS. */
  parlayWorth: Readonly<Record<number, number>>;
};

/**
 * 🔴 INVENTED. No document in the vault states a point value for a pick or a parlay.
 * `week_score.points` and `week_score.parlay_points` are INTEGER in D1 and that is all
 * the constraint there is. These numbers are a placeholder with the right SHAPE:
 *
 *   - one point a pick, which is what every pick'em in the capture list does;
 *   - a doubling parlay ladder, so the parlay is "the single high-variance swing in a
 *     format that is otherwise flat" (POOL-SCREENS P3) — a 6-leg parlay is worth 40,
 *     about two thirds of a perfect 60-game week, and 8 correct picks in a
 *     conference-scoped pool.
 *
 * Every function takes `Scoring` as an argument. Changing these numbers changes no code.
 */
export const DEFAULT_SCORING: Scoring = Object.freeze({
  pickPoints: 1,
  atsPickPoints: 1,
  parlayWorth: Object.freeze({ 3: 5, 4: 10, 5: 20, 6: 40 }),
});

/* ------------------------------------------------------------------ *
 * The crowd small-n rule — DECIDED IN THIS PIECE
 *
 * DESIGN-BRIEF §16.2: "In a pool of four, 75% is three people and it identifies them.
 * Suppress it below a threshold, or show a count rather than a percentage. Decide it
 * in the piece."
 *
 * DECISION: suppress the split entirely. Do not fall back to a count — a count is more
 * precise than a percentage, not less, so it fails the same test harder.
 *
 * Two conditions, and they are the same failure twice:
 *   1. n >= CROWD_MIN_N (5). Below that every percentage is a named handful.
 *   2. the minority side is 0 or >= CROWD_MIN_MINORITY (2). A minority of exactly one
 *      names one person by arithmetic at ANY pool size — "94% took Oregon" in a
 *      seventeen-person pool is a public accusation. A minority of zero names nobody.
 *
 * And it never appears before the viewer has picked (§16.2, P2): "a number shown before
 * the tap is a nudge; a number shown after is a conversation."
 * ------------------------------------------------------------------ */
export const CROWD_MIN_N = 5;
export const CROWD_MIN_MINORITY = 2;

export type CrowdSuppression = 'not_picked' | 'small_n' | 'lone_dissenter' | null;

/* ------------------------------------------------------------------ *
 * 🔴 THE ONE VOID PATH
 * ------------------------------------------------------------------ */

export type GameOutcome = 'home' | 'away' | 'void' | null;

export type VoidReason =
  | 'status_void'      // cancelled or postponed. Same thing, deliberately.
  | 'tie'              // final, level. The straight pick did not happen.
  | 'push';            // final, ATS, the spread landed exactly. The same thing again.

/**
 * The ONLY place a game outcome is decided, and therefore the only place a void is
 * created. A push, a cancellation, a postponement and a tie all leave here as `'void'`
 * and are indistinguishable downstream — that is the rule, not an accident.
 *
 * `null` means "not decided yet", which is NOT a void. A `final` game with a missing
 * score is broken data and stays `null` so it shows up as unresolved rather than
 * quietly scoring zero for everybody.
 */
export function resolveGame(game: SlateGame, ats: boolean): GameOutcome {
  if (game.status === 'void') return 'void';
  if (game.status !== 'final') return null;
  if (game.homeScore === null || game.awayScore === null) return null;

  if (ats) {
    // No spread on an ATS pool's game is a data gap, not a void: fall through to the
    // straight result rather than inventing a line.
    if (game.spread !== null) {
      const margin = game.homeScore + game.spread - game.awayScore;
      if (margin === 0) return 'void';          // push
      return margin > 0 ? 'home' : 'away';
    }
  }

  if (game.homeScore === game.awayScore) return 'void'; // tie
  return game.homeScore > game.awayScore ? 'home' : 'away';
}

/** Why a game voided, for the one line on the rules screen and for a leg's explanation. */
export function voidReason(game: SlateGame, ats: boolean): VoidReason | null {
  if (resolveGame(game, ats) !== 'void') return null;
  if (game.status === 'void') return 'status_void';
  if (ats && game.spread !== null) return 'push';
  return 'tie';
}

/* ------------------------------------------------------------------ *
 * Picks
 * ------------------------------------------------------------------ */

/** Every pick is editable until that game kicks, and locks at kickoff. One rule. */
export function isPickEditable(game: SlateGame, now: number): boolean {
  if (game.status === 'void') return false;
  return now < game.kickoffUtc;
}

export function pickState(
  side: PickSide | null,
  game: SlateGame,
  ats: boolean,
  now: number,
): PickState {
  if (side === null) return 'unpicked';
  const outcome = resolveGame(game, ats);
  if (outcome === 'void') return 'void';
  if (outcome !== null) return outcome === side ? 'won' : 'lost';
  if (game.status === 'in_progress') return 'in_progress';
  if (now >= game.kickoffUtc) return 'locked';
  return 'picked';
}

/** Points a single pick is worth, right now. A void is 0, for everybody. */
export function pickPointsFor(
  side: PickSide | null,
  game: SlateGame,
  ats: boolean,
  scoring: Scoring = DEFAULT_SCORING,
): number {
  if (side === null) return 0;
  const outcome = resolveGame(game, ats);
  if (outcome === null || outcome === 'void') return 0;
  if (outcome !== side) return 0;
  return ats ? scoring.atsPickPoints : scoring.pickPoints;
}

/* ------------------------------------------------------------------ *
 * Crowd — the pool's own split, after the tap, with the small-n rule
 * ------------------------------------------------------------------ */

export function crowdSuppression(
  sides: readonly PickSide[],
  viewerHasPicked: boolean,
): CrowdSuppression {
  if (!viewerHasPicked) return 'not_picked';
  const n = sides.length;
  if (n < CROWD_MIN_N) return 'small_n';
  const home = sides.reduce((a, s) => a + (s === 'home' ? 1 : 0), 0);
  const away = n - home;
  const minority = Math.min(home, away);
  if (minority > 0 && minority < CROWD_MIN_MINORITY) return 'lone_dissenter';
  return null;
}

/**
 * The POOL's own split, never global. `null` means DO NOT SHOW — the screen shows
 * nothing in that slot, not a count and not a placeholder percentage.
 * `sides` is every pick made in THIS pool on THIS game, the viewer's included.
 */
export function crowdSplit(
  sides: readonly PickSide[],
  viewerHasPicked: boolean,
): Crowd | null {
  if (crowdSuppression(sides, viewerHasPicked) !== null) return null;
  const home = sides.reduce((a, s) => a + (s === 'home' ? 1 : 0), 0);
  return { home, away: sides.length - home, n: sides.length };
}

/* ------------------------------------------------------------------ *
 * The parlay
 * ------------------------------------------------------------------ */

export type ParlayValidation = {
  ok: boolean;
  errors: ParlayError[];
};

export type ParlayError =
  | { code: 'too_few_legs'; have: number; min: number }
  | { code: 'too_many_legs'; have: number; max: number }
  | { code: 'duplicate_game'; gameId: string }
  | { code: 'no_pick_on_game'; gameId: string }
  | { code: 'leg_disagrees_with_pick'; gameId: string; pick: PickSide; leg: PickSide }
  | { code: 'game_not_on_slate'; gameId: string }
  | { code: 'game_already_kicked'; gameId: string };

export type LegInput = { gameId: string; side: PickSide };

/**
 * A leg is chosen FROM A PICK ALREADY MADE, never entered separately — otherwise the
 * same game is picked twice and disagrees with itself (POOL-SCREENS P3).
 *
 * `picks` is the user's own picks on this week's slate, keyed by gameId.
 * Validation is for a proposed EDIT, so it also refuses a leg whose game has kicked.
 */
export function validateParlay(
  legs: readonly LegInput[],
  picks: ReadonlyMap<string, PickSide>,
  games: ReadonlyMap<string, SlateGame>,
  now: number,
): ParlayValidation {
  const errors: ParlayError[] = [];
  if (legs.length < PARLAY_MIN_LEGS) {
    errors.push({ code: 'too_few_legs', have: legs.length, min: PARLAY_MIN_LEGS });
  }
  if (legs.length > PARLAY_MAX_LEGS) {
    errors.push({ code: 'too_many_legs', have: legs.length, max: PARLAY_MAX_LEGS });
  }
  const seen = new Set<string>();
  for (const leg of legs) {
    if (seen.has(leg.gameId)) errors.push({ code: 'duplicate_game', gameId: leg.gameId });
    seen.add(leg.gameId);

    const game = games.get(leg.gameId);
    if (game === undefined) {
      errors.push({ code: 'game_not_on_slate', gameId: leg.gameId });
      continue;
    }
    const pick = picks.get(leg.gameId);
    if (pick === undefined) {
      errors.push({ code: 'no_pick_on_game', gameId: leg.gameId });
    } else if (pick !== leg.side) {
      errors.push({ code: 'leg_disagrees_with_pick', gameId: leg.gameId, pick, leg: leg.side });
    }
    if (!isPickEditable(game, now)) {
      errors.push({ code: 'game_already_kicked', gameId: leg.gameId });
    }
  }
  return { ok: errors.length === 0, errors };
}

/** What a parlay of `legCount` legs is worth, IN THIS POOL'S POINTS. Never odds.
 *  Returns 0 for a leg count outside 3..6, which is not a payable parlay. */
export function parlayWorth(legCount: number, scoring: Scoring = DEFAULT_SCORING): number {
  if (legCount < PARLAY_MIN_LEGS || legCount > PARLAY_MAX_LEGS) return 0;
  const w = scoring.parlayWorth[legCount];
  return typeof w === 'number' ? w : 0;
}

export type ParlayOutcome = 'pending' | 'won' | 'lost' | 'void';

export type ParlayVoidReason = 'never_valid' | 'voided_below_min';

export type ParlayResolution = {
  /** The contract's editing/lock state machine. */
  state: ParlayState;
  /** What it actually did. `'void'` has no home in `state`; see the note on ParlayState. */
  outcome: ParlayOutcome;
  points: number;
  /** What it is worth if every surviving leg lands. On screen BEFORE resolution. */
  worth: number;
  legs: ParlayLeg[];
  originalLegCount: number;
  survivingLegCount: number;
  /** 🔴 The parlay is NEVER silently reduced. These are the games that voided out of it. */
  voidedLegs: string[];
  /** True when a void changed the leg count, and therefore the worth. Say so on screen. */
  reduced: boolean;
  voidReason: ParlayVoidReason | null;
  /** One plain sentence the screen may print verbatim. Never empty. */
  note: string;
};

/**
 * Resolve one parlay. `legs` are the stored legs (a leg is a pick, already validated).
 *
 * 🔴 Legs lock INDEPENDENTLY — a parlay can be half-locked. `locked` is derived per leg
 *    from that leg's own kickoff, never from the parlay.
 *
 * 🔴 A voided leg does not kill the parlay and does not silently reduce it. It leaves
 *    through the one void path, the surviving legs decide the result, and `reduced`,
 *    `voidedLegs` and `note` say so out loud.
 *
 * 🔴 If fewer than PARLAY_MIN_LEGS survive, the whole parlay resolves VOID — the same
 *    void path again: it did not happen, for everybody. It is not a loss.
 */
export function resolveParlay(
  legInputs: readonly LegInput[],
  games: ReadonlyMap<string, SlateGame>,
  ats: boolean,
  now: number,
  scoring: Scoring = DEFAULT_SCORING,
): ParlayResolution {
  const legs: ParlayLeg[] = [];
  const voidedLegs: string[] = [];
  let lockedCount = 0;
  let surviving = 0;
  let survivingWon = 0;
  let anyLost = false;

  for (const input of legInputs) {
    const game = games.get(input.gameId);
    if (game === undefined) {
      // A leg whose game left the slate is the same event as a cancellation.
      legs.push({ gameId: input.gameId, side: input.side, locked: true, result: 'void' });
      voidedLegs.push(input.gameId);
      continue;
    }
    const outcome = resolveGame(game, ats);
    const locked = !isPickEditable(game, now);
    if (locked) lockedCount++;

    let result: ParlayLeg['result'] = null;
    if (outcome === 'void') {
      result = 'void';
      voidedLegs.push(game.id);
    } else if (outcome !== null) {
      result = outcome === input.side ? 'won' : 'lost';
      surviving++;
      if (result === 'won') survivingWon++;
      else anyLost = true;
    } else {
      surviving++; // still live
    }
    legs.push({ gameId: input.gameId, side: input.side, locked, result });
  }

  const originalLegCount = legInputs.length;
  const worth = parlayWorth(surviving, scoring);

  // ---- outcome ----
  let outcome: ParlayOutcome;
  let vReason: ParlayVoidReason | null = null;
  if (originalLegCount < PARLAY_MIN_LEGS || originalLegCount > PARLAY_MAX_LEGS) {
    // Never a legal parlay. If it can still be edited it is simply not built yet;
    // once every game has kicked it did not happen.
    outcome = lockedCount === originalLegCount && originalLegCount > 0 ? 'void' : 'pending';
    if (outcome === 'void') vReason = 'never_valid';
    if (originalLegCount === 0) outcome = 'pending';
  } else if (anyLost) {
    outcome = 'lost';
  } else if (surviving < PARLAY_MIN_LEGS) {
    outcome = 'void';
    vReason = 'voided_below_min';
  } else if (survivingWon === surviving) {
    outcome = 'won';
  } else {
    outcome = 'pending';
  }

  const points = outcome === 'won' ? worth : 0;

  // ---- state (the contract union) ----
  let state: ParlayState;
  if (outcome === 'won') state = 'won';
  else if (outcome === 'lost') state = 'lost';
  else if (originalLegCount === 0) state = 'empty';
  else if (lockedCount === originalLegCount) state = 'locked';
  else if (lockedCount > 0) state = 'partial_lock';
  else if (originalLegCount < PARLAY_MIN_LEGS) state = 'under_min';
  else if (originalLegCount === PARLAY_MAX_LEGS) state = 'at_max';
  else state = 'valid';

  const reduced = voidedLegs.length > 0 && outcome !== 'void';

  return {
    state,
    outcome,
    points,
    worth,
    legs,
    originalLegCount,
    survivingLegCount: surviving,
    voidedLegs,
    reduced,
    voidReason: vReason,
    note: parlayNote(outcome, vReason, originalLegCount, surviving, voidedLegs, worth, state),
  };
}

/** The sentence the screen prints. The void is always named; never silent. */
function parlayNote(
  outcome: ParlayOutcome,
  vReason: ParlayVoidReason | null,
  original: number,
  surviving: number,
  voided: string[],
  worth: number,
  state: ParlayState,
): string {
  const voidedPart =
    voided.length === 0
      ? ''
      : voided.length === 1
        ? '1 leg voided — that game did not happen. '
        : `${voided.length} legs voided — those games did not happen. `;

  if (outcome === 'void' && vReason === 'voided_below_min') {
    return `${voidedPart}Only ${surviving} of ${original} legs are left, under the ${PARLAY_MIN_LEGS}-leg minimum, so the parlay is void. It did not happen — no points won, no points lost.`;
  }
  if (outcome === 'void' && vReason === 'never_valid') {
    return `This parlay had ${original} legs and every game has kicked. A parlay needs ${PARLAY_MIN_LEGS} to ${PARLAY_MAX_LEGS}, so it is void — no points won, no points lost.`;
  }
  if (outcome === 'won') {
    return `${voidedPart}Parlay landed on ${surviving} legs. ${worth} points.`;
  }
  if (outcome === 'lost') {
    return `${voidedPart}A leg missed. The parlay is out.`;
  }
  if (state === 'empty') return `No parlay yet. Pick ${PARLAY_MIN_LEGS} to ${PARLAY_MAX_LEGS} games from your slate.`;
  if (state === 'under_min') return `${original} of ${PARLAY_MIN_LEGS} legs. Add ${PARLAY_MIN_LEGS - original} more.`;
  if (state === 'at_max') return `${voidedPart}${original} legs, the maximum. Worth ${worth} points.`;
  return `${voidedPart}${surviving} legs live. Worth ${worth} points.`;
}

/** The editing state alone, for a parlay nobody has resolved yet (P3's live UI). */
export function parlayState(
  legInputs: readonly LegInput[],
  games: ReadonlyMap<string, SlateGame>,
  ats: boolean,
  now: number,
): ParlayState {
  return resolveParlay(legInputs, games, ats, now).state;
}

/* ------------------------------------------------------------------ *
 * Scope — a property of the pool, never a per-user filter
 * ------------------------------------------------------------------ */

export type ScopeContext = {
  /** The ranked team ids for `pool.rankingSource`. AP and CFP are DIFFERENT LISTS. */
  rankedTeamIds?: ReadonlySet<string> | null;
  /** teamId -> conference id. */
  conferenceOfTeam?: ReadonlyMap<string, string> | null;
};

/** Scope is editable until the first kickoff of week 1, then locked with everything
 *  else. DESIGN-BRIEF §16.4. */
export function scopeIsEditable(pool: Pool, now: number): boolean {
  if (pool.scopeLockedAt === null) return true;
  return now < pool.scopeLockedAt;
}

/** The moment scope locks: the first kickoff of week 1 of this pool's season. */
export function firstKickoffOfWeek1(games: readonly SlateGame[]): number | null {
  let min: number | null = null;
  for (const g of games) {
    if (g.week !== 1) continue;
    if (min === null || g.kickoffUtc < min) min = g.kickoffUtc;
  }
  return min;
}

/** Everyone in the pool picks the same slate or the standings mean nothing. */
export function applyScope(
  games: readonly SlateGame[],
  pool: Pool,
  ctx: ScopeContext = {},
): SlateGame[] {
  switch (pool.scope) {
    case 'all':
      return games.slice();
    case 'handpick': {
      const ids = new Set((pool.scopeArg ?? '').split(',').map((s) => s.trim()).filter(Boolean));
      return games.filter((g) => ids.has(g.id));
    }
    case 'conference': {
      const conf = pool.scopeArg;
      const map = ctx.conferenceOfTeam;
      if (conf === null || !map) {
        throw new Error('applyScope: conference scope needs pool.scopeArg and ctx.conferenceOfTeam');
      }
      return games.filter((g) => map.get(g.home.id) === conf && map.get(g.away.id) === conf);
    }
    case 'top25': {
      const ranked = ctx.rankedTeamIds;
      if (!ranked) throw new Error('applyScope: top25 scope needs ctx.rankedTeamIds');
      return games.filter((g) => ranked.has(g.home.id) || ranked.has(g.away.id));
    }
    case 'ranked_v_ranked': {
      const ranked = ctx.rankedTeamIds;
      if (!ranked) throw new Error('applyScope: ranked_v_ranked scope needs ctx.rankedTeamIds');
      return games.filter((g) => ranked.has(g.home.id) && ranked.has(g.away.id));
    }
  }
}

/* ------------------------------------------------------------------ *
 * The week scorer
 * ------------------------------------------------------------------ */

export type WeekInput = {
  week: number;
  /** The pool's slate for the week, already scoped. */
  games: readonly SlateGame[];
  ats: boolean;
  picks: readonly { userId: string; gameId: string; side: PickSide }[];
  /** One parlay per user per week. */
  parlays?: readonly { userId: string; legs: readonly LegInput[] }[];
  now: number;
  scoring?: Scoring;
};

export type WeekUserScore = {
  userId: string;
  /** D1 `week_score.points`. */
  pickPoints: number;
  /** D1 `week_score.parlay_points`. */
  parlayPoints: number;
  /** What P5 ranks on. 🔴 POINTS. Never summed with anything from the live layer. */
  weekPoints: number;
  correct: number;
  wrong: number;
  /** Picks on games that voided. Zero for everybody, and counted so the screen can say so. */
  voided: number;
  pending: number;
  parlay: ParlayResolution | null;
};

export function scoreWeek(input: WeekInput): WeekUserScore[] {
  const scoring = input.scoring ?? DEFAULT_SCORING;
  const games = new Map<string, SlateGame>();
  for (const g of input.games) games.set(g.id, g);

  const byUser = new Map<string, WeekUserScore>();
  const ensure = (userId: string): WeekUserScore => {
    let row = byUser.get(userId);
    if (row === undefined) {
      row = {
        userId,
        pickPoints: 0,
        parlayPoints: 0,
        weekPoints: 0,
        correct: 0,
        wrong: 0,
        voided: 0,
        pending: 0,
        parlay: null,
      };
      byUser.set(userId, row);
    }
    return row;
  };

  for (const p of input.picks) {
    const game = games.get(p.gameId);
    if (game === undefined) continue; // not on this pool's slate
    const row = ensure(p.userId);
    const state = pickState(p.side, game, input.ats, input.now);
    if (state === 'won') { row.correct++; row.pickPoints += pickPointsFor(p.side, game, input.ats, scoring); }
    else if (state === 'lost') row.wrong++;
    else if (state === 'void') row.voided++;
    else row.pending++;
  }

  for (const par of input.parlays ?? []) {
    const row = ensure(par.userId);
    const res = resolveParlay(par.legs, games, input.ats, input.now, scoring);
    row.parlay = res;
    row.parlayPoints += res.points;
  }

  for (const row of byUser.values()) row.weekPoints = row.pickPoints + row.parlayPoints;
  return [...byUser.values()];
}

/* ------------------------------------------------------------------ *
 * Standings and the one tiebreaker
 * ------------------------------------------------------------------ */

export type StandingsInput = {
  rows: readonly {
    userId: string;
    displayName: string;
    weekPoints: number;
    seasonPoints: number;
    parlayPoints: number;
    /** The user's predicted combined points in the week's named tiebreak game. */
    predictedTotal?: number | null;
    /** Rank in the previous published standings, for movement. */
    priorRank?: number | null;
  }[];
  basis: 'week' | 'season';
  /** The named game of the week. One field, one game, the same rule for every pool. */
  tiebreak?: {
    game: SlateGame;
    /** ATS never applies to the tiebreak: it is a points total, not a side. */
  } | null;
  selfUserId?: string | null;
};

/** The actual combined points, or `null` when the game has not finished or voided.
 *  🔴 A void tiebreak game goes through the same void path: the tiebreaker did not
 *  happen, so ties stand as ties. */
export function tiebreakActual(game: SlateGame): number | null {
  if (resolveGame(game, false) === 'void') return null;
  if (game.status !== 'final') return null;
  if (game.homeScore === null || game.awayScore === null) return null;
  return game.homeScore + game.awayScore;
}

/**
 * Rank. Competition ranking: genuinely level users share a rank and the next rank skips.
 * Order: points desc, then |predicted - actual| asc when the tiebreak has landed,
 * then level. A user with no prediction sorts behind every user who made one.
 */
export function standings(input: StandingsInput): StandingsRow[] {
  const actual = input.tiebreak ? tiebreakActual(input.tiebreak.game) : null;
  const pointsOf = (r: StandingsInput['rows'][number]): number =>
    input.basis === 'week' ? r.weekPoints : r.seasonPoints;

  const miss = (r: StandingsInput['rows'][number]): number | null => {
    if (actual === null) return null;
    const p = r.predictedTotal;
    if (p === null || p === undefined) return null;
    return Math.abs(p - actual);
  };

  const sorted = input.rows.slice().sort((a, b) => {
    const dp = pointsOf(b) - pointsOf(a);
    if (dp !== 0) return dp;
    const ma = miss(a);
    const mb = miss(b);
    if (ma !== null && mb !== null && ma !== mb) return ma - mb;
    if (ma !== null && mb === null) return -1;
    if (ma === null && mb !== null) return 1;
    return a.displayName.localeCompare(b.displayName); // stable display order only
  });

  const level = (
    a: StandingsInput['rows'][number],
    b: StandingsInput['rows'][number],
  ): boolean => {
    if (pointsOf(a) !== pointsOf(b)) return false;
    const ma = miss(a);
    const mb = miss(b);
    return ma === mb; // both null, or the same miss
  };

  const out: StandingsRow[] = [];
  let rank = 0;
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i]!;
    if (i === 0 || !level(r, sorted[i - 1]!)) rank = i + 1;
    const prior = r.priorRank;
    out.push({
      rank,
      userId: r.userId,
      displayName: r.displayName,
      weekPoints: r.weekPoints,
      seasonPoints: r.seasonPoints,
      parlayPoints: r.parlayPoints,
      movement: prior === null || prior === undefined ? 0 : prior - rank,
      isSelf: input.selfUserId !== null && input.selfUserId !== undefined && r.userId === input.selfUserId,
    });
  }
  return out;
}
