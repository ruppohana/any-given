/* 🔴 EMAIL SIGN-IN. Jason, 2026-09-10: "no, i want their email" - and the
 * reason, in his words: "otherwise i can log in for you and tank your picks."
 *
 * He is right about the hole. /api/pool/pick has always trusted whatever
 * device id it was sent, and a device id is a string anybody who has seen one
 * can post. A verified email is the first identity here that a stranger
 * cannot type. This reverses the settled "nothing in front of the slate" -
 * see Swing Route/Any Given/wiki/decisions/email-is-required-2026-09-10.md.
 *
 * NO PASSWORDS. A six-digit code goes to the address; the code proves the
 * inbox; the phone that proved it gets a session token. Codes and tokens are
 * stored HASHED, so a leaked table is not a list of working keys.
 *
 * 🔴 AND A PROFILE. Jason, the same night: "sign in needs to know first name
 * and last name and handle, and verify if the handle is taken." After the code,
 * an account with no handle is asked for first name, last name and a handle;
 * /api/auth/handle answers "is this free" as they type, and the UNIQUE index on
 * handle_key is what actually decides a race (migrations/0006_profile.sql).
 *
 * 🔴 ENFORCEMENT IS ONE SWITCH, `REQUIRE_EMAIL = "1"`, and it stays off until
 * the sender and the sign-in sheet are both live. With it off, a session is
 * honored when present and a device id still works - so nothing that works
 * today breaks while this is being finished. With it on, a pick, a group or a
 * join without a session is answered 401 `email_required`, and one from an
 * account with no handle yet 401 `profile_required`; the client's answer to
 * either is the sign-in sheet. The server decides; the app obeys.
 *
 * 🔴 THE SENDER IS JASON'S TO CONNECT. MailerSend or Resend, key set with
 * `wrangler secret put ...`. Until one exists /start answers 503 "not switched
 * on yet" - never a fake success that leaves somebody waiting for an email
 * that was never sent.
 */

type Json = (body: unknown, status?: number) => Response;

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_GAP_MS = 60 * 1000;
const MAX_SENDS_PER_HOUR = 5;
/* Six digits is a million codes; five tries is a one-in-200,000 guess. */
const MAX_ATTEMPTS = 5;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;

/* A handle: 3-20 letters, digits or underscores, at least one letter. Kept
   plain on purpose - it is read aloud, typed on a phone and shown on a board. */
const HANDLE = /^[A-Za-z0-9_]{3,20}$/;
const RESERVED = new Set(['admin', 'administrator', 'anygiven', 'any_given', 'support', 'help',
  'root', 'system', 'world', 'official', 'moderator', 'mod', 'staff', 'team', 'null',
  'undefined', 'me', 'you', 'everyone', 'nobody', 'someone', 'marbles']);
/* A name: letters in any alphabet, with spaces, hyphens, apostrophes, periods. */
const NAME = /^[\p{L}][\p{L}\p{M}' .-]{0,39}$/u;

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function sha256(s: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
}
function randHex(bytes: number): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return hex(a.buffer);
}
function sixDigits(): string {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(a[0] % 1_000_000).padStart(6, '0');
}
export const normEmail = (e: unknown) => String(e || '').trim().toLowerCase();

/** Why a handle cannot be used, or null if its shape is fine. */
export function handleProblem(h: string): string | null {
  if (!HANDLE.test(h)) return '3 to 20 letters, numbers or underscores.';
  if (!/[A-Za-z]/.test(h)) return 'It needs at least one letter.';
  if (RESERVED.has(h.toLowerCase())) return 'That one is reserved.';
  return null;
}

type Session = { accountId: string; email: string; handle: string | null; first: string | null; last: string | null };

/** The signed-in account behind this request, or null. */
export async function sessionAccount(req: Request, env: any): Promise<Session | null> {
  const m = (req.headers.get('authorization') || '').match(/^Bearer\s+([a-f0-9]{64})$/i);
  if (!m || !env.DB) return null;
  const row = await env.DB.prepare(
    `SELECT s.account_id AS id, a.email AS email, a.handle AS handle,
            a.first_name AS first, a.last_name AS last
       FROM session s JOIN account a ON a.id = s.account_id
      WHERE s.token_hash = ? AND a.verified_at IS NOT NULL`
  ).bind(await sha256(m[1].toLowerCase())).first() as any;
  return row ? { accountId: row.id, email: row.email, handle: row.handle || null,
                 first: row.first || null, last: row.last || null } : null;
}

/**
 * WHO IS THIS, for the pool endpoints. A session wins whenever one is sent.
 * Without one: the device id while enforcement is off, a 401 while it is on.
 */
/* 🔴 ONE SPELLING OF A DEVICE ID. The live screen stored `ag.device` JSON-encoded
 * until 2026-09-10, so some phones posted `"abc"` - quotes included - and D1
 * holds picks under both spellings. Strip the quotes on the way in; the sign-in
 * migration matches both, so a quoted history still moves to the account. */
export function normDevice(v: unknown): string {
  return String(v || '').replace(/"/g, '').slice(0, 80);
}

export async function requireIdentity(req: Request, env: any, deviceId: unknown, json: Json):
  Promise<{ userId: string; handle?: string } | { error: Response }> {
  const s = await sessionAccount(req, env);
  if (s) {
    if (env.REQUIRE_EMAIL === '1' && !s.handle) {
      return { error: json({ error: 'profile_required', message: 'Pick a handle to play.' }, 401) };
    }
    /* The handle travels with the identity so every board names a signed-in
     * person by it - never by a name the phone typed, which could be anyone's. */
    return { userId: s.accountId, handle: s.handle || undefined };
  }
  if (env.REQUIRE_EMAIL === '1') {
    return { error: json({ error: 'email_required', message: 'Sign in with your email to play.' }, 401) };
  }
  const d = normDevice(deviceId);
  if (!d) return { error: json({ error: 'deviceId is required' }, 400) };
  return { userId: d };
}

/* 🔴 MAILERSEND FIRST. Jason, 2026-09-10: "i have mailer" - MailerLite, account
 * 2486821. MailerLite sends campaigns and automations to subscribers and has no
 * endpoint for one email to one person on demand, which is what a sign-in code
 * is; driving codes through a subscriber + automation would put every player on
 * a marketing list and stop delivering to anyone who unsubscribed. MailerSend is
 * the same company's transactional product and is built for exactly this.
 * Resend is the other option - and the one connected first, on 2026-09-10. */
async function sendCode(env: any, email: string, code: string): Promise<boolean> {
  const subject = `${code} is your Any Given code`;
  const text = `Your Any Given code is ${code}.\n\nIt works for 10 minutes. If you didn't ask for it, you can ignore this email.`;
  if (env.MAILERSEND_API_KEY) {
    const r = await fetch('https://api.mailersend.com/v1/email', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.MAILERSEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: { email: env.MAIL_FROM_EMAIL || 'codes@anygiven.app', name: 'Any Given' },
        to: [{ email }],
        subject, text
      })
    });
    return r.ok;
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM || 'Any Given <codes@anygiven.app>', to: [email], subject, text })
  });
  return r.ok;
}

/** Handles /api/auth/*; returns null for anything else. */
export async function handleAuth(req: Request, env: any, p: string, json: Json): Promise<Response | null> {
  if (!p.startsWith('/api/auth/')) return null;
  if (!env.DB) return json({ error: 'no database' }, 503);

  if (p === '/api/auth/start' && req.method === 'POST') {
    const b = await req.json().catch(() => ({})) as any;
    const email = normEmail(b.email);
    if (!EMAIL.test(email)) return json({ error: 'That doesn’t look like an email address.' }, 400);
    /* 🔴 18+, NOT 13+. The app is rated 18+ (settled.md, "18+, taken
       honestly", 2026-09-07) and the sign-in first shipped asking 13+ - the
       COPPA line - until Jason caught it: "i thought we were asking 18+ for
       apple". 18 covers COPPA as well. No email is stored without it. */
    if (b.ageOk !== true) return json({ error: 'You need to be 18 or older to play.' }, 400);
    if (!env.MAILERSEND_API_KEY && !env.RESEND_API_KEY) {
      return json({ error: 'Email sign-in isn’t switched on yet.', sender: false }, 503);
    }

    const now = Date.now();
    const prev = await env.DB.prepare('SELECT sent_at, sends FROM verify_code WHERE email = ?')
      .bind(email).first() as any;
    if (prev && now - prev.sent_at < RESEND_GAP_MS) {
      return json({ error: 'A code was just sent. Give it a minute before asking again.' }, 429);
    }
    const sends = prev && now - prev.sent_at < 60 * 60 * 1000 ? Number(prev.sends) + 1 : 1;
    if (sends > MAX_SENDS_PER_HOUR) return json({ error: 'Too many codes for this address. Try again in an hour.' }, 429);

    const code = sixDigits();
    if (!(await sendCode(env, email, code))) return json({ error: 'We couldn’t send the email. Try again.' }, 502);

    await env.DB.prepare(
      `INSERT INTO verify_code (email, code_hash, expires_at, attempts, sent_at, sends)
       VALUES (?, ?, ?, 0, ?, ?)
       ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at,
         attempts = 0, sent_at = excluded.sent_at, sends = excluded.sends`
    ).bind(email, await sha256(email + ':' + code), now + CODE_TTL_MS, now, sends).run();
    await env.DB.prepare(
      `INSERT INTO account (id, email, verified_at, age_ok, created_at) VALUES (?, ?, NULL, 1, ?)
       ON CONFLICT(email) DO UPDATE SET age_ok = 1`
    ).bind(randHex(12), email, now).run();
    return json({ ok: true });
  }

  if (p === '/api/auth/verify' && req.method === 'POST') {
    const b = await req.json().catch(() => ({})) as any;
    const email = normEmail(b.email);
    const code = String(b.code || '').replace(/\D/g, '');
    const deviceId = normDevice(b.deviceId);
    const row = await env.DB.prepare('SELECT code_hash, expires_at, attempts FROM verify_code WHERE email = ?')
      .bind(email).first() as any;
    if (!row) return json({ error: 'Ask for a new code.' }, 400);
    if (Date.now() > row.expires_at) return json({ error: 'That code expired. Ask for a new one.' }, 410);
    if (row.attempts >= MAX_ATTEMPTS) return json({ error: 'Too many tries. Ask for a new code.' }, 429);
    if ((await sha256(email + ':' + code)) !== row.code_hash) {
      await env.DB.prepare('UPDATE verify_code SET attempts = attempts + 1 WHERE email = ?').bind(email).run();
      return json({ error: 'That code isn’t right.' }, 401);
    }
    await env.DB.prepare('DELETE FROM verify_code WHERE email = ?').bind(email).run();
    const acct = await env.DB.prepare('SELECT id, handle, first_name, last_name FROM account WHERE email = ?')
      .bind(email).first() as any;
    if (!acct) return json({ error: 'Ask for a new code.' }, 400);
    const now = Date.now();
    await env.DB.prepare('UPDATE account SET verified_at = COALESCE(verified_at, ?) WHERE id = ?')
      .bind(now, acct.id).run();

    /* 🔴 THE PHONE'S HISTORY MOVES TO THE PERSON. Every pick, membership and
     * commissioner role this device made becomes the account's, so signing in
     * costs nothing already done - and from here the picks are no longer a
     * string somebody else could post. OR IGNORE: if the account already has a
     * pick for a game from another phone, that one stands. */
    if (deviceId) {
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO device_account (device_id, account_id, linked_at) VALUES (?, ?, ?)
           ON CONFLICT(device_id) DO UPDATE SET account_id = excluded.account_id, linked_at = excluded.linked_at`
        ).bind(deviceId, acct.id, now),
        /* Both spellings - see normDevice. */
        env.DB.prepare('UPDATE OR IGNORE pick SET user_id = ? WHERE user_id IN (?, ?)').bind(acct.id, deviceId, `"${deviceId}"`),
        env.DB.prepare('UPDATE OR IGNORE member SET user_id = ? WHERE user_id IN (?, ?)').bind(acct.id, deviceId, `"${deviceId}"`),
        env.DB.prepare('UPDATE pool SET commissioner_id = ? WHERE commissioner_id IN (?, ?)').bind(acct.id, deviceId, `"${deviceId}"`)
      ]);
    }
    const token = randHex(32);
    await env.DB.prepare('INSERT INTO session (token_hash, account_id, device_id, created_at) VALUES (?, ?, ?, ?)')
      .bind(await sha256(token), acct.id, deviceId, now).run();
    return json({ ok: true, token, accountId: acct.id, email, handle: acct.handle || null,
                  needsProfile: !acct.handle });
  }

  /* IS THIS HANDLE FREE - asked as somebody types. The answer is advice; the
     UNIQUE index at save time is the ruling. A signed-in person asking about
     their own current handle is told it is available. */
  if (p === '/api/auth/handle') {
    const url = new URL(req.url);
    const h = String(url.searchParams.get('h') || '').trim();
    const problem = handleProblem(h);
    if (problem) return json({ ok: true, available: false, reason: problem });
    const s = await sessionAccount(req, env);
    const taken = await env.DB.prepare('SELECT id FROM account WHERE handle_key = ?')
      .bind(h.toLowerCase()).first() as any;
    const available = !taken || (s && taken.id === s.accountId);
    return json({ ok: true, available: !!available, reason: available ? null : 'That handle is taken.' });
  }

  /* SAVE THE PROFILE - first name, last name, handle. Signed in only. */
  if (p === '/api/auth/profile' && req.method === 'POST') {
    const s = await sessionAccount(req, env);
    if (!s) return json({ error: 'Sign in first.' }, 401);
    const b = await req.json().catch(() => ({})) as any;
    const first = String(b.first || '').trim().replace(/\s+/g, ' ');
    const last = String(b.last || '').trim().replace(/\s+/g, ' ');
    const handle = String(b.handle || '').trim();
    if (!NAME.test(first)) return json({ error: 'Add your first name.', field: 'first' }, 400);
    if (!NAME.test(last)) return json({ error: 'Add your last name.', field: 'last' }, 400);
    const problem = handleProblem(handle);
    if (problem) return json({ error: problem, field: 'handle' }, 400);
    try {
      await env.DB.prepare(
        'UPDATE account SET first_name = ?, last_name = ?, handle = ?, handle_key = ? WHERE id = ?'
      ).bind(first, last, handle, handle.toLowerCase(), s.accountId).run();
    } catch (e: any) {
      /* The UNIQUE index said no: somebody took it between the check and now. */
      if (/UNIQUE/i.test(String(e?.message || e))) return json({ error: 'That handle was just taken.', field: 'handle' }, 409);
      throw e;
    }
    /* The handle is the name on every board this person is already on. */
    await env.DB.prepare('UPDATE member SET display_name = ? WHERE user_id = ?').bind(handle, s.accountId).run();
    return json({ ok: true, handle, first, last });
  }

  if (p === '/api/auth/me') {
    const s = await sessionAccount(req, env);
    return s ? json({ ok: true, ...s, needsProfile: !s.handle, required: env.REQUIRE_EMAIL === '1' })
             : json({ error: 'not signed in', required: env.REQUIRE_EMAIL === '1' }, 401);
  }

  /* 🔴 DELETE THE ACCOUNT - from the app, not by email. Apple requires in-app
   * deletion for any app that creates accounts (App Review 5.1.1(v)), and the
   * privacy page promises it. Everything tied to the person goes: picks,
   * parlays, tiebreaks, scores, marbles, memberships, sessions, device links,
   * the account. A group they run is handed to its longest-standing other
   * member; a group with nobody else in it goes with them. `confirm: true` in
   * the body, so a stray POST cannot do it. */
  if (p === '/api/auth/delete' && req.method === 'POST') {
    const s = await sessionAccount(req, env);
    if (!s) return json({ error: 'Sign in first.' }, 401);
    const b = await req.json().catch(() => ({})) as any;
    if (b.confirm !== true) return json({ error: 'confirm required' }, 400);
    const id = s.accountId;
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE pool SET commissioner_id = COALESCE((SELECT m.user_id FROM member m
           WHERE m.pool_id = pool.id AND m.user_id != ? ORDER BY m.joined_week, m.rowid LIMIT 1), commissioner_id)
         WHERE commissioner_id = ?`).bind(id, id),
      env.DB.prepare(
        `UPDATE member SET role = 'commissioner' WHERE role != 'commissioner'
           AND EXISTS (SELECT 1 FROM pool p WHERE p.id = member.pool_id AND p.commissioner_id = member.user_id)`),
      env.DB.prepare('DELETE FROM pool WHERE commissioner_id = ?').bind(id),
      ...['pick', 'parlay_leg', 'tiebreak', 'week_score', 'marble_ledger', 'member']
        .map((t) => env.DB.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(id)),
      env.DB.prepare('DELETE FROM session WHERE account_id = ?').bind(id),
      env.DB.prepare('DELETE FROM device_account WHERE account_id = ?').bind(id),
      env.DB.prepare('DELETE FROM verify_code WHERE email = ?').bind(s.email),
      env.DB.prepare('DELETE FROM account WHERE id = ?').bind(id)
    ]);
    return json({ ok: true, deleted: true });
  }

  if (p === '/api/auth/logout' && req.method === 'POST') {
    const m = (req.headers.get('authorization') || '').match(/^Bearer\s+([a-f0-9]{64})$/i);
    if (m) await env.DB.prepare('DELETE FROM session WHERE token_hash = ?').bind(await sha256(m[1].toLowerCase())).run();
    return json({ ok: true });
  }

  return json({ error: 'unknown auth route' }, 404);
}
