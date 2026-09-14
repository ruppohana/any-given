/* SELF-HOST THE CRESTS.
 *
 * 🔴 WHY. Jason, 2026-09-08: "you need to scrape the nfl logos as well." The app
 * was hot-linking a.espncdn.com on every row of every screen, which is three
 * separate bets we do not need to take:
 *   1. ESPN ALREADY BLOCKS US. Their scoreboard and summary endpoints return 403
 *      to Cloudflare's datacenters - that is why the poller runs on the host at
 *      all. The image CDN answers today. It is the same company.
 *   2. A slate of 131 games is 262 requests to somebody else's origin, on a phone,
 *      during a game.
 *   3. A crest that fails to load is a hole in the row, and the fallback fires per
 *      image rather than once.
 *
 * Serving them ourselves costs a few megabytes on an origin we already run.
 *
 * BOTH VARIANTS, ALWAYS. /500/ is drawn for white paper and /500-dark/ for a dark
 * ground; where a team needs no dark version ESPN returns the same bytes, so
 * fetching both is never wrong and the theme watcher needs both present.
 *
 *   node tools/scrape-logos.mjs nfl
 *   node tools/scrape-logos.mjs college
 *   node tools/scrape-logos.mjs conf
 *   node tools/scrape-logos.mjs leagues      league marks -> public/logos/leagues/<sport>-500(-dark).png
 *   node tools/scrape-logos.mjs nba|wnba|mlb|nhl   crests by lowercase abbreviation
 *   node tools/scrape-logos.mjs soccer       club crests by ESPN id, all five leagues
 *   node tools/scrape-logos.mjs ncaa-extra   college hockey + women's hoops schools not on disk yet
 *
 * 🔴 "ARE WE NOT CAPTURING THE REST OF THE LOGOS?" Jason, 2026-09-13. We were not:
 * college, the NFL and the conferences were on our origin and everything added
 * after them - the NBA, WNBA, MLB, NHL, soccer, and their league marks - was
 * hot-linked or shown as text. The modes below the first three close that.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const which = process.argv[2] || 'nfl';
const root = fileURLToPath(new URL('../public/logos/', import.meta.url));
const FEED = fileURLToPath(new URL('../fixtures/feed/', import.meta.url));

/* 🔴 ESPN's own /teams endpoint 403s from this machine even though the summary
 * endpoint does not, so the NFL roster is NOT fetched - these are the league's
 * stable ESPN ids, and an id that does not resolve is simply skipped. Inventing
 * a team list would be inventing a fixture.
 *
 * (2026-09-13: that 403 was the site.api host. site.web.api answers /teams from
 * this machine - the modes below read their rosters from it.) */
const NFL_IDS = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,33,34];

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  + ' (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

async function grab(path, id, variant, dir) {
  const out = `${dir}/${variant}/${id}.png`;
  if (existsSync(out)) return 'skip';
  const url = `https://a.espncdn.com/i/teamlogos/${path}/${variant}/${id}.png`;
  return save(url, out, variant === '500-dark' ? `${dir}/500/${id}.png` : null);
}

/** Fetch one PNG to `out`. `lightTwin` is the light file to copy when a dark one
 *  does not exist - see below. Returns bytes written, an HTTP status, or 'tiny'. */
async function save(url, out, lightTwin) {
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) {
    /* 🔴 NO DARK VARIANT? USE THE LIGHT ONE. Found the hard way: `ncaa/500-dark`
     * exists for essentially every school, and `nfl/500-dark` exists for THREE
     * TEAMS. Everything else 404s.
     *
     * That mattered because the app asks for the dark file by name on a dark
     * theme — so on the NFL it 404'd against our origin, 404'd again against the
     * CDN fallback, and fell all the way through to the drawn two-color chip.
     * Jason saw NE and SEA as coloured squares and said "Logos not in."
     *
     * ESPN already does this for teams whose crest works on dark: it returns the
     * SAME BYTES for both names. Copying the light file where the dark one does
     * not exist just makes that explicit, and means the app never has to know. */
    if (lightTwin && existsSync(lightTwin)) { writeFileSync(out, readFileSync(lightTwin)); return statSync(out).size; }
    return res.status;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 200) return 'tiny';           // a placeholder, not a crest
  writeFileSync(out, buf);
  return buf.length;
}

async function getJson(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

/* ------------------------------------------------------------ the rosters
 * 🔴 NEVER TYPED FROM MEMORY. Two sources, unioned:
 *   - ESPN's /teams for the league, on site.web.api (the site.api host refuses
 *     by user agent; this one answers - checked 2026-09-13), and
 *   - every competitor in the real day files under fixtures/feed/, so a club
 *     in a captured game that has since left the league (relegation, a UCL
 *     side from last season) still gets its crest. */
const API = 'https://site.web.api.espn.com/apis/site/v2/sports/';

async function apiTeams(sportPath) {
  const j = await getJson(`${API}${sportPath}/teams?limit=1000`);
  return j.sports[0].leagues[0].teams.map((x) => x.team)
    .map((t) => ({ id: String(t.id), abbr: String(t.abbreviation || ''), name: t.displayName, hasLogo: !!(t.logos && t.logos.length) }));
}

/** Teams in every captured day under fixtures/feed/ whose name starts `prefix`. */
function fixtureTeams(prefix) {
  if (!prefix) return [];
  const out = [];
  for (const f of readdirSync(FEED).filter((n) => n.startsWith(prefix) && n.endsWith('.json'))) {
    const j = JSON.parse(readFileSync(FEED + f, 'utf8'));
    for (const e of j.events || []) for (const c of (e.competitions || [])) for (const k of (c.competitors || [])) {
      if (k.team && k.team.id) out.push({ id: String(k.team.id), abbr: String(k.team.abbreviation || ''), name: k.team.displayName, hasLogo: true, from: f });
    }
  }
  return out;
}

function union(...lists) {
  const m = new Map();
  for (const l of lists) for (const t of l) if (!m.has(t.id)) m.set(t.id, t);
  return [...m.values()];
}

const pngs = (dir) => { try { return readdirSync(dir).filter((f) => f.endsWith('.png')).length; } catch { return 0; } };

/** Fetch both variants for every key; report what is ON DISK afterwards. */
async function crests(label, path, dir, teams, keyOf) {
  for (const v of ['500', '500-dark']) mkdirSync(`${dir}/${v}`, { recursive: true });
  let bytes = 0, written = 0, skipped = 0;
  const fails = [];
  for (const t of teams) {
    const key = keyOf(t);
    if (!key) { fails.push(`${t.id}:no-key`); continue; }
    for (const v of ['500', '500-dark']) {
      const r = await grab(path, key, v, dir);
      if (r === 'skip') skipped++;
      else if (typeof r === 'number' && r > 200) { written++; bytes += r; }
      else fails.push(`${key}/${v}=${r}`);
    }
  }
  /* 🔴 COUNT THE FILES, NOT THE LOOP - see the NFL/college branch below. */
  const have = teams.filter((t) => keyOf(t) && existsSync(`${dir}/500/${keyOf(t)}.png`) && existsSync(`${dir}/500-dark/${keyOf(t)}.png`));
  console.log(`${label}: ${written} written, ${skipped} already present, ${(bytes / 1048576).toFixed(2)} MB fetched`);
  console.log(`  ${have.length} of ${teams.length} teams have BOTH variants on disk; folder holds ${pngs(dir + '/500')} light + ${pngs(dir + '/500-dark')} dark`);
  const missing = teams.filter((t) => !have.includes(t));
  if (missing.length) console.log('  no crest:', missing.map((t) => `${keyOf(t) || t.id} (${t.name}${t.hasLogo ? '' : ', ESPN lists no logo'})`).join('; '));
  if (fails.length) console.log('  fetch misses:', fails.slice(0, 30).join(' '), fails.length > 30 ? `(+${fails.length - 30})` : '');
  return { have: have.length, of: teams.length };
}

/* ------------------------------------------------------------ league marks
 * Named by OUR sport id, beside the nfl/ncaa pair already there:
 *   public/logos/leagues/<id>-500.png and <id>-500-dark.png
 *
 * 🔴 NOT FORMULA 1. ESPN serves leagues/500/f1.png, and it is not fetched: F1's
 * own guidelines allow the name "to inform or report and not to brand" and no
 * logo at all (vault: Any Given/wiki/live-sports-data-2026-09-12.md, Logos
 * table). Its tile stays the words. Not NASCAR either - ESPN has no mark for it
 * (leagues/500/nascar.png is 404) and we do not draw one. */
const LEAGUE_MARKS = [
  ['nba', 'teamlogos/leagues', 'nba'],
  ['wnba', 'teamlogos/leagues', 'wnba'],
  ['mlb', 'teamlogos/leagues', 'mlb'],
  ['nhl', 'teamlogos/leagues', 'nhl'],
  /* Soccer league marks are a different folder, by ESPN league id - the ids the
     day feeds' leagues[0].logos name (checked 2026-09-13). */
  ['epl', 'leaguelogos/soccer', '23'],
  ['mls', 'leaguelogos/soccer', '19'],
  ['ucl', 'leaguelogos/soccer', '2'],
  ['laliga', 'leaguelogos/soccer', '15'],
  ['ligamx', 'leaguelogos/soccer', '22']
];

/* 🔴 LIGA MX: ESPN'S DARK FILE IS A RETIRED MARK. leaguelogos/soccer/500-dark/22.png
 * is "LIGA BBVA Bancomer" - the league's old sponsor name - while the light file
 * is the current "LIGA BBVA MX" (looked at 2026-09-13). A stale sponsor mark must
 * not ship, so the dark file is always the light one here, even over a file that
 * is already on disk. */
const DARK_IS_LIGHT = new Set(['ligamx']);

if (which === 'leagues') {
  const dir = root + 'leagues';
  mkdirSync(dir, { recursive: true });
  let bytes = 0;
  for (const [id, path, file] of LEAGUE_MARKS) {
    for (const v of ['500', '500-dark']) {
      const out = `${dir}/${id}-${v}.png`;
      if (v === '500-dark' && DARK_IS_LIGHT.has(id) && existsSync(`${dir}/${id}-500.png`)) {
        writeFileSync(out, readFileSync(`${dir}/${id}-500.png`));
        continue;
      }
      if (existsSync(out)) continue;
      const r = await save(`https://a.espncdn.com/i/${path}/${v}/${file}.png`, out, v === '500-dark' ? `${dir}/${id}-500.png` : null);
      if (typeof r === 'number') bytes += r; else console.log(`  ${id} ${v}: ${r}`);
    }
  }
  const both = LEAGUE_MARKS.filter(([id]) => existsSync(`${dir}/${id}-500.png`) && existsSync(`${dir}/${id}-500-dark.png`));
  console.log(`league marks: ${both.length} of ${LEAGUE_MARKS.length} with both variants on disk (${both.map(([id]) => id).join(', ')}); folder holds ${pngs(dir)} files; ${(bytes / 1048576).toFixed(2)} MB fetched`);
  process.exit(0);
}

/* ------------------------------------------------------------ pro crests
 * 🔴 BY ABBREVIATION, LOWERCASE - that is how ESPN files these four leagues
 * (nba/500/bos.png), and the /teams endpoint's own logo hrefs agree for all 107
 * teams (checked 2026-09-13). An id here is a different team in college. */
const PRO = { nba: 'basketball/nba', wnba: 'basketball/wnba', mlb: 'baseball/mlb', nhl: 'hockey/nhl' };
if (PRO[which]) {
  const teams = union(await apiTeams(PRO[which]), fixtureTeams(`espn-${which}-`));
  /* Saved under the name team-chip.js asks for: a Windows-reserved abbreviation
     (CON - the Connecticut Sun) gets a trailing underscore. See localName there. */
  await crests(which, which, root + which, teams, (t) => {
    const s = t.abbr.toLowerCase();
    return /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/.test(s) ? s + '_' : s;
  });
  process.exit(0);
}

/* ------------------------------------------------------------ soccer clubs
 * 🔴 BY TEAM ID, under ESPN's one `soccer` folder for every league. A club's
 * abbreviation is not its file name there (BOU is 349.png). */
const SOCCER = { epl: 'eng.1', mls: 'usa.1', ucl: 'uefa.champions', laliga: 'esp.1', ligamx: 'mex.1' };
if (which === 'soccer') {
  const per = {};
  const lists = [];
  for (const [id, slug] of Object.entries(SOCCER)) {
    const t = union(await apiTeams(`soccer/${slug}`), fixtureTeams(`espn-${id}-`));
    per[id] = t; lists.push(t);
  }
  const teams = union(...lists);
  await crests('soccer', 'soccer', root + 'soccer', teams, (t) => t.id);
  for (const [id, t] of Object.entries(per)) {
    const n = t.filter((x) => existsSync(`${root}soccer/500/${x.id}.png`) && existsSync(`${root}soccer/500-dark/${x.id}.png`)).length;
    console.log(`  ${id}: ${n} of ${t.length}`);
  }
  process.exit(0);
}

/* ------------------------------------------------------------ fighter flags
 * 🔴 A UFC "TEAM" IS A FIGHTER, and the crest the pool draws for one is the
 * fighter's COUNTRY FLAG: src/slate-day.ts parseUfcDay puts ESPN's flag href in
 * team.logo (teamlogos/countries/500/usa.png). NEVER a UFC mark - the vault's
 * Logos table says no UFC/TKO marks at all (Any Given/wiki/live-sports-data-
 * 2026-09-12.md), so leagues/500/ufc.png is not fetched either. Saved by ESPN's
 * own file name (usa, bra, sko). The list is every flag on the captured cards in
 * fixtures/feed/ plus this year's UFC calendar when ESPN answers for it. */
const FLAG = /\/teamlogos\/countries\/500\/([a-z0-9]+)\.png$/i;
function flagsIn(payload, into) {
  for (const e of payload.events || []) for (const c of e.competitions || []) for (const k of c.competitors || []) {
    const m = FLAG.exec(String(k.athlete?.flag?.href || ''));
    if (m) into.set(m[1].toLowerCase(), { id: m[1].toLowerCase(), abbr: m[1], name: k.athlete.flag.alt || m[1], hasLogo: true });
  }
}
if (which === 'countries') {
  const found = new Map();
  for (const f of readdirSync(FEED).filter((n) => n.startsWith('espn-ufc-') && n.endsWith('.json'))) {
    flagsIn(JSON.parse(readFileSync(FEED + f, 'utf8')), found);
  }
  const fromFixtures = found.size;
  const y = new Date().getFullYear();
  try { flagsIn(await getJson(`${API}mma/ufc/scoreboard?dates=${y}0101-${y}1231&limit=1000`), found); }
  catch (e) { console.log(`  the ${y} UFC calendar did not answer (${e.message}) - fixtures only`); }
  console.log(`  ${fromFixtures} flags on the captured cards, ${found.size} with this year's calendar`);
  await crests('country flags', 'countries', root + 'countries', [...found.values()], (t) => t.id);
  process.exit(0);
}

/* ------------------------------------------------------------ cricket crests
 * A cricket team's logo is ESPN's file when it has one (teamlogos/cricket/500/
 * <id>.png, from team.logo in the feed). Several 404 - a CPL side in its first
 * season has no file - and those draw the chip, which is what team.color is for.
 * ESPN has almost no 500-dark cricket files, so the dark copy is the light one. */
if (which === 'cricket') {
  const found = new Map();
  const re = /\/teamlogos\/cricket\/500\/(\d+)\.png$/i;
  for (const f of readdirSync(FEED).filter((n) => n.startsWith('espn-cricket-') && n.endsWith('.json'))) {
    const j = JSON.parse(readFileSync(FEED + f, 'utf8'));
    for (const e of j.events || []) for (const c of e.competitions || []) for (const k of c.competitors || []) {
      const m = re.exec(String(k.team?.logo || ''));
      if (m) found.set(m[1], { id: m[1], abbr: k.team.abbreviation, name: k.team.displayName, hasLogo: true });
    }
  }
  await crests('cricket', 'cricket', root + 'cricket', [...found.values()], (t) => t.id);
  process.exit(0);
}

/* ------------------------------------------------------------ the college gaps
 * College hockey and women's college basketball are college crests by SCHOOL id
 * under ncaa - most already on disk from the football list. Only the missing
 * ones are fetched; a school ESPN lists with no logo is reported, not invented. */
if (which === 'ncaa-extra') {
  const hockey = await apiTeams('hockey/mens-college-hockey');
  const wcbb = union(await apiTeams('basketball/womens-college-basketball'), fixtureTeams('espn-wcbb-'));
  const dir = root + 'ncaa';
  for (const [label, teams] of [['college hockey', hockey], ["women's college basketball", wcbb]]) {
    await crests(label, 'ncaa', dir, teams, (t) => t.id);
  }
  process.exit(0);
}

/* 🔴 CONFERENCE MARKS. Jason: "scrape the conference logos as well for the
 * ncaa." They live on a DIFFERENT path from club crests — ncaa_conf, not ncaa —
 * and the id space is not contiguous: ACC is 1, Big 12 is 4, Big Ten 5, SEC 8,
 * AAC 151, and there are holes throughout. So the range is walked and a 404 is
 * simply a number nobody uses, not a failure. Some conferences have no dark
 * variant at all, which the fetch reports and the fallback covers. */
if (which === 'conf') {
  const dir = root + 'ncaa_conf';
  for (const v of ['500', '500-dark']) mkdirSync(`${dir}/${v}`, { recursive: true });
  let ok = 0, bytes = 0, found = [];
  for (let id = 1; id <= 200; id++) {
    for (const v of ['500', '500-dark']) {
      const r = await grab('ncaa_conf', id, v, dir);
      /* 🔴 COUNT WHAT WAS WRITTEN, NOT WHAT WAS TRIED. The first version pushed
       * the id on every iteration and reported "200 conferences" when 26 exist.
       * A summary line that counts the loop instead of the result is a lie that
       * reads like a success. */
      if (typeof r === 'number' && r > 200) { ok++; bytes += r; if (v === '500') found.push(id); }
      else if (r === 'tiny' || r === 404) { /* an id nobody uses */ }
    }
  }
  /* 🔴 COUNT THE DIRECTORY. This line claimed "200 conferences" and then "174",
   * both times while 26 files existed, because it counted loop iterations. Third
   * strike: it now reads the folder, like the other branch does. */
  const n = (v) => { try { return readdirSync(`${dir}/${v}`).filter((f) => f.endsWith('.png')).length; } catch { return 0; } };
  console.log(`conferences ON DISK: ${n('500')} light + ${n('500-dark')} dark, ${(bytes / 1048576).toFixed(2)} MB fetched this run`);
  process.exit(0);
}

if (which !== 'nfl' && which !== 'college') {
  console.error(`unknown mode "${which}" - nfl | college | conf | leagues | nba | wnba | mlb | nhl | soccer | ncaa-extra`);
  process.exit(2);
}

const league = which === 'nfl'
  ? { path: 'nfl', dir: root + 'nfl', ids: NFL_IDS }
  : (() => {
      const t = JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/teams.json', import.meta.url)), 'utf8'));
      const teams = t.teams || t;
      return { path: 'ncaa', dir: root + 'ncaa', ids: Object.values(teams).map((x) => x.id).filter(Boolean) };
    })();

for (const v of ['500', '500-dark']) mkdirSync(`${league.dir}/${v}`, { recursive: true });

let ok = 0, miss = 0, bytes = 0, skipped = 0;
const missing = [];
for (const id of league.ids) {
  for (const v of ['500', '500-dark']) {
    const r = await grab(league.path, id, v, league.dir);
    if (r === 'skip') { skipped++; continue; }
    if (typeof r === 'number' && r > 200) { ok++; bytes += r; }
    else { miss++; missing.push(`${id}/${v}=${r}`); }
  }
}
/* 🔴 COUNT THE FILES, NOT THE LOOP. This reported "64 saved" for the NFL when 35
 * files were on disk, and "200 conferences" when 26 existed. Twice. A summary
 * that counts intentions reads exactly like one that counts results, and the
 * only way to tell them apart is to go and look — so it goes and looks. */
const onDisk = (v) => { try { return readdirSync(`${league.dir}/${v}`).filter((f) => f.endsWith('.png')).length; } catch { return 0; } };
const light = onDisk('500'), dark = onDisk('500-dark');
console.log(`${which}: ${ok} written this run, ${skipped} already present, ${miss} missing`);
console.log(`ON DISK: ${light} light + ${dark} dark = ${light + dark} files, ${(bytes / 1048576).toFixed(2)} MB fetched`);
if (dark < light) console.log(`  🔴 ${light - dark} still missing a dark file — the app will fall through to the chip`);
if (missing.length) console.log('missing:', missing.slice(0, 20).join(' '), missing.length > 20 ? `(+${missing.length - 20})` : '');
