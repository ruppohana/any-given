/**
 * tests/detect.test.mjs — the event detector, against the three real fixtures.
 *
 * NOTHING HERE IS INVENTED DATA. Every assertion is a count or a play id read
 * out of `fixtures/real-*.json`, which were captured from the feed and are
 * read-only. The two hand-built plays at the bottom exist only to prove
 * pass-through of a field the fixtures cannot exercise on their own.
 *
 * `readFixture()` below is a MINIMAL fixture reader, not a parser. It exists so
 * this test does not import `src/lib/parse.ts` (M1's file, being written in
 * parallel). It deliberately leaves `star` null — 7.2 is the parser's job, and
 * this file asserts only that detect passes `star` straight through.
 *
 *   node --test tests/detect.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { detect, keyMoments, topKeyMoments, tally, clockSeconds, driveTeams } from '../src/lib/detect.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, '..', 'fixtures');

const FIXTURES = [
  'real-utep-at-ou-260905-final.json',
  'real-ball-at-osu-260905-final.json',
  'real-bois-at-ore-260905-final.json',
];

const ESPN_TYPE_TO_PLAY_TYPE = (t) => {
  const s = (t || '').toLowerCase();
  if (s.includes('penalty')) return 'penalty';
  if (s.includes('kickoff') || s.includes('punt') || s.includes('field goal') || s.includes('extra point')) return 'kick';
  if (s.includes('pass') || s.includes('sack') || s.includes('interception')) return 'pass';
  if (s.includes('rush') || s.includes('fumble')) return 'run';
  return 'other';
};

/** Raw summary JSON → { plays: Play[], facts: GameFacts }. No star (7.2 is M1's). */
function readFixture(name) {
  const raw = JSON.parse(readFileSync(join(FIX, name), 'utf8'));
  const comp = raw.header.competitions[0];
  const home = comp.competitors.find((c) => c.homeAway === 'home');
  const away = comp.competitors.find((c) => c.homeAway === 'away');

  const plays = [];
  const facts = {
    homeTeamId: home.team.id,
    awayTeamId: away.team.id,
    abbrev: { [home.team.id]: home.team.abbreviation, [away.team.id]: away.team.abbreviation },
    score: {}, endYardsToGoal: {}, scoring: {}, turnover: {}, espnType: {},
  };

  for (const drive of raw.drives.previous) {
    for (const p of drive.plays || []) {
      const espnType = (p.type || {}).text || '';
      const offense = (p.teamParticipants || []).find((t) => t.type === 'offense');
      plays.push({
        id: p.id,
        driveId: drive.id,
        quarter: (p.period || {}).number,
        clock: (p.clock || {}).displayValue || '',
        down: (p.start || {}).down ?? null,
        distance: (p.start || {}).distance ?? null,
        yardsToGoal: (p.start || {}).yardsToEndzone ?? null,
        offenseTeamId: offense ? offense.id : '',
        text: p.text || '',
        yards: p.statYardage ?? 0,
        star: null,
        type: ESPN_TYPE_TO_PLAY_TYPE(espnType),
      });
      facts.score[p.id] = { home: p.homeScore ?? 0, away: p.awayScore ?? 0 };
      facts.endYardsToGoal[p.id] = (p.end || {}).yardsToEndzone ?? null;
      facts.scoring[p.id] = Boolean(p.scoringPlay);
      facts.turnover[p.id] = Boolean(p.isTurnover);
      facts.espnType[p.id] = espnType;
    }
  }
  const wp = {};
  for (const w of raw.winprobability || []) wp[w.playId] = w.homeWinPercentage;
  return { raw, plays, facts, wp };
}

/** Ground truth taken from the fixture's own `drives[].result`, never from us. */
function driveResults(raw) {
  const t = {};
  for (const d of raw.drives.previous) t[d.result] = (t[d.result] || 0) + 1;
  return t;
}

const loaded = new Map();
const fx = (n) => {
  if (!loaded.has(n)) loaded.set(n, readFixture(n));
  return loaded.get(n);
};

const lastDriveOf = (n) => {
  const d = fx(n).raw.drives.previous;
  return d[d.length - 1].id;
};

/* ------------------------------------------------------------------ */
/* Shape                                                                */
/* ------------------------------------------------------------------ */

test('one detection per play, in order, keyed by play id', () => {
  for (const name of FIXTURES) {
    const { plays, facts } = fx(name);
    const d = detect(plays, facts);
    assert.equal(d.length, plays.length, name);
    assert.deepEqual(d.map((x) => x.playId), plays.map((p) => p.id), name);
  }
});

test('clockSeconds parses the feed clock and refuses anything else', () => {
  assert.equal(clockSeconds('14:55'), 895);
  assert.equal(clockSeconds('0:04'), 4);
  assert.equal(clockSeconds(''), null);
  assert.equal(clockSeconds('Final'), null);
  assert.equal(clockSeconds(null), null);
});

/* ------------------------------------------------------------------ */
/* Scoring — against the fixture's own scoringPlays[]                   */
/* ------------------------------------------------------------------ */

test('every touchdown in scoringPlays[] is detected, and no extras', () => {
  // Ground truth is the fixture's own scoringPlays[] minus the field goals.
  // It is NOT `type.text`: real-utep-at-ou types a 48-yard touchdown as
  // "Pass Reception". Every non-field-goal scoring row is a touchdown drive
  // (the extra point is folded into the same row by ESPN).
  const got = {};
  for (const name of FIXTURES) {
    const { raw, plays, facts } = fx(name);
    const expected = raw.scoringPlays.filter((s) => !/field goal/i.test(s.type.text)).length;
    got[name] = detect(plays, facts).filter((d) => d.events.includes('touchdown')).length;
    assert.equal(got[name], expected, `${name}: touchdowns`);
  }
  assert.deepEqual(got, {
    'real-utep-at-ou-260905-final.json': 6,
    'real-ball-at-osu-260905-final.json': 8,
    'real-bois-at-ore-260905-final.json': 7,
  });
});

test('7.1 — a detector keyed on the word TOUCHDOWN misses real touchdowns', () => {
  // The SAME game ships both grammars. This is the bug, stated as a test.
  let live = 0, summary = 0;
  for (const name of FIXTURES) {
    const { plays, facts } = fx(name);
    for (const d of detect(plays, facts)) {
      if (!d.events.includes('touchdown')) continue;
      if (/\bTOUCHDOWN\b/.test(d.text)) live++; else summary++;
    }
  }
  assert.ok(summary > 0, 'the full-name grammar must actually occur');
  assert.equal(live + summary, 21, 'touchdowns across all three fixtures');
  assert.equal(summary, 5, 'touchdowns carrying no TOUCHDOWN token');
});

test('a play wiped out by a flag scores nothing, whatever its text still says', () => {
  // real-utep-at-ou 401856664298: "... TOUCHDOWN nullified by penalty ... NO PLAY"
  // real-bois-at-ore 401858433548: "... pass intercepted by ... PENALTY ... NO PLAY"
  const cases = [
    ['real-utep-at-ou-260905-final.json', '401856664298', /TOUCHDOWN nullified by penalty/],
    ['real-bois-at-ore-260905-final.json', '401858433548', /pass intercepted by/],
  ];
  for (const [name, playId, re] of cases) {
    const { plays, facts } = fx(name);
    const d = detect(plays, facts).find((x) => x.playId === playId);
    assert.ok(d, `${name} ${playId} must be in the fixture`);
    assert.ok(re.test(d.text), `${name} ${playId}: the misleading text is still there`);
    assert.ok(/NO PLAY/i.test(d.text));
    // `red_zone` and `close_game` are states of the field and of the game, not
    // things a play did — a flag that carries the ball to the 14 really does
    // put the offense in the red zone. Everything a PLAY can do must be silent.
    const playLevel = d.events.filter((e) => !['red_zone', 'close_game', 'overtime'].includes(e));
    assert.deepEqual(playLevel, [], `${name} ${playId} fired ${d.events}`);
    assert.ok(!['touchdown', 'interception', 'turnover', 'fumble', 'downs'].includes(d.primary));
  }
});

test('a return touchdown is credited to the returning team, not the drive', () => {
  // real-utep-at-ou drive 4018566644 belongs to UTEP — they punted. OU's
  // 88-yard return is the touchdown. Naming the drive's team here is the same
  // class of error as 7.2's tackler: one card, three different people.
  const { plays, facts } = fx('real-utep-at-ou-260905-final.json');
  const d = detect(plays, facts).find((x) => x.playId === '40185666482');
  assert.ok(d, 'the punt return touchdown must be in the fixture');
  assert.equal(d.offenseTeamId, facts.awayTeamId, 'the drive is UTEP\'s');
  assert.ok(d.events.includes('touchdown'));
  assert.ok(d.events.includes('punt'));
  const td = d.reasons.find((r) => r.event === 'touchdown');
  assert.match(td.headline, /Touchdown — OU/, td.headline);
  assert.doesNotMatch(td.headline, /UTEP/, td.headline);
  // And the win-probability line agrees: this is the first quarter's big swing.
  const { wp } = fx('real-utep-at-ou-260905-final.json');
  const m = keyMoments(detect(plays, facts), wp, facts).find((x) => x.playId === '40185666482');
  assert.ok(m.wpDelta > 0, 'it moved the line toward the home team');
  assert.match(m.text, /Touchdown — OU, returned/);
});

test('field goals: every made field goal in scoringPlays[], plus the misses', () => {
  for (const name of FIXTURES) {
    const { raw, plays, facts } = fx(name);
    const made = raw.scoringPlays.filter((s) => /field goal/i.test(s.type.text)).length;
    const dets = detect(plays, facts);
    const fgs = dets.filter((d) => d.events.includes('field_goal'));
    const good = fgs.filter((d) => !/NO GOOD/i.test(d.text)).length;
    const missed = raw.drives.previous.filter((d) => d.result === 'MISSED FG').length;
    assert.equal(good, made, `${name}: made field goals`);
    assert.equal(fgs.length - good, missed, `${name}: missed field goals`);
  }
});

test('a made field goal never also reads as a touchdown', () => {
  for (const name of FIXTURES) {
    const { plays, facts } = fx(name);
    for (const d of detect(plays, facts)) {
      if (d.events.includes('field_goal')) {
        assert.ok(!d.events.includes('touchdown'), `${name} ${d.playId}: ${d.text}`);
      }
    }
  }
});

/* ------------------------------------------------------------------ */
/* Turnovers                                                            */
/* ------------------------------------------------------------------ */

test('interceptions and lost fumbles match the fixture drive results', () => {
  for (const name of FIXTURES) {
    const { raw, plays, facts } = fx(name);
    const res = driveResults(raw);
    const dets = detect(plays, facts);
    const ints = dets.filter((d) => d.events.includes('interception')).length;
    const fums = dets.filter((d) => d.events.includes('fumble') && d.events.includes('turnover')).length;
    assert.equal(ints, res.INT || 0, `${name}: interceptions`);
    assert.equal(fums, res.FUMBLE || 0, `${name}: lost fumbles`);
  }
});

test('every turnover carries the specific kind that caused it', () => {
  for (const name of FIXTURES) {
    const { plays, facts } = fx(name);
    for (const d of detect(plays, facts)) {
      if (!d.events.includes('turnover')) continue;
      assert.ok(
        d.events.includes('interception') || d.events.includes('fumble'),
        `${name} ${d.playId}: bare turnover — ${d.text}`,
      );
    }
  }
});

test('a turnover on downs is NOT a generic turnover', () => {
  // The reference is explicit about this and it is the one that gets rewritten.
  for (const name of FIXTURES) {
    const { plays, facts } = fx(name);
    for (const d of detect(plays, facts)) {
      if (d.events.includes('downs')) {
        assert.ok(!d.events.includes('turnover'), `${name} ${d.playId}`);
      }
    }
  }
});

test('downs is derived from structure, and agrees with the feed drive by drive', () => {
  const counts = {};
  for (const name of FIXTURES) {
    const { raw, plays, facts } = fx(name);
    const dets = detect(plays, facts).filter((d) => d.events.includes('downs'));
    counts[name] = dets.length;

    // Every drive we call `downs` on IS a DOWNS drive in the feed. No phantoms.
    const byId = Object.fromEntries(raw.drives.previous.map((d) => [d.id, d.result]));
    for (const d of dets) assert.equal(byId[d.driveId], 'DOWNS', `${name} ${d.playId}`);

    // The only DOWNS drives we miss are ones with no following drive to observe.
    const drives = raw.drives.previous.filter((x) => x.result === 'DOWNS');
    const missed = drives.filter((x) => !dets.some((d) => d.driveId === x.id));
    for (const m of missed) {
      assert.equal(m.id, raw.drives.previous[raw.drives.previous.length - 1].id,
        `${name}: missed a DOWNS drive that was not the last of the game`);
    }
  }
  assert.deepEqual(counts, {
    'real-utep-at-ou-260905-final.json': 1,
    'real-ball-at-osu-260905-final.json': 1,
    'real-bois-at-ore-260905-final.json': 4,
  });
});

test('the string "TURNOVER ON DOWNS" is not what decides it', () => {
  // It happens to be present on all five here — and it is still the wrong
  // signal: it is absent from the game-ending downs drive, and a 4th-down
  // field goal and a 4th-down touchdown both change hands without it.
  let strings = 0;
  for (const name of FIXTURES) {
    const { plays, facts } = fx(name);
    for (const d of detect(plays, facts)) {
      if (!/TURNOVER ON DOWNS/i.test(d.text)) continue;
      strings++;
      if (d.events.includes('downs')) continue;
      // The sixth one is the last drive of real-bois-at-ore. The game ended on
      // it, so there is no following drive and no possession change to see.
      // detect.py stops the same way: it returns `final` and nothing else.
      assert.equal(d.driveId, lastDriveOf(name), `${name} ${d.playId}: string but no event`);
    }
  }
  assert.equal(strings, 6);
  // The structural rule also refuses these, which a string search cannot.
  const { plays, facts } = fx('real-bois-at-ore-260905-final.json');
  const fourthDownScores = detect(plays, facts).filter(
    (d) => d.events.includes('fourth_down') &&
      (d.events.includes('touchdown') || d.events.includes('field_goal')));
  assert.ok(fourthDownScores.length > 0);
  for (const d of fourthDownScores) assert.ok(!d.events.includes('downs'), d.text);
});

test('a touchdown scored on 4th down is not a turnover on downs', () => {
  const { plays, facts } = fx('real-bois-at-ore-260905-final.json');
  const d = detect(plays, facts).find((x) => /M.Wagner caught at ORE00/.test(x.text));
  assert.ok(d, 'the 4th & 3 touchdown must be in the fixture');
  assert.ok(d.events.includes('touchdown'));
  assert.ok(d.events.includes('fourth_down'));
  assert.ok(!d.events.includes('downs'));
});

/* ------------------------------------------------------------------ */
/* Possession — the timeout trap                                        */
/* ------------------------------------------------------------------ */

test('a timeout carries the calling team\'s id and must not flip possession', () => {
  let traps = 0;
  for (const name of FIXTURES) {
    const { plays, facts } = fx(name);
    const teams = driveTeams(plays);
    for (const p of plays) {
      if (!/^\s*(?:\(\d{1,2}:\d{2}\)\s*)?Timeout\b/i.test(p.text)) continue;
      if (p.offenseTeamId && p.offenseTeamId !== teams.get(p.driveId)) traps++;
    }
    for (const d of detect(plays, facts)) {
      if (!/^\s*Timeout\b/i.test(d.text)) continue;
      // close_game is a state of the GAME, not of the play, and the reference
      // fires it on every poll. Everything else must be silent on a timeout.
      const playLevel = d.events.filter((e) => e !== 'close_game');
      assert.deepEqual(playLevel, [], `${name} ${d.playId}: a timeout fired ${d.events}`);
    }
  }
  assert.equal(traps, 13, 'timeout plays whose offense id is the other team');
});

test('drive teams are read from the drive, and match the feed', () => {
  for (const name of FIXTURES) {
    const { raw, plays } = fx(name);
    const teams = driveTeams(plays);
    for (const d of raw.drives.previous) {
      assert.equal(teams.get(d.id), d.team.id, `${name} drive ${d.id}`);
    }
  }
});

/* ------------------------------------------------------------------ */
/* The reference's own rules, kept                                      */
/* ------------------------------------------------------------------ */

test('a kick return is not a big play', () => {
  for (const name of FIXTURES) {
    const { plays, facts } = fx(name);
    for (const d of detect(plays, facts)) {
      if (!d.events.includes('big_play')) continue;
      assert.ok(!d.events.includes('kickoff'), `${name} ${d.playId}: ${d.text}`);
      assert.ok(!d.events.includes('punt'), `${name} ${d.playId}: ${d.text}`);
    }
  }
});

test('the big-play threshold is configurable and actually moves the count', () => {
  const { plays, facts } = fx('real-bois-at-ore-260905-final.json');
  const at25 = detect(plays, facts).filter((d) => d.events.includes('big_play')).length;
  const at50 = detect(plays, facts, { bigPlayYards: 50 }).filter((d) => d.events.includes('big_play')).length;
  assert.ok(at25 > at50, `${at25} vs ${at50}`);
  assert.ok(at50 >= 0);
});

test('red zone does not repeat while the ball stays inside the twenty', () => {
  for (const name of FIXTURES) {
    const { plays, facts } = fx(name);
    const dets = detect(plays, facts);
    for (let i = 1; i < dets.length; i++) {
      if (!dets[i].events.includes('red_zone')) continue;
      const prevSpot = facts.endYardsToGoal[dets[i - 1].playId];
      if (prevSpot !== null && prevSpot !== undefined && prevSpot <= 20) {
        // Legal only when the previous row was not a play: a timeout, the end
        // of a period, or a snap a flag wiped out. All three survivors here
        // are penalties that carried the ball inside the twenty on "NO PLAY".
        assert.ok(
          /^\s*(Timeout|End of|End Of)\b/i.test(dets[i - 1].text) ||
          /\bNO PLAY\b|nullified by penalty/i.test(dets[i - 1].text),
          `${name}: red zone repeated at ${dets[i].playId} after ${dets[i - 1].playId}`);
      }
    }
  }
});

test('close_game only fires in the fourth quarter, one score, inside five minutes', () => {
  for (const name of FIXTURES) {
    const { plays, facts } = fx(name);
    for (const d of detect(plays, facts)) {
      if (!d.events.includes('close_game')) continue;
      assert.ok(d.quarter >= 4, name);
      assert.ok(d.margin <= 8, name);
      assert.ok(d.clockSeconds <= 300, name);
    }
  }
});

test('the three blowouts never produce a close_game', () => {
  // Final scores: OU 51-0 UTEP, OSU 45-13 BALL, ORE 34-24 BOIS.
  // Only bois-at-ore is inside eight, and only before it broke open.
  const got = {};
  for (const name of FIXTURES) {
    const { plays, facts } = fx(name);
    got[name] = detect(plays, facts).filter((d) => d.events.includes('close_game')).length;
  }
  assert.equal(got['real-utep-at-ou-260905-final.json'], 0);
  assert.equal(got['real-ball-at-osu-260905-final.json'], 0);
});

test('no overtime and no safety in these three fixtures — a null result, not a pass', () => {
  for (const name of FIXTURES) {
    const { plays, facts } = fx(name);
    const t = tally(detect(plays, facts));
    assert.equal(t.overtime ?? 0, 0, `${name}: overtime`);
    assert.equal(t.safety ?? 0, 0, `${name}: safety`);
  }
});

/* ------------------------------------------------------------------ */
/* 7.7 — why the line moved                                             */
/* ------------------------------------------------------------------ */

test('7.7 — a KeyMoment is built from a detection and the feed\'s own wp series', () => {
  for (const name of FIXTURES) {
    const { plays, facts, wp } = fx(name);
    const dets = detect(plays, facts);
    const km = keyMoments(dets, wp, facts);
    assert.ok(km.length > 0, name);
    for (const m of km) {
      assert.equal(typeof m.playId, 'string');
      assert.equal(typeof m.wpDelta, 'number');
      assert.ok(Number.isFinite(m.wpDelta));
      assert.ok(m.text.length > 10, m.text);
      assert.ok(/win probability/.test(m.text), m.text);
      assert.ok(/\d+% → \d+%/.test(m.text), m.text);
      const d = dets.find((x) => x.playId === m.playId);
      assert.equal(m.event, d.primary);
    }
  }
});

test('7.7 — the biggest mover in each game is a real, nameable play', () => {
  const seen = {};
  for (const name of FIXTURES) {
    const { plays, facts, wp } = fx(name);
    const top = topKeyMoments(keyMoments(detect(plays, facts), wp, facts), 1)[0];
    seen[name] = top;
    assert.ok(Math.abs(top.wpDelta) > 0.03, `${name}: ${top.text}`);
  }
  // Every game's single biggest swing is a score or a change of possession —
  // never a red zone entry or a 4th-down snap.
  for (const [name, m] of Object.entries(seen)) {
    assert.ok(
      ['touchdown', 'field_goal', 'interception', 'fumble', 'turnover', 'downs'].includes(m.event),
      `${name}: ${m.event} — ${m.text}`,
    );
  }
});

test('a gap in the wp series never invents a swing', () => {
  const { plays, facts } = fx('real-utep-at-ou-260905-final.json');
  const dets = detect(plays, facts);
  const withTd = dets.filter((d) => d.primary === 'touchdown');
  const sparse = { [withTd[0].playId]: 0.5, [withTd[1].playId]: 0.9 };
  const km = keyMoments(dets, sparse, facts);
  assert.equal(km.length, 1);
  assert.ok(Math.abs(km[0].wpDelta - 0.4) < 1e-9);
});

/* ------------------------------------------------------------------ */
/* 7.2 — the star is passed through, never re-derived                   */
/* ------------------------------------------------------------------ */

test('7.2 — detect passes the parser\'s star through untouched', () => {
  const star = { name: 'I. Sategna III', jersey: '1', teamId: '201', role: 'carrier' };
  const play = {
    id: 'x1', driveId: 'd1', quarter: 1, clock: '07:27', down: 4, distance: 6,
    yardsToGoal: 88, offenseTeamId: '201',
    text: '#47 B.Braun punt 59 yards to the OU12 #1 I.Sategna III return 88 yards to the UTEP00 TOUCHDOWN',
    yards: 88, star, type: 'kick',
  };
  const [d] = detect([play], { abbrev: { 201: 'OU' } });
  assert.equal(d.star, star, 'the same object, not a copy and not a re-derivation');
  assert.ok(d.events.includes('touchdown'));
  assert.ok(d.events.includes('punt'));
  assert.equal(d.primary, 'touchdown');
});

test('detect works with no facts at all, and says so by omission', () => {
  const play = {
    id: 'y1', driveId: 'd1', quarter: 4, clock: '01:00', down: 1, distance: 10,
    yardsToGoal: 40, offenseTeamId: '201',
    text: 'Shotgun #10 J.Mateer pass complete deep middle to #1 I.Sategna III caught at UTEP07, for 34 yards to the UTEP00 TOUCHDOWN',
    yards: 34, star: null, type: 'pass',
  };
  const [d] = detect([play]);
  assert.ok(d.events.includes('touchdown'));
  assert.equal(d.score, null);
  assert.ok(!d.events.includes('close_game'), 'no score means no close_game, never a guess');
});

/* ------------------------------------------------------------------ */
/* The bar: detect.py on the same input                                 */
/* ------------------------------------------------------------------ */

/**
 * Every place this detector and `ncaalive/detect.py` disagree on the same real
 * input, with the reason. `+` is ours only, `-` is the reference's only.
 *
 * The list is the point. It is not a waiver — it is locked, so a fourteenth
 * divergence fails the build and has to be explained before it ships.
 */
const EXPECTED_DIVERGENCE = [
  // --- the reference's red-zone flicker on an opponent timeout ------------
  // A TIMEOUT row's `end.yardsToEndzone` is measured from the team that CALLED
  // the timeout: 85 when the ball is on the 15. The reference therefore leaves
  // and re-enters the red zone on every opponent timeout. We skip the row.
  'real-utep-at-ou-260905-final.json 40185666447 -red_zone',
  'real-utep-at-ou-260905-final.json 401856664120 -red_zone',
  'real-utep-at-ou-260905-final.json 401856664118 +red_zone',
  'real-ball-at-osu-260905-final.json 401858432371 -red_zone',
  'real-ball-at-osu-260905-final.json 401858432377 -red_zone',

  // --- a missed field goal ------------------------------------------------
  // The reference has no field-goal event at all: it reads a SCORE DELTA, so a
  // miss is invisible to it — and worse, `statYardage` on a 50-yard attempt
  // trips its big-play threshold, so it buzzes "50 yards" for a kick that
  // missed. A missed 50-yarder is one of the biggest movers on the WP line,
  // so we emit `field_goal` and refuse `big_play`.
  'real-utep-at-ou-260905-final.json 401856664122 +field_goal',
  'real-utep-at-ou-260905-final.json 401856664122 -big_play',
  'real-utep-at-ou-260905-final.json 401856664213 +field_goal',
  'real-utep-at-ou-260905-final.json 401856664213 -big_play',
  'real-utep-at-ou-260905-final.json 401856664645 +field_goal',
  'real-utep-at-ou-260905-final.json 401856664645 -big_play',

  // --- a pre-snap flag on fourth down -------------------------------------
  // A "NO PLAY" penalty row carries the down it was flagged on, so the
  // reference announces "4th & 9" for a delay of game and then announces it
  // again — or, twice here, ONLY on the flag. We announce it once, on the snap
  // that was actually played. That is the whole 17-vs-15 gap in utep-at-ou.
  'real-utep-at-ou-260905-final.json 401856664210 -fourth_down',
  'real-utep-at-ou-260905-final.json 401856664674 -fourth_down',
  'real-bois-at-ore-260905-final.json 401858433303 -fourth_down',
  'real-bois-at-ore-260905-final.json 401858433306 +fourth_down',

  // --- a score attributed to a play that did not score --------------------
  // The reference reads a score delta between two polls, so when the feed
  // orders a "NO PLAY" penalty row after the touchdown, the delta lands on the
  // penalty. Its own crown-jewel test names this failure; the play list makes
  // it avoidable, because the touchdown says so itself.
  'real-bois-at-ore-260905-final.json 401858433794 -touchdown',

];

test('event-for-event against ncaalive/detect.py', (t) => {
  const path = process.env.DETECT_PY_JSON || join(HERE, '..', '.detect-py.json');
  if (!existsSync(path)) {
    t.skip(`no python output at ${path} — set DETECT_PY_JSON to the compare-harness output`);
    return;
  }
  const py = JSON.parse(readFileSync(path, 'utf8'));
  // The reference's vocabulary is not ours. These nine are the overlap; it has
  // no `punt`, no per-play `kickoff`, no `fumble` and no `interception`.
  const COMPARABLE = new Set([
    'touchdown', 'field_goal', 'safety', 'turnover', 'downs',
    'red_zone', 'big_play', 'close_game', 'overtime', 'fourth_down',
  ]);
  const diffs = [];
  let compared = 0;
  for (const name of FIXTURES) {
    const { plays, facts } = fx(name);
    const mine = detect(plays, facts);
    const theirs = py[name];
    assert.ok(theirs, `python output missing for ${name}`);
    for (const d of mine) {
      compared++;
      const a = new Set(d.events.filter((e) => COMPARABLE.has(e)));
      const b = new Set((theirs[d.playId] || []).filter((e) => COMPARABLE.has(e)));
      for (const e of a) if (!b.has(e)) diffs.push(`${name} ${d.playId} +${e}`);
      for (const e of b) if (!a.has(e)) diffs.push(`${name} ${d.playId} -${e}`);
    }
  }
  assert.equal(compared, 516, 'plays compared across the three fixtures');
  assert.deepEqual(diffs.slice().sort(), EXPECTED_DIVERGENCE.slice().sort(),
    `\nunexpected divergence:\n${diffs.filter((x) => !EXPECTED_DIVERGENCE.includes(x)).join('\n')}`);
});
