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

test('the Live tab opens the game picker, not the last game', () => {
  // Jason, 2026-09-11, with three games on: "Selecting live games immediately
  // take me to Villanova only, no choice on the other two games" - then "Ok
  // remove the return to the last game. Go to the selector." Replaces 09-10's
  // return-to-the-last-game.
  const APP = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.ok(APP.includes('window.__agPick = true;'), 'a tap on the tab asks for the picker');
  assert.ok(SRC.includes('S.pick = !forced && !S.isHome && window.__agPick === true;'),
    'only from the tab - an invite link still opens its own game');
  assert.ok(SRC.includes('if (S.pick) { gamePicker(wrap, now); return; }'), 'the picker draws instead of a game');
  assert.equal(/lastLive|__agGoLast|lastKey/.test(SRC + APP), false, 'the return to the last game is gone');
  // "Live games, then ncaa, should take you to the picker" - both league buttons.
  assert.equal((SRC.match(/if \(S\.mode !== 'pool' && S\.mode !== 'allgames'\) window\.__agPick = true;/g) || []).length, 2,
    'the front door\'s league buttons open the picker too');
});

test('the picker repaints on a change, never on the clock', () => {
  // Jason, 2026-09-11: "All the icons are blinking." Every repaint rebuilds
  // every crest; the picker was being rebuilt every five seconds.
  assert.ok(SRC.includes('if (S.pick) { pickerTick(wrap); return; }'), 'the poll does not repaint the picker');
  assert.ok(SRC.includes("if (d.status === 'final' && was.status !== 'final') { S.lastSig = null; paint(wrap); return; }"),
    'a live answer repaints only when the game ended');
  assert.ok(SRC.includes('patchLiveCard(k);'), 'a score or clock is written into the card in place');
  assert.ok(SRC.includes('if (changed) { S.lastSig = null; paint(wrap); }'), 'and so does the slate copy');
});

test('the live screen repaints when what it shows changes, not every poll', () => {
  // Jason, 2026-09-11, on Missouri at Kansas: "The logos blink here to." The
  // poll repainted the live screen every five seconds; every repaint rebuilds
  // every crest.
  assert.ok(SRC.includes("const sig = quiet ? homeSignature() : 'live:' + liveSignature(Date.now());"),
    'the live screen has a signature, like Home');
  assert.ok(SRC.includes('if (sig === S.lastSig) { patchFoot(wrap); return; }'),
    'an unchanged screen is not repainted - only its feed age is written in place');
  assert.equal(/\} else \{\s*S\.lastSig = null;\s*\}\s*paint\(wrap\);/.test(SRC), false,
    'the unconditional live repaint is gone');
});

test('a repaint keeps the crests it already had', () => {
  // Measured 2026-09-11: 510 images rebuilt in 25s with 170 on screen. A new
  // play must repaint, so the fix is to reuse the decoded <img> elements.
  assert.ok(SRC.includes('paintScreen(wrap);'), 'paint() wraps the rebuild');
  assert.ok(SRC.includes('im.replaceWith(old);'), 'each new crest is swapped for the one already on screen');
  assert.ok(SRC.includes('if (old.getAttribute(a.name) !== a.value) old.setAttribute(a.name, a.value);'),
    'and an identical src is never re-set');
});

test('the end of a quarter retires the question', () => {
  // Jason, 2026-09-11: "End of the first quarter should retire the choice below."
  assert.ok(SRC.includes('function atQuarterEnd(state)'), 'a quarter end is recognized');
  assert.ok(SRC.includes('if (atHalfTime(state) || atQuarterEnd(state)) return null;'),
    'and no question is offered across it');
});

test('the Slate tab opens the betting board on the betting side', () => {
  // Jason, 2026-09-11: "in the betting side, not the pool side, we should be
  // able to bet in the slate."
  const APP = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.ok(APP.includes("return mode === 'live' || mode === 'allgames' ? '#/allgames' : '#/slate';"),
    'betting side -> All games; pool side and no side -> the pick\'em');
  assert.ok(APP.includes("(d.id === 'slate' ? slateHref()"), 'the bar uses it');
  assert.ok(APP.includes("slateTab.setAttribute('href', slateHref());"), 'and decides again at the tap');
});

test('a game link mounts once, on the game it names', () => {
  // Jason, 2026-09-11: "Selecting Norfolk Virginia takes me to Villanova still."
  // The no-hash redirect used location.replace, whose hashchange arrived after
  // the first mount had consumed ?game= - so a second mount opened the first
  // live game instead. The redirect must not fire hashchange.
  const APP = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const at = APP.indexOf("if (!location.hash || location.hash === '#/' || location.hash === '#') {");
  assert.ok(at > 0, 'the no-hash redirect is still there');
  const block = APP.slice(at, APP.indexOf('buildSettings();', at));
  assert.ok(block.includes('history.replaceState('), 'it sets the hash without an event');
  assert.equal(/location\.replace\(/.test(block), false, 'location.replace fires a late hashchange');
});

test('the board settles a drive call as a drive call, by the phone\'s own rule', () => {
  // 2026-09-11: the list said a red-zone call lost; the board said void. The
  // server keeps no scope or driveId, so the board fills both the way makeCall
  // does - the scope from the catalog, the drive from the play it followed.
  assert.ok(SRC.includes('scope: type.scope, driveId: afterPlay.driveId'), 'the phone\'s rule');
  assert.ok(SRC.includes("scope: c.scope || (byId(c.type) || {}).scope || 'play'"), 'the board takes the scope from the catalog');
  assert.ok(SRC.includes('driveId: c.driveId || (after && after.driveId)'), 'and the drive from the play it followed');
});

test('the Live screen never parks on a game that was already over when it arrived', () => {
  // Jason, 2026-09-10: "i still have the problem with going back to 'live' after
  // the game is over." The first key is a constant (FAMU at Miami, long final);
  // a final on arrival - not an invite, not watched to its end - moves on first.
  const at = SRC.indexOf("S.raw.status === 'final' && !S.forced && !S.sawLive && S.sport");
  assert.ok(at > 0, 'a final on arrival is caught');
  assert.ok(SRC.slice(at, at + 200).includes('if (await refreshKey(wrap, S.sport)) return;'),
    'and it moves to the next game before painting the final');
  assert.ok(SRC.includes("if (S.raw && S.raw.status === 'live') S.sawLive = true;"), 'watching it live keeps you on its final');
  assert.ok(/\n\s*S\.sawLive = false;\r?\n/.test(SRC), 'reset on every mount');
  assert.ok(/sport !== S\.sport\) return false;[\s\S]{0,120}return true;/.test(SRC), 'refreshKey says whether it moved');
});

test("the Live screen has no week's card - the slate tab is one tap away", () => {
  // Jason, 2026-09-10: "we dont need this, someone can just hit the slate icon below."
  assert.equal(SRC.includes("S.mode === 'pool' ? 'Open your group' : \"The week's card\""), false);
});

test('a poll reply about a game the screen has left is thrown away', () => {
  // Jason, 2026-09-10: "it flashes villanova then shows the florida game over
  // then after about 30 seconds goes back to villanova." FAMU's late reply was
  // applied on top of Villanova. Each poll remembers its key and checks it after
  // every await before touching S.raw or S.board.
  const at = SRC.indexOf('async function poll(wrap) {');
  const end = SRC.indexOf('S.board = calls;', at);
  assert.ok(end > at, 'the board reply is guarded too');
  const body = SRC.slice(at, end + 20);
  assert.ok(body.includes('const key = S.key;'), 'the poll remembers the game it asked about');
  assert.ok(body.includes("fetch('/api/state/' + key)"), 'and asks about that key');
  assert.ok((body.match(/if \(key !== S\.key\) return;/g) || []).length >= 3,
    'and drops the reply after each await if the screen has moved on');
});

test('the home hero is crisp, 25% larger from the top, and bleeds under the text', () => {
  // Jason, 2026-09-11: "Yes crisp edge", then "make the image 25% larger. Hold the
  // top so the bottom will bleed under the text more."
  assert.equal(/\.lg-hero::after\s*\{[^}]*linear-gradient/.test(SRC), false, 'no fade over the bottom');
  const hero = SRC.match(/\.lg-hero \{[^}]*\}/)[0];
  assert.match(hero, /overflow-x: clip/, 'the wider picture cannot scroll the page sideways');
  assert.match(hero, /overflow-y: visible/, 'the bottom bleeds out of the 300px box');
  const img = SRC.match(/\.lg-hero-img \{[^}]*\}/)[0];
  assert.match(img, /width: 125%/);
  assert.match(img, /height: 125%/);
  assert.match(img, /top: 0/, 'held at the top');
  assert.match(img, /transform-origin: 50% 0%/, 'the zoom holds the top edge too');
  assert.match(SRC, /\.lg-hero \+ \* \{ position: relative; z-index: 1; \}/, 'the text stays above the picture');
});
