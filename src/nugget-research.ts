/* ONE TEAM, ONE RESEARCH CALL, AGAINST THE CLAUDE API.
 *
 * Server tools, so the API does the searching and the opening itself and
 * nothing here runs a browser: web_search_20250305 (basic, direct - no code
 * execution) and web_fetch_20250910 (basic). Both verified against the API
 * docs on 2026-09-11 rather than remembered.
 *
 * 🔴 WHAT WAS OPENED IS READ OFF THE RESPONSE, NOT TAKEN FROM THE MODEL. Every
 * successful fetch comes back as a web_fetch_tool_result whose content is a
 * web_fetch_result carrying the url. That list - and only that list - is what
 * keepVerified() will accept as a source. A model that cites a page it only
 * saw in a search summary loses the nugget, mechanically.
 *
 * pause_turn: the API can pause a long server-tool turn; the paused assistant
 * message is sent back unchanged and the turn continues. Capped, so a runaway
 * turn costs a bounded amount.
 *
 * Caps per team, all deliberate: 6 searches ($10 per 1,000 = 6 cents at most),
 * 12 fetches, and 6,000 tokens of any one page. Usage is returned so the
 * desk can report what a run actually cost before anybody scales it up.
 */
import { SYSTEM, brief, keepVerified, parseModelJson, type TeamJob } from './lib/nuggets.ts';

const API = 'https://api.anthropic.com/v1/messages';
const MAX_CONTINUATIONS = 6;

export interface ResearchUsage {
  calls: number; input: number; output: number; cacheRead: number; cacheWrite: number;
  searches: number; fetches: number;
}

export async function researchTeam(env: any, job: TeamJob, today: string) {
  const model = env.NUGGET_MODEL || 'claude-sonnet-5';
  const tools = [
    { type: 'web_search_20250305', name: 'web_search', max_uses: 6 },
    { type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 12, max_content_tokens: 6000 }
  ];
  const messages: any[] = [{ role: 'user', content: brief(job, today) }];
  const usage: ResearchUsage = { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, searches: 0, fetches: 0 };
  const opened: string[] = [];
  let last: any = null;

  for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
    const res = await fetch(API, {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({ model, max_tokens: 8000, system: SYSTEM, messages, tools })
    });
    if (!res.ok) {
      /* The first test (2026-09-11) failed "anthropic 400: " with nothing after
       * it - so a failure now carries the headers that say who answered and a
       * marker when the body really is empty. Never the key. */
      const body = (await res.text().catch(() => '')).slice(0, 400);
      const h = (n: string) => res.headers.get(n) || '-';
      throw new Error(`anthropic ${res.status}: ${body || '(empty body)'} [request-id ${h('request-id')}; `
        + `server ${h('server')}; content-type ${h('content-type')}; cf-ray ${h('cf-ray')}]`);
    }
    const m: any = await res.json();
    usage.calls++;
    usage.input += m.usage?.input_tokens || 0;
    usage.output += m.usage?.output_tokens || 0;
    usage.cacheRead += m.usage?.cache_read_input_tokens || 0;
    usage.cacheWrite += m.usage?.cache_creation_input_tokens || 0;
    usage.searches += m.usage?.server_tool_use?.web_search_requests || 0;
    usage.fetches += m.usage?.server_tool_use?.web_fetch_requests || 0;
    opened.push(...openedUrls(m.content));
    last = m;
    if (m.stop_reason !== 'pause_turn') break;
    /* Continue the paused turn: the assistant content goes back unchanged. */
    messages.push({ role: 'assistant', content: m.content });
  }

  const text = (last?.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
  const out = parseModelJson(text) || {};
  const { kept, dropped } = keepVerified(Array.isArray(out.nuggets) ? out.nuggets : [], opened);
  return {
    kept, dropped,
    modelDropped: Array.isArray(out.dropped) ? out.dropped.length : 0,
    opened: opened.length, usage, model, stop: last?.stop_reason || null, parsed: !!out.nuggets
  };
}

/** Every URL a web_fetch actually returned content for, in this response. The
 *  requested URL counts too (from the matching server_tool_use), because a
 *  model cites what it asked for, not what a redirect landed on. */
export function openedUrls(content: any[]): string[] {
  const asked = new Map<string, string>();
  for (const b of content || []) {
    if (b?.type === 'server_tool_use' && b.name === 'web_fetch' && b.input?.url) asked.set(b.id, String(b.input.url));
  }
  const out: string[] = [];
  for (const b of content || []) {
    if (b?.type !== 'web_fetch_tool_result') continue;
    const c = b.content;
    if (!c || c.type !== 'web_fetch_result') continue;   /* an error block opened nothing */
    if (c.url) out.push(String(c.url));
    const q = asked.get(b.tool_use_id);
    if (q) out.push(q);
  }
  return out;
}
