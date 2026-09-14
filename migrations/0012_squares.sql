-- BIG GAME SQUARES. Jason, 2026-09-13: "for the super bowl, can we create squares people
-- can pick? that usual thing?" - then "only the super bowl and we cannot say superbowl,
-- right?" The app says "the Big Game". A 10 x 10 grid: members claim squares until
-- kickoff; at kickoff the digits 0-9 are drawn at random for each team's side; at the
-- end of each quarter the square where the last digits of the two scores meet scores
-- points. Points only, like every pool here. A group whose sport is 'squares' plays
-- this (src/squares-pool.ts).

-- One grid per group.
CREATE TABLE IF NOT EXISTS squares_grid (
  pool_id        TEXT PRIMARY KEY,
  event_id       TEXT NOT NULL,              -- ESPN's event id for the game
  lock_at        INTEGER NOT NULL,           -- kickoff, ms since epoch; claims refused from here on
  max_per_person INTEGER NOT NULL DEFAULT 10,
  rows_digits    TEXT,                       -- JSON [10]: the home team's digit on each row; NULL until the draw
  cols_digits    TEXT,                       -- JSON [10]: the away team's digit on each column
  drawn_at       INTEGER,
  created_at     INTEGER NOT NULL
);

-- A claimed square: cell 0-99, row = cell / 10 (home digit), column = cell % 10 (away digit).
-- The primary key makes a square one person's.
CREATE TABLE IF NOT EXISTS squares_cell (
  pool_id    TEXT NOT NULL,
  cell       INTEGER NOT NULL,
  user_id    TEXT NOT NULL,
  claimed_at INTEGER NOT NULL,
  PRIMARY KEY (pool_id, cell)
);
CREATE INDEX IF NOT EXISTS squares_cell_by_user ON squares_cell (pool_id, user_id);
