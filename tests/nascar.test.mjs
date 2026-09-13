/* NASCAR RACE DAY - read and scored off real captured ESPN data.
 *
 * fixtures/nascar/espn-nascar-scoreboard-260913.json   World Wide Technology Raceway, before the race
 * fixtures/nascar/wwt-2026-race-core-pre.json          its core document: cars, makes, the grid
 * fixtures/nascar/espn-nascar-scoreboard-260906.json   Darlington, final
 * fixtures/nascar/darlington-2026-race-core.json       its core document
 *
 * All captured from ESPN on 2026-09-12/13; nothing here is written by hand.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseNascar, isLocked, poleSitter, isDarkHorse, cleanNascarPicks, scoreNascar, NPOINTS, MAKES } from '../src/lib/nascar.ts';

const load = (p) => JSON.parse(readFileSync(new URL('../fixtures/nascar/' + p, import.meta.url), 'utf8'));
const WWT = parseNascar(load('espn-nascar-scoreboard-260913.json'), load('wwt-2026-race-core-pre.json'));
const DAR = parseNascar(load('espn-nascar-scoreboard-260906.json'), load('darlington-2026-race-core.json'));
const byName = (ev, s) => ev.drivers.find((d) => d.name === s);

test('the WWT race before the green flag: 36 cars, every make and grid slot, no result', () => {
  assert.equal(WWT.state, 'pre');
  assert.equal(WWT.drivers.length, 36);
  assert.deepEqual(WWT.order, []);
  assert.ok(WWT.drivers.every((d) => MAKES.includes(d.make)), 'every car is a Chevrolet, a Ford or a Toyota');
  assert.ok(WWT.drivers.every((d) => d.start >= 1 && d.start <= 36));
  assert.equal(poleSitter(WWT).name, 'Joey Logano');
  assert.equal(poleSitter(WWT).number, '22');
  assert.equal(WWT.start, Date.parse('2026-09-13T19:00Z'));
  assert.ok(WWT.name.includes('World Wide Technology Raceway'));
});

test('everything locks at the green flag', () => {
  assert.equal(isLocked(WWT, Date.parse('2026-09-13T18:59:59Z')), false);
  assert.equal(isLocked(WWT, Date.parse('2026-09-13T19:00:00Z')), true);
  assert.equal(isLocked(DAR, Date.parse('2026-09-01T00:00:00Z')), true, 'a final race is locked whatever the clock says');
});

test('picks: a valid change is taken, a dark horse must start 11th or worse, nothing moves after the flag', () => {
  const before = Date.parse('2026-09-13T12:00:00Z');
  const ids = WWT.drivers.map((d) => d.id);
  const back = WWT.drivers.find((d) => d.start === 20);
  const front = WWT.drivers.find((d) => d.start === 2);
  const got = cleanNascarPicks(WWT, { race: [ids[0], ids[1], ids[2]], make: 'Ford', poleWins: 'no', darkHorse: back.id }, {}, before);
  assert.deepEqual(got, { race: [ids[0], ids[1], ids[2]], make: 'Ford', poleWins: 'no', darkHorse: back.id });
  assert.equal(cleanNascarPicks(WWT, { darkHorse: front.id }, {}, before).darkHorse, undefined, 'P2 on the grid is not a dark horse');
  assert.equal(cleanNascarPicks(WWT, { make: 'Dodge' }, {}, before).make, undefined);
  assert.equal(cleanNascarPicks(WWT, { race: [ids[0], ids[0], ''] }, {}, before).race, undefined, 'one driver twice');
  const after = Date.parse('2026-09-13T19:30:00Z');
  assert.deepEqual(cleanNascarPicks(WWT, { make: 'Toyota' }, { make: 'Ford' }, after), { make: 'Ford' });
  assert.equal(isDarkHorse(WWT, back.id), true);
});

test('Darlington settles: Christopher Bell won in a Toyota, the pole did not', () => {
  assert.equal(DAR.state, 'final');
  const bell = byName(DAR, 'Christopher Bell');
  assert.equal(DAR.order[0], bell.id);
  assert.equal(bell.make, 'Toyota');
  assert.equal(bell.number, '20');
  const pole = poleSitter(DAR);
  assert.notEqual(DAR.order[0], pole.id);
  const podium = DAR.order.slice(0, 3);
  const s = scoreNascar(DAR, { race: [podium[0], podium[2], 'nobody'], make: 'Toyota', poleWins: 'no' });
  assert.deepEqual(s.race, [NPOINTS.exact, NPOINTS.inTop3, 0]);
  assert.equal(s.make, NPOINTS.make);
  assert.equal(s.poleWins, NPOINTS.poleWins);
  assert.equal(s.total, 3 + 1 + 2 + 1);
});

test('a dark horse scores only in the top ten; nothing scores before the race is final', () => {
  const tenth = DAR.order[9], eleventh = DAR.order[10];
  assert.equal(scoreNascar(DAR, { darkHorse: tenth }).darkHorse, NPOINTS.darkHorse);
  assert.equal(scoreNascar(DAR, { darkHorse: eleventh }).darkHorse, 0);
  const pre = scoreNascar(WWT, { race: [WWT.drivers[0].id, '', ''], make: 'Ford' });
  assert.deepEqual([pre.race, pre.make, pre.total], [null, null, 0]);
});
