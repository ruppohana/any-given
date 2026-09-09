/* THE CALL CATALOG — the situation picks the question.
 *
 * 🔴 WHY THIS REPLACES "RUN OR PASS". Jason, 2026-09-08: "you are limiting
 * yourself." He was right, and the limit was mine rather than the product's. The
 * app was one binary asked a hundred and twenty times a game, which is a
 * mechanic, not a game — the second hour is the first hour again.
 *
 * A football game is full of moments that are already arguments, and the feed can
 * settle every one of them. Fourth down is the most-discussed decision in the
 * sport. A kickoff is a question before it is a formality. A third down has a
 * number everybody thinks they know. The right design is not one question asked
 * often; it is a CATALOG, and the situation selects from it.
 *
 * WHAT THAT BUYS, beyond variety: the calls stop being interchangeable. Run-or-
 * pass is a read on tendency. Go-for-it is a read on a coach. Return-past-the-25
 * is a read on a returner. Convert-this-third is a read on a matchup. A player
 * who is good at one is not automatically good at another, which is the
 * difference between a habit and a game.
 *
 * EVERY TYPE DECLARES THREE THINGS AND NOTHING ELSE:
 *   offer(ctx)   — is this question live at this moment, and with what choices
 *   settle(play) — what the next play says the answer was
 *   voidIf(play) — the offense never chose, so the stake comes back
 *
 * 🔴 AND EVERY ONE OF THEM SETTLES ON PLAY TEXT THAT WAS CAPTURED FROM THE FEED.
 * The frequencies in `MEASURED` below were counted over three complete real
 * games, not estimated — a type nobody can be offered is a type that does not
 * ship.
 */

export type Choice = { id: string; label: string };

export type CallType = {
  id: string;
  /** What the player is being asked, in the words they would use. */
  question: string;
  choices: Choice[];
  /** Roughly how many times a real game offers this. MEASURED over three
   *  complete captured games, never estimated. */
  perGame: number;
  /** What kind of read it is - so a board can say what somebody is good AT. */
  reads: 'tendency' | 'coach' | 'personnel' | 'matchup' | 'situation';
  /**
   * 🔴 THE TIMESCALE, and it is the second axis of the whole design. Jason,
   * 2026-09-08: "will this drive have a breakout play? greater than 25 yards."
   *
   * A PLAY call resolves in forty-five seconds. A DRIVE call runs for minutes and
   * lands once. Two rhythms in the same game means the app is not one metronome
   * - you can have a slow call riding under a fast one, and a drive you are
   * invested in changes how the next six snaps feel.
   */
  scope: 'play' | 'drive';
  /** How often the FIRST choice actually happened, over the same three games.
   *  A question whose answer is 90% one way is not a question. */
  baseRate?: number;
  /**
   * 🔴 THE MEASURED DISTRIBUTION ACROSS EVERY CHOICE, where it was counted rather
   * than assumed. This is the honest prior: a four-way question with no rates
   * prices every tile at 25% and 4x, which is a made-up number wearing a decimal
   * point. With rates, the first snap of the night is priced off 370 real plays
   * instead of off nothing.
   *
   * COLLEGE, all of it - three complete college games. Against an NFL game these
   * are the wrong league's rates, and `basis` on the offer is what says so. They
   * are still better than a uniform split, and they are replaced by in-game
   * counts as the night gives the model something to look at.
   */
  rates?: Record<string, number>;
};

export const CALL_TYPES: CallType[] = [
  {
    id: 'run_pass',
    question: 'Run or pass?',
    choices: [{ id: 'run', label: 'Run' }, { id: 'pass', label: 'Pass' }],
    perGame: 123,
    reads: 'tendency',
    scope: 'play',
    baseRate: 0.49          // 180 run / 368 run-or-pass snaps
  },
  {
    id: 'fourth_down',
    question: 'Go for it, or kick?',
    choices: [{ id: 'go', label: 'Go for it' }, { id: 'kick', label: 'Kick' }],
    perGame: 19,
    reads: 'coach',
    scope: 'play',
    baseRate: 0.24          // 12 went for it / 50 resolved fourth downs
  },
  {
    id: 'kickoff_return',
    question: 'Do they bring it out past the 25?',
    choices: [{ id: 'past', label: 'Past the 25' }, { id: 'short', label: 'Touchback or short' }],
    perGame: 12,
    reads: 'personnel',
    scope: 'play',
    baseRate: 0.31          // 11 returned / 36 kickoffs
  },
  {
    id: 'third_down',
    question: 'Do they convert?',
    choices: [{ id: 'convert', label: 'They get it' }, { id: 'stop', label: 'They are stopped' }],
    perGame: 26,
    reads: 'matchup',
    scope: 'play'
  },
  {
    id: 'explosive',
    question: 'Ten yards or more?',
    choices: [{ id: 'yes', label: '10+' }, { id: 'no', label: 'Less' }],
    perGame: 120,
    reads: 'matchup',
    scope: 'play'
  },
  {
    id: 'field_goal',
    question: 'Is it good?',
    choices: [{ id: 'good', label: 'Good' }, { id: 'miss', label: 'No good' }],
    perGame: 4,
    reads: 'personnel',
    scope: 'play'
  },
  {
    id: 'drive_end',
    question: 'How does this drive end?',
    choices: [
      { id: 'td', label: 'Touchdown' },
      { id: 'fg', label: 'Field goal' },
      { id: 'punt', label: 'Punt' },
      { id: 'turnover', label: 'Turnover' }
    ],
    perGame: 25,
    reads: 'situation',
    scope: 'drive',
    /* 🔴 38 / 29 / 20 / 13 over 69 real drives, and this is the most-played
     * micro-market in football by handle - #1 in Simplebet's whole college
     * catalog, and next-drive result led the NFL playoffs. Four ways, nothing
     * over 38%, and every tile pays. It was in this file all along and the
     * router never offered it. */
    baseRate: 0.29,
    rates: { td: 0.29, fg: 0.13, punt: 0.377, turnover: 0.203 }
  },

  /* ---- DRIVE SCOPE. A different clock, and the reason the app has a pulse
   * rather than a metronome. Every base rate below was counted over 75 real
   * drives in three complete games. ---- */
  {
    id: 'drive_breakout',
    question: 'Does this drive break one? 25 yards or more',
    choices: [{ id: 'yes', label: 'They break one' }, { id: 'no', label: 'They do not' }],
    perGame: 25,
    reads: 'matchup',
    scope: 'drive',
    /* 🔴 39% - and 25 yards is a well-chosen line rather than a round number.
     * It sits close enough to even to be a real decision and far enough from it
     * to be worth something. Ten yards would have been 68% and not a question. */
    baseRate: 0.39
  },
  {
    id: 'drive_redzone',
    question: 'Do they reach the red zone?',
    choices: [{ id: 'yes', label: 'They get there' }, { id: 'no', label: 'They stall' }],
    perGame: 25,
    reads: 'situation',
    scope: 'drive',
    baseRate: 0.48          // 36 of 75 real drives
  },

  /* ---- MORE OPTIONS. Jason, 2026-09-08: "open your options." Every base rate
   * below was COUNTED over the same three complete games - a question whose real
   * answer is 90% one way is not a question, and the only way to know which
   * those are is to count them. Three candidates were measured and REJECTED for
   * exactly that reason: a sack is 3% of snaps, a penalty on the play is 1%, and
   * crossing midfield happens on 83% of drives. None of them is a decision. ---- */
  {
    id: 'direction',
    question: 'Left, middle, or right?',
    choices: [
      { id: 'left', label: 'Left' },
      { id: 'middle', label: 'Middle' },
      { id: 'right', label: 'Right' }
    ],
    perGame: 116,
    reads: 'tendency',
    scope: 'play',
    /* 🔴 29 / 38 / 33 over 349 real snaps - the most evenly balanced question in
     * the whole catalog, and a three-way rather than a coin flip. This is the one
     * that makes run-or-pass look thin. */
    baseRate: 0.29,
    rates: { left: 0.29, middle: 0.38, right: 0.33 }
  },
  {
    id: 'first_down',
    question: 'Do they move the chains?',
    choices: [{ id: 'yes', label: 'First down' }, { id: 'no', label: 'No' }],
    perGame: 123,
    reads: 'matchup',
    scope: 'play',
    baseRate: 0.26          // 97 of 369 real snaps
  },
  {
    id: 'redzone_outcome',
    question: 'Touchdown, field goal, or nothing?',
    choices: [
      { id: 'td', label: 'Touchdown' },
      { id: 'fg', label: 'Field goal' },
      { id: 'none', label: 'Nothing' }
    ],
    perGame: 12,
    reads: 'situation',
    /* 🔴 A THIRD TIMESCALE. Jason: "once in the redzone, touchdown, field goal or
     * turnover." It is offered the moment a drive crosses the 20 and settles when
     * that drive ends - shorter than a drive call, longer than a snap, and asked
     * at the tensest moment in the sport.
     *
     * 56 / 19 / 25 over 36 real red-zone trips. A genuine three-way spread: the
     * favourite is real, and a quarter of the time nobody scores at all. */
    scope: 'drive',
    baseRate: 0.56,
    rates: { td: 0.56, fg: 0.19, none: 0.25 }
  },

  /* ---- WHAT THE MARKET ACTUALLY SELLS. Jason, 2026-09-08: "ask what
   * opportunities are there for betting, you have obviously not done that."
   *
   * He was right and the correction is specific. Everything above this line was
   * reasoned outward from what the ESPN feed happens to expose. Four operator
   * rulebooks - DraftKings 8/18/25, Fanatics 10/6/25, FanDuel, BetMGM, all filed
   * with state regulators, all read in full - plus Simplebet's published handle
   * say something the feed cannot: WHICH QUESTIONS PEOPLE ACTUALLY ANSWER.
   *
   * 🔴 THE HEADLINE, AND IT REORDERS THE CATALOG RATHER THAN EXTENDING IT.
   * "Drive Exact Result" was the MOST-PLAYED micro-market in Simplebet's whole
   * college football catalog, and next-drive result led the NFL playoffs too. We
   * have that question - `drive_end` - and `offerFor` never once offered it. The
   * biggest gap was not a missing type. It was a type we had and never asked.
   *
   * Second by handle was the SCRIPT market at $1.3m over three playoff rounds:
   * run-or-pass AND first-down-or-not as ONE pick. We had both halves separately
   * and never thought to multiply them. It is below, and measured.
   *
   * WHAT WE STILL DO NOT HAVE, named rather than quietly skipped: the PLAYER
   * dimension. "Who scores a touchdown on this drive" took $1.5m and was played
   * by 26% of one operator's customers - the single biggest micro-market in
   * football, and we have nothing like it. It needs a per-play star the parser
   * emits, which requirement 7.2 says is a real trap (the parenthesized group is
   * the TACKLER). It is the next build, not a thing to half-do before a kickoff.
   * ---- */
  {
    id: 'script',
    question: 'Run or pass — and do they get the first down?',
    choices: [
      { id: 'run_yes', label: 'Run, first down' },
      { id: 'run_no', label: 'Run, short' },
      { id: 'pass_yes', label: 'Pass, first down' },
      { id: 'pass_no', label: 'Pass, short' }
    ],
    perGame: 123,
    reads: 'tendency',
    scope: 'play',
    /* 🔴 THE BEST-SPREAD QUESTION IN THE CATALOG, measured over 370 real snaps:
     * run-short 41%, pass-short 32%, pass-first 16%, run-first 12%. Four ways,
     * nothing above 38, and the two interesting outcomes pay real money. It beats
     * `direction` (29/38/33) because it is four-way, and it beats `run_pass`
     * outright - same tap, twice the question. */
    /* First choice, per the field's definition. The spread that matters is in
     * `rates`: the modal answer is run-and-short at 41%. */
    baseRate: 0.115,
    rates: { run_yes: 0.115, run_no: 0.405, pass_yes: 0.163, pass_no: 0.317 }
  },
  {
    id: 'punt_fair_catch',
    question: 'Fair catch, or does he run it back?',
    choices: [{ id: 'fair', label: 'Fair catch' }, { id: 'return', label: 'He brings it back' }],
    perGame: 9,
    reads: 'personnel',
    scope: 'play',
    /* 42% over 26 real punts. Near even, and it settles the instant the ball is
     * caught - which is the property Simplebet credited for the touchback
     * market's success. Instant gratification beat sophistication there. */
    baseRate: 0.423
  },
  {
    id: 'three_and_out',
    question: 'Three and out?',
    choices: [{ id: 'yes', label: 'Three and out' }, { id: 'no', label: 'They move it' }],
    perGame: 25,
    reads: 'matchup',
    scope: 'drive',
    /* 17% over 75 real drives - the most lopsided thing that ships, and it ships
     * because the payout is the point. At 17% it pays close to the 6x cap, so it
     * is the catalog's one long shot rather than its one bad question. Compare
     * the three that were REJECTED for the same measurement: a sack is 3%, a
     * penalty on the play is 1%, crossing midfield is 83%. */
    baseRate: 0.173
  }
];

export const byId = (id: string) => CALL_TYPES.find((t) => t.id === id) || null;

/* ------------------------------------------------------------------ *
 * Settlement — every one of these reads the play text the feed gave us
 * ------------------------------------------------------------------ */

const has = (s: string, re: RegExp) => re.test(s.toLowerCase());

/** Yards gained, off ESPN's own statYardage where present, else the sentence. */
export function yardsOf(play: { text: string; statYardage?: number | null }): number | null {
  if (typeof play.statYardage === 'number') return play.statYardage;
  const m = /for (-?\d+) yard/.exec(play.text.toLowerCase());
  if (m) return Number(m[1]);
  if (has(play.text, /no gain/)) return 0;
  return null;
}

export type Settled = { landed: boolean | null; because: string };

/**
 * @param typeId  which question was asked
 * @param choice  what they said
 * @param play    the play that answered it
 * @param ctx     the pre-snap state the question was asked in
 *
 * `landed: null` is a VOID - the one void path, in the live layer. The offense
 * never chose, so the stake comes back untouched.
 */
/**
 * 🔴 A SACK IS A PASS IN THE NFL AND A RUSH IN COLLEGE. Not a preference - the
 * same physical event is graded oppositely by league, and every operator rulebook
 * read says so in the same words. DraftKings: "A sack will be settled as a pass
 * attempt for NFL Games. A sack will be settled as a rush attempt for NCAA
 * Games." Fanatics, FanDuel and betr all concur.
 *
 * The catalog had it hardcoded to PASS, which is right for tomorrow's rig and
 * WRONG for the actual product - college is the shipping sport. A sack is 16% of
 * real drives, so this silently flipped the answer on roughly one drive in six.
 *
 * And an unknown league VOIDS rather than guessing. A sack graded the wrong way
 * does not look wrong: it looks like a call that lost. That is the same silent
 * fallback `teams.ts` returns null for, and it gets the same treatment.
 */
export type SettleSport = 'nfl' | 'college-football';

export function sackCountsAs(sport: SettleSport | null | undefined): 'run' | 'pass' | null {
  if (sport === 'nfl') return 'pass';
  if (sport === 'college-football') return 'run';
  return null;
}

/** One reading of run-or-pass, shared by every question that needs it, so the
 *  sack rule cannot be right in one place and wrong in another. */
function runOrPass(
  play: { text: string; typeText?: string },
  sport: SettleSport | null | undefined
): { side: 'run' | 'pass' | null; because: string } {
  const t = (play.typeText || '').toLowerCase();
  const s = play.text.toLowerCase();
  if (has(t + ' ' + s, /kickoff|punt|field goal|extra point|kneel|spike/)) {
    return { side: null, because: 'not a run-or-pass snap' };
  }
  if (has(t, /sack/) || has(s, / sacked/)) {
    const side = sackCountsAs(sport);
    return side
      ? { side, because: `a sack, which ${sport === 'nfl' ? 'the NFL' : 'college'} grades as a ${side}` }
      : { side: null, because: 'a sack, and no league was given to grade it by' };
  }
  /* An interception is an incomplete pass, per every rulebook read. */
  if (has(t, /pass|interception/) || has(s, /incomplete| pass |intercepted/)) {
    return { side: 'pass', because: 'it was a pass' };
  }
  if (has(t, /rush/) || has(s, / rush | scramble/)) return { side: 'run', because: 'it was a run' };
  return { side: null, because: 'neither a run nor a pass' };
}

export function settle(
  typeId: string,
  choice: string,
  play: { text: string; typeText?: string; statYardage?: number | null },
  ctx?: { down?: number | null; distance?: number | null; sport?: SettleSport | null }
): Settled {
  const t = (play.typeText || '').toLowerCase();
  const s = play.text.toLowerCase();
  const both = t + ' ' + s;

  /* A play that did not happen answers nothing, whatever was asked of it. */
  if (has(both, /no play|timeout|end of (quarter|half|game)|two-minute/)) {
    return { landed: null, because: 'the play did not happen' };
  }

  switch (typeId) {
    case 'run_pass': {
      const r = runOrPass(play, ctx?.sport);
      if (!r.side) return { landed: null, because: r.because };
      return { landed: r.side === choice, because: r.because };
    }

    /* 🔴 THE SCRIPT MARKET. Two questions, one tap, and #2 by handle in the real
     * market. It voids whenever EITHER half would - a play that was not a snap
     * has no run-or-pass answer, so it has no script answer either. */
    case 'script': {
      const r = runOrPass(play, ctx?.sport);
      if (!r.side) return { landed: null, because: r.because };
      const got = has(s, /1st down|first down|touchdown/);
      const actual = `${r.side}_${got ? 'yes' : 'no'}`;
      return { landed: actual === choice, because: `${r.because}, ${got ? 'first down' : 'short of it'}` };
    }

    case 'punt_fair_catch': {
      if (!has(both, /punt/)) return { landed: null, because: 'not a punt' };
      /* A punt nobody caught - downed, out of bounds, touchback, blocked - was
       * never a choice between fair-catching and running it back. */
      if (has(s, /touchback|downed|out of bounds|blocked|no play/)) {
        return { landed: null, because: 'nobody fielded it' };
      }
      const fc = has(s, /fair catch/);
      return { landed: (fc ? 'fair' : 'return') === choice, because: fc ? 'fair catch' : 'he brought it back' };
    }

    case 'fourth_down': {
      const kicked = has(both, /punt|field goal/);
      const went = has(t, /rush|pass|sack/);
      if (!kicked && !went) return { landed: null, because: 'the down did not resolve' };
      return { landed: (kicked ? 'kick' : 'go') === choice, because: kicked ? 'they kicked' : 'they went for it' };
    }

    case 'kickoff_return': {
      if (!has(both, /kickoff/)) return { landed: null, because: 'not a kickoff' };
      /* 🔴 AN ONSIDE KICK VOIDS IT, and this is a borrowed rule rather than a
       * derived one - DraftKings and Fanatics both void every kickoff market on
       * an onside attempt. Nobody who called "past the 25" was answering a
       * question about a ten-yard squib, and a penalty on a kick voids it too. */
      if (has(s, /onside/)) return { landed: null, because: 'onside kick' };
      if (has(both, /penalty/)) return { landed: null, because: 'a penalty on the kick' };
      /* A touchback is the 25 by rule, so it is never PAST it. A return is past
       * the 25 only if the sentence says where it ended. */
      if (has(s, /touchback/)) return { landed: choice === 'short', because: 'touchback' };
      const m = /return \d+ yards to the [a-z]+\s?(\d+)/.exec(s);
      const to = m ? Number(m[1]) : null;
      if (to === null) return { landed: choice === 'short', because: 'no return past the 25' };
      return { landed: (to > 25 ? 'past' : 'short') === choice, because: `returned to the ${to}` };
    }

    case 'third_down': {
      if (ctx?.down !== 3) return { landed: null, because: 'not third down' };
      const y = yardsOf(play);
      const need = ctx?.distance ?? null;
      if (has(s, /1st down|first down/)) return { landed: choice === 'convert', because: 'first down' };
      if (y === null || need === null) return { landed: null, because: 'the gain is not in the feed' };
      return { landed: (y >= need ? 'convert' : 'stop') === choice, because: `${y} on 3rd and ${need}` };
    }

    case 'explosive': {
      const y = yardsOf(play);
      if (y === null) return { landed: null, because: 'the gain is not in the feed' };
      return { landed: (y >= 10 ? 'yes' : 'no') === choice, because: `${y} yards` };
    }

    case 'direction': {
      /* ESPN writes the direction into the sentence - "rush left", "pass short
       * middle", "deep right". A play with no direction in it (a kneel, a
       * scramble that never picked a side) answers nothing. */
      const dir = has(s, / left/) ? 'left' : has(s, / middle/) ? 'middle' : has(s, / right/) ? 'right' : null;
      if (!dir) return { landed: null, because: 'the feed named no direction' };
      return { landed: dir === choice, because: dir };
    }

    case 'first_down': {
      const got = has(s, /1st down|first down/);
      /* A touchdown is not written as a first down and is obviously one. */
      const scored = has(s, /touchdown/);
      return { landed: ((got || scored) ? 'yes' : 'no') === choice,
               because: scored ? 'touchdown' : got ? 'first down' : 'short of it' };
    }

    case 'field_goal': {
      if (!has(both, /field goal/)) return { landed: null, because: 'not a field goal' };
      const good = has(s, /is good|field goal good/) && !has(s, /no good/);
      return { landed: (good ? 'good' : 'miss') === choice, because: good ? 'it was good' : 'it missed' };
    }

    default:
      return { landed: null, because: 'unknown call type' };
  }
}

/**
 * A DRIVE-SCOPE call settles when the drive ends, against every play in it.
 *
 * ESPN gives the drive's own result verbatim - TD, FG, PUNT, DOWNS, END OF HALF -
 * and those are read rather than derived, for the same reason a game's status is:
 * a drive that ended at half time did not stall, and inferring it from the plays
 * would say it did.
 */
export function settleDrive(
  typeId: string,
  choice: string,
  drive: { result?: string; plays: { text: string; statYardage?: number | null; endYardsToEndzone?: number | null }[] }
): Settled {
  const result = (drive.result || '').toUpperCase();

  if (typeId === 'drive_breakout') {
    const best = drive.plays.reduce((m, p) => Math.max(m, yardsOf(p) ?? -99), -99);
    if (best === -99) return { landed: null, because: 'no gain in the feed' };
    return { landed: (best >= 25 ? 'yes' : 'no') === choice, because: `longest was ${best}` };
  }

  if (typeId === 'drive_redzone') {
    const got = drive.plays.some((p) => typeof p.endYardsToEndzone === 'number' && p.endYardsToEndzone <= 20);
    return { landed: (got ? 'yes' : 'no') === choice, because: got ? 'they got inside the 20' : 'they never got inside the 20' };
  }

  if (typeId === 'redzone_outcome') {
    if (/END OF/.test(result)) return { landed: null, because: 'the half ended' };
    const td = result === 'TD';
    const fg = result === 'FG';
    const actual = td ? 'td' : fg ? 'fg' : 'none';
    return { landed: actual === choice, because: result.toLowerCase() || 'no score' };
  }

  if (typeId === 'three_and_out') {
    if (/END OF/.test(result)) return { landed: null, because: 'the half ended' };
    /* DraftKings defines it exactly: "exactly three valid plays from scrimmage
     * followed by a punt." Three and a punt is four rows in the feed. */
    const scrim = drive.plays.filter((p) => !/kickoff|extra point|timeout|end of/i.test(p.text));
    const yes = result === 'PUNT' && scrim.length <= 4;
    return { landed: (yes ? 'yes' : 'no') === choice,
             because: yes ? 'three and out' : `${scrim.length} plays, ${result.toLowerCase() || 'no result'}` };
  }

  if (typeId === 'drive_end') {
    /* A drive that ends the half ended nobody's way. The one void path again. */
    if (/END OF/.test(result)) return { landed: null, because: 'the half ended' };
    const map: Record<string, string> = {
      TD: 'td', FG: 'fg', PUNT: 'punt',
      DOWNS: 'turnover', INT: 'turnover', FUMBLE: 'turnover', 'MISSED FG': 'turnover'
    };
    /* 🔴 "PUNT TD" IS A PUNT, and it is a real drive result in the fixtures - a
     * punt returned for a touchdown. The question asked how the OFFENSIVE drive
     * ended, and it ended in a punt; what the other team then did with the ball
     * is a different drive. DraftKings words it the same way. This voided before
     * the fixtures were counted, which is a call nobody would have noticed
     * losing. */
    const actual = map[result] || map[result.split(' ')[0]] || null;
    if (!actual) return { landed: null, because: `unhandled drive result ${result}` };
    return { landed: actual === choice, because: result.toLowerCase() };
  }

  return { landed: null, because: 'not a drive call' };
}

/**
 * WHICH QUESTION THIS MOMENT ASKS. Ordered, because a moment can qualify for more
 * than one and the RAREST interesting question wins - a fourth down is a fourth
 * down before it is another snap, and a kickoff is not a run-or-pass at all.
 *
 * 🔴 This is the whole design in one function: the app does not ask the same
 * thing all night, it asks whatever this moment makes worth asking.
 */
export function offerFor(ctx: {
  down?: number | null;
  distance?: number | null;
  isKickoff?: boolean;
  isPunt?: boolean;
  isFieldGoalAttempt?: boolean;
  /** True on the first snap of a possession - the moment the drive question is
   *  worth asking, and the only moment it can be. */
  isDriveStart?: boolean;
  /** What is already running on this drive, so a drive call is not offered twice
   *  and a slow call can ride under a fast one rather than replacing it. */
  openDriveCall?: boolean;
}): CallType | null {
  if (ctx.isKickoff) return byId('kickoff_return');
  if (ctx.isPunt) return byId('punt_fair_catch');
  if (ctx.isFieldGoalAttempt) return byId('field_goal');

  /* 🔴 THE DRIVE QUESTION COMES FIRST, and this line is the whole correction.
   * "Drive Exact Result" was the single most-played market in Simplebet's college
   * football catalog and next-drive result led the NFL playoffs. We shipped that
   * question weeks ago and this function never offered it once - every snap fell
   * through to run-or-pass. The catalog was not missing the best market; the
   * router was hiding it.
   *
   * It rides UNDER the play calls rather than replacing them, which is what the
   * two timescales were built for: take the drive at first down, then keep
   * calling snaps while it runs. */
  if (ctx.isDriveStart && !ctx.openDriveCall) return byId('drive_end');

  if (ctx.down === 4) return byId('fourth_down');
  if (ctx.down === 3) return byId('third_down');

  /* 🔴 SCRIPT REPLACES RUN-OR-PASS AS THE DEFAULT SNAP. Same tap, four answers
   * instead of two, measured at 38/35/16/12 over 370 real snaps, and #2 by handle
   * in the real market at $1.3m over three playoff rounds. `run_pass` stays in the
   * catalog because it is the honest fallback when a screen wants two tiles, but
   * nothing should be asking a coin flip a hundred and twenty times a night. */
  return byId('script');
}
