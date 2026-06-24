# Auditoría Forense de Documentación — TurnoGol

> Alcance: 19 documentos vigentes de `docs/spec/` (doc1–doc20, doc9 deprecado), leídos en orden.
> Método: lectura completa de doc1–doc14; doc15–doc20 verificados con lectura dirigida + grep sobre tokens críticos.
> Fecha: 2026-06-23.
> Criterio: falso positivo > falso negativo. No se elogia. Cuando algo no está en ningún doc, es GAP (no se inventa).

> [!NOTE]
> **Línea base de contraste.** Varios hallazgos comparan los specs contra decisiones que el proyecto YA tomó
> (registradas en `CLAUDE.md` y en `docs/decisions/`): auth staff = email+password, 2 roles staff (admin+manager,
> sin PIN), no-show = deuda, caja con gastos/stock, sin recordatorio 24h, push al admin. Los specs no fueron
> actualizados a esas decisiones de forma pareja: algunos docs sí, otros no. Eso produce la mayoría de las
> contradicciones de abajo. La documentación NO es internamente consistente hoy.

---

## 1. CONSISTENCIA INTERNA

### [C-01] Modelo de roles de staff: TRES versiones incompatibles — BLOQUEANTE
Tres docs describen tres modelos de roles distintos.

- **doc5 §4** (RBAC): tabla con cuatro columnas — `| Acción | Admin | Recepcionista | Solo Lectura | Jugador |`
- **doc6 §Entidad 7**: _"En v1 solo existe el rol `admin`. El sistema usa un PIN para proteger zonas sensibles"_ y `role enum 'admin' (único rol en v1)`.
- **doc13 §1**: `CREATE TYPE staff_role AS ENUM ('admin');` con comentario _"v1: solo admin, extensible a futuro"_ — **no existe `manager`**.
- **doc7 Flujo 4C**: _"StaffUser tiene rol `admin` o `manager`"_; **doc7 Flujo 5B**: _"Actor: admin o manager (`requireOperatorStaff()`)"_.
- **doc8 US-JUG-ADM-001**: _"El módulo está protegido con `requireOperatorStaff()` (admin + manager)."_

El enum del schema (doc13) NO contempla `manager`, pero doc7/doc8 ya lo usan en flujos y stories. doc5 usa un tercer set (Recepcionista + Solo Lectura). Cualquier desarrollador que derive el schema de doc13 generará un sistema que rompe doc7/doc8.

### [C-02] Autenticación de staff: magic link en TODOS los docs — BLOQUEANTE
Ningún spec refleja auth por contraseña para staff. El magic link está cableado transversalmente:

- **doc5 §4**: _"Magic link por email (sin contraseña): link de 1 uso, válido 15 minutos"_.
- **doc11 ADR-002**: _"Staff (admin, recepcionista) | Magic link por email | —"_. La ADR sigue **vigente, sin ADR que la depreque**.
- **doc10 §6**: _"¿Por qué magic link y no contraseña? … 'Olvidé mi contraseña' es la causa #1 de abandono en este segmento."_
- **doc18 línea 80**: _"Contraseñas | Usamos magic link y OAuth. **No existe campo de password en nuestra DB.**"_
- **doc14 §1**: `Autenticación | Supabase Auth | … | ADR-002`; diagrama: _"Auth (GoTrue) • Magic link • Google OAuth"_.
- **doc15 §**: endpoints `POST /api/auth/magic-link`, `POST /api/auth/verify` — **no hay endpoint de login con password**.
- También doc6 §Entidad 7, doc7 Flujo 1 PASO 1, doc12 §9.4, doc19 §3.10.

Una ADR no se edita: debería existir **ADR-013 (password auth)** que depreque ADR-002. No existe.

### [C-03] PIN para zonas sensibles — contradice "sin sistema de PIN"
El PIN aparece como mecanismo de seguridad en múltiples docs:

- **doc4 §1**: _"Sin límite de staff (una sola cuenta admin por complejo con PIN para zonas sensibles)"_.
- **doc8 US-ADM-003**: historia entera basada en PIN — _"Las zonas sensibles … requieren ingreso de PIN de administrador."_
- **doc12 §5.1**: _"role: `admin` — único rol en v1. Zonas sensibles protegidas por PIN del tenant."_
- **doc18 línea 349**: _"Un único rol `admin` por tenant; zonas sensibles protegidas por PIN."_

Está atado a [C-01]: el PIN era la alternativa a tener roles; si hay 2 roles reales (admin/manager) el PIN no aplica.

### [C-04] Timeout de reserva `pending_payment`: 6 min vs 15 min — ALTA
El mismo parámetro aparece con dos valores, a veces dentro del mismo documento.

- **6 minutos**: doc13 enum (`-- Esperando pago de seña (timeout 6 min)`); doc8 US-RES-003 (_"timer de 6 minutos empieza"_) y US-RES-005 (_"más de 6 minutos en `pending_payment`"_); doc7 Flujo 2 "Timer de expiración" (_"se ejecuta en 6 minutos"_).
- **15 minutos**: doc7 Flujo 2 "Decisiones" (_"max 15 minutos → timeout → `expired`"_) y "Jobs consolidados" (_"Bookings en `pending_payment` > 15 min → `expired`"_); doc8 US-RES-002 (_"booking queda en `pending_payment` con timer de 15 min"_); doc11 ADR-004 (_"expiration_date_to: booking.created_at + 15 minutos"_) y ADR-003 (_"Timeout 15min sin seña"_).

doc7 y doc8 se contradicen **internamente**.

### [C-05] `booking_advance_days` default: 6 vs 14 — MEDIA
- **doc6 §Entidad 1** (settings JSONB): `"booking_advance_days": 6`.
- **doc13 §2.1** (default de la columna `settings`): `"booking_advance_days": 14`.
- **doc15 línea 160**: `"booking_advance_days": 14`.

(CLAUDE.md fija default 6 "como ATC". El schema y la API dicen 14.)

### [C-06] Default de seña y cancelación: 50%/48h vs 30%/12h — MEDIA
- **doc6 §Entidad 1**: `"deposit_percentage": 50` y `"cancellation_policy": { "hours_before": 48 }`.
- **doc4 §7**, **doc10 §4/§6** y **doc13 §2.1**: 30% y 12 hs.

doc6 es el outlier; el resto del corpus dice 30%/12h.

### [C-07] Recordatorios email 24h/2h: vivos en specs, eliminados en la decisión — ALTA
Persisten en al menos seis docs:

- **doc3 §Mapa de personas**: fila `Email - Recordatorio 24hs | … | ✅`.
- **doc6 §Entidad 14**: `trigger_event … 'booking.reminder_24h'`.
- **doc7 Flujo 2 (efectos)**: _"Cron: programar recordatorio email 24hs antes"_ + _"2hs antes"_; "Jobs consolidados" lista ambos crons.
- **doc8 US-RES-006** (story completa de recordatorio 24h/2h) y **US-NOT-001** (templates _"Recordatorio 24hs", "Recordatorio 2hs"_).
- **doc11 ADR-003/ADR-005**: _"Recordatorios de turno (24hs/2hs antes)"_.
- **doc16 línea 89**: test `expect(result.sideEffects).toContain('SCHEDULE_REMINDER_24H')`.

(Decisión registrada: recordatorio 24h descartado en v1, worker/template eliminados.)

### [C-08] Persona fantasma "Agustín (Abonado)" — contradice doc3 — ALTA
doc3 es explícito: _"El 'abonado' es un estado, no un tipo de usuario"_; hay **3 personas** (Marcelo, Rodrigo, Tomás). Pero doc8 crea una 4ª persona:

- **doc8 §Cross-reference**: fila `**Agustín** (Abonado) | RES-006 · JUG-001,002 · CAN-001`.
- **doc8 US-RES-006/US-JUG-001/US-JUG-002**: `Persona: … + Agustín (Jugador Abonado)`.
- **doc11 ADR-002**: _"Jugadores: Agustín, Tomás"_.

El usuario marcó este punto como ya corregido en doc3 — pero **doc8 y doc11 todavía tratan al abonado como persona separada**.

### [C-09] Conteo de tablas "12 RLS / 19 tablas" desactualizado — ALTA
doc5 §5, doc6 §Guía al schema, doc11 ADR-001 y doc12 §2 afirman **12 tablas aisladas**. Faltan tablas que existen en el código (`reviews`, `push_subscriptions`, `player_favorites`, `feature_flags`):

- `grep` sobre `docs/spec/` de `push_subscription|reviews|player_favorites|feature_flags` → **0 coincidencias**.
- doc12 §10.2 `ISOLATED_TABLES = [...12 tablas...]` no incluye `push_subscriptions` (que es tenant-aislada).

### [C-10] doc8: conteos y prioridades inconsistentes — MEDIA
- Índice de epics: `Abonados | ABO | US-ABO-001 a 005 + US-JUG-ADM-001` (= 6 stories). "Conteo Final por Epic": `Abonados | ABO | 4`. Total: encabezado _"~40 user stories"_ vs matriz _"TOTAL … 42"_.
- **US-SAS-002** encabezado: `Prioridad: P0 — Bloqueante`; matriz de prioridades la lista bajo **P2**. Igual con **US-SAS-005** (encabezado P0, matriz P2).

### [C-11] Expiración de magic link: 10 min vs 15 min — BAJA
doc5/doc7/doc11 dicen 15 minutos. **doc19 §3.10**: _"los magic links expiran en 10 minutos"_.

### [C-12] Frecuencia de auto-completar reservas: 5 min vs 30 min — BAJA
- **doc7 §Jobs consolidados**: _"Auto-completar bookings | Cada 5 minutos"_.
- **doc11 ADR-005**: `'auto-complete-bookings': { cron: '*/30 * * * *' }` (cada 30 min).

### [C-13] Precios de planes inconsistentes en ejemplos — BAJA
doc4 §1 fija Predio/Complejo/Estadio en `$47.000 / $74.000 / $101.000`. **doc11 ADR-004** usa _"$55.000-120.000 ARS/mes"_ y `transaction_amount: 88000` ($88.000) como ejemplo — no corresponde a ningún plan.

---

## 2. LÓGICA DE NEGOCIO

### [L-01] Dos modelos de no-show coexisten en doc8 — BLOQUEANTE
- **US-RES-007** (modelo viejo): _"se evalúa la penalidad según `tenant.settings.no_show_penalty`"_ y _"cuando supera el umbral, se crea un ban temporal en `tenant_player_bans`"_.
- **US-CAN-004** (modelo nuevo): _"se calcula la deuda: `amount_pending = max(0, price_snapshot - seña_capturada)` … se suma al `balance`"_.
- **doc7 Flujo 4D** confirma el modelo de deuda.

Son mecanismos distintos para el mismo evento. `no_show_penalty` y el ban-por-umbral ya no existen (modelo activo = deuda). **US-RES-007 quedó stale** y contradice US-CAN-004 dentro del mismo documento. (doc16 también testea `APPLY_NO_SHOW_PENALTY`.)

### [L-02] "Out of scope: penalidad por no-show" contradice el modelo de deuda — ALTA
**doc7 Flujo 4 §Out of scope**: _"❌ Penalidad económica por no-show (cobrarle al jugador más allá de la seña)"_. Pero **Flujo 4D** suma `price_snapshot − seña` al `balance` del jugador — eso **es** cobrarle más allá de la seña. La línea de out-of-scope quedó obsoleta tras el cambio a deuda.

### [L-03] Caja: "gastos operativos" declarado fuera de scope pero el modelo ya los tiene — ALTA
- **doc7 Flujo 6 §Out of scope**: _"❌ Gestión de gastos operativos (sueldos, servicios, mantenimiento)"_.
- **doc8 US-CAJ-001 §Out of scope**: idéntico.
- Pero **doc13 §1**: `cashflow_type AS ENUM ('income', 'adjustment', 'expense')` + categoría `'operating_expense'`.

Además doc7 Flujo 6 PASO 2 solo ofrece categorías `booking | product_sale | other` — faltan `operating_expense`, `abonado_payment`, `no_show_correction` que sí existen en el enum. El flujo de caja documentado quedó por detrás del schema.

### [L-04] Duración de turno: fija, "configurable" y "2 horas" a la vez — ALTA
- **doc7 Flujo 2 §Out of scope**: _"el slot tiene duración fija: 1 hora por defecto, **configurable por cancha**"_.
- **doc7 Flujo 3 §Decisiones**: _"El admin quiere una reserva de 2 horas | `time_end = time_start + 2h`. **No hay restricción de duración** en reserva manual."_
- **doc8 US-RES-003 §Out of scope**: _"NO incluye elegir duración variable del slot"_.

(Decisión real: 60 min fijo, `SLOT_DURATION_MINUTES` constante; `booking_duration_minutes` eliminado.) doc7 afirma simultáneamente "fija", "configurable por cancha" y "sin restricción / 2h".

### [L-05] Transición `completed → no_show` choca con la invariante de inmutabilidad — MEDIA
- **doc6 §Invariantes de la Reserva**: _"Una reserva en estado `no_show` es completamente inmutable"_ y _"`completed`/`no_show` estados finales"_.
- Pero la misma tabla de transiciones permite `completed → no_show` (_"Corrección posterior dentro de 24 hs"_), repetido en doc7 Flujo 4D edge #5 y doc8 US-RES-007.

Un estado "final inmutable" que admite transición de salida es una contradicción de la state machine. (Nota operativa: esta corrección 24h además no está implementada y un trigger de DB bloquea todo UPDATE post-terminal — la premisa documentada no es construible tal como está.)

### [L-06] Auto-complete asume "jugó" y nunca marca no-show — edge cubierto pero con tensión — BAJA
doc7 Flujo 4D Escenario B y doc8 US-RES-007: a los 30 min el sistema marca `completed` (benefit of the doubt) y registra CashFlow income. Esto **registra un cobro que puede no haber ocurrido** (reserva sin seña, jugador que no fue ni avisó). El no-show real depende 100% de acción humana dentro de 24h, ventana que [L-05] dice que es inmutable. Combinado, la caja puede inflarse con turnos no cobrados.

---

## 3. VIABILIDAD TÉCNICA PARA V1

El stack (Next.js + Supabase + Drizzle + pg-boss + MP + Resend, monolito) es **sensato y bien dimensionado** para 1-3 personas y ~2 ops/s pico. Lo que está sobre-especificado o es riesgoso de construir:

- **Lifecycle de 8 estados + dunning de 3 reintentos + 11 cron jobs** (doc4, doc7, doc11 ADR-005): correcto pero pesado. El prorrateo de upgrades es complejidad real porque **MP Suscripciones no soporta prorrateo nativo** (doc11 ADR-004 lo admite: _"calcular el prorrateo en nuestro backend y generar un pago único por la diferencia usando Checkout Pro"_). Sugerencia: en v1 hacer upgrade "al próximo ciclo" como el downgrade, y diferir el prorrateo intra-período (ya está marcado out-of-scope en doc7 Flujo 7, pero doc8 US-SAS-004 lo pide inmediato → ver también inconsistencia de scope).
- **Google OAuth para jugadores** (doc7 Flujo 2 PASO 2, doc8 US-JUG-001, doc11 ADR-002): la decisión real es jugador passwordless por magic link. Si Google OAuth no se va a construir en v1, es scope fantasma en 3 docs. Simplificar a magic-link-only para el jugador.
- **Búsqueda/marketplace con geolocalización y distancia** (doc8 US-JUG-003, P1): alto esfuerzo (geo, ordenamiento por distancia, slider de precio en tiempo real) para valor incierto en los primeros 50-200 complejos. Candidato a degradar a "listado simple por ciudad" en v1.
- **Doble mecanismo RLS** (`current_setting` + `auth.jwt()`, doc12 §3.5): defendible, pero duplica superficie de policies a mantener y testear por tabla. Para un equipo chico, conviene un solo mecanismo primario.

No hay nada que requiera microservicios, colas externas ni infra extra: las ADRs lo descartan con buen criterio.

---

## 4. GAPS DE ESPECIFICACIÓN

### [G-01] Cuatro tablas existen en el código y NO están en ningún spec — ALTA
`reviews`, `push_subscriptions`, `player_favorites`, `feature_flags` (tabla operacional): 0 menciones en `docs/spec/`. doc6 (entidades) no las define; doc13 (schema) no las crea; doc12 (aislamiento) no las clasifica ni las testea. `US-JUG-004` (Complejo Favorito) **usa** favoritos pero no hay entidad `PlayerFavorite` en doc6. `US-ONB-005 §Out of scope` dice _"NO incluye reviews/calificaciones"_ aunque la tabla `reviews` existe.

### [G-02] Push notifications al admin (Web Push) no está documentado — ALTA
Es feature core según la decisión vigente (Web Push al admin cuando llega reserva online, con horario silencioso 00:00–08:00). Pero los specs dicen lo contrario:

- **doc13 §1**: `notification_channel AS ENUM ('email')  -- v1 email-only`.
- **doc11 ADR-003 §Revisión**: push como "evaluar" a futuro.
- **doc8 US-NOT-003 §Out of scope**: _"NO incluye push notifications nativas (browser/mobile)"_.

El "horario silencioso" (push diferido a las 08:00) no aparece en ningún documento.

### [G-03] No existe ADR de migración a password — MEDIA
ADR-002 (magic link) sigue como decisión vigente. La migración a email+password para staff no tiene ADR que la formalice ni deprecación de ADR-002 (ver [C-02]). Falta el registro de la decisión y su rationale (sobre todo porque **contradice** el rationale de doc10 §6).

### [G-04] `open_matches` / "Falta Uno" — limpieza declarada pero pendiente — BAJA
doc3, doc6 y doc7 marcan correctamente "partidos abiertos" fuera de v1. La decisión dice que el enum/tablas `open_matches`, `open_match_players`, `open_match_status` siguen en el schema pendientes de eliminar. Los docs no señalan esa deuda de limpieza (no es contradicción, es trazabilidad faltante).

### [G-05] Cobro del resto del turno (cambio #8) sin user story propia — BAJA
doc7 Flujos 2 y 3 describen la sección "Cobros de turno" (CashFlow `income`/`booking` con `booking_id`), pero doc8 no tiene una US dedicada; queda implícito dentro de US-CAJ-001 ("pago parcial"). Conviene una story explícita para no perder los estados cobrables (`confirmed/completed/no_show`).

---

## 5. RIESGOS ESPECÍFICOS DE ARGENTINA

- **Inflación vs precios en docs**: doc4 §1 maneja bien el problema estructural (`price_versions`, plan anual con `price_locked_until`, revisar cada 3 meses, riesgo del anual a pérdida aceptado). **Riesgo documental**: los montos están hardcodeados en ejemplos de múltiples docs y ya divergen ($47/74/101k en doc4 vs $55-120k/$88k en doc11 ADR-004). Con inflación, estos ejemplos envejecen rápido y confunden. Recomendación: precios solo en doc4 + tabla `plans`, y que el resto referencie, no copie.
- **MercadoPago**: bien cubierto lo difícil (idempotencia con `processed_webhooks`, webhooks duplicados/fuera de orden, timeout 8s, degradación a "sin seña"). Riesgo abierto: **prorrateo no nativo** en Suscripciones (ver §3) y reconciliación de suscripciones SaaS (no hay flujo de polling/conciliación cuando un webhook se pierde más allá de 24h — doc7 Flujo 8 edge #7 lo menciona pero no lo especifica).
- **WhatsApp**: descartado para v1 con buen criterio de costos (doc4 §3, doc14 "Meta Cloud REMOVIDO"). Sin riesgo; bien documentado el porqué.
- **Tech literacy del dueño (2.5/5) vs decisión de password**: **riesgo de producto real**. doc10 §6 dice textualmente que _"'Olvidé mi contraseña' es la causa #1 de abandono en este segmento"_ y por eso se eligió magic link. La decisión vigente (password para staff) va en contra de ese hallazgo de UX sin que ningún doc lo justifique. Si se mantiene password, hace falta un flujo de reset robusto y a prueba de fricción, y actualizar doc10 con el nuevo rationale.
- **Conectividad móvil variable / hora pico viernes-sábado**: bien tratado (bundle <250-300KB, localStorage en formularios, timeouts, fallback de MP). Sin observaciones.

---

## 6. TABLA MAESTRA DE ISSUES

| ID | Doc(s) | Descripción | Severidad | Acción recomendada |
|---|---|---|---|---|
| C-01 | 5, 6, 7, 8, 12, 13 | 3 modelos de rol staff (admin/recep/read_only · admin único+PIN · admin+manager); enum doc13 sin `manager` | BLOQUEANTE | Fijar 2 roles (admin/manager), actualizar enum `staff_role` y RBAC en todos los docs |
| C-02 | 5,6,7,10,11,12,14,15,18,19 | Auth staff = magic link en todos los specs; realidad es password | BLOQUEANTE | Escribir ADR-013 (password), deprecar ADR-002, propagar a doc5/10/14/15/18/19 |
| C-03 | 4, 8, 12, 18 | PIN para zonas sensibles vs "sin PIN" | ALTA | Eliminar PIN de los docs; reemplazar por gating por rol |
| C-04 | 7, 8, 11, 13 | Timeout `pending_payment`: 6 vs 15 min (contradicción intra-doc7 e intra-doc8) | ALTA | Definir valor único (6 min) y corregir doc7 jobs, doc8 US-RES-002, doc11 ADR-003/004 |
| C-05 | 6, 13, 15 | `booking_advance_days`: 6 vs 14 | MEDIA | Fijar 6, corregir default de columna (doc13) y payload (doc15) |
| C-06 | 6 vs 4/10/13 | Seña/cancelación 50%/48h vs 30%/12h | MEDIA | Corregir el ejemplo de doc6 a 30%/12h |
| C-07 | 3,6,7,8,11,16 | Recordatorios email 24h/2h vivos; decisión los eliminó | ALTA | Quitar de personas/notificaciones/jobs/templates/tests |
| C-08 | 8, 11 (vs 3) | Persona "Agustín (Abonado)" como rol separado | ALTA | Reemplazar por Tomás (modo abonado); eliminar fila de cross-reference |
| C-09 | 5, 6, 11, 12 | "12 tablas RLS / 19" sin reviews/push/favorites/feature_flags | ALTA | Recontar y reclasificar tablas; actualizar listas y tests de aislamiento |
| C-10 | 8 | Conteos de stories (4 vs 6, ~40 vs 42) y prioridades (P0 vs P2) inconsistentes | MEDIA | Recontar epics y alinear prioridades header↔matriz |
| C-11 | 5/7/11 vs 19 | Magic link 15 vs 10 min | BAJA | Unificar a 15 min |
| C-12 | 7 vs 11 | Auto-complete cada 5 vs 30 min | BAJA | Unificar (recomendado 30 min) |
| C-13 | 4 vs 11 | Precios de plan divergentes en ejemplos | BAJA | Centralizar precios en doc4 |
| L-01 | 8, 16 | Dos modelos de no-show (penalidad/umbral vs deuda) | BLOQUEANTE | Reescribir US-RES-007 al modelo de deuda; borrar `no_show_penalty` y bans por umbral |
| L-02 | 7 | "Out of scope: penalidad por no-show" contradice deuda price−seña | ALTA | Eliminar la línea de out-of-scope obsoleta |
| L-03 | 7, 8 (vs 13) | "Gastos operativos out of scope" pero enum tiene `expense`/`operating_expense` | ALTA | Incorporar gastos a Flujo 6 y categorías; quitar de out-of-scope |
| L-04 | 7, 8 | Duración: "fija" + "configurable por cancha" + "2h sin restricción" | ALTA | Fijar 60 min; corregir Flujo 2 y Flujo 3 |
| L-05 | 6, 7, 8 | `completed → no_show` vs invariante "no_show inmutable" | MEDIA | Resolver la state machine (o transición o inmutabilidad, no ambas) |
| L-06 | 7, 8 | Auto-complete registra CashFlow de turnos quizá no cobrados | BAJA | Revisar si el income se registra al completar o solo al cobrar |
| G-01 | (ausencia) | `reviews`/`push_subscriptions`/`player_favorites`/`feature_flags` sin spec | ALTA | Agregar entidades a doc6 y DDL a doc13; clasificar en doc12 |
| G-02 | 8, 11, 13 | Web Push al admin + horario silencioso no documentado (specs dicen email-only) | ALTA | Documentar canal push, ADR de push, horario silencioso |
| G-03 | 11 | Sin ADR de migración a password | MEDIA | Crear ADR-013 (ligado a C-02) |
| G-04 | 3, 6, 7 | `open_matches` pendiente de eliminar, sin trazar | BAJA | Nota de deuda técnica de limpieza |
| G-05 | 7, 8 | Cobro del resto del turno (cambio #8) sin US propia | BAJA | Agregar US-CAJ explícita |

---

## 7. VEREDICTO

### ¿Esta documentación está lista para codear? **NO.**

Está cerca en la capa técnica (ADRs y stack son sólidos), pero la capa funcional tiene **tres contradicciones bloqueantes** que producirían código incorrecto si un desarrollador (humano o IA) toma un doc como fuente de verdad: el modelo de roles, la autenticación y el modelo de no-show. Además, dos features que ya están en el código (push, y 4 tablas) no están en ningún spec, y dos decisiones de negocio ya tomadas (gastos en caja, sin recordatorio 24h) conviven con specs que dicen lo opuesto. El síntoma de fondo: las decisiones se aplicaron a los docs de forma despareja — doc7/doc8 avanzaron en algunos cambios (#3/#4/#5/#8/#9) mientras doc5/doc6/doc12/doc13 quedaron en el modelo viejo.

### Top 5 correcciones, por impacto, antes de empezar

1. **[C-01 + C-03] Congelar el modelo de roles** a 2 roles (admin/manager, sin PIN) y propagarlo al enum `staff_role` (doc13), al RBAC (doc5), a doc6/doc12 y al JWT. Sin esto, RLS, middleware y guards se construyen mal.
2. **[C-02 + G-03] Resolver la autenticación de staff**: escribir ADR-013 (password), deprecar ADR-002, y corregir doc5/10/14/15/18/19. Decidir explícitamente y documentar el flujo de reset (por la fricción que doc10 §6 advierte).
3. **[L-01 + L-02] Unificar el modelo de no-show = deuda**: reescribir US-RES-007, borrar toda referencia a `no_show_penalty` y bans por umbral (doc8, doc16), y quitar la línea de out-of-scope de doc7 que lo contradice.
4. **[G-01 + G-02 + C-09] Documentar lo que ya existe**: agregar `reviews`, `push_subscriptions`, `player_favorites`, `feature_flags` a doc6/doc13/doc12, y especificar Web Push al admin + horario silencioso. Recontar "12 RLS / 19 tablas".
5. **[C-04 + C-07 + L-03 + L-04] Barrer los parámetros y scopes obsoletos**: fijar timeout (6 min), eliminar recordatorios 24h/2h, incorporar gastos a la caja, y fijar duración 60 min. Son ediciones mecánicas pero tocan flujos, stories, ADRs y tests.

> Una vez aplicadas, conviene una segunda pasada corta sobre los conteos/prioridades de doc8 (C-10) y los valores menores (C-05, C-06, C-11, C-12, C-13), que son baja severidad pero erosionan la confianza en el documento.
