/* P1 - THE INVITE LANDING.
 *
 * Somebody was sent a link in a group text. They open it on a phone, in a browser,
 * with NO ACCOUNT AND NO APP. POOL-SCREENS.md: "The most important screen in the
 * product and the only one with no precedent to copy."
 *
 * BAR - AND ALL THREE ARE COUNTER-EXAMPLES. There is no product on disk that does
 * this right; there are three that do it wrong, and they were opened and looked at
 * before a line of this was written:
 *
 *   reference/officepool-teardown/screens/OP-cold-entry-signed-out-393.png
 *     Captured at 393px, 2026-09-08, from a live NCAA pick'em product. A stranger
 *     following an invite link gets Email, Password, Sign In, Create Account,
 *     Forgot Password on a blue gradient. NOTHING ABOUT THE POOL IS VISIBLE - not
 *     its name, not its commissioner, not one fixture - and the card is clipped off
 *     the right edge at the design width. Its own teardown README calls it "the
 *     most damning of the three, because this is a pool product": its entire
 *     distribution is a commissioner sending a link to people who have never heard
 *     of it, and the link opens a password field.
 *   reference/armchair-quarterback-teardown/screens/AQB-LIVE-login-wall.png
 *     Logo, Email, Password, Login, Forgot Password, Sign Up. Nothing else exists.
 *   reference/armchair-quarterback-teardown/screens/AQB-LIVE-signup-form-dob-required.png
 *     SEVEN fields - email, player name, first, last, DATE OF BIRTH, password,
 *     confirm password - plus a terms checkbox, ahead of every screen they have.
 *
 * FOUR PICK'EM PRODUCTS ARE ON DISK AND ALL FOUR ASK FIRST. This screen is the
 * argument against them, so it is built as their exact inverse:
 *
 *   - the pool's name, its commissioner and its member count are the first words
 *   - THE SLATE IS SHOWN, not described - real teams, real chips, real kickoffs
 *   - one primary action, and NOTHING is asked before it
 *   - no email, no password, no date of birth, no install prompt, no price
 *   - a display name is the most that may ever be asked and it is asked AFTER the
 *     first pick, which means it does not appear anywhere on this screen
 *   - EVEN THE DEAD ENDS SHOW THE SLATE. Pool full, link expired - you still see
 *     every game. A locked door you can see through is not an account wall.
 *
 * TYPES: the view data follows Pool / SlateGame / TeamIdentity in src/lib/types.ts.
 * A browser ES module cannot import a .ts file and there is no build step, so the
 * shapes are honored by name in JSDoc and NOT re-declared. See COULD NOT CLOSE.
 */
import { stateBlock, STATES_CSS } from '/components/states.js';
import { teamChip, TEAM_CHIP_CSS, normalizeColor } from '/components/team-chip.js';
import { kickoff, progress, dash } from '/components/fmt.js';

export const id = 'p1-invite';
export const title = 'Invite landing - a stranger, a link, no account';
export const bar = 'reference/officepool-teardown/screens/OP-cold-entry-signed-out-393.png';

/* The five every screen with data owes, plus the three real ones POOL-SCREENS
 * names for this screen, plus one proof route.
 *
 * `colors` IS NOT A PRODUCT STATE. It is the team-color survival check the
 * contract fails a pool component for skipping - navy, yellow and null, and EVERY
 * PAIR of those including navy-on-navy - rendered as a route because the only way
 * to satisfy it is to look at it. Every team in it is real, read out of
 * fixtures/teams.json by color, never chosen by hand and never invented. */
export const states = ['ready', 'empty', 'loading', 'offline', 'error', 'full', 'expired', 'member', 'colors'];

const STATUS = {
  STATUS_FINAL: 'final',
  STATUS_IN_PROGRESS: 'in_progress',
  STATUS_SCHEDULED: 'scheduled',
  STATUS_POSTPONED: 'void',
  STATUS_CANCELED: 'void'
};

/* ---------------------------------------------------------------- preview data */

/** One captured ESPN game -> one SlateGame. Nothing here is derived that the
 *  capture does not carry: the ids, the kickoff, the scores and the status are
 *  read straight off the fixture. THE STATUS IS NOT OVERRIDDEN. All three
 *  captures are FINAL and the slate says so - see COULD NOT CLOSE. */
function toSlateGame(doc, teams) {
  const c = doc.header.competitions[0];
  const home = c.competitors.find((x) => x.homeAway === 'home');
  const away = c.competitors.find((x) => x.homeAway === 'away');
  const num = (v) => (v == null || v === '' ? null : Number(v));
  return {
    id: doc.header.id,
    week: doc.header.week,
    kickoffUtc: Date.parse(c.date),
    home: teams[home.team.id] || null,
    away: teams[away.team.id] || null,
    homeScore: num(home.score),
    awayScore: num(away.score),
    status: STATUS[c.status.type.name] || 'scheduled',
    spread: null            // pool.ats is false. The captured line is not shown
  };
}

/** The pair matrix for the `colors` route. Real teams, picked from the real file
 *  by measuring their primary - not by name, not by hand. */
function colorPairs(all) {
  const band = (fn) => all
    .filter((t) => { const h = normalizeColor(t.primary); return h && fn(h); })
    .sort((a, b) => Number(a.id) - Number(b.id));
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const navy = band((h) => { const [r, g, b] = rgb(h); return b > 60 && b < 130 && r < 60 && g < 70; });
  const gold = band((h) => { const [r, g, b] = rgb(h); return r > 200 && g > 160 && b < 90; });
  const none = all.filter((t) => !normalizeColor(t.primary)).sort((a, b) => Number(a.id) - Number(b.id));
  const P = (a, b, label) => ({ a, b, label });
  return [
    P(navy[0], navy[1], 'navy + navy'),
    P(navy[0], gold[0], 'navy + yellow'),
    P(navy[0], none[0], 'navy + null'),
    P(gold[0], gold[1], 'yellow + yellow'),
    P(gold[0], none[0], 'yellow + null'),
    P(none[0], none[1], 'null + null')
  ].filter((p) => p.a && p.b);
}

export async function previewData(fixtures, state) {
  const teams = fixtures.teams.teams;
  const docs = await Promise.all(fixtures.games.map((n) => fixtures.load(n)));
  const slate = docs.map((d) => toSlateGame(d, teams)).sort((a, b) => a.kickoffUtc - b.kickoffUtc);

  /* 🔴 STUB. There is no pool fixture and there is no invite fixture, so the pool
   * IDENTITY below is invented and is named as invented in the return. Everything
   * on the slate is real. */
  const pool = {
    id: 'K7RNQZ',
    name: 'Sunday Group Text',
    commissioner: 'Jason R.',
    memberCount: 7,
    seats: 20,
    week: slate.length ? slate[0].week : null,
    season: 2026,
    ats: false,
    scoring: 'Straight up'
  };

  return {
    pool,
    slate,
    picked: state === 'member' ? 0 : null,
    pairs: state === 'colors' ? colorPairs(Object.values(teams)) : null,
    teamCount: Object.keys(teams).length
  };
}

/* -------------------------------------------------------------------- drawing */

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/** One team line inside a game row. The chip carries the two colors and the
 *  abbreviation; the NAME IN TYPE carries the identification. That is the whole
 *  no-marks argument, and it is why this line still works for the 401 schools with
 *  no usable primary. */
function sideLine(team, score, result, opponent) {
  const line = el('div', 'p1-side');
  if (result) line.dataset.result = result;
  line.appendChild(teamChip(team || {}, { size: 20, adjacentTo: opponent || null }));
  line.appendChild(el('span', 'p1-name', (team && team.short) || (team && team.name) || 'Unknown team'));
  const s = el('span', 'p1-score num', score == null ? dash(null) : String(score));
  line.appendChild(s);
  return line;
}

/** A game, as a stranger sees it before anything has been asked of them. */
function gameRow(g) {
  const row = el('div', 'p1-game');
  const won = (a, b) => (a == null || b == null ? null : a > b ? 'won' : a < b ? 'lost' : 'push');
  row.appendChild(sideLine(g.away, g.awayScore, won(g.awayScore, g.homeScore), g.home));
  row.appendChild(sideLine(g.home, g.homeScore, won(g.homeScore, g.awayScore), g.away));

  const meta = el('div', 'p1-meta num');
  const bits = [kickoff(g.kickoffUtc)];
  if (g.status === 'final') bits.push('Final');
  else if (g.status === 'in_progress') bits.push('Live');
  else if (g.status === 'void') bits.push('Void');
  else bits.push('Locks at kickoff');
  meta.textContent = bits.join(' · ');
  row.appendChild(meta);
  return row;
}

/** The pool, named. Four products on disk get to this screen without showing one
 *  of these four facts. */
function poolHead(pool, kicker) {
  const box = el('header', 'p1-head');
  box.appendChild(el('p', 'p1-kicker', kicker || 'You have been invited to'));
  box.appendChild(el('h1', 'p1-title', pool.name));
  const line = el('p', 'p1-by num');
  line.textContent = `${pool.commissioner}’s pool · ${pool.memberCount} of ${pool.seats} in · ${pool.season}`;
  box.appendChild(line);
  return box;
}

/** THE one primary action. 44px floor, 9px radius, accent background.
 *  Its text color reads --card, because --accent SWAPS TOKEN between themes and
 *  --card swaps with it: white on maroon in light, near-black on gold in dark.
 *  There is no --on-accent token, this screen may not add one to a session-owned
 *  file, and a hard-coded #fff is invisible on gold. */
function primary(label, opts) {
  opts = opts || {};
  const b = el('button', 'p1-cta', label);
  b.type = 'button';
  if (opts.disabled) { b.disabled = true; b.setAttribute('aria-disabled', 'true'); }
  return b;
}

function notice(title, body) {
  const n = el('div', 'p1-notice');
  n.setAttribute('role', 'status');
  n.appendChild(el('p', 'p1-notice-title', title));
  if (body) n.appendChild(el('p', 'p1-notice-body', body));
  return n;
}

/** The slate card. THE SLATE IS THE SCREEN. It is drawn in every state that knows
 *  what the games are, including the two states where the visitor cannot join. */
function slateCard(pool, slate) {
  const card = el('section', 'card p1-slate');
  card.setAttribute('aria-label', 'The week’s slate');

  const cap = el('div', 'p1-slate-head');
  cap.appendChild(el('span', 'p1-week num', pool.week == null
    ? 'This week' : `Week ${pool.week} · ${slate.length} ${slate.length === 1 ? 'game' : 'games'}`));
  /* The teardown's one clean take: the scoring rule lives where the picking
   * happens, so the rules screen does not have to be a screen. */
  cap.appendChild(el('span', 'p1-rule', `${pool.scoring} · each pick locks at its own kickoff`));
  card.appendChild(cap);

  for (const g of slate) card.appendChild(gameRow(g));
  return card;
}

/* ------------------------------------------------------------------ the screen */

export function render(rootEl, data, state) {
  rootEl.innerHTML = '';
  rootEl.classList.add('scr-p1-invite');
  const style = el('style');
  style.textContent = [STATES_CSS, TEAM_CHIP_CSS].join('\n');
  rootEl.appendChild(style);

  /* 🔴 EVERYTHING GOES IN ONE COLUMN ELEMENT, and this is a real bug found by
   * looking rather than a tidiness preference. shell.css turns .ag-main into a
   * two-column grid above 1200px - minmax(0,560px) then the aside - so a screen
   * that appends its parts straight to the root has them AUTO-PLACED into that
   * grid. Rendered at 1400px this screen put the pool head in column one and the
   * full-width maroon primary button alone in column two: a 600px slab of accent
   * beside a lake of empty, which is the exact CBS desktop failure shell.css was
   * written to answer. One wrapper makes the screen ONE grid item, so it takes the
   * measure column and the aside stays empty.
   * No test in this repo could have caught it - requirement 7.5, again. */
  const root = el('div', 'p1-col');
  rootEl.appendChild(root);

  const pool = (data && data.pool) || null;
  const slate = (data && data.slate) || [];

  /* THE COLOR PROOF ROUTE. Not a product state - the contract's team-color
   * survival check, made visible. */
  if (state === 'colors') {
    root.appendChild(el('h1', 'p1-title', 'Team color survival'));
    root.appendChild(el('p', 'p1-lede',
      'Navy, yellow and null, and every pair of those. Every team below is real, read out of the '
      + `${(data && data.teamCount) || 0}-school file by measuring its primary. 401 have no usable primary and 393 have no secondary at all.`));
    const card = el('section', 'card p1-slate');
    for (const p of (data.pairs || [])) {
      const row = el('div', 'p1-game');
      row.appendChild(sideLine(p.a, null, null, p.b));
      row.appendChild(sideLine(p.b, null, null, p.a));
      row.appendChild(el('div', 'p1-meta num', p.label));
      card.appendChild(row);
    }
    root.appendChild(card);
    root.appendChild(el('p', 'p1-foot',
      'A dashed ring is a school with no captured color. It says so rather than pretending to be gray.'));
    return;
  }

  /* NOTHING SITS IN FRONT OF THE SLATE. Not an account wall, not a date of birth,
   * not an install prompt, not a price. The first thing drawn is the pool - IN
   * EVERY STATE, including the broken ones. The link carries the pool code and the
   * Worker renders the name into the shell, so a failure to reach the slate never
   * costs the visitor the answer to "what is this?" */
  if (pool) root.appendChild(poolHead(pool, state === 'member' ? 'You are in' : null));

  if (state === 'loading') {
    /* THE POOL IS NAMED WHILE THE SLATE IS STILL COMING, and that is deliberate
     * rather than an artifact: the invite link is the distribution, so the Worker
     * that serves it knows which pool it is and renders the name into the shell.
     * The slate is the only thing being waited for.
     *
     * The button is drawn disabled rather than withheld, so the layout does not
     * jump when the slate lands. Same argument as the skeleton and as tabular
     * numbers: a thing that moves under you is a thing you stop trusting. */
    root.appendChild(primary('Join this pool', { disabled: true }));
    root.appendChild(stateBlock('loading', { rows: 3, body: 'Getting the slate…' }));
    return;
  }

  if (state === 'offline') {
    root.appendChild(stateBlock('offline', {
      title: 'You are offline',
      body: 'The invite is still good. Nothing has been asked of you and nothing has been lost.',
      since: Date.now() - 47000,
      action: { label: 'Try again' }
    }));
    return;
  }

  if (state === 'error') {
    root.appendChild(stateBlock('error', {
      body: 'The invite did not load. It has not been used up — open the link again.',
      action: { label: 'Reload' }
    }));
    return;
  }

  if (state === 'full') {
    /* A closed pool STILL SHOWS ITS GAMES. This is the whole argument in one
     * state: the reason you cannot come in is a sentence, not a password field. */
    root.appendChild(notice('This pool is full',
      `All ${pool.seats} seats are taken. ${pool.commissioner} can open more.`));
    root.appendChild(slateCard(pool, slate));
    root.appendChild(el('p', 'p1-foot', 'You can still see every game in it. Nothing here needs an account.'));
    return;
  }

  if (state === 'expired') {
    root.appendChild(notice('This invite link has expired',
      `Links last a week. ${pool.commissioner} can send another one.`));
    root.appendChild(primary('Ask for a new link'));
    root.appendChild(slateCard(pool, slate));
    return;
  }

  if (state === 'member') {
    root.appendChild(notice('You are already in this pool',
      progress(data.picked || 0, slate.length)));
    root.appendChild(primary('Go to your picks'));
    root.appendChild(slateCard(pool, slate));
    return;
  }

  if (state === 'empty') {
    /* THE SLATE IS NOT PUBLISHED YET AND THE POOL IS STILL SHOWN. The one thing
     * the incumbents' cold entry cannot do is exist without data. */
    root.appendChild(primary('Join this pool'));
    root.appendChild(stateBlock('empty', {
      title: 'The slate is not out yet',
      body: `${pool.commissioner} has not set which games count. You can join now and the games will be here when they are.`
    }));
    root.appendChild(el('p', 'p1-foot', 'Still no account, still no cost.'));
    return;
  }

  /* READY. */
  root.appendChild(primary('Join this pool'));
  root.appendChild(slateCard(pool, slate));

  /* Identity is deferred, and the screen says so out loud - because the thing it
   * is defined against is a stranger being asked for a date of birth first. */
  root.appendChild(el('p', 'p1-foot',
    'No account, no app, no cost. After your first pick we ask what to call you — nothing before it.'));
}
