/**
 * L7 - result and settlement.
 *
 *   node --test tests/l7-result.test.mjs
 *
 * Four kinds of evidence, in this order:
 *
 *  1. THE PREVIEW BLOCK IS NOT A FIXTURE. Every play, every star, every price,
 *     every payout and every bank figure in `PREVIEW` is re-derived here from
 *     `fixtures/real-utep-at-ou-260905-final.json` through the real `parse.ts`
 *     and the real `calls.ts`, and deep-compared. The screen holds a transport
 *     across a gap the browser cannot cross - a browser cannot import TypeScript -
 *     and this test is what stops that transport from rotting into invented data.
 *
 *  2. 7.2 - the star is the parser's. The parenthesized group at the end of each
 *     of these real play texts is the TACKLER, and this asserts by name that
 *     S.Bowser, A.Coker and every other bracketed name is absent from the card.
 *
 *  3. SYMMETRY, PROVEN ON THE RENDERED DOM. `landed` and `missed` are rendered
 *     through the real `render()` against a minimal DOM and their element trees
 *     are compared node by node. They must be IDENTICAL once the sign is
 *     normalized away, and they must differ ONLY in sign-bearing tokens.
 *
 *  4. The rules that may not be decided - the balance noun, the 6x cap, the price
 *     at the moment of the call, a void returning the stake, and the absence of
 *     every word that would make Marbles a currency.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parsePlays } from '../src/lib/parse.ts';
import { openLedger, accept, lock, settle, payoutFor, HOUSE_RULES } from '../src/lib/calls.ts';

const SCREEN_URL = new URL('../public/screens/l7-result.screen.js', import.meta.url);
const CSS_URL = new URL('../public/screens/l7-result.css', import.meta.url);
const SUMMARY = JSON.parse(
  fs.readFileSync(new URL('../fixtures/real-utep-at-ou-260905-final.json', import.meta.url), 'utf8'),
);
const TEAMS = JSON.parse(
  fs.readFileSync(new URL('../fixtures/teams.json', import.meta.url), 'utf8'),
).teams;

// ---------------------------------------------------------------------------
// A minimal DOM. Enough for team-chip.js, states.js and this screen, and no more.
// It exists so that SYMMETRY can be asserted on the real render() output rather
// than on a description of it. The BROWSER is still the close for layout (7.5);
// this is the close for structure.
// ---------------------------------------------------------------------------

function makeDom() {
  const mk = (tag, ns) => {
    const node = {
      tagName: String(tag).toLowerCase(),
      ns: ns || null,
      children: [],
      attrs: {},
      dataset: {},
      _class: '',
      _text: '',
      style: { props: {}, setProperty(k, v) { this.props[k] = v; } },
      get className() { return node._class; },
      set className(v) { node._class = String(v); },
      classList: {
        add(...cs) {
          const have = node._class ? node._class.split(/\s+/) : [];
          for (const c of cs) if (c && !have.includes(c)) have.push(c);
          node._class = have.join(' ');
        },
      },
      get textContent() { return node._text; },
      set textContent(v) { node._text = v == null ? '' : String(v); node.children = []; },
      set innerHTML(v) { if (v === '') { node.children = []; node._text = ''; } },
      appendChild(c) { node.children.push(c); return c; },
      append(...cs) { for (const c of cs) node.children.push(c); },
      setAttribute(k, v) { node.attrs[k] = String(v); },
      getAttribute(k) { return node.attrs[k]; },
      addEventListener() {},
    };
    return node;
  };
  return {
    createElement: (t) => mk(t, null),
    createElementNS: (ns, t) => mk(t, ns),
    body: mk('body', null),
  };
}

/** `tag.class#data-a=b|data-c=d` for a node, one line per node, depth-indented. */
function skeleton(node, depth = 0, out = []) {
  const ds = Object.keys(node.dataset).sort().map((k) => k + '=' + node.dataset[k]).join(',');
  out.push('  '.repeat(depth) + node.tagName + (node._class ? '.' + node._class.trim().split(/\s+/).join('.') : '') + (ds ? '[' + ds + ']' : ''));
  for (const c of node.children) skeleton(c, depth + 1, out);
  return out;
}

/** Everything that carries the sign. Normalizing these away must leave two
 *  identical trees, or `landed` and `missed` are not one component. */
const SIGN_TOKENS = /\b(landed|missed|up|down)\b/g;
const normalize = (lines) => lines.map((l) => l.replace(SIGN_TOKENS, '<sign>'));

async function loadScreen() {
  globalThis.document = makeDom();
  return import(SCREEN_URL.href);
}

/* Exactly what tools/preview.mjs does: previewData(fixtures, state), then
 * render(root, data, state). Nothing is hand-assembled. */
const FIXTURES = { teams: { teams: TEAMS }, games: ['real-utep-at-ou'] };

async function renderTo(screen, state) {
  const root = globalThis.document.createElement('div');
  const data = await screen.previewData(FIXTURES, state);
  screen.render(root, data, state);
  return root;
}

/** Strip CSS comments before asserting on the source - this file talks about
 *  box-shadow and --maroon in order to say it never uses them. */
const uncomment = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

// ---------------------------------------------------------------------------
// 1 - the preview block is the modules' own output on the real fixture
// ---------------------------------------------------------------------------

/** The replay stated in the screen's own header, re-run here from source. */
function replay(screen) {
  const plays = parsePlays(SUMMARY);
  const R = screen.REPLAY;
  const L = openLedger(R.gameId, 'preview');
  let run = 0, pass = 0, voided = 0;
  const snapshots = new Map();
  for (const p of plays) {
    const isSnap = p.type === 'run' || p.type === 'pass' || p.type === 'penalty';
    if (p.offenseTeamId === R.offenseId && isSnap) {
      const n = run + pass;
      if (n >= R.minPriorSnaps) {
        const price = Math.round((pass / n) * 1000) / 1000;
        const a = accept(L, { snapId: p.id, side: R.side, stake: R.stake, p: price });
        if (a.ok) {
          lock(L, p.id);
          const atLock = {
            call: JSON.parse(JSON.stringify(a.call)),
            bank: JSON.parse(JSON.stringify({ ...L.bank, delta: L.bank.delta })),
          };
          const r = settle(L, p.id, p.type);
          if (r.landed === null) voided++;
          snapshots.set(p.id, {
            play: p,
            call: JSON.parse(JSON.stringify(r.call)),
            returned: r.returned,
            bank: JSON.parse(JSON.stringify(L.bank)),
            voided,
            atLock,
          });
        }
      }
    }
    if (p.offenseTeamId === R.offenseId) {
      if (p.type === 'run') run++; else if (p.type === 'pass') pass++;
    }
  }
  return { plays, snapshots };
}

test('PREVIEW is the real modules’ output on the real fixture, not a written fixture', async () => {
  const screen = await loadScreen();
  const { snapshots } = replay(screen);

  let checked = 0;
  for (const state of ['landed', 'missed', 'void']) {
    const want = screen.PREVIEW[state];
    const got = snapshots.get(want.call.snapId);
    assert.ok(got, `snap ${want.call.snapId} never settled in the replay`);
    assert.deepEqual(want.play, got.play, `${state}: play drifted from parse.ts`);
    assert.deepEqual(want.call, got.call, `${state}: call drifted from calls.ts`);
    assert.equal(want.returned, got.returned, `${state}: returned drifted`);
    assert.deepEqual(want.bank, got.bank, `${state}: bank drifted`);
    assert.equal(want.voided, got.voided, `${state}: void count drifted`);
    checked++;
  }

  /* `settling` is the SAME SNAP as `landed`, one moment earlier. */
  const s = screen.PREVIEW.settling;
  const at = snapshots.get(s.call.snapId).atLock;
  assert.deepEqual(s.call, at.call, 'settling: the locked call drifted');
  assert.equal(s.bank.balance, at.bank.balance, 'settling: the committed balance drifted');
  assert.equal(s.bank.start, at.bank.start);
  assert.equal(s.bank.delta, at.bank.delta);
  checked++;

  console.log(`    4 snapshots re-derived from fixtures/real-utep-at-ou-260905-final.json (${checked})`);
  console.log('    landed 401856664385  p=0.406  stake 10 -> returned 25  bank 197 -> 212');
  console.log('    missed 401856664381  p=0.419  stake 10 -> returned  0  bank 207 -> 197');
  console.log('    void   401856664295  p=0.379  stake 10 -> returned 10  bank 176 -> 176');
});

test('the payout is stake / p capped at 6x, at the price at the moment of the call', async () => {
  const screen = await loadScreen();
  for (const state of ['landed', 'missed', 'void']) {
    const s = screen.PREVIEW[state];
    if (s.call.landed === true) {
      assert.equal(s.returned, payoutFor(s.call.stake, s.call.p, HOUSE_RULES.maxPayoutMultiple));
      assert.ok(s.returned <= s.call.stake * 6, 'the 6x cap');
    } else if (s.call.landed === false) {
      assert.equal(s.returned, 0);
    } else {
      assert.equal(s.returned, s.call.stake, 'A VOID RETURNS THE STAKE. It is not a loss.');
      assert.equal(s.call.delta, 0);
    }
  }
  /* The cap, at the price this game would have offered on a very one-sided snap. */
  assert.equal(payoutFor(10, 0.1), 60, 'stake/p is 100; the cap is 60');
});

// ---------------------------------------------------------------------------
// 2 - 7.2, the star
// ---------------------------------------------------------------------------

test('7.2 the star is the parser’s and the bracketed name is never on the card', async () => {
  const screen = await loadScreen();
  const { plays } = replay(screen);

  const expect = {
    '401856664385': 'I.Sategna III',
    '401856664381': 'L.Avant',
    '401856664295': null,
  };
  for (const [pid, name] of Object.entries(expect)) {
    const parsed = plays.find((p) => p.id === pid);
    assert.equal(parsed.star ? parsed.star.name : null, name, `parser star for ${pid}`);
  }

  /* Every name inside the trailing parentheses of these three real texts. On the
   * missed snap the naive "last name in the play text" rule yields S.Bowser, who
   * made the tackle; on the penalty it yields A.Coker, who jumped offside. */
  const forbidden = ['S.Bowser', 'A.Coker', 'K.Miles', 'J.Ulrich', 'B.Anderson', 'T.Sandell'];
  for (const state of ['landed', 'missed', 'void']) {
    const root = await renderTo(screen, state);
    const starRow = skeleton(root).filter((l) => l.includes('l7-star'));
    assert.ok(starRow.length, `${state} has a star row`);
    const names = collectText(root, 'l7-star-name');
    for (const bad of forbidden) {
      assert.ok(!names.includes(bad), `${state}: ${bad} reached the star slot`);
    }
  }
  const landedNames = collectText(await renderTo(screen, 'landed'), 'l7-star-name');
  assert.deepEqual(landedNames, ['I.Sategna III']);
  const missedNames = collectText(await renderTo(screen, 'missed'), 'l7-star-name');
  assert.deepEqual(missedNames, ['L.Avant']);
  const voidNames = collectText(await renderTo(screen, 'void'), 'l7-star-name');
  assert.deepEqual(voidNames, [], 'the parser emitted no star for the penalty, so neither does the card');
  console.log('    landed -> I.Sategna III (receiver) - not K.Miles, not T.Sandell');
  console.log('    missed -> L.Avant (carrier)        - not S.Bowser');
  console.log('    void   -> no player at all         - not A.Coker');
});

function collectText(node, cls, out = []) {
  if (node._class && node._class.split(/\s+/).includes(cls)) out.push(node.textContent);
  for (const c of node.children) collectText(c, cls, out);
  return out;
}

// ---------------------------------------------------------------------------
// 3 - SYMMETRY
// ---------------------------------------------------------------------------

test('landed and missed are ONE component - identical DOM once the sign is normalized', async () => {
  const screen = await loadScreen();
  const a = skeleton(await renderTo(screen, 'landed'));
  const b = skeleton(await renderTo(screen, 'missed'));

  assert.equal(a.length, b.length, 'different node counts means two components');
  assert.deepEqual(normalize(a), normalize(b),
    'landed and missed must produce the same tree with the sign normalized away');

  /* And the sign must actually BE expressed - identical raw trees would mean a
   * miss is drawn as a win. */
  const differing = a.map((l, i) => (l === b[i] ? null : [l, b[i]])).filter(Boolean);
  assert.ok(differing.length > 0, 'the sign is not expressed anywhere in the DOM');
  for (const [x, y] of differing) {
    const tokens = new Set([...x.matchAll(SIGN_TOKENS), ...y.matchAll(SIGN_TOKENS)].map((m) => m[0]));
    assert.deepEqual(
      normalize([x])[0], normalize([y])[0],
      `a difference that is not the sign: ${x} vs ${y}`,
    );
    assert.ok(tokens.size > 0, `unexplained difference: ${x} vs ${y}`);
  }
  console.log(`    ${a.length} nodes each, ${differing.length} lines differ, and every difference is the sign:`);
  for (const [x, y] of differing) console.log('      ' + x.trim() + '   |   ' + y.trim());
});

test('the verdict changes three words and four numbers, and nothing else', async () => {
  const screen = await loadScreen();
  const teams = TEAMS;
  const L = screen.resultView(screen.PREVIEW.landed, 'landed', teams);
  const M = screen.resultView(screen.PREVIEW.missed, 'missed', teams);
  const V = screen.resultView(screen.PREVIEW.void, 'void', teams);
  const keys = (o) => Object.keys(o).sort();
  assert.deepEqual(keys(L), keys(M));
  assert.deepEqual(keys(L), keys(V));
  assert.equal(L.sign, 'up');
  assert.equal(M.sign, 'down');
  assert.equal(V.sign, '', 'a void did not move the bank, so it has no direction');
  assert.equal(L.word, 'Landed');
  assert.equal(M.word, 'Missed');
  assert.equal(V.word, 'Void');
  /* Same register, same shape. A win does not get punctuation the miss is denied. */
  for (const v of [L, M, V]) assert.ok(!/[!]/.test(v.say), 'no exclamation mark on any outcome');
});

test('a void SAYS a void happened - it is never a silent zero', async () => {
  const screen = await loadScreen();
  const root = await renderTo(screen, 'void');
  const text = allText(root).join(' ');
  assert.match(text, /Void/);
  assert.match(text, /did not happen/);
  assert.match(text, /stake came back/);
  const verdicts = collectText(root, 'l7-verdict');
  assert.deepEqual(verdicts, ['Void']);
  assert.equal(screen.PREVIEW.void.returned, screen.PREVIEW.void.call.stake);
});

test('the star row has a defined empty state, driven by the star and not by the verdict', async () => {
  const screen = await loadScreen();
  const voidRoot = await renderTo(screen, 'void');
  /* Render the LANDED snapshot with its star removed. If the empty star row is a
   * property of `star === null` rather than of the verdict, the two star rows are
   * the same shape. */
  const nulled = JSON.parse(JSON.stringify(screen.PREVIEW.landed));
  nulled.play.star = null;
  const root = globalThis.document.createElement('div');
  screen.render(root, { snap: nulled, teams: TEAMS, forState: 'landed' }, 'landed');
  const starOf = (r) => skeleton(r).filter((l) => l.includes('l7-star')).map((l) => l.trim());
  assert.deepEqual(normalize(starOf(root)), normalize(starOf(voidRoot)));
});

// ---------------------------------------------------------------------------
// 4 - the rules that may not be decided
// ---------------------------------------------------------------------------

test('every state is a route, and each one draws something', async () => {
  const screen = await loadScreen();
  assert.deepEqual(screen.states,
    ['landed', 'missed', 'void', 'settling', 'loading', 'offline', 'error']);
  for (const st of screen.states) {
    const root = await renderTo(screen, st);
    const lines = skeleton(root);
    assert.ok(lines.length > 3, `${st} rendered ${lines.length} nodes`);
    const text = allText(root).join(' ');
    assert.ok(text.trim().length > 20, `${st} has no words on it`);
  }
  /* OFFLINE AND ERROR HOLD THE CARD RATHER THAN REPLACING IT. */
  for (const st of ['offline', 'error']) {
    const s = skeleton(await renderTo(screen, st));
    assert.ok(s.some((l) => l.includes('l7-bank')), `${st} dropped the bank`);
    assert.ok(s.some((l) => l.includes('state-' + (st === 'offline' ? 'offline' : 'error'))));
  }
  /* LOADING is the one state with nothing known, so it is the one that replaces. */
  const load = skeleton(await renderTo(screen, 'loading'));
  assert.ok(!load.some((l) => l.includes('l7-bank')));
  assert.ok(load.some((l) => l.includes('state-loading')));
});

test('the balance is Marbles, and no word near it makes it a currency', async () => {
  const screen = await loadScreen();
  assert.equal(screen.BALANCE_NOUN, 'Marbles');
  const js = fs.readFileSync(fileURLToPath(SCREEN_URL), 'utf8');
  const css = fs.readFileSync(fileURLToPath(CSS_URL), 'utf8');
  const banned = /\b(credits?|coins?|top[-\s]?up|purchase|buy|refill)\b/i;
  for (const [name, src] of [['screen.js', js], ['css', css]]) {
    const hit = src.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => banned.test(l));
    assert.deepEqual(hit, [], `${name} carries a currency word: ${JSON.stringify(hit)}`);
  }
  const text = allText(await renderTo(screen, 'landed')).join(' ');
  assert.match(text, /Marbles/);
  assert.ok(!banned.test(text));
});

test('the bank at zero is not a dead end, and it says so where it would be believed', async () => {
  const screen = await loadScreen();
  const broke = JSON.parse(JSON.stringify(screen.PREVIEW.missed));
  broke.bank.balance = 0;
  broke.bank.delta = -100;
  const root = globalThis.document.createElement('div');
  screen.render(root, { snap: broke, teams: TEAMS, forState: 'missed' }, 'missed');
  const text = allText(root).join(' ');
  assert.match(text, /goes back to 100 at the next kickoff/);
  assert.match(text, /still in the pool/);
});

test('no shadow, no hard-coded accent, and the fixed scale is not team color', async () => {
  const css = uncomment(fs.readFileSync(fileURLToPath(CSS_URL), 'utf8'));
  assert.ok(!/box-shadow/i.test(css), 'depth is 1px solid var(--line)');
  assert.ok(!/var\(--maroon\)|var\(--gold\)/.test(css), 'read --accent; the accent swaps token on dark');
  assert.ok(!/:root\s*{/.test(css), 'a screen never writes at :root');
  /* --up / --down appear, and never on anything team-scoped. */
  assert.ok(/var\(--up\)/.test(css) && /var\(--down\)/.test(css));
  for (const line of css.split('\n')) {
    if (/--team-a|--team-b/.test(line)) {
      assert.ok(!/--up|--down/.test(line), 'team color and the fixed scale met on one line');
    }
  }
});

test('every figure is tabular, and no tap target is under 44px', async () => {
  const screen = await loadScreen();
  const root = await renderTo(screen, 'landed');
  const numeric = ['l7-balance', 'l7-move', 'l7-terms', 'l7-position', 'l7-jersey', 'l7-meta'];
  const classes = new Set();
  (function walk(n) { if (n._class) for (const c of n._class.split(/\s+/)) classes.add(c); n.children.forEach(walk); })(root);
  for (const c of numeric) {
    assert.ok(classes.has(c), `${c} is missing`);
  }
  /* .num is what tokens.css hangs font-variant-numeric on. */
  (function walk(n) {
    const cs = n._class ? n._class.split(/\s+/) : [];
    if (cs.some((c) => numeric.includes(c))) {
      assert.ok(cs.includes('num'), `${n._class} holds figures and is not .num`);
    }
    n.children.forEach(walk);
  })(root);
  /* The only interactive elements come from states.js, which sets min-height to
   * var(--tap-min). This screen adds no button of its own. */
  const buttons = [];
  (function walk(n) { if (n.tagName === 'button' || n.tagName === 'a') buttons.push(n._class); n.children.forEach(walk); })(await renderTo(screen, 'offline'));
  assert.deepEqual(buttons, ['state-action']);
});

test('US spelling', async () => {
  const js = fs.readFileSync(fileURLToPath(SCREEN_URL), 'utf8');
  const css = fs.readFileSync(fileURLToPath(CSS_URL), 'utf8');
  const brit = /\b(colour|centre|grey|behaviour|analyse|catalogue)\b/i;
  assert.ok(!brit.test(js), 'screen.js');
  assert.ok(!brit.test(css), 'css');
});

function allText(node, out = []) {
  if (node.children.length === 0 && node._text) out.push(node._text);
  else { if (node._text) out.push(node._text); node.children.forEach((c) => allText(c, out)); }
  return out;
}
