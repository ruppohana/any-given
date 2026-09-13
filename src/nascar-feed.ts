/* NASCAR FROM THE FEED - the current race in each national series, its cars and its result.
 *
 * Three series, one shape (probed 2026-09-13), each a pool sport of its own:
 *   nascar           Cup Series                       racing/nascar-premier
 *   nascar-oreilly   O'Reilly Auto Parts Series        racing/nascar-secondary   (the old Xfinity)
 *   nascar-truck     Truck Series                      racing/nascar-truck
 * Jason, 2026-09-12: "do nascar next"; 2026-09-13: "add the O'Reilly and Truck series too".
 *
 * Two ESPN reads per series, both answering from Cloudflare (the same hosts as F1):
 *   site.web.api  .../racing/<path>/scoreboard      the race, status, finishing order (1 request)
 *   core API      .../events/<e>/competitions/<c>   cars, makes, the grid (1 request, kept for the race)
 * 🔴 ESPN ONLY. NASCAR's own feed (cf.nascar.com) is richer and its terms ban
 * scraping - research page, NASCAR deep dive. A pool needs results, and ESPN has them.
 *
 * Served on demand and by the cron, cached in KV per series: 45 seconds around a
 * race, ten minutes otherwise. A finished race is kept (<series>:event:<id>, 400
 * days) so a group's season board scores it after the scoreboard moves on.
 */
import { parseNascar } from './lib/nascar.ts';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  + ' (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const DAY = 60 * 60 * 24;   // seconds - KV's unit

export const NASCAR_SERIES: Record<string, { path: string; label: string }> = {
  nascar: { path: 'nascar-premier', label: 'Cup Series' },
  'nascar-oreilly': { path: 'nascar-secondary', label: "O'Reilly Auto Parts Series" },
  'nascar-truck': { path: 'nascar-truck', label: 'Truck Series' }
};
export const isNascar = (s: unknown) => Object.prototype.hasOwnProperty.call(NASCAR_SERIES, String(s));
const seriesOf = (s: unknown) => (isNascar(s) ? String(s) : 'nascar');

async function getJson(url: string, f: typeof fetch) {
  const r = await f(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
  if (!r.ok) throw new Error(`espn ${r.status}`);
  return r.json();
}

export function isStaleNascar(doc: any, now: number): boolean {
  const age = now - (Number(doc?.fetchedAt) || 0);
  const e = doc?.event;
  const hot = !!e && (e.state === 'live'
    || (e.state === 'pre' && now >= e.start - 15 * 60 * 1000 && now < e.start + 5 * 60 * 60 * 1000));
  return age > (hot ? 45 * 1000 : 10 * 60 * 1000);
}

export async function captureNascar(env: any, f: typeof fetch = fetch, now = Date.now(), series = 'nascar') {
  const sport = seriesOf(series);
  const path = NASCAR_SERIES[sport].path;
  const sb = await getJson(`https://site.web.api.espn.com/apis/site/v2/sports/racing/${path}/scoreboard`, f);
  const first = parseNascar(sb);
  if (!first) throw new Error('no ' + sport + ' race on the scoreboard');

  /* The cars and the grid, once per race - and again once it is final, for the
     fuller finishing order the core document carries. */
  const cKey = `${sport}:core:${first.id}`;
  let core: any = null;
  try { core = JSON.parse((await env.LIVE.get(cKey)) || 'null'); } catch { core = null; }
  const finalNow = first.state === 'final';
  if (!core || (finalNow && !core.__final)) {
    try {
      const doc = await getJson(`https://sports.core.api.espn.com/v2/sports/racing/leagues/${path}/events/${first.id}/competitions/${first.compId}`, f);
      core = { competitors: doc.competitors || [], __final: finalNow };
      await env.LIVE.put(cKey, JSON.stringify(core), { expirationTtl: 30 * DAY });
    } catch { /* names alone still make a pick */ }
  }
  const event = parseNascar(sb, core);
  const out = { schema: 1, series: sport, label: NASCAR_SERIES[sport].label, event, fetchedAt: now };
  await env.LIVE.put(`${sport}:current`, JSON.stringify(out), { expirationTtl: 14 * DAY });
  if (event && event.state === 'final' && event.order.length >= 3) {
    const aKey = `${sport}:event:${event.id}`;
    try {
      if (!(await env.LIVE.get(aKey))) await env.LIVE.put(aKey, JSON.stringify({ event }), { expirationTtl: 400 * DAY });
    } catch { /* the next capture tries again */ }
  }
  return out;
}

export async function serveNascar(env: any, now = Date.now(), f: typeof fetch = fetch, series = 'nascar') {
  const sport = seriesOf(series);
  let doc: any = null;
  try { doc = JSON.parse((await env.LIVE.get(`${sport}:current`)) || 'null'); } catch { doc = null; }
  if (doc && !isStaleNascar(doc, now)) return doc;
  try { return await captureNascar(env, f, now, sport); } catch { return doc; }
}
