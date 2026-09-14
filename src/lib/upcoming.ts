/* WHAT IS COMING - the out-of-season events Home counts down to. Jason, 2026-09-13: "dont ask
 * do any that appear valid. if any are out of season put a countdown clock on the page."
 *
 * Every event from the vault's viewership list (Swing Route/Any Given/wiki/
 * missing-by-viewership-2026-09-13.md) that clears the bar but is not in season yet. A dated one
 * gets a live countdown on Home; one whose date is not announced shows when it is expected
 * ("June 2027"). An event leaves the list on its day - by then it is a pool, or it will be.
 * The app never says the NFL's championship game's name: it is "the Big Game".
 *
 * Shared by the browser (Home) and the tests. Dates are the day in the event's own time zone,
 * stored as noon UTC so no zone moves them to another day.
 */
import { templatesOpen } from './props.ts';

export type Upcoming = {
  id: string; label: string; tab: 'sports' | 'nonsports';
  date: string | null;       // 'YYYY-MM-DD', or null when not announced
  when: string;              // what Home says when there is no date, and the source's wording
  set?: string;              // the ready set that replaces this countdown once it opens
};

export const UPCOMING: Upcoming[] = [
  /* Sports */
  /* Its ready set (src/lib/props.ts 'breeders-cup-2026') is built once the fields are drawn in
     late October; from then the set's tile stands in for this countdown. */
  { id: 'breeders-cup', label: "Breeders' Cup", tab: 'sports', date: '2026-10-30', when: 'Oct 30–31, 2026', set: 'breeders-cup-2026' },
  { id: 'australian-open', label: 'Australian Open', tab: 'sports', date: '2027-01-11', when: 'Jan 11–31, 2027' },
  /* Its ready set is built (src/lib/props.ts 'big-game-props-2027'), so while that set is open
     its own row on the Sports tab stands in for this countdown. */
  { id: 'big-game-props', label: 'Big Game props', tab: 'sports', date: '2027-02-14', when: 'Feb 14, 2027', set: 'big-game-props-2027' },
  { id: 'masters', label: 'The Masters', tab: 'sports', date: '2027-04-08', when: 'Apr 8–11, 2027' },
  { id: 'nfl-draft', label: 'NFL Draft', tab: 'sports', date: '2027-04-29', when: 'Apr 29–May 1, 2027' },
  { id: 'kentucky-derby', label: 'Kentucky Derby', tab: 'sports', date: '2027-05-01', when: 'May 1, 2027' },
  { id: 'indy-500', label: 'Indy 500', tab: 'sports', date: '2027-05-30', when: 'May 30, 2027' },
  { id: 'womens-world-cup', label: "Women's World Cup", tab: 'sports', date: '2027-06-24', when: 'Jun 24–Jul 25, 2027' },
  { id: 'llws', label: 'Little League World Series', tab: 'sports', date: '2027-08-18', when: 'Aug 18–29, 2027' },
  { id: 'olympics', label: 'Olympics', tab: 'sports', date: '2028-07-14', when: 'LA28, Jul 14–30, 2028' },
  { id: 'wrestlemania', label: 'WrestleMania 43', tab: 'sports', date: null, when: 'April 2027' },
  { id: 'nba-draft', label: 'NBA Draft', tab: 'sports', date: null, when: 'June 2027' },
  { id: 'gold-cup', label: 'Gold Cup', tab: 'sports', date: null, when: 'June–July 2027' },
  { id: 'mcws', label: "Men's College World Series", tab: 'sports', date: null, when: 'June 2027' },
  { id: 'wcws', label: "Women's College World Series", tab: 'sports', date: null, when: 'June 2027' },
  { id: 'world-cup', label: 'FIFA World Cup', tab: 'sports', date: null, when: '2030' },
  /* Non-sports */
  { id: 'golden-globes', label: 'Golden Globes', tab: 'nonsports', date: '2027-01-10', when: 'Jan 10, 2027' },
  { id: 'grammys', label: 'Grammys', tab: 'nonsports', date: '2027-02-07', when: 'Feb 7, 2027' },
  { id: 'oscars', label: 'The Oscars', tab: 'nonsports', date: '2027-03-14', when: 'Mar 14, 2027' },
  { id: 'nathans', label: "Nathan's Hot Dog Eating Contest", tab: 'nonsports', date: '2027-07-04', when: 'Jul 4, 2027' },
  { id: 'tonys', label: 'Tony Awards', tab: 'nonsports', date: null, when: 'June 2027' },
  { id: 'the-bachelor', label: 'The Bachelor', tab: 'nonsports', date: null, when: '2027' }
];

/** The day an event starts, as ms at noon UTC; null when not announced. */
export const upcomingAt = (u: Upcoming): number | null => {
  if (!u.date) return null;
  const [y, m, d] = u.date.split('-').map(Number);
  return Date.UTC(y, m - 1, d, 12);
};

/** A tab's coming events at `now`: dated ones still ahead, soonest first, then the undated
 *  ones in list order. An event leaves on its day. */
export function upcomingOn(tab: 'sports' | 'nonsports', now: number,
  openSets: string[] = templatesOpen(now).map((t) => t.id)): Upcoming[] {
  /* A countdown whose ready set is open steps aside: the set's own tile is on Home now. */
  const mine = UPCOMING.filter((u) => u.tab === tab && !(u.set && openSets.includes(u.set)));
  const dated = mine.filter((u) => u.date && (upcomingAt(u) as number) + 12 * 3600 * 1000 > now)
    .sort((a, b) => (upcomingAt(a) as number) - (upcomingAt(b) as number));
  return [...dated, ...mine.filter((u) => !u.date)];
}

/** "in 47 days", "tomorrow", "today"; null for an undated one. By calendar day, so the count
 *  changes at midnight, not at noon UTC. `tz` is for the tests; the phone uses its own. */
export function countdownText(u: Upcoming, now: number, tz?: string): string | null {
  if (!u.date) return null;
  const fmt = (t: number) => new Date(t).toLocaleDateString('en-CA', tz ? { timeZone: tz } : {});
  const today = Date.parse(fmt(now) + 'T00:00:00Z');
  const day = Date.parse(u.date + 'T00:00:00Z');
  const n = Math.round((day - today) / 86400000);
  if (n <= 0) return 'today';
  if (n === 1) return 'tomorrow';
  return 'in ' + n.toLocaleString('en-US') + ' days';
}
