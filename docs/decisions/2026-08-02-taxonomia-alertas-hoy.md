# Taxonomía de alertas de "Hoy" (Fase 2 del contrato v2)

**Fecha:** 2026-08-02
**Estado:** Decidida (dueño: Lazar) — implementada. **Enmendada el 2026-08-23** (cuarto evento: devoluciones) y **el 2026-09-19** (sale "turno sin cobrar"; ver la última enmienda).
**Migraciones:** ninguna (todo se computa en vivo sobre tablas existentes + 1 flag jsonb en `tenants.settings`)
**Origen:** criterio de ENTRADA bloqueante de Fase 2, `docs/planning/2026-08-01-decisiones-de-fase-v2.md` §3 ("taxonomía de alertas cerrada por escrito, lista finita de eventos y alertas, con prioridad y umbral cada una"). El pase crítico (`docs/planning/2026-08-01-vision-v2-pase-critico.md:115`) marca esto como bloqueante explícito: *"Sin taxonomía, Hoy degenera en bandeja de notificaciones — exactamente lo que vino a matar."*

## Problema

El contrato de Fase 2 (`decisiones-de-fase-v2.md:106`) exige "Alertas v1 operativas: caja de ayer sin cerrar, turno terminado sin cobrar, seña fallida" dentro del bloque "Necesita tu atención" de la pantalla Hoy. Nombrar los 3 eventos no alcanza: sin prioridad relativa (orden de aparición) ni umbral (cuándo empieza a molestar), cada implementación inventa su propio criterio — es exactamente la inconsistencia que la Fase 0 (gramática de interacción) vino a eliminar, aplicada ahora a alertas en vez de a inputs de plata o confirmaciones.

## Decisión

**Lista cerrada de 3 eventos v1, sin backlog abierto a "cualquier anomalía futura".** Un cuarto evento requiere volver a este documento, no agregarse ad-hoc en código.

| # | Evento | Prioridad | Umbral | Fuente de datos | Acción al lado |
|---|---|---|---|---|---|
| 1 | **Turno terminado sin cobrar** | P1 (plata activamente en fuga — el cliente se puede ir del mostrador sin que nadie se lo pida) | **Inmediato, sin ventana de gracia**: apenas el booking pasa a `completed` con saldo pendiente > 0, hoy (día operativo) | Filtro sobre `getStreetMoney` (Fase 1, `street-money.service.ts`) — `origin='booking' AND date=hoy`, NUNCA una query nueva | "Cobrar $X" → `/reservas/[id]` |
| 2 | **Seña que falló** | P2 | Inmediato — un pago rechazado es un evento discreto, no hay espera prudencial razonable | `payments` WHERE `status IN ('rejected','canceled')` AND `type='deposit'` AND `p.id = b.payment_id` (solo si sigue siendo el pago ACTIVO del booking — un reintento exitoso posterior no debe dejar la alerta colgada), ocurrido hoy (rango `operatingDayRangeUtc`, nunca UTC calendario puro) | "Ver reserva" → `/reservas/[id]` |
| 3 | **Caja de ayer sin cerrar** | P3 (no crece con el tiempo — problema de higiene contable ya contenido, no plata que sigue fugándose) | Binario: hubo apertura o actividad el día operativo `hoy−1` Y no existe `daily_cash_closes` para esa fecha. **Alcance v1 explícito: solo mira T-1**, no un backlog de N días sin cerrar | `daily_cash_opens`/`daily_cash_closes` vía `daily-close.service.ts`, mismo patrón que ya usa `dashboard/queries.ts` para HOY | "Cerrar caja de ayer" → `/caja` |

## Enmienda 2026-08-23 — cuarto evento: devoluciones de seña pendientes

Este documento exige por escrito volver acá antes de agregar un cuarto evento. Se agrega uno.

**Qué cambió afuera:** el reembolso automático de señas vía API de MercadoPago no funciona y probablemente nunca funcione — MP deriva los permisos del PRODUCTO de la aplicación y ninguna de las tres probadas concede `payments:refunds`; medido en producción, ningún reembolso automático se completó jamás. La devolución la hace el complejo a mano, así que necesita enterarse de que la debe.

| # | Evento | Prioridad | Umbral | Fuente de datos | Acción al lado |
|---|---|---|---|---|---|
| 4 | **Devoluciones de seña pendientes** | **P2**, arriba de "seña que falló" y debajo de "turno sin cobrar" | Inmediato para las que nunca pasaron por MercadoPago (no tienen ningún camino automático que las resuelva); **1 hora** para las de MercadoPago — el mismo intervalo que espera `retry-refunds.worker` antes de reintentar, para que la alerta nunca aparezca por algo que el sistema todavía podría resolver solo | `countPendingRefunds` (`refund.service.ts`): `payments` WHERE `type='refund' AND status='pending'`. **Tenant-wide, sin filtro por fecha** | "Gestionar" → `/caja/devoluciones` |

**Por qué P2 y no P1:** una devolución no tiene una ventana que se cierre como el turno sin cobrar, donde el cliente está en el mostrador AHORA y se puede ir. Pero a diferencia de la caja sin cerrar (P3), el daño sí crece con los días: del otro lado hay una persona esperando plata.

**Es UN ítem agregado, no una fila por devolución.** Esta es la parte que más se aparta de los tres eventos originales y la razón está en el propio espíritu del documento: los tres son anomalías "de hoy" que caducan solas. Una devolución pendiente no caduca — con tres meses sin tildar, N filas convertirían "Necesita tu atención" en la bandeja de notificaciones que esta taxonomía vino a evitar. Se muestra `"3 devoluciones pendientes — $12.000 a devolver"` en una sola línea, como `yesterday_cash_unclosed`.

**Sigue siendo una lista cerrada.** Un quinto evento requiere volver acá otra vez.

**Orden dentro de "Necesita tu atención":** prioridad P1→P3 primero, antigüedad ascendente dentro de cada prioridad (mismo criterio de ordenamiento que `getStreetMoney.sort`).

**Estado vacío (copy exacto del contrato, verbatim — no parafrasear):** *"Nada pendiente. Todo cobrado y cerrado."*

**Umbral de "turno sin cobrar" — la decisión que el pase crítico marcaba sin resolver** (¿alarma al terminar o a los 30 min?): Lazar confirmó **inmediato**. Razón registrada: `auto_complete_minutes` (configurable por tenant) ya es el retraso entre el fin real del turno y el pase a `completed` — sumarle una segunda ventana de gracia encima retrasaría el aviso justo cuando el cliente todavía está en el mostrador, contra el principio P6 ("el sistema avisa antes de que lo descubras solo").

## Enmienda 2026-09-19 — "turno terminado sin cobrar" sale de las alertas

Este documento exige volver acá para tocar la lista; se toca.

**Qué cambió afuera:** Hoy pasó a ser la pantalla del mostrador (`docs/decisions/2026-09-19-hoy-cobrar-y-vender.md`). Su tablero "Turnos de hoy" muestra, cancha por cancha, cada turno que terminó y falta plata (borde rojo, "Falta $X", "Cobrar"), y **cada fila abre el modal de cobro** en la misma pantalla. Dejar además una alerta para el mismo turno era decir la misma cosa en dos lugares, y una de las dos era un link a otra pantalla.

**Qué se decide:** el evento **#1 "Turno terminado sin cobrar" deja de ser una alerta**. No se abandona la regla ni su umbral (**inmediato, sin ventana de gracia**, decisión de Lazar que sigue vigente): se muda de lugar. La fila sin cobrar del tablero aparece apenas el turno termina o pasa a `completed` con saldo, con el saldo de `summarizeBookingCharges` (el mismo número de la Grilla, del detalle y de Deudas), y **va fija arriba, nunca detrás de "Ver N más"**.

**Lista vigente de "Necesita tu atención": dos eventos**, en este orden de prioridad (`ATTENTION_PRIORITY`): devoluciones de seña pendientes (P1 desde esta enmienda) y seña que falló (P2). "Caja de ayer sin cerrar" ya no existe (`2026-09-11-eliminar-caja-del-dia.md`). La lista sigue siendo **cerrada**.

**Estado vacío:** *"Nada pendiente. Sin señas rechazadas ni devoluciones por resolver."* El copy anterior ("Todo cobrado y cerrado") pasó a mentir: con el turno sin cobrar fuera del bloque, un bloque vacío ya no significa que esté todo cobrado.

**Por qué no se rompe el "principio P6"** (avisar antes de que lo descubras solo): el aviso ahora es más fuerte, no más débil — la fila roja está en la pantalla donde está parado el que cobra, y un toque abre el cobro.

## Enmienda 2026-09-24 — el vacío no se dibuja y la fila pasa a "Por cobrar"

Decisión de Lazar en la sesión del pulido de Hoy (2026-09-24): pidió el "Por cobrar" en ámbar y eligió sacar el vacío y bajar la checklist. El hallazgo que lo motivó es el P1 de la crítica `.impeccable/critique/2026-09-23T21-25-51Z__src-app-admin.md`.

**Estado vacío: no se dibuja nada.** La línea verde "Nada pendiente…" quedaba en el primer renglón de la pantalla del mostrador diciendo "todo en orden" justo arriba de los turnos que faltaba cobrar. El bloque sigue siendo una lista cerrada; con cero eventos, simplemente no está. Se deja sin efecto el copy verbatim del estado vacío de la enmienda anterior (y la constante `ATTENTION_EMPTY_COPY` que lo custodiaba).

**La fila del tablero ya no es roja.** El turno terminado con saldo se muestra "Por cobrar", en ámbar (`PENDING_CHARGE_BADGE` en `slot-visual.ts`): en el Vagón el primer pago llega en la mediana 29 minutos después del partido (`docs/rediseno-panel/insumos.md`), así que es lo normal y no una alarma ni una deuda (principio 3 de `PRODUCT.md`). El umbral no cambia: la fila aparece apenas el turno termina. La celda de la Grilla, su leyenda y la pastilla de Reservas todavía dicen "Sin cobrar" en rojo; unificarlas es un pase aparte. El modal de cobro sí cambia en todos lados, porque la Grilla y el detalle de la reserva usan el mismo: "Falta cobrar" en ámbar y el botón parcial dice "quedan $X por cobrar" en vez de "de deuda".

## Alternativas descartadas

- **Ventana de gracia de 30 min en "turno sin cobrar"** (la opción que el pase crítico ofrecía como ejemplo): descartada por Lazar — el costo de avisar de más es menor que el costo de un cobro perdido por aviso tardío.
- **"Caja sin cerrar" con backlog de N días** (alarmar por cada día abierto sin cerrar, no solo ayer): fuera de alcance v1 — si el contrato lo pide más adelante es un fast-follow aditivo (misma query, sin `LIMIT 1` día), no un rediseño.
- **Alertas adicionales mencionadas en la visión pero no en el contrato de salida** ("cliente en su segundo no-show", "conexión de MP caída" como evento propio distinto de "seña fallida"): NO entran a v1 — el criterio de salida de Fase 2 nombra exactamente 3, y agregar una cuarta sin pasar por este documento es el "bandeja de notificaciones" que el pase crítico advierte.

## Alcance de implementación

Ver `docs/planning/planes de implementación` de Fase 2 (sesión 2026-08-02) — módulo nuevo `src/modules/home/` (`home.service.ts`/`home.lib.ts`/`home.types.ts`), sin migración de schema.

## Reversibilidad

Alta — ninguna de las reglas está persistida; son filtros en `home.service.ts`. Cambiar un umbral (ej. agregar ventana de gracia a "turno sin cobrar" si en uso real resulta ruidoso) es un cambio de función + su test, sin tocar datos.

## Consecuencias aceptadas

- "Turno sin cobrar" puede alarmar en casos donde el staff ya está cobrando en el momento exacto en que el booking pasa a `completed` (falso-positivo de segundos, no de minutos) — aceptado, el costo de omitir es mayor.
- "Caja de ayer sin cerrar" no escala a un tenant que arrastra varios días sin cerrar — v1 solo repara la higiene del día inmediato anterior, no historiza. Documentado, no silencioso.
