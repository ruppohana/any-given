/* THE SLATE, FROM ESPN. Development only, and the vault is explicit about why:
 * "ESPN's undocumented endpoint — fine personally, unshippable in a product."
 * CollegeFootballData Tier 2 at $5/month is what ships for college. This module
 * exists so a pool can be tested against real games this weekend without waiting
 * for that, and so the shape of the ingestion is settled before the paid feed is
 * wired to it.
 *
 * 🔴 NFL FIRST, DELIBERATELY. The pool half is sport-agnostic - it needs games,
 * kickoffs, teams and final scores and does not care what sport - so the same
 * code reads both. NFL is 16 games a week against college's 131, which means
 * every bug is visible rather than buried, and everybody already knows the teams.
 * College is the product; NFL is the rig.
 *
 * THE LIVE LAYER IS NOT SPORT-AGNOSTIC and nothing here changes that: the model
 * is 697,997 COLLEGE plays and there is no NFL equivalent.
 */

export type Sport = 'nfl' | 'college-football';

const PATH: Record<Sport, string> = {
  nfl: 'football/nfl',
  'college-football': 'football/college-football'
};

export type FeedGame = {
  id: string;
  sport: Sport;
  season: number;
  week: number;
  kickoffUtc: number;
  homeTeamId: string;
  awayTeamId: string;
  status: 'scheduled' | 'in_progress' | 'final' | 'void';
  homeScore: number | null;
  awayScore: number | null;
  /** Identity travels WITH the game, because a slate is useless without it and
   *  the team file we ship is college-only. */
  teams: FeedTeam[];
};

export type FeedTeam = {
  id: string;
  abbrev: string;
  name: string;
  short: string;
  primary: string | null;
  secondary: string | null;
};

/** ESPN says '000000' for "we have no color", exactly as the college file does. */
function color(c: unknown): string | null {
  const s = typeof c === 'string' ? c.replace('#', '').toLowerCase() : '';
  return /^[0-9a-f]{6}$/.test(s) && s !== '000000' ? s : null;
}

/**
 * 🔴 STATUS IS READ, NEVER INFERRED. ESPN's own type name is the authority: a
 * game is final because the feed says STATUS_FINAL, not because its kickoff has
 * passed. A pool that decided "final" from a clock would score a postponed game
 * as a loss for everybody who picked the other side.
 *
 * Anything ESPN calls cancelled or postponed becomes `void`, which is this
 * product's ONE void path: the game did not happen, for everybody.
 */
function status(name: string): FeedGame['status'] {
  switch (name) {
    case 'STATUS_FINAL':
    case 'STATUS_FINAL_OVERTIME':
      return 'final';
    case 'STATUS_CANCELED':
    case 'STATUS_POSTPONED':
    case 'STATUS_SUSPENDED':
      return 'void';
    case 'STATUS_SCHEDULED':
      return 'scheduled';
    default:
      return 'in_progress';
  }
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * One week of one sport, as rows a pool can use.
 *
 * @param fetchImpl injected so this is testable against a captured payload and
 *   never has to reach the network in a test. The vault's rule is that a fixture
 *   is only evidence if it came from the feed; this keeps the seam honest.
 */
export async function fetchSlate(
  sport: Sport,
  opts: { week?: number; season?: number; fetchImpl?: typeof fetch } = {}
): Promise<FeedGame[]> {
  const f = opts.fetchImpl || fetch;
  const q = new URLSearchParams();
  if (opts.week) q.set('week', String(opts.week));
  if (opts.season) q.set('dates', String(opts.season));
  const url = `https://site.api.espn.com/apis/site/v2/sports/${PATH[sport]}/scoreboard`
    + (q.toString() ? `?${q}` : '');

  const res = await f(url);
  if (!res.ok) throw new Error(`espn ${sport} ${res.status}`);
  return parseSlate(await res.json(), sport);
}

/** The pure half. Everything above it is one fetch; everything below is testable
 *  against a payload that was captured rather than invented. */
export function parseSlate(payload: any, sport: Sport): FeedGame[] {
  const out: FeedGame[] = [];
  for (const ev of payload?.events || []) {
    const comp = (ev.competitions || [])[0];
    if (!comp) continue;
    const cs = comp.competitors || [];
    const home = cs.find((c: any) => c.homeAway === 'home');
    const away = cs.find((c: any) => c.homeAway === 'away');
    if (!home || !away) continue;

    const kickoff = Date.parse(ev.date);
    if (!Number.isFinite(kickoff)) continue;

    const teams: FeedTeam[] = [home, away].map((c: any) => ({
      id: String(c.team?.id),
      abbrev: c.team?.abbreviation || '',
      name: c.team?.displayName || '',
      short: c.team?.shortDisplayName || c.team?.name || '',
      primary: color(c.team?.color),
      secondary: color(c.team?.alternateColor)
    }));

    out.push({
      id: String(ev.id),
      sport,
      season: Number(ev.season?.year) || new Date(kickoff).getUTCFullYear(),
      week: Number(ev.week?.number) || 0,
      kickoffUtc: kickoff,
      homeTeamId: String(home.team?.id),
      awayTeamId: String(away.team?.id),
      status: status(comp.status?.type?.name || ev.status?.type?.name || ''),
      homeScore: num(home.score),
      awayScore: num(away.score),
      teams
    });
  }
  /* Kickoff order, because that is the order every screen reads them in and the
   * order the lock rule runs in. */
  return out.sort((a, b) => a.kickoffUtc - b.kickoffUtc);
}
