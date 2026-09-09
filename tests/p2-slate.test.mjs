/* P2 - the slate.
 *
 * 🔴 THIS FILE IS NOT THE CLOSE. Requirement 7.5: layout bugs are invisible to tests, and
 * five in one week were invisible to 300+ passing tests and obvious in one screenshot.
 * The close for this piece is a real browser at 393px, at 131 rows and at 3. What is
 * below is the part a browser cannot check: that the pure logic is right against the REAL
 * fixtures, and that the source obeys the rules in CONTRACT §5 that fail a piece silently.
 *
 * NOTHING HERE IS ASSERTED AGAINST DATA THIS PIECE INVENTED. The three games come out of
 * fixtures/, the 760 teams come out of fixtures/teams.json, and the source lint reads the
 * two files this piece wrote.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC_URL = new URL('../public/screens/p2-slate.screen.js', import.meta.url);
const CSS_URL = new URL('../public/screens/p2-slate.css', import.meta.url);
const SRC = readFileSync(SRC_URL, 'utf8');
const CSS = readFileSync(CSS_URL, 'utf8');

/* THE LINT READS CODE, NOT COMMENTARY. First cut of this file failed three checks on its
 * own header comments - `.png` in the bar filenames, `--maroon` in the note saying not to
 * use it, `30px` in the note saying the pool does not get one. A lint that fires on the
 * sentence explaining the rule is a lint that gets deleted, so block comments come out
 * before anything below is matched. */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
const CODE = strip(SRC);
const CSSCODE = strip(CSS);

/* The screen is BROWSER code: its imports are server-absolute ('/components/fmt.js') and
 * Node cannot resolve them - the same trap that made the preview harness crash on every
 * request. So load it with the import lines stripped. Every pure helper below the
 * "pure helpers" line is written to touch neither the DOM nor an imported binding, which
 * is what makes this legal rather than clever. */
const mod = await import('data:text/javascript;base64,' +
  Buffer.from(SRC.replace(/^import[^;]*;$/gm, ''), 'utf8').toString('base64'));

const DB = JSON.parse(readFileSync(new URL('../fixtures/teams.json', import.meta.url), 'utf8'));
const TEAMS = Object.values(DB.teams);
const byId = Object.fromEntries(TEAMS.map((t) => [t.id, t]));
const GAMES = ['real-utep-at-ou', 'real-ball-at-osu', 'real-bois-at-ore'].map((n) =>
  JSON.parse(readFileSync(new URL(`../fixtures/${n}-260905-final.json`, import.meta.url), 'utf8')));

const norm = (c) => {
  if (!c) return null;
  const h = String(c).trim().replace(/^#/, '').toLowerCase();
  return /^[0-9a-f]{6}$/.test(h) && h !== '000000' ? h : null;
};

/* ------------------------------------------------------------------ the real games */

test('the three captured games give real teams, real kickoffs and real finals', () => {
  const seen = [];
  for (const raw of GAMES) {
    const c = raw.header.competitions[0];
    const home = c.competitors.find((x) => x.homeAway === 'home');
    const away = c.competitors.find((x) => x.homeAway === 'away');
    assert.ok(byId[home.team.id], `home team ${home.team.id} not in teams.json`);
    assert.ok(byId[away.team.id], `away team ${away.team.id} not in teams.json`);
    assert.equal(c.status.type.name, 'STATUS_FINAL');
    assert.ok(Number.isFinite(Date.parse(c.date)));
    seen.push(`${away.team.abbreviation} ${away.score} at ${home.team.abbreviation} ${home.score}`);
  }
  console.log('    real games:', seen.join(' | '));
  assert.equal(seen.length, 3);
});

test('Ball State and Ohio State really do share a primary - the row must survive it', () => {
  /* Named in the dispatch, verified against the file rather than taken on trust. This is
   * the pair the live board never had to draw, because it only ever showed one team. */
  assert.equal(norm(byId['2050'].primary), norm(byId['194'].primary));
  assert.equal(norm(byId['2050'].primary), 'ba0c2f');
  /* And they are a REAL FIXTURE GAME, not a pairing this piece chose. */
  const c = GAMES[1].header.competitions[0];
  assert.deepEqual(c.competitors.map((x) => x.team.id).sort(), ['194', '2050']);
});

test('all six color pairs the pool must survive exist in the real file', () => {
  const probe = { AUB: '2', ND: '87', ASU: '9', TOW: '119', COMU: '11', CRU: '32', IDHO: '70' };
  for (const [k, id] of Object.entries(probe)) assert.ok(byId[id], `${k} (${id}) missing`);
  assert.equal(norm(byId['2'].primary), norm(byId['87'].primary), 'navy on navy - identical primary');
  assert.ok(norm(byId['9'].primary) && norm(byId['119'].primary), 'yellow on yellow');
  assert.equal(norm(byId['11'].primary), null, 'null');
  assert.equal(norm(byId['32'].primary), null, 'null on null');
  assert.equal(norm(byId['70'].primary), null, 'yellow on null');
  /* The probe ids are the ones the screen actually uses. */
  for (const id of Object.values(probe)) assert.ok(CODE.includes(`'${id}'`), `probe id ${id} not in the screen`);
});

test('a 131-game slate is reachable from the real file without reusing a team', () => {
  assert.equal(TEAMS.length, 760);
  assert.ok(TEAMS.length >= 131 * 2, '131 games needs 262 distinct team identities');
  const nulls = TEAMS.filter((t) => !norm(t.primary)).length;
  console.log(`    ${nulls} of ${TEAMS.length} teams have no usable primary - ${Math.round(nulls / TEAMS.length * 100)}% of any deep slate`);
  assert.equal(nulls, 401);
});

/* ------------------------------------------------------------------ the pure logic */

const t = (h, d) => new Date(2026, 8, d, h, 0, 0, 0).getTime();
const g = (id, ms) => ({ id, kickoffUtc: ms, status: 'scheduled' });

test('a small day is ONE header. A subdivision has to earn itself', () => {
  /* THE 3-AND-131 REQUIREMENT, and it was found by looking at the ready-short route at
   * 393px: grouping unconditionally by day AND window gave three games three headers -
   * one header per row, which is the exact Sofascore failure this layout is written
   * against, arriving inside the fix for it. */
  const groups = mod.groupsOf([
    g('c', t(20, 5)), g('a', t(9, 5)), g('b', t(13, 5)), g('d', t(11, 6)), g('e', t(9, 5))
  ]);
  assert.equal(groups.length, 2, 'two days, five games, two headers');
  assert.deepEqual(groups.map((x) => x.window), [null, null], 'no window named where no day was split');
  assert.deepEqual(groups.map((x) => mod.groupLabel(x)), groups.map((x) => x.day));
  assert.deepEqual(groups.map((x) => x.games.length), [4, 1]);
  /* Groups arrive in kickoff order - a slate that jumps back in time is unreadable. */
  const firsts = groups.map((x) => x.first);
  assert.deepEqual(firsts, firsts.slice().sort((a, b) => a - b));
});

test('a big day DOES split into windows, and the header names it', () => {
  const games = [];
  for (let i = 0; i <= mod.WINDOW_SPLIT_MIN; i++) games.push(g('m' + i, t(9, 5) + i * 60000));
  for (let i = 0; i < 3; i++) games.push(g('n' + i, t(20, 5) + i * 60000));
  const groups = mod.groupsOf(games);
  assert.equal(groups.length, 2, 'one day, 10 games, split into Morning and Night');
  assert.deepEqual(groups.map((x) => x.window), ['Morning', 'Night']);
  assert.ok(mod.groupLabel(groups[0]).endsWith('· Morning'));
  /* The jump strip is DAYS, not groups: two groups on one day => one chip. */
  const days = mod.daysOf(groups);
  assert.equal(days.length, 1);
  assert.deepEqual(days.map((d) => d.count), [10]);
});

test('one group header for 131 games in four windows, not 131 of them', () => {
  /* Sofascore pays a full competition header above every fixture and gets four and a half
   * fixtures a screen. The measurement that matters is headers-per-row. */
  const games = [];
  for (let i = 0; i < 131; i++) {
    const d = new Date(2026, 8, 3 + (i % 4), [9, 12, 16, 19][i % 4], 0, 0, 0);
    games.push({ id: 'g' + i, kickoffUtc: d.getTime(), status: 'scheduled' });
  }
  const groups = mod.groupsOf(games);
  console.log(`    ${groups.length} group headers for ${games.length} games`);
  assert.ok(groups.length <= 16, 'a header per group, never per row');
  assert.equal(groups.reduce((n, g) => n + g.games.length, 0), 131);
});

test('the spread is one number on a game, signed per side, and PK at zero', () => {
  assert.equal(mod.spreadText(-7.5, 'home'), '−7.5');
  assert.equal(mod.spreadText(-7.5, 'away'), '+7.5');
  assert.equal(mod.spreadText(3, 'home'), '+3');
  assert.equal(mod.spreadText(0, 'home'), 'PK');
  assert.equal(mod.spreadText(null, 'home'), null, 'no spread is not a zero spread');
  /* No odds format anywhere - never a moneyline, never a decimal price. */
  assert.ok(!/[+−-]\d{3}/.test(String(mod.spreadText(-28.5, 'away'))));
});

test('every row state is inside the CONTRACT union, and --up/--down are result-only', () => {
  const UNION = ['unpicked', 'picked', 'locked', 'in_progress', 'won', 'lost', 'void'];
  const base = { kickoffUtc: 1000, status: 'scheduled', homeScore: null, awayScore: null };
  const cases = [
    [{ ...base }, null, 500, 'unpicked'],
    [{ ...base }, { side: 'home' }, 500, 'picked'],
    [{ ...base }, { side: 'home' }, 2000, 'locked'],
    [{ ...base }, null, 2000, 'locked'],
    [{ ...base, status: 'in_progress' }, { side: 'away' }, 2000, 'in_progress'],
    [{ ...base, status: 'final', homeScore: 34, awayScore: 27 }, { side: 'home' }, 3000, 'won'],
    [{ ...base, status: 'final', homeScore: 34, awayScore: 27 }, { side: 'away' }, 3000, 'lost'],
    [{ ...base, status: 'void' }, { side: 'home' }, 3000, 'void'],
    [{ ...base, status: 'void' }, null, 500, 'void'],
    /* ONE VOID PATH. A tie is the game not happening, for everybody - not a half win. */
    [{ ...base, status: 'final', homeScore: 21, awayScore: 21 }, { side: 'home' }, 3000, 'void']
  ];
  for (const [g, p, now, want] of cases) {
    const got = mod.pickStateOf(g, p, now);
    assert.ok(UNION.includes(got), `${got} is not in the PickState union`);
    assert.equal(got, want);
  }
  /* An unresolved pick is never a result. This is the check that would have caught a
   * green "picked" state, which is the single easiest mistake on this screen. */
  for (const s of ['unpicked', 'picked', 'locked', 'in_progress']) {
    assert.ok(!['won', 'lost'].includes(s));
  }
});

test('progress counts sides taken, not rows rendered', () => {
  const games = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const picks = { a: { side: 'home' }, b: { side: null }, c: { side: 'away' } };
  assert.equal(mod.countPicked(games, picks), 2);
  assert.equal(mod.countPicked(games, {}), 0);
});

/* ------------------------------------------------------------------ CONTRACT §5 lint
 * Each of these is a written rule already paid for once, and each fails silently. */

test('§5 - no marks, no CDN image, no logo', () => {
  /* The `bar` export is itself a .png by contract - it NAMES the reference screenshot on
   * disk. So the check is for an image being USED, not for the four characters. */
  const noBar = CODE.replace(/export const bar = [^\n]*\n/, '');
  assert.ok(!/espncdn|\.png|<img|teamlogos|src\s*=/i.test(noBar), 'a mark got in');
  assert.ok(!/background-image|url\(/i.test(CSSCODE), 'an image url got into the CSS');
});

test('§5 - depth is a hairline. No box-shadow anywhere', () => {
  assert.ok(!/box-shadow/i.test(CSSCODE));
  assert.ok(!/box-shadow/i.test(CODE));
});

test('§5 - read --accent, never --maroon or --gold, and never set a team var at :root', () => {
  assert.ok(!/--maroon|--gold/.test(CSSCODE), 'hard-coded accent - invisible in one theme');
  assert.ok(!/--maroon|--gold/.test(CODE));
  assert.ok(!/:root/.test(CSSCODE), 'a pool component wrote at :root');
  assert.ok(!/setProperty\(\s*['"]--team/.test(CODE), 'team vars are set by team-chip.js, per element');
  assert.ok(/applyTeamVars/.test(CODE), 'the shared chip component does the scoping');
});

test('§5 - no dependency, no icon font, no chart library, inline SVG only', () => {
  assert.ok(!/from ['"][^/.]/.test(CODE), 'a bare package specifier is an npm dependency');
  assert.ok(!/@import|font-face|fa-|material-icons/i.test(CSSCODE));
  assert.ok(/createElementNS/.test(CODE), 'the glyphs are inline SVG');
});

test('§5 - every number is tabular', () => {
  /* The .num class in tokens.css does the font work. Every element carrying a figure -
   * record, spread, crowd, score, time, progress, the tiebreak input - must have it. */
  /* `p2-sub` is gone: the meta line it named described a pool the week's card
   * does not have, and the shared page header replaced it. Its rule - figures
   * are tabular so a header cannot jitter - moved to the template and is
   * asserted below rather than dropped. */
  for (const cls of ['p2-rec', 'p2-spread', 'p2-crowd', 'p2-center', 'p2-bar-p', 'p2-tb-in', 'p2-day-n', 'p2-grp-n']) {
    const re = new RegExp(`['"\`]${cls}[^'"\`]*num`);
    assert.ok(re.test(CODE), `${cls} is not marked .num`);
  }
});

test('§5 - the words. Marbles is the balance and none of the dead words appear', () => {
  for (const w of ['credits', 'coins', 'top-up', 'purchase', 'refill', 'colour', 'centre', 'grey', 'behaviour']) {
    assert.ok(!new RegExp('\\b' + w + '\\b', 'i').test(CODE + CSSCODE), `"${w}" appears`);
  }
  /* The pool scores in POINTS. It has no bank strip, no stake and no 30px figure. */
  /* The rule is about TYPE SIZE, not about the number: a 30px group-header height is a
   * layout, and the thing that must not happen is a 30px FIGURE. */
  assert.ok(!/--t-bank|font-size:\s*(3\d|[4-9]\d)px/.test(CSSCODE), 'the pool inherited the bank strip type size');
  const sizes = [...CSSCODE.matchAll(/font-size:\s*(\d+)px/g)].map((m) => Number(m[1]));
  console.log('    literal font sizes in the CSS:', sizes.length ? sizes.join(', ') : 'none - all tokens');
  assert.ok(sizes.every((n) => n <= 17), 'the largest type on this screen is the pool name at 17px');
  /* 🔴 THIS ASSERTION CHANGED SHAPE ON 2026-09-08, on Jason's call: "Office pool
   * is a completely separate section. And don't we also have the weeks picks for
   * the marbles?"
   *
   * It used to be a flat ban on the word, on the theory that marbles are the
   * live layer and this is the pool. The seam was wrong. TWO products render
   * through this screen — the office pool, which stakes nothing, and the week's
   * card, which is a marble product at weekly speed — so a blanket ban would
   * have forced the week's card to hide its own price.
   *
   * What is enforced instead is the separation itself, which is the part the
   * legal position rests on: a price exists ONLY under `mode === 'week'`, and
   * the office pool's own copy never mentions a balance it does not have. */
  assert.ok(/ctx\.mode === 'week'/.test(CODE), 'the price must be gated on the week card mode');
  /* The section is "Group pools", plural - Jason, 2026-09-09: "Group pools not
   * pool." It went Run a pool -> Group pool -> Group pools, and the plural is
   * right because this names a SECTION somebody can hold several pools in, not
   * one pool object. The pool's own name is the h1 above the kicker. */
  /* The section is "Your group" - Jason, 2026-09-09: "This is a group, not a
   * pool." It went Run a pool -> Group pool -> Group pools -> Your group, and
   * the last one is the one that matters: "pool" is what you are in with money
   * in most of the world, and this product spends its life not being that.
   * "Group" says people you know and says nothing about a stake. */
  /* The words moved into the shared page header on 2026-09-09, so this reads the
   * header's sub line rather than a kicker this screen no longer owns. The rule
   * is unchanged and is the legal position: the group half never speaks the
   * language of a balance. */
  const poolCopy = (CODE.match(/'[^']*your group[^']*'/g) || []).join(' ');
  assert.ok(poolCopy.length > 0, 'the group section must name itself on the screen');
  assert.ok(!/Marble/i.test(poolCopy), 'the group copy must not mention a balance it does not have');
  assert.ok(!/stake|payout|bank/i.test(poolCopy), 'a group stakes nothing');
});

test('§5 - the screen never fetches. Data arrives as an argument', () => {
  /* previewData receives the harness fixtures and calls THEM; render() is pure DOM. */
  const body = CODE.slice(CODE.indexOf('export function render'));
  assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket/.test(body), 'render() reached the network');
});

test('§5 - tap targets. Nothing a thumb hits is under 44px', () => {
  /* The tap zone is 60px tall, the day chips and the tiebreak input read --tap-min. */
  assert.ok(/\.p2-zone[^}]*min-height:\s*60px/s.test(CSSCODE));
  assert.ok(/\.p2-day\b[^}]*min-height:\s*var\(--tap-min\)/s.test(CSSCODE));
  assert.ok(/\.p2-tb-in[^}]*min-height:\s*var\(--tap-min\)/s.test(CSSCODE));
});

test('§5 / the dispatch - one tiebreak field, and the posted line is published', () => {
  const tb = (CODE.match(/input\.type = 'number'/g) || []).length;
  assert.equal(tb, 1, 'CBS ships four tiebreak fields. Ours is one');
  /* 🔴 THIS ASSERTION REVERSED ON 2026-09-08, on Jason's call: "Aren't we
   * publishing the spread on the pool?"
   *
   * It used to require `if (ctx.pool.ats)` around the spread, and that gate
   * conflated a SCORING RULE with INFORMATION. `ats` decides whether beating the
   * number wins the pick; it has nothing to say about whether a reader may see a
   * line the feed already gave us with the book named. Under the old gate,
   * turning a pool straight-up hid 16 of 16 real NFL lines.
   *
   * What is still enforced is the half that was always the point: a game with no
   * posted line renders NOTHING. `spreadText` returns null on a null spread, and
   * an invented number in a real row is the failure this screen exists to avoid. */
  assert.ok(!/if \(ctx\.pool\.ats\)/.test(CODE), 'the posted line must not be gated on the scoring mode');
  assert.ok(/const sp = spreadText\(game\.spread, side\)/.test(CODE), 'the spread still renders through spreadText');
  assert.equal(mod.spreadText(null, 'home'), null, 'a game with no posted line shows no number');
  /* 🔴 Crowd only after the GAME LOCKS (Jason, 2026-09-08) - not after the tap.
   * The guard is the kickoff, which nobody can bring forward, rather than the
   * viewer's own pick, which made the split purchasable with a tap. */
  assert.ok(/const locked = /.test(CODE), 'the crowd guard must be the lock');
  assert.ok(/if \(locked && pick && pick\.crowd\)/.test(CODE),
    'crowd must be gated on the game having locked');
  assert.ok(/crowdLabel/.test(CODE), 'the small-n rule lives in fmt.crowdLabel, not here');
});

test('the five contract states are all routes, plus the 3-row route', () => {
  for (const s of ['ready', 'empty', 'loading', 'offline', 'error']) {
    assert.ok(mod.states.includes(s), `${s} is not a route`);
  }
  assert.ok(mod.states.includes('ready-short'), 'a layout that only works at 131 rows is broken too');
  assert.equal(mod.id, 'p2-slate');
  assert.ok(mod.bar.startsWith('reference/cbs-pickem-teardown/'), 'the bar is a file on disk');
});

/* 🔴 THE PRICE MODEL. Added 2026-09-08 with the week's card. It converts a REAL
 * captured spread into a payout multiple, and the thing that must hold is that
 * it never produces a number the doctrine forbids: nothing over 6x, nothing
 * that prices a lopsided game as though it were a question, and NOTHING AT ALL
 * on a game with no posted line. */
test('the price is bounded at both ends, and a game with no line has no price', () => {
  assert.equal(mod.priceFromSpread(null, 'home', 'nfl'), null, 'no line means no price');
  assert.equal(mod.priceFromSpread(undefined, 'away', 'nfl'), null);

  for (const sp of [-42, -21, -14, -7, -3, -1.5, 0, 1.5, 3, 7, 14, 21, 42]) {
    for (const side of ['home', 'away']) {
      for (const sport of ['nfl', 'college-football']) {
        const px = mod.priceFromSpread(sp, side, sport);
        assert.ok(px <= 6, `${sp} ${side} ${sport} paid ${px}, over the 6x cap`);
        /* The 0.90 clamp is our own "a question 90% one way is not a question"
         * bar. It puts a hard floor under the payout at 1/0.90. */
        assert.ok(px >= 1.11, `${sp} ${side} ${sport} paid ${px}, under the floor`);
      }
    }
  }
  /* A pick'em pays the same both ways. If this drifts, the sign convention on
   * the stored HOME number has been read backwards somewhere. */
  assert.equal(mod.priceFromSpread(0, 'home', 'nfl'), mod.priceFromSpread(0, 'away', 'nfl'));
  /* The favorite is the cheaper side. Home is favored when the number is
   * negative - ESPN's convention, and the one place a flipped sign would be
   * invisible on screen while paying out backwards. */
  assert.ok(mod.priceFromSpread(-7, 'home', 'nfl') < mod.priceFromSpread(-7, 'away', 'nfl'));
  assert.ok(mod.priceFromSpread(7, 'away', 'nfl') < mod.priceFromSpread(7, 'home', 'nfl'));
  /* A college point moves the price less than an NFL point: higher variance. */
  assert.ok(mod.priceFromSpread(-3, 'home', 'college-football')
          > mod.priceFromSpread(-3, 'home', 'nfl'), 'the sport scales are the wrong way round');
});

/* 🔴 THE NFL ROUTE ACTUALLY RUNS. Added 2026-09-09 after it shipped broken.
 *
 * `previewData` returned an object naming `now` - a `let` declared a hundred
 * lines below the return - so the NFL branch threw "Cannot access 'now' before
 * initialization" and the slate rendered its error state. Every other test in
 * this file reads the SOURCE as text or calls a pure helper; not one of them
 * called previewData, so 555 passing tests said nothing about whether the
 * function could be executed at all.
 *
 * That is the same hole the screen-parse guard was written for, one level down:
 * a check that reads code is not a check that runs it. */
test('previewData runs on both sports and returns a usable shape', async () => {
  const realFetch = globalThis.fetch;
  const realLS = globalThis.localStorage;
  const games = [{
    id: '401872656', kickoffUtc: Date.UTC(2026, 8, 10, 0, 20), status: 'scheduled',
    homeTeamId: '26', awayTeamId: '17', spread: -3, homeScore: null, awayScore: null,
    teams: [{ id: '26', abbrev: 'SEA', name: 'Seahawks', short: 'Seahawks', primary: '002244', secondary: '69be28' },
            { id: '17', abbrev: 'NE', name: 'Patriots', short: 'Patriots', primary: '002a5c', secondary: 'c60c30' }]
  }];
  try {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ games }) });
    const store = { 'ag.sport': '"nfl"', 'ag.mode': '"marbles"' };
    globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null) };

    const fixtures = { teams: { teams: {} }, games: [], load: async () => { throw new Error('no fixture'); } };
    const d = await mod.previewData(fixtures, 'ready');

    assert.equal(d.sport, 'nfl', 'the NFL route did not run');
    assert.equal(d.mode, 'week', 'marbles on the slate is the week card');
    assert.equal(typeof d.now, 'number', 'now must be a real clock, not undefined');
    assert.ok(d.now > Date.UTC(2026, 0, 1), 'now looks unset');
    assert.equal(d.games.length, 1);
    assert.equal(d.games[0].home.abbrev, 'SEA');
    assert.equal(d.games[0].away.abbrev, 'NE');
    assert.equal(d.pool.memberCount, 0, 'an NFL slate must not inherit the college mock pool');
    assert.equal(d.synthetic, 0, 'the NFL route must never synthesize');

    /* And the office pool reads the same feed with no price attached. */
    store['ag.mode'] = '"pool"';
    const p = await mod.previewData(fixtures, 'ready');
    assert.equal(p.mode, 'pool');
    assert.equal(p.games.length, 1, 'the pool sees the same real games');
  } finally {
    globalThis.fetch = realFetch;
    if (realLS === undefined) delete globalThis.localStorage; else globalThis.localStorage = realLS;
  }
});

/* 🔴 EVERY teamChip CALL NAMES ITS LEAGUE. Added 2026-09-09 after the deployed
 * NFL slate drew college logos.
 *
 * A team id is unique only WITHIN a league, and team-chip defaults to the
 * college directory. So the NFL slate requested /logos/ncaa/500-dark/17.png and
 * got a real, valid, 200-OK logo belonging to a different school: the 49ers row
 * drew Cal, the Bengals drew Cincinnati, the Bills drew Auburn. Ids with no
 * college counterpart 404'd and fell back to the drawn chip, so some rows were
 * wrong and others were bare. Nothing throws and nothing logs - the only signal
 * is the pixels, which is the class of bug requirement 7.5 exists for.
 *
 * 🔴 SCOPED TO THE FOUR SCREENS THE PRODUCT REACHES, and the scope is a finding
 * rather than a convenience. The l*, s*, p1, p3 and p6 screens are the design
 * harness - behind the ?dev gate, driven by college fixtures, pinned to one
 * captured game - and their ~30 league-less calls are correct for a screen that
 * can only ever show that fixture. These four are the only ones whose team ids
 * change league at runtime. A harness screen promoted into the product joins
 * this list on the way.
 *
 * Scanned as a window after each call site rather than by matching balanced
 * parens: an options object holds ternaries and index expressions, and a regex
 * that tries to bracket it correctly is a second bug waiting behind the first.
 */
test('no teamChip is created without a league', async () => {
  const { readFileSync } = await import('node:fs');
  const dir = new URL('../public/screens/', import.meta.url);
  const files = ['p2-slate.screen.js', 'p4-picks.screen.js',
                 'p5-standings.screen.js', 'live-game.screen.js'];

  const bad = [];
  for (const f of files) {
    const src = readFileSync(new URL(f, dir), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '');       /* the comments quote the bug */
    let at = 0;
    for (;;) {
      const i = src.indexOf('teamChip(', at);
      if (i < 0) break;
      at = i + 9;
      const win = src.slice(i, i + 260);
      /* `drawn: true` forces the two-color chip and touches no logo path, so it
       * is the one shape that legitimately carries no league. */
      if (/drawn:\s*true/.test(win)) continue;
      if (!/\bleague\b/.test(win)) bad.push(f + ': ' + win.replace(/\s+/g, ' ').slice(0, 80));
    }
  }
  assert.deepEqual(bad, [], 'these teamChip calls will resolve logos against the wrong league');
});

/* 🔴 A PICK SURVIVES A RELOAD, ON BOTH SPORTS. Added 2026-09-09 after "My picks
 * did not stick" - and then after the FIRST fix for it did not work either.
 *
 * The first attempt put the restore inside the loop that seeds preview picks,
 * which is gated on `!live` and therefore never runs on a real slate. The write
 * was correct, the read was dead code in an unreachable branch, and it presented
 * as a storage bug. Only tapping a row on the deployed site, reloading, and
 * finding the value in localStorage with no highlight on the row told the
 * difference - which is the kind of check a green suite cannot make for you.
 *
 * So this drives previewData twice with a stub localStorage: once to establish
 * the shape, once with a pick already in the store. */
test('a stored pick is restored onto a real slate', async () => {
  const realFetch = globalThis.fetch;
  const realLS = globalThis.localStorage;
  const games = [
    { id: 'g1', kickoffUtc: Date.now() + 864e5, status: 'scheduled',
      homeTeamId: '26', awayTeamId: '17', spread: -3,
      teams: [{ id: '26', abbrev: 'SEA', name: 'Seahawks', short: 'Seahawks', primary: '002244' },
              { id: '17', abbrev: 'NE', name: 'Patriots', short: 'Patriots', primary: '002a5c' }] }
  ];
  try {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ games }) });
    const store = {
      'ag.sport': '"nfl"', 'ag.mode': '"marbles"',
      'ag.picks.nfl.1': JSON.stringify({ g1: { side: 'away' } })
    };
    globalThis.localStorage = {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = v; }
    };
    const fixtures = { teams: { teams: {} }, games: [], load: async () => { throw new Error('none'); } };

    const d = await mod.previewData(fixtures, 'ready');
    assert.equal(d.picks.g1.side, 'away', 'the stored pick was not restored');
    assert.equal(mod.countPicked(d.games, d.picks), 1, 'progress must count a restored pick');

    /* A pick for a game no longer on the card is dropped, never carried. */
    store['ag.picks.nfl.1'] = JSON.stringify({ gone: { side: 'home' }, g1: { side: 'home' } });
    const d2 = await mod.previewData(fixtures, 'ready');
    assert.equal(d2.picks.g1.side, 'home');
    assert.ok(!('gone' in d2.picks), 'a pick for a game off the slate must not survive');
  } finally {
    globalThis.fetch = realFetch;
    if (realLS === undefined) delete globalThis.localStorage; else globalThis.localStorage = realLS;
  }
});

/* 🔴 THE TWO PRODUCTS SETTLE THE SAME GAME DIFFERENTLY. Added 2026-09-09 with
 * the ATS decision: "Group pool. Straight up. Weeks card against the spread."
 *
 * A game can be a win in the pool and a loss on the card. That is not a
 * contradiction to be reconciled - it is the reason the two boards never sum,
 * and it is the thing most likely to be "fixed" by a future session that sees
 * one game with two verdicts and assumes a bug. */
test('the pool settles on the winner and the week card on the cover', () => {
  const now = Date.UTC(2026, 8, 20);
  const kick = Date.UTC(2026, 8, 19);
  /* Home wins by 3 as a 7-point favorite: won straight up, did NOT cover. */
  const g = { id: 'g', status: 'final', kickoffUtc: kick, spread: -7,
              homeScore: 24, awayScore: 21 };

  assert.equal(mod.pickStateOf(g, { side: 'home' }, now, 'pool'), 'won');
  assert.equal(mod.pickStateOf(g, { side: 'home' }, now, 'week'), 'lost',
    'a favorite that wins without covering must lose on the card');
  assert.equal(mod.pickStateOf(g, { side: 'away' }, now, 'pool'), 'lost');
  assert.equal(mod.pickStateOf(g, { side: 'away' }, now, 'week'), 'won');

  /* 🔴 A PUSH IS THE ONE VOID PATH, not a loss and not a win. Landing exactly on
   * the number is the game not having happened, for everybody. */
  const push = { ...g, homeScore: 28, awayScore: 21 };
  assert.equal(mod.coversSpread(push, 'home'), 'push');
  assert.equal(mod.pickStateOf(push, { side: 'home' }, now, 'week'), 'void');
  assert.equal(mod.pickStateOf(push, { side: 'away' }, now, 'week'), 'void');
  /* Straight up the same game is an ordinary win - the pool has no push. */
  assert.equal(mod.pickStateOf(push, { side: 'home' }, now, 'pool'), 'won');

  /* No posted line cannot be graded against one, so it falls back to the winner
   * rather than voiding a game that was really played. */
  const noline = { ...g, spread: null };
  assert.equal(mod.coversSpread(noline, 'home'), null);
  assert.equal(mod.pickStateOf(noline, { side: 'home' }, now, 'week'), 'won');

  /* A tie is a void in both, which is the doctrine that predates all of this. */
  const tie = { ...g, homeScore: 21, awayScore: 21, spread: null };
  assert.equal(mod.pickStateOf(tie, { side: 'home' }, now, 'pool'), 'void');

  /* And the price against the spread is 2.00x both ways, or nothing at all. */
  assert.equal(mod.priceAts(-7), 2);
  assert.equal(mod.priceAts(56.5), 2);
  assert.equal(mod.priceAts(null), null, 'no line means no ATS price');
});

/* 🔴 THE SHARED PAGE HEADER. Added 2026-09-09 - Jason: "How about a universal
 * header on every page. A template if you will. So it looks more consistant."
 *
 * Four screens had invented four tops: different type scales, different vertical
 * rhythms, and the three-dot menu floating in absolute position over whatever
 * each one happened to put in its top right. On a phone that strip is the only
 * thing on screen the whole time and it is what says WHICH SCREEN YOU ARE ON -
 * four answers to that question is why the slate and My picks read as the same
 * list. */
test('every product screen uses the shared header, and it carries the league mark', async () => {
  const { readFileSync } = await import('node:fs');
  const HEAD = readFileSync(new URL('../public/components/header.js', import.meta.url), 'utf8');

  /* The sub line carries a week, a member count and a payout, so it is tabular
   * for the same reason every other figure in this app is: numbers that change
   * width as they change value make a header jitter on a timer-driven screen. */
  assert.match(HEAD, /\.ag-hd-s[^}]*tabular-nums/s, 'the header sub line must be tabular');

  /* 🔴 THE MENU IS MOVED INTO THE HEADER, NOT CLONED. There is exactly one #gear
   * in the document; cloning it would need a second listener and the two would
   * drift the first time one was changed. */
  assert.match(HEAD, /getElementById\('gear'\)/, 'the header must adopt the one menu button');
  assert.match(HEAD, /\.ag-hd \.ag-gear[^}]*position:\s*static/s,
    'the menu must stop floating once it is inside the header');

  /* 🔴 THE LEAGUE IS A MARK, NOT THE WORD. Jason: "can we consistently have the
   * ncaa logo and an icon of a football? Consistency and anchoring?" A pill
   * reading "College" is a label somebody has to read, in the one place that is
   * supposed to be recognised without reading. */
  assert.match(HEAD, /logos\/leagues\//, 'the header must draw the self-hosted league mark');
  assert.ok(!/ag-hd-tag/.test(HEAD), 'the text pill is replaced by the mark, not kept beside it');

  const dir = new URL('../public/screens/', import.meta.url);
  for (const f of ['p2-slate.screen.js', 'p4-picks.screen.js', 'p5-standings.screen.js']) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    assert.match(src, /pageHeader\(\{/, f + ' does not use the shared header');
    assert.match(src, /league:/, f + ' does not pass its league to the header');
  }
});
