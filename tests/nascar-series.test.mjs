/* THE O'REILLY AND TRUCK SERIES - the same race day, their own fields.
 *
 * Jason, 2026-09-13: "add the O'Reilly and Truck series too".
 *
 * fixtures/nascar/espn-oreilly-scoreboard-260912.json + oreilly-260912-race-core.json
 *   the O'Reilly Auto Parts Series at World Wide Technology Raceway, final
 * fixtures/nascar/espn-truck-scoreboard-260918.json + truck-260918-race-core.json
 *   the Truck Series at Bristol, before the race - four makes, RAM among them
 * Captured from ESPN 2026-09-13; nothing here is written by hand.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseNascar, makesOf, cleanNascarPicks, scoreNascar, MAKES } from '../src/lib/nascar.ts';
import { captureNascar, NASCAR_SERIES, isNascar } from '../src/nascar-feed.ts';
import { RACING, racingStandings } from '../src/f1-pool.ts';
import { isRacingSport } from '../src/lib/groups.ts';

const raw = (p) => readFileSync(new URL('../fixtures/nascar/' + p, import.meta.url), 'utf8');
const load = (p) => JSON.parse(raw(p));
const ORL = parseNascar(load('espn-oreilly-scoreboard-260912.json'), load('oreilly-260912-race-core.json'));
const TRK = parseNascar(load('espn-truck-scoreboard-260918.json'), load('truck-260918-race-core.json'));
const CUP = parseNascar(load('espn-nascar-scoreboard-260913.json'), load('wwt-2026-race-core-pre.json'));

test('three series, each a racing sport', () => {
  assert.deepEqual(Object.keys(NASCAR_SERIES), ['nascar', 'nascar-oreilly', 'nascar-truck']);
  assert.equal(NASCAR_SERIES['nascar-oreilly'].path, 'nascar-secondary');
  for (const s of ['nascar', 'nascar-oreilly', 'nascar-truck']) {
    assert.ok(isNascar(s) && isRacingSport(s) && RACING.includes(s), s);
  }
  assert.equal(isRacingSport('nba'), false);
});

test('the O\'Reilly race reads like the Cup: 36 cars, the grid, the finishing order', () => {
  assert.equal(ORL.state, 'final');
  assert.equal(ORL.drivers.length, 36);
  assert.equal(ORL.order.length, 36);
  assert.ok(ORL.drivers.every((d) => d.start >= 1));
  assert.deepEqual(makesOf(ORL), ['Chevrolet', 'Ford', 'Toyota']);
  const s = scoreNascar(ORL, { race: ORL.order.slice(0, 3) });
  assert.deepEqual(s.race, [3, 3, 3]);
});

test('the makes are read from the field: the Truck Series brings RAM, the Cup does not', () => {
  assert.equal(TRK.state, 'pre');
  assert.equal(TRK.drivers.length, 33);
  assert.deepEqual(makesOf(TRK), ['Chevrolet', 'Ford', 'Toyota', 'RAM']);
  assert.deepEqual(makesOf(CUP), MAKES);
  const before = TRK.start - 3600e3;
  assert.equal(cleanNascarPicks(TRK, { make: 'RAM' }, {}, before).make, 'RAM');
  assert.equal(cleanNascarPicks(CUP, { make: 'RAM' }, {}, CUP.start - 3600e3).make, undefined, 'no RAM in the Cup field');
});

function fakeKV(init = {}) {
  const m = new Map(Object.entries(init).map(([k, v]) => [k, { v }]));
  return {
    m,
    async get(k) { return m.has(k) ? m.get(k).v : null; },
    async put(k, v, o) {
      if (o && o.expirationTtl != null && !(Number.isInteger(o.expirationTtl) && o.expirationTtl >= 60 && o.expirationTtl < 2 ** 31)) throw new Error('bad ttl');
      m.set(k, { v, o });
    }
  };
}

test('each series reads its own ESPN path and keeps its own keys', async () => {
  const urls = [];
  const f = async (u) => {
    urls.push(u);
    return new Response(u.includes('/scoreboard') ? raw('espn-truck-scoreboard-260918.json') : raw('truck-260918-race-core.json'), { status: 200 });
  };
  const env = { LIVE: fakeKV() };
  const doc = await captureNascar(env, f, TRK.start - 86400e3, 'nascar-truck');
  assert.ok(urls[0].includes('/racing/nascar-truck/scoreboard'));
  assert.ok(urls[1].includes('/leagues/nascar-truck/events/'));
  assert.equal(doc.series, 'nascar-truck');
  assert.ok(env.LIVE.m.has('nascar-truck:current'));
  assert.equal(env.LIVE.m.has('nascar:current'), false, 'the Cup\'s key is not touched');
});

test('an O\'Reilly group\'s season board scores from the O\'Reilly archive', async () => {
  const picks = { race: ORL.order.slice(0, 3) };
  const env = {
    DB: { prepare: (sql) => ({ bind: () => ({ all: async () => ({ results: sql.includes('FROM member')
      ? [{ user_id: 'u1', display_name: 'Ann' }]
      : [{ user_id: 'u1', event_id: ORL.id, picks: JSON.stringify(picks) }] }) }) }) },
    LIVE: fakeKV({ ['nascar-oreilly:event:' + ORL.id]: JSON.stringify({ event: ORL }) })
  };
  const rows = await racingStandings(env, 'ORL123', 'nascar-oreilly');
  assert.equal(rows[0].points, 9, 'the podium, exactly');
});
