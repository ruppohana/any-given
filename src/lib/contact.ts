/* CONTACT - the email and text opt-ins, and a phone number cleaned to one shape.
 *
 * Jason, 2026-09-12: "we need to collect emails", "grab their phone number as
 * well", "can we have them send verification via text? and opt in to texts?"
 *
 * The email is already the account (migrations/0005 - required, verified by a
 * code). These record CONSENT to be sent more than sign-in and group mail, and
 * an optional phone. 🔴 NOTHING HERE SENDS A TEXT: that needs an SMS provider
 * and US 10DLC registration, both Jason's to set up. Until then the number and
 * the consent are simply kept, so the day texting starts it starts with people
 * who asked for it.
 *
 * 🔴 CONSENT IS NEVER A CONDITION OF PLAYING, and the boxes start unticked. A
 * pre-ticked box is not consent, and a text program needs express written
 * consent with the rates line and STOP in it (TCPA / carrier rules).
 */

export const EMAIL_CONSENT =
  'Email me a reminder before my picks lock, and news from Any Given. Unsubscribe any time.';
export const SMS_CONSENT =
  'Text me reminders from Any Given at this number. Up to 4 a week. Msg & data rates may apply. Reply STOP to stop. Not needed to play.';

/** A US or international number as +<digits>, or null. Ten digits is a US
 *  number; eleven starting with 1 is too; anything with a + keeps its country. */
export function cleanPhone(p: unknown): string | null {
  const raw = String(p ?? '').trim();
  if (!raw) return null;
  const plus = raw.startsWith('+');
  const d = [...raw].filter((c) => c >= '0' && c <= '9').join('');
  if (plus) return d.length >= 8 && d.length <= 15 ? '+' + d : null;
  if (d.length === 10 && d[0] !== '0' && d[0] !== '1') return '+1' + d;
  if (d.length === 11 && d[0] === '1') return '+' + d;
  return null;
}
