# TurnoGol — Runbook de Lanzamiento

## Mínimo demoable para launch

TurnoGol se puede mostrar/vender si:

- un admin puede iniciar sesión;
- un complejo puede tener canchas, horarios y precios configurados;
- un jugador puede ver disponibilidad pública;
- un jugador puede reservar un turno;
- si hay seña, MercadoPago confirma o rechaza sin estado corrupto;
- el admin ve la reserva en grilla;
- una reserva no puede duplicarse;
- un admin no puede ver datos de otro tenant;
- existe rollback operativo;
- existe alerta si falla un webhook o error server crítico.

---

## Deploy

## Rollback

Cada deploy a `main` genera un deployment **inmutable** en Vercel; el anterior sigue accesible hasta que se borre explícitamente. Rollback = repuntar el dominio de producción al build anterior, sin rebuild.

### Opción A — Vercel Dashboard (instant rollback, < 2 min, preferida)

1. `vercel.com` → proyecto TurnoGol → **Deployments**
2. Ubicar el último deployment ✅ **Ready** anterior al deploy roto (buscar por commit SHA/mensaje)
3. Menú `···` → **"Promote to Production"**
4. Confirmar — Vercel propaga en ~30s, no hay rebuild
5. Verificar: `curl -s -o /dev/null -w "%{http_code}\n" https://turnogol.app/api/status` → debe dar `200`
6. Avisar al equipo: "Rollback a `<commit SHA>` completo"

### Opción B — Vía Git (si el Dashboard no responde)

```bash
git log --oneline -5                 # identificar el último commit bueno
git revert <commit-roto> --no-edit   # o un rango: git revert <sha1>^..<sha2>
git push origin main                 # dispara nuevo deploy en Vercel
```

Monitorear el build en Vercel → verificar `/api/status` al terminar.

### Caveat crítico — migraciones de DB

El rollback de Vercel revierte el **código**, no el schema de Postgres. Si el deploy roto incluyó una migración (`src/shared/db/migrations/`), Supabase ya la aplicó — rollbackear el código no la deshace. Por eso toda migración debe ser aditiva/retrocompatible (nunca `DROP COLUMN`/`DROP TABLE` en el mismo PR que se despliega). Si una migración rota ya corrió: escribir una migración de rollback **nueva** (nunca editar/borrar la que ya corrió) y aplicarla junto con el rollback de código.

### Post-rollback

Crear issue en GitHub con el error → investigar sin presión (el servicio ya está restablecido) → fix en branch → review → redeploy con cuidado.

Procedimiento completo de incidente con clasificación de severidad: `doc19_runbook.md §3.2`.

## Webhooks MercadoPago

Los webhooks de MercadoPago procesan pagos de señas y cobros de suscripciones SaaS. Si un cliente reporta que "pagó pero la reserva sigue pendiente":

1. **Revisar la tabla de webhooks procesados**:
   ```sql
   SELECT mp_event_id, event_type, processed_at 
   FROM processed_webhooks 
   ORDER BY processed_at DESC LIMIT 10;
   ```
   Si el evento aparece ahí, fue recibido y procesado por el sistema (si la reserva no se confirmó, revisar Sentry por errores lógicos de negocio). Si no aparece, MercadoPago no lo envió, la firma era inválida, o el worker no lo procesó aún.
2. **Revisar alertas en Sentry (`CRIT-04`)**:
   Los fallos del handler generan alertas. Buscar errores asociados a `mp-webhook.handler.ts`.
3. **Verificar cola de workers (`pg-boss`)**:
   Buscar si hay jobs fallidos en la cola de webhooks:
   ```sql
   SELECT * FROM pgboss.job WHERE name='process-mp-webhook' AND state='failed';
   ```
4. **Replay de Webhook**:
   Si un webhook falló por un problema transitorio (ej. DB caída), MercadoPago lo reintentará automáticamente. Si se necesita forzar, se puede reenviar manualmente desde el panel de developers de MercadoPago, o usar un harness local con bypass (solo en staging o simulando firmas).

## Backups/Restore

**Asunción operativa de este runbook**: Supabase plan **Pro** con **PITR** (Point-in-Time Recovery) habilitado, retención **7 días**.

> ⚠️ Nota de inconsistencia entre docs: `doc19_runbook.md §10.1` documenta 30 días de retención PITR. Supabase ofrece el add-on PITR en niveles de 7/14/28 días a distinto costo — para este lanzamiento se asume el nivel de 7 días. `doc19` queda desactualizado en ese punto puntual; señalado acá, no corregido (fuera de scope de esta tarea).

### Restore point-in-time (dentro de los últimos 7 días)

1. Supabase Dashboard → proyecto prod → **Settings → Database → Backups → Point-in-Time Recovery**
2. Elegir el timestamp deseado (granularidad de segundos, hasta 7 días atrás)
3. Supabase restaura a un **proyecto nuevo temporal** — nunca sobreescribe producción directamente
4. Verificar los datos en el proyecto temporal (counts de `tenants`/`bookings`/`payments`, query en `doc19 §5.2`)
5. Extraer lo necesario:
   - **Preferido**: `pg_dump` selectivo del proyecto temporal → `pg_restore` en prod dentro de una transacción, con `ON CONFLICT` para no duplicar
   - **Último recurso** (asume pérdida de datos posteriores al punto de restore): reemplazar prod por el temporal completo
6. Registrar en `audit_logs` qué se restauró y por qué

### Backup manual (antes de cambios destructivos)

```bash
pg_dump "postgresql://postgres.[ref]:[password]@[host]:5432/postgres" \
  --format=custom --no-owner --no-acl --exclude-schema=pgboss \
  --file=backup_turnogol_$(date +%Y%m%d_%H%M%S).dump
```

Verificar con `pg_restore --list archivo.dump | head -20`. Guardar fuera del servidor (Drive/S3) — nunca versionar en git.

### Estado del drill de restore (RPO/RTO) — ⚠️ pendiente de ejecución real

El procedimiento de simulacro completo ya está escrito en `docs/audit/backup-drills/2026-07-02-drill.md` (RESTORE-001, criterio MASTER_PLAN B11: *"backup restaurado exitosamente al menos 1 vez"*). **No está ejecutado todavía** — bloqueado porque el drill apunta a un proyecto Supabase de **staging** dedicado, y ese proyecto aún no tiene project ref/credenciales reales provisionadas (`STAGING-001` pendiente, ver `docs/operations/LAUNCH.md`). Sin ese proyecto no hay evidencia real de RPO/RTO — el procedimiento queda listo para correr apenas exista el ref.

**Para el GO/NO-GO**: si "backup restaurado con evidencia" es un requisito duro pre-launch, este punto sigue **abierto**. Si alcanza con "procedimiento documentado + backups automáticos de Supabase corriendo", este punto queda **cubierto**.

## Alertas

**Asunción operativa de este runbook**: **Sentry conectado a Slack** vía la integración nativa, como canal único de alertado técnico operacional para v1.

> Nota: `doc17_observabilidad.md §5.2` ya incluye Slack en su tabla de canales ("Alta → Email + Sentry Slack integration"), pero el diagrama resumen de `doc17 §11` todavía dice "Crítica → WA grupo + Email" — inconsistencia menor entre secciones del mismo doc, señalada acá sin corregir (fuera de scope de esta tarea).

### Setup (una vez)

1. Sentry → **Organization Settings → Integrations → Slack** → Add Workspace → autorizar
2. Crear (o reusar) un canal `#turnogol-alertas` en el workspace de Slack
3. Por cada regla de alerta (tabla abajo): Sentry → **Alerts → Create Alert Rule** → condición → acción `Send a Slack notification to #turnogol-alertas`

### Tabla de alertas mínimas (subset accionable de `doc17 §5.3`, recortado para v1)

| ID | Condición | Regla en Sentry | Acción esperada |
|---|---|---|---|
| `CRIT-01` | App completamente caída / health check no responde | **No cubierto por Sentry** (no hay proceso corriendo para reportar) — requiere monitor externo (ej. UptimeRobot) golpeando `/api/status`. Gap explícito, ver nota abajo | Ir a Vercel → si es deploy reciente → rollback (ver sección Rollback) |
| `CRIT-03` | Error rate > 5% en 5 min, producción | Issue Alert: `event.count() > X in 5m`, filtro `environment:production` | Revisar Sentry → si es regresión de deploy → rollback |
| `CRIT-04` | Excepción nueva en el camino crítico de pagos (`MpGatewayError`, `TenantMpNotConnectedError`, o cualquier excepción con `culprit` en `mp-webhook.handler.ts` / `booking.cancellation.ts`) | Issue Alert: `error.type equals MpGatewayError` OR `event.culprit contains "mp-webhook"` | Triage inmediato — puede significar reservas/pagos sin confirmar |
| `HIGH-01` | Errores de API de MercadoPago > 20% en 1h | Metric Alert sobre eventos con `error.type:MpGatewayError` agrupados por hora | Activar modo sin seña, banner en panel admin (`doc19 §3.4`) |
| `HIGH-07` | Cualquier excepción nueva sin resolver en producción | Issue Alert default de Sentry: *"A new issue is created"*, filtro `environment:production` | Triagear en horario laboral |

> **Gap explícito — `CRIT-01`**: Sentry solo reporta errores de una app que sigue corriendo; si el proceso no levanta, no hay nada que reporte a Sentry. Esta alerta necesita un monitor externo (UptimeRobot u equivalente, ver `doc17 §5.5`) — queda fuera del alcance de "Sentry conectado por Slack" pedido para esta sección y se deja como pendiente separado.

### Verificación post-setup

- Forzar un evento de prueba (botón **"Send Test Event"** del dashboard de Sentry, o `Sentry.captureException(new Error('test-alert'))` en un endpoint de test) → confirmar que llega a `#turnogol-alertas` en < 1 min
- Confirmar que el mensaje de Slack linkea al issue correcto en Sentry

## PASOS MANUALES OBLIGATORIOS POST-DEPLOY EN VERCEL

> Bloqueantes de lanzamiento (revisión adversarial pre-launch). `launch:check` solo valida PRESENCIA de estas vars, no que sean reales — con placeholders/dummies pasa en verde pero rompe en runtime. No hacer el anuncio a clientes hasta tildar todo esto.

- [ ] **Credenciales reales en Vercel** (reemplazar cualquier dummy/placeholder usado en local):
  - [ ] `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` reales — con dummy, las políticas fail-closed de rate-limit (`src/shared/rate-limit/policies.ts`) bloquean TODO login/magic-link/registro/PIN en prod (`apply.ts:69-78`: error de conexión → `ok: policy.failMode === 'open'`)
  - [ ] `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` reales — con dummy la app corre pero todos los errores se pierden en silencio (incluida la alerta que delataría el punto anterior)
  - [ ] Verificar en `/api/status` que Redis responde 200 (hace `redis.ping()` real, sí delata un dummy — a diferencia de Sentry que solo chequea presencia)
  - [ ] Forzar un evento de prueba de Sentry (ver sección Alertas más abajo) y confirmar que llega a `#turnogol-alertas`
- [ ] **Primera reserva con seña real contra MercadoPago** (no `MP_MOCK_MODE`, no sandbox): un jugador de prueba reserva un turno con seña en el complejo piloto, se confirma el pago, el webhook llega firmado y la reserva pasa a `confirmed` en la grilla. Es la primera vez que el flujo corre contra la API real de MP en este proyecto — hasta ahora solo se validó con `MP_MOCK_MODE=1` en e2e.
- [ ] Ejercitar el rollback una vez en este mismo deploy-day (Promote to Production del deployment anterior) para confirmar que el procedimiento de la sección Rollback funciona en la práctica, no solo en papel.

## Smoke test post-deploy

## Contactos y accesos

Completá esta tabla con los accesos críticos antes de salir a producción para tenerlos a mano en caso de emergencia.

| Servicio | Portal de Acceso | Titular / Cuenta | Email de Recuperación / Emergencia |
|---|---|---|---|
| **Vercel** (Hosting Web) | vercel.com | | |
| **Railway** (Workers) | railway.app | | |
| **Supabase** (Base de datos y Auth) | supabase.com | | |
| **MercadoPago** (Pagos y Webhooks) | mercadopago.com.ar | | |
| **Resend** (Emails transaccionales) | resend.com | | |
| **Cloudflare R2** (Imágenes) | dash.cloudflare.com | | |
| **Sentry** (Métricas y Alertas) | sentry.io | | |
| **GitHub** (Código y CI/CD) | github.com | | |
