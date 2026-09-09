-- The pool half is sport-agnostic. This is what makes that true in storage.
--
-- 0001 assumed one sport and a team file shipped with the app. Both were college
-- assumptions: teams.json is 760 SCHOOLS, and nothing in the schema said which
-- sport a game belonged to. NFL is the test rig - 16 games a week instead of 131,
-- so every bug is visible - and it needs neither of those assumptions to hold.

ALTER TABLE game ADD COLUMN sport TEXT NOT NULL DEFAULT 'college-football';
ALTER TABLE pool ADD COLUMN sport TEXT NOT NULL DEFAULT 'college-football';

-- Identity travels with the feed now rather than shipping with the app, because
-- a slate is useless without it and no bundled file covers two sports.
-- '000000' is NEVER stored: it means "no color captured", and a null says so.
CREATE TABLE team (
  id        TEXT PRIMARY KEY,      -- ESPN team id, which is also the CFBD id
  sport     TEXT NOT NULL,
  abbrev    TEXT NOT NULL,
  name      TEXT NOT NULL,
  short     TEXT NOT NULL,
  primary_c TEXT,
  second_c  TEXT
);

-- A person is a display name and a device until they choose otherwise. There is
-- no account, no email and no password anywhere in this schema, on purpose.
CREATE TABLE device (
  id         TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

CREATE INDEX game_sport_week ON game (sport, season, week, kickoff_utc);
