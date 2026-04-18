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
slug              string        Único. URL amigable: "complejo-san-martin" → turnogol.com.ar/complejo-san-martin
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
    "refund_percentage": 100
  },
  "no_show_policy": {
    "auto_complete_after_minutes": 30
  },
  "accepts_cash": true,
  "accepts_transfer": true,
  "accepts_mercadopago": true,
  "allow_online_booking": true,
  "booking_advance_days": 14
}
```

### Atributos derivados (NO guardar en DB, calcular)
- `is_open_now` = evaluar `opening_hours` + `closed_dates` contra la hora actual
- `active_courts_count` = COUNT de canchas con status='active'
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
surface_type      enum          'synthetic_grass' | 'natural_grass' | 'cement' | 'indoor'
capacity          integer       Cantidad de jugadores (5, 7, 11)
photos            string[]      URLs de fotos (en storage)
status            enum          ver state machine (3 estados)
pricing           JSONB         Precios por franja horaria (ver desglose)
created_at        timestamp     UTC
updated_at        timestamp     UTC
```

**Desglose del campo `pricing` (JSONB):**
```json
{
  "weekday_morning":  { "price": 8000, "hours": ["08:00-12:00"] },
  "weekday_afternoon": { "price": 10000, "hours": ["12:00-18:00"] },
  "weekday_night":    { "price": 12000, "hours": ["18:00-23:00"] },
  "weekend_morning":  { "price": 10000, "hours": ["08:00-14:00"] },
  "weekend_night":    { "price": 15000, "hours": ["14:00-23:00"] }
}
```

> [!NOTE]
> **Horarios que cruzan medianoche**: si un complejo abre de 08:00 a 02:00 del día siguiente,
> se usa la convención de "día operativo". El `opening_hours` del Tenant define el cierre como
> `"close": "02:00"`. Si `close < open`, se entiende que cierra al día calendario siguiente.
> Las reservas se almacenan con la fecha del día operativo (no del día calendario).

### Atributos derivados (NO guardar en DB)
- `price_for(datetime)` = evalúa `pricing` contra el horario para retornar el precio correcto
- `is_available_for(date, time_start, time_end)` = consulta si tiene conflictos en ese rango

### State Machine de la Cancha

```
ACTIVE ──── admin desactiva ──── INACTIVE
  ▲              │                    │
  │              │                    │
  └──────────────┘                    │
  ▲                                   │
  │ admin pone en mantenimiento       │
  │         ↓                         │
  └──── MAINTENANCE ──────────────────┘
              admin reactiva
```

| Estado | Descripción | Puede recibir reservas |
|---|---|---|
| `active` | Funcionando normalmente | ✅ Sí |
| `maintenance` | En reparación temporal | ❌ No (las existentes se mantienen) |
| `inactive` | Desactivada permanentemente | ❌ No |

### Invariantes de la Cancha

1. **Una cancha `INACTIVE` o `MAINTENANCE` no puede recibir reservas nuevas** (pero las reservas existentes se mantienen hasta que el admin las gestione).
2. **Al desactivar una cancha con reservas futuras**: Warning al admin: "Hay {N} reservas futuras que se cancelarán."
3. **El `pricing` siempre debe cubrir todos los horarios del complejo** (validación al guardar).

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
payment_method    enum?         'mercadopago' | 'cash' | 'transfer'
payment_id        UUID?         FK → payments (el cobro de la seña, si es MP)
notes_internal    text?         Notas visibles solo para el staff
notes_player      text?         Notas visibles para el jugador
canceled_reason   text?         Motivo de cancelación (si aplica)
canceled_by       enum?         'player' | 'admin' | 'system'
canceled_at       timestamp?    Cuándo se canceló
created_at        timestamp     UTC
updated_at        timestamp     UTC
```

### Atributos derivados (NO guardar en DB)
- `duration_minutes` = EXTRACT minutos entre `time_end` y `time_start`
- `is_past` = `date + time_end < NOW()`
- `is_cancellable_without_penalty` = evalúa política del complejo vs tiempo restante
- `effective_price` = `price_snapshot` (siempre el del momento de creación)

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
              pago OK    /         |       \ timeout (15min / 48hs si in_process)
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
| `pending_payment` | `expired` | Timeout 15 min sin pago (o 48hs si MP in_process por CBU) | Slot liberado |
| `confirmed` | `canceled_refunded` | Jugador cancela dentro del plazo de la política | Refund de seña vía MP, email confirmación. Si seña efectivo: "Contactá al complejo" |
| `confirmed` | `canceled_no_refund` | Jugador cancela fuera del plazo | Sin reembolso, deposit_status → 'captured', email con info |
| `confirmed` | `canceled_no_refund` | Admin cancela con cargo | Sin reembolso |
| `confirmed` | `canceled_refunded` | Admin cancela sin cargo | Reembolso si había seña, email disculpa |
| `confirmed` | `completed` | Auto-complete: 30 min después de `time_end` si nadie marcó | CashFlow income registrado |
| `confirmed` | `no_show` | Admin marca como no-show dentro de ventana 24hs | Penalidad si aplica |
| `completed` | `no_show` | Corrección posterior (dentro de 24 hs) | CashFlow compensatorio (ajuste) |
| `expired` | — | — | Estado final |
| `no_show` | — | — | Estado final inmutable |

> [!NOTE]
> **Corrección post-cierre de caja**: si un admin marca un `completed` como `no_show` después
> de cerrar la caja, NO se modifica el cierre. Se genera un `CashFlow` compensatorio
> de tipo `adjustment` con la diferencia. La caja cerrada es inmutable; los ajustes posteriores
> se registran como movimientos nuevos.

### Invariantes de la Reserva

1. **No pueden existir dos reservas en estado `confirmed` o `pending_payment` en la misma cancha con overlap de horario** (DB constraint de exclusión con `btree_gist`).
2. **`price_snapshot` nunca se modifica después de la creación**.
3. **Una reserva en estado `no_show` es completamente inmutable** (no se puede volver a `completed`).
4. **`time_end` debe ser mayor a `time_start`** (validación obligatoria). Si cruza medianoche, se aplica convención de día operativo.
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
> (efectivo, transferencia, o como arreglen). TurnoGol no interviene en el cobro del turno fijo.
> Esto es exactamente como funciona ATC Sports: gestión manual con "saldo a favor".

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
status            enum          'active' | 'banned' | 'suspended' | 'anonymized'
created_at        timestamp     UTC
last_login_at     timestamp?    UTC
```

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
created_at        timestamp     UTC
```

> [!NOTE]
> Esta tabla es intencionalmente minimalista en v1. NO tiene contadores de no-shows ni bans
> complejos. Si un complejo quiere bloquear a un jugador, cambia `status = 'blocked'`.
> Se expande en v1.5 con `noshow_count`, `total_bookings`, y moderación avanzada.

---

## ENTIDAD 7: StaffUser (Usuario del Sistema)

### Definición
Un StaffUser es una persona que tiene acceso al panel admin de un Tenant específico. Un usuario puede ser staff de múltiples complejos.

### Atributos propios
```
id                UUID          PK
email             string        Único. Para autenticación (magic link)
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
├── role          enum      'admin' | 'receptionist' | 'readonly'
├── added_by      UUID      FK → staff_users (quién lo agregó)
├── created_at    timestamp
└── is_active     boolean
```

**Por qué tabla separada**: Un mismo email puede ser admin en un complejo y recepcionista en otro. Staff por plan: 2 (Básico), 5 (Estándar), ilimitado (Full).

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
status            enum          'pending' | 'approved' | 'rejected' | 'refunded' | 'canceled' | 'in_process'
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
4. **Estado `in_process`**: para pagos por CBU/transferencia que pueden tardar 24-48hs. El timer del booking se extiende a 48hs en este caso.

---

## ENTIDAD 9: CashFlow (Movimiento de Caja)

### Definición
Representa cualquier movimiento de dinero en la caja del complejo. Incluye ventas de cantina y cobros de reservas.

### Atributos propios
```
id                UUID          PK
tenant_id         UUID          FK → tenants
type              enum          'income' | 'expense' | 'adjustment'
category          enum          'booking' | 'product_sale' | 'other' | 'no_show_correction'
amount            integer       En centavos de ARS
method            enum          'cash' | 'transfer' | 'mercadopago'
description       string        Descripción del movimiento
booking_id        UUID?         FK → bookings (si está relacionado con una reserva)
product_id        UUID?         FK → products (si es venta de producto)
registered_by     UUID          FK → staff_users
occurred_at       timestamp     Cuándo ocurrió el movimiento
created_at        timestamp     UTC
```

### Atributos derivados
- `daily_balance(date)` = SUM(income) - SUM(expense) + SUM(adjustment) para ese día
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
total_expense     integer       Suma de gastos del día en centavos
balance           integer       total_income - total_expense
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

## ENTIDAD 11: Product (Producto de Cantina/Stock)

### Atributos propios
```
id                UUID          PK
tenant_id         UUID          FK → tenants
name              string        "Gaseosa", "Pelota", "Camiseta"
category          string?       "bebida" | "comida" | "equipamiento"
price             integer       En centavos de ARS
stock             integer       Cantidad actual
low_stock_alert   integer       DEFAULT 5. Alerta cuando stock < este número
is_active         boolean       DEFAULT true
created_at        timestamp     UTC
```

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
status            enum          'trialing' | 'active' | 'past_due' | 'suspended' | 'canceled' | 'churned'
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

---

## ENTIDAD 13: Plan (Plan de Suscripción)

### Definición
Definición global de un plan de suscripción (no por tenant). Los precios y features de cada plan.

### Atributos propios
```
id                    UUID          PK
name                  string        'basico' | 'estandar' | 'full'
display_name          string        'Básico' | 'Estándar' | 'Full'
max_courts            integer       3 | 6 | 999 (ilimitado)
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
trigger_event     string        'booking.confirmed' | 'booking.reminder_24h' | etc.
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
mp_payment_id     string        UNIQUE — el ID del pago/evento de MP
event_type        string        'payment' | 'subscription' | 'refund'
raw_payload       JSONB         Payload completo del webhook (para debugging)
processed_at      timestamp     Cuándo se procesó
created_at        timestamp     UTC
```

> [!NOTE]
> **TTL**: se recomienda purgar webhooks procesados de más de 90 días (job de limpieza).

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
| Product | `products` |
| TenantSubscription | `tenant_subscriptions` |
| Plan | `plans` |
| Notification | `notifications` |
| AuditLog | `audit_logs` |
| ProcessedWebhook | `processed_webhooks` |

**Total: ~17 tablas para v1.0** (reducido desde 19 al eliminar open_matches y match_participants)
