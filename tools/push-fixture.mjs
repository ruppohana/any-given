/* PUSH ONE REAL CAPTURED GAME UNDER A TEST KEY.
 *
 * 🔴 IT IS A REAL GAME, NOT A FIXTURE SOMEBODY WROTE. `fixtures/real-*-260905-
 * final.json` were captured from the feed; this only replays one so the live
 * screen can be driven at a moment when tonight's game has not kicked off. The
 * vault's rule holds: a fixture is only evidence if it came from the feed.
 *
 *   node tools/push-fixture.mjs real-bois-at-ore --key test:board
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readLive } from '../src/live.ts';

const args = process.argv.slice(2);
const name = args[0] || 'real-bois-at-ore';
const flag = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : args[i + 1]; };
const key = flag('key', 'test:board');
const base = flag('base', 'https://any-given.ruppohana.workers.dev');
const upTo = Number(flag('plays', 0));

const tokenFile = fileURLToPath(new URL('../.push-token.local', import.meta.url));
const token = process.env.PUSH_TOKEN || (existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : '');
if (!token) { console.error('no push token'); process.exit(1); }

const file = fileURLToPath(new URL(`../fixtures/${name}-260905-final.json`, import.meta.url));
const state = readLive(JSON.parse(readFileSync(file, 'utf8')), '999', 'college-football', Date.now());
if (upTo > 0) state.plays = state.plays.slice(0, upTo);

/* 🔴 --live FORCES THE STATUS, and it is a TEST RIG rather than a lie the app
 * can tell itself. A captured game is FINAL by definition, so replaying one can
 * never exercise the states that only exist while a game is running - the call
 * card, the price, the lit tile. Nothing else fabricates a status: the poller
 * reads ESPN's own type name and this flag exists only on a tool that has to be
 * run by hand with a fixture named on the command line. */
if (args.includes('--live')) {
  state.status = 'live';
  const last = state.plays[state.plays.length - 1];
  if (last) state.situation = { ...(state.situation || {}), offenseTeamId: last.offenseTeamId, down: 1, distance: 10 };
}

const res = await fetch(base + '/api/push', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-push-token': token },
  body: JSON.stringify({ key, state })
});
console.log(res.status, await res.text());
console.log(`${state.plays.length} plays, ${state.drives.length} drives -> ${base}/api/state/${key}`);
