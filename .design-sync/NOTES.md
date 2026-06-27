# design-sync NOTES — TurnoGol

TurnoGol is a Next.js **app**, not a published component library, so the sync runs the
package shape in a non-standard way. Read this before any re-sync.

## Build pipeline (order matters)

1. **`node .design-sync/fetch-fonts.mjs`** — only if `.design-sync/fonts/*.woff2` are missing
   (they are committed, so normally skip). Pulls Inter/Archivo/Sora (latin) from Google Fonts.
2. **Compile the static Tailwind CSS** (cfg.cssEntry is a *generated* file, gitignored):
   ```
   cat .design-sync/ds-font-vars.css src/app/globals.css > .design-sync/.cache/ds-input.css
   ./node_modules/.bin/tailwindcss -c .design-sync/tailwind.ds.config.cjs \
     -i .design-sync/.cache/ds-input.css -o .design-sync/.cache/ds-tailwind.css
   ```
   Re-run this whenever a `.design-sync/previews/*.tsx` adds new utility classes, BEFORE the
   bundle rebuild — the content scan covers `src/components/ui/**` + `.design-sync/previews/**`.
3. **`node .design-sync/build-dist.mjs`** — pre-compiles the barrel (`ds-entry.tsx`) to ESM with
   `jsx: automatic`. Only needed when a synced component's SOURCE changes (not for preview edits).
4. **`node .ds-sync/package-build.mjs --config .design-sync/config.json --node-modules ./node_modules --entry ./.design-sync/.cache/ds-dist.mjs --out ./ds-bundle`**

## Why the pre-compile (build-dist.mjs) exists

8 of the 14 ui components import only named hooks (no `import * as React`). esbuild's default
**classic** JSX transform emits `React.createElement` with no React in scope → runtime crash.
`package-build`'s `bundleToIife` doesn't expose a jsx option and must not be forked, so the barrel
is pre-bundled with the AUTOMATIC runtime (react* external → package-build's react shim wires
`window.React`). `--entry` then points at that pre-built ESM.

## Gotchas already solved (do not re-debug)

- **Combobox default export**: `combobox.tsx` is `export default` — `export *` would drop it. The
  barrel re-exports it as `{ default as Combobox }`.
- **`next/link` + `@sentry/nextjs`**: not browser-safe. Stubbed via `.design-sync/stubs/*` wired
  through `cfg.tsconfig` paths and `build-dist.mjs`'s alias plugin.
- **ASCII-clean bundle**: `combobox.tsx`'s accent-strip regex `/[̀-ͯ]/g` (combining marks) ships as
  raw UTF-8 bytes — esbuild's ascii charset escapes strings but NOT regex literals. `build-dist.mjs`
  has an `onLoad` that escapes that range to `/[̀-ͯ]/g`. Without it, the
  `[BUNDLE_EXPORT]` smoke check (charset-less `setContent`) decodes it as Latin-1 and the whole
  IIFE throws `Invalid regular expression … Range out of order`.
- **Toaster** is exported in the bundle but intentionally NOT a card (it renders blank statically —
  it's a hook-driven container). The Toast card shows the toast visual instead.
- **Grouping**: all 14 live flat in `src/components/ui/`, so groups come from frontmatter-only
  category stubs in `.design-sync/groups/<Name>.md` (cfg.docsDir). Empty body → synthesized
  `.prompt.md` is preserved.
- **guidelinesGlob** is pinned to `docs/spec/design-system/MASTER.md`; the default globs pulled in
  unrelated `docs/*.md` (audit_report, infraestructura, README, walkthrough).

## Render check

Playwright 1.59.1 + chromium-1217 are used (installed into `.ds-sync`, browser already cached at
`%LOCALAPPDATA%/ms-playwright/chromium-1217`). `playwright-core@1.59.1` in the repo pins rev 1217.

## Known render warns

- **Combobox** preview shows only the CLOSED state. The dropdown/listbox opens on click and
  cannot render in a static screenshot — graded `good` on the resting state. Not a regression.
- Before previews were authored, `[RENDER_BLANK] Input.html` fired (floor card = empty input).
  Resolved by authoring the preview; should not recur.

## Re-sync risks (watch list)

- **cfg.cssEntry + cfg.entry are generated, gitignored files** (`.design-sync/.cache/`). A fresh
  clone MUST run steps 2–3 above before package-build, or the build fails on a missing cssEntry/entry.
- **dtsPropsFor is hand-written** from the component sources (no `.d.ts` in the app). If a component's
  props change, its `dtsPropsFor` entry in config.json will silently go stale — re-derive on re-sync.
- **Brand fonts are pinned woff2** fetched from Google Fonts; refresh via fetch-fonts.mjs if families change.
- **lucide-react is `^1.11.0`** (unusual major) — icon name availability differs from current lucide;
  previews avoid named icons where possible (inline SVG illustrations instead).
- **SubmitButton needs a react-dom `useFormStatus` shim** (`build-dist.mjs`): the vendored UMD
  react-dom 18.3.1 in the preview runtime omits `useFormStatus`, so the component crashed to a
  blank card. The shim delegates to the host's real hook when present (production) and falls back
  to `{pending:false}` otherwise — scoped to `submit-button.tsx` only.
- **The first created project vanished** server-side between create and first write (HTTP 404).
  Recreated as a fresh project; `cfg.projectId` now points at the live one. If a re-sync hits a 404
  on the pinned project, recreate and re-pin (the upload is idempotent).
- **Tailwind safelist** in `tailwind.ds.config.cjs` ships the semantic-token + common
  layout/brand utilities (designs receive only this static CSS — no ambient Tailwind). If the
  conventions header documents a class, it must be covered by the content scan OR the safelist.
