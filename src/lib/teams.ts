/* TEAM IDENTITY, and the map the pricer cannot work without. Session-owned.
 *
 * 🔴 WHY THIS FILE EXISTS AT ALL. The tendency model is keyed on CFBD SCHOOL
 * NAMES - 'Oklahoma', 'Boise State'. The reference implementation feeds it the
 * ESPN ABBREVIATION: ncaalive/tendency.py::situation_features() passes
 * game.abbrev(off), which is 'OU'. Nothing in that lookup path errors, because a
 * miss is indistinguishable from a legitimate back-off - so it silently falls
 * through to the 'ALL' league baseline.
 *
 * MEASURED CONSEQUENCE: every live prediction the running app has ever made was
 * the league average. The 697,997-play model that this product calls its moat has
 * never priced a single call per team in production. Found 2026-09-08 by porting
 * the pricer rather than by reading it.
 *
 * SO THIS MODULE'S ONE JOB IS TO RESOLVE A TEAM TO A MODEL KEY, OR TO SAY IT
 * CANNOT. It returns null rather than a fallback, because the whole bug above is
 * a fallback that looked like an answer.
 *
 * COVERAGE, measured against the real 22 MB tendency.json and the real 760-team
 * file rather than estimated:
 *   330 team keys in the model
 *   215 reachable by exact ESPN name           (65%)
 *   286 reachable once abbreviations expand    (87%)
 *   the remainder need the explicit alias table below, every entry of which was
 *   READ OUT of fixtures/teams.json - none is guessed.
 */

export type TeamIdentity = {
  id: string;
  abbrev: string;
  name: string;
  short: string;
  primary: string | null;
  secondary: string | null;
};

export type ModelKeyResolution =
  | { key: string; how: 'exact' | 'normalized' | 'alias' }
  | null;

/* ESPN writes 'St' for both State and Saint, and a bare initial for both North
 * and Northern. Both readings are tried; the model decides which exists. */
const MULTI: Record<string, string[]> = {
  st: ['state', 'saint'],
  n: ['north', 'northern'],
  s: ['south', 'southern'],
  e: ['east', 'eastern'],
  w: ['west', 'western'],
  c: ['central'],
  univ: ['university'],
  intl: ['international'],
  cal: ['california'],
  la: ['louisiana'],
  miss: ['mississippi'],
  fla: ['florida'],
  ga: ['georgia'],
  tenn: ['tennessee'],
  car: ['carolina'],
  col: ['college'],
  chrstn: ['christian'],
  chr: ['christian'],
  mich: ['michigan'],
  wash: ['washington'],
  ky: ['kentucky']
};

/* Names ESPN and CFBD simply spell differently. EVERY LEFT-HAND SIDE WAS READ
 * OUT OF fixtures/teams.json; every right-hand side is a key that exists in
 * tendency.json. Neither side is invented. */
const ALIASES: Record<string, string> = {
  'Coastal': 'Coastal Carolina',
  'FAU': 'Florida Atlantic',
  'FIU': 'Florida International',
  'Jax State': 'Jacksonville State',
  'UMass': 'Massachusetts',
  'MTSU': 'Middle Tennessee',
  'Western KY': 'Western Kentucky',
  'Penn': 'Pennsylvania',
  'Charleston So': 'Charleston Southern',
  'Abilene Chrstn': 'Abilene Christian',
  'Bethune': 'Bethune-Cookman',
  'Prairie View': 'Prairie View A&M',
  'SF Austin': 'Stephen F. Austin',
  'Winston-Salem': 'Winston-Salem State',
  'Long Island': 'Long Island University',
  'ETSU': 'East Tennessee State',
  'SE Missouri': 'Southeast Missouri State',
  "N'Western St": 'Northwestern State',
  'NC A&T': 'North Carolina A&T',
  'NC Central': 'North Carolina Central',
  'St Thomas': 'St. Thomas (MN)',
  'Ark-Pine Bluff': 'Arkansas-Pine Bluff'
};

function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[-.]/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function canonical(s: string): string {
  return words(s).join(' ');
}

/** Every reading of an abbreviated name. Capped, so a long name cannot explode. */
export function candidates(s: string): string[] {
  const ws = words(s);
  let total = 1;
  const opts = ws.map((w) => {
    const alts = MULTI[w] ? [w, ...MULTI[w]] : [w];
    const uniq = Array.from(new Set(alts));
    total *= uniq.length;
    return uniq;
  });
  if (total > 64) return [ws.join(' ')];
  let acc: string[][] = [[]];
  for (const o of opts) {
    const next: string[][] = [];
    for (const a of acc) for (const w of o) next.push([...a, w]);
    acc = next;
  }
  return acc.map((a) => a.join(' '));
}

/**
 * Resolve a team to a key the tendency model actually holds.
 *
 * @param team       the identity
 * @param modelKeys  the set of team tokens present in the model. The CALLER
 *                   supplies it - this module never loads the 22 MB file, which
 *                   is what keeps the bundle-or-D1 question open.
 * @returns the key and how it was found, or NULL. Null means "price off the
 *          league baseline AND SAY SO" - never a silent fallback.
 */
export function modelKeyFor(team: TeamIdentity, modelKeys: Set<string>): ModelKeyResolution {
  if (!team) return null;

  const aliased = ALIASES[team.short] || ALIASES[team.abbrev];
  if (aliased && modelKeys.has(aliased)) return { key: aliased, how: 'alias' };

  for (const raw of [team.short, team.name]) {
    if (raw && modelKeys.has(raw)) return { key: raw, how: 'exact' };
  }

  /* The model's own keys, canonicalized once by the caller, would be faster; this
   * path stays correct without it. */
  for (const raw of [team.short, team.name]) {
    if (!raw) continue;
    for (const c of candidates(raw)) {
      for (const k of modelKeys) {
        if (canonical(k) === c) return { key: k, how: 'normalized' };
      }
    }
  }
  return null;
}

/** A faster resolver when many teams are resolved against one model. */
export function makeResolver(modelKeys: Iterable<string>) {
  const keys = new Set(modelKeys);
  const byCanonical = new Map<string, string>();
  for (const k of keys) byCanonical.set(canonical(k), k);

  return function resolve(team: TeamIdentity): ModelKeyResolution {
    if (!team) return null;
    const aliased = ALIASES[team.short] || ALIASES[team.abbrev];
    if (aliased && keys.has(aliased)) return { key: aliased, how: 'alias' };
    for (const raw of [team.short, team.name]) {
      if (raw && keys.has(raw)) return { key: raw, how: 'exact' };
    }
    for (const raw of [team.short, team.name]) {
      if (!raw) continue;
      for (const c of candidates(raw)) {
        const hit = byCanonical.get(c);
        if (hit) return { key: hit, how: 'normalized' };
      }
    }
    return null;
  };
}

/** Load the 760-team file into a map. Read-only; nothing writes teams.json. */
export function indexTeams(db: { teams: Record<string, TeamIdentity> }): Map<string, TeamIdentity> {
  return new Map(Object.entries(db.teams));
}

/** '000000' means "never captured", not black. 401 of 760 have no usable primary. */
export function hasUsablePrimary(t: TeamIdentity): boolean {
  return !!t.primary && t.primary.toLowerCase().replace('#', '') !== '000000';
}
