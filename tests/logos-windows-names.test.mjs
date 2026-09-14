/* NO CREST FILE WINDOWS CANNOT HOLD.
 *
 * Found 2026-09-13 committing the self-hosted crests: the Connecticut Sun's crest was
 * saved as public/logos/wnba/500/con.png, and "con" is a reserved device name on Windows
 * (so are prn, aux, nul, com1-9, lpt1-9). The file could not be read, `git add` refused
 * the whole batch, and the crest test had passed anyway - asking Windows whether
 * "con.png" exists asks about the console. Our copy is con_.png; the chip asks for it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { logoUrl, cdnLogoUrl, localName } from '../public/components/team-chip.js';

const ROOT = decodeURIComponent(new URL('../public/logos/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
function walk(dir) {
  const out = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...walk(p)); else out.push(n);
  }
  return out;
}

test('no file under public/logos has a Windows-reserved name', () => {
  const bad = walk(ROOT).filter((n) => /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i.test(n));
  assert.deepEqual(bad, []);
});

test('the Connecticut Sun: our copy is con_.png, the CDN keeps ESPN\'s name', () => {
  assert.equal(localName('CON'), 'con_');
  assert.equal(localName('ATL'), 'atl');
  const sun = { id: '18', abbrev: 'CON' };
  assert.equal(logoUrl(sun, 'wnba', '500'), '/logos/wnba/500/con_.png');
  assert.equal(cdnLogoUrl(sun, 'wnba', '500'), 'https://a.espncdn.com/i/teamlogos/wnba/500/con.png');
  assert.ok(walk(ROOT).includes('con_.png'), 'the crest is on disk under its safe name');
});
