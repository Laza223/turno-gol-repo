# AUDIT 01 — Vistas públicas

Testeado en `localhost:3000` (dev server, `NEXT_PUBLIC_E2E=1`, Supabase local seedeado). Sin autenticación salvo donde se indica.

> **Nota transversal de consola (todas las vistas):** ver `AUDIT_06_general.md`. En cada vista aparecen de forma recurrente:
> - `[error] Connecting to 'ws://127.0.0.1:54763/' violates ... Content Security Policy directive: "connect-src 'self' *.supabase.co *.mercadopago.com"` (decenas de repeticiones). Es la extensión **Console Ninja** del editor intentando abrir un WebSocket; el CSP lo bloquea. **No es código de la app**, pero revela que el `connect-src` no contempla WebSockets locales (relevante para Supabase Realtime apuntando a `127.0.0.1` en dev).
> - `[warn] <meta name="apple-mobile-web-app-capable"> is deprecated` (meta del layout raíz). 🟢

---

# 🔴 HALLAZGO CRÍTICO TRANSVERSAL — Fuga de datos cross-tenant (RLS no efectivo en dev)

Afecta el perfil público del complejo, la grilla de disponibilidad y, potencialmente, todo el panel admin. Se detalla acá una vez y se referencia desde cada vista.

## Qué pasa
El perfil público de **un** complejo muestra canchas (y disponibilidad) de **otros** complejos.

Evidencia (vista `/e2e-complejo-demo`, que es tenant `…001`): se listan 3 canchas, pero por DB pertenecen a 3 tenants distintos:

| Cancha mostrada | court_id | tenant real | slug real |
|---|---|---|---|
| Cancha E2E 1 | `…010` | `…001` | `e2e-complejo-demo` ✅ |
| Cancha Seña 1 | `…031` | `…030` | `e2e-complejo-sena` ❌ |
| Handmade Soft Salad | `3f26ab18…` | `6488db20…` | `t-wwd4ksubaf` ❌ |

## Qué debería pasar
El perfil de `e2e-complejo-demo` debería mostrar **solo** sus canchas (`Cancha E2E 1`).

## Causa raíz (verificada por DB)
- `src/modules/tenants/public.service.ts` → `getPublicCourtCards()` (línea ~243) y `getPublicAvailability()` (línea ~296) consultan `courts`/`bookings` dentro de `withTenantContext(tenant.id)` con `WHERE status='online'` **sin filtro explícito `tenant_id`**. Confían 100% en RLS.
- En la DB local: `courts`, `bookings`, `payments`, `abonados` tienen RLS **habilitado pero NO forzado** (`relrowsecurity=t`, `relforcerowsecurity=f`).
- El dev server conecta como rol **`postgres`** (superusuario/owner del schema; visto en `pg_stat_activity` como `application_name=postgres.js`). Un superusuario/owner **bypassa RLS cuando no está forzado** → las policies `tenant_isolation_select` (que existen y son correctas) **no se aplican**.

## Implicancias
1. **En dev, el aislamiento por tenant NO está activo.** Cualquier query que dependa solo de RLS devuelve filas de todos los tenants. Esto puede contaminar también la grilla/reservas/caja del admin (a verificar en `AUDIT_04`).
2. **El entorno local no puede detectar regresiones de aislamiento** vía navegación normal (RLS silenciosamente bypasseado). Conviene confirmar que `test:isolation` corre con un rol NO-superusuario (`turnogol_app`) y/o `FORCE ROW LEVEL SECURITY`.
3. **Defense-in-depth débil:** las queries públicas no agregan `eq(courts.tenantId, tenant.id)` explícito. Aunque RLS funcione en prod, un único filtro explícito evitaría fugas si el rol/policy se rompe.

## A verificar (no testeable desde el browser)
- Rol con que conecta la app en **producción** (`DATABASE_URL`). Si prod también usa `postgres`/owner → **fuga real de datos en prod (severidad máxima)**. Si usa `turnogol_app` no-superusuario → el leak es artefacto de dev, pero los puntos (2) y (3) siguen vigentes.
- Archivos probables: `scripts/bootstrap-test-db.mjs`, `src/shared/db/client.ts`, config de `DATABASE_URL`.

**Severidad:** 🔴 (potencial fuga de datos en prod; confirmada en dev).

---

# Landing (Home) — `/`

## Archivo fuente
- `src/app/page.tsx`
- Componentes: `src/components/site/{SiteNav,SiteFooter,HeroSearch,FeaturedComplexCard,OpenMatchCard,Reveal}.tsx`
- Servicios: `src/modules/tenants/search.service.ts` (`listPublicCities`, `searchPublicTenants`), `src/modules/open-matches/open-match.service.ts`

## Comportamiento esperado (según el código)
- Server Component con ISR (`revalidate=300`). Carga resiliente (try/catch → `[]`): ciudades, complejos destacados (`sort:rating, limit:6`), partidos abiertos. Secciones vacías se ocultan.
- **HeroSearch** (`'use client'`): arma `URLSearchParams` (city, date si ≠ hoy, time) y `router.push('/explorar?…')`.
- Chips "Populares" → `/explorar?city=…`. Cards destacadas → `/<slug>`. "Conocé más" → `/para-complejos`. Nav → `/explorar`, `/para-complejos`, `/login`, `/register`.

## Resultado del test
- ✅ Renderiza completo: hero, buscador, complejos destacados (E2E Seña, E2E Demo, Jaskolski), "Cómo funciona", stats, owner banner, footer.
- ✅ Datos reales desde DB (ciudades en el select, 3 complejos destacados con precio "Desde $ 100" / "$ 8.000").
- ✅ **"Buscar canchas"** navega a `/explorar` (con defaults, sin params, correcto). *Nota MCP:* el primer click solo enfocó el botón (tiene `hover:-translate-y-0.5`); el submit disparó al segundo intento. No es bug de la app.
- ✅ Network 100% `200`, sin requests fallidos.
- ⚠️ El select nativo de Localidad no respondió a `fill_form` del MCP (timeout "no interactive"). Posible quirk del overlay/estilos; el `<select>` es nativo y funciona por teclado. Menor, a re-verificar manualmente.

## Network issues
Ninguno (todos 200).

## Screenshots
`screenshots/01-landing.png` — landing completa, hero oscuro con buscador blanco, 3 cards destacadas.

## Severidad
🟢 Sin defectos funcionales propios. (Consola: ver nota transversal.)

---

# Explorar — `/explorar`

## Archivo fuente
- `src/app/(public)/explorar/page.tsx` + `components/{SearchBar,ExplorarToolbar,ExplorarFilters,ExplorarMapLoader,ExplorarMap,TenantCard,url}.tsx`
- `src/components/public/FavoriteButton.tsx`
- Servicio: `src/modules/tenants/search.service.ts`; API: `src/app/api/public/{search,cities}/route.ts`

## Comportamiento esperado (según el código)
- `force-dynamic`. Lee `searchParams` (q, city, online, surfaces, formats, amenities, minPrice, maxPrice, sort, lat/lng, offset, view). Filtrado/orden vía cambios de URL (los client components hacen `router.push`).
- Toggle Lista/Mapa (`view=map` usa Leaflet `dynamic ssr:false`, limit 50). Sort "Más cercano" pide geolocalización. Filtros con borrador local + "Aplicar"/"Limpiar". FavoriteButton requiere sesión de jugador.

## Resultado del test
- ✅ `/explorar` renderiza: buscador, sidebar de filtros (Cerramiento/Superficie/Formato/Servicios/Precio/online), toolbar (contador "3 complejos", Ordenar, Lista/Mapa), 3 cards de complejos.
- ✅ Navegación RSC al entrar (sin recarga completa). Network 200.
- ✅ **Toggle "Mapa"** → `/explorar?view=map`, carga chunk `ExplorarMap`. Muestra empty-state correcto: *"Los complejos de esta búsqueda todavía no tienen ubicación cargada en el mapa."* (los complejos seed no tienen lat/lng). No rompe ni pide tiles. Manejo correcto.
- ✅ **FavoriteButton como anónimo**: `POST /api/player/favorites/toggle` → **401**, y el cliente **redirige a `/login?next=%2Fexplorar`**. Gate de login correcto.
- 🟡 **Doble footer**: la página tiene **dos landmarks `contentinfo`** — el `LegalFooter` (Privacidad/Términos + ©TurnoGol) y el `SiteFooter` (TG/Contacto). Viene del `(public)/layout.tsx` que renderiza ambos. Redundancia visual + a11y (2 footers). Afecta a todas las vistas bajo `(public)`.
- 🟢 Las cards muestran formato **"Fútbol 10"** (derivado de `capacity=10` del seed). No es un formato real (5/7/8/9/11). Defecto de mapeo capacity→formato o dato de seed.

## Network issues
`POST /api/player/favorites/toggle 401` — **esperado** (anónimo), manejado con redirect a login.

## Screenshots
`screenshots/02-explorar.png` (lista), `screenshots/03-explorar-mapa.png` (empty-state mapa).

## Severidad
🟡 Doble footer (a11y/visual). 🟢 etiqueta "Fútbol 10".

---

# Perfil del complejo — `/[slug]` (`/e2e-complejo-demo`)

## Archivo fuente
- `src/app/(public)/[slug]/page.tsx` + `components/{TenantHeader,TenantGallery,CourtCard,ReviewsSection,AvailabilityGrid}.tsx`
- Servicio: `src/modules/tenants/public.service.ts` (`getPublicTenant`, `getPublicCourtCards`, `getPublicAvailability`)

## Comportamiento esperado (según el código)
- `getPublicTenant(slug)`; si no existe → `notFound()`; si estado en {suspended,blocked,canceled,churned,deleted} → cartel "no disponible".
- Renderiza header (compartir, guardar, dirección, "Cómo llegar" a Google Maps, teléfono), horarios, canchas (`getPublicCourtCards`), grilla de disponibilidad del día (`getPublicAvailability`) con links `Reservar` → `/[slug]/reservar?court=&date=&time=&dur=`, y reseñas.

## Resultado del test
- ✅ Header, horarios (Lun–Dom 08/09–23), "Cómo llegar" (link Google Maps correcto), teléfono (`tel:`), "Ver semana completa" → `/disponibilidad`.
- ✅ Grilla de disponibilidad: hoy 2026-06-03; slots ≤16:00 en "—/Pasado", 17:00–22:00 con links `Reservar` que incluyen `court/date/time/dur=60`. Leyenda Libre/Ocupado/Pasado.
- ✅ Precios correctos en centavos→pesos ("$ 100" para court E2E; "$ 8.000"/"$ 12.000" según regla horaria de la cancha faker).
- ✅ Reseñas: "Todavía no hay reseñas de este complejo." (empty-state).
- 🔴 **Fuga cross-tenant** (ver hallazgo crítico arriba): muestra `Cancha Seña 1` (tenant sena) y `Handmade Soft Salad` (tenant faker) que NO son de este complejo. Tanto en la sección "Canchas (3)" como en la grilla de disponibilidad.
- 🟢 Encabezado de fecha "Miércoles, 3 **De** Junio" — "De"/"Junio" capitalizados por `text-transform: capitalize` sobre el string completo (debería ser "3 de junio").
- 🟡 Doble footer (igual que /explorar).

## Network issues
Ninguno fallido (la fuga es a nivel de datos del SSR, no de red).

## Screenshots
`screenshots/04-perfil-complejo.png` — perfil completo con las 3 canchas (incluye las filtradas erróneamente) y la grilla.

## Severidad
🔴 Fuga cross-tenant. 🟡 doble footer. 🟢 capitalización de fecha, etiqueta de formato.

---

# Disponibilidad semanal — `/[slug]/disponibilidad`

## Archivo fuente
- `src/app/(public)/[slug]/disponibilidad/page.tsx` + componente de grilla semanal
- Servicio: `getPublicWeeklyAvailability` (`src/modules/tenants/public.service.ts`)

## Comportamiento esperado
- Muestra 7 días (desde hoy hasta `bookingAdvanceDays`), tabs por día, slots por cancha con link `Reservar`.

## Resultado del test
- ✅ Tabs Mié 3 – Mar 9 jun (respeta advance=6 días). "Mié 3 jun" preseleccionado.
- ✅ **Cambio de día** (client-side, sin red): click en "Jue 4 jun" actualiza los slots a `date=2026-06-04`, mostrando día completo desde 08:00 (futuro, sin "Pasado"). Precios por regla horaria correctos.
- 🔴 Mismo leak cross-tenant (Cancha Seña 1, Handmade Soft Salad) — heredado de `getPublicWeeklyAvailability` (mismo patrón RLS-only).
- 🟡 Doble footer.

## Screenshots
`screenshots/05-disponibilidad-semana.png`

## Severidad
🔴 (leak heredado). El resto funciona correctamente.

---

# Reservar (confirmación de turno) — `/[slug]/reservar`

## Archivo fuente
- `src/app/(public)/[slug]/reservar/page.tsx` + actions/components co-locados
- Servicios: `booking.service` (`createOnlineBooking`), `auth.service` (`signInWithMagicLink`)

## Comportamiento esperado
- Lee `court/date/time/dur` de la query, muestra resumen + precio. Detecta `requires_deposit`.
- Anónimo: form (Nombre, Apellido, Email, checkbox +18/declaración jurada) → envía magic link.
- Autenticado (jugador): botón "Confirmar reserva" → crea booking → redirige a `/reserva/[id]/exito` (sin seña) o a flujo MP (con seña).

## Resultado del test (flujo completo)
- ✅ **Resumen correcto**: "Jueves, 4 De Junio · 20:00–21:00 · Cancha E2E 1 · $ 100" y "Este complejo no requiere seña. Pagás el total en el complejo." (demo tiene `requires_deposit=false`).
- ⚠️ **Validación**: enviar el form vacío dispara el submit (botón pasa a "Enviando…") sin bloqueo client-side; el server action valida y devuelve error.
- 🟡 **Mensaje de error en inglés**: con email inválido devuelve **"Invalid email"** (mensaje crudo de Zod), inconsistente con la UI 100% en español.
- ✅ **Happy path anónimo→player**: completar Nombre/Apellido/Email + tildar +18 → POST 200 → estado "Revisá tu email — Te enviamos un enlace a e2e-player@turnogol.test".
- ✅ **Magic link real** (capturado en Inbucket) → verify Supabase (PKCE) → callback → vuelve a `/reservar` ya autenticado → muestra botón "Confirmar reserva".
- ✅ **Confirmar reserva** → POST **303** → `/reserva/{bookingId}/exito`. Booking creado correctamente.
- 🟢 La nav pública sigue mostrando "Ingresar" aun con sesión de jugador activa (la `SiteNav` pública no refleja el estado logueado). Menor.

## Network issues
`POST /reservar` con email inválido → 200 con error en payload (no es fallo HTTP). Resto OK.

## Screenshots
`screenshots/06-reservar-anon.png` (form anónimo), `screenshots/07-reserva-exito.png` (éxito).

## Severidad
🟡 Mensaje "Invalid email" en inglés + falta validación client-side. Flujo core ✅ funcional.

---

# Reserva confirmada — `/reserva/[bookingId]/exito`

## Archivo fuente
- `src/app/reserva/[bookingId]/exito/page.tsx`

## Resultado del test
- ✅ "¡Reserva confirmada!" con detalle: "E2E Complejo Demo · Cancha E2E 1 / 2026-06-04 · 20:00–21:00 / Pagás $100,00 al llegar al complejo."
- ✅ Botones: Compartir, Calendario, "Cómo llegar" (Google Maps), "Ver mis reservas" → `/mis-reservas`.
- ✅ Layout minimal sin nav/footer (pantalla de confirmación limpia).
- 🟢 Formato de monto "$100,00" (con coma decimal AR) vs "$ 100" en otras vistas — inconsistencia menor de formato.

## Severidad
🟢 Funciona correctamente.

---

# Para complejos (landing B2B) — `/para-complejos`

## Resultado del test
- ✅ Renderiza: h1 "Tu complejo de fútbol, lleno todos los días.", CTAs "Comenzá gratis 30 días"/"Crear mi cuenta" → `/register`, "Iniciar sesión"/"Ya tengo cuenta" → `/login`. Contenido 100% estático.
- 🟡 Doble footer (2 `contentinfo`). Consola limpia (solo Console Ninja).

## Severidad
🟢 (salvo doble footer transversal).

---

# Legales — `/privacy` y `/terms`

## Resultado del test
- ✅ `/privacy`: política completa, 8 secciones (Quiénes somos, Datos, Uso, Compartir, Retención, **Derechos ARCO — Ley 25.326**, Cookies/seguridad, **AAIP**). ~7.5k chars.
- ✅ `/terms`: 10 secciones. ~6.5k chars.
- 🟢 **Título duplicado**: `document.title` = "Política de Privacidad — TurnoGol **· TurnoGol**" / "Términos y Condiciones — TurnoGol **· TurnoGol**" — `buildMetadata` agrega "· TurnoGol" a títulos que ya terminan en "— TurnoGol". Cosmético/SEO.
- 🟡 Doble footer.

## Severidad
🟢 Contenido legal correcto. 🟢 título duplicado.

---

# Cuenta suspendida — `/suspended`

## Resultado del test
- ✅ Renderiza: "Tu cuenta está temporalmente suspendida" + explicación tranquilizadora ("Tus datos están a salvo…") + "Contactar a soporte" y "Volver al inicio".
- 🟡 Doble footer. Título "Cuenta suspendida — TurnoGol · TurnoGol" (mismo duplicado).

## Severidad
🟢 Funciona correctamente.

---

# Páginas de resultado de pago con seña — `/reserva/[bookingId]/{pendiente,error}` y `/mock-mp/checkout`

## Estado
⏸️ **No testeadas end-to-end** — requieren un booking en estado `pending_payment` con contexto de MercadoPago (señas). El tenant demo tiene `requires_deposit=false`, por lo que el flujo va directo a `/exito` (ya verificado). El flujo con seña usa `e2e-complejo-sena` + `MP_MOCK_MODE=1` (`/mock-mp/checkout` simula el checkout). Se documenta el comportamiento esperado:
- `/mock-mp/checkout`: página mock que simula el Checkout Pro de MP (aprobar/rechazar pago) en dev/E2E.
- `/reserva/[id]/pendiente`: pago en proceso (webhook MP aún no confirmó).
- `/reserva/[id]/error`: pago rechazado/fallido.

## Severidad
⏸️ No verificado (requiere contexto de pago MP).

---

# Para complejos (landing B2B) — `/para-complejos`

## Archivo fuente
- `src/app/(public)/para-complejos/page.tsx` (estática)

## Resultado del test
- ✅ Renderiza completa: hero ("Comenzá gratis 30 días"→/register, "Iniciar sesión"→/login), 6 features, stats, "En 4 pasos…" (onboarding), grilla animada mock ("9 reservas confirmadas hoy · En vivo"), 3 testimonios, CTA final ("Crear mi cuenta"→/register, "Ya tengo cuenta"→/login).
- ✅ Consola limpia (solo ws de Console Ninja + meta deprecado global).
- 🟡 Doble footer (igual que el resto de `(public)`).

## Severidad
🟢 (todo estático y correcto).

---

# Legales — `/privacy` y `/terms`

## Resultado del test
- ✅ **`/privacy`** — "Política de Privacidad" con 9 secciones (Quiénes somos, Qué datos, Para qué, Con quién, Retención, **Derechos ARCO Ley 25.326**, Cookies/seguridad, **AAIP**, Cambios). ~7.5k chars.
- ✅ **`/terms`** — "Términos y Condiciones" con 10 secciones (Objeto, Responsabilidad del complejo, **Declaración jurada +18**, Pagos, Cancelaciones, **Suscripciones SaaS B2B**, Suspensión/baja, Limitación, Ley aplicable, Cambios). ~6.5k chars.
- 🟡 Doble footer en ambas.

## Severidad
🟢 Contenido legal completo y correcto.

---

# Cuenta suspendida — `/suspended`

## Resultado del test
- ✅ "Tu cuenta está temporalmente suspendida — El acceso al panel está pausado… Tus datos están a salvo…" + "Contactar a soporte" (`mailto:soporte@turnogol.app`) + "Volver al inicio".

## Severidad
🟢 Correcta.

---

# Resultado de reserva — `/reserva/[bookingId]/{exito,pendiente,error}`

## Resultado del test
- ✅ **`/exito`**: verificada en el funnel de reserva (ver §Reservar). "¡Reserva confirmada!" con detalle + acciones.
- ⏸️ **`/pendiente`** y **`/error`**: **requieren la sesión del jugador dueño de la reserva**. Navegando como admin (no-owner) → **redirige a `/login`**. No se observó el render directo de estas vistas (requeriría un jugador con una reserva en estado `pending_payment` / fallida — flujo de seña con MercadoPago).

## Severidad
🟢 (exito ✅; pendiente/error auth-gated, no verificadas a fondo).

---

# Mock MercadoPago — `/mock-mp/checkout`

## Resultado del test
- ⚠️ Sin query params → **404 "Página no encontrada"** (el global not-found renderiza bien). Requiere el contexto del flujo de seña (`MP_MOCK_MODE=1`).
- 🟢 Warn de consola: *"No default component was found for a parallel route… Falling back to nearest NotFound boundary"* → falta un `default.js` en algún slot de ruta paralela. Menor.
- ⏸️ El flujo completo de seña (reserva en tenant con `requires_deposit=true` → mock checkout → webhook → confirmación) **no se testeó end-to-end**.

## Severidad
🟢 (404 graceful sin params; flujo de seña pendiente de verificación).
