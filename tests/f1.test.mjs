/* F1 PICKS - read and scored off real captured F1 data.
 *
 * fixtures/feed/espn-f1-scoreboard-260912.json   Spanish GP: practice done, qualifying done, race to come
 * fixtures/feed/espn-f1-scoreboard-260906.json   Italian GP: the whole weekend final
 * fixtures/f1/italian-gp-2026-race-core.json     that race's 22 core competitor documents
 *
 * All captured from ESPN on 2026-09-12; nothing here is written by hand.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseF1, raceExtras, scoreTop3, scoreWeekend, isPickLocked, dnfBand, POINTS } from '../src/lib/f1.ts';
import { isStaleF1, captureF1 } from '../src/f1-feed.ts';

const load = (p) => JSON.parse(readFileSync(new URL('../fixtures/' + p, import.meta.url), 'utf8'));
const SPAIN = load('feed/espn-f1-scoreboard-260912.json');
const ITALY = load('feed/espn-f1-scoreboard-260906.json');
const ITALY_CORE = load('f1/italian-gp-2026-race-core.json');

test('the Spanish GP reads as five sessions, qualifying settled, the race to come', () => {
  const ev = parseF1(SPAIN);
  assert.equal(ev.name.includes('Spanish'), true);
  assert.deepEqual(ev.sessions.map((s) => s.abbr), ['FP1', 'FP2', 'FP3', 'Qual', 'Race']);
  const q = ev.sessions.find((s) => s.kind === 'qual');
  assert.equal(q.state, 'final', 'STATUS_SESSION_COMPLETE (state "in") is a finished qualifying');
  assert.deepEqual(q.order.slice(0, 3), ['5579', '5829', '4665'], 'Norris, Antonelli, Verstappen');
  const r = ev.sessions.find((s) => s.kind === 'race');
  assert.equal(r.state, 'pre');
  assert.deepEqual(r.order, [], 'a scheduled race lists drivers, not a result');
  assert.equal(ev.drivers.length, 22);
  assert.equal(ev.drivers.find((d) => d.id === '5579').short, 'Norris');
});

test('the Italian GP race settles: winner, retirements and the fastest lap off the core documents', () => {
  const ev = parseF1(ITALY);
  const r = ev.sessions.find((s) => s.kind === 'race');
  assert.equal(r.state, 'final');
  assert.equal(r.order[0], '5829', 'Antonelli won');
  const x = raceExtras(ITALY_CORE);
  assert.equal(x.fastest, '5829', 'and set the fastest lap - the only driver carrying a fastestLap stat');
  assert.equal(x.retired, 3, 'Stroll, Alonso, Leclerc retired');
});

test('cars come from the core race document: number, team, team colour', () => {
  const vehicles = {};
  for (const c of ITALY_CORE.competitors) vehicles[c.competitor.id] = { ...c.competitor.vehicle, team: c.competitor.vehicle.manufacturer };
  const ev = parseF1(ITALY, vehicles);
  const ant = ev.drivers.find((d) => d.id === '5829');
  assert.deepEqual([ant.number, ant.team, ant.color], ['12', 'Mercedes', '00d2be']);
});

test('scoring: 3 for the exact spot, 1 for the right driver in the wrong spot', () => {
  const actual = ['A', 'B', 'C', 'D'];
  assert.deepEqual(scoreTop3(['A', 'B', 'C'], actual), [3, 3, 3]);
  assert.deepEqual(scoreTop3(['B', 'A', 'D'], actual), [1, 1, 0]);
  assert.deepEqual(scoreTop3(['A'], actual), [3, 0, 0]);
  assert.equal(scoreTop3(['A', 'B', 'C'], ['A']), null, 'no result, no score');
  assert.equal(dnfBand(0), '0'); assert.equal(dnfBand(2), '1-2'); assert.equal(dnfBand(3), '3+');
  assert.equal(POINTS.exact, 3);
});

test('a whole weekend scores off the real Italian GP; an unfinished pick is null, never a miss', () => {
  const ev = parseF1(ITALY);
  const q = ev.sessions.find((s) => s.kind === 'qual').order;
  const r = ev.sessions.find((s) => s.kind === 'race').order;
  const extras = raceExtras(ITALY_CORE);
  const perfect = { qual: q.slice(0, 3), race: r.slice(0, 3), fastest: extras.fastest,
    poleWins: q[0] === r[0] ? 'yes' : 'no', dnf: dnfBand(extras.retired) };
  const s = scoreWeekend(ev, perfect, extras);
  assert.equal(s.total, 9 + 9 + 3 + 1 + 2, 'every pick right');
  const spain = scoreWeekend(parseF1(SPAIN), { qual: ['5579', '4665', '1'], race: ['5579', '5829', '4665'] }, null);
  assert.deepEqual(spain.qual, [3, 1, 0], 'Norris exact, Verstappen in the top three');
  assert.equal(spain.race, null, 'the race has not run');
  assert.equal(spain.total, 4);
});

test('a pick locks when its own session starts', () => {
  const ev = parseF1(SPAIN);
  const race = ev.sessions.find((s) => s.kind === 'race');
  assert.equal(isPickLocked(ev, 'qual', race.start - 1000), true, 'qualifying is done');
  assert.equal(isPickLocked(ev, 'race', race.start - 1000), false, 'the race is still open');
  assert.equal(isPickLocked(ev, 'fastest', race.start + 1000), true, 'shut at the start');
  assert.equal(isPickLocked(ev, 'sprint', 0), true, 'no sprint this weekend');
});

test('the feed refreshes every 45 s near a session, every 10 minutes otherwise; KV in seconds', async () => {
  const ev = parseF1(SPAIN);
  const race = ev.sessions.find((s) => s.kind === 'race');
  const doc = { fetchedAt: race.start - 5 * 60 * 1000, event: ev };
  assert.equal(isStaleF1(doc, race.start - 5 * 60 * 1000 + 60 * 1000), true, 'hot: a minute is stale');
  const quiet = { fetchedAt: race.start - 20 * 60 * 60 * 1000, event: ev };
  assert.equal(isStaleF1(quiet, race.start - 20 * 60 * 60 * 1000 + 5 * 60 * 1000), false);
  const puts = [];
  const env = { LIVE: { m: new Map(), async get(k) { return this.m.get(k) ?? null; },
    async put(k, v, o) { if (o && (!Number.isInteger(o.expirationTtl) || o.expirationTtl < 60)) throw new Error('Value out of range'); puts.push(k); this.m.set(k, v); } } };
  const f = async (u) => {
    const body = String(u).includes('/scoreboard') ? ITALY : { competitors: ITALY_CORE.competitors.map((c) => c.competitor) };
    return new Response(JSON.stringify(body), { status: 200 });
  };
  const out = await captureF1(env, f, Date.now());
  assert.equal(out.event.drivers.find((d) => d.id === '5829').team, 'Mercedes', 'cars merged');
  assert.ok(puts.includes('f1:current'));
});
