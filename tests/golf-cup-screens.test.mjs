/* THE PRESIDENTS CUP ON THE SCREENS - Jason, 2026-09-13: "do the traitors and the
 * presidents cup next".
 *
 * The server half is frozen and has its own test (tests/golf-cup.test.mjs): team match
 * play, a day sport graded by the winner ESPN flags - with one difference from UFC and
 * cricket: a HALVED match is a result, stored as winner 'draw', and a third pick like a
 * soccer draw. This file holds the client half to it. Every game comes out of the REAL
 * captures through the REAL parser and is graded by the REAL pool.ts:
 *
 *   fixtures/feed/espn-golf-presidents-cup-2024.json          the 2024 Presidents Cup, final:
 *        USA 18.5 - International 11.5, 30 matches and the cup, three halved
 *   fixtures/feed/espn-golf-presidents-cup-2024-players.json  every pair's players
 *   fixtures/feed/espn-golf-ryder-cup-2025.json               the 2025 Ryder Cup - Europe
 *
 * Nothing here is written by hand. Screens load with their import lines stripped, or have
 * the pieces under test lifted out of the shipped source by name (the soccer-screens
 * pattern). The layout closed in a real browser at 393px, not here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { parseGolfCupDay } from '../src/slate-day.ts';
import { pickState, resolveGame } from '../src/lib/pool.ts';
import { POOL_SPORTS, hasNoSpread, pickSides, isSoccerSport } from '../src/lib/groups.ts';
import { DAY_SPORTS as SERVER_DAY } from '../src/lib/day.ts';
import { logoUrl, cdnLogoUrl } from '../public/components/team-chip.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const feed = (f) => JSON.parse(read('../fixtures/feed/' + f));
const stripImports = (s) => s.replace(/^import\s[\s\S]*?from\s+'[^']*';$/gm, '').replace(/^import[^;]*;$/gm, '');
const load = (src) => import('data:text/javascript;base64,' + Buffer.from(stripImports(src), 'utf8').toString('base64'));
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
const flat = (s) => (code(s).match(/'(?:[^'\\\n]|\\.)*'/g) || []).map((x) => x.slice(1, -1)).join('');

/** A top-level declaration lifted by name, through its closing line at column 0. */
function lift(src, head) {
  const at = src.indexOf('\n' + head);
  assert.ok(at >= 0, head + ' is not declared at the top level');
  const start = at + 1;
  const m = /\n(\}|\};|\];)\n/.exec(src.slice(start));
  assert.ok(m, head + ' does not close');
  return src.slice(start, start + m.index + m[0].length - 1).replace(/^export /, '');
}

const P2_SRC = read('../public/screens/p2-slate.screen.js');
const P4_SRC = read('../public/screens/p4-picks.screen.js');
const P5_SRC = read('../public/screens/p5-standings.screen.js');
const G1_SRC = read('../public/screens/g1-group.screen.js');
const G2_SRC = read('../public/screens/g2-commish.screen.js');
const G3_SRC = read('../public/screens/g3-group-rules.screen.js');
const HOME_SRC = read('../public/screens/live-game.screen.js');

const P2 = await load(P2_SRC);
const P4 = await load(P4_SRC);
const G1 = await load(G1_SRC);
const G3 = await load(G3_SRC);

/* ------------------------------------------------------------ the real days */

const PC = feed('espn-golf-presidents-cup-2024.json');
const PLAYERS = feed('espn-golf-presidents-cup-2024-players.json');
const RC = feed('espn-golf-ryder-cup-2025.json');
const DAYS = ['20240926', '20240927', '20240928', '20240929'];
/** A parsed day's games with their two sides as objects, the way the slate holds them. */
const withTeams = (g) => ({ ...g, home: g.teams.find((t) => t.id === g.homeTeamId),
  away: g.teams.find((t) => t.id === g.awayTeamId) });
const day = (d) => parseGolfCupDay(PC, d, PLAYERS).map(withTeams);
const ALL = DAYS.flatMap(day);
const SUN = day('20240929');
const NOW = Date.UTC(2026, 8, 13, 18);
const CUP = ALL.find((g) => g.overall);
const HALVED = ALL.filter((g) => g.winner === 'draw');
const SCHEFFLER = SUN.find((g) => g.id === '11551');

test('the real 2024 cup: 31 rows, all final, three halved, the cup USA 18.5 - 11.5, a singles won 1 Up by the away side', () => {
  assert.equal(ALL.length, 31);
  assert.ok(ALL.every((g) => g.sport === 'golf-cup' && g.status === 'final'));
  assert.equal(HALVED.length, 3);
  assert.deepEqual([CUP.homeScoreText, CUP.awayScoreText, CUP.winner], ['18.5', '11.5', 'home']);
  /* ESPN writes a match's score on the winner's side only - the loser's is null. */
  assert.deepEqual([SCHEFFLER.home.short, SCHEFFLER.away.short, SCHEFFLER.winner, SCHEFFLER.homeScoreText, SCHEFFLER.awayScoreText],
    ['Scheffler', 'Matsuyama', 'away', null, '1 Up']);
});

/* ------------------------------------------------------------ every screen knows it */

test('every screen knows the Presidents Cup: the lists, the labels, the day sports, the crests', () => {
  const arr = (src, name) => (src.match(new RegExp('const ' + name + ' = \\[([^\\]]+)\\]')) || [])[1]
    .split(',').map((x) => x.trim().replace(/^'|'$/g, ''));
  assert.deepEqual(arr(P2_SRC, 'POOL_SPORT_IDS'), [...POOL_SPORTS]);
  assert.ok(POOL_SPORTS.includes('golf-cup'));
  assert.deepEqual([...arr(P2_SRC, 'DAY_POOL_SPORTS')].sort(), Object.keys(SERVER_DAY).sort());
  assert.deepEqual([...arr(P4_SRC, 'DAY_SPORT_IDS')].sort(), Object.keys(SERVER_DAY).sort());
  assert.ok(P2.WINNER_SPORTS.includes('golf-cup'), 'graded by the winner flag, as the server says');
  assert.ok(P2_SRC.includes("'golf-cup': 'Presidents Cup'"), 'the slate names it');
  /* The chips are told the league on both screens, so a side's flag is looked up as a flag. */
  for (const src of [P2_SRC, P4_SRC]) {
    const list = (code(src).match(/league: \[([^\]]+)\]\.includes\((?:ctx|data)\.sport\)/) || [])[1];
    assert.ok(list.includes("'golf-cup'"), 'golf-cup falls back to college crests');
  }
  assert.equal(P2.gameNoun('golf-cup', 1), 'match');
  assert.equal(P2.gameNoun('golf-cup', 12), 'matches');
});

/* ------------------------------------------------------------ the Halved pick */

test('the Halved control: three sides on a Presidents Cup row, as in soccer - and two on every other sport', () => {
  for (const s of POOL_SPORTS) {
    assert.deepEqual(P2.sidesFor(s), pickSides(s), s);
    assert.equal(P2.sidesFor(s).includes('draw'), isSoccerSport(s) || s === 'golf-cup', s + ': the third pick');
  }
  assert.deepEqual(P2.sidesFor('golf-cup'), ['home', 'away', 'draw']);
  const C = code(P2_SRC);
  /* The cup row puts the soccer draw control between USA and the visitors... */
  assert.match(C, /if \(cupRow\) \{\s*r\.dataset\.winner = 'golf-cup';\s*sides\.append\(zone\(ctx, game, 'home'\), drawZone\(ctx, game\), zone\(ctx, game, 'away'\)\);/);
  assert.match(C, /const cupRow = isHalvedSport\(game\.sport \|\| ctx\.sport\);/);
  /* ...labeled Halved, and it posts side 'draw' like soccer's. */
  assert.match(C, /b\.appendChild\(el\('span', 'p2-draw-t', cup \? 'Halved' : 'Draw'\)\);/);
  assert.match(C, /if \(cup && cupResult\(game\) === 'draw'\) b\.dataset\.outcome = 'draw';/);
  assert.match(C, /if \(open\) b\.addEventListener\('click', \(\) => ctx\.onPick\(game\.id, 'draw'\)\);/);
  /* The draw control is drawn in exactly two places: soccer's middle slot and the cup row
     (the third mention is its own declaration). */
  assert.equal((C.match(/(?<!function )drawZone\(ctx, game\)/g) || []).length, 2);
  assert.match(C, /const mid = soccer \? drawZone\(ctx, game\)/);
  /* A UFC or cricket row keeps its "vs" - no third pick. */
  assert.match(C, /sides\.append\(zone\(ctx, game, 'home'\), winnerMid\(game\), zone\(ctx, game, 'away'\)\);/);
  /* The saved-picks reader keeps a Halved pick. */
  assert.match(C, /if \(!p \|\| !p\.gameId \|\| !sidesFor\(sport\)\.includes\(p\.side\)\) continue;/);
});

test('the slate grades every real match as pool.ts does - a halved match is the Halved pickers\', never a void', () => {
  let won = 0, lost = 0;
  for (const g of ALL) {
    for (const side of ['home', 'away', 'draw']) {
      const st = P2.pickStateOf(g, { side }, NOW, 'pool');
      assert.equal(st, pickState(side, g, false, NOW), g.id + ' ' + side);
      assert.equal(P2.pickStateOf(g, { side }, NOW, 'ats'), st, 'never a spread');
      if (st === 'won') won++; else if (st === 'lost') lost++;
    }
    assert.equal(P2.cupResult(g), resolveGame(g, false), g.id);
  }
  assert.deepEqual([won, lost], [31, 62], 'one right side a match, the other two wrong');
  for (const g of HALVED) {
    assert.equal(P2.pickStateOf(g, { side: 'draw' }, NOW, 'pool'), 'won');
    assert.equal(P2.pickStateOf(g, { side: 'home' }, NOW, 'pool'), 'lost');
    assert.equal(P2.winnerOf(g), null, 'no side won a halve');
  }
  /* The winner must travel: without it a final match is the one void path, as in pool.ts. */
  const { winner, ...bare } = HALVED[0];
  assert.equal(P2.pickStateOf(bare, { side: 'draw' }, NOW, 'pool'), 'void');
  assert.equal(resolveGame(bare, false), 'void');
});

test('the slate keeps a halve - its allow-list mapper and its live refresh carry winner draw, the session and the cup flag', async () => {
  const slateGame = new Function(lift(P2_SRC, 'function slateGame(') + '\nreturn slateGame;')();
  const h = slateGame({ ...HALVED[0] });
  assert.deepEqual([h.winner, h.sport, h.session, h.homeScoreText, h.awayScoreText, h.overall],
    ['draw', 'golf-cup', 'Singles', 'Halved', 'Halved', false]);
  const c = slateGame({ ...CUP });
  assert.deepEqual([c.winner, c.session, c.overall, c.event], ['home', 'The cup', true, 'Presidents Cup']);
  /* A draw is not a football result: nothing else keeps it. */
  assert.equal('winner' in slateGame({ id: 'x', sport: 'nfl', winner: 'draw' }), false);
  assert.match(code(P2_SRC), /overall: g\.overall === true,/, 'realSlate hands on the cup flag');

  const live = [{ ...HALVED[0], status: 'in_progress', winner: undefined }];
  const was = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (u) => { asked.push(String(u)); return { ok: true, json: async () => ({ games: [HALVED[0]] }) }; };
  try { await P2.refreshWinnerDay(live, 'golf-cup', '20240929'); } finally { globalThis.fetch = was; }
  assert.deepEqual(asked, ['/api/day/golf-cup/20240929']);
  assert.deepEqual([live[0].status, live[0].winner, live[0].homeScoreText], ['final', 'draw', 'Halved']);
  assert.equal(P2.pickStateOf(live[0], { side: 'draw' }, NOW, 'pool'), 'won');
});

/* ------------------------------------------------------------ the day, by session */

test('a Presidents Cup day reads by session - the cup first, then the sessions in tee order - never by the clock', () => {
  const thu = P2.groupsOf(day('20240926'));
  assert.deepEqual(thu.map((g) => P2.groupLabel(g)), ['Presidents Cup · The cup', 'Presidents Cup · Four-ball']);
  assert.deepEqual(thu.map((g) => g.games.length), [1, 5]);
  assert.equal(thu[0].games[0].overall, true);
  /* Saturday has both formats: four-ball in the morning, foursomes after. */
  const sat = P2.groupsOf(day('20240928'));
  assert.deepEqual(sat.map((g) => [g.window, g.games.length]), [['Four-ball', 4], ['Foursomes', 4]]);
  for (const g of sat) {
    const t = g.games.map((x) => x.kickoffUtc);
    assert.deepEqual(t, [...t].sort((a, b) => a - b), g.window + ' in tee order');
  }
  const sun = P2.groupsOf(SUN);
  assert.deepEqual(sun.map((g) => [g.window, g.games.length]), [['Singles', 12]]);
  /* Every match once, none lost to the grouping; the same as sessionGroupsOf. */
  for (const d of DAYS) {
    const games = day(d);
    const groups = P2.groupsOf(games);
    assert.deepEqual(groups, P2.sessionGroupsOf(games));
    assert.equal(new Set(groups.flatMap((g) => g.games.map((x) => x.id))).size, games.length, d);
  }
  /* The Ryder Cup: foursomes then four-ball on the Friday - the same session map. */
  const fri = P2.groupsOf(parseGolfCupDay(RC, '20250926', null).map(withTeams)).map((g) => g.window);
  assert.deepEqual(fri.filter((w) => w !== 'The cup'), ['Foursomes', 'Four-ball']);
  if (fri.includes('The cup')) assert.equal(fri[0], 'The cup');
  /* Another sport is untouched: an NFL list still groups by day. */
  assert.equal(P2.groupsOf([{ id: 'n', sport: 'nfl', kickoffUtc: NOW }])[0].window, null);
});

/* ------------------------------------------------------------ the result line */

test('the result line says the one-sided score once, attributed - never a blank on one side - and Halved', () => {
  assert.equal(P2.cupLine(SCHEFFLER), 'Matsuyama 1 Up', 'the away side\'s text, under its name');
  assert.equal(P2.cupLine(SUN.find((g) => g.id === '11549')), 'Schauffele 4 & 3');
  for (const g of HALVED) assert.equal(P2.cupLine(g), 'Halved');
  assert.equal(P2.cupLine(CUP), 'USA 18.5 · International 11.5', 'the cup has both totals');
  const pair = ALL.find((g) => g.id === '11530');
  assert.equal(P2.cupLine(pair), 'Finau / Schauffele 1 Up');
  for (const g of ALL) {
    const line = P2.cupLine(g);
    assert.ok(line && !/null|undefined/.test(line), g.id + ': ' + line);
    assert.equal(P4.cupLine(g), line, 'My picks says the same line');
  }
  /* Before the first tee there is nothing to say; a football game has no cup line. */
  assert.equal(P2.cupLine({ ...SCHEFFLER, status: 'scheduled' }), null);
  assert.equal(P2.cupLine({ ...SCHEFFLER, sport: 'nfl' }), null);
  /* Under each name, its team - where the name is its players; the cup row reads as the cup. */
  assert.deepEqual([P2.cupTeamLine(pair.home), P2.cupTeamLine(pair.away)], ['USA', 'International']);
  assert.equal(P2.cupTeamLine(CUP.home), null);
  assert.equal(P2.cupSub(CUP), 'USA vs International - the cup');
  assert.equal(P2.cupSub(pair), null);
  const C = code(P2_SRC);
  assert.match(C, /const shown = golf \? cupTeamLine\(team\) : fact;/);
  assert.match(C, /const cl = cupLine\(game\);\s*if \(cl\) r\.appendChild\(el\('div', 'p2-summary', cl\)\);/);
});

test('the slate copy: the sub line, and an empty day that says the pairings are not out yet', () => {
  assert.equal(P2.GROUP_COPY.subGolfCup, ' · pick the winner of each match, or halved · scored in points');
  assert.deepEqual(P2.GROUP_COPY.emptyGolfCup, { title: 'No Presidents Cup matches on this day',
    body: 'Pick another day above. The matches show up here once the pairings are announced.' });
  const C = code(P2_SRC);
  assert.match(C, /data\.sport === 'golf-cup' \? GROUP_COPY\.subGolfCup/);
  assert.match(C, /data\.sport === 'golf-cup' \? GROUP_COPY\.emptyGolfCup/);
});

/* ------------------------------------------------------------ P4 my picks */

test('My picks: a halve rides on the spec and the game, reads "Halved", and grades through pool.ts', () => {
  const specs = P4.soccerSpecs(SUN, 'golf-cup', '20240929', {});
  assert.equal(specs.length, 12);
  for (const s of specs) {
    const g = P4.gameAt(s, NOW);
    assert.equal(g.status, 'final');
    for (const side of ['home', 'away', 'draw']) {
      assert.equal(pickState(side, g, false, NOW), P2.pickStateOf(g, { side }, NOW, 'pool'), s.id + ' ' + side);
    }
  }
  const h = specs.find((s) => s.id === HALVED.find((g) => g.day === '20240929').id);
  assert.deepEqual([h.winner, h.feedOnly, h.spread, h.session, h.sport], ['draw', true, null, 'Singles', 'golf-cup']);
  const hg = P4.gameAt(h, NOW);
  assert.equal(hg.winner, 'draw', 'gameAt keeps the halve');
  assert.equal(pickState('draw', hg, false, NOW), 'won');
  assert.equal(P4.pickLabel(hg, 'draw'), 'Halved');
  assert.equal(P4.pickLabel({ sport: 'epl' }, 'draw'), 'Draw', 'soccer keeps its word');
  assert.equal(P4.winnerNotes(hg, 'won'), 'Halved · Singles');
  const s = P4.gameAt(specs.find((x) => x.id === '11551'), NOW);
  assert.equal(P4.winnerNotes(s, 'lost'), 'Matsuyama 1 Up · Singles');
  const cup = P4.gameAt(P4.soccerSpecs(day('20240926'), 'golf-cup', '20240926', {}).find((x) => x.overall), NOW);
  assert.equal(P4.winnerNotes(cup, 'won'), 'USA 18.5 · International 11.5 · The cup');
  assert.equal(P4.winnerNotes({ ...s, status: 'void' }, 'void'), 'The match has no result. Nobody scored it.');
  const C = code(P4_SRC);
  assert.match(C, /const started = cup \? 'Teed off ' : winnerGame \? 'Started ' : 'Kicked ';/);
  assert.ok(flat(P4_SRC).includes('Every pick is editable until its match tees off, and locks at the first tee. One rule, no exceptions, per match.'));
});

test('My picks reads a Presidents Cup day: matches, three sides, a Halved pick kept and won', async () => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(Date.now() - 6 * 3600000)).split('-').join('');
  const halve = SUN.find((g) => g.winner === 'draw');
  const store = {
    'ag.sport': JSON.stringify('golf-cup'),
    'ag.poolday.golf-cup': today,
    ['ag.picks.golf-cup.' + Number(today)]: JSON.stringify({ [halve.id]: { side: 'draw' }, [SCHEFFLER.id]: { side: 'home' } })
  };
  const was = { ls: globalThis.localStorage, fetch: globalThis.fetch };
  globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem() {}, removeItem() {} };
  globalThis.fetch = async (u) => String(u).startsWith('/api/day/golf-cup/')
    ? { ok: true, json: async () => ({ games: SUN }) }
    : { ok: false, json: async () => ({}) };
  try {
    const d = await P4.previewData({ teams: { teams: {} }, games: [], load: async () => ({}) }, 'ready');
    assert.equal(d.sport, 'golf-cup');
    assert.equal(d.noun, 'match');
    assert.equal(d.dayLine, 'pick the winner of each match, or halved · scored in points');
    assert.equal(d.pool.ats, false);
    assert.deepEqual(d.specs.map((s) => s.id).sort(), [halve.id, SCHEFFLER.id].sort(), 'a Halved pick is a side here');
    const st = Object.fromEntries(d.specs.map((s) => [s.id, pickState(d.picks[s.id].side, P4.gameAt(s, NOW), false, NOW)]));
    assert.equal(st[halve.id], 'won');
    assert.equal(st[SCHEFFLER.id], 'lost');
  } finally {
    globalThis.localStorage = was.ls;
    globalThis.fetch = was.fetch;
  }
});

/* ------------------------------------------------------------ groups: create, commissioner, rules */

test('group create: a Golf family of one, "Presidents Cup", the first tee - no spread, no which-games', () => {
  assert.deepEqual(G1.SPORTS.map((s) => s[0]), [...POOL_SPORTS]);
  assert.deepEqual(G1.SPORTS[POOL_SPORTS.indexOf('golf-cup')], ['golf-cup', 'Presidents Cup']);
  const fams = G1.SPORT_FAMILIES.map((f) => f[0]);
  assert.deepEqual(G1.SPORT_FAMILIES[fams.indexOf('Golf')], ['Golf', ['golf-cup']]);
  assert.equal(fams.indexOf('Golf'), fams.indexOf('Cricket') + 1, 'after Cricket, in POOL_SPORTS order');
  assert.equal(G1.sportLabel('golf-cup'), 'Presidents Cup');
  assert.equal(G1.hasNoSpread('golf-cup'), hasNoSpread('golf-cup'));
  assert.equal(G1.isDaySport('golf-cup'), true);
  assert.deepEqual(G1.scopeValues('golf-cup'), []);
  assert.deepEqual(G1.createPayload({ name: 'cup-x', pledged: true, sport: 'golf-cup', ats: true, scope: 'top25' }),
    { name: 'cup-x', sport: 'golf-cup', pledge: true, ats: false }, 'never a spread or a scope');
  assert.equal(G1.lockWord('golf-cup'), 'the first tee');
  assert.equal(G1.sportNote('golf-cup'), 'Pick the winner of each match - or that it is halved - a day at a time. Every pick locks at the first tee.');
  assert.equal(G1.periodLabel('golf-cup', 20260924), 'A day at a time');
  assert.equal(G1.picksLine({ sport: 'golf-cup', ats: true }), 'Picks straight up - who wins each match, or halved');
  assert.equal(G1.shareText('cup-x', 'BCD234', 'golf-cup'),
    'Join my group cup-x on Any Given. Pick the winner of each Presidents Cup match, or that it is halved, scored in points. Code BCD234');
});

test('commissioner: "Presidents Cup", and no spread switch', () => {
  /* Through scopeValues, which sits just before the spread-name note. */
  const head = G2_SRC.slice(G2_SRC.indexOf('const SPORT_NAMES = {'), G2_SRC.indexOf('/** What the spread is called'));
  const H = new Function(head.replace(/^export /gm, '') + '\nreturn { sportName, hasNoSpread, scopeValues };')();
  assert.equal(H.sportName('golf-cup'), 'Presidents Cup');
  assert.equal(H.hasNoSpread('golf-cup'), true);
  assert.deepEqual(H.scopeValues('golf-cup'), []);
  assert.match(code(G2_SRC), /if \(!hasNoSpread\(group\.sport\)\) host\.appendChild\(atsSection/);
});

test('group rules: a halved match is a result - the Halved pickers score it, it counts as played - and the first tee', () => {
  assert.deepEqual([...G3.DAY_SPORTS].sort(), Object.keys(SERVER_DAY).sort());
  assert.equal(G3.hasNoSpread('golf-cup'), true);
  assert.equal(G3.lockWord('golf-cup'), 'the first tee');
  assert.equal(G3.dayCardLine('golf-cup'), 'This group picks a day at a time. Every pick locks at the first tee.');
  const d = G3.dayPicking('golf-cup');
  assert.equal(d.lead, 'Every pick is editable until that match tees off, and locks at the first tee.');
  assert.ok(d.bullets[0].startsWith('A Presidents Cup group picks a day at a time.'));
  assert.ok(G3_SRC.includes("'golf-cup': 'Presidents Cup'"));
  const F = flat(G3_SRC);
  assert.ok(F.includes('Every match has three picks: one side, the other side, or halved.'));
  assert.ok(F.includes('A halved match is a result. It scores a point for everybody who picked Halved, and nothing for anybody who picked a side - and it counts as played.'));
  assert.ok(F.includes('There is no spread in a Presidents Cup group. Every pick is straight up.'));
  assert.match(code(G3_SRC), /: isGolfCup\(sport\) \? 'Straight up, or halved'/);
  /* The golf branch comes before the winner branch, and never says "two picks". */
  const C = code(G3_SRC);
  const body = C.slice(C.indexOf('if (isGolfCup(sport)) {'), C.indexOf('if (isWinner(sport)) {'));
  assert.ok(body.length > 0);
  assert.doesNotMatch(body, /two picks|covers|spread it was picked at/);
});

test('standings: "Presidents Cup", the season board, and a footnote that a halved match counts for the Halved pickers', () => {
  const S = new Function([lift(P5_SRC, 'const SPORT_LABEL = {'), lift(P5_SRC, 'function groupSport('),
    'function sportLabel(s) { return SPORT_LABEL[groupSport(s)]; }', lift(P5_SRC, 'function boardKind('),
    'return { sportLabel, boardKind, groupSport };'].join('\n'))();
  assert.equal(S.sportLabel('golf-cup'), 'Presidents Cup');
  assert.equal(S.boardKind('golf-cup'), 'season');
  assert.equal(S.groupSport('golf-cup'), 'golf-cup');
  assert.ok(flat(P5_SRC).includes('A point for every right pick, once the match is over. A halved match counts: everybody who picked Halved scores it. A match with no result counts for nobody.'));
});

/* ------------------------------------------------------------ Home */

test('Home: a Golf family after Cricket with one league, the Presidents Cup, as words - and the same tap as every tile', () => {
  const H = new Function([lift(HOME_SRC, 'const HOME_FAMILIES = ['), lift(HOME_SRC, 'const HOME_MARKS = {'),
    lift(HOME_SRC, 'function homeSportDest('), 'return { HOME_FAMILIES, HOME_MARKS, homeSportDest };'].join('\n'))();
  const names = H.HOME_FAMILIES.map((f) => f.h);
  assert.equal(names.indexOf('Golf'), names.indexOf('Cricket') + 1);
  assert.deepEqual(H.HOME_FAMILIES.find((f) => f.h === 'Golf'), { h: 'Golf', leagues: [['golf-cup', 'Presidents Cup']] });
  assert.equal(H.HOME_MARKS['golf-cup'], undefined, 'no Presidents Cup mark - a text tile, like Cricket');
  const G = [{ id: 'CUP1', sport: 'golf-cup' }, { id: 'NFL1', sport: 'nfl' }];
  assert.deepEqual(H.homeSportDest('golf-cup', G, ''), { sport: 'golf-cup', groupId: 'CUP1', hash: '#/gpicks' });
  assert.deepEqual(H.homeSportDest('golf-cup', [], ''), { sport: 'golf-cup', groupId: '', hash: '#/g' });
});

/* ------------------------------------------------------------ crests */

test('crests: each side is its team\'s flag - usa, intl, eur - from our origin, light and dark, never espncdn', () => {
  for (const [c, v] of [['usa', '500'], ['intl', '500'], ['eur', '500'], ['usa', '500-dark'], ['intl', '500-dark'], ['eur', '500-dark']]) {
    assert.ok(existsSync(new URL('../public/logos/countries/' + v + '/' + c + '.png', import.meta.url)), c + ' ' + v + ' is on disk');
  }
  const teams = [...ALL.flatMap((g) => g.teams), ...parseGolfCupDay(RC, '20250926', null).flatMap((g) => g.teams)];
  const codes = new Set();
  for (const t of teams) {
    for (const v of ['500', '500-dark']) {
      const u = logoUrl(t, 'golf-cup', v);
      assert.equal(u, '/logos/countries/' + v + '/' + t.team.toLowerCase() + '.png', t.name);
      assert.ok(existsSync(new URL('../public' + u, import.meta.url)), u);
    }
    assert.equal(cdnLogoUrl(t, 'golf-cup', '500'), t.logo, 'the feed\'s own URL only as the fallback');
    codes.add(t.team);
  }
  assert.deepEqual([...codes].sort(), ['EUR', 'INTL', 'USA']);
});
