/* WHICH TEAMS NEED NUGGETS BEFORE THEIR NEXT GAME.
 *
 * Jason, 2026-09-10: "grab 10 for each team ... Current, and just before the
 * game" - then "1 day earlier?" So the research runs the day before a game
 * day, for every team playing that day whose file is missing or stale.
 *
 * Reads the live slates (both leagues, the current week and the next, since
 * "tomorrow" can sit on the far side of a week boundary) and prints JSON:
 *
 *   node tools/nugget-teams.mjs                 teams playing tomorrow (Pacific)
 *   node tools/nugget-teams.mjs --date 2026-09-12
 *   node tools/nugget-teams.mjs --all           include teams already fresh
 *
 * A file counts as fresh when its asOf is no more than one day before the
 * game date - which is exactly what a day-before run writes.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i < 0 ? d : process.argv[i + 1]; };
const base = arg('base', 'https://anygiven.app');
const season = arg('season', '2026');
const all = process.argv.includes('--all');

const pacific = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
const date = arg('date', pacific(Date.now() + 24 * 60 * 60 * 1000));
const dayBefore = pacific(Date.parse(date + 'T12:00:00Z') - 24 * 60 * 60 * 1000);

const out = [];
for (const sport of ['nfl', 'college-football']) {
  const lg = sport === 'nfl' ? 'nfl' : 'ncaa';
  let wk;
  try { wk = Number((await (await fetch(`${base}/api/state/slate:${sport}:current`)).text()).trim()); } catch { continue; }
  if (!wk) continue;
  const seen = new Set();
  for (const w of [wk, wk + 1]) {
    let slate;
    try {
      const r = await fetch(`${base}/api/state/slate:${sport}:${season}:${w}`);
      if (!r.ok) continue;
      slate = await r.json();
    } catch { continue; }
    for (const g of slate.games || []) {
      if (!g.kickoffUtc || g.status === 'final' || pacific(g.kickoffUtc) !== date) continue;
      for (const t of g.teams || []) {
        const id = String(t.id);
        if (seen.has(id)) continue;
        seen.add(id);
        const file = join(ROOT, 'public', 'nuggets', lg, id + '.json');
        let asOf = null;
        if (existsSync(file)) { try { asOf = JSON.parse(readFileSync(file, 'utf8')).asOf || null; } catch { asOf = null; } }
        const fresh = !!asOf && asOf >= dayBefore;
        if (fresh && !all) continue;
        out.push({ league: lg, teamId: id, team: t.name || t.short || t.abbrev, abbrev: t.abbrev,
                   opponent: g.shortName, kickoffUtc: g.kickoffUtc, file, asOf, fresh });
      }
    }
  }
}
out.sort((a, b) => a.kickoffUtc - b.kickoffUtc || a.team.localeCompare(b.team));
console.error(`${date}: ${out.length} team(s) ${all ? 'playing' : 'need research'}`);
console.log(JSON.stringify({ date, dayBefore, teams: out }, null, 2));
