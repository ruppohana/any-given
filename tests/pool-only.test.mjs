/* 100% POOL - Jason, 2026-09-12: "100% pool".
 *
 * The betting side (The Games, the live call board, F1, Marbles) is hidden
 * behind one switch in app.js, not deleted. These pin the switch and every
 * place it reaches. The close is the live site at 393px, not this file.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (p) => readFileSync(new URL('../public/' + p, import.meta.url), 'utf8');
const APP = src('app.js');
const HOME = src('screens/live-game.screen.js');
const RULES = src('screens/s6-rules.screen.js');
const SETTINGS = src('screens/s2-settings.screen.js');

test('one switch, on, and exposed to the screens', () => {
  assert.ok(APP.includes('const POOL_ONLY = true;'));
  assert.ok(APP.includes('globalThis.AG_POOL_ONLY = POOL_ONLY;'));
});

test('every betting route falls back to Home, and no pool route does', () => {
  const m = APP.match(/const BETTING_ROUTES = new Set\(\[([^\]]+)\]\)/);
  assert.ok(m, 'the hidden set is declared');
  const hidden = new Set([...m[1].matchAll(/'([a-z0-9]+)'/g)].map((x) => x[1]));
  for (const id of ['allgames', 'buildparlay', 'f1', 'f1live', 'live']) assert.ok(hidden.has(id), id + ' is hidden');
  for (const id of ['home', 'slate', 'picks', 'parlay', 'standings', 'invite', 'create', 'rules', 'info',
    'gpicks', 'gstandings', 'g', 'gcommish', 'grules', 'settings']) assert.equal(hidden.has(id), false, id + ' stays');
  assert.ok(APP.includes("if (POOL_ONLY && BETTING_ROUTES.has(id)) return ROUTES.find((r) => r.id === 'home') || ROUTES[0];"));
});

test('a phone still holding the betting side is moved to the pool', () => {
  assert.ok(APP.includes("if (m && m !== 'pool') localStorage.setItem('ag.mode', JSON.stringify('pool'));"));
});

test('Home offers only The Pools, and The Games stays in the list to come back', () => {
  assert.ok(HOME.includes("for (const o of opts.filter((x) => globalThis.AG_POOL_ONLY !== true || x.id === 'pool')) {"));
  assert.ok(HOME.includes("{ id: 'allgames', h: 'The Games',"), 'hidden, not deleted');
});

test('the rules ask only the pool\'s questions, and settings drops the balance', () => {
  assert.ok(RULES.includes("const POOL_SECTIONS = new Set(['void', 'scoring', 'ties', 'scope']);"));
  assert.ok(RULES.includes('const SECTIONS = globalThis.AG_POOL_ONLY === true ? ALL_SECTIONS.filter((s) => POOL_SECTIONS.has(s.id)) : ALL_SECTIONS;'));
  assert.ok(SETTINGS.includes('if (globalThis.AG_POOL_ONLY !== true) root.appendChild(balanceSection());'));
});
