/* THE LIVE TAB DOES NOT REPEAT HOME'S QUESTIONS.
 *
 * Jason, 2026-09-10: "i dont remember it having a duplicate of the 'what are
 * you here for'". A phone with no mode stored opened the Live tab onto Home's
 * chooser. Tapping Live is the answer: the screen assumes it (without storing
 * it, so Home still asks) and falls back to college for the league.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../public/screens/live-game.screen.js', import.meta.url), 'utf8');

test('the Live tab assumes live and college instead of asking Home\'s questions', () => {
  assert.ok(SRC.includes("if (!S.isHome && !S.mode) S.mode = 'live';"), 'no mode: assume live');
  assert.ok(SRC.includes("if (!S.isHome && !S.sport) S.sport = 'college-football';"), 'no league: college');
  assert.equal(/!S\.isHome && !S\.mode\) \{ wrap\.appendChild\(modeCard/.test(SRC), false,
    'the Live tab must not draw the chooser');
});

test('the assumption is not stored - Home still asks', () => {
  const at = SRC.indexOf("if (!S.isHome && !S.mode) S.mode = 'live';");
  const line = SRC.slice(at, SRC.indexOf('\n', at));
  assert.equal(line.includes('store.set'), false, 'assumed for this screen only');
});
