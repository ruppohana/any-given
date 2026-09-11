/* 🔴 WHICH TEAMS ARE DUE, AND AN EMAIL WHEN A GAME IS ABOUT TO GO UNCOVERED.
 *
 * Jason, 2026-09-11: "It only has to run once. So for the NFL it can run after
 * the last game on Monday, so Tuesday morning it can schedule to run. Then if it
 * has a problem it can run Wednesday morning, and so on. How will I know if there
 * is a problem?"
 *
 * The research still runs on the laptop (Jason: "Laptop."). This is the half that
 * must NOT depend on the laptop: a laptop that slept through three mornings cannot
 * report that it did. So the Worker - always on - lists every team's next game,
 * whether its nuggets are current for it, and once a day after 10 AM Pacific, if
 * any game inside 48 hours has a team without current nuggets, emails Jason.
 *
 *   GET /api/nuggets/due          the list (read-only, nothing secret)
 *   hourly check, 10 AM-10 PM     at most one email a day, only when something is
 *                                 actually uncovered; a failed send retries next hour
 *   NUGGET_ALERT_TEST = "<id>"    one test email, once, on the next tick
 *
 * Games come from the D1 game table (it keeps every week the slate cron has
 * seen); names from the KV slates, because the team table is empty. Freshness is
 * the same rule tools/nugget-teams.mjs applies on the laptop: isFreshForNext.
 */
import { nextGames, isFreshForNext, pacificDate, type GameRow } from './lib/nuggets.ts';

const DAY = 24 * 60 * 60 * 1000;

export async function computeDue(env: any, now = Date.now(), days = 7) {
  const errors: string[] = [];
  let rows: GameRow[] = [];
  try {
    const r = await env.DB.prepare(
      'SELECT id, sport, kickoff_utc, status, home_team_id, away_team_id FROM game WHERE kickoff_utc > ? AND kickoff_utc < ?'
    ).bind(now - 45 * DAY, now + days * DAY).all();
    rows = ((r && r.results) || []) as GameRow[];
  } catch (e: any) { errors.push('game table: ' + String(e?.message || e)); }

  const names = new Map<string, { name: string; abbrev: string }>();
  const season = Number(env.SEASON) || 2026;
  for (const sport of ['nfl', 'college-football']) {
    try {
      const wk = Number(String((await env.LIVE.get(`slate:${sport}:current`)) || '').trim());
      for (const w of wk ? [wk, wk + 1] : []) {
        const raw = await env.LIVE.get(`slate:${sport}:${season}:${w}`);
        if (!raw) continue;
        for (const g of JSON.parse(raw).games || []) {
          for (const t of g.teams || []) {
            names.set(sport + ':' + t.id, { name: t.name || t.short || t.abbrev || String(t.id), abbrev: t.abbrev || '' });
          }
        }
      }
    } catch (e: any) { errors.push(`${sport} names: ${String(e?.message || e)}`); }
  }
  for (const r of rows) {
    const h = names.get(r.sport + ':' + r.home_team_id), a = names.get(r.sport + ':' + r.away_team_id);
    if (h) { r.home_name = h.name; r.home_abbrev = h.abbrev; }
    if (a) { r.away_name = a.name; r.away_abbrev = a.abbrev; }
  }

  const teams: any[] = [];
  for (const t of nextGames(rows, now, days)) {
    /* The static file is the only store since the Cloudflare desk and its KV
     * copies were removed (2026-09-11). */
    let asOf: string | null = null;
    try {
      const r = await env.ASSETS.fetch(new Request(`https://anygiven.app/nuggets/${t.league}/${t.teamId}.json`));
      if (r.ok) asOf = ((await r.json()) as any).asOf || null;
    } catch { /* no static file */ }
    teams.push({ ...t, asOf, fresh: isFreshForNext(asOf, t) });
  }
  const urgent = teams.filter((t) => !t.fresh && t.kickoffUtc - now < 2 * DAY);
  return { now, today: pacificDate(now), days, total: teams.length, due: teams.filter((t) => !t.fresh), urgent, teams, errors };
}

/** The hourly check (from the ten-minute cron). Sends at most one email a day,
 *  only between 10 AM and 10 PM Pacific, and only when a game inside 48 hours has
 *  a team without current nuggets - or when NUGGET_ALERT_TEST names a test that
 *  has not been sent yet. The day's mark is written only after a send succeeds. */
export async function nuggetAlertTick(env: any, now = Date.now()) {
  const test = String(env.NUGGET_ALERT_TEST || '').trim();
  const testKey = test ? `nuggets:alert:test:${test}` : '';
  const wantTest = !!test && !(await env.LIVE.get(testKey));
  const hour = Number(new Date(now).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hour12: false }));
  const minute = new Date(now).getUTCMinutes();
  const hourly = hour >= 10 && hour < 22 && minute < 10;
  if (!wantTest && !hourly) return { skipped: 'not the hourly slot' };

  const d = await computeDue(env, now);
  const dayKey = `nuggets:alert:${d.today}`;
  if (!wantTest) {
    if (!d.urgent.length) return { sent: false, reason: 'covered', total: d.total, due: d.due.length };
    if (await env.LIVE.get(dayKey)) return { sent: false, reason: 'already sent today', urgent: d.urgent.length };
  }
  if (!env.RESEND_API_KEY || !env.ALERT_EMAIL) return { sent: false, reason: 'no RESEND_API_KEY or ALERT_EMAIL' };

  const line = (t: any) => `- ${t.team} (${t.league.toUpperCase()}), ${t.opponent}, ${t.gameDate}: `
    + (t.asOf ? `last researched ${t.asOf}` : 'never researched');
  const subject = wantTest
    ? 'Any Given: test alert - game facts check'
    : `Any Given: ${d.urgent.length} team${d.urgent.length === 1 ? '' : 's'} without game facts inside 48 hours`;
  const text = [
    wantTest
      ? 'This is the one-time test of the game-facts alert. If you are reading it, alerts reach you.'
      : 'These teams play within 48 hours and have no current game facts. The laptop research run did not cover them - check that the laptop is on and the Claude app is open, or start the run by hand.',
    '',
    `Next 7 days: ${d.total} teams playing, ${d.due.length} still due, ${d.urgent.length} inside 48 hours.`,
    ...(d.urgent.length ? ['', ...d.urgent.slice(0, 40).map(line)] : []),
    ...(d.errors.length ? ['', 'Errors: ' + d.errors.join('; ')] : []),
    '',
    'Full list: https://anygiven.app/api/nuggets/due'
  ].join('\n');

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: 'Any Given <alerts@anygiven.app>', to: [env.ALERT_EMAIL], subject, text })
  });
  /* 🔴 expirationTtl is SECONDS. It was 30 * DAY - milliseconds, 2.6 billion, past
   * KV's int32 limit - so the put threw AFTER the send, the mark was never written,
   * and the test email went out on every ten-minute tick (2026-09-11, 08:30-09:00). */
  if (r.ok) await env.LIVE.put(wantTest ? testKey : dayKey, JSON.stringify({ at: now, urgent: d.urgent.length }), { expirationTtl: 30 * 24 * 60 * 60 });
  return { sent: r.ok, status: r.status, test: wantTest, urgent: d.urgent.length, due: d.due.length };
}
