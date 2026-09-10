/* P6 - ALL GAMES. The week's market board: every game, every market that game
 * has the data to offer, priced before the tap.
 *
 * WHAT IT IS NOT, because three screens in this app look like lists of games and
 * confusing them is the recorded way this product goes wrong:
 *
 *   P2 the slate      ONE decision per game - who covers, or who wins. It is a
 *                     CARD you fill in, scored as a card, and it is where the
 *                     group pool lives.
 *   live-game         the snap-by-snap layer. One question at a time, 20 seconds
 *                     to answer it, and it only exists while a game is running.
 *   THIS SCREEN       the whole board on every game at once, each market staked
 *                     independently, settled independently. No card, no pool, no
 *                     clock pressure. You can stake one market on one game and
 *                     nothing else all week.
 *
 * BAR (opened, not read about):
 *
 *   reference/sofascore-teardown/screens/IMG_5218.PNG
 *   Sofascore's pre-game detail, and its "Full-time" market card is the thing
 *   this screen is written against - four failures on one 200px card:
 *
 *   1. THE TWO TILES ARE LABELLED `1` AND `2`. Not the teams. The crests are
 *      120px above, in a header that scrolls away, so the tile you are about to
 *      tap names nobody. Ours puts the team on the tile.
 *
 *   2. THE PRICE IS `+475` / `-834`. That is the price, it is there before the
 *      tap, and it is in a notation you have to already know how to read. "Price
 *      before the tap" is not satisfied by printing a number - it is satisfied by
 *      printing what you get. `+475` is `5.75×`, and one of those two needs no
 *      teaching. This screen converts every price it is given.
 *
 *   3. ONE MARKET. `Full-time` and nothing else, on a screen with room for six.
 *      The total is posted in the same feed and is not offered.
 *
 *   4. `Football, USA, Regular season, Week 1` IS THE FIRST CARD ON THE PAGE -
 *      the repeated competition header P2 already records as Sofascore's most
 *      expensive habit, here paid for once per fixture at full card height.
 *
 * 🔴 WHAT THIS SCREEN MAY NOT DECIDE, and does not: which markets exist or how
 * they settle (src/markets.js), what a line is (the feed), or the stake ladder
 * (the house). It decides ONE thing - what a market is worth to you before you
 * tap it - and everything else is read.
 *
 * 🔴 AND IT NEVER NAMES A BOOK. `spreadProvider` is right there on every game in
 * the payload and it is not rendered anywhere on this screen, deliberately. The
 * number is attributed to "the public feed" in the footnote and to nothing else.
 */
import { teamChip, TEAM_CHIP_CSS, applyTeamVars } from '/components/team-chip.js';
import { stateBlock, STATES_CSS } from '/components/states.js';
import { pageHeader } from '/components/header.js';
/* 🔴 THE MARKETS ARE NOT THIS FILE'S TO INVENT. Another piece owns the catalogue
 * and the settlement, exactly as src/catalog.ts owns the live layer's. A screen
 * that reimplemented "what a first-half spread means" would be a second opinion
 * about settlement living in the presentation layer, which is how two halves of
 * one app come to disagree about whether you won. */
import { GAME_MARKETS, settleMarket } from '/src/markets.js';
import { priceMarket, marketIsOpen, MIN_PRICE, trueCeiling, MAX_PRICE,
  gameWinnerProbs, priceFromP } from '/src/lib/price-model.js';
/* 🔴 IMPORTED, NOT TYPED. The first version of the line below said "Up to
   250x" as a literal, under a comment claiming it was read from the engine -
   which is the worst of both, because the comment tells the next reader the
   number is safe to leave alone while the number is free to drift away from
   the resolver that actually pays it. */
import { PARLAY_MAX_PAYOUT as PARLAY_CEILING } from '/src/lib/parlay-stake.js';

export const id = 'p6-allgames';
export const title = 'All games';
export const bar = 'reference/sofascore-teardown/screens/IMG_5218.PNG';

/* The five required states. There is no `ready-short` twin here: unlike P2 this
 * screen has exactly one data route - the captured weekly slate - so a second
 * ready route would have to be built out of something invented. */
export const states = ['ready', 'empty', 'loading', 'offline', 'error'];

/* ------------------------------------------------------------------ pure helpers
 * Nothing below this line touches the DOM or an imported binding, so a test can
 * load this module with its import lines stripped and exercise it in Node. Where
 * a helper needs the market catalogue it takes it as an argument. */

/** The house numbers. Same three steps as the live layer's ladder and the same
 *  cap, because a marble is a marble wherever it is staked. */
export const STAKES = [5, 10, 25];
export const DEFAULT_STAKE = 5;
export const MAX_PAYOUT = 6;

/** 🔴 THE BALANCE IS CALLED MARBLES. Never credits, never coins, never chips,
 *  and never a currency symbol. Written once, read everywhere in this file. */
export const BALANCE_NOUN = 'Marbles';

/** The season the captured slate is keyed under. */
export const SEASON = 2026;

/**
 * 🔴 VALIDITY, NEVER TRUTHINESS. This app shipped "-1 & 10" and "0 yards to the
 * end zone" in one night out of `if (yards)`, and every number on this screen is
 * one that can legitimately be zero: a pick'em spread IS 0, a scoreless team's
 * score IS 0, and an even moneyline is the one value that is genuinely invalid.
 * So there is one predicate and everything asks it.
 */
export function num(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Does this game carry the line a market needs? A market with no line is never
 *  offered - see marketsFor. */
export function hasLine(game, needsLine) {
  if (!needsLine) return true;
  if (needsLine === 'spread') return num(game && game.spread);
  if (needsLine === 'total') return num(game && game.total);
  /* An unrecognised requirement is a requirement we cannot prove is met, so the
   * market is withheld rather than offered on a guess. */
  return false;
}

/**
 * The markets this ONE game can actually offer.
 *
 * 🔴 A MARKET WITH NO LINE IS NOT OFFERED, AND IT IS NEVER PRICED BY US. That is
 * the same rule the poller applies going the other way - "absent stays absent, a
 * market with no line is a market we do not offer, never one we price ourselves
 * and attribute to a book". A total we invented would look exactly like a total
 * a market posted, and nothing on the card could tell them apart.
 */
export function marketsFor(game, list, now = Date.now(), sport = chosenSport()) {
  const all = Array.isArray(list) ? list : [];
  return all.filter((m) => {
    if (!m || !m.id || !Array.isArray(m.choices) || !m.choices.length) return false;
    if (!hasLine(game, m.needsLine)) return false;
    /* 🔴 A MARKET CLOSES ON ITS OWN CLOCK, NOT THE GAME'S. Jason: "So I can
       only bet on who wins the second half until kick?" He could, and it was
       wrong. See marketIsOpen. */
    if (!marketIsOpen(game, m, now)) return false;
    /* 🔴 AND ONE THE MODEL WILL NOT PRICE IS NOT DRAWN. A market whose
       outcomes fall outside the price band is a formality rather than a
       proposition - see priceMarket. */
    if (m.needsLine) return true;
    /* 🔴 THE MONEYLINE OBEYS THE SAME BAND, and this was a hole. The floor
       lived in the model, so it guarded the halves and the quarters and let
       the WINNER market through - the one market priced from a real book.
       Caught by building an actual parlay and finding NC State at 1.02x on
       the slip: not a bet, a rounding error with a tap target, sitting inside
       a six-leg parlay contributing nothing but a way to lose it. A tile is
       either worth taking or it is not drawn, and where its number came from
       does not change that. */
    if (m.id === 'winner') return winnerInBand(game);
    return priceMarket(game, m, sport).offerable;
  });
}

/** Both sides of the moneyline inside the same band every other market obeys.
 *  No moneyline at all is fine - the market then prices at 2.00x both ways
 *  and says so honestly, which is a different thing from a 1.02x tile. */
export function winnerInBand(game) {
  const ceiling = trueCeiling(MAX_PRICE);
  const both = [game && game.moneylineHome, game && game.moneylineAway]
    .map(americanToDecimal);
  /* 🔴 NO MONEYLINE IS NOT EVEN MONEY. 18 of this week's 86 college games have
     none - books do not price a 59-point mismatch two ways - and the market
     was falling through to 2.00x a side, which says Miami and Florida A&M are
     equally likely. The spread is still there, so the model answers instead. */
  if (both.some((d) => d == null)) {
    if (!num(game && game.spread)) return true;      // no opinion at all: 2.00x is honest
    const p = gameWinnerProbs(game.spread, chosenSport());
    for (const v of [p.home, p.away]) {
      const t = 1 / v;
      if (t < MIN_PRICE || t > ceiling) return false;
    }
    return true;
  }
  for (const d of both) {
    if (d < MIN_PRICE || d > ceiling) return false;
  }
  return true;
}

/**
 * American odds -> decimal. `+150` is 2.50, `-200` is 1.50.
 *
 * 🔴 ZERO IS THE ONE INVALID VALUE and it is also what a missing field coerces
 * to, which is why this is guarded by `num()` and then by an explicit `!== 0`
 * rather than by a falsy check that would swallow both cases as one.
 */
export function americanToDecimal(ml) {
  if (!num(ml) || ml === 0) return null;
  return ml > 0 ? 1 + ml / 100 : 1 + 100 / Math.abs(ml);
}

/**
 * Which side of the game, if any, this choice is. Returns null for a choice that
 * is not about a team at all - Over, Under, Yes, No.
 *
 * 🔴 IT MATCHES ON IDENTITY, NOT ON PROSE. A choice whose id is the team id or
 * the literal 'home'/'away' is unambiguous. A label is matched only against the
 * abbreviation, exactly, because "Over" against a team called Overton is the
 * kind of substring accident that prices a total off a moneyline and never
 * errors.
 */
export function sideOfChoice(choice, ids) {
  if (!choice || !ids) return null;
  const cid = String(choice.id == null ? '' : choice.id).toLowerCase();
  const lab = String(choice.label == null ? '' : choice.label).trim().toLowerCase();
  const eq = (v) => v != null && String(v).toLowerCase();
  if (cid === 'home' || (eq(ids.home) && cid === eq(ids.home))) return 'home';
  if (cid === 'away' || (eq(ids.away) && cid === eq(ids.away))) return 'away';
  if (eq(ids.homeAbbrev) && (cid === eq(ids.homeAbbrev) || lab === eq(ids.homeAbbrev))) return 'home';
  if (eq(ids.awayAbbrev) && (cid === eq(ids.awayAbbrev) || lab === eq(ids.awayAbbrev))) return 'away';
  return null;
}

/**
 * WHAT THIS CHOICE PAYS PER MARBLE, as a multiple. Never null - every choice on
 * this screen shows a price before it is tapped, so there is no "price unknown"
 * branch for the card to fall into.
 *
 * 🔴 THREE RULES, IN THIS ORDER, AND THE ORDER IS THE ARGUMENT:
 *
 * 1. A MARKET WITH A POSTED LINE PAYS 2.00× BOTH SIDES. A line is the market's
 *    own estimate of the point where the two sides are equally likely - that is
 *    what a line is FOR. So p is 0.50 either way and stake/p is exactly 2.
 *    Varying it would be claiming we know better than the posted number about
 *    which side of itself it is wrong on. And it really is 2.00 rather than
 *    1.91, because we take no vig: nothing here is bought and nothing is
 *    redeemable, so there is no house to pay.
 *
 * 2. A WHOLE-GAME WINNER MARKET IS PRICED OFF THE MONEYLINE, converted. That is
 *    the one market the moneyline is a price FOR, and it is the only place on
 *    this screen where the two sides differ - which is the whole reason to take
 *    an underdog.
 *
 * 🔴 SCOPE IS CHECKED, NOT ASSUMED. A full-game moneyline does not price a
 *    first-quarter winner, and a market catalogue that grows a quarter-winner
 *    type would otherwise silently inherit the wrong number. Same failure shape
 *    as the NFL/college logo path: two ids that look interchangeable, one wrong
 *    answer, nothing errors.
 *
 * 3. EVERYTHING ELSE IS 2.00×, said plainly rather than hidden. A board where
 *    most rows are coin flips is a fact about the data we hold, not a reason to
 *    stop printing the number.
 *
 * The 6× cap is doctrine and is not a display choice - it is the reason a
 * 42-point mismatch is not offered at 60×.
 */
export function priceFor(game, market, choice, ids, sport = chosenSport()) {
  if (!market) return 2;
  if (market.needsLine) return 2;
  /* 🔴 RULE 4, AND IT IS NEW: EVERY MARKET WITHOUT A POSTED LINE IS PRICED BY
   * THE MODEL. Jason's screenshot was Miami -59.5, first half winner, three
   * tiles reading 2.00x / 2.00x / 2.00x - Miami, Florida A&M and Tie, which
   * between them claim a 150% probability. The board was not flat, it was
   * incoherent, and 91% of every tile in the app said 2.00x for this reason.
   *
   * The halves, the quarters, first to score and the margin have no line of
   * their own, so they were falling through to rule 3 and being called coin
   * flips. They are not: src/lib/price-model.ts pushes the posted spread
   * through time and prices them off it. Rules 1-3 below are unchanged, and
   * rule 1 is the one Jason confirmed himself - "Against the spread I get
   * even odds." Yes, and that is correct. */
  if (market.scope !== 'game' || market.id === 'margin' || market.id === 'first_to_score') {
    const priced = priceMarket(game, market, sport);
    const v = priced.prices[choice && choice.id];
    return num(v) ? v : 2;
  }
  const side = sideOfChoice(choice, ids);
  if (!side) return 2;
  const ml = side === 'home' ? (game && game.moneylineHome) : (game && game.moneylineAway);
  const d = americanToDecimal(ml);
  /* Rule 2a: no posted moneyline, but a posted spread. The model prices it
     rather than the board calling a 59-point mismatch a coin flip. */
  if (d == null) {
    if (!num(game && game.spread)) return 2;
    const p = gameWinnerProbs(game.spread, sport);
    const v = priceFromP(side === 'home' ? p.home : p.away, MAX_PAYOUT);
    return num(v) ? v : 2;
  }
  return Math.min(MAX_PAYOUT, Math.round(d * 100) / 100);
}

/** `1.85×`. Two decimals always - a board of 2× beside 1.85× reads as two
 *  different kinds of number, and they are the same kind. */
export function priceLabel(x) {
  return num(x) ? x.toFixed(2) + '\u00d7' : '\u2014';
}

/** What a stake comes back as, in whole marbles. Rounded once, here, so the
 *  card and the settlement line can never print two different answers. */
export function returnsOn(stake, price) {
  if (!num(stake) || !num(price)) return 0;
  return Math.round(stake * price);
}

/** The HOME number, ESPN's convention: negative means home is favored. Rendered
 *  from the named side's point of view so `SEA -3` is unambiguous. */
export function spreadText(spread, side) {
  if (!num(spread)) return null;
  const v = side === 'away' ? -spread : spread;
  if (v === 0) return 'PK';
  const a = Math.abs(v);
  return (v > 0 ? '+' : '\u2212') + (a % 1 === 0 ? String(a) : a.toFixed(1));
}

/** A game stops accepting stakes at kickoff, by the clock, and stays stopped.
 *  Status is checked as well as the clock because a feed can mark a game live
 *  before our idea of its kickoff, and it can mark one final after a delay. */
export function isLocked(game, now) {
  if (!game) return true;
  if (game.status === 'in_progress' || game.status === 'final') return true;
  return num(game.kickoffUtc) && num(now) && now >= game.kickoffUtc;
}

/* ---- grouping. ONE HEADER PER GROUP, NEVER ONE PER ROW - the whole layout, and
 * the thing the bar gets wrong once per fixture. Same shape as P2's, written out
 * here rather than imported: two screens importing each other's layout helpers
 * is a coupling neither of them asked for, and this app already duplicates
 * chosenSport() across three screens for the same reason. */

export const KICK_WINDOWS = [
  { key: 'morning', label: 'Morning', until: 12 },
  { key: 'afternoon', label: 'Afternoon', until: 16 },
  { key: 'evening', label: 'Evening', until: 19 },
  { key: 'night', label: 'Night', until: 24 }
];

export function windowOf(ms) {
  const h = new Date(ms).getHours();
  for (const w of KICK_WINDOWS) if (h < w.until) return w;
  return KICK_WINDOWS[KICK_WINDOWS.length - 1];
}

export function dayKeyOf(ms) {
  const d = new Date(ms);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
    + '-' + String(d.getDate()).padStart(2, '0');
}

export function dayLabel(ms) {
  return new Date(ms).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function timeLabel(ms) {
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** A day splits into kickoff windows only when it has more games than this. A
 *  Saturday with 71 games needs four headers; a Thursday with one does not, and
 *  giving it one is the per-row header arriving through the back door. */
export const WINDOW_SPLIT_MIN = 6;

export function groupsOf(games) {
  const days = new Map();
  for (const g of (games || []).slice().sort((a, b) => a.kickoffUtc - b.kickoffUtc)) {
    const dk = dayKeyOf(g.kickoffUtc);
    if (!days.has(dk)) days.set(dk, []);
    days.get(dk).push(g);
  }
  const out = [];
  for (const [dk, list] of days) {
    if (list.length <= WINDOW_SPLIT_MIN) {
      out.push({ key: dk, dayKey: dk, day: dayLabel(list[0].kickoffUtc), window: null,
                 first: list[0].kickoffUtc, games: list });
      continue;
    }
    const byWin = new Map();
    for (const g of list) {
      const w = windowOf(g.kickoffUtc);
      if (!byWin.has(w.key)) {
        byWin.set(w.key, { key: dk + '|' + w.key, dayKey: dk, day: dayLabel(g.kickoffUtc),
                           window: w.label, first: g.kickoffUtc, games: [] });
      }
      byWin.get(w.key).games.push(g);
    }
    for (const grp of byWin.values()) out.push(grp);
  }
  return out.sort((a, b) => a.first - b.first);
}

export function groupLabel(g) {
  return g.window ? g.day + ' \u00b7 ' + g.window : g.day;
}

/* ---- the store. `ag.allgames.<sport>.<week>` = { gameId: { marketId: { choice, stake } } } */

export function storeKey(sport, week) {
  return 'ag.allgames.' + sport + '.' + week;
}

/**
 * 🔴 EVERY STORED ROW IS RE-VALIDATED ON THE WAY IN. localStorage is the one
 * input to this screen that no server ever saw: it survives a deploy, it
 * survives a rewrite of the market catalogue, and a phone can be holding a
 * `{choice, stake}` for a market id that no longer exists or a stake of 500 from
 * a ladder that has changed. A stake read back unchecked is the app telling you
 * you risked something you did not.
 */
export function normalizeStore(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const gid of Object.keys(raw)) {
    const byMarket = raw[gid];
    if (!byMarket || typeof byMarket !== 'object') continue;
    const keep = {};
    for (const mid of Object.keys(byMarket)) {
      const p = byMarket[mid];
      if (!p || typeof p !== 'object') continue;
      if (p.choice == null || p.choice === '') continue;
      const stake = STAKES.indexOf(p.stake) >= 0 ? p.stake : DEFAULT_STAKE;
      keep[mid] = { choice: String(p.choice), stake };
    }
    if (Object.keys(keep).length) out[gid] = keep;
  }
  return out;
}

/** How many markets are staked, and how many marbles are on them. Counted over
 *  the games ACTUALLY ON THE CARD, so a stake on a game that has left the slate
 *  is not reported as live. */
export function stakedSummary(games, store) {
  let picks = 0, marbles = 0;
  for (const g of games || []) {
    const byMarket = (store || {})[g.id];
    if (!byMarket) continue;
    for (const mid of Object.keys(byMarket)) {
      picks++;
      marbles += byMarket[mid].stake || 0;
    }
  }
  return { picks, marbles };
}

/** The stake ladder position for one game. Stored per PICK by the frozen shape,
 *  so the game's current step is read back off its most recent pick and falls to
 *  the default when it has none. */
export function stakeForGame(store, gameId) {
  const byMarket = (store || {})[gameId];
  if (!byMarket) return DEFAULT_STAKE;
  const keys = Object.keys(byMarket);
  if (!keys.length) return DEFAULT_STAKE;
  const s = byMarket[keys[keys.length - 1]].stake;
  return STAKES.indexOf(s) >= 0 ? s : DEFAULT_STAKE;
}

/* ------------------------------------------------------------------ preview data */

/** 🔴 THE SPORT IS THE ONE THE USER CHOSE, off the same key the sport gate
 *  writes and the live board, the slate, my picks and the standings all read. A
 *  choice that does not reach every screen is not a choice, it is a preference
 *  one screen keeps to itself - which is how the NFL slate came to be college. */
export function chosenSport() {
  try {
    const v = JSON.parse(localStorage.getItem('ag.sport'));
    return v === 'nfl' ? 'nfl' : 'college-football';
  } catch { return 'college-football'; }
}

/** The week, if something has set one. Guarded on VALUE rather than on presence:
 *  `Number(null)` and `Number('')` are both 0, and week 0 does not exist. */
export function chosenWeek() {
  try {
    const n = Number(JSON.parse(localStorage.getItem('ag.week')));
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
  } catch { return 1; }
}

function loadStore(sport, week) {
  try { return normalizeStore(JSON.parse(localStorage.getItem(storeKey(sport, week)))); }
  catch { return {}; }
}

function saveStore(sport, week, store) {
  try { localStorage.setItem(storeKey(sport, week), JSON.stringify(normalizeStore(store))); }
  catch { /* a private window is allowed to forget */ }
}

/**
 * ONE FETCH, and it is the already-captured weekly slate.
 *
 * 🔴 THERE IS NO FALLBACK AND THAT IS THE POINT. P2 can fall back to real team
 * identities in synthetic pairings because a fixture is still a fixture with a
 * made-up kickoff on it. A MARKET cannot: the whole content of this screen is
 * lines and prices, so a generated route would be a board of invented numbers
 * set in the same type as captured ones, with nothing on the card able to tell
 * them apart. When the feed has nothing, this screen says so.
 */
/**
 * WHICH WEEK IS ACTUALLY ON. The cron writes this pointer every ten minutes
 * from ESPN's own answer; the passed fallback stands only if it cannot be
 * read.
 *
 * 🔴 IT IS EXPORTED BECAUSE THE ANSWER HAS TO REACH THE STORAGE KEY, and it
 * did not. This resolution used to live inside fetchSlate and never leave it:
 * the fetch quietly corrected week 1 to week 2 and returned the right games,
 * while every caller went on using chosenWeek() - still 1 - to build its
 * localStorage key.
 *
 * So the All games board was showing week 2 and filing its stakes under
 * week 1, and the parlay slip did the same. Nothing looked wrong, because
 * one wrong key is indistinguishable from an empty one: your stakes simply
 * are not there, and the screen draws a perfectly good empty state. Caught by
 * placing a real parlay and finding it saved to `ag.parlay.college-football.1`
 * against a week-2 board.
 */
export async function resolveWeek(sport, fallback) {
  try {
    const cur = await fetch(`/api/state/slate:${sport}:current`);
    if (cur.ok) {
      const n = Number(await cur.text());
      if (Number.isInteger(n) && n >= 1 && n <= 22) return n;
    }
  } catch { /* the stored or default week stands */ }
  return fallback;
}

export async function fetchSlate(sport, week, byId) {
  const wk = await resolveWeek(sport, week);
  const res = await fetch(`/api/state/slate:${sport}:${SEASON}:${wk}`);
  if (!res.ok) throw new Error('slate ' + res.status);
  const d = await res.json();
  const games = Array.isArray(d && d.games) ? d.games : [];
  return games.map((g) => {
    /* Identity travels WITH the game - the shipped team file is a snapshot and
     * the feed is not. It is the fallback for what the payload omits, never the
     * other way round. */
    /* 🔴 `league` COMES WITH THE TEAM. logoUrl falls back to college when it
       is not told, which is right for the shipped 760-school fixture and
       wrong for anything live - NFL 17 is New England and college 17 is
       Claremont-Mudd-Scripps, so an unstamped NFL team draws a real crest
       for a real team and nothing errors. */
    for (const t of g.teams || []) {
      if (t && t.id) byId[t.id] = { ...(byId[t.id] || {}), ...t, league: sport };
    }
    return {
      id: String(g.id),
      shortName: g.shortName || null,
      kickoffUtc: g.kickoffUtc,
      status: g.status === 'final' ? 'final' : g.status === 'in_progress' ? 'in_progress' : 'scheduled',
      /* 🔴 THE PERIOD TRAVELS OR THE CLOSE RULE CANNOT WORK. marketIsOpen gates
         a Q4 market on whether the game has reached Q4, and this mapper was
         dropping the field the capture had just started writing - so every
         in-play market read as shut on a live game. The two changes were made
         an hour apart and only the first one was visible. */
      period: num(g.period) ? g.period : null,
      clock: g.clock || null,
      home: byId[g.homeTeamId] || null,
      away: byId[g.awayTeamId] || null,
      homeTeamId: g.homeTeamId, awayTeamId: g.awayTeamId,
      homeScore: num(g.homeScore) ? g.homeScore : null,
      awayScore: num(g.awayScore) ? g.awayScore : null,
      spread: num(g.spread) ? g.spread : null,
      total: num(g.total) ? g.total : null,
      moneylineHome: num(g.moneylineHome) ? g.moneylineHome : null,
      moneylineAway: num(g.moneylineAway) ? g.moneylineAway : null,
      broadcast: g.broadcast || null,
      venue: g.venue || null
    };
  }).filter((g) => g.home && g.away && num(g.kickoffUtc));
}

export async function previewData(fixtures, state) {
  const sport = chosenSport();
  const week = await resolveWeek(chosenSport(), chosenWeek());
  const store = loadStore(sport, week);

  /* The four non-ready routes draw a state block over a header. Fetching for
   * them would be a request whose answer is discarded, and on the `offline`
   * route it would be a request that contradicts the screen it is drawing. */
  if (state && state !== 'ready') {
    return { now: Date.now(), sport, week, games: [], store, markets: GAME_MARKETS || [] };
  }

  const byId = {};
  const db = fixtures && fixtures.teams && fixtures.teams.teams;
  if (db) for (const k of Object.keys(db)) byId[db[k].id] = db[k];

  let games = [];
  try { games = await fetchSlate(sport, week, byId); } catch { games = []; }

  return { now: Date.now(), sport, week, games, store, markets: GAME_MARKETS || [] };
}

/* ------------------------------------------------------------------ render */

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function cssEsc(s) { return String(s).replace(/["\\]/g, '\\$&'); }

/**
 * 🔴 THE SETTLEMENT IS ASKED FOR, NEVER COMPUTED HERE, and the call is wrapped
 * because it is the one thing on this screen that belongs to another module.
 *
 * A throw, a missing export or an unexpected return shape all mean the same
 * thing to the person reading the card - nobody has told us how this settled -
 * and all three resolve to `{ landed: null }`, which the card already knows how
 * to draw. A screen that dies because a settlement helper changed its mind about
 * its arguments takes the whole week's board with it.
 *
 * ⚠ THE ARGUMENT ORDER IS THE HOUSE ONE - `settle(typeId, choice, subject)`, as
 * src/catalog.ts has taken it since it was written. If markets.js lands on a
 * different signature, THIS IS THE ONE LINE THAT CHANGES.
 */
function settlementFor(game, market, pick) {
  if (!game || game.status !== 'final' || !pick) return null;
  try {
    const r = settleMarket(market.id, pick.choice, game);
    if (r && typeof r === 'object' && 'landed' in r) return r;
    return { landed: null };
  } catch {
    return { landed: null };
  }
}

/** The team half of the matchup line. The chip carries the crest and the
 *  abbreviation; the name is beside it for anyone who does not know the crest. */
function teamBlock(ctx, game, side) {
  const team = game[side];
  const b = el('div', 'p6a-team');
  b.dataset.side = side;
  /* --team-a / --team-b, PER ELEMENT. Never at :root - this screen can be 131
   * games and ~260 teams on one scroll. */
  applyTeamVars(b, team);
  b.appendChild(teamChip(team, {
    size: 26,
    league: ctx.sport === 'nfl' ? 'nfl' : 'college-football',
    adjacentTo: game[side === 'home' ? 'away' : 'home']
  }));
  b.appendChild(el('span', 'p6a-tname', (team && (team.short || team.name)) || '\u2014'));
  const sc = side === 'home' ? game.homeScore : game.awayScore;
  if (num(sc)) b.appendChild(el('span', 'p6a-tsc num', String(sc)));
  return b;
}

/**
 * What the market header says under its own name: the number this market is
 * about, from the feed, unattributed to any book.
 *
 * 🔴 A FULL-GAME NUMBER DESCRIBES A FULL-GAME MARKET AND NOTHING ELSE. Found by
 * looking at the rendered card: a `1st half spread` market keyed off
 * `needsLine: 'spread'` was drawing `LAR -3.5` in its header - the FULL GAME
 * line, printed under a half-time heading, in the same type as a real one.
 *
 * The market is still offered, because the catalogue says that line is what it
 * keys off and the catalogue is not this screen's to overrule. What this screen
 * must not do is assert a half-time number we were never given. Same gate as
 * the price, for the same reason, and the two now agree.
 */
/**
 * THE LINE THIS MARKET IS ACTUALLY SETTLED AGAINST.
 *
 * 🔴 IT WAS PRINTING THE GAME TOTAL ON EVERY TOTALS MARKET, AND THREE OF THEM
 * DO NOT USE IT. Found on the deployed board: Florida A&M at Miami showed
 * `HOME TEAM TOTAL 65.5` and `AWAY TEAM TOTAL 65.5`, the same number twice,
 * and 65.5 is the whole game. markets.ts settles a team total against
 * `total/2 -/+ spread/2` - so the real lines were Miami 62.5 and Florida A&M
 * 3.0, and the card was telling you neither.
 *
 * That is worse than a missing line. The half totals had the same fault: the
 * card said 65.5 where settlement uses 32.75. A tile that names the wrong
 * number is a tile that settles you against something you never saw, which is
 * the one promise this product makes - the price AND the line are on the tile
 * before the tap, not just the price.
 *
 * 🔴 THE DERIVATIONS ARE markets.ts's, RESTATED NOWHERE. Each branch below
 * mirrors one settlement case, and the comment names it, so a change there
 * that is not made here is visible as a disagreement rather than silent.
 */
export function lineNote(game, market) {
  if (!market || !market.needsLine) return null;
  if (market.needsLine === 'spread') {
    if (market.scope !== 'game') return null;
    const h = (game.home && game.home.abbrev) || 'HOME';
    return h + ' ' + spreadText(game.spread, 'home');
  }
  if (!num(game.total)) return null;

  /* case 'team_total_home' / 'team_total_away': the posted total split by the
     posted spread. NOT rounded - halving a .5 total gives a .25 line, which is
     a real line and cannot push. */
  if (market.id === 'team_total_home' || market.id === 'team_total_away') {
    if (!num(game.spread)) return null;
    const home = market.id === 'team_total_home';
    const side = home ? game.home : game.away;
    const line = home ? game.total / 2 - game.spread / 2 : game.total / 2 + game.spread / 2;
    return ((side && side.abbrev) || (home ? 'HOME' : 'AWAY')) + ' ' + line;
  }

  /* case 'h1_total' / 'h2_total': the posted total halved and rounded to the
     nearest 0.5. A derived line, and the settlement text says so every time -
     so this says so too rather than presenting it as posted. */
  if (market.scope === 'half') {
    return String(Math.round((game.total / 2) * 2) / 2) + ' (half of ' + game.total + ')';
  }

  if (market.scope === 'game') return String(game.total);
  return null;
}

/**
 * 🔴 THE TILE NAMES THE TEAM. This is the bar's first failure and the only
 * reason that screenshot is the bar.
 *
 * Sofascore's market tiles are labelled `1` and `2`. The crests are 120px above
 * in a header that scrolls away, so at the moment of the tap the tile you are
 * touching names nobody, and you are relying on a convention you had to learn
 * somewhere else. Rendering a catalogue's `Home` / `Away` verbatim is the same
 * failure in English - and the first render of this screen did exactly that,
 * which is why this function exists and was not designed in.
 *
 * A choice that is a SIDE is drawn as that team. A choice that is not - Over,
 * Under, Tie - keeps the catalogue's own word, because there is no team in the
 * question and inventing one would be worse than the generic label.
 */
export function choiceLabel(game, choice, ids) {
  const given = String(choice.label == null ? choice.id : choice.label);
  const side = sideOfChoice(choice, ids);
  if (!side) return given;
  const t = game[side];
  return (t && (t.short || t.abbrev || t.name)) || given;
}

/** ONE CHOICE. A real 56px target with the price already on it - the bar's whole
 *  failure in one element, fixed: the team is named on the tile, and the number
 *  is what you get rather than what a book writes. */
function choiceButton(ctx, game, market, choice) {
  const pick = ctx.pickFor(game.id, market.id);
  const mine = !!(pick && pick.choice === String(choice.id));
  const price = priceFor(game, market, choice, ctx.idsFor(game));

  const b = el('button', 'p6a-choice');
  b.type = 'button';
  b.dataset.choice = String(choice.id);

  /* A choice that IS a team wears that team's colors - scoped to this button and
   * nowhere else. A choice that is Over or Under wears none, which is correct:
   * there is no team in the question. */
  const ids = ctx.idsFor(game);
  const side = sideOfChoice(choice, ids);
  if (side) applyTeamVars(b, game[side]);

  const name = choiceLabel(game, choice, ids);
  b.appendChild(el('span', 'p6a-c-l', name));

  /* THE NUMBER THIS SIDE IS TAKING, on the tile rather than only in the header.
   * `Away 2.00x` does not say what is being decided; `49ers +3.5 2.00x` does.
   * Game scope only - see lineNote for why a half market gets no number. */
  if (side && market.scope === 'game' && market.needsLine === 'spread') {
    b.appendChild(el('span', 'p6a-c-n num', spreadText(game.spread, side)));
  }

  /* 🔴 THE PRICE IS ON EVERY CHOICE, BEFORE THE TAP, ALWAYS. There is no branch
   * of this function that omits it - that is the product, and a card that hides
   * it has failed whatever else it got right. */
  b.appendChild(el('span', 'p6a-c-x num', priceLabel(price)));

  /* And what it is worth to YOU, at the stake this game is set to. The multiple
   * is the price; this is the sentence the multiple is short for, and it moves
   * when the ladder moves. */
  const stake = ctx.stakeFor(game.id);
  b.appendChild(el('span', 'p6a-c-r num',
    stake + ' \u2192 ' + returnsOn(stake, price)));

  if (mine) b.dataset.staked = 'on';
  b.setAttribute('aria-pressed', String(mine));

  const locked = isLocked(game, ctx.now);
  b.disabled = locked;
  b.setAttribute('aria-label',
    name + ' at ' + priceLabel(price)
    + ' \u00b7 ' + stake + ' ' + BALANCE_NOUN + (locked ? ' \u2013 closed' : ''));
  if (!locked) b.addEventListener('click', () => ctx.onStake(game.id, market.id, String(choice.id)));
  return b;
}

/** How one staked market came out. */
function verdict(game, market, pick) {
  const s = settlementFor(game, market, pick);
  if (!s) return null;
  const price = pick.price;
  const p = el('p', 'p6a-verdict');
  if (s.landed === true) {
    p.dataset.result = 'won';
    p.textContent = 'Won \u00b7 ' + returnsOn(pick.stake, price) + ' ' + BALANCE_NOUN + ' back';
    return p;
  }
  if (s.landed === false) {
    p.dataset.result = 'lost';
    p.textContent = 'Lost \u00b7 ' + pick.stake + ' ' + BALANCE_NOUN;
    return p;
  }
  /* 🔴 NULL IS NOT A LOSS AND MUST NEVER BE DRAWN AS ONE. The weekly slate
   * carries a final score and no play list, so every half and quarter market on
   * it comes back unsettled - not because the pick was wrong but because this
   * screen's data cannot answer the question. Painting that red would be the app
   * taking marbles for a question it never graded. */
  p.dataset.result = 'void';
  p.textContent = 'Not settled here \u00b7 this week\u2019s slate carries the final score, not the plays';
  return p;
}

/** ONE MARKET on one game: its name, its number, its choices. */
function marketBlock(ctx, game, market) {
  const sec = el('section', 'p6a-mkt');
  sec.dataset.market = market.id;
  sec.dataset.scope = market.scope || 'game';

  const h = el('div', 'p6a-mkt-h');
  h.appendChild(el('span', 'p6a-mkt-l', market.label || market.id));
  const note = lineNote(game, market);
  if (note) h.appendChild(el('span', 'p6a-mkt-n num', note));
  sec.appendChild(h);

  const wrap = el('div', 'p6a-choices');
  /* Two choices sit side by side; three or more wrap into as many columns as fit
   * without ever pushing the card past 393px. */
  wrap.dataset.n = market.choices.length === 2 ? '2' : 'many';
  for (const c of market.choices) wrap.appendChild(choiceButton(ctx, game, market, c));
  sec.appendChild(wrap);

  const pick = ctx.pickFor(game.id, market.id);
  if (pick && game.status === 'final') {
    const chosen = market.choices.find((c) => String(c.id) === pick.choice);
    const v = verdict(game, market, {
      stake: pick.stake,
      choice: pick.choice,
      price: priceFor(game, market, chosen || { id: pick.choice }, ctx.idsFor(game))
    });
    if (v) sec.appendChild(v);
  }
  return sec;
}

/** The stake ladder for one game. Per game, because a board is not a card: the
 *  game you care about gets 25 and the one you are curious about gets 5, and
 *  making that one global setting would force the whole week to one number. */
function ladder(ctx, game) {
  const cur = ctx.stakeFor(game.id);
  const l = el('div', 'p6a-stake');
  l.setAttribute('role', 'group');
  l.setAttribute('aria-label', 'Stake per pick on this game');
  l.appendChild(el('span', 'p6a-stake-l', 'Stake'));
  for (const s of STAKES) {
    const c = el('button', 'p6a-chip num', String(s));
    c.type = 'button';
    c.setAttribute('aria-pressed', String(s === cur));
    c.setAttribute('aria-label', s + ' ' + BALANCE_NOUN);
    if (s === cur) c.dataset.on = 'true';
    c.addEventListener('click', () => ctx.onStakeStep(game.id, s));
    l.appendChild(c);
  }
  l.appendChild(el('span', 'p6a-stake-u', BALANCE_NOUN));
  return l;
}

const PILL = { in_progress: 'Live', final: 'Final', locked: 'Closed' };

/**
 * ONE GAME.
 *
 * 🔴 BEFORE KICKOFF THE CARD IS A BOARD; AFTER KICKOFF IT IS A RECEIPT. Every
 * market this game can offer, while you can still take one. Once it locks, only
 * the markets you actually staked - because a disabled tile you never touched is
 * a row of the card that can no longer do anything and never did.
 *
 * That rule is also what keeps a 131-game week readable: by Sunday night most of
 * the board is finished, and a finished game collapses to the two lines that are
 * still about you.
 */
function gameCard(ctx, game) {
  const card = el('article', 'p6a-game');
  card.dataset.gameId = game.id;
  card.dataset.status = game.status;
  const locked = isLocked(game, ctx.now);
  if (locked) card.dataset.locked = 'true';

  const top = el('div', 'p6a-top');
  top.appendChild(el('span', 'p6a-time num', timeLabel(game.kickoffUtc)));
  if (game.broadcast) top.appendChild(el('span', 'p6a-chan', game.broadcast));
  /* Only the states the card cannot show by itself. There is no chip for "open"
   * - an open card is what a card without one IS. */
  const word = game.status === 'final' ? PILL.final
    : game.status === 'in_progress' ? PILL.in_progress
      : locked ? PILL.locked : null;
  if (word) {
    const p = el('span', 'p6a-pill', word);
    p.dataset.state = game.status === 'scheduled' ? 'locked' : game.status;
    top.appendChild(p);
  }
  card.appendChild(top);

  const teams = el('div', 'p6a-teams');
  teams.append(teamBlock(ctx, game, 'away'), el('span', 'p6a-at', '@'), teamBlock(ctx, game, 'home'));
  card.appendChild(teams);

  const offered = marketsFor(game, ctx.markets);
  const staked = ctx.store[game.id] || {};

  if (locked) {
    const mine = offered.filter((m) => staked[m.id]);
    if (!mine.length) {
      card.appendChild(el('p', 'p6a-quiet', 'No stake on this game.'));
      return card;
    }
    const list = el('div', 'p6a-mkts');
    for (const m of mine) list.appendChild(marketBlock(ctx, game, m));
    card.appendChild(list);
    return card;
  }

  if (!offered.length) {
    /* 🔴 SAID, NOT HIDDEN. A game that quietly renders no markets reads as a
     * broken card. A game that says why reads as a game with no line posted,
     * which is what it is - and it is the honest end of the rule that we never
     * price a market ourselves. */
    card.appendChild(el('p', 'p6a-quiet', 'No market on this game \u2014 no line posted.'));
    return card;
  }

  card.appendChild(ladder(ctx, game));
  const list = el('div', 'p6a-mkts');
  for (const m of offered) list.appendChild(marketBlock(ctx, game, m));
  card.appendChild(list);
  return card;
}

function head(root, data) {
  const sport = (data && data.sport) || 'college-football';
  const week = (data && data.week) || 1;
  root.appendChild(pageHeader({
    title: 'All games',
    league: sport === 'nfl' ? 'nfl' : 'ncaa',
    /* 🔴 THE SUB LINE STATES THE RULE. THE PINNED BAR CARRIES THE TALLY.
     *
     * The first render printed "3 picks · 75 Marbles staked" here AND
     * "3 picks · 75 Marbles" in the sticky bar forty pixels below it - the
     * same fact twice, and the copy that scrolls away was the one on top. A
     * header may not repeat what the element directly under it already says.
     * That is the rule the slate’s info card died of, arriving one screen
     * along, and it was found by looking at the rendered page rather than by
     * reading either line on its own.
     *
     * 🔴 AND IT SELLS NOTHING. No balance, because this screen does not own
     * the bank. No top-up, because there is nothing here to buy. */
    sub: 'Week ' + week + ' · every market priced before you tap'
  }));
  /* 🔴 THE DOOR TO THE PARLAY, AND IT WAS MISSING ENTIRELY. p7 shipped
   * built, tested and DEAD - the only thing in the app that mentioned
   * `#/buildparlay` was the route table that defines it. A screen nobody can
   * reach is not built, and the way that happens is exactly this: the screen
   * gets the attention, the one line that points at it does not.
   *
   * It belongs here rather than on Home. Home already promises "the whole
   * week - winner, spread, total, halves, quarters and parlays" and then
   * hands you this board; the parlay is one more thing you can do with the
   * same games, so it sits at the top of them. */
  const go = el('a', 'p6-toparlay');
  go.href = '#/buildparlay';
  go.appendChild(el('span', 'p6-toparlay-h', 'Build a parlay'));
  go.appendChild(el('span', 'p6-toparlay-b',
    'Three to six of these, all have to land. Up to ' + PARLAY_CEILING + '×.'));
  root.appendChild(go);
}


export function render(root, data, state) {
  root.classList.add('scr-p6-allgames');
  root.innerHTML = '';
  const style = el('style');
  style.textContent = [TEAM_CHIP_CSS, STATES_CSS].join('\n');
  root.appendChild(style);

  const d = data || {};

  if (state === 'loading') {
    head(root, d);
    root.appendChild(stateBlock('loading', { rows: 5, body: 'Reading this week\u2019s markets\u2026' }));
    return;
  }
  if (state === 'offline') {
    head(root, d);
    root.appendChild(stateBlock('offline', {
      /* ONE PROMISE, EVERY SCREEN. The slate settled this on 2026-09-08: a stake
       * made with no signal is QUEUED, not made, and the server rules on arrival
       * by its own clock. Saying anything softer here would make two screens
       * disagree about the same marble. */
      body: 'Your stakes are held on this phone and go up when you are back. Each one counts only if it reaches us before that game kicks off, and we rule on that when it arrives, by our clock rather than the one in your pocket. Until it lands it is queued, not made.',
      since: Date.now() - 62000,
      action: { label: 'Try again' }
    }));
    return;
  }
  if (state === 'error') {
    head(root, d);
    root.appendChild(stateBlock('error', {
      title: 'The markets did not load',
      body: 'Your stakes are safe. This is the board, not your entry.',
      action: { label: 'Reload' }
    }));
    return;
  }

  const games = Array.isArray(d.games) ? d.games : [];

  /* 🔴 `ready` WITH NOTHING ON THE WIRE IS THE EMPTY STATE, not a blank page.
   * There is no generated fallback on this screen, so an unreachable or unwritten
   * slate key lands here - and it lands here often enough during the week that
   * an empty scroll would read as a broken deploy. */
  if (state === 'empty' || !games.length) {
    head(root, d);
    root.appendChild(stateBlock('empty', {
      title: 'No markets this week',
      /* NOT a dead end. The captured week is what this screen is for; the way
       * forward is the other destinations, never a filter invented here. */
      body: 'This week\u2019s slate has not been captured yet, so there are no lines to price and nothing to stake. Every market on this screen comes off a posted line \u2014 when there is none, there is no market, and we never post a number of our own.',
      action: { label: 'See the slate' }
    }));
    return;
  }

  head(root, d);

  /* The running total, pinned. It is the only figure on this screen that is
   * about YOU rather than about a game, and it is what stops a board of small
   * taps from adding up out of sight.
   *
   * 🔴 BUILT BEFORE ctx, DELIBERATELY. `paintTally` is called from ctx.repaint,
   * and a `const` declared further down is a temporal dead zone reference that
   * throws "Cannot access before initialization" and takes the screen with it.
   * It happens to be safe here because repaint only ever runs from a click - and
   * "safe because of when it is called" is exactly the reasoning that broke P2's
   * NFL route, so the declaration moves instead. */
  const bar = el('div', 'p6a-bar');
  const tally = el('span', 'p6a-bar-t num');
  bar.appendChild(tally);
  root.appendChild(bar);

  const ctx = {
    now: num(d.now) ? d.now : Date.now(),
    sport: d.sport || 'college-football',
    week: d.week || 1,
    markets: Array.isArray(d.markets) ? d.markets : [],
    store: d.store && typeof d.store === 'object' ? d.store : {},
    /* Held in memory, not on disk: the frozen store shape carries a stake PER
     * PICK, so a game's current ladder step is a property of the card rather
     * than of the record. It is seeded from the last pick made on that game, so
     * it survives a reload for any game you have actually staked. */
    steps: {},
    pickFor(gameId, marketId) {
      const g = this.store[gameId];
      return (g && g[marketId]) || null;
    },
    stakeFor(gameId) {
      if (this.steps[gameId] == null) this.steps[gameId] = stakeForGame(this.store, gameId);
      return this.steps[gameId];
    },
    /* The four identity fields sideOfChoice matches against, computed once per
     * game rather than once per choice. */
    idsFor(game) {
      return {
        home: game.homeTeamId, away: game.awayTeamId,
        homeAbbrev: game.home && game.home.abbrev,
        awayAbbrev: game.away && game.away.abbrev
      };
    },
    /* 🔴 THE TAP IS THE COMMIT. There is no save on this screen and there must
     * not be one - anything that does not survive the tap never happened. */
    onStake(gameId, marketId, choiceId) {
      const g = (this.store[gameId] || (this.store[gameId] = {}));
      const cur = g[marketId];
      if (cur && cur.choice === choiceId) delete g[marketId];
      else g[marketId] = { choice: choiceId, stake: this.stakeFor(gameId) };
      if (!Object.keys(g).length) delete this.store[gameId];
      saveStore(this.sport, this.week, this.store);
      this.repaint(gameId);
    },
    /* Moving the ladder re-prices every choice on the card AND moves the stake
     * on anything already taken on that game. The alternative - leaving old
     * picks at the old number - would make the ladder mean something different
     * before and after the first tap. */
    onStakeStep(gameId, stake) {
      if (STAKES.indexOf(stake) < 0) return;
      this.steps[gameId] = stake;
      const g = this.store[gameId];
      if (g) for (const mid of Object.keys(g)) g[mid].stake = stake;
      saveStore(this.sport, this.week, this.store);
      this.repaint(gameId);
    },
    /* One card is rebuilt, never the screen. A board is a long scroll somebody
     * has worked for, and re-rendering the list under a thumb loses it. */
    repaint(gameId) {
      const old = root.querySelector('.p6a-game[data-game-id="' + cssEsc(gameId) + '"]');
      const game = games.find((x) => x.id === gameId);
      if (old && game) old.replaceWith(gameCard(this, game));
      paintTally();
    }
  };

  function paintTally() {
    const s = stakedSummary(games, ctx.store);
    tally.textContent = s.picks
      ? s.picks + (s.picks === 1 ? ' pick' : ' picks') + ' \u00b7 ' + s.marbles + ' ' + BALANCE_NOUN
      : 'Nothing staked yet';
  }
  paintTally();

  const list = el('div', 'p6a-list');
  for (const g of groupsOf(games)) {
    const day = el('details', 'p6a-day');
    const allPast = g.games.every((x) => x.status === 'final');
    /* A finished day rolls up on its own: present, countable, one tap from open.
     * That is a different thing from dropping it, which would make the board
     * stop being the week. */
    day.open = !allPast;
    if (allPast) day.dataset.when = 'past';

    const h = el('summary', 'p6a-grp');
    h.dataset.key = g.key;
    const right = el('span', 'p6a-grp-r');
    right.append(
      el('span', 'p6a-grp-n num', g.games.length + (g.games.length === 1 ? ' game' : ' games')),
      el('span', 'p6a-chev', '\u2304')
    );
    h.append(el('span', 'p6a-grp-d', groupLabel(g)), right);
    day.appendChild(h);

    /* A real wrapper, because a <details> slots everything after its summary
     * into ONE anonymous box - a gap on the day card separates the header from
     * the block of games and nothing inside it. */
    const cards = el('div', 'p6a-games');
    for (const game of g.games) cards.appendChild(gameCard(ctx, game));
    day.appendChild(cards);
    list.appendChild(day);
  }
  root.appendChild(list);

  /* 🔴 THE STANDING STATEMENT ABOUT THE DATA. Doctrine: this app shows a market
   * number and never authors one. It is in a footnote because that is where a
   * claim about the whole screen belongs, and it is here rather than optional
   * because losing the attribution turns an attributed line into one that reads
   * as ours. */
  root.appendChild(el('p', 'p6a-note',
    'The line is the market\u2019s, not ours \u2014 read from the public feed. '
    + 'We never post a number of our own.'));
  root.appendChild(el('p', 'p6a-note',
    BALANCE_NOUN + ' are not bought, not sold and not redeemable. '
    + 'A market with no posted line is not offered, and every payout is capped at '
    + MAX_PAYOUT + '\u00d7.'));
}
