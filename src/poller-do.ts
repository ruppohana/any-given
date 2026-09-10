/* 🔴 THE POLLER, OFF THE LAPTOP. Jason, 2026-09-09, during the opener: "Remove
 * the puller off my machine."
 *
 * It was a node process on an Alienware on Modern Standby, and the vault's own
 * record of that machine is unambiguous: a job armed for 00:32 started at
 * 03:25 and was frozen mid-run the same second. Every live board this app can
 * draw depended on that laptop staying awake, and the supervisor built
 * yesterday can report a dead feed but cannot restart one.
 *
 * 🔴 WHY A DURABLE OBJECT AND NOT A CRON. Cron's floor is ONE MINUTE. Tonight's
 * measurements put the whole product inside a 27-second window - feed 53s, his
 * television 39s, snaps 41s apart - so a minute of scheduling granularity does
 * not slow the app down, it deletes the mechanic. A DO alarm can be set for ten
 * seconds and reschedules itself, which is the same loop poll.mjs runs, in a
 * place that does not have a lid.
 *
 * 🔴 IT IS THE SAME LOGIC, DELIBERATELY. The dedupe, the heartbeat, the
 * arrival-timed lag - each one was written tonight to fix a real failure, and
 * a rewrite would be a fresh set of the same bugs. What changes is where it
 * runs and which endpoint it reads.
 */
import { coreSummary } from './core-feed.ts';
import { readLive } from './live.ts';

const HEARTBEAT_MS = 20_000;
const DEFAULT_EVERY_MS = 10_000;
/* Stop by itself. A poller nobody turned off is the next thing to go wrong. */
const STOP_AFTER_FINAL_MS = 10 * 60_000;

export class LivePoller {
  state: any;
  env: any;
  constructor(state: any, env: any) { this.state = state; this.env = env; }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), {
      status: s, headers: { 'content-type': 'application/json' }
    });

    if (url.pathname.endsWith('/start')) {
      const b = await req.json().catch(() => ({})) as any;
      const gameId = String(b.gameId || '');
      const sport = String(b.sport || 'nfl');
      if (!/^\d+$/.test(gameId)) return j({ error: 'gameId required' }, 400);
      await this.state.storage.put({
        gameId, sport,
        everyMs: Number(b.everyMs) > 0 ? Number(b.everyMs) : DEFAULT_EVERY_MS,
        running: true, startedAt: Date.now(), polls: 0, writes: 0, lastErr: null
      });
      await this.state.storage.setAlarm(Date.now() + 500);
      return j({ ok: true, gameId, sport });
    }
    if (url.pathname.endsWith('/stop')) {
      await this.state.storage.put('running', false);
      await this.state.storage.deleteAlarm();
      return j({ ok: true, stopped: true });
    }
    const all = await this.state.storage.list();
    const out: Record<string, unknown> = {};
    for (const [k, v] of all) if (k !== 'seen' && k !== 'lags') out[k] = v;
    out.alarm = await this.state.storage.getAlarm();
    return j(out);
  }

  async alarm(): Promise<void> {
    const st = await this.state.storage.get(['running', 'gameId', 'sport', 'everyMs',
      'lastSig', 'lastWriteAt', 'seen', 'lags', 'polls', 'writes', 'finalAt']);
    if (!st.get('running')) return;

    const gameId = String(st.get('gameId'));
    const sport = String(st.get('sport') || 'nfl');
    const everyMs = Number(st.get('everyMs')) || DEFAULT_EVERY_MS;
    let seen: string[] = (st.get('seen') as string[]) || [];
    let lags: number[] = (st.get('lags') as number[]) || [];
    let polls = Number(st.get('polls') || 0) + 1;
    let writes = Number(st.get('writes') || 0);

    try {
      const summary = await coreSummary(gameId, sport);
      const live = readLive(summary, gameId, sport, Date.now());

      /* 🔴 THE FIRST PASS SEEDS AND DOES NOT MEASURE - the same warm-up rule the
       * laptop poller needed. On a cold start every play in the game is new to
       * us, and timing those against their wallclock measures the age of the
       * first quarter. It reported 420 seconds when I got this wrong. */
      const warm = seen.length > 0;
      const arrivedAt = Date.now();
      const seenSet = new Set(seen);
      for (const p of live.plays) {
        if (!p.id || seenSet.has(p.id)) continue;
        seenSet.add(p.id);
        if (warm && p.wallclockMs) lags.push(arrivedAt - p.wallclockMs);
      }
      seen = [...seenSet].slice(-400);
      lags = lags.slice(-12);
      const sorted = [...lags].sort((a, b) => a - b);
      const publishLagMs = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;

      /* Dedupe, and never on a field that always differs - the game clock ticks
         every second and a signature carrying it is not a signature. */
      const newest = live.plays[live.plays.length - 1];
      const sig = [live.status, live.awayScore, live.homeScore, live.plays.length,
        newest && newest.id, live.situation && live.situation.down,
        live.situation && live.situation.distance].join('|');
      const quiet = Date.now() - Number(st.get('lastWriteAt') || 0);

      if (sig !== st.get('lastSig') || quiet >= HEARTBEAT_MS) {
        await this.env.LIVE.put(`${sport}:${gameId}`, JSON.stringify({
          ...live, heartbeatMs: HEARTBEAT_MS, publishLagMs, pushedAt: Date.now(), by: 'do'
        }), { expirationTtl: 60 * 60 * 6 });
        writes++;
        await this.state.storage.put({ lastSig: sig, lastWriteAt: Date.now() });
      }

      /* 🔴 IT TURNS ITSELF OFF. Ten minutes past final is enough for the last
       * settlement to land and for anybody still on the screen to see it. */
      if (live.status === 'final') {
        const finalAt = Number(st.get('finalAt') || 0) || Date.now();
        await this.state.storage.put('finalAt', finalAt);
        if (Date.now() - finalAt > STOP_AFTER_FINAL_MS) {
          await this.state.storage.put({ running: false, polls, writes, seen, lags });
          return;
        }
      }
      await this.state.storage.put({ polls, writes, seen, lags, lastErr: null });
    } catch (e: any) {
      /* 🔴 A FAILED POLL RESCHEDULES. An upstream hiccup that stops the loop is
       * a laptop lid with extra steps, and the screen already has a stale
       * banner for a feed that has genuinely gone quiet. */
      await this.state.storage.put({ polls, lastErr: String(e?.message || e).slice(0, 200) });
    }

    await this.state.storage.setAlarm(Date.now() + everyMs);
  }
}
