/* BIG GAME SQUARES - the pure half. Jason, 2026-09-13: "for the super bowl, can we create
 * squares people can pick? that usual thing?", then "only the super bowl and we cannot say
 * superbowl, right?" The name is the NFL's trademark, so the app says "the Big Game".
 *
 * The office-pool grid: 10 x 10. Members claim squares until kickoff. At kickoff the
 * digits 0-9 are drawn at random, once for the home team's side (the rows) and once for
 * the away team's (the columns), so nobody could have chosen a good number. At the end of
 * the 1st quarter, at halftime, at the end of the 3rd and at the final, the square where
 * the LAST DIGIT of each team's score meets wins that period's points. The final is the
 * final score, overtime included. A winning square nobody claimed scores nobody.
 * Points only - nothing of value, the standing rule.
 *
 * Shared by the Worker (src/squares-pool.ts) and its tests.
 */

/* 🔴 THE 2026 SEASON'S GAME - ESPN lists it as event 401873270, Sunday February 14, 2027,
   23:30 UTC (6:30 PM ET), teams TBD until the conference championships (read 2026-09-13).
   A new season is a new entry here. */
export const BIG_GAME = { season: 2026, eventId: '401873270', dates: '20270214', kickoffUtc: Date.UTC(2027, 1, 14, 23, 30) };

export const SQUARES_LIMITS = { cells: 100, maxDefault: 10, maxMax: 100 };

/** The four scoring moments, and what each is worth: the final most, halftime next. */
export const PERIODS = [
  { key: 'q1', label: '1st quarter', points: 1 },
  { key: 'half', label: 'Halftime', points: 2 },
  { key: 'q3', label: '3rd quarter', points: 1 },
  { key: 'final', label: 'Final', points: 3 }
] as const;

export type SquaresTeam = { abbrev: string; name: string; short: string; primary: string | null; secondary: string | null };
export type BigGame = {
  id: string; kickoffUtc: number; status: 'scheduled' | 'live' | 'final'; statusName: string;
  period: number; clock: string | null; home: SquaresTeam | null; away: SquaresTeam | null;
  homeLines: number[]; awayLines: number[]; homeScore: number | null; awayScore: number | null;
};

/** A whole number in [0, 1) from the platform's cryptographic source. */
function cryptoRand(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 4294967296;
}
function shuffle(rand: () => number): number[] {
  const d = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let i = 9; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

/** The draw: each side's digits 0-9 in a random order. */
export function drawDigits(rand: () => number = cryptoRand): { rows: number[]; cols: number[] } {
  return { rows: shuffle(rand), cols: shuffle(rand) };
}

/** Is this a draw a grid can use - both sides a permutation of 0-9? */
export function isDraw(d: any): d is { rows: number[]; cols: number[] } {
  const ok = (a: any) => Array.isArray(a) && a.length === 10 && [...a].sort((x, y) => x - y).every((v, i) => v === i);
  return !!d && ok(d.rows) && ok(d.cols);
}

/** The game off ESPN's NFL scoreboard, by event id. A side is null while it is TBD. ESPN's
 *  own headline for the game is never carried - the app does not say its name. */
export function parseBigGame(payload: any, eventId: string): BigGame | null {
  const ev = (payload?.events || []).find((e: any) => String(e.id) === String(eventId));
  const c = ev?.competitions?.[0];
  if (!c) return null;
  const st = c.status?.type || {};
  const status = st.completed === true || st.state === 'post' ? 'final' : st.state === 'in' ? 'live' : 'scheduled';
  const side = (ha: string) => (c.competitors || []).find((x: any) => x.homeAway === ha);
  const team = (x: any): SquaresTeam | null => {
    const t = x?.team;
    if (!t || !t.abbreviation || /^TBD$/i.test(t.abbreviation)) return null;
    return { abbrev: String(t.abbreviation), name: String(t.displayName || t.name || t.abbreviation),
             short: String(t.shortDisplayName || t.name || t.abbreviation),
             primary: t.color ? '#' + t.color : null, secondary: t.alternateColor ? '#' + t.alternateColor : null };
  };
  const lines = (x: any) => (x?.linescores || []).map((l: any) => Number(l.value)).filter((n: number) => Number.isFinite(n));
  const score = (x: any) => (status === 'scheduled' || x?.score == null || x.score === '' ? null : Number(x.score));
  const h = side('home'), a = side('away');
  return {
    id: String(ev.id), kickoffUtc: Date.parse(c.date || ev.date), status, statusName: String(st.name || ''),
    period: Number(c.status?.period) || 0, clock: c.status?.displayClock ? String(c.status.displayClock) : null,
    home: team(h), away: team(a), homeLines: lines(h), awayLines: lines(a), homeScore: score(h), awayScore: score(a)
  };
}

/** The score at each scoring moment that has passed - cumulative, from the quarter lines;
 *  the final from the final score (overtime included). A moment whose lines are missing is
 *  left out rather than guessed. */
export function periodScores(g: BigGame | null): { key: string; label: string; points: number; home: number; away: number }[] {
  if (!g || g.status === 'scheduled') return [];
  const fin = g.status === 'final';
  const sum = (a: number[], n: number) => (a.length >= n ? a.slice(0, n).reduce((x, y) => x + y, 0) : null);
  const done = (after: number) => fin || g.period > after || (after === 2 && /HALFTIME/i.test(g.statusName));
  const out: { key: string; label: string; points: number; home: number; away: number }[] = [];
  PERIODS.forEach((p, i) => {
    let home: number | null = null, away: number | null = null;
    if (p.key === 'final') {
      if (!fin) return;
      home = g.homeScore; away = g.awayScore;
    } else {
      const after = i + 1;
      if (!done(after)) return;
      home = sum(g.homeLines, after); away = sum(g.awayLines, after);
    }
    if (home == null || away == null || !Number.isFinite(home) || !Number.isFinite(away)) return;
    out.push({ key: p.key, label: p.label, points: p.points, home, away });
  });
  return out;
}

/** The square where two scores meet under a draw: row = the home digit, column = the away digit. */
export function cellOf(d: { rows: number[]; cols: number[] }, home: number, away: number): number {
  return d.rows.indexOf(((home % 10) + 10) % 10) * 10 + d.cols.indexOf(((away % 10) + 10) % 10);
}

/** Each passed scoring moment, its square and who holds it (null: nobody claimed it, or no
 *  draw yet - which cannot happen after kickoff). */
export function squaresResults(draw: { rows: number[]; cols: number[] } | null, owners: Map<number, string>, g: BigGame | null) {
  if (!draw) return [];
  return periodScores(g).map((s) => {
    const cell = cellOf(draw, s.home, s.away);
    return { ...s, cell, userId: owners.get(cell) ?? null };
  });
}

/** Points and squares hit per person, from the results. */
export function squaresPoints(results: { points: number; userId: string | null }[]): Map<string, { points: number; hits: number }> {
  const out = new Map<string, { points: number; hits: number }>();
  for (const r of results) {
    if (!r.userId) continue;
    const cur = out.get(r.userId) || { points: 0, hits: 0 };
    out.set(r.userId, { points: cur.points + r.points, hits: cur.hits + 1 });
  }
  return out;
}

/** A commissioner's "squares per person": a whole number 1-100, or null. */
export function cleanMax(v: unknown): number | null {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= SQUARES_LIMITS.maxMax ? n : null;
}

/** A square number from a phone: 0-99, or null. */
export function cleanCell(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n < SQUARES_LIMITS.cells ? n : null;
}
