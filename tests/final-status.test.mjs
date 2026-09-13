/* A FINISHED GAME IS FINAL HOWEVER ESPN SPELLS IT.
 *
 * fixtures/feed/espn-epl-scoreboard-260912.json   7 Premier League matches, all STATUS_FULL_TIME
 * fixtures/feed/espn-mls-scoreboard-260912.json   12 MLS matches, all STATUS_FULL_TIME
 * Captured from ESPN 2026-09-13. Four of the seven EPL matches and four of the
 * twelve MLS matches were draws - which is why soccer needs a draw pick, and why
 * a finished draw must read as final, never as a game still going.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDay, statusOf } from '../src/slate-day.ts';

const load = (p) => JSON.parse(readFileSync(new URL('../fixtures/feed/' + p, import.meta.url), 'utf8'));

test('soccer\'s full time is final - every EPL and MLS match that day', () => {
  for (const [file, n] of [['espn-epl-scoreboard-260912.json', 7], ['espn-mls-scoreboard-260912.json', 12]]) {
    const games = parseDay(load(file), 'soccer', '20260912');
    assert.equal(games.length, n, file);
    assert.ok(games.every((g) => g.statusName === 'STATUS_FULL_TIME' && g.status === 'final'), file + ': full time read as final');
  }
});

test('a finished draw is final with level scores - graded, not left running', () => {
  const games = parseDay(load('espn-epl-scoreboard-260912.json'), 'soccer', '20260912');
  const draws = games.filter((g) => g.homeScore === g.awayScore);
  assert.equal(draws.length, 4, 'BOU-BRE 2-2, CHE-HUL 2-2, LIV-FUL 0-0, TOT-EVE 0-0');
  assert.ok(draws.every((g) => g.status === 'final'));
});

test('names first, then ESPN\'s own completed flag; a postponed or cancelled game is void whatever the flag', () => {
  assert.equal(statusOf('STATUS_FINAL'), 'final');
  assert.equal(statusOf('STATUS_FULL_TIME'), 'final');
  assert.equal(statusOf('STATUS_FINAL_PEN'), 'final');
  assert.equal(statusOf('STATUS_SOMETHING_NEW', true), 'final', 'a finish ESPN names in a new way still grades');
  assert.equal(statusOf('STATUS_IN_PROGRESS', false), 'in_progress');
  assert.equal(statusOf('STATUS_POSTPONED', true), 'void');
  assert.equal(statusOf('STATUS_CANCELED', true), 'void');
  assert.equal(statusOf('STATUS_SCHEDULED', false), 'scheduled');
});
