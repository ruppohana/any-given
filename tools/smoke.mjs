/* 🔴 EVERY ROUTE, IN A REAL BROWSER, AFTER EVERY DEPLOY.
 *
 * The suite has 678 tests and none of them can see a blank screen. Today
 * proved it three separate times:
 *
 *   - a missing import left the parlay picker throwing `FILTER_ALL is not
 *     defined` at render. It PARSED, so the module-parse test passed
 *   - `.ts` specifiers survived the build, so a screen 404'd its own
 *     dependency with every file returning 200
 *   - the topbar wiring ran before the render and silently did nothing
 *
 * Every one was found by a person looking at a phone. That is the most
 * expensive way to find them and the slowest, and it is why Jason kept
 * having to ask what was next: the loop had a human in the part a machine
 * should do.
 *
 * 🔴 IT RUNS AGAINST THE DEPLOYED URL, NOT A FIXTURE. The bugs above were all
 * integration failures - a build step, an import graph, an ordering. A test
 * that stubs any of that away cannot see them. Rule zero: a piece is done
 * when it RAN.
 *
 *   node tools/smoke.mjs                     the live site
 *   node tools/smoke.mjs --base http://...   somewhere else
 *
 * Exits non-zero on the first route that errors, so it can gate a release.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, openSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const arg = (n, d) => {
  const i = process.argv.indexOf('--' + n);
  return i < 0 ? d : process.argv[i + 1];
};
const base = arg('base', 'https://anygiven.app');

/* 🔴 THE PROBE LIVES IN index.html, not here. Chrome's --dump-dom cannot
 * inject a script, so the page walks its own routes behind ?smoke=1 and
 * leaves the verdict in #smoke-result. That also means the probe runs the
 * same code path a person does rather than a driver's approximation. */

const dir = mkdtempSync(join(tmpdir(), 'ag-smoke-'));
/* 🔴 THE DOM GOES TO A FILE DESCRIPTOR, NOT A PIPE AND NOT A SHELL.
 * Capturing --dump-dom on stdout through execFileSync came back empty while
 * the identical command with a shell redirect produced 28KB - Chrome writes
 * the dump late and the pipe read as closed. Routing it through `cmd /c` to
 * get the redirect then failed on the space in "Program Files" under Git
 * Bash. An fd has neither problem and no quoting rules at all. */
const domFile = join(dir, 'dom.html');
const fd = openSync(domFile, 'w');
try {
  execFileSync(CHROME, [
    '--headless', '--disable-gpu', '--no-first-run',
    '--virtual-time-budget=45000',
    '--window-size=390,844',
    `--user-data-dir=${join(dir, 'profile')}`,
    '--dump-dom',
    `${base}/?smoke=1`,
  ], { timeout: 180000, stdio: ['ignore', fd, 'ignore'] });
} catch { /* chrome exits non-zero on some shutdown paths; the file is what matters */ } finally {
  closeSync(fd);
}
let raw = '';
try { raw = readFileSync(domFile, 'utf8'); } catch { /* handled below */ }
if (!raw) { console.error('chrome produced no DOM'); process.exit(2); }

/* --dump-dom cannot run our probe, so the real work is done by the page
   itself: index.html looks for ?smoke=1 and walks the routes, leaving the
   result in a known element. Simpler than driving CDP by hand and it uses
   the same code path a person does. */
const m = raw.match(/<pre id="smoke-result">([\s\S]*?)<\/pre>/);
if (!m) {
  console.error('no smoke result in the page - is ?smoke=1 wired in index.html?');
  process.exit(2);
}
const { out, errs } = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>'));

const bad = out.filter((o) => o.boundary || o.thin);
for (const o of out) {
  const flag = o.boundary ? 'BOUNDARY' : o.thin ? 'THIN' : 'ok';
  console.log(String(flag).padEnd(9), o.route.padEnd(12), o.chars + ' chars',
    o.boundary ? '- ' + (o.detail || '').slice(0, 120) : '');
}
if (errs.length) {
  console.log('\nuncaught:');
  for (const e of [...new Set(errs)]) console.log('  ' + e);
}
rmSync(dir, { recursive: true, force: true });

/* 🔴 AND THE FEED, WHENEVER A GAME IS ON. Every route above rendered on
 * 2026-09-10 while SF at LAR was unplayable twice over: ESPN stamped the
 * plays a day ahead, so the delay held all of them, and KV served state up to
 * 57 seconds old, so the "feed has stopped" banner fired on a healthy feed.
 * A page that renders is not a game you can play. For every game the slate
 * says is live, this checks the three numbers that decide whether it is:
 *
 *   - served by the poller DO, not KV (KV trails its own writes by ~60s)
 *   - pushed within the screen's own stale limit (2 heartbeats + 15s)
 *   - a publish lag that is not negative - a play cannot arrive before it
 *     happened, so a negative lag is a bad clock upstream */
const season = arg('season', '2026');
const liveBad = [];
let liveN = 0;
for (const sp of ['nfl', 'college-football']) {
  let games = [];
  try {
    const wk = (await (await fetch(`${base}/api/state/slate:${sp}:current`)).text()).trim();
    const slate = await (await fetch(`${base}/api/state/slate:${sp}:${season}:${wk}`)).json();
    games = (slate.games || []).filter((g) => g.status === 'in_progress');
  } catch { continue; }
  for (const g of games) {
    liveN++;
    const key = `${sp}:${g.id}`;
    try {
      const res = await fetch(`${base}/api/state/${key}`);
      const src = res.headers.get('x-state-source') || '?';
      const j = await res.json();
      const age = Date.now() - (j.pushedAt || 0);
      const limit = (j.heartbeatMs || 20000) * 2 + 15000;
      const lag = j.publishLagMs;
      const why = [];
      if (src !== 'do') why.push(`served from ${src}`);
      if (age > limit) why.push(`pushed ${Math.round(age / 1000)}s ago (limit ${limit / 1000}s)`);
      if (typeof lag === 'number' && lag < 0) why.push(`publish lag ${Math.round(lag / 1000)}s`);
      console.log((why.length ? 'LIVE-BAD' : 'live ok').padEnd(9), key.padEnd(28),
        `${src} · pushed ${Math.round(age / 1000)}s · lag ${lag == null ? '-' : Math.round(lag / 1000) + 's'}`,
        why.length ? '- ' + why.join('; ') : '');
      if (why.length) liveBad.push(key);
    } catch (e) {
      console.log('LIVE-BAD'.padEnd(9), key, '- ' + String(e?.message || e));
      liveBad.push(key);
    }
  }
}

if (bad.length || errs.length || liveBad.length) {
  console.error(`\nsmoke FAILED: ${bad.length} route(s), ${errs.length} uncaught, ${liveBad.length} live game(s)`);
  process.exit(1);
}
console.log(`\nsmoke ok: ${out.length} routes, ${liveN} live game(s)`);
