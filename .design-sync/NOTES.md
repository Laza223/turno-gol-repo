# design-sync NOTES — TurnoGol

TurnoGol is a Next.js **app**, not a published component library, so the sync runs the
package shape in a non-standard way. Read this before any re-sync.

## Build pipeline (order matters)

1. **`node .design-sync/fetch-fonts.mjs`** — only if `.design-sync/fonts/*.woff2` are missing
   (they are committed, so normally skip). Pulls Inter/Archivo/Sora (latin) from Google Fonts.
2. **Compile the static Tailwind CSS** (cfg.cssEntry is a *generated* file, gitignored):
   ```
   cat .design-sync/ds-font-vars.css src/app/globals.css > .design-sync/.cache/ds-input.css
   pnpm dlx @tailwindcss/cli@4.3.2 -c .design-sync/tailwind.ds.config.cjs \
     -i .design-sync/.cache/ds-input.css -o .design-sync/.cache/ds-tailwind.css
   ```
   **Cambió el 2026-09-11**: hasta junio esto era `./node_modules/.bin/tailwindcss`, pero
   Tailwind 4 no publica binario de CLI — `tailwindcss@4.3.2` tiene `bin: null` y el que lo trae
   es el paquete aparte `@tailwindcss/cli`. Va con `pnpm dlx` a propósito, para no sumarle una
   dependencia al árbol de la app por una herramienta que solo usa este pipeline.
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

Playwright 1.59.1 + chromium-1217 are used (installed into `.ds-sync`).
`playwright-core@1.59.1` in the repo pins rev 1217.

El binario que hace falta es el **headless shell**, no el chromium completo, y la caché de
`%LOCALAPPDATA%/ms-playwright` se limpia sola cuando el resto del repo actualiza Playwright (el
2026-09-11 tenía 1228 y 1234, ya no 1217). Si `package-validate` dice `[RENDER_SKIPPED] …
Executable doesn't exist`, se baja con el CLI **de `.ds-sync`**, que es el que pinea la revisión:

```
cd .ds-sync && node node_modules/playwright-core/cli.js install chromium-headless-shell
```

## Known render warns

- **Combobox** preview shows only the CLOSED state. The dropdown/listbox opens on click and
  cannot render in a static screenshot — graded `good` on the resting state. Not a regression.
- Before previews were authored, `[RENDER_BLANK] Input.html` fired (floor card = empty input).
  Resolved by authoring the preview; should not recur.

## Ampliación del 2026-09-11 (14 → 30 componentes)

Para que Claude Design pueda rediseñar Hoy, Grilla y Configuración sin inventar la mitad de la UI,
entraron las 14 primitivas que esas tres pantallas usan de verdad (medidas con un grep de sus
imports) más `PageHeader` y `StatCard`, que llevan TODAS las pantallas del panel.

- **El pipeline no descubre nada solo**: sincroniza exactamente lo que exporta `ds-entry.tsx`. Un
  componente que existe en `src/components/ui/` pero no está en el barrel no aparece, y el build
  no avisa — solo imprime `components: N`. Por eso quedaron 14 durante tres meses mientras la
  carpeta crecía a 31.
- `PageHeader` y `StatCard` viven en `src/components/admin/`, fuera de `cfg.srcDir`: entran por
  `componentSrcMap`, que agrega además de pinear (`source-kit.mjs:83`).
- **`guidelinesGlob` ahora es un array** con MASTER + la gramática de interacción + cuatro specs
  de pantalla. Antes era solo MASTER, así que el agente de diseño no tenía la anatomía de ninguna
  vista.
- **Los previews enseñan vocabulario.** El de `Badge` decía "Pendiente", "Cancelada" y "Nueva" —
  tres términos que la auditoría de coherencia eliminó — y era lo primero que leía el agente. Al
  tocar un preview, revisar que las palabras sean las que usa el panel hoy.
- Un preview cuyo componente recibe las clases por prop (`SegmentedControl.itemClassName`) se ve
  como texto pelado si no se las pasás: copiá las reales del uso en la app.

### El `projectId` del config apuntaba a un proyecto muerto

El 2026-09-11, al subir por primera vez desde junio: `get_project` sobre el id que pineaba
`config.json` (`56adfd6f…`) devolvió **404**, y `list_projects` mostró un único proyecto escribible
(`55246162…`, TurnoGol, design system) que estaba **vacío**. O sea que la subida de junio nunca
llegó a destino: lo que NOTES.md describía como "el primero se desvaneció y se repinó al vivo"
terminó con el id equivocado igual.

Moraleja para el próximo re-sync: **antes de armar el plan, `list_projects` y `get_project` contra
el id del config**. Si da 404, no recrear a ciegas — puede haber un proyecto vivo con el mismo
nombre, y crear otro deja dos con la misma cara.

### Las categorías de los grupos se escriben en INGLÉS

El panel de Design System agrupa por la carpeta que sale de `category:` en los stubs de
`.design-sync/groups/`. Junio dejó cinco en inglés (Actions, Brand, Feedback, Forms, Overlays); la
primera tanda del 2026-09-11 agregó otras en español y quedaron **`forms/` y `formularios/` como
dos secciones distintas**, más `navegaci-n/` (la `ó` se transformó en guión al hacer el slug).

Las nueve vigentes: **Actions, Admin, Brand, Data, Feedback, Forms, Guided UX, Layout, Navigation.**
`PageHeader` y `StatCard` caen en `admin/` por su ruta de origen (`src/components/admin/`), no por
su `category:` — el builder gana ahí, y está bien: describe qué son.

### Gotcha: `Coachmark.targetId` no es un `id`

`coachmark.tsx` busca `[data-tour-id="…"]`, no `#id`. Con un target marcado con `id`, `position`
queda en `null` y el componente devuelve `null`: **el globo no se dibuja, sin error ni aviso en
consola**. El render check igual dio la tarjeta por buena, porque el botón target sí renderizaba —
lo agarró la revisión visual de la hoja de contacto, no la máquina. Anotado en su `dtsPropsFor`.

## Re-sync de solo-guías (2026-09-11, después del rediseño de la Grilla)

**No siempre hace falta el pipeline de 4 pasos.** El rediseño de la Grilla no tocó un solo archivo
de `src/components/ui/` ni de `src/components/admin/`, ni `globals.css`, ni `tailwind.config.ts` —
o sea que `_ds_bundle.js`, `_ds_bundle.css`, los `_preview/*.js` y las tarjetas seguían siendo
correctos. Lo único desactualizado eran las guías.

Camino corto, y el que conviene por defecto cuando el diff no toca las fuentes sincronizadas:

1. `list_projects` + `list_files` — confirmar que el proyecto está vivo Y poblado. Ojo: el
   `updatedAt` que devuelve `list_projects` quedó en 2026-06-25 aunque la subida de septiembre sí
   entró. **No usar `updatedAt` para decidir si hay que re-subir**; usar `list_files`.
2. `finalize_plan` con los 6 paths de `guidelines/**` (acepta `deletes: []`, pero el campo es
   obligatorio: sin él tira `finalize_plan requires: deletes`).
3. `write_files` con `localPath` relativo al `localDir` — el contenido no pasa por el contexto del
   modelo.
4. `get_file` de una de las guías para verificar que el contenido nuevo llegó. `written: N` es la
   respuesta del servidor, no prueba de contenido.

Regla para decidir: si `git diff` contra la última subida toca `src/components/ui/`,
`src/components/admin/` (los del `componentSrcMap`), `.design-sync/previews/`, `ds-entry.tsx`,
`globals.css` o `tailwind.config.ts` → pipeline completo. Si solo toca `guidelinesGlob` → camino corto.

**El worktree no sirve para el pipeline completo**: `.ds-sync/` y `.design-sync/.cache/` son
gitignored y viven solo en el checkout principal. El camino corto sí anda desde cualquier worktree,
porque `write_files` lee los `.md` del disco y nada más.

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
