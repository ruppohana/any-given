/* QUESTIONS POOLS - the server half, run for real.
 *
 * Jason, 2026-09-13: "add cricket too, and non sports, golf, oscars, everything damn
 * it that hits a certain viewship." The Emmys are the first deadline (Monday,
 * September 14, 2026, 5 PM PT).
 *
 * src/props-pool.ts is driven through its own routes against a real SQLite
 * database (D1 is SQLite): migrations/0011_props.sql as written, plus the columns
 * of pool / member / account / session the handler reads. The D1 shim below does
 * what D1 does and no more - prepare/bind/first/all/run/batch - so a query D1 would
 * reject is rejected here too. The clock is pinned (Date.now) so the tests do not
 * change meaning after the Emmys lock.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { handlePropsPool, propsStandings } from '../src/props-pool.ts';
import { cleanQuestion, scoreProps, PROP_TEMPLATES, templatesOpen, isOpen, VOID } from '../src/lib/props.ts';

/* ------------------------------------------------------------ D1, on SQLite */
function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE account (id TEXT PRIMARY KEY, email TEXT, handle TEXT, first_name TEXT, last_name TEXT, verified_at INTEGER);
           CREATE TABLE session (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL, device_id TEXT NOT NULL, created_at INTEGER NOT NULL);
           CREATE TABLE pool (id TEXT PRIMARY KEY, name TEXT, sport TEXT NOT NULL DEFAULT 'college-football');
           CREATE TABLE member (pool_id TEXT, user_id TEXT, display_name TEXT, role TEXT, PRIMARY KEY (pool_id, user_id));`);
  db.exec(readFileSync(new URL('../migrations/0011_props.sql', import.meta.url), 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; }
  });
  return { db, DB: { prepare: (sql) => stmt(sql), batch: async (list) => { for (const s of list) await s.run(); return []; } } };
}

const NOW = Date.UTC(2026, 8, 13, 18, 0, 0);          // Sunday afternoon, before the Emmys
const realNow = Date.now;
const tokens = {};
function setup() {
  Date.now = () => NOW;
  const { db, DB } = d1();
  for (const [id, handle] of [['u-com', 'commish'], ['u-mem', 'member'], ['u-out', 'outsider']]) {
    db.prepare('INSERT INTO account (id, email, handle, verified_at) VALUES (?, ?, ?, 1)').run(id, handle + '@example.com', handle);
    const tok = createHash('sha256').update(id).digest('hex');           // any 64-hex token
    tokens[id] = tok;
    db.prepare('INSERT INTO session VALUES (?, ?, ?, 0)').run(createHash('sha256').update(tok).digest('hex'), id, 'd');
  }
  db.exec(`INSERT INTO pool VALUES ('EMMYS1', 'The Office Emmys', 'props'), ('NFLG01', 'Sunday', 'nfl');
           INSERT INTO member VALUES ('EMMYS1', 'u-com', 'commish', 'commissioner'), ('EMMYS1', 'u-mem', 'member', 'player'),
                                     ('NFLG01', 'u-com', 'commish', 'commissioner');`);
  return { db, env: { DB } };
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
async function call(env, who, path, body) {
  const url = 'https://anygiven.app' + path;
  const init = { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' } };
  if (who) init.headers.authorization = 'Bearer ' + tokens[who];
  if (body) init.body = JSON.stringify(body);
  const res = await handlePropsPool(new Request(url, init), env, new URL(url).pathname, json);
  return { status: res.status, body: await res.json() };
}

/* ------------------------------------------------------------ pure */

test('a question is cleaned or refused: text, 2-20 distinct options, points 1-10, a lock', () => {
  const q = cleanQuestion({ text: '  Best Drama  ', options: ['A', 'a', 'B', '', 'void', 'C'], points: 99, lockAt: NOW + 1 }, NOW);
  assert.deepEqual(q, { text: 'Best Drama', options: ['A', 'B', 'C'], points: 10, lockAt: NOW + 1 });
  assert.equal(cleanQuestion({ text: 'x', options: ['only one'], lockAt: NOW + 1 }, NOW), null);
  assert.equal(cleanQuestion({ text: '', options: ['a', 'b'], lockAt: NOW + 1 }, NOW), null);
  assert.equal(cleanQuestion({ text: 'x', options: ['a', 'b'] }, NOW), null, 'a lock time is required');
});

test('the ready sets: the 2026 Emmys (14, lock at the broadcast) and Survivor 51 (21 castaways)', () => {
  const em = PROP_TEMPLATES['emmys-2026'];
  assert.equal(em.questions.length, 14);
  assert.ok(em.questions.every((q) => q.lockAt === Date.UTC(2026, 8, 15, 0, 0, 0)), '5 PM PT Monday');
  assert.ok(em.questions.every((q) => cleanQuestion(q, NOW)), 'every Emmys question is valid as stored');
  const sv = PROP_TEMPLATES['survivor-51'];
  assert.equal(sv.questions[0].options.length, 21);
  /* Soonest first: the Emmys lock Sept 15, Dancing with the Stars Sept 16, Survivor Sept 24. */
  assert.deepEqual(templatesOpen(NOW).map((t) => t.id), ['emmys-2026', 'dwts-35', 'survivor-51']);
  assert.deepEqual(templatesOpen(Date.UTC(2026, 8, 20)).map((t) => t.id), ['survivor-51'], 'a set is not offered once it has locked');
});

test('scoring: a right answer scores its points; void and unsettled score nobody', () => {
  const qs = [
    { qid: 'a', position: 1, text: 'A', options: ['x', 'y'], points: 3, lockAt: 1, answer: 'x' },
    { qid: 'b', position: 2, text: 'B', options: ['x', 'y'], points: 2, lockAt: 1, answer: VOID },
    { qid: 'c', position: 3, text: 'C', options: ['x', 'y'], points: 1, lockAt: 1, answer: null }
  ];
  assert.deepEqual(scoreProps(qs, { a: 'x', b: 'x', c: 'x' }), { points: 3, correct: 1, settled: 1 });
  assert.deepEqual(scoreProps(qs, { a: 'y' }), { points: 0, correct: 0, settled: 1 });
  assert.equal(isOpen({ lockAt: NOW + 1 }, NOW), true);
  assert.equal(isOpen({ lockAt: NOW }, NOW), false, 'the lock instant is already locked');
});

/* ------------------------------------------------------------ the routes */

test('who may play: a signed-out call opens the sign-in sheet; an outsider and a football group are refused', async () => {
  const { env } = setup();
  try {
    assert.equal((await call(env, null, '/api/props?pool=EMMYS1')).body.error, 'email_required');
    assert.equal((await call(env, 'u-out', '/api/props?pool=EMMYS1')).status, 403);
    assert.equal((await call(env, 'u-com', '/api/props?pool=NFLG01')).status, 409);
  } finally { Date.now = realNow; }
});

test('the commissioner loads the Emmys; a member picks; only the commissioner writes questions', async () => {
  const { env } = setup();
  try {
    const empty = await call(env, 'u-com', '/api/props?pool=EMMYS1');
    assert.deepEqual(empty.body.questions, []);
    assert.deepEqual(empty.body.templates.map((t) => t.id), ['emmys-2026', 'dwts-35', 'survivor-51']);
    assert.deepEqual((await call(env, 'u-mem', '/api/props?pool=EMMYS1')).body.templates, [], 'a member is not offered the sets');

    assert.equal((await call(env, 'u-mem', '/api/props/template', { pool: 'EMMYS1', template: 'emmys-2026' })).status, 403);
    const loaded = await call(env, 'u-com', '/api/props/template', { pool: 'EMMYS1', template: 'emmys-2026' });
    assert.equal(loaded.body.added, 14);
    assert.equal((await call(env, 'u-com', '/api/props/template', { pool: 'EMMYS1', template: 'emmys-2026' })).body.added, 0, 'loading twice adds nothing');

    const drama = loaded.body.questions[0];
    assert.equal(drama.text, 'Outstanding Drama Series');
    assert.equal((await call(env, 'u-mem', '/api/props/pick', { pool: 'EMMYS1', qid: drama.qid, choice: 'The Pitt' })).status, 200);
    assert.equal((await call(env, 'u-mem', '/api/props/pick', { pool: 'EMMYS1', qid: drama.qid, choice: 'Severance' })).status, 400, 'not a nominee');
    const mine = await call(env, 'u-mem', '/api/props?pool=EMMYS1');
    assert.equal(mine.body.picks[drama.qid], 'The Pitt');
    assert.deepEqual(mine.body.counts, {}, 'nobody sees the split before the lock');

    assert.equal((await call(env, 'u-mem', '/api/props/questions', { pool: 'EMMYS1', questions: [{ text: 'Q', options: ['a', 'b'], lockAt: NOW + 1000 }] })).status, 403);
    const added = await call(env, 'u-com', '/api/props/questions', { pool: 'EMMYS1', questions: [{ text: 'How long is the host\'s monologue?', options: ['Under 5 min', '5-10 min', 'Over 10 min'], points: 2, lockAt: NOW + 3600000 }] });
    assert.equal(added.body.added, 1);
    assert.equal(added.body.questions.length, 15);
    assert.equal((await call(env, 'u-com', '/api/props/questions', { pool: 'EMMYS1', questions: [{ text: 'Late', options: ['a', 'b'], lockAt: NOW - 1 }] })).status, 400, 'a lock in the past is refused');
  } finally { Date.now = realNow; }
});

test('the lock holds both ways, and the board scores the answers', async () => {
  const { env } = setup();
  try {
    const loaded = await call(env, 'u-com', '/api/props/template', { pool: 'EMMYS1', template: 'emmys-2026' });
    const [drama, comedy] = loaded.body.questions;
    await call(env, 'u-mem', '/api/props/pick', { pool: 'EMMYS1', qid: drama.qid, choice: 'The Pitt' });
    await call(env, 'u-com', '/api/props/pick', { pool: 'EMMYS1', qid: drama.qid, choice: 'Slow Horses' });
    await call(env, 'u-mem', '/api/props/pick', { pool: 'EMMYS1', qid: comedy.qid, choice: 'Hacks' });

    assert.equal((await call(env, 'u-com', '/api/props/settle', { pool: 'EMMYS1', qid: drama.qid, answer: 'The Pitt' })).status, 409, 'no answer while people can still pick');

    Date.now = () => Date.UTC(2026, 8, 15, 3, 0, 0);    // the broadcast is over
    assert.equal((await call(env, 'u-mem', '/api/props/pick', { pool: 'EMMYS1', qid: drama.qid, choice: 'Slow Horses' })).status, 409, 'no pick after the lock');
    assert.equal((await call(env, 'u-com', '/api/props/delete', { pool: 'EMMYS1', qid: drama.qid })).status, 409, 'a locked question is a record');
    assert.equal((await call(env, 'u-com', '/api/props/settle', { pool: 'EMMYS1', qid: drama.qid, answer: 'Severance' })).status, 400);
    assert.equal((await call(env, 'u-com', '/api/props/settle', { pool: 'EMMYS1', qid: drama.qid, answer: 'The Pitt' })).status, 200);
    assert.equal((await call(env, 'u-com', '/api/props/settle', { pool: 'EMMYS1', qid: comedy.qid, answer: VOID })).status, 200);

    const after = await call(env, 'u-mem', '/api/props?pool=EMMYS1');
    assert.deepEqual(after.body.counts[drama.qid], { 'The Pitt': 1, 'Slow Horses': 1 }, 'the split shows once locked');
    const board = await propsStandings(env, 'EMMYS1');
    assert.deepEqual(board.map((r) => [r.name, r.points, r.correct]), [['member', 3, 1], ['commish', 0, 0]],
      'Drama is worth 3; a void comedy question scores nobody');
    assert.equal(board[0].wins, 3, 'the football board\'s name carries the points');
  } finally { Date.now = realNow; }
});
