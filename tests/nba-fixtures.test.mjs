/* THE NBA FIXTURES ARE REAL, WHOLE, AND READ THE WAY THE COLLEGE ONES ARE.
 *
 * Captured with tools/capture-fixture.mjs --sport nba on 2026-09-12. The same
 * reading as tests/mbb-fixtures.test.mjs - a shot's value from pointsAttempted,
 * its result from scoringPlay - held to each game's own box score, because the
 * NBA's plays come off the same ESPN summary shape and a wrong reading would
 * fail here before it reached a price.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const DIR = new URL('../fixtures/nba/', import.meta.url);
const FILES = readdirSync(DIR).filter((f) => f.endsWith('-final.json'));
const load = (f) => JSON.parse(readFileSync(new URL(f, DIR), 'utf8'));
const box = (team, name) => {
  const st = (team.statistics || []).find((x) => x.name === name);
  const [m, a] = String(st?.displayValue || '').split('-').map(Number);
  return { m, a };
};

test('whole, final NBA games are captured', () => {
  assert.ok(FILES.length >= 2, 'two or more fixtures in fixtures/nba/');
  for (const f of FILES) {
    const doc = load(f);
    assert.equal(doc.header?.competitions?.[0]?.status?.type?.completed, true, f + ' is final');
    assert.ok((doc.plays || []).length >= 300, f + ' has a whole game of plays');
  }
});

test('NBA shots read by pointsAttempted and scoringPlay match the box score, team by team', () => {
  for (const f of FILES) {
    const doc = load(f);
    const t = {};
    for (const p of doc.plays) {
      const pts = Number(p.pointsAttempted) || 0;
      if (!p.shootingPlay || !pts) continue;
      const c = t[p.team.id] || (t[p.team.id] = { fga: 0, fgm: 0, tpa: 0, tpm: 0, fta: 0, ftm: 0 });
      if (pts === 1) { c.fta++; if (p.scoringPlay) c.ftm++; continue; }
      c.fga++; if (p.scoringPlay) c.fgm++;
      if (pts === 3) { c.tpa++; if (p.scoringPlay) c.tpm++; }
    }
    for (const team of doc.boxscore.teams) {
      const c = t[team.team.id];
      const who = f + ' ' + team.team.abbreviation;
      const fg = box(team, 'fieldGoalsMade-fieldGoalsAttempted');
      const tp = box(team, 'threePointFieldGoalsMade-threePointFieldGoalsAttempted');
      const ft = box(team, 'freeThrowsMade-freeThrowsAttempted');
      assert.deepEqual([c.fgm, c.fga], [fg.m, fg.a], who + ' field goals');
      assert.deepEqual([c.tpm, c.tpa], [tp.m, tp.a], who + ' threes');
      assert.deepEqual([c.ftm, c.fta], [ft.m, ft.a], who + ' free throws');
    }
  }
});

test('NBA scoring plays add up to the final score', () => {
  for (const f of FILES) {
    const doc = load(f);
    const pts = {};
    for (const p of doc.plays) if (p.scoringPlay) pts[p.team.id] = (pts[p.team.id] || 0) + (Number(p.scoreValue) || 0);
    for (const c of doc.header.competitions[0].competitors) {
      assert.equal(pts[c.team.id] || 0, Number(c.score), f + ' ' + c.team.abbreviation + ' final score');
    }
  }
});
