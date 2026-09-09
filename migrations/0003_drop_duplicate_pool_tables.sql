-- 🔴 UNDOING A DUPLICATE SCHEMA I CREATED WITHOUT READING WHAT WAS THERE.
--
-- 2026-09-09: asked to "set up the D1", I wrote 0001_pools.sql defining `pools`,
-- `members`, `picks` and `results` — while 0001_init.sql and
-- 0002_sport_and_teams.sql already defined `pool`, `member`, `pick`, `game`,
-- `team`, `week_score`, `parlay_leg`, `tiebreak` and `marble_ledger`. Both
-- applied cleanly, because SQLite has no opinion about a schema meaning the same
-- thing twice under different names.
--
-- 🔴 THAT IS THE WORST KIND OF DUPLICATE: nothing errors, both sets of tables
-- work, and whichever one the endpoints happen to be written against becomes the
-- real one by accident. The other fills with nothing and looks like a feature
-- nobody finished. Caught by listing sqlite_master rather than by any failure.
--
-- The existing schema is also the better one — it carries scope, ranking source,
-- the scope lock, joined_week, week_score and the deliberate separation of
-- marble_ledger from week_score. Mine had none of that.
--
-- Safe to drop: every one of the four was empty, verified by COUNT(*) before
-- writing this. Dropping a table with rows in it would be a different question
-- and would not have been done without asking.
DROP TABLE IF EXISTS picks;
DROP TABLE IF EXISTS members;
DROP TABLE IF EXISTS pools;
DROP TABLE IF EXISTS results;
