# TurnoGol — Archivo maestro de Happy Paths (TG-HP)

> **Qué es esto.** Catálogo exhaustivo de los caminos felices de TurnoGol, redactado para que un **agente orquestador** lo delegue a **sub-agentes con navegador** que ejecuten cada flujo de forma autónoma y verifiquen contra la UI + la DB. Cada caso está anclado al código real con citas `path:línea`; nada inventado.
>
> **Generado.** 2026-07-15, por fan-out de 5 agentes contra el código en `main` (working tree local). 64 casos: 10 público + 13 jugador + 28 admin + 13 super-admin.
>
> **Fuente de verdad.** El código. Donde un doc del repo (CLAUDE.md, `docs/spec/*`) contradice al código, manda el código; las divergencias detectadas están en §Hallazgos.

---

## Cómo consumir este archivo (para el orquestador)

1. Cada caso `TG-HP-###` es independiente y trae sus **Prerrequisitos** (estado de DB/sesión + fixture). Prepará ese estado antes de correr el flujo — varios casos incluyen el `SQL` exacto de preparación.
2. **No tipear contraseñas.** Las sesiones se mintean por cookie con `buildStorageState(email)` (`tests/e2e/_helpers/auth-state.ts`), igual que el harness E2E. El jugador es passwordless (magic link).
3. Ejecutá el **Flujo de navegación** paso a paso. Validá las 3 capas: **Comportamiento de componentes** (loading / anti-doble-submit / toast), **Validación de datos** (DB + Action/endpoint + externos), y **UI sin reload**.
4. Reportá ✅/❌ por caso con evidencia (page-text + fila DB por SQL). Un flujo que "renderiza sin error" NO es un ✅ hasta que la fila de DB esperada exista con el estado exacto.

### Esquema de cada caso
`ID` · `Rol` · `Nombre` · `Prerrequisitos` · `Flujo de navegación (UI steps)` · `Comportamiento de componentes` (skeleton/spinner · botón que se deshabilita anti-doble-submit · toast con texto real) · `Validación de datos` (DB · Action/endpoint → 200/201 · externos: R2/Resend/MP · UI-sin-reload) · `Evidencia (path:línea)`.

> **Estado de cliente:** TurnoGol **no usa Zustand** ni store global. La UI se actualiza por `revalidatePath`/`router.refresh`/optimistic (Server Components + Server Actions + `useActionState`/`useFormStatus`). Las asserts de "estado local" verifican eso, no un store.

---

## Entorno y modos

- **Base local:** `http://localhost:3000`. Supabase local en `:54322` (DB) / auth API local. Emails a **Inbucket** `http://127.0.0.1:54324`.
- **Modo pago DEFAULT = MP mock** (`MP_MOCK_MODE=1`, `NEXT_PUBLIC_E2E=1`): el checkout de reserva redirige a `/mock-mp/checkout` con botones aprobado/rechazado/cancelar; el webhook se procesa inline. Cubre TODO el funnel de reserva con seña sin plata ni túnel.
- **Casos `[REQUIERE MP REAL]`** (OAuth del complejo, refund contra sandbox, preapproval SaaS de billing): necesitan MP real sandbox = OAuth + túnel `ngrok` + 2 test users MP. Van marcados; son un prerequisito aparte, no bloquean el resto.
- **Uploads R2** (`TG-HP-204/205/206`): exigen las 5 vars `R2_*` en `.env.local`. Sin ellas, la Server Action responde `"Storage no configurado"` (`isR2Configured()` false) — ese rechazo es el gate a superar en dev sin R2.
- **Super-admin** (`TG-HP-3xx`): el seed E2E **no** crea super-admin. Setup: `pnpm seed:system-admin <email>` + `SYSTEM_ADMIN_EMAILS=<email>` + `IMPERSONATION_COOKIE_SECRET` (≥16). Ver salvedad del seed en §Hallazgos #6.

### Fixtures canónicos del seed (`scripts/seed-e2e.ts`) — usar como mock data
| Recurso | Valor | Notas |
|---|---|---|
| Tenant **Demo** | id `00000000-0000-4000-8000-000000000001`, slug `e2e-complejo-demo` | `requires_deposit:false` → la reserva online **confirma al instante** sin MP. Cancha `...010` ("Cancha E2E 1"). |
| Tenant **Seña** | id `...030`, slug `e2e-complejo-sena` | `requires_deposit:true` 50%, `mp_access_token='mock-mp-token'`. Cancha `...031`. **Sin staff** → dispara el skip de `recordDepositCashFlow`. |
| Admin | `e2e-admin@turnogol.test` (staff `...003`, tenant Demo) | rol `admin`. |
| Admin 2 | `e2e-admin-2@turnogol.test` (staff `...007`) | mismo tenant Demo (realtime / aislamiento). |
| Fresh admin | `e2e-admin-fresh@turnogol.test` (staff `...005`) | **0 tenants** → entra al wizard de onboarding. |
| Jugador | `e2e-player@turnogol.test` (player `...020`) | passwordless; ligado a Demo + Seña. |
| Password staff | `e2e-Test-Password-123` | backdoor no-prod; **no tipear**, usar cookie mint. |

---

## Premisas de template corregidas contra el código

El pedido original traía supuestos de arquitectura genérica. Verificados uno por uno:

| Premisa | Realidad en código |
|---|---|
| Storage = Cloudflare R2 | **Correcta.** `src/shared/storage/r2.ts` (AWS S3 SDK → endpoint R2). CLAUDE.md dice "Supabase Storage" y es engañoso: Supabase es **solo Auth**. |
| Avatar de jugador subible | **No existe.** `(player)/perfil` es texto puro. Los uploads R2 son: logo tenant, portada tenant, fotos de cancha (Server Actions, sin presigned URLs). |
| Estado cliente = Zustand | **Falsa.** RSC + Server Actions + `useActionState`/`useFormStatus`. |
| Multi-tenant por subdominios | **Falsa.** Portal público por `/[slug]` + claim JWT `tenant_id` para staff. Cero código de subdominio. |
| Jugador con registro/login tradicional | **Falsa.** Jugador = Magic Link passwordless; alta al reservar (LoginGate). `/register` es para dueños (staff email+password). |
| Superadmin crea complejos | **Falsa.** No crea tenants. Sí: suspender/bloquear/reactivar/extender-trial/cambiar-plan/cancelar-sub/reset-password/impersonar. |

---

## Hallazgos detectados al redactar (para decisión de Lazar — NO se tocó código)

Findings de producto/entorno que aparecieron mientras se anclaba cada caso al código. No son bugs introducidos; son estado real del repo.

| # | Sev | Hallazgo | Evidencia | Impacto en QA |
|---|---|---|---|---|
| 1 | 🟡 | **Manager no ve NINGUNA métrica** (no solo "de sistema" como dice CLAUDE.md). `GET /api/admin/metrics` usa `withRole('admin')` → 403 a manager. | `src/app/api/admin/metrics/route.ts:19-20`, `src/shared/middleware/with-role.ts:30-36` | TG-HP-221 con rol manager termina en banner de error, no en gráficos. Decisión: ampliar a `['admin','manager']` o corregir el doc. |
| 2 | 🟡 | **`products` (stock) = schema muerto.** Tabla con `price/stock/lowStockAlert` sin UI/módulo/service. La venta de cantina usa `tenants.settings.canteen_products` (JSONB sin `stock`, no descuenta). | `src/shared/db/schema/products.ts:14-44` (sin consumidores) | TG-HP-215/217 no ejecutables como "stock". Decisión: construir feature o deprecar tabla. |
| 3 | 🟡 | **Login super-admin no rutea a `/super-admin`.** `loginAction` → `provisionAndRouteStaff` sin chequear `is_system_admin`; con 0 tenants va a `/onboarding`. | `src/app/(auth)/login/actions.ts:31-83` | TG-HP-301: el sub-agente debe navegar manualmente a `/super-admin` tras loguear. |
| 4 | 🟠 | **`seed-e2e` hace `DELETE FROM tenant_subscriptions`** (no INSERT): el tenant Demo llega sin fila de suscripción → bloquea TG-HP-305/306/307/308/309/310. | `scripts/seed-e2e.ts:80,95` | Cada caso super-admin de FSM trae el `INSERT`/`UPDATE` de fixture necesario. |
| 5 | 🟢 | **Label inconsistente `past_due`:** "Moroso" en dashboard, "Pago vencido" en listado/detalle. | `tenant-status-badge.tsx:22` vs `status-badge.tsx:13` | Asserts de texto de estado deben tolerar ambos según la vista. |
| 6 | 🟠 | **`pnpm seed:system-admin` roto bajo pool restringido.** Inserta en `system_admins` vía `getDb()` (`turnogol_app`), pero la tabla tiene RLS+FORCE (migr. 006 + 036) **sin policy de INSERT** → `42501`. | `scripts/seed-system-admin.ts:89-94`, migr. `006_rls_policies.sql:67`, `036_force_rls_remaining_tables.sql:25` | El fixture super-admin se siembra vía superuser DSN / `turnogol_worker` (BYPASSRLS), no con el script tal cual. Revisar cómo se bootstrapea el 1er super-admin en prod. |
| 7 | 🟢 | **CSV de reportes: columna `monto_ars` está en centavos**, sin dividir por 100 (nombre engañoso). | `report.service.ts:221` | TG-HP-220 valida centavos, no pesos. |
| 8 | 🟢 | FSM de dunning: `past_due→suspended` exige `dunning_started_at ≤ NOW()-7d`; `suspended→blocked` `≤ NOW()-14d`. Forzar el estado previo deja el timestamp en `NOW()`. | `lifecycle.service.ts` | TG-HP-305/306 traen el `UPDATE` de backdateo. |

### Docs desactualizados (no se auto-editan)
- CLAUDE.md: "Supabase Storage" → real es **Cloudflare R2**. Impersonación "Fase 2 diferida" → **implementada**.
- `docs/qa/vistas_inventario.md` y `docs/testing/PROMPTS_TESTEO_VISTAS.md`: stale (PIN eliminado, `/privacy`↔`/privacidad`, `/terms`↔`/terminos`).

### Salvedades de cobertura del propio archivo
- Uploader de fotos de cancha aparece **solo en modo edición** (`CourtForm.tsx:250-268`) — no hay "crear cancha con fotos" en un paso (TG-HP-206).
- E2E de grilla Realtime multi-browser están `test.fixme` — no hay suite verde que respalde el SLA <2s (TG-HP-209).
- MFA TOTP del super-admin: schema presente, **no enforced** en los guards hoy (TG-HP-301/313 no dependen de MFA).
- Cuerpo real de emails (Resend/Inbucket), `favorite.service.ts` y el route de reviews: citados por contrato, no leídos línea a línea — verificar en runtime.

---

## Índice de bloques
- **Bloque 0 — Público / no-auth:** TG-HP-001 … 010
- **Bloque 1 — Jugador:** TG-HP-101 … 113
- **Bloque 2 — Admin (dueño / encargado):** TG-HP-201 … 228
- **Bloque 3 — Super-admin:** TG-HP-301 … 313


---

# Bloque 0 — Público / no-auth

# TG-HP-0xx — Bloque Público / No-Auth (Happy Path)

Fixtures usadas: Tenant Demo `e2e-complejo-demo` (`requires_deposit:false`, `deposit_percentage:0`) y Tenant Seña `e2e-complejo-sena` (`requires_deposit:true`, `deposit_percentage:50`), confirmados en `scripts/seed-e2e.ts:143-146,196-199`. Base URL local: `http://localhost:3000`.

---

## TG-HP-001 — Home/landing: render + buscador de canchas
- **Rol:** Visitante (no autenticado)
- **Prerrequisitos:** Ninguno (página pública, ISR `revalidate=300`, sin cookies de sesión requeridas).
- **Flujo de navegación (UI steps):**
  1. Navegar a `http://localhost:3000/`.
  2. Esperar a que renderice el h1 "Reservá tu cancha al instante." (`src/app/home/Hero.tsx:64-67`).
  3. Verificar la nav flotante con el link "Explorar" y el CTA "Ingresar" (`src/components/site/PortalHeader.tsx:40-45,64-69`).
  4. En el formulario "Buscá disponibilidad ahora" (`src/components/site/HeroSearch.tsx:120`), completar el campo "Complejo" (id `hero-q-v`) con `demo` (`src/components/site/HeroSearch.tsx:125-141`).
  5. Click en el combobox "Localidad" (id `hero-city-v`) y elegir una opción de la lista (`src/components/site/HeroSearch.tsx:146-169`).
  6. Click en el botón "Buscar canchas" (`src/components/site/HeroSearch.tsx:227-233`).
  7. Esperar la navegación a `/explorar?...` con los query params `q`/`city`/`province` seteados.
- **Comportamiento de componentes:**
  - Loading: la home NO tiene `loading.tsx` propio (no existe `src/app/loading.tsx`; verificado con glob) — es 100% Server Component (`export default async function HomePage`, `src/app/page.tsx:50`), no hay skeleton visible en el primer render.
  - Anti-doble-submit: no aplica — el submit del buscador es un `router.push` client-side (`src/components/site/HeroSearch.tsx:76-90`), no hay estado de loading ni disabled en el botón "Buscar canchas".
  - Feedback: no hay toast; el resultado es una navegación (`router.push`) a `/explorar?...` (`src/components/site/HeroSearch.tsx:89`).
- **Validación de datos:**
  - DB: ninguna escritura. Lectura server-side de `listPublicCities()` y `searchPublicTenants({ sort: 'rating', limit: 6 })` (`src/app/page.tsx:31-48`).
  - API/Action: no hay Server Action ni fetch a `/api/...` en esta página — todo se resuelve en el Server Component antes del render (`src/app/page.tsx:50-51`).
  - Externos: ninguno.
  - UI-sin-reload: el submit del buscador es `router.push` (Next Client Router), no un fetch a route handler (`src/components/site/HeroSearch.tsx:89`).
- **Evidencia (path:línea):**
  - `src/app/page.tsx:50` — Server Component `HomePage`, sin `'use client'`.
  - `src/app/home/Hero.tsx:64-67` — h1 "Reservá tu cancha al instante."
  - `src/app/home/Hero.tsx:81` — `<HeroSearch cities={cities} layout="vertical" />`.
  - `src/components/site/HeroSearch.tsx:120` — label "Buscá disponibilidad ahora".
  - `src/components/site/HeroSearch.tsx:125-127` — label "Complejo", input `id="hero-q-v"`.
  - `src/components/site/HeroSearch.tsx:146-148` — label "Localidad", combobox `id="hero-city-v"`.
  - `src/components/site/HeroSearch.tsx:232` — texto del botón "Buscar canchas".
  - `src/components/site/HeroSearch.tsx:89` — `router.push(qs ? \`/explorar?${qs}\` : '/explorar')`.
  - `src/components/site/PortalHeader.tsx:44` — link "Explorar".
  - `src/components/site/PortalHeader.tsx:68` — link "Ingresar" (deslogueado).
  - `src/app/home/FeaturedComplexes.tsx:31` — h2 "Los mejor valorados" (solo si `featured.length > 0`, `src/app/page.tsx:60`).
  - `src/app/home/HowItWorks.tsx:8,15,22` — pasos "Explorá complejos" / "Compará disponibilidad" / "Confirmá y jugá".

---

## TG-HP-002 — Explorar `/explorar`: buscar cancha cross-tenant con filtros
- **Rol:** Visitante (no autenticado)
- **Prerrequisitos:** Al menos un tenant público visible (Demo y Seña sirven). Sin filtros, la carga inicial usa `getDefaultSearchCached()` (cacheada 5 min, `src/app/(public)/explorar/page.tsx:50-54`).
- **Flujo de navegación (UI steps):**
  1. Navegar a `http://localhost:3000/explorar`.
  2. Esperar el render de la banda "Encontrá tu cancha ideal" (`src/app/(public)/explorar/components/SearchBand.tsx:36`).
  3. En la barra de búsqueda (aria-label "Buscar canchas", `src/app/(public)/explorar/components/SearchBar.tsx:106`), completar "Buscar" (id `exp-q`) con `demo` (`src/app/(public)/explorar/components/SearchBar.tsx:112-125`).
  4. Click en el botón submit (aria-label "Buscar", `src/app/(public)/explorar/components/SearchBar.tsx:213-220`).
  5. En la fila de chips rápidos, click en el chip "Fútbol 5" (`src/app/(public)/explorar/components/QuickFilters.tsx:53-65`, `formatLabel(5)` → "Fútbol 5", `src/components/public/courtFacets.ts:27-29`).
  6. Click en el chip "Sintético" (`src/app/(public)/explorar/components/QuickFilters.tsx:68-75`).
  7. Click en "Todos los filtros" para abrir el drawer (`src/app/(public)/explorar/components/QuickFilters.tsx:99-108`).
  8. Dentro del drawer, tildar el checkbox "Techado" bajo el fieldset "Cerramiento" (`src/app/(public)/explorar/components/ExplorarFilters.tsx:117-124`).
  9. Tildar "Césped natural" bajo "Superficie" (`src/app/(public)/explorar/components/ExplorarFilters.tsx:127-142`, label de `SURFACE_LABELS`, `src/components/public/courtFacets.ts:9-14`).
  10. Completar "Precio mínimo" (id `min-price`) con `5000` y "Precio máximo" (id `max-price`) con `20000` (`src/app/(public)/explorar/components/ExplorarFilters.tsx:192-230`).
  11. Tildar "Solo con reserva online" (`src/app/(public)/explorar/components/ExplorarFilters.tsx:233-237`).
  12. Click en "Aplicar filtros" (`src/app/(public)/explorar/components/ExplorarFilters.tsx:240-246`).
  13. Cambiar el orden con el `<select>` "Ordenar por" (sr-only) a la opción "Precio más bajo" (`src/app/(public)/explorar/components/ExplorarToolbar.tsx:11-15,70-84`).
  14. Click en el toggle "Mapa" (`src/app/(public)/explorar/components/ExplorarToolbar.tsx:97-105`) y verificar el FAB "Ver lista" (`src/app/(public)/explorar/page.tsx:273-279`).
- **Filtros reales existentes** (evidencia): Cerramiento → Techado (`ExplorarFilters.tsx:118-123`); Superficie → Sintético / Césped natural / Cemento / Baldosa (`courtFacets.ts:9-14`); Formato → Fútbol 4 a Fútbol 11 (`courtFacets.ts:25`, `ExplorarFilters.tsx:145-167`); Servicios → Iluminación, Estacionamiento, Duchas, Vestuario, Parrilla, Bar, WiFi (`components/public/amenities.tsx:29-36`, excluye `techado` que va en Cerramiento — `ExplorarFilters.tsx:11`); Precio por turno (ARS) → min/max (`ExplorarFilters.tsx:192-230`); "Solo con reserva online" (`ExplorarFilters.tsx:233-237`); orden por Nombre (A-Z) / Precio más bajo / Mejor valorado / Más cercano (`ExplorarToolbar.tsx:10-15`); vista Lista/Mapa (`ExplorarToolbar.tsx:87-106`); chips rápidos: Fútbol 5/7/11, Sintético, Techado, Online (`QuickFilters.tsx:11,53-95`).
- **Comportamiento de componentes:**
  - Loading: `src/app/(public)/explorar/loading.tsx:1-51` (skeleton de banda + toolbar + sidebar + 6 cards). También hay `<Suspense fallback={<div className="h-16" />}>` para `QuickFilters`+`ExplorarToolbar` y `<Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-muted" />}>` para `ExplorarFilters` (`src/app/(public)/explorar/page.tsx:211-225`).
  - Anti-doble-submit: no hay disabled explícito en "Aplicar filtros" ni en el submit de `SearchBar`; ambos disparan `router.push` (`ExplorarFilters.tsx:83-92`, `SearchBar.tsx:87-95`).
  - Feedback: sin resultados, la página muestra `EmptyResults` con h2 "Sin resultados para tu búsqueda" (o "Sin disponibilidad en ese horario" si hay `date`+`time`) y CTA "Limpiar búsqueda" → `/explorar` (`src/app/(public)/explorar/components/EmptyResults.tsx:16-29`). El ordenar por "Más cercano" sin geolocalización dispara un toast destructivo "Tu navegador no soporta geolocalización." o "Activá la ubicación para ordenar por cercanía." (`ExplorarToolbar.tsx:34,48-51`).
- **Validación de datos:**
  - DB: ninguna escritura; lectura vía `searchPublicTenants(...)` con los filtros de la URL (`src/app/(public)/explorar/page.tsx:148-167`).
  - API/Action: no hay Server Action; todos los filtros viajan como query params y la página server-side vuelve a ejecutar `searchPublicTenants` en cada navegación (`src/app/(public)/explorar/page.tsx:95-169`).
  - Externos: ninguno (el sort "Más cercano" usa `navigator.geolocation` del browser, no un servicio externo).
  - UI-sin-reload: NO hay fetch a route handler — cada filtro hace `router.push(buildExplorarUrl(...))` (`src/app/(public)/explorar/components/url.ts` + `ExplorarFilters.tsx:83-92`), que es una navegación Next (Server Component re-renderiza `ExplorarPage` con los nuevos `searchParams`).
- **Evidencia (path:línea):**
  - `src/app/(public)/explorar/components/SearchBand.tsx:36` — h1 "Encontrá tu cancha ideal".
  - `src/app/(public)/explorar/components/SearchBar.tsx:112,130` — labels "Buscar" / "Localidad".
  - `src/app/(public)/explorar/components/QuickFilters.tsx:74,84,94` — labels "Sintético" / "Techado" / "Online".
  - `src/app/(public)/explorar/components/QuickFilters.tsx:102` — texto "Todos los filtros".
  - `src/app/(public)/explorar/components/ExplorarFilters.tsx:118,128,146,171,193,236,245,252` — legends/labels/botones "Cerramiento" / "Superficie" / "Formato" / "Servicios" / "Precio por turno (ARS)" / "Solo con reserva online" / "Aplicar filtros" / "Limpiar".
  - `src/app/(public)/explorar/components/ExplorarToolbar.tsx:10-15` — opciones de sort.
  - `src/app/(public)/explorar/components/EmptyResults.tsx:16,28` — h2 "Sin resultados para tu búsqueda" / CTA "Limpiar búsqueda".
  - `src/app/(public)/explorar/loading.tsx:1` — skeleton dedicado.

---

## TG-HP-003 — Perfil público del complejo `/e2e-complejo-sena`
- **Rol:** Visitante (no autenticado)
- **Prerrequisitos:** Tenant `e2e-complejo-sena` seedeado, status público (no `suspended/blocked/canceled/churned/deleted`).
- **Flujo de navegación (UI steps):**
  1. Navegar a `http://localhost:3000/e2e-complejo-sena`.
  2. Esperar el render del h1 con el nombre del tenant (`src/app/(public)/[slug]/components/TenantHeader.tsx:59-61`).
  3. Verificar la sección "Canchas (N)" con las `CourtCard` (`src/app/(public)/[slug]/page.tsx:97-104`).
  4. Click en el chip "Cómo llegar" (`src/app/(public)/[slug]/components/TenantHeader.tsx:87-90`) — abre Google Maps en tab nueva.
  5. Click en el chip de teléfono (`tel:`) (`TenantHeader.tsx:91-94`).
  6. Click en el chip "Ver semana completa" → navega a `/e2e-complejo-sena/disponibilidad` (`TenantHeader.tsx:106-109`).
  7. Volver al perfil. En la sección "Disponibilidad" (h2, `src/app/(public)/[slug]/components/AvailabilityGrid.tsx:258`), esperar el fetch inicial a `/api/public/availability?slug=e2e-complejo-sena&date=<hoy>` (`AvailabilityGrid.tsx:190`).
  8. Click en el botón "Día siguiente" (aria-label, `AvailabilityGrid.tsx:297-305`) y esperar el refetch.
  9. Click en un slot libre (label "Reservar", precio en centavos formateado) para un turno futuro; navega a `/e2e-complejo-sena/reservar?court=...&date=...&time=...&dur=...` (`AvailabilityGrid.tsx:145-153`).
- **Comportamiento de componentes:**
  - Loading: `src/app/(public)/[slug]/loading.tsx:1-31` (skeleton de header + galería + grilla) para la navegación inicial (ISR); dentro de la página, `<Suspense fallback={<Skeleton className="h-64 rounded-lg" />}>` envuelve `AvailabilityGrid` porque usa `useSearchParams()` (`src/app/(public)/[slug]/page.tsx:108-113`). Dentro de `AvailabilityGrid`, el fetch inicial y cada cambio de día muestran `<Skeleton className="h-48 rounded-lg" />` (`AvailabilityGrid.tsx:310`).
  - Anti-doble-submit: los botones "Día anterior"/"Día siguiente" se deshabilitan mientras `loading===true` o fuera de rango (`disabled={!date || !today || date <= today || loading}` y `disabled={!date || !maxDate || date >= maxDate || loading}`, `AvailabilityGrid.tsx:263,300`).
  - Feedback: si el fetch de un cambio de día falla, aparece `role="alert"` con el texto "No pudimos cargar la disponibilidad de ese día. Revisá tu conexión e intentá de nuevo." y la grilla se queda en el día previo — comentario explícito "la grilla sigue mostrando el dia previo" (`AvailabilityGrid.tsx:209-234` catch de `loadDate`, `AvailabilityGrid.tsx:312-321` markup del alert).
- **Validación de datos:**
  - DB: ninguna escritura. Lecturas server-side: `getPublicTenant(slug)`, `getAverageRating`, `getPublicCourtCards`, `getReviewsByTenant` (`src/app/(public)/[slug]/page.tsx:46,66-70`).
  - API/Action: `GET /api/public/availability?slug=<slug>&date=<YYYY-MM-DD>` → 200 con `AvailabilityResponse` (`src/app/api/public/availability/route.ts:25-57`); 404 `{error:'not_found'}` si el tenant no es públicamente visible; 400 `{error:'date_out_of_range'}` fuera de `[hoy, hoy+bookingAdvanceDays]`.
  - Externos: ninguno (el pago de la seña ocurre recién en `/reservar`, fuera de este caso).
  - UI-sin-reload: SÍ, `fetch()` client-side desde un Client Component (`'use client'`, `AvailabilityGrid.tsx:1,190,215-216`) — no hay `router.refresh()` ni `revalidatePath` acá.
- **Evidencia (path:línea):**
  - `src/app/(public)/[slug]/components/TenantHeader.tsx:59` — h1 `{tenant.name}`.
  - `src/app/(public)/[slug]/components/TenantHeader.tsx:89,93,108` — textos "Cómo llegar" / `{tenant.phone}` / "Ver semana completa".
  - `src/app/(public)/[slug]/page.tsx:97-99` — h2 "Canchas (N)".
  - `src/app/(public)/[slug]/components/AvailabilityGrid.tsx:258` — h2 "Disponibilidad".
  - `src/app/(public)/[slug]/components/AvailabilityGrid.tsx:190` — `fetch(\`/api/public/availability?slug=${...}&date=${initialDate}\`)`.
  - `src/app/(public)/[slug]/components/AvailabilityGrid.tsx:150` — label "Reservar" en el `<Link>` a `/reservar`.
  - `src/app/(public)/[slug]/components/AvailabilityGrid.tsx:312` — comentario "la grilla sigue mostrando el dia previo"; `319-320` — texto de error de fetch.
  - `src/app/api/public/availability/route.ts:42,47` — respuestas `not_found` (404) / `date_out_of_range` (400).
  - `src/app/(public)/[slug]/loading.tsx:1` — skeleton ISR de la página.

---

## TG-HP-004 — Disponibilidad semanal `/e2e-complejo-sena/disponibilidad`
- **Rol:** Visitante (no autenticado)
- **Prerrequisitos:** Tenant `e2e-complejo-sena` seedeado, status público.
- **Flujo de navegación (UI steps):**
  1. Navegar a `http://localhost:3000/e2e-complejo-sena/disponibilidad`.
  2. Esperar el render del link de vuelta "{tenant.name}" con ícono `ChevronLeft` (`src/app/(public)/[slug]/disponibilidad/page.tsx:37-39`).
  3. Verificar el h1 "Disponibilidad semanal" (`disponibilidad/page.tsx:40`).
  4. En la fila de tabs de días (`aria-pressed`), click en el segundo tab (mañana) (`src/app/(public)/[slug]/disponibilidad/components/WeeklyAvailability.tsx:33-46`).
  5. Dentro de la cancha listada, click en un slot libre (ej. `18:00`, con precio ARS debajo) para navegar a `/e2e-complejo-sena/reservar?court=...&date=...&time=18:00&dur=...` (`WeeklyAvailability.tsx:62-72`).
- **Comportamiento de componentes:**
  - Loading: `src/app/(public)/[slug]/disponibilidad/loading.tsx:1-27` (skeleton de back-link + heading + 7 filas de día × 8 chips) — se activa porque la página es `export const dynamic = 'force-dynamic'` (`disponibilidad/page.tsx:11`) y hace `await getPublicWeeklyAvailability(...)` server-side antes de renderizar (sin Suspense interno: el loading.tsx de Next cubre toda la carga inicial).
  - Anti-doble-submit: no aplica — los tabs de día son botones locales (`setActive(i)`, sin red) y los slots son `<Link>` de navegación, no forms (`WeeklyAvailability.tsx:33-46,63-71`).
  - Feedback: sin toast. Día sin canchas → "Sin canchas disponibles este día." (`WeeklyAvailability.tsx:50`); cancha sin turnos libres → "Sin turnos libres." (`WeeklyAvailability.tsx:59`).
- **Validación de datos:**
  - DB: ninguna escritura. Lectura server-side `getPublicWeeklyAvailability(tenant, getArtToday())` (`disponibilidad/page.tsx:26`).
  - API/Action: NO hay fetch a `/api/public/*` en esta vista — a diferencia del perfil (`TG-HP-003`), la semana se resuelve 100% server-side en el Server Component antes del render (`disponibilidad/page.tsx:21-26`); el cambio de tab activo es solo estado local del array `week.days` ya cargado (`WeeklyAvailability.tsx:22-24`).
  - Externos: ninguno.
  - UI-sin-reload: cambiar de tab de día NO dispara red (estado `useState` local); solo el click en un slot navega (Next `<Link>`) a `/reservar`.
- **Evidencia (path:línea):**
  - `src/app/(public)/[slug]/disponibilidad/page.tsx:11` — `export const dynamic = 'force-dynamic'`.
  - `src/app/(public)/[slug]/disponibilidad/page.tsx:40` — h1 "Disponibilidad semanal".
  - `src/app/(public)/[slug]/disponibilidad/components/WeeklyAvailability.tsx:22-24` — `const day = week.days[active]!` (estado local, sin fetch).
  - `src/app/(public)/[slug]/disponibilidad/components/WeeklyAvailability.tsx:50,59` — textos "Sin canchas disponibles este día." / "Sin turnos libres.".
  - `src/app/(public)/[slug]/disponibilidad/components/WeeklyAvailability.tsx:65` — `href={\`/${slug}/reservar?court=${court.id}&date=${day.date}&time=${s.time}&dur=${s.duration}\`}`.
  - `src/app/(public)/[slug]/disponibilidad/loading.tsx:1` — skeleton dedicado.

---

## TG-HP-005 — Landing B2B `/para-complejos` → CTA a `/register`
- **Rol:** Visitante (no autenticado)
- **Prerrequisitos:** Ninguno.
- **Flujo de navegación (UI steps):**
  1. Navegar a `http://localhost:3000/para-complejos`.
  2. Esperar el render del h1 "Tu complejo, siempre lleno." (`src/app/(business)/para-complejos/page.tsx:145-160`).
  3. Verificar la pill "Para dueños y encargados" (`para-complejos/page.tsx:128-134`).
  4. Click en el CTA "Empezar gratis" del hero → navega a `/register` (`para-complejos/page.tsx:169-176`).
  5. (Alternativa) Click en "Ingresar" del hero → navega a `/login` (`para-complejos/page.tsx:177-182`).
  6. Scroll a la sección "Funcionalidades..." y verificar el h2 "Cada función está diseñada para aumentar tu ocupación." (`para-complejos/page.tsx:339-344`).
  7. Scroll al final y click en el CTA final "Empezar gratis" → `/register` (`para-complejos/page.tsx:551-558`), o "Ver planes y precios" → `/precios` (`para-complejos/page.tsx:559-564`).
- **Comportamiento de componentes:**
  - Loading: no aplica — página 100% estática (`export default function ParaComplejosPage()`, sin fetch/DB, sin `loading.tsx` propio en `(business)/para-complejos/`).
  - Anti-doble-submit: no aplica — los CTAs son `<Link>` de navegación, no forms.
  - Feedback: sin toast; el resultado es la navegación del browser a `/register` o `/login` o `/precios`.
- **Validación de datos:**
  - DB: ninguna.
  - API/Action: ninguna.
  - Externos: ninguno.
  - UI-sin-reload: no aplica (navegación completa a otra ruta).
- **Evidencia (path:línea):**
  - `src/app/(business)/para-complejos/page.tsx:145` — h1 "Tu complejo, siempre lleno.".
  - `src/app/(business)/para-complejos/page.tsx:174` — texto del CTA "Empezar gratis".
  - `src/app/(business)/para-complejos/page.tsx:170` — `<Link href="/register" ...>`.
  - `src/app/(business)/para-complejos/page.tsx:178,181` — `<Link href="/login" ...>` texto "Ingresar".
  - `src/app/(business)/para-complejos/page.tsx:559-564` — `<Link href="/precios" ...>` texto "Ver planes y precios".

---

## TG-HP-006 — Precios `/precios`
- **Rol:** Visitante (no autenticado)
- **Prerrequisitos:** Ninguno.
- **Flujo de navegación (UI steps):**
  1. Navegar a `http://localhost:3000/precios`.
  2. Esperar el h1 "Lo que te deja un turno, una vez al mes." (`src/app/(business)/precios/page.tsx:141-156`).
  3. En el selector de plan, click en la opción "3" del radiogroup "¿Cuántas canchas tenés?" (`src/app/(business)/precios/PlanSelector.tsx:34-61`) y verificar el anuncio `aria-live` "Para 3 canchas, tu plan es Complejo." (`PlanSelector.tsx:103-106`, `PLANS[1].name==='Complejo'`, `plans-data.ts:36-43`).
  4. Click en el radio "Anual" del ciclo de facturación (`PlanSelector.tsx:64-100`) y verificar que la card activa muestra el precio tachado mensual + "Ahorrás $X al año" (`PlanSelector.tsx:172-194`).
  5. Click en "Empezar 30 días gratis" de la card activa → navega a `/register` (`PlanSelector.tsx:200-214`).
  6. Scroll a "Cuenta del clavo" (calculadora) (`precios/page.tsx:189-217`, componente `CalculadoraClavo`).
  7. Scroll al FAQ y click en la pregunta "¿Mis clientes tienen que bajarse una app?" para expandir el `<details>` (`precios/page.tsx:52-55,320-334`).
- **Comportamiento de componentes:**
  - Loading: no aplica — página estática (sin fetch/DB); `PlanSelector` y `CalculadoraClavo` son islands `'use client'` con datos locales de `plans-data.ts` (constantes, sin red).
  - Anti-doble-submit: no aplica.
  - Feedback: sin toast; los cambios de canchas/ciclo son puramente visuales (estado local `useState`, `PlanSelector.tsx:25-27`).
- **Validación de datos:**
  - DB: ninguna — "Fuente v1: constantes locales — la página es 100% estática y no depende de la DB en build" (`src/app/(business)/precios/plans-data.ts:4-7`).
  - API/Action: ninguna.
  - Externos: ninguno.
  - UI-sin-reload: no aplica (todo estado local).
- **Evidencia (path:línea):**
  - `src/app/(business)/precios/page.tsx:141` — h1 "Lo que te deja un turno,".
  - `src/app/(business)/precios/PlanSelector.tsx:104-106` — texto `aria-live` "Para {courts} canchas, tu plan es {active.name}.".
  - `src/app/(business)/precios/plans-data.ts:26-53` — 3 planes: Predio ($55.000/mes, 1-2 canchas), Complejo ($85.000/mes, 3-5 canchas), Estadio ($115.000/mes, 6+ canchas) — valores en centavos (`priceMonthly: 5500000/8500000/11500000`).
  - `src/app/(business)/precios/PlanSelector.tsx:209` — texto botón "Empezar 30 días gratis".
  - `src/app/(business)/precios/PlanSelector.tsx:200-201` — `<Link href="/register" ...>`.
  - `src/app/(business)/precios/page.tsx:53-54` — pregunta FAQ "¿Mis clientes tienen que bajarse una app?".

---

## TG-HP-007 — Privacidad `/privacidad`
- **Rol:** Visitante (no autenticado)
- **Prerrequisitos:** Ninguno.
- **Flujo de navegación (UI steps):**
  1. Navegar a `http://localhost:3000/privacidad`.
  2. Esperar el h1 "Política de Privacidad" (`src/app/(public)/privacidad/page.tsx:13-15`).
  3. Verificar el timestamp "Última actualización: 25 de mayo de 2026." (`privacidad/page.tsx:16`).
  4. Verificar la sección "1. Quiénes somos" con el mailto `privacidad@turnogol.app` (`privacidad/page.tsx:20,32-34`).
- **Comportamiento de componentes:**
  - Loading: no aplica — página 100% estática (server component sin fetch/DB).
  - Anti-doble-submit: no aplica — no hay forms.
  - Feedback: no aplica.
- **Validación de datos:**
  - DB: ninguna.
  - API/Action: ninguna.
  - Externos: ninguno.
  - UI-sin-reload: no aplica.
- **Evidencia (path:línea):**
  - `src/app/(public)/privacidad/page.tsx:13-15` — h1 "Política de Privacidad".
  - `src/app/(public)/privacidad/page.tsx:16` — "Última actualización: 25 de mayo de 2026.".
  - `src/app/(public)/privacidad/page.tsx:20` — h2 "1. Quiénes somos".

---

## TG-HP-008 — Términos `/terminos`
- **Rol:** Visitante (no autenticado)
- **Prerrequisitos:** Ninguno.
- **Flujo de navegación (UI steps):**
  1. Navegar a `http://localhost:3000/terminos`.
  2. Esperar el h1 "Términos y Condiciones" (`src/app/(public)/terminos/page.tsx:13-15`).
  3. Verificar el timestamp "Última actualización: 25 de mayo de 2026." (`terminos/page.tsx:16`).
  4. Verificar la sección "1. Objeto del servicio" con el texto "TurnoGol no es la cancha" (`terminos/page.tsx:20,24`).
- **Comportamiento de componentes:**
  - Loading: no aplica — página 100% estática.
  - Anti-doble-submit: no aplica — no hay forms.
  - Feedback: no aplica.
- **Validación de datos:**
  - DB: ninguna.
  - API/Action: ninguna.
  - Externos: ninguno.
  - UI-sin-reload: no aplica.
- **Evidencia (path:línea):**
  - `src/app/(public)/terminos/page.tsx:13-15` — h1 "Términos y Condiciones".
  - `src/app/(public)/terminos/page.tsx:16` — "Última actualización: 25 de mayo de 2026.".
  - `src/app/(public)/terminos/page.tsx:20,24` — h2 "1. Objeto del servicio" + "TurnoGol no es la cancha".

---

## TG-HP-009 — Suspended `/suspended`
- **Rol:** Visitante (no autenticado)
- **Prerrequisitos:** Ninguno — es una página estática de destino (`noIndex`), no requiere que exista un tenant realmente suspendido para renderizarla por URL directa.
- **Flujo de navegación (UI steps):**
  1. Navegar a `http://localhost:3000/suspended`.
  2. Esperar el h1 "Tu cuenta está temporalmente suspendida" (`src/app/(public)/suspended/page.tsx:17-19`).
  3. Verificar el ícono `PauseCircle` sobre fondo ámbar (`suspended/page.tsx:13-15`).
  4. Click en "Soy el dueño — regularizar el pago" → navega a `/reactivar` (`suspended/page.tsx:26-31`).
  5. (Alternativa) Click en "Contactar a soporte" → `mailto:soporte@turnogol.app` (`suspended/page.tsx:33-38`).
  6. (Alternativa) Click en "Volver al inicio" → `/` (`suspended/page.tsx:40-42`).
- **Comportamiento de componentes:**
  - Loading: no aplica — página 100% estática, `robots: { index: false, follow: false }` (`suspended/page.tsx:5-8`).
  - Anti-doble-submit: no aplica — no hay forms, solo `<Link>`/`<a>`.
  - Feedback: sin toast; navegación directa.
- **Validación de datos:**
  - DB: ninguna.
  - API/Action: ninguna.
  - Externos: ninguno.
  - UI-sin-reload: no aplica.
- **Evidencia (path:línea):**
  - `src/app/(public)/suspended/page.tsx:17-19` — h1 "Tu cuenta está temporalmente suspendida".
  - `src/app/(public)/suspended/page.tsx:30` — texto botón "Soy el dueño — regularizar el pago".
  - `src/app/(public)/suspended/page.tsx:27` — `<Link href="/reactivar" ...>`.
  - `src/app/(public)/suspended/page.tsx:34` — `href="mailto:soporte@turnogol.app"`.

---

## TG-HP-010 — Verify estados `/verify` (link expirado y éxito)
- **Rol:** Visitante (no autenticado) — llega desde un magic-link de email (jugador) o desde el callback de auth.
- **Prerrequisitos:** Ninguno (los estados se disparan por query params, sin necesitar un token real de Supabase para el happy-path de UI).

### Caso A — Link expirado
- **Flujo de navegación (UI steps):**
  1. Navegar a `http://localhost:3000/verify?error=expired`.
  2. Esperar el h1 "No pudimos verificar tu enlace" (`src/app/(auth)/verify/page.tsx:154-156`).
  3. Verificar el mensaje "Este enlace expiró. Generá uno nuevo desde Iniciar sesión." (`verify/page.tsx:9,157`).
  4. Click en "Volver a intentar" → navega a `/login` (`verify/page.tsx:158-160`).
- **Comportamiento de componentes:**
  - Loading: sin `error`/`status` en la URL, la vista cae en `LoadingState` con spinner `Loader2` animado y texto "Verificando tu enlace…" (`verify/page.tsx:133-145`) — no aplica a este caso porque `error=expired` fuerza `ErrorState` directo.
  - Anti-doble-submit: no aplica — no hay forms, es un `<Link>`.
  - Feedback: mensaje de error inline (no toast), ícono `AlertCircle` sobre fondo rojo (`verify/page.tsx:151-153`).
- **Validación de datos:** DB/API/Externos: ninguno (la página solo interpreta `searchParams`, no hace fetch). UI-sin-reload: no aplica.
- **Evidencia (path:línea):**
  - `src/app/(auth)/verify/page.tsx:9` — `expired: 'Este enlace expiró. Generá uno nuevo desde Iniciar sesión.'`.
  - `src/app/(auth)/verify/page.tsx:154-156` — h1 "No pudimos verificar tu enlace".
  - `src/app/(auth)/verify/page.tsx:158-160` — `<Link href="/login">Volver a intentar</Link>`.

### Caso B — Éxito (login)
- **Flujo de navegación (UI steps):**
  1. Navegar a `http://localhost:3000/verify?status=success&intent=login&next=%2Fmis-reservas`.
  2. Esperar el h1 "¡Listo!" (intent `login`, `verify/page.tsx:21-25,117`).
  3. Verificar el subtítulo "Iniciaste sesión correctamente." (`verify/page.tsx:23`).
  4. Verificar el contador `aria-live="polite"` "Te llevamos automáticamente en 5s…" decreciendo (`src/app/(auth)/verify/SuccessRedirect.tsx:32-34`).
  5. Click en el CTA "Ir a mis reservas" antes de que expire el auto-redirect → navega a `next` saneado (`verify/page.tsx:24,119-121`).
  6. (Alternativa, sin click) Esperar 5s y verificar el redirect automático vía `window.location.assign(next)` (`SuccessRedirect.tsx:19-21`).
- **Comportamiento de componentes:**
  - Loading: no aplica a este sub-caso (ya resuelto en `status=success`).
  - Anti-doble-submit: no aplica — CTA es un `<Link>`, no un form.
  - Feedback: sin toast; ícono `CheckCircle2` con pulso `animate-ping` (`verify/page.tsx:104-115`).
- **Validación de datos:**
  - DB: ninguna en esta página (la sesión ya fue establecida por el callback de auth antes de llegar acá).
  - API/Action: ninguna en `/verify` — el `next` viaja saneado por `sanitizeNext()` (`src/lib/safe-redirect.ts`, importado en `verify/page.tsx:4`).
  - Externos: ninguno.
  - UI-sin-reload: el auto-redirect usa `window.location.assign(next)` (full navigation, NO `router.push`/`router.refresh`) — `SuccessRedirect.tsx:20`.
- **Evidencia (path:línea):**
  - `src/app/(auth)/verify/page.tsx:21-25` — `SUCCESS_COPY.login = { title: '¡Listo!', subtitle: 'Iniciaste sesión correctamente.', cta: 'Ir a mis reservas' }`.
  - `src/app/(auth)/verify/page.tsx:3` — importa `parseIntent` desde `@/lib/auth-success`; `src/lib/auth-success.ts:12-13` — `parseIntent`: cualquier `intent` inválido cae a `'login'` (`ERROR_COPY`/`VALID_INTENTS`).
  - `src/lib/auth-success.ts:26-28` — `successVerifyPath(next, intent)` arma `/verify?status=success&next=...&intent=...` (usado por el callback real).
  - `src/app/(auth)/verify/SuccessRedirect.tsx:33` — texto "Te llevamos automáticamente en {remaining}s…".
  - `src/app/(auth)/verify/SuccessRedirect.tsx:20` — `window.location.assign(next)`.

---

## GAPS

- **TG-HP-002**: el contrato pide "listá los filtros reales que existen" — están listados en el caso, pero el filtro "Formato" completo (Fútbol 4 a 11) no se ejercita paso a paso en el flujo (solo se cubren los quick-chips 5/7/11); un sub-agente que quiera cubrir Fútbol 4/6/8/9/10 debe abrir el drawer y usar los botones de `ExplorarFilters.tsx:145-167` directamente.
- **TG-HP-003 / TG-HP-004**: no hay una constante compartida de "hoy en ART" entre ambas vistas — el perfil calcula `today` client-side (`AvailabilityGrid.tsx:44-47`, `Date.now() - 3h`) y la semanal lo hace server-side con la misma fórmula (`disponibilidad/page.tsx:17-19`); no es un GAP funcional, pero un sub-agente que compare fechas entre ambas vistas en el borde de medianoche ART puede ver desincronía de 1 día si corre el test justo en el corte — no vale la pena un caso aparte, se deja documentado.
- **TG-HP-010**: no se ubicó una página o mock que dispare el estado `LoadingState` (spinner "Verificando tu enlace…") de forma determinística sin backend real — ese estado solo ocurre en el instante entre el mount y el redirect del callback de Supabase (no hay un query param que lo fuerce, ver `verify/page.tsx:57-60`: sin `status=success` y sin `error` cae ahí, pero eso es exactamente "ningún param" — se puede navegar a `/verify` a secas para verlo, pero es una vista transitoria real, no un estado controlable por query param como los otros dos).
- No se redactó ningún caso para `/reservar` (formulario de reserva, checkout con/sin seña) — está fuera de los 10 IDs pedidos (TG-HP-001 a TG-HP-010 son estrictamente los listados en el contrato); si el bloque de reserva/checkout es un lote aparte, no está cubierto acá.


---

# Bloque 1 — Jugador

# TG-HP-1xx — Happy paths rol JUGADOR

Fixtures usados en todos los casos (ver contrato):
- Tenant Demo: slug `e2e-complejo-demo`, `requires_deposit:false`, cancha `00000000-0000-4000-8000-000000000010`.
- Tenant Seña: slug `e2e-complejo-sena`, `requires_deposit:true` 50%, `mp_access_token='mock-mp-token'`, cancha `00000000-0000-4000-8000-000000000031`.
- Jugador: `e2e-player@turnogol.test`, player_id `00000000-0000-4000-8000-000000000020`.
- Base URL `http://localhost:3000`. MP mock (`MP_MOCK_MODE=1`): checkout en `/mock-mp/checkout`. Inbucket `http://127.0.0.1:54324`.

---

## TG-HP-101 — Alta jugador NUEVO al reservar
- **Rol:** Jugador
- **Prerrequisitos:** Sin sesión (cookies limpias). Jugador con email nuevo (no existe fila en `players`). Slot libre en tenant Demo (cancha `...010`, cualquier fecha/hora dentro de `booking_advance_days`).
- **Flujo de navegación (UI steps):**
  1. Navegar a `http://localhost:3000/e2e-complejo-demo/reservar?court=00000000-0000-4000-8000-000000000010&date=<YYYY-MM-DD>&time=<HH:MM>&dur=60` (URL armada por la grilla pública; para el caso de test se puede navegar directo).
  2. Como no hay sesión de jugador, la page renderiza `LoginGate` (src/app/(public)/[slug]/reservar/page.tsx:118-131).
  3. Rellenar `firstName` con `"Juan"`, `lastName` con `"Pérez"`, `email` con `"e2e-player@turnogol.test"` (input `name="email"` type=email).
  4. Tildar el checkbox `name="terms"` ("Soy mayor de 18 años y acepto los términos y condiciones de uso (declaración jurada)." — LoginGate.tsx:70).
  5. Click en el botón `"Continuar con email"` (LoginGate.tsx:20-21).
  6. Esperar el estado `sent`: card con h2 `"Revisá tu email"` y texto `"Te enviamos un enlace a <email>. Hacé click para confirmar tu reserva."` (LoginGate.tsx:41-42).
  7. Abrir Inbucket (`http://127.0.0.1:54324`), abrir el mensaje enviado a `e2e-player@turnogol.test`, click en el link del magic link (apunta a `/api/auth/callback?token_hash=...&type=email&next=/e2e-complejo-demo/reservar?...`).
  8. El callback (`src/app/api/auth/callback/route.ts:54,73-100`) verifica el OTP, crea el jugador si no existe, y redirige a `/verify?status=success&next=<next>&intent=booking`.
  9. En `/verify`, esperar h1 `"¡Cuenta confirmada!"` con subtítulo `"Volvé para terminar tu reserva."` y botón `"Continuar con mi reserva"` (src/app/(auth)/verify/page.tsx:16-19,117-121). Auto-redirect a los 5s (SuccessRedirect.tsx:5,32-34) o click manual en el botón.
  10. Aterriza de nuevo en `/e2e-complejo-demo/reservar?...`, ahora con sesión (`isPlayer=true`) → renderiza `ConfirmBookingButton` en vez de `LoginGate` (page.tsx:118-128).
- **Comportamiento de componentes:**
  - Loading: botón `Submit` de LoginGate deshabilitado vía `useFormStatus().pending`, texto cambia a `"Enviando…"` con spinner `Loader2` (LoginGate.tsx:16-22).
  - Anti-doble-submit: `disabled={pending}` en el mismo botón (LoginGate.tsx:19), estado gestionado por `useActionState` (LoginGate.tsx:3,33).
  - Feedback: no hay toast — la propia `GateState` cambia a `{status:'sent'}` y re-renderiza el card de confirmación in-place (LoginGate.tsx:35-45); luego redirect real vía `NextResponse.redirect` del callback (route.ts:100) y auto-redirect client-side de `/verify` (SuccessRedirect.tsx:19-21).
- **Validación de datos:**
  - DB: fila nueva en `players` (email lower-cased, `first_name`, `last_name`, `agreed_to_terms_at=NOW()`, `terms_version`) — `INSERT INTO players ... ON CONFLICT (email) DO UPDATE` (src/modules/players/player.service.ts:24,52-63).
  - API/Action: `sendPlayerMagicLink` (src/app/(public)/[slug]/reservar/actions.ts:49) → `{status:'sent'}` en éxito (actions.ts:79). `GET /api/auth/callback` → 302 a `/verify?...` (route.ts:100).
  - Externos: Resend envía el magic link vía `supabase.auth.signInWithOtp` (src/modules/auth/auth.service.ts:27-39) — visible en Inbucket `:54324`, `user_metadata` lleva `is_player`, `first_name`, `last_name`, `agreed_terms`, `terms_version` (auth.service.ts:31-37).
  - UI-sin-reload: no aplica (son navegaciones reales / redirects de servidor, no revalidatePath).
- **Evidencia (path:línea):**
  - `src/app/(public)/[slug]/reservar/page.tsx:118-131` — render condicional LoginGate vs ConfirmBookingButton según sesión.
  - `src/app/(public)/[slug]/reservar/components/LoginGate.tsx:41-42,50-51,68-71` — copy exacto del form y del estado "sent".
  - `src/app/(public)/[slug]/reservar/actions.ts:49-80` — `sendPlayerMagicLink`.
  - `src/app/api/auth/callback/route.ts:54,71-100` — verifyOtp + `getOrCreatePlayer` + redirect a `/verify`.
  - `src/modules/players/player.service.ts:24-65` — `getOrCreatePlayer` (INSERT/UPDATE de `players`).
  - `src/app/(auth)/verify/page.tsx:16-19,117-121` — copy de éxito intent=booking.
  - `src/app/(auth)/verify/SuccessRedirect.tsx:5,19-21,32-34` — auto-redirect 5s.

---

## TG-HP-102 — Login jugador EXISTENTE `/ingresar`
- **Rol:** Jugador
- **Prerrequisitos:** Sin sesión activa (expirada/cerrada). Jugador ya existe en `players` (`e2e-player@turnogol.test`, `player_id=...020`).
- **Flujo de navegación (UI steps):**
  1. Navegar a `http://localhost:3000/ingresar`.
  2. Ver h1 `"Accedé a tu cuenta"` (IngresarForm.stories aparte; texto real en `src/app/(auth)/ingresar/IngresarForm.tsx:92-104`, "cuenta" con gradient span).
  3. Rellenar el input `id="email"` `name="email"` con `"e2e-player@turnogol.test"`.
  4. Click en el botón `"Enviarme el enlace"` (IngresarForm.tsx:150).
  5. Esperar el estado `sent`: h1 `"Revisá tu email"`, texto `"Te enviamos un enlace de acceso a <email>."` (IngresarForm.tsx:81-84).
  6. Abrir Inbucket `:54324`, abrir el mail a `e2e-player@turnogol.test`, click en el link.
  7. Callback (`route.ts:54,73-100`) reconoce `is_player=true` (ya en `app_metadata`/`user_metadata` de logins previos), NO reescribe `agreed_terms` (no se le pasa perfil — `signInWithExistingPlayerMagicLink`, actions.ts:40), redirige a `/verify?status=success&next=/mis-reservas&intent=login` (default `next` si no vino uno, actions.ts:38: `sanitizeNext(..., '/mis-reservas')`).
  8. En `/verify` ver h1 `"¡Listo!"`, subtítulo `"Iniciaste sesión correctamente."`, botón `"Ir a mis reservas"` (verify/page.tsx:21-24). Auto-redirect a los 5s o click manual.
  9. Aterriza en `/mis-reservas` con sesión de jugador activa.
- **Comportamiento de componentes:**
  - Loading: `SubmitButton` deshabilitado vía `useFormStatus().pending`, texto `"Enviando…"` + `Loader2` (IngresarForm.tsx:136-154).
  - Anti-doble-submit: `disabled={pending}` (IngresarForm.tsx:141).
  - Feedback: `useActionState` cambia el card in-place a estado `sent` (IngresarForm.tsx:61,65-86); no hay toast.
- **Validación de datos:**
  - DB: NO inserta jugador nuevo — `getOrCreatePlayer` toma la rama `existing.length>0` y solo actualiza `last_login_at` (player.service.ts:38,47).
  - API/Action: `playerLoginAction` (src/app/(auth)/ingresar/actions.ts:20) → `{status:'sent', email}` (actions.ts:44).
  - Externos: Resend vía `signInWithExistingPlayerMagicLink` (auth.service.ts:49-60) — visible en Inbucket.
  - UI-sin-reload: no aplica (navegación real).
- **Evidencia (path:línea):**
  - `src/app/(auth)/ingresar/page.tsx:100` — `IngresarForm action={playerLoginAction}`.
  - `src/app/(auth)/ingresar/IngresarForm.tsx:81-84,92-105,150` — copy exacto.
  - `src/app/(auth)/ingresar/actions.ts:20-45` — `playerLoginAction`, `next` default `/mis-reservas` (línea 38).
  - `src/app/api/auth/callback/route.ts:73-100` — misma rama `isPlayer` que TG-HP-101, sin perfil nuevo.
  - `src/lib/auth-success.ts:21-23` — `playerSuccessIntent` clasifica `next` no-booking como `'login'`.
  - `src/app/(auth)/verify/page.tsx:21-24` — copy `intent='login'`.

---

## TG-HP-103 — Reserva online SIN seña (tenant Demo) → confirma instantáneo
- **Rol:** Jugador
- **Prerrequisitos:** Sesión de jugador activa (`e2e-player@turnogol.test`). Tenant Demo (`e2e-complejo-demo`, `requires_deposit:false`). Slot libre cancha `...010`.
- **Flujo de navegación (UI steps):**
  1. Navegar a `http://localhost:3000/e2e-complejo-demo/reservar?court=00000000-0000-4000-8000-000000000010&date=<YYYY-MM-DD>&time=<HH:MM>&dur=60`.
  2. Ver h1 `"Confirmá tu reserva"` (page.tsx:101).
  3. Ver `BookingSummary` con precio del slot, sin bloque de seña (`depositAmount=0` porque `tenant.requiresDeposit=false`, page.tsx:68-70).
  4. Como hay sesión, se renderiza `ConfirmBookingButton` con `payMethods` presenciales (cash/transfer según config, `depositAmount>0` sería solo MP — page.tsx:75-81).
  5. Click en el botón `"Confirmar reserva"` (texto condicional `depositAmount>0 ? 'Pagar seña y reservar' : 'Confirmar reserva'`, ConfirmBookingButton.tsx:13).
  6. `createBookingAndCheckout` inserta el booking con `status:'confirmed'` de una (booking.service.ts:433,436: `withDeposit` es `false`) y redirige a `/reserva/<bookingId>/exito` (reservar/actions.ts:169-170).
  7. En `/reserva/<id>/exito` ver h1 `"¡Reserva confirmada!"` (BookingSuccessCard.tsx:52-54), texto `"Pagás <precio> al llegar al complejo."` (depositStatus='not_required', BookingSuccessCard.tsx:60-63), QR de verificación y botón `"Ver mis reservas"`.
- **Comportamiento de componentes:**
  - Loading: botón `Inner` de ConfirmBookingButton deshabilitado vía `useFormStatus().pending`, texto `"Procesando…"` + spinner (ConfirmBookingButton.tsx:8-16).
  - Anti-doble-submit: `disabled={pending}` (ConfirmBookingButton.tsx:11).
  - Feedback: no hay toast; es un `redirect()` real de servidor (Server Action `createBookingAndCheckout` sin retorno, actions.ts:92,200).
- **Validación de datos:**
  - DB: `bookings.status='confirmed'`, `deposit_status='not_required'`, `deposit_amount=0`, `payment_method` = `cash`/`transfer` si el jugador lo eligió (booking.service.ts:433,436-437).
  - API/Action: `createBookingAndCheckout` (src/app/(public)/[slug]/reservar/actions.ts:92) → sin 200/201 JSON (Server Action con `redirect()`), pero commitea la tx y redirige 303 a `/reserva/<id>/exito`.
  - Externos: sin MP (no hay `mpAccessToken` requerido en esta rama).
  - UI-sin-reload: no aplica — navegación real vía `redirect()`.
- **Evidencia (path:línea):**
  - `src/app/(public)/[slug]/reservar/page.tsx:67-70,75-81,101,118-131` — h1, cálculo de `depositAmount=0`, `payMethods`, render `ConfirmBookingButton`.
  - `src/app/(public)/[slug]/reservar/components/ConfirmBookingButton.tsx:8-16,39-42` — label del botón y hint.
  - `src/app/(public)/[slug]/reservar/actions.ts:92,138,169-170` — `withDeposit` false → `status:'confirmed'` → redirect a `/exito`.
  - `src/modules/bookings/booking.service.ts:415-437` — inserción `status: withDeposit ? 'pending_payment' : 'confirmed'`.
  - `src/app/reserva/[bookingId]/exito/BookingSuccessCard.tsx:52-54,60-63` — h1 y copy "sin seña".

---

## TG-HP-104 — Reserva online CON seña (tenant Seña) → Checkout mock → aprobar
- **Rol:** Jugador
- **Prerrequisitos:** Sesión de jugador activa. Tenant Seña (`e2e-complejo-sena`, `requires_deposit:true` 50%, `mp_access_token='mock-mp-token'`). Slot libre cancha `...031`. `MP_MOCK_MODE=1`.
- **Flujo de navegación (UI steps):**
  1. Navegar a `http://localhost:3000/e2e-complejo-sena/reservar?court=00000000-0000-4000-8000-000000000031&date=<YYYY-MM-DD>&time=<HH:MM>&dur=60`.
  2. Ver h1 `"Confirmá tu reserva"` y `BookingSummary` con seña calculada (`depositAmount = round(price*50/100)`, page.tsx:68-70).
  3. `payMethods` es solo `['mercadopago']` (depositAmount>0, page.tsx:75-77) — `PaymentMethodSelector` no ofrece cash/transfer.
  4. Click en el botón `"Pagar seña y reservar"` (ConfirmBookingButton.tsx:13, `depositAmount>0`).
  5. `createBookingAndCheckout` inserta `status:'pending_payment'`, `deposit_status:'pending'` (booking.service.ts:433,436), llama `createDepositPayment` y redirige al `initPoint` de MP (reservar/actions.ts:169-179) → en mock, aterriza en `/mock-mp/checkout?booking=<id>&pref=...`.
  6. En el mock, ver banner `"Entorno de prueba (MOCK)"` y h1 `"Pago de seña"` (MockCheckoutView.tsx:35-45), con el resumen (complejo/cancha/fecha/horario/seña).
  7. Click en `"Pagar (aprobado)"` (MockCheckoutView.tsx:80-86).
  8. `mockPay` dispara el webhook interno a `/api/webhooks/mercadopago` con `type:'payment', status implícito approved` y redirige a `/reserva/<id>/exito` (mock-mp/checkout/actions.ts:43-98).
  9. En `/reserva/<id>/exito`, si el webhook ya procesó, ver directo `BookingSuccessCard` con h1 `"¡Reserva confirmada!"`, `"Seña pagada: <monto>"` y `"Resta abonar en el complejo: <resto>"` (BookingSuccessCard.tsx:65-68); si aún no, se monta `PaymentStatusWatcher` que muestra el mismo h1 al llegar a `status='confirmed'` vía polling (exito/page.tsx:75-91; PaymentStatusWatcher.tsx:116-123).
- **Comportamiento de componentes:**
  - Loading: mismo botón `Inner` de ConfirmBookingButton con `"Procesando…"` (ConfirmBookingButton.tsx:12).
  - Anti-doble-submit: `disabled={pending}` (ConfirmBookingButton.tsx:11); en el mock checkout no hay `useFormStatus` (los 3 botones son `formAction` distintos del mismo `<form>`, MockCheckoutView.tsx:76-105 — sin estado pending visible).
  - Feedback: sin toast; redirect real del webhook mock a `/exito`, y `PaymentStatusWatcher` hace polling a `/api/player/bookings/<id>/status` cada 3s con backoff hasta 30s (PaymentStatusWatcher.tsx:67-114) y renderiza el h1 de confirmado al detectar `status==='confirmed'` (`aria-live="polite"`, línea 118).
- **Validación de datos:**
  - DB: `bookings.status='confirmed'`, `deposit_status='paid'` (transitionFromPendingPayment, booking.concurrency.ts:33-35), 1 fila en `payments` con `status='approved'` (`upsertPaymentRow`, payment.service.ts:294).
  - API/Action: `createBookingAndCheckout` (actions.ts:92) → redirect a MP/mock; webhook `POST /api/webhooks/mercadopago` procesado inline en mock (`dispatchPaymentInfo`, payment.service.ts:219-241 rama `info.status==='approved'` → `handleApproved`, línea 280).
  - Externos: MP mock — `buildMockPaymentId`/`buildMockEventId` (mock-mp/checkout/actions.ts:7,52-56); Resend encola `booking_confirmed` a `notifications` y lo despacha (`enqueueNotification`, payment.service.ts:339-357; tabla `notifications`, src/modules/notifications/notification.service.ts:2,50).
  - UI-sin-reload: no aplica en `/exito` (SSR + polling propio, no `revalidatePath`); `router.refresh()` no se usa en este flujo.
- **Evidencia (path:línea):**
  - `src/app/(public)/[slug]/reservar/page.tsx:67-70,75-77` — cálculo de seña y `payMethods=['mercadopago']`.
  - `src/app/(public)/[slug]/reservar/actions.ts:169,172-179` — rama `pending_payment` → `createDepositPayment` → redirect a `initPoint`.
  - `src/app/mock-mp/checkout/MockCheckoutView.tsx:35-45,80-86` — banner mock, h1, botón aprobado.
  - `src/app/mock-mp/checkout/actions.ts:43-98` — `mockPay` webhook + redirect a `/exito`.
  - `src/modules/payments/payment.service.ts:224-241,280-315` — `dispatchPaymentInfo`/`handleApproved`, `upsertPaymentRow` status `approved`.
  - `src/modules/bookings/booking.concurrency.ts:21-57` — `transitionFromPendingPayment('confirmed')` seta `depositStatus:'paid'`.
  - `src/app/reserva/[bookingId]/exito/BookingSuccessCard.tsx:52-54,65-68` — copy con seña.
  - `src/components/booking/PaymentStatusWatcher.tsx:67-114,116-123` — polling + h1 confirmado.

---

## TG-HP-105 — Pago RECHAZADO → error → sigue pending_payment → expira
- **Rol:** Jugador
- **Prerrequisitos:** Igual a TG-HP-104 hasta llegar a `/mock-mp/checkout`.
- **Flujo de navegación (UI steps):**
  1. En `/mock-mp/checkout?booking=<id>`, click en `"Pago rechazado"` (MockCheckoutView.tsx:89-95).
  2. `mockReject` dispara el webhook con `status` rechazado (`buildMockPaymentId('rejected', bookingId)`, actions.ts:110-114) y redirige a `/reserva/<id>/error` (actions.ts:143).
  3. En `/reserva/<id>/error`, ver h1 `"El pago no se procesó."`, texto `"El pago fue rechazado o cancelado. Podés intentar de nuevo con otro medio."` (BookingErrorCard.tsx:44-47).
  4. Dentro de la ventana de hold (`DEFAULT_EXPIRY_SECONDS`=360s desde `created_at`), el botón visible es `"Reintentar pago"` (BookingErrorCard.tsx:49-55; `withinWindow`, error/page.tsx:48-50).
  5. Esperar (o simular con reloj adelantado en test) a que pasen los ~6 minutos sin reintentar: el worker/cron de expiración transiciona el booking a `expired` (expire-pending-booking.worker.ts:19-38 → `expirePendingBookingWithPolicy`, booking.expiry.ts:134-283) y libera el slot.
  6. Volviendo a cargar `/reserva/<id>/error` después de expirar, `withinWindow` es `false` → CTA cambia a `"Reservar de nuevo"` que linkea a `/e2e-complejo-sena` (BookingErrorCard.tsx:56-59).
- **Comportamiento de componentes:**
  - Loading: no hay spinner en `/error` (server component estático); el form de reintento es un submit normal sin `useFormStatus` visible en `BookingErrorCard`.
  - Anti-doble-submit: no implementado explícitamente en `BookingErrorCard` (sin `disabled` en el botón de reintento, BookingErrorCard.tsx:52).
  - Feedback: sin toast; todo son `redirect()`/navegación real de servidor.
- **Validación de datos:**
  - DB inmediato tras rechazo: `bookings.status` SIGUE `'pending_payment'` (el webhook `rejected` solo hace `upsertPaymentRow(..., 'rejected', tx)`, NO transiciona el booking — payment.service.ts:247-254); fila en `payments` con `status='rejected'`.
  - DB tras expirar: `bookings.status='expired'` vía `transitionFromPendingPayment(bookingId,'expired',tx)` (booking.service.ts:673-678; booking.concurrency.ts:21-57) y `invalidateCourtDateSlots` libera el slot (booking.concurrency.ts:52).
  - API/Action: `retryDepositPaymentAction` (reservar/actions.ts:203) — reintento genera nueva preferencia MP; no aplica si se deja expirar.
  - Externos: webhook mock `POST /api/webhooks/mercadopago` con `type:'payment'`, `data.id` de `buildMockPaymentId('rejected', bookingId)` (mock-mp/checkout/actions.ts:110-127).
  - UI-sin-reload: no aplica (todas son navegaciones server-driven).
- **Evidencia (path:línea):**
  - `src/app/mock-mp/checkout/MockCheckoutView.tsx:89-95` — botón "Pago rechazado".
  - `src/app/mock-mp/checkout/actions.ts:101-144` — `mockReject`.
  - `src/app/reserva/[bookingId]/error/page.tsx:44-58` — `withinWindow` con `DEFAULT_EXPIRY_SECONDS`.
  - `src/app/reserva/[bookingId]/error/BookingErrorCard.tsx:44-59` — copy y CTAs condicionales.
  - `src/modules/payments/payment.service.ts:247-254` — rama `rejected` no toca `bookings.status`.
  - `src/shared/jobs/definitions.ts:33` — `DEFAULT_EXPIRY_SECONDS = 6*60`.
  - `src/shared/jobs/workers/expire-pending-booking.worker.ts:19-38` — consumer + sweep cada 5 min.
  - `src/modules/bookings/booking.expiry.ts:134-283` — `expirePendingBookingWithPolicy`.
  - `src/modules/bookings/booking.service.ts:673-678` — `expirePendingBooking` → `transitionFromPendingPayment(...,'expired',...)`.
  - `src/modules/bookings/booking.concurrency.ts:21-57` — UPDATE condicional `status='expired'` + `invalidateCourtDateSlots`.

---

## TG-HP-106 — Pago PENDIENTE → `/reserva/[id]/pendiente` (watcher)
- **Rol:** Jugador
- **Prerrequisitos:** Booking con `status='pending_payment'` recién creado (tenant Seña), sin resolver aún (ni aprobado ni rechazado) — p.ej. tras `createBookingAndCheckout` antes de completar el mock, o transferencia `in_process`.
- **Flujo de navegación (UI steps):**
  1. Navegar (o ser redirigido) a `http://localhost:3000/reserva/<bookingId>/pendiente`.
  2. La page carga el booking server-side y calcula `expiresAt = createdAt + 360s`; monta `PaymentStatusWatcher` con `initialStatus='pending_payment'` (pendiente/page.tsx:24-59).
  3. Ver h2 `"Confirmando tu pago…"`, texto `"Esto puede tardar unos segundos."` y contador `"Te queda <mm:ss> para completar el pago."` vía `ExpiryCountdown` (PaymentStatusWatcher.tsx:197-210).
  4. A los 30s sin resolver, aparece `"¿Tarda? Te avisamos por email apenas se confirme."` (PaymentStatusWatcher.tsx:211-215, `showDelayNote`).
  5. El componente hace polling a `GET /api/player/bookings/<id>/status` cada 3s con backoff exponencial hasta 30s (PaymentStatusWatcher.tsx:67-114).
  6. Cuando el status responde `'confirmed'`, re-renderiza a h1 `"¡Reserva confirmada!"` (línea 116-131); si `expiresAt` se cumple sin transición, pasa a `stalled='expired'` → h1 `"Se acabó el tiempo"` (líneas 51-60, 172-193).
- **Comportamiento de componentes:**
  - Loading: ícono `Loader2` animado mientras `status` no es terminal (PaymentStatusWatcher.tsx:199-201).
  - Anti-doble-submit: no aplica (no hay form, es polling read-only).
  - Feedback: sin toast; todo es re-render in-place por `aria-live="polite"` (líneas 118,136,155,174,198) — no hay `router.refresh()` ni `revalidatePath`, el estado se actualiza vía `setStatus` local tras cada fetch (línea 94).
- **Validación de datos:**
  - DB: lectura de `bookings.status`/`deposit_status`/`created_at` bajo `withPlayerContext` (RLS) — `GET /api/player/bookings/[id]/status` (route.ts:20-25,41-45).
  - API/Action: `GET /api/player/bookings/<id>/status` → `{data:{status, depositStatus, expiresAt}}` (route.ts:41-45); 404 si la RLS oculta el booking de otro jugador (route.ts:31-34).
  - Externos: ninguno directo en este caso (solo polling interno).
  - UI-sin-reload: confirmado — `PaymentStatusWatcher` actualiza sin recargar la página ni `router.refresh()` (setState + fetch loop, líneas 27-114).
- **Evidencia (path:línea):**
  - `src/app/reserva/[bookingId]/pendiente/page.tsx:24-59` — carga booking + `expiresAt` + monta watcher.
  - `src/components/booking/PaymentStatusWatcher.tsx:37-60,67-114,196-217` — delay note, stall, polling, UI "Confirmando tu pago…".
  - `src/app/api/player/bookings/[id]/status/route.ts:12-46` — endpoint de polling.

---

## TG-HP-107 — Mis reservas `/mis-reservas` (tabs Próximas/Historial)
- **Rol:** Jugador
- **Prerrequisitos:** Sesión activa. Al menos 1 booking con `date >= hoy` (para Próximos) y 1 con `date < hoy` (para Historial), en cualquier tenant vinculado.
- **Flujo de navegación (UI steps):**
  1. Navegar a `http://localhost:3000/mis-reservas`.
  2. Ver h1 `"Mis reservas"` dentro de la banda hero (MisReservasView.tsx:148-153).
  3. Tab por defecto `"Próximos"` activo (`/mis-reservas?tab=proximos`, MisReservasView.tsx:163-165; page.tsx:52 default `'proximos'`).
  4. Click en el tab `"Historial"` (`/mis-reservas?tab=historial`, MisReservasView.tsx:166-168) → navega y refiltra server-side (`b.date < today`, page.tsx:105-107).
  5. Cada card muestra cancha, complejo, badge de estado (`STATUS_LABELS`: `Confirmado`/`Pago pendiente`/`Jugada`/`Cancelado (con reembolso)`/`Cancelado (sin reembolso)`/`Ausente`/`Expirado`, MisReservasView.tsx:66-74), horario y precio.
  6. Si `bookings.length===0`: empty state con h2 `"Todavía no tenés reservas"` (tab proximos) o `"Historial vacío"` (tab historial) + botón `"Explorar complejos"` (MisReservasView.tsx:172-194).
- **Comportamiento de componentes:**
  - Loading: no hay skeleton visible en el snippet leído — la page es Server Component (`page.tsx`), la navegación entre tabs es un `<Link>` real (no client fetch).
  - Anti-doble-submit: no aplica (navegación por link).
  - Feedback: ninguno (SSR puro por query param `tab`).
- **Validación de datos:**
  - DB: query cruda `bookings JOIN courts JOIN tenants WHERE b.player_id=<playerId>` bajo `withPlayerContext` (page.tsx:54-69), filtrado por `tab` en memoria (líneas 105-107).
  - API/Action: no aplica (Server Component, sin Server Action de lectura).
  - Externos: ninguno.
  - UI-sin-reload: no aplica — cambio de tab es navegación real con nuevo `searchParams.tab`.
- **Evidencia (path:línea):**
  - `src/app/(player)/mis-reservas/page.tsx:42-118` — query + filtrado por tab.
  - `src/app/(player)/mis-reservas/MisReservasView.tsx:66-96,148-194` — labels de estado, h1, tabs, empty states.

---

## TG-HP-108 — Cancelar reserva dentro de plazo → libera slot
- **Rol:** Jugador
- **Prerrequisitos:** Sesión activa. Booking propio `status='confirmed'`, con `starts_at` a más de `cancellation_policy.hours_before` (default 24h) en el futuro — para que el resultado sea reembolso si tenía seña.
- **Flujo de navegación (UI steps):**
  1. Navegar a `/mis-reservas` (tab Próximos).
  2. En la card del booking `confirmed`, click en `"Cancelar"` (CancelBookingButton.tsx:72-78).
  3. Se abre `ConfirmDialog` con título `"¿Cancelar esta reserva?"`, descripción con cancha/fecha/hora y la consecuencia concreta: `"No hay seña que devolver."` / `"Se te devuelve la seña de <monto>."` / `"Perdés la seña de <monto>."` según `cancellation_outcome` precomputado server-side (CancelBookingButton.tsx:42-46,83-91).
  4. Opcional: rellenar textarea `id="cancel-reason"` (placeholder `"Ej: no puedo ir, lluvia, equivocación de horario..."`, línea 108).
  5. Click en `"Sí, cancelar"` (`confirmLabel`, línea 93).
  6. `cancelMyBookingAction(bookingId, reason)` corre `cancelByPlayer` — booking pasa a `canceled_refunded` (dentro de plazo) y, si tenía seña, se prepara el refund.
  7. `router.refresh()` tras éxito (CancelBookingButton.tsx:66) refresca la lista in-place: la card ya no muestra el botón `"Cancelar"` (solo visible si `status==='confirmed'`, MisReservasView.tsx:263-273) y el badge pasa a `"Cancelado (con reembolso)"`.
- **Comportamiento de componentes:**
  - Loading: `ConfirmDialog` (`@/components/ui/confirm-dialog`) gestiona el pending con `useTransition`; mientras `isPending` el botón `"Sí, cancelar"` muestra `"Procesando…"` (confirm-dialog.tsx:36,41,123).
  - Anti-doble-submit: botón confirmar `disabled={confirmDisabled}` = `isPending || !phraseOk` (confirm-dialog.tsx:41,119); el botón `"Volver"` también se deshabilita mientras pending (línea 111) y `handleOpenChange` ignora el cierre mientras procesa (línea 44). No es un `<form action>`: `handleConfirm` llama al `onConfirm` inyectado (`CancelBookingButton.tsx:61-68`) dentro de `startTransition` (confirm-dialog.tsx:52-71).
  - Feedback: sin toast — en error, `role="alert"` inline dentro del dialog con el mensaje devuelto (confirm-dialog.tsx:57-58,103-107); en éxito, el dialog se cierra (`onOpenChange(false)`, línea 62) y `router.refresh()` re-renderiza la lista (CancelBookingButton.tsx:66).
- **Validación de datos:**
  - DB: `bookings.status='canceled_refunded'` (dentro de plazo) o `'canceled_no_refund'` (fuera de plazo), `canceled_by='player'`, `canceled_at`, `canceled_reason`, `deposit_status` pasa a `'refunded'` (seña MP o efectivo/transferencia dentro de plazo) o `'captured'` (fuera de plazo) (booking.cancellation.ts:164-201). Slot liberado vía `invalidateCourtDateSlots(b.court_id, b.date)` (línea 213).
  - API/Action: `cancelMyBookingAction` (src/app/(player)/mis-reservas/actions.ts:41) → `PlayerBookingActionResult` `{success:true, booking}` (línea 156).
  - Externos: si había seña MP, `settleRefund` llama a MP después del commit (actions.ts:140-154); email `booking_canceled` encolado dentro de la tx y despachado tras commit (actions.ts:118-134; booking.cancellation.ts:221-241 `templateName:'booking_canceled'`).
  - UI-sin-reload: confirmado — `revalidatePath('/mis-reservas')` en la Server Action (actions.ts:116) + `router.refresh()` en el cliente (CancelBookingButton.tsx:66).
- **Evidencia (path:línea):**
  - `src/app/(player)/mis-reservas/CancelBookingButton.tsx:42-46,61-68,72-78,83-97,99-111` — copy, handler, dialog.
  - `src/components/ui/confirm-dialog.tsx:36-71,108-124` — `useTransition`, botón "Procesando…", `disabled={confirmDisabled}`.
  - `src/app/(player)/mis-reservas/actions.ts:41-157` — `cancelMyBookingAction` completa (rate-limit, pre-read RLS, `withTenantContext`, `revalidatePath`, dispatch email, `settleRefund`).
  - `src/modules/bookings/booking.cancellation.ts:132-252` — `cancelByPlayer` (política horaria, `targetStatus`, `deposit_status`, `invalidateCourtDateSlots`, notificación `booking_canceled`).
  - `src/app/(player)/mis-reservas/MisReservasView.tsx:263-273` — botón "Cancelar" solo si `status==='confirmed'`.

---

## TG-HP-109 — Editar perfil `/perfil` (nombre/apellido/teléfono/zona)
- **Rol:** Jugador
- **Prerrequisitos:** Sesión activa.
- **Flujo de navegación (UI steps):**
  1. Navegar a `http://localhost:3000/perfil` (tab default `"datos"`, page.tsx:68-70).
  2. Ver header con avatar (imagen real si `avatarUrl` no es null, o fallback de iniciales — NO hay control de upload, ver GAPS) y nombre/email (ProfileHeaderNav.tsx:38-56).
  3. Rellenar `id="first_name"`, `id="last_name"` (requeridos), `PhoneInput` `id="phone"`, `id="preferred_area"` (placeholder `"Ej: Palermo, Villa Crespo..."`) — el campo `email` está deshabilitado/solo lectura con nota `"El email no puede modificarse."` (ProfileForm.tsx:111-117).
  4. Click en `"Guardar cambios"` (ProfileForm.tsx:44).
  5. Esperar mensaje `role="status"` `"Perfil actualizado"` debajo del form (ProfileForm.tsx:126-130).
- **Comportamiento de componentes:**
  - Loading: botón deshabilitado vía `useFormStatus().pending`, texto `"Guardando…"` (ProfileForm.tsx:36-47).
  - Anti-doble-submit: `disabled={pending}` (línea 41-42).
  - Feedback: NO hay toast — mensaje `role="status"` inline `"Perfil actualizado"` solo tras `didSubmit && state.success` (líneas 126-130); errores en `role="alert"` (líneas 121-125).
- **Validación de datos:**
  - DB: `UPDATE players SET first_name, last_name, phone, preferred_area WHERE id=<playerId>` bajo `withPlayerContext` (perfil/actions.ts:44-59).
  - API/Action: `updateProfileAction` (perfil/actions.ts:21) → `{success:true}` (línea 68) o `{success:false, error}` (líneas 37,58,64).
  - Externos: ninguno.
  - UI-sin-reload: `revalidatePath('/perfil')` (perfil/actions.ts:67).
- **Evidencia (path:línea):**
  - `src/app/(player)/perfil/page.tsx:98-121` — tab "datos" con `ProfileForm`.
  - `src/app/(player)/perfil/ProfileForm.tsx:36-47,90-117,121-130` — labels, botón, feedback inline.
  - `src/app/(player)/perfil/actions.ts:12-69` — `updateProfileAction`, `revalidatePath`.
  - `src/app/(player)/perfil/ProfileHeaderNav.tsx:5-10,21-58` — tabs `PROFILE_TABS` y avatar/fallback (confirma que NO hay upload, solo display).

---

## TG-HP-110 — Preferencias de notificación
- **Rol:** Jugador
- **Prerrequisitos:** Sesión activa.
- **Flujo de navegación (UI steps):**
  1. Navegar a `http://localhost:3000/perfil?tab=notificaciones` (o click en el tab `"Avisos"` — el label del tab es `"Avisos"`, no `"Notificaciones"`, ProfileHeaderNav.tsx:9).
  2. Ver dos filas switch: `"Novedades por email"` (descripción `"Recibí novedades de tus reservas por email. Los emails de confirmación y cancelación se envían siempre."`) y `"Notificaciones push"` (`"Avisos en este dispositivo cuando haya novedades de tus reservas."`) (NotificationPrefs.tsx:21-34).
  3. Click en el switch `role="switch"` de `"Novedades por email"` (aria-label = el label, línea 100).
  4. El switch cambia de estado optimistamente al toque (`setPrefs` antes del await, líneas 64-66) y persiste vía `updateNotificationPrefAction('email', <bool>)`.
  5. Si falla, revierte el switch y muestra `role="alert"` con el mensaje de error (líneas 69-72, 118-122).
- **Comportamiento de componentes:**
  - Loading: no hay spinner — es optimista (`startTransition`, línea 61,67).
  - Anti-doble-submit: no hay `disabled` explícito en el botón switch mientras está pendiente (revisar: no se lee `pending` de `useTransition` para deshabilitar el botón, solo se usa para envolver el await).
  - Feedback: sin toast; revert visual + `role="alert"` inline en caso de error (líneas 118-122); sin mensaje de éxito visible.
- **Validación de datos:**
  - DB: `UPDATE players SET notify_email=<bool>` o `notify_push=<bool> WHERE id=<playerId>` (perfil/actions.ts:83-119).
  - API/Action: `updateNotificationPrefAction(pref, enabled)` (perfil/actions.ts:83) → `{success:true}` (línea 118) o `{success:false, error}`.
  - Externos: ninguno directo (el comentario de UI aclara que "Los emails de confirmación y cancelación se envían siempre" independientemente de este toggle, NotificationPrefs.tsx:25).
  - UI-sin-reload: `revalidatePath('/perfil')` en la action (perfil/actions.ts:117); el switch en sí no depende de eso — es estado local optimista.
- **Evidencia (path:línea):**
  - `src/app/(player)/perfil/ProfileHeaderNav.tsx:9` — label del tab `"Avisos"`.
  - `src/app/(player)/perfil/NotificationPrefs.tsx:15-34,47-74,96-113,117-122` — copy, toggle handler, switch, error inline.
  - `src/app/(player)/perfil/actions.ts:71-119` — `updateNotificationPrefAction`.
  - `src/app/(player)/perfil/page.tsx:139-145` — render condicional tab `"notificaciones"`.

---

## TG-HP-111 — Exportar datos ARCO `/configuracion`
- **Rol:** Jugador
- **Prerrequisitos:** Sesión activa.
- **Flujo de navegación (UI steps):**
  1. Navegar a `http://localhost:3000/configuracion`.
  2. Ver card `"Tus datos personales"` con texto ARCO y botón `"Descargar mis datos"` (ConfiguracionView.tsx:56-71, DataExportButton.tsx:63).
  3. Click en `"Descargar mis datos"`.
  4. Botón cambia a `"Generando..."` mientras `status==='loading'` (DataExportButton.tsx:63).
  5. `fetch('/api/player/data-export')` descarga un JSON y dispara la descarga del navegador (`anchor.click()`, líneas 40-45) con nombre `turnogol-mis-datos-<YYYY-MM-DD>.json` (línea 34-36).
  6. Si falla, `role="alert"` con `"No se pudo generar la exportación. Intentá de nuevo en unos minutos."` (líneas 17-19,29-31,49-52,65-69).
- **Comportamiento de componentes:**
  - Loading: `disabled={status==='loading'}` en el botón, texto `"Generando..."` (DataExportButton.tsx:60,63).
  - Anti-doble-submit: mismo `disabled` (línea 60) — no es un `<form>`/`useFormStatus`, es `useState` local.
  - Feedback: sin toast — mensaje de error inline `role="alert"`; en éxito no hay mensaje visible, solo la descarga del archivo (comportamiento del browser).
- **Validación de datos:**
  - DB/API: `GET /api/player/data-export` → 200 con `{data:{...}}` que incluye `profile`, `consents`, `bookings` (últimos 12 meses), `payments` (últimos 5 años), `tenant_relationships`, `bans` (route.ts:30-129).
  - Externos: `captureMessage('arco.data_exported', ...)` a Sentry como registro de auditoría (no hay fila en `audit_logs` porque esa tabla exige `tenant_id NOT NULL`, route.ts:122-127).
  - UI-sin-reload: no aplica (descarga de archivo, no hay revalidación de la página).
- **Evidencia (path:línea):**
  - `src/app/(player)/configuracion/ConfiguracionView.tsx:56-71` — card y copy ARCO.
  - `src/app/(player)/configuracion/DataExportButton.tsx:9-53,55-71` — fetch, blob, descarga, estados.
  - `src/app/api/player/data-export/route.ts:11-29,89-130` — shape del bundle exportado y `captureMessage`.

---

## TG-HP-112 — Favoritos (`player_favorites` / FavoritesList)
- **Rol:** Jugador
- **Prerrequisitos:** Sesión activa. Al menos 1 tenant público visible en `/explorar`.
- **Flujo de navegación (UI steps):**
  1. Navegar a `http://localhost:3000/explorar`.
  2. En una `TenantCard`, click en el botón corazón (overlay, sin texto, `aria-label="Guardar en favoritos"` cuando no está marcado — FavoriteButton.tsx:67,94-110).
  3. El botón togglea optimistamente (`fill-current` cuando `fav=true`) y llama `POST /api/player/favorites/toggle` con `{tenantId}` (FavoriteButton.tsx:37-58).
  4. Si el jugador no tiene sesión, un 401 redirige a `/ingresar?next=<path>` (líneas 51-54) — no aplica acá porque ya hay sesión.
  5. Navegar a `http://localhost:3000/perfil?tab=favoritos` (tab `"Favoritos"`, ProfileHeaderNav.tsx:7).
  6. Ver el tenant recién marcado listado en la grilla, renderizado con la misma `TenantCard` (`initialFavorited` true, FavoritesList.tsx:43-55).
  7. Click de nuevo en el corazón (ahora `aria-label="Quitar de favoritos"`) para destogglear — la card desaparece de la lista al refrescar `/perfil?tab=favoritos`.
  8. Si no hay favoritos: empty state h2 `"Sin favoritos todavía"` + botón `"Explorar complejos"` (FavoritesList.tsx:25-38).
- **Comportamiento de componentes:**
  - Loading: `disabled={pending}` en el botón mientras se resuelve el toggle (FavoriteButton.tsx:34,74,98).
  - Anti-doble-submit: mismo `disabled={pending}` (líneas 74,98); no hay `useFormStatus` (no es un `<form>`, es `onClick` con `useState`).
  - Feedback: sin toast en éxito; en error revierte el estado y muestra toast `"No pudimos actualizar tus favoritos."` variant `destructive` (FavoriteButton.tsx:59-61).
- **Validación de datos:**
  - DB: tabla `player_favorites` (RLS por `app.current_player_id`) vía `toggleFavorite` (src/modules/favorites/favorite.service.ts — no leído línea a línea, invocado en toggle/route.ts:43).
  - API/Action: `POST /api/player/favorites/toggle` → `{data:{tenantId, favorited}}` (toggle/route.ts:16-49).
  - Externos: ninguno.
  - UI-sin-reload: confirmado — el toggle en `/explorar` es optimista sin reload; en `/perfil?tab=favoritos` la lista se recalcula server-side en cada navegación (`loadFavorites`, perfil/page.tsx:42-57) — no hay `revalidatePath` explícito citado, la actualización se ve al re-navegar/recargar el tab.
- **Evidencia (path:línea):**
  - `src/components/public/FavoriteButton.tsx:22-111` — componente completo (toggle, labels, error toast).
  - `src/app/api/player/favorites/toggle/route.ts:16-49` — endpoint.
  - `src/app/(player)/perfil/FavoritesList.tsx:11-56` — lista + empty state.
  - `src/app/(player)/perfil/page.tsx:42-57,79,124-129` — `loadFavorites`, tab `"favoritos"`.
  - `src/app/(player)/perfil/ProfileHeaderNav.tsx:7` — label del tab `"Favoritos"`.

---

## TG-HP-113 — Reseña post-partido
- **Rol:** Jugador
- **Prerrequisitos:** Sesión activa. Booking propio `status='completed'` sin reseña previa (`has_review=false`).
- **Flujo de navegación (UI steps):**
  1. Navegar a `/mis-reservas?tab=historial`.
  2. En la card de un booking `completed` sin reseña, click en `"Dejar reseña"` (LeaveReviewButton.tsx:62-68).
  3. Se abre un `Dialog` con título `"¿Cómo estuvo <tenantName>?"` (líneas 71-72).
  4. Click en una de las 5 estrellas (`role="radio"`, `aria-label="<n> estrella(s)"`, líneas 82-101).
  5. Opcional: rellenar textarea `id="review-comment"` (placeholder `"¿Qué te pareció la cancha, el lugar, la atención?"`, contador `<n>/500`, líneas 108-117).
  6. Click en `"Publicar reseña"` (línea 126).
  7. `POST /api/player/reviews` con `{bookingId, rating, comment}` (líneas 35-39).
  8. Éxito: toast `"¡Gracias por tu reseña!"` variant `success`, dialog se cierra, `router.refresh()` (líneas 47-49).
  9. Si `rating<1` al submitir: toast `"Elegí una calificación."` variant `destructive`, no envía (líneas 29-32).
  10. Si ya existe reseña (409): toast `"Ya dejaste una reseña para esta reserva."`, cierra dialog, refresh (líneas 40-45).
- **Comportamiento de componentes:**
  - Loading: `disabled={pending}` en `"Publicar reseña"`, texto `"Enviando…"` (líneas 120-126).
  - Anti-doble-submit: mismo `disabled={pending}` (línea 123); es un `onClick` con `useState` local, no `useFormStatus` (no es `<form action>`, es `fetch` directo).
  - Feedback: toast real (`useToast`, línea 13) para los 4 casos (éxito/error de validación/409/error genérico) + `router.refresh()` en éxito y en 409 (líneas 43,49).
- **Validación de datos:**
  - DB: tabla `reviews` — la existencia de reseña se chequea en `mis-reservas/page.tsx` vía `EXISTS (SELECT 1 FROM reviews r WHERE r.booking_id = b.id) AS has_review` (page.tsx:61); el INSERT lo hace `POST /api/player/reviews` (no inspeccionado línea a línea, ruta confirmada en `src/app/api/player/reviews/route.ts`).
  - API/Action: `POST /api/player/reviews` → 200/201 en éxito, 409 si duplicada (LeaveReviewButton.tsx:40,46).
  - Externos: ninguno.
  - UI-sin-reload: `router.refresh()` client-side tras éxito/409 (líneas 43,49) — no usa `revalidatePath` server-side (es un route handler, no una Server Action).
- **Evidencia (path:línea):**
  - `src/app/(player)/mis-reservas/LeaveReviewButton.tsx:19-132` — componente completo (dialog, estrellas, submit, toasts).
  - `src/app/(player)/mis-reservas/page.tsx:61` — `has_review` vía `EXISTS (SELECT 1 FROM reviews ...)`.
  - `src/app/(player)/mis-reservas/MisReservasView.tsx:279-283` — render condicional `!b.has_review` solo si `status==='completed'`.
  - `src/app/api/player/reviews/route.ts` — endpoint (existencia confirmada; contrato de request/response no inspeccionado en detalle, ver GAPS).

---

## GAPS

- **Avatar de jugador — confirmado inexistente.** `players.avatarUrl` existe en el schema y se RENDERIZA en `ProfileHeaderNav.tsx:38-49` (imagen real si no-null, fallback de iniciales si null), pero no hay ningún componente de upload/cambio de avatar en `ProfileForm.tsx` ni acción asociada (`perfil/actions.ts` solo tiene `updateProfileAction` para nombre/apellido/teléfono/zona y `updateNotificationPrefAction`). No armar un caso de "cambiar foto de perfil".
- **`POST /api/player/reviews` no se inspeccionó en detalle** (validación Zod exacta, código de status en éxito, si valida que el booking sea `completed`/propio del jugador). El caso TG-HP-113 documenta el contrato observado desde `LeaveReviewButton.tsx` (200/201 en éxito implícito por `res.ok`, 409 explícito) — un sub-agente de test debería tratar el 200/201 exacto como a confirmar en runtime, no como dato citado de código.
- **`toggleFavorite` (favorite.service.ts) no se leyó línea a línea** — se citó solo el route handler que lo invoca. El nombre de la tabla `player_favorites` viene del CLAUDE.md del repo (sección Multi-tenancy), no de una lectura directa del schema en esta sesión.
- **No existe copia visible del texto exacto del email `booking_confirmed`/`booking_canceled` en Resend/Inbucket** — se citó solo el `templateName` y el `content` pasado a `enqueueNotification`; el sub-agente de test debe verificar el asunto/cuerpo real renderizado en Inbucket en runtime, no asumirlo de este documento.
- **NotificationPrefs no deshabilita el switch mientras está pendiente** (`useTransition` sin exponer `isPending` al botón, `NotificationPrefs.tsx:47-74`) — esto es una observación de comportamiento, no una feature inexistente; no hay `disabled` visible en el botón switch durante el guardado.


---

# Bloque 2 — Admin (dueño / encargado)

# TurnoGol — Happy Paths ADMIN — Bloque OPERACIÓN (TG-HP-201 a 213)

Base: `http://localhost:3000`. Exploración read-only sobre el repo en
`C:\Users\Lazar\Documents\github\TurnoGol` (Next.js 16 App Router, TS strict).

Fixtures usadas (ver `tests/e2e/global-setup.ts:9-14`, `tests/e2e/grilla-realtime.spec.ts:24-28`):
- Tenant Demo `00000000-0000-4000-8000-000000000001` (slug `e2e-complejo-demo`), Cancha E2E 1
  `00000000-0000-4000-8000-000000000010`.
- Admin `e2e-admin@turnogol.test` (staff_user_id `00000000-0000-4000-8000-000000000003`, 1 tenant → login
  redirige directo a `/dashboard`, `src/modules/auth/auth.service.ts:221-227`).
- Fresh admin `e2e-admin-fresh@turnogol.test` (`...005`, 0 tenants → login redirige a `/onboarding`,
  `src/modules/auth/auth.service.ts:210-219`).
- Jugador `e2e-player@turnogol.test` (`...020`).
- Sesión admin ya inyectada por cookie salvo TG-HP-201/202/203 (login/register/onboarding), que son el
  flujo de autenticación en sí.

---

## TG-HP-201 — Login staff email+password
- **Rol:** Admin (dueño) — mismo formulario sirve a manager, el corte es "no jugador", no de rol.
- **Prerrequisitos:** Sin sesión. Usuario `e2e-admin@turnogol.test` ya existe como `staff_users` con 1
  tenant (Demo) vinculado en `tenant_staff_members`.
- **Flujo de navegación (UI steps):**
  1. Navegar a `/login`.
  2. Rellenar `Email` (`input#email`) con `e2e-admin@turnogol.test`.
  3. Rellenar `Contraseña` (`input#password`) con la password fixture del seed.
  4. Click `Ingresar` (botón submit).
  5. Esperar redirect a `/dashboard`.
- **Comportamiento de componentes:**
  - Loading: sin loading state propio — el submit deshabilita el botón (ver Anti-doble-submit).
  - Anti-doble-submit: `SubmitButton` interno usa `useFormStatus()` → `disabled={pending}`, label cambia a
    "Ingresando…" con `Loader2` girando (`src/app/(auth)/login/LoginCard.tsx:159-176`).
  - Feedback: sin toast — el éxito es un `redirect()` server-side (`src/app/(auth)/login/actions.ts:82`,
    comentario línea 21 explica por qué no hay estado 'sent'). El error inválido muestra
    `role="alert"` con mensaje genérico `"Email o contraseña incorrectos."` (`actions.ts:14`,
    `LoginCard.tsx:98-102`) — nunca revela si el email existe.
- **Validación de datos:**
  - DB: no hay escritura (login no muta `staff_users`; `provisionAndRouteStaff` solo hace
    `setStaffTenantClaim` si hace falta refrescar el JWT, `auth.service.ts:222-224`).
  - API/Action: `loginAction` (`src/app/(auth)/login/actions.ts:31-83`) → `signInWithPassword` → 200
    Supabase Auth interno; corte anti-jugador si `app_metadata.is_player`/`user_metadata.is_player`
    es `true` (mismo mensaje genérico + `signOut()`, `actions.ts:68-73`).
  - Externos: ninguno (no dispara email ni MP en este flujo).
  - UI-sin-reload: no aplica — es `redirect()` de Next (navegación real, no revalidatePath).
- **Evidencia (path:línea):**
  - `src/app/(auth)/login/actions.ts:14,31-83` (schema, GENERIC message, corte anti-jugador)
  - `src/app/(auth)/login/LoginCard.tsx:36-45,98-102,159-176` (labels, error, submit button)
  - `src/modules/auth/auth.service.ts:191-227` (`provisionAndRouteStaff`, ruteo por cantidad de tenants)

---

## TG-HP-202 — Register dueño nuevo
- **Rol:** Admin (dueño) — el registro siempre crea `staff_users` sin tenant; se vuelve `admin` recién
  al crear el tenant en el Paso 1 del onboarding (`createTenantAction`).
- **Prerrequisitos:** Sin sesión. Email nuevo, no presente en `staff_users`.
- **Flujo de navegación (UI steps):**
  1. Navegar a `/register`.
  2. Rellenar `Nombre` (`#firstName`), `Apellido` (`#lastName`), `Email` (`#email`), `Celular`
     (`PhoneInput#phone`), `Contraseña` (`#password`, mínimo 8), `Repetir contraseña`
     (`#confirmPassword`) — todos con mock data.
  3. Click `Crear cuenta`.
  4. Esperar pantalla "Confirmá tu email" (sin redirect — mismo componente).
  5. (Fuera de la UI, vía Inbucket/Resend en dev) click en el link de confirmación → login con la
     password recién creada → redirect a `/onboarding` (0 tenants).
- **Comportamiento de componentes:**
  - Loading/Anti-doble-submit: `SubmitButton` local con `useFormStatus()` → `disabled={pending}`, label
    "Creando…" (`src/app/(auth)/register/RegisterCard.tsx:206-224`).
  - Feedback: sin toast — cambia de vista dentro del mismo componente a `ConfirmState`, h1 "Confirmá tu
    email" + texto "Te enviamos un email a **{email}**..." (`RegisterCard.tsx:121-143`). Si el email ya
    existe: vista `ExistingState`, h1 "Ya tenés una cuenta" (`RegisterCard.tsx:145-166`).
- **Validación de datos:**
  - DB: `signUpStaff` crea el usuario en Supabase Auth (no hay fila en `staff_users` todavía — se crea
    recién en el primer login exitoso vía `getOrCreateStaffUser`, `auth.service.ts:205`). Chequeo previo
    contra duplicados: `getWorkerDb().select from staffUsers where email=...`
    (`src/app/(auth)/register/actions.ts:77-88`, pool de servicio por el gotcha de RLS relacional
    documentado en el comentario ahí mismo).
  - API/Action: `registerAction` (`register/actions.ts:38-109`) → `signUpStaff` → estado `'confirm'`
    (no hay sesión: `enable_confirmations=true`, comentario línea 107).
  - Externos: Resend dispara el email de confirmación vía Supabase Auth (`emailRedirectTo`
    `${origin}/api/auth/callback`, `register/actions.ts:99`).
  - UI-sin-reload: no aplica (cambio de estado local del componente cliente, sin revalidatePath).
- **Evidencia (path:línea):**
  - `src/app/(auth)/register/actions.ts:16-28,38-109` (schema, registerAction)
  - `src/app/(auth)/register/RegisterCard.tsx:52-119,121-166,206-224` (labels exactos, estados)
  - `src/modules/auth/auth.service.ts:205-219` (alta de `staff_users` + ruteo a `/onboarding` en el
    primer login post-confirmación)

---

## TG-HP-203 — Onboarding wizard (4 pasos)
- **Rol:** Admin (dueño) — `requireAdminStaffAction` en pasos 2-4 (Configuración, solo admin;
  `src/app/onboarding/actions.ts:35-41`).
- **Prerrequisitos:** Sesión de `e2e-admin-fresh@turnogol.test` (0 tenants) inyectada por cookie.
  `GET /onboarding` resuelve `currentStep=1` porque `resolveStaffTenants` devuelve `[]`
  (`src/app/onboarding/page.tsx:36-46`).
- **Flujo de navegación (UI steps):**
  - **Paso 1 — Tu complejo** (`StepIdentity`, `src/app/onboarding/components/StepIdentity.tsx:57-171`):
    1. Rellenar `Nombre del complejo` (`#identity-name`) con "Complejo E2E".
    2. Rellenar `Dirección` (`#identity-address`), `Ciudad` (`#identity-city`).
    3. Elegir `Provincia` (`#identity-province`, select) — ej. "Buenos Aires".
    4. Rellenar `Teléfono` (`PhoneInput#identity-phone`), `Email de contacto` (`#identity-email`).
    5. Click `Continuar`.
  - **Paso 2 — Horarios** (`StepSchedule`, `src/app/onboarding/components/StepSchedule.tsx:34-70`):
    6. Ya viene precargado un horario típico (`sanitizeWizardHours`) — click `Continuar` sin tocar nada
       es válido (`StepSchedule.tsx:46-47`).
  - **Paso 3 — Canchas** (`StepCourts`, `src/app/onboarding/components/StepCourts.tsx:41-159`):
    7. En la card de borrador, rellenar nombre y precio por turno (min. 1 cancha).
    8. Click `Continuar` (o `Agregar otra cancha` primero si se quiere más de una).
  - **Paso 4 — Señas** (`StepPayments`, `src/app/onboarding/components/StepPayments.tsx:39-203`):
    9. Elegir el radio `Sin seña por ahora` (`role="radiogroup"` "Cobro de seña").
    10. Click `Terminar y ver mi complejo`.
  - 11. Redirect a `/onboarding/listo` — h2 "¡Tu complejo está online!"
      (`src/app/onboarding/listo/page.tsx:34-36`).
  - 12. Click `Ir a mi panel` → `/dashboard`.
- **Comportamiento de componentes:**
  - Loading/Anti-doble-submit: Pasos 1 y 3 usan `useTransition` + `Button isLoading={isPending}` (Button
    deshabilita internamente, `src/components/ui/button.tsx:41,50`); Paso 2 usa `SubmitButton` con
    `useFormStatus()` (label "Guardando…", `src/components/ui/submit-button.tsx:26-37`); Paso 4 usa
    `Button isLoading={isPending}` sobre `useTransition` (`StepPayments.tsx:40,75-78,190-193`).
  - Feedback: sin toasts — cada paso muestra el error inline `role="alert"` propio
    (`StepIdentity.tsx:163`, `StepSchedule.tsx:58-62`, `StepCourts.tsx:136-140`,
    `StepPayments.tsx:172-176`). El cierre (`/onboarding/listo`) es el peak-end visual, no un toast.
  - `WizardShell` (`src/app/onboarding/components/WizardShell.tsx:28-119`) es el indicador de progreso:
    rail lateral en desktop con 4 pasos + "Paso N de 4 · X%"; barra segmentada en mobile.
- **Validación de datos:**
  - DB: Paso 1 → `createTenantWithTrial` (fila nueva en `tenants`, `staffUserId` vinculado en
    `tenant_staff_members` vía `createTenantAction`, `src/app/onboarding/actions.ts:42-87`). Paso 2 →
    `UPDATE tenants SET opening_hours=..., closes_next_day=...` (`actions.ts:132-137`). Paso 3 →
    `createCourt` × N dentro de `withTenantContext` (`actions.ts:220-236`). Paso 4 →
    `completeOnboarding(tenant.id)` marca `settings.onboarding_completed=true`
    (`actions.ts:250-254`).
  - API/Action: `createTenantAction`, `saveWizardScheduleAction`, `createWizardCourtsAction`,
    `finishOnboardingAction` (todas `'use server'` en `src/app/onboarding/actions.ts`), cada una
    `{ success: true }` o `{ success: false, error }`.
  - Externos: ninguno en el camino "Sin seña" (el camino "Sí, cobrar seña" sale a
    `/api/mp/oauth-start`, fuera de este happy path).
  - UI-sin-reload: `revalidatePath('/onboarding')` tras cada paso (`actions.ts:85,104,140,241`); el
    avance de paso lo decide el server component releyendo `settings.onboarding_step`
    (`src/app/onboarding/page.tsx:44`), no state del cliente.
- **Evidencia (path:línea):**
  - `src/app/onboarding/page.tsx:24-87` (orquestación de los 4 pasos)
  - `src/app/onboarding/actions.ts:42-254` (las 4 Server Actions del wizard)
  - `src/app/onboarding/components/StepIdentity.tsx:68-160`,
    `StepSchedule.tsx:34-70`, `StepCourts.tsx:94-158`, `StepPayments.tsx:82-203`
  - `src/app/onboarding/listo/page.tsx:27-62`

---

## TG-HP-204 — Subir LOGO del tenant a R2
- **Rol:** Admin (dueño) — `requireAdminStaffAction` (`src/app/(admin)/settings/perfil/actions.ts:36`).
- **Prerrequisitos:** Sesión admin inyectada, tenant Demo sin `logoUrl` (o reemplazando uno existente).
  Si `isR2Configured()` es `false` (sin credenciales R2 en el entorno) la action responde
  `{ success: false, error: 'Storage no configurado en este entorno' }` — ver GAP condicional abajo.
- **Flujo de navegación (UI steps):**
  1. Navegar a `/settings/perfil`.
  2. En la sección "Logo", click en el placeholder con label `Subí el logo de tu complejo`
     (`emptyLabel`, `src/app/(admin)/settings/perfil/PerfilImagesForm.tsx:72`) — abre el file picker
     (`input[type=file]` oculto, `accept="image/png,image/jpeg,image/webp"`,
     `src/components/ui/image-uploader.tsx:152-163`).
  3. Elegir un archivo JPG/PNG mock (≤2MB antes del resize).
  4. Esperar a que termine el resize+upload (spinner `Loader2` sobre el placeholder,
     `image-uploader.tsx:146-150`) — sin click adicional, el upload es automático al elegir archivo.
- **Comportamiento de componentes:**
  - Loading: estado `busy` local en `ImageUploader` → `Loader2` girando dentro del placeholder,
    input deshabilitado (`image-uploader.tsx:35,42-54,138-165`).
  - Anti-doble-submit: no aplica un botón submit — el `<input type=file>` se deshabilita
    (`disabled={disabled || busy}`) mientras `busy=true`.
  - Feedback: sin toast — error inline `role="alert"` texto rojo debajo del uploader
    (`PerfilImagesForm.tsx:90-94`); sin mensaje de éxito explícito, el logo simplemente aparece
    (`<img>` con el `url` devuelto, `image-uploader.tsx:96-97`).
- **Validación de datos:**
  - DB: `updateTenant(tenant.id, { logoUrl: url })`
    (`src/app/(admin)/settings/perfil/actions.ts:73`); si había un logo previo del mismo tenant se
    borra de R2 antes (`deletePreviousIfOwned`, `actions.ts:26-30,72`).
  - API/Action: `setTenantImageAction('logo', formData)` (`actions.ts:32-81`) →
    `{ success: true, url }`.
  - Externos: R2 real (`isR2Configured()` gate en `actions.ts:43-46`) — key
    `${tenantId}/logo-${crypto.randomUUID()}.webp` (`actions.ts:61`), `MAX_BYTES = 2MB`
    (`actions.ts:20`). No hay Supabase Storage involucrado.
  - UI-sin-reload: `revalidatePath('/settings/perfil')` + `revalidatePath('/${tenant.slug}')`
    (`actions.ts:78-79`); el `<img>` visible se actualiza además por `setLogoUrl(result.url)` en
    `PerfilImagesForm.tsx:45` (state local, sin esperar el revalidate).
- **Evidencia (path:línea):**
  - `src/app/(admin)/settings/perfil/actions.ts:20,32-81` (`MAX_BYTES`, `setTenantImageAction`,
    key format, gate R2)
  - `src/app/(admin)/settings/perfil/PerfilImagesForm.tsx:60-74` (label exacto "Subí el logo de tu
    complejo")
  - `src/components/ui/image-uploader.tsx:19-23,138-165` (aspect square para `preset="logo"`, input
    file oculto)

---

## TG-HP-205 — Subir PORTADA/cover del tenant a R2
- **Rol:** Admin (dueño) — mismo guard/handler que TG-HP-204.
- **Prerrequisitos:** Igual que TG-HP-204, gate R2 idéntico.
- **Flujo de navegación (UI steps):**
  1. Navegar a `/settings/perfil` (misma página que el logo, sección separada).
  2. En "Portada", click en el placeholder `Subí una portada`
     (`PerfilImagesForm.tsx:81-87`, `emptyLabel="Subí una portada"`).
  3. Elegir un archivo mock — `preset="cover"` fuerza `aspect-video`
     (`image-uploader.tsx:19-23`).
  4. Esperar upload automático (mismo comportamiento de loading que el logo).
- **Comportamiento de componentes:** Idéntico a TG-HP-204 (mismo `ImageUploader`, mismo
  `PerfilImagesForm`, misma action con `kind='cover'`).
- **Validación de datos:**
  - DB: `updateTenant(tenant.id, { coverUrl: url })` (`actions.ts:73`, rama `kind==='cover'`).
  - API/Action: `setTenantImageAction('cover', formData)` — misma función, `kind` como primer
    argumento (`actions.ts:32-81`).
  - Externos: R2, key `${tenantId}/cover-${crypto.randomUUID()}.webp` (`actions.ts:61`, el
    template usa `kind` que acá es `'cover'`).
  - UI-sin-reload: mismos dos `revalidatePath` (`actions.ts:78-79`) + `setCoverUrl(result.url)`
    (`PerfilImagesForm.tsx:46`).
- **Evidencia (path:línea):**
  - `src/app/(admin)/settings/perfil/actions.ts:32-81` (handler compartido, parámetro `kind`)
  - `src/app/(admin)/settings/perfil/PerfilImagesForm.tsx:76-88` (sección Portada, label exacto)

---

## TG-HP-206 — Crear cancha + subir FOTOS a R2 (≤6)
- **Rol:** Admin (dueño) — `requireAdminStaffAction` en create/update/upload
  (`src/app/(admin)/canchas/actions.ts:35,99,230`); listar y activar/desactivar es admin+manager
  (`requireOperatorStaff`, `canchas/page.tsx:21`).
- **Prerrequisitos:** Sesión admin inyectada. GAP importante: **el uploader de fotos SOLO aparece en
  modo edición** (`{isEdit && (...)}`, `src/app/(admin)/canchas/components/CourtForm.tsx:250-268`) — no
  existe upload de fotos durante la creación inicial. El flujo real es crear primero, después reabrir
  en "Editar" para subir fotos.
- **Flujo de navegación (UI steps):**
  1. Navegar a `/canchas`.
  2. Click `+ Nueva cancha` (texto literal fijado por e2e, comentario
     `src/app/(admin)/canchas/components/CourtList.tsx:135-137`).
  3. Rellenar `Nombre` (`#court-name`), elegir `Superficie` (`#court-surface`), `Formato`
     (`#court-format`, ej. "Fútbol 5") (`CourtForm.tsx:178-231`).
  4. Cargar precios en la sección "Precios" (`PricingSection`, plantilla rápida — fuera del detalle de
     este caso).
  5. Click `Crear cancha` (`CourtForm.tsx:276-282`).
  6. Toast/estado: sin toast en creación — `onSaved` cierra el form y vuelve a la lista
     (`CourtForm.tsx:143-159`, `CourtList.tsx:97-109`).
  7. En la lista, click `Editar` sobre la cancha recién creada (`CourtList.tsx:308-315`) — reabre
     `CourtForm` en modo edición, ahora con la sección "Fotos" visible.
  8. Click en el placeholder `Agregar foto` (`emptyLabel`, `CourtForm.tsx:265`) hasta 6 veces
     (`max={6}`, `CourtForm.tsx:261`).
  9. Click `Guardar cambios` (`CourtForm.tsx:281`, label cambia según `isEdit`).
- **Comportamiento de componentes:**
  - Loading/Anti-doble-submit: `Button isLoading={isPending}` sobre `useTransition`
    (`CourtForm.tsx:69,276-279`) — deshabilita el submit mientras corre `createAction`/`updateAction`.
    El upload de fotos usa el mismo `ImageUploader` (`busy` state, `image-uploader.tsx:35,146-150`).
  - Feedback: sin toast en ningún punto del form de cancha — error inline `role="alert"`
    (`CourtForm.tsx:270-274`). El toggle Activar/Desactivar (fuera de este caso) sí usa `toast()`
    (`CourtList.tsx:244-246,256-260,275`).
- **Validación de datos:**
  - DB: `createCourt(tenant.id, parsed.data, tx)` dentro de `withTenantContext`, gate de límite de
    plan (`getCourtCountAndLimit`, `canchas/actions.ts:77-87`); fotos se agregan con
    `appendCourtPhoto(courtId, tenant.id, url, tx)` (`canchas/actions.ts:266-269`).
  - API/Action: `createCourtAction(formData)` (`canchas/actions.ts:34-91`) →
    `{ success: true, courtId }`; `uploadCourtPhotoAction(courtId, formData)`
    (`canchas/actions.ts:226-277`) → `{ success: true, photos: string[] }`.
  - Externos: R2 real, gate `isR2Configured()` (`canchas/actions.ts:239-242`) — key
    `${tenant.id}/courts/${courtId}/${crypto.randomUUID()}.webp` (`canchas/actions.ts:256`),
    `MAX_PHOTO_BYTES = 2MB` (`canchas/actions.ts:222`).
  - UI-sin-reload: `revalidatePath('/canchas')` + `revalidatePath('/${tenant.slug}')` en creación y en
    cada foto (`canchas/actions.ts:89,271-272`).
- **Evidencia (path:línea):**
  - `src/app/(admin)/canchas/actions.ts:34-91,226-277` (createCourtAction, uploadCourtPhotoAction)
  - `src/app/(admin)/canchas/components/CourtForm.tsx:162-283` (form completo, gate `isEdit` para
    fotos)
  - `src/app/(admin)/canchas/components/CourtList.tsx:128-149` ("+ Nueva cancha" literal)

---

## TG-HP-207 — Editar cancha / desactivar (court_status online/offline)
- **Rol:** Editar (nombre/precio/formato) = solo admin; activar/desactivar = admin + manager
  (`src/app/(admin)/canchas/actions.ts:32-33,151-152`, decisión revisada 2026-07-01).
- **Prerrequisitos:** Cancha E2E 1 (`...010`) existente y `online`.
- **Flujo de navegación (UI steps) — Editar:**
  1. Navegar a `/canchas`.
  2. Click `Editar` sobre la cancha (`CourtList.tsx:308-315`, visible solo si `isAdmin`).
  3. Modificar `Nombre` y/o precios.
  4. Click `Guardar cambios` (`CourtForm.tsx:281`).
- **Flujo de navegación (UI steps) — Desactivar:**
  5. Click `Desactivar` (texto dinámico según `currentStatus`, `CourtList.tsx:316-323`).
  6. Se abre `ConfirmDialog` título `Desactivar {court.name}`, texto "Una cancha offline no recibe
     reservas nuevas." + warnings si hay reservas futuras/abonados activos
     (`CourtList.tsx:326-346`).
  7. Click `Desactivar` dentro del diálogo (`confirmLabel="Desactivar"`).
- **Comportamiento de componentes:**
  - Loading: `getCourtDeactivationImpactAction` corre antes de abrir el diálogo (`loadingImpact`
    state, botón muestra "…" mientras carga, `CourtList.tsx:229-235,319-323`).
  - Anti-doble-submit: botón toggle `disabled={isPending || loadingImpact}` (`CourtList.tsx:319`).
  - Feedback: toast `Cancha desactivada` variant `success` al confirmar
    (`CourtList.tsx:275`); si falla la verificación de impacto, toast `No se pudo verificar el
    impacto` variant `destructive` (`CourtList.tsx:256-260`) — el diálogo NO se abre con datos falsos
    (comentario "Fix #58", `CourtList.tsx:254-255`).
- **Validación de datos:**
  - DB: `updateCourt` (edición) / `toggleStatus(courtId, tenant.id, 'offline'|'online', tx)`
    (`canchas/actions.ts:95-172`); `court_status` enum valores `online`/`offline` (sin
    active/maintenance/inactive, per CLAUDE.md).
  - API/Action: `updateCourtAction(courtId, formData)`, `toggleCourtStatusAction(courtId, status)`
    (`canchas/actions.ts:95-172`) → `{ success: true, courtId }`.
  - Externos: ninguno.
  - UI-sin-reload: `revalidatePath('/canchas')` en ambas (`canchas/actions.ts:147,170`); el badge de
    estado se actualiza además vía `setCurrentStatus` optimista (`CourtList.tsx:238-247,266-277`).
- **Evidencia (path:línea):**
  - `src/app/(admin)/canchas/actions.ts:93-217` (updateCourtAction, toggleCourtStatusAction,
    getCourtDeactivationImpactAction)
  - `src/app/(admin)/canchas/components/CourtList.tsx:216-349` (card, toggle, ConfirmDialog)
  - `src/app/(admin)/canchas/components/status-visual.tsx:16-29` (labels "Online"/"Offline")

---

## TG-HP-208 — Crear reserva MANUAL desde grilla (offline / "de palabra")
- **Rol:** Admin o manager — `requireOperatorStaff` (`src/app/(admin)/reservas/actions.ts:58`).
- **Prerrequisitos:** Tenant Demo, Cancha E2E 1 online, fecha de hoy o futura, slot libre.
- **Flujo de navegación (UI steps):**
  1. Navegar a `/grilla` (o `/grilla?date=YYYY-MM-DD`).
  2. Click en una celda libre — `aria-label="Reservar turno {timeStart} en {courtName}"`
     (`src/components/booking/BookingCard.tsx:215`) — abre `BookingFormModal`.
  3. En el diálogo (título "Nueva reserva", `Dialog.Title`, `BookingFormModal.tsx:170-175`), elegir
     `Motivo / Tipo de Bloqueo` (`#reason` select) — dejar el default `Reserva Telefónica`
     (`BookingFormModal.tsx:55,62`, `kind:'contact'`).
  4. Rellenar `Nombre (opcional)` (`#guestName`) y `Teléfono (opcional)` (`PhoneInput#guestPhone`) con
     mock data.
  5. (Opcional) `Notas internas` (`#notesInternal`).
  6. Click `Confirmar` (`BookingFormModal.tsx:291-298`).
- **Comportamiento de componentes:**
  - Loading: `isPending` de `useTransition` → botón muestra `Loader2` + "Guardando…"
    (`BookingFormModal.tsx:77,291-298`).
  - Anti-doble-submit: `disabled={isPending}` en el botón submit (`BookingFormModal.tsx:293`).
  - Feedback: toast `Reserva creada` (o `Turno bloqueado` si el motivo es interno) variant `success`,
    descripción `"{courtName} · {timeStart}–{timeEnd}"` (`BookingFormModal.tsx:135-139`).
- **Validación de datos:**
  - DB: `createManualBooking` inserta en `bookings` con `status='confirmed'` siempre (reservas
    manuales del admin no pasan por `pending_payment`), `type='spontaneous'` (o `'block'` para
    bloqueos internos), `startsAt`/`endsAt` calculados vía `physicalRange`
    (`src/modules/bookings/booking.service.ts:190-278`, status en línea 254).
  - API/Action: `createBookingAction(data)` (`src/app/(admin)/reservas/actions.ts:54-116`) → `201`
    conceptual `{ success: true, booking }`, validado contra `bookingResponseSchema`
    (`actions.ts:107`).
  - Externos: ninguno (reserva manual no crea `payments` ni dispara MP).
  - UI-sin-reload: `revalidatePath('/reservas')` + `revalidatePath('/grilla')`
    (`reservas/actions.ts:112-113`); además `router.refresh()` + `refetch()` explícitos en el cliente
    (`src/components/booking/BookingGrid.tsx:174-185`, comentario ahí explica por qué ambos son
    necesarios).
- **Evidencia (path:línea):**
  - `src/app/(admin)/reservas/actions.ts:54-116` (`createBookingAction`)
  - `src/components/booking/BookingFormModal.tsx:54-60,73-152,163-305` (modal completo, labels
    exactos, toast)
  - `src/modules/bookings/booking.service.ts:190-278` (`createManualBooking`)

---

## TG-HP-209 — Grilla realtime: celda ocupada se actualiza sin reload
- **Rol:** Admin o manager (grilla es operativa).
- **Prerrequisitos:** Dos sesiones admin del mismo tenant (o una sesión + un INSERT service-role, como
  en el spec de referencia). Realtime Supabase habilitado solo para `bookings` en la grilla admin
  (CLAUDE.md, RLS dual).
- **Flujo de navegación (UI steps):**
  1. Admin A y Admin B navegan a `/grilla?date=<misma fecha>`.
  2. Confirmar que el banner "Sin conexión..." no está visible en ninguno de los dos (indicador de
     `status==='SUBSCRIBED'`, `src/components/booking/BookingGrid.tsx:212-220`).
  3. Admin A crea una reserva manual (TG-HP-208).
  4. Sin recargar, Admin B ve la celda pasar de libre a ocupada (label "Confirmada"/"Señada" según
     estado, `src/components/booking/BookingCard.tsx:65-127`), con el pulso visual de "recién llegada"
     (`useRealtimePulse`, `src/hooks/use-realtime-pulse.ts:13-52`) y el anuncio accesible
     `aria-live="polite"` "Nueva reserva: {hora} en {cancha}" (`use-realtime-pulse.ts:38`,
     renderizado en `BookingGrid.tsx:205-207`).
- **Comportamiento de componentes:**
  - Loading: estado inicial `'CONNECTING'` → `'SUBSCRIBED'` al conectar el channel Supabase
    (`src/hooks/use-booking-realtime.ts:13,88,168-178`); si cae, pasa a `'OFFLINE'` y hace polling cada
    30s como fallback (`use-booking-realtime.ts:179-184`).
  - Feedback: no hay toast — el feedback es visual (pulso 700ms, `use-realtime-pulse.ts:41-48`) + el
    anuncio `aria-live` para lectores de pantalla.
  - Sin acción manual del admin B: es 100% push vía `postgres_changes` sobre la tabla `bookings`
    (`use-booking-realtime.ts:118-167`).
- **Validación de datos:**
  - DB: no hay mutación adicional — es la MISMA fila creada en TG-HP-208, propagada por el canal
    Realtime `bookings:${tenantId}` (`use-booking-realtime.ts:119`).
  - API/Action: no aplica acción del admin B; internamente el hook hace un refetch autoritativo
    (`scheduleReconcile`/`fetchFromApi`, `use-booking-realtime.ts:92-108`) para completar el nombre del
    jugador, que el payload de Realtime no trae.
  - Externos: Supabase Realtime (websocket), no MP ni email.
  - UI-sin-reload: por diseño — no hay `revalidatePath` de por medio, el estado del componente cliente
    se actualiza directo desde el payload del canal.
- **Evidencia (path:línea):**
  - `src/hooks/use-booking-realtime.ts:13,82-206` (hook completo, estados, canal)
  - `src/hooks/use-realtime-pulse.ts:13-52` (pulso + anuncio accesible)
  - `src/components/booking/BookingGrid.tsx:84,109,204-220` (wiring en la grilla)
  - **Caveat de cobertura automatizada:** el E2E multi-browser <2s y el de catch-up offline están
    marcados `test.fixme` (no corren en CI, motivo documentado: infra de Realtime local no garantiza
    el SLA de <2s) — `tests/e2e/grilla-realtime.spec.ts:110-176,181-231`. Solo el test de touch targets
    mobile (`:236-277`) corre real. Verificación manual (2 pestañas) es el único camino confiable hoy.

---

## TG-HP-210 — Detalle de reserva: agregar cobro parcial
- **Rol:** Admin o manager — `requireOperatorStaff` (`src/app/(admin)/reservas/actions.ts:370`).
- **Prerrequisitos:** Reserva `confirmed`/`completed`/`no_show` con saldo pendiente > 0 (precio >
  cobros ya registrados + seña contada). Usar una reserva creada en TG-HP-208 (precio con seña
  `deposit_status='not_required'`, o con seña ya pagada y saldo restante).
- **Flujo de navegación (UI steps):**
  1. Navegar a `/reservas/[id]` de la reserva objetivo.
  2. En la sección "Cobros de turno" (`BookingCharges.tsx:108-109`), click `+ Agregar cobro`
     (`BookingCharges.tsx:159-168`, deshabilitado si `isPaidInFull`).
  3. Rellenar `Monto (ARS)` (`#charge-amount`) con un valor menor al pendiente (prefilled con el
     saldo total, `BookingCharges.tsx:69`) — modificar a un monto PARCIAL.
  4. Elegir `Medio de pago` (`#charge-method`: Efectivo/Transferencia/MercadoPago/Otro).
  5. Click `Registrar cobro` (`BookingCharges.tsx:215-222`).
- **Comportamiento de componentes:**
  - Loading/Anti-doble-submit: `disabled={pending}` en ambos botones del form
    (`BookingCharges.tsx:217,225`), `pending` de `useTransition` (`BookingCharges.tsx:49`).
  - Feedback: toast `Cobro registrado` variant `success` (`BookingCharges.tsx:95`); error inline
    `role="alert"` si el monto supera el pendiente client-side (`BookingCharges.tsx:85-88,207-213`).
- **Validación de datos:**
  - DB: `createCashFlow(tenant.id, staffUserId, { type:'income', category:'booking', amount, method,
    bookingId, clientIdempotencyKey }, tx)` (`src/app/(admin)/reservas/actions.ts:363-486`, insert en
    `cash_flows`); recalcula el pendiente server-side SIEMPRE contra la DB (comentario "ENS-3",
    `actions.ts:401-409`), lockea la fila del booking `FOR UPDATE` antes de leer charges para evitar
    doble-cobro concurrente (Hallazgo C, `actions.ts:419-434`).
  - API/Action: `addBookingChargeAction(input)` (`actions.ts:363-486`) → `{ success: true, cashFlow }`;
    rechaza si el turno ya está pagado completo o si el monto supera lo pendiente
    (`actions.ts:443-451`); rechaza si la caja del día ya cerró (`DayAlreadyClosedError`,
    `actions.ts:471-476`).
  - Externos: ninguno (registro interno de caja, no pasa por MP aunque el método sea 'mercadopago').
  - UI-sin-reload: `revalidateBooking(bookingId)` (→ `/reservas`, `/reservas/{id}`, `/grilla`) +
    `revalidatePath('/caja')` (`actions.ts:481-484`); además `router.refresh()` explícito en el cliente
    tras el toast (`BookingCharges.tsx:98`).
- **Evidencia (path:línea):**
  - `src/app/(admin)/reservas/actions.ts:344-486` (`addBookingChargeAction` completo)
  - `src/app/(admin)/reservas/[id]/BookingCharges.tsx:39-236` (form + resumen de saldo)

---

## TG-HP-211 — Marcar COMPLETADA (jugada)
- **Rol:** Admin o manager — `requireOperatorStaff` (`src/app/(admin)/reservas/actions.ts:167`).
- **Prerrequisitos:** Reserva `status='confirmed'` cuyo horario de FIN ya pasó (server valida
  `BookingNotYetEndedError` si no).
- **Flujo de navegación (UI steps):**
  1. Navegar a `/reservas/[id]`.
  2. Click `Marcar completada` (`src/app/(admin)/reservas/[id]/BookingActions.tsx:144-151`) — sin
     diálogo de confirmación, acción directa.
- **Comportamiento de componentes:**
  - Loading/Anti-doble-submit: `disabled={pending}` en el botón, `pending` de `useTransition`
    (`BookingActions.tsx:75,146`).
  - Feedback: sin toast en este botón específico — `runDirect` solo hace `router.refresh()` en éxito o
    setea `error` inline `role="alert"` (`BookingActions.tsx:88-95,169`). (Nota: sí hay toast en
    Cancelar/Ausente, ver TG-HP-212/213 — asimetría real del código, no un error de esta ficha.)
  - El botón + toda la sección de acciones desaparece si `status !== 'confirmed'`
    (`BookingActions.tsx:82`, `return null`).
- **Validación de datos:**
  - DB: `completeBooking(bookingId, 'admin', tx)` transiciona `bookings.status` a `completed`
    (`src/app/(admin)/reservas/actions.ts:164-197`, servicio en `booking.service.ts`).
  - API/Action: `completeBookingAction(bookingId)` (`actions.ts:164-197`) →
    `{ success: true, booking }`, validado con `bookingResponseSchema`.
  - Externos: ninguno.
  - UI-sin-reload: `revalidateBooking(bookingId)` (`actions.ts:194`) + `router.refresh()` cliente
    (`BookingActions.tsx:93`).
- **Evidencia (path:línea):**
  - `src/app/(admin)/reservas/actions.ts:164-197` (`completeBookingAction`)
  - `src/app/(admin)/reservas/[id]/BookingActions.tsx:141-151` (botón, label exacto)

---

## TG-HP-212 — Marcar AUSENTE (no-show) → captura seña + softban 2da ausencia/90d
- **Rol:** Admin o manager — `requireOperatorStaff` (`src/app/(admin)/reservas/actions.ts:202`).
- **Prerrequisitos (para ver el softban):** Reserva `confirmed` con seña `deposit_status='paid'`, cuyo
  horario de INICIO ya pasó, vinculada a un jugador (`playerId`) que YA tiene 1 no-show previo dentro
  de los últimos `NO_SHOW_STRIKE_WINDOW_DAYS=90` días (`src/shared/constants.ts:23`) — así esta 2da
  ausencia dispara el bloqueo de `NO_SHOW_SOFTBAN_DAYS=14` días (`constants.ts:29`).
- **Flujo de navegación (UI steps):**
  1. Navegar a `/reservas/[id]`.
  2. Click `Marcar ausente` (`BookingActions.tsx:152-159`) — abre `ConfirmDialog`.
  3. En el diálogo (título "Marcar como ausente", descripción incluye el aviso de softban:
     "...si es su segunda ausencia en 90 días, queda bloqueado 14 días para reservar online...",
     `BookingActions.tsx:229-238`), click `Marcar ausente` (`confirmLabel`).
- **Comportamiento de componentes:**
  - Loading/Anti-doble-submit: `disabled={pending}` en el botón que abre el diálogo
    (`BookingActions.tsx:154`); el `ConfirmDialog` maneja su propio pending interno al confirmar.
  - Feedback: toast `Marcada como ausente` variant `success` (`BookingActions.tsx:111`) +
    `router.refresh()` (`BookingActions.tsx:112`).
- **Validación de datos:**
  - DB (en orden, misma tx):
    1. `markNoShow` transiciona `bookings.status → 'no_show'` y captura la seña pagada
       (`deposit_status: 'paid' → 'captured'`) — único costo real del no-show
       (`src/modules/bookings/booking.cancellation.ts:412-463`, comentario líneas 412-424).
    2. `applyNoShowStrike(tenantId, playerId, tx)` (`src/modules/relationships/ptr.service.ts:105-138`):
       incrementa `player_tenant_relationships.noshow_count` y `last_no_show_at`
       (resetea a 1 si la última ausencia fue hace más de 90 días, `nextNoShowCount`,
       `ptr.service.ts:82-91`).
    3. Si `noshowCount >= 2` dentro de la ventana → `extendSoftban` inserta (o extiende) una fila en
       `tenant_player_bans` con `reason='Ausencias reiteradas (2+ en 90 días)'`,
       `banned_until = now + 14 días`, `banned_by=NULL` (distinción de un ban manual del complejo)
       (`ptr.service.ts:39-74`). Reutiliza el mismo mecanismo de `tenant_player_bans` que los bans
       manuales — `checkPlayerBanned` ya lo lee, sin gate nuevo (comentario `booking.cancellation.ts:423`).
    4. `audit_logs`: acción `player.no_show_softban_applied` (o `player.no_show_recorded` si no
       softbanea) + `booking.marked_no_show` (`booking.cancellation.ts:432-460`).
  - API/Action: `markNoShowAction(bookingId)` (`src/app/(admin)/reservas/actions.ts:199-234`) →
    `{ success: true, booking }`; rechaza `BookingNotYetStartedError` si el turno no empezó
    (`actions.ts:219-222`).
  - Externos: ninguno (el softban es 100% interno, no dispara email/push en este flujo).
  - UI-sin-reload: `revalidateBooking(bookingId)` (`actions.ts:231`) + `router.refresh()` cliente
    (`BookingActions.tsx:112`).
- **Evidencia (path:línea):**
  - `src/app/(admin)/reservas/actions.ts:199-234` (`markNoShowAction`)
  - `src/modules/bookings/booking.cancellation.ts:412-463` (`handleNoShow`)
  - `src/modules/relationships/ptr.service.ts:20,39-138` (`applyNoShowStrike`, `extendSoftban`,
    `nextNoShowCount`)
  - `src/shared/constants.ts:23,29` (`NO_SHOW_STRIKE_WINDOW_DAYS`, `NO_SHOW_SOFTBAN_DAYS`)
  - `src/app/(admin)/reservas/[id]/BookingActions.tsx:229-238` (texto del diálogo, mismo aviso de
    softban visible al admin)

---

## TG-HP-213 — Cancelar reserva con refund / sin refund
- **Rol:** Admin o manager — `requireOperatorStaff` (`src/app/(admin)/reservas/actions.ts:248`).
- **Prerrequisitos:**
  - Caso CON refund: reserva `confirmed`, seña `deposit_status='paid'` vía MercadoPago
    (`payment_id` seteado), cancelación DENTRO de la política (`cancellation_policy.hours_before`) o
    motivo `"El complejo necesita cancelar"` (reembolsa siempre sin importar el plazo).
  - Caso SIN refund: misma reserva pero cancelación FUERA del plazo con motivo
    `"El jugador pidió cancelar"`.
- **Flujo de navegación (UI steps) — común a ambos casos:**
  1. Navegar a `/reservas/[id]`.
  2. Click `Cancelar` (`BookingActions.tsx:160-167`) — abre `ConfirmDialog` título "Cancelar reserva".
  3. Elegir `¿Quién cancela?`: radio `El complejo necesita cancelar` (refund automático) o
     `El jugador pidió cancelar` (aplica política) (`BookingActions.tsx:184-210`).
  4. Leer el aviso ámbar de preview de reembolso, calculado client-side ANTES de confirmar
     (`refundPreview`, `BookingActions.tsx:122-139,212-214`) — ej. "Se reembolsará la seña de $X vía
     MercadoPago." o "...la seña de $X queda para el complejo (sin reembolso)."
  5. Rellenar `Motivo (obligatorio)` (`#cancel-reason`, mínimo 3 caracteres,
     `BookingActions.tsx:216-225`).
  6. Click `Cancelar reserva` (`confirmLabel`, dentro del diálogo).
- **Comportamiento de componentes:**
  - Loading/Anti-doble-submit: `disabled={pending}` en el botón que abre el diálogo
    (`BookingActions.tsx:162`); `onConfirmCancel` valida `cancelType` y longitud del motivo
    client-side antes de llamar al server (`BookingActions.tsx:97-106`).
  - Feedback: toast `Reserva cancelada` variant `success` (`BookingActions.tsx:102`) +
    `router.refresh()`.
- **Validación de datos:**
  - DB: `cancelByAdmin(bookingId, staffUserId, reason, cancellationType, gateway, tx)`
    (`src/modules/bookings/booking.cancellation.ts:262-410`):
    - `decideAdminRefund` (líneas 34-44): `shouldRefund = true` siempre si `cancellationType==='complejo'`;
      si `'jugador'`, `shouldRefund = inPolicy` (dentro de `cancellation_policy.hours_before`).
    - `status → 'canceled_refunded'` (si `shouldRefund`) o `'canceled_no_refund'` (líneas 301,
      CLAUDE.md: nombres sin doble L).
    - Con refund y seña MP (`payment_id` + `gateway` disponible): `prepareRefund(paymentId,
      depositAmount, tx)` dentro de la misma tx (deja fila `payments` tipo refund en estado
      `pending`, `deposit_status → 'refunded'`) — la llamada real a MP (`settleRefund`) se hace
      DESPUÉS de que la tx del cancelamiento ya commiteó (`booking.cancellation.ts:307-309`,
      `reservas/actions.ts:325-339`).
    - Sin refund: `deposit_status → 'captured'` (la seña queda para el complejo).
    - `canceled_reason` se guarda con prefijo `"Cancelado por el complejo: {motivo}"` o
      `"Cancelado a pedido del jugador: {motivo}"` (`CANCELLATION_TYPE_LABEL`,
      `booking.cancellation.ts:257-260,322`).
    - `audit_logs` acción `booking.canceled_by_admin` con metadata `{reason, cancellationType,
      inPolicy, shouldRefund, depositStatus}` (`booking.cancellation.ts:337-345`).
  - API/Action: `cancelBookingAction(bookingId, reason, cancellationType)`
    (`src/app/(admin)/reservas/actions.ts:236-342`) → `{ success: true, booking }`; rechaza motivo <3
    caracteres o `cancellationType` inválido antes de tocar la DB (`actions.ts:241-246`); si corresponde
    refund MP pero el gateway no está disponible, error `"No se pudo procesar el reembolso por
    MercadoPago. Gestionalo manualmente."` (`actions.ts:287-291`).
  - Externos: MercadoPago real vía `settleRefund(pendingRefund, gateway, tenant.id)` →
    `gateway.createRefund(...)` (`src/modules/payments/payment.service.ts:736-756`); en E2E,
    `MP_MOCK_MODE=1` sustituye el gateway real. Notificación al jugador (`booking_canceled` /
    `booking_canceled_by_complex`) vía `dispatchEmail` (Resend) después del commit
    (`reservas/actions.ts:307-319`).
  - UI-sin-reload: `revalidateBooking(bookingId)` (`actions.ts:300`) + `router.refresh()` cliente
    (`BookingActions.tsx:103`).
- **Evidencia (path:línea):**
  - `src/app/(admin)/reservas/actions.ts:236-342` (`cancelBookingAction` completo, orquestación de
    refund post-commit)
  - `src/modules/bookings/booking.cancellation.ts:26-44,262-410` (`decideAdminRefund`, `cancelByAdmin`)
  - `src/modules/payments/payment.service.ts:642-756` (`prepareRefund`, `settleRefund`)
  - `src/app/(admin)/reservas/[id]/BookingActions.tsx:96-240` (diálogo, preview de reembolso, labels)

---

## GAPS

1. **TG-HP-206 (fotos de cancha durante la creación):** no existe upload de fotos en el modo "Nueva
   cancha" — la sección `ImageUploader` de `CourtForm.tsx` solo se renderiza con `{isEdit && (...)}`
   (`src/app/(admin)/canchas/components/CourtForm.tsx:250-268`). El happy path real es crear → editar
   → subir fotos (documentado arriba), no "crear con fotos" en un solo paso. (El wizard de onboarding
   Paso 3 SÍ permite fotos en el draft de creación, `StepCourts`/`CourtDraftCard` — camino distinto,
   fuera de `/canchas`.)
2. **TG-HP-204/205/206 — R2 no configurado:** si `isR2Configured()` es `false` (falta la config de R2
   en el entorno de test), las 3 actions de upload devuelven exactamente
   `{ success: false, error: 'Storage no configurado en este entorno' }` sin lanzar excepción
   (`settings/perfil/actions.ts:43-46`, `onboarding/actions.ts:271-274`,
   `canchas/actions.ts:239-242`) — el sub-agente browser debe verificar `process.env` de R2 antes de
   asumir que el happy path completo (subida real) es alcanzable en el entorno de ejecución; si no lo
   está, el happy path documentable es el mensaje de gate, no la subida.
3. **TG-HP-209 — cobertura automatizada real:** los 2 E2E de Realtime multi-browser (<2s propagación y
   catch-up tras offline) están `test.fixme` y NO corren en CI
   (`tests/e2e/grilla-realtime.spec.ts:114,186`). No hay prueba automatizada verde de la propagación
   Realtime en sí — solo el test de touch-targets mobile corre. Cualquier verificación de este caso por
   el sub-agente browser es manual (2 pestañas), no reproduce una suite ya verde.
4. **TG-HP-211 (Marcar completada) — feedback asimétrico:** a diferencia de Cancelar/Marcar ausente,
   este botón NO dispara toast de éxito, solo `router.refresh()` silencioso
   (`BookingActions.tsx:88-95`). No es una omisión de esta ficha: es el comportamiento real del código.


# Happy-paths ADMIN — Caja + Config + Billing + Notificaciones (TG-HP-214 a 228)

Fixtures usados en todos los casos (scripts/seed-e2e.ts):
- Tenant Demo: `id 00000000-0000-4000-8000-000000000001`, slug `e2e-complejo-demo` (`scripts/seed-e2e.ts:23-24`).
- Admin: `e2e-admin@turnogol.test`, `staffUserId 00000000-0000-4000-8000-000000000003`, rol `admin` en `tenant_staff_members` (`scripts/seed-e2e.ts:27-29,234`).
- Cancha seed: `courtId 00000000-0000-4000-8000-000000000010`, "Cancha E2E 1" (`scripts/seed-e2e.ts:30,170`).
- **No hay fixture de rol `manager`** en el seed E2E — `scripts/seed-e2e.ts:234,242` siembran únicamente `role: 'admin'` (para `e2e-admin@turnogol.test` y `e2e-admin-2@turnogol.test`). Los casos que necesitan un manager (TG-HP-221, TG-HP-226) lo declaran como prerrequisito y, cuando corresponde, el propio caso lo crea (TG-HP-226 es la fuente).
- Base `http://localhost:3000`. Sesión admin inyectada por cookie (`tests/e2e/.auth/admin.json`).
- Montos en centavos de ARS (integer) salvo que se indique lo contrario.
- MP en modo mock por default (`MP_MOCK_MODE=1`, `MP_MOCK_ENABLED`). Los casos marcados **[REQUIERE MP REAL]** dependen de credenciales OAuth/preapproval reales.

---

## TG-HP-214 — Caja: agregar movimiento (ingreso / gasto)
- **Rol:** Admin (dueño); el manager también puede — `requireOperatorStaff()` acepta `['admin','manager']` (`src/modules/staff/guards.ts:92-97`).
- **Prerrequisitos:** sesión admin o manager activa; caja del tenant Demo del día de hoy SIN fila en `daily_cash_closes` (día abierto).
- **Flujo de navegación (UI steps):**
  1. Ir a `/caja` (`src/app/(admin)/caja/page.tsx`).
  2. Click en **`+ Agregar movimiento`** (`src/app/(admin)/caja/components/CajaActions.tsx:44`).
  3. Se abre el modal **`Agregar movimiento`** (`DialogTitle`, `src/app/(admin)/caja/components/RegisterMovementModal.tsx:130`).
  4. Elegir **Tipo** — chips `Ingreso` / `Gasto` / `Ajuste` (`RegisterMovementModal.tsx:23-27,133-149`). Mock data: `Ingreso`.
  5. Elegir **Categoría** — el set depende del tipo elegido: `income → Reserva/Cantina·Bar/Otro ingreso`, `expense → Gasto operativo`, `adjustment → Corrección por ausencia/Otro` (`RegisterMovementModal.tsx:29-40,150-166`). Mock data: `Otro ingreso`.
  6. Elegir **Método** — chips `Efectivo/Transferencia/MercadoPago/Otro` (`RegisterMovementModal.tsx:42-47,167-183`). Mock data: `Efectivo`.
  7. Cargar **Monto (pesos)** en `#cf-amount` (`RegisterMovementModal.tsx:185-191`). Mock data: `5000` (pesos) → 500000 centavos.
  8. Cargar **Descripción** en `#cf-desc` (`RegisterMovementModal.tsx:192-196`). Mock data: `"Venta de gorras sueltas"`.
  9. Click **`Guardar`** (`RegisterMovementModal.tsx:201-204`).
- **Comportamiento de componentes:**
  - Loading: el botón cambia a `"Guardando…"` mientras `isPending` (`RegisterMovementModal.tsx:203`); todos los chips e inputs quedan `disabled={isPending}` (líneas 140,157,174,199,201).
  - Anti-doble-submit: `idempotencyKey` UUID generado una sola vez al abrir el modal (`crypto.randomUUID()`, `RegisterMovementModal.tsx:70`); el server hace `ON CONFLICT (client_idempotency_key) ... DO NOTHING` (`src/modules/cashflow/cashflow.service.ts:97-121`), así que un reintento de red no duplica el movimiento.
  - Feedback: `toast({ title: 'Movimiento registrado', variant: 'success' })` (`RegisterMovementModal.tsx:109`); error inline `<p role="alert">{error}</p>` (línea 197) — p.ej. `"Datos inválidos."` si el schema Zod rechaza el input (`src/app/(admin)/caja/actions.ts:84-85`).
- **Validación de datos:**
  - DB: `INSERT INTO cash_flows (tenant_id, type, category, amount, method, description, booking_id, product_id, registered_by, occurred_at, client_idempotency_key)` (`cashflow.service.ts:98-111`); `amount` es integer en centavos ARS; combo `type`/`category` válido según `VALID_COMBOS` (`cashflow.service.ts:20-24`) reforzado por el CHECK `chk_cashflow_type_category` (`src/shared/db/schema/cash-flows.ts:62-67`); `amount > 0` por CHECK `chk_cashflow_amount_positive` (línea 58-61).
  - API/Action: `createCashFlowAction` (`src/app/(admin)/caja/actions.ts:81-114`) → `requireOperatorStaff()` (línea 87) → devuelve `{success:true, cashFlow}` (Server Action, no hay código HTTP literal).
  - Externos: ninguno.
  - UI-sin-reload: cliente hace `reset(); router.refresh(); onClose()` (`RegisterMovementModal.tsx:110`); server además corre `revalidatePath('/caja')` (`actions.ts:111`).
- **Evidencia (path:línea):** `src/app/(admin)/caja/actions.ts:81-114`, `src/app/(admin)/caja/components/RegisterMovementModal.tsx:49-209`, `src/modules/cashflow/cashflow.service.ts:83-141`, `src/shared/db/schema/cash-flows.ts:23-87`.

---

## TG-HP-215 — Caja: vender producto (Cantina/Bar)
- **Rol:** Admin o manager (misma guard `requireOperatorStaff` que TG-HP-214 vía `createCashFlowAction`). Configurar los productos de cantina (`saveCanteenProductsAction`) es **solo admin** (`src/app/(admin)/caja/actions.ts:126`, comentario "Cruce #3").
- **Prerrequisitos:** caja del día abierta; `tenants.settings.canteen_products` con al menos 1 producto cargado (si está vacío, el flujo lo carga primero).
- **Flujo de navegación (UI steps):**
  1. `/caja` → sección **`Cantina/Bar`** (`src/app/(admin)/caja/page.tsx:216`, título `CanteenQuickSale.tsx:60`).
  2. Si no hay productos: click **`Configurar productos`** (`CanteenQuickSale.tsx:75-81`) → dialog **`Productos de cantina`** (línea 335) → click **`Cargar sugeridos (Agua, Gatorade, Cerveza)`** (línea 347, `SUGGESTED` en líneas 26-30: Agua $1500, Gatorade $2500, Cerveza $3500) → **`Guardar`** (línea 407-410).
  3. Click en la tarjeta del producto, p.ej. `Agua` (grid de productos, `CanteenQuickSale.tsx:86-95`).
  4. Se abre el dialog de venta rápida — título = nombre del producto (`DialogTitle`, línea 194).
  5. Ajustar **Cantidad** con los botones `+`/`−` (líneas 200-218). Mock data: cantidad `2`.
  6. Elegir **Método de pago** — chips `Efectivo/Transferencia/MercadoPago` (líneas 221-236). Mock data: `Efectivo`.
  7. Click **`Registrar venta — $ 3.000,00`** (monto = precio × cantidad, línea 245).
- **Comportamiento de componentes:**
  - Loading: botón `"Registrando…"` mientras `isPending` (`CanteenQuickSale.tsx:245`).
  - Anti-doble-submit: `idempotencyKey` UUID por venta, reseteado al cambiar de producto (`CanteenQuickSale.tsx:135,144`); mismo mecanismo `ON CONFLICT DO NOTHING` que TG-HP-214.
  - Feedback: `toast({ title: 'Venta registrada', description: '{producto} — {formatArs(total)}', variant: 'success' })` (`CanteenQuickSale.tsx:172-176`).
- **Validación de datos:**
  - DB: `createCashFlowAction` con `type:'income', category:'product_sale'` (`CanteenQuickSale.tsx:163-164`) → mismo `INSERT INTO cash_flows` que TG-HP-214.
  - API/Action: `createCashFlowAction` (idéntica a TG-HP-214).
  - UI-sin-reload: `onSold()` → `router.refresh()` (`CanteenQuickSale.tsx:103,178`).
- **GAP (⚠️ contrato del caso vs. código real):** el enunciado pide "descuenta stock → CashFlow categoría `product_sale`", pero **no existe ningún descuento de stock**. Los "productos" de Cantina/Bar viven en `tenants.settings.canteen_products` (JSONB: `{id, name, price}`, **sin campo `stock`**) — `src/app/(admin)/caja/actions.ts:59-67`, tipo `CanteenProduct` en `src/modules/tenants/tenant.types.ts`. El payload que arma `QuickSaleDialog.submit()` (`CanteenQuickSale.tsx:161-170`) **no manda `productId`**, y `createCashFlow` acepta `productId` (`cashflow.service.ts:105,134`) pero ningún caller de este módulo lo usa para tocar la tabla `products` (ver GAP detallado en TG-HP-217). Vender un producto de Cantina/Bar nunca decrementa nada.
- **Evidencia (path:línea):** `src/app/(admin)/caja/components/CanteenQuickSale.tsx:1-330`, `src/app/(admin)/caja/actions.ts:24-50,116-149`.

---

## TG-HP-216 — Caja: cerrar caja diaria
- **Rol:** Admin o manager (`requireOperatorStaff`, `src/app/(admin)/caja/actions.ts:159`).
- **Prerrequisitos:** caja del día abierta (sin fila en `daily_cash_closes` para la fecha).
- **Flujo de navegación (UI steps):**
  1. `/caja` → click **`Cerrar caja`** (`src/app/(admin)/caja/components/CloseDayButton.tsx:74-81`).
  2. `ConfirmDialog` título **`Cerrar caja del {fecha}`** (línea 85), descripción: *"El cierre es inmutable: una vez cerrada no se puede editar ni agregar movimientos a este día. Las correcciones posteriores van como ajustes."* (línea 86).
  3. Resumen de solo lectura: Ingresos / Egresos / Saldo neto del día / En efectivo según los movimientos (líneas 93-112).
  4. Opcional: input **`Efectivo contado (opcional, pesos)`** (líneas 114-119). Mock data: dejar vacío (sin diferencia) o cargar un valor distinto al saldo.
  5. Si `declaredCash !== balance`: banner ámbar *"Diferencia de {monto} {de más|de menos}. La nota es obligatoria."* (líneas 121-124) y el label de **Nota** pasa a `(obligatoria)` (líneas 126-129).
  6. Confirmar tipeando la frase `CERRAR` (`confirmationPhrase`, línea 89) en el `ConfirmDialog` genérico y click en confirmar.
- **Comportamiento de componentes:**
  - Loading: delegado al `ConfirmDialog` genérico (`src/components/ui/confirm-dialog.tsx`, no inspeccionado en detalle en este barrido); `onConfirm` es async y devuelve `{success, error?}` (`CloseDayButton.tsx:49-70`).
  - Anti-doble-submit: tras el cierre exitoso, `CajaActions` deja de renderizar el botón por completo (`if (isClosed) return null`, `CajaActions.tsx:36`) — un segundo cierre desde la misma sesión ya no tiene botón disponible tras el refresh. Server-side además hay lock adviso: `pg_advisory_xact_lock(hashtext('daily_close:'||tenantId))` compartido con `assertDayOpen`, serializando cierres/altas concurrentes (`src/modules/cashflow/daily-close.service.ts:53-59`, `cashflow.service.ts:66-72`).
  - Feedback: `toast({ title: 'Caja cerrada', description: 'El resumen del día quedó guardado.', variant: 'success' })` (`CloseDayButton.tsx:59`); error de excepción no controlada: *"No pudimos cerrar la caja. Revisá tu conexión e intentá de nuevo."* (línea 68).
- **Validación de datos:**
  - DB: `INSERT INTO daily_cash_closes (tenant_id, date, total_income, total_adjustments, total_expense, balance, declared_cash, diff_amount, note, closed_by)` (`daily-close.service.ts:75-89`); UNIQUE `(tenant_id, date)` — constraint `uq_daily_close_per_tenant` (`src/shared/db/schema/daily-cash-closes.ts:45-48`); tabla inmutable post-cierre (comentario "REVOKE UPDATE/DELETE en 008", línea 17); `audit_logs` con `action:'cashflow.daily_close'` (`daily-close.service.ts:96-104`).
  - API/Action: `closeDayAction` (`src/app/(admin)/caja/actions.ts:151-189`); errores tipados → `CloseDateInFutureError` → `"No se puede cerrar una fecha futura."` (línea 178); `DayAlreadyCloseExistsError` → `` `La caja del ${date} ya fue cerrada.` `` (línea 181).
  - UI-sin-reload: `router.refresh()` (`CloseDayButton.tsx:60`) + `revalidatePath('/caja')` (`actions.ts:187`); tras el refresh, `page.tsx` renderiza `CierreCard` (resumen verde inmutable, título `"Caja cerrada"` / `"Caja cerrada — el efectivo cuadró"` / `"Caja cerrada — con diferencia anotada"`, `src/app/(admin)/caja/components/CierreCard.tsx:14-33`) en vez de `CajaActions`/`CanteenQuickSale` (`page.tsx:141-158,215-222`).
- **Evidencia (path:línea):** `src/app/(admin)/caja/components/CloseDayButton.tsx:24-137`, `src/modules/cashflow/daily-close.service.ts:42-120`, `src/shared/db/schema/daily-cash-closes.ts:18-67`, `src/app/(admin)/caja/components/CierreCard.tsx:10-90`.

---

## TG-HP-217 — Productos/stock: crear producto (precio/stock) + alerta de stock bajo
**→ GAP, ver detalle también en la sección `## GAPS` al final del documento (ítem 1).**

Este caso **no existe en el código**. La tabla `products` está definida en el schema (`src/shared/db/schema/products.ts:14-44`, columnas `price`, `stock` (default 0, CHECK `chk_product_stock_non_negative`), `lowStockAlert` (default 5), `isActive`) pero:
- **Cero UI**: no hay ninguna página/ruta bajo `src/app/(admin)/**` que liste, cree o edite filas de `products` (grep `products` sobre `src/app` solo matchea `src/app/(business)/precios/page.tsx`, que es la página pública de planes SaaS, sin relación).
- **Cero módulo de dominio**: no existe `src/modules/products/` ni ningún `*.service.ts`/`*.schema.ts` para esta tabla.
- Los únicos 3 lugares que tocan `products` en todo `src/` son: (1) `src/shared/db/schema/cash-flows.ts:14,39` — solo la FK `productId` en `cash_flows`, nunca poblada por ningún caller real (ver TG-HP-215); (2) `src/shared/jobs/workers/data-retention-cleanup.worker.ts` — borra filas de `products` al anonimizar un tenant dado de baja, sin crearlas nunca; (3) `scripts/seed-e2e.ts:76` — `DELETE FROM products WHERE tenant_id = ...` en el wipe del fixture E2E, sin ningún INSERT correspondiente.
- Lo que **sí existe** en su lugar es el flujo "Cantina/Bar" (TG-HP-215): productos ad-hoc en `tenants.settings.canteen_products` (JSONB `{id,name,price}`, gestionados por `saveCanteenProductsAction`, `src/app/(admin)/caja/actions.ts:116-149`), sin campo `stock` ni `lowStockAlert`, sin alerta de stock bajo de ningún tipo.
- **Conclusión:** no hay happy-path que redactar para "crear producto (precio/stock) + alerta de stock bajo" — es una feature de schema muerto, no una feature de producto. Requiere decisión de negocio (¿se construye la UI sobre `products`, o se deprecia la tabla y todo el modelo de stock vive en `canteen_products`?) antes de poder documentar un flujo real.

---

## TG-HP-218 — Abonados `/abonados/nuevo`: crear abonado
- **Rol:** Admin o manager (`requireOperatorStaff`, `src/app/(admin)/abonados/actions.ts:35`).
- **Prerrequisitos:** al menos 1 cancha activa en el tenant (fixture: `courtId 00000000-0000-4000-8000-000000000010`, "Cancha E2E 1").
- **Flujo de navegación (UI steps):**
  1. `/abonados` → click **`Nuevo abonado`** (`src/app/(admin)/abonados/page.tsx:54-58` o `AbonadosList.tsx:107-111`) → navega a `/abonados/nuevo`.
  2. Página **`Nuevo abonado`** (`h1`, `src/app/(admin)/abonados/nuevo/page.tsx:25`).
  3. Fieldset **`Turno fijo`**: `Cancha` (select, mock: `Cancha E2E 1`), `Día de la semana` (select, mock: `Lunes`), `Empieza el` (date input), `Hora de inicio`/`Hora de fin` (time inputs, mock: `18:00`–`19:00`) (`AbonadoForm.tsx:217-234`).
  4. Fieldset **`Cliente`**: `Nombre y apellido` (mock: `"Juan Pérez"`), `Teléfono` (`PhoneInput`) (líneas 238-244).
  5. Fieldset **`Precio y pago`**: `Precio por turno (en pesos)` (mock: `25000`), `Método de pago` (`Efectivo`/`Transferencia`, default `Efectivo`) (líneas 246-258).
  6. Click **`Ver fechas del turno`** (línea 265-271) → dispara `previewAbonadoSlotsAction` (preview, sin persistir nada todavía).
  7. Vista **`Fechas del turno fijo`** (`h2`, línea 75): lista de hasta 8 fechas con badge `Libre`/`Ocupado` (líneas 76-89) y el resumen *"Se crearán {N} turnos."* (línea 90-95).
  8. Click **`Crear abonado`** (línea 110-117) → dispara `submitAction` (`submitNewAbonado`) → `redirect('/abonados')` en éxito.
- **Comportamiento de componentes:**
  - Loading: `Ver fechas del turno` → `"Cargando…"` mientras `isPreviewing` (`AbonadoForm.tsx:267-271`); `Crear abonado` → `"Guardando…"` mientras `isConfirming` (línea 113-117).
  - Anti-doble-submit: ambos botones quedan `disabled` durante su transición (`isPreviewing`/`isConfirming`); no hay idempotency key explícita en este flujo (a diferencia de Caja) — un doble-click en `Crear abonado` mientras `isConfirming=true` está bloqueado solo por el `disabled` del botón (línea 113), sin backend idempotency key.
  - Feedback: **no hay `toast()`** en este flujo — el éxito se comunica implícitamente por el `redirect('/abonados')` server-side (`src/app/(admin)/abonados/nuevo/actions.ts:156`); en error, `submitNewAbonado` vuelve `{status:'error', message}` y `AbonadoForm` cae a fase `'form'` mostrando el mensaje en `previewError` (`AbonadoForm.tsx:190-195,262-264`).
- **Validación de datos:**
  - DB: `INSERT INTO abonados (tenant_id, court_id, player_id, contact_name, contact_phone, day_of_week, time_start, time_end, price_per_session, starts_on, ends_on, status='active', payment_method, notes)` (`src/modules/abonados/abonado.service.ts:158-176`); `price_per_session` en centavos ARS (CHECK `chk_abonado_price_positive`, `src/shared/db/schema/abonados.ts:65-68`); sin campo de saldo a favor (confirmado — el schema no tiene `credit_balance` ni similar). Genera hasta 8 `bookings` futuros con `type:'fixed', status:'confirmed', deposit_status:'not_required'` (`abonado.service.ts:91-139,190-195`).
  - API/Action: `createAbonadoAction` (`src/app/(admin)/abonados/actions.ts:28-61`) → `AbonadoConflictError` → `"Ya existe un turno fijo activo en ese horario."` (mismo mensaje que el preview, `nuevo/actions.ts:124`).
  - Externos: ninguno.
  - UI-sin-reload: `revalidatePath('/abonados')` (`actions.ts:59`) + `redirect('/abonados')` server-side (`nuevo/actions.ts:156`).
- **Evidencia (path:línea):** `src/app/(admin)/abonados/nuevo/AbonadoForm.tsx:123-274`, `src/app/(admin)/abonados/nuevo/actions.ts:1-158`, `src/app/(admin)/abonados/actions.ts:28-61`, `src/modules/abonados/abonado.service.ts:141-212`, `src/modules/abonados/abonado.schema.ts:14-27`.

---

## TG-HP-219 — Jugadores `/jugadores`: ficha + indicador de softban activo
- **Rol:** Admin o manager (`requireOperatorStaff`, `src/app/(admin)/jugadores/[playerId]/page.tsx:17`).
- **Prerrequisitos:** un jugador con vínculo activo al tenant (`player_tenant_relationships`) y, para ver el indicador, una fila vigente en `tenant_player_bans` para ese `(tenant_id, player_id)` — vigente = `banned_until IS NULL OR banned_until > NOW()` (`src/modules/bans/ban.service.ts:17-19`). Esa fila puede venir de (a) softban automático por 2da ausencia en <90 días (`applyNoShowStrike`, fuera de este caso) o (b) el ban manual descripto abajo.
- **Flujo de navegación (UI steps):**
  1. `/jugadores` → buscador `Buscar por nombre, teléfono o email` (`src/app/(admin)/jugadores/JugadoresView.tsx:20-30`).
  2. Click en el jugador en la lista (badge ámbar `{N} ausencia(s)` si `noshowCount > 0`, líneas 55-59) → navega a `/jugadores/{playerId}`.
  3. Ficha: nombre (`h1`), Email/Teléfono/Cliente desde (`JugadorProfileView.tsx:92-110`); 4 stat cards `Reservas totales/Completadas/Ausencias/Tasa de ausencia` (líneas 76-119).
  4. Si `ban.banned`: banner ámbar **`Bloqueado para reservar online`** + `{ban.reason}` + `Hasta el {fecha}.` o `Sin fecha de fin.` (líneas 121-131).
  5. Botón **`Bloquear jugador`** (si no está baneado) o **`Levantar bloqueo`** (si lo está) — oculto por completo si el ban es global (`players.status='banned'`, `ban.bannedGlobal`) (`BanPlayerControls.tsx:55-92`).
  6. Para banear: click `Bloquear jugador` → `ConfirmDialog` título **`Bloquear jugador`**, radios de **Duración** `7 días`/`30 días`/`Indefinido` (mock: `7 días`) + textarea **`Motivo (obligatorio)`** (mock: `"Faltó sin avisar"`) → confirmar (líneas 92-133).
  7. Sección **`Historial de reservas`** con fecha/horario/cancha/tipo/precio/estado (líneas 140-165).
- **Comportamiento de componentes:**
  - Loading: no hay estado de carga cliente explícito — la página es un Server Component (`page.tsx`); `BanPlayerControls` es `'use client'` pero no expone `isPending` (delegado al `ConfirmDialog` genérico).
  - Anti-doble-submit: no hay idempotency key; el `ConfirmDialog` es el único gate.
  - Feedback: `toast({ title: 'Jugador bloqueado', variant: 'success' })` (`BanPlayerControls.tsx:45`) / `toast({ title: 'Bloqueo levantado', variant: 'success' })` (línea 51).
- **Validación de datos:**
  - DB: `checkPlayerBanned` lee primero `players.status` (ban global) y luego `tenant_player_bans` filtrando por vigencia (`ban.service.ts:21-58`); el ban manual escribe en `tenant_player_bans` vía `banPlayerManually` (no leído en detalle en este barrido, pero referenciado en `ban.service.ts:104`).
  - API/Action: `banPlayerAction`/`liftPlayerBanAction` (`src/app/(admin)/jugadores/actions.ts`, referenciadas en `page.tsx:10,37-38` — no inspeccionadas línea a línea en este barrido).
  - UI-sin-reload: no observado un `router.refresh()` explícito en `BanPlayerControls.tsx` — el `ConfirmDialog` probablemente lo maneja internamente (no verificado; **flag para revisión**, ver GAPS).
- **Evidencia (path:línea):** `src/app/(admin)/jugadores/[playerId]/JugadorProfileView.tsx:68-167`, `src/app/(admin)/jugadores/[playerId]/BanPlayerControls.tsx:36-135`, `src/app/(admin)/jugadores/[playerId]/page.tsx:15-41`, `src/modules/bans/ban.service.ts:1-58`, `src/app/(admin)/jugadores/queries.ts:1-146`.
- **Nota (no bloqueante, agregar a GAPS):** no confirmé en este barrido si `BanPlayerControls` llama `router.refresh()` tras un ban/lift exitoso, ni el contenido exacto de `banPlayerAction`/`liftPlayerBanAction` (`src/app/(admin)/jugadores/actions.ts`) — quedó fuera del alcance de lectura de esta pasada.

---

## TG-HP-220 — Reportes `/reportes` + exportar CSV
- **Rol:** cualquier staff autenticado — `ReportesPage` solo valida `user.type === 'staff'` (`src/app/(admin)/reportes/page.tsx:79-83`), sin gate de rol (`requireOperatorStaff`/`requireAdminStaff`) a nivel página. El endpoint de export tampoco filtra por rol más allá de `extractAuthUser` (`src/app/api/reports/revenue/route.ts:17-20`) — **manager también accede**.
- **Prerrequisitos:** al menos 1 booking/cash_flow en el mes actual para que se muestren los KPIs reales (si el mes está vacío, se ve el estado fantasma).
- **Flujo de navegación (UI steps):**
  1. `/reportes` → header con navegación de mes `←`/`Hoy no aplica, mes actual por default`/`→` (`page.tsx:117-146`).
  2. Si el mes tiene actividad: 4 KPI cards `Ingresos/Ajustes/Saldo/Reservas` (líneas 154-182), `TrendChart` (`"Tendencia mensual"`, solo si hay `prevPeriod`, línea 185-187), `OccupancyChart` (`"Ocupación de canchas"`, solo si `byCourt.length>0`, línea 190).
  3. Tablas **`Por cancha`** (líneas 193-247) y **`Por método de pago`** (líneas 250-276).
  4. Click **`Exportar CSV`** (link, no botón — `<a href="/api/reports/revenue?from=...&to=...&format=csv">`, líneas 283-289) → descarga de archivo del navegador.
  5. Si el mes está vacío: card fantasma *"✦ Así se verá tu mes cuando cargues reservas"* con KPIs ghost al 50% opacidad y CTA `"Cargá tu primera reserva desde la grilla"` → `/grilla` (`GhostKpis`, líneas 41-71); en ese caso el botón `Exportar CSV` no se renderiza (`{!isEmpty && (...)}`, línea 281).
- **Comportamiento de componentes:**
  - Loading/anti-doble-submit: no aplica — `Exportar CSV` es un link `<a>` estándar (GET idempotente), sin estado `pending` cliente.
  - Feedback: ninguno explícito en UI — el navegador maneja la descarga nativamente (`Content-Disposition: attachment`).
- **Validación de datos:**
  - DB: `getCashFlowsForExport` hace `LEFT JOIN bookings/courts` sobre `cash_flows` filtrando por rango `[from, to)` (`src/modules/reports/report.service.ts:195-225`); columnas del CSV: `fecha, tipo, categoria, monto_ars, metodo, descripcion, cancha` (líneas 217-225).
  - API/Action: `GET /api/reports/revenue?from&to&format=csv` (`src/app/api/reports/revenue/route.ts:16-51`) → 200 con `Content-Type: text/csv; charset=utf-8` y `Content-Disposition: attachment; filename="reporte-{from}-{to}.csv"` (líneas 45-50); rate-limit `enforce('adminCrud', tenant.id)` (línea 36-37); `422`/`401` en input inválido/sin sesión (líneas 18-20,28-30).
  - UI-sin-reload: n/a (descarga de archivo).
- **GAP menor (nombre de columna engañoso):** la columna CSV `monto_ars` **no está en pesos** — `report.service.ts:221` hace `monto_ars: r.amount` sin dividir por 100; sigue siendo el entero en centavos. El nombre de columna sugiere ARS enteros pero el valor es centavos crudos.
- **Evidencia (path:línea):** `src/app/(admin)/reportes/page.tsx:73-294`, `src/app/api/reports/revenue/route.ts:1-51`, `src/modules/reports/report.service.ts:195-225`.

---

## TG-HP-221 — Métricas `/metricas`
- **Rol:** Admin o manager pueden **abrir la página** (`MetricasPage` solo valida `user.type==='staff'`, `src/app/(admin)/metricas/page.tsx:16-20`, sin `requireOperatorStaff`), pero ver **datos** requiere `admin` — ver GAP abajo.
- **Prerrequisitos:** actividad en los últimos 30 días para que los gráficos no estén vacíos.
- **Flujo de navegación (UI steps) — sesión ADMIN:**
  1. `/metricas` → header `"Métricas"`, subtítulo *"Actividad del complejo en los últimos 30 días. Se actualiza cada minuto."* (`page.tsx:25-29`).
  2. `MetricsDashboardLoader` monta `MetricsDashboard` (client) que hace `fetch('/api/admin/metrics')` al montar y cada 60s (`REFRESH_INTERVAL_MS`, `MetricsDashboard.tsx:28,245-273`).
  3. **`Reservas por día`** (LineChart, últimos `windowDays` días, líneas 296-337).
  4. **`Tasa de ausencias`** card: `{ratePct}%`, *"{noShow} ausencias sobre {finished} turnos terminados"*, tendencia vs. período anterior en pts (líneas 46-74).
  5. **`Ingresos`** BarChart con toggle `Día`/`Semana`/`Mes` (líneas 77-135).
  6. **`Top 5 horarios más reservados`** (líneas 138-166).
  7. Si `canSeeSystem` (rol admin, `getStaffRole(...) === 'admin'`, `page.tsx:22`): card **`Estado del sistema`** con `Base de datos` (Operativa/Caída + latencia), `Trabajos en cola`, `Último chequeo de salud` + `<details>` `Detalle por cola` (líneas 168-229).
- **Comportamiento de componentes:**
  - Loading: `role="status" aria-label="Cargando métricas"` con spinner mientras `!metrics` (`MetricsDashboard.tsx:283-289`).
  - Feedback: banner ámbar *"La última actualización falló; estás viendo datos anteriores."* si un poll posterior al primero falla (líneas 298-301); banner rojo *"No pudimos cargar las métricas. Probá de nuevo en unos segundos."* si nunca hubo un fetch exitoso (líneas 275-281).
- **Validación de datos:**
  - API/Action: `GET /api/admin/metrics` → `withTenant(withRole('admin', ...))` (`src/app/api/admin/metrics/route.ts:19-27`) → 200 `{data: TenantMetrics}`; `GET /api/admin/system-status` solo si `canSeeSystem`.
  - UI-sin-reload: polling `setInterval` client-side, sin `router.refresh()`.
- **GAP 🔴 (contradice CLAUDE.md):** el contrato pide *"el manager no ve métricas de sistema"* (implicando que SÍ ve las métricas de negocio). El código real es más restrictivo: `GET /api/admin/metrics` exige `withRole('admin', ...)` (`src/app/api/admin/metrics/route.ts:19-20`), y `withRole` compara el rol real leído de `tenant_staff_members` contra el string exacto pedido — si `role !== 'admin'` devuelve `403 forbidden` (`src/shared/middleware/with-role.ts:22-39`). Como `getStaffRole` devuelve `'admin' | 'manager'` (2 roles vigentes, `src/modules/staff/roles.ts:6`), un **manager** que abre `/metricas` nunca recibe `200` de `/api/admin/metrics`: `res.ok` es `false` → `catch` → `setError(true)` (`MetricsDashboard.tsx:247-253`) → como `metrics` nunca se pobló, la página queda en el banner rojo *"No pudimos cargar las métricas..."* para SIEMPRE, sin ver ningún gráfico de negocio. El comentario del propio route (`route.ts:14-17`) reconoce que usó `withRole('admin')` como "el gate más estricto disponible" citando un modelo de 1-solo-rol que ya no aplica (hoy hay 2 roles). Esto es una decisión de negocio pendiente, no algo para "arreglar" en silencio.
- **Evidencia (path:línea):** `src/app/(admin)/metricas/page.tsx:1-33`, `src/app/(admin)/metricas/MetricsDashboard.tsx:231-349`, `src/app/api/admin/metrics/route.ts:1-27`, `src/shared/middleware/with-role.ts:1-39`, `src/modules/staff/roles.ts:1-22`.

---

## TG-HP-222 — Settings reservas `/settings/reservas`: activar/desactivar seña + `deposit_percentage`
- **Rol:** solo Admin — `requireAdminStaffAction` (`src/app/(admin)/settings/reservas/actions.ts:26`). El manager no tiene acceso a `/settings/*` en absoluto (ver TG-HP-226).
- **Prerrequisitos:** ninguno especial.
- **Flujo de navegación (UI steps):**
  1. `/settings/reservas` → tabs de Configuración, tab activa **`Reservas`** (`SettingsTabs.tsx:5`, `ReservasPolicyPage`, `src/app/(admin)/settings/reservas/page.tsx:8-29`).
  2. Card **`Políticas de Reserva`** (`h2`, línea 24).
  3. Fieldset **`Seña`**: chips **`Requerir seña`** / **`Sin seña`** (`ReservasPolicyForm.tsx:70-91`). Mock data: activar `Requerir seña`.
  4. Si `Requerir seña`: **`Porcentaje de seña (%)`** — chips `30%`/`50%`/`100%`/`Otro` (líneas 97-152). Mock data: `50%`.
  5. **`Reservas online`** — chips **`Habilitadas`** / **`Deshabilitadas`** (líneas 157-186).
  6. **`Anticipación mínima para cancelar`** — chips `Sin límite`/`2 hs`/`6 hs`/`12 hs`/`24 hs`/`Otro` (líneas 189-251).
  7. Fieldset **`Ausencias (no-show)`** — solo texto informativo, sin controles: *"Cuando marcás a un jugador como ausente, si había pagado seña la perdés a favor del complejo. La primera ausencia solo queda registrada. Si vuelve a faltar dentro de los 90 días, queda bloqueado para reservar online en tu complejo por 14 días. No requiere configuración."* (líneas 254-263).
  8. Click **`Guardar cambios`** (`SubmitButton`, línea 265).
- **Comportamiento de componentes:**
  - Loading: `SubmitButton` muestra `pendingLabel` default `"Guardando…"` mientras `pending` (`src/components/ui/submit-button.tsx:15,36`), botón con `isLoading={pending}` (línea 30).
  - Anti-doble-submit: `useFormStatus().pending` deshabilita el submit vía `isLoading` del `Button` subyacente durante la Server Action.
  - Feedback: **no es un `toast()`** — texto inline `role="status"` *"Políticas guardadas."* en verde, solo si `didSubmit && state.success` (`ReservasPolicyForm.tsx:275-279`); error `role="alert"` con `state.error` (líneas 270-274).
- **Validación de datos:**
  - DB: `UPDATE tenants SET settings = settings || {requires_deposit, deposit_percentage, allow_online_booking, cancellation_policy:{hours_before, penalty_type:'deposit', penalty_amount:null}}::jsonb` (`src/app/(admin)/settings/reservas/actions.ts:52-74`); `deposit_percentage` validado `int().min(10).max(100)` (línea 17); `cancellationHoursBefore` `int().min(0).max(72)` (línea 19). Confirmado: **no se persiste `no_show_penalty`** — softban por reincidencia sin config por complejo (comentario líneas 50-51).
  - API/Action: `updateReservasPolicyAction` (líneas 22-78) → `requireAdminStaffAction` — un manager que invoque esta action directo recibe `{success:false, error:'Solo el administrador puede modificar la configuración.'}` (`src/modules/staff/guards.ts:103-108`).
  - UI-sin-reload: `revalidatePath('/settings/reservas')` (`actions.ts:76`).
- **Evidencia (path:línea):** `src/app/(admin)/settings/reservas/actions.ts:1-79`, `src/app/(admin)/settings/reservas/ReservasPolicyForm.tsx:28-284`, `src/components/ui/submit-button.tsx:1-39`.

---

## TG-HP-223 — Settings horarios `/settings/horarios` (+ día operativo `closes_next_day`)
- **Rol:** solo Admin (`requireAdminStaffAction`, `src/app/(admin)/settings/horarios/actions.ts:19`).
- **Prerrequisitos:** ninguno especial.
- **Flujo de navegación (UI steps):**
  1. `/settings/horarios` → tab **`Horarios`** → card **`Horarios de apertura`** (`h2`, `src/app/(admin)/settings/horarios/page.tsx:29`).
  2. Bloque **`Horario general`** — inputs `Abre`/`Cierra` (time), aplica a todos los días salvo excepción (`ScheduleFields.tsx:73-107`). Mock data: `18:00`–`23:00`.
  3. Lista de 7 días: cada uno con checkbox `{Día} abierto`, badge `{open} a {close}` + botón **`Personalizar`** (usa el horario general por default) o `Cerrado` si se desmarca (líneas 110-182). Al personalizar aparecen inputs propios `Horario propio:` con `Abre`/`Cierra` + botón **`Restablecer`** (líneas 184-207).
  4. Checkbox **`Cierra después de medianoche`**: *"Activalo si algún día cerrás en la madrugada (ej. abrís 18:00 y cerrás 02:00). Esos turnos cuentan como parte de la misma jornada (el día anterior)."* (`ScheduleFields.tsx:212-228`). Si algún día tiene `close <= open` sin este flag, aparece el hint azul *"¿Cerrás pasada la medianoche? Activá «Cierra después de medianoche» acá abajo."* (líneas 102-106). Mock data: activar, con un día (ej. Sábado) `20:00`–`02:00`.
  5. Click **`Guardar horarios`** (`SubmitButton`, `HorariosForm.tsx:52`).
  6. Sección **`Días cerrados`** (excepciones puntuales, separado de horarios recurrentes): lista de fechas + botón eliminar (`RemoveClosedDateForm`) y form **`Agregar`** (`AddClosedDateForm`) (`page.tsx:33-57`).
- **Comportamiento de componentes:**
  - Loading/anti-doble-submit: mismo `SubmitButton` que TG-HP-222 (`isLoading={pending}`, pendingLabel `"Guardando…"`).
  - Feedback: texto inline `role="status"` **`"Horarios guardados."`** (`HorariosForm.tsx:58-59`); error `role="alert"` con `state.error` (línea 56).
- **Validación de datos:**
  - DB: `UPDATE tenants SET opening_hours = {...}, closes_next_day = {bool}` — `closesNextDay` vive en su **propia columna**, NO dentro del JSONB `opening_hours` (`src/app/(admin)/settings/horarios/actions.ts:31-39`, comentario explícito línea 31). Consumido por `src/shared/time/operating-day.ts` (`effectiveCloseMins`/`endLabelFromMins`/`normalizeRangeToOpenDay`) en todos los generadores de slots.
  - API/Action: `updateHorariosAction` (`actions.ts:15-43`) → `requireAdminStaffAction` (línea 19) → error si `horariosSchema.safeParse` falla: *"Horarios inválidos."* o el mensaje Zod específico (línea 28).
  - UI-sin-reload: `revalidatePath('/settings/horarios')` (`actions.ts:41`).
- **Evidencia (path:línea):** `src/app/(admin)/settings/horarios/actions.ts:1-44`, `src/app/(admin)/settings/horarios/HorariosForm.tsx:1-65`, `src/components/schedule/ScheduleFields.tsx:1-229`, `src/shared/time/operating-day.ts`.

---

## TG-HP-224 — Settings facturación `/settings/facturacion`: conectar MercadoPago (OAuth) **[REQUIERE MP REAL]**
- **Rol:** solo Admin — reforzado en 2 capas: `getStaffRole(...) !== 'admin'` en `page.tsx` no aplica (la página en sí no gatea por rol, solo `extractAuthUser`), pero el link **`Conectar MercadoPago`** apunta a `/api/mp/oauth-start`, que sí valida `role !== 'admin' → redirect('/dashboard?error=mp_forbidden')` (`src/app/api/mp/oauth-start/route.ts:23-26`) y el callback lo revalida de nuevo (`src/app/api/mp/callback/route.ts:82-85`).
- **Prerrequisitos [REQUIERE MP REAL]:** `MP_CLIENT_ID`/`MP_CLIENT_SECRET`/`NEXT_PUBLIC_APP_URL` configurados con credenciales OAuth reales de MercadoPago (no hay mock para el flujo OAuth completo — a diferencia de pagos de reserva, que sí tienen `MP_MOCK_MODE`). Tenant sin `mp_access_token` todavía (`tenant.mpConnectedAt` null).
- **Flujo de navegación (UI steps):**
  1. `/settings/facturacion` → tab **`Facturación`** → card **`Suscripción`** (estado actual, ver TG-HP-227) (`src/app/(admin)/settings/facturacion/page.tsx:55-92`).
  2. Card **`MercadoPago`** con ícono `CreditCard`: *"Conectá tu cuenta para cobrar las señas de las reservas online directamente."* (líneas 94-103). Si `mpConnected`: badge **`Conectado`** (líneas 104-108); si no: link **`Conectar MercadoPago`** con ícono `ExternalLink`, `href="/api/mp/oauth-start"` (líneas 110-117).
  3. Click → `GET /api/mp/oauth-start` valida sesión+rol admin → redirect a `https://auth.mercadopago.com/authorization?client_id=...&state=...&redirect_uri=.../api/mp/callback` (`oauth-start/route.ts:28-54`).
  4. Usuario autoriza en MercadoPago (fuera del control de la app).
  5. MP redirige a `/api/mp/callback?code=...&state=...` → valida CSRF (`state` firmado HMAC), revalida sesión/rol admin, TTL de 10 min anti-replay (`callback/route.ts:43-97`) → intercambia `code` por tokens (`POST https://api.mercadopago.com/oauth/token`, líneas 110-120) → `connectMercadoPago(tenantId, {mpAccessToken: encrypt(...), mpRefreshToken: encrypt(...), mpUserId, mpPublicKey})` (líneas 130-135).
  6. Si el onboarding ya estaba completo: `redirect('/settings/facturacion')` (línea 144); si no (viene del wizard), activa `requires_deposit:true` + `completeOnboarding` + `redirect('/onboarding/listo')` (líneas 147-150).
- **Comportamiento de componentes:** no aplica `isPending`/toast — es navegación full-page (link `<a>` + 2 redirects de servidor, sin JS de por medio).
- **Validación de datos:**
  - DB: `tenants.mp_access_token`/`mp_refresh_token` cifrados at-rest (`encrypt(...)`, `src/lib/crypto/encrypt.ts`, no inspeccionado en detalle); `mp_connected_at` se setea (usado como `mpConnected` en la UI).
  - API/Action: `GET /api/mp/oauth-start` (redirect 302 a MP o a `/onboarding?error=mp_not_configured` si falta `MP_CLIENT_ID`); `GET /api/mp/callback` (redirect 302 a `/settings/facturacion` o `/onboarding?error=mp_*` en cada fallo — `mp_missing_params`, `mp_invalid_state`, `mp_token_failed`, `mp_config_missing`).
  - Externos: MercadoPago OAuth real — sin mock disponible para este flujo específico.
  - UI-sin-reload: n/a (full-page redirects).
- **Evidencia (path:línea):** `src/app/(admin)/settings/facturacion/page.tsx:94-118`, `src/app/api/mp/oauth-start/route.ts:1-55`, `src/app/api/mp/callback/route.ts:1-152`.

---

## TG-HP-225 — Settings perfil `/settings/perfil`
- **Rol:** solo Admin (`requireAdminStaffAction`, `src/app/(admin)/settings/perfil/actions.ts:36,87`).
- **Prerrequisitos:** ninguno especial. Storage R2 configurado (`isR2Configured()`) — si no, la action devuelve error sin subir nada.
- **Flujo de navegación (UI steps):**
  1. `/settings/perfil` → tab **`Perfil`** → card **`Perfil público`** (`h2`, `src/app/(admin)/settings/perfil/page.tsx:22`).
  2. Sección **`Logo`**: *"Se muestra en las cards del explorador y en tu perfil público."* → `ImageUploader` con `emptyLabel="Subí el logo de tu complejo"` (`PerfilImagesForm.tsx:62-74`).
  3. Sección **`Portada`**: *"Banner grande en la parte superior de tu perfil público."* → `ImageUploader` con `emptyLabel="Subí una portada"` (líneas 76-87).
  4. Subir un archivo (máx 2MB) → `setTenantImageAction('logo'|'cover', formData)`.
- **Comportamiento de componentes:**
  - Loading/anti-doble-submit: delegado a `ImageUploader` (`src/components/ui/image-uploader.tsx`, no inspeccionado en este barrido).
  - Feedback: **no hay `toast()`** — error inline `role="alert"` con el mensaje de la action, p.ej. *"La imagen no puede superar 2MB"* / *"Storage no configurado en este entorno"* (`PerfilImagesForm.tsx:90-94`, mensajes en `actions.ts:45,56`). Éxito: el `logoUrl`/`coverUrl` local se actualiza optimísticamente (sin mensaje de confirmación).
- **Validación de datos:**
  - DB: `updateTenant(tenant.id, {logoUrl|coverUrl: url})` (`actions.ts:73`).
  - Externos: R2 (`putImage`/`deleteImage`, `src/shared/storage/r2.ts`); archivo subido como `.webp`, key `{tenantId}/{kind}-{uuid}.webp` (línea 61).
  - UI-sin-reload: `revalidatePath('/settings/perfil')` + `revalidatePath('/{tenant.slug}')` (líneas 78-79,110-111).
- **GAP (contrato del caso vs. código real):** el enunciado pide *"datos públicos, además de logo/portada"* — **no existe ningún form de "datos públicos"** (nombre visible, dirección, teléfono público, descripción) en `/settings/perfil`. `PerfilPage` solo renderiza `PerfilImagesForm` (`page.tsx:23-28`); no hay campos de texto editables ahí. Grep sobre `src/app/(admin)/settings/**` para `address|description|publicPhone|publicEmail|whatsapp` no matchea ningún archivo de `perfil/`. Si esos datos existen en algún otro lado (p. ej. el wizard de onboarding), no están expuestos para edición posterior desde Configuración.
- **Evidencia (path:línea):** `src/app/(admin)/settings/perfil/page.tsx:1-33`, `src/app/(admin)/settings/perfil/actions.ts:1-114`, `src/app/(admin)/settings/perfil/PerfilImagesForm.tsx:1-98`.

---

## TG-HP-226 — Equipo `/staff`: agregar miembro (rol manager) + gate
- **Rol:** solo Admin puede ver la página y mutar (`requireAdminStaff`, `src/app/(admin)/staff/page.tsx:14`, redirige `/dashboard` si no es admin) + doble-check dentro de cada Server Action (`assertActorIsAdmin`, `src/app/(admin)/staff/actions.ts:115-134`, leído de DB dentro de la tx, no del JWT).
- **Prerrequisitos:** sesión admin del tenant Demo.
- **Flujo de navegación (UI steps):**
  1. `/staff` → si es manager: `requireAdminStaff` hace `redirect('/dashboard')` **antes** de renderizar nada (`guards.ts:116-124` — el manager nunca ve el roster).
  2. Como admin: `StaffRosterView` con el listado + botón **`Invitar al primer miembro`** (vacío) o **`Invitar miembro`** (`StaffRosterView.tsx:66`, botón genérico `InviteStaffButton`).
  3. Click → `InviteStaffDialog` título **`Invitar miembro del equipo`** (`InviteStaffDialog.tsx:90`).
  4. Campos **`Nombre`**, **`Apellido`**, **`Email`** con hint *"Recibirán un email para activar su cuenta."* (líneas 94-116).
  5. Fieldset **Rol**: radios por cada `STAFF_ROLES` (`Administrador` / `Encargado`) con su descripción — *"Acceso total, incluida la configuración del complejo."* / *"Grilla, reservas y caja. Sin acceso a configuración."* (líneas 118-142, `STAFF_ROLE_LABELS`/`STAFF_ROLE_DESCRIPTIONS`, `src/modules/staff/roles.ts:10-18`). Default preseleccionado: **`Encargado`** (`DEFAULT_INVITE_ROLE = 'manager'`, `roles.ts:22`). Mock data: dejar `Encargado` seleccionado, email `nuevo.encargado@turnogol.test`.
  6. Click **`Enviar invitación`** (`SubmitButton`, `InviteStaffDialog.tsx:31-43`).
- **Comportamiento de componentes:**
  - Loading: botón **`Enviando…`** mientras `pending` (`useFormStatus`, líneas 32-42).
  - Anti-doble-submit: `disabled={pending}` en el submit (línea 36); no hay idempotency key explícita — un reintento de red podría re-disparar `inviteUserByEmail`, tolerado porque Supabase Admin considera "already been registered" como no-error (`actions.ts:224,237-248`).
  - Feedback: en éxito, `toast({ title: 'Invitación enviada', description: 'Recibirán un email para activar su cuenta.' })` + cierre del modal (`InviteStaffDialog.tsx:73-82`); error inline `role="alert"` (líneas 144-151).
- **Validación de datos:**
  - DB: `INSERT INTO tenant_staff_members (tenant_id, staff_user_id, role, added_by, is_active=true) ON CONFLICT (tenant_id, staff_user_id) DO UPDATE SET is_active=true, role=..., added_by=...` (`actions.ts:203-216`); `staff_users` se upsertea vía service role (`upsertStaffUser`, tabla global sin policy de escritura para `turnogol_app`, línea 163-166,193-199).
  - API/Action: `inviteStaffAction` (`actions.ts:136-255`) — flujo en 3 fases (preflight con RLS → upsert global vía worker pool → link + invite con RLS), documentado en comentarios líneas 163-166,191-192,201-202. Rechazo de rol: `assertActorIsAdmin` → *"Solo un administrador puede gestionar el equipo."* (`ADMIN_ONLY_ERROR`, línea 107, usado en línea 132).
  - Externos: Supabase Auth Admin `inviteUserByEmail(email, {redirectTo: '{APP_URL}/dashboard'})` (línea 219-222) + `updateUserById(..., {app_metadata:{staff_user_id, tenant_id, role}})` (líneas 230-236) para un usuario auth nuevo.
  - UI-sin-reload: `revalidatePath('/staff')` (línea 253).
- **Gate verificado (manager NO accede a Equipo):** confirmado en 2 capas — `requireAdminStaff()` en `page.tsx:14` (redirect a `/dashboard`, así que ni con URL directa un manager ve el roster) y `assertActorIsAdmin` dentro de cada Server Action de `staff/actions.ts` (si igual se invoca la action por otro canal, rebota con el mismo mensaje `ADMIN_ONLY_ERROR`).
- **Evidencia (path:línea):** `src/app/(admin)/staff/page.tsx:1-30`, `src/app/(admin)/staff/actions.ts:1-256`, `src/app/(admin)/staff/InviteStaffDialog.tsx:1-159`, `src/modules/staff/roles.ts:1-22`, `src/modules/staff/guards.ts:110-134`.

---

## TG-HP-227 — Billing SaaS: "Activar plan" → preapproval → `trialing → active` **[REQUIERE MP REAL]**
- **Rol:** solo Admin — `POST /api/billing/subscribe` usa `withTenant(..., { roles: ['admin'] })` (`src/app/api/billing/subscribe/route.ts:19,57`).
- **Prerrequisitos [REQUIERE MP REAL]:** tenant en estado `tenant_subscriptions.status = 'trialing'`; dueño (`tenant_staff_members` activo) con `email` real de MercadoPago como `payerEmail` — si el owner no tiene cuenta MP, `subscribe()` lanza `InvalidPayerEmailError` (`billing.service.ts:166-178,199-201`); credenciales MP reales configuradas (el gateway real, no `mp-gateway.mock.ts`).
- **Flujo de navegación (UI steps):**
  1. `/settings/facturacion` → card **`Suscripción`**: si `sub.status==='trialing'` muestra *"Plan: Sin plan elegido"*, *"Estado: Período de prueba"*, *"Fin de la prueba: {fecha}"* (`STATUS_LABELS.trialing = 'Período de prueba'`, `page.tsx:11-19,57-80`).
  2. Card **`Activar plan`** (solo si `trialing` y hay planes activos) — *"Elegí tu plan para seguir facturando cuando termine el período de prueba."* (`ActivatePlanSection.tsx:60-63`, `page.tsx:83-85`).
  3. Chips de plan: `{plan.name} — {rango de canchas}` (mock: `Predio — 1-2 canchas`) (líneas 104-118).
  4. Chips **`Mensual`** / **`Anual`** (default `Mensual`) (líneas 120-135).
  5. Precio mostrado: `{formatArs(price)}/mes` (+ *"(pagando el año)"* si anual) (líneas 137-143).
  6. Click **`Activar plan`** (líneas 145-152) → `POST /api/billing/subscribe` con `{planId, billingCycle}`.
  7. Respuesta `201` con `{data:{checkoutUrl}}` → `window.location.assign(checkoutUrl)` — redirige al Checkout Pro / preapproval de MercadoPago (líneas 74-97).
  8. Usuario completa el pago en MP (fuera de la app) → MP redirige a `returnUrl = {APP_URL}/settings/facturacion` (`billing.service.ts:150-152`) → el webhook `POST /api/webhooks/mercadopago` (no inspeccionado en este barrido) procesa la aprobación y transiciona `trialing → active`.
- **Comportamiento de componentes:**
  - Loading: botón **`Activando…`** mientras `status==='loading'` (`ActivatePlanSection.tsx:75,151`).
  - Anti-doble-submit: no hay idempotency key visible en `ActivatePlanSection`; el botón queda `disabled={status === 'loading'}` mientras la request está en vuelo (línea 148) — sin key server-side, un reintento de red SÍ podría crear un segundo preapproval si el primer intento igual llegó a MP.
  - Feedback: en error, `role="alert"` con `parsed.error?.message ?? 'No se pudo activar el plan. Intentá de nuevo.'` (líneas 91-96,154-158); en éxito no hay toast — es un redirect fuera de la app (`window.location.assign`).
- **Validación de datos:**
  - DB: `UPDATE tenant_subscriptions SET plan_id, billing_cycle, mp_subscription_id = {preapprovalId}` (`billing.service.ts:216-223`); `system_audit_logs` con `action:'subscription.subscribe_initiated'` (líneas 225-235). La transición real a `active` ocurre en el webhook (fuera de este barrido) al confirmarse el primer pago del preapproval.
  - API/Action: `POST /api/billing/subscribe` (`src/app/api/billing/subscribe/route.ts:19-57`) → `201 {data:{checkoutUrl, preapprovalId}}`; errores tipados → `404 PLAN_NOT_FOUND`, `409 INVALID_STATE` (`ReactivateNotAllowedError`, si `status !== 'trialing'`), `404 NOT_FOUND` (`SubscriptionNotFoundError`), `422 INVALID_PAYER_EMAIL` (`businessRule`, línea 52-53).
  - Externos: `gateway.createPreapproval({tenantId, payerEmail, amount, frequency, planId, reason:'TurnoGol — {plan} ({mensual|anual})', returnUrl, notificationUrl})` (`billing.service.ts:205-214`) — MercadoPago real, sin mock disponible para el ciclo completo de preapproval.
  - UI-sin-reload: n/a (redirect fuera de la app a MP).
- **Evidencia (path:línea):** `src/app/(admin)/settings/facturacion/page.tsx:1-122`, `src/app/(admin)/settings/facturacion/ActivatePlanSection.tsx:1-162`, `src/app/api/billing/subscribe/route.ts:1-58`, `src/modules/billing/billing.service.ts:182-241`.

---

## TG-HP-228 — Push al admin cuando llega reserva online (Web Push) + quiet hours 00:00–08:00
- **Rol:** cualquier staff con push habilitado (no hay gate de rol para recibir el push — se enqueuea a **todos** los `push_subscriptions` del tenant, `src/modules/notifications/push.service.ts:32-33`).
- **Prerrequisitos:** admin/manager con notificaciones habilitadas (`PushNotificationManager`, ver flujo de opt-in abajo) — mínimo 1 fila en `push_subscriptions` para el tenant; `VAPID_SUBJECT`/`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` configurados.
- **Flujo de navegación (UI steps) — opt-in:**
  1. Login como admin/manager → `(admin)/layout.tsx` monta `PushNotificationManagerLoader` en todas las páginas del panel (`src/app/(admin)/layout.tsx:44,101`).
  2. Si nunca se habilitó: banner fijo abajo-izquierda *"¿Habilitar notificaciones?"* — *"Recibí un aviso cuando se confirma una reserva online, incluso si no tenés la grilla abierta."* (`PushNotificationManager.tsx:271-274`).
  3. Click **`Habilitar notificaciones`** (línea 275-282) → `Notification.requestPermission()` → si `granted`, registra `sw.js` en scope `/admin/`, hace `pushManager.subscribe(...)` y `POST /api/admin/push/subscribe` (líneas 163-229).
  4. Éxito: `toast({ title: 'Notificaciones habilitadas', description: 'Vas a recibir un aviso cuando llegue una reserva.', variant: 'success' })` (línea 231).
- **Flujo — llega una reserva online con seña confirmada:**
  1. Un jugador reserva y paga la seña (fuera de este caso) → el pago se confirma (webhook MP o reconciliación) → se llama `notifyAdminBookingConfirmed(tenantId, bookingId)` (`push.service.ts:106-156`).
  2. Se arma el contexto (`courtName`, `dateLabel`, `timeLabel`) y se llama `notifyAdminPush(tenantId, {type:'booking.confirmed_online', bookingId, courtName, dateLabel, timeLabel, url:'/admin/grilla?date=...&highlight=...'})` (líneas 141-148).
  3. `notifyAdminPush` calcula `pushSendOptions(now, tenant.timezone)` (`push.service.ts:41-45`) y encola 1 job `QUEUE_PUSH_SEND` por `push_subscriptions` row vía `boss.send(...)` (líneas 47-53).
  4. El worker de push entrega la notificación → el Service Worker la recibe y hace `BroadcastChannel('notif-dedupe').postMessage({id, courtName, dateLabel, timeLabel, url, type})`.
  5. La primera pestaña que "ackea" (dedupe multi-tab) muestra `toast({ title: 'Nueva reserva — {courtName}' | 'Nueva reserva', description: '{dateLabel} · {timeLabel}' | 'Tenés una nueva reserva confirmada en la grilla.', variant: 'success' })` y, si `localStorage['turnogol:notif-sound']==='1'`, reproduce `/sounds/notification.mp3` (`PushNotificationManager.tsx:136-155`).
- **Comportamiento de componentes:**
  - Loading: botón `"Habilitando…"` mientras `status==='pending'` (línea 281).
  - Anti-doble-submit: no aplica (acción de opt-in one-shot); en el dispatch, dedupe multi-tab vía `BroadcastChannel` con `ack` evita que 2 pestañas abiertas muestren el mismo toast dos veces (líneas 112-160).
  - Feedback: toasts arriba descriptos; si falla el enable, `toast({ title: 'No pudimos habilitar notificaciones', description: {msg}, variant: 'destructive' })` (líneas 217,227,234-235).
- **Validación de datos — Horario silencioso (00:00–08:00 hora local del complejo):**
  - Función pura `quietHoursReleaseAt(now, timeZone)`: si la hora local está en `[0, 8)`, devuelve el instante UTC de las 08:00 locales de ESE MISMO día; si no, devuelve `null` (envío inmediato) (`src/modules/notifications/push-quiet-hours.ts:78-92`, constante `QUIET_HOURS_END = 8` línea 17).
  - `pushSendOptions(now, timeZone)`: si `quietHoursReleaseAt` no es `null`, agrega `startAfter: releaseAt` a las opciones base de pg-boss (`PUSH_SEND_SEND_OPTIONS`); pg-boss retiene el job hasta esa hora (líneas 94-106).
  - Un push que llega a las 02:00 hora del complejo (ej. Buenos Aires) se agenda para las 08:00 locales de ESE día — NO se descarta, solo se demora.
  - DB: `push_subscriptions` leído vía `getWorkerSql()` (bypass RLS, rol worker) — `SELECT id FROM push_subscriptions WHERE tenant_id = ...` (`push.service.ts:31-33`); `tenants.timezone` leído para resolver la quiet-hours (líneas 41-44), default `'America/Argentina/Buenos_Aires'` si es null.
  - Externos: `web-push` (VAPID), `sendPushNotification` retorna `{success:false, gone:true, statusCode:410}` si la suscripción expiró — el caller (worker, no inspeccionado en este barrido) debe borrar la fila (`src/lib/web-push.ts:75-80`).
  - "Sonido fijo, no configurable": confirmado — no hay ningún selector de sonido en el código; solo un toggle implícito on/off vía `localStorage['turnogol:notif-sound']` seteado a `'1'` al habilitar (`PushNotificationManager.tsx:181`), sin UI para desactivarlo aparte de revocar el permiso del navegador.
- **Evidencia (path:línea):** `src/modules/notifications/push-quiet-hours.ts:1-107`, `src/modules/notifications/push.service.ts:1-157`, `src/lib/web-push.ts:1-91`, `src/components/admin/PushNotificationManager.tsx:1-287`, `src/app/(admin)/layout.tsx:44,101`.

---

## GAPS

1. **TG-HP-215 / TG-HP-217 — no existe "stock de productos" como feature de producto.** La tabla `products` (`src/shared/db/schema/products.ts:14-44`, con `price`/`stock`/`lowStockAlert`) es schema muerto: cero páginas, cero módulo `src/modules/products/`, cero service. Los únicos consumidores son (a) la FK `productId` en `cash_flows` (nunca poblada por ningún caller real), (b) el worker de data-retention (solo `DELETE` al anonimizar un tenant) y (c) el wipe del seed E2E (solo `DELETE`). La venta real de "productos" (Cantina/Bar en Caja) usa `tenants.settings.canteen_products` (JSONB `{id,name,price}`, sin `stock`). **No hay ningún descuento de stock en ningún flujo del código.** TG-HP-217 tal como está planteado en el contrato no tiene happy-path que redactar — requiere una decisión de producto (construir la UI sobre `products`, o deprecar la tabla).

2. **TG-HP-221 — el manager no ve NINGUNA métrica, no solo las "de sistema".** `GET /api/admin/metrics` exige `withRole('admin', ...)` (`src/app/api/admin/metrics/route.ts:19-20`), que compara el rol real (`'admin'|'manager'`) contra el string `'admin'` y devuelve `403` para cualquier otro rol (`src/shared/middleware/with-role.ts:30-36`). Un manager que abre `/metricas` recibe siempre el banner rojo de error (`MetricsDashboard.tsx:275-281`), nunca ve ingresos, reservas por día ni tasa de ausencias. Esto contradice el texto de CLAUDE.md (*"`/metricas` lo ve el manager pero sin las métricas de sistema"*). El comentario del propio route file (líneas 14-17) cita un modelo de "un solo rol admin" que ya no es el vigente (hoy hay 2 roles, migr. 029). **Decisión de negocio pendiente**, no resuelta en este barrido (no se tocó código — tarea de exploración read-only).

3. **TG-HP-225 — `/settings/perfil` no tiene form de "datos públicos".** Solo existen `Logo` y `Portada` (`PerfilImagesForm.tsx`). No hay campos editables de nombre visible, dirección, teléfono público o descripción en Configuración → Perfil. Grep de `address|description|publicPhone|publicEmail|whatsapp` sobre `src/app/(admin)/settings/**` no matchea ningún archivo bajo `perfil/`.

4. **TG-HP-219 — dos puntos no verificados en este barrido** (marcados explícitamente para no inventar): (a) si `BanPlayerControls.tsx` dispara `router.refresh()` tras un ban/lift exitoso (el componente no lo mostró en las líneas leídas — el refresco visual del banner de estado no quedó confirmado); (b) el contenido línea-a-línea de `banPlayerAction`/`liftPlayerBanAction` (`src/app/(admin)/jugadores/actions.ts`) no se leyó completo — solo se confirmó su firma vía `page.tsx`.

5. **TG-HP-224/227 — sin mock disponible para el ciclo OAuth/preapproval completo.** A diferencia de los pagos de reserva (que sí tienen `MP_MOCK_MODE=1`/`mp-gateway.mock.ts` para E2E), no se identificó un mock equivalente para el flujo de conexión OAuth del complejo (`/api/mp/oauth-start` → MP real → `/api/mp/callback`) ni para el preapproval SaaS completo end-to-end (`subscribe()` → checkout MP real → webhook de aprobación). Ambos casos quedan marcados **[REQUIERE MP REAL]** tal como pedía el contrato; no se intentó levantar credenciales reales en este barrido (fuera de alcance — exploración read-only).

6. **TG-HP-220 — columna CSV `monto_ars` está en centavos, no en pesos.** `report.service.ts:221` (`getCashFlowsForExport`) asigna `monto_ars: r.amount` sin dividir por 100. El nombre de columna sugiere un valor en ARS enteros pero es el entero crudo en centavos — inconsistente con el resto del sistema, que SIEMPRE trabaja en centavos mencionándolo explícitamente. No es un bug de cálculo (el valor es correcto en centavos), es un nombre de columna potencialmente confuso para quien abra el CSV.


---

# Bloque 3 — Super-admin

# Happy-paths Super-Admin (TG-HP-3xx)

Base: `http://localhost:3000`. Rol: Super-admin (`system_admin`). Exploración read-only del repo `C:\Users\Lazar\Documents\github\TurnoGol` en el estado actual de `main` (commit `5cf0e75`).

## Setup común (aplica a TODOS los casos)

1. `pnpm seed:system-admin <email>` (`scripts/seed-system-admin.ts:1-141`) — crea/actualiza el auth user, la fila `system_admins` (`scripts/seed-system-admin.ts:95-118`) y el claim `app_metadata.is_system_admin=true` + `system_admin_id` (`scripts/seed-system-admin.ts:120-130`).
2. Env: `SYSTEM_ADMIN_EMAILS=<email>` (allowlist fail-closed, `src/modules/auth/system-admin.guards.ts:88-91`) e `IMPERSONATION_COOKIE_SECRET` ≥16 chars (`src/modules/auth/impersonation.ts:33-39`, tira excepción si falta o es corto).
3. Triple guard en cada acceso a `/super-admin/*`: (a) claim JWT `is_system_admin` (`system-admin.guards.ts:64-65`), (b) fila `system_admins.status='active'` leída vía `withSystemAdminContext` (`system-admin.guards.ts:70-84`), (c) email de la FILA (no del JWT) en `SYSTEM_ADMIN_EMAILS` (`system-admin.guards.ts:88-91`). Cualquier fallo de los 3 es indistinguible: páginas → `redirect('/login')` (`system-admin.guards.ts:110`), Server Actions → `{ ok:false, error:'No autorizado.' }` (`system-admin.guards.ts:122`).
4. MFA TOTP: hay schema (`system_admins` tiene columnas TOTP según doc13) pero el guard de arriba **no lo exige** — no hay `mfa`/`totp` en `resolveSystemAdmin()` (`system-admin.guards.ts:59-102`). Los HP de abajo NO dependen de MFA. Salvedad, no bug a arreglar acá.
5. **GAP de fixture (bloqueante para HP-305/306/307/308/309/310)**: `scripts/seed-e2e.ts:80` hace `DELETE FROM tenant_subscriptions WHERE tenant_id = ${E2E.tenantId}` — el seed E2E **no inserta** una fila en `tenant_subscriptions` para el tenant Demo (`00000000-0000-4000-8000-000000000001`, nombre real `E2E Complejo Demo`, `scripts/seed-e2e.ts:24-25`). Todas las acciones de soporte que dependen de una suscripción (`loadSubForUpdate`/`loadSub`) tiran `SubscriptionNotFoundError` (`support.service.ts:148-156`, mapeado a "El complejo no tiene suscripción registrada." en `actions.ts:83-84`) o, en el caso de `forceTenantStatusAction`, el `UPDATE ... WHERE status='active' RETURNING id` no afecta filas y tira `InvalidTransitionError` (`lifecycle.service.ts:80-91`). **Fixture SQL previo requerido** (no lo genera ningún script del repo):
   ```sql
   INSERT INTO tenant_subscriptions (tenant_id, plan_id, billing_cycle, status, current_period_start, current_period_end)
   SELECT '00000000-0000-4000-8000-000000000001', id, 'monthly', 'active', NOW(), NOW() + INTERVAL '30 days'
   FROM plans WHERE slug = 'predio';
   ```
6. Login del super-admin: NO hay una pantalla de login diferenciada. `/login` (`src/app/(auth)/login/actions.ts:31-83`) es el mismo form de staff (email+password); `loginAction` llama `signInWithPassword` y luego `provisionAndRouteStaff(user)` (`login/actions.ts:81-82`) **sin chequear `is_system_admin`** (`auth.service.ts:191-224` no referencia ese claim). Con 0 tenants vinculados (caso normal del system admin recién seedeado), `provisionAndRouteStaff` redirige a `/onboarding` (`auth.service.ts:210-219`), no a `/super-admin`. Ver TG-HP-301 y `## GAPS`.

---

## TG-HP-301 — Login super-admin + acceso a `/super-admin` (triple guard)
- **Rol:** Super-admin (system_admin)
- **Prerrequisitos:** Setup común 1-3. Fila en `system_admins` con `status='active'`, claim JWT `is_system_admin=true` y email en `SYSTEM_ADMIN_EMAILS`. El super-admin necesita una password seteada (vía `SUPERADMIN_SEED_PASSWORD` al correr el seed, o flujo "¿Olvidaste tu contraseña?" — `scripts/seed-system-admin.ts:78-84`).
- **Flujo de navegación (UI steps):**
  1. Ir a `http://localhost:3000/login`.
  2. Completar `Email` y `Contraseña` (labels exactos, `src/app/(auth)/login/LoginCard.tsx:50,67`) con las credenciales del system admin. Click en botón `Ingresar` (`LoginCard.tsx:174`, cambia a `Ingresando…` en pending, `LoginCard.tsx:170`).
  3. **Comportamiento real del post-login**: `loginAction` no distingue system_admin de staff — con 0 filas en `tenant_staff_members`, redirige a `/onboarding` (`src/modules/auth/auth.service.ts:210-219`), NO a `/super-admin`. Paso QA correcto: navegar manualmente a `http://localhost:3000/super-admin` (URL directa) después de loguear.
  4. El triple guard del layout (`src/app/(super-admin)/super-admin/layout.tsx:72`, `requireSystemAdmin()`) valida y renderiza `SuperAdminLayoutShell` (`layout.tsx:80-87`) con el email (`userEmail`) y nombre (`adminName = firstName + lastName`, `layout.tsx:76-77`) del system admin en el header.
- **Comportamiento de componentes:**
  - Loading: `SubmitButton` en `/login` deshabilita y muestra `Ingresando…` con spinner (`LoginCard.tsx:159-176`). Sin loading.tsx en `/super-admin/*` (Server Components, sin skeleton).
  - Confirmaciones destructivas: no aplica en este caso.
  - Feedback: sin toast; error de credenciales inválidas se muestra inline con `role="alert"` y texto `Email o contraseña incorrectos.` (mensaje genérico, `login/actions.ts:14,41,60`, `LoginCard.tsx:98-102`).
- **Validación de datos:**
  - DB: `system_admins.status='active'` (self-only vía `withSystemAdminContext`, `system-admin.guards.ts:70-84`). Side-effect: `recordLastLogin` actualiza `last_login_at`/`last_login_ip` con throttle de 15 min (`super-admin/layout.tsx:19-63`), dispara `system_admin.updated` en `audit_logs` vía trigger (comentario `layout.tsx:29-31`).
  - API/Action: `loginAction` (`login/actions.ts:31`) → redirect (no hay 200/201 explícito, Server Action con `redirect()`). Guard de página: `requireSystemAdmin()` (`system-admin.guards.ts:108-112`).
  - Externos: ninguno.
  - UI-sin-reload: no aplica (navegación con `redirect`/carga de página completa).
- **Evidencia (path:línea):** `src/app/(auth)/login/actions.ts:31-83`, `src/app/(auth)/login/LoginCard.tsx:47-105`, `src/modules/auth/auth.service.ts:191-219`, `src/modules/auth/system-admin.guards.ts:59-130`, `src/app/(super-admin)/super-admin/layout.tsx:65-88`.

---

## TG-HP-302 — Dashboard global `/super-admin`
- **Rol:** Super-admin (system_admin)
- **Prerrequisitos:** Setup común 1-4. Sesión system_admin activa (ver TG-HP-301). No requiere tenant_subscriptions (MRR puede dar $0 sin datos).
- **Flujo de navegación (UI steps):**
  1. Con sesión activa, ir a `http://localhost:3000/super-admin`.
  2. Verificar `PageHeader` con título `Dashboard global` y subtítulo `Métricas cross-tenant de la plataforma` (`src/app/(super-admin)/super-admin/page.tsx:15-16`).
  3. Verificar 4 tarjetas de KPI en `SaMetricCard`: `MRR` (`formatArs(data.mrrCents)`), `Tenants` (total + "`N` activos · `M` en trial"), `Trials por vencer` (vencen en ≤7 días), `Signups (7 días)` (`dashboard-view.tsx:74-97`).
  4. Sección `Tenants por estado` con badges por cada uno de los 8 estados + conteo (`dashboard-view.tsx:101-107`, usa `TenantStatusBadge` de `_components/tenant-status-badge.tsx:30-47`).
  5. Sección `Trials por vencer (≤7 días)` — tabla `Complejo`/`Slug`/`Días restantes`, o el hint `Ningún trial vence en los próximos 7 días.` si está vacía (`dashboard-view.tsx:111-136`).
  6. Sección `Signups recientes (7 días)` — lista con nombre/slug/badge/fecha, o `Sin signups en los últimos 7 días.` (`dashboard-view.tsx:139-158`).
  7. Sección `Colas de jobs (pg-boss)` — tabla `Cola`/`Pendientes`; si `getQueueDepths()` falla, degrada a `no disponible` en rojo por cola en vez de romper el render (`dashboard-view.tsx:161-184`, fallback en `dashboard.service.ts:169-179`).
  8. Sección `Webhooks MP recientes` — lista `eventType`/`mpEventId`/fecha, o el hint con ícono `Inbox` + `Sin webhooks registrados todavía.` (`dashboard-view.tsx:187-212`).
- **Comportamiento de componentes:**
  - Loading: `export const dynamic = 'force-dynamic'` (`page.tsx:7`) — nunca sirve un snapshot cacheado; sin skeleton explícito.
  - Confirmaciones destructivas: no aplica (vista read-only).
  - Feedback: no hay toasts; es una vista de solo lectura.
- **Validación de datos:**
  - DB: `getDashboardData()` (`src/modules/super-admin/dashboard.service.ts:182-203`) agrega en paralelo: `getMrrCents()` vía `getWorkerDb()` sobre `tenant_subscriptions` JOIN `plans` WHERE `status='active'` (`dashboard.service.ts:73-84`, nota crítica: usa pool de servicio porque `tenant_subscriptions` tiene RLS+FORCE, `getDb()` daría siempre $0 — comentario `dashboard.service.ts:16-23`); `getTenantsByStatus()` sobre `tenants` (tabla global, `dashboard.service.ts:86-100`); `getExpiringTrials()` (`trial_ends_at` entre ahora y +7d, `status='trialing'`, `dashboard.service.ts:102-123`); `getRecentSignups()` (`createdAt >= now-7d`, máx 10, `dashboard.service.ts:125-149`); `getRecentWebhooks()` sobre `processed_webhooks`, últimos 10 (`dashboard.service.ts:151-163`).
  - API/Action: ninguna Server Action; solo Server Component + fetch directo.
  - UI-sin-reload: no aplica (SSR puro, sin cliente).
- **Nota de inconsistencia de labels (no arreglar, solo documentar para QA):** el badge de estado `past_due` dice **"Moroso"** en el dashboard (`super-admin/_components/tenant-status-badge.tsx:22`) pero **"Pago vencido"** en el listado/detalle de tenants (`tenants/_components/status-badge.tsx:13`, `tenants/_components/tenants-filters.tsx:9`). Verificar el texto exacto según la página.
- **Evidencia (path:línea):** `src/app/(super-admin)/super-admin/page.tsx:1-23`, `src/app/(super-admin)/super-admin/_components/dashboard-view.tsx:64-216`, `src/modules/super-admin/dashboard.service.ts:73-203`.

---

## TG-HP-303 — Listado tenants `/super-admin/tenants` + filtros + paginación
- **Rol:** Super-admin (system_admin)
- **Prerrequisitos:** Setup común 1-4. Al menos un tenant en DB (el seed E2E aporta 2: `E2E Complejo Demo` y el tenant de señas).
- **Flujo de navegación (UI steps):**
  1. Ir a `http://localhost:3000/super-admin/tenants`.
  2. `PageHeader` título `Tenants`, subtítulo `<N> complejo(s) — vista global de soporte` (`tenants/page.tsx:69-70`).
  3. Filtro `Buscar` (input `q`, placeholder `Nombre, slug o email`, `tenants-filters.tsx:38-45`): escribir `E2E Complejo Demo` → click `Filtrar` (`tenants-filters.tsx:83-88`) → recarga vía GET con `?q=...`.
  4. Filtro `Estado` (select `status`, opción `Todos` + 8 labels de `STATUS_LABELS`, ej. `Trial`, `Activo`, `Pago vencido`, `Suspendido`, `Bloqueado`, `Cancelado`, `Churned`, `Eliminado` — `tenants-filters.tsx:6-15,57-63`): elegir `Activo` → `Filtrar`.
  5. Filtro `Plan` (select `plan`, opciones de `listActivePlans()`: `Predio`/`Complejo`/`Estadio`, `tenants-filters.tsx:69-81`).
  6. Link `Limpiar` visible solo si hay algún filtro activo (`tenants-filters.tsx:89-96`), vuelve a `/super-admin/tenants` sin query params.
  7. Tabla con columnas `Nombre` (+ email debajo), `Slug`, `Estado` (badge), `Plan`, `MRR` (der., `—` si no aplica), `Fin de trial`, `Creado` (`tenants-table.tsx:31-73`). Fila vacía: `No hay tenants que coincidan con los filtros.` (`tenants-table.tsx:41-46`).
  8. Click en el nombre del tenant → navega a `/super-admin/tenants/{id}` (`tenants-table.tsx:51-56`).
  9. Paginación (solo si `totalPages > 1`): `Página <p> de <N>`, links `Anterior`/`Siguiente` o versión deshabilitada (`aria-disabled`) en los bordes (`tenants-table.tsx:79-105`).
- **Comportamiento de componentes:**
  - Loading: `export const dynamic = 'force-dynamic'` (`tenants/page.tsx:12`); form GET nativo (`method="get"`, `tenants-filters.tsx:33`), sin JS de cliente — recarga completa de página.
  - Confirmaciones destructivas: no aplica (vista read-only).
  - Feedback: ninguno (navegación por URL).
- **Validación de datos:**
  - DB: `listTenants()` vía `getWorkerDb()` (cross-tenant, `tenants.service.ts:78-151`) sobre `tenants` LEFT JOIN `tenant_subscriptions` LEFT JOIN `plans`; filtros `ilike` en name/slug/email, `eq` en status/plan.slug; `PAGE_SIZE = 20` (`tenants/page.tsx:14`).
  - API/Action: ninguna Server Action.
  - UI-sin-reload: NO — la paginación/filtros son 100% `<Link>`/`<form method=get>`, cada cambio es una navegación GET completa.
- **Evidencia (path:línea):** `src/app/(super-admin)/super-admin/tenants/page.tsx:44-93`, `.../tenants/_components/tenants-filters.tsx:1-99`, `.../tenants/_components/tenants-table.tsx:1-109`, `src/modules/super-admin/tenants.service.ts:78-151`.

---

## TG-HP-304 — Detalle tenant `/super-admin/tenants/[id]`: 4 tabs
- **Rol:** Super-admin (system_admin)
- **Prerrequisitos:** Setup común 1-4. Tenant Demo (`00000000-0000-4000-8000-000000000001`).
- **Flujo de navegación (UI steps):**
  1. Desde `TG-HP-303`, click en el nombre del tenant, o ir directo a `/super-admin/tenants/00000000-0000-4000-8000-000000000001`.
  2. Header: link `← Volver a tenants` (`tenants/[id]/page.tsx:92-97`), `h1` = nombre del tenant + `TenantStatusBadge`, subtítulo `slug · email` (`page.tsx:98-104`).
  3. Nav de 4 tabs vía querystring `?tab=`: `Resumen` (default), `Suscripción`, `Actividad`, `Acciones` (`TAB_LABELS`, `page.tsx:43-48`, render condicional `page.tsx:125-130`).
  4. Tab **Resumen**: `Card` `Soporte` (botón impersonar, ver HP-313), `Datos del complejo` (dirección, teléfono, email, creado, fin de trial, MercadoPago), `Settings` (seña, reserva online, medios de pago, anticipación, duración, auto-completar, política de cancelación, `Ausencia (no-show)` con texto fijo `Softban por reincidencia: 2ª ausencia en 90 días bloquea 14 días para reservar online`, onboarding), `Canchas (<N>)`, `Staff (<N>)` (`resumen-tab.tsx:22-157`).
  5. Tab **Suscripción**: si `subscription===null`, `Card` `Suscripción` con texto `El complejo no tiene fila en tenant_subscriptions (todavía no inició la suscripción SaaS).` (`suscripcion-tab.tsx:14-21`); si existe, `Estado de la suscripción` (badge, plan+precio, ciclo, período, preapproval MP) + `Dunning y pagos` (`suscripcion-tab.tsx:26-82`).
  6. Tab **Actividad**: `Card` `Audit trail (<N>)` — tabla `Fecha`/`Acción`/`Actor`/`Recurso`/`Metadata`, paginado 25/página (`ACTIVITY_PAGE_SIZE`, `page.tsx:50`, `actividad-tab.tsx:16-97`) + `Card` `Últimas 10 reservas` (`actividad-tab.tsx:99-137`).
  7. Tab **Acciones**: panel de las 7 Server Actions de soporte (ver HP-305 a HP-312).
- **Comportamiento de componentes:**
  - Loading: `export const dynamic = 'force-dynamic'` (`page.tsx:36`); UUID inválido o tenant inexistente → `notFound()` (`page.tsx:71,73`).
  - Confirmaciones destructivas: no aplica en este caso (solo lectura de Resumen/Suscripción/Actividad).
  - Feedback: ninguno en estos 3 tabs (read-only).
- **Validación de datos:**
  - DB: `getTenantDetail()` (`tenants.service.ts:253-349`) — `tenants` vía `getDb()`, `tenant_subscriptions` vía `getWorkerDb()` (RLS+FORCE), `courts` vía `withTenantContext`, `staff` vía `listStaffRoster()`. `getTenantActivity()` solo se llama si `tab==='actividad'` (`page.tsx:78-84`), 100% dentro de `withTenantContext` sobre `audit_logs`/`bookings` (`tenants.service.ts:400-458`).
  - API/Action: ninguna en estos 3 tabs.
  - UI-sin-reload: NO — el cambio de tab y de página de actividad son `<Link>` con querystring (`?tab=`, `?actPage=`), navegación GET completa.
- **Evidencia (path:línea):** `src/app/(super-admin)/super-admin/tenants/[id]/page.tsx:38-133`, `.../_components/resumen-tab.tsx:12-157`, `.../_components/suscripcion-tab.tsx:11-82`, `.../_components/actividad-tab.tsx:12-140`, `src/modules/super-admin/tenants.service.ts:196-458`.

---

## TG-HP-305 — Forzar estado: SUSPENDER (`forceTenantStatusAction`, past_due→suspended)
- **Rol:** Super-admin (system_admin)
- **Prerrequisitos:**
  - Setup común 1-5 (incluye la fila en `tenant_subscriptions` del punto 5).
  - Tenant en estado `active` con transición previa a `past_due` **ya ejecutada** (vía este mismo panel, ver paso 1) y **gate temporal cumplido**: `transitionPastDueToSuspended` exige `dunning_started_at <= NOW() - 7 días` (`src/modules/billing/lifecycle.service.ts:150-160`, `PAST_DUE_TO_SUSPENDED_DAYS = 7` en `lifecycle.service.ts:21`). Forzar `active→past_due` deja `dunning_started_at = NOW()` (`lifecycle.service.ts:83`), así que suspender inmediatamente después FALLA. Fixture SQL previo (tras el paso 1 de abajo):
    ```sql
    UPDATE tenant_subscriptions SET dunning_started_at = NOW() - INTERVAL '8 days' WHERE tenant_id = '00000000-0000-4000-8000-000000000001';
    ```
- **Flujo de navegación (UI steps):**
  1. En el tenant Demo (`active`), tab `Acciones` → sección `Forzar transición de estado` (`ForceStatusSection.tsx:49-51`, descripción dinámica `Estado actual: Activo. Solo se ofrecen destinos válidos...`). Select `Estado destino` con opción `Pago vencido` (única disponible desde `active`, `FORCEABLE_TRANSITIONS.active = ['past_due']`, `support.service.ts:93`). Click `Forzar estado` (`ForceStatusSection.tsx:79-96`).
  2. Aplicar el fixture SQL de arriba sobre `tenant_subscriptions.dunning_started_at`.
  3. Recargar el tab `Acciones`. Select `Estado destino` ahora ofrece `Activo` y `Suspendido` (`FORCEABLE_TRANSITIONS.past_due = ['active','suspended']`, `support.service.ts:94`). Elegir `Suspendido` → click `Forzar estado`.
- **Comportamiento de componentes:**
  - Loading: botón `Forzar estado` deshabilitado mientras `pending` (único `pending` compartido de las 7 secciones, `support-actions-panel.tsx:61,63-73`).
  - Confirmaciones destructivas: NO aplica — `suspended` no está en `DESTRUCTIVE_TARGET_STATUSES = ['blocked','deleted']` (`support.schema.ts:13`), no exige escribir el nombre del tenant.
  - Feedback: NO hay toast global — texto inline `role="status"` dentro de la sección, verde en éxito / rojo en error (`FeedbackText.tsx:4-14`). Éxito: `` Estado forzado: 'past_due' → 'suspended'. `` (`actions.ts:135`).
- **Validación de datos:**
  - DB: `tenants.status` y `tenant_subscriptions.status` pasan a `'suspended'` (`lifecycle.service.ts:146-173`); `audit_logs` recibe DOS filas: `tenant.suspended` (`actorType='system'`, sin actor humano, `lifecycle.service.ts:166-172`) y `support.tenant.status_forced` con `actorId=<system_admin.id>`, `actorType='system'`, `before/after status` (`support.service.ts:273-276`).
  - API/Action: `forceTenantStatusAction` (`tenants/[id]/actions.ts:112-140`) → `{ success:true, message }`.
  - Externos: MP no se toca en esta transición (no cancela preapproval).
  - UI-sin-reload: `router.refresh()` tras éxito (`support-actions-panel.tsx:66-68`) — re-renderiza el Server Component sin recargar toda la página; NO hay `revalidatePath` explícito en `forceTenantStatusAction`, sí lo hay: `revalidateTenantPaths(tenantId)` → `revalidatePath('/super-admin/tenants')` + `revalidatePath('/super-admin/tenants/{id}')` (`actions.ts:71-74,132`).
- **Evidencia (path:línea):** `src/app/(super-admin)/super-admin/tenants/[id]/actions.ts:112-140`, `.../_components/support-actions/ForceStatusSection.tsx:33-118`, `src/modules/super-admin/support.service.ts:91-100,224-280`, `src/modules/billing/lifecycle.service.ts:75-104,146-173`.

---

## TG-HP-306 — Forzar estado: BLOQUEAR (destructiva — exige escribir nombre exacto)
- **Rol:** Super-admin (system_admin)
- **Prerrequisitos:**
  - Continuación de TG-HP-305 (tenant ya en `suspended` con `dunning_started_at` retroactivo).
  - `transitionSuspendedToBlocked` exige `dunning_started_at <= NOW() - 14 días` (`lifecycle.service.ts:177-191`, `SUSPENDED_TO_BLOCKED_DAYS = 14`, `lifecycle.service.ts:22`). Con el fixture de HP-305 (`NOW() - 8 días`) el gate de 14 días TODAVÍA no se cumple — ajustar antes de este caso:
    ```sql
    UPDATE tenant_subscriptions SET dunning_started_at = NOW() - INTERVAL '15 days' WHERE tenant_id = '00000000-0000-4000-8000-000000000001';
    ```
- **Flujo de navegación (UI steps):**
  1. Tab `Acciones` → `Forzar transición de estado`. Select `Estado destino`: desde `suspended`, opciones `Activo`/`Bloqueado` (`FORCEABLE_TRANSITIONS.suspended = ['active','blocked']`, `support.service.ts:95`). Elegir `Bloqueado`.
  2. `blocked` ∈ `DESTRUCTIVE_TARGET_STATUSES` → aparece el bloque de confirmación rojo (`ForceStatusSection.tsx:98-112`): label `Acción destructiva. Escribí el nombre exacto del complejo (<b>E2E Complejo Demo</b>) para confirmar:` + input `force-confirm`. Botón `Forzar estado` queda deshabilitado hasta que el texto tipeado coincide EXACTO con el nombre (`ForceStatusSection.tsx:81`, `confirmNameMatches`, `support.schema.ts:23-25`, solo tolera whitespace en los bordes).
  3. Escribir `E2E Complejo Demo` → click `Forzar estado` (ahora en rojo, `destructiveBtn`, `support-actions/constants.ts:61-62`).
- **Comportamiento de componentes:**
  - Loading: mismo `pending` compartido.
  - Confirmaciones destructivas: SÍ — nombre exacto del tenant, re-validado server-side (`forceTenantStatusAction`, `actions.ts:124-128`: si no coincide, `{ success:false, error: CONFIRM_MISMATCH }` con texto `El nombre ingresado no coincide con el nombre exacto del complejo. No se ejecutó la acción.`, `actions.ts:68-69`).
  - Feedback: inline, verde `Estado forzado: 'suspended' → 'blocked'.` (patrón de `actions.ts:135`).
- **Validación de datos:**
  - DB: `tenants.status`/`tenant_subscriptions.status='blocked'` (`lifecycle.service.ts:177-204`, acción `tenant.blocked`, `metadata:{reason:'dunning_day_14'}`); `audit_logs` agrega `support.tenant.status_forced` (`support.service.ts:273-276`).
  - API/Action: `forceTenantStatusAction` (`actions.ts:112-140`), rama `isDestructiveTargetStatus` (`actions.ts:124-128`).
  - Externos: no cancela MP acá (a diferencia de HP-310).
  - UI-sin-reload: `router.refresh()` + `revalidatePath` de lista y detalle (`actions.ts:71-74`).
- **Evidencia (path:línea):** `src/app/(super-admin)/super-admin/tenants/[id]/_components/support-actions/ForceStatusSection.tsx:43,81,98-112`, `.../actions.ts:68-69,112-140`, `src/modules/super-admin/support.schema.ts:13-25`, `src/modules/billing/lifecycle.service.ts:175-204`.

---

## TG-HP-307 — Reactivar tenant (`reactivateTenantAction`)
- **Rol:** Super-admin (system_admin)
- **Prerrequisitos:** Setup común 1-5. Tenant en un estado de `REACTIVATABLE_STATUSES = ['canceled','churned','blocked','past_due','suspended']` (`support.service.ts:103-109`) CON suscripción existente (`SubscriptionNotFoundError` si no, `support.service.ts:292`). Continuación natural de HP-306: tenant en `blocked`.
- **Flujo de navegación (UI steps):**
  1. Tab `Acciones`. La sección `Reactivar complejo` solo se renderiza si `canReactivate` (`subscription !== null && REACTIVATABLE_STATUSES.includes(tenant.status)`, `page.tsx:169-171`) — con el tenant en `blocked` y suscripción presente, es visible.
  2. Título `Reactivar complejo`, descripción `Vuelve el tenant a 'active' (transitionToActiveFromAny): limpia dunning, cancelación y fecha de eliminación programada.` (`ReactivateSection.tsx:20-23`). Click botón `Reactivar` (`ReactivateSection.tsx:25-32`).
- **Comportamiento de componentes:**
  - Loading: botón deshabilitado durante `pending` compartido.
  - Confirmaciones destructivas: NO exige — es la acción "de rescate", sin confirmación de nombre.
  - Feedback: inline, texto `Complejo reactivado (estaba 'blocked').` (patrón `actions.ts:154`).
- **Validación de datos:**
  - DB: `tenants.status='active'`, `tenant_subscriptions.status='active'`, ventana de período nueva (`forcedPeriodWindow`: +30d mensual / +365d anual desde ahora, `support.service.ts:176-179`, `284-305`); `audit_logs`: `support.tenant.status_forced` con `metadata.reason='reactivated_by_support'` (`support.service.ts:297-301`) — mismo `action` que HP-305/306, se diferencia por `metadata.reason`.
  - API/Action: `reactivateTenantAction` (`tenants/[id]/actions.ts:144-158`).
  - Externos: ninguno (no toca MP).
  - UI-sin-reload: `router.refresh()` + `revalidatePath` lista/detalle (`actions.ts:153`).
- **Evidencia (path:línea):** `src/app/(super-admin)/super-admin/tenants/[id]/_components/support-actions/ReactivateSection.tsx:16-37`, `.../page.tsx:169-171`, `.../actions.ts:144-158`, `src/modules/super-admin/support.service.ts:102-109,282-305`.

---

## TG-HP-308 — Extender trial (`extendTrialAction`, 1–90 días)
- **Rol:** Super-admin (system_admin)
- **Prerrequisitos:**
  - Setup común 1-4. **El tenant Demo del seed E2E NO sirve tal cual**: se crea con `status='active'` (`scripts/seed-e2e.ts:164`), y `extendTrial` exige `tenant.status==='trialing'` (`TrialNotActiveError`, `support.service.ts:198-200`). `'trialing'` tampoco es alcanzable como destino desde ningún estado vía `forceTenantStatusAction` (no aparece en ningún array de `FORCEABLE_TRANSITIONS`, `support.service.ts:91-100`) — no hay forma de llegar a `trialing` por UI. Fixture SQL directo requerido:
    ```sql
    UPDATE tenants SET status = 'trialing', trial_ends_at = NOW() + INTERVAL '3 days' WHERE id = '00000000-0000-4000-8000-000000000001';
    ```
- **Flujo de navegación (UI steps):**
  1. Tab `Acciones`, sección `Extender trial` (`ExtendTrialSection.tsx:22-24`). Con `isTrialing=true`, se ve el input `Días (1–90)` (default `7`, `ExtendTrialSection.tsx:18,33-44`).
  2. Cambiar el valor si se desea (ej. `14`) y click `Extender trial` (`ExtendTrialSection.tsx:45-54`).
- **Comportamiento de componentes:**
  - Loading: botón deshabilitado durante `pending`.
  - Confirmaciones destructivas: no aplica.
  - Feedback: inline, éxito `` Trial extendido 14 días (vence AAAA-MM-DD). `` (`actions.ts:176`, fecha en formato `toISOString().slice(0,10)`).
- **Validación de datos:**
  - DB: `tenants.trial_ends_at = max(now, fin_actual) + days` (`support.service.ts:190-220`); `audit_logs`: `support.tenant.trial_extended` con `{days, before:{trialEndsAt}, after:{trialEndsAt}}` (`support.service.ts:212-216`).
  - API/Action: `extendTrialAction` (`tenants/[id]/actions.ts:162-181`); Zod `extendTrialInputSchema` = `{tenantId, days: int 1-90}` (`support.schema.ts:27-30`); fuera de rango → `{success:false, error:'Datos inválidos: días entre 1 y 90.'}` (`actions.ts:167-169`).
  - Externos: ninguno.
  - UI-sin-reload: `router.refresh()` + `revalidatePath` (`actions.ts:173`).
- **Evidencia (path:línea):** `src/app/(super-admin)/super-admin/tenants/[id]/_components/support-actions/ExtendTrialSection.tsx:17-61`, `.../actions.ts:162-181`, `src/modules/super-admin/support.schema.ts:27-30`, `src/modules/super-admin/support.service.ts:190-220`.

---

## TG-HP-309 — Cambiar plan (`changePlanAction`, valida límite de canchas)
- **Rol:** Super-admin (system_admin)
- **Prerrequisitos:** Setup común 1-5 (fila en `tenant_subscriptions`, ej. plan `predio`). Tenant con canchas `online` ≤ `max_courts` del plan destino (el tenant Demo tiene 1 cancha `online`, `scripts/seed-e2e.ts:169-171`, cabe en cualquiera de los 3 planes).
- **Flujo de navegación (UI steps):**
  1. Tab `Acciones`, sección `Cambiar plan sin cobro` (`ChangePlanSection.tsx:40-42`, visible solo si `hasSubscription`). Select `Plan destino` lista los planes activos EXCLUYENDO el actual, formato `<nombre> — <precio>/mes` ej. `Complejo — $85.000,00/mes` (`ChangePlanSection.tsx:60-67`, `formatArs`).
  2. Elegir `Complejo` → click `Cambiar plan` (`ChangePlanSection.tsx:69-78`).
- **Comportamiento de componentes:**
  - Loading: botón deshabilitado durante `pending` o si no eligió plan (`targetPlanId===''`, `ChangePlanSection.tsx:71`).
  - Confirmaciones destructivas: no aplica (no está en `DESTRUCTIVE_TARGET_STATUSES`, y esto no es un `forceStatus`).
  - Feedback: inline, éxito `Plan cambiado sin cobro.` (`actions.ts:200`).
- **Validación de datos:**
  - DB: valida `plan.max_courts` vs `COUNT(*) FROM courts WHERE tenant_id=... AND status='online'` — si excede, `DowngradeBlockedError` → error `El complejo tiene <N> canchas online y el plan destino permite <M>. Desactivá canchas antes de bajar de plan.` (`support.service.ts:346-355`, `actions.ts:89-93`). `UPDATE tenant_subscriptions SET plan_id=..., pending_plan_change=NULL, pending_change_at=NULL` (`support.service.ts:358-365`); `audit_logs`: `support.tenant.plan_changed` con `{before:{planId}, after:{planId}, mpAmountUpdated}` (`support.service.ts:375-379`).
  - API/Action: `changePlanAction` (`tenants/[id]/actions.ts:185-204`); si ya tiene ese plan → `PlanAlreadyAssignedError` → `El complejo ya tiene asignado ese plan.` (`actions.ts:104-106`, `support.service.ts:330`).
  - Externos (MP): si `tenant_subscriptions.mp_subscription_id` no es null, llama `gateway.updatePreapprovalAmount(mpSubscriptionId, newAmount)` DENTRO de la misma tx — si MP falla, rollback completo (`support.service.ts:367-373`). El tenant Demo del seed no tiene `mp_subscription_id` seteado (columna nace `NULL`, sin INSERT explícito) → esta rama de MP NO se ejerce en el happy path por defecto.
  - UI-sin-reload: `router.refresh()` + `revalidatePath` (`actions.ts:199`).
- **Evidencia (path:línea):** `src/app/(super-admin)/super-admin/tenants/[id]/_components/support-actions/ChangePlanSection.tsx:27-85`, `.../actions.ts:185-204`, `src/modules/super-admin/support.schema.ts:49-52`, `src/modules/super-admin/support.service.ts:321-383`.

---

## TG-HP-310 — Cancelar suscripción (`cancelSubscriptionAction`, destructiva: nombre + motivo 3–500)
- **Rol:** Super-admin (system_admin)
- **Prerrequisitos:** Setup común 1-5. Tenant con suscripción activa (ej. tras HP-307/309, tenant `active` con `tenant_subscriptions` presente).
- **Flujo de navegación (UI steps):**
  1. Tab `Acciones`, sección `Cancelar suscripción` (`CancelSection.tsx:27-29`, visible si `hasSubscription`).
  2. Completar textarea `Motivo (obligatorio)` (`CancelSection.tsx:38-47`), ej. `Solicitado por el dueño vía soporte telefónico.` (mín. 3 caracteres).
  3. Bloque rojo de confirmación: `Acción destructiva. Escribí el nombre exacto del complejo (<b>E2E Complejo Demo</b>) para confirmar:` (`CancelSection.tsx:49-52`). Escribir `E2E Complejo Demo`.
  4. Botón `Cancelar suscripción` (rojo) se habilita recién con motivo ≥3 chars Y nombre exacto (`CancelSection.tsx:64-66`). Click.
- **Comportamiento de componentes:**
  - Loading: mismo `pending` compartido.
  - Confirmaciones destructivas: SÍ — nombre exacto (re-validado server-side: `confirmNameMatches`, `actions.ts:220-222` → `CONFIRM_MISMATCH`) + motivo 3-500 chars (`cancelSubscriptionInputSchema`, `support.schema.ts:54-58`, error `Datos inválidos: motivo de 3 a 500 caracteres.`, `actions.ts:213-215`).
  - Feedback: inline, éxito `` Suscripción cancelada. Acceso hasta AAAA-MM-DD. `` (`actions.ts:234`).
- **Validación de datos:**
  - DB: `tenants.status`/`tenant_subscriptions.status='canceled'`, `canceled_at=NOW()`, `cancellation_reason` seteado, período pagado se conserva intacto (`lifecycle.service.ts:271-302`); `audit_logs`: `support.tenant.status_forced` con `{reason, before:{status}, after:{status:'canceled'}}` (`support.service.ts:400-404`).
  - API/Action: `cancelSubscriptionAction` (`tenants/[id]/actions.ts:208-239`).
  - Externos (MP): `billingCancel()` llama `gateway.cancelPreapproval(mp_subscription_id)` SI existe (`billing.service.ts:430-443`) — con el tenant Demo del seed (`mp_subscription_id` NULL por defecto) esta rama no se ejerce salvo que se haya seteado en un paso anterior (ej. HP-309 con `mp_subscription_id` presente). Tolera "ya cancelado en MP" sin romper (`billing.service.ts:438-442`).
  - UI-sin-reload: `router.refresh()` + `revalidatePath` (`actions.ts:231`).
- **Evidencia (path:línea):** `src/app/(super-admin)/super-admin/tenants/[id]/_components/support-actions/CancelSection.tsx:17-88`, `.../actions.ts:68-69,208-239`, `src/modules/super-admin/support.schema.ts:54-58`, `src/modules/super-admin/support.service.ts:387-408`, `src/modules/billing/billing.service.ts:421-475`.

---

## TG-HP-311 — Editar settings de soporte (`updateTenantSettingsAction`, campos whitelisteados)
- **Rol:** Super-admin (system_admin)
- **Prerrequisitos:** Setup común 1-4 (no depende de `tenant_subscriptions`). Tenant Demo activo.
- **Flujo de navegación (UI steps):**
  1. Tab `Acciones`, sección `Editar settings del complejo`, descripción `Solo campos whitelisteados (los mismos que el admin edita en su panel). Nunca JSON libre.` (`SettingsSection.tsx:37-39`).
  2. Checkboxes: `Requiere seña`, `Acepta efectivo`, `Acepta transferencia`, `Acepta MercadoPago`, `Permite reserva online` (`SettingsSection.tsx:28-34,42-54`).
  3. Inputs numéricos: `% de seña (0–100)`, `Anticipación (días, 1–60)`, `Auto-completar (min, 0–1440)` (`SettingsSection.tsx:56-104`).
  4. Cambiar, ej., `Anticipación` de `6` a `10` → click `Guardar settings` (`SettingsSection.tsx:105-114`).
- **Comportamiento de componentes:**
  - Loading: botón deshabilitado durante `pending`.
  - Confirmaciones destructivas: no aplica.
  - Feedback: inline, éxito `Settings actualizados.` (`actions.ts:259`).
- **Validación de datos:**
  - DB: `settingsPatchSchema` es `z.strictObject` — SOLO acepta `requires_deposit`, `deposit_percentage` (0-100), `cancellation_policy`, `accepts_cash/transfer/mercadopago`, `allow_online_booking`, `booking_advance_days` (1-60), `auto_complete_minutes` (0-1440); cualquier campo extra lo rechaza (`support.schema.ts:65-90`). `updateTenantSettingsForSupport` hace lee-mergea-escribe sobre `tenants.settings` (JSONB) vía `updateTenantSettings()` — NO ATÓMICO con el audit log siguiente (comentario explícito, `support.service.ts:428-430`); `audit_logs`: `support.tenant.settings_updated` con `{before, after}` por campo tocado (`support.service.ts:433-437`).
  - API/Action: `updateTenantSettingsAction` (`tenants/[id]/actions.ts:243-263`); patch vacío o campo no whitelisteado → `{success:false, error:'Datos inválidos: solo campos whitelisteados de settings.'}` (`actions.ts:247-249`).
  - Externos: ninguno.
  - UI-sin-reload: `router.refresh()` + `revalidatePath` (`actions.ts:258`).
- **Evidencia (path:línea):** `src/app/(super-admin)/super-admin/tenants/[id]/_components/support-actions/SettingsSection.tsx:24-119`, `.../actions.ts:243-263`, `src/modules/super-admin/support.schema.ts:65-90`, `src/modules/super-admin/support.service.ts:412-439`.

---

## TG-HP-312 — Reset password de un staff (`resetStaffPasswordAction`)
- **Rol:** Super-admin (system_admin)
- **Prerrequisitos:** Setup común 1-4. Un miembro de staff ACTIVO del tenant target (el seed E2E crea `E2E Admin` como admin activo, `scripts/seed-e2e.ts:228-235`; email en `E2E.adminEmail`).
- **Flujo de navegación (UI steps):**
  1. Tab `Acciones`, sección `Resetear contraseña de staff`, descripción `Genera una contraseña temporal para un miembro del complejo (soporte telefónico). El titular entra con la temporal y el sistema lo obliga a cambiarla. Solo staff activo de este complejo.` (`ResetPasswordSection.tsx:21-23`).
  2. Completar input `Email del staff` (placeholder `staff@complejo.com`, `ResetPasswordSection.tsx:27-38`) con el email del staff admin del tenant.
  3. Click `Resetear contraseña` (`ResetPasswordSection.tsx:39-51`, deshabilitado si el email está vacío).
- **Comportamiento de componentes:**
  - Loading: botón deshabilitado durante `pending` o email vacío.
  - Confirmaciones destructivas: no aplica.
  - Feedback: inline, éxito con la password en texto plano: `` Contraseña temporal: TG-xxxxxxxxxx — dictásela al titular. Deberá cambiarla al entrar. `` (`actions.ts:372`, formato `TG-<10 hex>`, `generateTempPassword`, `actions.ts:296-298`).
- **Validación de datos:**
  - DB: valida que el email sea miembro ACTIVO de ESE tenant (`tenant_staff_members.is_active=true` JOIN `staff_users.email`, `actions.ts:318-335`) → si no, `Ese email no es un miembro activo del complejo.` (`actions.ts:333-335`). Busca la cuenta auth por email vía `listUsers` paginado (`findAuthUserByEmail`, `actions.ts:278-293`) → si no existe, `No se encontró la cuenta de acceso para ese email.` (`actions.ts:339-341`). `audit_logs`: `support.user.password_reset` con `{staff_email, system_admin_email}` (`actions.ts:353-364`).
  - API/Action: `resetStaffPasswordAction` (`actions.ts:307-374`).
  - Externos: Supabase Admin API (`createAdminClient().auth.admin.updateUserById`) setea `password` + `app_metadata.force_password_change=true` (`actions.ts:337,343-351`). El staff con `force_password_change=true` es forzado a `/reset-password` en su próximo login (`login/actions.ts:76-79`) o dentro del layout admin (`admin/layout.tsx:52-55`).
  - UI-sin-reload: `router.refresh()` + `revalidatePath` (`actions.ts:369`).
- **Evidencia (path:línea):** `src/app/(super-admin)/super-admin/tenants/[id]/_components/support-actions/ResetPasswordSection.tsx:16-57`, `.../actions.ts:267-374`, `src/app/(auth)/login/actions.ts:76-79`, `src/app/(admin)/layout.tsx:52-55`.

---

## TG-HP-313 — Impersonar (`startImpersonationAction`) → `/dashboard` → detener (`stopImpersonationAction`)
- **Rol:** Super-admin (system_admin)
- **Prerrequisitos:** Setup común 1-4. Tenant con al menos un admin activo (proxy de FKs, `getFirstActiveAdminStaffUserId`) — el tenant Demo cumple (`E2E Admin`).
- **Flujo de navegación (UI steps):**
  1. Tab `Resumen` → `Card` `Soporte`. Botón `Entrar como este complejo` (ícono `LogIn`, `impersonate-button.tsx:49-59`).
  2. Click dispara `window.confirm` nativo (NO es un modal del design system) con texto: `` Vas a entrar al panel de "E2E Complejo Demo" como soporte. Todas tus acciones quedarán auditadas a tu nombre de super admin. ¿Continuar? `` (`impersonate-button.tsx:34-40`). Aceptar.
  3. Botón cambia a `Entrando…` (pending, `impersonate-button.tsx:58`). Redirect a `http://localhost:3000/dashboard`.
  4. En `/dashboard` aparece el banner rojo fijo (`role="alert"`): `` Impersonando E2E Complejo Demo — todas las acciones se auditan como super admin. `` con botón `Salir de impersonación` (`impersonation-banner.tsx:15-41`).
  5. Click `Salir de impersonación` → `stopImpersonationAction` (form action, sin JS) → redirect a `/super-admin/tenants/{tenantId}` (`tenants/[id]/actions.ts:479`, vuelve al detalle del tenant que se estaba impersonando).
- **Comportamiento de componentes:**
  - Loading: solo el texto del botón cambia a `Entrando…`; sin spinner adicional.
  - Confirmaciones destructivas: `window.confirm` nativo del browser (no es el patrón de nombre-exacto de las otras destructivas) — pre-chequeo client-side, la action NO re-valida esta confirmación server-side (no hay campo `confirm` en el payload de `startImpersonationAction`, solo `tenantId`, `tenants/[id]/actions.ts:384-392`).
  - Feedback: solo en error (ej. sin admin activo) se muestra texto rojo bajo el botón (`impersonate-button.tsx:64`); en éxito no hay feedback visible porque `redirect()` interrumpe antes.
- **Validación de datos:**
  - DB: `getFirstActiveAdminStaffUserId(id)` — si no hay admin activo, `{success:false, error:'El complejo no tiene un administrador activo: no se puede impersonar.'}` SIN emitir cookie (`actions.ts:397-406`). `audit_logs`: `support.impersonation.started` con `{impersonated_tenant_id, system_admin_email}` (`actions.ts:408-422`) ANTES de emitir la cookie. Al salir: `support.impersonation.ended` (`actions.ts:455-475`, best-effort — un fallo de audit no bloquea el borrado de cookie).
  - API/Action: `startImpersonationAction(tenantId)` (`actions.ts:384-444`) — SIEMPRE `redirect('/dashboard')` en éxito (nunca retorna `{success:true}`, `actions.ts:443`). `stopImpersonationAction()` (`actions.ts:455-480`) — retorna `void`, siempre redirige.
  - Externos: cookie firmada `tg_sa_impersonate` (HMAC SHA-256, `httpOnly`, `sameSite:lax`, `maxAge = IMPERSONATION_TTL_MS/1000 = 3600s`, `actions.ts:427-440`, `impersonation.ts:24`). El layout admin (`src/app/(admin)/layout.tsx:21-47`) detecta la cookie y salta el hard-lock de billing (tenant suspendido/blocked igual entra impersonado, comentario `admin/layout.tsx:17-20`).
  - UI-sin-reload: NO — ambos pasos son `redirect()` de servidor (Server Action), navegación completa.
- **Evidencia (path:línea):** `src/app/(super-admin)/super-admin/tenants/[id]/_components/impersonate-button.tsx:21-67`, `src/components/layout/impersonation-banner.tsx:15-41`, `src/app/(super-admin)/super-admin/tenants/[id]/actions.ts:384-480`, `src/app/(admin)/layout.tsx:16-47`, `src/modules/auth/impersonation.ts:21-24,62-73`.

---

## GAPS

1. **Login del super-admin no tiene ruteo propio.** `loginAction` (`src/app/(auth)/login/actions.ts:31-83`) llama `provisionAndRouteStaff(user)` (`auth.service.ts:191-224`) sin chequear `app_metadata.is_system_admin`. Con 0 tenants vinculados, `getOrCreateStaffUser` (`auth.service.ts:160-182`, invocada en `auth.service.ts:205`) crea/reutiliza una fila `staff_users` para ese email y `provisionAndRouteStaff` redirige a `/onboarding` (`auth.service.ts:210-219`) — NO existe un salto directo a `/super-admin` post-login. El acceso real depende de navegar manualmente a la URL. No hay evidencia de que esto sea intencional (el comentario de `scripts/seed-system-admin.ts:71-73` dice "El SuperAdmin sigue passwordless (magic link + MFA TOTP...)" pero `/login` es password-only y `MFA TOTP` no está enforced en ningún guard — ver punto 3 del Setup común). **Decisión de producto, no la resolví**: si el comportamiento esperado es un login dedicado o un redirect automático a `/super-admin`, no está implementado.
2. **MFA TOTP referenciado en CLAUDE.md ("SuperAdmin: script + MFA TOTP") pero no hay enforcement en código.** `resolveSystemAdmin()` (`system-admin.guards.ts:59-102`) no verifica ningún campo TOTP. No encontré UI de configuración/verificación de TOTP en `src/app/(super-admin)/` ni en `src/app/(auth)/`. Confirmado como salvedad explícita del contrato, documentado en Setup común punto 4 — no lo traté como bug.
3. **El seed E2E (único mecanismo de seeding del repo con datos realistas) no crea filas en `tenant_subscriptions`** (`scripts/seed-e2e.ts:80,95` solo hace `DELETE`). Esto bloquea de entrada HP-305/306/307/308/309/310 sin preparación manual de datos (documentado con SQL exacto en cada caso y en el Setup común punto 5). No es un bug del panel super-admin — es un gap del fixture de seeding para QA de este panel específicamente.
4. **No existe creación de tenant desde el panel super-admin** (confirmado: no hay `createTenantAction` ni ruta `/super-admin/tenants/nuevo` en el árbol de archivos leído) — consistente con la restricción del contrato de no inventarlo.
5. **Página `/reactivar`** referenciada en un comentario de `src/app/(admin)/layout.tsx:66` (banner de `past_due`) es de otro flujo (staff, no super-admin) — mencionada acá solo porque aparece adyacente al hard-lock de HP-313; fuera de alcance de este set de casos.
6. **Auditoría del helper `AccionesTab`** (`tenants/[id]/page.tsx:147-180`): recibe `plans` completo pero no filtra por `is_active` en el selector de `ChangePlanSection` más allá de lo que ya filtra `listActivePlans()` — sin hallazgo, solo nota de que el filtro real vive en el service, no repetido en el componente (no es un GAP, aclaración de dónde vive la validación por si el QA la busca en el componente equivocado).
