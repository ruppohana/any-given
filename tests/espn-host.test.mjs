/* THE WORKER NEVER CALLS THE ESPN HOST THAT REFUSES IT.
 *
 * Research, 2026-09-13: site.api.espn.com refuses by user agent (403 to browser,
 * blank and PowerShell agents; 200 to curl), while site.web.api and
 * sports.core.api answer everyone - Cloudflare included. Three Worker routes
 * (/api/slate, /api/live/, /api/settle) were still on the refused host until that
 * night. This keeps any Worker code from drifting back.
 *
 * The one allowed mention is the health probe that measures BOTH hosts on
 * purpose - a probe that only checked the good host could not see the bad one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = new URL('../src/', import.meta.url);
function files(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}
const strip = (s) => s.split(String.fromCharCode(10)).filter((l) => {
  const t = l.trim();
  return !(t.startsWith('*') || t.startsWith('/*') || t.startsWith('//'));
}).join(String.fromCharCode(10));

test('no Worker source fetches site.api.espn.com - only the two-host health probe names it', () => {
  const dir = decodeURIComponent(SRC.pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  const hits = [];
  for (const f of files(dir)) {
    const lines = strip(readFileSync(f, 'utf8')).split(String.fromCharCode(10));
    lines.forEach((l, i) => {
      if (l.includes('site.api.espn.com') && !l.includes("['site', ")) hits.push(f.slice(dir.length) + ':' + (i + 1) + ' ' + l.trim().slice(0, 80));
    });
  }
  assert.deepEqual(hits, [], 'a Worker call on the refused host');
});

test('the football routes and the slate fetch are on site.web.api', () => {
  const W = readFileSync(new URL('../src/worker.ts', import.meta.url), 'utf8');
  const E = readFileSync(new URL('../src/feed/espn.ts', import.meta.url), 'utf8');
  assert.ok(W.includes("const ESPN = 'https://site.web.api.espn.com/apis/site/v2/sports/football';"));
  assert.ok(E.includes('https://site.web.api.espn.com/apis/site/v2/sports/${PATH[sport]}/scoreboard'));
});
