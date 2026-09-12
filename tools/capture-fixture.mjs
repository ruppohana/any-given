/* CAPTURE ONE REAL GAME FROM THE FEED, WHOLE, TO DISK.
 *
 * 🔴 THE VAULT'S RULE: a fixture is only evidence if it came from the feed. The
 * three college fixtures in this repo were captured by hand on 2026-09-05 and
 * there was no tool to do it again - so every verification since has been
 * college, including the dry run, on the day of an NFL opener.
 *
 * That matters more here than it would in most apps, because the two leagues are
 * not interchangeable in this code: a SACK SETTLES AS A PASS IN THE NFL AND A
 * RUSH IN COLLEGE, the priors are measured separately, and ESPN writes the play
 * text differently in each - college puts "1ST DOWN" in the sentence and the NFL
 * does not, which is the bug that took the NFL star parser from 0% to 96%.
 *
 *   node tools/capture-fixture.mjs 401671889 --sport nfl --name real-nfl-2025
 *
 * 🔴 IT USES THE SITE SUMMARY ENDPOINT, which is what readLive() parses. That
 * endpoint 403s from Cloudflare and from the mount VM and answers from this
 * machine - which is why this is a host tool and why the fixtures are committed
 * rather than fetched at test time.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith('--'));
const flag = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : args[i + 1]; };
/* Basketball's summary sits under another path and carries its plays flat, not
 * in drives. `--sport mbb` is men's college basketball, filed under fixtures/mbb/. */
const PATHS = {
  nfl: 'football/nfl',
  'college-football': 'football/college-football',
  'mens-college-basketball': 'basketball/mens-college-basketball',
  nba: 'basketball/nba'
};
const want = flag('sport', 'nfl');
const sport = want === 'nfl' ? 'nfl'
  : (want === 'mbb' || want === 'mens-college-basketball') ? 'mens-college-basketball'
  : want === 'nba' ? 'nba'
  : 'college-football';
const hoops = sport === 'mens-college-basketball' || sport === 'nba';
const name = flag('name', sport === 'nba' ? `nba/real-nba-${id}` : hoops ? `mbb/real-mbb-${id}` : `real-${sport}-${id}`);

if (!id) {
  console.error('usage: node tools/capture-fixture.mjs <espnGameId> [--sport nfl|college-football|mbb] [--name x]');
  process.exit(1);
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  + ' (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const url = `https://site.api.espn.com/apis/site/v2/sports/${PATHS[sport]}/summary?event=${id}`;

const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
if (!res.ok) { console.error(`espn ${res.status}`); process.exit(1); }
const doc = await res.json();

/* 🔴 REFUSE A GAME THAT IS NOT FINISHED. A fixture is a COMPLETE game - the
 * whole point is that every play and every result is present, so a settler can
 * be checked against what actually happened. Half a game captured mid-flight
 * would look like a fixture and quietly test nothing at the end of it. */
const comp = doc.header?.competitions?.[0];
const done = comp?.status?.type?.completed === true;
const plays = hoops ? (doc.plays || []).length
  : (doc.drives?.previous || []).reduce((n, d) => n + (d.plays?.length || 0), 0);
if (!done) { console.error(`that game is not final (${comp?.status?.type?.name}) - not capturing`); process.exit(1); }
if (plays < 100) { console.error(`only ${plays} plays - that is not a whole game`); process.exit(1); }

const out = fileURLToPath(new URL(`../fixtures/${name}.json`, import.meta.url));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(doc));
const c = comp.competitors || [];
console.log(`${name}.json  ${plays} plays  ${c.map((x) => (x.team?.abbreviation || '?') + ' ' + x.score).join(' - ')}`);
