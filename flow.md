# flow.md — Code Execution Flow

How execution travels through CGL GK Master: the entry points, which function calls which, and in what order. Read this before changing any flow; update it in the same commit when you do.

> **Status:** Step 4 (UI design system) is complete. **Landed and tested:** `shared/contract.ts`, `shared/canonicalJson.ts`, `src/core/*.ts` (eight classes), the `tools/content/` pipeline, and `src/ui/*.css` with the self-hosted Mukta subset (280 tests). Everything else below is still **planned**; replace `(planned)` markers with real paths as each file lands.
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
                             compareCursor(); no I/O, no imports
  canonicalJson.ts           canonical JSON for manifest signatures (D-050); no I/O

src/
  main.ts                    entry point
  app/App.svelte             root UI component, router
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
    database.ts              Dexie schema and open()                  (planned)
    repositories/            QuestionRepository, AttemptRepository, CardRepository,
                             SkillRepository, DailyRepository, BookmarkRepository,
                             CorrectionRepository, ReportRepository, MockRepository
  services/
    PracticeSession.ts  AuthService.ts  ReminderService.ts  MockService.ts
    ReportService.ts  AccountService.ts
  sync/
    SyncManager.ts  PackUpdater.ts  ManifestVerifier.ts  CorrectionApplier.ts
    CheckpointLoader.ts      (D-026)
  ui/
    index.css                the only stylesheet the app imports (Step 4)
    tokens.css               colour/type/space/radius/motion tokens, light + dark (D-051..D-054)
    base.css                 element defaults, 16px body, focus ring, reduced motion
    components.css           btn, option, card, chip, field, banner, sheet, nav, ...
    fonts.css                six @font-face blocks for self-hosted Mukta (D-052)
    fonts/                   subset woff2 files + OFL.txt
    preview.html             living design-system page; open in a browser
    screens/                 Practice, Mock, Results, ReportError, Settings, ...   (planned)
server/
  functions/sync             POST /sync handler
  functions/grade_mock       live mock grading
  functions/delete_user      account deletion cascade (F12)
  jobs/nightly_compaction    inbox → stats + immutable daily log files (D-027)

tests/
  core/                      Attempt.test.ts, EloRating.test.ts, ... (Vitest, node env)
  shared/                    canonicalJson.test.ts
  tools/                     csv.test.ts, master.test.ts, build.test.ts, cli.test.ts,
                             fixtures.ts (in-memory master rows)
  ui/                        tokens.test.ts — WCAG contrast, token discipline, tap targets,
                             font subset size and licence
  fixtures/                  elo-golden.json — hand-computed regression pins

content/
  master/questions.csv       authoritative bank: one row per question (D-047)
  sample/questions.csv       four-row pipeline fixture (3 verified, 1 draft)
  packs.lock.json            written by the first build; commit it so versions persist
  dist/                      build output (gitignored)

tools/content/               offline build, run with tsx; never imported by the app
  csv.ts                     strict RFC 4180 reader
  master.ts                  COLUMNS, statuses, difficulty seeds, validateMaster
  build.ts                   buildContent / writeBuild / lock
  signing.ts                 Ed25519 sign, verify and keygen
  cli.ts                     validate / build / keygen entry point (F13)
```

**Dependency direction (explicit, see D-030 and D-036):**

| Directory | May import from |
|---|---|
| `shared/` | nothing — plain data, constants and tiny pure helpers only |
| `core/` | `core/`, `shared/` (types and pure helpers only), and pure third-party libraries such as `ts-fsrs`. Never `ui/`, `data/`, `sync/`, `services/`. |
| `data/` | `core/` (types only), `shared/` |
| `services/` | `core/`, `data/`, `sync/`, `shared/` |
| `sync/` | `core/`, `data/`, `shared/` |
| `ui/` | `ui/` (styles and components), `core/` (types only), `services/`, `shared/` |
| `tools/content/` | `shared/`, `src/core/Question.ts` (read-only validation), Node built-ins. Never `ui/`, `data/`, `services/`, `sync/`. |
| `content/` | nothing — CSV data and build output only |

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
| F13 | Build and publish content packs | Developer runs the content CLI |

---

## F1: App startup (entry point)

```
main.ts › bootstrap()
├─ data/database.ts › openDatabase()                     [DB read]
├─ services/AuthService.ts › restoreSession()            [DB read]
├─ sync/PackUpdater.ts › ensureBundledPacks()            [DB write] first launch only
├─ shared/contract.ts › istDayKey(now)                    pure
├─ data/repositories/DailyRepository.ts › all()           [DB read]
├─ core/StreakTracker.ts › evaluate(summaries, todayKey)  pure → {current, doneToday}
├─ app/App.svelte › mount()                              [UI]
└─ ⟶ async sync/SyncManager.ts › start()                 → F4, F5
```

**Failure path:** if the database fails to open, show a "Storage unavailable" screen with a retry. Nothing on the network blocks first paint; sync starts only after the UI is mounted.

---

## F2: Answer a question (hot path, < 50 ms)

```
ui/screens/Practice.svelte › onOptionTap(index)
└─ services/PracticeSession.ts › submitAnswer(index)
   ├─ core/Attempt.ts › Attempt.create(question, chosen, ms, ctx)  pure
   ├─ ⟦ txn ⟧
   │  ├─ data/repositories/AttemptRepository.ts › append()          [DB write]
   │  ├─ core/ReviewScheduler.ts › review(cardState, outcome, now, examDeadline) pure
   │  ├─ data/repositories/CardRepository.ts › put()                [DB write]
   │  ├─ core/EloRating.ts › updateSkill(skill, questionRating, outcome) pure
   │  ├─ data/repositories/SkillRepository.ts › put()               [DB write]
   │  ├─ core/StreakTracker.ts › apply(attempt, todaySummary)       pure
   │  └─ data/repositories/DailyRepository.ts › put()               [DB write]
   │  ⟦ /txn ⟧
   ├─ ui/screens/Practice.svelte › showFeedback()                   [UI]
   └─ → F3
```

`outcome` is `'correct' | 'wrong' | 'skip'`, derived from `Attempt.record.correct` (`skip` when `chosen === null`). A skip is logged but is a no-op for Elo and FSRS (D-034). `Attempt.create` captures `qid` and the question version `qv` so a later correction can re-grade against the right key (D-022). `ReviewScheduler.review` calls the FSRS-7 preset synchronously (correct → `Good`, wrong → `Again`), and clamps the new due date to `examDeadline` without touching stability (D-037). `cardState` comes from `CardRepository.get(qid)`; when the question has never been served, `PracticeSession` creates it with `ReviewScheduler.newCard(qid, now)` before the review, so a skip stores a fresh card that is still due rather than advancing anything. `StreakTracker.apply(attempt, todaySummary)` returns the day's updated counters and starts the row when `todaySummary` is null; a skip leaves `attempted`, `correct` and `ms` unchanged, so it cannot complete the streak (D-041, D-043).

**Why one transaction:** five separate writes cost far more than one commit on a Redmi 9A class device, and either everything is saved or nothing is.
**Ordering:** render the next question optimistically and let the transaction commit behind it; never block the tap on the commit. Flush any in-flight transaction on `onPause` so a backgrounded app cannot lose an answer.
**Failure path:** if the transaction fails, nothing is saved, the attempt object is kept in memory and retried with the same UUID (idempotent), and an error is reported to Sentry. The UI shows "Couldn't save, retrying" — the attempt is not silently lost.

---

## F3: Pick the next question

```
services/PracticeSession.ts › next()
├─ data/repositories/CardRepository.ts › dueCards(now)                  [DB read]
├─ if none are due:
│  ├─ data/repositories/SkillRepository.ts › get(subtopic)              [DB read]
│  ├─ data/repositories/AttemptRepository.ts › recentQids(30)           [DB read]
│  └─ loop step 0..MAX_RANGE_STEP, stop at the first non-empty:
│     ├─ core/AdaptiveEngine.ts › targetRange(skill, step)              pure → {min,max}
│     └─ data/repositories/QuestionRepository.ts › candidates(range)    [DB read]
└─ core/QuestionPicker.ts › pick(dueCards, candidates, recentIds, rng)  pure
   → { qid, reason: 'review' | 'new' } | null
```

`PracticeSession` does the reads and hands plain data to `QuestionPicker`, so `core/` never imports `data/` (D-030).

Order of preference: due revision cards first, **earliest `due` first**, with a tie broken by question id. Otherwise a new question is picked uniformly at random from the questions inside the band, sorted by id first so the same roll always means the same question. `recentIds` filters new questions only; it never blocks a review (D-045).

The band starts at ±100 Elo around `skill.elo`, then widens to ±200 and ±400, and finally to the whole 600–2200 scale (`targetRange(skill, step)` with `step = 0..MAX_RANGE_STEP`), always clamped (D-044). If every candidate is recent, the picker ignores the exclusion rather than dead-ending a tiny sub-topic (D-046).

**Failure path:** `pick` returns `null` only when nothing is due and the candidate list is empty; the screen then says "You've finished this sub-topic".

---

## F4: Background sync

```
sync/SyncManager.ts › runOnce()
├─ data/repositories/AttemptRepository.ts › unsynced(limit 200)    [DB read]
├─ data/repositories/ReportRepository.ts › pending(limit 20)        [DB read]
├─ sync/SyncManager.ts › buildBatch()                              pure
├─ ⟶ POST /sync  → server/functions/sync                          [network]
│  ├─ dedupe by batchId (sync_batches)
│  ├─ insert attempt_inbox + question_reports
│  ├─ derive daily_stats from the attempts (D-028)
│  └─ return { newCursor, corrections }
├─ data/repositories/AttemptRepository.ts › markSynced(ids)        [DB write]
├─ data/repositories/ReportRepository.ts › markSent(ids)           [DB write]
├─ sync/CorrectionApplier.ts › apply(corrections)                  → F6
└─ sync/PackUpdater.ts › checkForUpdates()                         → F5
```

**Payload:** attempts plus `reports[]` (F11). No client-computed `daily` aggregates — the server derives them (D-028).
**Failure path:** on network error, keep attempts unsynced and retry with backoff. Retries are safe because the server ignores duplicate `batchId`s (see D-009, D-023). A partial success never happens: the transaction either accepts the batch or not.

---

## F5: Question pack update

```
sync/PackUpdater.ts › checkForUpdates()
├─ ⟶ GET manifest.json                                     [network]
├─ sync/ManifestVerifier.ts › verify(manifest)             Ed25519 over canonicalJson(body), D-025/D-050
├─ sync/PackUpdater.ts › diff(manifest, localPacks)        pure
└─ for each changed pack:
   ├─ ⟶ GET pack file                                      [network]
   ├─ sync/PackUpdater.ts › checkSha256()
   └─ data/repositories/QuestionRepository.ts › replacePack()   [DB write]
```

**Failure path:** if the signature or hash fails, discard the download, keep the old pack, report to Sentry. Never install an unverified pack.

---

## F6: Apply an answer-key correction

```
sync/CorrectionApplier.ts › apply(corrections)
└─ for each correction:
   ├─ data/repositories/CorrectionRepository.ts › put()              [DB write]
   ├─ data/repositories/AttemptRepository.ts › byQuestion(qid)       [DB read]
   ├─ data/repositories/AttemptRepository.ts › all()                 [DB read]
   ├─ core/Replayer.ts › regrade(byQuestion, newAnswer)   pure → {attempts, changed}
   ├─ core/Replayer.ts › rebuild(all, checkpoint, correctedIndex) pure → {cards, skills}
   ├─ ⟦ txn ⟧ data/repositories/{Card,Skill}Repository.ts › putAll() [DB write]
   └─ return { changedCount }  → services/ raises an event, ui shows the banner   [UI]
```

`sync/` may not import `ui/`, so the applier returns a count and the UI reacts to it.

See D-022, D-038 and D-039. `regrade` produces the corrected view and the count for the banner; it writes nothing, because attempts are append-only. `rebuild` then re-derives cards and skills with the corrected answer key in the index. The original attempts are never edited; only derived state is recomputed.

**Checkpoint limit:** an attempt already folded into the newest checkpoint cannot be re-graded on a phone that has pruned; the server must republish the checkpoint. Corrections target recent questions in practice, and the banner says when history is incomplete.

**Ordering rule:** the local `corrections` row is written *before* the pack is re-downloaded, and it overrides the answer key for **grading** from that moment on. The question **display** updates when the corrected pack lands. Without this rule, a student who answers the question between the correction sync and the pack download is graded against a key we already know is wrong.

---

## F7: Sign-in and history rebuild

```
services/AuthService.ts › signInWithGoogle()                        [network]
├─ guest with local data?  → SyncManager.uploadAll()                → F4
└─ new device?
   ├─ ⟶ download checkpoint + log files newer than the checkpoint   [network]
   ├─ data/repositories/AttemptRepository.ts › mergeAll()           [DB write]
   ├─ core/Replayer.ts › rebuild(attempts, checkpoint, index)  pure → {cards, skills}
   └─ data/repositories/{Card,Skill}Repository.ts › putAll()        [DB write]
```

See D-016, D-026, D-038 and D-040. Merge = combine both logs, de-duplicate by attempt ID, sort by `(at, id)`, and keep only attempts strictly after the checkpoint cursor (a `"<at>:<id>"` tuple). Replaying the full log is not required once a checkpoint exists. The `ReplayIndex` is assembled from the `questions` store and `question_corrections`; `rating` is `Question.eloSeed`, fixed for the replay.
**Failure path:** if a log file fails to download, keep what merged, mark history incomplete in `syncMeta`, and retry on the next sync. Never wipe local attempts on a failed rebuild.

---

## F8: Live mock

```
ui/screens/Mock.svelte › start()
└─ services/MockService.ts › startSession(mockId)
   ├─ ⟶ RPC start_mock → server records startedAt, returns questions without answers   [network]
   ├─ data/repositories/MockRepository.ts › saveSession(questions, ttl)   [DB write]
   ├─ … student answers locally, no grading on device …
   └─ ⟶ RPC grade_mock(answers)                                    [network]
      └─ server: time-window check, speed check, grade, store score, update leaderboard
```

See D-029. Mock questions are saved locally with a TTL and cleared on successful submit, so a phone call or a 4G drop does not end the session; reopening resumes while the window is open. Mock questions are never written to the `questions` store, so they do not enter the offline practice bank.
**Failure path:** answers are saved locally during the test; if submission fails, retry until the window closes. A session that never submits is graded as abandoned, not as zero.
**Offline edge:** if the network is down when the student opens a mock, the mock cannot start (questions live on the server). The UI says so before the tap, not after.

---

## F9: Nightly compaction (server)

```
server/jobs/nightly_compaction › run()
├─ read attempt_inbox
├─ update question_stats (attempts, correct, avgMs, elo)
├─ write one immutable file per user per day (users/<id>/<yyyy-mm-dd>.gz)   D-027
├─ if due, write a checkpoint row (cursor, cardStates, skills)              D-026
├─ recompute daily_stats from attempts, not from client aggregates          D-028
└─ delete processed inbox rows
```

See D-023, D-026, D-027, D-028. Must be idempotent: running it twice must not double-count and must not rewrite an existing day file. Daily files are immutable by construction; a failed run loses at most one day, which the next run re-derives from the inbox.

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
ui/screens/ReportError.svelte › submit(reason)
└─ services/ReportService.ts › report(qid, qv, reason)
   ├─ data/repositories/ReportRepository.ts › queue()               [DB write]
   └─ ⟶ next sync batch: reports[] → question_reports              [network]
```

Queued offline and sent with the next sync batch, so reporting never fails on patchy 4G. Requires one contract addition: a `reports: [{ qid, qv, reason, at }]` array (max 20 per batch) in the sync payload.
**Failure path:** stays queued; a report is never dropped silently. Duplicate reports for the same question version are collapsed on the device.

---

## F12: Delete account

```
ui/screens/Settings.svelte › confirmDelete()
└─ services/AccountService.ts › deleteAccount()
   ├─ ⟶ RPC delete_user()                                          [network]
   │  └─ server: delete daily_stats, question_reports, mock_answers,
   │     mock_sessions, attempt_inbox, sync_batches, checkpoints,
   │     profiles, log files under users/<id>/, then the auth user
   ├─ data/database.ts › wipeLocal()                                [DB write]
   └─ sync/SyncManager.ts › stop()
```

Promised in the feature list and required by the DPDP Act: deletion must be complete, including object storage — deleting the auth user alone leaves the log files behind.
**Failure path:** if the server call fails, do **not** wipe local data; show the error and retry. Local wipe happens only after the server confirms, otherwise the account becomes undeletable while its data still exists.

---

## F13: Build and publish content packs (developer, offline)

```
npm run content:validate -- [--input <csv>] [--verbose]
└─ tools/content/cli.ts › main(['validate', ...])
   ├─ tools/content/csv.ts › parseCsv(text)                     strict; no network
   └─ tools/content/master.ts › validateMaster(table)
      └─ src/core/Question.ts › Question.issues(record)         same rules as the app
         → report { rows, counts, errors, warnings, questions }

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

Only `verified` rows are packed; `draft` and `rejected` rows may be incomplete and produce warnings instead of errors (D-047). A blank or duplicate id, an unknown status, and every issue on a verified row are errors. The build stops before writing anything if the report has an error, so a failed run leaves the previous manifest and lock untouched.

`--generated-at <iso>` makes the manifest reproducible; `CGL_SIGNING_KEY` and `CGL_PACK_URL_BASE` replace the two required options. The key is generated outside the repository, and `*.pem` is gitignored. `content/packs.lock.json` is committed so a pack version moves only when its questions change, while the URL always carries the byte hash so a changed file cannot be served from a stale CDN cache.

**Failure path:** a CSV parse error, a validation error, a missing key or a non-https URL exits non-zero with the offending line and leaves `<out>/` and the lock unchanged. No network is touched. The app verifies the same canonical bytes in F5; if verification fails it discards the manifest and keeps the installed packs.

**Deferred:** the admin verification UI (Step 7) will call the same `validateMaster` and `buildContent`. Until then the CSV `status` column is the review queue.

