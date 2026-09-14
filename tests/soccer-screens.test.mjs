/* SOCCER ON THE SCREENS - the client half of the one pool where a draw is a pick.
 *
 * The server half (src/lib/groups.ts, src/lib/pool.ts, src/lib/day.ts) is
 * frozen and has its own test (tests/soccer-pool.test.mjs). This file holds the
 * screens to it. Every game here comes out of the REAL captured days -
 * fixtures/feed/espn-epl-scoreboard-260912.json (7 matches, 4 level) and
 * espn-mls-scoreboard-260912.json (12 matches, 4 level) - through the REAL
 * parser, src/slate-day.ts parseDay, and is graded by the REAL pool.ts. Nothing
 * below writes a fixture of its own.
 *
 * The screens are browser code with server-absolute imports, so each is loaded
 * with its import lines stripped (the p2/p4/g1/g3 pattern), or has the pieces
 * under test lifted out of the shipped source by name (the home-sports and p5
 * pattern). The layout closed in a real browser at 393px, not here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDay } from '../src/slate-day.ts';
import { resolveGame, pickState, pickPointsFor } from '../src/lib/pool.ts';
import { POOL_SPORTS, hasNoSpread, pickSides, isSoccerSport } from '../src/lib/groups.ts';
import { DAY_SPORTS as SERVER_DAY } from '../src/lib/day.ts';
import { logoUrl, cdnLogoUrl } from '../public/components/team-chip.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const feed = (f) => JSON.parse(read('../fixtures/feed/' + f));
const stripImports = (s) => s.replace(/^import\s[\s\S]*?from\s+'[^']*';$/gm, '').replace(/^import[^;]*;$/gm, '');
const load = (src) => import('data:text/javascript;base64,' + Buffer.from(stripImports(src), 'utf8').toString('base64'));
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
/** String literals, joined - a sentence split across adjacent literals reads whole. */
const flat = (s) => (code(s).match(/'(?:[^'\\\n]|\\.)*'/g) || []).map((x) => x.slice(1, -1)).join('');

/** A top-level declaration lifted by name: from its first line to the first
 *  line at column 0 that closes it. */
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
const S6_SRC = read('../public/screens/s6-rules.screen.js');

const P2 = await load(P2_SRC);
const P4 = await load(P4_SRC);
const G1 = await load(G1_SRC);
const G3 = await load(G3_SRC);

/* ------------------------------------------------------------ the real days */

const EPL = parseDay(feed('espn-epl-scoreboard-260912.json'), 'epl', '20260912');
const MLS = parseDay(feed('espn-mls-scoreboard-260912.json'), 'mls', '20260912');
/* A day after the last kickoff: every match is over on any clock. */
const NOW = Math.max(...EPL.map((g) => g.kickoffUtc), ...MLS.map((g) => g.kickoffUtc)) + 86400000;
const level = (g) => g.homeScore === g.awayScore;

test('the real days: 7 Premier League and 12 MLS matches, all final, four level in each', () => {
  assert.equal(EPL.length, 7);
  assert.equal(MLS.length, 12);
  for (const g of [...EPL, ...MLS]) {
    assert.equal(g.status, 'final', g.shortName);
    assert.ok(Number.isInteger(g.homeScore) && Number.isInteger(g.awayScore), g.shortName);
    assert.ok(isSoccerSport(g.sport), 'the parser tags the league on the game');
  }
  assert.deepEqual(EPL.filter(level).map((g) => g.homeScore + '-' + g.awayScore).sort(), ['0-0', '0-0', '2-2', '2-2']);
  assert.equal(MLS.filter(level).length, 4);
});

/* ------------------------------------------------------------ P2 the slate */

test('the slate grades every real match exactly as pool.ts does - a level final is won by the draw', () => {
  let draws = 0;
  for (const g of [...EPL, ...MLS]) {
    for (const side of ['home', 'away', 'draw']) {
      const want = pickState(side, g, false, NOW);
      assert.equal(P2.pickStateOf(g, { side }, NOW, 'pool'), want, g.shortName + ' ' + side);
      /* A soccer group never grades on a spread, even if one were asked for. */
      assert.equal(P2.pickStateOf(g, { side }, NOW, 'ats'), want, g.shortName + ' ' + side + ' ats');
    }
    if (level(g)) {
      draws++;
      assert.equal(P2.pickStateOf(g, { side: 'draw' }, NOW, 'pool'), 'won');
      assert.equal(P2.pickStateOf(g, { side: 'home' }, NOW, 'pool'), 'lost');
      assert.equal(P2.pickStateOf(g, { side: 'away' }, NOW, 'pool'), 'lost');
      assert.equal(P2.soccerResult(g), 'draw');
    } else {
      assert.equal(P2.pickStateOf(g, { side: 'draw' }, NOW, 'pool'), 'lost');
      assert.equal(P2.soccerResult(g), resolveGame(g, false));
    }
  }
  assert.equal(draws, 8);
});

test('the sport on the game is load-bearing: without it a level final is the old void', () => {
  const g = EPL.find(level);
  const { sport, ...bare } = g;
  assert.equal(sport, 'epl');
  assert.equal(P2.pickStateOf(bare, { side: 'draw' }, NOW, 'pool'), 'void');
  assert.equal(pickState('draw', bare, false, NOW), 'void', 'pool.ts agrees - which is why sport must travel');
  /* ...and a football tie is untouched. */
  assert.equal(P2.pickStateOf({ ...g, sport: 'nfl' }, { side: 'home' }, NOW, 'pool'), 'void');
});

test('the slate offers the draw in soccer only - the same sides as the server', () => {
  for (const s of POOL_SPORTS) assert.deepEqual(P2.sidesFor(s), pickSides(s), s);
  assert.deepEqual(P2.sidesFor('epl'), ['home', 'away', 'draw']);
  assert.deepEqual(P2.sidesFor(undefined), ['home', 'away']);
});

test('the slate knows both leagues as day sports, and every pool sport by id', () => {
  const arr = (name) => (P2_SRC.match(new RegExp('const ' + name + ' = \\[([^\\]]+)\\]')) || [])[1]
    .split(',').map((x) => x.trim().replace(/^'|'$/g, ''));
  assert.deepEqual(arr('POOL_SPORT_IDS'), [...POOL_SPORTS]);
  assert.deepEqual([...arr('DAY_POOL_SPORTS')].sort(), Object.keys(SERVER_DAY).sort(),
    'the slate and src/lib/day.ts disagree on which sports pick a day at a time');
  assert.ok(arr('DAY_POOL_SPORTS').includes('epl') && arr('DAY_POOL_SPORTS').includes('mls'));
});

test('the saved-picks reader keeps a draw for soccer; the old two-side check is gone', () => {
  const C = code(P2_SRC);
  assert.match(C, /if \(!p \|\| !p\.gameId \|\| !sidesFor\(sport\)\.includes\(p\.side\)\) continue;/);
  assert.doesNotMatch(C, /p\.side !== 'home' && p\.side !== 'away'/);
});

test('the league travels onto every slate game, so the grader can read it', () => {
  const C = code(P2_SRC);
  assert.match(C, /\.\.\.\(o\.sport \? \{ sport: o\.sport \} : \{\}\)/, 'slateGame drops the sport');
  assert.match(C, /lastMeeting: g\.lastMeeting \|\| null,\s*sport\s*\}\);/, 'realSlate does not pass the sport');
});

test('the Draw is a real tap target between the teams, and its tap sends side draw', () => {
  const C = code(P2_SRC);
  assert.match(C, /const b = el\('button', 'p2-zone p2-draw'\);/, 'the draw is a button with the team zones\' states');
  assert.match(C, /if \(open\) b\.addEventListener\('click', \(\) => ctx\.onPick\(game\.id, 'draw'\)\);/);
  assert.match(C, /const mid = soccer \? drawZone\(ctx, game\)/, 'the draw goes in the middle slot');
  /* The body the tap posts, through the shipped function. */
  const g = EPL[0];
  assert.deepEqual(P2.groupPickBody('SOCCR1', g, 'draw', 'epl', 20260913), {
    poolId: 'SOCCR1', gameId: g.id, side: 'draw', sport: 'epl', week: 20260913,
    spread: typeof g.spread === 'number' ? g.spread : null, kickoffUtc: g.kickoffUtc
  });
  /* 64px wide, and it stretches to the team zones' 84px - both over the 44px floor. */
  assert.match(P2_CSS, /\.scr-p2-slate \.p2-sides > \.p2-draw \{ min-width: 64px;/);
  assert.match(P2_CSS, /\.scr-p2-slate \.p2-zone \{[^}]*min-height: 84px;/);
  /* A finished draw is marked as the result, whoever picked it. */
  assert.match(C, /if \(soccerResult\(game\) === 'draw'\) b\.dataset\.outcome = 'draw';/);
});

test('a soccer card asks for no facts, and its tiebreak counts goals', () => {
  const C = code(P2_SRC);
  /* 2026-09-13: no card asks for team facts at all - the nuggets were removed
     (tests/nuggets-removed.test.mjs). */
  assert.ok(!C.includes("'/nuggets/"), 'no facts fetch');
  assert.match(C, /isSoccerSport\(ctx\.sport\) \? 'Combined goals in ' : 'Combined points in '/);
  assert.equal(P2.GROUP_COPY.subSoccer, ' · pick the winner or the draw · scored in points');
  assert.match(C, /league: \[[^\]]*'epl', 'mls', 'ucl', 'laliga', 'ligamx'[^\]]*\]\.includes\(ctx\.sport\)/, 'soccer rows ask for soccer crests');
});

/* ------------------------------------------------------------ P4 my picks */

test('My picks: a draw reads "Draw" and grades through resolveGame with the sport set', () => {
  for (const raw of [...EPL, ...MLS]) {
    /* The spec realWeek builds: the teams as objects, parseDay's teams are [home, away]. */
    const spec = { ...raw, home: raw.teams[0], away: raw.teams[1], voidAt: null, real: true };
    const g = P4.gameAt(spec, NOW);
    assert.equal(g.sport, raw.sport, 'gameAt drops the sport');
    assert.equal(g.status, 'final');
    const want = level(raw) ? 'won' : 'lost';
    assert.equal(pickState('draw', g, false, NOW), want, raw.shortName);
    assert.equal(pickPointsFor('draw', g, false), want === 'won' ? 1 : 0);
    assert.equal(P4.pickLabel(g, 'draw'), 'Draw');
    assert.equal(P4.pickLabel(g, 'home'), raw.teams[0].short || raw.teams[0].name);
    assert.equal(P4.coverMargin(g, 'draw'), null, 'a draw has no margin');
  }
  assert.equal(P4.crowdShare({ home: 3, away: 2, n: 5 }, 'draw'), null, 'the crowd has no draw share');
  const C = code(P4_SRC);
  assert.match(C, /l1\.appendChild\(el\('span', 'p4-team', pickLabel\(game, side\)\)\);/);
  assert.match(C, /if \(editable && !draw\) \{/, 'no swap on a draw - there is no other team to flip to');
  assert.match(C, /\.\.\.\(spec\.sport \? \{ sport: spec\.sport \} : \{\}\)/);
});

/* ------------------------------------------------------------ P5 standings */

test('standings: the two league labels, and the season board a day sport gets', () => {
  const S = new Function([lift(P5_SRC, 'const SPORT_LABEL = {'), lift(P5_SRC, 'function groupSport('),
    'function sportLabel(s) { return SPORT_LABEL[groupSport(s)]; }', lift(P5_SRC, 'function boardKind('),
    'return { sportLabel, boardKind, groupSport };'].join('\n'))();
  assert.ok(P5_SRC.includes('function sportLabel(s) { return SPORT_LABEL[groupSport(s)]; }'));
  assert.equal(S.sportLabel('epl'), 'Premier League');
  assert.equal(S.sportLabel('mls'), 'MLS');
  assert.equal(S.boardKind('epl'), 'season');
  assert.equal(S.boardKind('mls'), 'season');
  assert.equal(S.boardKind('nba'), 'season', 'the NBA board is untouched');
  assert.equal(S.boardKind('nfl'), 'week');
  for (const s of POOL_SPORTS) assert.equal(S.groupSport(s), s, s + ' reads as college football');
  /* The footnote under a soccer board: a level final is not "a tie that counts
   * for nobody" there - found on the rendered board at 393px, 2026-09-13. */
  const F = flat(P5_SRC);
  assert.ok(F.includes('A point for every right pick - a winner or the draw - once the match is final. A void game counts for nobody.'));
  assert.match(code(P5_SRC), /: isSoccerBoard\(d\.sport\)\s*\?/);
  assert.ok(P5_SRC.includes("function isSoccerBoard(s) { return ['epl', 'mls', 'ucl', 'laliga', 'ligamx', 'nwsl'].includes(s); }"));
});

/* ------------------------------------------------------------ G1 G2 G3 groups */

test('group create: a Soccer family holds the five leagues, in POOL_SPORTS order', () => {
  assert.deepEqual(G1.SPORTS.filter(([id]) => isSoccerSport(id)), [['epl', 'Premier League'], ['mls', 'MLS'],
    ['ucl', 'Champions League'], ['laliga', 'La Liga'], ['ligamx', 'Liga MX'], ['nwsl', 'NWSL']]);
  /* Combat and Cricket (UFC and cricket, 2026-09-13) follow it, then the last family -
     Awards & TV (questions, 2026-09-13) - which is not a sport. */
  const fams = G1.SPORT_FAMILIES.map((f) => f[0]);
  /* Golf (the Presidents Cup, 2026-09-13) after Cricket. */
  assert.deepEqual(fams.slice(fams.indexOf('Soccer')), ['Soccer', 'Combat', 'Cricket', 'Golf', 'Awards & TV']);
  assert.deepEqual(G1.SPORT_FAMILIES[fams.indexOf('Soccer')], ['Soccer', ['epl', 'mls', 'ucl', 'laliga', 'ligamx', 'nwsl']]);
  assert.deepEqual(G1.SPORT_FAMILIES[G1.SPORT_FAMILIES.length - 1], ['Awards & TV', ['props']]);
  const order = G1.SPORT_FAMILIES.find((f) => f[0] === 'Soccer')[1];
  assert.deepEqual(order, POOL_SPORTS.filter((s) => isSoccerSport(s)));
  assert.equal(G1.sportLabel('epl'), 'Premier League');
  assert.equal(G1.poolSport('mls'), 'mls');
});

test('group create: no spread for soccer - hidden, never sent, the same list as the server', () => {
  for (const s of POOL_SPORTS) assert.equal(G1.hasNoSpread(s), hasNoSpread(s), s);
  for (const sport of ['epl', 'mls']) {
    assert.deepEqual(G1.createPayload({ name: 'soccer-x', pledged: true, sport, ats: true, scope: 'top25' }),
      { name: 'soccer-x', sport, pledge: true, ats: false }, sport + ' sends a spread or a scope');
    assert.deepEqual(G1.scopeValues(sport), []);
  }
  assert.match(code(G1_SRC), /function paintAts\(\) \{\s*sw\.hidden = hasNoSpread\(form\.sport\);/);
});

test('group create: soccer picks a day at a time and locks at kickoff', () => {
  for (const s of ['epl', 'mls']) {
    assert.equal(G1.isDaySport(s), true);
    assert.equal(G1.lockWord(s), 'kickoff');
    assert.equal(G1.periodLabel(s, 20260913), 'A day at a time');
    assert.equal(G1.sportNote(s), 'Pick the winner or the draw, a day at a time. Every pick locks at kickoff.');
    assert.equal(G1.picksLine({ sport: s, ats: true }), 'Picks straight up - who wins, or the draw');
    assert.equal(G1.shareText('soccer-x', 'BCD234', s),
      'Join my group soccer-x on Any Given. Pick the winner or the draw each day, scored in points. Code BCD234');
  }
  assert.equal(G1.lockWord('nba'), 'tip-off', 'basketball is untouched');
});

test('commissioner: the two labels, and no spread switch for a soccer group', () => {
  const head = G2_SRC.slice(G2_SRC.indexOf('const SPORT_NAMES = {'), G2_SRC.indexOf('/** Which-games choices'));
  const H = new Function(head.replace(/^export /gm, '') + '\nreturn { sportName, isRacing, isSoccer, hasNoSpread };')();
  assert.equal(H.sportName('epl'), 'Premier League');
  assert.equal(H.sportName('mls'), 'MLS');
  for (const s of POOL_SPORTS) assert.equal(H.hasNoSpread(s), hasNoSpread(s), s);
  assert.equal(H.isRacing('epl'), false, 'soccer is not a race');
  assert.match(code(G2_SRC), /if \(!hasNoSpread\(group\.sport\)\) host\.appendChild\(atsSection\(group, flashFor\('ats'\)\)\);/);
});

test('group rules: the draw is a pick, a level final scores the draw pickers, and there is no spread', () => {
  for (const s of POOL_SPORTS) assert.equal(G3.hasNoSpread(s), hasNoSpread(s), s);
  const d = G3.dayPicking('epl');
  assert.equal(d.lead, 'Every pick is editable until that game kicks off, and locks at kickoff.');
  assert.equal(d.bullets[0], 'A soccer group picks a day at a time. Each day, pick the home side, the away side or the draw in the games you want. There is no minimum.');
  assert.equal(G3.lockWord('mls'), 'kickoff');
  assert.equal(G3.dayCardLine('epl'), 'This group picks a day at a time. Every pick locks at kickoff.');
  assert.deepEqual(G3.dayPicking('nba').bullets[0],
    'A basketball group picks a day at a time. Each day, pick a side in the games you want. There is no minimum.',
    'basketball\'s sentence is unchanged');
  const F = flat(G3_SRC);
  assert.ok(F.includes('Every match has three picks: the home side, the away side, or the draw.'));
  assert.ok(F.includes('A match that finishes level scores a point for everybody who picked the draw, and nothing for anybody who picked a side.'));
  assert.ok(F.includes('There is no spread in a soccer group. Every pick is straight up.'));
  assert.ok(F.includes('A match counts once it is final, level or not.'));
  /* The soccer branch never calls a level final a void. */
  const soc = code(G3_SRC).slice(code(G3_SRC).indexOf('if (isSoccer(sport)) {'));
  const body = soc.slice(0, soc.indexOf('return box;'));
  assert.doesNotMatch(body, /ends level|lands|spread it was picked at/);
  assert.match(code(G3_SRC), /: isSoccer\(sport\) \? 'Straight up, or the draw'/);
});

/* ------------------------------------------------------------ Home */

test('Home: a Soccer family with all five league tiles, and the same tap as every tile', () => {
  const H = new Function([lift(HOME_SRC, 'const HOME_FAMILIES = ['), lift(HOME_SRC, 'function homeSportDest('),
    'return { HOME_FAMILIES, homeSportDest };'].join('\n'))();
  /* By name, not by position: Combat and Cricket followed it on 2026-09-13. */
  assert.deepEqual(H.HOME_FAMILIES.find((f) => f.h === 'Soccer'),
    { h: 'Soccer', leagues: [['epl', 'Premier League'], ['mls', 'MLS'], ['ucl', 'Champions League'],
      ['laliga', 'La Liga'], ['ligamx', 'Liga MX'], ['nwsl', 'NWSL']] });
  const G = [{ id: 'SOCCR1', sport: 'epl' }, { id: 'NFL1', sport: 'nfl' }];
  assert.deepEqual(H.homeSportDest('epl', G, ''), { sport: 'epl', groupId: 'SOCCR1', hash: '#/gpicks' });
  /* No MLS group: MLS's pool, not the group page (pool first, 2026-09-13). */
  assert.deepEqual(H.homeSportDest('mls', G, ''), { sport: 'mls', groupId: '', hash: '#/pool' });
});

/* ------------------------------------------------------------ crests */

test('crests: soccer is filed by team id under ESPN\'s soccer folder, local first, CDN second', () => {
  const t = EPL[0].teams[0];
  assert.ok(t.id && t.abbrev);
  assert.equal(logoUrl(t, 'epl', '500'), '/logos/soccer/500/' + t.id + '.png');
  assert.equal(logoUrl(t, 'mls', '500-dark'), '/logos/soccer/500-dark/' + t.id + '.png');
  assert.equal(cdnLogoUrl(t, 'epl', '500'), 'https://a.espncdn.com/i/teamlogos/soccer/500/' + t.id + '.png');
  assert.equal(cdnLogoUrl(t, 'mls', '500-dark'), 'https://a.espncdn.com/i/teamlogos/soccer/500-dark/' + t.id + '.png');
  assert.ok(!logoUrl(t, 'epl', '500').includes(t.abbrev.toLowerCase() + '.png'), 'never by abbreviation');
  /* The two ids verified 200 on ESPN's CDN on 2026-09-13. */
  assert.equal(cdnLogoUrl({ id: '349' }, 'epl', '500'), 'https://a.espncdn.com/i/teamlogos/soccer/500/349.png');
  assert.equal(cdnLogoUrl({ id: '183' }, 'mls', '500-dark'), 'https://a.espncdn.com/i/teamlogos/soccer/500-dark/183.png');
});

/* ------------------------------------------------------------ S6 rules */

test('rules: the void section says a soccer draw is a pickable result, in one sentence', () => {
  const at = S6_SRC.indexOf('function sVoid(');
  const body = S6_SRC.slice(at, S6_SRC.indexOf('\n}\n', at));
  assert.ok(body.includes("'In soccer a draw is a result you can pick, not a void.'"));
  assert.equal(flat(S6_SRC).split('In soccer a draw').length - 1, 1, 'said once');
});
