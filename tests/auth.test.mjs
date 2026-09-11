/* THE DEVICE ID HAS ONE SPELLING.
 *
 * Found in D1 2026-09-10: picks stored under `"vvh8..."` - quotes included -
 * beside picks under bare ids, because the live screen JSON-encoded
 * `ag.device` while the slate, standings and sign-in sheet read it raw. The
 * sign-in migration matched the bare id only, so a quoted history never moved
 * to the account, and a phone that opened the slate first had its id replaced
 * the moment it opened Live.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { normDevice } from '../src/auth.ts';

test('normDevice strips JSON quotes so both spellings are one person', () => {
  assert.equal(normDevice('"vvh8jbk8f"'), 'vvh8jbk8f');
  assert.equal(normDevice('dpmbtlj7zu'), 'dpmbtlj7zu');
  assert.equal(normDevice(undefined), '');
  assert.equal(normDevice('x'.repeat(200)).length, 80);
});

test('the sign-in migration moves picks under either spelling', () => {
  const src = readFileSync(new URL('../src/auth.ts', import.meta.url), 'utf8');
  for (const table of ['pick SET user_id', 'member SET user_id', 'pool SET commissioner_id']) {
    const line = src.split('\n').find((l) => l.includes(table));
    assert.ok(line && /IN \(\?, \?\)/.test(line), table + ' must match the bare and the quoted id');
  }
});

test('every client reader of ag.device reads it raw and unwraps a quoted value', () => {
  for (const f of ['public/screens/live-game.screen.js', 'public/screens/p2-slate.screen.js',
                   'public/screens/p5-standings.screen.js', 'public/components/signin.js']) {
    const src = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    const body = src.slice(src.indexOf('function deviceId()'), src.indexOf('function deviceId()') + 900);
    assert.ok(/'ag\.device'/.test(body), f + ' reads ag.device by its full key');
    assert.ok(/\[0\] === '"'/.test(body), f + ' unwraps a quoted legacy value');
    assert.ok(!/store\.get\('device'/.test(body), f + ' must not JSON-decode the device id');
  }
});
