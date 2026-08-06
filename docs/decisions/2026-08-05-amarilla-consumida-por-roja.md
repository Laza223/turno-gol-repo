# La amarilla del partido de la roja no acumula para la próxima suspensión

**Fecha:** 2026-08-05
**Estado:** Decidida (dueño: Lazar) — confirma el comportamiento vigente, cero cambio de código
**Migraciones:** ninguna
**Origen:** `REQUIERE INPUT` anotado en `src/modules/tournaments/standings/suspensions.ts:15` desde la Fase 3 de Torneos (migr. 065). El comentario decía "antes de release", así que quedaba como pendiente bloqueante sin dueño.

## Problema

Un jugador con 2 amarillas acumuladas ve una tercera amarilla y, en el mismo partido, la roja. ¿Esa tercera amarilla cuenta para disparar una suspensión por acumulación **además** de la fecha que ya le corresponde por la expulsión?

Las dos lecturas son defendibles y la diferencia se ve en la cancha:

- **Consumida (lo que hace el código):** la roja "se come" la amarilla de ese partido. El jugador debe 1 fecha.
- **No consumida:** las dos sanciones se apilan. El jugador debe 2 fechas.

## Decisión

**Se confirma el comportamiento actual: `YELLOWS_CONSUMED_BY_RED = true`.**

Razón registrada: en fútbol la segunda amarilla **ES** la roja. Contar las dos sería contar la misma expulsión dos veces, y el reglamento del que sale el modelo mental del complejo (AFA y la mayoría de las ligas federadas) las considera un mismo hecho disciplinario.

La amarilla **sí** sigue contando para fair play: no se descarta la tarjeta, se descarta su aporte al contador de acumulación.

## Alternativas descartadas

- **`false` (apilar las dos sanciones):** existe en ligas amateur, pero es la lectura minoritaria y castiga dos veces el mismo hecho. Si algún complejo la pide, el cambio es de una constante y su test — no de arquitectura.
- **Hacerlo configurable por torneo:** descartado por ahora. Es una perilla más en un módulo que nació detrás de un feature flag y todavía no tiene uso real suficiente para justificar la variante. Agregarla sin un complejo que la pida es complejidad especulativa.

## Alcance de implementación

**Ninguno.** El código ya hace lo decidido (`suspensions.ts:17`). Este documento existe para que la línea quede registrada como *decidida* y no como *olvidada* — que era el estado anterior.

## Reversibilidad

Alta. Es un booleano derivado, no materializado: las suspensiones se calculan al leer (`computeSuspensions`), no hay filas persistidas que migrar. Invertir la constante cambia el resultado de la próxima lectura y nada más.

El comportamiento está bajo test en `tests/unit/tournament-suspensions.test.ts` (describe *"computeSuspensions — amarilla del partido de la roja"*, asserta `pendingMatches === 1`). Ese test es la alarma si alguien lo cambia sin volver acá.
