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
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
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
  if (!res.ok) return res.status;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 200) return 'tiny';           // a placeholder, not a crest
  writeFileSync(out, buf);
  return buf.length;
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
console.log(`${which}: ${ok} saved, ${skipped} already present, ${miss} missing, ${(bytes / 1048576).toFixed(2)} MB`);
if (missing.length) console.log('missing:', missing.slice(0, 20).join(' '), missing.length > 20 ? `(+${missing.length - 20})` : '');
