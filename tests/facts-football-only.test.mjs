/* A GAME CARD'S FUN FACTS ARE FOOTBALL'S, AND ONLY FOOTBALL ASKS FOR THEM.
 *
 * Found 2026-09-13 building soccer: the slate's game card fetched
 * /nuggets/<nfl|ncaa>/<team id>.json for EVERY sport, and a team id is only
 * unique within its league - an NBA, MLB, NHL or WNBA id under ncaa is some
 * college, so a pro row could show another team's "fun fact". The facts files
 * exist for football only (public/nuggets/nfl, public/nuggets/ncaa).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const P2 = readFileSync(new URL('../public/screens/p2-slate.screen.js', import.meta.url), 'utf8');

test('only a football card fetches team facts', () => {
  assert.ok(P2.includes("const footballCard = !(ctx && ctx.sport) || ctx.sport === 'nfl' || ctx.sport === 'college-football';"));
  assert.ok(P2.includes('for (const side of (footballCard ? [A, H] : [])) {'));
  assert.equal((P2.match(/fetch\('\/nuggets\/'/g) || []).length, 1, 'one facts fetch, behind the football guard');
});
