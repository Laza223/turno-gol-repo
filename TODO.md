# TurnoGol — TODO General

> Tareas pendientes del proyecto. Se van tachando (`[x]`) a medida que se completen.
> Organizadas por fase del proyecto. Empezar después de completar las 26 fases de auditoría.

---

## Fase 0 — Terminar Auditoría (en curso)

- [ ] Completar F5 — Admin Reportes + Settings + Abonados + Staff
- [ ] Completar F6 — Public Landing + Search + Portal Complejo + SEO
- [ ] Completar F7 — Booking Flow Jugador End-to-End (flujo de conversión = $$$)
- [ ] Completar F8 — Player Area (mis reservas, cancelar, perfil, eliminar cuenta)
- [ ] Completar F9 — Notificaciones (Toast + Push Web)
- [ ] Completar F10 — Responsive / Mobile (admin usa celular para gestionar)
- [ ] Completar F11 — Accessibility (WCAG 2.1 AA)
- [ ] Completar F12 — Performance / Core Web Vitals (LCP < 2.5s, grilla actual 3.8s)
- [ ] Completar F13 — Cross-Browser + Cross-Device
- [ ] Completar F14 — E2E Coverage Final + CI gate

---

## 🏟️ Interfaz Pública — Estilo ATC Sports (PRIORIDAD MÁXIMA)

> Todo lo que ATC Sports tiene en su portal público (B2C) y que TurnoGol
> necesita implementar o mejorar para competir al mismo nivel.
> Estado: ✅ Existe | 🟡 Parcial/Básico | ❌ No existe
>
> **Nota de diseño (V1):** La interfaz pública se construye **solo en light mode**
> (coherente con `design-system/MASTER.md §11`). El **dark mode queda diferido a una
> versión próxima** — hay que implementarlo también. Ver "Dark Mode (diferido)" más abajo.

### 1. Landing Page (`/`)

- [x] ✅ Hero con headline, CTA y fondo visual
- [x] ✅ Sección de features del producto
- [x] ✅ Stats sociales (+10.000 turnos, 50+ complejos, etc.)
- [x] ✅ Testimonios de complejos reales
- [x] ✅ Footer institucional
- [ ] ❌ Buscador inteligente embebido en el hero (Localidad + Fecha + Hora + Deporte) — ATC lo tiene como pieza central
- [ ] ❌ Detección automática de ubicación del usuario (geolocalización) para pre-llenar la ciudad
- [ ] ❌ Sección "Complejos destacados cerca tuyo" — cards de complejos populares en la landing
- [ ] ❌ Sección "Partidos abiertos" / "Falta uno" en la landing — vitrina social
- [ ] ❌ App download banners (links a App Store / Google Play cuando tengas PWA/App)

### 2. Buscador y Exploración (`/explorar`)

#### 2.1 Buscador principal (cabecera)
- [x] 🟡 Input de texto por nombre de complejo (básico, solo texto libre)
- [x] 🟡 Filtro por ciudad (select simple con conteo)
- [x] 🟡 Filtro "Reserva online" (checkbox)
- [ ] ❌ Buscador estructurado estilo ATC: Localidad + Deporte + Fecha + Hora en una sola barra
- [ ] ❌ Selector de fecha (datepicker) integrado en la barra de búsqueda
- [ ] ❌ Selector de hora preferida integrado en la barra de búsqueda
- [ ] ❌ Búsqueda por disponibilidad real (cruzar agendas de todos los complejos y mostrar solo los que tengan turnos libres a esa hora)
- [ ] ❌ Autocompletado predictivo de localidad/complejo
- [ ] ❌ Geolocalización para ordenar por cercanía

#### 2.2 Filtros avanzados (barra secundaria)
- [ ] ❌ Filtro por tipo de superficie (sintético, natural, cemento, indoor) — dato ya existe en `courts.surfaceType`
- [ ] ❌ Filtro por duración del turno (60 min / 120 min) — dato ya existe en `courts.pricing.rules`
- [ ] ❌ Filtro por formato de cancha (Fútbol 5 / 7 / 11) — derivable de `courts.capacity`
- [ ] ❌ Filtro por servicios del club (duchas, estacionamiento, bar, parrilla, vestuario)
- [ ] ❌ Filtro por cerramiento (techado / descubierto)
- [ ] ❌ Ordenar por: Más cercano, Precio más bajo, Mejor valorado, Más reservado
- [ ] ❌ Filtro por rango de precios (slider $min — $max)

#### 2.3 Vista de mapa
- [ ] ❌ Toggle "Mostrar el mapa" — vista split (lista + mapa) o mapa completo
- [ ] ❌ Mapa interactivo con pines por complejo (Google Maps / Mapbox / Leaflet)
- [ ] ❌ Pines con precio superpuesto (estilo Airbnb/ATC)
- [ ] ❌ Hover en pin → preview card del complejo
- [ ] ❌ Coordenadas ya existen en la DB (`tenants.latitude`, `tenants.longitude`) — hay que poblarlas

#### 2.4 Tarjeta de complejo (TenantCard)
- [x] 🟡 Imagen de portada (o fallback con iniciales)
- [x] 🟡 Nombre del complejo
- [x] 🟡 Ciudad y provincia
- [x] 🟡 Badge "Reserva online"
- [x] 🟡 Hover con zoom y sombra
- [ ] ❌ Precio "Desde $X" superpuesto en la imagen — requiere JOIN con `courts.pricing` en `search.service.ts`
- [ ] ❌ Dirección completa (calle y altura) — dato ya existe en `tenants.address`
- [ ] ❌ Píldoras de turnos disponibles directamente en la card (ej: `16:00` · `17:00` · `18:00`) — requiere consulta de disponibilidad por complejo
- [ ] ❌ Badges de formato (Fútbol 5 / 7 / 11) — derivable de canchas del complejo
- [ ] ❌ Badges de superficie (Sintético / Techado) — dato ya existe
- [ ] ❌ Micro-íconos de servicios (duchas, estacionamiento, bar, wifi)
- [ ] ❌ Carrusel de fotos en la card (si el complejo tiene varias) — `courts.photos` ya es array en DB
- [ ] ❌ Calificación promedio (⭐ 4.8) — requiere sistema de reviews (ver sección 6)
- [ ] ❌ Botón de favorito (❤️) para guardar complejos

#### 2.5 Paginación y UX
- [x] 🟡 Paginación "Ver más" (offset manual)
- [ ] ❌ Infinite scroll o paginación con URL-based (mejor UX + SEO)
- [ ] ❌ Skeleton loading mientras cargan los resultados
- [ ] ❌ Contador de resultados con feedback dinámico al aplicar filtros

### 3. Perfil del Complejo (`/[slug]`)

#### 3.1 Cabecera del complejo
- [x] 🟡 Nombre, descripción, logo y cover
- [x] 🟡 Dirección + teléfono clickeable
- [x] 🟡 Horarios de apertura
- [ ] ❌ Galería de fotos del complejo (carrusel o lightbox con todas las fotos de las canchas)
- [ ] ❌ Enlace a Google Maps / Waze (abrir dirección en mapa externo)
- [ ] ❌ Botón de WhatsApp directo (`tenant.whatsapp` ya existe en DB)
- [ ] ❌ Badges de servicios/amenities del complejo
- [ ] ❌ Calificación general y cantidad de reseñas
- [ ] ❌ Botón "Compartir" (copiar link, WhatsApp, redes sociales)
- [ ] ❌ Botón de favorito (❤️)

#### 3.2 Lista de canchas del complejo
- [ ] ❌ Cards individuales por cancha mostrando: nombre, superficie, capacidad (formato), fotos, precio
- [ ] ❌ Filtro rápido por tipo de cancha dentro del complejo
- [ ] ❌ Estado de disponibilidad por cancha para el día seleccionado

#### 3.3 Grilla de disponibilidad
- [x] 🟡 Grilla de horarios por día (componente AvailabilityGrid)
- [x] 🟡 Vista semanal completa (`/[slug]/disponibilidad`)
- [ ] ❌ Selector de fecha con datepicker visual (no solo parámetro URL)
- [ ] ❌ Vista por cancha individual (filtrar grilla por cancha)
- [ ] ❌ Indicador de precio en cada slot de la grilla
- [ ] ❌ Colores claros para distinguir: disponible / ocupado / turno fijo / bloqueado

#### 3.4 Reseñas y calificaciones
- [ ] ❌ Sistema de reseñas de jugadores (solo post-reserva completada)
- [ ] ❌ Calificación por estrellas (1-5)
- [ ] ❌ Texto de reseña con moderación básica
- [ ] ❌ Promedio visible en el perfil y en las cards de `/explorar`
- [ ] ❌ Tabla DB: `reviews` (player_id, tenant_id, booking_id, rating, comment, created_at)

### 4. Flujo de Reserva (`/[slug]/reservar`)

- [x] ✅ LoginGate (requiere auth para reservar)
- [x] ✅ Resumen de reserva (BookingSummary)
- [x] ✅ Botón de confirmar (ConfirmBookingButton)
- [x] ✅ Página de éxito post-reserva (`/reserva/[bookingId]/exito`)
- [x] ✅ Página de pago pendiente (`/reserva/[bookingId]/pendiente`)
- [x] ✅ Página de error de reserva (`/reserva/[bookingId]/error`)
- [ ] ❌ Reserva exprés desde la tarjeta de `/explorar` (click en píldora de horario → directo a confirmar)
- [ ] ❌ Selección de método de pago visual (iconos de MercadoPago, efectivo, transferencia)
- [ ] ❌ Compartir reserva por WhatsApp post-confirmación ("¡Reservé una cancha! Venite")
- [ ] ❌ Agregar reserva al calendario (Google Calendar / iCal) con un click
- [ ] ❌ Pantalla de éxito con mapa de cómo llegar al complejo
- [ ] ❌ Código QR de la reserva para mostrar en el club

### 5. Área del Jugador (`/mis-reservas`, `/perfil`)

#### 5.1 Mis Reservas
- [x] 🟡 Lista de reservas próximas e historial (con tabs)
- [x] 🟡 Botón de cancelar reserva
- [ ] ❌ Detalle expandible de cada reserva (mapa, datos del complejo, comprobante de pago)
- [ ] ❌ Re-reservar turno pasado con un click ("Reservar de nuevo")
- [ ] ❌ Descargar comprobante de reserva (PDF o imagen)
- [ ] ❌ Dejar reseña post-partido (solo si `status = completed`)

#### 5.2 Perfil del jugador
- [x] ✅ Editar nombre, apellido, teléfono, zona preferida
- [x] ✅ Avatar (con fallback de iniciales)
- [ ] ❌ Historial de actividad (cantidad de partidos jugados, complejos visitados)
- [ ] ❌ Lista de complejos favoritos (❤️)
- [ ] ❌ Preferencias de notificación (email, push)
- [ ] ❌ Eliminar cuenta (GDPR/Ley 25.326 compliance)

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

### 7. SEO y Meta Tags (actualmente inexistente)

- [ ] ❌ `sitemap.xml` dinámico con todas las URLs públicas
- [ ] ❌ `robots.txt` configurado para buscadores
- [ ] ❌ Schema.org structured data (LocalBusiness + SportsActivityLocation)
- [ ] ❌ Open Graph tags dinámicos por complejo (`/[slug]`) para preview en WhatsApp/redes
- [ ] ❌ Twitter Card meta tags
- [ ] ❌ ISR (Incremental Static Regeneration) en rutas públicas en vez de `force-dynamic`
- [ ] ❌ Usar `next/image` en todas las imágenes públicas (actualmente usa `<img>`)

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
- [ ] 🟡 `tenants.whatsapp` — existe pero no se muestra en el perfil público
- [ ] 🟡 `courts.photos` — existe como array pero no se usa en la UI pública
- [ ] ❌ `tenants.amenities` — JSONB nuevo: `{duchas, estacionamiento, bar, parrilla, vestuario, wifi, techado, iluminacion}`
- [ ] ❌ Tabla `reviews` — rating + comment por jugador post-partido
- [ ] ❌ Tabla `player_favorites` — complejos favoritos del jugador
- [ ] ❌ Tabla `open_matches` — partidos abiertos ("Falta Uno")
- [ ] ❌ Tabla `open_match_players` — jugadores anotados a cada partido abierto

---

## Fase 1 — Infraestructura y Deploy (P0 — BLOCKERS)

> Sin esto no salís a producción. Todo paralelizable entre sí.

- [ ] Configurar GitHub Actions CI: typecheck + lint + unit + integration en cada PR
- [ ] Configurar deploy automático a Vercel con preview por PR
- [ ] Proteger branch `main` (no push directo, solo merge via PR con CI verde)
- [ ] Agregar `pnpm audit` como step en CI (detectar dependencias vulnerables)
- [ ] Implementar estrategia de migrations con SQL versionado (reemplazar `push:pg` para producción)
- [ ] Documentar rollback procedure (Vercel revert + migración reversa)
- [ ] Configurar Supavisor (connection pooler de Supabase Pro) como DATABASE_URL de producción
- [ ] Reducir `max` del pool de postgres a 3 para serverless, mantener 10 solo para worker pg-boss
- [ ] Resolver dónde correr pg-boss workers (Railway / Fly.io / VPS — NO puede ser Vercel serverless)
- [ ] Crear proyecto de Supabase staging separado

---

## Fase 2 — Seguridad Post-Auditoría (P0/P1)

- [ ] Auditar que TODOS los endpoints admin aplican rate limiting `adminCrud` (grep por rutas sin `enforce()`)
- [ ] Enriquecer `/api/status` con health checks reales: DB, pg-boss, Upstash, Resend
- [ ] Implementar CSP `report-uri` / `report-to` para monitorear violaciones de Content Security Policy
- [ ] Documentar el riesgo de CSRF como decisión aceptada o implementar tokens custom para Server Actions
- [ ] Implementar `Sec-Fetch-*` header validation en endpoints sensibles (pagos, cancelaciones)

---

## Fase 3 — Resiliencia (P1)

- [ ] Cablear circuit breaker al gateway de MercadoPago (Decidido: Opción A - Error inmediato "Pagos temporalmente no disponibles" cuando el breaker esté abierto. Diferido a post-launch)
- [ ] Agregar timeout explícito en `gateway.getPaymentStatus()` (no heredar default del SDK)
- [ ] Agregar advisory lock en `autoCompleteOverdueBookings` para prevenir ejecución paralela del cron
- [ ] Implementar health ping periódico a MP, Supabase, Resend (cron cada 5min → alertar si falla)
- [ ] Alertar vía Sentry cuando rate limiter entra en `unavailable: true` (Upstash caído)

---

## Fase 4 — Performance y Optimización (P1)

- [ ] Implementar cache de `getAvailableSlots` en Upstash Redis (TTL 30s, invalidar on booking change)
- [ ] Reducir shared bundle: lazy-load Sentry SDK, split `@sentry/nextjs` (blocker de LCP < 2.5s)
- [ ] Implementar `React.lazy()` + Suspense en rutas admin pesadas (ej: `/staff` a 190KB)
- [ ] Agregar `stale-while-revalidate` headers en endpoints públicos de disponibilidad
- [ ] Implementar edge caching en rutas públicas de exploración (`/explorar`, `[slug]`)

---

## Fase 5 — Observabilidad (P1)

- [ ] Activar Sentry Performance (transactions) para medir latencia de API por endpoint
- [ ] Implementar métricas de negocio básicas: reservas/día, tasa de no-show, ingresos por tenant
- [ ] Implementar alertas: error rate > 5%, latencia P95 > 2s, queue depth > 100
- [ ] Crear dashboard con: error rate, latencia P50/P95, queue depth de pg-boss

---

## Fase 6 — Deuda Técnica (P1)

- [ ] Estandarizar formato de error en todos los endpoints a `{error: string, code: string}`
- [ ] Agregar output schemas Zod en endpoints críticos (bookings, payments, cash-flows)
- [ ] Fijar los 2 tests flaky pre-existentes (truncate/cleanup per-test para hermeticidad)
- [ ] Implementar feature flags mínimos (JSON en DB o Upstash): online booking on/off, MP on/off
- [ ] Implementar kill switch rápido para suspender un tenant sin redeploy

---

## Fase 7 — Testing Avanzado (P1)

- [ ] Implementar load testing con k6: simular 100-500 usuarios concurrentes reservando
- [ ] Agregar contract test para MP webhook payload schema (detectar cambios en API de MP)
- [ ] Test de stress para cancelación concurrente (admin + player + expiry simultáneos)

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

## No Hacer (decisiones técnicas conscientes)

> Cosas que parecen necesarias pero NO lo son para TurnoGol en este stage.

- ~~Kubernetes~~ → Supabase + Vercel + 1 worker dedicado escala a miles de usuarios
- ~~Microservicios~~ → Monolito modular con 14 módulos es correcto y más simple de operar
- ~~GraphQL~~ → REST con tipos TypeScript compartidos es suficiente con un solo frontend
- ~~Redis para session store / pub/sub~~ → Supabase Realtime ya te da pub/sub, Upstash para cache puntual
- ~~100% code coverage~~ → 750 tests en flujos críticos > 95% coverage con tests triviales
- ~~Actualizar lucide-react~~ → Tree-shaking funciona, no hay CVE. Tocar = riesgo en 42 archivos sin beneficio
- ~~Mutation testing / visual regression~~ → Diminishing returns. P3 como mínimo