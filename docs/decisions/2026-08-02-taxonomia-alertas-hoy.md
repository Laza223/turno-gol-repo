# Taxonomía de alertas de "Hoy" (Fase 2 del contrato v2)

**Fecha:** 2026-08-02
**Estado:** Decidida (dueño: Lazar) — implementación en curso
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

**Orden dentro de "Necesita tu atención":** prioridad P1→P3 primero, antigüedad ascendente dentro de cada prioridad (mismo criterio de ordenamiento que `getStreetMoney.sort`).

**Estado vacío (copy exacto del contrato, verbatim — no parafrasear):** *"Nada pendiente. Todo cobrado y cerrado."*

**Umbral de "turno sin cobrar" — la decisión que el pase crítico marcaba sin resolver** (¿alarma al terminar o a los 30 min?): Lazar confirmó **inmediato**. Razón registrada: `auto_complete_minutes` (configurable por tenant) ya es el retraso entre el fin real del turno y el pase a `completed` — sumarle una segunda ventana de gracia encima retrasaría el aviso justo cuando el cliente todavía está en el mostrador, contra el principio P6 ("el sistema avisa antes de que lo descubras solo").

## Alternativas descartadas

- **Ventana de gracia de 30 min en "turno sin cobrar"** (la opción que el pase crítico ofrecía como ejemplo): descartada por Lazar — el costo de avisar de más es menor que el costo de un cobro perdido por aviso tardío.
- **"Caja sin cerrar" con backlog de N días** (alarmar por cada día abierto sin cerrar, no solo ayer): fuera de alcance v1 — si el contrato lo pide más adelante es un fast-follow aditivo (misma query, sin `LIMIT 1` día), no un rediseño.
- **Alertas adicionales mencionadas en la visión pero no en el contrato de salida** ("cliente en su segundo no-show", "conexión de MP caída" como evento propio distinto de "seña fallida"): NO entran a v1 — el criterio de salida de Fase 2 nombra exactamente 3, y agregar una cuarta sin pasar por este documento es el "bandeja de notificaciones" que el pase crítico advierte.

## Alcance de implementación

Ver `docs/planning/planes de implementación` de Fase 2 (sesión 2026-08-02) — módulo nuevo `src/modules/home/` (`home.service.ts`/`home.lib.ts`/`home.types.ts`), sin migración de schema.

## Reversibilidad

Alta — ninguna de las 3 reglas está persistida; son filtros en `home.service.ts`. Cambiar un umbral (ej. agregar ventana de gracia a "turno sin cobrar" si en uso real resulta ruidoso) es un cambio de función + su test, sin tocar datos.

## Consecuencias aceptadas

- "Turno sin cobrar" puede alarmar en casos donde el staff ya está cobrando en el momento exacto en que el booking pasa a `completed` (falso-positivo de segundos, no de minutos) — aceptado, el costo de omitir es mayor.
- "Caja de ayer sin cerrar" no escala a un tenant que arrastra varios días sin cerrar — v1 solo repara la higiene del día inmediato anterior, no historiza. Documentado, no silencioso.
