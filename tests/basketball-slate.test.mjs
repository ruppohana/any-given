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
  assert.ok(LG.includes("for (const [gid, label] of [['football', 'Football'], ['basketball', 'Basketball'], ['racing', 'Racing']]) {"),
    'Football, Basketball and Racing, in words');
  assert.ok(LG.includes("if (id === 'f1') { location.hash = '#/f1'; return; }"), 'Racing > F1 opens the F1 picks');
  assert.ok(LG.includes("const ids = game === 'basketball' ? ['nba', HOOPS] : game === 'racing' ? ['f1'] : ['nfl', 'college-football'];"),
    'then the shields: pro and college for both ball sports, Formula 1 for racing');
  assert.ok(LG.includes("if (id === 'f1') b.appendChild(el('span', 'lg-sport-word', 'Formula 1'));"), 'F1 is words, never a mark');
  assert.ok(LG.includes("if (!game) return c;"), 'the shields wait for the sport');
});

test('basketball goes to The slate and never becomes the live board\'s sport', () => {
  assert.ok(LG.includes("if (DAY_ONLY.has(id)) { store.set('sport', id); location.hash = '#/allgames'; return; }"));
  assert.ok(LG.includes("const DAY_ONLY = new Set(['nba', HOOPS]);"), 'the NBA too');
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
  assert.ok(P6.includes("if (isDaySport(game.sport)) return dayClock(game.sport, game.period, game.clock, game.statusName);"), 'the sport\'s own periods on the clock');
  assert.ok(P6.includes("league: ctx.sport === 'nfl' ? 'nfl' : ctx.sport === 'nba' ? 'nba' : 'college-football',"), 'an NBA row asks for NBA crests');
});

test('an NBA crest is built from the abbreviation, never the id (5 is Cleveland and a school)', () => {
  const TC = readFileSync(new URL('../public/components/team-chip.js', import.meta.url), 'utf8');
  assert.ok(TC.includes("if ((league || team.league) === 'nba') return nbaLogo(team, variant);"), 'both the local and CDN paths');
  assert.ok(TC.includes("return `https://a.espncdn.com/i/teamlogos/nba/${variant === '500-dark' ? '500-dark' : '500'}/${ab}.png`;"));
});
