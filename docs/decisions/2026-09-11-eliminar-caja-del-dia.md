# Eliminar "Caja del día" — Cantina pasa a ser la raíz de /caja

**Fecha:** 2026-09-11
**Estado:** Implementada
**Migraciones:** ninguna (`daily_cash_opens`/`daily_cash_closes` quedan en el schema, solo dejan de escribirse/leerse desde código de aplicación)
**Origen:** pedido directo del dueño — simplificar `/caja`, sacar la fricción de apertura/cierre/arqueo diario y que Cantina (venta de productos del complejo) sea la vista principal.

## Problema

`/caja` tenía 5 tabs: Caja del día (apertura/fondo inicial, cierre inmutable con arqueo, recibo `CierreCard`), Deudas, Devoluciones, Cantina, Productos y stock. El dueño decidió que la fricción de abrir/cerrar caja todos los días no aporta valor al negocio y quiere que Cantina —la acción que más se usa— sea lo primero que se ve al entrar a `/caja`.

## Decisión

1. **Se elimina el concepto de "caja del día" por completo**: apertura, cierre, arqueo, y el guard de negocio `assertDayOpen`/`DayAlreadyClosedError`/`allowClosedDay` que bloqueaba movimientos (cantina, deudas, devoluciones, señas, reservas, torneos) cuando el día estaba cerrado. Ningún movimiento de plata vuelve a rechazarse por "caja cerrada".
2. **Cantina pasa a vivir en la raíz `/caja`**, con el feed de movimientos del día y el formulario de ingreso/gasto/ajuste manual fusionados en la misma página (antes vivían en la página de "Caja del día" que desaparece).
3. **El feed de movimientos ya no navega por fecha** — siempre muestra "hoy", igual que Deudas, Devoluciones y como ya funcionaba Cantina.
4. **Datos históricos intactos**: `daily_cash_opens`/`daily_cash_closes` quedan en la base tal cual, sin tocar ni reinterpretar — ninguna pantalla los muestra más.
5. **Se elimina la alerta "Cerrar caja de ayer"** del dashboard "Hoy" (`AttentionItem.kind: 'yesterday_cash_unclosed'`) y la mención "caja cerrada"/"caja sin cerrar todavía" del resumen diario (push + mail).
6. `/caja/cantina` (URL vieja) queda como `redirect('/caja')` por compatibilidad de bookmarks del staff.

## Alcance de lo que se retiró

Al sacar el guard de negocio se destapó un subsistema completo que solo existía para manejar "la seña se cobró con la caja cerrada": reintento como `adjustment` con `allowClosedDay: true` en los tres emisores de depósito (`recordManualDepositCashFlow`/`recordDepositCashFlow` en `payment.service.ts`, `recordManualBookingDepositCashFlow` en `booking.service.ts`), el mail `admin_deposit_after_close`, y el toast `depositAfterCloseNote` en el staff. Todo eso se retiró junto con el guard — no tiene sentido sin el concepto de "cerrado".

Se eliminaron: `src/modules/cashflow/cash-open.service.ts`, `daily-close.service.ts`, los componentes `OpenDayCard`/`CierreCard`/`CloseDayButton`/`CajaCierreHint`, `src/components/booking/deposit-after-close.ts`, la plantilla `admin-deposit-after-close.ts`. `MovementsList`/`MethodBreakdown`/`RegisterMovementModal` se movieron de `caja/components/` a `caja/cantina/`; `CajaActions`+`EmptyMovementAction` (casi idénticos tras sacarles el cierre) se fusionaron en `AddMovementButton`.

## Este documento revierte parcialmente

- `docs/decisions/2026-07-22-caja-cantina-redesign.md` — la parte de apertura de caja (migr. 049, fondo inicial) y cierre/arqueo queda sin efecto. El resto (tablas reales de cantina, ticket multi-ítem, fiados) sigue vigente sin cambios.
- `docs/decisions/2026-07-24-caja-cantina-dia-operativo.md` — la parte de guards de escritura (`assertDayOpen`, fecha-futura de `openDay`/`closeDailyRegister`) queda sin efecto. **El cutoff único por tenant (`nightCutoffMins`) sigue vigente** para las lecturas (`getCashFlows`/`getDaySummary`).
- `docs/decisions/2026-08-28-sena-cobrada-con-la-caja-cerrada.md` — reemplazado por completo: el problema que resolvía (la seña se pierde de vista si la caja está cerrada) ya no puede ocurrir, porque la caja nunca está "cerrada".

## Consecuencias aceptadas

- Se pierde la capacidad de ver el feed de movimientos de un día pasado desde la UI (el dato sigue en la base, solo no hay pantalla). Antes solo la vieja "Caja del día" navegaba por fecha; el resto de `/caja` nunca lo hizo.
- Se pierde el arqueo diario (contar el cajón y anotar diferencia) como ritual formal. Si en el futuro hace falta una reconciliación de efectivo, es una feature nueva a diseñar desde cero, no una reactivación de esta.
- `daily_cash_opens`/`daily_cash_closes` quedan como tablas "vivas en schema, muertas en código" — su definición Drizzle se conserva a propósito (no rompe drizzle-kit ni borra el histórico), documentado en el comentario de cada archivo de schema.
