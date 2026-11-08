# Spec: editar un turno fijo para todas sus fechas futuras

> Estado: diseño, sin implementar. Preguntas abiertas al final (REQUIERE INPUT).

## Contexto

`/abonados` solo permite cancelar o reactivar un turno fijo (`AbonadosList.tsx`). Para cambiar precio, cliente u horario hay que cancelar y volver a crear: se pierden las fechas, y cancelar con fechas cobradas es un riesgo aparte (`cash_flows.booking_id` sin `ON DELETE`). Cada sesión se puede editar o reprogramar sola (`booking.edit.ts`, `booking.reschedule.ts`) y esos diálogos ya avisan "vale solo para esta fecha". Falta el equivalente para "todas las fechas".

## Qué se verificó en el código

- Un fijo = fila `abonados` + una `bookings` `type='fixed'` por semana. Alta: 8 semanas (`count: 8`, `abonado.service.ts:263`). Worker diario 06:00: si quedan menos de 4 futuras, suma 4 más (`generate-abonado-slots.worker.ts:84`). **El worker lee la fila `abonados` cada vez**, así que editar la fila ya corrige las sesiones que se generen de ahí en más. Lo que hay que resolver es solo lo ya generado.
- Cada sesión nace con `price_snapshot = abonados.price_per_session`, `guest_name = contact_name` (solo si no hay `player_id`), `deposit_status = not_required`. **Ni el alta ni el worker copian `guest_phone`**: el teléfono vive solo en `abonados.contact_phone`. `guest_phone` lo leen deudas, WhatsApp y cancelación (`booking.debts.ts`, `booking.whatsapp.ts`, `booking.cancellation.ts`), así que los fijos probablemente aparecen sin teléfono ahí. Hallazgo aparte, ver pregunta 6.
- Edición de una sesión (`booking.edit.ts`): permite nombre/teléfono (solo invitado), precio (`priceOverride`) y duración. El precio se escribe con el marcador `set_config('app.booking_edit','on',true)` y solo en `confirmed` (migr. 089). No deja bajar el precio por debajo de lo cobrado (`collectedSoFar`, `BookingPriceBelowPaidError`).
- Reprogramar una sesión (`booking.reschedule.ts`): UPDATE del mismo `id` (conserva cobros y audit), cancha destino lockeada primero y después el booking, `assertSlotFreeForOther`, `physicalRange` + `slotIsPhysicallyNextDay`, y **conserva el precio de la sesión `fixed`**. Aplica `assertDateWindow` con `booking_advance_days` (default 6): **no sirve para una edición masiva** de 8 semanas.
- Conflictos: `no_overlapping_abonados` (migr. 004:215, EXCLUDE gist por cancha + día + rango horario, `WHERE status='active'`) y `checkAbonadoSlotConflict(... excludeId)` ya existe y excluye al propio fijo. Para las sesiones, `findAbonadoBookingOverlaps` **no** excluye las del propio fijo; hay que usar el patrón `id <> / abonado_id <> ` de `assertSlotFreeForOther`.
- "Con cobro" se mide como `collectedSoFar > 0` (`cash_flows` `type='income'`, `category='booking'`). No hay marca en `bookings`.
- Veto: abonados solo `price_per_session`. Nada de precio mensual ni crédito. `chk_abonado_price_positive` exige > 0 en el fijo (una sesión suelta sí puede valer 0).

## Alcance

**v1 (recomendado):** precio por turno, nombre y teléfono del cliente.
**v2 (spec abajo, se implementa después):** día, horario y cancha.
Fuera: cambiar o desvincular el jugador (`player_id`), `starts_on`/`ends_on`, método de pago (sin efecto hoy), pasar de fijo a otra cosa.

Solo se edita un fijo `active`. Los `paused` son filas viejas (pausar se eliminó) y los `canceled` no vuelven.

## Qué pasa con las fechas ya generadas

"Futuras" = `status = 'confirmed'` y `starts_at >= now` (instante físico, no `date`, igual que `cancelAbonado`). Las pasadas, completadas, no-show y canceladas no se tocan nunca.

### Precio
| Sesión futura | Qué pasa |
|---|---|
| Sin cobro y con el precio viejo del fijo | Se actualiza al nuevo |
| Con precio propio (promo, feriado, corregido a mano: `price_snapshot` distinto del precio viejo del fijo) | **No se toca.** Se cuenta y se informa. Es lo que el dueño decidió el 2026-09-15 al permitir corregir una fecha |
| Con cobro parcial o total y precio nuevo mayor o igual a lo cobrado | Se actualiza. Queda saldo pendiente por la diferencia |
| Con cobro y precio nuevo menor a lo cobrado | No se toca (mismo criterio que `BookingPriceBelowPaidError`). Se informa |

El precio se escribe con el marcador `app.booking_edit` por sesión (la migración 089 ya lo permite, no hace falta migración). Orden de locks: bookings futuras `FOR UPDATE` primero y recién ahí `collectedSoFar`, para que un cobro concurrente no se cuele entre el cálculo y el UPDATE.

### Cliente y teléfono
- Siempre se actualiza `abonados.contact_name` / `contact_phone` (el worker lo usa para las que vengan).
- Si el fijo no tiene `player_id`: las sesiones futuras cuyo `guest_name` sea igual al nombre viejo pasan al nuevo. Si alguien corrigió el nombre de una fecha a mano (distinto del viejo), no se pisa.
- Si tiene `player_id`: el nombre visible sale de la cuenta del jugador, no se cambia nada en las sesiones. La UI avisa que el nombre de contacto no cambia lo que ve el jugador.
- Teléfono en sesiones: ver pregunta 6.

### Día, horario y cancha (v2)
- **Todo o nada.** Si alguna fecha futura choca, no se mueve ninguna y se devuelve la lista de fechas en conflicto. Mover solo algunas dejaría el fijo con dos horarios a la vez y el worker no lo distingue (cuenta por fecha, no por horario).
- Conflicto = (a) otro fijo `active` en el nuevo día/horario/cancha, vía `checkAbonadoSlotConflict(..., excludeId = este fijo)`; (b) alguna sesión no cancelada, `id` y `abonado_id` distintos, que se solape en la cancha destino (`tstzrange(starts_at, ends_at)`); (c) el nuevo día cae en `closed_dates`; (d) la fecha pasa el corte del período pago (`paidPeriodCutoff`).
- Se mueven todas las futuras, **con y sin cobro**: es un UPDATE del mismo `id`, así que cobros y audit quedan atados. El precio no cambia.
- Bulk propio, no `rescheduleBooking` x8: sin `assertDateWindow`, un solo cálculo de `slotIsPhysicallyNextDay` (misma regla que `insertBookingsForSlots`), `physicalRange` por fecha, las seis columnas del slot juntas (`court_id`, `date`, `time_start`, `time_end`, `starts_at`, `ends_at`).
- Lock: `lockCourtRow` de la cancha destino y después de la origen si es otra (siempre en orden de `id` para evitar deadlock entre dos ediciones cruzadas), antes de lockear bookings.
- Cambiar el día de la semana corre cada fecha al día nuevo más cercano posterior a la sesión vieja; las que quedarían en el pasado se descartan del conteo.
- Duración: se conserva la del fijo. Cambiarla es una opción futura (los eventos de varias horas del staff tienen precio por suma de horas, ahí el precio ya no es un solo número).
- Sin mails por sesión (sería un `booking_rescheduled` x8 al mismo jugador). Ver pregunta 4.
- `rival_matches.booking_id` es `ON DELETE SET NULL`, no depende de la fecha. Verificar al implementar que mover una sesión con partido RIVAL asociado no rompe el sello.

## Diseño técnico

### Servicio (`src/modules/abonados/abonado.service.ts`)
```
updateAbonado(tenantId, abonadoId, staffUserId, input: UpdateAbonadoInput, tx)
  → { abonado, updated: number, keptOwnPrice: number, keptPaid: number, moved?: number }
previewUpdateAbonado(tenantId, abonadoId, input, tx)   // solo lectura, mismos conteos + conflictDates
```
Pasos: leer y validar (`AbonadoNotFoundError`, `AbonadoAlreadyCanceledError`, nuevo `AbonadoNotEditableError` si no está `active`) → si hay cambio de slot, `lockCourtRow` → `SELECT ... FOR UPDATE` de las futuras → aplicar reglas de arriba → `UPDATE abonados` → audit `abonado.updated` con `{changed: {campo: [viejo, nuevo]}, updated, keptOwnPrice, keptPaid, moved}` → `invalidateAvailSearch` de cada fecha tocada (solo v2).
Preview y update comparten una función pura de clasificación para que el conteo de la pantalla nunca contradiga lo que se aplica.

### Schema (`abonado.schema.ts`)
`updateAbonadoSchema`: todos opcionales, al menos uno presente. `pricePerSession: moneyCents` (> 0), `contactName: boundedText(120).min(1)`, `contactPhone: boundedText(40).min(1)`. v2 suma `courtId`, `dayOfWeek`, `timeStart`, `timeEnd`. Vive en el módulo, no en `actions.ts` (`'use server'` solo exporta funciones async).

### Server Actions (`src/app/(admin)/abonados/actions.ts`)
`previewUpdateAbonadoAction` (balde `adminAvailabilityCheck`, dispara en vivo) y `updateAbonadoAction` (`requireOperatorStaff`, `adminRateLimited`, el catch FUERA de `withTenantContext`, igual que `cancelAbonadoAction`). Manager puede editar (mismo permiso que cancelar). `revalidatePath('/abonados')` y `'/grilla'`.

### UI
- Botón "Editar turno fijo" junto a "Cancelar turno fijo" en fila y card, solo `active`. Las acciones llegan por prop (regla de Storybook del archivo).
- `AbonadoEditDialog.tsx` lazy como `AbonadoDialogs`. Campos: Precio por turno (`MoneyInput`), Nombre, Teléfono. Con el dato cambiado muestra la vista previa en vivo (cuántas fechas cambian, cuántas se mantienen y por qué). Confirmar sin frase de seguridad: es reversible volviendo a editar.
- Dentro de `BookingEditDialog` y `BookingRescheduleDialog`, cuando es sesión de fijo, un link "Cambiar todas las fechas" a `/abonados`.
- v2: sección "Día, horario y cancha" colapsada, con la lista de conflictos si los hay.

## Textos (skill `turnogol-copy`)

Siempre "turno fijo" (nunca "abonado" ni "contrato"). "Esta fecha" y "todas las fechas" nunca intercambiables.

| Dónde | Texto |
|---|---|
| Botón de la lista | Editar turno fijo |
| Título del diálogo | Editar el fijo de {cliente} ({día} {hora}) |
| Bajada | Los cambios valen para todas las fechas que vienen. Las fechas pasadas no cambian. |
| Etiquetas | Precio por turno · Nombre · Teléfono |
| Aviso si tiene jugador | Este fijo está a nombre de una cuenta. El nombre que ve el jugador sale de su cuenta. |
| Vista previa | El precio cambia en {n} fechas. |
| Vista previa, precio propio | {n} fechas se quedan con el precio que les pusiste a mano. |
| Vista previa, cobradas | {n} fechas ya tienen cobros por más que el precio nuevo. Se quedan como están. |
| Sin cambios | No cambiaste nada. |
| Botón | Guardar en todas las fechas |
| Toast | Turno fijo actualizado. Cambió en {n} fechas. |
| Error: no activo | Solo se puede editar un turno fijo activo. |
| Error: no existe | No encontramos ese turno fijo. |
| v2 conflicto | No se puede mover porque estas fechas están ocupadas: 12/11, 19/11. Liberalas o elegí otro horario. |
| v2 botón | Mover todas las fechas |
| En editar una sola fecha (existente, ajustar) | Vale solo para el {fecha}. Las otras semanas siguen igual. **Cambiar todas las fechas** |
| En reprogramar una sola fecha (existente, ajustar) | Se mueve solo este turno. Las otras semanas no cambian. |

Sin `--`, `—`, `–` ni dos puntos como separador. Hay que retocar también el banner de `AbonadosList.tsx:149-164` para que mencione que se puede editar todo el fijo.

## Plan de pasos

1. **Decisiones** (abajo): cerrar las preguntas 1 a 3 antes de tocar código.
2. **Servicio v1** (`updateAbonado` + `previewUpdateAbonado` + clasificación pura), `UpdateAbonadoInput`, `AbonadoNotEditableError`, schema. Tests de integración: precio con/sin cobro/con precio propio, nombre con y sin jugador, tenant ajeno (isolation), fijo cancelado, concurrencia (cobro durante la edición).
3. **Server Actions** y tests de actions (guard, rate-limit, errores mapeados).
4. **UI v1**: `AbonadoEditDialog`, botones fila y card, links desde los diálogos de una fecha, textos, stories (`AbonadoDialogs.stories.tsx` como modelo) y retoque del banner.
5. **Verificación UX** (`sonnet-ux-verifier`): fijo con una fecha cobrada, una con precio propio y una normal; 390 px.
6. **v2** como PR aparte: bulk de movimiento, preview de conflictos, tests con `closes_next_day`, corte de período pago, dos fijos cruzados, `no_overlapping_abonados` por 23P01 (mapear a `AbonadoConflictError`).
7. **Hallazgo `guest_phone`** (pregunta 6) en su propio fix.

DoD en cada PR: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm knip` + `pnpm test` y `pnpm test:integration` del módulo, con output pegado. Sin migración en v1 ni en v2 (el marcador de 089 ya cubre el precio y el movimiento no toca `price_snapshot`).

## Decisiones tomadas (2026-11-08, Lazar)

1. Fechas con precio puesto a mano: **se respetan**; el aviso dice cuántas.
2. Fechas con cobro: **se actualizan** si el precio nuevo es mayor o igual a lo cobrado (queda saldo); si es menor, no se tocan.
3. Día, horario y cancha: **entran en esta entrega** (ya no hay v2 aparte), **todo o nada** si alguna fecha choca. Más riesgo, así que el paso de tests de movimiento no se saltea.
4. Aviso al jugador: **ninguno**.
5. Desde cuándo: **siempre desde hoy**, sin selector.
6. Teléfono: **bug aparte** (alta y worker copian `guest_phone`) y la edición lo propaga a las fechas futuras de un fijo sin jugador.
7. Cuenta de jugador del fijo: **no se cambia ni se desvincula** en esta versión.

Efecto sobre el plan: los pasos 2 a 5 incluyen día, horario y cancha (lo que arriba se llama v2); el paso 6 pasa a ser "tests y verificación del movimiento" dentro del mismo PR o de un segundo commit del mismo esfuerzo, y el paso 7 (`guest_phone`) sigue siendo su propio fix.

## REQUIERE INPUT

Ninguna pendiente. Quedan solo cosas a verificar al implementar: mover una sesión con partido RIVAL asociado, y si deudas/WhatsApp realmente muestran fijos sin teléfono.
