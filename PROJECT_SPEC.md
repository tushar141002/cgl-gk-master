# CGL GK Master — Project Spec

**Last updated:** 2026-11-04
**Status:** Step 1 (system design), Step 1.5 (data contract) and Step 1.6 (external review) complete. All six amendments (D-026 to D-031) were **accepted on 2026-11-01**. Step 2 is **in progress**: the scaffold, `shared/contract.ts`, `Attempt` and `EloRating` are landed and tested (§5, §13).

This is the single source of truth for what we are building and why. Companion files:

| File | Purpose |
|---|---|
| `PROJECT_SPEC.md` | This file: what we are building, the full approved design |
| `design.md` | Decision log: every decision with reasons and trade-offs (D-001 to D-031) |
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
| Platform | Web app (PWA) packaged with Capacitor for Android; no Electron |
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

- **Adaptive practice:** Elo rating per sub-topic, corrected for the 25% guessing floor of 4 options.
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
| File delivery | Cloudflare Pages / CDN |
| Revision algorithm | FSRS via `ts-fsrs` |
| Question generation | Claude API (Batch API, smaller model for drafts) |
| Monitoring | Sentry free tier |

Dependency direction: `ui → services/sync → core ← data`. `core/` imports only `core/` plus types and pure helpers from `shared/contract.ts`, and performs no reads or writes; repositories do all database work (D-030, D-036). `shared/contract.ts` is plain data shared by the app, the admin bundle and the server functions.

**Step 2.0 scaffold (landed 2026-11-04):** `shared/contract.ts` holds every boundary type and constant; `src/core/Attempt.ts` and `src/core/EloRating.ts` are implemented and unit-tested with Vitest, including hand-computed golden pins in `tests/fixtures/elo-golden.json`. `tsc --noEmit` and `npm test` both pass. The remaining core classes are listed in the step tracker.

---

## 6. Data model

The attempt log is the single source of truth. FSRS card state and Elo ratings are rebuilt by replay from the newest checkpoint plus the attempts after it (D-016, D-026). Per-attempt state is never synced.

### On the phone (Dexie)

| Store | Key fields | Purpose |
|---|---|---|
| questions | id, v, packId, section, subtopic, source, en/hi {q, options, explanation}, answer, eloSeed, image | Offline question bank |
| packs | id, version, sha256 | Downloaded packs |
| attempts | id (UUID v7), qid, qv, chosen, correct, ms, mode, mockId, at, deviceId, synced | Append-only log |
| cardState | qid, due, stability, difficulty, reps, lapses | FSRS state, derived |
| skills | subtopicId, elo, attemptCount | Elo rating, derived |
| corrections | qid, toVersion, seen | Corrected-question notes |
| bookmarks | qid, createdAt | Saved questions |
| dailySummary | date, attempted, correct, ms | Streak and charts |
| settings | language, theme, dailyGoal, examDate, reminderTime | Preferences |
| syncMeta | deviceId, cursor, lastSyncAt | Sync bookkeeping |

### On the server (Supabase)

| Table or store | Key fields | Purpose |
|---|---|---|
| profiles | userId, name, language, examDate | Account |
| attempt_inbox | userId, batchId, attempts, receivedAt | New attempts; emptied nightly |
| attempt logs (storage) | users/<id>/<yyyy-mm-dd>.gz, one immutable file per day, compact encoding | Full history after the newest checkpoint (D-027) |
| daily_stats | userId, date, attempted, correct, ms, bySection | Multi-device streaks; derived on the server from attempts only (D-028); monthly roll-up after 4 months |
| checkpoints | userId, cursor, cardStates, skills, istDailyTotals, createdAt | Replay start point; written before any prune (D-026) |
| question_stats | qid, attempts, correct, avgMs, elo | Difficulty calibration, nightly |
| sync_batches | userId, batchId, receivedAt | Ignores duplicate retries |
| question_corrections | id, qid, fromVersion, toVersion, oldAnswer, newAnswer, reason, correctedAt | Append-only |
| question_reports | userId, qid, reason, status | Student error reports |
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
  signature,                    // Ed25519, verified by the app
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
{ ok, serverTime, newCursor, corrections: [ changes since cursor ] }
```

`reports` is new (F11). There is no client `daily` field (D-028): the server derives `daily_stats` from `attempts` alone: the IST day comes from `at` when it is not in the future and not older than 30 days, otherwise from `receivedAt`.

---

## 8. Sync and corrections

1. **Answer:** one IndexedDB transaction saves the attempt, updates FSRS and Elo, updates today's summary, marks it unsynced.
2. **Sync:** on app open, every 5 minutes in use, and on background. Duplicates ignored by `batchId`.
3. **Nightly job:** updates `question_stats`, writes each student's attempts to immutable **daily** log files (D-027), updates `daily_stats` from the attempts themselves (D-028), writes a checkpoint **before** any prune (D-026), and empties `attempt_inbox`. Must be idempotent.
4. **New or second device:** download the newest checkpoint and the log files after it, merge with local attempts, de-duplicate, sort by time, replay from the checkpoint (D-026).
5. **Content updates:** check the signed manifest; re-download only changed packs; reject anything unsigned or with a bad hash.
6. **Guest mode:** all local; first sign-in uploads the local log.
7. **Reminders:** local notification at the chosen time if today's streak isn't done.
8. **Streak day boundary:** Indian Standard Time.

**Correction path:** a wrong key is republished as `v + 1` with an append-only `question_corrections` row. On next sync, each phone re-grades past attempts on that question, replays FSRS and Elo for it, and shows a note plus banner. The server re-grades affected `mock_answers` and updates the leaderboard. Original attempts are never edited. If the correction arrives before the corrected pack, the local `corrections` row overrides the answer key for grading immediately; the question display updates when the pack lands (F6).

---

## 9. Security

| Threat | Defence |
|---|---|
| Phishing | Google sign-in only; no passwords exist |
| Fake app clones | Play Store only, verified app-to-domain link, in-app "Official links" page |
| Email spoofing | SPF, DKIM, DMARC on the domain |
| Account takeover | 1-hour tokens, rotating refresh tokens, strict CSP |
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

---

## 11. UI direction (to be finalised in the UI design step)

- Clean and minimalist; looks hand-designed, not "vibe-coded".
- One accent colour, consistent spacing grid, clear type hierarchy.
- No gradients, glows, or glassmorphism.
- Icons from a clean set (Lucide) instead of emoji.
- Body text (questions, explanations) **left-aligned, not justified**: justified text creates uneven gaps on narrow screens, especially in Hindi. Centre only short elements (scores, headings, result screens).
- Fonts with strong Devanagari + Latin support: **Mukta** or **Hind**, or **Noto Sans + Noto Sans Devanagari**. Self-hosted and subset for speed.
- Light and dark mode; Hindi/English toggle; large tap targets.
- Each main element (streak, question card, mock timer, etc.) gets its own focused design prompt.

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
| 2 OOP core classes | **In progress** — 2.0 scaffold, `Attempt`, `EloRating`, tests done (2026-11-04). Next: `ReviewScheduler`, `Replayer`, `StreakTracker`, `QuestionPicker`, `AdaptiveEngine` |
| 3 Content pipeline | Pending |
| 4 UI design system (fonts, colours, components) | Pending |
| 5–6 App build | Pending |
| 7 Backend & security | Pending |
| 8 Polish & launch | Pending |

---

## 14. Open questions

- **Login:** stay Google-only at launch, or also offer phone OTP for students without a Google account? (Currently Google-only + guest mode; OTP costs per SMS.)
- **Hindi vs English user split:** no reliable public data; collect via the language choice at onboarding.
- **Web PWA in v1?** The design doc lists "Capacitor app + web PWA"; this spec lists Capacitor only and `flow.md` has no web-specific flow. A public web build is not free — it needs its own OAuth redirect, CSP and service-worker QA. Decide: ship web in v1, or drop it from the doc until after launch.
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

1. Web PWA in v1 is undecided (§14) — decide before Week 4, not before Step 2.
2. `flow.md` F12 referenced "checkpoints (D-026, if accepted)" after acceptance — corrected.
