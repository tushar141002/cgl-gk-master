# flow.md — Code Execution Flow

How execution travels through CGL GK Master: the entry points, which function calls which, and in what order. Read this before changing any flow; update it in the same commit when you do.

> **Status:** Step 9 (second content batch) is complete. **Landed and tested:** `shared/contract.ts`, `shared/canonicalJson.ts`, `shared/uuid.ts`, `src/core/*.ts` (eight classes), the `tools/content/` pipeline, `src/ui/*.css` with the self-hosted Mukta subset, the Svelte 5 shell (`src/app/`), the Dexie schema and the repositories (`src/data/`), typed bilingual UI copy, the signed-pack installer, client sync and the auth/history/scheduler seams (`src/auth/`, `src/sync/`, `src/services/`), the backend migrations and tests (`supabase/`, `tests/server/`), the Home/chooser/practice screens, 60 verified bilingual questions in the bundled pack and 300 drafted questions across 12 new sub-topics. Mock, Progress and Report screens are still placeholders; everything else below is still **planned**; replace `(planned)` markers with real paths as each file lands.
>
> **Reviewed 2026-11-01 (Step 1.6):** F1, F2 and F7 corrected to keep `core/` pure (D-030); F4 carries reports and drops client aggregates (D-028); F6 states the correction-before-pack grading rule; F8 given local session persistence (D-029); F9 rewritten for daily immutable files (D-027); F11 and F12 added. D-026 to D-031 were all accepted on 2026-11-01.
>
> **Updated 2026-11-04 (Step 2.0):** folder map includes `shared/` and `tests/`; import matrix allows `core/` → `shared/` types only (D-036); F2 now names the real `Attempt.create(question, chosen, ms, ctx)` and `updateSkill(skill, questionRating, outcome)` signatures.
>
> **Updated 2026-11-04 (Step 2.1):** `ReviewScheduler` is real and synchronous; F2 calls `review(cardState, outcome, now, examDeadline)` and caps the due date at the exam (D-037).
>
> **Updated 2026-11-07 (Step 2.2):** `Replayer` is real. F6 now re-grades through the corrected index and rebuilds; F7 names `rebuild(attempts, checkpoint, index)`; the checkpoint cursor is the `"<at>:<id>"` tuple (D-038..D-040). F2 also states where a new card comes from.
>
> **Updated 2026-11-07 (Step 2.3):** `StreakTracker` is real. F1 derives the streak from all daily rows instead of one summary; F2 names `apply(attempt, todaySummary)`; F10 uses `goalMet(todaySummary, settings.dailyGoal)` (D-041..D-043).
>
> **Updated 2026-11-07 (Step 2.4):** `AdaptiveEngine` and `QuestionPicker` are real. F3 shows the widening loop (`targetRange(skill, step)`), the single `pick(dueCards, candidates, recentIds, rng)` call, and the `{ qid, reason } | null` result (D-044..D-046).
>
> **Updated 2026-11-07 (Step 3):** `Question.ts` and the content pipeline are real. F5 now names the canonical manifest body; F13 is the offline build that turns the CSV master into signed packs (D-047..D-050).
>
> **Updated 2026-11-07 (Step 4):** the UI layers are real: `ui/index.css` imports fonts → tokens → base → components. `ui/preview.html` is the living reference. No screen exists yet, so F1–F12 keep their planned paths; screens must compose the components rather than restyle them (D-051..D-054).
>
> **Updated 2026-11-07 (Step 5):** the shell is real. F1 now runs `main.ts › start()` → `app/bootstrap.ts › bootstrap()`. The router, Dexie schema, repositories, i18n and theme helpers have real paths; Home and Settings render, other routes are placeholders until their steps land (D-055..D-058).
>
> **Updated 2026-11-07 (Step 6):** F1 now installs the bundled signed pack through `sync/PackInstaller.ts` after the shell mounts. F2 and F3 are real: `app/PracticeRoute.svelte` drives `services/PracticeService.ts`, which owns the single answer transaction and the due-first picker. The chooser lives at `#/practice`; a session is `#/practice/:subtopic` (D-059..D-062).
>
> **Updated 2026-11-07 (Step 7A):** the server half of F4 is real. `supabase/migrations/` defines the tables, RLS, `apply_sync_batch`, `sync_pull` and `compact_sync_inbox`; `supabase/functions/sync/index.ts` is the thin `/sync` adapter. F9 now runs `compact_sync_inbox()` and the archive half is still planned as 7A-2. The client `SyncManager` and the checkpoint loader are 7B/7C (D-063..D-068).
>
> **Updated 2026-11-07 (Step 7B):** the client half of F4 is real. `sync/SyncManager.ts` pins a batch, sends it through `sync/SyncTransport.ts`, records the cursor and folds corrections in through `sync/CorrectionApplier.ts`; F11's queue is `data/repositories/ReportRepository.ts` in a new `reports` table (Dexie v2). F6 is now one transaction and `PracticeService.answer` grades against a stored correction; the timer/backoff caller and the real token are 7C (D-069..D-072).
>
> **Updated 2026-11-07 (Step 7C):** F1 creates the runtime and starts the scheduler after `auth.load`; F4 runs through `services/SyncScheduler.ts` with a real bearer token, a five-minute timer, wake signals and retry scheduling; F7 is the real PKCE sign-in, account claim, upload-then-pull and single rebuild (D-073..D-076).
>
> **Updated 2026-11-07 (Step 9):** F13 now covers batch 2. The master holds 60 verified and 300 draft rows across 15 sub-topics; `validate` reports all 360, while `build` still emits only the three verified packs, so `public/packs/` and `content/bundled.lock.json` stay at v2 until a draft is promoted (D-078).
>
> **Updated 2026-11-07 (Step 10):** F13 adds the review loop. `content:review` exports a sheet for one status and optional sub-topic; `content:promote` applies approve/reject/fix to the master through a stale-sheet guard and does not rebuild, so the build stays an explicit step (D-079).
>
> **Updated 2026-11-14 (Step 7A-2):** F9 is real: `nightly_archive` writes immutable day files and records them, removes deleted accounts' folders and compacts; pruning needs archive, checkpoint and 30 days (D-091). F4 offers the server a phone-written checkpoint after a successful sync, and F7's full pull adopts the newest checkpoint first.

> **Updated 2026-11-13 (Step 7E):** F8 is real: `list_mocks`, `start_mock`, `submit_mock`, `mock_leaderboard` and `mock_review` in a migration, `sync/MockTransport.ts`, `services/MockService.ts` with the local `mockSessions` table, and `#/mock` and `#/mock/:id` screens. F12 also deletes mock sessions and answers (D-090).

> **Updated 2026-11-12 (Step 7D security):** F4's RPC is now a rate-limited wrapper around `apply_sync_batch_unthrottled`, and `rate_limited` is retryable (D-088). Production builds get a CSP meta tag (D-087).

> **Updated 2026-11-12 (Step 7D):** F12 is real. `delete_user()` lives in a migration, not an Edge Function; the client calls it through `sync/AccountTransport.ts`, wipes with `data/database.ts › wipeLocalData()` only after it confirms, and Settings gains a separate "Erase data on this phone" action (D-086).

> **Updated 2026-11-07 (Step 11):** F13 adds content hashes and `--carry`, a separate Hindi sheet with a hard `hi_check=ok` approval gate, the `source_ref`/non-front-page approval gate, and the advisory `content:sources` and `content:dupes` reports (D-080..D-083).

---

## Rules for humans and AI agents

1. **Update this file in the same commit as any change that alters a flow**: a new entry point, a function added to or removed from a chain, a changed call order, or a new async boundary.
2. **Use real `path/file.ts › function()` names** exactly as they appear in code. If a name changes, update every flow that uses it.
3. **Mark side effects** on each step: `[DB read]`, `[DB write]`, `[network]`, `[UI]`, `[notification]`.
4. **Mark async boundaries** with `⟶ async` and transactions with `⟦ txn ⟧ … ⟦ /txn ⟧`.
5. **Write the failure path** under each flow: what happens if a step throws or the network is down.
6. **Keep each flow short.** If a chain goes deeper than 4 levels, link to a sub-flow instead of nesting further.
7. **If a flow change came from a decision, reference it** (for example "see D-016" in `design.md`).

### Notation

```
file.ts › function()                 one step
├─ file.ts › child()                 called by the step above, in order
│  └─ file.ts › grandchild()
└─ file.ts › nextChild()
⟦ txn ⟧ … ⟦ /txn ⟧                    one IndexedDB transaction
⟶ async                              runs later / in background
```

---

## Folder map

```
shared/
  contract.ts                boundary types + constants + istDayKey() / encodeCursor() /
                             compareCursor(); settings types (D-055); no I/O, no imports
  canonicalJson.ts           canonical JSON for manifest signatures (D-050); no I/O
  uuid.ts                    uuidV7() for attempt and device ids (D-011); injected RNG

src/
  main.ts                    entry point: bootstrap, first-run theme, mount, Android back
  config.ts                  readConfig() / appConfig(): Supabase URL, anon key, redirect
                             URL; missing values make the build guest-only (D-073)
  auth/                      GoTrue and PKCE seams, no UI (D-073)
    pkce.ts                  verifier / S256 challenge / state / authorize URL / callback parse
    GoTrueClient.ts          exchangeCode / refresh / logout over injected fetch + clock
    TokenStore.ts            session in localStorage; memory fallback
    PendingAuthStore.ts      verifier + state in sessionStorage, 10-minute TTL
    OAuthBrowser.ts          Capacitor Browser + app deep link; window redirect on web
  app/
    App.svelte               root component: route switch, settings save, i18n provider,
                             content install state, account card, runtime + scheduler (F1)
    syncRuntime.ts           composition root: auth, transports, SyncManager, HistoryService,
                             SyncScheduler; null for a guest-only build (F1, F7)
    HomeRoute.svelte         loads ProgressService.overview(), renders Home
    PracticeRoute.svelte     chooser/session state, timing and callbacks (F2, F3)
    bootstrap.ts             bootstrap(): open DB, ensure settings, mint device id (F1)
    router.ts                parseHash / buildHref / matchPath / navigate / subscribePath (D-056)
    NavBar.svelte            four-item bottom navigation
  core/                      pure TypeScript domain classes, no I/O (D-030)
    Attempt.ts               landed: create / from / regrade / toJSON
    EloRating.ts             landed: expectedScore / kFactor / updateSkill /
                             updateQuestionRating / newSkill
    ReviewScheduler.ts       landed: newCard / review (FSRS-7, sync preset, D-037)
    Replayer.ts              landed: rebuild / regrade (checkpoint replay, D-038..D-040)
    StreakTracker.ts         landed: apply / evaluate / goalMet (IST days, D-041..D-043)
    AdaptiveEngine.ts        landed: targetRange (band + widening, D-044)
    QuestionPicker.ts        landed: pick (due first, random new, D-045..D-046)
    Question.ts              landed: from / issues / isCorrect / localized (D-047..D-049)
  data/
    database.ts              Dexie schema (11 tables, v2) and openDatabase()   landed
    repositories/            landed: Question, Attempt, Card, Skill, Daily, Pack,
                             Settings, Sync, Correction, Report.
                             Planned: Bookmark, Mock
  services/
    PracticeService.ts       landed: next / answer (one transaction, D-060, D-072)
    ProgressService.ts       landed: overview / topics for Home and the chooser
    examDeadline.ts          landed: examDeadlineFrom(examDate)
    AuthService.ts           landed: sign-in, session restore, single-flight refresh,
                             account claim, sign-out (F7, D-073, D-075)
    HistoryService.ts        landed: paged sync_pull, merge, one rebuild, cursor (F7, D-074)
    SyncScheduler.ts         landed: 5-minute timer, wake signals, retry and auth gate (D-076)
    ReminderService.ts  MockService.ts
    ReportService.ts  AccountService.ts                       (planned)
  sync/
    PackInstaller.ts         landed: verify manifest + hash, replace packs (D-059)
    contentPublicKey.ts      landed: pinned Ed25519 public key
    SyncManager.ts           landed: runOnce / uploadAll, pinned retry, corrections
                             (D-069..D-072)
    SyncTransport.ts         landed: SyncTransport + HttpSyncTransport; PullTransport +
                             HttpPullTransport (D-069 amendment, D-074)
    CorrectionApplier.ts     landed: one-transaction correction fold (F6, D-072)
    derived.ts               landed: shared replay index + rebuild of cardState, skills,
                             dailySummary (F6, F7)
    backoff.ts               landed: retryDelay() doubling, jitter, server hint
    PackUpdater.ts  ManifestVerifier.ts  CheckpointLoader.ts     (planned)
  ui/
    index.css                the only stylesheet the app imports (Step 4)
    tokens.css               colour/type/space/radius/motion tokens, light + dark (D-051..D-054)
    base.css                 element defaults, 16px body, focus ring, reduced motion
    components.css           btn, option, card, chip, field, banner, sheet, nav, ...
    fonts.css                six @font-face blocks for self-hosted Mukta (D-052)
    fonts/                   subset woff2 files + OFL.txt
    preview.html             living design-system page; open in a browser
    theme.ts                 applyTheme / applyLanguage / theme hint (D-055)
    icons.ts                 IconName union for the inline Lucide set
    Icon.svelte              inline SVG icon component
    i18n/messages.ts         en + hi dictionary, translate()        landed (D-057)
    i18n/context.ts          provideI18n / useI18n                  landed
    screens/                 landed: Home, Practice, PracticeChooser, Settings,
                             Placeholder, StorageError, MockList, MockTest, MockResult
                             planned: Progress, ReportError
    mockFormat.ts            mock phase, India-time dates, countdown, marks (D-090)
supabase/
  migrations/                applied in filename order by the CLI and by tests
    20261107090000_sync_core.sql   tables, constraints, indexes, triggers (D-063)
    20261107090100_sync_rpc.sql    RLS, grants, ist_day(), apply_sync_batch(),
                                   sync_pull(), compact_sync_inbox() (D-064..D-067)
    20261112090000_delete_user.sql delete_user(): account deletion (F12, D-086)
    20261112090100_sync_rate_limit.sql  per-user limit wrapper on apply_sync_batch (D-088)
    20261113090000_live_mocks.sql  mock tables, RLS, list/start/submit/leaderboard/review (F8, D-090)
    20261114090000_archive_checkpoints.sql  archive manifest, put/latest checkpoint, prune rule (D-091)
  functions/
    sync/index.ts            POST /sync adapter: method, bearer, size cap, RPC call
    grade_mock/              live mock grading                           (planned)
    nightly_archive/index.ts nightly: archive days, remove deleted folders, compact (F9, D-091)
    _shared/archiveCodec.ts  compact attempt encoding + gzip + SHA-256 (D-027)
    _shared/archiveJob.ts    runArchive() with injected ports; tested in Node

tests/
  core/                      Attempt.test.ts, EloRating.test.ts, ... (Vitest, node env)
  shared/                    canonicalJson.test.ts, uuid.test.ts
  app/                       router.test.ts, theme.test.ts, bootstrap.test.ts,
                             config.test.ts
  auth/                      pkce.test.ts (RFC 7636 vector), GoTrueClient.test.ts,
                             TokenStore.test.ts
  data/                      repositories.test.ts (fake-indexeddb, schema v2 reports,
                             account claim and history cursor)
  sync/                      SyncManager.test.ts, CorrectionApplier.test.ts,
                             HttpSyncTransport.test.ts, PullTransport.test.ts,
                             bundledPack.test.ts (real signed pack), backoff.test.ts
  tools/                     csv.test.ts, master.test.ts, masterFile.test.ts
                             (real master), build.test.ts, cli.test.ts,
                             fixtures.ts (in-memory master rows)
  ui/                        tokens.test.ts — WCAG contrast, token discipline, tap targets,
                             font subset size and licence; i18n.test.ts
  server/                    harness.ts (PGlite boots the real migrations), sql/auth-shim.sql,
                             SyncBackend.test.ts — acceptance, idempotency, validation, IST
                             days, cursor, corrections, pull, RLS, compaction
  services/                  PracticeService.test.ts, ExamDeadline.test.ts,
                             AuthService.test.ts, HistoryService.test.ts,
                             SyncScheduler.test.ts
  fixtures/                  elo-golden.json, fsrs-golden.json — hand-computed pins

content/
  master/questions.csv       authoritative bank; batch 1 is 60 verified questions,
                             20 each for polity-fundamental-rights,
                             history-ancient-india and geography-indian-geography;
                             batch 2 adds 300 draft questions, 25 each in 12 new
                             sub-topics (D-078)
  sample/questions.csv       four-row pipeline fixture (3 verified, 1 draft)
  bundled.lock.json          lock for the pack shipped inside the APK (D-059)
  packs.lock.json            written by the first CDN build; commit it so versions persist
  dist/                      build output (gitignored)

public/packs/                signed manifest and pack files copied into the APK (D-059)

tools/content/               offline build, run with tsx; never imported by the app
  csv.ts                     strict RFC 4180 reader and writer
  master.ts                  COLUMNS, statuses, difficulty seeds, validateMaster
  build.ts                   buildContent / writeBuild / lock
  review.ts                  buildReviewSheet; per-status/per-subtopic export (D-079)
  promote.ts                 apply approve/reject/fix with stale-sheet guard (D-079)
  signing.ts                 Ed25519 sign, verify and keygen
  cli.ts                     validate / review / promote / build / keygen entry point (F13)
```

**Dependency direction (explicit, see D-030 and D-036):**

| Directory | May import from |
|---|---|
| `shared/` | nothing — plain data, constants and tiny pure helpers only |
| `core/` | `core/`, `shared/` (types and pure helpers only), and pure third-party libraries such as `ts-fsrs`. Never `ui/`, `data/`, `sync/`, `services/`. |
| `data/` | `core/` (types only), `shared/` |
| `services/` | `core/`, `data/`, `sync/`, `auth/`, `shared/` |
| `sync/` | `core/`, `data/`, `shared/` |
| `auth/` | `auth/`, `shared/` (types only). Never `ui/`, `data/`, `sync/`, `services/`; the GoTrue seam knows no database. |
| `config.ts` | nothing — reads `import.meta.env` and returns plain data |
| `app/` | `app/`, `ui/`, `data/`, `services/`, `sync/`, `auth/`, `config.ts`, `shared/`. The shell is the only place that owns a long-lived database handle. |
| `ui/` | `ui/` (styles and components), `core/` (types only), `shared/`. Screens receive data and callbacks as props; they never construct a repository. |
| `tools/content/` | `shared/`, `src/core/Question.ts` (read-only validation), Node built-ins. Never `ui/`, `data/`, `services/`, `sync/`. |
| `content/` | nothing — CSV data and build output only |
| `supabase/` | nothing from the app — SQL migrations and a Deno adapter; never imported by the bundle. |

**`core/` performs no writes.** Any flow step marked `[DB write]` belongs to a repository, never to a `core/` class.

---

## Flow index

| ID | Flow | Trigger |
|---|---|---|
| F1 | App startup | App launched |
| F2 | Answer a question (hot path) | Student taps an option |
| F3 | Pick the next question | After F2, or practice starts |
| F4 | Background sync | Open, every 5 min, app backgrounded |
| F5 | Question pack update | During F1 and F4 |
| F6 | Apply an answer-key correction | Sync response contains corrections |
| F7 | Sign-in and history rebuild | Guest signs in, or new device |
| F8 | Live mock | Student starts a scheduled mock |
| F9 | Nightly compaction (server) | Scheduled job |
| F10 | Streak reminder | Daily, at the student's chosen time |
| F11 | Report a question error | "Report error" tapped |
| F12 | Delete account | Confirmed in Settings |
| F13 | Review, build and publish content packs | Developer runs the content CLI |

---

## F1: App startup (entry point)

```
main.ts › start()                                       [UI]
├─ app/bootstrap.ts › bootstrap()
│  ├─ data/database.ts › openDatabase()                  [DB read]
│  ├─ data/repositories/SettingsRepository.ts › ensure() [DB read/write] first launch only
│  └─ data/repositories/SyncRepository.ts › ensureDeviceId() [DB read/write] (D-011)
├─ ui/theme.ts › resolveSystemTheme() / applyTheme() / applyLanguage()   first launch + every boot
├─ app/App.svelte › mount({ db, initialSettings, deviceId })   [UI] (D-055, D-056)
├─ ⇢ @capacitor/app › backButton listener                native only (D-056)
├─ app/App.svelte › onMount()
│  ├─ app/router.ts › subscribePath()                    hash changes → route
│  ├─ window › online / offline listeners                connectivity banner
│  ├─ app/syncRuntime.ts › createSyncRuntime()           null on a guest-only build (D-073)
│  │  ├─ config.ts › appConfig()                          URL + anon key + redirect
│  │  ├─ auth/GoTrueClient.ts + TokenStore + PendingAuthStore
│  │  ├─ auth/OAuthBrowser.ts                             Capacitor Browser or window
│  │  ├─ services/AuthService.ts                          one session, single-flight refresh
│  │  ├─ sync/SyncTransport.ts › HttpSyncTransport + HttpPullTransport
│  │  ├─ sync/SyncManager.ts + services/HistoryService.ts
│  │  └─ services/SyncScheduler.ts                        5-minute timer, wake gating
│  ├─ services/AuthService.ts › subscribe()               account card state
│  ├─ services/AuthService.ts › load(location.href)       restore session, finish web callback
│  │  └─ then services/SyncScheduler.ts › start()         first run + timer (F4)
│  └─ ⟶ sync/PackInstaller.ts › install()                async, never blocks first paint (D-059)
│        ├─ ⟶ GET ./packs/manifest.json                  bundled asset
│        ├─ sync/contentPublicKey.ts › CONTENT_PUBLIC_KEY   pinned Ed25519 key
│        ├─ verify signature + SHA-256 + core/Question.ts validation
│        └─ data/repositories/QuestionRepository.ts › replacePack()  [DB write] one transaction
└─ app/HomeRoute.svelte › services/ProgressService.ts › overview()   [DB read]
```

**Failure path:** if the database fails to open, `main.ts` mounts `ui/screens/StorageError.svelte` with a retry instead of `App`. Nothing on the network blocks first paint; the bundled install starts after mount and a failure leaves the previous pack in place plus a retry banner in the shell. A failed settings write is reported by the shell banner and the DOM is restored to the stored values. A build without `VITE_SUPABASE_URL` or the anon key creates no runtime, so practice stays fully local and Settings explains that sign-in is unavailable; a failed session restore leaves the student a guest. The CDN check (`sync/PackUpdater.ts`) is still planned and will hang off the same verified install path (F5).

---

## F2: Answer a question (hot path, < 50 ms)

```
ui/screens/Practice.svelte › choose(index) — paints the selection immediately
└─ app/PracticeRoute.svelte › answer(chosen)
   └─ services/PracticeService.ts › answer(question, chosen, ms, examDeadline)
      ├─ core/Attempt.ts › Attempt.create(question, chosen, ms, ctx)  pure
      ├─ ⟦ txn ⟧
      │  ├─ data/repositories/AttemptRepository.ts › append()          [DB write]
      │  ├─ data/repositories/CardRepository.ts › get(qid)             [DB read]
      │  ├─ core/ReviewScheduler.ts › review(card, outcome, now, examDeadline) pure
      │  ├─ data/repositories/CardRepository.ts › put()                [DB write]
      │  ├─ data/repositories/SkillRepository.ts › get(subtopic)       [DB read]
      │  ├─ core/EloRating.ts › updateSkill(skill, questionRating, outcome) pure
      │  ├─ data/repositories/SkillRepository.ts › put()               [DB write]
      │  ├─ data/repositories/DailyRepository.ts › get(istDayKey(now)) [DB read]
      │  ├─ core/StreakTracker.ts › apply(attempt, todaySummary)       pure
      │  └─ data/repositories/DailyRepository.ts › put()               [DB write]
      │  ⟦ /txn ⟧
      ├─ ui/screens/Practice.svelte › feedback props                   [UI]
      └─ “Next question” → F3 (nothing advances automatically)
```

`outcome` is `'correct' | 'wrong' | 'skip'`, derived from `Attempt.record.correct` (`skip` when `chosen === null`). A skip is logged and writes a zero daily row, but is a no-op for Elo and FSRS: no card is created and no skill row is touched (D-034, D-043). `Attempt.create` captures `qid` and the question version `qv` so a later correction can re-grade against the right key (D-022). `ReviewScheduler.review` calls the FSRS-7 preset synchronously (correct → `Good`, wrong → `Again`), and clamps the new due date to `examDeadline` without touching stability (D-037). Card, skill and daily reads happen **inside** the transaction, so a second answer cannot interleave (D-060).

**Why one transaction:** five separate writes cost far more than one commit on a Redmi 9A class device, and either everything is saved or nothing is.
**Ordering:** the option tap paints first and the commit follows; the answer is not fire-and-forget, and the screen shows feedback only after the commit returns (D-061). Options and Skip lock while the commit is in flight.
**Failure path:** if the transaction fails, nothing is saved. `PracticeRoute` keeps the chosen index and elapsed `ms` in memory and shows a retry banner; the retry re-submits that same choice and time rather than inventing a second attempt. Nothing is silently lost. Flushing on `onPause` is still planned with background sync.

---

## F3: Pick the next question

```
app/PracticeRoute.svelte › loadQuestion()
└─ services/PracticeService.ts › next(subtopic)
   ├─ data/repositories/QuestionRepository.ts › bySubtopic(subtopic)     [DB read]
   ├─ data/repositories/CardRepository.ts › all()                        [DB read]
   ├─ serve the earliest due card for an installed question
   ├─ else:
   │  ├─ data/repositories/SkillRepository.ts › get(subtopic)            [DB read]
   │  ├─ data/repositories/AttemptRepository.ts › recentQids(30)         [DB read]
   │  └─ loop step 0..MAX_RANGE_STEP, stop at the first band with a fresh question:
   │     ├─ core/AdaptiveEngine.ts › targetRange(skill, step)            pure → {min,max}
   │     ├─ data/repositories/QuestionRepository.ts › candidates(range)  [DB read]
   │     └─ drop every qid that already has a card (scheduled, due or not)
   └─ core/QuestionPicker.ts › pick([], fresh, recentIds, rng)           pure
      → { qid, reason: 'new' } | null
```

`PracticeService` does the reads and hands plain data to `QuestionPicker`, so `core/` never imports `data/` (D-030). The due branch sorts by `due` then `qid` and returns the first one whose question is still installed, which is why a card left behind by an uninstalled pack is skipped rather than dead-ending the session.

Order of preference: due revision cards first, **earliest `due` first**, with a tie broken by question id. Otherwise a new question is picked uniformly at random from the questions inside the band, sorted by id first so the same roll always means the same question. `recentIds` filters new questions only; it never blocks a review (D-045).

A card that is scheduled but **not due** is excluded from the new-question pool too, so its revision interval is never skipped by serving it as fresh. That is a Step 6 refinement of D-045: the original wording only excluded due cards from the candidate pool.

The band starts at ±100 Elo around `skill.elo`, then widens to ±200 and ±400, and finally to the whole 600–2200 scale (`targetRange(skill, step)` with `step = 0..MAX_RANGE_STEP`), always clamped (D-044). If every candidate is recent, the picker ignores the exclusion rather than dead-ending a tiny sub-topic (D-046).

**Failure path:** `next` returns `null` only when nothing is due and no unscheduled question exists in any band; the screen then says "No questions here yet" and links back to the chooser. A failed DB read shows the load-failed banner with a retry.

---

## F4: Background sync

Landed in 7A (server), 7B (client) and 7C (timer, token and pull). D-063..D-076.

```
services/SyncScheduler.ts › start() / runNow(reason)                 landed (D-076)
├─ gate: AuthService.isSignedIn() and navigator.onLine
├─ services/AuthService.ts › getAccessToken()                        refresh 60 s before expiry
├─ sync/SyncManager.ts › runOnce()                                   landed
│  ├─ data/repositories/SyncRepository.ts › getMeta()                [DB read]
│  ├─ sync/SyncManager.ts › pinnedBatch() | freshBatch()             choose next batch
│  │  ├─ pinned: data/repositories/AttemptRepository.ts › byIds(ids) [DB read]
│  │  └─ fresh:  data/repositories/AttemptRepository.ts › unsynced(200) [DB read]
│  │              data/repositories/ReportRepository.ts › pending(20)  [DB read]
│  ├─ data/repositories/SyncRepository.ts › setPending(batch)        [DB write, before send]
│  ├─ ⟶ sync/SyncTransport.ts › send(batch)                          [network]
│  │  └─ sync/SyncTransport.ts › HttpSyncTransport › POST /sync → supabase/functions/sync/index.ts
│  │     ├─ method, Bearer header, ≤512 KB body                      landed
│  │     └─ ⟶ RPC public.apply_sync_batch(p_batch)                   [DB write]
│  │        ├─ new batch id and ≥ 30 batches in 60 s → rate_limited  D-088
│  │        │  { retryAfterMs }, HTTP 429; a stored batch id skips this
│  │        └─ apply_sync_batch_unthrottled(p_batch):
│  │        ├─ insert sync_batches; a repeated batchId returns its stored
│  │        │  response and writes nothing                           D-067
│  │        ├─ insert attempt_inbox once per (user_id, attempt_id)   D-063
│  │        ├─ increment question_stats from the inserted rows only  D-065
│  │        ├─ recompute daily_stats for the touched IST days        D-065
│  │        ├─ insert question_reports, duplicates ignored           F11
│  │        ├─ read corrections since the watermark, advance it      D-067
│  │        └─ advance sync_state.last_cursor, store the response
│  ├─ sync/CorrectionApplier.ts › apply(corrections)                 → F6
│  │  └─ before the pin clears, so a crash replays and de-dupes by id
│  ├─ ⟦ txn ⟧ replay the reply                                       [DB write]
│  │  ├─ data/repositories/AttemptRepository.ts › markSynced(ids)
│  │  ├─ data/repositories/ReportRepository.ts › markSent(reports)
│  │  ├─ data/repositories/SyncRepository.ts › setPending(null)
│  │  └─ data/repositories/SyncRepository.ts › setCursor(newCursor, serverTime)
│  └─ sync/PackUpdater.ts › checkForUpdates()                        → F5 (planned)
└─ services/SyncScheduler.ts › schedule(retryInMs | 5 min)           next run, one at a time
```

**Trigger:** `start()` on app open, a five-minute timer while the app is in use, an `online` event, and `visibilitychange` when the app returns to the foreground (D-009, D-076). `wake` and `manual` runs may send an empty batch so corrections and the cursor arrive without a new answer; the five-minute tick does not. Concurrent triggers share the run in flight.
**Payload:** attempts plus `reports[]` (F11). No client-computed `daily` aggregates — the server derives them (D-028, D-065).
**Retry state:** the batch is pinned in `syncMeta.pendingBatch` before the request, so a retry — even after a restart — sends the same `batchId` with the same attempt ids and reports and receives the server's stored response (D-067, D-070). A new attempt that arrives meanwhile waits for the next batch. The pin is cleared only on success or a poison rejection (`invalid_batch`, `invalid_json`).
**Result:** `runOnce` returns `idle | ok | retry{retryInMs} | failed`. Network throw, `timeout`, `sync_failed`, `batch_in_progress`, `rate_limited` (D-088) and any `retryAfterMs` are retryable (`sync/backoff.ts` doubles from 1 s to 5 min with jitter); `unauthenticated`, `forbidden` and validation errors are terminal. The scheduler owns the timer: a retryable result schedules `retryInMs`, anything else the regular interval.
**Failure path:** on network error, keep attempts unsynced and retry the pinned batch with backoff. Retries are safe because a repeated `batchId` returns the stored response (D-067) and a resent attempt is rejected by the inbox primary key (D-063). A partial success never happens: the RPC accepts the batch or raises, and the whole transaction rolls back. A guest or an offline device skips the request but keeps the timer alive, so signing in or coming back online needs no separate path.

---

## F5: Question pack update

```
sync/PackInstaller.ts › install()                             landed (D-059)
├─ ⟶ GET manifest.json (bundled asset; CDN URL later)         [network]
├─ sync/contentPublicKey.ts › CONTENT_PUBLIC_KEY
├─ verify Ed25519 over canonicalJson({version, generatedAt, packs})   D-025/D-050
├─ compare (version, sha256) with data/repositories/PackRepository.ts  [DB read]
│  └─ unchanged → skip
└─ for each changed pack:
   ├─ ⟶ GET pack file (local file derived from manifest CDN URL)  [network]
   ├─ sha256Hex(bytes) — must equal the manifest entry
   ├─ core/Question.ts validation for every question
   ├─ data/repositories/QuestionRepository.ts › replacePack()  [DB write, one txn]
   └─ data/repositories/PackRepository.ts › put()              [DB write]
```

**Failure path:** if the signature, the hash or any question fails, the install stops before the transaction and the previous pack stays installed; the shell reports the failure with a retry. A WebView without Ed25519 fails closed. The CDN-check half (`sync/PackUpdater.ts`) is still planned: it will fetch the same manifest shape from the CDN, verify it through this same code path, and only replace packs whose version or hash changed.

---

## F6: Apply an answer-key correction

```
sync/CorrectionApplier.ts › apply(corrections)                        landed (D-072)
└─ ⟦ txn ⟧ one transaction for the whole batch
   ├─ data/repositories/CorrectionRepository.ts › putMany()           [DB write]
   │  └─ fresh rows only, inserted unseen before grading can read them
   ├─ data/repositories/AttemptRepository.ts › all()                  [DB read]
   ├─ sync/CorrectionApplier.ts › changed per question                pure
   │  └─ each attempt judged against the answer for its own version
   ├─ core/Replayer.ts › rebuild(all, checkpoint, correctedIndex) pure → {cards, skills}
   │  └─ corrected index maps every version in [fromVersion, toVersion] to newAnswer
   ├─ data/repositories/{Card,Skill}Repository.ts › clear + bulkPut    [DB write, replace]
   └─ data/repositories/CorrectionRepository.ts › markSeen(ids)       [DB write]
```

`sync/` may not import `ui/`, so the applier returns `{ applied, changed, rebuilt }` and the UI reacts to it.

See D-022, D-038, D-039 and D-072. The corrected index decides each attempt's verdict; `changed` counts the questions that flipped rather than the rows that moved, and the attempt log is never edited. `rebuild` then re-derives cards and skills with the corrected answer key for the whole batch, one replay instead of one per correction. Only derived state is recomputed.

**Grading rule:** `PracticeService.answer` calls `data/repositories/CorrectionRepository.ts › answerFor(qid, qv)` inside the answer transaction and grades the attempt against `newAnswer` when a stored correction covers the version. `CorrectionApplier` only makes the derived stores agree; the answer key is already correct at the next tap (D-072).

**Checkpoint limit:** an attempt already folded into the newest checkpoint cannot be re-graded on a phone that has pruned; the server must republish the checkpoint. Corrections target recent questions in practice, and the banner says when history is incomplete.

**Ordering rule:** the local `corrections` row is written *before* the pack is re-downloaded, and it overrides the answer key for **grading** from that moment on. The question **display** updates when the corrected pack lands. Without this rule, a student who answers the question between the correction sync and the pack download is graded against a key we already know is wrong.

---

## F7: Sign-in and history rebuild

```
ui/screens/Settings.svelte › "Sign in with Google"           [UI]
└─ app/App.svelte › signIn()
   └─ services/AuthService.ts › signIn()
      ├─ auth/pkce.ts › createPkce() + createState()          S256, 48-byte verifier
      ├─ auth/PendingAuthStore.ts › write()                   sessionStorage, 10-minute TTL
      ├─ auth/pkce.ts › buildAuthorizeUrl()                   /auth/v1/authorize?provider=google
      ├─ auth/OAuthBrowser.ts › open() + subscribe()          Custom Tab / page redirect
      │  └─ callback: com.cglgkmaster.app://auth-callback?code=…&state=…
      ├─ auth/pkce.ts › parseAuthCallback()                   state must match
      ├─ auth/GoTrueClient.ts › exchangeCode()                [network]
      ├─ data/repositories/SyncRepository.ts › claimAccount() [DB read/write] D-075
      │  └─ mismatch → revoke tokens + AccountMismatchError (Settings asks for a wipe)
      └─ auth/TokenStore.ts › write()                         localStorage session

then app/App.svelte › syncAfterSignIn(userId)
├─ sync/SyncManager.ts › uploadAll({ allowEmpty: true })      guest log → server (F4)
├─ services/HistoryService.ts › pull()                        [network + DB write]
│  ├─ data/repositories/SyncRepository.ts › getMeta()          historyCursor (null = full pull)
│  ├─ full pull only: sync/CheckpointTransport.ts › latest()   ⟶ RPC latest_checkpoint  D-091
│  │  └─ newer than syncMeta.checkpoint → setCheckpoint(); later rebuilds start from it
│  ├─ loop: sync/SyncTransport.ts › HttpPullTransport › POST sync_pull
│  │        { p_after, p_limit 1..500 } → { attempts, nextCursor, hasMore }
│  ├─ merge by attempt id; pulled rows stored `synced: 1`
│  ├─ sync/derived.ts › buildReplayIndex() + replaceDerived()
│  │  ├─ core/Replayer.ts › rebuild(all, no checkpoint, index)  pure
│  │  └─ fold dailySummary from the whole log
│  └─ data/repositories/SyncRepository.ts › setHistoryCursor() only after the last page
└─ services/SyncScheduler.ts › runNow('manual')               resume the normal timer
```

Sign-in is Google-only via GoTrue on the custom scheme. `auth.load(location.href)` resumes a web redirect; on Android the manifest intent filter delivers the deep link. The local log is uploaded before the first pull, so the same pass returns it marked `synced: 1` (dedupe by attempt id). Derived state is rebuilt once per complete pull, and the attempt log is never edited; stored corrections decide each verdict through `buildReplayIndex` (D-072). Starting from `syncMeta.historyCursor` means the second sign-in downloads only the tail. A full pull adopts the newest server checkpoint first, so pruned history is replaced by its snapshot; a failed checkpoint fetch stops the pull instead of replaying without it (D-074, D-091).

**Failure path:** a mismatched account or a failed token exchange leaves the student a guest and shows the Settings error, with no batch uploaded. If the upload succeeds but the pull fails, the arrived pages stay merged, the cursor is unchanged and the scheduler retries on its normal timer (D-076). Never wipe local attempts on a failed rebuild.

**Device rule:** `syncMeta.accountId` is claimed by the first account and never changes until the app data is cleared (D-075). Sign-out keeps the claim and the log; signing back into the same account resumes.

---

## F8: Live mock

```
app/MockRoute.svelte (#/mock)  › loadList()
└─ services/MockService.ts › list()  ⟶ RPC list_mocks()               [network]
   └─ mocks from 14 days back to 14 days ahead, each with the caller's
      session status (active | submitted | expired) and score

app/MockRoute.svelte (#/mock/:id) › openMock(id)
├─ services/MockService.ts › local(id)                               [DB read]
│  └─ a stored, unexpired session → MockTest at once, no network
├─ else list() → open: intro + "Start" | active: start() | done: result
└─ services/MockService.ts › start(id)
   ├─ ⟶ RPC start_mock(id)                                           [network]
   │  ├─ window check: not_open | closed | already_submitted | expired
   │  ├─ draw question_count from mock_pool at random, once per student
   │  ├─ deadline = least(now + duration, closes_at)  server clock
   │  └─ questions without answers or explanations
   └─ db.mockSessions.put(questions, deadline, clock offset)         [DB write]

ui/screens/MockTest.svelte › tap / Previous / Next                  [UI]
└─ services/MockService.ts › record() | moveTo()                     [DB write, every tap]
   └─ choice (changeable, clearable) and time per question, summed

app/MockRoute.svelte › submit()   on "Yes, submit" or when the timer hits 0
├─ services/MockService.ts › submit(sessionId)
│  ├─ ⟶ RPC submit_mock(sessionId, answers)                          [network]
│  │  ├─ refuse after deadline + 10 min grace → too_late
│  │  ├─ validate qids, choices and times; store mock_answers
│  │  ├─ +mark_correct / −mark_wrong; time = least(now, deadline) − start
│  │  ├─ flag < 2 s per answered question (kept off the leaderboard)
│  │  └─ store the response; a retry returns it unchanged
│  └─ db.mockSessions.delete(sessionId)  only after a grade or too_late [DB write]
└─ ui/screens/MockResult.svelte + ⟶ RPC mock_leaderboard(id, 20)     [network]
   └─ rank by score, time, submitted-at; names only, never emails

⟶ RPC mock_review(id)   after closes_at only: answers, explanations, own choices
```

See D-029 and D-090. The session lives in the `mockSessions` table so a phone call, a 4G drop or a closed app does not end the test; reopening resumes from the phone while the deadline lasts. Mock questions never enter the `questions` store, and mock answers are not appended to the practice attempt log.
**Failure path:** a submit that gets no response keeps every answer on the phone and shows "get online before <deadline + grace>"; the student taps Submit again. `too_late` deletes the local copy. A session never submitted shows as expired, not as zero. The list cannot load offline, but a started mock can be resumed and answered offline.
**Not built yet:** the in-app answer review screen (the RPC exists), the correction re-grade of `mock_answers`, and an admin screen for creating mocks.
**Offline edge:** if the network is down when the student opens a mock, the mock cannot start (questions live on the server). The UI says so before the tap, not after.

---

## F9: Nightly archive and compaction (server)

```
Supabase Cron, nightly (e.g. 21:00 UTC) ⟶ POST /functions/v1/nightly_archive   x-cron-secret
└─ supabase/functions/_shared/archiveJob.ts › runArchive(ports)
   ├─ ⟶ RPC archive_pending(500)        (user, finished IST day, nextPart) groups   service role
   ├─ for each group:
   │  ├─ ⟶ RPC archive_attempts(user, day)   unarchived attempts, replay order
   │  ├─ _shared/archiveCodec.ts › encodeArchive() → gzip() → sha256Hex()
   │  ├─ ⟶ Storage upload attempt-archive/users/<id>/<day>-<part>-<sha8>.cga.gz  upsert: false
   │  └─ ⟶ RPC record_archive(...)   manifest row + mark exactly those attempts archived, one txn
   │     (a failure is logged and the group waits for the next night)
   ├─ ⟶ Storage list users/ → RPC archive_orphans(ids) → remove folders of deleted accounts  D-086
   └─ ⟶ RPC compact_sync_inbox()
      ├─ delete an inbox attempt only if archived AND at or before the newest
      │  checkpoint AND received more than 30 days ago                           D-091
      └─ delete sync_batches older than 90 days that own no attempts           D-063

app: services/SyncScheduler.ts › onResult(ok) → services/CheckpointService.ts › maybeWrite()
├─ at most once a week; only attempts ≥ 30 days old, all synced
├─ core/Replayer.ts › rebuild(eligible, adopted checkpoint, index)  pure
└─ ⟶ RPC put_checkpoint   cursor ≤ server's last cursor and after the previous; newest two kept
```

See D-026, D-027, D-066 and D-091. Idempotent by construction: a day file is never rewritten (a late attempt goes into the next part), `record_archive` is a no-op for a path it already holds, and an upload whose record failed leaves only an unreferenced file. No attempt is deleted while it is the only copy anywhere.
**Failure path:** a failed group keeps its attempts unarchived, therefore unprunable, until a later run succeeds. A checkpoint upload that gets no answer is retried after the next sync; a refusal (`stale`, `ahead_of_server`) waits a week.
**Setup (by hand):** create the private bucket `attempt-archive`, set `ARCHIVE_CRON_SECRET` (32+ characters) for the function, and schedule the call.

---

## F10: Streak reminder

```
services/ReminderService.ts › schedule(reminderTime)                        [notification]
└─ at reminder time:
   ├─ data/repositories/DailyRepository.ts › today()                        [DB read]
   ├─ core/StreakTracker.ts › goalMet(todaySummary, settings.dailyGoal)     pure
   └─ if false → show local notification                                    [notification]
```

See D-024 and D-041. The reminder keeps firing until the daily goal is met, even when the streak is already safe; it is rescheduled whenever F2 changes today's summary or settings change.

---

## F11: Report an error on a question

```
ui/screens/ReportError.svelte › submit(reason)                       (planned screen)
└─ services/ReportService.ts › report(qid, qv, reason)              (planned service)
   ├─ data/repositories/ReportRepository.ts › queue()                [DB write]
   │  └─ reports table, PK [qid+qv+reason]; a repeat tap is a no-op
   └─ ⟶ next sync batch: reports[] (max 20) → question_reports       [network]
```

Queued offline and sent with the next sync batch, so reporting never fails on patchy 4G. The payload carries `reports: [{ qid, qv, reason, at }]` (max 20 per batch) and the server dedupes by `(user_id, qid, qv, reason)` (D-071).
**Failure path:** stays queued; a report is never dropped silently. A repeated tap for the same question version and reason collapses to one row on the device and to one row on the server.

---

## F12: Delete account

```
ui/screens/Settings.svelte › "Delete account" → "Yes, delete my account"   [UI]
└─ app/App.svelte › deleteAccount()
   ├─ services/SyncScheduler.ts › stop()
   ├─ services/AccountService.ts › deleteAccount()
   │  ├─ ⟶ sync/AccountTransport.ts › deleteAccount()               [network]
   │  │  └─ RPC delete_user(): delete question_reports, daily_stats,
   │  │     checkpoints, attempt_inbox, sync_batches, sync_state,
   │  │     profiles, then auth.users, in one transaction → { ok: true }
   │  ├─ data/database.ts › wipeLocalData()  only after { ok: true } [DB write]
   │  └─ services/AuthService.ts › signOut()
   └─ location.reload()  → F1 with a fresh device id and default settings

ui/screens/Settings.svelte › "Erase data on this phone" → "Yes, erase"     [UI]
└─ app/App.svelte › eraseDevice()
   ├─ services/SyncScheduler.ts › stop()
   ├─ data/database.ts › wipeLocalData()                             [DB write]
   ├─ services/AuthService.ts › signOut()       server account is kept
   └─ location.reload()
```

Promised in the feature list and required by the DPDP Act (D-086). `wipeLocalData` clears every table in `PERSONAL_TABLES` and keeps `CONTENT_TABLES` (installed packs and corrections), so the question bank survives. `question_stats` holds no user id and keeps its counts. There is no Storage archive yet; when 7A-2 adds `users/<id>/` objects they must be deleted through the Storage API before the RPC.
**Failure path:** no response gives `offline`, a 401 gives `unauthenticated` (sign in again), and any other answer gives `failed`. In all three, nothing local changes and sync resumes. If the server confirmed but the wipe failed, the student is still signed out and told to use "Erase data on this phone". `delete_user()` is idempotent, so a retry after a lost response returns ok.

---

## F13: Build and publish content packs (developer, offline)

```
npm run content:validate -- [--input <csv>] [--verbose]
└─ tools/content/cli.ts › main(['validate', ...])
   ├─ tools/content/csv.ts › parseCsv(text)                     strict; no network
   └─ tools/content/master.ts › validateMaster(table)
      └─ src/core/Question.ts › Question.issues(record)         same rules as the app
         → report { rows, counts, errors, warnings, questions }

npm run content:review -- [--status draft|verified|rejected|all] [--subtopic <slug>] [--lang en|hi] [--carry <csv>] [--out <csv>] [--force]
└─ tools/content/cli.ts › main(['review', ...])
   ├─ tools/content/csv.ts › parseCsv(master) [+ parseCsv(carry sheet)]
   ├─ tools/content/review.ts › buildReviewSheet(table, { status, subtopic, carry })
   │  ├─ content columns for the selected rows, in file order, decision/note empty
   │  ├─ tools/content/hash.ts › contentHash(values, REVIEW_CONTENT_COLUMNS) → content_hash
   │  └─ carryDecisions(rows, old)         copies a decision only when the hash matches
   ├─ tools/content/review.ts › buildHindiSheet(table, { status, subtopic, carry })
   │  → hi_check/hi_note empty; contentHash over translation fields, no status/source
   └─ tools/content/csv.ts › writeCsv(header, rows, { bom: true })
      → English default content/review/<status>-review.csv; --lang hi defaults to
        content/review/hindi-review.csv; refuses to overwrite without --force

npm run content:promote -- --review <csv> [--hindi <csv>] [--input <master>] [--subtopic <slug>] [--at <iso>] [--dry-run]
└─ tools/content/cli.ts › main(['promote', ...])
   ├─ tools/content/csv.ts › parseCsv(master) + parseCsv(sheet) + parseCsv(Hindi)
   ├─ tools/content/promote.ts › promote(table, sheet, { at, subtopic, hindi })
   │  ├─ each sheet row: decision must be approve/reject/fix/blank; id unique and in master
   │  ├─ reject and fix require a note; the English content_hash must match sheet and master
   │  ├─ approve also needs source_ref, an https URL that is not a front page, and a Hindi
   │  │  row with hi_check=ok whose translation hash matches the master
   │  ├─ approve → status=verified, verified_at=at
   │  ├─ reject  → status=rejected, verified_at=''
   │  └─ validateMaster(candidate)                         no partial write
   ├─ tools/content/cli.ts › writeAtomic(master, csv)       .tmp then rename
   └─ print per-subtopic summary; rebuild stays a separate command

npm run content:sources -- [--input <master>] [--status draft|verified|rejected|all] [--subtopic <slug>] [--out <csv>] [--force]
└─ tools/content/cli.ts › main(['sources', ...])
   ├─ tools/content/sources.ts › auditSources(table, { status, subtopic })
   │  → per-row issues: missing source_ref, missing/non-https source_url, front page
   └─ print issue counts; optional writeCsv report

npm run content:dupes -- [--input <master>] [--threshold <0-1>] [--subtopic <slug>] [--include-rejected] [--out <csv>] [--force]
└─ tools/content/cli.ts › main(['dupes', ...])
   ├─ tools/content/dupes.ts › findDuplicateCandidates(table, { threshold, subtopic, includeRejected })
   │  → same-section token Jaccard pairs, answer-text score, sorted by score
   └─ print candidates (default 20, all with --verbose); optional writeCsv report

npm run content:build -- --key <pem> --url-base <https> [options]
└─ tools/content/cli.ts › main(['build', ...])
   ├─ tools/content/build.ts › readLock(path)                    previous versions or null
   ├─ tools/content/master.ts › validateMaster(table)            fail on any error
   ├─ tools/content/build.ts › buildContent(table, options)
   │  ├─ group verified questions by packId; sort ids; bump a version only when
   │  │  the content hash changed (D-047/D-048)
   │  ├─ hash pack bytes → sha256 → fileName <id>-v<n>-<hash12>.json
   │  ├─ shared/canonicalJson.ts › canonicalJson(body)           pure
   │  ├─ tools/content/signing.ts › signBytes(canonical body, key) → base64 (D-050)
   │  └─ → { packs, manifest, lock }
   ├─ tools/content/build.ts › writeBuild(result, out)           manifest.json + pack files
   └─ tools/content/build.ts › writeLock(result.lock, path)
```

Only `verified` rows are packed; `draft` and `rejected` rows may be incomplete and produce warnings instead of errors (D-047). A blank or duplicate id, an unknown status, a duplicated English question and every issue on a verified row are errors. The build stops before writing anything if the report has an error, so a failed run leaves the previous manifest and lock untouched.

The review loop never edits the CSV by hand: `review` writes a sheet with read-only content and two editable columns, and `promote` is the only writer of `status`/`verified_at`. Every row carries a `content_hash` over all displayed content, so an option, explanation or Hindi edit without a fresh export is refused — not just a changed `en_q` (D-080). A decision that is not `approve`, `reject` or `fix` fails the whole sheet, as does a `reject`/`fix` without a note. `--carry` re-applies a previous decision only when the hash is unchanged; changed rows come back blank. `--subtopic` limits both the export and the write, which lets one 25-row sub-topic be verified, promoted, rebuilt and committed without touching the rest of the bank. An approval also needs a `source_ref` locator, an `https://` link that is not a portal front page and a matching Hindi row marked `hi_check=ok`; the Hindi hash omits `status` and the source fields so source cleanup does not invalidate a translation check (D-081, D-082). Promotion validates the candidate master and writes atomically, but it does not rebuild: the signed pack and its lock advance only when `content:build` runs (D-079).

`validate` also prints per-subtopic progress (`verified`, `draft`, `rejected`), so the authoring queue is visible without opening the CSV. `tests/tools/masterFile.test.ts` runs the real master through the same validation on every `npm test` and asserts lower bounds for the verified and draft batches, and `tests/sync/bundledPack.test.ts` verifies and installs `public/packs/` with the pinned key (D-077, D-078).

Batch 2 adds 300 `draft` rows, so `validate` reports 360 rows across 15 sub-topics while the build still emits the same three verified packs; `public/packs/` and `content/bundled.lock.json` move only when a row is promoted to `verified` (D-078).

Step 11 adds two advisory reports. `content:sources` lists missing `source_ref` values, missing or non-https URLs and portal front pages; the front-page check treats a bare domain, an `index`/`default`/`home` page and a bare language landing page as too vague, while a query string or deeper path counts as a specific page. `content:dupes` tokenises the English question and explanation, drops stop words, and prints same-section pairs above a Jaccard threshold (default 0.55) with an answer-text score; rejected rows are hidden unless `--include-rejected`. Neither report gates promotion: they are review aids, and only the approval gates in `promote` are hard (D-082, D-083).

`--generated-at <iso>` makes the manifest reproducible; `CGL_SIGNING_KEY` and `CGL_PACK_URL_BASE` replace the two required options. The key is generated outside the repository, and `*.pem` is gitignored. `content/packs.lock.json` is committed so a pack version moves only when its questions change, while the URL always carries the byte hash so a changed file cannot be served from a stale CDN cache.

**Failure path:** a CSV parse error, a validation error, a missing key, a non-https URL or a refused review decision (unknown value, missing note, stale row) exits non-zero with the offending line and leaves `<out>/`, the lock and the master unchanged. No network is touched. The app verifies the same canonical bytes in F5; if verification fails it discards the manifest and keeps the installed packs.

**Deferred:** the admin verification UI (Step 7) will call the same `validateMaster` and `buildContent`. Until then the review sheets from `content:review` are the queue and `content:promote` applies decisions (D-079).

