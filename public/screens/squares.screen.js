/* BIG GAME SQUARES - #/squares, the pool of a group whose sport is 'squares'.
 *
 * Jason, 2026-09-13, asked for "that usual thing" - the office grid - on the Big
 * Game, then "do the big game squares next". The app never says the game's name:
 * it is the NFL's trademark, so every word on this screen says "the Big Game".
 *
 * One 10 x 10 grid per group. Members claim squares until kickoff; at kickoff the
 * server draws the digits 0-9 at random, once down the left for the home team (the
 * rows) and once across the top for the away team (the columns). At the end of the
 * 1st quarter, halftime, the end of the 3rd and the final, the square where the last
 * digit of each score meets scores that moment's points. A square nobody claimed
 * scores nobody. Points only.
 *
 * The Worker is src/squares-pool.ts; the rules are src/lib/squares.ts, the one copy
 * this screen imports too (BIG_GAME, PERIODS, cellOf). The server is the only clock:
 * the lock is read against the `now` it sent, carried forward on this phone's clock,
 * and a claim after kickoff is refused there whatever this screen thinks.
 *
 * 🔴 POOL FIRST (Jason, 2026-09-13). Somebody signed out, or signed in with no squares
 * group, sees the grid itself - empty, "?" for the digits, "Home team" / "Away team" -
 * with a Start a group / Join a group pair on it. The first tap on a square asks:
 * signed out, the sign-in sheet (then the claim goes on if a group is there); signed
 * in with no group, a small inline Start / Join sheet. Never a full-screen wall.
 *
 * 🔴 IT RE-DRAWS A HOST, NOT #root. The shell appends the ad slot to #root after the
 * first render (props.screen.js draws the same way).
 */
import { stateBlock, STATES_CSS } from '/components/states.js';
import { pageHeader, HEADER_CSS } from '/components/header.js';
import { myGroups, currentGroupId, setCurrentGroupId, groupSwitcher, forgetGroups, GROUP_CSS } from '/components/group.js';
import { startJoinCard, startJoinSheet, noGroupTap, START_JOIN_CSS } from '/components/start-join.js';
import { BIG_GAME, PERIODS, SQUARES_LIMITS, cellOf } from '/src/lib/squares.js';

export const id = 'squares';
export const title = 'Big Game squares';
export const bar = null;
export const states = ['ready', 'signed-out', 'no-group', 'loading', 'offline', 'error'];

export const SQUARES_SPORT = 'squares';

/** The rules, two lines - under the grid a person has not played yet. The points
 *  are src/lib/squares.ts PERIODS. */
export const RULES_SHORT = 'Claim squares until kickoff. At kickoff the numbers 0–9 are drawn at random for each '
  + 'team, and at each quarter the square where the last digits of the two scores meet scores points.';
export const RULES_FULL = 'Claim squares on a 10 × 10 grid until kickoff. At kickoff the numbers 0–9 are drawn '
  + 'at random for each team. At the end of each quarter the square where the last digits of the two scores meet '
  + 'scores points - 1st quarter 1, halftime 2, 3rd quarter 1, final 3 (overtime counts in the final). '
  + 'A square nobody claimed scores nobody.';

/* ------------------------------------------------------------------ *
 * PURE - tests/squares-screen.test.mjs runs these against responses built by
 * the real src/squares-pool.ts from the real ESPN captures.
 * ------------------------------------------------------------------ */

/** Only the groups that play squares. */
export function squaresGroupsOf(groups) {
  return (Array.isArray(groups) ? groups : []).filter((g) => g && g.id && g.sport === SQUARES_SPORT);
}

/** The current group when it plays squares, else the first that does. */
export function chooseGroup(groups, currentId) {
  if (!groups || !groups.length) return null;
  return groups.find((g) => g.id === currentId) || groups[0];
}

/** Two letters for a square: the first of two words, or the first two of one.
 *  "Ann Lee" -> "AL", "commish" -> "CO", "@cora" -> "CO". */
export function initials(name) {
  const s = String(name == null ? '' : name).trim().replace(/^@+/, '');
  if (!s) return '';
  const words = s.split(/[\s._-]+/).filter(Boolean);
  const letters = words.length > 1 ? [Array.from(words[0])[0], Array.from(words[1])[0]] : Array.from(words[0] || s).slice(0, 2);
  return letters.join('').toUpperCase();
}

const HEX = /^#[0-9a-f]{6}$/i;

/** One side of the grid: the team once ESPN names it, "Home team" / "Away team"
 *  while it is TBD. `color` is null when there is none to use - the CSS falls back
 *  to --team-null. */
export function sideOf(team, home) {
  if (!team) {
    return { name: home ? 'Home team' : 'Away team', abbrev: home ? 'Home' : 'Away', color: null, known: false };
  }
  const color = HEX.test(String(team.primary || '')) ? String(team.primary) : null;
  return { name: String(team.name || team.short || team.abbrev), abbrev: String(team.abbrev || team.short || ''), color, known: true };
}

const SHORT = { q1: 'Q1', half: 'HT', q3: 'Q3', final: 'F' };

/** A winning square's mark: the moments it hit, then their points - "HT+2", "Q1·F+4". */
export function winTag(list) {
  if (!list || !list.length) return '';
  return list.map((r) => SHORT[r.key] || r.label).join('·') + '+' + list.reduce((n, r) => n + (Number(r.points) || 0), 0);
}

/** Everything the grid draws, from GET /api/squares. */
export function gridModel(d) {
  const digits = d && d.digits && Array.isArray(d.digits.rows) && Array.isArray(d.digits.cols) ? d.digits : null;
  const game = (d && d.game) || null;
  const home = sideOf(game && game.home, true);
  const away = sideOf(game && game.away, false);
  const wins = new Map();
  for (const r of (d && d.results) || []) {
    if (!wins.has(r.cell)) wins.set(r.cell, []);
    wins.get(r.cell).push(r);
  }
  /* The square the score is on now - the one the next moment pays, and at the final
     the final's own. Only once there is a draw and a score. */
  let current = null;
  if (digits && game && (game.status === 'live' || game.status === 'final')
      && Number.isFinite(game.homeScore) && Number.isFinite(game.awayScore)) {
    current = cellOf(digits, game.homeScore, game.awayScore);
  }
  const cells = Array.from({ length: SQUARES_LIMITS.cells }, (_, i) => {
    const c = (d && Array.isArray(d.cells) && d.cells[i]) || null;
    const row = Math.floor(i / 10), col = i % 10;
    const w = wins.get(i) || [];
    return {
      i, row, col, taken: !!c, mine: !!(c && c.mine), name: c ? String(c.name || '') : '', text: c ? initials(c.name) : '',
      rowDigit: digits ? digits.rows[row] : null, colDigit: digits ? digits.cols[col] : null,
      wins: w.map((r) => ({ key: r.key, label: r.label, points: r.points })), tag: winTag(w), current: i === current
    };
  });
  const q = (a) => (digits ? a.map(String) : Array(10).fill('?'));
  return { drawn: !!digits, rows: q(digits ? digits.rows : []), cols: q(digits ? digits.cols : []), home, away, cells, current };
}

/** What a square is called aloud: where it sits, who holds it, what it won. */
export function cellLabel(c, m) {
  const where = m.drawn ? m.home.abbrev + ' ' + c.rowDigit + ', ' + m.away.abbrev + ' ' + c.colDigit
    : 'Row ' + (c.row + 1) + ', column ' + (c.col + 1);
  const who = c.mine ? 'yours' : c.taken ? (c.name || 'taken') : 'open';
  const won = c.wins.map((w) => w.label + ' square, ' + w.points + (w.points === 1 ? ' point' : ' points'));
  return [where, who, ...won, ...(c.current ? ['the score is on it now'] : [])].join(', ');
}

const WEEK = 6 * 86400000;

/** "Locks Sun 3:30 PM" within the week, "Locks Sun, Feb 14 · 3:30 PM" past it, "Locked"
 *  from kickoff on - in the phone's own time zone (`tz` is for the tests), the way
 *  props.screen.js says a question's lock. */
export function lockText(lockAt, now, tz) {
  if (!(now < lockAt)) return 'Locked';
  const o = tz ? { timeZone: tz } : {};
  const d = new Date(lockAt);
  const time = d.toLocaleTimeString('en-US', { ...o, hour: 'numeric', minute: '2-digit' });
  if (lockAt - now < WEEK) return 'Locks ' + d.toLocaleDateString('en-US', { ...o, weekday: 'short' }) + ' ' + time;
  return 'Locks ' + d.toLocaleDateString('en-US', { ...o, weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + time;
}

/** "Sun, Feb 14" - the game's day, in the phone's time zone. */
export function gameDay(ms, tz) {
  return new Date(ms).toLocaleDateString('en-US', { ...(tz ? { timeZone: tz } : {}), weekday: 'short', month: 'short', day: 'numeric' });
}

/** "NE 13 – SEA 29", home first (the home team is the rows), or '' with no score. */
export function scoreText(g) {
  if (!g || !Number.isFinite(g.homeScore) || !Number.isFinite(g.awayScore)) return '';
  const h = g.home ? g.home.abbrev : 'Home', a = g.away ? g.away.abbrev : 'Away';
  return h + ' ' + g.homeScore + ' – ' + a + ' ' + g.awayScore;
}

/** The pinned line. Before kickoff: what you hold, what is taken, when it locks.
 *  From kickoff: Locked and the score - Final once it is. */
export function summaryLine(d, now, tz) {
  const mine = Number(d && d.myCount) || 0;
  const max = Number(d && d.maxPerPerson) || SQUARES_LIMITS.maxDefault;
  const taken = Number(d && d.taken) || 0;
  const locked = (d && d.locked === true) || !(now < Number(d && d.lockAt));
  if (!locked) return 'You hold ' + mine + ' of ' + max + ' · ' + taken + ' of 100 taken · ' + lockText(Number(d.lockAt), now, tz);
  const st = scoreText(d.game);
  if (st && d.game.status === 'final') return 'Final · ' + st + ' · You hold ' + mine;
  if (st) return 'Locked · ' + st + ' · You hold ' + mine;
  return 'Locked · You hold ' + mine + ' · ' + taken + ' of 100 taken';
}

export const pointsText = (n) => n + (n === 1 ? ' pt' : ' pts');
const lastDigit = (n) => String(((Number(n) % 10) + 10) % 10);

/** Under the grid: every scoring moment - its score, its square and who holds it
 *  once it has passed ("Halftime · NE 0 – SEA 9 · square 09 · Ann · +2", or
 *  "nobody’s square"), what it is worth while it is to come. The square is named by
 *  the two digits that meet: home first, as the rows are. */
export function resultsList(d) {
  const got = new Map(((d && d.results) || []).map((r) => [r.key, r]));
  const g = (d && d.game) || null;
  const h = g && g.home ? g.home.abbrev : 'Home', a = g && g.away ? g.away.abbrev : 'Away';
  return ((d && Array.isArray(d.periods) && d.periods.length ? d.periods : PERIODS)).map((p) => {
    const r = got.get(p.key);
    if (!r) return { key: p.key, label: p.label, points: p.points, done: false, mine: false, nobody: false,
                     text: p.label + ' · ' + pointsText(p.points) + ' · to come' };
    const nobody = r.name == null;
    return {
      key: p.key, label: p.label, points: p.points, done: true, mine: !!r.mine, nobody,
      text: p.label + ' · ' + h + ' ' + r.home + ' – ' + a + ' ' + r.away + ' · square ' + lastDigit(r.home) + lastDigit(r.away)
        + ' · ' + (nobody ? 'nobody’s square' : (r.name || 'Someone') + ' · +' + r.points)
    };
  });
}

/** The commissioner's stepper: a whole number of squares per person, 1 to 100. */
export function stepMax(v, delta) {
  const n = Math.round(Number(v));
  const base = Number.isFinite(n) ? n : SQUARES_LIMITS.maxDefault;
  return Math.min(SQUARES_LIMITS.maxMax, Math.max(1, base + (Number(delta) || 0)));
}

/** A grid to look at before anybody has a group: empty, no draw, the Big Game's
 *  kickoff - the same shape GET /api/squares answers with. */
export function previewGrid(now) {
  return { cells: Array(SQUARES_LIMITS.cells).fill(null), digits: null, game: null, results: [], periods: PERIODS,
           lockAt: BIG_GAME.kickoffUtc, locked: !(now < BIG_GAME.kickoffUtc), myCount: 0, taken: 0,
           maxPerPerson: SQUARES_LIMITS.maxDefault };
}

/** One sentence for a failed call: the server's own words when it sent some. */
export function failText(r, fallback) {
  if (r && r.offline) return 'No connection. Nothing was changed.';
  return (r && r.j && typeof r.j.message === 'string' && r.j.message) || fallback;
}

/* ------------------------------------------------------------------ *
 * DATA - fetched in previewData and after a tap, never during a draw.
 * ------------------------------------------------------------------ */

const apiFn = () => (typeof window !== 'undefined' && window.agApiFetch) || fetch;

/** One call. Never throws. */
export async function call(api, url, body) {
  const opts = body === undefined ? undefined
    : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
  try {
    const r = await api(url, opts);
    let j = {};
    try { j = (await r.json()) || {}; } catch { /* an empty body is still an answer */ }
    return { ok: r.ok, status: r.status, j };
  } catch { return { ok: false, status: 0, j: {}, offline: true }; }
}

/** Claim a free square, or let one of yours go - the one write a member makes. */
export function cellAction(d, i) {
  const c = d && d.sq && Array.isArray(d.sq.cells) ? d.sq.cells[i] : null;
  return c && c.mine ? { path: '/api/squares/release', release: true } : { path: '/api/squares/claim', release: false };
}

/** The screen's whole state from the Worker. Never throws. */
export async function loadSquares(api, opts) {
  const base = { noSample: true };
  const mine = await myGroups(opts);
  if (!mine || !mine.signedIn) return { ...base, view: 'signed-out' };
  if (mine.error === 'offline') return { ...base, view: 'offline' };
  if (mine.error) return { ...base, view: 'error' };
  let groups = squaresGroupsOf(mine.groups);
  /* Twice at most: a cached list can name a group you have left. */
  for (let attempt = 0; attempt < 2; attempt++) {
    const g = chooseGroup(groups, currentGroupId());
    if (!g) return { ...base, view: 'no-group' };
    setCurrentGroupId(g.id);
    const r = await call(api, '/api/squares?pool=' + encodeURIComponent(g.id));
    if (r.offline) return { ...base, view: 'offline', groups, groupId: g.id };
    if (r.status === 401) return { ...base, view: 'signed-out' };
    if (r.ok && Array.isArray(r.j.cells)) {
      return { ...base, view: 'ready', groups, groupId: g.id, sq: r.j, skew: (Number(r.j.now) || Date.now()) - Date.now() };
    }
    if ((r.status === 403 || r.status === 409) && attempt === 0) {
      forgetGroups();
      setCurrentGroupId('');
      const again = await myGroups({ force: true });
      groups = squaresGroupsOf(again && again.groups);
      continue;
    }
    return { ...base, view: 'error', groups, groupId: g.id, message: failText(r, 'The grid did not load.') };
  }
  return { ...base, view: 'error', message: 'The grid did not load.' };
}

export async function previewData(fixtures, state) {
  /* Only `ready` - the route a person reaches - touches the network. Nothing on this
   * screen is sample data, so the shell's banner stays off. */
  if (state && state !== 'ready') return { noSample: true, view: state };
  return loadSquares(apiFn());
}

/* ------------------------------------------------------------------ *
 * RENDER
 * ------------------------------------------------------------------ */

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function btn(cls, text, onClick) {
  const b = el('button', cls, text);
  b.type = 'button';
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

export function render(root, data, state) {
  root.innerHTML = '';
  root.classList.add('scr-squares');
  const style = el('style');
  style.textContent = [STATES_CSS, HEADER_CSS, GROUP_CSS, START_JOIN_CSS].join('\n');
  root.appendChild(style);
  const host = el('div', 'sq');
  root.appendChild(host);
  draw(host, data || {}, state);
}

let SEQ = 0;

/** Load and draw again - after a switch or a sign-in. A slower answer that a newer
 *  one has replaced is dropped. `then` runs on the fresh state (the claim a signed-out
 *  tap was making). */
async function refresh(host, status, loading, then) {
  const seq = ++SEQ;
  if (loading) draw(host, { view: 'loading' }, 'loading');
  const next = await loadSquares(apiFn(), { force: true });
  if (seq !== SEQ || !host.isConnected) return;
  if (status) next.status = status;
  draw(host, next, 'ready');
  if (then) then(next);
}

/** Read the grid again for the group on screen, keeping the view - after a claim,
 *  a release or a setting. */
async function reloadGrid(host, d, status) {
  const seq = ++SEQ;
  const r = await call(apiFn(), '/api/squares?pool=' + encodeURIComponent(d.groupId));
  if (seq !== SEQ || !host.isConnected) return;
  if (r.ok && Array.isArray(r.j.cells)) {
    d.sq = r.j;
    d.skew = (Number(r.j.now) || Date.now()) - Date.now();
  }
  d.status = status || (r.ok ? null : { tone: 'err', text: failText(r, 'The grid did not load.') });
  draw(host, d, 'ready');
}

function draw(host, d, state) {
  host.innerHTML = '';
  const view = d.view || state || 'error';
  const sq = d.sq || null;
  const sub = view === 'ready' && sq
    ? (sq.name || 'Your group') + ' · ' + gameDay(sq.game && sq.game.kickoffUtc ? sq.game.kickoffUtc : sq.lockAt)
    : { 'signed-out': 'The Big Game · ' + gameDay(BIG_GAME.kickoffUtc), 'no-group': 'The Big Game · ' + gameDay(BIG_GAME.kickoffUtc),
        loading: 'Loading the grid…', offline: 'Offline', error: 'Something went wrong' }[view] || '';
  host.appendChild(pageHeader({ title: 'Big Game squares', noTitle: true, sub,
    right: view === 'signed-out' ? signInLink(host) : null }));

  if (view === 'loading') { host.appendChild(stateBlock('loading', { rows: 6, body: 'Loading the grid…' })); return; }
  if (view === 'offline') {
    host.appendChild(stateBlock('offline', { title: 'You are offline', body: 'The grid did not load. Your squares are safe.',
      action: { label: 'Try again', onClick: () => refresh(host, null, true) } }));
    return;
  }
  if (view === 'error') {
    host.appendChild(stateBlock('error', { body: d.message || 'The grid did not load. Your squares are safe.',
      action: { label: 'Try again', onClick: () => refresh(host, null, true) } }));
    return;
  }
  if (view === 'signed-out') { signedOutView(host, d); return; }
  if (view === 'no-group') { poolPreview(host, d, false); return; }
  drawReady(host, d);
}

/* ------------------------------------------------------------ pool first */

/** Signed out: the grid itself, and the first tap asks you to sign in. The one place
 *  the signed-out answer lives - poolPreview draws it. */
function signedOutView(host, d) {
  poolPreview(host, d, true);
}

/** A quiet Sign in in the header, for anybody who wants it before tapping. */
function signInLink(host) {
  const b = btn('sq-signin', 'Sign in', async () => {
    if (typeof window === 'undefined' || typeof window.agOpenSignIn !== 'function') return;
    if (await window.agOpenSignIn()) { forgetGroups(); refresh(host, null, true); }
  });
  return b;
}

/** The grid before a group - signed out, or signed in with no squares group: empty,
 *  "?" digits, "Home team" / "Away team", the lock and the rules, a Start / Join pair.
 *  A tap: signed out, the sign-in sheet and then the claim if a group is there;
 *  signed in, a small inline Start / Join sheet. */
function poolPreview(host, d, signedOut) {
  const now = Date.now();
  const sq = previewGrid(now);
  const bar = el('div', 'sq-total num', lockText(sq.lockAt, now));
  bar.dataset.preview = signedOut ? 'signed-out' : 'no-group';
  host.appendChild(bar);
  host.appendChild(startJoinCard(SQUARES_SPORT, {
    title: 'Play the Big Game grid with friends',
    body: 'Squares are claimed in a group. Start one and invite people, or join with the code someone sent you.'
  }));
  const slot = el('div', 'sq-sheetslot');
  host.appendChild(slot);
  const openSheet = () => {
    if (slot.firstChild) return;
    const s = startJoinSheet(SQUARES_SPORT, { title: 'Claim it in a group',
      body: 'A square is yours once you are in a group. Start one and invite people, or join with a code.',
      onClose: () => { slot.innerHTML = ''; } });
    slot.appendChild(s);
    const first = s.querySelector && s.querySelector('button');
    if (first && first.focus) first.focus();
  };
  if (d.openSheet) openSheet();
  host.appendChild(board(gridModel(sq), { mode: 'preview', onTap: async (i) => {
    const r = await noGroupTap();
    if (r === 'no-group') { openSheet(); return; }
    if (r !== 'signed-in') return;
    forgetGroups();
    /* Signed in now: in a squares group, the claim goes on; in none, the sheet. */
    refresh(host, null, true, (next) => {
      if (next.view === 'ready' && next.sq && !next.sq.locked && !next.sq.cells[i]) tapCell(host, next, i);
      else if (next.view === 'no-group') { next.openSheet = true; draw(host, next, 'ready'); }
    });
  } }));
  host.appendChild(el('p', 'sq-rules', RULES_SHORT));
  host.appendChild(resultsBlock(sq));
}

/* ---------------------------------------------------------------- a group */

function drawReady(host, d) {
  const sq = d.sq;
  const now = () => Date.now() + (Number(d.skew) || 0);
  const locked = sq.locked === true || !(now() < Number(sq.lockAt));
  const isCommish = sq.role === 'commissioner';

  const top = el('div', 'sq-top');
  top.appendChild(groupSwitcher(d.groups || [], d.groupId, () => refresh(host, null, true)));
  const sl = el('a', 'sq-link', 'Standings ›');
  sl.href = '#/gstandings';
  sl.addEventListener('click', () => setCurrentGroupId(d.groupId));
  top.appendChild(sl);
  host.appendChild(top);

  const bar = el('div', 'sq-total num', summaryLine(sq, now()));
  bar.dataset.squares = d.groupId;
  if (locked) bar.dataset.locked = 'true';
  host.appendChild(bar);

  /* The server's own sentence for a taken square or the limit - inline, never an alert. */
  const st = el('p', 'sq-status', d.status ? d.status.text : '');
  st.setAttribute('role', 'status');
  if (d.status) st.dataset.tone = d.status.tone;
  host.appendChild(st);

  if (isCommish && !locked) host.appendChild(commishPanel(host, d));

  const m = gridModel(sq);
  host.appendChild(board(m, { mode: locked ? 'locked' : 'open', busy: d.busy || {}, onTap: (i) => tapCell(host, d, i) }));
  host.appendChild(el('p', 'sq-rules', locked
    ? 'The numbers were drawn at kickoff. Each quarter’s square is marked; the square the score is on now is ringed.'
    : 'Tap an empty square to claim it; tap one of yours to let it go. Yours are tinted. The numbers are drawn at kickoff.'));
  host.appendChild(resultsBlock(sq));
  host.appendChild(el('p', 'sq-foot', RULES_FULL + ' Points are the only score.'));
}

/** A tap on the grid before kickoff: claim a free square, release one of yours. The
 *  square fills at once and is put back if the server says no - with its sentence. */
async function tapCell(host, d, i) {
  const sq = d.sq;
  if (!sq || sq.locked) return;
  d.busy = d.busy || {};
  if (d.busy[i]) return;
  const act = cellAction(d, i);
  const before = sq.cells[i];
  let me = '';
  try { me = localStorage.getItem('ag.handle') || ''; } catch { me = ''; }
  d.busy[i] = true;
  if (act.release) { sq.cells[i] = null; sq.myCount = Math.max(0, (Number(sq.myCount) || 0) - 1); sq.taken = Math.max(0, (Number(sq.taken) || 0) - 1); }
  else if (!before) { sq.cells[i] = { name: me, mine: true }; sq.myCount = (Number(sq.myCount) || 0) + 1; sq.taken = (Number(sq.taken) || 0) + 1; }
  d.status = { tone: 'busy', text: 'Saving…' };
  if (host.isConnected) draw(host, d, 'ready');
  const r = await call(apiFn(), act.path, { pool: d.groupId, cell: i });
  delete d.busy[i];
  const name = 'Square ' + (Math.floor(i / 10) + 1) + '-' + ((i % 10) + 1);
  if (r.ok) {
    reloadGrid(host, d, { tone: 'ok', text: act.release ? name + ' is open again.' : name + ' is yours.' });
    return;
  }
  /* Put it back as it was, then say why - the server's words. */
  sq.cells[i] = before;
  if (act.release) { sq.myCount = (Number(sq.myCount) || 0) + 1; sq.taken = (Number(sq.taken) || 0) + 1; }
  else if (!before) { sq.myCount = Math.max(0, (Number(sq.myCount) || 0) - 1); sq.taken = Math.max(0, (Number(sq.taken) || 0) - 1); }
  const status = { tone: 'err', text: failText(r, 'That square did not go through.') };
  /* Taken or locked: the grid on screen is out of date, so read it again. */
  if (r.status === 409 && (r.j.error === 'taken' || r.j.error === 'locked' || r.j.error === 'not_yours')) { reloadGrid(host, d, status); return; }
  d.status = status;
  if (host.isConnected) draw(host, d, 'ready');
}

/* -------------------------------------------------------------- the grid */

/** The board: the away team across the top, the home team down the left, the digits
 *  (or "?") on each side, and the hundred squares. `mode` 'open' and 'preview' take
 *  taps; 'locked' does not. Team color is scoped to this element. */
function board(m, opts) {
  const o = opts || {};
  const wrap = el('section', 'card sq-board');
  wrap.setAttribute('aria-label', 'The grid: ' + m.home.name + ' down the side, ' + m.away.name + ' across the top');
  wrap.dataset.mode = o.mode || 'open';
  wrap.dataset.drawn = String(m.drawn);
  if (m.home.color) wrap.style.setProperty('--team-a', m.home.color);
  if (m.away.color) wrap.style.setProperty('--team-b', m.away.color);

  const away = el('div', 'sq-axis sq-axis--away', m.away.name);
  wrap.appendChild(away);
  const body = el('div', 'sq-body');
  const home = el('div', 'sq-axis sq-axis--home', m.home.name);
  body.appendChild(home);

  const grid = el('div', 'sq-grid');
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', m.drawn ? 'The squares' : 'The squares - the numbers are drawn at kickoff');
  grid.appendChild(el('span', 'sq-corner'));
  for (let c = 0; c < 10; c++) {
    const h = el('span', 'sq-hd sq-hd--col num', m.cols[c]);
    h.setAttribute('aria-hidden', 'true');
    grid.appendChild(h);
  }
  const tappable = o.mode === 'open' || o.mode === 'preview';
  for (let r = 0; r < 10; r++) {
    const h = el('span', 'sq-hd sq-hd--row num', m.rows[r]);
    h.setAttribute('aria-hidden', 'true');
    grid.appendChild(h);
    for (let c = 0; c < 10; c++) {
      const cell = m.cells[r * 10 + c];
      const b = el('button', 'sq-cell');
      b.type = 'button';
      b.dataset.cell = String(cell.i);
      b.appendChild(el('span', 'sq-ini', cell.text));
      if (cell.tag) b.appendChild(el('span', 'sq-tag num', cell.tag));
      if (cell.taken) b.dataset.taken = 'true';
      if (cell.mine) b.dataset.mine = 'true';
      if (cell.wins.length) b.dataset.win = 'true';
      if (cell.current) b.dataset.current = 'true';
      if (o.busy && o.busy[cell.i]) b.dataset.busy = 'true';
      b.setAttribute('aria-label', cellLabel(cell, m));
      if (!tappable) b.disabled = true;
      else b.addEventListener('click', () => { if (o.onTap) o.onTap(cell.i); });
      grid.appendChild(b);
    }
  }
  body.appendChild(grid);
  wrap.appendChild(body);
  return wrap;
}

function resultsBlock(sq) {
  const sec = el('section', 'card sq-card sq-results');
  sec.setAttribute('aria-label', 'The quarters');
  sec.appendChild(el('h2', 'sq-h', 'The quarters'));
  const ol = el('ol', 'sq-res');
  for (const r of resultsList(sq)) {
    const li = el('li', 'sq-res-i num', r.text);
    li.dataset.key = r.key;
    li.dataset.done = String(r.done);
    if (r.mine) li.dataset.mine = 'true';
    if (r.nobody) li.dataset.nobody = 'true';
    ol.appendChild(li);
  }
  sec.appendChild(ol);
  return sec;
}

/* ------------------------------------------------------ the commissioner */

/** Squares per person, before kickoff: minus, the number, plus, and Save. Nothing is
 *  sent until Save, and Save names the number it sends. */
function commishPanel(host, d) {
  const sq = d.sq;
  const panel = el('section', 'card sq-card sq-commish');
  panel.setAttribute('aria-label', 'Commissioner');
  panel.appendChild(el('h2', 'sq-h', 'Commissioner'));
  if (d.maxDraft == null) d.maxDraft = Number(sq.maxPerPerson) || SQUARES_LIMITS.maxDefault;
  const lab = el('label', 'sq-label', 'Squares per person');
  lab.setAttribute('for', 'sq-max');
  panel.appendChild(lab);
  const row = el('div', 'sq-step');
  const input = el('input', 'sq-in num');
  input.id = 'sq-max';
  input.type = 'number'; input.min = '1'; input.max = String(SQUARES_LIMITS.maxMax); input.step = '1';
  input.inputMode = 'numeric';
  input.value = String(d.maxDraft);
  const err = el('p', 'sq-err');
  err.setAttribute('role', 'alert');
  const save = btn('sq-primary sq-save', '');
  const paint = () => {
    input.value = String(d.maxDraft);
    save.textContent = 'Save: ' + d.maxDraft;
    save.disabled = d.maxDraft === Number(sq.maxPerPerson);
  };
  const minus = btn('sq-stepb', '−', () => { d.maxDraft = stepMax(d.maxDraft, -1); paint(); });
  minus.setAttribute('aria-label', 'One fewer');
  const plus = btn('sq-stepb', '+', () => { d.maxDraft = stepMax(d.maxDraft, 1); paint(); });
  plus.setAttribute('aria-label', 'One more');
  input.addEventListener('change', () => { d.maxDraft = stepMax(input.value, 0); paint(); });
  save.addEventListener('click', async () => {
    const want = stepMax(d.maxDraft, 0);
    save.disabled = true; save.textContent = 'Saving…'; err.textContent = '';
    const r = await call(apiFn(), '/api/squares/settings', { pool: d.groupId, maxPerPerson: want });
    if (r.ok) {
      d.maxDraft = null;
      reloadGrid(host, d, { tone: 'ok', text: 'Squares per person: ' + (Number(r.j.maxPerPerson) || want) + '.' });
      return;
    }
    paint();
    err.textContent = failText(r, 'That did not save.');
  });
  row.append(minus, input, plus);
  panel.append(row, save, err);
  panel.appendChild(el('p', 'sq-note', 'Lowering it takes nobody’s squares away - it stops new claims past it. '
    + 'It can be changed until kickoff.'));
  paint();
  return panel;
}
