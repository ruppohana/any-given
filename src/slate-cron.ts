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
import { shouldPoll } from './lib/poll-window.ts';

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

  /* 🔴 BY DATE, NOT BY WEEK NUMBER - AND THE DIFFERENCE IS 62 GAMES. Jason
   * asked how many FBS games there are in a weekend, which is the question
   * that found this.
   *
   *     weeks/2/events            24 games
   *     events?dates=Sep 8-14     86 games, 80 of them on the Saturday
   *
   * Same league, same week, same API. ESPN's week-indexed event list is
   * simply incomplete for college football - it is exact for the NFL, which
   * is why this went unnoticed: sixteen is sixteen either way, so every check
   * I ran on the NFL agreed with itself while the college slate was 28%
   * captured.
   *
   * 🔴 A NUMBER THAT LOOKS PLAUSIBLE IS THE HARDEST KIND OF WRONG. Twenty-four
   * college games is a believable Saturday if you do not know the sport, and
   * nothing in the capture could have told us: no error, no empty page, no
   * truncation warning - the endpoint reports count 24, pageCount 1, and
   * means it.
   *
   * The week document gives the real boundaries, so the week is still what we
   * ask for; only the lookup changes. */
  const wk = await get(`${base}/seasons/${season}/types/2/weeks/${week}`);
  const ymd = (iso: string) => String(iso || '').slice(0, 10).replace(/-/g, '');
  const from = ymd(wk?.startDate), to = ymd(wk?.endDate);
  const url = (from && to)
    ? `${base}/events?dates=${from}-${to}&limit=500`
    : `${base}/seasons/${season}/types/2/weeks/${week}/events?limit=400`;
  const list = await get(url);
  const ids = (list.items || [])
    .map((x: any) => String(x.$ref || '').split('/events/')[1]?.split('?')[0])
    .filter(Boolean);

  /* 🔴 CONFERENCE IS LOOKED UP ONCE PER TEAM, EVER - NOT ONCE PER RUN.
   * Jason: "Sort by top 25, conference?" Both are real needs at 86 games and
   * they cost very differently.
   *
   * The RANK is free: `curatedRank.current` is inline on the competitor we
   * already fetch. The CONFERENCE is one more request per team, and this
   * capture runs every ten minutes - 150 teams x 6 an hour is 900 requests
   * an hour for a fact that changes once a year. So it is held in KV and only
   * teams we have never seen are looked up. A normal run makes zero of these
   * requests. */
  let confMap: Record<string, string> = {};
  const confKey = `teams:${sport}:conference`;
  try { confMap = JSON.parse((await env.LIVE.get(confKey)) || '{}') || {}; } catch { confMap = {}; }
  let confNew = 0;

  const teamCache = new Map<string, any>();
  const games: any[] = [];
  const live: string[] = [];

  for (const id of ids) {
    try {
      const ev = await get(`${base}/events/${id}`);
      const comp = (ev.competitions || [])[0];
      if (!comp) continue;

      /* Read once, before the competitors, because the linescore fetch below
         is gated on it and a per-competitor status lookup would double the
         requests for a field that belongs to the game. */
      let statusName = 'STATUS_SCHEDULED';
      let statusDoc: any = null;
      try {
        statusDoc = comp.status?.$ref ? await get(String(comp.status.$ref)) : comp.status;
        statusName = statusDoc?.type?.name || 'STATUS_SCHEDULED';
      } catch { /* leave scheduled */ }

      const sides: any[] = [];
      for (const c of comp.competitors || []) {
        const tid = idFromRef(c.team);
        if (!teamCache.has(tid)) {
          try { teamCache.set(tid, await get(String(c.team?.$ref))); } catch { teamCache.set(tid, {}); }
        }
        const t = teamCache.get(tid) || {};
        let score: number | null = null;
        if (c.score?.$ref) { try { score = (await get(String(c.score.$ref)))?.value ?? null; } catch { /* not played */ } }
        /* 🔴 THE QUARTER-BY-QUARTER SCORE, AND IT IS WHAT MAKES A HALF MARKET
         * SETTLEABLE AT ALL. Every period market in the catalogue settles off
         * `scoreAfterPeriod`, which reads a PLAY LIST - and no client has one
         * for 86 games. So the halves and quarters could be offered, priced
         * and staked, and then nothing in the app could ever resolve them.
         * A market you can take and cannot settle is worse than one that does
         * not exist.
         *
         * The linescores collection carries `value` inline on each item, so
         * this is ONE request per competitor rather than one per quarter.
         *
         * 🔴 AND ONLY FOR GAMES THAT HAVE STARTED. A scheduled game has no
         * linescores and asking for them would double the cost of the biggest
         * capture in the app - 86 college games, twice a game, every ten
         * minutes - to fetch an empty collection. Most of the week, most of
         * the slate is scheduled. */
        let periods: number[] | null = null;
        if (statusName !== 'STATUS_SCHEDULED' && c.linescores?.$ref) {
          try {
            const ls = await get(String(c.linescores.$ref));
            const vals = (ls?.items || [])
              .map((x: any) => Number(x?.value))
              .filter((n: number) => Number.isFinite(n));
            if (vals.length) periods = vals;
          } catch { /* absent stays absent */ }
        }
        /* AP/CFP rank. ESPN uses 0 or 99 for unranked, so anything outside
           1-25 is stored as null rather than as a number nobody means. */
        const rk = Number(c.curatedRank?.current);
        const rank = Number.isFinite(rk) && rk >= 1 && rk <= 25 ? rk : null;

        if (confMap[tid] === undefined && t.groups?.$ref) {
          try {
            const grp = await get(String(t.groups.$ref));
            confMap[tid] = String(grp?.shortName || grp?.name || '');
            confNew++;
          } catch { /* leave it unknown; the next run tries again */ }
        }

        sides.push({
          periods, rank, conference: confMap[tid] || null,
          id: tid, abbrev: t.abbreviation || '', name: t.displayName || '',
          short: t.shortDisplayName || t.name || '',
          primary: col(t.color), secondary: col(t.alternateColor),
          homeAway: c.homeAway, score
        });
      }
      const home = sides.find((x) => x.homeAway === 'home') || sides[0];
      const away = sides.find((x) => x.homeAway === 'away') || sides[1];
      if (!home || !away) continue;

      /* 🔴 THE PERIOD COMES WITH THE STATUS, AND IT IS WHAT LETS A MARKET
       * CLOSE ON ITS OWN CLOCK. Jason, 2026-09-10: "So I can only bet on who
       * wins the second half until kick?"
       *
       * He could, and it was wrong. Every market closed at kickoff because
       * kickoff was the only moment the slate knew about - so a second-half
       * winner, a Q4 winner, a market whose subject had not happened yet and
       * would not for two hours, all shut at the same instant as the coin
       * toss. That is the opposite of what this app is for.
       *
       * The status object was already being fetched to read `type.name` and it
       * carries `period` and `displayClock` in the same response. One extra
       * field on the write, no extra request, and a market can now be gated on
       * whether ITS period has started rather than on whether the game has. */
      /* One status document, read above and used twice - it decides both the
         status we publish and whether a linescore fetch is worth making. */
      const status = statusName === 'STATUS_FINAL' ? 'final'
        : statusName === 'STATUS_SCHEDULED' ? 'scheduled' : 'in_progress';
      const pn = Number(statusDoc?.period);
      const period = Number.isFinite(pn) && pn > 0 ? pn : null;
      const clock = typeof statusDoc?.displayClock === 'string' ? statusDoc.displayClock : null;

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
        status, period, clock,
        homeTeamId: home.id, awayTeamId: away.id,
        homeScore: home.score, awayScore: away.score,
        spread, spreadProvider: provider,
        total, moneylineHome: mlHome, moneylineAway: mlAway,
        venue, broadcast,
        /* site.api only - kept from whatever the host capture last wrote. */
        lastMeeting: was.lastMeeting ?? null,
        teams: [home, away].map(({ homeAway, score, periods, ...t }) => ({
          ...t, form: (wasTeams.get(String(t.id)) || {}).form ?? null
        })),
        /* 🔴 ON THE GAME AS WELL AS ON THE TEAMS. A board filtering to "Top 25"
           asks a question about the GAME - does either side carry a rank - and
           making every caller dig through two team objects to answer it is how
           two screens end up disagreeing about what a ranked game is. */
        rankHome: home.rank ?? null,
        rankAway: away.rank ?? null,
        conferences: [...new Set([home.conference, away.conference].filter(Boolean))],
        /* Quarter scores, home and away, in period order. Null until a game
           starts. This is what lets every half and quarter market settle
           without a play list. */
        periodsHome: home.periods || null,
        periodsAway: away.periods || null
      });
      /* One rule, in src/lib/poll-window.ts, shared with the ensure endpoint
         so the cron cannot start pollers the API then refuses to know about. */
      if (shouldPoll({ status, kickoffUtc: Date.parse(ev.date) }, Date.now())) {
        live.push(String(id));
      }
    } catch { /* one bad event must not cost the week */ }
  }

  /* 🔴 NEVER PUSH AN EMPTY WEEK OVER A GOOD ONE. Learned the hard way on
   * 2026-09-09: a bug made every event throw and the run cheerfully published
   * a slate of zero games, wiping a correct capture. A capture that found
   * nothing is a FAILED RUN, not a week with no football in it. */
  if (!games.length) return { key, week, wrote: 0, live: 0, skipped: 'empty capture', src: url };

  /* Only when it grew. A write per run for an unchanged map is a write per
     run for nothing. */
  if (confNew) {
    try { await env.LIVE.put(confKey, JSON.stringify(confMap)); } catch { /* next run */ }
  }

  games.sort((a, b) => a.kickoffUtc - b.kickoffUtc);
  await env.LIVE.put(key, JSON.stringify({
    sport, season, week, schema: 3, games, fetchedAt: Date.now(), by: 'cron'
  }), { expirationTtl: 60 * 60 * 24 * 14 });

  /* 🔴 A POINTER TO THE WEEK THAT IS ON. Every screen that wants "this week"
   * was working it out for itself, and defaulting to 1 when it could not -
   * which is correct for the NFL today and wrong for college, already on
   * week 2. The All games screen rendered a perfectly good empty state for a
   * week that simply was not the current one.
   *
   * The cron is the only thing that KNOWS, because it asks ESPN which week is
   * on every ten minutes. Writing that down costs one key and saves every
   * client from guessing. */
  await env.LIVE.put(`slate:${sport}:current`, String(week),
    { expirationTtl: 60 * 60 * 24 * 14 });

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

  /* `src` and `found` are returned so a run can be told apart from the code
     that made it - the difference between "24 games exist" and "we asked the
     wrong endpoint" is invisible without it, and cost a deploy to find. */
  return { key, week, wrote: games.length, live: live.length, found: ids.length, src: url };
}
