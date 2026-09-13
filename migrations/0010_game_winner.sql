-- A KNOCKOUT HAS A WINNER. Jason, 2026-09-13: "a knockout round has a winner, that
-- is the winner". A soccer match level after extra time and decided on penalties
-- (the 2026 Champions League final, PSG 1-1 Arsenal, PSG on penalties) is still
-- WON by one side, and ESPN flags it on the competitor. 'home' or 'away' when a
-- level final was nonetheless won; NULL for every other game. Read by the
-- standings (src/lib/groups.ts gradeSql) before the score, so a draw pick loses
-- a shootout.
ALTER TABLE game ADD COLUMN winner TEXT;
