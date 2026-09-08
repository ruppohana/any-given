/* P6 - CREATE AND COMMISSION A POOL.
 *
 * POOL-SCREENS P6: "One button creates a pool. Everything else on this screen is
 * a switch a commissioner throws once and forgets."
 *
 * 🔴 THIS SCREEN HAS NO COMP ON DISK AND WAS BUILT ANYWAY.
 *
 * It returned COULD NOT CLOSE at B0 and Jason said build it. The bar named in the
 * dispatch is reference/officepool-teardown/README.md - a MEASURED TEARDOWN, in
 * prose, of a live NCAA pick'em's Create New Pool dialog. It is not a picture.
 * The three create-dialog captures it describes - OP-create-pool-type-five-options,
 * OP-create-pool-league-five-leagues, OP-create-pool-deadline-ten-options - are
 * gitignored and are NOT on this disk; the only two screens present in that folder
 * are the marketing home and the signed-out cold entry. So every layout decision
 * below is named as a choice in the return rather than claimed as a close.
 *
 * WHAT THE README ACTUALLY SETTLES, and all of it is used:
 *
 *  1. THEIR ORDER IS Name -> Pool Type (five) -> League (five) -> Deadline Policy
 *     (TEN). Four decisions, thirty-odd options, and the FIRST one they ask for is
 *     the name. OURS INVERTS THAT: scope is above the name, because scope is the
 *     only choice on this screen that changes what the pool IS. A name is a label.
 *  2. TEN DEADLINE POLICIES IS THE COUNTER-EXAMPLE, not a model. "Ten commissioner
 *     decisions is ten chances to configure a pool wrong." Ours is one rule, stated
 *     as a fact and not offered as a control: every pick locks at its own kickoff.
 *  3. `$0 Prize Pool` IS A FIRST-CLASS STAT TILE ON THEIR DASHBOARD. "This is the
 *     product Any Given is defined against, in one tile." So this screen says out
 *     loud that there is no entry, no pot and nothing for sale - the same move S2
 *     makes against the date-of-birth field.
 *  4. `Survivor` IS ONE OF THEIR FIVE POOL TYPES - lose once, you are out.
 *     Elimination is settled against here, so there is no pool-type control at all.
 *  5. "How this pool is scored - Straight up" AS A ONE-LINE BANNER on their pick
 *     screen. Taken: the scoring rule is a sentence, not a screen and not a menu.
 *  6. THE COUNT IS 131, NOT 60. Measured in their product, week 2, 2026-09-08.
 *     Every vault document said sixty. The scope rows are priced against 131.
 *
 * 🟢 THE SCOPE SELECTOR IS THE MOST CONSEQUENTIAL CONTROL ON THIS SCREEN AND IT
 * SITS ABOVE EVERYTHING, NAME INCLUDED. DESIGN-BRIEF 3.6. It is what makes a
 * 138-team sport poolable: 131 games is unmanageable, eight games in your own
 * conference is the pool people already run by hand for the NFL.
 *
 * 🔴 SCOPE IS THE POOL'S, NEVER A PER-USER FILTER. Everybody picks the same games
 * or the standings mean nothing. Density is the viewer's; scope is the pool's.
 * That distinction is stated on screen, because it is the one a commissioner will
 * otherwise try to solve with a filter.
 *
 * 🔴 A RANKING SCOPE NAMES ITS SOURCE ON SCREEN. Top 25 is the AP poll early and
 * the CFP poll from November and THEY ARE DIFFERENT LISTS. A slate that silently
 * changes definition mid-season is a bug nobody can report, so the source is a
 * control, it is required, and it is repeated in the summary line.
 *
 * TYPES: browser JS, no build step, so src/lib/types.ts cannot be imported and is
 * honored by name only - Pool, Scope, RankingSource, SlateGame, TeamIdentity. This
 * file re-declares none of them. Everything it consumes that has no type in that
 * file - the member list, the invite URL - is a STUB and is named as one.
 */
import { teamChip } from '/components/team-chip.js';
import { stateBlock, STATES_CSS } from '/components/states.js';
import { TEAM_CHIP_CSS } from '/components/team-chip.js';
import { kickoff } from '/components/fmt.js';

export const id = 'p6-create';
export const title = 'Create and commission a pool';

/* 🔴 A README, NOT A COMP. Named by filename in the dispatch, present on disk,
 * and it is a measured teardown rather than a screenshot. Declared here so the
 * preview index does not report this screen as undispatched - and the distinction
 * is the first line of the COULD NOT CLOSE. */
export const bar = 'reference/officepool-teardown/README.md';

/* Every state is a route. `create` is pre-create; `created` is the pool with zero
 * members, where the invite IS the screen; `locked` is week 1 having kicked. */
export const states = ['create', 'created', 'active', 'locked', 'loading', 'offline', 'error'];

/* ------------------------------------------------------------------ the scopes */

/* DESIGN-BRIEF 3.6's own table, smallest to largest, with its own words for who
 * each is for. THE COUNTS ARE NOT MEASURED AND SAY SO ON SCREEN - only `all` is,
 * and it is 131 from the teardown. Nothing here is a fixture and nothing here
 * invents a game. */
const SCOPES = [
  { value: 'ranked_v_ranked', label: 'Ranked vs ranked', approx: '2–5',
    who: 'One decision a week.', ranked: true },
  { value: 'conference', label: 'One conference', approx: '7–8',
    who: 'The office pool. Everybody has a dog in the fight.', needsArg: 'conference' },
  { value: 'top25', label: 'Top 25', approx: '20',
    who: 'Any game with a ranked team in it. Re-composes itself every week.', ranked: true },
  { value: 'handpick', label: 'Your hand-pick', approx: null,
    who: 'The classic office pool, and the escape hatch.', needsArg: 'games' },
  { value: 'all', label: 'All games', approx: null, measured: 131,
    who: 'It exists. It is not the default.' }
];

/* Measured in a live NCAA Football pool, week 2 of this season, 2026-09-08. Every
 * document in this project said sixty; sixty is the FBS slice. */
const WEEK_GAMES = 131;

const SOURCES = [
  { value: 'ap', label: 'AP poll', note: 'The writers. Runs all season.' },
  { value: 'cfp', label: 'CFP poll', note: 'The committee. Starts in November.' }
];

/* --------------------------------------------------------------- preview data */

export async function previewData(fixtures, state) {
  const teams = fixtures.teams.teams;

  /* THE THREE REAL CAPTURED GAMES, read off the fixtures, sorted by their real
   * kickoff. They are what the hand-pick chooser offers, and they are the only
   * games in this repo. A hand-pick list of 131 invented rows is fixtures/_make.py
   * again, so the chooser shows three and says so. */
  const docs = await Promise.all(fixtures.games.map(function (n) { return fixtures.load(n); }));
  const games = docs.map(function (d) {
    const c = d.header.competitions[0];
    const home = c.competitors.find(function (x) { return x.homeAway === 'home'; });
    const away = c.competitors.find(function (x) { return x.homeAway === 'away'; });
    return {
      id: d.header.id,
      week: d.header.week,
      kickoffUtc: Date.parse(c.date),
      home: teams[home.team.id] || null,
      away: teams[away.team.id] || null
    };
  }).sort(function (a, b) { return a.kickoffUtc - b.kickoffUtc; });

  /* 🔴 THE FIRST KICKOFF OF WEEK 1 IS REAL. It is the minimum kickoff across the
   * three captures, and it is the moment scope locks - DESIGN-BRIEF 16.4. It is
   * read, never chosen. */
  const firstKickoff = games.length ? games[0].kickoffUtc : null;

  /* 🔴 STUB - and the whole object is one. There is no pool fixture, no member
   * fixture and no invite fixture in fixtures/, and there cannot be: a pool is
   * typed in by a person. The shape is `Pool` in src/lib/types.ts, honored by
   * name. `members` and `inviteBase` have no type in that file at all. */
  const pool = {
    id: 'TQ7RXK',              // the invite code. URL-safe, 6 chars, no vowels
    name: 'Sunday Group Text',
    commissionerId: 'me',
    scope: 'top25',
    scopeArg: null,
    rankingSource: 'ap',
    ats: false,
    season: 2026,
    scopeLockedAt: state === 'locked' ? firstKickoff : null,
    memberCount: state === 'created' ? 0 : state === 'active' || state === 'locked' ? 7 : 0
  };

  const members = (state === 'active' || state === 'locked')
    ? [
        { id: 'me', displayName: 'You', commissioner: true, joinedWeek: 1 },
        { id: 'm2', displayName: 'Dre', commissioner: false, joinedWeek: 1 },
        { id: 'm3', displayName: 'Marcus T.', commissioner: false, joinedWeek: 1 },
        { id: 'm4', displayName: 'Priya', commissioner: false, joinedWeek: 1 },
        { id: 'm5', displayName: 'Kenny', commissioner: false, joinedWeek: 1 },
        { id: 'm6', displayName: 'Sam R.', commissioner: false, joinedWeek: 2 },
        { id: 'm7', displayName: 'Bird', commissioner: false, joinedWeek: 2 }
      ]
    : [];

  return {
    pool: pool,
    members: members,
    games: games,
    firstKickoff: firstKickoff,
    weekGames: WEEK_GAMES,
    /* 🔴 STUB. No conference is in fixtures/teams.json - the file is id, abbrev,
     * name, short, primary, secondary and nothing else. Inventing a conference
     * list is a COULD NOT CLOSE, not a fill-in, so the chooser renders the
     * defined absence. */
    conferences: null,
    /* 🔴 STUB. The origin a pool link is served from is not decided anywhere in
     * the vault. It is data on the screen, never a fetch. */
    inviteBase: 'https://anygiven.app/j/',
    lastSync: Date.now() - 38000,
    prefill: state === 'error' ? 'Sunday Group Text' : ''
  };
}

/* ------------------------------------------------------------------- helpers */

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function card(kicker, titleText, noteText) {
  const c = el('section', 'card p6-card');
  if (kicker) c.appendChild(el('p', 'p6-kicker', kicker));
  if (titleText) c.appendChild(el('h2', 'p6-h', titleText));
  if (noteText) c.appendChild(el('p', 'p6-note', noteText));
  return c;
}

function scopeByValue(v) {
  return SCOPES.filter(function (s) { return s.value === v; })[0] || SCOPES[2];
}

/** "Top 25 · AP poll" - the source is part of the name of a ranking scope, so it
 *  travels with it everywhere the scope is written down. */
function scopeLabel(pool) {
  const s = scopeByValue(pool.scope);
  if (s.ranked && pool.rankingSource) {
    const src = SOURCES.filter(function (x) { return x.value === pool.rankingSource; })[0];
    return s.label + ' · ' + (src ? src.label : pool.rankingSource);
  }
  return s.label;
}

/** What the choice LEAVES, against a measured 131. An approximation says so. */
function consequence(scope, chosenCount) {
  const s = scopeByValue(scope);
  /* "131 of 131 games" is a sentence that says the same thing twice. */
  if (s.measured) return s.measured + ' games';
  if (s.value === 'handpick') {
    return (chosenCount || 0) + ' of ' + WEEK_GAMES + ' games';
  }
  return 'about ' + s.approx + ' of ' + WEEK_GAMES + ' games';
}

/** Copy in one tap. Both the link and the code get one, per POOL-SCREENS P6:
 *  "Invite by link or code, both, on the same screen, both copyable in one tap."
 *  The clipboard can be refused - by an insecure origin, by a permission, by an
 *  older browser - so the failure has a written answer rather than a silent one. */
function copyBtn(value, cls) {
  const b = el('button', cls || 'p6-copy', 'Copy');
  b.type = 'button';
  b.addEventListener('click', function () {
    const done = function (ok) {
      b.textContent = ok ? 'Copied' : 'Press and hold';
      b.dataset.done = ok ? 'true' : 'false';
      setTimeout(function () { b.textContent = 'Copy'; delete b.dataset.done; }, 2200);
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(value).then(function () { done(true); }, function () { done(false); });
      } else { done(false); }
    } catch (e) { done(false); }
  });
  return b;
}

/** A switch. Same shape S2 uses - one 44px control, role=switch, hairline knob,
 *  no shadow. `locked` renders it disabled WITH THE REASON, never withheld. */
function toggle(labelText, on, noteText, opts, onChange) {
  opts = opts || {};
  const row = el('div', 'p6-switch-row');
  const txt = el('div', 'p6-switch-text');
  txt.appendChild(el('span', 'p6-switch-label', labelText));
  if (noteText) txt.appendChild(el('span', 'p6-note p6-switch-note', noteText));
  const b = el('button', 'p6-switch');
  b.type = 'button';
  b.setAttribute('role', 'switch');
  b.setAttribute('aria-checked', String(!!on));
  b.setAttribute('aria-label', labelText);
  b.appendChild(el('span', 'p6-knob'));
  if (opts.disabled) { b.disabled = true; b.setAttribute('aria-disabled', 'true'); }
  b.addEventListener('click', function () {
    if (b.disabled) return;
    const next = b.getAttribute('aria-checked') !== 'true';
    b.setAttribute('aria-checked', String(next));
    if (onChange) onChange(next);
  });
  row.appendChild(txt);
  row.appendChild(b);
  return row;
}

/** DESTRUCTIVE ACTIONS GET A CONFIRM, and it is inline rather than a dialog: two
 *  44px targets on the row itself. POOL-SCREENS names removing a member and
 *  closing a pool as "the two actions most likely to be tapped by accident on a
 *  settings list", so the confirm has to be where the accident happens. */
function destructive(label, question, confirmLabel, onConfirm) {
  const wrap = el('div', 'p6-danger-wrap');
  const trigger = el('button', 'p6-danger', label);
  trigger.type = 'button';
  const ask = el('div', 'p6-confirm');
  ask.hidden = true;
  ask.appendChild(el('p', 'p6-confirm-q', question));
  const row = el('div', 'p6-confirm-row');
  const yes = el('button', 'p6-danger p6-confirm-yes', confirmLabel);
  yes.type = 'button';
  const no = el('button', 'p6-confirm-no', 'Keep it');
  no.type = 'button';
  no.addEventListener('click', function () {
    ask.hidden = true; trigger.hidden = false; delete wrap.dataset.open;
  });
  yes.addEventListener('click', function () { if (onConfirm) onConfirm(); });
  row.appendChild(no);
  row.appendChild(yes);
  ask.appendChild(row);
  /* 🔴 THE CONFIRM TAKES THE WHOLE ROW. Found at 393px and nowhere else: opened
   * inside the member row's right-hand column it squeezed a question and two 44px
   * buttons into 180px and wrapped "Dre / Joined week 1" onto three lines. A
   * confirm that deforms the thing it is asking about is a confirm nobody reads. */
  trigger.addEventListener('click', function () {
    trigger.hidden = true; ask.hidden = false; wrap.dataset.open = 'true';
  });
  wrap.appendChild(trigger);
  wrap.appendChild(ask);
  return wrap;
}

/* ---------------------------------------------------------------- the sections */

/** 🟢 THE SCOPE CARD. First on the screen in every editable state, above the name.
 *
 *  It is one radiogroup, five rows, each row 44px and carrying its own count, and
 *  the count is the point: the reason to choose one is what it LEAVES. Office Pool
 *  ships a cap on the number of games instead, which answers "how many" and can
 *  never answer "which" - a cap of 20 out of 131 is 20 arbitrary games, Top 25 is
 *  20 games everybody in the room has an opinion about. */
function scopeSection(data, state) {
  const pool = data.pool;
  const locked = state === 'locked';
  /* The intro sells the choice while there is a choice. Once it is locked the same
   * sentence reads as an advertisement for something you cannot have, so the card
   * explains the lock instead - seen at 393px on the locked route. */
  const c = card('The slate', 'Which games are in this pool',
    locked
      ? 'This is the slate everybody in the pool picks from, and it is the same one it ' +
        'was in week 1 — which is the only reason the season table means anything.'
      : 'The one choice that changes what this pool is. It belongs to the pool, not to ' +
        'the people in it - everybody picks the same games or the standings mean nothing.');

  const summary = el('p', 'p6-summary num');
  const group = el('div', 'p6-scopes');
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', 'Which games are in this pool');

  /* The dependent controls. Each is drawn once and shown for its own scope, so
   * choosing a scope never reflows the card into a different shape. */
  const sourceBox = el('div', 'p6-sub');
  const confBox = el('div', 'p6-sub');
  const pickBox = el('div', 'p6-sub');
  const chosen = {};   // handpick: gameId -> true

  let current = pool.scope;
  let source = pool.rankingSource || 'ap';

  function paint() {
    const s = scopeByValue(current);
    sourceBox.hidden = !s.ranked;
    confBox.hidden = s.needsArg !== 'conference';
    pickBox.hidden = s.needsArg !== 'games';
    const n = Object.keys(chosen).length;
    summary.textContent = scopeLabel({ scope: current, rankingSource: source })
      + ' · ' + consequence(current, n);
    /* The one dependency that can block Create, and it is shown as a reason
     * rather than as a grayed-out button with no explanation. */
    const blocked = (s.needsArg === 'conference' && !data.conferences)
      || (s.needsArg === 'games' && n === 0);
    c.dataset.blocked = blocked ? 'true' : 'false';
    const cta = document.querySelector('.p6-primary-create');
    if (cta) {
      cta.disabled = !!blocked;
      const why = document.querySelector('.p6-cta-why');
      if (why) {
        why.textContent = !blocked ? '' : s.needsArg === 'conference'
          ? 'Pick a conference to create this pool.'
          : 'Pick at least one game to create this pool.';
        why.hidden = !blocked;
      }
    }
  }

  if (locked) {
    /* LOCKED READS AS A FACT, NOT AS FIVE DEAD CONTROLS. Rendering the other four
     * disabled would show a commissioner four things they cannot have on the
     * screen they came to fix something on. */
    const box = el('div', 'p6-locked-scope');
    box.appendChild(el('p', 'p6-locked-value', scopeLabel(pool)));
    box.appendChild(el('p', 'p6-summary num', consequence(pool.scope, 0)));
    c.appendChild(box);
    c.appendChild(el('p', 'p6-lock-line',
      'Locked at ' + (data.firstKickoff ? kickoff(data.firstKickoff) : 'the first kickoff') +
      ' — the first kickoff of week 1. It holds for the rest of the season, because a ' +
      'season table is only comparable if the rules held all season.'));
    return c;
  }

  SCOPES.forEach(function (s) {
    const b = el('button', 'p6-scope');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(s.value === current));
    b.dataset.scope = s.value;

    const head = el('div', 'p6-scope-head');
    const lab = el('span', 'p6-scope-label', s.label);
    head.appendChild(lab);
    /* The default badge rides WITH THE LABEL, not under the description. Drawn as
     * its own block under the row it read as a stray uppercase word floating in
     * the card - visible in one second at 393px, invisible to every test here. */
    if (s.value === 'top25') lab.appendChild(el('span', 'p6-default', 'Default'));
    const count = el('span', 'p6-scope-count num',
      s.measured ? String(s.measured) : s.approx ? '~' + s.approx : 'you choose');
    head.appendChild(count);
    b.appendChild(head);
    b.appendChild(el('span', 'p6-scope-who', s.who));

    b.addEventListener('click', function () {
      current = s.value;
      Array.prototype.forEach.call(group.children, function (n) {
        n.setAttribute('aria-checked', String(n === b));
      });
      paint();
    });
    group.appendChild(b);
  });
  c.appendChild(group);

  c.appendChild(el('p', 'p6-note p6-count-note',
    'A college week is ' + WEEK_GAMES + ' games — measured in a live college pool, ' +
    'week 2 of this season, on 2026-09-08. The other counts are approximate; your ' +
    'week’s exact number appears when its slate publishes.'));

  /* 🔴 THE NAMED SOURCE. Required for any ranking scope, and it is a control
   * rather than a note because the two lists genuinely differ. */
  sourceBox.appendChild(el('h3', 'p6-sub-h', 'Which Top 25'));
  const seg = el('div', 'p6-seg');
  seg.setAttribute('role', 'radiogroup');
  seg.setAttribute('aria-label', 'Ranking source');
  SOURCES.forEach(function (o) {
    const b = el('button', 'p6-seg-b', o.label);
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(o.value === source));
    b.addEventListener('click', function () {
      source = o.value;
      Array.prototype.forEach.call(seg.children, function (n) {
        n.setAttribute('aria-checked', String(n === b));
      });
      paint();
    });
    seg.appendChild(b);
  });
  sourceBox.appendChild(seg);
  sourceBox.appendChild(el('p', 'p6-note',
    'The AP poll and the CFP poll are different lists, and the CFP one does not ' +
    'exist until November. Whichever you name here is the one this pool means by ' +
    'ranked, all season, and it is printed on the slate.'));
  c.appendChild(sourceBox);

  /* THE CONFERENCE CHOOSER, AND ITS DEFINED ABSENCE. fixtures/teams.json carries
   * id, abbrev, name, short, primary and secondary - there is no conference in it
   * and there is no conference fixture anywhere in this repo. Writing a list of
   * conferences here would be a fixture this file invented, which is the one
   * failure the contract names by name. So the control exists, the data does not,
   * and the screen says which. */
  confBox.appendChild(el('h3', 'p6-sub-h', 'Which conference'));
  if (data.conferences && data.conferences.length) {
    const list = el('div', 'p6-conf-list');
    data.conferences.forEach(function (cf) {
      const b = el('button', 'p6-conf', cf.name);
      b.type = 'button';
      list.appendChild(b);
    });
    confBox.appendChild(list);
  } else {
    confBox.appendChild(stateBlock('empty', {
      title: 'No conference list in this build',
      body: 'The team file carries a name and two colors for all 760 schools and no ' +
            'conference for any of them. This chooser fills itself from the feed; ' +
            'until then the scope cannot be created.'
    }));
  }
  c.appendChild(confBox);

  /* THE HAND-PICK CHOOSER - the three real captured games, and it says that is
   * three of 131 rather than pretending to be a week. */
  pickBox.appendChild(el('h3', 'p6-sub-h', 'Pick the games'));
  const glist = el('div', 'p6-games');
  data.games.forEach(function (g) {
    const b = el('button', 'p6-game');
    b.type = 'button';
    b.setAttribute('aria-pressed', 'false');
    const teamsBox = el('div', 'p6-game-teams');
    /* adjacentTo is what separates Ball State ba0c2f from Ohio State ba0c2f -
     * an exact primary collision that is in the real captures, not a hypothesis. */
    teamsBox.appendChild(teamChip(g.away, { size: 20, adjacentTo: g.home }));
    teamsBox.appendChild(el('span', 'p6-at', 'at'));
    teamsBox.appendChild(teamChip(g.home, { size: 20, adjacentTo: g.away }));
    b.appendChild(teamsBox);
    b.appendChild(el('span', 'p6-game-when num', kickoff(g.kickoffUtc)));
    b.addEventListener('click', function () {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on));
      if (on) chosen[g.id] = true; else delete chosen[g.id];
      paint();
    });
    glist.appendChild(b);
  });
  pickBox.appendChild(glist);
  pickBox.appendChild(el('p', 'p6-note',
    data.games.length + ' games are captured in this build, of ' + WEEK_GAMES +
    ' in a real college week. The rest arrive with the week’s slate.'));
  c.appendChild(pickBox);

  c.appendChild(summary);

  /* THE LOCK RULE, in the editable states. It is the escape hatch and the deadline
   * at once, and it is one sentence because it is one rule. */
  c.appendChild(el('p', 'p6-lock-line',
    state === 'create'
      ? 'You can change this until the first kickoff of week 1. After that it holds ' +
        'for the season, so a table stays comparable.'
      : 'Editable until the first kickoff of week 1 — which is the same moment your ' +
        'first pick locks. Change it now if your members wanted something else.'));

  paint();
  return c;
}

/** THE NAME. One field, and it is the only required thing on the screen. */
function nameSection(data) {
  const c = card('The pool', 'Name it', null);
  const lab = el('label', 'p6-label', 'Pool name');
  lab.setAttribute('for', 'p6-name');
  const input = el('input', 'p6-input');
  input.id = 'p6-name';
  input.type = 'text';
  input.maxLength = 40;
  input.value = data.prefill || '';
  input.placeholder = 'Sunday Group Text';
  input.setAttribute('enterkeyhint', 'done');
  input.setAttribute('autocomplete', 'off');
  c.appendChild(lab);
  c.appendChild(input);
  c.appendChild(el('p', 'p6-note',
    'The only thing this screen needs from you. It is the first thing anybody sees ' +
    'when they open your invite.'));
  return c;
}

/** THE SWITCHES A COMMISSIONER THROWS ONCE AND FORGETS. Three of them, and every
 *  one has a default that works, so none of them can block Create. */
function switchSection(data, state) {
  const locked = state === 'locked';
  const c = card('Once and forget', 'The rest of it', null);

  const banner = el('p', 'p6-scoring');
  function paintBanner(ats) {
    banner.textContent = ats
      ? 'How this pool is scored · Against the spread — one point a game'
      : 'How this pool is scored · Straight up — one point a game';
  }
  paintBanner(data.pool.ats);
  c.appendChild(banner);

  c.appendChild(toggle(
    'Against the spread',
    data.pool.ats,
    locked
      ? 'Locked with the scope. Changing how a game scores mid-season makes the season table meaningless.'
      : 'Off, you pick the winner. On, you pick against the number — and a spread appears as a plain number on each game. No odds anywhere, ever.',
    { disabled: locked },
    function (on) { paintBanner(on); }
  ));

  c.appendChild(toggle(
    'Late joiners back-fill earlier weeks',
    false,
    'Off, somebody who joins in week 6 starts in week 6. On, they can pick weeks already played, which nobody who was there can ever beat.',
    {}, null
  ));

  c.appendChild(toggle(
    'Show weeks that have not opened yet',
    true,
    'Off, the pool only ever shows the week in front of you.',
    {}, null
  ));

  /* THE FOUR THINGS THAT ARE NOT CONTROLS, and the reason this screen is short.
   * Office Pool ships TEN deadline policies and five pool types, one of which is
   * Survivor. Each of those is a chance to configure a pool wrong. */
  const fixed = el('ul', 'p6-fixed');
  [
    ['Every pick locks at its own kickoff.', 'One rule. There is no deadline menu.'],
    ['Ties break on one number.', 'Predicted combined points in the week’s named game, collected with your picks.'],
    ['Nobody is ever eliminated.', 'There is no survivor mode. A bad week costs you a week.'],
    ['It is free.', 'No entry, no pot, no prize pool, and nothing on any screen of this app is for sale.']
  ].forEach(function (f) {
    const li = el('li');
    li.appendChild(el('b', null, f[0]));
    li.appendChild(document.createTextNode(' ' + f[1]));
    fixed.appendChild(li);
  });
  c.appendChild(fixed);
  return c;
}

/** 🔴 THE INVITE. Link AND code, both, both copyable in one tap. The invite link
 *  is the entire distribution strategy: a pool exists because a commissioner sent
 *  a link to a group text. On the created state it is the first thing on screen
 *  and it is the only filled control, because there is nothing else to do yet. */
function inviteSection(data, opts) {
  opts = opts || {};
  const url = data.inviteBase + data.pool.id;
  const c = card(opts.kicker || 'Invite', opts.title || 'Get them in',
    'Send the link. It opens straight onto the slate — no account, no password, ' +
    'nothing to install before they can see what they are joining.');

  const linkRow = el('div', 'p6-copyrow');
  const linkVal = el('div', 'p6-link num', url);
  linkRow.appendChild(linkVal);
  linkRow.appendChild(copyBtn(url, opts.primary ? 'p6-copy p6-primary' : 'p6-copy'));
  c.appendChild(linkRow);

  const codeRow = el('div', 'p6-copyrow');
  const codeVal = el('div', 'p6-code num', data.pool.id);
  codeRow.appendChild(codeVal);
  codeRow.appendChild(copyBtn(data.pool.id));
  c.appendChild(codeRow);

  c.appendChild(el('p', 'p6-note',
    'The code is for anybody who cannot open a link — read it down a phone and ' +
    'they type six characters. Same pool either way.'));
  return c;
}

/** THE MEMBERS, and removing one is destructive. */
function memberSection(data) {
  const c = card('Members', data.members.length + ' in this pool', null);
  if (!data.members.length) {
    c.appendChild(stateBlock('empty', {
      title: 'Nobody has joined yet',
      body: 'That is what the link above is for. The pool works the moment one other ' +
            'person is in it.'
    }));
    return c;
  }
  const list = el('div', 'p6-members');
  data.members.forEach(function (m) {
    const row = el('div', 'p6-member');
    const who = el('div', 'p6-member-who');
    who.appendChild(el('span', 'p6-member-name', m.displayName));
    who.appendChild(el('span', 'p6-member-meta num',
      m.commissioner ? 'Commissioner' : 'Joined week ' + m.joinedWeek));
    row.appendChild(who);
    if (!m.commissioner) {
      row.appendChild(destructive('Remove',
        'Remove ' + m.displayName + ' from this pool? Their picks and their points go with them.',
        'Remove ' + m.displayName,
        function () { row.remove(); }));
    }
    list.appendChild(row);
  });
  c.appendChild(list);
  return c;
}

function closeSection() {
  const c = card('Danger', 'Close this pool', null);
  c.appendChild(el('p', 'p6-note',
    'The table stops, the slate stops, and everybody in it keeps being able to read ' +
    'what already happened. Nothing is deleted.'));
  c.appendChild(destructive('Close this pool',
    'Close this pool for everybody? Picking stops immediately and it cannot be reopened this season.',
    'Close it', function () {}));
  return c;
}

/** THE ONE BUTTON. */
function createButton() {
  const wrap = el('div', 'p6-cta-wrap');
  const b = el('button', 'p6-primary p6-primary-create', 'Create pool');
  b.type = 'button';
  wrap.appendChild(b);
  const why = el('p', 'p6-cta-why');
  why.hidden = true;
  wrap.appendChild(why);
  wrap.appendChild(el('p', 'p6-note p6-cta-note',
    'Nothing else is required. Every setting above already has an answer that works, ' +
    'and the scope can change until week 1 kicks.'));
  return wrap;
}

function head(data, state) {
  const h = el('header', 'p6-head');
  if (state === 'create') {
    h.appendChild(el('h1', 'p6-title', 'Create a pool'));
    h.appendChild(el('p', 'p6-sub',
      'One button. A name is the only thing it needs.'));
    return h;
  }
  h.appendChild(el('p', 'p6-kicker', 'Commissioner'));
  h.appendChild(el('h1', 'p6-title', data.pool.name));
  const bits = [
    data.pool.memberCount === 1 ? '1 member' : data.pool.memberCount + ' members',
    scopeLabel(data.pool)
  ];
  if (state === 'locked') bits.push('Scope locked');
  h.appendChild(el('p', 'p6-sub num', bits.join(' · ')));
  return h;
}

/* -------------------------------------------------------------------- render */

export function render(root, data, state) {
  root.innerHTML = '';
  root.classList.add('scr-p6-create');

  const style = document.createElement('style');
  style.textContent = [TEAM_CHIP_CSS, STATES_CSS].join('\n');
  root.appendChild(style);

  if (state === 'loading') {
    root.appendChild(head(data, 'create'));
    root.appendChild(stateBlock('loading', { rows: 5, body: 'Getting this week’s slate…' }));
    return;
  }

  if (state === 'error') {
    root.appendChild(head(data, 'create'));
    root.appendChild(stateBlock('error', {
      title: 'The pool was not created',
      body: 'Nothing was lost. Your name and your scope are still below exactly as you ' +
            'left them — try again and it goes through.',
      action: { label: 'Try again' }
    }));
    /* THE FORM IS REDRAWN, NOT REPLACED. An error that takes the typed name with
     * it is a second failure on top of the first. */
    root.appendChild(scopeSection(data, 'create'));
    root.appendChild(nameSection(data));
    root.appendChild(switchSection(data, 'create'));
    root.appendChild(createButton());
    return;
  }

  if (state === 'offline') {
    root.appendChild(head(data, 'create'));
    root.appendChild(stateBlock('offline', {
      title: 'You are offline',
      body: 'A pool has to be created on the server, so that one waits. Everything ' +
            'you choose here is kept on this device and goes through when you are back.',
      since: data.lastSync,
      action: { label: 'Try again' }
    }));
    root.appendChild(scopeSection(data, 'create'));
    root.appendChild(nameSection(data));
    root.appendChild(switchSection(data, 'create'));
    const wrap = createButton();
    const b = wrap.querySelector('.p6-primary-create');
    b.disabled = true;
    b.textContent = 'Create pool — waiting for a connection';
    root.appendChild(wrap);
    return;
  }

  if (state === 'created') {
    /* ZERO MEMBERS: THE INVITE IS THE SCREEN. It is first, it carries the only
     * filled control, and the settings sit under it - because at this moment the
     * pool does not need another setting, it needs a second person. */
    root.appendChild(head(data, state));
    root.appendChild(inviteSection(data, { kicker: 'Next', title: 'Send this to somebody', primary: true }));
    root.appendChild(memberSection(data));
    root.appendChild(scopeSection(data, state));
    root.appendChild(switchSection(data, state));
    root.appendChild(closeSection());
    return;
  }

  if (state === 'active' || state === 'locked') {
    root.appendChild(head(data, state));
    if (state === 'locked') {
      root.appendChild(el('p', 'p6-banner',
        'Week 1 has kicked off. The scope and the scoring are fixed for the season ' +
        'now — everything else on this screen still works.'));
    }
    root.appendChild(scopeSection(data, state));
    root.appendChild(memberSection(data));
    root.appendChild(inviteSection(data, { kicker: 'Invite', title: 'Still open', primary: true }));
    root.appendChild(switchSection(data, state));
    root.appendChild(closeSection());
    return;
  }

  /* create - the default route. SCOPE IS ABOVE THE NAME. */
  root.appendChild(head(data, 'create'));
  root.appendChild(scopeSection(data, 'create'));
  root.appendChild(nameSection(data));
  root.appendChild(switchSection(data, 'create'));
  root.appendChild(createButton());
}
