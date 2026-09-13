/* NO AGE GATE.
 *
 * Jason, 2026-09-13: "and we dont have to be 18+ anymore" / "so change that and
 * remove it from the sign in". The 18+ rating was there for the betting side
 * (settled.md, 2026-09-07); with the app 100% pool - free, no prize, no money -
 * it came off. The COPPA line is kept the ordinary general-audience way: the
 * privacy page says the app is not directed at children under 13 and that we
 * delete what we learn came from one. No checkbox, no date of birth.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const SI = read('public/components/signin.js');
const AUTH = read('src/auth.ts');
const PRIV = read('public/privacy.html');
const RULES = read('public/screens/s6-rules.screen.js');

test('the sign-in sheet asks for an email and nothing about age', () => {
  assert.equal(/18 or older|ag-si-age|ageOk/.test(SI), false, 'an age box survived on the sheet');
  assert.ok(SI.includes('body: JSON.stringify({ email }) });'), 'step one sends the address alone');
  assert.ok(SI.includes('box.append(inp, go, err);'));
});

test('the server no longer refuses an address without an age confirmation', () => {
  assert.equal(/ageOk\s*!==\s*true/.test(AUTH), false);
  assert.equal(AUTH.includes('You need to be 18'), false);
  /* An old cached client that still sends ageOk is ignored, and the account row
     no longer claims a confirmation nobody gave. */
  assert.ok(AUTH.includes('INSERT INTO account (id, email, verified_at, created_at) VALUES (?, ?, NULL, ?)'));
});

test('the privacy page carries the under-13 line, not an adults-only one', () => {
  assert.equal(/under 18|18 or older|adults only/i.test(PRIV), false);
  assert.ok(PRIV.includes('isn\'t directed at children under 13'));
  assert.ok(PRIV.includes('Effective September 13, 2026'), 'the date moves with the page');
  /* What the app collects changed with the opt-ins; the page says so. */
  assert.ok(PRIV.includes('Your phone number, only if you give one'));
});

test('the rules answer "Is this gambling?" without a rating', () => {
  /* Comments may say why it came off; the words a player reads may not carry it. */
  const shown = RULES.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(/18\+/.test(shown), false);
  assert.ok(RULES.includes("h: 'No money, and no age wall'"));
});
