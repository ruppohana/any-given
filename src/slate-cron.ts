/* 🔴 THE WEEKLY SLATE, CAPTURED IN CLOUDFLARE. Jason: "Did we move everything
 * to the cloud? Anything we need to do there? If so. Do it."
 *
 * The live poller moved earlier tonight and this is the other half. The slate
 * - every game, its kickoff, its spread, its total, its moneylines, and the
 * final score once it has one - was still being captured by a node process
 * Jason ran by hand on a laptop. That is the file the pool half reads, the
 * file the live screen reads to decide which game to poll, and the file the
 * standings grade against. It was one closed lid away from being a week old.
 *
 * 🔴 IT CAN LIVE HERE ONLY BECAUSE IT WAS ALREADY ON THE CORE API. Probed from
 * a deployed Worker: site.api.espn.com answers 403, sports.core.api answers
 * 200. tools/poll-slate.mjs happens to use the core API for everything, so
 * this is a port rather than a rewrite. The LIVE poller needed a shim first
 * (src/core-feed.ts) precisely because it did not.
 *
 * 🔴 WHAT THIS CAPTURE CANNOT DO, and does not pretend to. Team form and the
 * last meeting come from the site.api summary, which Cloudflare cannot reach.
 * So this merges: it owns scores, status, kickoffs and the market lines, and
 * it PRESERVES whatever the host-side capture last wrote for the fields it
 * cannot see. A cloud job that blanked those every ten minutes would be worse
 * than no cloud job.
 */
import { idFromRef } from './core-feed.ts';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  + ' (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

async function get(url: string): Promise<any> {
  const r = await fetch(url, { headers: { 'user-agent': UA } });
  if (!r.ok) throw new Error(`${r.status} ${url.slice(0, 80)}`);
  return r.json();
}

const col = (c: unknown) => {
  const s = typeof c === 'string' ? c.replace('#', '').toLowerCase() : '';
  return /^[0-9a-f]{6}$/.test(s) && s !== '000000' ? s : null;
};

/** Which week is on. ESPN states it; nothing here works it out from a date. */
export async function currentWeek(sport: string, season: number): Promise<number> {
  const base = `https://sports.core.api.espn.com/v2/sports/football/leagues/${sport}`;
  const t = await get(`${base}/seasons/${season}/types/2`);
  const n = Number(t?.week?.number);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export async function captureSlate(env: any, sport: string, season: number) {
  const base = `https://sports.core.api.espn.com/v2/sports/football/leagues/${sport}`;
  const week = await currentWeek(sport, season);
  const key = `slate:${sport}:${season}:${week}`;

  /* What the host-side capture last wrote, so its site.api-only fields survive
     a cloud refresh. */
  let prev: any = null;
  try { prev = JSON.parse((await env.LIVE.get(key)) || 'null'); } catch { /* none yet */ }
  const prevById = new Map<string, any>();
  for (const g of (prev?.games || [])) prevById.set(String(g.id), g);

  const list = await get(`${base}/seasons/${season}/types/2/weeks/${week}/events?limit=400`);
  const ids = (list.items || [])
    .map((x: any) => String(x.$ref || '').split('/events/')[1]?.split('?')[0])
    .filter(Boolean);

  const teamCache = new Map<string, any>();
  const games: any[] = [];
  const live: string[] = [];

  for (const id of ids) {
    try {
      const ev = await get(`${base}/events/${id}`);
      const comp = (ev.competitions || [])[0];
      if (!comp) continue;

      const sides: any[] = [];
      for (const c of comp.competitors || []) {
        const tid = idFromRef(c.team);
        if (!teamCache.has(tid)) {
          try { teamCache.set(tid, await get(String(c.team?.$ref))); } catch { teamCache.set(tid, {}); }
        }
        const t = teamCache.get(tid) || {};
        let score: number | null = null;
        if (c.score?.$ref) { try { score = (await get(String(c.score.$ref)))?.value ?? null; } catch { /* not played */ } }
        sides.push({
          id: tid, abbrev: t.abbreviation || '', name: t.displayName || '',
          short: t.shortDisplayName || t.name || '',
          primary: col(t.color), secondary: col(t.alternateColor),
          homeAway: c.homeAway, score
        });
      }
      const home = sides.find((x) => x.homeAway === 'home') || sides[0];
      const away = sides.find((x) => x.homeAway === 'away') || sides[1];
      if (!home || !away) continue;

      let status = 'scheduled';
      try {
        const st = comp.status?.$ref ? await get(String(comp.status.$ref)) : comp.status;
        const n = st?.type?.name;
        status = n === 'STATUS_FINAL' ? 'final'
          : n === 'STATUS_SCHEDULED' ? 'scheduled' : (n ? 'in_progress' : 'scheduled');
      } catch { /* leave scheduled */ }

      /* 🔴 EVERY MARKET LINE, NOT JUST THE SPREAD. The request was already
         being made to read one field out of it. */
      let spread = null, provider = null, total = null, mlHome = null, mlAway = null;
      try {
        const odds = await get(`${base}/events/${id}/competitions/${id}/odds`);
        const o = (odds.items || [])[0];
        if (o && typeof o.spread === 'number') { spread = o.spread; provider = o.provider?.name || null; }
        if (o && typeof o.overUnder === 'number') total = o.overUnder;
        const ml = (t: any) => {
          const v = t && (t.moneyLine ?? t.current?.moneyLine?.value);
          return typeof v === 'number' ? v : null;
        };
        mlHome = ml(o?.homeTeamOdds);
        mlAway = ml(o?.awayTeamOdds);
      } catch { /* no line posted */ }

      let venue = null, broadcast = null;
      try {
        const v = comp.venue?.$ref ? await get(String(comp.venue.$ref)) : comp.venue;
        venue = v?.fullName || null;
      } catch { /* none posted */ }
      try {
        const b = comp.broadcasts?.$ref ? await get(String(comp.broadcasts.$ref)) : null;
        const first = (b?.items || [])[0];
        broadcast = first?.media?.shortName || (first?.names || [])[0] || null;
      } catch { /* not televised, or not announced */ }

      const was = prevById.get(String(id)) || {};
      const wasTeams = new Map<string, any>();
      for (const t of (was.teams || [])) wasTeams.set(String(t.id), t);

      games.push({
        id, sport, season, week,
        kickoffUtc: Date.parse(ev.date),
        name: ev.name, shortName: ev.shortName,
        status,
        homeTeamId: home.id, awayTeamId: away.id,
        homeScore: home.score, awayScore: away.score,
        spread, spreadProvider: provider,
        total, moneylineHome: mlHome, moneylineAway: mlAway,
        venue, broadcast,
        /* site.api only - kept from whatever the host capture last wrote. */
        lastMeeting: was.lastMeeting ?? null,
        teams: [home, away].map(({ homeAway, score, ...t }) => ({
          ...t, form: (wasTeams.get(String(t.id)) || {}).form ?? null
        }))
      });
      if (status === 'in_progress') live.push(String(id));
    } catch { /* one bad event must not cost the week */ }
  }

  /* 🔴 NEVER PUSH AN EMPTY WEEK OVER A GOOD ONE. Learned the hard way on
   * 2026-09-09: a bug made every event throw and the run cheerfully published
   * a slate of zero games, wiping a correct capture. A capture that found
   * nothing is a FAILED RUN, not a week with no football in it. */
  if (!games.length) return { key, week, wrote: 0, live: 0, skipped: 'empty capture' };

  games.sort((a, b) => a.kickoffUtc - b.kickoffUtc);
  await env.LIVE.put(key, JSON.stringify({
    sport, season, week, schema: 3, games, fetchedAt: Date.now(), by: 'cron'
  }), { expirationTtl: 60 * 60 * 24 * 14 });

  /* 🔴 AND THE LIVE POLLERS START THEMSELVES. This is the piece that makes
   * Sunday work: eight games kick at once, and each one gets its own Durable
   * Object, started here rather than by somebody remembering to. They stop
   * themselves ten minutes after their game goes final, so nothing has to
   * remember the other half either. */
  for (const id of live) {
    try {
      const stub = env.POLLER.get(env.POLLER.idFromName(`${sport}:${id}`));
      await stub.fetch(new Request('https://do/start', {
        method: 'POST', body: JSON.stringify({ gameId: id, sport })
      }));
    } catch { /* a poller that will not start is not worth losing the slate over */ }
  }

  return { key, week, wrote: games.length, live: live.length };
}
