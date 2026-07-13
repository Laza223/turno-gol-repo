# Inventario y cobertura de Storybook

Fuente de verdad: [`storybook-coverage.json`](./storybook-coverage.json).

**Cobertura verificada** contra `git ls-files "src/**/*.tsx"` (excluyendo los propios `.stories.tsx`):

```
archivos .tsx reales:   300
inventariados:          300
fantasma (en el json, no en git):  0
faltantes (en git, no en el json): 0

archivos .stories.tsx:  214   (786 stories)
```

> Este número se regeneró DESPUÉS de las 24 extracciones presentacionales y del merge de contenido SEO. Una versión anterior de este documento afirmaba 266/266 — era falso: el inventario se había generado antes de esos dos trabajos y nunca se actualizó. Lo detectó el review independiente.

## Resumen

| Clasificación | Archivos | Qué significa |
|---|---:|---|
| **Story directa** | 223 | Componente visual con contrato de props. Tiene story propia. |
| **Requirió extracción presentacional** | 24 | Mezclaba fetch/autorización con presentación. Se extrajo la vista tipada a un componente hermano; la page quedó como shell que inyecta la Server Action. Las 24 tienen story. |
| **Cubierto por la story del padre** | 8 | Sub-componente trivial sin estados propios; solo existe dentro de su padre, que sí tiene story. |
| **Server wrapper — no aplica** | 34 | Server Component que solo fetchea y compone (page/layout). No se fabrica una vista artificial para tener una story: la composición a nivel página la cubren los specs de Playwright. Se storyean las hojas. |
| **No visual** | 11 | Provider, hook, reporter o generador de imágenes (Satori/ImageResponse). No hay DOM que renderizar. |
| **Total** | **300** | |

## Por dominio

| Dominio | Total | Con story | Excluidos |
|---|---:|---:|---:|
| abonados | 8 | 7 | 1 |
| auth | 14 | 11 | 3 |
| booking-grid | 13 | 12 | 1 |
| canchas | 10 | 9 | 1 |
| dashboard | 3 | 2 | 1 |
| design-system | 27 | 25 | 2 |
| layout-nav | 21 | 14 | 7 |
| metricas | 3 | 1 | 2 |
| misc | 9 | 4 | 5 |
| onboarding | 11 | 9 | 2 |
| payments-caja | 9 | 9 | 0 |
| player-facing | 74 | 65 | 9 |
| players | 2 | 2 | 0 |
| public-marketing | 33 | 23 | 10 |
| reportes | 4 | 4 | 0 |
| reservas | 10 | 10 | 0 |
| staff-settings | 22 | 16 | 6 |
| super-admin | 27 | 24 | 3 |

---

## Exclusiones justificadas

Toda exclusión lleva un motivo concreto. "No aplica" no es un motivo.

### Server wrapper — no aplica (34)

| Archivo | Motivo |
|---|---|
| `src/app/(admin)/abonados/nuevo/page.tsx` | Server Component que solo hace extractAuthUser/getStaffTenant/listCourts y renderiza AbonadoForm con los datos; sin lógica presentacional propia más allá de un link de volver y un h1. |
| `src/app/(admin)/canchas/page.tsx` | Server Component que solo hace requireOperatorStaff + listCourts y renderiza CourtList; sin markup propio más allá del <main> wrapper. |
| `src/app/(admin)/dashboard/page.tsx` | Server Component que fetchea (getDashboardData/getChecklistState) y compone componentes ya existentes fuera de esta área (PageHeader, OnboardingChecklist, MetricCard, UpcomingBookings); el único cálculo propio es un formateador de fecha (todayMediumArt) sin markup relevante propio. |
| `src/app/(admin)/grilla/page.tsx` | Server Component: auth + query cruda de bookings vía Drizzle (select/leftJoin/where con sql``) y mapeo a GridBooking[]; delega toda la presentación a BookingGrid, que vive fuera de esta área (src/components/booking). |
| `src/app/(admin)/layout.tsx` | Server Component: resuelve impersonación (resolveImpersonatedStaffContext), auth, kill-switch y suscripción, y compone AdminLayoutShell + ImpersonationBanner + PushNotificationManager (todos fuera de esta área); sin markup propio. |
| `src/app/(admin)/metricas/page.tsx` | Server Component: auth + getStaffRole (para canSeeSystem) y renderiza PageHeader + MetricsDashboardLoader; sin markup propio. |
| `src/app/(admin)/settings/facturacion/page.tsx` | Server Component: auth + getSubscriptionState (con fallback null en catch) y renderiza 2 secciones simples (resumen de suscripción + estado de conexión MercadoPago) en dl/markup corto; sin componentes inline con múltiples ramas de estado como caja/reportes. |
| `src/app/(admin)/settings/horarios/page.tsx` | Server Component: auth + composición de HorariosForm/AddClosedDateForm/RemoveClosedDateForm (ya storyables); el único bloque propio es un filter/sort/map corto de closedDates con formato de fecha inline, delgado comparado con caja/reportes. |
| `src/app/(admin)/settings/layout.tsx` | Server Component guard puro (requireAdminStaff) que retorna <>{children}</> — cero markup propio. |
| `src/app/(admin)/settings/page.tsx` | redirect('/settings/reservas') puro, sin renderizar nada. |
| `src/app/(admin)/settings/perfil/page.tsx` | Server Component: auth + composición delgada de SettingsTabs + PerfilImagesForm. |
| `src/app/(admin)/settings/reservas/page.tsx` | Server Component: auth + composición delgada de SettingsTabs + ReservasPolicyForm. |
| `src/app/(auth)/layout.tsx` | Layout trivial: solo envuelve children en un <main id="main-content">, sin fetch ni estado visual propio. |
| `src/app/(auth)/reset-password/page.tsx` | Server Component que llama supabase.auth.getUser() y solo bifurca entre <ResetForm/> (ya storyable aparte) y un bloque corto 'Enlace expirado' sin estado propio significativo. |
| `src/app/(business)/alternativas-alquila-tu-cancha/page.tsx` | Page de SEO (merge de contenido): Server Component que compone MDX + secciones. No hay lógica ni estado propio que aislar; su contenido es markdown. Se storyean sus piezas (ArticleShell) y la composición la cubren los e2e de SEO. |
| `src/app/(business)/blog/[slug]/page.tsx` | Post del blog: Server Component que lee el MDX del filesystem y lo pasa a ArticleShell/Mdx. Solo fetchea y compone. |
| `src/app/(business)/blog/page.tsx` | Índice del blog: Server Component que lista posts desde el filesystem (listBlogPosts). Solo fetchea y compone. |
| `src/app/(business)/layout.tsx` | layout.tsx que solo compone BusinessHeader/BusinessFooter (@/components/site, fuera de esta área) alrededor de children con un fondo dark fijo (#020617); sin lógica visual propia distinguible de esos dos componentes. |
| `src/app/(business)/vs/alquila-tu-cancha/page.tsx` | Page de comparativa (SEO): Server Component que compone MDX + secciones. Sin estado ni lógica propia. |
| `src/app/(player)/layout.tsx` | Solo extractAuthUser() + redirect si no hay jugador autenticado, y envuelve children en <PortalShell/> (fuera de esta área); sin vista propia. |
| `src/app/(public)/[slug]/disponibilidad/page.tsx` | Server Component async que hace notFound()/getPublicTenant()+getPublicWeeklyAvailability() y compone WeeklyAvailability (ya extraído y storyable) + JsonLd; sin vista propia adicional que aislar. |
| `src/app/(public)/[slug]/page.tsx` | Server Component async con 4 fetches en paralelo (getAverageRating/getPublicCourtCards/getReviewsByTenant + getPublicTenant) y gate por status; compone leaves ya extraídos y storyables (TenantGallery/TenantHeader/CourtCard/AvailabilityGrid/ReviewsSection); ISR (revalidate=300) + generateStaticParams no aplican en Storybook. |
| `src/app/(public)/explorar/page.tsx` | Server Component que orquesta múltiples fuentes de datos (searchPublicTenants/listPublicCities vía unstable_cache, findAvailableTenantIds, findFreeSlotPillsByTenant, getCourtPhotosByTenant, getPlayerFavoriteIds vía withPlayerContext) + extractAuthUser(); compone leaves ya extraídos y storyables (SearchBand/QuickFilters/ExplorarFilters/ExplorarSplitView/TenantCard/EmptyResults); sin vista propia adicional. |
| `src/app/(public)/layout.tsx` | layout.tsx que solo envuelve children en PortalShell (@/components/site/PortalShell, fuera de esta área); cero lógica visual propia. |
| `src/app/(public)/privacidad/page.tsx` | page.tsx 100% prosa legal estática (9 secciones), sin fetch, sin props, sin estados visuales variables; no hay componente presentacional distinguible que aislar más allá de la tipografía que ya cubre el design system. |
| `src/app/(public)/terminos/page.tsx` | page.tsx 100% prosa legal estática (10 secciones), sin fetch ni props ni estados; mismo caso que privacidad/page.tsx. |
| `src/app/(super-admin)/super-admin/layout.tsx` | requireSystemAdmin() (triple chequeo JWT+DB+allowlist) + side-effect recordLastLogin (UPDATE throttled a 15min) + composición con <SuperAdminLayoutShell/> (fuera de esta área); sin vista propia. |
| `src/app/layout.tsx` | Layout raíz: fuentes (Inter/Archivo/Sora), <html>/<body>, ThemeProvider/Toaster/WebVitalsReporter/NextTopLoader — sin vista propia; Storybook ya provee su propio decorator raíz equivalente. |
| `src/app/onboarding/listo/page.tsx` | extractAuthUser + getStaffTenant fetch + redirects según settings.onboarding_completed; el único contenido visual propio es una card estática de 2 líneas con tenant.name interpolado dentro de <WizardShell/> — WizardShell y <ShareActions/> (los componentes reales) ya se storyan aparte. |
| `src/app/onboarding/page.tsx` | extractAuthUser + resolveStaffTenants + getStaffTenant + listCourts fetch, y solo decide qué Step* renderizar dentro de <WizardShell/> según settings.onboarding_step — sin vista propia; los Step* ya se storyan aparte. |
| `src/app/reserva/[bookingId]/pendiente/page.tsx` | Server Component con extractAuthUser()+redirect() y una query SQL cruda (withPlayerContext) solo para calcular expiresAt; el único render propio es el mensaje trivial 'no encontramos tu reserva' (mismo patrón que exito/error) — el resto delega 100% a PaymentStatusWatcher (@/components/booking, fuera de esta área), que sería la story real. |
| `src/app/reserva/layout.tsx` | layout.tsx que solo envuelve children en PortalShell (@/components/site/PortalShell, fuera de esta área); cero lógica visual propia, mismo patrón que (public)/layout.tsx. |
| `src/components/site/Mdx.tsx` | Wrapper de MDXRemote (next-mdx-remote/rsc): es un Server Component que compila markdown en el servidor. No renderiza DOM propio ni tiene estados; en un bundle de browser MDXRemote/rsc ni siquiera resuelve. |
| `src/components/site/PortalShell.tsx` | Es el cascarón de composición del layout del portal (compone PortalSessionProvider + PortalFrame + PortalHeader + SiteFooter) usado directamente por (public)/layout.tsx, (player)/layout.tsx y reserva/layout.tsx — no tiene props ni estados propios más allá de 'children', es pura composición a nivel layout ya cubierta por specs de Playwright en cada ruta que lo usa. Sus piezas (PortalHeader, PortalFrame, SiteFooter, PlayerBottomNav) ya tienen story propia. |

### No visual (11)

| Archivo | Motivo |
|---|---|
| `src/app/apple-icon.tsx` | Genera un ImageResponse (Satori) en runtime edge para el apple-touch-icon; no es un componente React normal, corre fuera del árbol de render de la app. |
| `src/app/icon-192/route.tsx` | No es un componente de UI: es un Route Handler que genera un PNG con Satori. No hay DOM que renderizar ni estados visuales que capturar en Storybook. Se valida como asset servido, no como componente. |
| `src/app/icon-512-maskable/route.tsx` | No es un componente de UI: es un Route Handler que genera un PNG con Satori. No hay DOM que renderizar ni estados visuales que capturar en Storybook. Se valida como asset servido, no como componente. |
| `src/app/icon-512/route.tsx` | No es un componente de UI: es un Route Handler que genera un PNG con Satori. No hay DOM que renderizar ni estados visuales que capturar en Storybook. Se valida como asset servido, no como componente. |
| `src/app/icon.tsx` | Igual que apple-icon.tsx: ImageResponse (Satori) en runtime edge para el favicon 32×32. |
| `src/app/opengraph-image.tsx` | ImageResponse (Satori) 1200×630 en runtime edge para el OG image por defecto del sitio. |
| `src/components/perf/WebVitalsReporter.tsx` | No renderiza nada (return null). Es un side-effect hook wrapper: usa useReportWebVitals (next/web-vitals) para mandar métricas (LCP/CLS/INP/FCP/TTFB) a Sentry vía Sentry.captureMessage. No hay UI que storyear. |
| `src/components/public/amenities.tsx` | No exporta ningún componente React ni JSX propio: es un módulo de configuración (mapa AmenityKey→{label,Icon} + helper activeAmenities). Los íconos de lucide-react se usan desde otros componentes (FeaturedComplexCard), no se renderizan acá. |
| `src/components/seo/JsonLd.tsx` | Renderiza un <script type='application/ld+json'> invisible con dangerouslySetInnerHTML — no hay nada visual que verificar en Storybook, solo el JSON serializado (mejor cubierto por un unit test de renderStructuredData). |
| `src/components/site/PortalSessionProvider.tsx` | Es un React Context Provider puro (createContext/useContext) que hidrata la sesión vía fetch a /api/player/session — no renderiza ningún markup propio más allá de pasar children; se consume como decorator/wrapper en las stories de los componentes que sí usan usePortalSession (AccountMenu, PortalHeader, PortalFrame, FavoriteButton), no tiene story propia. |
| `src/components/theme/ThemeProvider.tsx` | Es un wrapper delgado sobre next-themes' ThemeProvider (pone/saca la clase .dark en <html>) — no renderiza markup propio visible, solo configura contexto. Se usa como decorator global de Storybook (ya cubierto por el theming del proyecto), no tiene estados propios que mostrar en una story. |

### Cubierto por la story del padre (8)

| Archivo | Motivo |
|---|---|
| `src/app/(admin)/metricas/MetricsDashboardLoader.tsx` | Envoltorio trivial de React.lazy+Suspense sobre MetricsDashboard; su único contenido visual propio es el esqueleto de carga (DashboardSkeleton, divs animate-pulse sin estados propios), ya cubierto por la story de MetricsDashboard con datos reales. |
| `src/app/(auth)/verify/SuccessRedirect.tsx` | Solo un párrafo con cuenta regresiva (aria-live) que dispara window.location.assign(next) por setTimeout; no tiene variantes visuales propias más allá del número — se cubre dentro de la story del estado 'success' de VerifyPage. |
| `src/app/(public)/explorar/components/ExplorarMapLoader.tsx` | wrapper trivial de next/dynamic(() => import('./ExplorarMap'), {ssr:false}); sin estados propios más allá del fallback pulse — la story real es la de ExplorarMap (Storybook ya renderiza client-side, el ssr:false es redundante ahí). |
| `src/app/(public)/explorar/components/PitchLines.tsx` | re-export vacío (`export { default } from '@/components/public/PitchLines'`); el componente real vive fuera de esta área y no hay contenido propio que storyar aquí. |
| `src/app/(super-admin)/super-admin/_components/sa-metric-card.tsx` | Wrapper de una línea sobre <StatCard/> (@/components/admin/StatCard, fuera de esta área) con accent='violet' fijo; no agrega estados visuales propios — las variantes reales las cubre la story de StatCard, y el uso concreto ya se ve en la story del SuperAdmin dashboard page. |
| `src/app/(super-admin)/super-admin/tenants/[id]/_components/detail-primitives.tsx` | Dos primitives de layout (par label/valor de un <dl>, y un wrapper). Sin estados propios: solo existen dentro de resumen-tab / suscripcion-tab / actividad-tab, que SI tienen story y los renderizan. |
| `src/components/site/SiteNav.tsx` | Archivo de una sola línea que re-exporta PortalHeader (`export { default } from './PortalHeader'`) para no romper imports existentes (src/app/page.tsx sigue usándolo como <SiteNav variant="overlay"/>). No tiene JSX ni lógica propia — cualquier story de PortalHeader cubre exactamente el mismo componente. |
| `src/components/ui/toaster.tsx` | Toaster() no recibe props: es el mount-point único (root layout) que solo suscribe useToast() y mapea el array de toasts a <Toast variant=.../> ya definido en toast.tsx. Todos los estados visuales reales (default/success/destructive, con/sin título, duración) ya se documentan directamente instanciando <Toast> en su propia story sin depender del store global; Toaster en sí no aporta ningún estado visual propio, solo wiring. |

---

## Detalle completo

El JSON tiene, por archivo: dominio, client/server, rol, providers que necesita, si usa red/sesión/router/Server Actions, dificultad de aislamiento, qué hook o import exacto la complica, estados relevantes, clasificación, motivo de exclusión y título de story propuesto.

## Cómo re-verificar la cobertura

Guardá esto como `scripts/check-coverage.mjs` y corrélo con `node scripts/check-coverage.mjs`.
**Volvé a correrlo cada vez que agregues, borres o extraigas un componente** — el inventario no se
actualiza solo, y un doc que afirma una cobertura que ya no es cierta es peor que no tener doc.

```js
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const inv = JSON.parse(readFileSync('docs/storybook/storybook-coverage.json', 'utf8')).components
const real = new Set(
  execSync('git ls-files "src/**/*.tsx"', { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter((f) => !f.endsWith('.stories.tsx')),
)
const paths = inv.map((c) => c.path)

const ghost = paths.filter((p) => !real.has(p))
const missing = [...real].filter((p) => !paths.includes(p))

console.log(`reales: ${real.size} · inventariados: ${paths.length}`)
console.log(`fantasma (en el json, no en git): ${ghost.length}`, ghost)
console.log(`faltantes (en git, no en el json): ${missing.length}`, missing)
process.exit(ghost.length || missing.length ? 1 : 0)
```
