# DOC 8 — User Stories con Criterios de Aceptación
## TurnoGol: Lo Que Hay Que Construir, Con Cero Ambigüedad

> **Propósito**: Especificar cada feature como una user story con criterios de aceptación exhaustivos.
> El objetivo es que un desarrollador (humano o IA) pueda leer una story y saber exactamente qué
> construir, qué testear, y qué NO construir.

> [!NOTE]
> **Convenciones de este documento**:
> - Cada story referencia una Persona del Doc 3 y un Flujo del Doc 7.
> - Los criterios de aceptación usan formato Given/When/Then en español.
> - "Out of scope" es obligatorio para evitar scope creep.
> - Las prioridades son: **P0** (bloqueante para lanzamiento) | **P1** (importante) | **P2** (deseable) | **P3** (nice to have).

---

## Convención de IDs

```
US-[MÓDULO]-[NNN]

Módulos:
  ONB = Onboarding
  RES = Reservas (crear, ver, gestionar)
  CAN = Cancelaciones
  ABO = Abonados
  CAJ = Caja y Pagos
  ADM = Administración del Complejo
  JUG = App del Jugador
  NOT = Notificaciones
  SAS = SaaS Lifecycle (billing, dunning)
```

---

## Índice de Epics

| Epic | Módulo | User Stories | Prioridad general |
|---|---|---|---|
| Onboarding | ONB | US-ONB-001 a 005 | P0 |
| Reservas | RES | US-RES-001 a 007 | P0 |
| Cancelaciones | CAN | US-CAN-001 a 004 | P0 |
| Abonados | ABO | US-ABO-001 a 005 + US-JUG-ADM-001 | P1 |
| Caja y Pagos | CAJ | US-CAJ-001 a 005 | P0-P1 |
| Administración | ADM | US-ADM-001 a 005 | P0-P1 |
| App del Jugador | JUG | US-JUG-001 a 004 | P0-P3 |
| Notificaciones | NOT | US-NOT-001 a 003 | P0-P1 |
| SaaS Lifecycle | SAS | US-SAS-001 a 005 | P0-P1 |

**Total estimado: ~40 user stories para la v1.0**

> [!NOTE]
> **Cambios respecto a la versión anterior**: Se eliminaron los epics de Partidos Abiertos (PAR)
> y las stories de cobro automático de abonados, canchas transformables, y WhatsApp como canal.
> El canal de notificación primario en v1 es email. Las referencias a flujos del Doc 7 usan
> la numeración actualizada (9 flujos totales).

---

# EPIC: ONBOARDING (ONB)

---

## US-ONB-001: Registro de Cuenta del Dueño

**Epic**: Onboarding
**Persona**: Marcelo (Dueño del Complejo)
**Prioridad**: P0 — Bloqueante
**Flujo relacionado**: Doc 7, Flujo 1 (pasos 1-2)

**Historia**:
Como Marcelo, dueño de un complejo de fútbol,
cuando decido probar TurnoGol desde la landing page,
quiero crear mi cuenta con email y celular en menos de 1 minuto,
para empezar a configurar mi complejo sin fricción.

**Criterios de Aceptación**:

✅ Happy Path
- [ ] Dado que estoy en `turnogol.app/registrar`, cuando ingreso email válido + password seguro + nombre completo + celular con formato argentino y hago click en "Crear cuenta", entonces se crea un StaffUser con contraseña hasheada y recibo un email de verificación de cuenta.
- [ ] Dado que recibí el email de verificación, cuando hago click en el link de confirmación dentro de los 15 minutos, entonces mi cuenta se activa, quedo autenticado y soy redirigido al wizard de onboarding.
- [ ] Dado que completé el registro, cuando inicio sesión con email y contraseña, entonces mi rol es `admin` automáticamente.

❌ Edge Cases
- [ ] Si el email ya está registrado como StaffUser → mostrar: "Ya tenés una cuenta. Iniciá sesión." con link a login.
- [ ] Si el celular no tiene formato argentino válido (+54 9...) → error de validación inline sin recargar la página.
- [ ] Si la contraseña es menor a 8 caracteres → error "La contraseña debe tener al menos 8 caracteres".
- [ ] Si el link de verificación expiró (>15 minutos) → mostrar: "Este link expiró. Hacé click para recibir uno nuevo."
- [ ] Si el link de verificación ya fue usado → mostrar: "Este link ya fue utilizado. Iniciá sesión."
- [ ] Si el email no llega en 30 segundos → mostrar botón "Reenviar email" + texto "Revisá tu carpeta de spam."

🚫 Out of Scope
- NO incluye registro con Google/Apple (eso es solo para jugadores, no para staff)
- NO incluye verificación de identidad del dueño
- NO incluye registro sin contraseña (el staff siempre tiene contraseña)

**Dependencias**: Ninguna (es el primer flujo del sistema)
**Bloquea**: US-ONB-002, US-ONB-003, US-ONB-004

---

## US-ONB-002: Wizard de Configuración del Complejo

**Epic**: Onboarding
**Persona**: Marcelo (Dueño del Complejo)
**Prioridad**: P0 — Bloqueante
**Flujo relacionado**: Doc 7, Flujo 1 (pasos 3-6)

**Historia**:
Como Marcelo, recién registrado en TurnoGol,
cuando entro al wizard de configuración por primera vez,
quiero poder configurar mi complejo en 4 pasos simples con valores pre-cargados,
para tener mi complejo operativo en menos de 20 minutos.

**Criterios de Aceptación**:

✅ Happy Path
- [ ] Dado que estoy autenticado y no tengo un Tenant creado, cuando entro al panel, entonces soy redirigido automáticamente al wizard de onboarding (paso 1 de 4).
- [ ] **Paso 1 (Datos del complejo)**: Dado que estoy en el paso 1, cuando ingreso nombre + dirección + ciudad + provincia, entonces se crea un Tenant con status=`trialing`, trial_ends_at=NOW()+30 días, y un slug auto-generado desde el nombre.
- [ ] **Paso 2 (Canchas)**: Dado que estoy en el paso 2, cuando creo al menos 1 cancha con nombre + tipo de superficie + capacidad, entonces se crea un Court con status=`online` y pricing pre-cargado según franja horaria.
- [ ] **Paso 2 (Canchas)**: Los precios default son: mañana $8.000, tarde $10.000, noche $12.000 (weekday), mañana $10.000, noche $15.000 (weekend). Editables por el usuario.
- [ ] **Paso 3 (Horarios)**: Dado que estoy en el paso 3, cuando veo los horarios pre-cargados (Lun-Dom 08:00-00:00), entonces puedo editarlos por día o dejar los default.
- [ ] **Paso 4 (Seña)**: Dado que estoy en el paso 4, cuando elijo "Sí, cobrar seña", entonces soy redirigido al OAuth de MercadoPago para conectar mi cuenta.
- [ ] **Paso 4 (Seña)**: Dado que elijo "No cobrar seña", entonces se guarda `settings.requires_deposit = false` y el wizard termina.
- [ ] Dado que completé el wizard, cuando llego al dashboard, entonces veo un checklist de progreso y mi complejo ya está live en `turnogol.app/{slug}`.
- [ ] El wizard guarda progreso automáticamente en DB (no en localStorage). Si cierro el browser y vuelvo, retomo donde quedé.

❌ Edge Cases
- [ ] Si el slug auto-generado ya existe → agregar sufijo numérico (`complejo-san-martin-2`).
- [ ] Si no creo ninguna cancha y skipeo el paso 2 → el complejo se crea pero NO aparece en búsquedas públicas. Checklist muestra "Agregá al menos 1 cancha".
- [ ] Si el OAuth de MercadoPago falla o es cancelado → el wizard termina sin MP. Se puede configurar después desde Settings. Checklist muestra "Conectá MercadoPago".
- [ ] Si cierro el wizard en el paso 3 y vuelvo mañana → levanto el wizard desde el paso 3 (progreso guardado).
- [ ] Si ingreso un nombre de complejo con caracteres especiales → el slug se sanitiza (ej: "Fútbol & Amigos" → "futbol-amigos").

🚫 Out of Scope
- NO incluye subir fotos del complejo en el wizard (es opcional, se hace después)
- NO incluye importación de datos desde otro sistema
- NO incluye configuración de políticas de cancelación en el wizard (defaults aplicados)

**Dependencias**: US-ONB-001
**Bloquea**: US-RES-001, US-RES-002, US-ADM-001

---

## US-ONB-003: Dashboard con Checklist de Onboarding

**Epic**: Onboarding
**Persona**: Marcelo (Dueño del Complejo)
**Prioridad**: P1 — Importante
**Flujo relacionado**: Doc 7, Flujo 1 (paso 7)

**Historia**:
Como Marcelo, que acabo de terminar el wizard,
cuando entro al dashboard de mi complejo,
quiero ver claramente qué me falta configurar y cuán cerca estoy de estar 100% operativo,
para no olvidarme de nada y llegar al "aha moment" (primera reserva online) lo antes posible.

**Criterios de Aceptación**:

✅ Happy Path
- [ ] Dado que completé el wizard, cuando veo el dashboard, entonces hay un componente de "Progreso de configuración" visible con barra y porcentaje.
- [ ] El checklist incluye estos ítems con su estado (✅/⬜):
  - Cuenta creada
  - Datos del complejo
  - Al menos 1 cancha configurada
  - Horarios definidos
  - MercadoPago conectado (si aplica)
  - Link público compartido
  - Primera reserva recibida (el "aha moment")
- [ ] Dado que completo un ítem del checklist, cuando vuelvo al dashboard, entonces el porcentaje se actualiza y el ítem se marca como completado.
- [ ] Dado que completé todos los ítems, cuando veo el dashboard, entonces el componente de checklist se minimiza (pero sigue accesible) y muestra "¡Tu complejo está 100% listo!".

❌ Edge Cases
- [ ] Si el dueño ignora el checklist por 7 días → email recordatorio: "¿Necesitás ayuda configurando tu complejo?"
- [ ] Si el dueño completó todo menos "Primera reserva recibida" → mostrar: "Compartí tu link público para empezar a recibir reservas" con botón de copiar link.

🚫 Out of Scope
- NO incluye tutorial interactivo o video embebido
- NO incluye gamificación del onboarding (badges, rewards)

**Dependencias**: US-ONB-002
**Bloquea**: Ninguna

---

## US-ONB-004: Conectar MercadoPago

**Epic**: Onboarding
**Persona**: Marcelo (Dueño del Complejo)
**Prioridad**: P0 — Bloqueante
**Flujo relacionado**: Doc 7, Flujo 1 (paso 6) + Doc 7, Flujo 2 (paso 4)

**Historia**:
Como Marcelo,
cuando quiero cobrar señas online a mis jugadores,
quiero conectar mi cuenta de MercadoPago al complejo en menos de 3 minutos,
para que los pagos lleguen directamente a mi cuenta sin intermediarios.

**Criterios de Aceptación**:

✅ Happy Path
- [ ] Dado que estoy en Settings → MercadoPago (o en el paso 4 del wizard), cuando hago click en "Conectar MercadoPago", entonces soy redirigido al flujo OAuth de MP.
- [ ] Dado que autorizo la aplicación en MP, cuando soy redirigido de vuelta a TurnoGol, entonces mis credenciales de MP se guardan encriptadas y el complejo queda habilitado para cobrar señas.
- [ ] Dado que MP está conectado, cuando un jugador paga una seña, entonces el dinero va directo a la cuenta de MP de Marcelo (TurnoGol no retiene fondos).
- [ ] Dado que MP está conectado, cuando voy a Settings → MercadoPago, entonces veo "Conectado ✅" con la cuenta asociada y un botón "Desconectar".

❌ Edge Cases
- [ ] Si el OAuth de MP falla por timeout → mostrar error claro: "No pudimos conectar con MercadoPago. Intentá de nuevo."
- [ ] Si el dueño desconecta MP → las reservas online pasan a ser sin seña (el complejo sigue funcionando, pero sin cobro digital).
- [ ] Si el dueño tiene múltiples cuentas de MP → se conecta la que seleccione en el flujo de MP.

🚫 Out of Scope
- NO incluye integración con otros procesadores de pago (solo MP en v1)
- NO incluye configuración del porcentaje de seña desde este flujo (eso es US-ADM-003)

**Dependencias**: US-ONB-001
**Bloquea**: US-RES-003 (pago de seña)

---

## US-ONB-005: Página Pública del Complejo

**Epic**: Onboarding
**Persona**: Tomás (Jugador Espontáneo)
**Prioridad**: P0 — Bloqueante
**Flujo relacionado**: Doc 7, Flujo 2 (paso 1)

**Historia**:
Como Tomás, que busca dónde jugar,
cuando accedo a `turnogol.app/{slug}`,
quiero ver la información del complejo y su disponibilidad de canchas en tiempo real,
para decidir rápido si reservo ahí y en qué horario.

**Criterios de Aceptación**:

✅ Happy Path
- [ ] Dado que accedo a la URL pública del complejo, cuando la página carga, entonces veo: nombre, dirección, fotos (si hay), horarios de apertura, y la grilla de disponibilidad del día actual.
- [ ] Dado que veo la grilla de disponibilidad, cuando la fecha es hoy, entonces los slots pasados aparecen en gris y los futuros en verde (libre) o rojo (ocupado).
- [ ] Dado que hago click en un slot libre, cuando el complejo acepta reservas online, entonces se abre un modal de confirmación con: cancha, fecha, hora, precio, y monto de seña (si aplica).
- [ ] Dado que navego entre días, cuando cambio de fecha, entonces la grilla se actualiza en <500ms según la latencia definida en Doc 5.
- [ ] La página es responsive: funciona en mobile (iPhone, Android) y desktop.
- [ ] La URL es SEO-friendly: `turnogol.app/complejo-san-martin` (no UUID).

❌ Edge Cases
- [ ] Si el complejo tiene status `suspended` o `churned` → la página muestra: "Este complejo no está disponible temporalmente."
- [ ] Si el complejo no tiene canchas activas → la página muestra información del complejo pero no la grilla (sin error).
- [ ] Si el complejo tiene `allow_online_booking = false` → la grilla se muestra pero el botón dice "Contactar al complejo" en vez de "Reservar".
- [ ] Si el slug no existe → 404 amigable: "No encontramos este complejo. ¿Buscás otro?"

🚫 Out of Scope
- NO incluye mapa interactivo con ubicación del complejo (v2)
- NO incluye reviews/calificaciones de jugadores
- NO incluye comparación con otros complejos cercanos
- NO incluye chat en vivo con el complejo

**Dependencias**: US-ONB-002
**Bloquea**: US-RES-001

---

# EPIC: RESERVAS (RES)

---

## US-RES-001: Grilla de Disponibilidad en el Panel Admin

**Epic**: Reservas
**Persona**: Rodrigo (Recepcionista)
**Prioridad**: P0 — Bloqueante
**Flujo relacionado**: Doc 7, Flujos 2 y 3

**Historia**:
Como Rodrigo, recepcionista del complejo,
cuando estoy en el mostrador y alguien me pregunta disponibilidad,
quiero ver de un vistazo todas las canchas del día con sus reservas en una grilla visual,
para responder en menos de 5 segundos sin equivocarme.

**Criterios de Aceptación**:

✅ Happy Path
- [ ] Dado que estoy en el panel admin, cuando veo la grilla, entonces veo un eje X = canchas y un eje Y = franja horaria (desde opening_hour hasta closing_hour).
- [ ] Cada celda muestra: libre (verde), ocupada (rojo con nombre del jugador y tipo de reserva), bloqueada (gris), turno fijo (azul con etiqueta "Abonado").
- [ ] Dado que hago click en un slot libre, cuando se abre el modal, entonces puedo crear una reserva manual (US-RES-002).
- [ ] Dado que hago click en un slot ocupado, cuando se abre el detalle, entonces veo: jugador, tipo, precio, seña, notas, y acciones disponibles (cancelar, marcar completado/no-show).
- [ ] Dado que cambio de día con los controles de navegación, cuando elijo otra fecha, entonces la grilla se recarga en <500ms.
- [ ] La grilla funciona en mobile (pantalla de 375px): scroll horizontal suave para ver todas las canchas.
- [ ] La grilla se actualiza en tiempo real (o con polling cada 30s), sin necesidad de recargar la página.

❌ Edge Cases
- [ ] Si el complejo tiene 10+ canchas → scroll horizontal con indicador de "más canchas →".
- [ ] Si dos staff ven la grilla simultáneamente y uno crea una reserva → la grilla del otro se actualiza en <30 segundos.
- [ ] Si no hay conexión momentánea → mostrar banner: "Sin conexión. Los datos pueden no estar actualizados." No bloquear la interfaz.

🚫 Out of Scope
- NO incluye vista semanal o mensual (solo vista diaria en v1)
- NO incluye drag & drop para mover reservas
- NO incluye filtros por tipo de cancha o capacidad
- NO incluye exportación de la grilla a PDF

**Dependencias**: US-ONB-002
**Bloquea**: US-RES-002

---

## US-RES-002: Crear Reserva Manual (Admin)

**Epic**: Reservas
**Persona**: Rodrigo (Recepcionista)
**Prioridad**: P0 — Bloqueante
**Flujo relacionado**: Doc 7, Flujo 3

**Historia**:
Como Rodrigo, recepcionista,
cuando un jugador llega al mostrador o llama por teléfono para reservar,
quiero crear la reserva en máximo 30 segundos desde la grilla,
para no hacer esperar a nadie y no cometer errores de superposición.

**Criterios de Aceptación**:

✅ Happy Path
- [ ] Dado que hago click en un slot libre de la grilla, cuando se abre el modal de "Nueva Reserva", entonces cancha + fecha + hora inicio + hora fin están pre-cargados.
- [ ] Dado que busco un jugador por nombre o celular, cuando lo encuentro en el sistema, entonces sus datos se autocompletean y se verifica si tiene ban.
- [ ] Dado que el jugador no está registrado, cuando escribo su nombre manualmente, entonces la reserva se crea sin `player_id` (el nombre queda en `notes_internal`).
- [ ] Dado que selecciono tipo de reserva `spontaneous`, cuando confirmo, entonces se crea un Booking con status=`confirmed`, created_by_staff=mi id.
- [ ] Dado que el complejo requiere seña, cuando selecciono "Pagó seña en efectivo", entonces `deposit_status = 'paid'`, `method = 'cash'` y se crea un CashFlow de ingreso.
- [ ] Dado que confirmo la reserva, cuando la transacción atómica verifica disponibilidad, entonces si el slot sigue libre se crea; si fue tomado en el ínterin, veo un error amigable.
- [ ] El modal se cierra al confirmar y la grilla se actualiza mostrando la nueva reserva inmediatamente.

❌ Edge Cases
- [ ] Si busco un jugador con ban global → warning: "Este jugador tiene una suspensión activa. ¿Crear igual?" con botón "Crear de todas formas" (el admin decide).
- [ ] Si busco un jugador con ban en ESTE complejo → warning: "Baneaste a este jugador el {fecha}. ¿Crear igual?"
- [ ] Si edito el precio manualmente (override) → se guarda como `price_snapshot`. No afecta el pricing de la cancha.
- [ ] Si creo una reserva tipo `block` → no se notifica a nadie, no hay jugador, no hay CashFlow.
- [ ] Si creo la reserva para un horario que ya pasó (hoy, hora pasada) → permitido, con label "Reserva retroactiva" en el audit log.
- [ ] Si intento crear para una fecha anterior a hoy → error: "No se pueden crear reservas en fechas pasadas."
- [ ] Si selecciono "Enviar link de pago por email" → se genera preferencia de MP, se envía email con link, booking queda en `pending_payment` con timer de 6 min.
- [ ] Si dos recepcionistas intentan crear en el mismo slot → el primero gana (SELECT FOR UPDATE). El segundo ve: "Este turno acaba de ser tomado."

🚫 Out of Scope
- NO incluye reserva recurrente (eso es US-ABO-001)
- NO incluye drag & drop
- NO incluye duplicar/copiar reserva a otro día
- NO incluye editar una reserva ya creada (cancelar y re-crear)

**Dependencias**: US-RES-001, US-ONB-004 (si con seña)
**Bloquea**: US-CAN-001

**Notas de implementación**:
- La transacción atómica DEBE usar `SELECT FOR UPDATE` en PostgreSQL (Doc 5, sección 9)
- El `price_snapshot` se captura al momento de crear, no al momento de ver la grilla

---

## US-RES-003: Reserva Online por Jugador (Con Seña)

**Epic**: Reservas
**Persona**: Tomás (Jugador Espontáneo)
**Prioridad**: P0 — Bloqueante
**Flujo relacionado**: Doc 7, Flujo 2 (con seña)

**Historia**:
Como Tomás, que quiero jugar mañana,
cuando encuentro un horario libre en la página de un complejo,
quiero reservar y pagar la seña desde mi celular en menos de 3 minutos,
para asegurar mi turno sin tener que llamar al complejo.

**Criterios de Aceptación**:

✅ Happy Path
- [ ] Dado que hago click en un slot libre en la página pública del complejo, cuando se abre el modal, entonces veo: cancha, fecha, hora, precio total ($X), seña requerida ($Y = X × deposit_percentage%).
- [ ] Dado que hago click en "Reservar y pagar seña", cuando no estoy logueado, entonces veo opciones: email (magic link), Google, o registrarme.
- [ ] Dado que me autentiqué, cuando el sistema procesa mi reserva, entonces se crea un Booking con status=`pending_payment` y un timer de 6 minutos empieza.
- [ ] Dado que el booking está en `pending_payment`, cuando soy redirigido al checkout de MercadoPago, entonces el monto es exactamente `deposit_amount` y la referencia es el `booking.id`.
- [ ] Dado que pago exitosamente en MP, cuando el webhook llega a TurnoGol, entonces el booking pasa a `confirmed`, el deposit_status pasa a `paid`, y recibo email de confirmación.
- [ ] Dado que mi reserva está confirmada, cuando veo la pantalla de éxito, entonces veo: cancha, fecha, hora, seña pagada, monto restante para pagar en el complejo, y botón "Agregar al calendario".

❌ Edge Cases
- [ ] Si el slot fue tomado por otro jugador mientras me autenticaba → error: "¡Ups! Este turno acaba de ser tomado." + sugerencia de horarios alternativos libres en la misma cancha (o en otras).
- [ ] Si el pago de MP es rechazado → el booking sigue en `pending_payment`. Mostrar: "El pago no se procesó. ¿Querés intentar con otro medio de pago?"
- [ ] Si el pago de MP queda "in_process" (transferencia bancaria, CBU) → el booking sigue en `pending_payment`. Mostrar: "Tu pago está siendo procesado. Te avisamos por email cuando se confirme."
- [ ] Si cierro la ventana de MP sin pagar y pasan 6 minutos → el booking pasa a `expired`. Recibo email: "Tu reserva expiró. ¿Querés reservar de nuevo?"
- [ ] Si el webhook de MP llega duplicado → chequear `mp_event_id` en `processed_webhooks`. Si ya existe → ignorar.
- [ ] Si pago pero cierro la ventana antes de ver la confirmación → el webhook llega igual → booking confirmado → email de confirmación enviado.
- [ ] Si estoy baneado globalmente → error: "Tu cuenta está temporalmente suspendida."
- [ ] Si estoy baneado en ESTE complejo → error: "No podés reservar en este complejo actualmente."

🚫 Out of Scope
- NO incluye reserva sin seña (es US-RES-004)
- NO incluye split de pago entre jugadores
- NO incluye lista de espera
- NO incluye modificación de reserva (cancelar y re-crear)
- NO incluye elegir duración variable del slot

**Dependencias**: US-ONB-004, US-ONB-005, US-JUG-001
**Bloquea**: US-CAN-001

**Notas de implementación**:
- El `price_snapshot` se captura en la transacción atómica, no del modal previo
- Timeout de 6 minutos del booking se implementa como delayed job/scheduled task
- El webhook handler debe ser idempotente (tabla `processed_webhooks`)

---

## US-RES-004: Reserva Online por Jugador (Sin Seña)

**Epic**: Reservas
**Persona**: Tomás (Jugador Espontáneo)
**Prioridad**: P0 — Bloqueante
**Flujo relacionado**: Doc 7, Flujo 2 (sin seña)

**Historia**:
Como Tomás,
cuando reservo en un complejo que no cobra seña online,
quiero confirmar mi turno instantáneamente sin pasar por un checkout de pago,
para reservar en menos de 1 minuto.

**Criterios de Aceptación**:

✅ Happy Path
- [ ] Dado que el complejo tiene `settings.requires_deposit = false`, cuando hago click en un slot libre, entonces el modal muestra "Precio: $X — Pagás al llegar al complejo" (sin monto de seña).
- [ ] Dado que me autentiqué, cuando confirmo la reserva, entonces se crea un Booking directamente con status=`confirmed` (no pasa por `pending_payment`).
- [ ] Dado que la reserva se confirmó, cuando veo la pantalla de éxito, entonces dice: "¡Tu turno está confirmado! Pagás $X al llegar al complejo."
- [ ] Todo el flujo (click en slot → confirmación) es <30 segundos si ya estoy logueado.

❌ Edge Cases
- [ ] Mismos edge cases de concurrencia (SELECT FOR UPDATE) que US-RES-003.
- [ ] Si el complejo cambia de "sin seña" a "con seña" mientras tengo el modal abierto → al confirmar, se aplica la configuración vigente (con seña). Mostrar modal actualizado.

🚫 Out of Scope
- NO incluye pago del total online (eso sería una evolución futura)
- NO incluye confirmación por parte del complejo (la reserva es instantánea)

**Dependencias**: US-ONB-005, US-JUG-001
**Bloquea**: US-CAN-001

---

## US-RES-005: Timer de Expiración de Reservas Pendientes

**Epic**: Reservas
**Persona**: Sistema (background job)
**Prioridad**: P0 — Bloqueante
**Flujo relacionado**: Doc 7, Flujo 2 (timer de expiración)

**Historia**:
Como el sistema,
cuando una reserva lleva más de 6 minutos en `pending_payment`,
quiero expirarla automáticamente y liberar el slot,
para que otro jugador pueda reservar y el complejo no pierda turnos.

**Criterios de Aceptación**:

✅ Happy Path
- [ ] Dado que un Booking tiene status=`pending_payment` y fue creado hace más de 6 minutos, cuando el job de expiración se ejecuta, entonces el booking pasa a status=`expired`.
- [ ] Dado que un booking expiró, cuando el slot se libera, entonces otro jugador puede ver ese slot como "libre" en la grilla y reservarlo.
- [ ] Dado que el booking expiró, entonces se envía email al jugador: "Tu reserva para {cancha} el {fecha} expiró porque no se completó el pago."
- [ ] Dado que el booking expiró, entonces se registra en AuditLog: `booking.expired` con actor=system.

❌ Edge Cases
- [ ] Si el pago de MP llega en el segundo 05:59 (justo antes de expirar) → el booking se confirma (el webhook llega primero, el job de expiración lo encuentra ya en `confirmed` y no hace nada).
- [ ] Si el job de expiración se ejecuta pero el webhook de MP llega 5 segundos después → el webhook encuentra el booking en `expired` → NO lo reactiva (estado final). El pago se reembolsa automáticamente.
- [ ] Si el job de expiración falla → retry con exponential backoff. El booking puede quedar "zombie" hasta que el retry lo resuelva.

🚫 Out of Scope
- NO incluye configuración del timeout por complejo (es fijo 6 minutos en v1)
- NO incluye extensión del timeout por el jugador

**Dependencias**: US-RES-003
**Bloquea**: Ninguna

**Notas de implementación**:
- El job se ejecuta cada 1 minuto (cron job de la tabla de Doc 7)
- Alternativa: delayed job programado al crear el booking (más preciso)

---

## US-RES-006: [DEPRECADO - POSPUESTO PARA V1.5] Recordatorio de Reserva por Email

> **Nota**: Se eliminó del scope de la V1 según el cambio #18. Los recordatorios de reservas se reconstruirán utilizando WhatsApp en la V1.5.

---

## US-RES-007: Completar Reserva (Marcar Asistencia)

**Epic**: Reservas
**Persona**: Rodrigo (Recepcionista)
**Prioridad**: P0 — Bloqueante
**Flujo relacionado**: Doc 7, Flujo 4D

**Historia**:
Como Rodrigo,
cuando un turno terminó y el jugador ya jugó,
quiero marcar la reserva como "completada" o "no se presentó" desde la grilla,
para que la caja y las estadísticas se actualicen correctamente.

**Criterios de Aceptación**:

✅ Happy Path
- [ ] Dado que una reserva confirmada tiene `time_end` en el pasado, cuando hago click en ella, entonces veo dos botones: "✅ Jugó" y "❌ No se presentó".
- [ ] Dado que hago click en "✅ Jugó", entonces el booking pasa a status=`completed`. Estado final inmutable.
- [ ] Dado que hago click en "❌ No se presentó", entonces el booking pasa a status=`no_show`, se captura la seña y se registra la ausencia (`noshow_count` + `last_no_show_at`); la 2da ausencia en 90 días dispara un softban de 14 días (`tenant_player_bans`).

❌ Edge Cases
- [ ] Si nadie marca asistencia en los 30 minutos posteriores a `time_end` → el sistema auto-completa como `completed` (benefit of the doubt). AuditLog: `booking.auto_completed` con actor=system.
- [ ] Si el admin quiere cambiar un `completed` a `no_show` → permitido SI está dentro de las 24hs. Después de 24hs → inmutable.
- [ ] Si la reserva es tipo `block` (sin jugador) → solo se puede marcar como `completed`. No aplica no-show.

🚫 Out of Scope
- NO incluye detección automática de presencia (QR, NFC, geolocalización)
- NO incluye registro de quién específicamente jugó (solo el responsable de la reserva)

**Dependencias**: US-RES-002 o US-RES-003
**Bloquea**: US-CAJ-001

---

# EPIC: CANCELACIONES (CAN)

---

## US-CAN-001: Jugador Cancela en Plazo (Con Reembolso)

**Epic**: Cancelaciones
**Persona**: Tomás (Jugador Espontáneo) + Agustín (Abonado)
**Prioridad**: P0 — Bloqueante
**Flujo relacionado**: Doc 7, Flujo 4A

**Historia**:
Como Tomás o Agustín,
cuando quiero cancelar mi reserva y faltan más horas que las que exige la política del complejo,
quiero cancelar desde mi celular y recibir el reembolso automáticamente,
para no tener que llamar al complejo ni esperar.

**Criterios de Aceptación**:

✅ Happy Path
- [ ] Dado que tengo una reserva confirmada y `NOW() < fecha + hora_inicio - cancellation_policy.hours_before`, cuando hago click en "Cancelar", entonces veo: "Tu seña de ${monto} se te devuelve."
- [ ] Dado que confirmo la cancelación, entonces: booking.status → `canceled_refunded`, `canceled_by = 'player'`, `canceled_at = NOW()`.
- [ ] Dado que la seña estaba pagada por MP, cuando se procesa la cancelación, entonces se crea un refund en MP y un Payment con type=`refund`.
- [ ] Dado que el reembolso se procesó, entonces recibo email: "Tu turno del {fecha} {hora} fue cancelado. Tu seña de ${monto} se devuelve."
- [ ] Dado que la reserva se canceló, entonces el slot se libera y aparece como "libre" en la grilla y en la página pública.

❌ Edge Cases
- [ ] Si la seña fue pagada en efectivo (reserva manual) → no hay reembolso automático. Mostrar: "Contactá al complejo para el reembolso de tu seña."
- [ ] Si el refund de MP falla → el booking se cancela igual. Se reintenta el refund 3 veces con backoff. Si falla → notificar al admin.
- [ ] Si la reserva no tenía seña (`deposit_status = 'not_required'`) → se cancela sin refund. Mensaje: "Tu turno fue cancelado."
- [ ] Si es una instancia de turno fijo (abonado) → la instancia se cancela. El abonado sigue activo para las próximas semanas.

🚫 Out of Scope
- NO incluye reembolso parcial
- NO incluye cancelación sin autenticación (tiene que estar logueado)

**Dependencias**: US-RES-003, US-RES-004
**Bloquea**: Ninguna

---

## US-CAN-002: Jugador Cancela Fuera de Plazo (Sin Reembolso)

**Epic**: Cancelaciones
**Persona**: Tomás (Jugador Espontáneo)
**Prioridad**: P0 — Bloqueante
**Flujo relacionado**: Doc 7, Flujo 4B

**Historia**:
Como Tomás,
cuando quiero cancelar mi reserva pero ya pasé el plazo de cancelación gratuita,
quiero ser informado claramente de que pierdo la seña antes de confirmar,
para tomar una decisión informada.

**Criterios de Aceptación**:

✅ Happy Path
- [ ] Dado que tengo una reserva confirmada y `NOW() >= fecha + hora_inicio - cancellation_policy.hours_before`, cuando hago click en "Cancelar", entonces veo: "Estás cancelando fuera del plazo. Tu seña de ${monto} NO se devuelve."
- [ ] Dado que veo la advertencia, cuando confirmo, entonces: booking.status → `canceled_no_refund`, deposit_status → `captured`.
- [ ] Dado que la seña fue capturada, entonces se registra en CashFlow como income (captura de seña por cancelación tardía).
- [ ] Dado que confirmé, entonces recibo email: "Tu turno del {fecha} {hora} fue cancelado. La seña queda para el complejo según la política."

❌ Edge Cases
- [ ] Si la política de cancelación del complejo es 0 horas (sin plazo) → TODAS las cancelaciones son sin reembolso. El jugador siempre pierde la seña.
- [ ] Si el complejo no cobra seña → la cancelación fuera de plazo simplemente libera el slot (sin impacto financiero).

🚫 Out of Scope
- NO incluye negociación con el complejo por excepciones
- NO incluye política de cancelación diferente por cancha

**Dependencias**: US-RES-003
**Bloquea**: Ninguna

---

## US-CAN-003: Admin Cancela Reserva

**Epic**: Cancelaciones
**Persona**: Marcelo (Dueño) + Rodrigo (Recepcionista)
**Prioridad**: P0 — Bloqueante
**Flujo relacionado**: Doc 7, Flujo 4C

**Historia**:
Como Marcelo o Rodrigo,
cuando necesito cancelar una reserva (mantenimiento, error, pedido del jugador),
quiero indicar quién cancela (el complejo o el jugador) y el motivo, y que el sistema decida automáticamente si corresponde reembolso según la política,
para mantener trazabilidad y evitar decisiones financieras manuales.

**Criterios de Aceptación**:

✅ Happy Path
- [ ] Dado que hago click en una reserva confirmada en la grilla, cuando elijo "Cancelar", entonces veo: "¿Quién cancela?" con opciones "El complejo" y "El jugador", más un campo de motivo obligatorio.
- [ ] Dado que selecciono "El complejo" (ej: mantenimiento, lluvia), cuando confirmo, entonces el **servidor** aplica reembolso automático (si había seña) → booking.status → `canceled_refunded`, canceled_by = `admin`.
- [ ] Dado que selecciono "El jugador" (ej: el jugador llamó para cancelar), cuando confirmo, entonces el **servidor** evalúa la política horaria: si está en plazo → `canceled_refunded`; si está fuera de plazo → `canceled_no_refund`, deposit_status → `captured`.
- [ ] Dado que la reserva fue cancelada por admin, entonces el jugador recibe email diferenciado: incluye "El complejo {nombre} canceló tu turno" + info de reembolso si aplica.
- [ ] Dado que la cancelación se completó, entonces se registra AuditLog con: `booking.canceled_by_admin`, motivo, staff_user_id.

❌ Edge Cases
- [ ] Si la reserva era `pending_payment` → el admin la puede cancelar (se pasa a `expired`, no a `canceled`). No hay seña que devolver.

🚫 Out of Scope
- NO incluye cancelación masiva (todas las reservas de un día)
- NO incluye motivo predefinido (solo texto libre)

**Dependencias**: US-RES-001
**Bloquea**: Ninguna

---

## US-CAN-004: No-Show y softban por reincidencia (cambio #5)

**Epic**: Cancelaciones
**Persona**: Rodrigo (Recepcionista) + Sistema
**Prioridad**: P1 — Importante
**Flujo relacionado**: Doc 7, Flujo 4D

**Historia**:
Como Rodrigo,
cuando un jugador no se presentó a su turno,
quiero marcarlo como "no se presentó" para que quede registrada la ausencia y, si reincide, se le bloquee reservar online por un tiempo,
para desincentivar los no-shows sin cobrarle plata que no se entregó.

**Criterios de Aceptación**:

✅ Happy Path
- [ ] Dado que la hora de fin del turno ya pasó, cuando hago click en "No se presentó", entonces booking.status → `no_show`.
- [ ] Dado que se marca como no_show, entonces se captura la seña (`deposit_status='captured'`) y se registra la ausencia en `player_tenant_relationships` (`noshow_count` + `last_no_show_at`) vía `applyNoShowStrike`.
- [ ] Dado que es la 2da ausencia dentro de 90 días (`NO_SHOW_STRIKE_WINDOW_DAYS`), entonces se inserta una fila en `tenant_player_bans` que bloquea reservar online por 14 días (`NO_SHOW_SOFTBAN_DAYS`); la 1ra ausencia solo se registra.
- [ ] Dado que el softban está vigente, cuando el jugador intenta reservar online en ESTE complejo, entonces ve el error de ban (`checkPlayerBanned`); el bloqueo se levanta solo al vencer los 14 días, sin cobro de por medio.

❌ Edge Cases
- [ ] Si nadie marca en 30 minutos post-time_end → el sistema auto-completa como `completed` (NO como no_show). El admin tiene 24hs para corregir.
- [ ] Si el jugador no tiene cuenta (reserva manual sin Player) → no se puede generar un ban en el sistema. Se marca como no_show sin bloqueo.

🚫 Out of Scope
- NO hay deuda de dinero por no-show (revertido 2026-07-11, migr. 044): el único costo es la seña ya retenida.
- NO incluye bans globales automáticos (el ban es solo para este complejo).

**Dependencias**: US-RES-007
**Bloquea**: Ninguna

---

# EPIC: ABONADOS (ABO)

---

## US-ABO-001: Crear Abonado (Turno Fijo Recurrente)

**Epic**: Abonados
**Persona**: Marcelo (Dueño) + Rodrigo (Recepcionista)
**Prioridad**: P1 — Importante
**Flujo relacionado**: Doc 7, Flujo 5

**Historia**:
Como Marcelo,
cuando acuerdo un turno fijo semanal con un grupo de jugadores,
quiero cargarlo en el sistema para que genere automáticamente las reservas cada semana,
para no tener que crear manualmente la misma reserva semana tras semana.

**Criterios de Aceptación**:

✅ Happy Path
- [ ] Dado que estoy en Abonados → "+ Nuevo Abonado", cuando ingreso cancha + día de la semana + hora inicio/fin + contacto (nombre + celular) + método de pago (efectivo/transferencia), entonces puedo continuar al siguiente paso.
- [ ] Dado que defino el precio por sesión, cuando el default se carga desde `court.pricing`, entonces puedo editarlo (override: precio especial para abonados).
- [ ] Dado que confirmo, cuando el sistema verifica disponibilidad de las próximas 8 semanas, entonces veo: "Sin conflictos" o "Conflictos en: {fechas}" con detalle.
- [ ] Dado que no hay conflictos (o acepto crear saltando las semanas con conflicto), cuando confirmo el alta, entonces se crea el Abonado con status=`active` y se generan N Bookings con type=`fixed`, status=`confirmed`.
- [ ] Dado que el abonado se creó, entonces el contacto recibe email: "Tu turno fijo está confirmado: {cancha} todos los {día} a las {hora}."
- [ ] Las instancias generadas aparecen en la grilla con color diferenciado (azul) y etiqueta "Abonado".

❌ Edge Cases
- [ ] Si el slot tiene otro Abonado activo → error: "Ya hay un abonado en este horario. Cancelá el existente primero."
- [ ] Si algunas semanas tienen conflicto con reservas espontáneas → warning con detalle. El admin decide si crea saltando esas semanas.
- [ ] Si `price_per_session = 0` → permitido (cortesía).
- [ ] Si no vincular a un Player registrado → OK. Solo se usa `contact_name` + `contact_phone`.

🚫 Out of Scope
- NO incluye múltiples horarios por abonado (miércoles Y viernes = 2 abonados)
- NO incluye edición del horario/cancha (cancelar y re-crear)
- NO incluye descuento por pago anticipado
- NO incluye cobro automático vía MercadoPago (v1 es 100% manual)

**Dependencias**: US-RES-001, US-ONB-002
**Bloquea**: US-ABO-002, US-ABO-003

---

## US-ABO-002: Generación Rolling de Instancias

**Epic**: Abonados
**Persona**: Sistema (background job)
**Prioridad**: P1 — Importante
**Flujo relacionado**: Doc 7, Flujo 5 (generación rolling)

**Historia**:
Como el sistema,
cuando un abonado activo tiene menos de 4 semanas de instancias futuras,
quiero generar automáticamente 4 semanas más de bookings,
para que el turno fijo siempre tenga reservas generadas con anticipación.

**Criterios de Aceptación**:

✅ Happy Path
- [ ] Dado que el job diario se ejecuta a las 03:00 ART, cuando un Abonado con status=`active` tiene < 4 instancias futuras, entonces se generan 4 instancias adicionales (Bookings con type=`fixed`).
- [ ] Dado que se generan nuevas instancias, entonces cada una respeta `closed_dates` del complejo (no se genera para feriados).
- [ ] Dado que el abonado tiene `ends_on` definido, cuando la fecha de generación supera `ends_on`, entonces no se generan más instancias.
- [ ] Dado que se generaron instancias, entonces se registra AuditLog: `abonado.instances_generated` con cantidad.

❌ Edge Cases
- [ ] Si el día de generación tiene un conflicto con una reserva espontánea → NO se genera esa instancia. Log de warning para el admin.
- [ ] Si el Tenant está suspendido → NO se generan instancias (el job lo saltea).
- [ ] Si el abonado tiene status=`paused` → NO se generan instancias.

🚫 Out of Scope
- NO incluye notificación al admin cuando se generan instancias (es silencioso)
- NO incluye regeneración de instancias saltadas por conflicto

**Dependencias**: US-ABO-001
**Bloquea**: Ninguna

---

## US-ABO-003: Pausar y Reactivar Abonado

**Epic**: Abonados
**Persona**: Marcelo (Dueño)
**Prioridad**: P1 — Importante
**Flujo relacionado**: Doc 7, Flujo 5 (state machine del abonado)

**Historia**:
Como Marcelo,
cuando un grupo de abonados me avisa que no van a jugar por 2 semanas (vacaciones),
quiero pausar su abonado temporalmente sin perder la configuración,
para poder reactivarlo cuando vuelvan sin tener que crearlo de nuevo.

**Criterios de Aceptación**:

✅ Happy Path
- [ ] Dado que hago click en un abonado activo, cuando elijo "Pausar", entonces el status pasa a `paused` y todas las instancias futuras (Bookings) se eliminan (slots liberados).
- [ ] Dado que el abonado está pausado, cuando hago click en "Reactivar", entonces el status vuelve a `active` y se generan instancias para las próximas 8 semanas desde hoy.
- [ ] Dado que pausé y reactivo, entonces la configuración original (cancha, día, hora, precio) se mantiene intacta.
- [ ] Dado que pausé el abonado, entonces el contacto recibe email: "Tu turno fijo del {día} {hora} fue pausado temporalmente."
- [ ] Dado que reactivo el abonado, entonces el contacto recibe email: "¡Tu turno fijo fue reactivado! Nos vemos el próximo {día}."

❌ Edge Cases
- [ ] Si al reactivar, el slot ahora tiene otro abonado → error: "Este horario ya tiene un turno fijo. Elegí otro horario o cancelá el conflicto."
- [ ] Si al reactivar, algunas semanas tienen reservas espontáneas → se generan las que no tienen conflicto (misma lógica que al crear).
- [ ] Las instancias pasadas (históricas) NO se eliminan al pausar — solo las futuras.

🚫 Out of Scope
- NO incluye pausa programada (ej: "pausar del 15 al 30")
- NO incluye pausa automática por falta de pago (gestión manual)

**Dependencias**: US-ABO-001
**Bloquea**: Ninguna

---

## US-ABO-004: Cancelar Abonado

**Epic**: Abonados
**Persona**: Marcelo (Dueño)
**Prioridad**: P1 — Importante
**Flujo relacionado**: Doc 7, Flujo 5 (state machine)

**Historia**:
Como Marcelo,
cuando un grupo de abonados decide no continuar con su turno fijo,
quiero cancelar su abonado desde una fecha específica,
para que las instancias futuras se eliminen y el slot quede libre.

**Criterios de Aceptación**:

✅ Happy Path
- [ ] Dado que hago click en un abonado activo, cuando elijo "Cancelar abonado", entonces veo un selector de fecha: "¿Desde qué fecha?" (default: próxima semana).
- [ ] Dado que selecciono la fecha de cancelación, cuando confirmo, entonces el status pasa a `canceled` y todas las instancias (Bookings) posteriores a esa fecha se eliminan.
- [ ] Dado que las instancias se eliminaron, entonces los slots quedan libres en la grilla.
- [ ] Dado que el abonado se canceló, entonces el contacto recibe email: "Tu turno fijo del {día} {hora} fue cancelado a partir del {fecha}."
- [ ] Las instancias pasadas (históricas) se mantienen intactas en el historial.

❌ Edge Cases
- [ ] Si cancelo con fecha = hoy → eliminar todas las instancias futuras desde hoy inclusive.
- [ ] Si cancelo un abonado que ya estaba pausado → cambia de `paused` a `canceled` (sin eliminar instancias — ya fueron eliminadas al pausar).

🚫 Out of Scope
- NO incluye reembolso del mes en curso
- NO incluye cancelación por parte del jugador (solo el admin)

**Dependencias**: US-ABO-001
**Bloquea**: Ninguna

---

## US-ABO-005: Saldo a Favor del Abonado (cambio #4) — ⛔ REVERTIDO (2026-07-10)

> **REVERTIDO**: el sistema de saldo a favor (`credit_balance`, `credit_applied`, CashFlow
> `abonado_payment`) fue eliminado — modelo ATC descartado para fútbol (migración 042). Esta
> historia queda como registro histórico; no representa el comportamiento actual. Ver
> `docs/planning/cambios-reglas-negocio.md` cambio #4.

**Epic**: Abonados
**Persona**: Marcelo (Dueño) / Rodrigo (Encargado)
**Prioridad**: P1 — Importante
**Flujo relacionado**: Doc 7, Flujo 5 ("Saldo a favor")

**Historia**:
Como Marcelo,
cuando el grupo de un abonado me paga sesiones por adelantado,
quiero cargar ese dinero como "saldo a favor" del abonado y descontarlo manualmente semana a semana,
para llevar el control de cuánto pagó cada abonado sin doble-contar la plata en la caja.

**Criterios de Aceptación**:

✅ Happy Path
- [ ] Dado que el grupo paga $40.000 en efectivo, cuando cargo saldo en el abonado, entonces se genera un CashFlow `income`/`abonado_payment` (entra a la caja del día) y `credit_balance` sube $40.000.
- [ ] Dado que el grupo viene a jugar, cuando abro la instancia del turno fijo y **destildo** "Mantener saldo", entonces se descuenta `price_snapshot` del `credit_balance` y NO se genera un CashFlow nuevo.
- [ ] Dado que dejo "Mantener saldo" tildado, entonces el saldo no se toca.
- [ ] Dado que descontué por error, cuando **re-tildo** "Mantener saldo" (instancia aún confirmada), entonces el saldo se devuelve.

❌ Edge Cases
- [ ] Si el `credit_balance` no alcanza para descontar la sesión → error "El saldo no alcanza".
- [ ] Idempotencia: doble-submit con la misma clave no duplica la carga ni dobla el saldo.
- [ ] El saldo es por abonado: un jugador con 2 abonados tiene 2 saldos independientes (no se transfieren).

🚫 Out of Scope
- NO incluye cobro automático vía MercadoPago (v1 es 100% manual).
- NO incluye descuento automático al completar (siempre manual, semana a semana).

**Dependencias**: US-ABO-001
**Bloquea**: US-JUG-ADM-001

---

## US-JUG-ADM-001: Módulo Jugadores y Gestión de Bans (cambio #9)

**Epic**: Abonados / Administración
**Persona**: Marcelo (Dueño) / Rodrigo (Encargado)
**Prioridad**: P1 — Importante
**Flujo relacionado**: Doc 7, Flujo 5B

**Historia**:
Como Marcelo,
quiero un módulo central "Jugadores" con la ficha de cada cliente vinculado al complejo,
para ver su historial, gestionar sus bans de no-show y cargar saldo de sus abonos en un solo lugar.

**Criterios de Aceptación**:

✅ Happy Path
- [ ] Dado que entro a `/jugadores`, entonces veo solo jugadores vinculados al complejo (no invitados telefónicos), con buscador por nombre/teléfono/email y badge rojo si tienen un ban activo.
- [ ] Dado que abro una ficha, entonces veo stats (reservas, ausencias (noshow_count), tasa), bans activos/historial, abonados con saldo, e historial de reservas.
- [ ] Dado que el jugador tiene un ban activo, cuando hago click en "Levantar ban", entonces se desactiva el registro en `tenant_player_bans` y el jugador queda habilitado para volver a reservar online.

❌ Edge Cases
- [ ] Si el jugador tiene ban activo, se ofrece el botón "Levantar ban"; si no, se ofrece la opción "+ Crear ban".
- [ ] El módulo está protegido con `requireOperatorStaff()` (admin + manager).

🚫 Out of Scope
- NO crea perfiles automáticamente para invitados telefónicos (decisión #10 cancelada).

**Dependencias**: US-ABO-005, cambio #5 (softban por reincidencia de no-show)
**Bloquea**: Ninguna

---

# EPIC: CAJA Y PAGOS (CAJ)

---

## US-CAJ-001: Registrar Pago Manual (Efectivo/Transferencia)

**Epic**: Caja y Pagos
**Persona**: Rodrigo (Recepcionista)
**Prioridad**: P0 — Bloqueante
**Flujo relacionado**: Doc 7, Flujo 6 (paso 2)

**Historia**:
Como Rodrigo,
cuando un jugador paga en efectivo o por transferencia al llegar al complejo,
quiero registrar el cobro en el sistema en menos de 15 segundos,
para que la caja del día esté actualizada y no perder registro de pagos.

**Criterios de Aceptación**:

✅ Happy Path
- [ ] Dado que hago click en una reserva confirmada, cuando elijo "Registrar pago", entonces veo: monto pre-cargado (resto a pagar = price_snapshot - deposit_amount) y selector de método (efectivo / transferencia).
- [ ] Dado que confirmo el pago, entonces se crea un CashFlow con type=`income`, category=`booking`, method seleccionado.
- [ ] Dado que el pago se registró, entonces la reserva muestra badge "Pagado ✅" en la grilla.
- [ ] Dado que quiero registrar un pago no vinculado a reserva (ej: cantina), cuando uso "+ Agregar movimiento", entonces puedo crear un CashFlow con categoría libre.

❌ Edge Cases
- [ ] Si el jugador paga parcial → registrar el monto parcial. La reserva muestra "Pago parcial: ${monto}/{total}".
- [ ] Si me equivoqué en el monto → puedo editar el CashFlow SOLO si la caja del día no fue cerrada.
- [ ] Si registro un egreso → tipo=`expense` con categoría: `other` (descripción obligatoria).

🚫 Out of Scope
- NO incluye generación de recibos/comprobantes
- NO incluye integración con AFIP
- NO incluye propinas o redondeo
- NO incluye gestión de gastos operativos (sueldos, servicios, mantenimiento)

**Dependencias**: US-RES-007
**Bloquea**: US-CAJ-003

---

## US-CAJ-002: Vista de Caja del Día

**Epic**: Caja y Pagos
**Persona**: Marcelo (Dueño) + Rodrigo (Recepcionista)
**Prioridad**: P0 — Bloqueante
**Flujo relacionado**: Doc 7, Flujo 6 (paso 1)

**Historia**:
Como Marcelo o Rodrigo,
cuando quiero ver cuánto se recaudó hoy,
quiero una vista resumen con ingresos, egresos y balance del día desglosados por método de pago,
para saber cuánto hay en caja sin tener que sumar manualmente.

**Criterios de Aceptación**:

✅ Happy Path
- [ ] Dado que estoy en Caja → selecciono una fecha (default: hoy), cuando la vista carga, entonces veo: total ingresos, total egresos, balance, y desglose por método de pago (efectivo / transferencia / MP).
- [ ] Dado que veo el desglose, entonces las categorías están separadas: reservas, ventas de cantina, reembolsos, otros.
- [ ] Dado que hago click en un movimiento individual, cuando veo el detalle, entonces veo: monto, método, categoría, descripción, booking vinculado (si aplica), staff que lo registró.
- [ ] Dado que navego entre fechas, cuando cambio de día, entonces los datos se actualizan.

❌ Edge Cases
- [ ] Si no hay movimientos para el día seleccionado → mostrar: "No hay movimientos registrados para este día."
- [ ] Si hay pagos de MP pendientes de webhook → mostrar con badge "Pendiente" en amarillo.

🚫 Out of Scope
- NO incluye gráficos o visualizaciones (eso es reportes, módulo separado)
- NO incluye exportación a Excel desde esta vista

**Dependencias**: US-CAJ-001
**Bloquea**: US-CAJ-003

---

## US-CAJ-003: Cierre de Caja Diario

**Epic**: Caja y Pagos
**Persona**: Marcelo (Dueño) + Rodrigo (Recepcionista)
**Prioridad**: P1 — Importante
**Flujo relacionado**: Doc 7, Flujo 6

**Historia**:
Como Marcelo o Rodrigo,
cuando termina el día y quiero cerrar la caja,
quiero comparar el efectivo real con el calculado y registrar el cierre,
para tener un registro oficial inmutable de lo que pasó financieramente cada día.

**Criterios de Aceptación**:

✅ Happy Path
- [ ] Dado que estoy en la vista de caja del día, cuando hago click en "Cerrar caja", entonces veo el resumen final con opción de ingresar "Efectivo contable real".
- [ ] Dado que el efectivo declarado coincide con el calculado, cuando confirmo, entonces se crea un registro de cierre inmutable.
- [ ] Dado que la caja se cerró, entonces los CashFlows del día quedan "congelados" (no editables).
- [ ] Dado que la caja está cerrada, cuando intento agregar un movimiento para ese día, entonces veo error: "La caja del {fecha} ya fue cerrada."

❌ Edge Cases
- [ ] Si el efectivo real difiere del calculado → warning: "Diferencia de ${diff}." + campo de nota obligatoria explicando la diferencia.
- [ ] Si ya existe un cierre para ese día → error: "La caja del {fecha} ya fue cerrada por {staff}."
- [ ] El cierre es **inmutable**: NO existe "reabrir caja". Las migraciones 008/037/038 revocan `UPDATE`/`DELETE` sobre `daily_cash_closes` para los roles `turnogol_app` y `turnogol_worker`, así que ningún flujo puede modificarlo tras el INSERT. Un error se corrige con un CashFlow de ajuste al día siguiente, no reabriendo.
- [ ] Si hay reservas completadas sin pago registrado → warning antes de cerrar.

🚫 Out of Scope
- NO incluye cierre por turno (mañana/tarde/noche)
- NO incluye impresión de cierre

**Dependencias**: US-CAJ-002
**Bloquea**: Ninguna

---

## US-CAJ-004: Venta de Producto (Cantina/Stock)

**Epic**: Caja y Pagos
**Persona**: Rodrigo (Recepcionista)
**Prioridad**: P2 — Deseable
**Flujo relacionado**: Doc 6, Entidad Product

**Historia**:
Como Rodrigo,
cuando un cliente compra una gaseosa o alquila una pelota,
quiero registrar la venta seleccionando el producto de una lista,
para que el stock se actualice y el ingreso quede en la caja del día.

**Criterios de Aceptación**:

✅ Happy Path
- [ ] Dado que estoy en Caja → "Venta rápida", cuando selecciono un producto de la lista, entonces veo nombre, precio, y campo de cantidad (default: 1).
- [ ] Dado que confirmo la venta, entonces se crea un CashFlow con category=`product_sale` y el stock del producto se decrementa.
- [ ] Dado que el stock del producto baja de `low_stock_alert`, entonces se muestra badge de alerta: "Stock bajo: {producto} ({stock} unidades)."

❌ Edge Cases
- [ ] Si el stock llega a 0 → permitir la venta de todas formas (puede ser pre-venta o stock desactualizado). Warning visual.
- [ ] Si el producto está inactivo → no aparece en la lista de venta rápida.

🚫 Out of Scope
- NO incluye escaneo de código de barras
- NO incluye integración con proveedores
- NO incluye historial de precios del producto

**Dependencias**: US-ADM-004
**Bloquea**: Ninguna

---

## US-CAJ-005: Reportes Financieros Básicos

**Epic**: Caja y Pagos
**Persona**: Marcelo (Dueño)
**Prioridad**: P1 — Importante
**Flujo relacionado**: Job secundario de Marcelo — "Monitorear el negocio"

**Historia**:
Como Marcelo,
cuando quiero saber cómo va mi negocio este mes,
quiero ver reportes con ingresos, egresos, y métricas clave,
para tomar decisiones informadas sin necesidad de un contador.

**Criterios de Aceptación**:

✅ Happy Path
- [ ] Dado que estoy en Reportes → selecciono un rango de fechas (default: mes actual), cuando la vista carga, entonces veo: ingreso total, egreso total, balance neto.
- [ ] Dado que veo el reporte, entonces incluye: desglose por cancha (qué cancha facturó más), desglose por método de pago, cantidad total de reservas, tasa de ocupación por cancha.
- [ ] Dado que quiero comparar con el mes anterior, cuando selecciono "Mes anterior", entonces puedo ver la comparación lado a lado.
- [ ] Dado que quiero exportar los datos, entonces hay un botón "Exportar CSV" que descarga el detalle de todos los movimientos del período.

❌ Edge Cases
- [ ] Si el período no tiene datos → mostrar ceros (no error).
- [ ] Si el complejo tiene solo 1 mes de historia → no mostrar comparativa.

🚫 Out of Scope
- NO incluye gráficos interactivos avanzados (solo tablas y números clave)
- NO incluye predicciones o proyecciones
- NO incluye informe de rentabilidad por horario
- NO incluye exportación a PDF

**Dependencias**: US-CAJ-001, US-CAJ-002
**Bloquea**: Ninguna

---

# EPIC: ADMINISTRACIÓN DEL COMPLEJO (ADM)

---

## US-ADM-001: Gestionar Canchas (CRUD)

**Epic**: Administración
**Persona**: Marcelo (Dueño)
**Prioridad**: P0 — Bloqueante
**Flujo relacionado**: Doc 6, Entidad Court

**Historia**:
Como Marcelo,
cuando quiero agregar una nueva cancha o modificar una existente,
quiero hacerlo desde Settings en menos de 2 minutos,
para mantener mi complejo actualizado sin llamar a soporte.

**Criterios de Aceptación**:

✅ Happy Path
- [ ] Dado que estoy en Settings → Canchas, cuando hago click en "+ Nueva cancha", entonces veo formulario con: nombre, tipo de superficie (césped sintético, cemento, etc.), capacidad (5, 7, 8, 9, 11), y si es cubierta o no.
- [ ] Dado que creo una cancha, cuando confirmo, entonces Court se crea con status=`online`, con pricing default (weekday/weekend × franja horaria) editable.
- [ ] Dado que quiero editar una cancha existente, cuando hago click en ella, entonces puedo editar: nombre, superficie, precio por franja, estado (`online`/`offline`).
- [ ] Dado que pongo una cancha en `offline`, entonces los slots futuros desaparecen de la grilla y las reservas existentes se mantienen hasta que el admin las gestione.
- [ ] Dado que agrego una cancha y mi plan no la cubre (ej: plan Predio con 3 canchas y quiero la 4ta), entonces veo: "Tu plan soporta hasta {N} canchas. Upgrade para agregar más."

❌ Edge Cases
- [ ] Si desactivo una cancha CON abonados activos → warning: "Esta cancha tiene {N} abonados activos. Cancelalos primero."
- [ ] Si desactivo una cancha CON reservas futuras → warning: "Hay {N} reservas futuras. Se cancelarán automáticamente."
- [ ] Si elimino una cancha (soft delete) → no se muestra en la grilla ni búsquedas. Las reservas históricas mantienen referencia.

🚫 Out of Scope
- NO incluye fotos de la cancha (v2)
- NO incluye mapa de ubicación dentro del complejo
- NO incluye horarios diferentes por cancha (eso lo hereda del complejo)

**Dependencias**: US-ONB-002
**Bloquea**: US-RES-001

---

## US-ADM-002: Configurar Políticas de Reserva

**Epic**: Administración
**Persona**: Marcelo (Dueño)
**Prioridad**: P0 — Bloqueante
**Flujo relacionado**: Doc 6, Entidad Tenant Settings

**Historia**:
Como Marcelo,
cuando quiero definir las reglas de mi complejo (si cobro seña, cuánto, plazo de cancelación),
quiero configurar estas políticas desde Settings,
para que el sistema aplique mis reglas automáticamente sin intervención manual.

**Criterios de Aceptación**:

✅ Happy Path
- [ ] Dado que estoy en Settings → Políticas, cuando veo la sección "Reservas", entonces puedo configurar:
  - `requires_deposit` (sí/no)
  - `deposit_percentage` (10%-100%, default 30%)
  - `allow_online_booking` (sí/no)
  - `cancellation_hours_before` (0-72h, default 12h)
- [ ] Dado que cambio una configuración, cuando guardo, entonces todos los flujos futuros usan la nueva configuración (las reservas existentes NO se afectan retroactivamente).

❌ Edge Cases
- [ ] Si desactivo `requires_deposit` y ya hay reservas en `pending_payment` → esas reservas se confirman automáticamente (sin esperar pago).
- [ ] Si cambio `cancellation_hours_before` de 12 a 24 → las cancelaciones en progreso siguen con la política vieja (la que estaba al momento de crear la reserva).

🚫 Out of Scope
- NO incluye políticas diferentes por cancha
- NO incluye políticas diferentes por tipo de reserva (abonado vs espontáneo)
- NO incluye configuración avanzada de horarios pico/valle

**Dependencias**: US-ONB-002
**Bloquea**: US-RES-003, US-CAN-001

---

## US-ADM-003: Gestionar Staff (Usuarios del Panel)

**Epic**: Administración
**Persona**: Marcelo (Dueño)
**Prioridad**: P0 — Bloqueante
**Flujo relacionado**: Doc 6, Entidad StaffUser

**Historia**:
Como Marcelo,
cuando incorporo un nuevo empleado al complejo,
quiero invitarlo como `admin` o `manager` con su propio email,
para que pueda operar el sistema según su rol. Las operaciones más sensibles (MercadoPago, facturación, staff) solo las puede hacer un admin, mientras que el manager realiza la operación diaria sin necesidad de PIN.

**Criterios de Aceptación**:

✅ Happy Path
- [ ] Dado que estoy en Settings → Staff → "+ Agregar", cuando ingreso email + nombre + rol (`admin` / `manager`), entonces se envía un link de confirmación al email del nuevo staff.
- [ ] Dado que el staff activa su cuenta y configura su contraseña, cuando ingresa al panel, entonces accede a las funcionalidades habilitadas para su rol.
- [ ] Dado que el rol es `manager`, entonces el acceso a MercadoPago, gestión de staff, facturación y suscripción SaaS está bloqueado (gating a nivel aplicación).
- [ ] Dado que el rol es `admin`, entonces el acceso es completo sin restricciones.
- [ ] Dado que quiero desactivar un staff, cuando lo desactivo, entonces pierde acceso al panel inmediatamente y sus sesiones activas se invalidan.

❌ Edge Cases
- [ ] Si el único `admin` se desactiva o se cambia de rol a `manager` → error: "El complejo debe tener al menos un admin activo."
- [ ] Si invito a un email que ya es staff de OTRO complejo → permitido. Cada complejo es independiente y el usuario puede tener roles distintos en cada complejo.
- [ ] Si el staff nunca activó su cuenta → puedo reenviar la invitación o eliminarla.

🚫 Out of Scope
- NO incluye permisos granulares a medida por usuario (se usan los 2 roles fijos).
- NO incluye horarios de acceso (ej: "solo puede entrar de 17 a 00").
- NO incluye log de actividad por staff en pantalla (pero sí se guarda en AuditLog en DB).

**Dependencias**: US-ONB-001
**Bloquea**: Ninguna

---

## US-ADM-004: Gestionar Productos (Cantina/Stock)

**Epic**: Administración
**Persona**: Marcelo (Dueño)
**Prioridad**: P2 — Deseable
**Flujo relacionado**: Doc 6, Entidad Product

**Historia**:
Como Marcelo,
cuando quiero que mi recepcionista pueda registrar ventas de la cantina,
quiero crear una lista de productos con nombre, precio y stock,
para que las ventas se registren rápidamente y el inventario se mantenga actualizado.

**Criterios de Aceptación**:

✅ Happy Path
- [ ] Dado que estoy en Settings → Productos → "+ Nuevo", cuando ingreso nombre + precio + stock inicial + categoría (bebida / snack / alquiler / otro), entonces el producto se crea con status=`active`.
- [ ] Dado que creo un producto, cuando Rodrigo va a "Venta rápida", entonces el producto aparece en la lista disponible.
- [ ] Dado que quiero editar un producto (cambiar precio), cuando lo edito, entonces las ventas futuras usan el nuevo precio (las pasadas no se afectan).
- [ ] Dado que quiero configurar alerta de stock bajo, cuando defino `low_stock_alert`, entonces se muestra badge cuando el stock esté debajo del umbral.

❌ Edge Cases
- [ ] Si desactivo un producto → no aparece en la lista de venta rápida. Las ventas históricas mantienen el nombre y precio.
- [ ] Si el stock es 0 → warning visual pero se permite la venta (el stock puede no estar 100% sincronizado).

🚫 Out of Scope
- NO incluye gestión de proveedores
- NO incluye código de barras
- NO incluye historial de precios

**Dependencias**: US-ONB-002
**Bloquea**: US-CAJ-004

---

## US-ADM-005: Configurar Horarios y Feriados

**Epic**: Administración
**Persona**: Marcelo (Dueño)
**Prioridad**: P0 — Bloqueante
**Flujo relacionado**: Doc 6, Entidad Tenant (operating_hours, closed_dates)

**Historia**:
Como Marcelo,
cuando cambio los horarios de mi complejo o hay un feriado,
quiero actualizar la disponibilidad desde Settings,
para que la grilla y la página pública reflejen los horarios reales.

**Criterios de Aceptación**:

✅ Happy Path
- [ ] Dado que estoy en Settings → Horarios, cuando veo la tabla de horarios por día, entonces puedo editar hora de apertura y cierre para cada día de la semana.
- [ ] Dado que cambio el horario de cierre de las 00:00 a las 23:00, cuando guardo, entonces los slots de 23:00-00:00 ya no aparecen en la grilla a partir de mañana.
- [ ] Dado que estoy en Settings → Feriados, cuando agrego una fecha como "cerrado", entonces esa fecha no muestra slots disponibles en la grilla ni en la página pública.
- [ ] Dado que una fecha cerrada tiene reservas existentes → warning: "Hay {N} reservas para este día. ¿Cancelarlas?"

❌ Edge Cases
- [ ] Si un abonado tiene turno en un día que se marca como cerrado → la instancia de esa semana no se genera (el job de generación respeta `closed_dates`).
- [ ] Si abro un día que antes estaba cerrado (ej: "finalmente abrimos los lunes") → los slots se generan automáticamente con el pricing del día correspondiente.

🚫 Out of Scope
- NO incluye horarios diferentes por cancha
- NO incluye horarios especiales por temporada
- NO incluye importación de feriados nacionales automática

**Dependencias**: US-ONB-002
**Bloquea**: US-ABO-002

---

# EPIC: APP DEL JUGADOR (JUG)

---

## US-JUG-001: Autenticación del Jugador

**Epic**: App del Jugador
**Persona**: Tomás (Jugador Espontáneo) + Agustín (Jugador Abonado)
**Prioridad**: P0 — Bloqueante
**Flujo relacionado**: Doc 7, Flujo 2 (paso 2)

**Historia**:
Como Tomás,
cuando quiero reservar o ver mis turnos,
quiero autenticarme de la forma más rápida posible,
para no abandonar el proceso por fricción de login.

**Criterios de Aceptación**:

✅ Happy Path
- [ ] Dado que llego a una pantalla que requiere autenticación, cuando veo las opciones, entonces puedo elegir: ingresar email (magic link), o continuar con Google.
- [ ] Dado que ingreso mi email, cuando recibo el magic link y hago click, entonces quedo autenticado y soy redirigido a donde estaba.
- [ ] Dado que elijo Google, cuando autorizo, entonces se crea (o vincula) un Player con mi email de Google y quedo autenticado.
- [ ] Dado que ya tengo sesión activa, cuando vuelvo al sitio, entonces no necesito autenticarme de nuevo (sesión persistente con refresh token).

❌ Edge Cases
- [ ] Si mi email ya existe como Player → se vincula (no se crea duplicado).
- [ ] Si mi email NO existe → se crea Player automáticamente con `display_name` del email o de Google.
- [ ] Si el magic link expiró → "Este link expiró. Solicitá uno nuevo."
- [ ] Si elijo Google y cancelo el popup → vuelvo a las opciones sin error.

🚫 Out of Scope
- NO incluye login con contraseña
- NO incluye Apple ID (v2)
- NO incluye verificación de celular por SMS
- NO incluye registro manual con formulario largo

**Dependencias**: Ninguna
**Bloquea**: US-RES-003, US-JUG-002

---

## US-JUG-002: Mis Reservas (Vista del Jugador)

**Epic**: App del Jugador
**Persona**: Tomás + Agustín
**Prioridad**: P0 — Bloqueante
**Flujo relacionado**: Doc 7, Flujos 2, 5

**Historia**:
Como Tomás o Agustín,
cuando quiero ver mis turnos próximos y pasados,
quiero una sección "Mis turnos" clara y organizada,
para saber cuándo y dónde juego sin tener que buscar en mis emails.

**Criterios de Aceptación**:

✅ Happy Path
- [ ] Dado que estoy autenticado, cuando accedo a "Mis turnos", entonces veo dos tabs: "Próximos" y "Historial".
- [ ] Dado que veo "Próximos", entonces cada reserva muestra: complejo, cancha, fecha, hora, precio, seña pagada (si aplica), y botón "Cancelar" (si es cancelable).
- [ ] Dado que veo "Historial", entonces cada reserva muestra: complejo, cancha, fecha, hora, status (completada/cancelada/no-show).
- [ ] Dado que hago click en una reserva próxima, cuando veo el detalle, entonces puedo: cancelar (según política), ver dirección del complejo, agregar al calendario.
- [ ] Dado que soy abonado, entonces mis turnos fijos aparecen con etiqueta "Turno fijo" y color diferenciado.

❌ Edge Cases
- [ ] Si no tengo reservas → "No tenés turnos próximos. ¡Buscá una cancha!" con link al marketplace.
- [ ] Si una reserva pasó y no fue marcada → aparece como "Completada" (auto-completed por el sistema).

🚫 Out of Scope
- NO incluye modificación de reserva (cancelar y re-crear)
- NO incluye historial de pagos detallado
- NO incluye compartir reserva con amigos

**Dependencias**: US-JUG-001
**Bloquea**: US-CAN-001

---

## US-JUG-003: Buscar Canchas Disponibles

**Epic**: App del Jugador
**Persona**: Tomás (Jugador Espontáneo)
**Prioridad**: P1 — Importante
**Flujo relacionado**: Doc 7, Flujo 2 (paso 1)

**Historia**:
Como Tomás,
cuando quiero jugar y no tengo complejo preferido,
quiero buscar canchas disponibles por zona, fecha y horario,
para encontrar dónde jugar sin llamar a cada complejo.

**Criterios de Aceptación**:

✅ Happy Path
- [ ] Dado que estoy en `turnogol.app/buscar`, cuando ingreso zona/ciudad + fecha + hora aproximada, entonces veo una lista de complejos con disponibilidad en ese horario.
- [ ] Dado que veo los resultados, entonces cada resultado muestra: nombre del complejo, dirección, precio, slots disponibles, y distancia (si compartí ubicación).
- [ ] Dado que hago click en un complejo, cuando veo su página, entonces veo la grilla de disponibilidad y puedo reservar directamente.
- [ ] Dado que filtro por precio, cuando muevo el slider, entonces los resultados se actualizan en tiempo real.

❌ Edge Cases
- [ ] Si no hay resultados → "No hay canchas disponibles para esa fecha y horario. Probá otro día u hora."
- [ ] Si la zona no tiene complejos registrados → "Todavía no tenemos complejos en esta zona. ¡Pronto!"
- [ ] Si no comparto ubicación → los resultados se muestran sin distancia (ordenados por relevancia/precio).

🚫 Out of Scope
- NO incluye mapa interactivo
- NO incluye recomendaciones basadas en historial
- NO incluye filtro por tipo de superficie o capacidad (v2)

**Dependencias**: US-ONB-005
**Bloquea**: Ninguna

---

## US-JUG-004: Complejo Favorito

**Epic**: App del Jugador
**Persona**: Tomás (Jugador Espontáneo)
**Prioridad**: P3 — Nice to Have
**Flujo relacionado**: Job secundario de Tomás — "Volver a un complejo que le gustó"

**Historia**:
Como Tomás,
cuando juego en un complejo que me gustó,
quiero marcarlo como favorito para acceder rápido a su disponibilidad,
para no tener que buscarlo cada vez.

**Criterios de Aceptación**:

✅ Happy Path
- [ ] Dado que estoy en la página de un complejo, cuando hago click en "★ Favorito", entonces se guarda en mi lista de favoritos.
- [ ] Dado que tengo favoritos, cuando accedo a "Mis complejos", entonces veo la lista con acceso directo a la página de cada uno.
- [ ] Dado que quiero quitar un favorito, cuando hago click en "★" de nuevo, entonces se remueve de mi lista.

❌ Edge Cases
- [ ] Si el complejo se desactiva o churna → desaparece de mi lista de favoritos con label "Ya no disponible".

🚫 Out of Scope
- NO incluye notificaciones de ofertas del complejo favorito
- NO incluye rating/review del complejo

**Dependencias**: US-JUG-001, US-ONB-005
**Bloquea**: Ninguna

---

# EPIC: NOTIFICACIONES (NOT)

---

## US-NOT-001: Sistema de Emails Transaccionales

**Epic**: Notificaciones
**Persona**: Sistema
**Prioridad**: P0 — Bloqueante
**Flujo relacionado**: Todos los flujos (efectos secundarios)

**Historia**:
Como el sistema,
cuando ocurre un evento que requiere notificar a un jugador o staff,
quiero enviar un email transaccional via el servicio de email (Resend/SendGrid),
para que las notificaciones lleguen de forma confiable.

**Criterios de Aceptación**:

✅ Happy Path
- [ ] Dado que un evento dispara una notificación (ver tabla de eventos abajo), cuando el mensaje se encola, entonces se envía via el servicio de email en <30 segundos.
- [ ] Dado que el email se envió, entonces se registra en tabla `notifications` con: tipo, destinatario, contenido, status (sent/failed), timestamp.
- [ ] Los emails usan templates HTML con branding de TurnoGol:
  - Magic link de autenticación (jugadores) / Verificación (staff)
  - Confirmación de reserva (al jugador + al complejo)
  - Cancelación (por jugador / por admin)
  - Expiración de reserva por timeout
  - Confirmación de abonado (alta / pausa / reactivación / cancelación)
  - Bienvenida al complejo (dueño)
  - Cierre de caja diario
  - Factura/recibo de suscripción
  - Notificaciones de trial (día 7, 14, 21, 28, 30, 31)
  - Dunning (cobro fallido de suscripción — día 0, 2, 5, 7, 14)
  - Pre-eliminación de cuenta (día 30, 55 post-cancelación)

❌ Edge Cases
- [ ] Si el servicio de email falla → enqueue con exponential backoff (30s, 1min, 5min, 15min). Si falla 4 veces → marcar como `failed` y notificar admin.
- [ ] Si el email no es válido → no enviar. Log: `notification.invalid_email`.
- [ ] Si el email rebota (inbox lleno, no existe) → marcar como `bounced`. No reintentar.
- [ ] Rate limiting: máximo 100 emails por hora por tenant (evitar spam si hay un bug).

🚫 Out of Scope
- NO incluye WhatsApp como canal de notificación (email only en v1)
- NO incluye SMS como canal alternativo
- NO incluye personalización de templates por complejo
- NO incluye opt-out por parte del jugador (v2)
- NO incluye email marketing / newsletters
- NO incluye tracking de apertura/clicks

**Dependencias**: Ninguna (infraestructura)
**Bloquea**: Todos los flujos que envían notificaciones

---

## US-NOT-002: Banner de Trial en Dashboard

**Epic**: Notificaciones
**Persona**: Marcelo (Dueño)
**Prioridad**: P0 — Bloqueante
**Flujo relacionado**: Doc 7, Flujo 7

**Historia**:
Como Marcelo, en período de trial,
cuando uso el dashboard de mi complejo,
quiero ver claramente cuántos días me quedan y cómo suscribirme,
para tomar la decisión de suscribirme antes de perder el acceso.

**Criterios de Aceptación**:

✅ Happy Path
- [ ] Dado que mi Tenant tiene status=`trial`, cuando veo el dashboard, entonces hay un banner fijo arriba: "Día {N} de 30 de tu prueba gratuita. [Suscribirme]"
- [ ] Dado que quedan 7 días o menos, cuando veo el banner, entonces cambia a color urgente (amarillo/naranja): "¡Quedan {N} días! Suscribite para no perder acceso."
- [ ] Dado que el trial venció, cuando intento acceder, entonces veo pantalla: "Tu prueba terminó. Tus datos están guardados 60 días. [Suscribirme] [Exportar datos]"
- [ ] Dado que me suscribí, cuando vuelvo al dashboard, entonces el banner de trial desaparece y muestra "Plan {nombre} ✅".

❌ Edge Cases
- [ ] Si el trial venció y no me suscribí → acceso en solo lectura por 60 días (BLOCKED), luego CHURNED día 91, DELETED día 98.
- [ ] Si el staff que ve el banner tiene el rol `manager` → el botón de suscripción está deshabilitado y dice "Suscripción restringida a administrador".

🚫 Out of Scope
- NO incluye countdown en tiempo real (se actualiza al cargar la página)
- NO incluye popup interrumpente o modal de suscripción forzada

**Dependencias**: US-ONB-002
**Bloquea**: US-SAS-001

---

## US-NOT-003: Notificaciones Internas para Admin

**Epic**: Notificaciones
**Persona**: Marcelo (Dueño) + Rodrigo (Recepcionista)
**Prioridad**: P1 — Importante
**Flujo relacionado**: Múltiples flujos

**Historia**:
Como Marcelo,
cuando ocurre algo importante en mi complejo (nueva reserva, cancelación, etc.),
quiero ver una notificación dentro del panel admin,
para estar al tanto sin depender exclusivamente del email.

**Criterios de Aceptación**:

✅ Happy Path
- [ ] Dado que estoy en el panel admin, cuando hay notificaciones no leídas, entonces el ícono de campana muestra un badge con el número.
- [ ] Dado que hago click en la campana, cuando veo el desplegable, entonces los eventos aparecen en orden cronológico con: tipo, descripción corta, timestamp.
- [ ] Eventos que generan notificación interna:
  - Nueva reserva online
  - Cancelación por jugador
  - No-show detectado
  - Diferencia de caja detectada
- [ ] Dado que hago click en una notificación, cuando me lleva al contexto relevante (reserva, abonado, caja), entonces la notificación se marca como leída.

❌ Edge Cases
- [ ] Si hay más de 50 notificaciones no leídas → mostrar "50+" en el badge.
- [ ] Si el admin no entra al panel en 7 días → no acumular indefinidamente (máximo 100 notificaciones, las más viejas se descartan).

🚫 Out of Scope
- NO incluye push notifications nativas (browser/mobile)
- NO incluye configuración de qué notificaciones recibir
- NO incluye notificaciones por email en tiempo real (email es solo para eventos específicos)

**Dependencias**: Ninguna
**Bloquea**: Ninguna

---

# EPIC: SAAS LIFECYCLE (SAS)

---

## US-SAS-001: Selección de Plan y Suscripción

**Epic**: SaaS Lifecycle
**Persona**: Marcelo (Dueño)
**Prioridad**: P0 — Bloqueante
**Flujo relacionado**: Doc 7, Flujo 7

**Historia**:
Como Marcelo,
cuando decido suscribirme a TurnoGol,
quiero elegir el plan adecuado y pagarlo con MercadoPago,
para tener acceso completo sin interrupciones después del trial.

**Criterios de Aceptación**:

✅ Happy Path
- [ ] Dado que estoy en Settings → Suscripción o hago click en "Suscribirme" del banner de trial, cuando veo la tabla de planes, entonces están: Predio (1-2 canchas), Complejo (3-5 canchas), Estadio (6+ canchas), con el plan que corresponde pre-seleccionado.
- [ ] Dado que selecciono un plan y ciclo (mensual/anual), cuando hago click en "Continuar al pago", entonces soy redirigido al checkout de MercadoPago para registrar mi medio de pago.
- [ ] Si selecciono anual → mostrar ahorro: "Ahorrás ${diferencia}/año (20% descuento)".
- [ ] Dado que el pago se aprobó via webhook, cuando se actualiza el sistema, entonces: TenantSubscription.status → `active`, Tenant.status → `active`.
- [ ] Dado que elegí plan anual, cuando se procesa, entonces `price_locked_until` se configura para proteger contra aumentos durante el año.
- [ ] Dado que la suscripción está activa, entonces el banner de trial desaparece y veo "Plan {nombre} ✅".

❌ Edge Cases
- [ ] Si elijo un plan inferior a mi cantidad de canchas → warning + opción de desactivar canchas extra.
- [ ] Si el pago de MP falla → "El pago no se procesó. Intentá con otro medio de pago." Subscription no se activa.
- [ ] Si el webhook tarda → mostrar "Estamos verificando tu pago..." con polling cada 10s.

🚫 Out of Scope
- NO incluye cupones de descuento
- NO incluye plan freemium
- NO incluye pago por transferencia directa

**Dependencias**: US-ONB-004, US-NOT-002
**Bloquea**: US-SAS-002

---

## US-SAS-002: Renovación Automática de Suscripción

**Epic**: SaaS Lifecycle
**Persona**: Sistema
**Prioridad**: P2 — Deseable
**Flujo relacionado**: Doc 7, Flujo 8

**Historia**:
Como el sistema,
cuando llega la fecha de renovación de la suscripción de un Tenant,
quiero que MP cobre automáticamente sin intervención del dueño,
para que el servicio sea ininterrumpido.

**Criterios de Aceptación**:

✅ Happy Path
- [ ] Dado que una TenantSubscription tiene `current_period_end` = hoy, cuando MP procesa el cobro recurrente, entonces se crea Payment con status=`approved` y se actualiza `current_period_start/end`.
- [ ] Dado que el cobro fue exitoso, entonces el dueño recibe email de confirmación con monto y próxima fecha de cobro.
- [ ] Dado que la renovación fue exitosa, entonces no hay interrupción del servicio.

❌ Edge Cases
- [ ] Si el cobro falla → se inicia el flujo de dunning (US-SAS-003).
- [ ] Si el plan anual se renueva → revisar si hay aumento de precio (aplicar nuevo precio si `price_locked_until` expiró).

🚫 Out of Scope
- NO incluye cambio de plan automático basado en uso
- NO incluye renovación con precio diferente por early renewal

**Dependencias**: US-SAS-001
**Bloquea**: US-SAS-003

---

## US-SAS-003: Dunning (Cobro Fallido de Suscripción)

**Epic**: SaaS Lifecycle
**Persona**: Sistema + Marcelo (Dueño)
**Prioridad**: P0 — Bloqueante
**Flujo relacionado**: Doc 7, Flujo 8

**Historia**:
Como el sistema,
cuando el cobro de la suscripción de un Tenant falla,
quiero ejecutar un proceso de escalamiento gradual con reintentos y notificaciones,
para recuperar el cobro sin perder al cliente por un problema temporal de medio de pago.

**Criterios de Aceptación**:

✅ Happy Path
- [ ] Dado que el cobro falla (día 0), cuando el webhook lo reporta, entonces: TenantSubscription.status → `past_due`, email al dueño con aviso y link para actualizar medio de pago.
- [ ] Dado que el segundo intento (día 2) también falla, entonces: banner en dashboard "⚠️ Pago pendiente", segundo email.
- [ ] Dado que el tercer intento (día 5) falla, entonces: llamada humana programada + último email.
- [ ] Dado que pasan 7 días sin pago, entonces: TenantSubscription.status → `suspended`. Admin en solo lectura. Jugadores siguen viendo reservas y recibiendo recordatorios. NO se generan nuevas instancias de abonados.
- [ ] Dado que pasan 14 días, entonces: status → `blocked`. Acceso totalmente bloqueado. Página pública: "No disponible temporalmente."
- [ ] Dado que pasan 90 días, entonces: status → `churned`. Datos archivados → eliminados a los 97 días.
- [ ] Dado que el dueño paga en cualquier momento del dunning, entonces: status → `active` inmediatamente. Acceso completo restaurado.

❌ Edge Cases
- [ ] Si el dueño actualiza el medio de pago y reintenta → MP cobra con el nuevo medio. Si aprobado → `active`.
- [ ] Si el dueño decide cancelar durante el dunning → se aplica US-SAS-005.
- [ ] Si hay abonados activos en un Tenant suspendido → el job de generación de instancias los saltea.

🚫 Out of Scope
- NO incluye plan de pagos o negociación de deuda
- NO incluye descuento por volver después del churn
- NO incluye extensión manual del período de gracia

**Dependencias**: US-SAS-002
**Bloquea**: Ninguna

---

## US-SAS-004: Upgrade/Downgrade de Plan

**Epic**: SaaS Lifecycle
**Persona**: Marcelo (Dueño)
**Prioridad**: P1 — Importante
**Flujo relacionado**: Doc 7, Flujo 7 (derivado)

**Historia**:
Como Marcelo,
cuando mi complejo crece y necesito más canchas de las que mi plan soporta,
quiero cambiar a un plan superior sin interrupciones,
para seguir operando sin tener que cancelar y re-suscribirme.

**Criterios de Aceptación**:

✅ Happy Path
- [ ] Dado que estoy en Settings → Suscripción, cuando hago click en "Cambiar plan", entonces veo la tabla de planes con mi plan actual marcado.
- [ ] Dado que selecciono un plan superior (upgrade), cuando confirmo, entonces: el cambio se aplica inmediatamente. El cobro proporcional del upgrade se procesa via MP (prorrateo del período restante).
- [ ] Dado que el upgrade se procesó, entonces puedo crear canchas adicionales inmediatamente.
- [ ] Dado que quiero hacer downgrade, cuando selecciono un plan inferior, entonces: veo warning si tengo más canchas de las que el nuevo plan soporta. El cambio se aplica al PRÓXIMO período (no inmediato).

❌ Edge Cases
- [ ] Si hago downgrade y tengo canchas extra → "Para cambiar al plan Predio, desactivá {N} canchas primero."
- [ ] Si hago upgrade con plan anual → el prorrateo considera el precio locked.
- [ ] Si el pago del prorrateo falla → el upgrade no se aplica. Mostrar error.

🚫 Out of Scope
- NO incluye prorrateo automático para downgrades (solo en el próximo ciclo)
- NO incluye planes custom negociados manualmente

**Dependencias**: US-SAS-001
**Bloquea**: Ninguna

---

## US-SAS-005: Cancelación Voluntaria de Cuenta

**Epic**: SaaS Lifecycle
**Persona**: Marcelo (Dueño)
**Prioridad**: P2 — Deseable
**Flujo relacionado**: Doc 7, Flujo 9

**Historia**:
Como Marcelo,
cuando decido dejar de usar TurnoGol,
quiero cancelar mi suscripción sabiendo exactamente qué va a pasar con mis datos,
para irme sin sorpresas y poder volver si cambio de opinión.

**Criterios de Aceptación**:

✅ Happy Path
- [ ] Dado que estoy en Settings → Suscripción → "Cancelar", cuando hago click, entonces veo la pantalla de retención con: resumen de lo que pierdo (reservas futuras, abonados activos) y pregunta de motivo.
- [ ] Dado que el motivo es "Muy caro", cuando veo la oferta de downgrade, entonces puedo aceptarla (cancelación abortada) o rechazarla y continuar.
- [ ] Dado que el motivo es "No lo uso", cuando veo la oferta de pausa de 1 mes, entonces puedo aceptarla o rechazarla.
- [ ] Dado que rechazo las ofertas y llego al paso final, cuando veo las consecuencias claras + checkbox + input de nombre del complejo, entonces al confirmar: TenantSubscription.status → `canceled`, suscripción de MP cancelada, acceso activo hasta fin del período pago.
- [ ] Dado que el período pago termina, cuando se bloquea el acceso, entonces: abonados cancelados + página pública: "Ya no está en TurnoGol."
- [ ] Dado que pasaron 60 días post-expiración (BLOCKED), entonces: status → `churned`. 7 días después: datos eliminados/anonimizados según Ley 25.326.
- [ ] Dado que quiero reactivar antes del churn, cuando hago click en "Reactivar", entonces creo nueva suscripción → datos restaurados → `active`.

❌ Edge Cases
- [ ] Si cancelo durante el trial → cancelación inmediata (no hay período pago).
- [ ] Si cancelo con plan anual a mitad de año → acceso hasta fin del año pago.
- [ ] Si quiero exportar datos antes → botón "Exportar datos" genera CSV descargable.
- [ ] Si soy recepcionista → no puedo cancelar (solo admin).
- [ ] Si hay reservas futuras post-expiración → se cancelan automáticamente. Jugadores notificados por email.

🚫 Out of Scope
- NO incluye reembolso del período restante
- NO incluye hibernación permanente sin pagar
- NO incluye exit interview obligatoria

**Dependencias**: US-SAS-001
**Bloquea**: Ninguna

---

# RESUMEN — MATRIZ COMPLETA DE USER STORIES

## Conteo Final por Epic

| Epic | Código | Stories | Prioridad |
|---|---|---|---|
| Onboarding | ONB | 5 | P0 |
| Reservas | RES | 6 | P0 |
| Cancelaciones | CAN | 4 | P0-P1 |
| Abonados | ABO | 5 | P1 |
| Caja y Pagos | CAJ | 5 | P0-P2 |
| Administración | ADM | 5 | P0-P2 |
| App del Jugador | JUG | 4 | P0-P3 |
| Notificaciones | NOT | 3 | P0-P1 |
| SaaS Lifecycle | SAS | 5 | P0-P1 |
| **TOTAL** | | **42** | |

## Mapa de Prioridades para Sprint Planning

### 🔴 P0 — Sin esto no se puede lanzar (23 stories)

```
ONB-001  Registro                    ONB-002  Wizard
ONB-004  MercadoPago                 ONB-005  Página pública
RES-001  Grilla admin                RES-002  Reserva manual
RES-003  Reserva online (seña)       RES-004  Reserva online (sin seña)
RES-005  Timer expiración            RES-007  Completar reserva
CAN-001  Cancelar en plazo           CAN-002  Cancelar fuera plazo
CAN-003  Admin cancela               CAJ-001  Pago manual
CAJ-002  Vista caja                  ADM-001  CRUD canchas
ADM-002  Políticas                   ADM-003  Staff
ADM-005  Horarios/feriados           JUG-001  Autenticación
JUG-002  Mis reservas                NOT-001  Emails transaccionales
SAS-001  Suscripción
```

### 🟡 P1 — Importante, puede ir en sprints 2-3 (15 stories)

```
ONB-003  Checklist                   CAN-004  Ban no-show
ABO-001  Crear abonado               ABO-002  Generación rolling
ABO-003  Pausar/reactivar            ABO-004  Cancelar abonado
ABO-005  Saldo a favor (REVERTIDO)   JUG-ADM-001 Módulo jugadores (bans)
CAJ-003  Cierre de caja              CAJ-005  Reportes
JUG-003  Buscar canchas              NOT-002  Banner trial
NOT-003  Notificaciones internas     SAS-003  Dunning
SAS-004  Upgrade/downgrade
```

### 🟢 P2 — Deseable, puede ser post-lanzamiento (4 stories)

```
CAJ-004  Venta cantina               ADM-004  Productos
SAS-002  Renovación automática       SAS-005  Cancelación voluntaria
```

### ⚪ P3 — Nice to have (1 story)

```
JUG-004  Complejo favorito
```

## Cross-reference: Persona → Stories

| Persona | Stories donde es protagonista |
|---|---|
| **Marcelo** (Dueño) | ONB-001,002,003,004 · ADM-001,002,003,004,005 · ABO-001,003,004,005 · CAJ-002,003,005 · SAS-001,003,004,005 · NOT-002 |
| **Rodrigo** (Recepcionista) | RES-001,002,007 · CAJ-001,002,003,004 · CAN-003,004 · ADM-003 · NOT-003 · JUG-ADM-001 |
| **Agustín** (Abonado) | JUG-001,002 · CAN-001 |
| **Tomás** (Espontáneo) | ONB-005 · RES-003,004 · JUG-001,002,003,004 · CAN-001,002 |
| **Sistema** (Jobs) | RES-005 · ABO-002 · NOT-001 · SAS-002,003 |

---

> [!IMPORTANT]
> **Fin del Doc 8.** 42 user stories organizadas en 9 epics, con prioridades,
> criterios de aceptación Given/When/Then, edge cases explícitos, out of scope,
> dependencias, y cross-references a personas y flujos del Doc 7.
> Este documento es la entrada directa para crear tickets en el backlog del proyecto.
