# TODO — Cambios a Reglas de Negocio (Post-Análisis Crítico)

> Cambios acordados durante el debate de reglas de negocio del 2026-06-18.
> Cada cambio requiere propagación a docs + código.

---

## Cambios Confirmados

### 1. ⏱️ Timer de pago de seña: 15 min → 6 min
- **Antes**: El jugador tenía 15 minutos para completar el pago de la seña tras reservar.
- **Ahora**: **6 minutos** (alineado con ATC que da ~5 min).
- **Justificación**: 15 min bloquea slots en horario pico innecesariamente. El jugador que va a pagar lo hace en <2 min. El que no paga en 6 min no iba a pagar en 15 tampoco.
- **Impacto en código/docs**:
  - [ ] `docs/spec/doc7_flujos_e2e.md` — Flujo 2 paso 4 y timer de expiración
  - [ ] `docs/spec/doc6_entidades.md` — Booking state machine, referencia al timeout
  - [ ] `docs/spec/doc4_monetizacion.md` — §7 webhooks de señas
  - [ ] `CLAUDE.md` — Si menciona el timer
  - [ ] Lógica de negocio en código (pg-boss job de expiración)
  - [ ] Tests que validen el timer

### 2. 🧹 Eliminar estado `in_process` y extensión de 48hs para pagos de seña online
- **Antes**: Si el jugador pagaba por CBU/transferencia, el pago quedaba `in_process` y el timer se extendía a 48 horas, bloqueando el slot.
- **Ahora**: Las reservas online **solo aceptan MercadoPago** (pagos instantáneos). No se acepta transferencia bancaria, efectivo, ni medios lentos para reservas online. La extensión de 48hs no aplica.
- **Justificación**: Un slot de cancha es time-sensitive. No se puede bloquear 48hs esperando una acreditación. Si el jugador quiere pagar por otro medio, lo arregla directamente con el complejo (reserva manual del admin).
- **Impacto en código/docs**:
  - [ ] `docs/spec/doc4_monetizacion.md` — §7 webhook `payment.pending (in_process)` con extensión a 48hs → eliminar/aclarar
  - [ ] `docs/spec/doc7_flujos_e2e.md` — Flujo 2, referencia a pago in_process con 48hs
  - [ ] `docs/spec/doc6_entidades.md` — Payment entity, estado `in_process` no aplica a señas online

---

### 3. 🔄 Cancelación por admin: separar motivo ANTES de decidir reembolso
- **Antes**: El admin elige directamente "cancelar con reembolso" o "cancelar sin reembolso" sin contexto.
- **Ahora**: El flujo primero pregunta **por qué se cancela**:
  1. **"El complejo necesita cancelar"** (rotura, mantenimiento, error del admin) → reembolso **siempre automático**, sin opción de retener. No es culpa del jugador.
  2. **"El jugador pidió cancelar"** (llamó por teléfono, no puede hacerlo online) → aplica la política de cancelación normal (dentro del plazo = reembolso, fuera = retención).
- **Justificación**: Protege al jugador de perder la seña por culpa del complejo. Evita daño reputacional. Le da estructura al admin para que no tome decisiones arbitrarias.
- **Nota**: La comisión de MP (~5%) la absorbe el complejo en cualquier caso. Es costo del medio de pago, no de TurnoGol. Si quieren evitarlo, pueden configurar reservas sin seña.
- **Impacto en código/docs**:
  - [ ] `docs/spec/doc7_flujos_e2e.md` — Flujo 4C, reestructurar el modal de cancelación
  - [ ] UI del panel admin — modal de cancelación con paso previo de motivo
  - [ ] `canceled_reason` debería incluir metadata del tipo de cancelación (complejo vs jugador)

### 4. 📅 Sistema de cobro de Abonados: copiar modelo ATC ("Saldo a Favor")
- **Antes**: No había forma de trackear si un abonado pagó o no. El `CashFlow` no tenía relación con el `Abonado`. El admin registraba plata en la caja pero no sabía qué abonado pagó qué mes.
- **Ahora**: Sistema de **saldo a favor por abonado**, copiando el modelo probado de ATC Sports.

#### Cómo funciona (modelo ATC adaptado)

**Carga de saldo:**
1. Juan viene el miércoles y le paga $40.000 en efectivo a Marcelo (por 4 sesiones)
2. Marcelo abre el abonado de Juan → toca "+Agregar cobro" → ingresa $40.000 + medio de pago (efectivo)
3. El sistema acredita $40.000 en el `credit_balance` del abonado
4. Se genera un `CashFlow` de tipo `income`, categoría `abonado_payment`, con `abonado_id` → va a la caja del día

**Descuento semanal (MANUAL, no automático):**
1. Llega el miércoles siguiente. Juan viene a jugar. Marcelo abre la instancia del turno fijo
2. Ve la sección "Cobros de turno" con el saldo disponible ($40.000)
3. Hay un checkbox **"Mantener saldo"** (tildado por defecto, como ATC)
4. Si Marcelo **destilda** "Mantener saldo" → el sistema descuenta `price_per_session` del `credit_balance` ($40k → $30k)
5. Si Marcelo **deja tildado** → el saldo no se toca, puede registrar un cobro nuevo por otro medio
6. **Clave**: Al descontar del saldo, NO se genera un CashFlow nuevo (la plata ya entró a caja cuando se recibió). Evita duplicación.

**¿Por qué NO automático?** Porque cada semana es distinta:
- "Hoy pago en efectivo, no me descuentes" → mantener saldo
- "Hoy no vino Juan, vino su primo, pero descontá igual" → descontar
- "Hoy pagó Carlos que es del grupo de Juan" → nuevo cobro, mantener saldo
- El admin NECESITA el control semana a semana

**Cobros parciales y deuda:**
- Si Juan no paga el total → se registra lo que pagó, la diferencia queda como deuda visible
- Deuda visible = badge rojo en la lista de abonados

**Reglas importantes (copiadas de ATC):**
- El saldo vive en el **abonado**, NO en el jugador. Si Juan tiene 2 abonados (miércoles F5 + sábados F7), cada uno tiene su propio saldo
- Los saldos NO se transfieren entre abonados del mismo jugador
- El CashFlow se genera al RECIBIR la plata, no al descontar del saldo
- Cancelar 1 semana: el admin puede cancelar solo una instancia, el abonado sigue la semana siguiente
- Cancelar con penalización: opción al cancelar que genera deuda en el historial

#### Impacto en modelo de datos

| Entidad | Cambio | Detalle |
|---------|--------|---------|
| `Abonado` | Agregar campo | `credit_balance: integer DEFAULT 0` (centavos ARS) |
| `CashFlow` | Agregar campo | `abonado_id: UUID? FK → abonados` (opcional) |
| `CashFlow` | Nueva categoría | `abonado_payment` en el enum `cashflow_category` |
| UI Booking `fixed` | Nueva sección | "Cobros de turno": saldo visible, checkbox "Mantener saldo", botón "+Agregar cobro" |

#### Lo que NO cambia (no rompe nada)
- `Booking` de tipo `fixed` → lógica de `completed`/`no_show` no cambia
- `DailyCashClose` → sigue sumando CashFlows del día normalmente
- `PlayerTenantRelationship.balance` → sigue siendo deuda de no-shows, separado
- La generación rolling de instancias (8 semanas + 4) → no cambia
- Pausa/cancelación del abonado → no cambia

#### Impacto en docs
- [ ] `docs/spec/doc6_entidades.md` — Abonado: agregar `credit_balance`, CashFlow: agregar `abonado_id` y categoría
- [ ] `docs/spec/doc7_flujos_e2e.md` — Flujo 5: agregar sub-flujo de cobro semanal con "Mantener saldo"
- [ ] `docs/spec/doc13_database_schema.md` — ALTER TABLE abonados, cash_flows
- [ ] `CLAUDE.md` — Mencionar el sistema de saldo a favor
- [ ] UI: sección "Cobros de turno" en el detalle de booking type='fixed'

### 5. 🚫 No-show: eliminar ban temporal → bloqueo por deuda (modelo ATC)
- **Antes**: El no-show podía configurarse como `ban_days` (ban temporal de X días) o `deposit_capture` (retener seña) o `none`. El admin tenía que decidir cuántos días de ban, un número arbitrario.
- **Ahora**: El no-show **siempre genera deuda**. El jugador queda **bloqueado para reservar online en ese complejo hasta que pague la deuda**. Sin números arbitrarios, sin configuración.

#### Cómo funciona

1. Tomás no se presenta al turno de las 21:00 ($55.000)
2. El admin marca "No se presentó" en la grilla
3. El sistema:
   - Cambia booking status → `no_show`
   - Si había seña pagada → `deposit_status = 'captured'` (la seña queda para el complejo)
   - Genera deuda: `PlayerTenantRelationship.balance += price_snapshot` (o `price_snapshot - deposit_amount` si ya se cobró seña)
   - El jugador queda bloqueado para reservar online en ESE complejo
4. Tomás quiere volver a reservar → ve mensaje "Tenés una deuda de $X en este complejo. Regularizá tu situación para poder reservar."
5. Tomás va al complejo, paga los $55.000 (o lo que corresponda)
6. Marcelo registra el pago → `PlayerTenantRelationship.balance -= monto_pagado`
7. Balance llega a 0 → Tomás puede reservar online de nuevo

#### Qué se elimina
- `no_show_penalty.type = 'ban_days'` → ya no existe
- La lógica de "3 no-shows en 30 días → ban automático" → reemplazada por deuda acumulativa
- La configuración `no_show_penalty` en tenant settings → simplificada

#### Qué se mantiene
- `TenantPlayerBan` → sigue existiendo para **bans manuales** del admin por otros motivos (jugador problemático, violento, etc.). Es independiente de la deuda.
- `PlayerTenantRelationship.balance` → ya existe, se usa tal como está diseñado
- `deposit_capture` → sigue funcionando (la seña se retiene al complejo)

#### ¿Cuánta deuda se genera?
- Si el jugador **pagó seña online**: deuda = `price_snapshot - deposit_amount` (la seña ya la tiene el complejo, falta el resto)
- Si el jugador **no pagó seña** (reserva sin seña): deuda = `price_snapshot` (el turno completo)
- Si fue **reserva manual del admin con seña en efectivo**: deuda = `price_snapshot - deposit_amount` (misma lógica)

#### Impacto en docs
- [ ] `docs/spec/doc7_flujos_e2e.md` — Flujo 4D: reescribir penalización
- [ ] `docs/spec/doc6_entidades.md` — Booking: eliminar referencia a `ban_days`, Tenant settings: simplificar `no_show_policy`
- [ ] `docs/decisions/DECISIONES_SISTEMA.md` — P7.1: actualizar con modelo de deuda
- [ ] `CLAUDE.md` — Actualizar regla de no-show
- [ ] Código: eliminar lógica de ban temporal por no-show, agregar lógica de deuda

### 6. ⏰ Duraciones de turno: solo 60 minutos (eliminar 90 y 120)
- **Antes**: El sistema soportaba turnos de 60 o 120 minutos (90 ya había sido eliminado). El pricing tenía precios por duración.
- **Ahora**: **Solo turnos de 60 minutos**. Si alguien quiere 2 horas seguidas, reserva 2 turnos. Para arreglos especiales (escuelitas, profes), el admin hace reserva manual con el precio que quiera.
- **Justificación**: Así funciona la realidad. Todas las canchas reservan en horarios en punto (18:00, 19:00, 20:00). Lo que pase dentro (si empiezan a las :00 o :15, cuánto juegan) lo maneja la cancha en el momento. No podemos abarcar todo.

#### Simplificación del pricing JSONB
**Antes** (precio por duración):
```json
{ "days": [1,2,3,4,5], "from": "18:00", "to": "00:00", "prices": { "60": 1200000, "120": 2200000 } }
```
**Ahora** (un solo precio por franja):
```json
{ "days": [1,2,3,4,5], "from": "18:00", "to": "00:00", "price": 1200000 }
```

#### Qué se elimina
- `booking_duration_minutes` de tenant settings → siempre es 60
- El objeto `prices` con claves por duración → reemplazado por un solo campo `price`
- Toda lógica que evalúe duración para calcular precio

#### Impacto en docs
- [ ] `CLAUDE.md` — Línea 103: cambiar "60 o 120" por "60 minutos únicamente"
- [ ] `docs/spec/doc6_entidades.md` — Court pricing JSONB, Tenant settings
- [ ] `docs/spec/doc7_flujos_e2e.md` — Referencias a duración configurable
- [ ] `docs/spec/doc13_database_schema.md` — pricing JSONB schema
- [ ] `docs/decisions/DECISIONES_SISTEMA.md` — P3.1
- [ ] Código: simplificar evaluación de precio (no más lookup por duración)

### 7. 🔔 Push notifications al admin: horario silencioso
- **Antes**: Las push notifications al admin sonaban a cualquier hora, incluyendo de madrugada cuando jugadores reservan online a las 2am.
- **Ahora**: Las push notifications respetan un **horario silencioso** alineado con el horario de operación del complejo.

#### Cómo funciona
- Si el complejo opera de 08:00 a 00:00 → push con sonido solo entre 08:00 y 00:00
- Fuera de ese horario → la notificación llega como **badge silencioso** (sin sonido ni vibración)
- El admin ve las reservas acumuladas cuando abre la app a la mañana
- El horario silencioso se calcula automáticamente desde `tenant.opening_hours` (no requiere configuración adicional)

#### Justificación
Si el push suena a las 2am cada noche, Marcelo va a desactivar las notificaciones completamente. Y ahí pierde el valor de ser notificado en tiempo real cuando SÍ está en el complejo trabajando.

#### Impacto en docs
- [ ] `CLAUDE.md` — Actualizar línea sobre push notifications
- [ ] `docs/spec/doc8_user_stories.md` — Si hay story de push notifications
- [ ] Código: lógica de envío de push con check de horario del tenant

### 8. 💸 "Cobros de turno" para TODOS los bookings (no solo abonados)
- **Antes**: El sistema trackea bien la seña (deposit), pero el pago del **resto del turno** cuando el jugador llega al complejo no tiene flujo explícito. El admin registra plata suelta en la caja sin vincularlo al booking.
- **Ahora**: Cada booking (spontaneous y fixed) tiene una sección **"Cobros de turno"** donde el admin ve cuánto se pagó, cuánto falta, y puede registrar pagos parciales o totales.

#### Cómo funciona (mismo patrón que cobros de abonado)

**Vista en el detalle del booking:**
```
Precio del turno:        $55.000
├── Seña (MP online):    $16.500  ✅ Pagado
├── Resto pendiente:     $38.500  ⬜ Pendiente
└── [+Agregar cobro]
```

**Flujo del admin:**
1. Tomás llega al complejo, juega, y va al mostrador
2. Marcelo abre el booking en la grilla → ve la sección "Cobros de turno"
3. Ve que faltan $38.500
4. Toca "+Agregar cobro" → ingresa $38.500 + medio de pago (efectivo/transferencia)
5. Se genera CashFlow vinculado al booking (`booking_id`)
6. El booking queda marcado como "pagado completo"

**Cobros parciales:**
- Si Tomás solo paga $20.000 hoy y dice "el resto la semana que viene"
- El admin registra $20.000 → queda pendiente $18.500
- La deuda queda visible en el booking y en la ficha del jugador

**Conexión con el sistema de deuda (cambio #5):**
- Si el booking es `no_show` y genera deuda → la deuda aparece en esta misma sección
- Cuando el jugador paga la deuda → el admin usa "+Agregar cobro" en el booking con no_show
- El pago reduce el `PlayerTenantRelationship.balance`

#### Impacto en modelo de datos
- No requiere entidades nuevas: usa `CashFlow` con `booking_id` (ya existe)
- Agregar campo derivado o calculado: `booking.amount_paid` = SUM de payments/cashflows vinculados
- Agregar campo derivado: `booking.amount_pending` = `price_snapshot - amount_paid`

#### Impacto en docs
- [ ] `docs/spec/doc7_flujos_e2e.md` — Flujo 2 y 3: agregar paso de cobro del resto al llegar
- [ ] `docs/spec/doc6_entidades.md` — Booking: documentar atributos derivados de cobro
- [ ] UI: sección "Cobros de turno" en el detalle de TODOS los bookings (misma UI que abonados)

### 9. 👤 Nuevo módulo "Jugadores" en el panel admin
- **Antes**: No existía un módulo para gestionar jugadores/clientes. El admin solo veía jugadores dentro de cada reserva o abonado, sin una vista centralizada.
- **Ahora**: Módulo **"Jugadores"** en el panel admin con búsqueda, ficha de jugador, historial, deudas y abonados.

#### Necesidad (consecuencia directa de cambios #4, #5 y #8)
Sin este módulo, el admin no puede:
- Ver y cobrar deudas de jugadores con no-show (cambio #5)
- Consultar el saldo a favor de los abonados de un jugador (cambio #4)
- Ver historial de cobros de un jugador (cambio #8)

#### Funcionalidades del módulo
1. **Búsqueda de jugadores** — por nombre, teléfono o email
2. **Ficha del jugador** — datos de contacto, fecha de registro, stats (total reservas, no-shows, tasa)
3. **Sección "Deudas"** — lista de deudas pendientes con botón "Registrar pago" en cada una
4. **Sección "Abonados"** — abonados activos del jugador en este complejo con saldo visible
5. **Sección "Historial de Reservas"** — últimas reservas con estado (completada, no-show, cancelada)
6. **Acciones rápidas** — "Banear jugador" (ban manual), "Crear reserva para este jugador"

#### Impacto en modelo de datos
- No requiere entidades nuevas. Es una vista de consulta sobre datos existentes:
  - `Player` + `PlayerTenantRelationship` (datos + deuda + ban)
  - `Booking` WHERE `player_id` (historial)
  - `Abonado` WHERE `player_id` (abonados activos)
  - `CashFlow` WHERE `player_id` o vinculado a booking del jugador (cobros)

#### Impacto en docs
- [ ] `docs/business/TurnoGol_Plan_de_Negocio.md` — Sección 3.2: agregar módulo "Jugadores"
- [ ] `docs/spec/doc8_user_stories.md` — Agregar stories de gestión de jugadores
- [ ] `docs/spec/doc7_flujos_e2e.md` — Nuevo flujo: "Gestión de jugador y cobro de deuda"
- [ ] UI: diseñar pantalla de búsqueda y ficha de jugador

### 10. 👻 Eliminar reservas "fantasma": obligar creación de perfil de Jugador
- **Antes**: En reservas manuales, el admin podía usar los campos sueltos `guest_name` y `guest_phone` sin vincular a un `Player`. Si el jugador faltaba, no se le podía generar deuda ni penalizar.
- **Ahora**: Se eliminan `guest_name` y `guest_phone`. **Toda reserva debe tener un `player_id`**.

#### Cómo funciona
Al crear una reserva manual en la grilla:
1. El admin **busca** al jugador por nombre o teléfono en la base del complejo
2. Si **existe** → lo selecciona
3. Si **no existe** → crea un perfil rápido (solo nombre + teléfono, sin email ni contraseña)
4. Esto crea un registro real en la tabla `players` y vincula la reserva

#### Justificación
- Sin `player_id`, el sistema de deudas y penalizaciones por no-show (cambio #5) no funciona.
- Permite que el jugador aparezca en el nuevo módulo "Jugadores" (cambio #9).
- Permite trackear historial y tasa de asistencia de todos los clientes, no solo los digitales.
- Si el jugador luego se registra online usando ese mismo número de teléfono/email, el sistema puede unificar su cuenta y mantener su historial intacto.

#### Impacto en modelo de datos
- Eliminar `guest_name` y `guest_phone` de la tabla `bookings`
- Asegurar que `player_id` en `bookings` sea **obligatorio** (NOT NULL)
- Modificar constraints de `players` si es necesario (ej. permitir email nulo si el login es por teléfono, o generar un pseudo-email, aunque el modelo password-based ya lo contempla). *Nota: a revisar junto con el refactor de Auth*.

#### Impacto en docs
- [ ] `docs/spec/doc6_entidades.md` — Bookings: remover `guest_name`/`guest_phone` y forzar `player_id`. Players: clarificar creación "lite" por admin.
- [ ] `docs/decisions/DECISIONES_SISTEMA.md` — D16: revertir decisión (no más guest_name).
- [ ] `docs/spec/doc7_flujos_e2e.md` — Flujo 3 (Reserva manual): actualizar paso de selección/creación de jugador.
- [ ] `CLAUDE.md` — Eliminar mención de campos guest.

---

## Pendientes de Debate

*(se irán agregando a medida que avance el análisis)*
