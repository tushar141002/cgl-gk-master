# Content master (Step 3)

The master CSV is the authoring source. The build turns verified rows into
signed question packs; nothing here ships directly.

- `master/questions.csv` — the real bank. It starts with just the header.
- `sample/questions.csv` — four fake rows used to exercise the pipeline.
- `packs.lock.json` — created by the first real CDN build; commit it so pack
  versions and hashes survive between builds.
- `bundled.lock.json` — lock for the pack shipped inside the APK; the build
  writes both the lock and the signed files under `public/packs/` (D-059).

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
| `en_*` / `hi_*` | Question, four options and explanation per language |
| `answer` | `A`, `B`, `C` or `D` in the printed option order (D-032) |
| `difficulty` | `easy` / `medium` / `hard` → `eloSeed` 1100 / 1200 / 1300 (D-049) |
| `image` | Optional pack-relative asset name; not used in v1 |
| `status` | `draft`, `verified` or `rejected` |
| `verified_at` | ISO timestamp set when the founder verifies the row |

Only `verified` rows are packed. A `draft` may be incomplete: its issues are
shown as warnings. A `verified` row must be complete — English and Hindi, four
distinct options, a source URL, a difficulty and a verification time — or the
build fails. A blank or duplicate `id`, or an unknown `status`, is always an
error.

## Commands

```sh
# Check structure and see what still needs work
npm run content:validate
npm run content:validate -- --input content/sample/questions.csv --verbose

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
npm run content:build -- --input content/sample/questions.csv --out public/packs \
  --lock content/bundled.lock.json --key ../cgl-keys/ed25519-private.pem \
  --url-base https://cdn.cglgkmaster.app/packs \
  --generated-at 2026-11-07T00:00:00.000Z
```

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
