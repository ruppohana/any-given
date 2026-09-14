/* WHEN AN OFF-SEASON POOL HAS GAMES AGAIN - the countdown on a day sport's pool page.
 * Jason, 2026-09-13: "dont ask do any that appear valid. if any are out of season put a
 * countdown clock on the page."
 *
 * The Worker reads ESPN's own season calendar (src/season-next.ts):
 *
 *   GET /api/season/next?sport=<day sport>   { sport, label, nextAt }   nextAt null: nothing on the calendar
 *
 * and this block says it on the page a Home tile opens - the #/pool browse view, a day
 * sport's group slate, All games - when the day shown has no games: "The NBA is back
 * Sat, Oct 3 · in 20 days", or "No games on the calendar yet". Games today or in the next
 * two days are the day bar's to show, so then it says nothing.
 *
 * 🔴 LOADED WITH import(), NEVER AN IMPORT LINE. The p2 tests load the slate with its
 * import lines stripped and every imported name installed by hand; this block is extra
 * to the empty state, so where it cannot load (a test, a failed fetch) the empty state
 * stands exactly as it was.
 *
 * The day count is src/lib/upcoming.ts countdownText's - by calendar day in the phone's
 * own time zone, so it changes at midnight - restated here because a browser component
 * cannot import a module a Node test can also load by path. tests/season-countdown.test.mjs
 * holds the two equal. */

/** What the sentence calls each league - "The NBA is back", "College hockey is back". */
export const SEASON_NAMES = {
  nba: 'The NBA', wnba: 'The WNBA', mlb: 'MLB', nhl: 'The NHL',
  'mens-college-basketball': 'College basketball', 'womens-college-basketball': 'Women’s college basketball',
  'mens-college-hockey': 'College hockey', 'womens-college-volleyball': 'Women’s college volleyball',
  epl: 'The Premier League', mls: 'MLS', nwsl: 'The NWSL', ucl: 'The Champions League',
  laliga: 'La Liga', ligamx: 'Liga MX', ufc: 'The UFC', 'golf-cup': 'The Presidents Cup'
};

/** Games this many days out or more are a season away, not a day away. */
export const SEASON_SOON_DAYS = 3;

/** The calendar day ESPN listed, 'YYYY-MM-DD'. Its calendar marks a day at 07:00Z or 08:00Z
 *  (midnight Pacific), so the UTC date is the day it means wherever the phone is. */
export function seasonDay(nextAt) {
  if (nextAt == null || !Number.isFinite(Number(nextAt))) return null;
  return new Date(Number(nextAt)).toISOString().slice(0, 10);
}

/** Whole calendar days from the phone's today to `iso` - countdownText's count. */
export function seasonDaysUntil(iso, now, tz) {
  const fmt = (t) => new Date(t).toLocaleDateString('en-CA', tz ? { timeZone: tz } : {});
  const today = Date.parse(fmt(now) + 'T00:00:00Z');
  const day = Date.parse(iso + 'T00:00:00Z');
  return Math.round((day - today) / 86400000);
}

/** "in 20 days", "tomorrow", "today" - countdownText's words. */
export function seasonDaysText(iso, now, tz) {
  const n = seasonDaysUntil(iso, now, tz);
  if (n <= 0) return 'today';
  if (n === 1) return 'tomorrow';
  return 'in ' + n.toLocaleString('en-US') + ' days';
}

/** "Sat, Oct 3" - the listed day, the same on every phone. */
export function seasonDateLabel(iso) {
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** What the block says, or null when it should say nothing (games within two days).
 *  { head, count, text } - text is the whole sentence. */
export function seasonLine(sport, label, nextAt, now = Date.now(), tz) {
  if (nextAt == null) return { head: 'No games on the calendar yet', count: '', text: 'No games on the calendar yet' };
  const iso = seasonDay(nextAt);
  if (!iso) return null;
  if (seasonDaysUntil(iso, now, tz) < SEASON_SOON_DAYS) return null;
  const head = (SEASON_NAMES[sport] || label || 'The pool') + ' is back ' + seasonDateLabel(iso);
  const count = seasonDaysText(iso, now, tz);
  return { head, count, text: head + ' · ' + count };
}

/** The Worker's answer, or null: not a day sport (404), offline, or a bad reply. */
export async function seasonNext(sport) {
  try {
    const f = (typeof window !== 'undefined' && window.agApiFetch) || fetch;
    const r = await f('/api/season/next?sport=' + encodeURIComponent(sport));
    if (!r || !r.ok) return null;
    const j = await r.json();
    return j && typeof j === 'object' && 'nextAt' in j ? j : null;
  } catch { return null; }
}

export const SEASON_CSS = `
.ag-season { display: grid; gap: 2px; margin: 0 0 12px; padding: 14px 16px;
  background: var(--card); border: 1px solid var(--line); border-left: 4px solid var(--accent);
  border-radius: var(--radius-card); color: var(--fg); }
.ag-season[hidden] { display: none; }
.ag-season-k { margin: 0; font-size: var(--t-micro); font-weight: 800; letter-spacing: .06em;
  text-transform: uppercase; color: var(--dim); }
.ag-season-h { margin: 0; font-size: var(--t-emph); font-weight: 800; line-height: 1.3; overflow-wrap: anywhere; }
.ag-season-n { color: var(--accent); white-space: nowrap; }
`;

function ensureCss() {
  if (typeof document === 'undefined' || !document.head || document.getElementById('ag-season-css')) return;
  const s = document.createElement('style');
  s.id = 'ag-season-css';
  s.textContent = SEASON_CSS;
  document.head.appendChild(s);
}

/** Fill `box` (drawn hidden by the page) once the Worker answers; leave it hidden when
 *  there is nothing to say. Returns the line said, or null. */
export async function fillSeason(box, sport, now) {
  if (!box) return null;
  const info = await seasonNext(sport);
  if (!info) return null;
  const line = seasonLine(sport, info.label, info.nextAt, now == null ? Date.now() : now);
  if (!line || !box.isConnected) return null;
  ensureCss();
  box.textContent = '';
  box.classList.add('ag-season');
  box.setAttribute('role', 'status');
  box.dataset.sport = sport;
  const k = document.createElement('p');
  k.className = 'ag-season-k';
  k.textContent = info.nextAt == null ? 'Off season' : 'Between seasons';
  box.appendChild(k);
  const h = document.createElement('p');
  h.className = 'ag-season-h';
  h.textContent = line.head;
  if (line.count) {
    h.appendChild(document.createTextNode(' · '));
    const n = document.createElement('span');
    n.className = 'ag-season-n';
    n.textContent = line.count;
    h.appendChild(n);
  }
  box.appendChild(h);
  box.hidden = false;
  return line.text;
}
