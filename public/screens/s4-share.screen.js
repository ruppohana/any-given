/* S4 - THE SHARE CARD.
 *
 * BAR: reference/sofascore-teardown/screens/IMG_5227.PNG - OPENED. What is in it:
 *   a white rounded dialog (~28px radius) centered over a dimmed standings table;
 *   a blue clip-art phone illustration at the top; the overline SCREENSHOT
 *   DETECTED in caps; the headline "Sending this to someone?"; body copy with the
 *   iOS share glyph set inline - "Tap [glyph] to share a formatted graphic with
 *   this screen's key info."; two actions bottom-right, CLOSE as bare text and
 *   SHARE as a filled blue button with the glyph again. Behind it, an ad rail for
 *   a Bitcoin exchange docked over the content.
 *
 * WHAT THE BAR GETS RIGHT AND WE KEEP: intercepting the screenshot event at all.
 * Every sports app receives it and nobody instruments it. Also the shape - one
 * overline, one question, one sentence, two actions, the destructive-free one on
 * the left.
 *
 * WHAT THE BAR GETS WRONG AND WE DO NOT:
 *   1. It shows a CLIP-ART PHONE. The user is being asked to trust an unseen
 *      graphic. We show the actual card, rendered, at thumbnail size, inside the
 *      dialog. The preview IS the argument.
 *   2. "this screen's key info" is a promise about a layout. Ours is a promise
 *      about a CLAIM - "you called pass on 3rd & 2 and it landed" - which is why
 *      it is worth sending. A standings table is a thing anybody can pull off
 *      ESPN. A called shot has a person attached to it.
 *
 * 🔴 THE SPOILER RULE. This app is deliberately behind the television. A card
 * carries a RESULT, which is fine - the sender already saw it, because they made
 * the call. What it may never carry is state the sender has NOT yet reached:
 * the live score, the running clock, the current win probability, the bank
 * balance as it stands now, a live board position. So NO SCORELINE APPEARS ON
 * ANY CARD IN ANY STATE, and `assertSpoilerSafe` below is run on every model
 * before it is drawn. It throws rather than degrading, because a spoiler that
 * ships silently is the failure this rule exists to prevent.
 *
 * 🔴 THE MARK IS NOT DRAWN. DESIGN-BRIEF section 15: the cockatoo does not exist,
 * the 120/60/40/29px measurement has never been run, and the brief may not assume
 * one. What is here is a DEFINED PLACEHOLDER SLOT at a named size, dashed, with
 * data-stub="mark". It is not a mark and must not be mistaken for one.
 *
 * Everything numeric on these cards comes from the three real captured games in
 * fixtures/. Nothing here is a written fixture.
 */
import { teamChip, applyTeamVars, tooClose, normalizeColor } from '../components/team-chip.js';
import { stateBlock, STATES_CSS } from '../components/states.js';
import { payoutLabel, signed, signClass } from '../components/fmt.js';

export const id = 's4-share';
export const title = 'The share card';
export const bar = 'reference/sofascore-teardown/screens/IMG_5227.PNG';

/* `prompt` is the interception itself - the thing the bar is a picture of.
 * `colors` is a PREVIEW-ONLY PROOF ROUTE, not a product state: it draws the same
 * card against a navy primary, a yellow primary, a null and a navy-on-navy pair,
 * all at thumbnail width, which is also the "look at it small" check. */
export const states = ['prompt', 'landed', 'missed', 'pool-result', 'loading', 'offline', 'error', 'colors'];

/* ------------------------------------------------------------------ 🔴 spoiler */

/** Keys that carry state the sender has not reached yet. A card may not hold one.
 *  This is a deny-list on the MODEL, checked before render, so a future edit that
 *  helpfully adds a scoreline fails loudly instead of shipping. */
export const FORBIDDEN_ON_CARD = [
  'homeScore', 'awayScore', 'score', 'scoreline', 'scores',
  'clockNow', 'liveClock', 'displayClock',
  'wp', 'winProbability', 'winProb',
  'balance', 'bankBalance', 'liveRank', 'liveBoard',
  'possession', 'nextPlay', 'currentDrive'
];

/** A scoreline is also a SHAPE - "34-27", "34 - 27", "34–27". Any string field
 *  matching this is a spoiler however it got there. */
export const SCORELINE_RE = /\b\d{1,3}\s*[-‒–—−]\s*\d{1,3}\b/;

export function assertSpoilerSafe(model, where) {
  const seen = new Set();
  (function walk(v, path) {
    if (v == null || seen.has(v)) return;
    if (typeof v === 'string') {
      if (SCORELINE_RE.test(v)) {
        throw new Error(`spoiler: scoreline in ${path} (${where || 'card'}): ${JSON.stringify(v)}`);
      }
      return;
    }
    if (typeof v !== 'object') return;
    seen.add(v);
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}[${i}]`)); return; }
    for (const k of Object.keys(v)) {
      if (FORBIDDEN_ON_CARD.includes(k)) {
        throw new Error(`spoiler: forbidden key '${k}' at ${path} (${where || 'card'})`);
      }
      walk(v[k], path ? path + '.' + k : k);
    }
  })(model, '');
  return model;
}

/* ------------------------------------------------------- reading a real game */

/** Every play in a captured ESPN game, flattened out of drives.previous. */
export function extractPlays(fixture) {
  const out = [];
  const drives = (fixture && fixture.drives && fixture.drives.previous) || [];
  for (const d of drives) for (const p of d.plays || []) out.push(p);
  return out;
}

/** run | pass | other, from ESPN's own play type text. Sacks and interceptions are
 *  pass plays - the call was pass and a pass was called, whatever happened next. */
export function sideOfPlay(play) {
  const t = (play && play.type && play.type.text) || '';
  if (/rush/i.test(t)) return 'run';
  if (/pass|reception|interception|sack/i.test(t)) return 'pass';
  return 'other';
}

/** The two teams in a captured game, resolved against fixtures/teams.json. */
export function gameTeams(fixture, teamsDb) {
  const comp = fixture.header.competitions[0];
  const by = {};
  for (const c of comp.competitors) by[c.homeAway] = teamsDb.teams[c.id];
  return { home: by.home, away: by.away, gameId: comp.id, dateUtc: comp.date };
}

/**
 * 🔴 A STUB OF src/lib/price.ts, and named as one.
 *
 * price.ts is the only producer of a CallOffer and it prices off a trained
 * tendency model that this browser preview has no access to (it is TypeScript,
 * and the model file is not a fixture). So the price on these cards is the
 * EMPIRICAL rate measured across the real plays of the real captured games -
 * a true number from captured data, computed the way price.ts computes p, but
 * off three games instead of a season.
 *
 * Confidence follows price.ts's rule and NOT |p - 0.5|: it is about the model's
 * CERTAINTY, which is sample count and back-off level. DEFAULT_MIN_SAMPLES is 30
 * and `confident` is 3x that.
 */
export function empiricalPrice(fixtures, ctx) {
  const down = ctx.down, maxDistance = ctx.maxDistance;
  let run = 0, pass = 0;
  for (const f of fixtures) {
    for (const p of extractPlays(f)) {
      const s = p.start || {};
      if (s.down !== down) continue;
      if (s.distance == null || s.distance > maxDistance) continue;
      const side = sideOfPlay(p);
      if (side === 'run') run++;
      else if (side === 'pass') pass++;
    }
  }
  const n = run + pass;
  const p = n ? pass / n : 0;
  const confidence = n >= 90 ? 'hi' : n >= 30 ? 'mid' : 'lo';
  return { p, n, run, pass, confidence, payoutPerMarble: Math.min(6, p > 0 ? 1 / p : 6) };
}

/** What a stake comes back as. Mirrors price.ts payoutFor: round(stake/p), and
 *  the cap is on the MULTIPLE, not on the stake. */
export function payoutFor(stake, p) {
  if (p == null) return stake;
  if (!(p > 0)) return stake * 6;
  return Math.min(stake * 6, Math.round(stake / p));
}

/** The invite code on the foot rail. 6 chars, URL-safe, NO VOWELS - the format
 *  the contract sets for a Pool id. 🔴 STUB: there is no captured pool, so this is
 *  derived deterministically from the play id rather than read. */
export function inviteCode(seed) {
  const A = 'BCDFGHJKLMNPQRSTVWXYZ23456789';
  let h = 2166136261;
  for (let i = 0; i < String(seed).length; i++) {
    h ^= String(seed).charCodeAt(i); h = Math.imul(h, 16777619) >>> 0;
  }
  let out = '';
  for (let i = 0; i < 6; i++) { out += A[h % A.length]; h = Math.floor(h / A.length) + i * 7919; }
  return out;
}

/**
 * 🔴 THE WORDMARK COMPLETION - undesigned in the brief, decided here, flagged in
 * the return.
 *
 * DESIGN-BRIEF section 15: the name is `Any Given…` with the single-character
 * ellipsis, the phrase completes itself and changes with the sport, and
 * "where the second half appears, at what size, and whether it moves" is the only
 * place in the product where the name explains itself - and nobody has designed
 * it.
 *
 * THE CHOICE MADE HERE, for the card only: the ellipsis is REPLACED IN PLACE by
 * the sport word, on one line, at the same size, set in --accent while the stem
 * stays --fg. It does not move, because a share card is a still image and motion
 * cannot be part of an answer that has to survive being a JPEG in a message
 * bubble. Coloring only the completion is what says "this half is the variable" -
 * a reader who sees two of these cards for two sports has been taught the naming
 * system without a word of explanation.
 */
export function wordmark(sport) {
  return { stem: 'Any Given', completion: COMPLETION[sport] || null, ellipsis: '…' };
}
export const COMPLETION = { football: 'Snap', basketball: 'Possession' };

/* --------------------------------------------------------------- the models */

/** A call card, built from ONE REAL PLAY in ONE REAL CAPTURED GAME. */
export function callCard(opts) {
  const play = opts.play, teams = opts.teams, price = opts.price;
  const called = opts.called;                       // what the user called
  const actual = sideOfPlay(play);                  // what the offense did
  const landed = called === actual;
  const stake = opts.stake;
  const delta = landed ? payoutFor(stake, price.p) - stake : -stake;
  const s = play.start || {};
  const offenseId = ((play.teamParticipants || []).find((t) => t.type === 'offense') || {}).id;
  const offense = teams.home && teams.home.id === offenseId ? teams.home : teams.away;
  const defense = offense === teams.home ? teams.away : teams.home;

  const model = {
    kind: 'call',
    outcome: landed ? 'landed' : 'missed',
    playId: play.id,
    wordmark: wordmark('football'),
    call: {
      called: called,
      actual: actual,
      situation: s.shortDownDistanceText || null,
      spot: s.possessionText || null,
      quarter: play.period ? 'Q' + play.period.number : null
    },
    price: {
      payout: payoutLabel(price.p),
      pPercent: Math.round(price.p * 100) + '% ' + called,
      confidence: price.confidence,
      n: price.n
    },
    result: {
      label: landed ? 'LANDED' : 'MISSED',
      delta: delta,
      stake: stake,
      /* SYMMETRIC. One sentence, one shape, the sign is the only difference. */
      line: landed
        ? `It was a ${actual}. ${stake} Marbles staked.`
        : `They ${actual === 'run' ? 'ran' : 'threw'}. ${stake} Marbles staked.`
    },
    proof: tidyPlayText(play.text),
    teams: { offense: offense, defense: defense },
    /* The code is the POOL's, not the play's - every card a user sends carries
     * the same invite, which is the whole point of a referral surface. */
    invite: inviteCode(opts.poolSeed || 'week1-pool')
  };
  return assertSpoilerSafe(model, 'call card');
}

/** A week's standing rather than a call. 🔴 The pool does NOT use Marbles - picks
 *  are free and the pool scores in points. Nothing on this card is a Marble and
 *  nothing on it may be summed with one. */
export function poolCard(opts) {
  const legs = opts.legs;   // [{ team, opponent, won }] from REAL final games
  const won = legs.filter((l) => l.won).length;
  const model = {
    kind: 'pool',
    outcome: 'pool-result',
    wordmark: wordmark('football'),
    week: opts.week,
    tally: { won: won, of: legs.length },
    legs: legs.map((l) => ({ team: l.team, opponent: l.opponent, won: l.won })),
    standing: opts.standing,       // { rank, of, weekPoints, movement } - STUB, see return
    invite: opts.invite
  };
  return assertSpoilerSafe(model, 'pool card');
}

/** ESPN play text carries formation prefixes and a parenthesized TACKLER at the
 *  end (requirement 7.2 - it is never the ball carrier). The card is a claim, not
 *  a box score, so the tackler and the huddle noise come off. */
export function tidyPlayText(text) {
  return String(text || '')
    .replace(/^\(\d{1,2}:\d{2}\)\s*/, '')
    .replace(/^(No Huddle-)?Shotgun\s*/i, '')
    .replace(/\s*\(#[^)]*\)/g, '')
    .replace(/\s*,?\s*1ST DOWN\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* -------------------------------------------------------------- preview data */

const GAMES = ['real-utep-at-ou', 'real-ball-at-osu', 'real-bois-at-ore'];

export async function previewData(fixtures) {
  const raw = {};
  for (const g of GAMES) raw[g] = await fixtures.load(g);
  const db = fixtures.teams;

  /* THE PRICE. Third down, two yards or fewer, measured across all three real
   * games: 6 passes, 9 runs, n=15. p(pass)=0.40 -> 2.50x, and n < 30 means the
   * model would have backed off, so the chip says LO. That is the model saying
   * it is guessing, which is exactly what makes a landed call worth sending. */
  const price = empiricalPrice(GAMES.map((g) => raw[g]), { down: 3, maxDistance: 2 });

  const ore = raw['real-bois-at-ore'];
  const oreTeams = gameTeams(ore, db);
  const plays = extractPlays(ore);

  /* TWO REAL PLAYS, ONE REAL GAME, THE SAME OFFENSE, THE SAME DOWN AND DISTANCE.
   * Chosen so that landed and missed are genuinely the same component with the
   * sign flipped, rather than two different situations flattered into a pair.
   *   401858433192  Q2  3rd & 2 at BOIS 42  pass complete to J.McClellan, 23 yds
   *   401858433765  Q4  3rd & 2 at BOIS 23  rush middle, 0 yards
   * Called PASS both times: one landed, one did not. */
  const landedPlay = plays.find((p) => p.id === '401858433192');
  const missedPlay = plays.find((p) => p.id === '401858433765');

  /* Three real finals, three real picks. One of them is wrong on purpose - a
   * clean sweep would never exercise the --down half of a symmetric component. */
  const legs = [
    poolLeg(raw['real-utep-at-ou'], db, 'home'),      // Oklahoma - correct
    poolLeg(raw['real-ball-at-osu'], db, 'home'),     // Ohio State - correct
    poolLeg(raw['real-bois-at-ore'], db, 'away')      // Boise State - wrong
  ];

  /* The color-survival set, taken from the real file rather than chosen to
   * flatter: a navy primary, a yellow primary, a team with nothing at all, and
   * the pair the live board never had to survive - navy against navy. */
  const T = db.teams;
  const palette = [
    { label: 'green / navy - the real game', a: T['2483'], b: T['68'] },
    { label: 'yellow primary', a: T['9'], b: T['68'] },
    { label: 'null primary - no color captured', a: nullTeam(T), b: T['2483'] },
    { label: 'navy on navy', a: T['68'], b: navyLike(T, T['68']) }
  ];

  return {
    price: price,
    landed: landedPlay && callCard({ play: landedPlay, teams: oreTeams, price: price, called: 'pass', stake: 25 }),
    missed: missedPlay && callCard({ play: missedPlay, teams: oreTeams, price: price, called: 'pass', stake: 25 }),
    pool: poolCard({
      week: 1,
      legs: legs,
      /* 🔴 STUB - there is no captured pool anywhere in fixtures/. The rank, the
       * member count and the points are the only invented numbers on any card in
       * this screen and they are named as such in the return. */
      standing: { rank: 3, of: 9, weekPoints: 2, movement: -1, stub: true },
      invite: inviteCode('week1-pool')
    }),
    palette: palette,
    teamsTotal: Object.keys(T).length
  };
}

function poolLeg(fixture, db, pickSide) {
  const comp = fixture.header.competitions[0];
  const byId = {};
  for (const c of comp.competitors) byId[c.homeAway] = c;
  const picked = byId[pickSide], other = byId[pickSide === 'home' ? 'away' : 'home'];
  /* The scores are read to DECIDE the leg and are then thrown away. They never
   * reach the model - assertSpoilerSafe would refuse it if they did. */
  const won = Number(picked.score) > Number(other.score);
  return { team: db.teams[picked.id], opponent: db.teams[other.id], won: won };
}

function nullTeam(T) {
  for (const t of Object.values(T)) if (!normalizeColor(t.primary)) return t;
  return null;
}
function navyLike(T, ref) {
  const a = normalizeColor(ref.primary);
  for (const t of Object.values(T)) {
    if (t.id === ref.id) continue;
    const b = normalizeColor(t.primary);
    if (b && tooClose(a, b, 60)) return t;
  }
  return ref;
}

/* ------------------------------------------------------------- svg plumbing */

const NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs, text) {
  const e = document.createElementNS(NS, tag);
  for (const k of Object.keys(attrs || {})) e.setAttribute(k, String(attrs[k]));
  if (text != null) e.textContent = text;
  return e;
}
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function rule(x, y, w) {
  return s('rect', { x: x, y: y, width: w, height: 1, fill: 'var(--line)' });
}

/** SVG text does not wrap. Budgeting by character count is crude and it is what
 *  keeps the proof line from running off a 250px-wide message bubble. */
export function wrapText(str, maxChars) {
  const words = String(str).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur) { cur = w; continue; }
    if ((cur + ' ' + w).length > maxChars) { lines.push(cur); cur = w; }
    else cur += ' ' + w;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** The two-color chip, lifted out of the shared component and nested into the
 *  card's own SVG. teamChip owns the geometry, the hairline, the dashed ring for
 *  a team with no color and the adjacency check - none of that is re-implemented
 *  here, which is the whole reason the component is shared. */
function chipInto(g, team, x, y, size, adjacentTo) {
  const wrap = teamChip(team, { withAbbrev: false, size: size, adjacentTo: adjacentTo });
  const mark = wrap.querySelector('svg');
  applyTeamVars(mark, team);
  mark.setAttribute('x', String(x));
  mark.setAttribute('y', String(y));
  mark.setAttribute('width', String(size));
  mark.setAttribute('height', String(size));
  g.appendChild(mark);
  const ab = s('text', {
    x: x + size / 2, y: y + size + 26, 'text-anchor': 'middle',
    class: 'num s4-abbrev', fill: normalizeColor(team && team.primary) ? 'var(--fg)' : 'var(--dim)'
  }, (team && team.abbrev) || '—');
  g.appendChild(ab);
  return wrap.dataset.adjacentClash === 'true';
}

/** 🔴 THE MARK DOES NOT EXIST. This is a slot, not a drawing.
 *  DESIGN-BRIEF section 15: the cockatoo is undrawn, the 120/60/40/29px
 *  measurement has never been run, and the undrawn mark blocks five things at
 *  once - the app icon, the store listing, the splash, the badge ring and THIS
 *  CARD. Do not fill this in without the drawing and the measurement. */
function markSlot(g, x, y, size) {
  const box = s('rect', {
    x: x, y: y, width: size, height: size, rx: Math.round(size * 0.22),
    fill: 'none', stroke: 'var(--line)', 'stroke-width': 2, 'stroke-dasharray': '8 6'
  });
  box.dataset.stub = 'mark';
  g.appendChild(box);
  g.appendChild(s('text', {
    x: x + size / 2, y: y + size / 2 + 9, 'text-anchor': 'middle',
    class: 's4-slot', fill: 'var(--dim)'
  }, 'MARK'));
}

function wordmarkInto(g, wm, x, baseline, size) {
  const t = s('text', { x: x, y: baseline, class: 's4-wordmark', 'font-size': size, fill: 'var(--fg)' });
  t.appendChild(s('tspan', {}, wm.stem + ' '));
  /* The completion is the variable half, so it is the half that carries the
   * accent. --accent, never --maroon: the token swaps on dark. */
  t.appendChild(s('tspan', { fill: 'var(--accent)' }, wm.completion || wm.ellipsis));
  g.appendChild(t);
  return t;
}

/* ------------------------------------------------------------------ the card */

export const CARD_W = 1080;
export const CARD_H = 1350;   // 4:5. The shape a sent image is looked at in.
const PAD = 72;
const INNER = CARD_W - PAD * 2;

/**
 * THE CARD. One inline <svg>, so it is a single serializable object - which is
 * what a share card has to be. No canvas, no chart library, no font file, no CDN,
 * no <image>, no logo. Type, hairlines and two team colors.
 */
export function cardSvg(model) {
  assertSpoilerSafe(model, 'render');
  const svg = s('svg', {
    viewBox: `0 0 ${CARD_W} ${CARD_H}`,
    class: 's4-card',
    role: 'img',
    'data-outcome': model.outcome,
    xmlns: NS
  });
  svg.appendChild(s('title', {}, cardAlt(model)));

  svg.appendChild(s('rect', {
    x: 1, y: 1, width: CARD_W - 2, height: CARD_H - 2, rx: 28,
    fill: 'var(--card)', stroke: 'var(--line)', 'stroke-width': 2
  }));

  /* ---- header rail: identity left, the two teams right ---- */
  /* 🔴 NO MARK SLOT. Jason, 2026-09-08: "Wordmark, yes." The cockatoo is dead and
   * the wordmark IS the mark, so the card no longer reserves a square for a bird
   * nobody was going to draw - the name takes the space it was holding. */
  wordmarkInto(svg, model.wordmark, PAD, 128, 62);

  /* THE CHIPS BELONG TO A CALL CARD ONLY. A call is about one game and naming its
   * two teams is the point; a week card is about seven, and drawing the first
   * leg's pair in the header reads as though the card is about that game. It was
   * drawn that way first and it was wrong on screen. */
  if (model.kind === 'call') {
    const teams = [model.teams.offense, model.teams.defense];
    const clashed = [
      chipInto(svg, teams[0], CARD_W - PAD - 148, 62, 60, teams[1]),
      chipInto(svg, teams[1], CARD_W - PAD - 60, 62, 60, teams[0])
    ];
    /* When two primaries are within the chip's own distance threshold, the shared
     * component sets data-adjacent-clash and its CSS answer is an outline - which
     * an SVG nested inside another SVG does not get. So the card answers it the
     * way the card can: a hairline between them. Navy on navy happens constantly. */
    if (clashed.some(Boolean)) {
      svg.appendChild(s('rect', { x: CARD_W - PAD - 76, y: 62, width: 1, height: 60, fill: 'var(--line)' }));
    }
  } else {
    svg.appendChild(s('text', {
      x: CARD_W - PAD, y: 118, 'text-anchor': 'end', class: 's4-over', fill: 'var(--dim)'
    }, 'WEEK ' + model.week));
  }

  svg.appendChild(rule(PAD, 186, INNER));

  if (model.kind === 'call') callBody(svg, model);
  else poolBody(svg, model);

  /* ---- foot rail: the referral surface ---- */
  svg.appendChild(rule(PAD, CARD_H - 132, INNER));
  svg.appendChild(s('text', {
    x: PAD, y: CARD_H - 76, class: 's4-foot num', fill: 'var(--fg)'
  }, 'anygiven.app/j/' + model.invite));
  svg.appendChild(s('text', {
    x: CARD_W - PAD, y: CARD_H - 76, 'text-anchor': 'end', class: 's4-foot-dim', fill: 'var(--dim)'
  }, 'Free. Nothing here is for sale.'));

  return svg;
}

function callBody(svg, m) {
  svg.appendChild(s('text', { x: PAD, y: 262, class: 's4-over', fill: 'var(--dim)' }, 'THE CALL'));

  /* THE CLAIM, and it is the largest thing on the card because it is the reason
   * the card is worth sending. At 250px wide in a message bubble this is still
   * ~37px of type - the one thing that survives the thumbnail. */
  svg.appendChild(s('text', { x: PAD, y: 400, class: 's4-claim', fill: 'var(--fg)' },
    m.call.called.toUpperCase()));

  const bits = [m.call.situation, m.call.quarter, m.call.spot ? 'ball on ' + m.call.spot : null]
    .filter(Boolean).join('  ·  ');
  svg.appendChild(s('text', { x: PAD, y: 462, class: 's4-sit num', fill: 'var(--dim)' }, bits));

  /* ---- the price rail. THE PRICE IS ON THE TILE BEFORE THE TAP, and it is on
   * the card afterwards for the same reason: 2.50x is the model saying you were
   * probably wrong. Without it "I called pass" is a coin flip somebody bragged
   * about. ---- */
  svg.appendChild(rule(PAD, 520, INNER));
  /* TWO columns and a chip, not three columns. Three was drawn first and at 393px
   * "THE MODEL SAID" ran straight through "SAMPLE" - a collision no test in this
   * repo could have seen, and requirement 7.5 arriving on schedule. */
  svg.appendChild(s('rect', { x: 502, y: 540, width: 1, height: 108, fill: 'var(--line)' }));
  svg.appendChild(s('text', { x: PAD, y: 580, class: 's4-over', fill: 'var(--dim)' }, 'PRICE'));
  svg.appendChild(s('text', { x: PAD, y: 636, class: 's4-fig num', fill: 'var(--fg)' }, m.price.payout));
  svg.appendChild(s('text', { x: 526, y: 580, class: 's4-over', fill: 'var(--dim)' }, 'THE MODEL SAID'));
  svg.appendChild(s('text', { x: 526, y: 636, class: 's4-fig num', fill: 'var(--fg)' }, m.price.pPercent));

  /* The confidence chip. Three steps, fixed scale, both themes - never a ramp,
   * and never team color. LO is a feature: the model is allowed to say it was
   * guessing, and on a landed call that is the whole boast - which is why the
   * sample size sits next to it rather than in a column of its own. */
  const cw = 92, cx = CARD_W - PAD - cw;
  svg.appendChild(s('text', {
    x: cx - 20, y: 630, 'text-anchor': 'end', class: 's4-sit num', fill: 'var(--dim)'
  }, 'n ' + m.price.n));
  svg.appendChild(s('rect', {
    x: cx, y: 596, width: cw, height: 48, rx: 10,
    fill: `var(--c-${m.price.confidence}-bg)`
  }));
  svg.appendChild(s('text', {
    x: cx + cw / 2, y: 628, 'text-anchor': 'middle', class: 's4-chip',
    fill: `var(--c-${m.price.confidence}-fg)`
  }, m.price.confidence.toUpperCase()));
  svg.appendChild(rule(PAD, 688, INNER));

  /* ---- the outcome. SYMMETRIC: one component, one geometry, one type size.
   * A miss is as real a card as a landed call and is drawn identically. The sign
   * and the fixed --up/--down scale are the only difference. Never team color. ---- */
  const up = m.result.delta > 0;
  const tone = up ? 'var(--up)' : 'var(--down)';
  svg.appendChild(s('rect', {
    x: PAD, y: 730, width: INNER, height: 216, rx: 20,
    fill: 'none', stroke: tone, 'stroke-width': 2
  }));
  svg.appendChild(s('text', { x: PAD + 36, y: 836, class: 's4-outcome', fill: tone }, m.result.label));
  svg.appendChild(s('text', {
    x: CARD_W - PAD - 36, y: 836, 'text-anchor': 'end', class: 's4-delta num', fill: tone
  }, signed(m.result.delta)));
  svg.appendChild(s('text', { x: PAD + 36, y: 896, class: 's4-sit num', fill: 'var(--dim)' }, m.result.line));

  /* ---- the proof. The real play text, tackler stripped (7.2). ---- */
  svg.appendChild(s('text', { x: PAD, y: 1024, class: 's4-over', fill: 'var(--dim)' }, 'WHAT HAPPENED'));
  wrapText(m.proof, 46).slice(0, 3).forEach(function (line, i) {
    svg.appendChild(s('text', { x: PAD, y: 1076 + i * 44, class: 's4-proof num', fill: 'var(--fg)' }, line));
  });
}

function poolBody(svg, m) {
  svg.appendChild(s('text', { x: PAD, y: 262, class: 's4-over', fill: 'var(--dim)' }, 'THE WEEK'));
  svg.appendChild(s('text', { x: PAD, y: 400, class: 's4-claim num', fill: 'var(--fg)' },
    m.tally.won + ' of ' + m.tally.of));
  svg.appendChild(s('text', { x: PAD, y: 462, class: 's4-sit', fill: 'var(--dim)' }, 'picks correct'));
  svg.appendChild(rule(PAD, 520, INNER));

  m.legs.forEach(function (leg, i) {
    const y = 592 + i * 112;
    const g = s('g', {});
    chipInto(g, leg.team, PAD, y, 44, leg.opponent);
    svg.appendChild(g);
    svg.appendChild(s('text', { x: PAD + 76, y: y + 32, class: 's4-leg', fill: 'var(--fg)' },
      (leg.team && leg.team.short) || '—'));
    /* 'over X' is a claim about the result and it was FALSE on a lost leg - the
     * first draft said "Boise St / over Oregon" on a game Boise State lost. The
     * preposition carries the outcome, so it has to follow it. */
    svg.appendChild(s('text', { x: PAD + 76, y: y + 68, class: 's4-legsub', fill: 'var(--dim)' },
      (leg.won ? 'over ' : 'lost to ') + ((leg.opponent && leg.opponent.short) || '—')));
    /* Same fixed scale as a call result. A pool leg and a Marble stake never sum,
     * and they never share a quantity - but they do share the up/down language,
     * because that is presentation, not a number. */
    const tone = leg.won ? 'var(--up)' : 'var(--down)';
    svg.appendChild(s('text', {
      x: CARD_W - PAD, y: y + 46, 'text-anchor': 'end', class: 's4-legresult', fill: tone
    }, leg.won ? 'WON' : 'LOST'));
    if (i < m.legs.length - 1) svg.appendChild(rule(PAD, y + 88, INNER));
  });

  svg.appendChild(rule(PAD, 948, INNER));
  /* 🔴 POINTS, NEVER MARBLES. The pool does not use Marbles - picks are free -
   * and a pool score and a stake profit are never summed anywhere. */
  svg.appendChild(s('text', { x: PAD, y: 1016, class: 's4-over', fill: 'var(--dim)' }, 'IN THE POOL'));
  svg.appendChild(s('text', { x: PAD, y: 1092, class: 's4-fig num', fill: 'var(--fg)' },
    ordinal(m.standing.rank) + ' of ' + m.standing.of));
  svg.appendChild(s('text', {
    x: CARD_W - PAD, y: 1092, 'text-anchor': 'end', class: 's4-fig num', fill: 'var(--fg)'
  }, m.standing.weekPoints + ' pts'));
  /* The movement gets words. '2 pts  -1' read as though the week were worth minus
   * one point, which is exactly the pool-score-and-stake conflation this project
   * bans, arriving through typography instead of arithmetic. */
  const mv = m.standing.movement;
  svg.appendChild(s('text', {
    x: PAD, y: 1140, class: 's4-legsub',
    fill: mv > 0 ? 'var(--up)' : mv < 0 ? 'var(--down)' : 'var(--dim)'
  }, mv === 0 ? 'held position this week'
    : (mv > 0 ? 'up ' : 'down ') + Math.abs(mv) + (Math.abs(mv) === 1 ? ' place' : ' places') + ' this week'));
}

function ordinal(n) {
  const t = n % 100;
  if (t >= 11 && t <= 13) return n + 'th';
  return n + ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
}

/** The card said out loud. It is the accessible name AND the text a screen reader
 *  or a paste gets, because an image of a claim that cannot be read back is half
 *  a claim. */
export function cardAlt(m) {
  if (m.kind === 'pool') {
    return `Any Given ${m.wordmark.completion}. Week ${m.week}: ${m.tally.won} of ${m.tally.of} picks correct, ` +
           `${ordinal(m.standing.rank)} of ${m.standing.of} in the pool.`;
  }
  return `Any Given ${m.wordmark.completion}. Called ${m.call.called} on ${m.call.situation} ` +
         `at ${m.price.payout}. ${m.result.label}, ${signed(m.result.delta)} Marbles.`;
}

/* ---------------------------------------------------------- the interception */

/**
 * THE PROMPT - the bar, IMG_5227, done our way.
 *
 * Their dialog: clip-art phone, "Sending this to someone?", "Tap [glyph] to share
 * a formatted graphic with this screen's key info.", CLOSE / SHARE.
 * Ours: the same shape, and the illustration replaced by THE ACTUAL CARD. The
 * user is not asked to trust a description of a graphic; they are shown it.
 */
function promptDialog(model, onShare) {
  const scrim = el('div', 's4-scrim');
  const dlg = el('div', 's4-dialog card');
  dlg.setAttribute('role', 'dialog');
  dlg.setAttribute('aria-modal', 'true');
  dlg.setAttribute('aria-labelledby', 's4-dlg-h');

  const thumb = el('div', 's4-thumb');
  if (model) thumb.appendChild(cardSvg(model));
  else thumb.appendChild(el('div', 's4-thumb-empty'));
  dlg.appendChild(thumb);

  dlg.appendChild(el('p', 's4-over-html', 'SCREENSHOT DETECTED'));
  const h = el('h2', 's4-dlg-h', 'Send the card, not the grab.');
  h.id = 's4-dlg-h';
  dlg.appendChild(h);
  /* THE COPY IS THE DIFFERENCE. Theirs promises "this screen's key info" - a
   * layout. Ours names the claim, because a called shot has a person attached to
   * it and a standings table does not. */
  dlg.appendChild(el('p', 's4-dlg-b',
    'You called ' + (model ? model.call.called : 'the play') + ' at ' +
    (model ? model.price.payout : '—') + '. The card carries the call, the price and what happened — and nothing that is still live.'));

  const acts = el('div', 's4-acts');
  const close = el('button', 's4-btn s4-btn-quiet', 'Not now');
  const share = el('button', 's4-btn s4-btn-go', 'Share the card');
  if (onShare) share.addEventListener('click', onShare);
  acts.append(close, share);
  dlg.appendChild(acts);

  scrim.appendChild(dlg);
  return scrim;
}

/* ------------------------------------------------------------------- render */

export function render(root, data, state) {
  root.innerHTML = '';
  root.classList.add('scr-s4-share');
  const style = document.createElement('style');
  style.textContent = STATES_CSS;
  root.appendChild(style);

  const model = state === 'missed' ? (data && data.missed)
    : state === 'pool-result' ? (data && data.pool)
      : (data && data.landed);

  if (state === 'prompt') {
    const behind = el('div', 's4-behind');
    behind.dataset.stub = 'the screen underneath';
    for (let i = 0; i < 5; i++) behind.appendChild(el('div', 's4-behind-row'));
    root.appendChild(behind);
    root.appendChild(promptDialog(model));
    return;
  }

  if (state === 'loading') {
    /* The skeleton is the CARD'S OWN SHAPE at the card's own aspect, so nothing
     * jumps when it arrives - the same argument as tabular numbers. */
    const frame = el('div', 's4-frame s4-frame-skeleton');
    root.appendChild(frame);
    root.appendChild(stateBlock('loading', { rows: 2, body: 'Composing the card…' }));
    return;
  }

  if (state === 'offline') {
    /* 🟢 OFFLINE IS NOT A DEAD END HERE, and that is the design decision.
     * The card is built entirely from a call that has already settled and that
     * this phone already holds. Nothing about it needs the socket. So the card
     * renders, and the screen says plainly what is missing rather than pretending
     * the feature is broken - which is the trust decision section 8 asks for. */
    if (model) root.appendChild(frameFor(model));
    root.appendChild(stateBlock('offline', {
      title: 'Offline — the card still works',
      body: 'It is built from a call that already settled on this phone. Your board position will catch up when the connection does.',
      since: Date.now() - 47000,
      action: { label: 'Share it anyway' }
    }));
    return;
  }

  if (state === 'error') {
    root.appendChild(stateBlock('error', {
      title: 'We could not build that card',
      body: 'The moment you screenshotted has no settled call on it. Nothing you called has been lost, and your own screenshot is still in Photos.',
      action: { label: 'Back to the game' }
    }));
    return;
  }

  if (state === 'colors') {
    /* PREVIEW-ONLY PROOF ROUTE. The same card, four times, at 240px - which is
     * roughly the width a sent image is looked at in a message bubble. It is the
     * team-color survival check and the look-at-it-small check in one place. */
    const note = el('p', 's4-note',
      'Proof route, not a product state. The same card against a navy primary, a yellow primary, a team with no captured color, and navy on navy — all at 240px, which is about the width a sent image is actually looked at.');
    root.appendChild(note);
    const grid = el('div', 's4-grid');
    for (const p of (data.palette || [])) {
      if (!p.a || !p.b) continue;
      const cell = el('div', 's4-cell');
      cell.appendChild(el('p', 's4-cell-label', p.label));
      const m = JSON.parse(JSON.stringify({ ...model, teams: undefined, legs: undefined }));
      m.teams = { offense: p.a, defense: p.b };
      const f = el('div', 's4-frame s4-frame-small');
      f.appendChild(cardSvg(m));
      cell.appendChild(f);
      grid.appendChild(cell);
    }
    root.appendChild(grid);
    return;
  }

  /* landed | missed | pool-result */
  if (!model) { root.appendChild(stateBlock('error', { body: 'No card model.' })); return; }
  root.appendChild(frameFor(model));

  const alt = el('p', 's4-alt', cardAlt(model));
  root.appendChild(alt);

  const acts = el('div', 's4-acts s4-acts-page');
  acts.append(
    el('button', 's4-btn s4-btn-quiet', 'Not now'),
    el('button', 's4-btn s4-btn-go', 'Share the card')
  );
  root.appendChild(acts);
}

function frameFor(model) {
  const f = el('div', 's4-frame');
  f.appendChild(cardSvg(model));
  return f;
}
