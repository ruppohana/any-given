/* F1 LIVE PICKS - built, settled and replayed off a real race.
 *
 * fixtures/f1/openf1-11361/        the 2026 Italian GP, every OpenF1 endpoint
 *                                  the timeline reads, captured 2026-09-12
 * fixtures/f1/openf1-2026-race-sessions.json   OpenF1's 2026 race list, same day
 * fixtures/f1/italian-gp-2026-race-core.json   ESPN's documents for the same race
 *
 * Nothing here is written by hand: the one cross-check is two sources agreeing
 * (OpenF1's lap times and ESPN's fastest-lap stat name the same driver).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { buildTimeline, offers, settle, scoreLive, lapOf, LIVE_POINTS } from '../src/lib/f1-live.ts';
import { buildReplay, listReplays } from '../src/f1-replay.ts';
import { parseF1, raceExtras } from '../src/lib/f1.ts';

const at = (p) => new URL('../fixtures/f1/' + p, import.meta.url);
const j = (n) => JSON.parse(readFileSync(at('openf1-11361/' + n + '.json'), 'utf8'));
const ROWS = {
  session: j('session')[0], drivers: j('drivers'), laps: j('laps'), pit: j('pit'),
  race_control: j('race_control'), position: j('position'), session_result: j('session_result'),
  intervals: JSON.parse(gunzipSync(readFileSync(at('openf1-11361/intervals.json.gz')))),
  meeting: j('meetings')[0].meeting_name
};
const TL = buildTimeline(ROWS);
const n = (acr) => TL.drivers.find((d) => d.acr === acr).n;

test('Monza 2026: 53 laps in time order, and the order at the flag is the classification', () => {
  assert.equal(TL.laps, 53);
  assert.equal(TL.meeting, 'Italian Grand Prix');
  assert.ok(TL.ends.every((t, i) => i === 0 || t >= TL.ends[i - 1]), 'lap ends never go backwards');
  assert.deepEqual(TL.order[53].slice(0, 3), TL.result.slice(0, 3));
  assert.deepEqual(TL.result.slice(0, 3), [n('ANT'), n('RUS'), n('VER')]);
  const flag = ROWS.race_control.find((m) => m.flag === 'CHEQUERED');
  assert.ok(Math.abs(Date.parse(flag.date) - TL.ends[53]) < 2000, 'the leader\'s last lap ends at the chequered flag');
  assert.ok(JSON.stringify(TL).length < 30000, 'the phone gets a few KB, not the 3 MB of intervals');
});

test('the fastest lap agrees with ESPN: Antonelli, 1:23.504 on the last lap', () => {
  const last = TL.bests.at(-1);
  assert.deepEqual([last.d, last.lap, last.s], [n('ANT'), 53, 83.504]);
  const espn = parseF1(JSON.parse(readFileSync(at('../feed/espn-f1-scoreboard-260906.json'), 'utf8')));
  const who = raceExtras(JSON.parse(readFileSync(at('italian-gp-2026-race-core.json'), 'utf8'))).fastest;
  assert.equal(espn.drivers.find((d) => d.id === who).short, 'Antonelli');
  assert.match(TL.drivers.find((d) => d.n === last.d).name, /ANTONELLI/);
});

test('the lap-3 red flag: one stoppage, and 21 cars parked in the pit lane are not 21 stops', () => {
  assert.deepEqual(TL.neutral.map((x) => x.kind), ['SC', 'RED', 'VSC']);
  assert.equal(TL.stops.length, 1);
  assert.equal(lapOf(TL, TL.neutral[2].t), 28, 'the VSC came on lap 28');
  assert.equal(ROWS.pit.length, 30);
  assert.equal(TL.pits.length, 9, 'nine real stops');
  assert.ok(TL.pits.every((p) => p.lane < 120));
  assert.equal(TL.pits[0].d, n('LAW'));
});

test('"CHEQUERED FLAG" is not a red flag', () => {
  assert.equal(TL.neutral.filter((x) => x.kind === 'RED').length, 1);
  assert.ok(TL.stops.every(([a, b]) => Number.isFinite(a) && Number.isFinite(b)), 'no Infinity - it would reach the phone as null');
});

test('what is on offer: the leader named, a close pair asked about, nothing past the flag', () => {
  const o20 = offers(TL, 20);
  assert.deepEqual(o20.map((o) => o.kind), ['pitNext', 'fastestNext', 'neutral10', 'leader10', 'gap5']);
  const leader = TL.drivers.find((d) => d.n === TL.order[20][0]).acr;
  assert.ok(o20.find((o) => o.kind === 'leader10').q.includes(leader));
  assert.ok(o20.every((o) => o.points === LIVE_POINTS[o.kind]), 'the card says what it is worth');
  assert.equal(offers(TL, 45).some((o) => o.kind === 'neutral10'), false, 'lap 55 does not exist');
  assert.deepEqual(offers(TL, 53), []);
  assert.equal(offers(TL, 0).some((o) => o.kind === 'fastestNext'), false, 'no lap to beat at the start');
});

test('a call reads nothing past the lap on screen', () => {
  const pick = { kind: 'pitNext', lap: 20, choice: String(n('HUL')) };
  assert.equal(settle(TL, pick, 27).state, 'open');
  const r = settle(TL, pick, 28);
  assert.deepEqual([r.state, r.points, r.answer, r.at], ['hit', 3, 'HUL', 28]);
});

test('a red flag voids the calls open across it - except the safety-car call, which it answers', () => {
  const pit = settle(TL, { kind: 'pitNext', lap: 2, choice: String(n('RUS')) }, 10);
  assert.equal(pit.state, 'void');
  assert.equal(pit.points, 0);
  const sc = settle(TL, { kind: 'neutral10', lap: 1, choice: 'yes' }, 10);
  assert.deepEqual([sc.state, sc.answer, sc.at], ['hit', 'SC', 3]);
});

test('a whole replay adds up', () => {
  const picks = [
    { kind: 'pitNext', lap: 2, choice: String(n('GAS')) },          // void - red flag
    { kind: 'neutral10', lap: 1, choice: 'yes' },                   // +1 - safety car lap 3
    { kind: 'pitNext', lap: 20, choice: String(n('HUL')) },         // +3
    { kind: 'fastestNext', lap: 20, choice: String(n('ANT')) },     // +3 - 1:24.595, lap 30
    { kind: 'neutral10', lap: 20, choice: 'yes' },                  // +1 - VSC lap 28
    { kind: 'leader10', lap: 20, choice: 'yes' },                   // 0 - the lead changed
    { kind: 'fastestNext', lap: 50, choice: 'none' },               // 0 - Antonelli, last lap
    { kind: 'neutral10', lap: 40, choice: 'no' }                    // +1
  ];
  assert.equal(scoreLive(TL, picks, 10).total, 1);
  const end = scoreLive(TL, picks, 53);
  assert.deepEqual(end.rows.map((r) => r.res.state), ['void', 'hit', 'hit', 'hit', 'hit', 'miss', 'miss', 'hit']);
  assert.equal(end.total, 9);
});

/* ---- the Worker side: fetch once, keep forever, never freeze an unfinished race ---- */

const SESSIONS = JSON.parse(readFileSync(at('openf1-2026-race-sessions.json'), 'utf8'));
function fakeOpenF1() {
  const calls = [];
  const f = async (u) => {
    const url = new URL(u);
    calls.push(url.pathname + url.search);
    const ep = url.pathname.split('/').pop();
    const q = url.searchParams;
    let body;
    if (ep === 'sessions') body = q.get('session_key') ? [ROWS.session] : SESSIONS;
    else if (ep === 'meetings') body = j('meetings');
    else if (ep === 'intervals') body = ROWS.intervals;
    else body = ROWS[ep];
    return new Response(JSON.stringify(body || []), { status: body ? 200 : 404 });
  };
  return { f, calls };
}
/* KV as Cloudflare enforces it: expirationTtl is seconds, 60 at the least. */
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

test('the Worker builds a race once from OpenF1, keeps it with no expiry, and serves it after', async () => {
  const { f, calls } = fakeOpenF1();
  const env = { LIVE: fakeKV() };
  const after = Date.parse(ROWS.session.date_end) + 2 * 60 * 60 * 1000;
  const tl = await buildReplay(env, 11361, f, after, 0);
  assert.equal(tl.laps, 53);
  assert.equal(tl.meeting, 'Italian Grand Prix');
  assert.equal(calls.length, 9);
  assert.equal(env.LIVE.m.get('f1:replay:11361').o, undefined, 'a finished race never changes - no TTL');
  const again = await buildReplay(env, 11361, f, after, 0);
  assert.equal(calls.length, 9, 'the second request is KV, not OpenF1');
  assert.deepEqual(again.result, tl.result);
});

test('a race still inside its hour after the flag is not frozen', async () => {
  const { f } = fakeOpenF1();
  const env = { LIVE: fakeKV() };
  const soon = Date.parse(ROWS.session.date_end) + 10 * 60 * 1000;
  assert.equal(await buildReplay(env, 11361, f, soon, 0), null);
  assert.equal(env.LIVE.m.size, 0);
});

test('the list: finished 2026 races and sprints, newest first, the next one not yet on it', async () => {
  const { f } = fakeOpenF1();
  const env = { LIVE: fakeKV() };
  const now = Date.parse('2026-09-12T20:00:00Z');
  const list = await listReplays(env, 2026, f, now);
  assert.equal(list[0].key, 11361, 'Monza, the last finished race');
  assert.equal(list.some((r) => r.key === 11369), false, 'Spain runs tomorrow');
  assert.ok(list.some((r) => r.name.endsWith('· Sprint')));
  assert.equal(list.some((r) => r.key === 11261 || r.key === 11269), false, 'Bahrain and Saudi Arabia were cancelled');
  assert.equal(list.length, SESSIONS.filter((s) => !s.is_cancelled && Date.parse(s.date_end) + 3600e3 <= now).length);
  assert.equal(env.LIVE.m.get('f1:replays:2026').o.expirationTtl, 6 * 60 * 60);
});
