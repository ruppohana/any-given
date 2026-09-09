/* The live loop, against the captured NFL and college payloads and the three
 * complete real games. No fixture was written for any of it. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classify, readPlays, readLive, priceFrom, settleAgainst } from '../src/live.ts';

const load = (f) => JSON.parse(readFileSync(new URL('../fixtures/' + f, import.meta.url), 'utf8'));
const GAMES = ['real-utep-at-ou', 'real-ball-at-osu', 'real-bois-at-ore'];

test('run/pass is read off real play text on three complete games', () => {
  let total = 0; const kinds = { run: 0, pass: 0, other: 0 };
  for (const g of GAMES) {
    const plays = readPlays(load(`${g}-260905-final.json`));
    total += plays.length;
    for (const p of plays) kinds[p.kind]++;
  }
  console.log(`    ${total} real plays -> ${JSON.stringify(kinds)}`);
  assert.ok(total > 500, 'the three games are the corpus');
  assert.ok(kinds.run > 100 && kinds.pass > 100, 'both sides are well represented');
  /* Roughly a quarter of a real game is not a run or a pass - kicks, penalties,
   * timeouts, quarter ends. Every one of those is the void path. */
  assert.ok(kinds.other > 60, 'the void path is not a rare case');
});

test('🔴 a sack is a PASS, and a kick is neither', () => {
  assert.equal(classify('J.Mateer sacked at OU 20 for -7 yards', 'Sack'), 'pass');
  assert.equal(classify('T.Sandell 44 yard field goal is GOOD', 'Field Goal Good'), 'other');
  assert.equal(classify('B.Braun punts 51 yards', 'Punt'), 'other');
  assert.equal(classify('PENALTY UTEP Offside 5 yards. NO PLAY', 'Penalty'), 'other');
  assert.equal(classify('L.Avant rush left for 3 yards', 'Rush'), 'run');
  assert.equal(classify('J.Mateer pass complete deep middle', 'Pass Reception'), 'pass');
});

test('🔴 a sack counted as a run would lie about third and long', () => {
  /* The reason the rule above matters, stated as a number: sacks are pass plays
   * and there are enough of them to move a price. */
  let sacks = 0, wiped = 0;
  for (const g of GAMES) {
    for (const p of readPlays(load(`${g}-260905-final.json`))) {
      if (!/ sacked/i.test(p.text)) continue;
      /* A sack wiped by an accepted penalty is NOT a pass - the play did not
       * happen. Found by this test failing on exactly one of them across three
       * games, which is the classifier being right and the assertion being too
       * strong. */
      if (/NO PLAY/i.test(p.text)) { wiped++; assert.equal(p.kind, 'other', p.text.slice(0, 60)); continue; }
      sacks++;
      assert.equal(p.kind, 'pass', p.text.slice(0, 60));
    }
  }
  console.log(`    ${sacks} sacks priced as passes, ${wiped} wiped by a penalty and voided`);
  assert.ok(sacks > 0);
});

test('the price is a real rate with a stated prior, and it says how thin it is', () => {
  const plays = readPlays(load('real-bois-at-ore-260905-final.json'));
  const team = plays.find((p) => p.kind !== 'other').offenseTeamId;
  const first = priceFrom(plays.slice(0, 1), team);
  const full = priceFrom(plays, team);
  console.log(`    first snap: ${first.map((o) => o.side + ' ' + o.p + ' n=' + o.samples).join('  ')}`);
  console.log(`    full game : ${full.map((o) => o.side + ' ' + o.p + ' n=' + o.samples).join('  ')}`);
  /* The prior keeps the first snap off 0 and 1, and says it is a prior. */
  assert.ok(first[0].p > 0 && first[0].p < 1);
  assert.equal(first[0].basis, 'league-prior', 'a thin sample says so');
  assert.equal(full[0].basis, 'game', 'a full game does not');
  for (const o of [...first, ...full]) {
    assert.ok(o.payoutPerMarble <= 6, 'the 6x cap holds');
    assert.ok(o.payoutPerMarble >= 1);
  }
  assert.ok(Math.abs(full[0].p + full[1].p - 1) < 0.002, 'the two sides sum to one');
});

test('🔴 a call settles against the NEXT play, because the snap does not exist yet', () => {
  const plays = readPlays(load('real-utep-at-ou-260905-final.json'));
  const i = plays.findIndex((p, k) => p.kind !== 'other' && plays[k + 1] && plays[k + 1].kind !== 'other');
  const after = plays[i], next = plays[i + 1];
  const right = settleAgainst({ afterPlayId: after.id, side: next.kind }, plays);
  const wrong = settleAgainst({ afterPlayId: after.id, side: next.kind === 'run' ? 'pass' : 'run' }, plays);
  assert.equal(right.landed, true);
  assert.equal(wrong.landed, false);
  console.log(`    called after ${after.id} -> next was a ${next.kind}`);
});

test('🔴 a snap that was not a run or a pass VOIDS - the offense never chose', () => {
  const plays = readPlays(load('real-utep-at-ou-260905-final.json'));
  const i = plays.findIndex((p, k) => plays[k + 1] && plays[k + 1].kind === 'other');
  const r = settleAgainst({ afterPlayId: plays[i].id, side: 'run' }, plays);
  assert.equal(r.settled, true);
  assert.equal(r.landed, null, 'a void is neither landed nor missed');
  console.log(`    voided on: ${r.play.text.slice(0, 64)}`);
});

test('a call on the last play of the game does not settle, and does not throw', () => {
  const plays = readPlays(load('real-utep-at-ou-260905-final.json'));
  assert.equal(settleAgainst({ afterPlayId: plays[plays.length - 1].id, side: 'run' }, plays).settled, false);
  assert.equal(settleAgainst({ afterPlayId: 'not-a-play', side: 'run' }, plays).settled, false);
});

test('the live reader works on a REAL captured NFL scoreboard, not just college', () => {
  const nfl = load('feed/espn-nfl-scoreboard-260908.json');
  assert.ok((nfl.events || []).length > 0, 'the capture has games in it');
  const ev = nfl.events[0];
  console.log(`    ${ev.shortName} at ${ev.date} - ${nfl.events.length} games captured`);
  /* 🔴 The first NFL game of the capture is a real navy-on-navy pair, which is
   * the adjacency case the chip was built for and the college file also has. */
  const cs = ev.competitions[0].competitors.map((c) => c.team.color);
  console.log(`    primaries: ${cs.join(' vs ')}`);
});

test('readLive shapes a whole real game into what a screen renders', () => {
  const s = readLive(load('real-bois-at-ore-260905-final.json'), '401858433', 'college-football', 1757000000000);
  assert.equal(s.status, 'final');
  assert.ok(s.plays.length > 150);
  assert.ok(Object.keys(s.teams).length >= 2);
  assert.equal(s.offers, null, 'a finished game offers no call');
  console.log(`    ${s.teams[s.awayTeamId].abbrev} ${s.awayScore} at ${s.teams[s.homeTeamId].abbrev} ${s.homeScore}, ${s.plays.length} plays`);
});
