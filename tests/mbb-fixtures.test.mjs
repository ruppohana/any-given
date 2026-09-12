/* THE BASKETBALL FIXTURES ARE REAL, WHOLE, AND READ THE WAY THE COUNTS READ THEM.
 *
 * Basketball starts from captured games (tools/capture-fixture.mjs --sport mbb),
 * never invented ones - the vault's rule after 306 football tests passed against
 * a play-text shape the feed never sent.
 *
 * 🔴 AND THE READING IS PINNED, NOT JUST THE FILES. ESPN files a made and a
 * missed shot under one play type ("JumpShot"), so a shot's value comes from
 * pointsAttempted and its result from scoringPlay. tools/count-mbb.mjs prices
 * off exactly that reading; these tests hold it to each game's own box score,
 * team by team, so a wrong reading fails here before it reaches a price.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const DIR = new URL('../fixtures/mbb/', import.meta.url);
const FILES = readdirSync(DIR).filter((f) => f.endsWith('-final.json'));
const load = (f) => JSON.parse(readFileSync(new URL(f, DIR), 'utf8'));
const box = (team, name) => {
  const st = (team.statistics || []).find((x) => x.name === name);
  const [m, a] = String(st?.displayValue || '').split('-').map(Number);
  return { m, a };
};

test('at least three whole, final basketball games are captured', () => {
  assert.ok(FILES.length >= 3, 'three or more fixtures in fixtures/mbb/');
  for (const f of FILES) {
    const doc = load(f);
    assert.equal(doc.header?.competitions?.[0]?.status?.type?.completed, true, f + ' is final');
    assert.ok((doc.plays || []).length >= 300, f + ' has a whole game of plays');
    assert.ok((doc.winprobability || []).length > 0, f + ' carries the win-probability series');
  }
});

test('shots read by pointsAttempted and scoringPlay match the box score, team by team', () => {
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

test('scoring plays add up to the final score', () => {
  for (const f of FILES) {
    const doc = load(f);
    const pts = {};
    for (const p of doc.plays) if (p.scoringPlay) pts[p.team.id] = (pts[p.team.id] || 0) + (Number(p.scoreValue) || 0);
    for (const c of doc.header.competitions[0].competitors) {
      assert.equal(pts[c.team.id] || 0, Number(c.score), f + ' ' + c.team.abbreviation + ' final score');
    }
  }
});

test('a make and a miss share one play type - which is why the result is read from scoringPlay', () => {
  const seen = {};
  for (const f of FILES) {
    for (const p of load(f).plays) {
      if (!p.shootingPlay) continue;
      const s = seen[p.type.text] || (seen[p.type.text] = new Set());
      s.add(!!p.scoringPlay);
    }
  }
  assert.ok(seen.JumpShot && seen.JumpShot.size === 2, 'JumpShot carries both makes and misses');
});
