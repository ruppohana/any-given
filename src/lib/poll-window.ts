/* 🔴 WHEN A GAME DESERVES A POLLER. ONE RULE, ONE PLACE.
 *
 * This was written twice within ten minutes - once in slate-cron.ts to decide
 * which games the cron starts, and once in worker.ts to decide whether
 * /api/poller/ensure will honour a request. Two copies of one number is the
 * duplicate-rule bug this repo has already paid for in CSS selectors and in
 * feed-lag arithmetic, and it is worse here: the two copies decide the same
 * question from opposite directions, so a change to one produces a cron that
 * starts pollers the API then refuses to acknowledge.
 *
 * 🔴 THE WINDOW OPENS BEFORE KICKOFF, AND THAT IS THE WHOLE POINT. The
 * original rule was `status === 'in_progress'`, which sounds obviously right
 * and is not: the cron runs every ten minutes, so a game that kicked at 5:00
 * could have no poller until 5:10. Ten minutes of a live game with no feed,
 * on a product whose premise is being a few seconds behind the television.
 *
 * PRE_KICK_MS is wider than the cron interval on purpose. At fifteen minutes
 * against a ten-minute cron, at least one run must see every game before it
 * kicks, so the gap closes rather than merely narrowing. The cost is about
 * thirty polls of an empty play list, and the Durable Object stops itself ten
 * minutes past final, so an early start is bounded at both ends.
 *
 * 🔴 AND STATUS IS NOT TRUSTED WHERE THE CLOCK WILL DO. The stored slate is up
 * to ten minutes stale, so `status` can still say `scheduled` for a game that
 * genuinely kicked - which is exactly when somebody opens the app and finds
 * the feed dead. The KICKOFF TIME does not go stale: it is known days ahead
 * and does not move minute to minute. So the clock decides, and only `final`
 * is taken as a refusal, because that is the one state a stale slate cannot
 * be wrong about in the direction that costs anything.
 */
export const PRE_KICK_MS = 15 * 60 * 1000;

/** Past this we stop assuming a game is still going. A football game is
 *  about three and a half hours; six is generous enough for a weather delay
 *  and short enough that a stuck record does not poll for a week. */
export const MAX_GAME_MS = 6 * 60 * 60 * 1000;

export type PollDecision = { poll: boolean; why: string };

export function pollDecision(
  game: { status?: string; kickoffUtc?: number | null } | null | undefined,
  now: number,
): PollDecision {
  if (!game) return { poll: false, why: 'no game by that id on any slate' };
  if (game.status === 'final') return { poll: false, why: 'that game is final' };
  if (game.status === 'in_progress') return { poll: true, why: 'in progress' };
  /* 🔴 `Number(null)` IS 0, AND 0 IS FINITE. A missing kickoff coerced to the
   * epoch and sailed through Number.isFinite, so a game with no kickoff time
   * was judged to have kicked off in 1970 and reported "long over" - a
   * confident, specific, wrong answer. Fourth time this repo has been bitten
   * by a falsy value that is also a valid one; the fix is the same every
   * time, which is to test for the ABSENCE explicitly rather than leaning on
   * a coercion to reveal it. */
  const raw = game.kickoffUtc;
  if (raw === null || raw === undefined || raw === '') {
    return { poll: false, why: 'no kickoff time on that game' };
  }
  const kick = Number(raw);
  if (!Number.isFinite(kick)) return { poll: false, why: 'no kickoff time on that game' };
  if (now >= kick + MAX_GAME_MS) return { poll: false, why: 'that game is long over' };
  if (now >= kick - PRE_KICK_MS) return { poll: true, why: 'kicking off' };
  return { poll: false, why: 'that game has not kicked off yet' };
}

/** The same question, as a boolean, for callers that do not need the reason. */
export function shouldPoll(game: any, now: number): boolean {
  return pollDecision(game, now).poll;
}
