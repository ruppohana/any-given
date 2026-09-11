/* THE LIVE GAME — the call card, wired to the real feed.
 *
 * This is the one screen that is not fed from fixtures. It polls the Worker,
 * holds what it gets behind the user's own delay, asks whatever question the
 * situation makes interesting, and settles against the play that actually
 * happened.
 *
 * 🔴 THE DELAY IS THE MECHANIC, NOT A TAX ON IT. ESPN tells you a play happened
 * AFTER it happened. Being deliberately behind the television is what turns that
 * into a real window: the app shows you the state as of 45 seconds ago, you call
 * what happens next, and on the screen in front of you the snap has not been
 * taken. Set the delay to zero and the app is a scoreboard - it can only tell you
 * what already happened.
 *
 * 🔴 THE QUESTION CHANGES. Run-or-pass asked 120 times is a mechanic, not a game.
 * The catalog decides what this moment is worth asking - a fourth down is a
 * coach's decision, a kickoff is a returner's, a third down is a matchup - and
 * the app asks that instead.
 */

import { CALL_TYPES, byId, offerFor, settle, settleDrive, movedChains } from '/src/catalog.js';
/* 🔴 THE COMMENTARY COMES OUT OF detect.ts, which already existed and was never
 * shown. Jason, 2026-09-08: "Are we giving color commentary during the game? As
 * cards as well?" We were not, and every piece of it was already built:
 * detect() ranks each play by severity, names the event, writes a headline and a
 * detail, and carries a per-play STAR with a ROLE — carrier, passer, receiver,
 * kicker — which is requirement 7.2 done properly rather than a view guessing at
 * the name in the parentheses.
 *
 * Nothing here writes commentary. It renders what the detector already said. */
import { detect } from '/src/lib/detect.js';
/* 🔴 A REAL IMAGE FILE, not an unfurled card. The og:image can say which game is
 * on; it can never say what YOU just called, because it is one picture per URL
 * cached hard by the crawler. Web Share Level 2 attaches an actual PNG. */
import { shareResult, shareReaction, MOMENTS } from '/components/sharecard.js';
/* `tooClose` and `normalizeColor` come from the chip rather than being written
   again here - the bug and the slate have to agree about when two teams clash,
   or the same fixture is legible in one place and not the other. */
import { pageHeader } from '/components/header.js';
import { teamChip, applyTeamVars, tooClose, normalizeColor, marksOn, logoUrl } from '/components/team-chip.js';
import { stateBlock, STATES_CSS } from '/components/states.js';
import { adSlot } from '/components/ad.js';
import { signed, signClass, clock } from '/components/fmt.js';

export const id = 'live-game';
export const title = 'Live — the call';
export const bar = null;   /* No comp. Nobody ships this. */
export const states = ['live'];

const POLL_MS = 5000;
/* 5 first: the typical stake, and the one a new player should meet. */
const STAKES = [5, 10, 25];
const START_BANK = 200;
const MAX_PAYOUT = 6;

/* 🔴 ONE GAME PER SPORT, NAMED, and this is a rig rather than a schedule. The
 * poller pushes one game at a time and the key it writes is `<sport>:<espnId>`;
 * a slate that lets you pick any game needs the pool routes and a poller per
 * game, which is the build after this one. Tonight there is one NFL game on the
 * wire, which is the one being tested — and a college key that nothing is
 * pushing to is honest: the screen says nobody is polling it. */
/* 🔴 THE GAME IS LOOKED UP, NOT WRITTEN DOWN. Jason, 2026-09-09: "All the card
 * info is still stale and not the upcoming info."
 *
 * The table below is a pair of constants, and a constant is stale the moment its
 * game kicks off. It was right on the day it was typed and it is wrong for every
 * day after: on Thursday morning the NFL card would still be pointing at
 * Wednesday's opener, showing a finished game as "what's on", with a countdown
 * that had run out.
 *
 * The slate already knows. `slate:<sport>:<season>:<week>` is captured from the
 * feed and carries every game with its real kickoff and its real status, so the
 * next game is a query over data we already hold rather than a fact somebody has
 * to remember to edit.
 *
 * 🔴 NOT-FINAL, ORDERED BY KICKOFF — never "the first scheduled one". A game
 * that is IN PROGRESS is the one you want to be watching, and filtering to
 * `scheduled` would skip past a live game to advertise tomorrow's.
 *
 * The constants stay as the fallback, because a network failure must not leave
 * the home card with nothing to point at. */
const SLATE_WEEK = { nfl: 1, 'college-football': 2 };

async function nextGameKey(sport) {
  try {
    const wk = SLATE_WEEK[sport] || 1;
    const res = await fetch('/api/state/slate:' + sport + ':2026:' + wk);
    if (!res.ok) return null;
    const d = await res.json();
    /* 🔴 KEEP THE SLATE THIS ALREADY FETCHED. The scorebug wants team records
     * and the live feed does not carry them - the weekly capture does, because
     * the poller pulls them for the info card. This function was downloading
     * that exact document, reading one field out of it and dropping the rest
     * on the floor, five minutes apart, for ever.
     *
     * The records were coming back empty on the bug not because the data was
     * missing but because the only code that cached it was the "also on" card,
     * which does not render on this screen. Two callers, one document, one
     * cache. */
    if (!S.also || S.also.sport !== sport) {
      S.also = { sport, at: Date.now(), games: d.games || [] };
    }
    const up = (d.games || [])
      .filter((g) => g && g.id && g.status !== 'final')
      .sort((a, b) => a.kickoffUtc - b.kickoffUtc);
    return up.length ? sport + ':' + up[0].id : null;
  } catch { return null; }
}

const GAME_FOR = {
  /* NE @ SEA, Wed 9 Sep 5:20pm Pacific - the 2026 NFL opener. */
  'nfl': 'nfl:401872656',
  /* 🔴 A REAL COLLEGE GAME, and it answers "why can't college be ready at the
   * same time" - it CAN. College shares every line of this file: the same
   * catalog, the same settlers, the same board. It was not live for one reason
   * and it was not a code reason - nothing was polling a college game, and the
   * id here was a placeholder.
   *
   * MIA @ FAMU, Thu 10 Sep 5:00pm Pacific. The day after the NFL opener, which
   * is simply when the next college game is. */
  'college-football': 'college-football:401858213'
};

const SPORT_LABEL = { 'nfl': 'NFL', 'college-football': 'College' };

/* ------------------------------------------------------------------ */

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const store = {
  get(k, d) { try { const v = localStorage.getItem('ag.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('ag.' + k, JSON.stringify(v)); } catch {} }
};

function deviceId() {
  let id = store.get('device', null);
  if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); store.set('device', id); }
  return id;
}

/* ------------------------------------------------------------------ *
 * State the screen owns
 * ------------------------------------------------------------------ */

const S = {
  key: null,
  raw: null,            // last pushed state from the Worker
  delayMs: store.get('delayMs', 30000),
  name: store.get('name', ''),
  stake: store.get('stake', 10),
  calls: store.get('calls', {}),   // afterPlayId -> { type, choice, stake, p }
  /* 🔴 TV TAPS. Timestamps of "it just happened on my screen", used to measure
     how far the person's own television is behind the stadium. Kept as raw
     millisecond stamps and resolved later against the feed, never as a computed
     gap - the play they watched is usually one we have not been told about yet,
     so the answer does not exist at the moment of the tap. */
  taps: store.get('taps', []),
  /* Transient, never stored: it drives a 900ms confirmation flash and must not
     survive a reload as a stuck green button. */
  lastTapAt: 0,
  /* Last reading posted, so a repaint every five seconds does not repost it. */
  sentTv: null,
  /* afterPlayId -> 1. Snaps deliberately sat out. Kept SEPARATE from calls on
     purpose: a skip must never be able to settle, score or reach the board, and
     the surest way to guarantee that is for it not to live in the same object
     that settlement walks. */
  skips: store.get('skips', {}),
  seenIntro: !!store.get('seenIntro', 0),
  noGame: false,
  delayOpen: false,
  /* 🔴 NO DEFAULT. Jason, 2026-09-08: "the initial decision needs to pick between
   * NFL and NCAA football." Defaulting to either one answers the question on the
   * user's behalf and then hides it — and the two sports are not interchangeable
   * here: the tendency model is 697,997 COLLEGE plays and the sack rule is
   * graded the opposite way by league. Guessing wrong grades calls wrong.
   * `null` means the choice has not been made, and the screen asks. */
  sport: store.get('sport', null),
  /* 'call' = the live layer, 'pool' = the weekly picks. Null until asked. */
  /* 🔴 MIGRATED, NOT READ RAW. The first card has been re-cut twice today and
   * every phone that opened the app in between is holding a value this build no
   * longer understands — 'call' and 'week' were the old three-way's ids.
   *
   * Left alone they are the worst possible state: truthy, so the mode gate is
   * satisfied and the first card never draws, and unequal to 'marbles', so the
   * speed row never draws either. Somebody who chose "Call the game" an hour ago
   * would land on a hub with a question missing and no way to reach it.
   *
   * Both old marble ids fold into 'marbles'; anything else is dropped to null so
   * the card asks again, which is the honest outcome for a value we cannot
   * interpret. */
  mode: (() => {
    const v = store.get('mode', null);
    /* 🔴 EVERY RETIRED NAME STILL RESOLVES. Somebody who used this app an hour
     * ago has 'marbles' in their storage, and before that 'call' or 'week'.
     * A mode that does not map lands them on a blank fork with a stored
     * preference the app no longer understands. 'marbles' meant "the staking
     * half", and the live board is what that door led to, so that is where it
     * points now. */
    if (v === 'live' || v === 'call' || v === 'marbles') return 'live';
    if (v === 'allgames' || v === 'week') return 'allgames';
    return v === 'pool' ? 'pool' : null;
  })(),
  bank: START_BANK,
  board: [],
  timer: null
};

/**
 * 🔴 THE HOLD. Everything the screen renders is the game as it stood `delayMs`
 * ago - not the newest play. This is one filter and it is the whole feature: a
 * play is visible only once it is older than the delay.
 */
/* 🔴 THE STATE THE CALL IS BEING MADE IN, SAID OUT LOUD. Jason, live:
 * "Below you have print the down and distance and who has the ball."
 *
 * He is right that it was missing and it is the most important line on the card.
 * "Run or pass?" is a different question on 3rd & 1 than on 2nd & 12, and the
 * app was asking it while showing only the text of the previous play - so the
 * information the price is built on was the one thing not printed.
 *
 * 🔴 IT COMES FROM THE HELD SITUATION, WHICH IS THE ONLY REASON IT IS SAFE TO
 * SHOW. held() derives the down, the distance and possession from the last
 * VISIBLE play; the live values are deliberately not reachable here. Printing
 * the live down beside a held play list is exactly the leak that was found six
 * hours before kickoff - the header would state the result of the play being
 * withheld. This line is the same fact the question was built from, so it can
 * never disagree with it. */
/* 🔴 THE GAME IS STOPPED, AND THE APP KNEW AND DID NOT SAY. Jason, live: "do we
 * know when it is an official time out like for commercials?"
 *
 * We do, exactly - ESPN writes the stoppage into the play feed as its own row:
 * "Official Timeout at 07:29.", "Two-minute warning", "End of Quarter". The
 * parser already recognises all of them, because settlement has to: they are not
 * run-or-pass snaps and a call made across one would void. So the fact was being
 * read, used to protect the settlement, and then thrown away before the screen.
 *
 * 🔴 IT IS THE ANSWER TO "WHY IS NOTHING HAPPENING". A TV timeout is two minutes
 * of no plays, and an app that just sits there looks broken - which is exactly
 * how the false stale banner started. Saying "commercial break" turns a silence
 * into information, and it is the honest thing to show while the feed genuinely
 * has nothing to report.
 *
 * Absent, never guessed: only these three stoppages, matched on the feed's own
 * words. Anything else gets no pill rather than an invented one. */
/* WHAT KIND OF STOPPAGE A PLAY IS, if it is one. Shared, because the bar under
 * the field and anything else that cares must agree - and matched against what
 * the feed actually writes, which is not what anybody guesses: "Official
 * Timeout at 07:29.", "END QUARTER 1", "Two-minute warning". */
function stoppageOf(play) {
  if (!play) return null;
  const t = (play.typeText || '') + ' ' + (play.text || '');
  const isHalf = /end (of )?(the )?half|halftime/i.test(t)
    || (/end (of )?(the )?(quarter|period)|end quarter/i.test(t) && play.quarter === 2);
  if (isHalf) return { label: 'Half time', note: 'no football for about thirteen minutes' };
  if (/official timeout/i.test(t)) return { label: 'Commercial break', note: 'no snap for a couple of minutes' };
  if (/^timeout|timeout #/i.test((play.text || '').trim())) return { label: 'Timeout', note: 'they stopped the clock' };
  if (/two.minute warning/i.test(t)) return { label: 'Two-minute warning', note: 'no snap for a couple of minutes' };
  if (/end (of )?(the )?(quarter|period)|end quarter/i.test(t)) return { label: 'End of the quarter', note: 'no snap for a couple of minutes' };
  if (/end of game|end game/i.test(t)) return { label: 'Final', note: 'that is the game' };
  return null;
}

function breakLine(state) {
  const plays = (state && state.plays) || [];
  const last = plays[plays.length - 1];
  if (!last) return null;
  const t = (last.typeText || '') + ' ' + (last.text || '');
  /* 🔴 MATCHED AGAINST WHAT THE FEED ACTUALLY WRITES, WHICH IS NOT WHAT I
   * GUESSED. I wrote /end of (quarter|period)/ and the feed says "END QUARTER 1"
   * - no "of" - so the one stoppage on screen at the time went unlabelled while
   * the code looked correct. Same shape as every other assumption about this
   * feed today: the fix is to read a real payload, not to reason about wording.
   * Seen live: "Official Timeout at 07:29.", "END QUARTER 1", "Two-minute
   * warning". */
  /* 🔴 THE END OF THE SECOND QUARTER IS HALF TIME, AND IT IS NOT "A COUPLE OF
   * MINUTES". Caught with the game sitting on it: the feed writes the same
   * "END QUARTER n" for a two-minute break and a thirteen-minute one, and the
   * only thing telling them apart is n. */
  const isHalf = /end (of )?(the )?half|halftime/i.test(t)
    || (/end (of )?(the )?(quarter|period)|end quarter/i.test(t) && last.quarter === 2);
  const what = isHalf ? 'Half time'
    : /official timeout/i.test(t) ? 'Commercial break'
    : /two.minute warning/i.test(t) ? 'Two-minute warning'
    : /end (of )?(the )?(quarter|period)|end quarter/i.test(t) ? 'End of the quarter'
    : null;
  if (!what) return null;
  const line = el('div', 'lg-break');
  line.appendChild(el('span', 'lg-break-d', what));
  line.appendChild(el('span', 'lg-break-t',
    isHalf ? 'no football for about thirteen minutes' : 'no snap for a couple of minutes'));
  return line;
}

/* 🔴 A CARD, SAYING ONE THING. Jason, refining it: "Sorry card can say, but the
 * card says waiting for the snap."
 *
 * So the panel stays and its CONTENT changes - which is a better answer than
 * either of my two attempts. Removing the card entirely made the page jump and
 * left a gap where the subject of the screen had been; keeping a full card with
 * the question and lit tiles left an answered question refusing to leave. A card
 * holding one line keeps the layout still and says exactly what is true.
 *
 * The same component serves both endings - a call made and a snap sat out -
 * because from here they are the same state: nothing to do until the next play.
 * What you staked is in the list below, which is where a record belongs. */
/* 🔴 THE MEASUREMENT THAT DECIDES WHETHER A PAID FEED IS NEEDED AT ALL. Jason,
 * asked what a low-latency feed costs, then: "Yes. Snap."
 *
 * The whole product rests on ONE number nobody has measured: how far the
 * viewer's television is behind the stadium. We know our own lag exactly now -
 * ESPN publishes 60 to 90 seconds late - and we have been treating that as the
 * gap. It is not. The gap that matters is
 *
 *     our lag  −  their television's lag
 *
 * and the second term has only ever been guessed. Cable runs 5-10s behind the
 * stadium; a stream can be 30-60. If he is streaming, we may be 20 seconds
 * ahead of his screen rather than a minute behind it, and the snap market is
 * recoverable for the price of a smaller delay setting. If he is on cable, it
 * is not, and a paid feed is the only door.
 *
 * 🔴 THE TAP CANNOT BE RESOLVED WHEN IT IS MADE, and pretending otherwise would
 * invent the answer. The play he is watching is usually one ESPN has not
 * published yet, so the tap is STORED and matched afterwards to the play whose
 * wallclock is the latest one at or before it - the play that was happening when
 * he tapped. It is only final once the feed has moved past that moment, which is
 * what `settled` below waits for. Until then it says so rather than showing a
 * number that will change. */
function resolveTaps(state) {
  const plays = ((state && state.plays) || []).filter((p) => p.wallclockMs);
  const out = [];
  for (const tap of S.taps) {
    let watched = null;
    let passed = false;
    for (const p of plays) {
      if (p.wallclockMs <= tap) { if (!watched || p.wallclockMs > watched) watched = p.wallclockMs; }
      else passed = true;
    }
    if (watched && passed) out.push(Math.round((tap - watched) / 1000));
  }
  return out;
}

/* 🔴 `lg-tvlag`, NOT `lg-tv` - THAT NAME WAS ALREADY THE BROADCAST CHIP. Caught
 * on the first click: querying `.lg-tv` returned the element reading "NBC".
 * Fifth name collision today, after .p2-mkt, .p2-day, .p2-grp and .p2-sub, and
 * the first one in a component rather than a stylesheet. Same rule: one name,
 * one thing. */
function tvCard(state, wrap) {
  const c = el('div', 'card lg-tvlag');
  /* 🔴 THE TAP HAS TO ANSWER. Jason: "When I hit snap. Turn the color so I know."
   *
   * This is a button whose whole job is to record an instant, pressed while the
   * person is looking at a television rather than at the phone. With no
   * response it is impossible to know whether the tap landed - and a tap you are
   * unsure about gets pressed again, which puts a second sample two seconds late
   * into a median built from thirteen. 🔴 SO THE FEEDBACK IS NOT POLISH HERE, IT
   * IS PART OF THE MEASUREMENT.
   *
   * Green, because the up/down scale in this app already means landed and
   * missed, and a tap that registered is the same idea. It reverts on its own
   * so the button is ready for the next snap without being touched. */
  const hit = S.lastTapAt && Date.now() - S.lastTapAt < 900;
  const b = el('button', 'lg-tvlag-go' + (hit ? ' is-hit' : ''),
    hit ? '✓  GOT IT' : 'SNAP — tap the moment it happens on your TV');
  b.type = 'button';
  b.onclick = () => {
    S.taps = [...S.taps, Date.now()].slice(-20);
    store.set('taps', S.taps);
    S.lastTapAt = Date.now();
    /* A short buzz, where the hardware has one - the eye is on the game, not on
       the phone, and a hand knows a buzz without looking. */
    try { if (navigator.vibrate) navigator.vibrate(25); } catch { /* no haptics */ }
    paint(wrap);
    /* And put it back, so the next snap meets a button that says SNAP. */
    setTimeout(() => paint(wrap), 900);
  };
  c.appendChild(b);

  const gaps = resolveTaps(state);
  if (!gaps.length) {
    c.appendChild(el('p', 'lg-tvlag-n', S.taps.length
      ? `${S.taps.length} tap${S.taps.length > 1 ? 's' : ''} recorded — waiting for the feed to reach them.`
      : 'Tap it a few times during live snaps. It measures your television against the stadium clock, which is the one number nobody has.'));
    return c;
  }
  /* The MEDIAN, not the mean - one late tap while reaching for the phone would
     drag an average and there are only a handful of samples. */
  const sorted = [...gaps].sort((a, b2) => a - b2);
  const tv = sorted[Math.floor(sorted.length / 2)];
  /* 🔴 SENT UP, ONCE PER NEW READING. The measurement is worthless if it only
   * exists on the phone that took it - it is the number that decides whether
   * this product needs a paid feed, and it was being read off screenshots.
   * Fire-and-forget: a failed post costs a diagnostic, never a pick. */
  if (S.sentTv !== tv + ':' + gaps.length) {
    S.sentTv = tv + ':' + gaps.length;
    try {
      fetch('/api/tvlag', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deviceId: deviceId(), gaps, tvLagSec: tv })
      }).catch(() => {});
    } catch { /* no network, no problem */ }
  }
  /* 🔴 THE POLLER'S MEASURED PUBLISH LAG, NOT THE AGE OF THE NEWEST PLAY. Those
   * are different numbers and the difference is "how long since anything
   * happened" - which during a two-minute warning is two minutes of pure
   * stoppage being reported as feed latency. It read 211s while the feed was
   * healthy and 50 seconds slow. */
  const ours = typeof state.publishLagMs === 'number'
    ? Math.round(state.publishLagMs / 1000) : null;

  const rows = el('div', 'lg-tvlag-rows');
  const row = (k, v) => {
    const r = el('div', 'lg-tvlag-row');
    r.append(el('span', 'lg-tvlag-k', k), el('span', 'lg-tvlag-v num', v));
    rows.appendChild(r);
  };
  row('Your TV, behind the stadium', tv + 's');
  if (ours != null) row('The feed, behind the stadium', ours + 's');
  if (ours != null) {
    const edge = ours - tv;
    row(edge > 0 ? 'You see it before we ask, by' : 'We ask before you see it, by',
      Math.abs(edge) + 's');
  }
  rows.appendChild(el('div', 'lg-tvlag-n2', `${gaps.length} sample${gaps.length > 1 ? 's' : ''}`));
  c.appendChild(rows);
  return c;
}

function waitingCard(state, now) {
  const c = el('div', 'card lg-call is-waiting');
  c.appendChild(el('div', 'lg-waiting', 'Waiting for the snap…'));
  /* 🔴 THE NUGGET LIVES IN THIS TILE. Jason, 2026-09-10: "A time out is a
   * great time for a nugget." / "In the waiting for the snap tile." / "Also 2
   * min warning." The tile is already the thing on screen while nothing is
   * happening, so it carries one true line during any stoppage - timeout,
   * commercial, two-minute warning, end of a quarter, halftime - instead of
   * a second card appearing beside it. */
  const n = state ? nuggetCard(state, now || Date.now()) : null;
  if (n) {
    for (const k of [...n.childNodes]) c.appendChild(k);
    c.classList.add('has-nugget');
  }
  return c;
}

/* ONE GLYPH PER KIND OF MOMENT. Jason: "you can highlight big moments or
 * highlights with a emoji."
 *
 * The play-by-play replaced a highlight card, and the risk in that trade was
 * losing the ability to SCAN - twenty-five rows of identical grey text is a
 * transcript, and a transcript is read rather than glanced at. A glyph at the
 * head of a row is found by the eye before any of the words are, which is the
 * job the old card was doing badly.
 *
 * IT IS THE DETECTOR'S EVENT, NEVER A GUESS FROM THE TEXT. Same rule as the
 * star: the parser already says what kind of moment this was, and a view that
 * works it out again from the prose gets it wrong - which is how a tackler
 * became a ball carrier and how a punt became a big play.
 *
 * Deliberately short. Anything needing explanation does not belong in a glyph,
 * and a row with no entry gets none rather than a shrug. */
const MOMENT_EMOJI = {
  touchdown: '\u{1F3C8}',
  safety: '\u{1F6E1}\uFE0F',
  field_goal: '\u{1F3AF}',
  interception: '\u{1F91A}',
  fumble: '\u{1F4A5}',
  turnover: '\u{1F501}',
  downs: '\u{1F501}',
  big_play: '\u26A1',
  fourth_down: '\u{1F3B2}',
  red_zone: '\u{1F3AF}',
  overtime: '\u23F1\uFE0F',
  close_game: '\u23F1\uFE0F'
};

/* THE FIELD, IN PERSPECTIVE. Jason sent a picture of what he meant after two
 * flat attempts got "booo on the field" and "it look terrible": a field seen
 * from the side and slightly above, bright turf, dark end zones, goalposts,
 * numbers painted both ways, sitting on a slab.
 *
 * SO THE THING HE ASKED FOR TWICE WAS NEVER FLATNESS. "we have a 2d/3d motion
 * graphic before, right?" - I checked sports-live, found a flat 2D SVG, and
 * answered the question I had asked myself instead of the one he asked. The
 * old field is what he remembered LIKING; the picture is what he wants NOW,
 * and those are different claims. A reference image ends an argument that
 * three rounds of adjectives could not.
 *
 * HOW THE PROJECTION WORKS, because it is the whole trick and it is small:
 * every point is given in FIELD coordinates - u along the length, 0 at the
 * left of the window and 1 at the right; v across the width, 0 at the far
 * touchline and 1 at the near one - and `pt()` maps that onto a trapezium
 * whose top edge is shorter than its bottom. Nothing is drawn in screen
 * coordinates, so the markings cannot drift out of agreement with each other.
 *
 * v is eased before it is used. Real foreshortening is projective, not linear,
 * and a linear field reads as a wonky rectangle rather than as ground; one
 * exponent is enough to fix that at this size and costs nothing.
 *
 * STILL A WINDOW, and still for the reason he gave: "we probably dont need the
 * entire field, maybe 30-40 yards max. enough context but make it all
 * readable." A hundred yards in perspective puts the far numbers under a
 * pixel. Forty yards is legible AND says where you are.
 */
const FIELD_WINDOW_YDS = 40;

/* THE CAMERA MOVES; IT DOES NOT CUT. Jason: "can you move the field and/or
 * ball? not a quick regeneration? it is choppy."
 *
 * It was choppy because it was a regeneration. paint() rebuilds the whole
 * screen on every poll, so the field was thrown away and drawn again from
 * scratch five times a second - and when the ball moved eight yards, the
 * window jumped eight yards between two frames. Nothing was animating because
 * nothing survived long enough to animate.
 *
 * TWO THINGS HAD TO CHANGE AND ONLY ONE OF THEM IS THE TWEEN. The node itself
 * now persists across repaints - it is kept on S and re-appended rather than
 * rebuilt, so appendChild MOVES it instead of replacing it. A transition needs
 * something continuous to happen to, and a component that is destroyed every
 * cycle can never have one however it is styled.
 *
 * Then the window centre is eased from where it was to where it should be over
 * ~700ms, redrawing the markings each frame. Redrawing rather than
 * transforming, because the perspective FAN is centred on the camera: pan a
 * fixed fan and the vanishing point slides off with it, which looks like the
 * stadium leaning over. Recomputing is what keeps the geometry honest, and at
 * ~200 nodes it is cheap enough to do at frame rate for two thirds of a second.
 *
 * easeOutCubic, because a camera operator decelerates onto a spot and never
 * arrives at full speed. A linear pan is the other kind of wrong. */
/* 1 -> 1ST. Used for the quarter and the down, which a bug writes the same way
 * because they are the same kind of word. Overtime is OT, not 5TH. */
const ORDINAL = { 1: '1ST', 2: '2ND', 3: '3RD', 4: '4TH', 5: 'OT', 6: '2OT' };

const FIELD_PAN_MS = 700;
let FIELD_CAM = null;   /* where the camera is now, in yards */
let FIELD_RAF = null;

/* The midfield crest, decoded once and held for the life of the page - see
   drawField. Keyed by URL, so switching games does not refetch the first. */
const MIDFIELD_KEEP = {};

function panField(node, target, draw) {
  if (FIELD_CAM == null) { FIELD_CAM = target; draw(node, FIELD_CAM); return; }
  if (Math.abs(target - FIELD_CAM) < 0.05) { draw(node, FIELD_CAM); return; }
  const from = FIELD_CAM, t0 = performance.now();
  if (FIELD_RAF) cancelAnimationFrame(FIELD_RAF);
  const step = (now) => {
    const k = Math.min(1, (now - t0) / FIELD_PAN_MS);
    const e = 1 - Math.pow(1 - k, 3);
    FIELD_CAM = from + (target - from) * e;
    draw(node, FIELD_CAM);
    /* Stop when the node leaves the document - a screen change must not leave
       an animation running against a detached tree for ever. */
    if (k < 1 && node.isConnected) FIELD_RAF = requestAnimationFrame(step);
    else FIELD_RAF = null;
  };
  FIELD_RAF = requestAnimationFrame(step);
}

/* WHERE THE BALL IS SHOWN, which is not always where the spot is. Jason: "the
 * ball is on the 0".
 *
 * He is right and it cannot be anything else: there is no such thing as first
 * and goal at the nought. A spot of zero yards to the end zone only ever means
 * the ball CROSSED the line, so drawing it balanced on the paint is drawing a
 * position that does not occur in football. It should be in the end zone,
 * because that is where it is.
 *
 * Both the camera and the frame ask this, so they cannot disagree - the pan
 * targeting one yard and the marker drawn at another is the sort of bug that
 * looks like a rendering glitch and is actually two opinions. */
/* 🔴 THE FIELD IS FIXED TO THE STADIUM, NOT TO WHOEVER HAS THE BALL. Jason:
 * "it seems like the possession arrow is always pointing to the right?" - it
 * was, and the reason was that the whole picture was drawn from the offense's
 * point of view: position was 100 minus yards-to-goal, so forward was always
 * rightward and the chevrons could only ever point one way.
 *
 * That had a real benefit - "forward" never changed meaning, and on a 40-yard
 * window with no end zone in sight the direction of a drive is otherwise
 * genuinely ambiguous. It also had two costs. The field MIRRORED on every
 * change of possession, so the ball appeared to leap across the screen having
 * not moved; and the chevrons carried only colour, never direction, which is
 * half a mark doing nothing.
 *
 * Now: 0 is the away team's own goal line, 100 is the home team's, and that
 * never changes. The away side attacks rightward, the home side leftward, the
 * same way a camera on the halfway line sees it - which is what is on the
 * television next to the phone.
 *
 * 🔴 EVERYTHING GEOMETRIC ON THIS GRAPHIC NOW GOES THROUGH THESE TWO
 * FUNCTIONS. The spot, the first-down line, the direction of the chevrons and
 * the end zone that counts as "theirs" all derive from the same pair, so they
 * cannot end up disagreeing about which way the game is being played. */
function attackDir(state) {
  const off = state && state.situation && state.situation.offenseTeamId;
  if (!off) return 1;
  return String(off) === String(state.awayTeamId) ? 1 : -1;
}

/* 🔴 WHICH WAY IS THE TELEVISION? Jason, 2026-09-10: "We need to know which
 * way the teams are playing on the tv. When it is backwards, it is weird to
 * watch. After the start, ask the person to tell us which way the offense is
 * playing. Then set the arrow correctly."
 *
 * The field is fixed to the stadium - away attacks right - which matches the
 * broadcast camera half the time and mirrors it the other half. The feed
 * cannot say which end the camera is on, and the person holding the phone is
 * looking straight at the answer. So we ask, once.
 *
 * ONE ANSWER COVERS A HALF. Teams change ends after the first and third
 * quarters, so an answer in Q1 fixes Q2 as its mirror, and likewise Q3/Q4.
 * Across halftime the ends are chosen again, so the question comes back once
 * in the third quarter; each overtime period asks for itself.
 *
 * Kept per game on this device - it is a fact about their television, not
 * about the game, and nobody else's answer is any use to them. */
const TV_MEMO = {};
function tvRead() {
  const k = S.key || '';
  if (k in TV_MEMO) return TV_MEMO[k];
  let v = null;
  try { v = JSON.parse(localStorage.getItem('ag.tv.' + k) || 'null'); } catch { v = null; }
  return (TV_MEMO[k] = v);
}
function tvWrite(v) {
  const k = S.key || '';
  TV_MEMO[k] = v;
  try { localStorage.setItem('ag.tv.' + k, JSON.stringify(v)); } catch { /* memory only */ }
}
function quarterOf(state) {
  const si = state && state.situation;
  if (si && si.quarter) return Number(si.quarter);
  const p = state && state.plays && state.plays[state.plays.length - 1];
  return p && p.quarter ? Number(p.quarter) : 0;
}
const halfOf = (q) => (q >= 5 ? 'ot' + q : q <= 2 ? 'h1' : 'h2');
/* null = not known for this part of the game; true = draw it mirrored. */
function tvMirrorOf(state) {
  const a = tvRead();
  if (!a) return null;
  if (a.none) return false;
  const q = quarterOf(state);
  if (!q || !a.q || halfOf(a.q) !== halfOf(q)) return null;
  return q === a.q ? !!a.flip : !a.flip;
}

function tvAsk(state, wrap) {
  if (!state || state.status === 'pre' || state.status === 'final') return null;
  if (tvMirrorOf(state) !== null) return null;
  const si = state.situation || {};
  const off = si.offenseTeamId && state.teams ? state.teams[si.offenseTeamId] : null;
  const q = quarterOf(state);
  if (!off || !q) return null;
  const card = el('div', 'card lg-tvask');
  /* The nickname, same as the questions: "Which way are the Hurricanes going",
     not "Which way is MIA going". */
  const who = off.nick ? 'are the ' + off.nick : 'is ' + (off.short || off.abbrev || 'the offense');
  card.appendChild(el('div', 'lg-tvask-h', `Which way ${who} going on your TV?`));
  const row = el('div', 'lg-tvask-row');
  /* The answer is where the OFFENSE is heading on their screen. Mirror when
     that disagrees with the way the field draws them. */
  const pick = (screen) => () => {
    tvWrite({ q, flip: attackDir(state) !== screen, at: Date.now() });
    paint(wrap);
  };
  const L = el('button', 'lg-tvask-b', '← Left'); L.type = 'button'; L.onclick = pick(-1);
  const R = el('button', 'lg-tvask-b', 'Right →'); R.type = 'button'; R.onclick = pick(1);
  row.append(L, R);
  card.appendChild(row);
  card.appendChild(el('p', 'lg-tvask-note', q >= 5
    ? 'Overtime picks its own end, so we ask again.'
    : 'We turn the field with them at the end of each quarter, and ask again after halftime.'));
  const N = el('button', 'lg-tvask-n', 'Not watching on TV');
  N.type = 'button';
  N.onclick = () => { tvWrite({ none: true, q }); paint(wrap); };
  card.appendChild(N);
  return card;
}

/* The correction, always one tap away once there is an answer - a wrong tap
   on the question must not leave the field backwards for a whole half. */
function tvFlipButton(state, wrap) {
  if (!state || state.status === 'pre' || state.status === 'final') return null;
  const m = tvMirrorOf(state);
  if (m === null) return null;
  const b = el('button', 'lg-tvflip', '⇄');
  b.type = 'button';
  b.setAttribute('aria-label', 'Flip the field to match your TV');
  b.onclick = () => { tvWrite({ q: quarterOf(state), flip: !m, at: Date.now() }); paint(wrap); };
  return b;
}

function spotYard(state) {
  const si = state && state.situation;
  const ytg = si && typeof si.yardsToGoal === 'number' ? si.yardsToGoal : null;
  if (ytg == null) return null;
  const dir = attackDir(state);
  /* Distance to the defending end zone, turned into a fixed field position:
     the away side counts up toward 100, the home side down toward 0. */
  const pos = dir === 1 ? 100 - ytg : ytg;
  const p = state.plays && state.plays[state.plays.length - 1];
  const t = p ? ((p.typeText || '') + ' ' + (p.text || '')) : '';
  const scored = !!(p && p.scoringPlay) && /touchdown/i.test(t);
  /* Four yards past the line they crossed - far enough to be unmistakably in,
     and on the correct side now that either end can be the scoring one. */
  return scored ? (dir === 1 ? 104 : -4) : pos;
}

/* 🔴 ONE PLACE DECIDES WHAT COLOUR A TEAM IS ON THIS SCREEN. Jason: "the
 * posession arrow did not change color when the team changed."
 *
 * It could not. The chevrons read `team.primary` straight off the feed, and
 * New England and Seattle both ship 002a5c - the same navy, to the byte. So
 * possession flipped and the mark stayed exactly as it was, which is worse
 * than having no colour at all: it actively said nothing had changed.
 *
 * 🔴 THIRD TIME THIS CLASH HAS BITTEN, AND THE FIRST TWO WERE FIXED LOCALLY.
 * teamChip has `adjacentTo` for the slate, the scorebug grew its own
 * resolution an hour ago, and the field then grew a third path that skipped
 * both. Each fix was correct where it was written and none of them was
 * reachable from anywhere else, which is how the same bug arrives three times
 * wearing different clothes.
 *
 * So the decision moves out here and everything asks it. The away side gives
 * way when the two clash - the home team's colour is the stable one because
 * the spread and the field are quoted on it - and a side whose secondary
 * clashes too gets null, which callers render as neutral. */
/* 🔴 WHICH LEAGUE THIS GAME IS, FROM THE PAYLOAD - NEVER FROM THE KEY.
 *
 * This existed FIVE TIMES in this file as
 *
 *     (S.key || '').split(':')[0] === 'nfl' ? 'nfl' : 'college-football'
 *
 * which reads the league out of a STRING that usually contains it. Anything
 * that is not literally 'nfl' before the colon is college, so a key of
 * `rehearsal:live` - or any key we invent later - is silently college.
 *
 * 🔴 WHAT IT COST, FOUND BY REPLAYING A REAL GAME: the scorebug drew
 * CLAREMONT-MUDD-SCRIPPS and UCLA over New England at Seattle, with play text
 * reading "to SEA 11". The names and colours were right, because those come
 * from the payload. Only the crests were wrong, because logoUrl builds
 * `/logos/<league>/<id>.png` and NFL 17 is New England while college 17 is
 * CMS. A real crest, for a real team, and nothing anywhere errors.
 *
 * Fourth filename-as-truth bug in this repo - after the test suite's league
 * detection, replay.mjs's sport, and idFromRef - and the same fix as all
 * three: read the field that states the fact instead of parsing a name that
 * usually implies it. The payload carries `sport`. Use it.
 *
 * The key is kept as the fallback for the one case where there is no payload
 * yet - the first paint, before the first poll returns. */
function leagueOf(state) {
  const fromFeed = state && state.sport;
  if (fromFeed === 'nfl' || fromFeed === 'college-football') return fromFeed;
  return (S.key || '').split(':')[0] === 'nfl' ? 'nfl' : 'college-football';
}

function teamPalette(state) {
  const away = state.teams[state.awayTeamId], home = state.teams[state.homeTeamId];
  const ap = normalizeColor(away && away.primary);
  const hp = normalizeColor(home && home.primary);
  if (!tooClose(ap, hp)) return { away: ap, home: hp };
  const as = normalizeColor(away && away.secondary);
  if (as && !tooClose(as, hp)) return { away: as, home: hp };
  return { away: null, home: hp };
}

function teamColor(state, id) {
  const p = teamPalette(state);
  return String(id) === String(state.awayTeamId) ? p.away : p.home;
}

/* 🔴 EVERY WAY OF SCORING GETS THE BANNER, NOT JUST THE ONE I BUILT FIRST.
 * Jason: "why dont we display field goal like we did for touchdown?"
 *
 * No reason. The banner was written the night a touchdown happened to be on
 * screen, and it tested for a touchdown - so a field goal, the second most
 * common way a drive ends, passed under it in silence. That is not a design
 * decision, it is the first case standing in for the category.
 *
 * A missed kick is in here too. It is not a score, but it is the same KIND of
 * moment - a drive ending on one swing, with somebody's marbles riding on it -
 * and a board that shouts about the make and says nothing about the miss is
 * only telling half of what just happened.
 *
 * Matched on the feed's own words, which spell it out: "A.Borregales extra
 * point is GOOD", "field goal is No Good". */
function bannerFor(play) {
  if (!play) return null;
  const t = (play.typeText || '') + ' ' + (play.text || '');
  if (play.scoringPlay && /touchdown/i.test(t)) return 'TOUCHDOWN';
  if (play.scoringPlay && /safety/i.test(t)) return 'SAFETY';
  if (/field goal is good/i.test(t)) return 'FIELD GOAL';
  if (/field goal is no good|field goal.*blocked/i.test(t)) return 'NO GOOD';
  return null;
}

/* 🔴 THE MOMENT, ON THE FIELD. Jason, 2026-09-10: "Maybe flash touchdown on
 * the field when it happens, same with field goal. Same with the end of the
 * quarter, half and end of the game."
 *
 * The banner above the scorebug already names a score - small, and above the
 * thing everybody is actually looking at. The field is the subject of this
 * screen, so a score or a break is written ACROSS it, big, the way a
 * broadcast wipes one over the picture.
 *
 * TWO LIFETIMES, BECAUSE THEY ARE TWO KINDS OF THING. A score is an EVENT: it
 * flashes, holds about twelve seconds of held time, and gets out of the way
 * so you can see the kickoff you are about to be asked about. A break is a
 * STATE: nothing is happening on the field, so the word stays until the next
 * snap. Timeouts and commercial breaks are not written across it - they are
 * pauses, not chapters, and the bar under the field already says them.
 *
 * 🔴 IT FLASHES ONCE. paint() rebuilds this screen every five seconds, so a
 * CSS animation on a fresh node would replay forever. `fresh` is set only on
 * the first paint that shows a given play; after that the node is drawn still.
 *
 * Aged by the HELD clock (now - delay - wallclock), never by when this device
 * first saw it: a touchdown is new when it becomes visible to you, and opening
 * the app ten minutes after one must not celebrate it. */
const FLASH_SCORE_MS = 12000;
function flashFor(state, now) {
  const plays = (state && state.plays) || [];
  const lp = plays[plays.length - 1];
  S.flashShown = S.flashShown || {};
  const mark = (id) => {
    const fresh = !S.flashShown[id];
    S.flashShown[id] = true;
    return fresh;
  };
  if (state && state.status === 'final') {
    return { word: 'FINAL', kind: 'break', fresh: mark('final:' + S.key) };
  }
  if (!lp) return null;
  const word = bannerFor(lp);
  if (word) {
    const age = lp.wallclockMs ? now - (S.delayMs || 0) - lp.wallclockMs : 0;
    if (age > FLASH_SCORE_MS) return null;
    return { word, kind: word === 'NO GOOD' ? 'miss' : 'score',
             teamId: lp.offenseTeamId, fresh: mark(lp.id) };
  }
  const st = stoppageOf(lp);
  if (!st) return null;
  let w = null;
  if (st.label === 'Half time') w = 'HALFTIME';
  else if (st.label === 'Final') w = 'FINAL';
  else if (st.label === 'End of the quarter') w = lp.quarter >= 5 ? 'END OF OT' : 'END OF Q' + (lp.quarter || '');
  if (!w) return null;
  return { word: w, kind: 'break', fresh: mark(lp.id) };
}

function flashNode(f, state, solo) {
  const n = el('div', 'lg-flash' + (solo ? ' lg-flash-solo' : ''));
  n.dataset.kind = f.kind;
  if (f.fresh) n.dataset.fresh = 'true';
  n.setAttribute('role', 'status');
  /* The scorer's color, same as the banner above - a touchdown in the color
     of whoever scored it is two facts in one mark. */
  const c = f.teamId ? teamColor(state, f.teamId) : null;
  if (c) n.style.setProperty('--tc', c);
  n.appendChild(el('span', 'lg-flash-w', f.word));
  return n;
}

/* 🔴 A COUNTDOWN THAT COUNTS. Jason, 2026-09-10: "if the game has not started
 * a countdown to the game start." The Upcoming card said "Kicks in 3h 12m",
 * refreshed every five seconds - a label, not a countdown. Inside 24 hours it
 * is now a clock that ticks every second.
 *
 * It sits UNDER the matchup, not over it. On 2026-09-09 he said the days "seem
 * like the most important thing here, which it is not", so the fixture stays
 * the headline and the countdown is its second line, just a live one.
 *
 * One ticker for the page, writing into text nodes only - it never calls
 * paint(), so it cannot fight the five-second rebuild. It stops itself when
 * nothing on the page is counting. */
function countdownText(ms) {
  if (ms <= 0) return 'Now';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  const p = (v) => String(v).padStart(2, '0');
  return (h ? h + ':' + p(m) : String(m)) + ':' + p(x);
}
function armCountdown() {
  if (window.__agCountdown) return;
  window.__agCountdown = setInterval(() => {
    const vs = document.querySelectorAll('.lg-countdown-v[data-kick]');
    if (!vs.length) { clearInterval(window.__agCountdown); window.__agCountdown = null; return; }
    for (const v of vs) {
      const ms = Number(v.dataset.kick) - Date.now();
      v.textContent = countdownText(ms);
      const l = v.parentNode && v.parentNode.querySelector('.lg-countdown-l');
      if (l) l.textContent = ms <= 0 ? 'Kickoff' : 'Kickoff in';
    }
  }, 1000);
}

/* 🔴 THE GAME SELECTOR. Jason: "after hitting call it live, what will it look
 * like on days with multiple games within a close time frame and or at the
 * same time." Then: "Make a game selector."
 *
 * The honest answer to the question was that it looked like ONE game, chosen
 * for you. nextGameKey() sorted the week by kickoff and took the first
 * non-final one, which is a sensible rule when a single game is on and an
 * arbitrary one when eight kick within a minute of each other. Sunday would
 * have shown a game nobody picked with no way to leave it.
 *
 * 🔴 IT ONLY DRAWS WHEN THERE IS A CHOICE TO MAKE. One game on the wire and
 * the strip is absent - a picker with a single option is furniture that
 * teaches you to ignore pickers. Thursday and Monday look exactly as they do
 * now; Sunday grows a row.
 *
 * Live games come first and are marked, because that is what somebody opening
 * this screen means by "what is on". Upcoming ones follow in kickoff order so
 * you can arm the next one before it starts. Finals are dropped: there is
 * nothing left to call, and the record of what you called is on the board.
 */
function gameStrip(wrap) {
  const also = alsoFor(wrap, Date.now());
  const games = (also && also.games) || [];
  const sp = also ? also.sport : S.sport;
  const mine = games
    .filter((g) => g && g.id && g.status !== 'final' && g.status !== 'void')
    .sort((a, b) => {
      const live = (x) => (x.status === 'in_progress' ? 0 : 1);
      return live(a) - live(b) || a.kickoffUtc - b.kickoffUtc;
    });
  if (mine.length < 2) return null;

  const nowKey = String(S.key || '');
  const strip = el('div', 'lg-games ag-scroll-x');
  strip.setAttribute('role', 'group');
  strip.setAttribute('aria-label', 'Choose a game');

  for (const g of mine) {
    const key = sp + ':' + g.id;
    const b = el('button', 'lg-gamechip');
    b.type = 'button';
    if (key === nowKey) { b.dataset.on = 'true'; b.setAttribute('aria-current', 'true'); }
    if (g.status === 'in_progress') b.dataset.live = 'true';

    const byId = {};
    for (const t of (g.teams || [])) byId[String(t.id)] = t;
    const away = byId[String(g.awayTeamId)], home = byId[String(g.homeTeamId)];
    b.appendChild(el('span', 'lg-gamechip-t',
      ((away && away.abbrev) || '?') + ' @ ' + ((home && home.abbrev) || '?')));
    /* Live games show the score, upcoming ones the time. The same slot, and
       it is always the thing you would ask about that game right now. */
    /* 🔴 THE GAME ON SCREEN TAKES ITS SCORE FROM THE BOARD, NOT THE SLATE.
     * The slate is a ten-minute cron capture, so on SF at LAR the chip read
     * 0-0 directly above a scoreboard reading 3-0. The held state is the one
     * the scoreboard draws - same delay, so the chip cannot spoil a score the
     * board has not shown yet. Other games have only the slate to go on. */
    let sc = g;
    if (key === nowKey && S.raw) {
      try { sc = held(S.raw, S.delayMs, Date.now()) || g; } catch { sc = g; }
    }
    b.appendChild(el('span', 'lg-gamechip-s num', g.status === 'in_progress'
      ? ((sc.awayScore ?? 0) + '–' + (sc.homeScore ?? 0))
      : new Date(g.kickoffUtc).toLocaleTimeString(undefined,
          { hour: 'numeric', minute: '2-digit' })));

    b.onclick = () => {
      if (key === nowKey) return;
      /* 🔴 FORCED, so refreshKey() stops choosing for them. Without this the
       * five-minute key refresh would quietly drag the screen back to
       * whatever it thinks is next, and the person's choice would appear to
       * undo itself for no visible reason. */
      S.forced = true;
      S.key = key;
      /* Everything held is about the OLD game. Carrying any of it across is
       * how a board ends up showing one game's score over another's plays. */
      S.raw = null; S.board = []; S.noGame = false;
      S.fieldNode = null; FIELD_CAM = null;
      if (FIELD_RAF) { cancelAnimationFrame(FIELD_RAF); FIELD_RAF = null; }
      /* Ask the server to make sure something is polling it. The cron starts
         pollers for live games every ten minutes; this closes the gap for
         somebody who picks a game in between. */
      try { fetch('/api/poller/ensure?game=' + encodeURIComponent(g.id)
        + '&sport=' + encodeURIComponent(sp)).catch(() => {}); } catch { /* offline */ }
      paint(wrap);
      poll(wrap);
    };
    strip.appendChild(b);
  }
  return strip;
}

function fieldStrip(state) {
  const si = state && state.situation;
  const ytg = si && typeof si.yardsToGoal === 'number' ? si.yardsToGoal : null;
  const teams = (state && state.teams) || {};
  const off = si && si.offenseTeamId ? teams[si.offenseTeamId] : null;
  if (ytg == null || ytg < 0 || ytg > 100) return null;

  /* Yards from the offense's own goal line, so the picture runs left to right
     the way they are attacking. */
  const ball = spotYard(state);
  if (ball == null) return null;

  /* The node outlives the repaint. Everything below draws INTO it. */
  const wrapNode = S.fieldNode || (S.fieldNode = el('div', 'lg-field'));
  panField(wrapNode, ball, (node, cam) => drawField(node, state, ball, cam));
  return wrapNode;
}

/* One frame of the field, at a camera position that may be mid-pan. Separated
 * from fieldStrip so the tween has something to call sixty times a second
 * without re-deciding anything about the game. */
function drawField(wrap, state, ball, cam) {
  const si = state.situation;
  /* 🔴 DECLARED AT THE TOP, BECAUSE HALF THIS FUNCTION USES IT. I introduced
   * `dir` beside the first-down line, which is two thirds of the way down -
   * and the red zone, the red 20-yard line and the end zones all read it
   * ABOVE that point. `const` is hoisted but not initialised, so every one of
   * them threw "Cannot access 'dir' before initialization", the render died
   * after the scorebug, and the entire screen below it went blank.
   *
   * Fifth temporal dead zone in this file. The pattern every time is the
   * same: a value introduced where it was first needed, in a function that
   * needed it earlier too. Declare it where the function starts. */
  const dir = attackDir(state);
  /* 🔴 THE TELEVISION'S ORIENTATION, applied in ONE place: the yard-to-screen
     mapping. Everything drawn by yard follows it for free; only the two marks
     drawn in screen space - the number triangles and the chevrons - read
     screenDir instead of dir. See tvMirrorOf. */
  const tvMirror = tvMirrorOf(state) === true;
  const screenDir = tvMirror ? -dir : dir;
  /* From the SITUATION, never from the drawn ball - the two differ on a score,
     and the caption must say the real distance rather than the one implied by
     where the marker was put. */
  const ytg = typeof si.yardsToGoal === 'number' ? si.yardsToGoal : Math.max(0, 100 - ball);
  const teams = (state && state.teams) || {};
  const off = si && si.offenseTeamId ? teams[si.offenseTeamId] : null;
  const H = FIELD_WINDOW_YDS / 2;
  let lo = cam - H, hi = cam + H;
  /* The window keeps its width at the ends. A window that shrinks changes the
     scale, and a scale that moves is one nobody can read a distance off. */
  if (lo < -12) { lo = -12; hi = lo + FIELD_WINDOW_YDS; }
  if (hi > 112) { hi = 112; lo = hi - FIELD_WINDOW_YDS; }

  /* WIDE AND SHORT, AND IT BLEEDS OFF EVERY EDGE. Jason sent the reference a
   * second time to be clear which one he meant: it is a 3.3:1 crop where the
   * turf runs out of frame on all four sides. Mine was 2.5:1 sitting on a slab
   * with air around it - a picture OF a field. His is a view FROM the
   * touchline, and the difference is entirely that the frame cuts the ground
   * off rather than containing it. */
  const W = 400, VH = 122;
  /* The trapezium: far edge inset and short, near edge wide and low. */
  /* MILD perspective, from his second reference: the yard lines tilt, they do
     not converge on a vanishing point. A strong trapezium turns a 40-yard
     window into a wedge and the far numbers vanish - which is the legibility
     complaint that started this. */
  const TL = [-8, -2], TR = [408, -2], BR = [474, 116], BL = [-74, 116];
  const NS = 'http://www.w3.org/2000/svg';

  /* u: 0..1 along the window. v: 0 far touchline, 1 near. */
  const pt = (u, v) => {
    const e = Math.pow(Math.min(1, Math.max(0, v)), 1.12);
    const tx = TL[0] + (TR[0] - TL[0]) * u, ty = TL[1] + (TR[1] - TL[1]) * u;
    const bx = BL[0] + (BR[0] - BL[0]) * u, by = BL[1] + (BR[1] - BL[1]) * u;
    return [tx + (bx - tx) * e, ty + (by - ty) * e];
  };
  const U = (yard) => { const u = (yard - lo) / (hi - lo); return tvMirror ? 1 - u : u; };
  const P = (yard, v) => pt(U(yard), v);
  const xy = (a) => a[0].toFixed(2) + ',' + a[1].toFixed(2);
  const mk = (tag, attrs, text) => {
    const e = document.createElementNS(NS, tag);
    for (const k of Object.keys(attrs)) e.setAttribute(k, String(attrs[k]));
    if (text != null) e.textContent = text;
    return e;
  };
  /* A quad between two yard lines, which is how every band on this field is
     drawn - turf stripes, end zones, the red zone. */
  const quad = (y0, y1, cls, extra) => {
    const a = P(Math.max(y0, lo), 0), b = P(Math.min(y1, hi), 0);
    const c = P(Math.min(y1, hi), 1), d = P(Math.max(y0, lo), 1);
    return mk('polygon', Object.assign({ points: [xy(a), xy(b), xy(c), xy(d)].join(' '), class: cls }, extra || {}));
  };

  wrap.textContent = '';

  /* "0 YARDS TO THE END ZONE" IS NOT A SENTENCE ABOUT A FOOTBALL GAME. Jason,
   * looking at the goal line: "what is this telling me touchdown?"
   *
   * It was telling him nothing, and the fault is a unit label wrapped around a
   * number with no check on what the number means. Zero yards to the end zone
   * is not a distance - it is an EVENT, and which event depends on the play:
   * the ball crossed the line, or it is sitting on it. The app knows which,
   * because the play says so, and it was throwing that away to print
   * arithmetic.
   *
   * A distance of zero is the classic case where a template stops being true.
   * The rest of the time "68 yards to the end zone" is exactly right; at the
   * boundary it needs a different sentence, not a smaller number. */
  const lastVis = state.plays && state.plays[state.plays.length - 1];
  const lastTxt = lastVis ? ((lastVis.typeText || '') + ' ' + (lastVis.text || '')) : '';
  const scored = !!(lastVis && lastVis.scoringPlay) && /touchdown/i.test(lastTxt);
  const scoredBy = scored && lastVis.offenseTeamId && teams[lastVis.offenseTeamId];

  const cap = el('div', 'lg-fieldcap');
  const leftTxt = scored
    ? ('Touchdown' + (scoredBy ? ' — ' + (scoredBy.abbrev || scoredBy.short) : ''))
    : (si.downDistanceText || (ytg === 0 ? 'On the goal line' : ''));
  if (leftTxt) cap.appendChild(el('span', '', leftTxt));
  /* No distance line when the distance is the thing that just happened, and
     none when there is no sentence to put it beside. */
  if (!scored && ytg > 0) {
    const right = el('span', '');
    right.appendChild(el('b', '', String(ytg)));
    /* "96 yards to the end zone", not "96 to the end zone". Jason: "52 'yards'
       to the end zone". A bare number beside a picture of a field could be a
       yard line, a down or a score - the unit is what makes it a distance. */
    right.appendChild(document.createTextNode(' yards to the end zone'));
    cap.appendChild(right);
  }

  const svg = mk('svg', {
    viewBox: '0 0 ' + W + ' ' + VH, class: 'lg-fieldsvg', role: 'img',
    'aria-label': ((off && off.abbrev ? off.abbrev + ' ' : '') + (si.downDistanceText || '')
      + ', ' + ytg + ' yards to the end zone')
  });

  /* No slab. The turf runs off the frame; there is nothing for it to sit on
     because you are standing on the touchline, not looking at a model. */
  svg.appendChild(quad(lo, hi, 'lg-f-turf'));
  /* Mown stripes every five yards, which is what makes green ground read as a
     pitch and not as a bar. */
  for (let a = Math.floor(lo / 10) * 10; a < hi; a += 10) {
    if (a + 5 <= lo) continue;
    svg.appendChild(quad(a, a + 5, 'lg-f-mow'));
  }
  /* End zones, only when the window reaches one. */
  if (lo < 0) svg.appendChild(quad(lo, 0, 'lg-f-ez'));
  if (hi > 100) svg.appendChild(quad(100, hi, 'lg-f-ez'));
  /* The red zone, as a region rather than an edge. */
  /* The twenty they are attacking, whichever end that is. */
  if (dir === 1) {
    if (hi > 80) svg.appendChild(quad(Math.max(80, lo), Math.min(100, hi), 'lg-f-rz'));
  } else if (lo < 20) {
    svg.appendChild(quad(Math.max(0, lo), Math.min(20, hi), 'lg-f-rz'));
  }

  const line = (yard, cls, w) => {
    const a = P(yard, 0), b = P(yard, 1);
    return mk('line', { x1: a[0].toFixed(2), y1: a[1].toFixed(2), x2: b[0].toFixed(2), y2: b[1].toFixed(2),
      class: cls, 'stroke-width': w });
  };

  for (let a = Math.ceil(lo / 5) * 5; a <= hi; a += 5) {
    if (a < 0 || a > 100) continue;
    /* 🔴 THE 20 THEY ARE ATTACKING IS RED. Jason: "can i see a red line instead
       of a white line at the 20yl?" - which is the better answer to the red
       zone than the wash I just removed. A tint over turf muddies because red
       and green are complements; a red LINE sits on top of the turf instead of
       mixing into it, so it stays red at any opacity.
     
       Only yard 80 - the boundary of the end zone they are going for. The 20
       behind them is just a yard line; it becomes the red one the moment
       possession flips, which is correct and happens for free. */
    const red = a === (dir === 1 ? 80 : 20);
    svg.appendChild(line(a, red ? 'lg-f-l20' : (a % 10 === 0 ? 'lg-f-l10' : 'lg-f-l5'),
      red ? 2.6 : (a % 10 === 0 ? 1.6 : 1)));
  }
  /* Hash marks: the texture that says this is a football field and not a
     soccer pitch. Two rows, a yard apart in field space. */
  for (let a = Math.ceil(lo); a <= hi; a += 1) {
    if (a < 0 || a > 100 || a % 5 === 0) continue;
    for (const v of [0.06, 0.36, 0.64, 0.94]) {
      const h0 = P(a, v - 0.03), h1 = P(a, v + 0.03);
      svg.appendChild(mk('line', { x1: h0[0].toFixed(2), y1: h0[1].toFixed(2),
        x2: h1[0].toFixed(2), y2: h1[1].toFixed(2), class: 'lg-f-hash' }));
    }
  }
  /* The near touchline and the apron beyond it - the white band across the
     bottom of his reference, which is what stops the picture looking like a
     texture and starts it looking like somewhere you are standing. */
  const s0 = P(lo, 1), s1 = P(hi, 1);
  svg.appendChild(mk('polygon', {
    points: [xy(s0), xy(s1), (s1[0] + 40) + ',' + VH, (s0[0] - 40) + ',' + VH].join(' '),
    class: 'lg-f-apron'
  }));
  svg.appendChild(mk('line', { x1: s0[0].toFixed(2), y1: s0[1].toFixed(2),
    x2: s1[0].toFixed(2), y2: s1[1].toFixed(2), class: 'lg-f-side' }));

  /* ONE ROW OF NUMBERS, NOT TWO. Jason: "fix the upside down numbers (what is
     this)".
 
     They were the FAR-side numbers, and on grass they are correct - a field is
     painted twice, once for each touchline, so the far set is upside down from
     where you are standing. Both references show them, which is why I drew
     them.
 
     They are still wrong here. On a real field the far numbers are forty yards
     away and read by people sitting opposite; in a 122px strip they are 6px of
     rotated glyph nobody is standing across from. Copying a marking because it
     exists in the reference, without asking what it is FOR, is how you end up
     with a photograph of a thing instead of a drawing of it. */
  for (let a = Math.ceil(lo / 10) * 10; a <= hi; a += 10) {
    if (a <= 0 || a >= 100) continue;
    const label = String(a <= 50 ? a : 100 - a);
    const near = P(a, 0.78);
    svg.appendChild(mk('text', { x: near[0].toFixed(2), y: near[1].toFixed(2),
      class: 'lg-f-num', 'text-anchor': 'middle' }, label));
    /* The triangle beside every number, pointing at the nearer end zone. It is
       on a real field and it is the one marking that tells you which way is
       which without reading anything. */
    if (a !== 50) {
      const dir = (a < 50 ? -1 : 1) * (tvMirror ? -1 : 1);
      const tw = 4.5, tx = near[0] + dir * 15, ty = near[1] - 3.5;
      svg.appendChild(mk('polygon', {
        points: [(tx) + ',' + (ty - tw / 2), (tx) + ',' + (ty + tw / 2),
                 (tx + dir * tw) + ',' + ty].join(' '), class: 'lg-f-tri' }));
    }
  }

  /* Goalposts, when an end zone is actually in shot. Drawn from the back line
     of the end zone, uprights rising toward the viewer's eye. */
  const posts = (yard) => {
    const base = P(yard, 0.5);
    const g = mk('g', { class: 'lg-f-post' });
    g.appendChild(mk('line', { x1: base[0], y1: base[1], x2: base[0], y2: base[1] - 26, 'stroke-width': 2 }));
    g.appendChild(mk('line', { x1: base[0] - 9, y1: base[1] - 26, x2: base[0] + 9, y2: base[1] - 26, 'stroke-width': 2 }));
    g.appendChild(mk('line', { x1: base[0] - 9, y1: base[1] - 26, x2: base[0] - 9, y2: base[1] - 44, 'stroke-width': 2 }));
    g.appendChild(mk('line', { x1: base[0] + 9, y1: base[1] - 26, x2: base[0] + 9, y2: base[1] - 44, 'stroke-width': 2 }));
    return g;
  };
  if (hi >= 110) svg.appendChild(posts(110));
  if (lo <= -10) svg.appendChild(posts(-10));

  /* 🔴 THE HOME CREST AT MIDFIELD. Jason, 2026-09-10: "Can you put the home
   * team logo in the middle of the field at the 50?" It is what the real
   * field has painted there, and it tells you whose stadium you are looking
   * at without reading anything.
   *
   * SIZED BY THE FIELD, NOT IN PIXELS: ten yards wide and the middle 40% of
   * the depth, both measured through the same projection as everything else,
   * so it lies flat on the turf in perspective and scales with the camera.
   * Drawn after the yard lines and before the lines of play and the ball -
   * paint on the grass, under the game.
   *
   * Only when marks are on, the same switch as the scorebug crests. Marks off
   * is still the no-logos product and this adds nothing there. The image is
   * held once in memory: drawField runs every animation frame of a pan and on
   * every five-second repaint, and a crest that re-fetched would blink. */
  if (marksOn() && lo < 50 && hi > 50 && state.homeTeamId) {
    const href = logoUrl({ id: state.homeTeamId }, leagueOf(state), '500');
    if (href) {
      if (!MIDFIELD_KEEP[href]) { const im = new Image(); im.src = href; MIDFIELD_KEEP[href] = im; }
      const xa = P(45, 0.5)[0], xb = P(55, 0.5)[0];
      const w = Math.abs(xb - xa);
      const top = P(50, 0.3)[1], bot = P(50, 0.7)[1];
      const cx = P(50, 0.5)[0];
      svg.appendChild(mk('image', {
        href, x: (cx - w / 2).toFixed(2), y: top.toFixed(2),
        width: w.toFixed(2), height: (bot - top).toFixed(2),
        preserveAspectRatio: 'xMidYMid meet', opacity: 0.9, class: 'lg-f-logo'
      }));
    }
  }

  /* The first-down line in the color every broadcast has used for thirty
     years, and the line of scrimmage in white. */
  const fdYard = si.down && typeof si.distance === 'number' ? ball + dir * si.distance : null;
  if (!scored && fdYard != null && fdYard > lo && fdYard < hi && fdYard >= 0 && fdYard <= 100) {
    svg.appendChild(line(fdYard, 'lg-f-fd', 2.4));
  }
  /* 🔴 NO LINE OF SCRIMMAGE IN THE END ZONE. Jason: "what happened here?" -
   * and one of the two answers is the dark stroke cutting across the end zone
   * on a touchdown. There is no scrimmage after a score; the ball is drawn
   * four yards deep because that is where it ended up, and the code went on
   * drawing a scrimmage line through it because it draws one every frame.
   * A marking that means "the ball is snapped here" has to be absent when
   * nothing is being snapped. */
  /* 🔴 BOTH END ZONES, AND NEVER ON A SCORE. The guard above was `ball <= 100`,
   * which only knows about a touchdown going RIGHT. Jason, 2026-09-10, on
   * FAMU at Miami, a 52-yard run into the LEFT end zone: "We don't need the
   * line of scrimmage in the end zone on a touchdown." The ball was drawn at
   * about -4 and the line went straight through it. `scored` is the play
   * saying so, which is the real condition; the yard range is the backstop
   * for any spot past either goal line. */
  if (!scored && ball >= 0 && ball <= 100) svg.appendChild(line(ball, 'lg-f-los', 2.2));

  /* The ball, sat on the near hash where a spot actually is. */
  /* 🔴 BETWEEN THE HASH ROWS, NOT ON ONE. Jason: "move the ball up 10ish pixels
     to be in the center of the hash marks so it is easier to read, move the
     arrow as well."
   
     It sat at v=0.62, which is the near hash - where a real ball is spotted,
     and that was the reasoning. Wrong priority: the hash rows are the busiest
     texture on the graphic, a dense run of white ticks, and a small brown
     ellipse placed on top of one competes with it. Dead centre between the two
     inner rows is the only clear band on the field, so the ball reads at a
     glance instead of being found.
   
     Realism loses to legibility on a graphic this size - the same call as the
     40-yard window and the deleted far-side numbers. */
  /* 🔴 UP INTO THE FAR BAND, NOW THAT MIDFIELD HAS A CREST. Jason, 2026-09-10:
     "Can we shift the ball and arrows up a little since we have the center
     logo now." The crest fills v 0.3-0.7, which is exactly where the ball
     sat. 0.22 is the other clear band on this field - between the far hash
     row (0.06) and the upper inner row (0.36) - so the ball keeps the
     legibility the 0.5 decision was for and stops sitting on the logo. The
     chevrons read the ball's own y, so they move with it. */
  const BALL_V = 0.22;
  const bp = P(ball, BALL_V);
  /* 🔴 TWICE THE SIZE. Jason: "make the ball 2x larger." It is the subject of
     the graphic and it was the smallest mark on it - smaller than a yard
     number, on a field 400 units wide. The lace scales with it or the shape
     stops reading as a football and becomes a brown pill. */
  svg.appendChild(mk('ellipse', { cx: bp[0].toFixed(2), cy: bp[1].toFixed(2), rx: 12.8, ry: 8,
    class: 'lg-f-ball' }));
  svg.appendChild(mk('line', { x1: (bp[0] - 5.2).toFixed(2), y1: bp[1].toFixed(2),
    x2: (bp[0] + 5.2).toFixed(2), y2: bp[1].toFixed(2), class: 'lg-f-lace' }));

  /* 🔴 CHEVRONS AT THE EDGE. Jason answered the direction question with a
   * picture of three nested chevrons, which is the right answer and beats
   * both of mine.
   *
   * The arrow it replaces failed twice: he asked what it signified, then sent
   * a frame where its head had been clipped off leaving a bare dash beside the
   * ball. An arrow next to a ball reads as a VECTOR - the last play went this
   * way, they gained this much - when what it meant was a compass. Chevrons
   * carry no such claim: nothing is at their tail, so there is nothing they
   * can be describing the movement of. They are the marking a road uses for
   * exactly this reason.
   *
   * DRAWN IN SCREEN COORDINATES, NOT FIELD ONES. Everything else on this
   * graphic is placed in yards so it stays true when the camera pans. These
   * are furniture on the frame - pinned to the right edge, never near the
   * ball, and therefore never clipped, which is the other half of what went
   * wrong with the arrow.
   *
   * The offense always attacks rightward in this coordinate system, so they
   * always point right and never have to be reasoned about. */
  /* 🔴 IN THE COLOUR OF WHOEVER HAS THE BALL. Jason: "can we change the color
   * to match the team with the ball?" - which turns the chevrons from a
   * direction marker into a POSSESSION marker that also says direction. Two
   * facts, one mark, and the second one comes free: if the colour changes,
   * the ball changed hands.
   *
   * 🔴 EACH ONE IS DRAWN TWICE, AND THAT IS NOT BELT AND BRACES. A team colour
   * on turf is a coin flip - Seattle's navy and the Jets' green are both
   * darker than the grass they would sit on, and 402 of 760 schools carry a
   * black or missing primary. The white underlay guarantees the shape reads at
   * any colour, so the tint can be whatever the team's is without anyone
   * having to check it against a green background first. */
  const chevColor = (si.offenseTeamId && teamColor(state, si.offenseTeamId)) || '#ffffff';
  const chev = mk('g', { class: 'lg-f-chev', 'aria-hidden': 'true' });
  /* 🔴 ON THE BALL'S LINE, AND HALF THE DISTANCE IN. Jason: "can the arrow be
   * in the same line top to bottom as the ball? and half way closer to the
   * ball".
   *
   * They were pinned to the middle of the FRAME at a fixed y, which is only
   * the same height as the ball by accident - the field is in perspective, so
   * a point's screen y depends on where it sits across the width AND how the
   * camera has panned. Taking the ball's own y means the two are on one line
   * whatever the projection is doing.
   *
   * Moving them in from the edge is the part that makes them read as related
   * to the ball rather than as decoration parked in the corner. Clamped so
   * they never crowd it when the ball is already near the right edge - the
   * relationship has to survive a goal-line stand. */
  const chevY = bp[1];
  /* They point the way the offense is going, and they sit ahead of the ball
     on that side - both flip together, because a chevron behind the ball
     pointing away from it says nothing at all. */
  /* 🔴 A FIXED GAP FROM THE BALL, NOT A MIDPOINT. Jason: "make the arrows
     closer to the ball." Halfway to the frame edge meant the distance changed
     with field position - tight on a goal-line snap, a mile away at midfield -
     so the chevrons read as related to the ball sometimes and as decoration
     the rest of the time. A constant offset keeps that relationship the same
     on every snap, and the clamp only matters in the last few yards. */
  const chevX = screenDir === 1
    ? Math.min(W - 44, bp[0] + 22)
    : Math.max(44, bp[0] - 22);
  for (let i = 0; i < 3; i++) {
    const x = chevX + screenDir * i * 11, y = chevY;
    const d = 'M' + x + ' ' + (y - 9) + ' L' + (x + screenDir * 8) + ' ' + y
      + ' L' + x + ' ' + (y + 9);
    chev.appendChild(mk('path', { d, class: 'lg-f-chev-u' }));
    const top = mk('path', { d, class: 'lg-f-chev-t' });
    top.setAttribute('stroke', chevColor);
    chev.appendChild(top);
  }
  svg.appendChild(chev);

  wrap.appendChild(svg);
  /* 🔴 NO CAPTION. Jason: "remove this now", of the line under the field.
   *
   * It said "2nd & 8 at SEA 28   72 yards to the end zone" - and by the time
   * he asked, the scorebug two inches above was already saying 2ND & 8 in its
   * own cell, and the field itself was showing the ball on the 28 with the
   * first-down line ahead of it. Three statements of one fact stacked
   * vertically.
   *
   * It earned its place when it was the only thing saying where the ball was.
   * The bug took over the down and distance and the graphic took over the
   * spot, and nobody removed the thing they had replaced - which is how a
   * screen silts up: every element was justified on the day it shipped.
   *
   * The code that builds it is kept a few lines up because the touchdown and
   * goal-line wording it works out is still the honest way to say those, and
   * it will be wanted the first time the field is shown somewhere without a
   * bug over it. */
}

function downLine(state) {
  /* 🔴 NULL-SAFE ON THE STATE ITSELF, NOT JUST ON THE SITUATION. Moving this out
   * of the call card moved it OUT of a branch that had already proved there was
   * a state, into the main body of paint() where there may not be one yet - and
   * `state.situation` on null throws, which takes the whole render with it and
   * leaves a blank page with no console error to find. That is what Jason
   * photographed as an empty live screen thirty seconds after it worked.
   *
   * Relocating a component moves it into a different set of guarantees. The
   * guard has to come with it. */
  const si = state && state.situation;
  if (!si) return null;
  const team = si.offenseTeamId && state.teams && state.teams[si.offenseTeamId];
  const who = team ? (team.abbrev || team.short || team.name) : null;
  /* 🔴 THE FEED'S SENTENCE FIRST. It carries the spot - "1st & 10 at SEA 32" -
   * and the hand-built version below never could, because we only captured the
   * down and the distance. The fallback stays for a play whose `end` block is
   * missing, which does happen on a penalty. */
  const dn = ['1st', '2nd', '3rd', '4th'][(si.down || 0) - 1] || null;
  /* Absent rather than invented. A goal-line snap has no "& 10" and a kickoff
   * has no down at all; printing "0 & 0" would be worse than printing nothing. */
  const dd = si.downDistanceText
    || (dn ? dn + ' & ' + (si.distance === 0 ? 'goal' : si.distance) : null);
  if (!dd && !who) return null;
  /* 🔴 ITS OWN PILL. Jason, live: "Make it its separate pill. Easy to see."
   * A line of text under a heading is read after the heading; a pill is read
   * BEFORE it, because it is a shape rather than a sentence. This is the fact
   * the question depends on, so it should arrive first. */
  const line = el('div', 'lg-dd');
  const pill = el('span', 'lg-dd-pill');
  if (dd) pill.appendChild(el('span', 'lg-dd-d num', dd));
  /* 🔴 ONLY WHEN THE SENTENCE DOES NOT ALREADY NAME THEM. "1st & 10 at SEA 32"
   * followed by a separate "SEA" chip is the same fact printed twice, which is
   * the mistake that killed the first info card. */
  if (who && !(dd && dd.includes(who))) pill.appendChild(el('span', 'lg-dd-t', who));
  line.appendChild(pill);
  return line;
}

/* 🔴 A KICKOFF OUT OF BOUNDS IS SPOTTED BY RULE, NOT WHERE IT LANDED. Jason,
 * FAMU at Miami, 2026-09-10: "Miami 06?" ESPN wrote the play as
 *
 *     "kickoff 59 yards to the MIAMI06, out of bounds at MIAMI06"
 *     endSpotText "1st & 10 at MIA 6", endYardsToEndzone 94
 *
 * which is where the ball went out, and the field drew Miami backed up on its
 * own 6. Nobody snaps it there: a kickoff out of bounds gives the receiving
 * team the ball at its 35 in college and its 40 in the NFL. The feed corrects
 * itself on the next snap; until then this says what is actually true.
 *
 * Only an UNRETURNED kick. "... return 20 yards to the MIA20, out of bounds"
 * is a returner stepping out, and that spot is real. */
function kickOutOfBounds(play) {
  if (!play) return false;
  const t = (play.typeText || '') + ' ' + (play.text || '');
  return /kickoff/i.test(t) && /out of bounds/i.test(t) && !/return|penalty|fumble/i.test(t);
}
const OOB_SPOT = { nfl: 40, 'college-football': 35 };

/* ESPN's college grammar runs a team into its yard line - "MIAMI06",
   "FAMU45". A space and no leading zero, so it reads as a place. */
function playText(t) {
  return String(t || '').replace(/\b([A-Z][A-Z&]+)(\d{2})\b/g, (m, a, n) => a + ' ' + Number(n));
}

function held(raw, delayMs, now) {
  if (!raw) return null;
  /* 🔴 THE DELAY IS MEASURED FROM WHEN THE PLAY HAPPENED. Jason, live in the
   * first quarter: "Timing is off."
   *
   * This used to say "the feed carries no per-play wall clock" and hold exactly
   * ONE play until the whole push aged past the delay. Both halves were wrong.
   * ESPN stamps every play with a wallclock - it was never read - and holding
   * "the last one, until the push is old" is not a 45-second delay at all: with
   * a push arriving every 12 to 20 seconds the state is almost never 45s old, so
   * the app sat permanently one play behind, and how far behind THAT was in
   * seconds depended on how long the teams took to snap it.
   *
   * 🔴 A DELAY HELD FROM ARRIVAL IS NOT A DELAY, IT IS A QUEUE. Everything
   * upstream stacks on top of it - ESPN's own lag, the 12s poll, the push, the
   * client's 5s poll - and none of it is visible to the person reading "45s
   * behind". Held from the play's own clock the number is literally true, and it
   * stays true if the pipeline gets slower or faster.
   *
   * That matters more here than anywhere else in the app: the whole product
   * rests on the play being one the viewer has NOT seen yet. Too little delay
   * and we ask about a play already on their screen; too much and we ask about
   * one they watched a minute ago. Either way the question is a fake. */
  const cutoff = now - delayMs;
  let cut = raw.plays.length;
  for (let i = 0; i < raw.plays.length; i++) {
    const w = raw.plays[i].wallclockMs;
    /* The FIRST play too new to show ends the visible list - never a filter,
     * which would punch a hole in the middle if a stamp arrived out of order. */
    if (w && w > cutoff) { cut = i; break; }
  }
  /* A state from a poller too old to send wallclocks falls back to the previous
   * rule rather than showing everything - old behaviour beats no delay. */
  const anyClock = raw.plays.some((p) => p.wallclockMs);
  const asOf = raw.pushedAt || raw.fetchedAt || 0;
  const visible = anyClock ? raw.plays.slice(0, cut)
    : (asOf <= cutoff ? raw.plays : raw.plays.slice(0, Math.max(0, raw.plays.length - 1)));
  const holding = raw.plays.length - visible.length;

  /* 🔴 THE SITUATION AND THE SCORE ARE HELD BACK TOO, AND NOT DOING THAT WAS
   * THE WORST BUG IN THIS APP. Found 2026-09-09 by the dry run, six hours before
   * the opener.
   *
   * This used to `return { ...raw, plays: visible }` - truncating the plays and
   * passing the LIVE situation and the LIVE score straight through. So the
   * screen hid a play and then printed the down, the distance and the score that
   * resulted FROM it.
   *
   * That is not a cosmetic mismatch. It leaks the exact thing the delay exists
   * to hide: if the last play you can see was 2nd & 9 and the header says 1st &
   * 10, the hidden play got a first down and you know it before you are asked to
   * call it. A hidden touchdown is worse - the score moves while the play that
   * scored it is still being withheld.
   *
   * It also poisoned the QUESTION. The catalog picks what to ask from the down
   * and distance, so a call made on a held 3rd & 11 was being offered the
   * question for the live 1st & 11 - which is how the dry run's first call came
   * to be a run-or-pass question one snap before a punt, and voided.
   *
   * 🔴 THE ANSWER COMES FROM THE LAST VISIBLE PLAY, which already carries the
   * score after itself and the down and distance it ended on. That is the only
   * honest source: it is what a viewer 45 seconds behind their television can
   * actually know. */
  /* 🔴 THE SITUATION IS DERIVED WHETHER OR NOT ANYTHING IS BEING HELD. Jason,
   * live: "Down and dist broken" - the pill printed the team and no down.
   *
   * This used to bail out here whenever `holding` was 0, on the reasoning that
   * with nothing hidden the raw situation is already the truth. 🔴 THAT ASSUMES
   * THE RAW SITUATION IS POPULATED, AND ON THIS FEED IT IS NOT. Straight off the
   * wire, mid-drive:
   *
   *     situation: { down: null, distance: null, downDistanceText: null, ... }
   *     last play: { startDown: 3, distance: 2, endDown: 4, endDistance: 1 }
   *
   * ESPN's summary `situation` block is frequently empty while the PLAY carries
   * the down and distance perfectly well. So the derivation was not a
   * delay-only correction at all - it was the only place those numbers were
   * being worked out, and it was switched off in the exact case where the delay
   * is holding nothing, which is most of tonight.
   *
   * 🔴 A CODE PATH THAT ONLY RUNS IN THE UNUSUAL CASE IS THE ONE THAT GETS
   * TESTED, and the common case is the one that ships broken. Deriving always
   * costs nothing - when holding is 0 the last visible play IS the newest play,
   * so the derived values are the live ones. */
  if (!visible.length) {
    return { ...raw, plays: visible, holding };
  }
  const last = visible[visible.length - 1];
  const oobYard = OOB_SPOT[leagueOf(raw)] || 35;
  const oob = kickOutOfBounds(last);
  const oobTeam = oob && raw.teams ? raw.teams[last.endTeamId || last.offenseTeamId] : null;
  return {
    ...raw,
    plays: visible,
    holding,
    /* The score as it stood after the last play you have been shown. */
    homeScore: last.homeScore != null ? last.homeScore : raw.homeScore,
    awayScore: last.awayScore != null ? last.awayScore : raw.awayScore,
    situation: raw.situation ? {
      ...raw.situation,
      down: last.endDown != null ? last.endDown : raw.situation.down,
      distance: last.endDistance != null ? last.endDistance : raw.situation.distance,
      /* The feed's own sentence for where the ball is, after the last play you
         have been shown - never the live one. */
      downDistanceText: oob
        ? `1st & 10 at ${(oobTeam && oobTeam.abbrev) || 'own'} ${oobYard}`
        : (last.endSpotText || raw.situation.downDistanceText),
      /* 🔴 THE LAST VISIBLE PLAY THAT ACTUALLY HAS A SPOT, walking backwards.
       * From the last visible play alone, the field DISAPPEARED after every
       * kickoff: ESPN posts no `end.yardsToEndzone` on one, so the value went
       * null and fieldStrip bailed out. A graphic that vanishes between drives
       * is worse than one that is a play stale - the ball did not stop
       * existing because the feed declined to say where it was.
       *
       * Still only VISIBLE plays, so the delay is not leaked; the search just
       * skips the rows that have nothing to say. */
      yardsToGoal: (() => {
        for (let i = visible.length - 1; i >= 0; i--) {
          if (kickOutOfBounds(visible[i])) return 100 - oobYard;
          if (visible[i].endYardsToEndzone != null) return visible[i].endYardsToEndzone;
        }
        return raw.situation.yardsToGoal;
      })(),
      /* The clock and the last play text belong to the play you can see, not to
       * the one being withheld. */
      clock: last.clock || raw.situation.clock,
      quarter: last.quarter || raw.situation.quarter,
      lastPlayText: last.text,
      lastPlayKind: last.kind,
      playId: last.id,
      driveId: last.driveId,
      /* 🔴 THE OFFENSE CAN CHANGE ON THE HIDDEN PLAY - a turnover, a punt, a
       * score. `endTeamId` is who had the ball when the visible play finished,
       * and using the live offense here would say which team is on the field
       * next, which is itself a leak. */
      offenseTeamId: last.endTeamId || last.offenseTeamId || raw.situation.offenseTeamId
    } : raw.situation
  };
}

/** What question does this moment ask? */
/** True when the last thing we can see is the end of the half. */
function atHalfTime(state) {
  const plays = (state && state.plays) || [];
  const last = plays[plays.length - 1];
  if (!last) return false;
  const t = (last.typeText || '') + ' ' + (last.text || '');
  return /end (of )?(the )?half|halftime/i.test(t)
    || (/end (of )?(the )?(quarter|period)|end quarter/i.test(t) && last.quarter === 2);
}

/* 🔴 THE TEAM, NOT "THEY". Jason, 2026-09-10: "Do 'they'... change they to
 * the team name 'Sun Devils'." A pronoun makes you work out who is meant,
 * mid-snap, with two teams on the screen. The nickname is what the person on
 * the couch is already calling them.
 *
 * WHO "THEY" IS DEPENDS ON THE QUESTION. Almost every one is about the
 * offense. A kickoff return is about the RECEIVING side, and at the moment it
 * is asked the offense on record is still the team that just scored - so it
 * is the other team, and only when the last play really was a score. At the
 * start of a half we cannot say who receives, so it keeps "they" rather than
 * guess a name that might be the wrong one. The catalog keeps the pronoun, so
 * any other screen that lists the questions still reads generically. */
function askAbout(type, state) {
  const q = type && type.question ? type.question : '';
  if (!/\bthey\b/.test(q) || !state) return q;
  const si = state.situation || {};
  let id = si.offenseTeamId;
  if (type.id === 'kickoff_return') {
    const lp = state.plays && state.plays[state.plays.length - 1];
    const scorer = lp && lp.scoringPlay ? lp.offenseTeamId : null;
    id = !scorer ? null
      : String(scorer) === String(state.homeTeamId) ? state.awayTeamId : state.homeTeamId;
  }
  const t = id && state.teams ? state.teams[id] : null;
  const who = t && (t.nick || t.short);
  return who ? q.replace(/\bthey\b/, 'the ' + who) : q;
}

function questionFor(state) {
  const last = state.plays[state.plays.length - 1];
  if (!last) return null;
  /* 🔴 NO QUESTION AT HALF TIME. Found with the opener sitting on END QUARTER 2:
   * the board was offering "what happens on the next snap?" about a snap
   * THIRTEEN MINUTES away, and a call taken there is marbles locked up for a
   * quarter of an hour with nothing on screen explaining why.
   *
   * 🔴 IT IS ALSO THE ONE CASE WHERE THE DELAY GOES THE WRONG WAY. Everywhere
   * else we are behind the viewer by seconds; across the half we are behind by
   * seconds and then the game stops, so by the time the third quarter starts
   * he has watched the kickoff and we are still asking about it. The gap that
   * makes the mechanic work is a gap between PLAYS, and at the half there are
   * none.
   *
   * A stoppage of a couple of minutes is fine and still gets a question - the
   * break pill says the wait is coming. Thirteen minutes is not. */
  if (atHalfTime(state)) return null;
  const s = (last.text || '').toLowerCase();

  /* A drive starts when the possession that is about to snap is not the one that
   * snapped last - a kickoff, a punt, a turnover. That is read off the drive id
   * the feed already gives every play, never inferred from the down. */
  const prev = state.plays[state.plays.length - 2] || null;
  const isDriveStart = !prev || prev.driveId !== last.driveId || /kickoff|punt|intercept|fumble/.test(s);

  /* A drive call already running is not re-offered, and it does not block the
   * snap questions underneath it - that is the point of two timescales. */
  const openDriveCall = Object.values(S.calls).some(
    (c) => c.scope === 'drive' && c.driveId === last.driveId
  );

  /* 🔴 SNAP QUESTIONS ARE BACK, BECAUSE THE MEASUREMENT THAT KILLED THEM WAS
   * WRONG. Two hours ago this block routed everything to drive scope, on the
   * finding that the feed was 115-211 seconds behind and the snap window did
   * not exist. Both numbers were artefacts of a broken metric - `now - age of
   * the newest play`, which during a stoppage measures the stoppage, and on a
   * poller restart measures the age of the game.
   *
   * 🔴 MEASURED PROPERLY, AT THE INSTANT A PLAY ARRIVES, THE FEED IS 47 SECONDS
   * BEHIND. Three samples, twenty-five seconds apart, all 47. And the window
   * follows from three numbers we now have rather than from anybody's feel:
   *
   *     feed behind the stadium      47s   measured at arrival, poller-side
   *     Jason's television           40s   13 taps, median
   *     gap between snaps            41s   60 samples
   *
   * A play happens at T. He sees it at T+40. We learn of it at T+47 and ask
   * about the NEXT snap. That snap happens at T+41 and reaches his screen at
   * T+81. So he has T+47 to T+81 - THIRTY-FOUR SECONDS - to call a play he has
   * not seen. The market works, and it works with room.
   *
   * The condition, for whoever reads this next:
   *
   *     feed_lag  <  tv_lag + gap_between_snaps
   *     47        <  40 + 41
   *
   * 🔴 IT IS TIGHT ENOUGH THAT IT HAS TO STAY MEASURED. If the feed slips past
   * ~80s the window closes, which is why publishLagMs is on the wire and on the
   * screen. Fail that condition and the drive-only routing in git history is
   * the fallback - one block, restored in a minute.
   *
   * The lesson worth more than the feature: I retired the product's central
   * mechanic on a number nobody had checked. */
  return offerFor({
    down: state.situation?.down ?? null,
    distance: state.situation?.distance ?? null,
    /* The red zone asks its own question, and the router cannot know it without
     * this. */
    yardsToGoal: state.situation?.yardsToGoal ?? null,
    /* 🔴 THE SEED. The question rotates so a snap is not the same bet 120 times a
     * night, and it rotates DETERMINISTICALLY on the play everybody is calling
     * after — so two people watching one game are answering the same thing and
     * the board compares like with like. Forget this and the rotation still
     * "works", silently, per device. */
    afterPlayId: last.id,
    /* 🔴 THESE THREE DESCRIBE THE PLAY THAT IS ABOUT TO HAPPEN, NOT THE ONE THAT
     * JUST DID. Found by the dry run 2026-09-09, and it was asking questions
     * whose answers were already on the screen.
     *
     * They used to read the LAST play's text: if it said "punt", the app offered
     * "Fair catch, or does he run it back?". But the fair catch is IN that
     * sentence - "punt 47 yards to the BSU50 fair catch by #7 E.Stewart" - and
     * the call settles against the play AFTER it, which is an ordinary snap
     * containing no punt at all. So it voided, every time, on a question the
     * viewer could already answer by reading.
     *
     * The offer and the settlement have to be about the SAME play. The settler
     * always looks forward one, so the offer must too.
     *
     * 🔴 A KICKOFF IS PREDICTABLE AND A PUNT IS NOT. After a touchdown, a field
     * goal or a safety the next play is a kickoff - that is a rule of the sport,
     * not a guess, so the kickoff question is offered there and settles on the
     * kickoff itself. Nothing makes the NEXT play a punt: fourth down makes it
     * likely, and the catalog already has the honest question for fourth down -
     * "Go for it, or kick?" - which is a real decision rather than a prediction
     * of one. So isPunt and isFieldGoalAttempt are retired rather than inverted;
     * the down-based router below is what should have been answering there. */
    isKickoff: /touchdown|field goal is good|safety|extra point/i.test(s),
    isPunt: false,
    isFieldGoalAttempt: false,
    isDriveStart,
    openDriveCall
  });
}

/** Price from what this offense has done tonight, with the prior stated. */
function priceFor(type, state, offenseTeamId) {
  const rel = state.plays.filter((p) => p.offenseTeamId === offenseTeamId);
  const counts = {};

  /* 🔴 THE PRIOR IS MEASURED WHERE IT CAN BE, not one-each. A four-way question
   * with a flat prior prices every tile at 25% and 4x - a made-up number wearing
   * a decimal point, and on a drive question it says a punt and a field goal are
   * equally likely, which 69 real drives say they are not (38% against 13%).
   *
   * So the prior is the catalog's counted distribution, weighted as four snaps
   * of evidence, and the in-game counts move it from there. Where a type has no
   * measured rates it falls back to one-each, which is the honest flat prior. */
  const PRIOR_WEIGHT = 4;
  /* 🔴 THE PRIOR IS PER SPORT. `rates` was measured on three college games and
   * `ratesNfl` on eight real NFL ones, and they are genuinely different football:
   * the NFL passes 60% of snaps against college's 51%, and runs middle on 19% of
   * plays against college's 38%. Feeding one sport's numbers to the other is the
   * same class of error as grading a sack by the wrong league's rule. */
  const table = (state.sport === 'nfl' && type.ratesNfl) ? type.ratesNfl : type.rates;
  for (const c of type.choices) {
    counts[c.id] = table?.[c.id] != null ? table[c.id] * PRIOR_WEIGHT : 1;
  }
  let n = type.choices.reduce((a, c) => a + counts[c.id], 0);
  const priorN = n;                                    // the prior is not evidence

  if (type.id === 'run_pass') {
    for (const p of rel) if (p.kind === 'run' || p.kind === 'pass') { counts[p.kind]++; n++; }
  }
  if (type.id === 'script') {
    /* Both halves off the same play, so the tendency the model learns tonight is
     * the one the tile is actually asking about. */
    for (const p of rel) {
      if (p.kind !== 'run' && p.kind !== 'pass') continue;
      /* The SAME rule the settler uses. A regex here and a down there is how the
       * price and the payout come to disagree about the same play. */
      const got = movedChains(p, { distance: p.distance }).got;
      counts[`${p.kind}_${got ? 'yes' : 'no'}`]++; n++;
    }
  }
  return type.choices.map((c) => {
    const p = (counts[c.id] || 1) / n;
    return {
      choice: c,
      p: Math.round(p * 1000) / 1000,
      pays: Math.min(MAX_PAYOUT, Math.round((1 / p) * 100) / 100),
      samples: Math.max(0, Math.round(n - priorN))
    };
  });
}

/* ------------------------------------------------------------------ *
 * Settling — against the play that actually arrived
 * ------------------------------------------------------------------ */

/**
 * ONE settlement path, used for my own bank and for everybody else's row on the
 * board. Two paths would drift, and the day they drifted the board would say
 * somebody was winning while their own phone said otherwise.
 *
 * 🔴 THE PAYOUT IS DERIVED FROM p WHEN IT HAS TO BE. A call made on this device
 * carries the price it was shown; a call read back off the board carries only
 * `p`, because that is what the server was sent. Same formula either way —
 * stake / p, capped — so the two cannot disagree.
 */
function payoutOf(call) {
  if (typeof call.pays === 'number') return call.pays;
  const p = typeof call.p === 'number' && call.p > 0 ? call.p : 0.5;
  return Math.min(MAX_PAYOUT, Math.round((1 / p) * 100) / 100);
}

function settleOne(call, state) {
  const pays = payoutOf(call);

  /* 🔴 A DRIVE CALL RUNS FOR MINUTES AND LANDS ONCE. It is not settled by the
   * next snap — it is settled by the drive ending, against the result the feed
   * states. While the drive is live the call sits open underneath whatever snap
   * question is being asked on top of it, which is the whole reason the catalog
   * has two timescales. */
  if (call.scope === 'drive') {
    const drive = (state.drives || []).find((d) => d.id === call.driveId);
    if (!drive || !drive.ended) return { open: true, delta: -call.stake };
    const dp = state.plays.filter((p) => p.driveId === call.driveId);
    const r = settleDrive(call.type, call.choice, { result: drive.result, plays: dp });
    if (r.landed === null) return { void: true, because: r.because, delta: 0 };
    return { landed: r.landed, because: r.because,
             delta: r.landed ? Math.round(call.stake * pays) - call.stake : -call.stake };
  }

  const i = state.plays.findIndex((p) => p.id === call.afterPlayId);
  const next = i >= 0 ? state.plays[i + 1] : null;
  if (!next) return { open: true, delta: -call.stake };

  /* 🔴 THE LEAGUE IS PART OF THE SETTLEMENT, not decoration. A sack is a pass in
   * the NFL and a rush in college — every operator rulebook says so in the same
   * words — and a sack turns up on 16% of real drives. Passing the wrong league
   * here does not error; it quietly grades the call the other way. */
  /* 🔴 THE WHOLE PLAY, not two fields of it. `startDown`/`endDown`/`endTeamId`
   * are how a first down is read in the NFL, where the sentence never says so —
   * passing only text and typeText silently reverted that fix to the college
   * grammar. */
  const r = settle(call.type, call.choice, next,
                   { down: call.down, distance: call.distance, sport: state.sport });
  if (r.landed === null) return { void: true, because: r.because, delta: 0, play: next };
  return { landed: r.landed, because: r.because, play: next,
           delta: r.landed ? Math.round(call.stake * pays) - call.stake : -call.stake };
}

/* Does this call belong to the game on screen? New calls carry their game id;
 * older ones are matched on ESPN's play-id prefix, which is the event id. */
function callIsFor(call, playId, gameId) {
  if (!gameId) return true;
  if (call.gameId) return String(call.gameId) === String(gameId);
  return String(playId).startsWith(String(gameId));
}

function settleAll(state) {
  /* 🔴 200 MARBLES PER GAME, NOT PER SESSION. Jason settled it when the
   * question surfaced: "You decided 200 per game."
   *
   * The bank used to sum EVERY call in storage, and that was invisible while
   * exactly one game was ever on the wire. It stops being invisible the moment
   * two are: eight Sunday games would have shared one pot, so a bad first
   * quarter in one would follow you into the other seven, and the app's own
   * rule - the bank refills every game, nobody is eliminated - would quietly
   * not be true.
   *
   * Per game keeps every game an equal proposition and keeps that rule honest.
   * It also means the delta beside the balance means something specific: how
   * you are doing in THIS game, which is the only comparison anybody makes. */
  const gameId = state.gameId || (S.key || '').split(':')[1] || null;
  let bank = START_BANK;
  const rows = [];
  for (const [afterPlayId, call] of Object.entries(S.calls)) {
    if (!callIsFor(call, afterPlayId, gameId)) continue;
    const c = { ...call, afterPlayId };
    const r = settleOne(c, state);
    if (r.open) { rows.push({ ...c, open: true }); bank -= call.stake; continue; }
    if (r.void) { rows.push({ ...c, void: true, because: r.because }); continue; }
    bank += r.delta;
    rows.push({ ...c, landed: r.landed, delta: r.delta, because: r.because, play: r.play });
  }
  S.bank = bank;
  /* 🔴 THE GAME'S RESULT, WRITTEN WHERE ANOTHER SCREEN CAN READ IT. Jason,
   * 2026-09-09: "On my picks, if I bet inside that game shown, the outcome will
   * be shown as well."
   *
   * It did not, and the reason is structural rather than an oversight: a live
   * call is settled HERE, on this screen, against plays this screen is holding.
   * Nothing else in the app can reproduce that - My picks would have to fetch
   * every game's whole play list and re-run the settler to learn that you got
   * three of five right on Wednesday.
   *
   * So the screen that already knows writes down what it knows. A per-game
   * summary, keyed by the game, updated on every settle: how many landed, how
   * many missed, how many voided, and the profit. Small, and it is the only
   * thing another screen actually needs.
   *
   * 🔴 A SUMMARY, NOT A LEDGER. It records what happened in a game you played;
   * it is not a balance and nothing spends from it. The bank still resets every
   * game, and these numbers never sum with the pool's points. */
  saveCallSummary(rows);
  return rows.reverse();
}

/** Per-game, per-device. Read by My picks; never read back by this screen. */
function saveCallSummary(rows) {
  if (!S.key || !rows.length) return;
  try {
    const all = JSON.parse(localStorage.getItem('ag.callsum') || '{}');
    let won = 0, lost = 0, voided = 0, open = 0, profit = 0;
    for (const r of rows) {
      if (r.open) { open++; continue; }
      if (r.void) { voided++; continue; }
      if (r.landed) won++; else lost++;
      profit += (r.delta || 0);
    }
    /* 🔴 THE SPORT AND THE WEEK TRAVEL WITH THE SUMMARY. Without them a weekly
     * total has to parse the game key and guess which week an id belonged to -
     * and would silently fold last week's games into this week's number the
     * first time the week rolled over. */
    const sport = leagueOf(S.raw);
    all[S.key] = { won, lost, voided, open, profit, at: Date.now(),
                   sport, week: SLATE_WEEK[sport] || 1 };
    localStorage.setItem('ag.callsum', JSON.stringify(all));
  } catch { /* a private window is allowed to forget */ }
}

/**
 * 🔴 THE BOARD RANKS ON PROFIT. Not on how many times somebody tapped.
 *
 * It counted calls until 2026-09-08, which is an attendance sheet: "Jason · 3
 * calls" beside "Mike · 3 calls" tells two people watching the same game
 * absolutely nothing about which of them is reading it better. Settled doctrine
 * has always said the live board ranks on PROFIT — balance minus start — and the
 * screen simply did not do it. Every number it needed was already on the wire.
 *
 * 🔴 AND THE ARITHMETIC BEING LOCAL IS NOT THE THING THE DOCTRINE FORBIDS. The
 * rule is that a client must not decide its own outcome. Here every input is
 * server-held — the calls come from /api/board, the plays from /api/state — and
 * every viewer recomputes the same board from the same data. Nobody can change
 * what anybody else sees. It is one deterministic function over shared inputs,
 * which is exactly why it must be the SAME function my own bank uses.
 */
function boardRows(state) {
  const byPerson = new Map();
  for (const c of S.board) {
    const row = byPerson.get(c.deviceId)
      || { deviceId: c.deviceId, name: c.name, at: 0, profit: 0, open: 0, won: 0, lost: 0, voided: 0 };
    /* The newest name a device sent wins, so naming yourself after your first
     * call renames you on the board rather than leaving a stranger up there. */
    if (c.at > row.at && c.name) { row.name = c.name; row.at = c.at; }
    const r = settleOne(c, state);
    if (r.open) row.open++;
    else if (r.void) row.voided++;
    else { row.profit += r.delta; if (r.landed) row.won++; else row.lost++; }
    byPerson.set(c.deviceId, row);
  }
  /* Profit first. A tie breaks on who has resolved more, so somebody sitting on
   * one lucky call does not outrank somebody who has been playing all night. */
  return [...byPerson.values()].sort(BOARD_ORDER);
}

/* ------------------------------------------------------------------ *
 * Render
 * ------------------------------------------------------------------ */

export async function previewData() { return {}; }

export function render(root, _data, screenState) {
  root.innerHTML = '';
  const style = el('style');
  style.textContent = STATES_CSS + CSS;
  root.appendChild(style);

  const wrap = el('div', 'lg');
  root.appendChild(wrap);

  /* An explicit ?game= always wins - that is how a specific game is shared and
   * how the fixtures are replayed. Otherwise the key follows the chosen sport. */
  const forced = new URLSearchParams(location.search).get('game');
  /* 🔴 AN INVITE LINK IS USED ONCE, THEN TAKEN OUT OF THE ADDRESS. Jason,
   * 2026-09-10: "Live game, college shows the nfl game." He had arrived on a
   * `?game=nfl:...` link at some point, and the query string outlives every
   * hash navigation - so picking College on the front door set the league,
   * navigated to #/live, and this line read the same stale link again and put
   * him straight back on the NFL game. An explicit link still wins on the
   * load it arrives with; after that the person's own choices do. */
  if (forced) {
    try {
      const q = new URLSearchParams(location.search);
      q.delete('game');
      const qs = q.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
    } catch { /* an address we cannot rewrite still plays the invited game */ }
  }
  S.isHome = screenState === 'home';
  /* 🔴 THE LIVE TAB OPENS THE LAST LIVE GAME YOU HAD UP. Jason, 2026-09-10.
   * Only from the tab (see drawNav in app.js) - the front door also lands
   * here, and there the league just chosen wins. Six hours is a game and its
   * aftermath; older than that it is not "the game you had up". */
  const goLast = !forced && !S.isHome && window.__agGoLast === true;
  window.__agGoLast = false;
  const lastSeen = goLast ? store.get('lastLive', null) : null;
  const lastKey = lastSeen && lastSeen.key && (Date.now() - (lastSeen.at || 0)) < 6 * 60 * 60 * 1000
    ? lastSeen.key : null;
  if (lastKey && (!S.raw || String(S.raw.gameId) !== lastKey.split(':')[1])) { S.raw = null; S.board = []; }
  S.key = forced || lastKey || (S.sport ? GAME_FOR[S.sport] : null);
  /* Recorded on the state, not just held in this closure: the 5-minute
   * re-check runs long after mount() has returned and has to know that this
   * session came in on an invite link naming its own game. Reading an
   * undefined S.forced there would silently retarget somebody's invite to
   * whatever is next on the slate. */
  S.forced = !!forced || !!lastKey;
  /* Reset on arrival, so Home is a door and not a wizard somebody is stuck in. */
  /* A new game is a new camera. Without this the field pans from wherever the
     last game left the ball, which looks like a mistake because it is one. */
  S.fieldNode = null; FIELD_CAM = null;
  if (FIELD_RAF) { cancelAnimationFrame(FIELD_RAF); FIELD_RAF = null; }
  S.homeStep = 'mode';
  /* 🔴 AND THE REPAINT SIGNATURE, WHICH IS A HARD BLOCKER IF IT SURVIVES A MOUNT.
   *
   * Home -> marbles -> College left the app stuck on "Waiting for the first push
   * from the poller" for ever. The sport button sets S.raw = null and navigates;
   * the new screen mounts, paints its loading skeleton, and polls. The poll gets
   * back the SAME game state Home had already been holding, so the signature it
   * computes equals S.lastSig - left over from the previous screen - and the
   * quiet-repaint guard decides nothing has changed and returns. The skeleton
   * never gets replaced.
   *
   * The guard is right that the DATA did not change. It was wrong to assume the
   * screen had not, and a cache that outlives the thing it describes is the bug
   * every time. Cleared on every mount so the first paint after a navigation is
   * unconditional. */
  S.lastSig = null;
  if (forced) { S.sport = forced.split(':')[0] === 'nfl' ? 'nfl' : 'college-football'; }
  else if (lastKey) { S.sport = lastKey.split(':')[0] === 'nfl' ? 'nfl' : 'college-football'; }

  paint(wrap);
  if (S.timer) clearInterval(S.timer);
  S.timer = setInterval(() => poll(wrap), POLL_MS);
  poll(wrap);

  /* The constant gets the first paint out immediately; the lookup corrects it a
   * moment later. Doing it the other way round would hold a blank screen behind
   * a network round trip on every load, to fix a card that is only wrong once a
   * week. An invite link is never overridden — it names its own game. */
  if (!S.forced && S.sport) {
    refreshKey(wrap, S.sport);
    /* Re-checked on a slow cycle so a card left open through a kickoff moves on
     * to the next game by itself rather than counting down past zero. */
    if (S.keyTimer) clearInterval(S.keyTimer);
    S.keyTimer = setInterval(() => { if (!S.forced && S.sport) refreshKey(wrap, S.sport); }, 300000);
  }
}

/* 🔴 THE BOARD COMPARATOR, NAMED. Profit first, highest at the top; a tie breaks
 * on how much has been RESOLVED, so somebody sitting on one lucky open call does
 * not outrank somebody who has settled four.
 *
 * It is a named constant rather than an inline arrow because the test that owns
 * this rule cannot import a screen — a screen needs a DOM — so it lifts the
 * comparator out of the source and runs it. Its matcher took "the first .sort in
 * the file", and on 2026-09-09 a slate lookup added an earlier one: the test
 * quietly began asserting the ranking doctrine against a kickoff-time sort, and
 * failed. It had warned about exactly this in its own comment.
 *
 * A rule that a test finds by POSITION is a rule that moves when unrelated code
 * moves. Naming it is the fix; the test now matches the name. */
const BOARD_ORDER = (a, b) => b.profit - a.profit || (b.won + b.lost) - (a.won + a.lost);

/* What Home actually shows: which game, its status, the score, and the countdown
 * rounded to the minute it displays. Anything not in here cannot change a pixel
 * on that screen, and anything in here forces a redraw. */
function homeSignature() {
  const r = S.raw;
  if (!r) return 'none:' + String(S.key) + ':' + String(S.noGame);
  const mins = r.kickoffUtc ? Math.floor((r.kickoffUtc - Date.now()) / 60000) : 0;
  return [S.key, r.status, r.awayScore, r.homeScore, mins,
          r.situation && r.situation.clock, S.mode, S.sport].join('|');
}

/**
 * 🔴 EVERY TEAM CARRIES ITS OWN LEAGUE, FROM THE PAYLOAD.
 *
 * Found by replaying a real NFL game through the live screen: the scorebug
 * drew CLAREMONT-MUDD-SCRIPPS and UCLA over a New England at Seattle game
 * whose play text said "to SEA 11". The names and colours were right - they
 * come from the payload - and only the crests were wrong.
 *
 * logoUrl builds `/logos/<league>/<variant>/<id>.png` and falls back to
 * college when it is not told a league. That default is correct for the
 * shipped fixture, which is 760 schools and nothing else, and catastrophic
 * for live data: NFL team 17 is New England and college team 17 is CMS, so
 * the wrong league produces a real crest for a real team and nothing
 * anywhere errors. Same shape as the three filename-as-truth bugs already in
 * this file's history - two ids that look interchangeable, one confident
 * wrong answer.
 *
 * 🔴 STAMPED AT THE DOOR RATHER THAN PASSED AT EVERY CALL SITE. There are
 * nine places in this screen that pull a team out of `state.teams`, and a
 * rule that has to be remembered nine times is a rule that will be missed
 * once. The payload already says which sport it is; putting that on each
 * team as it arrives means no caller can get it wrong, including callers
 * that do not exist yet.
 */
function stampLeague(raw) {
  if (!raw || !raw.teams || !raw.sport) return raw;
  for (const id of Object.keys(raw.teams)) {
    const t = raw.teams[id];
    if (t && typeof t === 'object') { t.id = t.id || id; t.league = raw.sport; }
  }
  return raw;
}

async function refreshKey(wrap, sport) {
  const k = await nextGameKey(sport);
  /* Guard the sport as well as the value: the lookup is async and somebody can
   * switch leagues while it is in flight, which would point the NFL card at a
   * college game with no error anywhere. */
  if (!k || k === S.key || sport !== S.sport) return;
  S.key = k; S.raw = null; S.board = []; S.noGame = false;
  paint(wrap); poll(wrap);
}

/* 🔴 A GAME NOBODY IS POLLING YET STILL HAS A PRE-GAME. Found 2026-09-10 on the
 * College path: FAMU at Miami went final, the key moved on to Villanova at
 * Louisville - tomorrow, 4 PM - and /api/state answered 404, because pollers
 * only start fifteen minutes before kickoff. The strip highlighted VILL @ LOU
 * while the board went on drawing FAMU's final underneath it.
 *
 * The slate already holds everything the Upcoming card needs - both teams,
 * the kickoff, the venue, the channel - so a scheduled game with no push is
 * drawn from that instead. Which is also the only way the countdown Jason
 * asked for is ever seen more than fifteen minutes out. The first real push
 * replaces it. */
function preFromSlate(key) {
  const [sp, id] = String(key || '').split(':');
  const also = S.also && S.also.sport === sp ? S.also : null;
  const g = also && (also.games || []).find((x) => String(x.id) === id);
  if (!g || g.status === 'final' || g.status === 'in_progress' || !g.kickoffUtc) return null;
  const teams = {};
  for (const t of (g.teams || [])) teams[String(t.id)] = { ...t, id: String(t.id), league: sp };
  return {
    gameId: id, sport: sp, status: 'pre',
    homeTeamId: String(g.homeTeamId), awayTeamId: String(g.awayTeamId), teams,
    homeScore: 0, awayScore: 0, kickoffUtc: g.kickoffUtc,
    venue: g.venue || null, broadcast: g.broadcast || null,
    plays: [], drives: [], situation: {}, offers: [], fromSlate: true
  };
}

async function poll(wrap) {
  try {
    const [stateRes, boardRes] = await Promise.all([
      fetch('/api/state/' + S.key),
      fetch('/api/board/' + S.key)
    ]);
    if (stateRes.ok) {
      S.raw = stampLeague(await stateRes.json()); S.noGame = false;
      /* The game the Live tab goes back to - only ever one that was LIVE on
         this screen, never a pre-game or a final you merely looked at. */
      if (S.raw && S.raw.status === 'live' && S.key) store.set('lastLive', { key: S.key, at: Date.now() });
    }
    /* 🔴 404 IS AN ANSWER, NOT A SILENCE. The Worker says "nothing pushed for
     * that game yet" and this used to ignore it and keep drawing a skeleton, so
     * a sport nobody is polling looked identical to a sport that was one second
     * from loading — forever. */
    else if (stateRes.status === 404) {
      const pre = preFromSlate(S.key);
      if (pre) { S.raw = pre; S.noGame = false; }
      else {
        /* Never leave ANOTHER game's board up under this game's key - that is
           the strip-says-one-thing, board-says-another bug. */
        const id = String(S.key || '').split(':')[1];
        if (S.raw && String(S.raw.gameId) !== id) S.raw = null;
        S.noGame = true;
      }
    }
    if (boardRes.ok) S.board = (await boardRes.json()).calls || [];

    /* 🔴 A REPAINT THAT CHANGES NOTHING IS THE BLINK. Jason, twice: "The logos
     * blink." / "Logos still blink."
     *
     * The first fix - dropping loading="lazy" and holding decoded bitmaps in a
     * module cache - treated the symptom and left the cause standing: paint()
     * does `wrap.innerHTML = ''` and rebuilds every node every 5 seconds. Fresh
     * <img> elements enter the document each cycle, and even a warm cache cannot
     * make that free. It got quieter and it did not stop.
     *
     * So the screen only repaints when something a viewer could SEE has changed.
     * The signature is deliberately coarse - the countdown is at minute
     * resolution, because "Kicks in 17h 15m" is identical for sixty seconds and
     * repainting it twelve times inside that minute buys nothing.
     *
     * 🔴 Home only. The live board has a running clock, a play feed and a stale
     * indicator that all want the tick, and this must never be the reason a
     * called snap is late on screen. */
    /* 🔴 THE PRE-GAME SCREEN TAKES THE SAME GUARD AS HOME. It was Home only, and
     * the pre-game is the screen somebody actually leaves open for hours before
     * a kickoff - a countdown, a channel, an invite and a list of what else is
     * on, all rebuilt from scratch twelve times a minute. Every crest in the
     * head was a fresh <img> on every cycle, which is the blink again in the one
     * place it lasts longest.
     *
     * 🔴 AND ONLY BEFORE THE SNAP. Once the game is live the board has a running
     * clock, a play feed and a staleness indicator that all want the tick, and
     * this must never be the reason a called snap is late on screen. The
     * signature includes the status, so the first push that says the game has
     * started forces a paint and the guard stops applying by itself. */
    const quiet = S.isHome || (S.raw && S.raw.status === 'pre');
    if (quiet) {
      const sig = homeSignature();
      if (sig === S.lastSig) return;
      S.lastSig = sig;
    } else {
      S.lastSig = null;
    }
    paint(wrap);
  } catch { /* offline is a state the screen draws, not an exception */ }
}

/* 🔴 ONE VALUE, TWO SCREENS, AND IT IS RE-READ RATHER THAN REMEMBERED. S.delayMs
 * was seeded from storage once at module load, which was correct while the only
 * way to change it was the slider on this screen. Now that the slider is in
 * settings - an overlay that opens ON TOP of a mounted live screen - a cached
 * copy is a bug with no symptom: the sheet would say 20s, the board would keep
 * holding 45, and nothing anywhere would disagree out loud.
 *
 * Re-reading at the top of paint costs one localStorage hit per repaint and
 * removes the whole class. The event below covers the one case paint cannot:
 * the sheet is open over a screen that is not repainting. */
let DELAY_WIRED = false;
function wireDelay(wrap) {
  if (DELAY_WIRED) return;
  DELAY_WIRED = true;
  window.addEventListener('ag:delay', (e) => {
    const ms = Number(e && e.detail);
    if (!Number.isFinite(ms) || ms === S.delayMs) return;
    S.delayMs = ms;
    /* The hold changes what is on screen, not just what is stored - a shorter
       delay reveals plays we were sitting on, a longer one takes them back. */
    paint(wrap);
  });
}

function paint(wrap) {
  S.delayMs = store.get('delayMs', 30000);
  wireDelay(wrap);
  wrap.innerHTML = '';
  const now = Date.now();

  /* 🔴 THE DELAY IS NOT DRAWN HERE ANY MORE. Jason, 2026-09-10: "Move 45
   * seconds behind to settings."
   *
   * It had already been demoted twice - off Home, then from a permanent panel
   * down to a one-line "45s behind · adjust" - and both times the argument for
   * keeping something was the same: the delay is the most important idea in
   * this product. That is true and it is not an argument for a control. A
   * SETTING you change once and a FACT you read every play are different
   * things, and this line was pretending to be both while being neither well.
   *
   * It is a setting. It goes in settings, which is reachable from this screen's
   * own header, and which already had the identical slider - so the honest
   * description of this change is that a duplicate was deleted rather than that
   * a control was moved.
   *
   * 🔴 WHAT DOES NOT GO WITH IT: the FAULT case. A feed further behind than the
   * setting is not a preference, it is something being wrong, and that is the
   * stale banner's job - it draws in --down, says the feed is frozen, and is
   * unaffected by any of this. Deleting a status line is safe precisely because
   * the failure it hinted at is reported somewhere louder. */
  /* 🔴 THE SAME HEADER AS EVERY OTHER SCREEN. Jason: "we need a header like
   * the rest, the NFL logo, kill the football. for this page, Call it live."
   *
   * This was the only screen in the app without one - it opened straight onto
   * the delay chip and the scoreboard, which made it read as a different
   * product rather than as one door of this one. The league mark is the anchor
   * (it is what changes between NFL and college), the title says which of the
   * app's halves you are in, and the settings menu is adopted into it the way
   * it is everywhere else.
   *
   * "Call it live" as the title and not as the call to action above the
   * question - a title says where you ARE, a prompt says what to DO, and they
   * should not be the same words on one screen. */
  /* 🔴 AND THEN TAKEN OUT AGAIN, 2026-09-10, ON JASON'S INSTRUCTION: "Remove
   * the nfl logo and the call it live underneath." The sticky top bar now says
   * "Call it live" and never scrolls away, so a second copy of the title under
   * it - plus a league mark that the crests on the scoreboard already make
   * obvious - was 170px of phone between the menu and the game. The game strip
   * is now the first thing under the bar. */
  if (!S.isHome) {
    const gs = gameStrip(wrap);
    if (gs) wrap.appendChild(gs);
  }

  /* 🔴 HOME IS DECIDED FIRST, BEFORE ANY GAME STATE IS CONSULTED. It used to sit
   * below the loading guard, the no-game branch and the two choice gates, so on
   * a cold Home with no sport chosen the poll 404'd, S.noGame went true, and the
   * front door rendered "No game game is being polled" - an error about a game
   * nobody had asked for yet.
   *
   * Home does not read the feed at all. It asks two questions and leaves, so
   * every guard below this line is about a screen it is not. */
  if (S.isHome) { homeScreen(wrap); return; }

  /* 🔴 THE SPORT IS ASKED BEFORE ANYTHING ELSE IS SHOWN, and nothing below it
   * renders until it is answered. Not a default with a switch buried in
   * settings: the two sports grade a sack the opposite way and the tendency
   * model is college-only, so a wrong guess does not look wrong — it just
   * settles calls the other way. */
  /* 🔴 MODE FIRST, THEN SPORT. Jason worked through both orders in one minute —
   * "ncaa football then pools or betting?" and then "Or pools vs betting then the
   * sports" — and the second is right.
   *
   * WHAT ARE YOU HERE FOR is the bigger fork and the more human question. It
   * decides which app you are in: two different rhythms, a week against a snap,
   * and two boards that settled doctrine says NEVER SUM. Sport is the narrower
   * question underneath it, and it means something different on each side — for
   * the pool it picks a slate, for calling it decides how a sack SETTLES.
   *
   * Asking sport first made somebody answer a rules question before they knew
   * which rules they were choosing.
   *
   * 🔴 BOTH ARE SKIPPED ENTIRELY FOR AN INVITE. Doctrine: nothing sits in front
   * of the slate, and an invite link opens the actual slate. A friend's link has
   * already answered both by existing.
   *
   * AND THE WORD IS NOT "BETTING". The balance is Marbles, it cannot be bought,
   * there is no cash-out — calling it betting hands over the first objection
   * anybody raises, for free, in our own UI. You call the game. */
  /* 🔴 HOME IS A HOME SCREEN, NOT A DOOR THAT LOCKS BEHIND YOU. Jason said it
   * twice — "Home should start here", then "Home still goes here" over the
   * pre-game screen. The fork was a one-time gate: answered once, stored, never
   * seen again, so Home dropped you straight into the game with no way to see
   * the other half of the app existed.
   *
   * It shows every time now, and it does NOT block — the game renders underneath
   * it. That is the difference between a hub and a wall: you always know both
   * things are there, and you never have to answer anything to get to the one
   * you came for.
   *
   * An invite link is exempt. `?game=` means somebody sent you a specific game
   * and the choice is already made, which is doctrine: nothing sits in front of
   * a link a friend sent. */
  const invited = !!new URLSearchParams(location.search).get('game');
  /* 🔴 HOME OWNS THESE TWO QUESTIONS NOW, so these gates must not answer them
   * first. They ran before the isHome branch below and returned the bare card,
   * which meant homeScreen's own version - the one that also shows the marbles
   * explainer under the league question - could never execute. The gates stay
   * for every OTHER route, where landing on a game with no sport chosen still
   * has to ask rather than guess. */
  if (!S.isHome && !S.mode) { wrap.appendChild(modeCard(wrap)); return; }
  if (!S.isHome && !S.sport) { wrap.appendChild(sportCard(wrap)); return; }

  /* 🔴 HOME IS A DESTINATION, AND IT STOPS HERE. Jason said "Home should start
   * here" three times and each time I put the hub ON TOP of the game — which is
   * still the game, with a card above it. A landing you scroll straight through
   * is not a landing.
   *
   * Home shows the two halves, the sport, what is on and when, and how to bring
   * somebody. Calling the game is a TAP AWAY rather than the thing underneath. */
  /* 🔴 NO HUB STRIP ON THE GAME. It was here to let somebody switch mode or
   * league without leaving, and that was a reasonable answer while Home was a
   * summary. Home is now the front door and is one tap away in the nav, so this
   * strip is the same two questions asked a second time, on top of the game
   * they were asked in order to reach. Deleted rather than hidden: a control
   * that duplicates the door is how the page stopped having a subject. */

  /* 🔴 THE WAY OUT GOES ABOVE EVERY EARLY RETURN. It was appended near the
   * FOOTER, which paint() never reaches on a pre-kickoff game — it returns after
   * the empty state. So a phone with College stored sat on "Kickoff has not
   * happened" for a game the owner did not want, with no visible way to change
   * it: the same dead end as before, moved four inches down the file.
   *
   * Anything whose job is to get somebody UNSTUCK cannot live after a return
   * that only fires when they are stuck. */
  /* 🔴 THE ORPHAN CHIP IS GONE. Jason: "NFL change button?" It sat directly under
   * a card that already asks what you are doing, doing the same job in a
   * different shape — two controls, two visual languages, one question. The
   * sport now lives INSIDE the hub as a second row, so the card answers both
   * halves of "where am I" in one place. */

  /* Under the bar it explains, and above everything else, because it changes how
   * to read the whole screen. It goes the moment they say so, or the moment they
   * make a call - somebody who has already played does not need telling. */
  if (!S.seenIntro && !Object.keys(S.calls).length) wrap.appendChild(introCard(wrap));

  if (!S.raw) {
    /* 🔴 A DEAD END WITH NO DOOR IS WORSE THAN AN ERROR. Jason's phone had
     * College stored, nothing is polling a college game, and the screen sat on
     * "Waiting for the first push from the poller…" with no way to change it —
     * because the sport gate was built one-way. A choice that cannot be
     * unmade is not a choice, it is a trap with a nice first screen. */
    if (S.noGame) {
      const c = el('div', 'card lg-nogame');
      /* "No game game is being polled" - the fallback already said "game". */
      c.appendChild(el('div', 'lg-nogame-h', S.sport
        ? `No ${SPORT_LABEL[S.sport]} game is being polled`
        : 'No game is being polled'));
      c.appendChild(el('p', 'lg-nogame-b',
        'One game is on the wire at a time while this is a rig. Nothing is watching '
        + `${SPORT_LABEL[S.sport] || 'that sport'} right now.`));
      const b = el('button', 'lg-nogame-go', 'Pick a different sport');
      b.onclick = () => { S.sport = null; S.noGame = false; store.set('sport', null); paint(wrap); };
      c.appendChild(b);
      wrap.appendChild(c);
      return;
    }
    wrap.appendChild(stateBlock('loading', { rows: 3, body: 'Waiting for the first push from the poller…' }));
    return;
  }

  /* The staleness is read off the RAW push, never off the held copy - the delay
   * is a thing we do on purpose and must never be mistaken for a dead feed. It
   * sits under the delay bar and above the game, because it changes how to read
   * everything below it. */
  const stale = staleBar(S.raw, now);
  if (stale) wrap.appendChild(stale);

  const state = held(S.raw, S.delayMs, now);

  /* 🔴 AFTER `state` EXISTS. The first version called this from the top of
   * paint(), above `const state = held(...)` — a temporal dead zone reference
   * that threw before anything rendered, so Home drew the delay line and
   * nothing else. That is the THIRD time tonight a block was placed above the
   * thing it reads: the stale bar, the sport switch, and now this.
   *
   * Home is a destination and it stops here — it does not fall through into the
   * game. */
  /* (Home is handled at the top of paint now - see there.) */
  const age = Math.round((now - (S.raw.pushedAt || now)) / 1000);

  /* ---- the game ---- */
  const head = el('div', 'lg-head');
  const away = state.teams[state.awayTeamId], home = state.teams[state.homeTeamId];
  /* The league goes with the chip, because a team id is only unique inside one. */
  const league = leagueOf(state);
  /* 🔴 THE GAME HEAD IS WHERE A CREST DOES ITS JOB, so it is sized for that and
   * not for a list row. 22 was the slate's number, carried over — and a slate row
   * is one of sixty while this is the only place on screen that says WHICH GAME
   * you are in. Jason: "Logos not in and to small." */
  /* 🔴 THE SCOREBOARD IS THE SECOND BIGGEST THING ON THE SCREEN. Jason: "the
   * header is lame, the logos and score need to be bigger, it is probably the
   * second most important thing here."
   *
   * He is right and it had been shrinking by accident. It was a flex ROW -
   * crest, score, crest, clock, channel - so everything competed for one line
   * at 393px, and the only way for anything to fit was for all of it to stay
   * small. A 34px crest and a 24px score in a row with two more chips reads as
   * a status bar, and the score is not a status.
   *
   * 🔴 THE ORDER OF IMPORTANCE ON THIS SCREEN IS: what am I being asked, what
   * is the score, how many marbles do I have. The question is a whole card.
   * The score was a line of chips. Now it is a three-column grid with the
   * figure in the middle at --t-bank, which is the largest type this system
   * has and is reserved for the live layer - exactly this.
   *
   * The clock and the channel drop to a line UNDER the score, where they read
   * as what they are: notes about the game, not competitors with it. */
  /* THE SCOREBUG. Jason sent a picture of a broadcast bug - the horizontal bar
   * every network has run for twenty years - with its states: the base line,
   * a stat strip above it, a yellow FLAG segment, and a full-width TOUCHDOWN
   * banner.
   *
   * IT IS A BETTER SHAPE THAN THE ONE I BUILT AN HOUR AGO, and the reason is
   * worth keeping. I had made a centred scoreboard: crests either side, score
   * in the middle, clock beneath. That is what a scoreboard looks like when it
   * is the SUBJECT of the screen. On a broadcast it never is - it is a strip
   * that has to say six things while a football game happens behind it, and
   * every one of those six has a fixed place so your eye goes straight to the
   * one it wants without reading the others.
   *
   * This screen has exactly that problem. The subject is the call; the score,
   * the clock and the down are things you check without looking away. A bug is
   * the right instrument and a scoreboard was not.
   *
   * WHAT IS TAKEN AND WHAT IS NOT. Taken: the horizontal run, team blocks in
   * team color, the possession segment carrying the down and distance in that
   * team's color, and the two states. Not taken: the play clock, because ESPN's
   * summary does not carry one and a guessed number on a bug is worse than a
   * missing one - the whole point of a bug is that it is trusted at a glance.
   */
  const sb = el('div', 'lg-bug');
  /* Kept so the copy under the field is the SAME bar rather than a second
     implementation of it - see where it is cloned. */
  S.bugNode = sb;
  const poss = state.situation && state.situation.offenseTeamId;

  /* 🔴 TWO NAVY PANELS ARE ONE PANEL. Jason: "fix the gos and the colors" -
   * and this one is in the DATA, not the stylesheet. Straight off the wire:
   *
   *     NE  primary 002a5c  secondary c60c30
   *     SEA primary 002a5c  secondary 69be28
   *
   * ESPN gives the Patriots and the Seahawks the SAME navy. Not similar -
   * identical, to the byte. So the bug drew two blocks of one color and the
   * scoreboard stopped saying which score belonged to whom.
   *
   * 🔴 THE BUILD BRIEF WARNED ABOUT THIS IN THOSE WORDS: "the test set is every
   * PAIR of navy / yellow / null, including navy against navy." teamChip
   * already takes an `adjacentTo` for exactly this and exports `tooClose` to
   * decide it - I wrote a second colour path on the bug and did not use
   * either, which is how a documented hazard arrives anyway.
   *
   * The away side gives way, because the home team is the one the spread and
   * the field are quoted on and its color should be the stable one. Secondary
   * first; a neutral if that clashes too, which is honest - a team whose whole
   * palette collides with its opponent's does not get to be represented by a
   * colour here, and a grey block that reads is worth more than a navy one
   * that does not. */
  const panelColors = teamPalette(state);

  /* 🔴 NO MARK ON THE LEFT. Jason: "i dont need any graphic on the left side".
   *
   * I had put our football in the slot the network's eye occupies, reasoning
   * that if the reference brands its bug we should brand ours. Wrong reason.
   * A network's logo is there because the bug is THEIR furniture on somebody
   * else's picture - it is a credit, and it exists to be seen by people who
   * did not choose to be looking at it.
   *
   * Ours sits inside our own app, on a screen the person opened deliberately,
   * three inches under a nav bar with our mark on it. Nothing about it needs
   * to say whose app this is, and it was spending 31px of a 393px bar to
   * repeat something already answered - which is why the down and distance
   * clipped to "1st &". Branding was crowding out the score. */

  const colorFor = (id) => (String(id) === String(state.awayTeamId)
    ? panelColors.away : panelColors.home);

  /* The cached slate, if this screen has fetched one. Absent is absent. */
  const recordOf = (id) => {
    const games = (S.also && S.also.games) || [];
    for (const g of games) {
      for (const t of (g.teams || [])) {
        if (String(t.id) === String(id) && t.record && t.record !== '0-0') return t.record;
      }
    }
    return null;
  };
  const teamBlock = (id, t) => {
    const b = el('div', 'lg-bug-team');
    const c = colorFor(id);
    if (c) {
      b.style.setProperty('--tc', c);
      b.dataset.tinted = 'true';
    }
    if (id && poss && String(id) === String(poss)) b.dataset.poss = 'true';
    b.dataset.side = id === state.awayTeamId ? 'away' : 'home';
    /* 🔴 THE MARK IS THE WHOLE PANEL AND THE ABBREVIATION IS GONE. Jason: "i
       dont need the team name, just oversize the logo like the pic i sent."
     
       Every bug on his reference sheet does this - a big crest and a big
       number, no lettering. Which is right, because the crest IS the name: a
       person watching the Patriots recognises that logo faster than they read
       three capital letters, and printing both spends half the panel saying
       the same thing twice.
     
       teamChip's `size` is the MARK, not the element - it adds its own ring
       and padding, so 20 came back 28 and 28 comes back ~40, which fills a
       46px row. I have now measured that twice rather than assuming it.
     
       🔴 THE NAME STILL EXISTS FOR ANYONE NOT LOOKING. A crest with no text is
       an image with no alternative, so the panel carries the team name as its
       label - the information is unchanged, only the ink is. */
    /* 🔴 96px OF CREST IN A 62px BAR. Jason: "can you not make the logo larger
       and bleed out? yes or no?" - yes, and the reason it took so long is worth
       one line: the mark used to be IN the flow, so every size I asked for the
       row grew to hold, and the bleed was impossible by construction. Once it
       came out of flow the two stopped fighting, and the size is now free.

       teamChip multiplies by 1.4 to correct for ESPN's padded canvas, so 68
       renders 95px - about 17px of overhang top and bottom, cropped by the
       bar. */
    if (t) b.appendChild(teamChip({ id, ...t }, { size: 68, league }));
    if (t) {
      b.setAttribute('role', 'img');
      b.setAttribute('aria-label', t.name || t.short || t.abbrev || '');
    }
    /* 🔴 NO RECORD ON THE BUG. Jason: "honestly i dont need the 0-1 and 1-0 in
       the graphic."

       I put it there because both of his reference bugs carry one, and that
       was the wrong reason - those bugs are made for a broadcast where the
       viewer arrived at a random moment and may not know who these teams are.
       Somebody in this app chose this game, on a slate that shows the records,
       to place a call on it. They know.

       A reference tells you what a good version of this thing looks like; it
       does not tell you which of its parts your product needs. Copying the
       parts that solve somebody else's problem is how a clean bar fills up. */
    return b;
  };
  /* 🔴 THE SCORE IS THE BIGGEST THING ON THE BUG. From the reference sheet, and
   * it agrees with the order Jason set out hours ago - "score, down and
   * distance and what is our pick". Every bug on that sheet does the same
   * thing: the number is enormous, white, on the team's color, and everything
   * else on the bar is a caption to it. Ours had the score at --t-emph, the
   * same size as the abbreviation beside it, which made the bar a list of six
   * equal facts instead of a scoreboard. */
  const scoreBlock = (id, n) => {
    const d = el('div', 'lg-bug-sc num', String(n == null ? 0 : n));
    if (id && poss && String(id) === String(poss)) d.dataset.poss = 'true';
    return d;
  };

  /* 🔴 TWO LINES, SPLIT WHERE JASON SPLIT THEM: "maybe the score and posession
   * in the first line and the time down and distance on the second line?"
   *
   * That is the right cut and not merely a way to fit. Six segments on one
   * 393px bar meant every one of them was as narrow as the longest could be
   * allowed to get, and the down clipped to "1st &" - the bug failing at the
   * one job that made it worth building.
   *
   * The split is along a real seam. Line one is WHO AND HOW MANY - it changes
   * a handful of times a game and you glance at it. Line two is WHERE WE ARE -
   * it changes every snap and it is what you are calling on. Two things that
   * update at different rates and get read for different reasons should not be
   * competing for width on the same row. */
  /* 🔴 THE SCORES MEET IN THE MIDDLE AND EVERY BLOCK WEARS ITS TEAM'S COLOR.
   * Jason: "the colors match the team" and "scores in the center".
   *
   * I had the scores on a neutral dark block between two tinted ones, which
   * made the bar read as four unrelated segments. On the reference sheet each
   * side is ONE panel - mark, abbreviation and score all on the same color -
   * and the two panels meet at the centre, so the two numbers you are
   * comparing sit next to each other instead of at opposite ends.
   *
   * That is the whole reason to centre them: a score is never read alone, it
   * is read as a difference. Ten and thirteen a screen apart is two facts;
   * "10 13" is one. */
  const r1 = el('div', 'lg-bug-r');
  const awayScoreEl = scoreBlock(state.awayTeamId, state.awayScore);
  const homeScoreEl = scoreBlock(state.homeTeamId, state.homeScore);
  if (panelColors.away) { awayScoreEl.style.setProperty('--tc', panelColors.away); awayScoreEl.dataset.tinted = 'true'; }
  if (panelColors.home) { homeScoreEl.style.setProperty('--tc', panelColors.home); homeScoreEl.dataset.tinted = 'true'; }
  const homeBlock = teamBlock(state.homeTeamId, home);
  /* The home side mirrors, so its mark sits against the outer edge the way the
     away side's does. A bug that is symmetrical about the score reads as a
     matchup; one that runs left to right reads as a list. */
  homeBlock.dataset.mirror = 'true';
  /* 🔴 EACH SIDE IS EXACTLY HALF THE BAR. Jason: "the middle of the top line is
   * not the same as the second line or the field below?"
   *
   * It was not, and it MOVED. The row was four flex items - panel, score,
   * score, panel - with the panels flexing and the scores sized to their
   * digits. So the seam between the two scores sat whereever the numbers put
   * it, and it shifted every time a score went from one digit to two. Row two
   * is a 1fr 1fr grid and the field is centred on the page, so the bar had one
   * moving centre line against two fixed ones.
   *
   * Wrapping each side in a half that owns 50% pins it. The panel pushes to the
   * outside, the score to the middle, and the seam is at the centre of the
   * screen whatever the score is - which is what lets the eye read down the
   * three elements as one column. */
  const half = (side, a, b) => {
    const h = el('div', 'lg-bug-half');
    h.dataset.side = side;
    h.append(a, b);
    return h;
  };
  r1.append(half('away', teamBlock(state.awayTeamId, away), awayScoreEl),
            half('home', homeScoreEl, homeBlock));
  sb.appendChild(r1);
  /* 🔴 CLOCK LEFT, DOWN AND DISTANCE RIGHT, AND NO CHANNEL. Jason, correcting
   * himself immediately - "sorry, time is on the left of the second line" -
   * and then "remove the NBC, we dont need that here".
   *
   * The channel had been on this bar since the day it was added, on the
   * argument that an app about calling plays is useless without the game on a
   * screen in front of you. True the first time somebody opens it; false on
   * every snap after, because by then they are watching it. It is a fact you
   * need ONCE, and the bug is the one element that is always present - the
   * worst possible home for something read once.
   *
   * Two cells now, and the row reads the way the line above it does: what is
   * fixed on the left, what changes every snap on the right. */
  const r2 = el('div', 'lg-bug-r lg-bug-r2');
  sb.appendChild(r2);

  /* Quarter and clock, as one thing - they are never read apart. */
  r2.appendChild(el('div', 'lg-bug-clock num',
    state.status === 'pre' ? 'PRE'
      : state.status === 'final' ? 'FINAL'
      : state.situation ? `${ORDINAL[state.situation.quarter] || ('Q' + state.situation.quarter)} ${state.situation.clock}` : ''));

  /* THE POSSESSION SEGMENT, and it is the one that changes color. On a bug the
   * right-hand block belongs to whoever has the ball, which is how you know
   * without being told. */
  /* `lastPlay`, not `last` - the head builder already binds `last` further
     down and a second const in the same scope is a SyntaxError, which the ship
     gate caught before it reached anybody. Sixth name collision today. */
  const lastPlay = state.plays && state.plays[state.plays.length - 1];
  const txt = lastPlay ? ((lastPlay.typeText || '') + ' ' + (lastPlay.text || '')) : '';
  const isFlag = /penalty/i.test(txt);
  const bannerWord = bannerFor(lastPlay);

  const right = el('div', 'lg-bug-dd');
  const offC = poss ? colorFor(poss) : null;
  if (offC) right.style.setProperty('--tc', offC);
  if (isFlag) {
    right.dataset.state = 'flag';
    right.textContent = 'FLAG';
  } else if (state.status === 'final') {
    /* The clock cell already says FINAL. Saying it twice on one bar is the
       kind of thing a bug is specifically supposed not to do. */
    right.textContent = '';
  } else {
    /* "2ND & 7", not "2nd & 7". Small caps is how a bug has written a down for
       forty years, and at 393px an ordinal in caps is legible where mixed case
       is a smudge - the "nd" and "rd" are the two smallest glyphs on the bar. */
    /* 🔴 A DOWN IS 1, 2, 3 OR 4. NOTHING ELSE IS A DOWN. Jason's screenshot of
     * the touchdown banner had "-1 & 10" underneath it.
     *
     * The guard was `state.situation.down ? ... : ''`, which asks whether the
     * value is TRUTHY - and -1 is truthy. After a score ESPN reports the down
     * as -1, meaning "there isn't one", and the ordinal table has no entry for
     * it so the raw number printed straight through.
     *
     * 🔴 A TRUTHINESS CHECK IS NOT A VALIDITY CHECK, and this is the shape it
     * fails in: every sensible value passes, so it looks right for a whole
     * game, and the one moment it breaks is the moment everybody is looking -
     * a touchdown. Same family as "0 yards to the end zone" an hour ago: a
     * template applied to a number that had stopped being a measurement.
     *
     * There is no down after a score, so the cell says nothing. The banner
     * above it is doing the talking. */
    const dn = state.situation && state.situation.down;
    const dist = state.situation && state.situation.distance;
    right.textContent = (dn >= 1 && dn <= 4)
      ? ORDINAL[dn] + ' & ' + (dist === 0 ? 'GOAL' : dist)
      : '';
  }
  r2.appendChild(right);
  head.appendChild(sb);

  /* THE STRIP ABOVE, which on a broadcast carries whatever the director wants
   * to say right now. Ours says the one thing the app knows and the bug cannot
   * fit: what the flag was for, or that somebody scored. Absent otherwise -
   * a permanently-present strip is a second bug, not an announcement. */
  if (bannerWord) {
    /* Plain text - the CSS does the letter-spacing. It used to be typed as
       "T O U C H D O W N" with the tracking ALSO in the stylesheet, which is
       fine for one hard-coded word and falls apart the moment there are four. */
    const banner = el('div', 'lg-bug-banner', bannerWord);
    banner.dataset.kind = bannerWord === 'NO GOOD' ? 'miss' : 'score';
    /* The ADJUSTED colour, not the team's raw primary - the panels already
       swapped New England to its secondary because both teams are the same
       navy, and a banner in the unswapped colour would celebrate in a shade
       that appears nowhere else on the bar. */
    const scorerC = lastPlay && lastPlay.offenseTeamId ? colorFor(lastPlay.offenseTeamId) : null;
    if (scorerC) banner.style.setProperty('--tc', scorerC);
    head.insertBefore(banner, sb);
  } else if (isFlag) {
    /* The feed writes "PENALTY on SEA-E.Saubert, False Start, 5 yards" - the
       middle clause is the foul, and it is the only part worth a banner. */
    const m = (lastPlay.text || '').match(/PENALTY on [^,]+,\s*([^,]+)/i);
    if (m) head.insertBefore(el('div', 'lg-bug-tab', m[1].trim().toUpperCase()), sb);
  }

  /* The channel lives on the bug now - see the left cell of row two. */
  /* 🔴 NOT BEFORE KICKOFF. The head is the live scoreboard - two crests, the
   * score, the quarter and the channel - and before a game has started it says
   * "0 - 0, Not started" directly above an Upcoming card carrying the same two
   * crests and the same channel. Two versions of one fact, the smaller one
   * first, and the 0-0 is a score that does not exist yet.
   *
   * The Upcoming card IS the pre-game head. This one appears when there is
   * something to put in it. */
  if (state.status !== 'pre') wrap.appendChild(head);

  if (state.status === 'pre') {
    wrap.appendChild(pregame(state, now, wrap));
    /* 🔴 WHAT ELSE IS ON. Jason, 2026-09-09: "What do you see when there are
     * multiple games?" - and the honest answer was NOTHING. This screen followed
     * one game, the front door offered one game, and on a Saturday with twenty
     * kickoffs the app silently picked one and never mentioned the rest.
     *
     * That is fine on Wednesday, when the opener is the only game there is, and
     * indefensible on Saturday. So the next few kickoffs after this one are
     * listed under it, tappable, with the count so the number is never a
     * surprise - and the full list is one tap away on the slate.
     *
     * THREE, not all of them. A pre-game screen that turns into a second slate
     * has stopped being about a game; the slate already exists and is better at
     * being a slate. Three is enough to say "there is more than this one". */
    /* 🔴 THE THINGS THAT USED TO BE ON HOME LIVE HERE NOW, because Home became
     * the front door and a front door carries one question. Everything ABOUT a
     * game belongs on the game: the week's card for the same league, the invite
     * that opens this fixture, and the ad slot - which is allowed here only
     * because a pre-game screen is a browsing screen. It disappears the moment
     * the game starts and tiles carrying a price and a countdown appear, which
     * is the ad doctrine's actual rule rather than a place on the page. */
    const wk = el('button', 'lg-mode lg-go lg-wide');
    wk.appendChild(el('span', 'lg-mode-h', S.mode === 'pool' ? 'Open your group' : "The week's card"));
    wk.appendChild(el('span', 'lg-mode-b', S.mode === 'pool'
      ? 'Pick the week for points' : 'Against the spread, every pick pays 2.00×'));
    wk.onclick = () => { location.hash = '#/slate'; };
    wrap.appendChild(wk);

    /* 🔴 NO SECOND INVITE. pregame() already appends one, and adding another
     * here put the same button on the screen twice - the kind of duplicate that
     * survives because both copies work. Found by reading the rendered text
     * rather than the code: "Invite a friend ... Post it ... The week's card ...
     * Invite a friend". */
    /* 🔴 THE LIST GOES AFTER THE ACTIONS. It was drawn straight after the
     * Upcoming card, which pushed the week's card - a primary action - below
     * six rows of other fixtures. A list of what else is on is a browsing
     * aid; it never outranks the two things this screen is asking you to do. */
    alsoOn(wrap, state, now);
    wrap.appendChild(adSlot('banner', 'Your ad here · reserved, nothing sold yet'));
    return;
  }

  /* ---- the bank ---- */
  const rows = settleAll(state);
  /* NOT A CARD ANY MORE. Jason, ranking the screen: "score, down and distance
   * and what is our pick are probably the most important" - and of the bank,
   * "probably not the top 3 most important items".
   *
   * He is right, and the balance had been given a full white card with a lead
   * line and the largest type in the system since the day it was built. It is
   * a fact you check between calls, not one of the three things the screen is
   * FOR. A card is the strongest container this app has, and spending one on
   * a fourth-place fact pushes the first three down the page.
   *
   * So it becomes a strip: one line, no panel, no lead sentence. "329 Marbles
   * +129" says everything the card said - the word Marbles still carries the
   * legal point that it is a thing you HAVE - in a fifth of the height. */
  const bank = el('div', 'lg-bank');
  /* 🔴 A NUMBER WITH NO SENTENCE IS A SCORE. Jason: "add 'you have...' above the
   * 200." A bare 200 could be points, a rank, or a countdown; "You have 200
   * Marbles" is the only reading that says it is YOURS and that it is a stake
   * you are about to spend. It also seats the balance in the one sentence the
   * legal position rests on — a thing you HAVE, never a thing you bought. */
  const bal = el('div', 'lg-bal num', String(S.bank));
  bank.append(bal, el('span', 'lg-unit', 'Marbles'));
  const d = el('span', 'lg-delta num ' + signClass(S.bank - START_BANK));
  d.textContent = signed(S.bank - START_BANK);
  bank.appendChild(d);
  /* Built here, DRAWN further down - see where it is appended, above the play
     by play. The order of this file is not the order of the screen. */

  /* 🔴 BETWEEN THE BANK AND THE QUESTION. Jason, live: "Move down and dist pill
   * to between the marbles pill and the what to do pill."
   *
   * It was inside the call card, under the heading - which made it read as part
   * of the question rather than as the state the question is asked in. Out here
   * it is a fact about the GAME sitting between what you have and what you are
   * being asked, which is the order you actually read them in: how many marbles,
   * where the ball is, what is the call. */
  /* THE PILL IS GONE, AND IT IS THE FIELD'S FAULT IN A GOOD WAY. It said
   * "1st & 10 at NE 47  SEA" and sat directly above a field graphic whose own
   * caption says "1st & 10 at NE 47" - the same sentence twice, six pixels
   * apart, which is the mistake that killed the first info card.
   *
   * It was right when it shipped: there was no field then, and the spot had to
   * be somewhere. The field says it better - it shows the spot and then names
   * it - and possession, the one thing the pill added, is the yellow dot on the
   * scorebug. When a new component makes an old one redundant, the old one
   * goes; keeping both is how a screen fills up with things that were each
   * justified on the day. */
  const dl = null;
  if (dl) wrap.appendChild(dl);
  /* 🔴 NOTHING BETWEEN THE SCORE AND THE FIELD. Jason: "do not put the
   * commercial break or anything inbetween the score and the field."
   *
   * The stoppage pill used to sit there and it split the one thing the last
   * hour was spent joining - bar, field, bar as a single instrument. Anything
   * inserted into that seam breaks the object back into pieces, however
   * useful it is on its own.
   *
   * It is not lost: the bar UNDER the field says it now, which is where a
   * stoppage belongs anyway - it is the current state of play, and that bar is
   * the current state of play. Touchdowns and penalties still come above,
   * because those are not states, they are events, and an event announces
   * itself over the top. */
  /* Directly under the spot it illustrates - the pill says "3rd & 5 at SEA 31"
     and this is the same sentence in a picture. */
  const fs = fieldStrip(state);
  const flash = flashFor(state, now);
  /* No field to write it across - the feed often drops the spot at a break -
     so the word takes the field's place rather than disappearing with it. */
  if (!fs && flash) wrap.appendChild(flashNode(flash, state, true));
  if (fs) {
    /* 🔴 ONE GROUP, SO THE GRID GAP CANNOT GET BETWEEN THEM. Jason: "push them
     * together". Setting the margins to zero did nothing, because the spacing
     * was never a margin - `.lg` is a grid with `gap: 10px`, and a gap is a
     * property of the CONTAINER, not of the things in it. No amount of editing
     * the children reaches it.
     *
     * So the bar, the field and the copy become a single grid item with no gap
     * of its own. The negative top margin cancels the one gap that remains -
     * the one above the group - so the whole assembly sits flush under the
     * header bar as well. */
    const stack = el('div', 'lg-fieldstack');
    /* A box around the field ONLY, so the flash covers the turf and not the
       play bar under it. The field node is persistent and redraws itself every
       animation frame, so the flash cannot live inside it - it is a sibling. */
    const fbox = el('div', 'lg-fieldbox');
    fbox.appendChild(fs);
    if (flash) fbox.appendChild(flashNode(flash, state, false));
    const tvb = tvFlipButton(state, wrap);
    if (tvb) fbox.appendChild(tvb);
    stack.appendChild(fbox);
    /* 🔴 THE SCORE AGAIN, UNDER THE FIELD. Jason: "can you copy the game score
     * to beneath the field as well, i want to see both."
     *
     * A CLONE, NOT A SECOND SCORE COMPONENT. The two can never disagree,
     * because there is one builder and one set of decisions behind it - the
     * colour clash resolution, the possession dot, the ordinals, the flag and
     * touchdown states. A parallel "compact score" would have been a second
     * place for all of that to be got slightly differently, which is how the
     * same fact ends up rendered two ways on one screen.
     *
     * It carries no listeners, so cloneNode is safe; if the bar ever gains one
     * this becomes a second call to the builder instead. */
    /* 🔴 THE BOTTOM BAR IS THE LATEST PLAY, NOT A SECOND SCOREBOARD. Jason:
     * "the bottom score... i want to change that now to display the most
     * current play. keep the top score and the field as they are."
     *
     * The duplicate score was his idea an hour ago and it was a reasonable
     * one - see both, do not scroll. Having lived with it, the second copy
     * says nothing the first did not, and the space under the field is the
     * most valuable strip on the screen: it is directly beneath the thing you
     * are looking at and directly above the question you are about to answer.
     *
     * What belongs there is what just happened. The field shows WHERE the ball
     * is; this says HOW it got there. Together they are the whole picture of
     * the moment being called.
     *
     * 🔴 HELD PLAYS ONLY, like everything else on this screen - the newest
     * VISIBLE play, never the raw feed's newest. A bar under the field that
     * ran ahead of the field would leak the play the app is still asking
     * about, which is the one thing this product cannot do. */
    const lp = (state.plays || [])[state.plays.length - 1];
    if (lp) {
      const bar = el('div', 'lg-lastbar');
      const when = (lp.quarter ? 'Q' + lp.quarter : '') + (lp.clock ? ' ' + lp.clock : '');
      if (when.trim()) bar.appendChild(el('span', 'lg-lastbar-w num', when.trim()));
      /* A stoppage is not a play, so it does not get read out as one. The feed
         writes "Official Timeout at 04:39." - true, and not what a person
         wants under a field. They want to know nothing is about to happen and
         roughly for how long. */
      const st = stoppageOf(lp);
      if (st) {
        bar.dataset.state = 'stoppage';
        bar.appendChild(el('span', 'lg-lastbar-k', st.label));
        bar.appendChild(el('span', 'lg-lastbar-t', st.note));
      } else {
        bar.appendChild(el('span', 'lg-lastbar-t', playText(lp.text).trim()));
      }
      stack.appendChild(bar);
    }
    wrap.appendChild(stack);
    /* Under the field it is about, never between the score and the field. */
    const ask = tvAsk(state, wrap);
    if (ask) wrap.appendChild(ask);
  }
  /* Under the question, where the thumb already is - a timing button you have to
     go and find measures reaction time to the button, not the television. */
  /* 🔴 OFF THE BOARD, NOT OUT OF THE CODE. Jason: "lets remove the snap button,
   * we dont need it anymore, right?" Right - it answered its question. His
   * television is 39 seconds behind on 16 samples, the feed is 53, snaps are 41
   * apart, and the conclusion it bought was that this product does not need a
   * paid data feed. That is a large answer for one button and it has been got.
   *
   * 🔴 IT IS KEPT BECAUSE THE ANSWER IS HIS, NOT EVERYBODY'S. The condition the
   * whole live layer rests on -
   *
   *     feed_lag < tv_lag + gap_between_snaps
   *
   * has a term that belongs to the VIEWER. Jason streams and is 39s behind; a
   * person on an aerial is nearer 10, and for them we would be asking about a
   * snap they had already watched. This is the only instrument that can tell us
   * that about somebody who is not in the room, and deleting it would mean
   * rebuilding it the first time a stranger says the questions feel late.
   *
   * So: hidden by default, one flag to bring it back. `?tvlag=1` turns it on
   * and remembers, `?tvlag=0` turns it off. */
  let showTv = false;
  try {
    const q = new URLSearchParams(location.search).get('tvlag');
    if (q === '1') localStorage.setItem('ag.tvlag', '1');
    if (q === '0') localStorage.removeItem('ag.tvlag');
    showTv = localStorage.getItem('ag.tvlag') === '1';
  } catch { /* no storage, no meter */ }
  const tv = showTv ? tvCard(state, wrap) : null;

  /* ---- the question ---- */
  const type = questionFor(state);
  const last = state.plays[state.plays.length - 1];
  const already = last ? S.calls[last.id] : null;
  const skipped = last ? !!S.skips[last.id] : false;

  /* 🔴 A FINISHED GAME DOES NOT ASK YOU WHAT HAPPENS NEXT. Caught in a screenshot
   * on 2026-09-08: the head read Q4 0:00 with a final score above a card asking
   * "Run or pass — and do they get the first down?" over four priced tiles. There
   * is no next play. Anything staked there could never settle, and the app was
   * inviting it.
   *
   * It matters tonight rather than in theory: every game ends, so every session
   * of this app finishes on this screen. The last thing it shows should be what
   * happened, not a question it cannot answer. */
  if (state.status === 'final') {
    const done = el('div', 'card lg-done');
    done.appendChild(el('div', 'lg-done-h', 'Final'));
    done.appendChild(el('div', 'lg-done-b',
      S.bank === START_BANK
        ? 'You finished level.'
        : `You finished ${S.bank > START_BANK ? 'up' : 'down'} ${Math.abs(S.bank - START_BANK)}, on ${S.bank} Marbles.`));
    wrap.appendChild(done);
  } else if (!type && last && atHalfTime(state)) {
    const c = el('div', 'card lg-call is-waiting');
    c.appendChild(el('div', 'lg-waiting', 'Half time — back at the second-half kickoff'));
    wrap.appendChild(c);
  } else if (type && last && !already && skipped) {
    /* 🔴 A PASS IS AN ANSWER AND THE CARD SHOULD SAY SO. Jason, live: "In cards
     * like 10 yards or more, add a skip button."
     *
     * The only way not to bet was to not tap, which is silence rather than a
     * decision - the question sat there looking unanswered for the whole snap,
     * and on a question you do not fancy that is the app nagging you. Half the
     * skill in this game is knowing which snaps to sit out; an app that only has
     * a verb for BETTING treats sitting out as a failure to act.
     *
     * 🔴 IT STAKES NOTHING AND IT IS NOT A CALL. It never reaches S.calls, so it
     * cannot settle, cannot appear on the board and cannot touch the bank. It is
     * a note to the screen saying "stop asking me this one". */
    /* 🔴 NOTHING. NOT A CARD SAYING YOU SKIPPED. Jason: "If I skip, take the
     * card away and go to the next card. Or leave blank."
     *
     * The first version replaced the question with a card reading "Sat this one
     * out" and an undo link - which is the app acknowledging itself. A skip is
     * not an event worth a card; it is the ABSENCE of one, and the whole point
     * of pressing it is to stop looking at that question. Confirming a dismissal
     * with a panel in the same slot is the dismissal not working.
     *
     * The next snap replaces this space on its own, usually within a minute, so
     * there is nothing to navigate to and nothing to restore. A mis-tap costs
     * one snap out of a hundred and fifty.
     *
     * 🔴 BUT NOT AN EMPTY SPACE EITHER. Jason: "When we take everything away.
     * Say waiting for the snap…"
     *
     * Right, and it is the difference between a dismissal and a hole. A card
     * that vanishes leaving nothing reads as the app losing its place - the same
     * failure as a frozen board that looks healthy, in miniature. One line says
     * the screen is still working and something is coming, which is exactly what
     * is true. It is a LINE, not a card: a panel here would be the "Sat this one
     * out" card again in quieter clothes. */
    wrap.appendChild(waitingCard(state, now));
  } else if (type && last && !already) {
    const card = el('div', 'card lg-call');
    /* 🔴 THE SAME FOUR WORDS OVER EVERY QUESTION. Jason: "above the question,
     * have a standard call to action, You make the call..."
     *
     * The questions rotate - run or pass, ten yards or more, how does this
     * drive end - and each arrives as a fresh sentence, so the card never had
     * a fixed thing to recognise. A line that is identical on every snap is
     * what turns twenty different questions into one repeated ritual: you see
     * those words, you know a call is open, before you have read what it is
     * about.
     *
     * It is also the product's whole promise in four words, and this is the
     * one place in the app where the person is actually being asked to make
     * one. */
    card.appendChild(el('div', 'lg-cta', 'You make the call…'));
    card.appendChild(el('div', 'lg-q', askAbout(type, state)));
    /* 🔴 SAY WHICH PLAY THIS IS, BECAUSE THE CARD READ AS THOUGH IT WAS ASKING
     * ABOUT THE ONE PRINTED UNDER IT. Jason: "It asked left middle or right
     * after the play and a while after I hit the play."
     *
     * The line under the question was the text of the play that has just
     * FINISHED - context for the call, and the only thing on the card in a
     * complete sentence. Directly beneath "Left, middle, or right?" it reads as
     * the answer's subject, so a question about the next snap looks like a
     * question about a pass you have already watched go left.
     *
     * Two words fix the sentence and nothing else changes: the question is about
     * the NEXT snap, and this is what happened before it. */
    /* 🔴 THE LAST PLAY LINE IS GONE FROM THE QUESTION. Jason: "remove this, we
     * already have it just above."
     *
     * It was right when it shipped - the card was the only place saying what
     * had just happened, and a question about the next snap needs the context
     * of the last one. Then the bar under the field took that job, and this
     * became the same sentence twice, four pixels apart, in a smaller
     * typeface.
     *
     * Fourth time tonight one element has been retired because a better one
     * arrived: the down-and-distance pill went when the field's caption
     * covered it, the caption went when the scorebug covered that, the second
     * scoreboard went when this bar replaced it. Every one of them was
     * justified on the day it was built. 🔴 THE HABIT WORTH KEEPING IS ASKING
     * WHAT A NEW COMPONENT MAKES REDUNDANT, at the moment it lands, rather
     * than waiting for somebody to circle it in a screenshot. */
    card.appendChild(el('div', 'lg-nextq', 'You are calling the NEXT snap'));

    /* ONE CHIP, NOT THREE BUTTONS. Jason: "should we just put a typical amount
     * say 5 so we get more realestate on the page?"
     *
     * The ladder was a full 44px row on every question card, permanently, to
     * express a choice most people make once and never touch again. That is a
     * row of screen spent on a setting - and the three things that matter are
     * below it, pushed down on every single snap.
     *
     * It is not removed, because the stake IS the game and a fixed stake would
     * make every call the same size. It cycles: tap it and it steps 5 -> 10 ->
     * 25 -> 5. Cheap to change, invisible when you are not changing it, and the
     * amount is still on the tile beside what it pays. */
    const stakeChip = el('button', 'lg-stakechip');
    stakeChip.type = 'button';
    stakeChip.appendChild(el('span', 'lg-stakechip-n num', String(S.stake)));
    stakeChip.appendChild(el('span', 'lg-stakechip-l', 'Marbles · tap to change'));
    stakeChip.onclick = () => {
      const i = STAKES.indexOf(S.stake);
      S.stake = STAKES[(i + 1) % STAKES.length];
      store.set('stake', S.stake);
      paint(wrap);
    };
    card.appendChild(stakeChip);

    const priced = priceFor(type, state, state.situation?.offenseTeamId || last.offenseTeamId);
    const tiles = el('div', 'lg-tiles' + (priced.length > 3 ? ' is-4' : ''));
    for (const o of priced) {
      const b = el('button', 'lg-tile');
      b.appendChild(el('span', 'lg-tile-label', o.choice.label));
      /* 🔴 THE PRICE IS ON THE TILE, BEFORE THE TAP. */
      b.appendChild(el('span', 'lg-tile-win num', '+' + (Math.round(S.stake * o.pays) - S.stake)));
      b.appendChild(el('span', 'lg-tile-x num', o.pays + '× · ' + Math.round(o.p * 100) + '%'));
      b.onclick = () => makeCall(wrap, type, o, last, state);
      tiles.appendChild(b);
    }
    card.appendChild(tiles);
    card.appendChild(el('p', 'lg-note',
      priced[0].samples < 6
        ? 'Priced off a prior — the model has barely seen this game yet'
        : `${priced[0].samples} snaps from this offense tonight`));

    /* 🔴 QUIET, AND BELOW THE PRICES. It is a real choice, not a call to action -
     * a skip button styled like the tiles would compete with the thing you came
     * to do, and one styled like a dismissal would read as "close this". */
    const skip = el('button', 'lg-skip', 'Skip this one');
    skip.type = 'button';
    skip.onclick = () => { S.skips[last.id] = 1; store.set('skips', S.skips); paint(wrap); };
    card.appendChild(skip);
    wrap.appendChild(card);
  } else if (already && last) {
    /* 🔴 THE CARD GOES AWAY ONCE THE CALL IS MADE. Jason: "When I set a card,
     * take it away. And say waiting for the snap."
     *
     * 🔴 THIS REVERSES A CALL HE MADE ON 2026-09-08 - "when you select a run or
     * pass, it should highlight, it does not do that now" - and the reversal is
     * right for a reason worth recording. That instruction was against a card
     * that replaced itself with a sentence, throwing away what you took and what
     * it pays. The lit tile fixed a card you were still LOOKING at.
     *
     * Then two things changed. The bet became visible in the open-calls list
     * below, so the tile is no longer the only record of it; and the feed turned
     * out to be minutes behind, so the wait between a call and its answer is
     * long. A lit card sitting through a two-minute wait is not feedback any
     * more, it is a question you have already answered refusing to leave the
     * screen - the same fault as the "Sat this one out" card, in the other half
     * of the same branch.
     *
     * So both paths end the same way: the question is gone and the line says
     * what is true. What you staked lives in the list below, which is where a
     * record belongs. */
    wrap.appendChild(waitingCard(state, now));
  }

  /* ---- what just happened, in words ---- */
  const said = commentary(state);
  if (tv) wrap.appendChild(tv);
  /* THE BALANCE SITS HERE, BELOW THE DECISION. Jason: "maybe move the marbles
   * to just above the play by play?"
   *
   * Which completes the ranking he set out - "score, down and distance and what
   * is our pick are probably the most important". Those three now run
   * uninterrupted from the top: scoreboard, the spot, the question. The balance
   * used to sit in the middle of that run, between the score and the down, so
   * every glance at the thing you are deciding crossed a number about your
   * wallet.
   *
   * Above the play by play is the right home for it rather than merely a place
   * out of the way: it is the last line of the ACTIVE half of the screen and
   * the first of the record - what you have, then what happened. The delta
   * beside it is the join between the two. */
  if (bank) wrap.appendChild(bank);
  if (said) wrap.appendChild(said);

  /* ---- and a picture of it, if it was worth one ---- */
  const react = reactions(state, wrap);
  if (react) wrap.appendChild(react);

  /* ---- brag about the best one ---- */
  const brag = bragButton(state, rows);
  if (brag) wrap.appendChild(brag);

  /* ---- what happened ---- */
  if (rows.length) {
    const list = el('div', 'card lg-rows');
    for (const r of rows.slice(0, 8)) {
      const row = el('div', 'lg-row' + (r.open ? ' is-open' : r.void ? ' is-void' : r.landed ? ' is-up' : ' is-down'));
      row.appendChild(el('span', 'lg-row-label', r.label));
      row.appendChild(el('span', 'lg-row-why', r.open ? 'open' : r.because || ''));
      const v = el('span', 'lg-row-delta num');
      v.textContent = r.open ? '—' : r.void ? '0' : signed(r.delta);
      row.appendChild(v);
      list.appendChild(row);
    }
    wrap.appendChild(list);
  }

  /* ---- who are you? asked AFTER the first call, never before ---- */
  if (!S.name && Object.keys(S.calls).length) wrap.appendChild(nameCard(wrap));

  /* ---- the board: everybody on this game, ranked on what they have made ---- */
  const board = boardRows(state);
  if (board.length) {
    const me = deviceId();
    const b = el('div', 'card lg-board');
    b.appendChild(el('div', 'lg-board-h', board.length === 1 ? 'On this game' : 'On this game · by profit'));
    board.forEach((p, i) => {
      const row = el('div', 'lg-brow' + (p.deviceId === me ? ' is-me' : ''));
      row.appendChild(el('span', 'lg-brank num', String(i + 1)));
      row.appendChild(el('span', 'lg-bname', p.name + (p.deviceId === me ? ' · you' : '')));
      /* The record is the context the profit needs. A +40 off one call and a +40
       * off eleven are not the same person, and the board should say so. */
      const rec = [];
      if (p.won || p.lost) rec.push(`${p.won}-${p.lost}`);
      if (p.open) rec.push(`${p.open} open`);
      if (p.voided) rec.push(`${p.voided} void`);
      row.appendChild(el('span', 'lg-brec num', rec.join(' · ')));
      const v = el('span', 'lg-bprofit num ' + signClass(p.profit));
      v.textContent = signed(p.profit);
      row.appendChild(v);
      b.appendChild(row);
    });
    wrap.appendChild(b);
  }

  wrap.appendChild(inviteButton(state));

  wrap.appendChild(el('p', 'lg-foot',
    `feed ${age}s old · holding ${state.holding} play${state.holding === 1 ? '' : 's'} behind your ${S.delayMs / 1000}s delay`));
}

/**
 * 🔴 NOTHING STANDS BETWEEN A STRANGER AND THEIR FIRST CALL.
 *
 * This used to open `prompt()` — a browser dialog, as the very first thing
 * somebody handed the link would ever see, and one that several mobile browsers
 * suppress outright. When it is suppressed the function returns early and the
 * TAP DOES NOTHING, silently, forever. Your friend would have concluded the app
 * was broken and they would have been right.
 *
 * Settled doctrine already had the answer and it was not being followed: a
 * display name is the most that may be asked, AND IT COMES AFTER THE FIRST PICK.
 * So the call lands first, unnamed, and the name is asked for afterwards — in
 * the page, as a real field, and skippable.
 */
async function makeCall(wrap, type, offer, afterPlay, state) {
  S.calls[afterPlay.id] = {
    /* 🔴 THE CALL REMEMBERS WHICH GAME IT WAS MADE IN. Without this the bank
       cannot be per game, because a play id alone does not say what it
       belongs to unless you happen to know ESPN prefixes them with the event
       - which it does, and which is not a thing to rely on. */
    gameId: state.gameId || (S.key || '').split(':')[1] || null,
    type: type.id, choice: offer.choice.id, label: offer.choice.label,
    stake: S.stake, pays: offer.pays, p: offer.p,
    /* A drive call is settled by the drive it belongs to, not by the next snap,
     * so both travel with it. */
    scope: type.scope, driveId: afterPlay.driveId,
    down: state.situation?.down ?? null, distance: state.situation?.distance ?? null
  };
  store.set('calls', S.calls);
  paint(wrap);
  try {
    await fetch('/api/call', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        key: S.key, deviceId: deviceId(), name: S.name,
        afterPlayId: afterPlay.id, type: type.id, choice: offer.choice.id,
        stake: S.stake, p: offer.p
      })
    });
  } catch { /* the call is already local; the board catches up */ }
}

/**
 * 🔴 A FROZEN FEED MUST LOOK FROZEN. This is the second half of the poller fix
 * and it is the half that reaches the phone.
 *
 * On 2026-09-08 the poller died after 36 minutes with no error. The Worker kept
 * serving the last state it had been pushed, so this screen went on rendering a
 * game head, a score, a board and a delay bar that said BEHIND ON PURPOSE — a
 * completely healthy-looking page in front of a game that had stopped existing.
 * Nobody watching could have told.
 *
 * A blank screen sends somebody to find out why; a stale one does not. So the
 * staleness is drawn, in the app, above everything else.
 *
 * 🔴 THE THRESHOLD IS DERIVED FROM THE POLLER'S OWN PROMISE, NOT FROM A GUESS
 * ABOUT FOOTBALL. This said "the poller pushes every 10s, so anything past ~45s
 * is three missed pushes" — and the poller does not push every 10s. It POLLS
 * every 12s and DEDUPES, guaranteeing only a heartbeat write, which was four
 * minutes. So the screen called the feed dead after 45 seconds of a silence the
 * poller was designed to produce.
 *
 * 🔴 IT FIRED ON JASON'S PHONE IN THE FIRST QUARTER OF THE OPENER, over an
 * official timeout, while the feed was healthy and 15 seconds from its last
 * write. The banner is deliberately the loudest thing in the app — it has to be,
 * because a frozen board that looks fine is the failure it exists to prevent —
 * and pointing it at a working system is the fastest way to make people stop
 * believing it.
 *
 * The poller now publishes its own heartbeat with the state, so this cannot
 * drift from it again: an alarm is only meaningful against a promise, and the
 * promise has to arrive from the thing making it.
 */
export function staleness(state, now) {
  const at = state?.pushedAt || state?.fetchedAt || 0;
  if (!at) return null;
  const age = Math.max(0, now - at);
  /* Pre-kickoff the poller is on a five-minute cycle on purpose. Twelve minutes
   * is two missed slow pushes, which is a real fault rather than the backoff. */
  if (state.status === 'pre') return age > 12 * 60 * 1000 ? { age, limit: 12 * 60 * 1000 } : null;
  /* Live: two missed heartbeats plus a network's worth of slack. The fallback is
   * the OLD heartbeat, not the new one - a state published by a poller too old
   * to send the field is a poller that really is on four minutes, and guessing
   * 20s at it would recreate the false alarm from the other side. */
  const beat = typeof state.heartbeatMs === 'number' ? state.heartbeatMs : 4 * 60 * 1000;
  const limit = beat * 2 + 15 * 1000;
  return age > limit ? { age, limit } : null;
}

function staleBar(state, now) {
  const s = staleness(state, now);
  if (!s) return null;
  const secs = Math.round(s.age / 1000);
  const ago = secs < 90 ? `${secs}s` : `${Math.round(secs / 60)} min`;
  const bar = el('div', 'lg-stale');
  bar.appendChild(el('span', 'lg-stale-l', 'THE FEED HAS STOPPED'));
  bar.appendChild(el('span', 'lg-stale-b',
    `Nothing new for ${ago}. What is below is the last thing we were told, not the game.`));
  return bar;
}

/**
 * The name field. A real input in the page — not a browser dialog — because a
 * dialog is suppressible, unstyleable, and arrives before the person has any
 * reason to answer it.
 *
 * It appears only once a call has actually been made, which is the moment the
 * question earns itself: there is now a row on the board that says "Someone",
 * and naming it is obviously worth doing. Skipping is a real option and leaves
 * them as Someone, which is a perfectly good way to play.
 */
function nameCard(wrap) {
  const c = el('div', 'card lg-name');
  c.appendChild(el('div', 'lg-name-h', "You're on the board as Someone"));
  c.appendChild(el('div', 'lg-name-b', 'Put a name to it so the others know who they are up against.'));

  const rowEl = el('div', 'lg-name-row');
  const input = el('input', 'lg-name-i');
  input.type = 'text';
  input.maxLength = 24;
  input.placeholder = 'Your name';
  /* No autofocus: it would throw the keyboard up over the call card mid-drive,
   * which is the opposite of what somebody watching a game wants. */
  input.autocomplete = 'nickname';

  const save = el('button', 'lg-name-go', 'Save');
  const commit = () => {
    const v = input.value.trim().slice(0, 24);
    if (!v) return;
    S.name = v;
    store.set('name', v);
    claimCalls();          // rename the rows already on the board
    paint(wrap);
  };
  save.onclick = commit;
  input.onkeydown = (e) => { if (e.key === 'Enter') commit(); };

  const skip = el('button', 'lg-name-skip', 'Stay anonymous');
  skip.onclick = () => { S.name = 'Someone'; store.set('name', 'Someone'); paint(wrap); };

  rowEl.append(input, save);
  c.append(rowEl, skip);
  return c;
}

/**
 * 🔴 A NAME ARRIVING LATE HAS TO REACH THE CALLS ALREADY MADE, or the person who
 * just named themselves still shows up as a stranger beside their own results.
 *
 * Re-posting a call the server already has is safe by construction: the key is
 * game + device + the play it was made after, so the choice, the stake and the
 * price cannot be changed by this. Only the name can. That is the whole reason
 * one-call-per-snap was enforced by the KEY rather than by a check.
 */
function claimCalls() {
  for (const [afterPlayId, call] of Object.entries(S.calls)) {
    fetch('/api/call', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        key: S.key, deviceId: deviceId(), name: S.name,
        afterPlayId, type: call.type, choice: call.choice, stake: call.stake, p: call.p
      })
    }).catch(() => { /* the next call carries the name anyway */ });
  }
}

/**
 * 🔴 THE COLD OPEN. What somebody sees when they have never been here before.
 *
 * Everything about this app hangs off ONE counter-intuitive fact and nothing on
 * screen said it: THE DELAY IS THE GAME. A stranger handed the link finds a
 * slider labelled "BEHIND ON PURPOSE · 45s" sitting above a football game, and
 * the obvious move — the move anybody makes with a slider marked delay — is to
 * drag it to zero and be live. That single tap turns the whole thing into a
 * scoreboard that can only report what already happened, and they would conclude
 * the app is pointless. They would be right about what they were holding.
 *
 * So it is explained once, before the first call, in the words the mechanic
 * actually works in — and it is dismissible, because an explanation that keeps
 * arriving is an obstacle. Jason, on a different panel: "i dont need this every
 * fucking time either."
 */
/**
 * The first question, and the only one asked before the game is shown.
 *
 * 🔴 IT IS NOT A COSMETIC PREFERENCE. A sack settles as a PASS in the NFL and a
 * RUSH in college — every operator rulebook says so in the same words — and the
 * tendency model behind the prices is 697,997 COLLEGE plays with no NFL
 * equivalent. Picking the wrong one does not produce an error; it produces calls
 * that grade the other way and prices drawn from the wrong sport.
 *
 * Changeable afterwards from the same place, because somebody who watches both
 * should not have to clear their browser to switch.
 */
/* The marbles explainer, on the front door where somebody has just chosen to
 * play them - not on every pre-game screen for the rest of the season. */
function marblesCard() {
  const q = el('div', 'card lg-what');
  q.appendChild(el('div', 'lg-what-h', `You start with ${START_BANK} Marbles`));
  q.appendChild(el('p', 'lg-what-b',
    'Everybody starts on the same number and it resets next game, so nobody is ever out. '
    + 'They cannot be bought.'));
  const ul = el('div', 'lg-qlist');
  const preview = ['script', 'drive_end', 'direction', 'fourth_down', 'kickoff_return', 'three_and_out'];
  for (const id of preview) {
    const t = byId(id);
    if (!t) continue;
    const row = el('div', 'lg-qrow');
    row.appendChild(el('span', 'lg-qtext', t.question));
    row.appendChild(el('span', 'lg-qn num', t.perGame >= 100 ? 'every snap' : `~${t.perGame}×`));
    ul.appendChild(row);
  }
  q.appendChild(ul);
  q.appendChild(el('p', 'lg-what-b', 'The question changes with the situation — a fourth down is a '
    + 'coach’s decision, a kickoff is a returner’s.'));
  return q;
}

function sportCard(wrap) {
  const c = el('div', 'lg-sport');
  c.appendChild(el('div', 'lg-sport-h', 'Which are you watching?'));
  c.appendChild(el('p', 'lg-sport-b', S.mode === 'pool'
    ? 'Which slate your group is picking from.'
    : 'It changes how calls are settled and how they are priced — a sack counts as a pass in the NFL '
      + 'and as a run in college, and the model behind the prices is built on college play-by-play.'));
  const row = el('div', 'lg-sport-row');
  for (const id of ['nfl', 'college-football']) {
    const b = el('button', 'lg-sport-pick');
    /* The league's own mark, self-hosted like the club crests. Jason:
     * "use the nfl logo and the ncaa logo." */
    const img = document.createElement('img');
    img.className = 'lg-sport-logo';
    img.src = `/logos/leagues/${id === 'nfl' ? 'nfl' : 'ncaa'}-500.png`;
    img.alt = ''; img.width = 44; img.height = 44;
    b.appendChild(img);
    b.appendChild(el('span', 'lg-sport-name', SPORT_LABEL[id]));
    b.onclick = () => {
      S.sport = id; store.set('sport', id);
      S.key = GAME_FOR[id];
      S.raw = null; S.board = [];
      /* Pool mode has its own screen. This one owns the live layer only. */
      /* 🔴 THE SPORT'S HOME IS THE WEEK, NOT ONE GAME. Jason, 2026-09-09: "Why
       * after selecting NFL is this the page? Why not the slate of this week.
       * With the entire list, past games as past, upcoming as upcoming."
       *
       * He is right and the old answer was a hangover from when there WAS only
       * one game. Choosing a league is choosing a body of football, and landing
       * on a single fixture answers a question nobody asked - it picks for you,
       * and it hides the fifteen other games from somebody who came to see what
       * is on.
       *
       * The slate is that answer for BOTH halves, which also collapses a fork:
       * the pool went here already, and the marbles side was the only thing
       * that jumped straight to a game. One landing, one shape, and the live
       * game is one tap from the top of it.
       *
       * 🔴 AND THAT IS STILL RIGHT FOR THE POOL AND WRONG FOR THE MARBLES, which
       * is what stranded Jason at kickoff. Found 2026-09-09 with NE @ SEA live:
       * there are TWO "NFL" buttons on step 2 - sportCard's, and this one, which
       * marblesCard draws underneath it. They look identical and they did
       * different things. Whichever one you happened to hit decided whether you
       * reached the third page or were thrown to the week's card, and this one
       * threw you.
       *
       * 🔴 TWO CONTROLS THAT LOOK THE SAME MUST DO THE SAME THING. The rule the
       * duplicate-CSS guard enforces for selectors, arriving in the interaction
       * layer - and it is worse here, because a person cannot tell them apart at
       * all. Both now go to step 3 and let the person choose live or the week,
       * which is the question the front door exists to ask. */
      if (S.isHome) {
        location.hash = S.mode === 'pool' ? '#/slate'
          : S.mode === 'allgames' ? '#/allgames'
          : '#/live';
        return;
      }
      if (S.mode === 'pool') { location.hash = '#/slate'; return; }
      paint(wrap);
      poll(wrap);
      refreshKey(wrap, id);
    };
    row.appendChild(b);
  }
  c.appendChild(row);
  return c;
}

/**
 * The second question. Sport first because it changes how calls SETTLE; mode
 * second because it changes which app you are in.
 */
function modeCard(wrap, compact) {
  /* 🔴 NOT A CARD. The two choices below ARE the cards - they are the discrete
   * things you act on - and wrapping them in a third border made the page a box
   * inside a box. See the rule in tokens.css. */
  const c = el('div', 'lg-sport' + (compact ? ' is-compact' : ''));
  if (compact) {
    /* 🔴 THE MARK COMPLETES, WITH THE PAUSE IN IT. Jason: "Any Given… Snap". The
     * ellipsis is the whole joke — the stem is a setup and the completion is the
     * punchline, and printing "Any Given Snap" flat throws the beat away. */
    const h = el('div', 'lg-sport-h lg-mark');
    h.appendChild(el('span', 'lg-mark-stem', 'Any Given…'));
    h.appendChild(el('span', 'lg-mark-end', ' Snap'));
    c.appendChild(h);
  } else {
    c.appendChild(el('div', 'lg-sport-h', 'What are you here for?'));
  }
  if (!compact) {
    c.appendChild(el('p', 'lg-sport-b',
      'Three ways in. Two of them stake marbles at a price you see before you tap - '
      + 'one snap by snap while you watch, one across the whole week. The third is '
      + 'your group, scored in points, with nothing staked. The scores never add'
      + ' together.'));
  }

  /* 🔴 TWO ON THE FIRST CARD, AND THE SEAM IS WHAT IS AT STAKE. Jason,
   * 2026-09-09: "First card, simulated betting or weekly group pools. You pick
   * the title… Then ncaa or nfl… on the next card."
   *
   * The three-way version put calling, the week's card and the pool side by side
   * and made somebody choose a SPEED and a PRODUCT in one tap. Wrong shape: two
   * of those three are the same product, they share one balance, and the third
   * shares nothing with either. So the first question is the only one that
   * actually branches — marbles or points — and the speed is settled afterwards,
   * inside the half that has two speeds.
   *
   *   marbles · you stake marbles at a price. Live snap-by-snap, or a week's
   *             card. Nothing purchasable, nothing redeemable, one bank that
   *             refills every game
   *   pool    · POINTS, your group, nothing staked and nothing to spend
   *
   * 🔴 THE TITLES ARE MINE TO PICK AND THEY ARE NOT "SIMULATED BETTING".
   * "Simulated betting" is an accurate description and a terrible name: it
   * volunteers the word this product spends the rest of its life not being, and
   * it is the first word a reviewer reads. "Play the marbles" says the same
   * thing using the app's own noun — the one that is deliberately not "credits",
   * for the same reason.
   *
   * 🔴 "GROUP POOLS", PLURAL. Jason, 2026-09-09: "Group pools not pool." It went
   * through "Run a pool" and then "Group pool" before landing here, and the
   * plural is the correct one for the same reason his phrasing kept it: this
   * button is the door to a SECTION, not to one pool object. A person can be in
   * several - the office, the family, the group chat - and the singular quietly
   * promises there is only ever one, which is a claim the product does not make
   * and would have to walk back the first time somebody joins a second. */
  const row = el('div', 'lg-mode-row');
  const opts = [
    /* 🔴 THREE DOORS. Jason: "At the Home Screen, we have 3 choices, live
     * games, then all games, where you can place bets on the entire list,
     * plus first by quarter and half and others and parlays. Then the third
     * is the group pools."
     *
     * This reverses "First page is play for the marbles or group pool, only"
     * from earlier the same day, and the reversal is right because the thing
     * being split was never one product. "Play the marbles" covered both a
     * snap-by-snap live board and a whole week's card of pre-game markets -
     * two different acts, on two different clocks, sharing a door because
     * they shared a currency.
     *
     * They divide by WHEN you are, which is the only division a person
     * actually feels: something is happening right now, something is
     * happening this week, or your group is keeping score. */
    { id: 'live', h: 'Live games', b: 'Call it snap by snap while you watch. A price before every tap.' },
    { id: 'allgames', h: 'All games', b: 'The whole week. Winner, spread, total, halves, quarters and parlays.' },
    { id: 'pool', h: 'Group pools', b: 'People you know, a week at a time, scored in points. Nothing staked.' }
  ];
  for (const o of opts) {
    const b = el('button', 'lg-mode');
    b.appendChild(el('span', 'lg-mode-h', o.h));
    b.appendChild(el('span', 'lg-mode-b', o.b));
    if (compact && o.id === S.mode) b.classList.add('is-on');
    b.onclick = () => {
      S.mode = o.id; store.set('mode', o.id);
      /* On the front door the first card advances to the second. Everywhere
       * else this card is a setting being changed in place. */
      if (S.isHome) S.homeStep = 'sport';
      paint(wrap);
    };
    row.appendChild(b);
  }
  c.appendChild(row);

  /* 🔴 THE SPORT IS THE SECOND CARD, and it is drawn whether or not the first
   * one has been answered — Jason, 2026-09-09: "Then ncaa or nfl… on the next
   * card." Kept inside the same hub because two taps that belong together read
   * as one decision; the rows are what separate them, not two screens. */
  if (compact) {
    const sr = el('div', 'lg-mode-row lg-sportrow');
    for (const id of ['nfl', 'college-football']) {
      const b = el('button', 'lg-mode lg-sportpick' + (id === S.sport ? ' is-on' : ''));
      const img = document.createElement('img');
      img.className = 'lg-sportpick-logo';
      img.src = `/logos/leagues/${id === 'nfl' ? 'nfl' : 'ncaa'}-500.png`;
      img.alt = ''; img.width = 22; img.height = 22;
      b.appendChild(img);
      b.appendChild(el('span', 'lg-mode-h', SPORT_LABEL[id]));
      b.onclick = () => {
        /* 🔴 ON HOME THE SPORT BUTTON IS A DOOR, NOT A TOGGLE, AND THE EARLY
         * RETURN BELOW WAS A DEAD END. Jason, 2026-09-09, live at kickoff: "I
         * did. Home, play marbles, nfl, now I am at that screen." - and that
         * screen had nowhere to go.
         *
         * `if (id === S.sport) return` is right when this card is a SETTING on
         * the live board: re-picking the league you are already on should not
         * tear down the feed. On the front door it meant that tapping NFL when
         * NFL was already stored did nothing at all, so the most common path
         * through the app - the returning user, whose sport is already set -
         * stopped dead on step 2 with no third page and no error. */
        if (S.isHome) {
          S.sport = id; store.set('sport', id);
          /* 🔴 THE DOOR IS ALREADY CHOSEN, SO THERE IS NO THIRD PAGE. With two
           * modes, "marbles" still had to ask live-or-weekly, which is what
           * goCard was for. With three, that question WAS the first card, and
           * asking it again a page later would be the wizard this front door
           * was built to stop being. Pick a half, pick a league, arrive. */
          location.hash = S.mode === 'pool' ? '#/slate'
            : S.mode === 'allgames' ? '#/allgames'
            : '#/live';
          return;
        }
        if (id === S.sport) return;
        S.sport = id; store.set('sport', id);
        /* The constant paints now; the slate lookup corrects it, same as mount. */
        S.key = GAME_FOR[id]; S.raw = null; S.board = []; S.noGame = false;
        paint(wrap); poll(wrap); refreshKey(wrap, id);
      };
      /* On Home the mode buttons navigate rather than gate: "Call the game" is a
       * door, not a setting. */
      sr.appendChild(b);
    }
    c.appendChild(sr);

    /* The doors used to be a third row here. They moved to homeScreen's step 3,
     * because this card is reached from the live board too - where the question
     * "live or weekly?" is being answered by the screen you are already on. */
  }
  return c;
}

/**
 * The landing. Everything a person needs to decide what they are doing, and
 * nothing they have to scroll past to get there.
 */
/* 🔴 HOME IS A SEQUENCE OF PAGES, NOT ONE STACKED HUB. Jason, 2026-09-09:
 * "First page is play for the marbles or group pool, only."
 *
 * The hub put every question on one card - mode, then league, then speed, three
 * rows deep - and called that progressive because the later rows only appeared
 * once the earlier ones were answered. It is not progressive, it is a form. The
 * first thing somebody sees on the first screen of this app should be ONE
 * question with two answers and nothing else competing for the tap.
 *
 * So each step owns the screen:
 *
 *   1 · marbles or group pool     - and nothing else on the page
 *   2 · NFL or College            - and nothing else on the page
 *   3 · the game, how to enter it, and the invite
 *
 * Step 3 does NOT re-draw steps 1 and 2 as rows. It carries a single line
 * saying what you picked, which changes it. That is the difference between a
 * landing and a settings page, and it is why the earlier orphan "NFL · change"
 * chip was wrong in a way this is not: that chip floated beside a hub that was
 * already asking the same question two rows below it. */
function homeScreen(wrap) {
  /* 🔴 HOME IS THE FORK. ALWAYS. Jason settled this on 2026-09-09, after saying
   * "Home button still goes here" seven times and my guessing wrong every time.
   *
   * The model I kept rebuilding was "Home is where you land once you have
   * chosen", so it drew a hub with the game on it. His is "Home is the front
   * door": it asks the question every time, even when the answer is already
   * stored, because the point of a front door is that it is where you START -
   * not a summary of where you have been.
   *
   * That makes these two genuinely different screens rather than one screen with
   * a state in it:
   *
   *   HOME   - one question, two answers. Then the league. Then you leave.
   *   /live  - the game, and everything belonging to it: the Upcoming card, the
   *            week's card, the invite, the ad slot.
   *
   * S.homeStep is TRANSIENT and resets on every arrival, which is what keeps
   * this a door rather than a wizard somebody can be stranded halfway down. The
   * stored mode and sport are NOT cleared - they still mark the current choice
   * and they are what every other screen reads. */
  /* 🔴 STEP 3, WHICH THE COMMENT ABOVE HAS DESCRIBED ALL DAY AND THE CODE NEVER
   * DREW. "3 · the game, how to enter it" is written into the plan at the top of
   * this function and into a note in sportCard saying the doors "moved to
   * homeScreen's step 3". They moved OUT of sportCard and never arrived, so the
   * front door was a two-step wizard ending in a wall - and it ended there on
   * the one night the live layer existed to be used.
   *
   * 🔴 A COMMENT SAYING WHERE SOMETHING WENT IS NOT EVIDENCE THAT IT ARRIVED.
   * Both halves of that move were written down; only one was carried out, and
   * the prose read as though the whole thing had been. */
  if (S.homeStep === 'go') {
    wrap.appendChild(goCard(wrap));
    return;
  }
  if (S.homeStep === 'sport') {
    wrap.appendChild(sportCard(wrap));
    /* The rules of the thing they just chose, under the question that follows
     * it. Marbles only - the group pool has no bank and no price, and showing
     * it here would be explaining a product they did not pick. */
    if (S.mode === 'live' || S.mode === 'allgames') wrap.appendChild(marblesCard());
    return;
  }
  wrap.appendChild(modeCard(wrap));
}

/* THE THIRD PAGE. Two doors, and a line saying what you chose to get here.
 *
 * They are not the same kind of thing and the card should not pretend they are:
 * one is a game happening right now that you call snap by snap, the other is a
 * card of sixteen you fill in once. So the live door leads, and it says what is
 * actually on rather than describing itself - a door labelled with the game
 * behind it is worth more than a door labelled "live". */
function goCard(wrap) {
  const c = el('div', 'card lg-mode-card');
  c.appendChild(el('div', 'lg-mode-k', SPORT_LABEL[S.sport] + ' · marbles'));
  c.appendChild(el('h2', 'lg-mode-h2', 'How do you want to play it?'));

  const row = el('div', 'lg-mode-row');

  /* What is on, read from the board we already hold - never invented. A door
   * that names a game we cannot see is a door that lies. */
  const raw = S.raw;
  const live = raw && raw.status === 'live';
  const teams = raw && raw.teams;
  const name = (raw && teams && raw.awayTeamId && raw.homeTeamId && teams[raw.awayTeamId] && teams[raw.homeTeamId])
    ? (teams[raw.awayTeamId].short + ' @ ' + teams[raw.homeTeamId].short)
    : null;

  const a = el('button', 'lg-mode');
  a.appendChild(el('span', 'lg-mode-h', 'Call it live'));
  a.appendChild(el('span', 'lg-mode-b',
    live && name ? name + ' — on now. One call a snap, at a price you see first.'
      : name ? name + ' — the board opens at kickoff.'
      : 'One call a snap, at a price you see before you tap.'));
  a.onclick = () => { location.hash = '#/live'; };
  row.appendChild(a);

  const b = el('button', 'lg-mode');
  b.appendChild(el('span', 'lg-mode-h', "The week's card"));
  b.appendChild(el('span', 'lg-mode-b',
    'Every game this week, picked once, against the spread.'));
  b.onclick = () => { location.hash = '#/slate'; };
  row.appendChild(b);

  c.appendChild(row);
  return c;
}

function introCard(wrap) {
  /* 🔴 THE NUMBER IS THE PERSON'S SETTING, AND THE SLIDER IS IN THE MENU.
   * Two stale facts in one card, both from changes made today. It said
   * "45 seconds" as a literal - but the delay is user-set, so anybody who
   * had moved it was told a number that was not theirs. And it said "Slide
   * it to zero", pointing at a slider that moved into the ⋮ menu this
   * afternoon when Jason asked for it to leave this screen. Copy that
   * describes a control has to move when the control does. */
  const secs = Math.round(S.delayMs / 1000);
  const c = el('div', 'card lg-intro');
  c.appendChild(el('div', 'lg-intro-h', secs > 0
    ? 'You are ' + secs + ' seconds behind, and that is the point'
    : 'You are watching live, with no gap to call into'));
  c.appendChild(el('p', 'lg-intro-b',
    'The feed only tells us a play happened after it happened. So the app shows you the game '
    + 'as it stood ' + (secs > 0 ? secs + ' seconds ago' : 'a moment ago')
    + ' — which means when it asks what happens next, on your '
    + 'television the snap genuinely has not been taken yet. That gap is the whole game.'));
  c.appendChild(el('p', 'lg-intro-b',
    'Change it any time from the ⋮ menu. Set it to zero and there is no gap left to call '
    + 'into — it becomes a scoreboard.'));
  const go = el('button', 'lg-intro-go', 'Got it');
  go.onclick = () => { store.set('seenIntro', 1); S.seenIntro = true; paint(wrap); };
  c.appendChild(go);
  return c;
}

/**
 * 🔴 A CONTROL YOU SET ONCE DOES NOT DESERVE THE TOP OF THE SCREEN FOREVER.
 * Jason, 2026-09-08: "why do i have the behind on purpose on the top all the
 * time?"
 *
 * Because it was drawn as a full card with a live slider on every render, above
 * the game, permanently — spending the most valuable space in the app on a
 * setting that is correct within ten seconds of arriving and never touched
 * again. The delay is still the mechanic and still has to be VISIBLE, because a
 * person needs to know they are behind. Visible is one line. Adjustable is a tap.
 */
/** "5h 42m" / "18m" / "any second now". Coarse on purpose: a second-by-second
 *  countdown to something four hours away is a fidget, not information. */
/* "Thursday - 5:00 PM". The old countdown card built this inline; the Upcoming
 * card needs it in a single meta line. */
function dayTime(ms) {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { weekday: 'long' }) + ' · '
    + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function untilLabel(ms) {
  if (ms <= 0) return 'any second now';
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  /* "1 days". Rounding to days and then always writing the plural is the same
   * mistake as "1 members" on the standings header - a sentence assembled
   * without asking how many it is describing. */
  const d = Math.round(h / 24);
  return d === 1 ? '1 day' : `${d} days`;
}

/**
 * 🔴 THE SCREEN NOBODY DESIGNED, AND IT IS ON FOR NINETEEN HOURS.
 *
 * Jason, 2026-09-08: "This page looks pretty lame... Uninspiring." He was
 * looking at the state the app spends the ENTIRE TIME BEFORE A GAME in — the
 * one he and the friend he invites will open first — and it was a heading
 * saying kickoff had not happened, a paragraph apologising for that, and a wall
 * of black.
 *
 * The pre-game screen has plenty that is true to say. When it starts. Where, and
 * on what channel. What you will be given. What you are going to be asked. Who
 * else is already here. None of it needed a feed we did not have; it needed
 * somebody to write the screen instead of an empty state.
 */
/* The other games in this league, after this one, soonest first. */
/* 🔴 THE SLATE IS FETCHED ONCE AND HELD, AND THE CARD IS DRAWN SYNCHRONOUSLY.
 * Jason, 2026-09-09: "The also on blinks."
 *
 * It did, and for the same reason the logos did: paint() rebuilds this screen
 * every five seconds, and this card was APPENDED AFTER AN AWAIT. So every cycle
 * the list vanished with the rest of the DOM and reappeared a network round trip
 * later - a card that flickers in and out at the foot of the screen for as long
 * as you look at it.
 *
 * The blink was never about the network being slow. It was about drawing from
 * inside an async function on a screen that redraws on a timer: even a 20ms
 * response leaves a gap, because the append lands in the NEXT frame.
 *
 * So the fetch and the render are separated. `S.also` holds the list; the card
 * is built from it in the same tick as everything around it; and the fetch runs
 * only when there is nothing cached or the cache is ten minutes old. A slate
 * does not change between two heartbeats. */
const ALSO_TTL = 10 * 60 * 1000;

/* 🔴 ONE CACHE, ONE LEAGUE CHECK, TWO CALLERS. Jason, 2026-09-10, on SF at
 * LAR: "The future game at the top are gone." The game strip read S.also
 * directly with no league check and no way to fill it - only this card and
 * nextGameKey ever fetched it, and on the live board neither runs. So after
 * watching a college game the strip either had nothing, or worse, had the
 * COLLEGE list and would have built `nfl:<college id>` keys from it.
 *
 * Returns the cached slate only when it is for the league of the game on
 * screen; kicks off a background fetch when it is missing, stale or for the
 * other league, and repaints when it lands. */
function alsoFor(wrap, now) {
  const sport = (S.key || '').split(':')[0] === 'nfl' ? 'nfl' : 'college-football';
  const cached = S.also;
  if (!cached || cached.sport !== sport || (now - cached.at) > ALSO_TTL) {
    if (!S.alsoBusy) {
      S.alsoBusy = true;
      fetch('/api/state/slate:' + sport + ':2026:' + (SLATE_WEEK[sport] || 1))
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d) return;
          S.also = { sport, at: Date.now(), games: d.games || [] };
          S.lastSig = null;
          paint(wrap);
        })
        .catch(() => {})
        .then(() => { S.alsoBusy = false; });
    }
  }
  return cached && cached.sport === sport ? cached : null;
}

function alsoOn(wrap, state, now) {
  const key = S.key;
  const sport = (key || '').split(':')[0] === 'nfl' ? 'nfl' : 'college-football';
  const cached = S.also;

  /* Refresh in the background when it is missing or stale. It never draws - the
   * next paint picks it up, which is what keeps this out of the render path. */
  if (!cached || cached.sport !== sport || (now - cached.at) > ALSO_TTL) {
    if (!S.alsoBusy) {
      S.alsoBusy = true;
      fetch('/api/state/slate:' + sport + ':2026:' + (SLATE_WEEK[sport] || 1))
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d) return;
          S.also = { sport, at: Date.now(), games: d.games || [] };
          /* 🔴 AND WAKE THE SCREEN. The pre-game repaint guard means nothing
           * redraws while the countdown sits on the same minute - so a card that
           * arrives after the first paint would never be drawn at all, which is
           * exactly what happened the first time these two fixes met. A cache
           * that fills silently on a screen that has stopped repainting is a
           * feature that works everywhere except in production. */
          S.lastSig = null;
          paint(wrap);
        })
        .catch(() => {})
        .then(() => { S.alsoBusy = false; });
    }
  }
  if (!cached || cached.sport !== sport) return;

  /* 🔴 THE SAME DAY FIRST. Jason, 2026-09-09: "Do all the games for the DAY show
   * up here when there is more than 1?"
   *
   * They did not - it was the next three kickoffs, whichever day they landed on,
   * which is the wrong grouping for the question somebody is actually asking. On
   * a Wednesday with one opener the answer is "nothing else tonight" and the
   * card should say so rather than advertising Saturday. On a Saturday with
   * twenty games the whole point is what else is on TODAY.
   *
   * So the list is the rest of THIS day, all of it, and it falls back to the
   * next day only when today has nothing left. A game at 9am and a game at 8pm
   * are the same day to a person planning an afternoon. */
  const dayKey = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const thisDay = dayKey(state.kickoffUtc || now);

  const upcoming = (cached.games || [])
    .filter((g) => g && g.status !== 'final' && g.kickoffUtc > (state.kickoffUtc || now)
                   && String(g.id) !== String((key || '').split(':')[1]))
    .sort((a, b) => a.kickoffUtc - b.kickoffUtc);
  if (!upcoming.length) return;

  const sameDay = upcoming.filter((g) => dayKey(g.kickoffUtc) === thisDay);
  const games = sameDay.length ? sameDay : upcoming;
  /* 🔴 A CAP EVEN ON THE SAME DAY. Twenty rows here is a second slate on a
   * screen that is about ONE game, and the slate already exists and is better at
   * being a slate. Six is enough to read at a glance; the rest is a link. */
  const CAP = 6;
  const sameDayCount = sameDay.length;

  const box = el('div', 'card lg-also');
  const h = el('div', 'lg-also-h');
  /* The heading names the day when the list IS the day, so "Also on Saturday"
   * beside six rows cannot be mistaken for the whole week. */
  h.appendChild(el('span', 'lg-also-k', sameDayCount
    ? 'Also on ' + new Date(state.kickoffUtc || now).toLocaleDateString(undefined, { weekday: 'long' })
    : 'Next up'));
  h.appendChild(el('span', 'lg-also-n num',
    games.length === 1 ? '1 more game' : games.length + ' more games'));
  box.appendChild(h);

  for (const g of games.slice(0, CAP)) {
    const teams = {};
    for (const t of (g.teams || [])) if (t && t.id) teams[t.id] = t;
    const a = teams[g.awayTeamId], hm = teams[g.homeTeamId];
    const row = el('a', 'lg-also-r');
    /* 🔴 A REAL QUERY STRING, NOT ONE INSIDE THE HASH. mount() reads
     * location.search, so '#/live?game=...' puts the parameter somewhere nothing
     * looks - the link would navigate and then show whatever game was already
     * loaded, silently. Same shape the invite button builds, colon and all. */
    row.href = '/?game=' + encodeURIComponent(sport + ':' + g.id).replace(/%3A/g, ':');
    row.appendChild(el('span', 'lg-also-t',
      ((a && (a.short || a.abbrev)) || '?') + ' at ' + ((hm && (hm.short || hm.abbrev)) || '?')));
    row.appendChild(el('span', 'lg-also-w num', untilLabel(g.kickoffUtc - now)));
    box.appendChild(row);
  }

  if (games.length > CAP) {
    const more = el('a', 'lg-also-more', 'See the whole week →');
    more.href = '#/slate';
    box.appendChild(more);
  }
  wrap.appendChild(box);
}

function pregame(state, now, wrap) {
  const box = el('div', 'lg-pre');

  if (state.kickoffUtc) {
    /* 🔴 THE UPCOMING CARD, NOT A COUNTDOWN CARD. Jason, 2026-09-09: "I always
     * liked the other game card not the one we are using. The days seems like
     * the most important thing here, which it is not."
     *
     * Exactly right, and the old card made the argument for him: KICKOFF over
     * "1 day" at the largest size on the screen, with the teams reduced to two
     * small crests and a 0-0 above it. The biggest type on a screen is a claim
     * about what matters most, and "1 day" is the least useful fact here - it is
     * true of twenty other games, it changes nothing you can act on, and it was
     * shouting while the actual fixture whispered.
     *
     * So the card is the one he liked: crests, a quiet "at", the MATCHUP as the
     * headline, and the when/where/channel as one line under it. The countdown
     * stays - it is the reason to come back - as part of that line rather than
     * as the headline. */
    const c = el('div', 'card lg-hgame lg-pre');
    c.appendChild(el('div', 'lg-hgame-k', 'Upcoming'));

    const gh = el('div', 'lg-head');
    const aw = state.teams[state.awayTeamId], hm = state.teams[state.homeTeamId];
    const lg = leagueOf(state);
    if (aw) gh.appendChild(teamChip({ id: state.awayTeamId, ...aw }, { size: 44, league: lg }));
    gh.appendChild(el('span', 'lg-at', 'at'));
    if (hm) gh.appendChild(teamChip({ id: state.homeTeamId, ...hm }, { size: 44, league: lg }));
    c.appendChild(gh);

    if (aw && hm) {
      c.appendChild(el('div', 'lg-hgame-t',
        (aw.short || aw.name) + ' at ' + (hm.short || hm.name)));
    }

    const toKick = state.kickoffUtc - now;
    const counting = toKick < 24 * 60 * 60 * 1000;
    if (counting) {
      const cd = el('div', 'lg-countdown');
      cd.appendChild(el('span', 'lg-countdown-l', toKick <= 0 ? 'Kickoff' : 'Kickoff in'));
      const v = el('span', 'lg-countdown-v num', countdownText(toKick));
      v.dataset.kick = String(state.kickoffUtc);
      cd.appendChild(v);
      c.appendChild(cd);
      armCountdown();
    }
    const bits = counting ? [] : ['Kicks in ' + untilLabel(toKick)];
    if (state.kickoffUtc) bits.push(dayTime(state.kickoffUtc));
    if (state.venue) bits.push(state.venue);
    if (state.broadcast) bits.push('on ' + state.broadcast);
    c.appendChild(el('div', 'lg-hgame-b', bits.join(' · ')));
    box.appendChild(c);
  }

  /* 🔴 WHAT YOU WILL BE ASKED, BEFORE YOU ARE ASKED IT. The catalog is the
   * product and it was completely invisible until the first snap. Showing the
   * questions in advance is the difference between waiting for an app to load
   * and waiting for a game to start. Frequencies are the measured ones. */
  /* 🔴 THE MARBLES EXPLAINER MOVED TO THE SPORT CARD. Jason, 2026-09-09: "Add
   * the marbles info on this page... and remove it from this page" - the sport
   * card, and off the pre-game.
   *
   * Right, and the reason is that it is an ONBOARDING explanation wearing a
   * game screen's clothes. "You start with 200 Marbles" and a list of the six
   * questions is what somebody needs the first time they choose to play the
   * marbles - which happens on the front door, one tap earlier. On the pre-game
   * it was the tallest thing on the screen, every single game, forever,
   * explaining the rules to somebody who had already read them. */

  box.appendChild(inviteButton(state));

  /* Who is already here, if anybody. Silence when nobody is, rather than an
   * empty box announcing that nobody came. */
  if (S.board.length) {
    const names = [...new Set(S.board.map((c) => c.name).filter(Boolean))];
    if (names.length) {
      const w = el('div', 'card lg-waiting');
      w.appendChild(el('div', 'lg-what-h', names.length === 1 ? '1 person is here' : `${names.length} people are here`));
      w.appendChild(el('p', 'lg-what-b', names.join(' · ')));
      box.appendChild(w);
    }
  }
  return box;
}

/* 🔴 A NUGGET WHEN NOTHING IS HAPPENING. Jason, 2026-09-10: "What happened to
 * the AI interesting facts?" then "A time out is a great time for a nugget."
 *
 * The old laptop app's facts were bullets from a school's game-notes PDF,
 * loaded by hand per game - nothing a feed carries. These are the same idea
 * built from what this screen already holds, so every one is TRUE by
 * construction: tonight's held plays (leaders, the longest play, the big
 * plays) and the week's slate (records, ranks, form, the line and the total
 * against the score). Nothing is invented and nothing is generated - a nugget
 * this app cannot back with a number it has is a nugget it does not show.
 *
 * HELD PLAYS ONLY, like everything here: a leader line built from the raw
 * feed would count a carry your television has not shown you yet.
 *
 * 🔴 PLAYER NAMES ARE FILTERED, because the NFL parser still reads formation
 * words as the star - "No Huddle" as a rusher, "No Good" as a kicker. Only a
 * name shaped like one ("B.Corum", "N.Thomas") is ever put in a sentence. */
/* A person: "B.Corum" (live grammar) or "Bryce Young" (the 2024-25 grammar,
   see BUILD-BRIEF 7.1) - and never a formation or a result word. */
const REAL_NAME = /^(?!(?:No Huddle|No Good|Shotgun|Pistol|Under Center|Good|Timeout|Penalty|End)\b)[A-Z][A-Za-z'-]*(?:\.\s?|\s)[A-Z][A-Za-z'-]+/;
function nuggets(state) {
  const out = [];
  const plays = (state && state.plays) || [];
  const T = (state && state.teams) || {};
  const nick = (id) => { const t = T[id]; return t ? (t.nick || t.short || t.abbrev) : null; };
  const ab = (id) => (T[id] && T[id].abbrev) || '';
  const clean = (n) => String(n || '').replace(/^#\d+\s*/, '').trim();

  const rush = {}, rec = {};
  const snaps = plays.filter((p) => (p.kind === 'run' || p.kind === 'pass') && !/no play/i.test(p.text || ''));
  for (const p of snaps) {
    const s = p.star; const n = s && clean(s.name);
    if (!n || !REAL_NAME.test(n)) continue;
    const y = Number(p.statYardage) || 0;
    const k = n + '|' + s.teamId;
    if (s.role === 'rusher' && p.kind === 'run') {
      const r = rush[k] || (rush[k] = { n, t: s.teamId, y: 0, c: 0 }); r.y += y; r.c++;
    }
    if (s.role === 'receiver' && /pass complete|complete/i.test(p.text || '') && !/incomplete/i.test(p.text || '')) {
      const r = rec[k] || (rec[k] = { n, t: s.teamId, y: 0, c: 0 }); r.y += y; r.c++;
    }
  }
  const top = (o) => Object.values(o).sort((a, b) => b.y - a.y)[0];
  const tr = top(rush), tc = top(rec);
  if (tr && tr.c >= 3) out.push(`${tr.n} (${ab(tr.t)}) has ${tr.c} carries for ${tr.y} yards tonight.`);
  if (tc && tc.c >= 2) out.push(`${tc.n} (${ab(tc.t)}) has ${tc.c} catches for ${tc.y} yards.`);

  const longest = snaps.slice().sort((a, b) => (b.statYardage || 0) - (a.statYardage || 0))[0];
  if (longest && (longest.statYardage || 0) >= 15) {
    const who = longest.star && REAL_NAME.test(clean(longest.star.name)) ? ' - ' + clean(longest.star.name) : '';
    out.push(`Longest play so far: ${longest.statYardage} yards${who} (${ab(longest.startTeamId)}), Q${longest.quarter}.`);
  }
  const big = {};
  for (const p of snaps) if ((p.statYardage || 0) >= 20) big[p.startTeamId] = (big[p.startTeamId] || 0) + 1;
  for (const [id, c] of Object.entries(big)) {
    if (c >= 2 && nick(id)) out.push(`The ${nick(id)} have ${c} plays of 20+ yards.`);
  }

  /* The slate: what the week's capture knows about these two before kickoff. */
  const [sp, gid] = String(S.key || '').split(':');
  const g = S.also && S.also.sport === sp ? (S.also.games || []).find((x) => String(x.id) === gid) : null;
  if (g) {
    const byId = {};
    for (const t of (g.teams || [])) byId[String(t.id)] = t;
    const home = byId[String(g.homeTeamId)], away = byId[String(g.awayTeamId)];
    const hn = nick(g.homeTeamId) || (home && home.short), an = nick(g.awayTeamId) || (away && away.short);
    if (home && away && home.record && away.record) out.push(`They came in ${an} ${away.record}, ${hn} ${home.record}.`);
    for (const [t, n] of [[away, an], [home, hn]]) {
      if (t && t.rank) out.push(`${n} are ranked #${t.rank}${t.conference ? ' in the ' + t.conference + ' - and the country' : ''}.`.replace(' in the ' + (t.conference || '') + ' - and the country', ''));
      if (t && t.form && /^[WLT]{3,}$/.test(t.form)) out.push(`${n}' last ${t.form.length}: ${t.form.split('').join(' ')}.`);
    }
    const hs = Number(state.homeScore) || 0, as = Number(state.awayScore) || 0;
    if (typeof g.spread === 'number' && g.spread !== 0 && hn && an) {
      const fav = g.spread < 0 ? hn : an;
      const favBy = g.spread < 0 ? hs - as : as - hs;
      const line = Math.abs(g.spread);
      out.push(`The ${fav} were ${line}-point favorites. Right now they ${favBy >= 0 ? 'lead by ' + favBy : 'trail by ' + (-favBy)}.`);
    }
    if (typeof g.total === 'number') out.push(`The total was set at ${g.total}. There are ${hs + as} points on the board.`);
  }
  return out;
}

/* Only during a stoppage - a timeout, a commercial, the two-minute warning,
   the end of a quarter, halftime. When a snap is coming, the question is the
   only thing that should be asking for attention. One at a time, rotating on
   a twelve-second clock the five-second repaint picks up. */
function nuggetCard(state, now) {
  if (!state || state.status !== 'live') return null;
  const lp = state.plays && state.plays[state.plays.length - 1];
  const st = stoppageOf(lp);
  if (!st || st.label === 'Final') return null;
  const list = nuggets(state);
  if (!list.length) return null;
  const i = Math.floor(now / 12000) % list.length;
  const card = el('div', 'card lg-nugget');
  card.appendChild(el('div', 'lg-nugget-h', st.label + ' · worth knowing'));
  card.appendChild(el('p', 'lg-nugget-b', list[i]));
  if (list.length > 1) card.appendChild(el('div', 'lg-nugget-n num', (i + 1) + ' of ' + list.length));
  return card;
}

/**
 * 🔴 THE CALL IS THE GAME; THE COMMENTARY IS WHY IT WAS A GAME.
 *
 * A board of numbers tells you that you lost ten Marbles. It does not tell you
 * that a 38-yard completion on 3rd and 9 is why. detect.ts has ranked every play
 * by severity since it was written and nothing had ever drawn the result.
 *
 * ONLY SEVERITY 2 AND 3. Every snap is an event to a detector; three or four a
 * quarter are a MOMENT. A commentary feed that speaks on every play is a
 * transcript, and nobody reads a transcript during a game.
 *
 * And it obeys the delay like everything else — it is fed the HELD plays, so the
 * app never tells you about a play your television has not shown you.
 */
function commentary(state) {
  let dets = [];
  try {
    dets = detect(state.plays.map((p) => ({
      id: p.id, driveId: p.driveId, offenseTeamId: p.offenseTeamId,
      quarter: p.quarter, clock: p.clock, text: p.text, typeText: p.typeText,
      scoringPlay: p.scoringPlay, homeScore: p.homeScore, awayScore: p.awayScore,
      statYardage: p.statYardage, down: p.startDown, distance: p.distance,
      /* 🔴 PASSED THROUGH, NEVER RE-DERIVED. This was omitted and the star line
       * rendered empty on every play — 7.2's whole point is that the parser says
       * who the play was about and a view repeats it. */
      star: p.star, yards: p.statYardage ?? 0
    })), {
      homeTeamId: state.homeTeamId, awayTeamId: state.awayTeamId,
      /* 🔴 `abbrev` EXISTS FOR EXACTLY THIS and was never passed. detect.ts
       * documents it as "team id → the abbreviation a headline uses", falls back
       * to the raw id when it is missing, and that is how "Touchdown — 17"
       * reached the screen.
       *
       * The first fix was a string substitution over the finished headline, and
       * it was WORSE than the bug: New England's id is 17, so "4th & 17" became
       * "4th & Patriots". Replacing ids inside prose replaces distances, yardage
       * and scores that happen to share the digits. The detector already knew how
       * to do this properly; it just had nothing to do it with. */
      abbrev: Object.fromEntries(Object.entries(state.teams || {})
        .map(([id, t]) => [id, t.abbrev || t.short || id]))
    });
  } catch { return null; }

  /* 🔴 PLAY BY PLAY, NOT HIGHLIGHTS. Jason: "big moments should just be play
   * by play."
   *
   * The card began as "What just happened", was corrected to "Big moments" when
   * it turned out to be a highlight reel, and then had its filter fixed twice -
   * once because every 4th-down punt qualified, once because a kick return was
   * counting as a big play. 🔴 THREE ROUNDS OF TUNING A FILTER IS THE FILTER
   * TELLING YOU IT SHOULD NOT EXIST. Every fix made it a slightly better guess
   * at what matters, and the honest answer is that the person watching decides
   * that, not a severity score.
   *
   * A plain list is also the thing the screen was missing. The card above shows
   * ONE play - the last one - and everything before it was only reachable if an
   * algorithm had ranked it interesting. Now the game is on the page.
   *
   * The detector still runs, because the star (7.2) and the headline come from
   * it and must never be re-derived in a view. What is dropped is its opinion
   * about which rows are worth showing.
   *
   * 🔴 HELD PLAYS ONLY. state.plays is already the delayed view - a full
   * play-by-play built from the raw feed would hand over the play the app is
   * still asking about, which is the leak the whole delay exists to prevent. */
  const byId = new Map(dets.map((d) => [d.id, d]));
  const rows = state.plays.slice(-25).reverse();
  if (!rows.length) return null;

  const card = el('div', 'card lg-say');
  card.appendChild(el('div', 'lg-say-h', 'Play by play'));
  /* 🔴 THE LIST SCROLLS INSIDE ITSELF. Jason: "can we limit the amount you see
   * without scrolling?"
   *
   * Twenty-five plays is roughly two thousand pixels, so the page had a short
   * live screen followed by a very long transcript - and everything below it,
   * the name field and the invite, was effectively unreachable. A record does
   * not deserve unlimited page just because it is unlimited data.
   *
   * The HEADER stays put and only the rows move, which is the difference
   * between a scrollable list and a card that slides its own title away. And
   * overscroll-behavior stops the page taking over when the list hits its end
   * - the thing that makes a nested scroller feel broken on a phone. */
  const rowsWrap = el('div', 'lg-say-rows');

  for (const p of rows) {
    const d = byId.get(p.id);
    const r = d && (d.reasons || []).filter((x) => x.severity >= 2)
      .sort((a, b) => b.severity - a.severity)[0];
    const row = el('div', 'lg-sayrow');
    if (r) row.dataset.big = 'true';

    const head = el('div', 'lg-say-line');
    head.appendChild(el('span', 'lg-say-when num', `Q${p.quarter} ${p.clock}`));
    /* The situation the play was run in, in the feed's own words where it has
       them - the same rule as the down-and-distance pill. */
    const t = state.teams[p.offenseTeamId];
    /* 🔴 "undefined & goal — SEA" WAS ON JASON'S SCREEN. `p.startDown ?` is a
       truthiness test, so any value ESPN reports that is not a real down -
       and it reports -1 after a score, 0 on an administrative row - sailed
       through and indexed an array that has four entries. A down is 1, 2, 3
       or 4; everything else has no down, and a row with no down says the team
       and nothing more.
       
       Third time tonight the same check has failed in a different place: the
       scorebug printed "-1 & 10", the field printed "0 yards to the end
       zone", and now this. Truthiness is not validity, and the values that
       expose the difference are the ones that only appear at the edges of a
       game - a score, a timeout, the end of a quarter. */
    const dn = p.startDown;
    const dd = (dn >= 1 && dn <= 4)
      ? `${['1st', '2nd', '3rd', '4th'][dn - 1]} & ${p.distance === 0 ? 'goal' : p.distance}`
      : null;
    if (r && MOMENT_EMOJI[r.event]) {
      const e = el('span', 'lg-say-emoji', MOMENT_EMOJI[r.event]);
      /* Decoration to a screen reader - the headline beside it already says
         what happened, and "football emoji touchdown" is worse than silence. */
      e.setAttribute('aria-hidden', 'true');
      head.appendChild(e);
    }
    head.appendChild(el('b', 'lg-say-head',
      r ? r.headline : [dd, t && t.abbrev].filter(Boolean).join(' — ') || 'Play'));
    row.appendChild(head);

    row.appendChild(el('div', 'lg-say-detail', playText(p.text)));
    if (p.star && p.star.name) {
      const who = (p.star.jersey ? '#' + p.star.jersey + ' ' : '') + p.star.name;
      const side = p.star.teamId && state.teams[p.star.teamId];
      row.appendChild(el('div', 'lg-say-star',
        `${who} · ${p.star.role}${side ? ' · ' + side.abbrev : ''}`));
    }
    rowsWrap.appendChild(row);
  }
  card.appendChild(rowsWrap);
  return card;
}

/**
 * 🔴 INVITE A FRIEND. Jason, 2026-09-08: "We also need to put an invite a friend
 * button somewhere." It is the whole product — a board with one person on it is
 * a solitaire game with extra steps — and until now the only way to get somebody
 * else in was for Jason to paste a URL himself.
 *
 * THE LINK CARRIES THE GAME, so a friend lands on the thing you are watching
 * rather than on whatever sport their own device last chose. That is the same
 * `?game=` parameter the fixtures replay uses, and it is why it exists.
 *
 * navigator.share is the native sheet on a phone — the one that offers Messages,
 * which is how this actually gets sent. Clipboard is the desktop fallback, and
 * neither is assumed: a browser with neither still gets a link it can select.
 */
function inviteButton(state) {
  /* 🔴 THE COLON IS NOT ENCODED, and this is not fussiness. The key is
   * `nfl:401872656`, and encodeURIComponent turns it into `nfl%3A401872656` —
   * so a link somebody posts in public reads as
   * `anygiven.app/?game=nfl%3A401872656`. That is a URL that looks broken, or
   * tracked, and it is the first thing a stranger sees of this app.
   *
   * A colon is legal in a query value under RFC 3986; only the delimiters have
   * to be escaped. Everything else stays encoded, so a key that ever contains a
   * genuine delimiter is still safe. */
  const url = `${location.origin}/?game=${encodeURIComponent(S.key).replace(/%3A/g, ':')}`;
  const wrapEl = el('div', 'lg-invite-wrap');
  const b = el('button', 'lg-invite');
  b.appendChild(el('span', 'lg-invite-h', 'Invite a friend'));
  b.appendChild(el('span', 'lg-invite-b', 'They land on this game. No account, no install.'));
  b.onclick = async () => {
    const text = 'Call the game with me — no account, nothing to install.';
    try {
      if (navigator.share) { await navigator.share({ title: 'Any Given', text, url }); return; }
    } catch { return; /* they cancelled the sheet; that is not a failure */ }
    try {
      await navigator.clipboard.writeText(url);
      b.querySelector('.lg-invite-b').textContent = 'Link copied — paste it to them';
      return;
    } catch { /* no clipboard permission */ }
    /* 🔴 A LINK THEY CAN STILL GET. If both routes are unavailable the button
     * must not simply do nothing — it shows the URL to select by hand. */
    b.querySelector('.lg-invite-b').textContent = url;
  };
  wrapEl.appendChild(b);
  wrapEl.appendChild(textIt(state, url));
  wrapEl.appendChild(postToX(state, url));
  return wrapEl;
}

/* 🔴 NO REDDIT BUTTON, AND NO SECOND PLATFORM AT ALL. Jason asked twice —
 * "Really, Redit?" then "Again, Redit?" — and the second ask is the answer.
 *
 * The argument for it was that a game thread is a PLACE rather than a person.
 * True, and it does not survive the objection: navigator.share already offers
 * Reddit on a phone alongside every other installed app, so the button bought a
 * second route to somewhere the OS sheet already goes. X keeps its button
 * because the pre-filled text plus hashtags is the thing the native sheet
 * cannot do.
 *
 * A row of branded buttons re-implements the operating system, worse.
 */

/**
 * 🔴 X's WEB INTENT — no API key, no SDK, no script from their origin.
 * Jason, 2026-09-08: "What about opening X and prepopulating a tweet?" Yes, and
 * it is one URL: /intent/tweet with text and url. It opens THEIR compose window
 * with the words already in it, and a person still has to press post. Nothing is
 * ever published by this app.
 *
 * 🔴 THE TEXT IS THE PRODUCT, AND IT CHANGES WITH THE MOMENT. "Come play my app"
 * is an advertisement nobody sends. What people actually post is a RESULT — so
 * once there is a settled call to brag about, the tweet is the brag and the app
 * is the footnote. Before that it is the matchup.
 *
 * And it never says "bet". The balance is Marbles, they cannot be bought, and a
 * post that says betting is the first objection arriving in our own words.
 */
function postToX(state, url) {
  const a = el('a', 'lg-x');
  a.href = 'https://twitter.com/intent/tweet?' + new URLSearchParams({ text: xText(state), url });
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.appendChild(el('span', 'lg-x-mark', '𝕏'));
  a.appendChild(el('span', 'lg-x-l', 'Post it'));
  return a;
}

/**
 * 🔴 A TEXT, THE SAME WAY AS X. Jason, 2026-09-10: "Can we do texts like we do
 * 'x'?" The X button is worth having because it opens a compose window with
 * the words already in it; the invite button's native sheet offers Messages
 * but hands over a bare line of copy. This is the X treatment for Messages:
 * an `sms:` link that opens a new text with the brag and the game link filled
 * in, and the person picks who and presses send. Nothing is sent by the app.
 *
 * `sms:?&body=` is the one form both platforms read - iOS wants `&body`,
 * Android wants `?body`, and each ignores the other's half. No recipient: who
 * gets it is theirs to choose.
 */
function textIt(state, url) {
  const a = el('a', 'lg-x lg-sms');
  a.href = 'sms:?&body=' + encodeURIComponent(xText(state, false) + '\n' + url);
  a.setAttribute('aria-label', 'Text it to a friend');
  const mark = el('span', 'lg-x-mark');
  mark.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">'
    + '<path fill="currentColor" d="M12 3C6.5 3 2 6.6 2 11c0 2.4 1.3 4.5 3.4 6'
    + 'L4.5 21l4.3-2.2c1 .3 2.1.4 3.2.4 5.5 0 10-3.6 10-8S17.5 3 12 3z"/></svg>';
  a.appendChild(mark);
  a.appendChild(el('span', 'lg-x-l', 'Text it'));
  return a;
}

/**
 * 🔴 HASHTAGS FROM THE TEAMS ACTUALLY PLAYING. Jason: "Can we regenerate X
 * hashtags for the teams playing?" They come off the same abbreviations already
 * in the state — no table to maintain, and nothing to go stale when a team is
 * added or a game changes.
 *
 * #NEvsSEA is the shape the sport itself uses, and it is what somebody following
 * the game is already watching. Adding it is the difference between posting into
 * your own followers and posting into the conversation about the game.
 *
 * TWO, NEVER FIVE. A post carrying a stack of tags reads as marketing and gets
 * treated as marketing. The matchup tag puts it in the game's stream; the app
 * tag is how anybody finds the others playing.
 */
function hashtags(state) {
  const away = state && state.teams ? state.teams[state.awayTeamId] : null;
  const home = state && state.teams ? state.teams[state.homeTeamId] : null;
  const clean = (v) => (v || '').replace(/[^A-Za-z0-9]/g, '');
  const a = clean(away && away.abbrev), h = clean(home && home.abbrev);
  return a && h ? `#${a}vs${h} #AnyGivenSnap` : '#AnyGivenSnap';
}

function xText(state, withTags = true) {
  const away = state && state.teams ? state.teams[state.awayTeamId] : null;
  const home = state && state.teams ? state.teams[state.homeTeamId] : null;
  const game = away && home ? `${away.short} at ${home.short}` : 'this game';
  /* A text goes to one friend, not into a feed - hashtags there read as a
     forwarded advert. Same brag, same moment, no tags. */
  if (!withTags) return xText(state, true).replace(/\s*\n\n#[^\n]*$/, '');

  /* The best settled call so far, if there is one — the thing worth posting. */
  let best = null;
  for (const c of Object.values(S.calls)) {
    const r = settleOne({ ...c }, state || { plays: [], drives: [] });
    if (r && r.landed === true && (!best || r.delta > best.delta)) best = { ...c, delta: r.delta };
  }
  const tags = hashtags(state);
  if (best) {
    return `Called "${best.label}" at ${payoutOf(best)}× on ${game} and it hit. `
      + `+${best.delta} Marbles.

${tags}`;
  }
  const n = S.bank - START_BANK;
  if (n > 0) return `Up ${n} Marbles calling plays on ${game}.

${tags}`;
  return `Calling the plays on ${game} before they happen.

${tags}`;
}

/**
 * 🔴 IT ONLY APPEARS WHEN THERE IS SOMETHING TO SAY. A share button with nothing
 * behind it is an ask; a share button attached to a call that just landed at 6×
 * is a person wanting to tell somebody. The difference is whether the app is
 * begging to be spread or being spread.
 *
 * The BEST settled call, not the last — nobody posts the one they lost.
 */
/**
 * 🔴 REACTION CARDS, OFFERED ONLY WHEN THE MOMENT IS ACTUALLY ON THE SCREEN.
 * Jason: "Can we not make generic touchdown images? For people to hit during the
 * game... It would be awesome advertising, no?"
 *
 * Yes — and the reason it works is the reason advertising usually does not:
 * nobody posts an advert, everybody posts a touchdown. So the card is the
 * MOMENT, big, with the real score and crests, and the wordmark sits in the
 * corner where a broadcaster puts a bug.
 *
 * A permanent row of share buttons would be a toolbar nobody touches. These
 * appear because a touchdown just happened, on the play the detector flagged,
 * and they go when the next drive starts — which is exactly the window in which
 * somebody wants to say something.
 *
 * 🔴 AND THEY ARE DRAWN FROM THE HELD STATE. The score on a shared picture is
 * the score this app was showing, delay included. A card built from the live
 * feed would leak a play the sender has not seen — the one place this app could
 * spoil its own mechanic.
 */
function reactions(state, wrap) {
  const last = state.plays[state.plays.length - 1];
  if (!last) return null;
  const recent = state.plays.slice(-3);

  const found = [];
  const add = (k, line) => { if (!found.some((f) => f.k === k)) found.push({ k, line }); };
  for (const p of recent) {
    const t = (p.text || '').toLowerCase();
    if (/touchdown/.test(t)) add('touchdown', p.text);
    else if (/intercepted|fumble.*recovered by/.test(t)) add('turnover', p.text);
    else if (/field goal.*(is good|good)/.test(t) && !/no good/.test(t)) add('field_goal', p.text);
    else if (p.startDown === 4 && /rush|pass/.test((p.typeText || '').toLowerCase())) add('fourth_down', p.text);
    else if ((p.statYardage || 0) >= 40) add('big_play', p.text);
  }
  if (!found.length) return null;

  const card = el('div', 'card lg-react');
  card.appendChild(el('div', 'lg-react-h', 'Send it'));
  const row = el('div', 'lg-react-row');
  for (const f of found.slice(0, 3)) {
    const m = MOMENTS[f.k];
    const b = el('button', 'lg-react-b');
    b.style.setProperty('--m', m.tint);
    b.appendChild(el('span', 'lg-react-w', m.word));
    row.appendChild(b);
    b.onclick = async () => {
      const before = b.querySelector('.lg-react-w').textContent;
      b.querySelector('.lg-react-w').textContent = '…';
      const r = await shareReaction(state, f.k, f.line, xText(state));
      b.querySelector('.lg-react-w').textContent =
        r === 'shared' ? 'SENT' : r === 'downloaded' ? 'SAVED' : before;
    };
  }
  card.appendChild(row);
  return card;
}

function bragButton(state, rows) {
  const landed = (rows || []).filter((r) => r.landed === true && r.delta > 0);
  if (!landed.length) return null;
  const best = landed.reduce((a, b) => (a.delta >= b.delta ? a : b));

  const b = el('button', 'lg-brag');
  b.appendChild(el('span', 'lg-brag-h', `Share it — ${best.label} at ${payoutOf(best)}×`));
  b.appendChild(el('span', 'lg-brag-b', 'Makes a picture with the score and your call on it.'));
  b.onclick = async () => {
    const sub = b.querySelector('.lg-brag-b');
    sub.textContent = 'Drawing it…';
    const r = await shareResult(state, best, xText(state));
    sub.textContent = r === 'shared' ? 'Sent.'
      : r === 'downloaded' ? 'Saved to your downloads — attach it to a post.'
      : r === 'cancelled' ? 'Makes a picture with the score and your call on it.'
      : 'This browser cannot make the picture. The link still works.';
  };
  return b;
}

/* 🔴 THE CHIP MUST SAY HOW FAR BEHIND WE ACTUALLY ARE, NOT HOW FAR WE ASKED TO
 * BE. Jason, live: "Timing is off", then "We are about a play behind", then "Do
 * we want a button for the snap so you can see what is happening with timing?"
 *
 * All three are the same finding and he got there before I did. The chip said
 * "45s behind" because 45000 was the stored setting - it was reporting a
 * PREFERENCE as though it were a measurement. On the wire at the time, the
 * newest play was 76 seconds old and the delay was holding NOTHING back, because
 * every play had already aged past the cutoff before it reached us.
 *
 * 🔴 SO THE 45s WAS NOT A DELAY WE WERE APPLYING, IT WAS A NUMBER WE WERE
 * PRINTING. The real distance is ESPN's own publishing lag plus the pipeline,
 * and it is bigger than the setting - which is why the question kept arriving
 * about a snap he had already watched.
 *
 * This shows the measured age of the newest visible play, and says which of the
 * two is doing the work:
 *   held  - our delay is the binding constraint, the number is ours to set
 *   feed  - the feed is already further behind than the setting, so adjusting
 *           the slider does nothing and the person deserves to know that
 *
 * A number a person can check against their own television is worth more than a
 * number that is always right because we defined it. */
/* 🔴 behindLabel / delayBar / delayPanel LIVED HERE and are gone - the delay
 * is a setting now, and the settings sheet in app.js owns the only slider.
 *
 * Kept as a note rather than deleted silently, because one of them carried a
 * fix that must not be re-lost if anybody rebuilds a readout on this screen:
 * the number a person is shown is the poller's MEASURED publish lag, never the
 * age of the newest play. Those agree during play and diverge completely at
 * half time, where "age of the newest play" reports the length of the break -
 * it once read "550s behind · the feed" while the feed was 47 seconds behind
 * and perfectly healthy. state.publishLagMs is the field; it is measured at
 * arrival by the poller and published with the state, so there is one source
 * and not two copies of the same arithmetic. */

const CSS = `
.lg { display: grid; gap: 10px; }
.lg-delay { display: grid; gap: 4px; padding: 8px 10px; border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--card); }
.lg-delay-l { font-size: var(--t-micro); font-weight: 700; letter-spacing: .04em; color: var(--accent); }
/* The stale bar reads as a fault, not as a status line. It borrows --down rather
   than team color, which is the same rule the result components follow. */
.lg-stale { display: grid; gap: 3px; padding: 10px; border-radius: var(--radius-card);
  border: 1px solid var(--down); background: color-mix(in srgb, var(--down) 10%, var(--card)); }
.lg-stale-l { font-size: var(--t-micro); font-weight: 800; letter-spacing: .06em; color: var(--down); }
.lg-stale-b { font-size: var(--t-micro); color: var(--ink); }
.lg-delay-warn { font-size: var(--t-micro); color: var(--down); font-weight: 700; margin: 2px 0 0; }
.lg-delay-done { justify-self: start; font: inherit; font-size: var(--t-micro); font-weight: 700;
  margin-top: 4px; min-height: 32px; padding: 0 14px; border: 1px solid var(--line);
  border-radius: var(--radius-card); background: var(--card); color: var(--fg); }
/* One line, not a card. It still says you are behind — that is the part that
   must never disappear — and the slider is one tap away. */
.lg-delayline { display: flex; align-items: baseline; gap: 8px; width: 100%;
  font: inherit; font-size: var(--t-micro); text-align: left;
  background: none; border: 0; padding: 2px 2px 0; color: var(--dim); }
.lg-delayline-l { font-weight: 700; letter-spacing: .04em; color: var(--accent); }
.lg-delayline.is-live .lg-delayline-l { color: var(--down); }
.lg-delayline-a { text-decoration: underline; }
.lg-react { display: grid; gap: 8px; padding: 12px; }
.lg-react-h { font-size: var(--t-micro); font-weight: 800; letter-spacing: .06em; color: var(--dim); }
.lg-react-row { display: flex; gap: 8px; flex-wrap: wrap; }
.lg-react-b { font: inherit; padding: 10px 14px; min-height: var(--tap-min);
  border: 2px solid var(--m); border-radius: var(--radius-card);
  background: color-mix(in srgb, var(--m) 12%, var(--card)); color: var(--m); }
.lg-react-w { font-size: var(--t-micro); font-weight: 800; letter-spacing: .06em; }
.lg-brag { display: grid; gap: 3px; text-align: left; font: inherit; width: 100%;
  padding: 13px 12px; border: 2px solid var(--up); border-radius: var(--radius-card);
  background: color-mix(in srgb, var(--up) 10%, var(--card)); color: var(--fg); }
/* 🔴 READABLE. Jason: "The share it seems hard to read." It was --up green on a
   pale green ground - the same hue at two lightnesses, which is the lowest
   contrast pairing a palette can produce, and --up is a RESULT color that means
   "this landed" rather than a color for text. The card keeps the green tint so
   it still reads as a good-news panel; the words are the normal foreground. */
.lg-brag-h { font-size: var(--t-emph); font-weight: 800; color: var(--fg); }
.lg-brag-b { font-size: var(--t-micro); color: var(--dim); }
/* 🔴 TWO COLUMNS, NOT THREE. Jason, 2026-09-09: "The right side of the cards
   should align."

   It was 1fr auto auto, from when a Reddit button sat beside the X one. That
   button was deleted and the track was not, so the grid still reserved a third
   column and, more to the point, a SECOND GAP after it - about 16px of nothing
   between the X button and the right edge. Every other card on the page ran to
   the edge and this one row stopped short of it.

   An empty grid track is invisible; its gap is not. That is the whole bug, and
   it is why removing a child from a grid means checking the template. */
.lg-invite-wrap { display: grid; grid-template-columns: 1fr auto auto; gap: 8px; align-items: stretch; }
.lg-x { display: grid; place-content: center; gap: 2px; text-decoration: none;
  padding: 0 14px; border: 1px solid var(--line); border-radius: var(--radius-card);
  background: var(--card); color: var(--fg); }
.lg-x-mark { font-size: 18px; line-height: 1; text-align: center; }
.lg-x-l { font-size: var(--t-micro); color: var(--dim); }
/* 🔴 THE INVITE IS QUIET. Jason, 2026-09-09: "The card for the game is more
   important than the invite a friend, but the outline suggests otherwise."
   Exactly right, and it was the one loud element on the page: a gold border AND
   a tinted fill, against a game card wearing the same hairline as everything
   else. Emphasis is a ranking, and this had the third thing on the page winning
   it. The accent stays on the WORDS so it still reads as an action; the box
   goes back to the standard card treatment. */
.lg-invite { display: grid; gap: 2px; text-align: left; font: inherit; width: 100%;
  padding: 13px 12px; border: 1px solid var(--line); border-radius: var(--radius-card);
  background: var(--card); color: var(--fg); }
.lg-invite-h { font-size: var(--t-emph); font-weight: 800; color: var(--accent); }
.lg-invite-b { font-size: var(--t-micro); color: var(--dim); overflow-wrap: anywhere; }
/* The channel reads as a label, not as a score. */
.lg-head .lg-tv { margin: 0; }
.lg-tv { font-size: var(--t-micro); font-weight: 700; letter-spacing: .04em; color: var(--dim);
  border: 1px solid var(--line); border-radius: var(--radius-chip); padding: 1px 6px; }
.lg-say { display: grid; gap: 0; padding: 4px 12px 8px; }
.lg-say-h { font-size: var(--t-micro); font-weight: 800; letter-spacing: .06em; color: var(--dim); padding: 8px 0 2px; }
.lg-sayrow { padding: 9px 0; border-top: 1px solid var(--line); }
.lg-say-line { display: flex; gap: 8px; align-items: baseline; }
.lg-say-when { font-size: var(--t-micro); color: var(--dim); white-space: nowrap; }
.lg-say-head { font-size: var(--t-body); }
.lg-say-detail { font-size: var(--t-micro); color: var(--dim); margin-top: 2px; line-height: 1.45; }
.lg-say-star { font-size: var(--t-micro); color: var(--accent); margin-top: 3px; font-weight: 700; }
.lg-pre { display: grid; gap: 10px; }
.lg-count { display: grid; gap: 2px; padding: 16px 12px; }
.lg-count-k { font-size: var(--t-micro); font-weight: 800; letter-spacing: .08em; color: var(--dim); }
.lg-count-v { font-size: var(--t-bank); font-weight: 800; line-height: 1.05; color: var(--accent); }
.lg-count-b { font-size: var(--t-micro); color: var(--dim); margin-top: 2px; }
.lg-what { display: grid; gap: 6px; padding: 14px 12px; }
.lg-what-h { font-size: var(--t-emph); font-weight: 800; }
.lg-what-b { font-size: var(--t-micro); color: var(--dim); margin: 0; line-height: 1.5; }
.lg-qlist { display: grid; margin: 6px 0 4px; }
.lg-qrow { display: flex; justify-content: space-between; gap: 10px; align-items: baseline;
  padding: 7px 0; border-top: 1px solid var(--line); }
.lg-qrow:first-child { border-top: 0; }
.lg-qtext { font-size: var(--t-body); }
.lg-qn { font-size: var(--t-micro); color: var(--dim); white-space: nowrap; }
.lg-waiting { display: grid; gap: 4px; padding: 14px 12px; }
.lg-nogame { display: grid; gap: 8px; padding: 16px 12px; }
.lg-nogame-h { font-size: var(--t-emph); font-weight: 800; }
.lg-nogame-b { font-size: var(--t-micro); color: var(--dim); margin: 0; line-height: 1.5; }
.lg-nogame-go { justify-self: start; font: inherit; font-weight: 800; margin-top: 4px;
  min-height: var(--tap-min); padding: 0 18px; border: 0;
  border-radius: var(--radius-card); background: var(--accent); color: var(--bg); }
.lg-switch { justify-self: start; font: inherit; font-size: var(--t-micro); font-weight: 700;
  color: var(--accent); background: none; border: 1px solid var(--line);
  border-radius: var(--radius-chip); padding: 4px 10px; min-height: 30px; }
/* NOT A CARD any more - see the rule in tokens.css - so it supplies its own
   rhythm rather than inheriting a card's padding. The two choices inside it are
   the cards. */
.lg-sport { display: grid; gap: 10px; }
.lg-sport-h { font-size: var(--t-section); font-weight: 800; }
.lg-sport-b { font-size: var(--t-micro); color: var(--dim); margin: 0; line-height: 1.5; }
.lg-sport-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 4px; }
.lg-mode-row { display: grid; gap: 10px; margin-top: 6px; }
.lg-mode { display: grid; gap: 3px; text-align: left; font: inherit; padding: 14px 12px;
  border: 1px solid var(--line); border-radius: var(--radius-card);
  background: var(--card); color: var(--fg); }
.lg-mode-h { font-size: var(--t-emph); font-weight: 800; }
/* The hub version is a strip, not a page: two choices, no essay, and the one you
   are in is marked so the card reads as WHERE YOU ARE rather than as a question
   being asked again. */
.lg-sport.is-compact { padding: 12px; gap: 6px; }
/* THE MODE ROW AND THE SPORT ROW SHARE A CLASS, so a bare 1fr 1fr sized both and
   a third mode wrapped into a 2+1 orphan. The mode row is scoped by :not() so the
   two grids can disagree, which they must.

   NO BACKTICKS IN THIS COMMENT, and that is not a style note. The first version
   quoted the class name in backticks, inside a template literal, and the
   backtick CLOSED THE STRING. What followed parsed as arithmetic on undefined
   identifiers, so node --check passed and every screen died at runtime on
   "mode is not defined". Second time tonight. See the parse guard. */
/* Every row on the hub is two across now that the first card is a pair. */
.lg-sport.is-compact .lg-mode-row { grid-template-columns: 1fr 1fr; }
/* The pool has one door, not two, so its row is full width rather than a button
   beside a gap. */
.lg-gorow.is-one { grid-template-columns: 1fr; }
/* One line: what you picked on the left, the way out of it on the right. */
.lg-picked { display: flex; align-items: baseline; justify-content: space-between;
  gap: 10px; margin: 2px 0 4px; }
.lg-picked-w { font-size: var(--t-micro); font-weight: 700; color: var(--dim);
  letter-spacing: .04em; text-transform: uppercase; }
.lg-picked-c { font: inherit; font-size: var(--t-micro); font-weight: 700;
  background: none; border: 0; padding: 6px 2px; color: var(--accent);
  text-decoration: underline; }
/* The GO row is the only place on the hub that navigates, so it carries its
   subtitle where the rows above it hide theirs - a door says where it leads. */
.lg-sport.is-compact .lg-gorow .lg-mode-b { display: block; }
.lg-gorow .lg-mode { border-color: color-mix(in srgb, var(--accent) 40%, var(--line)); }
.lg-gorow .lg-mode-h { color: var(--accent); }
.lg-sport.is-compact .lg-mode { padding: 10px 12px; gap: 1px; }
.lg-sport.is-compact .lg-mode-h { font-size: var(--t-body); }
.lg-sport.is-compact .lg-mode-b { display: none; }
.lg-hgame { display: grid; gap: 6px; padding: 14px 12px; text-decoration: none; color: var(--fg); }
/* 🔴 THE GAME CARD IS THE SUBJECT OF THE PAGE, so it carries the emphasis the
   invite used to steal: the accent border and the tint. It is also the tallest
   and the widest thing here, which is the other half of saying so. */
.lg-hgame { border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 7%, var(--card)); }
/* One word above the crests saying what the card is. */
.lg-hgame-k { font-size: var(--t-micro); font-weight: 800; letter-spacing: .1em;
  text-transform: uppercase; color: var(--accent); margin-bottom: 2px; }
/* What else is on tonight. A short list, not a second slate. */
.lg-also { display: grid; gap: 2px; padding: 12px; }
.lg-also-h { display: flex; align-items: baseline; justify-content: space-between;
  gap: 8px; margin-bottom: 4px; }
.lg-also-k { font-size: var(--t-micro); font-weight: 800; letter-spacing: .1em;
  text-transform: uppercase; color: var(--dim); }
.lg-also-n { font-size: var(--t-micro); color: var(--dim); }
.lg-also-r { display: flex; align-items: baseline; justify-content: space-between;
  gap: 10px; min-height: 44px; padding: 4px 0; text-decoration: none; color: var(--fg);
  border-top: 1px solid var(--line); font-size: var(--t-body); }
.lg-also-w { color: var(--dim); font-size: var(--t-micro); white-space: nowrap; }
.lg-also-more { display: block; padding: 10px 0 2px; font-size: var(--t-micro);
  font-weight: 800; color: var(--accent); text-decoration: none; }
/* The wordmark, at Section like every other page title. It was Score size,
   which made the app's own name compete with the game it is about. */
.lg-home-mark { display: flex; align-items: baseline; gap: 0;
  font-size: var(--t-section); font-weight: 800; padding: 2px 2px 0; }
/* The second door, edge to edge. */
.lg-wide { width: 100%; text-align: left; }
/* The matchup is the card's HEADLINE, at the share card's proportions - figure
   size, which is the largest type outside the live layer's own bank strip. */
.lg-hgame-t { font-size: var(--t-figure); font-weight: 800; line-height: 1.2;
  letter-spacing: -0.01em; }
/* The quiet connector the share card uses. It separates two crests; it is not a
   thing to read, so it gets the smallest size and the dim color. */
.lg-at { font-size: var(--t-body); font-weight: 700; color: var(--dim); }
.lg-hgame-b { font-size: var(--t-body); color: var(--dim); }
.lg-hgame-go { font-size: var(--t-emph); font-weight: 800; color: var(--accent); margin-top: 4px; }
.lg-mark { display: flex; align-items: baseline; gap: 0; }
.lg-mark-stem { color: var(--dim); font-weight: 700; }
.lg-mark-end { color: var(--accent); font-weight: 800; }
.lg-sportrow { margin-top: 2px; }
.lg-sportpick { display: flex; align-items: center; justify-content: center; gap: 8px; }
.lg-sportpick-logo { display: block; object-fit: contain; }
.lg-mode.is-on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, var(--card)); }
.lg-mode.is-on .lg-mode-h { color: var(--accent); }
.lg-mode-b { font-size: var(--t-micro); color: var(--dim); line-height: 1.45; }
.lg-sport-logo { display: block; margin: 0 auto 6px; object-fit: contain; }
.lg-sport-name { display: block; font-size: var(--t-body); }
.lg-sport-pick { font: inherit; font-size: var(--t-emph); font-weight: 800; min-height: 52px;
  border: 1px solid var(--line); border-radius: var(--radius-card);
  background: var(--card); color: var(--fg); }
.lg-intro { display: grid; gap: 8px; padding: 14px 12px; }
.lg-intro-h { font-size: var(--t-emph); font-weight: 800; line-height: 1.25; }
.lg-intro-b { font-size: var(--t-micro); color: var(--dim); margin: 0; line-height: 1.5; }
.lg-intro-go { justify-self: start; font: inherit; font-weight: 800; margin-top: 2px;
  min-height: var(--tap-min); padding: 0 20px; border: 0;
  border-radius: var(--radius-card); background: var(--accent); color: var(--bg); }
.lg-done { display: grid; gap: 4px; padding: 14px 12px; }
.lg-done-h { font-size: var(--t-micro); font-weight: 800; letter-spacing: .06em; color: var(--dim); }
.lg-done-b { font-size: var(--t-emph); font-weight: 800; }
.lg-name { display: grid; gap: 6px; padding: 12px; }
.lg-name-h { font-weight: 800; font-size: var(--t-emph); }
.lg-name-b { font-size: var(--t-micro); color: var(--dim); }
.lg-name-row { display: grid; grid-template-columns: 1fr auto; gap: 8px; margin-top: 2px; }
.lg-name-i { font: inherit; font-size: var(--t-body); padding: 10px; border: 1px solid var(--line);
  border-radius: var(--radius-card); background: var(--bg); color: var(--ink); min-width: 0; }
.lg-name-go { font: inherit; font-weight: 800; padding: 10px 16px; border: 0;
  border-radius: var(--radius-card); background: var(--accent); color: var(--bg); }
.lg-name-skip { font: inherit; font-size: var(--t-micro); color: var(--dim);
  background: none; border: 0; padding: 4px 0 0; text-align: left; text-decoration: underline; }
/* The board is a ranking now, so it is laid out as one: rank, name, record, profit. */
.lg-brow { display: grid; grid-template-columns: 20px 1fr auto auto; gap: 10px; align-items: baseline;
  padding: 9px 0; border-top: 1px solid var(--line); }
.lg-brow:first-of-type { border-top: 0; }
.lg-brow.is-me { font-weight: 800; }
.lg-brank { color: var(--dim); font-size: var(--t-micro); }
.lg-bname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lg-brec { color: var(--dim); font-size: var(--t-micro); }
.lg-bprofit { font-weight: 800; }
.lg-delay-l.is-live { color: var(--down); }
.lg-delay input { width: 100%; accent-color: var(--accent); }
/* 🔴 A SCOREBOARD, NOT A STATUS BAR. Three columns with the score in the
   middle, so the two crests are the same size as each other whatever the
   figure does, and the figure is not competing with a clock for the same line.
   See the note in the head builder. */
.lg-head { display: grid; justify-items: center; gap: 2px; padding: 2px 0 6px; }
.lg-head-main { display: grid; grid-template-columns: 1fr auto 1fr;
  align-items: center; justify-items: center; gap: 10px; width: 100%; }
.lg-head-side { display: grid; justify-items: center; gap: 3px; }
.lg-head-ab { font-size: var(--t-micro); font-weight: 800; letter-spacing: .06em;
  color: var(--dim); }
.lg-score { font-size: var(--t-bank); font-weight: 800; line-height: 1;
  white-space: nowrap; font-variant-numeric: tabular-nums; }
/* The clock and the channel are notes about the game, under it. */
.lg-meta { font-size: var(--t-body); font-weight: 700; color: var(--dim); }
/* The lead sits on its own line above the figure, so the row underneath keeps
   the baseline alignment the balance, the unit and the delta all share. */
/* A strip, not a card - see the note where it is built. */
.lg-bank { display: flex; align-items: baseline; gap: 6px; padding: 2px 4px 0; }
/* 🔴 CENTERED, NOT BASELINE. Jason, 2026-09-10: "There is too much room
   below the marbles text." align-items: baseline inside a 44px-tall pill
   puts the line at the TOP of the box and leaves the rest of the height
   empty underneath. Centering keeps the tap target and sits the words in the
   middle of it; the two spans still share a line. */
.lg-stakechip { display: inline-flex; align-items: center; gap: 6px; font: inherit;
  min-height: var(--tap-min); padding: 4px 14px; margin: 2px 0 6px;
  border: 1px solid var(--line); border-radius: var(--radius-pill);
  background: var(--surface-3); color: var(--fg); }
.lg-stakechip-n { font-size: var(--t-emph); font-weight: 800; }
.lg-stakechip-l { font-size: var(--t-micro); color: var(--dim); }
.lg-bank-lead { flex: 0 0 100%; font-size: var(--t-micro); color: var(--dim);
  letter-spacing: .04em; margin-bottom: -2px; }
/* THE BANK IS SMALLER THAN THE SCORE NOW. Jason: "the you have, is to large."
   It was --t-bank, 30px, and so is the scoreboard - two figures at the largest
   size the system has, on one screen, competing. He had just said the score is
   the second most important thing here, which settles which of the two gives
   way. The balance is a fact you check; the score is what you are watching. */
.lg-bal { font-size: var(--t-figure); font-weight: 800; }
.lg-unit { font-size: var(--t-micro); color: var(--dim); }
.lg-delta { margin-left: auto; font-size: var(--t-figure); font-weight: 700; }
.lg-call, .lg-called { padding: 12px; }
.lg-q { font-size: var(--t-emph); font-weight: 800; }
.lg-sub { font-size: var(--t-micro); color: var(--dim); margin-top: 2px; }
.lg-stakes { display: flex; gap: 6px; margin: 10px 0; }
.lg-stake { min-width: 56px; min-height: var(--tap-min); font-weight: 700; }
.lg-stake.is-on { border-color: var(--accent); color: var(--accent); }
/* 🔴 FOUR TILES DO NOT FIT ACROSS A PHONE. Column auto-flow was fine while every
   question was a coin flip and silently crushes a four-way one: at 375px the
   four columns measured 108 / 77 / 77 / 89, sized to their own text, so the
   tiles are uneven AND too narrow. Requirement 7.5 exactly - a layout bug no
   test can see. Two and three go across; four goes two-by-two.
   And no backticks in this block: it lives inside a template literal, and one
   of them ended the string and took the whole screen down. */
/* 🔴 EQUAL COLUMNS. Jason, 2026-09-10: "If there is 2 choices, have them split
   equally left to right." grid-auto-flow: column sizes each implicit column to
   its content, so "First down" took more of the row than "No". 1fr columns
   split it evenly whatever the labels say. */
.lg-tiles { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 8px; }
.lg-tiles.is-4 { grid-auto-flow: row; grid-template-columns: 1fr 1fr; }
/* The stoppage nugget - one true thing, while nothing is happening. */
.lg-nugget { display: grid; gap: 6px; }
.lg-nugget-h { font-size: var(--t-micro); font-weight: 800; letter-spacing: .08em;
  text-transform: uppercase; color: var(--accent); }
.lg-nugget-b { margin: 0; font-size: var(--t-emph); font-weight: 700; line-height: 1.3; color: var(--fg); }
.lg-nugget-n { font-size: var(--t-micro); color: var(--dim); }
/* 🔴 THE TILE HAD NO RADIUS AT ALL. Jason: "maybe round the corners?" It went
   unnoticed while the tiles were borderless — with nothing drawn at the edge
   there were no corners to see. The moment the taken one got a 2px accent
   border, the square box appeared in a card whose own corners are rounded and
   in an app where every other surface is.
   Every tile takes the radius, not just the lit one, so the shape does not
   change when you tap. */
.lg-tile { display: grid; gap: 2px; padding: 10px; min-height: 76px; text-align: left;
  border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--card); }
/* 🔴 THE CHOICE IS THE BIGGEST THING ON THE TILE. Jason: "make the word 'Run'
   and 'Pass' larger." It was set at --t-emph, the same size as a card heading,
   while the PAYOUT below it was --t-figure and won the tile. The number matters
   and it is not what you are choosing between — you are choosing a word, at
   arm's length, in a room with a television on. */
.lg-tile-label { font-weight: 800; font-size: var(--t-section); line-height: 1.15; }
.lg-tile-win { font-size: var(--t-figure); font-weight: 800; }
.lg-tile-x { font-size: var(--t-micro); color: var(--dim); }
/* The taken tile keeps the accent it was tapped with; the others recede rather
   than disappear, so the choice still reads as a choice that was made. */
.lg-tile.is-mine { border: 2px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, var(--card)); }
/* 🔴 THE ONES NOT TAKEN STAY VISIBLE AS TILES. At .38 opacity with no border
   they read as loose grey text rather than as the options they were — you could
   no longer see that it had been a choice between four things. They keep their
   outline and recede instead. */
.lg-tile.is-faded { opacity: .55; border-style: dashed; background: transparent; }
.lg-call.is-called .lg-tile { cursor: default; }
.lg-note { font-size: var(--t-micro); color: var(--dim); margin: 8px 0 0; }
.lg-rows, .lg-board { padding: 4px 12px; }
.lg-board-h { font-size: var(--t-micro); color: var(--dim); padding: 8px 0 2px; letter-spacing: .04em; }
.lg-row { display: flex; align-items: center; gap: 8px; min-height: 38px; border-bottom: 1px solid var(--line); }
.lg-row:last-child { border-bottom: 0; }
.lg-row-label { font-weight: 700; font-size: var(--t-body); }
.lg-row-why { font-size: var(--t-micro); color: var(--dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lg-row-delta { margin-left: auto; font-weight: 700; }
.lg-row.is-up .lg-row-delta { color: var(--up); }
.lg-row.is-down .lg-row-delta { color: var(--down); }
.lg-row.is-void .lg-row-delta, .lg-row.is-open .lg-row-delta { color: var(--dim); }
.lg-foot { font-size: var(--t-micro); color: var(--dim); margin: 4px 2px 0; }
`;
