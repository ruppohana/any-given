' 🔴 THE SLATE POLLER. Generated to match the per-sport game pollers.
'
' WHY IT HAS TO EXIST: the two game pollers each follow ONE game. Nothing was
' re-reading the WEEK, so once a slate was captured it never learned that a
' game had kicked off, gone final, or moved. That is invisible until somebody
' looks for an outcome - Picks can only ever say "pending", because the row it
' reads still says `scheduled` days after the game was played.
'
' 0 = hidden window. This one DOES wait (True): unlike the game poller it is a
' short one-shot fetch-and-push per sport, not a long-lived loop, so letting it
' finish is what keeps two runs from overlapping on the same KV key.
Dim sh, node, root
Set sh = CreateObject("WScript.Shell")
node = "C:\Users\jstua\AppData\Local\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.18.0-win-x64\node.exe"
root = "C:\Claude\Knowledge\anygiven\tools\poll-slate.mjs"
sh.Run """" & node & """ """ & root & """ --sport nfl --week 1", 0, True
sh.Run """" & node & """ """ & root & """ --sport college-football --week 2", 0, True
