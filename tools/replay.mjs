/* REPLAY A REAL GAME THROUGH THE REAL PATH, ONE PLAY AT A TIME.
 *
 * 🔴 EVERY TEST SO FAR HAS BEEN A SNAPSHOT. The fixtures are complete games
 * pushed whole; the browser checks read one frozen state. Nothing has ever
 * exercised the thing the app actually is: a state that GROWS, one play at a
 * time, while somebody is looking at it.
 *
 * That matters because the entire mechanic lives in the gap between two pushes.
 * A call is keyed on the play it was made AFTER and settles against whatever
 * arrives next — so "does a call settle" is a question about two states, and no
 * single state can answer it. Neither can 554 unit tests, which is why this is a
 * tool and not a test.
 *
 *   node tools/replay.mjs real-bois-at-ore --key test:live --from 40 --every 6
 *
 * It pushes to the SAME endpoint the poller does, so the app cannot tell the
 * difference — which is the point. Nothing is stubbed and nothing is special-cased.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readLive } from '../src/live.ts';

const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith('--')) || 'real-bois-at-ore';
const flag = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : args[i + 1]; };
const key = flag('key', 'test:live');
const from = Number(flag('from', 40));
const every = Number(flag('every', 6)) * 1000;
const base = flag('base', 'https://any-given.ruppohana.workers.dev');

const tokenFile = fileURLToPath(new URL('../.push-token.local', import.meta.url));
const token = process.env.PUSH_TOKEN || (existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : '');
if (!token) { console.error('no push token'); process.exit(1); }

/* 🔴 THE SPORT IS AN ARGUMENT, because the two leagues are not interchangeable
 * here. A sack settles as a pass in the NFL and a rush in college, the priors
 * are measured separately, and ESPN writes the play text differently in each —
 * college says "1st down OU" in the sentence and the NFL does not. Replaying an
 * NFL game as college would grade every sack the wrong way and quietly prove
 * nothing. */
const sport = flag('sport', /nfl/i.test(name) ? 'nfl' : 'college-football');

/* 🔴 RESOLVE THE FILE, DO NOT ASSUME ITS NAME. This built a path from a naming
 * convention - `<name>-260905-final.json`, or `fixtures/nfl/<name>.json` for
 * anything starting `nfl-` - which was fine while the only fixtures were the
 * three captured by hand on one day in September. The first fixture captured by
 * a tool did not match either pattern and the replay died in readFileSync with
 * a stack trace and no useful sentence.
 *
 * A convention that only the person who wrote it can satisfy is a convention
 * that stops new evidence being added, which is the opposite of what a fixture
 * directory is for. */
const CANDIDATES = [
  `../fixtures/${name}.json`,
  `../fixtures/${name}-260905-final.json`,
  `../fixtures/nfl/${name}.json`
];
let file = null;
for (const c of CANDIDATES) {
  const abs = fileURLToPath(new URL(c, import.meta.url));
  if (existsSync(abs)) { file = abs; break; }
}
if (!file) {
  console.error(`no fixture called "${name}". Tried:`);
  for (const c of CANDIDATES) console.error('  ' + c.replace('../', ''));
  process.exit(1);
}
const raw = JSON.parse(readFileSync(file, 'utf8'));
const full = readLive(raw, '999', sport, Date.now());
console.log(`${name}: ${full.plays.length} plays, replaying from ${from} every ${every / 1000}s -> ${base}/api/state/${key}`);

/* Which drives had ended by play N. A drive-scope call cannot settle until the
 * feed says its drive is over, so replaying that honestly is the only way to
 * exercise the two-timescale design at all. */
function drivesAt(n) {
  const seen = new Set(full.plays.slice(0, n).map((p) => p.driveId));
  const last = full.plays[n - 1];
  return full.drives
    .filter((d) => seen.has(d.id))
    .map((d) => (last && d.id === last.driveId ? { ...d, result: '', ended: false } : d));
}

let n = from;
async function step() {
  if (n > full.plays.length) {
    console.log('\nreplay complete — the game is final on the wire');
    process.exit(0);
  }
  const plays = full.plays.slice(0, n);
  const last = plays[plays.length - 1];
  const state = {
    ...full,
    plays,
    drives: drivesAt(n),
    /* 🔴 status is LIVE until the last play, then final — exactly as a real feed
     * reports it, so the app's own final-game handling is exercised too. */
    status: n >= full.plays.length ? 'final' : 'live',
    situation: last ? { ...full.situation, playId: last.id, offenseTeamId: last.offenseTeamId,
                        down: last.endDown, distance: last.distance,
                        lastPlayText: last.text, lastPlayKind: last.kind } : null,
    fetchedAt: Date.now()
  };
  const res = await fetch(base + '/api/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-push-token': token },
    body: JSON.stringify({ key, state })
  });
  console.log(`${String(n).padStart(3)}/${full.plays.length}  ${res.ok ? 'ok ' : 'ERR'}  ${(last?.text || '').slice(0, 72)}`);
  n++;
  setTimeout(step, every);
}
step();
