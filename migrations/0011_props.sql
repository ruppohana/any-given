-- QUESTIONS POOLS - the pool for everything ESPN does not score. Jason, 2026-09-13:
-- "add cricket too, and non sports, golf, oscars, everything damn it that hits a
-- certain viewship." The Emmys, the Oscars, Survivor, the Kentucky Derby, the NFL
-- Draft, Super Bowl props, cricket until ESPN's feed carries it: a group's
-- commissioner writes questions (or loads a ready set), everyone picks one option
-- per question before it locks, and the commissioner enters the answers. A group
-- whose sport is 'props' plays these (src/props-pool.ts).

CREATE TABLE IF NOT EXISTS prop_question (
  pool_id    TEXT NOT NULL,
  qid        TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  text       TEXT NOT NULL,
  options    TEXT NOT NULL,              -- JSON array of option strings, 2 to 20
  points     INTEGER NOT NULL DEFAULT 1, -- what a right answer scores, 1 to 10
  lock_at    INTEGER NOT NULL,           -- ms since epoch; picks refused from here on
  answer     TEXT,                       -- one of the options, 'void', or NULL = not settled
  settled_at INTEGER,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (pool_id, qid)
);

-- One pick per person per question, by the primary key - a second pick overwrites.
CREATE TABLE IF NOT EXISTS prop_pick (
  pool_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  qid     TEXT NOT NULL,
  choice  TEXT NOT NULL,
  made_at INTEGER NOT NULL,
  PRIMARY KEY (pool_id, user_id, qid)
);
CREATE INDEX IF NOT EXISTS prop_pick_by_question ON prop_pick (pool_id, qid);
