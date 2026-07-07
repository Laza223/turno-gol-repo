# TurnoGol — TODO General

> Tareas pendientes del proyecto. Se van tachando (`[x]`) a medida que se completen.
> Organizadas por fase del proyecto. Empezar después de completar las 26 fases de auditoría.

---

## Fase 0 — Terminar Auditoría (Completada)

- [x] Completar F5 — Admin Reportes + Settings + Abonados + Staff
- [x] Completar F6 — Public Landing + Search + Portal Complejo + SEO
- [x] Completar F7 — Booking Flow Jugador End-to-End (flujo de conversión = $$$)
- [x] Completar F8 — Player Area (mis reservas, cancelar, perfil, eliminar cuenta)
- [x] Completar F9 — Notificaciones (Toast + Push Web)
- [x] Completar F10 — Responsive / Mobile (admin usa celular para gestionar)
- [x] Completar F11 — Accessibility (WCAG 2.1 AA)
- [x] Completar F12 — Performance / Core Web Vitals (LCP < 2.5s, grilla actual 3.8s)
- [x] Completar F13 — Cross-Browser + Cross-Device
- [x] Completar F14 — E2E Coverage Final + CI gate

---

## 🏟️ Interfaz Pública — Estilo ATC Sports (PRIORIDAD MÁXIMA)

> Todo lo que ATC Sports tiene en su portal público (B2C) y que TurnoGol
> necesita implementar o mejorar para competir al mismo nivel.
> Estado: ✅ Existe | 🟡 Parcial/Básico | ❌ No existe
>
> **Nota de diseño (V1):** La interfaz pública se construye **solo en light mode**
> (coherente con `design-system/MASTER.md §11`). El **dark mode queda diferido a una
> versión próxima** — hay que implementarlo también. Ver "Dark Mode (diferido)" más abajo.

> **✅ Implementado en branch `feature/public-ui-atc`** (resumen):
> - **Landing**: buscador embebido (Localidad/Deporte/Fecha/Hora) + "Destacados" + "Partidos abiertos" + reveals en scroll.
> - **Explorar**: barra estructurada, filtros (superficie/formato/servicios/precio/cerramiento), orden (precio/rating/cercanía con geolocalización), toggle Lista/Mapa (Leaflet, pines de precio + popup), TenantCard premium (precio Desde, rating, favorito, badges, amenities), paginación URL-based, skeletons, contador dinámico.
> - **Perfil `/[slug]`**: galería con lightbox, "Cómo llegar" (Google Maps), amenities, rating + reseñas (ver más), compartir, favorito, cards por cancha.
> - **Reserva (éxito)**: mini-mapa, compartir por WhatsApp, agregar al calendario (.ics).
> - **Jugador**: dejar reseña post-partido + reservar de nuevo.
> - **SEO**: `SportsActivityLocation` enriquecido con `geo`; sitemap/robots/OG ya existían.
> - **Backend (lecturas aditivas, flageadas)**: `lat/lng` + facets en búsqueda; `amenities/geo` + `getPublicCourtCards` en detalle.

> **Pendiente (no hecho aún):** detección de ubicación auto en landing, autocompletado de localidad, búsqueda por disponibilidad real cross-complejo, "Más reservado"/duración como filtros, píldoras de turnos + carrusel en cards, datepicker visual en la grilla, filtro/disponibilidad por cancha, lista de favoritos + preferencias de notif + historial de actividad en perfil del jugador (requieren endpoints nuevos), QR/comprobante PDF, ISR en `/explorar` y `/[slug]` (siguen dynamic por searchParams/disponibilidad live).

### 1. Landing Page (`/`)

- [x] ✅ Hero con headline, CTA y fondo visual
- [x] ✅ Sección de features del producto
- [x] ✅ Stats sociales (+10.000 turnos, 50+ complejos, etc.)
- [x] ✅ Testimonios de complejos reales
- [x] ✅ Footer institucional
- [x] ✅ Buscador inteligente embebido en el hero (Localidad + Fecha + Hora + Deporte)
- [x] ✅ Detección automática de ubicación del usuario (geolocalización) para pre-llenar la ciudad
- [x] ✅ Sección "Complejos destacados cerca tuyo" — cards de complejos populares en la landing
- [x] ✅ Sección "Partidos abiertos" / "Falta uno" en la landing — vitrina social
- [ ] ❌ App download banners (links a App Store / Google Play cuando tengas PWA/App)

### 2. Buscador y Exploración (`/explorar`)

#### 2.1 Buscador principal (cabecera)
- [x] ✅ Input de texto por nombre de complejo
- [x] ✅ Filtro por ciudad
- [x] ✅ Filtro "Reserva online" (checkbox)
- [x] ✅ Buscador estructurado estilo ATC: Localidad + Fecha + Hora + Texto en una sola barra
- [x] ✅ Selector de fecha (datepicker) integrado en la barra de búsqueda
- [x] ✅ Selector de hora preferida integrado en la barra de búsqueda
- [x] ✅ Búsqueda por disponibilidad real (cruzar agendas de todos los complejos y mostrar solo los que tengan turnos libres a esa hora)
- [x] ✅ Autocompletado predictivo de localidad/complejo
- [x] ✅ Geolocalización para ordenar por cercanía (con permisos de ubicación)

#### 2.2 Filtros avanzados (barra secundaria)
- [x] ✅ Filtro por tipo de superficie (sintético, natural, cemento, indoor)
- [ ] ❌ Filtro por duración del turno (60 min / 120 min)
- [x] ✅ Filtro por formato de cancha (Fútbol 5 / 7 / 11)
- [x] ✅ Filtro por servicios del club (duchas, estacionamiento, bar, parrilla, vestuario)
- [x] ✅ Filtro por cerramiento (techado / descubierto)
- [ ] 🟡 Ordenar por: Más cercano, Precio más bajo, Mejor valorado (Falta: Más reservado)
- [x] ✅ Filtro por rango de precios (mín/máx inputs)

#### 2.3 Vista de mapa
- [x] ✅ Toggle "Mostrar el mapa" — vista toggle (lista / mapa)
- [x] ✅ Mapa interactivo con pines por complejo (Leaflet)
- [x] ✅ Pines con precio superpuesto (estilo Airbnb/ATC)
- [ ] ❌ Hover en pin → preview card del complejo (se abre al hacer click por default de Leaflet Popup)
- [ ] 🟡 Coordenadas ya existen en la DB (tenants.latitude, tenants.longitude) — hay que poblarlas

#### 2.4 Tarjeta de complejo (TenantCard)
- [x] ✅ Imagen de portada (o fallback con iniciales)
- [x] ✅ Nombre del complejo
- [x] ✅ Ciudad y provincia
- [x] ✅ Badge "Reserva online"
- [x] ✅ Hover con zoom y sombra
- [x] ✅ Precio "Desde $X" superpuesto en la imagen
- [x] ✅ Dirección completa (calle y altura)
- [x] ✅ Píldoras de turnos disponibles directamente en la card
- [x] ✅ Badges de formato (Fútbol 5 / 7 / 11)
- [x] ✅ Badges de superficie (Sintético / Techado)
- [x] ✅ Micro-íconos de servicios (duchas, estacionamiento, bar, wifi)
- [x] ✅ Carrusel de fotos en la card
- [x] ✅ Calificación promedio (⭐ 4.8) y cantidad de reseñas
- [x] ✅ Botón de favorito (❤️) para guardar complejos

#### 2.5 Paginación y UX
- [x] ✅ Paginación con URL-based (offset query param)
- [x] ✅ Skeleton loading mientras cargan los resultados (loading.tsx)
- [x] ✅ Contador de resultados con feedback dinámico al aplicar filtros

### 3. Perfil del Complejo (`/[slug]`)

#### 3.1 Cabecera del complejo
- [x] ✅ Nombre, descripción, logo y cover
- [x] ✅ Dirección + teléfono clickeable
- [x] ✅ Horarios de apertura
- [x] ✅ Galería de fotos del complejo (carrusel / lightbox)
- [x] ✅ Enlace a Google Maps / Waze (abrir dirección en mapa externo)
- [x] ✅ Botón de WhatsApp directo
- [x] ✅ Badges de servicios/amenities del complejo
- [x] ✅ Calificación general y cantidad de reseñas
- [x] ✅ Botón "Compartir" (copiar link/WhatsApp)
- [x] ✅ Botón de favorito (❤️)

#### 3.2 Lista de canchas del complejo
- [x] ✅ Cards individuales por cancha mostrando: nombre, superficie, capacidad, fotos, precio (CourtCard.tsx)
- [ ] ❌ Filtro rápido por tipo de cancha dentro del complejo
- [ ] ❌ Estado de disponibilidad por cancha para el día seleccionado

#### 3.3 Grilla de disponibilidad
- [x] 🟡 Grilla de horarios por día (componente AvailabilityGrid)
- [x] 🟡 Vista semanal completa (`/[slug]/disponibilidad`)
- [x] ✅ Selector de fecha con datepicker visual (no solo parámetro URL)
- [x] ✅ Vista por cancha individual (filtrar grilla por cancha)
- [x] ✅ Indicador de precio en cada slot de la grilla
- [x] ✅ Colores claros para distinguir: disponible / ocupado / turno fijo / bloqueado

#### 3.4 Reseñas y calificaciones
- [x] ✅ Sistema de reseñas de jugadores (ReviewsSection.tsx)
- [x] ✅ Calificación por estrellas (1-5)
- [x] ✅ Texto de reseña
- [x] ✅ Promedio visible en el perfil y en las cards de `/explorar`
- [x] ✅ Tabla DB: reviews (creada e integrada)

### 4. Flujo de Reserva (`/[slug]/reservar`)

- [x] ✅ LoginGate (requiere auth para reservar)
- [x] ✅ Resumen de reserva (BookingSummary)
- [x] ✅ Botón de confirmar (ConfirmBookingButton)
- [x] ✅ Página de éxito post-reserva (`/reserva/[bookingId]/exito`)
- [x] ✅ Página de pago pendiente (`/reserva/[bookingId]/pendiente`)
- [x] ✅ Página de error de reserva (`/reserva/[bookingId]/error`)
- [ ] ❌ Reserva exprés desde la tarjeta de `/explorar`
- [x] ✅ Selección de método de pago visual (iconos de MercadoPago, efectivo, transferencia)
- [x] ✅ Compartir reserva por WhatsApp post-confirmación (BookingSuccessExtras.tsx)
- [x] ✅ Agregar reserva al calendario (.ics download)
- [x] ✅ Pantalla de éxito con mini-mapa (Leaflet)
- [x] ✅ Código QR de la reserva para mostrar en el club

### 5. Área del Jugador (`/mis-reservas`, `/perfil`)

#### 5.1 Mis Reservas
- [x] 🟡 Lista de reservas próximas e historial (con tabs)
- [x] 🟡 Botón de cancelar reserva
- [ ] ❌ Detalle expandible de cada reserva
- [x] ✅ Re-reservar turno pasado con un click ("Reservar de nuevo")
- [x] ✅ Descargar comprobante de reserva (PDF o imagen)
- [x] ✅ Dejar reseña post-partido (LeaveReviewButton.tsx)

#### 5.2 Perfil del jugador
- [x] ✅ Editar nombre, apellido, teléfono, zona preferida
- [x] ✅ Avatar (con fallback de iniciales)
- [x] ✅ Historial de actividad (cantidad de partidos jugados, complejos visitados)
- [x] ✅ Lista de complejos favoritos (❤️)
- [x] ✅ Preferencias de notificación (email, push)
- [x] ✅ Eliminar cuenta (GDPR/Ley 25.326 compliance)

### 6. Social y Comunidad (Diferenciador vs ATC)

> Estas features son las que más engagement generan y las que convierten
> a TurnoGol de "un sistema de reservas" a "una plataforma de fútbol".

- [ ] ❌ **"Falta Uno"** — crear partido abierto donde otros jugadores se puedan sumar
  - [ ] Crear partido desde una reserva existente
  - [ ] Definir cuántos jugadores faltan
  - [ ] Seleccionar restricciones (género, nivel)
  - [ ] Link compartible por WhatsApp / redes
  - [ ] Vista de partidos abiertos en `/explorar` o landing
  - [ ] Unirse a un partido abierto con un click
- [ ] ❌ **Torneos** — inscripción a torneos organizados por complejos
- [ ] ❌ **Comunidades / Grupos** — grupos de jugadores recurrentes

### 7. SEO y Meta Tags

- [x] ✅ sitemap.xml dinámico
- [x] ✅ robots.txt configurado
- [x] ✅ Schema.org structured data (SportsActivityLocation)
- [x] ✅ Open Graph tags dinámicos
- [x] ✅ Twitter Card meta tags
- [x] ✅ ISR en landing (revalidate=300), /explorar (cache de carga inicial) y /[slug] (ISR revalidate=300)
- [x] ✅ Usar next/image en imágenes públicas

### 7b. Dark Mode (diferido a V próxima) 🌙

> La interfaz pública V1 se construye en light mode. El dark mode se difiere
> pero **hay que hacerlo**. Los componentes nuevos se escriben con tokens semánticos
> para facilitar la migración.

- [ ] ❌ Soporte de dark mode en toda la interfaz pública (landing, explorar, perfil, reserva, área jugador)
  - [ ] Definir tokens de color dark en `design-system/MASTER.md` (variantes desaturadas, no inversión directa)
  - [ ] Verificar contraste AA independiente en dark (texto primario ≥4.5:1, secundario ≥3:1)
  - [ ] Toggle de tema (light / dark / system) con persistencia
  - [ ] Auditar todos los componentes públicos nuevos y agregar variantes `dark:`

### 8. Modelo de datos — Campos faltantes para soportar estas features

> Campos que ya existen en la DB pero no se usan en el frontend,
> o campos nuevos que hay que agregar.

- [ ] 🟡 `tenants.latitude` / `tenants.longitude` — existen pero probablemente vacíos → poblar con geocoding
- [x] ✅ `tenants.whatsapp` — existe y se muestra en el perfil público
- [x] ✅ `courts.photos` — se usa en la galería y cards
- [x] ✅ `tenants.amenities` — JSONB e integrado
- [x] ✅ Tabla `reviews`
- [x] ✅ Tabla `player_favorites`
- [x] ✅ Tabla `open_matches`
- [x] ✅ Tabla `open_match_players`

---

## Fase 1 — Infraestructura y Deploy (P0 — BLOCKERS)

> Sin esto no salís a producción. Todo paralelizable entre sí.

- [x] Configurar GitHub Actions CI: typecheck + lint + unit + integration en cada PR
- [ ] Configurar deploy automático a Vercel (Requiere cuenta/plan de producción)
- [ ] Proteger branch `main` (Configuración manual en GitHub Settings)
- [x] Agregar `pnpm audit` como step en CI
- [x] Implementar estrategia de migrations con SQL versionado
- [x] Documentar rollback procedure
- [ ] Configurar Supavisor (Requiere plan Supabase Pro)
- [x] Reducir `max` del pool a 3 para serverless (Configuración de prod)
- [ ] Resolver dónde correr pg-boss workers (Pendiente decisión)
- [ ] Crear proyecto de Supabase staging separado (Requiere plan/creación)

---

## Fase 2 — Seguridad Post-Auditoría (P0/P1)

- [x] Auditar que TODOS los endpoints admin aplican rate limiting `adminCrud` (grep por rutas sin `enforce()`)
- [x] Enriquecer `/api/status` con health checks reales: DB, pg-boss, Upstash, Resend
- [x] Implementar CSP `report-uri` / `report-to` para monitorear violaciones de Content Security Policy
- [x] Documentar el riesgo de CSRF como decisión aceptada o implementar tokens custom para Server Actions
- [x] Implementar `Sec-Fetch-*` header validation en endpoints sensibles (pagos, cancelaciones)

---

## Fase 3 — Resiliencia (P1)

- [x] Cablear circuit breaker (Existe módulo, no cableado en gateway de MP - Diferido post-launch)
- [x] Agregar timeout explícito en `gateway.getPaymentStatus()`
- [x] Agregar advisory lock en `autoCompleteOverdueBookings`
- [x] Implementar health ping periódico a MP, Supabase, Resend
- [x] Alertar vía Sentry cuando rate limiter entra en `unavailable: true` (Upstash caído)

---

## Fase 4 — Performance y Optimización (P1)

- [x] Implementar cache de `getAvailableSlots` en Upstash Redis (TTL 30s, invalidar on booking change)
- [x] Reducir shared bundle: lazy-load Sentry SDK
- [x] Implementar `React.lazy()` + Suspense en rutas admin pesadas
- [x] Agregar `stale-while-revalidate` headers en endpoints públicos
- [x] ✅ Implementar edge caching / ISR (Landing ISR 300s, /[slug] ISR 300s, /explorar Data Cache 300s)

---

## Fase 5 — Observabilidad (P1)

- [x] Activar Sentry Performance (transactions) para medir latencia de API por endpoint
- [x] Implementar métricas de negocio básicas: reservas/día, tasa de no-show, ingresos por tenant
- [ ] Implementar alertas en Sentry.io (Requiere configuración en el dashboard de Sentry.io)
- [x] Crear dashboard de observabilidad (UI con recharts, lazy-loaded, auto-refresh 60s)

---

## Fase 6 — Deuda Técnica (P1)

- [x] Estandarizar formato de error en todos los endpoints a `{error: string, code: string}`
- [x] Agregar output schemas Zod en endpoints críticos (bookings, payments, cash-flows)
- [x] Fijar los 2 tests flaky pre-existentes (truncate/cleanup per-test para hermeticidad)
- [x] Implementar feature flags mínimos (JSON en DB o Upstash): online booking on/off, MP on/off
- [x] Implementar kill switch rápido para suspender un tenant sin redeploy

---

## Fase 7 — Testing Avanzado (P1)

- [ ] Implementar load testing con k6 (Requiere entorno de staging)
- [x] Agregar contract test para MP webhook payload schema
- [x] Test de stress para cancelación concurrente

---

## Fase 8 — Legal y Compliance (P0 legal — en paralelo con todo)

- [ ] Completar DPA template y tener revisión de abogado
- [ ] Inscripción en AAIP (Agencia de Acceso a la Información Pública) — obligatorio por Ley 25.326
- [ ] Evaluar facturación electrónica AFIP (si cobrás SaaS directo a complejos)
- [ ] Redactar términos de servicio B2B (contrato con complejos)
- [ ] Ejecutar backup restore drill al menos 1 vez (doc19 §10.6)
- [ ] Definir RPO/RTO (recomendado: RPO=1h, RTO=4h con Supabase Pro PITR)

---

## Fase 9 — Estrategia de Datos (P1/P2)

- [ ] Implementar CLI o admin API para operaciones de soporte: refund manual, re-procesar webhook, suspender tenant
- [ ] Crear alertas de Supabase cuando el uso de conexiones/storage/bandwidth se acerque al límite del plan

---

## Fase 10 — Deploy a Producción 🚀

> Ejecutar solo cuando todas las Fases 1-8 estén completas.

- [ ] Contratar Supabase Pro
- [ ] Contratar Vercel Pro
- [ ] Deployar worker de pg-boss en servicio dedicado (Railway / Fly.io)
- [ ] Correr `pnpm launch:check` contra entorno de producción
- [ ] Verificar que BYPASSRLS=false en el rol de producción
- [ ] Verificar MP credentials probe contra las credenciales reales
- [ ] Configurar dominio custom + DNS
- [ ] Configurar Sentry project de producción (separado de dev)
- [ ] Primer deploy con 1 complejo piloto (beta cerrada)
- [ ] Monitorear 48-72hs: error rate, latencia, queue depth, bookings exitosos

---

## Post-Producción — Mejoras Competitivas (P2/P3)

> Cuando ya estés facturando y con complejos reales.

- [ ] Integración WhatsApp Business API para confirmaciones y recordatorios
- [ ] Feature "Falta uno" (completar equipo — diferenciador social vs ATC Sports)
- [ ] Soporte multi-deporte (pádel, tenis, hockey — expandir mercado)
- [ ] PWA completa con push notifications (cercano a app nativa sin el costo)
- [ ] Read replica de Supabase para queries de reportes (cuando tengas +50 complejos)
- [ ] Dashboard admin interno (system_admin) con UI completa (cuando tengas +20 complejos)
- [ ] API versioning (`/api/v1/`) — cuando tengas consumidores externos o app mobile
- [ ] App mobile nativa iOS/Android — cuando las métricas demuestren que los usuarios la necesitan
- [ ] Evaluar filmación de partidos + control de acceso físico (si el mercado lo pide)

---

## Post-Producción — UX, UI y Fixes de Usabilidad (P3)

> Mejoras visuales, fixes de experiencia de usuario y bugs reportados por QA interno.
> Prioridad baja respecto a los blockers de infraestructura y producción, ideal para pulir antes o después del primer release.

### Vista Inicio (Onboarding / Auth)
- [x] **Feature**: Mejorar "Progreso de configuración" agregando el paso de "Configurar PIN de seguridad".
- [x] **Bug**: Arreglar crasheo al presionar "Copiar link" que te devuelve al inicio del onboarding.
- [x] **Bug**: Error al iniciar sesión/registrarse: el primer Magic Link suele dar error de link expirado/inválido, pero al solicitar un segundo link funciona correctamente.

### Vista Grilla
- [x] **UX/UI**: Rediseñar la vista de la grilla para que sea más moderna, cómoda y amigable para el uso diario (evitar aspecto de tabla de Excel).

### Vista Reservas
- [x] **UX/UI**: Replantear el diseño de la vista entendiendo que manejarán un buen volumen de reservas por día. Hacerla más funcional y ágil.

### Vista Abonados
- [x] **UX/UI**: En "Nuevo abonado" aprovechar mejor el ancho de la pantalla.
- [x] **Copy/UX**: Aclarar la funcionalidad del "Precio mensual" al crear un abonado (actualmente poco intuitivo).
- [x] **UX general**: Hacer el flujo de creación más amigable para usuarios no técnicos (simplificar palabras y formatos tediosos).

### Vista Caja
- [x] **UX/UI**: Rediseñar completamente para darle un propósito más claro y útil (ej. que sea un buen módulo para manejo de cantina/bar y productos del complejo).
- [x] **Bug**: Solucionar error al agregar movimiento (Error en terminal: `column "client_idempotency_key" of relation "cash_flows" does not exist`).

### Vista Reportes
- [x] **UX**: Agregar "Empty states" (estados vacíos) informativos que expliquen qué se va a ver ahí cuando haya información (actualmente se ve completamente vacío).

### Vista Equipo
- [x] **Feature**: Ampliar el modal "Invitar nuevo admin" con selección de roles/permisos.
- [x] **Bug**: Solucionar que el botón "Enviar invitación" no hace nada ni muestra error al completar los campos.

### Vista Configuración y Copys Generales
- [x] **Bug Lógico**: Corregir que "Requerir seña" aparece tildado por defecto cuando el complejo fue recién creado (sin MP) y debería reflejar "Terminar sin seña".
- [x] **Copy/UX**: Aclarar qué función cumple el toggle de "Reservar online" habilitado o deshabilitado.
- [x] **Copy General**: Auditar y cambiar términos técnicos en toda la app ("Ban", "admin", "no-show") por un lenguaje familiar y de fácil entendimiento para el dueño de un complejo deportivo.

---

## No Hacer (decisiones técnicas conscientes)

> Cosas que parecen necesarias pero NO lo son para TurnoGol en este stage.

- ~~Kubernetes~~ → Supabase + Vercel + 1 worker dedicado escala a miles de usuarios
- ~~Microservicios~~ → Monolito modular con 14 módulos es correcto y más simple de operar
- ~~GraphQL~~ → REST con tipos TypeScript compartidos es suficiente con un solo frontend
- ~~Redis para session store / pub/sub~~ → Supabase Realtime ya te da pub/sub, Upstash para cache puntual
- ~~100% code coverage~~ → 750 tests en flujos críticos > 95% coverage con tests triviales
- ~~Actualizar lucide-react~~ → Tree-shaking funciona, no hay CVE. Tocar = riesgo en 42 archivos sin beneficio
- ~~Mutation testing / visual regression~~ → Diminishing returns. P3 como mínimo