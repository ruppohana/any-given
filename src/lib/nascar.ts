/* NASCAR RACE DAY - what a group picks, what it is worth, how it settles.
 *
 * Jason, 2026-09-12: "do nascar next". A NASCAR group plays race day in points,
 * the way an F1 group plays the weekend (src/lib/f1.ts), and it runs on ESPN's
 * race results only - NOT NASCAR's own live feed, whose terms ban scraping
 * (research page, NASCAR deep dive). Everything here comes from two ESPN reads:
 *
 *   site.web.api  .../racing/nascar-premier/scoreboard   the race, its status, the finishing order
 *   core API      .../events/<e>/competitions/<c>        each car's number, make, team and
 *                                                        STARTING position (startOrder)
 *
 * THE PICKS, all locked at the green flag (the race's start time):
 *   race top three      exact spot 3 · right driver, wrong spot 1
 *   winning make        Chevrolet, Ford or Toyota - 2
 *   pole-sitter wins?   yes / no - 1 (the pole won 8 of 31 Cup races in 2026)
 *   dark horse          a driver who starts 11th or worse finishes in the top ten - 2
 *
 * 🔴 POINTS, NOT MARBLES - src/lib/f1.ts says why. What each pick is worth is on
 * the screen before it is made. Pure: tested on captured payloads
 * (fixtures/nascar/).
 */

export type NDriver = {
  id: string; name: string; short: string;
  number: string | null; make: string | null; team: string | null;
  /** Starting position; 1 is the pole. Null when the grid is not set. */
  start: number | null;
};
export type NEvent = {
  id: string; compId: string; name: string; track: string | null;
  start: number; state: 'pre' | 'live' | 'final';
  /** Driver ids in finishing order - empty until the race is final. */
  order: string[];
  drivers: NDriver[];
};
export type NPicks = { race?: string[]; make?: string; poleWins?: 'yes' | 'no'; darkHorse?: string };

export const MAKES = ['Chevrolet', 'Ford', 'Toyota'];
export const NPOINTS = { exact: 3, inTop3: 1, make: 2, poleWins: 1, darkHorse: 2 };
/** A dark horse starts outside the top ten. */
export const DARK_HORSE_FROM = 11;

function stateOf(status: any): 'pre' | 'live' | 'final' {
  const name = String(status?.type?.name || '');
  if (name === 'STATUS_FINAL' || status?.type?.completed === true) return 'final';
  if (name === 'STATUS_SCHEDULED' || status?.type?.state === 'pre') return 'pre';
  return 'live';
}

const surname = (a: any) => {
  const s = String(a?.shortName || '');
  const cut = s.indexOf('. ');
  return cut > 0 ? s.slice(cut + 2) : (String(a?.displayName || '').split(' ').slice(1).join(' ') || s);
};

/** The current race off ESPN's NASCAR scoreboard, with the cars and the grid
 *  from the core competition document when there is one. */
export function parseNascar(scoreboard: any, core: any = null): NEvent | null {
  const ev = (scoreboard?.events || [])[0];
  const c = ev && (ev.competitions || [])[0];
  if (!ev || !c) return null;
  const byId = new Map<string, any>();
  for (const x of (core && core.competitors) || []) byId.set(String(x.id), x);
  const state = stateOf(c.status);
  const drivers: NDriver[] = (c.competitors || []).map((x: any) => {
    const k = byId.get(String(x.id)) || {};
    const v = k.vehicle || {};
    const st = Number(k.startOrder ?? x.startOrder);
    return {
      id: String(x.id), name: String(x.athlete?.displayName || ''), short: surname(x.athlete),
      number: v.number != null ? String(v.number) : null,
      make: MAKES.includes(v.manufacturer) ? v.manufacturer : (v.manufacturer || null),
      team: v.team || null,
      start: Number.isFinite(st) && st > 0 ? st : null
    };
  });
  /* The finishing order, only once there is one. The core document carries it
     too, and it can be the fuller list (38 cars at Darlington). */
  const src = (core && Array.isArray(core.competitors) && core.competitors.some((x: any) => Number(x.order) > 0))
    ? core.competitors : (c.competitors || []);
  const order = state === 'pre' ? [] : src
    .filter((x: any) => Number.isFinite(Number(x.order)) && Number(x.order) > 0)
    .sort((a: any, b: any) => Number(a.order) - Number(b.order))
    .map((x: any) => String(x.id));
  const at = String(ev.name || '').split(' at ')[1] || null;
  return {
    id: String(ev.id), compId: String(c.id), name: String(ev.name || ''),
    track: c.venue?.fullName || at, start: Date.parse(c.date || ev.date), state, order, drivers
  };
}

export function isLocked(ev: NEvent, now: number): boolean {
  return ev.state !== 'pre' || now >= ev.start;
}
export function poleSitter(ev: NEvent): NDriver | null {
  return ev.drivers.find((d) => d.start === 1) || null;
}
/** A driver counts as a dark horse when the grid says they start 11th or worse -
 *  or when there is no grid yet, which is every driver. */
export function isDarkHorse(ev: NEvent, id: string): boolean {
  const d = ev.drivers.find((x) => x.id === id);
  return !!d && (d.start == null || d.start >= DARK_HORSE_FROM);
}

/** The makes actually in this field - Chevrolet, Ford and Toyota first, in that
 *  order, then anything else the entry list carries. Read from the race, not
 *  assumed: the O'Reilly and Truck series (added 2026-09-13, Jason: "add the
 *  O'Reilly and Truck series too") need not field the same three as the Cup. */
export function makesOf(ev: NEvent): string[] {
  const have = new Set(ev.drivers.map((d) => d.make).filter(Boolean) as string[]);
  const known = MAKES.filter((m) => have.has(m));
  const other = [...have].filter((m) => !MAKES.includes(m)).sort();
  return known.length || other.length ? [...known, ...other] : MAKES.slice();
}

/** Whatever a phone sent, as the picks this race accepts. After the green flag
 *  nothing changes; before it, a valid value replaces the stored one and an
 *  invalid one changes nothing. Pure. */
export function cleanNascarPicks(ev: NEvent, incoming: any, stored: NPicks, now: number): NPicks {
  const out: any = { ...(stored || {}) };
  if (isLocked(ev, now) || !incoming || typeof incoming !== 'object') return out;
  const ids = new Set(ev.drivers.map((d) => d.id));
  if ('race' in incoming && Array.isArray(incoming.race) && incoming.race.length <= 3) {
    const slots = [0, 1, 2].map((i) => (typeof incoming.race[i] === 'string' ? incoming.race[i] : ''));
    const filled = slots.filter(Boolean);
    if (filled.every((x) => ids.has(x)) && new Set(filled).size === filled.length) out.race = slots;
  }
  if ('make' in incoming && makesOf(ev).includes(incoming.make)) out.make = incoming.make;
  if ('poleWins' in incoming && (incoming.poleWins === 'yes' || incoming.poleWins === 'no')) out.poleWins = incoming.poleWins;
  if ('darkHorse' in incoming && typeof incoming.darkHorse === 'string' && ids.has(incoming.darkHorse)
      && isDarkHorse(ev, incoming.darkHorse)) out.darkHorse = incoming.darkHorse;
  return out;
}

/** Every pick's points and the total. Before the race is final every pick is
 *  null - never zero, which would read as a miss. */
export function scoreNascar(ev: NEvent, picks: NPicks) {
  const p = picks || {};
  const out = { race: null as number[] | null, make: null as number | null, poleWins: null as number | null,
                darkHorse: null as number | null, total: 0 };
  if (ev.state !== 'final' || ev.order.length < 3) return out;
  const top = ev.order.slice(0, 3);
  out.race = [0, 1, 2].map((i) => {
    const d = p.race && p.race[i];
    if (!d) return 0;
    return top[i] === d ? NPOINTS.exact : top.includes(d) ? NPOINTS.inTop3 : 0;
  });
  const winner = ev.drivers.find((d) => d.id === ev.order[0]);
  out.make = p.make ? (winner && winner.make === p.make ? NPOINTS.make : 0) : 0;
  const pole = poleSitter(ev);
  out.poleWins = p.poleWins && pole ? (((ev.order[0] === pole.id) === (p.poleWins === 'yes')) ? NPOINTS.poleWins : 0) : 0;
  const at = p.darkHorse ? ev.order.indexOf(p.darkHorse) : -1;
  out.darkHorse = p.darkHorse ? (at >= 0 && at < 10 ? NPOINTS.darkHorse : 0) : 0;
  out.total = out.race.reduce((a, b) => a + b, 0) + out.make + out.poleWins + out.darkHorse;
  return out;
}
