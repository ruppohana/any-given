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

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  LIVE: KVNamespace;
  DB?: D1Database;
  SEASON?: string;
  /** Set with `wrangler secret put PUSH_TOKEN`. Without it nothing can write. */
  PUSH_TOKEN?: string;
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

export default {
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

      /* ---- what the poller last pushed ---- */
      if (p.startsWith('/api/state/')) {
        const key = p.slice('/api/state/'.length);
        const raw = await env.LIVE.get(key);
        if (!raw) return json({ error: 'nothing pushed for that game yet', key }, 404);
        /* No cache header: KV is already the shared copy, and a stale read here
         * would be a second layer of staleness on top of the poll interval. */
        return new Response(raw, {
          headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' }
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
        if (!b.key || !b.deviceId || !b.afterPlayId || !b.type || !b.choice) {
          return json({ error: 'key, deviceId, afterPlayId, type and choice are required' }, 400);
        }
        /* 🔴 ONE CALL PER SNAP, enforced by the KEY rather than by a check.
         * The id is the game, the person and the play they called after - so a
         * second tap on the same snap overwrites rather than double-counting, and
         * requirement 7.4 holds without the server having to remember anything. */
        const id = `call:${b.key}:${b.deviceId}:${b.afterPlayId}`;
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
          const name = (b.name || '').slice(0, 24);
          if (name && name !== prev.name) {
            const renamed = { ...prev, name };
            await env.LIVE.put(id, JSON.stringify(renamed), { expirationTtl: 60 * 60 * 6 });
            return json({ ok: true, alreadyCalled: true, renamed: true, call: renamed });
          }
          return json({ ok: true, alreadyCalled: true, call: prev });
        }

        const call = {
          key: b.key, deviceId: b.deviceId, name: (b.name || 'Someone').slice(0, 24),
          afterPlayId: b.afterPlayId, type: b.type, choice: b.choice,
          stake: Math.max(0, Math.min(25, Number(b.stake) || 10)),
          p: typeof b.p === 'number' ? b.p : null,
          at: Date.now()
        };
        await env.LIVE.put(id, JSON.stringify(call), { expirationTtl: 60 * 60 * 6 });
        return json({ ok: true, call });
      }

      /* Everybody's calls on one game. The client settles them against the plays
       * it already holds, so the board is a read and never a computation here. */
      if (p.startsWith('/api/board/')) {
        const key = p.slice('/api/board/'.length);
        const list = await env.LIVE.list({ prefix: `call:${key}:` });
        const calls = await Promise.all(
          list.keys.map(async (k) => {
            const raw = await env.LIVE.get(k.name);
            return raw ? JSON.parse(raw) : null;
          })
        );
        return json({ key, calls: calls.filter(Boolean), fetchedAt: Date.now() });
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

      /* ---- everything else is the client ---- */
      return env.ASSETS.fetch(req);
    } catch (e: any) {
      /* An upstream failure is a state the client has a screen for. It is never a
       * blank page: offline and error are drawn, and this is what feeds them. */
      return json({ error: String(e?.message || e) }, 502);
    }
  }
};
