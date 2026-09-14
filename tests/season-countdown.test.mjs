/* THE COUNTDOWNS ON THE SCREENS - the client half. Jason, 2026-09-13: "dont ask do any that
 * appear valid. if any are out of season put a countdown clock on the page."
 *
 *   - public/components/season.js restates src/lib/upcoming.ts countdownText's day count
 *     (a browser component cannot import a module by the path a Node test loads it from);
 *     held equal here, day for day, in several zones.
 *   - its sentence is driven through the REAL src/season-next.ts seasonNext, on the REAL
 *     no-date league calendars captured the night of 2026-09-13
 *     (fixtures/feed/espn-{nba,nhl,mcbb,mch}-scoreboard-nodate-260913.json).
 *   - Home's Coming up rows are lifted out of the shipped screen by name and run against the
 *     REAL UPCOMING list - nothing here restates them.
 *
 * Nothing below writes a fixture. Layout is closed in a browser at 393px, not here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { UPCOMING, upcomingOn, upcomingAt, countdownText } from '../src/lib/upcoming.ts';
import { seasonNext as serverSeasonNext } from '../src/season-next.ts';
import * as SEASON from '../public/components/season.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const feed = (f) => JSON.parse(read('../fixtures/feed/' + f));
const SEP13 = Date.UTC(2026, 8, 13, 18, 0, 0);          /* 11 AM Pacific, 2 PM Eastern */
const PT = 'America/Los_Angeles';

/** ESPN, answered from the captured calendars - the fetch the real season route makes. */
const CAL = {
  'basketball/nba': 'espn-nba-scoreboard-nodate-260913.json',
  'hockey/nhl': 'espn-nhl-scoreboard-nodate-260913.json',
  'basketball/mens-college-basketball': 'espn-mcbb-scoreboard-nodate-260913.json',
  'hockey/mens-college-hockey': 'espn-mch-scoreboard-nodate-260913.json'
};
const espn = async (u) => {
  const path = Object.keys(CAL).find((p) => String(u).includes('/sports/' + p + '/scoreboard'));
  return path ? new Response(JSON.stringify(feed(CAL[path]))) : new Response('no', { status: 404 });
};

/* ------------------------------------------------------------ the page's countdown */

test('the page counts days exactly as countdownText does - every dated event, several zones and hours', () => {
  const zones = [PT, 'America/New_York', 'Pacific/Honolulu', 'Europe/London', 'Asia/Tokyo', undefined];
  const nows = [SEP13, Date.UTC(2026, 8, 13, 6, 59), Date.UTC(2026, 8, 13, 7, 1), Date.UTC(2026, 11, 31, 23, 30), Date.UTC(2027, 2, 14, 9)];
  let n = 0;
  for (const u of UPCOMING.filter((x) => x.date)) {
    for (const now of nows) for (const tz of zones) {
      assert.equal(SEASON.seasonDaysText(u.date, now, tz), countdownText(u, now, tz), u.id + ' ' + tz + ' ' + new Date(now).toISOString());
      n++;
    }
  }
  assert.ok(n >= 300, n + ' comparisons');
});

test('tonight\'s four off-season pools, off ESPN\'s own calendars through the real season route', async () => {
  const want = {
    nba: 'The NBA is back Sat, Oct 3 · in 20 days',
    nhl: 'The NHL is back Sat, Sep 19 · in 6 days',
    'mens-college-basketball': 'College basketball is back Mon, Nov 2 · in 50 days',
    'mens-college-hockey': 'College hockey is back Fri, Oct 2 · in 19 days'
  };
  for (const [sport, text] of Object.entries(want)) {
    const r = await serverSeasonNext({}, sport, SEP13, espn);
    assert.ok(r && r.nextAt, sport + ' has a next date');
    const line = SEASON.seasonLine(sport, r.label, r.nextAt, SEP13, PT);
    assert.equal(line.text, text, sport);
    assert.equal(line.head + ' · ' + line.count, text);
  }
  /* The same day on any phone: the calendar marks a day, never a time. */
  const nba = await serverSeasonNext({}, 'nba', SEP13, espn);
  for (const tz of ['Pacific/Honolulu', 'Asia/Tokyo', 'Europe/London']) {
    assert.match(SEASON.seasonLine('nba', nba.label, nba.nextAt, SEP13, tz).head, /Sat, Oct 3$/, tz);
  }
});

test('nothing on the calendar says so; games within two days say nothing - the day bar has them', async () => {
  assert.equal(SEASON.seasonLine('nba', 'NBA', null, SEP13, PT).text, 'No games on the calendar yet');
  const nhl = await serverSeasonNext({}, 'nhl', SEP13, espn);
  assert.equal(SEASON.seasonLine('nhl', nhl.label, nhl.nextAt, Date.UTC(2026, 8, 18, 18), PT), null, 'the day before');
  assert.equal(SEASON.seasonLine('nhl', nhl.label, nhl.nextAt, Date.UTC(2026, 8, 17, 18), PT), null, 'two days before');
  assert.equal(SEASON.seasonLine('nhl', nhl.label, nhl.nextAt, Date.UTC(2026, 8, 16, 18), PT).text, 'The NHL is back Sat, Sep 19 · in 3 days');
  /* A league the page does not name reads as the server's own label. */
  assert.equal(SEASON.seasonLine('curling', 'Curling', nhl.nextAt, SEP13, PT).text, 'Curling is back Sat, Sep 19 · in 6 days');
});

/* A DOM small enough to read. */
function mk(tag) {
  const n = {
    tagName: String(tag).toUpperCase(), children: [], attrs: {}, dataset: {}, hidden: false, isConnected: true,
    _text: '', className: '', id: '',
    classList: {
      list: () => (n.className ? n.className.split(/\s+/).filter(Boolean) : []),
      add(c) { const l = n.classList.list(); if (!l.includes(c)) l.push(c); n.className = l.join(' '); },
      contains: (c) => n.classList.list().includes(c)
    },
    get textContent() { return n._text + n.children.map((c) => c.textContent).join(''); },
    set textContent(v) { n._text = v == null ? '' : String(v); n.children = []; },
    appendChild(c) { n.children.push(c); return c; },
    setAttribute(k, v) { n.attrs[k] = String(v); },
    getAttribute(k) { return n.attrs[k]; }
  };
  return n;
}
const walk = (n, out = []) => { out.push(n); for (const c of n.children) walk(c, out); return out; };
const byClass = (root, c) => walk(root).filter((x) => x.classList && x.classList.contains(c));

test('fillSeason: the block shows the sentence as a status; a sport with no calendar leaves it hidden', async () => {
  const head = mk('head');
  globalThis.document = {
    head, createElement: mk, createTextNode: (s) => Object.assign(mk('#text'), { _text: String(s) }),
    getElementById: (id) => walk(head).find((x) => x.id === id) || null
  };
  const calls = [];
  /* The Worker's route, answered by the real seasonNext at the fixed night. */
  globalThis.window = {
    agApiFetch: async (url) => {
      calls.push(String(url));
      const sport = new URL(String(url), 'https://anygiven.app').searchParams.get('sport');
      const r = await serverSeasonNext({}, sport, SEP13, espn);
      return r ? new Response(JSON.stringify(r)) : new Response(JSON.stringify({ error: 'not_a_day_sport' }), { status: 404 });
    }
  };
  try {
    const box = mk('div');
    box.hidden = true;
    const said = await SEASON.fillSeason(box, 'nba', SEP13);
    assert.deepEqual(calls, ['/api/season/next?sport=nba']);
    assert.equal(box.hidden, false);
    assert.equal(box.getAttribute('role'), 'status');
    assert.ok(box.classList.contains('ag-season'));
    assert.match(said, /^The NBA is back Sat, Oct 3 · in 20 days$/);
    assert.equal(byClass(box, 'ag-season-h')[0].textContent, 'The NBA is back Sat, Oct 3 · in 20 days');
    assert.equal(byClass(box, 'ag-season-n')[0].textContent, 'in 20 days');
    assert.equal(walk(head).filter((x) => x.id === 'ag-season-css').length, 1, 'the style, once');
    await SEASON.fillSeason(mk('div'), 'nhl', SEP13);
    assert.equal(walk(head).filter((x) => x.id === 'ag-season-css').length, 1, 'still once');

    const nfl = mk('div');
    nfl.hidden = true;
    assert.equal(await SEASON.fillSeason(nfl, 'nfl', SEP13), null, 'football is refused by the route');
    assert.equal(nfl.hidden, true);
    assert.equal(nfl.children.length, 0);
  } finally {
    delete globalThis.window;
    delete globalThis.document;
  }
});

test('the three pages a day sport opens on load the block the one safe way', () => {
  const P2 = read('../public/screens/p2-slate.screen.js');
  const P6 = read('../public/screens/p6-allgames.screen.js');
  const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
  for (const [name, src] of [['p2', P2], ['p6', P6]]) {
    /* Never an import line - the p2 tests install every imported name by hand. */
    assert.doesNotMatch(src, /^import[^\n]*season\.js/m, name);
    assert.match(code(src), /import\('\/components\/season\.js'\)\.then\(\(m\) => m\.fillSeason\(/, name);
  }
  const c2 = code(P2);
  /* #/pool: under the Start / Join pair, on the empty day. */
  assert.match(c2, /root\.appendChild\(startJoinCard\(data\.sport\)\);\s*if \(bs === 'empty'\) \{\s*root\.appendChild\(seasonSlot\(data\.sport\)\);/);
  /* A day sport's group slate, on the empty day. */
  assert.match(c2, /if \(data\.day && DAY_POOL_SPORTS\.includes\(data\.sport\)\) root\.appendChild\(seasonSlot\(data\.sport\)\);/);
  /* All games, a day sport only. */
  assert.match(code(P6), /if \(isDaySport\(d\.sport\)\) \{\s*const season = el\('div', 'ag-season'\);\s*season\.hidden = true;/);
});

/* ------------------------------------------------------------ Home: Coming up */

const HOME_SRC = read('../public/screens/live-game.screen.js');
function lift(name) {
  const m = new RegExp('\\n((?:async )?function ' + name + '\\(|const ' + name + ' = )').exec(HOME_SRC);
  assert.ok(m, name + ' is declared at the top level');
  const start = m.index + 1;
  const end = HOME_SRC.slice(start).search(/\n(\}|\};|\];)\n/);
  return HOME_SRC.slice(start, HOME_SRC.indexOf('\n', start + end + 1));
}
const PIECES = ['el', 'homeComingUp', 'homeComingPaint', 'homeComingDate', 'homeComingRefresh', 'homeComingWatch'];
function loadHome(doc, timers) {
  const deps = { S: {}, document: doc, upcomingOn, upcomingAt, upcomingCountdown: countdownText,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; } };
  const names = Object.keys(deps);
  return new Function(...names, PIECES.map(lift).join('\n\n') + '\nreturn { ' + PIECES.join(', ') + ' };')(...names.map((k) => deps[k]));
}

test('Home, Sports: Coming up is a list of the real UPCOMING, soonest first - the countdown over the day, or when it is expected', () => {
  assert.ok(HOME_SRC.includes("import { upcomingOn, upcomingAt, countdownText as upcomingCountdown } from '/src/lib/upcoming.js';"),
    'the lib the Worker uses, not a copy - renamed, as the screen has a countdownText of its own (the kickoff clock)');
  const H = loadHome({ createElement: mk }, []);
  const sec = H.homeComingUp('sports', SEP13);
  assert.equal(sec.tagName, 'SECTION');
  const h = sec.children[0];
  assert.equal(h.tagName, 'H2');
  assert.equal(h.textContent, 'Coming up');
  assert.equal(sec.getAttribute('aria-labelledby'), h.id, 'the section is named by its heading');
  const list = sec.children[1];
  assert.equal(list.tagName, 'UL');
  const want = upcomingOn('sports', SEP13);
  assert.equal(list.children.length, want.length);
  assert.ok(list.children.every((li) => li.tagName === 'LI'), 'list items');
  assert.equal(walk(sec).filter((x) => x.tagName === 'BUTTON' || x.tagName === 'A').length, 0, 'nothing to open yet, so nothing to tap');
  list.children.forEach((li, i) => {
    const u = want[i];
    assert.equal(li.dataset.id, u.id);
    assert.equal(byClass(li, 'lg-coming-l')[0].textContent, u.label);
    if (u.date) {
      assert.equal(byClass(li, 'lg-coming-n')[0].textContent, countdownText(u, SEP13));
      const d = byClass(li, 'lg-coming-d')[0];
      assert.equal(d.tagName, 'TIME');
      assert.equal(d.getAttribute('datetime'), u.date);
      assert.equal(byClass(li, 'lg-coming-w').length, 0);
    } else {
      assert.equal(byClass(li, 'lg-coming-w')[0].textContent, u.when, u.id + ' says when it is expected');
      assert.equal(byClass(li, 'lg-coming-n').length, 0, 'no countdown without a date');
    }
  });
  const bc = list.children[0];
  assert.equal(bc.dataset.id, 'breeders-cup');
  assert.equal(byClass(bc, 'lg-coming-d')[0].textContent, 'Fri, Oct 30', 'the event\'s own day on every phone');
  if (new Date(SEP13).getTimezoneOffset() > 0) assert.equal(byClass(bc, 'lg-coming-n')[0].textContent, 'in 47 days');
  const last = list.children[list.children.length - 1];
  assert.equal(last.dataset.id, 'world-cup');
  assert.equal(last.textContent, 'FIFA World Cup2030');
  /* The app never says the NFL's name for the game. */
  assert.doesNotMatch(sec.textContent, /super\s*bowl/i);
  /* Big Game props is a ready set now (Jason, 2026-09-14: "do the big game props set next");
     while it is open its own row on the Sports tab stands in for this countdown. */
  assert.ok(!sec.textContent.includes('Big Game props'), 'the countdown steps aside for its open set');
});

test('Home, Non-sports: the awards and TV that are coming; a repaint on a later day moves every count and drops what has happened', () => {
  const H = loadHome({ createElement: mk }, []);
  const sec = H.homeComingUp('nonsports', SEP13);
  const ids = (s) => s.children[1].children.map((li) => li.dataset.id);
  assert.deepEqual(ids(sec), upcomingOn('nonsports', SEP13).map((u) => u.id));
  assert.equal(ids(sec)[0], 'golden-globes');
  const sports = H.homeComingUp('sports', SEP13);
  const OCT31 = Date.UTC(2026, 9, 31, 18);
  H.homeComingPaint(sports, OCT31);
  assert.ok(!ids(sports).includes('breeders-cup'), 'gone the day after');
  assert.equal(ids(sports)[0], 'australian-open');
  assert.equal(byClass(sports.children[1].children[0], 'lg-coming-n')[0].textContent, countdownText(UPCOMING.find((u) => u.id === 'australian-open'), OCT31));
  assert.equal(sports.children[1].children.length, upcomingOn('sports', OCT31).length, 'rows are replaced, never added to');
});

test('Home: the count is repainted when the page is looked at again and at local midnight - never on a ticking clock', () => {
  /* A test DOM with no events: nothing is watched, nothing is armed. */
  const quiet = [];
  loadHome({ createElement: mk }, quiet).homeComingUp('sports', SEP13);
  assert.equal(quiet.length, 0);

  const listeners = {};
  const sections = [];
  const doc = {
    createElement: mk, visibilityState: 'visible',
    addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); },
    querySelectorAll: (sel) => (sel === '.lg-coming' ? sections : [])
  };
  const timers = [];
  const H = loadHome(doc, timers);
  sections.push(H.homeComingUp('sports', SEP13), H.homeComingUp('nonsports', SEP13));
  assert.equal((listeners.visibilitychange || []).length, 1, 'one listener for the page, however many sections');
  assert.equal(timers.length, 1, 'one timer');
  assert.ok(timers[0].ms > 0 && timers[0].ms <= 86400000 + 1000, 'the next local midnight, not a tick: ' + timers[0].ms);
  /* Looking again repaints both sections for today. */
  for (const s of sections) s.children[1].textContent = '';
  listeners.visibilitychange[0]();
  for (const s of sections) assert.equal(s.children[1].children.length, upcomingOn(s.dataset.tab, Date.now()).length);
  /* Midnight repaints, and arms the next midnight. */
  timers[0].fn();
  assert.equal(timers.length, 2);
  assert.ok(timers[1].ms > 0 && timers[1].ms <= 86400000 + 1000);
  /* No per-second loop anywhere in the Home code. */
  assert.doesNotMatch(PIECES.map(lift).join('\n'), /setInterval/);
});
