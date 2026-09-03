# Resumen diario: el push dice lo mismo que el mail, y el mail se queda (ya es opt-in)

**Fecha**: 2026-09-03
**Estado**: vigente
**Decisor**: Lazar (input directo en sesión)

## Contexto

Campaña de mutación de tests (`docs/qa/TEST_AUDIT.md`) encontró que el push del resumen diario
(`src/shared/jobs/workers/daily-summary.worker.ts`) afirmaba **"caja cerrada sin diferencia"** a
partir de `data.numbers.cashClosed`, que es un booleano: sale de `todayClose !== null`
(`home.service.ts`), o sea prueba que HUBO cierre, no que la caja haya CUADRADO. Un cierre con
faltante o sobrante de efectivo disparaba el "sin diferencia" igual. El mail del mismo resumen
(`templates/daily-summary.ts`) nunca tuvo el problema: dice "caja cerrada" a secas.

Al plantearlo, el dueño preguntó si el mail vale la pena ("no gastar mail al pedo, un mail que nadie
ve"). **La premisa era falsa y se verificó antes de tocar nada**: el mail ya es **opt-in con default
`false`** (`tenants.settings.daily_summary_email_opt_in`, leído con `=== true` en el worker; el
toggle vive en Configuración → Avisos, `src/app/(admin)/settings/avisos/`). Hoy no lo recibe nadie
salvo que un complejo lo prenda a mano. No había mail que sacar.

## Decisión

1. **El push dice "caja cerrada" a secas**, exactamente el mismo texto que el mail. Se descartó la
   alternativa de informar el faltante/sobrante real en el push: eso es copy nuevo (feature), no el
   fix del bug, y estamos en feature freeze. Si algún día se quiere, el dato existe y es
   `diff_amount` de la fila de `daily_cash_closes` — nunca este booleano.
2. **El mail se queda como está** (opt-in, default `false`). No hay costo por complejo que no lo
   prendió.

## Efecto

- `src/shared/jobs/workers/daily-summary.worker.ts` — `cajaLabel` unificado con el del mail.
- `tests/unit/daily-summary-caja-label.test.ts` — nuevo; ata los DOS canales al mismo texto usando
  `renderDailySummary` como fuente de verdad, así no vuelven a divergir. También fija que sin opt-in
  no se encola ningún email.
- `tests/integration/daily-summary-worker.test.ts` — su assert codificaba el texto viejo
  (`toContain('caja cerrada sin diferencia')`); ahora exige "caja cerrada" y prohíbe "sin diferencia".
