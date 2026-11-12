# Content master (Step 3; batch 1 in Step 8, batch 2 in Step 9, review in Steps 10–11)

The master CSV is the authoring source. The build turns verified rows into
signed question packs; nothing here ships directly.

- `master/questions.csv` — the real bank. Batch 1 (Step 8, 2026-11-07) has 60
  verified questions: 20 each for `polity-fundamental-rights`,
  `history-ancient-india` and `geography-indian-geography`; they are built into
  the bundled pack (v2). Batch 2 (Step 9, 2026-11-07) adds 300 `status=draft`
  questions, 25 each in 12 new sub-topics (D-078). Drafts are not packed.
- `sample/questions.csv` — four fake rows used to exercise the pipeline.
- `packs.lock.json` — created by the first real CDN build; commit it so pack
  versions and hashes survive between builds.
- `bundled.lock.json` — lock for the pack shipped inside the APK; the build
  writes both the lock and the signed files under `public/packs/` (D-059).
- `review/` — exported review sheets. The English sheet has `decision`/`note`;
  the Hindi sheet has `hi_check`/`hi_note`. Both carry a `content_hash`. Fill
  them, run `content:promote`, then re-export before the next slice (D-079 to
  D-083). `sources-review.csv` and `dupes-review.csv` are advisory reports.

The target is about 2,000 verified questions across History, Polity and
Geography before launch. At 30–40 verified rows a day that is roughly 57 days,
so the queue matters more than any single batch. Batch 1 is the template: one
row per question, English and Hindi written in parallel, four options in the
printed order, one official source link.

## Columns

| Column | Meaning |
|---|---|
| `id` | Assigned once, lowercase slug, never reused (D-048) |
| `v` | Question version; `1` when created, bumped on a correction (D-022) |
| `section` | `history`, `geography`, `polity`, `economy`, `science`, `static-gk`, `current-affairs` |
| `subtopic` | Lowercase slug; also the pack id and the Elo skill id |
| `source_type` | `PYQ`, `CA` or `practice` |
| `source_exam`, `source_year`, `source_shift`, `source_date` | PYQ details; `source_exam` and `source_year` are required for a PYQ |
| `source_ca_month` | `YYYY-MM`; required for `CA` |
| `source_url` | Verification link; required before publishing, never packed |
| `source_ref` | Locator — Article, section, chapter or page — required before approval (D-082) |
| `en_*` / `hi_*` | Question, four options and explanation per language |
| `answer` | `A`, `B`, `C` or `D` in the printed option order (D-032) |
| `difficulty` | `easy` / `medium` / `hard` → `eloSeed` 1100 / 1200 / 1300 (D-049) |
| `image` | Optional pack-relative asset name; not used in v1 |
| `status` | `draft`, `verified` or `rejected` |
| `verified_at` | ISO timestamp set when the founder verifies the row |

Only `verified` rows are packed. A `draft` may be incomplete: its issues are
shown as warnings. A `verified` row must be complete — English and Hindi, four
distinct options, a source URL, a difficulty and a verification time — or the
build fails. A blank or duplicate `id`, an unknown `status`, or two rows with
the same English question (ignoring case, punctuation and spacing) is always an
error on a verified row and a warning while both rows are drafts.

## Batch 1 rules (D-077)

- All 60 rows are `source_type = practice`: standard static facts, not claimed
  as questions from a specific SSC paper. Do not mark a row `PYQ` unless the
  exam, year and paper are actually checked.
- Each row cites an official portal: the Constitution spotlight on
  `india.gov.in` for Polity, IGNCA or the Archaeological Survey of India for
  History, and the physical-features page on `india.gov.in` or the Survey of
  India for Geography. Step 11 tightens this: a new approval needs a
  `source_ref` and a deep link, not a portal front page (D-082).
- English and Hindi are authored together. The Hindi is not a later
  translation, so terminology stays consistent across the bank.
- Options are not shuffled (D-032): the correct option sits where the author
  put it, and `answer` names that printed position.
- `verified_at` records when the author checked the row against its source. A
  founder review that rejects a row flips it to `rejected` or fixes it with a
  version bump, not a silent edit.
- `validate` prints progress per subtopic. Use `--verbose` to see every
  warning on a draft.

## Batch 2 rules (D-078)

- 300 rows are `status=draft`, 25 each in `polity-constitution-basics`,
  `polity-union-executive`, `polity-parliament`, `polity-judiciary`,
  `polity-federalism-local`, `history-medieval-india`, `history-modern-india`,
  `history-national-movement`, `history-art-culture`,
  `geography-physical-india`, `geography-rivers-lakes` and
  `geography-climate-soils-agriculture`.
- IDs use the assigned-once prefixes `polity-const`, `polity-exec`,
  `polity-parl`, `polity-jud`, `polity-fed`, `history-medieval`,
  `history-modern`, `history-national`, `history-art`, `geography-physical`,
  `geography-rivers` and `geography-climate`, numbered `0001..0025`. Do not
  renumber a row; a correction bumps `v` instead.
- Every row is bilingual `practice` content with four distinct options, an
  explanation in each language, a difficulty and an official portal link
  (`india.gov.in`, `sansad.in`, `main.sci.gov.in`, `presidentofindia.nic.in`,
  `panchayat.gov.in`, `ignca.gov.in`, `asi.nic.in`, `nationalarchives.nic.in`,
  `amritmahotsav.nic.in`, `mausam.imd.gov.in` or `surveyofindia.gov.in`).
- Correct answers were rotated to position `index % 4` when the batch was
  authored, so the letters cycle A/B/C/D. This is a static arrangement, not
  runtime shuffling (D-032); `answer` still names the printed position.
- Drafts are not packed until the founder verifies them. Do not edit
  `status`/`verified_at` by hand for a reviewed row; export a sheet, mark a
  decision and run `content:promote` (D-079). Then rebuild the bundled pack.
- Batch 2 is checked for duplicate English questions against itself and against
  all 60 verified rows. `validate` repeats that check on every run.

## Review and promotion (D-079 to D-083)

Do not edit `status` or `verified_at` by hand for a reviewed row. The sheets
are the audit trail and `promote` is the only writer.

1. Export the English slice and the Hindi sheet:

   ```sh
   npm run content:review -- --status draft --out content/review/draft-review.csv
   npm run content:review -- --status draft --subtopic polity-parliament \
     --out content/review/polity-parliament.csv --force
   npm run content:review -- --lang hi --out content/review/hindi-review.csv
   ```

   `--status` is `draft` (English default), `verified`, `rejected` or `all`
   (Hindi default). A sheet that already exists is kept unless you pass
   `--force`. `--carry <old.csv>` copies a previous decision onto the new export
   only when that row's `content_hash` is unchanged.

2. Fill `decision` with `approve`, `reject` or `fix`. Leave it blank to defer.
   `reject` and `fix` need a short `note`; `approve` does not. In the Hindi
   sheet, fill `hi_check` with `ok` or `fix`; `fix` needs a `hi_note`.

3. Apply it:

   ```sh
   npm run content:promote -- --review content/review/draft-review.csv \
     --hindi content/review/hindi-review.csv \
     --subtopic polity-parliament --at 2026-11-07T00:00:00.000Z
   ```

   - `approve` → `status=verified`, `verified_at` stamped. It requires a
     `content_hash` that matches both sheet and master, a non-empty
     `source_ref`, an `https://` `source_url` that is not a portal front page,
     and a Hindi row marked `hi_check=ok` whose translation hash matches.
   - `reject` → `status=rejected`, `verified_at` cleared; no Hindi or source
     needed because nothing ships.
   - `fix` and blank → row untouched; `fix` notes print as a queue.
   - Any content edit after export — question, option, explanation, source or
     Hindi — invalidates the hash and the sheet is refused; re-export instead of
     editing the master to match.
   - `--dry-run` prints the summary without writing. Promotion validates the
     whole master first and writes atomically.

4. Rebuild the pack as a separate step, then commit the master, the review
   sheets and the lock together. Promotion never rebuilds on its own.

## Source and duplicate audits (D-082, D-083)

Both reports are advisory: they tell the reviewer where to look and never block
a promotion.

```sh
npm run content:sources -- --status all --out content/review/sources-review.csv --force
npm run content:dupes -- --out content/review/dupes-review.csv --force
```

- `content:sources` flags a missing `source_ref`, a missing or non-https
  `source_url`, and a front-page URL (bare domain, `index`/`default`/`home`
  page, or a bare language landing page). A query string or a deeper path counts
  as a specific page.
- `content:dupes` compares the English question and explanation by token
  overlap (Jaccard) inside one section, default threshold 0.55, and scores the
  answer text too. Rejected rows are hidden unless `--include-rejected`. The
  four known repeats (Thar Desert, Indira Point, Tropic of Cancer, Chilika) are
  marked `reject` in `draft-review.csv`; they stay drafts in the master until
  their sub-topic is promoted, so they never ship.

## Commands

```sh
# Check structure and see what still needs work
npm run content:validate
npm run content:validate -- --input content/sample/questions.csv --verbose

# Review and promote a slice (D-079 to D-083)
npm run content:review -- --status draft --out content/review/draft-review.csv
npm run content:review -- --lang hi --out content/review/hindi-review.csv
npm run content:promote -- --review content/review/draft-review.csv \
  --hindi content/review/hindi-review.csv --subtopic polity-parliament
npm run content:sources -- --status all --out content/review/sources-review.csv
npm run content:dupes -- --out content/review/dupes-review.csv

# Generate the signing key once, outside this repository
npm run content:keygen -- --out ../cgl-keys

# Build packs + manifest.json into content/dist
npm run content:build -- \
  --key ../cgl-keys/ed25519-private.pem \
  --url-base https://cdn.example.com/packs
```

On PowerShell, put the command on one line or use a backtick instead of `\`.

`CGL_SIGNING_KEY` and `CGL_PACK_URL_BASE` can replace `--key` and `--url-base`.
`--generated-at <iso>` makes the manifest timestamp reproducible. The private
key must never be committed; the public key is safe to ship and is pinned in
`src/sync/contentPublicKey.ts`.

## Bundled pack (D-059)

The pack that ships inside the APK is built into `public/packs/`, with its lock
at `content/bundled.lock.json`:

```sh
npm run content:build -- --out public/packs \
  --lock content/bundled.lock.json --key ../cgl-keys/ed25519-private.pem \
  --url-base https://cdn.cglgkmaster.app/packs \
  --generated-at 2026-11-07T00:00:00.000Z
```

The default input is `content/master/questions.csv`. Pass
`--input content/sample/questions.csv` only when demonstrating the pipeline.

Vite copies `public/packs/` into `dist/packs/` on every build. On launch the app
fetches `./packs/manifest.json`, verifies the signature with the pinned key,
checks each pack's SHA-256 and validates every question before writing it to
IndexedDB. Rebuild the bundled pack whenever its questions change, and use the
same signing key the app pins; rotating the key requires an app update.

## Build output

```
content/dist/
  <subtopic>-v<version>-<sha256-prefix>.json
  manifest.json
```

`manifest.json` is signed with Ed25519 over the canonical JSON of
`{ version, generatedAt, packs }` (D-050). `shared/canonicalJson.ts` is the same
implementation the app will use. A pack's URL contains the hash of its bytes, so
a changed file can never be served from a stale CDN cache.

## Corrections

Keep the `id`, bump `v`, fix the text or key, and re-verify. The next build
moves that pack's version and the app re-grades past attempts on the next sync
(F6). Never reuse the id of a retired question.

## Guard tests

`npm test` runs two checks on this directory: `tests/tools/masterFile.test.ts`
validates the real master (currently at least 60 verified and 300 draft rows
across the 15 sub-topics), and `tests/sync/bundledPack.test.ts` verifies the
signature on `public/packs/manifest.json` with the pinned key and installs all
three packs. Rebuild `public/packs/` and update `bundled.lock.json` whenever the
set of verified rows changes — adding drafts does not change the pack, so batch
2 left both untouched.
