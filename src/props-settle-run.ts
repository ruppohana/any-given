/* READY SETS SETTLE THEMSELVES - the Worker half. Jason, 2026-09-13: "i am not
 * entering anything by hand."
 *
 * For every ready set that names a source, once any of its questions has locked:
 * read the source page, find each locked question's winner (src/lib/props-settle.ts),
 * and write it into every group that loaded the set - one UPDATE per question, since
 * a set's qids are the same in every group ('emmys-2026-1' ...). An answer a
 * commissioner already entered is never overwritten (`answer IS NULL`).
 *
 * Runs from the cron every ten minutes, and when somebody opens a questions pool
 * (at most once a minute per set, KV-throttled), so answers land minutes after the
 * page is updated. The last read is kept in KV (`props:settle:<set>`) for the health
 * route - what the page said, when, and what was written.
 */
import { PROP_TEMPLATES } from './lib/props.ts';
import { winnersFromWikiAwards, findCategory, matchOption, castRows, answersFromCast } from './lib/props-settle.ts';

const KINDS = ['wiki-awards', 'wiki-survivor', 'wiki-dwts'];

const UA = 'AnyGiven/1.0 (https://anygiven.app; ruppohana@gmail.com)';
export const wikiHtmlUrl = (page: string) => `https://en.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(page)}`;
const MIN_GAP_MS = 60 * 1000;
const KEEP_S = 60 * 60 * 24 * 30;      // KV expirationTtl is in seconds

export async function settleReadySets(env: any, now = Date.now(), fetchImpl: typeof fetch = fetch, opts: { only?: string; force?: boolean } = {}) {
  const out: any[] = [];
  if (!env || !env.DB) return out;
  for (const t of Object.values(PROP_TEMPLATES)) {
    if (opts.only && t.id !== opts.only) continue;
    const src = t.source;
    if (!src || !KINDS.includes(src.kind)) continue;
    const due = t.questions.map((q: any, i: number) => ({ q, qid: t.id + '-' + (i + 1) })).filter((x) => x.q.lockAt <= now);
    if (!due.length) continue;
    const open = new Set((((await env.DB.prepare(
      'SELECT DISTINCT qid FROM prop_question WHERE qid LIKE ? AND answer IS NULL'
    ).bind(t.id + '-%').all()).results || []) as any[]).map((r) => String(r.qid)));
    const want = due.filter((x) => open.has(x.qid));
    if (!want.length) continue;

    const lastKey = 'props:settle:last:' + t.id;
    if (!opts.force && env.LIVE) {
      try {
        const last = Number(await env.LIVE.get(lastKey)) || 0;
        if (now - last < MIN_GAP_MS) { out.push({ template: t.id, skipped: 'read under a minute ago' }); continue; }
      } catch { /* no throttle is better than no settle */ }
    }
    if (env.LIVE) { try { await env.LIVE.put(lastKey, String(now), { expirationTtl: 3600 }); } catch { /* fine */ } }

    let html = '';
    try {
      const r = await fetchImpl(wikiHtmlUrl(src.page), { headers: { 'user-agent': UA, accept: 'text/html' } });
      if (!r.ok) throw new Error('wikipedia ' + r.status);
      html = await r.text();
    } catch (e: any) {
      out.push({ template: t.id, error: String(e?.message || e) });
      continue;
    }
    /* An awards page answers by category heading; a cast table answers 'winner' and
       'first-out' by name - or 'void' for a double elimination. */
    const awards = src.kind === 'wiki-awards';
    const winners = awards ? winnersFromWikiAwards(html) : new Map<string, string>();
    const cast = awards ? {} : answersFromCast(src.kind, castRows(html));
    const answers: Record<string, string> = {};
    for (const x of want) {
      const line = awards ? findCategory(winners, x.q.key || x.q.text) : (cast as any)[x.q.key];
      if (!line) continue;
      const opt = line === 'void' ? 'void' : matchOption(x.q.options, line);
      if (!opt) continue;
      await env.DB.prepare('UPDATE prop_question SET answer = ?, settled_at = ? WHERE qid = ? AND answer IS NULL')
        .bind(opt, now, x.qid).run();
      answers[x.qid] = opt;
    }
    const row = { template: t.id, at: now, winnersOnPage: awards ? winners.size : Object.keys(cast).length,
                  waiting: want.length, settled: Object.keys(answers).length, answers };
    out.push(row);
    if (env.LIVE) { try { await env.LIVE.put('props:settle:' + t.id, JSON.stringify(row), { expirationTtl: KEEP_S }); } catch { /* fine */ } }
  }
  return out;
}
