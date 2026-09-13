/* MY PICKS PLAYS EVERY DAY SPORT - Jason, 2026-09-13: "add the other day sports to
 * my picks". College basketball, the NBA, MLB, NHL and WNBA take the soccer card's
 * path (tests/p4-soccer.test.mjs): your group's picks on the slate's day. What
 * differs from soccer is held here: two sides, never a draw; the posted line kept,
 * so a group with its spread switch on grades the cover; "games", not "matches".
 *
 * Real captured days only, through the real day parser:
 *   fixtures/feed/espn-mlb-scoreboard-260912.json   15 MLB games
 *   fixtures/feed/espn-nhl-scoreboard-260110.json   an NHL day with a shootout
 *   fixtures/feed/espn-nba-scoreboard-260301.json   an NBA day
 *   fixtures/feed/espn-mbb-scoreboard-260307.json   a finished college day (UNC at Duke)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDay } from '../src/slate-day.ts';
import { pickState } from '../src/lib/pool.ts';
import { DAY_SPORTS } from '../src/lib/day.ts';

const SRC = readFileSync(new URL('../public/screens/p4-picks.screen.js', import.meta.url), 'utf8');
const mod = await import('data:text/javascript;base64,' +
  Buffer.from(SRC.replace(/^import\s[\s\S]*?from\s+'[^']*';$/gm, '').replace(/^import[^;]*;$/gm, ''), 'utf8').toString('base64'));
const feed = (f) => JSON.parse(readFileSync(new URL('../fixtures/feed/' + f, import.meta.url), 'utf8'));

const DAYS = {
  mlb: parseDay(feed('espn-mlb-scoreboard-260912.json'), 'mlb', '20260912'),
  nhl: parseDay(feed('espn-nhl-scoreboard-260110.json'), 'nhl', '20260110'),
  nba: parseDay(feed('espn-nba-scoreboard-260301.json'), 'nba', '20260301'),
  'mens-college-basketball': parseDay(feed('espn-mbb-scoreboard-260307.json'), 'mens-college-basketball', '20260307')
};

test('My picks knows every day sport the server does', () => {
  const list = (SRC.match(/const DAY_SPORT_IDS = \[([^\]]+)\]/) || [])[1].split(',').map((x) => x.trim().replace(/^'|'$/g, ''));
  assert.deepEqual([...list].sort(), Object.keys(DAY_SPORTS).sort(), 'p4 and src/lib/day.ts disagree on the day sports');
});

test('a finished day in each league grades through the feed, winners only - no draw', () => {
  const now = Date.now();
  for (const [sport, day] of Object.entries(DAYS)) {
    const finals = day.filter((g) => g.status === 'final');
    assert.ok(finals.length > 0, sport + ' has finals in its fixture');
    const specs = mod.soccerSpecs(finals, sport, finals[0].day, {});
    assert.equal(specs.length, finals.length, sport);
    for (const s of specs) {
      const g = mod.gameAt(s, now);
      assert.equal(g.status, 'final', sport);
      assert.equal(g.sport, sport);
      const winner = g.homeScore > g.awayScore ? 'home' : 'away';
      assert.equal(pickState(winner, g, false, now), 'won', sport + ' ' + s.id);
      assert.equal(pickState(winner === 'home' ? 'away' : 'home', g, false, now), 'lost', sport + ' ' + s.id);
    }
  }
});

test('the posted line stays on a day game outside soccer, so a spread group can grade the cover', () => {
  /* None of the captured days carries a line (checked 2026-09-13) - so this holds
     the rule in the source, and holds that the real games pass what they carry
     (nothing) straight through rather than inventing a line to test with. */
  assert.ok(SRC.includes("spread: SOCCER.includes(sport) ? null : (typeof g.spread === 'number' ? g.spread : null),"));
  for (const g of DAYS.mlb.concat(DAYS.nba, DAYS['mens-college-basketball'])) {
    assert.equal(mod.soccerSpecs([g], g.sport, g.day, {})[0].spread, typeof g.spread === 'number' ? g.spread : null);
  }
});

test('My picks reads an NBA day: two sides only, a stored draw is ignored, games not matches', async () => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(Date.now() - 6 * 3600000)).split('-').join('');
  const day = DAYS.nba;
  const store = {
    'ag.sport': JSON.stringify('nba'),
    'ag.poolday.nba': today,
    ['ag.picks.nba.' + Number(today)]: JSON.stringify({ [day[0].id]: { side: 'home' }, [day[1].id]: { side: 'draw' } })
  };
  const was = { ls: globalThis.localStorage, fetch: globalThis.fetch };
  globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem() {}, removeItem() {} };
  globalThis.fetch = async (u) => String(u).startsWith('/api/day/nba/')
    ? { ok: true, json: async () => ({ games: day }) }
    : { ok: false, json: async () => ({}) };
  try {
    const d = await mod.previewData({ teams: { teams: {} }, games: [], load: async () => ({}) }, 'ready');
    assert.equal(d.sport, 'nba');
    assert.equal(d.dayLabel, 'Today');
    assert.equal(d.dayLine, 'pick the winners · scored in points');
    assert.equal(d.noun, 'game');
    assert.deepEqual(d.specs.map((s) => s.id), [day[0].id], 'a draw is not a side in the NBA');
    assert.equal(d.pool.ats, false, 'no group: straight up');
  } finally {
    globalThis.localStorage = was.ls;
    globalThis.fetch = was.fetch;
  }
});

test('a day with nothing on it says so, instead of "every game has kicked"', () => {
  /* Found rendering the WNBA at 393px on 2026-09-13, a day with no games. */
  assert.ok(SRC.includes("body: data.dayLabel && !(data.slate || []).length"));
  assert.ok(SRC.includes("? 'Nothing on the feed for that day.'"));
  /* And no parlay ladder under a card that draws no parlay. */
  assert.ok(SRC.includes("if (!data.dayLabel) box.appendChild(el('p', 'p4-footline num',"));
});

test('the chips get the day sport\'s own crests - a pro crest by abbreviation, a college one by id', () => {
  assert.ok(SRC.includes("league: ['nfl', 'college-football', 'mens-college-basketball', 'nba', 'mlb', 'nhl', 'wnba', 'epl', 'mls', 'ucl', 'laliga', 'ligamx', 'mens-college-hockey', 'womens-college-basketball'].includes(data.sport) ? data.sport : 'college-football',"));
});
