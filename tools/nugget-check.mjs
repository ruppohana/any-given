/* THE GATE A NUGGET FILE PASSES BEFORE IT SHIPS.
 *
 * Every rule here was a real failure or a standing doctrine rule:
 *   - valid JSON, the right shape, a kind of fun | odd | fact
 *   - a source URL on every nugget - nothing unsourced reaches the screen
 *   - 140 characters at most - it is read in two seconds during a timeout
 *   - no betting language, no injuries, no legal trouble (doctrine: Marbles
 *     are never bought and the app never talks like a sportsbook)
 *   - asOf present - the freshness check in nugget-teams.mjs depends on it
 *
 * "bet" is matched in lowercase only, so the BET television network passes.
 *
 *   node tools/nugget-check.mjs                 every file under public/nuggets
 *   node tools/nugget-check.mjs <file> <file>   just these
 *
 * Exits 1 if any file fails, listing each problem by file and index.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIR = join(ROOT, 'public', 'nuggets');
let files = process.argv.slice(2);
if (!files.length) {
  for (const lg of ['nfl', 'ncaa']) {
    const d = join(DIR, lg);
    if (existsSync(d)) for (const f of readdirSync(d)) if (f.endsWith('.json')) files.push(join(d, f));
  }
}
const BET = /\b(bet|bets|betting|bettor)\b/;
const BAD = /\b(odds|wager\w*|gambl\w*|sportsbook|parlay|injur\w*|arrest\w*|lawsuit\w*|scandal\w*|suspend\w*|credits?)\b/i;
let failed = 0, total = 0;
for (const f of files) {
  const probs = [];
  let j;
  try { j = JSON.parse(readFileSync(f, 'utf8')); } catch (e) { console.log('FAIL', f, '- not JSON:', e.message); failed++; continue; }
  if (!j.league || !j.teamId || !j.team || !j.asOf) probs.push('missing league/teamId/team/asOf');
  if (!Array.isArray(j.nuggets) || !j.nuggets.length) probs.push('no nuggets');
  (j.nuggets || []).forEach((n, i) => {
    total++;
    const t = String(n.text || '');
    if (!t) probs.push(`${i}: empty text`);
    if (t.length > 140) probs.push(`${i}: ${t.length} chars`);
    if (!['fun', 'odd', 'fact'].includes(n.kind)) probs.push(`${i}: kind "${n.kind}"`);
    if (!/^https?:\/\//.test(String(n.source || ''))) probs.push(`${i}: no source`);
    const m = t.match(BET) || t.match(BAD);
    if (m) probs.push(`${i}: word "${m[0]}"`);
  });
  if (probs.length) { failed++; console.log('FAIL', f, '\n  ' + probs.join('\n  ')); }
}
console.log(`${files.length} file(s), ${total} nugget(s), ${failed} failing`);
process.exit(failed ? 1 : 0);
