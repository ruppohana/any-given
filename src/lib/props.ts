/* QUESTIONS POOLS - the pure half. Jason, 2026-09-13: "add cricket too, and non
 * sports, golf, oscars, everything damn it that hits a certain viewship."
 *
 * A 'props' group plays questions: the commissioner writes them - or loads a ready
 * set, like the Emmys below - everyone picks one option per question before it
 * locks, and the commissioner enters the answer. A right answer scores the
 * question's points; a question answered 'void' scores nobody (the one void path,
 * as everywhere else in the app). Points, never anything of value.
 *
 * Shared by the Worker (src/props-pool.ts) and the browser, so both clean a
 * question and score a card the same way.
 */

export type PropQuestion = {
  qid: string; position: number; text: string; options: string[];
  points: number; lockAt: number; answer: string | null;
};

export const PROPS_LIMITS = { questions: 60, options: 20, text: 140, option: 80, pointsMax: 10 };
export const VOID = 'void';

const clip = (v: unknown, n: number) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);

/** A question as the pool will store it, or null when it cannot be one: text,
 *  2-20 distinct options, points 1-10, a lock time. Whatever a phone sent. */
export function cleanQuestion(q: any, now: number): Omit<PropQuestion, 'qid' | 'position' | 'answer'> | null {
  if (!q || typeof q !== 'object') return null;
  const text = clip(q.text, PROPS_LIMITS.text);
  if (!text) return null;
  const seen = new Set<string>();
  const options: string[] = [];
  for (const o of Array.isArray(q.options) ? q.options : []) {
    const s = clip(o, PROPS_LIMITS.option);
    if (!s || s.toLowerCase() === VOID || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    options.push(s);
    if (options.length === PROPS_LIMITS.options) break;
  }
  if (options.length < 2) return null;
  const p = Math.round(Number(q.points));
  const points = Number.isFinite(p) && p >= 1 ? Math.min(p, PROPS_LIMITS.pointsMax) : 1;
  const lockAt = Math.round(Number(q.lockAt));
  if (!Number.isFinite(lockAt) || lockAt <= 0) return null;
  return { text, options, points, lockAt: Math.max(lockAt, 0) };
}

/** Is a question still open for picks at `now`? The server's clock only. */
export const isOpen = (q: { lockAt: number }, now: number) => now < q.lockAt;

/** A person's points on a set of questions: the points of every settled question
 *  whose answer is the option they picked. 'void' and unsettled score nothing. */
export function scoreProps(questions: PropQuestion[], picks: Record<string, string>) {
  let points = 0, correct = 0, settled = 0;
  for (const q of questions) {
    if (q.answer == null || q.answer === VOID) continue;
    settled++;
    if (picks[q.qid] === q.answer) { points += q.points; correct++; }
  }
  return { points, correct, settled };
}

/* ------------------------------------------------------------ ready sets */

/* 🔴 THE 78TH PRIMETIME EMMY AWARDS - Monday, September 14, 2026, 8 PM ET / 5 PM PT,
 * NBC and Peacock, hosted by Mariska Hargitay. Nominees as Wikipedia's
 * "78th Primetime Emmy Awards" page lists them, read 2026-09-13. Every question
 * locks at the start of the broadcast: 2026-09-15T00:00:00Z. The big three are
 * worth 3; the acting awards 2; the rest 1. */
const EMMYS_2026_LOCK = Date.UTC(2026, 8, 15, 0, 0, 0);
/* 🔴 EACH QUESTION'S `key` IS THE CATEGORY HEADING ON THE WIKIPEDIA PAGE - the settler
   (src/props-settle-run.ts) reads the winner under it. Checked against the real 78th
   page the night before (tests/props-settle.test.mjs). */
const EMMY_KEYS: Record<string, string> = {
  'Lead Actor, Drama': 'Outstanding Lead Actor in a Drama Series',
  'Lead Actress, Drama': 'Outstanding Lead Actress in a Drama Series',
  'Lead Actor, Comedy': 'Outstanding Lead Actor in a Comedy Series',
  'Lead Actress, Comedy': 'Outstanding Lead Actress in a Comedy Series',
  'Lead Actor, Limited Series or Movie': 'Outstanding Lead Actor in a Limited or Anthology Series or Movie',
  'Lead Actress, Limited Series or Movie': 'Outstanding Lead Actress in a Limited or Anthology Series or Movie',
  'Supporting Actor, Drama': 'Outstanding Supporting Actor in a Drama Series',
  'Supporting Actress, Drama': 'Outstanding Supporting Actress in a Drama Series',
  'Supporting Actor, Comedy': 'Outstanding Supporting Actor in a Comedy Series',
  'Supporting Actress, Comedy': 'Outstanding Supporting Actress in a Comedy Series'
};
const e = (text: string, points: number, options: string[]) =>
  ({ text, points, options, lockAt: EMMYS_2026_LOCK, key: EMMY_KEYS[text] || text });

const SURVIVOR_51 = ['Rob Antonson', 'Brady Booker', 'Patt Cannaday', 'Linnea Capobianco', 'Cristian Chavez',
  'Sharonda Cox', 'Jenna Doore', 'Kristin Flickinger', 'Ori Jean-Charles', 'Lewis Kelly', 'Danny Kilby',
  'Carter Krull', 'Alexis Levine', 'Angelica "Jelly" Loblack', 'Eric Macksoud', 'Maggie Nestor',
  'Thien An Nguyen', 'Mike Pinsky', 'Aaliyah Puglia', 'Ana Sani', 'Devin Way'];

const TRAITORS_NB = ['Tomica Adams', 'Shane Beatty', 'Abbey Benjamin', 'Morgan Cook', 'Kim Daily', 'Katie Fites',
  'Michael Foote', 'Wyatt Gillespie', 'Niyyah Hayes', 'Madeline Kostopulos', 'Sherry Kuehl', 'Abby Lee', 'Kriste Lewis',
  'Ben McDonnell', 'Clyde Moser', 'Xavier Scruggs', 'Logan Smith', 'Arisa Thomas', 'Joe Vanella', 'Jay Vinnedge',
  'Victor Vollbrechthausen', 'Mark Zgoda'];

const DWTS_35 = ['Tatyana Ali', 'Tyler Cameron', 'Giada De Laurentiis', 'Jenna Dewan', 'Ezra Frech', 'Amber Glenn',
  'Taylor Hanson', 'Maura Higgins', 'Conner Leavitt', 'Ciara Miller', 'Sarah Jane Nader', 'Jackson Olson',
  'Guillermo Rodriguez', 'Harry Shum Jr.', 'Julia Stiles', 'Connor Wood'];

/* Big Brother 28's HouseGuests as its Wikipedia page lists them, read 2026-09-13: the seven
   still in the house, then the ten evicted or eliminated. */
const BB_28_IN = ['Barrett Pfeiffer', 'Dee Valladares', 'Drew Campbell', 'Melody Morris', 'Rick Devens', 'Taylor Brown', 'Yash Patel'];
const BB_28_ALL = [...BB_28_IN, 'Angela Murray', 'La Trice Verrett', 'Haley Thogmartin', 'Mallory Aurichio', 'Kamu Kirk',
  'Chuk Anyanwu', 'Lyric Medeiros', 'Jason De Puy', 'Rome Seymour', 'Ashley Trail'];

export const PROP_TEMPLATES: Record<string, { id: string; name: string; when: string; questions: any[]; source?: { kind: string; page: string } }> = {
  'emmys-2026': {
    id: 'emmys-2026',
    name: 'The 2026 Emmys',
    when: 'Monday, September 14 · 8 PM ET / 5 PM PT · NBC and Peacock',
    /* Settles itself from the winners Wikipedia's editors mark during the broadcast. */
    source: { kind: 'wiki-awards', page: '78th_Primetime_Emmy_Awards' },
    questions: [
      e('Outstanding Drama Series', 3, ['The Diplomat', 'The Gilded Age', 'A Knight of the Seven Kingdoms', 'Paradise', 'The Pitt', 'Pluribus', 'Slow Horses', 'Your Friends & Neighbors']),
      e('Outstanding Comedy Series', 3, ['Abbott Elementary', 'The Bear', 'Hacks', "Margo's Got Money Troubles", 'Nobody Wants This', 'Only Murders in the Building', 'Shrinking', "Widow's Bay"]),
      e('Outstanding Limited or Anthology Series', 3, ['All Her Fault', 'The Beast in Me', 'Beef', 'DTF St. Louis', 'Love Story: John F. Kennedy Jr. & Carolyn Bessette']),
      e('Lead Actor, Drama', 2, ['Sterling K. Brown, Paradise', 'Gary Oldman, Slow Horses', 'Mark Ruffalo, Task', 'Rufus Sewell, The Diplomat', 'Noah Wyle, The Pitt']),
      e('Lead Actress, Drama', 2, ['Carrie Coon, The Gilded Age', 'Chase Infiniti, The Testaments', 'Keri Russell, The Diplomat', 'Rhea Seehorn, Pluribus', 'Zendaya, Euphoria']),
      e('Lead Actor, Comedy', 2, ['Yahya Abdul-Mateen II, Wonder Man', 'Steve Carell, Rooster', "Matthew Rhys, Widow's Bay", 'Jason Segel, Shrinking', 'Martin Short, Only Murders in the Building']),
      e('Lead Actress, Comedy', 2, ['Quinta Brunson, Abbott Elementary', 'Ayo Edebiri, The Bear', "Elle Fanning, Margo's Got Money Troubles", 'Lisa Kudrow, The Comeback', 'Jean Smart, Hacks']),
      e('Lead Actor, Limited Series or Movie', 2, ['Riz Ahmed, Bait', 'Jason Bateman, Black Rabbit', 'Charlie Hunnam, Monster: The Ed Gein Story', 'Oscar Isaac, Beef', 'Matthew Rhys, The Beast in Me']),
      e('Lead Actress, Limited Series or Movie', 2, ['Claire Danes, The Beast in Me', 'Sally Field, Remarkably Bright Creatures', 'Carey Mulligan, Beef', 'Sarah Pidgeon, Love Story', 'Sarah Snook, All Her Fault']),
      e('Supporting Actor, Drama', 1, ['Patrick Ball, The Pitt', 'Billy Crudup, The Morning Show', 'Shawn Hatosy, The Pitt', 'Gerran Howell, The Pitt', 'Jack Lowden, Slow Horses', 'Tom Pelphrey, Task', 'Carlos Manuel Vesga, Pluribus']),
      e('Supporting Actress, Drama', 1, ['Taylor Dearden, The Pitt', 'Fiona Dourif, The Pitt', 'Allison Janney, The Diplomat', 'Katherine LaNasa, The Pitt', 'Sepideh Moafi, The Pitt', 'Julianne Nicholson, Paradise', 'Karolina Wydra, Pluribus']),
      e('Supporting Actor, Comedy', 1, ['Colman Domingo, The Four Seasons', 'Paul W. Downs, Hacks', 'Harrison Ford, Shrinking', "Nick Offerman, Margo's Got Money Troubles", "Stephen Root, Widow's Bay", 'Michael Urie, Shrinking', 'Tyler James Williams, Abbott Elementary']),
      e('Supporting Actress, Comedy', 1, ["Dale Dickey, Widow's Bay", 'Hannah Einbinder, Hacks', 'Janelle James, Abbott Elementary', "Kate O'Flynn, Widow's Bay", "Michelle Pfeiffer, Margo's Got Money Troubles", 'Megan Stalter, Hacks', 'Jessica Williams, Shrinking']),
      e('Outstanding Reality Competition Program', 1, ['Dancing with the Stars', "RuPaul's Drag Race", 'Survivor', 'Top Chef', 'The Traitors'])
    ]
  },

  /* 🔴 SURVIVOR 51 - premieres Wednesday, September 23, 2026, 8 PM ET / PT on CBS (a
   * two-hour premiere). 21 castaways as Wikipedia's "Survivor 51" page lists them,
   * read 2026-09-13. Both questions lock at the first broadcast: 8 PM Eastern is
   * 2026-09-24T00:00:00Z. Jason asked "is survivor a thing?" - yes: Survivor 50's
   * finale drew 5.8 million. A commissioner adds a weekly "who goes home" question
   * as the season runs. */
  'survivor-51': {
    id: 'survivor-51',
    name: 'Survivor 51',
    when: 'Premieres Wednesday, September 23 · 8 PM · CBS',
    /* Settles from the contestants table's finish column ("1st voted out", "Sole Survivor"). */
    source: { kind: 'wiki-survivor', page: 'Survivor_51' },
    questions: [
      { text: 'Who wins Survivor 51?', points: 5, lockAt: Date.UTC(2026, 8, 24, 0, 0, 0), options: SURVIVOR_51, key: 'winner' },
      { text: 'Who is voted out first?', points: 3, lockAt: Date.UTC(2026, 8, 24, 0, 0, 0), options: SURVIVOR_51, key: 'first-out' }
    ]
  },

  /* 🔴 DANCING WITH THE STARS, SEASON 35 - premieres Tuesday, September 15, 2026, 8 PM ET
   * on ABC and Disney+ (a second episode Wednesday the 16th). 16 celebrities as Wikipedia's
   * season 35 page lists them, read 2026-09-13; the cast was revealed on Good Morning
   * America on September 2. Both questions lock at the premiere: 8 PM Eastern is
   * 2026-09-16T00:00:00Z. Settles from the couples table's status column; a double
   * elimination in the first week voids "eliminated first" (no single pick called it). */
  /* 🔴 THE TRAITORS: NEW BLOOD - Jason, 2026-09-13: "do the traitors ... next". NBC's
   * civilian spinoff: premieres Thursday, September 17, 2026, 8 PM ET (a two-hour
   * episode), hosted by Alan Cumming, 22 contestants as Wikipedia's page lists them, read
   * 2026-09-13. Several players can win, so "who wins" is not one answer - the set asks
   * what is: the first murdered, the first banished (a double murder in one episode
   * voids), and whether a Traitor is among the winners. All lock at the premiere, 8 PM
   * Eastern = 2026-09-18T00:00:00Z. Settles from the contestants table's finish and role
   * columns (checked on the real seasons 3 and 4). */
  'traitors-new-blood': {
    id: 'traitors-new-blood',
    name: 'The Traitors: New Blood',
    when: 'Premieres Thursday, September 17 · 8 PM ET · NBC',
    source: { kind: 'wiki-traitors', page: 'The_Traitors:_New_Blood' },
    questions: [
      { text: 'Who is murdered first?', points: 3, lockAt: Date.UTC(2026, 8, 18, 0, 0, 0), options: TRAITORS_NB, key: 'first-murdered' },
      { text: 'Who is banished first?', points: 3, lockAt: Date.UTC(2026, 8, 18, 0, 0, 0), options: TRAITORS_NB, key: 'first-banished' },
      { text: 'Does a Traitor win?', points: 5, lockAt: Date.UTC(2026, 8, 18, 0, 0, 0), options: ['Yes', 'No'], key: 'traitor-wins' }
    ]
  },

  /* 🔴 THE ROAD WORLD CHAMPIONSHIPS, MONTREAL - Jason, 2026-09-13: "do the cycling worlds
   * next". September 20-27, 2026; the five elite events, each locked at its own start,
   * Eastern Daylight Time (UTC-4) as Wikipedia's schedule gives it, read 2026-09-13: the
   * time trials Sunday the 20th (women 9:00, men 12:45), the mixed relay Tuesday the 22nd
   * (8:30), the road races Saturday the 26th (women, 9:00) and Sunday the 27th (men, 9:00).
   * No start lists are out yet, so each race lists the riders who led last year's results
   * (Kigali 2025, Wikipedia's final classifications) and the obvious names beside them,
   * plus "Someone else", which pays when the winner is nobody listed. Settles from the
   * championships page's medal table (checked on the real 2024 and 2025 pages). */
  'worlds-2026': {
    id: 'worlds-2026',
    name: 'Cycling Worlds 2026',
    when: 'Montréal · September 20–27 · the road races Saturday and Sunday the 26th–27th',
    source: { kind: 'wiki-medals', page: '2026_UCI_Road_World_Championships' },
    questions: [
      { text: "Who wins the women's time trial?", points: 2, lockAt: Date.UTC(2026, 8, 20, 13, 0, 0), key: "Women's time trial",
        options: ['Marlen Reusser', 'Demi Vollering', 'Anna van der Breggen', 'Chloé Dygert', 'Antonia Niedermaier', 'Brodie Chapman', 'Lotte Kopecky', 'Someone else'] },
      { text: "Who wins the men's time trial?", points: 2, lockAt: Date.UTC(2026, 8, 20, 16, 45, 0), key: "Men's time trial",
        options: ['Remco Evenepoel', 'Tadej Pogačar', 'Jay Vine', 'Filippo Ganna', 'Joshua Tarling', 'Ilan Van Wilder', 'Isaac del Toro', 'Someone else'] },
      { text: 'Which nation wins the mixed relay?', points: 1, lockAt: Date.UTC(2026, 8, 22, 12, 30, 0), key: 'relay',
        options: ['Australia', 'Switzerland', 'Germany', 'Italy', 'France', 'Netherlands', 'Great Britain', 'Belgium', 'Canada', 'United States', 'Another nation'] },
      { text: "Who wins the women's road race?", points: 3, lockAt: Date.UTC(2026, 8, 26, 13, 0, 0), key: "Women's road race",
        options: ['Magdeleine Vallieres', 'Demi Vollering', 'Lotte Kopecky', 'Elisa Longo Borghini', 'Kasia Niewiadoma', 'Pauline Ferrand-Prévot', 'Marlen Reusser', 'Niamh Fisher-Black', 'Someone else'] },
      { text: "Who wins the men's road race?", points: 5, lockAt: Date.UTC(2026, 8, 27, 13, 0, 0), key: "Men's road race",
        options: ['Tadej Pogačar', 'Remco Evenepoel', 'Mathieu van der Poel', 'Tom Pidcock', 'Isaac del Toro', 'Juan Ayuso', 'Mattias Skjelmose', 'Ben Healy', 'Wout van Aert', 'Someone else'] }
    ]
  },

  /* 🔴 THE BIG BROTHER 28 FINALE - Jason, 2026-09-13: "do the big brother finale set next".
   * CBS; Wikipedia's "Big Brother 28 (American season)" page, read 2026-09-13: it "is scheduled
   * to conclude on October 1, 2026", finale time TBD - every episode this season aired at 8 PM,
   * so all three lock at 8 PM Eastern, 2026-10-02T00:00:00Z. Seven HouseGuests were still in
   * the house ("Participating") to win and be runner-up; all seventeen can be America's
   * Favorite HouseGuest. Settles from the season's infobox (checked on the real Big Brother 27
   * page). "Kamu Kirk" is how the page writes Kamuela "Kamu" Kirk either way. */
  'big-brother-28': {
    id: 'big-brother-28',
    name: 'Big Brother 28 finale',
    when: 'Thursday, October 1 · CBS',
    source: { kind: 'wiki-bb', page: 'Big_Brother_28_(American_season)' },
    questions: [
      { text: 'Who wins Big Brother 28?', points: 5, lockAt: Date.UTC(2026, 9, 2, 0, 0, 0), options: BB_28_IN, key: 'winner' },
      { text: 'Who is the runner-up?', points: 3, lockAt: Date.UTC(2026, 9, 2, 0, 0, 0), options: BB_28_IN, key: 'runner-up' },
      { text: "Who is America's Favorite HouseGuest?", points: 2, lockAt: Date.UTC(2026, 9, 2, 0, 0, 0), options: BB_28_ALL, key: 'afh' }
    ]
  },

  'dwts-35': {
    id: 'dwts-35',
    name: 'Dancing with the Stars, season 35',
    when: 'Premieres Tuesday, September 15 · 8 PM ET · ABC and Disney+',
    source: { kind: 'wiki-dwts', page: 'Dancing_with_the_Stars_(American_TV_series)_season_35' },
    questions: [
      { text: 'Who wins season 35?', points: 5, lockAt: Date.UTC(2026, 8, 16, 0, 0, 0), options: DWTS_35, key: 'winner' },
      { text: 'Who is eliminated first?', points: 3, lockAt: Date.UTC(2026, 8, 16, 0, 0, 0), options: DWTS_35, key: 'first-out' }
    ]
  }
};

/** The ready sets a commissioner can load today, soonest first. Past sets stay
 *  loadable by id but are not offered once every question has locked. */
export function templatesOpen(now: number) {
  const firstLock = (t: any) => Math.min(...t.questions.map((q: any) => q.lockAt));
  return Object.values(PROP_TEMPLATES)
    .filter((t) => t.questions.some((q) => q.lockAt > now))
    .sort((a, b) => firstLock(a) - firstLock(b))
    .map((t) => ({ id: t.id, name: t.name, when: t.when, count: t.questions.length }));
}
