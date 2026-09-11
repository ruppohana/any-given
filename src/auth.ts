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
 * 🔴 ENFORCEMENT IS ONE SWITCH, `REQUIRE_EMAIL = "1"`, and it stays off until
 * the sender and the sign-in sheet are both live. With it off, a session is
 * honored when present and a device id still works - so nothing that works
 * today breaks while this is being finished. With it on, a pick, a group or a
 * join without a session is answered 401 `email_required`, and the client's
 * answer to that is the sign-in sheet. The server decides; the app obeys.
 *
 * 🔴 THE SENDER IS JASON'S TO CONNECT. Resend, key set with
 * `wrangler secret put RESEND_API_KEY`. Until it exists /start answers 503
 * "not switched on yet" - never a fake success that leaves somebody waiting
 * for an email that was never sent.
 */

type Json = (body: unknown, status?: number) => Response;

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_GAP_MS = 60 * 1000;
const MAX_SENDS_PER_HOUR = 5;
/* Six digits is a million codes; five tries is a one-in-200,000 guess. */
const MAX_ATTEMPTS = 5;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;

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

/** The signed-in account behind this request, or null. */
export async function sessionAccount(req: Request, env: any): Promise<{ accountId: string; email: string } | null> {
  const m = (req.headers.get('authorization') || '').match(/^Bearer\s+([a-f0-9]{64})$/i);
  if (!m || !env.DB) return null;
  const row = await env.DB.prepare(
    `SELECT s.account_id AS id, a.email AS email FROM session s
       JOIN account a ON a.id = s.account_id
      WHERE s.token_hash = ? AND a.verified_at IS NOT NULL`
  ).bind(await sha256(m[1].toLowerCase())).first() as any;
  return row ? { accountId: row.id, email: row.email } : null;
}

/**
 * WHO IS THIS, for the pool endpoints. A session wins whenever one is sent.
 * Without one: the device id while enforcement is off, a 401 while it is on.
 */
export async function requireIdentity(req: Request, env: any, deviceId: unknown, json: Json):
  Promise<{ userId: string } | { error: Response }> {
  const s = await sessionAccount(req, env);
  if (s) return { userId: s.accountId };
  if (env.REQUIRE_EMAIL === '1') {
    return { error: json({ error: 'email_required', message: 'Sign in with your email to play.' }, 401) };
  }
  const d = String(deviceId || '').slice(0, 80);
  if (!d) return { error: json({ error: 'deviceId is required' }, 400) };
  return { userId: d };
}

async function sendCode(env: any, email: string, code: string): Promise<boolean> {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env.MAIL_FROM || 'Any Given <codes@anygiven.app>',
      to: [email],
      subject: `${code} is your Any Given code`,
      text: `Your Any Given code is ${code}.\n\nIt works for 10 minutes. If you didn't ask for it, you can ignore this email.`
    })
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
    /* COPPA: collecting a child's email needs a parent's consent. The app does
       not collect it at all without this confirmation. */
    if (b.ageOk !== true) return json({ error: 'You need to be 13 or older to play.' }, 400);
    if (!env.RESEND_API_KEY) return json({ error: 'Email sign-in isn’t switched on yet.', sender: false }, 503);

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
    const deviceId = String(b.deviceId || '').slice(0, 80);
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
    const acct = await env.DB.prepare('SELECT id FROM account WHERE email = ?').bind(email).first() as any;
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
        env.DB.prepare('UPDATE OR IGNORE pick SET user_id = ? WHERE user_id = ?').bind(acct.id, deviceId),
        env.DB.prepare('UPDATE OR IGNORE member SET user_id = ? WHERE user_id = ?').bind(acct.id, deviceId),
        env.DB.prepare('UPDATE pool SET commissioner_id = ? WHERE commissioner_id = ?').bind(acct.id, deviceId)
      ]);
    }
    const token = randHex(32);
    await env.DB.prepare('INSERT INTO session (token_hash, account_id, device_id, created_at) VALUES (?, ?, ?, ?)')
      .bind(await sha256(token), acct.id, deviceId, now).run();
    return json({ ok: true, token, accountId: acct.id, email });
  }

  if (p === '/api/auth/me') {
    const s = await sessionAccount(req, env);
    return s ? json({ ok: true, ...s, required: env.REQUIRE_EMAIL === '1' })
             : json({ error: 'not signed in', required: env.REQUIRE_EMAIL === '1' }, 401);
  }

  if (p === '/api/auth/logout' && req.method === 'POST') {
    const m = (req.headers.get('authorization') || '').match(/^Bearer\s+([a-f0-9]{64})$/i);
    if (m) await env.DB.prepare('DELETE FROM session WHERE token_hash = ?').bind(await sha256(m[1].toLowerCase())).run();
    return json({ ok: true });
  }

  return json({ error: 'unknown auth route' }, 404);
}
