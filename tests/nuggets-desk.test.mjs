/* THE NUGGET DESK - the day-before research on Cloudflare (src/lib/nuggets.ts,
 * src/nugget-research.ts). Jason, 2026-09-11: "can we have this run someplace
 * else other than my laptop in the future?"
 *
 * These hold the parts that decide what reaches the screen: the same word and
 * length rules as tools/nugget-check.mjs, the same freshness arithmetic as
 * tools/nugget-teams.mjs, and rule zero made mechanical - a nugget whose source
 * was not OPENED in its own research call is dropped.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  nuggetProblems, tomorrowPacific, isFresh, teamsPlaying, normUrl, keepVerified, parseModelJson, brief, SYSTEM
} from '../src/lib/nuggets.ts';
import { openedUrls } from '../src/nugget-research.ts';

test('the word and length rules match nugget-check.mjs', () => {
  const ok = { text: 'The Jayhawks have played in the same stadium since 1921.', kind: 'fun', source: 'https://kuathletics.com/x' };
  assert.deepEqual(nuggetProblems(ok), []);
  assert.ok(nuggetProblems({ ...ok, text: 'x'.repeat(141) }).some((p) => /141 chars/.test(p)));
  assert.ok(nuggetProblems({ ...ok, kind: 'trivia' }).some((p) => /kind/.test(p)));
  assert.ok(nuggetProblems({ ...ok, source: 'kuathletics.com' }).some((p) => /no source/.test(p)));
  for (const bad of ['the odds', 'a wager', 'an injury', 'was arrested', 'a lawsuit', 'a scandal', 'suspended', 'credits'])
    assert.ok(nuggetProblems({ ...ok, text: 'Something about ' + bad + '.' }).length, bad + ' must fail');
  assert.ok(nuggetProblems({ ...ok, text: 'He would bet on it.' }).length, 'lowercase bet fails');
  assert.deepEqual(nuggetProblems({ ...ok, text: 'The game airs on BET.' }), [], 'the BET network passes');
});

test('tomorrow is Pacific, and the day before it is what fresh means', () => {
  // 2026-09-11 07:30 UTC is 00:30 Friday in Pacific -> tomorrow is Saturday the 12th.
  const t = tomorrowPacific(Date.parse('2026-09-11T07:30:00Z'));
  assert.deepEqual(t, { date: '2026-09-12', dayBefore: '2026-09-11' });
  assert.equal(isFresh('2026-09-11', t.dayBefore), true);
  assert.equal(isFresh('2026-09-10', t.dayBefore), false);
  assert.equal(isFresh(null, t.dayBefore), false);
});

test('teams playing tomorrow: once each, in kickoff order, finals skipped', () => {
  const g = (id, kick, status, a, h) => ({
    id, kickoffUtc: Date.parse(kick), status, shortName: a.abbrev + ' @ ' + h.abbrev,
    teams: [a, h]
  });
  const t = (id, name) => ({ id, name, abbrev: name.slice(0, 3).toUpperCase() });
  const slates = [{
    sport: 'college-football',
    games: [
      g('1', '2026-09-12T19:00:00Z', 'scheduled', t(10, 'Ohio'), t(11, 'Iowa')),
      g('2', '2026-09-12T16:00:00Z', 'scheduled', t(12, 'Army'), t(13, 'Navy')),
      g('3', '2026-09-11T23:00:00Z', 'scheduled', t(14, 'Rice'), t(15, 'Tulsa')),       // Friday, not tomorrow
      g('4', '2026-09-12T20:00:00Z', 'final', t(16, 'Yale'), t(17, 'Penn')),            // already over
      g('5', '2026-09-12T22:00:00Z', 'scheduled', t(10, 'Ohio'), t(18, 'Kent'))         // Ohio again - once
    ]
  }];
  const jobs = teamsPlaying(slates, '2026-09-12');
  assert.deepEqual(jobs.map((j) => j.team), ['Army', 'Navy', 'Iowa', 'Ohio', 'Kent']);
  assert.ok(jobs.every((j) => j.league === 'ncaa' && j.gameDate === '2026-09-12'));
  assert.equal(teamsPlaying([{ sport: 'nfl', games: [g('9', '2026-09-12T20:00:00Z', 'scheduled', t(1, 'Rams'), t(2, 'Jets'))] }], '2026-09-12')[0].league, 'nfl');
});

test('rule zero: a nugget survives only if its source was opened in this research', () => {
  const opened = ['https://www.espn.com/college-football/story/_/id/1/', 'https://kuathletics.com/news/2026/9/9/x'];
  const r = keepVerified([
    { text: 'The Jayhawks opened a new stadium this season.', kind: 'fun', source: 'https://kuathletics.com/news/2026/9/9/x' },
    { text: 'ESPN named the coach a riser.', kind: 'fact', source: 'http://espn.com/college-football/story/_/id/1' },
    { text: 'A claim only a search summary made.', kind: 'odd', source: 'https://example.com/never-opened' },
    { text: 'The line moved on the odds board.', kind: 'fact', source: 'https://kuathletics.com/news/2026/9/9/x' }
  ], opened);
  assert.deepEqual(r.kept.map((k) => k.text), [
    'The Jayhawks opened a new stadium this season.',
    'ESPN named the coach a riser.'
  ]);
  assert.ok(r.dropped.some((d) => /not opened/.test(d.why)), 'the unopened source is dropped');
  assert.ok(r.dropped.some((d) => /word/.test(d.why)), 'the betting word is dropped');
});

test('at most 10 kept, and a duplicate text only once', () => {
  const src = 'https://a.org/p';
  const many = Array.from({ length: 14 }, (_, i) => ({ text: 'Nugget number ' + i + '.', kind: 'fun', source: src }));
  many.push({ text: 'Nugget number 1.', kind: 'fun', source: src });
  assert.equal(keepVerified(many, [src]).kept.length, 10);
});

test('URLs compare without scheme, www, fragment or trailing slash', () => {
  assert.equal(normUrl('https://www.ESPN.com/a/b/#x'), normUrl('http://espn.com/a/b'));
  assert.notEqual(normUrl('https://espn.com/a?id=1'), normUrl('https://espn.com/a?id=2'));
});

test('what counts as opened is read off the API response, errors excluded', () => {
  const content = [
    { type: 'server_tool_use', id: 's1', name: 'web_fetch', input: { url: 'https://asked.example/a' } },
    { type: 'web_fetch_tool_result', tool_use_id: 's1', content: { type: 'web_fetch_result', url: 'https://landed.example/a', content: {} } },
    { type: 'server_tool_use', id: 's2', name: 'web_fetch', input: { url: 'https://broken.example/b' } },
    { type: 'web_fetch_tool_result', tool_use_id: 's2', content: { type: 'web_fetch_tool_result_error', error_code: 'url_not_accessible' } },
    { type: 'server_tool_use', id: 's3', name: 'web_search', input: { query: 'x' } },
    { type: 'web_search_tool_result', tool_use_id: 's3', content: [{ type: 'web_search_result', url: 'https://searched.example/c' }] }
  ];
  const u = openedUrls(content);
  assert.ok(u.includes('https://landed.example/a') && u.includes('https://asked.example/a'));
  assert.ok(!u.includes('https://broken.example/b'), 'a failed fetch opened nothing');
  assert.ok(!u.includes('https://searched.example/c'), 'a search result is not an opened page');
});

test('the model answer is parsed from its JSON object, tolerating a fence', () => {
  assert.deepEqual(parseModelJson('```json\n{"nuggets":[]}\n```').nuggets, []);
  assert.equal(parseModelJson('no json here'), null);
  assert.equal(parseModelJson('{broken'), null);
});

test('every call carries the brief\'s rules', () => {
  assert.match(SYSTEM, /RULE ZERO/);
  assert.match(SYSTEM, /web_fetch/);
  assert.match(SYSTEM, /Never mention betting/);
  const b = brief({ league: 'ncaa', teamId: '2305', team: 'Kansas Jayhawks', opponent: 'MIZ @ KU', kickoffUtc: 0, gameDate: '2026-09-12' }, '2026-09-11');
  assert.match(b, /Today is 2026-09-11/);
  assert.match(b, /Kansas Jayhawks/);
  assert.match(b, /up to 10 nuggets/);
});

import { readFileSync } from 'node:fs';

test('the Worker serves nuggets from KV first and the static file second', () => {
  const src = readFileSync(new URL('../src/worker.ts', import.meta.url), 'utf8');
  const at = src.indexOf("const nm = p.match(");
  assert.ok(at > 0, 'the /nuggets route exists');
  const body = src.slice(at, at + 600);
  assert.ok(body.indexOf('env.LIVE.get(`nuggets:') < body.indexOf('env.ASSETS.fetch(req)'), 'KV is read before the static file');
  assert.ok(at < src.indexOf('const authRes = await handleAuth('), 'and it runs ahead of everything else');
  const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
  assert.match(toml, /run_worker_first = \[[^\]]*"\/nuggets\/\*"/, '/nuggets/* reaches the Worker at all');
});

test('the 5 AM seed is its own cron line and does nothing unless enabled', () => {
  const src = readFileSync(new URL('../src/worker.ts', import.meta.url), 'utf8');
  const at = src.indexOf("event.cron === '0 12 * * *'");
  assert.ok(at > 0, 'the seed has its own cron branch');
  assert.ok(src.slice(at, at + 400).includes("env.NUGGET_ENABLED === '1'"), 'gated on NUGGET_ENABLED');
  const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
  assert.match(toml, /crons = \["\*\/10 \* \* \* \*", "0 12 \* \* \*"\]/);
  assert.match(toml, /NUGGET_ENABLED = "0"/, 'ships switched off until a test run has priced a team');
  assert.match(toml, /tag = "v2"[\s\S]*?new_sqlite_classes = \["NuggetDesk"\]/, 'the desk has its migration');
});

test('run and stop need the push token; status does not', () => {
  const src = readFileSync(new URL('../src/worker.ts', import.meta.url), 'utf8');
  const at = src.indexOf("p === '/api/nuggets/run' || p === '/api/nuggets/status'");
  const body = src.slice(at, at + 700);
  assert.ok(body.includes("const write = p !== '/api/nuggets/status';"));
  assert.ok(/write && \(!env\.PUSH_TOKEN \|\| req\.headers\.get\('x-push-token'\) !== env\.PUSH_TOKEN\)/.test(body));
});

test('the /nuggets route pattern is the one the Worker actually runs, and it matches', () => {
  // A scripted edit once stripped this pattern's backslashes; the tests passed and
  // only the build caught it (2026-09-11). So run the real pattern, not a copy.
  const src = readFileSync(new URL('../src/worker.ts', import.meta.url), 'utf8');
  const m = src.match(/const nm = p\.match\((\/.*\/)\);/);
  assert.ok(m, 'the route pattern is a regex literal');
  const re = new Function('return ' + m[1])();
  assert.deepEqual([...('/nuggets/ncaa/2305.json'.match(re) || [])].slice(1), ['ncaa', '2305']);
  assert.deepEqual([...('/nuggets/nfl/14.json'.match(re) || [])].slice(1), ['nfl', '14']);
  for (const bad of ['/nuggets/ncaa/2305xjson', '/nuggets/mlb/1.json', '/nuggets/ncaa/../x.json', '/xnuggets/ncaa/1.json'])
    assert.equal(re.test(bad), false, bad + ' must not match');
});

test('a named date is recognized by the pattern the seed actually runs', () => {
  // The date check once arrived as /^d{4}-d{2}-d{2}$/ - valid, silent, never
  // matching - so a test run aimed at Sunday would have fallen back to tomorrow.
  const src = readFileSync(new URL('../src/worker.ts', import.meta.url), 'utf8');
  const m = src.match(/const named = (\/.*?\/)\.test\(/);
  assert.ok(m, 'the date check is a regex literal');
  const re = new Function('return ' + m[1])();
  assert.equal(re.test('2026-09-13'), true);
  for (const bad of ['2026-9-13', 'tomorrow', '2026-09-13x', 'd{4}-d{2}-d{2}']) assert.equal(re.test(bad), false, bad);
});

test('NUGGET_TEST runs once, by configuration, with its done-record written first', () => {
  const src = readFileSync(new URL('../src/worker.ts', import.meta.url), 'utf8');
  const m = src.match(/const nt = String\(env\.NUGGET_TEST \|\| ''\)\.match\((\/.*?\/)\);/);
  assert.ok(m, 'the trigger pattern is a regex literal');
  const re = new Function('return ' + m[1])();
  assert.deepEqual([...('2026-09-13:2'.match(re) || [])].slice(1), ['2026-09-13', '2']);
  for (const bad of ['2026-09-13', '2026-09-13:', '2026-09-13:200', 'x:2']) assert.equal(re.test(bad), false, bad);
  const at = src.indexOf('const nt = String(env.NUGGET_TEST');
  const body = src.slice(at, at + 900);
  const guard = body.indexOf('if (await env.LIVE.get(doneKey)) return;');
  const mark = body.indexOf('await env.LIVE.put(doneKey');
  const seed = body.indexOf('await seedNuggets(env, { date: nt[1]');
  assert.ok(guard > 0 && mark > guard && seed > mark, 'checked, then marked, then seeded - never twice');
});

import { nextGames, isFreshForNext } from '../src/lib/nuggets.ts';

test('weekly: each team is due for its NEXT game once its previous game is over', () => {
  // Jason, 2026-09-11: "for the NFL it can run after the last game on Monday, so
  // Tuesday morning it can schedule to run. Then if it has a problem it can run
  // Wednesday morning, and so on."
  const t = (s) => Date.parse(s);
  const row = (id, kick, status, home, away) => ({ id, sport: 'nfl', kickoff_utc: t(kick), status,
    home_team_id: home, away_team_id: away, home_name: 'T' + home, away_name: 'T' + away, home_abbrev: 'H' + home, away_abbrev: 'A' + away });
  const rows = [
    row('1', '2026-09-13T20:00:00Z', 'final', '10', '11'),   // Sunday
    row('2', '2026-09-15T00:15:00Z', 'final', '12', '13'),   // Monday night (Pacific 09-14)
    row('3', '2026-09-20T20:00:00Z', 'scheduled', '10', '12'), // next Sunday
    row('4', '2026-09-20T17:00:00Z', 'scheduled', '11', '13')
  ];
  // Tuesday 5 AM Pacific, after Monday night.
  const tue = t('2026-09-15T12:00:00Z');
  const next = nextGames(rows, tue, 7);
  const by = Object.fromEntries(next.map((n) => [n.teamId, n]));
  assert.deepEqual(Object.keys(by).sort(), ['10', '11', '12', '13']);
  assert.equal(by['12'].prevDate, '2026-09-14', 'the Monday-night team\'s previous game is Monday');
  assert.equal(by['10'].prevDate, '2026-09-13');
  assert.equal(by['12'].opponent, 'A12 @ H10');
  // researched Monday morning (before the Monday game) - still due Tuesday
  assert.equal(isFreshForNext('2026-09-14', by['12']), false);
  // researched Tuesday - fresh, so Wednesday's run skips it
  assert.equal(isFreshForNext('2026-09-15', by['12']), true);
  // the Sunday team researched Monday is fresh
  assert.equal(isFreshForNext('2026-09-14', by['10']), true);
});

test('weekly: a game in progress is the previous game, and nothing beyond the window is listed', () => {
  const t = (s) => Date.parse(s);
  const rows = [
    { id: 'a', sport: 'college-football', kickoff_utc: t('2026-09-12T19:00:00Z'), status: 'in', home_team_id: '1', away_team_id: '2' },
    { id: 'b', sport: 'college-football', kickoff_utc: t('2026-09-19T19:00:00Z'), status: 'scheduled', home_team_id: '1', away_team_id: '3' },
    { id: 'c', sport: 'college-football', kickoff_utc: t('2026-10-10T19:00:00Z'), status: 'scheduled', home_team_id: '4', away_team_id: '5' }
  ];
  const during = t('2026-09-12T20:00:00Z');   // Saturday, game a in progress
  const n = nextGames(rows, during, 7);
  const one = n.find((x) => x.teamId === '1');
  assert.equal(one.gameDate, '2026-09-19');
  assert.equal(one.prevDate, '2026-09-12', 'not due until the day after today\'s game');
  assert.equal(isFreshForNext('2026-09-12', one), false);
  assert.ok(!n.some((x) => x.teamId === '4'), 'a game a month out is not in a 7-day window');
  assert.equal(n.find((x) => x.teamId === '3').league, 'ncaa');
});

test('weekly: with no previous game on record, within 7 days counts as fresh', () => {
  const g = { prevDate: null, gameDate: '2026-09-19' };
  assert.equal(isFreshForNext('2026-09-12', g), true);
  assert.equal(isFreshForNext('2026-09-11', g), false);
  assert.equal(isFreshForNext(null, g), false);
});

import { computeDue, nuggetAlertTick } from '../src/nugget-due.ts';

/* A fake Worker env: D1 rows, KV, the static files, and a recorded mail send. */
function fakeEnv({ rows, kv = {}, files = {}, extra = {} }) {
  const store = { ...kv };
  return {
    SEASON: '2026', RESEND_API_KEY: 'test', ALERT_EMAIL: 'owner@example.com', ...extra,
    DB: { prepare: () => ({ bind: () => ({ all: async () => ({ results: rows }) }) }) },
    /* Like real KV: expirationTtl is seconds, at least 60, and an int32. The first
       version of the alert passed 30 days in MILLISECONDS; the lenient fake let it
       through and the real one threw after every send (2026-09-11). */
    LIVE: { get: async (k) => (k in store ? store[k] : null), _store: store,
      put: async (k, v, o) => {
        const ttl = o && o.expirationTtl;
        if (ttl !== undefined && !(Number.isInteger(ttl) && ttl >= 60 && ttl <= 2147483647)) {
          throw new Error('Value out of range. Must be between -2147483648 and 2147483647 (inclusive).');
        }
        store[k] = v;
      } },
    ASSETS: { fetch: async (req) => {
      const p = new URL(req.url).pathname;
      return p in files ? new Response(JSON.stringify(files[p]), { status: 200 }) : new Response('no', { status: 404 });
    } }
  };
}
async function withMail(fn) {
  const sent = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => { sent.push({ url: String(url), body: JSON.parse(init.body) }); return new Response('{}', { status: 200 }); };
  try { return { result: await fn(), sent }; } finally { globalThis.fetch = real; }
}
const T = (s) => Date.parse(s);
const soonRows = [
  { id: 'g1', sport: 'nfl', kickoff_utc: T('2026-09-13T20:00:00Z'), status: 'scheduled', home_team_id: '1', away_team_id: '2' }
];

test('alert: computeDue marks a team without a current file as due, and inside 48 hours as urgent', async () => {
  const env = fakeEnv({ rows: soonRows, files: { '/nuggets/nfl/2.json': { asOf: '2026-09-12' } } });
  const d = await computeDue(env, T('2026-09-12T17:00:00Z'));
  assert.equal(d.total, 2);
  assert.deepEqual(d.urgent.map((t) => t.teamId), ['1'], 'team 1 has no file; team 2 is fresh');
});

test('alert: one email when a game inside 48 hours is uncovered, and never twice a day', async () => {
  const env = fakeEnv({ rows: soonRows });
  const at10 = T('2026-09-12T17:05:00Z');            // 10:05 AM Pacific, first tick of the hour
  const a = await withMail(() => nuggetAlertTick(env, at10));
  assert.equal(a.result.sent, true);
  assert.equal(a.sent.length, 1);
  assert.equal(a.sent[0].url, 'https://api.resend.com/emails');
  assert.deepEqual(a.sent[0].body.to, ['owner@example.com']);
  assert.match(a.sent[0].body.subject, /2 teams without game facts inside 48 hours/);
  const b = await withMail(() => nuggetAlertTick(env, T('2026-09-12T18:05:00Z')));
  assert.equal(b.sent.length, 0, 'the day is marked; no second email');
});

test('alert: nothing is sent when everything is covered, or outside 10 AM-10 PM', async () => {
  const covered = fakeEnv({ rows: soonRows, files: { '/nuggets/nfl/1.json': { asOf: '2026-09-12' }, '/nuggets/nfl/2.json': { asOf: '2026-09-12' } } });
  const a = await withMail(() => nuggetAlertTick(covered, T('2026-09-12T17:05:00Z')));
  assert.equal(a.sent.length, 0);
  const night = fakeEnv({ rows: soonRows });
  const b = await withMail(() => nuggetAlertTick(night, T('2026-09-12T10:05:00Z')));   // 3:05 AM Pacific
  assert.equal(b.sent.length, 0);
  assert.equal(b.result.skipped, 'not the hourly slot');
});

test('alert: the test email goes once, whatever the hour', async () => {
  const env = fakeEnv({ rows: soonRows, extra: { NUGGET_ALERT_TEST: 'first' } });
  const a = await withMail(() => nuggetAlertTick(env, T('2026-09-12T10:05:00Z')));
  assert.equal(a.sent.length, 1);
  assert.match(a.sent[0].body.subject, /test alert/);
  const b = await withMail(() => nuggetAlertTick(env, T('2026-09-12T10:15:00Z')));
  assert.equal(b.sent.length, 0, 'a test id is sent once');
});
