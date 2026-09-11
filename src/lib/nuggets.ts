/* NUGGETS - WHICH TEAMS ARE DUE. The pure half of the weekly rule, shared by the
 * Worker's due list and alert (src/nugget-due.ts) and the laptop run
 * (tools/nugget-teams.mjs), so both agree on what "fresh" means.
 *
 * The research itself runs on the laptop (tools/nuggets-research.md). A
 * Cloudflare version - a Durable Object against the Claude API - was built and
 * measured on 2026-09-11 at $2.29 a team; Jason chose the laptop ("Laptop.") and
 * then had it removed ("Remove the cloudflare research"). It is in git history.
 */

/** A calendar date in Pacific - the vault's and the product's zone. */
export function pacificDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
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
