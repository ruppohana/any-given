-- 🔴 A NAME AND A HANDLE. Jason, 2026-09-10: "sign in needs to know first name
-- and last name and handle, and verify if the handle is taken."
--
-- The handle is what other people see - on a group's standings, on a live board.
-- `handle` keeps the capitals the person typed; `handle_key` is the lowercased
-- copy the UNIQUE index enforces, so "Jason" and "jason" cannot both exist and
-- two people racing for one handle cannot both win - the database refuses the
-- second, whatever the app thought a moment earlier.
--
-- NULL for accounts made before this (a UNIQUE index allows many NULLs); they are
-- asked for a profile the next time they sign in.

ALTER TABLE account ADD COLUMN first_name TEXT;
ALTER TABLE account ADD COLUMN last_name TEXT;
ALTER TABLE account ADD COLUMN handle TEXT;
ALTER TABLE account ADD COLUMN handle_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS account_handle_key ON account (handle_key);
