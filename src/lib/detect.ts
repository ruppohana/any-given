/**
 * detect.ts — the event detector.
 *
 * Turns a `Play[]` into per-play `DetectedEvent`s AND the sentence that explains
 * them, so requirement 7.7 can be met: a `KeyMoment` says WHY the win-probability
 * line moved, not merely that a play was tagged.
 *
 * Bar: `C:\Claude\Knowledge\sports-live\ncaalive\detect.py`. That detector diffs a
 * pair of scoreboard snapshots; this one walks the play list. Where the two can
 * describe the same thing they are kept deliberately identical — thresholds,
 * the red-zone transition rule, the "a kick return is not a big play" rule, and
 * the rule that a turnover on downs is NOT a generic turnover.
 *
 * WHAT IS NEW HERE, and why it is not a translation:
 *
 *  - 7.1 ESPN ships more than one play-text grammar IN ONE GAME. In
 *    real-ball-at-osu three touchdowns arrive as "Devin McCuin 17 Yd pass from
 *    Julian Sayin (Connor Hawkins Kick)" — full names, no jersey numbers, no
 *    tackler, and NO the word TOUCHDOWN — while the other five in the same game
 *    arrive as "... for 48 yards to the BallSt00 TOUCHDOWN, clock 08:47".
 *    A detector keyed on the word TOUCHDOWN misses 5 of 22 across the fixtures.
 *
 *  - A NEGATED PLAY KEEPS ITS FULL TEXT. ESPN does not rewrite a play a flag
 *    wiped out; it appends the penalty and "NO PLAY":
 *      "... for 4 yards to the UTEP00 TOUCHDOWN nullified by penalty ... NO PLAY"
 *      "#4 M.Madsen pass intercepted by #2 N.Offord at ORE05 PENALTY ... NO PLAY"
 *    Read as text, that is one touchdown and one interception that never
 *    happened — and both are in these fixtures. This is the same failure the
 *    reference's own crown-jewel test names: a score event must not quote a
 *    play that did not score it.
 *
 *  - Downs is derived STRUCTURALLY — 4th-down snap + the ball changed hands +
 *    it was not a punt, a field goal, a score or a turnover — never from the
 *    string "TURNOVER ON DOWNS". The string happens to be present on all five
 *    detectable downs plays here, but it is also present on a 4th-down
 *    touchdown's neighbours and absent from the last drive of a game, and a
 *    detector that reads it cannot tell a 4th-down field goal from a stop.
 *
 *  - A TIMEOUT play carries the offense id of the team that CALLED the timeout,
 *    not the team with the ball. 16 plays across the three fixtures flip
 *    `offenseTeamId` without possession changing. Possession is therefore read
 *    per DRIVE, from the modal offense id of the drive's non-timeout plays.
 *
 *  - Some plays carry no offense participant at all (`offenseTeamId === ''`).
 *
 * Pure. No I/O, no clock, no network.
 */

/* ------------------------------------------------------------------ */
/* Types — CONTRACT §6, restated locally.                              */
/* TS is structural, so M1's `Play` satisfies this without an import.  */
/* ------------------------------------------------------------------ */

export type Play = {
  id: string;
  driveId: string;
  quarter: number;
  clock: string;
  down: number | null;
  distance: number | null;
  yardsToGoal: number | null;
  offenseTeamId: string;
  text: string;
  yards: number;
  star: {
    name: string;
    jersey: string | null;
    teamId: string;
    role: 'carrier' | 'passer' | 'receiver' | 'tackler' | 'kicker';
  } | null;
  type: 'run' | 'pass' | 'kick' | 'penalty' | 'other';
};

export type DetectedEvent =
  | 'touchdown' | 'field_goal' | 'punt' | 'turnover' | 'fumble' | 'interception'
  | 'safety' | 'big_play' | 'fourth_down' | 'red_zone' | 'close_game'
  | 'downs' | 'kickoff' | 'overtime';

export type KeyMoment = { playId: string; event: DetectedEvent; wpDelta: number; text: string };

/* ------------------------------------------------------------------ */
/* Severity — same three steps as the reference.                        */
/* 3 buzz the wrist · 2 notify · 1 update the UI quietly.               */
/* ------------------------------------------------------------------ */

export const CRITICAL = 3 as const;
export const NOTABLE = 2 as const;
export const MINOR = 1 as const;
export type Severity = 1 | 2 | 3;

/**
 * What the detector needs that `Play` does not carry.
 *
 * Everything here is optional and every field degrades to a named, defined
 * behaviour rather than to a guess:
 *  - no `score`            → no `close_game`, and no score line in a KeyMoment
 *  - no `endYardsToGoal`   → `red_zone` falls back to `play.yardsToGoal`
 *  - no `scoring`/`turnover`/`espnType` → text and structure decide alone
 */
export type GameFacts = {
  homeTeamId?: string;
  awayTeamId?: string;
  /** team id → the abbreviation a headline uses. Never a logo. */
  abbrev?: Record<string, string>;
  /** play id → the score AFTER that play */
  score?: Record<string, { home: number; away: number }>;
  /** play id → yards to the offense's goal AFTER the play (ESPN `end.yardsToEndzone`) */
  endYardsToGoal?: Record<string, number | null>;
  /** play id → ESPN `scoringPlay` */
  scoring?: Record<string, boolean>;
  /** play id → ESPN `isTurnover` */
  turnover?: Record<string, boolean>;
  /** play id → ESPN `type.text`, e.g. 'Fumble Recovery (Opponent)' */
  espnType?: Record<string, string>;
};

export type DetectConfig = {
  bigPlayYards: number;
  redZoneYards: number;
  closeGameMargin: number;
  closeGameSeconds: number;
  /** Reference behaviour: red zone fires on every out→in transition. */
  redZoneOncePerDrive: boolean;
};

export const DEFAULTS: DetectConfig = {
  bigPlayYards: 25,
  redZoneYards: 20,
  closeGameMargin: 8,
  closeGameSeconds: 300,
  redZoneOncePerDrive: false,
};

/** One reason a play is worth showing. `headline` is the Key moment line. */
export type EventReason = {
  event: DetectedEvent;
  severity: Severity;
  headline: string;
  detail: string;
  /** Dedupe key. Identical keys must never fire twice, as in the reference's EventLog. */
  key: string;
};

export type PlayDetection = {
  playId: string;
  driveId: string;
  quarter: number;
  clock: string;
  clockSeconds: number | null;
  /** The team that actually had the ball, read from the drive, not the play. */
  offenseTeamId: string;
  events: DetectedEvent[];
  /** The one a KeyMoment names. Null when the play is unremarkable. */
  primary: DetectedEvent | null;
  reasons: EventReason[];
  /** 7.2 — passed straight through from the parser. A view NEVER re-derives it. */
  star: Play['star'];
  yards: number;
  text: string;
  score: { home: number; away: number } | null;
  margin: number | null;
  scoring: boolean;
  possessionChanged: boolean;
};

/* ------------------------------------------------------------------ */
/* Ranking — most consequential first. This is what `primary` picks.    */
/* ------------------------------------------------------------------ */

const RANK: DetectedEvent[] = [
  'touchdown', 'safety', 'interception', 'fumble', 'turnover', 'downs',
  'field_goal', 'big_play', 'punt', 'overtime', 'red_zone', 'fourth_down',
  'kickoff', 'close_game',
];

/* ------------------------------------------------------------------ */
/* Text grammars                                                        */
/* ------------------------------------------------------------------ */

/** Live 2026 grammar: the literal token, always upper case. */
const RE_TD_LIVE = /\bTOUCHDOWN\b/;

/**
 * 7.1 — the OTHER grammar, in the same games. Full names, no jersey numbers,
 * no tackler, no TOUCHDOWN token:
 *   "Devin McCuin 17 Yd pass from Julian Sayin (Connor Hawkins Kick)"
 *   "Bo Jackson 65 Yd Run (Connor Hawkins Kick)"
 *   "Isaiah Sategna III 88 Yd Punt Return (Tate Sandell Kick)"
 * `\d+ Yd Field Goal` deliberately does NOT match — that is a field goal.
 */
const RE_TD_SUMMARY =
  /\b\d+\s*Yds?\s+(?:pass\s+from\b|run\b|rush\b|(?:interception|fumble|punt|kickoff|blocked\s+\w+)\s+return\b)/i;

/** A third grammar, seen only in `scoringPlays[]` so far. Cheap to cover. */
const RE_TD_PROSE = /,\s*for\s+a\s+TD\b/i;

const RE_FG_LIVE = /field goal attempt from\s+\d+\s+yards?\s+(GOOD|NO GOOD)/i;
const RE_FG_SUMMARY = /\b\d+\s*Yds?\s+Field\s+Goal\b/i;
const RE_FG_ANY = /\bfield goal\b/i;
const RE_FG_MISS = /\bNO GOOD\b|\bis\s+no\s+good\b|\bblocked\b/i;

const RE_PUNT = /\bpunts?\b|\bpunted\b/i;
const RE_KICKOFF = /\bkick\s?off\b|\bkicks\s+off\b/i;
const RE_INT = /\bintercept(?:ed|ion)\b/i;
const RE_FUMBLE = /\bfumble[sd]?\b/i;
const RE_SAFETY = /\bSAFETY\b/;
const RE_TIMEOUT = /^\s*(?:\(\d{1,2}:\d{2}\)\s*)?Timeout\b/i;
const RE_END_PERIOD = /^\s*End of\b|^\s*End Of\b/i;
const RE_ON_DOWNS = /TURNOVER ON DOWNS/i;

/**
 * The play was wiped out. ESPN keeps the whole original sentence and bolts the
 * penalty onto the end, so the text still says TOUCHDOWN or "intercepted by".
 * Both cases are in these fixtures and both are worth zero events.
 */
const RE_NO_PLAY = /\bNO PLAY\b|nullified by penalty/i;

/* ------------------------------------------------------------------ */
/* Small helpers                                                        */
/* ------------------------------------------------------------------ */

/** "14:55" → 895. "0:04" → 4. Anything else → null. */
export function clockSeconds(clock: string | null | undefined): number | null {
  if (!clock) return null;
  const m = /^\s*(\d{1,3}):(\d{2})(?:\.\d+)?\s*$/.exec(clock);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function isTimeout(p: Play): boolean {
  return RE_TIMEOUT.test(p.text || '');
}

function isEndPeriod(p: Play): boolean {
  return RE_END_PERIOD.test(p.text || '');
}

/** A play that does not move the ball and must never speak for possession. */
function isAdministrative(p: Play): boolean {
  return isTimeout(p) || isEndPeriod(p);
}

/** Wiped out by a flag. Nothing happened, whatever the sentence still says. */
export function isNullified(p: Play): boolean {
  return RE_NO_PLAY.test(p.text || '');
}

/**
 * Possession, read per drive.
 *
 * A timeout play carries the id of the team that CALLED it. Taking
 * `offenseTeamId` at face value flips possession on every opponent timeout and
 * fires a turnover — 16 such plays across the three fixtures. So the drive's
 * team is the modal offense id over its non-administrative plays.
 */
export function driveTeams(plays: Play[]): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const p of plays) {
    if (isAdministrative(p)) continue;
    const off = p.offenseTeamId;
    if (!off) continue;
    let c = counts.get(p.driveId);
    if (!c) counts.set(p.driveId, (c = new Map()));
    c.set(off, (c.get(off) || 0) + 1);
  }
  const out = new Map<string, string>();
  for (const [drive, c] of counts) {
    let best = '';
    let n = -1;
    for (const [team, k] of c) if (k > n) { best = team; n = k; }
    out.set(drive, best);
  }
  // A drive made entirely of administrative plays still needs an answer.
  for (const p of plays) if (!out.has(p.driveId)) out.set(p.driveId, p.offenseTeamId || '');
  return out;
}

function abbrevOf(facts: GameFacts, teamId: string): string {
  return (facts.abbrev && facts.abbrev[teamId]) || teamId || '?';
}

/** The other team in this game, or '' when the facts do not say who plays. */
function otherTeamId(facts: GameFacts, teamId: string): string {
  const { homeTeamId: h, awayTeamId: a } = facts;
  if (!h || !a) return '';
  if (teamId === h) return a;
  if (teamId === a) return h;
  return '';
}

function scoreLine(facts: GameFacts, s: { home: number; away: number } | null): string {
  if (!s) return '';
  const a = facts.awayTeamId ? abbrevOf(facts, facts.awayTeamId) : 'AWAY';
  const h = facts.homeTeamId ? abbrevOf(facts, facts.homeTeamId) : 'HOME';
  return `${a} ${s.away} - ${h} ${s.home}`;
}

/** The play text, trimmed of the leading "(12:40) " play-clock stamp. */
function cleanText(text: string): string {
  return (text || '').replace(/^\s*\(\d{1,2}:\d{2}\)\s*/, '').trim();
}

/* ------------------------------------------------------------------ */
/* The detector                                                         */
/* ------------------------------------------------------------------ */

export function detect(
  plays: Play[],
  facts: GameFacts = {},
  config: Partial<DetectConfig> = {},
): PlayDetection[] {
  const cfg: DetectConfig = { ...DEFAULTS, ...config };
  const teams = driveTeams(plays);

  // Drive order, so "the ball changed hands" is a question about drives.
  const driveOrder: string[] = [];
  for (const p of plays) if (driveOrder[driveOrder.length - 1] !== p.driveId) driveOrder.push(p.driveId);
  const nextDriveTeam = new Map<string, string>();
  for (let i = 0; i < driveOrder.length - 1; i++) {
    nextDriveTeam.set(driveOrder[i], teams.get(driveOrder[i + 1]) || '');
  }

  // The last play of each drive that actually was a play.
  const lastRealPlay = new Map<string, string>();
  for (const p of plays) if (!isAdministrative(p)) lastRealPlay.set(p.driveId, p.id);
  const lastDriveId = driveOrder[driveOrder.length - 1];

  const out: PlayDetection[] = [];
  let prevInRedZone = false;
  let prevDown4Team: string | null = null;
  const redZoneDrives = new Set<string>();
  const seenPeriods = new Set<number>();

  for (let i = 0; i < plays.length; i++) {
    const p = plays[i];
    const text = p.text || '';
    const clean = cleanText(text);
    const offense = teams.get(p.driveId) || p.offenseTeamId || '';
    const off = abbrevOf(facts, offense);
    const score = (facts.score && facts.score[p.id]) || null;
    const margin = score ? Math.abs(score.home - score.away) : null;
    const secs = clockSeconds(p.clock);
    const espnType = (facts.espnType && facts.espnType[p.id]) || '';
    // `admin` mutes every play-level event. A timeout and a flagged-back play
    // are different things that need exactly the same treatment: nothing
    // happened, whatever the sentence still says.
    const admin = isAdministrative(p) || isNullified(p);
    // A TIMEOUT's end position is measured from the team that CALLED it, so it
    // reads 85 when the ball is on the 15. Anything positional must skip it, or
    // the offense leaves and re-enters the red zone on every opponent timeout —
    // which is exactly what the reference does, three times in one fixture.
    // A flagged-back play is different: the penalty IS enforced, so its end
    // position is real even though the play itself never happened.
    const positionMute = isAdministrative(p);

    const reasons: EventReason[] = [];
    const add = (event: DetectedEvent, severity: Severity, headline: string, detail: string, key: string) =>
      reasons.push({ event, severity, headline, detail, key });

    /* ---- kickoff -------------------------------------------------- */
    const kickoff = !admin && (RE_KICKOFF.test(text) || /kickoff/i.test(espnType));

    /* ---- scoring -------------------------------------------------- */
    // 7.1: three grammars, and only the first one contains the word TOUCHDOWN.
    const isFieldGoal = !admin &&
      (RE_FG_LIVE.test(text) || RE_FG_SUMMARY.test(text) ||
        (/field goal/i.test(espnType) && RE_FG_ANY.test(text)));
    const touchdown = !admin && !isFieldGoal &&
      (RE_TD_LIVE.test(text) || RE_TD_SUMMARY.test(text) || RE_TD_PROSE.test(text));
    const safety = !admin && RE_SAFETY.test(text);
    const fgGood = isFieldGoal && !RE_FG_MISS.test(text);

    /* ---- possession ----------------------------------------------- */
    const nextTeam = lastRealPlay.get(p.driveId) === p.id ? nextDriveTeam.get(p.driveId) : undefined;
    const possessionChanged = nextTeam !== undefined && nextTeam !== '' && offense !== '' && nextTeam !== offense;

    /* ---- turnovers ------------------------------------------------ */
    const punt = !admin && (RE_PUNT.test(text) || /punt/i.test(espnType));
    const interception = !admin && RE_INT.test(text);
    const fumbleMentioned = !admin && RE_FUMBLE.test(text);
    // "Fumble Recovery (Own)" keeps possession — the reference's rule, kept.
    const ownRecovery = /\(own\)/i.test(espnType);
    const flaggedTurnover = Boolean(facts.turnover && facts.turnover[p.id]);
    const opponentRecovery = /\(opponent\)/i.test(espnType);
    const lostFumble = fumbleMentioned && !ownRecovery &&
      (opponentRecovery || flaggedTurnover || (possessionChanged && !punt && !isFieldGoal && !touchdown));
    // An interception is only an interception if the ball actually changed
    // hands. `#4 M.Madsen pass intercepted by #2 N.Offord ... NO PLAY` is
    // already muted above; this is the second belt.
    const lostInterception = interception && (flaggedTurnover || possessionChanged);

    /* ---- downs ----------------------------------------------------- */
    // The string is unreliable — ESPN truncates "TURNOVER ON DOWNS" out of 2 of
    // the 5 detectable downs plays. Structure decides; the string only confirms.
    const wasFourth = p.down === 4;
    const couldBeDowns = !admin && wasFourth &&
      !punt && !isFieldGoal && !touchdown && !safety && !lostFumble && !lostInterception;
    // The last drive of a game has no drive after it, so "the ball changed
    // hands" cannot be observed. That is the ONE place the string is allowed to
    // decide — a named fallback, not the rule.
    const endsTheGame = lastRealPlay.get(p.driveId) === p.id && p.driveId === lastDriveId;
    const downs = couldBeDowns &&
      (possessionChanged || (endsTheGame && RE_ON_DOWNS.test(text)));

    /* ---- who actually scored ---------------------------------------- */
    // A punt return, a kickoff return and a pick six are scored by the DEFENSE,
    // and the drive belongs to the team that punted. real-utep-at-ou has one:
    // drive 4018566644 is UTEP's, and OU's 88-yard return is the touchdown.
    // Reading the drive team here names the wrong team on the biggest play of
    // the first quarter — the same class of error as 7.2's tackler.
    const returnScore = touchdown && (kickoff || punt || lostInterception || lostFumble);
    const scorerId = returnScore ? (otherTeamId(facts, offense) || offense) : offense;
    const scorer = abbrevOf(facts, scorerId);

    /* ---- emit ------------------------------------------------------ */
    if (kickoff) {
      add('kickoff', MINOR, `Kickoff — ${off}`, clean, `ko:${p.id}`);
    }
    if (touchdown) {
      add('touchdown', CRITICAL,
        returnScore ? `Touchdown — ${scorer}, returned` : `Touchdown — ${scorer}`,
        score ? `${clean} · ${scoreLine(facts, score)}` : clean, `td:${p.id}`);
    }
    if (safety) {
      // Two points to the DEFENSE; the offense is the one that gave them up.
      add('safety', CRITICAL,
        `Safety — ${abbrevOf(facts, otherTeamId(facts, offense) || offense)}`,
        clean, `sf:${p.id}`);
    }
    if (isFieldGoal) {
      add('field_goal', NOTABLE,
        fgGood ? `Field goal good — ${off}` : `Field goal missed — ${off}`,
        score && fgGood ? `${clean} · ${scoreLine(facts, score)}` : clean, `fg:${p.id}`);
    }
    if (lostInterception) {
      add('interception', CRITICAL, `Intercepted — ${off} lose it`, clean, `int:${p.id}`);
    }
    if (fumbleMentioned) {
      add('fumble', lostFumble ? CRITICAL : NOTABLE,
        lostFumble ? `Fumble lost — ${off}` : `Fumble recovered — ${off} keep it`, clean, `fm:${p.id}`);
    }
    if ((lostInterception || lostFumble) && !downs) {
      add('turnover', CRITICAL,
        `Turnover — ${nextTeam ? abbrevOf(facts, nextTeam) : '?'} ball`, clean, `to:${p.id}`);
    }
    if (downs) {
      // The reference is explicit that this is NOT a generic turnover.
      add('downs', CRITICAL,
        `Turnover on downs — ${nextTeam ? abbrevOf(facts, nextTeam) : '?'} ball`,
        RE_ON_DOWNS.test(text) ? clean : `${clean} [4th & ${p.distance ?? '?'}, came up short]`,
        `tod:${p.id}`);
    }
    if (punt && !touchdown) {
      add('punt', MINOR, `Punt — ${off}`, clean, `pt:${p.id}`);
    } else if (punt && touchdown) {
      add('punt', NOTABLE, `Punt returned for a score — ${off}`, clean, `pt:${p.id}`);
    }

    /* ---- fourth down ------------------------------------------------ */
    // Reference: does not repeat for the same offense on consecutive snaps.
    /* 🔴 A PUNT ON FOURTH DOWN IS NOT A MOMENT. Jason, looking at the card:
     * "Here are the big moments. Not that big." Three of the four were punts,
     * filed as `fourth_down` NOTABLE - because every 4th-down play qualified,
     * and most 4th downs are punts.
     *
     * What makes fourth down interesting is the DECISION to play it. A punt is
     * the absence of that decision, and a field goal is its own event with its
     * own row. So this fires when they went for it, which is the thing worth
     * looking up for. */
    if (wasFourth && !admin && !punt && !isFieldGoal
      && !(prevDown4Team !== null && prevDown4Team === offense)) {
      add('fourth_down', NOTABLE, `4th & ${p.distance ?? '?'} — ${off}`, clean, `4d:${p.id}`);
    }
    prevDown4Team = admin ? prevDown4Team : (wasFourth ? offense : null);

    /* ---- red zone ---------------------------------------------------- */
    const spot = facts.endYardsToGoal && p.id in facts.endYardsToGoal
      ? facts.endYardsToGoal[p.id]
      : p.yardsToGoal;
    const inRedZone = spot !== null && spot !== undefined && spot >= 0 && spot <= cfg.redZoneYards;
    // Red zone is a STATE of the field, not a thing a play did — so a penalty
    // that carries the ball to the 19 on a "NO PLAY" still enters the red zone.
    if (!positionMute && inRedZone && !prevInRedZone &&
      !(cfg.redZoneOncePerDrive && redZoneDrives.has(p.driveId))) {
      redZoneDrives.add(p.driveId);
      add('red_zone', CRITICAL, `Red zone — ${off}`,
        spot === 0 ? clean : `${spot} yards out · ${clean}`, `rz:${p.driveId}:${p.quarter}`);
    }
    if (!positionMute) prevInRedZone = inRedZone;

    /* ---- big play ---------------------------------------------------- */
    // A 30-yard kick return is not a big play. The reference's rule, kept —
    // and a scoring play already speaks for itself, so it is excluded too.
    /* 🔴 AND THE KICKOFF GUARD HAS TO READ THE TEXT, NOT ONLY THE FLAG. A 28-yard
     * kickoff return came through as a big play with `kickoff` false - the
     * comment above already says a kick return is not a big play, and the rule
     * was right while the flag it depended on was not. The feed writes
     * "A.Borregales kicks 63 yards from NE 35", which is unambiguous. */
    const looksLikeKick = /kicks\s+\d+\s+yards\s+from|kickoff/i.test(p.text || '');
    if (!admin && !kickoff && !looksLikeKick && !punt && !touchdown && !isFieldGoal &&
      p.yards >= cfg.bigPlayYards) {
      add('big_play', NOTABLE, `${p.yards} yards — ${off}`, clean, `bp:${p.id}`);
    }

    /* ---- overtime ---------------------------------------------------- */
    if (p.quarter > 4 && !seenPeriods.has(p.quarter)) {
      add('overtime', CRITICAL, `Overtime — period ${p.quarter}`,
        scoreLine(facts, score) || clean, `ot:${p.quarter}`);
    }
    seenPeriods.add(p.quarter);

    /* ---- close game --------------------------------------------------- */
    if (p.quarter >= 4 && margin !== null && margin <= cfg.closeGameMargin &&
      secs !== null && secs <= cfg.closeGameSeconds) {
      add('close_game', NOTABLE, `One-score game late — ${scoreLine(facts, score)}`,
        `Q${p.quarter} ${p.clock}`, `close:${p.quarter}`);
    }

    const events = reasons.map((r) => r.event);
    let primary: DetectedEvent | null = null;
    for (const e of RANK) if (events.includes(e)) { primary = e; break; }

    out.push({
      playId: p.id,
      driveId: p.driveId,
      quarter: p.quarter,
      clock: p.clock,
      clockSeconds: secs,
      offenseTeamId: offense,
      events,
      primary,
      reasons,
      star: p.star,
      yards: p.yards,
      text: clean,
      score,
      margin,
      scoring: facts.scoring && p.id in facts.scoring
        ? Boolean(facts.scoring[p.id])
        : (touchdown || (isFieldGoal && fgGood) || safety),
      possessionChanged,
    });
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* 7.7 — WHY the line moved.                                            */
/* ------------------------------------------------------------------ */

/**
 * Join detections to a win-probability series and produce SlamTracker's
 * "Key moment" line.
 *
 * `homeWinPct` is keyed by play id, exactly as ESPN's own `winprobability[]`
 * array is — 157 of 158 plays carry one in real-utep-at-ou — so no alignment
 * guessing is needed anywhere. M3 owns the model; this owns the sentence.
 *
 * The delta is measured against the last play that HAD a number, not against
 * `i - 1`, so a gap in the series never invents a swing.
 */
export function keyMoments(
  detections: PlayDetection[],
  homeWinPct: Record<string, number>,
  facts: GameFacts = {},
  opts: { minDelta?: number } = {},
): KeyMoment[] {
  const minDelta = opts.minDelta ?? 0;
  const out: KeyMoment[] = [];
  let prev: number | null = null;

  for (const d of detections) {
    const cur = homeWinPct[d.playId];
    if (cur === undefined || cur === null) continue;
    if (prev === null) { prev = cur; continue; }
    const delta = cur - prev;
    prev = cur;
    if (!d.primary) continue;
    if (Math.abs(delta) < minDelta) continue;

    const reason = d.reasons.find((r) => r.event === d.primary)!;
    const gained = delta >= 0 ? facts.homeTeamId : facts.awayTeamId;
    const who = gained ? abbrevOf(facts, gained) : (delta >= 0 ? 'HOME' : 'AWAY');
    const homeAb = facts.homeTeamId ? abbrevOf(facts, facts.homeTeamId) : 'HOME';
    const move = `${homeAb} ${pct(cur - delta)} → ${pct(cur)}`;
    const swing = `${who} +${(Math.abs(delta) * 100).toFixed(0)}`;

    out.push({
      playId: d.playId,
      event: d.primary,
      wpDelta: delta,
      text: `${reason.headline}. ${swing} win probability (${move}).`,
    });
  }
  return out;
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

/** The n biggest movers, most consequential first. Ties keep game order. */
export function topKeyMoments(moments: KeyMoment[], n = 5): KeyMoment[] {
  return moments
    .map((m, i) => ({ m, i }))
    .sort((a, b) => Math.abs(b.m.wpDelta) - Math.abs(a.m.wpDelta) || a.i - b.i)
    .slice(0, n)
    .map((x) => x.m);
}

/** Every event that fired, counted. Used by the tests and by the live board. */
export function tally(detections: PlayDetection[]): Record<string, number> {
  const t: Record<string, number> = {};
  for (const d of detections) for (const e of d.events) t[e] = (t[e] || 0) + 1;
  return t;
}
