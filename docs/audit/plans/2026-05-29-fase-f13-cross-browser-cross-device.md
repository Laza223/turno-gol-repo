# Plan — Fase F13 Cross-Browser + Cross-Device

**Fecha:** 2026-05-29
**Branch:** `audit/frontend-f13`
**Worktree:** `../TurnoGol-audit-f13`
**Base:** `main` @ `980c12b` (Merge audit/frontend-f12)
**Criticidad:** 🟡 Media — MASTER_PLAN líneas 231-234
**Tiempo estimado:** 1 sesión

## Scope (MASTER_PLAN literal)

**Objetivo:** Funciona donde tus usuarios viven.

**Done-criteria:**
1. Smoke manual en Chrome desktop, Safari Mac, Safari iOS real, Chrome Android real, Firefox.
2. Browsers soportados documentados.

**Note:** "Smoke manual" requiere humano. F13 entrega: (a) la matriz de browsers soportados documentada, (b) el harness automatizable (Playwright multi-browser projects + smoke specs), (c) un checklist humano por browser, (d) fixes proactivos a feature detection gaps que el investigator cazó. La ejecución de smoke real (clickar en device físico iPhone, abrir Safari Mac, etc.) se ejecuta post-merge por Lázaro.

## Resumen de hallazgos del investigator

El investigator (read-only) mapeó 17 secciones del surface cross-browser. Hallazgos NOTABLE:

| # | Hallazgo | Impacto | Fix en F13 |
|---|----------|---------|------------|
| 1 | `darkMode: ['class']` en tailwind.config.ts sin uso real (0 clases `dark:`) | Vestigial, no afecta browsers | NO (backlog) |
| 2 | NO existe fallback `min-h-screen`/`max-h-screen` paralelo a `min-h-dvh`/`max-h-[90svh]` para Safari <15.4 | Target ≥15.4 explícito mitiga; ~22 instancias `dvh` + 1 `svh` | NO (documentar target ≥15.4) |
| 3 | `navigator.clipboard.writeText` en `onboarding-checklist.tsx:44` SIN feature detection | Safari iOS Private Mode o HTTP context → throw uncaught | ✅ T4 |
| 4 | Manifest icons insuficientes (solo 32×32 + 180×180) — Android necesita 192/512 maskable | iOS Safari "Add to Home" funciona; Android "Install app" prompt no disparado | ✅ T3 |
| 5 | Falta meta `apple-mobile-web-app-capable` en `layout.tsx` | iOS Safari NO promociona PWA install confiablemente → bloquea Web Push iOS 16.4+ (F9) | ✅ T3 |
| 6 | Badge/icon en SW notifications apuntan a `/favicon.ico` (32×32) — debería ser 96×96 monocromático | Notificaciones nativas iOS/Android usan default si fail | NO (cosmetic, backlog) |
| 7 | Playwright projects sin `webkit`, `firefox`, `mobile-safari` (iPhone) | 0 cobertura automatizada cross-browser | ✅ T2 |
| 8 | `type="tel"` SIN `inputMode="tel"` en 3 sitios (StepIdentity, register, ProfileForm) | Mobile keyboard default QWERTY en algunos browsers | ✅ T4 |
| 9 | `type="number"` SIN `inputMode` en 4 sitios (settings/reservas) | Mobile keyboard subóptimo | ✅ T4 |
| 10 | `frame-src *.mercadopago.com` CSP existe pero MP usa top-level redirect (no iframe) | Innecesaria pero inocua | NO (no tocar CSP B-prefijo) |
| 11 | NO browserslist declarado — Next.js + autoprefixer usan default | Sin documento explícito de soportados | ✅ T1 |
| 12 | `toLocaleDateString('en-CA', { timeZone })` en 2 lugares — Safari <14 buggy | Target ≥14 mitiga | NO (target ≥14 documentado) |
| 13 | SW `new BroadcastChannel(...)` SIN feature detect dentro del SW | Safari iOS 16.4+ tiene BC dentro de SW context; bajo riesgo | NO (target ≥16.4 para push) |

**Cobertura existente reusable F1-F12:**
- F9 PushNotificationManager YA tiene feature detection cliente (Notification + serviceWorker + PushManager + BroadcastChannel)
- F10 viewport meta export con `viewportFit:'cover'` + `maximumScale:5`
- F11 axe-core suite project axe-audit
- F11 skip-to-content link + focus-visible
- F12 useReportWebVitals → Sentry web-vitals (tracking rating='poor' post-deploy permitirá detectar browsers problemáticos)
- F2 worker fixtures `adminStorageState`, `playerStorageState`, `freshAdminStorageState` (T2 los reusa)

## Browsers target (matriz)

| Browser | Min version | Caveats |
|---------|-------------|---------|
| Chrome desktop (Win/Mac/Linux) | 108+ | Full support, target principal |
| Chrome Android | 108+ | PWA install via beforeinstallprompt opcional |
| Firefox desktop | 115 ESR / latest 2 | Web Push VAPID estándar; sin `env(safe-area-inset-*)` (degrade a 0px ✓) |
| Safari macOS | 15.4+ | `svh`/`lvh`/`dvh` OK desde 15.4; BroadcastChannel OK desde 15.4 |
| Safari iOS | 15.4+ | Web Push requiere 16.4+ Y PWA installed (Add to Home Screen); `svh`/`lvh`/`dvh` OK desde 15.4 |
| Edge desktop | latest 2 | Chromium-based, mismo soporte que Chrome |

**Out-of-scope explícito:** IE 11 (EOL Microsoft 2022), Chrome <108, Safari <15, Firefox <115, Opera Mini.

## Tasks

### T1 — Browserslist explícito + doc browser-support.md

**Goal:** Documentar browsers soportados (done-criterion #2) + declarar browserslist explícito para Next.js + autoprefixer.

**Files:**
- **modify** `package.json` — agregar field `browserslist` con la matriz de arriba traducida a sintaxis browserslist:
  ```json
  "browserslist": {
    "production": [
      ">0.5%",
      "last 2 Chrome versions",
      "last 2 Firefox versions",
      "Firefox ESR",
      "last 2 Safari versions",
      "last 2 iOS versions",
      "last 2 ChromeAndroid versions",
      "Edge >= 108",
      "not dead",
      "not op_mini all",
      "not IE 11"
    ],
    "development": [
      "last 1 Chrome version",
      "last 1 Firefox version",
      "last 1 Safari version"
    ]
  }
  ```
- **create** `docs/browser-support.md` (~150-200 líneas) con:
  - Tabla matriz Browser × Min version × Notes
  - Out-of-scope (IE, Chrome <108, etc.)
  - Features con caveats (Web Push iOS PWA-only, `svh`/`lvh`/`dvh` ≥15.4, `env(safe-area-inset-*)` Safari only, BroadcastChannel ≥15.4)
  - Smoke checklist humano por browser (Chrome desktop, Safari Mac, Safari iOS, Chrome Android, Firefox) con steps numerados (login, navegar grilla, crear booking, abrir modal, ver realtime, etc.)
  - Criterios de "soportado" (degrade gracefully vs broken)
  - Sección "Cómo correr smoke" con instrucciones para Lázaro

**Tests:** ninguno nuevo (config + doc).

**Verification:** `pnpm typecheck` + `pnpm lint` + `pnpm build` (next reads browserslist; should NOT throw).

**Commit prefix:** `audit(f13): T1 — browserslist explícito + docs/browser-support.md`

### T2 — Playwright projects multi-browser + smoke specs cross-browser

**Goal:** Agregar `webkit` + `firefox` + `mobile-safari` (iPhone) projects a Playwright. Crear smoke spec que corre en TODOS los projects para detectar regresión cross-browser.

**Files:**
- **modify** `playwright.config.ts` — agregar 3 projects nuevos:
  - `webkit` (Desktop Safari-like, `...devices['Desktop Safari']`, `testMatch: /cross-browser\/.*\.spec\.ts$/`)
  - `firefox` (`...devices['Desktop Firefox']`, `testMatch: /cross-browser\/.*\.spec\.ts$/`)
  - `mobile-safari` (`...devices['iPhone 14']`, `testMatch: /cross-browser\/.*\.spec\.ts$/`)
  - Actualizar `chromium` `testIgnore` para incluir `cross-browser`: `/(mobile|a11y|cross-browser)\/.*\.spec\.ts$/`
  - Mantener `mobile-chrome` + `axe-audit` intactos
- **create** `tests/e2e/cross-browser/public-smoke.spec.ts` (~80 líneas) — corre en TODOS los projects multi-browser:
  - Public landing `/` carga (`<h1>` visible, no console errors críticos)
  - Search `/explorar` carga + selector funciona
  - Tenant portal `/c/{slug-test}` carga (usa tenant E2E ya seedeado)
  - Assertion: `bodyScrollWidth <= viewportWidth + 1` (no horizontal scroll accidental)
- **create** `tests/e2e/cross-browser/login-smoke.spec.ts` (~60 líneas) — public path NO auth needed:
  - `/login` carga, input `type=email` visible y enfocable
  - Submit con email vacío NO navega (HTML5 validation o server error)
  - Skip-to-content link present (F11 cross-browser regression)
- **create** `tests/e2e/cross-browser/README.md` (~30 líneas) — explica:
  - Cómo correr: `pnpm playwright install webkit firefox` (one-time) + `pnpm test:e2e:cross-browser`
  - Qué cubre vs qué requiere humano (Safari iOS real device, Web Push install flow)
  - Por qué NO cubre admin auth flows: storage state es Chromium-specific (auth via Supabase ServerActions), reusable a webkit/firefox no requiere Playwright trick adicional; pero para simplicity F13 mantiene cross-browser specs en public path no-auth (smoke focused, not full coverage)
- **modify** `package.json` scripts — agregar:
  - `"test:e2e:cross-browser": "playwright test --project webkit --project firefox --project mobile-safari"`

**Tests:**
- 2 specs nuevos `tests/e2e/cross-browser/{public-smoke,login-smoke}.spec.ts`
- Por design, no requieren auth (público) — corren sin seed completo, solo necesitan `pnpm dev` running.

**Verification:**
- `pnpm typecheck` + `pnpm lint` + `pnpm test` (no afecta unit suite)
- `pnpm playwright test --list --project webkit --project firefox --project mobile-safari` debe listar specs OK
- Ejecución real DELEGADA (requiere `pnpm playwright install webkit firefox` + Supabase + `pnpm dev`)

**Commit prefix:** `audit(f13): T2 — Playwright webkit/firefox/mobile-safari projects + cross-browser smoke specs`

### T3 — Apple PWA meta tags + manifest icons completos

**Goal:** Habilitar Safari iOS PWA install confiable (dependencia F9 Web Push iOS 16.4+) + Android Install App prompt disparado.

**Files:**
- **modify** `src/app/layout.tsx` (+~8 líneas en `metadata`):
  - `appleWebApp: { capable: true, statusBarStyle: 'default', title: 'TurnoGol' }` (Next.js 14 genera meta tags `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title` automáticamente desde este field)
- **modify** `src/app/manifest.ts`:
  - Agregar icon 192×192: `{ src: '/icon-192', sizes: '192x192', type: 'image/png', purpose: 'any' }`
  - Agregar icon 512×512: `{ src: '/icon-512', sizes: '512x512', type: 'image/png', purpose: 'any' }`
  - Agregar maskable 512×512: `{ src: '/icon-512-maskable', sizes: '512x512', type: 'image/png', purpose: 'maskable' }`
  - Mantener `{ src: '/icon', sizes: '32x32' }` y `{ src: '/apple-icon', sizes: '180x180' }` actuales
  - Agregar `categories: ['sports', 'business', 'productivity']`
  - Agregar `orientation: 'portrait'`
- **create** `src/app/icon-192.tsx` — reusar Next.js `ImageResponse` pattern de `src/app/icon.tsx` con size 192×192 emerald
- **create** `src/app/icon-512.tsx` — idem 512×512
- **create** `src/app/icon-512-maskable.tsx` — variant con safe zone padding 10% para Android maskable (icon centered ~80% del canvas)

**Tests:**
- **create** `tests/unit/metadata-apple-pwa.test.ts` (~40 líneas) — import `metadata` y `viewport` de `src/app/layout.tsx`, assert:
  - `metadata.appleWebApp.capable === true`
  - `metadata.appleWebApp.statusBarStyle === 'default'`
  - `metadata.appleWebApp.title === 'TurnoGol'`
- **create** `tests/unit/manifest-icons.test.ts` (~40 líneas) — import `manifest` from `src/app/manifest.ts`, call, assert:
  - Tiene icon 192×192 con purpose 'any'
  - Tiene icon 512×512 con purpose 'any'
  - Tiene icon 512×512 con purpose 'maskable'
  - `categories` incluye 'sports'
  - `orientation === 'portrait'`
  - Mantiene 32×32 y 180×180 (regression guard)

**Verification:** typecheck + lint + test. Build no requiere ImageResponse en este test (genera on-demand).

**Commit prefix:** `audit(f13): T3 — Apple PWA meta + manifest icons 192/512/maskable`

### T4 — Feature detection fixes (clipboard + inputMode)

**Goal:** Cazar 3 feature-detection gaps que el investigator marcó NOTABLE.

**Files:**

**4.1 Clipboard fallback** — `src/components/dashboard/onboarding-checklist.tsx`:
- Línea 43-50 `handleCopyLink` — actual: `await navigator.clipboard.writeText(publicUrl)` sin guard. Safari Private Mode o HTTP context → throw uncaught → cosmetic loss + Sentry crashes.
- Fix: try/catch + feature detect. Si fails → `prompt(publicUrl)` (mismo comportamiento que `document.execCommand('copy')` legacy fallback en términos de UX), o toast con texto a copiar manual. Recomendado: usar `useToast()` + describir.
- Pattern:
  ```tsx
  async function handleCopyLink() {
    const canCopy = typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function'
    if (canCopy) {
      try {
        await navigator.clipboard.writeText(publicUrl)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
        if (!state.publicLinkShared) startTransition(() => markPublicLinkSharedAction())
        return
      } catch {}
    }
    // Fallback: prompt user to copy manually
    if (typeof window !== 'undefined') {
      window.prompt('Copiá el enlace público:', publicUrl)
    }
  }
  ```

**4.2 inputMode tel** — 3 archivos:
- `src/app/onboarding/components/StepIdentity.tsx:139` — agregar `inputMode="tel"` después de `type="tel"`
- `src/app/(auth)/register/page.tsx:159` — el `<Field type="tel">` helper. Verificar si `Field` component forwarda `inputMode` prop. Si NO, agregar prop pass-through al helper. **Sub-investigate antes de tocar** (T4 implementer hará).
- `src/app/(player)/perfil/ProfileForm.tsx:82` — agregar `inputMode="tel"` después de `type="tel"`

**4.3 inputMode numeric (settings/reservas)** — `src/app/(admin)/settings/reservas/page.tsx`:
- Línea 87 `depositPercentage` → agregar `inputMode="numeric"` (whole percentage)
- Línea 128 `cancellationHoursBefore` → agregar `inputMode="numeric"`
- Línea 167 `noShowPenaltyThreshold` → agregar `inputMode="numeric"`
- Línea 179 `noShowPenaltyDays` → agregar `inputMode="numeric"`

**Tests:**
- **create** `tests/unit/clipboard-fallback.test.tsx` (~60 líneas) — happy-dom render `<OnboardingChecklist>`:
  - Mock `navigator.clipboard.writeText` → assert called with publicUrl
  - Mock clipboard ausente (delete `navigator.clipboard`) → assert `window.prompt` called (mock prompt → assert call)
  - Mock clipboard `writeText` throws → fallback path (assert `window.prompt` called)
- **create** `tests/unit/input-mode-coverage.test.tsx` (~50 líneas) — render `<StepIdentity>` (con props mínimos) + `<ProfileForm>` (con defaultValues mock):
  - Find phone input → assert `inputMode === 'tel'`
  - For settings/reservas: una test que importa el HTML del componente NO renderiza fácil (server component); en lugar de eso, hacer **unit test sobre regex del archivo** que verifica todo `type="number"` en `src/app/(admin)/settings/reservas/page.tsx` tiene `inputMode=` cerca. Patrón regression guard.

**Verification:** typecheck + lint + test. No requiere browser real.

**Commit prefix:** `audit(f13): T4 — feature detection fixes (clipboard fallback + inputMode tel/numeric)`

### T5 — Verify + report + STATE + prompt F14 + merge

**Goal:** Wrap up F13.

**Steps:**
1. `pnpm typecheck` (worktree F13) — debe estar verde
2. `pnpm lint` (worktree F13) — debe estar verde
3. `pnpm test` (worktree F13) — esperado 566 + nuevos T3+T4. 3 fails pre-existentes (db-client-role-guard + zod-coverage × 2) NO regresión.
4. `pnpm test:integration` (worktree F13) — pre-existente flake idéntico a F12 baseline
5. `pnpm build` (worktree F13) — debe terminar con `✓ Compiled successfully` (sitemap ECONNREFUSED pre-existente F6 sin Supabase es aceptado)
6. Playwright NO se corre (requiere `pnpm playwright install webkit firefox` + `pnpm dev` + Supabase). Verificación: `pnpm playwright test --list --project webkit --project firefox --project mobile-safari` lista las specs.
7. Generar `docs/audit/reports/fase-f13-cross-browser-cross-device-report.md` (house-style F12: header/veredicto, tabla done-criteria con evidencia, trabajo por task, hallazgos, tests nuevos, cambios por archivo, visibilidad humana, stats acumulados 26/26, gaps/deferred, próxima fase F14).
8. Actualizar `docs/audit/STATE.md` (F13 → completed, próxima F14; tabla, stats, backlog, deferidos).
9. **GENERAR EL PROMPT F14** dentro de un code block en la respuesta (estructura idéntica al prompt F13: encabezado + contexto + artifacts F1-F13 + lee primero + skill + scope literal + investigator brief + precauciones + DESPUÉS DE F14 = auditoría completa, no más fases). ANTES de commits finales.
10. Commits con prefijo `audit(f13):` (mensajes en inglés normal). NO commitear `tsconfig.tsbuildinfo`.
11. `git -C main merge --no-ff audit/frontend-f13` + push origin main
12. Cleanup worktree (rm -rf ../TurnoGol-audit-f13 || true; git worktree prune; git branch -d audit/frontend-f13)

**Verification:** `git log main` muestra merge commit `Merge audit/frontend-f13: Fase F13 Cross-Browser + Cross-Device (26/26)`.

**Commit prefix:** `audit(f13): report + STATE update — F13 Cross-Browser + Cross-Device (26/26)`

## Dependencias entre tasks

```
T1 ← T2  (browserslist puede afectar Next config; T2 verifica que Playwright config no rompe)
T3 ← T4  (manifest cambios no afectan inputMode fixes; pero ambos están en client paths)
T2, T3, T4 → T5  (T5 verify+report después de los tres)
```

T1 y T2 pueden ser sequential porque tocan archivos distintos. T3 y T4 también sequentials. NO paralelo (mismo dev controller, mismo worktree).

## Risk register

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| `<Field>` helper no soporta `inputMode` prop pass-through (T4 register) | Media | Bajo (1 archivo más a modificar) | T4 implementer sub-investiga antes de tocar; si helper no soporta, extiende prop |
| ImageResponse fallar en build para icon-192/512 (T3) | Baja | Bajo (existing pattern `icon.tsx` funcionará) | Reusar misma firma. Smoke test build local debe revelar antes de PR |
| Playwright project `webkit` requiere `pnpm playwright install webkit` que no está en CI (T2) | Alta (CI sin browsers) | Bajo (specs typecheck + listing pasan sin browsers; ejecución real es delegada) | Document en README cómo instalar pre-prod; CI smoke test puede skip si browsers absent |
| Manifest icons cambiar URL rompe cache PWA installed (T3) | Baja (sin usuarios prod) | Bajo (pre-launch) | Pre-launch no hay PWA installs; no aplica |
| Browserslist explícito cambia output de autoprefixer rompiendo estilos existentes (T1) | Baja (mismo target que default) | Bajo | Default Next.js es `> 0.5%, last 2 versions, Firefox ESR, not dead` — nuevo target es **superset** (incluye iOS/ChromeAndroid explicit), no debería reducir cobertura. Smoke test build local. |

## Out-of-scope explícito

- **`darkMode: ['class']` vestigial** — backlog v1.5 si feature `prefers-color-scheme` se vuelve requirement
- **`frame-src *.mercadopago.com` CSP cleanup** — no tocar B-prefijo headers, MP changed redirect strategy pero podría reverse en futuro
- **SW badge/icon 96×96 monocromático** — cosmetic, backlog
- **`min-h-screen`/`max-h-screen` fallback para `svh`/`dvh`** — target ≥15.4 documentado mitiga; backlog si surge user con browser viejo
- **Smoke manual real (humano clickando en device físico)** — F13 entrega checklist; ejecución por Lázaro post-merge
- **Safari iOS PWA install UX prompt** — el manager F9 no muestra "Instalá la PWA"; backlog
- **MP iframe Safari iOS testing real** — MP usa top-level redirect ahora; backlog si vuelve a iframe

## Conventional commit format

```
audit(f13): T1 — browserslist explícito + docs/browser-support.md
audit(f13): T2 — Playwright webkit/firefox/mobile-safari projects + cross-browser smoke specs
audit(f13): T3 — Apple PWA meta + manifest icons 192/512/maskable
audit(f13): T4 — feature detection fixes (clipboard fallback + inputMode tel/numeric)
audit(f13): report + STATE update — F13 Cross-Browser + Cross-Device (26/26)
```

Each task commits independently (one commit per task; reviewer fixes are amend-free re-commits with `audit(f13): T<n> fix — <issue>`).
