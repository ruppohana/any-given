/* WHEN AN OFF-SEASON POOL HAS GAMES AGAIN - the countdown on its page. Jason, 2026-09-13:
 * "if any are out of season put a countdown clock on the page."
 *
 * ESPN's scoreboard for a league, asked with no date, carries the season's calendar - every
 * date that has games. The first one on or after today is when the pool has games again:
 * read on the real NBA (Oct 3), NHL (Sept 19), college basketball (Nov 2) and college hockey
 * (Oct 2) scoreboards the night of 2026-09-13. No date is typed in by hand, so the clock is
 * right every season without anyone touching it.
 *
 *   GET /api/season/next?sport=<day sport>   { sport, label, nextAt }   nextAt null: nothing on the calendar
 *
 * Cached in KV for twelve hours; a failed read serves the last good answer.
 */
import { DAY_SPORTS } from './lib/day.ts';

type Json = (body: unknown, status?: number, ttl?: number) => Response;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const DAY = 86400000;

/** The first calendar date on or after the start of `now`'s UTC day, in ms - or null. The
 *  calendar is a list of date strings for these leagues; a list of {startDate} (or of weeks
 *  holding entries) is read the same way. */
export function nextGameFromCalendar(payload: any, now: number): number | null {
  const cal = payload?.leagues?.[0]?.calendar;
  if (!Array.isArray(cal)) return null;
  const dates: number[] = [];
  for (const c of cal) {
    if (typeof c === 'string') dates.push(Date.parse(c));
    else if (c && typeof c === 'object') {
      if (c.startDate) dates.push(Date.parse(c.startDate));
      for (const e of Array.isArray(c.entries) ? c.entries : []) if (e && e.startDate) dates.push(Date.parse(e.startDate));
    }
  }
  const from = now - (now % DAY);
  const next = dates.filter((d) => Number.isFinite(d) && d >= from).sort((a, b) => a - b)[0];
  return next ?? null;
}

export async function seasonNext(env: any, sport: string, now = Date.now(), fetchImpl: typeof fetch = fetch) {
  const cfg = DAY_SPORTS[sport];
  /* A sport gathered from several competitions (cricket) has no one calendar. */
  if (!cfg || cfg.leagues) return null;
  const key = 'season:next:' + sport;
  let cached: { at: number; nextAt: number | null } | null = null;
  try { cached = env?.LIVE ? JSON.parse((await env.LIVE.get(key)) || 'null') : null; } catch { cached = null; }
  if (cached && now - cached.at < 12 * 3600 * 1000 && (cached.nextAt == null || cached.nextAt >= now - (now % DAY))) {
    return { sport, label: cfg.label, nextAt: cached.nextAt };
  }
  try {
    const r = await fetchImpl(`https://site.web.api.espn.com/apis/site/v2/sports/${cfg.path}/scoreboard${cfg.groups ? '?groups=' + cfg.groups : ''}`,
      { headers: { 'user-agent': UA, accept: 'application/json' } });
    if (!r.ok) throw new Error('espn ' + r.status);
    const nextAt = nextGameFromCalendar(await r.json(), now);
    if (env?.LIVE) { try { await env.LIVE.put(key, JSON.stringify({ at: now, nextAt }), { expirationTtl: 60 * 60 * 24 }); } catch { /* fine */ } }
    return { sport, label: cfg.label, nextAt };
  } catch {
    return cached ? { sport, label: cfg.label, nextAt: cached.nextAt } : { sport, label: cfg.label, nextAt: null };
  }
}

export async function handleSeasonNext(req: Request, env: any, p: string, json: Json, fetchImpl: typeof fetch = fetch): Promise<Response | null> {
  if (p !== '/api/season/next') return null;
  const sport = String(new URL(req.url).searchParams.get('sport') || '');
  const r = await seasonNext(env, sport, Date.now(), fetchImpl);
  if (!r) return json({ error: 'not_a_day_sport', message: 'That sport has no season calendar.' }, 404);
  return json(r);
}
