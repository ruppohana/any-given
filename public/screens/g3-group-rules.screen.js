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

/* THE NINE SPORTS a group can play, in src/lib/groups.ts POOL_SPORTS order
 * (Jason, 2026-09-12: "do all the sports for the pool", "do nascar next", then
 * "keep working on making it larger" - MLB, the NHL, the WNBA). A sport the
 * server does not name is a college football group, as poolSport reads it. */
const LEAGUES = { 'college-football': 'College football', nfl: 'NFL',
  'mens-college-basketball': 'College basketball', nba: 'NBA', f1: 'Formula 1', nascar: 'NASCAR',
  mlb: 'MLB', nhl: 'NHL', wnba: 'WNBA', 'nascar-oreilly': 'NASCAR O’Reilly', 'nascar-truck': 'NASCAR Trucks',
  epl: 'Premier League', mls: 'MLS', ucl: 'Champions League', laliga: 'La Liga', ligamx: 'Liga MX',
  'mens-college-hockey': 'College hockey', 'womens-college-basketball': 'Women’s college basketball' };
function leagueOf(s) { return Object.prototype.hasOwnProperty.call(LEAGUES, s) ? s : 'college-football'; }
/* 🔴 THE ONE LIST OF SPORTS THAT PICK A DAY AT A TIME. src/lib/day.ts DAY_SPORTS
 * is the server's copy; tests/g3-group-rules.test.mjs holds the two equal. */
export const DAY_SPORTS = ['mens-college-basketball', 'nba', 'wnba', 'mlb', 'nhl', 'epl', 'mls',
  'ucl', 'laliga', 'ligamx', 'mens-college-hockey', 'womens-college-basketball'];
export function isDaySport(s) { return DAY_SPORTS.includes(s); }
/** F1 and NASCAR are races: scored in points, with no spread anywhere. */
/* F1 and every NASCAR series - Cup, O'Reilly, Truck (2026-09-13). */
function isRacing(s) { return s === 'f1' || String(s).startsWith('nascar'); }
/** The five soccer leagues. src/lib/groups.ts isSoccerSport: the draw is a
 *  pick, and gradeSql scores a level final for the people who picked it - unless
 *  a knockout was won on penalties (game.winner). */
export function isSoccer(s) { return ['epl', 'mls', 'ucl', 'laliga', 'ligamx'].includes(s); }
/** No spread anywhere: the races and soccer (src/lib/groups.ts hasNoSpread). */
export function hasNoSpread(s) { return isRacing(s) || isSoccer(s); }

/** The moment a day-sport game starts - the word its picks lock at - and the
 *  clause that says it: basketball tips off, baseball throws the first pitch,
 *  hockey drops the puck. */
const DAY_WORDS = {
  basketball: { lock: 'tip-off', until: 'that game tips off' },
  baseball: { lock: 'first pitch', until: 'that game’s first pitch' },
  hockey: { lock: 'puck drop', until: 'the puck drops on that game' },
  soccer: { lock: 'kickoff', until: 'that game kicks off' }
};
function dayFamily(s) {
  return s === 'mlb' ? 'baseball' : s === 'nhl' || s === 'mens-college-hockey' ? 'hockey'
    : isSoccer(s) ? 'soccer' : 'basketball';
}
export function lockWord(s) { return DAY_WORDS[dayFamily(s)].lock; }

/** What the spread is called where the line has its own name: MLB's run line and
 *  the NHL's puck line are what ESPN carries as the spread. '' everywhere else. */
export function spreadNote(s) {
  return s === 'mlb' ? 'In MLB the spread is the run line.'
    : s === 'nhl' ? 'In the NHL the spread is the puck line.'
    : s === 'mens-college-hockey' ? 'In college hockey the spread is the puck line.' : '';
}

/** The picking rules of a day sport, as words. Pure, so the test can read the
 *  sentences each sport actually gets; sPicking turns them into the card. */
export function dayPicking(s) {
  const fam = dayFamily(s);
  const w = DAY_WORDS[fam];
  /* Soccer has three picks on a match, and the draw is one of them. */
  const what = fam === 'soccer' ? 'the home side, the away side or the draw' : 'a side';
  return {
    lead: 'Every pick is editable until ' + w.until + ', and locks at ' + w.lock + '.',
    bullets: [
      'A ' + fam + ' group picks a day at a time. Each day, pick ' + what + ' in the games you ' +
        'want. There is no minimum.',
      'The ' + w.lock + ' time is the server’s, not your phone’s, so a pick cannot slip in late.',
      'Pick the same game again before ' + w.lock + ' and the new pick replaces the old one.',
      'Only members can pick in a group. Picking never joins you to one.'
    ]
  };
}

/** The group card's line for a day sport. */
export function dayCardLine(s) {
  return 'This group picks a day at a time. Every pick locks at ' + lockWord(s) + '.';
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
    /* The O'Reilly series is the Xfinity Series renamed for 2026 (Jason,
     * 2026-09-13) - named once here so the old name is recognized. */
    'A group plays one sport - college football, the NFL, men’s or women’s college basketball, ' +
      'the NBA, the WNBA, MLB, the NHL, college hockey, the Premier League, MLS, the Champions ' +
      'League, La Liga, Liga MX, Formula 1 or NASCAR (Cup, Trucks or O’Reilly, formerly Xfinity) ' +
      '- chosen when it starts.',
    'You join with the code from an invite. The invite link carries the same code, ' +
      'and the code works in any case, with or without spaces.',
    'You need to be signed in with your email, with a handle, to start or join one.',
    'Inside a group everyone is known by their handle. Nobody’s email address is shown.'
  ]));
  return box;
}

/* ------------------------------------------------------------ 2 PICKING */

function sPicking(sport) {
  const box = document.createDocumentFragment();
  if (sport === 'f1') {
    /* src/lib/f1.ts sessionFor: qualifying and sprint picks lock with their own
     * session, everything else with the race. */
    box.appendChild(lead('Each race weekend pick is editable until its session starts, and ' +
      'locks when it does.'));
    box.appendChild(bullets([
      'Pick the top three in qualifying, the sprint and the race, the fastest lap, whether ' +
        'the pole-sitter wins, and how many cars retire.',
      'Qualifying picks lock when qualifying starts, sprint picks when the sprint starts, ' +
        'and the rest when the race starts.',
      'The start time is the server’s, not your phone’s, so a pick cannot slip in late.',
      'Only members can pick in a group. Picking never joins you to one.'
    ]));
    box.appendChild(subHead('Your picks belong to one group'));
    box.appendChild(para('A pick you make in one group is not a pick in any other group. ' +
      'In two groups you can pick the same weekend two different ways.'));
    return box;
  }
  if (String(sport).startsWith('nascar')) {
    /* src/lib/nascar.ts isLocked: every pick locks with the race - the green flag.
     * src/f1-pool.ts savePicks cleans against the server's Date.now(). */
    box.appendChild(lead('Every race day pick is editable until the green flag, and locks ' +
      'when the race starts.'));
    box.appendChild(bullets([
      'Pick the race: the top three, the winning make, the pole-sitter and a dark horse, ' +
        'scored in points.',
      'Pick whether the pole-sitter wins, yes or no.',
      'A dark horse is a driver who starts 11th or worse. Pick one you think finishes in ' +
        'the top ten.',
      'The start time is the server’s, not your phone’s, so a pick cannot slip in late.',
      'Only members can pick in a group. Picking never joins you to one.'
    ]));
    box.appendChild(subHead('Your picks belong to one group'));
    box.appendChild(para('A pick you make in one group is not a pick in any other group. ' +
      'In two groups you can pick the same race two different ways.'));
    return box;
  }
  if (isDaySport(sport)) {
    /* Basketball, baseball, hockey: the same rules, each in its own start word. */
    const d = dayPicking(sport);
    box.appendChild(lead(d.lead));
    box.appendChild(bullets(d.bullets));
    box.appendChild(subHead('Your picks belong to one group'));
    box.appendChild(para('A pick you make in one group is not a pick in any other group, ' +
      'and it is not a pick on the public slate. In two groups you can pick the same game ' +
      'two different ways.'));
    return box;
  }
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

function sScoring(sport) {
  const box = document.createDocumentFragment();
  if (sport === 'f1') {
    /* src/lib/f1.ts POINTS and scoreWeekend; src/f1-pool.ts f1Standings. No
     * spread - an F1 group is scored in points. */
    box.appendChild(lead('An F1 group is scored in points over each race weekend.'));
    box.appendChild(bullets([
      'A top-three pick scores for the right driver in the exact spot, and less for the ' +
        'right driver in the wrong spot.',
      'The fastest lap, whether the pole-sitter wins, and how many cars retire each score ' +
        'when you have them right.',
      'A wrong pick scores nothing and takes nothing away.',
      'A pick scores once its session is finished.'
    ]));
    box.appendChild(subHead('The standings'));
    box.appendChild(bullets([
      'Ranked by points, added up over every race weekend of the season.',
      'Everyone in the group is on them from the day they join, picks or not.',
      'A group’s standings count only the picks made in that group.'
    ]));
    return box;
  }
  if (String(sport).startsWith('nascar')) {
    /* src/lib/nascar.ts NPOINTS and scoreNascar; src/f1-pool.ts racingStandings.
     * No spread - a NASCAR group is scored in points. */
    box.appendChild(lead('A NASCAR group is scored in points over each race.'));
    box.appendChild(bullets([
      'A top-three pick scores for the right driver in the exact spot, and less for the ' +
        'right driver in the wrong spot.',
      'The winning make, whether the pole-sitter wins, and the dark horse each score when ' +
        'you have them right.',
      'A dark horse is right when your driver finishes in the top ten.',
      'A wrong pick scores nothing and takes nothing away.',
      'Every pick scores once the race is final.'
    ]));
    box.appendChild(subHead('The standings'));
    box.appendChild(bullets([
      'Ranked by points, added up over every race of the season.',
      'Everyone in the group is on them from the day they join, picks or not.',
      'A group’s standings count only the picks made in that group.'
    ]));
    return box;
  }
  if (isSoccer(sport)) {
    /* src/lib/groups.ts gradeSql: in soccer a level final grades as 'draw', the
     * draw pickers win it, and the match counts as played for everybody.
     * hasNoSpread keeps a soccer group off the spread at create and in settings. */
    box.appendChild(lead('Every right pick is a point. A wrong pick scores nothing and ' +
      'takes nothing away.'));
    box.appendChild(para('Points are the only score in a group.'));
    box.appendChild(subHead('The draw is a pick'));
    box.appendChild(bullets([
      'Every match has three picks: the home side, the away side, or the draw.',
      'A match that finishes level scores a point for everybody who picked the draw, and ' +
        'nothing for anybody who picked a side.',
      /* 🔴 A KNOCKOUT HAS A WINNER - Jason, 2026-09-13. src/lib/pool.ts resolveGame
       * reads game.winner before the level score. */
      'A knockout match still level after extra time is decided on penalties. The side ' +
        'that goes through wins it, so the draw scores nothing there.',
      'There is no spread in a soccer group. Every pick is straight up.'
    ]));
    box.appendChild(subHead('When a game does not count'));
    box.appendChild(para('A match counts once it is final, level or not. A match that is ' +
      'cancelled never counts. No points won and none lost, for anybody who picked it.'));
    box.appendChild(subHead('The standings'));
    box.appendChild(bullets([
      'Ranked by right picks.',
      'Everyone in the group is on them from the day they join, picks or not.',
      'A group’s standings count only the picks made in that group.'
    ]));
    return box;
  }
  box.appendChild(lead('Every right pick is a point. A wrong pick scores nothing and ' +
    'takes nothing away.'));
  box.appendChild(para('Points are the only score in a group.'));

  box.appendChild(subHead('Straight up, or against the spread'));
  /* The commissioner's option (Jason, 2026-09-11). The line is the pick's own -
   * `pick.spread_at` in /api/pool/standings - see the header. */
  box.appendChild(para('Straight up is the default: a pick is right when its team wins. ' +
    'When the commissioner turns against the spread on, a pick is right when its team ' +
    'covers the spread it was picked at - the line on the game when you tapped it.' +
    (spreadNote(sport) ? ' ' + spreadNote(sport) : '')));

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

function sCommish(sport) {
  const box = document.createDocumentFragment();
  box.appendChild(lead('Starting a group means accepting this line:'));
  /* 🔴 THE PLEDGE, READ FROM src/lib/groups.ts. The server refuses to create a
   * group without it, and returns this same constant as the refusal. */
  box.appendChild(el('blockquote', 'g3-pledge', KINDNESS));
  box.appendChild(para('The commissioner is responsible for keeping the group kind, and ' +
    'has the tools to do it:'));
  box.appendChild(bullets([
    hasNoSpread(sport) ? 'Rename the group.' : 'Rename the group, and switch against the spread on or off.',
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

function currentGroup(data) {
  return data.groups.find(function (x) { return x.id === data.current; }) || data.groups[0];
}

/** The current group: its name (a switcher with 2+), the league, and whether it
 *  picks against the spread. F1 and basketball say how their picks run; the
 *  rules below follow the group's sport. */
function groupCard(root, data) {
  const groups = data.groups;
  const g = currentGroup(data);
  const sport = leagueOf(g.sport);
  const c = el('section', 'g3-group');
  c.setAttribute('aria-label', 'Your group');
  c.appendChild(el('p', 'g3-eyebrow', 'Your group'));
  c.appendChild(groupSwitcher(groups, g.id, function (id) {
    render(root, Object.assign({}, data, { current: id }), 'ready');
  }));
  c.appendChild(kv([
    ['Picks', sport === 'f1' ? 'Points, each race weekend'
      : String(sport).startsWith('nascar') ? 'Points, each race'
      : isSoccer(sport) ? 'Straight up, or the draw'
      : g.ats ? 'Against the spread' : 'Straight up'],
    ['League', LEAGUES[sport]],
    ['Members', g.members == null ? '–' : g.members],
    ['You', g.role === 'commissioner' ? 'Commissioner' : 'Member']
  ]));
  if (sport === 'f1') {
    c.appendChild(el('p', 'g3-p', 'This group plays the Formula 1 race weekend picks, ' +
      'scored in points over each race weekend.'));
  } else if (String(sport).startsWith('nascar')) {
    c.appendChild(el('p', 'g3-p', 'This group plays the NASCAR race day picks, ' +
      'scored in points over each race.'));
  } else if (isDaySport(sport)) {
    c.appendChild(el('p', 'g3-p', dayCardLine(sport)));
  }
  c.appendChild(el('p', 'g3-note', isRacing(sport) || isDaySport(sport)
    ? 'The rules below are the ones for this group’s sport. Only this card changes between groups.'
    : 'Everything below is the same in every group. Only this card changes.'));
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

/** `sport` is the current group's, or '' with no group - which reads as football. */
function sectionCard(s, sport) {
  const c = el('section', 'g3-sec');
  c.id = s.id;
  c.setAttribute('aria-labelledby', s.id + '-h');
  const h = el('h2', 'g3-h', s.h);
  h.id = s.id + '-h';
  c.appendChild(h);
  c.appendChild(s.build(sport));
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

  /* The rules, in every state. They are not live data - but an F1, NASCAR or
   * basketball group reads its own sport's version of them. */
  const sport = view === 'group' ? leagueOf(currentGroup(data).sport) : '';
  root.appendChild(indexBlock());
  SECTIONS.forEach(function (s) { root.appendChild(sectionCard(s, sport)); });
  root.appendChild(doors());
}
