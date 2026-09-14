/* EVERY MARK THE APP ASKS OUR ORIGIN FOR IS ON DISK.
 *
 * Jason, 2026-09-13: "are we not capturing the rest of the logos?" We were not:
 * college, the NFL and the conferences were self-hosted, and everything after them
 * - the NBA, WNBA, MLB, NHL, soccer, and their league marks - was hot-linked from
 * ESPN's CDN or shown as text. tools/scrape-logos.mjs closed that.
 *
 * 🔴 CHECKED FROM THE FILES, NOT THE SCRAPER'S SUMMARY. The scraper has lied three
 * times by counting its loop instead of its output, so this reads the disk: the
 * league marks Home really references (lifted out of the shipped screen, both
 * variants), and every team in the real captured days under fixtures/feed/, at
 * the path the REAL logoUrl asks for.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { logoUrl } from '../public/components/team-chip.js';

const SRC = readFileSync(new URL('../public/screens/live-game.screen.js', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n');
const onDisk = (p) => existsSync(new URL('../public' + p, import.meta.url));

/** A top-level declaration, by name, through its closing line at column 0 -
 *  the same lift tests/home-sports.test.mjs uses. */
function lift(name) {
  const m = new RegExp('\\n(function ' + name + '\\(|const ' + name + ' = )').exec(SRC);
  assert.ok(m, name + ' is declared at the top level');
  const start = m.index + 1;
  const end = SRC.slice(start).search(/\n(\}|\};|\];)\n/);
  const from = start + end + 1;
  return SRC.slice(start, SRC.indexOf('\n', from));
}
const pick = (name) => new Function(lift(name) + '\nreturn ' + name + ';')();
const HOME_MARKS = pick('HOME_MARKS');
const HOME_FAMILIES = pick('HOME_FAMILIES');
const homeMarkDark = pick('homeMarkDark');

test('every league mark Home draws is on our origin, light and dark', () => {
  const ids = HOME_FAMILIES.flatMap((f) => f.leagues.map(([id]) => id));
  /* Words: cricket - ESPN's cricket marks are per competition, not one for the sport -
     and the Presidents Cup, which has no mark here (2026-09-13). F1 and UFC carry their
     marks since Jason asked (2026-09-13: "racing logos?"). Big Game squares (2026-09-13) is
     words too - the game's own mark is the NFL's. */
  assert.deepEqual(ids.filter((id) => !HOME_MARKS[id]).sort(), ['cricket', 'golf-cup', 'squares']);
  for (const [id, src] of Object.entries(HOME_MARKS)) {
    assert.match(src, /^\/logos\/leagues\/[a-z0-9]+-500\.(png|svg)$/, id + ' is a local league mark');
    assert.ok(onDisk(src), src + ' is on disk');
    assert.equal(homeMarkDark(src), src.replace(/-500\.(png|svg)$/, '-500-dark.$1'));
    assert.ok(onDisk(homeMarkDark(src)), homeMarkDark(src) + ' is on disk');
  }
});

test('racing and combat: the F1 and UFC marks, and NASCAR as our own drawn checkered flag', () => {
  const files = readdirSync(new URL('../public/logos/leagues/', import.meta.url));
  assert.deepEqual(files.filter((f) => /^(f1|ufc|nascar)/.test(f)).sort(),
    ['f1-500-dark.png', 'f1-500.png', 'nascar-500-dark.svg', 'nascar-500.svg', 'ufc-500-dark.png', 'ufc-500.png']);
  /* NASCAR has no mark on ESPN's CDN: the flag is ours, not a NASCAR logo. */
  const flag = readFileSync(new URL('../public/logos/leagues/nascar-500.svg', import.meta.url), 'utf8');
  assert.match(flag, /<title>Checkered flag<\/title>/);
  assert.equal(HOME_MARKS.nascar, HOME_MARKS['nascar-oreilly']);
  assert.equal(HOME_MARKS.nascar, HOME_MARKS['nascar-truck']);
});

test('the Home screen asks ESPN\'s CDN for nothing, and every league mark it names is on disk', () => {
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(/a\.espncdn\.com/.test(code), false, 'a hot-linked image');
  /* Page 2's shields are built from a template: nfl, nba or ncaa. */
  for (const n of ['nfl', 'nba', 'ncaa']) {
    assert.ok(onDisk(`/logos/leagues/${n}-500.png`) && onDisk(`/logos/leagues/${n}-500-dark.png`), n);
  }
});

/* ------------------------------------------------------------ the crests
 * Each captured day, each competitor, both variants, at the path the app asks
 * for. The league is what the screens pass to teamChip for that sport. */
const FEEDS = [
  ['nba', 'nba'], ['mlb', 'mlb'], ['nhl', 'nhl'],
  ['epl', 'epl'], ['mls', 'mls'], ['ucl', 'ucl'],
  ['wcbb', 'womens-college-basketball']
];
const FEED = new URL('../fixtures/feed/', import.meta.url);

for (const [prefix, league] of FEEDS) {
  const files = readdirSync(FEED).filter((n) => n.startsWith(`espn-${prefix}-scoreboard-`) && n.endsWith('.json'));
  test(`${league}: every team in ${files.join(', ')} has a crest on our origin, light and dark`, () => {
    assert.ok(files.length >= 1, 'a captured day to check against');
    const teams = new Map();
    for (const f of files) {
      const j = JSON.parse(readFileSync(new URL(f, FEED), 'utf8'));
      for (const e of j.events || []) for (const c of e.competitions || []) for (const k of c.competitors || []) {
        if (k.team && k.team.id) teams.set(String(k.team.id), { id: String(k.team.id), abbreviation: k.team.abbreviation, name: k.team.displayName });
      }
    }
    assert.ok(teams.size >= 2, 'teams in the fixture');
    const missing = [];
    for (const t of teams.values()) {
      for (const v of ['500', '500-dark']) {
        const u = logoUrl(t, league, v);
        assert.ok(u && u.startsWith('/logos/'), `${t.name}: our origin first, got ${u}`);
        if (!onDisk(u)) missing.push(`${t.name} ${u}`);
      }
    }
    assert.deepEqual(missing, [], `${missing.length} crests missing of ${teams.size * 2}`);
  });
}

/* ------------------------------------------------------------ UFC and cricket
 * A UFC "team" is a fighter ('f' + ESPN athlete id) whose crest is the country
 * flag in team.logo; a cricket team's is ESPN's file when it has one. Both are
 * read out of the feed's URL, never built from an id. */
test('ufc: every fighter on the captured cards has their flag on our origin, light and dark - never an id path', () => {
  const files = readdirSync(FEED).filter((n) => n.startsWith('espn-ufc-scoreboard-') && n.endsWith('.json'));
  assert.ok(files.length >= 1);
  let n = 0;
  const missing = [];
  for (const f of files) {
    const j = JSON.parse(readFileSync(new URL(f, FEED), 'utf8'));
    for (const e of j.events || []) for (const c of e.competitions || []) for (const k of c.competitors || []) {
      const t = { id: 'f' + k.id, logo: k.athlete && k.athlete.flag && k.athlete.flag.href };
      n++;
      for (const v of ['500', '500-dark']) {
        const u = logoUrl(t, 'ufc', v);
        assert.match(u, /^\/logos\/countries\/500(-dark)?\/[a-z0-9]+\.png$/, 'a flag, from our origin');
        assert.ok(!u.includes(String(k.id)), 'never the athlete id');
        if (!onDisk(u)) missing.push(u);
      }
    }
  }
  assert.ok(n >= 20, 'fighters on the cards');
  assert.deepEqual(missing, []);
});

test('ufc and cricket read the file name out of team.logo; no URL, or another shape, is the drawn chip', async () => {
  const { cdnLogoUrl } = await import('../public/components/team-chip.js');
  const usa = { id: 'f123', logo: 'https://a.espncdn.com/i/teamlogos/countries/500/usa.png' };
  assert.equal(logoUrl(usa, 'ufc', '500'), '/logos/countries/500/usa.png');
  assert.equal(logoUrl(usa, 'ufc', '500-dark'), '/logos/countries/500-dark/usa.png');
  assert.equal(cdnLogoUrl(usa, 'ufc', '500-dark'), usa.logo, 'the feed\'s own URL as the fallback');
  assert.equal(logoUrl({ id: 'f1' }, 'ufc', '500'), null, 'no flag');
  assert.equal(logoUrl({ id: 'f1', logo: 'https://a.espncdn.com/i/teamlogos/cricket/500/5.png' }, 'ufc', '500'), null, 'not a flag');
  assert.equal(logoUrl({ id: '5', logo: 'https://a.espncdn.com/i/teamlogos/cricket/500/5.png' }, 'cricket', '500'), '/logos/cricket/500/5.png');
  assert.equal(logoUrl({ id: '5', logo: null }, 'cricket', '500'), null);
});

test('cricket: every team ESPN has a file for is on our origin; the two it 404s are not invented', () => {
  /* Antigua and Barbuda Falcons and Jamaica Kingsmen (CPL): ESPN's own file is 404,
     checked 2026-09-13. They draw the chip, off team.color. */
  const ESPN_404 = new Set(['1428675', '1534178']);
  const files = readdirSync(FEED).filter((n) => n.startsWith('espn-cricket-') && n.endsWith('.json'));
  assert.ok(files.length >= 1);
  const seen = new Set();
  for (const f of files) {
    const j = JSON.parse(readFileSync(new URL(f, FEED), 'utf8'));
    for (const e of j.events || []) for (const c of e.competitions || []) for (const k of c.competitors || []) {
      const t = { id: String(k.team.id), logo: k.team.logo };
      seen.add(t.id);
      for (const v of ['500', '500-dark']) {
        const u = logoUrl(t, 'cricket', v);
        if (ESPN_404.has(t.id)) assert.equal(onDisk(u), false, `${k.team.displayName}: no file is invented`);
        else assert.ok(onDisk(u), `${k.team.displayName} ${u}`);
      }
    }
  }
  assert.ok(seen.size >= 6, 'teams in the captured matches');
});
