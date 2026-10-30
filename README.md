# CGL GK Master

Mobile-first, offline-ready General Awareness practice app for **SSC CGL Tier 1 & 2**. It ships with a seeded question bank, adaptive difficulty, PYQ and mock-test modes, current affairs, map practice, spaced revision, analytics and a local admin panel.

No account, no backend, no tracking. Progress stays in the browser.

## Features

- **Six sections** — History, Geography, Polity & Governance, Economy & Budget, Science & Technology, Static GK & Current Affairs, split into 28 sub-topics.
- **Adaptive practice** — each sub-topic has its own rating starting at 3.0. Fast correct answers raise it more than slow ones; wrong answers lower it. The next question is picked near the current rating and recent questions are avoided.
  - 3 wrong in a row → easier questions and a prominent explanation.
  - 5 right in a row → a difficulty-5 challenge question.
- **PYQ mode** — filter by year, date and shift; practise a full paper or individual questions.
- **Mock test** — 5–50 questions, 3–60 minutes, section filter, question palette, mark-for-review, timer, optional −0.5 negative marking, score summary and solutions.
- **Current affairs** — monthly editions, a seven-day weekly quiz, reveal-style one-liners and a year-in-review view, with category filters.
- **Map practice** — image-based questions grouped into rivers, mountains, national parks, states and countries.
- **Daily quiz** — ten mixed questions per day with a study streak.
- **Revision** — bookmarks plus wrong answers automatically rescheduled at 1, 3 and 7 days.
- **Analytics** — accuracy, average time, skill level, section and sub-topic breakdowns, 14-day activity, PYQ coverage and mock history.
- **Admin panel** — add, edit, delete and verify questions; bulk JSON/CSV import with a validated preview; image upload with compression; tags; JSON/CSV export. Protected by a local PIN (default `2468`).
- **UI** — mobile-first, large tap targets, light/dark/system theme, English/Hindi toggle, installable PWA with an offline app shell.

## Getting started

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
npm run lint       # oxlint
```

The production build is a static site. Serve `dist/` from any static host; routing uses `HashRouter`, so no server rewrite rules are required.

## Deploy to GitHub Pages

Assets use relative paths, so the same build works at a domain root or under a project path like `/cgl-gk-master/`.

1. Create a public repository on GitHub (for example `cgl-gk-master`) and push this project to `main`.
2. Publish the build to the `gh-pages` branch:
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/deploy-pages.ps1
   ```
   Or run it manually: `npm run build`, then push `dist/` to an orphan `gh-pages` branch.
3. On GitHub open **Settings → Pages**, set **Source** to *Deploy from a branch*, branch `gh-pages`, folder `/ (root)`.
4. Wait for the Pages build, then open `https://<user>.github.io/<repo>/` on a phone.
5. In Chrome, use **⋮ → Add to Home screen**. The installed app opens standalone and works offline after the first load.

GitHub Pages serves over HTTPS, which is required for the service worker and PWA install prompt. Serving `dist/` over a plain LAN address such as `http://192.168.1.10:4173` will not enable offline support.

## Project structure

```
src/
  App.tsx                 routes + lazy-loaded pages
  types.ts                Question, UserState, MockResult, etc.
  data/
    taxonomy.ts           sections, sub-topics and Hindi labels
    bank.ts               seed expansion, ID guard, bank merging
    seed/*.json           compact seed question files
  lib/
    adaptive.ts           ratings, adaptive picking, coverage, streaks
    ca.ts                 current-affairs grouping and labels
    questionIo.ts         JSON/CSV import, validation and export
    image.ts              image compression to data URLs
    i18n.ts               bilingual UI dictionary
    session.ts            session config passed via sessionStorage
    storage.ts            localStorage load/save
    utils.ts              dates, durations, helpers
  store/AppStore.tsx      app state, persistence, answer/mock/bookmark actions
  store/appContext.ts     React context and the useApp hook
  components/             shared UI, layout, question view, admin editors
  pages/                  Home, Practice, PYQ, Mock, Current Affairs, Map,
                          Revise, Analytics, Settings, Admin, Session
public/
  maps/*.svg              schematic map figures used by map questions
  sw.js                   offline app-shell service worker
  manifest.webmanifest    PWA manifest
```

## Data model

A question contains: `id`, `question`, four `options`, `answer` (0–3), `explanation`, optional `tip`, `section`, `subtopic`, `difficulty` (1–5), `source` (`PYQ` / `Practice` / `Current Affairs`), optional PYQ metadata (`year`, `date`, `shift`), optional current-affairs metadata (`month`, `year`, `category`, `eventDate`), optional `image`, optional Hindi content, `tags` and `verified`.

Persistence lives under the `cglgk.user.v1` localStorage key. Seed questions are bundled at build time; admin edits and imports are stored as `overrides` and merged over the seed bank at runtime (`mergeBank`), so the shipped data is never mutated.

## Seed format

Seed files in `src/data/seed/` use compact tuples to stay readable:

```json
[
  {
    "s": "history",
    "t": "prehistoric-ivc",
    "q": [
      [
        "Question text",
        ["Option A", "Option B", "Option C", "Option D"],
        0,
        "Explanation shown after answering.",
        2,
        "Y",
        { "year": 2024, "date": "11 Sept", "shift": "Shift 1" }
      ]
    ]
  }
]
```

- `s` = section id, `t` = sub-topic id.
- Source code: `Y` = PYQ, `P` = Practice, `C` = Current Affairs.
- Optional meta: `year`, `date`, `shift`, `month`, `caYear`, `category`, `eventDate`, `image`, `fact`, `tip`, `tags`, `hq`, `ho`, `he` (Hindi question, options, explanation).
- IDs are generated as `${section}-${topic}-${index}` with automatic `-2`, `-3` suffixes if multiple seed files extend the same sub-topic.

To add questions at runtime, use **Admin → Import / export** (JSON or CSV) and download the provided template.

## Admin panel

Open `#/admin`, enter the PIN (`2468` by default) and manage the bank:

- Dashboard counts, verification status, topic coverage and image coverage.
- Search and filter questions; verify, edit or delete.
- JSON/CSV export of the current bank and a CSV template.
- Bulk import with row-level validation before committing.

The PIN and admin changes are local to the browser. This is a convenience lock, not real authentication. Use the export file to publish verified questions to other devices.

## Known limitations

- All bundled questions are **sample data marked unverified**. Verify them in Admin before sharing with students.
- Map figures are schematic SVGs for practice, not survey-accurate cartography.
- Current-affairs data covers Nov 2024 – Oct 2025; monthly/weekly features use the newest data in the bank rather than the system date.
- Progress and admin edits are per browser/device. Clearing site data erases them.
- This is an independent study aid and is not affiliated with SSC.

## Tech stack

React 19, TypeScript, Vite, React Router (hash routing), lucide-react, hand-written CSS design system, no backend. Tests are not included; validate with `tsc`, `npm run lint` and the manual flows above.
