# P-12 — El worker caído: nadie avisó

**Ejecutado**: 2026-08-24, 14:11–14:37 ART (17:11–17:37 UTC), en **producción**.
**Cómo**: se removió el deployment activo del servicio `turno-gol-repo` en Railway. El servicio quedó *"Service is offline — there is no active deployment"* durante **26 minutos**.

## El resultado

**No llegó ninguna alerta.** Ni Sentry, ni el health-ping, ni un mail. La caída se detectó únicamente porque la estábamos provocando a propósito.

Ese era el punto del ensayo, y el hallazgo importa más que cualquier bug de pantalla: **hoy, si el worker se cae un domingo a la noche, el primer cliente se entera antes que el dueño.**

## Por qué nadie avisó — las cuatro razones, todas verificadas

### 1. La sonda de salud vive adentro del worker
`health-ping.worker.ts` corre cada 5 minutos **dentro del proceso del worker** y reporta a Sentry si algo está caído. Cuando el proceso muere, la sonda muere con él: no existe el mecanismo que justamente detecta esta clase de falla (un *dead-man's switch*, algo externo que se queje cuando deja de recibir señales).

Evidencia: último health-ping **completado** a las 17:10:12. Los siguientes tres —17:15:41, 17:20:47, 17:26:58— quedaron en estado `created`, encolados, sin que nadie los tomara.

### 2. No hay cron monitors de Sentry
Cero `Sentry.captureCheckIn` en todo el código. Sentry solo ve lo que un proceso vivo le manda; un proceso muerto no manda nada.

### 3. No hay monitor externo
El checklist de la Fase B11 lo dejó pendiente (`- [ ] /api/status + /api/health monitor externo configurado`), y se confirmó midiendo: en 45 minutos, `/api/status` recibió **2 requests, y los dos fueron míos**. Un UptimeRobot gratuito pegando cada 5 minutos habría dejado ~9.

### 4. Y aunque lo hubiera, no serviría: `/api/status` responde `ok` con el worker muerto
Medido tres veces durante la caída:

```
{"status":"ok","timestamp":"2026-08-24T17:28:33.075Z"}
```

El check de pg-boss del endpoint prueba la **conexión** a pg-boss desde la web, no si hay algún proceso consumiendo la cola. Con el worker enterrado, ese check pasa igual.

El dato correcto sí existe: `/api/admin/system-status` expone `lastHealthPing`. Pero es una pantalla que alguien tiene que ir a mirar, no una alerta.

## Qué se rompió mientras tanto (y qué no)

**La web siguió funcionando.** Se creó una reserva desde la grilla con el worker caído, sin errores. No hay acoplamiento entre la web y el worker: eso está bien.

**El trabajo de fondo se detuvo por completo.** A los 17 minutos había **26 jobs encolados sin que nadie los tomara**:

| Cola | Encolados | Qué significaba en la práctica |
|---|---|---|
| `send-email` | 15 | el barrido de notificaciones (corre cada minuto) no salió: ningún mail al jugador |
| `health-ping` | 3 | la sonda que debía avisar del problema |
| `expire-pending-booking-sweep` | 3 | las reservas impagas no expiran: **slots ocupados por gente que no pagó** |
| `reconcile-pending-payments` | 3 | pagos cobrados en MercadoPago que no se confirman contra la reserva |
| `reconcile-subscriptions` | 1 | |

## La recuperación: automática y sin pérdida

Se restauró el deployment a las 17:36. En menos de dos minutos el worker drenó todo lo acumulado:

- **36 jobs completados** en los 5 minutos posteriores
- **0 fallidos**
- health-ping vuelve a completar a las 17:37:28
- cero intervención manual

Eso es la buena noticia del ensayo: **una caída del worker no pierde trabajo, lo retrasa**. pg-boss guarda los jobs en la base y el worker los toma al volver. El daño de una caída es proporcional a cuánto tarde alguien en enterarse — que hoy es "hasta que un cliente reclame".

## La recomendación

El arreglo más barato usa datos que ya existen y no agrega infraestructura:

1. Que `/api/status` devuelva **`degraded`** cuando el último `health-ping` completado tenga más de ~15 minutos. El dato ya se lee en `/api/admin/system-status`; es mover esa consulta al endpoint público.
2. Un monitor externo gratuito (UptimeRobot o similar) apuntando a `/api/status`, con aviso al mail del dueño.

Con esos dos pasos, el worker caído deja de ser invisible: la sonda que muere con el proceso pasa a ser justamente la señal que se extraña desde afuera.

## Hallazgo colateral

`retry-refunds: settle failed` acumula **85 eventos en 24 h** en Sentry (último: 17:00:13, antes del ensayo). Es un monitor encendido de forma permanente, con la misma forma que el caso ya documentado en el que "un reembolso correcto encendía la alarma". No se investigó acá para no mezclar dos cosas; queda anotado.

---

## Estado del arreglo

**Paso 1 — hecho.** `/api/status` incorpora el check `worker-heartbeat`: lee el último `health-ping` completado de `pgboss.job`/`archive` y, si tiene más de 15 minutos (tres ciclos del cron de 5), el semáforo pasa a **503** y el detalle va a Sentry. La respuesta pública sigue sin decir qué se midió ni cuánto hace.

Tres decisiones que valen más que el código:

- **Fail-open** si no hay ningún latido registrado o si no se puede leer la tabla. Una alarma que no se puede apagar es peor que ninguna: entrena a ignorarlas. Es el mismo criterio con el que `pingSupabaseAuth` dejó de gritar "supabase-auth down" cada 5 minutos con el login andando perfecto.
- **La antigüedad solo se evalúa en producción.** En local y en CI el worker normalmente no corre, y un latido viejo de la última vez que sí corrió dejaría el endpoint en 503 para siempre — eso frena el gate de readiness de Playwright y con él la suite e2e entera.
- **Tres latidos de gracia, no uno**: un deploy del worker lo reinicia y se saltea un ciclo sin que pase nada.

Cubierto por seis casos en `tests/unit/api-status.test.ts`, incluido el de P-12 exacto (worker muerto con base y pg-boss impecables → 503).

**Paso 2 — pendiente, y es de consola, no de código.** Falta dar de alta el monitor externo (UptimeRobot gratis o equivalente) apuntando a `https://turnogol.app/api/status`, con aviso al mail del dueño. Sin eso, el 503 existe pero nadie lo mira: el `- [ ] monitor externo configurado` del checklist de la Fase B11 sigue sin tildar.
