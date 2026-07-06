# OPS-48-001 — Protocolo de las primeras 48 horas post-lanzamiento

> **Propósito**: guía de supervisión activa para las primeras 48 horas después de que TurnoGol sale a Producción. Somos un equipo chico (potencialmente una sola persona de guardia) lanzando con 1-2 complejos piloto. Este documento define qué mirar, cada cuánto, cómo verificar manualmente que lo crítico funciona, cuándo hacer rollback vs. roll-forward, y cómo comunicar una caída.

> [!IMPORTANT]
> Este protocolo se lee **antes** de lanzar, se sigue **durante** las 48 horas, y se archiva con evidencia al cerrar. No reemplaza a `docs/spec/doc19_runbook.md` (procedimientos de emergencia detallados) — lo complementa con la cadencia de vigilancia específica de la ventana de lanzamiento. Ante cualquier incidente SEV-1/SEV-2, saltar directo a doc19 §3.

**Relacionados**: `docs/spec/doc19_runbook.md` (runbook canónico), `docs/operations/LAUNCH.md` (checklist pre-launch), `turnogol-launch-addendum-dia0.md` (draft original de este ticket).

**Evidencia de esta ventana**: registrar hallazgos, chequeos hechos y horarios en `docs/operations/RUNBOOK_LAUNCH.md` (crear el archivo si no existe — a la fecha de este documento no existe todavía). Cada bloque de revisión de la sección 1 debe dejar un registro ahí, aunque sea una línea tipo `[HH:MM] OK — sin novedades`.

---

## 0. Antes de arrancar el reloj

- [ ] `docs/operations/LAUNCH.md` completo (todos los `- [ ]` tildados)
- [x] Riesgo aceptado explícitamente: **NO hay kill switch implementado en código** (`DISABLE_PUBLIC_BOOKING` / `DISABLE_MP_PAYMENTS` / `FORCE_MANUAL_CONFIRMATION` no existen en `src/` — ver §5.2). El único lever disponible ante un incidente es rollback de Vercel (§3) o un fix manual en DB. **Riesgo aceptado por: el Fundador** (ver `docs/launch/RISK_REGISTER.md` TG-P0-KILLSWITCH-01).
- [ ] Accesos de doc19 §1.1 probados por la persona de guardia (Vercel, Supabase, Sentry, MP, Resend, UptimeRobot)
- [ ] `equipo@turnogol.app` / grupo de emergencias con destinatarios correctos, no placeholders
- [ ] Complejo(s) piloto avisados de que están en fase supervisada (para bajar expectativas si hay fricción)
- [ ] `docs/operations/RUNBOOK_LAUNCH.md` creado con timestamp de "Hora 0" (momento del primer deploy a prod)

---

## 1. Monitoreo Activo

### 1.1 Cadencia por bloque horario

| Bloque | Frecuencia | Foco |
|---|---|---|
| **0h – 2h** | Cada 15 min | Deploy recién salió; ventana de mayor riesgo de regresión no detectada en CI |
| **2h – 6h** | Cada 60 min | Confirmar estabilidad, primeras interacciones reales de usuarios |
| **6h – 24h** | Cada 3 horas | Uso normal del piloto, conciliación de pagos del día |
| **24h – 48h** | 3x/día (mañana / tarde / noche) | Cola larga: jobs de madrugada, quiet hours de push, cron diarios |

Si en cualquier bloque aparece una métrica fuera de umbral (ver §1.2/§1.3), **no esperar al próximo chequeo programado** — investigar de inmediato y, si corresponde, escalar según doc19 §2.2.

### 1.2 Vercel

| Métrica | Dónde mirar | Umbral OK | Umbral de alerta |
|---|---|---|---|
| Latencia p50 (funciones) | Vercel → Observability → Monitoring | < 200ms | > 400ms sostenido 10 min |
| Latencia p95 — grilla | Vercel → Observability → Monitoring | < 500ms — ver doc17 §4.1 | > 800ms sostenido 5 min |
| Latencia p95 — dashboard | Vercel → Observability → Monitoring | < 800ms — ver doc17 §4.1 | > 1.500ms sostenido 5 min |
| Latencia p99 | Vercel → Observability → Monitoring | < 1.500ms | > 3.000ms sostenido 5 min |
| Tasa de errores 5xx | Vercel → Observability → Errors, filtrar por status | < 0.5% de requests | > 1% en ventana de 15 min → SEV-2 |
| Tasa de errores 4xx | Vercel → Observability → Errors | < 5% de requests (esperable por validaciones/holds vencidos) | > 15% sostenido → revisar si es un bug de contrato de API, no solo ruido |
| Cold starts / duración de función | Vercel → Observability → Functions, columna Duration | p95 < 1s incluyendo cold start | Cold starts > 3s repetidos en el mismo endpoint → candidato a warmup o revisar bundle size |
| Function invocations con error (timeout) | Vercel → Functions → Errors | 0 timeouts | Cualquier timeout en `/api/webhooks/mercadopago` es SEV-2 inmediato (MP puede desactivar el webhook tras fallos repetidos) |

> Nota: Vercel Free/Pro no tiene alerting nativo configurable por umbral fino en todos los planes — si no hay alertas automáticas, el chequeo manual de esta tabla ES la alerta durante las 48h.

### 1.3 Supabase

| Métrica | Dónde mirar | Umbral OK | Umbral de alerta |
|---|---|---|---|
| Conexiones activas vs. límite del pool | Supabase → Database → Connection Pooling | < 70% del pool | > 90% → riesgo de "too many connections" (ver doc19 §3.3) |
| CPU % | Supabase → Reports → Database | < 60% sostenido | > 85% sostenido 10 min |
| Memoria % | Supabase → Reports → Database | < 70% sostenido | > 90% sostenido 10 min |
| Disk IO / Disk usage | Supabase → Database → Disk Usage | Sin crecimiento anómalo | Cerca del límite del plan, o crecimiento > 20%/día no explicado por volumen esperado |
| Query performance / slow queries | Supabase → Database → Query Performance | Sin queries > 1s recurrentes | Cualquier query recurrente > 2s, o cualquier query bloqueante (lock) > 5 min — usar `pg_stat_activity` (doc19 §3.3 paso 4) |
| Replication lag | Supabase → Database → Replication (si hay read replica configurada) | N/A en v1 (sin replica en el plan de lanzamiento) — verificar si esto cambió antes de asumir que no aplica | Si aplica: > 5s de lag |
| Estado de `pgboss.job` (workers) | SQL Editor: `SELECT name, state, COUNT(*) FROM pgboss.job GROUP BY name, state` | Mayoría en `completed`, pocos `created` (cola corta) | Acumulación de `created` sin bajar (worker caído) o `failed` creciendo — ver §2.3 |

### 1.4 Registro del chequeo

Cada revisión (sea programada o disparada por alerta) deja una línea en `RUNBOOK_LAUNCH.md` con: hora, bloque, quién revisó, métricas fuera de umbral (si hubo), acción tomada. Esto es lo que después sirve para el criterio de cierre (§5).

---

## 2. Verificaciones Manuales

Estas son verificaciones de flujo end-to-end específicas de TurnoGol, no solo métricas de infraestructura. Correr la primera vez que ocurre cada evento real (primer pago, primera reserva, primer email) y repetir muestralmente durante la ventana de 48h.

### 2.1 Primer pago real de MercadoPago

- [ ] Confirmar env de producción: `MP_CLIENT_ID` / `MP_CLIENT_SECRET` seteados (se validan además vía `GET /api/status`, ver dos bullets más abajo), `ENCRYPTION_KEY` seteado y sin cambiar desde que se guardaron los tokens del tenant piloto, y `MP_WEBHOOK_SECRET` seteado. En prod, sin `MP_WEBHOOK_SECRET`, `verifyWebhookSignature` (`src/modules/payments/webhook-auth.ts`) rechaza todo — confirmar que esto NO está pasando (si pasa, ningún pago va a confirmar nunca). **Nota**: `MP_ACCESS_TOKEN`/`MP_PUBLIC_KEY` NO existen en este proyecto (no están en `src/shared/env.ts` ni en ningún otro lugar de `src/`) — el token que efectivamente cobra la seña vive en DB por tenant (`tenants.mp_access_token`/`mp_refresh_token`, vía OAuth, cifrado at-rest con `ENCRYPTION_KEY`, ver `mp-oauth.ts`), no en una env var global.
- [ ] Confirmar que el tenant piloto completó el flujo OAuth de MP: `tenants.mp_access_token` / `tenants.mp_refresh_token` no nulos (flujo `/api/mp/oauth-start` → `/api/mp/callback`). Sin esto, no hay credenciales con las que cobrar la seña de ese tenant, sin importar qué diga el resto del checklist de env vars.
- [ ] Confirmar que `MP_WEBHOOK_TEST_BYPASS_SECRET` **no** está seteado en producción.
- [ ] `GET /api/status` (`src/app/api/status/route.ts`) devuelve `{ status, checks: [...], timestamp }` — no hay clave de primer nivel `"mercadopago"`. Confirmar que el array `checks` contiene un objeto `{ "name": "mercadopago", "status": "ok" }` (ej. `curl .../api/status | jq '.checks[] | select(.name=="mercadopago")'`), que valida `MP_CLIENT_ID`/`MP_CLIENT_SECRET` usados en el OAuth por tenant.
- [ ] Tras el primer pago real: en Sentry (breadcrumbs), buscar la secuencia `mp.webhook.received` → `payment.deposit.approved` (o `.rejected`) con `mpEventId`/`tenantId`/`mpPaymentId`/`bookingId`. Si aparece `mp.webhook.failed` o "Job process-mp-webhook failed" (DLQ), el retry de pg-boss se agotó — revisar logs y reintentar manual si hace falta.
- [ ] En Supabase SQL Editor (service role):
  ```sql
  SELECT * FROM processed_webhooks WHERE mp_event_id = '<id>';
  -- debe existir UNA sola fila (idempotencia por UNIQUE mp_event_id)

  SELECT id, status, mp_payment_id, mp_preference_id, amount, processed_at
  FROM payments WHERE mp_payment_id = '<id>';
  -- status debe ser 'approved', NO 'pending' ni 'in_process'
  ```
  `in_process` no confirma la reserva (ver `payment.service.ts` → `dispatchPaymentInfo`) — si el pago queda ahí, no es un bug, es un estado intermedio de MP; verificar que eventualmente transicione.
- [ ] Verificar la reserva asociada:
  ```sql
  SELECT status, deposit_status, deposit_amount FROM bookings WHERE id = '<booking_id>';
  ```
  `status` debe pasar de `pending_payment` a `confirmed` vía `transitionFromPendingPayment`. Si `info.amount` de MP es menor a `deposit_amount`, igual confirma pero deja rastro en `audit_logs` — revisar esa tabla si el monto no cierra.
- [ ] Panel admin `/reservas/[id]`: sección "Seña" muestra monto y `depositStatus` aprobado sin refrescar (Realtime). Confirmar que llegó la notificación push al admin (salvo pago entre 00:00–08:00 ART, agendado a las 08:00 por quiet hours — no es un bug si no sonó de madrugada).
- [ ] Si el webhook no llegó pero MP muestra el pago aprobado en su dashboard: esperar el job `reconcile-pending-payments` (corre cada 5 min, solo actúa sobre bookings con > 5 min de antigüedad) — confirma vía `dispatchPaymentInfo`, loguea `payment.reconcile.confirmed`.
- [ ] Gotcha HMAC: si `/api/webhooks/mercadopago` devuelve 401, descartar primero el mismatch de mayúsculas/minúsculas en `data.id` (la firma arma el manifest con `id:${dataId.toLowerCase()}`, y MP a veces manda IDs alfanuméricos en mayúsculas tipo `ORD01...`) antes de sospechar del secret.
- [ ] Si MP está lento/caído: `mp-breaker.gateway.ts` abre el circuito por tenant tras 3 fallos consecutivos (`CircuitOpenError`, cooldown 60s) — buscar "Circuit breaker open" en logs antes de asumir que el pago se perdió; es transitorio, webhook/reconcile reintentan solos.

### 2.2 Resend — deliverability de los primeros emails

- [ ] Confirmar `from` real enviado coincide con el dominio verificado en Resend. El código usa `no-reply@turnogol.app` (`src/modules/notifications/email.provider.ts`) — **ojo**: `docs/operations/LAUNCH.md` menciona `noreply@<dominio>` sin guion. Verificar cuál es el que realmente está verificado (SPF/DKIM/DMARC) en Resend antes de asumir; si no coinciden, el `from` real puede no tener DNS auth y caer en spam.
- [ ] Resend Dashboard → Domains → `turnogol.app` en estado "Verified".
- [ ] Verificar con mxtoolbox.com (spf.aspx, dkim.aspx, dmarc.aspx sobre `resend._domainkey.turnogol.app`) que los 3 registros resuelven.
- [ ] Mandar al menos 1 email real de cada tipo crítico en las primeras horas y confirmar bandeja de entrada (no spam) en un cliente real (Gmail/Outlook), no solo "sent" en el dashboard: confirmación de reserva, alerta de no-show, alguna del ciclo de suscripción si aplica.
- [ ] Revisar Resend Dashboard → Emails: bounce rate y complaint rate de las primeras 48h. **No hay webhook de bounce/complaint integrado a la app** — este chequeo es 100% manual, no va a aparecer en Sentry ni en `/api/status`.
- [ ] Confirmar que el worker `send-email` (`src/shared/jobs/workers/send-email.worker.ts`, cron cada minuto) está procesando la tabla `notifications`: `SELECT status, COUNT(*) FROM notifications GROUP BY status;` — nada debería quedar en `queued` por más de un par de minutos.
- [ ] **Gap conocido a tener presente, no a "arreglar" en caliente**: el magic link de jugadores y la confirmación de alta de staff van por Supabase Auth (`signInWithOtp` / `auth.resend`), NO por el pipeline de Resend. Si no hay SMTP custom de Supabase Auth apuntando a Resend, esos correos usan el sender compartido de Supabase con reputación/rate limits distintos — si un jugador dice "no me llegó el magic link" pero las confirmaciones de reserva sí llegan, este es el primer sospechoso, no Resend.

### 2.3 Otros chequeos críticos de este SaaS

- [ ] **Primera reserva online end-to-end**: crear/observar una reserva real desde el perfil público de un complejo hasta `confirmed`, sin intervención manual en DB. Confirmar que aparece en la grilla admin en tiempo real (Realtime Supabase).
- [ ] **Primer webhook de suscripción SaaS** (si el piloto ya paga la suscripción de TurnoGol, no solo señas de jugadores): confirmar en `processed_webhooks` y que `tenant_subscriptions`/`tenants.status` reflejan el estado correcto.
- [ ] **Cron/workers de pg-boss corriendo**: `send-email`, `reconcile-pending-payments`, liberación de holds vencidos, y el worker de envío de push (`registerPushSendWorker`, `push.worker.ts` — aplica el delay de quiet hours al encolar vía `startAfter`/`pushSendOptions`/`quietHoursReleaseAt` en `push-quiet-hours.ts`; no es una cola ni worker separado, no va a aparecer como "quiet-hours" en el `GROUP BY name` de abajo). Verificar con la query de `pgboss.job` de §1.3 que ninguno está "created" acumulando sin procesar.
- [ ] **Holds expirados se liberan solos**: crear un hold de prueba (o esperar uno real vencido) y confirmar que el slot vuelve a estar disponible sin intervención manual.
- [ ] **Rate limiting de holds activo** (INV-ABUSE-001): confirmar en logs/Sentry que el rate limit por IP/tenant está bloqueando abuso, no solo desplegado en el código.
- [ ] **Aislamiento cross-tenant**: si hay 2+ tenants activos en esta ventana, hacer al menos una verificación cruzada manual (un admin del tenant A no puede ver reservas/jugadores del tenant B) — no esperar a un reporte de usuario para descubrir un leak.

---

## 3. Matriz de Rollback vs. Roll-forward

**Rollback** (Vercel "Promote to Production" al deploy anterior, < 2 min, ver doc19 §3.2 Opción A) revierte SOLO el código de la aplicación. **No** revierte migraciones de DB ya aplicadas, ni datos ya escritos, ni configuración externa (env vars, webhooks registrados en MP). Si el problema está en la capa de datos, rollback de Vercel por sí solo no alcanza y puede dejar el código viejo hablando con un schema nuevo (peor que el problema original).

| Escenario | Acción | Por qué |
|---|---|---|
| **500 masivo en checkout de pagos** (crear preferencia MP, procesar webhook) tras un deploy reciente | **Rollback inmediato** | Es plata de terceros en juego; cada minuto de downtime en pagos es reserva perdida o seña no cobrada. Volver a la versión que andaba es más rápido que debuggear en caliente. |
| **Fallo de migración de DB** (migración corrió parcial, o corrió pero el código nuevo depende de una columna/tabla que no terminó de aplicarse) | **Depende — evaluar reversibilidad de la migración primero, NO solo rollback de Vercel** | Si la migración es aditiva y reversible (agregó columna nullable, índice), rollback de Vercel alcanza: el código viejo ignora lo nuevo. Si la migración es destructiva/irreversible (dropeó columna, renombró, backfill que ya corrió), rollback de Vercel deja el código viejo corriendo contra un schema que ya cambió — **hay que roll-forward con un fix específico de datos**, no solo volver de código. Nunca revertir una migración aplicada sin plan explícito (regla del proyecto: nunca modificar migraciones ya mergeadas). |
| **Bug cosmético** (estilo roto, typo, layout en un dispositivo) | **Roll-forward** (fix chico + deploy normal) | No afecta operación ni dinero. Un rollback completo perdería cualquier otro cambio bueno que haya ido en el mismo deploy. SEV-4, sin apuro. |
| **Fallo de un flujo secundario no crítico** (ej: reportes no cargan, un endpoint lento que no bloquea reservar/pagar) | **Roll-forward** si se puede aislar el fix rápido; **rollback** solo si no se puede aislar y el flujo roto está mezclado con código crítico en el mismo deploy | Preferir el fix quirúrgico. Rollback es la herramienta de "no sé qué pasó y necesito parar el sangrado ya", no la default para todo. |
| **Caída total del sitio** (health check no responde, 5xx en todo) | **Rollback inmediato** si el último deploy fue hace < 30 min (doc19 §3.1); si no, es infra (Vercel/Supabase/DNS), no deploy — ver doc19 §3.1 diagnóstico completo | Regla de oro de doc19: deploy reciente + caída total = correlación fuerte, revertir primero y preguntar después. |
| **RLS mal aplicada / riesgo de leak cross-tenant** | **NO es solo un rollback de código — tratar como SEV-1 de seguridad de datos** (doc19 §2.1, §3.9). Rollback de Vercel para cortar el código que expone el leak, pero además: revisar si ya hubo exposición real (Sentry/logs/audit_logs), y si la policy RLS rota está en una migración ya aplicada, corregirla con una migración nueva de inmediato (no dejar la ventana abierta esperando el próximo deploy normal) | Un leak cross-tenant no se "revierte" solo con volver el código atrás si la policy de la DB sigue mal — el riesgo vive en la DB, no en el frontend. Requiere activar protocolo de incidente de datos (doc18 §9) en paralelo al rollback técnico. |
| **Webhook de MP no llegando** (pero MP procesa el pago del lado de ellos) | **Roll-forward / no-rollback** — no es un bug de deploy, es conectividad/config del webhook | Rollback no arregla una URL de webhook mal configurada en el dashboard de MP ni un secret vencido. Diagnosticar con doc19 §3.4; mientras tanto, `reconcile-pending-payments` cubre la brecha cada 5 min sin intervención. |

**Regla general**: si dudás entre rollback y roll-forward y el reloj corre, rollback. Es reversible y barato (< 2 min). Roll-forward mal apurado agrega un segundo bug encima del primero.

---

## 4. Procedimiento de Comunicación en Caso de Caída

### 4.1 Roles

| Rol | Responsabilidad | Quién (completar antes del lanzamiento) |
|---|---|---|
| **Incident Commander (IC)** | Declara el incidente, decide severidad (doc19 §2.1), coordina, decide rollback vs. roll-forward, da el OK de cierre | el Fundador |
| **Comms** | Redacta y envía updates a clientes, mantiene el canal interno informado, arma el mensaje de resolución | el Fundador |
| **Fix** | Ejecuta el diagnóstico técnico y el rollback/fix | el Fundador |

En un equipo de una sola persona, los 3 roles son la misma persona, pero **igual hay que pasar explícitamente por los 3 pasos** (declarar, comunicar, arreglar) — no saltar directo a arreglar en silencio, porque el complejo piloto necesita saber que algo pasó antes de que llame preguntando.

### 4.2 Quién declara el incidente

Cualquiera del equipo que detecte una métrica fuera de umbral (§1) o una verificación manual fallida (§2) declara el incidente. No hace falta consenso — declarar de más y descartar después es más barato que tardar en reaccionar.

### 4.3 Canal interno

No hay Slack en este proyecto. Coordinación por el **Grupo Email "TurnoGol Emergencias"** (doc19 §1.2). Si el incidente es SEV-1, doc19 exige además llamada telefónica (no alcanza con email para SEV-1).

### 4.4 Status page

**No existe status page pública** (no Instatus, no statuspage.io). Para esta ventana de 48h, "status page" es:
- Un email directo a los complejos piloto (son 1-2 destinatarios conocidos, no una lista masiva) usando `soporte@turnogol.app` como remitente.
- Si en el futuro se suma más de un puñado de tenants, evaluar una herramienta dedicada — **no** está en el alcance de este documento decidirlo ahora, se reporta como pendiente.

### 4.5 Cadencia de actualizaciones a clientes

| Severidad | Primer contacto | Updates mientras dura | Cierre |
|---|---|---|---|
| SEV-1 | Inmediato (< 15 min de declarado) | Cada 30 min hasta resolver | Email de resolución + causa breve, apenas se confirma que está estable |
| SEV-2 | Dentro de los 30 min | Cada hora si sigue abierto | Email de resolución |
| SEV-3 | Solo si el cliente ya lo reportó | No hace falta update proactivo | Opcional, según el caso |
| SEV-4 | No aplica | No aplica | No aplica |

### 4.6 Plantilla — mensaje inicial

```text
Asunto: [TurnoGol] Estamos investigando un problema con [servicio/funcionalidad]

Hola,

Detectamos un problema con [descripción breve, en términos de qué no pueden
hacer: "no se pueden crear reservas online" / "los pagos con MercadoPago no
se están confirmando"]. Empezó aproximadamente a las [hora].

Ya estamos trabajando en la solución. Te vamos a mantener al tanto cada
[30 min / 1 hora] hasta que esté resuelto.

Mientras tanto, [alternativa si aplica: "podés seguir cargando reservas
manualmente desde el panel" / "podés cobrar la seña en efectivo o
transferencia"].

Perdón por las molestias.

Equipo TurnoGol
```

### 4.7 Plantilla — mensaje de resolución

```text
Asunto: [TurnoGol] Resuelto — [servicio/funcionalidad]

Hola,

El problema que reportamos a las [hora] ya está resuelto desde las [hora].

Causa: [una línea, sin tecnicismos innecesarios — ej: "un despliegue reciente
tenía un error que afectaba la confirmación de pagos"].

Qué hicimos: [una línea — ej: "revertimos a la versión anterior estable y
vamos a corregir el problema con más cuidado antes de volver a desplegar"].

Si algo no cierra de tu lado (una reserva que quedó rara, un pago que no
se ve confirmado), respondé este mail o escribinos a soporte@turnogol.app
y lo revisamos puntualmente.

Gracias por la paciencia.

Equipo TurnoGol
```

Reglas de comunicación (heredadas de doc19 §6): sin culpar a terceros por nombre en la comunicación externa aunque la causa raíz sea de un proveedor, sin prometer plazos que no se puedan cumplir, tono directo y sin jerga técnica.

### 4.8 Post-mortem

Todo SEV-1/SEV-2 durante esta ventana genera un post-mortem blameless (template de doc19 §7) **antes** de las 48h de cierre si es posible, o inmediatamente después. Se linkea desde `RUNBOOK_LAUNCH.md`.

---

## 5. Cierre del Protocolo

### 5.1 Criterio de éxito para dar por superadas las 48 horas

Se puede pasar a monitoreo normal si, revisando `RUNBOOK_LAUNCH.md` al final de la ventana, se cumple:

- [ ] Cero incidentes SEV-1 sin resolver o sin post-mortem
- [ ] Cero incidentes SEV-2 abiertos (todos resueltos o degradados a SEV-3 con plan)
- [ ] Ningún pago aprobado en MP quedó sin reconciliar en `payments`/`bookings` (§2.1)
- [ ] Ninguna reserva confirmada duplicada ni doble-booking detectado
- [ ] Ningún caso de datos de un tenant visibles para otro (§2.3)
- [ ] Ningún hold trabado (no liberado) más allá de su expiración esperada
- [ ] Métricas de Vercel/Supabase dentro de los umbrales de §1.2/§1.3 en el último bloque de revisión (24h-48h)
- [ ] Al menos [N] reservas y [M] pagos reales procesados sin error manual — completar N/M según el volumen real esperado del piloto antes de lanzar, para que el criterio no sea "cero actividad, cero errores" (falso positivo de éxito)
- [ ] El/los complejo(s) piloto confirmaron que pudieron operar sin fricción bloqueante

Si **cualquiera** de los ítems de NO-GO no se cumple (fuga cross-tenant, pago aprobado que no confirma, DB no restaurable, no poder apagar pagos/reservas rápido), **no se cierra el protocolo** aunque hayan pasado las 48 horas — se extiende la supervisión hasta resolver la causa raíz y volver a evaluar.

### 5.2 Próximos pasos al cerrar

- [ ] Bajar la cadencia de chequeo a la de operación normal (definir cadencia post-48h — no está en alcance de este documento, referenciar el monitoreo estándar de doc17)
- [ ] Archivar `RUNBOOK_LAUNCH.md` de esta ventana con fecha, o iniciar uno nuevo para la próxima ventana de riesgo (ej: cuando se sume el próximo tenant, o al activar campañas de adquisición)
- [ ] Revisar pendientes detectados durante la ventana que no eran bloqueantes (ej: gap de bounce/complaint de Resend sin webhook automatizado, kill switches `DISABLE_PUBLIC_BOOKING`/`DISABLE_MP_PAYMENTS`/`FORCE_MANUAL_CONFIRMATION` que siguen sin implementar en código) y priorizarlos en el backlog
- [ ] Actualizar doc19 si algún procedimiento de emergencia se usó y reveló un paso faltante (regla de doc19 §11: actualizar después de cada incidente)
- [ ] Recién ahí evaluar activar campañas de adquisición o sumar tenants adicionales sin supervisión manual dedicada
