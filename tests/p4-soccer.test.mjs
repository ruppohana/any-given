/* MY PICKS PLAYS SOCCER - Jason, 2026-09-13: "add soccer to my picks".
 *
 * A soccer pool is a group, a day at a time, so My picks shows your picks in your
 * soccer group on the slate's day. Driven here by the captured Premier League day
 * (fixtures/feed/espn-epl-scoreboard-260912.json: 7 finals, 4 draws) through the
 * real day parser and the real grader.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDay } from '../src/slate-day.ts';
import { pickState } from '../src/lib/pool.ts';

const SRC = readFileSync(new URL('../public/screens/p4-picks.screen.js', import.meta.url), 'utf8');
/* The screen is browser code with server-absolute imports - loaded with them
   stripped, as tests/p4-picks.test.mjs does. */
const mod = await import('data:text/javascript;base64,' +
  Buffer.from(SRC.replace(/^import\s[\s\S]*?from\s+'[^']*';$/gm, '').replace(/^import[^;]*;$/gm, ''), 'utf8').toString('base64'));

const DAY = parseDay(JSON.parse(readFileSync(new URL('../fixtures/feed/espn-epl-scoreboard-260912.json', import.meta.url), 'utf8')), 'epl', '20260912');
const drawn = DAY.filter((g) => g.homeScore === g.awayScore);

test('a soccer day becomes this screen\'s specs, graded by the feed, a draw pick winning a level final', () => {
  const specs = mod.soccerSpecs(DAY, 'epl', '20260912', {});
  assert.equal(specs.length, 7);
  const now = Date.now();
  for (const s of specs) {
    assert.equal(s.sport, 'epl');
    assert.equal(s.spread, null, 'no spread in soccer');
    assert.equal(s.week, 20260912, 'the day is the week');
    const g = mod.gameAt(s, now);
    assert.equal(g.status, 'final');
    assert.equal(g.sport, 'epl', 'the league reaches the grader');
    const level = g.homeScore === g.awayScore;
    assert.equal(pickState('draw', g, false, now), level ? 'won' : 'lost');
  }
});

test('a match the feed says is final reads final even inside the football live window', () => {
  const s = mod.soccerSpecs(DAY, 'epl', '20260912', {})[0];
  const justAfter = s.kickoffUtc + 2 * 3600 * 1000;
  assert.equal(mod.statusAt({ ...s }, justAfter), 'final');
  assert.equal(mod.statusAt({ ...s, feedStatus: null }, justAfter), 'in_progress', 'without the feed, the clock rules as before');
});

test('the group is the current one when it plays soccer, else the first soccer group, else none', () => {
  const groups = [{ id: 'A', sport: 'nfl' }, { id: 'B', sport: 'epl' }, { id: 'C', sport: 'epl' }, { id: 'D', sport: 'mls' }];
  assert.equal(mod.soccerGroup(groups, 'C', 'epl').id, 'C');
  assert.equal(mod.soccerGroup(groups, 'A', 'epl').id, 'B');
  assert.equal(mod.soccerGroup(groups, 'A', 'mls').id, 'D');
  assert.equal(mod.soccerGroup(groups, 'A', 'wnba'), null);
  assert.equal(mod.soccerGroup(null, 'A', 'epl'), null);
});

test('My picks reads the soccer card: the slate\'s day, your picks on it, a day label, no week', async () => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(Date.now() - 6 * 3600000)).split('-').join('');
  const store = {
    'ag.sport': JSON.stringify('epl'),
    'ag.poolday.epl': today,
    ['ag.picks.epl.' + Number(today)]: JSON.stringify({ [drawn[0].id]: { side: 'draw' }, [DAY[0].id === drawn[0].id ? DAY[1].id : DAY[0].id]: { side: 'home' } })
  };
  const was = { ls: globalThis.localStorage, fetch: globalThis.fetch };
  const urls = [];
  globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem() {}, removeItem() {} };
  globalThis.fetch = async (u) => {
    urls.push(String(u));
    if (String(u).startsWith('/api/day/epl/')) return { ok: true, json: async () => ({ games: DAY }) };
    return { ok: false, json: async () => ({}) };
  };
  try {
    const d = await mod.previewData({ teams: { teams: {} }, games: [], load: async () => ({}) }, 'ready');
    assert.equal(d.sport, 'epl');
    assert.equal(d.dayLabel, 'Today');
    assert.equal(d.week, Number(today));
    assert.equal(d.slateSize, 7, 'the whole day, for "2 of 7"');
    assert.equal(d.specs.length, 2, 'only the matches you picked');
    assert.equal(d.picks[drawn[0].id].side, 'draw');
    assert.equal(d.pool.ats, false);
    assert.equal(d.slateHref, '#/g', 'no soccer group: the way in is the group page');
    assert.equal(d.fromFeed, true);
    assert.deepEqual(urls.filter((u) => u.startsWith('/api/day/')), ['/api/day/epl/' + today]);
  } finally {
    globalThis.localStorage = was.ls;
    globalThis.fetch = was.fetch;
  }
});

test('the header says the day, and the empty state and the slate button are soccer-aware', () => {
  assert.ok(SRC.includes("? data.dayLabel + ' · ' + data.dayLine"));
  assert.ok(SRC.includes("dayLine: soccer ? 'pick the winner or the draw · scored in points'"));
  assert.ok(SRC.includes("location.hash = data.slateHref || '#/slate';"));
  assert.ok(SRC.includes("return v === 'nfl' || DAY_SPORT_IDS.includes(v) ? v : 'college-football';"));
  /* The footer names the group the picks count in - never "the world board" or a
     betting line, which a group's day card has neither of. */
  assert.ok(SRC.includes("? data.captured + ' real ' + (data.noun === 'match' ? 'matches' : 'games') + ' off the feed. Your picks count in '"));
  /* No parlay on a soccer card: a group's standings score picks, never a parlay. */
  assert.ok(SRC.includes('if (!data.dayLabel) host.appendChild(parlayPin());'));
});
