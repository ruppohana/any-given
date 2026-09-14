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

export const DAY_SPORTS: Record<string, { path: string; groups: string; label: string; periods: number; leagues?: string[] }> = {
  /* groups=50 is Division I - without it ESPN returns a featured handful
     (15 of 92 games on 2026-03-07). Two halves. */
  'mens-college-basketball': { path: 'basketball/mens-college-basketball', groups: '50', label: 'College basketball', periods: 2 },
  /* The NBA - Jason, 2026-09-12: "Yes" to "pro" on page 2 for opening night,
     Oct 20. 30 teams, no filter; four quarters. */
  nba: { path: 'basketball/nba', groups: '', label: 'NBA', periods: 4 },
  /* Jason, 2026-09-12: "keep working on making it larger". Three more leagues that
     play every day and read exactly like the NBA on ESPN's scoreboard - pool picks
     a day at a time (src/lib/groups.ts POOL_SPORTS). Probed 2026-09-12: MLB 15
     games that day, the WNBA in its playoffs, the NHL from Sep 19. */
  mlb: { path: 'baseball/mlb', groups: '', label: 'MLB', periods: 9 },
  nhl: { path: 'hockey/nhl', groups: '', label: 'NHL', periods: 3 },
  wnba: { path: 'basketball/wnba', groups: '', label: 'WNBA', periods: 4 },
  /* 🔴 SOCCER - THE ONE POOL WHERE A DRAW IS A PICK. Captured 2026-09-12: four of
     seven Premier League matches and four of twelve MLS matches were draws, so a
     draw cannot be the void path it is everywhere else - it is a result, and a
     person can call it (src/lib/groups.ts isSoccerSport). Matches end
     STATUS_FULL_TIME (src/slate-day.ts statusOf). Two halves; the clock is
     ESPN's own minute ("67'", "90'+6'"). */
  epl: { path: 'soccer/eng.1', groups: '', label: 'Premier League', periods: 2 },
  mls: { path: 'soccer/usa.1', groups: '', label: 'MLS', periods: 2 },
  /* 2026-09-13 - "soccer ... only MLS and premier?" The Champions League (league
     phase Sep-Jan, then knockouts to the May final), La Liga and Liga MX: the same
     ESPN soccer scoreboard. A knockout decided on penalties is WON - Jason: "a
     knockout round has a winner, that is the winner" (src/slate-day.ts parseDay). */
  ucl: { path: 'soccer/uefa.champions', groups: '', label: 'Champions League', periods: 2 },
  laliga: { path: 'soccer/esp.1', groups: '', label: 'La Liga', periods: 2 },
  ligamx: { path: 'soccer/mex.1', groups: '', label: 'Liga MX', periods: 2 },
  /* Jason, 2026-09-13: "college hockey?" - ESPN carries it (21 games on 2026-03-07;
     the season opens 2026-10-03 with 15). Three periods, like the NHL. */
  'mens-college-hockey': { path: 'hockey/mens-college-hockey', groups: '', label: 'College hockey', periods: 3 },
  /* Jason, 2026-09-13: "add women's college basketball too". groups=50 is Division I
     (72 games on 2026-03-07; without it ESPN returns 10). Four ten-minute quarters. */
  'womens-college-basketball': { path: 'basketball/womens-college-basketball', groups: '50', label: "Women's college basketball", periods: 4 },
  /* 🔴 WINNER-FLAG SPORTS - Jason, 2026-09-13: "do the ufc and cricket next". Neither
     is graded by a score: a fight has no score, and a cricket score is text ("151/8
     (20 ov)"). ESPN flags the winner on each side, and a bout drawn or ruled no
     contest, or a match with no result, has no winner - the one void path
     (src/slate-day.ts parseUfcDay / parseCricketDay, src/lib/groups.ts gradeSql). */
  /* A UFC day is its card: every bout, locked at its card segment's start. */
  ufc: { path: 'mma/ufc', groups: '', label: 'UFC', periods: 3 },
  /* Cricket has no one league: ESPN files each competition and each tour under its
     own id, so a day is gathered from every one in season (checked 2026-09-13):
     the Caribbean Premier League, the Asian Games, India in New Zealand, England
     in Australia, the Women's Big Bash, New Zealand in Australia, England in South
     Africa, the Big Bash, SA20 and the IPL. Limited-overs only - a five-day Test is
     not a day's pick. */
  cricket: { path: 'cricket', groups: '', label: 'Cricket', periods: 2,
    leagues: ['8623', '22547', '24469', '24273', '21284', '24270', '24198', '8044', '21275', '8048'] }
};

/** A sport graded by ESPN's winner flag rather than by a score. */
export function isWinnerDay(sport: unknown): boolean {
  return sport === 'ufc' || sport === 'cricket';
}

/** The soccer day sports - src/lib/groups.ts isSoccerSport says the same. */
export const SOCCER_DAY = ['epl', 'mls', 'ucl', 'laliga', 'ligamx'];

/** Soccer counts minutes, not a countdown - see dayClock. */
export function isSoccerDay(sport: unknown): boolean {
  return SOCCER_DAY.includes(String(sport));
}

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

/* 🔴 EAST OR WEST, BY ESPN TEAM ID - read off ESPN's own NBA groups list
 * (/basketball/nba/groups, 2026-09-12: two conferences, three divisions of five
 * each). The scoreboard gives an NBA team no conferenceId at all. */
export const NBA_CONF: Record<string, string> = {
  '1': 'East', '2': 'East', '3': 'West', '4': 'East', '5': 'East', '6': 'West', '7': 'West',
  '8': 'East', '9': 'West', '10': 'West', '11': 'East', '12': 'West', '13': 'West', '14': 'East',
  '15': 'East', '16': 'West', '17': 'East', '18': 'East', '19': 'East', '20': 'East', '21': 'West',
  '22': 'West', '23': 'West', '24': 'West', '25': 'West', '26': 'West', '27': 'East', '28': 'East',
  '29': 'West', '30': 'East'
};

/** The live clock in the sport's own periods. Men's college basketball plays two
 *  halves - period 2 is the end of regulation, period 3 overtime; the NBA plays
 *  four quarters, halftime after the 2nd. "1st 12:34", "Halftime", "End 3rd",
 *  "OT 2:10", "2OT 1:00". */
export function dayClock(sport: string, period: number, clock: string | null, statusName?: string | null): string {
  const reg = (DAY_SPORTS[sport] && DAY_SPORTS[sport].periods) || 2;
  if (statusName === 'STATUS_HALFTIME') return 'Halftime';
  /* A soccer clock counts UP and already says what it is - "67'", "45'+2'". */
  if (isSoccerDay(sport)) return clock || '';
  /* A fight and a cricket innings have no game clock worth showing on a row. */
  if (isWinnerDay(sport)) return '';
  const p = Number(period);
  if (!Number.isFinite(p) || p < 1) return '';
  const ORD = ['1st', '2nd', '3rd', '4th'];
  const ord = p <= reg ? ORD[p - 1] : (p - reg === 1 ? 'OT' : (p - reg) + 'OT');
  if (!clock) return ord;
  if (clock === '0:00' || clock === '0.0') return p === reg / 2 ? 'Halftime' : 'End ' + ord;
  return ord + ' ' + clock;
}

/** College basketball's clock - kept for the callers written before the NBA. */
export function hoopsClock(period: number, clock: string | null, statusName?: string | null): string {
  return dayClock('mens-college-basketball', period, clock, statusName);
}
