/* NUGGETS ARE GONE (2026-09-13). Jason: "Stop getting and remove them. We do
 * not use them any longer." The researched team facts - public/nuggets/, the
 * daily laptop research, the Worker's due list and its 10 AM alert - were
 * removed. The live tile keeps only its game-data facts.
 *
 * This replaces tests/nuggets-due.test.mjs; its last test (the Cloudflare
 * research desk stays deleted) is carried over below.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const gone = (p) => !existsSync(new URL('../' + p, import.meta.url));

test('the researched nuggets, their tools and the alert are gone', () => {
  for (const p of ['public/nuggets', 'src/nugget-due.ts', 'src/lib/nuggets.ts', 'tools/nugget-teams.mjs',
                   'tools/nugget-check.mjs', 'tools/nuggets-research.md'])
    assert.ok(gone(p), p + ' is deleted');
  const worker = read('src/worker.ts');
  for (const s of ['nugget-due', 'nuggetAlertTick', '/api/nuggets/due'])
    assert.ok(!worker.includes(s), s + ' is out of the Worker');
  assert.ok(!/^ALERT_EMAIL/m.test(read('wrangler.toml')), 'no alert address');
});

test('no screen fetches /nuggets/', () => {
  for (const p of ['public/screens/p2-slate.screen.js', 'public/screens/live-game.screen.js',
                   'public/screens/p6-allgames.screen.js'])
    assert.ok(!read(p).includes("'/nuggets/"), p);
});

test('the Cloudflare research desk stays deleted by migration', () => {
  const toml = read('wrangler.toml');
  assert.match(toml, /tag = "v3"\s*\ndeleted_classes = \["NuggetDesk"\]/, 'the class is deleted by migration');
  assert.ok(!/name = "NUGGET_DESK"/.test(toml), 'and no longer bound');
});
