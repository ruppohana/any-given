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
  DB?: D1Database;
  SEASON?: string;
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

/** One upstream read, shared by every viewer, via the runtime cache. */
async function upstream(url: string, ttl: number): Promise<any> {
  const req = new Request(url, { cf: { cacheTtl: ttl, cacheEverything: true } as any });
  const res = await fetch(req);
  if (!res.ok) throw new Error(`espn ${res.status}`);
  return res.json();
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const p = url.pathname;

    try {
      /* ---- the slate: what is on tonight ---- */
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
