# Regresión visual: 8 fotos, advisory, con fecha de caducidad

**Fecha**: 2026-07-29
**Estado**: aceptada, en período de prueba
**Contradice parcialmente**: `docs/spec/doc16_testing_strategy.md` §6

## Contexto

`doc16` §6 dice, en la tabla de "qué NO testeamos":

> **UI pixel-perfect** | Los tests de snapshot visual son frágiles. Un cambio de
> padding rompe 20 tests sin bug real. Revisión visual manual.

Sigue siendo cierto **para snapshots por componente**, que es de dónde sale ese
número 20. No es cierto para 8 fotos de pantalla completa: ahí un cambio de
padding rompe 1 o 2, y regenerarlas es un `gh workflow run` más un `git add`.

Mientras tanto, existe una clase de regresión que hoy no cubre nada: un cambio en
`globals.css`, en un token de Tailwind v4 o en una fuente que rompe el layout de
una pantalla que no se abrió en tres semanas. Con 176 archivos `'use client'` y
Tailwind v4 (OKLCH), esa clase es real — ya mordió antes, ver
`docs/audit/` y la memoria sobre OKLCH rompiendo contraste AA.

## Decisión

Se agrega un canario de **8 fotos de pantalla completa** (`tests/e2e/visual/`,
projects `visual` y `visual-mobile`), **no** snapshots por componente.

Se edita la fila de `doc16` §6 para que diga "UI pixel-perfect **a nivel
componente**" y apunte acá.

**Arranca advisory** (`continue-on-error: true`) y **se endurece por criterio
medible**, no por sensación:

- Se saca `continue-on-error` después de **10 PRs consecutivos** sin una sola
  falsa alarma.

## Condición de muerte

**Si a las 6 semanas del merge no llegó a 10 PRs seguidos sin falsa alarma, la
pieza se borra.** No se afloja el umbral, no se enmascara más, no se "revisa más
adelante". Se borran `tests/e2e/visual/`, los dos projects, el step de `ci.yml`,
`visual-baseline.yml` y este ADR.

Fecha de evaluación: **2026-09-09**.

Segundo criterio de muerte, independiente: si en 6 semanas no atajó **ninguna**
regresión real y costó más de dos tardes de mantenimiento, también se borra —
aunque nunca haya dado una falsa alarma. Un test que nunca falla y nunca atrapa
nada es costo puro.

## Costo aceptado

- **CI**: ~70s de wall clock en el job `e2e-tests` (reusa el stack ya pago). Un
  job aparte habría costado ~9 min de minutos facturados para ahorrar esos 70s.
- **Repo**: ~1.6 MB de baselines, ~+10 MB/año a `.git` (que hoy pesa 149 MB).
  Aceptable **mientras el alcance se quede en 8 fotos**. Si crece a 40, se revisa
  esta decisión.
- **Fricción**: regenerar una baseline es un ciclo de ~10 min (push → workflow →
  bajar artifact → commitear), porque se generan solo en Linux. Es el costo
  irreducible de desarrollar en Windows con CI en Ubuntu.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| **Chromatic** | Tiene free tier, pero se ata a Storybook y hay 864 stories: revienta la cuota. Y el costo real de un servicio pago no se justifica para 8 fotos |
| **Snapshots por componente (Storybook)** | Es exactamente lo que `doc16` §6 rechaza, y con razón: frágil y ruidoso a esa granularidad |
| **Generar baselines local en Docker** | La imagen `mcr.microsoft.com/playwright` trae fuentes distintas a `ubuntu-latest`, así que tampoco matchearía CI. Y expone un `node_modules` de Windows adentro de un container Linux |
| **`page.clock` como única solución de determinismo** | No alcanza: TurnoGol renderiza las fechas en Server Components. El HTML llega cocinado desde Node y congelar el reloj del browser no cambia un pixel |
| **Reusar los seeds funcionales** | `tomorrowDateIsoArt()`, `currentMonthStr()`, `pickFutureMonday()` y los `Date.now()` embebidos en nombres/teléfonos/emails cambian los pixeles en cada corrida |

## Referencias

- Cómo funciona y cómo regenerar: `docs/testing/VISUAL_REGRESSION.md`
- La condición que hace fotografiable la grilla: `src/hooks/use-now-line.ts:28`
