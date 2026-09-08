/* L1 - COLD LAUNCH AND THE TEAM CHOOSER. The live layer's front door.
 *
 * BAR, opened before a line was written:
 *   reference/sofascore-teardown/screens/IMG_5195.PNG .. IMG_5200.PNG
 *     5195-5197  three full-bleed sport videos behind ONE FIXED HEADLINE,
 *                GET STARTED primary, `Have an account? SIGN IN` secondary
 *     5198       the favorites grid BEFORE ANY ACCOUNT, with a visible Skip
 *     5199-5200  search - instant, and it MIXES ENTITY TYPES: `Arizona` returns
 *                Diamondbacks, Cardinals, Wildcats, Coyotes, Sun Devils, players
 *   and the reference implementation itself, run at 393px:
 *     python tools/preview.py fixtures/real-utep-at-ou-260905-final.json --fresh
 *     -> `Pick your game`, then `My team is not playing - just follow a team`
 *        opens a sheet that is a SEARCH FIELD AND NOTHING ELSE. Its resting
 *        state is the words `no match` on an empty screen. There is no browse.
 *
 * WHAT IS REFUSED, AND IT WAS DECIDED BEFORE THIS FILE EXISTED:
 *   - THE VIDEO CAROUSEL. Three sports behind the headline is a general scores
 *     app proving BREADTH. Any Given is one sport now and basketball second;
 *     breadth is not the promise, so a carousel would be advertising a claim the
 *     product does not make.
 *   - THE MIXED SEARCH. Sofascore's `Arizona` returns leagues, tournaments and
 *     two players. Ours returns teams. Nothing else is in this app to find.
 *   - THE ACCOUNT. No wall, no date of birth, no install prompt, no price.
 *
 * WHAT IS TAKEN:
 *   - ONE FIXED HEADLINE THAT DOES NOT MOVE WITH WHAT IS BEHIND IT. Theirs holds
 *     still over moving video; ours holds still over 760 teams scrolling under it.
 *   - THE GRID BEFORE THE ACCOUNT, with a VISIBLE Skip, honored.
 *   - The browse, which the reference implementation does not have at all.
 *
 * 🔴 THE DESIGN CASE IS NOT THE PRETTY TEAM. Sofascore's grid leans on a crest in
 * every cell - 18 cells, 18 marks. We ship no marks and, measured against
 * fixtures/teams.json: 301 teams can fill a two-color chip, 58 have one color,
 * 401 HAVE NONE AT ALL. So the cell has to identify a school with no crest and no
 * color, which is 53% of the file, and it does it the only way left: the
 * abbreviation and the name in type, with the chip as the frame rather than the
 * identity. teamChip is the shared component and is used as-is.
 */
import { teamChip, TEAM_CHIP_CSS, teamVars, normalizeColor, luminance } from '/components/team-chip.js';
import { stateBlock, STATES_CSS } from '/components/states.js';

export const id = 'l1-cold';
export const title = 'Cold launch - the team chooser';
export const bar = 'reference/sofascore-teardown/screens/IMG_5195.PNG..IMG_5200.PNG (+ sports-live tools/preview.py --fresh)';
export const states = ['ready', 'chosen', 'skipped', 'searching', 'no-results', 'loading', 'offline', 'error'];

/* ------------------------------------------------------------------ *
 * THE ROOT TOKEN OVERWRITE - and why THIS SCREEN is the one place it is
 * correct.
 *
 * §5 fails a piece for writing --maroon / --gold / --accent at :root. That rule
 * is about THE POOL, where one scroll carries 131 games and ~260 teams and a
 * single root pair cannot express them - hence --team-a / --team-b per element.
 * HERE THERE IS GENUINELY ONE TEAM: the user just picked it, alone, and the
 * whole app is about to be dressed in it. Nothing else on screen belongs to a
 * different school.
 *
 * 🔴 AND IT WRITES --maroon AND --gold, NEVER --accent.
 * --accent is not a color, it is an INDIRECTION THAT SWAPS TOKEN BY THEME:
 * `--accent: var(--maroon)` in light, `var(--gold)` on dark. An inline style on
 * :root beats every stylesheet rule including the dark media query, so writing
 * --accent directly would nail the app to one color and silently kill dark
 * parity - the exact failure tokens.css opens by warning about. Writing the two
 * ENDS instead leaves the swap intact and the team's colors flow through it.
 * ------------------------------------------------------------------ */

/* Contrast floors, COMPUTED rather than eyeballed. --accent is used as text on
 * --bg and as a filled button carrying --card as its label, so both directions
 * have to clear 4.5:1. Luminances measured with team-chip.js's own luminance():
 *   light  --bg #faf7f5 L .9344, --card #ffffff L 1
 *          accent as text:   (.9844)/(L+.05) >= 4.5  =>  L <= .1687
 *          white on accent:  (1.05)/(L+.05)  >= 4.5  =>  L <= .1833
 *   dark   --bg #120a0e L .0038, --card #1c1216 L .0074
 *          accent as text:   (L+.05)/(.0538) >= 4.5  =>  L >= .1921
 *          card on accent:   (L+.05)/(.0574) >= 4.5  =>  L >= .2083
 * Rounded to the strict side. The defaults clear both easily - maroon is L .068,
 * gold is L .618 - and so the floors are not tuned to let them through.
 *
 * A team color that fails its side is NOT promoted to accent; the default holds
 * there instead. Both failure modes are real and in the file: '002855' navy is
 * L .022 and cannot be read on #120a0e, 'FFC627' yellow is L .618 and cannot be
 * read on #faf7f5. */
export const LIGHT_MAX_LUM = 0.168;
export const DARK_MIN_LUM = 0.209;

/* 🔴 AND A CEILING, WHICH THE FLOORS ALONE DO NOT GIVE. Found by running this
 * over all 760: 68 schools publish 'ffffff' as a chip color - Arkansas, Stanford,
 * Connecticut, Georgia Tech and Colby among them - and pure white clears
 * every contrast floor on dark by miles. It is still not an accent. It is what
 * the theme already spends on type: --fg on dark is #f5eef0, so a white accent
 * makes an accented element indistinguishable from a paragraph.
 *
 * team-chip.js already draws this line from the other end - '000000' is read as
 * "we never captured a color" rather than as black. This is the same line at the
 * top of the range: white is the trim a school lists, not a color it has. A team
 * whose only light color is white keeps the app's gold on dark. */
export const DARK_MAX_LUM = 0.90;

/**
 * Which of a team's colors may carry the accent, per theme. Primary is preferred;
 * the secondary is the fallback; a team may resolve one side, both, or neither.
 * @returns {{light: string|null, dark: string|null, state: 'both'|'light'|'dark'|'neither'}}
 */
export function accentPair(team) {
  /* 🔴 THE CANDIDATES COME OUT OF teamVars, NOT OFF THE RECORD. Found by running
   * this against all 760: 14 teams have no usable primary but a real secondary,
   * and team-chip.js calls every one of them state 'none' and paints both halves
   * gray. Reading the record directly would have dressed the whole app in a color
   * the chip on the same screen refuses to show. The chip is the shared component
   * and it decides what a team's colors are; this only decides which end each
   * one can carry. */
  const v = teamVars(team).vars;
  const cands = [v['--team-a'], v['--team-b']].filter((c) => typeof c === 'string' && c[0] === '#');
  const light = cands.find((c) => luminance(c) <= LIGHT_MAX_LUM) || null;
  const dark = cands.find((c) => {
    const l = luminance(c);
    return l >= DARK_MIN_LUM && l <= DARK_MAX_LUM;
  }) || null;
  const state = light && dark ? 'both' : light ? 'light' : dark ? 'dark' : 'neither';
  return { light, dark, state };
}

/** Human sentence for what just happened to the app's colors. No jargon on screen. */
export function accentSentence(team, pair) {
  const nm = (team && team.short) || 'This team';
  if (pair.state === 'both') return `${nm}'s colors now carry the app, in both light and dark.`;
  if (pair.state === 'light') return `${nm}'s color carries the app in light. On dark it is too dark to read, so the default holds there.`;
  if (pair.state === 'dark') return `${nm}'s color carries the app on dark. In light it is too pale to read, so the default holds there.`;
  return `${nm} publishes no color we can use, so the app keeps its own. Nothing else changes.`;
}

/** Write the pair at :root. NEVER --accent. Returns the pair. */
export function applyRootAccent(team, doc) {
  const el = (doc || document).documentElement;
  el.style.removeProperty('--maroon');
  el.style.removeProperty('--gold');
  const pair = accentPair(team);
  if (pair.light) el.style.setProperty('--maroon', pair.light);
  if (pair.dark) el.style.setProperty('--gold', pair.dark);
  el.dataset.agTeam = (team && team.abbrev) || '';
  return pair;
}

/** Skip is HONORED: every trace of a team comes back off :root. */
export function clearRootAccent(doc) {
  const el = (doc || document).documentElement;
  el.style.removeProperty('--maroon');
  el.style.removeProperty('--gold');
  delete el.dataset.agTeam;
}

/* ------------------------------------------------------------------ *
 * SEARCH - teams and nothing else.
 * ------------------------------------------------------------------ */

/** Prefix hits first, then anything containing the query. Case- and space-insensitive. */
export function matchTeams(teams, q) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return teams;
  const head = [], tail = [];
  for (const t of teams) {
    const fields = [t.short, t.name, t.abbrev].filter(Boolean).map((x) => String(x).toLowerCase());
    if (fields.some((f) => f.startsWith(s))) head.push(t);
    else if (fields.some((f) => f.includes(s))) tail.push(t);
  }
  return head.concat(tail);
}

/** A-Z, with everything that does not start with a letter under '#'. */
export function sectionKey(team) {
  const c = String((team && (team.short || team.name)) || '#').trim()[0] || '#';
  const u = c.toUpperCase();
  return u >= 'A' && u <= 'Z' ? u : '#';
}

export function byName(a, b) {
  return String(a.short || a.name).localeCompare(String(b.short || b.name));
}

/* ------------------------------------------------------------------ */

export async function previewData(fixtures, state) {
  const teams = Object.values(fixtures.teams.teams).sort(byName);
  /* Deliberately not chosen to flatter. Auburn is the first record in the real
   * file and its primary is a NAVY - one of the three colors this component has
   * to survive. The null case is a real team with nothing on file. */
  const navy = teams.find((t) => normalizeColor(t.primary) && luminance(normalizeColor(t.primary)) < 0.05);
  const yellow = teams.find((t) => normalizeColor(t.primary) && luminance(normalizeColor(t.primary)) > 0.5);
  const none = teams.find((t) => !normalizeColor(t.primary) && !normalizeColor(t.secondary));
  const query = state === 'searching' ? 'ari' : state === 'no-results' ? 'zzzz' : '';
  return { teams, query, chosen: navy || teams[0], samples: { navy, yellow, none } };
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/* 🔴 STUB, AND IT IS NAMED ONE. The mark is a cockatoo head, filled, beak open
 * mid-screech. NOBODY HAS DRAWN IT. This reserves its footprint - 40px, the top
 * left corner the bar puts a logo in - and draws a hairline frame and nothing
 * else. It does not guess at the bird. A faked mark is worse than an empty slot
 * because the next session inherits it as a decision. */
function markSlot() {
  const s = el('div', 'l1-mark');
  s.dataset.stub = 'mark-cockatoo';
  s.setAttribute('aria-label', 'Any Given');
  s.setAttribute('role', 'img');
  return s;
}

function check() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '14'); svg.setAttribute('height', '14');
  svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('class', 'l1-check');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', 'M2 8.5 L6 12.5 L14 3.5');
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', 'currentColor');
  p.setAttribute('stroke-width', '2');
  p.setAttribute('stroke-linecap', 'round');
  p.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(p);
  return svg;
}

function tile(team, selected, onPick) {
  const b = el('button', 'l1-tile');
  b.type = 'button';
  b.setAttribute('aria-pressed', selected ? 'true' : 'false');
  const top = el('span', 'l1-tile-top');
  top.appendChild(teamChip(team, { size: 26 }));
  if (selected) top.appendChild(check());
  const nm = el('span', 'l1-tile-name', team.short || team.name);
  b.append(top, nm);
  b.addEventListener('click', () => onPick(team));
  return b;
}

/** The browse. Real sections over the real list - no page, no window, no cap. */
function grid(teams, selectedId, onPick) {
  const wrap = el('div', 'l1-list');
  let key = null, section = null;
  for (const t of teams) {
    const k = sectionKey(t);
    if (k !== key) {
      key = k;
      wrap.appendChild(el('h2', 'l1-letter', k));
      section = el('div', 'l1-grid');
      wrap.appendChild(section);
    }
    section.appendChild(tile(t, t.id === selectedId, onPick));
  }
  return wrap;
}

export function render(root, data, state) {
  root.innerHTML = '';
  root.className = 'ag-main scr-l1-cold';
  root.dataset.state = state;

  const style = el('style');
  style.textContent = [TEAM_CHIP_CSS, STATES_CSS].join('\n');
  root.appendChild(style);

  const teams = (data && data.teams) || [];
  const samples = (data && data.samples) || {};

  /* ---------- the fixed headline. It does not move with the list ---------- */
  const listStates = state === 'ready' || state === 'searching' || state === 'no-results';

  const head = el('div', 'l1-head');
  const bar1 = el('div', 'l1-bar');
  bar1.appendChild(markSlot());
  /* Skip belongs to the chooser and nowhere else. It was drawn on every route
   * first time out, which put a dead control top-right of the confirmation and
   * offered a way to skip on the screen that says you already skipped. */
  const skip = el('button', 'l1-skip', 'Skip');
  skip.type = 'button';
  if (listStates) bar1.appendChild(skip);
  head.appendChild(bar1);

  const h1 = el('h1', 'l1-h1', 'Any Given…');
  head.appendChild(h1);

  let search = null, count = null, listHost = null;
  if (listStates) {
    const lead = el('p', 'l1-lead', 'Start with your team. No account, no email.');
    head.appendChild(lead);

    const field = el('div', 'l1-field');
    search = el('input', 'l1-search');
    search.type = 'search';
    search.placeholder = 'Search teams';
    search.setAttribute('aria-label', 'Search teams');
    search.autocomplete = 'off';
    search.enterKeyHint = 'search';
    search.value = (data && data.query) || '';
    field.appendChild(search);
    head.appendChild(field);

    count = el('p', 'l1-count num');
    head.appendChild(count);
  }
  root.appendChild(head);

  /* ---------- state routes ---------- */
  if (state === 'loading') {
    root.appendChild(stateBlock('loading', { rows: 6, body: 'Loading the team list…' }));
    return;
  }
  if (state === 'offline') {
    /* The list ships with the app, so offline does NOT block the pick - it blocks
     * confirming it. Saying that is the whole difference between a dead screen
     * and a usable one, and the bar has no version of this at all. */
    root.appendChild(stateBlock('offline', {
      title: 'You are offline',
      body: 'The team list is already on your phone, so you can still pick. Everything else waits for a connection.',
      since: Date.now() - 31000,
      action: { label: 'Try again' }
    }));
    return;
  }
  if (state === 'error') {
    root.appendChild(stateBlock('error', {
      title: 'That did not load',
      body: 'The team list did not open. You can skip and set a team later — nothing about the app depends on it.',
      action: { label: 'Reload' }
    }));
    const alt = el('button', 'l1-primary', 'Skip and use the default colors');
    alt.type = 'button';
    alt.addEventListener('click', () => { clearRootAccent(); render(root, data, 'skipped'); });
    root.appendChild(alt);
    return;
  }

  if (state === 'chosen') {
    const team = (data && data.chosen) || null;
    const pair = applyRootAccent(team, document);
    root.appendChild(confirmPanel(team, pair, {
      onChange: () => { clearRootAccent(); render(root, data, 'ready'); }
    }));
    return;
  }

  if (state === 'skipped') {
    clearRootAccent();
    const card = el('div', 'card l1-panel');
    card.appendChild(el('p', 'l1-panel-title', 'Using the default colors'));
    card.appendChild(el('p', 'l1-panel-body',
      'Skipping costs you nothing. The pool, the slate and the live board all work — the app just wears its own colors instead of a school’s.'));

    /* The honest footnote, and it is the reason Skip has to be a real route
     * rather than a dismissal: for more than half the file a team pick changes
     * NOTHING about the colors anyway. */
    if (samples.none) {
      const row = el('div', 'l1-nullrow');
      row.appendChild(teamChip(samples.none, { size: 26 }));
      row.appendChild(el('span', 'l1-nullrow-text',
        `${samples.none.short} publishes no color either — 401 of 760 schools do not. They keep these same defaults.`));
      card.appendChild(row);
    }
    const back = el('button', 'l1-primary', 'Pick a team after all');
    back.type = 'button';
    back.addEventListener('click', () => render(root, data, 'ready'));
    card.appendChild(back);
    root.appendChild(card);
    return;
  }

  /* ---------- ready / searching / no-results: one live screen ---------- */
  listHost = el('div', 'l1-host');
  root.appendChild(listHost);

  const foot = el('div', 'l1-confirm');
  foot.hidden = true;
  root.appendChild(foot);

  let selected = null;

  function pick(team) {
    selected = team;
    applyRootAccent(team, document);
    draw();
  }

  skip.addEventListener('click', () => {
    selected = null;
    clearRootAccent();
    render(root, data, 'skipped');
  });

  function drawFoot() {
    foot.innerHTML = '';
    if (!selected) { foot.hidden = true; return; }
    foot.hidden = false;
    const row = el('div', 'l1-confirm-row');
    row.appendChild(teamChip(selected, { size: 26 }));
    row.appendChild(el('span', 'l1-confirm-name', selected.short || selected.name));
    foot.appendChild(row);
    const go = el('button', 'l1-primary', `Start with ${selected.short || selected.name}`);
    go.type = 'button';
    go.addEventListener('click', () => render(root, { ...data, chosen: selected }, 'chosen'));
    foot.appendChild(go);
  }

  function draw() {
    const q = search.value;
    const hits = matchTeams(teams, q);
    listHost.innerHTML = '';
    count.textContent = q.trim()
      ? `${hits.length} of ${teams.length} teams`
      : `${teams.length} teams`;
    if (!hits.length) {
      listHost.appendChild(stateBlock('empty', {
        title: 'No team by that name',
        body: 'Any Given searches teams and nothing else — there are no leagues or players in this app to find.',
        action: { label: 'Show all ' + teams.length + ' teams', onClick: () => { search.value = ''; draw(); } }
      }));
    } else {
      listHost.appendChild(grid(hits, selected && selected.id, pick));
    }
    drawFoot();
  }

  search.addEventListener('input', draw);
  draw();
}

function confirmPanel(team, pair, handlers) {
  const card = el('div', 'card l1-panel');
  const hero = el('div', 'l1-hero');
  hero.appendChild(teamChip(team, { size: 40 }));
  hero.appendChild(el('span', 'l1-hero-name', (team && team.name) || 'Unknown team'));
  card.appendChild(hero);

  card.appendChild(el('p', 'l1-panel-body', accentSentence(team, pair)));

  const go = el('button', 'l1-primary', 'Open the slate');
  go.type = 'button';
  card.appendChild(go);

  const change = el('button', 'l1-secondary', 'Choose a different team');
  change.type = 'button';
  change.addEventListener('click', handlers.onChange);
  card.appendChild(change);
  return card;
}
