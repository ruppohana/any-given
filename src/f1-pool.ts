/* F1 GROUP POOLS - a group plays the race weekend together.
 *
 * Jason, 2026-09-12: "complete the pool revision, but do all the sports for the
 * pool". The weekend picks (src/lib/f1.ts - qualifying, sprint and race top
 * three, the fastest lap, does the pole-sitter win, how many retire) lived on
 * the phone; a group needs them on the server, locked by the server's clock and
 * scored against every member.
 *
 *   GET  /api/pool/f1picks?pool=<code>   your picks for the current Grand Prix
 *   POST /api/pool/f1pick {pool, eventId, picks}   save them; a locked pick keeps
 *        what was stored, whatever the phone sends
 *   f1Standings(env, pool)   the season board - /api/pool/standings calls it
 *
 * 🔴 A PICK WHOSE SESSION HAS STARTED IS NEVER CHANGED BY A LATER WRITE. The
 * stored value is kept, so a phone cannot pick a qualifying it has watched.
 * Finished weekends are kept in KV by src/f1-feed.ts (f1:event:<id>), so the
 * season board still scores them after the scoreboard has moved to the next race.
 *
 * Points, not Marbles - src/lib/f1.ts says why. One document per member per
 * event (migrations/0009_f1_pool_and_optins.sql).
 */
import { sessionAccount } from './auth.ts';
import { serveF1 } from './f1-feed.ts';
import { isPickLocked, scoreWeekend, type F1Event, type F1Picks } from './lib/f1.ts';

type Json = (body: unknown, status?: number, ttl?: number) => Response;
const KEYS = ['qual', 'sprint', 'race', 'fastest', 'poleWins', 'dnf'] as const;

/** Whatever a phone sent, as the picks this event accepts. A locked key keeps
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

/** The season board of an F1 group: every member, their points over every
 *  weekend they entered, best first. A weekend with no stored result yet
 *  scores what has settled (qualifying before the race). */
export async function f1Standings(env: any, poolId: string) {
  const members = ((await env.DB.prepare(
    'SELECT user_id, display_name FROM member WHERE pool_id = ?'
  ).bind(poolId).all()).results || []) as any[];
  const rows = ((await env.DB.prepare(
    'SELECT user_id, event_id, picks FROM f1_pick WHERE pool_id = ?'
  ).bind(poolId).all()).results || []) as any[];
  let current: any = null;
  try { current = JSON.parse((await env.LIVE.get('f1:current')) || 'null'); } catch { current = null; }
  const docs = new Map<string, any>();
  for (const id of new Set(rows.map((r) => String(r.event_id)))) {
    let d: any = null;
    try { d = JSON.parse((await env.LIVE.get('f1:event:' + id)) || 'null'); } catch { d = null; }
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
    if (d) row.points += scoreWeekend(d.event, parse(r.picks), d.extras || null).total;
  }
  /* `wins`, `picks` and `played` are the football board's names, carried so a
     screen that only knows those still ranks an F1 board by points. */
  return [...by.values()]
    .sort((a, b) => b.points - a.points || b.events - a.events || a.name.localeCompare(b.name))
    .map((r) => ({ ...r, wins: r.points, picks: r.events, played: r.events }));
}

export async function handleF1Pool(req: Request, env: any, p: string, json: Json): Promise<Response | null> {
  if (p !== '/api/pool/f1picks' && p !== '/api/pool/f1pick') return null;
  if (!env.DB) return json({ error: 'no database' }, 503);
  const s = await sessionAccount(req, env);
  if (!s) return json({ error: 'email_required', message: 'Sign in with your email to pick with your group.' }, 401);
  const url = new URL(req.url);
  const post = req.method === 'POST';
  if (p === '/api/pool/f1pick' && !post) return json({ error: 'POST only' }, 405);
  const b: any = post ? await req.json().catch(() => ({})) : {};
  const poolId = String((post ? b.pool : url.searchParams.get('pool')) || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!poolId) return json({ error: 'pool_required', message: 'Which group?' }, 400);

  const pool = await env.DB.prepare('SELECT sport FROM pool WHERE id = ?').bind(poolId).first() as any;
  if (!pool) return json({ error: 'no_group', message: 'That group is gone.' }, 404);
  if (pool.sport !== 'f1') return json({ error: 'not_f1', message: 'That group does not play F1.' }, 400);
  const inIt = await env.DB.prepare('SELECT 1 AS x FROM member WHERE pool_id = ? AND user_id = ?')
    .bind(poolId, s.accountId).first();
  if (!inIt) return json({ error: 'not_a_member', message: 'You are not in this group.' }, 403);

  const doc = await serveF1(env);
  const ev: F1Event | null = doc && doc.event ? doc.event : null;
  if (!ev) return json({ error: 'no_event', message: 'No Grand Prix on the feed.' }, 404);
  const row = await env.DB.prepare(
    'SELECT picks FROM f1_pick WHERE pool_id = ? AND user_id = ? AND event_id = ?'
  ).bind(poolId, s.accountId, ev.id).first() as any;
  const stored: F1Picks = row ? parse(row.picks) : {};

  if (!post) return json({ pool: poolId, eventId: ev.id, picks: stored });

  if (String(b.eventId || '') !== ev.id) {
    return json({ error: 'event_over', message: 'That weekend is over - the next one is open.', eventId: ev.id }, 409);
  }
  const merged = cleanF1Picks(ev, b.picks, stored, Date.now());
  await env.DB.prepare(
    `INSERT INTO f1_pick (pool_id, user_id, event_id, picks, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(pool_id, user_id, event_id) DO UPDATE SET picks = excluded.picks, updated_at = excluded.updated_at`
  ).bind(poolId, s.accountId, ev.id, JSON.stringify(merged), Date.now()).run();
  return json({ ok: true, pool: poolId, eventId: ev.id, picks: merged });
}
