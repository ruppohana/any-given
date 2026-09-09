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
      sides.push({
        id: String(team.id), abbrev: team.abbreviation || '', name: team.displayName || '',
        short: team.shortDisplayName || team.name || '',
        primary: col(team.color), secondary: col(team.alternateColor),
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
    games.push({
      id, sport, season, week,
      kickoffUtc: Date.parse(ev.date),
      name: ev.name, shortName: ev.shortName,
      status: st?.type?.name === 'STATUS_FINAL' ? 'final'
        : st?.type?.name === 'STATUS_SCHEDULED' ? 'scheduled' : (st?.type?.name ? 'in_progress' : 'scheduled'),
      homeTeamId: home.id, awayTeamId: away.id,
      homeScore: home.score, awayScore: away.score,
      spread, spreadProvider: provider,
      teams: [home, away].map(({ homeAway, score, ...t }) => t)
    });
    process.stdout.write('.');
  } catch (e) { process.stdout.write('x'); }
}

games.sort((a, b) => a.kickoffUtc - b.kickoffUtc);
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
