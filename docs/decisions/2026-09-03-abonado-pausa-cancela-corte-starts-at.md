# Pausar/cancelar abonado: el corte de "sesión ya jugada" es `starts_at`, no día operativo

**Fecha**: 2026-09-03
**Estado**: vigente
**Decisor**: Lazar (input directo en sesión; recomendación de Claude aplicada tal cual — "la opción que recomiendes vos")

## Contexto

Campaña de mutación de tests (`docs/qa/TEST_AUDIT.md`) encontró: `pauseAbonado` y `cancelAbonado`
(`src/modules/abonados/abonado.service.ts:307,425`) borran las sesiones futuras del abonado con
`DELETE ... WHERE date >= ${fecha}`. `date` es el día OPERATIVO (display), no el instante físico —
una sesión de hoy a las 09:00 sigue en `status='confirmed'` hasta que el trigger de 24h la mueve a
`completed`, así que pausar/cancelar a las 15:00 borraba una sesión que YA SE JUGÓ y es cobrable.

Dos criterios de corte posibles para "esta sesión ya pasó, no la toques":

1. **`starts_at >= NOW()`** (instante físico, TIMESTAMPTZ) — el que ya usa toda la lógica fuerte de
   bookings ("ya pasó / falta X") por regla explícita del CLAUDE.md del repo.
2. **Día operativo del complejo** (`closes_next_day` / `nightCutoffMins`) — el criterio de
   caja/cantina (`docs/decisions/2026-07-22-caja-cantina-redesign.md` y
   `docs/decisions/2026-07-24-caja-cantina-dia-operativo.md`), pensado para AGRUPAR movimientos de
   plata en un cierre, no para decidir si una fila individual ya ocurrió.

## Decisión

**`starts_at >= NOW()`**, agregado como filtro ADICIONAL al `date >= fecha` que ya existía (ninguno
reemplaza al otro: `date` sigue acotando qué ventana de fechas se revisa, `starts_at` decide si esa
fila individual ya pasó de verdad).

Por qué se descartó el día operativo de caja/cantina: ese criterio existe para AGRUPAR — decidir a
qué cierre pertenece un movimiento de plata — no para decidir si una fila ya ocurrió. Traerlo acá
mezclaría dos preguntas distintas y el propio CLAUDE.md ya resuelve la pregunta que sí aplica
("¿ya pasó?") con `starts_at`/`ends_at`. Usar el cutoff de caja habría sido más código
(`nightCutoffMins` + `operatingDateOf` + lectura de `tenants.opening_hours`) para llegar a la MISMA
respuesta en el 99% de los casos, con un desacople extra a mantener.

## Efecto

`src/modules/abonados/abonado.service.ts` — ambos DELETE (pauseAbonado línea ~307,
cancelAbonado línea ~425) llevan `AND starts_at >= NOW()`. Test:
`tests/unit/abonado-pause-cancel-starts-at.test.ts` (verifica el SQL enviado, no un resultado
simulado — no hay Supabase local en este entorno para probarlo contra la DB real).

## Nota 2026-09-15 — la mitad "pausa" se retiró del producto

Decisión del dueño: el botón "Pausar" sobraba porque saltear una fecha puntual ya se resuelve
cancelando ese turno específico desde la Grilla, sin dar de baja el fijo. Se borraron
`pauseAbonado` (`abonado.service.ts`), la Server Action, el botón/diálogo y sus tests
(`tests/unit/abonado-pause-cancel-starts-at.test.ts` pasó a llamarse
`tests/unit/abonado-cancel-starts-at.test.ts`, sin la mitad de pause).

El enum `abonado_status` sigue aceptando `'paused'` y el botón + acción + servicio de
**Reactivar** se conservan a propósito: existen filas `paused` de antes de este cambio que
tienen que poder salir de ese estado. La pestaña "Pausados" ya no se renderiza, pero el filtro
`?status=paused` y "Todos" siguen mostrando esas filas.
