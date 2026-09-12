import { pollDecision } from './lib/poll-window.ts';
import { captureSlate } from './slate-cron.ts';
import { captureDay, serveDay } from './slate-day.ts';
import { DAY_SPORTS, isDaySport, dayOf, addDays } from './lib/day.ts';
import { serveF1 } from './f1-feed.ts';
export { LivePoller } from './poller-do.ts';
import { computeDue, nuggetAlertTick } from './nugget-due.ts';
/* THE WORKER. One server polls the feed; the phone does not.
 *
 * That sentence is the whole reason the original exists and it is not negotiable
 * (BUILD-BRIEF section 1). What IS scoped down here, on purpose and for one
 * night, is the fan-out: Durable Objects are how MANY phones share ONE game, and
 * for a single person testing whether the loop is fun a plain Worker with a short
 * cache is enough. It runs on the free tier. The DO arrives when a second person
 * does, and nothing below has to change when it does - the client already talks
 * to one server rather than to ESPN.
 *
 * 🔴 THE CACHE IS THE ARCHITECTURE IN MINIATURE. Every phone watching a game hits
 * the same cached read, so ten viewers are one upstream request rather than ten.
 * That is the same property the DO buys, at a smaller scale, and it is why the
 * client is never given ESPN's URL.
 */

import { readLive, settleAgainst, type LiveState } from './live.ts';
import { parseSlate, type Sport } from './feed/espn.ts';
import { handleAuth, requireIdentity, sessionAccount } from './auth.ts';
import { icsFromQuery } from './lib/ics.ts';
import { handleGroups } from './groups.ts';

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  LIVE: KVNamespace;
  DB?: D1Database;
  SEASON?: string;
  /** Set with `wrangler secret put PUSH_TOKEN`. Without it nothing can write. */
  PUSH_TOKEN?: string;
  /** Email sign-in (src/auth.ts). The key is Jason's to set:
   *  `wrangler secret put RESEND_API_KEY`. MAIL_FROM overrides the sender. */
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  /** MailerSend (MailerLite's transactional sender) - preferred when set.
   *  `wrangler secret put MAILERSEND_API_KEY`. MAIL_FROM_EMAIL overrides
   *  codes@anygiven.app, and must be on a domain verified in MailerSend. */
  MAILERSEND_API_KEY?: string;
  MAIL_FROM_EMAIL?: string;
  /** "1" = picks, groups and joins need a verified email. Off until the sender
   *  and the sign-in sheet are both live. */
  REQUIRE_EMAIL?: string;
}

const SPORTS: Record<string, Sport> = {
  nfl: 'nfl',
  cfb: 'college-football',
  'college-football': 'college-football'
};

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football';

/** How stale a live read may be. Ten seconds is under the median snap gap, so a
 *  play never waits on the cache - and it is long enough that a room full of
 *  phones is still one request. */
const LIVE_TTL = 10;
const SLATE_TTL = 60;

function json(body: unknown, status = 200, ttl = 0): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': ttl ? `public, max-age=${ttl}` : 'no-store',
      /* The client is same-origin in production; this keeps a local page usable
       * against a deployed Worker while testing. */
      'access-control-allow-origin': '*'
    }
  });
}

/** One upstream read, shared by every viewer, via the runtime cache.
 *
 * 🔴 THE USER-AGENT IS LOAD-BEARING. ESPN returns 403 to a request without one -
 * from a Worker, not from a laptop. The same URL that worked all evening from
 * this machine failed the moment it ran on Cloudflare, and the only difference
 * was the header.
 *
 * Found by deploying and curling the deployed thing rather than by trusting that
 * a route which works locally works everywhere. It would otherwise have been
 * discovered at kickoff. */
/* 🔴 THE BOARD IS BUILT ON THE WRITE, NOT ON THE READ.
 *
 * One document per game holding every call, so `/api/board/:key` is a single
 * get() instead of a list() plus a get() per call. The read happens every 5
 * seconds per device; the write happens when somebody taps. Putting the
 * aggregation on the rare side is the whole fix.
 *
 * 🔴 KEYED BY device+play, SO A MERGE IS IDEMPOTENT. A re-post - the late name
 * landing on an existing call - replaces its row rather than appending a second
 * one, which is the same identity rule the `call:` record itself uses.
 *
 * Last-write-wins on a concurrent merge, and that is acceptable here in a way it
 * would not be for the calls themselves: the individual `call:` records are the
 * authority and this is a projection of them, so the worst case is a row missing
 * from a leaderboard until the next call rebuilds it. A lost CALL would be
 * somebody's stake disappearing; a lost board row is a display artifact.
 */
async function mergeBoard(env: any, key: string, call: any): Promise<void> {
  try {
    const k = `board:${key}`;
    const raw = await env.LIVE.get(k);
    const prev = raw ? (JSON.parse(raw).calls || []) : [];
    /* Merged on the PERSON where there is one (userId, set since sign-in was
       required) and on the phone for calls made before that - so one account
       on two phones is one row, and old rows still merge as they always did. */
    const who = (c: any) => (c && (c.userId || c.deviceId)) || '';
    const same = (c: any) => c && who(c) === who(call) && c.afterPlayId === call.afterPlayId;
    const calls = prev.filter((c: any) => !same(c));
    calls.push(call);
    /* Same 6-hour life as a call record. A board that outlived its calls would
     * show rows for a game whose detail has expired. */
    await env.LIVE.put(k, JSON.stringify({ calls }), { expirationTtl: 60 * 60 * 6 });
  } catch {
    /* 🔴 NEVER FAIL THE CALL FOR THE SAKE OF THE BOARD. The call is already
     * stored by the time this runs. Throwing here would turn a leaderboard
     * problem into a lost stake. */
  }
}

async function upstream(url: string, ttl: number): Promise<any> {
  const req = new Request(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        + ' (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      accept: 'application/json, text/plain, */*'
    },
    cf: { cacheTtl: ttl, cacheEverything: true } as any
  });
  const res = await fetch(req);
  if (!res.ok) throw new Error(`espn ${res.status}`);
  return res.json();
}

/* 🔴 A GAME THAT HAS NOT STARTED HAS NO LIVE STATE, SO ITS LINK UNFURLED AS THE
 * PRODUCT PITCH. Jason, 2026-09-11: "The text message and graphic don't match" -
 * the Text it message named Villanova at Louisville, and the link could only say
 * "Any Given Snap", because the poller writes a game once it is on and the share
 * went out three hours before kickoff. The week's slate already holds the teams
 * and the kickoff; this builds the few fields the tags read from it. */
async function slateState(env: any, key: string): Promise<any | null> {
  const m = /^(nfl|college-football):(\d+)$/.exec(key);
  if (!m) return null;
  const sport = m[1], id = m[2];
  const season = Number(env.SEASON) || 2026;
  const wk = Number(String((await env.LIVE.get(`slate:${sport}:current`)) || '').trim());
  if (!wk) return null;
  for (const w of [wk, wk + 1, wk - 1]) {
    const raw = await env.LIVE.get(`slate:${sport}:${season}:${w}`);
    if (!raw) continue;
    const g = ((JSON.parse(raw).games || []) as any[]).find((x) => String(x.id) === id);
    if (!g) continue;
    const teams: Record<string, any> = {};
    for (const t of g.teams || []) {
      teams[String(t.id)] = { name: t.name || t.short || t.abbrev, abbrev: t.abbrev || t.short || t.name };
    }
    return {
      teams, awayTeamId: String(g.awayTeamId), homeTeamId: String(g.homeTeamId), kickoffUtc: g.kickoffUtc,
      status: g.status === 'final' ? 'final' : g.status === 'in_progress' ? 'live' : 'scheduled',
      awayScore: g.awayScore, homeScore: g.homeScore
    };
  }
  return null;
}

export default {
  /* 🔴 THE SCHEDULED HALF. Jason: "Did we move everything to the cloud?"
   * Not until this. Every ten minutes: refresh the week's slate from the core
   * API, and make sure a Durable Object poller is running for anything in
   * progress.
   *
   * Ten minutes is the SLATE's cadence, not the live board's - a kickoff time
   * or a posted line does not move faster than that, and the live feed is
   * handled by the DOs at ten SECONDS. Cron's one-minute floor is the reason
   * the live layer could never have lived here, and the reason it does not
   * need to.
   *
   * Both leagues, every run. The NFL and college seasons overlap all autumn
   * and there is no cheaper way to know which has a game on than to look. */
  async scheduled(event: any, env: any, ctx: any) {
    /* The game-facts alert: an hourly look from 10 AM, one email a day at most,
     * only when a game inside 48 hours has a team without current nuggets. */
    ctx.waitUntil(nuggetAlertTick(env).then(
      (r) => { if (!r || !(r as any).skipped) console.log('nuggets alert', JSON.stringify(r)); },
      (e) => console.log('nuggets alert FAILED', String(e?.message || e))));
    const season = Number(env.SEASON) || 2026;
    ctx.waitUntil((async () => {
      for (const sport of ['nfl', 'college-football']) {
        try {
          const r = await captureSlate(env, sport, season);
          console.log('cron', sport, JSON.stringify(r));
        } catch (e: any) {
          /* One league failing must not cost the other. */
          console.log('cron', sport, 'FAILED', String(e?.message || e));
        }
      }
      /* A sport that plays every day is captured a day at a time - today and
         tomorrow, one request each (src/slate-day.ts). */
      for (const sport of Object.keys(DAY_SPORTS)) {
        const today = dayOf(Date.now());
        for (const day of [today, addDays(today, 1)]) {
          try {
            const r = await captureDay(env, sport, day);
            console.log('cron', sport, day, r.wrote, (r as any).skipped || '');
          } catch (e: any) {
            console.log('cron', sport, day, 'FAILED', String(e?.message || e));
          }
        }
      }
    })());
  },

  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const p = url.pathname;

    try {
      /* ---- the poller pushes, and ONLY the poller ----
       *
       * 🔴 ESPN RETURNS 403 TO CLOUDFLARE. Not to the header - a browser
       * User-Agent was added and redeployed and it changed nothing - to the
       * datacenter. The vault already records that only the host can reach ESPN,
       * for the cloud container and the mount VM; Workers join that list.
       *
       * So the poller runs on the machine that can reach the feed and pushes
       * here. What matters about the architecture is untouched: ONE thing polls,
       * every phone reads one shared copy, and no client is ever handed ESPN's
       * URL. The poller simply lives on the host until a feed exists that a
       * Worker can reach - CollegeFootballData for college, which is the paid
       * feed the vault already chose, and an open question for NFL.
       *
       * The token is a secret rather than a check on the caller's address,
       * because a Worker cannot trust an IP. */
      /* ---- email sign-in: /api/auth/start, /verify, /me, /logout ---- */
      /* Which teams are due for nuggets, and which play inside 48 hours without
       * them (src/nugget-due.ts). Read-only; the laptop run and the alert use it. */
      if (p === '/api/nuggets/due' && req.method === 'GET') {
        const days = Math.min(14, Math.max(1, Number(url.searchParams.get('days')) || 7));
        return json(await computeDue(env, Date.now(), days));
      }

      const authRes = await handleAuth(req, env, p, json);
      if (authRes) return authRes;

      /* ---- group pools: /api/group/* (src/groups.ts) - 2026-09-11 ---- */
      const groupRes = await handleGroups(req, env, p, json);
      if (groupRes) return groupRes;

      /* ---- the alert bell: one game as a calendar event ----
       * Jason, 2026-09-11: "yes, calendar for now". Stateless - the bell's link
       * carries the title, kickoff and game key, src/lib/ics.ts bounds all of
       * them and builds the link back itself. `inline` so iPhone Safari offers
       * Add to Calendar rather than a download prompt. */
      if (p === '/api/ics' && req.method === 'GET') {
        const ev = icsFromQuery(url.searchParams, Date.now());
        if (!ev) return new Response('not a game', { status: 400, headers: { 'content-type': 'text/plain' } });
        return new Response(ev.body, {
          headers: {
            'content-type': 'text/calendar; charset=utf-8',
            'content-disposition': `inline; filename="${ev.filename}"`,
            'cache-control': 'no-store'
          }
        });
      }

      if (p === '/api/push' && req.method === 'POST') {
        const token = req.headers.get('x-push-token') || '';
        if (!env.PUSH_TOKEN || token !== env.PUSH_TOKEN) return json({ error: 'no' }, 401);
        const body = await req.json() as { key?: string; state?: unknown };
        if (!body.key || !body.state) return json({ error: 'key and state required' }, 400);
        await env.LIVE.put(body.key, JSON.stringify({ ...body.state as object, pushedAt: Date.now() }), {
          /* A live game is worthless when stale and this is a rig, not a record.
           * Six hours covers a game and its overtime and then forgets it. */
          expirationTtl: 60 * 60 * 6
        });
        return json({ ok: true, key: body.key });
      }

      /* ---- THE TV LAG MEASUREMENT, SO IT STOPS LIVING ONLY ON ONE PHONE ----
       *
       * 🔴 Jason: "Can it pass this info to you or do you need a screen shot?"
       * Screenshots, until now - the taps were in localStorage, which is the
       * one place nothing else in the system can read. The feed's own lag was
       * always on the wire; the half of the equation that decides whether this
       * product works was not.
       *
       * 🔴 UNAUTHENTICATED ON PURPOSE, AND SAFE BECAUSE OF WHAT IT CANNOT DO.
       * The push endpoint above is token-protected because a client that can
       * write a score can grade its own pick. This writes a diagnostic under a
       * fixed `tvlag:` prefix and nothing reads it back into settlement, the
       * board, the bank or a price. The worst a forged post achieves is a wrong
       * number in a measurement Jason is reading with his own eyes.
       *
       * Bounded anyway: the key prefix is fixed here rather than taken from the
       * body, the device id is pattern-checked, and at most 20 samples are
       * kept - so it cannot be used to write arbitrary keys or fill KV. */
      if (p === '/api/tvlag' && req.method === 'POST') {
        const b = await req.json() as { deviceId?: string; gaps?: unknown; tvLagSec?: unknown };
        const id = String(b.deviceId || '').replace(/[^a-z0-9-]/gi, '').slice(0, 64);
        if (!id) return json({ error: 'deviceId required' }, 400);
        const gaps = Array.isArray(b.gaps)
          ? b.gaps.filter((g) => typeof g === 'number' && g > -600 && g < 600).slice(-20)
          : [];
        const rec = JSON.stringify({
          deviceId: id, gaps,
          tvLagSec: typeof b.tvLagSec === 'number' ? b.tvLagSec : null,
          at: Date.now()
        });
        /* Per device, and a `latest` copy so a reading can be found without
         * knowing which phone produced it. */
        await env.LIVE.put('tvlag:' + id, rec, { expirationTtl: 60 * 60 * 24 * 7 });
        await env.LIVE.put('tvlag:latest', rec, { expirationTtl: 60 * 60 * 24 * 7 });
        return json({ ok: true, samples: gaps.length });
      }

      /* ---- CAN A WORKER REACH ESPN AT ALL? ----
       * Everything about moving the poller off Jason's laptop depends on this
       * one fact, and the vault records site.api 403ing from Cloudflare. Worth
       * ten lines to know rather than assume - the last three assumptions about
       * this feed were all wrong. Token-protected because it is an outbound
       * fetch on demand. */
      if (p === '/api/probe' && req.method === 'GET') {
        const token = req.headers.get('x-push-token') || '';
        if (!env.PUSH_TOKEN || token !== env.PUSH_TOKEN) return json({ error: 'no' }, 401);
        const out: Record<string, unknown> = {};
        const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
          + ' (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
        for (const [name, url] of [
          ['site', 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=401872656'],
          ['core', 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/401872656'],
          ['coreplays', 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/401872656/competitions/401872656/plays?limit=400'],
          ['corecomp', 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/401872656/competitions/401872656/drives?limit=100']
        ] as [string, string][]) {
          const t0 = Date.now();
          try {
            const r = await fetch(url, { headers: { 'user-agent': UA } });
            let plays: number | null = null;
            if (r.ok && (name === 'coreplays' || name === 'corecomp')) {
              const j = await r.json() as any;
              const it = j?.items || [];
              const lastItem = it[it.length - 1] || {};
              out[name + ':shape'] = {
                count: it.length,
                keys: Object.keys(lastItem).slice(0, 22),
                wallclock: lastItem.wallclock || null,
                text: String(lastItem.text || '').slice(0, 40)
              };
            }
            if (r.ok && name === 'site') {
              const j = await r.json() as any;
              const d = j?.drives?.current || (j?.drives?.previous || []).slice(-1)[0];
              plays = (d?.plays || []).length;
            }
            out[name] = { status: r.status, ms: Date.now() - t0, plays };
          } catch (e: any) {
            out[name] = { error: String(e?.message || e), ms: Date.now() - t0 };
          }
        }
        return json(out);
      }

      /* ---- START AND STOP THE CLOUD POLLER ----
       * Token-protected: it makes an outbound loop run, and the same rule as
       * /api/push applies - a client that can start a poller can point it at
       * anything. One object per game, named for the game, so starting twice
       * is idempotent rather than the four-poller pileup that corrupted an
       * hour of tonight's data. */
      /* 🔴 `ensure` IS THE ONE POLLER ACTION A CLIENT MAY CALL. Everything else
       * here stays behind the token, because starting an arbitrary poller is
       * an outbound loop somebody else pays for. This one is bounded: the game
       * must be IN PROGRESS on our own captured slate, so the worst a stranger
       * achieves is starting a poller the cron was about to start anyway.
       *
       * It exists because the cron runs every ten minutes and a person picking
       * a game from the selector should not wait for the next tick to see it. */
      if (p === '/api/poller/ensure') {
        const u0 = new URL(req.url);
        const gid = (u0.searchParams.get('game') || '').replace(/\D/g, '');
        const sp = u0.searchParams.get('sport') === 'college-football' ? 'college-football' : 'nfl';
        if (!gid) return json({ error: 'game required' }, 400);
        const season = Number(env.SEASON) || 2026;
        /* 🔴 THE GATE IS pollDecision AND IT READS THE CLOCK, NOT THE STATUS.
         * The stored slate is up to ten minutes stale, so this used to refuse
         * a poller for a game that had genuinely kicked - answering the one
         * action a person takes when the feed looks dead with "not in
         * progress on our slate". Same rule as the cron, one file. */
        let ok = false;
        let why = 'no game by that id on any slate';
        for (let wk = 1; wk <= 20; wk++) {
          const raw = await env.LIVE.get(`slate:${sp}:${season}:${wk}`);
          if (!raw) continue;
          let g: any = null;
          try {
            g = (JSON.parse(raw).games || []).find((x: any) => String(x.id) === gid);
          } catch { continue; }
          if (!g) continue;
          const d = pollDecision(g, Date.now());
          ok = d.poll; why = d.why;
          break;
        }
        if (!ok) return json({ ok: false, reason: why });
        const stub0 = env.POLLER.get(env.POLLER.idFromName(`${sp}:${gid}`));
        await stub0.fetch(new Request('https://do/start', {
          method: 'POST', body: JSON.stringify({ gameId: gid, sport: sp })
        }));
        return json({ ok: true, started: `${sp}:${gid}` });
      }

      if (p.startsWith('/api/poller/')) {
        const token = req.headers.get('x-push-token') || '';
        if (!env.PUSH_TOKEN || token !== env.PUSH_TOKEN) return json({ error: 'no' }, 401);
        const u = new URL(req.url);
        const gameId = (u.searchParams.get('game') || '').replace(/\D/g, '');
        const sport = u.searchParams.get('sport') || 'nfl';
        if (!gameId) return json({ error: 'game required' }, 400);
        const id = env.POLLER.idFromName(`${sport}:${gameId}`);
        const stub = env.POLLER.get(id);
        const action = p.slice('/api/poller/'.length) || 'status';
        const res = await stub.fetch(new Request(`https://do/${action}`, {
          method: action === 'status' ? 'GET' : 'POST',
          body: action === 'start' ? JSON.stringify({ gameId, sport,
            everyMs: Number(u.searchParams.get('every')) || undefined }) : undefined
        }));
        return new Response(await res.text(), {
          status: res.status,
          headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
        });
      }

      /* Run the scheduled capture on demand - the only way to test a cron
         without waiting ten minutes for it, and how a new week gets seeded. */
      if (p === '/api/cron/slate' && req.method === 'POST') {
        const token = req.headers.get('x-push-token') || '';
        if (!env.PUSH_TOKEN || token !== env.PUSH_TOKEN) return json({ error: 'no' }, 401);
        const u = new URL(req.url);
        const sport = u.searchParams.get('sport') || 'nfl';
        const out = await captureSlate(env, sport, Number(env.SEASON) || 2026);
        return json(out);
      }

      /* ---- a sport that plays every day, one day at a time ----
         /api/day/<sport>/current  -> which day is today, and tomorrow
         /api/day/<sport>/YYYYMMDD -> that day's games, refreshed when stale */
      const dm = p.match(/^\/api\/day\/([a-z-]+)\/(current|\d{8})$/);
      if (dm) {
        const sport = dm[1], which = dm[2];
        const head = { 'content-type': 'application/json', 'cache-control': 'no-store' };
        if (!isDaySport(sport)) return new Response(JSON.stringify({ error: 'not a day sport', sport }), { status: 404, headers: head });
        if (which === 'current') {
          const today = dayOf(Date.now());
          return new Response(JSON.stringify({ sport, today, days: [today, addDays(today, 1)] }), { headers: head });
        }
        const doc = await serveDay(env, sport, which);
        if (!doc) return new Response(JSON.stringify({ error: 'nothing captured for that day', sport, day: which }), { status: 404, headers: head });
        return new Response(JSON.stringify(doc), { headers: head });
      }

      /* ---- WHICH SECRETS ARE SET, AND HOW LONG - NEVER A VALUE ----
         wrangler's hidden prompt showed a single "*" for every secret Jason set
         on 2026-09-12, and a single "*" once meant a one-character paste (the
         Anthropic key, 2026-09-11). This answers it without anybody seeing a
         key: set or not, the length, and whether a known public prefix is
         there. Lengths and prefixes are not secrets; values never leave. */
      if (p === '/api/health/secrets') {
        const e = env as any;
        /* Every secret-shaped binding the Worker holds, by name - so a key set
           that nothing reads shows up too. Length only; a known public prefix
           where there is one. */
        const PREFIX: Record<string, string> = { RESEND_API_KEY: 're_', MAILERSEND_API_KEY: 'mlsn.' };
        const out: Record<string, any> = {};
        for (const k of Object.keys(e).sort()) {
          if (!/(_KEY|_TOKEN|_SECRET)$/.test(k)) continue;
          const v = typeof e[k] === 'string' ? e[k] : '';
          out[k] = { set: v.length > 0, length: v.length,
                     ...(PREFIX[k] ? { prefixOk: v.startsWith(PREFIX[k]) } : {}) };
        }
        return new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
      }

      /* ---- F1: the current Grand Prix, its sessions and results (src/f1-feed.ts) ---- */
      if (p === '/api/f1/current') {
        const doc = await serveF1(env);
        const head = { 'content-type': 'application/json', 'cache-control': 'no-store' };
        if (!doc) return new Response(JSON.stringify({ error: 'no F1 event on the feed' }), { status: 404, headers: head });
        return new Response(JSON.stringify(doc), { headers: head });
      }

      /* ---- what the poller last pushed ---- */
      /* The current-week pointer is a bare number, not JSON - served as text
         so a client can read it without a shape to agree on. */
      if (/^\/api\/state\/slate:[a-z-]+:current$/.test(p)) {
        const v = await env.LIVE.get(p.slice('/api/state/'.length));
        if (!v) return new Response('', { status: 404 });
        return new Response(v, { headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' } });
      }

      if (p.startsWith('/api/state/')) {
        const key = p.slice('/api/state/'.length);
        /* 🔴 A GAME KEY ASKS ITS POLLER FIRST. KV reads trail writes by up to a
         * minute at the edge (measured 57s on SF at LAR, 2026-09-10), and the
         * product lives inside a 45-second delay. The Durable Object holds the
         * write itself in memory - see LivePoller.last. KV is the fallback for
         * an evicted or never-started poller, and still the only source for
         * slates and boards. */
        let raw: string | null = null;
        let source = 'kv';
        if (/^[a-z-]+:\d+$/.test(key)) {
          try {
            const res = await env.POLLER.get(env.POLLER.idFromName(key))
              .fetch(new Request('https://do/state'));
            if (res.ok) { raw = await res.text(); source = 'do'; }
          } catch { /* KV below */ }
        }
        if (!raw) raw = await env.LIVE.get(key);
        if (!raw) return json({ error: 'nothing pushed for that game yet', key }, 404);
        /* 🔴 no-store, EXPLICITLY - and the comment that used to be here was the
         * bug. It read "No cache header: KV is already the shared copy, and a
         * stale read here would be a second layer of staleness", which states
         * the right intent and then relies on OMISSION to achieve it. Omitting
         * cache-control does not mean "do not cache"; it means "you decide",
         * and the edge decides yes.
         *
         * Caught 2026-09-10, minutes after the college capture was fixed: the
         * cron wrote 86 games, the key held 86 games, and the app kept drawing
         * a 24-game week. Same URL with a random query string returned 86
         * immediately. So the truncation bug was fixed and STILL on screen,
         * behind a cached copy of itself - the most expensive kind of wrong,
         * because every check of the source agrees with you.
         *
         * The `:current` branch twelve lines above already sends no-store. One
         * of two adjacent handlers had it, which is how it went unnoticed. */
        return new Response(raw, {
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
            'access-control-allow-origin': '*',
            'x-state-source': source
          }
        });
      }

      /* ---- A CALL, AND A BOARD TO PUT IT ON ----
       *
       * 🔴 TWO PEOPLE CALLING SEPARATELY IS A RIG. TWO PEOPLE SEEING EACH OTHER
       * IS THE PRODUCT. Jason wants a friend on it tomorrow, so the board is
       * built tonight rather than after.
       *
       * And it does NOT need a Durable Object. A DO buys low-latency shared state
       * for many viewers; this is a handful of people making a call every forty
       * seconds against a feed everyone is already forty-five seconds behind. KV
       * is eventually consistent by a second or two, which is invisible under a
       * delay that large - and it is free.
       *
       * ONE KEY PER PERSON PER GAME, never one key for the board. KV allows one
       * write a second per key, so a shared array would make two people writing
       * at once a lost call. Separate keys cannot collide at all, and the board is
       * a list.
       *
       * IDENTITY IS A DISPLAY NAME AND A DEVICE. No account, no email, no
       * password - the same rule the pool has, for the same reason.
       */
      if (p === '/api/call' && req.method === 'POST') {
        const b = await req.json() as {
          key?: string; deviceId?: string; name?: string;
          afterPlayId?: string; type?: string; choice?: string; stake?: number; p?: number;
        };
        if (!b.key || !b.afterPlayId || !b.type || !b.choice) {
          return json({ error: 'key, afterPlayId, type and choice are required' }, 400);
        }
        /* 🔴 THE FIRST LIVE CALL ASKS FOR SIGN-IN TOO. Jason, 2026-09-10: "yes,
         * gate the first live call too." Same rule as a pick, from the same
         * function: a session's account when one is sent, a 401 email_required
         * (or profile_required) when REQUIRE_EMAIL is on and there is none. The
         * call then belongs to the ACCOUNT and shows under its handle - nobody
         * can post a call as somebody else any more than a pick. */
        const who = await requireIdentity(req, env, b.deviceId, json);
        if ('error' in who) return who.error;
        const userId = who.userId;
        const me = await sessionAccount(req, env);
        const callerName = ((me && me.handle) || b.name || 'Someone').slice(0, 24);
        /* 🔴 ONE CALL PER SNAP, enforced by the KEY rather than by a check.
         * The id is the game, the person and the play they called after - so a
         * second tap on the same snap overwrites rather than double-counting, and
         * requirement 7.4 holds without the server having to remember anything.
         * Keyed by the ACCOUNT, so one person on two phones is still one call. */
        const id = `call:${b.key}:${userId}:${b.afterPlayId}`;
        const existing = await env.LIVE.get(id);
        if (existing) {
          /* 🔴 A LATE NAME MAY LAND. THE PICK MAY NOT.
           *
           * The name is asked for AFTER the first call — doctrine, and the only
           * way a stranger reaches the game without a wall in front of it — so a
           * call is necessarily made before there is a name to put on it. When
           * the name arrives, the rows already on the board have to take it, or
           * the person who just named themselves still sits there as a stranger
           * beside their own results.
           *
           * Everything else is frozen. The choice, the stake and the price are
           * read from what is already stored and never from this request, so a
           * re-post cannot change a call after the play that answers it. That is
           * requirement 7.4 holding under a second write rather than in spite of
           * one — and it works precisely because the key is the game, the device
           * and the play, so a second tap addresses the same record by
           * construction. */
          const prev = JSON.parse(existing);
          const name = callerName === 'Someone' ? '' : callerName;
          if (name && name !== prev.name) {
            const renamed = { ...prev, name };
            await env.LIVE.put(id, JSON.stringify(renamed), { expirationTtl: 60 * 60 * 6 });
            await mergeBoard(env, b.key, renamed);
            return json({ ok: true, alreadyCalled: true, renamed: true, call: renamed });
          }
          return json({ ok: true, alreadyCalled: true, call: prev });
        }

        /* deviceId stays the PHONE that made the call - the screen finds its own
           rows by it - and userId is the person, which the board merges on. */
        const call = {
          key: b.key, deviceId: String(b.deviceId || userId), userId, name: callerName,
          afterPlayId: b.afterPlayId, type: b.type, choice: b.choice,
          stake: Math.max(0, Math.min(25, Number(b.stake) || 10)),
          p: typeof b.p === 'number' ? b.p : null,
          at: Date.now()
        };
        await env.LIVE.put(id, JSON.stringify(call), { expirationTtl: 60 * 60 * 6 });
        await mergeBoard(env, b.key, call);
        return json({ ok: true, call });
      }

      /* Everybody's calls on one game. The client settles them against the plays
       * it already holds, so the board is a read and never a computation here. */
      /* 🔴 ONE GET, NEVER A LIST. Found in production 2026-09-09 by a
       * verification agent: every poll returned 502
       * `KV list() limit exceeded for the day.`
       *
       * This route used to `list()` the `call:<key>:` prefix and then `get()`
       * every match. The client polls it every 5 seconds, PER DEVICE, so one
       * person watching one game for an hour costs 720 list operations against
       * a daily allowance of 1,000. The board was dead for the rest of the UTC
       * day before anybody had made a call - on the day of the opener.
       *
       * A list-per-poll is the wrong shape regardless of the quota: reads are
       * constant and writes are rare, so the aggregate belongs on the WRITE.
       * `board:<key>` is one document holding every call for a game, merged by
       * mergeBoard() when a call lands. Reading it is a single get.
       *
       * The individual `call:` records are still written and are still the
       * authority for one-call-per-snap - the board doc is a projection of
       * them, so a lost merge costs a row on a leaderboard and never a call. */
      if (p.startsWith('/api/board/')) {
        const key = p.slice('/api/board/'.length);
        /* An empty key would read `board:` and hand back somebody else's game. */
        if (!key || key === 'null' || key === 'undefined') {
          return json({ error: 'a game key is required' }, 400);
        }
        const raw = await env.LIVE.get(`board:${key}`);
        const calls = raw ? (JSON.parse(raw).calls || []) : [];
        return json({ key, calls, fetchedAt: Date.now() });
      }

      /* ================= THE POOL, IN D1 =================
       *
       * 🔴 EVERY WRITE HERE IS IDENTIFIED BY A DEVICE ID AND NOTHING ELSE. No
       * account, no password, no email - doctrine: nothing sits in front of the
       * slate, and the most that may be asked is a display name, after the first
       * pick. The device id is generated on the phone and is the only identity
       * this app has ever needed.
       *
       * 🔴 AND THAT IS A DELIBERATE, STATED WEAKNESS. Anyone can post any device
       * id, so a determined person can write picks as somebody else. That is
       * acceptable for a free pool scored in points with nothing purchasable and
       * nothing redeemable, and it would NOT be acceptable the moment anything
       * of value hung on it. If that ever changes, this is the paragraph that
       * has to be answered first.
       */
      if (p === '/api/pool/pick' && req.method === 'POST') {
        const b = await req.json() as {
          poolId?: string; deviceId?: string; name?: string; gameId?: string;
          side?: string; sport?: string; week?: number; spread?: number | null;
          kickoffUtc?: number;
        };
        if (!b.gameId || (b.side !== 'home' && b.side !== 'away')) {
          return json({ error: 'gameId and a side are required' }, 400);
        }
        /* 🔴 WHO, DECIDED BY THE SERVER. A session's account whenever one is
           sent; the bare device id only while email is not yet required. This
           is the line Jason's "I can log in for you and tank your picks"
           was about - see src/auth.ts. */
        const who = await requireIdentity(req, env, b.deviceId, json);
        if ('error' in who) return who.error;
        const userId = who.userId;
        const sport = b.sport === 'nfl' ? 'nfl' : 'college-football';
        const poolId = b.poolId || (sport === 'nfl' ? 'world-nfl' : 'world-cfb');
        const week = Number(b.week) || 0;

        /* 🔴 THE KICKOFF IS THE ONLY LOCK, AND THE SERVER OWNS THE CLOCK. A
         * client that could pick after kickoff could pick a game it had already
         * watched. The kickoff comes from the slate we captured, not from the
         * request, so a client cannot move its own deadline. */
        const g = await env.DB.prepare('SELECT kickoff_utc FROM game WHERE id = ?')
          .bind(String(b.gameId)).first<{ kickoff_utc: number }>();
        const kickoff = g ? g.kickoff_utc : Number(b.kickoffUtc) || 0;
        if (kickoff && Date.now() >= kickoff) {
          return json({ error: 'that game has kicked off', message: 'That game has kicked off. Picks lock at kickoff.', locked: true }, 409);
        }

        /* 🔴 A GROUP IS INVITE-ONLY, SO A PICK NEVER JOINS ONE. Jason,
         * 2026-09-11: "invite people to this invite only group". Picks carry the
         * group's id now (a dropdown per group), and a pick into a group you are
         * not in - or were removed from - is refused rather than quietly making
         * you a member. The world pool keeps its implicit join. */
        if (!poolId.startsWith('world-')) {
          const inIt = await env.DB.prepare(
            'SELECT 1 AS x FROM member WHERE pool_id = ? AND user_id = ?'
          ).bind(poolId, userId).first();
          if (!inIt) return json({ error: 'not_a_member', message: 'You are not in this group.' }, 403);
        }

        /* Membership is implicit: your first pick joins you. An explicit join
         * step in front of a pick is the account wall wearing a different hat. */
        if (poolId.startsWith('world-')) await env.DB.prepare(
          `INSERT INTO member (pool_id, user_id, display_name, joined_week, role)
           VALUES (?, ?, ?, ?, 'player')
           ON CONFLICT(pool_id, user_id) DO UPDATE SET
             display_name = CASE WHEN excluded.display_name <> ''
                                 THEN excluded.display_name ELSE member.display_name END`
        ).bind(poolId, userId, (who.handle || String(b.name || '')).slice(0, 24), week).run();

        /* 🔴 ONE PICK PER PERSON PER GAME, ENFORCED BY THE PRIMARY KEY rather
         * than by a check - the same trick one-call-per-snap uses. A second pick
         * addresses the same row by construction, so it overwrites instead of
         * double-counting and the rule holds with the server remembering
         * nothing. */
        await env.DB.prepare(
          `INSERT INTO pick (pool_id, user_id, game_id, side, made_at, locked_at,
                             week, sport, spread_at)
           VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)
           ON CONFLICT(pool_id, user_id, game_id) DO UPDATE SET
             side = excluded.side, made_at = excluded.made_at,
             spread_at = excluded.spread_at`
        ).bind(poolId, userId, String(b.gameId), b.side, Date.now(), week, sport,
               typeof b.spread === 'number' ? b.spread : null).run();

        return json({ ok: true, poolId });
      }

      /* 🔴 START A POOL. Jason, 2026-09-09: "Pools, if you are not in a pool,
       * you have to start a pool or get in invite."
       *
       * Both routes are one endpoint apart and neither asks for an account. The
       * code IS the pool id, so there is one string to share and nothing to look
       * up - the same reasoning as the invite link carrying the game.
       */
      if (p === '/api/pool/create' && req.method === 'POST') {
        const b = await req.json() as { deviceId?: string; name?: string; poolName?: string; sport?: string; week?: number };
        const who = await requireIdentity(req, env, b.deviceId, json);
        if ('error' in who) return who.error;
        const userId = who.userId;
        const sport = b.sport === 'nfl' ? 'nfl' : 'college-football';
        /* 🔴 A POOL CAN BE ONE WEEK, OR THE SEASON. Jason: "The pools can also
         * be single weeks." NULL is the season, which is every pool that
         * already exists - so this is additive and needs no backfill.
         *
         * Validated as a RANGE rather than for truthiness: week 0 is not a
         * week, and `b.week ? ... : null` would have quietly turned a bad
         * value into a season-long pool nobody asked for. This app shipped
         * three separate bugs from exactly that shortcut tonight. */
        const wk = Number(b.week);
        const week = Number.isInteger(wk) && wk >= 1 && wk <= 22 ? wk : null;

        /* 🔴 NO VOWELS IN THE CODE. Six characters from a 26-letter alphabet
         * will eventually spell something, and a pool code that has to be read
         * aloud or typed by a friend cannot be a word somebody is embarrassed
         * to say. Dropping the vowels makes that impossible rather than
         * unlikely, and also removes the 0/O and 1/I confusions on paper. */
        const AB = '23456789BCDFGHJKLMNPQRSTVWXYZ';
        let code = '';
        for (let i = 0; i < 6; i++) code += AB[Math.floor(Math.random() * AB.length)];

        await env.DB.prepare(
          `INSERT INTO pool (id, name, commissioner_id, scope, scope_arg, ranking_source,
                             ats, season, scope_locked_at, created_at, sport, week)
           VALUES (?, ?, ?, 'all', NULL, NULL, 0, 2026, NULL, ?, ?, ?)`
        ).bind(code, String(b.poolName || 'Our pool').slice(0, 40), userId, Date.now(), sport, week).run();

        await env.DB.prepare(
          `INSERT INTO member (pool_id, user_id, display_name, joined_week, role)
           VALUES (?, ?, ?, 0, 'commissioner')`
        ).bind(code, userId, (who.handle || String(b.name || '')).slice(0, 24)).run();

        return json({ ok: true, poolId: code, name: b.poolName || 'Our pool', sport, week });
      }

      /* Join by code. Idempotent: joining twice is joining. */
      if (p === '/api/pool/join' && req.method === 'POST') {
        const b = await req.json() as { deviceId?: string; code?: string; name?: string };
        if (!b.code) return json({ error: 'code is required' }, 400);
        const who = await requireIdentity(req, env, b.deviceId, json);
        if ('error' in who) return who.error;
        const userId = who.userId;
        /* Uppercased and stripped, because somebody typing a code off a screen
         * will send it in whatever case and spacing their keyboard produced. */
        const code = String(b.code).toUpperCase().replace(/[^A-Z0-9]/g, '');
        const pool = await env.DB.prepare('SELECT id, name, sport FROM pool WHERE id = ?')
          .bind(code).first<{ id: string; name: string; sport: string }>();
        if (!pool) return json({ error: 'no pool with that code' }, 404);
        /* Removed by the commissioner means the code does not let you back in. */
        const gone = await env.DB.prepare(
          'SELECT 1 AS x FROM pool_removed WHERE pool_id = ? AND user_id = ?'
        ).bind(code, userId).first();
        if (gone) return json({ error: 'removed', message: 'The commissioner removed you from this group.' }, 403);

        await env.DB.prepare(
          `INSERT INTO member (pool_id, user_id, display_name, joined_week, role)
           VALUES (?, ?, ?, 0, 'player')
           ON CONFLICT(pool_id, user_id) DO NOTHING`
        ).bind(code, userId, (who.handle || String(b.name || '')).slice(0, 24)).run();

        return json({ ok: true, poolId: pool.id, name: pool.name, sport: pool.sport });
      }

      /* 🔴 WHAT AN INVITE LINK SHOWS BEFORE ANYTHING IS ASKED. The landing names
       * the group, who started it and how many are in - the three things that
       * make a stranger's link feel like an invitation rather than a sign-up
       * form (p1-invite's whole argument). The commissioner is returned by
       * DISPLAY NAME only; their device id is the one thing here that could be
       * used to write picks as them, so it never leaves the database. */
      if (p === '/api/pool/info') {
        const code = String(url.searchParams.get('code') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!code) return json({ error: 'code required' }, 400);
        const pool = await env.DB.prepare(
          `SELECT p.id, p.name, p.sport, p.week,
                  (SELECT COUNT(*) FROM member m WHERE m.pool_id = p.id) AS members,
                  (SELECT display_name FROM member m
                    WHERE m.pool_id = p.id AND m.role = 'commissioner' LIMIT 1) AS commissioner
             FROM pool p WHERE p.id = ? AND p.id NOT LIKE 'world-%'`
        ).bind(code).first() as any;
        if (!pool) return json({ error: 'no group with that code' }, 404);
        return json({ id: pool.id, name: pool.name, sport: pool.sport, week: pool.week,
                      members: pool.members, commissioner: pool.commissioner || null });
      }

      /* Which pools is this device in? Drives the standings scope selector, and
       * it is the question "am I in a pool" - which the screen must be able to
       * answer before it can offer to start one. */
      if (p === '/api/pool/mine') {
        /* A signed-in person's groups follow the account, not the phone. */
        const me = await sessionAccount(req, env);
        const device = me ? me.accountId : (url.searchParams.get('device') || '');
        if (!device) return json({ pools: [] });
        const rows = await env.DB.prepare(
          `SELECT p.id, p.name, p.sport,
                  (SELECT COUNT(*) FROM member m2 WHERE m2.pool_id = p.id) AS members
             FROM member m JOIN pool p ON p.id = m.pool_id
            WHERE m.user_id = ? AND p.id NOT LIKE 'world-%'
            ORDER BY p.created_at DESC LIMIT 20`
        ).bind(device).all();
        return json({ pools: rows.results || [] });
      }

      /* 🔴 THE RESULTS TABLE, WRITTEN BY THE POLLER AND BY NOTHING ELSE.
       *
       * Token-protected for the same reason /api/push is: a client that could
       * write a final score could grade its own pick. The standings query reads
       * `game` and never trusts anything a browser sent.
       *
       * It takes the whole week in one request rather than a game at a time -
       * the poller already holds the week, and 24 round trips to write 24 rows
       * is how a two-minute cron becomes a five-minute one. */
      if (p === '/api/pool/games' && req.method === 'POST') {
        if (req.headers.get('x-push-token') !== env.PUSH_TOKEN) {
          return json({ error: 'no' }, 401);
        }
        const b = await req.json() as { sport?: string; season?: number; week?: number; games?: any[] };
        const sport = b.sport === 'nfl' ? 'nfl' : 'college-football';
        const list = Array.isArray(b.games) ? b.games : [];
        if (!list.length) return json({ error: 'no games' }, 400);

        const stmt = env.DB.prepare(
          `INSERT INTO game (id, season, week, kickoff_utc, home_team_id, away_team_id,
                             spread, status, home_score, away_score, void, sport)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
           ON CONFLICT(id) DO UPDATE SET
             kickoff_utc = excluded.kickoff_utc,
             spread      = COALESCE(excluded.spread, game.spread),
             status      = excluded.status,
             home_score  = excluded.home_score,
             away_score  = excluded.away_score`
        );
        /* 🔴 `void` IS NOT UPDATED HERE. A game marked void has been ruled on -
         * one void path, decided once - and a poller that reset it on every tick
         * would silently un-void a cancelled game the moment the feed changed
         * its mind about the status string. */
        await env.DB.batch(list.slice(0, 200).map((g: any) => stmt.bind(
          String(g.id), Number(b.season) || 2026, Number(b.week) || 0,
          Number(g.kickoffUtc) || 0, String(g.homeTeamId || ''), String(g.awayTeamId || ''),
          typeof g.spread === 'number' ? g.spread : null,
          String(g.status || 'scheduled'),
          g.homeScore == null ? null : Number(g.homeScore),
          g.awayScore == null ? null : Number(g.awayScore),
          sport
        )));
        return json({ ok: true, wrote: Math.min(list.length, 200) });
      }

      /* The board. Straight up unless a group's commissioner turns against-the-
       * spread on (Jason, 2026-09-11: "the comish has the option" - see the
       * scoring below). What that amends was 09-09's, word for word (Jason,
       * 2026-09-09) - the against-the-spread product is the week's card and it
       * is not a pool. */
      /* 🔴 YOUR OWN PICKS IN ONE GROUP. A group's picks are its own since
       * 2026-09-11 and the Pool screen only had the phone's copy - so picks made on
       * another device, or copied into a group by migration 0007, showed as
       * unpicked (found by the Pool screen's agent). Signed in, members only, the
       * caller's rows and nobody else's, never cached (`json` sends no-store). The
       * world pool is not served here: it has its own device history. */
      if (p === '/api/pool/picks' && req.method === 'GET') {
        const s = await sessionAccount(req, env);
        if (!s) return json({ error: 'signed_out', message: 'Sign in to see your picks.' }, 401);
        const poolId = String(url.searchParams.get('pool') || '');
        if (!poolId || poolId.startsWith('world-')) {
          return json({ error: 'pool_required', message: 'Which group?' }, 400);
        }
        const sport = url.searchParams.get('sport') === 'nfl' ? 'nfl' : 'college-football';
        const week = Number(url.searchParams.get('week')) || 0;
        const inIt = await env.DB.prepare(
          'SELECT 1 AS x FROM member WHERE pool_id = ? AND user_id = ?'
        ).bind(poolId, s.accountId).first();
        if (!inIt) return json({ error: 'not_a_member', message: 'You are not in this group.' }, 403);
        const rows = await env.DB.prepare(
          `SELECT game_id AS gameId, side FROM pick
            WHERE pool_id = ? AND user_id = ? AND sport = ? AND (? = 0 OR week = ?)`
        ).bind(poolId, s.accountId, sport, week, week).all();
        return json({ pool: poolId, sport, week, picks: rows.results || [] });
      }

      if (p === '/api/pool/standings') {
        const sport = url.searchParams.get('sport') === 'nfl' ? 'nfl' : 'college-football';
        let week = Number(url.searchParams.get('week')) || 0;
        const poolId = url.searchParams.get('pool')
          || (sport === 'nfl' ? 'world-nfl' : 'world-cfb');

        /* 🔴 SCORED IN THE QUERY, FROM RESULTS THE CLIENT CANNOT WRITE. A client
         * that could report a final score could grade its own pick. `game` is
         * written by the slate poller on the host and by nothing else.
         *
         * A void game contributes to NOTHING - not a win, not a loss, not the
         * played count. One void path: the game did not happen, for everybody. */
        /* 🔴 A ONE-WEEK POOL SCORES ONE WEEK, WHATEVER THE CALLER ASKS FOR.
         * The query already took a week filter, for the "this week only" view
         * of a season pool - so a single-week pool needs no new SQL, only a
         * refusal to be talked out of its own week.
         *
         * Forced on the SERVER rather than trusted from the request, because
         * the caller is a browser. A client that could widen a one-week pool
         * to the season would be reading other weeks' picks into a board it
         * was never entered in, which is a scoring bug wearing a query
         * parameter. Same rule as the final score: if it decides a result, it
         * is decided here. */
        /* 🔴 A GROUP SCORES ITS MEMBERS' PICKS - THE ONES THEY MADE ON THE SLATE.
         * Found 2026-09-10 building the pool server: the slate posts every pick
         * without a pool id, so every pick lands in the world pool, and this
         * query joined picks on the GROUP's id - which held none. Two groups
         * existed with members and every one of them would have shown 0 picks.
         *
         * One pick per person per game, counted in every board that person is
         * on. That is also the right product: you pick Saturday once, and your
         * office group and your family group both score it. A second set of
         * picks per group would be a second slate to fill in. */
        const worldId = sport === 'nfl' ? 'world-nfl' : 'world-cfb';
        /* 🔴 REVERSED 2026-09-11: A GROUP SCORES ITS OWN PICKS. Jason: "if i am
         * part of more than one group, then i need a dropdown to enter different
         * selections for the different groups." The note above was the right
         * product for one slate; it is not for a person in two groups who picks
         * differently in each. Picks now carry the group's id (the slate's group
         * mode), migration 0007 seeded every group with its members' world picks
         * so no board reset, and the world board still reads the world pool. */
        const pickPool = poolId.startsWith('world-') ? worldId : poolId;
        let ats = false;
        try {
          const meta = await env.DB.prepare('SELECT week, ats FROM pool WHERE id = ?')
            .bind(poolId).first() as any;
          if (meta && Number.isInteger(meta.week)) week = meta.week;
          if (meta && Number(meta.ats) === 1 && !poolId.startsWith('world-')) ats = true;
        } catch { /* a pool with no row cannot be narrowed */ }

        /* 🔴 AGAINST THE SPREAD IS THE COMMISSIONER'S OPTION. Jason, 2026-09-11:
         * "the comish has the option." With the group's switch on, a pick wins
         * when its side COVERS, the same arithmetic as `resolveGame` in
         * src/lib/pool.ts: home score + home spread - away score.
         *
         * The line is the one the pick was made at (`pick.spread_at`, what the
         * row showed when it was tapped), then the game's, then none - and no line
         * scores straight up, as pool.ts does. Not the game's line first: the
         * slate cron rewrites `game.spread` every ten minutes, so it is a moving
         * number, and a person should be held to the line they saw.
         *
         * A margin of exactly zero is a push, and a push is the one void path: it
         * counts for nobody - not a win, not a loss, not played. Straight up, zero
         * is a tie and voids the same way. The fragment is a constant chosen here,
         * never built from the request. */
        const margin = ats
          ? '(g.home_score + COALESCE(p.spread_at, g.spread, 0) - g.away_score)'
          : '(g.home_score - g.away_score)';
        const rows = await env.DB.prepare(
          `SELECT m.user_id AS id,
                  m.display_name AS name,
                  COUNT(p.game_id) AS picks,
                  SUM(CASE WHEN g.status = 'final' AND g.void = 0
                            AND g.home_score IS NOT NULL AND g.away_score IS NOT NULL
                            AND ${margin} <> 0
                            AND p.side = CASE WHEN ${margin} > 0
                                              THEN 'home' ELSE 'away' END
                       THEN 1 ELSE 0 END) AS wins,
                  SUM(CASE WHEN g.status = 'final' AND g.void = 0
                            AND g.home_score IS NOT NULL AND g.away_score IS NOT NULL
                            AND ${margin} <> 0
                       THEN 1 ELSE 0 END) AS played
             FROM member m
             LEFT JOIN pick p
               ON p.pool_id = ? AND p.user_id = m.user_id
              AND p.sport = ? AND (? = 0 OR p.week = ?)
             LEFT JOIN game g ON g.id = p.game_id
            WHERE m.pool_id = ?
            GROUP BY m.user_id, m.display_name
            ORDER BY wins DESC, picks DESC
            LIMIT 200`
        ).bind(pickPool, sport, week, week, poolId).all();

        return json({ pool: poolId, sport, week, ats, rows: rows.results || [],
                      fetchedAt: Date.now() });
      }

      /* ---- the slate: what is on tonight ----
       * 🔴 STILL 403 FROM CLOUDFLARE. Kept because it works the moment the feed
       * is one a Worker may call, and because deleting it would hide the fact
       * that the route is correct and the network is not. */
      if (p === '/api/slate') {
        const sport = SPORTS[url.searchParams.get('sport') || 'nfl'];
        if (!sport) return json({ error: 'unknown sport' }, 400);
        const week = url.searchParams.get('week');
        const q = week ? `?week=${encodeURIComponent(week)}` : '';
        const path = sport === 'nfl' ? 'nfl' : 'college-football';
        const games = parseSlate(await upstream(`${ESPN}/${path}/scoreboard${q}`, SLATE_TTL), sport);
        return json({ sport, games, fetchedAt: Date.now() }, 200, SLATE_TTL);
      }

      /* ---- one game, live ---- */
      if (p.startsWith('/api/live/')) {
        const gameId = p.slice('/api/live/'.length);
        if (!/^\d+$/.test(gameId)) return json({ error: 'bad game id' }, 400);
        const sport = SPORTS[url.searchParams.get('sport') || 'nfl'];
        const path = sport === 'nfl' ? 'nfl' : 'college-football';
        const summary = await upstream(`${ESPN}/${path}/summary?event=${gameId}`, LIVE_TTL);
        const state: LiveState = readLive(summary, gameId, sport, Date.now());
        return json(state, 200, LIVE_TTL);
      }

      /* ---- settle a call the client is holding ----
       * 🔴 THE SERVER SETTLES, NOT THE PHONE. A client that decided its own
       * outcome is a client that can decide it won. It sends the play it called
       * AFTER and the side it took; the server reads the feed and answers. */
      if (p === '/api/settle' && req.method === 'POST') {
        const body = await req.json() as { gameId?: string; sport?: string; afterPlayId?: string; side?: 'run' | 'pass' };
        if (!body.gameId || !body.afterPlayId || (body.side !== 'run' && body.side !== 'pass')) {
          return json({ error: 'gameId, afterPlayId and side are required' }, 400);
        }
        const sport = SPORTS[body.sport || 'nfl'];
        const path = sport === 'nfl' ? 'nfl' : 'college-football';
        const summary = await upstream(`${ESPN}/${path}/summary?event=${body.gameId}`, LIVE_TTL);
        const state = readLive(summary, body.gameId, sport, Date.now());
        const r = settleAgainst({ afterPlayId: body.afterPlayId, side: body.side }, state.plays);
        return json(r);
      }

      if (p === '/api/health') {
        return json({ ok: true, now: Date.now(), season: env.SEASON || null });
      }

      /* ---- A SHARED LINK UNFURLS AS THE GAME IT POINTS AT ----
       *
       * 🔴 Jason: "we can tailor them for the sport." More than that — tailor
       * them for the GAME. The static tags in index.html describe the product,
       * which is right for anygiven.app and wrong for the link somebody actually
       * sends: that link carries ?game=, and it should unfurl as "New England at
       * Seattle" rather than as a generic pitch.
       *
       * The tags are rewritten HERE rather than in the page because a crawler
       * does not run JavaScript. X, iMessage and Slack read the HTML as served
       * and nothing else — a title set by the client is a title no card ever
       * sees, which is the trap that makes this look done when it is not.
       *
       * Everything falls back to the static tags: an unknown game, a KV miss or
       * a malformed key all leave the document exactly as it shipped. */
      if ((p === '/' || p === '/index.html') && url.searchParams.get('game')) {
        const key = url.searchParams.get('game') || '';
        const res = await env.ASSETS.fetch(new Request(new URL('/', url).toString(), req));
        try {
          const raw = await env.LIVE.get(key);
          /* Before kickoff the poller has written nothing; the week's slate has the
           * teams and the kickoff (slateState, above the default export). */
          const st = raw ? JSON.parse(raw) : await slateState(env, key);
          if (!st) return res;
          const away = st.teams?.[st.awayTeamId], home = st.teams?.[st.homeTeamId];
          if (!away || !home || !away.name || !home.name) return res;

          const match = `${away.name} at ${home.name}`;
          const when = st.kickoffUtc
            ? new Date(st.kickoffUtc).toLocaleString('en-US',
                { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' }) + ' PT'
            : null;
          const live = st.status === 'live'
            ? `Live now — ${away.abbrev} ${st.awayScore}, ${home.abbrev} ${st.homeScore}.`
            : st.status === 'final' ? `Final — ${away.abbrev} ${st.awayScore}, ${home.abbrev} ${st.homeScore}.`
            : when ? `Kickoff ${when}.` : '';
          const desc = `${live} Call the plays as they happen. Free, no account, nothing to install.`.trim();

          /* HEAD, not GET: we need to know the card exists without paying for
           * its body on every crawl. */
          const cardUrl = `${url.origin}/og/${key.replace(':', '-')}.png`;
          let ogImage = `${url.origin}/og.png`;
          try {
            const probe = await env.ASSETS.fetch(new Request(cardUrl, { method: 'GET' }));
            if (probe.ok) ogImage = cardUrl;
          } catch { /* the generic card is a perfectly good fallback */ }

          /* Escaped, because a team name is feed data landing in an HTML
           * attribute. `St. John's` would otherwise end the attribute early. */
          const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          const html = (await res.text())
            .replace(/(<meta property="og:title" content=")[^"]*/, `$1${esc(match)} · Any Given Snap`)
            .replace(/(<meta name="twitter:title" content=")[^"]*/, `$1${esc(match)} · Any Given Snap`)
            .replace(/(<meta property="og:description" content=")[^"]*/, `$1${esc(desc)}`)
            .replace(/(<meta name="twitter:description" content=")[^"]*/, `$1${esc(desc)}`)
            .replace(/(<meta property="og:url" content=")[^"]*/, `$1${esc(url.toString())}`)
            /* 🔴 THE PICTURE, TOO. X's intent cannot attach media — the image in
             * a post comes from the CARD, so a per-game og:image is the only way
             * a shared link shows the teams playing. tools/og-images.mjs renders
             * these on the host with headless Chrome and they ship as static
             * files; a Worker cannot run Chrome and a crawler will not wait on
             * one that tried. A game with no card falls back to the generic
             * og.png rather than to a broken image. */
            .replace(/(<meta property="og:image" content=")[^"]*/, `$1${esc(ogImage)}`)
            .replace(/(<meta name="twitter:image" content=")[^"]*/, `$1${esc(ogImage)}`)
            .replace(/(<meta property="og:image:alt" content=")[^"]*/, `$1${esc(match)}`);
          return new Response(html, {
            headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=0, must-revalidate' }
          });
        } catch { return res; }
      }

      /* ---- everything else is the client ---- */
      /* 🔴 THE APP'S OWN CODE MUST REVALIDATE. Found on 2026-09-09 after the
       * fourth deploy in a row that Jason could not see: the file on the edge was
       * correct every time and his browser kept running a module it had cached.
       * I diagnosed it as a stale build twice before recognising the pattern.
       *
       * Cloudflare Assets serves immutable-ish defaults, which is right for a
       * hashed bundle and wrong for this app: the module URLs are STABLE
       * (/screens/x.screen.js) and the contents change on every deploy, so a
       * cached copy is a different app wearing the same address. There is no
       * build step adding hashes and there should not be one - the whole point
       * of the Node --experimental-strip-types build is that these files stay
       * readable and directly servable.
       *
       * `no-cache` is NOT `no-store`: the browser keeps the file and revalidates
       * it, so an unchanged deploy still answers 304 and costs nothing. What it
       * removes is the window where somebody is running last hour's code and
       * neither of us knows.
       *
       * 🔴 LOGOS AND FIXTURES KEEP THEIR LONG CACHE. Those are content-addressed
       * in practice - a team's mark at /logos/nfl/500/17.png does not change -
       * and they are the files worth caching hard. Only the code revalidates. */
      const res = await env.ASSETS.fetch(req);
      if (/\.(?:js|css|html)$/.test(p) || p === '/') {
        const h = new Headers(res.headers);
        h.set('cache-control', 'no-cache');
        return new Response(res.body, { status: res.status, headers: h });
      }
      return res;
    } catch (e: any) {
      /* An upstream failure is a state the client has a screen for. It is never a
       * blank page: offline and error are drawn, and this is what feeds them. */
      return json({ error: String(e?.message || e) }, 502);
    }
  }
};
