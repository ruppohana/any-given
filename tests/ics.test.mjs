/* The alert bell's calendar event - src/lib/ics.ts. Jason, 2026-09-11: "yes,
 * calendar for now". What a phone's calendar will reject silently is the thing
 * to pin: CRLF line breaks, 75-octet folding, UTC stamps, the alarm, escaping -
 * and what the endpoint must refuse, since it is unauthenticated. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { icsFromQuery, ICS_ALARM_MINUTES } from '../src/lib/ics.ts';

const NOW = Date.parse('2026-09-11T08:00:00Z');
const KICK = Date.parse('2026-09-13T17:00:00Z');   // 10:00 AM Pacific, Sunday
const q = (o) => new URLSearchParams(o);

test('one game becomes one event: kickoff, 3.5h, a 15-minute alarm, CRLF', () => {
  const ev = icsFromQuery(q({ t: 'Saints at Lions', s: String(KICK), g: 'nfl:401772901', l: 'Ford Field' }), NOW);
  assert.ok(ev, 'a valid game was refused');
  assert.match(ev.body, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ev.body, /\r\nDTSTART:20260913T170000Z\r\n/);
  assert.match(ev.body, /\r\nDTEND:20260913T203000Z\r\n/);
  assert.match(ev.body, /\r\nSUMMARY:Saints at Lions\r\n/);
  assert.match(ev.body, /\r\nLOCATION:Ford Field\r\n/);
  assert.match(ev.body, /\r\nTRIGGER:-PT15M\r\n/);
  assert.equal(ICS_ALARM_MINUTES, 15);
  assert.match(ev.body, /END:VCALENDAR\r\n$/);
  assert.ok(!/[^\r]\n/.test(ev.body), 'a bare LF - calendars want CRLF');
  assert.equal(ev.filename, 'saints-at-lions.ics');
});

test('the link back is built from the key, never taken from the request', () => {
  const ev = icsFromQuery(q({ t: 'X at Y', s: String(KICK), g: 'college-football:401856664', u: 'https://evil.example' }), NOW);
  const unfolded = ev.body.replace(/\r\n /g, '');
  assert.match(unfolded, /\r\nURL:https:\/\/anygiven\.app\/\?game=college-football:401856664\r\n/);
  assert.ok(!unfolded.includes('evil.example'));
});

test('every content line fits 75 octets once folded', () => {
  const ev = icsFromQuery(q({ t: 'A'.repeat(120), s: String(KICK), g: 'college-football:401856664' }), NOW);
  for (const line of ev.body.split('\r\n')) assert.ok(line.length <= 75, 'unfolded: ' + line.length);
});

test('commas and semicolons are escaped; control characters are stripped', () => {
  const ev = icsFromQuery(q({ t: 'Bears, at; Panthers\nX', s: String(KICK), g: 'nfl:1' }), NOW);
  assert.match(ev.body, /\r\nSUMMARY:Bears\\, at\\; Panthers X\r\n/);
});

test('refuses what is not a game', () => {
  const ok = { t: 'A at B', s: String(KICK), g: 'nfl:401772901' };
  assert.equal(icsFromQuery(q({ ...ok, t: '' }), NOW), null, 'no title');
  assert.equal(icsFromQuery(q({ ...ok, g: 'nba:1' }), NOW), null, 'not a league we carry');
  assert.equal(icsFromQuery(q({ ...ok, g: 'nfl:abc' }), NOW), null, 'not a game id');
  assert.equal(icsFromQuery(q({ ...ok, s: 'soon' }), NOW), null, 'no start');
  assert.equal(icsFromQuery(q({ ...ok, s: String(NOW + 200 * 86400000) }), NOW), null, 'too far out');
  assert.equal(icsFromQuery(q({ ...ok, s: String(NOW - 3 * 86400000) }), NOW), null, 'long past');
});
