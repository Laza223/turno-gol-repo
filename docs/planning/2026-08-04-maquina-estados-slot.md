# Máquina de estados del slot — insumo técnico para Fase 3

**Versión:** 1.0 — 2026-08-04
**Satisface:** criterio de entrada #1 de Fase 3 (`docs/planning/2026-08-01-decisiones-de-fase-v2.md` §3, línea 111): *"máquina de estados del slot documentada cubriendo TODAS las combinaciones reales de reserva+seña+cancelación, no solo los 6 estados felices"*.
**NO satisface** (ni pretende): el criterio de entrada #2 de Fase 3 — prototipo navegable mostrado a ≥3 dueños/encargados prospecto. Eso sigue siendo tarea comercial de Lazar. Este documento es el mapa técnico de qué existe hoy; no diseña la UI nueva de Fase 3 ni decide qué construir.

No existía ningún borrador previo de este documento en el repo (confirmado por grep exhaustivo). Compone tres fuentes que hoy viven separadas y parcialmente desactualizadas entre sí: la máquina de estados de la entidad `Booking` (`docs/spec/doc6_entidades.md`), el mapa visual de la grilla (`docs/spec/design-system/pages/grilla.md` §2 + `BookingCard.tsx`), y el código real de transición (`booking.state-machine.ts` + los servicios que lo invocan).

---

## 1. La máquina de estados de la entidad `Booking`

`booking_status` (enum, `src/shared/db/migrations/002_enums.sql:55-63`, sin cambios desde su creación) tiene 7 valores:

```
pending_payment · confirmed · expired · canceled_refunded · canceled_no_refund · completed · no_show
```

Fuente de verdad de las transiciones válidas: `src/modules/bookings/booking.state-machine.ts`.

```
                    PENDING_PAYMENT
                    /            \
      pago OK /               timeout 6min /
      o sin seña requerida        rescate MP falla
              ▼                            ▼
          CONFIRMED                    EXPIRED  (terminal real)
         /   |   |   \
        /    |   |    \
  cancela  cancela  auto-      admin marca
  CON      SIN      complete   no_show
  reembolso reembolso (30min    (ends_at
        \    /       tras       ya pasado)
         \  /        ends_at)        |
    CANCELED_*                       |
    (terminal real,     COMPLETED ◄──┘
     2 sabores)              │    ▲
                    admin     │    │ admin
                    marca     ▼    │ revierte
                    no_show  NO_SHOW  (≤24h)
                    (≤24h)      │
                                └── (terminal pasadas 24h)
```

### Tabla de transiciones (actor + trigger real + efecto secundario)

| Desde | Hacia | Actor real | Trigger / código | Efecto secundario |
|---|---|---|---|---|
| `pending_payment` | `confirmed` | sistema (webhook MP) o admin (cobro manual) | `transitionFromPendingPayment` (`booking.concurrency.ts:21`) — llamado por `handleApproved` (webhook) o `confirmManualDepositPayment` (admin) | `deposit_status→'paid'`, email confirmación, cash_flow si corresponde |
| `pending_payment` | `expired` | sistema (cron/job) | `expirePendingBookingWithPolicy` (`booking.expiry.ts:134`) — job per-booking a 6 min (no 15, pese al comentario del worker) + sweep cada 5 min | Slot liberado, email `deposit_expired`; si había transferencia `in_process`, alerta admin |
| `confirmed` | `canceled_refunded` | jugador o admin | `cancelByPlayer`/`cancelByAdmin` (`booking.cancellation.ts`) — solo si hubo seña **pagada** y corresponde reembolso (ver §4) | Refund vía MP (saga `prepareRefund`+`settleRefund`) o "resolver offline" si la seña fue en efectivo |
| `confirmed` | `canceled_no_refund` | jugador o admin | ídem, cuando NO corresponde reembolso | `deposit_status→'captured'` si había seña pagada; sin reembolso |
| `confirmed` | `completed` | admin o sistema (cron) | `completeBooking` (admin, exige `ends_at` pasado) / `autoCompleteOverdueBookings` (cron cada 30 min, `ends_at + 30min` de gracia) | Ninguno — la caja no se mueve sola |
| `confirmed` | `no_show` | admin exclusivamente | `markNoShow` (`booking.service.ts:608`), exige `ends_at` ya pasado (RI #5 — no alcanza con que haya empezado el turno) | Si `deposit_status='paid'` → `'captured'`; softban por reincidencia (§5) |
| `completed` | `no_show` | admin exclusivamente | corrección de 24h (migr. 030), `markNoShow` con ventana `NOW()-updated_at < 24h` | Igual que arriba |
| `no_show` | `completed` | admin exclusivamente | corrección inversa de 24h (migr. 060, RI #1), `revertNoShow` (`booking.service.ts:701`) | Limpia el strike de softban (§5); **la seña ya capturada NO se auto-reembolsa** |

`expired`, `canceled_refunded`, `canceled_no_refund` son terminales reales — el trigger de DB (`enforce_booking_invariants_fn`, definición vigente en `060_no_show_to_completed_correction.sql:39-102`) rechaza cualquier `UPDATE` sobre ellos, sin excepción (salvo la anonimización ARCO, que solo permite `player_id→NULL`). `completed`/`no_show` son terminales con la única excepción del par de correcciones de 24h de arriba.

**Nota — código muerto en `ACTOR_RULES`:** la tabla de actores declara `'admin'` como válido para `pending_payment→confirmed` y `'system'` para `confirmed→canceled_*`, pero ningún caller real los ejercita — `transitionFromPendingPayment` siempre pasa `actor:'system'` (incluso cuando lo dispara un admin cobrando en efectivo), y `cancelByPlayer`/`cancelByAdmin` nunca llaman `assertTransition`/`canTransition` en absoluto (el enforcement real de "quién cancela" es la Server Action que los envuelve, con el trigger de DB como backstop). No es un bug — es una state machine más permisiva en el papel de lo que el código realmente usa.

**Reprogramación NO existe** como transición de un booking normal: no hay ninguna función "mover una reserva confirmada a otro horario". El único camino real es cancelar + crear uno nuevo. (`rescheduleMatch` de torneos es otra cosa: relinkea un partido a una hora que el torneo ya posee, sin tocar `bookings.status`.)

---

## 2. Los ejes que determinan el estado VISUAL del slot

El estado visual que pinta la grilla **no es 1:1 con `booking_status`**. Es una combinación derivada de 5 ejes, evaluados en un orden de prioridad fijo (`BookingCard.tsx:59-141`, función `slotVisual`):

```
type === 'tournament'  >  type === 'block'  >  status === 'no_show'  >  status === 'completed'
  >  status === 'pending_payment'  >  deposit_status ∈ {paid, captured}  >  type === 'fixed'
  >  (default: confirmed sin seña) "Confirmada"
```

1. **`status`** (7 valores, §1).
2. **`type`** (4 valores desde migr. 062 — `booking_type` original solo tenía 3, `002_enums.sql:49-53`; `tournament` se agregó con `ALTER TYPE booking_type ADD VALUE IF NOT EXISTS 'tournament'`, `062_tournaments_tables.sql:211`):
   - `spontaneous` — reserva normal (online o manual).
   - `fixed` — instancia generada por un abonado (`abonado_id` seteado).
   - `block` — bloqueo de cancha, `price_snapshot=0`, sin dueño.
   - `tournament` — hora entera poseída por un torneo (`tournament_id` seteado, `price_snapshot=0` forzado por `reserveTournamentSlots`, no por CHECK de DB).
3. **`deposit_status`** (5 valores, `002_enums.sql:65-71`): `not_required · pending · paid · refunded · captured`.
4. **`canceled_by`/`canceled_reason`**: quién y por qué (solo relevante para `canceled_*`, no afecta la grilla porque esos estados nunca llegan ahí — ver §3).
5. **"Pasado"** (derivado, no columna): `ends_at < NOW()` — modificador visual (`opacity-60 saturate-50`), no cambia el estado base.

---

## 3. Brecha clave: la grilla y `/reservas` muestran universos distintos

**La grilla (`/grilla`) filtra en la query server-side** (`src/app/(admin)/grilla/page.tsx:63`):

```sql
bookings.status IN ('confirmed', 'pending_payment', 'completed', 'no_show')
```

`canceled_refunded`, `canceled_no_refund` y `expired` **nunca llegan al cliente de la grilla**. En cuanto un booking transiciona a cualquiera de esos 3 estados, el slot vuelve a leerse como **libre** (rebookeable), sin ningún rastro visual — ni siquiera transitorio. Esto es consistente con el exclusion constraint anti-solapamiento (`WHERE status IN ('pending_payment','confirmed')`, `041_booking_physical_instants_enforce.sql:11-17`): un slot cancelado/expirado nunca bloquea una nueva reserva, así que "se ve libre" es funcionalmente correcto — pero significa que la grilla no comunica "acá hubo una cancelación reciente".

**La lista `/reservas` sí los muestra** (`src/app/(admin)/reservas/status-visual.tsx:27-73`): `canceled_refunded`/`canceled_no_refund` → "Cancelada" (mismo label para ambos, el detalle de reembolso vive en la línea secundaria), `expired` → "Expirada", con un badge neutro compartido (`NEUTRAL_BADGE`) para los 3. Es la única vista del admin donde una cancelación queda visible después del hecho.

Esto **no es un bug** — es una decisión de diseño implícita (grilla = "qué cancha está ocupada ahora", reservas = "historial") que nunca se escribió como tal. Fase 3 tiene que decidir si la mantiene explícitamente o la revisa (§6).

---

## 4. Cancelación: quién decide el reembolso

Dos funciones separadas, sin código compartido de decisión — cada una expone la misma forma `{shouldRefund, inPolicy}` pero con reglas distintas:

**`cancelByPlayer`** (`booking.cancellation.ts:164-293`): solo el dueño de la reserva, solo si `status==='confirmed'`. `shouldRefund = inPolicy && hadPaidDeposit` (política horaria del tenant vs. `starts_at`). Una reserva sin seña pagada nunca puede terminar en `canceled_refunded`, esté o no dentro de plazo.

**`cancelByAdmin`** (`booking.cancellation.ts:302-460`), vía `decideAdminRefund` (línea 39-55, función pura):
```
turno YA terminado (nowMs >= ends_at)  →  shouldRefund = false, SIEMPRE (incluso motivo 'complejo')
cancellationType === 'complejo'        →  shouldRefund = true  (salvo el guard de arriba)
cancellationType === 'jugador'         →  shouldRefund = inPolicy  (misma política que cancelByPlayer)
```
El **motivo** ("el complejo canceló" vs. "el jugador pidió cancelar por teléfono") decide el reembolso — no una casilla suelta que el admin tilda a ojo. `canceled_reason` se prefija con la etiqueta (`"Cancelado por el complejo: ..."` / `"Cancelado a pedido del jugador: ..."`).

Ambas funciones, si la seña fue en efectivo/transferencia (sin `payment_id` de MP), marcan `deposit_status→'refunded'` como una **obligación a resolver offline** entre jugador y complejo — no hay reembolso automático de efectivo. Si el `payment_id` de MP existe pero el pago nunca se aprobó (dato legacy o corrupto), la cancelación tira `RefundUnavailableError` en vez de mentir con un `canceled_refunded` que nadie va a cobrar.

**Reembolso NO es instantáneo con la cancelación**: `prepareRefund` (deja un intent en `payments`) corre dentro de la misma transacción que la cancelación; `settleRefund` (la llamada real a MP) corre después del commit. Si `settleRefund` falla, la cancelación ya es válida e irreversible — queda una ventana donde `deposit_status='refunded'` pero la plata todavía no salió de MP (mitigado con alerta a Sentry, sin retry automático).

---

## 5. No-show: seña capturada + softban, sin reembolso automático en la reversión

`markNoShow` captura la seña pagada (`deposit_status: paid→captured`) en el **mismo** UPDATE que la transición (el trigger de DB bloquea un segundo UPDATE sobre un booking ya terminal). `handleNoShow` (`booking.cancellation.ts:475-513`) además dispara `applyNoShowStrike` (`ptr.service.ts:105-138`): incrementa `noshow_count`, y la **2da ausencia dentro de 90 días** (`NO_SHOW_STRIKE_WINDOW_DAYS`) dispara un softban de **14 días** (`NO_SHOW_SOFTBAN_DAYS`) vía `tenant_player_bans`.

Al revertir (`no_show→completed`, ≤24h): `revertNoShowStrike` decrementa el contador y **levanta el softban solo si fue auto-creado por ese strike** (un ban manual del complejo nunca se toca). **La seña ya capturada NO se revierte** — decisión de auditoría explícita (2026-07-21): "no hay forma de saber si el complejo ya la cobró/aplicó al turno, y un refund automático movería plata sin decisión humana". Esto significa que el estado visual "Ausente" y el estado "Jugada" pueden convivir con el MISMO `deposit_status='captured'` tras una corrección — la plata no vuelve aunque el estado sí.

---

## 6. Tabla combinatoria — TODAS las combinaciones reales

No los "6 estados felices": las combinaciones que el código realmente produce, con qué muestra la grilla HOY y qué significa en plata.

| # | `status` | `type` | `deposit_status` | ¿Grilla lo muestra? | Label/color hoy (grilla) | Semáforo de plata |
|---|---|---|---|---|---|---|
| 1 | `pending_payment` | `spontaneous` | `pending` | Sí | "Esperando seña" — ámbar | Te deben la seña |
| 2 | `confirmed` | `spontaneous` | `not_required` | Sí | "Confirmada" — azul (`info`) | Cobrás todo al llegar |
| 3 | `confirmed` | `spontaneous` | `paid` | Sí | "Señada" — verde | Seña asegurada, resto al llegar |
| 4 | `confirmed` | `spontaneous` | `captured` | Sí | "Señada" — verde (mismo color que `paid`, `slotVisual` no distingue) | Seña ya cobrada (venía de un no-show revertido, caso raro) |
| 5 | `confirmed` | `fixed` (abonado) | `not_required` | Sí | "Abonado" — azul, ícono `Repeat` (nunca llega con seña — abonados no pagan seña) | Cobrás al llegar, es recurrente |
| 6 | `confirmed` | `tournament` | `not_required` | Sí | "Torneo" — ámbar rayado, ícono `Trophy` (prioridad más alta, tapa cualquier otra rama) | `price_snapshot=0` — la plata ya entró por inscripción, no por esta hora |
| 7 | `confirmed` | `block` | `not_required` | Sí | "Bloqueado" — gris rayado | Sin plata involucrada |
| 8 | `completed` | cualquiera | `paid`/`captured`/`not_required` | Sí | "Jugada" — verde fuerte | Turno prestado; si `deposit_status` no llegó a `captured`/no hubo cobro de mostrador, es el caso "terminado sin cobrar" que Fase 3 debe alarmar |
| 9 | `no_show` | cualquiera | `captured` (si había seña) | Sí | "Ausente" — rojo | Único costo real cobrado es la seña; el resto del precio nunca se cobra |
| 10 | `no_show` | cualquiera | `not_required` | Sí | "Ausente" — rojo (igual que #9, sin distinguir si hubo o no plata capturada) | Cero plata cobrada — el semáforo rojo no distingue esto de #9 hoy |
| 11 | `canceled_refunded` | cualquiera | `refunded` | **No** — vuelve a leerse libre | — (invisible) | Plata devuelta, cero impacto |
| 12 | `canceled_no_refund` | cualquiera | `captured` | **No** — vuelve a leerse libre | — (invisible) | Plata retenida, pero invisible en la grilla — solo se ve en `/reservas` o en Caja |
| 13 | `expired` | `spontaneous` | `pending`→queda así | **No** — vuelve a leerse libre | — (invisible) | Nunca hubo plata (el que no pagó a tiempo) |
| 14 | slot pasado (`ends_at<NOW()`), cualquier `status` de la 1-10 | — | — | Sí, con modificador `opacity-60 saturate-50` sobre el color base | El color base + atenuado | Igual que la fila base, solo visualmente apagado |
| 15 | slot libre, cancha `offline` | n/a (sin booking) | n/a | Sí | "Libre pasado / cancha pausada" — `bg-muted/40`, no interactivo | Sin plata — cancha no reservable |

**Combinaciones que el código permite pero son transitorias/raras y vale la pena que Fase 3 sepa que existen:**
- `confirmed` con `deposit_status='refunded'` **sin** estar cancelado: no ocurre en el flujo normal (el refund siempre acompaña una cancelación), pero no hay ningún CHECK de DB que lo impida — si algún día un caller nuevo desincroniza esa combinación, la grilla la mostraría como fila #2 ("Confirmada") sin ninguna señal de que hubo un reembolso.
- Torneo + `no_show`: el código lo permite (`type='tournament'` no excluye `markNoShow`), pero conceptualmente es raro — un equipo de torneo no "no-shows" una hora completa de la misma manera que un jugador espontáneo. `slotVisual` prioriza `type==='tournament'` PRIMERO, así que un torneo nunca se ve como "Ausente" aunque el `status` diga `no_show` por debajo — esto puede ser sorpresa para el admin si algún día marca no-show sobre una hora de torneo.

---

## 7. Brechas de documentación encontradas (documentadas, no resueltas acá)

- **`docs/spec/doc6_entidades.md:210,325-331`** no incluye `type='tournament'` en la tabla de tipos de booking (migr. 062) ni en el diagrama de state machine — desactualizado desde julio 2026.
- **`docs/spec/design-system/pages/grilla.md` §2** (líneas 47-61) no tiene fila de "Torneo" pese a que `slotVisual` (código real) lo prioriza por encima de todo lo demás. Está desactualizado en el mismo punto que doc6.
- **`doc6_entidades.md:294`** documenta una transición `pending_payment→expired` "Admin fuerza expiración manualmente" que **no existe en el código** — no hay ninguna Server Action ni ruta que dispare `expirePendingBooking` por intervención humana; el único camino es automático (job + sweep cron). Documentación de una intención que no se implementó (o se descartó sin actualizar el doc).
- **Tres implementaciones de "status-visual" desincronizadas por diseño**: `BookingCard.slotVisual` (grilla, 8 estados, sin canceladas/expiradas), `reservas/status-visual.tsx` (11 estados, incluye canceladas/expiradas, no distingue Señada de Confirmada), y variantes análogas en `canchas/` y `abonados/` con su propio vocabulario. Sincronización hoy es 100% manual (comentario explícito en `GridLegend.tsx:16`: "si cambia uno, cambiar el otro").
- El worker de expiración (`expire-pending-booking.worker.ts:16`) tiene un comentario que dice "armed 15min after creation" — la constante real es `DEFAULT_EXPIRY_SECONDS = 6 * 60` (6 minutos). Comentario desactualizado dentro del propio código, no un problema de doc externo, pero puede confundir a quien lo lea rápido.

---

## 8. REQUIERE INPUT — decisiones de diseño para Fase 3

Ninguna de estas se resuelve en este documento — son decisiones de producto que Fase 3 tiene que tomar explícitamente, no defaults técnicos:

1. **¿La grilla debe mostrar un estado transitorio para cancelada/expirada recién ocurrida**, o el comportamiento actual (vuelve a libre sin ningún rastro, ni siquiera por unos minutos) es el deseado? Hoy es 100% invisible — un admin que no estaba mirando la pantalla en el momento exacto de la cancelación nunca se entera por la grilla.
2. **El criterio de salida de Fase 3 "terminado sin cobrar como única alarma visual"** — ¿aplica igual a un `no_show` con `deposit_status='not_required'` (cero plata capturada, fila #10) que a uno con `'captured'` (fila #9)? Hoy `slotVisual` los pinta idéntico (rojo, "Ausente"), sin distinguir "no cobré nada" de "cobré la seña, me deben el resto". Si la nueva grilla va a alarmar por plata pendiente, esta distinción probablemente importa.
3. **¿Unificar las 3 implementaciones de status-visual** (grilla/reservas/canchas/abonados) en una fuente única, o mantenerlas separadas a propósito porque cada vista necesita un vocabulario distinto (grilla = ocupación en vivo, reservas = historial completo)? Afecta directamente el alcance de "colores por estado de cobro" que pide el criterio de salida #1 de Fase 3.
4. **Torneo + no-show** (§6, combinación rara): ¿el panel lateral de Fase 3 debe permitir marcar no-show sobre una hora de torneo, o esa acción no tiene sentido de producto y debería bloquearse explícitamente?

---

## Fuentes

| Afirmación | Archivo:línea |
|---|---|
| `booking_status` enum, 7 valores | `src/shared/db/migrations/002_enums.sql:55-63` |
| `deposit_status` enum, 5 valores | `src/shared/db/migrations/002_enums.sql:65-71` |
| `booking_type` enum original (3 valores) | `src/shared/db/migrations/002_enums.sql:49-53` |
| `booking_type` + `'tournament'` | `src/shared/db/migrations/062_tournaments_tables.sql:211` |
| Tabla de transiciones + actores | `src/modules/bookings/booking.state-machine.ts` |
| Trigger de inmutabilidad + excepciones 24h | `src/shared/db/migrations/060_no_show_to_completed_correction.sql:39-102` |
| Exclusion constraint anti-solapamiento | `src/shared/db/migrations/041_booking_physical_instants_enforce.sql:11-17` |
| `slotVisual` (lógica visual real de la grilla) | `src/components/booking/BookingCard.tsx:66-141` |
| Filtro de status en la query de grilla | `src/app/(admin)/grilla/page.tsx:63` |
| `computeCells` (qué status llega a pintar celda) | `src/lib/booking/grid-cells.ts:162-171` |
| Mapa visual `/reservas` (con canceladas/expiradas) | `src/app/(admin)/reservas/status-visual.tsx:27-99` |
| Leyenda de grilla, nota de sync manual | `src/components/booking/grid/GridLegend.tsx:16` |
| `decideAdminRefund` | `src/modules/bookings/booking.cancellation.ts:39-55` |
| `cancelByPlayer` / `cancelByAdmin` | `src/modules/bookings/booking.cancellation.ts:164-293` / `302-460` |
| `markNoShow` / `revertNoShow` | `src/modules/bookings/booking.service.ts:608-655` / `701-740` |
| `handleNoShow` / `handleNoShowRevert` | `src/modules/bookings/booking.cancellation.ts:475-513` / `529-569` |
| `applyNoShowStrike` / `revertNoShowStrike` | `src/modules/relationships/ptr.service.ts:105-138` / `175-224` |
| `transitionFromPendingPayment` (primitiva race-safe) | `src/modules/bookings/booking.concurrency.ts:21-57` |
| `expirePendingBookingWithPolicy` (6 min, no 15) | `src/modules/bookings/booking.expiry.ts:134-284` |
| `reserveTournamentSlots`, `price_snapshot=0` | `src/modules/tournaments/tournament-slots.service.ts:87,147` |
| State machine de la entidad (spec original) | `docs/spec/doc6_entidades.md:261-331` |
| Mapa visual de grilla (spec original) | `docs/spec/design-system/pages/grilla.md:33-65` |
