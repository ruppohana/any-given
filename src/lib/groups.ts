/* GROUP POOLS - the pure half. Codes, cleaning, the words of the two emails, and
 * the limits. No database, no network: src/groups.ts does that and calls these, so
 * every rule a person can hit is testable on its own (tests/groups.test.mjs).
 *
 * Jason, 2026-09-11: start a group with a name and invite people to it, invite
 * only; the commissioner sets the rules, sends invites, removes members and is
 * "responsible to kindness"; any member can email the commissioner or the group,
 * and addresses stay private ("sure" to sending it through Any Given).
 */

/* The shipped invite-code alphabet (no vowels, no 0/O/1/I) - conflict #13 in the
 * wiki holds the Crockford alternative open; this does not decide it. */
export const CODE_ALPHABET = '23456789BCDFGHJKLMNPQRSTVWXYZ';

export const LIMITS = {
  /** invite emails a group may send per rolling day */
  invitesPerDay: 50,
  /** addresses in one invite batch */
  invitesPerBatch: 20,
  /** messages one member may send in one group per rolling day */
  messagesPerDay: 10,
  /** characters in a message */
  messageMax: 1000,
  /** members in a group */
  membersMax: 200,
  /** characters in a group name */
  nameMax: 40
};

/** The line the commissioner accepts when starting a group. */
export const KINDNESS =
  'As commissioner I keep this group kind. I can remove anyone who makes it unkind, and I will.';

export function newCode(rand: () => number = Math.random): string {
  let c = '';
  for (let i = 0; i < 6; i++) c += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  return c;
}

/** Whatever case and spacing a keyboard produced, as the stored code. */
export function normCode(c: unknown): string {
  return String(c ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

export function cleanName(n: unknown, max = LIMITS.nameMax): string {
  return String(n ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

const EMAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/;

/** Emails from an array or a pasted list (commas, spaces, new lines). Lowercased,
 *  de-duplicated, capped at `max`; anything that is not an address is returned in
 *  `bad` so the screen can say which. */
export function parseEmails(list: unknown, max = LIMITS.invitesPerBatch): { ok: string[]; bad: string[] } {
  const raw = Array.isArray(list) ? list.map(String) : String(list ?? '').split(/[\s,;]+/);
  const ok: string[] = [];
  const bad: string[] = [];
  for (const r of raw) {
    const e = r.trim().toLowerCase();
    if (!e) continue;
    if (e.length <= 254 && EMAIL.test(e)) { if (!ok.includes(e)) ok.push(e); } else if (!bad.includes(r.trim())) bad.push(r.trim());
  }
  return { ok: ok.slice(0, max), bad };
}

/** A message body: control characters out (new lines kept), no runs of blank
 *  lines, trimmed, capped. */
export function cleanBody(b: unknown, max = LIMITS.messageMax): string {
  return String(b ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

export interface Mail { subject: string; text: string; }

const FOOTER =
  'This came through Any Given, so nobody\'s email address is shown to anyone else.';

export function inviteMail(o: { groupName: string; fromHandle: string; link: string }): Mail {
  return {
    subject: `@${o.fromHandle} invited you to ${o.groupName} on Any Given`,
    text:
      `@${o.fromHandle} invited you to their group, ${o.groupName}, on Any Given.\n\n` +
      `Pick the winners each week, scored in points. Nothing is staked.\n\n` +
      `Join here: ${o.link}\n\n` +
      `If you weren't expecting this, you can ignore it.\n\n${FOOTER}`
  };
}

export function messageMail(o: { groupName: string; fromHandle: string; to: 'commish' | 'group'; body: string; link: string }): Mail {
  const where = o.to === 'commish' ? `to you, the commissioner of ${o.groupName}` : `to everyone in ${o.groupName}`;
  return {
    subject: o.to === 'commish'
      ? `@${o.fromHandle} wrote to the commissioner of ${o.groupName}`
      : `@${o.fromHandle} wrote to ${o.groupName}`,
    text:
      `@${o.fromHandle} wrote ${where}:\n\n${o.body}\n\n` +
      `Reply from the group page in Any Given: ${o.link}\n\n${FOOTER}`
  };
}
