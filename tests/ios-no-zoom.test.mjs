/* NO FIELD ZOOMS THE PAGE ON AN IPHONE.
 *
 * iOS Safari zooms in when a form field under 16px takes focus, and the app's
 * fields sit at --t-body (13px) - the group name, the Sport select, the
 * commissioner's fields. Found 2026-09-13. One rule in tokens.css, iOS only.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const T = readFileSync(new URL('../public/styles/tokens.css', import.meta.url), 'utf8');

test('form fields are at least 16px on iOS, and only on iOS', () => {
  const i = T.indexOf('@supports (-webkit-touch-callout: none) {');
  assert.ok(i > 0, 'the iOS-only block is there');
  assert.ok(T.slice(i, i + 200).includes('input, select, textarea { font-size: max(16px, 1em) !important; }'));
  assert.match(T, /--t-body:\s+13px;/, 'the reason: the workhorse size is under 16px');
});
