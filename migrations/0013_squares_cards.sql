-- SQUARES: MORE THAN ONE CARD IN A POOL. Jason, 2026-09-13: "we will also need to add
-- additional cards to the same pool." A group can run several 10 x 10 cards on the Big
-- Game, each with its own claims, its own limit and its own draw (src/squares-pool.ts).
-- A card is numbered from 1. Every grid made before this is card 1 - its rows are carried
-- over, not lost - then the tables are swapped in place.

CREATE TABLE IF NOT EXISTS squares_grid_new (
  pool_id        TEXT NOT NULL,
  card           INTEGER NOT NULL DEFAULT 1,
  event_id       TEXT NOT NULL,
  lock_at        INTEGER NOT NULL,
  max_per_person INTEGER NOT NULL DEFAULT 10,
  rows_digits    TEXT,
  cols_digits    TEXT,
  drawn_at       INTEGER,
  created_at     INTEGER NOT NULL,
  PRIMARY KEY (pool_id, card)
);
INSERT OR IGNORE INTO squares_grid_new (pool_id, card, event_id, lock_at, max_per_person, rows_digits, cols_digits, drawn_at, created_at)
  SELECT pool_id, 1, event_id, lock_at, max_per_person, rows_digits, cols_digits, drawn_at, created_at FROM squares_grid;
DROP TABLE squares_grid;
ALTER TABLE squares_grid_new RENAME TO squares_grid;

CREATE TABLE IF NOT EXISTS squares_cell_new (
  pool_id    TEXT NOT NULL,
  card       INTEGER NOT NULL DEFAULT 1,
  cell       INTEGER NOT NULL,
  user_id    TEXT NOT NULL,
  claimed_at INTEGER NOT NULL,
  PRIMARY KEY (pool_id, card, cell)
);
INSERT OR IGNORE INTO squares_cell_new (pool_id, card, cell, user_id, claimed_at)
  SELECT pool_id, 1, cell, user_id, claimed_at FROM squares_cell;
DROP TABLE squares_cell;
ALTER TABLE squares_cell_new RENAME TO squares_cell;
CREATE INDEX IF NOT EXISTS squares_cell_by_user ON squares_cell (pool_id, user_id);
