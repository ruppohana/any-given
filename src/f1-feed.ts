/* F1 FROM THE FEED - the current Grand Prix, its sessions and its results.
 *
 * Two ESPN hosts, both of which answer from Cloudflare:
 *   site.web.api   .../racing/f1/scoreboard      every session, status, running order (1 request)
 *   core API       .../events/<e>/competitions/<race>   car number, team, team colour (1 request,
 *                  then kept for the event)
 * and once the race is final, each competitor's status and statistics from the
 * core API - retirements and the fastest lap - fetched once and kept.
 *
 * Served on demand and cached in KV: a minute while a session is on or about to
 * start, ten minutes otherwise. No cron: F1 is one weekend in two.
 */
import { parseF1, raceExtras } from './lib/f1.ts';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  + ' (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const SB = 'https://site.web.api.espn.com/apis/site/v2/sports/racing/f1/scoreboard';
const CORE = 'https://sports.core.api.espn.com/v2/sports/racing/leagues/f1';
const DAY = 60 * 60 * 24;   // seconds - KV's unit

/* The core API hands out links on an internal host (sports.core.api.espn.pvt)
   and over http; both are rewritten before they are fetched. */
const fix = (u: string) => String(u).replace('http:', 'https:').replace('.espn.pvt/', '.espn.com/');

async function getJson(url: string, f: typeof fetch) {
  const r = await f(fix(url), { headers: { 'user-agent': UA, accept: 'application/json' } });
  if (!r.ok) throw new Error(`espn ${r.status}`);
  return r.json();
}

export function isStaleF1(doc: any, now: number): boolean {
  const age = now - (Number(doc?.fetchedAt) || 0);
  const hot = (doc?.event?.sessions || []).some((s: any) => s.state === 'live'
    || (s.state === 'pre' && now >= s.start - 15 * 60 * 1000 && now < s.start + 4 * 60 * 60 * 1000));
  return age > (hot ? 45 * 1000 : 10 * 60 * 1000);
}

export async function captureF1(env: any, f: typeof fetch = fetch, now = Date.now()) {
  const sb = await getJson(SB, f);
  const first = parseF1(sb);
  if (!first) throw new Error('no F1 event on the scoreboard');
  const race = first.sessions.find((s) => s.kind === 'race');

  /* Cars, once per event. */
  const vKey = `f1:vehicles:${first.id}`;
  let vehicles: Record<string, any> = {};
  try { vehicles = JSON.parse((await env.LIVE.get(vKey)) || '{}') || {}; } catch { vehicles = {}; }
  let raceDoc: any = null;
  if (race && !Object.keys(vehicles).length) {
    try {
      raceDoc = await getJson(`${CORE}/events/${first.id}/competitions/${race.id}`, f);
      for (const c of raceDoc.competitors || []) {
        if (c?.vehicle) vehicles[String(c.id)] = { ...c.vehicle, team: c.vehicle.manufacturer || null };
      }
      if (Object.keys(vehicles).length) await env.LIVE.put(vKey, JSON.stringify(vehicles), { expirationTtl: 30 * DAY });
    } catch { /* names alone still make a pick */ }
  }
  const event = parseF1(sb, vehicles);

  /* Retirements and the fastest lap, once the race is final - then kept. */
  let extras: any = null;
  if (race && event) {
    const eKey = `f1:extras:${race.id}`;
    try { extras = JSON.parse((await env.LIVE.get(eKey)) || 'null'); } catch { extras = null; }
    const raceNow = event.sessions.find((s) => s.id === race.id);
    if (!extras && raceNow && raceNow.state === 'final') {
      try {
        const doc = raceDoc || await getJson(`${CORE}/events/${first.id}/competitions/${race.id}`, f);
        const competitors = [];
        for (const c of doc.competitors || []) {
          competitors.push({
            competitor: c,
            status: c.status?.$ref ? await getJson(c.status.$ref, f) : c.status,
            statistics: c.statistics?.$ref ? await getJson(c.statistics.$ref, f) : null
          });
        }
        extras = raceExtras({ competitors });
        await env.LIVE.put(eKey, JSON.stringify(extras), { expirationTtl: 365 * DAY });
      } catch { extras = null; /* the next request tries again */ }
    }
  }

  const out = { schema: 1, event, extras, fetchedAt: now };
  await env.LIVE.put('f1:current', JSON.stringify(out), { expirationTtl: 14 * DAY });
  return out;
}

export async function serveF1(env: any, now = Date.now(), f: typeof fetch = fetch) {
  let doc: any = null;
  try { doc = JSON.parse((await env.LIVE.get('f1:current')) || 'null'); } catch { doc = null; }
  if (doc && !isStaleF1(doc, now)) return doc;
  try { return await captureF1(env, f, now); } catch { return doc; }
}
