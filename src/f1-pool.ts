/* RACING GROUP POOLS - a group plays the race together: F1's weekend, NASCAR's race day.
 *
 * Jason, 2026-09-12: "complete the pool revision, but do all the sports for the
 * pool", then "do nascar next". The picks for both live on the server, locked
 * by the server's clock and scored against every member.
 *
 *   GET  /api/pool/f1picks?pool=<code>     your picks for the current Grand Prix (F1 groups)
 *   POST /api/pool/f1pick {pool, eventId, picks}
 *   GET  /api/pool/racepicks?pool=<code>   the same for either racing sport - the group's
 *   POST /api/pool/racepick {...}          sport decides which race and which rules
 *   racingStandings(env, pool, sport)      the season board - /api/pool/standings calls it
 *
 * 🔴 A PICK WHOSE SESSION HAS STARTED IS NEVER CHANGED BY A LATER WRITE. The
 * stored value is kept, so a phone cannot pick a race it has watched. Finished
 * races are kept in KV (f1:event:<id> by src/f1-feed.ts, nascar:event:<id> by
 * src/nascar-feed.ts), so the season board still scores them after the
 * scoreboard has moved on.
 *
 * Points, not Marbles - src/lib/f1.ts says why. One document per member per
 * event in `f1_pick` (migrations/0009) - the name is F1's, the table serves both:
 * ESPN's event ids for the two series never collide, and the group's sport says
 * which rules read a row.
 */
import { sessionAccount } from './auth.ts';
import { serveF1 } from './f1-feed.ts';
import { serveNascar, NASCAR_SERIES } from './nascar-feed.ts';
import { isPickLocked, scoreWeekend, type F1Event, type F1Picks } from './lib/f1.ts';
import { cleanNascarPicks, scoreNascar } from './lib/nascar.ts';

type Json = (body: unknown, status?: number, ttl?: number) => Response;
const KEYS = ['qual', 'sprint', 'race', 'fastest', 'poleWins', 'dnf'] as const;
/* F1, and every NASCAR national series - Cup, O'Reilly, Truck (Jason, 2026-09-13:
   "add the O'Reilly and Truck series too"). */
export const RACING = ['f1', ...Object.keys(NASCAR_SERIES)];

/** Whatever a phone sent, as the F1 picks this event accepts. A locked key keeps
 *  what was stored; an open key takes the new value when it is valid and keeps
 *  the stored one when it is not. Pure - tested on the captured Spanish GP. */
export function cleanF1Picks(ev: F1Event, incoming: any, stored: F1Picks, now: number): F1Picks {
  const ids = new Set(ev.drivers.map((d) => d.id));
  const out: any = {};
  for (const k of KEYS) {
    const keep = (stored as any)[k];
    if (isPickLocked(ev, k, now) || !incoming || typeof incoming !== 'object' || !(k in incoming)) {
      if (keep !== undefined) out[k] = keep;
      continue;
    }
    const v = incoming[k];
    let ok: any;
    if (k === 'qual' || k === 'sprint' || k === 'race') {
      /* Three slots; '' is an empty one. A driver not in this weekend's field,
         or one driver in two slots, refuses the whole row rather than half of it. */
      if (Array.isArray(v) && v.length <= 3) {
        const slots = [0, 1, 2].map((i) => (typeof v[i] === 'string' ? v[i] : ''));
        const filled = slots.filter(Boolean);
        if (filled.every((x) => ids.has(x)) && new Set(filled).size === filled.length) ok = slots;
      }
    } else if (k === 'fastest') {
      if (typeof v === 'string' && ids.has(v)) ok = v;
    } else if (k === 'poleWins') {
      if (v === 'yes' || v === 'no') ok = v;
    } else if (v === '0' || v === '1-2' || v === '3+') {
      ok = v;
    }
    if (ok !== undefined) out[k] = ok;
    else if (keep !== undefined) out[k] = keep;
  }
  return out;
}

const parse = (s: unknown) => { try { const v = JSON.parse(String(s)); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };

/** One sport's rules, in one place: where the current race is, where finished
 *  ones are kept, how a pick is cleaned and how it scores. */
const RULES: Record<string, any> = {
  f1: {
    current: 'f1:current', archive: 'f1:event:', serve: serveF1,
    clean: cleanF1Picks, score: (d: any, p: any) => scoreWeekend(d.event, p, d.extras || null).total
  },
  /* One entry per NASCAR series, each with its own current race and archive. */
  ...Object.fromEntries(Object.keys(NASCAR_SERIES).map((s) => [s, {
    current: s + ':current', archive: s + ':event:',
    serve: (env: any) => serveNascar(env, Date.now(), fetch, s),
    clean: cleanNascarPicks, score: (d: any, p: any) => scoreNascar(d.event, p).total
  }]))
};

/** The season board of a racing group: every member, their points over every
 *  race they entered, best first. A race with no stored result yet scores what
 *  has settled (F1's qualifying before its race; nothing for NASCAR). */
export async function racingStandings(env: any, poolId: string, sport = 'f1') {
  const rules = RULES[sport] || RULES.f1;
  const members = ((await env.DB.prepare(
    'SELECT user_id, display_name FROM member WHERE pool_id = ?'
  ).bind(poolId).all()).results || []) as any[];
  const rows = ((await env.DB.prepare(
    'SELECT user_id, event_id, picks FROM f1_pick WHERE pool_id = ?'
  ).bind(poolId).all()).results || []) as any[];
  let current: any = null;
  try { current = JSON.parse((await env.LIVE.get(rules.current)) || 'null'); } catch { current = null; }
  const docs = new Map<string, any>();
  for (const id of new Set(rows.map((r) => String(r.event_id)))) {
    let d: any = null;
    try { d = JSON.parse((await env.LIVE.get(rules.archive + id)) || 'null'); } catch { d = null; }
    if (!d && current && current.event && String(current.event.id) === id) d = current;
    if (d && d.event) docs.set(id, d);
  }
  const by = new Map(members.map((m) => [String(m.user_id),
    { id: String(m.user_id), name: String(m.display_name || ''), points: 0, events: 0 }]));
  for (const r of rows) {
    const row = by.get(String(r.user_id));
    if (!row) continue;
    row.events++;
    const d = docs.get(String(r.event_id));
    if (d) row.points += rules.score(d, parse(r.picks));
  }
  /* `wins`, `picks` and `played` are the football board's names, carried so a
     screen that only knows those still ranks a racing board by points. */
  return [...by.values()]
    .sort((a, b) => b.points - a.points || b.events - a.events || a.name.localeCompare(b.name))
    .map((r) => ({ ...r, wins: r.points, picks: r.events, played: r.events }));
}
/** The F1 name, kept for the callers and tests written before NASCAR. */
export const f1Standings = (env: any, poolId: string) => racingStandings(env, poolId, 'f1');

const PATHS = ['/api/pool/f1picks', '/api/pool/f1pick', '/api/pool/racepicks', '/api/pool/racepick'];

export async function handleF1Pool(req: Request, env: any, p: string, json: Json): Promise<Response | null> {
  if (!PATHS.includes(p)) return null;
  if (!env.DB) return json({ error: 'no database' }, 503);
  const s = await sessionAccount(req, env);
  if (!s) return json({ error: 'email_required', message: 'Sign in with your email to pick with your group.' }, 401);
  const url = new URL(req.url);
  const post = req.method === 'POST';
  const saving = p === '/api/pool/f1pick' || p === '/api/pool/racepick';
  if (saving && !post) return json({ error: 'POST only' }, 405);
  const b: any = post ? await req.json().catch(() => ({})) : {};
  const poolId = String((post ? b.pool : url.searchParams.get('pool')) || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!poolId) return json({ error: 'pool_required', message: 'Which group?' }, 400);

  const pool = await env.DB.prepare('SELECT sport FROM pool WHERE id = ?').bind(poolId).first() as any;
  if (!pool) return json({ error: 'no_group', message: 'That group is gone.' }, 404);
  const f1Path = p.startsWith('/api/pool/f1');
  if (f1Path ? pool.sport !== 'f1' : !RACING.includes(pool.sport)) {
    return json({ error: f1Path ? 'not_f1' : 'not_racing', message: 'That group does not play this race.' }, 400);
  }
  const rules = RULES[pool.sport];
  const inIt = await env.DB.prepare('SELECT 1 AS x FROM member WHERE pool_id = ? AND user_id = ?')
    .bind(poolId, s.accountId).first();
  if (!inIt) return json({ error: 'not_a_member', message: 'You are not in this group.' }, 403);

  const doc = await rules.serve(env);
  const ev = doc && doc.event ? doc.event : null;
  if (!ev) return json({ error: 'no_event', message: 'No race on the feed.' }, 404);
  const row = await env.DB.prepare(
    'SELECT picks FROM f1_pick WHERE pool_id = ? AND user_id = ? AND event_id = ?'
  ).bind(poolId, s.accountId, ev.id).first() as any;
  const stored = row ? parse(row.picks) : {};

  if (!post) return json({ pool: poolId, sport: pool.sport, eventId: ev.id, picks: stored });

  if (String(b.eventId || '') !== ev.id) {
    return json({ error: 'event_over', message: 'That race is over - the next one is open.', eventId: ev.id }, 409);
  }
  const merged = rules.clean(ev, b.picks, stored, Date.now());
  await env.DB.prepare(
    `INSERT INTO f1_pick (pool_id, user_id, event_id, picks, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(pool_id, user_id, event_id) DO UPDATE SET picks = excluded.picks, updated_at = excluded.updated_at`
  ).bind(poolId, s.accountId, ev.id, JSON.stringify(merged), Date.now()).run();
  return json({ ok: true, pool: poolId, sport: pool.sport, eventId: ev.id, picks: merged });
}
