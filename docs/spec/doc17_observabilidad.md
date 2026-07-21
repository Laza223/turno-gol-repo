# DOC 17 — Observabilidad & Monitoreo
## TurnoGol: Ver lo que Pasa Antes de que el Cliente te Llame

> **Propósito**: Definir qué observamos, cómo lo observamos y qué hacemos cuando algo anda mal.
> Observabilidad no es un nice-to-have — es la diferencia entre "se cayó 20 minutos y no
> nos enteramos" y "detectamos el problema antes de que impacte al primer usuario".

> [!IMPORTANT]
> Principio rector: **si no podemos medirlo, no podemos mejorarlo; si no tenemos alerta,
> nos enteramos por el cliente**. Con un equipo de 1-3 personas y 0 DevOps dedicados,
> la observabilidad tiene que ser automática, barata y accionable.

---

## 1. Tres Pilares de Observabilidad

```
┌─────────────────────────────────────────────────────────────┐
│                 OBSERVABILIDAD EN TURNOGOL                   │
│                                                             │
│   PILAR 1              PILAR 2              PILAR 3         │
│   ─────────            ─────────            ─────────       │
│   LOGS                 MÉTRICAS             TRACES          │
│   (qué pasó)           (cuánto/cuándo)      (por dónde)     │
│                                                             │
│   JSON estructurado    Sentry Performance   Sentry Tracing  │
│   →  Vercel Logs       Vercel Analytics     (10% sampling)  │
│   →  console.log()     Custom counters                      │
│                                                             │
│   Costo: $0            Costo: $0-26/mes     Costo: $0       │
│   (incluido en Vercel) (Sentry free/team)   (incluido)      │
└─────────────────────────────────────────────────────────────┘
```

### 1.1 Por qué no Datadog/New Relic/Grafana Cloud

| Solución | Costo/mes | Justificación de descarte |
|---|---|---|
| Datadog | $100-500+ | Overkill para ~2 ops/segundo. El costo supera el hosting completo. |
| New Relic | $100-300+ | Idem. Funcionalidad para empresas con equipos de SRE de 5+ personas. |
| Grafana Cloud | $0-50 | Más razonable, pero agrega complejidad operacional (configurar collectors, dashboards). |
| **Sentry + Vercel + logs** | **$0-26** | **Suficiente para Year 1.** Sentry para errores y performance, Vercel para logs e infra, logs propios para negocio. |

**La regla**: No agregamos infra de observabilidad que cueste más que la infra que observamos. Con hosting total de ~$126-151 USD/mes (Doc 14 §12), gastar $300 en monitoreo es desproporcionado.

---

## 2. Logging Estructurado

### 2.1 Formato: JSON en stdout

Todos los logs son JSON en una sola línea, emitidos a `stdout`. Vercel captura `stdout` automáticamente y lo muestra en su dashboard de logs. No hay archivos de log, no hay rotación, no hay disco.

```typescript
// src/shared/utils/logger.ts

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  // Contexto — siempre presente si hay sesión autenticada
  tenant_id?: string;
  user_id?: string;
  user_type?: 'staff' | 'player' | 'system';
  request_id?: string;
  // Datos adicionales según el evento
  [key: string]: unknown;
}

function log(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    tenant_id: getCurrentTenantId() ?? undefined,
    user_id: getCurrentUserId() ?? undefined,
    user_type: getCurrentUserType() ?? undefined,
    request_id: getCurrentRequestId() ?? undefined,
    ...meta,
  };

  // JSON en una sola línea — parseble por cualquier herramienta
  const output = JSON.stringify(entry);

  switch (level) {
    case 'debug': if (process.env.NODE_ENV === 'development') console.debug(output); break;
    case 'info':  console.log(output); break;
    case 'warn':  console.warn(output); break;
    case 'error': console.error(output); break;
  }
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => log('debug', msg, meta),
  info:  (msg: string, meta?: Record<string, unknown>) => log('info', msg, meta),
  warn:  (msg: string, meta?: Record<string, unknown>) => log('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log('error', msg, meta),
};
```

### 2.2 Niveles de log y cuándo usar cada uno

| Nivel | Cuándo | Ejemplo | Volumen esperado |
|---|---|---|---|
| `debug` | Solo en desarrollo. Nunca en producción. | `"Calculando precio para cancha 3, franja weekday_night"` | Alto (solo dev) |
| `info` | Eventos de negocio significativos. Cada acción que cambia estado. | `"booking.created"`, `"payment.approved"`, `"trial.expired"` | ~5.000-10.000/día |
| `warn` | Algo inesperado pero no roto. El sistema se recuperó solo. | `"mp.webhook.duplicate"`, `"email.send.retry"`, `"rls.context.missing"` | ~50-200/día |
| `error` | Algo roto. Requiere atención. | `"booking.create.failed"`, `"mp.webhook.invalid_signature"` | ~5-20/día (target) |

### 2.3 Eventos de negocio que se loguean (SIEMPRE)

Cada evento que cambia el estado del sistema genera un log `info`. Estos logs son la fuente de verdad operacional — si no hay log, no pasó.

#### Módulo: Bookings

| Evento | campos extra | Cuándo |
|---|---|---|
| `booking.created` | `booking_id`, `court_id`, `type`, `method` (manual/online), `price` | Reserva creada |
| `booking.confirmed` | `booking_id`, `payment_id`, `deposit_amount` | Pago aprobado → confirmada |
| `booking.expired` | `booking_id`, `reason` (timeout/admin) | Timeout de 6 min sin pago |
| `booking.canceled` | `booking_id`, `canceled_by`, `refund_amount`, `within_policy` | Cancelación |
| `booking.completed` | `booking_id` | Marcada como jugada |
| `booking.no_show` | `booking_id`, `penalty_applied` | Marcada como no-show |
| `booking.conflict` | `booking_id`, `conflicting_booking_id`, `court_id`, `time` | Doble booking prevenido |

#### Módulo: Payments

| Evento | campos extra | Cuándo |
|---|---|---|
| `payment.created` | `payment_id`, `amount`, `method`, `type` | Cobro iniciado |
| `payment.approved` | `payment_id`, `mp_payment_id`, `amount` | Pago exitoso |
| `payment.rejected` | `payment_id`, `mp_payment_id`, `reason` | Pago rechazado |
| `payment.refunded` | `payment_id`, `refund_amount`, `booking_id` | Reembolso procesado |

#### Módulo: Billing (SaaS)

| Evento | campos extra | Cuándo |
|---|---|---|
| `billing.trial.started` | `tenant_id`, `trial_ends_at` | Tenant nuevo en trial |
| `billing.trial.expired` | `tenant_id`, `converted` (bool) | Trial venció |
| `billing.subscription.created` | `tenant_id`, `plan`, `billing_cycle` | Suscripción creada |
| `billing.payment.success` | `tenant_id`, `amount`, `plan` | Cobro mensual/anual OK |
| `billing.payment.failed` | `tenant_id`, `attempt_number`, `reason` | Cobro fallido |
| `billing.dunning.started` | `tenant_id`, `attempt` | Inicio de secuencia de dunning |
| `billing.suspended` | `tenant_id`, `days_past_due` | Acceso bloqueado por falta de pago |
| `billing.plan.upgraded` | `tenant_id`, `from_plan`, `to_plan`, `proration` | Upgrade |
| `billing.plan.downgraded` | `tenant_id`, `from_plan`, `to_plan`, `effective_date` | Downgrade |
| `billing.canceled` | `tenant_id`, `reason`, `effective_date` | Cancelación voluntaria |

#### Módulo: Notifications

| Evento | campos extra | Cuándo |
|---|---|---|
| `notification.queued` | `notification_id`, `channel` (email), `template` | Encolada en pg-boss |
| `notification.sent` | `notification_id`, `channel`, `resend_id` | Enviada exitosamente |
| `notification.failed` | `notification_id`, `channel`, `error`, `attempt` | Fallo en el envío |
| `notification.delivered` | `notification_id`, `channel` | Status de delivery confirmado |

#### Módulo: Auth

| Evento | campos extra | Cuándo |
|---|---|---|
| `auth.login.success` | `user_id`, `user_type`, `method` (magic_link/oauth/password) | Login exitoso |
| `auth.login.failed` | `email`, `reason` | Login fallido |
| `auth.magic_link.sent` | `email`, `user_type` | Magic link enviado |
| `auth.magic_link.expired` | `email` | Magic link expirado sin uso |
| `auth.token.refreshed` | `user_id` | Refresh token usado |
| `auth.session.revoked` | `user_id`, `reason` | Sesión invalidada |

#### Módulo: Sistema

| Evento | campos extra | Cuándo |
|---|---|---|
| `system.health.check` | `db_status`, `auth_status`, `latency_ms` | Health check periódico |
| `system.job.started` | `job_name`, `queue` | Background job inició |
| `system.job.completed` | `job_name`, `duration_ms`, `items_processed` | Background job terminó |
| `system.job.failed` | `job_name`, `error`, `attempt`, `will_retry` | Background job falló |
| `system.migration.applied` | `migration_name`, `duration_ms` | Migration ejecutada |

### 2.4 Ejemplo de log real en producción

```json
{"timestamp":"2026-04-17T23:15:42.123Z","level":"info","message":"booking.created","tenant_id":"abc-123","user_id":"staff-456","user_type":"staff","request_id":"req-789","booking_id":"bk-012","court_id":"court-345","type":"spontaneous","method":"manual","price":1200000}
```

```json
{"timestamp":"2026-04-17T23:15:42.456Z","level":"info","message":"notification.queued","tenant_id":"abc-123","user_id":"staff-456","user_type":"staff","request_id":"req-789","notification_id":"notif-678","channel":"email","template":"booking_confirmed"}
```

```json
{"timestamp":"2026-04-17T23:16:12.789Z","level":"warn","message":"mp.webhook.duplicate","request_id":"req-999","mp_event_id":"evt-111","action":"ignored"}
```

```json
{"timestamp":"2026-04-17T23:20:01.234Z","level":"error","message":"notification.failed","tenant_id":"abc-123","notification_id":"notif-678","channel":"email","error":"Resend API timeout after 8000ms","attempt":2,"will_retry":true,"next_retry_at":"2026-04-17T23:25:01Z"}
```

### 2.5 Propagación del request_id

Cada request HTTP que entra genera un UUID como `request_id`. Este ID se propaga a:
- Todos los logs generados durante ese request.
- El header `x-request-id` en la response (para debugging del frontend).
- Los jobs de pg-boss encolados durante ese request (para correlación).
- Sentry (como tag de contexto).

```typescript
// src/shared/middleware/request-id.ts
import { nanoid } from 'nanoid';

export function requestIdMiddleware(req: Request) {
  const requestId = req.headers.get('x-request-id') ?? nanoid(12);
  // Guardar en AsyncLocalStorage para acceso en todo el request
  requestContext.run({ requestId }, () => {
    // ... next()
  });
}
```

Esto permite correlacionar: "el request `req-789` creó el booking `bk-012`, encoló la notificación `notif-678`, y el worker que procesó esa notificación falló con timeout de Resend".

---

## 3. Error Tracking — Sentry

### 3.1 Configuración

```typescript
// src/shared/lib/sentry.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: env.SENTRY_DSN,

  // Performance monitoring
  tracesSampleRate: 0.1,           // 10% de requests generan un trace completo
  profilesSampleRate: 0.05,        // 5% de traces incluyen profiling de CPU

  environment: env.NODE_ENV,       // 'production' | 'development' | 'test'
  release: process.env.VERCEL_GIT_COMMIT_SHA,  // Commit SHA para tracking de releases

  // Filtrar ruido
  ignoreErrors: [
    // Errores de red del cliente (no son bugs nuestros)
    'AbortError',
    'Network request failed',
    'Failed to fetch',
    'Load failed',
    // Errores de navegación (usuario cierra la pestaña)
    'NavigationDuplicated',
    // Errores de extensiones de browser
    /^chrome-extension:\/\//,
    /^moz-extension:\/\//,
  ],

  // Antes de enviar un evento, enriquecer con contexto
  beforeSend(event) {
    // No enviar errores de desarrollo
    if (process.env.NODE_ENV === 'development') return null;

    // Agregar tenant_id como tag para filtrar en el dashboard
    const tenantId = getCurrentTenantId();
    if (tenantId) {
      event.tags = { ...event.tags, tenant_id: tenantId };
    }

    return event;
  },

  // Antes de enviar breadcrumbs
  beforeBreadcrumb(breadcrumb) {
    // No rastrear clicks en el DOM (ruido)
    if (breadcrumb.category === 'ui.click') return null;
    return breadcrumb;
  },
});
```

### 3.2 Integración con Next.js

```typescript
// sentry.client.config.ts — Para el frontend
Sentry.init({
  dsn: env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,     // No grabamos sesiones por defecto
  replaysOnErrorSampleRate: 0.5,   // Grabamos el 50% de las sesiones con error
});

// sentry.server.config.ts — Para el backend (API routes, SSR)
Sentry.init({
  dsn: env.SENTRY_DSN,
  tracesSampleRate: 0.1,
});

// sentry.edge.config.ts — Para Edge Functions (middleware)
Sentry.init({
  dsn: env.SENTRY_DSN,
  tracesSampleRate: 0.1,
});
```

### 3.3 Contexto enriquecido en cada error

Cuando Sentry captura un error, se adjunta contexto que permite diagnosticar sin reproducir:

```typescript
// src/shared/middleware/sentry-context.ts

export function setSentryContext(req: Request, user: AuthUser) {
  // Identificar al usuario sin datos sensibles
  Sentry.setUser({
    id: user.id,
    email: user.email,     // Sentry hashea emails por defecto
    type: user.type,
  });

  // Tags para filtrar en el dashboard
  Sentry.setTags({
    tenant_id: user.tenant_id ?? 'cross-tenant',
    user_type: user.type,
    user_role: user.role ?? 'none',
  });

  // Contexto adicional (visible en el detalle del error)
  Sentry.setContext('request', {
    request_id: getCurrentRequestId(),
    url: req.url,
    method: req.method,
  });

  if (user.tenant_id) {
    Sentry.setContext('tenant', {
      tenant_id: user.tenant_id,
      plan: user.plan_slug,
      status: user.tenant_status,
    });
  }
}
```

**Resultado en el dashboard de Sentry:**

```
Error: SlotUnavailableError — "Este turno acaba de ser tomado"

Tags:
  tenant_id: abc-123
  user_type: player
  environment: production

Context:
  request:
    request_id: req-789
    url: POST /api/player/bookings
    method: POST
  tenant:
    plan: estandar
    status: active

Breadcrumbs:
  [13:15:40] HTTP POST /api/player/bookings — 409
  [13:15:39] DB query: SELECT FROM bookings WHERE court_id = ...
  [13:15:38] Auth: JWT verified, user_type = player
```

### 3.4 Captura selectiva de errores

No todos los errores son iguales. Algunos son esperados (slot no disponible), otros son bugs reales.

```typescript
// src/shared/utils/errors.ts

// Errores de negocio — se retornan al cliente, pero NO se reportan a Sentry
// (son comportamiento esperado, no bugs)
export class BusinessError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'BusinessError';
  }
}

export class SlotUnavailableError extends BusinessError {
  constructor(details?: Record<string, unknown>) {
    super('SLOT_UNAVAILABLE', 'Este turno acaba de ser tomado.', 409, details);
  }
}

export class PlanLimitError extends BusinessError {
  constructor(details: Record<string, unknown>) {
    super('PLAN_LIMIT_EXCEEDED', 'Límite del plan alcanzado.', 403, details);
  }
}

// Errores de sistema — SÍ se reportan a Sentry (son bugs o problemas de infra)
export class SystemError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'SystemError';
  }
}
```

```typescript
// En el handler de errores global
export function handleApiError(error: Error, req: Request) {
  if (error instanceof BusinessError) {
    // Log info (es un flujo esperado), NO reportar a Sentry
    logger.info(`business_error.${error.code}`, {
      code: error.code,
      message: error.message,
      details: error.details,
    });

    return Response.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: error.statusCode }
    );
  }

  // Error de sistema → SÍ reportar a Sentry
  logger.error('unhandled_error', {
    error: error.message,
    stack: error.stack,
  });
  Sentry.captureException(error);

  return Response.json(
    { error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor.' } },
    { status: 500 }
  );
}
```

---

## 4. Métricas

### 4.1 Métricas técnicas (infraestructura)

Estas métricas se obtienen de Vercel Analytics y Sentry Performance sin código adicional.

| Métrica | Fuente | Target (Doc 5) | Alerta si |
|---|---|---|---|
| **Latencia p95 — grilla** | Sentry Performance | < 500ms | > 800ms por 5 min |
| **Latencia p95 — confirmar reserva** | Sentry Performance | < 1.500ms (manual), < 2.000ms (online) | > 3.000ms por 5 min |
| **Latencia p95 — dashboard** | Sentry Performance | < 800ms | > 1.500ms por 5 min |
| **Error rate** | Sentry | < 1% de requests | > 2% en 5 min |
| **FCP** | Vercel Analytics | < 1.5s | > 2.5s (tendencia) |
| **LCP** | Vercel Analytics | < 2.5s | > 3.5s (tendencia) |
| **CLS** | Vercel Analytics | < 0.1 | > 0.15 (tendencia) |
| **Function invocations** | Vercel Dashboard | — | Spike > 5x del promedio |
| **DB connection pool** | Supabase Dashboard | < 80% uso | > 90% de pool en uso |
| **DB disk usage** | Supabase Dashboard | < 70% del plan | > 80% del limite |

### 4.2 Métricas de negocio (custom)

Métricas de negocio que NO vienen de ninguna herramienta estándar. Se calculan con queries a la DB y se loguean periódicamente por un cron job.

```typescript
// src/shared/jobs/workers/metrics-collector.worker.ts
// Cron: cada hora en producción

async function collectBusinessMetrics() {
  const metrics = {
    // Booking metrics
    bookings_today: await countBookingsToday(),
    bookings_confirmed_today: await countBookingsByStatusToday('confirmed'),
    bookings_canceled_today: await countBookingsByStatusToday('canceled_refunded', 'canceled_no_refund'),
    bookings_no_show_today: await countBookingsByStatusToday('no_show'),
    booking_conflict_rate: await calculateConflictRate(), // % de intentos que chocan
    
    // Revenue metrics
    revenue_today: await sumRevenueTodayCentavos(),
    deposits_collected_today: await sumDepositsToday(),
    
    // SaaS metrics
    active_tenants: await countTenantsByStatus('active'),
    trial_tenants: await countTenantsByStatus('trialing'),
    past_due_tenants: await countTenantsByStatus('past_due'),
    suspended_tenants: await countTenantsByStatus('suspended'),
    mrr_centavos: await calculateMRR(),
    
    // Communication metrics
    email_sent_today: await countNotificationsByChannel('email', 'sent'),
    email_failed_today: await countNotificationsByChannel('email', 'failed'),
    
    // Player metrics
    new_players_today: await countNewPlayersToday(),
    active_players_30d: await countActivePlayersLast30Days(),
  };

  // Loguear como un evento estructurado
  logger.info('metrics.hourly', metrics);

  // También enviar a Sentry como custom metrics (si está habilitado)
  Sentry.metrics.gauge('business.active_tenants', metrics.active_tenants);
  Sentry.metrics.gauge('business.mrr', metrics.mrr_centavos / 100);
  Sentry.metrics.increment('business.bookings_today', metrics.bookings_today);
}
```

### 4.3 Métricas de servicios externos

| Servicio | Qué medimos | Cómo | Alerta si |
|---|---|---|---|
| **MercadoPago** | Tasa de éxito de pagos, latencia de webhooks | Logs + Sentry spans | Éxito < 90% en 1 hora, o latencia > 5s |
| **Resend (email)** | Tasa de entrega, bounces, latencia | Logs del worker `send-email` + Resend dashboard | Bounces > 5% o fallos > 10% en 1 hora |
| **Supabase Auth** | Latencia de magic link, éxitos/fallos | Logs de auth | Fallos de login > 20% en 30 min |
| **Supabase Realtime** | Conexiones activas, desconexiones | Supabase Dashboard | Desconexiones masivas |

---

## 5. Alertas

### 5.1 Principio: pocas alertas, todas accionables

> [!WARNING]
> **Alert fatigue mata la respuesta a incidentes.** Si el equipo recibe 20 alertas por día,
> las ignora todas — incluyendo la que importa. Cada alerta que configuramos tiene que tener
> una acción clara asociada. Si no hay acción, no es una alerta, es una métrica.

### 5.2 Canales de alerta

| Severidad | Canal | Quién recibe | Tiempo de respuesta esperado |
|---|---|---|---|
| 🔴 **Crítica** | Email (equipo de emergencias) + Slack | Todo el equipo | < 15 minutos |
| 🟡 **Alta** | Email + Sentry Slack integration | Equipo de desarrollo | < 2 horas |
| 🟢 **Informativa** | Sentry dashboard (no notificación push) | Revisión diaria | Próximo día hábil |

### 5.3 Catálogo de alertas

#### 🔴 Alertas Críticas (despertar a alguien a las 3am)

| ID | Condición | Acción inmediata |
|---|---|---|
| `CRIT-01` | **App down**: Health check falla 3 veces consecutivas (cada 1 min) | Verificar Vercel status. Si es deploy malo → rollback inmediato. Si es Supabase → verificar status page. |
| `CRIT-02` | **DB inaccesible**: Health check de PostgreSQL falla | Verificar Supabase dashboard. Si es outage → comunicar a clientes vía email. Esperar recovery de Supabase. |
| `CRIT-03` | **Error rate > 5%** durante 5 minutos consecutivos | Revisar Sentry. Si es regresión → rollback. Si es un endpoint específico → deshabilitar temporalmente. |
| `CRIT-04` | **Isolation test falla en CI** | BLOQUEAR deploy. Investigar inmediatamente. Posible data leak entre tenants. |
| `CRIT-05` | **Deploy roto**: Vercel deployment health check falla | Rollback automático de Vercel. Verificar que el rollback funcionó. |

#### 🟡 Alertas Altas (responder en horario laboral)

| ID | Condición | Acción |
|---|---|---|
| `HIGH-01` | **MercadoPago API errores > 20%** en una hora | Activar modo "reservas sin seña". Monitorear recovery de MP. Alertar admins activos con banner. |
| `HIGH-02` | **Email delivery rate < 80%** en una hora | Verificar status de Resend. Si es rate limit → ajustar throttling. Si es outage → encolar y esperar. |
| `HIGH-03` | **Dunning: cobro falla 3x** para un tenant específico | Revisar si es problema de MP o de la tarjeta del tenant. Contactar al tenant si es necesario. |
| `HIGH-04` | **Latencia p95 > 2x el target** durante 10 minutos | Revisar slow queries en Supabase. Verificar si hay un query sin índice o un N+1. |
| `HIGH-05` | **DB connections > 80% del pool** | Verificar si hay leak de conexiones o queries lentos. Considerar aumentar pool o optimizar. |
| `HIGH-06` | **Background job queue > 500 pendientes** | Verificar que el worker está corriendo. Si está caído → reiniciar. Si está lento → investigar. |
| `HIGH-07` | **Webhook de MP no procesado en > 5 minutos** | Verificar worker. Los webhooks de pago deben procesarse rápido para confirmar reservas. |

#### 🟢 Alertas Informativas (revisión diaria)

| ID | Condición | Acción |
|---|---|---|
| `INFO-01` | **Trial expira mañana** para un tenant | El cron de trial notification debería haber enviado el email. Verificar que se envió. |
| `INFO-02` | **Nuevo tenant registrado** | Log de métricas de negocio. No requiere acción técnica. |
| `INFO-03` | **Backup diario completado** | Verificar en Supabase que el backup existe. No requiere acción si todo OK. |
| `INFO-04` | **Upgrade/downgrade de plan** | Log. Verificar que el prorrateo se aplicó correctamente. |

### 5.4 Implementación del health check

```typescript
// src/app/api/health/route.ts

export async function GET() {
  const startTime = Date.now();

  const checks: Record<string, HealthCheck> = {};

  // 1. Database
  try {
    const dbStart = Date.now();
    await db.query('SELECT 1');
    checks.database = {
      status: 'healthy',
      latency_ms: Date.now() - dbStart,
    };
  } catch (error) {
    checks.database = {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  // 2. Supabase Auth
  try {
    const authStart = Date.now();
    await supabase.auth.getSession(); // Lightweight call
    checks.auth = {
      status: 'healthy',
      latency_ms: Date.now() - authStart,
    };
  } catch (error) {
    checks.auth = {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  // 3. pg-boss (queue system)
  try {
    const bossStart = Date.now();
    const queueSize = await boss.getQueueSize('send-email');
    checks.job_queue = {
      status: queueSize < 1000 ? 'healthy' : 'degraded',
      pending_jobs: queueSize,
      latency_ms: Date.now() - bossStart,
    };
  } catch (error) {
    checks.job_queue = {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  // Resultado global
  const overallHealthy = Object.values(checks).every(
    c => c.status === 'healthy' || c.status === 'degraded'
  );

  const response = {
    status: overallHealthy ? 'healthy' : 'unhealthy',
    checks,
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
    timestamp: new Date().toISOString(),
    uptime_ms: Date.now() - startTime,
  };

  // Log del health check (solo si unhealthy para no llenar los logs)
  if (!overallHealthy) {
    logger.warn('system.health.degraded', response);
  }

  return Response.json(response, {
    status: overallHealthy ? 200 : 503,
    headers: { 'Cache-Control': 'no-cache, no-store' },
  });
}
```

### 5.5 Uptime monitoring externo

Además del health check interno, un servicio **externo** verifica que la app está up:

```
Servicio: UptimeRobot (plan gratuito: 50 monitores, check cada 5 min)

Monitores:
  1. https://turnogol.app/api/health      → check cada 1 min (Pro plan: $7/mes)
  2. https://turnogol.app                  → check cada 5 min
  3. https://turnogol.app/api/auth/me      → check cada 5 min (verifica que auth funciona)

Si falla 3 veces consecutivas:
  → Email al equipo (UptimeRobot)
  → Sentry alert
  → Status page se actualiza automáticamente (UptimeRobot status page, gratis)
```

**¿Por qué externo?** Si Vercel se cae, nuestro propio health check endpoint no responde. El monitor externo detecta que no responde y alerta. Un sistema no puede monitorearse a sí mismo confiablemente.

---

## 6. Trazas (Tracing)

### 6.1 Qué es un trace

Un trace es el recorrido completo de un request a través del sistema. Permite responder: "¿por qué este request tardó 3 segundos?" descomponiendo el tiempo en cada paso.

### 6.2 Implementación con Sentry

```typescript
// Sentry instrumenta Next.js automáticamente con @sentry/nextjs
// Los API Routes, server components y middleware se tracean sin código adicional.

// Para agregar spans customizados en operaciones clave:
import * as Sentry from '@sentry/nextjs';

async function createManualBooking(data: BookingInput, ctx: TenantContext) {
  return Sentry.startSpan(
    { name: 'booking.create_manual', op: 'business_logic' },
    async (span) => {
      // Span hijo: verificar disponibilidad
      const available = await Sentry.startSpan(
        { name: 'booking.check_availability', op: 'db.query' },
        () => checkAvailability(data.courtId, data.date, data.timeStart, data.timeEnd)
      );

      if (!available) throw new SlotUnavailableError();

      // Span hijo: crear la reserva en DB
      const booking = await Sentry.startSpan(
        { name: 'booking.insert', op: 'db.transaction' },
        () => insertBooking(data, ctx)
      );

      // Span hijo: encolar email
      await Sentry.startSpan(
        { name: 'notification.enqueue_email', op: 'queue' },
        () => enqueueEmailConfirmation(booking.id)
      );

      return booking;
    }
  );
}
```

**Resultado en Sentry Tracing:**

```
booking.create_manual ─────────────────────── 850ms total
  ├── booking.check_availability ───────────  120ms (db.query)
  ├── booking.insert ───────────────────────  680ms (db.transaction)
  │     ├── SELECT FOR UPDATE ──────────────  250ms
  │     ├── INSERT INTO bookings ───────────  180ms
  │     ├── INSERT INTO audit_logs ─────────   50ms
  │     └── pg-boss.send ──────────────────  200ms
  └── notification.enqueue_email ────────────   50ms (queue)
```

### 6.3 Sampling

Con el plan Developer/Team de Sentry (5.000-50.000 transacciones/mes):

| Tipo de request | Sample Rate | Justificación |
|---|---|---|
| API Routes generales | 10% | Volumen alto, no necesitamos todos |
| `/api/bookings` (POST) | 30% | Operación crítica, more visibility |
| `/api/webhooks/mercadopago` | 50% | Debugging de integraciones |
| Health checks | 0% | No generan valor en tracing |

```typescript
// Configuración dinámica de sample rate
Sentry.init({
  tracesSampler: (samplingContext) => {
    const url = samplingContext.transactionContext?.name ?? '';

    if (url.includes('/api/health')) return 0;       // Nunca tracear health
    if (url.includes('/api/webhooks')) return 0.5;    // 50% webhooks
    if (url.includes('/api/bookings')) return 0.3;    // 30% bookings
    return 0.1;                                       // 10% el resto
  },
});
```

---

## 7. Dashboard Operativo

### 7.1 Fuentes de dashboards

No se construye un dashboard custom en v1. Se usan los dashboards nativos de cada herramienta:

| Herramienta | Qué muestra | URL |
|---|---|---|
| **Sentry** | Errores, traces, performance, releases | sentry.io → TurnoGol project |
| **Vercel** | Deploy status, logs, function invocations, Analytics (Core Web Vitals) | vercel.com → TurnoGol project |
| **Supabase** | DB connections, disk, Auth users, Realtime connections, API usage | supabase.com → TurnoGol project |
| **UptimeRobot** | Uptime %, response time, incident history | uptimerobot.com |
| **Resend** | Email delivery rates, bounces, opens | resend.com |

### 7.2 Revisión diaria (5 minutos)

Checklist rápida para el developer on-call (o el único developer):

```
□ Sentry: ¿hay errores nuevos sin resolver? → triagear
□ Sentry: ¿error rate de las últimas 24h? → target < 1%
□ Vercel: ¿el último deploy fue exitoso? → si no, investigar
□ Supabase: ¿DB connections okay? ¿disk usage okay?
□ UptimeRobot: ¿uptime 100% en las últimas 24h?
□ Logs: ¿billing.payment.failed en las últimas 24h? → contactar tenant si persistente
```

### 7.3 Revisión semanal (30 minutos)

```
□ Métricas de negocio:
  - MRR actual vs objetivo
  - Trials activos, conversiones de la semana
  - Churn (tenants que cancelaron o fueron suspended)
  - Tasa de no-show promedio

□ Métricas técnicas:
  - Latencia p95 por endpoint (¿se degradó algo?)
  - Error rate semanal por módulo
  - Email delivery rate (¿Resend está funcionando bien?)
  - Queue depth promedio (¿los workers están al día?)

□ Tendencias:
  - ¿Creció el tráfico? ¿Estamos cerca de algún límite?
  - ¿Algún endpoint se volvió más lento progresivamente?
  - ¿Los backups se están completando?
```

---

## 8. Graceful Degradation & Service Status

### 8.1 Detección automática de servicios caídos

```typescript
// src/shared/lib/service-status.ts

interface ServiceStatus {
  mercadopago: 'operational' | 'degraded' | 'down';
  email: 'operational' | 'degraded' | 'down';
}

// El status se actualiza cada 5 minutos via health check JOB
// o en tiempo real cuando un servicio falla
const serviceStatus: ServiceStatus = {
  mercadopago: 'operational',
  email: 'operational',
};

// Cuando MP falla:
export function markServiceDegraded(service: keyof ServiceStatus, reason: string) {
  serviceStatus[service] = 'degraded';
  logger.warn(`service.degraded`, { service, reason });

  // Si pasa a 'down' (3+ fallos consecutivos):
  if (consecutiveFailures[service] >= 3) {
    serviceStatus[service] = 'down';
    logger.error(`service.down`, { service, reason });

    // Alertar al equipo
    alertTeam(`🔴 ${service} DOWN: ${reason}`);
  }
}

// Endpoint para que el frontend muestre banners
// GET /api/status
export async function GET() {
  return Response.json({ data: serviceStatus });
}
```

### 8.2 Banner de estado en el panel admin

Cuando un servicio está degradado, el panel admin muestra un banner NO intrusivo:

```
┌──────────────────────────────────────────────────────────────┐
│ ⚠️ MercadoPago no disponible. Las reservas se crean sin     │
│    seña. Los pagos se pueden cobrar cuando MP vuelva.        │
│                                              [Entendido ✕]   │
└──────────────────────────────────────────────────────────────┘
```

```
┌──────────────────────────────────────────────────────────────┐
│ ⚠️ Email temporalmente sin servicio. Las confirmaciones       │
│    se enviarán automáticamente cuando se restablezca.         │
│                                              [Entendido ✕]   │
└──────────────────────────────────────────────────────────────┘
```

---

## 9. Costos de Observabilidad

| Herramienta | Plan | Costo/mes (USD) | Qué incluye |
|---|---|---|---|
| **Sentry** | Developer (gratis) → Team ($26) | $0-26 | 5K-50K events/mes, performance, tracing |
| **Vercel Analytics** | Incluido en Pro | $0 | Core Web Vitals, logs, function metrics |
| **Supabase Dashboard** | Incluido en Pro | $0 | DB metrics, Auth stats, Realtime stats |
| **UptimeRobot** | Free → Pro ($7) | $0-7 | 50 monitors, 5-1min checks, status page |
| **Resend Dashboard** | Incluido | $0 | Delivery rates, bounces |
| **Total** | | **$0-33/mes** | |

Con 50 complejos: **$0/mes** (Sentry free, UptimeRobot free).
Con 200+ complejos: **~$33/mes** (Sentry Team + UptimeRobot Pro).

Comparación: el hosting total es ~$126-151/mes. La observabilidad agrega 0-10% del costo de infra. **Acceptable.**

---

## 10. Lo que NO Hacemos en v1

| Capacidad | Por qué no | Cuándo reconsiderar |
|---|---|---|
| **APM dedicado** (Datadog, New Relic) | Costo desproporcionado. Sentry Performance + Vercel cubre lo necesario. | Si tenemos > 500 tenants y un equipo de > 5 devs. |
| **Log aggregation dedicado** (ELK, Loki) | Vercel retiene logs 48h-30 días según plan. Para v1 es suficiente. | Si necesitamos queries complejas sobre logs históricos. |
| **Custom dashboards** (Grafana, Metabase) | Las herramientas nativas cubren los dashboards operativos. | Si necesitamos dashboards de negocio complejos para inversores o board. |
| **Distributed tracing avanzado** | Con un monolito, el tracing de Sentry con spans custom es suficiente. | Si migramos a microservicios (ADR-007 §revisión). |
| **On-call rotation formal** (PagerDuty, OpsGenie) | Con 1-3 personas, un grupo de WA con alertas es suficiente. | Cuando el equipo crezca a 5+ personas con zonas horarias distintas. |
| **SLOs/SLIs formales** (error budgets) | Los targets de Doc 5 son nuestras SLIs informales. Formalizar SLOs tiene sentido cuando hay un equipo de SRE. | Cuando vendamos contratos enterprise con SLA contractual. |
| **Synthetic monitoring** | UptimeRobot cubre el health check. Synthetic users (scripts que reservan como si fueran usuarios) es overkill para v1. | Si detectamos bugs que solo aparecen en flows complejos multi-step. |

---

## 11. Resumen: Stack de Observabilidad Completo

```
┌────────────────────────────────────────────────────────────────┐
│              OBSERVABILITY STACK - TURNOGOL v1                  │
│                                                                │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │     SENTRY        │  │      VERCEL       │                   │
│  │                    │  │                   │                   │
│  │  • Error tracking  │  │  • Deploy logs    │                   │
│  │  • Performance     │  │  • Function logs  │                   │
│  │  • Tracing (10%)   │  │  • Analytics      │                   │
│  │  • Releases        │  │  • Web Vitals     │                   │
│  │  • Alert rules     │  │  • Build logs     │                   │
│  └────────┬───────────┘  └────────┬──────────┘                  │
│           │                       │                             │
│           └───────────┬───────────┘                             │
│                       │                                         │
│              ┌────────▼────────┐                                │
│              │   APP (Next.js)  │                               │
│              │                  │                                │
│              │  logger.info()   │── JSON → stdout → Vercel Logs │
│              │  Sentry.capture()│── Events → Sentry             │
│              │  Sentry.span()   │── Traces → Sentry             │
│              │  GET /api/health │── Status → UptimeRobot        │
│              └────────┬─────────┘                               │
│                       │                                         │
│  ┌────────────────────▼───────────────────────┐                │
│  │           SUPABASE DASHBOARD                │                │
│  │                                             │                │
│  │  • DB connections, queries, disk            │                │
│  │  • Auth: signups, logins, failures          │                │
│  │  • Realtime: active connections             │                │
│  │  • Storage: usage                           │                │
│  └─────────────────────────────────────────────┘                │
│                                                                │
│  ┌────────────┐  ┌────────────┐                                │
│  │ UptimeRobot │  │   Resend   │                                │
│  │             │  │            │                                │
│  │  Uptime %   │  │  Delivery  │                                │
│  │  Resp time  │  │  Bounces   │                                │
│  │  Incidents  │  │  Opens     │                                │
│  │  Status page│  │            │                                │
│  └────────────┘  └────────────┘                                │
│                                                                │
│  ALERTAS:                                                      │
│  🔴 Crítica → WA grupo + Email          (< 15 min respuesta)  │
│  🟡 Alta    → Email + Sentry notif      (< 2 horas)           │
│  🟢 Info    → Solo dashboard            (revisión diaria)      │
│                                                                │
│  COSTO TOTAL: $0-33/mes                                        │
└────────────────────────────────────────────────────────────────┘
```

> [!TIP]
> **La observabilidad no se implementa el día del lanzamiento — se integra desde el Sprint 1.**
> El logger y Sentry se configuran en el primer commit. Cada módulo nuevo incluye sus logs
> de eventos de negocio desde el primer PR. Si esperamos a que "algo falle", llegamos tarde.
