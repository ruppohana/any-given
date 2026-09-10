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

if (bad.length || errs.length) {
  console.error(`\nsmoke FAILED: ${bad.length} route(s), ${errs.length} uncaught`);
  process.exit(1);
}
console.log(`\nsmoke ok: ${out.length} routes`);
