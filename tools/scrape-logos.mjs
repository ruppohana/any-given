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
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const which = process.argv[2] || 'nfl';
const root = fileURLToPath(new URL('../public/logos/', import.meta.url));

/* 🔴 ESPN's own /teams endpoint 403s from this machine even though the summary
 * endpoint does not, so the NFL roster is NOT fetched - these are the league's
 * stable ESPN ids, and an id that does not resolve is simply skipped. Inventing
 * a team list would be inventing a fixture. */
const NFL_IDS = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,33,34];

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  + ' (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

async function grab(path, id, variant, dir) {
  const out = `${dir}/${variant}/${id}.png`;
  if (existsSync(out)) return 'skip';
  const url = `https://a.espncdn.com/i/teamlogos/${path}/${variant}/${id}.png`;
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
    if (variant === '500-dark') {
      const light = `${dir}/500/${id}.png`;
      if (existsSync(light)) { writeFileSync(out, readFileSync(light)); return statSync(out).size; }
    }
    return res.status;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 200) return 'tiny';           // a placeholder, not a crest
  writeFileSync(out, buf);
  return buf.length;
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
