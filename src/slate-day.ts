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
import { DAY_SPORTS, CONF_SHORT, NBA_CONF, dayOf, addDays, isSoccerDay } from './lib/day.ts';

/* 🔴 WINNER-FLAG DAYS - UFC and cricket (Jason, 2026-09-13: "do the ufc and cricket next").
 * Neither has a score the pool can grade: a fight has none, and a cricket score is text
 * ("151/8 (20 ov, target 151)"). ESPN flags the winner on each side - a boolean for a
 * fighter, the STRING "true"/"false" for a cricket side (read on the real feeds) - and
 * the grade reads that flag (`game.winner`). A bout that ends with no winner (a draw, a
 * no contest) and a match with no result are the one void path. Both return the same
 * game shape as parseDay, so the slate draws them with the code it has. */

/** One UFC card: every bout as a game. The fighter listed first (order 1) is "home" -
 *  the red corner - and the bout locks at its card segment's start (prelims, main card). */
export function parseUfcDay(payload: any, day: string): any[] {
  const out: any[] = [];
  for (const ev of payload?.events || []) {
    const bouts = ev.competitions || [];
    const starts = bouts.map((c: any) => Date.parse(c.date || c.startDate || ev.date)).filter((n: number) => Number.isFinite(n));
    const mainAt = starts.length ? Math.max(...starts) : NaN;
    for (const comp of bouts) {
      const cs = comp.competitors || [];
      const h = cs.find((c: any) => Number(c.order) === 1) || cs[0];
      const a = cs.find((c: any) => Number(c.order) === 2) || cs[1];
      if (!h || !a || h === a) continue;
      const kickoff = Date.parse(comp.date || comp.startDate || ev.date);
      if (!Number.isFinite(kickoff)) continue;
      const statusName = String(comp.status?.type?.name || 'STATUS_SCHEDULED');
      let status = statusOf(statusName, comp.status?.type?.completed === true);
      const winner = h.winner === true ? 'home' : a.winner === true ? 'away' : null;
      if (status === 'final' && !winner) status = 'void';
      const fighter = (c: any) => {
        const at = c.athlete || {};
        const nm = String(at.displayName || at.fullName || '');
        const last = nm.split(' ').slice(-1)[0] || nm;
        return {
          id: 'f' + String(c.id), abbrev: last.slice(0, 3).toUpperCase(), name: nm, short: last,
          primary: null, secondary: null, rank: null, conference: null,
          /* The fighter's country flag stands in for a crest. */
          logo: typeof at.flag?.href === 'string' ? at.flag.href : null, country: at.flag?.alt || null,
          record: (c.records || []).find((r: any) => r?.type === 'total')?.summary || null, form: null
        };
      };
      const home = fighter(h), away = fighter(a);
      out.push({
        id: String(comp.id), sport: 'ufc', day,
        season: Number(ev.season?.year) || null, week: 0, kickoffUtc: kickoff,
        tbd: comp.timeValid === false,
        name: `${home.name} vs. ${away.name}`, shortName: `${home.short} vs. ${away.short}`,
        event: ev.name || null, weightClass: comp.type?.abbreviation || null,
        card: kickoff >= mainAt ? 'Main card' : 'Prelims',
        status, statusName, period: null, clock: null,
        homeTeamId: home.id, awayTeamId: away.id, homeScore: null, awayScore: null,
        spread: null, spreadProvider: null, total: null, moneylineHome: null, moneylineAway: null,
        venue: comp.venue?.fullName || null, broadcast: null, neutral: true, lastMeeting: null,
        teams: [home, away], rankHome: null, rankAway: null, conferences: [],
        periodsHome: null, periodsAway: null, winner, penHome: null, penAway: null
      });
    }
  }
  return out.sort((x, y) => x.kickoffUtc - y.kickoffUtc);
}

/** One cricket competition's day. Limited-overs only - a five-day Test is not a day's
 *  pick. Final with a winner, or void: "No result (abandoned with a toss)" (the real
 *  CPL match of 2026-08-30) and any finish with no side flagged. */
export function parseCricketDay(payload: any, day: string): any[] {
  const out: any[] = [];
  const league = payload?.leagues?.[0]?.name || null;
  for (const ev of payload?.events || []) {
    const comp = (ev.competitions || [])[0];
    if (!comp) continue;
    const cls = comp.class || {};
    if (String(cls.generalClassId) === '1' || /test/i.test(String(cls.eventType || ''))) continue;
    const cs = comp.competitors || [];
    const h = cs.find((c: any) => c.homeAway === 'home') || cs[0];
    const a = cs.find((c: any) => c.homeAway === 'away') || cs[1];
    if (!h || !a || h === a) continue;
    const kickoff = Date.parse(comp.date || ev.date);
    if (!Number.isFinite(kickoff)) continue;
    const st = ev.status?.type || comp.status?.type || {};
    const state = String(st.state || 'pre');
    const won = (c: any) => c.winner === true || c.winner === 'true';
    const winner = won(h) ? 'home' : won(a) ? 'away' : null;
    const status = state === 'post' ? (winner ? 'final' : 'void') : state === 'in' ? 'in_progress' : 'scheduled';
    const side = (c: any) => {
      const t = c.team || {};
      return {
        id: String(t.id), abbrev: t.abbreviation || '', name: t.displayName || '', short: t.name || t.displayName || '',
        primary: col(t.color), secondary: col(t.alternateColor), rank: null, conference: null,
        logo: typeof t.logo === 'string' ? t.logo : null, record: null, form: null
      };
    };
    const home = side(h), away = side(a);
    const started = status !== 'scheduled';
    const text = (c: any) => (started && typeof c.score === 'string' && c.score.trim() ? c.score.trim() : null);
    out.push({
      id: String(ev.id), sport: 'cricket', day,
      season: Number(ev.season?.year) || null, week: 0, kickoffUtc: kickoff,
      tbd: comp.timeValid === false,
      name: ev.name, shortName: ev.shortName, competition: league, format: cls.eventType || null,
      status, statusName: String(st.description || st.detail || ''), period: null, clock: null,
      /* The result line ESPN writes - "Tridents won by 2 wkts (0b rem)", "No result". */
      summary: typeof ev.status?.summary === 'string' ? ev.status.summary : null,
      homeTeamId: home.id, awayTeamId: away.id, homeScore: null, awayScore: null,
      homeScoreText: text(h), awayScoreText: text(a),
      spread: null, spreadProvider: null, total: null, moneylineHome: null, moneylineAway: null,
      venue: comp.venue?.fullName || null, broadcast: null, neutral: !!comp.neutralSite, lastMeeting: null,
      teams: [home, away], rankHome: null, rankAway: null, conferences: [],
      periodsHome: null, periodsAway: null, winner, penHome: null, penAway: null
    });
  }
  return out.sort((x, y) => x.kickoffUtc - y.kickoffUtc);
}

/* 🔴 TEAM MATCH PLAY - the Presidents Cup and the Ryder Cup (Jason, 2026-09-13: "do the
 * ... presidents cup next"). One event on ESPN's golf scoreboard; competition type 1 is
 * the team total, 5 foursomes, 4 four-ball, 3 singles (read on the real 2024 Presidents
 * Cup and 2025 Ryder Cup). A match's sides are pairs (or players in singles), each flagged
 * winner, the score a line ("1 Up", "4 & 3"); a HALVED match has no winner and both
 * scores "Halved" - a result, stored as winner 'draw', a third pick like a soccer draw.
 * A pair's players are not on the scoreboard: they come from ESPN's core API (see
 * golfCupPlayers) and are passed in. The day's games are the matches teed off that
 * (Eastern, 6 AM rollover) day; the team total rides on the first day. */
const CUP_SESSION: Record<string, string> = { '1': 'The cup', '5': 'Foursomes', '4': 'Four-ball', '3': 'Singles' };
const isCupEvent = (ev: any) => /presidents cup|ryder cup/i.test(String(ev?.name || ''));

export function parseGolfCupDay(payload: any, day: string, players: Record<string, string[]> | null = null): any[] {
  const out: any[] = [];
  for (const ev of payload?.events || []) {
    if (!isCupEvent(ev)) continue;
    const comps = ev.competitions || [];
    const starts = comps.map((c: any) => Date.parse(c.date)).filter((n: number) => Number.isFinite(n));
    const first = starts.length ? Math.min(...starts) : Date.parse(ev.date);
    for (const comp of comps) {
      const cs = comp.competitors || [];
      const h = cs.find((c: any) => c.homeAway === 'home') || cs[0];
      const a = cs.find((c: any) => c.homeAway === 'away') || cs[1];
      if (!h || !a || h === a) continue;
      const typeId = String(comp.type?.id || '');
      const overall = typeId === '1';
      /* The team total locks with the first match of the week. */
      const kickoff = overall ? first : Date.parse(comp.date || ev.date);
      if (!Number.isFinite(kickoff) || dayOf(kickoff) !== day) continue;
      const statusName = String(comp.status?.type?.name || 'STATUS_SCHEDULED');
      let status = statusOf(statusName, comp.status?.type?.completed === true);
      const won = (c: any) => c.winner === true || c.winner === 'true';
      let winner: string | null = won(h) ? 'home' : won(a) ? 'away' : null;
      if (status === 'final' && !winner) {
        const level = overall
          ? Number(h.score) === Number(a.score)
          : String(h.score) === 'Halved' || String(a.score) === 'Halved';
        if (level) winner = 'draw';
      }
      if (status === 'final' && !winner) status = 'void';
      const side = (c: any) => {
        const t = c.team || {};
        const code = String(t.abbreviation || '');
        const teamName = String(t.shortDisplayName || t.displayName || code);
        const names: string[] = c.type === 'athlete' ? [String(c.athlete?.displayName || '')]
          : c.type === 'pair' ? ((players && players[String(c.id)]) || []) : [];
        const real = names.filter(Boolean);
        return {
          id: 'g' + String(c.id), abbrev: code.slice(0, 4), team: code, teamName,
          name: real.length ? real.join(' / ') : teamName,
          short: real.length ? real.map((n) => n.split(' ').slice(-1)[0]).join(' / ') : teamName,
          primary: null, secondary: null, rank: null, conference: null,
          /* The team's flag stands in for a crest - usa.png, intl.png, eur.png. */
          logo: code ? `https://a.espncdn.com/i/teamlogos/countries/500/${code.toLowerCase()}.png` : null,
          record: null, form: null
        };
      };
      const home = side(h), away = side(a);
      const started = status !== 'scheduled';
      const line = (c: any) => (started && typeof c.score === 'string' && c.score.trim() ? c.score.trim() : null);
      out.push({
        id: String(comp.id), sport: 'golf-cup', day,
        season: Number(ev.season?.year) || null, week: 0, kickoffUtc: kickoff, tbd: false,
        name: `${home.name} vs. ${away.name}`, shortName: `${home.short} vs. ${away.short}`,
        event: ev.name || null, session: CUP_SESSION[typeId] || null, overall,
        status, statusName, period: null, clock: null,
        homeTeamId: home.id, awayTeamId: away.id, homeScore: null, awayScore: null,
        homeScoreText: line(h), awayScoreText: line(a),
        spread: null, spreadProvider: null, total: null, moneylineHome: null, moneylineAway: null,
        venue: comp.venue?.fullName || null, broadcast: null, neutral: false, lastMeeting: null,
        teams: [home, away], rankHome: null, rankAway: null, conferences: [],
        periodsHome: null, periodsAway: null, winner, penHome: null, penAway: null
      });
    }
  }
  return out.sort((x, y) => x.kickoffUtc - y.kickoffUtc);
}

/** The players in every pair of a match-play event, from ESPN's core API (the pair's
 *  roster, then each athlete), cached in KV - a pair for 30 days, a golfer's name for
 *  60 - so a day's capture asks once. { "<pair competitor id>": ["Name", "Name"] }. */
export async function golfCupPlayers(env: any, payload: any, fetchImpl: typeof fetch = fetch): Promise<Record<string, string[]>> {
  const CORE = 'https://sports.core.api.espn.com/v2/sports/golf';
  const out: Record<string, string[]> = {};
  const kvGet = async (k: string) => { try { return env?.LIVE ? await env.LIVE.get(k) : null; } catch { return null; } };
  const kvPut = async (k: string, v: string, ttl: number) => { try { if (env?.LIVE) await env.LIVE.put(k, v, { expirationTtl: ttl }); } catch { /* fine */ } };
  for (const ev of payload?.events || []) {
    if (!isCupEvent(ev)) continue;
    for (const comp of ev.competitions || []) {
      for (const c of comp.competitors || []) {
        if (c.type !== 'pair') continue;
        const key = 'golfcup:pair:' + String(c.id);
        let names: string[] = [];
        try { names = JSON.parse((await kvGet(key)) || '[]'); } catch { names = []; }
        if (!names.length) {
          try {
            const r = await fetchImpl(`${CORE}/leagues/pga/events/${ev.id}/competitions/${comp.id}/competitors/${c.id}/roster`,
              { headers: { 'user-agent': UA, accept: 'application/json' } });
            const j: any = r.ok ? await r.json() : null;
            for (const e of j?.entries || []) {
              const id = String(e.playerId);
              let nm = await kvGet('golf:athlete:' + id);
              if (!nm) {
                const ar = await fetchImpl(`${CORE}/athletes/${id}`, { headers: { 'user-agent': UA, accept: 'application/json' } });
                const aj: any = ar.ok ? await ar.json() : null;
                nm = aj?.displayName || aj?.fullName || '';
                if (nm) await kvPut('golf:athlete:' + id, nm, 60 * 60 * 24 * 60);
              }
              if (nm) names.push(nm);
            }
            if (names.length) await kvPut(key, JSON.stringify(names), 60 * 60 * 24 * 30);
          } catch { names = []; }
        }
        if (names.length) out[String(c.id)] = names;
      }
    }
  }
  return out;
}

/** The day parser for a sport. */
export function parseAnyDay(payload: any, sport: string, day: string, extra: any = null): any[] {
  if (sport === 'ufc') return parseUfcDay(payload, day);
  if (sport === 'cricket') return parseCricketDay(payload, day);
  if (sport === 'golf-cup') return parseGolfCupDay(payload, day, extra);
  return parseDay(payload, sport, day);
}

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
/* 🔴 A FINISHED GAME IS FINAL HOWEVER ESPN SPELLS IT. Soccer ends
   STATUS_FULL_TIME (every EPL and MLS match on 2026-09-12), not STATUS_FINAL -
   read by name alone, a soccer game would sit "in progress" forever and never
   be graded. So the soccer finals are named, and past the names ESPN's own
   `completed` flag decides; a postponed, cancelled or forfeited game is still
   the one void path, whatever the flag says. */
export function statusOf(name: string, completed = false): string {
  switch (name) {
    case 'STATUS_FINAL':
    case 'STATUS_FINAL_OVERTIME':
    case 'STATUS_FULL_TIME':
    case 'STATUS_FINAL_AET':
    case 'STATUS_FINAL_PEN':
      return 'final';
    case 'STATUS_SCHEDULED':
      return 'scheduled';
    case 'STATUS_CANCELED':
    case 'STATUS_POSTPONED':
    case 'STATUS_SUSPENDED':
    case 'STATUS_FORFEIT':
      return 'void';
    default:
      return completed ? 'final' : 'in_progress';
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
    const status = statusOf(statusName, comp.status?.type?.completed === true || ev.status?.type?.completed === true);
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
        /* CONF_SHORT is COLLEGE's table, keyed by ESPN's conferenceId - a pro
           league must never be looked up in it (an MLB or NHL id there would name
           a college conference). Only the NBA has a table of its own. */
        conference: sport === 'nba'
          ? (NBA_CONF[String(t.id)] || null)
          /* Women's college basketball uses ESPN's same conference ids (UConn is 4,
             the Big East, in both) - checked on the captured 2026-03-07 day. */
          : sport === 'mens-college-basketball' || sport === 'womens-college-basketball'
            ? (gameConf || CONF_SHORT[String(t.conferenceId)] || null)
            : null,
        /* The feed's own crest URL. An NBA team's ESPN id is a different team
           in college (5 is Cleveland here and a school there), so the chip
           must never build an NBA crest from the id. */
        logo: typeof t.logo === 'string' ? t.logo : null,
        record: total?.summary || null,
        form: null,
        score: started ? numOrNull(c.score) : null,
        periods: periods.length ? periods : null
      };
    };
    const home = side(h), away = side(a);

    /* 🔴 A KNOCKOUT HAS A WINNER. Jason, 2026-09-13: "a knockout round has a winner,
       that is the winner". A soccer match level after extra time and decided on
       penalties ends STATUS_FINAL_PEN with the SCORE LEVEL (1-1 in the 2026
       Champions League final) - the shootout is not in it - and ESPN flags the side
       that went through as `winner`. Read only for soccer and only on a level final:
       a league-phase draw has no flag and stays a draw. College hockey's conference
       shootouts do not count - the NCAA records those games as ties. */
    const level = status === 'final' && home.score != null && home.score === away.score;
    const winner = isSoccerDay(sport) && level
      ? (h.winner === true ? 'home' : a.winner === true ? 'away' : null) : null;
    const pens = (c: any) => (winner ? numOrNull(c.shootoutScore) : null);

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
      /* 🔴 A TIP TIME ESPN HAS NOT SET. 64 of the 78 games on the 2026-27
       * opener carry timeValid:false and a placeholder of midnight Eastern
       * (05:00Z) - which read as "9:00 PM the night before" and would have
       * locked every one of them before its day began. */
      tbd: comp.timeValid === false,
      name: ev.name, shortName: ev.shortName,
      status, statusName, period,
      clock: typeof comp.status?.displayClock === 'string' ? comp.status.displayClock : null,
      homeTeamId: home.id, awayTeamId: away.id,
      homeScore: home.score, awayScore: away.score,
      /* The shootout's winner and its score, for a level knockout only. */
      winner, penHome: pens(h), penAway: pens(a),
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
  /* Cricket's day is gathered from every competition in season (DAY_SPORTS.cricket.
     leagues); one that fails costs its own games, never the others. */
  const paths = cfg.leagues ? cfg.leagues.map((id) => `${cfg.path}/${id}`) : [cfg.path];
  const games: any[] = [];
  let answered = 0, lastErr = '';
  for (const path of paths) {
    const url = `https://site.web.api.espn.com/apis/site/v2/sports/${path}/scoreboard`
      + `?dates=${day}${cfg.groups ? '&groups=' + cfg.groups : ''}&limit=400`;
    try {
      const res = await fetchImpl(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
      if (!res.ok) { lastErr = `espn ${res.status}`; continue; }
      answered++;
      const payload = await res.json();
      /* Team match play names a pair's players only on the core API. */
      const extra = sport === 'golf-cup' ? await golfCupPlayers(env, payload, fetchImpl) : null;
      games.push(...parseAnyDay(payload, sport, day, extra));
    } catch (e: any) { lastErr = String(e?.message || e); }
  }
  if (!answered) throw new Error(lastErr || 'espn: no answer');
  games.sort((x, y) => x.kickoffUtc - y.kickoffUtc);
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
  /* The results table too, so a basketball group can be graded - the pool's
     standings read `game`, never KV. A failure here costs a grade, not the board. */
  try { await writeDayGames(env, sport, day, games); } catch { /* the next capture writes it */ }
  return { key, wrote: games.length, doc };
}

/** A day's games into D1's `game` table, the one the pool's standings grade
 *  from. The pool's "week" for a day sport is the day itself, as a number
 *  (20261103). A game with no tip time yet (tbd) is left out: its placeholder
 *  would lock it before its day began, and the pool slate does not offer it.
 *  Postponed and cancelled arrive as status 'void' and are never graded - the
 *  one void path. Written in batches of 100. */
export async function writeDayGames(env: any, sport: string, day: string, games: any[]): Promise<number> {
  if (!env || !env.DB) return 0;
  const rows = (games || []).filter((g) => !g.tbd && g.id && g.homeTeamId && g.awayTeamId);
  if (!rows.length) return 0;
  const stmt = env.DB.prepare(
    `INSERT INTO game (id, season, week, kickoff_utc, home_team_id, away_team_id,
                       spread, status, home_score, away_score, void, sport, winner)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       week        = excluded.week,
       kickoff_utc = excluded.kickoff_utc,
       spread      = COALESCE(excluded.spread, game.spread),
       status      = excluded.status,
       home_score  = excluded.home_score,
       away_score  = excluded.away_score,
       winner      = excluded.winner`
  );
  const week = Number(day);
  for (let i = 0; i < rows.length; i += 100) {
    await env.DB.batch(rows.slice(i, i + 100).map((g) => stmt.bind(
      String(g.id), Number(g.season) || 2026, week, Number(g.kickoffUtc) || 0,
      String(g.homeTeamId), String(g.awayTeamId),
      typeof g.spread === 'number' ? g.spread : null, String(g.status || 'scheduled'),
      g.homeScore == null ? null : Number(g.homeScore),
      g.awayScore == null ? null : Number(g.awayScore),
      sport,
      /* A level soccer knockout's winner (migration 0010), a fight's or a cricket
         match's, a match-play match's - 'draw' for a halved one; null otherwise. */
      g.winner === 'home' || g.winner === 'away' || g.winner === 'draw' ? g.winner : null
    )));
  }
  return rows.length;
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
