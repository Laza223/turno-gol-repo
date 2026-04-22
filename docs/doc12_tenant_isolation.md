# DOC 12 — Tenant Isolation Model
## TurnoGol: El Modelo de Aislamiento que Protege Cada Complejo

> **Propósito**: Definir con precisión quirúrgica cómo se aíslan los datos entre tenants.
> Un tenant (complejo deportivo) NUNCA puede ver, modificar ni inferir la existencia
> de datos de otro tenant. Este documento es la referencia definitiva para implementar,
> auditar y testear el aislamiento.

> [!CAUTION]
> Una falla de aislamiento no es un bug — es una brecha de seguridad y una violación
> de la Ley 25.326 de Protección de Datos Personales. Si un dueño de complejo puede ver
> las reservas de otro complejo, TurnoGol pierde toda credibilidad. No hay segunda oportunidad.

---

## 1. Decisión de Arquitectura

**Modelo elegido**: Row-Level Security (RLS) con `tenant_id` en PostgreSQL.
**Documentado en**: ADR-001 (Doc 11).

```
Un solo schema PostgreSQL.
Todas las tablas de negocio tienen un campo tenant_id UUID NOT NULL.
PostgreSQL aplica un policy RLS que filtra filas automáticamente.
El contexto de tenant se setea al inicio de cada request autenticado.
```

**Por qué RLS y no schema-per-tenant o DB-per-tenant**: Con 50-500 tenants en Year 1 y ~2 ops/segundo en pico, RLS con índices apropiados es más que suficiente. Un solo schema simplifica migrations, backups, deployments y costos de infra. El detalle completo de la evaluación está en ADR-001.

---

## 2. Clasificación de Tablas: Aisladas vs Globales

### Tablas con `tenant_id` — Datos aislados (un tenant NUNCA ve datos de otro)

| # | Tabla | Entidad (Doc 6) | Justificación del aislamiento |
|---|---|---|---|
| 1 | `courts` | Court | Las canchas pertenecen a un solo complejo |
| 2 | `bookings` | Booking | Las reservas son del complejo que las gestiona |
| 3 | `abonados` | Abonado | Los turnos fijos son acuerdos del complejo |
| 4 | `payments` | Payment | Transacciones financieras del complejo |
| 5 | `cash_flows` | CashFlow | Movimientos de caja del complejo |
| 6 | `products` | Product | Stock de cantina del complejo |
| 7 | `tenant_staff_members` | StaffUser ↔ Tenant | Relación staff-complejo |
| 8 | `notifications` | Notification | Mensajes enviados por el complejo |
| 9 | `audit_logs` | AuditLog | Registro de acciones del complejo |
| 10 | `tenant_subscriptions` | TenantSubscription | Suscripción SaaS del complejo |
| 11 | `tenant_player_bans` | TenantPlayerBan | Bans de jugadores por complejo |
| 12 | `daily_cash_closes` | DailyCashClose | Cierre de caja diario del complejo (INMUTABLE post-cierre) |

**Total: 12 tablas aisladas con RLS.**

### Tablas SIN `tenant_id` — Datos globales (cross-tenant o del sistema)

| # | Tabla | Entidad | Justificación de ser global |
|---|---|---|---|
| 1 | `tenants` | Tenant | La propia tabla de complejos. No pertenece a ningún tenant — ES el tenant. |
| 2 | `players` | Player | Un jugador puede reservar en múltiples complejos. Su cuenta no pertenece a ninguno. |
| 3 | `staff_users` | StaffUser | Un staff puede administrar múltiples complejos. Sus datos de usuario son globales. |
| 4 | `plans` | Plan | Los planes de suscripción son iguales para todos los complejos. |
| 5 | `price_versions` | PriceVersion | Historial de precios de planes, datos del sistema. |
| 6 | `processed_webhooks` | ProcessedWebhook | Idempotencia de webhooks de MP, datos del sistema. |
| 7 | `player_tenant_relationships` | PlayerTenantRelationship | Relación jugador↔complejo. Global pero con RLS dual (staff ve por tenant, jugador ve los suyos). |

**Total: 6 tablas globales + 1 con RLS dual (`player_tenant_relationships`).**

> [!NOTE]
> † `player_tenant_relationships` tiene `tenant_id` y RLS dual: una policy para staff (por tenant) y otra para jugador (por player_id).
> Se clasifica como "global" porque la relación es cross-tenant (un jugador tiene relaciones con N complejos).

> [!IMPORTANT]
> **Regla absoluta**: Si una tabla tiene datos que podrían exponer información de un complejo
> a otro complejo, DEBE tener `tenant_id` y RLS. No hay excepciones.
> Si hay duda sobre si una tabla necesita `tenant_id`, la respuesta es SÍ.

---

## 3. Implementación RLS en PostgreSQL

### 3.1 Creación del campo `tenant_id`

Cada tabla aislada tiene `tenant_id` como campo obligatorio con foreign key a `tenants`:

```sql
-- Patrón estándar para todas las tablas aisladas
ALTER TABLE bookings ADD COLUMN tenant_id UUID NOT NULL REFERENCES tenants(id);
ALTER TABLE courts ADD COLUMN tenant_id UUID NOT NULL REFERENCES tenants(id);
ALTER TABLE abonados ADD COLUMN tenant_id UUID NOT NULL REFERENCES tenants(id);
ALTER TABLE payments ADD COLUMN tenant_id UUID NOT NULL REFERENCES tenants(id);
ALTER TABLE cash_flows ADD COLUMN tenant_id UUID NOT NULL REFERENCES tenants(id);
ALTER TABLE products ADD COLUMN tenant_id UUID NOT NULL REFERENCES tenants(id);
ALTER TABLE tenant_staff_members ADD COLUMN tenant_id UUID NOT NULL REFERENCES tenants(id);
ALTER TABLE notifications ADD COLUMN tenant_id UUID NOT NULL REFERENCES tenants(id);
ALTER TABLE audit_logs ADD COLUMN tenant_id UUID NOT NULL REFERENCES tenants(id);
ALTER TABLE tenant_subscriptions ADD COLUMN tenant_id UUID NOT NULL REFERENCES tenants(id);
ALTER TABLE tenant_player_bans ADD COLUMN tenant_id UUID NOT NULL REFERENCES tenants(id);
ALTER TABLE daily_cash_closes ADD COLUMN tenant_id UUID NOT NULL REFERENCES tenants(id);
```

### 3.2 Índices en `tenant_id`

Cada tabla aislada tiene un índice en `tenant_id` porque TODOS los queries filtran por él:

```sql
-- Índice simple en tenant_id para cada tabla
CREATE INDEX idx_bookings_tenant ON bookings(tenant_id);
CREATE INDEX idx_courts_tenant ON courts(tenant_id);
CREATE INDEX idx_abonados_tenant ON abonados(tenant_id);
CREATE INDEX idx_payments_tenant ON payments(tenant_id);
CREATE INDEX idx_cash_flows_tenant ON cash_flows(tenant_id);
CREATE INDEX idx_products_tenant ON products(tenant_id);
CREATE INDEX idx_tenant_staff_members_tenant ON tenant_staff_members(tenant_id);
CREATE INDEX idx_notifications_tenant ON notifications(tenant_id);
CREATE INDEX idx_audit_logs_tenant ON audit_logs(tenant_id);
CREATE INDEX idx_tenant_subscriptions_tenant ON tenant_subscriptions(tenant_id);
CREATE INDEX idx_tenant_player_bans_tenant ON tenant_player_bans(tenant_id);
CREATE INDEX idx_daily_cash_closes_tenant ON daily_cash_closes(tenant_id);

-- Índices compuestos para queries frecuentes (tenant_id siempre como primer campo)
CREATE INDEX idx_bookings_tenant_date ON bookings(tenant_id, date);
CREATE INDEX idx_bookings_tenant_court_date ON bookings(tenant_id, court_id, date);
CREATE INDEX idx_cash_flows_tenant_date ON cash_flows(tenant_id, occurred_at);
CREATE INDEX idx_notifications_tenant_status ON notifications(tenant_id, status);
CREATE INDEX idx_audit_logs_tenant_created ON audit_logs(tenant_id, created_at);
```

> [!NOTE]
> **`tenant_id` siempre es el primer campo del índice compuesto.**
> PostgreSQL usa el leftmost prefix de un índice compuesto. Si `tenant_id` es el primer campo,
> el índice se usa tanto para queries que filtran solo por `tenant_id` como para queries que
> filtran por `tenant_id + date`, `tenant_id + court_id + date`, etc.

### 3.3 Policies RLS

```sql
-- ================================================
-- PATRÓN: Activar RLS y crear policies para cada tabla aislada
-- Se repite para las 11 tablas
-- ================================================

-- 1. Activar RLS (la tabla rechaza acceso por defecto hasta que exista un policy)
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- 2. Policy de lectura: solo ve filas de su tenant
CREATE POLICY tenant_isolation_select ON bookings
  FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

-- 3. Policy de inserción: solo puede insertar filas de su tenant
CREATE POLICY tenant_isolation_insert ON bookings
  FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

-- 4. Policy de actualización: solo puede modificar filas de su tenant
CREATE POLICY tenant_isolation_update ON bookings
  FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

-- 5. Policy de eliminación: solo puede borrar filas de su tenant
CREATE POLICY tenant_isolation_delete ON bookings
  FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
```

**Nota sobre `current_setting('app.current_tenant_id', true)`**: El segundo parámetro `true` hace que retorne `NULL` en vez de error si la variable no está seteada. Esto es importante porque si la variable no está seteada, el policy no matchea NINGUNA fila → el usuario no ve nada. Es un fail-safe: en caso de bug, el resultado es "no hay datos" en vez de "todos los datos".

### 3.4 Roles de base de datos

```sql
-- Rol para la aplicación (usado por el backend de TurnoGol)
CREATE ROLE turnogol_app LOGIN PASSWORD '...';

-- El rol de la app NO es superuser ni bypassa RLS
ALTER ROLE turnogol_app SET row_security = on;

-- Permisos: la app puede hacer CRUD en todas las tablas
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO turnogol_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO turnogol_app;

-- Permisos para setear la variable de configuración
ALTER ROLE turnogol_app SET app.current_tenant_id = '';
```

> [!WARNING]
> **El usuario de base de datos NUNCA debe ser superuser ni tener `BYPASSRLS`.**
> Un superuser bypassa todos los policies de RLS automáticamente. Si la app se conecta
> como superuser, el RLS no existe. Esto es la causa #1 de "RLS que no funciona"
> en producción.

### 3.5 Integración con Supabase

Supabase tiene su propio sistema de RLS integrado con auth. Los policies pueden leer el JWT directamente:

```sql
-- Alternativa Supabase-native: leer tenant_id del JWT
CREATE POLICY tenant_isolation ON bookings
  USING (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::UUID
  );
```

**Decisión**: Usamos **ambos** mecanismos:
- `current_setting('app.current_tenant_id')` para las API Routes del backend (control explícito).
- `auth.jwt()` para los accesos directos de Supabase Client (realtime, storage, queries desde el frontend).

Esto garantiza que tanto las rutas server-side como los accesos client-side están protegidos.

---

## 4. Seteo del Contexto de Tenant

### 4.1 El middleware de tenant context (backend)

En CADA request autenticado de un staff, se setea el contexto:

```typescript
// middleware/tenantContext.ts

export async function tenantContextMiddleware(req: Request, res: Response, next: NextFunction) {
  const user = req.auth; // ya autenticado por el middleware de auth previo

  if (user.type === 'staff') {
    // Staff: el tenant_id viene del JWT
    const tenantId = user.tenant_id;

    if (!tenantId) {
      return res.status(403).json({
        error: 'No tenant context',
        message: 'Este usuario no está asociado a ningún complejo.'
      });
    }

    // Verificar que el tenant existe y está activo
    const tenant = await db.query('SELECT id, status FROM tenants WHERE id = $1', [tenantId]);
    if (!tenant.rows[0]) {
      return res.status(403).json({ error: 'Tenant not found' });
    }

    // Setear el contexto de RLS para esta conexión
    await db.query("SET LOCAL app.current_tenant_id = $1", [tenantId]);

    // Adjuntar al request para uso en la capa de servicio
    req.tenantId = tenantId;
    req.tenantStatus = tenant.rows[0].status;

    next();

  } else if (user.type === 'player') {
    // Jugador: NO se setea tenant_id global
    // El jugador accede a datos cross-tenant (sus propias reservas en múltiples complejos)
    // Se setea app.current_player_id para que las policies RLS dual filtren por jugador
    await db.query("SET LOCAL app.current_player_id = $1", [user.player_id]);
    req.playerId = user.player_id;
    next();

  } else {
    return res.status(403).json({ error: 'Unknown user type' });
  }
}
```

### 4.2 `SET LOCAL` vs `SET`

```sql
-- SET LOCAL: la variable vive SOLO durante la transacción actual
-- Cuando la transacción termina (commit o rollback), la variable desaparece
SET LOCAL app.current_tenant_id = 'uuid-del-tenant';

-- SET (sin LOCAL): la variable vive durante toda la conexión/sesión
-- PELIGROSO con connection pooling: si la conexión se reutiliza para otro tenant,
-- el tenant_id anterior sigue seteado
SET app.current_tenant_id = 'uuid-del-tenant';
```

> [!CAUTION]
> **SIEMPRE usar `SET LOCAL`, NUNCA `SET`.**
> Con connection pooling (PgBouncer, Supabase Pooler), las conexiones se reutilizan entre requests.
> Si usamos `SET` sin `LOCAL`, el tenant_id de un request podría quedar seteado cuando la conexión
> se reutiliza para otro request de OTRO tenant. Esto es un data leak.
> `SET LOCAL` se auto-limpia al final de la transacción. Es fail-safe.

### 4.3 El orden del middleware stack

```
Request HTTP entrante
      │
      ▼
  1. Rate Limiter        (protección contra abuso)
      │
      ▼
  2. Auth Middleware      (verifica JWT, extrae user)
      │
      ▼
  3. Tenant Context       (setea app.current_tenant_id con SET LOCAL)
      │
      ▼
  4. Subscription Guard   (verifica que el tenant no esté suspended/churned)
      │
      ▼
  5. Feature Gate         (verifica que el plan permite la acción)
      │
      ▼
  6. Route Handler        (lógica de negocio — todos los queries ya están filtrados por RLS)
      │
      ▼
  7. Audit Logger         (registra la acción en audit_logs con tenant_id)
```

**Invariantes**:
- Para requests de **staff**: `app.current_tenant_id` está seteado. Si el middleware 3 falla, el request se rechaza con 403.
- Para requests de **jugador**: `app.current_player_id` está seteado. No se setea `app.current_tenant_id`. Steps 4 (Subscription Guard) y 5 (Feature Gate) se saltean.
- **Nunca ambos**: un request es de staff O de jugador, nunca los dos.

---

## 5. Estructura de los JWT

### 5.1 JWT de Staff (admin, recepcionista)

```json
{
  "sub": "staff-user-uuid",
  "iat": 1713390000,
  "exp": 1713393600,
  "type": "staff",
  "tenant_id": "tenant-uuid",
  "role": "admin",
  "email": "marcelo@complejo.com",
  "app_metadata": {
    "tenant_id": "tenant-uuid",
    "role": "admin",
    "tenant_name": "Complejo San Martín"
  }
}
```

**Campos clave:**
- `tenant_id` en el payload raíz Y en `app_metadata` (Supabase usa `app_metadata` para sus policies).
- `role`: `admin` — único rol en v1. Zonas sensibles protegidas por PIN del tenant.
- El JWT se genera al autenticarse y tiene el tenant_id del complejo donde se autenticó.

**¿Qué pasa si un staff es admin de 2 complejos?** Al loguearse, elige el complejo. El JWT se emite con el `tenant_id` del complejo elegido. Para cambiar de complejo, hace "switch" → se genera un nuevo JWT con el otro `tenant_id`. Nunca tiene un JWT con acceso a 2 tenants simultáneamente.

```
Login → Selector de complejo (si tiene múltiples)
            │
     ┌──────┴──────┐
     │              │
  Complejo A    Complejo B
     │              │
  JWT con         JWT con
  tenant_A        tenant_B
```

### 5.2 JWT de Jugador (B2C)

```json
{
  "sub": "player-uuid",
  "iat": 1713390000,
  "exp": 1713393600,
  "type": "player",
  "email": "agustin@gmail.com",
  "app_metadata": {
    "player_id": "player-uuid"
  }
}
```

**Diferencia crítica:** El JWT del jugador **NO tiene `tenant_id`**. El jugador es cross-tenant — puede reservar en cualquier complejo. El filtrado se hace por `player_id`, no por `tenant_id`.

### 5.3 JWT del Sistema (background jobs, cron)

```json
{
  "sub": "system",
  "iat": 1713390000,
  "exp": 1713393600,
  "type": "system",
  "app_metadata": {
    "is_system": true
  }
}
```

**Los background jobs necesitan acceder a datos de múltiples tenants** (ej: el cron de expiración de trials revisa TODOS los tenants). El sistema usa un rol de DB diferente o setea explícitamente el `tenant_id` por cada operación:

```typescript
// Worker de background job que procesa TODOS los tenants
async function expireTrials() {
  // NO setea app.current_tenant_id → no pasa por RLS
  // Usa un rol de DB con permisos de servicio
  const expiredTrials = await systemDb.query(`
    SELECT id FROM tenants
    WHERE status = 'trialing'
    AND trial_ends_at < NOW()
  `);

  for (const tenant of expiredTrials) {
    // Para cada tenant, setea el contexto y opera
    await systemDb.query("SET LOCAL app.current_tenant_id = $1", [tenant.id]);
    await systemDb.query("UPDATE tenants SET status = 'churned' WHERE id = $1", [tenant.id]);
    // Encolar notificaciones, etc.
  }
}
```

> [!IMPORTANT]
> **Los background jobs usan una conexión de DB separada con un rol de servicio** que puede
> acceder a todos los tenants. Este rol NUNCA se usa para requests HTTP de usuarios.
> Es exclusivo para procesos internos del sistema (cron, webhooks, maintenance).

---

## 6. Acceso a Datos por Tipo de Usuario

### 6.1 Staff del complejo (B2B)

```
┌──────────────────────────────────────────────────────────────┐
│ Staff (admin) del Tenant A                                   │
│                                                              │
│ PUEDE ver:                                                   │
│   ✅ Canchas de Tenant A                                     │
│   ✅ Reservas de Tenant A                                    │
│   ✅ Abonados de Tenant A                                    │
│   ✅ Pagos de Tenant A                                       │
│   ✅ Caja de Tenant A                                        │
│   ✅ Productos de Tenant A                                   │
│   ✅ Notificaciones de Tenant A                              │
│   ✅ Audit logs de Tenant A                                  │
│   ✅ Datos del jugador (nombre, teléfono) que reservó EN SU  │
│      complejo — acceso vía la reserva, no directo            │
│                                                              │
│ NO puede ver:                                                │
│   ❌ NADA del Tenant B                                       │
│   ❌ Reservas del jugador en OTROS complejos                 │
│   ❌ Datos de staff de otros complejos                       │
│   ❌ Suscripciones SaaS de otros complejos                   │
│   ❌ Datos globales del sistema (todos los tenants, métricas) │
└──────────────────────────────────────────────────────────────┘
```

### 6.2 Jugador (B2C)

```
┌──────────────────────────────────────────────────────────────┐
│ Jugador (Player)                                             │
│                                                              │
│ PUEDE ver:                                                   │
│   ✅ Página pública de CUALQUIER complejo en TurnoGol        │
│   ✅ Disponibilidad de canchas de CUALQUIER complejo         │
│   ✅ Sus PROPIAS reservas en TODOS los complejos             │
│   ✅ Su propio perfil                                        │
│                                                              │
│ NO puede ver:                                                │
│   ❌ Reservas de OTROS jugadores                             │
│   ❌ Datos financieros del complejo (caja, ingresos)         │
│   ❌ Lista de abonados del complejo                          │
│   ❌ Datos de staff del complejo                             │
│   ❌ Audit logs                                              │
│   ❌ Datos de otros jugadores                                │
└──────────────────────────────────────────────────────────────┘
```

### 6.3 Sistema (cron, webhooks, admin interno)

```
┌──────────────────────────────────────────────────────────────┐
│ Sistema (background jobs, admin interno)                     │
│                                                              │
│ PUEDE acceder:                                               │
│   ✅ Todos los tenants (para cron de trials, dunning, etc.)  │
│   ✅ Todos los jugadores (para métricas globales)            │
│   ✅ Todas las suscripciones (para billing)                  │
│   ✅ Webhooks de MercadoPago (cross-tenant)                  │
│                                                              │
│ RESTRICCIONES:                                               │
│   ⚠️ Acceso con rol de servicio dedicado, NO el rol de la app │
│   ⚠️ Nunca expuesto a requests HTTP de usuarios              │
│   ⚠️ Cada operación en un tenant setea el contexto explícito │
│   ⚠️ Todas las operaciones se registran en audit_logs        │
└──────────────────────────────────────────────────────────────┘
```

---

## 7. El Problema del Jugador Cross-Tenant

El jugador es la entidad más compleja desde el punto de vista del aislamiento, porque vive en la intersección de múltiples tenants.

### 7.1 ¿Qué datos del jugador ve cada tenant?

```
Jugador "Agustín" reserva en Complejo A y Complejo B.

Complejo A puede ver:
  ✅ Nombre y teléfono de Agustín
  ✅ Reservas de Agustín EN Complejo A
  ✅ Historial de no-shows EN Complejo A
  ✅ Ban de Agustín EN Complejo A (si lo banearon)
  ❌ Reservas de Agustín en Complejo B
  ❌ Datos financieros de Agustín en Complejo B
  ❌ Si Agustín fue baneado en Complejo B

Complejo B puede ver:
  ✅ Nombre y teléfono de Agustín
  ✅ Reservas de Agustín EN Complejo B
  ❌ Reservas de Agustín en Complejo A
  ❌ Si Agustín fue baneado en Complejo A
```

### 7.2 Implementación: la tabla `players` NO tiene RLS de tenant

La tabla `players` es global. Pero el acceso a los datos del jugador desde un tenant se controla vía JOIN:

```sql
-- El admin del Complejo A quiere ver los jugadores que reservaron en su complejo
-- (No puede ver TODOS los jugadores de TurnoGol, solo los que interactuaron con su complejo)

SELECT DISTINCT p.id, p.first_name, p.last_name, p.phone
FROM players p
INNER JOIN bookings b ON b.player_id = p.id
WHERE b.tenant_id = current_setting('app.current_tenant_id')::UUID;
-- ↑ El RLS en bookings filtra automáticamente.
-- El admin solo ve jugadores que tienen al menos 1 reserva en su complejo.
```

**Regla**: Un tenant NUNCA accede directamente a la tabla `players` sin pasar por un JOIN con una tabla que tenga RLS. Los endpoints del panel admin siempre resuelven jugadores a través de `bookings` o `abonados` del tenant.

### 7.3 Vista del jugador: sus reservas en múltiples complejos

Cuando Agustín consulta "mis reservas", ve reservas de TODOS los complejos:

```sql
-- El jugador ve SUS reservas en todos los complejos
-- Este query NO usa app.current_tenant_id (el jugador es cross-tenant)

SELECT b.*, c.name as court_name, t.name as complex_name
FROM bookings b
JOIN courts c ON c.id = b.court_id
JOIN tenants t ON t.id = b.tenant_id
WHERE b.player_id = $player_id  -- filtrado por jugador, no por tenant
ORDER BY b.date DESC, b.time_start DESC;
```

> > [!IMPORTANT]
> **Para los endpoints del jugador, NO se setea `app.current_tenant_id`.**
> Los queries del jugador filtran por `player_id`, no por `tenant_id`.
> Esto significa que los endpoints del jugador bypasean el RLS de tenant
> (porque no hay contexto de tenant seteado). Esto es intencional y correcto.
>
> **Solución implementada — Fix B06 + B07 (Auditoría Cross-Layer):**
> El middleware setea `app.current_player_id` cuando el JWT es de tipo `player`.
> Las tablas con **RLS dual** (`bookings`, `player_tenant_relationships`) tienen
> policies adicionales que permiten al jugador ver SUS PROPIAS filas.
> Múltiples policies en la misma tabla se evalúan con **OR** en Supabase/PostgreSQL.
> Ver implementación completa en Doc 13 §3.2 (bookings RLS) y §4.3 (middleware).
>
> **B07 — Realtime cross-tenant:** Se agregó una tercer policy en `bookings` que
> evalua `auth.jwt() -> 'app_metadata' ->> 'tenant_id'` para cubrir las
> subscriptions de Supabase Realtime (que usan el JWT del cliente, no `current_setting`).
>
> **Riesgo residual**: Si un endpoint del jugador tiene un bug que no filtra por `player_id`,
> podría exponer datos de otros jugadores. **Mitigación**: Tests de aislamiento BLOQUEANTES
> en Doc 16 que verifican que un jugador solo ve sus propias reservas.

### 7.4 Ban cross-tenant vs ban por complejo

Dos niveles de restricción, implementados en tablas separadas:

```sql
-- Ban por complejo (el admin de Complejo A banea a Agustín solo para Complejo A)
-- Tabla con tenant_id → aislada por RLS
CREATE TABLE tenant_player_bans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  player_id UUID NOT NULL REFERENCES players(id),
  reason TEXT NOT NULL,
  banned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  banned_until TIMESTAMPTZ,  -- NULL = permanente
  banned_by UUID REFERENCES staff_users(id),
  UNIQUE(tenant_id, player_id)  -- un jugador solo puede tener un ban activo por complejo
);
ALTER TABLE tenant_player_bans ENABLE ROW LEVEL SECURITY;
-- Policies...

-- Ban global (el sistema banea a Agustín de TODA la plataforma)
-- Se controla con el campo `status` de la tabla `players`
-- players.status = 'banned', players.ban_reason, players.ban_until
-- Solo el sistema puede poner un ban global (no un admin de complejo)
```

**Flujo de verificación al reservar:**
```
Agustín intenta reservar en Complejo A
      │
      ▼
  1. ¿players.status == 'banned'?         → ERROR "Tu cuenta está suspendida"
      │ no
      ▼
  2. ¿Existe en tenant_player_bans       → ERROR "No podés reservar en este complejo"
     para Complejo A y aún vigente?
      │ no
      ▼
  3. Procesar la reserva normalmente
```

---

## 8. Queries y Patrones Seguros

### 8.1 El patrón correcto: dejar que RLS filtre

```typescript
// ✅ CORRECTO: El RLS filtra automáticamente por tenant_id
async function getBookingsForDate(date: string) {
  // SET LOCAL ya fue ejecutado por el middleware
  return db.query(
    'SELECT * FROM bookings WHERE date = $1 ORDER BY time_start',
    [date]
  );
  // RLS agrega automáticamente: AND tenant_id = current_setting(...)
}
```

### 8.2 El patrón redundante pero seguro: doble filtro

```typescript
// ✅ TAMBIÉN CORRECTO (defense in depth): filtrar explícitamente + RLS
async function getBookingsForDate(date: string, tenantId: string) {
  return db.query(
    'SELECT * FROM bookings WHERE date = $1 AND tenant_id = $2 ORDER BY time_start',
    [date, tenantId]
  );
  // Si por algún bug el RLS no funciona, el WHERE explícito sigue protegiendo
}
```

> [!TIP]
> **Recomendación: usar el patrón de doble filtro (8.2) para tablas sensibles**
> (bookings, payments, cash_flows). El WHERE explícito con `tenant_id` es redundante
> si RLS funciona, pero actúa como safety net si algo falla en el RLS.
> Para tablas menos sensibles (products, notifications), confiar en RLS solo (8.1) es suficiente.

### 8.3 El antipatrón: query sin contexto

```typescript
// ❌ INCORRECTO: Si el middleware no seteó el tenant, esto devuelve NADA (gracias a RLS)
// pero es un bug silencioso
async function getBookingsForDate(date: string) {
  // Si no se ejecutó SET LOCAL antes de esta query...
  return db.query('SELECT * FROM bookings WHERE date = $1', [date]);
  // RLS filtra por current_setting('app.current_tenant_id') que es NULL → 0 filas
  // El admin ve "no hay reservas" cuando en realidad sí las hay
}
```

**Mitigación**: El middleware de tenant context siempre se ejecuta antes del route handler. Si no existe `tenant_id` en el JWT, el request se rechaza con 403 antes de llegar al handler.

### 8.4 JOINs entre tablas aisladas y tablas globales

```sql
-- ✅ CORRECTO: JOIN de tabla aislada (bookings) con tabla global (players)
SELECT b.*, p.first_name, p.last_name
FROM bookings b
JOIN players p ON p.id = b.player_id
WHERE b.date = '2026-04-17';
-- RLS filtra bookings por tenant_id automáticamente
-- players no tiene RLS → se joinea correctamente
-- Resultado: solo bookings del tenant actual, con datos del jugador

-- ✅ CORRECTO: JOIN de dos tablas aisladas
SELECT b.*, c.name as court_name
FROM bookings b
JOIN courts c ON c.id = b.court_id
WHERE b.date = '2026-04-17';
-- RLS filtra AMBAS tablas por tenant_id
-- Solo ve bookings Y courts de su tenant
```

### 8.5 INSERT con tenant_id

```typescript
// ✅ CORRECTO: el tenant_id se setea explícitamente en el INSERT
async function createBooking(data: BookingInput, tenantId: string) {
  return db.query(`
    INSERT INTO bookings (tenant_id, court_id, player_id, date, time_start, time_end, ...)
    VALUES ($1, $2, $3, $4, $5, $6, ...)
  `, [tenantId, data.courtId, data.playerId, data.date, ...]);
  // RLS verifica que el tenant_id del INSERT coincida con current_setting
  // Si no coincide → INSERT rechazado
}
```

**¿Es posible que un staff inserte datos con un `tenant_id` diferente al suyo?**
No. El policy `WITH CHECK` en el INSERT verifica que el `tenant_id` del registro insertado
coincida con `current_setting('app.current_tenant_id')`. Si intenta insertar con otro tenant_id,
PostgreSQL rechaza el INSERT con un error.

---

## 9. Escenarios Especiales

### 9.1 Webhooks de MercadoPago

Los webhooks de MP llegan sin contexto de tenant (MP no sabe qué tenant es). El webhook contiene un `external_reference` que mapea al `booking_id` o `tenant_id`.

```typescript
// Webhook handler — NO usa el middleware de tenant context
async function handleMPWebhook(req: Request) {
  const { type, data } = req.body;

  // 1. Verificar idempotencia
  const alreadyProcessed = await systemDb.query(
    'SELECT id FROM processed_webhooks WHERE mp_event_id = $1',
    [data.id]
  );
  if (alreadyProcessed.rows.length > 0) return; // ya lo procesamos

  // 2. Buscar la entidad relacionada para obtener el tenant_id
  if (type === 'payment') {
    const payment = await systemDb.query(
      'SELECT tenant_id FROM payments WHERE mp_payment_id = $1',
      [data.id]
    );
    const tenantId = payment.rows[0]?.tenant_id;

    // 3. Setear el contexto de tenant y procesar
    await systemDb.query('SET LOCAL app.current_tenant_id = $1', [tenantId]);
    await processPaymentWebhook(data);
  }
}
```

**Regla**: Los webhooks usan el rol de servicio (puede acceder cross-tenant para buscar la entidad) y luego setean el contexto explícitamente para las operaciones de negocio.

### 9.2 Registro de un nuevo complejo (no hay tenant aún)

Cuando un dueño registra un nuevo complejo, no existe `tenant_id` todavía:

```typescript
async function registerComplex(data: RegisterInput) {
  // 1. Crear el tenant (tabla global, no tiene RLS)
  const tenant = await systemDb.query(`
    INSERT INTO tenants (name, slug, status, trial_ends_at, ...)
    VALUES ($1, $2, 'trial', NOW() + INTERVAL '30 days', ...)
    RETURNING id
  `, [data.name, data.slug]);

  const tenantId = tenant.rows[0].id;

  // 2. Crear el staff user del dueño (tabla global)
  const staffUser = await systemDb.query(`
    INSERT INTO staff_users (email, first_name, last_name)
    VALUES ($1, $2, $3) RETURNING id
  `, [data.email, data.firstName, data.lastName]);

  // 3. Asociar el staff como admin del nuevo tenant (tabla aislada)
  // Setear el contexto del nuevo tenant
  await systemDb.query('SET LOCAL app.current_tenant_id = $1', [tenantId]);
  await systemDb.query(`
    INSERT INTO tenant_staff_members (tenant_id, staff_user_id, role)
    VALUES ($1, $2, 'admin')
  `, [tenantId, staffUser.rows[0].id]);

  // 4. Crear las canchas default, etc.
  // ...
}
```

### 9.3 Página pública del complejo (acceso anónimo)

La página `turnogol.com.ar/[slug]` es pública — no requiere autenticación. Pero muestra datos de un tenant específico.

```typescript
// Endpoint público: GET /api/public/complex/:slug
async function getPublicComplexPage(slug: string) {
  // 1. Buscar el tenant por slug (tabla global, sin RLS)
  const tenant = await db.query(
    'SELECT id, name, address, city, opening_hours, ... FROM tenants WHERE slug = $1',
    [slug]
  );

  if (!tenant.rows[0]) return notFound();
  const tenantId = tenant.rows[0].id;

  // 2. Setear contexto y buscar datos públicos
  await db.query('SET LOCAL app.current_tenant_id = $1', [tenantId]);

  const courts = await db.query(
    'SELECT id, name, surface_type, capacity FROM courts WHERE status = $1',
    ['online']
  );
  // RLS filtra: solo canchas de este tenant

  return { tenant: tenant.rows[0], courts: courts.rows };
}
```

### 9.4 Staff que trabaja en múltiples complejos

Un staff user puede ser admin de 2+ complejos. Su registro en `staff_users` es global, pero su acceso a cada complejo está en `tenant_staff_members`:

```
staff_users                    tenant_staff_members
┌────────────────┐             ┌──────────────────────────┐
│ id: user-123   │             │ staff_user_id: user-123  │
│ email: mar@... │ ◄────────── │ tenant_id: tenant-A      │
│ first_name: M  │             │ role: admin              │
└────────────────┘             ├──────────────────────────┤
                               │ staff_user_id: user-123  │
                               │ tenant_id: tenant-B      │
                               │ role: admin              │
                               └──────────────────────────┘
```

**Flujo de login para multi-tenant staff:**
```
1. Staff se autentica (magic link → verified email)
2. Backend busca: SELECT tenant_id, role FROM tenant_staff_members
   WHERE staff_user_id = $user_id AND is_active = true
3. Si tiene 1 solo tenant → JWT directo con ese tenant_id
4. Si tiene 2+ tenants → pantalla de selección → JWT con el tenant_id elegido
5. Para cambiar de complejo: botón "Cambiar complejo" → nueva selección → nuevo JWT
```

### 9.5 Reportes internos de TurnoGol (admin de la plataforma)

El equipo de TurnoGol (nosotros) necesita ver métricas cross-tenant: MRR, churn rate, trials activos, etc. Esto NUNCA se expone a un usuario de la plataforma.

```typescript
// Panel de admin interno de TurnoGol (acceso con rol de super-admin)
// Usa rol de servicio que bypassa RLS o no setea tenant context

async function getDashboardMetrics() {
  // Estas queries NO pasan por RLS — usan el service role
  const mrr = await systemDb.query(`
    SELECT SUM(p.price_monthly) as mrr
    FROM tenant_subscriptions ts
    JOIN plans p ON p.id = ts.plan_id
    WHERE ts.status = 'active'
  `);

  const activeTrials = await systemDb.query(`
    SELECT COUNT(*) FROM tenants WHERE status = 'trialing'
  `);

  // ...
}
```

> [!WARNING]
> **El panel de admin interno es un riesgo de seguridad si se expone.**
> Debe estar en una ruta separada (`/internal/dashboard`), protegida por una autenticación
> adicional (IP whitelist + 2FA + rol de super-admin). Nunca compartir endpoints con el panel admin
> de un tenant.

---

## 10. Testing de Aislamiento

### 10.1 Test obligatorio pre-deploy: Cross-Tenant Isolation Test

Este test es el guardián final. Si falla, el deploy NO avanza.

```typescript
describe('Tenant Isolation', () => {
  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    // Crear dos tenants de test con datos
    tenantA = await createTestTenant('Complejo A');
    tenantB = await createTestTenant('Complejo B');

    // Crear datos en cada tenant
    await setTenantContext(tenantA);
    await createTestBooking(tenantA, { date: '2026-04-17', time: '21:00' });
    await createTestCashFlow(tenantA, { amount: 10000 });

    await setTenantContext(tenantB);
    await createTestBooking(tenantB, { date: '2026-04-17', time: '21:00' });
    await createTestCashFlow(tenantB, { amount: 20000 });
  });

  describe('SELECT isolation', () => {
    it('Tenant A cannot see bookings of Tenant B', async () => {
      await setTenantContext(tenantA);
      const bookings = await db.query('SELECT * FROM bookings');
      expect(bookings.rows.every(b => b.tenant_id === tenantA)).toBe(true);
      expect(bookings.rows.some(b => b.tenant_id === tenantB)).toBe(false);
    });

    it('Tenant B cannot see bookings of Tenant A', async () => {
      await setTenantContext(tenantB);
      const bookings = await db.query('SELECT * FROM bookings');
      expect(bookings.rows.every(b => b.tenant_id === tenantB)).toBe(true);
      expect(bookings.rows.some(b => b.tenant_id === tenantA)).toBe(false);
    });

    it('Tenant A cannot see cash flows of Tenant B', async () => {
      await setTenantContext(tenantA);
      const cashFlows = await db.query('SELECT * FROM cash_flows');
      expect(cashFlows.rows.every(cf => cf.tenant_id === tenantA)).toBe(true);
    });
  });

  describe('INSERT isolation', () => {
    it('Tenant A cannot insert booking with Tenant B id', async () => {
      await setTenantContext(tenantA);
      await expect(
        db.query('INSERT INTO bookings (tenant_id, ...) VALUES ($1, ...)', [tenantB])
      ).rejects.toThrow(); // RLS WITH CHECK rechaza el INSERT
    });
  });

  describe('UPDATE isolation', () => {
    it('Tenant A cannot update bookings of Tenant B', async () => {
      await setTenantContext(tenantA);
      const result = await db.query(
        'UPDATE bookings SET notes_internal = $1 WHERE tenant_id = $2',
        ['hacked', tenantB]
      );
      expect(result.rowCount).toBe(0); // RLS filtra: no ve filas de Tenant B → 0 rows affected
    });
  });

  describe('DELETE isolation', () => {
    it('Tenant A cannot delete bookings of Tenant B', async () => {
      await setTenantContext(tenantA);
      const result = await db.query(
        'DELETE FROM bookings WHERE tenant_id = $1',
        [tenantB]
      );
      expect(result.rowCount).toBe(0); // RLS filtra
    });
  });

  describe('No context = no data', () => {
    it('Without tenant context, SELECT returns zero rows', async () => {
      // No seteamos app.current_tenant_id
      await db.query("RESET app.current_tenant_id");
      const bookings = await db.query('SELECT * FROM bookings');
      expect(bookings.rows.length).toBe(0); // Fail-safe: sin contexto, nada
    });
  });
});
```

### 10.2 Test de aislamiento para CADA tabla

```typescript
// Generar tests de aislamiento automáticamente para las 12 tablas
const ISOLATED_TABLES = [
  'courts', 'bookings', 'abonados', 'payments', 'cash_flows',
  'products', 'tenant_staff_members', 'daily_cash_closes',
  'notifications', 'audit_logs', 'tenant_subscriptions', 'tenant_player_bans'
];

for (const table of ISOLATED_TABLES) {
  describe(`RLS on ${table}`, () => {
    it(`Tenant A cannot read ${table} of Tenant B`, async () => {
      await setTenantContext(tenantA);
      const rows = await db.query(`SELECT * FROM ${table}`);
      for (const row of rows.rows) {
        expect(row.tenant_id).toBe(tenantA);
      }
    });
  });
}
```

### 10.3 Test de aislamiento del jugador

```typescript
describe('Player Isolation', () => {
  it('Player A cannot see bookings of Player B', async () => {
    const playerA = await createTestPlayer('Player A');
    const playerB = await createTestPlayer('Player B');

    // Crear reservas para ambos jugadores en el mismo complejo
    await setTenantContext(tenantA);
    await createBookingForPlayer(playerA, tenantA);
    await createBookingForPlayer(playerB, tenantA);

    // Consultar como Player A (sin tenant context, con player filter)
    const bookings = await db.query(
      'SELECT * FROM bookings WHERE player_id = $1',
      [playerA]
    );

    expect(bookings.rows.every(b => b.player_id === playerA)).toBe(true);
    expect(bookings.rows.some(b => b.player_id === playerB)).toBe(false);
  });
});
```

### 10.4 Integración con CI/CD

```yaml
# En el pipeline de CI/CD
test:isolation:
  stage: test
  script:
    - npm run test:isolation
  rules:
    - when: always   # Corre SIEMPRE, en cada PR y en cada deploy
  allow_failure: false  # Si falla, NO se deploya
```

**Regla inviolable**: El test suite de aislamiento corre en cada deploy. Si falla UN solo test, el deploy se cancela automáticamente. No hay excepciones.

---

## 11. Checklist de Implementación

### Para cada nueva tabla que se cree:

- [ ] ¿Tiene `tenant_id UUID NOT NULL REFERENCES tenants(id)`? (Si es aislada)
- [ ] ¿Tiene `CREATE INDEX idx_{table}_tenant ON {table}(tenant_id)`?
- [ ] ¿Tiene `ALTER TABLE {table} ENABLE ROW LEVEL SECURITY`?
- [ ] ¿Tiene policies para SELECT, INSERT, UPDATE, DELETE?
- [ ] ¿Está incluida en el test suite de aislamiento?
- [ ] ¿El service correspondiente setea `tenant_id` en los INSERTs?

### Para cada nuevo endpoint de API:

- [ ] ¿Pasa por el middleware de tenant context?
- [ ] ¿Es un endpoint de staff o de jugador? (Determina si se setea tenant context)
- [ ] ¿Los queries filtran por `tenant_id` explícitamente o confían solo en RLS?
- [ ] ¿Hay un test que verifica que el endpoint no devuelve datos de otro tenant?

### Para cada nuevo background job:

- [ ] ¿Usa el rol de servicio o el rol de la app?
- [ ] ¿Setea el tenant context explícitamente antes de operar en datos de un tenant?
- [ ] ¿Registra las operaciones en audit_logs con el tenant_id correcto?

---

## 12. Resumen de Seguridad: Capas de Protección

```
CAPA 1 — JWT (Application Layer)
  El JWT del staff incluye tenant_id.
  El middleware extrae el tenant_id y lo valida.
  Si no hay tenant_id → request rechazado (403).

CAPA 2 — SET LOCAL (Connection Layer)
  El middleware ejecuta SET LOCAL app.current_tenant_id = '{uuid}'.
  La variable vive solo durante la transacción actual.
  Al terminar el request, la variable desaparece automáticamente.

CAPA 3 — RLS Policies (Database Layer)
  PostgreSQL filtra automáticamente las filas por tenant_id.
  Funciona para SELECT, INSERT, UPDATE y DELETE.
  Es transparente para la aplicación — los queries no necesitan WHERE tenant_id = X.

CAPA 4 — Rol de DB sin BYPASSRLS (Database Layer)
  El usuario de DB de la aplicación NO puede bypasear RLS.
  Aunque un atacante obtenga las credenciales de la DB, RLS sigue activo.

CAPA 5 — Defense in Depth (Application Layer)
  Para tablas sensibles, los queries incluyen WHERE tenant_id = $X explícitamente.
  Redundante con RLS, pero protege si RLS falla por un bug en la configuración.

CAPA 6 — Tests Automatizados (CI/CD)
  Tests de aislamiento corren en CADA deploy.
  Si un test falla → el deploy se cancela.
  Los tests verifican SELECT, INSERT, UPDATE, DELETE y el caso "sin contexto".
```

> [!IMPORTANT]
> **6 capas de protección.** Para que un data leak ocurra, tendrían que fallar TODAS simultáneamente:
> el JWT tendría que tener un tenant_id incorrecto, el middleware tendría que no validarlo,
> el SET LOCAL tendría que no ejecutarse, el RLS tendría que estar desactivado,
> el WHERE explícito tendría que estar ausente, y los tests tendrían que no detectarlo.
> La probabilidad de fallo simultáneo de 6 capas independientes es prácticamente cero.
