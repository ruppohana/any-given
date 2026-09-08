/* L6 - THE LIVE BOARD AND THE BADGE CASE.
 *
 * 🔴 THIS IS THE MARBLES BOARD. IT IS NOT THE POOL BOARD.
 *   Its row type is `LiveStandingsRow` from src/lib/types.ts - balance, start,
 *   profit, committed, calls, landed, missed, voided, streak. `StandingsRow` is
 *   the other board and carries weekPoints / seasonPoints / parlayPoints.
 *   THE TWO NEVER SUM, and they were deliberately given no shared quantity so
 *   that nothing on this screen CAN sum them. Nothing in this file reads,
 *   writes or renders a pool point; there is no field here to put one in.
 *
 * 🔴 IT RANKS ON PROFIT - `balance - start` - NEVER ON BALANCE.
 *   A referral buys a deeper bench and never a place. This screen does not sort
 *   and does not rank: `src/lib/board.ts` does both, was verified identical to
 *   `sports-live/ncaalive/board.py` on a real replay, and IS IMPORTED HERE
 *   rather than reimplemented (see `loadBoard` below for how a browser module
 *   imports a TypeScript one). `render()` draws `data.rows` in the order it was
 *   given, and the one place a figure gets the largest type on screen is
 *   PROFIT, because a board whose biggest number is the pile argues against its
 *   own sort key.
 *
 * 🔴 The bank refills every game. Nobody is eliminated, so no row on this board
 *   is ever drawn as out, spent, or locked. A balance of zero is a row like any
 *   other.
 *
 * 🔴 The balance is Marbles. Never credits, coins, top-up, purchase, buy,
 *   continue or refill.
 *
 * BARS, both opened before a line was written:
 *   1. `python tools/preview.py fixtures/real-utep-at-ou-260905-final.json
 *      --fresh --rich` - the reference implementation's own board and badge
 *      case, at 393px. Its board is rank / WHO / CALLED / MADE with the self
 *      row lit and the line "Ranked on what you made, not what you hold".
 *      Its badge case is five families of three, 3-across, locked drawn as the
 *      same mark in outline. MEASURED THERE: the tier pips are 0.95r on a
 *      24-unit box, which at 34px is a 1.3px dot - they are not readable, and
 *      they are the only thing separating bronze from silver. This screen keeps
 *      tier in the pips and moves them out from under the glyph into their own
 *      row beneath the disc, where they can be seen.
 *   2. reference/sofascore-teardown/screens/IMG_5224..5228.PNG - standings as a
 *      PLAIN RANKED TABLE (rank, identity, right-aligned numeric columns under
 *      micro uppercase headers, the followed row tinted, hairlines not cards),
 *      and "Recent form" as FIVE COLORED SCORE CHIPS. The chips are denser than
 *      any table row and they are the one thing on that screen a table cannot
 *      do, so the self card here carries the same idea with the viewer's own
 *      last five settled calls.
 *
 * NOT MINE TO FIX, recorded: the reference's leaderboard is PER-SERVER - two
 * people on one Wi-Fi share a board and the world does not. Real multiplayer
 * needs a host, which is what the Durable Object is for. This screen renders a
 * board; it does not decide where the board lives.
 */
import { stateBlock, STATES_CSS } from '/components/states.js';
import { teamChip, TEAM_CHIP_CSS, teamVars } from '/components/team-chip.js';
import { dash, signed, signClass } from '/components/fmt.js';

export const id = 'l6-board';
export const title = 'The live board and the badge case';
export const bar = 'reference/sofascore-teardown/screens/IMG_5226.PNG';

/* Every state is a route. `earned` and `locked` are NOT routes: the badge case
 * shows both at once in every state, on purpose - a locked tier draws the same
 * mark as an outline, so seeing them side by side IS the design. `just-unlocked`
 * is a route because it is the only one that changes the page. */
export const states = [
  'ready', 'alone', 'settling', 'final', 'just-unlocked',
  'empty', 'loading', 'offline', 'error'
];

/* ------------------------------------------------------------------ board.ts
 * A browser ES module cannot import a .ts file: the preview server serves it as
 * application/octet-stream and strict MIME checking refuses it as a module. So
 * the source is FETCHED AND TYPE-STRIPPED, then imported as a blob module. This
 * is still `src/lib/board.ts` - the live file, not a copy of its logic - and
 * `tests/l6-board.test.mjs` asserts that the stripped module's `computeBoard`
 * is byte-identical to the real module's on the real fixture replay, so a strip
 * that mangles anything fails the test rather than quietly reordering a board.
 *
 * PREVIEW ONLY. In production `GameRoom` calls `computeBoard` on the server and
 * ships `LiveStandingsRow[]` over the §8 `board` event; `render()` never sees
 * this code path. See COULD NOT CLOSE - the honest fix is a .js twin or a MIME
 * entry, and both are session-owned files. */
export function stripTypes(src) {
  let s = src;

  // 1. `type X = ...;` / `export type X = ...;`, one line or many.
  const keep = [];
  let inType = false, depth = 0;
  for (const ln of s.split('\n')) {
    if (!inType && /^\s*(export\s+)?type\s+[A-Za-z_$][\w$]*\s*=/.test(ln)) { inType = true; depth = 0; }
    if (inType) {
      for (const ch of ln) {
        if (ch === '{' || ch === '(' || ch === '[') depth++;
        else if (ch === '}' || ch === ')' || ch === ']') depth--;
      }
      if (depth <= 0 && /;\s*$/.test(ln)) inType = false;
      continue;
    }
    keep.push(ln);
  }
  s = keep.join('\n');

  // 2. `} satisfies LiveStandingsRow;`
  s = s.replace(/\s+satisfies\s+[A-Za-z_$][\w$]*(\[\])?/g, '');

  // 3. parameter and return annotations on `function` declarations.
  const FN = /\bfunction\s+[A-Za-z_$][\w$]*\s*\(/g;
  let out = '', cut = 0, m;
  while ((m = FN.exec(s))) {
    const open = m.index + m[0].length - 1;
    if (open < cut) continue;
    let d = 1, j = open + 1;
    while (j < s.length && d > 0) { const c = s[j]; if (c === '(') d++; else if (c === ')') d--; j++; }
    const close = j - 1;

    const parts = []; let cur = '', dd = 0;
    for (const c of s.slice(open + 1, close)) {
      if ('([{<'.indexOf(c) >= 0) dd++; else if (')]}>'.indexOf(c) >= 0) dd--;
      if (c === ',' && dd === 0) { parts.push(cur); cur = ''; } else cur += c;
    }
    parts.push(cur);
    const params = parts.map((p) => {
      const mm = /^(\s*)([A-Za-z_$][\w$]*)\s*(?::[^=]*?)?(\s*=[\s\S]*)?$/.exec(p);
      return mm ? mm[1] + mm[2] + (mm[3] || '') : p;
    }).join(',');

    let k = close + 1, tail = '';
    while (k < s.length && /\s/.test(s[k])) k++;
    if (s[k] === ':') { while (k < s.length && s[k] !== '{') k++; tail = ' '; }
    else k = close + 1;

    out += s.slice(cut, open + 1) + params + ')' + tail;
    cut = k;
    FN.lastIndex = k;
  }
  return out + s.slice(cut);
}

let BOARD_MODULE = null;
async function loadBoard() {
  if (BOARD_MODULE) return BOARD_MODULE;
  const src = await (await fetch('/src/lib/board.ts')).text();
  const url = URL.createObjectURL(new Blob([stripTypes(src)], { type: 'text/javascript' }));
  BOARD_MODULE = await import(url);
  return BOARD_MODULE;
}

/* ------------------------------------------------------------------ badges
 * Anatomy: SHARED RING · filled glyph · TIER PIPS · name beneath.
 *
 * 🔴 TIER IS IN THE PIPS AND NEVER IN THE RING. Putting tier in the ring was the
 * original design and it cost the set its only constant - bronze against silver
 * at 34px is two grays, and one shared ring is what makes fifteen drawings read
 * as one set (Audible's badge case does exactly this; see
 * docs/design/badges-audible-reference-2026-09-06.md).
 *
 * 🔴 THE METALS ARE A FIXED SCALE AND ARE NOT TEAM DATA, and neither are the
 * family fills. A badge case has to sit next to 760 possible primaries without
 * arguing with any of them, so nothing in this block reads --accent, --team-a
 * or --team-b. `server.py:2556` says it in the same words.
 *
 * FIVE FAMILIES OF THREE, not fifteen one-shots: a badge you have already earned
 * still has somewhere to go.
 *
 * 🔴 THE NAMES BELOW ARE THE REFERENCE'S OWN AND ARE DELIBERATELY UNCHANGED.
 * They are functional labels - Game winner, Top five, Day winner, Crazy call,
 * Recruiter - and replacing them is the highest-value change available to the
 * badge case, needs no code, and is NOT a sub-agent's call to make silently.
 * Proposals are in this piece's return, not in this file. */
const FAMILIES = [
  ['win',   'Game winner', [1, 5, 20],  (n) => `Win ${n} game board${n === 1 ? '' : 's'}`],
  ['top',   'Top five',    [3, 15, 50], (n) => `Finish top five ${n} time${n === 1 ? '' : 's'}`],
  ['day',   'Day winner',  [1, 5, 15],  (n) => `Win ${n} day${n === 1 ? '' : 's'} on average, three games minimum`],
  ['crazy', 'Crazy call',  [1, 10, 40], (n) => `Land ${n} big call${n === 1 ? '' : 's'} the model gave under 25%`],
  ['ref',   'Recruiter',   [1, 3, 5],   (n) => `${n} friend${n === 1 ? '' : 's'} playing on your link`]
];
const TIERS = ['Bronze', 'Silver', 'Gold'];

/** One fill per family. It carries no meaning - it is there so five families
 *  read as five objects rather than fifteen variations of one medal. */
const FAMILY_FILL = { win: '#E4572E', top: '#17A2A2', day: '#8A9A3B', crazy: '#6C4AB6', ref: '#C0398C' };
/** THE CONSTANT. Every badge in the set, every tier, earned or not. */
const BADGE_RING = '#E0A93B';
/** Bronze / Silver / Gold. Fixed scale. Never team color. */
const METAL = ['#A9714B', '#AEB6BC', '#E0A93B'];

/** Concrete objects, never diagrams - a cup, a podium, a sun, a bolt, two rings.
 *  Drawn on a 24-wide box centered at 12,12 so the pip row can live below it. */
/* THE OBJECTS. Redrawn 2026-09-08 to Jason's reference sheets: solid filled
 * forms - trophy, rosette, medal, shield, laurel - not single-stroke outlines,
 * and the TIER IS A NUMERAL INSIDE THE OBJECT rather than a row of pips.
 *
 * 🔴 That last part contradicts badges-audible-reference's "pips carry tier", and
 * it is a measurement rather than a preference: L6 measured the reference's pips
 * at 2.69px across at 34px, and moving them to their own row only got them to
 * 4.8px. A numeral inside a solid form is legible at 34px; two dots of different
 * gray are not. The rule that survives is the one that matters - TIER IS NEVER IN
 * THE RING - and the ring is still the constant across all fifteen.
 *
 * Every path is drawn in a 24x24 box, filled, no stroke, so it reads as a
 * silhouette at a leaderboard pin's 17px and holds detail at the case's 34px. */
function badgeGlyph(key) {
  switch (key) {
    case 'win':   // a cup - won the room
      return '<path d="M7.6 4h8.8v4.6a4.4 4.4 0 0 1-8.8 0V4Z"/>'
           + '<path d="M7.6 5.1H6.2a2.4 2.4 0 0 0 0 4.8h1.4v-1.7h-1.4a.7.7 0 0 1 0-1.4h1.4V5.1Z"/>'
           + '<path d="M16.4 5.1h1.4a2.4 2.4 0 0 1 0 4.8h-1.4V8.2h1.4a.7.7 0 0 0 0-1.4h-1.4V5.1Z"/>'
           + '<path d="M10.9 13.4h2.2v2.9h-2.2zM8 16.9h8V19H8z"/>';
    case 'top':   // a rosette - in the hunt
      return '<path d="M12 3.2 13.9 6l3.3.3-2.2 2.5.6 3.3L12 10.6 8.4 12.1l.6-3.3L6.8 6.3 10.1 6 12 3.2Z"/>'
           + '<path d="M9.2 12.6 7.4 20l3-1.6L12 21l1.6-2.6 3 1.6-1.8-7.4-2.8 1.2-2.8-1.2Z"/>';
    case 'day':   // a medal on a ribbon - all day Saturday
      return '<path d="M8.4 2.6h2.5l2 5.2-2.8 1.3-1.7-6.5ZM15.6 2.6h-2.5l-2 5.2 2.8 1.3 1.7-6.5Z"/>'
           + '<circle cx="12" cy="15.4" r="6.2"/>';
    case 'crazy': // a bolt in a shield - told you so
      return '<path d="M12 2.4 4.6 5.1v6.6c0 4.3 3.1 8 7.4 9.9 4.3-1.9 7.4-5.6 7.4-9.9V5.1L12 2.4Z"/>';
    case 'ref':   // a laurel - the group chat
      return '<path d="M12 4.2c-3 1.5-4.6 4.3-4.6 7.4 0 3 1.6 5.9 4.6 7.4-1-2.4-1.4-4.8-1.4-7.4s.4-5 1.4-7.4Z"/>'
           + '<path d="M12 4.2c3 1.5 4.6 4.3 4.6 7.4 0 3-1.6 5.9-4.6 7.4 1-2.4 1.4-4.8 1.4-7.4s-.4-5-1.4-7.4Z"/>'
           + '<circle cx="12" cy="11.6" r="2.6"/>';
  }
  return '<circle cx="12" cy="12" r="5"/>';
}

/* The families whose glyph has a hole the numeral can sit in. The rest carry it
 * on a small disc at the foot, so a numeral never lands on a shape it cannot be
 * read against. */
const NUMERAL_INSIDE = { day: [12, 15.4, 4.4], crazy: [12, 12.4, 4.4], ref: [12, 11.6, 2.9] };

export function badgeSvg(key, tier, locked, px) {
  const w = px || 34;
  const t = Math.max(0, Math.min(2, tier | 0));
  const fill = locked ? 'none' : (FAMILY_FILL[key] || '#8a7f83');
  const ink = locked ? 'var(--dim)' : '#fff';
  const metal = METAL[t];

  /* THE TIER IS A NUMERAL, 1 2 3, and it sits inside the object where the object
   * has room for it - otherwise on a disc at the foot. It is in this tier's
   * metal on a dark ground, so it reads by shape first and metal second rather
   * than by metal alone. */
  const spot = NUMERAL_INSIDE[key];
  const [nx, ny, nr] = spot || [17.6, 19.4, 4.6];
  const numeral =
      `<circle cx="${nx}" cy="${ny}" r="${nr}" fill="${locked ? 'var(--card)' : '#1a1416'}"`
    + ` stroke="${locked ? 'var(--line)' : metal}" stroke-width="1.1"/>`
    + `<text x="${nx}" y="${ny + nr * 0.36}" text-anchor="middle"`
    + ` font-size="${(nr * 1.5).toFixed(1)}" font-weight="700"`
    + ` font-family="ui-sans-serif, system-ui, sans-serif"`
    + ` fill="${locked ? 'var(--dim)' : metal}">${t + 1}</text>`;

  return `<svg class="l6-bsvg" width="${w}" height="${w}" viewBox="0 0 24 24" `
    + `role="img" aria-hidden="true" focusable="false">`
    + `<circle cx="12" cy="12" r="10.2" fill="${fill}"${locked ? ' stroke="var(--line)" stroke-width="1"' : ''}/>`
    /* THE RING IS THE CONSTANT. One color across all fifteen, earned or locked -
     * it is what makes the set read as a set at a glance. */
    + `<circle cx="12" cy="12" r="10.9" fill="none" stroke="${BADGE_RING}" stroke-width="1.4"${locked ? ' opacity=".62"' : ''}/>`
    + `<g fill="${ink}"${locked ? ' opacity=".9"' : ''}>${badgeGlyph(key)}</g>`
    + numeral + '</svg>';
}

/** Every badge held, as ids like "win5". Counted, never flagged, so a tier is a
 *  threshold on a number. */
function earnedIds(counts) {
  const out = [];
  FAMILIES.forEach(([key, , tiers]) => tiers.forEach((n) => {
    if ((counts[key] || 0) >= n) out.push(key + n);
  }));
  return out;
}

function badgeMeta(badgeId) {
  const m = /^([a-z]+)(\d+)$/.exec(badgeId || '');
  if (!m) return null;
  const f = FAMILIES.find((x) => x[0] === m[1]);
  if (!f) return null;
  const i = f[2].indexOf(Number(m[2]));
  return i < 0 ? null : { key: f[0], family: f[1], tier: i, name: `${f[1]} ${TIERS[i]}`, how: f[3](Number(m[2])) };
}

/* ----------------------------------------------------------------- helpers */

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/** 1st / 2nd / 3rd. The rank is a placing, not a count. */
function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Landed of called. A dash is not a zero: nobody has called yet is a different
 *  fact from called ten and landed none. */
function hitRate(r) {
  const settled = r.landed + r.missed;
  return settled ? Math.round((100 * r.landed) / settled) + '%' : '—';
}

/** + n landed in a row, - n missed in a row, 0 for neither.
 *  The reference renders a negative run as "N off the pace"; at 393px in a
 *  four-column stat row that wraps to two lines and pushes the card 30px taller.
 *  Measured, not guessed - "2 missed" says the same thing on one line. */
function streakLabel(n) {
  if (!n) return '—';
  return n > 0 ? `${n} in a row` : `${Math.abs(n)} missed`;
}

/* -------------------------------------------------------------- the pieces */

function gameHead(game) {
  const box = el('div', 'l6-game');
  if (!game) return box;
  const line = el('div', 'l6-game-line');
  line.appendChild(teamChip(game.away, { adjacentTo: game.home }));
  line.appendChild(el('span', 'l6-at', 'at'));
  line.appendChild(teamChip(game.home, { adjacentTo: game.away }));
  const score = el('span', 'l6-score num',
    game.awayScore == null ? '—' : `${game.awayScore}–${game.homeScore}`);
  line.appendChild(score);
  box.appendChild(line);
  return box;
}

/** The viewer's own last five settled calls, as five colored chips.
 *  Straight off the Sofascore bar: "Recent form" is five result pills, denser
 *  than any table row, and a table cannot say the same thing in the same space.
 *  A void is neither a win nor a loss and is drawn as neither. */
function formStrip(form) {
  const box = el('div', 'l6-form');
  const head = el('p', 'l6-form-h', 'Your last five');
  const row = el('div', 'l6-form-row');
  const five = (form || []).slice(-5);
  if (!five.length) {
    box.appendChild(head);
    box.appendChild(el('p', 'l6-form-none', 'No calls settled yet.'));
    return box;
  }
  for (const c of five) {
    const cell = el('div', 'l6-form-cell');
    cell.appendChild(el('span', 'l6-form-side', c.side));
    const voided = c.landed === null || c.landed === undefined;
    const chip = el('span', 'l6-chip num ' + (voided ? 'l6-chip-void' : c.landed ? 'l6-chip-won' : 'l6-chip-lost'),
      voided ? 'void' : signed(c.delta));
    chip.title = voided
      ? 'Voided - the play did not happen, for everybody. Stake returned.'
      : `${c.stake} Marbles on ${c.side} · ${c.landed ? 'landed' : 'missed'}`;
    cell.appendChild(chip);
    row.appendChild(cell);
  }
  box.appendChild(head);
  box.appendChild(row);
  return box;
}

/**
 * The self row, pinned above the table.
 *
 * 🔴 PROFIT IS THE 30px FIGURE and the balance is not. The type scale reserves
 * 30px for the live layer's headline figure; on the call screen that is the
 * bank balance, because a stake means nothing without a balance in view. On the
 * BOARD nothing is being staked and what is being compared is what people MADE,
 * so making the pile the biggest number here would contradict the sort key in
 * the one place a reader looks first. Exactly one 30px figure is on this screen.
 */
function selfCard(row, form, field) {
  const card = el('div', 'card l6-self');
  if (!row) return card;

  const top = el('div', 'l6-self-top');
  /* "1st of 1" is a placing on a field of one, which is the exact claim the
   * alone block below spends a paragraph denying. On a board of one there is no
   * placing to show, so none is shown. */
  if (field > 1) {
    const place = el('span', 'l6-place num', ordinal(row.rank));
    place.appendChild(el('span', 'l6-place-of num', ` of ${field}`));
    top.appendChild(place);
  }
  const nm = el('span', 'l6-self-name', row.displayName);
  top.appendChild(nm);
  if (row.movement) {
    const mv = el('span', 'l6-move num ' + signClass(row.movement),
      (row.movement > 0 ? '▲ ' : '▼ ') + Math.abs(row.movement));
    mv.title = row.movement > 0 ? 'Up since the last settle' : 'Down since the last settle';
    top.appendChild(mv);
  }
  card.appendChild(top);

  const fig = el('div', 'l6-fig');
  const made = el('strong', 'l6-made num ' + signClass(row.profit), signed(row.profit));
  fig.appendChild(made);
  fig.appendChild(el('span', 'l6-fig-l', 'Made · what ranks you'));
  card.appendChild(fig);

  /* Marbles is a SECONDARY figure here, deliberately, and it is named Marbles
   * every time it appears. It is never called credits, coins, a top-up or a
   * refill, and there is no control anywhere on this screen that buys one. */
  const grid = el('dl', 'l6-stats');
  const pairs = [
    ['Marbles', String(row.balance)],
    ['On the table', row.committed ? String(row.committed) : '—'],
    ['Called', row.calls ? `${row.landed}/${row.landed + row.missed}` : '—'],
    ['Streak', streakLabel(row.streak)]
  ];
  for (const [k, v] of pairs) {
    grid.appendChild(el('dt', 'l6-stat-k', k));
    grid.appendChild(el('dd', 'l6-stat-v num', v));
  }
  card.appendChild(grid);

  if (row.voided) {
    card.appendChild(el('p', 'l6-void-note',
      `${row.voided} call${row.voided === 1 ? '' : 's'} voided · stake returned, neither landed nor missed`));
  }
  card.appendChild(formStrip(form));

  const bank = el('p', 'l6-bank-note',
    'Marbles refill every game. Nobody is knocked out and nothing here can be bought.');
  card.appendChild(bank);
  return card;
}

/**
 * The table. A PLAIN RANKED TABLE off the Sofascore bar: micro uppercase column
 * heads, hairline rows rather than a card each, the viewer's own row tinted.
 *
 * The rows arrive RANKED. This function does not sort, does not compute profit
 * and does not know the sort key - `board.ts` owns all three.
 */
function boardTable(rows, badgesByUser) {
  const wrap = el('div', 'l6-table');

  const head = el('div', 'l6-hd');
  head.appendChild(el('span', 'l6-c-pos'));
  head.appendChild(el('span', 'l6-c-who', 'Who'));
  head.appendChild(el('span', 'l6-c-hit', 'Called'));
  head.appendChild(el('span', 'l6-c-made', 'Made'));
  wrap.appendChild(head);

  for (const r of rows) {
    /* A standings row is a LINK, not a control, so it is not held to the 44px
     * tap minimum - the same call Sofascore makes, and the reason its table is
     * readable at 393px. It is still 52px here because the name carries a
     * second line. */
    const row = el('a', 'l6-row' + (r.isSelf ? ' l6-row-me' : ''));
    row.href = '#player-' + encodeURIComponent(r.userId);

    const pos = el('span', 'l6-c-pos num', String(r.rank));
    if (r.movement) {
      const c = el('i', 'l6-caret ' + signClass(r.movement));
      c.textContent = r.movement > 0 ? '▲' : '▼';
      pos.appendChild(c);
    }
    row.appendChild(pos);

    const who = el('span', 'l6-c-who');
    const nameLine = el('span', 'l6-name-line');
    nameLine.appendChild(el('b', 'l6-name', r.displayName));
    const pins = (badgesByUser && badgesByUser[r.userId]) || [];
    if (pins.length) {
      const pinBox = el('span', 'l6-pins');
      pinBox.innerHTML = pins.slice(0, 3).map((bid) => {
        const meta = badgeMeta(bid);
        return meta ? badgeSvg(meta.key, meta.tier, false, 15) : '';
      }).join('');
      pinBox.title = pins.slice(0, 3).map((b) => (badgeMeta(b) || {}).name).filter(Boolean).join(', ');
      nameLine.appendChild(pinBox);
    }
    who.appendChild(nameLine);
    /* The pile, kept visible and kept small. Seeing 200 Marbles on a row that
     * sits below one with 118 is the whole profit-not-balance rule, drawn. */
    who.appendChild(el('span', 'l6-sub num',
      `${r.balance} Marbles${r.committed ? ` · ${r.committed} on the table` : ''}`));
    row.appendChild(who);

    const hit = el('span', 'l6-c-hit num');
    hit.appendChild(el('span', 'l6-hit-v', hitRate(r)));
    hit.appendChild(el('span', 'l6-sub', `${r.landed}/${r.landed + r.missed}`));
    row.appendChild(hit);

    row.appendChild(el('span', 'l6-c-made num ' + signClass(r.profit), signed(r.profit)));
    wrap.appendChild(row);
  }
  return wrap;
}

/** 🔴 A LEADERBOARD OF TWO IS NOT A LEADERBOARD. When nobody else is playing,
 *  this screen has to say what it IS rather than show a table of one and call it
 *  standings. Nothing is hidden - the self card above is unchanged, the badge
 *  case below is unchanged - and the missing thing is named. */
function aloneBlock(row, minField) {
  const box = el('div', 'card l6-alone');
  box.appendChild(el('p', 'l6-alone-h', 'You are the only one on this board'));
  box.appendChild(el('p', 'l6-alone-b',
    'A board of one is a scorecard. Your Marbles, your record and your badges all count '
    + 'exactly the same - there is just nobody to be ahead of yet.'));
  box.appendChild(el('p', 'l6-alone-b',
    `Send anyone watching the same game your link and they land here. A placing needs ${minField} players; `
    + 'until then this reads as your own game, which is what it is.'));
  const cta = el('button', 'l6-invite', 'Send the link');
  /* The screen never fetches and never owns product behavior. It says what
   * happened; the shell decides what that means. */
  cta.addEventListener('click', () => {
    box.dispatchEvent(new CustomEvent('ag:invite', { bubbles: true, detail: { from: 'l6-board' } }));
  });
  box.appendChild(cta);
  box.appendChild(el('p', 'l6-alone-n',
    'A friend playing on your link deepens your bench by 20 Marbles a game. '
    + 'It never moves you up the board.'));
  return box;
}

function banner(kind, text, sub) {
  const b = el('div', 'l6-banner l6-banner-' + kind);
  b.appendChild(el('span', 'l6-banner-t', text));
  if (sub) b.appendChild(el('span', 'l6-banner-s', sub));
  return b;
}

function badgeToast(badgeId) {
  const meta = badgeMeta(badgeId);
  if (!meta) return null;
  const t = el('div', 'l6-toast');
  const ic = el('span', 'l6-toast-i');
  ic.innerHTML = badgeSvg(meta.key, meta.tier, false, 34);
  t.appendChild(ic);
  const body = el('span', 'l6-toast-b');
  body.appendChild(el('b', null, meta.name));
  body.appendChild(el('span', 'l6-toast-h', meta.how));
  t.appendChild(body);
  t.appendChild(el('span', 'l6-toast-n', 'New'));
  return t;
}

/** The case. Five families of three; earned and locked side by side, because a
 *  locked tier is the same object in outline and that only reads if you can see
 *  the earned one next to it. */
function badgeCase(counts, justUnlocked) {
  const sec = el('section', 'l6-badges');
  const head = el('div', 'l6-bhead');
  head.appendChild(el('h2', 'l6-h2', 'Badges'));
  const have = earnedIds(counts).length;
  const total = FAMILIES.length * 3;
  const count = el('span', 'l6-bcount num');
  count.appendChild(el('b', null, String(have)));
  count.appendChild(el('span', null, ` of ${total}`));
  head.appendChild(count);
  sec.appendChild(head);

  for (const [key, name, tiers, how] of FAMILIES) {
    const got = counts[key] || 0;
    const next = tiers.find((n) => got < n);
    const fam = el('div', 'l6-fam');

    const fh = el('div', 'l6-fam-h');
    fh.appendChild(el('span', 'l6-fam-n', name));
    fh.appendChild(el('span', 'l6-fam-p num', next ? `${got} of ${next}` : `${got} — complete`));
    fam.appendChild(fh);

    const row = el('div', 'l6-fam-row');
    tiers.forEach((n, i) => {
      const on = got >= n;
      const cell = el('div', 'l6-badge' + (on ? ' is-on' : '') + (justUnlocked === key + n ? ' is-new' : ''));
      const ic = el('span', 'l6-bi');
      ic.innerHTML = badgeSvg(key, i, !on, 34);
      cell.appendChild(ic);
      cell.appendChild(el('span', 'l6-bn', TIERS[i]));
      cell.appendChild(el('span', 'l6-bh', how(n)));
      row.appendChild(cell);
    });
    fam.appendChild(row);
    sec.appendChild(fam);
  }

  sec.appendChild(el('p', 'l6-bnote',
    'A locked tier is the same mark in outline, never a padlock — what you are earning '
    + 'should look like the thing you are earning. Tier is in the pips, so every badge in '
    + 'the case shares one ring.'));
  return sec;
}

/* ------------------------------------------------------------- preview data
 * 🔴 NO FIXTURE IS WRITTEN HERE. Every landed/missed outcome below is the actual
 * type of the actual next snap in fixtures/real-utep-at-ou-260905-final.json,
 * and the ranking comes out of src/lib/board.ts.
 *
 * WHAT IS SYNTHETIC AND SAYS SO: the five callers' NAMES and their STRATEGIES -
 * which side each would have taken. The same five as tests/board.test.mjs, on
 * purpose, so the preview and the test are looking at the same board. There is
 * no captured fixture of five people playing a real game, and inventing one is
 * the recorded loss mode.
 */
const RUN_TYPES = new Set(['Rush', 'Rushing Touchdown']);
const PASS_TYPES = new Set(['Pass Reception', 'Pass Incompletion', 'Passing Touchdown',
  'Sack', 'Interception', 'Pass Interception Return']);

export const CALLERS = [
  { userId: 'u-ann', displayName: 'Ann', referrals: 0, pick: () => 'run' },
  { userId: 'u-bo', displayName: 'Bo', referrals: 0, pick: () => 'pass' },
  { userId: 'u-cy', displayName: 'Cy', referrals: 1, pick: (s, prev) => prev || 'run' },
  { userId: 'u-dee', displayName: 'Dee', referrals: 3, pick: (s, prev) => (prev === 'run' ? 'pass' : 'run') },
  { userId: 'u-eve', displayName: 'Eve', referrals: 5, pick: (s) => (s.down != null && s.down <= 2 ? 'run' : 'pass') }
];
const STAKES = [5, 10, 25];
const SELF = 'u-cy';

export function snapsFrom(raw) {
  const plays = ((raw.drives && raw.drives.previous) || []).reduce((a, d) => a.concat(d.plays || []), []);
  const out = [];
  for (const p of plays) {
    const t = (p && p.type && p.type.text) || '';
    const outcome = RUN_TYPES.has(t) ? 'run' : PASS_TYPES.has(t) ? 'pass' : null;
    if (!outcome) continue;
    out.push({ snapId: String(p.id), outcome, down: (p.start && p.start.down) || null });
  }
  return out;
}

/** The same replay as tests/board.test.mjs, so the screen and the test are
 *  looking at one board. `startFor` comes from board.ts. */
export function replay(snaps, startFor, opts) {
  opts = opts || {};
  const take = opts.take == null ? snaps.length : opts.take;
  const openTail = opts.openTail || 0;
  const used = snaps.slice(0, take);
  const ledger = [];
  const balance = new Map(CALLERS.map((c) => [c.userId, startFor(c.referrals)]));
  let runsSoFar = 0, prev = null;

  used.forEach((snap, i) => {
    const pRun = i === 0 ? 0.5 : Math.min(0.9, Math.max(0.1, runsSoFar / i));
    const open = i >= used.length - openTail;
    CALLERS.forEach((c, ci) => {
      const side = c.pick(snap, prev);
      const stake = STAKES[(i + ci) % STAKES.length];
      const bal = balance.get(c.userId);
      if (stake > bal) return;
      const p = side === 'run' ? pRun : 1 - pRun;
      if (open) {
        balance.set(c.userId, bal - stake);
        ledger.push({ userId: c.userId, snapId: snap.snapId, side, stake, p, state: 'open', landed: null, delta: null });
        return;
      }
      const landed = side === snap.outcome;
      const delta = landed ? Math.round(stake * Math.min(6, 1 / p)) - stake : -stake;
      balance.set(c.userId, bal + delta);
      ledger.push({ userId: c.userId, snapId: snap.snapId, side, stake, p, state: 'settled', landed, delta });
    });
    runsSoFar += snap.outcome === 'run' ? 1 : 0;
    prev = snap.outcome;
  });
  return ledger;
}

/** Navy, yellow and a null primary, taken out of the real 760-team file rather
 *  than chosen to flatter. Every state renders against one of the three so all
 *  three get looked at. */
function colorCases(teamsFile) {
  const all = Object.values(teamsFile.teams);
  const hex = (t) => (t.primary && /^[0-9a-f]{6}$/i.test(t.primary) ? t.primary.toLowerCase() : null);
  const rgb = (h) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  const navy = all.find((t) => { const h = hex(t); if (!h || h === '000000') return false; const [r, g, b] = rgb(h); return b > 70 && b < 130 && r < 60 && g < 70; });
  const yellow = all.find((t) => { const h = hex(t); if (!h) return false; const [r, g, b] = rgb(h); return r > 220 && g > 170 && b < 90; });
  const none = all.find((t) => teamVars(t).state === 'none');
  return { navy, yellow, none };
}

const TEAM_FOR_STATE = {
  ready: 'navy', alone: 'yellow', settling: 'none',
  final: 'navy', 'just-unlocked': 'yellow'
};

export async function previewData(fixtures, state) {
  if (state === 'loading' || state === 'error' || state === 'empty') return { state };

  const board = await loadBoard();
  const raw = await fixtures.load('real-utep-at-ou');
  const snaps = snapsFrom(raw);

  const comps = (((raw.header || {}).competitions || [])[0] || {}).competitors || [];
  const byId = fixtures.teams.teams;
  const find = (ha) => {
    const c = comps.find((x) => x.homeAway === ha) || {};
    return { team: byId[String(c.id)] || null, score: c.score == null ? null : Number(c.score) };
  };
  const home = find('home'), away = find('away');

  const openTail = state === 'settling' ? 4 : 0;
  const take = state === 'final' ? snaps.length : Math.round(snaps.length * 0.6);
  const ledger = replay(snaps, board.startFor, { take, openTail });
  /* A REAL previous board: the same ledger with the last handful of settles
   * removed, run through the same module. Movement is measured, not decorated. */
  const before = replay(snaps, board.startFor, { take: Math.max(1, take - 12) });
  const prevRanks = {};
  board.computeBoard(CALLERS.map(({ pick, ...m }) => m), before).forEach((r) => { prevRanks[r.userId] = r.rank; });

  const members = CALLERS.map(({ pick, ...m }) => m);
  let rows = board.computeBoard(members, ledger, { selfUserId: SELF, previousRanks: prevRanks });
  if (state === 'alone') rows = rows.filter((r) => r.isSelf).map((r) => Object.assign({}, r, { rank: 1, movement: 0 }));

  const mine = ledger.filter((e) => e.userId === SELF && e.state === 'settled');
  /* One real void, so the void path is drawn rather than described. A void is a
   * settled call with landed === null: the play did not happen, for everybody. */
  if (mine.length > 2 && state !== 'alone') {
    const v = mine[mine.length - 2];
    v.landed = null; v.delta = 0;
  }

  const self = rows.find((r) => r.isSelf) || rows[0];
  /* Only two of the five counters can be honestly derived from one game. The
   * other three need season history no fixture carries - see COULD NOT CLOSE. */
  const counts = {
    win: self && self.rank === 1 && rows.length > 1 ? 1 : 0,
    top: self && self.rank <= 5 && board.canPlace(rows) ? 1 : 0,
    day: 0,
    crazy: ledger.filter((e) => e.userId === SELF && e.state === 'settled' && e.landed === true && e.p < 0.25).length,
    ref: (CALLERS.find((c) => c.userId === SELF) || {}).referrals || 0
  };
  if (state === 'just-unlocked') counts.crazy = Math.max(counts.crazy, 1);

  const badgesByUser = {};
  for (const m of members) {
    badgesByUser[m.userId] = m.userId === SELF
      ? earnedIds(counts)
      : earnedIds({ ref: m.referrals, crazy: m.referrals ? m.referrals * 3 : 0 });
  }

  const cases = colorCases(fixtures.teams);
  return {
    game: {
      home: home.team, away: away.team,
      homeScore: state === 'final' ? home.score : Math.round(home.score * 0.6),
      awayScore: state === 'final' ? away.score : Math.round(away.score * 0.6),
      status: state === 'final' ? 'final' : 'in_progress'
    },
    rows,
    minField: board.MIN_FIELD_FOR_PLACING,
    canPlace: board.canPlace(rows),
    form: mine.slice(-5),
    counts,
    badgesByUser,
    justUnlocked: state === 'just-unlocked' ? 'crazy1' : null,
    myTeam: cases[TEAM_FOR_STATE[state] || 'navy'] || null,
    since: Date.now() - 63000,
    snaps: snaps.length,
    /* Named so the report cannot forget it. */
    synthetic: 'player names and call strategies only; every outcome is a real snap'
  };
}

/* --------------------------------------------------------------- the render */

export function render(root, data, state) {
  root.innerHTML = '';
  const style = document.createElement('style');
  style.textContent = [STATES_CSS, TEAM_CHIP_CSS].join('\n');
  root.appendChild(style);

  const scr = el('section', 'scr-l6-board');
  root.appendChild(scr);

  /* ONE TEAM, ONE GAME - so a team color is legitimate here, and it is still set
   * PER ELEMENT rather than at :root. The :root overwrite belongs to GameRoom
   * and is correct only there. Nothing below reads --maroon or --gold; the
   * accent indirection is --accent and the team channel is --team-a/--team-b. */
  if (data && data.myTeam) {
    const tv = teamVars(data.myTeam);
    for (const k of Object.keys(tv.vars)) scr.style.setProperty(k, tv.vars[k]);
    scr.dataset.teamColors = tv.state;
    scr.dataset.teamCase = data.myTeam.abbrev || '';
  }

  const head = el('header', 'l6-head');
  head.appendChild(el('h1', 'l6-h1', 'The board'));
  if (data && data.game) head.appendChild(gameHead(data.game));
  scr.appendChild(head);

  if (state === 'loading') { scr.appendChild(stateBlock('loading', { rows: 5, body: 'Building the board…' })); return; }
  if (state === 'empty') {
    scr.appendChild(stateBlock('empty', {
      title: 'No board yet',
      body: 'Nobody has made a call in this game. The board fills on the first settle, '
          + 'and everybody starts on the same 100 Marbles.',
      action: { label: 'Back to the game' }
    }));
    scr.appendChild(badgeCase({}, null));
    return;
  }
  if (state === 'error') {
    scr.appendChild(stateBlock('error', {
      body: 'The board did not load. Your Marbles and every call you made are on the server, not in this page.',
      action: { label: 'Reload' }
    }));
    return;
  }
  if (state === 'offline') {
    /* The board is HELD, not replaced - the same rule as the broadcast delay.
     * What is on screen is still true, it is just old, and it says how old. */
    scr.appendChild(stateBlock('offline', {
      title: 'Holding the last board',
      body: 'One server polls the feed and your phone holds one connection. That connection dropped, '
          + 'so this is the board as it stood.',
      since: (data && data.since) || Date.now(),
      action: { label: 'Try again' }
    }));
    if (data && data.rows) {
      scr.appendChild(selfCard(data.rows.find((r) => r.isSelf), data.form, data.rows.length));
      scr.appendChild(boardTable(data.rows, data.badgesByUser));
    }
    scr.appendChild(badgeCase((data && data.counts) || {}, null));
    return;
  }

  if (state === 'just-unlocked' && data.justUnlocked) {
    const t = badgeToast(data.justUnlocked);
    if (t) scr.appendChild(t);
  }
  if (state === 'settling') {
    const open = data.rows.reduce((a, r) => a + (r.committed ? 1 : 0), 0);
    scr.appendChild(banner('settling', 'Calls still on the table',
      `${open} player${open === 1 ? '' : 's'} have Marbles committed. The board moves when the snap settles.`));
  }
  if (state === 'final') {
    scr.appendChild(banner('final', 'Final',
      data.canPlace
        ? `${data.rows.length} played · placings count`
        : `${data.rows.length} played · a placing needs ${data.minField}`));
  }

  scr.appendChild(selfCard(data.rows.find((r) => r.isSelf), data.form, data.rows.length));

  if (state === 'alone' || data.rows.length < 2) {
    scr.appendChild(aloneBlock(data.rows[0], data.minField));
  } else {
    scr.appendChild(boardTable(data.rows, data.badgesByUser));
    /* The sentence the whole sort key rests on, on screen, every time. */
    scr.appendChild(el('p', 'l6-note',
      'Ranked on what you made, not what you hold — a friend playing on your link deepens '
      + 'your bench, it never moves you up.'));
    if (!data.canPlace) {
      scr.appendChild(el('p', 'l6-note l6-note-dim',
        `A placing needs ${data.minField} players. With ${data.rows.length} this is a scoreboard, not a standing.`));
    }
  }

  scr.appendChild(badgeCase(data.counts || {}, data.justUnlocked));
}
