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

/* 🔴 THE PATH IS SPORT-SPECIFIC, and getting it wrong is silent. A team id is
 * only unique WITHIN a league, so NFL 17 and 26 under the ncaa path resolved to
 * Claremont-Mudd-Scripps and UCLA - two real logos, loading successfully, for the
 * wrong teams entirely. Nothing errored and nothing looked broken; the game just
 * had the wrong crests on it.
 *
 * Found by pointing the live screen at a real NFL game and looking at it, which
 * is the only way this class of bug is ever found. */
const LEAGUE_PATH = { nfl: 'nfl', 'college-football': 'ncaa', ncaa: 'ncaa' };

/**
 * 🔴 OUR ORIGIN FIRST, THE CDN AS FALLBACK.
 *
 * `tools/scrape-logos.mjs` writes `public/logos/<path>/<variant>/<id>.png`, and
 * those are what ship. Hot-linking a.espncdn.com was three bets we did not need
 * to take: ESPN ALREADY 403s our Worker on its data endpoints — that is the only
 * reason the poller runs on the host — a 131-game slate is 262 requests to
 * somebody else's origin on a phone during a game, and a crest that fails is a
 * hole in the row.
 *
 * The CDN stays as the fallback rather than being deleted, because the college
 * set is 760 schools and will be incomplete for a while. A team we have not
 * scraped yet still draws.
 */
export function logoUrl(team, league, variant) {
  if (!team || !team.id) return null;
  const path = LEAGUE_PATH[league || team.league || 'college-football'] || 'ncaa';
  return `/logos/${path}/${variant || '500'}/${team.id}.png`;
}

/** Where the crest came from before we held our own copy. Used only when the
 *  local one 404s, so a school we have not scraped is never a hole. */
export function cdnLogoUrl(team, league, variant) {
  if (!team || !team.id) return null;
  const path = LEAGUE_PATH[league || team.league || 'college-football'] || 'ncaa';
  return `https://a.espncdn.com/i/teamlogos/${path}/${variant || '500'}/${team.id}.png`;
}

/* 🔴 THE DECODED CACHE — the other half of the blink fix.
 *
 * An off-DOM Image per URL, held for the life of the page and never inserted
 * anywhere. Its only job is to keep the bytes AND the decoded bitmap resident,
 * so that when a repaint mints a fresh <img> with the same src the browser has
 * nothing left to do and paints it in the same frame.
 *
 * This is a cache of pixels, not of elements. Handing the same NODE back would
 * be cheaper still and is wrong: one team appears in the summary card and in
 * the board on the same screen, and a node cannot be in two places — the second
 * insertion silently steals it from the first. That failure looks like a
 * missing logo, which is the bug this is fixing, arriving by another road. */
const DECODED = new Map();
function warm(url) {
  if (!url || DECODED.has(url)) return;
  const i = new Image();
  DECODED.set(url, i);
  i.src = url;
  /* decode() is best-effort — a 404 rejects, and the <img> error handler is
   * what owns the fallback. Swallow it here or it is an unhandled rejection. */
  if (i.decode) i.decode().catch(function () {});
}

/**
 * 🔴 A DARK LOGO ON A DARK GROUND IS NO LOGO. Jason, 2026-09-08: "the icons dont
 * work on the dark background." He is right, and it is most of the file: club
 * crests are drawn for white paper, so every navy and black one sinks into
 * --bg:#120a0e and identifies nothing.
 *
 * ESPN publishes the answer itself. `/500-dark/<id>.png` exists for every id
 * checked, and returns DIFFERENT bytes for most of them — a variant drawn to sit
 * on a dark ground. Where a team's crest already works on dark the two files are
 * byte-identical, so asking for the dark one is never worse.
 *
 * 🔴 AND THE THEME CANNOT BE READ ONCE AND FORGOTTEN. Two things move it: the
 * system setting, and this app's own Auto/Light/Dark control, which sets
 * `data-theme` on <html> and RE-RENDERS NOTHING. A src chosen at chip-creation
 * would be stale the moment either changed — and the failure is silent, because
 * a wrong-variant logo still loads. So one watcher, installed once, fixes every
 * chip on the page whenever the effective theme moves.
 *
 * A CSS background would swap for free and is the wrong trade: it has no `error`
 * event, and the error path is what turns a missing crest into the drawn chip
 * rather than a hole.
 */
function isDark() {
  const t = document.documentElement.dataset.theme;
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

function paintLogos() {
  const dark = isDark();
  for (const img of document.querySelectorAll('img.tchip-logo')) {
    const want = dark ? img.dataset.logoDark : img.dataset.logoLight;
    if (want && img.getAttribute('src') !== want) img.setAttribute('src', want);
  }
}

let watching = false;
function watchTheme() {
  if (watching || typeof document === 'undefined') return;
  watching = true;
  /* The app's own control writes data-theme on <html> and nothing else. */
  new MutationObserver(paintLogos)
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    /* addEventListener is not on MediaQueryList in older Safari; addListener is. */
    if (mq.addEventListener) mq.addEventListener('change', paintLogos);
    else if (mq.addListener) mq.addListener(paintLogos);
  }
}

/** How much larger a logo is drawn than the box it replaces, to cancel the
 *  transparent margin baked into the source PNGs. */
const LOGO_SCALE = 1.4;

export function teamChip(team, opts) {
  opts = opts || {};
  const size = opts.size || 22;
  /* 🔴 THE MARK CARRIES THE ABBREVIATION NOW, so the separate label defaults OFF
   * - drawing both prints it twice. A screen that wants a text label beside the
   * mark asks for it. */
  const withAbbrev = opts.withAbbrev === true;
  const adjacentTo = opts.adjacentTo || null;

  const wrap = document.createElement('span');
  wrap.className = 'tchip';
  const state = applyTeamVars(wrap, team);

  const a = normalizeColor(team && team.primary);
  const bAdj = adjacentTo ? normalizeColor(adjacentTo.primary) : null;
  if (tooClose(a, bAdj)) wrap.dataset.adjacentClash = 'true';

  /* 🔴 `drawn: true` FORCES THE DRAWN MARK, whatever the marks setting says.
   *
   * It exists because S4 nests this chip inside its own <svg> share card, and an
   * <img> CANNOT live in an SVG — `wrap.querySelector('svg')` came back null and
   * the whole screen died on "Cannot read properties of null". Found 2026-09-08
   * by walking every screen on the deployed domain; it had been broken since the
   * logo reversal and only ever with marks ON, which is why nothing caught it.
   *
   * And it is the right thing there independently of the crash: a share card is
   * an image somebody screenshots and sends. A CDN logo inside it is a network
   * dependency in a picture, and a licensing question in something designed to
   * travel. The drawn chip is self-contained. */
  const wantLogo = !opts.drawn && marksOn();
  if (wantLogo) {
    watchTheme();
    const img = document.createElement('img');
    img.className = 'tchip-logo';
    /* Both variants travel with the element, so the watcher can swap without
     * knowing anything about teams or leagues. */
    img.dataset.logoLight = logoUrl(team, opts.league, '500');
    img.dataset.logoDark = logoUrl(team, opts.league, '500-dark');
    img.src = isDark() ? img.dataset.logoDark : img.dataset.logoLight;
    /* 🔴 A CREST IS DRAWN SMALLER THAN ITS BOX. Jason, 2026-09-08: "can the logos
     * be a little larger?" — and the reason they look small at a size that is
     * correct for the drawn chip is that ESPN's PNGs carry their own margin. The
     * artwork sits inside transparent padding, so a 22px crest optically reads
     * around 16 where a 22px solid chip reads 22. Matching the nominal number
     * makes the logo the smaller of the two every time.
     *
     * So the LOGO is scaled and the CHIP is not — this is a correction for the
     * file format, not a size change to the component. Every call site keeps the
     * size it measured for its own row. */
    const px = Math.round(size * LOGO_SCALE);
    img.width = px; img.height = px;
    img.alt = '';
    /* 🔴 NOT `loading="lazy"`, AND `decoding="sync"`. Jason, 2026-09-08:
     * "The logos blink."
     *
     * Two causes, and the fix needs both halves. paint() rebuilds this screen
     * on every tick — a countdown and a staleness line both want a second — so
     * every mark on screen is a BRAND NEW <img> element once a second. A new
     * element decodes from scratch even when the bytes are in the HTTP cache,
     * and `lazy` puts that decode behind the browser's own scheduler. The
     * result is a mark that is absent for a frame, every frame: a blink.
     *
     * `lazy` was wrong here whatever else is true — these marks are 1–3 KB and
     * ABOVE THE FOLD. Deferring the fetch of the thing already on screen is the
     * attribute working exactly as designed against the one case it should
     * never apply to. */
    img.decoding = 'sync';
    warm(img.dataset.logoLight); warm(img.dataset.logoDark);
    /* 🔴 TWO CHANCES BEFORE THE FALLBACK. A local miss means we have not scraped
     * that school yet, which is a gap in our asset set and NOT a team without a
     * crest — so it retries the CDN once before giving up and drawing the chip.
     * `triedCdn` is on the element rather than in a closure so the handler
     * cannot loop. */
    img.addEventListener('error', function () {
      if (!img.dataset.triedCdn) {
        img.dataset.triedCdn = '1';
        const dark = isDark();
        const alt = cdnLogoUrl(team, opts.league, dark ? '500-dark' : '500');
        if (alt) {
          img.dataset.logoLight = cdnLogoUrl(team, opts.league, '500');
          img.dataset.logoDark = cdnLogoUrl(team, opts.league, '500-dark');
          img.src = alt;
          return;
        }
      }
      img.remove();
      wrap.dataset.markFailed = 'true';
      wrap.insertBefore(chipMark(state, size, team && team.abbrev), wrap.firstChild);
    });
    wrap.appendChild(img);
  } else {
    wrap.appendChild(chipMark(state, size, team && team.abbrev));
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

/** THE MARK. Solid primary field, the abbreviation in it, the secondary as a bar
 *  along the foot.
 *
 *  🔴 REDRAWN 2026-09-08 to Jason's reference - a fantasy-football team tile: a
 *  filled rounded square in the team color with the abbreviation reversed out of
 *  it and a stripe of the second color at the bottom.
 *
 *  It replaces a vertical split of the two colors, which was worse for a reason
 *  worth writing down: the split gave BOTH colors equal weight, so a team read as
 *  two colors rather than as one team with a trim - and at 22px on a row the seam
 *  was the loudest thing in it. Here the primary is the identity and the
 *  secondary is a detail, which is how a team actually reads.
 *
 *  It also carries the abbreviation INSIDE the mark rather than beside it, so the
 *  mark is self-sufficient at a size where a separate label would not fit.
 *
 *  Three states, unchanged: two colors, one color, none. */
function chipMark(state, size, abbrev) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('class', 'tchip-mark');
  svg.setAttribute('role', 'img');
  svg.setAttribute('focusable', 'false');

  const add = (tag, attrs) => {
    const n = document.createElementNS(NS, tag);
    for (const k of Object.keys(attrs)) n.setAttribute(k, attrs[k]);
    svg.appendChild(n);
    return n;
  };

  /* The field. A null team is the defined grey, never whatever #000000 does. */
  add('rect', { x: 0, y: 0, width: 24, height: 24, rx: 5.5, fill: 'var(--team-a)' });

  /* The trim. Only when there genuinely IS a second color - a one-color team gets
   * a clean edge rather than a grey bar pretending to be a trim. */
  if (state === 'two') {
    add('path', { d: 'M 0 19.2 H 24 V 18.5 A 5.5 5.5 0 0 1 18.5 24 H 5.5 A 5.5 5.5 0 0 1 0 18.5 Z',
                  fill: 'var(--team-b)' });
    add('rect', { x: 0, y: 19.2, width: 24, height: 3.3, fill: 'var(--team-b)' });
  }

  /* The hairline, always - it is what carries a yellow field on white and a navy
   * one on #120a0e without knowing which theme it is in. Dashed for a team we
   * have no color for, which is this system's existing word for "no value". */
  const ring = add('rect', { x: 0.5, y: 0.5, width: 23, height: 23, rx: 5.2,
                             fill: 'none', stroke: 'var(--line)', 'stroke-width': 1 });
  if (state === 'none') ring.setAttribute('stroke-dasharray', '3 2');

  /* The abbreviation, reversed out of the field. Two to four characters, scaled
   * so a four-letter abbreviation still fits inside the square. */
  const text = String(abbrev || '—').slice(0, 4);
  const fs = text.length >= 4 ? 7.2 : text.length === 3 ? 8.6 : 10.4;
  const t = add('text', {
    x: 12, y: state === 'two' ? 15.2 : 16.4, 'text-anchor': 'middle',
    'font-size': fs, 'font-weight': 800, 'letter-spacing': '.02em',
    'font-family': 'ui-sans-serif, system-ui, sans-serif',
    fill: state === 'none' ? 'var(--fg)' : '#fff'
  });
  t.textContent = text;
  if (state === 'none') t.setAttribute('opacity', '.55');
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
