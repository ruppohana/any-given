/* QUESTIONS POOLS - the pool for everything ESPN does not score. Jason, 2026-09-13:
 * "add cricket too, and non sports, golf, oscars, everything damn it that hits a
 * certain viewship."
 *
 * A group whose sport is 'props' plays questions. The commissioner writes them, or
 * loads a ready set (src/lib/props.ts PROP_TEMPLATES - the 2026 Emmys first);
 * everyone picks one option per question before it locks; the commissioner enters
 * each answer after it locks; a right answer scores the question's points.
 *
 *   GET  /api/props?pool=<code>                 the questions, your picks, what can be loaded
 *   POST /api/props/pick      {pool, qid, choice}
 *   POST /api/props/questions {pool, questions: [{text, options, points, lockAt}]}   commissioner
 *   POST /api/props/template  {pool, template}                                       commissioner
 *   POST /api/props/delete    {pool, qid}         before its lock                     commissioner
 *   POST /api/props/settle    {pool, qid, answer} after its lock; an option, 'void' or null
 *   propsStandings(env, pool)                    the board - /api/pool/standings calls it
 *
 * 🔴 THE LOCK IS THE SERVER'S CLOCK, AND IT HOLDS BOTH WAYS. A pick is refused from
 * the question's lock time on, so nobody picks the Emmy they just watched; and an
 * answer is refused BEFORE it, so a commissioner cannot settle a question people
 * can still change. How many chose each option is shown only once it has locked.
 */
import { sessionAccount } from './auth.ts';
import { cleanQuestion, isOpen, scoreProps, PROP_TEMPLATES, templatesOpen, PROPS_LIMITS, VOID, type PropQuestion } from './lib/props.ts';
import { settleReadySets } from './props-settle-run.ts';

type Json = (body: unknown, status?: number, ttl?: number) => Response;

const PATHS = ['/api/props', '/api/props/pick', '/api/props/questions', '/api/props/template',
  '/api/props/delete', '/api/props/settle'];

const parseOptions = (s: unknown): string[] => {
  try { const v = JSON.parse(String(s)); return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
};
const rowToQuestion = (r: any): PropQuestion => ({
  qid: String(r.qid), position: Number(r.position) || 0, text: String(r.text),
  options: parseOptions(r.options), points: Number(r.points) || 1,
  lockAt: Number(r.lock_at) || 0, answer: r.answer == null ? null : String(r.answer)
});

async function questionsOf(env: any, poolId: string): Promise<PropQuestion[]> {
  const rows = ((await env.DB.prepare(
    'SELECT qid, position, text, options, points, lock_at, answer FROM prop_question WHERE pool_id = ? ORDER BY position, qid'
  ).bind(poolId).all()).results || []) as any[];
  return rows.map(rowToQuestion);
}

const newQid = () => 'q' + Math.random().toString(36).slice(2, 10);

/** The board: every member, their points on the settled questions. `wins`,
 *  `picks` and `played` are the football board's names, carried so a screen that
 *  only knows those still ranks this board by points (as racing does). */
export async function propsStandings(env: any, poolId: string) {
  const members = ((await env.DB.prepare(
    'SELECT user_id, display_name FROM member WHERE pool_id = ?'
  ).bind(poolId).all()).results || []) as any[];
  const qs = await questionsOf(env, poolId);
  const rows = ((await env.DB.prepare(
    'SELECT user_id, qid, choice FROM prop_pick WHERE pool_id = ?'
  ).bind(poolId).all()).results || []) as any[];
  const picksBy = new Map<string, Record<string, string>>();
  for (const r of rows) {
    const k = String(r.user_id);
    if (!picksBy.has(k)) picksBy.set(k, {});
    picksBy.get(k)![String(r.qid)] = String(r.choice);
  }
  return members.map((m) => {
    const mine = picksBy.get(String(m.user_id)) || {};
    const s = scoreProps(qs, mine);
    return { id: String(m.user_id), name: String(m.display_name || ''), points: s.points,
             correct: s.correct, settled: s.settled, answered: Object.keys(mine).length };
  })
    .sort((a, b) => b.points - a.points || b.correct - a.correct || a.name.localeCompare(b.name))
    .map((r) => ({ ...r, wins: r.points, picks: r.answered, played: r.settled }));
}

export async function handlePropsPool(req: Request, env: any, p: string, json: Json): Promise<Response | null> {
  if (!PATHS.includes(p)) return null;
  if (!env.DB) return json({ error: 'no database' }, 503);
  const s = await sessionAccount(req, env);
  /* email_required makes the sign-in sheet open and retry (components/signin.js). */
  if (!s) return json({ error: 'email_required', message: 'Sign in to play.' }, 401);
  const uid = String(s.accountId);
  const url = new URL(req.url);
  const post = req.method === 'POST';
  const b: any = post ? await req.json().catch(() => ({})) : {};
  const poolId = String((post ? b.pool : url.searchParams.get('pool')) || '').toUpperCase().trim();
  if (!poolId) return json({ error: 'pool_required', message: 'Which group?' }, 400);

  const m = await env.DB.prepare(
    'SELECT m.role AS role, p.sport AS sport, p.name AS name FROM member m JOIN pool p ON p.id = m.pool_id WHERE m.pool_id = ? AND m.user_id = ?'
  ).bind(poolId, uid).first() as any;
  if (!m) return json({ error: 'not_a_member', message: 'You are not in this group.' }, 403);
  if (m.sport !== 'props') return json({ error: 'not_a_questions_group', message: 'This group does not play questions.' }, 409);
  const isCommish = m.role === 'commissioner';
  const onlyCommish = () => json({ error: 'commissioner_only', message: 'Only the commissioner can do that.' }, 403);
  const now = Date.now();

  if (p === '/api/props' && !post) {
    /* A ready set whose questions have locked checks its source when somebody looks -
       at most once a minute per set - so answers arrive minutes after they are
       published, not at the next cron tick. Never fails the read. */
    try { await settleReadySets(env, now); } catch { /* the cron tries again */ }
    const qs = await questionsOf(env, poolId);
    const mine = ((await env.DB.prepare('SELECT qid, choice FROM prop_pick WHERE pool_id = ? AND user_id = ?')
      .bind(poolId, uid).all()).results || []) as any[];
    /* How the group split - only on a question that has locked. */
    const locked = new Set(qs.filter((q) => !isOpen(q, now)).map((q) => q.qid));
    const counts: Record<string, Record<string, number>> = {};
    if (locked.size) {
      const all = ((await env.DB.prepare('SELECT qid, choice, COUNT(*) AS n FROM prop_pick WHERE pool_id = ? GROUP BY qid, choice')
        .bind(poolId).all()).results || []) as any[];
      for (const r of all) {
        if (!locked.has(String(r.qid))) continue;
        (counts[String(r.qid)] ||= {})[String(r.choice)] = Number(r.n) || 0;
      }
    }
    return json({
      pool: poolId, name: m.name, role: m.role, now,
      questions: qs, picks: Object.fromEntries(mine.map((r) => [String(r.qid), String(r.choice)])),
      counts, templates: isCommish ? templatesOpen(now) : [], limits: PROPS_LIMITS
    });
  }

  if (p === '/api/props/pick' && post) {
    const qid = String(b.qid || '');
    const q = (await questionsOf(env, poolId)).find((x) => x.qid === qid);
    if (!q) return json({ error: 'unknown_question', message: 'That question is not in this group.' }, 404);
    if (!isOpen(q, now)) return json({ error: 'locked', message: 'That question has locked.', locked: true }, 409);
    const choice = String(b.choice || '');
    if (!q.options.includes(choice)) return json({ error: 'bad_choice', message: 'Pick one of the options.' }, 400);
    await env.DB.prepare(
      `INSERT INTO prop_pick (pool_id, user_id, qid, choice, made_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(pool_id, user_id, qid) DO UPDATE SET choice = excluded.choice, made_at = excluded.made_at`
    ).bind(poolId, uid, qid, choice, now).run();
    return json({ ok: true, qid, choice });
  }

  if (!isCommish) return onlyCommish();

  if (p === '/api/props/questions' && post) {
    const existing = await questionsOf(env, poolId);
    const incoming = Array.isArray(b.questions) ? b.questions : [];
    const clean = incoming.map((q: any) => cleanQuestion(q, now)).filter(Boolean) as any[];
    if (!clean.length) return json({ error: 'no_questions', message: 'A question needs text, at least two options and a lock time.' }, 400);
    if (clean.some((q) => q.lockAt <= now)) return json({ error: 'lock_in_past', message: 'A question has to lock in the future.' }, 400);
    if (existing.length + clean.length > PROPS_LIMITS.questions) {
      return json({ error: 'too_many', message: `A group holds up to ${PROPS_LIMITS.questions} questions.` }, 400);
    }
    let pos = existing.reduce((a, q) => Math.max(a, q.position), 0);
    const stmt = env.DB.prepare(
      'INSERT INTO prop_question (pool_id, qid, position, text, options, points, lock_at, answer, settled_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)'
    );
    await env.DB.batch(clean.map((q) => stmt.bind(poolId, newQid(), ++pos, q.text, JSON.stringify(q.options), q.points, q.lockAt, now)));
    return json({ ok: true, added: clean.length, questions: await questionsOf(env, poolId) });
  }

  if (p === '/api/props/template' && post) {
    const t = PROP_TEMPLATES[String(b.template || '')];
    if (!t) return json({ error: 'unknown_template', message: 'That set is not available.' }, 404);
    const existing = await questionsOf(env, poolId);
    const have = new Set(existing.map((q) => q.qid));
    const rows = t.questions.map((q, i) => ({ qid: t.id + '-' + (i + 1), q: cleanQuestion(q, now) }))
      .filter((r) => r.q && !have.has(r.qid) && (r.q as any).lockAt > now) as any[];
    if (existing.length + rows.length > PROPS_LIMITS.questions) {
      return json({ error: 'too_many', message: `A group holds up to ${PROPS_LIMITS.questions} questions.` }, 400);
    }
    if (rows.length) {
      let pos = existing.reduce((a, q) => Math.max(a, q.position), 0);
      const stmt = env.DB.prepare(
        'INSERT OR IGNORE INTO prop_question (pool_id, qid, position, text, options, points, lock_at, answer, settled_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)'
      );
      await env.DB.batch(rows.map((r) => stmt.bind(poolId, r.qid, ++pos, r.q.text, JSON.stringify(r.q.options), r.q.points, r.q.lockAt, now)));
    }
    return json({ ok: true, added: rows.length, questions: await questionsOf(env, poolId) });
  }

  if (p === '/api/props/delete' && post) {
    const qid = String(b.qid || '');
    const q = (await questionsOf(env, poolId)).find((x) => x.qid === qid);
    if (!q) return json({ error: 'unknown_question', message: 'That question is not in this group.' }, 404);
    /* Once it has locked, people's picks on it are a record - settle it void instead. */
    if (!isOpen(q, now)) return json({ error: 'locked', message: 'That question has locked. Settle it as void instead.' }, 409);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM prop_pick WHERE pool_id = ? AND qid = ?').bind(poolId, qid),
      env.DB.prepare('DELETE FROM prop_question WHERE pool_id = ? AND qid = ?').bind(poolId, qid)
    ]);
    return json({ ok: true, qid });
  }

  if (p === '/api/props/settle' && post) {
    const qid = String(b.qid || '');
    const q = (await questionsOf(env, poolId)).find((x) => x.qid === qid);
    if (!q) return json({ error: 'unknown_question', message: 'That question is not in this group.' }, 404);
    if (isOpen(q, now)) return json({ error: 'not_locked', message: 'Answer it once it has locked - people can still change their picks.' }, 409);
    const answer = b.answer == null || b.answer === '' ? null : String(b.answer);
    if (answer !== null && answer !== VOID && !q.options.includes(answer)) {
      return json({ error: 'bad_answer', message: 'The answer has to be one of the options, or void.' }, 400);
    }
    await env.DB.prepare('UPDATE prop_question SET answer = ?, settled_at = ? WHERE pool_id = ? AND qid = ?')
      .bind(answer, answer === null ? null : now, poolId, qid).run();
    return json({ ok: true, qid, answer });
  }

  return json({ error: 'not found' }, 404);
}
