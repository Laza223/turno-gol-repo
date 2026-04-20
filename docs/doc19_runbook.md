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
| **Email equipo@turnogol.com.ar** | Comunicaciones formales, post-mortem | Todo el equipo |
| **Email soporte@turnogol.com.ar** | Tickets de clientes | Soporte + Devs |

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

---

## 3. Procedimientos de Emergencia

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
     → Verificar: ping turnogol.com.ar
     → Verificar: nslookup turnogol.com.ar
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
  6. Verificar: curl https://turnogol.com.ar/api/health
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
        → Purgar datos temporales: TRUNCATE processed_webhooks
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
       AND type = 'subscription_payment' ORDER BY created_at DESC LIMIT 5;

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

## 4. Mantenimiento Programado

### 4.1 Tareas diarias (automáticas)

| Tarea | Horario | Ejecutor | Qué hace |
|---|---|---|---|
| Backup de DB | Automático (Supabase) | Supabase | Backup diario, retención 30 días |
| Health check | Cada 1-5 min | UptimeRobot | Verifica que la app responde |
| Expiración de bookings | Cada 1 min | pg-boss worker | Expira reservas `pending_payment` > 15 min |
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
  'products', 'tenant_staff_members',
  'notifications', 'audit_logs', 'tenant_subscriptions', 'tenant_player_bans'
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
contactanos en soporte@turnogol.com.ar.

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

### 7.2 Template de post-mortem

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
  □ DNS: turnogol.com.ar apuntando a Vercel
  □ Sentry: proyecto configurado, release tracking activado
  □ UptimeRobot: monitores configurados (health + homepage + auth)
  □ Resend: dominio verificado, API key en env vars
  □ MercadoPago: app de producción creada, webhooks configurados

SEGURIDAD:
  □ Todas las env vars de producción son diferentes a las de desarrollo
  □ Supabase service role key NO está expuesta al frontend
  □ RLS activado en las 12 tablas aisladas
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
□ Health check responde 200: curl https://turnogol.com.ar/api/health
□ Sentry: no hay errores nuevos en los primeros 5 minutos
□ Verificar manualmente la funcionalidad que cambió
□ Si cambió algo de DB: verificar que las migrations se aplicaron
□ Si cambió algo de auth: verificar login funcional
□ Monitorear Sentry durante 15-30 minutos post-deploy
```

---

## 9. Actualización de Este Runbook

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
