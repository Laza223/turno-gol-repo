# DOC 7 — Flujos End-to-End
## TurnoGol: Los If/Else del Negocio

> **Propósito**: Documentar cada flujo principal con entradas, decisiones, estados intermedios, salidas y efectos secundarios.
> Esto no son pantallas. Son los **if/else del negocio** — la lógica que determina qué pasa en cada situación posible.
> De este documento sale la lógica de negocio del backend casi directamente.

> [!NOTE]
> **Convención de este documento**:
> - Cada flujo referencia entidades y state machines del Doc 6.
> - Los efectos secundarios (email, caja, auditoría) son tan importantes como el happy path.
> - "Out of scope" es oro puro: evita el scope creep durante el desarrollo.

---

## Índice de Flujos

| # | Flujo | Grupo |
|---|---|---|
| 1 | Onboarding de un nuevo complejo (trial) | Core |
| 2 | Reserva online por jugador (con y sin seña) | Core |
| 3 | Reserva manual por admin | Core |
| 4 | Cancelación de reserva (4 variantes) | Core |
| 5 | Alta de abonado + generación de turnos recurrentes | Avanzado |
| 6 | Cierre de caja diario | SaaS & Finanzas |
| 7 | Conversión de trial a suscripción paga | SaaS & Finanzas |
| 8 | Cobro fallido de suscripción (dunning flow) | SaaS & Finanzas |
| 9 | Cancelación de cuenta por el dueño | SaaS & Finanzas |

> [!NOTE]
> **Numeración**: Los flujos se renumeraron tras eliminar del scope v1 el cobro automático de abonados (ex Flujo 6),
> la creación de partidos abiertos (ex Flujo 7) y el partido que no se llena (ex Flujo 8).
> La numeración actual es definitiva.

---

# PARTE 1 — OPERACIONES CORE

---

## FLUJO 1: Onboarding de un Nuevo Complejo (Trial)

### Punto de entrada
- **URL**: `turnogol.com.ar/registrar` (landing page pública)
- **Trigger**: El dueño de un complejo hace click en "Probá gratis 30 días"
- **Origen probable**: Google Ads, referido de otro complejo, Instagram del complejo, visita directa

### Precondiciones
- El email del dueño NO está registrado como StaffUser
- No existe otro Tenant con el mismo email de contacto (evitar duplicados)
- Si el email ya existe como StaffUser en otro Tenant → flujo diferente: "Agregar un nuevo complejo a tu cuenta" (no se cubre acá)

### Happy Path

```
PASO 1 — Registro de cuenta
  ├── Input: email + nombre completo + celular
  ├── Validación: email válido, celular con formato argentino (+54 9 ...)
  ├── Acción: crear StaffUser con role='admin'
  ├── Acción: enviar magic link al email
  └── Output: pantalla "Revisá tu email"

PASO 2 — Verificación de email
  ├── Input: click en magic link (válido 15 minutos, un solo uso)
  ├── Acción: verificar token → crear sesión JWT
  └── Output: redirect a wizard de onboarding (paso 3)

PASO 3 — Datos del complejo (wizard paso 1 de 4)
  ├── Input: nombre del complejo, dirección, ciudad, provincia
  ├── Valores pre-cargados: timezone = 'America/Argentina/Buenos_Aires'
  ├── Opcional (salteable): logo, foto de portada, descripción
  ├── Acción: crear Tenant con status='trialing', trial_ends_at = NOW() + 30 días
  ├── Acción: crear TenantSubscription con status='trialing'
  ├── Acción: crear relación tenant_staff_members (admin)
  └── Output: avanzar al paso 2

PASO 4 — Crear primera cancha (wizard paso 2 de 4)
  ├── Input: nombre de la cancha, tipo de superficie, capacidad (5/7/11)
  ├── Valores pre-cargados: 
  │     pricing default basado en el promedio del mercado AR
  │     {weekday_morning: 8000, weekday_afternoon: 10000, weekday_night: 12000, 
  │      weekend_morning: 10000, weekend_night: 15000}
  ├── El usuario puede editar los precios o dejar los default
  ├── Botón "Agregar otra cancha" (puede agregar N canchas)
  ├── Acción: crear Court con status='online' para cada cancha
  └── Output: avanzar al paso 3

PASO 5 — Horarios de apertura (wizard paso 3 de 4)
  ├── Valores pre-cargados: Lun-Jue 08:00-00:00, Vie 08:00-01:00, Sáb 09:00-01:00, Dom 09:00-23:00
  ├── El usuario puede personalizar por día
  ├── Puede marcar días cerrados (ej: 25 de diciembre)
  ├── Acción: guardar opening_hours y closed_dates en Tenant.settings
  └── Output: avanzar al paso 4

PASO 6 — Configurar seña (wizard paso 4 de 4)
  ├── Pregunta: "¿Querés cobrar seña para reservas online?"
  ├── SI → input de porcentaje (default 30%) + setup de MercadoPago
  │     ├── Redirect a OAuth de MercadoPago del complejo
  │     ├── Acción: guardar MP credentials del complejo
  │     └── Acción: settings.requires_deposit = true, deposit_percentage = X
  ├── NO → saltear (se puede configurar después)
  │     └── Acción: settings.requires_deposit = false
  └── Output: wizard completo → redirect al dashboard

PASO 7 — Dashboard con checklist
  ├── Mostrar: "Tu complejo está al 80% listo" (barra de progreso)
  ├── Checklist visible:
  │     ✅ Cuenta creada
  │     ✅ Datos del complejo
  │     ✅ Primera cancha configurada
  │     ✅ Horarios definidos
  │     ⬜ Configurar seña y MercadoPago (si lo salteó)
  │     ⬜ Compartir tu link público
  │     ⬜ Recibir tu primera reserva online ← EL "AHA MOMENT"
  └── Acción: el complejo ya está live en turnogol.com.ar/{slug}
```

### Decisiones del negocio (if/else)

| Condición | Resultado |
|---|---|
| ¿El email ya existe como StaffUser? | Error: "Ya tenés una cuenta. ¿Querés agregar otro complejo?" |
| ¿El slug del complejo ya existe? | Auto-generar variante: `complejo-san-martin` → `complejo-san-martin-2` |
| ¿Salteó la configuración de MP? | El complejo funciona pero las reservas online son sin seña (cobro presencial) |
| ¿Salteó crear canchas? | El complejo se crea pero no aparece en búsquedas hasta tener al menos 1 cancha activa |
| ¿El magic link expiró (15 min)? | Botón "Reenviar link" en la pantalla de espera |

### Estados intermedios

| Estado | Qué ve el usuario | Duración máxima |
|---|---|---|
| Email enviado, sin verificar | "Revisá tu email. ¿No llegó? Reenviar." | 15 minutos (luego el link expira) |
| Wizard incompleto | Dashboard con checklist y barra de progreso | Mientras dure el trial (30 días) |
| Setup de MP en progreso | Redirect a MP, luego callback a TurnoGol | ~2 minutos |

### Puntos de salida

- **Éxito**: Tenant creado con status `trialing`, al menos 1 cancha, horarios configurados. Link público activo.
- **Abandono en paso 1**: No se crea nada. Solo un email sin verificar.
- **Abandono en paso 2** (verificó email, no completó wizard): StaffUser creado, Tenant NO creado. Al volver a loguearse → retomar wizard.
- **Abandono en paso 3+** (empezó wizard, no terminó): Tenant creado con lo que haya puesto. Dashboard con checklist pendiente.
- **Error de MP OAuth**: El complejo se crea sin MP. Puede configurarlo después desde Settings.

### Efectos secundarios

| Evento | Efecto |
|---|---|
| Tenant creado | 📩 Email de bienvenida al dueño con guía rápida |
| Tenant creado | 📊 AuditLog: `tenant.created` |
| Trial iniciado | ⏰ Cron job programado: notificación día 7, 21, 28, 30, 31 |
| Primera cancha creada | 📊 AuditLog: `court.created` |
| MP conectado | 📊 AuditLog: `tenant.mp_connected` |
| Wizard completado | 📩 Email: "Tu complejo está listo. Compartí tu link: turnogol.com.ar/{slug}" |

### Edge cases explícitos

1. **El dueño se registra y nunca verifica el email**: No se crea nada. El magic link expira a los 15 minutos. Puede pedir uno nuevo.
2. **El dueño empieza el wizard en el celular y quiere seguir en la PC**: Al loguearse en otro dispositivo retoma donde quedó (el wizard guarda progreso en DB, no en localStorage).
3. **Dos socios quieren registrar el mismo complejo**: El primero que lo registra es el admin. Puede invitar al segundo como admin desde Settings.
4. **El dueño ya usa ATC Sports y quiere migrar**: v1 no tiene importación automática. El onboarding es desde cero. Documentar como feature futuro.
5. **El dueño pone un slug que ya existe** (ej: "cancha"): Auto-sufijo numérico. Informar al usuario del slug asignado.
6. **Se corta la conexión durante el OAuth de MP**: Al volver a TurnoGol, detectar que el callback no llegó. Mostrar botón "Reintentar conexión con MercadoPago".

### Out of scope

- ❌ Importación de datos desde ATC Sports u otro sistema
- ❌ Registro con múltiples complejos en el mismo wizard (es 1 complejo por registro)
- ❌ Verificación de identidad del dueño (en v1 confiamos en el email)
- ❌ App nativa (el onboarding es 100% web responsive)
- ❌ Onboarding guiado con video tutorial interactivo (v2)

---

## FLUJO 2: Reserva Online por Jugador (Con y Sin Seña)

### Punto de entrada
- **URL**: `turnogol.com.ar/{slug}` → página pública del complejo → seleccionar cancha y horario
- **Trigger**: Jugador encuentra un horario libre y hace click en "Reservar"
- **Origen probable**: Link compartido por el complejo en su Instagram/redes, búsqueda en el marketplace de TurnoGol, link directo de un amigo

### Precondiciones
- El Tenant tiene status `trialing` o `active` (no `suspended`, `past_due` con más de 7 días, ni `churned`)
- El Tenant tiene `settings.allow_online_booking = true`
- La cancha tiene status `online`
- El slot solicitado está libre (sin bookings en status `confirmed` o `pending_payment` con overlap)

### Happy Path — CON SEÑA (el complejo requiere depósito)

```
PASO 1 — Selección de cancha y horario
  ├── Vista: grilla de disponibilidad del complejo (día + canchas)
  ├── Slots: verde = libre, rojo = ocupado, gris = fuera de horario
  ├── Input: click en un slot libre
  ├── Output: modal de confirmación con:
  │     - Cancha + fecha + horario
  │     - Precio total: $X (obtenido de court.pricing evaluado en ese horario)
  │     - Seña requerida: $Y (precio × deposit_percentage%)
  └── Botón: "Reservar y pagar seña"

PASO 2 — Autenticación del jugador
  ├── SI ya está logueado → saltar al paso 3
  ├── SI no está logueado:
  │     ├── Opción A: "Ingresá con tu email" → magic link
  │     ├── Opción B: "Ingresá con Google" → OAuth Google
  │     └── Opción C: "Registrate" → email + nombre + celular
  ├── Si es registro nuevo → crear Player con status='active'
  └── Output: jugador autenticado → continuar

PASO 3 — Creación de la reserva (el momento crítico)
  ├── TRANSACCIÓN ATÓMICA EN DB:
  │     ├── SELECT FOR UPDATE en la cancha (lock exclusivo)
  │     ├── Verificar disponibilidad DENTRO de la transacción
  │     ├── Si LIBRE:
  │     │     ├── Crear Booking con status='pending_payment'
  │     │     ├── price_snapshot = precio evaluado en este momento (inmutable)
  │     │     ├── deposit_amount = price_snapshot × deposit_percentage / 100
  │     │     ├── deposit_status = 'pending'
  │     │     └── COMMIT
  │     └── Si OCUPADO:
  │           ├── ROLLBACK
  │           └── Error: "¡Ups! Este turno acaba de ser tomado. Te mostramos otros horarios disponibles."
  └── Output: Booking creado → redirect a pago

PASO 4 — Pago de seña vía MercadoPago
  ├── Acción: crear preferencia de pago en MP (Checkout Pro)
  │     ├── amount = deposit_amount
  │     ├── external_reference = booking.id
  │     ├── notification_url = webhook de TurnoGol
  │     ├── back_urls = { success, failure, pending } (redirect post-pago)
  │     └── auto_return = 'approved' (volver automáticamente a TurnoGol si el pago se aprueba)
  ├── Redirect al checkout de MercadoPago
  ├── El jugador paga con: tarjeta, dinero en cuenta, transferencia
  └── Output: MP procesa → redirect back a TurnoGol

PASO 5 — Confirmación por webhook
  ├── MP envía webhook a notification_url
  ├── Verificar firma del webhook (autenticidad)
  ├── Verificar que el mp_event_id no fue ya procesado (idempotencia)
  ├── Si payment.status = 'approved':
  │     ├── Crear Payment con status='approved', type='deposit'
  │     ├── Actualizar Booking: status → 'confirmed', deposit_status → 'paid'
  │     ├── Actualizar Booking: payment_id = payment.id
  │     └── ÉXITO
  ├── Si payment.status = 'rejected' o 'canceled':
  │     ├── Booking permanece en 'pending_payment'
  │     └── El jugador ve "El pago no se procesó. ¿Querés reintentar?"
  └── Output: Booking confirmado → pantalla de éxito

PASO 6 — Pantalla de éxito + notificaciones
  ├── Vista: "¡Tu turno está confirmado!"
  │     ├── Cancha + fecha + horario
  │     ├── Seña pagada: $Y
  │     ├── Resta abonar en el complejo: $X - $Y
  │     └── Botón: "Agregar al calendario" (genera .ics)
  └── Disparar efectos secundarios (ver abajo)
```

### Happy Path — SIN SEÑA (el complejo NO requiere depósito)

```
Idéntico al flujo con seña EXCEPTO:
  - PASO 1: el modal muestra "Precio: $X — Sin seña requerida"
  - PASO 3: Booking se crea directamente con status='confirmed' (no pasa por pending_payment)
  - PASO 4 y 5: NO EXISTEN (no hay pago)
  - PASO 6: "¡Tu turno está confirmado! Pagás $X al llegar al complejo."
```

### Decisiones del negocio (if/else)

| Condición | Resultado |
|---|---|
| `tenant.settings.requires_deposit = false` | Flujo SIN seña: booking se confirma sin pago |
| `tenant.settings.requires_deposit = true` | Flujo CON seña: booking queda en `pending_payment` hasta que MP confirme |
| El jugador tiene ban global | Error: "Tu cuenta está temporalmente suspendida. Contactá a soporte." |
| El jugador tiene ban en ESTE complejo | Error: "No podés reservar en este complejo actualmente." |
| El slot se ocupó entre que el jugador vio la grilla y confirmó | Error amigable + sugerencia de horarios alternativos |
| El pago de MP falla | Booking queda en `pending_payment`. El jugador puede reintentar. |
| El pago de MP queda "in_process" (transferencia bancaria) | Booking queda en `pending_payment`. Se confirma cuando MP notifica via webhook. |
| El jugador abandona el checkout de MP | Booking queda en `pending_payment` por max 15 minutos → timeout → `expired` |

### Estados intermedios

| Estado | Qué ve el jugador | Duración máxima |
|---|---|---|
| `pending_payment` | "Tu reserva está procesando el pago..." | 15 minutos |
| Checkout de MP abierto | Pantalla de MP (fuera de TurnoGol) | Hasta que pague, cancele o timeout |
| Esperando webhook de MP | "Confirmando tu pago..." (spinner) | ~5 segundos normalmente, hasta 30s |

### Timer de expiración (crítico)

```
Al crear un Booking con status='pending_payment':
  → Se programa un job que se ejecuta en 15 minutos
  → Si en 15 minutos el booking sigue en 'pending_payment':
      → Transición a 'expired'
      → El slot se libera
      → 📩 Email al jugador: "Tu reserva expiró porque no se completó el pago. 
         ¿Querés intentar de nuevo?"
  → Si el pago llegó antes de los 15 min → el job se cancela (no-op)
```

### Puntos de salida

- **Éxito**: Booking en status `confirmed`. Slot bloqueado. Seña cobrada (o $0 si sin seña).
- **Pago rechazado**: Booking en `pending_payment`. El jugador puede reintentar con otro medio de pago.
- **Timeout**: Booking en `expired`. Slot liberado. Irrecuperable (tiene que hacer una reserva nueva).
- **Slot ocupado (race condition)**: Booking NO creado. Mensaje amigable + alternativas.
- **Abandono**: Si el jugador cierra la ventana antes de pagar → timeout en 15 minutos → `expired`.

### Efectos secundarios

| Evento | Efecto |
|---|---|
| Booking confirmado | 📩 Email al jugador: "Turno confirmado: {cancha} el {fecha} a las {hora}. Seña: ${monto}." |
| Booking confirmado | 📩 Email al complejo: "Nueva reserva: {cancha} {fecha} {hora} — {nombre_jugador}" |
| Booking confirmado | 📊 AuditLog: `booking.confirmed` con actor=player |
| Booking confirmado | 💰 CashFlow: income, category='booking', method='mercadopago', amount=deposit |
| Booking confirmado | ⏰ Cron: programar recordatorio email 24hs antes del turno |
| Booking confirmado | ⏰ Cron: programar recordatorio email 2hs antes del turno |

> [!NOTE]
> **Recordatorios cuando `player_id IS NULL`**: Si la reserva no tiene jugador registrado
> (ej: reserva manual sin player), NO se programan recordatorios por email (no hay destinatario).
> El admin es responsable de avisar al jugador por sus propios medios.
| Booking expirado | 📩 Email al jugador: "Tu reserva para {cancha} el {fecha} expiró" |
| Booking expirado | 📊 AuditLog: `booking.expired` con actor=system |
| Payment recibido | 📊 AuditLog: `payment.approved` |

### Edge cases explícitos

1. **Dos jugadores intentan reservar el mismo slot al mismo tiempo**: El primero que llega al COMMIT gana. El segundo recibe error amigable. Garantizado por `SELECT FOR UPDATE` (Doc 5, sección 9).
2. **El jugador paga pero el webhook de MP tarda**: El jugador ve "Confirmando..." con spinner. Si pasan 30 segundos, mostrar: "Estamos procesando tu pago. Te avisamos por email en cuanto se confirme." El booking se confirma cuando llega el webhook (puede ser minutos después).
3. **Webhook de MP llega duplicado**: Chequear `mp_event_id` en tabla `processed_webhooks`. Si ya existe, ignorar (idempotencia).
4. **El jugador paga y luego cierra la ventana antes de ver la confirmación**: No importa. El webhook llega igual y el booking se confirma. El jugador recibe email de confirmación.
5. **El precio de la cancha cambió entre que el jugador vio la grilla y pagó**: Se usa `price_snapshot` (el precio al momento del paso 3, no el actual). El cambio de precio no afecta reservas ya creadas.
6. **El jugador quiere reservar 2 turnos seguidos en la misma cancha**: Tiene que hacer 2 reservas separadas. Cada una es independiente.
7. **La conexión del jugador se corta durante el checkout de MP**: Si ya pagó → el webhook funciona igual → booking confirmado. Si no pagó → timeout 15 min → expired.
8. **MP está caído**: El sistema detecta el error de la API de MP → muestra: "El sistema de pagos no está disponible. Contactá al complejo para reservar por teléfono." Si el complejo acepta reservas sin seña, se puede hacer sin pago.

### Out of scope

- ❌ Reservar múltiples canchas en una sola operación
- ❌ Reservar para otro jugador (el que paga es el responsable)
- ❌ Split de pago entre jugadores (cada uno paga su parte)
- ❌ Lista de espera si el slot está ocupado
- ❌ Modificar fecha/hora de una reserva ya confirmada (tiene que cancelar y hacer otra)
- ❌ Reservar en el pasado (validación: `date >= hoy`)
- ❌ Elegir duración variable (el slot tiene duración fija: 1 hora por defecto, configurable por cancha)

---

## FLUJO 3: Reserva Manual por Admin

### Punto de entrada
- **URL**: Panel admin → Grilla de reservas → Click en un slot libre
- **Trigger**: El admin o recepcionista recibe una llamada/mensaje de un jugador y crea la reserva manualmente
- **Variante**: También se puede crear desde el botón "+ Nueva Reserva" en el panel

### Precondiciones
- StaffUser tiene rol `admin` en este Tenant
- La cancha tiene status `online`
- El slot está libre (misma validación que en el flujo online)

### Happy Path

```
PASO 1 — Selección desde la grilla
  ├── El admin ve la grilla semanal con todas las canchas
  ├── Click en un slot libre → modal de "Nueva Reserva"
  ├── Pre-cargado: cancha, fecha, hora inicio, hora fin
  └── Output: modal abierto

PASO 2 — Datos del jugador
  ├── Campo de búsqueda: "Nombre o celular del jugador"
  ├── SI el jugador ya existe en el sistema:
  │     ├── Autocompletar nombre + celular
  │     └── Verifica si tiene ban (global o de este complejo)
  ├── SI es un jugador nuevo (no registrado):
  │     ├── Input: nombre + celular (mínimo)
  │     ├── NO se crea Player (la reserva queda sin player_id)
  │     └── El admin puede anotar el nombre en notes_internal
  ├── Opción: "Sin jugador asignado" (para bloqueos o reservas tentativas)
  └── Output: jugador seleccionado o reserva sin jugador

PASO 3 — Tipo de reserva y notas
  ├── Tipo: 'spontaneous' (default) | 'block'
  │     ├── 'spontaneous': reserva normal
  │     └── 'block': no hay jugador, la cancha está bloqueada (mantenimiento, evento privado)
  ├── Precio: pre-cargado desde court.pricing. El admin puede editarlo (override manual).
  ├── Notas internas: texto libre (visible solo para staff)
  ├── Notas para el jugador: texto libre (visible si el jugador tiene cuenta)
  └── Output: datos completos

PASO 4 — Seña
  ├── SI el complejo requiere seña:
  │     ├── ¿El jugador pagó la seña? Selector:
  │     │     ├── "Pagó seña en efectivo" → deposit_status = 'paid', method = 'cash'
  │     │     ├── "Pagó seña por transferencia" → deposit_status = 'paid', method = 'transfer'
  │     │     ├── "Pagó seña por MP" → deposit_status = 'paid', method = 'mercadopago'
  │     │     ├── "No pagó seña (excepción)" → deposit_status = 'not_required'
  │     │     └── "Enviar link de pago por email" → genera link de MP, envía por email
  │     └── Monto de seña: pre-calculado, editable por el admin
  ├── SI el complejo NO requiere seña:
  │     └── deposit_status = 'not_required'
  └── Output: seña registrada o no

PASO 5 — Confirmación
  ├── TRANSACCIÓN ATÓMICA (idéntica al flujo online: SELECT FOR UPDATE)
  ├── Crear Booking con:
  │     ├── status = 'confirmed' (la reserva manual se confirma directamente)
  │     ├── created_by_staff = staff_user.id
  │     ├── player_id = jugador seleccionado o null
  │     └── type según lo elegido en paso 3
  ├── Si se registró seña → crear Payment correspondiente
  └── Output: reserva creada → cerrar modal → grilla actualizada
```

### Decisiones del negocio (if/else)

| Condición | Resultado |
|---|---|
| Jugador con ban global | Warning: "Este jugador tiene una suspensión activa. ¿Crear igual?" (el admin decide) |
| Jugador con ban en este complejo | Warning: "Baneaste a este jugador el {fecha}. ¿Crear igual?" |
| Precio editado por el admin | Se guarda el precio manual como `price_snapshot` (override del pricing de la cancha) |
| Tipo = 'block' | No se envía email al jugador (no hay jugador). No genera CashFlow. |
| El admin quiere una reserva de 2 horas | `time_end = time_start + 2h`. No hay restricción de duración en reserva manual. |
| El slot ya está ocupado | Error: "Este horario ya tiene una reserva. ¿Querés ver los horarios libres?" |

### Estados intermedios

La reserva manual no tiene estados intermedios significativos. Se confirma en el momento del click.

**Excepción**: Si el admin eligió "Enviar link de pago por email":
| Estado | Qué pasa | Duración |
|---|---|---|
| Link enviado, sin pagar | Booking en `pending_payment` | 15 minutos (luego expira) |
| Jugador paga por link | Webhook de MP → booking pasa a `confirmed` | — |

### Puntos de salida

- **Éxito**: Booking en status `confirmed`. Grilla actualizada al instante.
- **Slot ocupado**: Modal con error. No se crea nada.
- **Abandono**: El admin cierra el modal. No se crea nada (no hay estado parcial).

### Efectos secundarios

| Evento | Efecto |
|---|---|
| Booking creado con jugador registrado | 📩 Email al jugador: "Te reservaron un turno: {cancha} {fecha} {hora}. Complejo: {nombre}" |
| Booking creado sin jugador | Sin notificación (no hay a quién avisar) |
| Booking creado tipo 'block' | Sin notificación. Solo bloqueo visual en grilla. |
| Seña registrada en efectivo | 💰 CashFlow: income, category='booking', method='cash' |
| Seña registrada por transferencia | 💰 CashFlow: income, category='booking', method='transfer' |
| Link de pago enviado por email | 📩 Email al jugador con link de MP |
| Cualquier booking creado | 📊 AuditLog: `booking.created` con actor=staff, actor_id=staff_user.id |
| Booking con jugador | ⏰ Cron: recordatorio email 24hs antes (solo si jugador tiene email registrado) |

### Edge cases explícitos

1. **El admin crea una reserva para hoy en 10 minutos**: Válido. No hay mínimo de anticipación para reservas manuales (sí lo hay para online: configurable por complejo).
2. **El admin crea una reserva en el pasado**: Permitido SOLO si `date = hoy` y `time_start` ya pasó (para registrar un turno que ya se jugó). NO permitido para fechas anteriores a hoy.
3. **El admin crea una reserva que se solapa con un abonado pausado**: Permitido. Si el abonado está pausado, sus slots están liberados.
4. **El admin pone precio $0**: Permitido (cortesía, invitado del dueño). Se guarda `price_snapshot = 0`.
5. **El recepcionista no sabe si el jugador ya pagó la seña**: Puede poner "No pagó seña" y el admin lo arregla después.
6. **Dos recepcionistas intentan crear reserva en el mismo slot**: Misma protección que el flujo online (`SELECT FOR UPDATE`). El primero gana.

### Out of scope

- ❌ Drag & drop para mover reservas de un slot a otro
- ❌ Reserva recurrente desde este flujo (eso es Alta de Abonado, Flujo 5)
- ❌ Copiar una reserva a otro día
- ❌ Crear reserva desde la app del jugador en nombre de otro jugador
- ❌ Integración con Google Calendar del complejo (v2)

---

## FLUJO 4: Cancelación de Reserva (4 Variantes)

> [!IMPORTANT]
> Este flujo tiene 4 sub-flujos que comparten estructura pero difieren en quién cancela, cuándo, y qué pasa con la seña.
> Es el flujo con más impacto financiero: involucra reembolsos, penalidades y liberación de slots.

### Variante 4A: Jugador Cancela Dentro del Plazo

**"Cancela a tiempo — con reembolso de seña"**

#### Punto de entrada
- **URL**: App del jugador → Mis Reservas → [Reserva] → "Cancelar reserva"
- **Trigger**: El jugador quiere cancelar antes de la fecha límite definida por el complejo

#### Precondiciones
- Booking en status `confirmed`
- `NOW() < booking.date + booking.time_start - tenant.settings.cancellation_policy.hours_before`
  (Es decir: faltan más horas de las que exige la política de cancelación)
- Ejemplo: este complejo configuró política = 3hs antes (el default es 12hs). Turno a las 21:00. Si cancela antes de las 18:00 → reembolso.

#### Happy Path

```
PASO 1 — Solicitud de cancelación
  ├── Vista: detalle de la reserva + botón "Cancelar"
  ├── Modal de confirmación: "¿Estás seguro? Tu seña de ${monto} se te devuelve."
  ├── Input opcional: motivo de cancelación (texto libre)
  └── Botón: "Sí, cancelar"

PASO 2 — Procesamiento
  ├── Actualizar Booking:
  │     ├── status → 'canceled_refunded'
  │     ├── canceled_by = 'player'
  │     ├── canceled_at = NOW()
  │     └── canceled_reason = motivo ingresado
  ├── SI había seña pagada (deposit_status = 'paid'):
  │     ├── Crear refund en MercadoPago (API de reembolso)
  │     ├── Crear Payment con type='refund', amount=deposit_amount
  │     └── Actualizar deposit_status → 'refunded'
  ├── SI no había seña:
  │     └── Solo cambiar status (no hay plata que devolver)
  ├── Liberar el slot (ahora otros pueden reservar)
  └── Output: confirmación de cancelación
```

#### Efectos secundarios

| Evento | Efecto |
|---|---|
| Booking cancelado | 📩 Email al jugador: "Tu turno del {fecha} {hora} fue cancelado. Tu seña de ${monto} se devuelve." |
| Booking cancelado | 📩 Email al complejo: "Cancelación: {cancha} {fecha} {hora} — {jugador}. Slot liberado." |
| Reembolso procesado | 💰 CashFlow: expense, category='booking', description='Reembolso seña' |
| Cualquier cancelación | 📊 AuditLog: `booking.canceled` con before_state + after_state |

---

### Variante 4B: Jugador Cancela Fuera del Plazo

**"Cancela tarde — sin reembolso de seña"**

#### Punto de entrada
Igual que 4A, pero el jugador cancela cuando ya pasó el plazo.

#### Precondición diferencial
- `NOW() >= booking.date + booking.time_start - tenant.settings.cancellation_policy.hours_before`
  (Faltan menos horas de las que exige la política)
- Ejemplo: este complejo configuró política = 3hs antes (el default es 12hs). Turno a las 21:00. Son las 19:30 → fuera del plazo.

#### Happy Path

```
PASO 1 — Solicitud de cancelación (con advertencia)
  ├── Modal: "Estás cancelando fuera del plazo. Tu seña de ${monto} NO se devuelve."
  ├── Texto legal: "Política del complejo: cancelación gratuita hasta {hours_before}hs antes."
  └── Botón: "Cancelar de todas formas"

PASO 2 — Procesamiento
  ├── Actualizar Booking:
  │     ├── status → 'canceled_no_refund'
  │     ├── canceled_by = 'player'
  │     ├── canceled_at = NOW()
  │     └── canceled_reason = motivo
  ├── deposit_status permanece en 'paid' → la seña queda para el complejo ('captured')
  │     └── Actualizar deposit_status → 'captured'
  ├── NO se hace reembolso en MP
  ├── Liberar el slot
  └── Output: confirmación de cancelación sin reembolso
```

#### Diferencias en efectos secundarios

| Evento | Efecto |
|---|---|
| Booking cancelado sin reembolso | 📩 Email al jugador: "Tu turno del {fecha} {hora} fue cancelado. La seña queda para el complejo según la política de cancelación." |
| Seña capturada | 💰 CashFlow: income, category='booking', description='Seña capturada por cancelación tardía' (NO es expense: la plata ya estaba, solo cambia el motivo) |

---

### Variante 4C: Admin Cancela (Con o Sin Cargo)

**"El complejo cancela — él decide si devuelve o no"**

#### Punto de entrada
- **URL**: Panel admin → Grilla → Click en reserva → "Cancelar reserva"
- **Trigger**: Problema en la cancha (mantenimiento), error del admin, pedido del jugador

#### Precondiciones
- StaffUser tiene rol `admin`
- Booking en status `confirmed`

#### Happy Path

```
PASO 1 — Modal de cancelación admin
  ├── Opciones:
  │     ├── "Cancelar CON reembolso de seña" (el complejo asume el costo)
  │     └── "Cancelar SIN reembolso" (excepcional, requiere motivo obligatorio)
  ├── Input obligatorio: motivo de cancelación
  └── Botón: "Confirmar cancelación"

PASO 2 — Procesamiento
  ├── SI cancelar con reembolso:
  │     ├── Idéntico a variante 4A (refund en MP, CashFlow, etc.)
  │     ├── status → 'canceled_refunded'
  │     └── canceled_by = 'admin'
  ├── SI cancelar sin reembolso:
  │     ├── Idéntico a variante 4B
  │     ├── status → 'canceled_no_refund'
  │     └── canceled_by = 'admin'
  └── En ambos casos: slot liberado
```

#### Diferencias en efectos secundarios

| Evento | Efecto |
|---|---|
| Admin cancela con reembolso | 📩 Email al jugador: "El complejo {nombre} canceló tu turno del {fecha} {hora}. Tu seña fue devuelta. Disculpá las molestias." |
| Admin cancela sin reembolso | 📩 Email al jugador: "El complejo {nombre} canceló tu turno del {fecha} {hora}. Contactá al complejo para más información." |
| Cualquier cancelación admin | 📊 AuditLog: `booking.canceled_by_admin` con motivo + staff_user_id |

---

### Variante 4D: No-Show del Jugador

**"El jugador no se presentó — el sistema lo detecta o el admin lo marca"**

#### Punto de entrada
- **Trigger A**: El recepcionista marca "No vino" en la grilla cuando pasa el horario del turno
- **Trigger B**: El sistema auto-completa la reserva 30 minutos después de `time_end` si nadie la marcó

#### Precondiciones
- Booking en status `confirmed`
- `NOW() > booking.date + booking.time_end` (ya pasó el horario)

#### Happy Path

```
ESCENARIO A — El recepcionista marca "No vino" (antes de los 30 min post-turno)
  ├── Panel admin → Grilla → Reserva pasada → Botón "No se presentó"
  ├── Confirmación: "¿Confirmar que {jugador} no se presentó?"
  ├── Actualizar Booking: status → 'no_show'
  ├── Evaluar penalidad según tenant.settings.no_show_penalty:
  │     ├── type = 'ban_days' → crear/actualizar ban temporal para este jugador
  │     │     └── tenant_player_bans: ban_until = NOW() + penalty.days
  │     ├── type = 'deposit_capture' → la seña ya está capturada (no hay acción adicional)
  │     └── type = 'none' → sin penalidad
  └── Output: booking marcado como no_show

ESCENARIO B — Auto-completado por el sistema (30 min después de time_end)
  ├── Job programado: buscar bookings con status='confirmed' AND time_end < NOW() - 30min
  ├── Para cada uno: status → 'completed' (asume que sí vino)
  ├── Razón: el admin no lo marcó → asumimos que jugó (benefit of the doubt)
  └── NO se marca como no_show automáticamente (eso requiere acción humana)
```

#### Decisiones del negocio de la cancelación (todas las variantes)

| Condición | Resultado |
|---|---|
| `deposit_status = 'not_required'` y jugador cancela | Sin impacto financiero. Slot liberado. |
| `deposit_status = 'paid'` y cancela en plazo | Refund vía API de MP + CashFlow de expense |
| `deposit_status = 'paid'` y cancela fuera de plazo | Sin refund. `deposit_status → 'captured'` |
| Booking tiene `abonado_id` (turno fijo) | El admin decide: ¿el abonado pierde ese turno o se corre? (gestión manual) |
| El jugador acumula 3 no-shows en 30 días | Ban automático según `no_show_penalty` config del complejo |
| Booking tipo 'block' | NO aplica lógica de penalidad ni reembolso (no hay jugador ni seña) |

### Edge cases explícitos (todas las variantes)

1. **El reembolso de MP falla** (error de API, cuenta del jugador cerrada): El booking se cancela igual (status → `canceled_refunded`), pero se crea un Payment con status='pending'. Se reintenta el refund 3 veces con backoff. Si falla definitivamente → notificar al admin para gestión manual.
2. **El jugador cancela una reserva de turno fijo (abonado)**: La instancia individual se cancela. El abonado sigue activo — la próxima semana se genera normalmente.
3. **El admin cancela una reserva que está en `pending_payment`**: Se puede cancelar directamente (no hay seña que devolver). Status → `expired` (no `canceled`, porque nunca se confirmó).
4. **El jugador quiere cancelar pero no tiene la app** (no está registrado, reserva manual): No puede cancelar online. Tiene que llamar/escribir al complejo → el admin cancela (variante 4C).
5. **Se cae la luz en el complejo y nadie marca asistencia**: El sistema auto-completa todos los bookings como `completed` a los 30 minutos de terminado cada turno. El admin puede corregir después (cambiar a `no_show` desde el historial dentro de las 24hs).
6. **El jugador pagó seña y el complejo cierra inesperadamente**: El admin tiene que cancelar todas las reservas con reembolso (variante 4C masiva). No hay herramienta de cancelación masiva en v1 (edge case poco frecuente).
7. **Cancelación de una reserva que ya pasó**: NO se puede cancelar un booking en status `completed` o `no_show` (estados finales inmutables, ver Doc 6).

### Out of scope (todas las variantes)

- ❌ Cancelación masiva (cancelar todas las reservas de un día)
- ❌ Modificación de reserva (cambiar horario en vez de cancelar y re-crear)
- ❌ Reembolso parcial (ej: devolver 50% de la seña)
- ❌ Disputa de cancelación (el jugador reclama que sí vino)
- ❌ Cancelación automática por clima (lluvia, tormenta)
- ❌ Política de cancelación diferente por cancha (en v1 es a nivel complejo)
- ❌ Penalidad económica por no-show (cobrarle al jugador más allá de la seña)

---

# PARTE 2 — FEATURES AVANZADOS

---

## FLUJO 5: Alta de Abonado + Generación de Turnos Recurrentes

### Punto de entrada
- **URL**: Panel admin → Abonados → "+ Nuevo Abonado"
- **Trigger**: Un grupo de jugadores acuerda con el complejo un turno fijo semanal (ej: "todos los miércoles 21hs")
- **Contexto real**: Esto se arregla por teléfono, mensaje o en persona. El admin lo carga en el sistema después.

### Precondiciones
- StaffUser tiene rol `admin`
- El Tenant tiene status `trialing` o `active`
- La cancha tiene status `online`
- El día + horario elegido está libre de forma recurrente (no hay otro abonado activo con overlap en esa cancha + día + hora)

### Happy Path

```
PASO 1 — Datos del abonado
  ├── Input obligatorio:
  │     ├── Cancha (selector)
  │     ├── Día de la semana (Lunes a Domingo)
  │     ├── Hora inicio + hora fin
  │     ├── Contacto: nombre + celular del responsable del grupo
  │     └── Método de pago: 'cash' | 'transfer' (cobro 100% manual)
  ├── Input opcional:
  │     ├── Jugador registrado (buscar por nombre/celular → vincular Player)
  │     ├── Fecha de inicio (default: próximo día que coincida)
  │     ├── Fecha de fin (default: null = indefinido)
  │     └── Notas internas
  └── Output: formulario completo

PASO 2 — Definir precio del abonado
  ├── Precio por sesión:
  │     ├── Pre-cargado: precio de hora de la cancha según court.pricing en ese horario
  │     ├── El admin puede editarlo (override): precio especial para abonados
  │     └── Ejemplo: cancha vale $12.000 de noche, pero al abonado se le cobra $10.000
  ├── Precio mensual (editable por el admin):
  │     ├── Pre-llenado: price_per_session × 4.33 (promedio de sesiones/mes)
  │     ├── El admin puede editarlo: redondeo, descuento por fidelidad, etc.
  │     ├── Ejemplo: calculado = $43.300, el admin pone $40.000 como precio pack
  │     └── Se almacena como `monthly_price` en el Abonado (atributo propio, no derivado)
  └── Output: precio definido

PASO 3 — Verificación de disponibilidad recurrente
  ├── El sistema verifica las próximas 8 semanas desde starts_on:
  │     ├── Para cada fecha: ¿el slot está libre en esa cancha?
  │     ├── Si TODAS libres → ✅ "Sin conflictos"
  │     ├── Si ALGUNAS ocupadas → ⚠️ "Conflictos en: {fechas}"
  │     │     ├── Mostrar detalle: "Miércoles 23/04: Cancha 3 ocupada por {jugador}"
  │     │     └── El admin decide: "Crear igual (esas semanas no se generan)" 
  │     │         o "Cancelar y buscar otro horario"
  │     └── Si el slot tiene otro ABONADO activo → ❌ "Ya hay un abonado en este horario"
  │           └── No se puede crear (excepción: el admin cancela el otro abonado primero)
  └── Output: verificación pasada

PASO 4 — Confirmación y generación de instancias
  ├── Crear Abonado con status='active'
  ├── Generar Bookings para las próximas 8 semanas:
  │     ├── Cada Booking:
  │     │     ├── type = 'fixed'
  │     │     ├── status = 'confirmed' (sin seña — el abono implica compromiso)
  │     │     ├── abonado_id = abonado.id
  │     │     ├── price_snapshot = abonado.price_per_session
  │     │     ├── deposit_status = 'not_required'
  │     │     └── player_id = abonado.player_id (si está vinculado)
  │     ├── SALTAR fechas que:
  │     │     ├── Están en tenant.closed_dates (feriados)
  │     │     ├── Tienen conflicto con reserva existente (del paso 3)
  │     │     └── Son anteriores a starts_on
  │     └── Log de cada instancia generada
  └── Output: abonado creado + N bookings generados → tabla de abonados actualizada
```

### Decisiones del negocio (if/else)

| Condición | Resultado |
|---|---|
| Conflicto parcial (algunas semanas) | Warning + admin decide si crear saltando esas semanas |
| Conflicto por otro abonado | Error: no se puede crear. El admin debe resolver primero. |
| Fecha de fin definida | Solo genera instancias hasta esa fecha |
| Fecha de fin = null (indefinido) | Genera 8 semanas. Job diario agrega más (ver "generación rolling") |
| Feriado en una de las semanas | No se genera booking para ese día. El admin puede agregar manualmente si quiere. |
| Precio del abonado < precio de lista | Permitido. Es precio acordado privadamente. Se guarda en `price_per_session`. |
| Precio del abonado = $0 | Permitido (amigo del dueño, cortesía). |

### Generación Rolling de Instancias (Job Automático)

```
Job diario (cron: 03:00 ART):
  ├── Para cada Abonado con status='active':
  │     ├── Contar cuántas instancias (Bookings) futuras tiene
  │     ├── Si tiene MENOS de 4 semanas futuras:
  │     │     ├── Generar instancias para 4 semanas adicionales
  │     │     ├── Respetar closed_dates y conflictos
  │     │     └── Log: "Generadas {N} instancias para abonado {id}"
  │     └── Si tiene 4+ semanas futuras: no hacer nada
  └── Si abonado.ends_on existe AND ends_on < fecha de generación: no generar más
```

> [!NOTE]
> **¿Por qué no generar para todo el año?** Porque si el abonado se cancela, hay que eliminar
> centenares de bookings. Con el modelo rolling (8 semanas iniciales + 4 cada vez que quedan <4),
> nunca hay más de ~12 instancias futuras por abonado. Si se cancela, se borran máximo 12.

> [!IMPORTANT]
> **Cobro de abonados**: En v1, el cobro de abonados es 100% manual (efectivo o transferencia),
> igual que en ATC Sports. No existe cobro automático vía MercadoPago para abonados.
> El admin registra el pago cuando lo recibe, como un movimiento de caja.

### Estados intermedios

| Estado | Qué ve el admin | Duración |
|---|---|---|
| Verificando disponibilidad | Spinner: "Verificando disponibilidad de las próximas 8 semanas..." | 1-3 segundos |
| Generando instancias | Barra de progreso: "Creando turnos: 5 de 8..." | 2-5 segundos |

### Puntos de salida

- **Éxito**: Abonado creado con status `active`. N bookings generados en la grilla. Todo visible.
- **Conflicto total**: No se crea nada. El admin tiene que buscar otro horario.
- **Abandono**: El admin cierra el formulario. No se crea nada.

### Efectos secundarios

| Evento | Efecto |
|---|---|
| Abonado creado | 📩 Email al contacto: "Tu turno fijo está confirmado: {cancha} todos los {día} a las {hora}. ¡Nos vemos!" |
| Abonado creado | 📊 AuditLog: `abonado.created` con detalle completo |
| Cada Booking generado | 📊 AuditLog: `booking.created` con actor=system, abonado_id |
| Instancias rolling generadas | 📊 AuditLog: `abonado.instances_generated` con cantidad |

### Edge cases explícitos

1. **El abonado quiere cambiar de horario**: Se cancela el abonado actual (con fecha) y se crea uno nuevo. No hay "edición" del horario.
2. **El abonado quiere cambiar de cancha**: Idem: cancelar y crear nuevo.
3. **El abonado está de vacaciones 2 semanas**: El admin pausa el abonado (status → `paused`). Las instancias futuras se eliminan. Cuando vuelve, reactiva y se regeneran.
4. **Un feriado cae en el día del abonado**: No se genera instancia para ese día. El admin puede agregarlo manualmente a otro día si quiere.
5. **Se crea un abonado y después se crea una reserva individual en un slot del abonado**: ERROR — el slot ya está ocupado por la instancia del abonado. La reserva individual no se puede crear.
6. **El responsable del abonado no tiene celular registrado**: Se guarda `contact_phone` en el abonado. No necesita ser un Player registrado.
7. **El abonado quiere pagar el mes por adelantado en efectivo**: El admin registra el pago manualmente en CashFlow. No hay relación directa con el Abonado (el pago es a nivel de movimiento de caja, no vinculado a cada instancia).

### Out of scope

- ❌ Edición de horario/cancha de un abonado existente (cancelar y re-crear)
- ❌ Múltiples horarios para un mismo abonado (ej: miércoles Y viernes) — crear 2 abonados separados
- ❌ Descuento por pago anual del abonado
- ❌ Portal del jugador para ver/gestionar su abono
- ❌ Swap de turno entre abonados (coordinación manual entre el admin y los grupos)
- ❌ Registro automático de asistencia del abonado (se usa el flujo normal de completar/no-show)
- ❌ Cobro automático de abonados vía MercadoPago (v1 es 100% manual)

---

# PARTE 3 — SAAS & FINANZAS

---

## FLUJO 6: Cierre de Caja Diario

### Punto de entrada
- **URL**: Panel admin → Caja → "Cerrar caja del día"
- **Trigger**: El admin o recepcionista termina su turno y quiere cuadrar los movimientos del día
- **Contexto real**: Generalmente se hace entre las 23:00 y 00:00, cuando el complejo cierra. Algunos complejos lo hacen al día siguiente por la mañana.

### Precondiciones
- StaffUser tiene rol `admin`
- El día seleccionado tiene al menos 1 movimiento de caja (CashFlow)
- No existe ya un cierre de caja para ese día (evitar duplicados)

### Happy Path

```
PASO 1 — Vista de caja del día
  ├── Panel admin → Caja → seleccionar fecha (default: hoy)
  ├── Vista resumen:
  │     ├── INGRESOS:
  │     │     ├── Reservas (efectivo): $XX.XXX
  │     │     ├── Reservas (transferencia): $XX.XXX
  │     │     ├── Reservas (MercadoPago): $XX.XXX
  │     │     ├── Venta de productos (cantina): $XX.XXX
  │     │     └── Otros ingresos: $XX.XXX
  │     ├── EGRESOS:
  │     │     ├── Reembolsos de señas: $XX.XXX
  │     │     └── Otros egresos: $XX.XXX
  │     ├── BALANCE DEL DÍA: $XX.XXX (ingresos - egresos)
  │     └── DESGLOSE POR MÉTODO DE PAGO:
  │           ├── Efectivo en caja: $XX.XXX
  │           ├── Transferencias: $XX.XXX
  │           └── MercadoPago: $XX.XXX
  └── Output: resumen visible

PASO 2 — Registrar movimientos manuales (si faltan)
  ├── Botón: "+ Agregar movimiento"
  ├── Modal:
  │     ├── Tipo: ingreso | egreso
  │     ├── Categoría: booking | product_sale | other
  │     ├── Monto
  │     ├── Método: cash | transfer | mercadopago
  │     ├── Descripción (obligatoria)
  │     └── Hora del movimiento (default: ahora)
  ├── Crear CashFlow con los datos ingresados
  ├── El resumen se actualiza al instante
  └── Output: movimiento agregado

PASO 3 — Verificación y cierre
  ├── El admin revisa el resumen y verifica que cuadre con el efectivo real en caja
  ├── Campo opcional: "Efectivo contable real" (lo que hay físicamente en la caja)
  │     ├── Si difiere del calculado → warning: "Diferencia de ${diff}. ¿Querés agregar una nota?"
  │     └── Input opcional: nota explicativa de la diferencia
  ├── Botón: "Cerrar caja del día"
  ├── Confirmación: "¿Confirmar cierre de caja del {fecha}? No se podrá modificar después."
  └── Output: caja cerrada

PASO 4 — Generación del cierre
  ├── Crear registro de cierre de caja:
  │     ├── Fecha del cierre
  │     ├── Total ingresos / total egresos / balance
  │     ├── Desglose por categoría y método de pago
  │     ├── Efectivo contable declarado (si lo ingresó)
  │     ├── Diferencia (si existe)
  │     ├── Nota explicativa (si existe)
  │     └── Cerrado por: staff_user.id
  ├── Los CashFlows del día quedan "congelados" (no editables)
  └── Output: cierre registrado
```

### Decisiones del negocio (if/else)

| Condición | Resultado |
|---|---|
| Hay reservas completadas sin movimiento de caja | Warning: "Hay {N} reservas completadas sin pago registrado. ¿El pago fue en efectivo?" → opción de crear CashFlows rápido |
| El efectivo real no cuadra con el calculado | Warning + nota obligatoria. No bloquea el cierre. |
| Ya existe un cierre para ese día | Error: "La caja del {fecha} ya fue cerrada por {staff}." |
| El admin quiere cerrar la caja de ayer | Permitido. Se puede cerrar cualquier día pasado que no tenga cierre. |
| Hay movimientos de MP sin confirmar (webhooks pendientes) | Warning: "Hay {N} pagos de MP pendientes de confirmación. Pueden llegar después del cierre." |

### Estados intermedios

| Estado | Qué ve el admin | Duración |
|---|---|---|
| Caja abierta | Vista de resumen con botón "Cerrar caja" | Hasta que el admin decida cerrar |
| Revisando diferencia de efectivo | Modal con nota explicativa | Hasta confirmación |

### Puntos de salida

- **Éxito**: Cierre de caja registrado. CashFlows congelados. Registro inmutable.
- **Abandono**: No se cierra la caja. El admin la puede cerrar después. Los CashFlows siguen editables.
- **Error**: Caja ya cerrada para ese día.

### Efectos secundarios

| Evento | Efecto |
|---|---|
| Caja cerrada | 📊 AuditLog: `cashflow.daily_close` con resumen completo |
| Caja cerrada | 📩 Email al admin/dueño: "Cierre de caja {fecha}: Balance ${balance}" |
| Diferencia de efectivo detectada | 📊 AuditLog: `cashflow.discrepancy` con monto y nota |
| CashFlows congelados | 🔒 Los movimientos del día ya no son editables (solo el admin puede deshacer el cierre) |

### Edge cases explícitos

1. **El complejo no cierra caja un día**: No pasa nada. La caja queda abierta. Los movimientos siguen acumulándose. El admin puede cerrar retroactivamente.
2. **Llega un webhook de MP a las 2am para un pago del día anterior**: El CashFlow se registra con `occurred_at` del día actual. Si la caja del día anterior ya se cerró, el movimiento queda en el día siguiente.
3. **El admin quiere reabrir una caja cerrada**: Solo el admin puede "reabrir" una caja (no el recepcionista). Se crea un AuditLog especial: `cashflow.reopen`.
4. **Dos recepcionistas intentan cerrar la caja al mismo tiempo**: El primero que confirma gana. El segundo ve "Esta caja ya fue cerrada."
5. **El complejo tiene turnos tarde (cierra a las 2am)**: El cierre de caja se hace por "día operativo" (configurable), no necesariamente por día calendario. En v1, es por día calendario.

### Out of scope

- ❌ Facturación electrónica (AFIP / factura C)
- ❌ Integración con sistema contable externo
- ❌ Cierre de caja por turno de personal (mañana / tarde / noche)
- ❌ Impresión de ticket de cierre de caja
- ❌ Rendición de cuentas entre socios del complejo
- ❌ Reportes mensuales/anuales (eso es otra sección del panel, no este flujo)
- ❌ Gestión de gastos operativos (sueldos, servicios, mantenimiento)

---

## FLUJO 7: Conversión de Trial a Suscripción Paga

### Punto de entrada
- **Trigger A**: El dueño del complejo hace click en "Suscribirme" desde el banner de trial en el dashboard
- **Trigger B**: El dueño recibe la notificación de día 28 (email) y decide suscribirse
- **Trigger C**: El trial venció (día 31) y el dueño accede a la pantalla de "Tu prueba terminó"
- **URL**: Panel admin → Settings → Suscripción → "Elegir plan"

### Precondiciones
- Tenant con status `trialing` o `churned` (re-activación)
- TenantSubscription con status `trialing` o (para re-activación) `churned`
- El dueño tiene rol `admin` en este Tenant

### Happy Path

```
PASO 1 — Selección de plan
  ├── Vista: tabla comparativa de planes
  │     ├── Plan Predio (1-3 canchas): $47.000/mes | $37.600/mes pago anual
  │     ├── Plan Complejo (4-6 canchas): $74.000/mes | $59.200/mes pago anual
  │     └── Plan Estadio (7+ canchas): $101.000/mes | $80.800/mes pago anual
  ├── Pre-seleccionado: el plan que corresponde según la cantidad de canchas activas del complejo
  ├── Selector: ciclo de facturación (mensual | anual)
  │     └── Si anual: mostrar ahorro: "Ahorrás ${diferencia}/año (20% descuento)"
  └── Botón: "Continuar al pago"

PASO 2 — Pago inicial
  ├── Crear suscripción en MercadoPago:
  │     ├── plan_id → mapear al plan de MP correspondiente
  │     ├── billing_cycle = 'monthly' o 'annual'
  │     └── auto_recurring con el monto del plan
  ├── Redirect a MercadoPago (misma experiencia que Checkout Pro)
  ├── El dueño registra su medio de pago (tarjeta, CBU, etc.)
  ├── MP procesa el primer cobro
  └── Output: pago procesado → redirect back a TurnoGol

PASO 3 — Confirmación por webhook
  ├── MP envía webhook de suscripción creada/aprobada
  ├── Verificar autenticidad e idempotencia
  ├── Actualizar TenantSubscription:
  │     ├── status → 'active'
  │     ├── plan_id = plan seleccionado
  │     ├── billing_cycle = seleccionado
  │     ├── mp_subscription_id = id de la suscripción en MP
  │     ├── current_period_start = NOW()
  │     ├── current_period_end = NOW() + 30 días (o 365 si anual)
  │     └── Si anual: price_locked_until = NOW() + 365 días
  ├── Actualizar Tenant: status → 'active'
  └── Output: suscripción activa

PASO 4 — Bienvenida post-conversión
  ├── Dashboard: el banner de trial desaparece
  ├── Badge: "Plan {nombre} activo"
  └── Desactivar las notificaciones de trial (día 21, 28, etc.)
```

### Decisiones del negocio (if/else)

| Condición | Resultado |
|---|---|
| El complejo tiene más canchas que las del plan elegido | Warning: "Tu complejo tiene {N} canchas pero el plan soporta {M}. Mover al plan superior?" Si insiste en el plan inferior → las canchas extra se desactivan (status → `inactive`) |
| Pago anual | Primer cobro = precio_anual completo. `price_locked_until` se setea. No puede haber aumento de precio durante el año. Descuento del 33% sobre el precio mensual. |
| Pago mensual | Cobro automático cada 30 días vía MP Suscripciones. |
| El trial ya venció (día 31+) | El complejo está en modo "bloqueado" (solo lectura). Al suscribirse, se desbloquea todo. Los datos se conservaron. |
| Re-activación (churned, dentro de 90 días) | Al pagar, se restaura el acceso. Datos intactos. |
| Re-activación (churned, después de 90 días) | Datos eliminados. Empieza como complejo nuevo. |
| El pago de MP falla | Suscripción NO se activa. Mostrar error. Sugerir otro medio de pago. |
| El dueño quiere probar un plan antes de pagar | Ya tuvo 30 días de trial con acceso completo. No hay trial extendido. |

### Cronograma de notificaciones pre-conversión (referencia)

```
Trial activo (30 días):
  ├── Día 1:  📩 Email de bienvenida + checklist
  ├── Día 7:  📩 Email: "¿Necesitás ayuda configurando tu complejo?"
  ├── Día 14: 📩 Email: "Vas por la mitad de tu prueba. ¿Ya recibiste tu primera reserva?"
  ├── Día 21: 📩 Email: "Quedan 9 días de tu prueba gratuita"
  ├── Día 28: 📞 Llamada humana (high-touch, no automatizado)
  ├── Día 30: 📩 Email urgente: "Último día de tu prueba. Suscribite para no perder acceso."
  └── Día 31: 🔒 Acceso bloqueado + 📩 Email: "Tu prueba terminó. Tus datos están guardados 60 días."
```

### Estados intermedios

| Estado | Qué ve el admin | Duración |
|---|---|---|
| Eligiendo plan | Tabla de planes con pre-selección | Hasta confirmación |
| Checkout de MP abierto | Pantalla de MP para registrar medio de pago | Hasta que pague |
| Procesando suscripción | "Activando tu suscripción..." | ~5-30 segundos (webhook) |
| Trial vencido | "Tu prueba gratuita terminó. Suscribite para seguir usando TurnoGol." + solo lectura | Hasta 60 días (BLOCKED) |

### Puntos de salida

- **Éxito**: Tenant `active`. TenantSubscription `active`. Acceso completo.
- **Pago rechazado**: Subscription no se activa. Dueño puede reintentar.
- **Abandono**: Si está en trial → sigue en trial. Si trial venció → sigue bloqueado.
- **No convierte nunca**: Día 31 → BLOCKED (solo lectura, 60 días). Día 91 → CHURNED. Día 98 → DELETED.

### Efectos secundarios

| Evento | Efecto |
|---|---|
| Suscripción activada | 📩 Email al dueño: "¡Tu suscripción a TurnoGol está activa! Plan: {nombre}." |
| Suscripción activada | 📩 Email con factura/recibo del primer pago |
| Suscripción activada | 📊 AuditLog: `tenant_subscription.activated` con plan + ciclo + amount |
| Trial convertido | 📊 Métrica interna: trial_conversion (para analytics del negocio TurnoGol) |
| Notificaciones de trial desactivadas | ⏰ Cancelar cron jobs de notificaciones de trial pendientes |

### Edge cases explícitos

1. **El dueño se suscribe el día 15 del trial**: OK. Los 15 días restantes del trial no se "pierden" — el primer período de suscripción empieza HOY (no al día 31).
2. **El dueño tiene 2 complejos en la misma cuenta**: Cada complejo tiene su propia suscripción. Los planes son por complejo, no por cuenta.
3. **El dueño elige plan Predio pero quiere agregar más canchas después**: Al agregar la 4ta cancha, el sistema sugiere upgrade. Si no upgradea, no puede crear la cancha.
4. **El pago anual se procesa pero el webhook tarda**: El complejo puede quedar bloqueado unos minutos. Mostrar pantalla de "Estamos verificando tu pago" + check automático cada 10 segundos.
5. **El dueño quiere pagar en cuotas en tarjeta**: Depende de lo que ofrezca MP. TurnoGol no controla las cuotas — MP lo hace en la pantalla de checkout.
6. **Hay un aumento de precios durante un plan anual**: No afecta al suscriptor actual (`price_locked_until`). El nuevo precio aplica al renovar.

### Out of scope

- ❌ Trial extendido (más de 30 días)
- ❌ Cupones de descuento o códigos promocionales
- ❌ Plan gratuito permanente (freemium)
- ❌ Pago por transferencia bancaria directa (solo MP en v1)
- ❌ Factura fiscal con CUIT del dueño (v2)
- ❌ Upgrades con prorrateo automático dentro del período (v2)

---

## FLUJO 8: Cobro Fallido de Suscripción (Dunning Flow)

### Punto de entrada
- **Trigger**: Webhook de MercadoPago notifica que el cobro recurrente de la suscripción del Tenant falló
- **Contexto**: El medio de pago del dueño fue rechazado (tarjeta vencida, sin fondos, límite excedido, cuenta cerrada)

### Precondiciones
- TenantSubscription con status `active`
- MP reporta payment.status = 'rejected' para el cobro recurrente

### Happy Path (del Dunning — que, irónicamente, es un "unhappy" path del negocio)

```
DÍA 0 — Primer cobro falla
  ├── MP webhook: payment.rejected para la suscripción del Tenant
  ├── Actualizar TenantSubscription: status → 'past_due'
  ├── Crear Payment con:
  │     ├── type = 'full_payment' (intento de cobro de suscripción)
  │     ├── status = 'rejected'
  │     ├── mp_payment_id = id del intento fallido
  │     └── description = 'Cobro de suscripción rechazado — intento 1'
  ├── ACCESO: completo (período de gracia de 7 días)
  ├── 📩 Email al dueño: "No pudimos procesar tu pago de TurnoGol (${amount}). 
  │    Verificá tu medio de pago. Reintentamos en 2 días."
  └── Programar segundo intento para día 2

DÍA 2 — Segundo intento
  ├── MP reintenta automáticamente (o TurnoGol triggerea un cobro manual via API)
  ├── Si APROBADO:
  │     ├── TenantSubscription: status → 'active'
  │     ├── 📩 Email: "Tu pago fue procesado exitosamente. ¡Seguí usando TurnoGol sin interrupciones!"
  │     └── FIN del dunning ✅
  ├── Si RECHAZADO:
  │     ├── 📩 Email: "Segundo intento de cobro fallido. Actualizá tu medio de pago para no perder acceso."
  │     ├── Banner en el dashboard: "⚠️ Tu suscripción tiene un pago pendiente. Actualizá tu medio de pago."
  │     └── Programar tercer intento para día 5

DÍA 5 — Tercer intento + llamada humana
  ├── Tercer y último intento automático
  ├── PARALELAMENTE: llamada humana del equipo de TurnoGol al dueño (high-touch)
  │     └── Objetivo: entender el problema real (¿es económico? ¿cambió de tarjeta? ¿ya no quiere el servicio?)
  ├── Si APROBADO → status → 'active'. FIN ✅
  ├── Si RECHAZADO:
  │     ├── 📩 Email: "Último intento de cobro fallido. Tu acceso será limitado en 2 días."
  │     └── Programar suspensión para día 7

DÍA 7 — SUSPENDED (admin solo lectura, jugadores siguen)
  ├── TenantSubscription: status → 'suspended'
  ├── Tenant: acceso del admin limitado a SOLO LECTURA:
  │     ├── Puede ver la grilla y las reservas
  │     ├── NO puede crear reservas nuevas
  │     ├── NO puede registrar pagos
  │     ├── NO puede agregar canchas/staff
  │     └── Las reservas ya confirmadas se mantienen (no se cancelan)
  ├── Jugadores: siguen con acceso normal
  │     ├── Pueden ver sus reservas confirmadas
  │     ├── Reciben recordatorios por email normalmente
  │     └── NO se generan nuevas instancias de abonados
  ├── 📩 Email al dueño: "Tu acceso a TurnoGol fue limitado por falta de pago. 
  │    Regularizá tu situación para recuperar el acceso completo."
  ├── Banner en dashboard: "🔴 Acceso limitado. Regularizá tu pago para seguir operando."
  └── Programar escalamiento día 14

DÍA 14 — BLOCKED (sin acceso)
  ├── TenantSubscription: status → 'blocked'
  ├── Tenant status: acceso totalmente bloqueado
  │     └── Solo puede ver: pantalla de "Tu cuenta está suspendida. Pagá para reactivar."
  ├── Las reservas futuras se mantienen en DB pero el complejo no puede gestionarlas
  ├── La página pública del complejo muestra: "Este complejo no está disponible temporalmente."
  ├── 📩 Email final: "Tu cuenta de TurnoGol fue bloqueada. Tus datos se conservan por 76 días más."
  └── Programar churn para día 90

DÍA 90 — CHURNED
  ├── TenantSubscription: status → 'churned'
  ├── Tenant: status → 'churned'
  ├── 📩 Email: "Tus datos en TurnoGol serán eliminados en 7 días." 
  │    (última oportunidad de reactivar)
  └── Programar eliminación para día 97

DÍA 97 — DELETED
  ├── Eliminación efectiva de datos (hard delete o anonimización según Ley 25.326)
  ├── 📊 AuditLog: `tenant.data_deleted` (el último registro)
  └── Fin del ciclo de vida del Tenant
```

### Decisiones del negocio (if/else)

| Condición | Resultado |
|---|---|
| Cobro falla 1 vez | `past_due`. Acceso completo. Reintentos automáticos. |
| 7 días sin pago | `suspended`. Admin solo lectura. Jugadores siguen viendo reservas y recibiendo recordatorios. |
| 14 días sin pago | `blocked`. Sin acceso para nadie. |
| 90 días sin pago | `churned`. Datos archivados → eliminados a los 97 días. |
| El dueño paga en cualquier momento del dunning | Status → `active` inmediatamente. Acceso restaurado. |
| El dueño actualiza medio de pago y reintenta | MP cobra con el nuevo medio → si aprobado → `active` |
| El dueño tiene plan anual y falla el cobro de renovación | Mismo flujo de dunning. El plan anual no da gracia extra. |
| Hay reservas confirmadas durante la suspensión | Se mantienen. Los jugadores NO son penalizados por el estado del complejo. |
| Jugador intenta reservar en un complejo suspended/blocked | Error: "Este complejo no está disponible temporalmente." |

### Estados intermedios (resumen visual)

```
DÍA 0         DÍA 2         DÍA 5         DÍA 7           DÍA 14        DÍA 90        DÍA 97
  │              │              │              │                │              │              │
  ▼              ▼              ▼              ▼                ▼              ▼              ▼
PAST_DUE ── retry 2 ──── retry 3 ──── SUSPENDED ──────── BLOCKED ──── CHURNED ──── DELETED
(acceso OK)  (acceso OK)   (+ llamada)   (admin r/o,       (sin acceso)   (pre-delete)   (datos borrados)
                                          jugadores OK)
```

### Puntos de salida

- **Recuperación**: El dueño paga en cualquier momento → status `active`. Acceso restaurado. Todos los datos intactos.
- **Cancelación voluntaria durante el dunning**: El dueño puede cancelar la suscripción en vez de pagar. Se aplica el Flujo 9.
- **Churn**: 90 días sin pago → datos eliminados en el día 97. Irrecuperable.

### Efectos secundarios

| Evento | Efecto |
|---|---|
| Cada intento de cobro fallido | 📩 Email al dueño |
| Cada intento de cobro fallido | 📊 AuditLog: `tenant_subscription.payment_failed` con intento Nro |
| Suspensión (día 7) | 📊 AuditLog: `tenant.suspended` |
| Suspensión (día 7) | 🌐 Página pública sigue activa (jugadores siguen) |
| Bloqueo (día 14) | 🌐 Página pública del complejo: "No disponible temporalmente" |
| Recuperación (pago exitoso) | 📊 AuditLog: `tenant_subscription.recovered` |
| Recuperación | 📩 Email: "¡Tu cuenta está de vuelta! Acceso completo restaurado." |
| Churn (día 90) | 📊 AuditLog: `tenant.churned` |
| Pre-eliminación (día 90) | 📩 Email: "Última oportunidad: tus datos se borran en 7 días" |

### Edge cases explícitos

1. **El dueño cambia de tarjeta pero no notifica a TurnoGol**: Tiene que actualizar el medio de pago en MP. TurnoGol no gestiona medios de pago directamente.
2. **El dueño paga la deuda el día 89** (justo antes del churn): Se reactiva todo. Los datos se mantienen. Status → `active`.
3. **Durante la suspensión (día 7-14), los abonados del complejo**: NO se generan nuevas instancias rolling. Las instancias ya existentes se mantienen.
4. **Un jugador tiene reserva y el complejo se suspende (día 7)**: La reserva se mantiene. El jugador puede ver su reserva y recibe recordatorios normalmente.
5. **Un jugador tiene reserva y el complejo se bloquea (día 14)**: La reserva se mantiene en DB pero el jugador ve "complejo no disponible". Si quiere cancelar → no puede hacerlo online.
6. **El dueño tiene dos complejos y solo uno está en dunning**: Son independientes. Solo el complejo con deuda se suspende.
7. **Falla el webhook de MP y el pago se acreditó pero TurnoGol no se enteró**: MP reintenta webhooks. Si después de 24hs sigue sin llegar → polling manual de la API de MP para verificar estado.

### Out of scope

- ❌ Negociación de deuda o plan de pagos
- ❌ Descuento por volver después de haber churneado
- ❌ Extensión del período de gracia caso por caso
- ❌ Migración de datos a otro sistema antes del churn
- ❌ Exportación automática de datos antes de la eliminación

---

## FLUJO 9: Cancelación de Cuenta por el Dueño

### Punto de entrada
- **URL**: Panel admin → Settings → Suscripción → "Cancelar suscripción"
- **Trigger**: El dueño del complejo decide dejar de usar TurnoGol voluntariamente
- **Contexto real**: Puede ser por: costo, migración a otro sistema, cierre del complejo, insatisfacción

### Precondiciones
- Tenant con status `trialing` o `active`
- StaffUser con rol `admin` (solo el admin puede cancelar, no otro admin sin PIN)
- TenantSubscription con status `trialing` o `active`

### Happy Path

```
PASO 1 — Inicio de cancelación
  ├── Panel admin → Settings → Suscripción → "Cancelar suscripción"
  ├── Vista de retención (obligatoria antes de confirmar):
  │     ├── "¿Estás seguro? Tu complejo {nombre} tiene:"
  │     │     ├── {N} reservas futuras confirmadas
  │     │     └── {N} abonados activos
  │     ├── Pregunta: "¿Por qué querés cancelar?" (selector obligatorio):
  │     │     ├── "Muy caro"
  │     │     ├── "No lo uso lo suficiente"
  │     │     ├── "Cambio a otro sistema"
  │     │     ├── "Cierro el complejo"
  │     │     └── "Otro" (texto libre)
  │     └── Según la respuesta:
  │           ├── "Muy caro" → oferta: "¿Querés bajar a un plan más económico?"
  │           ├── "No lo uso" → oferta: "¿Querés una pausa de 1 mes gratis?"
  │           └── Cualquier otra → continuar al paso 2
  └── Output: motivo registrado

PASO 2 — Consecuencias y confirmación
  ├── Vista de consecuencias claras:
  │     ├── "Tu acceso sigue activo hasta el {fecha_fin_período}."
  │     ├── "Las reservas ya confirmadas se mantienen hasta esa fecha."
  │     ├── "Los abonados serán notificados y cancelados al final del período."
  │     ├── "Tus datos se conservan 60 días después de la cancelación."
  │     ├── "Podés reactivar tu cuenta en cualquier momento durante esos 60 días."
  │     └── "Después de 60 días, todos los datos se eliminan en 7 días."
  ├── Checkbox obligatorio: "Entiendo que mis datos se eliminarán después de 60 días"
  ├── Input: escribir el nombre del complejo para confirmar (friction deliberada)
  └── Botón: "Confirmar cancelación"

PASO 3 — Procesamiento de la cancelación
  ├── Cancelar suscripción en MercadoPago:
  │     ├── API de MP: cancelar la suscripción recurrente
  │     └── No se cobra más desde el próximo ciclo
  ├── Actualizar TenantSubscription:
  │     ├── status → 'canceled'
  │     ├── canceled_at = NOW()
  │     ├── cancellation_reason = motivo seleccionado
  │     └── current_period_end = fecha de fin del período ya pago (acceso hasta ese día)
  ├── Actualizar Tenant: status → 'canceled'
  ├── Programar:
  │     ├── Fecha de fin de acceso = current_period_end
  │     ├── Fecha de bloqueo = current_period_end → BLOCKED (solo lectura, 60 días)
  │     ├── Fecha de eliminación = current_period_end + 60 días + 7 días
  │     └── scheduled_deletion_at = fecha de eliminación
  └── Output: cancelación procesada

PASO 4 — Período de gracia (hasta fin del período pago)
  ├── El complejo sigue funcionando completamente hasta current_period_end
  ├── Banner en dashboard: "Tu suscripción se cancela el {fecha}. ¿Querés reactivar?"
  ├── Botón "Reactivar suscripción" visible permanentemente
  └── Al llegar current_period_end → ver paso 5

PASO 5 — Expiración del período pago → BLOCKED
  ├── current_period_end llegó
  ├── Acceso bloqueado (solo lectura)
  ├── Cancelar todos los Abonados activos:
  │     ├── status → 'canceled'
  │     ├── Eliminar instancias futuras
  │     └── 📩 Email a contactos de abonados: "El complejo {nombre} cerró su cuenta. 
  │          Tu turno fijo del {día} {hora} fue cancelado."
  ├── Las reservas ya pasadas (históricas) se mantienen en DB
  ├── Página pública del complejo: "Este complejo ya no está en TurnoGol."
  └── Iniciar cuenta regresiva de 60 días

PASO 6 — Retención en 60 días + eliminación
  ├── Día 30 post-expiración: 📩 Email: "Tus datos se eliminan en 30 días. Reactivá tu cuenta."
  ├── Día 55 post-expiración: 📩 Email urgente: "Quedan 5 días para que tus datos se bloqueen."
  ├── Día 60: CHURNED
  │     ├── TenantSubscription: status → 'churned'
  │     ├── Tenant: status → 'churned'
  │     └── 📩 Email: "Última oportunidad: tus datos se borran en 7 días."
  ├── Día 67: DELETED
  │     ├── Anonimización/eliminación de datos según Ley 25.326
  │     ├── 📊 AuditLog: `tenant.data_deleted`
  │     └── Fin del ciclo de vida del Tenant
```

### Decisiones del negocio (if/else)

| Condición | Resultado |
|---|---|
| Motivo = "Muy caro" | Oferta de downgrade. Si rechaza → continúa cancelación. |
| Motivo = "No lo uso" | Oferta de pausa de 1 mes. Si rechaza → continúa. |
| El dueño cancela en trial | Cancelación inmediata (no hay período pago). Datos 60 días. |
| El dueño cancela a mitad de mes | Acceso activo hasta fin del mes pago. Sin reembolso proporcional. |
| El dueño cancela con plan anual a mitad de año | Acceso hasta fin del año pago. Sin reembolso del resto. |
| Hay reservas futuras post fecha de expiración | Se cancelan automáticamente. Jugadores notificados con opción de reembolso. |
| El dueño quiere reactivar durante los 60 días | Click en "Reactivar" → nueva suscripción → datos restaurados. |
| El dueño quiere exportar sus datos antes de irse | Botón "Exportar datos" en Settings. Genera CSV con: reservas, clientes, ingresos. |
| El dueño quiere transferir su cuenta a otro admin | Puede agregar otro admin y luego irse. La suscripción la gestiona el nuevo admin. |

### Estados intermedios

```
CANCELACIÓN ──── ACTIVO hasta fin de período ──── BLOCKED ──── CHURNED ──── DELETED
    │                    │                              │            │            │
    │               (sigue funcionando)          (solo lectura)  (pre-delete) (datos borrados)
    │                    │                              │            │
    └── REACTIVABLE ─────┴──── REACTIVABLE ─────────────┴── 60 días ─┘
```

### Puntos de salida

- **Reactivación**: En cualquier momento antes del CHURNED → paga → `active`. Todo restaurado.
- **Churn definitivo**: 60 días post-expiración → CHURNED. 7 días después → DELETED. Irrecuperable.
- **Cancelación abortada**: El dueño acepta la oferta de retención (downgrade o pausa) → no cancela.

### Efectos secundarios

| Evento | Efecto |
|---|---|
| Cancelación solicitada | 📩 Email al dueño: "Lamentamos que te vayas. Tu complejo sigue activo hasta el {fecha}." |
| Cancelación solicitada | 📊 AuditLog: `tenant_subscription.canceled` con motivo |
| Cancelación solicitada | 📊 Métrica interna: churn_reason (analytics de negocio) |
| Suscripción de MP cancelada | 📊 AuditLog: `tenant_subscription.mp_canceled` |
| Período de gracia termina | 🔒 Bloqueo de acceso + cancelación de abonados |
| Período de gracia termina | 📩 Email a contactos de abonados afectados |
| Día 30 post-expiración | 📩 Email de retención: "Tus datos se borran en 30 días" |
| Día 55 post-expiración | 📩 Email urgente: "Quedan 5 días" |
| Día 60 — CHURNED | 📩 Email: "Última oportunidad: 7 días para reactivar" |
| Día 67 — DELETED | 📊 AuditLog: `tenant.data_deleted` (el último registro) |

### Edge cases explícitos

1. **El dueño cancela y luego quiere hacer una reserva manual antes del fin de período**: Permitido. Tiene acceso completo hasta el fin del período pago.
2. **Un jugador reserva online en un complejo que canceló pero aún está en período de gracia**: La reserva se permite (el complejo sigue activo). Si la reserva es DESPUÉS de la fecha de expiración → se permite pero se advierte al admin (y al jugador cuando se cancele al vencer).
3. **El dueño exporta datos el día 59**: Puede hacerlo. El export genera CSV descargable al instante.
4. **El dueño cancela, se arrepiente, y reactiva al día siguiente**: Click en "Reactivar" → se crea nueva suscripción en MP → status `active`. Sin pérdida de datos ni de tiempo.
5. **Dos admins en el mismo complejo: uno quiere cancelar, el otro no**: Cualquier admin puede cancelar. El otro puede reactivar. Si hay conflicto → es un problema organizacional, no del sistema.
6. **El complejo tiene deuda de cobro fallido y el dueño quiere cancelar**: Se cancela la suscripción. La deuda queda en MP (no en TurnoGol). No se bloquea la cancelación por deuda.
7. **Eliminación de datos y Ley 25.326**: Se anonimizan datos personales (nombre, email, celular) en vez de hard-deletearse. Los datos agregados (revenue, cantidad de reservas) se conservan de forma anónima para analytics de TurnoGol.

### Out of scope

- ❌ Reembolso del período restante (anual o mensual)
- ❌ Transferencia de datos a otro sistema de forma automática
- ❌ "Hibernación" del complejo (mantener datos sin pagar indefinidamente)
- ❌ Cancelación parcial (mantener algunas features, perder otras)
- ❌ Encuesta detallada de salida con incentivo (v2)
- ❌ Exit interview obligatoria con un humano

---

# RESUMEN DE FLUJOS

## Mapa de dependencias entre flujos

```
FLUJO 1 (Onboarding)
  └── Genera: Tenant + Court + Staff → habilita TODOS los demás flujos

FLUJO 2 (Reserva online) ◄──── Requiere: Flujo 1 completado
  ├── Genera: Booking + Payment + CashFlow
  └── Conecta con: Flujo 4 (cancelación)

FLUJO 3 (Reserva manual) ◄──── Requiere: Flujo 1 completado
  ├── Genera: Booking + Payment + CashFlow
  └── Conecta con: Flujo 4 (cancelación)

FLUJO 4 (Cancelación) ◄──── Requiere: Booking de Flujo 2 o 3
  └── Genera: Refund + CashFlow + liberación de slot

FLUJO 5 (Abonado) ◄──── Requiere: Flujo 1 completado
  ├── Genera: Abonado + N Bookings recurrentes
  └── Conecta con: Flujo 4 (cancelación de instancias)

FLUJO 6 (Cierre de caja) ◄──── Requiere: CashFlows de Flujos 2, 3, 4, 5
  └── Genera: Cierre inmutable del día

FLUJO 7 (Conversión) ◄──── Requiere: Tenant en trial (Flujo 1)
  └── Genera: TenantSubscription activa

FLUJO 8 (Dunning) ◄──── Requiere: TenantSubscription activa (Flujo 7)
  └── Puede generar: Suspensión → Bloqueo → Churn → Deleted

FLUJO 9 (Cancelación cuenta) ◄──── Requiere: TenantSubscription (Flujo 7)
  └── Genera: Cancelación → Blocked 60 días → Churned → Deleted 7 días
```

## Jobs automáticos (cron) consolidados

| Job | Frecuencia | Flujo origen | Descripción |
|---|---|---|---|
| Expiración de bookings | Cada 1 minuto | Flujo 2 | Bookings en `pending_payment` > 15 min → `expired` |
| Auto-completar bookings | Cada 5 minutos | Flujo 4D | Bookings `confirmed` con time_end < NOW() - 30min → `completed` |
| Generación rolling de abonados | Diario 03:00 | Flujo 5 | Generar instancias futuras para abonados con < 4 semanas |
| Recordatorios email 24hs | Diario 09:00 | Flujos 2, 3 | Email a jugadores con reservas para mañana |
| Recordatorios email 2hs | Cada 30 minutos | Flujos 2, 3 | Email a jugadores con reservas en 2 horas |
| Notificaciones de trial | Diario 10:00 | Flujo 7 | Emails según día del trial (7, 14, 21, 28, 30, 31) |
| Dunning reintentos | Según programación | Flujo 8 | Reintentar cobros de suscripción (día 2, 5) |
| Suspensión por dunning | Diario | Flujo 8 | Tenants con payment > 7 días sin pagar → suspended |
| Bloqueo por dunning | Diario | Flujo 8 | Tenants suspended > 14 días → blocked |
| Churn por inactividad | Diario | Flujo 8 | Tenants blocked > 90 días → churned + eliminación día 97 |
| Emails de retención pre-churn | Diario | Flujo 9 | Emails a día 30 y 55 post-cancelación |

---

> [!IMPORTANT]
> **Fin del Doc 7.** Los 9 flujos cubren la totalidad de las operaciones del sistema.
> Cada flujo documenta: entradas, precondiciones, happy path, decisiones if/else,
> estados intermedios, puntos de salida, efectos secundarios, edge cases y out of scope.
> De este documento sale la lógica de negocio del backend casi directamente.
