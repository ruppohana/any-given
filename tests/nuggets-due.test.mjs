/* NUGGETS - WHICH TEAMS ARE DUE, AND THE ALERT (src/lib/nuggets.ts,
 * src/nugget-due.ts). The research runs on the laptop; these hold the weekly rule
 * both runners share and the email that says when a game is about to go uncovered.
 *
 * The Cloudflare research desk these tests once also covered was removed on
 * 2026-09-11 (Jason: "Remove the cloudflare research"); the last test holds that.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

import { nextGames, isFreshForNext } from '../src/lib/nuggets.ts';
import { computeDue, nuggetAlertTick } from '../src/nugget-due.ts';

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

test('the Cloudflare research desk is gone, and its Durable Object is deleted', () => {
  const src = readFileSync(new URL('../src/worker.ts', import.meta.url), 'utf8');
  for (const gone of ['NuggetDesk', 'seedNuggets', 'NUGGET_DESK', 'ANTHROPIC_API_KEY', '/api/nuggets/run'])
    assert.ok(!src.includes(gone), gone + ' is out of the Worker');
  assert.ok(!existsSync(new URL('../src/nugget-desk.ts', import.meta.url)));
  assert.ok(!existsSync(new URL('../src/nugget-research.ts', import.meta.url)));
  const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
  assert.match(toml, /tag = "v3"\s*\ndeleted_classes = \["NuggetDesk"\]/, 'the class is deleted by migration');
  assert.ok(!/name = "NUGGET_DESK"/.test(toml), 'and no longer bound');
  assert.match(toml, /crons = \["\*\/10 \* \* \* \*"\]/, 'the 5 AM seed cron is gone');
  // Atlanta's facts lived only in the desk's KV; they are a static file now.
  assert.ok(existsSync(new URL('../public/nuggets/nfl/1.json', import.meta.url)));
});
