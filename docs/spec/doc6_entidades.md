# DOC 6 — Glosario de Entidades + State Machines
## TurnoGol: El Diccionario del Sistema

> **Propósito**: Definir qué es cada objeto de negocio antes de pensar en tablas de base de datos.
> Si modelás la DB sin esto, terminás modelando malentendidos.
> De este documento sale el schema de DB casi directamente.

> [!NOTE]
> **Atributo propio vs. derivado**: un atributo propio se almacena en DB.
> Un atributo derivado se calcula en runtime y NUNCA se guarda en DB
> (porque si cambia la lógica de cálculo, tenés datos inconsistentes históricos imposibles de corregir).

> [!IMPORTANT]
> **Scope v1**: Este documento NO incluye entidades fuera de scope v1:
> - ~~OpenMatch / MatchParticipant~~ → v1.5 (partidos abiertos)
> - ~~Canchas transformables~~ (parent_court_id) → v1.5
> - ~~Cobro automático de abonados~~ (mp_subscription_id en Abonado) → v1.5
>
> **Ortografía canónica**: se usa `canceled` (americano, una L) en todos los ENUMs.

---

## ENTIDAD 1: Tenant (Complejo Deportivo)

### Definición
Un Tenant es una organización que usa TurnoGol para gestionar su complejo.
En este contexto: un complejo de fútbol. Un Tenant tiene su propia configuración, sus propias canchas, sus propios clientes y sus propios datos — completamente aislados de otros Tenants.

### Atributos propios
```
id                UUID          PK
slug              string        Único. URL amigable: "complejo-san-martin" → turnogol.app/complejo-san-martin
name              string        Nombre del complejo
description       text          Descripción pública
logo_url          string?       URL de la foto del logo (en storage)
cover_url         string?       URL de la foto de portada
address           string        Dirección física
city              string        Ciudad
province          string        Provincia
latitude          decimal?      Para el mapa
longitude         decimal?      Para el mapa
phone             string        Teléfono de contacto
whatsapp          string?       Número de WA del complejo (para mostrar en la página pública)
email             string        Email de contacto
timezone          string        DEFAULT 'America/Argentina/Buenos_Aires'
opening_hours     JSONB         { "mon": {"open": "08:00", "close": "23:00"}, ... }
closed_dates      date[]        Fechas cerradas (feriados, vacaciones) — gestión manual del admin
status            enum          ver state machine (8 estados, def. en Doc 4)
trial_ends_at     timestamp?    Solo si status = 'trialing'
mp_access_token   string        Credencial OAuth de MP del complejo (encriptado at-rest)
mp_refresh_token  string        Token de refresh OAuth MP (encriptado at-rest)
mp_user_id        string?       ID del usuario MP del complejo
mp_public_key     string?       Public key MP del complejo
mp_connected_at   timestamp?    Cuándo conectó su cuenta MP
settings          JSONB         Configuraciones generales (ver desglose abajo)
created_at        timestamp     UTC
updated_at        timestamp     UTC
```

**Desglose del campo `settings` (JSONB):**
```json
{
  "requires_deposit": true,
  "deposit_percentage": 30,
  "cancellation_policy": {
    "hours_before": 12,
    "penalty_type": "deposit",
    "penalty_amount": null
  },
  "accepts_cash": true,
  "accepts_transfer": true,
  "accepts_mercadopago": true,
  "allow_online_booking": true,
  "booking_advance_days": 6,
  "auto_complete_minutes": 30
}
```

### Atributos derivados (NO guardar en DB, calcular)
- `is_open_now` = evaluar `opening_hours` + `closed_dates` contra la hora actual
- `online_courts_count` = COUNT de canchas con status='online'
- `this_month_revenue` = SUM de pagos del mes actual

### State Machine del Tenant

> [!IMPORTANT]
> **8 estados canónicos.** Definición autoritativa en Doc 4 §2. Aquí solo el resumen.

```
TRIALING → ACTIVE → PAST_DUE → SUSPENDED → BLOCKED → CHURNED → DELETED
              ↑                                          ↑
          CANCELED ──── (fin período) ───────────────────┘

En cualquier momento antes de CHURNED: [Paga] → ACTIVE
```

| Estado | Acceso admin | Acceso jugador |
|---|---|---|
| `trialing` | Completo | Completo |
| `active` | Completo | Completo |
| `past_due` | Completo (7 días) | Completo |
| `suspended` | Solo lectura | Puede ver reservas (no crear) |
| `blocked` | Sin acceso | Sin acceso |
| `canceled` | Completo hasta fin período | Completo hasta fin período |
| `churned` | Sin acceso | Sin acceso |
| `deleted` | N/A | N/A |

---

## ENTIDAD 2: Court (Cancha)

### Definición
Una cancha es un espacio físico del complejo donde se juega. Tiene horarios de disponibilidad y precios por franja.

### Atributos propios
```
id                UUID          PK
tenant_id         UUID          FK → tenants
name              string        "Cancha 1", "Cancha Norte", etc.
description       string?       Info adicional (grass sintética, con techo, etc.)
surface_type      enum          'synthetic_grass' | 'natural_grass' | 'cement' | 'tile'
format            integer       Formato de Fútbol (4, 5, 6, 7, 8, 9, 10, 11)
is_covered        boolean       Cancha techada o descubierta
has_lighting      boolean       Cancha con iluminación
capacity          integer       Cantidad de jugadores (ej: format * 2)
photos            string[]      URLs de fotos (en storage)
status            enum          ver state machine (3 estados)
pricing           JSONB         Precios por franja horaria (ver desglose)
created_at        timestamp     UTC
updated_at        timestamp     UTC
```

**Desglose del campo `pricing` (JSONB) — Reglas de puntos de corte flexibles:**
```json
{
  "rules": [
    { "days": ["mon","tue","wed","thu"], "from": "08:00", "to": "18:00", "price": 800000 },
    { "days": ["mon","tue","wed","thu"], "from": "18:00", "to": "23:00", "price": 1200000 },
    { "days": ["fri","sat","sun"],       "from": "08:00", "to": "23:00", "price": 1500000 }
  ]
}
```

> [!NOTE]
> **Reglas de precio**: El admin define franjas ilimitadas con puntos de corte horarios.
> Cada regla especifica días de la semana (`mon`..`sun`), rango horario (`from`/`to` en HH:MM), y precio base en centavos de ARS.
> Los días usan claves `mon|tue|wed|thu|fri|sat|sun` (consistentes con `opening_hours` del Tenant y con `week-days.ts`).
> Validación: Zod schema en `court.schema.ts` (mínimo 1 regla, formato HH:MM, precio positivo).

> [!NOTE]
> **Horarios que cruzan medianoche (día operativo)**: si un complejo abre de 08:00 a 02:00 del
> día siguiente, se usa la convención de "día operativo", habilitada por el flag explícito
> `tenants.closes_next_day = true`. El `opening_hours` del Tenant define el cierre como
> `"close": "02:00"`; con el flag prendido, un día cuyo `close <= open` se interpreta como la
> madrugada del día calendario siguiente (sin el flag, ese cierre es inválido → cero slots).
> Un global flag basta para horarios mixtos: un día con `close > open` (ej. `23:00`) queda
> same-day aunque el flag esté prendido.
>
> Consecuencias de almacenamiento:
> - **`bookings.date` = día OPERATIVO, no calendario**. Un turno a la 01:00 del martes calendario
>   que pertenece al lunes operativo se guarda con `date = lunes`. Así `daily_cash_closes.date`,
>   caja y reportes agrupan toda la noche junta.
> - El slot 23:00→00:00 se almacena como `time_start='23:00'`, `time_end='24:00'`. Postgres acepta
>   `'24:00'` como TIME válido y `'24:00' > '23:00'`, así que pasa `chk_time_valid`. Los slots
>   post-medianoche (00:00→01:00, 01:00→02:00) usan horas de pared normales.
> - La grilla del admin renderiza las madrugadas DESPUÉS de las 23:00 (al final), no al principio.

### Atributos derivados (NO guardar en DB)
- `price_for(datetime)` = evalúa `pricing` contra el horario para retornar el precio correcto
- `is_available_for(date, time_start, time_end)` = consulta si tiene conflictos en ese rango

### State Machine de la Cancha

```
ONLINE ⇄ OFFLINE
(El admin puede pasar una cancha a OFFLINE por mantenimiento,
feriado o cierre permanente. OFFLINE no acepta reservas nuevas.)
```

| Estado | Descripción | Puede recibir reservas |
|---|---|---|
| `online` | Funcionando normalmente, visible en app | ✅ Sí |
| `offline` | Desactivada (mantenimiento, cierre temporal o permanente) | ❌ No (las existentes se mantienen) |

### Invariantes de la Cancha

1. **Una cancha `OFFLINE` no puede recibir reservas nuevas** (pero las reservas existentes se mantienen hasta que el admin las gestione).
2. **Al poner offline una cancha con reservas futuras**: Warning al admin: "Hay {N} reservas futuras que se cancelarán."
3. **Las `pricing.rules` deben cubrir todos los horarios del complejo** (validación al guardar).

---

## ENTIDAD 3: Booking (Reserva)

### Definición
Una reserva es la asignación exclusiva de una cancha a un grupo en un horario específico.
Es la entidad central del sistema — todo gira alrededor de ella.

### Atributos propios
```
id                UUID          PK
tenant_id         UUID          FK → tenants (RLS)
court_id          UUID          FK → courts
player_id         UUID?         FK → players. Null si es un bloqueo o reserva sin jugador registrado
abonado_id        UUID?         FK → abonados. Populated si esta reserva viene de un turno fijo
created_by_staff  UUID?         FK → staff_users. Quién la creó si fue manual
date              date          Fecha de la reserva (en timezone del complejo)
time_start        time          Hora de inicio
time_end          time          Hora de fin
type              enum          'spontaneous' | 'fixed' | 'block'
status            enum          ver state machine
price_snapshot    integer       Precio en centavos ARS al momento de crear la reserva (inmutable)
deposit_amount    integer       Monto de seña cobrada en centavos (0 si no se exigió seña)
deposit_status    enum          'not_required' | 'pending' | 'paid' | 'refunded' | 'captured'
payment_method    enum?         'mercadopago' | 'cash' | 'transfer' | 'other'
payment_id        UUID?         FK → payments (el cobro de la seña, si es MP)
notes_internal    text?         Notas visibles solo para el staff
notes_player      text?         Notas visibles para el jugador
guest_name        text?         Nombre del jugador si player_id IS NULL (reserva manual sin registrar)
guest_phone       text?         Teléfono del jugador si player_id IS NULL
canceled_reason   text?         Motivo de cancelación (si aplica). Cancelación admin (cambio #3): prefijado con el tipo, p.ej. "Cancelado por el complejo: {motivo}" / "Cancelado a pedido del jugador: {motivo}"
canceled_by       enum?         'player' | 'admin' | 'system' (quién ejecutó la acción; el TIPO complejo/jugador va en canceled_reason + audit metadata)
canceled_at       timestamp?    Cuándo se canceló
created_at        timestamp     UTC
updated_at        timestamp     UTC
```

> **Cancelación por admin — tipo decide el reembolso (cambio #3)**: el admin indica
> primero *quién* cancela. "El complejo" reembolsa siempre; "el jugador" aplica la
> política horaria. El AuditLog `booking.canceled_by_admin` guarda
> `metadata = { reason, cancellationType: 'complejo'|'jugador', inPolicy, shouldRefund, depositStatus }`.
> No hay columna nueva: el tipo se persiste en `canceled_reason` (prefijo) y en el audit. Ver Doc 7, Flujo 4C.

### Atributos derivados (NO guardar en DB)
- `duration_minutes` = EXTRACT minutos entre `time_end` y `time_start`
- `is_past` = `date + time_end < NOW()`
- `is_cancellable_without_penalty` = evalúa política del complejo vs tiempo restante
- `effective_price` = `price_snapshot` (siempre el del momento de creación)

#### Cobros de turno (cambio #8 — atributos derivados, NO en DB)
La seña no es el único cobro: el resto se cobra en el mostrador. Estos valores se
calculan a demanda (no se materializan), sumando seña + CashFlows del booking:
- `deposit_counted` = `deposit_amount` si `deposit_status ∈ {paid, captured}`, si no `0`
  (la seña reembolsada o no exigida no cuenta como dinero cobrado)
- `charges_total` = Σ `cash_flows.amount` donde `type='income'` y `booking_id` = esta reserva
- `amount_paid` = `deposit_counted` + `charges_total`
- `amount_pending` = `max(0, price_snapshot − amount_paid)`

> Los cobros de mostrador son CashFlows `income`/`booking` con `booking_id` (no entidades
> nuevas). La seña se trackea aparte en `deposit_amount`/`payments`, por eso `charges_total`
> NO incluye la seña: sumarlos no duplica. Ver Doc 7, Flujos 2/3.

### Relaciones
- Pertenece a: 1 Tenant
- Pertenece a: 1 Court
- Puede tener: 1 Player (el responsable)
- Puede pertenecer a: 1 Abonado (si es turno fijo)
- Puede tener: 1 Payment (la seña)
- Genera: N AuditLog entries

### State Machine de la Reserva (EL MÁS CRÍTICO DEL SISTEMA)

```
                            PENDING_PAYMENT
                            /      |      \
              pago OK    /         |       \ timeout (6min)
                        /   sin seña required \ 
                       ▼          ▼             ▼
                  CONFIRMED    CONFIRMED      EXPIRED
                    /    \
   cancela a tiempo/      \cancela tarde
                  /        \
                 ▼          ▼
    CANCELED_REFUNDED   CANCELED_NO_REFUND
                  \          /
                   ▼        ▼
               (slot liberado)
                    |
            (llega la hora)  
               /          \
     player    /            \  no show
     presente /              \
             ▼                ▼
         COMPLETED          NO_SHOW
```

**Transiciones válidas detalladas:**

| Desde | Hacia | Trigger | Efecto secundario |
|---|---|---|---|
| `pending_payment` | `confirmed` | Pago de seña procesado por MP | Email confirmación al jugador |
| `pending_payment` | `confirmed` | No requiere seña (depósito 0% o reserva manual sin seña) | Email confirmación |
| `pending_payment` | `expired` | Timeout 6 min sin pago | Slot liberado |
| `pending_payment` | `expired` | Admin fuerza expiración manualmente | Slot liberado, email al jugador |
| `confirmed` | `canceled_refunded` | Jugador cancela dentro del plazo de la política | Refund de seña vía MP, email confirmación. Si seña efectivo: "Contactá al complejo" |
| `confirmed` | `canceled_no_refund` | Jugador cancela fuera del plazo | Sin reembolso, deposit_status → 'captured', email con info |
| `confirmed` | `canceled_no_refund` | Admin cancela con cargo | Sin reembolso |
| `confirmed` | `canceled_refunded` | Admin cancela sin cargo | Reembolso si había seña, email disculpa |
| `confirmed` | `completed` | Auto-complete: 30 min después de `time_end` si nadie marcó (job cada 30 min) | Ninguno (caja no se mueve automáticamente) |
| `confirmed` | `no_show` | Admin marca "No vino" (ya pasó `time_end`) | Softban por reincidencia (cambio #5, revisado 2026-07-11): captura la seña (`deposit_status='captured'`, único costo real) y registra la ausencia en `player_tenant_relationships.noshow_count` + `last_no_show_at`. La 2da ausencia dentro de `NO_SHOW_STRIKE_WINDOW_DAYS` (90 días) dispara un bloqueo de `NO_SHOW_SOFTBAN_DAYS` (14 días) para reservar online, vía una fila en `tenant_player_bans`. Lógica en `handleNoShow` (`booking.cancellation.ts`) → `applyNoShowStrike` (`ptr.service.ts`). |
| `completed` | — | — | Estado final inmutable |
| `expired` | — | — | Estado final |
| `no_show` | — | — | Estado final inmutable |

> [!NOTE]
> **Estados terminales**: `completed`, `no_show` y `expired` son finales con una excepción:
> la transición `completed → no_show` está **permitida dentro de las 24 horas** posteriores
> al auto-complete (corrección de asistencia, habilitada por trigger `enforce_booking_invariants_fn`).
> Pasadas las 24h, `completed` es inmutable. `no_show` y `expired` son siempre inmutables.
> Cualquier ajuste contable posterior al cierre de caja se registra como un `CashFlow` `adjustment` NUEVO.

### Invariantes de la Reserva

1. **No pueden existir dos reservas en estado `confirmed` o `pending_payment` en la misma cancha con overlap de horario** (DB constraint de exclusión con `btree_gist`).
2. **`price_snapshot` nunca se modifica después de la creación**.
3. **Una reserva en estado `no_show` es completamente inmutable** (no se puede volver a `completed`).
4. **`time_end` debe ser mayor a `time_start`** (`chk_time_valid`, validación obligatoria). El slot que termina en la medianoche calendario se guarda con `time_end='24:00'` — un TIME válido y `> '23:00'`, por lo que satisface el constraint (no se usa `'00:00'`, que lo violaría). Día operativo: ver la nota de "Horarios que cruzan medianoche".
5. **`date` debe ser mayor o igual a hoy** al crear (se admiten reservas retroactivas del mismo día operativo).

### Tipos de booking

| Type | Descripción | player_id | abonado_id |
|---|---|---|---|
| `spontaneous` | Reserva normal (online o manual) | Requerido si online, opcional si manual | NULL |
| `fixed` | Instancia de turno fijo | Opcional (puede ser el contacto del abonado) | Requerido |
| `block` | Bloqueo de horario (evento privado, feriado, mantenimiento) | NULL | NULL |

### CHECK constraints recomendados
```sql
CHECK (type = 'block' OR player_id IS NOT NULL OR created_by_staff IS NOT NULL)
CHECK (type != 'fixed' OR abonado_id IS NOT NULL)
```

---

## ENTIDAD 4: Abonado (Turno Fijo Recurrente)

### Definición
Un Abonado es un acuerdo entre el complejo y un grupo de jugadores para ocupar la misma cancha, el mismo día de la semana y el mismo horario, de forma recurrente. El Abonado genera automáticamente instancias de Booking semana a semana.

> [!IMPORTANT]
> **En v1, el pago del abonado es 100% manual.** El complejo cobra al jugador cuando va a jugar
> (efectivo, transferencia, o como arreglen). TurnoGol no interviene en el cobro del turno fijo
> ni lleva saldo a favor del abonado (sistema de crédito modelo ATC evaluado y descartado para
> fútbol, 2026-07-10 — ver `docs/planning/cambios-reglas-negocio.md` cambio #4).

### Atributos propios
```
id                UUID          PK
tenant_id         UUID          FK → tenants
court_id          UUID          FK → courts
player_id         UUID?         FK → players (el responsable del grupo, si está registrado)
contact_name      string        Nombre del contacto (puede no ser jugador registrado)
contact_phone     string        Teléfono del responsable del abono
day_of_week       integer       0=Domingo, 1=Lunes, ..., 6=Sábado
time_start        time          Hora de inicio semanal
time_end          time          Hora de fin semanal
price_per_session integer       Precio por sesión en centavos (puede diferir del precio de lista)
starts_on         date          Primera fecha del turno fijo
ends_on           date?         Última fecha (null = indefinido)
status            enum          'active' | 'paused' | 'canceled'
payment_method    enum          'cash' | 'transfer' (default: 'cash')
notes             text?         Notas internas del staff
created_at        timestamp     UTC
updated_at        timestamp     UTC
```

### Relación con Booking

```
Abonado (la regla)
    │
    │ genera semana a semana
    ▼
Booking (cada instancia)
  booking.abonado_id = abonado.id
  booking.type = 'fixed'
  booking.status comienza en 'confirmed' (sin seña, el abono implica compromiso)
```

**¿Cuándo se generan las instancias?**
- Al crear el Abonado: se generan slots para las próximas 8 semanas
- Job semanal: verifica si quedan menos de 4 semanas generadas → genera 4 más
- Esto evita tener que generarlas para toda la vida del abono desde el día 1

### State Machine del Abonado

```
ACTIVE ──── admin pausa ──── PAUSED
  │              ▲               │
  │              └── admin reactiva
  │                              │
  └──── admin cancela ──── CANCELED
                                 │
PAUSED ──── admin cancela ────── ┘
```

| Estado | Descripción | Genera instancias |
|---|---|---|
| `active` | Turno fijo activo, genera bookings semanales | ✅ Sí |
| `paused` | Temporalmente pausado, instancias futuras eliminadas | ❌ No |
| `canceled` | Cancelado definitivamente | ❌ No |

### Invariantes del Abonado

1. **No puede existir un Abonado activo en la misma cancha + día + horario con overlap**.
2. **Si se pausa el abono, las instancias de booking futuras se eliminan** (el slot queda libre).
3. **Si se cancela, las instancias futuras se eliminan** (las pasadas permanecen en historial).
4. **El `price_per_session` puede diferir del precio de lista** — es un precio acordado privadamente.

> **Sin saldo a favor**: el abonado NO lleva `credit_balance` ni precio mensual — el sistema de
> crédito estilo ATC (carga de saldo + "Mantener saldo") fue evaluado y **eliminado** (2026-07-10,
> ver `docs/planning/cambios-reglas-negocio.md` cambio #4). La deuda de dinero por no-show
> (`player_tenant_relationships.balance`, cambio #5 original) **también fue revertida** (2026-07-11,
> migr. 044): hoy el no-show es un softban por reincidencia, sin deuda (ver ENTIDAD 6).

---

## ENTIDAD 5: Player (Jugador)

### Definición
Un jugador es un usuario del B2C de TurnoGol. Es **cross-tenant**: puede reservar en múltiples complejos con una sola cuenta. No pertenece a ningún Tenant específico.

### Atributos propios
```
id                UUID          PK
email             string        Único. Usado para autenticación (magic link)
phone             string?       Teléfono (opcional en el registro)
first_name        string
last_name         string
avatar_url        string?
preferred_area    string?       Ciudad/zona preferida
status            enum          'active' | 'banned' | 'anonymized'
agreed_to_terms_at timestamp?   Timestamp de aceptación de TyC y declaración jurada +18 (ADR-012)
terms_version     string?       Versión de TyC aceptada (ej: '2026-04')
ban_reason        string?       Motivo del ban global (si status='banned') o 'LEY_25326_DATA_DELETION' (si status='anonymized')
ban_until         timestamp?    Fecha de expiración del ban global (NULL = permanente)
created_at        timestamp     UTC
last_login_at     timestamp?    UTC
```

> [!NOTE]
> **`agreed_to_terms_at` y `terms_version`**: NO son NULL para Players que se registran solos
> (aceptan TyC en el registro). Pueden ser NULL para Players creados por admin (reserva manual).
> **`status`**: `banned` = ban global del sistema (solo el sistema lo setea, no un admin de complejo).
> `anonymized` = eliminación ARCO Ley 25.326. Bans per-tenant usan `tenant_player_bans`.

### Atributos derivados
- `full_name` = `first_name + ' ' + last_name`
- `total_bookings` = COUNT de reservas completadas en todos los complejos
- `no_show_rate` = no_shows / total_bookings_pasadas

### Relaciones
- Puede tener: N Bookings en N Tenants distintos
- Tiene: N PlayerTenantRelationship (relaciones con complejos)

---

## ENTIDAD 6: PlayerTenantRelationship (Relación Jugador ↔ Complejo)

### Definición
Tabla intermedia que registra la relación entre un jugador cross-tenant y un complejo.
Se crea automáticamente la primera vez que un jugador hace una reserva en un complejo.

### Atributos propios
```
id                UUID          PK
player_id         UUID          FK → players
tenant_id         UUID          FK → tenants
status            enum          'active' | 'blocked'
first_seen_at     timestamp     Primera reserva en este complejo
bookings_count    integer       Total de reservas (actualizado por triggers)
noshow_count      integer       No-shows dentro de la ventana de reincidencia (escrito por applyNoShowStrike; se reinicia tras 90 días sin faltar)
last_no_show_at   timestamp?    Fecha del último no-show (para la ventana de reincidencia)
last_booking_at   timestamp?    Última reserva en este complejo
data_consent_at   timestamp     Consent de datos Ley 25.326 (set en primera reserva)
created_at        timestamp     UTC
```

> [!NOTE]
> `bookings_count` se actualiza por triggers en INSERT/UPDATE de bookings. `noshow_count` y
> `last_no_show_at` los escribe la app (`applyNoShowStrike`, `ptr.service.ts`) al marcar un no-show,
> NO un trigger: `noshow_count` cuenta las ausencias dentro de la ventana de reincidencia
> (`NO_SHOW_STRIKE_WINDOW_DAYS` = 90 días); la 1ra ausencia (o la 1ra tras 90 días sin faltar) solo
> se registra, y la 2da dentro de la ventana dispara un softban de `NO_SHOW_SOFTBAN_DAYS` = 14 días
> para reservar online, insertando una fila en `tenant_player_bans` (mismo gate que `checkPlayerBanned`
> ya lee — no hay deuda de dinero). La columna `balance` fue eliminada (migr. 044).
> `data_consent_at` es evidencia de consent por-complejo para Ley 25.326.

---

## ENTIDAD 7: StaffUser (Usuario del Sistema)

### Definición
Un StaffUser es la persona que administra un Tenant. Hay **2 roles** (Modelo ATC): `admin` (dueño, acceso total; único que conecta MP, edita precios, configuración general, factura y gestiona staff) y `manager` (encargado permisivo: grilla/reservas/caja, reportes y métricas). El gating de acciones sensibles es por **rol** en la capa de aplicación (`requireAdminStaff` / `requireOperatorStaff`), **sin sistema de PIN**.

### Atributos propios
```
id                UUID          PK
email             string        Único. Autenticación staff: email + contraseña (ADR-013; ADR-002 magic link deprecado para staff)
first_name        string
last_name         string
phone             string?
status            enum          'active' | 'inactive'
created_at        timestamp
last_login_at     timestamp?
```

### Tabla de relación StaffUser ↔ Tenant

```
tenant_staff_members
├── id            UUID
├── tenant_id     UUID      FK → tenants
├── staff_user_id UUID      FK → staff_users
├── role          enum      'admin' | 'manager' (Modelo ATC, 2 roles; migr. 029 quitó 'read_only')
├── added_by      UUID      FK → staff_users (quién lo agregó)
├── created_at    timestamp
└── is_active     boolean
```

**Por qué mantener la tabla**: permite que un mismo email opere múltiples complejos (con rol potencialmente distinto en cada uno) y desacopla la identidad del usuario de su rol por complejo.

---

## ENTIDAD 8: Payment (Cobro)

### Definición
Representa una transacción financiera asociada a una reserva. Puede ser la seña, el pago completo, o un reembolso.

### Atributos propios
```
id                UUID          PK
tenant_id         UUID          FK → tenants (RLS)
booking_id        UUID?         FK → bookings (null si es pago de suscripción SaaS)
player_id         UUID?         FK → players
amount            integer       En centavos de ARS (evitar decimales)
currency          string        DEFAULT 'ARS'
type              enum          'deposit' | 'full_payment' | 'refund' | 'penalty'
method            enum          'cash' | 'transfer' | 'mercadopago' | 'other'
status            enum          'pending' | 'approved' | 'rejected' | 'refunded' | 'canceled'
mp_payment_id     string?       ID del pago en MercadoPago (para idempotencia)
mp_preference_id  string?       ID de la preferencia de pago generada
description       string?       Descripción del cobro
processed_at      timestamp?    Cuándo se procesó efectivamente
created_at        timestamp     UTC
```

### Invariantes del Payment

1. **Los pagos aprobados son inmutables**: no se editan, se crea un nuevo `Payment` de tipo `refund` si hay que devolver.
2. **`amount` siempre en centavos** para evitar errores de punto flotante (ej: $8.000 ARS = 800000 centavos).
3. **`mp_payment_id` es único** (constraint en DB). Garantiza idempotencia de webhooks.

---

## ENTIDAD 9: CashFlow (Movimiento de Caja)

### Definición
Representa un movimiento de caja del complejo: ingresos, ajustes y gastos.

### Atributos propios
```
id                UUID          PK
tenant_id         UUID          FK → tenants
type              enum          'income' | 'adjustment' | 'expense'   (migración 025)
category          enum          'booking' | 'product_sale' | 'other' | 'no_show_correction' | 'operating_expense' (025)
amount            integer       En centavos de ARS
method            enum          'cash' | 'transfer' | 'mercadopago' | 'other'
description       string        Descripción del movimiento
booking_id        UUID?         FK → bookings (cobro de turno vinculado, cambio #8)
registered_by     UUID          FK → staff_users
occurred_at       timestamp     Cuándo ocurrió el movimiento
created_at        timestamp     UTC
```

> [!NOTE]
> **Combinaciones type/category válidas** (CHECK `chk_cashflow_type_category`):
> `income` → `booking` | `product_sale` | `other`;
> `adjustment` → `other` | `no_show_correction`; `expense` → `operating_expense`.

### Atributos derivados
- `daily_balance(date)` = SUM(income) + SUM(adjustment) para ese día
- `monthly_summary(month)` = agrupado por categoría

---

## ENTIDAD 10: DailyCashClose (Cierre de Caja Diario)

### Definición
Registro de cierre de caja al final de cada día operativo. Es inmutable una vez cerrado.

### Atributos propios
```
id                UUID          PK
tenant_id         UUID          FK → tenants
date              date          Fecha del cierre (día operativo)
total_income      integer       Suma de ingresos del día en centavos
total_adjustments integer       Suma de ajustes compensatorios del día en centavos
balance           integer       total_income + total_adjustments
declared_cash     integer?      Efectivo contado en mano (si el admin lo declara)
diff_amount       integer?      Diferencia entre balance y declared_cash
note              text?         Observaciones del cierre
closed_by         UUID          FK → staff_users
closed_at         timestamp     Momento del cierre
created_at        timestamp     UTC
```

### Invariantes
1. **Un cierre de caja es inmutable**. Correcciones posteriores generan CashFlows de `adjustment`.
2. **Solo puede haber un cierre por tenant por fecha.**

---

## ENTIDAD 11: Product — ELIMINADA (cantina en JSONB)

La tabla `products` fue **eliminada** (migr. 046, 2026-07-17). La cantina vive en `tenants.settings.canteen_products` (JSONB: `name`, `price` en centavos, `stock` opcional); la venta se hace con `sellCanteenProductAction` (descuenta stock atómicamente si el producto lo define) → `CashFlow` categoría `product_sale`. Ver doc13 §3.6.

---

## ENTIDAD 12: TenantSubscription (Suscripción SaaS)

### Definición
La suscripción mensual/anual del complejo al servicio de TurnoGol. Completamente separada de los pagos de los jugadores.

### Atributos propios
```
id                UUID          PK
tenant_id         UUID          FK → tenants (UNIQUE — un tenant tiene una sola suscripción activa)
plan_id           UUID          FK → plans
billing_cycle     enum          'monthly' | 'annual'
status            enum          'trialing' | 'active' | 'past_due' | 'suspended' | 'blocked' | 'canceled' | 'churned'
current_period_start  timestamp
current_period_end    timestamp
price_locked_until    timestamp? Para clientes anuales con precio bloqueado
mp_subscription_id    string?   ID de la suscripción en MercadoPago
pending_plan_change   UUID?     FK → plans (si hay un downgrade pendiente)
pending_change_at     timestamp? Cuándo aplicar el cambio pendiente
canceled_at           timestamp? Si canceló
cancellation_reason   text?
scheduled_deletion_at timestamp? 60+7 días post-bloqueo
created_at        timestamp
updated_at        timestamp
```

> [!NOTE]
> `subscription_status` tiene 7 estados (sin `deleted`) porque la suscripción no sobrevive
> a la eliminación del tenant. Cuando el tenant pasa a `deleted`, los datos (incluyendo la
> suscripción) se eliminan. `tenant_status` sí tiene `deleted` como 8vo estado terminal.

---

## ENTIDAD 13: Plan (Plan de Suscripción)

### Definición
Definición global de un plan de suscripción (no por tenant). Los precios y features de cada plan.

### Atributos propios
```
id                    UUID          PK
name                  string        'predio' | 'complejo' | 'estadio'
display_name          string        'Predio' | 'Complejo' | 'Estadio'
max_courts            integer       2 | 5 | NULL (ilimitado)
monthly_price         integer       Precio mensual en centavos (sin IVA)
annual_monthly_price  integer       Precio mensual del plan anual en centavos (sin IVA)
features              JSONB         Feature flags por plan
is_active             boolean       DEFAULT true
created_at            timestamp     UTC
```

**Desglose de `features` (JSONB):**
```json
{
  "history_months": 6,
  "advanced_reports": false,
  "export_formats": ["csv"],
  "api_access": false,
  "priority_support": false
}
```

---

## ENTIDAD 14: Notification (Notificación)

### Definición
Registro de cada notificación enviada o intentada. Permite auditar qué comunicaciones se hicieron y cuáles fallaron.

### Atributos propios
```
id                UUID          PK
tenant_id         UUID?         FK → tenants (null para notificaciones del sistema)
recipient_type    enum          'player' | 'staff' | 'tenant_owner'
recipient_id      UUID          FK → players o staff_users
channel           enum          'email'
trigger_event     string        'booking.confirmed' | 'booking.canceled' | 'abonado.created' | etc. (NO hay recordatorio 24h/2h en v1, cambio #18)
status            enum          'queued' | 'sent' | 'delivered' | 'failed'
content           JSONB         El contenido del mensaje enviado
attempt_count     integer       DEFAULT 1
last_error        text?         Si falló, el error
queued_at         timestamp     Cuándo se encoló
sent_at           timestamp?    Cuándo se envió efectivamente
created_at        timestamp
```

> [!NOTE]
> **Canal v1: solo `email`.** El ENUM se mantiene extensible para agregar `whatsapp` en v1.5.

---

## ENTIDAD 15: AuditLog (Log de Auditoría)

### Definición
Registro inmutable de acciones realizadas en el sistema. Permite trazabilidad completa.

### Atributos propios
```
id                UUID          PK
tenant_id         UUID?         FK → tenants
actor_type        enum          'staff' | 'player' | 'system'
actor_id          UUID?         FK → staff_users o players
entity_type       string        'booking' | 'abonado' | 'court' | 'tenant' | etc.
entity_id         UUID          ID de la entidad afectada
event             string        'booking.created' | 'booking.canceled' | 'abonado.paused' | etc.
metadata          JSONB         Datos adicionales del evento (campos cambiados, valores anteriores)
ip_address        string?       IP del request
occurred_at       timestamp     UTC
created_at        timestamp     UTC
```

---

## ENTIDAD 16: ProcessedWebhook (Webhook Procesado)

### Definición
Tabla de idempotencia para webhooks de MercadoPago. Evita procesar el mismo webhook dos veces.

### Atributos propios
```
id                UUID          PK
mp_event_id       string        UNIQUE — el ID del evento de MercadoPago (no solo pagos, también suscripciones)
event_type        string        'payment' | 'subscription' | 'refund'
raw_payload       JSONB         Payload completo del webhook (para debugging)
processed_at      timestamp     Cuándo se procesó
created_at        timestamp     UTC
```

> [!NOTE]
> **TTL**: se recomienda purgar webhooks procesados de más de 90 días (job de limpieza).

---

## ENTIDAD 17: TenantPlayerBan (Ban de Jugador por Complejo)

### Definición
Ban de un jugador en un complejo específico (no global). Los bans globales se manejan con `players.status = 'banned'`. Un jugador solo puede tener un ban activo por complejo.

### Atributos propios
```
id                UUID          PK
tenant_id         UUID          FK → tenants (RLS)
player_id         UUID          FK → players
reason            string        Motivo del ban
banned_at         timestamp     Cuándo fue baneado
banned_until      timestamp?    NULL = permanente
banned_by         UUID?         FK → staff_users (quién lo baneó)
```

### Invariantes
1. **Un solo ban _activo_ por jugador por complejo** — enforceado con un índice único parcial en DB (`WHERE banned_until IS NULL OR banned_until > NOW()`), NO con un UNIQUE plano. Esto preserva el historial de bans expirados y permite re-banear al mismo jugador sin borrar registros anteriores.
2. Si `banned_until` es NULL, el ban es permanente hasta que un admin lo levante.

---

## ENTIDAD 18: PriceVersion (Versión de Precio de Plan)

### Definición
Historial de precios de los planes SaaS. Cada cambio de precio crea una nueva versión. No se editan las existentes. Soporta el problema del ARS volátil (Doc 4 §5).

### Atributos propios
```
id                UUID          PK
plan_id           UUID          FK → plans
price_monthly     integer       Centavos ARS
price_annual      integer       Centavos ARS (mensualizado)
valid_from        date          Fecha desde la que aplica
valid_until       date?         NULL = vigente
reason            string?       "Ajuste por inflación Q2 2026"
created_at        timestamp     UTC
```

### Invariantes
1. **INSERT only**, nunca UPDATE. Los precios históricos son inmutables.
2. Solo un registro por plan puede tener `valid_until = NULL` (el precio vigente).
3. Los clientes anuales con `price_locked_until` usan el precio de la versión vigente al momento de su suscripción.

---

## ENTIDAD 19: Review (Reseña del Jugador)

### Definición
Reseña post-partido que deja un jugador sobre un complejo (interfaz pública estilo ATC). Tabla **híbrida**: lectura pública (perfil del complejo) + INSERT solo del jugador dueño de un booking `completed`. Una review por booking.

### Atributos propios
```
id                UUID          PK
tenant_id         UUID          FK → tenants (denormalizado desde el booking para listados públicos rápidos)
player_id         UUID          FK → players
booking_id        UUID          FK → bookings (UNIQUE — 1 review por reserva)
rating            integer       CHECK 1..5
comment           text?         Máx 500 caracteres
created_at        timestamp     UTC
```

---

## ENTIDAD 20: PushSubscription (Suscripción Web Push del Staff)

### Definición
Suscripción Web Push API del navegador del staff. Habilita el **aviso push al admin cuando entra una reserva online** (`notifyAdminPush`). Tabla **aislada** (tenant_id + RLS). El push se entrega directo al navegador; NO se materializa en `notifications`.

### Atributos propios
```
id                UUID          PK
tenant_id         UUID          FK → tenants (ON DELETE CASCADE)
staff_user_id     UUID          FK → staff_users (ON DELETE CASCADE)
endpoint          text          UNIQUE — endpoint del push service del browser
p256dh_key        text          Clave pública del cliente (VAPID)
auth_key          text          Secreto de autenticación del cliente
user_agent        text?
created_at        timestamp     UTC
last_used_at      timestamp?
```

> [!NOTE]
> **Horario silencioso (cambio #7)**: en madrugada (00:00–08:00 en la timezone del complejo) el push
> se agenda (`startAfter`) para las 08:00 locales en vez de sonar al instante. Sonido fijo (no configurable).

---

## ENTIDAD 21: PlayerFavorite (Complejo Favorito del Jugador)

### Definición
Complejo marcado como favorito (❤️) por un jugador. Cross-tenant (un jugador marca N complejos). Tabla **híbrida**: el jugador solo ve/escribe los suyos (`app.current_player_id`). Sin lectura pública.

### Atributos propios
```
id                UUID          PK
player_id         UUID          FK → players
tenant_id         UUID          FK → tenants
created_at        timestamp     UTC
UNIQUE (player_id, tenant_id)
```

---

## ENTIDAD 22: FeatureFlag (Toggle Operacional)

### Definición
Toggle operacional del sistema (Fase 6). **No** son los feature flags por plan (esos viven en `plans.features`, ADR-010). Fila con `tenant_id` NULL = default global; con `tenant_id` seteado = override por complejo (p. ej. kill switch de `suspended`).

### Atributos propios
```
id                UUID          PK
key               string        Nombre del flag
value             boolean        DEFAULT false
tenant_id         UUID?         FK → tenants (NULL = default global; seteado = override)
created_at        timestamp     UTC
```

---

## Mapa de Relaciones Entre Entidades

```
Tenant (1)
  ├── Courts (N)
  │     └── Bookings (N) ←─────────┐
  │                                │
  ├── Abonados (N) ────────────────┘ (genera Bookings)
  │                                
  ├── StaffUsers (N) ──── vía tenant_staff_members
  │
  ├── CashFlows (N)
  │
  ├── DailyCashClose (N)
  │
  ├── Products (N)
  │
  └── TenantSubscription (1) ──→ Plan (global)

Player (cross-tenant)
  ├── Bookings en N Tenants
  └── PlayerTenantRelationship (N)

Payment
  ├── Pertenece a: 1 Booking (seña)
  └── CashFlow referencia al Payment para trazabilidad
```

---

## Guía Directa al Schema de DB

Este glosario se traduce directamente en las siguientes tablas:

| Entidad | Tabla SQL |
|---|---|
| Tenant | `tenants` |
| Court | `courts` |
| Booking | `bookings` |
| Abonado | `abonados` |
| Player | `players` |
| PlayerTenantRelationship | `player_tenant_relationships` |
| StaffUser | `staff_users` |
| StaffUser ↔ Tenant | `tenant_staff_members` |
| Payment | `payments` |
| CashFlow | `cash_flows` |
| DailyCashClose | `daily_cash_closes` |
| TenantSubscription | `tenant_subscriptions` |
| Plan | `plans` |
| Notification | `notifications` |
| AuditLog | `audit_logs` |
| ProcessedWebhook | `processed_webhooks` |
| TenantPlayerBan | `tenant_player_bans` |
| PriceVersion | `price_versions` |
| Review | `reviews` |
| PushSubscription | `push_subscriptions` |
| PlayerFavorite | `player_favorites` |
| FeatureFlag | `feature_flags` |
| SystemAdmin | `system_admins` |

**Total: 22 tablas de negocio + 1 tabla de sistema (system_admins) para v1.0**
(12 aisladas con RLS + 6 globales + 3 híbridas + 1 operacional + 1 sistema)

> Aisladas (12): courts, bookings, abonados, payments, cash_flows, daily_cash_closes,
> tenant_staff_members, tenant_subscriptions, notifications, audit_logs, tenant_player_bans, push_subscriptions.
> Globales (6): tenants, players, staff_users, plans, price_versions, processed_webhooks.
> Híbridas (3, RLS por jugador): player_tenant_relationships, reviews, player_favorites.
> Operacional (1): feature_flags. Sistema (1): system_admins.

> [!NOTE]
> **Tabla `system_admins` agregada** para el panel de super admin de TurnoGol.
