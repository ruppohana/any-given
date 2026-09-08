/* P1 - the invite landing.
 *
 * 🔴 WHAT THIS FILE CAN AND CANNOT DO, stated up front because requirement 7.5 is
 * the reason it is small.
 *
 * It CANNOT import p1-invite.screen.js. That module's imports are server-absolute
 * ('/components/states.js') because it is browser code with no build step, and
 * Node cannot resolve them - the same trap tools/preview.mjs records in its own
 * header. So there is no DOM here and there is no assertion about layout.
 *
 * LAYOUT IS CLOSED IN A REAL BROWSER AT 393px, and nowhere else. Five layout bugs
 * in one week were invisible to 300+ passing tests. What this file does instead is
 * the two things a test genuinely can settle:
 *
 *   1. THE CONTRACT'S FAILURE LIST, mechanized against the source text - the
 *      checks that fail a piece regardless of how it looks.
 *   2. THE SCREEN'S ASSUMPTIONS ABOUT REAL DATA, run against the three captured
 *      games and the 760-team file. Every number below was measured from those
 *      files; none of it was written to make a test pass.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeColor, teamVars } from '../public/components/team-chip.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const JS = read('../public/screens/p1-invite.screen.js');
const CSS = read('../public/screens/p1-invite.css');

/* 🔴 THE CODE CHECKS RUN ON THE CODE, NOT ON THE COMMENTS - and that distinction
 * is load-bearing here rather than pedantic. This screen's header comment quotes
 * the three bar screens it is defined against, which means the words `Password`,
 * `Date of Birth`, `Sign Up`, `box-shadow` and `--maroon` all legitimately appear
 * in the file as the NAMES OF THINGS IT DOES NOT DO. The first run of this file
 * failed four tests on exactly that, which is the check working and the input
 * being wrong. Both files use only block comments. */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
const JSC = strip(JS);
const CSSC = strip(CSS);
const TEAMS = JSON.parse(read('../fixtures/teams.json')).teams;
const GAMES = [
  'real-utep-at-ou-260905-final.json',
  'real-ball-at-osu-260905-final.json',
  'real-bois-at-ore-260905-final.json'
].map((f) => JSON.parse(read('../fixtures/' + f)));

/* ------------------------------------------------------- 1 · the failure list */

test('NOTHING SITS IN FRONT OF THE SLATE - no account wall anywhere in the screen', () => {
  /* This is the whole piece. All three bar screens fail it: Office Pool ships
   * Email + Password + Sign In + Create Account + Forgot Password, and Armchair
   * ships those plus first name, last name and DATE OF BIRTH. */
  const banned = [
    /<input/i, /type=["']password/i, /type=["']email/i,
    /\bdate of birth\b/i, /\bsign ?in\b/i, /\bsign ?up\b/i, /\bcreate account\b/i,
    /\bforgot password\b/i, /\bpassword\b/i, /\bverify your email\b/i,
    /\binstall the app\b/i, /\bdownload the app\b/i, /\bopen in the app\b/i,
    /\bterms (and|&) conditions\b/i
  ];
  for (const re of banned) {
    assert.equal(re.test(JSC), false, `p1-invite.screen.js contains ${re}`);
  }
});

test('no price, and none of the balance words - the pool is free and has no stake', () => {
  for (const re of [/\bcredits?\b/i, /\bcoins?\b/i, /\btop-?up\b/i, /\bpurchase\b/i,
                    /\bbuy\b/i, /\brefill\b/i, /\bprize pool\b/i, /\$\d/, /\bper month\b/i,
                    /\bsubscri/i, /\bMarbles\b/]) {
    assert.equal(re.test(JSC), false, `p1-invite.screen.js contains ${re}`);
  }
});

test('the display name is never asked on this screen, only promised for after', () => {
  /* POOL-SCREENS P1: "a display name is the most that may be asked, and it may be
   * asked AFTER the first pick rather than before." So it is prose here, never a
   * field. */
  assert.match(JSC, /after your first pick/i);
  assert.equal(/name=["']displayName/i.test(JSC), false);
});

test('depth is a hairline - not one box-shadow in either file', () => {
  assert.equal(/box-shadow/i.test(CSSC), false);
  assert.equal(/box-shadow/i.test(JSC), false);
  assert.match(CSSC, /1px solid var\(--line\)/);
});

test('reads --accent, never --maroon or --gold, and never writes :root', () => {
  assert.equal(/--maroon/.test(CSSC + JSC), false);
  assert.equal(/--gold/.test(CSSC + JSC), false);
  assert.match(CSSC, /var\(--accent\)/);
  assert.equal(/:root/.test(CSSC), false);
  assert.equal(/setProperty\(\s*['"]--(team-a|team-b|accent)/.test(JSC), false);
});

test('every rule is scoped, so a pool screen cannot leak into the shell', () => {
  const selectors = CSSC
    .split('}')
    .map((b) => b.split('{')[0].trim())
    .filter(Boolean);
  assert.ok(selectors.length > 10);
  for (const s of selectors) {
    assert.ok(s.startsWith('.scr-p1-invite'), `unscoped selector: ${s}`);
  }
});

test('the one primary action clears 44px and takes the 9px button radius', () => {
  assert.match(CSS, /\.p1-cta[\s\S]*?min-height:\s*var\(--tap-min\)/);
  assert.match(CSS, /\.p1-cta[\s\S]*?border-radius:\s*var\(--radius-button\)/);
  /* One filled control. Anything else on the screen is type or a hairline. */
  const filled = (CSSC.match(/background:\s*var\(--accent\)/g) || []).length;
  assert.equal(filled, 1, 'more than one control is filled with the accent');
});

test('no dependency, no fetch, no mark, no CDN image', () => {
  /* The bar export is a path to a reference SCREENSHOT on disk, not an asset this
   * page loads, so it is taken out before the image check rather than exempted by
   * a looser pattern. */
  const code = JSC.replace(/export const bar[^\n]*\n/, '');
  assert.equal(/\bfetch\s*\(/.test(code), false);          // data arrives as an argument
  assert.equal(/<img|createElement\(['"]img|\bsrc\s*=/i.test(code), false);
  assert.equal(/espncdn|https?:|\.png|\.svg|\blogo\b/i.test(code), false);
  assert.equal(/background-image|url\(/i.test(CSSC), false);
  assert.equal(/require\(|from ['"][a-z@]/.test(code), false);  // every import is a local path
});

test('numbers are tabular and US spelling holds', () => {
  assert.match(JS, /\bnum\b/);
  for (const re of [/\bcolour/i, /\bcentre\b/i, /\bgrey\b/i, /\bbehaviour/i, /\bfavourite/i]) {
    assert.equal(re.test(JSC + CSSC), false, `British spelling ${re}`);
  }
});

test('all nine routes are declared, including the three real ones P1 names', () => {
  const m = JS.match(/export\s+const\s+states\s*=\s*\[([^\]]*)\]/);
  const states = m[1].split(',').map((s) => s.trim().replace(/['"]/g, '')).filter(Boolean);
  for (const s of ['ready', 'empty', 'loading', 'offline', 'error', 'full', 'expired', 'member', 'colors']) {
    assert.ok(states.includes(s), `missing state: ${s}`);
  }
});

test('the bar is declared and the file it names exists on disk', () => {
  const m = JS.match(/export\s+const\s+bar\s*=\s*'([^']+)'/);
  assert.ok(m, 'no bar declared');
  const p = new URL('../../' + m[1], import.meta.url);
  assert.doesNotThrow(() => readFileSync(p), `bar file not on disk: ${m[1]}`);
});

/* ------------------------------------------------- 2 · the real data it assumes */

test('the three captured games shape into a slate with no gaps', () => {
  assert.equal(GAMES.length, 3);
  for (const doc of GAMES) {
    const c = doc.header.competitions[0];
    const home = c.competitors.find((x) => x.homeAway === 'home');
    const away = c.competitors.find((x) => x.homeAway === 'away');
    assert.ok(home && away, 'a captured game has no home/away pair');
    assert.ok(TEAMS[home.team.id], `home team ${home.team.id} is not in teams.json`);
    assert.ok(TEAMS[away.team.id], `away team ${away.team.id} is not in teams.json`);
    assert.ok(Number.isFinite(Date.parse(c.date)), 'unparseable kickoff');
    assert.equal(doc.header.week, 1);
    /* 🔴 EVERY CAPTURE IS FINAL. The screen renders that truth rather than
     * back-dating a status, and the missing pre-kickoff capture is the piece's
     * first COULD NOT CLOSE. If this ever fails, a scheduled game was captured
     * and the ready state can be redrawn against it. */
    assert.equal(c.status.type.name, 'STATUS_FINAL');
  }
});

test('the slate sorts by real kickoff and every team resolves to a defined chip', () => {
  const rows = GAMES.map((d) => {
    const c = d.header.competitions[0];
    return {
      k: Date.parse(c.date),
      teams: c.competitors.map((x) => TEAMS[x.team.id])
    };
  }).sort((a, b) => a.k - b.k);
  assert.deepEqual(rows.map((r) => r.k), [...rows.map((r) => r.k)].sort((a, b) => a - b));
  for (const r of rows) for (const t of r.teams) {
    assert.ok(['two', 'one', 'none'].includes(teamVars(t).state));
  }
});

test('the real slate already contains an exact primary collision', () => {
  /* Ohio State ba0c2f against Ball State ba0c2f, in a captured game. The
   * navy-on-navy case POOL-SCREENS calls a new test the live board never had is
   * not hypothetical - it is in the three games we have. */
  assert.equal(normalizeColor(TEAMS['194'].primary), normalizeColor(TEAMS['2050'].primary));
  assert.equal(normalizeColor(TEAMS['194'].primary), '#ba0c2f');
});

test('the colors route can be filled from real teams in every one of the six pairs', () => {
  const all = Object.values(TEAMS);
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const band = (fn) => all
    .filter((t) => { const h = normalizeColor(t.primary); return h && fn(h); })
    .sort((a, b) => Number(a.id) - Number(b.id));
  const navy = band((h) => { const [r, g, b] = rgb(h); return b > 60 && b < 130 && r < 60 && g < 70; });
  const gold = band((h) => { const [r, g, b] = rgb(h); return r > 200 && g > 160 && b < 90; });
  const none = all.filter((t) => !normalizeColor(t.primary)).sort((a, b) => Number(a.id) - Number(b.id));
  console.log(`    navy ${navy.length} · yellow ${gold.length} · null ${none.length} of ${all.length}`);
  assert.ok(navy.length >= 2 && gold.length >= 2 && none.length >= 2);
  assert.equal(none.length, 401);   // measured, not assumed
});
