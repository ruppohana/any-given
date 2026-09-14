/* BIG GAME PROPS - the answers, off ESPN's game summary. Jason, 2026-09-14: "do the big game
 * props set next".
 *
 * The teams are not known until the conference championships, so every question is one
 * either side can answer: total points, the winning margin, the first score, the quarter with
 * the most points, overtime, a touchdown of 50 yards or more. ESPN's summary for the game
 * carries the final, the quarter lines and every scoring play with its type and yardage -
 * read on the real February 2026 game: Seattle 29, New England 13, nine scoring plays, a field
 * goal first, the longest touchdown 45 yards. Nothing is answered until the game is final.
 *
 * Each answer is one of the set's own options, word for word (src/lib/props.ts
 * 'big-game-props-2027'), or 'void' where no single pick called it (two quarters tied for the
 * most points). The app never names the game: it is "the Big Game".
 */
export const BIG_GAME_PROPS_OPTIONS = {
  total: ['Under 40', '40 to 49', '50 to 59', '60 or more'],
  margin: ['1 to 3 points', '4 to 7 points', '8 to 14 points', '15 or more points'],
  'first-score': ['Touchdown', 'Field goal', 'Safety'],
  'top-quarter': ['1st quarter', '2nd quarter', '3rd quarter', '4th quarter'],
  overtime: ['Yes', 'No'],
  'long-td': ['Yes', 'No']
} as const;

const O = BIG_GAME_PROPS_OPTIONS;

export function bigGameAnswers(summary: any): Record<string, string> {
  const c = summary?.header?.competitions?.[0];
  if (!c || c.status?.type?.completed !== true) return {};
  const cs = c.competitors || [];
  const h = cs.find((x: any) => x.homeAway === 'home');
  const a = cs.find((x: any) => x.homeAway === 'away');
  const hs = Number(h?.score), as = Number(a?.score);
  if (!Number.isFinite(hs) || !Number.isFinite(as)) return {};
  const out: Record<string, string> = {};

  const total = hs + as;
  out.total = total < 40 ? O.total[0] : total < 50 ? O.total[1] : total < 60 ? O.total[2] : O.total[3];
  const m = Math.abs(hs - as);
  if (m > 0) out.margin = m <= 3 ? O.margin[0] : m <= 7 ? O.margin[1] : m <= 14 ? O.margin[2] : O.margin[3];

  /* The quarter lines: four, and a fifth or more for overtime. Overtime's points count in the
     total and the margin, never as a quarter. */
  const lines = (x: any) => (x?.linescores || []).map((l: any) => Number(l.value ?? l.displayValue));
  const hl = lines(h), al = lines(a);
  if (hl.length >= 4 && al.length >= 4 && [...hl, ...al].every((v: number) => Number.isFinite(v))) {
    out.overtime = hl.length > 4 || al.length > 4 ? 'Yes' : 'No';
    const q = [0, 1, 2, 3].map((i) => hl[i] + al[i]);
    const top = Math.max(...q);
    const at = q.map((v, i) => (v === top ? i : -1)).filter((i) => i >= 0);
    out['top-quarter'] = at.length === 1 ? O['top-quarter'][at[0]] : 'void';
  }

  const plays = Array.isArray(summary.scoringPlays) ? summary.scoringPlays : [];
  const kind = (p: any) => String(p?.scoringType?.abbreviation || '').toUpperCase();
  if (plays.length) {
    const first = plays[0];
    const k = kind(first);
    const f = k === 'TD' ? 'Touchdown' : k === 'FG' ? 'Field goal'
      : k === 'SF' || /safety/i.test(String(first?.type?.text || first?.text || '')) ? 'Safety' : null;
    if (f) out['first-score'] = f;
    const long = plays.some((p: any) => kind(p) === 'TD' && Number((String(p.text || '').match(/(\d+)\s*Yd/i) || [])[1]) >= 50);
    out['long-td'] = long ? 'Yes' : 'No';
  }
  return out;
}
