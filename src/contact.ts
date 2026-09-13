/* /api/contact - read and change this account's opt-ins. Signed in only.
 *
 *   GET  -> { emailOptIn, phone, smsOptIn, emailConsent, smsConsent }
 *   POST { emailOptIn?: boolean, phone?: string|null, smsOptIn?: boolean }
 *        -> the same, as stored. A field left out is left alone; a text opt-in
 *           with no phone is stored as no.
 *
 * The rules and the words are src/lib/contact.ts. Nothing here sends anything.
 */
import { sessionAccount } from './auth.ts';
import { cleanPhone, EMAIL_CONSENT, SMS_CONSENT } from './lib/contact.ts';

type Json = (body: unknown, status?: number, ttl?: number) => Response;

export async function handleContact(req: Request, env: any, p: string, json: Json): Promise<Response | null> {
  if (p !== '/api/contact') return null;
  if (!env.DB) return json({ error: 'no database' }, 503);
  const s = await sessionAccount(req, env);
  if (!s) return json({ error: 'email_required', message: 'Sign in first.' }, 401);

  if (req.method === 'POST') {
    const b: any = await req.json().catch(() => ({}));
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (typeof b.emailOptIn === 'boolean') { sets.push('email_opt_in = ?'); vals.push(b.emailOptIn ? 1 : 0); }
    if ('phone' in b) {
      const given = b.phone != null && String(b.phone).trim() !== '';
      const phone = cleanPhone(b.phone);
      if (given && !phone) {
        return json({ error: 'bad_phone', field: 'phone', message: 'That does not look like a phone number.' }, 400);
      }
      sets.push('phone = ?'); vals.push(phone);
    }
    if (typeof b.smsOptIn === 'boolean') { sets.push('sms_opt_in = ?'); vals.push(b.smsOptIn ? 1 : 0); }
    if (sets.length) {
      /* The column list is chosen above from fixed fragments, never from the request. */
      await env.DB.prepare(`UPDATE account SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, s.accountId).run();
      await env.DB.prepare('UPDATE account SET sms_opt_in = 0 WHERE id = ? AND phone IS NULL').bind(s.accountId).run();
    }
  }

  const row = await env.DB.prepare('SELECT email_opt_in, phone, sms_opt_in FROM account WHERE id = ?')
    .bind(s.accountId).first() as any;
  return json({
    ok: true,
    emailOptIn: !!(row && row.email_opt_in),
    phone: (row && row.phone) || null,
    smsOptIn: !!(row && row.sms_opt_in),
    emailConsent: EMAIL_CONSENT,
    smsConsent: SMS_CONSENT
  });
}
