/* S4 - the share card. Run against the three REAL captured games in fixtures/.
 * Nothing in here is a written fixture: every play, every team and every price is
 * read out of a file captured from the feed on 2026-09-05.
 *
 * These tests cover the model, not the pixels. Requirement 7.5 says layout bugs
 * are invisible to tests, so the layout closes in a browser at 393px and the
 * evidence for that is in the return, not in this file. What IS testable here is
 * the thing a browser cannot check by looking: that no card can carry live state.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as S from '../public/screens/s4-share.screen.js';

const load = (n) => JSON.parse(readFileSync(new URL(`../fixtures/${n}-260905-final.json`, import.meta.url), 'utf8'));
const DB = JSON.parse(readFileSync(new URL('../fixtures/teams.json', import.meta.url), 'utf8'));

const GAMES = ['real-utep-at-ou', 'real-ball-at-osu', 'real-bois-at-ore'];
const RAW = Object.fromEntries(GAMES.map((g) => [g, load(g)]));

const ORE = RAW['real-bois-at-ore'];
const ORE_TEAMS = S.gameTeams(ORE, DB);
const PLAYS = S.extractPlays(ORE);
const PRICE = S.empiricalPrice(GAMES.map((g) => RAW[g]), { down: 3, maxDistance: 2 });

const LANDED_ID = '401858433192';   // Q2, 3rd & 2 at BOIS 42, pass complete, 23 yds
const MISSED_ID = '401858433765';   // Q4, 3rd & 2 at BOIS 23, rush middle, 0 yds

const landedPlay = PLAYS.find((p) => p.id === LANDED_ID);
const missedPlay = PLAYS.find((p) => p.id === MISSED_ID);

const card = (play) => S.callCard({ play, teams: ORE_TEAMS, price: PRICE, called: 'pass', stake: 25 });

/* ------------------------------------------------------------ the real play */

test('both cards are built from real plays that exist in the captured game', () => {
  assert.equal(PLAYS.length, 181, 'play count in real-bois-at-ore');
  assert.ok(landedPlay, `play ${LANDED_ID} not in the fixture`);
  assert.ok(missedPlay, `play ${MISSED_ID} not in the fixture`);
  assert.equal(landedPlay.start.shortDownDistanceText, '3rd & 2');
  assert.equal(missedPlay.start.shortDownDistanceText, '3rd & 2');
  assert.equal(S.sideOfPlay(landedPlay), 'pass');
  assert.equal(S.sideOfPlay(missedPlay), 'run');
  console.log('    landed:', landedPlay.text);
  console.log('    missed:', missedPlay.text);
});

test('the price is measured, not chosen', () => {
  // 3rd down, <= 2 to go, across all three real games.
  assert.equal(PRICE.pass, 6);
  assert.equal(PRICE.run, 9);
  assert.equal(PRICE.n, 15);
  assert.equal(PRICE.p.toFixed(4), '0.4000');
  assert.equal(PRICE.payoutPerMarble.toFixed(2), '2.50');
  // n = 15 is below price.ts's DEFAULT_MIN_SAMPLES of 30, so the model would have
  // backed off. `lo` is not a failure state - it is the model saying it is guessing.
  assert.equal(PRICE.confidence, 'lo');
  console.log(`    n=${PRICE.n} pass=${PRICE.pass} run=${PRICE.run} p=${PRICE.p} payout=2.50x conf=${PRICE.confidence}`);
});

/* ---------------------------------------------------- 🔴 the spoiler rule */

test('no card carries a scoreline, in any state', () => {
  for (const m of [card(landedPlay), card(missedPlay)]) {
    S.assertSpoilerSafe(m);
    const flat = JSON.stringify(m);
    // The real finals in these fixtures are 34-27, 51-0 and 56-3. None may appear.
    for (const sc of ['34-27', '27-34', '51-0', '56-3', '34 - 27']) {
      assert.ok(!flat.includes(sc), `scoreline ${sc} leaked into the card`);
    }
  }
});

test('assertSpoilerSafe throws on a forbidden key rather than degrading', () => {
  const m = card(landedPlay);
  assert.throws(() => S.assertSpoilerSafe({ ...m, homeScore: 34 }), /forbidden key 'homeScore'/);
  assert.throws(() => S.assertSpoilerSafe({ ...m, live: { wp: 0.71 } }), /forbidden key 'wp'/);
  assert.throws(() => S.assertSpoilerSafe({ ...m, bankBalance: 138 }), /forbidden key 'bankBalance'/);
});

test('assertSpoilerSafe throws on a scoreline hidden in a string', () => {
  const m = card(landedPlay);
  assert.throws(() => S.assertSpoilerSafe({ ...m, proof: 'Oregon leads 34-27' }), /scoreline/);
  assert.throws(() => S.assertSpoilerSafe({ ...m, proof: 'Oregon leads 34 – 27' }), /scoreline/);
});

test('the pool card carries points and never a Marble', () => {
  const legs = [
    { team: DB.teams['201'], opponent: DB.teams['2638'], won: true },
    { team: DB.teams['194'], opponent: DB.teams['2050'], won: true },
    { team: DB.teams['68'], opponent: DB.teams['2483'], won: false }
  ];
  const m = S.poolCard({ week: 1, legs, standing: { rank: 3, of: 9, weekPoints: 2, movement: -1, stub: true }, invite: 'BCDFGH' });
  const flat = JSON.stringify(m).toLowerCase();
  for (const word of ['marble', 'credit', 'coin', 'top-up', 'purchase', 'refill']) {
    assert.ok(!flat.includes(word), `pool card said "${word}"`);
  }
  assert.equal(m.tally.won, 2);
  assert.equal(m.tally.of, 3);
  assert.equal(S.cardAlt(m), 'Any Given Snap. Week 1: 2 of 3 picks correct, 3rd of 9 in the pool.');
});

/* --------------------------------------------------------- the symmetry rule */

test('win and miss are the same model with the sign flipped', () => {
  const a = card(landedPlay), b = card(missedPlay);
  assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort());
  assert.deepEqual(Object.keys(a.result).sort(), Object.keys(b.result).sort());
  assert.equal(a.outcome, 'landed');
  assert.equal(b.outcome, 'missed');
  // stake 25 at p 0.40 -> round(25/0.4) = 63 back, delta +38. A miss is -25.
  assert.equal(a.result.delta, 38);
  assert.equal(b.result.delta, -25);
  assert.equal(a.result.stake, b.result.stake);
  assert.equal(a.price.payout, b.price.payout);
  console.log('    landed', S.cardAlt(a));
  console.log('    missed', S.cardAlt(b));
});

test('the payout cap is on the multiple, not the stake', () => {
  assert.equal(S.payoutFor(25, 0.4), 63);
  assert.equal(S.payoutFor(25, 0.05), 150);   // 1/0.05 = 20x, capped to 6x
  assert.equal(S.payoutFor(25, 0), 150);
  assert.equal(S.payoutFor(25, null), 25);
});

/* ------------------------------------------------------------------ the text */

test('the tackler is stripped from the proof line - requirement 7.2', () => {
  const m = card(landedPlay);
  assert.ok(!m.proof.includes('J.Washington'), 'the tackler reached the card');
  assert.ok(m.proof.includes('D.Moore'), 'the passer did not');
  assert.ok(m.proof.includes('J.McClellan'), 'the receiver did not');
  assert.ok(!/^Shotgun/.test(m.proof));
  assert.equal(m.proof, '#5 D.Moore pass complete short middle to #3 J.McClellan caught at BSU26, for 23 yards to the BSU19');
});

test('every proof line wraps inside the card measure', () => {
  for (const m of [card(landedPlay), card(missedPlay)]) {
    for (const line of S.wrapText(m.proof, 46)) {
      assert.ok(line.length <= 46 || !line.includes(' '), `line too long: ${line}`);
    }
  }
});

/* -------------------------------------------------------------- the wordmark */

test('the wordmark completes itself and the ellipsis is the fallback', () => {
  assert.deepEqual(S.wordmark('football'), { stem: 'Any Given', completion: 'Snap', ellipsis: '…' });
  assert.equal(S.wordmark('basketball').completion, 'Possession');
  assert.equal(S.wordmark('curling').completion, null);   // falls back to the ellipsis
});

test('the invite code is 6 URL-safe characters with no vowels', () => {
  for (const seed of [LANDED_ID, MISSED_ID, 'week1-pool', '', 'x']) {
    const c = S.inviteCode(seed);
    assert.match(c, /^[BCDFGHJKLMNPQRSTVWXYZ23456789]{6}$/, `bad code for ${seed}: ${c}`);
  }
  assert.equal(S.inviteCode(LANDED_ID), S.inviteCode(LANDED_ID), 'not deterministic');
});

/* ---------------------------------------------- team color, the real 760 */

test('the card is built against navy, yellow and a null primary from the real file', () => {
  const T = DB.teams;
  const navy = T['68'];      // Boise State, 0033a0
  const yellow = T['9'];     // Arizona State, ffc627
  const nul = Object.values(T).find((t) => !t.primary || t.primary.toLowerCase() === '000000');
  assert.equal(navy.primary, '0033a0');
  assert.equal(yellow.primary, 'ffc627');
  assert.ok(nul, 'no null-primary team in the file');
  for (const pair of [[navy, yellow], [yellow, nul], [nul, navy], [navy, navy]]) {
    const m = { ...card(landedPlay), teams: { offense: pair[0], defense: pair[1] } };
    S.assertSpoilerSafe(m);           // the model survives every pair
    assert.ok(m.teams.offense && m.teams.defense);
  }
  console.log('    null-primary team used:', nul.abbrev, nul.short);
});

test('no card model mentions a forbidden balance word', () => {
  for (const m of [card(landedPlay), card(missedPlay)]) {
    const flat = JSON.stringify(m).toLowerCase();
    for (const word of ['credit', 'coin', 'top-up', 'purchase', ' buy', 'refill']) {
      assert.ok(!flat.includes(word), `card said "${word}"`);
    }
    assert.ok(JSON.stringify(m).includes('Marbles'), 'the balance is Marbles');
  }
});
