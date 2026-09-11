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

/* 🔴 A FAILED FETCH IS NOT AN EMPTY DAY. These used to `continue` silently, so
 * "no games tomorrow", "all fresh" and "the slate did not load" all printed the
 * same empty list - flagged by the first dry run, 2026-09-10. Every failure is
 * now named in `errors` and the exit code is 2, so a run can tell them apart.
 * A 404 on week+1 is normal (not published yet) and is not an error. */
const out = [];
const errors = [];
for (const sport of ['nfl', 'college-football']) {
  const lg = sport === 'nfl' ? 'nfl' : 'ncaa';
  let wk;
  try {
    const r = await fetch(`${base}/api/state/slate:${sport}:current`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    wk = Number((await r.text()).trim());
  } catch (e) { errors.push(`${sport} current week: ${e.message}`); continue; }
  if (!wk) { errors.push(`${sport} current week: empty`); continue; }
  const seen = new Set();
  for (const w of [wk, wk + 1]) {
    let slate;
    try {
      const r = await fetch(`${base}/api/state/slate:${sport}:${season}:${w}`);
      if (r.status === 404 && w === wk + 1) continue;
      if (!r.ok) throw new Error('HTTP ' + r.status);
      slate = await r.json();
    } catch (e) { errors.push(`${sport} week ${w}: ${e.message}`); continue; }
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
console.error(`${date}: ${out.length} team(s) ${all ? 'playing' : 'need research'}`
  + (errors.length ? ` - ${errors.length} slate fetch(es) FAILED` : ''));
console.log(JSON.stringify({ date, dayBefore, teams: out, errors }, null, 2));
if (errors.length) process.exitCode = 2;
