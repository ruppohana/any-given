/* CAPTURE A WHOLE SEASON FROM THE FEED, GZIPPED, TO data/.
 *
 * Basketball starts the way every sport here should: with real games on disk
 * before any code. Every rate the app prices with is counted from real plays
 * (the catalog's "922 real NFL snaps"), so the counts need a season to count -
 * and ESPN only answers from this machine (403 from Cloudflare and the mount
 * VM), which is why this is a host tool.
 *
 *   node tools/capture-season.mjs                          men's college basketball, 2025-26
 *   node tools/capture-season.mjs --from 20260301 --to 20260310
 *
 * RESUMABLE. Every captured game is one games/<id>.json.gz plus one line in
 * data/<sport>-<season>/index.jsonl, written in that order, so a line always
 * has its file. A rerun skips every id in the index, so a run cut off by sleep
 * picks up where it stopped; a game that failed or was not yet final is never
 * written, so the rerun tries it again.
 *
 * NEVER COMMITTED. A season is about 6,000 summaries at ~390 KB each. data/ is
 * in .gitignore; a game a test needs is captured whole into fixtures/ with
 * capture-fixture.mjs.
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const LEAGUES = {
  // groups=50 is Division I; without it the scoreboard returns only a featured handful
  'mens-college-basketball': { path: 'basketball/mens-college-basketball', groups: '50' },
  // 30 teams, no divisions to filter
  nba: { path: 'basketball/nba', groups: '' }
};

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : args[i + 1]; };
const sport = flag('sport', 'mens-college-basketball');
const season = flag('season', '2026');   // ESPN names a season by the year it ends
const from = flag('from', '00000000');
const to = flag('to', '99999999');
const jobs = Math.max(1, Math.min(8, Number(flag('jobs', '4'))));
const L = LEAGUES[sport];
if (!L) { console.error('unknown sport ' + sport + ' - have: ' + Object.keys(LEAGUES).join(', ')); process.exit(1); }

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  + ' (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const BASE = `https://site.api.espn.com/apis/site/v2/sports/${L.path}`;
const dir = fileURLToPath(new URL(`../data/${sport}-${season}/`, import.meta.url));
const gamesDir = dir + 'games/';
const indexPath = dir + 'index.jsonl';
mkdirSync(gamesDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(url) {
  let last = '';
  for (const wait of [0, 2000, 5000, 15000]) {
    if (wait) await sleep(wait);
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
      if (res.ok) return await res.json();
      last = 'espn ' + res.status;
      if (res.status === 404) break;
    } catch (e) { last = String((e && e.message) || e); }
  }
  throw new Error(last);
}

const done = new Set();
if (existsSync(indexPath)) {
  for (const line of readFileSync(indexPath, 'utf8').split('\n')) {
    if (!line) continue;
    try { done.add(JSON.parse(line).id); } catch { /* a line cut off mid-write: that game is retried */ }
  }
}

const cal = await getJson(`${BASE}/scoreboard?dates=${season}&limit=1`);
const days = (cal.leagues?.[0]?.calendar || [])
  .map((d) => String(d).slice(0, 10).split('-').join(''))
  .filter((d) => d >= from && d <= to);
console.log(`${sport} ${season}: ${days.length} game days, ${done.size} games already on disk`);

async function one(day, ev) {
  const comp = ev.competitions?.[0] || {};
  const side = (h) => {
    const c = (comp.competitors || []).find((x) => x.homeAway === h) || {};
    return { id: c.team?.id, abbr: c.team?.abbreviation, score: Number(c.score) || 0 };
  };
  const doc = await getJson(`${BASE}/summary?event=${ev.id}`);
  const gz = gzipSync(JSON.stringify(doc));
  writeFileSync(gamesDir + ev.id + '.json.gz', gz);
  const row = {
    id: ev.id, date: day, name: ev.shortName, away: side('away'), home: side('home'),
    neutral: !!comp.neutralSite, periods: ev.status?.period || 0,
    plays: (doc.plays || []).length, wp: (doc.winprobability || []).length, gz: gz.length
  };
  appendFileSync(indexPath, JSON.stringify(row) + '\n');
  done.add(ev.id);
  return row;
}

let total = 0, notFinal = 0, noPlays = 0, bytes = 0;
const failed = [];
for (const day of days) {
  let sb;
  try { sb = await getJson(`${BASE}/scoreboard?dates=${day}${L.groups ? '&groups=' + L.groups : ''}&limit=400`); }
  catch (e) { console.log(`${day}  scoreboard failed: ${e.message}`); failed.push('day ' + day); continue; }
  const all = sb.events || [];
  // A postponed game comes back under the same id on a later day, so it is left for then.
  const todo = all.filter((e) => !done.has(e.id) && e.status?.type?.completed === true);
  const waiting = all.filter((e) => !done.has(e.id) && e.status?.type?.completed !== true).length;
  notFinal += waiting;
  let got = 0;
  const queue = todo.slice();
  const worker = async () => {
    for (let ev = queue.shift(); ev; ev = queue.shift()) {
      try {
        const row = await one(day, ev);
        got++; total++; bytes += row.gz;
        if (!row.plays) noPlays++;
      } catch (e) { failed.push(ev.id + ' (' + e.message + ')'); }
    }
  };
  await Promise.all(Array.from({ length: jobs }, worker));
  console.log(`${day}  ${String(all.length).padStart(3)} games  ${String(got).padStart(3)} new`
    + (waiting ? `  ${waiting} not final` : '')
    + `   run total ${total}, ${(bytes / 1048576).toFixed(0)} MB`);
}

console.log(`done: ${total} captured this run, ${done.size} on disk, ${noPlays} with no play-by-play, `
  + `${notFinal} not final, ${failed.length} failed`);
if (failed.length) console.log('failed (a rerun retries them): ' + failed.join(', '));
