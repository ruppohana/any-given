/* G3 - THE GROUP POOLS RULES. #/grules, reached from the Info tab of the group
 * section (CONTRACT-GROUPS.md §1).
 *
 * Jason, 2026-09-11: "under group pools ... it probably needs its own rules pages
 * etc. the commish should be able to kick someone out of the group as well as send
 * other invites as they see fit. they are responsible to kindness."
 *
 * THE PATTERN IS s6-rules, AND THIS PAGE MUST NEVER CONTRADICT IT. Same shape: a
 * short line under the header, an index of questions, then one card per answer,
 * each opening with the sentence that answers it. Where the two overlap - when a
 * pick locks, what a game that does not happen is worth - the sentence is the
 * same sentence, and tests/g3-group-rules.test.mjs checks both files carry it.
 *
 * 🔴 EVERY RULE HERE IS TRUE OF THE CODE AS IT STANDS, NOT OF THE BRIEF. Two
 * places the brief and the code part company, and the page follows the code:
 *
 *  1. AGAINST THE SPREAD IS THE COMMISSIONER'S OPTION, AND IT IS SCORED. Jason,
 *     2026-09-11: "the comish has the option." The commissioner switches it
 *     (src/groups.ts /api/group/settings) and /api/pool/standings scores the cover
 *     against the line the pick was made at (`pick.spread_at`, then the game's).
 *     This page used to leave the spread out because the scorer ignored it; the
 *     test that pinned that gap fired, as it was written to, and the sentence is in.
 *  2. A PUSH IS IN THE VOID LINE; A POSTPONEMENT IS NOT. A margin of exactly zero
 *     against the line counts for nobody, the same as a tie. The slate cron stores
 *     a postponed game as in progress, so if it is later played under the same id
 *     it counts - so the page promises nothing about postponements.
 *
 * 🔴 THE WORDS AND NUMBERS ARE NOT TYPED HERE. The kindness line and every limit
 * are read out of src/lib/groups.ts, the same module the server enforces them
 * from - build-static.mjs serves it to the browser as plain JavaScript. A rules
 * page that retypes "200 members" is a second copy that goes stale silently.
 *
 * THE INDEX SCROLLS WITH BUTTONS, NOT LINKS. s6-rules learned it by clicking: its
 * rows were `#void` anchors, the app routes on the hash, and the page unmounted.
 * A button has no href to get wrong.
 *
 * THE ONE LOOKUP is the current group - name, league, against the spread - done
 * in previewData through components/group.js. render() never fetches; only a tap
 * (sign in, try again) asks again, and then re-renders. If the lookup fails the
 * rules still render, because rules are not live data.
 */
import { pageHeader, HEADER_CSS } from '/components/header.js';
import { stateBlock, STATES_CSS } from '/components/states.js';
import { myGroups, pickCurrent, groupSwitcher, GROUP_CSS } from '/components/group.js';

/* 🔴 THE SOURCE OF THE KINDNESS LINE AND EVERY LIMIT. Read, never retyped. */
import { KINDNESS, LIMITS } from '/src/lib/groups.ts';

export const id = 'g3-group-rules';
export const title = 'Group rules';

/* The pattern this page follows is the app's own Rules screen, which is on disk.
 * There is no outside comp for a group-pool rules page. */
export const bar = 'public/screens/s6-rules.screen.js';

export const states = ['ready', 'signed-out', 'no-group', 'loading', 'offline', 'error'];

/* ------------------------------------------------------------------ helpers */

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function para(text) { return el('p', 'g3-p', text); }
function lead(text) { return el('p', 'g3-lead', text); }
function subHead(text) { return el('p', 'g3-sub-h', text); }

/** Two or more of anything is a list, never a paragraph. */
function bullets(items) {
  const ul = el('ul', 'g3-ul');
  items.forEach(function (t) { ul.appendChild(el('li', null, t)); });
  return ul;
}

/** A label and a figure. The right column is .num so nothing reflows. */
function kv(rows) {
  const box = el('div', 'g3-kv');
  rows.forEach(function (r) {
    const line = el('div', 'g3-kv-row');
    line.appendChild(el('span', 'g3-kv-k', r[0]));
    line.appendChild(el('span', 'g3-kv-v num', String(r[1])));
    box.appendChild(line);
  });
  return box;
}

function chevron() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 12 12');
  svg.setAttribute('width', '12');
  svg.setAttribute('height', '12');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'g3-chev');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', 'M4 2 L8 6 L4 10');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.5');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);
  return svg;
}

/** A door to another screen in the group section. A route hash, never a
 *  fragment: '#/g' and '#/gpicks' are routes the app mounts. */
function door(href, label, cls) {
  const a = el('a', cls || 'g3-door', label);
  a.href = href;
  return a;
}

/* ------------------------------------------------------------ the sections
 *
 * Ordered the way a new member meets them: getting in, picking, the score, who
 * runs it, writing to people, getting out, and the numbers. Each entry: an id, the
 * question a person arrives with, the card's heading, and a body builder.
 */
const SECTIONS = [
  { id: 'g3-how',     q: 'How do I get into a group?',          h: 'How a group works',          build: sHow },
  { id: 'g3-picking', q: 'When do my picks lock?',              h: 'Picking',                    build: sPicking },
  { id: 'g3-scoring', q: 'How is a group scored?',              h: 'Scoring and standings',      build: sScoring },
  { id: 'g3-commish', q: 'What can the commissioner do?',       h: 'The commissioner',           build: sCommish },
  { id: 'g3-email',   q: 'Who sees my email address?',          h: 'Emailing through Any Given', build: sEmail },
  { id: 'g3-leaving', q: 'What happens when someone leaves?',   h: 'Leaving',                    build: sLeaving },
  { id: 'g3-limits',  q: 'How big can a group get?',            h: 'Limits',                     build: sLimits }
];

/* ---------------------------------------------------------------- 1 HOW */

function sHow() {
  const box = document.createDocumentFragment();
  box.appendChild(lead('A group is invite only. There is no list of groups to browse.'));
  box.appendChild(bullets([
    'Whoever starts a group is its commissioner.',
    'A group plays one league, NFL or college football, chosen when it starts.',
    'You join with the code from an invite. The invite link carries the same code, ' +
      'and the code works in any case, with or without spaces.',
    'You need to be signed in with your email, with a handle, to start or join one.',
    'Inside a group everyone is known by their handle. Nobody’s email address is shown.'
  ]));
  return box;
}

/* ------------------------------------------------------------ 2 PICKING */

function sPicking() {
  const box = document.createDocumentFragment();
  /* The same sentence as s6-rules sScoring, word for word. */
  box.appendChild(lead('Every pick is editable until that game kicks off, and locks at kickoff.'));
  box.appendChild(bullets([
    'Each week, pick a side in the games you want. There is no minimum.',
    'The kickoff time is the server’s, not your phone’s, so a pick cannot slip in late.',
    'Pick the same game again before kickoff and the new pick replaces the old one.',
    'Only members can pick in a group. Picking never joins you to one.'
  ]));
  box.appendChild(subHead('Your picks belong to one group'));
  box.appendChild(para('A pick you make in one group is not a pick in any other group, ' +
    'and it is not a pick on the public slate. In two groups you can pick the same game ' +
    'two different ways.'));
  return box;
}

/* ------------------------------------------------------------ 3 SCORING */

function sScoring() {
  const box = document.createDocumentFragment();
  box.appendChild(lead('Every right pick is a point. A wrong pick scores nothing and ' +
    'takes nothing away.'));
  box.appendChild(para('Points are the only score in a group.'));

  box.appendChild(subHead('Straight up, or against the spread'));
  /* The commissioner's option (Jason, 2026-09-11). The line is the pick's own -
   * `pick.spread_at` in /api/pool/standings - see the header. */
  box.appendChild(para('Straight up is the default: a pick is right when its team wins. ' +
    'When the commissioner turns against the spread on, a pick is right when its team ' +
    'covers the spread it was picked at - the line on the game when you tapped it.'));

  box.appendChild(subHead('When a game does not count'));
  /* "No points won and none lost, for anybody who picked it" is s6-rules sVoid's
   * sentence. The postponement is left out on purpose - see the header. */
  box.appendChild(para('A game counts only once it is final and somebody won it - against ' +
    'the spread, once somebody covered. A game that is cancelled, ends level, or lands ' +
    'exactly on the spread never counts. No points won and none lost, for anybody who ' +
    'picked it.'));

  box.appendChild(subHead('The standings'));
  box.appendChild(bullets([
    'Ranked by right picks.',
    'Everyone in the group is on them from the day they join, picks or not.',
    'A group’s standings count only the picks made in that group.'
  ]));
  return box;
}

/* ------------------------------------------------------------ 4 COMMISH */

function sCommish() {
  const box = document.createDocumentFragment();
  box.appendChild(lead('Starting a group means accepting this line:'));
  /* 🔴 THE PLEDGE, READ FROM src/lib/groups.ts. The server refuses to create a
   * group without it, and returns this same constant as the refusal. */
  box.appendChild(el('blockquote', 'g3-pledge', KINDNESS));
  box.appendChild(para('The commissioner is responsible for keeping the group kind, and ' +
    'has the tools to do it:'));
  box.appendChild(bullets([
    'Rename the group, and switch against the spread on or off.',
    'Send invites, by email through Any Given or by sharing the code or link.',
    'Mute a member. They still pick and stay on the standings, but cannot send ' +
      'messages in the group. A mute can be lifted.',
    'Remove a member. Their picks in the group are deleted, and the code and the link ' +
      'no longer let them back in. The app has no way to undo it.'
  ]));
  box.appendChild(el('p', 'g3-note', 'Only the commissioner can do these, and cannot ' +
    'remove or mute themselves.'));
  return box;
}

/* -------------------------------------------------------------- 5 EMAIL */

function sEmail() {
  const box = document.createDocumentFragment();
  box.appendChild(lead('Nobody in the group. Messages and invites go out through ' +
    'Any Given, so addresses stay private.'));
  box.appendChild(bullets([
    'Any member can email the commissioner, or the whole group.',
    'The email comes from Any Given, with your handle in the subject and at the top.',
    'Each person gets their own copy, so nobody sees anyone else’s address.',
    'Replying to the email does not reach the person who wrote it. The email says to ' +
      'answer from the group page.',
    'A member the commissioner has muted cannot send.'
  ]));
  box.appendChild(el('p', 'g3-note', 'Any Given keeps a count of what was sent, for the ' +
    'daily limits. It never keeps the words.'));
  return box;
}

/* ------------------------------------------------------------ 6 LEAVING */

function sLeaving() {
  const box = document.createDocumentFragment();
  box.appendChild(lead('Anyone can leave. Your picks in that group go with you.'));
  box.appendChild(bullets([
    'You can come back later with the code, and start again with no picks.',
    'When the commissioner leaves, the group passes to its longest-standing member.',
    'When the last member leaves, the group closes. Its picks go, and its code stops working.',
    'Deleting your account does the same: a group you run passes to its longest-standing ' +
      'member, or closes if you are the only one in it.'
  ]));
  return box;
}

/* ------------------------------------------------------------- 7 LIMITS */

function sLimits() {
  const box = document.createDocumentFragment();
  box.appendChild(lead('A group holds up to ' + LIMITS.membersMax + ' members. A full ' +
    'group turns new members away until someone leaves.'));
  box.appendChild(kv([
    ['Members in a group', LIMITS.membersMax],
    ['Characters in a group name', LIMITS.nameMax],
    ['Invite addresses at a time', LIMITS.invitesPerBatch],
    ['Invite emails a group can send a day', LIMITS.invitesPerDay],
    ['Messages a member can send a day, per group', LIMITS.messagesPerDay],
    ['Characters in a message', LIMITS.messageMax]
  ]));
  box.appendChild(el('p', 'g3-note', 'A day is any 24 hours, not a calendar day. A longer ' +
    'name or message is cut to fit.'));
  return box;
}

/* -------------------------------------------------------------- the data */

/** The one lookup. Never throws - myGroups() does not. */
async function lookup(opts) {
  const r = await myGroups(opts);
  const cur = pickCurrent(r.groups);
  return {
    signedIn: !!r.signedIn,
    groups: r.groups || [],
    current: cur ? cur.id : '',
    error: r.error || null,
    noSample: true
  };
}

/**
 * `ready` is the live route: it asks who you are and which group you are in.
 * Every other state is the harness asking for that state by name, and gets no
 * group - there is no captured group fixture, and none is invented here.
 * `noSample`: nothing on this page is made up, so the shell's banner stays off.
 */
export async function previewData(fixtures, state) {
  if (state && state !== 'ready') {
    return { signedIn: state !== 'signed-out', groups: [], current: '', error: null, noSample: true };
  }
  return lookup();
}

/** Asked again from a tap - sign in, try again - and drawn over the same root. */
async function refresh(root) {
  const d = await lookup({ force: true });
  render(root, d, 'ready');
}

async function signIn(root) {
  const ok = window.agOpenSignIn ? await window.agOpenSignIn() : false;
  if (ok) await refresh(root);
}

/* ---------------------------------------------------------- the assembly */

/** Which of the states the live route is actually in. */
function viewFor(data, state) {
  if (state !== 'ready') return state;
  if (data && data.error === 'offline') return 'offline';
  if (data && data.error) return 'error';
  if (!data || !data.signedIn) return 'signed-out';
  if (!data.groups || !data.groups.length) return 'no-group';
  return 'group';
}

/** The current group: its name (a switcher with 2+), the league, and whether it
 *  picks against the spread. The only thing on the page that varies. */
function groupCard(root, data) {
  const groups = data.groups;
  const g = groups.find(function (x) { return x.id === data.current; }) || groups[0];
  const c = el('section', 'g3-group');
  c.setAttribute('aria-label', 'Your group');
  c.appendChild(el('p', 'g3-eyebrow', 'Your group'));
  c.appendChild(groupSwitcher(groups, g.id, function (id) {
    render(root, Object.assign({}, data, { current: id }), 'ready');
  }));
  c.appendChild(kv([
    ['Picks', g.ats ? 'Against the spread' : 'Straight up'],
    ['League', g.sport === 'nfl' ? 'NFL' : 'College football'],
    ['Members', g.members == null ? '–' : g.members],
    ['You', g.role === 'commissioner' ? 'Commissioner' : 'Member']
  ]));
  c.appendChild(el('p', 'g3-note', 'Everything below is the same in every group. Only ' +
    'this card changes.'));
  return c;
}

/** A small line with a way forward - signed out, or in no group yet. */
function doorLine(root, view) {
  const box = el('div', 'g3-line');
  if (view === 'signed-out') {
    box.appendChild(el('p', 'g3-line-t', 'You are not signed in. Groups need your email ' +
      'and a handle. The rules below still apply.'));
    const row = el('div', 'g3-line-row');
    const b = el('button', 'g3-signin', 'Sign in');
    b.type = 'button';
    b.addEventListener('click', function () { signIn(root); });
    row.appendChild(b);
    row.appendChild(door('#/g', 'Start or join a group', 'g3-line-door'));
    box.appendChild(row);
    return box;
  }
  box.appendChild(el('p', 'g3-line-t', 'You are not in a group yet. Start one, or join ' +
    'with a code from an invite.'));
  const row = el('div', 'g3-line-row');
  row.appendChild(door('#/g', 'Start or join a group', 'g3-line-door'));
  box.appendChild(row);
  return box;
}

/** The index. Buttons that scroll - never a link that changes the hash. */
function indexBlock() {
  const nav = el('nav', 'g3-index');
  nav.setAttribute('aria-label', 'Find an answer');
  nav.appendChild(el('p', 'g3-eyebrow', 'Find an answer'));
  SECTIONS.forEach(function (s) {
    const b = el('button', 'g3-ix');
    b.type = 'button';
    b.setAttribute('aria-controls', s.id);
    b.appendChild(el('span', 'g3-ix-q', s.q));
    b.appendChild(chevron());
    b.addEventListener('click', function () {
      const t = document.getElementById(s.id);
      if (!t) return;
      /* Clear the sticky top bar so the heading lands in view, not under it. */
      const bar = parseFloat(getComputedStyle(document.documentElement)
        .getPropertyValue('--topbar-h')) || 0;
      window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - bar - 8,
        behavior: 'smooth' });
    });
    nav.appendChild(b);
  });
  return nav;
}

function sectionCard(s) {
  const c = el('section', 'g3-sec');
  c.id = s.id;
  c.setAttribute('aria-labelledby', s.id + '-h');
  const h = el('h2', 'g3-h', s.h);
  h.id = s.id + '-h';
  c.appendChild(h);
  c.appendChild(s.build());
  return c;
}

function doors() {
  const d = el('nav', 'g3-doors');
  d.setAttribute('aria-label', 'Group pools');
  d.appendChild(door('#/g', 'Group page'));
  d.appendChild(door('#/gpicks', 'Make picks'));
  return d;
}

/* -------------------------------------------------------------------- render */

/**
 * @param {HTMLElement} root
 * @param {{signedIn:boolean, groups:Array<{id,name,sport,week,ats,members,role}>, current:string, error:string|null}} data
 * @param {string} state  one of `states`
 */
export function render(root, data, state) {
  root.innerHTML = '';
  root.classList.add('scr-g3-group-rules');

  const style = document.createElement('style');
  style.textContent = [HEADER_CSS, STATES_CSS, GROUP_CSS].join('\n');
  root.appendChild(style);

  root.appendChild(pageHeader({
    noTitle: true,
    sub: 'Every rule for group pools, in one place.'
  }));

  const view = viewFor(data, state);

  if (view === 'group') {
    root.appendChild(groupCard(root, data));
  } else if (view === 'signed-out' || view === 'no-group') {
    root.appendChild(doorLine(root, view));
  } else if (view === 'loading') {
    root.appendChild(stateBlock('loading', {
      rows: 1,
      body: 'Looking up your group. The rules below do not need it.'
    }));
  } else if (view === 'offline') {
    root.appendChild(stateBlock('offline', {
      title: 'You are offline',
      body: 'Your group’s settings are not shown. The rules below are part of the app, ' +
        'so all of them still apply.',
      action: { label: 'Try again', onClick: function () { refresh(root); } }
    }));
  } else if (view === 'error') {
    root.appendChild(stateBlock('error', {
      title: 'Your group’s settings did not load',
      body: 'That is the only thing missing. Every rule below is the same in every group.',
      action: { label: 'Try again', onClick: function () { refresh(root); } }
    }));
  }

  /* The rules, in every state. They are not live data. */
  root.appendChild(indexBlock());
  SECTIONS.forEach(function (s) { root.appendChild(sectionCard(s)); });
  root.appendChild(doors());
}
