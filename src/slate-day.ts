/* THE SLATE FOR A SPORT THAT PLAYS EVERY DAY - ONE REQUEST PER DAY.
 *
 * 🔴 site.web.api, NOT site.api AND NOT THE CORE API. Tested from Cloudflare's
 * edge on 2026-09-12 (a throwaway `wrangler dev --remote` worker):
 *
 *     site.api.espn.com       .../scoreboard   403
 *     site.web.api.espn.com   .../scoreboard   200, 78 games, 390 KB
 *     sports.core.api         .../events       200, but a list of links
 *
 * The football slate uses the core API because site.api refuses Cloudflare,
 * and pays for it: six to nine requests per game, 86 games. A basketball day
 * through the core API would be 170 x 6 - over a Worker's request budget. The
 * same day through site.web.api is ONE request, with the scores, the clock,
 * the ranks, the records, the channel and the line all inline.
 *
 * The game shape is the football slate's (src/slate-cron.ts), so The slate
 * draws a basketball card with the code that draws a football one.
 */
import { DAY_SPORTS, CONF_SHORT, dayOf, addDays } from './lib/day.ts';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  + ' (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const col = (c: unknown) => {
  const s = typeof c === 'string' ? c.replace('#', '').toLowerCase() : '';
  return /^[0-9a-f]{6}$/.test(s) && s !== '000000' ? s : null;
};
const numOrNull = (v: unknown) => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

/* Read, never inferred - see src/feed/espn.ts. Postponed and cancelled are the
   one void path: the game did not happen, for everybody. */
function statusOf(name: string): string {
  switch (name) {
    case 'STATUS_FINAL':
    case 'STATUS_FINAL_OVERTIME':
      return 'final';
    case 'STATUS_SCHEDULED':
      return 'scheduled';
    case 'STATUS_CANCELED':
    case 'STATUS_POSTPONED':
    case 'STATUS_SUSPENDED':
    case 'STATUS_FORFEIT':
      return 'void';
    default:
      return 'in_progress';
  }
}

/** One scoreboard day, as slate games. Pure - tested on captured payloads. */
export function parseDay(payload: any, sport: string, day: string): any[] {
  const out: any[] = [];
  for (const ev of payload?.events || []) {
    const comp = (ev.competitions || [])[0];
    if (!comp) continue;
    const cs = comp.competitors || [];
    const h = cs.find((c: any) => c.homeAway === 'home');
    const a = cs.find((c: any) => c.homeAway === 'away');
    if (!h || !a) continue;
    const kickoff = Date.parse(ev.date);
    if (!Number.isFinite(kickoff)) continue;

    const statusName = String(comp.status?.type?.name || ev.status?.type?.name || 'STATUS_SCHEDULED');
    const status = statusOf(statusName);
    const started = status === 'in_progress' || status === 'final';
    const pn = Number(comp.status?.period);
    const period = Number.isFinite(pn) && pn > 0 ? pn : null;

    /* A conference game names its own conference; otherwise the counted table. */
    const gameConf = comp.conferenceCompetition && comp.groups?.shortName ? String(comp.groups.shortName) : null;
    const side = (c: any) => {
      const t = c.team || {};
      const rk = Number(c.curatedRank?.current);
      const total = (c.records || []).find((r: any) => r?.type === 'total') || (c.records || [])[0];
      const periods = started
        ? (c.linescores || []).map((x: any) => Number(x?.value)).filter((n: number) => Number.isFinite(n))
        : [];
      return {
        id: String(t.id), abbrev: t.abbreviation || '', name: t.displayName || '',
        short: t.shortDisplayName || t.name || '',
        primary: col(t.color), secondary: col(t.alternateColor),
        rank: Number.isFinite(rk) && rk >= 1 && rk <= 25 ? rk : null,
        conference: gameConf || CONF_SHORT[String(t.conferenceId)] || null,
        record: total?.summary || null,
        form: null,
        score: started ? numOrNull(c.score) : null,
        periods: periods.length ? periods : null
      };
    };
    const home = side(h), away = side(a);

    const o = (comp.odds || [])[0] || null;
    const ml = (s: 'home' | 'away') => {
      const direct = o?.[s + 'TeamOdds']?.moneyLine;
      if (typeof direct === 'number') return direct;
      const raw = o?.moneyline?.[s]?.close?.odds ?? o?.moneyline?.[s]?.open?.odds;
      const v = Number(raw);
      return Number.isFinite(v) && v !== 0 ? v : null;
    };
    const bc = (comp.broadcasts || [])[0];

    out.push({
      id: String(ev.id), sport, day,
      season: Number(ev.season?.year) || null, week: 0,
      kickoffUtc: kickoff,
      name: ev.name, shortName: ev.shortName,
      status, statusName, period,
      clock: typeof comp.status?.displayClock === 'string' ? comp.status.displayClock : null,
      homeTeamId: home.id, awayTeamId: away.id,
      homeScore: home.score, awayScore: away.score,
      /* ESPN's convention, same as football: the HOME number, negative = home favoured. */
      spread: typeof o?.spread === 'number' ? o.spread : null,
      spreadProvider: o?.provider?.name || null,
      total: typeof o?.overUnder === 'number' ? o.overUnder : null,
      moneylineHome: ml('home'), moneylineAway: ml('away'),
      venue: comp.venue?.fullName || null,
      broadcast: (bc?.names || [])[0] || (typeof comp.broadcast === 'string' ? comp.broadcast : null) || null,
      neutral: !!comp.neutralSite,
      lastMeeting: null,
      teams: [home, away].map(({ score, periods, ...t }) => t),
      rankHome: home.rank, rankAway: away.rank,
      conferences: [...new Set([home.conference, away.conference].filter(Boolean))],
      periodsHome: home.periods, periodsAway: away.periods
    });
  }
  return out.sort((x, y) => x.kickoffUtc - y.kickoffUtc);
}

const DAY_TTL = 60 * 60 * 24 * 14;   // seconds - KV's unit, never milliseconds

/** Fetch one day and write it to KV. Never writes an empty day over a good one:
 *  a capture that found nothing where something was is a failed run. */
export async function captureDay(env: any, sport: string, day: string, fetchImpl: typeof fetch = fetch, now = Date.now()) {
  const cfg = DAY_SPORTS[sport];
  if (!cfg) throw new Error('not a day sport: ' + sport);
  const url = `https://site.web.api.espn.com/apis/site/v2/sports/${cfg.path}/scoreboard`
    + `?dates=${day}&groups=${cfg.groups}&limit=400`;
  const res = await fetchImpl(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
  if (!res.ok) throw new Error(`espn ${res.status}`);
  const games = parseDay(await res.json(), sport, day);
  const key = `day:${sport}:${day}`;
  if (!games.length) {
    try {
      const prev = JSON.parse((await env.LIVE.get(key)) || 'null');
      if (prev && Array.isArray(prev.games) && prev.games.length) {
        return { key, wrote: 0, skipped: 'empty capture over a good one', doc: prev };
      }
    } catch { /* nothing usable before either */ }
  }
  const doc = { sport, day, schema: 1, games, fetchedAt: now, by: 'day' };
  await env.LIVE.put(key, JSON.stringify(doc), { expirationTtl: DAY_TTL });
  return { key, wrote: games.length, doc };
}

/** Is a stored day too old to serve? A minute while a game is on or about to
 *  tip; ten minutes otherwise - a posted line or a tip time moves slower. */
export function isStale(doc: any, now: number): boolean {
  const age = now - (Number(doc?.fetchedAt) || 0);
  const hot = (doc?.games || []).some((g: any) => g.status === 'in_progress'
    || (g.status === 'scheduled' && now >= g.kickoffUtc - 15 * 60 * 1000 && now < g.kickoffUtc + 4 * 60 * 60 * 1000));
  return age > (hot ? 45 * 1000 : 10 * 60 * 1000);
}

/** What the board reads: KV, refreshed from the feed when stale - but only for
 *  days near today, so an old or far-off date can never be used to make the
 *  Worker fetch on demand. */
export async function serveDay(env: any, sport: string, day: string, now = Date.now(), fetchImpl: typeof fetch = fetch) {
  const key = `day:${sport}:${day}`;
  let doc: any = null;
  try { doc = JSON.parse((await env.LIVE.get(key)) || 'null'); } catch { doc = null; }
  const today = dayOf(now);
  const near = day >= addDays(today, -1) && day <= addDays(today, 6);
  if (doc && !isStale(doc, now)) return doc;
  if (!near) return doc;
  try {
    const r = await captureDay(env, sport, day, fetchImpl, now);
    return r.doc || doc;
  } catch { return doc; }
}
