# DOC 15 — API Contract Design
## TurnoGol: Endpoints, Payloads, Auth y Errores

> **Propósito**: Definir el contrato entre frontend y backend.
> Cada endpoint documentado con: ruta, método, autenticación requerida,
> request body, response body, errores posibles y status codes.

> [!NOTE]
> Convenciones globales:
> - **Base URL**: `https://turnogol.app/api`
> - **JSON** para todos los bodies (request y response).
> - **Montos en centavos de ARS** (integer). Frontend convierte para display.
> - **Timestamps en UTC** (ISO 8601). Frontend convierte a ART.
> - **UUIDs** como IDs. Nunca autoincremental.
> - **snake_case** en JSON keys (consistente con la DB).
> - **Paginación**: cursor-based por defecto.

---

## 1. Autenticación y Headers

### 1.1 Tipos de acceso

| Tipo | Header | Tenant Context | Descripción |
|---|---|---|---|
| **Público** | Ninguno | Derivado del slug | Páginas públicas de complejos |
| **Staff** | `Authorization: Bearer <JWT>` | Del JWT `tenant_id` | Panel admin |
| **Jugador** | `Authorization: Bearer <JWT>` | Ninguno (cross-tenant) | App del jugador |
| **Webhook** | `X-Webhook-Secret` | Derivado del payload | MercadoPago |
| **Sistema** | Service Role Key | Explícito por operación | Cron, jobs internos |

### 1.2 JWT payload de referencia

**Staff:**
```json
{ "sub": "staff-uuid", "type": "staff", "tenant_id": "tenant-uuid", "role": "admin" }
```

**Jugador:**
```json
{ "sub": "player-uuid", "type": "player" }
```

---

## 2. Formato de Respuesta Estándar

### 2.1 Éxito (single resource)

```json
{
  "data": { /* recurso */ },
  "meta": { "request_id": "uuid" }
}
```

### 2.2 Éxito (lista paginada)

```json
{
  "data": [ /* recursos */ ],
  "pagination": {
    "cursor": "eyJ...",
    "has_more": true,
    "total_count": 150
  },
  "meta": { "request_id": "uuid" }
}
```

### 2.3 Error

```json
{
  "error": {
    "code": "SLOT_UNAVAILABLE",
    "message": "Este turno acaba de ser tomado por otro jugador.",
    "details": {
      "court_id": "uuid",
      "date": "2026-04-17",
      "time_start": "21:00",
      "suggested_alternatives": [
        { "time_start": "22:00", "time_end": "23:00", "court_name": "Cancha 2" }
      ]
    }
  },
  "meta": { "request_id": "uuid" }
}
```

### 2.4 Error de validación

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Los datos enviados no son válidos.",
    "details": {
      "fields": {
        "time_start": "La hora de inicio es obligatoria.",
        "date": "La fecha debe ser hoy o futura."
      }
    }
  }
}
```

### 2.5 Códigos de error globales

| Código HTTP | Error Code | Cuándo |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Input inválido (Zod) |
| 401 | `UNAUTHORIZED` | JWT faltante o expirado |
| 403 | `FORBIDDEN` | Sin permiso para la acción (rol, plan, tenant) |
| 403 | `PLAN_LIMIT_EXCEEDED` | Límite del plan alcanzado (con CTA de upgrade) |
| 404 | `NOT_FOUND` | Recurso no existe (o no visible por RLS) |
| 409 | `CONFLICT` | Conflicto de estado (doble booking, ya cancelado) |
| 409 | `SLOT_UNAVAILABLE` | Turno ya tomado |
| 422 | `BUSINESS_RULE_VIOLATION` | Violación de regla de negocio |
| 429 | `RATE_LIMITED` | Demasiados requests |
| 500 | `INTERNAL_ERROR` | Error interno (reportado a Sentry) |
| 503 | `SERVICE_UNAVAILABLE` | MP caído, graceful degradation activo |

---

## 3. Endpoints Públicos (sin auth)

### 3.1 Complejo público

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/public/complex/:slug` | Datos públicos del complejo |
| `GET` | `/api/public/complex/:slug/courts` | Canchas activas del complejo |
| `GET` | `/api/public/complex/:slug/availability` | Disponibilidad de canchas para una fecha |

#### `GET /api/public/complex/:slug`

```
Response 200:
{
  "data": {
    "id": "uuid",
    "name": "Complejo San Martín",
    "slug": "complejo-san-martin",
    "description": "...",
    "address": "Av. San Martín 1234, Luján",
    "city": "Luján",
    "province": "Buenos Aires",
    "latitude": -34.570,
    "longitude": -59.105,
    "phone": "+5491112345678",
    "logo_url": "https://...",
    "cover_url": "https://...",
    "opening_hours": { "mon": {"open":"08:00","close":"00:00"}, ... },
    "is_open_now": true,
    "settings": {
      "requires_deposit": true,
      "deposit_percentage": 30,
      "allow_online_booking": true,
      "booking_advance_days": 6,
      "accepts_mercadopago": true
    }
  }
}
```

#### `GET /api/public/complex/:slug/availability?date=2026-04-17`

```
Query params:
  date (required): YYYY-MM-DD

Response 200:
{
  "data": {
    "date": "2026-04-17",
    "courts": [
      {
        "id": "court-uuid",
        "name": "Cancha 1",
        "surface_type": "synthetic_grass",
        "capacity": 10,
        "slots": [
          {
            "time_start": "08:00",
            "time_end": "09:00",
            "status": "available",
            "price": 800000
          },
          {
            "time_start": "09:00",
            "time_end": "10:00",
            "status": "booked",
            "price": 800000
          },
          ...
        ]
      }
    ]
  }
}
```

> [!NOTE]
> Los slots `booked` NO incluyen datos del jugador que reservó (privacidad).
> Solo se muestra `available` | `booked`.

---

## 4. Endpoints de Autenticación

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/api/auth/magic-link` | Ninguna | Enviar magic link por email (solo jugadores) |
| `POST` | `/api/auth/login` | Ninguna | Login con email + password (solo staff) |
| `POST` | `/api/auth/verify` | Ninguna | Verificar token de magic link (jugadores) |
| `GET` | `/api/auth/callback` | Ninguna | OAuth callback (Google) |
| `POST` | `/api/auth/refresh` | Refresh token | Renovar access token |
| `POST` | `/api/auth/logout` | JWT | Cerrar sesión |
| `GET` | `/api/auth/me` | JWT | Datos del usuario actual |

#### `POST /api/auth/magic-link`

```
Request:
{ "email": "agustin@gmail.com", "type": "player" }
// Staff usa POST /api/auth/login con email+password, NO magic link.

Response 200:
{ "data": { "message": "Revisá tu casilla de email." } }

Errors:
  404 → email no encontrado (para staff)
  429 → demasiados intentos (rate limit: 3/minuto por email)
```

#### `GET /api/auth/me`

```
Response 200 (staff):
{
  "data": {
    "id": "staff-uuid",
    "type": "staff",
    "email": "marcelo@complejo.com",
    "first_name": "Marcelo",
    "last_name": "García",
    "tenant": {
      "id": "tenant-uuid",
      "name": "Complejo San Martín",
      "slug": "complejo-san-martin",
      "status": "active",
      "plan": { "name": "Complejo", "slug": "complejo", "max_courts": 6 }
    },
    "role": "admin",
    "other_tenants": [
      { "id": "tenant-2", "name": "Complejo Norte", "role": "admin" }
    ]
  }
}

Response 200 (jugador):
{
  "data": {
    "id": "player-uuid",
    "type": "player",
    "email": "agustin@gmail.com",
    "first_name": "Agustín",
    "last_name": "López",
    "phone": "+5491198765432"
  }
}
```

---

## 5. Endpoints del Panel Admin (Staff Auth)

> [!IMPORTANT]
> **Arquitectura de Implementación**: Según la directiva de `doc14_tech_stack.md`, todas las mutaciones del panel de administración (métodos `POST`, `PATCH`, `DELETE` listados en esta sección) se implementan como **Next.js Server Actions** en lugar de Route Handlers REST. Las firmas, payloads de entrada/salida y validaciones descriptas aquí se mapean 1:1 a los argumentos y retornos de dichas Server Actions.


### 5.1 Reservas (Bookings)

| Método | Ruta | Rol mínimo | Descripción |
|---|---|---|---|
| `GET` | `/api/bookings` | staff | Listar reservas (filtros: date, court_id, status) |
| `GET` | `/api/bookings/:id` | staff | Detalle de una reserva |
| `POST` | `/api/bookings` | staff | Crear reserva manual |
| `PATCH` | `/api/bookings/:id` | staff | Actualizar reserva (estado, notas) |
| `POST` | `/api/bookings/:id/cancel` | staff | Cancelar reserva |
| `POST` | `/api/bookings/:id/complete` | staff | Marcar como completada |
| `POST` | `/api/bookings/:id/no-show` | staff | Marcar como no-show |

#### `GET /api/bookings?date=2026-04-17&status=confirmed`

```
Query params:
  date: YYYY-MM-DD (default: hoy)
  court_id: UUID (opcional, filtra por cancha)
  status: booking_status (opcional)
  cursor: string (paginación)
  limit: integer (default: 50, max: 200)

Response 200:
{
  "data": [
    {
      "id": "uuid",
      "court_id": "uuid",
      "court": { "name": "Cancha 1" },
      "player_id": "uuid",
      "player": { "first_name": "Agustín", "last_name": "López", "phone": "+54..." },
      "date": "2026-04-17",
      "time_start": "21:00",
      "time_end": "22:00",
      "type": "spontaneous",
      "status": "confirmed",
      "price_snapshot": 1200000,
      "deposit_amount": 360000,
      "deposit_status": "paid",
      "notes_internal": "Grupo de Agustín, vienen siempre",
      "created_by_staff": null,
      "created_at": "2026-04-17T15:30:00Z"
    }
  ],
  "pagination": { "cursor": "...", "has_more": false, "total_count": 12 }
}
```

#### `POST /api/bookings`

```
Request:
{
  "court_id": "uuid",
  "date": "2026-04-17",
  "time_start": "21:00",
  "time_end": "22:00",
  "player_id": "uuid",          // opcional
  "guest_name": "Juan Pérez",   // si no hay player_id (campo en bookings)
  "guest_phone": "+54...",      // si no hay player_id (campo en bookings)
  "notes_internal": "...",      // opcional
  "type": "spontaneous"         // spontaneous | fixed | block
}

Response 201:
{ "data": { /* booking completo */ } }

Errors:
  409 SLOT_UNAVAILABLE → turno ya tomado (con suggested_alternatives)
  403 PLAN_LIMIT_EXCEEDED → si el plan no permite la acción
  422 BUSINESS_RULE_VIOLATION → fecha pasada, cancha inactiva, etc.
```

#### `POST /api/bookings/:id/cancel`

```
Request:
{
  "reason": "Lluvia",                    // requerido
  "cancellation_type": "complex" | "player"  // quién decide (distinto de la columna DB canceled_by, ENUM cancellation_actor player/admin/system)
}

Response 200:
{
  "data": {
    "id": "uuid",
    "status": "canceled_refunded",
    "canceled_by": "admin",
    "canceled_at": "2026-04-17T18:00:00Z",
    "refund": {
      "amount": 360000,
      "status": "pending"
    }
  }
}

Errors:
  409 CONFLICT → ya está cancelada/completada/no_show
```

### 5.2 Canchas (Courts)

| Método | Ruta | Rol mínimo | Descripción |
|---|---|---|---|
| `GET` | `/api/courts` | staff | Listar canchas del complejo |
| `GET` | `/api/courts/:id` | staff | Detalle de cancha |
| `POST` | `/api/courts` | staff | Crear cancha |
| `PATCH` | `/api/courts/:id` | staff | Editar cancha |
| `PATCH` | `/api/courts/:id/status` | staff | Activar/desactivar |

#### `POST /api/courts`

```
Request:
{
  "name": "Cancha 4",
  "surface_type": "synthetic_grass",
  "capacity": 10,
  "pricing": {
    "rules": [
      { "days": ["mon","tue","wed","thu"], "from": "08:00", "to": "18:00", "price": 800000 },
      { "days": ["mon","tue","wed","thu"], "from": "18:00", "to": "23:00", "price": 1200000 },
      { "days": ["fri","sat","sun"],       "from": "08:00", "to": "23:00", "price": 1500000 }
    ]
  }
}

Errors:
  403 PLAN_LIMIT_EXCEEDED → { "limit": 3, "current": 3, "upgrade_to": "complejo" }
```

### 5.3 Abonados

| Método | Ruta | Rol mínimo | Descripción |
|---|---|---|---|
| `GET` | `/api/abonados` | staff | Listar abonados |
| `GET` | `/api/abonados/:id` | staff | Detalle + próximas instancias |
| `POST` | `/api/abonados` | staff | Crear abonado |
| `PATCH` | `/api/abonados/:id` | staff | Editar datos |
| `POST` | `/api/abonados/:id/pause` | staff | Pausar (elimina slots futuros) |
| `POST` | `/api/abonados/:id/resume` | staff | Reanudar (regenera slots) |
| `POST` | `/api/abonados/:id/cancel` | staff | Cancelar desde fecha |

#### `POST /api/abonados`

```
Request:
{
  "court_id": "uuid",
  "player_id": "uuid",              // opcional
  "contact_name": "Grupo de Martín",
  "contact_phone": "+5491123456789",
  "day_of_week": 3,                  // 0=Domingo, 3=Miércoles
  "time_start": "21:00",
  "time_end": "22:00",
  "price_per_session": 1000000,      // centavos, puede diferir de lista
  "starts_on": "2026-04-24",
  "ends_on": null,                   // null = indefinido
  "payment_method": "cash"
}

Response 201:
{
  "data": {
    "id": "uuid",
    "status": "active",
    "generated_bookings": 8,         // slots generados para 8 semanas
    "next_booking": {
      "date": "2026-04-24",
      "time_start": "21:00"
    }
  }
}

Errors:
  409 SLOT_UNAVAILABLE → conflicto con otro abonado en ese día/hora/cancha
```

### 5.4 Caja (Cash Flows)

| Método | Ruta | Rol mínimo | Descripción |
|---|---|---|---|
| `GET` | `/api/cash-flows` | staff | Movimientos del día/período |
| `GET` | `/api/cash-flows/summary` | staff | Resumen por categoría |
| `POST` | `/api/cash-flows` | staff | Registrar movimiento |

#### `GET /api/cash-flows/summary?date=2026-04-17`

```
Response 200:
{
  "data": {
    "date": "2026-04-17",
    "income": {
      "booking": { "cash": 5400000, "transfer": 2400000, "mercadopago": 7200000 },
      "product_sale": { "cash": 450000 },
      "total": 15450000
    },
    "adjustments": {
      "no_show_correction": { "cash": -200000 },
      "total": -200000
    },
    "balance": 15250000
  }
}
```

### 5.5 Cantina (productos en JSONB, sin tabla)

La tabla `products` fue eliminada (migr. 046): los productos viven en `tenants.settings.canteen_products` (JSONB). **No hay endpoints REST `/api/products`.** La venta se hace con el Server Action `sellCanteenProductAction` (descuenta el stock atómicamente si el producto lo define, se bloquea al llegar a 0) → `CashFlow` categoría `product_sale`; el alta/edición de productos es parte de la configuración del complejo (`settings.canteen_products`).

### 5.6 Configuración del Complejo

| Método | Ruta | Rol mínimo | Descripción |
|---|---|---|---|
| `GET` | `/api/tenant` | admin | Datos del complejo |
| `PATCH` | `/api/tenant` | admin | Editar datos del complejo |
| `PATCH` | `/api/tenant/settings` | admin | Editar configuración (seña, cancelación, etc.) |
| `PATCH` | `/api/tenant/opening-hours` | admin | Editar horarios |

### 5.7 Equipo (Staff)

| Método | Ruta | Rol mínimo | Descripción |
|---|---|---|---|
| `GET` | `/api/staff` | admin | Listar staff del complejo |
| `POST` | `/api/staff/invite` | admin | Invitar staff por email |
| `PATCH` | `/api/staff/:id/role` | admin | Cambiar rol |
| `DELETE` | `/api/staff/:id` | admin | Revocar acceso |

#### `POST /api/staff/invite`

```
Request:
{ "email": "rodrigo@email.com", "role": "admin", "name": "Rodrigo" }

Response 201:
{ "data": { "id": "uuid", "email": "rodrigo@email.com", "role": "admin", "status": "pending" } }
// Se envía email con instrucciones de verificación

Errors:
  409 CONFLICT → email ya tiene acceso a este complejo
```

### 5.8 Billing (Suscripción SaaS)

| Método | Ruta | Rol mínimo | Descripción |
|---|---|---|---|
| `GET` | `/api/billing` | admin | Estado de la suscripción |
| `POST` | `/api/billing/subscribe` | admin | Crear suscripción (→ MP checkout) |
| `POST` | `/api/billing/upgrade` | admin | Upgrade de plan (→ MP pago prorrateo) |
| `POST` | `/api/billing/downgrade` | admin | Solicitar downgrade (aplica próximo ciclo) |
| `POST` | `/api/billing/cancel` | admin | Cancelar suscripción |
| `GET` | `/api/billing/invoices` | admin | Historial de pagos SaaS |

#### `GET /api/billing`

```
Response 200:
{
  "data": {
    "plan": { "name": "Complejo", "slug": "complejo", "max_courts": 5 },
    "billing_cycle": "monthly",
    "status": "active",
    "current_period_start": "2026-04-01T00:00:00Z",
    "current_period_end": "2026-05-01T00:00:00Z",
    "price_monthly": 8500000,
    "pending_plan_change": null,
    "usage": {
      "courts": { "used": 4, "limit": 5 },
      "staff": { "used": 2, "limit": null }
    }
  }
}
```

#### `POST /api/billing/upgrade`

```
Request:
{ "target_plan": "estadio" }

Response 200:
{
  "data": {
    "proration": {
      "days_remaining": 14,
      "current_daily_rate": 293333,
      "new_daily_rate": 400000,
      "charge_amount": 1493338,
      "description": "Prorrateo: 14 días × ($400.000 - $293.333)/día"
    },
    "mp_checkout_url": "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=xxx"
  }
}
```

### 5.9 Reportes

| Método | Ruta | Rol mínimo | Descripción |
|---|---|---|---|
| `GET` | `/api/reports/revenue` | staff | Ingresos por período |
| `GET` | `/api/reports/occupancy` | staff | Tasa de ocupación por cancha |
| `GET` | `/api/reports/players` | staff | Top jugadores, no-show rate |
| `GET` | `/api/reports/export` | staff | Exportar datos (CSV/Excel según plan) |

#### `GET /api/reports/occupancy?from=2026-04-01&to=2026-04-30`

```
Response 200:
{
  "data": {
    "period": { "from": "2026-04-01", "to": "2026-04-30" },
    "courts": [
      {
        "court_id": "uuid",
        "court_name": "Cancha 1",
        "total_slots": 300,
        "booked_slots": 234,
        "occupancy_rate": 0.78,
        "revenue": 28080000,
        "peak_hours": ["20:00", "21:00", "22:00"],
        "weakest_hours": ["08:00", "09:00", "10:00"]
      }
    ],
    "global": {
      "average_occupancy": 0.72,
      "total_revenue": 112320000,
      "total_bookings": 936,
      "no_show_rate": 0.04
    }
  }
}
```

> [!NOTE]
> **Fórmula real (verificado contra código — la respuesta de arriba es un ejemplo ilustrativo).**
> El endpoint JSON `GET /api/reports/occupancy` con esta forma exacta (por *slots*, ratio 0-1) **no
> está implementado**; las métricas reales viven en dos superficies con criterios distintos:
>
> - **Ocupación** — `getRevenueReport` (`src/modules/reports/report.service.ts`), consumida por la
>   página server-component `/reportes` (no un endpoint JSON). Se calcula **por minutos, no por
>   slots**, y devuelve **porcentaje 0-100** (no ratio 0-1):
>   `occupancyPct = round((minutos_reservados / minutos_disponibles) × 1000) / 10` (0 si el
>   denominador es 0).
>   - **Numerador** = minutos reservados por cancha, contando solo bookings en estados "activos":
>     `confirmed`, `completed`, `no_show` (`ACTIVE_STATUSES`). Se cuenta desde `bookings`
>     directamente (no desde `cash_flows`) para no doble-contar reservas con varios cobros.
>   - **Denominador** = suma de las `opening_hours` del complejo por día en el rango × cantidad de
>     canchas con `status = 'online'`, prorrateado por cancha.
> - **Horas pico** (`peak_hours`) — `topSlots` (`src/modules/metrics/metrics.service.ts`, expuesto
>   por `GET /api/admin/metrics`): **top-5 horarios de inicio por cantidad de reservas** (no por
>   ingresos ni por % de ocupación), ventana de **30 días** (`METRICS_WINDOW_DAYS`), **global por
>   complejo** (no per-court). El conteo usa `COUNTED_BOOKING_STATUSES`, que **incluye canceladas** —
>   criterio distinto del de ocupación.
> - **`weakest_hours` (horas valle): NO existe en el código.** Solo aparece en este ejemplo; si se
>   necesita, hay que implementarlo (p. ej. el bottom-N de la misma distribución de `topSlots`).
> - **`revenue`** — suma de `cash_flows.amount` con `type = 'income'` (métricas globales, agrupado
>   por categoría; el income per-court del reporte financiero mapea a `byCourt[].income`).

### 5.10 Notificaciones y Audit Logs

| Método | Ruta | Rol mínimo | Descripción |
|---|---|---|---|
| `GET` | `/api/notifications` | staff | Historial de notificaciones |
| `GET` | `/api/audit-logs` | staff | Historial de auditoría |

### 5.11 Jugadores (Players)

| Método | Ruta | Rol mínimo | Descripción |
|---|---|---|---|
| `GET` | `/api/players` | staff | Listar y buscar jugadores vinculados al complejo |
| `GET` | `/api/players/:id` | staff | Ver detalle, estadísticas y abonos de un jugador |
| `POST` | `/api/players/:id/bans` | staff | Banear jugador para reservas online |
| `DELETE` | `/api/players/:id/bans/:banId` | staff | Levantar ban a un jugador |

#### `POST /api/players/:id/bans`
```
Request:
{
  "reason": "Acumulación de no-shows sin aviso",
  "expires_at": "2026-05-17T00:00:00Z" // Opcional (null = permanente)
}
Response 201:
{ "data": { "id": "ban-uuid", "player_id": "uuid", "reason": "...", "expires_at": "..." } }
```

### 5.12 Conexión MercadoPago OAuth

| Método | Ruta | Rol mínimo | Descripción |
|---|---|---|---|
| `GET` | `/api/mp/oauth-start` | admin | Redirigir a MercadoPago para iniciar OAuth |
| `GET` | `/api/mp/callback` | public | Callback de MercadoPago OAuth para recibir code |
| `POST` | `/api/mp/disconnect` | admin | Revocar conexión y credenciales de MercadoPago (pendiente de implementar) |

### 5.13 Aceptación de Invitación de Staff

| Método | Ruta | Rol mínimo | Descripción |
|---|---|---|---|
| `POST` | `/api/staff/accept-invite` | public | Aceptar invitación y establecer contraseña inicial |

```
Request:
{
  "token": "verification-token-from-email",
  "password": "securepassword123"
}
Response 200:
{ "data": { "message": "Cuenta verificada con éxito. Ya podés iniciar sesión." } }
```

---

## 6. Endpoints del Jugador (Player Auth)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/player/bookings` | Mis reservas (todas, cross-tenant) |
| `GET` | `/api/player/bookings/:id` | Detalle de mi reserva |
| `POST` | `/api/player/bookings` | Crear reserva online (→ MP checkout) |
| `POST` | `/api/player/bookings/:id/cancel` | Cancelar mi reserva |
| `GET` | `/api/player/profile` | Mi perfil |
| `PATCH` | `/api/player/profile` | Editar mi perfil |
| `GET` | `/api/player/favorites` | Listar mis complejos favoritos |
| `POST` | `/api/player/favorites` | Agregar un complejo a favoritos |
| `DELETE` | `/api/player/favorites/:complexId` | Quitar complejo de favoritos |
| `POST` | `/api/player/reviews` | Dejar reseña de reserva completada |

### 6.3 Búsqueda Pública Cross-Tenant (por zona)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/public/complexes/search` | Buscar complejos con disponibilidad por zona |

```
Request query params:
  latitude (required): float
  longitude (required): float
  radius_km (optional): integer (default: 5)
  date (required): YYYY-MM-DD
  time_start (optional): HH:MM
Response 200:
{
  "data": [
    {
      "id": "tenant-uuid",
      "name": "Complejo San Martín",
      "slug": "complejo-san-martin",
      "latitude": -34.570,
      "longitude": -59.105,
      "distance_km": 1.2,
      "available_courts_count": 2
    }
  ]
}
```


#### `POST /api/player/bookings`

```
Request:
{
  "tenant_slug": "complejo-san-martin",
  "court_id": "uuid",
  "date": "2026-04-20",
  "time_start": "21:00",
  "time_end": "22:00",
  "notes": "Somos 10, llevamos pelota"
}

Response 201 (con seña):
{
  "data": {
    "booking": {
      "id": "uuid",
      "status": "pending_payment",
      "price_snapshot": 1200000,
      "deposit_amount": 360000,
      "expires_at": "2026-04-17T18:36:00Z"    // 6 min timeout
    },
    "payment": {
      "mp_checkout_url": "https://www.mercadopago.com.ar/checkout/...",
      "expires_in_seconds": 360
    }
  }
}

Response 201 (sin seña):
{
  "data": {
    "booking": {
      "id": "uuid",
      "status": "confirmed",
      "price_snapshot": 1200000,
      "deposit_amount": 0,
      "deposit_status": "not_required"
    }
  }
}

Errors:
  409 SLOT_UNAVAILABLE → con suggested_alternatives
  403 PLAYER_BANNED → "No podés reservar en este complejo"
  422 BOOKING_ADVANCE_EXCEEDED → "Solo se puede reservar hasta 6 días adelante"
```

#### `POST /api/player/bookings/:id/cancel`

```
Response 200 (en plazo):
{
  "data": {
    "status": "canceled_refunded",
    "refund": { "amount": 360000, "status": "pending", "estimated_days": 3 }
  }
}

Response 200 (fuera de plazo):
{
  "data": {
    "status": "canceled_no_refund",
    "penalty": { "amount": 360000, "reason": "Cancelación fuera del plazo (< 3hs)" }
  }
}
```



---

## 7. Endpoints de Webhooks

### 7.1 MercadoPago

| Método | Ruta | Seguridad | Descripción |
|---|---|---|---|
| `POST` | `/api/webhooks/mercadopago` | Signature verification | Recibir eventos de MP |

```
Request (de MercadoPago):
{
  "action": "payment.created",
  "api_version": "v1",
  "data": { "id": "123456789" },
  "date_created": "2026-04-17T18:30:00Z",
  "id": "event-uuid",
  "type": "payment"
}

Procesamiento:
1. Verificar firma HMAC del webhook
2. Check idempotencia (processed_webhooks)
3. Fetch detalles del pago desde MP API
4. Según tipo:
   - payment.approved → confirmar booking o registrar pago SaaS
   - payment.rejected → iniciar dunning o expirar booking
   - subscription.canceled → cancelar suscripción del tenant
5. Response 200 (siempre, incluso si ignoramos el evento)

Response: 200 OK (MP requiere 200 o reintenta)
```



---

## 8. Endpoints del Onboarding

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/api/onboarding/register` | Ninguna | Registrar nuevo complejo + dueño |
| `POST` | `/api/onboarding/wizard/step-1` | Staff | Datos del complejo |
| `POST` | `/api/onboarding/wizard/step-2` | Staff | Canchas |
| `POST` | `/api/onboarding/wizard/step-3` | Staff | Horarios |
| `POST` | `/api/onboarding/wizard/step-4` | Staff | Configuración de seña + MP |
| `POST` | `/api/onboarding/wizard/complete` | Staff | Marcar wizard como completado |
| `GET` | `/api/onboarding/checklist` | Staff | Estado del checklist post-wizard |

#### `POST /api/onboarding/register`

```
Request:
{
  "owner_email": "marcelo@gmail.com",
  "owner_first_name": "Marcelo",
  "owner_last_name": "García",
  "phone": "+54 9 11 5555-5555",
  "password": "••••••••",
  "complex_name": "Complejo San Martín"
}

Response 201:
{
  "data": {
    "tenant_id": "uuid",
    "staff_user_id": "uuid",
    "slug": "complejo-san-martin",
    "trial_ends_at": "2026-05-17T00:00:00Z",
    "message": "Te enviamos un email para acceder a tu cuenta."
  }
}
// Implementado como Server Action (register/actions.ts), no como Route Handler REST. El owner fija email/password/phone en el registro (ADR-013); se envía email para verificar la cuenta.
```

---

## 9. Rate Limiting

| Endpoint group | Límite | Ventana | Por |
|---|---|---|---|
| Auth (magic link, login) | 5 requests | 1 minuto | email |
| Auth (verify, callback) | 10 requests | 1 minuto | IP |
| Public (availability) | 30 requests | 1 minuto | IP |
| Admin API (CRUD) | 100 requests | 1 minuto | tenant_id |
| Player API (booking) | 20 requests | 1 minuto | player_id |
| Webhooks (MP) | Sin límite | — | — |

---

## 10. Paginación

### Cursor-based (default)

```
Request:  GET /api/bookings?limit=20&cursor=eyJpZCI6InV1...
Response: { "data": [...], "pagination": { "cursor": "eyJ...", "has_more": true } }
```

**¿Por qué cursor y no offset?**
- Offset se degrada con tablas grandes (OFFSET 10000 es lento).
- Cursor es estable: si se insertan filas mientras el usuario pagina, no se pierden ni duplican resultados.
- El cursor es un JSON base64 con `{ id, created_at }` del último elemento.

### Excepciones (offset-based)

Los reportes y exports usan offset porque necesitan "ir a la página 5":

```
Request:  GET /api/reports/revenue?page=1&per_page=30
Response: { "data": [...], "pagination": { "page": 1, "per_page": 30, "total_pages": 5, "total_count": 142 } }
```

---

## 11. Resumen de Endpoints

| Grupo | Endpoints | Auth |
|---|---|---|
| Públicos | 3 | Ninguna |
| Autenticación | 6 | Mixto |
| Bookings (admin) | 7 | Staff |
| Courts (admin) | 5 | Staff |
| Abonados (admin) | 7 | Staff |
| Cash Flows (admin) | 3 | Staff |
| Products (admin) | 4 | Staff |
| Tenant config | 4 | Staff (admin) |
| Staff management | 4 | Staff (admin) |
| Billing | 6 | Staff (admin) |
| Reports | 4 | Staff (admin) |
| Notifications/Audit | 2 | Staff (admin) |
| Player bookings | 4 | Player |
| Player profile | 2 | Player |
| Onboarding | 7 | Mixto |
| Webhooks | 1 | Signature |
| **Total** | **~69 endpoints** | |

> [!IMPORTANT]
> **69 endpoints para v1 es manejable en un monolito modular.**
> Organizados en ~11 route files dentro de `app/api/`, cada archivo maneja
> entre 3 y 7 endpoints del mismo recurso.
> La complejidad no está en la cantidad de endpoints sino en la lógica de negocio
> detrás de cada uno (state machines, concurrencia, pagos, notificaciones).
