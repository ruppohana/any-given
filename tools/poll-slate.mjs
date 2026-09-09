/* THE REAL SLATE. Jason, 2026-09-08, looking at My picks: "These are not correct
 * games, right?" They were not — every pool screen ran on preview data: real
 * team identities out of teams.json, invented matchups, spreads and finals.
 *
 * 🔴 A FABRICATED FINAL SCORE IN THE SAME TYPE AS A REAL ONE is the vault's
 * "never invent a fixture" rule leaking out of the test suite and into the
 * product, where the person reading it has no way to tell. This is the fix:
 * the pool's games come off the feed, like the live layer's do.
 *
 *   node tools/poll-slate.mjs --sport college-football --week 2
 *   node tools/poll-slate.mjs --sport nfl --week 1
 *
 * 🔴 IT USES THE CORE API, NOT THE SITE API. `site.api` /scoreboard 403s from
 * this machine and from Cloudflare both; `sports.core.api` answers. That is the
 * same split the game poller found, and it is why this runs on the host.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : args[i + 1]; };
const sport = flag('sport', 'college-football');
const week = Number(flag('week', 2));
const season = Number(flag('season', 2026));
const base = flag('base', 'https://any-given.ruppohana.workers.dev');

const tokenFile = fileURLToPath(new URL('../.push-token.local', import.meta.url));
const token = process.env.PUSH_TOKEN || (existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : '');
if (!token) { console.error('no push token'); process.exit(1); }

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  + ' (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const CORE = 'https://sports.core.api.espn.com/v2/sports/football/leagues/' + sport;

const get = async (url) => {
  const r = await fetch(url, { headers: { 'user-agent': UA } });
  if (!r.ok) throw new Error(`${r.status} ${url.slice(0, 90)}`);
  return r.json();
};
const col = (c) => {
  const s = typeof c === 'string' ? c.replace('#', '').toLowerCase() : '';
  return /^[0-9a-f]{6}$/.test(s) && s !== '000000' ? s : null;
};

/* 🔴 SOMETHING WORTH OPENING. Jason, 2026-09-09 asked for an info link pulling
 * up a head-to-head card, and then: "Yes something worth opening." A card that
 * shows the same three facts already printed on the row is a link people tap
 * once. Records and rank are the two things that make a spread argue with you -
 * they are why Miami -56.5 is not the same proposition as Michigan -5.5.
 *
 * Three additions, all read from the feed and none of them derived:
 *   record      this season, as the book has it
 *   lastRecord  LAST season, fetched only when this one is 0-0 - which is every
 *               NFL team in week 1, where "0-0" is true and says nothing
 *   rank        AP Top 25, college only, and absent rather than 0 when unranked
 */
const RANK = {};
try {
  const rk = await get(`${CORE}/seasons/${season}/types/2/weeks/${week}/rankings/1`);
  for (const r of rk.ranks || []) {
    const id = (r.team?.$ref || '').split('/teams/')[1]?.split('?')[0];
    if (id && r.current) RANK[id] = r.current;
  }
  if (Object.keys(RANK).length) console.log(`${rk.name}: ${Object.keys(RANK).length} ranked`);
} catch { /* the NFL has no poll, and a college week before the first one has none either */ }

/* One fetch per team per run, memoised - the same team appears once a week, so
 * this is about not re-fetching when a retry re-walks an event. */
const RECORDS = {};
async function recordFor(teamId) {
  if (RECORDS[teamId] !== undefined) return RECORDS[teamId];
  let cur = null, prev = null;
  try {
    const r = await get(`${CORE}/seasons/${season}/types/2/teams/${teamId}/record`);
    cur = (r.items || []).find((i) => i.type === 'total')?.summary || null;
  } catch { /* no record posted */ }
  /* 🔴 ONLY WHEN THIS SEASON SAYS NOTHING. In NFL week 1 every record is 0-0,
   * which is accurate and useless - last season is the fact somebody actually
   * wants when deciding whether to take New England. Not fetched otherwise,
   * because by week 2 this season is the more relevant number and the extra
   * request is 48 more round trips for nothing. */
  if (!cur || cur === '0-0') {
    try {
      const r = await get(`${CORE}/seasons/${season - 1}/types/2/teams/${teamId}/record`);
      prev = (r.items || []).find((i) => i.type === 'total')?.summary || null;
    } catch { /* a new program has no last season */ }
  }
  RECORDS[teamId] = { record: cur, lastRecord: prev };
  return RECORDS[teamId];
}

const list = await get(`${CORE}/seasons/${season}/types/2/weeks/${week}/events?limit=400`);
const ids = (list.items || []).map((x) => x.$ref.split('/events/')[1].split('?')[0]);
console.log(`${sport} season ${season} week ${week}: ${ids.length} events`);

const games = [];
for (const id of ids) {
  try {
    const ev = await get(`${CORE}/events/${id}`);
    const comp = (ev.competitions || [])[0];
    if (!comp) continue;

    /* Competitors are refs; each carries a team ref and a score ref. Two fetches
     * a side, and it is why this is a poller rather than a page load. */
    const sides = [];
    for (const c of comp.competitors || []) {
      const team = await get(c.team.$ref);
      let score = null;
      if (c.score?.$ref) { try { score = (await get(c.score.$ref)).value ?? null; } catch { /* not played */ } }
      const rec = await recordFor(String(team.id));
      sides.push({
        id: String(team.id), abbrev: team.abbreviation || '', name: team.displayName || '',
        short: team.shortDisplayName || team.name || '',
        primary: col(team.color), secondary: col(team.alternateColor),
        record: rec.record, lastRecord: rec.lastRecord,
        /* Absent rather than 0 when unranked. A rank of 0 sorts and prints like a
         * rank, and "#0 Villanova" is worse than saying nothing. */
        rank: RANK[String(team.id)] || null,
        homeAway: c.homeAway, score
      });
    }
    const home = sides.find((x) => x.homeAway === 'home') || sides[0];
    const away = sides.find((x) => x.homeAway === 'away') || sides[1];
    if (!home || !away) continue;

    /* 🔴 THE SPREAD IS READ OR IT IS NULL. A pool "against the spread" with an
     * invented number is worse than one with no number: it looks authoritative
     * and it is fiction. Not every game has a line posted, and those say so. */
    let spread = null, provider = null;
    try {
      const odds = await get(`${CORE}/events/${id}/competitions/${id}/odds`);
      const o = (odds.items || [])[0];
      if (o && typeof o.spread === 'number') { spread = o.spread; provider = o.provider?.name || null; }
    } catch { /* no line posted */ }

    const st = comp.status?.$ref ? await get(comp.status.$ref).catch(() => null) : null;

    /* Followed, like every other ref on this object. Both are optional: a game
     * with no venue posted and no national broadcast is a real thing, and the
     * card says nothing rather than guessing. */
    let venue = null, broadcast = null;
    try {
      const v = comp.venue?.$ref ? await get(comp.venue.$ref) : comp.venue;
      venue = v?.fullName || null;
    } catch { /* no venue posted */ }
    try {
      const b = comp.broadcasts?.$ref ? await get(comp.broadcasts.$ref) : null;
      const first = (b?.items || [])[0];
      broadcast = first?.media?.shortName || (first?.names || [])[0] || null;
    } catch { /* not televised, or not yet announced */ }
    games.push({
      id, sport, season, week,
      kickoffUtc: Date.parse(ev.date),
      name: ev.name, shortName: ev.shortName,
      status: st?.type?.name === 'STATUS_FINAL' ? 'final'
        : st?.type?.name === 'STATUS_SCHEDULED' ? 'scheduled' : (st?.type?.name ? 'in_progress' : 'scheduled'),
      homeTeamId: home.id, awayTeamId: away.id,
      homeScore: home.score, awayScore: away.score,
      spread, spreadProvider: provider,
      /* 🔴 BOTH OF THESE ARE $ref OBJECTS, NOT VALUES. I assumed comp.broadcasts
       * was an array and called .map on it; every event in the week threw, and
       * the run then pushed a slate of ZERO GAMES over a correct one.
       *
       * Almost everything on the core API is a reference that has to be
       * followed - the competitors are, the score is, the status is, and this
       * file already followed all three. Reaching into two more as though they
       * were inline was the mistake, and the shape was one console.log away. */
      venue: venue,
      broadcast: broadcast,
      teams: [home, away].map(({ homeAway, score, ...t }) => t)
    });
    process.stdout.write('.');
  } catch (e) { process.stdout.write('x'); if (!globalThis.__firstErr) { globalThis.__firstErr = 1; console.error(' FIRST ERROR:', e && e.stack ? e.stack.split(String.fromCharCode(10)).slice(0,3).join(' | ') : e); } }
}

games.sort((a, b) => a.kickoffUtc - b.kickoffUtc);

/* 🔴 NEVER PUSH AN EMPTY WEEK OVER A GOOD ONE. Learned the hard way 2026-09-09:
 * a bug in this file made every event throw, and the run cheerfully pushed a
 * slate of ZERO GAMES to production - wiping a correct capture and emptying the
 * app's only source of fixtures. The poller runs every ten minutes unattended,
 * so a transient upstream failure would have done the same thing at any hour.
 *
 * A capture that found nothing is a FAILED RUN, not a week with no football in
 * it. It exits without writing and leaves the last good copy in place. */
if (!games.length) {
  console.error(`
NO GAMES CAPTURED for ${sport} week ${week} - refusing to overwrite the last good slate.`);
  process.exit(1);
}
const key = `slate:${sport}:${season}:${week}`;
const res = await fetch(base + '/api/push', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-push-token': token },
  body: JSON.stringify({ key, state: { sport, season, week, games, fetchedAt: Date.now() } })
});
console.log(`\n${games.length} real games, ${games.filter((g) => g.spread != null).length} with a posted line`);
console.log(res.ok ? `pushed -> ${base}/api/state/${key}` : `push failed ${res.status}`);

/* 🔴 AND INTO D1, WHICH IS WHAT MAKES A POOL SCOREABLE. KV holds the slate the
 * screens render; the `game` table is what the standings query joins to in order
 * to decide who was right. Without this write the board can count picks and can
 * never grade one - everybody sits on zero wins for ever, which reads as a
 * scoring bug and is a missing write.
 *
 * Same payload, second destination, token-protected: a client that could report
 * a final score could grade its own pick. */
const d1 = await fetch(base + '/api/pool/games', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-push-token': token },
  body: JSON.stringify({ sport, season, week, games })
});
console.log(d1.ok ? `D1 <- ${games.length} games` : `D1 write failed ${d1.status}`);
