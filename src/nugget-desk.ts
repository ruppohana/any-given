/* 🔴 THE NUGGET DESK - THE DAY-BEFORE RESEARCH, OFF THE LAPTOP.
 *
 * Jason, 2026-09-11: "can we have this run someplace else other than my
 * laptop in the future?" The desktop task ran at 5 AM on a machine on Modern
 * Standby, and its first real run stopped within a minute on three permission
 * prompts nobody was awake to answer.
 *
 * A Durable Object with a queue in its own storage and an alarm that works it
 * ONE TEAM AT A TIME: pop a team, research it (src/nugget-research.ts), write
 * what survived to KV as nuggets:<league>:<teamId>, re-arm. One at a time is
 * deliberate - it keeps a Saturday's 160 teams inside the API's rate limits
 * and makes every team's cost visible on its own line. A Saturday slate takes
 * hours, which is fine: the run starts the day BEFORE the games.
 *
 * No lid, no prompts, no git and no deploy: the nuggets are DATA in KV, read
 * by the Worker at /nuggets/<league>/<id>.json, not files shipped with a build.
 */
import { researchTeam } from './nugget-research.ts';
import type { TeamJob } from './lib/nuggets.ts';

interface Totals {
  teams: number; nuggets: number; dropped: number; failed: number;
  input: number; output: number; cacheRead: number; cacheWrite: number; searches: number; fetches: number;
}
const ZERO: Totals = { teams: 0, nuggets: 0, dropped: 0, failed: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, searches: 0, fetches: 0 };

export class NuggetDesk {
  state: any;
  env: any;
  constructor(state: any, env: any) { this.state = state; this.env = env; }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
    const st = this.state.storage;

    if (url.pathname.endsWith('/seed') && req.method === 'POST') {
      const b = await req.json().catch(() => ({})) as { jobs?: TeamJob[]; today?: string };
      const jobs = Array.isArray(b.jobs) ? b.jobs : [];
      const today = String(b.today || '');
      if (!today) return j({ error: 'today required' }, 400);
      /* A new day starts a new ledger; a second seed on the same day adds to the
         queue without researching a team twice. */
      const run = (await st.get('run')) || null;
      const fresh = !run || run.today !== today;
      const queue: TeamJob[] = fresh ? [] : ((await st.get('queue')) || []);
      const have = new Set(queue.map((q) => q.league + ':' + q.teamId));
      const done: any[] = fresh ? [] : ((await st.get('done')) || []);
      for (const d of done) have.add(d.key);
      let added = 0;
      for (const q of jobs) {
        const k = q.league + ':' + q.teamId;
        if (have.has(k)) continue;
        have.add(k); queue.push(q); added++;
      }
      await st.put({
        queue, run: { today, startedAt: fresh ? Date.now() : run.startedAt, seededAt: Date.now() },
        ...(fresh ? { done: [], totals: { ...ZERO }, failures: [] } : {})
      });
      if (queue.length) await st.setAlarm(Date.now() + 500);
      return j({ ok: true, today, added, queued: queue.length });
    }

    if (url.pathname.endsWith('/stop') && req.method === 'POST') {
      await st.put('queue', []);
      await st.deleteAlarm();
      return j({ ok: true, stopped: true });
    }

    /* status */
    const queue: TeamJob[] = (await st.get('queue')) || [];
    const done: any[] = (await st.get('done')) || [];
    /* The SHAPE of the stored key - set or not, its length, the sk-ant- prefix -
     * never any of its value. The first key arrived as one character from a
     * failed paste (2026-09-11) and nothing said so until a research call. */
    const k = String(this.env.ANTHROPIC_API_KEY || '');
    return j({
      key: { set: k.length > 0, len: k.length, sk_ant: k.startsWith('sk-ant-') },
      run: (await st.get('run')) || null,
      queued: queue.length,
      next: queue.slice(0, 4).map((q) => q.league + ':' + q.teamId + ' ' + q.team),
      totals: (await st.get('totals')) || ZERO,
      failures: ((await st.get('failures')) || []).slice(-10),
      recent: done.slice(-6),
      alarm: await st.getAlarm()
    });
  }

  async alarm(): Promise<void> {
    const st = this.state.storage;
    const queue: TeamJob[] = (await st.get('queue')) || [];
    if (!queue.length) return;
    const job = queue.shift() as TeamJob;
    await st.put('queue', queue);
    const run = (await st.get('run')) || {};
    const totals: Totals = { ...ZERO, ...((await st.get('totals')) || {}) };
    const key = job.league + ':' + job.teamId;

    try {
      if (!this.env.ANTHROPIC_API_KEY) {
        /* No key, no research - and no point walking the rest of the queue. */
        await st.put('queue', []);
        throw new Error('ANTHROPIC_API_KEY is not set (wrangler secret put ANTHROPIC_API_KEY)');
      }
      const r = await researchTeam(this.env, job, run.today || job.gameDate);
      if (r.kept.length) {
        await this.env.LIVE.put(`nuggets:${job.league}:${job.teamId}`, JSON.stringify({
          league: job.league, teamId: job.teamId, team: job.team, asOf: run.today || '',
          nuggets: r.kept, by: 'cloudflare', model: r.model, researchedAt: Date.now()
        }), { expirationTtl: 60 * 60 * 24 * 14 });
      }
      totals.teams++; totals.nuggets += r.kept.length; totals.dropped += r.dropped.length;
      totals.input += r.usage.input; totals.output += r.usage.output;
      totals.cacheRead += r.usage.cacheRead; totals.cacheWrite += r.usage.cacheWrite;
      totals.searches += r.usage.searches; totals.fetches += r.usage.fetches;
      const done: any[] = (await st.get('done')) || [];
      done.push({
        key, team: job.team, kept: r.kept.length, dropped: r.dropped.length, opened: r.opened,
        parsed: r.parsed, stop: r.stop, usage: r.usage, at: Date.now()
      });
      await st.put({ done: done.slice(-300), totals });
    } catch (e: any) {
      totals.failed++;
      const failures: any[] = (await st.get('failures')) || [];
      /* The SHAPE of the stored key, never its value: a pasted key that arrived
       * as one character, or with a space, fails as a bare 400/401. */
      const k = String(this.env.ANTHROPIC_API_KEY || '');
      const keyShape = { len: k.length, sk_ant: k.startsWith('sk-ant-'), space: /\s/.test(k) };
      failures.push({ key, team: job.team, err: String(e?.message || e).slice(0, 700), keyShape, at: Date.now() });
      await st.put({ failures: failures.slice(-100), totals });
    }

    const left: TeamJob[] = (await st.get('queue')) || [];
    if (left.length) await st.setAlarm(Date.now() + 1000);
  }
}
