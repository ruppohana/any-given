-- A SPONSOR BANNER ON A PRIVATE POOL. Jason, 2026-09-12: "Can we add, send a
-- banner and we can put it on your private pool?" A business - the group's
-- employer, the bar they watch at - sends a banner and it goes on that pool,
-- for its members. Branding only: no prizes, nothing a player buys, members
-- play free (decisions/pools-are-free-2026-09-12.md). Every banner is approved
-- before it is set, and set only by us - tools/sponsor.mjs - never by a user.
--
-- sponsor_image is a path under /sponsors/ (a file shipped in public/sponsors/),
-- never an outside URL; sponsor_url is where a tap goes (https only).
ALTER TABLE pool ADD COLUMN sponsor_name TEXT;
ALTER TABLE pool ADD COLUMN sponsor_image TEXT;
ALTER TABLE pool ADD COLUMN sponsor_url TEXT;
