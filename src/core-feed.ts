/* 🔴 THE CORE API, SHAPED LIKE THE SUMMARY - so the poller can move off Jason's
 * laptop without a second parser.
 *
 * Jason, 2026-09-09, with the opener in the fourth quarter: "Remove the puller
 * off my machine." It was a node process on a laptop with 26% battery on Modern
 * Standby, and the vault already records what that machine does to long-running
 * work: it suspends it mid-run and nothing says so. Every live board in this
 * app depended on it staying awake.
 *
 * 🔴 THE BLOCKER WAS REAL AND IT IS NOT WHERE THE VAULT SAID. Probed from a
 * deployed Worker rather than assumed:
 *
 *     site.api.espn.com        403     the endpoint poll.mjs uses
 *     sports.core.api.espn.com 200     everything, including wallclock
 *
 * So Cloudflare can reach ESPN; it cannot reach the ONE host we happened to
 * build on. The note in the vault said "site.api 403s from Cloudflare" and was
 * read for months as "ESPN 403s from Cloudflare", which is the difference
 * between an impossible feature and a different URL.
 *
 * 🔴 THIS FILE IS A SHIM, NOT A SECOND PARSER. readLive/readPlays/readDrives
 * are the settled, tested reading of a game and they must not be forked - a
 * second parser is a second set of bugs and the play grammar has already cost
 * this project three of them. So the core feed is reassembled into the shape
 * the summary endpoint returns, and the existing reader is handed that.
 *
 * The differences the shim absorbs:
 *   - core returns a FLAT play list; the summary nests plays inside drives
 *   - core gives every team as a $ref URL; the summary inlines the object
 *   - core splits status, event and drives across separate documents
 */

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  + ' (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const LEAGUE: Record<string, string> = {
  nfl: 'nfl', 'college-football': 'college-football'
};

/** "http://.../teams/26?lang=en" -> "26". The core API's only real awkwardness.
 *
 * 🔴 THE LAST SEGMENT, NOT THE FIRST MATCH. The first version searched for
 * `/(teams|drives|events|competitions)/(\d+)/` and every ref in this API begins
 * `/events/<eventId>/competitions/<eventId>/...`, so it returned the EVENT id
 * for everything. Every play grouped under a drive that did not exist and the
 * shim produced 17 drives holding zero plays - a clean, plausible, entirely
 * empty game. A regex that matches the wrong thing everywhere is harder to see
 * than one that matches nothing. */
export function idFromRef(ref: unknown): string {
  const s = String((ref as any)?.$ref ?? ref ?? '').split('?')[0];
  const m = s.match(/\/(\d+)\/?$/);
  return m ? m[1] : '';
}

async function get(url: string): Promise<any> {
  const r = await fetch(url, { headers: { 'user-agent': UA } });
  if (!r.ok) throw new Error(`${r.status} ${url.slice(0, 90)}`);
  return r.json();
}

/* Teams change never; scores change every play. Only the first is cached, and
 * only for the life of this isolate - a stale team name is a cosmetic risk, a
 * stale score is a lie. */
const teamCache = new Map<string, any>();

export async function coreSummary(gameId: string, sport: string): Promise<any> {
  const lg = LEAGUE[sport] || 'nfl';
  const base = `https://sports.core.api.espn.com/v2/sports/football/leagues/${lg}/events/${gameId}`;
  const comp = `${base}/competitions/${gameId}`;

  const [ev, status, playsDoc, drivesDoc] = await Promise.all([
    get(base),
    get(`${comp}/status`).catch(() => null),
    get(`${comp}/plays?limit=400`).catch(() => ({ items: [] })),
    get(`${comp}/drives?limit=100`).catch(() => ({ items: [] }))
  ]);

  /* ---- competitors, with the team documents followed ---- */
  const cs = (ev?.competitions?.[0]?.competitors) || [];
  const competitors = await Promise.all(cs.map(async (c: any) => {
    const tid = idFromRef(c.team);
    if (!teamCache.has(tid)) {
      try { teamCache.set(tid, await get(String(c.team?.$ref))); } catch { teamCache.set(tid, {}); }
    }
    const t = teamCache.get(tid) || {};
    let score: number | null = null;
    if (c.score?.$ref) { try { score = (await get(String(c.score.$ref)))?.value ?? null; } catch { /* not posted */ } }
    return {
      homeAway: c.homeAway,
      score,
      team: {
        id: tid, abbreviation: t.abbreviation, displayName: t.displayName,
        shortDisplayName: t.shortDisplayName, name: t.name,
        color: t.color, alternateColor: t.alternateColor
      }
    };
  }));

  /* ---- plays, grouped back under the drive that owns them ---- */
  const flat = (playsDoc?.items || []).map((p: any) => ({
    ...p,
    /* The reader wants `{id}`, not a URL. Rewritten here rather than in the
       reader, which must go on working against the summary shape too. */
    start: p.start ? { ...p.start, team: { id: idFromRef(p.start.team) } } : p.start,
    end: p.end ? { ...p.end, team: { id: idFromRef(p.end.team) } } : p.end,
    __driveId: idFromRef(p.drive)
  }));

  const drives = (drivesDoc?.items || []).map((d: any) => ({
    id: String(d.id ?? ''),
    team: { id: idFromRef(d.team) },
    result: d.result || d.shortDisplayResult || '',
    displayResult: d.displayResult || '',
    plays: flat.filter((p: any) => p.__driveId === String(d.id ?? ''))
  }));

  /* 🔴 A DRIVE WITH NO RESULT IS THE ONE STILL BEING PLAYED - the same rule the
   * summary path learned the hard way tonight, when ESPN listed the running
   * drive in `previous` as well and every drive call voided on a phantom. Here
   * the result is the only signal, which is the version that could not have
   * had that bug. */
  const previous = drives.filter((d: any) => d.result);
  const current = drives.find((d: any) => !d.result) || null;

  return {
    header: {
      competitions: [{
        id: gameId,
        competitors,
        status: status || undefined
      }]
    },
    /* Status lives in two places on the summary; both are filled so the reader
       finds it wherever it looks. */
    status,
    drives: { previous, current }
  };
}
