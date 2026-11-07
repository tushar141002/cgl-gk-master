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
| D-041 | A streak day needs one graded answer; `dailyGoal` is separate | Product | Accepted |
| D-042 | Derive the streak from daily summaries, no extra store | Data | Accepted |
| D-043 | Skips do not count in daily counters | Data | Accepted |
| D-044 | Fixed ±100 Elo band, widening ×2 to the full scale | Product | Accepted |
| D-045 | Reviews by earliest due; new questions random; recent filters new only | Product | Accepted |
| D-046 | Recent window is 30; all-recent falls back instead of dead-ending | Product | Accepted |
| D-047 | CSV master is the authoring source; one row per question | Content | Accepted |
| D-048 | Assigned-once slug IDs, never reused | Content | Accepted |
| D-049 | Difficulty maps to Elo seeds 1100/1200/1300 | Content | Accepted |
| D-050 | Ed25519 signs canonical JSON of version, generatedAt, packs | Security | Accepted |
| D-051 | CSS tokens plus scoped CSS; no utility framework | UI | Accepted |
| D-052 | Mukta, self-hosted and subset, for both scripts | UI | Accepted |
| D-053 | Deep indigo accent; feedback colours stay semantic | UI | Accepted |
| D-054 | Comfortable density: 16px body, 48px targets | UI | Accepted |
| D-055 | Vite + Svelte 5 SPA, no SvelteKit | Build | Accepted |
| D-056 | Own typed hash router, Android back in `main.ts` | UI | Accepted |
| D-057 | Typed message dictionary, no i18n library | UI | Accepted |
| D-058 | No public PWA in v1; Capacitor only | Build | Accepted |
| D-059 | Bundle the signed first pack in the APK and verify it before import | Security | Accepted |
| D-060 | One service and one transaction own the answer cycle | Data | Accepted |
| D-061 | Instant feedback, locked options, explicit Next | UI | Accepted |
| D-062 | `#/practice` chooses a sub-topic; the session has its own URL | UI | Accepted |
| D-063 | One row per accepted attempt; `(user_id, attempt_id)` is the dedupe key | Data | Accepted |
| D-064 | One SECURITY DEFINER RPC owns the sync transaction | Sync | Accepted |
| D-065 | Aggregates are derived at sync time, by recomputation where possible | Sync | Accepted |
| D-066 | Compaction prunes attempts only behind a checkpoint | Data | Accepted |
| D-067 | A retried batch replays its stored response; corrections use a watermark with overlap | Sync | Accepted |
| D-068 | The migrations run in PGlite; the Edge Function stays a thin adapter | Build | Accepted |
| D-069 | `SyncManager` reaches the server through an injected transport | Sync | Accepted |
| D-070 | The in-flight batch is pinned before the request; a retry replays it | Sync | Accepted |
| D-071 | Report taps live in their own table, keyed by question, version and reason | Data | Accepted |
| D-072 | Corrections are stored first, folded in once and used for grading immediately | Sync | Accepted |
| D-073 | Hand-rolled minimal GoTrue PKCE client behind `AuthService` | Auth | Accepted |
| D-074 | History pull pages `sync_pull`; checkpoints wait for 7A-2 | Sync | Accepted |
| D-075 | One Google account per device; switching needs a data wipe | Auth | Accepted |
| D-076 | A dedicated `SyncScheduler` owns timing; `App.svelte` only starts it | Sync | Accepted |
| D-077 | Batch 1 is 60 author-verified practice questions in the bundled pack | Content | Accepted |
| D-078 | Batch 2 is 300 bilingual draft questions across 12 new sub-topics | Content | Accepted |
| D-079 | Review sheets plus a promote CLI gate every status change | Content | Accepted |

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

## D-041: A streak day needs one graded answer; `dailyGoal` is separate
- **Date:** 2026-11-07
- **Status:** Accepted
- **Area:** Product
- **Context:** `PROJECT_SPEC.md` promises streaks, a configurable `dailyGoal` (default 10) and a reminder "if today's streak isn't done", but never defines what completes a day. `DailySummary` has no goal field, and F10 passes settings while F1 evaluates a summary. Skips are already excluded from derived state (D-034), so they cannot complete a day either.
- **Decision:** A day completes the streak when it has **at least one graded answer** in IST. The streak is independent of `dailyGoal`; the goal is a progress target shown as `attempted / goal`, and the reminder fires while `goalMet(todaySummary, dailyGoal)` is false. Default goal stays 10.
- **Alternatives considered:** Require `dailyGoal` graded answers for the streak (stronger habit target, but raising the goal retroactively breaks past days unless the goal used each day is snapshotted in `DailySummary`, and lowering it makes old days count); count any attempt including skips (contradicts D-034 and lets a student hold a streak without answering); fix the threshold at 10 and drop the setting (less flexible, one more constant to explain).
- **Why:** One real answer is a forgiving daily habit, needs no contract change, and keeps the goal a preference that can change without rewriting history. The reminder still pushes toward the goal, so the app is not encouraging a token answer.
- **Trade-off accepted:** A single question keeps the streak, which can feel cheap; the reminder may keep firing after the streak is safe but before the goal is met, which is intentional but must be worded clearly in the UI.
- **Revisit when:** Retention data shows one-answer days dominate, or the product wants the streak to mean the full daily goal; then snapshot the goal per day in `DailySummary` before changing the rule.

## D-042: Derive the streak from daily summaries, no extra store
- **Date:** 2026-11-07
- **Status:** Accepted
- **Area:** Data
- **Context:** The data model has no streak field. D-030 already fixes `StreakTracker.apply(attempt, todaySummary) → DailySummary`, so `apply` only maintains daily counters. A separate `streak` row would be derived state that has to be synced, repaired after a correction and kept consistent with the attempt log — exactly the class of bug D-016 and D-026 exist to avoid.
- **Decision:** `StreakTracker.evaluate(summaries, todayKey)` derives `{ current, doneToday }` by scanning the `dailySummary` rows backwards from today (or yesterday when today is not done yet). No new store, no migration, no sync payload. `current` is the run of consecutive days with `attempted > 0`.
- **Alternatives considered:** Persist `StreakState { current, lastActiveDay }` in a new store (O(1) reads, but another derived value that can drift and must be merged across devices); compute from the full attempt log (heavier and duplicates the server's `daily_stats` derivation, D-028); compute only on the server and sync it (breaks the offline-first rule and the home screen's first paint).
- **Why:** The daily rows are already the local source for streaks and charts, the scan is at most a few hundred entries, and the server can derive the same number from `daily_stats` with the same rule. A missed write cannot desync a derived value because there is nothing extra to keep in sync.
- **Trade-off accepted:** The streak is bounded by local retention (about 12 months), and there is no "best streak" until one is derived separately. `evaluate` is O(days), which is irrelevant at this scale.
- **Revisit when:** Local daily rows are pruned below realistic streak lengths, or a best-streak or calendar heatmap needs history beyond the retained window.

## D-043: Skips do not count in daily counters
- **Date:** 2026-11-07
- **Status:** Accepted
- **Area:** Data
- **Context:** `DailySummary` holds `attempted`, `correct` and `ms`, and accuracy is `correct / attempted`. A skip is logged for analytics but is a no-op for Elo and FSRS (D-034), and D-041 excludes it from the streak. If a skip also increments `attempted`, the accuracy of a student who skips hard questions falls even though they never answered them.
- **Decision:** `StreakTracker.apply` ignores a skip entirely: `attempted`, `correct` and `ms` are unchanged. A skip on a day with no row still creates a zero row, so the day exists without counting. Skips remain in the attempt log for time-on-task analysis later.
- **Alternatives considered:** Count the skip in `attempted` and `ms` but exclude it from the streak and accuracy (needs a separate `graded`/`skipped` split in `DailySummary`, a contract change and a migration); count everything (accuracy and average time become misleading); drop skips from the log (loses the signal that a question is confusing).
- **Why:** Accuracy and average time stay honest, the streak rule has one definition, and no new field is needed. The attempt log still records the skip with its duration if the product later wants it.
- **Trade-off accepted:** Time spent reading a question before skipping is not counted as practice time. A skip-only day writes a zero row and breaks the streak, which is the intended behaviour.
- **Revisit when:** Time-on-task becomes a product metric, in which case add a `skipped` counter and a `skippedMs` field instead of overloading `attempted`.

## D-044: Fixed ±100 Elo band, widening ×2 to the full scale
- **Date:** 2026-11-07
- **Status:** Accepted
- **Area:** Product
- **Context:** `PROJECT_SPEC.md` promises adaptive difficulty ("stronger students get harder questions") but never defines the band, and F3 needs a concrete query range. `EloRating` already keeps each sub-topic rating inside 600–2200 and exposes `attemptCount`, so the band can be computed from data that exists. A sub-topic with only a few questions will regularly have nothing inside a narrow band, so the picker needs a widening rule that terminates.
- **Decision:** `AdaptiveEngine.targetRange(skill, step = 0)` returns a half-width from `BAND_STEPS = [100, 200, 400]`, then the entire `600–2200` scale at `step = MAX_RANGE_STEP (3)`. The callers loop from step 0 and stop at the first range with a candidate. The rating is clamped to the scale before the band is applied, and both edges are rounded to two decimals, so a corrupt checkpoint cannot produce an inverted range.
- **Alternatives considered:** A confidence band that starts ±250 and shrinks toward ±100 as `attemptCount` grows (more honestly adaptive, but adds constants and makes the first week depend on a curve nobody can explain or hand-check); bands based on expected score such as 45–75% (mathematically tidy, but the width changes with the rating and is harder to cache or index than a simple min/max); a single fixed band with no widening (simple, but sparse sub-topics dead-end).
- **Why:** One constant per step, a finite loop, and a range the question store can index directly. At 1200, ±100 means roughly 52–73% expected score against the edges once the 25% guessing floor is included: a real step, not a punishment. The widening ladder already handles sparse sub-topics without a second mechanism.
- **Trade-off accepted:** A brand-new student is banded around the default 1200 that the app has no evidence for yet, and the band is the same width whether the rating is fresh or settled. Ratings outside 600–2200 are treated as the nearest edge rather than rejected.
- **Revisit when:** Real logs show students stuck at the edges of a band, or a confidence-aware band becomes worth the extra constants.

## D-045: Reviews by earliest due; new questions random; recent filters new only
- **Date:** 2026-11-07
- **Status:** Accepted
- **Area:** Product
- **Context:** F3 reads both due cards and new-question candidates, and has to choose one. FSRS already sets `due`; applying any other priority would starve overdue cards. New questions have no ordering that is better than another, but a deterministic "closest rating" rule keeps serving the same question until it is marked recent, which feels mechanical. `recentIds` exists to avoid repeats, but a relearning card from ten minutes ago is deliberately due again.
- **Decision:** `QuestionPicker.pick(dueCards, candidates, recentIds, rng = Math.random)` serves the due card with the smallest `due`, breaking ties by question id. Only when nothing is due does it pick a new question uniformly at random from the eligible candidates, after sorting them by id so the same roll always selects the same question. `recentIds` filters new questions only. It returns `{ qid, reason: 'review' | 'new' }`, or `null` when both inputs are empty.
- **Alternatives considered:** Earliest due first, then closest rating for new questions (no RNG and fully reproducible, but the same question keeps winning and the order feels mechanical); random for both reviews and new questions (simple, but an overdue card can be skipped indefinitely); priority by lowest `reps` (spreads coverage, but ignores FSRS's scheduling and slowly starves high-rep cards).
- **Why:** FSRS owns review order, so the picker must not second-guess it. Random new questions give variety, and the injectable `rng` keeps every test deterministic. Keeping `recentIds` off reviews is what lets the 10-minute relearning step work at all.
- **Trade-off accepted:** The choice of a new question is not reproducible from the log; only its outcome is. Tests must pass a fixed `rng`. Duplicate candidate rows are counted once so a join bug cannot weight a question twice.
- **Revisit when:** Students report repeats before 30 answers, or the product wants a deterministic "next new question" order for a study plan.

## D-046: Recent window is 30; all-recent falls back instead of dead-ending
- **Date:** 2026-11-07
- **Status:** Accepted
- **Area:** Product
- **Context:** Avoiding recently seen questions needs a window size, and a small sub-topic can have fewer unseen questions than the window. A hard exclusion would show "finished" while unseen-but-recent questions remain, which is worse than a repeat: the student cannot practise at all. `recentIds` is supplied by the caller because `core/` may not read the attempt log (D-030).
- **Decision:** The caller supplies the last **30** answered question ids. New-question selection filters them out; if that leaves nothing, it ignores the exclusion and serves from the full candidate list. `pick` returns `null` — the "finished" state — only when there are no due cards and no candidates at all.
- **Alternatives considered:** Hard exclusion with a "You've finished this sub-topic" screen even when recent questions remain (cleaner rule, worse empty state, and a student with a 12-question sub-topic can never clear it); no recent filter (always serves something, but the same few questions dominate); a longer window such as 50 (fewer repeats, but more sub-topics hit the fallback).
- **Why:** Practising a recent question is better than a dead end, and the fallback keeps the "finished" signal honest: it now means the bank is genuinely empty. Thirty answers is roughly three daily goals, long enough that a repeat feels rare in a normal sub-topic.
- **Trade-off accepted:** A student with a tiny sub-topic may see the same question again sooner than 30 answers. The window is a caller convention rather than a constant enforced by the picker, so the value must stay in sync with `PracticeSession`.
- **Revisit when:** Pack sizes per sub-topic make 30 too long or too short, or the UI needs to distinguish "all seen recently" from "nothing left".

## D-047: CSV master is the authoring source; one row per question
- **Date:** 2026-11-07
- **Status:** Accepted
- **Area:** Content
- **Context:** Around 2,000 questions must be authored and verified by one founder over nine weeks (PROJECT_SPEC.md section 10). The spec defines the verification workflow and the pack format but not where questions live before they are packed. Whatever format is chosen becomes the place the founder spends 30-40 minutes every day, and it must survive a backend that does not exist yet.
- **Decision:** `content/master/questions.csv` is the authoring source: one row per question, with flat columns for the English and Hindi text, source metadata, answer, difficulty, status and verification time. `npm run content:build` validates the file and converts only `verified` rows into pack JSON plus a signed manifest. `content/sample/questions.csv` is the four-row fixture used by the pipeline tests.
- **Alternatives considered:** Hand-written JSON packs (schema-exact, but unreadable at 2,000 rows and painful to filter or bulk-edit); an admin database first (the eventual single source of truth, but the backend is Step 7 and would block all authoring); one CSV per section (fewer merge conflicts, but three files, three commands and more tooling for a solo author).
- **Why:** A spreadsheet is the fastest editing surface the founder already knows, filters by `status` and `subtopic`, and diffs readably in git. The build re-validates every row against the same `Question` rules the app uses, so the CSV remains a draft format rather than a second contract. No dependency is added.
- **Trade-off accepted:** Long rows and a wide, exact header; moving a column breaks parsing. Google Sheets exports need quoting discipline, and two people editing the same file will conflict. Rich formatting, images and formulas are lost.
- **Revisit when:** A second author edits in parallel, or the admin verification UI becomes the source of truth; then the CSV becomes an import/export format instead.

## D-048: Assigned-once slug IDs, never reused
- **Date:** 2026-11-07
- **Status:** Accepted
- **Area:** Content
- **Context:** Attempts store `qid` forever and corrections key answer versions by `id` + `v` (D-022). The id therefore has to be stable across every rebuild of a pack, and support has to be able to read it from a screenshot, a sync log or a report row. The id also has to survive two authors creating rows in parallel without a central counter.
- **Decision:** Every question gets a human-readable slug of the form `section-topic-NNNN`, for example `polity-fr-0007`. It is assigned once, is unique across the whole bank, is never reused after retirement, and may not be renamed. Duplicate ids are a build error, not a warning. `Question` enforces the lowercase slug shape; `validateMaster` enforces uniqueness.
- **Alternatives considered:** UUID v4 (collision-free, but unreadable in logs and impossible to quote over the phone); auto-increment integers (compact, but require a coordinator and collide when two CSV branches allocate the same next number); section-relative integers without a topic segment (shorter, but impossible to tell what a row is about from the id alone).
- **Why:** A slug is readable in a report, stable across pack versions and cheap to check. Uniqueness is checked by the build rather than trusted, because a copy-pasted row is the most likely authoring mistake.
- **Trade-off accepted:** Numbering is manual, so gaps and accidental duplicates can appear; the build catches duplicates but cannot catch a skipped or reused-but-different id. Renaming is forbidden even to fix a typo.
- **Revisit when:** The admin UI mints ids automatically, or the bank grows past the point where manual numbering is comfortable.

## D-049: Difficulty maps to Elo seeds 1100/1200/1300
- **Date:** 2026-11-07
- **Status:** Accepted
- **Area:** Content
- **Context:** Every question needs an `eloSeed` so adaptive practice can start before the server has calibration data. The author can judge a question's difficulty but cannot invent a rating, and D-044 bands a new student at +/-100 around the default 1200. A seed outside that band would make some questions invisible at launch.
- **Decision:** The author marks a question `easy`, `medium` or `hard`. The build maps those to 1100, 1200 and 1300 respectively. All three seeds sit inside the initial +/-100 band, so a new student can be served any difficulty level from the first session. The mapping lives in one table, tested at the boundaries.
- **Alternatives considered:** A single seed of 1200 for every question (simplest, but throws away the author's judgement and makes the first week feel flat); a five-level scale (more nuance, but authors disagree more and the extra mapping has to be tuned); no seed and wait for server calibration (correct eventually, but blocks launch and makes offline first practice impossible).
- **Why:** Three levels are a judgement an author can make consistently without training. A 200-point spread is meaningful against a +/-100 band, and one frozen table is easy to test and explain.
- **Trade-off accepted:** Difficulty labels are subjective and coarse; a mislabelled question starts up to 100 Elo off. All new questions start within one band, so the adaptive range only widens through actual attempts.
- **Revisit when:** Calibration data shows the author labels are systematically biased, or the band widens enough that a three-level seed is too coarse.

## D-050: Ed25519 signs canonical JSON of version, generatedAt, packs
- **Date:** 2026-11-07
- **Status:** Accepted
- **Area:** Security
- **Context:** D-025 requires every manifest to be Ed25519-signed, but never defines the bytes that are signed. JSON key order and whitespace are not stable across serializers, and the app must be able to verify a manifest it downloaded without trusting any formatting choice made by the build.
- **Decision:** The signature covers `canonicalJson({ version, generatedAt, packs })`: object keys sorted, no whitespace, strings escaped with `JSON.stringify`, and numbers restricted to safe integers. The `signature` field itself is excluded and stays inside `manifest.json`. `shared/canonicalJson.ts` is the single implementation, used by the build now and by the app's verifier later. The build key is generated outside the repository (`npm run content:keygen`), and `*.pem` is gitignored.
- **Alternatives considered:** Sign the exact bytes of `manifest.json` and ship a detached `manifest.sig` (no canonicalizer, but two files per update and verification breaks if anything reformats the manifest); sign only the pack hashes (detects pack tampering but not a rolled-back version or timestamp); use JWS (standard envelope, but more parsing and base64url handling for no benefit here).
- **Why:** One file, deterministic bytes and one implementation on both sides. Rejecting floats removes the last formatting ambiguity, and the canonicalizer is small enough to port if a non-JavaScript client ever needs it. Tests sign in memory and verify with the matching public key; no private key is committed.
- **Trade-off accepted:** The canonicalizer must stay byte-identical across every client, and floats cannot be added to the manifest without a format change. A valid old manifest can be replayed unless the app also enforces a monotonic `version`; that check is a client rule, not something the signature provides.
- **Revisit when:** Another language needs to verify manifests, or the manifest needs nested non-integer data.

## D-051: Styling is CSS custom properties plus scoped CSS, not Tailwind
- **Date:** 2026-11-07
- **Status:** Accepted
- **Area:** UI
- **Context:** Step 5 builds roughly fifteen screens for a Redmi 9A class phone under a 300 KB compressed app-code budget. The UI needs light and dark themes, a Hindi/English switch and one consistent look, but there is no styling layer yet and every future screen has to share it.
- **Decision:** Four CSS layers in `src/ui/`: `tokens.css` (custom properties for colour, type, 4px spacing, radius, elevation, motion and layout, with dark as an override block), `base.css` (element defaults), `components.css` (documented classes such as `.btn`, `.option`, `.card`) and `index.css` (the single import). Screens compose those classes and may add scoped layout CSS, but a screen may not introduce a colour or a spacing value of its own.
- **Alternatives considered:** Tailwind CSS v4 (fast utility iteration, but a build plugin, class-heavy markup and a second theming layer on top of tokens); a component library such as Flowbite or Material (pre-built controls, but generic shapes, a large runtime and less control over Devanagari metrics).
- **Why:** No runtime and no build plugin, which keeps the bundle inside budget. Tokens make dark mode one attribute on `<html>`, and they let `tests/ui/tokens.test.ts` check AA contrast, tap targets and "no hard-coded colours" mechanically. One small vocabulary of components is enough for an app that repeats the same question card hundreds of times.
- **Trade-off accepted:** More CSS is written by hand, and the team must resist adding a one-off class per screen. Utility classes would make layout tweaks faster but would scatter the decisions the tokens are meant to centralise.
- **Revisit when:** Screens start duplicating the same layout rules, or a second developer joins and the class vocabulary stops being obvious.

## D-052: Mukta, self-hosted and subset, carries both scripts
- **Date:** 2026-11-07
- **Status:** Accepted
- **Area:** UI
- **Context:** Every screen mixes English and Hindi, often inside one question card. Students are on patchy 4G and installs must stay small; an extra font request also costs a round trip on first open and fails offline. Devanagari needs taller lines and careful glyph coverage or matras clip.
- **Decision:** Use Mukta at 400, 600 and 700 for Latin and Devanagari. Self-host the woff2 files in `src/ui/fonts/`, subset them with `fonttools` to the Devanagari and Latin glyphs the app uses, ship one subset per script per weight with `unicode-range`, and load with `font-display: swap`. Six faces total about 196 KB uncompressed. Ship the OFL licence next to the files.
- **Alternatives considered:** Noto Sans plus Noto Sans Devanagari (broadest coverage and familiar shapes, but two families, two subset pipelines and slightly mismatched Latin/Devanagari metrics); system fonts only (zero bytes, but Devanagari varies by OEM and the same screen looks different on every phone).
- **Why:** One family means one set of metrics, so a bilingual question does not reflow when the student switches language. Subsetting and self-hosting remove the network from the critical path and keep the whole font payload smaller than one unsubsetted Devanagari weight. Mukta is designed for Indian scripts and has an OFL licence that allows embedding.
- **Trade-off accepted:** Subsetting is a manual step; a glyph outside the subset falls back to a system font. Adding new characters or a new weight means re-running the subset. The build does not yet automate the subset, so the generated files are committed.
- **Revisit when:** Content needs glyphs outside the subset, a third script appears, or the subset can be produced automatically in the build.

## D-053: Deep indigo accent; feedback colours stay semantic
- **Date:** 2026-11-07
- **Status:** Accepted
- **Area:** UI
- **Context:** The answer-option row is the most-used control. Its correct state is green and its wrong state is red, so the brand accent must never be confused with either, and it must pass AA on cheap LCD panels in both themes.
- **Decision:** Accent `#4338ca` on light neutrals and `#a5b4fc` on dark neutrals, with white or near-black text on filled accent. Green, red, amber and blue are reserved for correct, wrong, warning and info. Every text pair used by a component is asserted at 4.5:1 and the strong border at 3:1 by `tests/ui/tokens.test.ts`.
- **Alternatives considered:** Saffron/amber (warmer and more local in feel, but needs dark text on filled buttons, competes with the warning state and loses contrast more easily on budget screens); teal (distinct from feedback colours, but reads as "info" and is harder to separate from the blue info banner).
- **Why:** Indigo is far from both green and red in hue and in luminance, so a selected option, a link and a primary button never look like a verdict. The contrast test makes the AA claim executable instead of aspirational.
- **Trade-off accepted:** The palette is deliberately restrained and carries less regional character than saffron; personality has to come from type, spacing and copy. Dark mode uses a lighter accent, so the two themes do not share one literal accent value.
- **Revisit when:** Brand work defines an identity, or device testing shows the accent is hard to distinguish outdoors.

## D-054: Comfortable density: 16px body, 48px targets
- **Date:** 2026-11-07
- **Status:** Accepted
- **Area:** UI
- **Context:** The target phone is a Redmi 9A class device held in one hand, often used while travelling. Questions and four options must be readable in Devanagari, and a mis-tap on an option changes the answer the student is graded on.
- **Decision:** Body text 16px with 1.6 line-height and 1.75 for Hindi, a 4px spacing grid, a single 640px reading column, 48px minimum interactive height (64px bottom nav), 2px borders on options and a 16px gutter. The preview and the token tests pin these values.
- **Alternatives considered:** Compact 14px body with 44px targets (more content above the fold, but smaller Devanagari, more mis-taps and below Android's 48dp guidance); extra-large 18px body with 56px targets (easier to read, but one question plus four options would not fit on a 5.5-inch screen without scrolling).
- **Why:** 16px is the smallest size at which Devanagari matras stay legible on a 720p panel, and 48px is the platform's own touch guidance. Fewer visible items is an acceptable cost because practice is one question at a time, not a dense list.
- **Trade-off accepted:** Less information per screen and more scrolling on results and settings. An option row is about 59px tall, so four options plus a question fill most of a small screen.
- **Revisit when:** Usability testing on the actual test phone shows the density is wrong, or the exam interface needs a different layout.

## D-055: Vite + Svelte 5 SPA, no SvelteKit
- **Date:** 2026-11-07
- **Status:** Accepted
- **Area:** Build
- **Context:** The app is a single-page Capacitor bundle with hash routes and no server rendering. It must build to a relative-path static `dist/`, start offline, and stay inside the 300 KB compressed-code budget. Svelte was already chosen in D-002; the question is the build and routing layer around it.
- **Decision:** Build with Vite 8 and Svelte 5 (runes). `vite.config.ts` sets `base: './'` and targets ES2022. Capacitor reads `dist/` through `webDir`. There is no SvelteKit: no adapter, no server routes, no SSR. Theme is applied from IndexedDB at boot, with a synchronous `localStorage` key `cgl.theme` read by an inline script in `index.html` purely as a pre-paint hint (D-053).
- **Alternatives considered:** SvelteKit with `adapter-static` (file-based routes and conventions, but SSR concepts, a larger dependency graph and a `base`/fallback configuration that earn nothing in a WebView); a hand-rolled build with esbuild and a Svelte plugin (smallest possible output, but re-implements dev server, HMR, asset hashing and CSS handling).
- **Why:** Vite is the supported default for Svelte 5, produces a hashed static bundle, and adds no runtime. `base: './'` makes the same `dist/` work from the Capacitor origin and from any future sub-path. Skipping SvelteKit removes code and concepts the product cannot use offline. The measured bundle is 55.66 kB gzip JS and 4.05 kB gzip CSS.
- **Trade-off accepted:** Routing, 404 handling and back-button behaviour are ours to maintain (D-056). A future public web build with prerendered landing pages would need extra work.
- **Revisit when:** A public web surface needs SEO or server rendering, or the app gains routes that benefit from file-based conventions.

## D-056: Own typed hash router, Android back in `main.ts`
- **Date:** 2026-11-07
- **Status:** Accepted
- **Area:** UI
- **Context:** Five screens plus a 404 need URLs that survive a WebView reload, work with no server rewrite rule, and give the Android back button a history entry per screen. A router library would be the only runtime dependency added purely for navigation.
- **Decision:** `src/app/router.ts` exposes pure `parseHash`, `buildHref`, `matchPath` and one DOM subscription, `subscribePath`. Routes are a discriminated union: `#/home`, `#/practice` and `#/practice/:subtopic`, `#/mock/:id`, `#/progress`, `#/settings`, and a renderable `not-found`. Unknown shapes produce `not-found` rather than throwing. The native back listener lives in `main.ts` and calls `history.back()`, exiting only when there is no history left.
- **Alternatives considered:** `svelte-spa-router` (hash routing, tiny, but string patterns and an untyped route object); hand-writing `hashchange` in each screen (no single source of truth and easy to leak listeners).
- **Why:** The router is about 100 lines, fully unit-tested, and the route type makes an unhandled screen a compile error at the `switch`. It adds zero bytes of dependency and no API to learn. Android back works because every navigation is a real hash change.
- **Trade-off accepted:** No nested layouts, route guards or code-splitting helpers come for free; a screen that needs them must add them deliberately. URLs are hash-based, so they are not crawlable.
- **Revisit when:** Route count or nesting grows enough that hand-written matching becomes error-prone, or deep links from outside the app are required.

## D-057: Typed message dictionary, no i18n library
- **Date:** 2026-11-07
- **Status:** Accepted
- **Area:** UI
- **Context:** Every screen is bilingual. The app has a fixed, small vocabulary of chrome strings; question text and explanations are already bilingual in the pack. Missing Hindi copy must be a build failure, not an English string leaking into a Hindi screen.
- **Decision:** `src/ui/i18n/messages.ts` holds an `en` object and a `hi` object typed as `Record<keyof typeof en, string>`. `MessageKey` is derived from the English object, so a missing or extra Hindi key is a TypeScript error. `translate(language, key, vars)` replaces `{name}` placeholders and leaves unknown placeholders visible. Language comes through Svelte context (`provideI18n` / `useI18n`), driven by the settings row. Tests assert both languages define every key, no string is blank, and key Hindi labels contain Devanagari.
- **Alternatives considered:** `svelte-i18n` (catalogues, plurals and locale loading, but a runtime, async catalogue loading and a store layer for two languages); `@formatjs/intl` (ICU plurals and formatting, but a large dependency and a message compiler for a vocabulary this small).
- **Why:** Two languages, one screen at a time and no plural rules in the chrome mean the library earns nothing. A typed object gives compile-time completeness and keeps the whole dictionary visible in review. It costs no bytes beyond the strings themselves.
- **Trade-off accepted:** No ICU plural or date formatting; number and date formatting, when needed, must be written explicitly. Adding a language means adding one complete object.
- **Revisit when:** A third language, plural-sensitive copy, or translator-owned catalogue files appear.

## D-058: No public PWA in v1; Capacitor only
- **Date:** 2026-11-07
- **Status:** Accepted
- **Area:** Build
- **Context:** `PROJECT_SPEC.md` §14 left open whether to ship a browser-installable PWA alongside the Android app. The budget is ₹10,000 and the calendar is 12 weeks, with the Play closed test on the critical path (Week 4–6). A second distribution surface brings its own storage-eviction, update and support problems.
- **Decision:** v1 ships as a Capacitor Android app only. The SPA keeps relative asset paths and hash routes so it remains PWA-compatible if that changes, but no manifest, service worker, install prompt or web support policy is produced or tested in v1. The open question in `PROJECT_SPEC.md` §14 is resolved as "not in v1".
- **Alternatives considered:** Ship both now (one codebase, broader reach, but a second install path, iOS/Safari storage rules, update prompts and support burden during the exact weeks reserved for content and the closed test); build the PWA first and wrap it later (web iteration is fast, but the WebView target is the product and testing the wrong surface risks shipping a different app).
- **Why:** The Android app is the funded deliverable and the only surface that can be tested on the target Redmi 9A class phone. Keeping the SPA PWA-compatible costs nothing today and preserves the option. Deferring the manifest and service worker removes a whole class of cache-update bugs from the launch window.
- **Trade-off accepted:** No browser install, no desktop use and no shareable web link at launch; reach depends on Play Store discovery. A later PWA launch inherits an untested storage model.
- **Revisit when:** The Play launch is stable and demand for a browser version is demonstrated, or desktop users become a meaningful share of requests.

## D-059: Bundle the signed first pack in the APK and verify it before import
- **Date:** 2026-11-07
- **Status:** Accepted
- **Area:** Security
- **Context:** The first launch happens on a budget phone with patchy 4G, often before the student signs in. The app must be usable offline immediately, yet question text is the one thing the app must not accept from an untrusted source: a modified answer key would teach the wrong fact.
- **Decision:** Ship the sample pack (`public/packs/*.json` plus its signed `manifest.json`) inside the APK. On startup `src/sync/PackInstaller.ts` fetches the bundled manifest from the WebView origin, verifies the Ed25519 signature over `canonicalJson({ version, generatedAt, packs })` with the key pinned in `src/sync/contentPublicKey.ts`, checks each pack's SHA-256, validates every question with `core/Question.ts`, and only then replaces the pack inside one Dexie transaction. A pack already at the advertised version and hash is skipped. If Web Crypto lacks Ed25519 the installer fails closed and the shell shows a retry banner.
- **Alternatives considered:** Download the first pack from the CDN on first launch (smaller APK, but a cold install with no data is unusable and the first run becomes a network dependency); ship the pack unsigned as a demo and sign only downloaded updates (one trust rule for updates and none for the content the student sees first, which is the wrong place to save a signature check); sign packs but import before verifying (a bad pack could still reach the database if validation fails mid-write).
- **Why:** Bundling gives a working practice session on a phone in airplane mode. The same manifest verification path will serve CDN updates later (F5), so there is one trust chain and one parser to test. Validation before writing means a corrupt or tampered pack leaves the previous version untouched. The demo is three verified questions, about 4 KB of JSON, so the APK cost is negligible now and the mechanism is proven before the 2,000-question bank exists.
- **Trade-off accepted:** Every content build that ships in an APK requires an app update; the bundled manifest's CDN URLs are only used to derive the local file names. A rotating signing key means an app update. The developer must keep the private key outside the repository (the keygen command refuses to write inside it).
- **Revisit when:** The bundled pack grows enough to matter for APK size, or content updates must reach installed apps without a Play release.

## D-060: One service and one transaction own the answer cycle
- **Date:** 2026-11-07
- **Status:** Accepted
- **Area:** Data
- **Context:** One tap changes five things: the append-only attempt, the FSRS card, the sub-topic Elo, the IST daily counter, and the feedback the student sees. Spread across UI code, a crash or a double tap can leave derived state disagreeing with the log, and the replay rule (D-016) exists precisely to prevent that.
- **Decision:** `src/services/PracticeService.ts` is the only writer in the answer path. `answer(question, chosen, ms, examDeadline)` creates the attempt value with `core/Attempt.ts`, then opens one Dexie `rw` transaction over `attempts`, `cardState`, `skills` and `dailySummary`. The reads of current card, skill and daily row happen inside that transaction; FSRS and Elo remain pure calls. `chosen === null` logs the attempt and writes a zero daily row, and touches neither card nor skill (D-034, D-043). The UI receives a `PracticeFeedback` only after the commit.
- **Alternatives considered:** Five independent repository calls from the screen (simple to write, but a failure between calls leaves a graded attempt without its card or counter); write the attempt first and derive card/skill/daily later in the background (fastest tap-to-paint, but Home and the next pick read stale derived state until the background job runs, and a crash loses the work); keep the reads outside the transaction (a second answer could interleave and overwrite the first one's card state).
- **Why:** A single commit is faster than five on the target hardware and gives all-or-nothing semantics. It also puts the entire rule set in one service that can be tested with `fake-indexeddb`, leaving `ui/` and `core/` unchanged. The measured flow on the preview build stays far below the 50 ms tap budget because the option is painted optimistically before the promise resolves.
- **Trade-off accepted:** The transaction is short but includes the derived-state reads, so an answer is not "fire and forget". A failed commit shows a retry banner and the question stays on screen; the retry repeats the same choice and elapsed time rather than inventing a second attempt. `PracticeService` becomes a hot spot that must be kept free of UI concerns.
- **Revisit when:** Answer volume or a new derived table makes the transaction visibly slow, or sync requires writing the attempt before the derived state.

## D-061: Instant feedback, locked options, explicit Next
- **Date:** 2026-11-07
- **Status:** Accepted
- **Area:** UI
- **Context:** A practice tap is both an answer and a learning moment. Auto-advancing hides the explanation; leaving options live lets a second tap overwrite the attempt; showing only "wrong" without the right answer teaches nothing.
- **Decision:** Tapping an option paints the selection immediately, disables every option and the Skip button, then shows the verdict banner, the correct option with a `CORRECT` label, the chosen wrong option with a `WRONG` label, and the bilingual explanation. Nothing advances until the student taps **Next question**. A skip follows the same shape with a "Skipped" banner and no wrong marking. State is never colour alone: the verdict labels are text.
- **Alternatives considered:** Auto-advance after a short delay (fast drill feel, but a wrong tap or a slow reader loses the explanation and the next question may be answered accidentally); advance on the next option tap (fewer buttons, but the student cannot stop to read and a second tap can look like an answer to the next question); no explanation until a separate review screen (smaller hot path, but feedback is the learning event and batching it loses the context).
- **Why:** The target student is preparing for a timed exam and needs to understand a mistake once, not collect a score. A locked board prevents double submissions and makes the tap's effect unambiguous. The explicit Next keeps the reading time under the student's control, and the two labels satisfy the accessibility rule already established in D-053/D-054.
- **Trade-off accepted:** Two taps per question, so a 10-question goal takes more wall-clock time than a drill. The explanation card adds vertical space on a small screen. The UI must hold local "picked" state until the service returns, and reset it when a skipped question is served again.
- **Revisit when:** Usability testing shows the fixed Next is slower than the learning benefit, or a timed mock needs a different answer flow.

## D-062: `#/practice` chooses a sub-topic; the session has its own URL
- **Date:** 2026-11-07
- **Status:** Accepted
- **Area:** UI
- **Context:** Elo and FSRS are scoped to a sub-topic, and the sample bank has one question per sub-topic. A single mixed practice stream would either share one rating across unrelated subjects or need a cross-topic selection rule that does not exist yet. The router already supports `#/practice/:subtopic` (D-056).
- **Decision:** `#/practice` loads `ProgressService.topics()` and shows one row per installed sub-topic with its section, question count and current rating. Choosing a row navigates to `#/practice/<subtopic>`, which starts a session through `PracticeService.next(subtopic)`. A session's empty state links back to the chooser. Home's primary button always opens the chooser; no route starts a mixed session in Step 6.
- **Alternatives considered:** Start one mixed session from `#/practice` across all sub-topics (one tap fewer, but the Elo target and the due-card queue would mix subjects and the student could not choose Polity on a day before the exam); keep practice on one page with an in-page sheet (no URL per topic, so back does not return to the chooser and deep links from a future study plan are impossible); put the chooser on Home (more taps to reach other sections, and Home already carries the daily goal and streak).
- **Why:** A sub-topic URL makes the back button, a future study plan and a future notification all work with the router we already have. It mirrors how Elo and FSRS already think, so no new selection rule is needed for launch. The chooser is also the honest empty state while the real bank is being written.
- **Trade-off accepted:** One extra tap before the first answer, and no "review everything due" session yet. The chooser shows slug-derived labels until content carries display names. A mixed or due-only session will need a new service method, not just a screen change.
- **Revisit when:** The bank is large enough that students want a cross-topic "due today" session, or study plans/notifications need to deep-link into a mixed queue.

## D-063: One row per accepted attempt; `(user_id, attempt_id)` is the dedupe key
- **Date:** 2026-11-07
- **Status:** Accepted
- **Area:** Data
- **Context:** §6 sketched `attempt_inbox` as one row per batch carrying a JSONB `attempts` array. Every later question scans that array: "has this attempt arrived before", "what is the newest position", "how many answers today". A batch resent with an overlapping array would be hard to detect, and a correction or a report has no row to point at.
- **Decision:** Store one row per attempt, keyed by `(user_id, attempt_id)`, with `batch_id` as a foreign key to `sync_batches` for provenance and cascade. The primary key is the duplicate guard: an attempt already seen inserts nothing, whatever batch it arrives in. The IST day is computed once on arrival and stored on the row.
- **Alternatives considered:** Keep the JSONB array per batch (fewer rows, but array scans for every aggregate, duplicates inside an array are invisible, and no per-attempt uniqueness); one append-only table with no batch key (loses the retry idempotency key and the ability to forget a batch); store only a hash per attempt (small, but no rows to aggregate or serve back on a new device).
- **Why:** Duplicate handling becomes a primary key instead of application logic, `sync_pull` pages with a plain index scan, and the cheap aggregates are ordinary `GROUP BY` queries. A year of heavy use is roughly 5,000 rows per student, which is nothing for Postgres.
- **Trade-off accepted:** More rows than a batch blob, and `sync_batches` has to exist before its attempts, so the batch row is inserted first and its response filled in at the end of the transaction.
- **Revisit when:** Write volume or storage forces the daily archive (D-027) to become the primary store and the inbox a short-lived landing zone.

## D-064: One SECURITY DEFINER RPC owns the sync transaction
- **Date:** 2026-11-07
- **Status:** Accepted
- **Area:** Sync
- **Context:** A batch touches six tables: the batch key, the attempt rows, question statistics, daily statistics, reports, and the sync cursor and correction watermark. PostgREST has no multi-statement transaction, so an Edge Function writing table by table can accept half a batch and double count the next retry.
- **Decision:** `public.apply_sync_batch(p_batch jsonb)` is the only write path. It is `SECURITY DEFINER` with a pinned `search_path`, derives the caller from `auth.uid()`, validates shape and the 200-attempt / 20-report caps, and raises SQLSTATE `28000` or `22023` for bad input. The Edge Function only checks the method, the bearer header and the body size, then calls the RPC. `sync_pull` follows the same shape.
- **Alternatives considered:** Write through the Supabase client from the Edge Function (more TypeScript, no atomicity, double count on retry); one RPC per table with a client-side saga (compensation logic for a problem a transaction removes); no `SECURITY DEFINER` and grant the tables to `authenticated` (every client becomes a trusted writer).
- **Why:** A batch is accepted whole or not at all, and the rule sits in the database, where the PGlite tests can execute it. The adapter that cannot be tested stays almost empty.
- **Trade-off accepted:** Business rules now live in plpgsql, which is harder to refactor and review than TypeScript. The RPC is covered by migration tests rather than by the app's type system.
- **Revisit when:** The sync path grows into several RPCs, or a rule needs to be shared between the app and the server and starts drifting.

## D-065: Aggregates are derived at sync time, by recomputation where possible
- **Date:** 2026-11-07
- **Status:** Accepted
- **Area:** Sync
- **Context:** D-028 makes the server the only source of `daily_stats`, and F9 put the derivation in the nightly job. That means a second device sees yesterday's streak, and a failed job leaves every student's streak stale. Incrementing counters on arrival is immediate but double counts whenever a client resends attempts under a new batch id.
- **Decision:** Derive inside the sync transaction. `question_stats` is global, so it is incremented only from the rows the attempt insert actually returned (`RETURNING`), which makes a resend a no-op. `daily_stats` is recomputed for each IST day the batch touches, from the inbox itself, with `ON CONFLICT ... DO UPDATE` replacing the values instead of adding to them. The IST day is decided once when the attempt arrives and stored, so a later clock cannot move an old attempt to another day.
- **Alternatives considered:** Nightly only (F9 as written: stale streaks and a single point of failure); increment both (fast, but any resend or duplicate id doubles the counters); recompute every day for the user on every sync (idempotent, but scans the whole log each time and loses history once attempts are pruned).
- **Why:** A retry is harmless by construction rather than by remembering to skip it, and Home is correct on the second device immediately. The touched-day recomputation only reads rows for the days in the batch.
- **Trade-off accepted:** Each sync runs one small aggregate per touched day, and an attempt that arrives months late for a day already pruned by 7A-2 will need explicit reconciliation against the archive. `question_stats.elo` stays null until the calibration pass exists.
- **Revisit when:** A student's inbox is large enough that the per-day recomputation is visible, or 7A-2 prunes days that late devices still write to.

## D-066: Compaction prunes attempts only behind a checkpoint
- **Date:** 2026-11-07
- **Status:** Accepted
- **Area:** Data
- **Context:** An inbox that never shrinks costs storage and slows every aggregate. But D-016 makes the attempt log the source of truth: deleting attempts before a checkpoint exists deletes history that no device can replay. The nightly archive and its checkpoint writer are 7A-2, not 7A.
- **Decision:** `compact_sync_inbox(p_batch_retention)` deletes an attempt only when it is at or before the newest checkpoint cursor for its owner, and deletes a batch idempotency key only when it is older than the retention window and no longer owns any attempt. 7A writes no checkpoints, so on a 7A database the job prunes only stale batch keys — it is safe to schedule now and starts reclaiming space when checkpoint writing lands.
- **Alternatives considered:** Prune on age alone (simple, but destroys the source of truth the first time the job runs); never prune (unbounded growth and slower queries); prune only when a Storage archive is confirmed (needs 7A-2 before the job can exist, and leaves the maintenance path untested).
- **Why:** The dangerous half is gated by the one fact that makes deletion safe; the harmless half runs today and exercises the job. The rule also cannot be broken by scheduling the job too early.
- **Trade-off accepted:** Until 7A-2, the inbox keeps every attempt, so the storage win is not realised yet. A batch key is only forgotten after its attempts are gone, because the foreign key cascades.
- **Revisit when:** 7A-2 writes checkpoints and daily files, at which point the retention window should be revisited against the 12-month local-retention rule.

## D-067: A retried batch replays its stored response; corrections use a watermark with overlap
- **Date:** 2026-11-07
- **Status:** Accepted
- **Area:** Sync
- **Context:** A client retries when the response is lost. Idempotency on the write side is not enough: corrections are read relative to a per-user watermark, so a second call would find the watermark already advanced and return fewer corrections than the first call, silently dropping the ones the client never received. A correction committed between the read and the watermark update can also be missed.
- **Decision:** `sync_batches.response` stores the exact JSON the first call returned; a repeated `(user_id, batch_id)` returns it byte for byte, even if corrections have changed since. Corrections are selected where `corrected_at > last_corrections_at - interval '1 hour'`, then `last_corrections_at` moves to `now()`. The overlap re-sends anything from the last hour, and the client treats corrections as at-least-once.
- **Alternatives considered:** Recompute the response on a retry (drops corrections already marked delivered); no overlap (a race window loses a correction); a per-correction acknowledgement table (exact once, but more state and a second round trip for a rare event); storing only the correction ids in the batch row (smaller, but the client still needs the payload).
- **Why:** A lost response is exactly replayable, and a correction can only be missed if it is committed more than an hour after it was written, which the commit order makes impossible. Correction payloads are tiny and rare, so the duplicate is cheap.
- **Trade-off accepted:** The same correction can arrive twice within an hour; the device's `corrections` store is keyed by qid, so applying it twice is a no-op. Batch response rows are kept for the batch retention window.
- **Revisit when:** Corrections become frequent, or the client needs exactly-once delivery for a different payload.

## D-068: The migrations run in PGlite; the Edge Function stays a thin adapter
- **Date:** 2026-11-07
- **Status:** Accepted
- **Area:** Build
- **Context:** There is no Docker and no Supabase project on the development machine. SQL and row-level security written blind fail in production, where the failure is a leak or a lost batch rather than a red test. The Edge Function is Deno code, which the app's `tsc` setup cannot typecheck.
- **Decision:** Add `@electric-sql/pglite` as a dev-only dependency. `tests/server/harness.ts` boots Postgres in WASM, applies `tests/server/sql/auth-shim.sql` (just `auth.users`, `auth.uid()` and the three API roles), then every file in `supabase/migrations/` in filename order. Tests switch to `authenticated` or `anon` with `set role` so RLS is exercised as a non-owner. `supabase/functions/sync/index.ts` is excluded from `tsconfig.json` and limited to method, auth header, body cap and one RPC call.
- **Alternatives considered:** Mock the SQL (tests the mock); install Docker and the Supabase CLI (the faithful stack, but a heavyweight install the machine does not have); defer all SQL until staging (fast now, but RLS and transaction bugs surface after launch); typecheck Deno by copying the adapter into TypeScript (two copies of the same glue).
- **Why:** The deployed migrations are what runs in the tests, so a bad policy, constraint or function fails locally. Keeping the untested part to four checks makes the blind spot small and obvious.
- **Trade-off accepted:** PGlite is Postgres, not Supabase: no PostgREST, no auth service, no storage and no scheduling. The Edge adapter and the real project wiring are verified only against a real project, and the adapter is outside `tsc`.
- **Revisit when:** Docker or a staging Supabase project is available, or the adapter grows logic that deserves a test.

## D-069: `SyncManager` reaches the server through an injected transport
- **Date:** 2026-11-07
- **Status:** Accepted
- **Area:** Sync
- **Context:** The client half of F4 has to POST a batch with a bearer token, then classify the reply as success, retryable or terminal. If the manager called `fetch` directly, every retry and idempotency test would fake a global, and the token lookup, URL and timeout would have to be threaded through the retry state. Auth itself is Step 7C and is not decided yet.
- **Decision:** `SyncTransport` is a one-method interface — `send(batch): Promise<SyncResponse>`. `SyncManager` depends only on it. `HttpSyncTransport` is the only file that knows the function URL, the access-token getter, `fetch`, the JSON body and the timeout; it rejects only when no HTTP response arrived, and returns every status as a `SyncResponse` because the Edge Function answers failures in the same shape. Tests pass a scripted fake.
- **Alternatives considered:** Call `fetch` from `SyncManager` (one fewer file, but auth, URL and retry classification end up in one class and each test mutates globals); inject only `fetch` (narrower, but the manager still owns headers and token lookup, and a fake `Response` cannot easily express "no response at all").
- **Why:** Retry, pinning and correction handling are tested without a network or a token, and 7C can supply a token source without touching the manager. The untested surface shrinks to one adapter.
- **Trade-off accepted:** One more interface and a second implementation to keep in step. Until 7C wires a real token, `HttpSyncTransport` is exercised only against a fake `fetch`.
- **Amendment (2026-11-07, Step 7C):** the history download needs a second endpoint with a different body and paging rule, so `PullTransport.pull(after, limit)` is a second one-method seam beside `send`. `HttpPullTransport` is the only file that knows the `sync_pull` RPC URL; `HistoryService` owns paging and the cursor, for the same reason `SyncManager` owns retries.
- **Revisit when:** Pull (F7) needs a second transport method, or token refresh grows logic that belongs in a shared client rather than a getter.

## D-070: The in-flight batch is pinned before the request; a retry replays it
- **Date:** 2026-11-07
- **Status:** Accepted
- **Area:** Sync
- **Context:** D-067 makes the server replay the stored response for a repeated `(user_id, batch_id)`. That guarantee is only useful if the client resends the same id with the same contents. A client that keeps only a boolean `synced` flag can crash after sending, then build a new batch — with newly arrived attempts — under a fresh id, or reuse an old id with different contents and receive a response for the wrong set.
- **Decision:** Before the request, `syncMeta.pendingBatch` stores `{ batchId, attemptIds, reports }`. A retry, including one after a restart, rebuilds the batch from those exact attempt rows and report objects under the same id. The pin is cleared only after the reply's corrections are folded in, when the server rejects the batch as poison (`invalid_batch`, `invalid_json`), or when none of its attempts survive. It is kept on a network throw and on `timeout`, `sync_failed`, `batch_in_progress` or any reply carrying `retryAfterMs`, so the next run retries. Auth and validation failures are terminal and surface as a status without clearing the pin.
- **Alternatives considered:** A fresh `batchId` per attempt (simple, and safe for attempts because of the inbox primary key, but corrections can be re-delivered and the stored-response path goes unused); store only the id and rebuild from unsynced rows (smaller, but a newly arrived attempt would silently join an old id); no pin (fewest writes, loses the D-067 guarantee entirely).
- **Why:** A lost response is exactly replayable, so corrections cannot be lost between the server commit and the client's receipt. The pin is one row write per batch, and the server already has the dedupe path.
- **Trade-off accepted:** The report payload is copied into the pin, though it is capped at 20 and tiny. An attempt deleted by compaction before a retry drops out of the resent batch; the server then replays the stored response for the rest. The client carries retry state across restarts, so a poison batch must be cleared deliberately rather than forgotten by a reboot.
- **Revisit when:** The server moves to per-attempt acknowledgement, or the pending state outgrows `syncMeta` and needs its own table.

## D-071: Report taps live in their own table, keyed by question, version and reason
- **Date:** 2026-11-07
- **Status:** Accepted
- **Area:** Data
- **Context:** F11 queues "Report an error" taps offline and sends at most 20 with a sync batch. The server dedupes them by `(user_id, qid, qv, reason)`. A JSON array in `syncMeta` would have no per-row state: every read parses the whole queue, every mark rewrites it, and a repeated tap either grows the array or needs a scan to find.
- **Decision:** Dexie schema version 2 adds `reports`, keyed `[qid+qv+reason]`, with `sent: 0 | 1` and an `at` index. `ReportRepository.queue` inserts only when the key is new, so a repeated tap collapses. `pending(limit)` returns the oldest unsent rows; `markSent` flips exactly the rows that were sent. The upgrade is additive and keeps every existing table.
- **Alternatives considered:** A JSON queue in `syncMeta` (no schema bump, but whole-array rewrites, no per-row flag and unbounded growth when one report keeps failing); a flag on the attempts store (no new table, but reports are not attempts and would pollute replay and the synced counter).
- **Why:** The device key matches the server's uniqueness rule, so a double tap and a retried batch both collapse to one row. Reads are an index lookup, and the sent flag lets a batch mark only what it carried.
- **Trade-off accepted:** The schema version moves to 2, so an existing install runs a Dexie upgrade on first open. The queue has no delivery status beyond unsent/sent — a rejected report looks the same as an accepted one until the admin flow exists.
- **Revisit when:** Reports need server-side status (accepted / rejected / answered) or attach a free-text note that makes two reports on the same key genuinely different.

## D-072: Corrections are stored first, folded in once and used for grading immediately
- **Date:** 2026-11-07
- **Status:** Accepted
- **Area:** Sync
- **Context:** F6 sketches one pass per correction: regrade the question, rebuild every card and skill, repeat. A phone with several corrections would replay its whole log several times. Worse, F6's ordering rule says the corrected key must grade answers from the moment the correction arrives, before the fixed pack is downloaded; a rebuild-only implementation keeps grading against the old key until the pack update lands.
- **Decision:** `CorrectionApplier.apply(corrections)` runs one transaction: dedupe by correction id, store the fresh rows, count `changed` once per question by comparing each attempt's stored verdict with the corrected key for its own version, build a corrected index from the installed bank plus every stored correction, rebuild cards and skills once with `Replayer.rebuild`, replace both derived stores, and mark the fresh rows seen. Correction version ranges map every covered version to `newAnswer`, so an attempt recorded under the old pack and one recorded after the fix grade the same way. `PracticeService.answer` reads `CorrectionRepository.answerFor(qid, qv)` inside its own transaction and grades the attempt against that answer, which makes the ordering rule true without waiting for the pack.
- **Alternatives considered:** Literal per-correction loop (matches F6's sketch, but N full replays on a Redmi 9A); one rebuild per correction with no grading change (simpler, but a student answering between sync and pack download is graded against a key known to be wrong); wait for the corrected pack before applying (one code path, but corrections then depend on the CDN and can be missed offline).
- **Why:** One rebuild covers a whole batch regardless of how many corrections it carries, and the answer key is right at the next tap. The attempt log stays append-only; only derived state moves.
- **Trade-off accepted:** `changed` counts questions whose verdict flipped, not individual attempts, so the banner wording must say so. A correction whose range spans several versions applies the same new answer to all of them, which is the pack contract's version semantics. Corrections for a question not installed yet are stored and used for grading but skipped by the index until the question arrives.
- **Revisit when:** 7A-2 checkpoints make a full-log rebuild too expensive on an old device, or corrections arrive in bulk and need an incremental fold.

## D-073: Hand-rolled minimal GoTrue PKCE client behind `AuthService`
- **Date:** 2026-11-07
- **Status:** Accepted
- **Area:** Auth
- **Context:** F7 needs Google sign-in on Android. `supabase-js` would add its auth, PostgREST and realtime clients to a bundle with a 300 KB compressed ceiling, and its session refresh runs on its own timer and storage layout, which makes the single-flight and mismatch rules hard to test. The app uses exactly three GoTrue calls: exchange a PKCE code, refresh a token, revoke on sign-out.
- **Decision:** Implement the three calls in `src/auth/GoTrueClient.ts`. PKCE is S256 with a 48-byte verifier and a random `state`; `buildAuthorizeUrl` targets `/auth/v1/authorize?provider=google` and the redirect is the custom scheme `com.cglgkmaster.app://auth-callback`. `OAuthBrowser` is the seam: on Android it opens a Capacitor Browser tab and listens for the app deep link; on the web the page redirects and `auth.load(location.href)` finishes the callback. The session lives in `localStorage`, the pending verifier and state in `sessionStorage` with a 10-minute TTL. `AuthService` owns the current `AuthState`, claims the device on first sign-in (D-075), refreshes single-flight 60 s before expiry, abandons a consent screen after 5 minutes, and makes sign-out best-effort. Fetch, clock, RNG, timers and both stores are injectable.
- **Alternatives considered:** `supabase-js` (maintained and complete, but adds three clients to the bundle and hides refresh and storage behind its own runtime); a native Google Sign-In plugin (native UX, but still needs a server-side code exchange and adds a plugin to the already unbuildable Gradle setup); the implicit flow (fewer round trips, but tokens arrive in the URL fragment and there is no PKCE).
- **Why:** The token path is small enough to audit and every branch is testable; the PKCE challenge is pinned against the RFC 7636 Appendix B vector. No third-party script sits between the student and the token.
- **Trade-off accepted:** We own protocol compatibility with GoTrue, and only Google is supported. The app trusts the WebView's `localStorage`, so a rooted device can read the session; revocation is the only server-side remedy. The whole native round trip is seam-tested only until a Supabase project and a device exist.
- **Revisit when:** MFA, phone OTP or a second provider is needed, or GoTrue changes the authorize/token contract.

## D-074: History pull pages `sync_pull`; checkpoints wait for 7A-2
- **Date:** 2026-11-07
- **Status:** Accepted
- **Area:** Sync
- **Context:** A new or second device must download the account's attempt log before it can show progress. The server has `sync_pull(after, limit)` but no checkpoint writer yet (7A-2), so a pull cannot start from a snapshot. A single unbounded response would put a whole history in memory and exceed the function timeout; a failed page must not force the student to start over.
- **Decision:** `PullTransport.pull(after, limit)` posts `{ p_after, p_limit }` to the `sync_pull` RPC. `HistoryService` starts at `syncMeta.historyCursor` (null means a full pull), pages until `hasMore` is false, merges by attempt id, marks pulled rows `synced: 1`, rebuilds cards, skills and daily summaries once, and advances the cursor only after the last page. A failure halfway folds the pages that arrived into the log but keeps the old cursor, so a retry re-fetches them and dedupes locally. The caller uploads the local log before the first pull, so a guest's history is on the server and comes back in the same pass. Page size defaults to 200 and is capped at 500.
- **Alternatives considered:** Pull from a checkpoint (the intended end state, but there is no checkpoint writer yet and the format would be designed twice); one unbounded call (simplest, but unbounded memory and a likely timeout on a long history); server push (no mobile push infrastructure in v1).
- **Why:** It works against the server that exists today, keeps every response bounded, and makes a partial failure an inconvenience rather than a restart. One rebuild per pull keeps the cost of a second device acceptable.
- **Trade-off accepted:** A long history costs several round trips over patchy 4G, and a failure before the first complete pull re-downloads the already-merged pages (they are deduped, not double-counted). Until 7A-2, a very old account can hit the 500-page ceiling and see an error instead of a partial history.
- **Revisit when:** 7A-2 writes checkpoints; the pull then starts from the newest checkpoint plus the log tail, and this paging path remains the fallback when no checkpoint exists.

## D-075: One Google account per device; switching needs a data wipe
- **Date:** 2026-11-07
- **Status:** Accepted
- **Area:** Auth
- **Context:** Local attempts carry no account column. If a second Google account signed in on the same phone, the guest log — or the first student's log — would be uploaded into the second account, mixing two people's progress and daily stats. The app cannot tell whose answers an unsynced row belongs to.
- **Decision:** `syncMeta.accountId` records the first account that signs in. `SyncRepository.claimAccount(userId)` returns `claimed` on the first sign-in, `ok` for the same account and `mismatch` for any other. A mismatch discards the new tokens, revokes them and raises `AccountMismatchError`; Settings tells the student to clear the app's data. Sign-out keeps the claim and the whole local log, so signing back into the same account resumes normally. The in-app wipe and account deletion arrive with F12.
- **Alternatives considered:** Allow switching (needs an account column on every attempt and a per-account database, a large schema change); wipe automatically on mismatch (destructive without consent); never allow sign-in (safe, but throws away multi-device value).
- **Why:** A phone is personal in this market, so one account per install matches real use. The check is one row read inside the existing transaction, and a mismatch fails before any batch is uploaded.
- **Trade-off accepted:** A shared phone cannot host two accounts without clearing app data, and the error message is the only remedy in 7C. A student who signs into the wrong account first must wipe to correct it.
- **Revisit when:** F12 ships account deletion or one device needs multiple profiles.

## D-076: A dedicated `SyncScheduler` owns timing; `App.svelte` only starts it
- **Date:** 2026-11-07
- **Status:** Accepted
- **Area:** Sync
- **Context:** D-009 requires a sync on open, every 5 minutes in use and when the app returns to the foreground. Putting `setInterval`, `online` listeners, token gating and retry rescheduling in `App.svelte` makes the most failure-prone logic untestable and lets a second run start while the first is still sending.
- **Decision:** `src/services/SyncScheduler.ts` owns a 5-minute timer, wake signals, auth/online gating and retry timing. `start()` runs once immediately and subscribes to online/visibility signals through an injected `subscribeWake`; `runNow(reason)` coalesces with any in-flight run; a retryable result schedules `retryInMs`, anything else the regular interval; a guest or offline device skips the request but keeps the timer alive. `start`, `wake` and `manual` may send an empty batch so corrections and the server cursor arrive without a new answer; the five-minute tick does not. `App.svelte` creates the runtime, calls `start()` after `auth.load`, calls `runNow` after the sign-in upload/pull, and `stop()` on unmount.
- **Alternatives considered:** `setInterval` in the shell (fewer files, but timers, wake listeners and retry state in a component that cannot be unit-tested); sync after every answer (fresher, but too chatty for patchy 4G and adds a request to the 50 ms hot path); native WorkManager (true background sync, but a plugin and build work outside 7C).
- **Why:** All timing rules fit in one class with injected timers and signals, so the tests run instantly and deterministically. One in-flight promise prevents duplicate batches, and the UI stays a composition root.
- **Trade-off accepted:** There is no sync while the app is killed; Android may also throttle WebView timers in the background, so "on background" is a best-effort wake, not a guaranteed flush. A device that stays offline keeps a timer that does nothing until the next wake.
- **Revisit when:** Background delivery is required for reminders or streaks; a WorkManager plugin then owns the schedule and the scheduler keeps the foreground path.

## D-077: Batch 1 is 60 author-verified practice questions in the bundled pack
- **Date:** 2026-11-07
- **Status:** Accepted
- **Area:** Content
- **Context:** Step 8 is the first real content. `content/master/questions.csv` was header-only and the bundled pack held the four fake `sample` rows, so every screen was being exercised against placeholder text. The launch target is about 2,000 verified questions across History, Polity and Geography, and the authoring loop — draft, fact-check, human review, signed pack, install — had never run on real rows. Authoring 2,000 rows before the pipeline is proven would copy any format or encoding mistake 2,000 times.
- **Decision:** Batch 1 is a vertical slice of 60 verified bilingual `practice` questions: 20 each in `polity-fundamental-rights`, `history-ancient-india` and `geography-indian-geography`, with ids `polity-fr-0001..0020`, `history-ancient-0001..0020` and `geography-indian-0001..0020`. Each row carries an official source URL (`india.gov.in` Constitution or physical-features pages, IGNCA/ASI for History, Survey of India for Geography), English and Hindi authored together, four options in a fixed printed order, a difficulty and `verified_at`. They are built into the bundled pack (v2) shipped inside the APK, not just left in the CSV. `validate` gains per-subtopic progress counts and duplicate-question detection: the same English question, compared after lowercasing, stripping punctuation and collapsing whitespace, is an error when either row is verified and a warning while both are drafts. Two guard tests run on every `npm test`: the real master must validate with at least 60 verified rows, and `public/packs/` must verify with the pinned public key, install all three packs and skip them on a second run.
- **Alternatives considered:** Bulk-draft ~300 rows first (builds a backlog, but produces no shippable pack, no pipeline proof, and multiplies any format mistake); PYQ-first only (most credible, but no SSC paper was available to cite from this machine and mislabeling a practice fact as a PYQ is worse than an honest `practice`); English-only rows translated later (faster now, but terminology drifts and every row needs a second pass).
- **Why:** Sixty rows that actually ship prove CSV encoding (Hindi is UTF-8 and round-trips through the pack), bilingual parity, validation, signing and on-device install, and they set the format the remaining ~1,940 rows follow. The duplicate and progress checks turn the CSV into a reviewing tool, which is what the 30–40-a-day verification schedule needs.
- **Trade-off accepted:** Batch 1 is only about 3% of the launch target, so the weekly authoring loop must continue immediately; it is too small to launch on. Rows are marked `verified` where a link was checked, but the spec's founder-verification rule still needs a human pass over this batch. Source links point at official portals and sections rather than a per-question page for many rows, and no row claims PYQ provenance. NCERT pages were unreachable from the build machine, so the citations use other official portals.
- **Revisit when:** Batch 2 starts (weekly volume and the review sheet decide whether the 57-day estimate holds), a source link proves too coarse to check a fact quickly, or corrections make duplicate detection noisy enough to need fuzzy matching.

## D-078: Batch 2 is 300 bilingual draft questions across 12 new sub-topics
- **Date:** 2026-11-07
- **Status:** Accepted
- **Area:** Content
- **Context:** Step 8 proved the authoring, signing and install loop with 60 verified rows, but the launch target is about 2,000 verified questions. The founder needs a reviewable backlog, and the CSV's `draft` status exists so work in progress can live beside shipped rows without entering a pack. Writing more rows in a separate file would fork the format and add a second merge step to every later batch.
- **Decision:** Batch 2 adds 300 bilingual `practice` questions in `status=draft`, 25 each in 12 new sub-topics: `polity-constitution-basics`, `polity-union-executive`, `polity-parliament`, `polity-judiciary`, `polity-federalism-local`, `history-medieval-india`, `history-modern-india`, `history-national-movement`, `history-art-culture`, `geography-physical-india`, `geography-rivers-lakes` and `geography-climate-soils-agriculture`. IDs use the assigned-once slug prefixes `polity-const`, `polity-exec`, `polity-parl`, `polity-jud`, `polity-fed`, `history-medieval`, `history-modern`, `history-national`, `history-art`, `geography-physical`, `geography-rivers` and `geography-climate`, numbered `0001..0025` within each prefix. Rows are appended to `content/master/questions.csv` after the 60 verified rows with the same 28-column header; the build, `public/packs/` and `content/bundled.lock.json` do not change because `content:build` publishes only verified rows. The authoring script rotates the correct option to position `index % 4` (and rotates the Hindi options identically) so the answer letters cycle A/B/C/D; this is authoring-time arrangement only, not runtime shuffling, so D-032 still holds. `content:validate` duplicate detection compares each new question against the whole file, and the batch was checked offline for duplicate English questions and against all 60 shipped rows before merging. `tests/tools/masterFile.test.ts` now asserts the 15 sub-topics and lower bounds (60 verified, 300 draft) rather than an exact subtopic set, so later verification does not require rewriting the guard.
- **Alternatives considered:** Draft in a separate CSV and merge after review (isolates unreviewed content, but forks the format and adds a merge step to every batch); author rows directly as `verified` without a founder pass (fewer steps, but violates the verification rule and would ship unverified facts); pack drafts into a review build (lets the founder review on a phone, but puts unpublished content in a signed artifact and muddies what "installed" means).
- **Why:** One file and one status column keep batch 2 on exactly the path batch 1 proved, the guard test still catches a broken id or a duplicated verified question, and the answer-position rotation removes the "always A" tell from the review sheet. Leaving the pack untouched keeps the shipped v2 artifact and its lock honest.
- **Trade-off accepted:** The master now mixes 60 verified rows with 300 drafts, so a human reviewing the CSV must filter by `status`. Drafts are not tested on a device until they are verified and packed. The rotation is per-file rather than per-sub-topic, so a later reordering of a file changes which letter is correct. Authoring quality is still unproven until the founder reviews batch 2.
- **Revisit when:** Batch 2 clears founder review and is promoted to `verified`, or the review flow needs a separate reviewer sheet instead of filtering the master.

## D-079: Review sheets plus a promote CLI gate every status change
- **Date:** 2026-11-07
- **Status:** Accepted
- **Area:** Content
- **Context:** Batch 2 puts 300 drafts beside 60 verified rows in one 28-column CSV, and the founder must approve, reject or fix each row against its source. Editing `status` and `verified_at` by hand invites a typo, an incomplete row marked verified, or a decision applied to the wrong id, and it leaves no record of why a row was rejected. Filtering and sorting the master for each review session also gets slower as the file grows.
- **Decision:** Review runs through two commands. `content:review` exports a read-only copy of the fields a reviewer needs — `id`, `section`, `subtopic`, `status`, `answer`, `source_url` and both language blocks — plus empty `decision` and `note` columns. It filters by `--status` (default `draft`; also `verified`, `rejected` or `all`) and optionally `--subtopic`, writes CRLF CSV with a UTF-8 BOM for Excel, and refuses to overwrite an existing sheet without `--force`. `content:promote --review <sheet>` changes only the rows the sheet names: `approve` sets `status=verified` and `verified_at` (`--at`, default now); `reject` sets `status=rejected` and clears `verified_at`; `fix` and a blank decision leave the master untouched, and `fix` prints a queue. A note is mandatory for `reject` and `fix`; an unknown decision, a note without a decision, a duplicate id or an id missing from the master is an error. Before applying anything, `promote` re-checks `status`, `answer`, `source_url` and `en_q` against the master and refuses a stale sheet. It validates the entire candidate master before writing, writes atomically, and deliberately does **not** rebuild the pack: rebuild and lock update stay an explicit, separately committed step. `--subtopic` limits writes so the bank is promoted one 25-row sub-topic at a time, and `--dry-run` prints the same summary without writing.
- **Alternatives considered:** Edit the master by hand (no new tooling, but no audit trail, no stale-sheet guard and every row one mis-click from an early promotion); keep decisions in a Google Sheet and import later (nicer editing on a phone, but a second source of truth and an export step); rebuild the pack automatically on promote (one command, but couples verification to signing and makes a partially reviewed bank harder to reason about).
- **Why:** The sheet is a stable artifact the founder can fill at their own pace, and `promote` turns it into exactly two legal transitions with the validation and stale-sheet checks done by code. Per-sub-topic promotion ships the first 25 verified rows without waiting for the other 275, and keeping the rebuild separate means the master, the review sheet and the signed pack each change in a reviewable commit.
- **Trade-off accepted:** A sheet is a copy, so it must be re-exported after every promotion; decisions live in CSV rather than the deferred admin UI; `fix` records a note but does not edit content, so the author still changes the master and exports a fresh sheet. Promotion and rebuild are two commands, and forgetting the second leaves the pack behind the master until the guard tests or the next build catch it.
- **Revisit when:** The admin verification UI lands, review moves to a phone or Google Sheets, or more than one reviewer needs per-person attribution.

