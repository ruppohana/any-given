/* GROUP POOLS - THE ROUTES. /api/group/*
 *
 * Jason, 2026-09-11: "if i am not part of a group, we are missing a step. we need
 * to invite people or join another group. so we need a button to start a group,
 * with a name and then invite people to this invite only group. ... if i stated the
 * group i am the commisiner. and can set up the different rules. if i am part of a
 * group, i would like a button an email to the commish or the group. ... the commish
 * should be able to kick someone out of the group as well as send other invites as
 * they see fit. they are responsible to kindness." And "sure" to relaying the email
 * through Any Given so addresses stay private.
 *
 * EVERY ROUTE NEEDS A SIGNED-IN ACCOUNT WITH A HANDLE. A group is people who know
 * each other by name; a device id is nobody. The 401 bodies are the ones apiFetch
 * already answers by opening the sign-in sheet.
 *
 * A MEMBER IS ADDRESSED BY `ref`, never by account id: sha256(group:user), 16 hex.
 * Stable within a group, meaningless outside it, and it lets the commissioner act
 * on a row without the server ever handing out the id that owns a person's picks.
 *
 * Only the commissioner may: change settings, send invites, remove or mute. Any
 * member may: read the group, message the commissioner or the group (unless muted),
 * leave. The words and limits are in src/lib/groups.ts.
 */
import { sessionAccount } from './auth.ts';
import { sendMail, mailerReady } from './mail.ts';
import { newCode, normCode, cleanName, cleanScope, parseEmails, cleanBody, inviteMail, messageMail, LIMITS, KINDNESS } from './lib/groups.ts';

type Json = (body: unknown, status?: number, ttl?: number) => Response;

const SITE = 'https://anygiven.app';
const DAY = 86_400_000;

async function sha256hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export async function memberRef(poolId: string, userId: string): Promise<string> {
  return (await sha256hex(poolId + ':' + userId)).slice(0, 16);
}

type MemberRow = { user_id: string; role: string; display_name: string; muted: number };

async function findByRef(env: any, poolId: string, ref: string): Promise<MemberRow | null> {
  const rows = ((await env.DB.prepare(
    'SELECT user_id, role, display_name, muted FROM member WHERE pool_id = ?'
  ).bind(poolId).all()).results || []) as MemberRow[];
  for (const m of rows) if (await memberRef(poolId, m.user_id) === ref) return m;
  return null;
}

async function mailedToday(env: any, poolId: string, fromUser: string | null, kinds: string[]): Promise<number> {
  const since = Date.now() - DAY;
  const q = kinds.map(() => '?').join(',');
  const row = fromUser
    ? await env.DB.prepare(
        `SELECT COALESCE(SUM(recipients), 0) AS n, COUNT(*) AS c FROM pool_mail
          WHERE pool_id = ? AND from_user = ? AND sent_at > ? AND kind IN (${q})`
      ).bind(poolId, fromUser, since, ...kinds).first()
    : await env.DB.prepare(
        `SELECT COALESCE(SUM(recipients), 0) AS n, COUNT(*) AS c FROM pool_mail
          WHERE pool_id = ? AND sent_at > ? AND kind IN (${q})`
      ).bind(poolId, since, ...kinds).first();
  return row as any;
}

export async function handleGroups(req: Request, env: any, p: string, json: Json): Promise<Response | null> {
  if (!p.startsWith('/api/group/')) return null;
  if (!env.DB) return json({ error: 'no database' }, 503);

  const s = await sessionAccount(req, env);
  if (!s) return json({ error: 'email_required', message: 'Sign in with your email to use groups.' }, 401);
  if (!s.handle) return json({ error: 'profile_required', message: 'Pick a handle to use groups.' }, 401);
  const uid = s.accountId;
  const handle = s.handle;
  const url = new URL(req.url);
  const post = req.method === 'POST';
  const b: any = post ? await req.json().catch(() => ({})) : {};

  /* ---- my groups ---- */
  if (p === '/api/group/mine') {
    const rows = ((await env.DB.prepare(
      `SELECT g.id, g.name, g.sport, g.week, g.ats, g.scope, g.scope_arg, m.role,
              (SELECT COUNT(*) FROM member m2 WHERE m2.pool_id = g.id) AS members
         FROM member m JOIN pool g ON g.id = m.pool_id
        WHERE m.user_id = ? AND g.id NOT LIKE 'world-%'
        ORDER BY g.created_at DESC LIMIT 50`
    ).bind(uid).all()).results || []) as any[];
    return json({
      groups: rows.map((r) => ({ id: r.id, name: r.name, sport: r.sport, week: r.week ?? null,
                                 ats: !!r.ats, scope: r.scope || 'all', scopeArg: r.scope_arg || null,
                                 members: r.members, role: r.role })),
      kindness: KINDNESS
    });
  }

  /* ---- start a group ---- */
  if (p === '/api/group/create' && post) {
    if (b.pledge !== true) return json({ error: 'pledge_required', message: KINDNESS }, 400);
    const name = cleanName(b.name);
    if (!name) return json({ error: 'name_required', message: 'Give the group a name.' }, 400);
    const sport = b.sport === 'nfl' ? 'nfl' : 'college-football';
    const ats = b.ats ? 1 : 0;
    /* Which games - college groups choose, an NFL group is all games. */
    const sc = cleanScope(sport, b.scope, b.scopeArg);
    if (!sc) return json({ error: 'scope_required', message: 'Pick the conference.' }, 400);
    /* The code is the group's id, so a collision is checked, not hoped against. */
    let id = '';
    for (let i = 0; i < 8 && !id; i++) {
      const c = newCode();
      const hit = await env.DB.prepare('SELECT 1 AS x FROM pool WHERE id = ?').bind(c).first();
      if (!hit) id = c;
    }
    if (!id) return json({ error: 'try_again', message: 'Could not make a code. Try again.' }, 503);
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO pool (id, name, commissioner_id, scope, scope_arg, ranking_source,
                           ats, season, scope_locked_at, created_at, sport, week, pledge_at)
         VALUES (?, ?, ?, ?, ?, NULL, ?, 2026, NULL, ?, ?, NULL, ?)`
      ).bind(id, name, uid, sc.scope, sc.arg, ats, now, sport, now),
      env.DB.prepare(
        `INSERT INTO member (pool_id, user_id, display_name, joined_week, role)
         VALUES (?, ?, ?, 0, 'commissioner')`
      ).bind(id, uid, handle.slice(0, 24))
    ]);
    return json({
      ok: true,
      group: { id, name, sport, week: null, ats: !!ats, scope: sc.scope, scopeArg: sc.arg,
               members: 1, role: 'commissioner' },
      invite: { code: id, link: `${SITE}/?pool=${id}` }
    });
  }

  /* ---- join with a code ---- */
  if (p === '/api/group/join' && post) {
    const code = normCode(b.code);
    if (!code) return json({ error: 'code_required', message: 'Enter the code from your invite.' }, 400);
    const g = await env.DB.prepare(
      `SELECT id, name, sport, week, ats FROM pool WHERE id = ? AND id NOT LIKE 'world-%'`
    ).bind(code).first() as any;
    if (!g) return json({ error: 'no_group', message: 'No group has that code.' }, 404);
    const gone = await env.DB.prepare(
      'SELECT 1 AS x FROM pool_removed WHERE pool_id = ? AND user_id = ?'
    ).bind(code, uid).first();
    if (gone) return json({ error: 'removed', message: 'The commissioner removed you from this group.' }, 403);
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM member WHERE pool_id = ?').bind(code).first() as any;
    const already = await env.DB.prepare(
      'SELECT role FROM member WHERE pool_id = ? AND user_id = ?'
    ).bind(code, uid).first() as any;
    if (!already && n && n.n >= LIMITS.membersMax) {
      return json({ error: 'full', message: 'This group is full.' }, 409);
    }
    await env.DB.prepare(
      `INSERT INTO member (pool_id, user_id, display_name, joined_week, role)
       VALUES (?, ?, ?, 0, 'player')
       ON CONFLICT(pool_id, user_id) DO NOTHING`
    ).bind(code, uid, handle.slice(0, 24)).run();
    return json({ ok: true, group: { id: g.id, name: g.name, sport: g.sport, week: g.week ?? null,
                                     ats: !!g.ats, role: already ? already.role : 'player' } });
  }

  /* ---- everything below is about one group the caller is in ---- */
  const gid = normCode(post ? b.id : url.searchParams.get('id'));
  if (!gid) return json({ error: 'id_required' }, 400);
  const g = await env.DB.prepare(
    `SELECT id, name, sport, week, ats, scope, scope_arg, created_at, pledge_at FROM pool
      WHERE id = ? AND id NOT LIKE 'world-%'`
  ).bind(gid).first() as any;
  if (!g) return json({ error: 'no_group', message: 'That group is gone.' }, 404);
  const mine = await env.DB.prepare(
    'SELECT role, muted FROM member WHERE pool_id = ? AND user_id = ?'
  ).bind(gid, uid).first() as any;
  if (!mine) return json({ error: 'not_a_member', message: 'You are not in this group.' }, 403);
  const isCommish = mine.role === 'commissioner';
  const link = `${SITE}/?pool=${gid}`;
  const onlyCommish = () => json({ error: 'commissioner_only', message: 'Only the commissioner can do that.' }, 403);

  if (p === '/api/group/detail') {
    const rows = ((await env.DB.prepare(
      `SELECT m.user_id, m.display_name, m.role, m.muted, a.handle
         FROM member m LEFT JOIN account a ON a.id = m.user_id
        WHERE m.pool_id = ?
        ORDER BY (m.role = 'commissioner') DESC, lower(COALESCE(a.handle, m.display_name))`
    ).bind(gid).all()).results || []) as any[];
    const members = await Promise.all(rows.map(async (r) => ({
      ref: await memberRef(gid, r.user_id),
      name: r.handle || r.display_name || 'Someone',
      role: r.role,
      you: r.user_id === uid,
      ...(isCommish ? { muted: !!r.muted } : {})
    })));
    const c = members.find((m) => m.role === 'commissioner');
    return json({
      group: { id: g.id, name: g.name, sport: g.sport, week: g.week ?? null, ats: !!g.ats,
               scope: g.scope || 'all', scopeArg: g.scope_arg || null,
               createdAt: g.created_at, pledged: !!g.pledge_at },
      you: { role: mine.role, muted: !!mine.muted },
      commissioner: c ? c.name : null,
      members,
      /* The invite is the commissioner's to send - an invite-only group. */
      invite: isCommish ? { code: gid, link } : null,
      mailer: mailerReady(env),
      kindness: KINDNESS
    });
  }

  if (p === '/api/group/settings' && post) {
    if (!isCommish) return onlyCommish();
    const name = b.name == null ? null : cleanName(b.name);
    if (name === '') return json({ error: 'name_required', message: 'A group needs a name.' }, 400);
    const ats = b.ats == null ? null : (b.ats ? 1 : 0);
    /* Which games: the commissioner's to change, and it takes effect on the slate
     * at once. Picks already made are not deleted - they still count. */
    let sc: { scope: string; arg: string | null } | null = null;
    if (b.scope != null) {
      sc = cleanScope(g.sport, b.scope, b.scopeArg);
      if (!sc) return json({ error: 'scope_required', message: 'Pick the conference.' }, 400);
    }
    await env.DB.prepare(
      'UPDATE pool SET name = COALESCE(?, name), ats = COALESCE(?, ats) WHERE id = ?'
    ).bind(name, ats, gid).run();
    if (sc) {
      await env.DB.prepare('UPDATE pool SET scope = ?, scope_arg = ? WHERE id = ?').bind(sc.scope, sc.arg, gid).run();
    }
    const now = await env.DB.prepare('SELECT name, ats, scope, scope_arg FROM pool WHERE id = ?').bind(gid).first() as any;
    return json({ ok: true, group: { id: gid, name: now.name, ats: !!now.ats,
                                     scope: now.scope || 'all', scopeArg: now.scope_arg || null } });
  }

  if (p === '/api/group/remove' && post) {
    if (!isCommish) return onlyCommish();
    const t = await findByRef(env, gid, String(b.ref || ''));
    if (!t) return json({ error: 'no_member', message: 'That person is not in this group.' }, 404);
    if (t.user_id === uid) {
      return json({ error: 'self', message: 'You cannot remove yourself. Leave the group instead.' }, 400);
    }
    await env.DB.batch([
      env.DB.prepare('DELETE FROM pick WHERE pool_id = ? AND user_id = ?').bind(gid, t.user_id),
      env.DB.prepare('DELETE FROM member WHERE pool_id = ? AND user_id = ?').bind(gid, t.user_id),
      env.DB.prepare(
        `INSERT INTO pool_removed (pool_id, user_id, removed_at) VALUES (?, ?, ?)
         ON CONFLICT(pool_id, user_id) DO UPDATE SET removed_at = excluded.removed_at`
      ).bind(gid, t.user_id, Date.now())
    ]);
    return json({ ok: true, removed: t.display_name || 'member' });
  }

  if (p === '/api/group/mute' && post) {
    if (!isCommish) return onlyCommish();
    const t = await findByRef(env, gid, String(b.ref || ''));
    if (!t) return json({ error: 'no_member', message: 'That person is not in this group.' }, 404);
    if (t.user_id === uid) return json({ error: 'self', message: 'You cannot mute yourself.' }, 400);
    await env.DB.prepare('UPDATE member SET muted = ? WHERE pool_id = ? AND user_id = ?')
      .bind(b.muted ? 1 : 0, gid, t.user_id).run();
    return json({ ok: true, muted: !!b.muted });
  }

  if (p === '/api/group/leave' && post) {
    if (isCommish) {
      /* The group passes to its longest-standing other member - the same rule
       * account deletion follows. The last one out closes it. */
      const next = await env.DB.prepare(
        `SELECT user_id FROM member WHERE pool_id = ? AND user_id <> ? ORDER BY rowid LIMIT 1`
      ).bind(gid, uid).first() as any;
      if (!next) {
        await env.DB.batch([
          env.DB.prepare('DELETE FROM pick WHERE pool_id = ?').bind(gid),
          env.DB.prepare('DELETE FROM member WHERE pool_id = ?').bind(gid),
          env.DB.prepare('DELETE FROM pool_removed WHERE pool_id = ?').bind(gid),
          env.DB.prepare('DELETE FROM pool_mail WHERE pool_id = ?').bind(gid),
          env.DB.prepare('DELETE FROM pool WHERE id = ?').bind(gid)
        ]);
        return json({ ok: true, closed: true });
      }
      await env.DB.batch([
        env.DB.prepare(`UPDATE member SET role = 'commissioner', muted = 0 WHERE pool_id = ? AND user_id = ?`)
          .bind(gid, next.user_id),
        env.DB.prepare('UPDATE pool SET commissioner_id = ? WHERE id = ?').bind(next.user_id, gid)
      ]);
    }
    await env.DB.batch([
      env.DB.prepare('DELETE FROM pick WHERE pool_id = ? AND user_id = ?').bind(gid, uid),
      env.DB.prepare('DELETE FROM member WHERE pool_id = ? AND user_id = ?').bind(gid, uid)
    ]);
    return json({ ok: true, closed: false });
  }

  if (p === '/api/group/invite' && post) {
    if (!isCommish) return onlyCommish();
    /* Parsed uncapped so a batch over the limit is refused whole - capping here
     * used to drop every valid address past 20 without a word (found by the
     * commissioner screen's agent, 2026-09-11). */
    const { ok, bad } = parseEmails(b.emails, Infinity);
    if (!ok.length) return json({ error: 'no_emails', message: 'Add at least one email address.', bad }, 400);
    if (ok.length > LIMITS.invitesPerBatch) {
      return json({ error: 'too_many', message: `That is ${ok.length} addresses. Send ${LIMITS.invitesPerBatch} at a time.`, bad }, 400);
    }
    if (!mailerReady(env)) return json({ error: 'no_mailer', message: 'Email is not set up yet. Share the link instead.', bad }, 503);
    const used = await mailedToday(env, gid, null, ['invite']) as any;
    if (Number(used.n) + ok.length > LIMITS.invitesPerDay) {
      return json({ error: 'limit', message: `A group can send ${LIMITS.invitesPerDay} invites a day.` }, 429);
    }
    const mail = inviteMail({ groupName: g.name, fromHandle: handle, link });
    let sent = 0;
    for (const to of ok) if (await sendMail(env, to, mail.subject, mail.text)) sent++;
    await env.DB.prepare(
      `INSERT INTO pool_mail (pool_id, from_user, kind, recipients, sent_at) VALUES (?, ?, 'invite', ?, ?)`
    ).bind(gid, uid, sent, Date.now()).run();
    return json({ ok: sent > 0, sent, bad });
  }

  if (p === '/api/group/message' && post) {
    const to: 'commish' | 'group' = b.to === 'group' ? 'group' : 'commish';
    if (mine.muted) return json({ error: 'muted', message: 'The commissioner has muted your messages in this group.' }, 403);
    if (to === 'commish' && isCommish) return json({ error: 'self', message: 'You are the commissioner.' }, 400);
    const text = cleanBody(b.body);
    if (!text) return json({ error: 'empty', message: 'Write something first.' }, 400);
    if (!mailerReady(env)) return json({ error: 'no_mailer', message: 'Email is not set up yet.' }, 503);
    const used = await mailedToday(env, gid, uid, ['commish', 'group']) as any;
    if (Number(used.c) >= LIMITS.messagesPerDay) {
      return json({ error: 'limit', message: `You can send ${LIMITS.messagesPerDay} messages a day in a group.` }, 429);
    }
    const rows = ((to === 'commish'
      ? await env.DB.prepare(
          `SELECT a.email FROM member m JOIN account a ON a.id = m.user_id
            WHERE m.pool_id = ? AND m.role = 'commissioner'`
        ).bind(gid).all()
      : await env.DB.prepare(
          `SELECT a.email FROM member m JOIN account a ON a.id = m.user_id
            WHERE m.pool_id = ? AND m.user_id <> ?`
        ).bind(gid, uid).all()).results || []) as any[];
    const emails = [...new Set(rows.map((r) => String(r.email || '')).filter(Boolean))];
    if (!emails.length) return json({ error: 'nobody', message: 'There is nobody to send it to yet.' }, 400);
    const mail = messageMail({ groupName: g.name, fromHandle: handle, to, body: text, link: `${SITE}/#/g` });
    let sent = 0;
    for (const e of emails) if (await sendMail(env, e, mail.subject, mail.text)) sent++;
    await env.DB.prepare(
      `INSERT INTO pool_mail (pool_id, from_user, kind, recipients, sent_at) VALUES (?, ?, ?, ?, ?)`
    ).bind(gid, uid, to, sent, Date.now()).run();
    return json({ ok: sent > 0, sent });
  }

  return json({ error: 'not found' }, 404);
}
