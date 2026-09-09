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
  teams: Record<string, { abbrev: string; name: string; short: string; primary: string | null; secondary: string | null }>;
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
  kind: PlayKind;
  scoringPlay: boolean;
  homeScore: number;
  awayScore: number;
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
 *  work out. `current` is the one still running, so it is never `ended`. */
export function readDrives(summary: any): LiveDrive[] {
  const drives = summary?.drives || {};
  const out: LiveDrive[] = [];
  for (const d of drives.previous || []) {
    out.push({
      id: String(d?.id ?? ''),
      offenseTeamId: String(d?.team?.id ?? ''),
      result: String(d?.result || d?.displayResult || '').toUpperCase(),
      ended: true
    });
  }
  if (drives.current) {
    out.push({
      id: String(drives.current?.id ?? ''),
      offenseTeamId: String(drives.current?.team?.id ?? ''),
      result: '',
      ended: false
    });
  }
  return out;
}

/** Flatten ESPN's drive/play tree into the order a game was played in. */
export function readPlays(summary: any): LivePlay[] {
  const out: LivePlay[] = [];
  const drives = summary?.drives || {};
  const all = [...(drives.previous || []), ...(drives.current ? [drives.current] : [])];
  for (const d of all) {
    const team = String(d?.team?.id ?? '');
    for (const p of d?.plays || []) {
      out.push({
        id: String(p.id),
        driveId: String(d.id ?? ''),
        offenseTeamId: team,
        quarter: Number(p.period?.number) || 0,
        clock: p.clock?.displayValue || '',
        text: p.text || '',
        kind: classify(p.text || '', p.type?.text || ''),
        scoringPlay: !!p.scoringPlay,
        homeScore: Number(p.homeScore) || 0,
        awayScore: Number(p.awayScore) || 0
      });
    }
  }
  return out;
}

/** The state a client renders, from one summary payload. */
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
