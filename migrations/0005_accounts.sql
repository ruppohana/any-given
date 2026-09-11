-- 🔴 EMAIL IS REQUIRED. Jason, 2026-09-10: "no, i want their email."
--
-- This reverses the settled rule that nothing sits in front of the slate - see
-- Swing Route/Any Given/wiki/decisions/email-is-required-2026-09-10.md. 0002's
-- comment ("no account, no email and no password anywhere in this schema, on
-- purpose") is now history; the device table stays, because a device is still
-- how a phone is recognised between visits. An account is what several devices
-- and one email have in common.
--
-- NO PASSWORDS, STILL. Verification is a six-digit code sent to the address;
-- a verified device gets a session token. There is nothing here to leak that
-- unlocks anything anywhere else.

CREATE TABLE IF NOT EXISTS account (
  id          TEXT PRIMARY KEY,           -- random, never derived from the email
  email       TEXT NOT NULL UNIQUE,       -- lowercased and trimmed before it gets here
  verified_at INTEGER,                    -- NULL until the code is confirmed
  age_ok      INTEGER NOT NULL DEFAULT 0, -- 1 = confirmed 13 or older at sign-up (COPPA)
  created_at  INTEGER NOT NULL
);

-- Which account a phone belongs to. A person can have several phones; a phone
-- belongs to one account at a time (the latest to verify on it wins).
CREATE TABLE IF NOT EXISTS device_account (
  device_id  TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  linked_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS device_account_by_account ON device_account (account_id);

-- One live code per email. Stored HASHED - a leaked table must not be a list of
-- working codes. Attempts are counted so a code cannot be guessed: six digits is
-- a million combinations, and five tries is a one-in-200,000 chance.
CREATE TABLE IF NOT EXISTS verify_code (
  email      TEXT PRIMARY KEY,
  code_hash  TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  sent_at    INTEGER NOT NULL,
  sends      INTEGER NOT NULL DEFAULT 1   -- per-email send count in the current window
);

-- What a verified phone presents. Random, stored hashed, revocable by deleting
-- the row.
CREATE TABLE IF NOT EXISTS session (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  device_id  TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS session_by_account ON session (account_id);
