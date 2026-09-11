/* G3 - the group pools rules page.
 *
 * Like s6-rules, the screen cannot be imported here: its imports are
 * server-absolute ('/components/group.js', '/src/lib/groups.ts'), which Node
 * cannot resolve. So there is no fake DOM - a test whose data it also invented is
 * not a close. The layout closed in a real browser at 393px. What this file is
 * for is the thing a browser cannot catch: DRIFT between the page's sentences and
 * the code that makes them true.
 *
 * Three halves:
 *   1. THE PAGE'S SHAPE - the sections, the index, the doors, the states.
 *   2. THE WORDS AND NUMBERS ARE READ, NOT TYPED - the kindness line and every
 *      limit come from src/lib/groups.ts.
 *   3. THE FACTS ARE STILL IN THE CODE - each rule on the page names the line of
 *      src/ it came from, and that line is checked here. If the code moves, this
 *      fails and whoever moved it re-reads the page.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { KINDNESS, LIMITS } from '../src/lib/groups.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const JS = read('../public/screens/g3-group-rules.screen.js');
const CSS = read('../public/screens/g3-group-rules.css');
const S6 = read('../public/screens/s6-rules.screen.js');
const TOKENS = read('../public/styles/tokens.css');
const GROUPS = read('../src/groups.ts');
const WORKER = read('../src/worker.ts');
const MAIL = read('../src/mail.ts');
const CRON = read('../src/slate-cron.ts');
const AUTH = read('../src/auth.ts');
const MIG = read('../migrations/0007_groups.sql');

/** Comments stripped: the header quotes the rules it obeys, and a check against
 *  the prose would fail the file for explaining itself. */
function code(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
const CJS = code(JS);
const CCSS = code(CSS);
const strings = (src) => (code(src).match(/'(?:[^'\\\n]|\\.)*'/g) || []).map((s) => s.slice(1, -1));
/* SVG geometry ('M4 2 L8 6 L4 10', '0 0 12 12') is markup, not copy - a digit
 * check against it would fail the file for drawing its own chevron. */
const isGeometry = (s) => /^[\d\s.,MLHVCZmlhvcz-]+$/.test(s);
const STRINGS = strings(JS).filter((s) => !isGeometry(s));
const COPY = STRINGS.join(' ');
/* Sentences split across adjacent literals, joined back up. */
const FLAT = STRINGS.join('');
const S6FLAT = strings(S6).join('');

/* ------------------------------------------------------- 1 · THE SHAPE */

const SECTIONS = [...JS.matchAll(
  /\{\s*id:\s*'([a-z0-9-]+)',\s*q:\s*'([^']+)',\s*h:\s*'([^']+)',\s*build:\s*(\w+)\s*\}/g)]
  .map((m) => ({ id: m[1], q: m[2], h: m[3], fn: m[4] }));

test('the seven sections exist, each a question with a heading and a builder', () => {
  assert.deepEqual(SECTIONS.map((s) => s.id),
    ['g3-how', 'g3-picking', 'g3-scoring', 'g3-commish', 'g3-email', 'g3-leaving', 'g3-limits']);
  assert.deepEqual(SECTIONS.map((s) => s.h), [
    'How a group works', 'Picking', 'Scoring and standings', 'The commissioner',
    'Emailing through Any Given', 'Leaving', 'Limits'
  ]);
  for (const s of SECTIONS) {
    assert.ok(s.q.endsWith('?'), s.id + ' is not a question: ' + s.q);
    assert.ok(CJS.includes('function ' + s.fn + '('), s.fn + ' is not defined');
  }
  console.log('    ' + SECTIONS.map((s) => s.h).join(' · '));
});

test('🔴 the index scrolls with buttons - no link on this page is a hash fragment', () => {
  /* s6-rules' rows were `#void` anchors; the app routes on the hash and the page
   * unmounted. Here the index rows are buttons with no href at all. */
  const ix = CJS.slice(CJS.indexOf('function indexBlock'), CJS.indexOf('function sectionCard'));
  assert.match(ix, /el\('button', 'g3-ix'\)/, 'the index rows are not buttons');
  assert.doesNotMatch(ix, /href/, 'an index row carries an href');
  assert.match(ix, /scrollTo\(/, 'the index does not scroll');

  /* Every href this page writes is a ROUTE ('#/...'), never a fragment. */
  const hrefs = [...CJS.matchAll(/door\('([^']*)'/g)].map((m) => m[1]);
  assert.ok(hrefs.length >= 2);
  for (const h of hrefs) assert.ok(h.startsWith('#/'), 'a fragment link: ' + h);
  assert.doesNotMatch(CJS, /href\s*=\s*'#'\s*\+/, 'an href is built as a fragment');
  assert.doesNotMatch(CJS, /href\s*=\s*'#[^/]/, 'a literal fragment href');
});

test('the doors go back to the group page and to picks', () => {
  assert.ok(CJS.includes("door('#/g', 'Group page')"));
  assert.ok(CJS.includes("door('#/gpicks', 'Make picks')"));
  /* Signed out and in no group, a door to #/g as well. */
  assert.equal((CJS.match(/door\('#\/g', 'Start or join a group'/g) || []).length, 2);
});

test('every state renders the whole ruleset; only the group line depends on data', () => {
  const states = JS.match(/export const states = \[([^\]]*)\]/)[1]
    .split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
  assert.deepEqual(states, ['ready', 'signed-out', 'no-group', 'loading', 'offline', 'error']);
  const body = CJS.slice(CJS.indexOf('export function render'));
  /* The rules are appended after the state branches, unconditionally. */
  const lastBranch = body.lastIndexOf("view === 'error'");
  assert.ok(lastBranch > 0);
  const after = body.slice(body.indexOf('}', body.indexOf('}', lastBranch) + 1));
  assert.match(after, /root\.appendChild\(indexBlock\(\)\)/);
  assert.match(after, /SECTIONS\.forEach/);
  /* Signed out calls the app's sign-in and re-renders. */
  assert.match(CJS, /window\.agOpenSignIn/);
  assert.match(CJS, /noSample: true/);
});

test('render never fetches - the lookup is in previewData and behind a tap', () => {
  assert.doesNotMatch(CJS, /fetch\s*\(/);
  const body = CJS.slice(CJS.indexOf('export function render'));
  assert.doesNotMatch(body, /myGroups\(|lookup\(/, 'render asks the server');
  const pd = CJS.slice(CJS.indexOf('export async function previewData'), CJS.indexOf('async function refresh'));
  assert.match(pd, /lookup\(\)/);
  assert.match(CJS, /myGroups\(opts\)/);
  assert.match(CJS, /pickCurrent\(r\.groups\)/);
  assert.match(CJS, /groupSwitcher\(groups, g\.id,/, 'no switcher for 2+ groups');
});

test('the group line names the group and whether it picks against the spread', () => {
  assert.match(CJS, /g\.ats \? 'Against the spread' : 'Straight up'/);
  /* The same two labels s6-rules' pool card uses. */
  assert.ok(S6.includes("pool.ats ? 'Against the spread' : 'Straight up'"));
});

/* ---------------------------------- 2 · READ, NOT TYPED */

test('🔴 the kindness line comes from src/lib/groups.ts - it is not retyped', () => {
  assert.match(JS, /import \{ KINDNESS, LIMITS \} from '\/src\/lib\/groups\.ts';/);
  assert.match(CJS, /el\('blockquote', 'g3-pledge', KINDNESS\)/);
  /* Not one clause of it is in the file. */
  for (const clause of KINDNESS.split('. ')) {
    assert.equal(FLAT.includes(clause.replace(/\.$/, '')), false, 'retyped: ' + clause);
  }
  /* And it is the line the server makes a commissioner accept. */
  assert.match(GROUPS, /if \(b\.pledge !== true\) return json\(\{ error: 'pledge_required', message: KINDNESS \}/);
  console.log('    pledge: ' + KINDNESS);
});

test('🔴 every limit comes from LIMITS - no limit number is typed into the copy', () => {
  const used = ['membersMax', 'nameMax', 'invitesPerBatch', 'invitesPerDay', 'messagesPerDay', 'messageMax'];
  for (const k of used) {
    assert.ok(new RegExp('LIMITS\\.' + k + '\\b').test(CJS), 'LIMITS.' + k + ' is not read');
    const n = String(LIMITS[k]);
    const typed = new RegExp('(?<![0-9.])' + n + '(?![0-9])').test(COPY);
    assert.equal(typed, false, 'the copy types ' + n + ' (LIMITS.' + k + ')');
  }
  assert.deepEqual(Object.keys(LIMITS).sort(), [...used].sort(), 'LIMITS grew - add it to the page');
  console.log('    ' + used.map((k) => k + ' ' + LIMITS[k]).join(' · '));
});

/* ------------------------------------------------ words and design rules */

test('🔴 no betting words, and no Marbles, anywhere in the page', () => {
  const src = (CJS + '\n' + CCSS).toLowerCase();
  for (const w of [/\bmarbles?\b/, /\bstak(e|es|ed|ing)\b/, /\bodds\b/, /\bpric(e|es|ed|ing)\b/,
                   /\bbet(s|ting|tor)?\b/, /\bwager/, /\bcredits?\b/, /\bcoins?\b/, /\bpurchase/,
                   /\bbuy\b/, /\brefill/, /\btop-?up\b/, /\bcontinue\b/]) {
    assert.equal(w.test(src), false, 'found ' + w);
  }
});

test('no email address is shown, and none is asked for', () => {
  assert.doesNotMatch(CJS, /\.email\b|@[a-z]+\.[a-z]/i);
  assert.doesNotMatch(CJS, /createElement\('input'\)|el\('input'/);
});

test('every var() on the page is a token defined in tokens.css', () => {
  const vars = new Set([...(CJS + CCSS).matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]));
  assert.ok(vars.size > 5);
  for (const v of vars) {
    assert.ok(new RegExp(v.replace(/-/g, '\\-') + '\\s*:').test(TOKENS), 'undefined token ' + v);
  }
});

test('depth is a hairline, the accent is --accent, taps are 44px, figures tabular', () => {
  assert.doesNotMatch(CCSS, /box-shadow/);
  assert.ok(CCSS.includes('1px solid var(--line)'));
  assert.ok(CCSS.includes('var(--accent)'));
  assert.doesNotMatch(CJS + CCSS, /--maroon|--gold|:root/);
  /* The shared .card class carries --lift, a shadow. Not used here. */
  assert.doesNotMatch(CJS, /,\s*'card[\s']|className\s*=\s*'card\b/, 'the shared .card class (a shadow) is used');
  for (const cls of ['g3-ix', 'g3-door', 'g3-signin', 'g3-line-door']) {
    const rule = CCSS.match(new RegExp('\\.' + cls + '\\s*\\{[^}]*\\}'));
    assert.ok(rule && rule[0].includes('min-height: var(--tap-min)'), cls + ' is under 44px');
  }
  assert.ok(CCSS.includes('font-variant-numeric: tabular-nums'));
  assert.ok(CJS.includes("'g3-kv-v num'"));
  assert.doesNotMatch(CJS, /\.png|\.jpg|icon-font|https?:\/\/(?!www\.w3\.org)/);
});

test('US spelling', () => {
  assert.doesNotMatch(JS + CSS, /colour|centre|grey|behaviour|favourite|licence|cancelled_/i);
});

/* ---------------------- the sentences shared with the app's Rules page */

test('🔴 where the two rules pages overlap, they say the same sentence', () => {
  for (const s of [
    'Every pick is editable until that game kicks off, and locks at kickoff.',
    'No points won and none lost, for anybody who picked it.'
  ]) {
    assert.ok(FLAT.includes(s), 'the group page lost: ' + s);
    assert.ok(S6FLAT.includes(s.replace(/^No/, 'No')), 's6-rules no longer says: ' + s);
  }
});

/* ----------------------------------- 3 · THE FACTS ARE STILL IN THE CODE */

test('getting in: invite only, commissioner on create, code folded, handle required', () => {
  assert.ok(FLAT.includes('Whoever starts a group is its commissioner.'));
  assert.match(GROUPS, /VALUES \(\?, \?, \?, 0, 'commissioner'\)/);
  assert.match(GROUPS, /error: 'email_required'/);
  assert.match(GROUPS, /error: 'profile_required'/);
  assert.match(GROUPS, /const code = normCode\(b\.code\)/);
  /* The league is set on create and the settings route cannot change it. It may
   * READ it - which games a group picks from depends on the league (2026-09-11) -
   * but nothing the request sends reaches the sport column. */
  const settings = GROUPS.slice(GROUPS.indexOf("'/api/group/settings'"), GROUPS.indexOf("'/api/group/remove'"));
  assert.doesNotMatch(settings, /b\.sport|sport\s*=\s*\?|SET[^']*\bsport\b/);
  assert.match(settings, /name = COALESCE\(\?, name\), ats = COALESCE\(\?, ats\)/);
});

test('picking: kickoff lock on the server clock, members only, per-group picks', () => {
  /* The 409 carries a `message` since the session gave it one (2026-09-11,
   * CONTRACT-GROUPS §2: every error body carries `message`). */
  assert.match(WORKER, /if \(kickoff && Date\.now\(\) >= kickoff\) \{\s*return json\(\{ error: 'that game has kicked off', message: '[^']+', locked: true \}, 409\);/);
  assert.match(WORKER, /if \(!inIt\) return json\(\{ error: 'not_a_member'/);
  assert.match(WORKER, /ON CONFLICT\(pool_id, user_id, game_id\) DO UPDATE SET/);
  assert.match(WORKER, /const pickPool = poolId\.startsWith\('world-'\) \? worldId : poolId;/);
});

test('scoring: a right pick counts one, only final games with a winner count', () => {
  const sql = WORKER.slice(WORKER.indexOf("if (p === '/api/pool/standings')"),
                           WORKER.indexOf("if (p === '/api/slate')"));
  assert.match(sql, /SUM\(CASE WHEN g\.status = 'final' AND g\.void = 0/);
  /* A zero margin - a tie straight up, a push against the spread - counts for
   * nobody: it is in neither wins nor played. */
  assert.match(sql, /AND \$\{margin\} <> 0/);
  assert.match(sql, /: '\(g\.home_score - g\.away_score\)'/);
  assert.match(sql, /ORDER BY wins DESC/);
  assert.match(sql, /FROM member m\s+LEFT JOIN pick p/);
  /* Cancelled and postponed games never reach 'final' in the cron. */
  assert.match(CRON, /const status = statusName === 'STATUS_FINAL' \? 'final'\s*: statusName === 'STATUS_SCHEDULED' \? 'scheduled' : 'in_progress';/);

  /* 🔴 THE TRIPWIRE FIRED, AS WRITTEN. It pinned that the standings ignored the
   * spread, so the page said nothing about it. On 2026-09-11 the commissioner's
   * switch became scored ("the comish has the option") and this failed - so the
   * page says how the spread scores and the push is in its void line, and this
   * now pins both halves: the scorer reads the group's line, and the page says so. */
  assert.match(sql, /COALESCE\(p\.spread_at, g\.spread, 0\)/, 'scored against the line the pick was made at');
  assert.match(sql, /Number\(meta\.ats\) === 1/, 'only when the commissioner turned it on');
  assert.match(JS, /covers the spread it was picked at/, 'the page says how the spread scores');
  assert.match(JS, /lands ' \+\s*'exactly on the spread never counts/, 'the push is in the void line');
});

test('the commissioner: settings, invites, mute, remove - and removal sticks', () => {
  assert.match(GROUPS, /if \(p === '\/api\/group\/remove' && post\) \{\s*if \(!isCommish\) return onlyCommish\(\);/);
  assert.match(GROUPS, /DELETE FROM pick WHERE pool_id = \? AND user_id = \?'\)\.bind\(gid, t\.user_id\)/);
  assert.match(GROUPS, /INSERT INTO pool_removed/);
  /* Both join routes refuse a removed member; nothing but closing the group
   * clears the list. */
  assert.match(GROUPS, /message: 'The commissioner removed you from this group\.' \}, 403\)/);
  assert.match(WORKER, /message: 'The commissioner removed you from this group\.' \}, 403\)/);
  const clears = (GROUPS + WORKER).match(/DELETE FROM pool_removed[^']*/g) || [];
  assert.deepEqual(clears, ['DELETE FROM pool_removed WHERE pool_id = ?']);
  /* A mute stops messages and nothing else. */
  assert.match(GROUPS, /if \(mine\.muted\) return json\(\{ error: 'muted'/);
  const pick = WORKER.slice(WORKER.indexOf("if (p === '/api/pool/pick'"), WORKER.indexOf("if (p === '/api/pool/create'"));
  assert.doesNotMatch(pick, /muted/);
  assert.match(GROUPS, /message: 'You cannot mute yourself\.'/);
  assert.match(GROUPS, /message: 'You cannot remove yourself\. Leave the group instead\.'/);
});

test('email: from Any Given, no reply-to, one copy each, no words kept', () => {
  assert.match(MAIL, /Never a reply-to/);
  assert.match(MAIL, /name: 'Any Given'/);
  assert.doesNotMatch(MAIL, /reply_to|replyTo|reply-to':/);
  assert.match(GROUPS, /for \(const e of emails\) if \(await sendMail\(env, e, mail\.subject, mail\.text\)\) sent\+\+;/);
  assert.match(read('../src/lib/groups.ts'), /Reply from the group page in Any Given/);
  assert.match(MIG, /It holds a\s+-- recipient COUNT, never an address or a body\./);
});

test('leaving: hand-off to the longest-standing member, the last one out closes it', () => {
  const leave = GROUPS.slice(GROUPS.indexOf("'/api/group/leave'"), GROUPS.indexOf("'/api/group/invite'"));
  assert.match(leave, /ORDER BY rowid LIMIT 1/);
  assert.match(leave, /DELETE FROM pool WHERE id = \?/);
  assert.match(leave, /DELETE FROM pick WHERE pool_id = \? AND user_id = \?/);
  assert.doesNotMatch(leave, /pool_removed \(/, 'leaving now bars you from coming back');
  assert.match(AUTH, /A group they run is handed to its longest-standing other\s+\* member; a group with nobody else in it goes with them\./);
});

test('limits: full is refused at the cap, a day is a rolling 24 hours', () => {
  assert.match(GROUPS, /if \(!already && n && n\.n >= LIMITS\.membersMax\)/);
  assert.match(GROUPS, /const since = Date\.now\(\) - DAY;/);
  assert.match(GROUPS, /const DAY = 86_400_000;/);
});
