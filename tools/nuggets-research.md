# Nuggets — the weekly research run

**Runs every day at 5:00 AM Pacific** from the Claude desktop scheduled task
`anygiven-nuggets-day-before` (titled *Any Given: weekly nuggets research*). **Since 2026-09-11 it
researches each team ONCE A WEEK, after its last game** (Jason: *"It only has to run once. So for the
NFL it can run after the last game on Monday, so Tuesday morning it can schedule to run. Then if it has
a problem it can run Wednesday morning, and so on."*). College teams come due Sunday morning, NFL teams
Tuesday morning; most other mornings nothing is due and the run stops at step 1. **A failed or missed
morning is simply picked up by the next one.**

**How Jason hears about a problem:** the run sends one PushNotification if anything fails (step 8 of
the task), and — independent of the laptop — the Worker emails him (`ALERT_EMAIL`) once a day after
10 AM if any game inside 48 hours still has a team without current nuggets (`src/nugget-due.ts`,
`GET /api/nuggets/due`). It ran day-before until 2026-09-11; the Cloudflare research desk exists but
is off (Jason: *"Laptop."*, at $2.29 a team).

**Why it exists** — Jason, 2026-09-10: *"grab 10 for each team, fun/odd nuggets and when all else
fails, factual, should cover the entire game"*, *"Current, and just before the game"*, *"1 day
earlier?"*, then *"yes, set up the day-before research runs"*. The decision page is
`C:\Claude\Knowledge\Swing Route\Any Given\wiki\decisions\stoppage-nuggets-are-researched-and-sourced-2026-09-10.md`.

The app reads `public/nuggets/<nfl|ncaa>/<espnTeamId>.json` and shows one nugget per stoppage in
the "Waiting for the snap…" tile, fun → odd → fact, never repeating in a game.

---

## The run

Work in `C:\Claude\Knowledge\anygiven`. It is its own git repo with a GitHub remote.

1. **List the teams that are due.**
   `node tools/nugget-teams.mjs` — read its output directly. **Never redirect it to a file**
   (`> "$TEMP/..."`): a write outside the repo is a permission prompt, and a prompt in an
   unattended run waits for a human who is asleep — it stalled the first dry run on 2026-09-10.
   **Once a week per team, after its last game** (Jason, 2026-09-11: *"for the NFL it can run after
   the last game on Monday, so Tuesday morning ... if it has a problem it can run Wednesday
   morning, and so on"*): a team is due for its next game inside 7 days once its previous game is
   over and its file was written on or before that game's day. It prints
   `{now, days, teams:[{league, teamId, team, opponent, gameDate, prevDate, file, asOf}], urgent, unshipped, errors}`
   — `urgent` is the due teams whose game is inside 48 hours; research those first. **If `errors` is
   non-empty (exit code 2), report which, and research only the teams that did list.** **If `unshipped`
   is non-empty, an earlier run wrote those files and never shipped them** (2026-09-11: all 27 NFL
   files sat checked on disk while the site showed them missing) — do not research them again; take
   them straight to step 3 and ship them with whatever is researched today. **If `teams`,
   `unshipped` and `errors` are all empty, stop and report "nothing due".** A normal week: college teams
   come due Sunday morning, NFL teams Tuesday morning; most other mornings nothing is due.

2. **Research in batches.** Four teams per subagent, keeping both teams of one game in the same
   batch where possible. Dispatch `general-purpose` subagents **in the background, at most 8 at a
   time**; when one finishes, dispatch the next batch. Give each the brief below with its teams
   filled in — every field, every time. **A subagent never spawns a subagent.**
   **Ship as soon as every due team's file exists and passes the check — never wait on a batch's
   report.** After each report arrives, run `node tools/nugget-check.mjs` over every due team's file;
   once all of them exist and pass, go to step 4 even if batches are still out. On 2026-09-11 two
   batches wrote their files and then sat forever on a permission prompt, their reports never came,
   and the run idled with all 27 files done and nothing shipped until a person noticed.

3. **Check every file written.**
   `node tools/nugget-check.mjs <each file>` — it fails on bad JSON, missing fields, over 140
   characters, a missing source, a kind other than fun/odd/fact, and betting / injury / legal
   words. **Fix by editing the text to what its source actually says, or delete the nugget.
   Never write a replacement you have not verified.** Re-run until it passes. A team with fewer
   than 10 true nuggets is fine.

4. **Ship.** `bash tools/ship.sh` (the test gate, then `wrangler deploy`), then
   `node tools/smoke.mjs`. If the ship fails, stop and report — do not commit.

5. **Commit and push, naming the files** — never `git add -A`:
   `git add -- public/nuggets/<lg>/<id>.json ...` then
   `git commit -m "Nuggets: <date> - <N> teams, researched the day before"` and `git push`.
   Confirm `git rev-parse main` equals `git rev-parse origin/main`.

6. **Log it in the vault, without running git there.** Append one line to
   `C:\Claude\Knowledge\Swing Route\Any Given\wiki\log.md`:
   `- **Nuggets <date>:** <N> teams, <M> nuggets; dropped: <short list or "none">.`
   Then write a job file `C:\Claude\Knowledge\.tools\NEXT-COMMIT\<yyyymmdd-hhmm>-nuggets.txt` whose
   line 1 is the commit message and line 2 is `Swing Route/Any Given/wiki/log.md`. The vault's own
   scheduler commits it.

7. **Report** in under 150 words: the date, teams researched, nuggets written, claims dropped,
   anything that failed.

---

## The subagent brief — send it whole, with the teams filled in

> You are researching "nuggets" for a free football app (Any Given). During a timeout or
> commercial break, the app shows one short, true, fun fact about one of the two teams playing.
> Today is **<today>**; these teams play **<game date>**. Facts must be CURRENT as of now (this
> season, this week, the current roster and coach), not stale trivia unless it is a timeless
> oddity (a tradition, a rivalry quirk, a stadium quirk, a historic first).
>
> TEAMS (ESPN team id | name | opponent) and the EXACT file each one goes to:
> - **<id> | <name> | <opponent>** -> `<file>`
> - …
>
> GOAL: up to 10 nuggets per team. Prefer, in order: "fun" (surprising, delightful), "odd"
> (quirky, weird, unusual), and only when you run out, "fact" (plain but interesting). Aim for
> at least 7 fun/odd per team. Good sources of fun: the current head coach's background and
> quirks, standout current players (records, unusual paths, famous relatives, unusual
> positions), streaks going into this game, the matchup's history, stadium and traditions,
> mascots, notable firsts, this season's results so far.
>
> RULE ZERO - NOTHING UNVERIFIED. Every nugget must be confirmed by OPENING the source page with
> WebFetch and seeing the claim stated there. A search-result summary alone is NOT verification -
> search summaries have been caught inventing things (one claimed a retired NFL star had
> un-retired; the cited article said no such thing). If you cannot open a page that states it,
> drop the claim. Fewer than 10 true nuggets is a correct result; a wrong one is a failure.
> Prefer official team and school sites, ESPN, AP, major outlets; Wikipedia only for stable facts.
> A fan site alone is not enough for a claim the official recap words differently.
>
> WRITING RULES for each nugget text:
> - One sentence, at most 140 characters. Plain, lively, readable in two seconds on a phone.
> - Name the team by its nickname ("The Jayhawks") or a player by full name; no pronoun openings.
> - US spelling. No emojis. No hashtags.
> - Never mention betting, odds, spreads, lines, gambling or wagers. Never mention injuries,
>   arrests, lawsuits, suspensions, scandals, or anything about a player as a minor. Nothing
>   mean-spirited, and nothing that reads as a dig at the opponent.
> - Do not mention the app.
>
> OUTPUT - write each team's file with the Write tool, exactly this JSON shape (valid, UTF-8):
> `{"league":"<nfl|ncaa>","teamId":"<id>","team":"<name>","asOf":"<today YYYY-MM-DD>","nuggets":[{"text":"...","kind":"fun","source":"https://..."}]}`
> "kind" is exactly one of "fun", "odd", "fact". "source" is the URL you opened that states it.
>
> CONSTRAINTS: Write ONLY the files listed above - create, edit or delete nothing else, and run
> NO shell command at all - no Bash, no PowerShell, no git, not even to check your own JSON (Read
> the file back instead). This run is unattended: a shell command waits on a permission prompt
> nobody will answer, and your report never arrives. If WebSearch or WebFetch are not loaded, load them with ToolSearch
> (query "select:WebSearch,WebFetch"). You are not being asked whether the feature is a good idea.
>
> RETURN (short): per team, nuggets written and the fun/odd/fact split; every claim dropped as
> unverifiable and why; the file paths written.

---

## What this run must never do

- **Never touch anything outside `public/nuggets/`** in the app repo, apart from the ship itself.
- **Never run git in `C:\Claude\Knowledge`** (the vault) — queue the job file instead.
- **Never ship a nugget without a source**, and never "fix" a failing nugget by inventing one.
