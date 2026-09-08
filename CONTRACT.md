# CONTRACT — frozen 2026-09-08, for the whole fan-out run

**Written by the session before any sub-agent ran. Frozen for the run.**

**A sub-agent that needs this changed returns that as a `COULD NOT CLOSE` item. It never edits this
file.** The session stops, amends, and re-runs the affected pieces.

**Every sub-agent is given this file whole.** If something you need is not in here, it is a
`COULD NOT CLOSE`, not a decision you make.

---

## 0 · What you are building

**Any Given — a free college football pool that becomes a live companion during the game.**
One app, more than one sport. **Nothing that affects play can ever be bought.**

**Runtime: Cloudflare Workers + Durable Objects + D1.** Design width **393px**. Light default,
**full dark parity**.

**Reference implementation:** `C:\Claude\Knowledge\sports-live` — a working Python version with 337
tests. **Read it. Never translate it line by line. Never edit it. Never delete it.**

---

## 1 · 🔴 Rule zero — a piece is done when it RAN

**A model cannot tell working code from code that looks like working code.** The only thing that
separates them is evidence produced outside the model.

**Your piece closes against exactly one of these, and nothing else:**

| | |
|---|---|
| A **real captured fixture** in `fixtures/` | You did not write it and you may not add to it |
| A **real browser at 393px** | Screens. `npm run preview` serves with no network |
| The **reference implementation's output on the same input** | Modules. Run the Python, diff the output |

**🔴 NEVER WRITE A FIXTURE.** `sports-live/fixtures/_make.py` invented a play-text shape;
**306 tests passed against it while the app named the wrong player in every real game.** If your
piece needs a fixture that does not exist in `fixtures/`, that is a `COULD NOT CLOSE` return and a
host capture job. It is not a file you write.

**🔴 NEVER INVENT A BAR.** Your bar is named in your dispatch, by filename, and it exists on disk.
If you cannot open it, stop and return `COULD NOT CLOSE`. **An invented bar produces a clean run, a
confident verdict and no signal at all.**

**A test whose data you also invented is not a close.** It is the same assumption written twice.

---

## 2 · What you return — exactly three things

| | |
|---|---|
| **1 · THE ARTIFACT** | Every file you wrote, by path, and **the one command that runs it** |
| **2 · THE EVIDENCE** | **Which fixture, which command, and its actual output.** Never *"tests pass"* — the count, the fixture name, and the failing case if any. For a screen: **the width you rendered at and what was on screen** |
| **3 · COULD NOT CLOSE** | Everything you assumed, invented, stubbed or left open, **named as a stub**, plus any rule below you could not satisfy and why |

**A return with no evidence is a failed return.** A null result is a valid answer. **You are not
being asked whether the piece is good** — that is judged separately, blind.

---

## 3 · 🔴 File ownership — you write your named set and nothing else

**One sub-agent owns one named file set. No two overlap.** Your dispatch names every file you may
write. **Do not touch a file outside it**, including this contract, `public/styles/tokens.css`,
`public/components/*`, `src/worker.ts`, `migrations/*` or another screen's files.

**Two agents in one file is the recorded loss mode.**

```
anygiven/
  CONTRACT.md                    SESSION. Frozen
  wrangler.toml  package.json    SESSION
  migrations/0001_init.sql       SESSION
  fixtures/                      SESSION. Read-only to everyone
  tools/preview.mjs              SESSION
  public/styles/tokens.css       SESSION. The token system
  public/styles/shell.css        SESSION. S1 nav, S5 desktop
  public/components/states.js    SESSION. S3 empty / loading / offline / error
  public/components/nav.js       SESSION. S1
  public/components/team-chip.js SESSION. SHARED - P2, P5, L1 all use it
  public/components/fmt.js       SESSION. Tabular number + clock formatting
  src/worker.ts                  SESSION. Routes
  src/do/GameRoom.ts             SESSION. One live game, websocket fan-out, alarm poll
  src/do/PoolRoom.ts             SESSION. One pool
  src/lib/types.ts               SESSION. THE SHARED TYPES. Import, never re-declare
  src/lib/teams.ts               SESSION. Team identity, and the model-key resolver

  src/lib/parse.ts               M1
  src/lib/detect.ts              M2
  src/lib/winprob.ts             M3
  src/lib/price.ts               M4
  src/lib/calls.ts               M5
  src/lib/board.ts               M6
  src/lib/pool.ts                M7
  src/feed/cfbd.ts               M9

  public/screens/<id>.screen.js  one screen agent each
  public/screens/<id>.css        the same agent
  tests/<id>.test.mjs            the same agent
```

**Screens are auto-discovered** by `tools/preview.mjs` globbing `public/screens/*.screen.js`.
**There is no index file to edit**, deliberately — so no two screen agents ever touch one file.

---

## 4 · The screen module shape

Every screen is one ES module. **No build step. No bundler. No framework.**

```js
// public/screens/p2-slate.screen.js
export const id = 'p2-slate';
export const title = 'The slate';
export const bar = 'reference/cbs-pickem-teardown/screens/CBS-picks-week1-15-games-spreads-crowd-desktop.png';

/** Every state this screen has. The preview harness renders each one as its own route. */
export const states = ['ready', 'empty', 'loading', 'offline', 'error'];

/**
 * @param {HTMLElement} root  a clean container. You own everything inside it.
 * @param {object} data       already-shaped view data. See §6 types.
 * @param {string} state      one of `states`
 */
export function render(root, data, state) { /* ... */ }
```

- **`<id>.css` is loaded automatically** by the harness. Scope every rule under `.scr-<id>`.
- **You never fetch.** Data arrives as an argument. A screen that calls `fetch()` fails its piece.
- **A screen with data and no `empty`, `loading`, `offline` and `error` state is not a finished
  screen.**

---

## 5 · 🔴 The design rules that fail a piece

**These are checked before anything you write is shown to anyone. Each is a written rule already
paid for once.**

| Check | You fail if |
|---|---|
| **Price on the tile** | A call screen shows its number only after resolution. **This is the product's differentiator** |
| **Nothing in front of the slate** | Any account wall, date-of-birth field, install prompt or interstitial above the fold |
| **Symmetric result** | Win and miss are not the same component with a different sign |
| **The delay holds** | The broadcast delay replaces the board instead of holding it legible. **It is a slider, always on, user-set** |
| **Marks** | Any logo, any ESPN CDN image URL, anything defaulting marks on |
| **Scoping** | A pool component wrote `--maroon`, `--gold` or `--accent` at `:root` |
| **Accent token** | A component hard-codes `--maroon` or `--gold`. **Read `--accent`** — light and dark do not share the token |
| **Depth** | Any `box-shadow`. **Depth is `1px solid var(--line)`** |
| **Dependencies** | Any icon font, any chart library, any npm package. **Inline SVG or nothing** |
| **Numbers** | Any figure without `font-variant-numeric: tabular-nums` |
| **Team color survival** | The component was not rendered against a **navy primary, a yellow primary and a null** — and for any pool component, **against every PAIR of those, navy-on-navy included** |
| **Words** | `credits`, `coins`, `top-up`, `purchase`, `buy`, `continue`, `refill` anywhere near the balance. **The balance is `Marbles`** |
| **Boards** | A pool score and a stake profit summed anywhere |
| **Babe Ruth** | 1932, Wrigley, a bat, a pointing batter. **Never** |
| **Spelling** | Colour, centre, grey, behaviour. **US spelling** |
| **Tap target** | Anything a thumb hits under 44px |

### What you may never decide

| | It is |
|---|---|
| The word for the balance | **`Marbles`.** Never `credits` |
| Whether anything that affects play is purchasable | **No. Ever.** Raising it stops the whole run |
| Whether a user can be eliminated | **No. The bank refills every game** |
| The payout | **`stake / p`, capped at 6×**, visible on the tile before the tap |
| Whether logos ship | **No. Marks default OFF.** A team is two colors, its abbreviation, its name in type |
| How a push, cancellation, postponement or voided leg resolves | **One void path.** The game did not happen, for everybody |
| Whether the pool score and the stake profit combine | **Never. Separate boards** |

---

## 6 · Types — the whole vocabulary

**🔴 AMENDED 2026-09-08, after the module wave. `src/lib/types.ts` IS NOW THE TYPES, and it is
session-owned. IMPORT FROM IT. Do not re-declare a type in your own file** — four module agents
did, independently, and TypeScript's structural typing hides the drift until it bites.

**Five amendments are recorded in that file's header and they change what you may assume:**

| | |
|---|---|
| **1** | **`StandingsRow` is the POOL board only.** The live board is **`LiveStandingsRow`** — Marbles, ranked on `profit`. They share their presentation fields and **no quantity**, so nothing can sum them |
| **2** | **`price.ts` is the only producer of a `CallOffer`.** `calls.ts` consumes one. Confidence comes from the model's **sample count and back-off level**, never from `\|p − 0.5\|` |
| **3** | **`ParlayState` includes `'void'`** |
| **4** | **`StarRole` includes `returner` and `interceptor`.** It still never includes `tackler` |
| **5** | **`GameFacts` exists** — the score, the post-play spot and the scoring flag, keyed by play id. The parser does not emit it. Without it `close_game` does not fire, which is a **defined degradation, not a silence** |

**The listing below is the shape, kept for reading. `src/lib/types.ts` is what compiles.**

```ts
// ---------- identity ----------
/** From fixtures/teams.json. Measured 2026-09-08 against the real file:
 *    760 schools
 *    331 primary === '000000'  +  70 primary missing  =  401 with NO USABLE PRIMARY
 *    393 with NO SECONDARY AT ALL  - more than half the file
 *  The vault says 402; the file says 401. Use the file.
 *  🔴 A TEAM WITH ONE COLOR AND A TEAM WITH NONE ARE TWO DIFFERENT DEFINED STATES.
 *  The two-color chip is a two-color component and 52% of the file cannot fill it. */
export type TeamIdentity = {
  id: string;            // CFBD team id === ESPN team id
  abbrev: string;        // 'OU'
  name: string;          // 'Oklahoma Sooners'
  short: string;         // 'Oklahoma'
  primary: string | null;    // '841617' hex, no '#'. NULL IS A REAL STATE
  secondary: string | null;
};

/** What team-chip.js returns. NEVER set these at :root. */
export type TeamVars = { '--team-a': string; '--team-b': string; };

// ---------- the pool ----------
export type Scope = 'ranked_v_ranked' | 'conference' | 'top25' | 'handpick' | 'all';
export type RankingSource = 'ap' | 'cfp';   // different lists. Named on screen

export type Pool = {
  id: string;              // the invite code. URL-safe, 6 chars, no vowels
  name: string;
  commissionerId: string;
  scope: Scope;
  scopeArg: string | null; // conference id, or comma-joined game ids for handpick
  rankingSource: RankingSource | null;
  ats: boolean;            // against-the-spread. Spreads appear ONLY when true
  season: number;
  scopeLockedAt: number | null;  // epoch ms of the first kickoff of week 1
  memberCount: number;
};

export type GameStatus = 'scheduled' | 'in_progress' | 'final' | 'void';

export type SlateGame = {
  id: string;
  week: number;
  kickoffUtc: number;      // epoch ms
  home: TeamIdentity;
  away: TeamIdentity;
  spread: number | null;   // rendered only when pool.ats
  status: GameStatus;
  homeScore: number | null;
  awayScore: number | null;
};

export type PickSide = 'home' | 'away';
export type PickState =
  | 'unpicked' | 'picked' | 'locked' | 'in_progress'
  | 'won' | 'lost' | 'void';

export type Pick = {
  gameId: string;
  side: PickSide | null;
  state: PickState;
  lockedAt: number;        // === game.kickoffUtc. Editable until then
  /** The POOL's own split, never global. NULL until this user has picked. */
  crowd: { home: number; away: number; n: number } | null;
};

/** 3..6 legs, chosen from picks already made. Legs lock independently. */
export type Parlay = {
  week: number;
  legs: { gameId: string; side: PickSide; locked: boolean; result: 'won'|'lost'|'void'|null }[];
  state: 'empty'|'under_min'|'valid'|'at_max'|'partial_lock'|'locked'|'won'|'lost';
  worth: number;           // in this pool's points. NEVER odds
};

/** One field, one named game of the week. Same rule for every pool. */
export type Tiebreak = { gameId: string; predictedTotal: number | null };

export type StandingsRow = {
  rank: number;
  userId: string;
  displayName: string;
  weekPoints: number;
  seasonPoints: number;
  parlayPoints: number;    // called out where it moved somebody
  movement: number;        // + / - ; --up / --down, fixed scale, never team color
  isSelf: boolean;         // the row is pinned above the table as well
};

// ---------- the live layer ----------
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
  /** 🔴 7.2 EMITTED BY THE PARSER, NEVER DERIVED IN A VIEW.
   *  The parenthesized group at the end of a play is the TACKLER. */
  star: { name: string; jersey: string | null; teamId: string; role: 'carrier'|'passer'|'receiver'|'tackler'|'kicker' } | null;
  type: 'run' | 'pass' | 'kick' | 'penalty' | 'other';
};

export type DetectedEvent =
  | 'touchdown' | 'field_goal' | 'punt' | 'turnover' | 'fumble' | 'interception'
  | 'safety' | 'big_play' | 'fourth_down' | 'red_zone' | 'close_game'
  | 'downs' | 'kickoff' | 'overtime';

/** 🔴 7.7 - why the win-probability line moved. IBM SlamTracker's Key moment. */
export type KeyMoment = { playId: string; event: DetectedEvent; wpDelta: number; text: string };

export type CallSide = 'run' | 'pass';
export type Confidence = 'hi' | 'mid' | 'lo';   // .c-hi / .c-mid / .c-lo. Three steps. Never a ramp

/** 🔴 THE PRICE IS ON THE TILE, BEFORE THE TAP. */
export type CallOffer = {
  snapId: string;
  side: CallSide;
  p: number;                 // model probability, 0..1
  payoutPerMarble: number;   // 1 / p, CAPPED AT 6
  confidence: Confidence;
  closesAt: number;          // epoch ms. The snap clock
};

export type Call = {
  snapId: string;
  side: CallSide;
  stake: number;             // Marbles. Ladder 5 / 10 / 25 - untested, see B2
  p: number;                 // the price AT THE MOMENT OF THE CALL
  state: 'open' | 'locked' | 'settled';
  landed: boolean | null;
  delta: number | null;      // + payout - stake, or - stake
};

/** 🔴 The bank refills every game. Nobody is ever locked out of the app. */
export type Bank = {
  balance: number;           // starts at 100 every game
  start: number;
  delta: number;             // balance - start. THE LIVE BOARD RANKS ON THIS
  record: { landed: number; missed: number };
  streak: number;
};

/** 🔴 Held by the same delay as the feed, or carrying no state at all. */
export type Notification = { kind: string; body: string; holdsState: boolean; sendAt: number };
```

---

## 7 · The D1 schema — `migrations/0001_init.sql`, session-owned

**Live per-game state lives in the `GameRoom` Durable Object. D1 holds only what settled.**

Read it at `migrations/0001_init.sql`. **Do not write a migration.** If your piece needs a column,
that is a `COULD NOT CLOSE`.

---

## 8 · Socket events — `GameRoom`, session-owned

**A user's phone holds ONE connection. One server polls the feed; clients never poll it
themselves.** That is not negotiable and it is the reason the original exists.

| Event | Direction | Payload |
|---|---|---|
| `hello` | client → DO | `{ gameId, userId, delayMs }` |
| `state` | DO → client | full snapshot: `{ game, drives, plays, bank, call, board }` |
| `play` | DO → client | `{ play: Play, events: DetectedEvent[], wp: number, keyMoment: KeyMoment \| null }` |
| `offer` | DO → client | `{ offers: CallOffer[] }` — **the price, before the snap** |
| `call` | client → DO | `{ snapId, side, stake }` |
| `call:ack` | DO → client | `{ call: Call }` — **one call per snap, enforced here (7.4)** |
| `settle` | DO → client | `{ snapId, landed, delta, bank }` |
| `board` | DO → client | `{ rows: LiveStandingsRow[] }` — **amended. Marbles, not points** |

**🔴 The broadcast delay is applied CLIENT-SIDE**, by holding the event queue. The DO sends in real
time; the client is deliberately behind. **Every notification is held by the same delay, or carries
no state at all.** A push that reads *"Q2 started: 31 – 28"* spoils the television and is fatal.

---

## 9 · The token system — inherited whole, do not restate

**`public/styles/tokens.css` is the token system, lifted from
`sports-live/docs/design/DESIGN.md`.** Read the tokens there; **where that document and any brief
disagree about a token, `DESIGN.md` wins.** About anything else, the brief wins.

**The five things that break a component:**

1. **Read `--accent`, never `--maroon` or `--gold`.** The accent **swaps token** on dark — maroon in
   light, gold on dark. A component hard-coded to one is invisible in the other and nothing warns you
2. **Fixed scales stay fixed.** `--up` / `--down`, the confidence chips, the badge metals.
   **Never team color**
3. **`--team-a` / `--team-b` are set per element by `team-chip.js`.** Never at `:root` in the pool.
   The live board's single-team `:root` overwrite is `GameRoom`'s and is correct only there
4. **A null primary is a defined state**, never whatever `#000000` does. **402 of 760 schools**
5. **No shadows.** `1px solid var(--line)`

**Type scale**, as measured in the reference implementation:

| Role | Size |
|---|---|
| Micro label | 10–11px |
| **Body — the workhorse** | **12–13px** |
| Emphasis, call buttons | 14–15px |
| Section heading | 17px |
| Figure | 20–22px |
| Score | 24px |
| **Bank balance — the largest type in the app** | **30px. Live layer only** |

**🔴 The pool has no bank strip and no 30px figure.** The pool scores in points; the live layer
stakes Marbles; **the two do not meet.** P2's headline figure is deliberately unassigned — **do not
inherit 30px to fill the hole.**

**Radius:** chips 4–5px · **buttons 9px** · **cards and panels 12px** · pills 22px.

---

## 10 · The eight requirements that must not be re-earned

**Your dispatch names which apply to you. Show the evidence for each.**

| # | |
|---|---|
| **7.1** | **ESPN ships two play-text grammars.** The live 2026 feed has jersey numbers and a tackler in parentheses; 2024–25 games on the same endpoints have full names and neither. **Sample the season you are shipping against** |
| **7.2** | **The parenthesized group at the end of a play is the TACKLER, never the ball carrier.** One card named three different people. **Emit an explicit star from the parser** |
| **7.3** | **A fixture is only evidence if it was captured from the feed** |
| **7.4** | **One call per snap** |
| **7.5** | **Layout bugs are invisible to tests.** Render it in a real browser at 393px and look |
| **7.6** | **A diverging chart shares one center line, and orientation is applied once** |
| **7.7** | **Show why the win-probability line moved.** The events are computed and have never been shown |
| **7.8** | **The win-probability chart carries the user's own calls** — filled landed, hollow missed. **The app's only unfair advantage on that screen** |

---

## 11 · The fixtures — read-only, and they are all you get

| File | What it is |
|---|---|
| `fixtures/real-utep-at-ou-260905-final.json` | A complete real ESPN game, 2026 season |
| `fixtures/real-ball-at-osu-260905-final.json` | idem |
| `fixtures/real-bois-at-ore-260905-final.json` | idem |
| `fixtures/teams.json` | **760 team identities.** 402 with a black or missing primary |

**Anything else you need is a capture job and a `COULD NOT CLOSE`.**

---

## 12 · Running it

```bash
npm run preview      # fixture-driven, no network, every screen and every state
npm test             # node --test
npx wrangler dev     # the Worker, when the session says so
```

**Preview URLs:** `http://127.0.0.1:8788/<screen-id>/<state>` — e.g. `/p2-slate/offline`.
**Measure at 393px in a real browser before claiming a layout works.**
