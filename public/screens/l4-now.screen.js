/* L4 - THE NOW TAB. The bank strip and the call card.
 *
 * ============================================================================
 * THE ONE RULE THIS SCREEN EXISTS TO KEEP
 * ============================================================================
 * THE PRICE IS ON THE TILE, BEFORE THE TAP. The model prices the snap and the
 * number is on screen while the decision is still open.
 *
 * BAR - four files, all opened:
 *   AQB-call-binary-run-pass.png       two full-height tiles reading RUN and
 *                                      PASS. Nothing on either says what it pays
 *   AQB-call-grid-six-tiles.png        six tiles - RUN LEFT / CENTER / RIGHT,
 *                                      PASS SHORT / MEDIUM / LONG. Same silence
 *   AQB-result-way-to-pick-it.png      where the number finally appears:
 *                                      "WAY TO PICK IT! YOU'VE EARNED 220
 *                                      POINTS!" - a full-bleed green banner,
 *                                      AFTER the play, on a WIN ONLY
 *   AQB-locked-binary-you-selected-pass.png
 *                                      "PLAY IN PROGRESS ... YOU SELECTED: PASS"
 *                                      - a panel that REPLACES the board for the
 *                                      whole play
 * They ship a real difficulty ladder - 50 for the binary, 220 for the six-way -
 * and a player learns it by winning twice.
 *
 * NOTE ON THOSE FILES: AQB-* are 2018 marketing panels. AQB-LIVE-* are the
 * running 2026 app. No geometry is taken from a store panel; what is taken is
 * the ABSENCE, which is the same in both.
 *
 * SECOND BAR - the reference implementation's own Now tab, rendered at 393px
 * from `sports-live/tools/preview.py fixtures/02_red_zone.json --fresh`. Its
 * bank strip (30px balance, the disclaimer beneath it, the record on the right)
 * and its two-tile call card with a proportional bar are the shell this follows.
 * Three things are changed deliberately:
 *   - "PLAY CREDITS · CANNOT BE BOUGHT" ships as "Marbles · cannot be bought".
 *     `credits` is a forbidden word next to the balance
 *   - a confidence chip is added. The reference prints "1840 comparable plays"
 *     and never says how much it trusts them
 *   - the multiple is printed next to the return, because the return alone moves
 *     when the stake moves and the multiple is what the model actually said
 *
 * ============================================================================
 * WHERE THE NUMBERS COME FROM - and they are not invented
 * ============================================================================
 * Every price below was produced by `src/lib/price.ts` against the REAL 22 MB
 * trained model at `sports-live/tendency.json` (350,924 contexts, min_samples
 * 30), on real pre-snap situations pulled out of
 * `fixtures/real-bois-at-ore-260905-final.json`.
 *
 * They are cached in this file because a browser cannot run price.ts: it is
 * TypeScript, there is no build step by contract, and the model is 22 MB and
 * lives outside the served root. `tests/l4-now.test.mjs` re-derives every one of
 * them with the real pricer and the real model and fails on any drift, so this
 * table is a CACHE, not a fixture. It is also checked against the fixture's own
 * play records, so the down, distance, spot, score and clock cannot drift either.
 *
 * The only thing here that no fixture can contain is the USER: a stake and a
 * side are a person's choice and the captured game has no person in it. Those
 * are named as stubs in the return.
 * ============================================================================
 */

import { stateBlock, STATES_CSS } from '/components/states.js';
import { teamChip, TEAM_CHIP_CSS, applyTeamVars } from '/components/team-chip.js';
import { signed, signClass } from '/components/fmt.js';

export const id = 'l4-now';
export const title = 'Now - the bank strip and the call card';
export const bar = 'reference/armchair-quarterback-teardown/screens/AQB-call-binary-run-pass.png';

/** Every state this screen has. `no-model` is a route because DESIGN.md records
 *  that it ships SILENTLY in the reference - no model, no odds, no warning. */
export const states = [
  'open', 'staked', 'settling', 'settled-landed', 'settled-missed',
  'no-model', 'loading', 'offline', 'error',
];

/* ========================================================================== */
/* The verified price cache. tests/l4-now.test.mjs parses the array between      */
/* these two markers as strict JSON and re-derives every field.                 */
/* ========================================================================== */
/* PRICED-BEGIN */
export const PRICED = [
  {
    "snapId": "40185843320", "offenseId": "68", "down": 3, "distance": 4,
    "yardsToGoal": 69, "scoreDiff": 0, "period": 1, "secondsLeft": 875,
    "run":  { "p": 0.195, "payoutPerMarble": 5.128205128205128 },
    "pass": { "p": 0.805, "payoutPerMarble": 1.2422360248447204 },
    "confidence": "hi", "samples": 3412, "level": "full", "basis": "league"
  },
  {
    "snapId": "40185843323", "offenseId": "68", "down": 3, "distance": 9,
    "yardsToGoal": 74, "scoreDiff": 0, "period": 1, "secondsLeft": 840,
    "run":  { "p": 0.151, "payoutPerMarble": 6 },
    "pass": { "p": 0.849, "payoutPerMarble": 1.1778563015312131 },
    "confidence": "hi", "samples": 2199, "level": "full", "basis": "league"
  },
  {
    "snapId": "401858433228", "offenseId": "68", "down": 2, "distance": 9,
    "yardsToGoal": 74, "scoreDiff": 0, "period": 2, "secondsLeft": 677,
    "run":  { "p": 0.462, "payoutPerMarble": 2.1645021645021645 },
    "pass": { "p": 0.538, "payoutPerMarble": 1.858736059479554 },
    "confidence": "hi", "samples": 2326, "level": "full", "basis": "league"
  },
  {
    "snapId": "401858433231", "offenseId": "68", "down": 3, "distance": 9,
    "yardsToGoal": 74, "scoreDiff": 0, "period": 2, "secondsLeft": 677,
    "run":  { "p": 0.142, "payoutPerMarble": 6 },
    "pass": { "p": 0.858, "payoutPerMarble": 1.1655011655011656 },
    "confidence": "hi", "samples": 826, "level": "full", "basis": "league"
  },
  {
    "snapId": "401858433285", "offenseId": "2483", "down": 4, "distance": 1,
    "yardsToGoal": 47, "scoreDiff": -7, "period": 2, "secondsLeft": 609,
    "run":  { "p": 0.62, "payoutPerMarble": 1.6129032258064517 },
    "pass": { "p": 0.38, "payoutPerMarble": 2.6315789473684212 },
    "confidence": "mid", "samples": 71, "level": "no_field", "basis": "team"
  },
  {
    "snapId": "401858433602", "offenseId": "2483", "down": 4, "distance": 11,
    "yardsToGoal": 25, "scoreDiff": 0, "period": 4, "secondsLeft": 900,
    "run":  { "p": 0.485, "payoutPerMarble": 2.061855670103093 },
    "pass": { "p": 0.515, "payoutPerMarble": 1.941747572815534 },
    "confidence": "lo", "samples": 97, "level": "down", "basis": "team"
  }
];
/* PRICED-END */

/** The game every one of those snaps came out of. */
export const GAME = 'real-bois-at-ore';

/** From `src/lib/calls.ts` HOUSE_RULES. Not decided here; restated so the view
 *  can size a ladder. B2 will move these and they are parameters for that reason. */
export const HOUSE = { startingBank: 100, stakeLadder: [5, 10, 25], maxPayoutMultiple: 6 };

/** THE BALANCE IS MARBLES. There is no other word for it and `credits`,
 *  `coins`, `top-up`, `buy` and `refill` may not appear beside it. */
export const BALANCE_NOUN = 'Marbles';

/* ========================================================================== */
/* Bank arithmetic - the same rules as calls.ts, checked against it in the test */
/* ========================================================================== */

/** `min(stake * 6, round(stake / p))`. The cap is on the MULTIPLE, not the stake. */
export function payoutFor(stake, p) {
  if (p == null || !(p > 0)) return stake;
  return Math.min(stake * HOUSE.maxPayoutMultiple, Math.round(stake / p));
}

/**
 * Replay a list of settled calls onto a fresh bank.
 * `outcome` is 'run' | 'pass' | null; null is a void snap - a kick, a penalty,
 * anything that was not the offense choosing. A void RETURNS THE STAKE and moves
 * neither the record nor the streak.
 */
export function replay(history) {
  const bank = {
    balance: HOUSE.startingBank, start: HOUSE.startingBank, delta: 0,
    record: { landed: 0, missed: 0 }, streak: 0,
  };
  for (const h of history) {
    bank.balance -= h.stake;
    if (h.outcome == null) { bank.balance += h.stake; continue; }
    const landed = h.side === h.outcome;
    if (landed) {
      bank.balance += payoutFor(h.stake, h.p);
      bank.record.landed += 1; bank.streak += 1;
    } else {
      bank.record.missed += 1; bank.streak = 0;
    }
  }
  bank.delta = bank.balance - bank.start;
  return bank;
}

/* ========================================================================== */
/* The script - which real snap each route is standing on                      */
/* ========================================================================== */

/** 🔴 STUB, and it is the only one: a stake and a side are a USER's choice and no
 *  captured game contains a user. The PRICE each call was taken at, and the play
 *  that settled it, are both real. `outcome` is derived from the fixture's own
 *  play type at render time, never typed in here. */
export const SCRIPT = {
  'open':            { snapId: '40185843320', repriceTo: '40185843323', history: [] },
  'staked':          { snapId: '40185843323', history: ['40185843320:pass:10'],
                       call: { side: 'run', stake: 25 } },
  /* The `lo` snap, deliberately: 4th & 11 with the game tied in the fourth, where
   * the model backs off to the down alone and says so. `lo` is a feature and it
   * has to be visible on a route or it is not shipped. */
  'settling':        { snapId: '401858433602',
                       history: ['40185843320:pass:10', '40185843323:pass:10',
                                 '401858433228:run:10', '401858433231:pass:25'],
                       call: { side: 'run', stake: 10 } },
  'settled-landed':  { snapId: '401858433285',
                       history: ['40185843320:pass:10', '40185843323:pass:10',
                                 '401858433228:run:10', '401858433231:pass:25'],
                       call: { side: 'pass', stake: 10 } },
  'settled-missed':  { snapId: '401858433285',
                       history: ['40185843320:pass:10', '40185843323:pass:10',
                                 '401858433228:run:10', '401858433231:pass:25'],
                       call: { side: 'run', stake: 10 } },
  'no-model':        { snapId: '401858433231',
                       history: ['40185843320:pass:10', '40185843323:pass:10',
                                 '401858433228:run:10'] },
  'offline':         { snapId: '401858433231',
                       history: ['40185843320:pass:10', '40185843323:pass:10',
                                 '401858433228:run:10'] },
  'error':           { snapId: '401858433231', history: [] },
};

/* ========================================================================== */
/* previewData - reads the REAL fixture. Nothing below invents a play.         */
/* ========================================================================== */

const byId = (list) => { const m = new Map(); for (const r of list) m.set(r.snapId, r); return m; };

/** ESPN's play type text -> what settles a call. Only a run or a pass is the
 *  offense choosing; everything else is a void snap and the stake comes back. */
export function outcomeOf(typeText) {
  const t = String(typeText || '').toLowerCase();
  if (t.includes('pass') || t.includes('sack')) return 'pass';
  if (t.includes('rush')) return 'run';
  return null;
}

export async function previewData(fixtures, state) {
  const doc = await fixtures.load(GAME);
  const teams = (fixtures.teams && fixtures.teams.teams) || fixtures.teams || {};
  const comp = ((doc.header || {}).competitions || [])[0] || {};
  const sides = comp.competitors || [];
  const home = sides.find((c) => c.homeAway === 'home') || {};
  const away = sides.find((c) => c.homeAway === 'away') || {};

  /* Flatten every play with the drive that owned it, so a snap id resolves to a
   * real play AND the offense that ran it. */
  const flat = [];
  for (const drive of (doc.drives || {}).previous || []) {
    const t = drive.team || {};
    for (const p of drive.plays || []) flat.push({ play: p, driveId: drive.id, offenseId: t.id != null ? String(t.id) : null });
  }
  const at = new Map();
  flat.forEach((row, i) => at.set(String(row.play.id), { ...row, i }));

  const priced = byId(PRICED);
  const snaps = new Map();
  for (const row of PRICED) {
    const hit = at.get(row.snapId);
    if (!hit) continue;
    const play = hit.play;
    const prev = (flat[hit.i - 1] || {}).play || {};
    const start = play.start || {};
    snaps.set(row.snapId, {
      ...row,
      offense: teams[row.offenseId] || null,
      /* Display strings, straight off the fixture. */
      downDistance: start.downDistanceText || null,
      spot: start.possessionText || null,
      clockDisplay: (prev.clock || {}).displayValue || null,
      homeScore: prev.homeScore == null ? 0 : prev.homeScore,
      awayScore: prev.awayScore == null ? 0 : prev.awayScore,
      /* 7.2 - the parenthesized group at the end of a play is the TACKLER, and a
       * view may not derive a star. So the result line carries the play TYPE and
       * the yardage and names nobody at all. */
      playType: (play.type || {}).text || null,
      playYards: play.statYardage == null ? null : play.statYardage,
      outcome: outcomeOf((play.type || {}).text),
    });
  }

  const script = SCRIPT[state] || SCRIPT.open;
  const history = (script.history || []).map((s) => {
    const [snapId, side, stake] = s.split(':');
    const row = priced.get(snapId);
    const seen = snaps.get(snapId);
    return { snapId, side, stake: Number(stake), p: row ? row[side].p : null,
             outcome: seen ? seen.outcome : null };
  });

  const bankBefore = replay(history);
  const snap = snaps.get(script.snapId) || null;

  let call = null, bankAfter = bankBefore, settled = null;
  if (script.call && snap) {
    const p = snap[script.call.side].p;
    call = { ...script.call, p, snapId: snap.snapId,
             returns: payoutFor(script.call.stake, p) };
    if (state === 'settled-landed' || state === 'settled-missed') {
      const landed = state === 'settled-landed';
      settled = { landed, delta: landed ? call.returns - call.stake : -call.stake };
      bankAfter = replay(history.concat([{ ...call, outcome: landed ? call.side : (call.side === 'run' ? 'pass' : 'run') }]));
    } else {
      /* Staked and settling: the stake has LEFT the bank. It leaves at the tap,
       * not at the result, so the number on the tile is what comes back rather
       * than what you net. */
      bankAfter = { ...bankBefore, balance: bankBefore.balance - call.stake,
                    delta: bankBefore.balance - call.stake - bankBefore.start,
                    record: bankBefore.record };
    }
  }

  return {
    game: { home: teams[String(home.id)] || null, away: teams[String(away.id)] || null,
            homeId: String(home.id), awayId: String(away.id) },
    snap,
    repriceTo: script.repriceTo ? snaps.get(script.repriceTo) || null : null,
    /* The reprice CAUSE, read off the fixture play that caused it. */
    repriceBecause: script.repriceTo && snaps.get(script.snapId)
      ? (at.get(script.snapId) || {}).play && (at.get(script.snapId).play.type || {}).text
      : null,
    bankBefore, bank: bankAfter, call, settled,
    ladder: HOUSE.stakeLadder,
    /* 🔴 STUB. The DO owns the snap clock (CONTRACT 8, `offer`). 25s is a preview
     * value so the countdown can be watched; it is not a product decision. */
    windowMs: 25000,
  };
}

/* ========================================================================== */
/* render                                                                      */
/* ========================================================================== */

const REDUCED = () => typeof matchMedia === 'function'
  && matchMedia('(prefers-reduced-motion: reduce)').matches;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/** `2.63x`. Two decimals, trailing `.00` dropped, so a 6.00x cap reads `6x`. */
export function multLabel(x) {
  if (x == null || !isFinite(x)) return '—';
  return x.toFixed(2).replace(/\.?0+$/, '') + '×';
}

/**
 * 🔴 THE TWO TILES ARE ROUNDED TOGETHER, NEVER SEPARATELY.
 *
 * `p` is 0.195 / 0.805, and rounding each side on its own puts `20%` on one tile
 * and `81%` on the other. A user can add. Three of the six real snaps on this
 * screen do it — it is not an edge case, it is what a 3dp probability does — so
 * the pass side is DERIVED from the run side and the pair always sums to 100.
 *
 * Caught by tests/l4-now.test.mjs against the real prices, not by looking.
 */
export function pctPair(pRun) {
  if (pRun == null) return { run: null, pass: null };
  const a = Math.round(pRun * 100);
  return { run: a, pass: 100 - a };
}

const CONF_WORD = { hi: 'Confident', mid: 'Middling', lo: 'Guessing' };

/**
 * Where the model's number came from. `lo` is a FEATURE - it is the model saying
 * out loud that it backed off to a broad context - so the line says so plainly
 * rather than hiding a weak sample behind a chip.
 */
function modelLine(snap) {
  const where = snap.basis === 'team' ? 'this team' : 'the league';
  const broad = snap.level === 'down' || snap.level === 'global';
  return `${snap.samples.toLocaleString('en-US')} comparable snaps from ${where}`
    + (broad ? ' · down alone, nothing narrower matched' : '')
    + ' · the call the model likes less pays more';
}

/* ---- the pieces ---- */

function situation(snap) {
  const wrap = document.createDocumentFragment();
  const row = el('div', 'l4-sit');
  /* 🔴 THE CHIP IS ALWAYS DRAWN, including for a team this app has no identity
   * for. `teamChip` has a defined null state - grey, dashed ring, an em-dash for
   * the abbreviation - and skipping the chip when the lookup misses deletes the
   * possession indicator instead of saying it is unknown. 401 of 760 schools have
   * no usable primary and an opponent can be absent from the file outright; found
   * at 393px by deleting one real row from teams.json and looking. */
  row.appendChild(teamChip(snap.offense, { size: 20 }));
  row.appendChild(el('span', 'l4-sit-dd num', snap.downDistance || '—'));
  const rest = el('span', 'l4-sit-rest num');
  rest.textContent = [snap.spot, snap.clockDisplay ? 'Q' + snap.period + ' ' + snap.clockDisplay : null]
    .filter(Boolean).join(' · ');
  row.appendChild(rest);
  wrap.appendChild(row);

  /* The field, own goal on the left. yardsToGoal 74 is the ball on their own 26. */
  const field = el('div', 'l4-field');
  applyTeamVars(field, snap.offense);
  const pct = snap.yardsToGoal == null ? 0 : (100 - snap.yardsToGoal);
  const gained = el('div', 'l4-field-gained'); gained.style.width = pct + '%';
  const mark = el('div', 'l4-field-marker'); mark.style.left = pct + '%';
  field.append(gained, mark);
  if (snap.distance != null && snap.yardsToGoal != null) {
    const first = el('div', 'l4-field-first');
    first.style.left = Math.min(100, pct + snap.distance) + '%';
    field.appendChild(first);
  }
  wrap.appendChild(field);
  return wrap;
}

/**
 * THE BANK STRIP. Balance at 30px - the largest type in the app - delta since
 * kickoff, record, streak, and the line saying the balance cannot be bought.
 *
 * PLACEMENT IS THE POINT: above the call, always. A stake means nothing without
 * a balance in view. The disclaimer does NOT move into settings; it is what
 * keeps this out of gambling-app territory and it stays on screen.
 */
function bankStrip(bank, opts) {
  opts = opts || {};
  const card = el('div', 'card l4-bank');

  const bal = el('div', 'l4-bank-balance num');
  bal.textContent = String(opts.from == null ? bank.balance : opts.from);
  card.appendChild(bal);

  const right = el('div', 'l4-bank-right');
  const d = el('span', 'l4-bank-delta num ' + signClass(bank.delta));
  d.textContent = signed(bank.delta);
  const rec = el('span', 'l4-bank-rec num');
  const played = bank.record.landed + bank.record.missed;
  /* "no calls yet" beside a committed stake is a lie the screenshot caught: the
   * record counts SETTLED calls, and an open one is neither landed nor missed. */
  rec.textContent = (played === 0 && !opts.committed)
    ? 'no calls yet'
    : `${bank.record.landed}–${bank.record.missed}`
      + (opts.committed ? ' · 1 open' : '')
      + (bank.streak > 1 ? ` · ${bank.streak} in a row` : '');
  right.append(d, rec);
  card.appendChild(right);

  /* DESIGN.md specs "Play credits · cannot be bought". `credits` is a forbidden
   * word beside the balance, so it ships in Marbles. */
  card.appendChild(el('p', 'l4-bank-note', BALANCE_NOUN + ' · cannot be bought'));

  if (opts.committed) {
    const c = el('p', 'l4-bank-committed');
    c.append(document.createTextNode('Committed on this snap '));
    const b = el('b', 'num', String(opts.committed));
    c.append(b, document.createTextNode(' · back to ' + HOUSE.startingBank + ' at the next kickoff, always'));
    card.appendChild(c);
  } else {
    card.appendChild(el('p', 'l4-bank-committed',
      'Back to ' + HOUSE.startingBank + ' at the next kickoff, always. Nobody is ever out.'));
  }

  if (opts.from != null && opts.from !== bank.balance) animateTo(bal, opts.from, bank.balance);
  return card;
}

/**
 * A QUANTITY is interpolated - every value between 96 and 112 was real Marbles
 * in the bank on the way there. A PRICE is not, and is swapped instead. That is
 * the whole motion rule on this screen.
 *
 * 🔴 The destination is written FIRST. If requestAnimationFrame never fires -
 * a background tab, a suspended process, reduced motion - the number on screen
 * is the true one rather than the one it was leaving. An animation may never be
 * the only thing that makes a figure correct.
 */
function animateTo(node, from, to) {
  node.textContent = String(to);
  if (REDUCED() || from === to) return;
  const dur = 420, t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3);              // ease-out cubic
    node.textContent = String(Math.round(from + (to - from) * e));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/**
 * ONE TILE. It carries, in this order: the side, WHAT IT PAYS at the current
 * stake, the multiple and the model's read. The pay figure is the largest thing
 * on the tile and it is drawn in every state that has a model.
 */
function tile(side, offer, stake, opts) {
  opts = opts || {};
  const b = document.createElement(opts.interactive ? 'button' : 'div');
  b.className = 'l4-tile';
  b.dataset.side = side;
  if (!opts.interactive) b.setAttribute('aria-disabled', 'true');

  b.appendChild(el('span', 'l4-tile-side', side === 'run' ? 'Run' : 'Pass'));

  const pay = el('span', 'l4-tile-pay num');
  const inner = el('span', 'l4-pay-val', offer ? '+' + payoutFor(stake, offer.p) : 'No price');
  pay.appendChild(inner);
  b.appendChild(pay);

  const mult = el('span', 'l4-tile-mult num');
  if (offer) {
    const strong = el('b', null, multLabel(offer.payoutPerMarble));
    mult.append(strong, document.createTextNode(' · model says ' + opts.pct + '%'));
  } else {
    mult.textContent = 'no model loaded';
    b.dataset.nomodel = '1';
  }
  b.appendChild(mult);

  if (offer) {
    const bar = el('span', 'l4-tile-bar');
    bar.style.width = Math.round(offer.p * 100) + '%';
    b.appendChild(bar);
  }
  b.dataset.stake = String(stake);
  return b;
}

/**
 * Swap the price on a tile that is already on screen. Old value out, new value
 * in - nothing in between is ever readable, because the numbers in between were
 * never offered.
 *
 * 🔴 THE REAL NODE TAKES THE NEW TEXT ON LINE ONE, before any animation is
 * considered. Only a clone animates away. See the note in l4-now.css: the first
 * version made the incoming number the animated one, and a tile whose animation
 * was suspended showed the old price next to the new multiple.
 */
function swapPay(tileEl, offer, stake, pct) {
  const pay = tileEl.querySelector('.l4-tile-pay');
  const bar = tileEl.querySelector('.l4-tile-bar');
  const next = offer ? '+' + payoutFor(stake, offer.p) : 'No price';
  const cur = pay.querySelector('.l4-pay-val');
  if (cur && cur.textContent !== next) {
    if (!REDUCED()) {
      const ghost = cur.cloneNode(true);
      ghost.className = 'l4-pay-ghost';
      pay.appendChild(ghost);
      setTimeout(() => { if (ghost.parentNode) ghost.parentNode.removeChild(ghost); }, 220);
      cur.classList.add('l4-pay-enter');
      setTimeout(() => cur.classList.remove('l4-pay-enter'), 220);
    }
    cur.textContent = next;
  }
  const mult = tileEl.querySelector('.l4-tile-mult');
  if (mult && offer) {
    mult.textContent = '';
    mult.append(el('b', null, multLabel(offer.payoutPerMarble)),
                document.createTextNode(' · model says ' + pct + '%'));
  }
  if (bar && offer) bar.style.width = Math.round(offer.p * 100) + '%';
}

/**
 * THE BAND. Staked, settled-landed and settled-missed are the SAME component
 * with a different sign - identical grid, identical type, identical 240ms.
 * Armchair fires a full-bleed green banner on a win and shows nothing comparable
 * on a miss. Here the bank is the subject and it moves both ways.
 */
function band(sign, what, sub, figure) {
  const box = el('div', 'l4-band');
  box.dataset.sign = sign;
  box.appendChild(el('div', 'l4-band-what', what));
  box.appendChild(el('div', 'l4-band-figure num', figure));
  box.appendChild(el('p', 'l4-band-sub', sub));
  return box;
}

/* ---- the screen ---- */

export function render(root, data, state) {
  root.innerHTML = '';
  root.classList.add('scr-l4-now');
  if (root._l4timer) { cancelAnimationFrame(root._l4timer); root._l4timer = null; }

  const style = document.createElement('style');
  style.textContent = [STATES_CSS, TEAM_CHIP_CSS].join('\n');
  root.appendChild(style);

  if (state === 'loading') {
    root.appendChild(stateBlock('loading', { rows: 5, body: 'Waiting for the snap…' }));
    return;
  }
  if (state === 'error') {
    root.appendChild(stateBlock('error', {
      title: 'The call card is not available',
      body: 'The model answered, the feed did not. Nothing you called has been lost and no stake has moved.',
      action: { label: 'Reload' },
    }));
    if (data && data.bank) root.appendChild(bankStrip(data.bank, {}));
    return;
  }
  if (state === 'offline') {
    /* OFFLINE KEEPS THE BANK, because the balance is still true - it is the last
     * thing the server told us and no call can settle while the socket is down. */
    root.appendChild(stateBlock('offline', {
      body: 'One server polls the feed and your phone holds one connection. That connection dropped, so no snap can be called until it is back.',
      since: Date.now() - 31000,
      action: { label: 'Try again' },
    }));
    if (data && data.bank) root.appendChild(bankStrip(data.bank, {}));
    root.appendChild(el('p', 'l4-held',
      'Held, not lost: nothing settles while you are offline and no stake leaves the bank.'));
    return;
  }

  if (!data || !data.snap) {
    root.appendChild(stateBlock('empty', {
      title: 'No snap on the clock',
      body: 'The Now tab wakes up when a drive does.',
    }));
    return;
  }

  const snap = data.snap;
  const noModel = state === 'no-model';
  const settled = state === 'settled-landed' || state === 'settled-missed';
  const staked = state === 'staked' || state === 'settling' || settled;

  root.appendChild(situation(snap));

  /* THE BANK STRIP IS ABOVE THE CALL. Always. */
  root.appendChild(bankStrip(data.bank, {
    from: settled ? data.bankBefore.balance - (data.call ? data.call.stake : 0) : null,
    committed: (state === 'staked' || state === 'settling') && data.call ? data.call.stake : 0,
  }));

  const card = el('div', 'card l4-call');
  const head = el('div', 'l4-call-head');
  head.appendChild(el('span', 'l4-call-title', 'Call it'));

  if (noModel) {
    head.appendChild(el('span', 'l4-nomodel', 'No model'));
  } else {
    const chip = el('span', 'c-' + snap.confidence, CONF_WORD[snap.confidence]);
    chip.title = 'Model confidence: ' + snap.confidence;
    head.appendChild(chip);
  }

  const clockEl = el('span', 'l4-call-clock num');
  head.appendChild(clockEl);
  card.appendChild(head);

  const snapBar = el('div', 'l4-snap');
  const fill = el('div', 'l4-snap-fill');
  snapBar.appendChild(fill);
  card.appendChild(snapBar);

  /* ---- stake ladder ---- */
  let stake = data.call ? data.call.stake : 10;
  const ladder = el('div', 'l4-stake');
  ladder.appendChild(el('span', 'l4-stake-label', 'Stake'));
  const chips = [];
  for (const s of data.ladder) {
    const c = el('button', 'l4-chip num', String(s));
    c.type = 'button';
    c.setAttribute('aria-pressed', String(s === stake));
    c.setAttribute('aria-label', s + ' ' + BALANCE_NOUN);
    if (staked || noModel || s > data.bank.balance + (staked && data.call ? data.call.stake : 0)) c.disabled = true;
    chips.push(c);
    ladder.appendChild(c);
  }
  card.appendChild(ladder);

  /* ---- the two tiles. THE PRICE IS ON THEM, NOW. ---- */
  const tiles = el('div', 'l4-tiles');
  const interactive = state === 'open';
  const pct0 = pctPair(noModel ? null : snap.run.p);
  const runTile = tile('run', noModel ? null : snap.run, stake, { interactive, pct: pct0.run });
  const passTile = tile('pass', noModel ? null : snap.pass, stake, { interactive, pct: pct0.pass });
  tiles.append(runTile, passTile);
  card.appendChild(tiles);

  if (data.call) {
    for (const t of [runTile, passTile]) {
      if (t.dataset.side === data.call.side) t.dataset.picked = '1';
      else t.dataset.dimmed = '1';
    }
  }
  if (settled && data.call) {
    const win = state === 'settled-landed';
    for (const t of [runTile, passTile]) {
      if (t.dataset.side === data.call.side) t.dataset.settled = win ? 'up' : 'down';
    }
  }

  /* ---- the line under the tiles ---- */
  if (noModel) {
    /* 🔴 DEFINED, not silent. Without a model there is no price, and a call taken
     * at no price cannot be settled at one - calls.ts rejects it as `bad_price`.
     * So calling is off, and it says so, and the bank is untouched. */
    const p = el('p', 'l4-note');
    p.append(
      el('b', null, 'No price on this snap. '),
      document.createTextNode(
        'The tendency model is not loaded, so there are no odds to show and no call can be taken. '
        + 'Your ' + BALANCE_NOUN + ' are untouched and the drive chart, the board and the score are all still live.'),
    );
    card.appendChild(p);
  } else {
    card.appendChild(el('p', 'l4-note', modelLine(snap)));
  }

  /* ---- the band ---- */
  if (state === 'staked' && data.call) {
    card.appendChild(band('open',
      (data.call.side === 'run' ? 'Run' : 'Pass') + ' called',
      data.call.stake + ' ' + BALANCE_NOUN + ' at ' + multLabel(snap[data.call.side].payoutPerMarble)
        + ' · one call per snap, so this one is yours until it settles',
      '+' + data.call.returns));
  }
  if (state === 'settling' && data.call) {
    /* THE BOARD STAYS LEGIBLE. Armchair replaces it with a full panel reading
     * "PLAY IN PROGRESS · Your gameplay selection screen will be live at the end
     * of this play". The tiles above are still drawn, still priced, still
     * readable; only the clock changes what it is counting. */
    card.appendChild(band('open', 'Ball is snapped',
      'Your ' + data.call.side + ' call is locked at ' + multLabel(snap[data.call.side].payoutPerMarble)
        + ' · settling against the play',
      '+' + data.call.returns));
  }
  if (settled && data.call && data.settled) {
    const win = data.settled.landed;
    const yards = snap.playYards == null ? null : snap.playYards + ' yd';
    card.appendChild(band(win ? 'up' : 'down',
      (data.call.side === 'run' ? 'Run' : 'Pass') + (win ? ' landed' : ' missed'),
      [snap.playType, yards].filter(Boolean).join(' · ')
        + ' · ' + data.call.stake + ' ' + BALANCE_NOUN + ' at '
        + multLabel(snap[data.call.side].payoutPerMarble),
      signed(data.settled.delta)));
  }

  root.appendChild(card);

  /* ---- interaction ---- */

  const repriceTo = data.repriceTo;
  let showing = snap;

  const redrawTiles = () => {
    const pct = pctPair(noModel ? null : showing.run.p);
    swapPay(runTile, noModel ? null : showing.run, stake, pct.run);
    swapPay(passTile, noModel ? null : showing.pass, stake, pct.pass);
  };

  for (const c of chips) {
    c.addEventListener('click', () => {
      stake = Number(c.textContent);
      for (const o of chips) o.setAttribute('aria-pressed', String(Number(o.textContent) === stake));
      redrawTiles();
    });
  }

  if (interactive) {
    for (const t of [runTile, passTile]) {
      t.addEventListener('click', () => {
        /* A screen NEVER fetches and never owns the ledger. `call` goes to the
         * GameRoom over the socket (CONTRACT 8) and `call:ack` comes back; 7.4 is
         * enforced there, not here. This screen only makes the state legible. */
        root.dispatchEvent(new CustomEvent('ag:call', {
          bubbles: true,
          detail: { snapId: showing.snapId, side: t.dataset.side, stake },
        }));
      });
    }
  }

  /* ---- the snap clock, and the reprice ---- */

  const total = data.windowMs;
  const t0 = performance.now();
  let repriced = false;

  if (state === 'settling') {
    snapBar.dataset.mode = 'settling';
    clockEl.textContent = 'Snapped';
    fill.style.setProperty('--snap', '1');
  } else if (settled || noModel) {
    fill.style.setProperty('--snap', noModel ? '1' : '0');
    clockEl.textContent = settled ? 'Settled' : '—';
    if (noModel) snapBar.dataset.mode = 'settling';
  } else {
    /* Primed before the loop, for the same reason the payout is: a tab that never
     * gets a frame must still show a true number, not an empty one. */
    clockEl.textContent = Math.ceil(total / 1000) + 's';
    fill.style.setProperty('--snap', '1');
    const tick = (now) => {
      const left = Math.max(0, total - (now - t0));
      const k = left / total;
      fill.style.setProperty('--snap', String(k));
      const secs = Math.ceil(left / 1000);
      const shown = secs + 's';
      if (clockEl.textContent !== shown) clockEl.textContent = shown;
      const urgent = secs <= 5 ? '1' : '0';
      if (snapBar.dataset.urgent !== urgent) { snapBar.dataset.urgent = urgent; clockEl.dataset.urgent = urgent; }

      /* THE PRICE UPDATES WHILE THE DECISION IS OPEN. This is a real repricing
       * out of the fixture: at 3rd & 4 the model had run at 5.13x; a false start
       * moved the ball back five yards and made it 3rd & 9, and the run went to
       * the 6x cap. Two consecutive plays in one drive of one captured game. */
      if (repriceTo && !repriced && left < total * 0.45) {
        repriced = true;
        showing = repriceTo;
        redrawTiles();
        runTile.dataset.repriced = '1';
        passTile.dataset.repriced = '1';
        setTimeout(() => { delete runTile.dataset.repriced; delete passTile.dataset.repriced; }, 900);
        const sit = root.querySelector('.l4-sit-dd');
        if (sit) sit.textContent = repriceTo.downDistance || sit.textContent;
        const rest = root.querySelector('.l4-sit-rest');
        if (rest) rest.textContent = [repriceTo.spot, 'Q' + repriceTo.period + ' ' + repriceTo.clockDisplay].filter(Boolean).join(' · ');
        const note = card.querySelector('.l4-note');
        if (note) {
          note.textContent = '';
          note.append(el('b', null, 'Repriced · ' + (data.repriceBecause || 'Penalty') + '. '),
                      document.createTextNode(modelLine(repriceTo)));
        }
      }

      if (left <= 0) {
        clockEl.textContent = 'Closed';
        for (const t of [runTile, passTile]) { t.setAttribute('aria-disabled', 'true'); t.dataset.dimmed = '1'; }
        /* Loop, so the countdown and the reprice can both be watched in a static
         * preview. The real clock closes once and the DO sends the next offer. */
        setTimeout(() => render(root, data, state), 1200);
        return;
      }
      root._l4timer = requestAnimationFrame(tick);
    };
    root._l4timer = requestAnimationFrame(tick);
  }

  /* What the preview should be showing, so a screenshot can be checked against
   * it without reading the source. */
  root.dataset.priceOnTile = String(!noModel);
  root.dataset.snapId = snap.snapId;
}
