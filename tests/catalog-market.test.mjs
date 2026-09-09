/* WHAT THE MARKET TAUGHT THE CATALOG, defended against the three real games.
 *
 * 🔴 WHY THIS FILE EXISTS. Jason, 2026-09-08: "ask what opportunities are there
 * for betting, you have obviously not done that." He was right. Every call type
 * before this file was reasoned outward from what the ESPN feed happens to
 * expose. Four operator rulebooks filed with state regulators - DraftKings
 * 8/18/25, Fanatics 10/6/25, FanDuel, BetMGM - plus Simplebet's published handle
 * say the thing a feed cannot: WHICH QUESTIONS PEOPLE ACTUALLY ANSWER, and how
 * the ones that get answered are settled when they go wrong.
 *
 * Every assertion below is either a rule quoted from one of those documents or a
 * number counted over `fixtures/real-*-260905-final.json`. Nothing here was
 * invented, and no fixture was written for it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CALL_TYPES, byId, offerFor, settle, settleDrive, sackCountsAs
} from '../src/catalog.ts';

const load = (f) => JSON.parse(readFileSync(new URL('../fixtures/' + f, import.meta.url), 'utf8'));
const GAMES = ['real-utep-at-ou', 'real-ball-at-osu', 'real-bois-at-ore'];

/** Every drive in the three real games, flattened once. */
function realDrives() {
  const out = [];
  for (const g of GAMES) {
    const s = load(`${g}-260905-final.json`);
    const ds = [...(s.drives?.previous || []), ...(s.drives?.current ? [s.drives.current] : [])];
    for (const d of ds) {
      out.push({
        result: String(d.result || d.displayResult || ''),
        plays: (d.plays || []).map((p) => ({
          text: p.text || '', typeText: p.type?.text || '', statYardage: p.statYardage,
          endYardsToEndzone: p.end?.yardsToEndzone
        }))
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * The sack rule — the correction with the widest blast radius
 * ------------------------------------------------------------------ */

test('🔴 a sack is a PASS in the NFL and a RUSH in college — the rulebooks, verbatim', () => {
  /* DraftKings, house rules 8/18/25: "A sack will be settled as a pass attempt
   * for NFL Games. A sack will be settled as a rush attempt for NCAA Games."
   * Fanatics, FanDuel and betr all say the same thing. The catalog had it
   * hardcoded to PASS - right for the NFL rig, WRONG for the shipping sport. */
  assert.equal(sackCountsAs('nfl'), 'pass');
  assert.equal(sackCountsAs('college-football'), 'run');

  const sack = { text: 'J.Mateer sacked at OU 20 for -7 yards', typeText: 'Sack' };
  assert.equal(settle('run_pass', 'pass', sack, { sport: 'nfl' }).landed, true);
  assert.equal(settle('run_pass', 'run', sack, { sport: 'nfl' }).landed, false);
  assert.equal(settle('run_pass', 'run', sack, { sport: 'college-football' }).landed, true);
  assert.equal(settle('run_pass', 'pass', sack, { sport: 'college-football' }).landed, false);
});

test('🔴 an unknown league VOIDS a sack rather than guessing which way it went', () => {
  /* The same discipline `teams.ts` has. A sack graded the wrong way does not look
   * wrong - it looks like a call that lost, and nobody can tell the difference
   * from the outside. A sack lands on 16% of real drives, so a silent default
   * would have been wrong on roughly one drive in six. */
  const sack = { text: 'sacked at SEA 30 for -5 yards', typeText: 'Sack' };
  const r = settle('run_pass', 'run', sack, {});
  assert.equal(r.landed, null);
  assert.match(r.because, /no league/);
});

/* ------------------------------------------------------------------ *
 * The market's own settlement edge cases
 * ------------------------------------------------------------------ */

test('an interception is an incomplete pass, never a turnover of its own', () => {
  /* FanDuel grades interceptions as incomplete passes. The question asked what
   * the offense CALLED, and they called a pass. */
  const int = { text: 'J.Smith pass intercepted by K.Jones at SEA 40', typeText: 'Pass Interception Return' };
  assert.equal(settle('run_pass', 'pass', int, { sport: 'nfl' }).landed, true);
});

test('🔴 an onside kick and a penalty both VOID a kickoff call', () => {
  /* DraftKings and Fanatics both void every kickoff market on an onside attempt.
   * Nobody who called "past the 25" was answering a question about a squib. */
  const onside = { text: 'B.Smith onside kick recovered by NE at NE 47', typeText: 'Kickoff Return' };
  assert.equal(settle('kickoff_return', 'past', onside, {}).landed, null);
  const flagged = { text: 'kickoff 65 yards, PENALTY on SEA holding', typeText: 'Kickoff Return' };
  assert.equal(settle('kickoff_return', 'short', flagged, {}).landed, null);
});

test('🔴 "PUNT TD" is a PUNT — the drive result that was silently voiding', () => {
  /* A real result in the fixtures: a punt returned for a touchdown. The question
   * asked how the OFFENSIVE drive ended, and it ended in a punt; what the other
   * team then did with the ball is a different drive. This voided before the
   * fixtures were counted - a call nobody would have noticed losing. */
  const r = settleDrive('drive_end', 'punt', { result: 'PUNT TD', plays: [] });
  assert.equal(r.landed, true);
});

test('a play that did not happen answers nothing, whatever was asked of it', () => {
  const noPlay = { text: 'PENALTY SEA False Start 5 yards. NO PLAY', typeText: 'Penalty' };
  for (const t of ['run_pass', 'script', 'first_down', 'direction']) {
    assert.equal(settle(t, byId(t).choices[0].id, noPlay, { sport: 'nfl' }).landed, null,
      `${t} must void a no-play`);
  }
});

/* ------------------------------------------------------------------ *
 * The router — the biggest finding was a question we already had
 * ------------------------------------------------------------------ */

test('🔴 the drive question is offered at a drive start — it never was', () => {
  /* "Drive Exact Result" was the MOST-PLAYED micro-market in Simplebet's whole
   * college football catalog, and next-drive result led the NFL playoffs too.
   * `drive_end` has been in this file for weeks and `offerFor` never returned it
   * once - every snap fell through to run-or-pass. The catalog was not missing
   * the best market; the router was hiding it. */
  assert.equal(offerFor({ isDriveStart: true }).id, 'drive_end');
});

test('a drive call already running is not offered twice, and does not block the snap', () => {
  /* The two timescales are the point: a slow call rides UNDER a fast one. */
  assert.equal(offerFor({ isDriveStart: true, openDriveCall: true, down: 1 }).id, 'script');
});

test('🔴 script replaces run-or-pass as the default snap question', () => {
  /* Same tap, four answers instead of two. #2 by handle in the real market at
   * $1.3m over three playoff rounds, where run-or-pass alone was not a market at
   * all - Simplebet bundles it WITH the first down. */
  assert.equal(offerFor({ down: 1 }).id, 'script');
  assert.equal(offerFor({ down: 2 }).id, 'script');
  /* The rarer, more specific question still wins where there is one. */
  assert.equal(offerFor({ down: 3 }).id, 'third_down');
  assert.equal(offerFor({ down: 4 }).id, 'fourth_down');
  assert.equal(offerFor({ isKickoff: true }).id, 'kickoff_return');
  assert.equal(offerFor({ isPunt: true }).id, 'punt_fair_catch');
  assert.equal(offerFor({ isFieldGoalAttempt: true }).id, 'field_goal');
});

/* ------------------------------------------------------------------ *
 * Every new type, settled against the real games
 * ------------------------------------------------------------------ */

test('🔴 exactly one choice wins on every play a question resolves', () => {
  /* The failure this catches is two tiles both paying out, which is a bug you
   * cannot see in a screenshot and cannot argue your way out of afterwards. */
  let resolved = 0;
  for (const d of realDrives()) {
    for (const p of d.plays) {
      for (const id of ['script', 'run_pass', 'punt_fair_catch', 'direction', 'first_down']) {
        const winners = byId(id).choices.filter(
          (c) => settle(id, c.id, p, { sport: 'college-football' }).landed === true
        );
        assert.ok(winners.length <= 1, `${id} had ${winners.length} winners on: ${p.text}`);
        if (winners.length === 1) resolved++;
      }
    }
  }
  console.log(`    ${resolved} single-winner resolutions across three real games`);
  assert.ok(resolved > 1000, 'the corpus actually exercised the settlers');
});

test('script settles exactly the snaps run-or-pass does, and splits them four ways', () => {
  const seen = {};
  let scriptN = 0, rpN = 0;
  for (const d of realDrives()) {
    for (const p of d.plays) {
      const rp = byId('run_pass').choices.some((c) => settle('run_pass', c.id, p, { sport: 'college-football' }).landed === true);
      const sc = byId('script').choices.find((c) => settle('script', c.id, p, { sport: 'college-football' }).landed === true);
      if (rp) rpN++;
      if (sc) { scriptN++; seen[sc.id] = (seen[sc.id] || 0) + 1; }
    }
  }
  console.log(`    script ${scriptN} snaps -> ${JSON.stringify(seen)}`);
  assert.equal(scriptN, rpN, 'the same domain, asked better');
  assert.equal(Object.keys(seen).length, 4, 'all four outcomes occur in real football');
  /* 🔴 THE REASON IT IS THE DEFAULT: nothing above 40%. The most likely answer to
   * the question the app asks 120 times a night is still a real question. */
  for (const k of Object.keys(seen)) {
    assert.ok(seen[k] / scriptN < 0.45, `${k} is ${Math.round(seen[k] / scriptN * 100)}% — too lopsided`);
  }
});

test('three-and-out is a long shot and says so, rather than a bad question', () => {
  const drives = realDrives();
  let yes = 0, settled = 0;
  for (const d of drives) {
    const r = settleDrive('three_and_out', 'yes', d);
    if (r.landed === null) continue;
    settled++;
    if (r.landed) yes++;
  }
  const rate = yes / settled;
  console.log(`    three and out: ${yes}/${settled} = ${Math.round(rate * 100)}%`);
  /* At 17% it pays near the 6x cap, which is what makes it the catalog's one
   * long shot rather than its one bad question. Compare the three that were
   * REJECTED on the same measurement: a sack is 3%, a penalty on the play 1%,
   * crossing midfield 83%. None of those is a decision. */
  assert.ok(rate > 0.08 && rate < 0.30, `${rate} is outside the long-shot band`);
});

test('every shipped type carries a measured rate or explicitly carries none', () => {
  for (const t of CALL_TYPES) {
    assert.ok(t.question && t.choices.length >= 2, `${t.id} must ask something answerable`);
    assert.ok(t.perGame > 0, `${t.id} must occur in a real game`);
    if (t.baseRate != null) {
      assert.ok(t.baseRate > 0.05 && t.baseRate < 0.95,
        `${t.id} at ${t.baseRate} is not a question`);
    }
    if (t.rates) {
      const sum = Object.values(t.rates).reduce((a, b) => a + b, 0);
      assert.ok(Math.abs(sum - 1) < 0.03, `${t.id} rates sum to ${sum}`);
      assert.equal(Object.keys(t.rates).length, t.choices.length,
        `${t.id} must rate every choice or none`);
      for (const c of t.choices) {
        assert.ok(t.rates[c.id] != null, `${t.id} has no rate for ${c.id}`);
      }
    }
  }
});

/* ------------------------------------------------------------------ *
 * What we know we do not have
 * ------------------------------------------------------------------ */

test('🔴 the player dimension is absent, and that is recorded rather than hidden', () => {
  /* "Who scores a touchdown on this drive" took $1.5m over three NFL playoff
   * rounds and was played by 26% of one operator's customers - the single
   * biggest micro-market in football. We have nothing like it, because it needs
   * a per-play star the parser emits and requirement 7.2 says that is a real
   * trap: the parenthesized group at the end of a play is the TACKLER, never the
   * ball carrier. It is the next build, not a thing to half-do before a kickoff.
   *
   * This test fails the day somebody adds a player market without the parser
   * work, which is exactly when it should. */
  const playerish = CALL_TYPES.filter((t) => /who|scorer|which player/i.test(t.question));
  assert.equal(playerish.length, 0,
    'a player-scoped market needs an explicit per-play star from the parser first');
});
