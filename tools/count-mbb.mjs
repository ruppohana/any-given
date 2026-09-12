/* COUNT A CAPTURED BASKETBALL SEASON: HOW OFTEN THE NEXT SHOT IS A TWO OR A THREE.
 *
 * The first question a basketball call has to price, counted from real plays
 * the way the football rates were ("922 real NFL snaps") - never guessed.
 * Reads what tools/capture-season.mjs wrote to data/.
 *
 *   node tools/count-mbb.mjs                       all of 2025-26
 *   node tools/count-mbb.mjs --from 20260301
 *
 * 🔴 IT CHECKS ITSELF AGAINST THE BOX SCORE. ESPN files a make and a miss under
 * one play type ("JumpShot"), so a shot's value comes from pointsAttempted and
 * its result from scoringPlay. If either reading were wrong, the counted
 * attempts would stop matching the box score's FGA / 3PA / FTA for the same
 * game - so every game is tallied both ways, and a game where they disagree is
 * named and left out of the rates.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : args[i + 1]; };
const season = flag('season', '2026');
const from = flag('from', '00000000');
const to = flag('to', '99999999');
const dir = fileURLToPath(new URL(`../data/mens-college-basketball-${season}/`, import.meta.url));
if (!existsSync(dir + 'index.jsonl')) { console.error('nothing captured - run tools/capture-season.mjs first'); process.exit(1); }

const rows = readFileSync(dir + 'index.jsonl', 'utf8').split('\n').filter(Boolean)
  .map((l) => { try { return JSON.parse(l); } catch { return null; } })
  .filter((r) => r && r.date >= from && r.date <= to);

const secs = (clk) => {
  const [m, s] = String(clk || '0:00').split(':');
  return s === undefined ? Number(m) || 0 : (Number(m) || 0) * 60 + (Number(s) || 0);
};
// "m-a" from the box score, by the stat's name
const boxPair = (team, want) => {
  const st = (team.statistics || []).find((x) => x.name === want);
  const [m, a] = String(st?.displayValue || '').split('-').map(Number);
  return { m: m || 0, a: a || 0 };
};

const zero = () => ({ fga: 0, three: 0, twoM: 0, threeM: 0 });
const all = zero();
const late = { trailing: zero(), tied: zero(), leading: zero() };   // last 2:00 of the 2nd half or OT, within 5
let games = 0, plays = 0, fta = 0, ftm = 0, noPbp = 0;
const mismatched = [];

for (const r of rows) {
  const f = dir + 'games/' + r.id + '.json.gz';
  if (!existsSync(f)) continue;
  const doc = JSON.parse(gunzipSync(readFileSync(f)).toString('utf8'));
  const ps = doc.plays || [];
  if (!ps.length) { noPbp++; continue; }

  const home = (doc.header?.competitions?.[0]?.competitors || []).find((c) => c.homeAway === 'home')?.team?.id;
  const g = zero(); let gfta = 0, gftm = 0;
  const byTeam = {};
  const gl = { trailing: zero(), tied: zero(), leading: zero() };
  let prevA = 0, prevH = 0;
  for (const p of ps) {
    const pts = Number(p.pointsAttempted) || 0;
    if (p.shootingPlay && pts) {
      const tid = p.team?.id;
      const t = byTeam[tid] || (byTeam[tid] = { fga: 0, three: 0, fta: 0 });
      if (pts === 1) { gfta++; t.fta++; if (p.scoringPlay) gftm++; }
      else {
        g.fga++; t.fga++;
        if (pts === 3) { g.three++; t.three++; if (p.scoringPlay) g.threeM++; }
        else if (p.scoringPlay) g.twoM++;
        const per = p.period?.number || 0;
        const margin = tid === home ? prevH - prevA : prevA - prevH;   // before this shot
        if (per >= 2 && secs(p.clock?.displayValue) <= 120 && Math.abs(margin) <= 5) {
          const b = gl[margin < 0 ? 'trailing' : margin === 0 ? 'tied' : 'leading'];
          b.fga++;
          if (pts === 3) { b.three++; if (p.scoringPlay) b.threeM++; } else if (p.scoringPlay) b.twoM++;
        }
      }
    }
    prevA = Number(p.awayScore) || prevA; prevH = Number(p.homeScore) || prevH;
  }

  // The box score's own FGA / 3PA / FTA, team by team, must match the plays.
  const bad = [];
  for (const t of doc.boxscore?.teams || []) {
    const c = byTeam[t.team?.id] || { fga: 0, three: 0, fta: 0 };
    const fg = boxPair(t, 'fieldGoalsMade-fieldGoalsAttempted');
    const tp = boxPair(t, 'threePointFieldGoalsMade-threePointFieldGoalsAttempted');
    const ft = boxPair(t, 'freeThrowsMade-freeThrowsAttempted');
    if (fg.a !== c.fga || tp.a !== c.three || ft.a !== c.fta) {
      bad.push(`${t.team?.abbreviation} box ${fg.a}/${tp.a}/${ft.a} plays ${c.fga}/${c.three}/${c.fta}`);
    }
  }
  if (bad.length) { mismatched.push(`${r.date} ${r.name} (${r.id}): ${bad.join('; ')}`); continue; }

  games++; plays += ps.length; fta += gfta; ftm += gftm;
  for (const k of Object.keys(all)) all[k] += g[k];
  for (const s of Object.keys(late)) for (const k of Object.keys(all)) late[s][k] += gl[s][k];
}

const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + '%' : '-');
const line = (label, b) => `${label.padEnd(26)} ${String(b.fga).padStart(7)} shots   three ${pct(b.three, b.fga).padStart(6)}   `
  + `2P ${pct(b.twoM, b.fga - b.three).padStart(6)}   3P ${pct(b.threeM, b.three).padStart(6)}`;

console.log(`games counted ${games} of ${rows.length} captured  |  ${plays} plays  |  ${noPbp} with no play-by-play  |  `
  + `${mismatched.length} left out: plays disagree with the box score`);
console.log(line('every shot from the field', all));
console.log(`free throws ${fta}, made ${pct(ftm, fta)}`);
console.log('last 2:00, within 5, by the shooting team:');
for (const s of ['trailing', 'tied', 'leading']) console.log(line('  ' + s, late[s]));
if (mismatched.length) console.log('left out:\n  ' + mismatched.slice(0, 20).join('\n  ') + (mismatched.length > 20 ? `\n  ...and ${mismatched.length - 20} more` : ''));
