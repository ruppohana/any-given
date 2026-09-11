/* THE LIVE LOOP, and what it is honestly built out of.
 *
 * 🔴 WHY THIS EXISTS AND WHAT IT IS NOT. Jason, 2026-09-08: the in-game
 * experience is the meat, and there is an NFL game tomorrow night. So this is the
 * smallest thing that can answer the only question nobody can answer by
 * argument - IS CALLING RUN OR PASS AT A SNAP ANY FUN - running against a real
 * feed, on a phone, during a real game.
 *
 * It is NOT the architecture. BUILD-BRIEF section 1 is Workers + Durable Objects:
 * one server polls the feed, a phone holds one connection, and hibernation makes
 * an idle game free. That is for MANY phones on ONE game. For one person testing
 * a loop, a plain Worker that polls ESPN and serves state is enough, it runs on
 * the free tier, and it can exist tomorrow. The DO comes when a second person
 * does.
 *
 * 🔴 THE FEED IS RETROSPECTIVE, AND THE DELAY IS WHAT MAKES THE CALL POSSIBLE.
 * ESPN tells you a play happened after it happened, so "call before the snap"
 * only works because the viewer is deliberately BEHIND the television. Play N
 * lands in the app; the window to call is until play N+1 arrives; on the screen
 * in front of them the snap has not happened yet. Being late is the mechanic, not
 * a tax on it - screen-flow stage 2 says exactly this and it is now load-bearing
 * rather than descriptive.
 *
 * WHAT IS WEAK HERE AND IS SAID OUT LOUD: the PRICE. The tendency model is
 * 697,997 COLLEGE plays and there is no NFL equivalent, so an NFL price cannot
 * come from it. What is below is a live in-game rate with a prior, which is real
 * data and a thin sample. It is enough to test whether the LOOP is fun; it is not
 * the model, and it must never be presented as one.
 */

import { parseSlate, type Sport } from './feed/espn.ts';
/* 🔴 THE STAR COMES FROM THE REAL PARSER. `readPlays` was a simpler duplicate
 * that dropped it, so the commentary rendered "Touchdown — 17" with a raw team
 * id and no player at all. Requirement 7.2 is that the parser EMITS the star
 * explicitly and a view never derives it — the parenthesised group at the end of
 * a play is the TACKLER, and the vault records that mistake costing real days.
 * A second, simpler play reader that quietly omits it is the same failure with
 * better manners. */
import { roles } from './lib/parse.ts';

export type LiveSituation = {
  playId: string;
  driveId: string;
  offenseTeamId: string;
  quarter: number;
  clock: string;
  down: number | null;
  distance: number | null;
  yardsToGoal: number | null;
  downDistanceText: string | null;
  spotText: string | null;
  homeScore: number;
  awayScore: number;
  /** The play that JUST happened. The call is on whatever comes next. */
  lastPlayText: string;
  lastPlayKind: PlayKind;
};

export type PlayKind = 'run' | 'pass' | 'other';

export type LiveState = {
  gameId: string;
  sport: Sport;
  status: 'pre' | 'live' | 'final';
  homeTeamId: string;
  awayTeamId: string;
  teams: Record<string, { abbrev: string; name: string; short: string; nick: string; primary: string | null; secondary: string | null }>;
  homeScore: number;
  awayScore: number;
  /** Newest last, exactly as the feed orders them. */
  plays: LivePlay[];
  /** 🔴 A DRIVE'S RESULT IS READ, NEVER DERIVED - the same rule the game's own
   *  status has, for the same reason. ESPN says TD, FG, PUNT, DOWNS, END OF HALF
   *  in its own words. A drive that ended at half time did not stall, and
   *  inferring the result from its last play would say it did. Drive-scope calls
   *  settle against this and nothing else. */
  drives: LiveDrive[];
  situation: LiveSituation | null;
  offers: Offer[] | null;
  /** Server time when this was read, so a client can hold it by its own delay. */
  fetchedAt: number;
  /** 🔴 KICKOFF, so a screen with no plays yet has something true to say. The
   *  pre-game state used to know only that the game had not started, which is
   *  why it read as an apology rather than as anticipation. */
  kickoffUtc: number | null;
  venue: string | null;
  broadcast: string | null;
};

export type LiveDrive = {
  id: string;
  offenseTeamId: string;
  /** ESPN's own word for how it ended, upper-cased. Empty while it is running -
   *  which is exactly how a client knows a drive call is still open. */
  result: string;
  ended: boolean;
};

export type LivePlay = {
  id: string;
  driveId: string;
  offenseTeamId: string;
  quarter: number;
  clock: string;
  text: string;
  /** ESPN's own type name, needed by the settlers and previously dropped. */
  typeText: string;
  kind: PlayKind;
  scoringPlay: boolean;
  homeScore: number;
  awayScore: number;
  /**
   * 🔴 THE DOWN, FROM THE FEED'S STRUCTURED FIELDS RATHER THAN ITS PROSE.
   *
   * Requirement 7.1 is that ESPN ships two play-text grammars. Measured on 8
   * real NFL games: a college play says "...for 8 yards, 1st down PENN" and an
   * NFL play says "...for 8 yards (C.DeJean)." A settler reading the sentence
   * scored NFL first downs at 3.2% against college's 26% — and `script`, the
   * default snap question, has two tiles that say "first down".
   *
   * `end.down === 1` with the same team still holding the ball is the fact, in
   * both grammars. `endTeamId` is what separates a conversion from a turnover,
   * which also resets the down.
   */
  startDown: number | null;
  distance: number | null;
  endDown: number | null;
  endDistance: number | null;
  startTeamId: string | null;
  endTeamId: string | null;
  statYardage: number | null;
  /** "2nd & 8 at SEA 28" as the feed writes it, after this play. */
  endSpotText: string | null;
  /** Yards to the defending end zone after this play. Drawable; the text is not. */
  endYardsToEndzone: number | null;
  /** When ESPN says the play happened. The delay is measured from THIS. */
  wallclockMs: number | null;
  /** 7.2 — emitted by the parser, never worked out by a view. */
  star: { name: string; jersey: string | null; teamId: string; role: string } | null;
};

export type Offer = {
  side: 'run' | 'pass';
  p: number;
  payoutPerMarble: number;
  /** 🔴 SAMPLE, NOT AN ADJECTIVE. The number of comparable snaps this price came
   *  from, so a screen can say how much the model has seen instead of calling it
   *  "confident". A thin sample reads thin because the figure beside it is small. */
  samples: number;
  basis: 'game' | 'league-prior';
};

const MAX_PAYOUT = 6;

/**
 * 🔴 RUN OR PASS, FROM THE PLAY TEXT, AND NOTHING ELSE COUNTS AS A SNAP.
 *
 * A kick, a punt, a penalty with no play, a timeout and the end of a quarter are
 * NOT run-or-pass. They are the void path in the live layer: the offense never
 * chose, so a stake on that snap comes back untouched. `sports-live` learned this
 * as a real bug and has a test for it.
 *
 * A sack is a PASS. It is a pass play that ended badly, and counting it as a run
 * would tell the model that teams run on 3rd and 12.
 */
export function classify(text: string, typeText: string): PlayKind {
  const t = (typeText || '').toLowerCase();
  const s = (text || '').toLowerCase();
  if (/no play|timeout|end of|two-minute|kickoff|punt|field goal|extra point|kneel|spike/.test(t + ' ' + s)) {
    return 'other';
  }
  if (t.includes('sack') || s.includes(' sacked')) return 'pass';
  if (t.includes('pass') || / pass /.test(s) || s.includes('incomplete')) return 'pass';
  if (t.includes('rush') || / rush | run /.test(s) || s.includes('scramble')) return 'run';
  return 'other';
}

/**
 * The price, from what this offense has actually done in this game.
 *
 * 🔴 THIS IS NOT THE MODEL. The model is a backoff lookup over 697,997 college
 * plays keyed on team, down, distance, field position, score and quarter. This is
 * one number: how often this offense has passed tonight, with a 1-1 prior so the
 * first snap is not 0% or 100%.
 *
 * It is real data and a thin sample, and `samples` says which. It exists so the
 * LOOP can be tested against a live NFL game where the college model does not
 * apply; it is replaced by price.ts the moment the sport has a model.
 */
export function priceFrom(plays: LivePlay[], offenseTeamId: string): Offer[] {
  let run = 1, pass = 1;                       // the prior, stated rather than hidden
  for (const p of plays) {
    if (p.offenseTeamId !== offenseTeamId) continue;
    if (p.kind === 'run') run++;
    else if (p.kind === 'pass') pass++;
  }
  const n = run + pass;
  const samples = n - 2;                        // the prior is not evidence
  const mk = (side: 'run' | 'pass', c: number): Offer => {
    const p = c / n;
    return {
      side,
      p: Math.round(p * 1000) / 1000,
      payoutPerMarble: Math.min(MAX_PAYOUT, Math.round((1 / p) * 100) / 100),
      samples,
      basis: samples < 6 ? 'league-prior' : 'game'
    };
  };
  return [mk('run', run), mk('pass', pass)];
}

/** The drives themselves, with the result the feed states rather than one we
 *  work out.
 *
 * 🔴 ESPN PUTS THE RUNNING DRIVE IN `previous` AS WELL AS IN `current`, AND THAT
 * COST A REAL STAKE IN THE FIRST QUARTER OF THE OPENER. Found 2026-09-09 live,
 * from the wire:
 *
 *     {"id":"4018726562","result":"","ended":true}    <- from previous
 *     {"id":"4018726562","result":"","ended":false}   <- from current
 *
 * One drive, two entries, the same id, contradicting each other about whether it
 * is over. settleOne does `.find(d => d.id === call.driveId)` and `find` returns
 * the FIRST match - the phantom - so a drive call placed on the drive actually
 * being played was graded the instant it was made: ended, with no result, which
 * falls through the result map and voids as "unhandled drive result".
 *
 * 🔴 EVERY DRIVE CALL WAS AFFECTED, because a drive call can only ever be placed
 * on the drive in progress. The one market with a genuinely different timescale
 * could not be played at all, and it failed as a VOID - the quietest possible
 * failure, since a void looks like a rule working rather than a bug.
 *
 * TWO GUARDS, because either alone would have prevented it and the second is the
 * one that survives ESPN changing shape again:
 *
 *  1. Dedupe by id, and let `current` win. It is the feed's own statement about
 *     which drive is running now.
 *  2. 🔴 A DRIVE WITH NO RESULT HAS NOT ENDED. `ended` is derived from the
 *     result rather than from which list the object arrived in. The list is a
 *     hint about ESPN's bookkeeping; the result is the fact. Deriving it also
 *     fails SAFE - a finished drive whose result has not posted yet stays open
 *     for a moment instead of being voided, and an open call can still land. */
export function readDrives(summary: any): LiveDrive[] {
  const drives = summary?.drives || {};
  const byId = new Map<string, LiveDrive>();
  const put = (d: LiveDrive) => { if (d.id) byId.set(d.id, d); };

  for (const d of drives.previous || []) {
    const result = String(d?.result || d?.displayResult || '').toUpperCase();
    put({
      id: String(d?.id ?? ''),
      offenseTeamId: String(d?.team?.id ?? ''),
      result,
      ended: Boolean(result)
    });
  }
  /* Last, so it overwrites any copy of itself that came through `previous`. */
  if (drives.current) {
    const result = String(drives.current?.result || drives.current?.displayResult || '').toUpperCase();
    put({
      id: String(drives.current?.id ?? ''),
      offenseTeamId: String(drives.current?.team?.id ?? ''),
      result,
      ended: Boolean(result)
    });
  }
  return [...byId.values()];
}

/**
 * The person the play was about, in the parser's own words.
 *
 * 🔴 THE TEAM ID IS THE OFFENSE'S ONLY FOR AN OFFENSIVE STAR. A tackler or an
 * interceptor belongs to the OTHER team, and labelling a defender with the
 * offence's crest is the same class of error as naming the tackler as the
 * carrier — it looks right and it is backwards.
 */
function starOf(text: string, typeText: string, offenseTeamId: string) {
  try {
    const r = roles(text, typeText);
    if (!r.star || !r.star.name) return null;
    return {
      name: r.star.name,
      jersey: r.star.number ?? null,
      teamId: r.star.side === 'defense' ? '' : offenseTeamId,
      role: r.star.role
    };
  } catch { return null; }
}

/** Flatten ESPN's drive/play tree into the order a game was played in. */
export function readPlays(summary: any): LivePlay[] {
  const out: LivePlay[] = [];
  const drives = summary?.drives || {};
  /* 🔴 THE SAME DUPLICATE THAT BROKE THE DRIVE MARKET BREAKS THE PLAY LIST.
   * ESPN puts the running drive in `previous` as well as `current`, so this
   * concatenation emitted every play of the current drive TWICE. Seen on Jason's
   * phone as the same punt printed twice in Big moments, and on the wire as 29
   * plays where the feed had 21.
   *
   * 🔴 IT IS WORSE THAN A COSMETIC REPEAT. Settlement finds the play after the
   * one a call was made on by INDEX - `findIndex` then `[i + 1]` - so a doubled
   * play makes the next play be a copy of itself, and the call is graded against
   * the snap it was made on rather than the one that answered it. The dedupe by
   * id below is what stops that, and it is the same rule as readDrives: one id,
   * one object, last write wins. */
  const all = [...(drives.previous || []), ...(drives.current ? [drives.current] : [])];
  const seen = new Set<string>();
  for (const d of all) {
    const team = String(d?.team?.id ?? '');
    for (const p of d?.plays || []) {
      if (seen.has(String(p.id))) continue;
      const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
      out.push({
        id: String(p.id),
        driveId: String(d.id ?? ''),
        offenseTeamId: team,
        quarter: Number(p.period?.number) || 0,
        clock: p.clock?.displayValue || '',
        text: p.text || '',
        typeText: p.type?.text || '',
        kind: classify(p.text || '', p.type?.text || ''),
        scoringPlay: !!p.scoringPlay,
        homeScore: Number(p.homeScore) || 0,
        awayScore: Number(p.awayScore) || 0,
        startDown: n(p.start?.down),
        distance: n(p.start?.distance),
        endDown: n(p.end?.down),
        /* 🔴 THE DISTANCE AFTER THE PLAY, so a held view can state the next
         * down honestly instead of borrowing the live one. See held() in the
         * live screen: without this the delay leaks the result of the play it
         * is hiding. */
        endDistance: n(p.end?.distance),
        /* 🔴 THE FEED WRITES THE WHOLE SENTENCE AND WE WERE REBUILDING HALF OF
         * IT. Jason: "1st and 10 at SEA 32." — "Make it say that."
         *
         * ESPN ships `end.downDistanceText` already formatted: "2nd & 8 at SEA
         * 28". We were reading `end.down` and `end.distance` and composing "2nd
         * & 8" out of them, which is the same string minus the one part that
         * says WHERE — and the spot is half of what a down means. 1st & 10 on
         * your own 8 is a different proposition from 1st & 10 on their 32, and
         * the price model knows that even though the screen did not say it.
         *
         * 🔴 TAKE THE FEED'S OWN WORDS WHERE IT HAS THEM. Composing it ourselves
         * also meant owning the edge cases the league has and we do not - "1st &
         * Goal", a spot at the 50 that belongs to neither team. ESPN has written
         * that logic for thirty years; this is the same rule as 7.2, where
         * deriving the star from play text got the wrong player. */
        endSpotText: String(p.end?.downDistanceText || '') || null,
        /* WHERE THE BALL IS, AS A NUMBER. The spot text says "SEA 31" and a
         * person reads that instantly; nothing can DRAW from it, because "SEA
         * 31" is two different places depending on who has the ball. This is
         * yards to the defending end zone, which is unambiguous, and it is what
         * the field strip is built on. */
        endYardsToEndzone: n(p.end?.yardsToEndzone),
        startTeamId: p.start?.team?.id != null ? String(p.start.team.id) : null,
        endTeamId: p.end?.team?.id != null ? String(p.end.team.id) : null,
        statYardage: n(p.statYardage),
        /* 🔴 WHEN THE PLAY ACTUALLY HAPPENED. ESPN stamps every play with a
         * wallclock and this code went nine months without reading it - held()
         * carried a comment saying "the feed carries no per-play wall clock",
         * which was simply untrue and was never checked.
         *
         * It is the difference between a delay that MEANS 45 seconds and one
         * that means "45 seconds after we happened to hear about it". Held from
         * arrival, every bit of upstream lag stacks on top: ESPN's own delay,
         * the 12s poll, the push, the client's 5s poll. Held from the play's own
         * clock, the number on screen is the truth no matter how slow the
         * pipeline is - and the pipeline can be improved without changing what
         * the app promises. */
        wallclockMs: sanitizeWallclock(Date.parse(p.wallclock || '') || null, Date.now()),
        star: starOf(p.text || '', p.type?.text || '', team)
      });
      seen.add(String(p.id));
    }
  }
  return out;
}

/** The state a client renders, from one summary payload. */
/**
 * 🔴 A PLAY CANNOT HAVE HAPPENED IN THE FUTURE - SO A WALLCLOCK THAT SAYS IT
 * DID IS WRONG, AND ONLY ITS DATE IS.
 *
 * Found live on SF at LAR, 2026-09-10, six minutes in: the live screen showed
 * the scorebug and NOTHING else - no field, no call offer, no plays - and said
 * "holding 5 plays behind your 45s delay". ESPN's NFL core feed was stamping
 * every play a DAY ahead:
 *
 *     wallclock "2026-09-12T00:40:00Z"   modified "2026-09-11T00:40Z"
 *
 * Same time of day, date +1. College wallclocks on the same night were
 * correct. So held() saw six plays that had not happened yet and showed none,
 * and the poller measured a publish lag of -86,358 seconds. Upstream data,
 * faithfully parsed - which is why it has to be defended here.
 *
 * The correction is deliberately narrow. Only a wallclock more than five
 * minutes AHEAD of now is touched (a feed we are reading cannot report a play
 * from the future; five minutes absorbs clock skew), and it is moved back by
 * WHOLE DAYS, so the time of day - the part ESPN gets right, to the second -
 * survives. A wallclock in the past is never touched: a finished game and a
 * replay legitimately carry old timestamps.
 *
 * `now` is a parameter so the tests can pin it; the parser calls it with
 * Date.now() because it has no clock of its own to pass.
 */
export function sanitizeWallclock(ms: number | null, now: number): number | null {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return ms;
  if (typeof now !== 'number' || !Number.isFinite(now)) return ms;
  const DAY = 24 * 60 * 60 * 1000;
  const ahead = ms - now;
  if (ahead <= 5 * 60 * 1000) return ms;
  const days = Math.round(ahead / DAY);
  return days >= 1 ? ms - days * DAY : ms;
}

export function readLive(summary: any, gameId: string, sport: Sport, now: number): LiveState {
  const header = summary?.header || {};
  const comp = (header.competitions || [])[0] || {};
  const cs = comp.competitors || [];
  const home = cs.find((c: any) => c.homeAway === 'home') || cs[0] || {};
  const away = cs.find((c: any) => c.homeAway === 'away') || cs[1] || {};

  const teams: LiveState['teams'] = {};
  for (const c of cs) {
    const t = c.team || {};
    const col = (v: unknown) => {
      const s = typeof v === 'string' ? v.replace('#', '').toLowerCase() : '';
      return /^[0-9a-f]{6}$/.test(s) && s !== '000000' ? s : null;
    };
    teams[String(t.id)] = {
      abbrev: t.abbreviation || '', name: t.displayName || '',
      short: t.shortDisplayName || t.name || '',
      /* The nickname - "Sun Devils", "Hurricanes", "49ers". ESPN's `name`.
         Jason, 2026-09-10: the question says "Do they..." and should say the
         team. The nickname is what a person watching actually calls them;
         it cannot be recovered from displayName minus shortDisplayName, which
         breaks on "Arizona State Sun Devils" vs "Arizona St". */
      nick: t.name || '',
      primary: col(t.color), secondary: col(t.alternateColor)
    };
  }

  const plays = readPlays(summary);
  const last = plays[plays.length - 1] || null;
  const st = comp.status?.type?.name || '';
  const status: LiveState['status'] =
    st === 'STATUS_SCHEDULED' ? 'pre'
    : /FINAL/.test(st) ? 'final'
    : 'live';

  /* The situation is read from ESPN's own `situation` where it exists, because
   * that is the pre-snap state of the NEXT play - which is the thing being
   * called. Falling back to the last play's own start would describe a snap that
   * has already happened. */
  const sit = summary?.situation || comp.situation || null;
  const offenseTeamId = String(sit?.lastPlay?.team?.id ?? last?.offenseTeamId ?? '');

  const situation: LiveSituation | null = last ? {
    playId: last.id,
    driveId: last.driveId,
    offenseTeamId,
    quarter: last.quarter,
    clock: last.clock,
    down: sit?.down ?? null,
    distance: sit?.distance ?? null,
    yardsToGoal: sit?.yardLine == null ? null : Number(sit.yardLine),
    downDistanceText: sit?.downDistanceText ?? null,
    spotText: sit?.possessionText ?? null,
    homeScore: last.homeScore,
    awayScore: last.awayScore,
    lastPlayText: last.text,
    lastPlayKind: last.kind
  } : null;

  return {
    gameId, sport, status,
    homeTeamId: String(home.team?.id ?? ''),
    awayTeamId: String(away.team?.id ?? ''),
    teams,
    homeScore: Number(home.score) || 0,
    awayScore: Number(away.score) || 0,
    kickoffUtc: Date.parse(comp.date || header.competitions?.[0]?.date || '') || null,
    venue: comp.venue?.fullName || summary?.gameInfo?.venue?.fullName || null,
    broadcast: (comp.broadcasts || [])[0]?.media?.shortName
      || (comp.broadcasts || [])[0]?.names?.[0] || null,
    plays,
    drives: readDrives(summary),
    situation,
    offers: status === 'live' && offenseTeamId ? priceFrom(plays, offenseTeamId) : null,
    fetchedAt: now
  };
}

/**
 * 🔴 ONE CALL PER SNAP, and the snap is the NEXT play id - which does not exist
 * yet when the call is made. So a call is keyed on the play it was made AFTER,
 * and settles against whatever follows it. That is requirement 7.4 expressed
 * against a retrospective feed.
 */
export function settleAgainst(call: { afterPlayId: string; side: 'run' | 'pass' }, plays: LivePlay[]) {
  const i = plays.findIndex((p) => p.id === call.afterPlayId);
  if (i < 0 || i + 1 >= plays.length) return { settled: false as const };
  const next = plays[i + 1];
  if (next.kind === 'other') {
    /* The one void path, in the live layer: the offense never chose. */
    return { settled: true as const, landed: null, play: next };
  }
  return { settled: true as const, landed: next.kind === call.side, play: next };
}

export { parseSlate };
