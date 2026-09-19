# Hoy es la pantalla del mostrador: cobrar turnos en un modal, vender al lado, y el Encargado la ve

**Fecha**: 2026-09-19 · **Estado**: implementada — PR1 (roles), PR2 (tablero + modal de cobro +
refresco automático) y PR3 (columna Vender) aplicados · **Decide**: el dueño (las cuatro decisiones
de abajo) + esta sesión (cómo)

## Origen

Fricción observada en un cliente real, registrada en `docs/gtm/ejecucion/10-aprendizajes.md`
(2026-09-19): cuando un complejo termina uno o más turnos en el mismo horario y va a cobrarlos, el
camino actual lo saca de la vista y no le da todo lo que necesita en el momento. Medido en código:

- Cada fila de "Próximos turnos" y la alerta "Cobrar $X" de Hoy son un link a `/reservas/[id]`
  (`ProximosTurnos.tsx`, `NeedsAttention.tsx`), y el "Volver" de ese detalle va a `/reservas`, no a Hoy.
- El detalle no divide por equipo ni tiene "Pagó uno": eso vive solo en el panel de la grilla
  (`BookingSlotPanel`) y en `CompleteBookingDialog`.
- El panel de la grilla se cierra después de cada cobro, así que cobrar jugador por jugador obliga a
  reabrirlo por cada uno.
- Para vender cantina hay que ir a `/caja` y volver.

## Qué se decide

1. **El Encargado (`manager`) ve Hoy.** Es quien suele estar en el mostrador de noche. El checklist de
   arranque y el tour de Hoy siguen siendo solo del dueño. Antes: D5
   (`docs/planning/2026-08-01-decisiones-de-fase-v2.md`) la hizo solo-admin y el manager rebotaba a `/grilla`.
2. **El Encargado deja de ver Métricas.** `/analiticas` pasa a `requireAdminStaff()` y sus dos APIs
   (`/api/admin/metrics`, `/api/reports/revenue`) a `{ roles: ['admin'] }`. Las métricas del negocio son
   sensibles y el Encargado opera el día a día. Se borra `withAnyRole` (quedó sin usos).
3. **Hoy pasa a ser una pantalla de hacer** (PR2): tablero por cancha donde cada turno abre un **modal de
   cobro** sin cambiar de vista, que se queda abierto entre cobros y ofrece "Todo junto", "Por equipo" y
   "Por jugador". El modal es **solo de Hoy**: el panel de la grilla queda como está.
4. **Vender en Hoy** (PR3): el mismo `TicketPanel` de `/caja` (mismo stock, mismo fiado), en una columna
   fija a la derecha desde 1280 px y en un diálogo, desde un botón "Vender", en pantallas más angostas.

## Qué se reabre

- **"Hoy no es una pantalla de hacer"** (`docs/spec/design-system/pages/dashboard.md` §0): deja de valer.
- **La venta rápida descartada el 2026-09-09** (`docs/superpowers/specs/2026-09-09-auditoria-coherencia-ux-design.md`
  §10). Aquella decisión puso una condición y se respeta: si algún día entra, entra como **el flujo real de
  cantina**, nunca como una segunda caja registradora. Por eso Vender reusa `TicketPanel` y
  `sellTicketAction` tal cual, sin camino nuevo para descontar stock ni anotar fiado.

## Consecuencias asumidas

- **El sidebar oculta, no bloquea**: Métricas (como Canchas) desaparece del riel del Encargado; solo
  Configuración muestra candado. El MASTER §7 pide candado para todo lo bloqueado por rol: queda como
  desvío conocido y pendiente de unificar, fuera de este cambio.
- **Un Encargado que llega a `/analiticas`** (link viejo, `/metricas`, `/reportes`) cae en Hoy sin aviso. No
  se agregó un aviso como el de Configuración (H163): `/analiticas` ya no aparece en su navegación.
- **El push de resumen diario** (`daily-summary.worker.ts`) **sigue llegando también al Encargado**,
  con el cobrado y la ocupación de ayer. Decisión del dueño (2026-09-19): "sin Métricas" alcanza; el push
  no se corta. (Se había restringido al dueño por criterio y el dueño lo revirtió.)
- **Hoy deja de depender de un solo rol**: el estado vacío "Ir a Canchas" apuntaba a una pantalla
  solo-admin. Resuelto en PR2: `TodayBoard` ofrece el link solo al dueño; al Encargado le dice "Pedile al
  dueño que active una".
- **El turno terminado sin cobrar deja de ser una alerta** y pasa a ser una fila del tablero
  (enmienda a `2026-08-02-taxonomia-alertas-hoy.md`): una cosa, un lugar. "Necesita tu atención" queda con
  dos eventos y el copy del vacío cambia.
- **El modal es solo de Hoy.** El panel de la Grilla no cambia (decisión 2). Comparten `useSlotCharges`,
  las compuertas de acciones (`slotGates`) y el diálogo de cancelar (`SlotCancelDialog`), extraídos del
  panel sin cambio de comportamiento.
- **"Equipo 1 ✓" y "Pagaron 4 de 10" son deducciones**, no registros: el sistema no guarda quién pagó
  cada peso (veto de texto libre sobre personas / Ley 25.326). Si alguien paga por el "Equipo 2" primero,
  el sistema igual le cuenta esa plata al Equipo 1: los totales son correctos, la atribución no. Aceptado
  por el dueño (2026-09-19): es una ayuda visual para quien cobra; **lo que quede debiendo se le reclama
  a quien reservó, nunca a un "Equipo"**, porque no se sabe quiénes son.
- **Hoy se refresca solo cada 60 s**, salvo con un modal abierto o la pestaña oculta. Un turno cobrado
  desde otro puesto aparece a más tardar al minuto (no hay Realtime en Hoy).
- **`getStreetMoney` sale de `getHoyData`**: era la query más pesada de Hoy y ya nadie leía su total.
- **Vender no es una segunda caja**: la columna (desde 1280 px) y el diálogo (debajo) montan el
  `TicketPanel` de `/caja/cantina` con las mismas Server Actions. Una venta desde Hoy descuenta el
  mismo stock y entra al mismo ledger que una de Caja. El catálogo se recarga con cada refresco de
  Hoy (60 s), así que el stock que se ve envejece como mucho un minuto — y cada venta hace
  además su propio `router.refresh()`.
- **Un ticket de venta a la vez**: mientras el diálogo de venta está abierto la columna no se
  renderiza. Consecuencia visible: si alguien achica la ventana con el diálogo abierto, la venta
  sigue en el diálogo.
- **El diálogo de venta no se cierra con una venta sin confirmar** (Esc y ✕ quedan bloqueados) y
  tocar afuera nunca lo cierra. Si la red se corta y no se sabe si la venta entró, el ticket guarda
  la clave del reintento; desmontarlo la pierde y cobrar de nuevo duplicaría venta, stock y caja.
