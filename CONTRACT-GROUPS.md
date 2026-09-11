# CONTRACT-GROUPS — frozen 2026-09-11, for the group-pools fan-out

**Read `CONTRACT.md` §1 (rule zero), §2 (the three-part return), §4 (screen module
shape) and §5 (the design rules that fail a piece) first. They all apply here.** This
file adds what the group section needs and overrides nothing in them except where it
says so.

Jason, 2026-09-11, the brief in his words: *"group pools ... if i am not part of a
group, we are missing a step. we need to invite people or join another group. so we
need a button to start a group, with a name and then invite people to this invite only
group. if i am part of a group, great then i can pick games. if i am part of more than
one group, then i need a dropdown to enter different selections for the different
groups. if i stated the group i am the commisiner. and can set up the different rules.
if i am part of a group, i would like a button an email to the commish or the group ...
under group pools we also need a seperate standings page. it is almost like this is its
own seperate pages and bottom nav bar, seperate from the other betting pages and live
pages ... it probably needs its own rules pages etc. the commish should be able to kick
someone out of the group as well as send other invites asa they see fit. they are
responsible to kindness."* And "sure" to relaying email through Any Given.

---

## 1 · The section

Group pools is **its own section with its own bottom bar**, reached from Home's
"Group pools" door (which now goes straight to `#/gpicks`).

| Route (hash) | Screen module | state | Group-bar tab lit |
|---|---|---|---|
| `#/gpicks` | `p2-slate` | `group` | **Pool** |
| `#/gstandings` | `p5-standings` | `group` | **Standings** |
| `#/g` | `g1-group` | `ready` | **Info** |
| `#/gcommish` | `g2-commish` | `ready` | **Info** |
| `#/grules` | `g3-group-rules` | `ready` | **Info** |

**The group bar** (session-owned, `components/nav.js` + `app.js`): **Home · Pool ·
Standings · Info** — Jason's own four, 2026-09-11: *"home, pool, standing and info"*.
Home is the app's front door (`#/home`), the way out. **Pool** is your picks in the
current group. **Info** (`#/g`, `g1-group`) is the group page: start or join when you are
in none; otherwise the members, the messages, the commissioner's tools (a door to
`#/gcommish`) and the group's rules (a door to `#/grules`). The main bar (Home · Live ·
Slate · My picks · Standings · More) is untouched and never shows on these routes.

**So `p2-slate` in `group` state with no group (or signed out) must not be a dead end:**
it shows the start-or-join card that sends you to `#/g`.

**Amended mid-run, 2026-09-11, after A's return — an invite link lands on `#/g`, not the
slate.** `app.js` looks up `/?pool=CODE`, stores `ag.pendingPool` and opens `#/g`, where
`g1-group` fills Join with the code and **clears the key after a successful join**. The
public slate **no longer joins anyone on a first pick and shows no "You're invited" line**
— a group's picks are its own, so a slate pick could never count there. D was told.

**The current group** is `localStorage['ag.group']` (a group code). Read and write it
**only** through `components/group.js`. It is not `ag.scope` (that is the old world/group
selector on the main Standings and stays as it is).

---

## 2 · The API — built, deployed, and checked 32/32 against local D1

All `/api/group/*` routes need a signed-in account with a handle. **Call them with
`(window.agApiFetch || fetch)(url, opts)`** — apiFetch attaches the session and, on a 401
`email_required` / `profile_required`, opens the sign-in sheet and retries once.

| Route | Who | Body / query | Returns |
|---|---|---|---|
| `GET /api/group/mine` | anyone signed in | – | `{groups:[{id,name,sport,week,ats,members,role}], kindness}` |
| `POST /api/group/create` | anyone signed in | `{name, sport:'nfl'\|'college-football', pledge:true, ats?}` | `{ok, group:{id,name,sport,week,ats,members,role:'commissioner'}, invite:{code,link}}`; 400 `pledge_required` / `name_required` |
| `POST /api/group/join` | anyone signed in | `{code}` (any case/spacing) | `{ok, group:{id,name,sport,week,ats,role}}`; 404 `no_group`, 403 `removed`, 409 `full` |
| `GET /api/group/detail?id=` | a member | – | `{group:{id,name,sport,week,ats,createdAt,pledged}, you:{role,muted}, commissioner (handle), members:[{ref,name,role,you,muted?}], invite:{code,link}\|null, mailer:bool, kindness}` — `muted` and `invite` only for the commissioner |
| `POST /api/group/settings` | commissioner | `{id, name?, ats?}` | `{ok, group:{id,name,ats}}` |
| `POST /api/group/remove` | commissioner | `{id, ref}` | `{ok, removed}`; 400 `self` |
| `POST /api/group/mute` | commissioner | `{id, ref, muted:bool}` | `{ok, muted}` |
| `POST /api/group/leave` | a member | `{id}` | `{ok, closed:bool}` — a commissioner leaving hands the group to the longest-standing member; the last one out closes it |
| `POST /api/group/invite` | commissioner | `{id, emails: string\|string[]}` | `{ok, sent, bad[]}`; 503 `no_mailer`, 429 `limit` |
| `POST /api/group/message` | a member | `{id, to:'commish'\|'group', body}` | `{ok, sent}`; 403 `muted`, 400 `self`/`empty`, 503 `no_mailer`, 429 `limit` |
| `POST /api/pool/pick` | a member | `{poolId: <group id>, gameId, side, sport, week, spread?, kickoffUtc?}` | `{ok, poolId}`; 403 `not_a_member`; 409 `locked` |
| `GET /api/pool/standings?sport=&week=&pool=<group id>` | anyone | – | `{pool, sport, week, rows:[{id,name,picks,wins,played}]}` — **now scores the group's own picks** |

Every error body carries `message` — **show it verbatim**; it is written for a person.
Limits (`src/lib/groups.ts` `LIMITS`): name 40, message 1000, 20 invites a batch, 50
invites a day per group, 10 messages a day per member, 200 members.

---

## 3 · The shared component — `public/components/group.js` (session-owned)

```js
import { currentGroupId, setCurrentGroupId, myGroups, pickCurrent, groupSwitcher, GROUP_CSS }
  from '/components/group.js';
```

- `myGroups({ force })` → `Promise<{ signedIn:boolean, groups:Group[], kindness:string }>`.
  Cached 20s in memory; `force:true` refetches. Never throws; offline returns
  `{ signedIn, groups: [], error: 'offline' }`.
- `pickCurrent(groups)` → the stored group if it is still in the list, else the first;
  stores and returns it (or `null` for an empty list).
- `currentGroupId()` / `setCurrentGroupId(id)` — the `ag.group` key.
- `groupSwitcher(groups, currentId, onChange)` → an element: a labeled `<select>` when
  there are 2+ groups, the group's name as plain text when there is one. `onChange(id)`
  is called after `setCurrentGroupId`.
- `GROUP_CSS` — inject it once in your screen's style block, the way screens use
  `TEAM_CHIP_CSS`.

**Screens get data in `previewData(fixtures, state)` — that is the one place a group
screen may call the API** (p5-standings already does). `render()` never fetches; actions a
person takes (tap Create, Send, Remove) call the API from their click handler and then
re-render.

---

## 4 · 🔴 File ownership for this run

| Owner | Files |
|---|---|
| SESSION | `CONTRACT-GROUPS.md`, `src/*`, `migrations/*`, `public/app.js`, `public/index.html`, `public/components/*` (incl. `group.js`, `nav.js`), `public/styles/*`, `tools/*` |
| **A** | `public/screens/g1-group.screen.js`, `public/screens/g1-group.css`, `tests/g1-group.test.mjs` |
| **B** | `public/screens/g2-commish.screen.js`, `public/screens/g2-commish.css`, `tests/g2-commish.test.mjs` |
| **C** | `public/screens/g3-group-rules.screen.js`, `public/screens/g3-group-rules.css`, `tests/g3-group-rules.test.mjs` |
| **D** | `public/screens/p2-slate.screen.js`, `public/screens/p2-slate.css`, `tests/p2-slate.test.mjs` |
| **E** | `public/screens/p5-standings.screen.js`, `public/screens/p5-standings.css`, `tests/p5-standings.test.mjs` |

**Touch nothing else.** A change you need outside your set is a `COULD NOT CLOSE` item.

---

## 5 · The rules for these screens

- **Every state that has data has `empty`, `loading`, `offline` and `error`.** Group
  screens also need **`signed-out`** (a sign-in prompt that calls `window.agOpenSignIn()`
  and re-renders on success) and, where it applies, **`no-group`** (a door to `#/g`).
- **Never show an email address.** Members are handles. Nothing in the UI asks for or
  prints another member's address.
- **Destructive actions confirm** — remove a member, leave a group. A plain in-page
  confirm row (a second tap), not `window.confirm`.
- **The kindness line** is shown where a group is started (the checkbox the commissioner
  ticks) and on the commissioner screen. Use the `kindness` string the API returns.
- **Points only.** Nothing in the group section mentions Marbles, stakes, prices, odds,
  bets, or sums with the live board. `CONTRACT.md` §5 **Words** and **Boards** apply.
- **US spelling, 44px tap targets, tabular numbers, `1px solid var(--line)` depth, no
  box-shadow, read `--accent`, no icon fonts, inline SVG only.**
- **Use `pageHeader` (`/components/header.js`) with `noTitle: true`** — the top bar names
  the screen.

---

## 6 · How to run it — rule zero for a screen is a real browser at 393px

The session runs **one** local Worker for the whole fan-out: `http://localhost:8787`,
backed by a local D1 that has migration 0007 and three seeded accounts. **Test in the
Claude Browser pane against `http://localhost:8787` only** — a different origin from
anygiven.app, so nothing you store there touches Jason's real session. **Never open
anygiven.app and never write to its storage.**

Seeded sign-in (set `localStorage['ag.session']` and `localStorage['ag.handle']` on
`http://localhost:8787` only):

| Handle | `ag.session` |
|---|---|
| `cora` | `4e7434a758cefcf2d3468a1dff10310dc2787621358f79c8aa95a753f99ab9ed` |
| `mo` | `c388ce3f56826a65e7108b2d45fcaff47d27f11b24fc1442f757171523140e40` |
| `otto` | `09bd1b1b182b1edfc5b46d42b87f934ac1886763dfbfc3aafa87fdce3ae0e5f5` |

**After you edit your files, run `node tools/build-static.mjs`** — the Worker serves
`dist/`, and the build now refreshes it in place while the server runs. Resize the pane
to 393 wide (`resize_window`), then back to `preset: "desktop"` when done. Local email is
not configured: invite and message return `503 no_mailer` — render that `message`; do not
treat it as a bug.

**`npm test` must stay at 0 failing.** Your own test file pins what your screen promises.
