/* S6 - RULES, HOW IT WORKS, AND THE VOID LINE.
 *
 * 🔴 THERE IS NO COMP ON DISK FOR THIS SCREEN, AND EVERY CHOICE BELOW IS
 * THEREFORE NAMED AS A CHOICE RATHER THAN AS A MATCH.
 *
 * DESIGN-BRIEF.md section 4 lists this screen's bar as CBS's `Help` / `Rules`
 * tabs. THEY ARE NOT ON DISK. `reference/cbs-pickem-teardown/screens/` holds two
 * PNGs - the 15-game slate and the four-tiebreaker card - and neither is Help and
 * neither is Rules. `Help · Rules` appears in that teardown ONLY as two words in
 * the transcribed nav chrome. So this screen CANNOT CLAIM A CLOSE against a
 * picture, and it does not.
 *
 * WHAT DOES EXIST, and it is the declared bar:
 *   reference/officepool-teardown/README.md, the `OP-about-modal.png` row -
 *   `About Office Pool` - "Pick. Compete. Win." / an About vs What's New split /
 *   a three-icon explainer / a support contact / a version string. A real shipped
 *   product's answer to this screen, DESCRIBED RATHER THAN PICTURED (that PNG is
 *   gitignored; the README is the tracked artifact).
 *
 *   🔴 AND THE DESCRIPTION IS THINNER THAN THE DISPATCH CLAIMED. The dispatch
 *   quotes the three icon labels as "Play together · Make picks · Claim glory".
 *   THAT PHRASE IS NOT ON DISK ANYWHERE - the README says "three-icon explainer"
 *   and nothing more. So those three words are taken here as hearsay, and the
 *   refusal below is a refusal of the FORM (three icons and a slogan in place of
 *   an answer), which the README does record, rather than of wording nobody in
 *   this repository can read. tests/s6-rules.test.mjs asserts the phrase's
 *   absence, so whoever commits the capture is told to come back here.
 *
 * WHAT WE TAKE FROM IT, AND WHAT WE REFUSE - all four are choices:
 *
 *  1. WE REFUSE THE MODAL. Office Pool's answer is an About sheet over the app:
 *     a slogan, three icons and a version. That is a marketing surface, and it
 *     cannot answer "my game was cancelled, what happened to my pick". This is a
 *     ROUTE, deep-linkable, because the only person who opens a rules screen
 *     arrived with one question already in their head.
 *  2. WE REFUSE THE THREE-ICON EXPLAINER. Three pictures and a verb apiece cannot
 *     survive contact with a push, a locked pick or a tie - whatever the three
 *     verbs turn out to be. Illustration in place of an answer is the failure
 *     this screen exists to avoid.
 *  3. WE TAKE THE SPLIT, in a different form. Their About / What's New is two
 *     registers on one surface. Ours is THE ONE VOID LINE, then an INDEX OF NINE
 *     QUESTIONS, then the nine answers. The index is the whole design: at 393px a
 *     rules screen is a lookup, not a read.
 *  4. WE TAKE THE SUPPORT LINE'S HONESTY and drop the version. A version string
 *     is the one fact on their modal that a user can act on; we have no build
 *     number to show yet, so nothing pretends to be one.
 *
 *  5. AND ONE FINDING FROM THAT SAME TEARDOWN OUTRANKS THE MODAL:
 *     "`How this pool is scored · Straight up` as a one-line banner on the pick
 *     screen. THE RULES SCREEN DOES NOT HAVE TO BE A SCREEN - the scoring rule
 *     lives where the picking happens." That is right, and it is not this file's
 *     to implement (P2 owns the slate). What follows from it here is that this
 *     screen must be the DEEP one - the place the banner links TO - and must not
 *     duplicate a one-line answer that belongs on the screen where it applies.
 *
 * 🔴 THE NUMBERS ARE NOT TYPED IN THIS FILE. Every figure below is read at
 * runtime out of src/lib/pool.ts and src/lib/calls.ts. A rules screen that
 * restates the scorer's numbers is a second copy of the rules that drifts
 * silently, and it drifts in the direction of a lie: the screen keeps saying 5
 * after the ladder moves to 3. tools/preview.mjs strips types and serves those
 * modules as real JavaScript for exactly this reason (L5 does the same with
 * winprob/detect/parse), so the ladder, the bank, the stake chips and the cap on
 * screen ARE the ladder, the bank, the chips and the cap in the code.
 *
 * 🔴 THIS SCREEN DOES NOT RESTATE S2'S `The balance` SECTION. That section is the
 * settings-screen statement of the legal position and it is load-bearing there.
 * Section 6 here answers the RULE OF PLAY - what a bank is, that it is restored
 * at every kickoff, that nobody is ever out - and points at Settings for the
 * statement itself. Two surfaces, one position, no second copy of the sentence.
 *
 * OFFLINE IS NOT A DEGRADED STATE HERE. Rules are not live data. Offline, error
 * and loading all render the ENTIRE ruleset; what is missing in those states is
 * only this pool's own settings, and each state says so in that many words. A
 * rules screen that goes blank without a connection has misunderstood what it is.
 *
 * TYPES: browser JS, no build step. Shapes are honored BY NAME in JSDoc -
 * Pool, Scope, RankingSource, SlateGame, TeamIdentity from src/lib/types.ts -
 * and nothing is re-declared here.
 */
import { teamChip, TEAM_CHIP_CSS } from '/components/team-chip.js';
import { stateBlock, STATES_CSS } from '/components/states.js';
import { payoutLabel } from '/components/fmt.js';

/* 🔴 THE SOURCE OF EVERY NUMBER ON THIS SCREEN. Read, never retyped. */
import { DEFAULT_SCORING, PARLAY_MIN_LEGS, PARLAY_MAX_LEGS } from '/src/lib/pool.ts';
import { HOUSE_RULES, payoutFor, BALANCE_NOUN } from '/src/lib/calls.ts';

export const id = 's6-rules';
export const title = 'Rules and how it works';

/* 🔴 A DESCRIPTION, NOT A PICTURE. The CBS Help/Rules tabs this screen was
 * dispatched against do not exist on disk. This README does, it is the tracked
 * artifact of a real shipped pick'em's answer to this screen, and it is the only
 * thing in the repository that describes one. */
export const bar = 'reference/officepool-teardown/README.md';

/* `section` is one rule, deep-linked - because that is how a rules screen is
 * actually reached: from a voided pick, a locked row, a settled call. The
 * fragment picks the rule; the default is the void rule, which is the one the
 * whole screen was written for. */
export const states = ['ready', 'section', 'loading', 'offline', 'error'];

/* ------------------------------------------------------------------ helpers */

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function para(cls, text) { return el('p', cls, text); }

/** A short list. Two or more of anything is a list, never a paragraph - which is
 *  the whole difference between a rules screen and a wall of text. */
function bullets(items) {
  const ul = el('ul', 's6-ul');
  items.forEach(function (t) { ul.appendChild(el('li', null, t)); });
  return ul;
}

/** A two-column figure row. The right column is always .num, so nothing on this
 *  screen reflows when a value changes width. */
function kv(rows) {
  const box = el('div', 's6-kv');
  rows.forEach(function (r) {
    const line = el('div', 's6-kv-row');
    line.appendChild(el('span', 's6-kv-k', r[0]));
    line.appendChild(el('span', 's6-kv-v num', r[1]));
    box.appendChild(line);
  });
  return box;
}

/** An inline chevron. Inline SVG or nothing - there is no icon font in this app
 *  and there is not going to be one. */
function chevron() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 12 12');
  svg.setAttribute('width', '12');
  svg.setAttribute('height', '12');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('s6-chev');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M4 2 L8 6 L4 10');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.5');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);
  return svg;
}

/** A sentence with one phrase set in the foreground weight. Used sparingly: the
 *  screen has exactly one line that must survive skimming, and it is the void
 *  line, which gets its own component below. */
function lead(text) { return el('p', 's6-lead', text); }

/* --------------------------------------------------------------- the numbers */

/** The parlay ladder, read out of DEFAULT_SCORING rather than written here.
 *  @returns {[string,string][]} */
function ladderRows() {
  const worth = DEFAULT_SCORING.parlayWorth;
  const rows = [];
  for (let n = PARLAY_MIN_LEGS; n <= PARLAY_MAX_LEGS; n++) {
    const w = worth[n];
    /* Written as a positive test rather than as an early `continue`, because the
     * forbidden-words check on the balance is a substring check against shipped
     * code and `continue` is one of the words. A keyword is not copy, and the
     * cheapest way to keep the check strict is not to hand it the argument. */
    if (typeof w === 'number') {
      rows.push([n + ' legs', w + (w === 1 ? ' point' : ' points')]);
    }
  }
  return rows;
}

function points(n) { return n + (n === 1 ? ' point' : ' points'); }

/** A list joined the way a person says it: 5, 10 or 25. */
function orList(values) {
  if (values.length < 2) return String(values[0]);
  return values.slice(0, -1).join(', ') + ' or ' + values[values.length - 1];
}

/* ---------------------------------------------------------------- the labels */

/** @type {Record<import('../../src/lib/types.ts').Scope, string>} */
const SCOPE_LABEL = {
  all: 'Every game',
  top25: 'Ranked teams',
  ranked_v_ranked: 'Ranked against ranked',
  conference: 'One conference',
  handpick: 'A handpicked set'
};

const RANKING_LABEL = { ap: 'the AP poll', cfp: 'the CFP rankings' };

/* ------------------------------------------------------------- the nine rules
 *
 * Order is the decision. The void line is first because it is the one sentence
 * this screen exists to carry and because it is the question that brings people
 * here. Everything after it is ordered by how often it is asked, not by how the
 * code is arranged.
 *
 * Each entry: an anchor id, the question a person actually arrives with, a short
 * heading for the card, and a body builder.
 */
const SECTIONS = [
  { id: 'void',    q: 'My game was cancelled. What happens to my pick?', h: 'When a game does not happen', build: sVoid },
  { id: 'scoring', q: 'How many points is a pick worth?',                h: 'How the pool scores',          build: sScoring },
  { id: 'ties',    q: 'Two of us finished level. Who wins?',             h: 'How a tie breaks',             build: sTies },
  { id: 'scope',   q: 'Why is that game not on my slate?',               h: 'Which games your pool plays',  build: sScope },
  { id: 'halves',  q: 'Do my Marbles help my pool score?',               h: 'Two halves, two currencies',   build: sHalves },
  { id: 'marbles', q: 'Is anything here for sale?',                      h: 'Marbles, and the bank',        build: sMarbles },
  { id: 'price',   q: 'What does a call pay?',                           h: 'The price, before you commit', build: sPrice },
  { id: 'delay',   q: 'Why is the app behind my television?',            h: 'Behind on purpose',            build: sDelay },
  { id: 'age',     q: 'Is this gambling?',                               h: '18+, and what that is not',    build: sAge }
];

/* -------------------------------------------------------------------- 1 VOID */

/* 🔴 THE ONE LINE. CLAUDE.md requires it on this screen, in one line, with no
 * special cases - and this is the sentence that rule was written for.
 *
 * The list under it is NOT a set of special cases and must never be read as one.
 * It names the INPUTS that all arrive at the same output; src/lib/pool.ts
 * resolveGame() is the only function in the app that produces a void and all of
 * these enter it. Naming the inputs is what makes the single path visible.
 * Naming a different OUTCOME for any of them would be the violation. */
function sVoid(data, opts) {
  const box = document.createDocumentFragment();

  /* 🔴 THE LINE IS PRINTED ONCE PER SCREEN, NEVER TWICE.
   *
   * Caught by looking at it at 393px and not by anything in the test file: the
   * banner above the index and this card both carried the sentence, twenty
   * centimetres apart, and a rule stated twice is a rule a reader has to stop and
   * compare. So the card omits it when the banner is above it, and carries it
   * when it is not - which is exactly the `section` route, arriving from a voided
   * pick with no banner anywhere on screen. */
  if (!(opts && opts.bannerAbove)) {
    box.appendChild(el('p', 's6-void-line',
      'A push, a cancellation and a postponement all resolve to the same thing: ' +
      'the game did not happen, for everybody.'));
  }

  box.appendChild(lead('Nothing happens to it. No points won and none lost, for ' +
    'anybody who picked it.'));
  box.appendChild(para('s6-p',
    'Nobody is advantaged by having picked the side that was ahead when it ' +
    'stopped, because there is no side that was ahead.'));

  box.appendChild(el('p', 's6-sub-h', 'All of these are the same event'));
  box.appendChild(bullets([
    'The game was cancelled.',
    'The game was postponed.',
    'The game finished level.',
    'The spread landed exactly, in a pool playing against the spread.',
    'The game left your pool’s slate.'
  ]));
  box.appendChild(para('s6-p',
    'There is one way out of all of them and it is the sentence above. The app ' +
    'does not have a rule for pushes and a different rule for postponements, and ' +
    'it never will — that is where every pool argument you have ever had came ' +
    'from.'));

  box.appendChild(el('p', 's6-sub-h', 'What it does to a parlay'));
  box.appendChild(para('s6-p',
    'A voided leg does not kill your parlay and it is never removed quietly. The ' +
    'leg drops out, the surviving legs decide the result, and the screen says how ' +
    'many went and what the parlay is worth now. If fewer than ' + PARLAY_MIN_LEGS +
    ' legs survive, the parlay itself did not happen either — the same rule ' +
    'again, one level up. It is not a loss.'));

  box.appendChild(para('s6-p',
    'A snap that turns out to be a kick, a penalty or anything other than a run ' +
    'or a pass is the same idea in the live layer: the offense never chose, so ' +
    'your stake comes back untouched.'));
  return box;
}

/* ----------------------------------------------------------------- 2 SCORING */

function sScoring(data) {
  const box = document.createDocumentFragment();

  box.appendChild(lead('One correct pick is ' + points(DEFAULT_SCORING.pickPoints) +
    '. That is the whole straight game.'));
  box.appendChild(para('s6-p',
    'There is no confidence ranking, no weighting by spread and no bonus for an ' +
    'upset. Every game on the slate is worth the same as every other game, which ' +
    'is why the slate itself is the interesting decision and not the scoring.'));

  box.appendChild(el('p', 's6-sub-h', 'The parlay'));
  box.appendChild(para('s6-p',
    'One parlay a week, between ' + PARLAY_MIN_LEGS + ' and ' + PARLAY_MAX_LEGS +
    ' legs, and every leg is a pick you have already made — so a game is ' +
    'never picked twice and can never disagree with itself.'));
  box.appendChild(kv(ladderRows()));
  box.appendChild(para('s6-p',
    'All of it or nothing: one leg missing ends the parlay. Legs lock ' +
    'independently, at their own kickoffs, so a parlay can be half locked and ' +
    'still live.'));
  box.appendChild(para('s6-note',
    'These are this pool’s points, never odds. Nothing in the pool is priced.'));

  box.appendChild(el('p', 's6-sub-h', 'When a pick locks'));
  box.appendChild(para('s6-p',
    'Every pick is editable until that game kicks off, and locks at kickoff. One ' +
    'rule, per game, for everybody. There is no weekly deadline, no Sunday cutoff ' +
    'and nothing for a commissioner to configure.'));
  return box;
}

/* -------------------------------------------------------------------- 3 TIES */

function sTies(data) {
  const box = document.createDocumentFragment();

  box.appendChild(lead('One field: your predicted combined points in one named ' +
    'game of the week.'));
  box.appendChild(para('s6-p',
    'It is collected with your picks, before anybody knows whether a tie will ' +
    'happen. Closest to the real combined score takes the higher place. It is the ' +
    'same game for every pool, so a tie in a four-person pool and a tie in a ' +
    'forty-person pool break the same way.'));

  if (data && data.tiebreakGame) {
    const g = data.tiebreakGame;
    const row = el('div', 's6-game');
    row.appendChild(teamChip(g.away, { size: 22 }));
    row.appendChild(el('span', 's6-game-at', 'at'));
    row.appendChild(teamChip(g.home, { size: 22 }));
    const nm = el('span', 's6-game-name', (g.away.short || g.away.name) + ' at ' +
      (g.home.short || g.home.name));
    row.appendChild(nm);
    box.appendChild(el('p', 's6-sub-h', 'This week’s tiebreak game'));
    box.appendChild(row);
  }

  box.appendChild(el('p', 's6-sub-h', 'One field, not four'));
  box.appendChild(para('s6-p',
    'The national contests ask for a total on every one of four games and apply ' +
    'them in order. That is four number entries on a phone to settle something ' +
    'that usually does not happen. One is enough for a pool of eight, and one is ' +
    'what this asks for.'));
  box.appendChild(para('s6-p',
    'If the tiebreak game itself does not happen, the tiebreak did not happen ' +
    'either and level stands as level. The same rule as everything else.'));
  return box;
}

/* ------------------------------------------------------------------- 4 SCOPE */

function sScope(data) {
  const box = document.createDocumentFragment();

  box.appendChild(lead('Your commissioner chose the slate when the pool was made, ' +
    'and everybody in the pool picks that same slate.'));
  box.appendChild(bullets([
    SCOPE_LABEL.all + ' — a college week is well over a hundred games.',
    SCOPE_LABEL.top25 + ' — anything with a ranked team in it.',
    SCOPE_LABEL.ranked_v_ranked + ' — the short, loud list.',
    SCOPE_LABEL.conference + ' — the one everybody in the room argues about.',
    SCOPE_LABEL.handpick + ' — the commissioner names the games.'
  ]));
  box.appendChild(para('s6-p',
    'A ranked scope re-composes itself every week without anybody touching a ' +
    'setting, and the poll it reads is named on your pool — the two lists are ' +
    'not the same list.'));

  box.appendChild(el('p', 's6-sub-h', 'It locks, once'));
  box.appendChild(para('s6-p',
    'Scope can be changed until the first kickoff of week 1. After that it is ' +
    'fixed for the season, because a season leaderboard is only comparable if the ' +
    'rules held all season. A commissioner who wants a different slate makes a ' +
    'second pool.'));

  box.appendChild(el('p', 's6-sub-h', 'There is no personal slate'));
  box.appendChild(para('s6-p',
    'You cannot filter your own games down to the ones you care about. If two ' +
    'people in one pool picked different games the standings would not mean ' +
    'anything, and the standings are the entire point.'));
  box.appendChild(para('s6-note',
    'How the slate LOOKS is yours — compact or detailed, in Settings. Which ' +
    'games are on it is the pool’s.'));
  return box;
}

/* ------------------------------------------------------------------ 5 HALVES */

function sHalves(data) {
  const box = document.createDocumentFragment();

  box.appendChild(lead('No. The pool scores in points. The live layer stakes ' +
    'Marbles. The two never add up to anything.'));
  box.appendChild(kv([
    ['The pool', 'Points'],
    ['The live layer', 'Marbles']
  ]));
  box.appendChild(para('s6-p',
    'They are two boards. A good night calling snaps does not move you up the pool ' +
    'standings, and a perfect week of picks does not put a single Marble in your ' +
    'bank. Nothing in this app ever shows you one number made out of both.'));
  box.appendChild(para('s6-p',
    'They are the same app because they are the same Saturday — you pick in ' +
    'the morning and you watch in the afternoon. They are separate scores because ' +
    'a season is not a night, and adding a night to a season would flatter whoever ' +
    'watched the most television.'));
  return box;
}

/* ----------------------------------------------------------------- 6 MARBLES */

/* 🔴 THIS IS NOT S2'S `The balance` SECTION AND MUST NOT BECOME IT. That section
 * carries the legal position, once, on the settings screen where somebody would
 * look for it. This one answers the RULE OF PLAY and ends by pointing there. */
function sMarbles(data) {
  const box = document.createDocumentFragment();

  box.appendChild(lead('No. Nothing that affects play is for sale, at any price, ' +
    'ever.'));
  box.appendChild(bullets([
    'There is no store and no bundle. Marbles are obtained by calling a snap and ' +
      'in no other way.',
    'There is nothing to pay to keep playing, and no way to pay to play again ' +
      'sooner.',
    'No advantage, no early look and no extra pick is on offer for money.',
    'There is no prize and no cash. Nothing here can be turned into money in ' +
      'either direction.'
  ]));

  /* 🔴 THE UNIT IS ON THE FIGURE. A bare 200 beside a stake ladder reads as a
   * currency; "200 Marbles" is what tells a user, a reviewer and a store
   * questionnaire that it is not one. The word itself is read out of calls.ts -
   * there is exactly one word for the balance and this file does not get a vote. */
  box.appendChild(el('p', 's6-sub-h', 'The bank'));
  box.appendChild(kv([
    ['Your bank at every kickoff', HOUSE_RULES.startingBank + ' ' + BALANCE_NOUN],
    ['Stake on one call', orList(HOUSE_RULES.stakeLadder)]
  ]));
  box.appendChild(para('s6-p',
    'Every game starts you at the same number as everybody else, and it is set ' +
    'back there at the next kickoff. Run it down to nothing and you sit out the ' +
    'rest of that game — never the app, and never the next game. Nobody is ' +
    'eliminated from anything here.'));
  box.appendChild(para('s6-p',
    'The live board ranks on what you made, not on what you hold, so a deeper ' +
    'bench would be worth a longer night and nothing at all in the standings. ' +
    'That is why there is nothing to sell you.'));
  box.appendChild(para('s6-note',
    'Settings states the same position under The balance, beside the controls it ' +
    'applies to.'));
  return box;
}

/* ------------------------------------------------------------------- 7 PRICE */

function sPrice(data) {
  const box = document.createDocumentFragment();

  const cap = HOUSE_RULES.maxPayoutMultiple;
  const stake = HOUSE_RULES.stakeLadder[1] != null
    ? HOUSE_RULES.stakeLadder[1] : HOUSE_RULES.stakeLadder[0];

  box.appendChild(lead('The price is on the button before you tap it, never after.'));
  box.appendChild(para('s6-p',
    'Before each snap the model says how likely run and pass are, out of what this ' +
    'offense has actually done in this situation. The button shows what that is ' +
    'worth — your stake divided by that number, capped at ' + cap + '×.'));

  /* Both examples are COMPUTED by calls.ts payoutFor() and formatted by the same
   * payoutLabel() the tile uses. Nothing here is written down.
   *
   * The first version of this table labelled the rows "Stake 10 at 2.86×" while
   * the sentence above said "divided by that price", so the row named the PAYOUT
   * and the sentence named the PROBABILITY - two different numbers, one word.
   * Invisible in the test file, obvious the moment it was read at 393px. Both are
   * now on the row, in the order the user meets them. */
  box.appendChild(kv([
    ['Model says 35% · button reads ' + payoutLabel(0.35, cap),
      stake + ' returns ' + payoutFor(stake, 0.35, cap)],
    ['Model says 10% · button reads ' + payoutLabel(0.10, cap),
      stake + ' returns ' + payoutFor(stake, 0.10, cap)]
  ]));
  box.appendChild(para('s6-note',
    'The second row is where the cap bites: ' + stake + ' divided by a tenth is ' +
    (stake * 10) + ', and it pays ' + payoutFor(stake, 0.10, cap) + '. A model ' +
    'saying 10% is telling you its sample is thin, not offering you ten times your ' +
    'stake.'));

  box.appendChild(el('p', 's6-sub-h', 'How sure the model is'));
  box.appendChild(para('s6-p',
    'Every price carries one of three marks — high, middle or low. That is ' +
    'about how much football the model has seen for this situation, not about how ' +
    'far the price sits from even. A confident 51% and a guessed 95% are both ' +
    'things it is allowed to say, and it says which.'));

  box.appendChild(el('p', 's6-sub-h', 'One call a snap'));
  box.appendChild(para('s6-p',
    'One call per snap, once, for the life of the game. A second tap is refused ' +
    'rather than taken, and your stake leaves the bank once.'));
  return box;
}

/* ------------------------------------------------------------------- 8 DELAY */

function sDelay(data) {
  const box = document.createDocumentFragment();

  box.appendChild(lead('Because your television is behind, and this app is built ' +
    'to be behind with it.'));
  box.appendChild(para('s6-p',
    'You set a delay once and everything is held to it — every play, every ' +
    'price, every board and every alert. Nothing reaches you before the picture ' +
    'you are watching gets there.'));
  box.appendChild(para('s6-p',
    'That is the whole reason this exists. A live app that runs ahead of a stream ' +
    'tells you the touchdown before you see it, and once that has happened once ' +
    'you stop trusting your phone for the rest of the game.'));

  box.appendChild(el('p', 's6-sub-h', 'Alerts follow the same delay'));
  box.appendChild(para('s6-p',
    'An alert either waits out your delay, or it carries no state at all. Nothing ' +
    'ever arrives on your phone with a score in it that you have not seen yet.'));
  box.appendChild(para('s6-note',
    'The slider is in Settings and it can be moved mid-game.'));
  return box;
}

/* --------------------------------------------------------------------- 9 AGE */

function sAge(data) {
  const box = document.createDocumentFragment();

  box.appendChild(lead('Any Given is rated 18+ and we answer that question ' +
    'honestly on the store questionnaire.'));
  box.appendChild(para('s6-p',
    'The rating is a rating. It is not a door: there is no date of birth field, ' +
    'no account wall and nothing standing in front of the slate. The first thing ' +
    'you see is the games.'));

  box.appendChild(el('p', 's6-sub-h', 'It is not a contest'));
  box.appendChild(bullets([
    'No entry fee.',
    'No prize.',
    'No cash, and no way to make any.',
    'Nothing of value is at stake in either half.'
  ]));
  box.appendChild(para('s6-p',
    'The pool scores points and the live layer stakes Marbles, and neither one ' +
    'crosses into money in either direction. The rating is there because the ' +
    'subject matter is sports prediction, not because there is something to win.'));
  return box;
}

/* -------------------------------------------------------------- preview data */

/**
 * The RULES are constant and need no data. What arrives here is only this pool's
 * own settings and the named tiebreak game, which is the one thing on the screen
 * that can fail to load - and therefore the only reason this screen has a
 * loading, an offline and an error state at all.
 *
 * @returns {{pool: object|null, tiebreakGame: object|null, lastSync: number}}
 */
export async function previewData(fixtures, state) {
  let tiebreakGame = null;
  try {
    const g = await fixtures.load('real-utep-at-ou');
    const c = g.header.competitions[0];
    const home = c.competitors.find(function (x) { return x.homeAway === 'home'; });
    const away = c.competitors.find(function (x) { return x.homeAway === 'away'; });
    tiebreakGame = {
      id: c.id,
      kickoffUtc: Date.parse(c.date),
      home: fixtures.teams.teams[home.team.id],
      away: fixtures.teams.teams[away.team.id]
    };
  } catch (e) {
    tiebreakGame = null;  /* a fixture that will not load is a state, not a crash */
  }

  /* 🔴 STUB, and named as one in the return. There is no captured pool anywhere
   * in fixtures/ - `Pool` in src/lib/types.ts is a shape with no instance on
   * disk. Everything below is a plausible pool, not a real one. The teams inside
   * the tiebreak row above ARE real; this envelope is not. */
  const pool = {
    id: 'K7RTQZ',
    name: 'Thursday Night Regulars',
    scope: 'top25',
    scopeArg: null,
    rankingSource: 'ap',
    ats: false,
    memberCount: 9,
    scopeLockedAt: Date.now() - 86400000 * 7
  };

  return { pool: pool, tiebreakGame: tiebreakGame, lastSync: Date.now() - 62000 };
}

/* -------------------------------------------------------------- the assembly */

/** The one-line void rule, in its own frame, directly under the title. It is not
 *  repeated further down: this IS section 1, and the index's first row scrolls
 *  here. A rule stated twice on one screen is a rule a reader has to check. */
function voidBanner() {
  const b = el('div', 's6-void');
  b.appendChild(el('p', 's6-eyebrow', 'The rule everything else hangs on'));
  b.appendChild(el('p', 's6-void-line',
    'A push, a cancellation and a postponement all resolve to the same thing: ' +
    'the game did not happen, for everybody.'));
  return b;
}

/** The index. This is the screen's design: the only person who opens a rules
 *  screen arrived with one question, so the first thing they get is a list of
 *  questions rather than the beginning of an essay. */
function indexBlock(onPick) {
  const nav = el('nav', 's6-index');
  nav.setAttribute('aria-label', 'Find an answer');
  nav.appendChild(el('p', 's6-eyebrow', 'Find an answer'));
  SECTIONS.forEach(function (s) {
    const a = el('a', 's6-ix');
    a.href = '#' + s.id;
    a.appendChild(el('span', 's6-ix-q', s.q));
    a.appendChild(chevron());
    if (onPick) {
      a.addEventListener('click', function (ev) { onPick(ev, s.id); });
    }
    nav.appendChild(a);
  });
  return nav;
}

/** One rule as a card.
 *  `opts.bannerAbove`  the void sentence is already on screen above this card,
 *                      so the void card does not print a second copy.
 *  `opts.hideHeading`  the page title already IS this card's heading. Found by
 *                      looking at /section at 393px: "When a game does not
 *                      happen" was the h1 and then the h2 immediately under it,
 *                      which reads as two documents rather than one answer. */
function sectionCard(s, data, opts) {
  opts = opts || {};
  const c = el('section', 'card s6-sec');
  c.id = s.id;
  if (opts.hideHeading) {
    c.setAttribute('aria-label', s.h);
  } else {
    c.setAttribute('aria-labelledby', s.id + '-h');
    const h = el('h2', 's6-h', s.h);
    h.id = s.id + '-h';
    c.appendChild(h);
  }
  c.appendChild(s.build(data, opts));
  return c;
}

/** This pool's own settings. The ONLY data on the screen, and the only thing that
 *  can be absent. Everything else here is true in every pool. */
function poolCard(data, opts) {
  opts = opts || {};
  const pool = data && data.pool;
  if (!pool) return null;
  const c = el('section', 'card s6-pool');
  c.appendChild(el('p', 's6-eyebrow', opts.stale ? 'Your pool, as of your last connection' : 'Your pool'));
  c.appendChild(el('p', 's6-pool-name', pool.name));
  const rows = [
    ['Slate', SCOPE_LABEL[pool.scope] || pool.scope],
    ['Picks', pool.ats ? 'Against the spread' : 'Straight up'],
    ['Members', String(pool.memberCount)]
  ];
  if (pool.scope === 'top25' || pool.scope === 'ranked_v_ranked') {
    rows.splice(1, 0, ['Ranked from', RANKING_LABEL[pool.rankingSource] || 'unnamed']);
  }
  c.appendChild(kv(rows));
  c.appendChild(para('s6-note',
    'Everything below is the same in every pool. Only this card changes.'));
  return c;
}

/** The whole ruleset. Used by ready, offline, loading and error alike - because
 *  rules are not live data and there is no state in which they are unavailable. */
function allRules(root, data) {
  root.appendChild(indexBlock(null));
  /* bannerAbove: the void line is printed once, in the banner under the title. */
  SECTIONS.forEach(function (s) {
    root.appendChild(sectionCard(s, data, { bannerAbove: true }));
  });
}

/* -------------------------------------------------------------------- render */

/**
 * @param {HTMLElement} root
 * @param {object} data   from previewData
 * @param {string} state  one of `states`
 */
export function render(root, data, state) {
  root.innerHTML = '';
  root.classList.add('scr-s6-rules');

  const style = document.createElement('style');
  style.textContent = [TEAM_CHIP_CSS, STATES_CSS].join('\n');
  root.appendChild(style);

  /* 🔴 A HASH CHANGE MUST RE-RENDER, and it did not.
   *
   * Found in the browser and by nothing else: on the /section route the "other
   * rules" list is nine same-document links, so tapping one changes the fragment
   * WITHOUT reloading, the module never runs again, and the screen sits there
   * showing the rule you were already on. A rules screen whose own links do
   * nothing is worse than one with no links.
   *
   * The listener is attached once per root, and it is removed by the harness
   * along with everything else when the container is emptied - `render` clears
   * root.innerHTML, so a second attach would leak a listener per navigation. */
  if (state === 'section' && !render._hashBound) {
    render._hashBound = true;
    window.addEventListener('hashchange', function () {
      const live = document.querySelector('.scr-s6-rules');
      if (!live) return;
      render(live, data, 'section');
      /* Back to the top: the new answer's title is the thing to land on, and the
       * browser has already jumped to wherever the old anchor was. */
      window.scrollTo(0, 0);
    });
  }

  /* ---- the deep link ---- */
  if (state === 'section') {
    const want = (typeof location !== 'undefined' && location.hash)
      ? location.hash.slice(1) : '';
    const s = SECTIONS.find(function (x) { return x.id === want; }) || SECTIONS[0];

    const back = el('a', 's6-back', '←  All rules');
    back.href = '#';
    root.appendChild(back);
    root.appendChild(el('h1', 's6-title', s.h));
    /* A deep link arrives from somewhere - a voided pick, a locked row, a settled
     * call - so it says which question it is answering rather than dropping a
     * reader into the middle of a document. */
    root.appendChild(el('p', 's6-sub', s.q));
    root.appendChild(sectionCard(s, data, { hideHeading: true }));

    const rest = el('nav', 's6-index');
    rest.setAttribute('aria-label', 'The other rules');
    rest.appendChild(el('p', 's6-eyebrow', 'The other rules'));
    SECTIONS.filter(function (x) { return x.id !== s.id; }).forEach(function (x) {
      const a = el('a', 's6-ix');
      a.href = '#' + x.id;
      a.appendChild(el('span', 's6-ix-q', x.q));
      a.appendChild(chevron());
      rest.appendChild(a);
    });
    root.appendChild(rest);
    return;
  }

  root.appendChild(el('h1', 's6-title', 'How Any Given works'));
  root.appendChild(el('p', 's6-sub',
    'Every rule in the app, in one place. None of it changes from pool to pool.'));

  /* 🔴 THE VOID LINE IS ABOVE EVERYTHING, IN EVERY STATE, INCLUDING THE BROKEN
   * ONES. It is not data and it cannot fail to load. */
  root.appendChild(voidBanner());

  if (state === 'loading') {
    root.appendChild(stateBlock('loading', {
      rows: 2,
      body: 'Reading your pool’s own settings. The rules below do not need them.'
    }));
    allRules(root, data);
    return;
  }

  if (state === 'error') {
    root.appendChild(stateBlock('error', {
      title: 'Your pool’s settings did not load',
      body: 'That is the only thing missing. Every rule below is the same in every ' +
            'pool, so none of it depends on a connection.',
      action: { label: 'Try again' }
    }));
    allRules(root, data);
    return;
  }

  if (state === 'offline') {
    root.appendChild(stateBlock('offline', {
      title: 'You are offline',
      body: 'The rules are part of the app, not something it fetches, so all of ' +
            'this still works. Your pool’s own settings are shown as they were.',
      since: data && data.lastSync,
      action: { label: 'Try again' }
    }));
    const pc = poolCard(data, { stale: true });
    if (pc) root.appendChild(pc);
    allRules(root, data);
    return;
  }

  const pc = poolCard(data);
  if (pc) root.appendChild(pc);
  allRules(root, data);
}
