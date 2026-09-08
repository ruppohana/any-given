-- Any Given - initial schema. Session-owned. Sub-agents do not write migrations.
--
-- Live per-game state lives in the GameRoom Durable Object. D1 holds what settled.
-- The pool scores in POINTS. The live layer stakes MARBLES. They never sum, which
-- is why week_score and marble_ledger share no key and no view joins them.

CREATE TABLE pool (
  id              TEXT PRIMARY KEY,          -- the invite code, url-safe, no vowels
  name            TEXT NOT NULL,
  commissioner_id TEXT NOT NULL,
  -- ranked_v_ranked | conference | top25 | handpick | all. Set at creation.
  scope           TEXT NOT NULL,
  scope_arg       TEXT,                      -- conference id, or comma-joined game ids
  ranking_source  TEXT,                      -- 'ap' | 'cfp'. DIFFERENT LISTS. Named on screen
  ats             INTEGER NOT NULL DEFAULT 0,-- against-the-spread. Spreads render ONLY when 1
  season          INTEGER NOT NULL,
  -- Editable until the first kickoff of week 1, then locked with everything else.
  scope_locked_at INTEGER,
  created_at      INTEGER NOT NULL
);

CREATE TABLE member (
  pool_id      TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  display_name TEXT NOT NULL,     -- the MOST that may be asked, and only after the first pick
  joined_week  INTEGER NOT NULL,
  role         TEXT NOT NULL DEFAULT 'player',
  PRIMARY KEY (pool_id, user_id)
);

CREATE TABLE game (
  id           TEXT PRIMARY KEY,  -- CFBD game id
  season       INTEGER NOT NULL,
  week         INTEGER NOT NULL,
  kickoff_utc  INTEGER NOT NULL,  -- every pick locks at THIS. One lock rule, no policy menu
  home_team_id TEXT NOT NULL,     -- CFBD team id === ESPN team id
  away_team_id TEXT NOT NULL,
  spread       REAL,
  status       TEXT NOT NULL DEFAULT 'scheduled',
  home_score   INTEGER,
  away_score   INTEGER,
  -- THE ONE VOID PATH. A push, a cancellation and a postponement are all this.
  -- The game did not happen, for everybody. No special cases.
  void         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX game_week ON game (season, week, kickoff_utc);

CREATE TABLE pick (
  pool_id   TEXT NOT NULL,
  user_id   TEXT NOT NULL,
  game_id   TEXT NOT NULL,
  side      TEXT NOT NULL,        -- 'home' | 'away'
  made_at   INTEGER NOT NULL,
  locked_at INTEGER,              -- set at kickoff. Editable until then
  PRIMARY KEY (pool_id, user_id, game_id)
);
CREATE INDEX pick_game ON pick (pool_id, game_id);   -- the pool's OWN crowd split

-- ONE parlay per user per week. 3..6 legs, chosen from picks already made.
-- Legs lock independently: a parlay can be half-locked.
CREATE TABLE parlay_leg (
  pool_id   TEXT NOT NULL,
  user_id   TEXT NOT NULL,
  week      INTEGER NOT NULL,
  game_id   TEXT NOT NULL,
  side      TEXT NOT NULL,
  locked_at INTEGER,
  result    TEXT,                 -- 'won' | 'lost' | 'void' | NULL
  PRIMARY KEY (pool_id, user_id, week, game_id)
);

-- One field. One named game of the week, the same rule for every pool.
-- Not a commissioner setting. Collected WITH the picks, so P2 owns it.
CREATE TABLE tiebreak (
  pool_id         TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  week            INTEGER NOT NULL,
  game_id         TEXT NOT NULL,
  predicted_total INTEGER,
  PRIMARY KEY (pool_id, user_id, week)
);

CREATE TABLE week_score (
  pool_id       TEXT NOT NULL,
  user_id       TEXT NOT NULL,
  week          INTEGER NOT NULL,
  points        INTEGER NOT NULL DEFAULT 0,   -- POINTS. Never Marbles
  parlay_points INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (pool_id, user_id, week)
);

-- The live layer. MARBLES. Starts at 100 every game and refills every game:
-- finite inside a game, reset at the next. Nobody is ever locked out of the app.
-- The board ranks on PROFIT (balance - start), so a referral buys a deeper bench
-- and never a place.
CREATE TABLE marble_ledger (
  game_id       TEXT NOT NULL,
  user_id       TEXT NOT NULL,
  seq           INTEGER NOT NULL,
  snap_id       TEXT NOT NULL,
  side          TEXT NOT NULL,     -- 'run' | 'pass'
  stake         INTEGER NOT NULL,
  p             REAL NOT NULL,     -- the price AT THE MOMENT OF THE CALL
  payout        INTEGER,           -- stake / p, capped at 6x
  balance_after INTEGER NOT NULL,
  PRIMARY KEY (game_id, user_id, seq)
);
-- 7.4 ONE CALL PER SNAP, enforced by the database and not only by the code.
CREATE UNIQUE INDEX one_call_per_snap ON marble_ledger (game_id, user_id, snap_id);
