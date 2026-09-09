/* THE POLLER. It runs on the machine that can reach ESPN, and pushes state up.
 *
 * 🔴 WHY IT IS NOT IN THE WORKER. ESPN returns 403 to Cloudflare - to the
 * datacenter, not to the header; a browser User-Agent was tried and changed
 * nothing. The vault already records "only the host machine can reach ESPN" for
 * the cloud container and the mount VM, and Workers are now on that list.
 *
 * What matters about the architecture survives intact: ONE thing polls the feed,
 * every phone reads one shared copy, and no client is ever handed ESPN's URL.
 * The poller simply lives here until the feed is one a Worker may call.
 *
 *   node tools/poll.mjs 401872656 --sport nfl
 *   node tools/poll.mjs 401872656 --sport nfl --every 8
 *
 * It prints one line a poll, so the thing running on your desk during a game
 * tells you it is alive without you having to open anything.
 */
import { readLive } from '../src/live.ts';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const gameId = args.find((a) => /^\d+$/.test(a));
const flag = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : args[i + 1]; };
const sport = flag('sport', 'nfl');
const every = Number(flag('every', 10)) * 1000;
const base = flag('base', 'https://any-given.ruppohana.workers.dev');
/* The token is read from the file it was written to, so this is ONE command with
 * no setup. It was an env var first, and the first thing that happened is that
 * the person running it got "PUSH_TOKEN is not set" in a shell where it had never
 * been set - which is a setup step disguised as an error message. */
const tokenFile = fileURLToPath(new URL('../.push-token.local', import.meta.url));
const token = process.env.PUSH_TOKEN
  || flag('token', '')
  || (existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : '');

if (!gameId) {
  console.error('usage: node tools/poll.mjs <espnGameId> [--sport nfl|cfb] [--every 10]');
  process.exit(1);
}
if (!token) {
  console.error('No push token. Expected .push-token.local beside package.json,');
  console.error('or PUSH_TOKEN in the environment, or --token <value>.');
  process.exit(1);
}

const path = sport === 'nfl' ? 'nfl' : 'college-football';
const url = `https://site.api.espn.com/apis/site/v2/sports/football/${path}/summary?event=${gameId}`;
const key = `${sport}:${gameId}`;

let lastPlayId = null;
let pushes = 0, failures = 0;

async function tick() {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' } });
    if (!res.ok) throw new Error('espn ' + res.status);
    const state = readLive(await res.json(), gameId, sport, Date.now());

    const newest = state.plays[state.plays.length - 1];
    const fresh = newest && newest.id !== lastPlayId;
    lastPlayId = newest ? newest.id : lastPlayId;

    const push = await fetch(base + '/api/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-push-token': token },
      body: JSON.stringify({ key, state })
    });
    if (!push.ok) throw new Error('push ' + push.status);
    pushes++;

    const line = [
      new Date().toLocaleTimeString(),
      state.status.padEnd(5),
      `${state.awayScore}-${state.homeScore}`,
      `${state.plays.length} plays`,
      state.offers ? state.offers.map((o) => `${o.side} ${o.payoutPerMarble}x`).join(' ') : 'no offer',
      `${Date.now() - t0}ms`
    ].join('  ');
    /* A NEW PLAY IS THE EVENT. Marking it makes the window visible on the desk:
     * this is the moment a call closes and the next one opens. */
    console.log((fresh ? '▶ ' : '  ') + line + (fresh ? `  << ${newest.kind}: ${newest.text.slice(0, 60)}` : ''));

    if (state.status === 'final') {
      console.log(`\nfinal. ${pushes} pushes, ${failures} failures.`);
      process.exit(0);
    }
  } catch (e) {
    failures++;
    console.log(`${new Date().toLocaleTimeString()}  ERROR  ${e.message}  (${failures} so far, still going)`);
  }
}

console.log(`polling ${sport} ${gameId} every ${every / 1000}s -> ${base}/api/state/${key}`);
await tick();
setInterval(tick, every);
