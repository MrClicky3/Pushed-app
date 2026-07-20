# Overload — agent instructions

A minimalistic gym logging + analytics app (progressive overload tracker).

## Two assistants, one repository

This project is developed by two AIs — **Claude Code** and **Bolt AI** — so work can
continue when credits run out on one. **The Git repository is the single source of
truth.** The other assistant may have changed anything since you last looked.

**At the start of every session, read the repo before changing anything.** Understand
the current state from the code and recent Git history. If your conversation memory
conflicts with what is actually in the repo, the repo wins — discard the memory. Do
not resume a stale session and start editing from files you loaded days ago; that is
how one assistant silently overwrites the other's work.

Within a single session, once you have read the repo you do not need to keep
re-reading it. Re-read when the user says they have switched assistants, says
"refresh", or when a file surprises you.

**Before finishing work:**
- Make sure it actually works — run `npm run typecheck` and `npm run build`, and
  exercise the change in the browser. Do not report success without checking.
- Commit and push with a clear message. Push early and often, not just at the end:
  if the work is not pushed, the other assistant cannot see it.

## Stack

React 18 + TypeScript, Vite, Tailwind, Supabase. Deployed on Vercel.

```
npm run dev        # vite dev server (port 5173)
npm run typecheck  # tsc --noEmit — must be clean
npm run build      # production build
npm run lint       # eslint
```

`tsconfig` sets `noUnusedLocals` and `noUnusedParameters`, so dead variables and
unused parameters are build errors, not warnings. Keep the code clean.

## Environment

`.env` is gitignored and is **not** in the repo. Copy `.env.example` to `.env` (or set
these in your host's environment panel) or the app will refuse to start:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Both are safe in a browser bundle: the anon key is a *publishable* key and every table
is protected by row-level security. **`RESEND_API_KEY` is different** — it is a real
server-side secret used only by `api/report.ts`, it lives in the Vercel dashboard, and
it must never be committed or sent to the browser.

`api/` holds Vercel serverless functions. They do not run in Bolt's WebContainer, so
bug reporting is inert in a Bolt preview. That is expected — do not try to "fix" it.

## Environments — two stages, two databases

| Stage | Branch | Vercel | Supabase project |
|---|---|---|---|
| Production (what the public sees) | `main` | betatest-overload.vercel.app | `overload` (prod) |
| Staging / dev | `dev` | branch preview URL | `overload-dev` |

**Work happens on `dev`. `main` is release-only** — merge `dev` → `main` when a change
is ready for real users. Pushing to `main` deploys to the public site immediately;
there is no gate in front of it.

The two stages point at **separate Supabase projects**. This is the whole point: it is
what stops an experimental migration from hitting real users' training data. Never
point a preview build at the production database to "just test something."

Env vars are set per-environment in the Vercel dashboard, not in the repo:
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` differ between Production and Preview.
`RESEND_API_KEY` is Production-only; bug reporting simply returns 503 on staging,
which is correct behaviour, not a bug to fix.

Auth redirects and invite links use `window.location.origin`, so they follow whatever
domain the build is served from. Each Supabase project must allowlist its own stage's
URLs under Auth → URL Configuration, wildcards included, or sign-in bounces.

A migration must be run against **both** projects — staging first, production once it
is proven. Committing it still applies it nowhere.

## Persistence — this split is deliberate

**Supabase:** exercises, workout logs, auth, profiles, friends/leaderboards, and —
since 2026-07-20 — routines and the weekly schedule.

**localStorage only:** settings (accent, units, timer, haptics) and small bits of UI
state. Streaks are still computed client-side from logs, not stored.

Routines and the schedule used to be localStorage-only. They were moved into the
`routines` / `schedule` tables because they did not follow a user to a second device
and vanished when the browser was cleared, while the logged workouts beside them
survived — which read as a bug. `useSchedule.ts` still seeds its initial state from
the old localStorage keys so the first render is instant, and lifts any pre-existing
local data into the database once per user (remapping the old `routine-…` ids onto
uuids). Do not remove that migration path until every active user has loaded the app
at least once.

Schema changes go in `supabase/migrations/`. Committing a migration does **not** apply
it — someone must run it against the hosted project, staging first (see Environments).
Both assistants share these projects, so a destructive migration hits real data
immediately.

## Design system

Dark, minimal, TE-inspired (hence the `te-*` prefix). Utility classes are defined in
`src/index.css` — **use them instead of inventing new styles**: `te-panel`, `te-inset`,
`te-mono`, `te-label`, `te-field`, `te-toggle-on` / `te-toggle-off`, `te-btn`, `te-fab`,
`te-digit`.

CSS variables (also in `index.css`):

| Token | Value | Use |
|---|---|---|
| `--te-upper` | `#9b8cf2` | upper-body category |
| `--te-lower` | `#f2c08c` | lower-body category |
| `--te-pr` | `#7fd57f` | personal record / target hit |
| `--te-warn` | `#e8a657` | warning |
| `--te-accent` | `#ff453a` | app accent |

Conventions that were arrived at deliberately — **keep them:**

- Card / bento borders are `1px solid #202020`. Card backgrounds are `#141414`;
  sheet backgrounds `#161617`; inset fields `#0b0b0b`.
- Corner radius is `20px` on cards and fields, `28px` on bottom sheets.
- App side margins are `max(16px, env(safe-area-inset-*))`.
- Numbers use the mono face (`te-mono`) with tabular figures.
- Bottom sheets (`Modal.tsx`) drag to dismiss iOS-style: the sheet tracks the finger
  1:1 and only dismisses on release past a threshold — never mid-drag. There is no
  border on the sheet. The gap to the screen edge is 2px.
- Full-screen flows (e.g. the Exercise Library) use `FullPageSheet.tsx`, not `Modal`.

Respect the existing visual language. If a change would alter spacing, radii, borders,
or colors beyond what was asked, ask first rather than redesigning.

## Layout

```
src/views/       ExercisesView, AnalyticsView (Progress), LogsView, AuthView
src/components/  Modal, FullPageSheet, ExerciseCard, ExerciseModal, ScheduleModal, ...
src/hooks/       useAuth, useWorkoutData, useSchedule, useSettings, useProfile, useFriends
src/lib/         supabase, streak, accent, device, bugReport, image, feedback
supabase/        SQL migrations
api/             Vercel serverless functions
```
