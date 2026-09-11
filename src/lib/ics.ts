/* THE ALERT BELL'S CALENDAR EVENT.
 *
 * Jason, 2026-09-11: an alert bell on each game card, then "yes, calendar for
 * now". A real push needs a service worker, a stored subscription and a sender,
 * and none of the three exists yet. A calendar event with a 15-minute alarm is
 * the alert every phone already knows how to deliver, with nothing to run.
 *
 * Built from the query the bell's link carries, so the Worker needs no game
 * lookup. Everything the client supplies is bounded: the title and venue are
 * length-capped and stripped of control characters, the start must be a
 * plausible kickoff, the game key must look like one - and the link back into
 * the app is built HERE from that key, never taken from the request, so this
 * cannot be used to mint a calendar file that points somewhere else.
 */

export const ICS_ALARM_MINUTES = 15;
export const ICS_GAME_HOURS = 3.5;

const KEY_RE = /^(nfl|college-football):\d{1,15}$/;
const DAY = 86_400_000;

export interface IcsEvent { body: string; filename: string; }

function clean(s: string, max: number): string {
  return s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/* RFC 5545 text: backslash, semicolon and comma are escaped. */
function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

function stamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/* Content lines are folded at 75 octets: CRLF, then a single space. */
function fold(line: string): string {
  if (line.length <= 73) return line;
  const out = [line.slice(0, 73)];
  for (let i = 73; i < line.length; i += 72) out.push(' ' + line.slice(i, i + 72));
  return out.join('\r\n');
}

export function icsFromQuery(q: URLSearchParams, now: number): IcsEvent | null {
  const title = clean(q.get('t') || '', 120);
  const start = Number(q.get('s'));
  const key = q.get('g') || '';
  const venue = clean(q.get('l') || '', 120);
  if (!title || !KEY_RE.test(key)) return null;
  if (!Number.isFinite(start) || start < now - DAY || start > now + 90 * DAY) return null;

  const link = 'https://anygiven.app/?game=' + key;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Any Given//anygiven.app//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:' + key.replace(':', '-') + '@anygiven.app',
    'DTSTAMP:' + stamp(now),
    'DTSTART:' + stamp(start),
    'DTEND:' + stamp(start + ICS_GAME_HOURS * 3_600_000),
    'SUMMARY:' + esc(title),
    'DESCRIPTION:' + esc('Call it live on Any Given: ' + link),
    'URL:' + link
  ];
  if (venue) lines.push('LOCATION:' + esc(venue));
  lines.push(
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'TRIGGER:-PT' + ICS_ALARM_MINUTES + 'M',
    'DESCRIPTION:' + esc(title + ' kicks off in ' + ICS_ALARM_MINUTES + ' minutes'),
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  );
  const filename = (title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'game') + '.ics';
  return { body: lines.map(fold).join('\r\n') + '\r\n', filename };
}
