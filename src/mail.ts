/* ONE WAY TO SEND AN EMAIL. It was a sign-in-code function with the subject and
 * text written into it (src/auth.ts sendCode); group invites and messages need the
 * same sender with their own words, so the transport lives here once.
 *
 * MailerSend first (MAILERSEND_API_KEY, MAIL_FROM_EMAIL), Resend as the fallback
 * (RESEND_API_KEY, MAIL_FROM) - the order and the reasoning are recorded at
 * sendCode in src/auth.ts. Plain text only. Never a reply-to: a group message goes
 * out from Any Given, so no member's address reaches another member. */
export function mailerReady(env: any): boolean {
  return !!(env && (env.MAILERSEND_API_KEY || env.RESEND_API_KEY));
}

export async function sendMail(env: any, to: string, subject: string, text: string): Promise<boolean> {
  if (!mailerReady(env)) return false;
  try {
    if (env.MAILERSEND_API_KEY) {
      const r = await fetch('https://api.mailersend.com/v1/email', {
        method: 'POST',
        headers: { authorization: `Bearer ${env.MAILERSEND_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: { email: env.MAIL_FROM_EMAIL || 'codes@anygiven.app', name: 'Any Given' },
          to: [{ email: to }],
          subject, text
        })
      });
      return r.ok;
    }
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.MAIL_FROM || 'Any Given <codes@anygiven.app>', to: [to], subject, text })
    });
    return r.ok;
  } catch {
    return false;
  }
}
