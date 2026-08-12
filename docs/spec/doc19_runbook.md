# DOC 19 — Runbook de Operaciones
## TurnoGol: Qué Hacer Cuando las Cosas Salen Mal

> **Propósito**: Un manual de emergencia para resolver problemas en producción.
> Cuando algo se rompe a las 23:00 un viernes, no queremos pensar — queremos seguir
> pasos claros que están documentados de antemano.

> [!IMPORTANT]
> Este runbook se lee **antes** de que pase algo. Se actualiza **después** de cada incidente.
> Si tuvimos un problema y no actualizamos el runbook, vamos a tener el mismo problema
> dos veces sin saber qué hacer dos veces.

---

## 1. Información de Contacto y Accesos

### 1.1 Accesos críticos

| Servicio | URL | Quién tiene acceso | Cómo acceder |
|---|---|---|---|
| **Vercel** (hosting) | vercel.com/[team]/turnogol | Admin(s) del equipo | Login con GitGub |
| **Supabase** (DB + Auth) | supabase.com/dashboard | Admin(s) del equipo | Login con email |
| **Sentry** (errores) | sentry.io/[org]/turnogol | Todo el equipo de dev | Login con GitHub |
| **GitHub** (código) | github.com/[org]/turnogol | Todo el equipo de dev | Login con SSH/token |
| **MercadoPago** (pagos) | mercadopago.com.ar/developers | Admin de billing | Login con cuenta MP |
| **Resend** (email) | resend.com | Admin del equipo | Login con email |
| **UptimeRobot** (uptime) | uptimerobot.com | Admin del equipo | Login con email |
| **DNS** (dominio) | Registrador del dominio | Admin del equipo | Login con email |

### 1.2 Comunicaciones de emergencia

| Canal | Propósito | Quién está |
|---|---|---|
| **Grupo Email "TurnoGol Emergencias"** | Alertas críticas, coordinación de incidentes | Todo el equipo |
| **Email equipo@turnogol.app** | Comunicaciones formales, post-mortem | Todo el equipo |
| **Email soporte@turnogol.app** | Tickets de clientes | Soporte + Devs |

### 1.3 Status pages de proveedores

| Proveedor | Status Page | Suscribirse a |
|---|---|---|
| Vercel | status.vercel.com | Email alerts |
| Supabase | status.supabase.com | Email alerts |
| Resend | resend.com/changelog | Email alerts |

---

## 2. Clasificación de Incidentes

### 2.1 Niveles de severidad

| Nivel | Definición | Ejemplos | Tiempo de respuesta | Tiempo de resolución |
|---|---|---|---|---|
| **SEV-1** 🔴 | Sistema completamente caído o data breach | App no responde, DB inaccesible, leak de datos cross-tenant | < 15 min | < 1 hora |
| **SEV-2** 🟡 | Funcionalidad crítica degradada | No se pueden crear reservas, MP no procesa pagos, login caído | < 30 min | < 4 horas |
| **SEV-3** 🟢 | Funcionalidad secundaria afectada | Email no envía confirmaciones, reportes no cargan, un endpoint lento | < 2 horas | < 24 horas |
| **SEV-4** ⚪ | Problema cosmético o menor | Typo en la UI, estilo roto en un dispositivo específico | Próximo sprint | Próximo release |

### 2.2 Escalación

```
SEV-4 → Developer asignado resuelve en próximo sprint.
SEV-3 → Developer asignado resuelve en el día. Notificar por email.
SEV-2 → All hands. Notificar por email. Si > 1 hora sin resolución → considerar rollback.
SEV-1 → All hands. Email + llamada telefónica. Rollback inmediato si es deploy.
         Si es data breach → activar protocolo de incidente de datos (Doc 18 §9).
```

> [!NOTE]
> **On-call de 1 persona (Decisión de auditoría 2026-07-21 — TEC-06).** La tabla SEV-1..4 y sus
> tiempos de respuesta/resolución son una **referencia**, no un compromiso contractual. En la
> práctica, con un on-call solo, la decisión colapsa a dos preguntas: *¿está caído o filtrando
> datos/plata?* → actuar ahora (rollback o contención, §3). *¿Puede esperar?* → anotarlo y
> resolverlo en el día/sprint. No hace falta ceremonia de clasificación formal para incidentes
> que resuelve una sola persona; la taxonomía existe para comunicar y priorizar, no para llenar
> un formulario.

---

## 3. Procedimientos de Emergencia

### 3.0 Leer el health check (`/api/status`, alias `/api/health`)

**En producción el endpoint público devuelve SOLO el semáforo.** Eso alcanza para
UptimeRobot (que mira el código HTTP: 200 = ok, 503 = algo caído), pero **no dice
qué se cayó**. El desglose por subsistema (`database`, `worker-pool`, `pg-boss`,
`upstash`, `encryption-key`, `storage`, MP/email/Sentry) exige un token:

```bash
curl -H "x-status-token: $STATUS_TOKEN" https://turnogol.app/api/status
```

- `STATUS_TOKEN` se configura en Vercel (Production). **Si no está seteada, el
  detalle no sale por ningún lado en producción** — el `curl` de arriba devuelve
  el semáforo pelado y hay que caer a los logs de Vercel + Sentry.
- `launch:check` y `staging:check` lo mandan solo si está en su env file.
- Fuera de producción (`pnpm dev`, CI, Playwright) el detalle sale sin token.

**Por qué está cerrado** (B10): el payload completo le anunciaba a cualquiera qué
pieza estaba caída. El caso que obligó a cerrarlo: `upstash: down` significa que
el rate limiter quedó degradado, o sea publicaba la ventana exacta para probar
contraseñas y magic links sin freno.

Los síntomas que este runbook describe como "health check reporta `database:
unhealthy`" se leen con el token puesto.

### 3.1 La App No Responde (SEV-1)

**Síntoma**: Los usuarios reportan que la app no carga. UptimeRobot envía alerta "DOWN". El health check `/api/health` no responde.

```
DIAGNÓSTICO:

  1. ¿Es un problema de Vercel?
     → Ir a status.vercel.com
     → Si hay outage reportado → esperar recovery, comunicar a clientes
     → Si Vercel está OK → paso 2

  2. ¿Es un deploy reciente que rompió algo?
     → Ir a Vercel → Deployments
     → ¿El último deploy fue hace < 30 minutos?
        → SÍ → ROLLBACK INMEDIATO (ver §3.2)
        → NO → paso 3

  3. ¿Es un problema de Supabase?
     → Ir a status.supabase.com
     → Verificar dashboard del proyecto: ¿DB connection pool está al 100%?
     → Si hay outage de Supabase → esperar recovery, comunicar a clientes
     → Si Supabase está OK → paso 4

  4. ¿Es un problema de DNS?
     → Verificar: ping turnogol.app
     → Verificar: nslookup turnogol.app
     → Si no resuelve → revisar registros DNS en el registrador del dominio
     → Si resuelve → paso 5

  5. Error no identificado:
     → Revisar logs en Vercel (últimos 30 minutos)
     → Revisar Sentry (últimos errores)
     → Buscar pistas del error en los logs
     → Si se identifica → aplicar fix + deploy
     → Si no se identifica → comunicar a clientes que estamos investigando
```

### 3.2 Rollback de Deploy (SEV-1/SEV-2)

**Cuándo usar**: Un deploy rompió algo. Hay que volver a la versión anterior lo antes posible.

```
OPCIÓN A: Rollback desde Vercel Dashboard (< 2 minutos)

  1. Ir a vercel.com → proyecto TurnoGol → Deployments
  2. Encontrar el último deployment exitoso ANTES del deploy roto
  3. Click en "..." → "Promote to Production"
  4. Confirmar
  5. Esperar ~30 segundos a que Vercel propague
  6. Verificar: curl https://turnogol.app/api/health
  7. Si responde 200 → rollback exitoso
  8. Notificar al equipo: "Rollback completo a [commit SHA]"

OPCIÓN B: Rollback vía Git (si Vercel Dashboard no funciona)

  1. git log --oneline -5            # encontrar el commit bueno
  2. git revert [commit-malo]        # revertir el commit roto
  3. git push origin main            # triggerear nuevo deploy en Vercel
  4. Monitorear el deploy en Vercel
  5. Verificar health check

POST-ROLLBACK:
  → Crear issue en GitHub con el error
  → Investigar la causa raíz sin presión (ya volvimos a la versión que funciona)
  → Aplicar fix en una branch, reviewar, y redesployar con cuidado
```

### 3.3 Base de Datos Inaccesible (SEV-1)

**Síntoma**: Health check reporta `database: unhealthy`. Los errores en Sentry muestran `connection refused` o `too many connections`.

```
DIAGNÓSTICO Y ACCIÓN:

  1. Verificar Supabase status page
     → Si hay outage → esperar. No hay nada que podamos hacer.
     → Comunicar a clientes: "Estamos experimentando problemas con nuestro
        proveedor de base de datos. Estamos monitoreando la situación."

  2. Verificar connection pool
     → Supabase Dashboard → Database → Connection Pooling
     → ¿Pool usage > 90%?
        → SÍ → posible leak de conexiones
        → Reiniciar la app (redeploy del mismo commit en Vercel) para cerrar
          conexiones huérfanas
        → Si persiste → reducir poolSize temporalmente o verificar
          queries de larga duración

  3. Verificar disk space
     → Supabase Dashboard → Database → Disk Usage
     → ¿Cerca del límite?
        → La purga de `processed_webhooks` > 30 días está AUTOMATIZADA
          (worker semanal `data-retention-cleanup`, paso global D5,
          `purgeProcessedWebhooks` en
          src/shared/jobs/workers/data-retention-cleanup.worker.ts) — no
          debería acumularse. Si igual hace falta purgar manualmente
          (fallback / corrida fuera de horario):
          DELETE FROM processed_webhooks
          WHERE processed_at < NOW() - INTERVAL '30 days'
        → Escalar plan de Supabase si es necesario (temporal: el upgrade
          tarda ~15 minutos)

  4. Verificar si hay un query bloqueante (lock)
     → En Supabase SQL Editor:
        SELECT pid, state, query, wait_event_type, query_start
        FROM pg_stat_activity
        WHERE state = 'active'
        ORDER BY query_start;
     → Si hay un query corriendo hace > 5 minutos → matarlo:
        SELECT pg_terminate_backend([pid]);
```

### 3.4 MercadoPago No Procesa Pagos (SEV-2)

**Síntoma**: Jugadores no pueden pagar la seña. Webhooks no llegan. Logs muestran errores de MP API.

```
DIAGNÓSTICO Y ACCIÓN:

  1. Verificar MP status page: status.mercadopago.com
     → Si hay outage → activar MODO DEGRADADO:
        - Las reservas se crean sin exigir seña
        - Banner en el panel admin: "MP no disponible temporalmente"
        - Los pagos se pueden cobrar manualmente o cuando MP vuelva

  2. Si MP dice que está operacional:
     → Verificar las credenciales en Supabase → Edge Function Secrets
     → ¿Expiraron las API Keys?
        → Regenerar en mercadopago.com.ar/developers → Credentials
        → Actualizar en Vercel → Environment Variables → Redeploy

  3. Si los webhooks no llegan:
     → Verificar en MP Dashboard → Webhooks → Events
     → ¿Los eventos se están generando?
        → SÍ pero no llegan → verificar la URL del webhook configurada
        → NO → el problema es del lado de MP → esperar

  4. Si es un error de nuestra aplicación al procesar el webhook:
     → Revisar Sentry → buscar errores en /api/webhooks/mercadopago
     → Corregir → deploy → los webhooks pendientes se reintentarán
        (MP reintenta automáticamente durante 24 horas)

COMUNICACIÓN A CLIENTES:
  "El cobro online está temporalmente suspendido. Podés seguir reservando
   y cobrar por efectivo o transferencia. Una vez restablecido, los pagos
   pendientes se procesarán automáticamente."
```

### 3.5 Email No Envía Confirmaciones (SEV-3)

**Síntoma**: Las confirmaciones de reserva no llegan por email. Logs muestran errores del worker `send-email`.

```
DIAGNÓSTICO Y ACCIÓN:

  1. Verificar Resend status
     → resend.com/changelog o Resend dashboard
     → Si hay outage → los emails quedan encolados en pg-boss
     → Se enviarán automáticamente cuando Resend se recupere (retry)

  2. Verificar API key de Resend
     → ¿La API key es válida? Verificar en Resend dashboard
     → Si expiró o fue revocada → generar nueva → actualizar en Vercel env vars → redeploy

  3. Verificar dominio de envío
     → Resend dashboard → Domains → ¿El dominio está verificado?
     → Si los DNS records cambiaron → re-verificar dominio

  4. Verificar la cola de pg-boss
     → Supabase SQL Editor:
        SELECT state, COUNT(*) FROM pgboss.job
        WHERE name = 'send-email'
        GROUP BY state;
     → Si hay muchos "failed" → revisar el error en la columna "output"
     → Si hay muchos "created" (sin procesar) → verificar que el worker
       está corriendo

IMPACTO: Las reservas SÍ se crean correctamente. Solo falla la notificación.
El jugador puede ver su reserva en la app. El admin la ve en la grilla.
No es una emergencia — es una degradación de UX.
```

### 3.6 Login No Funciona (SEV-2)

**Síntoma**: Los usuarios no pueden hacer login. El magic link no llega, o llega pero el verify falla.

```
DIAGNÓSTICO Y ACCIÓN:

  1. ¿El magic link no llega?
     → Verificar Resend dashboard: ¿los emails se están enviando?
     → Si Resend reporta errores → verificar dominio verificado y API key
     → Si Resend muestra "sent" pero no llega → revisar carpeta de spam
     → Si es un usuario específico → su email puede estar bouncing

  2. ¿El magic link llega pero el verify falla?
     → Verificar Supabase Auth logs en el dashboard
     → ¿El token expiró? (los magic links expiran en 10 minutos)
     → ¿El token ya fue usado? (single-use)
     → Si hay un error de Supabase Auth → reiniciar el servicio
       (Supabase Dashboard → Settings → Restart services)

  3. ¿OAuth (Google) no funciona?
     → Verificar credenciales de Google OAuth en Supabase
     → ¿Cambió la URL de callback? (debe coincidir exactamente)
     → Google Cloud Console → APIs & Services → Credentials

  4. ¿El JWT se genera pero el frontend no lo acepta?
     → Verificar que NEXT_PUBLIC_SUPABASE_URL y SUPABASE_ANON_KEY son correctos
     → Si cambió algún env var → redeploy en Vercel

WORKAROUND TEMPORAL:
  Si el login está completamente roto pero la DB funciona:
  → Los admins ya logueados pueden seguir operando (su sesión ya existe)
  → Nuevo login: generar un magic link manualmente desde Supabase Auth dashboard
```

### 3.7 Suspensión Incorrecta de un Tenant (SEV-2)

**Síntoma**: Un dueño de complejo reporta que su panel muestra "Acceso bloqueado por falta de pago" pero dice que ya pagó.

```
DIAGNÓSTICO Y ACCIÓN:

  1. Verificar el estado real del tenant
     → Supabase SQL Editor:
        SELECT id, name, status FROM tenants WHERE slug = '[slug-del-complejo]';
     → Si status = 'suspended' → verificar pagos

  2. Verificar pagos del tenant
     → SELECT * FROM tenant_subscriptions WHERE tenant_id = '[id]'
       ORDER BY created_at DESC LIMIT 5;
     → SELECT * FROM payments WHERE tenant_id = '[id]'
       AND type = 'full_payment' ORDER BY created_at DESC LIMIT 5;

  3. Verificar en MercadoPago
     → Buscar el pago en el dashboard de MP con el mp_payment_id
     → ¿El pago está approved en MP pero no se reflejó en nuestra DB?
        → El webhook de MP no se procesó correctamente
        → Procesar manualmente:
           UPDATE tenant_subscriptions SET status = 'active', ... 
           WHERE tenant_id = '[id]';
           UPDATE tenants SET status = 'active' WHERE id = '[id]';

  4. Si el tenant pagó legítimamente:
     → Restablecer acceso inmediatamente:
        UPDATE tenants SET status = 'active' WHERE id = '[id]';
     → Investigar por qué el cobro no se reflejó
     → Disculparse con el cliente: "Lamentamos el inconveniente. Tu acceso
        fue restablecido. El error fue de nuestro lado."

  5. Registrar en audit_logs:
     → INSERT INTO audit_logs (...) VALUES (..., 'tenant.manual_reactivation', ...);
```

### 3.8 Doble Booking Reportado (SEV-2)

**Síntoma**: Un admin reporta que dos reservas aparecen en la misma cancha y horario.

```
DIAGNÓSTICO Y ACCIÓN:

  1. Verificar la realidad
     → Supabase SQL Editor:
        SELECT b.id, b.court_id, b.date, b.time_start, b.time_end, b.status,
               p.first_name, p.last_name
        FROM bookings b
        LEFT JOIN players p ON p.id = b.player_id
        WHERE b.tenant_id = '[tenant-id]'
        AND b.date = '[fecha]'
        AND b.court_id = '[court-id]'
        AND b.status IN ('pending_payment', 'confirmed')
        ORDER BY b.time_start;

  2. ¿Realmente hay overlap?
     → Si los horarios NO se solapan (ej: 21:00-22:00 y 22:00-23:00) → no es
        doble booking, aclarar al admin
     → Si SÍ se solapan → INCIDENTE REAL, continuar

  3. Identificar la causa:
     → ¿Una de las reservas es un turno fijo (booking_type = 'fixed')?
     → ¿Se creó una manualmente mientras la otra era online?
     → ¿El exclusion constraint fue bypasseado?
        → SELECT * FROM pg_constraint WHERE conname = 'no_overlapping_bookings';
        → Si no existe → BUG CRÍTICO, la migration no se aplicó

  4. Resolución inmediata:
     → Contactar al admin → decidir cuál reserva mantener
     → Cancelar la otra:
        UPDATE bookings SET status = 'canceled_refunded',
        canceled_by = 'system', canceled_reason = 'Conflicto de horarios (incidente)',
        canceled_at = NOW()
        WHERE id = '[booking-a-cancelar]';
     → Si hubo seña pagada → procesar reembolso en MP

  5. Prevención:
     → Verificar que el exclusion constraint existe y funciona
     → Verificar que los tests de concurrencia pasan
     → Agregar un test específico para el caso que causó el doble booking
```

### 3.9 Posible Data Leak Cross-Tenant (SEV-1)

**Síntoma**: Un admin reporta que ve datos que no son de su complejo. O los tests de isolation fallan en un deploy.

```
🚨 ESTE ES EL ESCENARIO MÁS GRAVE. PROTOCOLO DE MÁXIMA URGENCIA.

  1. CONTENCIÓN INMEDIATA (< 5 minutos):
     → Si es un deploy que rompió RLS → ROLLBACK INMEDIATO (§3.2)
     → Si es un bug en producción → deshabilitar el endpoint afectado
     → Si no podemos identificar rápido → PARAR LA APP COMPLETA
       (es mejor que esté caída a que filtre datos)

  2. EVALUACIÓN (< 30 minutos):
     → ¿Qué datos se expusieron?
     → ¿Cuántos tenants fueron afectados?
     → ¿Fue un error de rendering (el frontend mostró datos cacheados de otro tenant)?
     → ¿O es un error real de DB (RLS no filtró)?

  3. VERIFICAR RLS:
     → Supabase SQL Editor (como app role, NO como superuser):
        SET LOCAL app.current_tenant_id = '[tenant-A]';
        SELECT COUNT(*) FROM bookings; -- solo debe retornar filas de tenant A
        
        SET LOCAL app.current_tenant_id = '[tenant-B]';
        SELECT COUNT(*) FROM bookings; -- solo debe retornar filas de tenant B
     
     → Si los counts son correctos → el problema NO es de RLS (posible bug de frontend/cache)
     → Si los counts están mal → RLS ROTO → EMERGENCIA MÁXIMA

  4. SI RLS ESTÁ ROTO:
     → Identificar qué tabla tiene el policy faltante o mal configurado
     → Verificar: SELECT tablename, rowsecurity FROM pg_tables
       WHERE schemaname = 'public';
     → Aplicar fix de emergencia:
       ALTER TABLE [tabla] ENABLE ROW LEVEL SECURITY;
       -- Re-crear policies si faltan
     → Verificar que los tests de isolation pasan después del fix

  5. NOTIFICACIÓN (Doc 18 §9):
     → Activar protocolo de incidente de datos
     → Notificar a tenants afectados en < 48 horas
     → Documentar post-mortem completo
     → Actualizar runbook y tests para cubrir este escenario

  6. POST-MORTEM OBLIGATORIO:
     → ¿Cómo pasó esto sin que los tests lo detectaran?
     → ¿Faltaba un test? ¿Se skippeó un test? ¿Se deployó sin correr tests?
     → Agregar el escenario específico al test suite de isolation
```

---

### 3.10 Debugging de Magic Link (SEV-3)

**Síntomas:** usuario reporta que no puede entrar; el magic link no funciona.

**TTL:** 10 minutos (Supabase-managed, no configurable en `supabase/config.toml`).
**Single-use:** sí (Supabase invalida el token al primer uso exitoso).

```
1. ¿EL EMAIL NO LLEGA?
   → Verificar en Resend dashboard que el mail salió: https://resend.com/emails
   → Filtro por destinatario. Si `delivered: true`, problema del lado del usuario (spam/filtros).
   → Si `delivered: false` o `bounced`, revisar SPF/DKIM/DMARC (§9).
   → Si `queued` por > 5 min, Resend está caído → activar §3.5.

2. ¿EL EMAIL LLEGA PERO EL LINK NO FUNCIONA?
   → ¿Cuánto tardó el usuario en abrirlo?
     * Si > 10 min → TTL vencido. Pedirle que re-solicite el link.
     * Si < 10 min → continuar.
   → ¿Hizo click en el link más de una vez? El primer click consume el token; clicks
     posteriores devuelven 400 desde Supabase. Re-solicitar link.
   → ¿Click desde otro device/browser que el que solicitó? Algunos clientes de email
     hacen "preflight" del link (escaneo de seguridad) que consume el token. Workaround:
     copiar URL y abrir manual.

3. PROCEDIMIENTO MANUAL (último recurso):
   → Supabase Dashboard → Authentication → Users → buscar email → "Send magic link"
   → El admin de TurnoGol puede triggear envío sin necesidad del usuario.
   → Documentar en audit_logs.

4. NOTA:
   El TTL de 10 min no es configurable desde nuestro código. Si se requiere extensión
   por casos especiales, hay que abrir ticket con Supabase support (rara vez se hace).
```

---

### 3.11 Rotación de JWT Secret (SEV-2)

**Disclaimer importante:** el JWT signing secret es **gestionado por Supabase**, NO por
TurnoGol. Nuestra app sólo verifica JWTs emitidos por Supabase Auth.

```
1. ¿CUÁNDO ROTAR?
   → Filtración sospechada de SUPABASE_SERVICE_ROLE_KEY o NEXT_PUBLIC_SUPABASE_ANON_KEY.
   → Compromiso de credenciales de un admin (key access).
   → Rotación preventiva anual (calendar evento + ejecución).

2. PROCEDIMIENTO:
   → Supabase Dashboard → Project Settings → API → "Rotate keys"
   → Generar nueva ANON_KEY y SERVICE_ROLE_KEY.
   → Vercel: actualizar env vars NEXT_PUBLIC_SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY.
   → Vercel: Redeploy último deployment exitoso (los new envs aplican).

3. EFECTO:
   → Todas las sesiones activas (admin + jugador) quedan invalidadas. Los usuarios
     deben iniciar sesión nuevamente.
   → Comunicar PROACTIVAMENTE antes de rotar (banner in-app + email "renová tu sesión").

4. JWT signing secret propiamente (el que firma los tokens emitidos por Supabase Auth):
   → No es accesible/rotable desde TurnoGol. Supabase lo rota internamente sin downtime.
   → Si Supabase comunica una rotación forzada (security advisory), seguir su procedimiento.
```

---

### 3.12 Rotación de ENCRYPTION_KEY (SEV-2)

`ENCRYPTION_KEY` se usa para cifrar at-rest `tenants.mp_access_token` y `tenants.mp_refresh_token`
(AES-256-GCM, `src/lib/crypto/encrypt.ts`). 64 hex chars (32 bytes).

```
1. ¿CUÁNDO ROTAR?
   → Filtración sospechada (Vercel env compromise, leak de secrets en logs).
   → Rotación anual preventiva.

2. ESTRATEGIA v1 (single-key, sin versioning):
   La key actual cifra TODOS los tokens MP. Si se rota directamente sin re-cifrar,
   los tokens encriptados con la vieja key quedan ilegibles (gateway 401 a cada llamada).

   Procedimiento simplificado v1:
   → Generar key nueva:
     ```
     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
     ```
   → **Forzar reconexión OAuth de cada tenant** (más simple que re-cifrar):
     ```sql
     UPDATE tenants
     SET mp_access_token = NULL,
         mp_refresh_token = NULL,
         mp_connected_at = NULL
     WHERE mp_refresh_token IS NOT NULL;
     ```
   → Actualizar Vercel env var ENCRYPTION_KEY.
   → Redeploy.
   → Comunicar a cada complejo: "Por mantenimiento de seguridad, re-conectá MercadoPago
     desde Configuración → MercadoPago".
   → Monitorear conversión durante 7 días.

3. ESTRATEGIA v1.5 (key versioning, sin reconexión forzada):
   → Tabla `encryption_keys(id, key_hex, created_at, retired_at)`.
   → Columna `mp_access_token_key_id` + `mp_refresh_token_key_id` en `tenants`.
   → Re-cifrar gradualmente al next refresh (lazy migration).
   → Cuando todos los tokens migrados (key_id != old), retirar la vieja.

   Plan deferido. En v1 mantener single-key con rotación operacional.

4. VALIDACIÓN POST-ROTACIÓN:
   → `pnpm launch-check` valida que `ENCRYPTION_KEY` cumple length + hex + no es placeholder.
   → Sentry watch: tasa de errores `MpGatewayError: ... 401` debe volver a baseline en < 24h.
```

---

### 3.13 Worker de pg-boss Caído (SEV-2)

**Síntoma**: Las reservas `pending_payment` no expiran (los slots quedan "ocupados" y no reservables aunque nadie pagó la seña), los emails de confirmación no salen, no se generan los turnos de abonados, el dunning no reintenta. El cron `health-ping` deja de reportar.

**Contexto**: El worker es la **única** pieza del stack que corre fuera de Vercel/Supabase — Railway, `Dockerfile.worker`, `startCommand = "pnpm jobs:start"` (→ `src/shared/jobs/run-workers.ts`). Es un **punto único de falla**: `numReplicas = 1`, `restartPolicyType = "ON_FAILURE"` (máx 10 reintentos). Corre los 13 workers (expiración de bookings, envío de emails, webhooks MP, generación de slots de abonados, expiración de trials, auto-completar, dunning, retención, refresh/reconcile/refund de MP, push, health-ping).

**Por qué es crítico para las reservas**: el exclusion constraint `no_overlapping_bookings` bloquea el slot mientras el booking siga en `pending_payment` (`WHERE status IN ('pending_payment','confirmed')`). Las **dos** rutas de expiración —el job diferido por-booking (`expire-pending-booking`) y el barrido `*/5` (`expire-pending-booking-sweep`)— viven **solo** en el worker; no hay trigger de DB ni barrido web de respaldo. Además, el job por-booking se auto-descarta en pg-boss a la hora (`expireInHours: 1`): si el worker está caído **>1h**, ese job nunca corre y el slot solo se libera cuando el worker vuelve y el barrido de 5 min lo recoge.

```
DIAGNÓSTICO:

  1. Railway Dashboard → servicio del worker → ver estado y logs.
     → ¿Está "Crashed"/"Stopped"? ¿Agotó los 10 reintentos de ON_FAILURE?
  2. ¿Cuántos jobs sin procesar hay en pg-boss?
     SELECT name, state, count(*) FROM pgboss.job
       WHERE state IN ('created','retry') GROUP BY name, state ORDER BY 3 DESC;
  3. ¿Cuántas reservas quedaron colgadas?
     SELECT count(*) FROM bookings
       WHERE status = 'pending_payment' AND created_at < NOW() - INTERVAL '6 minutes';

SOLUCIÓN:

  1. Reiniciar el worker en Railway (Restart) o redeploy si el crash es por código/env.
     → Verificar que WORKER_DATABASE_URL (rol turnogol_worker, BYPASSRLS) esté seteada.
  2. Al volver, el worker retoma los jobs persistidos en Postgres (pg-boss los guarda en la DB).
     → Los jobs por-booking aún dentro de su ventana de 1h corren; el barrido `*/5` recoge el resto.
     → Las reservas colgadas > 6 min pasan a `expired` en el próximo barrido y liberan el slot.
  3. Si el worker no arranca, expirar manualmente para desbloquear slots (último recurso):
     UPDATE bookings SET status = 'expired'
       WHERE status = 'pending_payment' AND created_at < NOW() - INTERVAL '6 minutes';
     (revisar antes que no haya pagos aprobados sin conciliar para esas reservas.)

PREVENCIÓN: para HA, subir numReplicas a 2 (railway.toml). pg-boss coordina los consumers,
            así que 2 réplicas no duplican el trabajo.
```

---

## 4. Mantenimiento Programado

### 4.1 Tareas diarias (automáticas)

| Tarea | Horario | Ejecutor | Qué hace |
|---|---|---|---|
| Backup de DB | Automático (Supabase) | Supabase | Backup diario, retención 7 días (plan Pro) |
| Health check | Cada 1-5 min | UptimeRobot | Verifica que la app responde |
| Expiración de bookings | Job por-booking (+6 min) + barrido `*/5` | pg-boss worker | Expira reservas `pending_payment` > 6 min. Job diferido al crear el booking + cron de barrido cada 5 min como red de seguridad |
| Envío de emails programados | Continuo | pg-boss worker | Procesa cola de notificaciones email |
| Métricas de negocio | Cada 1 hora | pg-boss cron | Recolecta y loguea métricas hourly |

### 4.2 Tareas semanales (automáticas)

| Tarea | Horario | Ejecutor | Qué hace |
|---|---|---|---|
| Data retention cleanup | Domingos 04:00 ART | pg-boss cron | Purga datos según política de retención (Doc 18 §7.2) |
| Generación de slots de abonados | Diario 03:00 ART | pg-boss cron | Genera instancias de booking para la semana siguiente |
| Trial expiration check | Diario 08:00 ART | pg-boss cron | Chequea trials vencidos → churn |
| Dunning retry | Diario 10:00 ART | pg-boss cron | Reintenta cobros fallidos |

### 4.3 Tareas mensuales (manuales)

| Tarea | Quién | Qué hacer |
|---|---|---|
| Revisar costos de infra | Admin | Vercel, Supabase, Sentry, Resend → ¿estamos dentro del budget? |
| Revisar alertas del mes | Dev | ¿Hubo alertas recurrentes? ¿Se pueden prevenir? |
| Actualizar dependencias | Dev | `pnpm outdated` → actualizar minor/patches. Major: evaluar. |
| Revisar plan de Supabase | Admin | ¿Disk usage? ¿Connections? ¿Necesitamos escalar? |
| Revisar API key de Resend | Admin | Verificar que la API key no está cerca de expirar, verificar dominio verificado |
| Verificar backups | Admin | ¿Los backups de Supabase existen? Hacer un restore de prueba 1x/trimestre |

### 4.4 Garantía anti-doble-booking (test en CI, no ritual manual)

La garantía de que dos reservas concurrentes sobre el mismo slot no coexisten la da el test
de concurrencia `booking-concurrency` en CI (Doc 16 §3.3): corre en el job de integración y es
**BLOQUEANTE** — si falla, el deploy no avanza. El motor de reservas (exclusion constraint
`no_overlapping_bookings` + `SELECT FOR UPDATE`) queda cubierto en cada PR, sin depender de que
alguien se acuerde de correr un ritual manual antes de cada deploy.

> [!NOTE]
> **Decisión de auditoría 2026-07-21 (TEC-06):** se reemplaza el "stress test de 2 terminales"
> como paso obligatorio por la cobertura en CI, que sí se sostiene con un on-call de 1 persona.
> Quitar el step del `pnpm launch-check` como `fatal: true` queda como implementación de código
> pendiente.

**Opcional (prueba de carga local, ad-hoc):** existe `pnpm stress:bookings`. Requiere la app
corriendo con `NEXT_PUBLIC_E2E=1` (habilita el endpoint `/api/e2e/create-booking`). Salida
esperada: `Accepted: 1`, `Rejected: N-1` (N = concurrencia); si `Accepted > 1` hay riesgo de
doble booking. Es una verificación puntual, NO un gate de deploy. Si se corre, se puede dejar
evidencia en `docs/audit/stress-runs/YYYY-MM-DD.md`.

### 4.5 Migration strategy (dos trees)

Dos árboles de migraciones SQL escritas a mano:

- `src/shared/db/migrations/` → **autoridad de CI** (`.github/workflows/ci.yml`) y fuente de verdad.
  Orden numérico simple: `001_extensions.sql`, …, `012_system_admins_audit.sql`.
- `supabase/migrations/` → **mirror** para Supabase CLI local + prod.
  Formato timestamp: `YYYYMMDDHHMMSS_name.sql`.

El mirror NO se escribe a mano: se **regenera** desde el árbol autoritativo con
`pnpm db:sync-supabase` (`scripts/sync-supabase-migrations.mjs`, copia `src/shared/db/migrations/`
→ `supabase/migrations/` con prefijo timestamp). Por cada cambio de schema: agregar el `.sql`
numerado en `src/shared/db/migrations/`, correr `pnpm db:sync-supabase` y commitear ambos árboles.

> [!NOTE]
> **Decisión de auditoría 2026-07-21 (TEC-05):** cablear `db:sync-supabase` en CI —o un check
> pre-PR— que regenere el mirror y **falle si hay drift** entre los dos árboles, eliminando la
> duplicación manual (una sola fuente de verdad: `src/shared/db/migrations/`). Implementación de
> código pendiente (hoy el sync se corre a mano).

---

## 5. Operaciones de Base de Datos

### 5.1 Ejecutar una migration en producción

```
PROCESO:

  1. La migration se escribe y testea en el entorno local (Supabase local)
  2. Se verifica que pasa todos los tests de integration + isolation
  3. Se aplica en el entorno de staging (si existe) o se revisa manualmente
  4. Merge a main → deploy automático → Supabase migrations se aplican

  SI LA MIGRATION FALLA EN PRODUCCIÓN:
    → No entrar en pánico. Supabase aplica migrations en una transacción.
      Si falla, hace rollback automáticamente.
    → Si la migration se aplicó parcialmente (raro pero posible):
      → Crear una migration de rollback manualmente
      → Aplicarla lo antes posible
      → Verificar integridad de datos

  REGLA: Nunca ejecutar SQL directo en la DB de producción sin:
    1. Tener un backup reciente verificado
    2. Hacerlo dentro de una transacción (BEGIN ... COMMIT/ROLLBACK)
    3. Registrar en audit_logs qué se hizo y por qué
```

### 5.2 Queries de emergencia frecuentes

```sql
-- Ver el estado de un tenant específico
SELECT id, name, slug, status, trial_ends_at
FROM tenants WHERE slug = 'complejo-san-martin';

-- Ver reservas de hoy de un complejo
SELECT b.*, c.name as court_name
FROM bookings b
JOIN courts c ON c.id = b.court_id
WHERE b.tenant_id = '[tenant-id]'
AND b.date = CURRENT_DATE
ORDER BY b.time_start;

-- Ver cobros fallidos recientes
SELECT t.name as tenant_name, ts.status, ts.current_period_end
FROM tenant_subscriptions ts
JOIN tenants t ON t.id = ts.tenant_id
WHERE ts.status IN ('past_due', 'suspended')
ORDER BY ts.current_period_end;

-- Ver la cola de jobs pendientes
SELECT name, state, COUNT(*)
FROM pgboss.job
WHERE state IN ('created', 'retry', 'active')
GROUP BY name, state
ORDER BY name;

-- Ver errores recientes en workers
SELECT name, state, output, completedon
FROM pgboss.job
WHERE state = 'failed'
ORDER BY completedon DESC
LIMIT 20;

-- Verificar que RLS está activo en todas las tablas aisladas
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN (
  'courts', 'bookings', 'abonados', 'payments', 'cash_flows',
  'tenant_staff_members', 'daily_cash_closes',
  'notifications', 'audit_logs', 'tenant_subscriptions', 'tenant_player_bans',
  'push_subscriptions'
);
-- Todas deben tener rowsecurity = true

-- Medir latencia de un query
EXPLAIN ANALYZE SELECT * FROM bookings
WHERE tenant_id = '[tenant-id]' AND date = CURRENT_DATE;
```

### 5.3 Restaurar un backup

```
CUÁNDO: Corrupción de datos, eliminación accidental, o verificación trimestral.

PROCESO:

  1. Ir a Supabase Dashboard → Settings → Backups
  2. Seleccionar el backup point-in-time (Pro plan)
  3. IMPORTANTE: NO restaurar sobre la DB de producción.
     → Crear un nuevo proyecto de Supabase temporal
     → Restaurar el backup ahí
     → Verificar que los datos están correctos
     → Si necesitamos datos específicos: exportar con pg_dump e importar
       selectivamente en producción

  REGLA: Nunca hacer un restore completo sobre producción sin haber
         verificado el backup en un entorno separado primero.
```

### 5.4 Bootstrap del primer Super-Admin (`system_admins`)

```
CUÁNDO: Alta del primer (o un nuevo) miembro del equipo interno de TurnoGol con acceso al
        panel /super-admin. NO es un tenant ni staff de un complejo.

COMANDO:
  pnpm seed:system-admin <email> [firstName] [lastName]
  (script: scripts/seed-system-admin.ts; idempotente — se puede correr de nuevo sin duplicar)

QUÉ HACE (3 efectos):
  1. Crea el usuario de Supabase Auth si no existe (email_confirm=true). Password opcional vía
     env SUPERADMIN_SEED_PASSWORD; sin ella, el login es passwordless (magic link).
  2. Inserta la fila en system_admins vía el pool worker BYPASSRLS (getWorkerDb), NO turnogol_app:
     la tabla tiene RLS + FORCE self-scoped (migr. 006 + 036) SIN policy de INSERT, así que el
     pool restringido de la app sería rechazado con 42501 (insufficient privilege). En prod
     requiere WORKER_DATABASE_URL apuntando a turnogol_worker.
  3. Setea app_metadata en el JWT: { is_system_admin: true, system_admin_id: <uuid de la fila> }.

RELACIÓN CON auth.users:
  system_admins.id  ≠  auth.users.id  (son UUIDs distintos, generados por separado).
  El vínculo es el claim app_metadata.system_admin_id, que el guard usa para localizar la fila.

PASO MANUAL OBLIGATORIO (el seed NO lo hace):
  Agregar el email a la env SYSTEM_ADMIN_EMAILS (en .env.local y en las env vars de producción).
  El guard (src/modules/auth/system-admin.guards.ts) es fail-closed: si la env está ausente o la
  lista vacía → NADIE pasa. Triple check al acceder: (1) claim JWT is_system_admin,
  (2) fila con status='active', (3) allowlist comparada contra el email de la FILA (no el del JWT).

PRIMER LOGIN:
  Login por el flujo normal (magic link, o password si se seteó SUPERADMIN_SEED_PASSWORD).
  El login de un super-admin rutea a /super-admin.

MFA / TOTP:
  DEFERIDO en v1. Las columnas system_admins.mfa_secret / mfa_verified_at existen pero NO se
  enrolan ni se verifican en los guards. Habilitar MFA requiere código nuevo (enrolar el secret
  en el primer login + verificar el TOTP en el guard) que hoy no existe.
```

---

## 6. Comunicación Durante Incidentes

### 6.1 Template de comunicación a clientes (vía email)

**Durante el incidente:**
```
🔧 TurnoGol — Aviso de servicio

Estamos experimentando problemas con [descripción breve del problema].
Nuestro equipo está trabajando para resolverlo.

Impacto: [qué funcionalidad está afectada]
Funcionalidades disponibles: [qué SÍ funciona]

Actualizaremos en [X] minutos.

Lamentamos las molestias.
— Equipo TurnoGol
```

**Resolución:**
```
✅ TurnoGol — Servicio restablecido

El problema con [descripción] fue resuelto a las [hora] ART.

Causa: [explicación breve y honesta]
Impacto: [cuánto duró, qué se vio afectado]
Acciones tomadas: [qué hicimos para que no vuelva a pasar]

Lamentamos los inconvenientes. Si tenés algún problema residual,
contactanos en soporte@turnogol.app.

— Equipo TurnoGol
```

### 6.2 Reglas de comunicación

```
1. SER HONESTO. Nunca decir "no pasó nada" si pasó algo.
2. SER RÁPIDO. Comunicar dentro de los primeros 30 minutos para SEV-1/2.
3. SER CLARO. Nada de jerga técnica. "El sistema de pagos no está disponible"
   es mejor que "nuestro webhook handler tiene un timeout en la API de MP".
4. ACTUALIZAR. Si dijimos "actualizamos en 30 minutos", actualizar en 30 minutos
   aunque sea para decir "seguimos trabajando".
5. CERRAR. Siempre enviar un mensaje de resolución cuando se resuelve.
```

---

## 7. Post-Mortem

### 7.1 Cuándo hacer un post-mortem

- Todo incidente SEV-1 → obligatorio.
- Todo incidente SEV-2 que duró > 1 hora → obligatorio.
- Incidentes SEV-3 recurrentes (3+ veces el mismo) → obligatorio.

> [!NOTE]
> **Nota de incidente liviana (Decisión de auditoría 2026-07-21 — TEC-06).** El template completo
> de §7.2 se reserva para **SEV-1 y para incidentes de datos** (data leak cross-tenant, §3.9). Para
> el resto alcanza una **nota de incidente de ~5 líneas** en el issue de GitHub: qué pasó, impacto,
> causa, cómo se resolvió, qué cambiamos para que no vuelva. Un equipo de 1-3 personas no sostiene
> post-mortems formales para cada incidente; la disciplina que importa es dejar registro de la
> causa y del fix, no completar un formulario.

### 7.2 Template de post-mortem (SEV-1 / incidentes de datos)

```markdown
# Post-Mortem: [Título del incidente]

**Fecha**: YYYY-MM-DD
**Duración**: HH:MM - HH:MM (X minutos/horas)
**Severidad**: SEV-X
**Autor**: [Nombre]

## Resumen
[1-3 oraciones sobre qué pasó]

## Impacto
- Usuarios afectados: [cuántos tenants/jugadores]
- Funcionalidad afectada: [qué no funcionó]
- Duración del impacto: [X minutos/horas]
- Pérdida de datos: [sí/no, detalle si sí]
- Impacto financiero: [reservas perdidas, reembolsos procesados]

## Línea de tiempo
- HH:MM — [evento]
- HH:MM — [evento]
- HH:MM — [resolución]

## Causa raíz
[Explicación técnica detallada de por qué ocurrió]

## ¿Por qué no lo detectamos antes?
[¿Faltaba un test? ¿Una alerta? ¿Un check de CI?]

## Acciones correctivas
| Acción | Responsable | Deadline | Estado |
|---|---|---|---|
| [Acción 1] | [Nombre] | [Fecha] | ⬜ Pendiente |
| [Acción 2] | [Nombre] | [Fecha] | ⬜ Pendiente |

## Lecciones aprendidas
- [Qué aprendimos]
- [Qué cambiaríamos del proceso]
```

### 7.3 Regla de blamelessness

```
Los post-mortems NO buscan culpables. Buscan causas sistémicas.

INCORRECTO: "Juan deployó sin testear y rompió producción."
CORRECTO:   "El pipeline de CI no incluía un check para X.
             El proceso permitió un deploy sin validación de Y."

Si una persona pudo romper algo, el sistema falló — no la persona.
El fix siempre es un cambio en el sistema (test, alerta, proceso),
no un regaño a una persona.
```

---

## 8. Checklists Operativos

### 8.1 Checklist pre-lanzamiento (Day 0)

```
INFRAESTRUCTURA:
  □ Vercel: dominio configurado, SSL activo, env vars de producción
  □ Supabase: proyecto Pro creado, region seleccionada, migrations aplicadas
  □ DNS: turnogol.app apuntando a Vercel
  □ Sentry: proyecto configurado, release tracking activado
  □ UptimeRobot: monitores configurados (health + homepage + auth)
  □ Resend: dominio verificado, API key en env vars
  □ MercadoPago: app de producción creada, webhooks configurados

SEGURIDAD:
  □ Todas las env vars de producción son diferentes a las de desarrollo
  □ Supabase service role key NO está expuesta al frontend
  □ RLS activado en las 13 tablas aisladas
  □ Tests de isolation corren y pasan en CI
  □ HTTPS activo en todo el sitio
  □ Rate limiting configurado

DATOS:
  □ Planes y precios creados en la tabla plans
  □ Backup verificado (hacer uno manual y verificar restore)

LEGAL:
  □ Política de Privacidad publicada
  □ Términos y Condiciones publicados
  □ Registro AAIP tramitado o en proceso

MONITOREO:
  □ Health check responde 200
  □ Sentry recibe eventos de test
  □ UptimeRobot muestra "UP"
  □ Alertas configuradas (email para SEV-1)
```

### 8.2 Checklist post-deploy (cada deploy)

```
□ Deploy completó exitosamente en Vercel
□ Health check responde 200: curl https://turnogol.app/api/health
□ Sentry: no hay errores nuevos en los primeros 5 minutos
□ Verificar manualmente la funcionalidad que cambió
□ Si cambió algo de DB: verificar que las migrations se aplicaron
□ Si cambió algo de auth: verificar login funcional
□ Monitorear Sentry durante 15-30 minutos post-deploy
```

---

## 9. Configuración de Email (SPF / DKIM / DMARC)

> [!IMPORTANT]
> Si estos registros DNS no están correctamente configurados antes del lanzamiento,
> los emails de TurnoGol (magic links, confirmaciones de reserva, alertas) van a
> terminar en spam o directamente no van a llegar.

### 9.1 Resend: Verificación de Dominio

Resend requiere verificar el dominio de envío antes de poder enviar emails.

```
PASOS:

  1. Ir a resend.com → Domains → Add Domain
  2. Ingresar el dominio: turnogol.app
  3. Resend genera 3 registros DNS que hay que agregar en el registrador del dominio.
```

### 9.2 Registros DNS Requeridos

Agregar los siguientes registros en el panel DNS del registrador del dominio (ej: Cloudflare, Namecheap, NIC Argentina):

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ SPF (Sender Policy Framework)                                                │
│                                                                              │
│ Tipo:  TXT                                                                   │
│ Host:  @  (o vacío si el registrador lo requiere)                            │
│ Valor: v=spf1 include:amazonses.com ~all                                     │
│                                                                              │
│ Propósito: Autoriza los servidores de Resend (AWS SES) a enviar              │
│            emails en nombre de turnogol.app.                              │
│                                                                              │
│ NOTA: Si ya hay un registro SPF existente, NO crear otro.                    │
│       Agregar "include:amazonses.com" al registro existente.                 │
│       Ej: v=spf1 include:_spf.google.com include:amazonses.com ~all         │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│ DKIM (DomainKeys Identified Mail)                                            │
│                                                                              │
│ Tipo:  CNAME                                                                 │
│ Host:  resend._domainkey                                                     │
│ Valor: (proporcionado por Resend al agregar el dominio)                      │
│                                                                              │
│ Propósito: Firma criptográfica que prueba que el email no fue alterado.      │
│                                                                              │
│ NOTA: Resend puede dar 2 o 3 registros CNAME para DKIM.                     │
│       Agregar TODOS los que indique.                                         │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│ DMARC (Domain-based Message Authentication)                                  │
│                                                                              │
│ Tipo:  TXT                                                                   │
│ Host:  _dmarc                                                                │
│ Valor: v=DMARC1; p=none; rua=mailto:dmarc@turnogol.app                   │
│                                                                              │
│ Propósito: Indica a los proveedores de email qué hacer con mensajes          │
│            que no pasen SPF/DKIM. `p=none` es monitor-only al inicio.        │
│                                                                              │
│ EVOLUCIÓN:                                                                   │
│   Semana 1-4 (lanzamiento):  p=none   (solo monitoreo, sin bloqueo)          │
│   Semana 5+:                 p=quarantine  (mandar a spam los sospechosos)   │
│   Mes 3+:                    p=reject  (rechazar directo si no pasa DKIM)    │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 9.3 Verificación Post-Configuración

```
CHECKLIST:

  1. En Resend Dashboard → Domains → el dominio debe mostrar "Verified" ✓
     (puede tomar hasta 72 horas, pero generalmente tarda minutos)

  2. Enviar un email de prueba desde Resend Dashboard → Emails → Send Test

  3. Verificar SPF/DKIM con herramientas online:
     → https://mxtoolbox.com/spf.aspx  → buscar turnogol.app
     → https://mxtoolbox.com/dkim.aspx → buscar resend._domainkey.turnogol.app
     → https://mxtoolbox.com/dmarc.aspx → buscar turnogol.app

  4. Verificar que el email de prueba NO cayó en spam
     → Si cae en spam y los registros DNS están bien:
       → Esperar 24-48h (propagación DNS)
       → Verificar que el "From" address sea noreply@turnogol.app
         (no un dominio genérico)
```

### 9.4 Troubleshooting de Email

```
PROBLEMA: "Domain not verified" en Resend

  → Verificar que los registros DNS están exactamente como los dio Resend
  → Verificar TTL: ¿hace cuánto se agregaron? Esperar 24-48h
  → Verificar que no hay registros DNS conflictivos
  → En caso de duda: borrar el dominio en Resend y re-agregarlo

PROBLEMA: Emails llegan a spam

  → Verificar SPF: dig TXT turnogol.app (debe incluir amazonses.com)
  → Verificar DKIM: dig CNAME resend._domainkey.turnogol.app
  → Verificar DMARC: dig TXT _dmarc.turnogol.app
  → Si todo está bien pero sigue cayendo en spam:
    → El dominio es nuevo y no tiene reputación
    → Enviar emails legítimos durante 2-4 semanas → la reputación sube sola
    → NO comprar listas ni enviar masivos — destruyen la reputación
```

---

## 10. Backup y Restauración de Base de Datos

### 10.1 Política de Backups

```
BACKUPS AUTOMÁTICOS (Supabase):
  → Plan Pro: backups diarios automáticos con retención de 7 días (incluido en el plan)
  → PITR (Point-in-Time Recovery): add-on pago del plan Pro. Restaura a cualquier
    timestamp; retención configurable (7 días por defecto). Ver §10.3.
  → Los backups se ejecutan automáticamente — no requieren acción manual

BACKUPS MANUALES (recomendado antes de cambios críticos):
  → Antes de una migration destructiva (DROP, ALTER con pérdida de datos)
  → Antes de un data wipe o cleanup manual
  → Antes de actualizar el plan de Supabase
  → Trimestralmente como verificación (checklist mensual §4.3)
```

### 10.2 Backup Manual con pg_dump

```
REQUISITOS:
  → PostgreSQL client (pg_dump) instalado localmente
  → Connection string de Supabase (Settings → Database → Connection string → URI)

PASOS:

  1. Obtener connection string:
     → Supabase Dashboard → Settings → Database → Connection string
     → Elegir "URI" format
     → Reemplazar [YOUR-PASSWORD] con la contraseña de la DB

  2. Ejecutar backup:
     pg_dump "postgresql://postgres.[ref]:[password]@[host]:5432/postgres" \
       --format=custom \
       --no-owner \
       --no-acl \
       --exclude-schema=pgboss \
       --file=backup_turnogol_$(date +%Y%m%d_%H%M%S).dump

     NOTAS:
       → --format=custom permite restore selectivo
       → --exclude-schema=pgboss excluye jobs (se recrean automáticamente)
       → --no-owner evita errores de roles al restaurar en otro proyecto

  3. Verificar el backup:
     pg_restore --list backup_turnogol_YYYYMMDD_HHMMSS.dump | head -20
     → Debe mostrar la lista de tablas y datos

  4. Guardar en lugar seguro:
     → Subir a Google Drive / S3 / almacenamiento externo
     → NO guardar en el mismo servidor que la DB
     → Nombrar con fecha + motivo: backup_turnogol_20260524_pre_migration.dump
```

### 10.3 Restauración desde Backup (Supabase PITR)

```
CUÁNDO USAR: Corrupción de datos, eliminación accidental dentro de los últimos 7 días.

PASOS (Plan Pro — PITR):

  1. Ir a Supabase Dashboard → Settings → Backups → Point-in-Time Recovery
  2. Seleccionar el timestamp deseado (hasta 7 días atrás, granularidad de segundos)
  3. Supabase crea un nuevo proyecto temporal con la DB restaurada
  4. Verificar los datos en el proyecto temporal
  5. Si los datos son correctos:
     → OPCIÓN A (restore selectivo — PREFERIDA):
       pg_dump el proyecto temporal → pg_restore las tablas necesarias en producción
     → OPCIÓN B (restore completo — SOLO EMERGENCIA):
       Reemplazar el proyecto de producción con el temporal

  REGLA: NUNCA restaurar directamente sobre producción sin verificar primero.
```

### 10.4 Restauración desde pg_dump Manual

```
CUÁNDO USAR: El PITR no cubre el período necesario, o queremos restaurar datos
             específicos de un backup manual antiguo.

PASOS:

  1. Crear un proyecto de Supabase temporal (o usar una DB local):
     → Dashboard → New Project (mismo region que producción)

  2. Restaurar el backup:
     pg_restore \
       --dbname="postgresql://postgres.[ref]:[password]@[host]:5432/postgres" \
       --no-owner \
       --no-acl \
       --clean \
       --if-exists \
       backup_turnogol_YYYYMMDD_HHMMSS.dump

  3. Verificar:
     → Conectarse al proyecto temporal
     → Ejecutar queries de verificación (§5.2)
     → Comparar counts con producción

  4. Extraer los datos necesarios:
     → COPY (SELECT * FROM bookings WHERE ...) TO STDOUT WITH CSV
     → O usar pg_dump con --table para extraer tablas específicas

  5. Importar en producción:
     → Dentro de una transacción (BEGIN ... COMMIT)
     → Con INSERT ... ON CONFLICT para no duplicar datos
     → Registrar en audit_logs qué se restauró y por qué

  6. Eliminar el proyecto temporal cuando ya no se necesite
```

### 10.5 Verificación Trimestral de Backups

```
CADA 3 MESES (checklist mensual §4.3):

  1. Hacer un backup manual con pg_dump (§10.2)
  2. Crear un proyecto de Supabase temporal
  3. Restaurar el backup en el proyecto temporal
  4. Ejecutar las queries de verificación (§5.2) en el proyecto temporal
  5. Comparar: ¿los datos son consistentes?
     → SELECT COUNT(*) FROM tenants (debe coincidir con producción)
     → SELECT COUNT(*) FROM bookings (debe coincidir ± jobs en vuelo)
  6. Eliminar el proyecto temporal
  7. Registrar resultado en el log de mantenimiento:
     "Backup verificado YYYY-MM-DD: OK / PROBLEMAS: [detalle]"
```

### 10.6 Backup Restore Drill (simulacro)

Procedimiento completo de "restaurar y verificar" — para cumplir el done-criterion
**MASTER_PLAN B11**: backup restaurado exitosamente al menos 1 vez con evidencia.

**Frecuencia:** trimestral mínimo + cada vez que se cambie el plan de Supabase
(p. ej., Free → Pro, distinto disk size).

```
1. PREPARACIÓN:
   → Crear branch dedicado: `audit/backup-drill-YYYY-MM-DD`.
   → Vercel preview deployment del branch (se levanta automático al push).
   → NO usar el deployment de prod. NO sobreescribir prod DB.

2. EJECUCIÓN — Opción A (Supabase PITR, plan Pro):
   → Supabase Dashboard → Database → Backups → Point-in-time recovery
   → Seleccionar timestamp: 24h atrás
   → Restaurar a NUEVO Supabase project (no overwrite del actual)
   → Anotar la connection string del nuevo project
   → Vercel preview env vars: setear DATABASE_URL al new project temporalmente

3. EJECUCIÓN — Opción B (pg_dump manual):
   → Seguir §10.4 "Restauración desde pg_dump Manual" contra el new project
   → Verificar tabla `tenants` count ±5% vs prod
   → Verificar tabla `bookings` count ±5% vs prod

4. VERIFICACIÓN POST-RESTORE:
   → curl https://<preview-url>/api/health → debe responder 200
   → curl https://<preview-url>/api/status → DB + pg-boss OK
   → Login con un admin de prueba (no real) → grilla carga
   → Crear booking de prueba → confirma persistencia

5. DOCUMENTACIÓN DE EVIDENCIA (obligatoria):
   Crear `docs/audit/backup-drills/YYYY-MM-DD.md` con:
   - Quién ejecutó
   - Timestamp del backup restaurado
   - Counts antes/después (tenants, bookings, payments)
   - Screenshot del /api/status devolviendo OK
   - Tiempo total del restore (objetivo: RPO < 24h, RTO < 1h)
   - Issues encontrados (idealmente: ninguno)

6. CLEANUP:
   → Eliminar el Supabase project de prueba (NO dejarlo encendido, cuesta $$)
   → Vercel: revertir env vars del preview
   → Push a main solo si el drill incluyó cambios al runbook
```

---

## 11. Actualización de Este Runbook

```
REGLA: El runbook se actualiza DESPUÉS de cada incidente.

Si tuviste un problema y el runbook no tenía el procedimiento:
  1. Resolver el problema.
  2. Documentar el procedimiento EN ESTE RUNBOOK.
  3. La próxima vez que pase, cualquier persona del equipo puede resolverlo.

Si seguiste un procedimiento del runbook y no funcionó:
  1. Resolver el problema.
  2. ACTUALIZAR el procedimiento que no funcionó.
  3. La información obsoleta es peor que la información faltante.

Si cambia la infraestructura (nueva herramienta, nuevo proveedor):
  1. Actualizar la sección de contactos y accesos (§1).
  2. Actualizar los procedimientos afectados.

El runbook es un documento VIVO. Su valor depende de que esté actualizado.
```
