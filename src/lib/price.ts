/**
 * price.ts — the pricer. What a run call and a pass call are worth, BEFORE the snap.
 *
 * ## What this is a port of
 *
 * `sports-live/ncaalive/tendency.py` — the run/pass tendency model, trained on 697,997 CFBD
 * plays into 350,924 contexts at `min_samples: 30`. Nothing here retrains, re-buckets or
 * re-weights anything. It reproduces `TendencyModel.predict()` key for key and then wraps the
 * result in a price.
 *
 * **The model is NOT compressed, thinned or approximated here.** Changing what the counts say
 * changes what the app charges, which is a product change and is not this module's to make.
 *
 * ## The three rules this module is built around
 *
 * 1. **The price is on the tile, before the tap.** Everything in here is a function of the
 *    PRE-SNAP situation — down, distance, field position, score, clock. It never reads the play
 *    that follows. `priceSnap()` is callable the moment the situation is known.
 * 2. **Payout is `stake / p`, capped at 6x.** Settled. A model saying 3% is telling you the
 *    sample is thin, not offering 33x.
 * 3. **Confidence is three fixed steps.** `hi` / `mid` / `lo`, never a ramp. `lo` is a feature:
 *    it is the model saying out loud that it backed off to a broad context.
 *
 * ## The injection interface — the model source is passed in, never imported
 *
 * Whether the 1.9 MB gzipped model is bundled in the Worker or lives in D1 is not decided here
 * and this file works either way. A `TendencySource` is one function:
 *
 * ```ts
 * type CountsLookup = (keys: string[]) => (Counts | null)[] | Promise<(Counts | null)[]>;
 * ```
 *
 * It is handed up to 12 keys — the same key at six levels of specificity, for this team and
 * then for the league — and returns one row per key, in the same order, `null` where the key is
 * absent. It may answer synchronously or with a promise.
 *
 * **Bundled** — `fromCounts(model.counts, model.min_samples)`.
 *
 * **D1** — one statement, one round trip, no per-level chatter:
 *
 * ```ts
 * const source: TendencySource = {
 *   minSamples: 30,
 *   async get(keys) {
 *     const marks = keys.map(() => '?').join(',');
 *     const { results } = await db.prepare(
 *       `SELECT k, run, pass FROM tendency WHERE k IN (${marks})`).bind(...keys).all();
 *     const by = new Map(results.map(r => [r.k, { run: r.run, pass: r.pass }]));
 *     return keys.map(k => by.get(k) ?? null);
 *   },
 * };
 * ```
 *
 * A KV, R2-backed cache or in-memory LRU is the same shape. Nothing else in here knows or cares.
 */

// ---------------------------------------------------------------------------
// Types shared with CONTRACT.md §6. Restated, not redefined.
// ---------------------------------------------------------------------------

export type CallSide = 'run' | 'pass';
export type Confidence = 'hi' | 'mid' | 'lo';

export type CallOffer = {
  snapId: string;
  side: CallSide;
  /** Model probability, 0..1. Rounded to 3dp exactly as the reference rounds it. */
  p: number;
  /** `1 / p`, CAPPED AT 6. */
  payoutPerMarble: number;
  confidence: Confidence;
  /** Epoch ms. The snap clock. Passed in — this module owns no clock. */
  closesAt: number;
};

// ---------------------------------------------------------------------------
// The model source
// ---------------------------------------------------------------------------

export type Counts = { run: number; pass: number };

/** Returns one row per key, in the same order, `null` where the key is absent. */
export type CountsLookup = (keys: string[]) => (Counts | null)[] | Promise<(Counts | null)[]>;

export type TendencySource = {
  get: CountsLookup;
  /** Defaults to 30 — the value baked into the trained model. */
  minSamples?: number;
};

/** The default in `tendency.json`'s own `min_samples`. */
export const DEFAULT_MIN_SAMPLES = 30;

/** The multiple a payout can never exceed. Settled. */
export const PAYOUT_CAP = 6;

/** The league baseline every team falls back to. Written by the trainer as team "ALL". */
export const LEAGUE = 'ALL';

/**
 * Wrap an already-loaded `counts` object — the bundled route.
 * `counts` is `tendency.json`'s own `counts` map, untouched.
 */
export function fromCounts(
  counts: Record<string, Counts>,
  minSamples: number = DEFAULT_MIN_SAMPLES,
): TendencySource {
  return {
    minSamples,
    get: (keys) => keys.map((k) => counts[k] ?? null),
  };
}

// ---------------------------------------------------------------------------
// Feature buckets — a straight port of tendency.py, including its edge cases
// ---------------------------------------------------------------------------

/**
 * `int(v)` as Python does it: truncation toward zero for numbers, integer-shaped strings only,
 * and `null` for anything it would have raised on. `int("3.0")` raises in Python and must not
 * quietly become 3 here, because a different bucket is a different key is a different price.
 */
function toInt(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.trunc(v) : null;
  if (typeof v === 'boolean') return v ? 1 : 0; // Python bool is an int
  if (typeof v === 'string') {
    const s = v.trim();
    if (!/^[+-]?\d+$/.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** `float(v)`, returning null where Python would raise. `float("")` raises; `Number("")` is 0. */
function toNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') {
    const s = v.trim();
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function distanceBucket(d: unknown): string {
  const n = toInt(d);
  if (n === null) return '?';
  if (n <= 3) return 'short';
  if (n <= 7) return 'mid';
  if (n <= 10) return 'long';
  return 'verylong';
}

export function fieldBucket(yardsToGoal: unknown): string {
  const y = toInt(yardsToGoal);
  if (y === null) return '?';
  if (y <= 10) return 'goalline';
  if (y <= 20) return 'redzone';
  if (y <= 50) return 'front';
  if (y <= 80) return 'back';
  return 'pinned';
}

/** The OFFENSE's margin. Trailing teams throw; leading teams run the clock. */
export function scoreBucket(diff: unknown): string {
  const d = toInt(diff);
  if (d === null) return '?';
  if (d <= -15) return 'down3+';
  if (d <= -8) return 'down2';
  if (d <= -4) return 'down1';
  if (d <= 3) return 'even';
  if (d <= 7) return 'up1';
  if (d <= 14) return 'up2';
  return 'up3+';
}

export function clockBucket(period: unknown, secondsLeft: unknown): string {
  // Python: `p = _int(period) or 0` — so period 0 AND period None both become 0.
  const p = toInt(period) || 0;
  const s = toNum(secondsLeft);
  if ((p === 2 || p === 4) && s !== null && s <= 120) return `q${p}late`;
  return p ? `q${Math.min(p, 5)}` : 'q?';
}

export type TendencyContext = {
  down: string;
  dist: string;
  field: string;
  score: string;
  clock: string;
};

/**
 * The five bucketed features that make a key.
 *
 * Note the down: Python writes `str(_int(down) or "?")`, so **down 0 buckets as "?"**, not "0".
 * That is not a typo being copied — 0 is not a down, and the trainer skips those plays outright.
 */
export function contextOf(
  down: unknown,
  distance: unknown,
  yardsToGoal: unknown,
  scoreDiff: unknown,
  period: unknown,
  secondsLeft: unknown,
): TendencyContext {
  const d = toInt(down);
  return {
    down: String(d || '?'),
    dist: distanceBucket(distance),
    field: fieldBucket(yardsToGoal),
    score: scoreBucket(scoreDiff),
    clock: clockBucket(period, secondsLeft),
  };
}

// ---------------------------------------------------------------------------
// The back-off ladder
// ---------------------------------------------------------------------------

export type Level = 'full' | 'no_clock' | 'no_score' | 'no_field' | 'down' | 'global';

type LevelSpec = readonly [Level, readonly (keyof TendencyContext)[]];

/** Most specific first. A prediction walks down this list and says which level answered. */
export const LEVELS: readonly LevelSpec[] = [
  ['full', ['down', 'dist', 'field', 'score', 'clock']],
  ['no_clock', ['down', 'dist', 'field', 'score']],
  ['no_score', ['down', 'dist', 'field']],
  ['no_field', ['down', 'dist']],
  ['down', ['down']],
  ['global', []],
] as const;

export function keyFor(team: string, level: Level, ctx: TendencyContext): string {
  const spec = LEVELS.find(([l]) => l === level);
  const fields = spec ? spec[1] : [];
  return [team, level, ...fields.map((f) => ctx[f] ?? '?')].join('|');
}

/**
 * Every key a prediction could need, in the exact order it would probe them:
 * this team at six levels, then the league at six levels. Twelve strings, one lookup.
 */
export function probeKeys(team: string, ctx: TendencyContext): string[] {
  const who = team && team !== LEAGUE ? [team, LEAGUE] : [LEAGUE];
  const keys: string[] = [];
  for (const w of who) for (const [level] of LEVELS) keys.push(keyFor(w, level, ctx));
  return keys;
}

// ---------------------------------------------------------------------------
// Rounding — the reference rounds to 3dp and the price is read off that number
// ---------------------------------------------------------------------------

/**
 * Python's `round(x, 3)`: correctly rounded on the exact value of the double, TIES TO EVEN.
 *
 * `Math.round(x * 1000) / 1000` is ties-away-from-zero and disagrees on real inputs — `2/32`
 * is exactly `0.0625`, which Python rounds to `0.062` and the naive form rounds to `0.063`.
 * At a 6x cap that is a visible difference in the payout on the tile, so it is done exactly.
 *
 * `toFixed(20)` is correctly rounded to 20 decimal places of the exact double. An adjacent
 * double differs by at least ~1e-17 for values in [0,1], so twenty places is enough to tell a
 * true tie from a near one.
 */
export function round3(x: number): number {
  if (!Number.isFinite(x)) return x;
  const neg = x < 0;
  const v = Math.abs(x);
  const s = v.toFixed(20);
  const dot = s.indexOf('.');
  const whole = s.slice(0, dot);
  const frac = s.slice(dot + 1);
  let n = Number(whole + frac.slice(0, 3));
  const rest = frac.slice(3);
  const lead = rest.charCodeAt(0) - 48;
  if (lead > 5) n += 1;
  else if (lead === 5) {
    if (/[1-9]/.test(rest.slice(1))) n += 1; // strictly more than half
    else if (n % 2 === 1) n += 1; // an exact tie goes to even
  }
  const out = n / 1000;
  return neg ? -out : out;
}

// ---------------------------------------------------------------------------
// Prediction — `TendencyModel.predict()`, given the rows already fetched
// ---------------------------------------------------------------------------

export type Prediction = {
  run: number;
  pass: number;
  samples: number;
  level: Level;
  basis: 'team' | 'league';
  context: TendencyContext;
  /** The reference's own bar: enough samples AND a specific level. */
  confident: boolean;
};

/**
 * The back-off, run against rows already in hand.
 *
 * `rows` must be the answers to `probeKeys(team, ctx)`, in that order. Pure and synchronous —
 * every await in this module happens before this is called, which is what lets the same code
 * serve a bundled object and a D1 batch.
 */
export function resolve(
  team: string,
  ctx: TendencyContext,
  rows: (Counts | null)[],
  minSamples: number = DEFAULT_MIN_SAMPLES,
): Prediction | null {
  const whos: ('team' | 'league')[] =
    team && team !== LEAGUE ? ['team', 'league'] : ['league'];
  let i = 0;
  for (const basis of whos) {
    for (const [level] of LEVELS) {
      const row = rows[i++];
      if (!row) continue;
      const n = (row.run || 0) + (row.pass || 0);
      if (n < minSamples) continue;
      return {
        run: round3(row.run / n),
        pass: round3(row.pass / n),
        samples: n,
        level,
        basis,
        context: ctx,
        // Reference: `n >= need * 3 and level in ("full", "no_clock", "no_score")`.
        confident:
          n >= minSamples * 3 &&
          (level === 'full' || level === 'no_clock' || level === 'no_score'),
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Confidence — three steps, both of them read off the reference's own predicates
// ---------------------------------------------------------------------------

/** The reference's `describe()` marks these two levels "broad". They are the guessing steps. */
const BROAD: ReadonlySet<Level> = new Set<Level>(['down', 'global']);

/**
 * Three steps, a total and disjoint partition, with no threshold invented here:
 *
 * | Step  | The reference predicate it is |
 * |-------|-------------------------------|
 * | `hi`  | `predict().confident` — ≥ 3x min_samples at a specific level |
 * | `lo`  | `describe()`'s "broad" — the model backed off to the down alone, or to everything |
 * | `mid` | neither: a specific enough context, on a sample the reference will not call strong |
 *
 * `confident` requires a level of `full`/`no_clock`/`no_score`, and `broad` is `down`/`global`,
 * so the two can never both fire. **`lo` is not a failure state.** It is the model saying it is
 * guessing, which is the thing it is allowed to say.
 *
 * `basis: 'league'` deliberately does NOT set the step. A league number at `full` on 40,000
 * plays is a strong number; the basis is carried on the pricing so a screen can say "league"
 * without the confidence chip pretending it is weak.
 */
export function confidenceOf(p: Prediction): Confidence {
  if (p.confident) return 'hi';
  if (BROAD.has(p.level)) return 'lo';
  return 'mid';
}

// ---------------------------------------------------------------------------
// The price
// ---------------------------------------------------------------------------

/**
 * `1 / p`, capped at 6. The number the tile multiplies a stake by.
 *
 * `p <= 0` — the model has seen this context ≥30 times and never once seen this call — prices
 * at the cap, because `stake / 0` is unbounded and the cap is the whole answer to unbounded.
 */
export function payoutPerMarble(p: number): number {
  if (!Number.isFinite(p) || p <= 0) return PAYOUT_CAP;
  return Math.min(PAYOUT_CAP, 1 / p);
}

/**
 * What a stake comes back as if the call lands. Whole Marbles.
 *
 * The reference is `Math.min(stake * 6, Math.round(stake / p))` and this matches it for every
 * `p > 0`. **The cap is on the multiple, not on the stake.**
 *
 * `p == null` is the reference's own guard for "no price was locked at the tap" and returns the
 * stake untouched — that is a missing-price path, not a pricing rule.
 */
export function payoutFor(stake: number, p: number | null | undefined): number {
  if (p == null) return stake;
  if (!Number.isFinite(p) || p <= 0) return stake * PAYOUT_CAP;
  return Math.min(stake * PAYOUT_CAP, Math.round(stake / p));
}

// ---------------------------------------------------------------------------
// The public call
// ---------------------------------------------------------------------------

export type SnapInput = {
  /** The id of the snap this price belongs to. One call per snap is enforced elsewhere (7.4). */
  snapId: string;
  /**
   * The offense, as the MODEL names teams. The trained file keys on the CFBD school name —
   * `Oklahoma`, `Boise State` — which is ESPN's `shortDisplayName`, NOT its `abbreviation`.
   * `OU` is not a key and silently costs you the team level. Null or unknown falls back to the
   * league, which is a defined answer and is marked `basis: 'league'`.
   */
  team: string | null;
  down: number | null;
  distance: number | null;
  yardsToGoal?: number | null;
  /** The offense's margin: its score minus the other side's. */
  scoreDiff?: number | null;
  period?: number | null;
  secondsLeft?: number | null;
  /** Epoch ms the snap clock closes. Passed straight through onto both offers. */
  closesAt: number;
};

export type SnapPricing = {
  snapId: string;
  /** Always exactly two, run first. Both carry the same confidence — it describes the model. */
  offers: [CallOffer, CallOffer];
  /** What answered, so a screen can say "league" or "1,204 plays" without re-deriving it. */
  model: {
    samples: number;
    level: Level;
    basis: 'team' | 'league';
    confident: boolean;
    context: TendencyContext;
  };
};

/** Turn a resolved prediction into the two tiles. */
export function offersFrom(p: Prediction, snapId: string, closesAt: number): SnapPricing {
  const confidence = confidenceOf(p);
  const one = (side: CallSide, prob: number): CallOffer => ({
    snapId,
    side,
    p: prob,
    payoutPerMarble: payoutPerMarble(prob),
    confidence,
    closesAt,
  });
  return {
    snapId,
    offers: [one('run', p.run), one('pass', p.pass)],
    model: {
      samples: p.samples,
      level: p.level,
      basis: p.basis,
      confident: p.confident,
      context: p.context,
    },
  };
}

/**
 * Price a snap from an already-fetched set of rows. Pure, synchronous, no source.
 * `rows` are the answers to `probeKeys()`, in order.
 */
export function priceFromRows(
  input: SnapInput,
  rows: (Counts | null)[],
  minSamples: number = DEFAULT_MIN_SAMPLES,
): SnapPricing | null {
  const team = input.team || LEAGUE;
  const ctx = contextOf(
    input.down,
    input.distance,
    input.yardsToGoal ?? null,
    input.scoreDiff ?? null,
    input.period ?? null,
    input.secondsLeft ?? null,
  );
  const p = resolve(team, ctx, rows, minSamples);
  return p ? offersFrom(p, input.snapId, input.closesAt) : null;
}

/**
 * **The one entry point.** Price the run tile and the pass tile for a situation, before the snap.
 *
 * `null` means the model will not commit — no source loaded, or the source answered nothing at
 * any level. That is a real state and the screen shows a call card with no price rather than a
 * coin flip. It is not an error and it is not a 50/50.
 *
 * Awaits the source once, then does no I/O. Safe to call on every situation change.
 */
export async function priceSnap(
  input: SnapInput,
  source: TendencySource,
): Promise<SnapPricing | null> {
  const team = input.team || LEAGUE;
  const ctx = contextOf(
    input.down,
    input.distance,
    input.yardsToGoal ?? null,
    input.scoreDiff ?? null,
    input.period ?? null,
    input.secondsLeft ?? null,
  );
  const rows = await source.get(probeKeys(team, ctx));
  const p = resolve(team, ctx, rows, source.minSamples ?? DEFAULT_MIN_SAMPLES);
  return p ? offersFrom(p, input.snapId, input.closesAt) : null;
}

/** The same call for a source that answers synchronously — a bundled model. */
export function priceSnapSync(input: SnapInput, source: TendencySource): SnapPricing | null {
  const team = input.team || LEAGUE;
  const ctx = contextOf(
    input.down,
    input.distance,
    input.yardsToGoal ?? null,
    input.scoreDiff ?? null,
    input.period ?? null,
    input.secondsLeft ?? null,
  );
  const rows = source.get(probeKeys(team, ctx));
  if (typeof (rows as Promise<unknown>)?.then === 'function') {
    throw new TypeError('priceSnapSync was given an async TendencySource — use priceSnap');
  }
  const p = resolve(team, ctx, rows as (Counts | null)[], source.minSamples ?? DEFAULT_MIN_SAMPLES);
  return p ? offersFrom(p, input.snapId, input.closesAt) : null;
}
