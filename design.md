# design.md â€” Decision Log

Every meaningful decision in CGL GK Master is recorded here with **why** it was made and **what trade-off was accepted**. Code shows *what* we did; this file explains *why*.

---

## Rules for humans and AI agents

1. **Update this file in the same commit as the code change.** A decision without an entry is not finished.
2. **Log a decision when it is meaningful**, meaning any of:
   - adding, removing, or replacing a library or service
   - choosing between two or more reasonable approaches
   - accepting a known limitation, risk, or cost
   - changing a data format, database table, sync rule, or public interface
   - deviating from an earlier decision in this file
3. **Do not log** formatting, renames, small refactors, or bug fixes with an obvious single solution.
4. **Never delete or rewrite an old entry.** If a decision changes, add a new entry and mark the old one `Superseded by D-0XX`.
5. **Always fill "Why" and "Trade-off accepted".** "It's popular" or "it's better" is not a reason; give the concrete reason for *this* app (low-end phones, offline, â‚¹10,000 budget, solo developer, bilingual).
6. **Numbering:** next free number, never reused. Add a row to the index.

### Entry template

```markdown
## D-0XX: <short title>
- **Date:** YYYY-MM-DD
- **Status:** Accepted | Superseded by D-0XX
- **Area:** Architecture | Data | Sync | Security | Content | UI | Build | Business
- **Context:** What problem or question forced a decision?
- **Decision:** What we chose, in one or two sentences.
- **Alternatives considered:** Each option and why it lost.
- **Why:** The concrete reasons this option wins for this app.
- **Trade-off accepted:** What we knowingly gave up or risked.
- **Revisit when:** The signal that would make us reconsider.
```

---

## Index

| ID | Title | Area | Status |
|---|---|---|---|
| D-001 | PWA code, no Electron | Architecture | Accepted |
| D-002 | Svelte for UI | UI | Accepted |
| D-003 | IndexedDB via Dexie on device | Data | Accepted |
| D-004 | Supabase backend + Cloudflare CDN | Architecture | Accepted |
| D-005 | Elo for adaptive difficulty | Architecture | Accepted |
| D-006 | FSRS for revision scheduling | Architecture | Accepted |
| D-007 | Google sign-in only + guest mode | Security | Accepted |
| D-008 | One compressed state record per student per sub-topic | Data | Superseded by D-016 |
| D-009 | Batched sync, not real-time | Sync | Accepted |
| D-010 | Re-download whole changed pack | Sync | Accepted |
| D-011 | UUID v7 attempt IDs generated on device | Data | Accepted |
| D-012 | Leaderboard only from server-graded live mocks | Security | Accepted |
| D-013 | Accept that question packs can be copied | Security | Accepted |
| D-014 | Separate admin site with 2FA | Security | Accepted |
| D-015 | Own aggregated analytics, no third-party trackers | Business | Accepted |
| D-016 | Derive card state by replaying attempt logs | Data | Accepted, amended by D-026 |
| D-017 | Capacitor as the Android wrapper | Build | Accepted |
| D-018 | Launch with ~2,000 verified questions in 3 sections | Content | Accepted |
| D-019 | Founder is final verifier, after AI fact-check | Content | Accepted |
| D-020 | Free for the first 6 months | Business | Accepted |
| D-021 | 12-week timeline instead of 8 | Business | Accepted |
| D-022 | Wrong keys: fix, re-grade, and notify | Content | Accepted |
| D-023 | Attempt inbox + nightly compaction to monthly files | Sync | Partly superseded by D-027 |
| D-024 | Local notifications for streak reminders | Build | Accepted |
| D-025 | Ed25519-signed pack manifest | Security | Accepted |
| D-026 | Checkpoints at the retention boundary | Data | Accepted |
| D-027 | Immutable daily log files + compact attempt encoding | Sync | Accepted |
| D-028 | Server derives daily_stats; drop client aggregates from sync | Sync | Accepted |
| D-029 | Live mocks run in a scheduled window, not a simultaneous start | Content | Accepted |
| D-030 | `core/` is pure: no database writes | Architecture | Accepted |
| D-031 | Markdown is the source of truth; the .docx is a snapshot | Business | Accepted |
| D-032 | No option shuffling in v1 | Data | Accepted |
| D-033 | Elo constants: guessing floor, K schedules, rounding | Architecture | Accepted |
| D-034 | Skips are ignored by Elo and FSRS | Data | Accepted |
| D-035 | Toolchain: strict tsc + Vitest + Prettier, no ESLint yet | Build | Accepted |
| D-036 | `core/` may import `shared/` types and pure helpers | Architecture | Accepted |
| D-037 | FSRS integration: ts-fsrs v6 / FSRS-7, synchronous preset, binary grading | Architecture | Accepted |
| D-038 | Replay takes an injected `ReplayIndex`; attempts stay lean | Data | Accepted |
| D-039 | Replay re-derives correctness from the versioned answer key | Data | Accepted |
| D-040 | Checkpoint cursor is `"<at>:<id>"`, compared as a tuple | Data | Accepted |

---

## D-001: PWA code, no Electron
- **Date:** 2026-10-31
- **Status:** Accepted
- **Area:** Architecture
- **Context:** Students mostly use budget Android phones with limited storage, RAM, and patchy 4G.
- **Decision:** Build a web app (PWA) and package it for Android (see D-017). No Electron.
- **Alternatives considered:** Electron (bundles Chromium, 150 MB+, desktop-focused). Native Android (two codebases if we also want web).
- **Why:** Tiny install, instant repeat opens, works offline via service worker, one codebase for web and Android.
- **Trade-off accepted:** Some native features need plugins; performance tuning happens in a WebView.
- **Revisit when:** A core feature cannot be built with web APIs or Capacitor plugins.

## D-002: Svelte for UI
- **Date:** 2026-10-31
- **Status:** Accepted
- **Area:** UI
- **Context:** App code must stay under 300 KB compressed and render fast on low-end CPUs.
- **Decision:** Use Svelte. Domain logic stays in plain TypeScript classes, independent of the framework.
- **Alternatives considered:** Preact (small, bigger ecosystem, but ships a runtime and virtual DOM).
- **Why:** Svelte compiles to plain JavaScript with no virtual DOM, giving the smallest bundle and least code.
- **Trade-off accepted:** Smaller ecosystem and fewer tutorials than React-family libraries.
- **Revisit when:** A needed library exists only for React and has no reasonable Svelte equivalent.

## D-003: IndexedDB via Dexie on device
- **Date:** 2026-10-31
- **Status:** Accepted
- **Area:** Data
- **Context:** Questions and attempts must be stored on the phone for full offline use.
- **Decision:** IndexedDB, accessed through Dexie.
- **Alternatives considered:** SQLite compiled to WASM (real SQL, but ~1 MB extra download).
- **Why:** Built into every browser and WebView; Dexie is ~30 KB and gives clean transactions and queries.
- **Trade-off accepted:** No SQL joins; complex queries are written in code.
- **Revisit when:** Query complexity grows enough that SQL would remove significant code.

## D-004: Supabase backend + Cloudflare CDN
- **Date:** 2026-10-31
- **Status:** Accepted
- **Area:** Architecture
- **Context:** Need login, a database, access rules, and cheap file delivery with a solo developer.
- **Decision:** Supabase for auth, Postgres, Row-Level Security, and storage. Cloudflare for serving app files and question packs.
- **Alternatives considered:** Cloudflare Workers + D1 (cheap, but login and security would be custom code).
- **Why:** Less custom security code means fewer security mistakes; generous free tiers fit the budget.
- **Trade-off accepted:** Two vendors to manage; Supabase costs rise past free-tier limits.
- **Revisit when:** Monthly Supabase cost becomes a large share of revenue.

## D-005: Elo for adaptive difficulty
- **Date:** 2026-10-31
- **Status:** Accepted
- **Area:** Architecture
- **Context:** Students who do well should get harder questions, and vice versa.
- **Decision:** Elo-style ratings for students (per sub-topic) and questions, corrected for the 25% guessing floor of four options.
- **Alternatives considered:** IRT (more accurate, used by exam bodies, but needs lots of response data first).
- **Why:** Works from day one with no data, simple to implement and test, self-calibrates question difficulty.
- **Trade-off accepted:** Less precise than IRT.
- **Revisit when:** We have enough responses per question to fit an IRT model.

## D-006: FSRS for revision scheduling
- **Date:** 2026-10-31
- **Status:** Accepted
- **Area:** Architecture
- **Context:** Wrong and weak questions must come back at the right time before the exam.
- **Decision:** FSRS via `ts-fsrs`, desired retention 0.9, intervals capped at the student's exam date.
- **Alternatives considered:** SM-2 (Anki's older algorithm, simpler, less efficient).
- **Why:** Fewer reviews for the same retention; capping at the exam date suits a short cram cycle.
- **Trade-off accepted:** More complex model; behaviour depends on library correctness.
- **Revisit when:** Retention data shows the schedule is wrong for exam-prep timelines.

## D-007: Google sign-in only + guest mode
- **Date:** 2026-10-31
- **Status:** Accepted
- **Area:** Security
- **Context:** Need cross-device sync while resisting phishing, within budget.
- **Decision:** Google sign-in only at launch; guest mode keeps progress local until sign-in.
- **Alternatives considered:** Phone OTP (wider reach, but costs per SMS and is phishable).
- **Why:** Free, passwordless, phishing-resistant.
- **Trade-off accepted:** Students without a Google account can only use guest mode.
- **Revisit when:** Users report being blocked by the lack of OTP login. (Open question in the design doc.)

## D-008: One compressed state record per student per sub-topic
- **Date:** 2026-10-31
- **Status:** Superseded by D-016
- **Area:** Data
- **Context:** Server needed to store progress for multi-device sync.
- **Decision:** One compressed JSON record of card states + Elo per student per sub-topic.
- **Alternatives considered:** One row per student per question.
- **Why:** Fewer rows than per-question storage.
- **Trade-off accepted:** Merge logic for conflicting devices.
- **Revisit when:** Never â€” the premise failed. FSRS state is per question, so this record grows to several GB at scale (superseded by D-016).

## D-009: Batched sync, not real-time
- **Date:** 2026-10-31
- **Status:** Accepted
- **Area:** Sync
- **Context:** Up to ~1,000 launch users, ~10,000 concurrent only if the 1,00,000 headroom figure is reached at evening peak.
- **Decision:** Sync on app open, every 5 minutes in use, and on background.
- **Alternatives considered:** Real-time sync on every answer (persistent connections at peak cost money).
- **Why:** Nothing in a quiz app needs second-by-second sync; batches are cheap and battery-friendly.
- **Trade-off accepted:** Another device may be up to ~5 minutes behind.
- **Revisit when:** A feature genuinely needs live updates.

## D-010: Re-download whole changed pack
- **Date:** 2026-10-31
- **Status:** Accepted
- **Area:** Sync
- **Context:** Questions get added and corrected after launch.
- **Decision:** When a pack version changes, download the whole pack again.
- **Alternatives considered:** Delta patches of changed questions only.
- **Why:** Packs are only ~100â€“250 KB; simplicity wins.
- **Trade-off accepted:** Slightly more data used per update.
- **Revisit when:** Users complain about data usage.

## D-011: UUID v7 attempt IDs generated on device
- **Date:** 2026-10-31
- **Status:** Accepted
- **Area:** Data
- **Context:** Attempts are created offline.
- **Decision:** Each attempt gets a UUID v7 on the phone.
- **Alternatives considered:** Server-assigned IDs (need internet to record an attempt).
- **Why:** Unique worldwide, sortable by time, no network needed; makes merging and de-duplication trivial.
- **Trade-off accepted:** 16-byte IDs instead of small integers.
- **Revisit when:** Not expected.

## D-012: Leaderboard only from server-graded live mocks
- **Date:** 2026-10-31
- **Status:** Accepted
- **Area:** Security
- **Context:** Practice answers are on the phone, so practice scores can be faked.
- **Decision:** Rankings come only from live mocks graded by `grade_mock()` on the server.
- **Alternatives considered:** Rank all practice activity.
- **Why:** Fair and cheat-resistant; practice stays personal.
- **Trade-off accepted:** Leaderboard only updates around scheduled mocks.
- **Revisit when:** Not expected.

## D-013: Accept that question packs can be copied
- **Date:** 2026-10-31
- **Status:** Accepted
- **Area:** Security
- **Context:** Offline packs live on the device.
- **Decision:** No encryption of packs; compete on quality, Hindi support, and fast current affairs.
- **Alternatives considered:** Encrypted packs (key must be on device, so determined copiers still win).
- **Why:** Encryption adds complexity for little real protection.
- **Trade-off accepted:** Competitors could copy our questions.
- **Revisit when:** Paid content is introduced.

## D-014: Separate admin site with 2FA
- **Date:** 2026-10-31
- **Status:** Accepted
- **Area:** Security
- **Context:** Admins can change answer keys.
- **Decision:** Admin panel on its own subdomain, Google login + 2FA, every edit logged.
- **Alternatives considered:** Hidden admin pages inside the student app.
- **Why:** Keeps admin code out of what every student downloads; smaller attack surface.
- **Trade-off accepted:** A second small app to build and deploy.
- **Revisit when:** Not expected.

## D-015: Own aggregated analytics, no third-party trackers
- **Date:** 2026-10-31
- **Status:** Accepted
- **Area:** Business
- **Context:** Need usage insight without weight or privacy cost.
- **Decision:** Use our own `daily_stats` and `question_stats`; Sentry free tier for crashes only.
- **Alternatives considered:** Google Analytics / Firebase Analytics.
- **Why:** No extra scripts, lighter app, simpler privacy obligations under the DPDP Act.
- **Trade-off accepted:** Less detailed funnels and behaviour data.
- **Revisit when:** We need product analytics we cannot derive ourselves.

## D-016: Derive card state by replaying attempt logs
- **Date:** 2026-10-31
- **Status:** Accepted, amended by D-026 (2026-11-01): replay starts from the newest checkpoint, not the first attempt
- **Area:** Data
- **Context:** D-008 would reach several GB at 1,00,000 users and needed tricky merge logic.
- **Decision:** Never sync FSRS card state or Elo. Rebuild both on any device by replaying the attempt log.
- **Alternatives considered:** Keep syncing per-student state blobs (D-008).
- **Why:** The log is the single source of truth; merging two devices becomes "combine, sort by time, replay".
- **Trade-off accepted:** A new device must download and replay history before stats are complete.
- **Revisit when:** Replay on a new device takes more than a few seconds on a budget phone.

## D-017: Capacitor as the Android wrapper
- **Date:** 2026-10-31
- **Status:** Accepted
- **Area:** Build
- **Context:** Need a Play Store app that works on budget phones.
- **Decision:** Wrap the web app with Capacitor.
- **Alternatives considered:** Trusted Web Activity (depends on Chrome being installed; risk of "thin wrapper" rejection).
- **Why:** Uses Android System WebView, ships assets inside the APK for fast offline first load, supports local notifications, push, and Play Billing later.
- **Trade-off accepted:** App updates for native changes go through store review.
- **Revisit when:** Not expected.

## D-018: Launch with ~2,000 verified questions in 3 sections
- **Date:** 2026-10-31
- **Status:** Accepted
- **Area:** Content
- **Context:** One wrong answer key costs more trust than marketing can buy back; verification capacity is limited.
- **Decision:** v1 ships History, Polity, and Geography with ~2,000 verified questions; other sections follow monthly.
- **Alternatives considered:** 10,000 bilingual questions at launch.
- **Why:** Quality over volume; matches realistic verification capacity.
- **Trade-off accepted:** Narrower launch coverage.
- **Revisit when:** Verification pace allows faster expansion.

## D-019: Founder is final verifier, after AI fact-check
- **Date:** 2026-10-31
- **Status:** Accepted
- **Area:** Content
- **Context:** Someone must approve every question before publishing.
- **Decision:** AI drafts and fact-checks against a source link; the founder approves 30â€“40 questions a day.
- **Alternatives considered:** Hired reviewer (costs money), crowd review after publish (errors reach students first).
- **Why:** Zero cost and full control over quality.
- **Trade-off accepted:** Verification takes ~57 days and depends on one person.
- **Revisit when:** Revenue allows a paid reviewer, or the founder's pace drops.

## D-020: Free for the first 6 months
- **Date:** 2026-10-31
- **Status:** Accepted
- **Area:** Business
- **Context:** No usage data yet to choose a pricing model.
- **Decision:** Fully free for 6 months; decide monetisation with real data. No Play Billing in v1.
- **Alternatives considered:** Ads; one-time â‚¹99 unlock.
- **Why:** Faster growth, simpler v1 build, better data for the pricing decision.
- **Trade-off accepted:** No revenue to cover hosting beyond free tiers during that time.
- **Revisit when:** Month 6, or when hosting costs exceed the budget buffer.

## D-021: 12-week timeline instead of 8
- **Date:** 2026-10-31
- **Status:** Accepted
- **Area:** Business
- **Context:** Verification needs ~57 days and Play Store closed testing needs 14 days with 12 testers.
- **Decision:** 12-week plan; closed test starts in Week 4.
- **Alternatives considered:** Original 8-week plan.
- **Why:** A correct launch matters more than a fast one.
- **Trade-off accepted:** Launch is a month later.
- **Revisit when:** Not expected.

## D-022: Wrong keys: fix, re-grade, and notify
- **Date:** 2026-10-31
- **Status:** Accepted
- **Area:** Content
- **Context:** A published wrong answer key means past attempts were graded incorrectly.
- **Decision:** Bump the question version, add an append-only correction record, re-grade on device and server, show a note and banner.
- **Alternatives considered:** Silent fix only.
- **Why:** Students understand why stats changed, which builds trust.
- **Trade-off accepted:** Extra correction logic in sync and replay.
- **Revisit when:** Not expected.

## D-023: Attempt inbox + nightly compaction to monthly files
- **Date:** 2026-10-31
- **Status:** Partly superseded by D-027 (2026-11-01): monthly files replaced by immutable daily files; the inbox and nightly job stand
- **Area:** Sync
- **Context:** Raw attempts would fill Postgres quickly at scale (D-016 still needs the full log stored).
- **Decision:** Sync writes to `attempt_inbox`; a nightly job updates `question_stats`, writes monthly compressed log files to object storage, and empties the inbox.
- **Alternatives considered:** Write log files directly on every sync (files cannot be appended cleanly).
- **Why:** Postgres stays small; storage files are cheap.
- **Trade-off accepted:** Up to a day's delay before attempts reach the long-term log; one scheduled job to maintain.
- **Revisit when:** Inbox volume per night becomes slow to process.

## D-024: Local notifications for streak reminders
- **Date:** 2026-10-31
- **Status:** Accepted
- **Area:** Build
- **Context:** A streak with no reminder rarely survives.
- **Decision:** Capacitor local notifications at the student's chosen time if today's streak is not done.
- **Alternatives considered:** Server push via Firebase Cloud Messaging.
- **Why:** Free, works offline, no server table needed.
- **Trade-off accepted:** Cannot announce new content (e.g. new current affairs) in v1.
- **Revisit when:** We want content announcements; add FCM then.

## D-025: Ed25519-signed pack manifest
- **Date:** 2026-10-31
- **Status:** Accepted
- **Area:** Security
- **Context:** The CDN is trusted with content integrity.
- **Decision:** Sign `manifest.json` on the founder's laptop; the app holds the public key and rejects altered packs.
- **Alternatives considered:** Trust HTTPS and the CDN alone.
- **Why:** Costs nothing and closes the tampering gap.
- **Trade-off accepted:** The private key must be kept safe; losing it means shipping an app update with a new key.
- **Revisit when:** Not expected.

---

# Amendments (Step 1.6 external review, 2026-11-01)

All six entries below were **accepted on 2026-11-01**. They amend D-016 and D-023 in place of rewriting them.

## D-026: Checkpoints at the retention boundary
- **Date:** 2026-11-01
- **Status:** Accepted (2026-11-01)
- **Area:** Data
- **Context:** D-016 rebuilds FSRS and Elo by replaying the full attempt log, and `PROJECT_SPEC.md` Â§4 prunes raw attempts after 12 months. Those two rules contradict each other: once a device prunes, replaying the remaining log produces different card states than the original device, so a correction re-grade or a new device would disagree with it. Full-log replay also grows forever (~2 MB of gzipped JSON per active student per year, i.e. ~2 GB at 1,000 users against 1 GB of free storage).
- **Decision:** At each prune boundary, the nightly job writes one compact checkpoint per user â€” `{cursor, cardStates, skills, istDailyTotals}` â€” as a row in Postgres. Replay means "load the newest checkpoint, then replay attempts after its cursor". D-016 is amended from "never sync card state" to "sync checkpoints only, never per-attempt state".
- **Alternatives considered:** Keep raw attempts forever (storage grows linearly, free tier exhausted near 1,000 users); resume syncing per-sub-topic state blobs (D-008, rejected for good reasons); accept approximate state on a new device (corrections would re-grade against a different history than the original device, silently).
- **Why:** Bounded replay time on a Redmi 9A, flat storage per user instead of linear growth, and deterministic re-grading after a correction â€” which is the whole point of D-022.
- **Trade-off accepted:** One more table, plus an invariant that must never break: **write the checkpoint before pruning.** A bug here loses history rather than slowing down.
- **Revisit when:** Replaying from the latest checkpoint still takes more than ~2 s on a Redmi 9A.

## D-027: Immutable daily log files + compact attempt encoding
- **Date:** 2026-11-01
- **Status:** Accepted (2026-11-01)
- **Area:** Sync
- **Context:** Supabase object storage has S3 semantics: objects cannot be appended. D-023 chose one `.gz` per month, which means the nightly job must read, decompress, merge and rewrite the whole month for every active user â€” O(month Ã— users) every night, and a failed run can corrupt a month. Attempts are also stored as JSON, where the UUID alone costs 36 bytes per attempt.
- **Decision:** One immutable file per user per day, `users/<id>/<yyyy-mm-dd>.gz`, listed by a per-user manifest. Attempts are encoded compactly instead of as JSON: 16-byte attempt ID as base64url (22 chars), question index into the pack rather than a string ID, 1-byte bitfield for mode/flags, varint `ms`.
- **Alternatives considered:** Monthly rewrite (D-023 as written â€” correct but O(n) nightly and a wide blast radius); one file per user (unbounded); rows in Postgres (rejected in D-023 for table size).
- **Why:** Append-free and idempotent by construction, a failed nightly run loses at most one day, and the encoding is roughly 2â€“3Ã— smaller â€” which is what keeps the free tier viable at 1,000 users.
- **Trade-off accepted:** Many small objects (up to 365 per user per year) and one manifest read before a new-device replay.
- **Revisit when:** Object count or listing cost becomes noticeable, or a new-device replay needs far fewer requests.

## D-028: Server derives `daily_stats`; drop client aggregates from sync
- **Date:** 2026-11-01
- **Status:** Accepted (2026-11-01)
- **Area:** Sync
- **Context:** The sync payload sends client-computed `daily` aggregates while the nightly job also derives stats from the same attempts. Two sources for one number: they can drift, and the client one is trivially inflated by a modified APK â€” which would inflate streaks, since streaks are read from `daily_stats`.
- **Decision:** The payload carries attempts only. The server computes the IST day per attempt from `at` when `at` is not in the future and not older than 30 days; otherwise it clamps to `receivedAt`. `daily_stats` is always derived on the server.
- **Alternatives considered:** Keep client aggregates (fewer server-side queries, but spoofable and duplicated); trust-but-verify (still two sources of truth, still two bugs).
- **Why:** One truth, free anti-cheat for a vanity metric students care about, and three fewer fields in a contract that Step 2 has to implement.
- **Trade-off accepted:** Server-side timezone logic, and a batch that arrives very late may attribute a day differently than the phone showed. The 30-day window bounds how wrong that can get.
- **Revisit when:** Offline batches mis-attribute days often enough that students notice their streak.

## D-029: Live mocks run in a scheduled window, not a simultaneous start
- **Date:** 2026-11-01
- **Status:** Accepted (2026-11-01)
- **Area:** Content
- **Context:** D-012 makes the leaderboard trustworthy by grading only server-side mocks, but a leaderboard only means something if students sit the same mock â€” and D-024 ships local notifications only, so a mock cannot be announced and nobody has to show up at 20:00. F8 also held mock questions in memory only, so a phone call or a 4G drop ends the session on the exact devices this app targets.
- **Decision:** Each mock has a 72-hour window (Friday 00:00 to Sunday 23:59 IST). The server registers `startedAt` whenever the student opens it inside the window. Questions and the session persist locally with a TTL and are cleared after a successful submit; the student can resume until the window closes. Ranking: score, then time taken, then submitted-at.
- **Alternatives considered:** Simultaneous start plus Firebase Cloud Messaging in v1 (another service, another dependency, no benefit at 1,000 users, and it contradicts D-024); drop the leaderboard from v1 (loses the only cheat-resistant ranking, and it is already in the feature list).
- **Why:** Survives patchy 4G, needs no push infrastructure, and keeps every anti-cheat property D-012 relies on (server start time, one session per student, speed checks).
- **Trade-off accepted:** The leaderboard is not a live event, and a determined student has 72 hours to look things up. Mitigated by drawing 25 questions from a larger pool per student.
- **Revisit when:** FCM is added and a true live event is worth the traffic spike.

## D-030: `core/` is pure â€” no database writes
- **Date:** 2026-11-01
- **Status:** Accepted (2026-11-01)
- **Area:** Architecture
- **Context:** `flow.md` states that `core/` never does I/O, then shows `core/StreakTracker.ts â€º record()` marked `[DB write]` in F2 and `core/Replayer.ts â€º rebuildAll()` writing cards and skills in F7. Step 2 creates exactly these classes, so the rule would be broken on the first day it matters.
- **Decision:** Core classes are pure over data: `StreakTracker.apply(attempt, todaySummary) â†’ DailySummary` and `Replayer.rebuild(attempts, checkpoint) â†’ { cards, skills }`. Every write goes through a repository. `core/` imports only `core/`.
- **Alternatives considered:** Let core take repository instances (quicker to write, but untestable without IndexedDB and contradicts the stated dependency rule); keep the rule loose and rely on review (it already failed once, in the docs).
- **Why:** Elo, FSRS and replay are the parts that must be tested against golden files; purity makes that possible with no mocking, which matters for a solo developer.
- **Trade-off accepted:** A little more plumbing in `services/`.
- **Revisit when:** Not expected.

## D-031: Markdown is the source of truth; the .docx is a snapshot
- **Date:** 2026-11-01
- **Status:** Accepted (2026-11-01)
- **Area:** Business
- **Context:** `PROJECT_SPEC.md` calls itself the single source of truth, but the Step 1 `.docx` duplicates ~90 % of it. They had already drifted by 2026-11-01 (the platform line, a stale concurrency figure, a reference to a Word comment that does not exist). Two human-readable copies always drift, and an AI agent asked to "follow the spec" has no way to know which one wins.
- **Decision:** The three `.md` files are authoritative and edited directly. The `.docx` is regenerated from them at the end of each step as a read-only summary and is never hand-edited.
- **Alternatives considered:** `.docx` authoritative (binary, no diffs, no merge, no grep); stop producing the `.docx` (loses the shareable, printable artifact).
- **Why:** Diffs, grep and agents all work on the `.md`; the `.docx` stays what it is good at â€” something to send to a person.
- **Trade-off accepted:** One regeneration step per milestone, and the `.docx` lags between steps.
- **Revisit when:** Not expected.

## D-032: No option shuffling in v1
- **Date:** 2026-11-04
- **Status:** Accepted
- **Area:** Data
- **Context:** `AttemptRecord.chosen` is an index into `Question.en.options`, and a correction re-grades by comparing `chosen` to a new answer index. If the app reshuffles options per display, `chosen` no longer points at the canonical option and every re-grade, every pack correction and every cross-device merge can silently grade against the wrong text. The alternative is storing the permutation on every attempt.
- **Decision:** v1 displays options in canonical pack order and records `chosen` as a canonical index. `Attempt.create` compares `chosen` directly to `Question.answer`.
- **Alternatives considered:** Shuffle per display and store the four-item permutation with each attempt (correct, but extra bytes on every attempt and one more field to validate); derive a stable permutation from the question id (no storage, but the UI and tests then depend on a hash function for an unproven benefit).
- **Why:** One field fewer, one failure mode fewer, and corrections stay a pure index comparison. Position memorisation is a real but small risk for a 2,000-question bank where questions repeat rarely.
- **Trade-off accepted:** A student can learn that the answer "was option 2 last time" for a repeated question; v1 does not defend against that.
- **Revisit when:** Analytics show a position bias (correct rate differs materially by option index), or students report memorising positions.

## D-033: Elo constants: guessing floor, K schedules, rounding
- **Date:** 2026-11-04
- **Status:** Accepted
- **Area:** Architecture
- **Context:** D-005 chose Elo but fixed no constants. Step 2 has to pin exact numbers in code and in golden tests; without them the adaptive engine is not reproducible, and a later "small tweak" silently rewrites every student's derived state on replay.
- **Decision:** Default rating 1200. Expected score includes the four-option guessing floor of 0.25. Student K decays from 40 to a floor of 8 with a half-life of 50 attempts; question K decays from 24 to 6 with a half-life of 30 answered attempts. Ratings are clamped to [600, 2200] and rounded to two decimals at the write boundary.
- **Alternatives considered:** Fixed K = 32 (simplest, but never settles, so a veteran's rating jitters on every answer); Glicko-2 (models rating uncertainty properly, but carries two more numbers per skill, needs a rating-period loop, and is harder to hand-check); no guessing floor (equal ratings would start at 0.5, over-rewarding correct answers on a four-option test).
- **Why:** Large early movement gets a new student to their level in tens of answers; a small late K keeps a settled rating stable. Questions settle faster than students because fewer answers are needed to estimate one item than one person. Two-decimal rounding keeps golden files stable across JavaScript engines, which are not required to agree on the last bit of `Math.pow`.
- **Trade-off accepted:** These constants are reasoned, not yet fitted to real attempt data; Elo also ignores response time and per-question discrimination. Changing a constant later means replaying history with the new constant, which is allowed because attempts are the source of truth (D-016).
- **Revisit when:** Real data shows ratings converging too slowly (students stuck far from their true level) or too fast (ratings swing on one answer), or item ratings drift without settling.

## D-034: Skips are ignored by Elo and FSRS
- **Date:** 2026-11-04
- **Status:** Accepted
- **Area:** Data
- **Context:** `chosen: null` is a legal attempt. If a skip counted as a wrong answer it would lower the student's ability rating and schedule the card as a lapse, even though the student never claimed to know or not know the answer. That corrupts the ability estimate and gives students a way to manipulate the review schedule by tapping skip.
- **Decision:** A skip is written to the attempt log for analytics but is a no-op for derived state: `updateSkill` returns the same skill object without incrementing `attemptCount`, `Attempt.regrade` leaves a skip skipped, and `ReviewScheduler` must treat a skip as "no review" rather than a failure. Skips never extend or reset a streak on their own.
- **Alternatives considered:** Count a skip as wrong (simple and discourages skipping, but corrupts the ability estimate and punishes a legitimate "not sure" behaviour); count it as correct (obviously wrong); count it as half an answer (invents a signal the student never gave).
- **Why:** A skip carries no information about knowledge. Ignoring it keeps Elo and FSRS honest, keeps analytics meaningful (attempted can exclude skips or report them separately), and removes the incentive to game the scheduler.
- **Trade-off accepted:** A student can skip indefinitely without an Elo or FSRS penalty. The daily goal and streak still require real answers, so the exposure is limited to time-on-task, not to the difficulty model.
- **Revisit when:** Skip rates are high enough that daily goals or streaks become meaningless, in which case add a non-Elo guard (for example a per-session skip limit or a UI nudge), not a change to the model.

## D-035: Toolchain: strict tsc + Vitest + Prettier, no ESLint yet
- **Date:** 2026-11-04
- **Status:** Accepted
- **Area:** Build
- **Context:** Step 2.0 needs a scaffold that catches real errors without adding a maintenance surface. The app ships inside a 300 KB compressed budget and the project is run by one developer; every dev dependency is free at runtime but costs install time, upgrade churn and supply-chain review.
- **Decision:** TypeScript in strict mode with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride` and `verbatimModuleSyntax`. `tsc --noEmit` is the type gate, Vitest (node environment) runs the pure-core tests, and Prettier owns formatting. ESLint is deliberately deferred. No runtime schema library (Zod and similar) is added to the app; untrusted input is validated by small hand-written validators.
- **Alternatives considered:** ESLint + typescript-eslint now (catches floating promises and hook misuse, but adds a large dependency tree and config churn before there is UI code to lint); Zod for pack and sync validation (pleasant API, but roughly 13 KB of the 300 KB budget and a runtime dependency for data that a signed pack already constrains); no typechecker (rejected because the core classes are exactly the code that benefits).
- **Why:** The typechecker plus golden tests cover the Elo, FSRS and attempt logic, which is where correctness matters most; Prettier removes style debate with one config file. Keeping the dependency tree at about 40 packages matches the "few dependencies" security rule.
- **Trade-off accepted:** Some bug classes ESLint would catch are not caught yet, and `tsc` reports unused locals and parameters but not unused exports. The trade is deliberate until UI and services code exists.
- **Revisit when:** Svelte components and async services land (promise and reactivity mistakes become likely), or a real bug reaches a commit that a standard ESLint rule would have blocked.

## D-036: `core/` may import `shared/` types and pure helpers
- **Date:** 2026-11-04
- **Status:** Accepted
- **Area:** Architecture
- **Context:** D-030 says `core/` imports only `core/`, but Step 2 needs the canonical record shapes. If `core/` cannot import `shared/contract.ts`, it must either duplicate every interface (the drift problem `shared/` exists to prevent) or reach into `data/` for types (which breaks the purity rule and the import matrix). The rule as written cannot survive its first real use.
- **Decision:** `core/` may import **types, constants and pure functions** from `shared/contract.ts`; it may not import `data/`, `services/`, `sync/` or `ui/`. `shared/` itself imports nothing, performs no I/O and holds no mutable state; it is a contract layer, not an app layer, and `istDayKey()` is the only function in it.
- **Alternatives considered:** Duplicate the interfaces inside `core/` and keep D-030 literal (guarantees two definitions of `AttemptRecord` and a slow drift); let `core/` import `data/` for types (reverses the dependency direction and makes core untestable without Dexie); move the types into `core/` and have `shared/` re-export them (works, but then the server and admin bundles depend on the app's core module).
- **Why:** One definition of every boundary shape, in one file, usable by the app, the admin bundle and the server functions. It keeps `core/` testable in a plain Node process with no mocks, which is the property D-030 was protecting.
- **Trade-off accepted:** `shared/contract.ts` becomes load-bearing for three targets and must stay plain data. Any helper added there must remain pure and tiny, and a change to a shared type now ripples to every consumer at once (which is the intent, but it raises the cost of a careless edit).
- **Revisit when:** `shared/` grows beyond types, constants and one-line pure helpers, or a bundler boundary makes the shared module awkward to include in the server or admin build.

## D-037: FSRS integration: ts-fsrs v6 / FSRS-7, synchronous preset, binary grading
- **Date:** 2026-11-04
- **Status:** Accepted
- **Area:** Architecture
- **Context:** D-006 chose FSRS and the tech stack names `ts-fsrs`, but Step 2 has to fix how it is called. `ts-fsrs` v6 recommends `DefaultScheduler()`, which is **async** because it dynamically imports the model file, and it probes versions with `Object.hasOwn` (Chrome 93+). F2 runs inside a Dexie transaction on the hot path, where awaiting a non-Dexie promise can commit the transaction early; the target device class can also carry an older WebView. Separately, the FSRS-7 card carries `stabilityFast`, `scheduledDays` and `learningStep`, none of which the first draft of `CardState` had.
- **Decision:** Pin `ts-fsrs` 6.0.0 and use **FSRS-7** through a synchronous preset composed with `defineScheduler`, `FSRS7Model` and the same seven middlewares as `DefaultScheduler()`; configure `desiredRetention: 0.9`, default learning/relearning steps, `enableFuzz: false`, `allowModelOverride: true`, and the default maximum interval. Correct maps to `Good`, wrong to `Again`, skip to a no-op. `CardState` gains `stabilityFast`, `scheduledDays` and `learningStep`. The next due date is clamped to `examDeadline` (and never earlier than `now`); stability and difficulty are left untouched by the cap. Golden pins live in `tests/fixtures/fsrs-golden.json`.
- **Alternatives considered:** `await DefaultScheduler()` once at startup and inject it (supported API, but makes `ReviewScheduler` async or stateful and still carries the `Object.hasOwn` call); the legacy `fsrs()` factory (synchronous, but deprecated in v6, defaults to FSRS-6, has no `stabilityFast`, and is scheduled for removal); hand-rolling FSRS (more code, more risk, no benefit over a 20 KB pinned library); recreating the scheduler per review with `maximumInterval` set from the exam date (correct, but rebuilds config on every tap and still needs the async loader).
- **Why:** The call stays synchronous and deterministic, so it is safe inside the transaction and testable with fixed timestamps. The composed preset produces output identical to `await DefaultScheduler({ enableFuzz: false })` (verified before writing the wrapper), so we keep the supported algorithm without its async loader. Pinning the exact output means a model or weight change fails a test instead of silently rewriting every existing card.
- **Trade-off accepted:** We replicate the preset configuration, so a `ts-fsrs` upgrade that changes defaults will not reach us automatically; the locked version plus golden pins make the change deliberate. Binary grading discards the `Hard`/`Easy` distinction and any response-time signal, and a wrong answer always schedules the full relearning step. The library also adds a runtime dependency to a 300 KB budget; the actual compressed cost is measured when the Vite build exists (Week 5-6).
- **Revisit when:** Upgrading `ts-fsrs` or changing the model version; when response time or a confidence control should influence the grade; or if the production bundle or the test phone's WebView cannot carry the library.

## D-038: Replay takes an injected `ReplayIndex`; attempts stay lean
- **Date:** 2026-11-07
- **Status:** Accepted
- **Area:** Data
- **Context:** `Replayer` has to rebuild Elo, which needs each question's sub-topic and difficulty rating. `AttemptRecord` deliberately carries neither — it holds only `qid` and `qv`, so the log stays small (D-027) and a correction to question metadata does not have to rewrite history. `core/` may not read the question store (D-030, D-036), so the facts have to arrive as plain data.
- **Decision:** `Replayer.rebuild(attempts, checkpoint, index, options?)`, where `ReplayIndex` is a `ReadonlyMap<QuestionId, ReplayQuestion>` and `ReplayQuestion = { subtopicId, rating, answersByVersion }`. The caller assembles it from the `questions` store plus `question_corrections`; `rating` is `Question.eloSeed` and stays fixed for the whole replay. A question missing from the index still rebuilds its FSRS card but contributes no Elo.
- **Alternatives considered:** Denormalise `subtopicId` and the rating into every `AttemptRecord` (self-contained logs, but a contract change, a larger log per answer, and later metadata corrections never reach old attempts); pass repository objects or a read callback into `core/` (reverses the dependency direction and makes replay untestable without a database); rebuild only on the server (a new device or an offline phone could not recover its state).
- **Why:** The boundary contract does not change, the same index feeds `regrade` and the correction path, and tests pass a literal `Map`. It keeps the rule that the log is the source of truth and question metadata is an input to interpretation, not part of the record.
- **Trade-off accepted:** Every caller must build the map. Fixing the rating at `eloSeed` means replay ignores later server calibration; two devices on the same pack agree, but a republished `eloSeed` changes what a rebuild produces.
- **Revisit when:** Packs start shipping per-question calibrated difficulty that must be snapshotted per attempt, or assembling the index costs more than the replay itself.

## D-039: Replay re-derives correctness from the versioned answer key
- **Date:** 2026-11-07
- **Status:** Accepted
- **Area:** Data
- **Context:** D-022 requires past attempts to be re-graded when a published key is corrected, but the attempt log is append-only and original attempts are never edited. The stored `correct` flag records what the student was told at the time, which is exactly the value that must change in derived state after a correction.
- **Decision:** Replay derives the outcome itself: `chosen === null` is always a skip; otherwise it looks up `answersByVersion.get(qv)` and uses `chosen === key`, falling back to the stored `correct` when that version has no key. `Replayer.regrade(attempts, newAnswer)` returns a corrected view plus the number of changed verdicts for the banner; `rebuild` with the corrected index is what moves cards and skills.
- **Alternatives considered:** Trust the stored `correct` flag and apply corrections through a separate overlay threaded into every replay (simple replay, but every caller must remember the overlay and a new device that forgets it disagrees with the corrected phone); trust only the key and drop the flag (retired questions become ungradable and old logs lose their record of what the student saw); rewrite the attempts (breaks append-only, D-016 and D-022).
- **Why:** A correction takes effect on the next rebuild with no special case, and two devices with the same pack and correction rows reach the same state. The stored flag stays the historical record for analytics and the "you answered" view.
- **Trade-off accepted:** A stale or wrong index silently re-grades history. The fallback means a retired question keeps its original verdict, so its Elo contribution can disagree with current data. Attempts already folded into a checkpoint are not re-graded until the server republishes that checkpoint.
- **Revisit when:** Corrections must reach attempts older than the newest checkpoint, or packs stop shipping versioned answer keys.

## D-040: Checkpoint cursor is `"<at>:<id>"`, compared as a tuple
- **Date:** 2026-11-07
- **Status:** Accepted
- **Area:** Data
- **Context:** `Checkpoint.cursor` was typed as a `string` with no defined meaning. Replay must resume exactly once: a loose boundary double-applies an attempt (inflating reps and Elo) or drops one (losing history), and both are silent. Two attempts can share a millisecond, so a timestamp alone is ambiguous, and the cursor attempt itself may have been pruned.
- **Decision:** A cursor is `"<at>:<id>"`. `encodeCursor` and `compareCursor` live in `shared/contract.ts`; `Checkpoint.cursor` and `SyncBatch.cursor` use the `Cursor` alias. Replay de-duplicates by attempt id, sorts by `(at, id)`, and includes only attempts strictly after the checkpoint cursor.
- **Alternatives considered:** Cursor is the last attempt id, with a fallback to `at > checkpoint.createdAt` when it has been pruned (no new helpers, but the fallback can drop or double-apply attempts at the boundary); a bare timestamp (simplest, loses attempts in the same millisecond); a server-assigned sequence number (exact, but the phone cannot compute or compare it offline).
- **Why:** The position is exact at ties, survives a pruned cursor attempt, and both the phone and the server can compute it from the log alone. Tests pin the boundary cases: equal timestamps ordered by id, the cursor attempt excluded, and a checkpoint with no following attempts.
- **Trade-off accepted:** An invented string format that every writer must use correctly. A late-synced attempt whose `at` is at or before the cursor is excluded, because there is no sequence number to place it; that is the same clock-skew boundary the daily log files already accept.
- **Revisit when:** Sync gains a server-assigned monotonic sequence or per-user offsets, or clock skew between devices shows up in real logs.
