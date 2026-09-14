/* GROUP POOLS - the pure half. Codes, cleaning, the words of the two emails, and
 * the limits. No database, no network: src/groups.ts does that and calls these, so
 * every rule a person can hit is testable on its own (tests/groups.test.mjs).
 *
 * Jason, 2026-09-11: start a group with a name and invite people to it, invite
 * only; the commissioner sets the rules, sends invites, removes members and is
 * "responsible to kindness"; any member can email the commissioner or the group,
 * and addresses stay private ("sure" to sending it through Any Given).
 */

/* The shipped invite-code alphabet (no vowels, no 0/O/1/I) - conflict #13 in the
 * wiki holds the Crockford alternative open; this does not decide it. */
export const CODE_ALPHABET = '23456789BCDFGHJKLMNPQRSTVWXYZ';

export const LIMITS = {
  /** invite emails a group may send per rolling day */
  invitesPerDay: 50,
  /** addresses in one invite batch */
  invitesPerBatch: 20,
  /** messages one member may send in one group per rolling day */
  messagesPerDay: 10,
  /** characters in a message */
  messageMax: 1000,
  /** members in a group */
  membersMax: 200,
  /** characters in a group name */
  nameMax: 40
};

/** The line the commissioner accepts when starting a group. */
export const KINDNESS =
  'As commissioner I keep this group kind. I can remove anyone who makes it unkind, and I will.';

export function newCode(rand: () => number = Math.random): string {
  let c = '';
  for (let i = 0; i < 6; i++) c += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  return c;
}

/** Whatever case and spacing a keyboard produced, as the stored code. */
export function normCode(c: unknown): string {
  return String(c ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

export function cleanName(n: unknown, max = LIMITS.nameMax): string {
  return String(n ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Which games a group picks from. Jason, 2026-09-11: "All games is fine for NFL.
 *  But it is tough for NCAA. We need a toggle for when setting up the group or the
 *  [commissioner] can change." A college group picks all games, the Top 25 (a game
 *  with a ranked team) or one conference (a game with a team from it); an NFL group
 *  is always all games. `null` is a choice that cannot be honored - a conference
 *  with no name. */
/** The sports a group can play. Jason, 2026-09-12: "complete the pool revision,
 *  but do all the sports for the pool". Football and basketball pick winners (a
 *  basketball group picks a day at a time - its "week" is the day, YYYYMMDD);
 *  F1 plays the race weekend in points (src/f1-pool.ts). Anything else is a
 *  college football group, which is what every group was before this list. */
/* NASCAR added 2026-09-12 - Jason: "do nascar next". A NASCAR group plays race
   day in points (src/lib/nascar.ts), the way an F1 group plays the weekend. */
export const POOL_SPORTS = ['college-football', 'nfl', 'mens-college-basketball', 'nba', 'f1', 'nascar',
  /* 2026-09-12, "making it larger": three more day-at-a-time leagues (src/lib/day.ts). */
  'mlb', 'nhl', 'wnba',
  /* 2026-09-13, "add the O'Reilly and Truck series too": NASCAR's other two national
     series, race day like the Cup (src/nascar-feed.ts NASCAR_SERIES). */
  'nascar-oreilly', 'nascar-truck',
  /* 2026-09-13, "do all the sports for the pool": the Premier League and MLS, a day
     at a time, and the one pool where a draw is a pick (isSoccerSport below). */
  'epl', 'mls',
  /* 2026-09-13: three more soccer leagues and college hockey (src/lib/day.ts). */
  'ucl', 'laliga', 'ligamx', 'mens-college-hockey',
  /* 2026-09-13, "add women's college basketball too" - a college day sport. */
  'womens-college-basketball',
  /* 2026-09-13, "non sports, golf, oscars, everything": a QUESTIONS group - the
     commissioner writes the questions and enters the answers (src/props-pool.ts). */
  'props'] as const;
export type PoolSport = typeof POOL_SPORTS[number];
export function poolSport(s: unknown): PoolSport {
  return (POOL_SPORTS as readonly string[]).includes(String(s)) ? (s as PoolSport) : 'college-football';
}
/** A racing sport is scored in points over each race and never carries a spread:
 *  F1, and every NASCAR national series (Cup, O'Reilly, Truck - src/nascar-feed.ts). */
export const isRacingSport = (s: unknown) => s === 'f1' || String(s).startsWith('nascar');

/* 🔴 SOCCER: A DRAW IS A RESULT, NOT THE VOID PATH. Everywhere else a level
 * final is a tie and voids for everybody. On 2026-09-12 four of seven Premier
 * League matches ended level - voiding those would throw away most of a day.
 * So a soccer pick has three sides, a level final grades the draw pickers right
 * and everyone else wrong, and it counts as played. No spread: a three-way
 * result has no single line. */
export const isSoccerSport = (s: unknown) => ['epl', 'mls', 'ucl', 'laliga', 'ligamx'].includes(String(s));
/** A race or a soccer match never picks against a spread. */
export const hasNoSpread = (s: unknown) => isRacingSport(s) || isSoccerSport(s) || s === 'props';
/** The sides a pick may take. */
export const pickSides = (s: unknown): string[] => isSoccerSport(s) ? ['home', 'away', 'draw'] : ['home', 'away'];

/** The SQL that grades a pick against a final: `counted` says whether a final
 *  game counts as played, `result` names the winning side. Constants chosen
 *  here, never built from a request. Straight up a margin of zero is a tie and
 *  voids; against the spread it is a push and voids; in soccer it is a draw. */
export function gradeSql(sport: unknown, ats: boolean): { counted: string; result: string } {
  const margin = ats && !hasNoSpread(sport)
    ? '(g.home_score + COALESCE(p.spread_at, g.spread, 0) - g.away_score)'
    : '(g.home_score - g.away_score)';
  if (isSoccerSport(sport)) {
    /* 🔴 A KNOCKOUT HAS A WINNER - Jason, 2026-09-13: "a knockout round has a winner,
       that is the winner". A level final that one side still won (penalties) carries
       that side in `game.winner` (migration 0010), and it is read before the score. */
    return { counted: '1 = 1', result: `CASE WHEN g.winner IN ('home', 'away') THEN g.winner WHEN ${margin} > 0 THEN 'home' WHEN ${margin} < 0 THEN 'away' ELSE 'draw' END` };
  }
  return { counted: `${margin} <> 0`, result: `CASE WHEN ${margin} > 0 THEN 'home' ELSE 'away' END` };
}
/** A college sport chooses its games; a pro league and F1 play everything. */
export const isCollegeSport = (s: string) =>
  s === 'college-football' || s === 'mens-college-basketball' || s === 'womens-college-basketball';
/** The world board of a sport, for picks made outside any group. */
export const worldPoolId = (s: string) =>
  s === 'nfl' ? 'world-nfl' : s === 'college-football' ? 'world-cfb' : 'world-' + s;

export type GroupScope = 'all' | 'top25' | 'conference';
export function cleanScope(sport: unknown, scope: unknown, arg: unknown): { scope: GroupScope; arg: string | null } | null {
  /* A row from before the sport column is a college football group. */
  if (!isCollegeSport(sport == null ? 'college-football' : String(sport))) return { scope: 'all', arg: null };
  const s = String(scope ?? 'all');
  if (s === 'all' || s === 'top25') return { scope: s, arg: null };
  if (s === 'conference') {
    const a = cleanName(arg, 40);
    return a ? { scope: 'conference', arg: a } : null;
  }
  return null;
}

const EMAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/;

/** Emails from an array or a pasted list (commas, spaces, new lines). Lowercased,
 *  de-duplicated, capped at `max`; anything that is not an address is returned in
 *  `bad` so the screen can say which. */
export function parseEmails(list: unknown, max = LIMITS.invitesPerBatch): { ok: string[]; bad: string[] } {
  const raw = Array.isArray(list) ? list.map(String) : String(list ?? '').split(/[\s,;]+/);
  const ok: string[] = [];
  const bad: string[] = [];
  for (const r of raw) {
    const e = r.trim().toLowerCase();
    if (!e) continue;
    if (e.length <= 254 && EMAIL.test(e)) { if (!ok.includes(e)) ok.push(e); } else if (!bad.includes(r.trim())) bad.push(r.trim());
  }
  return { ok: ok.slice(0, max), bad };
}

/** A message body: control characters out (new lines kept), no runs of blank
 *  lines, trimmed, capped. */
export function cleanBody(b: unknown, max = LIMITS.messageMax): string {
  return String(b ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

export interface Mail { subject: string; text: string; }

const FOOTER =
  'This came through Any Given, so nobody\'s email address is shown to anyone else.';

export function inviteMail(o: { groupName: string; fromHandle: string; link: string }): Mail {
  return {
    subject: `@${o.fromHandle} invited you to ${o.groupName} on Any Given`,
    text:
      `@${o.fromHandle} invited you to their group, ${o.groupName}, on Any Given.\n\n` +
      `Pick the winners each week, scored in points. Nothing is staked.\n\n` +
      `Join here: ${o.link}\n\n` +
      `If you weren't expecting this, you can ignore it.\n\n${FOOTER}`
  };
}

export function messageMail(o: { groupName: string; fromHandle: string; to: 'commish' | 'group'; body: string; link: string }): Mail {
  const where = o.to === 'commish' ? `to you, the commissioner of ${o.groupName}` : `to everyone in ${o.groupName}`;
  return {
    subject: o.to === 'commish'
      ? `@${o.fromHandle} wrote to the commissioner of ${o.groupName}`
      : `@${o.fromHandle} wrote to ${o.groupName}`,
    text:
      `@${o.fromHandle} wrote ${where}:\n\n${o.body}\n\n` +
      `Reply from the group page in Any Given: ${o.link}\n\n${FOOTER}`
  };
}
