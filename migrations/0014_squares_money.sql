-- SQUARES SHEETS: A NAME AND A BOX PRICE IN MARBLES. Jason, 2026-09-13: "sometimes we have a
-- $1 box/sheet and maybe a $5 box sheet. figure that out. i dont want 3 different groups" -
-- then "we are not holding any money or paying out any money, call them marbles for all i
-- care". A sheet gets a name and a box price in marbles; the app shows the pot, the payouts
-- and what each person put in and won, all in marbles. No dollars are recorded anywhere
-- (vault: decisions/squares-track-the-money-2026-09-13.md).

ALTER TABLE squares_grid ADD COLUMN name TEXT;                            -- NULL = "Sheet <n>"
ALTER TABLE squares_grid ADD COLUMN box_marbles INTEGER NOT NULL DEFAULT 0; -- 0 = a sheet played for points only
ALTER TABLE squares_grid ADD COLUMN split TEXT;                           -- JSON [4] percents; NULL = 25/25/25/25
