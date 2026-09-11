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
  const t = offerFor({ isDriveStart: true, openDriveCall: true, down: 1, afterPlayId: 'p1' });
  assert.equal(t.scope, 'play', 'with a drive call open, the snap question is a play call');
});

test('🔴 an ordinary snap rotates, and the same snap always asks the same thing', () => {
  /* 🔴 EIGHT OF TWELVE TYPES WERE UNREACHABLE. Every first and second down, all
   * night, asked `script` — one binary asked 120 times wearing four tiles, which
   * is the exact failure this catalog's header exists to prevent: "the second
   * hour is the first hour again."
   *
   * `direction` in particular had never once been offered, and it is the
   * best-measured question we have — and it reads DIFFERENTLY by league, 29/38/33
   * college against 40/19/41 NFL. */
  const seen = new Set();
  for (let i = 0; i < 60; i++) seen.add(offerFor({ down: 1, afterPlayId: 'play' + i }).id);
  assert.ok(seen.size >= 3, `an ordinary snap must vary, saw ${[...seen]}`);
  assert.ok(seen.has('script'), 'script is still the most common');
  assert.ok(seen.has('direction'), 'direction is finally reachable');

  /* 🔴 DETERMINISTIC, AND THAT IS CORRECTNESS RATHER THAN TASTE. Everybody
   * watching one game must be asked the same question at the same snap, or the
   * board compares people who answered different things. Math.random here would
   * have been invisible with one tester and wrong the moment a second joined. */
  for (const id of ['p1', 'p2', 'p3']) {
    const a = offerFor({ down: 1, afterPlayId: id }).id;
    const b = offerFor({ down: 1, afterPlayId: id }).id;
    assert.equal(a, b, 'the same snap must ask the same question every time');
  }
  /* Every rotation member is a real, settleable play-scope type. */
  for (const id of seen) {
    assert.equal(byId(id).scope, 'play', `${id} is offered on a snap`);
  }
});

test('the rarer, more specific question still wins where there is one', () => {
  assert.equal(offerFor({ down: 3, afterPlayId: 'x' }).id, 'third_down');
  assert.equal(offerFor({ down: 4, afterPlayId: 'x' }).id, 'fourth_down');
  assert.equal(offerFor({ isKickoff: true }).id, 'kickoff_return');
  assert.equal(offerFor({ isPunt: true }).id, 'punt_fair_catch');
  assert.equal(offerFor({ isFieldGoalAttempt: true }).id, 'field_goal');
  /* The red zone is its own moment and asks its own question. */
  assert.equal(offerFor({ down: 1, yardsToGoal: 12, afterPlayId: 'x' }).id, 'redzone_outcome');
  /* A drive start reaches all three drive questions, not just the famous one. */
  const d = new Set();
  for (let i = 0; i < 40; i++) d.add(offerFor({ isDriveStart: true, afterPlayId: 'd' + i }).id);
  assert.ok(d.has('drive_end') && d.size >= 2, `drive questions must vary, saw ${[...d]}`);
  for (const id of d) assert.equal(byId(id).scope, 'drive');
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

/* ------------------------------------------------------------------ *
 * TWO GRAMMARS, TWO LEAGUES — 8 real NFL games, 2026-09-08
 * ------------------------------------------------------------------ */

test('🔴 a first down is read from the DOWN, not from the sentence', async () => {
  /* Requirement 7.1: ESPN ships two play-text grammars. A college play reads
   * "...for 8 yards, 1st down PENN"; an NFL play reads "...for 8 yards
   * (C.DeJean)." The settler used to look for the words, and measured NFL first
   * downs at 3.2% against college's 26%.
   *
   * `script` is the DEFAULT snap question and two of its four tiles say "first
   * down" — so on an NFL feed nearly every call would have graded short. Anyone
   * taking a first down loses all night, and the app looks like it is cheating
   * rather than broken. */
  const { movedChains } = await import('../src/catalog.ts');

  /* NFL: no words, but the down is right there. */
  const nflGain = { text: 'J.Hurts pass short left to D.Goedert for 8 yards (Q.Mitchell).',
                    startDown: 1, distance: 10, endDown: 2, startTeamId: '21', endTeamId: '21' };
  assert.equal(movedChains(nflGain).got, false, 'second down is not a first down');

  const nflFirst = { text: 'S.Barkley right guard to PHI 41 for 3 yards (K.Clark).',
                     startDown: 2, distance: 2, endDown: 1, startTeamId: '21', endTeamId: '21' };
  assert.equal(movedChains(nflFirst).got, true, 'the down reset with the same team');

  /* 🔴 A TURNOVER ALSO RESETS THE DOWN TO 1, and it is the opposite of moving
   * the chains. `endTeamId` is the only thing that separates them. */
  const turnover = { text: 'D.Prescott pass intercepted by C.Gardner-Johnson.',
                     startDown: 3, distance: 7, endDown: 1, startTeamId: '6', endTeamId: '21' };
  assert.equal(movedChains(turnover).got, false, 'a turnover is not a conversion');

  /* College, unchanged: no structured down, the sentence says it. */
  assert.equal(movedChains({ text: 'Mateer run for 12 yards, 1st down OU' }).got, true);
  assert.equal(movedChains({ text: 'Mateer run for 2 yards' }, { distance: 10 }).got, false);

  /* A touchdown is a first down by any reading and is written as neither. */
  assert.equal(movedChains({ text: 'J.Jeudy 25 yard pass for a TOUCHDOWN' }).got, true);
});

test('the NFL priors are measured, and differ from college where the football differs', async () => {
  const { byId } = await import('../src/catalog.ts');
  for (const id of ['script', 'run_pass', 'direction', 'drive_end']) {
    const t = byId(id);
    assert.ok(t.ratesNfl, `${id} must carry measured NFL rates`);
    const sum = Object.values(t.ratesNfl).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 0.03, `${id} NFL rates sum to ${sum}`);
    assert.equal(Object.keys(t.ratesNfl).length, t.choices.length);
  }
  /* 🔴 THE DIFFERENCE IS REAL FOOTBALL, NOT NOISE. The NFL runs between the
   * tackles far less than college — 19% against 38% — so `middle` is the long
   * answer in one league and the safe one in the other. A single shared prior
   * would have priced it wrong in both. */
  const dir = byId('direction');
  assert.ok(dir.rates.middle > 0.33, 'college runs middle often');
  assert.ok(dir.ratesNfl.middle < 0.25, 'the NFL does not');
  assert.ok(byId('run_pass').ratesNfl.pass > byId('run_pass').rates.pass, 'the NFL passes more');
});

/* 🔴 THE NFL RED-ZONE PRIOR WAS THE DRIVE-END PRIOR, COPIED (found 2026-09-11):
 * { td: .266, fg: .209 } priced an NFL red-zone touchdown at 3.7x when it happens
 * 58% of the time. So the prior is recounted here from the captured games on
 * every run - a copied number cannot pass a count of the real thing. */
test('the NFL red-zone prior is the red zone, counted from the captured games', async () => {
  const { byId } = await import('../src/catalog.ts');
  const { readdirSync, readFileSync } = await import('node:fs');
  const dir = new URL('../fixtures/nfl/', import.meta.url);
  const n = { td: 0, fg: 0, none: 0 };
  for (const f of readdirSync(dir)) {
    const j = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
    const seen = new Set();
    for (const d of (j.drives && j.drives.previous) || []) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      const reached = (d.plays || []).some((p) => [p.start && p.start.yardsToEndzone, p.end && p.end.yardsToEndzone]
        .some((y) => typeof y === 'number' && y > 0 && y <= 20));
      const r = String(d.result || '').toUpperCase();
      if (!reached || /END OF/.test(r)) continue;
      n[r === 'TD' ? 'td' : r === 'FG' ? 'fg' : 'none']++;
    }
  }
  const total = n.td + n.fg + n.none;
  assert.ok(total >= 40, `only ${total} red-zone trips found`);
  const rz = byId('redzone_outcome').ratesNfl;
  for (const k of Object.keys(n)) {
    assert.ok(Math.abs(rz[k] - n[k] / total) < 0.02,
      `${k}: prior ${rz[k]}, counted ${(n[k] / total).toFixed(3)} over ${total} trips`);
  }
  assert.notEqual(rz.td, byId('drive_end').ratesNfl.td, 'not the drive-end prior under another name');
});

/* 🔴 THE QUESTION MUST BE ABOUT THE PLAY THAT HAS NOT HAPPENED YET.
 *
 * Found by the dry run on 2026-09-09. The screen derived isKickoff / isPunt /
 * isFieldGoalAttempt from the text of the LAST play - the one already on screen
 * - while every call settles against the play AFTER it. So a punt produced
 * "Fair catch, or does he run it back?", whose answer was already printed in
 * the sentence above the tiles ("punt 47 yards to the BSU50 fair catch by #7
 * E.Stewart"), and which then settled against an ordinary snap and voided.
 *
 * The offer and the settlement have to be about the same play. This asserts the
 * screen's side of that contract, because the bug was in the caller rather than
 * in the router. */
test('🔴 the offer flags describe the NEXT play, never the one just shown', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../public/screens/live-game.screen.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  /* A kickoff IS predictable - after a score, the next play is a kickoff by rule
   * - so that one is inferred from the scoring play and settles on the kickoff. */
  assert.match(src, /isKickoff:\s*\/touchdown\|field goal is good\|safety\|extra point\/i\.test\(s\)/,
    'the kickoff question must follow a SCORE, not a kickoff already played');

  /* Nothing makes the next play a punt or a field goal attempt. Fourth down
   * makes them likely, and the catalog already has the honest question for
   * fourth down - "Go for it, or kick?" - which is a real decision rather than a
   * prediction of one. */
  assert.match(src, /isPunt:\s*false/, 'a punt already shown must not be asked about');
  assert.match(src, /isFieldGoalAttempt:\s*false/);

  /* And the router still reaches the fourth-down question, which is what now
   * answers for those situations. */
  const cat = readFileSync(new URL('../src/catalog.ts', import.meta.url), 'utf8');
  assert.match(cat, /if \(ctx\.down === 4\) return byId\('fourth_down'\)/);
});

/* 🔴 A PLAYER'S NAME MUST NOT CHANGE HOW A PLAY SETTLES.
 *
 * Found 2026-09-09 on a real captured NFL game. The "not a run-or-pass snap"
 * test matched /kneel/ as a SUBSTRING against the whole sentence, and the
 * Cowboys have a defensive end called M. Kneeland - so three plays in one match
 * were graded as though the quarterback had knelt:
 *
 *   Rush | S.Barkley right end to DAL 25 for 4 yards (M.Kneeland).
 *   Sack | (Shotgun) J.Hurts sacked at DAL 44 for -8 yards (M.Kneeland).
 *
 * Nothing errors. The calls void, and the reason string states something plainly
 * false about the play. Same shape as the team-id substitution that once printed
 * "4th & Patriots": a substring match against text containing human names.
 *
 * The fix asks ESPN's typeText first - a controlled vocabulary - and only falls
 * back to the prose with word boundaries. */
test('🔴 a tackler called Kneeland does not turn a rush into a kneel-down', async () => {
  const { settle } = await import('../src/catalog.ts');

  const rush = { text: 'S.Barkley right end to DAL 25 for 4 yards (M.Kneeland).',
                 typeText: 'Rush', startDown: 1, distance: 10, endDown: 2 };
  const sack = { text: '(Shotgun) J.Hurts sacked at DAL 44 for -8 yards (M.Kneeland).',
                 typeText: 'Sack', startDown: 2, distance: 6, endDown: 3 };

  assert.match(settle('script', 'run_no', rush, { sport: 'nfl' }).because, /it was a run/,
    'a rush tackled by Kneeland must settle as a run');

  /* 🔴 AND THE LEAGUE RULE THE WHOLE CODEBASE TURNS ON: a sack is a PASS in the
   * NFL and a RUN in college. It was voiding in both, so the distinction this
   * app repeats everywhere was not actually being applied. */
  assert.match(settle('script', 'pass_no', sack, { sport: 'nfl' }).because,
    /a sack, which the NFL grades as a pass/);
  assert.match(settle('script', 'run_no', sack, { sport: 'college-football' }).because,
    /a sack, which college grades as a run/);

  /* A real kneel-down still is one, and a real punt still is one. */
  const kneel = { text: 'J.Hurts kneels at PHI 30 for -1 yards.', typeText: 'QB Kneel' };
  assert.equal(settle('script', 'run_no', kneel, { sport: 'nfl' }).landed, null);
  const punt = { text: 'B.Mann punts 48 yards to DAL 12.', typeText: 'Punt' };
  assert.equal(settle('script', 'pass_no', punt, { sport: 'nfl' }).landed, null);

  /* And with NO typeText the prose fallback is word-boundaried, so the surname
   * still cannot satisfy it.
   *
   * 🔴 IT DOES NOT SETTLE AS A RUN THERE, AND THAT IS CORRECT RATHER THAN A
   * SECOND BUG. NFL prose describes a run by DIRECTION - "S.Barkley right end
   * to DAL 25" - and never uses the word "rush", which is requirement 7.1's two
   * grammars showing up again. Without typeText the sentence genuinely does not
   * say what kind of play it was, so the honest answer is "neither", and the
   * call voids rather than being graded on a guess.
   *
   * What this asserts is the thing that matters: it is not mistaken for a
   * KNEEL-DOWN. Voiding because the feed said too little is a different and much
   * safer failure than voiding because a defender's surname was read as a verb. */
  const noType = { text: 'S.Barkley right end to DAL 25 for 4 yards (M.Kneeland).', typeText: '' };
  const r = settle('script', 'run_no', noType, { sport: 'nfl' });
  assert.equal(r.landed, null);
  assert.doesNotMatch(r.because, /not a run-or-pass snap/,
    'a surname must never put a play on the kneel/punt/kickoff path');
});
