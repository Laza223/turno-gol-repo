# TurnoGol — Resumen de Trabajo (Junio 10-12, 2026)

> Registro completo de lo implementado durante las sesiones intensivas con Claude Code (Fable 5)
> y Antigravity (Gemini). Organizado temáticamente para contexto futuro.

---

## 📊 Números Totales

| Métrica | Valor |
|---|---|
| Commits en `dev` | ~90 |
| Líneas de código nuevo | ~12,000+ |
| Tests nuevos | ~240+ |
| Migraciones SQL | 023, 024, 025, 026 |
| Archivos nuevos creados | ~50+ |
| Tareas del TODO tachadas | ~35+ |

---

## Bloque 1 — Fixes de Auditoría (Lotes 1-6)

> Pre-existentes del QA funcional. Numerados con issues (#50-#89).
> Todos mergeados a `main` via PRs.

### Lote 4 (High Priority)
| Commit | Fix |
|---|---|
| `101c829` | #50 — Tabla de movimientos de caja con overflow-x-auto |
| `2647796` | #51 — Modal de reserva con max-h y scroll |
| `f34cbb7` | #52/#53 — Validación de monto de pago + refund LIKE→exact |
| `b2eb9df` | #54 — Selector de filtro por estado en abonados |
| `e03f2b5` | #55 — Idempotency key en createCashFlow |
| `42a3c90` | #56 — Timeout 2s en redirectIfTenantSuspended |
| `3ebbe39` | #57 — Advertencia de reservas futuras al eliminar cuenta |
| `30a56c7` | #58 — No abrir ConfirmDialog si getCourtDeactivationImpactAction falla |
| `a35edd0` | #59 — Capturar en Sentry errores silenciosos de loadCities/Featured/OpenMatches |
| `ccf3035` | #60 — Redirigir a /error si webhook falla en mockPay |

### Bug BK-05 (Cierre de Caja)
| Commit | Fix |
|---|---|
| `848acf0` | Derivar fecha de cierre server-side, rechazar fechas futuras |

### Lote 5 (High Priority)
| Commit | Fix |
|---|---|
| `e3c624a` | #61 — Registrar exportación ARCO via Sentry |
| `7623622` | #62 — dateStr rechaza fechas imposibles |
| `c205877` | #63 — Backoff exponencial en PaymentStatusWatcher |
| `731f61f` | #64 — Bloquear acceso a tenants blocked/churned/canceled/deleted |
| `7d40018` | #65 — Centralizar CURRENT_TERMS_VERSION |
| `a148f90` | BK-06 — Mockear checkPinSessionAction en tests de staff |
| `13b0f63` | #66 — Alertar en Sentry booking no encontrado en late-payment |
| `5180a7c` | #67 — Conectar setPinAction a useFormState |
| `0d8357f` | #68/#69 — aria-pressed en botones duración + aria-live en banner offline |

### Security Fixes
| Commit | Fix |
|---|---|
| `9e2c439` | #70 — Registrar intentos de PIN en audit_logs |
| `8538bb8` | #71 — Re-verificar cookie PIN al recuperar foco |
| `1f36ba7` | #72/#73 — Guard NODE_ENV en mockPay/mockReject |
| `16ffaa9` | #75 — /mock-mp en robots.txt disallow + noindex |

### Lote 6 (Low Priority)
| Commit | Fix |
|---|---|
| `7e1fc17` | #76 — Reemplazar `<tr><td>` inválido por createPortal |
| `2bade6c` | #77 — Saludo sin coma cuando firstName vacío |
| `f9db0b6` | #78/#79 — Filtrar fechas pasadas + validar calendario |
| `f633460` | #82/#83 — Validar motivo ≥3 chars + formato ARS |
| `3d74341` | #84 — PlayerAlreadyAnonymizedError redirige con sign-out |
| `032630f` | #85/#86 — minPrice≤maxPrice + initialFavorited persistente |
| `c01d483` | #87/#89 — City homónimas en HeroSearch + copy error login |

---

## Bloque 2 — Fixes Técnicos Críticos (pre-features)

> Fixes que bloqueaban funcionalidad core. Commiteados directamente en `dev`.

| Commit | Problema | Solución |
|---|---|---|
| `52c6e50` | `client_idempotency_key` no existía en cash_flows | Migración 023: columna + partial unique index + `ON CONFLICT` con `WHERE` matching |
| `65b3b4e` | "Requerir seña" defaulteaba a `true` sin MP | `DEFAULT_SETTINGS.requires_deposit = false` en tenant.service.ts |
| `0c19f23` | Botón "Enviar invitación" no hacía nada | Reescribir InviteStaffDialog con `useFormState` + `useFormStatus` |
| `16edd47` | Magic Link PKCE fallback + crash Copiar link + pool max + health ping | 4 fixes en 1 commit: `token_hash` fallback, try-catch clipboard, pool max=3, health ping en ALL_QUEUES |

---

## Bloque 3 — Interfaz Pública B2C (Frente 1 completo)

> 6 prompts ejecutados con Fable 5 en modo `high`. Todo commiteado en `dev`.

### Prompt 1.1 — Geolocalización + Autocomplete
| Commits | Archivos | Tests |
|---|---|---|
| `f303339` | Combobox, useNearestCity, SearchBar refactor | 44 |

**Qué se hizo:**
- Componente `Combobox` reutilizable accesible (ARIA combobox pattern).
- Hook `useNearestCity` con Haversine distance para auto-detectar ciudad.
- SearchBar pre-llena la ciudad desde geolocalización del browser.
- Derivación de opción desde URL params para evitar "Ushuaia||Tierra del Fuego" stale.

### Prompt 1.2 — Búsqueda por Disponibilidad Real
| Commits | Archivos | Tests |
|---|---|---|
| `b6e696f`, `94fd535` | 14 archivos, +1329 líneas | 64 |

**Qué se hizo:**
- `availability-search.service.ts`: query SQL eficiente cross-tenant (anti-join, sin N+1).
- `/api/public/search` acepta `date` + `time` opcionales (Zod in/out).
- Cache Upstash TTL 30s con tracking set por fecha, invalidado desde `invalidateCourtDateSlots`.
- `/explorar` filtra por disponibilidad cuando hay fecha+hora en URL.
- Performance: 27.5ms con 50 tenants (target: <500ms).

### Prompt 1.3 — Grilla de Disponibilidad Mejorada
| Commits | Archivos | Tests |
|---|---|---|
| `3cec08c`, `a256e62`, `e0b5f20`, `b354861` | 4 archivos, +348 líneas | 7 |

**Qué se hizo:**
- Colores semánticos: libre (verde), ocupado (gris), turno fijo (azul), bloqueado (rojo), pasado (neutro).
- Datepicker nativo invisible sobre label + sync con `?date=` vía `replaceState`.
- Filtro por cancha con pills scrolleables "Todas + una por cancha".
- Precio visible en cada slot futuro (libre → "Reservar", ocupado → precio pagado).

### Prompt 1.4 — Carrusel + Píldoras en TenantCard
| Commits | Archivos | Tests |
|---|---|---|
| `125f3e2`, `81deb15` | 8 archivos, +636 líneas | 14 |

**Qué se hizo:**
- `TenantCardCarousel`: CSS scroll-snap, máx 5 slides, "+N" si hay más, next/image lazy.
- `findFreeSlotPillsByTenant`: hasta 3 píldoras de turnos libres con cancha asignada.
- Píldoras clickeables llevan directo a `/[slug]/reservar?court=X&date=Y&time=Z&dur=W`.
- Solo se muestran con búsqueda fecha+hora; sin búsqueda la card queda idéntica.

### Prompt 1.5 — Pago Visual + QR + Comprobante PDF
| Commits | Archivos | Tests |
|---|---|---|
| `830fc96`, `e3007c5`, `038bf89` | 20 archivos, +717 líneas | 14 |

**Qué se hizo:**
- `PaymentMethodSelector`: cards con radios (MP celeste, Efectivo verde, Transferencia azul).
- Persiste `payment_method` en `bookings` (antes era null).
- `BookingQR`: SVG puro generado con `uqr` (~3KB). QR codifica `/reserva/{id}/verificar`.
- **Página `/reserva/{id}/verificar` nueva**: estado real de la reserva sin auth (UUID = capability token), sin PII.
- Comprobante vía `window.print()` + `@media print` con QR incluido.

### Prompt 1.6 — Área del Jugador
| Commits | Archivos | Tests |
|---|---|---|
| `40ee900`, `a628c4c`, `ebb1563` | 15 archivos, +804 líneas | 17 |

**Qué se hizo:**
- `/perfil` con tabs server-side: Favoritos, Actividad, Avisos.
- Favoritos reutiliza `TenantCard`, filtra suspendidos, orden último primero.
- Actividad: partidos jugados, complejos visitados, racha semanal (SQL aggregation, sin tabla nueva).
- Preferencias de notificación (email + push) con optimistic switches.
- **Migración 024**: `players.notify_email` / `players.notify_push`.
- Worker `booking-reminder` respeta `notify_email = false`.

---

## Bloque 4 — Panel Admin UX/UI (Frente 3 completo)

> 5 prompts ejecutados con Fable 5 modo `high`. Todo commiteado en `dev`.

### Prompt 3.1 — Rediseño Grilla Admin
| Commits | Archivos | Tests |
|---|---|---|
| `29c909f`, `fb1ad49`, `3cf4964`, `de49a88` | 13 archivos, +957 líneas | 19 |

**Qué se hizo:**
- Tabla → CSS Grid timeline con posicionamiento explícito (reservas multi-hora ocupan N filas via span).
- Popover de detalle al hover/focus: quién reservó, método pago, estado seña con monto.
- Tira semanal sticky con píldoras lun-dom, hoy resaltado, navegación ±7 días.
- Colores semánticos AA (14 pares verificados numéricamente).
- Navegación por teclado entre slots (salta filas cubiertas).
- Fix axe: región scrolleable con `tabIndex=0` cuando todos los slots son pasados.
- Variantes `dark:` preparadas para futuro dark mode.

### Prompt 3.2 — Rediseño Vista Reservas
| Commits | Archivos | Tests |
|---|---|---|
| `93a1c6b` → `82b903e` (6 commits) | 13 archivos, +1495 líneas | 28 |

**Qué se hizo:**
- Vista "Hoy" por defecto, agrupada por cancha con horarios ascendentes.
- Filtros con contadores ("Confirmadas (12)", "Pendientes (3)") + búsqueda inline por nombre/UUID.
- Acciones rápidas inline: confirmar pago, completar, marcar ausente (2 pasos), cancelar (con modal por motivo).
- Toggle compacta/detallada (`?vista=compacta`).
- Todo URL-based y compartible.
- `confirmDepositPaymentAction` usa primitiva race-safe compartida con webhook MP.
- **Bug RSC detectado y corregido**: helper en módulo `'use client'` invocado desde Server Component.

### Prompt 3.3 — Empty States + Copy/UX + Abonados
| Commits | Archivos | Tests |
|---|---|---|
| `dc3726f` → `6390368` (7 commits) | 20 archivos, +215 líneas | 7 |

**Qué se hizo:**
- Empty state en Reportes con ilustración SVG inline (mini gráfico de barras).
- Helper text bajo "Reservas online" en Configuración.
- Helper text "Precio mensual" en nuevo abonado.
- Layout 2 columnas desktop en form de nuevo abonado.
- Lenguaje amigable: "slots" → "turnos", "OK/Conflicto" → "Libre/Ocupado", etc.
- **Auditoría exhaustiva de copys**: "ban" → "suspensión", "no-show" → "ausencia", "admin" → "miembro del equipo".
- Excepción documentada: `/terms` intacto (documento legal versionado).

### Prompt 3.4 — Rediseño Caja + Cantina
| Commits | Archivos | Tests |
|---|---|---|
| `3a8e299` → `8beec01` (7 commits) | 27 archivos, +1194 líneas | — |

**Qué se hizo:**
- **Migración 025**: campo `category` + soporte de egresos en cash_flows.
- Resumen del día: ingresos, egresos, saldo neto + comparativa vs ayer y promedio semanal.
- Categorías claras: Reserva, Cantina/Bar, Otro ingreso, Gasto operativo.
- `CanteenQuickSale`: ventas rápidas con productos configurables (JSONB en settings del tenant, TAP-friendly ≥44px).
- Cierre de caja: resumen del día con desglose por categoría, guardado como registro.
- Fix colateral: merge JSONB de settings corrompía el objeto (stringify doble).

### Prompt 3.5 — Roles y Permisos
| Commits | Archivos | Tests |
|---|---|---|
| `e2c606c` → `3c080f0` (4 commits) | 10 archivos, +322 líneas | 25 |

**Qué se hizo:**
- **Migración 026**: enum `staff_role` con `manager` y `read_only` (además de `admin`).
- Modal de invitación con radios de rol (default: Encargado).
- Columna Rol con badge en lista de equipo + dropdown "Cambiar a".
- `requireAdminStaff` guard + `settings/layout.tsx` que redirige a Encargados/Solo lectura.
- Protección anti-lockout: no auto-degradarse + contar admins activos antes de desactivar.
- Enforcement por DB (no JWT) — el claim role queda viejo tras cambio.

---

## Bloque 5 — Optimización y Observabilidad (último)

> 3 tareas ejecutadas en paralelo con Fable 5 UltraCode (sub-agentes).

### ISR Público
| Commit | Archivos |
|---|---|
| `90d6629` | page.tsx de `/[slug]` y `/explorar` |

**Qué se hizo:**
- `/[slug]` → ISR `revalidate=300`, `generateStaticParams` con los 50 complejos más activos.
- Disponibilidad se carga client-side (no estática).
- HTML estático contiene structured data SEO (application/ld+json + OG tags).
- `/explorar` sigue `ƒ` dynamic (limitación Next 14 con searchParams) pero gana Data Cache con `unstable_cache` 300s.
- `/` ya tenía ISR 300s, verificado.

### Dashboard de Observabilidad
| Commits | Archivos |
|---|---|
| `3371138`, `4a3c6c2` | Dashboard nuevo con recharts |

**Qué se hizo:**
- Gráfico de reservas/día (30 días, line chart).
- Tasa de ausencias con tendencia.
- Ingresos por día/semana/mes (bar chart).
- Top 5 horarios más reservados.
- Indicadores de sistema: DB, pg-boss, último health ping.
- `React.lazy` + Suspense → recharts **no** en shared bundle (101 KB en chunk async).
- Auto-refresh cada 60s.
- Usa "ausencias" (no "no-show"), coherente con auditoría de copys.

### Paso PIN en Onboarding
| Commit | Archivos |
|---|---|
| `69e9ea1` | onboarding-checklist.tsx |

**Qué se hizo:**
- Paso "Configurar PIN de seguridad" en el checklist de progreso.
- Pendiente si no hay PIN, completado si ya existe, click lleva a `/settings/pin`.

---

## Migraciones de DB Nuevas

| Migración | Contenido |
|---|---|
| 023 | `client_idempotency_key` en `cash_flows` + partial unique index |
| 024 | `players.notify_email` / `players.notify_push` (defaults true) |
| 025 | `category` en `cash_flows` + soporte de egresos |
| 026 | Enum `staff_role` con `manager` y `read_only` |

---

## Decisiones Técnicas Clave

1. **Disponibilidad cross-tenant sin N+1**: anti-join SQL con `unnest` de pares (tenant_id, slot_end), 2 queries fijas independiente de la cantidad de complejos.
2. **QR como capability token**: el UUID de booking es suficiente para verificar, sin auth ni PII expuesta (Ley 25.326).
3. **Roles por DB, no JWT**: el JWT claim `role` queda stale tras cambio de rol; todos los guards consultan `tenant_staff_members` en cada request.
4. **Cantina sin tabla nueva**: productos configurables en JSONB de settings del tenant (reusar `cash_flows` con categoría).
5. **ISR parcial en /explorar**: Next 14 no soporta ISR con searchParams dinámicos sin PPR (experimental); se usó `unstable_cache` como alternativa.
6. **Caveman activo globalmente**: plugin instalado en scope `user`, reduce tokens de salida ~75% en todas las sesiones de Claude Code.

---

## Estado Final del TODO

### ✅ Completado (todo lo que Claude puede hacer)
- [x] Frente 1 completo (Interfaz Pública B2C) — 6 prompts
- [x] Frente 3 completo (Panel Admin UX/UI) — 5 prompts
- [x] ISR + Dashboard + Onboarding PIN — 3 prompts
- [x] Todos los bugs de auditoría (lotes 1-6) — 40+ fixes
- [x] Fixes técnicos críticos — 4 commits

### ⏳ Pendiente (solo operación/manual/legal)
- [ ] Contratar Supabase Pro + Vercel Pro
- [ ] Deploy automático a Vercel
- [ ] Proteger branch `main`
- [ ] Configurar Supavisor
- [ ] Decidir dónde correr pg-boss workers
- [ ] Crear Supabase staging
- [ ] Configurar alertas en Sentry.io
- [ ] Load testing con k6 (requiere staging)
- [ ] Poblar lat/lng con geocoding (data entry)
- [ ] Legal: DPA, AAIP, AFIP, T&C B2B
- [ ] Backup restore drill
- [ ] Fase 10 completa (deploy a producción)

### ❌ Features nuevas diferidas (post-producción)
- "Falta Uno" (partidos abiertos)
- Torneos / Comunidades
- Dark mode
- PWA completa
- App mobile nativa
- Multi-deporte (pádel, tenis, hockey)
