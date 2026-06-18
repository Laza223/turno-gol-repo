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

### 11. 👤 Roles de staff: adoptar modelo ATC (manager permisivo, eliminar PIN)
- **Antes**: 2 roles (`admin` y `manager`) donde el `manager` estaba muy restringido (solo grilla/reservas/caja). Además, un sistema de **PIN** protegía "zonas sensibles" (reportes, métricas, canchas, settings, staff, facturación) como segunda capa. El resultado: doble complejidad (roles + PIN) sin beneficio claro — si el manager tenía el PIN, los roles no servían; si no lo tenía, no podía funcionar solo.
- **Ahora**: Adoptar el modelo probado de **ATC Sports** → **manager permisivo, sin PIN**.

#### Cómo funciona (modelo ATC adaptado)

**Rol `admin` (Dueño):**
- Acceso total a todo el sistema
- Únicas funciones exclusivas:
  1. **Conexión de MercadoPago** (vincular/desvincular cuenta MP del complejo)
  2. **Gestión de staff** (invitar, desactivar, cambiar rol de otros usuarios)
  3. **Facturación SaaS** (plan, suscripción, datos de pago de TurnoGol)

**Rol `manager` (Encargado):**
- Ve y opera **todo lo demás**: grilla, reservas, caja, cierre de caja, reportes, métricas, canchas (ver precios), jugadores, abonados, stock/cantina, notificaciones, configuración general del complejo (horarios, seña, etc.)
- **NO puede**: conectar MP, gestionar staff, ni tocar la facturación SaaS

**¿Por qué?** ATC opera en cientos de complejos con exactamente este modelo. El Encargado en ATC tiene acceso a todo excepto la conexión de MercadoPago. La realidad del complejo es que el empleado está solo en el turno de noche y necesita poder contestar precios, ver reportes, y operar sin llamar al dueño.

#### Qué se elimina: Sistema de PIN completo
- `PinGate` component y todas sus instancias en páginas admin
- `pin.ts` (hashPin, verifyPin, buildPinCookie, verifyPinCookie)
- Cookie `tg_pin_session`
- `staff_pin_hash` de tenant settings
- `checkPinSessionAction` y todas las validaciones de PIN en Server Actions
- Settings page `/settings/pin`
- `PIN_COOKIE_SECRET` env variable (la usa impersonación también → migrar a su propio secret)
- Tests de PIN

#### Qué cambia en guards
- `requireAdminStaff()` → sigue existiendo, protege: conexión MP, staff, facturación SaaS
- `requireAdminStaffAction()` → sigue existiendo, mismo scope
- `requireOperatorStaff()` → sigue existiendo, ahora cubre CASI TODO (incluyendo reportes, métricas, canchas, config general)
- Las páginas que antes usaban `PinGate` ahora simplemente usan `requireOperatorStaff()` (sin PIN)

#### Impacto en docs
- [ ] `CLAUDE.md` — Eliminar toda mención de PIN, actualizar descripción de roles (manager = acceso a casi todo)
- [ ] `docs/decisions/DECISIONES_SISTEMA.md` — P2.1: actualizar con modelo ATC, eliminar referencia a PIN
- [ ] `docs/spec/doc6_entidades.md` — Tenant settings: eliminar `staff_pin_hash`
- [ ] `docs/spec/doc12_tenant_isolation.md` — Si menciona PIN
- [ ] `docs/decisions/security-decisions.md` — Eliminar/actualizar sección de PIN

#### Impacto en código
- [ ] Eliminar `src/modules/auth/pin.ts`
- [ ] Eliminar `src/components/pin-gate.tsx` (y su barrel export)
- [ ] Eliminar `src/app/(admin)/actions/pin.ts` (o equivalente)
- [ ] Eliminar `/settings/pin` page
- [ ] Remover `PinGate` de: `/reportes`, `/metricas`, `/canchas`, `/staff`, `/settings/reservas`, `/settings/horarios`, `/settings/facturacion`
- [ ] Remover `checkPinSessionAction` de: staff actions, settings actions
- [ ] Actualizar guards: las páginas de reportes/métricas/canchas/config usan `requireOperatorStaff` en vez de `requireAdminStaff` + PinGate
- [ ] Mantener `requireAdminStaff` solo en: conexión MP (`/settings/facturacion` parcial), `/staff`, facturación SaaS
- [ ] Migrar `PIN_COOKIE_SECRET` → renombrar a `COOKIE_SECRET` o crear `IMPERSONATION_COOKIE_SECRET` independiente para la cookie de impersonación del SuperAdmin
- [ ] Eliminar `staff_pin_hash` del schema de tenant settings
- [ ] Actualizar/eliminar tests de PIN

### 12. 🎭 Super Admin: diferir impersonación (F2) a post-lanzamiento
- **Antes**: La spec del Super Admin (`docs/superpowers/specs/2026-06-12-super-admin-design.md`) define 3 fases: F1 (Dashboard + Tenants), F2 (Impersonación), F3 (Jugadores + Jobs + Audit).
- **Ahora**: **F2 (Impersonación) queda fuera de v1.** Solo se implementan F1 y F3.

#### Justificación
La impersonación ("Entrar como este complejo") tiene el peor ratio complejidad/uso del sistema:
- Requiere cookie HMAC firmada con TTL, bypass de todos los guards de admin, usuario sintético para ~40+ server actions
- Hack de FKs: `cash_flows.registered_by` no tiene un `staff_user` real → la spec propone usar el primer admin activo del tenant como proxy
- Auditoría doble: `app.current_system_admin_id` + tenant context + forzar `actor_type='system'`
- Semanas de trabajo para algo que se va a usar 2 veces por mes en la etapa inicial (5-10 complejos)

**Con F1 + F3 el soporte ya cubre el 95% de los casos:**
- Dashboard con MRR, tenants por estado, trials por vencer
- Detalle de tenant con acciones: forzar estado, extender trial, cambiar plan, editar settings
- Búsqueda global de jugadores con ban/desban/anonymize
- Jobs con DLQ y retry manual
- Audit logs globales con filtros

#### Qué se difiere
- Cookie `tg_sa_impersonate` y toda la lógica HMAC de impersonación
- `resolveImpersonatedStaffContextFor()` en `impersonation.server.ts`
- Rama de bypass en `extractAuthUser()` para system_admin con cookie
- Banner rojo de impersonación en la UI
- Tests e2e de impersonación

#### Qué se mantiene para v1
- F1: `/super-admin` dashboard, `/super-admin/tenants` lista+detalle con acciones de soporte
- F3: `/super-admin/players` búsqueda global, `/super-admin/jobs` DLQ, `/super-admin/audit` logs

#### Impacto en docs
- [ ] `docs/superpowers/specs/2026-06-12-super-admin-design.md` — Marcar F2 como "deferida a post-lanzamiento"
- [ ] `CLAUDE.md` — Actualizar sección Super Admin (sin impersonación en v1)

#### Impacto en código
- [ ] No implementar `impersonation.server.ts` más allá de lo que ya existe (o limpiarlo si no se usa)
- [ ] `extractAuthUser()` en `auth.middleware.ts` — la rama de impersonación puede quedarse como dead code o limpiarse; NO hace falta testearla para v1
- [ ] No crear el banner de impersonación ni los tests e2e de F2

### 13. 💰 Pricing JSONB: simplificar estructura + UI de grilla hora×día (estilo ATC)
- **Antes**: El pricing JSONB usaba franjas horarias amplias con objeto `prices: {"60": ..., "120": ...}` por duración. Configurar precios escalados hora a hora era imposible sin crear decenas de reglas manualmente. UX/UI horrible para el admin.
- **Ahora**: Con el cambio #6 (solo 60 min), el pricing se simplifica a un solo campo `price` por regla (ya no necesita el objeto `prices` con claves por duración). Además, la UI de configuración de precios pasa a ser una **grilla visual de horas × días** donde el admin pone el precio en cada celda.

#### Cómo funciona la UI (modelo ATC adaptado)

**Vista de configuración de precios de una cancha:**
```
              Lun-Jue    Vie       Sáb       Dom
  08:00      $35.000   $35.000   $45.000   $45.000
  09:00      $35.000   $35.000   $45.000   $45.000
  ...
  18:00      $50.000   $55.000   $55.000   $55.000
  19:00      $55.000   $60.000   $60.000   $60.000
  20:00      $60.000   $65.000   $65.000   $60.000
  21:00      $60.000   $65.000   $65.000   $55.000
  22:00      $55.000   $60.000   $60.000   $50.000
  23:00      $45.000   $50.000   $50.000   $45.000
```

**Flujo del admin:**
1. Marcelo abre la cancha → sección "Precios"
2. Ve una grilla con las horas operativas del complejo en las filas y los días en las columnas
3. Puede editar celdas individuales o **seleccionar un bloque** de celdas y asignarles el mismo precio (bulk edit)
4. Al guardar, el sistema **comprime automáticamente** celdas consecutivas con el mismo precio en una sola regla JSONB
5. Ejemplo: si lunes a jueves de 08:00 a 17:00 todas tienen $35.000, se guarda como una sola regla `{"days": ["mon","tue","wed","thu"], "from": "08:00", "to": "17:00", "price": 3500000}`

**Nuevo formato del JSONB** (cambio #6 ya lo definió, ahora se formaliza):
```json
{
  "rules": [
    { "days": ["mon","tue","wed","thu"], "from": "08:00", "to": "17:00", "price": 3500000 },
    { "days": ["mon","tue","wed","thu"], "from": "17:00", "to": "18:00", "price": 4000000 },
    { "days": ["fri"], "from": "08:00", "to": "17:00", "price": 3500000 },
    { "days": ["fri"], "from": "17:00", "to": "18:00", "price": 4000000 }
  ]
}
```

**Ventaja para complejos simples**: Si el complejo tiene solo 3 precios (mañana/tarde/noche), selecciona el bloque 08-18 y pone $35k, el bloque 18-22 y pone $55k, el bloque 22-00 y pone $45k. Tres clicks.

**Ventaja para complejos complejos**: Si tiene escalones hora a hora con viernes y sábados diferentes, edita celda por celda. El sistema lo guarda comprimido.

#### Qué se elimina
- El objeto `prices: {"60": number, "120": number}` → reemplazado por `price: number` (ya definido en cambio #6)
- Los defaults hardcodeados en `courts.ts` que usan el formato viejo con `prices`
- Toda UI que muestre franjas amplias fijas (mañana/tarde/noche)

#### Impacto en código/docs
- [ ] `src/modules/courts/court.types.ts` — `PricingRule.prices` → `PricingRule.price` (singular, `number`)
- [ ] `src/shared/db/schema/courts.ts` — Eliminar defaults de pricing con formato viejo `prices: {"60":..., "120":...}`
- [ ] `src/modules/courts/court.service.ts` — `calculatePrice()`: eliminar param `durationMins`, siempre evalúa `rule.price`
- [ ] `src/modules/tenants/public.service.ts` — `getPriceForSlot()`: simplificar a `rule.price` en vez de `rule.prices[String(durationMins)]`
- [ ] Tests unitarios e integración: actualizar todos los fixtures de pricing al formato nuevo
- [ ] `docs/spec/doc6_entidades.md` — Court pricing JSONB: documentar formato nuevo
- [ ] `docs/spec/doc13_database_schema.md` — JSONB schema actualizado
- [ ] UI: nueva pantalla de configuración de precios con grilla hora×día
- [ ] Wizard de onboarding: misma UI de grilla simplificada

### 14. 🧹 Eliminar `booking_duration_minutes` de tenant settings (dead code)
- **Antes**: `booking_duration_minutes: number[]` en `TenantSettings` permitía configurar duraciones de 60 o 120 minutos por complejo. El default en el schema todavía dice `[60, 120]`.
- **Ahora**: Con el cambio #6 (solo 60 min), este campo es dead code. Siempre es `[60]`. Reemplazar por una constante global.

#### Qué se elimina
- `booking_duration_minutes` de `TenantSettings` type y del default JSONB en `tenants.ts`
- `bookingDurationMinutes` de `PublicTenant` type y su mapping en `getPublicTenant()`
- Toda lógica que lea `tenant.bookingDurationMinutes[0]` o `settings.booking_duration_minutes`
- El parámetro `durationMins: 60 | 120` en `calculatePrice()` y `getPriceForSlot()`

#### Qué se agrega
- Constante global `SLOT_DURATION_MINUTES = 60` (en `src/shared/constants.ts` o similar)
- Reemplazar todas las lecturas de `durationMins` por la constante

#### Impacto en código/docs
- [ ] `src/modules/tenants/tenant.types.ts` — Eliminar `booking_duration_minutes` del type `TenantSettings`
- [ ] `src/shared/db/schema/tenants.ts` — Eliminar del default JSONB de `settings`
- [ ] `src/modules/tenants/public.service.ts` — Reemplazar `tenant.bookingDurationMinutes[0] ?? 60` por constante
- [ ] `src/modules/courts/court.service.ts` — `calculatePrice()` sin parámetro de duración
- [ ] `PublicTenant` type — Eliminar `bookingDurationMinutes`
- [ ] `UpdateTenantSettingsInput` — Eliminar si incluye duración
- [ ] Tests: actualizar todos los que pasen `durationMins` como parámetro
- [ ] `CLAUDE.md` — Actualizar línea 103 (ya dice "60 o 120", cambiar a "60 minutos fijo, constante global")
- [ ] `docs/spec/doc6_entidades.md` — Tenant settings: eliminar campo

### 15. 🚨 Enforce de `booking_advance_days` en el backend (bug potencial)
- **Antes**: `booking_advance_days: 6` existe como configuración en `tenants.settings` y se expone en `PublicTenant`, pero **no hay validación en el backend** que impida crear una reserva para una fecha más allá de ese límite. Un jugador (o atacante) podría enviar una fecha 30 días en el futuro y la reserva se crearía.
- **Ahora**: Agregar validación en el flujo de creación de booking (tanto online como manual) que rechace fechas más allá de `booking_advance_days` días desde hoy.

#### Cómo funciona
1. Jugador intenta reservar para el 30 de junio (12 días adelante)
2. El sistema calcula: `hoy (18/jun) + booking_advance_days (6) = 24/jun`
3. `30/jun > 24/jun` → rechaza con error "No se puede reservar con más de 6 días de anticipación"
4. La grilla pública directamente **no muestra** días más allá del límite (defensa en frontend)
5. El backend valida igualmente como segunda capa de seguridad

#### Excepciones
- **Reservas manuales del admin**: ¿Aplica el mismo límite o el admin puede reservar sin restricción de anticipación? Propuesta: el admin puede reservar sin límite de anticipación (necesita flexibilidad para eventos especiales, torneos, etc.)
- **Bookings de abonados (`fixed`)**: Los abonados se generan rolling 8+ semanas adelante, no aplica este límite (ya están confirmados por el abono)

#### Impacto en código/docs
- [ ] Lógica de creación de booking online — Agregar validación de `booking_advance_days`
- [ ] API de reserva pública — Rechazar con error descriptivo si excede anticipación
- [ ] Grilla pública — No mostrar fechas más allá del límite de anticipación
- [ ] `docs/spec/doc7_flujos_e2e.md` — Flujo 2: agregar validación de anticipación
- [ ] `docs/spec/doc8_user_stories.md` — Agregar edge case de anticipación excedida
- [ ] Tests: test de integración que valide el rechazo por anticipación excedida

### 16. 🏗️ Separar `indoor` del enum `surface_type` → atributos por cancha
- **Antes**: `surface_type` mezclaba dos dimensiones: superficie del piso (`synthetic_grass`, `natural_grass`, `cement`) y cobertura (`indoor`). Una cancha techada de césped sintético no podía representarse correctamente.
- **Ahora**: Separar en dos conceptos:
  1. **`surface_type`** (enum): solo describe el piso → `synthetic_grass` | `natural_grass` | `cement` | `tile`
  2. **Atributos por cancha** (campos booleanos en `courts`): `is_covered` (techada/descubierta) + `has_lighting` (con/sin iluminación)

#### Nuevo enum `surface_type`
```sql
-- Migración: quitar 'indoor', agregar 'tile' (baldosa)
ALTER TYPE surface_type RENAME VALUE 'indoor' TO 'tile';
-- O crear migración más segura que:
-- 1. Actualice courts con surface_type='indoor' a 'synthetic_grass' + is_covered=true
-- 2. Remueva 'indoor' del enum
-- 3. Agregue 'tile' al enum
```

#### Nuevos campos en tabla `courts`
| Campo | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `is_covered` | `boolean` | `false` | Cancha techada (true) o descubierta (false) |
| `has_lighting` | `boolean` | `true` | Con iluminación (true) o sin iluminación (false) |

#### Cómo se muestra en la página pública
Debajo del nombre de cada cancha, estilo ATC:
> "Césped sintético, Con iluminación, Descubierta"
> "Cemento, Con iluminación, Techada"

#### ¿Texto libre para superficie? NO
El enum nos da filtros limpios en el marketplace/buscador. Texto libre destruye la capacidad de filtrar ("solo canchas de césped sintético"). Si aparece un piso nuevo en el futuro, se agrega al enum con una migración.

#### Impacto en código/docs
- [ ] Migración SQL: migrar canchas con `surface_type='indoor'` → `surface_type='synthetic_grass'` + `is_covered=true`
- [ ] `src/shared/db/schema/enums.ts` — Quitar `indoor`, agregar `tile` en `surfaceTypeEnum`
- [ ] `src/shared/db/schema/courts.ts` — Agregar `is_covered: boolean` y `has_lighting: boolean`
- [ ] `src/modules/courts/court.types.ts` — Actualizar `CourtRow` y `CreateCourtInput`
- [ ] `src/modules/tenants/public.service.ts` — `PublicCourtCard` y `PublicCourt`: incluir atributos
- [ ] Trigger `courts_recalc_from_price` — Si denormaliza superficies, actualizar
- [ ] `src/components/public/courtFacets.ts` — Actualizar facets de superficie
- [ ] `docs/spec/doc6_entidades.md` — Court: actualizar campos y enum
- [ ] `docs/spec/doc13_database_schema.md` — ALTER TABLE courts, ALTER TYPE surface_type
- [ ] UI pública: mostrar "Césped sintético, Con iluminación, Descubierta" debajo del nombre
- [ ] UI admin: formulario de cancha con selectores para superficie, cobertura e iluminación
- [ ] Tests: actualizar fixtures que usen `surface_type='indoor'`

### 17. ⚽ Nuevo campo `format` (Fútbol 5, 7, 8, 9, 11) separado de `capacity`
- **Antes**: `capacity` (integer) se usaba tanto para la capacidad real de la cancha (10 jugadores) como para identificar el formato (Fútbol 5). Esto generaba confusión: la UI mostraba "Capacidad: 10" cuando debería decir "Fútbol 5". Además, los filtros del marketplace/buscador filtraban por capacity cuando el concepto que busca el jugador es "quiero una cancha de Fútbol 5".
- **Ahora**: Agregar campo `format` que representa el número del nombre del formato (5, 7, 8, 9, 11). La UI muestra "Fútbol {format}". El `capacity` puede calcularse o mantenerse para validaciones internas.

#### Nuevo campo en tabla `courts`
| Campo | Tipo | Constraint | Descripción |
|-------|------|-----------|-------------|
| `format` | `integer` | `NOT NULL, CHECK (format IN (4, 5, 6, 7, 8, 9, 10, 11))` | Formato de la cancha: Fútbol 4, 5, 6, 7, 8, 9, 10, 11 |

#### Cómo se muestra
- **Admin (formulario)**: Dropdown "Formato de cancha" con opciones: Fútbol 4, Fútbol 5, ..., Fútbol 11
- **Página pública**: "Cancha 3 - **Fútbol 5**" (debajo: "Césped sintético, Con iluminación, Descubierta")
- **Marketplace/Buscador**: Filtro "Tipo de cancha" con checkboxes: Fútbol 5, Fútbol 7, Fútbol 8, etc.

#### Relación con `capacity`
- `format = 5` → `capacity = 10` (5 por lado)
- `format = 7` → `capacity = 14`
- `format = 8` → `capacity = 16`
- `format = 11` → `capacity = 22`
- **Propuesta**: `capacity` se calcula automáticamente como `format × 2`. Si se mantiene como campo, se auto-llena al elegir el formato. El admin no tiene que ingresarlo manualmente.

#### Beneficio para filtros del marketplace
El campo `court_formats` ya existe en la tabla `tenants` como denormalización para filtros públicos. Actualmente almacena `capacity` (enteros como 10, 14). Con el campo `format`, pasa a almacenar formatos reales (5, 7, 8, 11) que son más intuitivos para el jugador en la UI de búsqueda.

#### Impacto en código/docs
- [ ] Migración SQL: `ALTER TABLE courts ADD COLUMN format integer` + migrar `capacity` existente → `format = capacity / 2`
- [ ] `src/shared/db/schema/courts.ts` — Agregar campo `format` con check constraint
- [ ] `src/modules/courts/court.types.ts` — Agregar `format` a `CourtRow` y `CreateCourtInput`
- [ ] `src/modules/tenants/public.service.ts` — `PublicCourtCard`: incluir `format`
- [ ] Trigger `courts_recalc_from_price` — Denormalizar `format` en vez de `capacity` para `court_formats`
- [ ] `src/components/public/courtFacets.ts` — Actualizar facets a usar formatos
- [ ] `docs/spec/doc6_entidades.md` — Court: agregar campo `format`, actualizar `capacity`
- [ ] `docs/spec/doc13_database_schema.md` — ALTER TABLE courts
- [ ] UI admin: dropdown de formato en formulario de cancha
- [ ] UI pública: mostrar "Fútbol {format}" en vez de "Capacidad: {capacity}"
- [ ] `CLAUDE.md` — Documentar el campo `format` y la jerga: Fútbol 4, 5, 7, 8, 9, 11
- [ ] Tests: actualizar fixtures y assertions que usen `capacity` como proxy de formato

---

## Pendientes de Debate

*(se irán agregando a medida que avance el análisis)*

### 13. Anonimización de jugadores con deuda
- **Situación actual**: El código y los tests permiten que un jugador borre su cuenta (se anonimice por ley de privacidad ARCO) incluso si tiene un saldo deudor pendiente (`balance > 0`) en algún complejo. El sistema elimina su vinculación sin chequear deudas.
- **Debate**: ¿Deberíamos bloquear la eliminación de la cuenta (ej: lanzando un `PlayerHasDebtError`) si tiene deudas, o permitimos que se elimine y el complejo asume la pérdida/lo maneja por fuera?
