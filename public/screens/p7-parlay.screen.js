/* P7 — THE STAKED PARLAY. Jason: "Ok. Build the parlay."
 *
 * 🔴 THIS IS NOT P3. There are two parlays in this app and they are different
 * instruments — the module header on src/lib/parlay-stake.ts has the table.
 * P3 is the pool's: points, whole-game sides, a fixed 3/6/12/20 ladder,
 * nothing staked. This one stakes Marbles across any market in the catalogue
 * and pays the product of the legs. They never sum, so they never share a
 * screen either.
 *
 * 🔴 BAR: THERE IS NONE AND IT IS DECLARED, NOT INVENTED. Jason asked the
 * right question — "how does everyone else do it?" — and the research is in
 * price-model.ts: five pick'em products captured for this project and not one
 * ships a parlay. Armchair Quarterback, the only app on disk with a live call
 * layer, has no multi-leg object at all. So this is judged as a blind field
 * against the rules written down for it, and the preview index will print NO
 * BAR DECLARED against this screen. That line is true and should stay true
 * until somebody captures one.
 *
 * 🔴 A DESTINATION, NOT A DRAWER — inherited from P3 deliberately. There is no
 * slip that follows you around the All games board. Two screens in one app
 * with two different ideas of what a bet slip is would be worse than either.
 * You come here, you build it, you stake it, you leave.
 *
 * 🔴 EVERY RULE IS RUN BY src/lib/parlay-stake.ts AND src/lib/price-model.ts.
 * Nothing here reimplements one. The 3-6 leg range, one-leg-per-game, the
 * lock at first kickoff, the void path and the 250x ceiling are all imported,
 * so this screen cannot disagree with the Worker about what a parlay is.
 */
import { teamChip, TEAM_CHIP_CSS } from '/components/team-chip.js';
import { stateBlock, STATES_CSS } from '/components/states.js';
import { pageHeader } from '/components/header.js';
import { GAME_MARKETS } from '/src/markets.js';
import {
  PARLAY_MIN_LEGS, PARLAY_MAX_LEGS, PARLAY_MAX_PAYOUT,
  parlayPrice, parlayReturns, validateStakeParlay, settleStakeParlay,
  parlayLocksAt, parlayIsComposable, legIsAddable,
} from '/src/lib/parlay-stake.js';
import { playsFromPeriods } from '/src/lib/price-model.js';
import {
  marketsFor, priceFor, priceLabel, chosenSport, chosenWeek,
  fetchSlate, resolveWeek, groupsOf, groupLabel, timeLabel, spreadText, num, FLAT_STAKE,
  /* 🔴 ONE DEFINITION OF "TOP 25", SHARED BY THREE SCREENS. Three screens
     deciding separately what a chip counts is how two of them print
     different numbers for the same word - and the counts are ON the chips,
     so the disagreement would be visible and unexplainable. p6 owns it. */
  filterOptions, gamePasses, FILTER_ALL, filterKey,
} from '/screens/p6-allgames.screen.js';

export const id = 'p7-parlay';
export const title = 'Build a parlay';
/* 🔴 null, and see the header. Nothing on disk ships a staked parlay. */
export const bar = null;
export const states = ['ready', 'empty', 'loading', 'offline', 'error'];

const SEASON = 2026;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/* ------------------------------------------------------------------ *
 * Storage. One parlay per sport per week — "One parlay of 3-6 legs. One."
 * ------------------------------------------------------------------ */

export function storeKey(sport, week) {
  return 'ag.parlay.' + sport + '.' + week;
}

export function loadSlip(sport, week) {
  try {
    const raw = JSON.parse(localStorage.getItem(storeKey(sport, week)) || 'null');
    if (!raw || !Array.isArray(raw.legs)) return { legs: [], stake: FLAT_STAKE, placed: false };
    return {
      legs: raw.legs.filter((l) => l && l.gameId && l.marketId && l.choiceId),
      /* 🔴 ALWAYS FLAT_STAKE, EVEN FROM STORAGE. A slip written before the
         ladder was removed carries whatever it was staked at, and honouring
         that would leave two parlays on the board settling at different
         sizes for no reason a person could see. */
      stake: FLAT_STAKE,
      placed: !!raw.placed,
    };
  } catch { return { legs: [], stake: FLAT_STAKE, placed: false }; }
}

function saveSlip(sport, week, slip) {
  try { localStorage.setItem(storeKey(sport, week), JSON.stringify(slip)); } catch { /* private mode */ }
}

/* ------------------------------------------------------------------ *
 * What can still be added
 * ------------------------------------------------------------------ */

/**
 * 🔴 THE THREE REASONS A TILE IS NOT OFFERED, AND THEY ARE DIFFERENT REASONS.
 * A screen that greys everything out for one undifferentiated "no" makes the
 * user guess which rule they hit, so each one gets its own word on the card:
 *
 *   'used'    another leg already uses this game — one leg per game, because
 *             multiplying correlated legs states they are independent
 *   'shut'    this market's period has already started
 *   'full'    six legs is the maximum
 */
export function blockedReason(game, market, legs, now) {
  if (legs.length >= PARLAY_MAX_LEGS) return 'full';
  if (!legIsAddable(game, now) && !marketStillOpen(game, market, now)) return 'shut';
  if (legs.some((l) => String(l.gameId) === String(game.id))) return 'used';
  return null;
}

/* marketsFor already applies the close rule; this is the same question asked
   about one market rather than a list, and it goes through the same function
   so the two can never drift. */
function marketStillOpen(game, market, now) {
  return marketsFor(game, [market], now, chosenSport()).length > 0;
}

/* ------------------------------------------------------------------ *
 * The slip
 * ------------------------------------------------------------------ */

/** The prices of the legs, in order, for parlayPrice(). */
export function legPrices(legs) {
  return legs.map((l) => (num(l.price) ? l.price : 0));
}

/**
 * WHAT THE SLIP IS WORTH RIGHT NOW, and it is shown at every leg count rather
 * than only at three.
 *
 * 🔴 A PARLAY UNDER THREE LEGS IS NOT VALID AND STILL HAS A PRICE. Hiding the
 * number until the third leg lands would mean the one moment a person most
 * wants to know what they are building — while they are building it — is the
 * one moment the screen refuses to say. So it prints the running price and
 * says separately that three is the minimum.
 */
export function slipPrice(legs) {
  return parlayPrice(legPrices(legs));
}

/**
 * 🔴 A PLACED PARLAY IS A DIFFERENT SCREEN, NOT THE SAME ONE GREYED OUT.
 *
 * Before it is staked the question is "what is this worth"; after, it is
 * "where does it stand". Those want different things at the top - the price
 * first, then the state - and a builder with its buttons disabled answers
 * neither well.
 *
 * 🔴 IT SETTLES FROM THE SLATE, WITH NO PLAY LIST ANYWHERE. Every period
 * market resolves through scoreAfterPeriod, which reads plays, and no client
 * has plays for 86 games. playsFromPeriods turns the captured quarter scores
 * into the smallest list that answers the same questions, so this uses the
 * SAME settleMarket the live screen does rather than a second implementation
 * that would eventually disagree with it about who won a first half.
 */
function settledCard(ctx) {
  const { slip, games } = ctx;
  const byId = mapOf(games);
  const plays = new Map(games.map((g) => [String(g.id), playsFromPeriods(g)]));
  const res = settleStakeParlay(slip.legs, byId, plays, slip.stake);

  const c = el('section', 'p7-slip');
  c.dataset.state = res.state;

  const head = el('div', 'p7-slip-head');
  head.appendChild(el('span', 'p7-slip-l', VERDICT[res.state] || 'IN PLAY'));
  head.appendChild(el('span', 'p7-slip-x num',
    res.state === 'lost' ? '0' : String(res.returns)));
  c.appendChild(head);

  const sub = el('p', 'p7-sub');
  sub.textContent = res.state === 'won'
    ? 'All ' + res.legs.filter((l) => l.result === 'won').length + ' legs landed at '
      + priceLabel(res.price) + '.'
    : res.state === 'lost' ? 'A leg missed, so the parlay is over.'
      : res.state === 'void' ? 'Voided.'
        : res.legs.filter((l) => l.result === null).length + ' still to play, at '
          + priceLabel(res.price) + '.';
  c.appendChild(sub);
  if (res.note) c.appendChild(el('p', 'p7-lock', res.note));

  const list = el('ul', 'p7-legs');
  for (const leg of res.legs) {
    const g = byId.get(String(leg.gameId));
    const li = el('li', 'p7-leg');
    li.dataset.result = leg.result || 'live';
    const txt = el('div', 'p7-leg-t');
    txt.appendChild(el('span', 'p7-leg-g', g ? (g.shortName || '') : leg.gameId));
    txt.appendChild(el('span', 'p7-leg-m', leg.label || (leg.marketId + ' · ' + leg.choiceId)));
    li.appendChild(txt);
    /* 🔴 THE MARK IS SHAPE AND WORD, NOT COLOUR ALONE - the same rule the
       result components follow, and the reason is that a red dot and a green
       dot are one dot to a lot of people. */
    li.appendChild(el('span', 'p7-leg-r', MARK[leg.result || 'live']));
    li.appendChild(el('span', 'p7-leg-x num', priceLabel(leg.price)));
    list.appendChild(li);
  }
  c.appendChild(list);

  /* 🔴 STAKED IS STAKED. There is no unstake, and there is no clear button
     while it is live - a parlay you can walk away from mid-run is not a
     parlay. It clears when the week does, with the key. */
  c.appendChild(el('p', 'p7-lock',
    'Staked ' + slip.stake + ' marbles. This slip clears when the week turns.'));
  return c;
}

const VERDICT = { won: 'WON', lost: 'MISSED', void: 'VOIDED', live: 'IN PLAY' };
const MARK = { won: '✓ landed', lost: '✕ missed', void: '— void', live: '· to play' };

function slipCard(ctx) {
  const { slip, games, now } = ctx;
  const c = el('section', 'p7-slip');
  const legs = slip.legs;
  const price = slipPrice(legs);
  const v = validateStakeParlay(legs);

  const head = el('div', 'p7-slip-head');
  head.appendChild(el('span', 'p7-slip-l',
    legs.length + ' of ' + PARLAY_MAX_LEGS + ' legs'));
  /* 🔴 THE PRICE IS ON THE SCREEN BEFORE THE TAP. It is the differentiator and
     it is the one thing this screen cannot get wrong. */
  head.appendChild(el('span', 'p7-slip-x num',
    price > 0 ? priceLabel(price) : '—'));
  c.appendChild(head);

  if (!legs.length) {
    c.appendChild(el('p', 'p7-empty',
      'Pick ' + PARLAY_MIN_LEGS + ' to ' + PARLAY_MAX_LEGS + ' from the games below. '
      + 'One leg per game. Every leg has to land.'));
    return c;
  }

  const list = el('ul', 'p7-legs');
  for (const leg of legs) {
    const g = games.find((x) => String(x.id) === String(leg.gameId));
    const li = el('li', 'p7-leg');
    const txt = el('div', 'p7-leg-t');
    txt.appendChild(el('span', 'p7-leg-g', g ? (g.shortName || '') : leg.gameId));
    txt.appendChild(el('span', 'p7-leg-m', leg.label || (leg.marketId + ' · ' + leg.choiceId)));
    li.appendChild(txt);
    li.appendChild(el('span', 'p7-leg-x num', priceLabel(leg.price)));
    if (!slip.placed && parlayIsComposable(legs, mapOf(games), now)) {
      const rm = el('button', 'p7-leg-rm');
      rm.type = 'button';
      rm.setAttribute('aria-label', 'Remove this leg');
      rm.textContent = '×';
      rm.onclick = () => {
        slip.legs = legs.filter((l) => l !== leg);
        ctx.save(); ctx.repaint();
      };
      li.appendChild(rm);
    }
    list.appendChild(li);
  }
  c.appendChild(list);

  /* 🔴 EVERY BROKEN RULE, NAMED. validateStakeParlay returns reasons rather
     than a boolean precisely so this can say which one. */
  if (!v.ok) {
    const why = el('ul', 'p7-why');
    for (const e of v.errors) why.appendChild(el('li', null, errorText(e)));
    c.appendChild(why);
  }

  /* 🔴 NO LADDER. Jason: "Flat 5 except for the head to head." The parlay is
     on the staking half of the weekly board, not the live one, so it takes
     the same rule and for the same reason: this screen has no bank, so a
     stake with no budget behind it is not a choice, it is a bigger number.
     The 250x ceiling is what makes a parlay worth building; the stake was
     never the interesting part of it. */
  const ret = el('p', 'p7-ret');
  ret.appendChild(el('span', null, v.ok ? 'Returns ' : 'Would return '));
  ret.appendChild(el('strong', 'num', String(parlayReturns(slip.stake, price))));
  ret.appendChild(el('span', null, ' marbles'));
  c.appendChild(ret);

  const locks = parlayLocksAt(legs, mapOf(games));
  if (locks) {
    c.appendChild(el('p', 'p7-lock',
      slip.placed || !parlayIsComposable(legs, mapOf(games), now)
        ? 'Locked — the first of your games has kicked off.'
        : 'Locks at ' + timeLabel(locks) + ', when your earliest game kicks.'));
  }

  if (!slip.placed) {
    const go = el('button', 'p7-place');
    go.type = 'button';
    go.disabled = !v.ok;
    go.textContent = v.ok
      ? 'Stake ' + slip.stake + ' to win ' + parlayReturns(slip.stake, price)
      : 'Pick ' + Math.max(0, PARLAY_MIN_LEGS - legs.length) + ' more';
    go.onclick = () => { slip.placed = true; ctx.save(); ctx.repaint(); };
    c.appendChild(go);
  } else {
    c.appendChild(el('p', 'p7-placed', 'Staked. Every leg has to land.'));
  }
  return c;
}

export function errorText(e) {
  if (!e) return 'Something is wrong with this parlay.';
  if (e.code === 'too_few_legs') return 'A parlay needs at least ' + PARLAY_MIN_LEGS + ' legs.';
  if (e.code === 'too_many_legs') return 'A parlay takes at most ' + PARLAY_MAX_LEGS + ' legs.';
  if (e.code === 'same_game_twice') return 'Two legs from one game — they are not independent, so only one counts.';
  if (e.code === 'duplicate_leg') return 'That leg is already on the slip.';
  if (e.code === 'no_price') return 'A leg lost its price. Remove it and add it again.';
  return 'That leg cannot be used.';
}

const mapOf = (games) => new Map(games.map((g) => [String(g.id), g]));

/* ------------------------------------------------------------------ *
 * The picker
 * ------------------------------------------------------------------ */

function gameBlock(ctx, game) {
  const { slip, now } = ctx;
  const offered = marketsFor(game, GAME_MARKETS, now, ctx.sport);
  if (!offered.length) return null;

  const d = el('details', 'p7-game');
  const sum = el('summary', 'p7-game-h');
  const who = el('span', 'p7-game-w');
  if (game.away) who.appendChild(teamChip(game.away, { size: 18 }));
  who.appendChild(el('span', 'p7-at', '@'));
  if (game.home) who.appendChild(teamChip(game.home, { size: 18 }));
  who.appendChild(el('span', 'p7-game-n', game.shortName || ''));
  sum.appendChild(who);
  sum.appendChild(el('span', 'p7-game-t num', timeLabel(game.kickoffUtc)));
  d.appendChild(sum);

  const used = slip.legs.some((l) => String(l.gameId) === String(game.id));
  if (used) d.dataset.used = 'true';

  for (const m of offered) {
    const blk = el('div', 'p7-mkt');
    blk.appendChild(el('div', 'p7-mkt-h', m.label));
    const row = el('div', 'p7-choices');
    for (const c of m.choices) {
      const price = priceFor(game, m, c, { home: game.homeTeamId, away: game.awayTeamId }, ctx.sport);
      const b = el('button', 'p7-choice');
      b.type = 'button';
      b.appendChild(el('span', 'p7-choice-l', labelFor(game, m, c)));
      b.appendChild(el('span', 'p7-choice-x num', priceLabel(price)));
      const blocked = blockedReason(game, m, slip.legs, now);
      const mine = slip.legs.some((l) => String(l.gameId) === String(game.id)
        && l.marketId === m.id && l.choiceId === c.id);
      if (mine) { b.dataset.on = 'true'; b.appendChild(el('span', 'p7-choice-w', 'ON THE SLIP')); }
      else if (blocked) {
        b.disabled = true;
        b.appendChild(el('span', 'p7-choice-w',
          blocked === 'used' ? 'ONE LEG PER GAME'
            : blocked === 'full' ? 'SLIP IS FULL' : 'CLOSED'));
      }
      b.onclick = () => {
        if (mine) {
          slip.legs = slip.legs.filter((l) => l !== slip.legs.find((x) =>
            String(x.gameId) === String(game.id) && x.marketId === m.id && x.choiceId === c.id));
        } else {
          /* 🔴 THE LEG CARRIES ITS PRICE AND ITS LINE. Both are what the tile
             said at this instant, and both are what settlement reads. The
             spread moves during a game — slate-cron re-reads odds every ten
             minutes — so a leg that stored neither would settle against a
             number that was never on screen. */
          slip.legs = slip.legs.concat([{
            gameId: String(game.id), marketId: m.id, choiceId: c.id, price,
            label: m.label + ' · ' + labelFor(game, m, c),
            lines: { spread: game.spread, total: game.total },
          }]);
        }
        ctx.save(); ctx.repaint();
      };
      row.appendChild(b);
    }
    blk.appendChild(row);
    d.appendChild(blk);
  }
  return d;
}

/** A choice named the way a person would say it. */
export function labelFor(game, market, choice) {
  const id = String(choice.id);
  if (id === 'home') return (game.home && game.home.abbrev) || 'Home';
  if (id === 'away') return (game.away && game.away.abbrev) || 'Away';
  if (id === 'tie') return 'Tie';
  if (id === 'neither') return 'Neither';
  if (id === 'over' || id === 'under') {
    const line = market.needsLine === 'total'
      ? (market.scope === 'half' && num(game.total) ? Math.round((game.total / 2) * 2) / 2 : game.total)
      : null;
    return (id === 'over' ? 'Over ' : 'Under ') + (num(line) ? line : '');
  }
  if (market.id === 'spread') {
    return spreadText(game.spread, id === 'home' ? 'home' : 'away') || choice.label;
  }
  return choice.label || id;
}

/* ------------------------------------------------------------------ *
 * Data + render
 * ------------------------------------------------------------------ */

export async function previewData() {
  const sport = chosenSport();
  /* 🔴 THE RESOLVED WEEK, NOT THE STORED ONE - see resolveWeek. The slip's
     localStorage key is built from this, and a slip filed under a week the
     board is not showing is a slip that has silently vanished. */
  const week = await resolveWeek(sport, chosenWeek());
  const byId = {};
  const games = await fetchSlate(sport, week, byId);
  /* The week is real, so the shell's "Sample data" banner must not say it is
   * made up (found by the full sweep, 2026-09-11 - "Check everything."). */
  return { sport, week, games, fromFeed: games.length > 0 };
}

function head(root, d) {
  root.appendChild(pageHeader({
    title: 'Build a parlay',
    league: (d && d.sport === 'nfl') ? 'nfl' : 'ncaa',
  }));
}

export function render(root, data, state) {
  root.classList.add('scr-p7-parlay');
  root.innerHTML = '';
  const style = el('style');
  style.textContent = [TEAM_CHIP_CSS, STATES_CSS].join('\n');
  root.appendChild(style);
  const d = data || {};
  head(root, d);

  if (state === 'loading') {
    root.appendChild(stateBlock('loading', { rows: 4, body: 'Reading this week’s markets…' }));
    return;
  }
  if (state === 'offline' || state === 'error') {
    root.appendChild(stateBlock(state === 'offline' ? 'offline' : 'error', {
      title: state === 'offline' ? 'You are offline' : 'The markets did not load',
      body: 'Your slip is on this phone and is still here. A parlay counts only if '
        + 'it reaches us before your earliest game kicks off, and we rule on that '
        + 'when it arrives, by our clock rather than the one in your pocket.',
      action: { label: 'Try again' },
    }));
    return;
  }

  const sport = d.sport || chosenSport();
  const week = d.week || chosenWeek();
  const games = Array.isArray(d.games) ? d.games : [];
  const slip = loadSlip(sport, week);
  const ctx = {
    sport, week, slip, games, now: Date.now(),
    save: () => saveSlip(sport, week, slip),
    repaint: () => render(root, data, state),
  };

  /* Placed parlays get the settled view and no picker - there is nothing
     left to pick, and a live board under a running bet is a different screen
     that has not been asked for. */
  if (slip.placed) {
    root.appendChild(settledCard(ctx));
    return;
  }
  root.appendChild(slipCard(ctx));

  if (!games.length) {
    root.appendChild(stateBlock('empty', {
      title: 'No games this week',
      body: 'When the week’s slate lands, every market on it shows up here.',
    }));
    return;
  }

  /* 🔴 ONLY GAMES THAT STILL HAVE SOMETHING TO OFFER. A finished game, or one
     whose every market has closed, is not drawn at all — a picker full of
     dead rows is how sixty games becomes unusable. */
  const live = games.filter((g) => marketsFor(g, GAME_MARKETS, ctx.now, sport).length > 0);
  if (!live.length) {
    root.appendChild(stateBlock('empty', {
      title: 'Everything has kicked off',
      body: 'Every market on this week’s games has closed. The next slate opens when the week turns.',
    }));
    return;
  }

  /* Grouped by day and kick window, one header per group — the same shape the
     slate and the All games board use. */
  /* 🔴 THE SAME FILTERS AS THE OTHER TWO SCREENS. This picker is the same 86
     games, and it is where scanning matters most: you are hunting three to
     six specific games, not browsing. It shipped without them purely because
     I built the filter after the picker. */
  let filter = FILTER_ALL;
  try { filter = localStorage.getItem(filterKey(sport)) || FILTER_ALL; } catch { /* private */ }
  const fopts = filterOptions(live);
  if (!fopts.some((o) => o.id === filter)) filter = FILTER_ALL;
  if (fopts.length > 1) {
    const chips = el('div', 'p7-filters ag-scroll-x');
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', 'Filter the week');
    for (const o of fopts) {
      const b = el('button', 'p7-filter');
      b.type = 'button';
      b.appendChild(el('span', 'p7-filter-l', o.label));
      b.appendChild(el('span', 'p7-filter-n num', String(o.n)));
      if (o.id === filter) { b.dataset.on = 'true'; b.setAttribute('aria-current', 'true'); }
      b.onclick = () => {
        try { localStorage.setItem(filterKey(sport), o.id); } catch { /* private */ }
        render(root, data, state);
      };
      chips.appendChild(b);
    }
    root.appendChild(chips);
  }

  const picked = live.filter((g) => gamePasses(g, filter));
  if (!picked.length) {
    root.appendChild(stateBlock('empty', {
      title: 'Nothing in that filter',
      body: 'No game left in this filter is still open. Try All, or another conference.',
    }));
    return;
  }

  for (const g of groupsOf(picked)) {
    const sec = el('section', 'p7-group');
    sec.appendChild(el('h2', 'p7-group-h', groupLabel(g)));
    for (const game of g.games) {
      const blk = gameBlock(ctx, game);
      if (blk) sec.appendChild(blk);
    }
    root.appendChild(sec);
  }

  root.appendChild(el('p', 'p7-note',
    'Every leg has to land. A leg that cannot be settled — a push, a game '
    + 'that never happened — leaves the parlay and the rest carry on at a '
    + 'lower price. Below ' + PARLAY_MIN_LEGS + ' legs the whole thing voids and '
    + 'your stake comes back. Nothing pays more than ' + PARLAY_MAX_PAYOUT + '×.'));
}
