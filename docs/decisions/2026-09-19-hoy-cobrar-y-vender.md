# Hoy es la pantalla del mostrador: cobrar turnos en un modal, vender al lado, y el Encargado la ve

**Fecha**: 2026-09-19 · **Estado**: en implementación — PR1 (roles) aplicado; PR2 (tablero + modal de cobro) y
PR3 (columna Vender) pendientes · **Decide**: el dueño (las cuatro decisiones de abajo) + esta sesión (cómo)

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
- **El push de resumen diario** (`daily-summary.worker.ts`) pasa a llegar solo a las suscripciones del
  dueño (`notifyAdminPush(..., { ownerOnly: true })`). Es un resumen de rendimiento (cobrado y ocupación de
  ayer), el mismo tipo de dato que Métricas. El Encargado sigue viendo la plata del día en Caja porque la
  necesita para operar. Decisión tomada por criterio (el dueño delegó la elección): se revierte con un
  cambio de una línea si prefiere que le siga llegando.
- **Hoy deja de depender de un solo rol**: el estado vacío "Ir a Canchas" de `ProximosTurnos` apunta a una
  pantalla solo-admin. Se resuelve en PR2, donde ese componente es reemplazado.
