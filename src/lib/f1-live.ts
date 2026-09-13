/* F1 LIVE PICKS - called during the race, replayed on a finished one.
 *
 * Jason, 2026-09-12: "build the f1 live picks on the free history". OpenF1's
 * history is free (every session since 2023, no key); its live feed is the
 * €9.90 tier and non-commercial. So the picks are built and proven here on a
 * finished race, replayed lap by lap as if it were live - and the same
 * functions settle a live race the day there is a live feed to hand them.
 *
 * Two halves, both pure:
 *   buildTimeline(rows)   OpenF1's raw rows for one race -> a few KB: when the
 *                         leader finished each lap, the running order and gaps
 *                         at that moment, every stop, every pass that stuck,
 *                         every new fastest lap, every safety car and red flag.
 *   offers / settle       what can be called at lap L, and how a call made at
 *                         lap L stands at lap N - using nothing after lap N.
 *
 * 🔴 SCORED IN POINTS, like the weekend picks (src/lib/f1.ts says why). What a
 * pick is worth is on the card before the tap.
 *
 * 🔴 ONE VOID RULE, as everywhere in this app: a race stopped with a red flag
 * while a pick is open voids that pick - except the safety-car pick, which a
 * red flag answers "yes". A pick nobody can settle (no stop before the flag, a
 * driver in the pair retires, a stop decides a pass) is void too. Void is
 * never a miss.
 *
 * Tested on fixtures/f1/openf1-11361/ (Monza 2026: red flag on lap 3, a VSC on
 * lap 28, nine stops) and fixtures/f1/openf1-11342/ (Hungary 2026: 44 stops,
 * the undercut race), both captured whole from OpenF1 on 2026-09-12.
 */

export type TLDriver = { n: number; acr: string; name: string; team: string | null; color: string | null };
export type Timeline = {
  /** 2 added `passes`. A cached v1 is rebuilt, never served. */
  v: 2;
  session: number; meeting: string; circuit: string | null; date: string | null;
  laps: number;
  drivers: TLDriver[];
  /** ends[L] = ms when the leader completed lap L. ends[0] = lights out. */
  ends: number[];
  /** order[L] = driver numbers, P1 first, at ends[L]; retired cars dropped. */
  order: number[][];
  /** gaps[L][i] = order[L][i]'s gap to the leader in seconds, null when lapped or unknown. */
  gaps: (number | null)[][];
  pits: { t: number; lap: number; d: number; lane: number | null; stop: number | null }[];
  /** On-track passes that stuck: `by` took position `pos` from `on`. */
  passes: { t: number; by: number; on: number; pos: number }[];
  bests: { t: number; lap: number; d: number; s: number }[];
  neutral: { t: number; lap: number; kind: 'SC' | 'VSC' | 'RED' }[];
  /** [red flag, restart] pairs - picks open across one are void. */
  stops: [number, number][];
  result: number[];
  retired: { d: number; laps: number }[];
};

const ms = (s: any) => (s ? Date.parse(String(s)) : NaN);
const num = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/* A car held in the pit lane for more than two minutes is a car parked under a
   red flag, not a stop. Monza 2026: 21 cars, 1,839 to 1,846 seconds each. */
const PARKED = 120;

export function buildTimeline(rows: {
  session: any; drivers: any[]; laps: any[]; pit: any[]; race_control: any[];
  position: any[]; intervals: any[]; session_result: any[]; overtakes?: any[]; meeting?: string | null;
}): Timeline {
  const s = rows.session || {};
  const drivers: TLDriver[] = (rows.drivers || []).map((d) => ({
    n: Number(d.driver_number), acr: String(d.name_acronym || d.driver_number),
    name: String(d.broadcast_name || d.full_name || ''),
    team: d.team_name || null,
    color: typeof d.team_colour === 'string' && /^[0-9a-fA-F]{6}$/.test(d.team_colour) ? d.team_colour.toLowerCase() : null
  }));

  /* Laps by driver, in order, so a lap with no duration ends where the next begins. */
  const byDriver = new Map<number, any[]>();
  for (const l of rows.laps || []) {
    const d = Number(l.driver_number);
    if (!byDriver.has(d)) byDriver.set(d, []);
    byDriver.get(d)!.push(l);
  }
  const lapEnds: { d: number; lap: number; t: number; s: number | null }[] = [];
  for (const [d, ls] of byDriver) {
    ls.sort((a, b) => a.lap_number - b.lap_number);
    ls.forEach((l, i) => {
      const start = ms(l.date_start);
      const dur = num(l.lap_duration);
      const next = ls[i + 1];
      const t = Number.isFinite(start) && dur != null ? start + dur * 1000
        : next && next.lap_number === l.lap_number + 1 ? ms(next.date_start) : NaN;
      if (Number.isFinite(t)) lapEnds.push({ d, lap: l.lap_number, t, s: dur });
    });
  }
  const laps = Math.max(0, ...(rows.laps || []).map((l) => Number(l.lap_number) || 0));
  const ends: number[] = [];
  ends[0] = Math.min(...(rows.laps || []).filter((l) => l.lap_number === 1).map((l) => ms(l.date_start)).filter(Number.isFinite));
  for (let L = 1; L <= laps; L++) {
    const ts = lapEnds.filter((x) => x.lap === L).map((x) => x.t);
    ends[L] = ts.length ? Math.min(...ts) : ends[L - 1];
  }

  const result = (rows.session_result || []).filter((r) => r.position != null)
    .sort((a, b) => a.position - b.position).map((r) => Number(r.driver_number));
  const retired = (rows.session_result || []).filter((r) => r.dnf || r.dns)
    .map((r) => ({ d: Number(r.driver_number), laps: Number(r.number_of_laps) || 0 }));
  const outAt = new Map(retired.map((r) => [r.d, r.laps]));

  /* The latest value at or before t, per driver. Rows arrive in time order. */
  const series = (list: any[], pick: (r: any) => any) => {
    const m = new Map<number, { t: number; v: any }[]>();
    for (const r of list || []) {
      const d = Number(r.driver_number);
      if (!m.has(d)) m.set(d, []);
      m.get(d)!.push({ t: ms(r.date), v: pick(r) });
    }
    for (const v of m.values()) v.sort((a, b) => a.t - b.t);
    return (d: number, t: number) => {
      const v = m.get(d);
      if (!v) return undefined;
      let lo = 0, hi = v.length - 1, at = -1;
      while (lo <= hi) { const mid = (lo + hi) >> 1; if (v[mid].t <= t) { at = mid; lo = mid + 1; } else hi = mid - 1; }
      return at < 0 ? undefined : v[at].v;
    };
  };
  const posAt = series(rows.position, (r) => r.position);
  const gapAt = series(rows.intervals, (r) => r.gap_to_leader);

  /* A second of grace past the line: the timing screen updates as the car crosses. */
  const GRACE = 1000;
  const order: number[][] = [], gaps: (number | null)[][] = [];
  for (let L = 0; L <= laps; L++) {
    const t = ends[L] + GRACE;
    const running = drivers.map((d) => d.n).filter((n) => !(outAt.has(n) && (outAt.get(n) as number) < L));
    const o = running.map((n) => ({ n, p: Number(posAt(n, t)) }))
      .filter((x) => Number.isFinite(x.p) && x.p > 0)
      .sort((a, b) => a.p - b.p).map((x) => x.n);
    order.push(o);
    gaps.push(o.map((n, i) => (i === 0 ? 0 : num(gapAt(n, t)))));
  }

  const rc = (rows.race_control || []).slice().sort((a, b) => ms(a.date) - ms(b.date));
  const neutral: Timeline['neutral'] = [];
  const stops: [number, number][] = [];
  for (const m of rc) {
    const msg = String(m.message || '');
    const t = ms(m.date);
    if (m.category === 'SafetyCar' && /DEPLOYED/.test(msg)) {
      neutral.push({ t, lap: Number(m.lap_number) || 0, kind: /VSC|VIRTUAL/.test(msg) ? 'VSC' : 'SC' });
    /* 🔴 \b, because "CHEQUERED FLAG" contains "RED FLAG" - without it every
       race ended on a red flag and voided every pick open at the finish. */
    } else if (/\bRED FLAG\b/.test(msg) || m.flag === 'RED') {
      neutral.push({ t, lap: Number(m.lap_number) || 0, kind: 'RED' });
      const back = rc.find((x) => ms(x.date) > t && x.category === 'SessionStatus' && /STARTED/.test(String(x.message || '')));
      /* Never Infinity: it goes through JSON to the phone, and comes back null. */
      stops.push([t, back ? ms(back.date) : Number.MAX_SAFE_INTEGER]);
    }
  }
  const stopped = (t: number) => stops.some(([a, b]) => t >= a && t <= b);

  const pits = (rows.pit || []).map((p) => ({
    t: ms(p.date), lap: Number(p.lap_number) || 0, d: Number(p.driver_number),
    lane: num(p.lane_duration ?? p.pit_duration), stop: num(p.stop_duration)
  })).filter((p) => Number.isFinite(p.t) && !(p.lane != null && p.lane > PARKED) && !stopped(p.t))
    .sort((a, b) => a.t - b.t);

  /* 🔴 OPENF1'S OVERTAKES ARE NOT ALL PASSES. Monza 2026 has 334 of them, and
     measured against the same race: 25 fall within a minute of a stop by one
     of the two cars (everybody "passes" LAW while LAW is in the pit lane), and
     one pair swaps 17 times - PIA past HAM 9, HAM past PIA 8 - which is the
     timing loops, not the race. So a pass counts only if no stop by either car
     is near it, the race is not stopped, and the passer is still ahead of the
     passed car on the timing screen at the next lap end. */
  /* A pit row's time is the car LEAVING the lane, not entering it: LAW's
     Monza stop reads 13:56:37, 28 s into his out-lap, and the raw feed has
     cars "passing" him from 59 s before it. So the window runs back the lane
     time plus half a minute, and half a minute on. */
  const nearStop = (d: number, t: number) => pits.some((p) => p.d === d
    && t >= p.t - ((p.lane ?? 30) + 30) * 1000 && t <= p.t + 30000);
  const passes: Timeline['passes'] = [];
  for (const o of (rows.overtakes || []).slice().sort((a, b) => ms(a.date) - ms(b.date))) {
    const t = ms(o.date), by = Number(o.overtaking_driver_number), on = Number(o.overtaken_driver_number);
    if (!(t > ends[0] && t <= ends[laps]) || stopped(t) || nearStop(by, t) || nearStop(on, t)) continue;
    let L = 0;
    while (L < laps && ends[L] < t + GRACE) L++;
    const ord = order[L], i = ord.indexOf(by), j = ord.indexOf(on);
    if (i < 0 || j < 0 || i > j) continue;
    passes.push({ t, by, on, pos: Number(o.position) || 0 });
  }

  const bests: Timeline['bests'] = [];
  let best = Infinity;
  for (const x of lapEnds.filter((x) => x.s != null).sort((a, b) => a.t - b.t)) {
    if ((x.s as number) < best) { best = x.s as number; bests.push({ t: x.t, lap: x.lap, d: x.d, s: x.s as number }); }
  }

  return {
    v: 2, session: Number(s.session_key) || 0,
    meeting: rows.meeting || String(s.country_name || s.location || ''),
    circuit: s.circuit_short_name || null, date: s.date_start || null,
    laps, drivers, ends, order, gaps, pits, passes, bests, neutral, stops, result, retired
  };
}

/* ---- calling it ---- */

export type LiveKind = 'pitNext' | 'undercut' | 'fastestNext' | 'passNext' | 'pass5' | 'neutral10' | 'leader10' | 'gap5';
/** What each call scores, on the card before the tap. A driver out of twenty
 *  is worth more than a yes or a no. */
export const LIVE_POINTS: Record<LiveKind, number> = {
  pitNext: 3, undercut: 1, fastestNext: 3, passNext: 3, pass5: 1, neutral10: 1, leader10: 1, gap5: 1
};
export type LivePick = { kind: LiveKind; lap: number; choice: string };
export type Offer = {
  kind: LiveKind; lap: number; q: string; note: string | null;
  options: [string, string][]; points: number; by: number | null;
};
export type Settled = { state: 'open' | 'hit' | 'miss' | 'void'; points: number; answer: string | null; at: number | null; why?: string };

export const lapTime = (s: number) => {
  const m = Math.floor(s / 60);
  const r = (s - m * 60).toFixed(3).padStart(6, '0');
  return m ? m + ':' + r : r;
};

const acr = (tl: Timeline, n: number) => (tl.drivers.find((d) => d.n === n) || { acr: String(n) }).acr;
/** The lap in which the moment t fell - the first lap whose end is at or after it. */
export function lapOf(tl: Timeline, t: number): number {
  for (let L = 0; L <= tl.laps; L++) if (tl.ends[L] >= t) return L;
  return tl.laps;
}
export function bestAt(tl: Timeline, t: number) {
  let b = null;
  for (const x of tl.bests) if (x.t <= t) b = x; else break;
  return b;
}

/** Adjacent cars in the top ten whose gap falls in [lo, hi] seconds - the
 *  first such pair, as [ahead, behind, gap]. */
function pairIn(tl: Timeline, L: number, lo: number, hi: number): [number, number, number] | null {
  const o = tl.order[L], g = tl.gaps[L];
  for (let i = 1; i < Math.min(o.length, 10); i++) {
    const a = g[i - 1], b = g[i];
    if (a == null || b == null) continue;
    const gap = b - a;
    if (gap >= lo && gap <= hi) return [o[i - 1], o[i], gap];
  }
  return null;
}
/* The gap call asks about 1.2 to 3 s - from 1.2, not 1, because "Now 1.0 s -
   within 1 s?" is a question a rounding answers. The pass call asks about a
   car already inside a second, where a pass is actually on. */
const gapPair = (tl: Timeline, L: number) => pairIn(tl, L, 1.2, 3);
const passPair = (tl: Timeline, L: number) => pairIn(tl, L, 0, 1);

/** The undercut on offer at lap L: a car that stopped during lap L from
 *  within 3.5 s behind a car that has not stopped this lap. */
function undercutAt(tl: Timeline, L: number): { d: number; r: number; t: number } | null {
  if (L < 1) return null;
  const prev = tl.order[L - 1], g = tl.gaps[L - 1];
  for (const p of tl.pits) {
    if (p.t <= tl.ends[L - 1] || p.t > tl.ends[L]) continue;
    const i = prev.indexOf(p.d);
    if (i < 1) continue;
    const r = prev[i - 1];
    const gap = g[i] != null && g[i - 1] != null ? (g[i] as number) - (g[i - 1] as number) : null;
    if (gap == null || gap > 3.5) continue;
    if (tl.pits.some((x) => x.d === r && x.t > tl.ends[L - 1] && x.t <= p.t)) continue;
    return { d: p.d, r, t: p.t };
  }
  return null;
}

export function offers(tl: Timeline, L: number): Offer[] {
  const out: Offer[] = [];
  if (L < 0 || L >= tl.laps) return out;
  const running = tl.order[L];
  const drv = running.map((n) => [String(n), acr(tl, n)] as [string, string]);
  const yn: [string, string][] = [['yes', 'Yes'], ['no', 'No']];
  if (running.length) {
    out.push({ kind: 'pitNext', lap: L, q: 'Who pits next?', note: 'No stop before the flag is void.',
      options: drv, points: LIVE_POINTS.pitNext, by: null });
  }
  const u = undercutAt(tl, L);
  if (u) {
    out.push({ kind: 'undercut', lap: L, q: 'Undercut: ' + acr(tl, u.d) + ' stopped behind ' + acr(tl, u.r) + '. Ahead once ' + acr(tl, u.r) + ' stops?',
      note: 'If ' + acr(tl, u.r) + ' does not stop, it is void.', options: yn, points: LIVE_POINTS.undercut, by: null });
  }
  const b = bestAt(tl, tl.ends[L]);
  if (b && L >= 1) {
    out.push({ kind: 'fastestNext', lap: L, q: 'Who sets the next fastest lap?',
      note: 'To beat: ' + acr(tl, b.d) + ' ' + lapTime(b.s) + ' (lap ' + b.lap + ')',
      options: [...drv, ['none', 'Nobody beats it']], points: LIVE_POINTS.fastestNext, by: null });
  }
  if (L >= 1 && running.length) {
    out.push({ kind: 'passNext', lap: L, q: 'Who makes the next pass in the top ten?',
      note: 'On track - places won in the pits do not count.', options: drv, points: LIVE_POINTS.passNext, by: null });
  }
  const pp = L >= 1 && L + 5 <= tl.laps ? passPair(tl, L) : null;
  if (pp) {
    out.push({ kind: 'pass5', lap: L, q: 'Does ' + acr(tl, pp[1]) + ' pass ' + acr(tl, pp[0]) + ' by lap ' + (L + 5) + '?',
      note: 'Now ' + pp[2].toFixed(1) + ' s behind. A stop by either is void.', options: yn, points: LIVE_POINTS.pass5, by: L + 5 });
  }
  if (L + 10 <= tl.laps) {
    out.push({ kind: 'neutral10', lap: L, q: 'Safety car, VSC or red flag by lap ' + (L + 10) + '?',
      note: null, options: yn, points: LIVE_POINTS.neutral10, by: L + 10 });
  }
  if (L >= 1 && L + 10 <= tl.laps && running.length) {
    out.push({ kind: 'leader10', lap: L, q: 'Does ' + acr(tl, running[0]) + ' still lead after lap ' + (L + 10) + '?',
      note: null, options: yn, points: LIVE_POINTS.leader10, by: L + 10 });
  }
  const pair = L >= 1 && L + 5 <= tl.laps ? gapPair(tl, L) : null;
  if (pair) {
    out.push({ kind: 'gap5', lap: L, q: 'After lap ' + (L + 5) + ', is ' + acr(tl, pair[1]) + ' within 1 s of ' + acr(tl, pair[0]) + '?',
      note: 'Now ' + pair[2].toFixed(1) + ' s', options: yn, points: LIVE_POINTS.gap5, by: L + 5 });
  }
  return out;
}

/** How a call made at pick.lap stands once the race has reached lap nowLap.
 *  Nothing after ends[nowLap] is read - that is what makes a replay honest. */
export function settle(tl: Timeline, pick: LivePick, nowLap: number): Settled {
  const from = tl.ends[pick.lap];
  const until = tl.ends[Math.min(nowLap, tl.laps)];
  const open: Settled = { state: 'open', points: 0, answer: null, at: null };
  const pts = LIVE_POINTS[pick.kind];
  const done = (hit: boolean, answer: string, t: number): Settled =>
    ({ state: hit ? 'hit' : 'miss', points: hit ? pts : 0, answer, at: lapOf(tl, t) });
  const redIn = (to: number) => tl.stops.find(([a]) => a > from && a <= to);
  const voided = (t: number, why: string): Settled => ({ state: 'void', points: 0, answer: null, at: lapOf(tl, t), why });
  const passes = tl.passes || [];

  /* The moment the pick would settle, or Infinity if the race has not got there. */
  let decided: Settled | null = null, when = Infinity;

  if (pick.kind === 'pitNext') {
    const p = tl.pits.find((x) => x.t > from);
    if (p) { when = p.t; decided = done(String(p.d) === pick.choice, acr(tl, p.d), p.t); }
    else { when = tl.ends[tl.laps]; decided = voided(when, 'No stop before the flag'); }
  } else if (pick.kind === 'undercut') {
    const u = undercutAt(tl, pick.lap);
    const rp = u ? tl.pits.find((x) => x.d === u.r && x.t > u.t) : null;
    if (!u) { when = from; decided = voided(from, 'No undercut to settle'); }
    else if (!rp) { when = tl.ends[tl.laps]; decided = voided(when, acr(tl, u.r) + ' did not stop'); }
    else {
      const L2 = Math.min(lapOf(tl, rp.t) + 1, tl.laps);
      when = tl.ends[L2];
      const i = tl.order[L2].indexOf(u.d), j = tl.order[L2].indexOf(u.r);
      if (i < 0 || j < 0) decided = voided(when, 'A car is out');
      else decided = done((i < j) === (pick.choice === 'yes'),
        i < j ? acr(tl, u.d) + ' came out ahead' : acr(tl, u.r) + ' stayed ahead', when);
    }
  } else if (pick.kind === 'fastestNext') {
    const b = tl.bests.find((x) => x.t > from);
    if (b) { when = b.t; decided = done(String(b.d) === pick.choice, acr(tl, b.d) + ' ' + lapTime(b.s), b.t); }
    else { when = tl.ends[tl.laps]; decided = done(pick.choice === 'none', 'Nobody', when); }
  } else if (pick.kind === 'passNext') {
    const p = passes.find((x) => x.t > from && x.pos <= 10);
    if (p) { when = p.t; decided = done(String(p.by) === pick.choice, acr(tl, p.by) + ' past ' + acr(tl, p.on), p.t); }
    else { when = tl.ends[tl.laps]; decided = voided(when, 'No pass before the flag'); }
  } else if (pick.kind === 'pass5') {
    const pair = passPair(tl, pick.lap);
    const end = tl.ends[Math.min(pick.lap + 5, tl.laps)];
    if (!pair) { when = end; decided = voided(end, 'No pair to settle'); }
    else {
      const [ahead, behind] = pair;
      const p = passes.find((x) => x.t > from && x.t <= end && x.by === behind && x.on === ahead);
      const stop = tl.pits.find((x) => (x.d === ahead || x.d === behind) && x.t > from && x.t <= end);
      if (stop && (!p || stop.t < p.t)) { when = stop.t; decided = voided(stop.t, 'A stop decided it'); }
      else if (p) { when = p.t; decided = done(pick.choice === 'yes', acr(tl, behind) + ' passed', p.t); }
      else { when = end; decided = done(pick.choice === 'no', 'No pass', end); }
    }
  } else if (pick.kind === 'neutral10') {
    const end = tl.ends[Math.min(pick.lap + 10, tl.laps)];
    const n = tl.neutral.find((x) => x.t > from && x.t <= end);
    if (n) { when = n.t; decided = done(pick.choice === 'yes', n.kind === 'RED' ? 'Red flag' : n.kind, n.t); }
    else { when = end; decided = done(pick.choice === 'no', 'None', end); }
    /* The one pick a red flag answers rather than voids. */
    return when <= until ? decided : open;
  } else if (pick.kind === 'leader10') {
    const L2 = Math.min(pick.lap + 10, tl.laps);
    const was = tl.order[pick.lap][0], now = tl.order[L2][0];
    when = tl.ends[L2];
    decided = done((was === now) === (pick.choice === 'yes'), acr(tl, now) + ' leads', when);
  } else if (pick.kind === 'gap5') {
    const pair = gapPair(tl, pick.lap);
    const L2 = Math.min(pick.lap + 5, tl.laps);
    when = tl.ends[L2];
    if (!pair) decided = voided(when, 'No pair to settle');
    else {
      const i = tl.order[L2].indexOf(pair[0]), j = tl.order[L2].indexOf(pair[1]);
      const a = i < 0 ? null : tl.gaps[L2][i], b = j < 0 ? null : tl.gaps[L2][j];
      if (a == null || b == null) decided = voided(when, 'A car in the pair is out or lapped');
      else {
        const gap = Math.abs(b - a);
        decided = done((gap < 1) === (pick.choice === 'yes'), gap.toFixed(1) + ' s', when);
      }
    }
  }

  const red = redIn(when);
  if (red && red[0] <= until) return voided(red[0], 'Red flag - the race was stopped');
  return decided && when <= until ? decided : open;
}

/** Every call's standing and the total, as of lap nowLap. */
export function scoreLive(tl: Timeline, picks: LivePick[], nowLap: number) {
  const rows = picks.map((p) => ({ pick: p, res: settle(tl, p, nowLap) }));
  return { rows, total: rows.reduce((a, r) => a + r.res.points, 0) };
}
