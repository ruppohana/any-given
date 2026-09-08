/* L7 - RESULT AND SETTLEMENT. A call resolved. The bank moved.
 *
 * THE BAR IS A COUNTER-EXAMPLE, and both files were opened:
 *   reference/armchair-quarterback-teardown/screens/AQB-result-way-to-pick-it.png
 *     A full-bleed green banner across the top of the board - WAY TO PICK IT! /
 *     YOU'VE EARNED 220 POINTS! - with the winning tile of the six recolored the
 *     same green. No balance anywhere. No stake. No price on any tile: the 220 is
 *     the FIRST number in the whole interaction. No play, no player, no clock.
 *   reference/armchair-quarterback-teardown/screens/AQB-result-50-points-run-pass-binary.png
 *     The identical banner over the two-tile RUN/PASS binary, YOU'VE EARNED 50
 *     POINTS!, PASS recolored green. So the reward is a function of how many tiles
 *     you were choosing between, not of what the offense was likely to do.
 *
 * AND WHAT IS NOT IN EITHER FILE: any counterpart on a miss. There is no red
 * banner, no "you missed", nothing. The component exists only in the win case.
 * That asymmetry is COUNTER-POSITIONING row 5 and it is what this screen is
 * defined against.
 *
 * SO: ONE COMPONENT, TWO SIGNS. `landed` and `missed` are the same DOM produced by
 * the same function in the same order. Nothing branches on the verdict except a
 * data attribute, a word, and the sign of a number. There is no celebration to
 * withhold, because there is no celebration.
 *
 * THE SUBJECT IS THE BANK, not the verdict. The largest type on the screen is the
 * balance; the verdict is an 11px chip. --up / --down, fixed scale, never team
 * color - the team colors on this screen belong to the player who settled it.
 *
 * A VOID IS A THIRD OUTCOME AND IT IS NOT A LOSS. calls.ts returns the stake; this
 * screen says so out loud rather than showing a zero that reads like a miss.
 *
 * 7.2 THE STAR IS THE PARSER'S. `play.star` is read and nothing else is. The
 * parenthesized group at the end of every one of these play texts is the TACKLER -
 * S.Bowser on the missed snap, K.Miles elsewhere, A.Coker on the penalty - and it
 * never reaches the screen.
 */
import { teamChip } from '../components/team-chip.js';
import { stateBlock, STATES_CSS } from '../components/states.js';
import { signed, signClass, dash, payoutLabel } from '../components/fmt.js';

export const id = 'l7-result';
export const title = 'Result - a call settled, the bank moved';
export const bar = 'reference/armchair-quarterback-teardown/screens/AQB-result-way-to-pick-it.png';

/** `landed` and `missed` are deliberately adjacent so they can be opened side by
 *  side and compared. They are the same component. */
export const states = ['landed', 'missed', 'void', 'settling', 'loading', 'offline', 'error'];

/** CONTRACT 6. The word for the balance. There is no other one. */
export const BALANCE_NOUN = 'Marbles';

/* -------------------------------------------------------------------------
 * PREVIEW DATA - REAL, AND NOT COMPUTED HERE.
 *
 * This screen does NO arithmetic. It does not settle, it does not pay out, it
 * does not price. CONTRACT 4: data arrives already shaped. In the app that
 * shaping is `src/lib/calls.ts` inside GameRoom.
 *
 * The preview harness cannot do it, and the reason is structural rather than
 * lazy: `parse.ts` and `calls.ts` are TypeScript, `tools/preview.mjs` serves
 * unknown extensions as application/octet-stream, and a browser will not execute
 * either one. So the harness can hand a screen the RAW ESPN summary and nothing
 * derived from it - and the raw summary contains no star, because ESPN's play
 * objects carry `teamParticipants` and no athletes at all.
 *
 * The three snapshots below are therefore the VERBATIM OUTPUT of the real modules
 * on the real fixture, carried across that gap rather than invented:
 *
 *   fixtures/real-utep-at-ou-260905-final.json
 *     -> parsePlays()                       the plays, and the stars
 *     -> openLedger/accept/lock/settle()    the calls, the payouts, the bank
 *
 * The replay that produced them, stated so it can be re-run:
 *   open a ledger at the house 100; walk the parsed plays in order; on every
 *   Oklahoma snap that is a run, a pass or a penalty, once that offense has at
 *   least 12 prior run-or-pass snaps in this game, call PASS for 10 Marbles at
 *   p = that offense's prior pass share in this game, rounded to 3dp; lock; settle
 *   against the play's own type.
 *
 * tests/l7-result.test.mjs RE-DERIVES ALL OF IT and fails on any drift. If
 * parse.ts or calls.ts changes, this block goes red. It is a transport, not a
 * fixture, and it is named as a stub in the return.
 * ------------------------------------------------------------------------- */

export const REPLAY = {
  fixture: 'real-utep-at-ou',
  gameId: '401856664',
  offenseId: '201',
  defenseId: '2638',
  startingBank: 200,
  stake: 10,
  side: 'pass',
  minPriorSnaps: 12,
};

export const PREVIEW = {
  landed: {
    play: {
      id: '401856664385', driveId: '40185666418', quarter: 3, clock: '11:47',
      down: 2, distance: 10, yardsToGoal: 34, offenseTeamId: '201',
      text: '(11:54) #10 J.Mateer pass complete deep middle to #1 I.Sategna III caught at UTEP07, for 34 yards to the UTEP00 TOUCHDOWN, clock 11:47, 1ST DOWN #29 T.Sandell kick attempt good (H: #87 J.Ulrich, LS: #50 B.Anderson)',
      yards: 34,
      star: { name: 'I.Sategna III', jersey: '1', teamId: '201', role: 'receiver' },
      type: 'pass',
    },
    call: { snapId: '401856664385', side: 'pass', stake: 10, p: 0.406, state: 'settled', landed: true, delta: 15 },
    returned: 25,
    bank: { balance: 312, start: 200, delta: 112, record: { landed: 11, missed: 10 }, streak: 1 },
    voided: 2,
  },
  missed: {
    play: {
      id: '401856664381', driveId: '40185666418', quarter: 3, clock: '12:27',
      down: 1, distance: 10, yardsToGoal: 34, offenseTeamId: '201',
      text: '(12:32) Shotgun #9 L.Avant rush left for 0 yards to the UTEP34 (#3 S.Bowser), out of bounds',
      yards: 0,
      star: { name: 'L.Avant', jersey: '9', teamId: '201', role: 'carrier' },
      type: 'run',
    },
    call: { snapId: '401856664381', side: 'pass', stake: 10, p: 0.419, state: 'settled', landed: false, delta: -10 },
    returned: 0,
    bank: { balance: 297, start: 200, delta: 97, record: { landed: 10, missed: 10 }, streak: 0 },
    voided: 2,
  },
  void: {
    play: {
      id: '401856664295', driveId: '40185666413', quarter: 2, clock: '2:01',
      down: 2, distance: 9, yardsToGoal: 9, offenseTeamId: '201',
      text: 'PENALTY UTEP Offside (#90 A.Coker) 5 yards from UTEP09 to UTEP04. NO PLAY',
      yards: 5,
      /* 7.2 LIVE, IN THE ONE CASE THAT PROVES IT. The parser emitted null here.
       * The only name in this text is inside the parentheses, and it is the
       * penalized player - the naive rule would have put A.Coker on the card as
       * the man who settled the snap. He is not on this screen. */
      star: null,
      type: 'penalty',
    },
    call: { snapId: '401856664295', side: 'pass', stake: 10, p: 0.379, state: 'settled', landed: null, delta: 0 },
    returned: 10,
    bank: { balance: 276, start: 200, delta: 76, record: { landed: 8, missed: 9 }, streak: 0 },
    voided: 1,
  },
  /* The same snap as `landed`, one moment earlier: the stake has left the bank,
   * the ball is in the air, nothing is known. */
  settling: {
    play: null,
    call: { snapId: '401856664385', side: 'pass', stake: 10, p: 0.406, state: 'locked', landed: null, delta: null },
    returned: null,
    bank: { balance: 287, start: 200, delta: 87, record: { landed: 10, missed: 10 }, streak: 0 },
    voided: 2,
  },
};

/**
 * Shape one snapshot into what `render` draws. Pure, exported, and tested in
 * node - this is where the symmetry lives, because `landed`, `missed` and `void`
 * all come out of it with the same keys in the same order.
 */
export function resultView(snap, state, teams) {
  const call = snap.call;
  const play = snap.play || null;
  const settled = call.state === 'settled';
  const verdict = !settled ? 'settling' : call.landed === true ? 'landed'
                : call.landed === false ? 'missed' : 'void';
  const lookup = (tid) => (teams && teams[tid]) || null;
  return {
    state,
    verdict,
    /* THE SIGN, AND IT IS THE ONLY THING THE VERDICT CHANGES ABOUT THE SHAPE. */
    sign: signClass(call.delta == null ? 0 : call.delta),
    word: VERDICT_WORD[verdict],
    say: VERDICT_SAY[verdict],
    call,
    play,
    returned: snap.returned,
    bank: snap.bank,
    voided: snap.voided,
    offense: lookup(play ? play.offenseTeamId : REPLAY.offenseId),
    defense: lookup(REPLAY.defenseId),
    starTeam: play && play.star ? lookup(play.star.teamId) : null,
  };
}

const VERDICT_WORD = { landed: 'Landed', missed: 'Missed', void: 'Void', settling: 'Open' };

/* One sentence each, written to the same length and the same register. A win does
 * not get an exclamation mark the miss is denied. */
const VERDICT_SAY = {
  landed: 'You read the offense. The stake and the return are in the bank.',
  missed: 'The offense went the other way. The stake stayed out.',
  void: 'The play did not happen, so the snap was nobody’s to read. Your stake came back.',
  settling: 'The ball is snapped. The stake is out until the play is over.',
};

const ROLE_WORD = {
  carrier: 'carried it', passer: 'threw it', receiver: 'caught it',
  kicker: 'kicked it', returner: 'returned it', interceptor: 'intercepted it',
};

export async function previewData(fixtures, state) {
  const teams = fixtures.teams.teams;
  const key = PREVIEW[state] ? state : 'landed';
  return { snap: PREVIEW[key], teams, forState: key };
}

/* -------------------------------------------------------------------------- */

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function pct(p) {
  if (p == null) return '—';
  return (Math.round(p * 1000) / 10).toFixed(1) + '%';
}

/**
 * THE COMPONENT. Every settled state - landed, missed, void - is drawn by this
 * one function, in this one order, with no branch that adds or removes an
 * element. Compare /l7-result/landed and /l7-result/missed at 393px: same nodes,
 * same classes, same sequence. Only `data-verdict`, `data-sign`, three words and
 * four numbers differ.
 */
function resultCard(v) {
  const wrap = el('div', 'l7-wrap');
  wrap.dataset.verdict = v.verdict;
  wrap.dataset.sign = v.sign || 'flat';

  /* ---- 1. THE BANK. The subject, and the largest type in the app. ---- */
  const bank = el('section', 'card l7-bank');
  bank.setAttribute('aria-label', 'Your bank');

  const top = el('div', 'l7-bank-top');
  const bal = el('div', 'l7-balance num', String(v.bank.balance));
  const unit = el('span', 'l7-unit', BALANCE_NOUN);
  bal.appendChild(unit);
  const move = el('div', 'l7-move num ' + (v.sign || ''),
    v.call.delta == null ? '—' : signed(v.call.delta));
  move.setAttribute('aria-label', 'this call moved the bank by ' + (v.call.delta == null ? 'nothing yet' : v.call.delta));
  const moveNote = el('span', 'l7-move-note', 'on this call');
  move.appendChild(moveNote);
  top.append(bal, move);
  bank.appendChild(top);

  /* The verdict is a chip, not a banner, and it is the same chip in all three
   * outcomes. The counter-example gives a win the whole top of the screen and
   * gives a miss nothing at all. */
  const chip = el('div', 'l7-verdict', v.word);
  bank.appendChild(chip);

  const pos = el('p', 'l7-position num');
  pos.textContent = 'Started at ' + v.bank.start + ' · ' + signed(v.bank.delta)
    + ' tonight · ' + v.bank.record.landed + ' landed, ' + v.bank.record.missed
    + ' missed, ' + v.voided + ' void · streak ' + v.bank.streak;
  bank.appendChild(pos);
  wrap.appendChild(bank);

  /* ---- 2. THE ONE CARD: the settled call AND the player who settled it. ----
   * Not two cards and not a list. A sportsbook settles into a history; this
   * settles into the play. */
  const card = el('section', 'card l7-call');
  card.setAttribute('aria-label', 'The call and the play that settled it');

  const head = el('div', 'l7-head');
  head.append(el('span', 'l7-side', v.call.side.toUpperCase()));
  head.append(el('span', 'l7-say', v.say));
  card.appendChild(head);

  /* THE PRICE, AND THAT IT WAS LOCKED AT THE TAP. The counter-example shows no
   * number until this screen; here the number was on the tile and this line says
   * the one it was. */
  const terms = el('dl', 'l7-terms num');
  const term = (k, val, cls) => {
    terms.append(el('dt', 'l7-t', k));
    terms.append(el('dd', 'l7-d ' + (cls || ''), val));
  };
  term('Staked', String(v.call.stake));
  term('Locked at', pct(v.call.p) + ' · ' + payoutLabel(v.call.p));
  /* The whole verdict in one row: what you called against what the offense did.
   * Identical in every outcome - only the right-hand word changes. */
  term('The offense', v.play ? (v.play.type === 'run' || v.play.type === 'pass'
    ? v.play.type.toUpperCase() : 'NO PLAY') : '—');
  term('Returned', v.returned == null ? '—' : String(v.returned));
  card.appendChild(terms);

  const play = el('div', 'l7-play');
  if (v.play) {
    const meta = el('p', 'l7-meta num');
    meta.textContent = 'Q' + v.play.quarter + ' · ' + v.play.clock + ' · '
      + downText(v.play) + ' · ' + v.play.yards + ' yds';
    play.appendChild(meta);

    /* 7.2. play.star and nothing else. The name in the parentheses at the end of
     * this text is the tackler and is never read. */
    const star = el('div', 'l7-star');
    if (v.play.star) {
      if (v.starTeam) star.appendChild(teamChip(v.starTeam, { withAbbrev: false, size: 20 }));
      const nm = el('span', 'l7-star-name');
      nm.textContent = v.play.star.name;
      const jn = el('span', 'l7-jersey num', v.play.star.jersey ? '#' + v.play.star.jersey : '—');
      const rl = el('span', 'l7-role', ROLE_WORD[v.play.star.role] || v.play.star.role);
      star.append(nm, jn, rl);
    } else {
      /* A DEFINED STATE, not a hole. 18 of the 158 real plays in this fixture
       * have no star, and the void snap is one of them. */
      star.dataset.empty = 'true';
      star.appendChild(el('span', 'l7-star-none', 'No player — the snap was blown dead'));
    }
    play.appendChild(star);

    const txt = el('p', 'l7-text', v.play.text);
    play.appendChild(txt);
  } else {
    play.dataset.pending = 'true';
    play.appendChild(el('p', 'l7-meta', 'Waiting on the play'));
    play.appendChild(el('div', 'l7-skeleton'));
  }
  card.appendChild(play);
  wrap.appendChild(card);

  /* ---- 3. NOBODY IS ELIMINATED, and it is said on the screen where a bank at
   * zero would first be believed. No word here is a currency word. ---- */
  const foot = el('p', 'l7-foot');
  foot.textContent = v.bank.balance < 5
    ? 'Nothing left to stake in this game. Your bank goes back to ' + v.bank.start
      + ' at the next kickoff and you are still in the pool.'
    : 'Every game starts at ' + v.bank.start + ' ' + BALANCE_NOUN
      + '. The next one starts there too.';
  wrap.appendChild(foot);

  return wrap;
}

function downText(p) {
  if (p.down == null) return dash(null);
  const o = ['', '1st', '2nd', '3rd', '4th'][p.down] || String(p.down);
  return o + ' & ' + dash(p.distance);
}

export function render(root, data, state) {
  root.innerHTML = '';
  root.classList.add('scr-l7-result');

  const style = document.createElement('style');
  style.textContent = STATES_CSS;
  root.appendChild(style);

  /* Not state-aware between landed and missed - only between settled and not. */
  const h = el('h1', 'l7-h', state === 'settling' ? 'The call is live' : 'The call settled');
  root.appendChild(h);

  if (state === 'loading') {
    root.appendChild(stateBlock('loading', { rows: 3, body: 'Settling the snap…' }));
    return;
  }

  /* OFFLINE AND ERROR HOLD THE CARD, THEY DO NOT REPLACE IT. Same argument as the
   * broadcast delay: the settlement already happened in the ledger and the
   * Marbles are already in the bank, so hiding it behind a spinner would be the
   * app lying about what it knows. The strip goes ABOVE, the card stays legible. */
  if (state === 'offline') {
    root.appendChild(stateBlock('offline', {
      title: 'The connection dropped',
      body: 'This call is settled and the ' + BALANCE_NOUN
        + ' are in the bank. What you see below is final; the next snap is not coming until this reconnects.',
      since: Date.now() - 47000,
      action: { label: 'Try again' },
    }));
  } else if (state === 'error') {
    root.appendChild(stateBlock('error', {
      title: 'The next snap did not load',
      body: 'The settlement below already happened and nothing about it is at risk.',
      action: { label: 'Reload' },
    }));
  }

  /* loading / offline / error are not outcomes, so they carry the last settled
   * snapshot rather than an outcome of their own. */
  const key = PREVIEW[state] ? state
    : (data && PREVIEW[data.forState] ? data.forState : 'landed');
  const snap = (data && data.snap) || PREVIEW[key];
  const teams = (data && data.teams) || null;
  root.appendChild(resultCard(resultView(snap, state, teams)));

  /* MOTION. Nothing in this project specifies any, so this screen chose it and
   * says so: ONE animation, 220ms, cubic-bezier(.2,.7,.3,1), on the two things
   * DESIGN-BRIEF section 9 names - the call settling and the balance moving. It is
   * MIRRORED, not different: a gain rises into place, a loss falls into place,
   * same distance, same duration, same curve. A void does not travel, because the
   * bank did not move. Nothing else on the screen animates, and in particular
   * there is no flash, pulse or confetti on a win - a celebration is motion the
   * miss would not be given, which is the failure this screen exists to avoid.
   * tokens.css already suppresses it under prefers-reduced-motion: reduce. */
  root.dataset.motion = 'on';
}
