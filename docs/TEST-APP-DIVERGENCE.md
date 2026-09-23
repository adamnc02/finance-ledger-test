# Test App Divergence Register — `finance-ledger-test` ↔ the live apps

**Check this file whenever you touch `finance-ledger-test` in any way:** starting a session in it,
porting a change from it to a live app, refreshing it from a live app, deploying it, or checking
"are the repos identical". It lists every file that is *meant* to differ in the test app. Anything
that differs and is not listed is either unported work or a bug. Never carry a listed file into a
live app.

`DIVERGENCE.md` is the other register. It covers only `personal-ledger` ↔ `shared-finance-ledger`.
The two never overlap: test-app tooling never goes in `DIVERGENCE.md`, and live-app divergence never
goes here.

📍 **`BUILD-PLAN` is not in this repo.** This file and eight source files here cite phases by number
(`BUILD-PLAN 3.3a`, `4.4`, `4.5`, `Phase 1`, `Phase 7`). They all mean
**`shared-finance-ledger/docs/BUILD-PLAN.md`** — one copy, deliberately, for all three ledger repos.
It is the phase register and the standing-risks index; **never renumber a phase**, because about 22
files across the three repos cite these numbers from code comments that cannot be kept in sync.

---

## How the test app works

**Decided by Adam, 2026-09-16.**

- **It mirrors whichever live app is receiving the change.** Before a session starts work, the test
  app's code must match that live app's `main`, **except** for the files listed below. Everything
  outside `DIVERGENCE.md`'s rows is identical in both live apps, so for ordinary app work it makes
  no difference which one is mirrored. It only matters when a change touches a file listed in
  `DIVERGENCE.md`.
- **Offline by default, even when mirroring `shared-finance-ledger`.** Bug fixes and features are
  tested with no sign-in. The offline build uses the localStorage store and skips the auth gate.
  Screens that only exist with a backend (Account, household linking) can't be exercised offline.
- **The exception: genuine Supabase/PowerSync work.** Then the test app runs as the sync app, with
  real sign-in, a real PowerSync store and real data. Use a **test account**, and wipe its data with
  in-app "Delete my app data" afterwards, keeping the login for reuse
  (`DELETE-APP-DATA-SHARED-FINANCE-LEDGER.md`).
- **Two deployed builds, one repo (PROMPT-06, option A):**

  | URL | Build | Stands in for | Badge |
  |---|---|---|---|
  | `adamnc02.github.io/finance-ledger-test/` | normal (`npm run build`) | offline testing of either live app | none |
  | `adamnc02.github.io/finance-ledger-test/sync/` | sync mode (`--mode sync`) | `shared-finance-ledger` | "SYNC MODE" |

  Since PROMPT-09 (2026-09-19), `/sync/` is the **real sync app**: sign-in, `ensure_household()`,
  PowerSync against the Development instance, its own local database file
  (`finance-ledger-test-sync.db`). The old `…:sync-preview` localStorage key is retired.
- **🚨 The sync build has no separate backend.** There is one Supabase project and one PowerSync
  instance (Free plan), shared with the live `shared-finance-ledger`, `personal-f` and
  `my-dream-clean`. So:
  - a test account is a real user;
  - its rows sit in the live `shared_finance_ledger` schema, kept apart only by household RLS;
  - a migration "tested" through the test app has already been applied to the live database.

  The test app sandboxes app code, never schema.
- **Both URLs share one origin** (`adamnc02.github.io`, which also hosts both live apps), and so
  share `localStorage`. The separate storage keys are what keep them apart; never reuse
  `ledger:app-data-v2:v1` for a test-only mode.
- **Supabase Auth redirect URLs must include `/finance-ledger-test/sync/`** before sign-in is tested
  there, or it silently lands on the wrong app (`MIGRATION-LESSONS.md` §2).

---

## Allowed test-app-only files

Created by PROMPT-06 (2026-09-17). Add each new row in the **same commit** that creates the
difference. Keep this list as short as possible, and keep each file's test-only part as small as
possible. Every file below starts with a `TEST APP ONLY` comment.

| Path / glob | Type | What it does | Added |
|---|---|---|---|
| `src/lib/store/selectLedgerStore.ts` | test-only file | The root (offline) build's store: `localStorageLedgerStore`. Since PROMPT-09 the `/sync/` build's store is created by `SyncRoot` after sign-in instead | PROMPT-06, changed PROMPT-09 |
| `src/components/SyncModeBadge.tsx` | test-only file | "SYNC MODE" pill, top centre (was "(preview)" until PROMPT-09) | PROMPT-06 |
| `src/vite-env.d.ts` | test-only file | Types `import.meta.env.VITE_SYNC_ENABLED`, and (PROMPT-09) the sync build's `VITE_POWERSYNC_DB_FILENAME`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_POWERSYNC_URL` | PROMPT-06, widened PROMPT-09 |
| `.env.sync` | test-only file | `VITE_SYNC_ENABLED=true` and (PROMPT-09) `VITE_POWERSYNC_DB_FILENAME=finance-ledger-test-sync.db`, loaded by `--mode sync`. The URL/key live in `.env.local`, never committed | PROMPT-06, widened PROMPT-09 |
| `src/App.tsx` | small diff | Renders the badge behind `import.meta.env.VITE_SYNC_ENABLED === 'true'`. Offline: `<LedgerApp store={selectLedgerStore()}>`. Sync (PROMPT-09): lazily loads `SyncRoot` inside the same flag check (so the root build contains none of it) and renders `<LedgerApp store={…}>` with the PowerSync store it hands back | PROMPT-06, changed PROMPT-09 |
| `vite.config.ts` | small diff | `syncModeAppName` plugin: in `--mode sync` only, renames the app to "Ledger SYNC test" (`<title>`, `apple-mobile-web-app-title`, built manifest `name`/`short_name`). The sync-manifest mechanism; `index.html` and `public/` stay identical | PROMPT-06 |
| `package.json` | small diff (scripts only, vs `shared-finance-ledger`) | `dev:sync`, `build:sync`, `check:sync-build`, and `deploy` = root build + `/sync/` build + `check-sync-build.ts` + `gh-pages -d dist`. (The PowerSync/Supabase dependencies match `shared-finance-ledger`'s; see "Mirrors shared-finance-ledger" below) | PROMPT-06 |
| `scripts/check-sync-build.ts` | test-only file | Proves the root build contains no sync code in **any** emitted file (no PowerSync, Supabase client, sign-in, project URL/key, stream name or sync db file; no worker/wasm assets), and `/sync/` has the badge, its own db file (never a live app's or `personal-f`'s), this app's stream with `includeDefaultStreams`, and its own name. Negative run (root built in sync mode): 4 failures. Not a `verify-*` script; `deploy` runs it | PROMPT-06, widened PROMPT-09 |
| `src/components/SyncRoot.tsx` | test-only file (until PROMPT-10) | The sync app's boot: sign-in gate → `ensure_household()` → connect to `shared_ledger_household` only → full-screen "Syncing…" until first sync → Import / Start fresh for an empty household → the ledger. Clears the local database if a different account used it last. Pulled forward from PROMPT-10 (Adam, §0.1 Q2 option A) | PROMPT-09 |
| `src/context/AuthContext.tsx`, `src/components/AuthGate.tsx` | test-only files (until PROMPT-10) | `personal-f`'s, unchanged apart from the title. PROMPT-10 brings them to `shared-finance-ledger` (BUILD-PLAN Phase 1 "Expected divergences") | PROMPT-09 |
| `src/components/AccountModal.tsx` | test-only file (until PROMPT-10 lands in the live app) | **PROMPT-10: the full modal.** Identity + provider, Change password (email accounts), sync status + Force Sync, rejected writes, **Household** (invite code: show/copy/regenerate, and Join with a code — BUILD-PLAN 4.4, inside this modal), **Cloud Backup** (Back Up Now / Restore behind a whole-household warning), Sign out, **Delete my app data** | PROMPT-09, rewritten PROMPT-10 |
| `src/components/LegacyDataMigration.tsx` | test-only file (until PROMPT-10 lands in the live app) | The empty-household screen, with the rescue of data saved on this device before sign-in existed (MIGRATION-LESSONS §24): Import this device's data / Import a file / Start fresh / Join with a code. **Reads `ledger:app-data-v2:v1` and never writes or removes it** | PROMPT-10 |
| `src/components/DuplicatePersonBanner.tsx` | test-only file (until PROMPT-10 lands in the live app) | The same-named person a join leaves behind (`duplicate_person_id`); merging goes through the app's own DeleteGuardModal | PROMPT-10 |
| `src/components/syncControls.ts` | test-only file (until PROMPT-10 lands in the live app) | What the boot sequence offers the screens inside it (restart, force sync), in its own module so `AccountModal` and `SyncRoot` don't import each other | PROMPT-10 |
| `.env.local` | never committed | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_POWERSYNC_URL`. Git-ignored; created from the terminal (MIGRATION-LESSONS §9). Needed to build `/sync/` | PROMPT-09 |
| `public/apple-touch-icon.png`, `public/icon-192.png`, `public/icon-512.png` | test-only files (own artwork) | The test app's own icon, so it can't be mistaken for a live app on the home screen (Adam's commit `b42c6672` "update"). The live apps have their own icons (PROMPT-08a Part A crop). **Never port these into a live app, and never port a live app's icons here.** Found unlisted by the 2026-09-19 start-of-session diff; added on Adam's say-so | 2026-09-19 (PROMPT-08c) |

## Mirrors `shared-finance-ledger`, not `personal-ledger` (PROMPT-09)

These are **not** test-only: they are the sync app's own files, identical in the test app and
`shared-finance-ledger` (so the start-of-session diff against `shared-finance-ledger` shows nothing for
them). **Since 2026-09-23 the live app is named "My Ledger"** (`shared-finance-ledger` `f3f3b41`), so
the name-bearing strings in `public/sw.js`, `src/lib/powersync/push.ts`, `AuthGate.tsx`, `SyncRoot.tsx`
and `AccountModal.tsx` differ from the test app's "Shared Ledger" by that word alone. Expect exactly
those in the diff; anything beyond the name is unported work. **Also only in `shared-finance-ledger`:** `keepalive/` and `.github/` (the
PowerSync keep-alive, BUILD-PLAN Phase 7, 2026-09-23) — never port them here; one repo runs it. Against `personal-ledger` they differ, because `personal-ledger` never syncs. **When the target is
`personal-ledger`, expect these in the diff and never port them there.** They are listed in
`shared-finance-ledger`'s `DIVERGENCE.md`.

| Path / glob | What it is |
|---|---|
| `src/lib/powersync/**` | The PowerSync client layer. **PROMPT-10 adds** `importIds.ts` (an import gets fresh ids), `legacyData.ts` (reads the old key, read-only), `linking.ts` (link codes) and `backup.ts` (cloud snapshots) |
| `src/lib/supabaseClient.ts` | The Supabase client (schema `shared_finance_ledger`) |
| `src/lib/store/powerSyncLedgerStore.ts` | The PowerSync `LedgerStore` |
| `scripts/verify-mapping-nulls.ts`, `scripts/verify-powersync-store-diff.ts`, `scripts/verify-first-sync-gate.ts`, `scripts/verify-legacy-migration.ts`, `scripts/verify-import-regenerates-ids.ts`, `scripts/verify-set-as-me.ts`, `scripts/verify-salary-sort-sync.ts`, `scripts/verify-restore-preserves-identity.ts`, `scripts/verify-same-household-reimport.ts`, `scripts/lib/fakeSyncDb.ts`, `scripts/lib/syntheticFixture.ts`, `scripts/print-sync-streams.ts` | Their checks, and the Sync Streams YAML generator |
| `public/sw.js`, `src/lib/powersync/push.ts`, `src/lib/powersync/pushState.ts`, `src/lib/powersync/alertEngine.ts`, `scripts/alertEngineBundle.ts`, `scripts/build-alert-engine.ts`, `scripts/lucide-react.server-stub.cjs`, `scripts/verify-alert-engine-bundle.ts`, `scripts/verify-notification-toggle.ts` | **PROMPT-14 Part 7 (2026-09-22)** — low-balance alerts. Identical here and in `shared-finance-ledger`; `personal-ledger` can never have them. 🚨 `build-alert-engine.ts` writes into the **Supabase repo**, and `verify-alert-engine-bundle.ts` compares against that same absolute path — so running the sweep in EITHER repo checks the one bundle. They agree because `src/lib` is identical in both; if that check ever fails in one repo and passes in the other, `src/lib` has drifted and that is the real finding |
| `package.json` dependencies `@powersync/web`, `@journeyapps/wa-sqlite`, `@supabase/supabase-js` | The sync dependencies |

> 🚨 **The six rows above marked "test-only file (until PROMPT-10…)" are STALE and have been since
> 2026-09-19.** PROMPT-10 landed: `SyncRoot.tsx`, `AuthContext.tsx`, `AuthGate.tsx`,
> `AccountModal.tsx`, `LegacyDataMigration.tsx`, `DuplicatePersonBanner.tsx` and `syncControls.ts`
> all exist in `shared-finance-ledger` now, with their own rows in `DIVERGENCE.md`. They belong in
> **this** section — mirrors of the sync app — not in "Allowed test-app-only files", and they ARE
> ported to `shared-finance-ledger` (PROMPT-14 did exactly that again on 2026-09-22). **Never port
> any of them to `personal-ledger`.** Noted 2026-09-22 rather than silently rewritten, because the
> table above is quoted in older session notes.

## Known pre-existing differences (not test tooling, not yet reconciled)

Found by `diff -rq` on 2026-09-16 (`personal-ledger` `e430c75` vs `finance-ledger-test` `8fc1e7f0`).
`src/` and `scripts/` are identical.

| Path | Difference | Status |
|---|---|---|
| `package-lock.json` | Transitive dependency versions drifted (e.g. `@csstools/css-calc` 3.4.0 live vs 3.3.0 test). `package.json` is identical | Harmless so far (both suites 108/108). Reconcile on the next change that touches dependencies |
| `.gitignore` | Trailing newline only | Cosmetic |
| `pensions-and-wallet-redesign.patch` | Tracked in `personal-ledger` only | Old artefact; PROMPT-07 already excludes it from the copy |

---

## The checks

**At the start of any test-app session**, after `git status`/`git log` in both repos:

```bash
cd ~/Documents/GitHub
# Replace personal-ledger with shared-finance-ledger when that is the target.
diff -rq personal-ledger finance-ledger-test -x node_modules -x .git -x dist -x .DS_Store
```

Every line must be a path in one of the two tables above. Anything else is stopped and shown to
Adam before work starts. It's either unported work in the test app or drift in the live app.

**When porting test → live** (`format-patch`/`git am`): exclude every path in "Allowed test-app-only
files". If a commit mixes a listed file with app code, split it before porting. After the port,
re-run the diff: it must show only listed paths.

**When refreshing the test app from a live app:** never overwrite a listed path. Carry those files
over from the test app's own `main`.

**Before `npm run deploy` in the test app:** the normal build must not contain the sync-mode marker
(PROMPT-06's dead-code check), and only the `/sync/` output may contain it. Never deploy a sync build
to a live app. Neither live app has the scripts to produce one.

---

## Change log

Append-only. Newest first.

### 2026-09-22 — PROMPT-14: Backup & Restore, and low-balance alerts
Nine files added to "Mirrors `shared-finance-ledger`": the two sync-store checks from Parts 4 and 5,
and the seven Part 7 alert files. All identical in the test app and `shared-finance-ledger`; none of
them may go to `personal-ledger`.

**The one genuinely new shape here:** `scripts/build-alert-engine.ts` writes
`silver-octo-invention/supabase/functions/ledger-alerts/_engine.js` — a file in a **third** repo —
and `verify-alert-engine-bundle.ts` in both app repos compares against that same absolute path. So
the sweep in either repo checks the one bundle, and a failure in one but not the other means
`src/lib` has drifted between them. That is a feature, not a co-ordination problem.

Also flagged: the six "until PROMPT-10 lands" rows in the allowed-test-only table have been stale
since 2026-09-19. See the note under that table.

**Parts 1–6 added nothing here.** `BackupSection.tsx` and `Toggle.tsx` are shared with all three
apps, which is what the placement slot exists to achieve.

### 2026-09-20 — PROMPT-13: RAG pie charts, round-ups and the Coin Jar
**Nothing new is test-only.** Every file PROMPT-13 touches is shared app code and went to both live apps: the RAG
ring and its legend (`ProgressRing.tsx`, `RagLegend.tsx`, `progressSection.ts`, `Home.tsx`), round-ups
(`roundUp.ts`, `potLedger.ts`, `LedgerContext.tsx`, `Expenses.tsx`, `Salary.tsx`, `Bills.tsx`, `Loans.tsx`,
`LocationEditor.tsx`), and Part C (`NumberInput.tsx`, `EditField.tsx`).

The start-of-session diff against `shared-finance-ledger` was clean: every difference was an already-listed row, plus
`.gitignore`'s known trailing newline.

Sync-layer only, so it mirrors `shared-finance-ledger` and is NOT test-only: the six new columns in
`src/lib/powersync/tables.ts` and `mapping.ts`, the extended `scripts/verify-mapping-nulls.ts`, and the new
`--columns` flag on `scripts/print-sync-streams.ts`. That flag was deliberately added to the EXISTING script rather
than a new file so `check:divergence` still reports 42 files.

### 2026-09-19 — PROMPT-11: Salary Sort across two devices
`scripts/verify-salary-sort-sync.ts` is sync-layer code (it mirrors `shared-finance-ledger`). Nothing
new is test-only: sorts carrying a `personId` and deriving their ids from the person and the payday
is shared app code, and went to both live apps.

### 2026-09-19 — PROMPT-10: auth, the legacy rescue, linking and the full Account modal
The `/sync/` build gains the full Account modal (link codes, cloud backup, change password, Force
Sync), the empty-household screen with the legacy-data rescue, the duplicate-person banner and the
"which person am I" prompt after a join. New test-only rows: `LegacyDataMigration.tsx`,
`DuplicatePersonBanner.tsx`, `syncControls.ts`; `AccountModal.tsx` rewritten. Four new
`src/lib/powersync/*` files and three new checks are sync-layer code (they mirror
`shared-finance-ledger`). **Not test-only, and shared with both live apps:**
`src/components/HeaderAccessory.tsx` and the one-line Wallet-header change in `src/pages/Salary.tsx`
(an empty slot the sync app fills with its Account button), and the widened
`scripts/verify-ledger-store.ts`.

### 2026-09-19 — household changes under an open device (PR #18)
`SyncRoot.tsx` re-boots when the store reports the household lost, and the empty-household screen follows deliveries. `AccountModal.tsx`
gets Clear on the rejected list. Both were already test-only rows. The store change is sync-layer code (mirrors `shared-finance-ledger`).

### 2026-09-19 — PROMPT-09: `/sync/` is the real sync app
The `/sync/` build now signs in and syncs through PowerSync (Adam: §0.1 Q2 option A, auth pulled
forward, test app only). Rows changed: `selectLedgerStore.ts` (root only), `SyncModeBadge.tsx`
("SYNC MODE"), `vite-env.d.ts`, `.env.sync` (the db file name), `App.tsx` (lazy `SyncRoot`),
`check-sync-build.ts` (no sync code in any root file). New test-only rows: `SyncRoot.tsx`,
`AuthContext.tsx`, `AuthGate.tsx`, `AccountModal.tsx` (PROMPT-10 ports them), `.env.local`. New
section: the sync layer files that mirror `shared-finance-ledger` rather than `personal-ledger`.
The shared `autoClear.ts` deterministic-id change and `verify-auto-clear-ids.ts` are ordinary app
code for all three apps, not listed here.

### 2026-09-17 — PROMPT-06: first test-app-only files
The `VITE_SYNC_ENABLED` sync mode and two-build deploy: the eight rows above. The `LedgerStore`
interface itself (`src/lib/store/LedgerStore.ts`, `localStorageLedgerStore.ts`, `LedgerContext.tsx`,
`ledgerStorage.ts`, `verify-ledger-store.ts`, `LedgerProvider.test.tsx`) is **not** test-only: it
was committed separately and ports to `personal-ledger`. Dead-code elimination proven by
`check-sync-build.ts`, including a negative run (root built in sync mode → 3 failures).

### 2026-09-16 — Batch 20 ported (note removed)
Batch 20 is merged into both repos (`de042dd4` / `6b4d9112`), and the ported files are byte-identical,
so the start-of-session diff is back to the three known pre-existing paths.

### 2026-09-16 — register created
Created at Adam's request, alongside the decision that `DIVERGENCE.md` records live-app divergence
only. It records the test-app operating model, and the three pre-existing non-tooling differences
found in the pre-PROMPT-06 review. No test-app-only files exist yet.

## Session note — 2026-09-23 (PROMPT-16)

Start-of-session `diff -rq shared-finance-ledger finance-ledger-test` showed, beyond the listed
paths, `AccountModal.tsx`, `AuthGate.tsx`, `SyncRoot.tsx`, `push.ts`, `sw.js`, `check-sync-build.ts`
and `index.html`/`manifest` differing — that is the **"My Ledger" rename**, which exists only in
`shared-finance-ledger` (`f3f3b41`) and is expected. **No new test-only file was added.** PROMPT-16's
new files (`src/lib/powersync/slowOperation.ts`, `src/lib/formOwner.ts`, `src/pages/BillOwner.test.tsx`,
`scripts/verify-slow-operation.ts`) and its changed files are **unported work** to carry to the live
apps after the UAT — `slowOperation.ts` and `verify-slow-operation.ts` are sync-only and need
`DIVERGENCE.md` rows when they land in `shared-finance-ledger`; the rest is shared code for both.
