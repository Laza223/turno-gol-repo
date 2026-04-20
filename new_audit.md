Pasé por cada doc con la mirada puesta específicamente en los *reclamos del walkthrough* para verificar los greps que se atribuye a sí mismo. La Sesión 3 cerró muchas cosas — pero hay varios **half-fixes** (donde se arregló la versión visible pero no la variante buried en una tabla interna) y **contradicciones nuevas** entre el walkthrough/CLAUDE.md y los docs fuente. Los greps de verificación final están bien diseñados pero estrechos: `= 'trial'` no captura `` `trial` `` en backticks sueltos, y las listas de tablas en docs narrativas (no SQL) no matchean el mismo patrón que doc13.

---

## BLOQUEANTES

### [BLOQUEANTE] — Doc 4 §8 "Feature Flags por Plan" sigue diciendo "Ilimitado" para staff en los 3 planes
- **Docs involucrados**: doc4 línea 399 (tabla §8 Feature Flags); doc4 línea 50 (§1 Diferenciadores); doc6 línea 458; CLAUDE.md; walkthrough Sesión 3 decisión #10
- **Inconsistencia**: El walkthrough Sesión 3 decisión #10 dice: *"Límites por plan: 2 (Básico), 5 (Estándar), ∞ (Full). Matches seed data doc13."* Y en el changelog: *"staff `Ilimitado` → `2/5/∞`"*. La corrección se aplicó en doc4 §1 ("Staff del sistema: 2 (Básico), 5 (Estándar), ilimitado (Full)") pero la **tabla de feature flags de §8 sigue intacta**:
  ```
  | Usuarios del sistema (staff) | Ilimitado | Ilimitado | Ilimitado |
  ```
  §8 es la tabla autoritativa que la capa de feature-gate del backend lee para enforzar límites.
- **Impacto**: El middleware `feature-gate` lee §8 como contrato. Nunca va a bloquear al 3er staff en Básico. Un Básico con 50 staff es técnicamente válido según §8. Como bonus: cuando un dev haga code-review contra §1 vs §8 va a no saber cuál creer.
- **Corrección sugerida**: En doc4 §8 reemplazar la fila por `| Usuarios del sistema (staff) | 2 | 5 | Ilimitado |`. Agregar regla: "Si §8 ≠ §1 en cualquier plan, §1 gana por convención." O mejor: mergear en una sola tabla.

### [BLOQUEANTE] — Doc 6 Player entity NO incluye `agreed_to_terms_at` ni `terms_version` (ADR-012)
- **Docs involucrados**: doc6 líneas 381-392 (entidad Player); CLAUDE.md ("players.agreed_to_terms_at + terms_version: declaración jurada +18 (ADR-012)"); doc18 checklist §11; walkthrough Sesión 2 nuevo campo
- **Inconsistencia**: Walkthrough Sesión 2 afirma haber agregado `agreed_to_terms_at` + `terms_version` en `players` (y Sesión 3 decisión #9 reconfirma que este es el pattern de consent v1, en reemplazo de `consent_records`). Doc6 (el glosario de entidades — la fuente de la que deriva doc13) sigue listando Player con solo 10 campos y **no menciona** ninguno de los dos:
  ```
  id, email, phone, first_name, last_name, avatar_url,
  preferred_area, status, created_at, last_login_at
  ```
- **Impacto**: Si doc13 se regenera desde doc6 (cualquier dev que arranque desde el glosario, o un code generator tipo Drizzle-kit introspect), pierde la evidencia legal +18. Además, doc18 §11 checklist dice *"Consentimiento explícito capturado en registro"* — sin los campos, el feature no se puede ni implementar ni auditar.
- **Corrección sugerida**: Agregar en doc6 §5 Player:
  ```
  agreed_to_terms_at    timestamp?   Timestamp de aceptación de TyC y +18 (ADR-012)
  terms_version         string?      Versión de TyC aceptada (ej: '2026-04')
  ```
  Y una nota: "Estos campos NO son NULL al crear Player vía registro del jugador; solo NULL para Players creados por admin (reserva manual)."

### [BLOQUEANTE] — CLAUDE.md lista doc9 como documento vigente con state machine obsoleto
- **Docs involucrados**: CLAUDE.md línea del índice; doc9 (el archivo); walkthrough Sesiones 1/2/3
- **Inconsistencia**: CLAUDE.md dice:
  > `doc9` — Ciclo de vida SaaS (trial → active → past_due → suspended → churned)
  
  Pero doc9 es un **stub de deprecación** ("*este documento fue fusionado con Doc 4*"). Además, los estados listados en CLAUDE.md son **5** (y usan `trial` en vez de `trialing`) cuando los estados autoritativos en doc4 §2 son **8** (`trialing, active, past_due, suspended, blocked, canceled, churned, deleted`). El walkthrough Sesión 3 confirma doc9 deprecado pero CLAUDE.md no fue actualizado.
- **Impacto**: Cuando una nueva sesión de Claude arranque cargando CLAUDE.md, va a ir a doc9 esperando encontrar el lifecycle, va a leer "este documento fue deprecado" y perder tiempo navegando; peor, si ignora la nota de deprecación y toma los 5 estados, termina generando código con un state machine incompleto.
- **Corrección sugerida**: Reemplazar la línea por:
  ```
  - `doc9` — DEPRECADO. Lifecycle SaaS unificado en doc4.
  ```
  Eliminar de la sección "Capa Funcional" o tacharla. Actualizar el conteo "20 documentos" a 19.

### [BLOQUEANTE] — CLAUDE.md dice "4 Personas" con Lucas; doc3 tiene solo 3 y Lucas fue removido en Sesión 1
- **Docs involucrados**: CLAUDE.md (índice); doc3 título ("Los 3 Arquetipos Reales del Sistema") y secciones PERSONA 1/2/3; walkthrough Sesión 1 ("`Lucas` 0 refs ✅")
- **Inconsistencia**: CLAUDE.md dice:
  > `doc3` — 4 Personas: Marcelo (Owner), Rodrigo (Staff), Tomás (Jugador), Lucas (Organizador)
  
  Doc3 explícitamente tiene título "Los 3 Arquetipos Reales del Sistema" con PERSONA 1 (Marcelo), PERSONA 2 (Rodrigo), PERSONA 3 (Tomás). La jerarquía §final dice: "1️⃣ Marcelo 2️⃣ Rodrigo 3️⃣ Tomás". El walkthrough Sesión 1 verifica Lucas en 0 refs. **CLAUDE.md nunca fue actualizado.**
- **Impacto**: Onboarding de un nuevo dev o sesión de Claude va a hacer referencia a "Lucas (Organizador)", una persona fantasma. Todo feature pensado para "Lucas" está out-of-scope (era para partidos abiertos v1.5).
- **Corrección sugerida**: En CLAUDE.md:
  ```
  - `doc3` — 3 Personas: Marcelo (Owner), Rodrigo (Staff), Tomás (Jugador).
    Lucas (Organizador de partidos abiertos) deferido a v1.5.
  ```

### [BLOQUEANTE] — Doc 6 dice "17 tablas para v1.0" pero faltan `tenant_player_bans` y `price_versions`
- **Docs involucrados**: doc6 línea 746 ("Total: ~17 tablas para v1.0"); doc6 mapa de tablas líneas 727-744; CLAUDE.md (19 tablas); doc13 schema SQL
- **Inconsistencia**: CLAUDE.md y doc13 (per walkthrough) coinciden en 19 tablas (12 aisladas + 7 globales). Doc6 solo describe 17 entidades y menciona:
  > `Total: ~17 tablas para v1.0 (reducido desde 19 al eliminar open_matches y match_participants)`
  
  Falta ENTIDAD para:
  - **`tenant_player_bans`** (listada en CLAUDE.md como aislada)
  - **`price_versions`** (listada como global)
  
  La aritmética del comentario también miente: 19 − 2 (open_matches, match_participants) = 17, pero en realidad se agregaron después `daily_cash_closes` y `player_tenant_relationships` (§3.12 y §3.13 per walkthrough Sesión 2). El walkthrough las reconoce en CLAUDE.md pero no re-incorporó al conteo ni al mapa del doc6.
- **Impacto**: Doc6 es el glosario que traduce a schema. Un dev que lea solo doc6 para modelar la DB se pierde dos tablas críticas: (a) `tenant_player_bans` es RLS-aislada, contiene la lógica del flujo 4D "3 no-shows en 30 días → ban"; (b) `price_versions` es la que soporta el problema de ARS volátil (doc4 §5). Sin `price_versions`, los precios históricos de clientes anuales con `price_locked_until` no tienen dónde vivir.
- **Corrección sugerida**: Agregar ENTIDAD 17 (TenantPlayerBan) y ENTIDAD 18 (PriceVersion) a doc6. Actualizar el conteo a "19 tablas para v1.0" y corregir la aritmética. Re-ordenar la sección final "Guía Directa al Schema de DB".

---

## CRÍTICOS

### [CRÍTICO] — Doc 5 §5 "Multi-Tenancy — Aislamiento de Datos" tiene 3 nombres de tablas inexistentes y 4 faltantes
- **Docs involucrados**: doc5 líneas 178-193
- **Inconsistencia**: La lista de tablas aisladas vs globales en doc5 está completamente stale post-Sesión 2:
  - Usa **`subscriptions`** como tabla aislada — nombre viejo de `abonados`. La tabla `subscriptions` no existe.
  - Usa **`staff_users`** como aislada — pero per CLAUDE.md `staff_users` es **global** (cross-tenant); la aislada es `tenant_staff_members`.
  - Usa **`plan_definitions`** como global — esa tabla no existe; el nombre real es `plans`.
  - Faltan aisladas: `payments`, `daily_cash_closes`, `tenant_subscriptions`, `tenant_player_bans`.
  - Faltan globales: `price_versions`, `processed_webhooks`, `player_tenant_relationships`.
- **Impacto**: Doc5 es uno de los primeros docs que un dev lee (es "RNFs"). La sección §5 se usa como referencia de "qué tiene RLS". Un dev que confíe en esta lista va a: (a) buscar `subscriptions` y no encontrarla, (b) aplicar RLS a `staff_users` (global) rompiendo cross-tenant staff, (c) no aplicar RLS a `payments` (filtración de datos financieros entre complejos). El último es data-leak directo.
- **Corrección sugerida**: Reescribir §5 desde cero con las listas de CLAUDE.md. O mejor, agregar un caveat "Las listas autoritativas viven en CLAUDE.md y doc12" y dejar doc5 con solo la *estrategia*, no el inventario.

### [CRÍTICO] — Doc 7 Flujo 1 línea 72 tiene `status='trialing'` pero líneas 138/182/692/967/1244 todavía dicen `status 'trial'`
- **Docs involucrados**: doc7 líneas 138, 182, 692-693, 967-968, 1244
- **Inconsistencia**: El walkthrough Sesión 3 reclama *"doc7: 26 ocurrencias de cancelled → canceled, trial → trialing en Flujo 1"* y verifica con grep `= 'trial'` retornando 0. Pero el grep es demasiado estrecho: no captura las ocurrencias en backticks simples o en prosa:
  - Línea 138 (Flujo 1 Puntos de salida): `Tenant creado con status `trial``
  - Línea 182 (Flujo 2 Precondiciones): `El Tenant tiene status `trial` o `active``
  - Líneas 692-693 (Flujo 5): `El Tenant tiene status `trial` o `active``
  - Línea 967 (Flujo 7 Precondiciones): `Tenant con status `trial` o `churned` (re-activación)` — **nota especial**: línea 968 inmediatamente después dice `TenantSubscription con status `trialing` o... `churned``. Misma precondición, ambos valores; un dev copia-pegará ambos y tendrá query roto.
  - Línea 1244 (Flujo 9 Precondiciones): `Tenant con status `trial` o `active``
- **Impacto**: Queries generados de precondiciones `WHERE status = 'trial'` retornan 0 filas (el valor real es `'trialing'`). Flujo 7 (conversión trial → paid) y Flujo 9 (cancelación) fallan en precondición; el dueño nunca puede convertir ni cancelar. Esto es exactamente el bug que Sesión 3 dijo haber resuelto.
- **Corrección sugerida**: Re-ejecutar grep más amplio: `` grep -n '`trial`' doc7*.md `` (backticks literales) y reemplazar los 5 residuales. Idealmente agregar un test de contrato: parsear todos los backtick-status en docs/ y validar contra el ENUM `tenant_status` real.

### [CRÍTICO] — Doc 4 `scheduled_notifications` tabla inexistente referenciada en tabla §10
- **Docs involucrados**: doc4 línea 445; CLAUDE.md (19 tablas); doc6 mapa de entidades
- **Inconsistencia**: Doc 4 §10 tabla "Decisión de negocio → Requisito técnico":
  > Notificaciones de trial por email | Scheduled jobs en cola de mensajes. **Tabla `scheduled_notifications`**.
  
  Ni CLAUDE.md ni doc6 ni doc13 tienen tal tabla. Las 19 tablas listan `notifications` (registro de envíos) pero no `scheduled_notifications`. El mecanismo real per doc14 y ADR-005 es pg-boss (una cola en tablas del schema `pgboss.*`, no una tabla propia).
- **Impacto**: Un dev implementando §10 intenta `CREATE TABLE scheduled_notifications`, duplica el pg-boss y rompe la atomicidad de "encolar email + insert de booking en misma tx" (Doc 14 §5.1 usa `boss.send({..., db: tx })` vía las tablas pgboss).
- **Corrección sugerida**: Cambiar la línea de §10 a: *"Scheduled jobs en pg-boss (tabla `pgboss.job`). Ver ADR-005."*

### [CRÍTICO] — Doc 4 dunning tabla §4 dice "día 90: no se envía" pero doc7 flujo 8 día 90 envía email
- **Docs involucrados**: doc4 línea 210 (tabla de comunicaciones dunning); doc7 líneas 1158-1163 (Flujo 8 DÍA 90)
- **Inconsistencia**: Doc4 §4 dice:
  > 90 | (no se envía — el tenant ya está en CHURNED) | Estado → CHURNED
  
  Doc7 Flujo 8 en DÍA 90 dice:
  > 📩 Email: "Tus datos en TurnoGol serán eliminados en 7 días." (última oportunidad de reactivar)
- **Impacto**: Si el dev implementa doc4 (que es "autoritativo y único"), los tenants en dunning nunca reciben la ventana de 7 días para reactivar. El tenant pierde 90 días de acceso y **de golpe** el día 97 sus datos son borrados sin aviso previo. Viola tanto UX como Ley 25.326 (derecho a oposición previo a eliminación).
- **Corrección sugerida**: Actualizar doc4 línea 210 a:
  > 90 | "Tus datos se borran en 7 días. Recuperá tu cuenta ahora →" | Estado → CHURNED
  
  Y agregar fila 97: `97 | (no se envía) | DELETED + audit final`.

### [CRÍTICO] — Discrepancia en el conteo de estados de `subscription_status` entre doc4/doc6 (6) y walkthrough Sesión 2 (7 con `blocked`)
- **Docs involucrados**: doc4 línea 506; doc6 línea 576; walkthrough Sesión 2 ("`subscription_status` también actualizado con `blocked`")
- **Inconsistencia**: Walkthrough Sesión 2 afirma:
  > `subscription_status` también actualizado con `blocked`.
  
  Pero doc4 línea 506 y doc6 línea 576 listan ambos los mismos 6 valores sin `blocked`:
  ```
  trialing | active | past_due | suspended | canceled | churned
  ```
  
  El state machine de doc4 §2 tiene 8 estados en el tenant, pero al mapear a la tabla `tenant_subscriptions` solo 6 se usan (el diagrama pasa por BLOCKED cuando cancela voluntariamente). Si doc13 tiene 7 y doc4/doc6 tienen 6, el ENUM va a rechazar cualquier intento de setear `subscription_status = 'blocked'`.
- **Impacto**: Código que haga transición `BLOCKED` en la suscripción va a fallar con `invalid input value for enum subscription_status: "blocked"`. El Flujo 8 DÍA 14 y el Flujo 9 PASO 5 son justamente los que hacen esta transición.
- **Corrección sugerida**: Verificar qué dice realmente doc13. Si tiene `blocked`, actualizar doc4 §13 y doc6 §12 a 7 valores. Si no tiene, actualizar walkthrough (y dejar claro que BLOCKED es solo un estado de `tenants`, no de `tenant_subscriptions`).

---

## ALTOS

### [ALTO] — Doc 6 `player_status` tiene `suspended` sin definición semántica; `banned` como estado global choca con `tenant_player_bans`
- **Docs involucrados**: doc6 línea 389; CLAUDE.md ("player_status: active, banned, suspended, anonymized"); doc18 §5.3 (ARCO); flujo 4D no-show penalty
- **Inconsistencia**: El ENUM `player_status` tiene 4 valores pero 2 están documentados ambiguamente:
  - **`banned`**: ¿es un ban global (el jugador no puede reservar en NINGÚN complejo)? Si sí, ¿quién lo setea? No hay flujo documentado que cause `players.status = 'banned'`. El mecanismo operativo de bans per-complejo vive en `tenant_player_bans` (tabla aislada).
  - **`suspended`**: sin definición. ¿Suspensión administrativa? ¿Temporal? ¿Quién la setea? No hay flujo en doc7 que la triggeree.
  - **`anonymized`**: único con uso claro (doc18 §5.3 ARCO) ✅
  - **`active`**: default ✅
- **Impacto**: Un dev implementando el filtro "¿este jugador puede reservar?" va a tener que adivinar. Peor: si alguien setea `players.status = 'banned'` via admin SQL, afecta al jugador *en todos los complejos* — cuando el semáforo de CLAUDE.md y de la arquitectura es que los bans son per-tenant. Confusión con daño real.
- **Corrección sugerida**: Reducir el ENUM a `active | anonymized` (los dos únicos usados). Remover `banned` y `suspended` del ENUM; si en el futuro se necesitan, agregar con semántica clara. Bans operativos usan `tenant_player_bans`.

### [ALTO] — Doc 6 entidad PlayerTenantRelationship omite campos que el walkthrough Sesión 2 dice haber agregado
- **Docs involucrados**: doc6 líneas 411-424; walkthrough Sesión 2 nueva tabla §3.12
- **Inconsistencia**: Walkthrough Sesión 2 describe:
  > `player_tenant_relationships` (§3.12). Registra la relación entre un jugador y cada complejo donde interactuó. Campos: `bookings_count`, `noshow_count`, `last_booking_at`, `data_consent_at`.
  
  Doc6 §6 (la entidad) lista solo 6 campos:
  ```
  id, player_id, tenant_id, status, first_seen_at, created_at
  ```
  Y explícitamente nota (línea 422):
  > Esta tabla es intencionalmente minimalista en v1. NO tiene contadores de no-shows ni bans complejos. Se expande en v1.5 con `noshow_count`, `total_bookings`, y moderación avanzada.
- **Impacto**: 
  1. **doc7 Flujo 4D regla del 3-no-show**: "El jugador acumula 3 no-shows en 30 días → ban automático". Sin `noshow_count` en `player_tenant_relationships`, esta regla requiere COUNT(*) sobre `bookings` en cada evaluación — funcional pero costoso en hot path. Si walkthrough realmente agregó `noshow_count`, el costo baja 10x.
  2. **doc18 ARCO**: `data_consent_at` sería la evidencia de consent por-complejo (para el caso "el complejo es responsable de los datos de sus jugadores" bajo Ley 25.326). Sin él, no hay trazabilidad legal.
  
  Cuál es la verdad depende de qué tiene doc13 hoy. Contradicción no resuelta.
- **Corrección sugerida**: Tomar la decisión explícitamente: ¿los counters están en v1 o v1.5? Alinear doc6, doc13 y walkthrough. Si v1 los tiene, eliminar la nota de doc6 "intencionalmente minimalista"; si no, retirar la promesa del walkthrough y documentar la regla del 3-no-show como "query en tiempo real con índice en (player_id, tenant_id, status, created_at)".

### [ALTO] — Doc 6 state machine de Booking no documenta `pending_payment → expired` iniciado por admin
- **Docs involucrados**: doc6 líneas 229-268; doc7 línea 662 (Flujo 4 edge case 3)
- **Inconsistencia**: Doc7 Flujo 4 edge case 3:
  > El admin cancela una reserva que está en `pending_payment`: Se puede cancelar directamente (no hay seña que devolver). Status → `expired` (no `canceled`, porque nunca se confirmó).
  
  Doc6 state machine dibuja solo la transición `pending_payment → expired` con trigger "timeout 15min / 48hs in_process". No menciona que el admin pueda forzarla. La tabla de transiciones válidas (líneas 256-268) tampoco incluye `pending_payment → expired` iniciada por admin.
- **Impacto**: El service layer va a rechazar el intento del admin de "cancelar" un pending_payment porque no hay transición válida definida. El admin debe esperar al timeout de 15min (frustrante en recepción real: "cancelé esa reserva y todavía aparece bloqueando el slot").
- **Corrección sugerida**: Agregar fila en la tabla de transiciones de doc6:
  ```
  pending_payment | expired | Admin fuerza expiración | Slot liberado, email al jugador
  ```

### [ALTO] — Doc 4 §2 y §9 tienen timelines incompatibles para cancelación voluntaria vs dunning
- **Docs involucrados**: doc4 §2 diagrama; doc4 §9 tabla; doc4 §10 "60+7 días"; doc7 Flujo 9 PASO 6
- **Inconsistencia**: 
  - Cancelación voluntaria (doc4 §2 y §9, doc7 Flujo 9): post-cancelación → acceso hasta fin de período → **BLOCKED 60d → CHURNED → 7d → DELETED** (total desde expiración: 67 días)
  - Dunning (doc4 §4, doc7 Flujo 8): fallo → 7d SUSPENDED → 14d BLOCKED → **90 días sin pago → CHURNED → 7d → DELETED** (total desde primer fallo: 97 días)
  
  Pero doc4 §10 tabla fila *"Datos conservados 60+7 días post-churn"* — esto aplica solo a cancelación voluntaria, no a dunning. No hace la distinción.
- **Impacto**: Dev que implementa `scheduled_deletion_at` va a usar 67 días o 97 según qué doc lee. Si usa 67 para dunning, los datos se eliminan antes de tiempo. Si usa 97 para cancelación voluntaria, la promesa al usuario *"tus datos se conservan 60 días"* se incumple (de hecho duran 90, innecesariamente).
- **Corrección sugerida**: En doc4 §10 aclarar las dos filas:
  ```
  Cancelación voluntaria: 60d post-período → CHURNED → 7d → DELETED
  Dunning (impago): 90d post-primer-fallo → CHURNED → 7d → DELETED
  ```

---

## MEDIOS

### [MEDIO] — Doc 10 defaults de horarios inconsistentes con doc7 Flujo 1 PASO 5
- **Docs involucrados**: doc10 §2 paso 3 (mockup); doc7 línea 89
- **Inconsistencia**: 
  - Doc7 Flujo 1 PASO 5: *"Valores pre-cargados: Lunes a Domingo 08:00 a 00:00"* (homogéneo).
  - Doc10 §2 paso 3 mockup muestra defaults variados: Lun-Jue 08:00-00:00, Vie 08:00-01:00, Sáb 09:00-01:00, Dom 09:00-23:00.
- **Impacto**: El dev que implemente el wizard va a seguir uno u otro y el otro equipo/doc va a reportar bug de UX. No es bloqueante pero es fricción.
- **Corrección sugerida**: Decidir una opción. Los defaults variados de doc10 son más realistas para Argentina ("viernes cerramos más tarde"). Actualizar doc7 PASO 5.

### [MEDIO] — CLAUDE.md "Realtime Supabase: solo para staff (grilla)" pero las policies documentadas hacen Realtime dual en `bookings` Y `player_tenant_relationships`
- **Docs involucrados**: CLAUDE.md sección Multi-tenancy; CLAUDE.md sección Convenciones
- **Inconsistencia**: CLAUDE.md dice:
  > **RLS dual en `bookings` y `player_tenant_relationships`**: policy para staff (por `app.current_tenant_id`), policy para jugador (por `app.current_player_id`), **policy Realtime (por JWT `app_metadata.tenant_id`)**
  
  Y más abajo:
  > Realtime Supabase: solo para staff (grilla). Jugador NO tiene Realtime en v1 (polling/refresh).
  
  Si el jugador no tiene Realtime, ¿por qué `player_tenant_relationships` necesita policy de Realtime? La grilla (bookings) sí la necesita para staff. `player_tenant_relationships` no tiene un caso de uso de Realtime documentado en v1.
- **Impacto**: Se crea una policy de más, complejidad innecesaria. Y si algún dev ve la policy en Realtime de `player_tenant_relationships` y asume que hay un listener del jugador escuchando cambios de su propia relación con el complejo, termina construyendo una feature fantasma.
- **Corrección sugerida**: Aclarar en CLAUDE.md: la policy de Realtime va SOLO en `bookings` (para la grilla de staff). `player_tenant_relationships` tiene RLS dual (staff + player) pero no necesita policy de Realtime.

---

## Resumen de conteo

- **BLOQUEANTES (5)**: Feature flags staff "Ilimitado" en §8 de doc4; doc6 Player sin campos +18; CLAUDE.md lista doc9 deprecado como vigente; CLAUDE.md menciona Lucas (personaje removido); doc6 cuenta 17 tablas y faltan 2.
- **CRÍTICOS (5)**: Doc5 §5 tabla-lista stale con 3 nombres falsos + 4 faltantes; doc7 5 residuales de `trial` sin migrar a `trialing` (incluyendo una línea que mezcla ambos); `scheduled_notifications` tabla fantasma en doc4 §10; doc4 día 90 "no se envía" contradice doc7 Flujo 8 día 90; inconsistencia `subscription_status` 6 vs 7 estados.
- **ALTOS (4)**: `player_status` con `banned`/`suspended` sin semántica ni uso; PlayerTenantRelationship campos contradictorios doc6 vs walkthrough; state machine de Booking omite `pending_payment → expired` por admin; doc4 §10 no distingue timelines cancelación voluntaria (67d) vs dunning (97d).
- **MEDIOS (2)**: Defaults de horarios doc10 vs doc7; Realtime policy de más en `player_tenant_relationships`.

---

## Patrón estructural detectado

Hay tres patrones sistémicos que explican por qué las sesiones previas dejaron estos residuales:

1. **Half-fix en tablas "buried"**: cuando un valor aparece en texto narrativo de §1 y en una tabla de §8 del mismo doc, las sesiones arreglan §1 (lo más visible) y olvidan §8 (la tabla autoritativa). Ejemplos: staff limits doc4 §8, feature flag `scheduled_notifications` doc4 §10.

2. **Greps de verificación demasiado estrechos**: la Sesión 3 usó `grep "= 'trial'"` para verificar migración a `trialing`, pero esto no captura `` `trial` `` (backticks sueltos) en precondiciones y puntos de salida. Recomiendo: `grep -P "[\`']trial[\`'\s]"` o similar.

3. **CLAUDE.md no se re-sincroniza tras cada sesión**: índice de doc3 (personas), doc9 (deprecado), y el conteo de tablas quedaron stale. Propongo: añadir al walkthrough Sesión N+1 un paso obligatorio *"regenerar sección de índice y convenciones de CLAUDE.md desde los docs"*.

La documentación está en muy buen estado — las 9 BLOQUEANTES de la auditoría original están efectivamente cerradas. Pero cinco nuevas surgen de los efectos secundarios de la propia limpieza (doc6 no se tocó en Sesión 2/3 proporcionalmente a la cantidad de cambios en doc13). Antes de iniciar implementación, las 5 BLOQUEANTES de esta sesión deberían cerrarse con un commit quirúrgico.