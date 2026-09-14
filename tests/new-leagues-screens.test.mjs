/* FIVE NEW POOL SPORTS ON THE SCREENS, AND A KNOCKOUT THAT HAS A WINNER.
 *
 * 2026-09-13: the Champions League, La Liga, Liga MX, college hockey and women's
 * college basketball joined src/lib/groups.ts POOL_SPORTS (frozen, server half
 * tested in tests/knockout-winner.test.mjs and tests/multisport-pool.test.mjs).
 * This file holds the client half to it: every screen names all five, the three
 * soccer leagues behave like the Premier League, college hockey like the NHL with
 * college crests, women's college basketball like the men's.
 *
 * 🔴 A KNOCKOUT HAS A WINNER - Jason: "a knockout round has a winner, that is the
 * winner". The REAL 2026 Champions League final (PSG 1-1 Arsenal, PSG through on
 * penalties 4-3) and a REAL World Cup knockout day (two shootouts and a
 * normal-time win, parsed as 'ucl') go through the REAL parser and are graded by
 * the REAL pool.ts; the slate and My picks must agree with it and say "on
 * penalties". Nothing below writes a fixture of its own.
 *
 * Screens load with their import lines stripped, or have the pieces under test
 * lifted out of the shipped source by name (the soccer-screens pattern). Layout
 * closed in a real browser at 393px, not here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDay } from '../src/slate-day.ts';
import { pickState, resolveGame } from '../src/lib/pool.ts';
import { POOL_SPORTS, isSoccerSport, hasNoSpread, pickSides } from '../src/lib/groups.ts';
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
const P2_CSS = read('../public/screens/p2-slate.css');
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

const NEW = ['ucl', 'laliga', 'ligamx', 'mens-college-hockey', 'womens-college-basketball'];
const NEW_SOCCER = ['ucl', 'laliga', 'ligamx'];
const LABEL = { ucl: 'Champions League', laliga: 'La Liga', ligamx: 'Liga MX',
  'mens-college-hockey': 'College hockey', 'womens-college-basketball': 'Women’s college basketball' };

/* ------------------------------------------------------------ the real days */

/** A parsed day game with its two teams as objects, the way the slate holds it. */
const withTeams = (g) => ({ ...g, home: g.teams.find((t) => t.id === g.homeTeamId),
  away: g.teams.find((t) => t.id === g.awayTeamId) });
const UCL = parseDay(feed('espn-ucl-scoreboard-260530.json'), 'ucl', '20260530').map(withTeams);
const WC = parseDay(feed('espn-worldcup-scoreboard-260629.json'), 'ucl', '20260629').map(withTeams);
const EPL = parseDay(feed('espn-epl-scoreboard-260912.json'), 'epl', '20260912').map(withTeams);
const WCBB = parseDay(feed('espn-wcbb-scoreboard-260307.json'), 'womens-college-basketball', '20260307');
const NOW = Math.max(...UCL.map((g) => g.kickoffUtc), ...WC.map((g) => g.kickoffUtc)) + 86400000;
const FINAL = UCL[0];

test('the real final: PSG 1-1 Arsenal, level, PSG at home and through on penalties 4-3', () => {
  assert.equal(UCL.length, 1);
  assert.equal(FINAL.status, 'final');
  assert.equal(FINAL.home.short, 'PSG');
  assert.equal(FINAL.away.short, 'Arsenal');
  assert.deepEqual([FINAL.homeScore, FINAL.awayScore, FINAL.winner, FINAL.penHome, FINAL.penAway], [1, 1, 'home', 4, 3]);
  assert.equal(resolveGame(FINAL, false), 'home', 'pool.ts: the side that went through won it');
});

/* ------------------------------------------------------------ P2 the slate */

test('the slate grades the final as pool.ts does: PSG won, the Draw lost, Arsenal lost', () => {
  for (const side of ['home', 'away', 'draw']) {
    for (const mode of ['pool', 'ats']) {
      assert.equal(P2.pickStateOf(FINAL, { side }, NOW, mode), pickState(side, FINAL, false, NOW), side + ' ' + mode);
    }
  }
  assert.equal(P2.pickStateOf(FINAL, { side: 'home' }, NOW, 'pool'), 'won');
  assert.equal(P2.pickStateOf(FINAL, { side: 'draw' }, NOW, 'pool'), 'lost');
  assert.equal(P2.pickStateOf(FINAL, { side: 'away' }, NOW, 'pool'), 'lost');
  assert.equal(P2.soccerResult(FINAL), 'home', 'never "draw"');
  assert.equal(P2.winnerOf(FINAL), 'home', 'the loser figure dims on a level score');
});

test('the result line: "Final 1–1 · PSG on penalties (4–3)", short name, winner\'s goals first', () => {
  assert.equal(P2.pensText(FINAL), 'PSG on penalties (4–3)');
  assert.equal(P2.knockoutLine(FINAL), 'Final 1–1 · PSG on penalties (4–3)');
  assert.equal(P4.pensText(P4.gameAt(P4.soccerSpecs(UCL, 'ucl', '20260530', {})[0], NOW)), 'PSG on penalties (4–3)');
  /* An away winner reads its own goals first: Paraguay beat Germany 4-3 on penalties, away. */
  const par = WC.find((g) => g.away.short === 'Paraguay');
  assert.equal(P2.pensText(par), 'Paraguay on penalties (4–3)');
  assert.equal(P2.knockoutLine(par), 'Final 1–1 · Paraguay on penalties (4–3)');
});

test('winner is load-bearing: without it the same 1-1 is a draw again, on the slate and in pool.ts', () => {
  const { winner, ...bare } = FINAL;
  assert.equal(winner, 'home');
  assert.equal(P2.pickStateOf(bare, { side: 'draw' }, NOW, 'pool'), 'won');
  assert.equal(pickState('draw', bare, false, NOW), 'won');
  assert.equal(P2.pensText(bare), null);
  /* ...and a winner on a game that is not level, or not soccer, changes nothing. */
  assert.equal(P2.pensText({ ...FINAL, sport: 'nhl' }), null);
  assert.equal(P2.pensText({ ...FINAL, homeScore: 2 }), null);
});

test('a World Cup knockout day: each shootout to the side that went through; the normal-time win untouched', () => {
  assert.equal(WC.length, 3);
  const shootouts = WC.filter((g) => g.winner);
  assert.equal(shootouts.length, 2);
  for (const g of WC) {
    for (const side of ['home', 'away', 'draw']) {
      assert.equal(P2.pickStateOf(g, { side }, NOW, 'pool'), pickState(side, g, false, NOW), g.shortName + ' ' + side);
    }
    assert.equal(P2.pickStateOf(g, { side: 'draw' }, NOW, 'pool'), 'lost', 'nobody drew a knockout');
  }
  const normal = WC.find((g) => !g.winner);
  assert.equal(normal.homeScore, 2);
  assert.equal(P2.pensText(normal), null, 'a normal-time win says nothing about penalties');
});

test('a league draw is still a Draw: no winner on the real Premier League day, no penalties line', () => {
  const level = EPL.filter((g) => g.homeScore === g.awayScore);
  assert.equal(level.length, 4);
  for (const g of level) {
    assert.equal(g.winner, null);
    assert.equal(P2.soccerResult(g), 'draw');
    assert.equal(P2.pickStateOf(g, { side: 'draw' }, NOW, 'pool'), 'won');
    assert.equal(P2.pensText(g), null);
  }
});

test('the slate\'s mapper carries the winner and the shootout - it is an allow-list', () => {
  const slateGame = new Function(lift(P2_SRC, 'function slateGame(') + '\nreturn slateGame;')();
  const g = slateGame({ ...FINAL, id: FINAL.id });
  assert.deepEqual([g.winner, g.penHome, g.penAway, g.sport], ['home', 4, 3, 'ucl']);
  assert.equal(P2.pickStateOf(g, { side: 'draw' }, NOW, 'pool'), 'lost');
  /* A game with no winner gets no key at all. */
  assert.equal('winner' in slateGame({ id: 'x', sport: 'epl', winner: null }), false);
  /* And realSlate hands it the feed's fields. */
  assert.match(code(P2_SRC), /winner: g\.winner, penHome: g\.penHome, penAway: g\.penAway,/);
});

test('the slate row says it under the teams, and the Draw\'s label says it too', () => {
  const C = code(P2_SRC);
  assert.match(C, /const pens = pensText\(game\);\s*if \(pens\) \{\s*const p = el\('div', 'p2-pens', pens\);/);
  assert.match(C, /p\.setAttribute\('aria-label', knockoutLine\(game\)\);/);
  assert.match(C, /'Draw' \+ score \+ \(pens \? ', ' \+ pens : ''\)/);
  /* The Draw is marked as the result only when the result IS the draw. */
  assert.match(C, /if \(soccerResult\(game\) === 'draw'\) b\.dataset\.outcome = 'draw';/);
  assert.match(P2_CSS, /\.scr-p2-slate \.p2-pens \{ text-align: center; font-size: var\(--t-micro\);/);
});

/* ------------------------------------------------------------ P4 my picks */

test('My picks: soccerSpecs passes the winner and shootout, gameAt carries them to the grader', () => {
  const spec = P4.soccerSpecs(UCL, 'ucl', '20260530', {})[0];
  assert.deepEqual([spec.winner, spec.penHome, spec.penAway, spec.sport, spec.spread], ['home', 4, 3, 'ucl', null]);
  const g = P4.gameAt(spec, NOW);
  assert.equal(g.status, 'final');
  assert.equal(g.winner, 'home', 'gameAt drops the winner');
  assert.equal(pickState('home', g, false, NOW), 'won');
  assert.equal(pickState('draw', g, false, NOW), 'lost');
  assert.equal(pickState('away', g, false, NOW), 'lost');
  /* Before the clock reaches the final, no winner rides on the game. */
  const early = P4.gameAt({ ...spec, feedStatus: null }, spec.kickoffUtc - 60000);
  assert.equal(early.status, 'scheduled');
  assert.equal('winner' in early, false);
  /* The row's third line and its label say penalties; the dimmed figure is the side that went out. */
  const C = code(P4_SRC);
  assert.match(C, /if \(pens && \(st === 'won' \|\| st === 'lost'\)\) notes\.push\(pens\);/);
  assert.match(C, /else if \(pensText\(game\)\) \(game\.winner === 'home' \? a : h\)\.dataset\.loser = 'true';/);
});

test('My picks on the World Cup day: the same grade as pool.ts on every side', () => {
  for (const s of P4.soccerSpecs(WC, 'ucl', '20260629', {})) {
    const g = P4.gameAt(s, NOW);
    for (const side of ['home', 'away', 'draw']) {
      assert.equal(pickState(side, g, false, NOW), P2.pickStateOf(g, { side }, NOW, 'pool'), s.id + ' ' + side);
    }
  }
});

/* ------------------------------------------------------------ every screen, all five */

test('the slate and My picks know all eighteen pool sports and every day sport', () => {
  const arr = (src, name) => (src.match(new RegExp('const ' + name + ' = \\[([^\\]]+)\\]')) || [])[1]
    .split(',').map((x) => x.trim().replace(/^'|'$/g, ''));
  assert.deepEqual(arr(P2_SRC, 'POOL_SPORT_IDS'), [...POOL_SPORTS]);
  assert.deepEqual([...arr(P2_SRC, 'DAY_POOL_SPORTS')].sort(), Object.keys(SERVER_DAY).sort());
  assert.deepEqual([...arr(P4_SRC, 'DAY_SPORT_IDS')].sort(), Object.keys(SERVER_DAY).sort());
  assert.deepEqual(arr(P2_SRC, 'SOCCER_SPORTS'), POOL_SPORTS.filter((s) => isSoccerSport(s)));
  assert.deepEqual(arr(P4_SRC, 'SOCCER'), POOL_SPORTS.filter((s) => isSoccerSport(s)));
  for (const s of POOL_SPORTS) assert.deepEqual(P2.sidesFor(s), pickSides(s), s);
  /* Each new sport asks the chips for its own crests, on both screens. */
  for (const src of [P2_SRC, P4_SRC]) {
    const list = (code(src).match(/league: \[([^\]]+)\]\.includes\((?:ctx|data)\.sport\)/) || [])[1];
    for (const s of NEW) assert.ok(list.includes("'" + s + "'"), s + ' falls back to college football crests');
  }
  for (const s of NEW) assert.ok(P2_SRC.includes(s === 'mens-college-hockey' || s === 'womens-college-basketball'
    ? "'" + s + "': '" + LABEL[s] + "'" : s + ": '" + LABEL[s] + "'"), 'SPORT_NAME ' + s);
});

test('crests: the three soccer leagues by team id under soccer; college hockey and women\'s hoops under ncaa', () => {
  for (const s of NEW_SOCCER) {
    assert.equal(logoUrl({ id: '160' }, s, '500'), '/logos/soccer/500/160.png', s);
    assert.equal(cdnLogoUrl({ id: '359' }, s, '500-dark'), 'https://a.espncdn.com/i/teamlogos/soccer/500-dark/359.png', s);
  }
  /* Providence and UConn - the ids the contract names. */
  assert.equal(cdnLogoUrl({ id: '2507', abbrev: 'PROV' }, 'mens-college-hockey', '500'), 'https://a.espncdn.com/i/teamlogos/ncaa/500/2507.png');
  assert.equal(logoUrl({ id: '2507', abbrev: 'PROV' }, 'mens-college-hockey', '500'), '/logos/ncaa/500/2507.png', 'not by abbreviation, not nhl');
  const uconn = WCBB.flatMap((g) => g.teams).find((t) => t.id === '41');
  assert.equal(uconn.short, 'UConn');
  assert.equal(cdnLogoUrl(uconn, 'womens-college-basketball', '500'), 'https://a.espncdn.com/i/teamlogos/ncaa/500/41.png');
});

test('group create: every new sport has its label and its family; soccer, hockey and college hoops behave', () => {
  for (const s of NEW) assert.equal(G1.sportLabel(s), LABEL[s]);
  const fam = Object.fromEntries(G1.SPORT_FAMILIES);
  assert.deepEqual(fam.Soccer, ['epl', 'mls', 'ucl', 'laliga', 'ligamx']);
  assert.deepEqual(fam.Hockey, ['nhl', 'mens-college-hockey']);
  assert.deepEqual(fam.Basketball, ['mens-college-basketball', 'womens-college-basketball', 'nba', 'wnba']);
  for (const s of POOL_SPORTS) assert.equal(G1.hasNoSpread(s), hasNoSpread(s), s);
  for (const s of NEW_SOCCER) {
    assert.equal(G1.isSoccer(s), true);
    assert.equal(G1.lockWord(s), 'kickoff');
    assert.equal(G1.sportNote(s), 'Pick the winner or the draw, a day at a time. Every pick locks at kickoff.');
    assert.deepEqual(G1.createPayload({ name: 'leagues-x', pledged: true, sport: s, ats: true, scope: 'top25' }),
      { name: 'leagues-x', sport: s, pledge: true, ats: false });
  }
  /* College hockey: like the NHL, no college scope, the spread allowed. */
  const h = 'mens-college-hockey';
  assert.equal(G1.lockWord(h), 'puck drop');
  assert.equal(G1.spreadNote(h), 'In college hockey the spread is the puck line.');
  assert.deepEqual(G1.scopeValues(h), [], 'no conference or Top 25 choice');
  assert.deepEqual(G1.createPayload({ name: 'leagues-h', pledged: true, sport: h, ats: true, scope: 'top25' }),
    { name: 'leagues-h', sport: h, pledge: true, ats: true });
  /* Women's college basketball: the men's two choices, starting at the Top 25. */
  const w = 'womens-college-basketball';
  assert.deepEqual(G1.scopeValues(w), ['all', 'top25']);
  assert.equal(G1.defaultScope(w), 'top25');
  assert.equal(G1.lockWord(w), 'tip-off');
  assert.deepEqual(G1.createPayload({ name: 'leagues-w', pledged: true, sport: w, ats: false, scope: 'all' }),
    { name: 'leagues-w', sport: w, pledge: true, ats: false, scope: 'all', scopeArg: null });
  assert.equal(G1.basketballScopeNote('all', w), 'Every women’s college basketball game that day. A women’s college basketball day can have more than 70 games.');
  assert.equal(G1.basketballScopeNote('all'), 'Every college basketball game that day. A college basketball day can have 150 games.', 'the men\'s line is unchanged');
});

test('the Top 25 choice finds real ranked games on the women\'s Division I day', () => {
  const inGroupGames = new Function(lift(P2_SRC, 'function inGroupGames(') + '\nreturn inGroupGames;')();
  assert.equal(WCBB.length, 72);
  const ranked = WCBB.filter((g) => inGroupGames(g, { scope: 'top25' }));
  assert.equal(ranked.length, 10);
  assert.equal(WCBB.filter((g) => inGroupGames(g, { scope: 'all' })).length, 72);
  /* Two sides and the posted line kept, like the men's. */
  const specs = P4.soccerSpecs(WCBB, 'womens-college-basketball', '20260307', {});
  assert.equal(specs.length, 72);
  assert.deepEqual(P2.sidesFor('womens-college-basketball'), ['home', 'away']);
});

test('commissioner and group rules: the new labels, hockey\'s words, and the knockout rule', () => {
  const head = G2_SRC.slice(G2_SRC.indexOf('const SPORT_NAMES = {'), G2_SRC.indexOf('/** Which-games choices'));
  const H = new Function(head.replace(/^export /gm, '') + '\nreturn { sportName, isSoccer, hasNoSpread };')();
  for (const s of NEW) assert.equal(H.sportName(s), LABEL[s]);
  for (const s of POOL_SPORTS) assert.equal(H.hasNoSpread(s), hasNoSpread(s), s);
  assert.match(code(G2_SRC), /const hoops = isCollegeHoops\(group\.sport\);/);
  for (const s of POOL_SPORTS) assert.equal(G3.hasNoSpread(s), hasNoSpread(s), s);
  const d = G3.dayPicking('mens-college-hockey');
  assert.equal(d.lead, 'Every pick is editable until the puck drops on that game, and locks at puck drop.');
  assert.equal(G3.spreadNote('mens-college-hockey'), 'In college hockey the spread is the puck line.');
  assert.equal(G3.lockWord('womens-college-basketball'), 'tip-off');
  assert.equal(G3.lockWord('laliga'), 'kickoff');
  const F = flat(G3_SRC);
  assert.ok(F.includes('A knockout match still level after extra time is decided on penalties. The side that goes through wins it, so the draw scores nothing there.'));
});

test('standings: the new labels, the season board, and the knockout footnote', () => {
  const S = new Function([lift(P5_SRC, 'const SPORT_LABEL = {'), lift(P5_SRC, 'function groupSport('),
    'function sportLabel(s) { return SPORT_LABEL[groupSport(s)]; }', lift(P5_SRC, 'function boardKind('),
    'return { sportLabel, boardKind, groupSport };'].join('\n'))();
  for (const s of NEW) {
    assert.equal(S.sportLabel(s), LABEL[s]);
    assert.equal(S.boardKind(s), 'season', s + ' is a day sport');
  }
  for (const s of POOL_SPORTS) assert.equal(S.groupSport(s), s);
  assert.ok(flat(P5_SRC).includes('A void game counts for nobody. A knockout decided on penalties counts for the side that went through.'));
});

test('Home: all eighteen sport tiles, the women\'s NCAA shield captioned, college hockey beside the NHL', () => {
  const H = new Function([lift(HOME_SRC, 'const HOME_FAMILIES = ['), 'return HOME_FAMILIES;'].join('\n'))();
  const ids = H.flatMap((f) => f.leagues.map(([id]) => id));
  /* Every pool sport but questions, which is Home's Awards & TV section (2026-09-13). */
  assert.deepEqual([...ids, 'props'].sort(), [...POOL_SPORTS].sort());
  assert.ok(HOME_SRC.includes("b.dataset.sport = 'props';"), 'the Awards & TV tiles are questions groups');
  const byId = Object.fromEntries(H.flatMap((f) => f.leagues.map((l) => [l[0], l])));
  for (const s of NEW) assert.equal(byId[s][1], LABEL[s]);
  assert.equal(byId['womens-college-basketball'][2], 'Women');
  assert.equal(byId['mens-college-basketball'][2], 'Men');
  assert.deepEqual(H.find((f) => f.h === 'Hockey').leagues.map((l) => l[0]), ['nhl', 'mens-college-hockey']);
});

test('the Xfinity name is given once, in the rules sentence, and never on a label', () => {
  assert.equal(flat(G3_SRC).split('formerly Xfinity').length - 1, 1);
  for (const src of [G1_SRC, G2_SRC, P2_SRC, P5_SRC, HOME_SRC]) assert.ok(!flat(src).includes('Xfinity'));
});
