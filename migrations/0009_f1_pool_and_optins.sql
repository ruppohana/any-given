-- 0009 - F1 group pools, and the contact opt-ins. 2026-09-12.
--
-- Jason: "complete the pool revision, but do all the sports for the pool" - an F1
-- group plays the race weekend together, so the weekend picks (src/lib/f1.ts)
-- move from the phone to the server: one JSON document per member per event,
-- locked by the server's clock (src/f1-pool.ts).
--
-- And: "we need to collect emails", "grab their phone number as well", "opt in to
-- texts". The email is already required (0005); these record consent to be sent
-- anything beyond sign-in and group mail, and an optional phone number. Nothing
-- here sends a text - that needs a provider Jason has not set up.
--
-- Applied through the Cloudflare D1 connector (this machine's wrangler login is
-- refused for D1, code 7403) and recorded by hand in d1_migrations.

CREATE TABLE IF NOT EXISTS f1_pick (
  pool_id    TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  event_id   TEXT NOT NULL,          -- ESPN's event id for the Grand Prix
  picks      TEXT NOT NULL,          -- JSON: qual/sprint/race (3 driver ids), fastest, poleWins, dnf
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (pool_id, user_id, event_id)
);

ALTER TABLE account ADD COLUMN email_opt_in INTEGER NOT NULL DEFAULT 0;
ALTER TABLE account ADD COLUMN phone TEXT;
ALTER TABLE account ADD COLUMN sms_opt_in INTEGER NOT NULL DEFAULT 0;
