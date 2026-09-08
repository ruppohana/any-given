/**
 * parse.ts — the ESPN play-by-play parser.
 *
 * Turns one ESPN `/summary` response into `Play[]` (CONTRACT §6).
 *
 * Ported from the reference implementation's `ncaalive/form.py` (`roles`,
 * `strip_credits`, `classify`) and `ncaalive/espn.py` (`_to_goal`,
 * `_play_row`). Behaviour is diffed play-for-play against the Python on the
 * three captured 2026 fixtures — 516 plays, 462 stars.
 *
 * ── CONTRACT 7.1 · ESPN ships TWO play-text grammars ──────────────────────
 *   numbered   "#0 D.Riley rush middle for 3 yards (#2 Q.Scandrett)"
 *              the live 2026 feed — jersey numbers, tackler in parentheses
 *   named      "Kevin Riley run for 4 yds to the WKU 20"
 *              2024/2025 on the same endpoints — full names, no numbers,
 *              no tackler
 *   Both are handled. `roles()` reports which one it used per play, and the
 *   parser never assumes one: the named branch is gated on an actual verb,
 *   because without that gate "Timeout Oregon" parses as a person and the
 *   board reports that Timeout Oregon carried the ball.
 *
 * ── CONTRACT 7.2 🔴 THE PARENTHESIZED GROUP AT THE END OF A PLAY IS THE ───
 *      TACKLER, NEVER THE BALL CARRIER
 *   The original took the last name in the play text and looked that jersey
 *   number up in the OFFENSE's roster. One card named three different people.
 *
 *   So: `strip_credits()` removes every credited defender BEFORE anybody is
 *   chosen, and `Play.star` is emitted explicitly with an explicit role and
 *   an explicit teamId. No view may derive it. A tackler is kept — in
 *   `roles().credited` — but is never the star.
 *
 *   Two shapes carry a credited defender and only ONE is parenthesised:
 *     "(#2 Q.Scandrett; #27 G.Forsha)"   tacklers
 *     "QB hurried by #26 P.Pierce"       no brackets at all, and it lands on
 *                                        incompletions — the play where the
 *                                        offense did nothing and the panel
 *                                        most needs the right man
 */

// ---------------------------------------------------------------------------
// CONTRACT §6 — the emitted type
// ---------------------------------------------------------------------------

/** The five roles CONTRACT §6 allows on a star. */
export type StarRole = 'carrier' | 'passer' | 'receiver' | 'tackler' | 'kicker';

export type Star = {
  name: string;
  jersey: string | null;
  teamId: string;
  role: StarRole;
};

export type PlayType = 'run' | 'pass' | 'kick' | 'penalty' | 'other';

export type Play = {
  id: string;
  driveId: string;
  quarter: number;
  clock: string;
  down: number | null;
  distance: number | null;
  yardsToGoal: number | null;
  offenseTeamId: string;
  text: string;
  yards: number;
  /** 🔴 7.2 EMITTED BY THE PARSER, NEVER DERIVED IN A VIEW. */
  star: Star | null;
  type: PlayType;
};

// ---------------------------------------------------------------------------
// The finer vocabulary the parser works in
// ---------------------------------------------------------------------------

/**
 * What the play was actually about, before it is flattened onto the five
 * roles CONTRACT §6 allows. `returner` and `interceptor` have no §6 spelling
 * — both become `carrier`, which is what they are, on the team that took the
 * ball. Read this when you need the distinction.
 */
export type FineRole =
  | 'rusher' | 'passer' | 'receiver' | 'kicker' | 'returner' | 'interceptor';

export type Grammar = 'numbered' | 'named' | 'none';

/** A person named in the play text. `side` is relative to the DRIVE's team. */
export type Person = {
  number: string | null;
  name: string;
  role: FineRole | 'tackle' | 'battery' | 'other' | 'qb hurried by'
       | 'broken up by' | 'sacked by' | 'tackled by';
  side: 'offense' | 'defense';
};

export type Roles = {
  star: { number: string | null; name: string; role: FineRole; side: 'offense' | 'defense' } | null;
  players: Person[];
  grammar: Grammar;
  credited: { number: string | null; name: string; role: string }[];
};

// ---------------------------------------------------------------------------
// ESPN's play_type vocabulary. Close to CFBD's but not identical.
// ---------------------------------------------------------------------------

const RUN = ['rush', 'rushing touchdown'];
const PASS = ['pass reception', 'pass incompletion', 'pass interception return',
  'passing touchdown', 'sack', 'pass completion', 'pass interception'];
const NON_SNAP = ['punt', 'kickoff', 'field goal', 'extra point', 'penalty',
  'timeout', 'end period', 'end of half', 'end of game', 'two-minute',
  'coin toss', 'official timeout'];

/** ESPN type words that mean the ball was kicked. */
const KICKING = ['kickoff', 'punt', 'field goal', 'extra point'];

// "#27 T.Campbell rush left for 2 yards" — the number and name ESPN prints.
// The trailing group takes a generational suffix, because "C.Thompson Jr."
// and "C.Franklin III" are both in the 2026 feed and a matcher that stops at
// the surname resolves them to the wrong roster row — or to none.
const PLAYER_RE =
  /#(\d{1,2})\s+([A-Z][A-Za-z'\-]*\.?\s?[A-Z][A-Za-z'\-]+(?:\s+(?:Jr\.|Sr\.|III|IV|II|VI|V))?)/g;

// 7.1 — the older grammar, still what 2024 and 2025 return: full names, no
// numbers. "Kevin Riley run for 4 yds to the WKU 20".
const NAME_ONLY_RE =
  /\b([A-Z][a-z]+(?:\.[A-Z][a-z]+)?\s+[A-Z][A-Za-z'\-]+(?:\s+(?:Jr\.|Sr\.|III|IV|II|VI|V))?)\b/g;

// 7.2 — everything ESPN prints that names somebody who did NOT do the thing.
const CREDIT_PHRASE_RE =
  /\b(QB hurried by|broken up by|sacked by|tackled by)\s+((?:#\d{1,2}\s+[A-Z][A-Za-z'\-]*\.?\s?[A-Z][A-Za-z'\-]+(?:\s+(?:Jr\.|Sr\.|III|IV|II|VI|V))?[,;\s]*)+)/gi;
const PARENS_RE = /\(([^()]*)\)/g;
const BATTERY_RE = /\b(?:H|LS):/;

// Prefixes ESPN puts in front of the actor, and the tails it puts after the
// result. Both carry numbers or capitals a naive matcher reads as a name.
const CLOCK_RE = /^\s*\(\d{1,2}:\d{2}\)\s*/;
const FORMATION_RE = /^\s*(?:No Huddle-Shotgun|No Huddle|Shotgun|Wildcat)\s*/i;
const TAIL_RE =
  /,?\s*(?:1ST DOWN|TOUCHDOWN|Touchback|End Of Play|SAFETY|out of bounds|NO PLAY)\.?\s*$/i;

const RETURN_RE = /\breturn(?:ed)?\b/;

const VERBS = ['run', 'rush', 'pass', 'punt', 'kickoff', 'kick', 'sack',
  'intercept', 'field goal', 'return', 'fumble', 'reception'];
const CLOCK_TYPES = ['timeout', 'end period', 'end of half', 'end of game',
  'coin toss', 'official timeout', 'two-minute', 'end of'];

const hasVerb = (low: string) => VERBS.some((v) => low.includes(v));
const isClock = (ptype: string, low: string) =>
  CLOCK_TYPES.some((w) => ptype.includes(w) || low.startsWith(w));

type Pair = [string | null, string];

function people(chunk: string): Pair[] {
  const out: Pair[] = [];
  for (const m of (chunk || '').matchAll(PLAYER_RE)) out.push([m[1], m[2].trim()]);
  return out;
}

/**
 * `[main, credited]` — the actors split from the people credited against them.
 *
 * 🔴 7.2. `credited` is everybody ESPN names who did not do the thing:
 * tacklers, the hurrier, the defender who broke the pass up, the holder and
 * long snapper on a kick. They are returned rather than dropped — a tackler
 * is worth naming, just never as the star.
 */
export function stripCredits(text: string): [string, [string | null, string, string][]] {
  let main = text || '';
  const credited: [string | null, string, string][] = [];

  for (const m of main.matchAll(CREDIT_PHRASE_RE)) {
    for (const [n, nm] of people(m[2])) credited.push([n, nm, m[1].toLowerCase()]);
  }
  main = main.replace(CREDIT_PHRASE_RE, ' ');

  main = main.replace(PARENS_RE, (whole, inner: string) => {
    const inside = people(inner);
    if (!inside.length) return whole;           // a clock or a note; leave it
    // "(H: #32 C.Stumbaugh, LS: #45 C.Britton)" is the field-goal battery;
    // everything else in brackets is a tackle or a flag.
    const role = BATTERY_RE.test(inner) ? 'battery' : 'tackle';
    for (const [n, nm] of inside) credited.push([n, nm, role]);
    return ' ';
  });

  return [main, credited];
}

function clean(text: string): string {
  let t = (text || '').replace(CLOCK_RE, '');
  t = t.replace(FORMATION_RE, '');
  return t.replace(TAIL_RE, '').trim();
}

/**
 * Who did what on this play, with an explicit star.
 *
 * The star is the person the play is about, and it is not always the first or
 * the last name printed:
 *
 *   rush              the ball carrier
 *   completion        the receiver
 *   incompletion      the passer — nobody caught it
 *   sack              the quarterback it happened to
 *   interception      the defender who took it
 *   kickoff / punt    the RETURNER, who is printed second
 *   field goal        the kicker
 *
 * 🔴 7.2 Emitting it explicitly is the point. The board used to take
 * `players[players.length - 1]`, which on any tackled run is the last tackler.
 */
export function roles(text: string, playType = ''): Roles {
  const raw = text || '';
  const [stripped, credited] = stripCredits(raw);
  const main = clean(stripped);
  const low = main.toLowerCase();
  const ptype = (playType || '').toLowerCase();

  let persons = people(main);
  let grammar: Grammar = 'numbered';
  if (!persons.length && hasVerb(low) && !isClock(ptype, low)) {
    // 7.1 — 2024/2025 and the scoring-summary line: names, no numbers.
    // Gated on an actual verb, because without one "Timeout Oregon" and
    // "End of 1st quarter" both parse as a person and the board reports that
    // Timeout Oregon just carried the ball.
    persons = [...main.matchAll(NAME_ONLY_RE)].map((m) => [null, m[1]] as Pair);
    grammar = persons.length ? 'named' : 'none';
  } else if (!persons.length) {
    grammar = 'none';
  }

  const pick = (i: number): Pair | null =>
    (i >= 0 && i < persons.length) ? persons[i] : null;

  let star: Pair | null = null;
  let starRole: FineRole | null = null;

  const ret = RETURN_RE.exec(low);
  const intAt = low.indexOf('intercepted by');
  if (intAt >= 0) {
    star = pick(people(main.slice(0, intAt)).length);
    starRole = 'interceptor';
  } else if (ret && ['kickoff', 'punt'].some((w) => ptype.includes(w) || low.includes(w))) {
    // "#38 B.Boehm kickoff 65 yards ... #2 L.Bey return 16 yards" — the
    // kicker is printed first and did the boring half.
    star = pick(people(main.slice(0, ret.index)).length - 1);
    starRole = 'returner';
  } else if (low.includes('sacked')) {
    star = pick(0); starRole = 'passer';
  } else if (low.includes('pass') && low.includes('incomplete')) {
    star = pick(0); starRole = 'passer';
  } else if (low.includes('pass') && (low.includes('complete') || ptype.includes('reception'))) {
    // A completion names the passer then the receiver — but the older
    // grammar prints "pass complete to the right", a direction and not a
    // person, so there may be only one name on the line and he threw it.
    const got = pick(1);
    if (got) { star = got; starRole = 'receiver'; }
    else { star = pick(0); starRole = 'passer'; }
  } else if (low.includes('field goal') || low.includes('extra point')) {
    star = pick(0); starRole = 'kicker';
  } else if (low.includes('punt') || low.includes('kickoff')) {
    star = pick(0); starRole = 'kicker';
  } else if (persons.length) {
    star = pick(0); starRole = 'rusher';
  }

  const out: Person[] = [];
  for (let i = 0; i < persons.length; i++) {
    const [n, nm] = persons[i];
    let role: Person['role'] | null =
      (star && i === 0 && starRole !== null &&
       ['rusher', 'passer', 'kicker'].includes(starRole))
        ? (starRole as Person['role']) : null;
    if (star && n === star[0] && nm === star[1]) {
      role = starRole as Person['role'];
    } else if (role === null) {
      role = (starRole === 'receiver' && i === 0) ? 'passer' : 'other';
    }
    out.push({ number: n, name: nm, role, side: 'offense' });
  }

  const DEFENSIVE: FineRole[] = ['interceptor', 'returner'];
  for (const [n, nm, role] of credited) {
    out.push({
      number: n, name: nm, role: role as Person['role'],
      side: role === 'battery' ? 'offense' : 'defense',
    });
  }

  return {
    star: star && starRole
      ? {
          number: star[0], name: star[1], role: starRole,
          side: DEFENSIVE.includes(starRole) ? 'defense' : 'offense',
        }
      : null,
    players: out,
    grammar,
    credited: credited.map(([n, nm, r]) => ({ number: n, name: nm, role: r })),
  };
}

/** run / pass / null, exactly as the reference `form.classify`. */
export function classify(playType: string, _text = ''): 'run' | 'pass' | null {
  const t = (playType || '').trim().toLowerCase();
  if (NON_SNAP.some((w) => t.includes(w))) return null;
  if (RUN.includes(t) || (t.includes('rush') && !t.includes('punt'))) return 'run';
  if (PASS.includes(t) || t.includes('pass') || t.includes('sack')) return 'pass';
  return null;
}

/** CONTRACT §6 `Play.type`. `classify` first, so a snap is never a kick. */
export function playKind(playType: string, isPenalty = false): PlayType {
  const kind = classify(playType);
  if (kind) return kind;
  const t = (playType || '').trim().toLowerCase();
  if (isPenalty || t.includes('penalty')) return 'penalty';
  if (KICKING.some((w) => t.includes(w))) return 'kick';
  return 'other';
}

/**
 * Yards from the end zone the offense is attacking, or null.
 *
 * Only `yardsToEndzone` is trusted — `yardLine` is ESPN's absolute field
 * position and means something else entirely, a different origin and, for the
 * away team, the opposite direction. A wrong number that looks plausible is
 * worse than no number.
 */
export function toGoal(point: any): number | null {
  if (!point || typeof point !== 'object') return null;
  const v = point.yardsToEndzone;
  let n: number;
  if (typeof v === 'number') { if (!Number.isInteger(v)) return null; n = v; }
  else if (typeof v === 'string' && /^[+-]?\d+$/.test(v.trim())) n = parseInt(v, 10);
  else return null;
  return n >= 0 && n <= 100 ? n : null;
}

// ---------------------------------------------------------------------------
// Team attribution
// ---------------------------------------------------------------------------

/** The two team ids in this summary, home first where it can be told. */
export function gameTeamIds(summary: any): string[] {
  const ids: string[] = [];
  const comp = ((summary?.header?.competitions) || [])[0];
  for (const c of (comp?.competitors || [])) {
    const id = c?.team?.id ?? c?.id;
    if (id != null && !ids.includes(String(id))) ids.push(String(id));
  }
  if (ids.length === 2) return ids;
  for (const g of (summary?.boxscore?.players || [])) {
    const id = g?.team?.id;
    if (id != null && !ids.includes(String(id))) ids.push(String(id));
  }
  return ids;
}

/**
 * 🔴 Which team the star actually plays for.
 *
 * Measured against the three captured fixtures, ESPN attaches a KICKOFF to
 * the RECEIVING team's drive: the drive team, and `teamParticipants.offense`,
 * are both the returning side, and the kicker printed first is on the other
 * team. A punt is the opposite — the punting team owns the drive.
 *
 * So `kicker` and `returner` swap sides on a kickoff. Getting this backwards
 * puts a return on the kicking team, which is 7.2's failure wearing a
 * different hat.
 */
function starTeamId(
  role: FineRole, isKickoff: boolean, offenseTeamId: string, defenseTeamId: string | null,
): string {
  const other = defenseTeamId ?? offenseTeamId;
  switch (role) {
    case 'rusher': case 'passer': case 'receiver': return offenseTeamId;
    case 'kicker': return isKickoff ? other : offenseTeamId;
    case 'returner': return isKickoff ? offenseTeamId : other;
    case 'interceptor': return other;
  }
}

/** The five §6 roles. `returner` and `interceptor` have no §6 spelling. */
const STAR_ROLE: Record<FineRole, StarRole> = {
  rusher: 'carrier',
  returner: 'carrier',
  interceptor: 'carrier',
  passer: 'passer',
  receiver: 'receiver',
  kicker: 'kicker',
};

// ---------------------------------------------------------------------------
// The parser
// ---------------------------------------------------------------------------

/** Every drive row in `drives`, previous then current. */
function driveRows(summary: any): any[] {
  const drives = summary?.drives || {};
  const rows = [...(drives.previous || [])];
  if (drives.current) rows.push(drives.current);
  return rows.filter((d) => d && typeof d === 'object');
}

/**
 * One ESPN `/summary` response → `Play[]`, in feed order.
 *
 * The active drive appears in both `previous` and `current` while a game is
 * live, so plays are de-duplicated by id.
 */
export function parsePlays(summary: any): Play[] {
  const gameIds = gameTeamIds(summary);
  const out: Play[] = [];
  const seen = new Set<string>();

  for (const d of driveRows(summary)) {
    const driveTeamId = d?.team?.id != null ? String(d.team.id) : null;
    for (const p of (d.plays || [])) {
      if (!p || typeof p !== 'object') continue;
      const key = p.id != null
        ? `id:${p.id}`
        : `sq:${p.sequenceNumber} ${p.text || ''}`;
      if (seen.has(key)) continue;   // the active drive appears twice
      seen.add(key);

      const text: string = p.text || '';
      const espnType: string = p.type?.text || '';
      const start = p.start || {};

      const parts: Record<string, string> = {};
      for (const tp of (p.teamParticipants || [])) {
        if (tp?.type && tp?.id != null) parts[tp.type] = String(tp.id);
      }

      const offenseTeamId =
        driveTeamId ?? parts.offense ??
        (start.team?.id != null ? String(start.team.id) : '');
      const defenseTeamId =
        (gameIds.length === 2 && gameIds.includes(offenseTeamId))
          ? gameIds.find((t) => t !== offenseTeamId)!
          : (parts.defense ?? null);

      const r = roles(text, espnType);
      const isKickoff = espnType.toLowerCase().includes('kickoff');

      let star: Star | null = null;
      if (r.star) {
        star = {
          name: r.star.name,
          jersey: r.star.number,
          teamId: starTeamId(r.star.role, isKickoff, offenseTeamId, defenseTeamId),
          role: STAR_ROLE[r.star.role],
        };
      }

      const yards = Number.parseInt(String(p.statYardage ?? 0), 10);

      out.push({
        id: String(p.id ?? `${d.id ?? ''}-${p.sequenceNumber ?? out.length}`),
        driveId: String(d.id ?? ''),
        quarter: Number(p.period?.number ?? 0),
        clock: p.clock?.displayValue ?? '',
        down: start.down ?? null,
        distance: start.distance ?? null,
        yardsToGoal: toGoal(start),
        offenseTeamId,
        text,
        yards: Number.isFinite(yards) ? yards : 0,
        star,
        type: playKind(espnType, Boolean(p.isPenalty)),
      });
    }
  }
  return out;
}

/**
 * 7.1 — which grammar a payload actually uses. Measured, never assumed.
 * `{ numbered, named, none, plays }`.
 */
export function grammarProfile(summary: any): Record<Grammar | 'plays', number> {
  const counts = { numbered: 0, named: 0, none: 0, plays: 0 };
  for (const d of driveRows(summary)) {
    for (const p of (d.plays || [])) {
      counts.plays += 1;
      counts[roles(p?.text || '', p?.type?.text || '').grammar] += 1;
    }
  }
  return counts;
}
