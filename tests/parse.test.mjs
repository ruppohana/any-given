/**
 * parse.test.mjs — the play parser, against REAL captured ESPN text.
 *
 * Every string asserted here is first asserted to EXIST in
 * `fixtures/real-*-260905-final.json`. That assertion is the point of the
 * file: the reference implementation's suite once fed the parser `#1 K.Brown`,
 * a shape `fixtures/_make.py` invented, and 306 tests passed while the panel
 * named the tackler in every real game (CONTRACT 7.3).
 *
 * The star cases are ported from the reference suite
 * `sports-live/tests/test_play_roles.py`, which is this piece's bar.
 *
 *   node --test tests/parse.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parsePlays, roles, stripCredits, classify, playKind, toGoal, grammarProfile,
} from '../src/lib/parse.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, '..', 'fixtures');

const FILES = fs.readdirSync(FIXTURES)
  .filter((f) => f.startsWith('real-') && f.endsWith('.json')).sort();

const DOCS = new Map(FILES.map((f) =>
  [f, JSON.parse(fs.readFileSync(path.join(FIXTURES, f), 'utf8'))]));

/** [espnType, text] for every play in every captured fixture. */
const CORPUS = [];
for (const doc of DOCS.values()) {
  for (const d of (doc.drives?.previous || [])) {
    for (const p of (d.plays || [])) {
      const text = (p.text || '').trim();
      if (text) CORPUS.push([p.type?.text || '', text]);
    }
  }
}

/** Fails unless `needle` is in a captured fixture. Nothing else is testable. */
function real(needle) {
  const hit = CORPUS.filter(([, t]) => t.includes(needle));
  assert.ok(hit.length, `not in any captured fixture: ${JSON.stringify(needle)}`);
  return hit[0];
}
const star = (needle) => { const [k, t] = real(needle); return roles(t, k).star; };

// ---------------------------------------------------------------------------
// The fixtures themselves — CONTRACT 7.3
// ---------------------------------------------------------------------------

test('the captured fixtures are present, are real games, and cover BOTH leagues', () => {
  /* 🔴 IT WAS THREE COLLEGE GAMES AND NOTHING ELSE, on an app whose first live
   * night is an NFL opener. Every verification in this repo - including the
   * 2026-09-09 dry run - therefore ran on college text and college settlement
   * rules, while the two leagues are deliberately not interchangeable here: a
   * sack is a pass in the NFL and a run in college, and ESPN writes the
   * sentences differently in each.
   *
   * The NFL fixture found three real bugs in its first hour: a defender named
   * Kneeland voiding every play he tackled on, and the sack rule not being
   * applied at all in either league.
   *
   * So the assertion is no longer a count - a count only ever says "somebody
   * added a file" - it is COVERAGE. */
  assert.ok(FILES.length >= 3, FILES.join(', '));
  assert.ok(FILES.some((f) => /nfl/i.test(f)),
    'no NFL fixture: every check would run on college text only');
  assert.ok(FILES.some((f) => !/nfl/i.test(f)),
    'no college fixture');
  assert.ok(CORPUS.length > 400, `only ${CORPUS.length} plays`);
  for (const [f, doc] of DOCS) {
    const drives = doc.drives?.previous || [];
    assert.ok(drives.length > 15, `${f}: ${drives.length} drives`);
  }
});

// ---------------------------------------------------------------------------
// 7.1 — ESPN ships TWO play-text grammars. Measured, not assumed.
// ---------------------------------------------------------------------------

test('7.1 the grammar of each captured fixture is measured, never assumed', () => {
  /* 🔴 THE GRAMMAR IS PER LEAGUE, AND THIS TEST USED TO ASSUME COLLEGE'S.
   *
   * It required every fixture to be >85% NUMBERED - "#5 D.Moore pass complete" -
   * which is college's grammar. The first NFL fixture came back 0/169 and failed
   * it, correctly: the NFL writes "(Shotgun) J.Hurts sacked at DAL 44", initials
   * and a dot, no jersey number anywhere.
   *
   * That is requirement 7.1 itself - ESPN ships more than one play-text grammar
   * - and the test was quietly encoding one of them as the truth. It is exactly
   * the assumption that took the NFL star parser from 0% to 96%, reappearing in
   * the thing meant to catch it.
   *
   * So each fixture is measured against the grammar ITS OWN LEAGUE uses, and
   * both are asserted to exist somewhere in the corpus - because a suite that
   * only ever sees one grammar cannot tell you the other one still works. */
  let sawNumbered = false, sawNamed = false;
  for (const [f, doc] of DOCS) {
    const g = grammarProfile(doc);
    const nfl = /nfl/i.test(f);
    console.log(`  7.1 ${f}  plays=${g.plays} numbered=${g.numbered} named=${g.named} none=${g.none}`);
    if (nfl) {
      sawNamed = true;
      assert.ok(g.named / g.plays > 0.60,
        `${f}: NFL text should be NAMED (J.Hurts), got only ${g.named}/${g.plays}`);
      assert.ok(g.numbered / g.plays < 0.10,
        `${f}: NFL text should not carry jersey numbers, got ${g.numbered}/${g.plays}`);
    } else {
      sawNumbered = true;
      assert.ok(g.numbered / g.plays > 0.85,
        `${f}: numbered grammar is only ${g.numbered}/${g.plays}`);
    }
  }
  assert.ok(sawNumbered && sawNamed,
    'the corpus must contain BOTH grammars or 7.1 is being taken on trust');
});

test('7.1 the NAMED grammar is present in the captured 2026 feed too', () => {
  // ESPN drops the jersey numbers on its scoring lines, so the 2024/2025
  // grammar turns up inside a 2026 game. Real, and in the fixture.
  const [kind, text] = real('Devin McCuin 17 Yd pass from Julian Sayin');
  const got = roles(text, kind);
  assert.equal(got.grammar, 'named');
  assert.equal(got.star.name, 'Devin McCuin');
  assert.equal(got.star.number, null, 'the named grammar carries no jersey');
});

test('7.1 the numbered grammar keeps the jersey', () => {
  const [kind, text] = real('#0 D.Riley rush middle for 3 yards');
  assert.equal(roles(text, kind).grammar, 'numbered');
});

test('7.1 a 2024/2025 line still parses (reference suite; no pre-2026 capture exists)', () => {
  const s = roles('Kevin Riley run for 4 yds to the WKU 20 for a 1ST down', 'Rush').star;
  assert.equal(s.name, 'Kevin Riley');
  assert.equal(s.number, null);
});

test('7.1 a clock line is not a person in either grammar', () => {
  for (const [text, kind] of [['Timeout Oregon, clock 00:05', 'Timeout'],
                              ['End of 1st quarter.', 'End Period']]) {
    assert.equal(roles(text, kind).star, null, text);
  }
});

// ---------------------------------------------------------------------------
// 7.2 🔴 THE PARENTHESIZED GROUP IS THE TACKLER, NEVER THE BALL CARRIER
// ---------------------------------------------------------------------------

test('7.2 a rush with one tackler names the carrier', () => {
  const s = star('#0 D.Riley rush middle for 3 yards');
  assert.deepEqual([s.number, s.role, s.side], ['0', 'rusher', 'offense']);
});

test('7.2 a rush with two tacklers names the carrier', () => {
  const s = star('(#2 Q.Scandrett; #27 G.Forsha)');
  assert.equal(s.name, 'B.Jackson');
  assert.equal(s.role, 'rusher');
});

test('7.2 a completion with a tackler names the receiver', () => {
  const s = star('pass complete short middle to #10 J.McDougle');
  assert.deepEqual([s.number, s.role], ['10', 'receiver']);
});

test('7.2 an incompletion names the passer, not the intended receiver', () => {
  const s = star('pass incomplete short right to #7 C.Nelson');
  assert.deepEqual([s.number, s.role], ['6', 'passer']);
});

test('7.2 "QB hurried by" is not the star, and it has no brackets', () => {
  const s = star('QB hurried by #26 P.Pierce');
  assert.notEqual(s.name, 'P.Pierce');
  assert.equal(s.role, 'passer');
});

test('7.2 "broken up by" is not the star', () => {
  assert.equal(star('broken up by #26 P.Pierce').role, 'passer');
});

test('7.2 a sack names the quarterback it happened to', () => {
  const s = star('sacked for loss of 5 yards');
  assert.deepEqual([s.number, s.role], ['10', 'passer']);
});

test('7.2 a kickoff names the returner, not the kicker printed first', () => {
  const s = star('#2 L.Bey return 16 yards');
  assert.deepEqual([s.number, s.name, s.role], ['2', 'L.Bey', 'returner']);
});

test('7.2 a punt with no return names the punter', () => {
  const s = star('#32 C.Stumbaugh punt 42 yards to the OhioSt01');
  assert.equal(s.role, 'kicker');
});

test('7.2 a punt return names the returner', () => {
  const s = star('#7 P.Bell return 47 yards');
  assert.deepEqual([s.name, s.role], ['P.Bell', 'returner']);
});

test('7.2 an interception names the defender who took it', () => {
  const s = star('pass intercepted by #18 C.Franklin III');
  assert.equal(s.role, 'interceptor');
  assert.equal(s.side, 'defense');
});

test('7.2 a generational suffix survives — III must not truncate to II', () => {
  assert.equal(star('pass intercepted by #18 C.Franklin III').name, 'C.Franklin III');
});

test('7.2 a Jr. suffix survives', () => {
  const [, text] = real('#8 C.Thompson Jr.');
  const names = roles(text, 'Pass Incompletion').players.map((p) => p.name);
  assert.ok(names.includes('C.Thompson Jr.'), names.join(', '));
});

test('7.2 a penalty-only play has no offensive star', () => {
  const [kind, text] = real('PENALTY BallSt Delay Of Game');
  assert.equal(roles(text, kind).star, null);
});

test('7.2 the field-goal battery (H:/LS:) is not the star', () => {
  const s = star('field goal attempt from 54 yards GOOD');
  assert.equal(s.role, 'kicker');
  assert.ok(!['C.Stumbaugh', 'C.Britton'].includes(s.name));
});

test('7.2 tacklers are kept, and marked defensive', () => {
  const [kind, text] = real('#25 B.Jackson rush middle for 4 yards gain to the OhioSt20 (#2 Q.Scandrett; #27 G.Forsha)');
  const got = roles(text, kind);
  assert.deepEqual(got.credited.map((c) => c.name), ['Q.Scandrett', 'G.Forsha']);
  const sides = new Set(got.players
    .filter((p) => ['Q.Scandrett', 'G.Forsha'].includes(p.name)).map((p) => p.side));
  assert.deepEqual([...sides], ['defense']);
});

test('7.2 the UNparenthesized credit is stripped too', () => {
  const [main, credited] = stripCredits(
    'Shotgun #6 K.Luster pass incomplete short right thrown to OhioSt30 QB hurried by #26 P.Pierce');
  assert.ok(!main.includes('P.Pierce'), main);
  assert.deepEqual(credited.map((c) => c[1]), ['P.Pierce']);
});

test('7.2 a jersey number is not a unique key — passer and receiver are both #4', () => {
  const [kind, text] = real('#4 M.Madsen pass complete short left to #4 M.Madsen');
  const s = roles(text, kind).star;
  assert.equal(s.number, '4');
  assert.equal(s.role, 'receiver');
});

test('7.2 🔴 ACROSS THE WHOLE CORPUS the star is never taken from the parentheses', () => {
  // The invariant, stated exactly. Every star is chosen from the text with
  // the parenthesized group and the credit phrases already REMOVED, so a
  // tackler can never be reached in the first place.
  //
  // It is stated this way rather than as "the star is not in `credited`"
  // because on two real lines the same man is named twice — once as the
  // actor and once inside the brackets:
  //   "#4 M.Madsen pass intercepted by #2 N.Offord at ORE05 PENALTY ORE
  //    Pass Interference (#2 N.Offord)"          the flag, not a tackle
  //   "... intercepted by #17 T.Alford ... QB hurried by #34 K.Wilder
  //    #17 T.Alford return 2 yards"              the credit phrase over-reads
  let checked = 0, tacklers = 0, alsoCredited = 0;
  for (const [kind, text] of CORPUS) {
    const got = roles(text, kind);
    if (!got.star) continue;
    checked++;
    tacklers += got.credited.filter((c) => c.role === 'tackle').length;
    const [main] = stripCredits(text);
    const needle = got.star.number
      ? `#${got.star.number} ${got.star.name}` : got.star.name;
    assert.ok(main.includes(needle),
      `star ${needle} was not in the un-parenthesized text: ${text}`);
    if (got.credited.some((c) =>
      c.name === got.star.name && c.number === got.star.number)) alsoCredited++;
  }
  console.log(`  7.2 ${checked} stars, all taken from outside the parentheses; ` +
    `${tacklers} parenthesized tacklers in the corpus; ` +
    `${alsoCredited} plays name the star a second time inside them`);
  assert.ok(tacklers > 200, `only ${tacklers} tacklers in the corpus`);
});

test('7.2 🔴 the naive "last name printed" rule is measurably wrong', () => {
  // This is the bug the requirement was written from: the original took the
  // last name in the play text and looked it up in the OFFENSE's roster.
  let disagree = 0, both = 0;
  for (const [kind, text] of CORPUS) {
    const got = roles(text, kind);
    if (!got.star || !got.players.length) continue;
    both++;
    const last = got.players[got.players.length - 1];
    if (last.name !== got.star.name || last.number !== got.star.number) disagree++;
  }
  console.log(`  7.2 last-name-printed disagrees with the parsed star on ${disagree} of ${both} plays`);
  assert.ok(disagree > 200,
    `only ${disagree} disagreements — the corpus is not exercising 7.2`);
});

// ---------------------------------------------------------------------------
// star.teamId — checked against the fixture's OWN boxscore rosters
// ---------------------------------------------------------------------------

/** jersey + "F.Last" -> Set(teamId), built from boxscore.players. */
function rosterIndex(doc) {
  const idx = new Map();
  for (const g of (doc.boxscore?.players || [])) {
    const tid = String(g.team.id);
    for (const blk of (g.statistics || [])) {
      for (const a of (blk.athletes || [])) {
        const at = a.athlete || {};
        if (!at.jersey || !at.firstName || !at.lastName) continue;
        const key = `${at.jersey}|${at.firstName[0]}.${at.lastName}`;
        if (!idx.has(key)) idx.set(key, new Set());
        idx.get(key).add(tid);
      }
    }
  }
  return idx;
}

test('star.teamId agrees with the boxscore roster in every checkable case', () => {
  let ok = 0, wrong = 0, absent = 0;
  const bad = [];
  for (const [f, doc] of DOCS) {
    const idx = rosterIndex(doc);
    for (const p of parsePlays(doc)) {
      if (!p.star?.jersey) continue;
      const teams = idx.get(`${p.star.jersey}|${p.star.name}`);
      if (!teams || teams.size !== 1) { absent++; continue; }
      if (teams.has(p.star.teamId)) ok++;
      else { wrong++; bad.push(`${f} ${p.star.name} said ${p.star.teamId} roster ${[...teams]} :: ${p.text}`); }
    }
  }
  console.log(`  teamId: ${ok} confirmed by boxscore roster, ${wrong} wrong, ${absent} player not in boxscore`);
  assert.deepEqual(bad, []);
  assert.ok(ok > 380, `only ${ok} confirmable`);
});

test('a kickoff belongs to the RECEIVING team, so kicker and returner swap sides', () => {
  // Measured: ESPN attaches the kickoff to the receiving team's drive.
  const doc = DOCS.get('real-utep-at-ou-260905-final.json');
  const p = parsePlays(doc).find((x) =>
    x.text.includes('#91 C.Arreola kickoff 65 yards to the OU00'));
  assert.ok(p, 'the opening kickoff is in the fixture');
  assert.equal(p.type, 'kick');
  assert.equal(p.star.name, 'I.Sategna III');
  assert.equal(p.star.role, 'carrier');
  // OU (201) received and owns the drive; UTEP (2638) kicked.
  assert.equal(p.offenseTeamId, '201');
  assert.equal(p.star.teamId, '201', 'the returner is on the receiving team');
});

// ---------------------------------------------------------------------------
// The emitted Play — CONTRACT §6 conformance
// ---------------------------------------------------------------------------

const TYPES = ['run', 'pass', 'kick', 'penalty', 'other'];
const ROLES = ['carrier', 'passer', 'receiver', 'tackler', 'kicker'];

test('every emitted Play matches the CONTRACT §6 shape', () => {
  const buckets = {}; const roleCount = {};
  let plays = 0, stars = 0;
  const perFile = {};
  for (const [f, doc] of DOCS) {
    perFile[f] = { plays: 0, stars: 0 };
    const out = parsePlays(doc);
    const ids = new Set(out.map((p) => p.id));
    assert.equal(ids.size, out.length, `${f}: duplicate play ids`);
    for (const p of out) {
      plays++; perFile[f].plays++;
      assert.equal(typeof p.id, 'string'); assert.ok(p.id.length);
      assert.equal(typeof p.driveId, 'string'); assert.ok(p.driveId.length);
      assert.ok(Number.isInteger(p.quarter) && p.quarter >= 1 && p.quarter <= 6, `${p.quarter}`);
      assert.equal(typeof p.clock, 'string');
      assert.ok(p.down === null || Number.isInteger(p.down));
      assert.ok(p.distance === null || Number.isInteger(p.distance));
      assert.ok(p.yardsToGoal === null ||
        (Number.isInteger(p.yardsToGoal) && p.yardsToGoal >= 0 && p.yardsToGoal <= 100));
      assert.equal(typeof p.offenseTeamId, 'string'); assert.ok(p.offenseTeamId.length);
      assert.equal(typeof p.text, 'string');
      assert.ok(Number.isInteger(p.yards));
      assert.ok(TYPES.includes(p.type), p.type);
      buckets[p.type] = (buckets[p.type] || 0) + 1;
      if (p.star !== null) {
        stars++; perFile[f].stars++;
        assert.ok(ROLES.includes(p.star.role), p.star.role);
        assert.ok(typeof p.star.name === 'string' && p.star.name.length);
        assert.ok(p.star.jersey === null || typeof p.star.jersey === 'string');
        assert.ok(typeof p.star.teamId === 'string' && p.star.teamId.length);
        roleCount[p.star.role] = (roleCount[p.star.role] || 0) + 1;
      }
    }
  }
  console.log(`  §6 ${plays} plays, ${stars} stars`);
  console.log(`  §6 Play.type ${JSON.stringify(buckets)}`);
  console.log(`  §6 star.role ${JSON.stringify(roleCount)}`);
  /* 🔴 A HARDCODED CORPUS TOTAL ONLY EVER ASSERTS "NOBODY ADDED A FIXTURE".
   *
   * This read `assert.equal(plays, 516)` - the sum of the three college games -
   * so the first NFL capture failed it at 685. That is the test doing the
   * opposite of its job: the corpus growing is the thing we WANT, and the
   * assertion punished it while saying nothing about whether the parser works.
   *
   * What matters is the RATE, and that every fixture contributes. A file that
   * parsed into zero stars would be invisible in a total and is the actual
   * failure worth catching. */
  assert.ok(plays > 600, `only ${plays} plays in the corpus`);
  assert.ok(stars / plays > 0.80, `star rate ${stars}/${plays}`);
  for (const [f, n] of Object.entries(perFile)) {
    assert.ok(n.stars / n.plays > 0.70,
      `${f}: only ${n.stars}/${n.plays} plays carry a star - that grammar is not being read`);
  }
  console.log('  §6 per file ' + JSON.stringify(perFile));
});

test('🔴 no play is ever attributed a tackler star', () => {
  let tackler = 0;
  for (const doc of DOCS.values()) {
    for (const p of parsePlays(doc)) if (p.star?.role === 'tackler') tackler++;
  }
  assert.equal(tackler, 0, 'a tackler reached the tile — 7.2 has regressed');
});

test('classify and playKind match the reference vocabulary', () => {
  assert.equal(classify('Rush'), 'run');
  assert.equal(classify('Pass Reception'), 'pass');
  assert.equal(classify('Pass Incompletion'), 'pass');
  assert.equal(classify('Sack'), 'pass');
  for (const t of ['Punt', 'Kickoff', 'Field Goal Good', 'Penalty', 'Timeout',
                   'End Period', 'Two-minute warning']) {
    assert.equal(classify(t), null, t);
  }
  assert.equal(playKind('Punt'), 'kick');
  assert.equal(playKind('Kickoff'), 'kick');
  assert.equal(playKind('Field Goal Good'), 'kick');
  assert.equal(playKind('Penalty'), 'penalty');
  assert.equal(playKind('Timeout'), 'other');
  assert.equal(playKind('Rush'), 'run');
});

test('yardsToGoal trusts yardsToEndzone and nothing else', () => {
  assert.equal(toGoal({ yardsToEndzone: 65 }), 65);
  assert.equal(toGoal({ yardsToEndzone: 0 }), 0);
  assert.equal(toGoal({ yardsToEndzone: 101 }), null);
  assert.equal(toGoal({ yardsToEndzone: null }), null);
  // yardLine is a different origin and, for the away team, the opposite
  // direction. A wrong number that looks plausible is worse than no number.
  assert.equal(toGoal({ yardLine: 35 }), null);
  assert.equal(toGoal(null), null);
});

test('the active drive appearing twice does not duplicate a play', () => {
  const doc = DOCS.get('real-ball-at-osu-260905-final.json');
  const drives = doc.drives.previous;
  const live = { drives: { previous: drives, current: drives[drives.length - 1] } };
  assert.equal(parsePlays(live).length, parsePlays(doc).length);
});

test('a payload with no drives yields no plays rather than throwing', () => {
  assert.deepEqual(parsePlays({}), []);
  assert.deepEqual(parsePlays({ drives: {} }), []);
  assert.deepEqual(parsePlays({ drives: { previous: [null, {}] } }), []);
});
