/* F1 PICKS - who qualifies 1-2-3, who finishes 1-2-3, fastest lap, and more.
 *
 * Jason, 2026-09-12: "F1, pick qualifying in p1, p2 and p3. 1st, 2nd and 3rd."
 * Then "Add final 1/2/3 fastest lap. Etc."
 *
 * 🔴 SCORED IN POINTS, NOT MARBLES. A Marbles price is "the model's chance,
 * shown before the tap", and there is no model of a driver's chance yet - an
 * invented one would be a number set in the same type as a real one. Points
 * are honest today: the tile says what a pick is worth before it is made (the
 * shape the official F1 Predict proves out), and every pick settles off ESPN's
 * own session results. The official game asks pole only; qualifying top 3 is
 * ours.
 *
 * Shared by the Worker and the browser (built to /src/lib/f1.js). Pure - it is
 * tested on captured payloads: fixtures/feed/espn-f1-scoreboard-*.json and
 * fixtures/f1/italian-gp-2026-race-core.json.
 */

export type F1Driver = {
  id: string; name: string; short: string;
  team: string | null; color: string | null; number: string | null;
};
export type F1Kind = 'practice' | 'qual' | 'sprintQual' | 'sprint' | 'race';
export type F1Session = {
  id: string; abbr: string; kind: F1Kind; label: string;
  start: number; state: 'pre' | 'live' | 'final';
  /** Driver ids in finishing order - empty until the session has one. */
  order: string[];
};
export type F1Event = {
  id: string; name: string; circuit: string | null; city: string | null;
  start: number; end: number; sessions: F1Session[]; drivers: F1Driver[];
};

/* ESPN's session abbreviations, read off all 25 events of 2026: a normal
   weekend is FP1, FP2, FP3, Qual, Race; a sprint weekend is FP1, SS (sprint
   qualifying), SR (the sprint), Qual, Race. */
const KIND: Record<string, F1Kind> = { FP1: 'practice', FP2: 'practice', FP3: 'practice', Qual: 'qual', SS: 'sprintQual', SR: 'sprint', Race: 'race' };
const LABEL: Record<string, string> = { FP1: 'Practice 1', FP2: 'Practice 2', FP3: 'Practice 3', Qual: 'Qualifying', SS: 'Sprint qualifying', SR: 'Sprint', Race: 'Race' };

/* 🔴 QUALIFYING ENDS "SESSION COMPLETE", NOT "FINAL" - and with state "in".
   Seen on the Spanish GP (2026-09-12): practice read STATUS_FINAL / post, and
   qualifying, over, read STATUS_SESSION_COMPLETE / in. Reading the state alone
   would have held the qualifying picks open forever. */
function stateOf(status: any): 'pre' | 'live' | 'final' {
  const name = String(status?.type?.name || '');
  if (name === 'STATUS_FINAL' || name === 'STATUS_SESSION_COMPLETE' || status?.type?.completed === true) return 'final';
  if (name === 'STATUS_SCHEDULED' || status?.type?.state === 'pre') return 'pre';
  return 'live';
}

const surname = (a: any) => {
  const s = String(a?.shortName || '');
  const cut = s.indexOf('. ');
  return cut > 0 ? s.slice(cut + 2) : (String(a?.displayName || '').split(' ').slice(1).join(' ') || s);
};

/** The current event off ESPN's F1 scoreboard. `vehicles` (car number, team,
 *  team colour by driver id) comes from the core API - the scoreboard has none. */
export function parseF1(payload: any, vehicles: Record<string, any> = {}): F1Event | null {
  const ev = (payload?.events || [])[0];
  if (!ev) return null;
  const drivers = new Map<string, F1Driver>();
  const sessions: F1Session[] = [];
  for (const c of ev.competitions || []) {
    const abbr = String(c.type?.abbreviation || '');
    if (!KIND[abbr]) continue;
    const state = stateOf(c.status);
    const cs = (c.competitors || []).slice();
    for (const x of cs) {
      const id = String(x.id);
      if (!drivers.has(id)) {
        const v = vehicles[id] || {};
        drivers.set(id, {
          id, name: String(x.athlete?.displayName || ''), short: surname(x.athlete),
          team: v.team || v.manufacturer || null,
          color: typeof v.teamColor === 'string' && /^[0-9a-fA-F]{6}$/.test(v.teamColor) ? v.teamColor.toLowerCase() : null,
          number: v.number != null ? String(v.number) : null
        });
      }
    }
    /* An order only once there is one: a scheduled race lists its drivers in
       grid order with no `order`, and that is not a result. */
    const ordered = cs.filter((x: any) => Number.isFinite(Number(x.order)) && Number(x.order) > 0)
      .sort((a: any, b: any) => Number(a.order) - Number(b.order)).map((x: any) => String(x.id));
    sessions.push({
      id: String(c.id), abbr, kind: KIND[abbr], label: LABEL[abbr],
      start: Date.parse(c.date), state, order: state === 'pre' ? [] : ordered
    });
  }
  sessions.sort((a, b) => a.start - b.start);
  return {
    id: String(ev.id), name: String(ev.name || ''),
    circuit: ev.circuit?.fullName || null, city: ev.circuit?.address?.city || null,
    start: Date.parse(ev.date), end: Date.parse(ev.endDate || ev.date),
    sessions, drivers: [...drivers.values()]
  };
}

/** Retirements and the fastest lap, off a finished race's core documents: each
 *  competitor's status (STATUS_CLASSIFIED or STATUS_RETIRED...) and statistics.
 *  Only the driver who set the fastest lap carries a `fastestLap` stat. */
export function raceExtras(core: { competitors: { competitor: any; status: any; statistics: any }[] }) {
  let fastest: string | null = null;
  let retired = 0;
  for (const c of core?.competitors || []) {
    const st = String(c.status?.type?.name || c.competitor?.status?.type?.name || '');
    if (st && st !== 'STATUS_CLASSIFIED') retired++;
    for (const cat of c.statistics?.splits?.categories || []) {
      for (const s of cat.stats || []) {
        if (s.name === 'fastestLap' && s.displayValue) fastest = String(c.competitor?.id);
      }
    }
  }
  return { fastest, retired };
}

/* ---- the picks and what they are worth ---- */

/** What each pick scores, printed on the screen before it is made. */
export const POINTS = { exact: 3, inTop3: 1, fastest: 3, poleWins: 1, dnf: 2 };

export type F1Picks = {
  qual?: string[]; sprint?: string[]; race?: string[];
  fastest?: string; poleWins?: 'yes' | 'no'; dnf?: '0' | '1-2' | '3+';
};

export function dnfBand(n: number): '0' | '1-2' | '3+' {
  return n <= 0 ? '0' : n <= 2 ? '1-2' : '3+';
}

/** Three slots against the real top three: the exact spot scores 3, the right
 *  driver in the wrong spot scores 1. */
export function scoreTop3(pick: string[] | undefined, actual: string[]): number[] | null {
  if (!actual || actual.length < 3) return null;
  const top = actual.slice(0, 3);
  return [0, 1, 2].map((i) => {
    const d = pick && pick[i];
    if (!d) return 0;
    return top[i] === d ? POINTS.exact : top.includes(d) ? POINTS.inTop3 : 0;
  });
}

/** Which session a pick belongs to - it locks when that session starts. */
export function sessionFor(ev: F1Event, key: keyof F1Picks): F1Session | null {
  const kind: F1Kind = key === 'qual' ? 'qual' : key === 'sprint' ? 'sprint' : 'race';
  return ev.sessions.find((s) => s.kind === kind) || null;
}

export function isPickLocked(ev: F1Event, key: keyof F1Picks, now: number): boolean {
  const s = sessionFor(ev, key);
  if (!s) return true;
  return s.state !== 'pre' || now >= s.start;
}

/** Everything settled so far, per pick, and the weekend's total. A pick whose
 *  session has not finished is null - never zero, which would read as a miss. */
export function scoreWeekend(ev: F1Event, picks: F1Picks, extras: { fastest: string | null; retired: number | null } | null) {
  const by = (kind: F1Kind) => ev.sessions.find((s) => s.kind === kind);
  const q = by('qual'), sr = by('sprint'), r = by('race');
  const qualFinal = q && q.state === 'final' ? q.order : null;
  const raceFinal = r && r.state === 'final' ? r.order : null;
  const out = {
    qual: qualFinal ? scoreTop3(picks.qual, qualFinal) : null,
    sprint: sr && sr.state === 'final' ? scoreTop3(picks.sprint, sr.order) : null,
    race: raceFinal ? scoreTop3(picks.race, raceFinal) : null,
    fastest: raceFinal && extras && extras.fastest ? (picks.fastest === extras.fastest ? POINTS.fastest : 0) : null,
    poleWins: raceFinal && qualFinal && raceFinal.length && qualFinal.length
      ? ((picks.poleWins === 'yes') === (raceFinal[0] === qualFinal[0]) && picks.poleWins ? POINTS.poleWins : 0) : null,
    dnf: raceFinal && extras && Number.isFinite(extras.retired) ? (picks.dnf === dnfBand(Number(extras.retired)) ? POINTS.dnf : 0) : null,
    total: 0
  };
  const sum = (v: any) => Array.isArray(v) ? v.reduce((a: number, b: number) => a + b, 0) : (typeof v === 'number' ? v : 0);
  out.total = sum(out.qual) + sum(out.sprint) + sum(out.race) + sum(out.fastest) + sum(out.poleWins) + sum(out.dnf);
  return out;
}
