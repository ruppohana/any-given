/* WHICH TEAMS NEED NUGGETS - ONCE A WEEK, AFTER THEIR LAST GAME.
 *
 * Jason, 2026-09-11: "It only has to run once. So for the NFL it can run after
 * the last game on Monday, so Tuesday morning it can schedule to run. Then if it
 * has a problem it can run Wednesday morning, and so on."
 *
 * A team is DUE for its next game (within the next 7 days) once its previous
 * game is over and its nugget file was written on or before that game's day.
 * The daily 5 AM run researches whatever is due; a missed or failed morning is
 * picked up by the next one. With no previous game on record, written within 7
 * days of the game counts as fresh. The rule is isFreshForNext in
 * src/lib/nuggets.ts - the same one the Worker's alert uses.
 *
 * The Worker supplies each team's next game and previous game day
 * (GET /api/nuggets/due, from the D1 game table); this reads the LOCAL files,
 * because they are what this run is about to write and ship. Prints JSON:
 *
 *   node tools/nugget-teams.mjs            teams due in the next 7 days
 *   node tools/nugget-teams.mjs --all      include teams already fresh
 *   node tools/nugget-teams.mjs --days 3
 *
 * 🔴 A FAILED FETCH IS NOT "NOTHING DUE" (2026-09-10): every failure is named in
 * `errors` and the exit code is 2.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { isFreshForNext } from '../src/lib/nuggets.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i < 0 ? d : process.argv[i + 1]; };
const base = arg('base', 'https://anygiven.app');
const days = Number(arg('days', 7)) || 7;
const all = process.argv.includes('--all');

const errors = [];
let due = null;
try {
  const r = await fetch(`${base}/api/nuggets/due?days=${days}&x=${Date.now()}`);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  due = await r.json();
} catch (e) { errors.push('due list: ' + e.message); }
if (due && Array.isArray(due.errors)) errors.push(...due.errors);

const out = [];
for (const t of (due && due.teams) || []) {
  const file = join(ROOT, 'public', 'nuggets', t.league, t.teamId + '.json');
  let asOf = null;
  if (existsSync(file)) { try { asOf = JSON.parse(readFileSync(file, 'utf8')).asOf || null; } catch { asOf = null; } }
  /* A team the Cloudflare desk already covered in KV counts as fresh too. */
  const fresh = isFreshForNext(asOf, t) || (t.by === 'kv' && t.fresh);
  if (fresh && !all) continue;
  out.push({ league: t.league, teamId: t.teamId, team: t.team, opponent: t.opponent,
             kickoffUtc: t.kickoffUtc, gameDate: t.gameDate, prevDate: t.prevDate, file, asOf, fresh });
}
out.sort((a, b) => a.kickoffUtc - b.kickoffUtc || a.team.localeCompare(b.team));
const soon = Date.now() + 2 * 24 * 60 * 60 * 1000;
const urgent = out.filter((t) => !t.fresh && t.kickoffUtc < soon);
console.error(`next ${days} days: ${out.length} team(s) ${all ? 'playing' : 'due'}, ${urgent.length} inside 48 hours`
  + (errors.length ? ` - ${errors.length} error(s)` : ''));
console.log(JSON.stringify({ now: new Date().toISOString(), days, teams: out, urgent, errors }, null, 2));
if (errors.length) process.exitCode = 2;
