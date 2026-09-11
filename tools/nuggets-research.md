# Nuggets — the day-before research run

**Runs every day at 5:00 AM Pacific** (Jason moved it from 9 AM on 2026-09-10) from the Claude desktop scheduled task
`anygiven-nuggets-day-before`. It researches every team that plays **tomorrow** (Pacific) and
ships their nugget files before kickoff. A day with no games tomorrow is a no-op. Friday's run
covers Saturday's college slate (~160 teams); Saturday's covers Sunday's NFL.

**Why it exists** — Jason, 2026-09-10: *"grab 10 for each team, fun/odd nuggets and when all else
fails, factual, should cover the entire game"*, *"Current, and just before the game"*, *"1 day
earlier?"*, then *"yes, set up the day-before research runs"*. The decision page is
`C:\Claude\Knowledge\Swing Route\Any Given\wiki\decisions\stoppage-nuggets-are-researched-and-sourced-2026-09-10.md`.

The app reads `public/nuggets/<nfl|ncaa>/<espnTeamId>.json` and shows one nugget per stoppage in
the "Waiting for the snap…" tile, fun → odd → fact, never repeating in a game.

---

## The run

Work in `C:\Claude\Knowledge\anygiven`. It is its own git repo with a GitHub remote.

1. **List the teams.**
   `node tools/nugget-teams.mjs > "$TEMP/nugget-teams.json"`
   It prints `{date, dayBefore, teams:[{league, teamId, team, abbrev, opponent, file, asOf}]}` —
   only teams whose file is missing or older than the day before the game. **If `teams` is empty,
   stop and report "no games tomorrow" (or "all fresh").**

2. **Research in batches.** Four teams per subagent, keeping both teams of one game in the same
   batch where possible. Dispatch `general-purpose` subagents **in the background, at most 8 at a
   time**; when one finishes, dispatch the next batch. Give each the brief below with its teams
   filled in — every field, every time. **A subagent never spawns a subagent.**

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
> CONSTRAINTS: Write ONLY the files listed above - create, edit or delete nothing else, and do
> not run git. If WebSearch or WebFetch are not loaded, load them with ToolSearch
> (query "select:WebSearch,WebFetch"). You are not being asked whether the feature is a good idea.
>
> RETURN (short): per team, nuggets written and the fun/odd/fact split; every claim dropped as
> unverifiable and why; the file paths written.

---

## What this run must never do

- **Never touch anything outside `public/nuggets/`** in the app repo, apart from the ship itself.
- **Never run git in `C:\Claude\Knowledge`** (the vault) — queue the job file instead.
- **Never ship a nugget without a source**, and never "fix" a failing nugget by inventing one.
