# CGL GK Master — Project Spec

**Last updated:** 2026-11-07
**Status:** Steps 1–6 and 7A–7C are complete. Step 7A wrote and tested the server migrations, RLS policies, `apply_sync_batch`, `sync_pull` and `compact_sync_inbox` in PGlite; Step 7B gave the client pinned batch retries, a report queue and correction rebuilds; Step 7C adds Google sign-in through a small GoTrue PKCE client, the five-minute sync scheduler and the paged history pull. Staging account deletion, live mocks and the nightly archive remain (§5, §13, D-063..D-076).

This is the single source of truth for what we are building and why. Companion files:

| File | Purpose |
|---|---|
| `PROJECT_SPEC.md` | This file: what we are building, the full approved design |
| `design.md` | Decision log: every decision with reasons and trade-offs (D-001 to D-076) |
| `flow.md` | Code execution flows: entry points and call order between files |
| `REVIEW-2026-11-01.md` | Step 1.6 external review: findings, open questions, what changed |

The `.docx` is **not** a source of truth: it is a snapshot of this file, regenerated at the end of each step and never hand-edited (D-031). The three `.md` files win any disagreement.

---

## 1. Product

An offline-first, bilingual (Hindi + English) General Awareness practice app for SSC CGL aspirants. It combines SSC previous year questions (PYQs), current affairs, and reviewed practice questions with adaptive difficulty (stronger students get harder questions, struggling students get easier ones) and Anki-style spaced revision.

### Constraints

| Constraint | Value |
|---|---|
| Budget | ₹10,000 for build and launch |
| Timeline | 12 weeks |
| Launch scope | ~2,000 verified questions in History, Polity, Geography |
| Long-term content | 10,000 questions, added monthly after launch |
| Primary device | Low-end Android (Redmi 9A class), patchy 4G |
| Languages | Hindi and English from day one |
| Design load | 1,000 launch users; 1,00,000 users as headroom |
| Platform | Capacitor Android app (offline-first SPA); no Electron; no public web PWA in v1 (D-058) |
| Monetisation | Free for the first 6 months |
| Team | Solo developer, who is also the final question verifier |

---

## 2. Syllabus structure

Seven sections. Static GK is evergreen; Current Affairs expires and is packed monthly.

1. **History (Indian & Modern)**
   - Prehistoric India & Indus Valley Civilization
   - Vedic Age; Mauryan & Gupta Empires
   - Medieval India: Delhi Sultanate, Mughals, Regional Kingdoms
   - Socio-Religious Reform Movements & Freedom Struggle
   - Post-Independence Landmarks & Constitutional Developments
2. **Geography (India & World)**
   - Physical Features: Mountains, Plateaus, Rivers, Plains
   - Climate & Monsoon System of India
   - Soil, Vegetation, Natural Resources, Minerals
   - Agriculture & Cropping Systems
   - Map-based Static GK
3. **Polity & Governance**
   - Constitution Basics: Preamble, Fundamental Rights, DPSP
   - Parliament, President, PM & Council of Ministers
   - Judiciary: Supreme Court & High Courts
   - Local Governance: Panchayati Raj
   - Important Constitutional Amendments & Acts
4. **Economy & Budget**
   - GDP, Inflation, Fiscal Deficit
   - Budget & Taxation Basics
   - Banking: RBI, Monetary Policy, Financial Inclusion
   - Government Schemes, Subsidy & Welfare Programs
5. **Science & Technology**
   - Everyday Physics & Chemistry
   - Biology: Human Body, Diseases, Vaccines
   - Inventions & Discoveries
   - Recent Advances: Space, IT, Biotech
6. **Static GK**
   - Important Dates & Events
   - Awards & Honours
   - Sports: Tournaments & Venues
   - Books & Authors
   - International Bodies (UN, WHO, IMF, WTO): Basics & Headquarters
7. **Current Affairs** (monthly packs, last 12 months)
   - National
   - International
   - Sports, Awards, Appointments
   - Schemes, Economy, Science

Launch (v1) covers sections 1–3. Sections 4–7 follow monthly.

---

## 3. Features

- **Adaptive practice:** Elo rating per sub-topic, corrected for the 25% guessing floor of 4 options. Questions come from a ±100 Elo band that widens to ±200, ±400 and then the whole 600–2200 scale when a sub-topic is sparse (D-044). Due reviews come first, earliest first; new questions are random and avoid the last 30 answers unless that would dead-end (D-045, D-046).
- **Spaced revision:** FSRS (desired retention 0.9), intervals capped at the student's exam date. Wrong answers return automatically.
- **PYQ mode:** filter by exam year, shift, section.
- **Practice mock tests:** 25 questions, 15 minutes, 0.5 negative marking.
- **Live mocks:** server-graded; the only source of leaderboard rankings. Each mock is open for a 72-hour weekend window (Fri–Sun IST), resumable after a dropped connection, with no push notifications in v1 (D-029).
- **Current affairs:** monthly quizzes, weekly quiz, one-liner flashcards, year in review.
- **Map practice:** image-based questions (rivers, mountains, national parks, states).
- **Daily quiz** (10 mixed questions), **streaks** with local reminder notifications.
- **Bookmarks** and a **Revise** queue.
- **Analytics:** accuracy and skill per section and sub-topic, weak areas, PYQ coverage, time per question.
- **Report error** on every question; "This question was corrected" notes and banner.
- **Guest mode** (no login); **Google sign-in** for cross-device sync.
- **Admin site** with a verification queue (draft → verified → published).
- **Crash monitoring** via Sentry free tier.
- **SSC non-affiliation disclaimer** in the app and store listing.

---

## 4. Non-functional targets

| Target | Value |
|---|---|
| First load (budget phone) | < 2 s; assets ship inside the app |
| Repeat open, including offline | < 0.5 s |
| Answer tap to next question | < 50 ms; all writes in one IndexedDB transaction |
| App code size (compressed) | < 300 KB |
| One sub-topic question pack | ~100–250 KB |
| Local attempt retention | Raw 12 months, then monthly summaries + FSRS snapshot (checkpoint — see D-026) |
| Offline | Everything except login, sync, live mocks |
| Server uptime | 99.5% |

---

## 5. Architecture

```
Content pipeline (PYQs, PIB, Claude API, human review)
        │ publishes signed packs
        ▼
Cloudflare CDN (app shell + question packs)      Supabase (auth, Postgres, RLS, storage)
        │ packs, downloaded once                         ▲ batched sync of attempts
        ▼                                                │
┌──────────────── Student phone (Capacitor app, offline-first) ────────────────┐
│  UI layer (Svelte)  │  Domain core (TS: Elo, FSRS, streaks)  │  Dexie (IndexedDB) │
└───────────────────────────────────────────────────────────────────────────────┘
```

All study logic runs on the phone. The CDN delivers content; Supabase stores small tables and compressed attempt logs.

### Tech stack

| Layer | Choice |
|---|---|
| UI | Svelte + TypeScript |
| Domain logic | Plain TypeScript classes, framework-independent |
| Local storage | IndexedDB via Dexie |
| Android packaging | Capacitor |
| Backend | Supabase (Postgres, Google auth, Row-Level Security, storage) |
| Auth client | Small in-app GoTrue PKCE client, no `supabase-js` (D-073) |
| File delivery | Cloudflare Pages / CDN |
| Revision algorithm | FSRS-7 via `ts-fsrs` v6, synchronous preset, fuzzing off (D-037) |
| Question generation | Claude API (Batch API, smaller model for drafts) |
| Monitoring | Sentry free tier |

Dependency direction: `ui → services/sync/auth → core ← data`. `core/` imports only `core/`, types and pure helpers from `shared/contract.ts`, and pure third-party libraries (`ts-fsrs`); it performs no reads or writes, and repositories do all database work (D-030, D-036, D-037). `shared/contract.ts` is plain data shared by the app, the admin bundle and the server functions.

**Step 2 core (completed 2026-11-04 to 2026-11-07):** `shared/contract.ts` holds every boundary type and constant, plus `istDayKey`, `encodeCursor` and `compareCursor`; `src/core/Attempt.ts`, `EloRating.ts`, `ReviewScheduler.ts`, `Replayer.ts`, `StreakTracker.ts`, `AdaptiveEngine.ts` and `QuestionPicker.ts` are implemented and unit-tested with Vitest, including hand-computed Elo pins, FSRS-7 schedule pins, checkpoint-resume tests, IST streak boundaries, band widening and picker priority/fallback. `tsc --noEmit` and `npm test` both pass. `Question.ts` moves to Step 3 with the content pipeline.

**Step 5 shell (completed 2026-11-07):** Vite 8 + Svelte 5 SPA, no SvelteKit (D-055). `src/main.ts` bootstraps storage, applies the first-run or stored theme, mounts `src/app/App.svelte`, and listens for the native Android back button (D-056). `src/app/router.ts` is a typed hash router over `#/home`, `#/practice`, `#/practice/:subtopic`, `#/mock/:id`, `#/progress`, `#/settings` and a renderable 404. `src/data/database.ts` defines the ten-table Dexie schema; eight repositories (Question, Attempt, Card, Skill, Daily, Pack, Settings, Sync) cover the stores the app reads today. UI chrome is a typed `en`/`hi` dictionary with no i18n library (D-057). Home and Settings render; other routes are placeholders until their steps land. Measured bundle: 55.66 kB gzip JS and 4.05 kB gzip CSS. 329 tests pass.

**Step 6 practice (completed 2026-11-07):** `src/sync/PackInstaller.ts` installs the signed pack bundled in the APK: it verifies the Ed25519 manifest signature against the key pinned in `src/sync/contentPublicKey.ts`, checks each pack's SHA-256, validates every question and replaces the pack in one Dexie transaction (D-059). `src/services/PracticeService.ts` owns the answer cycle in a single transaction — attempt append, FSRS-7 card, sub-topic Elo and IST daily counter — and picks the next question due-first, excluding scheduled cards from the new pool (D-060). `#/practice` is a sub-topic chooser; `#/practice/:subtopic` runs a session with instant feedback, locked options and an explicit Next (D-061, D-062). Home now shows real streak, accuracy, rating and due counts. Measured bundle: 78.48 kB gzip JS and 4.05 kB gzip CSS. 350 tests pass.

**Step 7A sync backend (completed 2026-11-07):** `supabase/migrations/` defines `profiles`, `sync_state`, `sync_batches`, `attempt_inbox` (one row per attempt, D-063), `daily_stats`, `question_stats`, `checkpoints`, `question_corrections` and `question_reports`, with indexes, Row-Level Security for `authenticated` and no access for `anon`. `apply_sync_batch(jsonb)` is the only write path: one transaction validates the batch, returns a stored response for a repeated `batchId`, dedupes attempts by primary key, updates aggregates (D-064, D-065, D-067) and returns `SyncResponse`. `sync_pull(text, integer)` pages the log for a new device (F7). `compact_sync_inbox(interval)` prunes only behind a checkpoint (D-066). `supabase/functions/sync/index.ts` is a thin Deno adapter. 38 new tests boot Postgres in WASM through `@electric-sql/pglite` and run the migrations unchanged, including RLS as a non-owner (D-068); 388 tests pass.

**Step 7B client sync (completed 2026-11-07):** `src/sync/SyncManager.ts` sends unsynced attempts and queued reports in one batch at a time (200 attempts, 20 reports), records the server cursor and folds corrections in. The batch id and its exact contents are pinned in `syncMeta.pendingBatch` before the request, so a retry after a lost response or an app restart resends the same set and receives the server's stored response (D-067, D-070). `src/sync/SyncTransport.ts` is the only file that touches `fetch`, the URL and the token (D-069); `src/sync/backoff.ts` doubles 1 s → 5 min with jitter and honours `retryAfterMs`. Report taps live in a new `reports` table, Dexie schema v2, keyed `[qid+qv+reason]` (D-071). `src/sync/CorrectionApplier.ts` stores a batch of corrections and rebuilds cards/skills once with a corrected index; `PracticeService.answer` grades against `CorrectionRepository.answerFor` from the moment the row lands (D-072). 58 new tests cover replies, retries, pinning, corrections, the transport and the queue; 446 tests pass. The sync timer and the real access token are Step 7C.

**Step 7C auth and scheduler (completed 2026-11-07):** `src/auth/` is a small GoTrue client instead of `supabase-js`: S256 PKCE with a random `state`, an `OAuthBrowser` seam (Capacitor Browser + the `com.cglgkmaster.app://auth-callback` deep link on Android, a page redirect on the web), a session in `localStorage` and a 10-minute pending verifier in `sessionStorage` (D-073). `src/services/AuthService.ts` restores the session, refreshes single-flight 60 s before expiry, claims the device for one account and refuses a second with a clear message (D-075). `src/services/HistoryService.ts` pages `sync_pull` from `syncMeta.historyCursor`, merges by attempt id, rebuilds derived state once and advances the cursor only after a complete pull (D-074). `src/services/SyncScheduler.ts` owns the five-minute timer, `online`/visibility wakes, auth/offline gating and `retryInMs` scheduling, with one run in flight (D-076); `App.svelte` only starts and stops it. `android/app/src/main/AndroidManifest.xml` gains the VIEW/BROWSABLE intent filter, and `.env.example` documents `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_AUTH_REDIRECT_URL`. 95 new tests cover PKCE (including the RFC 7636 vector), the GoTrue client, token stores, auth orchestration, paging, the pull transport and the scheduler; 541 tests pass. Measured bundle: 88.59 kB gzip JS and 4.05 kB gzip CSS. The OAuth round trip and token refresh still need a staging Supabase project; the Gradle build still needs a JDK and Android SDK.

---

## 6. Data model

The attempt log is the single source of truth. FSRS card state and Elo ratings are rebuilt by replay from the newest checkpoint plus the attempts after it (D-016, D-026). Per-attempt state is never synced.

### On the phone (Dexie)

| Store | Key fields | Purpose |
|---|---|---|
| questions | id, v, packId, section, subtopic, source, en/hi {q, options, explanation}, answer, eloSeed, image | Offline question bank |
| packs | id, version, sha256 | Downloaded packs |
| attempts | id (UUID v7), qid, qv, chosen, correct, ms, mode, mockId, at, deviceId, synced | Append-only log |
| cardState | qid, due, stability, stabilityFast, difficulty, scheduledDays, learningStep, reps, lapses, lastReview, phase | FSRS-7 state, derived (D-037) |
| skills | subtopicId, elo, attemptCount | Elo rating, derived |
| corrections | qid, toVersion, seen | Corrected-question notes |
| bookmarks | qid, createdAt | Saved questions |
| dailySummary | date, attempted (graded only), correct, ms | Streak and charts (D-041..D-043) |
| settings | language, theme, dailyGoal, examDate, reminderTime | Preferences |
| syncMeta | deviceId, cursor, lastSyncAt, pendingBatch, accountId, historyCursor | Sync bookkeeping; `pendingBatch` pins an in-flight batch (D-070), `accountId` binds the phone to one account (D-075), `historyCursor` is the last pulled position (D-074) |
| reports | [qid+qv+reason], at, sent | Offline "Report an error" queue, Dexie v2 (D-071) |

### On the server (Supabase)

| Table or store | Key fields | Purpose |
|---|---|---|
| profiles | userId, name, language, examDate | Account; one row per auth user |
| sync_state | userId, lastCursor, lastCorrectionsAt, lastBatchAt | Newest accepted replay position and correction watermark (D-066, D-067) |
| attempt_inbox | userId, attemptId, batchId, qid, qv, chosen, correct, ms, mode, at, deviceId, day, receivedAt | New attempts, one row each; the primary key dedupes retries (D-063) |
| attempt logs (storage) | users/<id>/<yyyy-mm-dd>.gz, one immutable file per day, compact encoding | Full history after the newest checkpoint (D-027) |
| daily_stats | userId, date, attempted, correct, ms | Multi-device streaks; derived in the sync transaction from attempts only (D-065) |
| checkpoints | userId, cursor (`"<at>:<id>"`), cardStates, skills, istDailyTotals, createdAt | Replay start point; written before any prune (D-026, D-040) |
| question_stats | qid, attempts, correct, totalMs, avgMs, elo | Aggregate answer statistics, updated during sync (D-065); difficulty calibration nightly |
| sync_batches | userId, batchId, receivedAt, attemptCount, reportCount, response | Idempotency key; a retry replays `response` verbatim (D-067) |
| question_corrections | id, qid, fromVersion, toVersion, oldAnswer, newAnswer, reason, correctedAt | Append-only |
| question_reports | userId, qid, qv, reason, at, status | Student error reports |
| mock_tests | id, title, startsAt, endsAt, durationSec, questionIds | Live mock definitions |
| mock_sessions | id, userId, mockId, startedAt, submittedAt, score, correct, wrong, flagged | One per student per mock |
| mock_answers | sessionId, qid, qv, chosen, ms | Graded on server |
| questions (admin) | master copy, v, status, sourceUrl, verifiedAt | Draft → verified → published |
| pack_manifest | packId, version, sha256, url, signature | What the CDN serves |

---

## 7. Data contract

### Question packs

```
manifest.json
{ version, generatedAt,
  signature,                    // Ed25519 over canonicalJson({version, generatedAt, packs}), D-050
  packs: [{ id, section, subtopic, kind: "evergreen" | "current-affairs",
            version, sha256, url, count, bytes }] }

pack file
{ id, version,
  questions: [{ id, v,          // questionVersion, bumped on any correction
    section, subtopic,
    source: { type: "PYQ" | "CA" | "practice", exam?, year?, date?, shift?, caMonth? },
    en: { q, options[4], explanation },
    hi: { q, options[4], explanation } | null,
    answer, eloSeed, image?, verifiedAt }] }
```

Current affairs packs are named by month (`ca-2026-10`). Live mock questions are never in public packs.

### Attempt record

```
{ id: UUIDv7, qid, qv,          // graded against this exact question version
  chosen: 0-3 | null,           // null = skipped
  correct, ms,
  mode: "practice" | "pyq" | "mock" | "daily" | "revise",
  mockId?, at, deviceId }
```

### Sync payload

```
POST /sync
{ batchId, deviceId, cursor,
  attempts: [ up to 200 attempt records ],
  reports:  [ up to 20 { qid, qv, reason, at } ] }

response
{ ok, serverTime, newCursor, corrections: [ changes since the watermark ] }
```

`reports` is new (F11). There is no client `daily` field (D-028): the server derives `daily_stats` from `attempts` alone: the IST day comes from `at` when it is not in the future and not older than 30 days, otherwise from `receivedAt`.

`cursor` is the `"<at>:<id>"` replay position of the last attempt the client has folded in (D-040); the response's `newCursor` is the newest position the server has accepted, or `null` while the student has no accepted attempt. A repeated `batchId` returns the response stored on the first call, so a lost reply can be retried (D-067).

### History download (F7)

```
RPC sync_pull(after cursor | null, limit 1..500)
{ ok, serverTime, attempts: [ attempt records in replay order ],
  nextCursor, hasMore }
```

Used by a new or second device to merge history. `after` is `syncMeta.historyCursor` (null on the first sign-in, which means a full pull). The client pages until `hasMore` is false, merges by attempt id, sorts by `(at, id)` and rebuilds derived state once; the cursor advances only after the last page, so a failed page is re-fetched and deduped rather than restarting the account. At-least-once: the client dedupes by attempt id. Checkpoints are not written yet; 7A-2 will let the pull start from a checkpoint plus the tail (D-074).

---

## 8. Sync and corrections

1. **Answer:** one IndexedDB transaction saves the attempt, updates FSRS and Elo, updates today's summary, marks it unsynced.
2. **Sync:** on app open, every 5 minutes in use, and on foreground/online wake (D-009, D-076). A guest or offline device skips the request but keeps the timer. Duplicates ignored by `batchId`; a repeated batch returns the stored response (D-067), and `daily_stats`/`question_stats` derive inside the same transaction (D-065).
3. **Nightly job:** writes each student's attempts to immutable **daily** log files (D-027), writes a checkpoint **before** any prune (D-026), calibrates `question_stats.elo`, and prunes only attempts a checkpoint already covers (D-066). Must be idempotent.
4. **New or second device:** upload the local log, then page `sync_pull` from `historyCursor`, merge with local attempts, de-duplicate by attempt ID, sort by `(at, id)`, and replay the full log once. The cursor advances only after a complete pull; checkpoints make the pull cheaper in 7A-2 (D-074).
5. **Content updates:** check the signed manifest; re-download only changed packs; reject anything unsigned or with a bad hash.
6. **Guest mode:** all local; the first sign-in uploads the local log, then downloads the account's history. `syncMeta.accountId` binds the phone to that account, and a different account is refused until the app data is cleared (D-075).
7. **Reminders:** local notification at the chosen time if today's streak isn't done.
8. **Streak day boundary:** Indian Standard Time.

**Streak rule:** a day counts when it has at least one graded (non-skip) answer; `dailyGoal` is a separate target that drives the reminder, and skips change neither the counters nor the streak (D-041..D-043). The streak is derived from `dailySummary` at startup, not stored separately (D-042).

**Correction path:** a wrong key is republished as `v + 1` with an append-only `question_corrections` row. On next sync, each phone re-grades past attempts on that question, replays FSRS and Elo for it, and shows a note plus banner. The server re-grades affected `mock_answers` and updates the leaderboard. Original attempts are never edited. If the correction arrives before the corrected pack, the local `corrections` row overrides the answer key for grading immediately; the question display updates when the pack lands (F6).

---

## 9. Security

| Threat | Defence |
|---|---|
| Phishing | Google sign-in only; no passwords exist |
| Fake app clones | Play Store only, verified app-to-domain link, in-app "Official links" page |
| Email spoofing | SPF, DKIM, DMARC on the domain |
| Account takeover | 1-hour tokens, rotating refresh tokens, strict CSP |
| Session storage | WebView `localStorage` for the session, `sessionStorage` for the PKCE verifier with a 10-minute TTL; no third-party script on the auth path (D-073) |
| Account mixing | One Google account per device; a second account is refused until the app data is cleared (D-075) |
| XSS | Questions rendered as plain text only; strict CSP |
| Score cheating | Leaderboard only from server-graded live mocks |
| Data access abuse | Row-Level Security on every table |
| API flooding | Cloudflare, per-user rate limits, max batch size |
| Content tampering | Ed25519-signed manifest, SHA-256 per pack |
| Admin compromise | Separate admin site, Google + 2FA, edit log |
| Supply chain | Locked dependency versions, few dependencies, vulnerability checks |
| Crash data (Sentry captures device and URL context) | `sendDefaultPii: false`; question text and free-text fields scrubbed before send |
| Privacy | Minimal data, delete-account option, DPDP Act compliance |

**Phishing plan:** passwordless login; one official domain and app; "Official links" screen; standing notice that we never ask for payment, OTP, or login details over WhatsApp, Telegram, or email links; email authentication; reserve the app name on Telegram, Instagram, YouTube early; "Report a fake" form.

**Row-Level Security rules:**
- Students read and write only their own rows; `attempt_inbox` is insert-only for its owner.
- Live mocks only through `grade_mock()`: one session per student per mock, server start time, time-window and speed checks.
- `question_stats`, log files, and corrections are written only by the nightly job and admin functions.
- Question content is read-only except for admin accounts.
- The service key never ships in the app.

---

## 10. Content pipeline and verification

**Sources:**
- Real PYQs from official SSC question papers and answer keys (ssc.gov.in).
- Current affairs from PIB (pib.gov.in) press releases.
- AI-generated practice questions via the Claude API.
- Never scrape coaching sites (Testbook, Adda247, etc.): their content is copyrighted.

**Verification workflow** (founder verifies 30–40 questions a day; ~2,000 questions ≈ 57 days, Weeks 3–11):
1. AI drafts questions in batches, each with a source link (SSC paper, PIB release, NCERT).
2. A second AI pass fact-checks against that source; failures are regenerated.
3. Founder approves, edits, or rejects in the admin queue. No source link, no approval.
4. Approved questions publish in the next signed pack.
5. "Report error" reports are triaged within 48 hours; confirmed errors go through the correction path.

**Implemented in Step 3 (2026-11-07):** `content/master/questions.csv` is the authoring source — one row per question, flat English/Hindi and workflow columns (D-047). Ids are assigned-once slugs such as `polity-fr-0007` (D-048); authors mark `easy`, `medium` or `hard`, mapped to Elo seeds 1100/1200/1300 (D-049).

```sh
npm run content:validate -- --input content/sample/questions.csv --verbose
npm run content:keygen   -- --out ../cgl-keys
npm run content:build    -- --key ../cgl-keys/ed25519-private.pem \
                            --url-base https://cdn.example.com/packs
```

`validate` is strict on `verified` rows and warns on drafts. `build` writes one pack per subtopic plus `manifest.json`; a pack version moves only when its questions change, and the file name carries the sha256 prefix so a changed pack cannot be served from a stale cache. The manifest signature covers the canonical JSON of `{ version, generatedAt, packs }` (D-050), and `shared/canonicalJson.ts` is the implementation the app will use. Private keys are generated outside the repository and `*.pem` is gitignored. The admin verification UI is deferred to the backend step; until then the CSV `status` column is the review queue.

---

## 11. UI design system (locked 2026-11-07)

Lives in `src/ui/`; `src/ui/preview.html` is the living reference (open it in a browser and use the light/dark and EN/HI toggles). Contrast, tap targets, token discipline and the font subset are pinned by `tests/ui/tokens.test.ts`; Lighthouse on the preview scores 1.0 for accessibility.

- Clean and minimalist; looks hand-designed, not "vibe-coded".
- One accent colour, consistent spacing grid, clear type hierarchy.
- No gradients, glows, or glassmorphism.
- Icons from a clean set (Lucide) as inline SVG instead of emoji.
- Body text (questions, explanations) **left-aligned, not justified**: justified text creates uneven gaps on narrow screens, especially in Hindi. Centre only short elements (scores, headings, result screens).
- Light and dark mode; Hindi/English toggle; large tap targets.

**Layers** (the app imports `ui/index.css` only):

- `tokens.css` — colour (light and dark), type, 4px spacing grid, radius, elevation, motion, layout. A screen reads tokens; it never hard-codes a colour.
- `base.css` — element defaults: 16px body at 1.6 line-height (1.75 for Hindi), focus ring, reduced-motion rule.
- `components.css` — `btn`, `option`, `card`, `chip`, `field`/`input`, `banner`, `sheet`, `toast`, `nav-bar`, `progress`, `stat`, `list`, `skeleton`, `empty`, `segmented`.
- `fonts.css` + `fonts/` — self-hosted Mukta.

**Locked decisions:**

- **Styling:** CSS custom properties plus per-component scoped CSS. No Tailwind, no runtime CSS-in-JS (D-051).
- **Type:** Mukta 400/600/700 for both scripts; self-hosted, subset to the glyphs the app uses; two subsets per weight; ~196 KB for six woff2 faces; OFL shipped. No Google Fonts request at runtime (D-052).
- **Colour:** deep indigo accent on neutral grey; green/red/amber/blue reserved for answer feedback and system messages (D-053).
- **Density:** 16px body, 4px grid, 640px reading column, 48px minimum targets, 64px bottom nav, 2px option borders (D-054).

---

## 12. Budget

| Item | Cost (approx.) |
|---|---|
| Claude API: 2,000 questions × 3 passes (generate, fact-check, fix) | ₹2,500–3,500 |
| Google Play developer account (one-time, $25), needed by Week 4 | ~₹2,100 |
| Hosting buffer after launch | ₹2,000 |
| Contingency: map images, legal, test phone | ~₹1,500 |
| Domain | ₹800–1,000 per year |

**Free:** Cloudflare Pages, Supabase free tier during build, fonts, icons, SSC papers, PIB.

**Budget assumptions to confirm:**
- The Claude line assumes drafts on a small model with the Batch API and the larger model only for the fact-check pass. Drafting on the larger model throughout roughly triples this line.
- The ₹1,500 contingency does not cover a Redmi 9A class test phone. If one is not already owned, add it before Week 6 — the 50 ms target cannot be verified on any other device class.
- Attempt storage stays flat because of checkpoints (D-026). Without them, log storage would grow ~2 MB per active student per year.

**Month 4 onwards:** Supabase's free tier (about 500 MB database and 50,000 monthly active users at time of writing) should cover the first few thousand users with this design. Beyond that, Supabase Pro is roughly ₹2,100/month plus usage, funded by the month-6 monetisation decision. Verify current limits and prices before launch; set an API spending limit.

---

## 13. Roadmap (12 weeks)

| Weeks | Phase | Work |
|---|---|---|
| 1–3 | Foundations | System design ✔ · Data contract ✔ · OOP core + tests · Content pipeline + admin |
| 4–6 | Core app | Capacitor shell, Play closed test starts (12 testers × 14 days) · UI design system · Practice + offline |
| 7–9 | Features | Mocks, streaks, current affairs · Live mocks + sync · Security, reminders |
| 10–12 | Ship | Polish, Hindi review · Beta (50–100 students), load test · Play Store launch |
| 3–11 | Ongoing | Question verification, 35 a day |

### Step tracker

| Step | Status |
|---|---|
| 1A Requirements & architecture | Done |
| 1B Database schema & sync | Done |
| 1C Security & threat model | Done |
| External review fixes | Done |
| 1.5 Data contract | Done |
| 1.6 External review (second pass) | Done. D-026 to D-031 accepted |
| 2 OOP core classes | **Done 2026-11-07** — scaffold, `Attempt`, `EloRating`, `ReviewScheduler`, `Replayer`, `StreakTracker`, `AdaptiveEngine`, `QuestionPicker`, tests (142 passing). `Question.ts` moves to Step 3 |
| 3 Content pipeline | **Done 2026-11-07** — `Question.ts`, strict CSV master validator, pack builder, Ed25519 manifest signing, tests (233 passing). Admin verification UI deferred to Step 7 (D-047..D-050) |
| 4 UI design system (fonts, colours, components) | **Done 2026-11-07** — tokens, base and component layers, self-hosted Mukta subset, living preview, 47 design-system tests (D-051..D-054) |
| 5–6 App build | **Done 2026-11-07** — Step 5: Vite + Svelte 5 shell, hash router, Dexie schema and eight repositories, typed bilingual UI, Home + Settings (D-055..D-058). Step 6: signed bundled pack install, single-transaction answer cycle, due-first picker, sub-topic chooser and practice/feedback screen (D-059..D-062, 350 tests) |
| 7 Backend & security | **7A + 7B + 7C done 2026-11-07** — migrations, RLS, `apply_sync_batch`, `sync_pull`, `compact_sync_inbox`, thin `/sync` Edge adapter, 38 PGlite tests (D-063..D-068). Client `SyncManager` with pinned retries, transport seam, report queue and correction rebuild (D-069..D-072). PKCE sign-in, session refresh, account claim, five-minute scheduler and paged history pull, 95 more tests (D-073..D-076). Pending: 7D security finish + account deletion, 7E live mocks, 7A-2 archive + checkpoints |
| 8 Polish & launch | Pending |

---

## 14. Open questions

- **Login:** stay Google-only at launch, or also offer phone OTP for students without a Google account? (Currently Google-only + guest mode; OTP costs per SMS.)
- **Hindi vs English user split:** no reliable public data; collect via the language choice at onboarding.
- ~~**Web PWA in v1?**~~ **Resolved 2026-11-07 (D-058):** no public web PWA in v1. The app ships as a Capacitor Android build; the SPA keeps relative paths and hash routes so browser support can be added after launch without a rewrite.
- **Test phone:** is a Redmi 9A class device already owned? It gates the 50 ms target and the ₹1,500 contingency line.

---

## 15. Working rules

**Process:** one step at a time. Every major decision is presented as two options with trade-offs and a recommendation, and is approved before it is locked.

**Instructions for AI coding agents (copy into `CLAUDE.md` or equivalent):**

```markdown
## Documentation rules (mandatory)
- After any meaningful decision (new library, choosing between approaches,
  accepting a trade-off, changing a data format or interface), add an entry
  to design.md using its template. Always fill "Why" and "Trade-off accepted".
  Never delete old entries; mark them superseded.
- After any change that alters how code executes between files or functions,
  update the matching flow in flow.md using its notation.
- Update both files in the same commit as the code change.
- Before finishing a task, state which design.md and flow.md entries you added
  or changed, or say "no documentation changes needed" and why.
- PROJECT_SPEC.md is the source of truth for requirements; if code must deviate
  from it, log a design.md decision and update the spec.
```

---

## 16. Amendments (Step 1.6 review, 2026-11-01)

Six proposals, all **accepted 2026-11-01**. Full reasoning is in `design.md`; the review that produced them is in `REVIEW-2026-11-01.md`. Accepting an item means editing the affected tables in this file and changing its status in `design.md`.

| ID | Change | Affects | Why it cannot wait past Step 2 |
|---|---|---|---|
| D-026 ✔ accepted | Checkpoints at the 12-month prune boundary | §4, §6, §8, F7, F9 | `Replayer`, `SyncManager` and the local `cardState` store all take a different shape with or without it. |
| D-027 ✔ accepted | Immutable daily log files + compact attempt encoding | §6, §7, §8, F9 | The stored format is a public interface; changing it later means migrating every user's history. |
| D-028 ✔ accepted | Server derives `daily_stats`; drop `daily` from the sync payload | §6, §7, §8 | `SyncManager.buildBatch()` and the `/sync` handler are Step 2/7 code. |
| D-029 ✔ accepted | Live mocks in a 72-hour window, no push in v1 | §3, F8 | `MockService` and the notification decision (D-024) depend on it. |
| D-030 ✔ accepted | `core/` is pure, no DB writes | §5, F2, F7 | Step 2 *is* the core classes — this is the one decision that must land first. |
| D-031 ✔ accepted | Markdown is authoritative, `.docx` is a snapshot | Header, this section | Stops the drift that produced this review. |

**All six accepted 2026-11-01.** The `.docx` was regenerated from these files the same day (D-031). Next: Step 2.

### Known divergences

Resolved by the 2026-11-01 regeneration: the docx's "Capacitor + web PWA" platform line and its pointer to a non-existent Word comment are gone (the docx now mirrors this file), and the correction-before-pack rule is in §8. Also corrected on 2026-11-01: `design.md` D-009's stale "~10,000 concurrent" context figure and D-008's misplaced supersede note.

Still open:

1. `flow.md` F12 referenced "checkpoints (D-026, if accepted)" after acceptance — corrected.

Resolved 2026-11-07: web PWA in v1 is dropped (D-058); the platform row, §5 and §14 now agree.
