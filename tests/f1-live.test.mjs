/* F1 LIVE PICKS - built, settled and replayed off real races.
 *
 * fixtures/f1/openf1-11361/        the 2026 Italian GP, every OpenF1 endpoint
 *                                  the timeline reads, captured 2026-09-12
 * fixtures/f1/openf1-11342/        the 2026 Hungarian GP (44 stops - the
 *                                  undercut race), captured the same day
 * fixtures/f1/openf1-2026-race-sessions.json   OpenF1's 2026 race list, same day
 * fixtures/f1/italian-gp-2026-race-core.json   ESPN's documents for Monza
 *
 * Nothing here is written by hand: the one cross-check is two sources agreeing
 * (OpenF1's lap times and ESPN's fastest-lap stat name the same driver).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { buildTimeline, offers, settle, scoreLive, lapOf, LIVE_POINTS } from '../src/lib/f1-live.ts';
import { buildReplay, listReplays } from '../src/f1-replay.ts';
import { parseF1, raceExtras } from '../src/lib/f1.ts';

const at = (p) => new URL('../fixtures/f1/' + p, import.meta.url);
/* A file over 500 KB was captured gzipped. */
const race = (key) => {
  const j = (n) => {
    const plain = at(`openf1-${key}/${n}.json`);
    return existsSync(plain) ? JSON.parse(readFileSync(plain, 'utf8'))
      : JSON.parse(gunzipSync(readFileSync(at(`openf1-${key}/${n}.json.gz`))));
  };
  return {
    session: j('session')[0], drivers: j('drivers'), laps: j('laps'), pit: j('pit'),
    race_control: j('race_control'), position: j('position'), session_result: j('session_result'),
    intervals: j('intervals'), overtakes: j('overtakes'), meetings: j('meetings'), meeting: j('meetings')[0].meeting_name
  };
};
const ROWS = race(11361);
const TL = buildTimeline(ROWS);
const HU_ROWS = race(11342);
const HU = buildTimeline(HU_ROWS);
const numOf = (tl) => (acr) => tl.drivers.find((d) => d.acr === acr).n;
const n = numOf(TL), h = numOf(HU);

test('Monza 2026: 53 laps in time order, and the order at the flag is the classification', () => {
  assert.equal(TL.laps, 53);
  assert.equal(TL.v, 2);
  assert.equal(TL.meeting, 'Italian Grand Prix');
  assert.ok(TL.ends.every((t, i) => i === 0 || t >= TL.ends[i - 1]), 'lap ends never go backwards');
  assert.deepEqual(TL.order[53].slice(0, 3), TL.result.slice(0, 3));
  assert.deepEqual(TL.result.slice(0, 3), [n('ANT'), n('RUS'), n('VER')]);
  const flag = ROWS.race_control.find((m) => m.flag === 'CHEQUERED');
  assert.ok(Math.abs(Date.parse(flag.date) - TL.ends[53]) < 2000, 'the leader\'s last lap ends at the chequered flag');
  assert.ok(JSON.stringify(TL).length < 40000, 'the phone gets a few KB, not the 3 MB of intervals');
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

test('OpenF1\'s overtakes are cleaned: no pass beside a stop, and every pass sticks to the next lap end', () => {
  assert.equal(ROWS.overtakes.length, 334);
  assert.ok(TL.passes.length < ROWS.overtakes.length);
  const byLaw = ROWS.overtakes.filter((o) => o.overtaken_driver_number === n('LAW'));
  const lawStop = TL.pits.find((p) => p.d === n('LAW'));
  assert.ok(byLaw.some((o) => Math.abs(Date.parse(o.date) - lawStop.t) < 60000), 'the raw feed has cars "passing" LAW in the pit lane');
  assert.equal(TL.passes.some((p) => p.on === n('LAW') && Math.abs(p.t - lawStop.t) < 60000), false, 'the timeline does not');
  for (const p of TL.passes) {
    let L = 0;
    while (L < TL.laps && TL.ends[L] < p.t + 1000) L++;
    assert.ok(TL.order[L].indexOf(p.by) < TL.order[L].indexOf(p.on));
  }
});

test('what is on offer: the leader named, a close pair asked about, nothing past the flag', () => {
  const o20 = offers(TL, 20);
  const kinds = o20.map((o) => o.kind);
  for (const k of ['pitNext', 'fastestNext', 'passNext', 'neutral10', 'leader10', 'gap5']) assert.ok(kinds.includes(k), k);
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
  const pass = settle(TL, { kind: 'pass5', lap: 2, choice: 'yes' }, 10);
  assert.equal(pass.state, 'void', 'the pass call open across the lap-3 stoppage');
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

/* ---- the undercut and the passes, on Hungary ---- */

test('Hungary 2026: 70 laps, 44 stops, the classification at the flag', () => {
  assert.equal(HU.laps, 70);
  assert.equal(HU.meeting, 'Hungarian Grand Prix');
  assert.equal(HU.pits.length, 44);
  assert.deepEqual(HU.order[70].slice(0, 3), HU.result.slice(0, 3));
});

test('the undercut is offered on the lap a car stops from close behind, and settles once the rival stops', () => {
  const o = offers(HU, 9).find((x) => x.kind === 'undercut');
  assert.ok(o, 'STR stopped behind SAI on lap 9');
  assert.equal(o.q, 'Undercut: STR stopped behind SAI. Ahead once SAI stops?');
  assert.equal(o.points, LIVE_POINTS.undercut);
  const pick = { kind: 'undercut', lap: 9, choice: 'yes' };
  const saiStop = HU.pits.find((p) => p.d === h('SAI') && p.t > HU.ends[9]);
  const L2 = lapOf(HU, saiStop.t) + 1;
  assert.equal(settle(HU, pick, L2 - 1).state, 'open', 'not before SAI has stopped and run a lap');
  assert.deepEqual([settle(HU, pick, L2).state, settle(HU, pick, L2).answer, settle(HU, pick, L2).at], ['hit', 'STR came out ahead', 20]);
  const hv = settle(HU, { kind: 'undercut', lap: 14, choice: 'yes' }, 70);
  assert.deepEqual([hv.state, hv.answer], ['miss', 'VER stayed ahead'], 'HAM\'s undercut on VER failed');
  const none = settle(HU, { kind: 'undercut', lap: 40, choice: 'no' }, 70);
  assert.deepEqual([none.state, none.why], ['void', 'LIN did not stop']);
  assert.equal(offers(HU, 8).some((x) => x.kind === 'undercut'), false, 'no stop on lap 8, no undercut card');
});

test('next pass in the top ten: the first clean pass after the call, and only on track', () => {
  const r = settle(TL, { kind: 'passNext', lap: 15, choice: String(n('HAM')) }, 53);
  assert.deepEqual([r.state, r.points, r.answer, r.at], ['hit', 3, 'HAM past PIA', 16]);
  const p = TL.passes.find((x) => x.t > TL.ends[15] && x.pos <= 10);
  assert.equal(settle(TL, { kind: 'passNext', lap: 15, choice: String(n('HAM')) }, lapOf(TL, p.t) - 1).state, 'open');
});

test('does X pass Y: a car inside a second, settled by a pass, by no pass, or voided by a stop', () => {
  const o = offers(HU, 1).find((x) => x.kind === 'pass5');
  assert.equal(o.q, 'Does NOR pass PIA by lap 6?');
  assert.deepEqual([settle(HU, { kind: 'pass5', lap: 1, choice: 'no' }, 6).state, settle(HU, { kind: 'pass5', lap: 1, choice: 'no' }, 6).answer], ['hit', 'No pass']);
  assert.equal(settle(HU, { kind: 'pass5', lap: 1, choice: 'no' }, 5).state, 'open', 'no-pass is only known at lap 6');
  const hit = settle(TL, { kind: 'pass5', lap: 1, choice: 'yes' }, 53);
  assert.deepEqual([hit.state, hit.answer], ['hit', 'RUS passed']);
  let voidedByStop = null;
  for (let L = 1; L < HU.laps - 5 && !voidedByStop; L++) {
    if (!offers(HU, L).some((x) => x.kind === 'pass5')) continue;
    const r = settle(HU, { kind: 'pass5', lap: L, choice: 'yes' }, HU.laps);
    if (r.why === 'A stop decided it') voidedByStop = r;
  }
  assert.ok(voidedByStop, 'a pit stop inside the window voids the pass call');
  assert.equal(voidedByStop.points, 0);
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
const AFTER = Date.parse(ROWS.session.date_end) + 2 * 60 * 60 * 1000;

test('the Worker builds a race once from OpenF1, keeps it with no expiry, and serves it after', async () => {
  const { f, calls } = fakeOpenF1();
  const env = { LIVE: fakeKV() };
  const tl = await buildReplay(env, 11361, f, AFTER, 0);
  assert.equal(tl.laps, 53);
  assert.equal(tl.meeting, 'Italian Grand Prix');
  assert.equal(tl.passes.length, TL.passes.length, 'overtakes fetched');
  assert.equal(calls.length, 10);
  assert.equal(env.LIVE.m.get('f1:replay:11361').o, undefined, 'a finished race never changes - no TTL');
  const again = await buildReplay(env, 11361, f, AFTER, 0);
  assert.equal(calls.length, 10, 'the second request is KV, not OpenF1');
  assert.deepEqual(again.result, tl.result);
});

test('a timeline from the older build is rebuilt, not served without its passes', async () => {
  const { f, calls } = fakeOpenF1();
  const env = { LIVE: fakeKV() };
  const old = { ...TL, v: 1 };
  delete old.passes;
  await env.LIVE.put('f1:replay:11361', JSON.stringify(old));
  const tl = await buildReplay(env, 11361, f, AFTER, 0);
  assert.equal(calls.length, 10);
  assert.equal(tl.v, 2);
  assert.ok(Array.isArray(tl.passes));
});

test('a failed rebuild plays the old copy instead of an error - found live the night v2 shipped', async () => {
  const env = { LIVE: fakeKV() };
  const old = { ...TL, v: 1 };
  delete old.passes;
  await env.LIVE.put('f1:replay:11361', JSON.stringify(old));
  const calls = [];
  const limited = async (u) => { calls.push(u); return new Response('{"detail":"rate limit"}', { status: 429 }); };
  const tl = await buildReplay(env, 11361, limited, AFTER, 0);
  assert.equal(tl.laps, 53);
  assert.deepEqual(tl.passes, [], 'the pass calls have nothing to settle on, and void');
  assert.equal(calls.length, 2, 'one retry on a 429, then the old copy');
  assert.equal(JSON.parse(env.LIVE.m.get('f1:replay:11361').v).v, 1, 'the old copy is not overwritten with a failure');
  await assert.rejects(buildReplay({ LIVE: fakeKV() }, 11361, limited, AFTER, 0), /openf1 sessions 429/, 'with nothing cached, the error stands');
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
