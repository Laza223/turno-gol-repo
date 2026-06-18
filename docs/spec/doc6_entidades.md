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
  "deposit_percentage": 50,
  "cancellation_policy": {
    "hours_before": 48,
    "refund_on_cancel": true
  },
  "no_show_policy": {
    "generates_debt": true,
    "blocks_until_paid": true
  },
  "admin_pin": "$2b$10$...",
  "accepts_cash": true,
  "accepts_transfer": true,
  "accepts_mercadopago": true,
  "allow_online_booking": true,
  "booking_advance_days": 6,
  "booking_duration_minutes": [60, 120],
  "auto_complete_minutes": 30
}
```

> [!NOTE]
> **`admin_pin`**: PIN hasheado para proteger zonas sensibles del panel (precios, configuración,
> suscripción, desactivar canchas, reportes financieros). Permite que el empleado use la misma
> cuenta admin sin acceder a funciones críticas.

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
surface_type      enum          'synthetic_grass' | 'natural_grass' | 'cement' | 'indoor'
capacity          integer       Cantidad de jugadores (5, 7, 11)
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
    { "days": [1,2,3,4,5], "from": "08:00", "to": "14:00", "prices": { "60": 800000, "120": 1400000 } },
    { "days": [1,2,3,4,5], "from": "14:00", "to": "18:00", "prices": { "60": 1000000, "120": 1800000 } },
    { "days": [1,2,3,4,5], "from": "18:00", "to": "00:00", "prices": { "60": 1200000, "120": 2200000 } },
    { "days": [0,6], "from": "08:00", "to": "00:00", "prices": { "60": 1500000, "120": 2800000 } }
  ]
}
```

> [!NOTE]
> **Reglas de precio**: El admin define franjas ilimitadas con puntos de corte horarios.
> Cada regla especifica días de la semana (0=Dom, 6=Sáb), rango horario, y precio por duración (60/120 min).
> Esto replica el modelo de ATC Sports donde el admin configura el precio por cada combinación de franja y duración.

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
| `pending_payment` | `expired` | Admin fuerza expiración manualmente | Slot liberado, email al jugador |
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
monthly_price     integer       Precio mensual en centavos ARS. Pre-llenado como price_per_session × 4.33, pero editable por el admin (ej: redondeo, descuento por fidelidad)
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
balance           integer       DEFAULT 0. Saldo deudor en centavos ARS. Si > 0, jugador bloqueado para reservar online.
first_seen_at     timestamp     Primera reserva en este complejo
bookings_count    integer       Total de reservas (actualizado por triggers)
noshow_count      integer       Total de no-shows (actualizado por triggers)
last_booking_at   timestamp?    Última reserva en este complejo
data_consent_at   timestamp     Consent de datos Ley 25.326 (set en primera reserva)
created_at        timestamp     UTC
```

> [!NOTE]
> Los contadores `bookings_count` y `noshow_count` se actualizan por triggers en INSERT/UPDATE
> de bookings. **`balance`**: cuando el admin marca no-show, se suma el monto adeudado.
> Si `balance > 0`, el jugador NO puede reservar online en ese complejo hasta que el admin
> registre el pago y baje el saldo a 0.
> `data_consent_at` es evidencia de consent por-complejo para Ley 25.326.

---

## ENTIDAD 7: StaffUser (Usuario del Sistema)

### Definición
Un StaffUser es la persona que administra un Tenant. En v1 solo existe el rol `admin`. El sistema usa un PIN para proteger zonas sensibles (precios, configuración, suscripción) permitiendo que empleados del complejo operen la cuenta sin acceso a funciones críticas.

### Atributos propios
```
id                UUID          PK
email             string        Único. Para autenticación (magic link o Google OAuth)
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
├── role          enum      'admin' (único rol en v1)
├── added_by      UUID      FK → staff_users (quién lo agregó)
├── created_at    timestamp
└── is_active     boolean
```

**Por qué mantener la tabla**: Aunque v1 tiene un solo rol, la tabla permite que un mismo email administre múltiples complejos y facilita la extensión futura.

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
Representa un ingreso de dinero en la caja del complejo. Solo ingresos y ajustes (no gastos).

### Atributos propios
```
id                UUID          PK
tenant_id         UUID          FK → tenants
type              enum          'income' | 'adjustment'
category          enum          'booking' | 'product_sale' | 'other' | 'no_show_correction'
amount            integer       En centavos de ARS
method            enum          'cash' | 'transfer' | 'mercadopago' | 'other'
description       string        Descripción del movimiento
booking_id        UUID?         FK → bookings (si está relacionado con una reserva)
product_id        UUID?         FK → products (si es venta de producto)
registered_by     UUID          FK → staff_users
occurred_at       timestamp     Cuándo ocurrió el movimiento
created_at        timestamp     UTC
```

> [!NOTE]
> **Sin gastos**: TurnoGol no gestiona egresos (luz, agua, sueldos). Solo registra ingresos
> de reservas y ajustes. El complejo maneja sus gastos con sus propios sistemas contables.

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

## ENTIDAD 11: Product (Producto de Cantina/Stock)

### Definición
Producto vendido en la cantina del complejo (bebidas, comida, equipamiento). Registra stock y genera CashFlows de tipo `product_sale`.

### Atributos propios
```
id                UUID          PK
tenant_id         UUID          FK → tenants
name              string        "Gaseosa", "Pancho", "Pelota"
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
3. El Flujo 4D (3 no-shows en 30 días) crea automáticamente un ban temporal.

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
| TenantPlayerBan | `tenant_player_bans` |
| PriceVersion | `price_versions` |
| SystemAdmin | `system_admins` |

**Total: 19 tablas de negocio + 1 tabla de sistema (system_admins) para v1.0**
(12 aisladas con RLS + 6 globales + 1 híbrida + 1 sistema)

> [!NOTE]
> **Tabla `system_admins` agregada** para el panel de super admin de TurnoGol.
