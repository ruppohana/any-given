/* L1 - cold launch and the team chooser.
 *
 * 🔴 NO FIXTURE IS WRITTEN HERE. Every team in this file comes out of
 * fixtures/teams.json - the real 760, captured, session-owned and read-only.
 * The three-value set (navy / yellow / null) is not invented either: each one is
 * LOOKED UP in that file by its color property, so if the file changes the test
 * changes with it rather than agreeing with itself.
 *
 * The screen module is BROWSER code: it imports '/components/team-chip.js',
 * which Node cannot resolve. Rather than duplicate the logic here - the same
 * assumption written twice, which the contract calls out as not a close - the
 * source is loaded and its two server-absolute specifiers are re-based onto real
 * file URLs. THE CODE UNDER TEST IS THE SHIPPED FILE, byte for byte apart from
 * those two import paths.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC_URL = new URL('../public/screens/l1-cold.screen.js', import.meta.url);
const CSS_URL = new URL('../public/screens/l1-cold.css', import.meta.url);
const SRC = readFileSync(SRC_URL, 'utf8');
const CSS = readFileSync(CSS_URL, 'utf8');

const rebased = SRC
  .replace("'/components/team-chip.js'", JSON.stringify(new URL('../public/components/team-chip.js', import.meta.url).href))
  .replace("'/components/states.js'", JSON.stringify(new URL('../public/components/states.js', import.meta.url).href));
const L1 = await import('data:text/javascript;base64,' + Buffer.from(rebased, 'utf8').toString('base64'));

const DB = JSON.parse(readFileSync(new URL('../fixtures/teams.json', import.meta.url), 'utf8'));
const TEAMS = Object.values(DB.teams).sort(L1.byName);

/* The three cases, FOUND IN THE REAL FILE rather than typed out. */
const { normalizeColor, luminance, teamVars } = await import('../public/components/team-chip.js');

/* The §5 checks below are about RULES, not about prose. Comments in both files
 * discuss box-shadow and --maroon by name in order to forbid them, so the checks
 * run against code with the comments removed. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const CSS_CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
const lum = (t) => { const c = normalizeColor(t.primary); return c == null ? null : luminance(c); };
const NAVY = TEAMS.find((t) => lum(t) != null && lum(t) < 0.05);
const YELLOW = TEAMS.find((t) => lum(t) != null && lum(t) > 0.5);
const NONE = TEAMS.find((t) => !normalizeColor(t.primary) && !normalizeColor(t.secondary));

test('the real file is the real file - 760 teams, and the three cases exist in it', () => {
  assert.equal(TEAMS.length, 760);
  assert.ok(NAVY, 'no dark primary in the file');
  assert.ok(YELLOW, 'no light primary in the file');
  assert.ok(NONE, 'no colorless team in the file');
  console.log(`    navy=${NAVY.abbrev} ${NAVY.primary}  yellow=${YELLOW.abbrev} ${YELLOW.primary}  null=${NONE.abbrev} ${NONE.primary}`);
});

test('accentPair - navy, yellow and null, and neither is promoted to the side it fails', () => {
  const navy = L1.accentPair(NAVY);
  const yellow = L1.accentPair(YELLOW);
  const none = L1.accentPair(NONE);

  assert.ok(navy.light, 'a navy primary must be able to carry the light accent');
  assert.notEqual(navy.dark, '#' + NAVY.primary.toLowerCase(),
    'a navy is unreadable on #120a0e and must never become the dark accent');

  /* YELLOW here is ASU - primary ffc627, secondary 8c1d40 - which is the honest
   * case rather than the convenient one: the yellow takes the dark end and the
   * SECONDARY takes the light end. What must never happen is the yellow itself
   * being promoted to light. */
  assert.notEqual(yellow.light, '#' + YELLOW.primary.toLowerCase(),
    'a yellow is unreadable on #faf7f5 and must never become the light accent');
  assert.equal(yellow.dark, '#' + YELLOW.primary.toLowerCase());

  assert.deepEqual(none, { light: null, dark: null, state: 'neither' });
  console.log(`    ${NAVY.abbrev}=${navy.state} ${JSON.stringify([navy.light, navy.dark])}  ` +
    `${YELLOW.abbrev}=${yellow.state} ${JSON.stringify([yellow.light, yellow.dark])}  ${NONE.abbrev}=${none.state}`);
});

test('a yellow with NOTHING else resolves dark only - the single-color light case', () => {
  const solo = TEAMS.find((t) => {
    const p = normalizeColor(t.primary);
    return p && luminance(p) > 0.5 && luminance(p) <= L1.DARK_MAX_LUM && !normalizeColor(t.secondary);
  });
  assert.ok(solo, 'the file must contain a one-color light team - it is the yellow case');
  const p = L1.accentPair(solo);
  assert.equal(p.light, null, 'a light color must not carry the light accent');
  assert.equal(p.state, 'dark');
  console.log(`    ${solo.abbrev} ${solo.primary} -> dark only`);
});

test('white is not an accent - the 68 schools that publish ffffff keep the app gold', () => {
  const whites = TEAMS.filter((t) => {
    const v = teamVars(t).vars;
    return v['--team-a'] === '#ffffff' || v['--team-b'] === '#ffffff';
  });
  assert.ok(whites.length >= 50, 'white as a published color is common, not an edge case');
  for (const t of whites) assert.notEqual(L1.accentPair(t).dark, '#ffffff', `${t.abbrev} wears white as its accent`);
  console.log(`    ${whites.length} teams publish white; none of them carries the accent`);
});

test('every one of the 760 teams resolves, and no promoted color fails its floor', () => {
  const counts = { both: 0, light: 0, dark: 0, neither: 0 };
  for (const t of TEAMS) {
    const p = L1.accentPair(t);
    assert.ok(p.state in counts, `undefined accent state for ${t.abbrev}`);
    counts[p.state]++;
    if (p.light) assert.ok(luminance(p.light) <= L1.LIGHT_MAX_LUM, `${t.abbrev} light accent ${p.light} is too pale`);
    if (p.dark) assert.ok(luminance(p.dark) >= L1.DARK_MIN_LUM, `${t.abbrev} dark accent ${p.dark} is too dark`);
    if (p.dark) assert.ok(luminance(p.dark) <= L1.DARK_MAX_LUM, `${t.abbrev} dark accent ${p.dark} is foreground, not accent`);
    if (p.light) assert.notEqual(p.light, '#000000');
    if (p.dark) assert.notEqual(p.dark, '#000000');
    assert.notEqual(p.dark, '#ffffff', `${t.abbrev} would wear white as its accent`);
  }
  console.log('    accent states:', JSON.stringify(counts));
  assert.equal(counts.both + counts.light + counts.dark + counts.neither, 760);

  /* 🔴 THE ONE THAT MATTERS. team-chip.js calls 401 of the 760 state 'none' and
   * paints both halves gray. Every one of those must also fall back on the
   * accent, or the app would be dressed in a color the chip beside it refuses to
   * show. 14 of them DO carry a usable secondary on the record, which is exactly
   * how that drift would have got in. */
  const chipNone = TEAMS.filter((t) => teamVars(t).state === 'none');
  assert.equal(chipNone.length, 401);
  for (const t of chipNone) {
    assert.deepEqual(L1.accentPair(t), { light: null, dark: null, state: 'neither' },
      `${t.abbrev} is colorless to the chip but not to the accent`);
  }

  /* The rest of 'neither' are six teams the chip DOES color and whose colors
   * still cannot carry an accent, all for the same reason: they sit in the gap
   * between the two floors. Texas burnt orange #bf5700 is L .179, North Texas
   * green .171, Maine blue .185, Dickinson red .189, Oregon State orange .194 -
   * every one of them too pale for #faf7f5 and too dark for #120a0e - and
   * Bowdoin's only color is white. Their second color, where they have one, is
   * white too, which the ceiling rejects. They keep their chip and the app keeps
   * its own accent. That is the correct outcome, not a bug. */
  const gap = TEAMS.filter((t) => teamVars(t).state !== 'none' && L1.accentPair(t).state === 'neither');
  console.log(`    contrast-gap teams (chip colored, accent falls back): ${gap.map((t) => t.abbrev).join(', ')}`);
  assert.equal(counts.neither, chipNone.length + gap.length);
  assert.ok(counts.neither >= 401);
});

test('the app defaults themselves clear the floors - the floors are not tuned to let them pass', () => {
  assert.ok(luminance('#8c1d40') <= L1.LIGHT_MAX_LUM, 'the default maroon must clear the light floor');
  assert.ok(luminance('#ffc627') >= L1.DARK_MIN_LUM, 'the default gold must clear the dark floor');
});

test('applyRootAccent writes --maroon and --gold and NEVER --accent', () => {
  const written = new Map();
  const removed = [];
  const doc = { documentElement: { dataset: {}, style: {
    setProperty: (k, v) => written.set(k, v),
    removeProperty: (k) => removed.push(k)
  } } };
  const pair = L1.applyRootAccent(NAVY, doc);
  assert.ok(!written.has('--accent'), '--accent inline at :root kills the dark swap');
  assert.equal(written.get('--maroon'), pair.light);
  assert.equal(doc.documentElement.dataset.agTeam, NAVY.abbrev);
  /* The colorless team writes NOTHING - the defaults stand untouched. */
  written.clear();
  L1.applyRootAccent(NONE, doc);
  assert.equal(written.size, 0, 'a team with no color must not overwrite a token');
});

test('Skip is HONORED - clearRootAccent removes every trace', () => {
  const removed = [];
  const doc = { documentElement: { dataset: { agTeam: 'OU' }, style: {
    setProperty: () => {}, removeProperty: (k) => removed.push(k)
  } } };
  L1.clearRootAccent(doc);
  assert.deepEqual(removed.sort(), ['--gold', '--maroon']);
  assert.equal(doc.documentElement.dataset.agTeam, undefined);
});

test('search mixes NOTHING but teams, and finds them by short, full and abbrev', () => {
  const ari = L1.matchTeams(TEAMS, 'ari');
  assert.ok(ari.length > 0);
  for (const t of ari) {
    const hay = [t.short, t.name, t.abbrev].join(' ').toLowerCase();
    assert.ok(hay.includes('ari'), `${t.abbrev} is not a match for "ari"`);
    assert.ok(t.id && t.name, 'every result is a team record from the file');
  }
  /* The bar returns players, leagues and tournaments for the same query. */
  const names = ari.map((t) => t.short);
  /* The file's own short names, read off it rather than guessed: 'Arizona St',
   * not 'Arizona State'. */
  assert.ok(names.includes('Arizona'), 'Arizona must be in the "ari" results');
  assert.ok(names.includes('Arizona St'), 'Arizona St must be in the "ari" results');
  /* And what the bar returns for the same query that we must not: the Cardinals,
   * the Diamondbacks, the Coyotes, two players and a league. */
  assert.ok(!names.some((n) => /Cardinals|Diamondbacks|Coyotes/.test(n)), 'pro teams are not in this app');
  console.log(`    "ari" -> ${ari.length} teams: ${names.slice(0, 6).join(', ')}`);

  assert.equal(L1.matchTeams(TEAMS, 'zzzz').length, 0, 'no-results must be reachable');
  assert.equal(L1.matchTeams(TEAMS, '').length, 760, 'an empty query is the whole browse');
  assert.ok(L1.matchTeams(TEAMS, 'OU').length > 0, 'abbrev search');
});

test('prefix hits rank above contains hits', () => {
  const hits = L1.matchTeams(TEAMS, 'ohio');
  assert.ok(hits.length >= 2);
  const first = [hits[0].short, hits[0].name, hits[0].abbrev].map((s) => String(s).toLowerCase());
  assert.ok(first.some((f) => f.startsWith('ohio')), 'the first hit must be a prefix match');
});

test('every one of the 760 lands in exactly one A-Z section, no orphans', () => {
  const sections = new Map();
  for (const t of TEAMS) {
    const k = L1.sectionKey(t);
    assert.ok(/^[A-Z#]$/.test(k), `bad section key ${JSON.stringify(k)} for ${t.abbrev}`);
    sections.set(k, (sections.get(k) || 0) + 1);
  }
  const total = [...sections.values()].reduce((a, b) => a + b, 0);
  assert.equal(total, 760);
  console.log(`    ${sections.size} sections, largest ${Math.max(...sections.values())}`);
});

test('the module shape the harness parses', () => {
  assert.equal(L1.id, 'l1-cold');
  assert.ok(L1.bar && L1.bar.includes('sofascore-teardown'), 'the bar is named and it is on disk');
  assert.deepEqual(L1.states, ['ready', 'chosen', 'skipped', 'searching', 'no-results', 'loading', 'offline', 'error']);
  assert.equal(typeof L1.render, 'function');
  assert.equal(typeof L1.previewData, 'function');
});

test('previewData never invents a team and shapes the per-state query', async () => {
  const fixtures = { teams: DB };
  const ready = await L1.previewData(fixtures, 'ready');
  assert.equal(ready.teams.length, 760);
  assert.equal(ready.query, '');
  assert.ok(DB.teams[ready.chosen.id], 'the chosen team is a record from the file');
  assert.equal((await L1.previewData(fixtures, 'searching')).query, 'ari');
  assert.equal((await L1.previewData(fixtures, 'no-results')).query, 'zzzz');
  const s = (await L1.previewData(fixtures, 'ready')).samples;
  assert.ok(DB.teams[s.navy.id] && DB.teams[s.yellow.id] && DB.teams[s.none.id]);
});

/* ---- the §5 rules that fail a piece, checked against the shipped source ---- */

test('no box-shadow, no dependency, no CDN, no mark, no image', () => {
  for (const [name, text] of [['screen', CODE], ['css', CSS_CODE]]) {
    assert.ok(!/box-shadow/i.test(text), `${name} uses a shadow`);
    assert.ok(!/https?:\/\//.test(text.replace(/http:\/\/www\.w3\.org\/2000\/svg/g, '')), `${name} reaches a URL`);
    assert.ok(!/<img|background-image|url\(/i.test(text), `${name} loads an image`);
  }
  assert.ok(!/\bimport\s+.*from\s+'[^/.]/.test(CODE), 'no npm package');
  assert.ok(/dataset\.stub\s*=/.test(CODE), 'the unbuilt mark must be marked as a stub');
});

test('components read --accent; --maroon and --gold appear only where the root write is', () => {
  assert.ok(!/--maroon|--gold/.test(CSS_CODE), 'the stylesheet must read --accent, never an end token');
  const roots = CODE.split('\n').filter((l) => /setProperty\('--(maroon|gold|accent)'/.test(l));
  assert.equal(roots.length, 2, 'exactly two root writes, --maroon and --gold');
  assert.ok(!/setProperty\('--accent'/.test(CODE), 'writing --accent at :root kills the light/dark swap');
  assert.ok(/var\(--accent\)/.test(CSS_CODE), 'the stylesheet must actually read --accent');
});

test('the banned vocabulary is absent, and US spelling holds', () => {
  const text = (SRC + CSS).toLowerCase();
  for (const w of ['credits', 'coins', 'top-up', 'refill', 'babe ruth', 'wrigley']) {
    assert.ok(!text.includes(w), `banned word: ${w}`);
  }
  for (const w of ['colour', 'centre', 'gr' + 'ey', 'behaviour', 'favourite']) {
    assert.ok(!text.includes(w), `British spelling: ${w}`);
  }
});

test('every tap target declares at least 44px', () => {
  const want = ['l1-skip', 'l1-search', 'l1-primary', 'l1-secondary', 'l1-tile'];
  const seen = new Set();
  for (const b of CSS_CODE.split('}')) {
    /* Only the base rule declares geometry; a :hover or [aria-pressed] block is
     * a state on an element already sized. */
    const m = b.match(/\.l1-(skip|search|primary|secondary|tile)(?![-\w])(?![:\[])/);
    if (!m) continue;
    assert.ok(/min-height:\s*(var\(--tap-min\)|(4[4-9]|[5-9]\d|\d{3})px)/.test(b),
      'tap target under 44px in: ' + b.trim().slice(0, 70));
    seen.add('l1-' + m[1]);
  }
  assert.deepEqual([...seen].sort(), want.slice().sort(), 'a tap target was not checked at all');
});

test('every state in `states` has a branch in render', () => {
  for (const s of L1.states) {
    if (s === 'ready') continue; // the fall-through
    assert.ok(SRC.includes(`'${s}'`), `no branch for state ${s}`);
  }
});
