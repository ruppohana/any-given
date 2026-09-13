/* REMINDERS AND THE OPT-INS.
 *
 * Jason, 2026-09-12: "add reminders to your calendar", "we need to collect
 * emails", "grab their phone number as well", "opt in to texts".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { icsDeadline, ICS_DEADLINE_ALARM_MINUTES } from '../src/lib/ics.ts';
import { cleanPhone, SMS_CONSENT, EMAIL_CONSENT } from '../src/lib/contact.ts';

const NOW = Date.parse('2026-09-12T20:00:00Z');
const q = (o) => new URLSearchParams(o);

test('a group deadline is an event at the first game with an alarm an hour before', () => {
  const start = Date.parse('2026-09-13T17:00:00Z');
  const ev = icsDeadline(q({ g: 'bcd234', n: 'The Fourth Floor', s: String(start) }), NOW);
  assert.ok(ev);
  assert.match(ev.body, /DTSTART:20260913T170000Z/);
  assert.match(ev.body, /SUMMARY:Picks lock - The Fourth Floor/);
  assert.match(ev.body, /URL:https:\/\/anygiven\.app\/\?pool=BCD234/, 'the link is built from the code, uppercased');
  assert.match(ev.body, new RegExp('TRIGGER:-PT' + ICS_DEADLINE_ALARM_MINUTES + 'M'));
  assert.equal(ev.filename, 'picks-lock-bcd234.ics');
  assert.ok(ev.body.includes('\r\n'), 'calendar lines end in CRLF');
});

test('a deadline refuses a bad code, no name, or an implausible time', () => {
  const s = String(Date.parse('2026-09-13T17:00:00Z'));
  assert.equal(icsDeadline(q({ g: 'x', n: 'A', s }), NOW), null);
  assert.equal(icsDeadline(q({ g: 'BCD234', n: '', s }), NOW), null);
  assert.equal(icsDeadline(q({ g: 'BCD234', n: 'A', s: String(NOW + 200 * 86400000) }), NOW), null);
  assert.equal(icsDeadline(q({ g: 'https://evil.example', n: 'A', s }), NOW), null, 'the link cannot be pointed elsewhere');
});

test('a phone number is kept in one shape, or not at all', () => {
  assert.equal(cleanPhone('(555) 234-5678'), '+15552345678');
  assert.equal(cleanPhone('1-555-234-5678'), '+15552345678');
  assert.equal(cleanPhone('+44 20 7946 0958'), '+442079460958');
  assert.equal(cleanPhone('12345'), null);
  assert.equal(cleanPhone(''), null);
  assert.equal(cleanPhone(null), null);
});

test('the sign-in sheet shows the stored consent words, word for word', async () => {
  const { readFileSync } = await import('node:fs');
  const SI = readFileSync(new URL('../public/components/signin.js', import.meta.url), 'utf8');
  assert.ok(SI.includes("'" + EMAIL_CONSENT + "'"), 'email consent matches src/lib/contact.ts');
  assert.ok(SI.includes("'" + SMS_CONSENT + "'"), 'text consent matches src/lib/contact.ts');
  assert.ok(SI.includes("fetch('/api/contact'"), 'the opt-ins are saved');
  assert.ok(SI.includes("c.type = 'checkbox';") && !SI.includes('c.checked = true'), 'the boxes start unticked');
});

test('the text consent says what a carrier requires, and that it is not needed to play', () => {
  assert.match(SMS_CONSENT, /Msg & data rates may apply/);
  assert.match(SMS_CONSENT, /Reply STOP/);
  assert.match(SMS_CONSENT, /Not needed to play/);
  assert.match(EMAIL_CONSENT, /Unsubscribe/);
});
