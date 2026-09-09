# THE POLLER, OWNED BY WINDOWS RATHER THAN BY A SESSION.
#
# 🔴 WHY. On 2026-09-08 the poller ran clean for 36 minutes and exited 4 with no
# error line — the background shell that owned it was torn down and the process
# went with it. Nothing said so. The Worker kept serving the last state it had
# been pushed, so /#/live still drew a score, a board and a delay bar over a game
# that had stopped existing.
#
# THAT IS THE WORST FAILURE THIS APP HAS, because it does not look like one. A
# blank screen sends somebody to find out why. A frozen one does not.
#
# Two answers, and both are needed. This is the first: something that is not a
# chat session owns the process and restarts it when it dies. The second is on
# the screen — it says out loud when the feed has gone stale, because a
# supervisor that is itself dead has to be visible from the phone.
#
#   powershell -ExecutionPolicy Bypass -File tools\poll-task.ps1 401872656 nfl
#   powershell -ExecutionPolicy Bypass -File tools\poll-task.ps1 -Status
#   powershell -ExecutionPolicy Bypass -File tools\poll-task.ps1 -Remove
#
# 🔴 THE TRIGGER *IS* THE SUPERVISOR, and this is the whole trick.
#
# The task fires every two minutes and Task Scheduler's default
# MultipleInstancesPolicy is IgnoreNew — verified on this machine, not assumed.
# So while the poller is alive every tick does nothing at all, and the first tick
# after it dies starts it again. Restart-on-failure without a restart-on-failure
# setting, and the poller itself needs no supervisor code.
#
# 🔴 THREE ROUTES WERE TRIED AND TWO ARE DELETED. A hand-rolled PowerShell
# `while ($true) { & node ... }` loop died instantly and silently, twice, on
# PowerShell 5.1 turning a native command's redirected stderr into a terminating
# error. `Register-ScheduledTask` and `schtasks /Create /XML` — the only routes
# that can express a real <RestartOnFailure> block — both return "Access is
# denied" without elevation. Plain `schtasks /Create /SC MINUTE` needs none.
# The vault's rule: name the alternative before building the workaround, and when
# the right tool turns up, delete the workaround rather than keep both.
#
# 🔴 TWO KNOWN HOLES, recorded rather than discovered later:
#   - MODERN STANDBY. This laptop runs S0 low-power idle, so a task can start
#     late and be frozen mid-run when the machine re-enters standby.
#   - BATTERY. schtasks sets StopIfGoingOnBatteries=true and there is no flag to
#     turn it off; the XML that could is the one that needs elevation. KEEP THE
#     MACHINE PLUGGED IN DURING A GAME.
# Both are survivable for a game somebody is watching with the lid open, and both
# are exactly why the SCREEN also says when the feed is stale. Neither half is
# sufficient on its own.

param(
  [string]$GameId,
  [string]$Sport = 'nfl',
  [int]$Every = 10,
  [switch]$Remove,
  [switch]$Status
)

# 🔴 NOT 'Stop', AND NO BARE 2>&1 ON schtasks. PowerShell 5.1 wraps a native
# command's redirected stderr in an ErrorRecord and sets $? false even on exit 0
# — the vault records this — so a /Delete on a task that does not exist yet
# becomes a fatal error in a script whose first step is exactly that. cmd's own
# redirection swallows it where the failure is genuinely expected.
$ErrorActionPreference = 'Continue'
$name = 'AnyGiven Poller'
$repo = Split-Path -Parent $PSScriptRoot

if ($Remove) {
  cmd /c "schtasks /Delete /TN `"$name`" /F >nul 2>&1"
  Write-Output "removed: $name"
  exit 0
}

if ($Status) {
  $q = cmd /c "schtasks /Query /TN `"$name`" /FO LIST /V 2>&1"
  if ($LASTEXITCODE -ne 0) { Write-Output "not registered"; exit 0 }
  $q | Select-String -Pattern '^(Status|Last Run Time|Last Result|Next Run Time|Task To Run):' |
    ForEach-Object { $_.ToString().Trim() }
  exit 0
}

if (-not $GameId) { Write-Output "usage: poll-task.ps1 <espnGameId> [sport] [-Status] [-Remove]"; exit 1 }

# A real node path, not whatever the calling shell happened to have. A scheduled
# task starts with a different PATH from a terminal, and "node is not recognized"
# at kickoff is not a thing to find out at kickoff.
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { Write-Output "no node on PATH"; exit 1 }

$script = Join-Path $repo 'tools\poll.mjs'
$tr = "\`"$node\`" \`"$script\`" $GameId --sport $Sport --every $Every"

cmd /c "schtasks /Delete /TN `"$name`" /F >nul 2>&1"

$create = cmd /c "schtasks /Create /TN `"$name`" /TR `"$tr`" /SC MINUTE /MO 2 /F /RL LIMITED 2>&1"
if ($LASTEXITCODE -ne 0) { Write-Output "could not register: $create"; exit 1 }
$run = cmd /c "schtasks /Run /TN `"$name`" 2>&1"
if ($LASTEXITCODE -ne 0) { Write-Output "registered but would not start: $run"; exit 1 }

# 🔴 The banner prints only after both calls actually succeeded. The vault
# records the opposite habit costing an evening: commit.ps1 printed "Vault
# committed and pushed." unconditionally, so the one line anybody reads said the
# opposite of what had happened.
Write-Output "registered and started: $name"
Write-Output "  game     $Sport $GameId"
Write-Output "  restart  a tick every 2 min does nothing while it runs, and restarts it when it dies"
Write-Output "  ends     poll.mjs writes .poll-done-$Sport-$GameId at final, and refuses to restart after that"
Write-Output "  check    powershell -File tools\poll-task.ps1 -Status"
Write-Output "  stop     powershell -File tools\poll-task.ps1 -Remove"
