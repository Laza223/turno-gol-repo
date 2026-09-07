# AUD-14 (parcial) — Los identificadores de persona viajaban a Sentry en cada miga de navegación

Hallazgo AUD-14 de la auditoría técnica integral del 2026-09-06 (§D.1), heredado del H-8 de la
auditoría de aislamiento del 2026-09-05. Rama a partir de `main` =
`1caa41c544ba56f12703ed4f29235524e3b81cef`.

## Causa

`track.*` (`src/shared/observability/breadcrumbs.ts`) tiene dos destinos: las migas de navegación
de Sentry, que se transmiten sólo si después hay una excepción, y la tabla durable
`analytics_events`.

El filtro de datos personales se aplicaba **en el destino durable solamente**: `analytics.ts`
declaraba `PII_KEYS` (`playerId`, `staffUserId`, `endpoint`) y las descartaba antes de escribir la
fila. Las migas salían sin filtrar, con esos mismos identificadores adjuntos a cada evento de
error que llegara a Sentry.

O sea: la migración 072 sostiene que `analytics_events` no es dato personal porque filtra esas
claves, y la misma llamada las mandaba igual por el otro camino.

## Cambio

El filtro se aplica **una sola vez, en el origen** (`emit`), así que vale para los dos destinos.
La lista y la función se mudan de `analytics.ts` a `src/shared/observability/pii-keys.ts`, un
módulo sin dependencias: `breadcrumbs.ts` no puede importar `analytics.ts` porque eso arrastraría
el driver de Postgres al bundle del navegador.

Sentry conserva `user.id`, que es lo que sirve para rastrear un error hasta su sesión. Lo que se
va de las migas es la copia del identificador, no la trazabilidad.

## Alcance: qué NO entra en este PR

El hallazgo original tiene una segunda mitad: el punto de entrada de Sentry para el runtime Edge
(`sentry.edge.config.ts`) no aplica ningún tapado. El arreglo de esa mitad necesita `scrubEvent`,
que **no existe en `main`**: vive en el trabajo de la auditoría de aislamiento (H-7/H-8) que sigue
sin commitear en el árbol del dueño. Incluirlo acá duplicaría ese archivo y chocaría cuando ese
trabajo se mergee.

Queda explícitamente pendiente: **alinear `sentry.edge.config.ts` con los otros tres puntos de
entrada, junto con —o después de— el PR de la auditoría de aislamiento.**

## La prueba

`tests/unit/breadcrumbs.test.ts` afirma ahora la forma exacta de la miga. Rojo antes del arreglo,
en los dos casos que llevaban un identificador de persona:

```
× track.booking > emits breadcrumb with category=booking and given event as message
× track.auth > emits a login breadcrumb with category=auth
  → expected "spy" to be called with arguments: [ { category: 'booking', …(3) } ]
```

Verde después, con `data` sin `playerId` ni `staffUserId` y con el resto del contexto intacto
(`tenantId`, `courtId`, `tenantCount`).

`tests/integration/analytics-events.test.ts` pasa a importar `scrub`/`PII_KEYS` desde el módulo
nuevo: el destino durable sigue afirmando exactamente lo mismo que antes.

## Validación

Sobre esta rama, con Postgres descartable (`postgres:15-alpine`, las 84 migraciones aplicadas con
la misma receta que el job de CI):

| Comando | Resultado |
|---|---|
| `vitest run tests/unit/breadcrumbs.test.ts tests/integration/analytics-events.test.ts` | 16 passed |
| `pnpm test` (suite unitaria completa) | 379 archivos · 3928 passed |
| `pnpm format:check` · `pnpm lint` · `pnpm typecheck` · `pnpm knip` | los cuatro limpios |

La suite completa se corrió porque `breadcrumbs.ts` lo importa medio codebase.

## Limitaciones

- El punto de entrada Edge queda sin tapar (ver arriba). El hallazgo no está cerrado del todo.
- No se verificó contra eventos reales en Sentry; la aserción es sobre la llamada al SDK.
- El resto del lote (AUD-09, AUD-06, AUD-02) va en PRs separados.
