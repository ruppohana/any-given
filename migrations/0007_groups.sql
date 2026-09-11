-- 0007 · GROUP POOLS AS THEIR OWN SECTION - Jason, 2026-09-11: start a group
-- with a name, invite-only, a commissioner who sets the rules, removes members
-- and is "responsible to kindness", email the commissioner or the group, and
-- "if i am part of more than one group, then i need a dropdown to enter
-- different selections for the different groups".
--
-- ADDITIVE ONLY. No column is dropped or retyped, so every existing route keeps
-- working through the deploy.

-- A commissioner can mute a member's messages to the group.
ALTER TABLE member ADD COLUMN muted INTEGER NOT NULL DEFAULT 0;

-- When the commissioner accepted the kindness line at creation. NULL for groups
-- created before this migration.
ALTER TABLE pool ADD COLUMN pledge_at INTEGER;

-- Removed members, so the invite code does not simply let them back in.
CREATE TABLE IF NOT EXISTS pool_removed (
  pool_id    TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  removed_at INTEGER NOT NULL,
  PRIMARY KEY (pool_id, user_id)
);

-- One row per invite batch or message sent, for the daily limits. It holds a
-- recipient COUNT, never an address or a body.
CREATE TABLE IF NOT EXISTS pool_mail (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  pool_id    TEXT NOT NULL,
  from_user  TEXT NOT NULL,
  kind       TEXT NOT NULL,          -- 'invite' | 'commish' | 'group'
  recipients INTEGER NOT NULL,
  sent_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS pool_mail_by ON pool_mail (pool_id, from_user, sent_at);

-- 🔴 PER-GROUP PICKS. Until now every pick lived in the world pool and each
-- group's board scored its members' world picks. From here a group's picks are
-- its own (the dropdown above). So each existing group starts with a copy of its
-- members' world picks in that group's sport - its board keeps its counts, and
-- from now on the member can change them group by group.
INSERT OR IGNORE INTO pick (pool_id, user_id, game_id, side, made_at, locked_at, week, sport, spread_at)
SELECT m.pool_id, p.user_id, p.game_id, p.side, p.made_at, p.locked_at, p.week, p.sport, p.spread_at
  FROM pick p
  JOIN member m ON m.user_id = p.user_id
  JOIN pool g   ON g.id = m.pool_id
 WHERE p.pool_id LIKE 'world-%'
   AND m.pool_id NOT LIKE 'world-%'
   AND g.sport = p.sport;
