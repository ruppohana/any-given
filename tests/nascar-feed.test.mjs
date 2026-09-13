/* NASCAR FROM THE FEED - capture, cache and keep, on captured ESPN payloads.
 *
 * The fake KV enforces KV's own rules (expirationTtl in whole seconds, at least 60,
 * under 2^31) - a fake that is friendlier than the platform hides the bug it is
 * for (vault CLAUDE.md, 2026-09-11).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { captureNascar, serveNascar, isStaleNascar } from '../src/nascar-feed.ts';

const raw = (p) => readFileSync(new URL('../fixtures/nascar/' + p, import.meta.url), 'utf8');

function fakeKV() {
  const m = new Map();
  return {
    m,
    async get(k) { return m.has(k) ? m.get(k).v : null; },
    async put(k, v, o) {
      if (o && o.expirationTtl != null && !(Number.isInteger(o.expirationTtl) && o.expirationTtl >= 60 && o.expirationTtl < 2 ** 31)) {
        throw new Error('KV PUT failed: 400 Invalid expiration_ttl');
      }
      m.set(k, { v, o });
    }
  };
}
function fakeEspn(board, core) {
  const calls = [];
  const f = async (u) => {
    calls.push(u.includes('/scoreboard') ? 'scoreboard' : u.includes('/competitions/') ? 'core' : u);
    const body = u.includes('/scoreboard') ? raw(board) : raw(core);
    return new Response(body, { status: 200 });
  };
  return { f, calls };
}

test('before the race: the cars and the grid are read once, then kept for the race', async () => {
  const env = { LIVE: fakeKV() };
  const { f, calls } = fakeEspn('espn-nascar-scoreboard-260913.json', 'wwt-2026-race-core-pre.json');
  const now = Date.parse('2026-09-13T06:00:00Z');
  const doc = await captureNascar(env, f, now);
  assert.equal(doc.event.state, 'pre');
  assert.equal(doc.event.drivers.length, 36);
  assert.ok(doc.event.drivers.every((d) => d.make && d.start));
  assert.deepEqual(calls, ['scoreboard', 'core']);
  await captureNascar(env, f, now + 60_000);
  assert.deepEqual(calls, ['scoreboard', 'core', 'scoreboard'], 'the core document is not read again');
  assert.equal(env.LIVE.m.has('nascar:event:' + doc.event.id), false, 'nothing is kept before the race is final');
});

test('a finished race is kept for the season board', async () => {
  const env = { LIVE: fakeKV() };
  const { f } = fakeEspn('espn-nascar-scoreboard-260906.json', 'darlington-2026-race-core.json');
  const doc = await captureNascar(env, f, Date.parse('2026-09-07T12:00:00Z'));
  assert.equal(doc.event.state, 'final');
  const kept = JSON.parse(env.LIVE.m.get('nascar:event:' + doc.event.id).v);
  assert.equal(kept.event.order[0], doc.event.order[0]);
  assert.ok(kept.event.order.length >= 36);
});

test('fresh for 45 seconds around the race, ten minutes otherwise; served from KV while fresh', async () => {
  const start = Date.parse('2026-09-13T19:00:00Z');
  const doc = { fetchedAt: start - 60_000, event: { state: 'pre', start } };
  assert.equal(isStaleNascar(doc, start - 10_000), true, 'inside the window, a minute is stale');
  assert.equal(isStaleNascar({ ...doc, fetchedAt: start - 20 * 3600e3 }, start - 20 * 3600e3 + 5 * 60e3), false, 'the night before, five minutes is fresh');
  const env = { LIVE: fakeKV() };
  const { f, calls } = fakeEspn('espn-nascar-scoreboard-260913.json', 'wwt-2026-race-core-pre.json');
  const now = Date.parse('2026-09-13T06:00:00Z');
  await serveNascar(env, now, f);
  await serveNascar(env, now + 60_000, f);
  assert.equal(calls.filter((c) => c === 'scoreboard').length, 1, 'the second request is KV');
});
