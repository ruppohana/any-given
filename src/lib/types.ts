/* THE SHARED VOCABULARY. Session-owned, and it exists because four sub-agents
 * independently re-declared these types in their own files - detect.ts, board.ts,
 * pool.ts and winprob.ts each carry a private copy of Play or Call or
 * TeamIdentity. TypeScript is structural so it links; two declarations drift.
 *
 * AMENDMENT 1 - the boards cannot share a row type.
 *   StandingsRow carries weekPoints / seasonPoints / parlayPoints. Those are
 *   POOL POINTS. The live board's quantity is MARBLES PROFIT and has no field.
 *   Putting Marbles in a field named `points` is exactly the conflation the rule
 *   "a pool score and a stake profit never sum" exists to prevent - so the fix is
 *   two row types that share their presentation fields, not one type with a
 *   nullable number. Raised by M6, which refused to emit StandingsRow.
 *
 * AMENDMENT 2 - price.ts owns the offer; calls.ts consumes it.
 *   M4 and M5 both defined payoutPerMarble and confidenceOf. M5 keyed confidence
 *   on |p - 0.5| - the model's LEAN - so p=0.95 off a 30-play backoff read `hi`
 *   and p=0.49 off 40,000 plays read `lo`. That inverts "the model is allowed to
 *   say it is guessing", which is about CERTAINTY, not lean. Confidence comes
 *   from the sample count and the back-off level. One owner: price.ts.
 *
 * AMENDMENT 3 - a parlay can void.
 *   ParlayState had no 'void', and POOL-SCREENS P3 lists "one leg void" as a
 *   screen state. A parlay reduced below three legs is not lost and not won.
 *
 * AMENDMENT 4 - a star can be a returner or an interceptor.
 *   M1 emitted 462 stars over 516 real plays and had to flatten 17 of them to
 *   'carrier' because the union had no room. It still emits ZERO tacklers, which
 *   is the requirement; the union simply understated the real roles.
 *
 * AMENDMENT 5 - GameFacts, the side channel the detector cannot work without.
 */

/* ---------------------------------------------------------------- identity */

export type TeamIdentity = {
  id: string;            // CFBD team id === ESPN team id
  abbrev: string;
  name: string;
  short: string;
  primary: string | null;    // hex, no '#'. '000000' means NEVER CAPTURED
  secondary: string | null;  // 393 of 760 have none
};

/* ------------------------------------------------------------------- pool */

export type Scope = 'ranked_v_ranked' | 'conference' | 'top25' | 'handpick' | 'all';
export type RankingSource = 'ap' | 'cfp';
export type GameStatus = 'scheduled' | 'in_progress' | 'final' | 'void';
export type PickSide = 'home' | 'away';
export type PickState = 'unpicked' | 'picked' | 'locked' | 'in_progress' | 'won' | 'lost' | 'void';

export type Pool = {
  id: string; name: string; commissionerId: string;
  scope: Scope; scopeArg: string | null; rankingSource: RankingSource | null;
  ats: boolean; season: number; scopeLockedAt: number | null; memberCount: number;
};

export type SlateGame = {
  id: string; week: number; kickoffUtc: number;
  home: TeamIdentity; away: TeamIdentity;
  spread: number | null;      // rendered ONLY when pool.ats
  status: GameStatus;
  homeScore: number | null; awayScore: number | null;
};

export type Pick = {
  gameId: string;
  side: PickSide | null;
  state: PickState;
  lockedAt: number;
  /** The POOL's own split. 🔴 NULL UNTIL THAT GAME KICKS OFF - nobody sees
   *  anything until after the lock (Jason, 2026-09-08). Null again when a floor
   *  suppresses it; a screen renders both as "no number". */
  crowd: { home: number; away: number; n: number } | null;
  /** AMENDMENT 7 - AN EDIT MADE WITH NO CONNECTION. Jason, 2026-09-08:
   *  "que and pending."
   *
   *  Two screens promised different things offline: the slate said the change was
   *  saved and would go up later, my-picks disabled the control and said a change
   *  arriving after kickoff would not count. Same user, same pick, one of them
   *  lying - and the case that separates them is real: edit at 12:58 with no
   *  signal, kickoff at 13:00, reconnect at 13:05.
   *
   *  So an offline edit is TAKEN, shown as PENDING, and ruled on by the SERVER on
   *  arrival - never by the phone, whose clock can be wrong or set on purpose.
   *  Until it lands, no screen may show it as the pick. */
  pending?: { side: PickSide; madeAt: number } | null;
};

/** What the server did with a queued edit. `madeAt` is evidence, never authority. */
export type PendingVerdict = 'accepted' | 'rejected_kicked_off' | 'rejected_no_game';

/** AMENDMENT 3: 'void' is a real terminal state. */
export type ParlayState =
  | 'empty' | 'under_min' | 'valid' | 'at_max'
  | 'partial_lock' | 'locked' | 'won' | 'lost' | 'void';

export type Parlay = {
  week: number;
  legs: { gameId: string; side: PickSide; locked: boolean; result: 'won' | 'lost' | 'void' | null }[];
  state: ParlayState;
  /** In THIS POOL'S POINTS. Never odds. Ladder 3/6/12/20, decided 2026-09-08. */
  worth: number;
  /** A voided leg is never silent: a reduced parlay says so on screen. */
  reduced?: boolean;
  voidedLegs?: string[];
};

export type Tiebreak = { gameId: string; predictedTotal: number | null };

/** THE POOL BOARD. Points. */
export type StandingsRow = {
  rank: number; userId: string; displayName: string;
  weekPoints: number; seasonPoints: number; parlayPoints: number;
  movement: number; isSelf: boolean;
};

/* ------------------------------------------------------------------- live */

export type StarRole = 'carrier' | 'passer' | 'receiver' | 'kicker' | 'returner' | 'interceptor';

export type Play = {
  id: string; driveId: string;
  quarter: number; clock: string;
  down: number | null; distance: number | null;
  yardsToGoal: number | null;         // PRE-SNAP. Post-play spot is in GameFacts
  offenseTeamId: string;
  text: string; yards: number;
  /** 7.2 EMITTED BY THE PARSER, NEVER DERIVED IN A VIEW. The parenthesized group
   *  at the end of a play is the TACKLER and never appears here. */
  star: { name: string; jersey: string | null; teamId: string; role: StarRole } | null;
  type: 'run' | 'pass' | 'kick' | 'penalty' | 'other';
};

/** AMENDMENT 5 - the side channel M2 needed and M1 does not emit. Play carries no
 *  score, no scoringPlay flag and no post-play spot, and the detector cannot work
 *  without them. Keyed by play id. Optional: without it close_game does not fire,
 *  which is a DEFINED degradation rather than a silence. */
export type GameFacts = {
  score?: Record<string, { home: number; away: number }>;
  endYardsToGoal?: Record<string, number>;
  scoringPlay?: Record<string, boolean>;
  homeTeamId?: string;
  awayTeamId?: string;
};

export type DetectedEvent =
  | 'touchdown' | 'field_goal' | 'punt' | 'turnover' | 'fumble' | 'interception'
  | 'safety' | 'big_play' | 'fourth_down' | 'red_zone' | 'close_game'
  | 'downs' | 'kickoff' | 'overtime';

export type KeyMoment = { playId: string; event: DetectedEvent; wpDelta: number; text: string };

export type CallSide = 'run' | 'pass';
/** THREE STEPS. From the model's SAMPLE and BACK-OFF LEVEL, never from |p-0.5|. */
export type Confidence = 'hi' | 'mid' | 'lo';

/** AMENDMENT 2: price.ts is the only producer of this. */
export type CallOffer = {
  snapId: string; side: CallSide;
  p: number;
  payoutPerMarble: number;   // 1/p, CAPPED AT 6
  confidence: Confidence;
  closesAt: number;
};

export type Call = {
  snapId: string; side: CallSide;
  stake: number;
  p: number;                 // the price AT THE MOMENT OF THE CALL
  state: 'open' | 'locked' | 'settled';
  landed: boolean | null;    // null on a SETTLED call means VOID
  delta: number | null;
};

/** A ledger row a board can attribute. Call has no userId; on the wire the DO
 *  knows it from the socket, but a replay needs it. */
export type LedgerEntry = Call & { userId: string };

export type Bank = {
  balance: number; start: number; delta: number;
  record: { landed: number; missed: number };
  streak: number;
};

/** AMENDMENT 1: THE LIVE BOARD. Marbles. It shares its presentation fields with
 *  StandingsRow so one row component draws both - and shares no quantity, so
 *  nothing can sum them. */
export type LiveStandingsRow = {
  rank: number; userId: string; displayName: string;
  movement: number; isSelf: boolean;
  balance: number; start: number;
  profit: number;            // balance - start. THE BOARD RANKS ON THIS
  committed: number;
  calls: number; landed: number; missed: number; voided: number;
  streak: number;
};

export type Notification = { kind: string; body: string; holdsState: boolean; sendAt: number };

/* ------------------------------------------------------------------ prefs */

/** AMENDMENT 6 - the settings a user actually holds.
 *
 *  Raised by S2, which had to shape one because nothing existed to import - and
 *  S2, L2 and L3 all read the same delay. Three screens inventing three prefs
 *  objects is the drift the shared vocabulary exists to stop, and the delay is
 *  the worst one to get wrong: it is the setting the whole spoiler rule hangs on.
 *
 *  🔴 THE DELAY IS ALWAYS ON AND USER-SET, and zero is reachable. "Always-on"
 *  means the control is always present and always applied - not that the minimum
 *  is above zero. At zero the app can run ahead of the television and the screen
 *  says so in --down. Whether a hard floor above zero is wanted is Jason's, and
 *  it is one constant.
 *
 *  Everything here is DEVICE-LOCAL. There is no account: a person is a display
 *  name and a device until they choose otherwise, so these survive offline and
 *  do not need the network to be true. */
export type Density = 'compact' | 'detailed';
export type ThemeChoice = 'light' | 'dark' | 'system';

export type UserPrefs = {
  /** The MOST that is ever asked, and only after the first pick. Never at the door. */
  displayName: string | null;
  followedTeamId: string | null;   // null is a real answer - Skip is honored
  theme: ThemeChoice;
  /** Seconds. 0 is legal and means the app may get ahead of the television.
   *  The reference server accepts 0-600, which is unaimable with a thumb. */
  delaySeconds: number;
  /** The VIEWER's, never the pool's. A density toggle changes the rendering, not
   *  the slate, so it does not touch the rule that scope may not be per-user. */
  density: Density;
  alertsOn: boolean;
  /** Per kind. Each one is held by the feed's delay or carries no state at all. */
  alerts: Record<string, boolean>;
};
