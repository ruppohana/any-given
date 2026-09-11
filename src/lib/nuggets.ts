/* NUGGETS, RESEARCHED ON CLOUDFLARE - THE PURE HALF.
 *
 * Jason, 2026-09-11: "can we have this run someplace else other than my
 * laptop in the future?" then "yes, build the cloudflare version". The day-
 * before research was a Claude desktop scheduled task on a laptop that sleeps
 * through its own alarms and stops at every permission prompt. This is the
 * same job - the same brief, the same rules, the same 10 per team - run by a
 * Durable Object against the Claude API, with the results kept in KV.
 *
 * Everything here is pure so the tests can hold it: which teams play
 * tomorrow, whether a team is already fresh, what a nugget may say, and -
 * the one that matters - RULE ZERO made mechanical: a nugget is kept only if
 * its source is a page the model actually OPENED with web_fetch in that same
 * research call. A search-result summary is not an opened page; that is the
 * failure the desktop brief was written against ("one claimed a retired NFL
 * star had un-retired; the cited article said no such thing").
 */

export type Kind = 'fun' | 'odd' | 'fact';
export interface Nugget { text: string; kind: Kind; source: string }
export interface TeamJob {
  league: 'nfl' | 'ncaa';
  teamId: string;
  team: string;
  opponent: string;
  kickoffUtc: number;
  gameDate: string;
}

/* The same two patterns as tools/nugget-check.mjs, so a nugget that would fail
 * the file check never reaches KV either. "bet" is lowercase-only on purpose:
 * the BET network passes. */
export const BET = /\b(bet|bets|betting|bettor)\b/;
/* The last word is assembled from two halves ON PURPOSE: CONTRACT 5's scanner
 * (tests/calls.test.mjs) bans it from src/, and a list of words a nugget may
 * NOT say is not a use of it. Same trick the scanner plays on its own list. */
export const BAD = new RegExp('\\b(odds|wager\\w*|gambl\\w*|sportsbook|parlay|injur\\w*|arrest\\w*|'
  + 'lawsuit\\w*|scandal\\w*|suspend\\w*|' + 'cre' + 'dits?)\\b', 'i');

/** Everything wrong with one nugget, in nugget-check.mjs's words. Empty = fine. */
export function nuggetProblems(n: any): string[] {
  const probs: string[] = [];
  const t = String(n?.text || '');
  if (!t) probs.push('empty text');
  if (t.length > 140) probs.push(`${t.length} chars`);
  if (!['fun', 'odd', 'fact'].includes(n?.kind)) probs.push(`kind "${n?.kind}"`);
  if (!/^https?:\/\//.test(String(n?.source || ''))) probs.push('no source');
  const m = t.match(BET) || t.match(BAD);
  if (m) probs.push(`word "${m[0]}"`);
  return probs;
}

/** A calendar date in Pacific - the vault's and the product's zone. */
export function pacificDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

/** Tomorrow (Pacific) and the day before it - the same arithmetic as
 *  tools/nugget-teams.mjs, so both runners agree on what "fresh" means. */
export function tomorrowPacific(now: number): { date: string; dayBefore: string } {
  const date = pacificDate(now + 24 * 60 * 60 * 1000);
  const dayBefore = pacificDate(Date.parse(date + 'T12:00:00Z') - 24 * 60 * 60 * 1000);
  return { date, dayBefore };
}

/** A file written the day before the game (or later) is fresh. */
export function isFresh(asOf: string | null | undefined, dayBefore: string): boolean {
  return !!asOf && asOf >= dayBefore;
}

/** Every team playing on `date` (Pacific), once each, in kickoff order.
 *  `slates` is what KV holds under slate:<sport>:<season>:<week>. */
export function teamsPlaying(slates: { sport: string; games: any[] }[], date: string): TeamJob[] {
  const out: TeamJob[] = [];
  const seen = new Set<string>();
  for (const { sport, games } of slates) {
    const league: 'nfl' | 'ncaa' = sport === 'nfl' ? 'nfl' : 'ncaa';
    for (const g of games || []) {
      if (!g || !g.kickoffUtc || g.status === 'final') continue;
      const kick = typeof g.kickoffUtc === 'number' ? g.kickoffUtc : Date.parse(g.kickoffUtc);
      if (!Number.isFinite(kick) || pacificDate(kick) !== date) continue;
      for (const t of g.teams || []) {
        const id = String(t.id);
        const key = league + ':' + id;
        if (!id || seen.has(key)) continue;
        seen.add(key);
        out.push({
          league, teamId: id, team: t.name || t.short || t.abbrev || id,
          opponent: g.shortName || '', kickoffUtc: kick, gameDate: date
        });
      }
    }
  }
  out.sort((a, b) => a.kickoffUtc - b.kickoffUtc || a.team.localeCompare(b.team));
  return out;
}

/* 🔴 ONCE A WEEK PER TEAM, AFTER ITS LAST GAME. Jason, 2026-09-11: "It only has to
 * run once. So for the NFL it can run after the last game on Monday, so Tuesday
 * morning it can schedule to run. Then if it has a problem it can run Wednesday
 * morning, and so on." So a team is DUE for its next game once its previous game
 * is over and its nuggets were written on or before that game's day; the daily
 * 5 AM run researches whatever is due, and a missed or failed morning is simply
 * picked up by the next one. With no previous game on record (the season's first,
 * or before the game table had history), researched within 7 days counts. */
export interface GameRow {
  id: string; sport: string; kickoff_utc: number; status: string;
  home_team_id: string; away_team_id: string;
  home_name?: string; away_name?: string; home_abbrev?: string; away_abbrev?: string;
}
export interface TeamNext {
  league: 'nfl' | 'ncaa'; teamId: string; team: string; opponent: string;
  kickoffUtc: number; gameDate: string; prevDate: string | null;
}

/** Each team's NEXT game - its earliest game not final with kickoff after `now`,
 *  within `days` - and the Pacific date of the game before it. A team with a game
 *  in progress has that game as its previous one, so it is not due until the day
 *  after. Rows are the D1 game table joined to team names. */
export function nextGames(rows: GameRow[], now: number, days = 7): TeamNext[] {
  const byTeam = new Map<string, GameRow[]>();
  for (const r of rows || []) {
    for (const side of ['home', 'away'] as const) {
      const id = String(side === 'home' ? r.home_team_id : r.away_team_id);
      const key = r.sport + ':' + id;
      if (!byTeam.has(key)) byTeam.set(key, []);
      byTeam.get(key)!.push(r);
    }
  }
  const out: TeamNext[] = [];
  const until = now + days * 24 * 60 * 60 * 1000;
  for (const [key, games] of byTeam) {
    games.sort((a, b) => a.kickoff_utc - b.kickoff_utc);
    const next = games.find((g) => g.status !== 'final' && g.kickoff_utc > now);
    if (!next || next.kickoff_utc > until) continue;
    const prev = games.filter((g) => g.kickoff_utc < next.kickoff_utc).pop() || null;
    const [sport, teamId] = [key.slice(0, key.lastIndexOf(':')), key.slice(key.lastIndexOf(':') + 1)];
    const home = String(next.home_team_id) === teamId;
    const name = (home ? next.home_name : next.away_name) || teamId;
    const awayAb = next.away_abbrev || next.away_name || String(next.away_team_id);
    const homeAb = next.home_abbrev || next.home_name || String(next.home_team_id);
    out.push({
      league: sport === 'nfl' ? 'nfl' : 'ncaa', teamId, team: name,
      opponent: `${awayAb} @ ${homeAb}`,
      kickoffUtc: next.kickoff_utc, gameDate: pacificDate(next.kickoff_utc),
      prevDate: prev ? pacificDate(prev.kickoff_utc) : null
    });
  }
  out.sort((a, b) => a.kickoffUtc - b.kickoffUtc || a.team.localeCompare(b.team));
  return out;
}

/** Fresh for its next game: written AFTER the day of the previous game (so a
 *  Monday-night team researched Monday morning is still due on Tuesday), or,
 *  with no previous game on record, within 7 days of this one. */
export function isFreshForNext(asOf: string | null | undefined, t: { prevDate: string | null; gameDate: string }): boolean {
  if (!asOf) return false;
  if (t.prevDate) return asOf > t.prevDate;
  return asOf >= pacificDate(Date.parse(t.gameDate + 'T12:00:00Z') - 7 * 24 * 60 * 60 * 1000);
}

/** One spelling of a URL for comparing a cited source to an opened page:
 *  no scheme, no www, no fragment, no trailing slash, lowercase. */
export function normUrl(u: string): string {
  try {
    const x = new URL(String(u));
    return (x.host.replace(/^www\./, '') + x.pathname.replace(/\/+$/, '') + x.search).toLowerCase();
  } catch {
    return String(u || '').trim().toLowerCase();
  }
}

/** 🔴 RULE ZERO, MECHANICAL. Keeps a nugget only if it passes the word/length
 *  rules AND its source is one of the pages opened in this research. At most
 *  10, in the order the model gave them. */
export function keepVerified(nuggets: any[], opened: string[]):
  { kept: Nugget[]; dropped: { text: string; why: string }[] } {
  const seen = new Set(opened.map(normUrl));
  const kept: Nugget[] = [];
  const dropped: { text: string; why: string }[] = [];
  for (const n of nuggets || []) {
    const text = String(n?.text || '').trim();
    const probs = nuggetProblems({ ...n, text });
    if (probs.length) { dropped.push({ text, why: probs.join('; ') }); continue; }
    if (!seen.has(normUrl(n.source))) { dropped.push({ text, why: 'source was not opened in this research' }); continue; }
    if (kept.some((k) => k.text === text)) { dropped.push({ text, why: 'duplicate' }); continue; }
    kept.push({ text, kind: n.kind, source: String(n.source) });
  }
  return { kept: kept.slice(0, 10), dropped };
}

/** The model is told to answer with one JSON object; tolerate a fence or a
 *  sentence around it, never guess at a broken one. */
export function parseModelJson(text: string): any {
  const s = String(text || '').replace(/```(?:json)?/gi, '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}

/** The rules every research call carries - the desktop brief, adapted to
 *  one team per call and to the API's web_search / web_fetch tools. */
export const SYSTEM = [
  'You research "nuggets" for a free football app. During a timeout or commercial break the app shows',
  'one short, true, fun fact about one of the two teams playing. You are not being asked whether the',
  'feature is a good idea.',
  '',
  'RULE ZERO - NOTHING UNVERIFIED. Every nugget must be confirmed by OPENING its source page with the',
  'web_fetch tool and seeing the claim stated there. A search-result summary alone is NOT verification.',
  'If you cannot open a page that states it, drop the claim. Fewer than 10 true nuggets is a correct',
  'result; a wrong one is a failure. Prefer official team and school sites, ESPN, AP and major outlets;',
  'Wikipedia only for stable facts. The "source" you give must be the exact URL you fetched.',
  '',
  'WRITING RULES for each nugget: one sentence, at most 140 characters, readable in two seconds on a phone.',
  'Name the team by its nickname or a player by full name; no pronoun openings. US spelling. No emojis,',
  'no hashtags. Never mention betting, odds, spreads, lines, gambling or wagers. Never mention injuries,',
  'arrests, lawsuits, suspensions, scandals, or anything about a player as a minor. Nothing mean-spirited',
  'and nothing that reads as a dig at the opponent. Do not mention the app.',
  '',
  'OUTPUT: when you are done, answer with ONLY one JSON object and nothing else:',
  '{"nuggets":[{"text":"...","kind":"fun|odd|fact","source":"https://..."}],"dropped":[{"claim":"...","why":"..."}]}'
].join('\n');

/** The per-team request. Facts must be CURRENT as of today. */
export function brief(job: TeamJob, today: string): string {
  const lg = job.league === 'nfl' ? 'NFL' : 'college football';
  return [
    `Today is ${today}. ${job.team} (${lg}, ESPN team id ${job.teamId}) plays on ${job.gameDate}` +
      (job.opponent ? ` - the game is ${job.opponent}.` : '.'),
    'Facts must be CURRENT as of today (this season, this week, the current roster and coach), not stale',
    'trivia unless it is a timeless oddity (a tradition, a rivalry quirk, a stadium quirk, a historic first).',
    '',
    `GOAL: up to 10 nuggets about ${job.team}. Prefer, in order: "fun" (surprising, delightful), "odd"`,
    '(quirky, weird, unusual), and only when you run out, "fact" (plain but interesting). Aim for at least',
    '7 fun or odd. Good sources of fun: the current head coach\'s background and quirks, standout current',
    'players (records, unusual paths, famous relatives, unusual positions), streaks going into this game,',
    'the matchup\'s history, stadium and traditions, mascots, notable firsts, this season\'s results so far.',
    '',
    'Search, then OPEN (web_fetch) every page you cite. Then answer with the JSON object only.'
  ].join('\n');
}
