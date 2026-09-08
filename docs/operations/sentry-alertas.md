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

### Dónde aparece el reporte: en un pull request

**No en una notificación, no en un mail, no en un issue.** El dueño trabaja mirando pull requests, así que todo lo que produce el triage llega por ahí. Las notificaciones push y por mail se siguen mandando, pero no son el canal: llegan o no llegan según el dispositivo y no dejan rastro.

| Qué encontró | Qué hace |
|---|---|
| Un error **grave** (plata, aislamiento de tenant, auth, o algo que le impide a alguien reservar o entrar) | Lo arregla, corre los checks, y pushea `sentry-fix/AAAA-MM-DD-<slug>`. El PR se abre solo |
| Algo **leve** (performance, ruido, cosmético) | Agrega una línea a [`sentry-pendientes.md`](./sentry-pendientes.md) y la pushea a `sentry-fix/pendientes`, que es un PR abierto de forma permanente que va creciendo |
| Un error grave que **no sabe arreglar bien** | No inventa un fix: va a pendientes con el diagnóstico y lo dice |
| Nada | No pushea nada. Sin PR, sin ruido |

**Quién abre el PR: un workflow, no la sesión.** Las sesiones automáticas no tienen acceso a la API de GitHub — ni connector, ni `gh`, ni permiso para llamar a `api.github.com` (verificado el 2026-09-08). Lo único que pueden hacer es `git push`. Así que la sesión deja la rama y [`.github/workflows/sentry-triage-pr.yml`](../../.github/workflows/sentry-triage-pr.yml) abre el PR con el `GITHUB_TOKEN` del repo.

El contrato entre los dos es el **mensaje del commit**: su primera línea es el título del PR y su cuerpo es la descripción. El workflow usa `gh pr create --fill`, así que el contexto lo pone la sesión que leyó el error, no el runner.

Nada se mergea solo. Abrir el PR es todo lo que hace la automatización; revisar y mergear es siempre de una persona. Ese es el punto de que el arreglo llegue como PR y no como un commit en main.

> [!IMPORTANT]
> El workflow necesita que esté activo **Allow GitHub Actions to create and approve pull requests** en Settings → Actions → General. **Habilitado el 2026-09-08** y probado de punta a punta: sin él, el job muere con `GitHub Actions is not permitted to create or approve pull requests (createPullRequest)`; con él, el PR se abre. Si alguna vez se apaga, el circuito degrada sin perder nada: la rama igual queda pusheada y el PR se abre a mano.

**El costo de ese permiso, y cómo se paga.** GitHub no separa las dos mitades: para que Actions pueda *crear* un PR, también puede *aprobarlo*. Y una aprobación emitida por un workflow puede contar como revisión, que es justo lo que hace falta para que algo se mergee sin que nadie lo haya mirado. El reparo lo levantó el dueño al habilitarlo, y es correcto.

Se paga con un trinquete, no con una promesa: el job **`Ningún workflow aprueba PRs`** de [`security.yml`](../../.github/workflows/security.yml) corre en cada PR y pone el CI en rojo si algún workflow gana una llamada de aprobación. Hoy ninguno la tiene. Los patrones viven en `.github/no-aprobar-pr.grep`, **fuera** de `workflows/`, para que el grep no se encuentre a sí mismo y para que el escaneo cubra también al archivo que lo ejecuta.

Ese job cubre lo que pasa *dentro* del repo. Lo que no puede cubrir es el otro lado: que `main` exija revisión humana y que el auto-merge esté apagado. Eso es configuración de GitHub y hay que mirarlo a mano — desde una sesión de Claude Code la API de protección de ramas devuelve 403.

## A pedido, en cualquier momento

- `/sentry-triage` — el mismo triage, en la sesión abierta. Acepta ventana: `/sentry-triage 7d`
- `pnpm sentry:issues [24h|14d|todo]` — el listado crudo en texto, sin interpretación. Necesita `SENTRY_READ_TOKEN` con scope `event:read` en `.env.production`; el `SENTRY_AUTH_TOKEN` del build **no sirve** (solo tiene `project:releases`, devuelve 403)

## Lo que hay adentro del proyecto de Sentry no son todos errores

Al 2026-09-04, de las 10 issues sin resolver de los últimos 14 días, **una sola** era un error de código. El resto:

- **6 `web-vital:*`** (LCP, TTFB, INP, FCP, CLS, FID) — métricas de performance que el SDK del navegador manda como issue cuando se pasan del presupuesto de `src/shared/observability/latency-budgets.ts`. Son números, no fallas.
- **3 `health.ping.degraded` / `Health ping degraded: <servicio>`** — la sonda del worker avisando que un subsistema no contestó. Importa si el servicio es `database` o `pg-boss`, o si el mismo se repite varias horas.

El primer triage automático (2026-09-05) usó justamente esa segunda regla para levantar un hallazgo real: `resend` figuraba caído en 9 horas distintas del día. **Era falsa alarma y el hallazgo igual valía.** Resend estaba arriba, el dominio verificado y los mails entregándose; lo que fallaba era la sonda, que declaraba la caída con el primer fetch que no llegaba, sobre un enlace que pierde cerca del 3% de las conexiones. Corregido: el fallo de red se confirma en tres intentos antes de reportarse, y un status HTTP sigue alertando en el acto porque es la respuesta autoritativa del servicio.

Por eso el triage empieza filtrando: sin ese filtro, el 90% del reporte es ruido y se deja de leer (doc17 §5.1).

## Lo que sigue sin estar

- **`CRIT-03` de verdad** (metric alert rule sobre tasa de errores): no configurada. Es de consola, no de código.
- **Canal WhatsApp** para críticas (doc17 §5.2): sigue siendo diseño objetivo. Hoy todo va por mail y por la notificación de Claude.
- **Aviso instantáneo a Claude.** El mínimo de una Routine es horario, así que el piso de latencia del diagnóstico automático es una hora si se sube la frecuencia, y un día con la config actual. El aviso **a vos** sí es instantáneo: lo manda Sentry por mail.
- **La notificación push de la Routine.** Nunca se confirmó que llegue. Por eso el canal real es el pull request y no la notificación.
- **Que la sesión automática abra el PR por su cuenta.** No se puede y no vale la pena insistir: no tiene GitHub, y la vía por `curl` depende de un clasificador de permisos que ya la bloqueó una vez. El workflow no depende de nada de eso.
