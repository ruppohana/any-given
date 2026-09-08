/* THE TWO-COLOR TEAM CHIP - one component, used by P2 the slate, P5 standings and
 * L1 the team chooser. Specced once, here, in the frozen contract.
 *
 * WHY IT EXISTS. Sofascore, Armchair Quarterback, CBS and Office Pool all use a
 * LOGO as the identity anchor in a fixture row and a standings row - four products
 * on disk, four times the same choice. Any Given has no marks, ever: a team is its
 * two colors, its abbreviation and its name in type. So this chip carries the
 * entire job the logo does in all four, and it has never been drawn before.
 *
 * WHAT MAKES IT HARD, measured against fixtures/teams.json rather than assumed:
 *   760 schools
 *   331 with primary '000000' + 70 with no primary  = 401 WITH NO USABLE PRIMARY
 *   393 WITH NO SECONDARY AT ALL - more than half the file
 * So "two-color chip" describes a minority of the data. THREE DEFINED STATES:
 * two colors, one color, none. A null renders as a null, never as whatever
 * #000000 does.
 *
 * AND THE POOL'S OWN CONSTRAINT: colors are set PER ELEMENT as --team-a/--team-b.
 * Never at :root. The live board's root overwrite is one team on one board and is
 * correct only there; a slate is 131 games and ~260 teams on one scroll.
 */

const NULL_TEAM = 'var(--team-null)';

/** '8C1D40' | '#8C1D40' | null -> '#8c1d40' | null. '000000' is treated as absent,
 *  because in this file black means "we never captured a color". */
export function normalizeColor(c) {
  if (!c) return null;
  const hex = String(c).trim().replace(/^#/, '').toLowerCase();
  if (!/^[0-9a-f]{6}$/.test(hex)) return null;
  if (hex === '000000') return null;
  return '#' + hex;
}

/** Relative luminance, 0..1. sRGB, WCAG. */
export function luminance(hex) {
  const h = hex.replace('#', '');
  const ch = [0, 2, 4].map(function (i) {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** Two teams whose primaries are within this distance need separating.
 *  Navy against navy happens constantly in college football and the live board
 *  never had to survive it, because it only ever showed one team. */
export function tooClose(a, b, threshold) {
  if (threshold === undefined) threshold = 60;
  if (!a || !b) return false;
  const x = a.replace('#', ''), y = b.replace('#', '');
  let d = 0;
  for (let i = 0; i < 6; i += 2) {
    d += Math.abs(parseInt(x.slice(i, i + 2), 16) - parseInt(y.slice(i, i + 2), 16));
  }
  return d < threshold;
}

/**
 * The scoped custom properties for one team. SET THESE ON AN ELEMENT.
 * @returns {{vars: Record<string,string>, state: 'two'|'one'|'none'}}
 */
export function teamVars(team) {
  const a = normalizeColor(team && team.primary);
  const b = normalizeColor(team && team.secondary);
  /* 🔴 A TEAM WHOSE TWO COLORS ARE THE SAME COLOR HAS ONE COLOR. Found by P5
   * against the real file: Georgetown is 110e42 / 001c58 and San Diego's two are
   * byte-identical. Drawn as a split, those render as one solid square with an
   * invisible seam - a two-color chip that has silently become a one-color chip
   * and does not say so. Six of the 301 two-color teams do this.
   *
   * The adjacency rule already catches two TEAMS whose primaries collide; this is
   * the same failure inside ONE team, and it was missed because the test set was
   * written as pairs of teams rather than pairs of colors. */
  if (a && b && !tooClose(a, b)) return { vars: { '--team-a': a, '--team-b': b }, state: 'two' };
  if (a) return { vars: { '--team-a': a, '--team-b': NULL_TEAM }, state: 'one' };
  return { vars: { '--team-a': NULL_TEAM, '--team-b': NULL_TEAM }, state: 'none' };
}

/** Apply teamVars to a real element. --accent is never touched. */
export function applyTeamVars(el, team) {
  const r = teamVars(team);
  for (const k of Object.keys(r.vars)) el.style.setProperty(k, r.vars[k]);
  el.dataset.teamColors = r.state;
  return r.state;
}

/**
 * The chip. Inline SVG - no icon font, no image, no CDN, no mark.
 *
 * A HAIRLINE IS ALWAYS DRAWN. That is what makes the component survive a yellow
 * primary on --card:#ffffff and a navy primary on --bg:#120a0e without knowing
 * which theme it is in: the shape has an outline whatever the fill does.
 */
/* MARKS. Held PROVISIONAL 2026-09-08 - Jason reversed the no-logos decision and
 * then said he needed to see it run first, so THE TOGGLE IS THE DELIVERABLE AND
 * THE DEFAULT IS NOT DECIDED. Both paths are built; he picks after looking.
 *
 * The URL derives from the team id, which is the CFBD id and the ESPN id at once
 * - verified 2026-09-08 against a.espncdn.com for Oregon, Ohio State, Oklahoma
 * and TCU. Nothing is stored and no logo is committed to this repo.
 *
 * 🔴 The chip is NEVER deleted. It is the fallback for marks-off, for a team with
 * no logo, and for a logo that fails to load - and it is what the product ships
 * if a school, a conference or CLC ever writes. */
export function marksOn(doc) {
  /* Defensive on every hop: a test DOM shim has no documentElement, and a chip
   * that throws takes the whole screen with it. Marks off is the safe answer -
   * the two-color chip needs nothing but the team. */
  const d = doc || (typeof document !== 'undefined' ? document : null);
  const el = d && d.documentElement;
  return !!(el && el.dataset && el.dataset.marks === 'on');
}

export function logoUrl(team) {
  return team && team.id ? 'https://a.espncdn.com/i/teamlogos/ncaa/500/' + team.id + '.png' : null;
}

export function teamChip(team, opts) {
  opts = opts || {};
  const size = opts.size || 22;
  const withAbbrev = opts.withAbbrev !== false;
  const adjacentTo = opts.adjacentTo || null;

  const wrap = document.createElement('span');
  wrap.className = 'tchip';
  const state = applyTeamVars(wrap, team);

  const a = normalizeColor(team && team.primary);
  const bAdj = adjacentTo ? normalizeColor(adjacentTo.primary) : null;
  if (tooClose(a, bAdj)) wrap.dataset.adjacentClash = 'true';

  const url = marksOn() ? logoUrl(team) : null;
  if (url) {
    const img = document.createElement('img');
    img.className = 'tchip-logo';
    img.src = url; img.width = size; img.height = size;
    img.alt = ''; img.loading = 'lazy';
    img.addEventListener('error', function () {
      img.remove();
      wrap.dataset.markFailed = 'true';
      wrap.insertBefore(chipMark(state, size), wrap.firstChild);
    });
    wrap.appendChild(img);
  } else {
    wrap.appendChild(chipMark(state, size));
  }

  if (withAbbrev) {
    const ab = document.createElement('span');
    ab.className = 'tchip-abbrev num';
    ab.textContent = (team && team.abbrev) || '—';
    wrap.appendChild(ab);
  }
  /* The accessible name is the real name in type - the identification is the
   * text whether a mark is shown or not. */
  wrap.setAttribute('title', (team && team.name) || 'Unknown team');
  return wrap;
}

/** The two-color mark. Inline SVG - no icon font, no CDN, no image. */
function chipMark(state, size) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'tchip-mark');
  const left = document.createElementNS(NS, 'path');
  left.setAttribute('d', 'M 5 1 H 12 V 23 H 5 A 4 4 0 0 1 1 19 V 5 A 4 4 0 0 1 5 1 Z');
  left.setAttribute('fill', 'var(--team-a)');
  const right = document.createElementNS(NS, 'path');
  right.setAttribute('d', 'M 12 1 H 19 A 4 4 0 0 1 23 5 V 19 A 4 4 0 0 1 19 23 H 12 Z');
  right.setAttribute('fill', 'var(--team-b)');
  const ring = document.createElementNS(NS, 'rect');
  ring.setAttribute('x', '1'); ring.setAttribute('y', '1');
  ring.setAttribute('width', '22'); ring.setAttribute('height', '22');
  ring.setAttribute('rx', '5');
  ring.setAttribute('fill', 'none');
  ring.setAttribute('stroke', 'var(--line)');
  ring.setAttribute('stroke-width', '1');
  /* A team with NO captured color says so, rather than pretending to be grey. */
  if (state === 'none') ring.setAttribute('stroke-dasharray', '3 2');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.appendChild(left); svg.appendChild(right); svg.appendChild(ring);
  return svg;
}

export const TEAM_CHIP_CSS = [
  '.tchip { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }',
  '.tchip-mark { flex: none; display: block; }',
  '.tchip-logo { flex: none; display: block; object-fit: contain; }',
  '.tchip-abbrev { font-size: var(--t-micro); font-weight: 700; letter-spacing: .02em; color: var(--fg); white-space: nowrap; }',
  '.tchip[data-adjacent-clash="true"] .tchip-mark { outline: 2px solid var(--card); border-radius: 6px; }',
  '.tchip[data-team-colors="none"] .tchip-abbrev { color: var(--dim); }'
].join('\n');
