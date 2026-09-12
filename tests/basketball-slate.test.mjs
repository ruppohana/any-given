/* BASKETBALL ON THE SLATE, AND PAGE 2 OF HOME - pinned in the source.
 *
 * Jason, 2026-09-12: "On page 2. We need select a sport, the pro or college.
 * And then the 200 marbles thing moves or is a button to open", and basketball
 * on The slate "one day at a time (tonight's games, with tomorrow a tap away)".
 * The data side is tests/slate-day.test.mjs, on two real scoreboards.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const LG = readFileSync(new URL('../public/screens/live-game.screen.js', import.meta.url), 'utf8');
const P6 = readFileSync(new URL('../public/screens/p6-allgames.screen.js', import.meta.url), 'utf8');

test('page 2 asks the sport in words first, then pro or college with the shields', () => {
  assert.ok(LG.includes("for (const [gid, label] of [['football', 'Football'], ['basketball', 'Basketball']]) {"),
    'Football and Basketball, in words');
  assert.ok(LG.includes("const ids = game === 'basketball' ? [HOOPS] : ['nfl', 'college-football'];"),
    'then the shields: NFL and college for football, college for basketball');
  assert.ok(LG.includes("if (!game) return c;"), 'the shields wait for the sport');
});

test('basketball goes to The slate and never becomes the live board\'s sport', () => {
  assert.ok(LG.includes("if (id === HOOPS) { store.set('sport', id); location.hash = '#/allgames'; return; }"));
  assert.ok(LG.includes("sport: liveSport(store.get('sport', null)),"), 'a stored basketball choice is not the live sport');
  assert.ok(LG.includes("function liveSport(v) { return v === 'nfl' || v === 'college-football' ? v : null; }"));
});

test('the 200 Marbles card opens from a button instead of taking page 2', () => {
  assert.ok(LG.includes("how.appendChild(el('summary', 'lg-how-s', 'How Marbles work'));"));
  assert.equal(LG.includes("wrap.appendChild(marblesCard());"), false, 'no longer drawn open on page 2');
});

test('The slate reads basketball a day at a time, from the day route', () => {
  assert.ok(P6.includes("return v === 'nfl' ? 'nfl' : isDaySport(v) ? v : 'college-football';"), 'basketball is a sport here');
  assert.ok(P6.includes("? await fetch('/api/day/' + sport + '/' + wk, { cache: 'no-store' })"), 'one day, one request');
  assert.ok(P6.includes("return isDaySport(sport) ? mapped : overlayLive(mapped, sport);"), 'no football poller overlay');
  assert.ok(P6.includes("const sw = el('div', 'p6a-days');"), 'Today / Tomorrow switch');
  assert.ok(P6.includes("if (isDaySport(fsport)) await refreshDay(inPlay, fsport, ctx.week);"), 'live refresh re-reads the day');
});

test('a tip time ESPN has not set says TBD and never locks the game by its placeholder', () => {
  assert.ok(P6.includes("if (game.tbd === true) return false;"), 'locks on the feed, not the placeholder clock');
  assert.ok(P6.includes("game.tbd === true ? 'TBD' : timeLabel(game.kickoffUtc)"), 'says TBD');
  assert.ok(P6.includes("window: 'Time TBD',"), 'in a group of its own, on its real day, last');
});

test('a game with no line at all offers no winner bet - never a coin flip on a mismatch', () => {
  // Jason, 2026-09-12: "Yes" - hide it until a line posts.
  assert.ok(P6.includes('if (!num(game && game.spread)) return false;'), 'no spread and no moneyline: not offered');
  assert.equal(P6.includes('if (!num(game && game.spread)) return true;'), false, 'the 2.00x fallback is gone');
});

test('a basketball card offers winner, spread and total only, with no live link or football facts yet', () => {
  assert.ok(P6.includes("const DAY_MARKETS = ['winner', 'spread', 'total'];"));
  assert.ok(P6.includes("if (isDaySport(sport) && !DAY_MARKETS.includes(m.id)) return false;"), 'halves and quarters are football\'s clock');
  assert.ok(P6.includes("if (game.status === 'in_progress' && !isDaySport(ctx.sport)) {"), 'no live board link');
  assert.ok(P6.includes("if (!isDaySport(ctx.sport)) {\n    const info = el('button', 'p6a-info', 'info');")
    || P6.includes("if (!isDaySport(ctx.sport)) {\r\n    const info = el('button', 'p6a-info', 'info');"), 'no football nuggets');
  assert.ok(P6.includes("if (isDaySport(game.sport)) return hoopsClock(game.period, game.clock, game.statusName);"), 'halves on the clock');
});
