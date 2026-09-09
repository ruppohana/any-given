-- 🔴 THE WORLD BOARD. Jason, 2026-09-09: "For the pool, the point is that you
-- can see your standing vs the world, or select your group, yes?"
--
-- Yes, and it solves the cold start rather than merely adding a view. A group
-- pool of one person is not a pool: if the only board is your group, the app is
-- dead until somebody has talked three friends into installing it. A world board
-- has everybody in it from your first pick, so the screen is worth opening on
-- day one and the group becomes the thing you graduate TO.
--
-- 🔴 THE WORLD IS A POOL ROW, NOT A SPECIAL CASE IN CODE. Every query, every
-- join and every scoring rule then works on it unchanged, and the standings
-- screen switches scope by changing one id. A parallel "global" code path would
-- be a second implementation of scoring that has to be kept in step with the
-- first, and would silently diverge the first time only one of them was fixed.
--
-- 🔴 STRAIGHT UP, because it is the pool half and Jason settled that on
-- 2026-09-09: "Group pool. Straight up." The week's card is the against-the-
-- spread product and it is not a pool.
--
-- The commissioner is the empty string: nobody owns the world, and there is no
-- person whose account could be used to change its rules.
INSERT OR IGNORE INTO pool (id, name, commissioner_id, scope, scope_arg,
                            ranking_source, ats, season, scope_locked_at,
                            created_at, sport)
VALUES ('world-cfb', 'The world', '', 'all', NULL, NULL, 0, 2026, NULL,
        strftime('%s','now') * 1000, 'college-football'),
       ('world-nfl', 'The world', '', 'all', NULL, NULL, 0, 2026, NULL,
        strftime('%s','now') * 1000, 'nfl');

-- 🔴 A PICK NEEDS ITS WEEK AND ITS SPORT TO BE SCOREABLE WITHOUT THE GAME TABLE.
-- The game table is populated by the slate poller and may lag a pick by minutes;
-- a standings query that has to join to it in order to know which week a pick
-- belongs to returns nothing at all in that window. Carrying both on the pick
-- makes the board correct immediately and the join an enrichment rather than a
-- dependency.
ALTER TABLE pick ADD COLUMN week INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pick ADD COLUMN sport TEXT NOT NULL DEFAULT 'college-football';
-- The line AS IT WAS when the pick was made. An ATS pool graded against the
-- CURRENT line re-grades every pick each time the book moves, so somebody who
-- took +3 on Tuesday would be settled at +6.5 on Saturday.
ALTER TABLE pick ADD COLUMN spread_at REAL;

CREATE INDEX IF NOT EXISTS pick_by_pool_week ON pick (pool_id, sport, week);
