/* ONE DAY AT A TIME - FOR A SPORT THAT PLAYS EVERY DAY.
 *
 * Jason, 2026-09-12: basketball on The slate shows "one day at a time
 * (tonight's games, with tomorrow a tap away)". A football week is 86 college
 * games; a basketball week is 170 in November and 300-450 by January, which is
 * too many to fetch in one Worker run and too many to scroll. A day is 30-170.
 *
 * Shared by the Worker and the browser (built to /src/lib/day.js), so the two
 * can never disagree about which day "today" is.
 */

export const DAY_SPORTS: Record<string, { path: string; groups: string; label: string }> = {
  /* groups=50 is Division I - without it ESPN returns a featured handful
     (15 of 92 games on 2026-03-07). */
  'mens-college-basketball': { path: 'basketball/mens-college-basketball', groups: '50', label: 'College basketball' }
};

export function isDaySport(sport: unknown): boolean {
  return typeof sport === 'string' && Object.prototype.hasOwnProperty.call(DAY_SPORTS, sport);
}

/** A day as ESPN writes it: YYYYMMDD. */
export function isDay(v: unknown): boolean {
  return typeof v === 'string' && v.length === 8 && Number.isInteger(Number(v));
}

/* 🔴 TODAY IS THE EASTERN DATE, ROLLED OVER AT 6 AM, NOT AT MIDNIGHT. ESPN files
 * a game under the Eastern date it tips, and a West Coast game at 10:30 PM
 * Pacific is 1:30 AM Eastern - so a midnight rollover would move "tonight" to
 * tomorrow while that game was still on. Six hours covers the latest tip plus
 * overtime. */
const ROLL_MS = 6 * 60 * 60 * 1000;

export function dayOf(ms: number): string {
  const s = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date(ms - ROLL_MS));
  return s.split('-').join('');
}

export function addDays(ymd: string, n: number): string {
  const t = Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8))) + n * 86400000;
  const d = new Date(t);
  return String(d.getUTCFullYear()) + String(d.getUTCMonth() + 1).padStart(2, '0') + String(d.getUTCDate()).padStart(2, '0');
}

/** "Today", "Tomorrow", or "Mon, Nov 2". */
export function dayLabel(ymd: string, today: string): string {
  if (ymd === today) return 'Today';
  if (ymd === addDays(today, 1)) return 'Tomorrow';
  if (ymd === addDays(today, -1)) return 'Yesterday';
  const d = new Date(Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)), 12));
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/* 🔴 THE CONFERENCE, BY ESPN's conferenceId - COUNTED, NOT TYPED. The scoreboard
 * gives every team a conferenceId and no name, and ESPN's groups list gives
 * names with no ids. So this table is read off last season's 5,908 captured
 * games: every conference game carries its conference's id and short name, and
 * each id here is the name ESPN used for it (tools/capture-season.mjs data).
 * A conference game on the live scoreboard names itself too, and that wins. */
export const CONF_SHORT: Record<string, string> = {
  '1': 'Am. East', '2': 'ACC', '3': 'A-10', '4': 'Big East', '5': 'Big Sky', '6': 'Big South',
  '7': 'Big Ten', '8': 'Big 12', '9': 'Big West', '10': 'CAA', '11': 'CUSA', '12': 'Ivy',
  '13': 'Metro', '14': 'MAC', '16': 'MEAC', '18': 'MVC', '19': 'NEC', '20': 'OVC',
  '22': 'Patriot', '23': 'SEC', '24': 'SoCon', '25': 'Southland', '26': 'SWAC', '27': 'Sun Belt',
  '29': 'WCC', '30': 'UAC', '44': 'Mountain West', '45': 'Horizon', '46': 'Atlantic Sun',
  '49': 'Summit', '62': 'American'
};

/** "1st 12:34", "Halftime", "2nd 0:45", "OT 2:10", "2OT 1:00". Men's college
 *  basketball plays two halves, so period 2 is the end of regulation and
 *  period 3 is overtime - the football words ("3rd", "Q4") would be wrong. */
export function hoopsClock(period: number, clock: string | null, statusName?: string | null): string {
  if (statusName === 'STATUS_HALFTIME') return 'Halftime';
  const p = Number(period);
  if (!Number.isFinite(p) || p < 1) return '';
  const ord = p === 1 ? '1st' : p === 2 ? '2nd' : p === 3 ? 'OT' : (p - 2) + 'OT';
  if (!clock) return ord;
  if (clock === '0:00' || clock === '0.0') return p === 1 ? 'Halftime' : 'End ' + ord;
  return ord + ' ' + clock;
}
