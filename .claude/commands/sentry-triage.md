---
description: Triage de los errores de producción en Sentry — separa el ruido conocido del error real y lo ubica en el código
---

Vas a hacer el triage de los errores de producción de TurnoGol en Sentry.

Ventana: `$ARGUMENTS` si viene algo (`24h`, `7d`, `14d`, `30d`); si no, `24h`.

## Cómo leés Sentry

Por el **connector de Sentry** (herramientas `mcp__Sentry__*`), no por el dashboard:

- Organización: `turnogol` · Proyecto: `sentry-coquelicot-school` (el slug es el autogenerado cuando se creó el proyecto, no un typo)
- `search_issues` para listar · `get_issue_details` para el stack trace · `get_issue_breadcrumbs` para la secuencia previa

Si el connector no está disponible en la sesión, el fallback es `pnpm sentry:issues 24h` (necesita `SENTRY_READ_TOKEN` en `.env.production`, scope `event:read`; el `SENTRY_AUTH_TOKEN` del build devuelve 403).

## Paso 1 — Traer y clasificar

Traé los `is:unresolved` de la ventana, ordenados por frecuencia. Después separá en dos pilas. **El grueso de lo que hay en el proyecto no son errores**, así que esta separación es la mitad del trabajo:

**Ruido conocido — no se reporta como hallazgo:**

| Patrón | Qué es | Cuándo SÍ importa |
|---|---|---|
| `web-vital:LCP` / `TTFB` / `INP` / `FCP` / `CLS` / `FID` | Métricas de performance que el SDK del navegador manda como issue. No es un error: es un número fuera de presupuesto (`src/shared/observability/latency-budgets.ts`) | Solo si una ruta de plata (`/grilla`, `/caja`, portal público de reserva) se degradó de golpe respecto de días anteriores |
| `health.ping.degraded` y `Health ping degraded: <servicio>` | La sonda del worker (`health-ping.worker.ts`) avisando que un subsistema no contesta | Si el subsistema es `database` o `pg-boss`, o si el mismo servicio se repite varias horas seguidas: ahí es incidente, no ruido |
| Issues cuyo mensaje ya no existe en el código | Se arreglaron y quedaron abiertas en Sentry | Nunca. Proponé resolverlas (no las resuelvas solo) |

**Errores reales — todo lo demás.** Prioridad por, en este orden: (1) toca plata (pagos, MercadoPago, webhooks, caja, abonados), (2) toca aislamiento de tenant o auth, (3) cuántos usuarios distintos afectó, (4) frecuencia.

## Paso 2 — Diagnosticar cada error real

Para cada uno:

1. `get_issue_details` → stack trace y tags (`environment`, `release`, `transaction`).
2. Los errores que entran por `logger.error` (la mayoría de los workers) **no traen stack**: lo que los explica viaja en el `extra` del sink (`src/shared/observability/error-sink.ts`), que la API devuelve como `context`. Leelo antes de decir "no hay información".
3. Ubicalo en el repo. Citá `archivo:línea` real, verificado con Read o Grep — nunca de memoria.
4. Decí qué pasó y por qué, y si es regresión de un deploy reciente (`git log --oneline -20`).

## Paso 3 — Reportar

Formato, un bloque por error real:

```
🔴/🟡/🟢  TÍTULO DE LA ISSUE  ·  N eventos · M usuarios · último <cuándo>
   Qué pasa:   una frase
   Dónde:      src/ruta/archivo.ts:123
   Por qué:    la causa, no el síntoma
   Link:       <permalink de Sentry>
```

Cerrá con una línea de ruido: `Ruido filtrado: N issues (web-vitals, health-ping)`. Si no hubo ningún error real, decilo en una línea y terminá — un reporte largo para decir "no pasó nada" es exactamente la fatiga de alertas que doc17 §5.1 quiere evitar.

## Límites

- **No escribas en Sentry.** Resolver, asignar o comentar una issue cambia estado que mira una persona: proponelo, no lo hagas.
- **No arregles nada en este pase.** El triage termina en el diagnóstico. Si el fix es obvio, decilo en una línea y esperá el visto bueno.
- **Nada de datos personales en el reporte** (Ley 25.326, doc18): ni mails, ni teléfonos, ni tokens de MercadoPago. Si un `extra` los trae porque se escapó del `scrubObject`, eso **es el hallazgo** y se reporta como bug de privacidad 🔴.
