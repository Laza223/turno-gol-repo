# Errores de Sentry — cómo llega el aviso y quién lo mira

> **Estado: verificado el 2026-09-04** contra la API de Sentry (org `turnogol`, proyecto `sentry-coquelicot-school`). Lo que sigue es lo que **efectivamente dispara hoy**, no el diseño objetivo. El catálogo de alertas de diseño vive en doc17 §5.3.

## Qué avisa hoy, en criollo

Hay tres piezas y hacen cosas distintas. Ninguna reemplaza a la otra.

| Pieza | Qué mira | A quién avisa | Cuándo |
|---|---|---|---|
| **UptimeRobot** | Que el sitio y `/api/status` respondan | Mail | Dentro de ~5 min de que se cae ([`uptime-monitor.md`](./uptime-monitor.md)) |
| **Alert rule de Sentry** | Errores nuevos o recurrentes que Sentry marca como *high priority* | Mail a los miembros activos de la org | En el momento |
| **Routine diaria de Claude** | Todo lo que quedó sin resolver en las últimas 24h | Push + mail, con el diagnóstico | 11:00 ART, todos los días |

La primera te dice **que algo se cayó**. La segunda te dice **que algo rompió**. La tercera te dice **qué rompió, dónde en el código y por qué** — que es la parte que antes no hacía nadie.

## La alert rule de Sentry, en detalle

Es la **regla por defecto** que Sentry creó sola cuando se dio de alta el proyecto (2026-07-07). Nunca se tocó y funciona:

- **Nombre**: `Send a notification for high priority issues` (ID `3673416`, habilitada)
- **Condiciones**: issue *high priority* nueva, o issue *high priority* que reaparece
- **Acción**: mail, `fallthrough: ActiveMembers` sobre los dueños de la issue — como la org tiene un solo miembro, en la práctica es *"mail a Lazar"*
- **Último disparo real**: 2026-08-28
- **Panel**: https://turnogol.sentry.io/monitors/alerts/3673416/

> [!IMPORTANT]
> **Drift con doc17 §5.3.** El doc dice que `CRIT-03` (*error rate > 5% durante 5 minutos*) está activo como *"alert rule de Sentry sobre tasa de errores"*. **No existe**: el proyecto no tiene ninguna *metric alert rule*, solo la regla de issues de arriba. Lo que hay cubre *"apareció un error nuevo"*, no *"la tasa de errores subió"*. Son cosas distintas: un endpoint que falla el 100% de las veces pero siempre con el mismo error dispara la regla una vez y después se calla.

## La Routine diaria

Una **Routine** (tarea programada de Claude) que a las 11:00 ART abre una sesión limpia, lee Sentry por el connector, separa el ruido del error real, ubica cada error en el código y manda el resultado por push y mail. Si no hay nada, no molesta.

- **Cron**: `0 14 * * *` UTC (= 11:00 ART, UTC−3)
- **Connector**: Sentry (solo lectura en la práctica: el triage tiene prohibido escribir en Sentry)
- **Qué corre**: el mismo protocolo que el slash command `/sentry-triage` ([`.claude/commands/sentry-triage.md`](../../.claude/commands/sentry-triage.md))
- **Para verla, pausarla o cambiarle la hora**: panel de Routines de Claude, o pedírselo a Claude en una sesión

> [!WARNING]
> **El prefijo de las herramientas del connector cambia según el tipo de sesión.** En una sesión interactiva son `mcp__Sentry__*`; en la sesión que levanta la Routine, el mismo connector aparece bajo el ID del servidor MCP (`mcp__472c6277-…__`). La primera versión del prompt tenía el prefijo hardcodeado y la corrida abortó en 17 segundos sin leer nada, reportando "no tengo el connector" — un falso negativo perfecto, porque el connector estaba y respondía. Se verificó pidiéndole a una sesión disparada que escribiera el resultado en una rama del repo. Cualquier prompt automatizado que hable con un connector busca sus herramientas con ToolSearch por palabra clave, nunca por nombre exacto.

**El triage no arregla nada solo.** Diagnostica y te lo cuenta; el fix lo autorizás vos. Es deliberado: un agente que pushea fixes a producción sin que nadie lea el diagnóstico es una forma cara de romper cosas de madrugada.

## A pedido, en cualquier momento

- `/sentry-triage` — el mismo triage, en la sesión abierta. Acepta ventana: `/sentry-triage 7d`
- `pnpm sentry:issues [24h|14d|todo]` — el listado crudo en texto, sin interpretación. Necesita `SENTRY_READ_TOKEN` con scope `event:read` en `.env.production`; el `SENTRY_AUTH_TOKEN` del build **no sirve** (solo tiene `project:releases`, devuelve 403)

## Lo que hay adentro del proyecto de Sentry no son todos errores

Al 2026-09-04, de las 10 issues sin resolver de los últimos 14 días, **una sola** era un error de código. El resto:

- **6 `web-vital:*`** (LCP, TTFB, INP, FCP, CLS, FID) — métricas de performance que el SDK del navegador manda como issue cuando se pasan del presupuesto de `src/shared/observability/latency-budgets.ts`. Son números, no fallas.
- **3 `health.ping.degraded` / `Health ping degraded: <servicio>`** — la sonda del worker avisando que un subsistema no contestó. Importa si el servicio es `database` o `pg-boss`, o si el mismo se repite varias horas.

Por eso el triage empieza filtrando: sin ese filtro, el 90% del reporte es ruido y se deja de leer (doc17 §5.1).

## Lo que sigue sin estar

- **`CRIT-03` de verdad** (metric alert rule sobre tasa de errores): no configurada. Es de consola, no de código.
- **Canal WhatsApp** para críticas (doc17 §5.2): sigue siendo diseño objetivo. Hoy todo va por mail y por la notificación de Claude.
- **Aviso instantáneo a Claude.** El mínimo de una Routine es horario, así que el piso de latencia del diagnóstico automático es una hora si se sube la frecuencia, y un día con la config actual. El aviso **a vos** sí es instantáneo: lo manda Sentry por mail.
