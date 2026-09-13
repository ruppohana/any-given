/* F1 REPLAY - a finished race off OpenF1's free history, served as a timeline.
 *
 * OpenF1 (api.openf1.org) serves every session since 2023 with no key: laps,
 * stops, positions, gaps, race control. A finished race never changes, so a
 * timeline is built once (src/lib/f1-live.ts) and kept in KV with no expiry.
 * The list of finished races is kept six hours.
 *
 * 🔴 OPENF1 IS PERSONAL AND NON-COMMERCIAL. Fine while the app earns nothing;
 * the day it does, F1 moves to a licensed feed or goes (settled 2026-09-12 -
 * SportMonks at €79 only if F1 earns). The licence request to OpenF1 is Jason's.
 *
 * Their limit is 3 requests a second and 30 a minute, so the build fetches in
 * turn with a pause between - ten requests, once per race, ever.
 */
import { buildTimeline } from './lib/f1-live.ts';

const API = 'https://api.openf1.org/v1/';
const HOUR = 60 * 60;   // seconds - KV's unit

const pause = (n: number) => new Promise((res) => setTimeout(res, n));
/* One retry on 429: two races rebuilding at once is 20 requests in a few
   seconds, past OpenF1's 3 a second. */
async function get(ep: string, q: string, f: typeof fetch, gap = 400) {
  for (let i = 0; ; i++) {
    const r = await f(API + ep + '?' + q, { headers: { accept: 'application/json', 'user-agent': 'AnyGiven/1 (+https://anygiven.app)' } });
    if (r.ok) return r.json();
    if (r.status !== 429 || i >= 1) throw new Error(`openf1 ${ep} ${r.status}`);
    await pause(gap * 4);
  }
}

/* A race is "finished" an hour after OpenF1 says the session ended - time
   for the last rows to land before a timeline is frozen forever. */
const SETTLE = 60 * 60 * 1000;
const isRace = (s: any) => s && (s.session_name === 'Race' || s.session_name === 'Sprint') && !s.is_cancelled;

export async function buildReplay(env: any, key: number, f: typeof fetch = fetch, now = Date.now(), gap = 400) {
  const kvKey = `f1:replay:${key}`;
  const hit = await env.LIVE.get(kvKey);
  let stale: any = null;
  /* A timeline from an older build lacks what the newer calls read (v2 added
     passes), so it is rebuilt - and kept to fall back on if the rebuild fails. */
  if (hit) { try { const c = JSON.parse(hit); if (c && c.v === 2) return c; stale = c; } catch { /* rebuild */ } }

  try {
    const [session] = await get('sessions', `session_key=${key}`, f, gap);
    if (!isRace(session)) return null;
    if (now < Date.parse(session.date_end) + SETTLE) return null;
    await pause(gap);
    const [meeting] = await get('meetings', `meeting_key=${session.meeting_key}`, f, gap);
    const rows: any = { session, meeting: meeting?.meeting_name || null };
    for (const ep of ['drivers', 'laps', 'pit', 'race_control', 'position', 'intervals', 'session_result', 'overtakes']) {
      await pause(gap);
      rows[ep] = await get(ep, `session_key=${key}`, f, gap);
    }
    const tl = buildTimeline(rows);
    if (session.session_name === 'Sprint') tl.meeting = (tl.meeting || '') + ' · Sprint';
    /* Never freeze a race with no laps in it - the next request tries again. */
    if (tl.laps < 1 || !tl.order[1] || !tl.order[1].length) throw new Error('openf1: race has no laps yet');
    await env.LIVE.put(kvKey, JSON.stringify(tl));
    return tl;
  } catch (e) {
    /* 🔴 FOUND LIVE 2026-09-12: the v2 deploy sent every cached race back to
       OpenF1 at once, a rebuild failed, and the screen said "the timing
       history did not answer" over a race that was sitting in KV. The old
       copy plays; only the calls that need passes have none to settle on. */
    if (stale) return { ...stale, passes: stale.passes || [] };
    throw e;
  }
}

/** The finished races of a season, newest first. */
export async function listReplays(env: any, year: number, f: typeof fetch = fetch, now = Date.now()) {
  const kvKey = `f1:replays:${year}`;
  const hit = await env.LIVE.get(kvKey);
  if (hit) { try { return JSON.parse(hit); } catch { /* refetch */ } }
  const sessions = await get('sessions', `year=${year}&session_type=Race`, f);
  await pause(400);
  const meetings = await get('meetings', `year=${year}`, f);
  const name = new Map((meetings || []).map((m: any) => [m.meeting_key, m.meeting_name]));
  const out = (sessions || []).filter((s: any) => isRace(s) && now >= Date.parse(s.date_end) + SETTLE)
    .sort((a: any, b: any) => Date.parse(b.date_start) - Date.parse(a.date_start))
    .map((s: any) => ({
      key: s.session_key, date: s.date_start, circuit: s.circuit_short_name || null,
      name: (name.get(s.meeting_key) || s.country_name || s.location || '') + (s.session_name === 'Sprint' ? ' · Sprint' : '')
    }));
  await env.LIVE.put(kvKey, JSON.stringify(out), { expirationTtl: 6 * HOUR });
  return out;
}
