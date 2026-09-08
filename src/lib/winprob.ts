/**
 * winprob.ts — the win-probability series, and the user's own calls drawn on it.
 *
 * Two contract requirements live here and both are structural, not cosmetic:
 *
 *   7.8  The chart carries the user's own calls — filled for landed, hollow for
 *        missed. ESPN and SlamTracker both draw the line; neither can mark where
 *        *you* called. So this module emits the series AND the markers as one
 *        addressable structure (`WinProbChart`) and the view never joins them.
 *
 *   7.6  A diverging chart shares ONE center line, and orientation is applied
 *        ONCE. In the reference implementation the momentum summary bar was
 *        pre-oriented and its parts were not; flipping both pointed the bar at
 *        the opposing team while the sentence above it named yours.
 *
 * ── WHERE ORIENTATION IS APPLIED ───────────────────────────────────────────
 *
 *   ESPN's `winprobability` array is ALWAYS home-oriented. Nothing else in this
 *   file is.
 *
 *   `resolveFlip()`  decides the flip.  ONCE.   One boolean.
 *   `orientSeries()` applies  the flip.  ONCE.  The only place a `1 - pct` or a
 *                                              sign change appears in this file.
 *
 *   Everything downstream — markers, the summary bar, key moments, the extremes,
 *   the current reading — is computed FROM the already-oriented `WpPoint[]` and
 *   never re-derives from the raw samples. Grep this file for `1 -` : it occurs
 *   inside `orientSeries` and nowhere else. That is the invariant, and
 *   `tests/winprob.test.mjs` asserts it against the file's own source text.
 *
 *   The center line is `CENTER`, one constant, shared by the line, the markers
 *   and the summary bar. Every point and every marker carries `offset` already
 *   computed against it, so a diverging renderer does no arithmetic of its own.
 *
 * ── WHAT THIS FILE DOES NOT DO ─────────────────────────────────────────────
 *
 *   It does not detect events (M2 / detect.ts) and it does not import them. To
 *   get key moments, hand `buildWinProbChart` an `events` map keyed by play id.
 *   With no map, `keyMoments` is `[]` — never a guess.
 */

// ─────────────────────────────────────────────────────────────── raw types ──

/** `live` = a real per-play row. `pregame` = the `predictor` projection. */
export type WpSource = 'live' | 'pregame';

/**
 * One raw ESPN win-probability row, HOME-ORIENTED, joined to its play.
 *
 * `homePct` is untouched feed data. Never render this — render a `WpPoint`.
 */
export type WpSample = {
  /** ESPN play id. `null` only if the feed omitted it. */
  playId: string | null;
  /** 0..1, home team's chance to win. Straight from the feed. */
  homePct: number;
  /** 0..1. Present in the 2026 feed, usually 0. */
  tiePct: number;
  /** Ordinal in the series, oldest first. The chart's x. */
  index: number;
  /** 0..1 across the series. `index / (n - 1)`; 0 when n === 1. */
  t: number;
  /** Whether this row joined to a play in `drives`. Row 0 never does. */
  joined: boolean;

  // ---- from the joined play. All null when `joined` is false. ----
  period: number | null;
  /** ESPN's display clock, e.g. `'7:51'`. */
  clock: string | null;
  /** Play text, verbatim. Used for a key moment's label. */
  text: string | null;
  homeScore: number | null;
  awayScore: number | null;
  /** Team id with the ball on this play, when the feed said. */
  offenseTeamId: string | null;
  scoringPlay: boolean;

  /**
   * Seconds left in regulation.
   *
   * 🔴 The 2026 feed does NOT carry `secondsLeft` on a winprobability row —
   * measured on all three fixtures, zero rows have it. The reference
   * implementation reads it, so it is read here too when present; otherwise it
   * is DERIVED from the joined play's period + clock, and is `null` for any
   * period past 4 rather than guessing an overtime length.
   */
  secondsLeft: number | null;
  /** `'feed'` when ESPN supplied it, `'derived'` when computed, `null` when neither. */
  secondsLeftSource: 'feed' | 'derived' | null;
};

/** What `extractWinProbability` returns — the single current number. */
export type WpCurrent = {
  homePct: number;
  playId: string | null;
  secondsLeft: number | null;
  source: WpSource;
  /** Number of live rows behind it. 0 for a pregame projection. */
  samples: number;
};

// ────────────────────────────────────────────────────────── oriented types ──

/**
 * One point on the drawn line, oriented to whoever the reader follows.
 *
 * Produced only by `orientSeries`. Carries `homePct` alongside so a debug view
 * can show the raw number without re-deriving it — but `pct` is the one to draw.
 */
export type WpPoint = WpSample & {
  /** 0..1 for the ORIENTED team. This is the y value. */
  pct: number;
  /** `pct - CENTER`, in [-0.5, +0.5]. Diverging renderers use this directly. */
  offset: number;
  /** `pct - previous.pct`. `null` at index 0. Positive = moved your way. */
  delta: number | null;
};

/**
 * The user's own call, drawn on the line.
 *
 * Only what a marker needs. The full `Call` shape lives in the contract; this
 * module accepts anything structurally compatible with `CallInput`.
 */
export type CallInput = {
  /** The snap the call was made on. Joined to a point by `playId`. */
  snapId: string;
  side: 'run' | 'pass';
  stake: number;
  /** The price AT THE MOMENT OF THE CALL. Not a win probability — never flipped. */
  p: number;
  state?: 'open' | 'locked' | 'settled';
  landed: boolean | null;
  delta?: number | null;
};

/**
 * 7.8 — `filled` landed, `hollow` missed.
 *
 * `open` is the third state the contract's `Call.landed: boolean | null`
 * already permits: a call placed and not yet settled. It is drawn, because a
 * call in flight is the most interesting mark on the chart.
 */
export type MarkerFill = 'filled' | 'hollow' | 'open';

export type CallMarker = {
  snapId: string;
  side: 'run' | 'pass';
  stake: number;
  p: number;
  landed: boolean | null;
  /** Marbles won or lost. `null` while open. */
  delta: number | null;
  fill: MarkerFill;

  // ---- position. Read straight off the oriented point; never re-flipped. ----
  /** Index into `WinProbChart.points`. */
  index: number;
  /** 0..1 across the series. The marker's x. */
  t: number;
  /** The oriented `pct` of the point it sits on. The marker's y. */
  pct: number;
  /** `pct - CENTER`. */
  offset: number;
  playId: string | null;
  period: number | null;
  clock: string | null;
};

/** The contract's `DetectedEvent`, restated so this file imports nothing. */
export type DetectedEvent =
  | 'touchdown' | 'field_goal' | 'punt' | 'turnover' | 'fumble' | 'interception'
  | 'safety' | 'big_play' | 'fourth_down' | 'red_zone' | 'close_game'
  | 'downs' | 'kickoff' | 'overtime';

/** 7.7 — why the line moved. `wpDelta` is in the ORIENTED frame. */
export type KeyMoment = {
  playId: string;
  event: DetectedEvent;
  wpDelta: number;
  text: string;
};

/**
 * The summary sentence's data.
 *
 * 🔴 Computed from `points`, the same array the line is drawn from. This is the
 * exact bug 7.6 names: the reference's summary bar was oriented separately from
 * its parts and the two disagreed. There is no separate orientation here to
 * disagree with.
 */
export type WpSummary = {
  /** The oriented team's current chance, 0..1. */
  pct: number;
  /** `pct - CENTER`. Sign says who is ahead in the SAME frame as every point. */
  offset: number;
  /** True when the oriented team is favored. */
  leading: boolean;
  /** Largest single-play move in the oriented frame, signed. `null` if n < 2. */
  biggestSwing: { index: number; delta: number; playId: string | null; text: string | null } | null;
  /** Oriented team's high and low water marks. */
  high: { index: number; pct: number };
  low: { index: number; pct: number };
};

export type WpOrientation = {
  /** The team the chart is drawn for. `null` = no team chosen, home is used. */
  teamId: string | null;
  /** Whether that team is the home team. */
  isHome: boolean;
  /** True when the raw home-oriented feed was flipped. */
  flipped: boolean;
  /** 🔴 7.6 — where the flip happened. One place, this string names it. */
  appliedIn: 'orientSeries';
};

export type WinProbChart = {
  /** The drawn line, oldest first, oriented. */
  points: WpPoint[];
  /** 7.8 — the user's calls, positioned. Same structure, no join in the view. */
  markers: CallMarker[];
  /** Calls whose `snapId` matched no point. Surfaced, never silently dropped. */
  unjoinedCalls: CallInput[];
  /** 7.7 — empty unless an `events` map was supplied. */
  keyMoments: KeyMoment[];
  /** ONE center line. Every offset in this object is against this number. */
  center: number;
  orientation: WpOrientation;
  summary: WpSummary | null;
  /** The live reading — `live` when the feed had rows, `pregame` otherwise. */
  current: WpCurrent | null;
  /** Index of the first point of each period. For quarter rules on the axis. */
  periodBoundaries: { period: number; index: number }[];
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeAbbrev: string | null;
  awayAbbrev: string | null;
};

export type ChartOptions = {
  /** Orient to this team id. Omit or `null` to draw the home team's line. */
  teamId?: string | null;
  /** The user's own calls. */
  calls?: CallInput[];
  /** Detected events by play id — from M2. No map, no key moments. */
  events?: Record<string, DetectedEvent[]> | null;
  /** A move smaller than this is not a key moment. Default 0.05. */
  keyMomentMinDelta?: number;
};

// ───────────────────────────────────────────────────────────────── the axis ──

/** The one center line the whole chart shares. */
export const CENTER = 0.5;

const SECONDS_PER_PERIOD = 900;
const REGULATION_PERIODS = 4;

// ────────────────────────────────────────────────────────────────── helpers ──

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v);
  return s === '' ? null : s;
}

/** `'7:51'` -> 471. `null` on anything else. */
function clockToSeconds(clock: string | null): number | null {
  if (!clock) return null;
  const m = /^(\d+):(\d{1,2})$/.exec(clock.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Seconds left in REGULATION from a period and a display clock.
 *
 * `null` for period > 4 — an overtime period has no fixed length and guessing
 * one would put a fabricated number on an axis.
 */
function regulationSecondsLeft(period: number | null, clock: string | null): number | null {
  if (period === null || period < 1 || period > REGULATION_PERIODS) return null;
  const c = clockToSeconds(clock);
  if (c === null) return null;
  return (REGULATION_PERIODS - period) * SECONDS_PER_PERIOD + c;
}

/**
 * Every play in a summary, keyed by id.
 *
 * ESPN puts the active drive in BOTH `drives.previous` and `drives.current`, so
 * a Map keyed by id dedupes it for free — the same problem the reference's
 * `extract_plays` solves with an explicit seen-set.
 */
function playsById(summary: any): Map<string, any> {
  const out = new Map<string, any>();
  const drives = summary?.drives ?? {};
  const buckets: any[] = [];
  if (Array.isArray(drives.previous)) buckets.push(...drives.previous);
  if (drives.current) buckets.push(drives.current);
  for (const drive of buckets) {
    const plays = drive?.plays;
    if (!Array.isArray(plays)) continue;
    for (const p of plays) {
      const id = str(p?.id) ?? str(p?.sequenceNumber);
      if (id !== null && !out.has(id)) out.set(id, p);
    }
  }
  return out;
}

/** The team id with the ball, when the feed said so. */
function offenseOf(play: any): string | null {
  const parts = play?.teamParticipants;
  if (Array.isArray(parts)) {
    for (const p of parts) {
      if (p?.type === 'offense') {
        const id = str(p?.id) ?? str(p?.team?.id);
        if (id !== null) return id;
      }
    }
  }
  return str(play?.start?.team?.id);
}

function competitors(summary: any): any[] {
  const comps = summary?.header?.competitions;
  if (Array.isArray(comps) && comps.length && Array.isArray(comps[0]?.competitors)) {
    return comps[0].competitors;
  }
  return [];
}

// ───────────────────────────────────────────────────── raw extraction (1/3) ──

/**
 * The current win-probability reading.
 *
 * Port of `ncaalive/espn.py::extract_win_probability`, same semantics:
 * the last live row wins; `predictor.homeTeam.gameProjection` (0..100) is the
 * pregame fallback; unparseable values fall through rather than throw; nothing
 * at all returns `null`.
 *
 * HOME-ORIENTED. This is a raw reading, not a drawable point.
 */
export function extractWinProbability(summary: any): WpCurrent | null {
  const rows = Array.isArray(summary?.winprobability) ? summary.winprobability : [];
  if (rows.length) {
    const last = rows[rows.length - 1];
    const pct = num(last?.homeWinPercentage);
    if (pct !== null) {
      return {
        homePct: pct,
        playId: str(last?.playId),
        secondsLeft: num(last?.secondsLeft),
        source: 'live',
        samples: rows.length,
      };
    }
  }
  const proj = num(summary?.predictor?.homeTeam?.gameProjection);
  if (proj !== null) {
    return { homePct: proj / 100, playId: null, secondsLeft: null, source: 'pregame', samples: 0 };
  }
  return null;
}

/**
 * Every win-probability sample, oldest first, joined to its play.
 *
 * Port of `ncaalive/espn.py::win_probability_series` on the three fields that
 * function emits (`play_id`, `home_pct`, `seconds_left`) — a row with a missing
 * or unparseable `homeWinPercentage` is skipped, exactly as there.
 *
 * The join to `drives` is new here and is what lets a key moment name a play.
 * On all three real fixtures exactly one row fails to join: the pregame row,
 * whose `playId` is the game id with a sequence that has no play behind it.
 * That is a real state, not a fault — `joined: false` records it.
 *
 * HOME-ORIENTED. Feed the result to `orientSeries` before drawing it.
 */
export function winProbabilitySeries(summary: any): WpSample[] {
  const rows = Array.isArray(summary?.winprobability) ? summary.winprobability : [];
  const plays = playsById(summary);
  const kept: WpSample[] = [];

  for (const r of rows) {
    const pct = num(r?.homeWinPercentage);
    if (pct === null) continue;

    const playId = str(r?.playId);
    const play = playId !== null ? plays.get(playId) : undefined;
    const period = play ? num(play?.period?.number) : null;
    const clock = play ? str(play?.clock?.displayValue) : null;

    const feedSeconds = num(r?.secondsLeft);
    const derived = feedSeconds === null ? regulationSecondsLeft(period, clock) : null;

    kept.push({
      playId,
      homePct: pct,
      tiePct: num(r?.tiePercentage) ?? 0,
      index: kept.length,
      t: 0, // filled below, once the length is known
      joined: play !== undefined,
      period,
      clock,
      text: play ? str(play?.text) : null,
      homeScore: play ? num(play?.homeScore) : null,
      awayScore: play ? num(play?.awayScore) : null,
      offenseTeamId: play ? offenseOf(play) : null,
      scoringPlay: play ? Boolean(play?.scoringPlay) : false,
      secondsLeft: feedSeconds !== null ? feedSeconds : derived,
      secondsLeftSource: feedSeconds !== null ? 'feed' : derived !== null ? 'derived' : null,
    });
  }

  const last = kept.length - 1;
  for (const s of kept) s.t = last > 0 ? s.index / last : 0;
  return kept;
}

// ─────────────────────────────────────────────── 🔴 THE ONE FLIP DECISION ──

/**
 * Decide the flip. ONCE.
 *
 * `teamId` null/unknown -> the home team's line, unflipped. An unrecognized id
 * is NOT an error and is NOT a guess: it falls back to home and reports
 * `teamId: null`, so the caller can see that its id did not match.
 */
export function resolveFlip(
  teamId: string | null | undefined,
  homeTeamId: string | null,
  awayTeamId: string | null,
): WpOrientation {
  const want = str(teamId);
  if (want !== null && awayTeamId !== null && want === awayTeamId) {
    return { teamId: want, isHome: false, flipped: true, appliedIn: 'orientSeries' };
  }
  if (want !== null && homeTeamId !== null && want === homeTeamId) {
    return { teamId: want, isHome: true, flipped: false, appliedIn: 'orientSeries' };
  }
  return { teamId: homeTeamId, isHome: true, flipped: false, appliedIn: 'orientSeries' };
}

/**
 * 🔴 THE ONLY PLACE ORIENTATION IS APPLIED — contract 7.6.
 *
 * Takes home-oriented samples and one boolean. Returns the drawable line.
 * `delta` is computed here too, in the oriented frame, so nothing downstream
 * ever needs to know which way round the feed was.
 *
 * If you are about to write `1 - pct` or negate a delta anywhere else in this
 * codebase, that is the bug 7.6 already paid for once.
 */
export function orientSeries(samples: WpSample[], flipped: boolean): WpPoint[] {
  const out: WpPoint[] = [];
  let prev: number | null = null;
  for (const s of samples) {
    const pct = flipped ? 1 - s.homePct : s.homePct;
    out.push({
      ...s,
      pct,
      offset: pct - CENTER,
      delta: prev === null ? null : pct - prev,
    });
    prev = pct;
  }
  return out;
}

// ───────────────────────────────────────── everything below reads `points` ──

/**
 * 7.8 — the user's calls, positioned on the line.
 *
 * Reads `point.pct` and `point.offset` straight off the oriented point. It does
 * not flip, does not look at `homePct`, and does not know the orientation
 * exists. That is what makes a marker unable to disagree with the line it sits
 * on.
 *
 * `call.p` is a PRICE, not a win probability. It is never oriented.
 */
function markCalls(points: WpPoint[], calls: CallInput[]): {
  markers: CallMarker[];
  unjoined: CallInput[];
} {
  const byPlay = new Map<string, WpPoint>();
  for (const p of points) if (p.playId !== null && !byPlay.has(p.playId)) byPlay.set(p.playId, p);

  const markers: CallMarker[] = [];
  const unjoined: CallInput[] = [];

  for (const c of calls) {
    const point = byPlay.get(String(c.snapId));
    if (!point) { unjoined.push(c); continue; }
    markers.push({
      snapId: c.snapId,
      side: c.side,
      stake: c.stake,
      p: c.p,
      landed: c.landed,
      delta: c.delta ?? null,
      fill: c.landed === true ? 'filled' : c.landed === false ? 'hollow' : 'open',
      index: point.index,
      t: point.t,
      pct: point.pct,
      offset: point.offset,
      playId: point.playId,
      period: point.period,
      clock: point.clock,
    });
  }

  markers.sort((a, b) => a.index - b.index);
  return { markers, unjoined };
}

/**
 * The summary sentence's data — computed from the SAME `points` the line uses.
 *
 * 🔴 7.6. The reference's momentum summary bar was oriented on its own and its
 * parts were not. There is nothing to re-orient here.
 */
function summarize(points: WpPoint[]): WpSummary | null {
  if (!points.length) return null;
  const last = points[points.length - 1];

  let biggest: WpSummary['biggestSwing'] = null;
  let high = points[0];
  let low = points[0];
  for (const p of points) {
    if (p.delta !== null && (biggest === null || Math.abs(p.delta) > Math.abs(biggest.delta))) {
      biggest = { index: p.index, delta: p.delta, playId: p.playId, text: p.text };
    }
    if (p.pct > high.pct) high = p;
    if (p.pct < low.pct) low = p;
  }

  return {
    pct: last.pct,
    offset: last.offset,
    leading: last.pct > CENTER,
    biggestSwing: biggest,
    high: { index: high.index, pct: high.pct },
    low: { index: low.index, pct: low.pct },
  };
}

/**
 * 7.7 — why the line moved.
 *
 * Pure. `events` comes from M2's detector; this module never detects anything.
 * A play with several events yields the one that ranks first in `EVENT_RANK`,
 * so a touchdown is not reported as a `red_zone`.
 */
function buildKeyMoments(
  points: WpPoint[],
  events: Record<string, DetectedEvent[]> | null | undefined,
  minDelta: number,
): KeyMoment[] {
  if (!events) return [];
  const out: KeyMoment[] = [];
  for (const p of points) {
    if (p.playId === null || p.delta === null) continue;
    if (Math.abs(p.delta) < minDelta) continue;
    const evs = events[p.playId];
    if (!Array.isArray(evs) || !evs.length) continue;
    let best = evs[0];
    for (const e of evs) if (rank(e) < rank(best)) best = e;
    out.push({ playId: p.playId, event: best, wpDelta: p.delta, text: p.text ?? '' });
  }
  return out;
}

const EVENT_RANK: DetectedEvent[] = [
  'touchdown', 'safety', 'interception', 'fumble', 'turnover', 'downs',
  'field_goal', 'big_play', 'fourth_down', 'red_zone', 'punt', 'kickoff',
  'overtime', 'close_game',
];
function rank(e: DetectedEvent): number {
  const i = EVENT_RANK.indexOf(e);
  return i === -1 ? EVENT_RANK.length : i;
}

function boundaries(points: WpPoint[]): { period: number; index: number }[] {
  const out: { period: number; index: number }[] = [];
  let seen: number | null = null;
  for (const p of points) {
    if (p.period !== null && p.period !== seen) {
      out.push({ period: p.period, index: p.index });
      seen = p.period;
    }
  }
  return out;
}

// ────────────────────────────────────────────────────────── the one export ──

/**
 * The whole chart, as one addressable structure — contract 7.8.
 *
 * The view receives `points` and `markers` already joined and already in the
 * same frame. It performs no lookup, no flip and no arithmetic against the
 * center line.
 *
 * Build order, and it is the whole 7.6 argument:
 *
 *   1. `winProbabilitySeries`  -> home-oriented samples
 *   2. `resolveFlip`           -> ONE boolean
 *   3. `orientSeries`          -> ONE application of it
 *   4. markers / summary / key moments — all read the output of step 3
 */
export function buildWinProbChart(summary: any, opts: ChartOptions = {}): WinProbChart {
  const comps = competitors(summary);
  const home = comps.find((c: any) => c?.homeAway === 'home') ?? null;
  const away = comps.find((c: any) => c?.homeAway === 'away') ?? null;
  const homeTeamId = home ? str(home.id) ?? str(home?.team?.id) : null;
  const awayTeamId = away ? str(away.id) ?? str(away?.team?.id) : null;

  const samples = winProbabilitySeries(summary);
  const orientation = resolveFlip(opts.teamId, homeTeamId, awayTeamId);
  const points = orientSeries(samples, orientation.flipped);

  const { markers, unjoined } = markCalls(points, opts.calls ?? []);

  return {
    points,
    markers,
    unjoinedCalls: unjoined,
    keyMoments: buildKeyMoments(points, opts.events, opts.keyMomentMinDelta ?? 0.05),
    center: CENTER,
    orientation,
    summary: summarize(points),
    current: extractWinProbability(summary),
    periodBoundaries: boundaries(points),
    homeTeamId,
    awayTeamId,
    homeAbbrev: home ? str(home?.team?.abbreviation) : null,
    awayAbbrev: away ? str(away?.team?.abbreviation) : null,
  };
}
