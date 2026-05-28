# Plan — Fase F6: Public Landing + Search + Portal Complejo (SEO + Performance)

**Fecha:** 2026-05-27
**Branch:** `audit/frontend-f06`
**Criticidad:** 🔴🔴 Alta | **Tiempo estimado:** 1-2 sesiones
**Referencia:** MASTER_PLAN líneas 192-196; user stories US-ONB-005 (página pública del complejo), US-JUG-003 (buscar canchas), US-JUG-004 (favorito — out-of-scope F6).

---

## Goal

Subir el módulo público (landing, search, portal complejo) a estándares de **SEO + Performance** que permitan a los jugadores encontrar los complejos vía Google y que la primera impresión cargue rápido en móvil (3G). El módulo actualmente tiene la funcionalidad básica (rutas, fetch, render) pero le falta toda la capa de discoverability: 0 sitemap, 0 robots, 0 JSON-LD, 0 OpenGraph, 0 manifest, 0 favicon, 3 `<img>` no-optimized, 0 `loading.tsx` por ruta, y el harness Lighthouse no cubre `/explorar` ni `/[slug]`.

**Done-criteria MASTER_PLAN:**
1. Lighthouse SEO 100 (rutas públicas medidas).
2. Lighthouse Performance ≥90 mobile (rutas públicas medidas).
3. Schema.org LocalBusiness validado (en `/[slug]`).
4. Sitemap + robots (dinámicos, cubren todos los slugs).

**Implícito (consistencia con F0/F1/F3):**
- Bundles `<200KB gz` por ruta pública (público es más estricto — usuarios en móvil 3G).
- `loading.tsx` con `Skeleton` por ruta pública (alinea con F4/F5).
- Tests: E2E + integration cubriendo sitemap/robots/JSON-LD/metadata.
- Lighthouse harness honesto (replicar patrón F3, cubrir `/`, `/explorar`, `/[slug]/e2e-complejo-demo`).

---

## Architecture & Tech Stack

- Next.js 14 App Router con Metadata API + `MetadataRoute.Sitemap` + `MetadataRoute.Robots` + `MetadataRoute.Manifest`.
- `next/image` con `images.remotePatterns` para Supabase Storage (logos/covers) + Unsplash (ya configurado).
- `next/font/google` (Inter) ya en uso — sin cambios.
- JSON-LD via `<script type="application/ld+json" dangerouslySetInnerHTML={...}>` en Server Components (NO `next/script` para JSON-LD por overhead).
- Helper `src/lib/seo/structured-data.ts` (nuevo) con builders type-safe para LocalBusiness, BreadcrumbList, Organization, SearchAction, WebSite.
- Lighthouse CI replicando harness F3 (sin auth — más simple que `lighthouse-grilla`).
- Vitest unit + integration; Playwright E2E (delegados a CI).
- shadcn/ui + Tailwind, `Skeleton` reusable F1.

---

## Hallazgos (severidad + módulo)

| # | Hallazgo | Sev | Módulo | Disposición |
|---|----------|-----|--------|-------------|
| H1 | **0 sitemap.ts** — Google no descubre tenants. Sin sitemap, slugs aparecen indexados solo si hay backlinks o si el dueño los envía manualmente. Done-criteria explícito MASTER_PLAN | 🔴 **P0** (done-criteria) | SEO infra | T1 |
| H2 | **0 robots.ts** — sin política de crawling. `/api/*` (sensible) puede ser crawleado, sitemap no anunciado | 🔴 **P0** (done-criteria) | SEO infra | T1 |
| H3 | **0 JSON-LD Schema.org** — sin LocalBusiness en `/[slug]`, los rich results de Google (mapa, horarios, teléfono) no se muestran. Done-criteria explícito | 🔴 **P0** (done-criteria) | SEO data | T3 |
| H4 | **0 OpenGraph** + Twitter Card meta en rutas públicas (solo `title` + `description` generic) — link previews en WhatsApp/Twitter/Facebook salen sin imagen ni descripción rica | 🔴 **P1** (impacta SEO score + conversión social) | SEO meta | T2 |
| H5 | **3 `<img>` no-optimized** en TenantCard + TenantHeader — penaliza Performance Lighthouse (LCP, CLS, no WebP/AVIF). F0 ya marcó 4 warnings, F6 toca 3 de esos | 🟡 **P1** (done-criteria perf) | Perf | T4 |
| H6 | **0 `loading.tsx`** por ruta pública — sin streaming UX. F4/F5 lo establecieron como patrón admin; público es más sensible (móvil 3G, TTI percibido) | 🟡 P2 (consistencia + perf percibida) | Perf | T5 |
| H7 | **0 manifest.json** + 0 favicon + 0 apple-touch-icon — penaliza Lighthouse PWA section + SEO indirectly (no app icon en search results móvil) | 🟡 P2 (Lighthouse SEO completo + branding) | PWA | T1 |
| H8 | **Lighthouse harness no cubre rutas públicas dinámicas** — `lighthouserc.json` solo lista `/`, `/login`, `/register`, `/privacy`, `/terms`. Falta `/explorar` + `/[slug]/e2e-complejo-demo`. Sin esto el done-criteria 1+2 no es medible | 🟡 P1 (verificabilidad) | Perf | T6 |
| H9 | **0 canonical URLs** declaradas — riesgo de duplicate content si Google ve `/[slug]` y `/[slug]/` o variantes con query strings | 🔵 P2 (SEO hygiene) | SEO meta | T2 |
| H10 | E2E ausente para sitemap/robots/JSON-LD/metadata — sin tests, una regresión silenciosa rompe SEO en producción | 🟡 P2 (cobertura) | Tests | T7 |
| H11 | `images.remotePatterns` solo incluye `images.unsplash.com` — al migrar `<img>` a `<Image>` para covers/logos Supabase, deberá agregarse `*.supabase.co` (CSP ya lo permite vía `img-src *.supabase.co`) | 🔵 P3 (gating de T4) | Config | T4 |

**Out-of-scope F6:**
- **Booking flow jugador end-to-end** (US-RES-003/004/005/006) → **F7** (próxima fase, criticidad 🔴🔴🔴 Crítica).
- **Player area** (Mis reservas, perfil, datos, eliminar cuenta) → **F8**.
- **Mapa interactivo** del complejo (US-ONB-005 explícito out-of-scope v1).
- **Distancia + geolocation** en search (US-JUG-003 explícito out-of-scope si no hay opt-in geo).
- **Favorito por jugador** (US-JUG-004, P3 nice-to-have) → diferir.
- **Reviews/calificaciones** (US-ONB-005 explícito out v2).
- **Rate-limit explícito** en `/api/public/*` (la auditoría B7 dejó esto en backlog; CSP + Vercel/CDN edge ya proveen baseline). F6 documenta el gap pero NO lo resuelve.
- **Sentry adelgazamiento** en bundle público — driver del LCP en `/grilla` (F3), pero `/explorar`/`/[slug]` posiblemente bajen el techo sin tocarlo. Diferir a F12 (Performance) que ya lo tiene en scope.

---

## File Structure (cambios previstos)

```
src/app/
├── sitemap.ts                                 [NEW: dynamic, tenants active|trialing]
├── robots.ts                                  [NEW: allow /, /explorar, /[slug]; deny /api privadas]
├── manifest.ts                                [NEW: PWA manifest baseline]
├── icon.tsx (o icon.png en src/app/)          [NEW: favicon generado]
├── apple-icon.tsx (o apple-icon.png)          [NEW: apple-touch-icon]
├── opengraph-image.tsx (o .png)               [NEW: OG default fallback 1200x630]
├── page.tsx                                   [MOD: metadata.openGraph + JSON-LD Organization + SearchAction]
├── layout.tsx                                 [MOD: metadata.metadataBase + alternates.canonical + OG defaults + manifest reference]
└── (public)/
    ├── explorar/
    │   ├── page.tsx                           [MOD: generateMetadata con OG + JSON-LD WebSite/CollectionPage]
    │   └── loading.tsx                        [NEW: Skeleton grid]
    ├── [slug]/
    │   ├── page.tsx                           [MOD: enrich generateMetadata con OG + alternates + JSON-LD LocalBusiness + BreadcrumbList]
    │   ├── loading.tsx                        [NEW: Skeleton header + grid]
    │   ├── components/
    │   │   └── TenantHeader.tsx               [MOD: <img> → next/image]
    │   └── disponibilidad/
    │       ├── page.tsx                       [MOD: generateMetadata + JSON-LD BreadcrumbList]
    │       └── loading.tsx                    [NEW: Skeleton]
    └── explorar/components/
        └── TenantCard.tsx                     [MOD: <img> → next/image]

src/lib/
└── seo/
    ├── structured-data.ts                     [NEW: builders LocalBusiness, BreadcrumbList, Organization, SearchAction, WebSite]
    └── metadata.ts                            [NEW: helpers buildOgImage, buildCanonical, BASE_URL]

next.config.js                                 [MOD: agregar { protocol: 'https', hostname: '*.supabase.co' } a images.remotePatterns]

lighthouserc.public.json                       [NEW: lighthouse config rutas públicas]
scripts/lighthouse-public.ts                   [NEW: runner sin auth, multi-route]
package.json                                   [MOD: script "lighthouse:public"]

tests/
├── unit/
│   ├── seo-structured-data.test.ts            [NEW: snapshots + schema shape]
│   └── seo-metadata.test.ts                   [NEW: buildCanonical, buildOgImage]
├── integration/
│   ├── sitemap-route.test.ts                  [NEW: /sitemap.xml resolve + include active tenants + exclude suspended]
│   └── robots-route.test.ts                   [NEW: /robots.txt allow rules + sitemap directive]
└── e2e/
    └── public-seo.spec.ts                     [NEW: sitemap 200 + robots 200 + JSON-LD valid + OG present + canonical]
```

**Total estimado:** ~18 archivos modificados/nuevos.

---

## Tasks

### T1: SEO infraestructura — sitemap + robots + manifest + favicon (🔴 P0 done-criteria H1+H2+H7)
**Goal:** Resolver `0 sitemap`, `0 robots`, `0 manifest`, `0 favicon`. Google indexa los slugs activos; el resto del crawling queda bajo control.

**Subtasks:**
1. Crear `src/app/sitemap.ts` que devuelva `MetadataRoute.Sitemap`:
   - Rutas estáticas: `/`, `/explorar`, `/privacy`, `/terms` (priority 1.0 / 0.8 / 0.5 / 0.5; changeFrequency `weekly` / `daily` / `yearly` / `yearly`).
   - Rutas dinámicas: `/[slug]` por cada tenant con `status IN ('active', 'trialing')`, `lastModified = tenants.updated_at`, priority 0.9, changeFrequency `daily`.
   - Helper en `src/modules/tenants/public.service.ts` (o nuevo `sitemap.service.ts`): `listSitemapTenants()` con SELECT slug, updated_at WHERE status IN ('active', 'trialing') ORDER BY updated_at DESC.
2. Crear `src/app/robots.ts` que devuelva `MetadataRoute.Robots`:
   - allow `/`, `/explorar`, `/[slug]`, `/privacy`, `/terms`
   - disallow `/api/`, `/admin/`, `/super-admin/`, `/player/`, `/login`, `/register`, `/onboarding`, `/monitoring` (Sentry tunnel)
   - sitemap: `${BASE_URL}/sitemap.xml`
3. Crear `src/app/manifest.ts` que devuelva `MetadataRoute.Manifest`:
   - name `TurnoGol`, short_name `TurnoGol`, theme_color `#059669` (emerald-600 del DS), background_color `#F8FAFC` (slate-50), display `standalone`, scope `/`, start_url `/`.
4. Crear icon files (usar emoji ⚽ via `src/app/icon.tsx` con ImageResponse, o agregar `icon.png`/`apple-icon.png` en `src/app/`).
5. Crear `src/app/opengraph-image.tsx` con ImageResponse baseline (1200x630, fondo emerald, texto "TurnoGol — Reservá tu cancha de fútbol").

**Done-when:**
- `pnpm dev` + `curl http://localhost:3000/sitemap.xml` → XML válido con slugs activos.
- `curl http://localhost:3000/robots.txt` → allow + disallow + sitemap directive.
- `curl http://localhost:3000/manifest.json` → JSON válido.
- `curl http://localhost:3000/icon` → 200.
- Suspended tenant NO aparece en sitemap.

**Tests:** T1 entrega los integration tests `sitemap-route.test.ts` + `robots-route.test.ts`.

---

### T2: Metadata + OpenGraph + canonical per route (🔴 P1 H4+H9)
**Goal:** Cada ruta pública con `generateMetadata` rico: title, description, OG (image, type, locale), Twitter Card, canonical.

**Subtasks:**
1. Crear `src/lib/seo/metadata.ts` con helpers:
   - `BASE_URL` = `process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'`
   - `buildCanonical(path: string): string` → absolute URL.
   - `buildOgImage(opts: { title, subtitle? }): string` → URL a OG endpoint o estático.
2. Actualizar `src/app/layout.tsx`:
   - `metadata.metadataBase = new URL(BASE_URL)`
   - `metadata.alternates.canonical = '/'` (default)
   - `metadata.openGraph = { type: 'website', siteName: 'TurnoGol', locale: 'es_AR', images: ['/opengraph-image'] }`
   - `metadata.twitter = { card: 'summary_large_image', images: ['/opengraph-image'] }`
3. Homepage `src/app/page.tsx`: agregar `metadata` export con OG enriquecido + canonical `/`.
4. `src/app/(public)/explorar/page.tsx`: agregar `metadata` export con OG title "Buscá canchas de fútbol cerca tuyo" + canonical `/explorar`.
5. `src/app/(public)/[slug]/page.tsx`: enriquecer `generateMetadata` ya existente con OG (image = tenant.coverUrl ?? default, title = tenant.name, description = tenant.description ?? `Reservá una cancha en ${tenant.name}, ${tenant.city}`, locale es_AR) + canonical `/${slug}`.
6. `src/app/(public)/[slug]/disponibilidad/page.tsx`: enriquecer `generateMetadata` ya existente con OG + canonical `/${slug}/disponibilidad`.
7. Para tenants `UNAVAILABLE_STATUSES` (suspended/blocked/canceled/churned/deleted): `generateMetadata` retorna `{ robots: { index: false, follow: false } }` para evitar indexar páginas no-disponibles.

**Done-when:**
- `view-source:http://localhost:3000/{slug}` muestra `<meta property="og:title">`, `og:image`, `og:type`, `og:url`, `twitter:card`, `<link rel="canonical">`.
- Validar OG con Facebook Sharing Debugger (manual o vía test).
- Tenants suspended retornan `noindex`.

**Tests:** Cubierto en T7 (E2E).

---

### T3: JSON-LD Schema.org LocalBusiness + BreadcrumbList + WebSite/SearchAction (🔴 P0 done-criteria H3)
**Goal:** Rich results en Google. LocalBusiness en cada portal de complejo, BreadcrumbList en sub-rutas, WebSite + SearchAction en homepage.

**Subtasks:**
1. Crear `src/lib/seo/structured-data.ts` con builders type-safe:
   - `buildLocalBusiness(tenant: PublicTenant): LocalBusiness` → `@context`, `@type: SportsActivityLocation` (subset de LocalBusiness, más preciso para canchas), `name`, `address` (PostalAddress: `streetAddress`, `addressLocality` = city, `addressRegion` = province, `addressCountry` = AR), `telephone`, `openingHoursSpecification` (mapear `opening_hours` JSONB → array de `OpeningHoursSpecification`), `url`, `image`, `priceRange` (opcional).
   - `buildBreadcrumbList(items: Array<{ name: string; url: string }>): BreadcrumbList` → BreadcrumbList con ListItem position 1..N.
   - `buildWebSite(): WebSite` → `name: TurnoGol`, `url: BASE_URL`, `potentialAction: SearchAction { target: '{BASE_URL}/explorar?q={search_term_string}', query-input: 'required name=search_term_string' }`.
   - `buildOrganization(): Organization` → `name: TurnoGol`, `url`, `logo`, `sameAs: [...]` (si hay redes sociales — vacío v1).
2. Inyectar en `src/app/page.tsx`:
   - `<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([buildOrganization(), buildWebSite()]) }} />`
3. Inyectar en `src/app/(public)/[slug]/page.tsx`:
   - `<script type="application/ld+json">[LocalBusiness, BreadcrumbList(['Home','Explorar',tenant.name])]</script>`
   - Solo si tenant NO está en UNAVAILABLE_STATUSES (sino, no es discoverable).
4. Inyectar en `src/app/(public)/[slug]/disponibilidad/page.tsx`:
   - `<script type="application/ld+json">BreadcrumbList(['Home', tenant.name, 'Disponibilidad'])</script>`
5. Inyectar en `src/app/(public)/explorar/page.tsx`:
   - `<script type="application/ld+json">BreadcrumbList(['Home', 'Explorar'])</script>`

**Done-when:**
- `view-source:.../[slug]` contiene JSON-LD válido con `@type: SportsActivityLocation`.
- Validar con `https://validator.schema.org/` (manual, capturar screenshot en report).
- `openingHoursSpecification` cubre los 7 días según `tenant.opening_hours`.
- BreadcrumbList tiene 3 items en `/[slug]`, 3 en `/[slug]/disponibilidad`, 2 en `/explorar`.

**Tests:** Cubierto en T7 (E2E parsea JSON-LD del HTML + valida shape).

---

### T4: `<img>` → `next/image` migration (🟡 P1 done-criteria perf H5+H11)
**Goal:** WebP/AVIF + lazy load nativo + responsive `sizes` + LCP fix. Esto sube el Performance score.

**Subtasks:**
1. Modificar `next.config.js`:
   - Agregar `{ protocol: 'https', hostname: '*.supabase.co' }` a `images.remotePatterns` (Supabase Storage para logos/covers).
2. `src/app/(public)/explorar/components/TenantCard.tsx`:
   - Reemplazar `<img>` con `<Image fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" alt={tenant.name} ... />` dentro del wrapper `relative aspect-[16/9]`.
   - Mantener fallback (initials) cuando `!coverUrl`.
   - Quitar `eslint-disable @next/next/no-img-element`.
3. `src/app/(public)/[slug]/components/TenantHeader.tsx`:
   - Cover: `<Image fill sizes="100vw" priority alt={...} />` (priority porque es above-the-fold = LCP candidate).
   - Logo: `<Image width={56} height={56} sizes="56px" alt={...} />` (no priority — abajo del cover en mobile).
   - Quitar ambos `eslint-disable`.

**Done-when:**
- `pnpm lint` 0 warnings en TenantCard + TenantHeader (los 2 eslint-disable removidos).
- `pnpm build` sin errores.
- Visual smoke local: cover + logo se renderizan correctamente, sin layout shift visible al cargar.
- Network tab muestra request a `_next/image?url=...&w=...&q=75` (con AVIF/WebP en Accept header).

**Tests:** Visual confirmation en verify. No nuevos tests automáticos (cubierto indirectamente por E2E existentes — la imagen sigue siendo accesible vía alt).

---

### T5: `loading.tsx` per public route + Suspense tuning (🟡 P2 H6)
**Goal:** Streaming UX en rutas públicas. Match patrón F4/F5 admin.

**Subtasks:**
1. Crear `src/app/(public)/explorar/loading.tsx`:
   - Skeleton grid de 6 cards (rectangle 16:9 + 2 líneas texto).
2. Crear `src/app/(public)/[slug]/loading.tsx`:
   - Skeleton header (cover 48px tall + logo + name placeholder) + Skeleton grid 1 día.
3. Crear `src/app/(public)/[slug]/disponibilidad/loading.tsx`:
   - Skeleton de tabla week-view (7 columnas x N filas).
4. (Opcional, si hay tiempo) `src/app/(public)/[slug]/reservar/loading.tsx` — pero scope F7, defer.

**Done-when:**
- Cada `loading.tsx` se renderiza en throttled 3G simulation (DevTools) durante el fetch.
- Layout no salta (CLS = 0).

**Tests:** Visual smoke. Lighthouse Performance debe subir por TTI percibido.

---

### T6: Lighthouse harness público (🟡 P1 verificabilidad H8)
**Goal:** Done-criteria 1+2 medible. Replicar patrón F3 sin auth (más simple).

**Subtasks:**
1. Crear `lighthouserc.public.json`:
   - URLs: `http://localhost:3000/`, `http://localhost:3000/explorar`, `http://localhost:3000/e2e-complejo-demo` (slug del seed).
   - Settings: mobile 375x667, throughput 1638.4 kbps, rttMs 150, screenEmulation Moto G4.
   - Assertions: SEO ≥ 1.0, Performance ≥ 0.9, Accessibility ≥ 0.9 (no F11 todavía, baseline), BestPractices ≥ 0.9.
   - Output: `./docs/audit/reports/fase-f06-raw/lhci/`.
2. Crear `scripts/lighthouse-public.ts`:
   - Spawn dev server (NODE_ENV=production con `pnpm build && pnpm start`).
   - Wait until `/` 200 (puppeteer wait-for).
   - Asegurar seed `e2e-complejo-demo` existe en DB (importar `pnpm e2e:seed` o asumir corrido previo).
   - Spawn `npx @lhci/cli autorun --config=lighthouserc.public.json`.
   - Capturar JSON de cada run → guardar en outputDir.
   - Parsear y log scores en consola (formato F3): `[/] SEO 100 / Performance 95 / A11y 92 / BP 100`.
   - Exit code 0 si todos los assertions pasan, 1 si alguno falla.
3. Agregar a `package.json` scripts: `"lighthouse:public": "tsx scripts/lighthouse-public.ts"`.

**Done-when:**
- `pnpm lighthouse:public` corre local (si Chrome + DB Supabase disponibles).
- Scores reportados por consola.
- Si CI no tiene la infra, documentar baseline esperado en el report F6.

**Tests:** El propio script es el test. T8 (verify) captura las salidas.

---

### T7: Tests SEO end-to-end (🟡 P2 cobertura H10)
**Goal:** Regresión silenciosa de SEO en prod es muy cara. Cobertura mínima.

**Subtasks:**
1. `tests/unit/seo-structured-data.test.ts`:
   - `buildLocalBusiness` con tenant fixture → snapshot del JSON resultante; valida @context, @type, address.addressCountry='AR', openingHoursSpecification cubre 7 días.
   - `buildBreadcrumbList(items)` → snapshot + valida positions 1..N.
   - `buildWebSite` → snapshot + valida potentialAction.target con template.
2. `tests/unit/seo-metadata.test.ts`:
   - `buildCanonical('/foo')` → `${BASE_URL}/foo`.
   - `buildCanonical('/')` → `${BASE_URL}/`.
   - `buildOgImage({ title })` → URL string (formato esperado).
3. `tests/integration/sitemap-route.test.ts`:
   - Setup: insertar 3 tenants vía service-role (active, trialing, suspended).
   - Call `GET /sitemap.xml` con fetch (o invocar `sitemap()` directamente y validar shape).
   - Assert: active + trialing presentes, suspended NO. URLs absolutas. lastModified ISO. priority/changeFrequency válidos.
   - Cleanup: DELETE en finally.
4. `tests/integration/robots-route.test.ts`:
   - Call `GET /robots.txt`.
   - Assert: contiene `Allow: /`, `Allow: /explorar`, `Disallow: /api/`, `Disallow: /admin/`, `Sitemap: ...`.
5. `tests/e2e/public-seo.spec.ts`:
   - Scenario A: `GET /sitemap.xml` → 200, content-type xml, includes `e2e-complejo-demo`.
   - Scenario B: `GET /robots.txt` → 200, includes `Sitemap:`.
   - Scenario C: navigate to `/e2e-complejo-demo`, evaluate JSON-LD: `JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)` → valida `@type` y campos críticos.
   - Scenario D: assert `<meta property="og:title">`, `og:image`, `<link rel="canonical">` presentes.
   - Scenario E: tenant suspended → `<meta name="robots" content="noindex,nofollow">` presente, JSON-LD ausente.

**Done-when:**
- `pnpm test src/lib/seo` → unit pasa.
- `pnpm test:integration tests/integration/sitemap-route.test.ts robots-route.test.ts` → pasa.
- `pnpm exec playwright test tests/e2e/public-seo.spec.ts` → pasa local (delegar suite full a CI).

---

### T8: Verify final + Lighthouse run + report (gating)
**Goal:** Trust-but-verify. Confirmar que los reviewers no se comieron un bug. F3 entregó test que mentía y script que mentía — replicar el escrutinio.

**Subtasks:**
1. `pnpm typecheck` clean.
2. `pnpm lint` clean (los 2 eslint-disable removidos en T4).
3. `pnpm test` clean (unit + 2 nuevos).
4. `pnpm test:integration` clean (con la flakiness pre-existente esperada en `daily-close-idempotency.test.ts` + `race-abonado-vs-individual.test.ts` — NO regresión).
5. `pnpm build` clean + verificar First Load JS por ruta pública < 200KB gz (cap `/explorar`, `/[slug]`, `/`).
6. **Lighthouse run local** (si Chrome libre + DB Supabase + dev server arriba):
   - `pnpm lighthouse:public` → capturar scores `/`, `/explorar`, `/[slug]`.
   - Si CI required, documentar baseline esperado.
7. **Validación manual Schema.org**: validar JSON-LD generado para `e2e-complejo-demo` contra `https://validator.schema.org/` (capturar screenshot en report).
8. **OG validation manual**: pegar URL en Facebook Sharing Debugger o usar `curl -A "facebookexternalhit" .../` → verificar OG meta.
9. **Trust-but-verify diff scan**: leer el diff completo de cada task y buscar:
   - JSON-LD malformado (validar JSON.parse del string output).
   - canonical con `localhost` hardcodeado.
   - `<Image>` sin `alt` o sin `sizes` (warning en build).
   - Sitemap con priority/changeFrequency string vs número (Next.js es estricto).
   - `loading.tsx` con import server-only en client component.
10. Generar `docs/audit/reports/fase-f06-public-landing-search-portal-report.md` (house-style).
11. Actualizar `docs/audit/STATE.md` (F6 → completed, próxima F7).
12. Generar prompt F7 ANTES de commits/merge (per instrucción del usuario — timing crítico).

**Done-when:**
- 6 checks (typecheck/lint/test/integration/build/lighthouse) pasan.
- Bundle First Load JS por ruta pública documentado.
- Lighthouse scores documentados en report (con caveats si no se pudo correr local).
- Schema.org validator screenshot adjunto en report.
- STATE.md actualizado.
- Prompt F7 generado.

---

## Stats acumulados esperados post-F6

- **Fases completadas: 19/26** (backend B0-B11 + F0 + F1 + F2 + F3 + F4 + F5 + F6).
- **Tests acumulados nuevos audit: ~250** (236 post-F5 + ~14 F6: 2 unit seo + 2 integration sitemap/robots + 5 E2E scenarios + ~5 unit metadata).
- **Migraciones nuevas: 0** (F6 no toca schema).
- **Bundle audit F6:** `/` `/explorar` `/[slug]` documentado por ruta.

---

## Hand-off al humano

Después del merge F6: trigger humano confirmar continuar con F7 (Booking Flow Jugador End-to-End, criticidad 🔴🔴🔴 Crítica) o pausar.
