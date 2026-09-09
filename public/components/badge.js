/* THE BADGE. One drawing system, two screens.
 *
 * 🔴 WHY IT IS A COMPONENT. It lived inside l6-board.screen.js, and P5 —
 * standings — was still putting a TEAM CHIP beside a person's name to fill the
 * same slot. Jason, on that exact row: "for the icons for each person, make up
 * something for a person who won a week, they get a logo, 2 weeks gets one, etc
 * not 2 color, crap."
 *
 * A two-color chip beside a person identifies a TEAM. It says nothing about the
 * person, it is the same two colors for everyone who picked that team, and on a
 * standings row it is decoration wearing data's clothes. A badge is the opposite:
 * it can only be there because that person did something.
 *
 * The frozen contract already covers this case in as many words — a component
 * two pieces both need is specced ONCE, never one per screen. So the whole
 * system moved here rather than being copied, and l6 imports it like everyone
 * else.
 */
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
export const FAMILIES = [
  ['win',   'Game winner', [1, 5, 20],  (n) => `Win ${n} game board${n === 1 ? '' : 's'}`],
  ['top',   'Top five',    [3, 15, 50], (n) => `Finish top five ${n} time${n === 1 ? '' : 's'}`],
  ['day',   'Day winner',  [1, 5, 15],  (n) => `Win ${n} day${n === 1 ? '' : 's'} on average, three games minimum`],
  ['crazy', 'Crazy call',  [1, 10, 40], (n) => `Land ${n} big call${n === 1 ? '' : 's'} the model gave under 25%`],
  ['ref',   'Recruiter',   [1, 3, 5],   (n) => `${n} friend${n === 1 ? '' : 's'} playing on your link`]
];
export const TIERS = ['Bronze', 'Silver', 'Gold'];

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
export function earnedIds(counts) {
  const out = [];
  FAMILIES.forEach(([key, , tiers]) => tiers.forEach((n) => {
    if ((counts[key] || 0) >= n) out.push(key + n);
  }));
  return out;
}

export function badgeMeta(badgeId) {
  const m = /^([a-z]+)(\d+)$/.exec(badgeId || '');
  if (!m) return null;
  const f = FAMILIES.find((x) => x[0] === m[1]);
  if (!f) return null;
  const i = f[2].indexOf(Number(m[2]));
  return i < 0 ? null : { key: f[0], family: f[1], tier: i, name: `${f[1]} ${TIERS[i]}`, how: f[3](Number(m[2])) };
}

/**
 * The single best badge somebody holds, or null.
 *
 * 🔴 ONE BADGE, BIG ENOUGH TO BE ONE, and this is the rule the standings row was
 * breaking in a different way. Three pins at 15px was three colored blobs beside
 * a name — Jason: "not 2 color, crap" — and a team chip in the same slot was the
 * same failure with better provenance. A row shows the BEST badge at a size where
 * the object and its numeral both read, and says how many more there are in type.
 * A collection belongs in the case, one tap away.
 *
 * Highest tier wins, found by reduce rather than by sorting, because a screen
 * that proves it does no ranking of its own cannot have a `.sort(` in it that an
 * auditor has to read twice.
 */
export function bestBadge(ids) {
  return (ids || []).map(badgeMeta).filter(Boolean)
    .reduce((a, b) => (a && a.tier >= b.tier ? a : b), null);
}

/** The row pin, ready to append. `null` when the person has earned nothing —
 *  which is a real state and is drawn as nothing, never as a placeholder. */
export function badgePin(ids, px) {
  const best = bestBadge(ids);
  if (!best) return null;
  const box = document.createElement('span');
  box.className = 'ag-badge-pin';
  box.innerHTML = badgeSvg(best.key, best.tier, false, px || 22);
  box.title = (ids || []).map((b) => (badgeMeta(b) || {}).name).filter(Boolean).join(', ');
  return box;
}

export const BADGE_CSS = `
.ag-badge-pin { display: inline-flex; vertical-align: -4px; line-height: 0; }
.ag-badge-more { font-size: var(--t-micro); color: var(--dim); margin-left: 3px; }
`;
