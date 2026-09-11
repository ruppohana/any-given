/* Group pools - the pure rules in src/lib/groups.ts. The routes that use them are
 * in src/groups.ts and are exercised against a real local D1 under `wrangler dev`
 * (see the group build's report); this file pins what a person can hit without a
 * database: codes, cleaning, the two emails' words, and the limits. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CODE_ALPHABET, LIMITS, KINDNESS, newCode, normCode, cleanName, parseEmails, cleanBody,
  inviteMail, messageMail
} from '../src/lib/groups.ts';

test('a code is six characters from the no-vowel alphabet', () => {
  for (let i = 0; i < 200; i++) {
    const c = newCode();
    assert.equal(c.length, 6);
    for (const ch of c) assert.ok(CODE_ALPHABET.includes(ch), 'bad char ' + ch);
  }
  assert.ok(!/[AEIOU01]/.test(CODE_ALPHABET), 'a vowel or a 0/1 in the alphabet');
});

test('a typed code is folded to what is stored', () => {
  assert.equal(normCode(' 7f2-k9m '), '7F2K9M');
  assert.equal(normCode(null), '');
});

test('a group name is one clean line, capped', () => {
  assert.equal(cleanName('  The\n  Office   Pool '), 'The Office Pool');
  assert.equal(cleanName('x'.repeat(90)).length, LIMITS.nameMax);
  assert.equal(cleanName('   '), '');
});

test('a pasted invite list: lowercased, de-duplicated, bad ones named, capped', () => {
  const r = parseEmails('Ann@Example.com, bob@example.com\nann@example.com;not-an-email  carl@ex.co');
  assert.deepEqual(r.ok, ['ann@example.com', 'bob@example.com', 'carl@ex.co']);
  assert.deepEqual(r.bad, ['not-an-email']);
  const many = Array.from({ length: 40 }, (_, i) => `p${i}@example.com`);
  assert.equal(parseEmails(many).ok.length, LIMITS.invitesPerBatch);
});

test('a message keeps its lines, loses control characters and blank runs, is capped', () => {
  assert.equal(cleanBody('hi\r\n\r\n\r\n\r\nthere'), 'hi\n\nthere');
  assert.equal(cleanBody('y'.repeat(5000)).length, LIMITS.messageMax);
  assert.equal(cleanBody('   '), '');
});

test('the invite names the group, the sender and the link, and promises privacy', () => {
  const m = inviteMail({ groupName: 'Fourth Floor', fromHandle: 'jstuartrupp', link: 'https://anygiven.app/?pool=K7RTQZ' });
  assert.match(m.subject, /@jstuartrupp invited you to Fourth Floor/);
  assert.match(m.text, /https:\/\/anygiven\.app\/\?pool=K7RTQZ/);
  assert.match(m.text, /Nothing is staked/);
  assert.match(m.text, /nobody's email address is shown/);
  assert.ok(!/bet|wager|odds/i.test(m.text), 'betting language in the invite');
});

test('a message says who wrote, to whom, and where to reply - never an address', () => {
  const c = messageMail({ groupName: 'Fourth Floor', fromHandle: 'ann', to: 'commish', body: 'Can we add Dave?', link: 'https://anygiven.app/#/g' });
  assert.match(c.subject, /@ann wrote to the commissioner of Fourth Floor/);
  assert.match(c.text, /Can we add Dave\?/);
  const g = messageMail({ groupName: 'Fourth Floor', fromHandle: 'ann', to: 'group', body: 'Good luck', link: 'https://anygiven.app/#/g' });
  assert.match(g.subject, /@ann wrote to Fourth Floor/);
  assert.match(g.text, /everyone in Fourth Floor/);
  assert.ok(!/@[a-z0-9.-]+\.[a-z]{2,}/i.test(c.text.replace('https://anygiven.app', '')), 'an email address in the body');
});

test('the kindness line is the commissioner speaking, and says removal', () => {
  assert.match(KINDNESS, /^As commissioner/);
  assert.match(KINDNESS, /remove/);
});
