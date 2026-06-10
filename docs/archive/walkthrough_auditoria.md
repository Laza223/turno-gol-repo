# Walkthrough: Auditoría Final de Documentación TurnoGol

## Resumen

Se completó la auditoría y corrección final de toda la suite de documentación de TurnoGol (20 documentos), asegurando la coherencia con la filosofía de producto "ATC versión fútbol" — simple, automatizado, sin funcionalidades complejas.

---

## Cambios Realizados

### 1. Renombrado de Planes SaaS ("Starter/Pro" → "Básico/Estándar")

**Archivos modificados:**
- [doc11_adrs.md](file:///c:/Users/Lazar/Documents/github/TurnoGol/docs/doc11_adrs.md) — ADR-010 (Feature Flags), ADR-009 (tabla de costos), diálogo de upgrade
- [doc13_database_schema.md](file:///c:/Users/Lazar/Documents/github/TurnoGol/docs/doc13_database_schema.md) — Comentarios de seed data en tabla `plans`
- [doc16_testing_strategy.md](file:///c:/Users/Lazar/Documents/github/TurnoGol/docs/doc16_testing_strategy.md) — Test helpers con slugs de plan

**Cambios concretos:**
| Antes | Después |
|---|---|
| `'Starter', 'Pro', 'Full'` | `'Básico', 'Estándar', 'Full'` |
| `'starter', 'pro', 'full'` | `'basico', 'estandar', 'full'` |
| "Actualizá a Pro" | "Actualizá a Estándar" |
| "Plan Pro: hasta 6 canchas / $88.000/mes" | "Plan Estándar: hasta 6 canchas / $55.000/mes" |

> [!NOTE]
> Las referencias a "Starter" en el contexto de **Resend** (servicio de email) se mantuvieron intactas — refieren al plan del servicio externo, NO al plan SaaS de TurnoGol.

---

### 2. Limpieza de WhatsApp en Doc 1 (Problem Brief)

**Archivo:** [doc1_problem_brief.md](file:///c:/Users/Lazar/Documents/github/TurnoGol/docs/doc1_problem_brief.md)

| Línea | Antes | Después |
|---|---|---|
| §4 Razón 2 | "WhatsApp Business API es accesible para startups" | "Email transaccional es confiable y accesible" (reescrita completamente) |
| §5 Hipótesis B2C | "recordatorio por WhatsApp" | "recordatorio por email" |

Las demás referencias a WhatsApp en Doc 1 son **contexto de mercado** (ej: "Dolor A — Gestión caótica por WhatsApp") y se mantuvieron intactas.

---

### 3. Eliminación de `open_matches` / `match_participants` (Doc 12)

**Archivo:** [doc12_tenant_isolation.md](file:///c:/Users/Lazar/Documents/github/TurnoGol/docs/doc12_tenant_isolation.md)

- Removidas 2 tablas de la lista de tablas aisladas (13 → 11)
- Removidas las sentencias `ALTER TABLE`, `CREATE INDEX` y entries en arrays de test
- Removidas referencias a "partidos abiertos" en los diagramas de acceso de staff y jugador
- Actualizado el texto de la regla de acceso a players (ya no menciona `open_matches`)

**Impacto cascada** — también actualizado "13 tablas" → "11 tablas" en:
- [doc11_adrs.md](file:///c:/Users/Lazar/Documents/github/TurnoGol/docs/doc11_adrs.md) (ADR-001)
- [doc14_tech_stack.md](file:///c:/Users/Lazar/Documents/github/TurnoGol/docs/doc14_tech_stack.md) (seguridad)
- [doc16_testing_strategy.md](file:///c:/Users/Lazar/Documents/github/TurnoGol/docs/doc16_testing_strategy.md) (isolation tests, seed data, test map)

---

### 4. Limpieza de WhatsApp en costos y performance (Doc 14, Doc 11)

**Archivos:**
- [doc14_tech_stack.md](file:///c:/Users/Lazar/Documents/github/TurnoGol/docs/doc14_tech_stack.md)
- [doc11_adrs.md](file:///c:/Users/Lazar/Documents/github/TurnoGol/docs/doc11_adrs.md)

| Cambio | Detalle |
|---|---|
| Tablas de costos Year 1 | Removida línea "Meta WA Cloud API" en las 4 tablas de costos ($30-500/mes) |
| Totales actualizados | Ej: $456-866/mes → $206-366/mes con 500 complejos |
| Margen recalculado | 1.5-3% → 0.7-1.3% del MRR (mejor margen sin WA) |
| Performance target | "WA async" → "email async" en la tabla de targets |

---

### 5. Limpieza adicional encontrada durante la auditoría

| Doc | Cambio |
|---|---|
| [doc10_onboarding_design.md](file:///c:/Users/Lazar/Documents/github/TurnoGol/docs/doc10_onboarding_design.md) | "Dueño recibe notificación WA" → "notificación por email"; "WA proactivo" → "Email proactivo" |
| [doc11_adrs.md](file:///c:/Users/Lazar/Documents/github/TurnoGol/docs/doc11_adrs.md) | "partidos abiertos" eliminado de la descripción de la vista del jugador (ADR-008) |
| [doc13_database_schema.md](file:///c:/Users/Lazar/Documents/github/TurnoGol/docs/doc13_database_schema.md) | `"open_matches": true` eliminado del JSONB default de `plans.features` |
| [doc16_testing_strategy.md](file:///c:/Users/Lazar/Documents/github/TurnoGol/docs/doc16_testing_strategy.md) | "TRANSFORMABLES / Madre/hija blocking" → "FEATURE GATES / Plan limits enforcement" en el mapa de testing |

---

## Verificación Cruzada Final (Grep)

| Término buscado | Docs técnicos (5, 7-19) | Estado |
|---|---|---|
| `Starter` (plan SaaS) | 0 refs | ✅ Solo queda como nombre del plan de Resend |
| `starter` (slug SaaS) | 0 refs | ✅ |
| `open_match` | 0 refs | ✅ |
| `match_participants` | 0 refs | ✅ |
| `transformable` | 2 refs | ✅ Ambas son notas de exclusión ("se eliminaron", "sin transformables") |
| `parent_court` | 0 refs | ✅ |
| `madre-hija` | 0 refs | ✅ |
| `Lucas` | 0 refs | ✅ |
| `WhatsApp` (como feature del producto) | 0 refs | ✅ Solo quedan contexto de mercado (docs 1-4) y "Compartir por WA" (share nativo, doc 10) |
| `partidos abiertos` (como feature) | 0 refs | ✅ Solo quedan notas de exclusión (docs 7, 8) |

---

## Referencias WhatsApp que se mantuvieron intencionalmente

### Docs 1-4 (Contexto de mercado)
- Doc 1: "Dolor A — Gestión caótica por WhatsApp" → describe el problema actual, NO un feature
- Doc 2: Competitive teardown menciona WA como feature de la competencia
- Doc 3: Personas mencionan WhatsApp como canal actual de los dueños
- Doc 4: Nota de que WA Business API se evalúa para v1.5

### Doc 10 (Onboarding)
- "Compartir por WhatsApp" → botón de share nativo (usa la API de compartir del browser/telefono), NO requiere WA Business API
- "Se autentican como ya lo hacen con WhatsApp Web" → analogía UX, no feature

---

## Estado final de la documentación (post-Sesión 1)

| Doc | Estado |
|---|---|
| **Doc 1** (Problem Brief) | ✅ Limpio — WA solo en contexto de mercado |
| **Doc 2** (Competitive Teardown) | ✅ WA solo en contexto de competencia |
| **Doc 3** (Personas/JTBD) | ✅ WA solo en contexto de comportamiento actual |
| **Doc 4** (Monetización) | ✅ WA mencionado como evaluación v1.5 |
| **Doc 5** (RNF) | ✅ Limpio |
| **Doc 6** (Entidades) | ✅ `whatsapp` como campo de contacto del complejo + nota de extensibilidad |
| **Doc 7** (Flujos E2E) | ✅ Limpio |
| **Doc 8** (User Stories) | ✅ Limpio — notas de exclusión |
| **Doc 10** (Onboarding) | ✅ Notificaciones corregidas a email, shares nativos mantenidos |
| **Doc 11** (ADRs) | ✅ Planes renombrados, WA eliminado, partidos eliminados |
| **Doc 12** (Tenant Isolation) | ✅ open_matches eliminado, tabla count actualizado |
| **Doc 13** (Database Schema) | ✅ Planes renombrados, open_matches eliminado de features |
| **Doc 14** (Tech Stack) | ✅ WA eliminado de costos, performance corregido |
| **Doc 15** (API Contracts) | ✅ Limpio |
| **Doc 16** (Testing) | ✅ Planes renombrados, transformables reemplazado |
| **Doc 17** (Observabilidad) | ✅ Limpio |
| **Doc 18** (Privacy) | ✅ Limpio |
| **Doc 19** (Runbook) | ✅ Limpio |

---
---

# Sesión 2: Resolución de Bloqueantes Técnicos de Auditoría

**Fecha**: 2026-04-18
**Contexto**: La auditoría original (Opus 4.7, `sintesis_cross_layer.md`) identificó 9 problemas BLOQUEANTES. Las sesiones anteriores resolvieron 5 de ellos (lifecycle, señas, abonados, WhatsApp, Plan sin schema). Esta sesión resolvió los 4 restantes + varios críticos pendientes.

---

## Bloqueantes Resueltos

### B06 — RLS: jugador no puede ver sus propias reservas (RESUELTO)

**Problema**: Las RLS policies en `bookings` solo filtraban por `app.current_tenant_id`. El jugador, que es cross-tenant y no tiene `tenant_id` en su JWT, no podía ver sus propias reservas.

**Solución**: RLS dual con 3 policies en `bookings`:

| Policy | Condición | Quién la usa |
|---|---|---|
| `tenant_isolation_select` | `tenant_id = app.current_tenant_id` | Staff del complejo |
| `player_own_bookings_select` | `player_id = app.current_player_id` | Jugador (cross-tenant) |
| `realtime_tenant_select` | `tenant_id = JWT.app_metadata.tenant_id` | Supabase Realtime |

PostgreSQL evalúa múltiples policies con **OR** — cada usuario matchea su policy sin interferir con las otras.

**Archivos modificados:**
- [doc13_database_schema.md](file:///c:/Users/Lazar/Documents/github/TurnoGol/docs/doc13_database_schema.md) — §3.2 bookings RLS
- [doc12_tenant_isolation.md](file:///c:/Users/Lazar/Documents/github/TurnoGol/docs/doc12_tenant_isolation.md) — §7.3 nota IMPORTANT

---

### B07 — Supabase Realtime cross-tenant (RESUELTO)

**Problema**: Supabase Realtime usa el JWT del cliente para evaluar policies, no `current_setting`. Sin una policy específica para JWT, Realtime no filtraba correctamente.

**Solución**: Tercer policy en bookings que lee `auth.jwt() -> 'app_metadata' ->> 'tenant_id'`. Documentado en doc12 §7.3.

---

### C03 — Credenciales OAuth MP sin schema (RESUELTO)

**Problema**: Doc 4 §7 especifica que las señas se cobran con la cuenta MP del complejo (OAuth), pero la tabla `tenants` en doc13 no tenía dónde guardar esas credenciales.

**Solución**: 5 campos nuevos en `tenants`:

```sql
mp_access_token   TEXT,    -- Token OAuth (encriptado at-rest)
mp_refresh_token  TEXT,    -- Refresh token (encriptado at-rest)
mp_user_id        TEXT,    -- ID de cuenta MP del complejo
mp_public_key     TEXT,    -- Clave pública para checkout frontend
mp_connected_at   TIMESTAMPTZ,
```

**Archivo**: [doc13_database_schema.md](file:///c:/Users/Lazar/Documents/github/TurnoGol/docs/doc13_database_schema.md) — §2.1 tenants

---

### ENUMs unificados a `canceled` (americano, una L)

**Problema**: doc4 §13 declaraba ortografía canónica `canceled` (una L), pero doc13 usaba `cancelled` (doble L) en 4 ENUMs distintos.

| ENUM | Antes | Después |
|---|---|---|
| `booking_status` | `cancelled_refunded`, `cancelled_no_refund` | `canceled_refunded`, `canceled_no_refund` |
| `abonado_status` | `cancelled` | `canceled` |
| `payment_status` | `cancelled` | `canceled` |

**Archivo**: [doc13_database_schema.md](file:///c:/Users/Lazar/Documents/github/TurnoGol/docs/doc13_database_schema.md) — §1 ENUMs

---

### `tenant_status` corregido a 8 estados

**Problema**: doc4 §2 define 8 estados del tenant (la máquina autoritativa), pero doc13 solo tenía 6 en el ENUM (`trial` en vez de `trialing`, faltaban `blocked` y `deleted`).

| Antes (6 estados) | Después (8 estados) |
|---|---|
| `trial` | `trialing` |
| — | `blocked` (nuevo) |
| — | `deleted` (nuevo) |

`subscription_status` también actualizado con `blocked`.

---

## Nuevas Tablas Agregadas

### `player_tenant_relationships` (§3.12)

Registra la relación entre un jugador y cada complejo donde interactuó. Campos: `bookings_count`, `noshow_count`, `last_booking_at`, `data_consent_at`. RLS dual (staff ve por tenant, jugador ve los suyos).

### `daily_cash_closes` (§3.13)

Cierre de caja diario. INMUTABLE post-cierre (sin UPDATE ni DELETE). Correcciones post-cierre se registran como `cash_flows` compensatorios. Campos: `total_income`, `total_expense`, `balance`, `declared_cash`, `diff_amount`.

---

## Nuevos Campos en Tablas Existentes

| Tabla | Campo | Propósito |
|---|---|---|
| `players` | `agreed_to_terms_at` | Declaración jurada +18, timestamp de aceptación |
| `players` | `terms_version` | Versión de los TyC aceptados (ej: `'2026-04'`) |
| `payments` | (índice) `idx_payments_mp_preference` | Búsqueda rápida por webhook de seña |

---

## Nuevas ADRs

### ADR-011: Facturación Electrónica (AFIP) — Fuera de scope v1

- AFIP WSFEv1 requiere certificados, CAEs, lógica impositiva por contribuyente = 2-3 meses de dev
- La obligación fiscal recae en el complejo, no en TurnoGol
- ATC Sports tampoco integra AFIP
- TurnoGol provee audit trail; el complejo factura con su propio sistema
- Revisitar si >20% de clientes lo solicitan

### ADR-012: Verificación de Edad +18 — Declaración jurada digital

- Checkbox en registro: "Soy mayor de 18 años y acepto los TyC"
- `agreed_to_terms_at` + `terms_version` en tabla `players`
- Suficiente legalmente en Argentina; usar fecha de nacimiento aumentaría abandono 15-25%
- Revisitar si la AAIP emite regulación específica

---

## CLAUDE.md Actualizado

| Cambio | Detalle |
|---|---|
| Tablas | 17 → **19 tablas** (12 aisladas + 7 globales) |
| ADRs | 10 → **12 ADRs** |
| WhatsApp | `Meta Cloud API (WhatsApp)` → `Resend (email transaccional)` |
| Multi-tenancy | Documentado RLS dual, `app.current_player_id`, Realtime JWT |
| MP OAuth | Documentadas credenciales OAuth del complejo |
| Nueva sección | **"Convenciones críticas de schema"** con reglas de ENUMs, estados, +18 |

---

## Estado Final Consolidado (post-Sesión 2)

| Doc | Estado |
|---|---|
| **Doc 1** (Problem Brief) | ✅ Limpio |
| **Doc 2** (Competitive Teardown) | ✅ Limpio |
| **Doc 3** (Personas/JTBD) | ✅ Limpio |
| **Doc 4** (Monetización + Lifecycle) | ✅ Autoritativo (8 estados, señas, dunning) |
| **Doc 5** (RNF) | ✅ Limpio |
| **Doc 6** (Entidades) | ✅ Limpio |
| **Doc 7** (Flujos E2E) | ✅ Limpio |
| **Doc 8** (User Stories) | ✅ Limpio |
| **Doc 9** (SaaS Lifecycle) | ⚠️ Deprecado — fusionado en Doc 4 |
| **Doc 10** (Onboarding) | ✅ Limpio |
| **Doc 11** (ADRs) | ✅ 12 ADRs — incluye AFIP + edad |
| **Doc 12** (Tenant Isolation) | ✅ RLS dual documentado (B06 + B07) |
| **Doc 13** (Database Schema) | ✅ 19 tablas, ENUMs unified, MP OAuth, +18, RLS dual |
| **Doc 14** (Tech Stack) | ✅ Limpio |
| **Doc 15** (API Contracts) | ✅ Limpio |
| **Doc 16** (Testing) | ✅ Limpio |
| **Doc 17** (Observabilidad) | ✅ Limpio |
| **Doc 18** (Privacy) | ✅ Limpio |
| **Doc 19** (Runbook) | ✅ Limpio |
| **CLAUDE.md** | ✅ Sincronizado con todos los cambios |

---

## Sesión 3 — Propagación final post-auditoría Opus 4.7 (2026-04-18)

### Contexto

Después de ejecutar una auditoría cruzada con Claude Opus 4.7 (Sesiones A y B), se detectaron ~25 inconsistencias residuales que la Sesión 2 no había propagado a todos los documentos.

### Decisiones tomadas

| # | Decisión | Resolución |
|---|---|---|
| 9 | ¿`consent_records` como tabla nueva? | ❌ No. Usar `players.agreed_to_terms_at` + `terms_version` + `audit_logs`. Tabla dedicada diferida a v1.5. |
| 10 | ¿Staff ilimitado en todos los planes? | ❌ No. Límites por plan: 2 (Básico), 5 (Estándar), ∞ (Full). Matches seed data doc13. |
| 11 | ¿`'anonymized'` en `player_status`? | ✅ Sí. Agregado al ENUM. Semánticamente distinto de `'banned'` (operativo). |
| 12 | ¿Realtime para jugador? | ❌ No en v1. El jugador usa polling/refresh. Notificaciones van por email (ADR-003). |

### Archivos modificados

#### Tier 1 — Runtime breakers

| Archivo | Fix |
|---|---|
| **doc13** | `DEFAULT 'trial'` → `'trialing'`, columns `cancelled_*` → `canceled_*`, COMMENT fixed, `tenant_subscriptions.cancelled_at` → `canceled_at`, `player_status` += `'anonymized'` |
| **doc7** | 26 ocurrencias de `cancelled` → `canceled`, `trial` → `trialing` en Flujo 1 |
| **doc8** | 7 ocurrencias de `cancelled` → `canceled` en user stories CAN-001/002/003 |
| **doc15** | `cancelled_*` → `canceled_*` en API responses, `"pro"` → `"estandar"` en 3 endpoints |
| **doc17** | `cancelled` → `canceled` en 3 eventos, `trial` → `trialing`, `wa/email` → `email`, `pro` → `estandar` |
| **doc19** | `cancelled_*` → `canceled_*` en script de emergencia |
| **doc5** | `booking.cancelled` → `booking.canceled` en audit_logs example |
| **doc4** | `subscription.cancelled` → `subscription.canceled`, staff `Ilimitado` → `2/5/∞` |
| **doc11** | `booking_cancelled` → `booking_canceled` template, `Booking cancelled` → `Booking canceled` Realtime event |

#### Tier 2 — Propagation

| Archivo | Fix |
|---|---|
| **doc12** | +`daily_cash_closes` a aisladas (12 total), +`player_tenant_relationships` a globales (7 total), middleware `SET LOCAL app.current_player_id`, `trial` → `trialing` en 2 queries, ISOLATED_TABLES array actualizado |
| **doc16** | ISOLATED_TABLES += `daily_cash_closes`, TRUNCATE += 3 tablas, `'pro'` → `'estandar'`, `'trial'` → `'trialing'`, email duplicate removed, tabla count 11→12 |

#### Tier 3 — Design decisions

| Archivo | Fix |
|---|---|
| **doc18** | `consent_records` interface → comentario usando `players.agreed_to_terms_at` + `audit_logs`, `status = 'banned'` → `'anonymized'` en script ARCO, checklist actualizado |
| **CLAUDE.md** | Plan names, `player_status` con `anonymized`, consent v1 pattern, staff limits, Realtime scope, column naming convention, middleware dual SET LOCAL |

### Verificación

Grep final repo-wide:
- `cancelled` en docs/: **0** (excepto la regla de doc4 §13 que dice "No usar cancelled")
- `= 'trial'` en docs/: **0**
- `slug.*pro` en docs/: **0**
- `consent_records` como tabla: **0** (solo referencia futura en doc18)

---

## Estado Final Consolidado (post-Sesión 3)

| Doc | Estado |
|---|---|
| **Doc 1** (Problem Brief) | ✅ Limpio |
| **Doc 2** (Competitive Teardown) | ✅ Limpio |
| **Doc 3** (Personas/JTBD) | ✅ Limpio |
| **Doc 4** (Monetización + Lifecycle) | ✅ Staff limits corregidos, webhook event fix |
| **Doc 5** (RNF) | ✅ audit_logs action fix |
| **Doc 6** (Entidades) | ✅ Limpio |
| **Doc 7** (Flujos E2E) | ✅ 26 cancelled→canceled, trial→trialing |
| **Doc 8** (User Stories) | ✅ 7 cancelled→canceled |
| **Doc 9** (SaaS Lifecycle) | ⚠️ Deprecado — fusionado en Doc 4 |
| **Doc 10** (Onboarding) | ✅ Limpio |
| **Doc 11** (ADRs) | ✅ Template + Realtime event fixes |
| **Doc 12** (Tenant Isolation) | ✅ 12+7 tablas, middleware dual, trial fix |
| **Doc 13** (Database Schema) | ✅ Columns, COMMENT, subscription, player_status |
| **Doc 14** (Tech Stack) | ✅ Limpio |
| **Doc 15** (API Contracts) | ✅ cancelled→canceled, pro→estandar |
| **Doc 16** (Testing) | ✅ TRUNCATE, ISOLATED_TABLES, trial, pro fix |
| **Doc 17** (Observabilidad) | ✅ Events, metrics, channel, trial fix |
| **Doc 18** (Privacy) | ✅ consent→players fields, ARCO anonymized |
| **Doc 19** (Runbook) | ✅ Emergency script fix |
| **CLAUDE.md** | ✅ Fully synced |

> [!IMPORTANT]
> **Todos los hallazgos de la auditoría Opus 4.7 (Sesiones A + B) están resueltos.**
> La documentación está completamente alineada y lista para iniciar implementación.
