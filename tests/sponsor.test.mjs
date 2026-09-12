/* A SPONSOR BANNER ON A PRIVATE POOL - set only by us, drawn only from our host.
 *
 * Jason, 2026-09-12: "send a banner and we can put it on your private pool."
 * Branding only (decisions/pools-are-free-2026-09-12.md): the pool stays free,
 * nothing touches play, every banner is approved and set by tools/sponsor.mjs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const MIG = read('migrations/0008_pool_sponsor.sql');
const SRV = read('src/groups.ts');
const G1 = read('public/screens/g1-group.screen.js');
const TOOL = read('tools/sponsor.mjs');

test('the pool row carries a sponsor name, image and link', () => {
  for (const c of ['sponsor_name', 'sponsor_image', 'sponsor_url']) {
    assert.ok(MIG.includes('ALTER TABLE pool ADD COLUMN ' + c + ' TEXT;'), c);
    assert.ok(SRV.includes(c), 'the group query reads ' + c);
  }
});

test('the server passes a banner on only from /sponsors/, and a link only if https', () => {
  assert.ok(SRV.includes("g.sponsor_image.startsWith('/sponsors/')"));
  assert.ok(SRV.includes("g.sponsor_url.startsWith('https://')"));
});

test('the group page draws it marked Sponsored, only from /sponsors/, and it never fetches', () => {
  assert.ok(G1.includes("if (sp && sp.image && String(sp.image).startsWith('/sponsors/')) {"));
  assert.ok(G1.includes("'Sponsored by ' + (sp.name || 'a sponsor')"));
  assert.ok(G1.includes("box.rel = 'noopener sponsored';"));
});

test('no user can set a banner - only the tool, which checks the file and the link', () => {
  // No SQL in the server ever writes a sponsor column (an UPDATE or INSERT naming one).
  assert.equal(/(UPDATE|INSERT)[^`]*sponsor_/.test(SRV), false, 'no route writes a sponsor');
  assert.ok(TOOL.includes("'--url must be https'"));
  assert.ok(TOOL.includes("is not there - add it, deploy, then set it"));
  assert.ok(TOOL.includes('split("\'").join("\'\'")'), 'quotes are escaped for SQL');
});
