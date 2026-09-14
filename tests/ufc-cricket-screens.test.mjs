/* UFC AND CRICKET ON THE SCREENS - Jason, 2026-09-13: "do the ufc and cricket next".
 *
 * The server half is frozen and has its own test (tests/ufc-cricket.test.mjs): two
 * day sports graded by the winner ESPN flags, not a score, and a finish with no
 * winner - a drawn bout, a no contest, a match with no result - is status 'void'.
 * This file holds the client half to it. Every game comes out of the REAL captures
 * through the REAL parsers and is graded by the REAL pool.ts:
 *
 *   fixtures/feed/espn-ufc-scoreboard-260912.json   Noche UFC: Silva vs. Delgado - 13 bouts, final
 *   fixtures/feed/espn-ufc-scoreboard-260919.json   UFC 331: Van vs. Pantoja 2 - 13 bouts, scheduled
 *   fixtures/feed/espn-cricket-cpl-260912.json      Barbados Tridents v Jamaica Kingsmen - Tridents won
 *   fixtures/feed/espn-cricket-cpl-260830.json      St Kitts v Antigua - "No result (abandoned with a toss)"
 *   fixtures/feed/espn-cricket-nzind-261022.json    New Zealand v India, the first T20 - scheduled
 *
 * The one derived case is said out loud where it is made: no captured card has a
 * drawn bout, so one test clears the two winner flags on a REAL Noche bout in the
 * REAL payload and hands it to the REAL parser - the shape a draw arrives in. Nothing
 * else here is written by hand.
 *
 * Screens load with their import lines stripped, or have the pieces under test lifted
 * out of the shipped source by name (the soccer-screens pattern). The layout closed in
 * a real browser at 393px, not here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseUfcDay, parseCricketDay } from '../src/slate-day.ts';
import { pickState, resolveGame } from '../src/lib/pool.ts';
import { POOL_SPORTS, hasNoSpread, pickSides } from '../src/lib/groups.ts';
import { DAY_SPORTS as SERVER_DAY } from '../src/lib/day.ts';

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

const P2 = await load(P2_SRC);
const P4 = await load(P4_SRC);
const G1 = await load(G1_SRC);
const G3 = await load(G3_SRC);

/* ------------------------------------------------------------ the real days */

/** A parsed day game with its two sides as objects, the way the slate holds it. */
const withTeams = (g) => ({ ...g, home: g.teams.find((t) => t.id === g.homeTeamId),
  away: g.teams.find((t) => t.id === g.awayTeamId) });
const NOCHE = parseUfcDay(feed('espn-ufc-scoreboard-260912.json'), '20260912').map(withTeams);
const UFC331 = parseUfcDay(feed('espn-ufc-scoreboard-260919.json'), '20260919').map(withTeams);
const CPL12 = parseCricketDay(feed('espn-cricket-cpl-260912.json'), '20260912').map(withTeams);
const CPL30 = parseCricketDay(feed('espn-cricket-cpl-260830.json'), '20260830').map(withTeams);
const NZIND = parseCricketDay(feed('espn-cricket-nzind-261022.json'), '20261022').map(withTeams);
const NOW = Date.UTC(2026, 8, 13, 18);
const MAIN = NOCHE.find((g) => g.name === 'Jean Silva vs. Jose Miguel Delgado');

/** The real Noche payload with the two winner flags cleared on its main event - the
 *  shape a drawn bout or a no contest arrives in - through the real parser. */
function drawnMainEvent() {
  const raw = feed('espn-ufc-scoreboard-260912.json');
  const comp = raw.events[0].competitions.find((c) => c.competitors.some((x) => x.athlete?.displayName === 'Jean Silva'));
  for (const x of comp.competitors) x.winner = false;
  return parseUfcDay(raw, '20260912').map(withTeams).find((g) => g.id === MAIN.id);
}

test('the real days: a finished card, a card a week out, a CPL result, the real washout, a T20 to come', () => {
  assert.equal(NOCHE.length, 13);
  assert.ok(NOCHE.every((g) => g.status === 'final' && (g.winner === 'home' || g.winner === 'away')));
  assert.equal(UFC331.length, 13);
  assert.ok(UFC331.every((g) => g.status === 'scheduled' && g.winner === null));
  assert.equal(CPL12[0].status, 'final');
  assert.equal(CPL30[0].status, 'void');
  assert.equal(NZIND[0].status, 'scheduled');
});

/* ------------------------------------------------------------ every screen knows both */

test('every screen knows UFC and cricket: the lists, the labels, the day sports, the crests', () => {
  const arr = (src, name) => (src.match(new RegExp('const ' + name + ' = \\[([^\\]]+)\\]')) || [])[1]
    .split(',').map((x) => x.trim().replace(/^'|'$/g, ''));
  assert.deepEqual(arr(P2_SRC, 'POOL_SPORT_IDS'), [...POOL_SPORTS]);
  assert.deepEqual([...arr(P2_SRC, 'DAY_POOL_SPORTS')].sort(), Object.keys(SERVER_DAY).sort());
  assert.deepEqual([...arr(P4_SRC, 'DAY_SPORT_IDS')].sort(), Object.keys(SERVER_DAY).sort());
  /* The Presidents Cup joined 2026-09-13 - src/lib/groups.ts isWinnerSport names it too
     (tests/golf-cup-screens.test.mjs holds its halved match). */
  assert.deepEqual(P2.WINNER_SPORTS, ['ufc', 'cricket', 'golf-cup']);
  for (const s of ['ufc', 'cricket']) {
    assert.deepEqual(P2.sidesFor(s), pickSides(s), s + ': two sides, no draw pick');
    assert.ok(P2_SRC.includes(s + ": '" + (s === 'ufc' ? 'UFC' : 'Cricket') + "'"), 'SPORT_NAME ' + s);
  }
  /* The chips are told the league on both screens, so a fighter's flag and a cricket
     crest are looked up as theirs and never as a college school's. */
  for (const src of [P2_SRC, P4_SRC]) {
    const list = (code(src).match(/league: \[([^\]]+)\]\.includes\((?:ctx|data)\.sport\)/) || [])[1];
    for (const s of ['ufc', 'cricket']) assert.ok(list.includes("'" + s + "'"), s + ' falls back to college crests');
  }
});

test('group create: a Combat family and a Cricket family, in POOL_SPORTS order - no spread, no which-games', () => {
  /* The Presidents Cup follows them (2026-09-13), then Big Game squares. */
  assert.deepEqual(G1.SPORTS.slice(-4), [['ufc', 'UFC'], ['cricket', 'Cricket'], ['golf-cup', 'Presidents Cup'],
    ['squares', 'Big Game squares']]);
  assert.deepEqual(G1.SPORTS.map((s) => s[0]), [...POOL_SPORTS]);
  const fam = Object.fromEntries(G1.SPORT_FAMILIES);
  assert.deepEqual(fam.Combat, ['ufc']);
  assert.deepEqual(fam.Cricket, ['cricket']);
  for (const s of POOL_SPORTS) assert.equal(G1.hasNoSpread(s), hasNoSpread(s), s);
  for (const s of ['ufc', 'cricket']) {
    assert.equal(G1.isDaySport(s), true);
    assert.deepEqual(G1.scopeValues(s), []);
    assert.deepEqual(G1.createPayload({ name: 'fight-x', pledged: true, sport: s, ats: true, scope: 'top25' }),
      { name: 'fight-x', sport: s, pledge: true, ats: false }, s + ' sends a spread or a scope');
  }
  assert.equal(G1.sportNote('ufc'), 'Pick the winner of each bout, a card at a time. Each bout locks when its part of the card - the prelims or the main card - starts.');
  assert.equal(G1.sportNote('cricket'), 'Pick the winner of each match, a day at a time. Every pick locks at the first ball.');
  assert.equal(G1.periodLabel('ufc', 20260919), 'A card at a time');
  assert.equal(G1.periodLabel('cricket', 20260912), 'A day at a time');
  assert.equal(G1.picksLine({ sport: 'ufc', ats: true }), 'Picks straight up - who wins each bout');
  assert.equal(G1.shareText('fight-night', 'BCD234', 'ufc'),
    'Join my group fight-night on Any Given. Pick the winner of every bout on the card, scored in points. Code BCD234');
});

test('commissioner: the two labels, and no spread switch for either', () => {
  const head = G2_SRC.slice(G2_SRC.indexOf('const SPORT_NAMES = {'), G2_SRC.indexOf('/** Which-games choices'));
  const H = new Function(head.replace(/^export /gm, '') + '\nreturn { sportName, hasNoSpread, scopeValues: () => [] };')();
  assert.equal(H.sportName('ufc'), 'UFC');
  assert.equal(H.sportName('cricket'), 'Cricket');
  for (const s of POOL_SPORTS) assert.equal(H.hasNoSpread(s), hasNoSpread(s), s);
  assert.match(code(G2_SRC), /if \(!hasNoSpread\(group\.sport\)\) host\.appendChild\(atsSection/);
});

test('group rules: the winner of each bout or match, a draw / no contest / no result counts for nobody, and when each locks', () => {
  for (const s of POOL_SPORTS) assert.equal(G3.hasNoSpread(s), hasNoSpread(s), s);
  assert.deepEqual([...G3.DAY_SPORTS].sort(), Object.keys(SERVER_DAY).sort());
  const u = G3.dayPicking('ufc');
  assert.equal(u.lead, 'Every pick is editable until its part of the card starts, and locks when it does.');
  assert.ok(u.bullets.includes('Each bout locks when its part of the card starts: the prelims first, then the main card.'));
  const c = G3.dayPicking('cricket');
  assert.equal(c.lead, 'Every pick is editable until the first ball of that match, and locks at the first ball.');
  assert.equal(G3.lockWord('cricket'), 'the first ball');
  assert.equal(G3.dayCardLine('ufc'), 'This group picks a card at a time. Each bout locks when its part of the card starts.');
  const F = flat(G3_SRC);
  assert.ok(F.includes('Every bout has two picks: one fighter or the other.'));
  assert.ok(F.includes('A draw or a no contest counts for nobody, and so does a bout that is called off. No points won and none lost, for anybody who picked it.'));
  assert.ok(F.includes('A match with no result counts for nobody - rained off, abandoned, or called off. No points won and none lost, for anybody who picked it.'));
  assert.ok(F.includes('There is no spread in a UFC group. Every pick is straight up.'));
  assert.ok(F.includes('There is no spread in a cricket group. Every pick is straight up.'));
  /* The winner-sport branch never talks a spread or a score. */
  const C = code(G3_SRC);
  const body = C.slice(C.indexOf('if (isWinner(sport)) {'));
  assert.doesNotMatch(body.slice(0, body.indexOf('return box;')), /covers|spread it was picked at|ends level/);
});

test('standings: "UFC" and "Cricket", the season board, and a footnote that says what counts', () => {
  const S = new Function([lift(P5_SRC, 'const SPORT_LABEL = {'), lift(P5_SRC, 'function groupSport('),
    'function sportLabel(s) { return SPORT_LABEL[groupSport(s)]; }', lift(P5_SRC, 'function boardKind('),
    'return { sportLabel, boardKind, groupSport };'].join('\n'))();
  assert.equal(S.sportLabel('ufc'), 'UFC');
  assert.equal(S.sportLabel('cricket'), 'Cricket');
  assert.equal(S.boardKind('ufc'), 'season');
  assert.equal(S.boardKind('cricket'), 'season');
  for (const s of POOL_SPORTS) assert.equal(S.groupSport(s), s);
  const F = flat(P5_SRC);
  assert.ok(F.includes('A point for every winner you pick, once the bout is over. A draw, a no contest or a bout called off counts for nobody.'));
  assert.ok(F.includes('A point for every winner you pick, once the match has a result. A match with no result counts for nobody.'));
});

/* ------------------------------------------------------------ P2 the slate */

test('the slate grades every real bout as pool.ts does: a won and a lost on each, never a spread', () => {
  let won = 0, lost = 0;
  for (const g of NOCHE) {
    for (const side of ['home', 'away']) {
      for (const mode of ['pool', 'ats']) {
        const st = P2.pickStateOf(g, { side }, NOW, mode);
        assert.equal(st, pickState(side, g, false, NOW), g.shortName + ' ' + side + ' ' + mode);
        if (st === 'won') won++; else if (st === 'lost') lost++;
      }
    }
    assert.equal(P2.winnerOf(g), g.winner, 'the winner ESPN flagged, with no score to read');
  }
  assert.equal(won, 26);
  assert.equal(lost, 26);
  assert.equal(P2.pickStateOf(MAIN, { side: 'home' }, NOW, 'pool'), 'won', 'Jean Silva, listed first');
  assert.equal(P2.pickStateOf(MAIN, { side: 'away' }, NOW, 'pool'), 'lost');
});

test('a drawn bout (the real main event, its two winner flags cleared) is void for both sides, on the slate and in pool.ts', () => {
  const g = drawnMainEvent();
  assert.equal(g.status, 'void', 'the parser turns a final with no winner into the void path');
  assert.equal(g.winner, null);
  for (const side of ['home', 'away']) {
    assert.equal(P2.pickStateOf(g, { side }, NOW, 'pool'), 'void');
    assert.equal(pickState(side, g, false, NOW), 'void');
  }
  assert.equal(P2.winnerOf(g), null);
  /* And a finished bout whose winner is lost on the way is void, never a guess. */
  const { winner, ...bare } = MAIN;
  assert.equal(winner, 'home');
  assert.equal(P2.pickStateOf(bare, { side: 'home' }, NOW, 'pool'), 'void');
  assert.equal(resolveGame(bare, false), 'void', 'pool.ts agrees - which is why winner must travel');
});

test('a UFC day reads as a fight card: by event, the Main card first then the Prelims, the headliner first', () => {
  const g = P2.cardGroupsOf(UFC331);
  assert.deepEqual(g.map((x) => P2.groupLabel(x)), ['UFC 331: Van vs. Pantoja 2 · Main card', 'UFC 331: Van vs. Pantoja 2 · Prelims']);
  assert.deepEqual(g.map((x) => x.games.length), [5, 8]);
  assert.equal(g[0].games[0].name, 'Joshua Van vs. Alexandre Pantoja', 'the main event leads the main card');
  assert.ok(g[0].games.every((x) => x.card === 'Main card') && g[1].games.every((x) => x.card === 'Prelims'));
  /* Every bout once, none lost to the grouping. */
  assert.equal(new Set(g.flatMap((x) => x.games.map((b) => b.id))).size, 13);
  const n = P2.cardGroupsOf(NOCHE);
  assert.deepEqual(n.map((x) => [x.window, x.games.length]), [['Main card', 6], ['Prelims', 7]]);
  assert.equal(n[0].games[0].name, 'Jean Silva vs. Jose Miguel Delgado');
  assert.equal(P2.gameNoun('ufc', 13), 'bouts');
  assert.equal(P2.gameNoun('cricket', 1), 'match');
  assert.equal(P2.gameNoun('cricket', 2), 'matches');
  /* The render uses it for UFC and only for UFC. */
  assert.match(code(P2_SRC), /const groups = ctx\.sport === 'ufc' \? cardGroupsOf\(shown\) : groupsOf\(shown\);/);
});

test('cricket: the result is the winner ESPN flagged; the real washout is void for both; the line under the row says which', () => {
  const r = CPL12[0];
  assert.equal(P2.pickStateOf(r, { side: 'home' }, NOW, 'pool'), 'won', 'Barbados Tridents');
  assert.equal(P2.pickStateOf(r, { side: 'away' }, NOW, 'pool'), 'lost');
  assert.equal(P2.cricketLine(r), 'Tridents won by 2 wkts (0b rem)');
  assert.equal(r.homeScoreText, '151/8 (20 ov, target 151)');
  const wash = CPL30[0];
  for (const side of ['home', 'away']) {
    assert.equal(P2.pickStateOf(wash, { side }, NOW, 'pool'), 'void');
    assert.equal(pickState(side, wash, false, NOW), 'void');
  }
  assert.equal(P2.cricketLine(wash), 'No result (abandoned with a toss)');
  /* Before the toss ESPN writes the start time, which the row already shows. */
  assert.equal(NZIND[0].summary, 'Starts at 20:00 local time');
  assert.equal(P2.cricketLine(NZIND[0]), null);
  assert.equal(P2.cricketLine({ ...NZIND[0], summary: 'Tridents won toss & fielded' }), 'Tridents won toss & fielded', 'the toss shows before the first ball');
});

test('the slate keeps the fields a fight or a match is drawn from - its mapper is an allow-list - and keeps a washout', () => {
  const slateGame = new Function(lift(P2_SRC, 'function slateGame(') + '\nreturn slateGame;')();
  const b = slateGame({ ...MAIN });
  assert.deepEqual([b.winner, b.sport, b.event, b.weightClass, b.card],
    ['home', 'ufc', 'Noche UFC: Silva vs. Delgado', 'Featherweight', 'Main card']);
  const m = slateGame({ ...CPL12[0] });
  assert.deepEqual([m.winner, m.competition, m.format, m.summary, m.homeScoreText, m.awayScoreText],
    ['home', 'Caribbean Premier League', 'T20', 'Tridents won by 2 wkts (0b rem)', '151/8 (20 ov, target 151)', '150/9']);
  const w = slateGame({ ...CPL30[0] });
  assert.equal('winner' in w, false);
  assert.equal(w.summary, 'No result (abandoned with a toss)');
  /* A football game gets none of them. */
  assert.equal('summary' in slateGame({ id: 'x', sport: 'nfl', summary: 'x' }), false);
  const C = code(P2_SRC);
  /* realSlate: a winner-sport void is kept and stays void, and the feed's fields are handed on. */
  assert.match(C, /\(!g\.tbd && \(g\.status !== 'void' \|\| winnerDay\)\)/);
  assert.match(C, /: g\.status === 'void' && winnerDay \? 'void' : 'scheduled',/);
  assert.match(C, /\.\.\.Object\.fromEntries\(WINNER_FIELDS\.map\(\(k\) => \[k, g\[k\]\]\)\),/);
});

test('a fight or cricket row: first-named on the left, "vs" or "v", no score column, two 44px sides', () => {
  const C = code(P2_SRC);
  assert.match(C, /sides\.append\(zone\(ctx, game, 'home'\), winnerMid\(game\), zone\(ctx, game, 'away'\)\);/);
  assert.match(C, /el\('span', 'p2-vs-t', game\.sport === 'cricket' \? 'v' : 'vs'\)/);
  assert.match(C, /if \(line\) r\.appendChild\(el\('div', 'p2-summary', line\)\);/);
  /* The fighter's full name, the record under it; the side's score text under a cricket name. */
  assert.match(C, /ufc \? \(team\.name \|\| team\.short\) : \(team\.short \|\| team\.name\)/);
  assert.match(C, /const fact = ufc \? \(team\.record \|\| null\) : \(side === 'home' \? game\.homeScoreText : game\.awayScoreText\) \|\| null;/);
  /* The row's sub line: the weight class, or the competition and format. */
  assert.match(C, /\? game\.weightClass : \[game\.competition, game\.format\]\.filter\(Boolean\)\.join\(' · '\)/);
  /* Both sides are the team zone - the same 84px button, over the 44px floor. */
  assert.match(P2_CSS, /\.scr-p2-slate \.p2-zone \{[^}]*min-height: 84px;/);
  assert.match(P2_CSS, /\.scr-p2-slate \.p2-name\.p2-name--full \{ white-space: normal;/);
  /* No tiebreak and no line attribution on a day with no score and no line. */
  assert.match(C, /if \(tb && !isWinnerSport\(ctx\.sport\)\) \{/);
  assert.match(C, /if \(!isWinnerSport\(ctx\.sport\)\) root\.appendChild\(sourceNote\);/);
});

test('the live refresh copies a fight\'s or a match\'s result onto the row - a no-result finish stays void', async () => {
  const games = [{ ...UFC331[0], status: 'in_progress' }, { ...CPL12[0], status: 'in_progress', summary: 'Tridents won toss & fielded', winner: undefined }];
  const was = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (u) => {
    asked.push(String(u));
    const day = String(u).includes('/ufc/') ? [{ ...UFC331[0], status: 'final', winner: 'away' }] : [CPL12[0]];
    return { ok: true, json: async () => ({ games: day }) };
  };
  try {
    await P2.refreshWinnerDay([games[0]], 'ufc', '20260919');
    await P2.refreshWinnerDay([games[1]], 'cricket', '20260912');
    const washed = [{ ...CPL30[0], status: 'in_progress' }];
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ games: [CPL30[0]] }) });
    await P2.refreshWinnerDay(washed, 'cricket', '20260830');
    assert.equal(washed[0].status, 'void', 'never back to scheduled');
    assert.equal(P2.pickStateOf(washed[0], { side: 'home' }, NOW, 'pool'), 'void');
  } finally { globalThis.fetch = was; }
  assert.deepEqual(asked, ['/api/day/ufc/20260919', '/api/day/cricket/20260912']);
  assert.deepEqual([games[0].status, games[0].winner], ['final', 'away']);
  assert.equal(P2.pickStateOf(games[0], { side: 'away' }, NOW, 'pool'), 'won');
  assert.deepEqual([games[1].status, games[1].winner, games[1].summary, games[1].homeScoreText],
    ['final', 'home', 'Tridents won by 2 wkts (0b rem)', '151/8 (20 ov, target 151)']);
  /* The slate's timer reads it for these two sports and overlays everything else as before. */
  assert.match(code(P2_SRC), /if \(isWinnerSport\(fsport\) && data\.day\) await refreshWinnerDay\(inPlay, fsport, data\.day\);\s*else await overlayLive\(inPlay, fsport\);/);
});

/* ------------------------------------------------------------ P4 my picks */

test('My picks: a finished card grades through pool.ts - the winner and the card ride on the spec and the game', () => {
  const specs = P4.soccerSpecs(NOCHE, 'ufc', '20260912', {});
  assert.equal(specs.length, 13);
  const spec = specs.find((s) => s.id === MAIN.id);
  assert.deepEqual([spec.winner, spec.sport, spec.spread, spec.feedOnly, spec.event, spec.weightClass, spec.card],
    ['home', 'ufc', null, true, 'Noche UFC: Silva vs. Delgado', 'Featherweight', 'Main card']);
  const g = P4.gameAt(spec, NOW);
  assert.equal(g.status, 'final');
  assert.equal(g.winner, 'home');
  assert.equal(pickState('home', g, false, NOW), 'won');
  assert.equal(pickState('away', g, false, NOW), 'lost');
  assert.equal(P4.winnerNotes(g, 'won'), 'Jean Silva won · Featherweight');
  assert.equal(P4.winnerNotes(g, 'lost'), 'Jean Silva won · Featherweight', 'the same fact, whoever you picked');
  /* Every bout of the card agrees with the slate. */
  for (const s of specs) {
    const x = P4.gameAt(s, NOW);
    for (const side of ['home', 'away']) assert.equal(pickState(side, x, false, NOW), P2.pickStateOf(x, { side }, NOW, 'pool'), s.id + ' ' + side);
  }
});

test('My picks: a bout the feed has not finished is locked, never a void the clock invented', () => {
  const spec = P4.soccerSpecs(UFC331, 'ufc', '20260919', {})[0];
  const late = spec.kickoffUtc + 9 * 3600000;
  const g = P4.gameAt(spec, late);
  assert.equal(g.status, 'scheduled');
  assert.equal(pickState('home', g, false, late), 'locked');
  assert.equal(pickState('home', P4.gameAt(spec, spec.kickoffUtc - 60000), false, spec.kickoffUtc - 60000), 'picked');
});

test('My picks: a cricket result says the result and both scores; the washout and a drawn bout say why nobody scored', () => {
  const r = P4.gameAt(P4.soccerSpecs(CPL12, 'cricket', '20260912', {})[0], NOW);
  assert.equal(pickState('home', r, false, NOW), 'won');
  assert.equal(P4.winnerNotes(r, 'won'), 'Tridents won by 2 wkts (0b rem) · BT 151/8 (20 ov, target 151) · JAK 150/9');
  const w = P4.gameAt(P4.soccerSpecs(CPL30, 'cricket', '20260830', {})[0], NOW);
  assert.equal(w.status, 'void');
  assert.equal(pickState('home', w, false, NOW), 'void');
  assert.equal(P4.winnerNotes(w, 'void'), 'No result (abandoned with a toss). Nobody scored it.');
  const d = P4.gameAt(P4.soccerSpecs([drawnMainEvent()], 'ufc', '20260912', {})[0], NOW);
  assert.equal(pickState('away', d, false, NOW), 'void');
  assert.equal(P4.winnerNotes(d, 'void'), 'The bout ended with no winner - a draw or a no contest. Nobody scored it.');
  /* A football row is not touched. */
  assert.equal(P4.winnerNotes({ sport: 'nfl' }, 'won'), null);
});

test('My picks reads a UFC day: bouts, the winner of each, two sides only, and a won and a lost pick', async () => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(Date.now() - 6 * 3600000)).split('-').join('');
  const lostOne = NOCHE.find((g) => g.winner === 'away');
  const store = {
    'ag.sport': JSON.stringify('ufc'),
    'ag.poolday.ufc': today,
    ['ag.picks.ufc.' + Number(today)]: JSON.stringify({ [MAIN.id]: { side: 'home' }, [lostOne.id]: { side: 'home' }, [NOCHE[1].id]: { side: 'draw' } })
  };
  const was = { ls: globalThis.localStorage, fetch: globalThis.fetch };
  globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem() {}, removeItem() {} };
  globalThis.fetch = async (u) => String(u).startsWith('/api/day/ufc/')
    ? { ok: true, json: async () => ({ games: NOCHE }) }
    : { ok: false, json: async () => ({}) };
  try {
    const d = await P4.previewData({ teams: { teams: {} }, games: [], load: async () => ({}) }, 'ready');
    assert.equal(d.sport, 'ufc');
    assert.equal(d.noun, 'bout');
    assert.equal(d.dayLine, 'pick the winner of each bout · scored in points');
    assert.equal(d.pool.ats, false);
    const ids = d.specs.map((s) => s.id).sort();
    assert.deepEqual(ids, [MAIN.id, lostOne.id].sort(), 'a draw is not a side in UFC');
    const st = Object.fromEntries(d.specs.map((s) => [s.id, pickState(d.picks[s.id].side, P4.gameAt(s, NOW), false, NOW)]));
    assert.equal(st[MAIN.id], 'won');
    assert.equal(st[lostOne.id], 'lost');
  } finally {
    globalThis.localStorage = was.ls;
    globalThis.fetch = was.fetch;
  }
  /* The row prints "Final" and line three - never the score line, which a fight has not got. */
  const C = code(P4_SRC);
  assert.match(C, /if \(\(st === 'won' \|\| st === 'lost'\) && winnerGame\) \{\s*s1\.textContent = 'Final';/);
  assert.match(C, /const wn = winnerGame \? winnerNotes\(game, st\) : null;/);
});
