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

## Guion del día 1 — primer complejo real (lunes 2026-08-03)

> Escrito el 2026-07-29 para el onboarding del complejo piloto (6+ canchas, cobra seña online por MercadoPago). Se ejecuta de arriba a abajo. **Los pasos con 🛑 son puntos donde hay que parar y hacer algo desde el panel antes de que el complejo siga.**

### Antes de que llegue el complejo

| | Qué | Verificación |
|---|---|---|
| ☐ | SuperAdmin operativo | Login en `/super-admin` carga el dashboard. **Sin esto no hay red de seguridad** — es lo que destraba el paso 🛑 de abajo |
| ☐ | Templates de email de Supabase Auth en prod | Ver "Trampa del template de confirmación" abajo |
| ☐ | Dominio `turnogol.app` **Verified** en Resend (SPF + DKIM) | Sin esto no sale ningún email transaccional |
| ☐ | `https://turnogol.app/api/mp/callback` en los redirect URIs de la app de MP | Sin esto el complejo no puede conectar su cuenta |
| ☐ | `pnpm launch:check --probe-only` con `LAUNCH_CHECK_ENV_FILE=.env.production` | `All launch checks passed.` |

### Secuencia de onboarding

1. El dueño del complejo se registra en `https://turnogol.app/register` con su email real.
2. **Le llega el email de confirmación** y hace click.
3. Wizard **paso 1 — Identidad**: nombre, dirección, ciudad, provincia, teléfono, email (los 6 obligatorios). Al guardar se crea el tenant en `trialing`, 30 días.
4. Wizard **paso 2 — Horarios**. Si el complejo cierra después de medianoche, prender `closes_next_day`.
5. 🛑 **PARAR ACÁ — cambiar el plan antes del paso 3.**
6. Wizard **paso 3 — Canchas**: recién ahora puede cargar las 6+.
7. Wizard **paso 4 — Pagos**: "Sí, cobrar seña" → **Conectar MercadoPago** → autoriza con la cuenta MP *del complejo* (no la tuya). Al volver queda `requires_deposit=true`.
8. Cae en `/onboarding/listo` con el CTA para compartir el link por WhatsApp.
9. Primera reserva real de punta a punta, con vos presente: reservar desde `/{slug}/reservar` → pagar la seña → verificar que la grilla la muestre `confirmed` y que **llegue el email de reserva confirmada**.

### 🛑 El paso 5, en detalle (por qué existe)

El trial arranca **siempre** en plan Predio, que tiene un techo de **2 canchas** — está clavado en `createTenantWithTrial` ([tenant.service.ts:80-88](../../src/modules/tenants/tenant.service.ts)). Con 6 canchas, el paso 3 del wizard corta con:

> `Tu plan soporta hasta 2 canchas. Hacé upgrade para agregar más.`

Y el upgrade self-service devuelve **501** (falta la fila `saas_upgrade` en `feature_flags`), así que **desde la app no hay salida**. El único camino es:

**SuperAdmin → Tenants → el complejo → ChangePlan → `estadio`** (canchas ilimitadas).

Notas:
- Funciona **sin** `MP_TURNOGOL_ACCESS_TOKEN` ni cobro: en `trialing` el `mp_subscription_id` es `NULL` y `changePlanForSupport` sólo llama al gateway de MP si existe. No le cobra nada al complejo.
- El tenant **no existe** hasta que termina el paso 1, así que el cambio de plan no se puede hacer antes. De ahí el orden: paso 1 → cambio de plan → paso 3.
- Si el complejo se adelanta y come el error, no se rompe nada: cambiás el plan y reintenta el paso 3.

### Trampa del template de confirmación

El callback de auth acepta **únicamente** `token_hash` ([auth/callback/route.ts:45-52](../../src/app/api/auth/callback/route.ts)) — la rama PKCE `code` fue eliminada. Si el dashboard de Supabase de prod tiene el template default de Supabase, el link del email apunta a `/auth/v1/verify?token=...` y el callback redirige a `/verify?error=invalid`: **el dueño del complejo no puede confirmar su email nunca.**

- Los templates correctos están en `supabase/templates/` (`confirmation.html`, `recovery.html`, `magic_link.html`, `invite.html`). Los de `supabase/config.toml` son **sólo para el entorno local** — hay que pegarlos a mano en Supabase → Authentication → Email Templates.
- **Pegar los archivos completos sin editar**: una doble-llave suelta rompe el parseo del template entero y GoTrue cae en silencio al default en inglés.
- Site URL = `https://turnogol.app` exacto, sin barra final. Redirect URLs debe incluir `https://turnogol.app/api/auth/callback*`.
- **Cómo saber si está bien, en 5 segundos:** mirar el link del email. Si dice `token_hash=` → bien. Si dice `/auth/v1/verify?token=` → mal, y el lanzamiento no puede seguir.

### Post-wizard: anotar el vencimiento del trial

`trial_ends_at` cae a los 30 días (≈ **2026-09-02**). El worker `expire-trials` mueve `trialing` → **`blocked` directo, sin aviso previo**: los templates `trial_welcome`/`trial_ending` existen pero ningún código los encola todavía.

**Poner un recordatorio propio ~5 días antes (≈ 28/08)** para cobrar el plan o extender el trial desde SuperAdmin → ExtendTrial. Si para esa fecha el complejo va a pagar por MercadoPago, revisar antes que `MP_TURNOGOL_ACCESS_TOKEN` y `APP_URL` estén en Vercel (`launch:check --probe-only` ya las verifica) y que el webhook de la suscripción llegue con `?tenant=<uuid>`.

### Palancas de emergencia

Todas se accionan **sin deploy**. Con un solo tenant, alcanzan.

| Si pasa esto | Palanca | Dónde |
|---|---|---|
| Las reservas online rompen | `allow_online_booking = false` | Settings → Reservas, o SuperAdmin → Settings del tenant |
| Los pagos de MP rompen | `requires_deposit = false` → todo pasa a efectivo | idem |
| El panel admin rompe | fila `('suspended', true, <tenantId>)` en `feature_flags` | SQL Editor de Supabase (tarda ~60 s por el TTL del cache) |
| Regresión de código | Promote to Production del deployment anterior | Vercel (ver sección Rollback) |
| El complejo quedó `blocked` por el trial | ExtendTrial | SuperAdmin |
| Falla el reembolso automático de MP al cancelar | Reembolsar a mano en MP + cancelar por soporte | riesgo TG-P0-REFUND-01, ya aceptado |

### Qué NO prometerle al complejo

- **Cambio de plan self-service**: devuelve 501. Los cambios de plan los hacés vos desde SuperAdmin.
- **Reembolso automático garantizado**: al cancelar una reserva con seña, el refund de MP corre dentro de la misma transacción y sin reintento (TG-P0-REFUND-01). Si falla, hay que reembolsar a mano.
- **Avisos automáticos de vencimiento del trial**: todavía no se envían.

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
