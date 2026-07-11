# Inventario y cobertura de Storybook

Generado desde `storybook-coverage.json`, que es la fuente de verdad. Cobertura verificada contra `git ls-files "src/**/*.tsx"`: **266/266 archivos**, cero huérfanos, cero fantasmas.

## Resumen

| Clasificación | Archivos | Qué significa |
|---|---:|---|
| **Story directa** | 194 | Componente visual con contrato de props. Tiene story propia. |
| **Requiere extracción presentacional** | 24 | Mezcla fetch/autorización con presentación; adentro hay una vista tipada que vale extraer. |
| **Cubierto por la story del padre** | 7 | Sub-componente trivial sin estados propios; solo existe dentro de su padre. |
| **Server wrapper — no aplica** | 29 | Server Component que solo fetchea y compone (page/layout). No se fabrica una vista artificial para tener una story: la composición a nivel página ya la cubren los 35 specs de Playwright. Se storyean las hojas. |
| **No visual** | 12 | Provider, hook, reporter o generador de imágenes (Satori/ImageResponse). No hay DOM que renderizar. |
| **Total** | **266** | |

## Por dominio

| Dominio | Total | Story directa | Excluidos |
|---|---:|---:|---:|
| abonados | 8 | 7 | 1 |
| auth | 10 | 7 | 3 |
| booking-grid | 13 | 12 | 1 |
| canchas | 10 | 9 | 1 |
| dashboard | 3 | 2 | 1 |
| design-system | 28 | 25 | 3 |
| layout-nav | 21 | 14 | 7 |
| metricas | 3 | 1 | 2 |
| misc | 5 | 1 | 4 |
| onboarding | 11 | 9 | 2 |
| payments-caja | 9 | 9 | 0 |
| player-facing | 70 | 61 | 9 |
| players | 2 | 2 | 0 |
| public-marketing | 19 | 13 | 6 |
| reportes | 4 | 4 | 0 |
| reservas | 10 | 10 | 0 |
| staff-settings | 20 | 14 | 6 |
| super-admin | 20 | 18 | 2 |

## Dificultad de aislamiento

| Dificultad | Archivos |
|---|---:|
| trivial | 102 |
| easy | 55 |
| medium | 60 |
| hard | 38 |
| unfeasible | 11 |

---

## Exclusiones justificadas

Toda exclusión lleva un motivo concreto. "No aplica" no es un motivo.

### Server wrapper — no aplica (29)

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
| `src/app/(business)/layout.tsx` | layout.tsx que solo compone BusinessHeader/BusinessFooter (@/components/site, fuera de esta área) alrededor de children con un fondo dark fijo (#020617); sin lógica visual propia distinguible de esos dos componentes. |
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
| `src/components/site/PortalShell.tsx` | Es el cascarón de composición del layout del portal (compone PortalSessionProvider + PortalFrame + PortalHeader + SiteFooter) usado directamente por (public)/layout.tsx, (player)/layout.tsx y reserva/layout.tsx — no tiene props ni estados propios más allá de 'children', es pura composición a nivel layout ya cubierta por specs de Playwright en cada ruta que lo usa. Sus piezas (PortalHeader, PortalFrame, SiteFooter, PlayerBottomNav) ya tienen story propia. |

### No visual (12)

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
| `src/components/ui/submit-button.stories.tsx` | Es el archivo de definición de stories (Meta/StoryObj vía '@storybook/nextjs-vite' y 'storybook/test') para SubmitButton, no un componente de UI de la app: nada en src/app o src/components lo importa, solo lo consume Storybook. Es en sí mismo el artefacto de la migración (evidencia de que la story de SubmitButton ya se creó adelantada a F4), no un archivo pendiente de inventariar para 'crear una story'. |

### Cubierto por la story del padre (7)

| Archivo | Motivo |
|---|---|
| `src/app/(admin)/metricas/MetricsDashboardLoader.tsx` | Envoltorio trivial de React.lazy+Suspense sobre MetricsDashboard; su único contenido visual propio es el esqueleto de carga (DashboardSkeleton, divs animate-pulse sin estados propios), ya cubierto por la story de MetricsDashboard con datos reales. |
| `src/app/(auth)/verify/SuccessRedirect.tsx` | Solo un párrafo con cuenta regresiva (aria-live) que dispara window.location.assign(next) por setTimeout; no tiene variantes visuales propias más allá del número — se cubre dentro de la story del estado 'success' de VerifyPage. |
| `src/app/(public)/explorar/components/ExplorarMapLoader.tsx` | wrapper trivial de next/dynamic(() => import('./ExplorarMap'), {ssr:false}); sin estados propios más allá del fallback pulse — la story real es la de ExplorarMap (Storybook ya renderiza client-side, el ssr:false es redundante ahí). |
| `src/app/(public)/explorar/components/PitchLines.tsx` | re-export vacío (`export { default } from '@/components/public/PitchLines'`); el componente real vive fuera de esta área y no hay contenido propio que storyar aquí. |
| `src/app/(super-admin)/super-admin/_components/sa-metric-card.tsx` | Wrapper de una línea sobre <StatCard/> (@/components/admin/StatCard, fuera de esta área) con accent='violet' fijo; no agrega estados visuales propios — las variantes reales las cubre la story de StatCard, y el uso concreto ya se ve en la story del SuperAdmin dashboard page. |
| `src/components/site/SiteNav.tsx` | Archivo de una sola línea que re-exporta PortalHeader (`export { default } from './PortalHeader'`) para no romper imports existentes (src/app/page.tsx sigue usándolo como <SiteNav variant="overlay"/>). No tiene JSX ni lógica propia — cualquier story de PortalHeader cubre exactamente el mismo componente. |
| `src/components/ui/toaster.tsx` | Toaster() no recibe props: es el mount-point único (root layout) que solo suscribe useToast() y mapea el array de toasts a <Toast variant=.../> ya definido en toast.tsx. Todos los estados visuales reales (default/success/destructive, con/sin título, duración) ya se documentan directamente instanciando <Toast> en su propia story sin depender del store global; Toaster en sí no aporta ningún estado visual propio, solo wiring. |

---

## Detalle completo

El JSON (`storybook-coverage.json`) tiene, por archivo: dominio, client/server, rol, providers que necesita, si usa red/sesión/router/Server Actions, dificultad de aislamiento, qué hook o import exacto la complica, estados relevantes, clasificación, motivo de exclusión y título de story propuesto.
