# DOC 5 — Requerimientos No Funcionales (RNFs)
## TurnoGol: Las Restricciones que Definen la Arquitectura

> **Propósito**: Los RNFs definen la arquitectura más que cualquier feature.
> Sin estos números, las decisiones de diseño técnico son adivinanzas.
> Este documento se escribe ANTES de elegir tecnologías.

> [!IMPORTANT]
> Los RNFs son restricciones, no aspiraciones. Un RNF que no podemos medir no nos sirve de nada.
> Cada uno tiene un número concreto y una forma de verificarlo.

---

## 1. Escala Esperada

### Proyección Year 1 (target conservador)

| Métrica | Mínimo viable | Target real | Diseñar para |
|---|---|---|---|
| Complejos activos | 50 | 200 | 500 |
| Canchas promedio por complejo | 4 | 4 | 4 |
| Turnos por cancha por día | 8 | 10 | 12 |
| Total turnos diarios | 1.600 | 8.000 | 24.000 |
| Jugadores registrados (B2C) | 10.000 | 40.000 | 100.000 |
| Staff usuarios (admin + recepcionistas) | 100 | 500 | 1.500 |

### Concurrencia en el pico más crítico: Viernes 18–23hs

```
Escenario real con 200 complejos activos:
  - Cada complejo tiene ~4 canchas en uso simultáneo
  - Cada cancha genera: 1 reserva confirmada + 2-3 consultas de disponibilidad + 1 email
  - Operaciones por complejo en hora pico: ~15
  - Total operaciones/hora: 200 complejos × 15 = 3.000 ops/hora = 50 ops/minuto = ~1 op/segundo

Con 500 complejos: ~125 ops/minuto → ~2 ops/segundo
```

**Conclusión**: TurnoGol en Year 1 no es un problema de escala técnica masiva.
Es un problema de **confiabilidad y latencia**, especialmente durante ese bloque de viernes/sábados 18-23hs.
Un servidor modesto puede manejar este volumen si el código está bien escrito.

> [!NOTE]
> No necesitamos Kubernetes, microservicios ni sistemas distribuidos para Year 1.
> Un monolito bien estructurado con hosting managed (Railway, Render o Fly.io) es más que suficiente.
> La complejidad operacional de microservicios sería un costo sin beneficio en esta etapa.

---

## 2. Latencia Aceptable

> Tiempos máximos por operación. Si se supera esto sistemáticamente, es un bug, no un "feature pendiente".

| Operación | Límite p95 | Límite p99 | Justificación |
|---|---|---|---|
| Cargar grilla de disponibilidad | 500ms | 800ms | El recepcionista la consulta 20-30 veces por turno |
| Confirmar reserva manual (admin) | 1.500ms | 2.500ms | Hay alguien esperando en el mostrador |
| Confirmar reserva online (jugador) | 2.000ms | 3.500ms | Incluye llamada a MercadoPago |
| Cargar dashboard admin | 800ms | 1.500ms | Se ve al inicio de cada turno |
| Búsqueda de canchas (app jugador) | 600ms | 1.000ms | Expectativa de app nativa |
| Carga de reportes | 2.000ms | 4.000ms | No es tiempo real, puede ser un poco más lento |
| Envío de email (async) | N/A (background) | — | No bloquea el flujo principal nunca |

**Cómo medirlo**: logs de latencia en cada endpoint + alertas en Sentry/Datadog cuando se supera el p95.

---

## 3. Disponibilidad

### Target

| Nivel | Uptime mensual | Downtime permitido/mes | Suficiente para TurnoGol |
|---|---|---|---|
| 99.0% | 99.0% | ~7.2 horas | No |
| **99.5%** | **99.5%** | **~3.6 horas** | **✅ Sí (v1)** |
| 99.9% | 99.9% | ~43 minutos | Deseable en v2 |
| 99.99% | 99.99% | ~4 minutos | Innecesario y muy costoso |

**Target v1**: **99.5% uptime mensual**

### Ventana de mantenimiento

**Permitida**: Lunes 3:00am – 6:00am ART (Argentine Time)
**Prohibida**: Viernes y Sábados 17:00 – 23:00hs ART (hora pico, cero tolerancia a downtime)
**Máximo downtime no planificado en hora pico**: 0 minutos (target). Alertas automáticas en < 2 minutos.

### ¿Qué hacemos si se cae en hora pico?

```
Runbook de emergencia (documentar antes de lanzar):
1. Alerta automática en < 2 minutos (Uptime Robot o similar)
2. Notificación inmediata al oncall (email/llamada al dev responsable)
3. Si es el DB: failover al réplica (si tenemos read replica)
4. Si es la app: rollback al deploy anterior (< 5 minutos con deployments atómicos)
5. Comunicación a clientes via email si el downtime > 5 minutos en hora pico
```

---

## 4. Seguridad

### Principio base: el sistema nunca almacena lo que no necesita

| Dato | Lo almacenamos | Por qué |
|---|---|---|
| Número de tarjeta | ❌ NUNCA | MercadoPago lo maneja. Ellos tienen PCI DSS. |
| CVV | ❌ NUNCA | Idem |
| Contraseñas en texto plano | ❌ NUNCA | Usamos magic link (sin contraseña) |
| Nombre del jugador | ✅ | Necesario para la reserva |
| Email del jugador | ✅ | Auth y comunicaciones |
| Celular del jugador | ✅ (opcional) | Contacto alternativo |
| Historial de reservas | ✅ | Core del negocio |
| Datos de facturación del dueño | ✅ | Para emisión de recibos |

### Autenticación y autorización

**Para staff del complejo (admin, recepcionista):**
- Magic link por email (sin contraseña): link de 1 uso, válido 15 minutos
- JWT access token: válido 1 hora
- JWT refresh token: válido 30 días, rotación en cada uso
- Sesiones: invalidadas al cambiar de dispositivo (configurable)

**Para jugadores (B2C):**
- Magic link por email O autenticación con Google/Apple (menor fricción)
- JWT con refresh token
- Sesión persistente en el dispositivo (no queremos que tengan que loguearse cada vez)

**Permisos por rol (RBAC):**

| Acción | Admin | Recepcionista | Solo Lectura | Jugador |
|---|:---:|:---:|:---:|:---:|
| Ver grilla de reservas | ✅ | ✅ | ✅ | ❌ |
| Crear reserva manual | ✅ | ✅ | ❌ | ❌ |
| Cancelar reserva | ✅ | ✅ | ❌ | Sólo la propia |
| Ver reportes financieros | ✅ | ❌ | ❌ | ❌ |
| Gestionar abonados | ✅ | ✅ (ver) | ❌ | ❌ |
| Configurar el complejo | ✅ | ❌ | ❌ | ❌ |
| Gestionar usuarios de staff | ✅ | ❌ | ❌ | ❌ |
| Ver caja del día | ✅ | ✅ | ❌ | ❌ |
| Editar precios de canchas | ✅ | ❌ | ❌ | ❌ |

### Baseline de seguridad: OWASP Top 10

| Vulnerabilidad | Mitigación en TurnoGol |
|---|---|
| Injection | ORM con queries parametrizadas. Validación de inputs con Zod/joi. |
| Broken Auth | JWT con expiración corta. Refresh token rotativo. Magic link de un solo uso. |
| Sensitive Data Exposure | HTTPS obligatorio. Datos sensibles encriptados en DB (celulares, emails). |
| Broken Access Control | Middleware de auth en TODOS los endpoints. RLS en DB. Tests de isolation. |
| Security Misconfiguration | Env vars en secretos (no en código). No exponer stack traces en producción. |
| XSS | CSP headers. Sanitización de inputs en frontend. |
| CSRF | Tokens CSRF en formularios. SameSite cookies. |
| Rate limiting | Límite de requests por IP en endpoints de auth y búsqueda pública. |

---

## 5. Multi-Tenancy — Aislamiento de Datos

> Un tenant (complejo) NUNCA puede acceder a los datos de otro tenant. Esto es no negociable.

### Estrategia: Row-Level Security (RLS) con PostgreSQL

```sql
-- Todas las tablas de negocio tienen tenant_id
ALTER TABLE bookings ADD COLUMN tenant_id UUID NOT NULL REFERENCES tenants(id);

-- RLS activado en la tabla
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Policy: solo ve las filas de su tenant
CREATE POLICY tenant_isolation ON bookings
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Al inicio de cada request autenticado de un staff:
SET app.current_tenant_id = '[id del complejo del usuario logueado]';
```

### Tablas que tienen `tenant_id` (datos aislados)

- `courts` (canchas)
- `bookings` (reservas)
- `subscriptions` (abonados/turnos fijos)
- `cash_flows` (movimientos de caja)
- `products` (stock)
- `staff_users` (empleados)
- `audit_logs` (logs de auditoría)
- `notifications` (notificaciones enviadas)

### Tablas que NO tienen `tenant_id` (datos globales, cross-tenant)

- `players` — un jugador puede reservar en varios complejos
- `plan_definitions` — los planes son globales
- `tenants` — la propia tabla de complejos

### Test obligatorio de isolation

Antes de cada deploy: test automatizado que verifica que el Usuario A del Tenant A no puede ver ni modificar ningún dato del Tenant B. Si este test falla, el deploy no avanza.

---

## 6. Auditabilidad

### ¿Qué se audita?

Todo lo que afecta dinero, reservas o acceso:

| Acción auditada | Datos guardados |
|---|---|
| Reserva creada | quién, cuándo, qué datos tenía |
| Reserva modificada | quién, cuándo, estado anterior, estado nuevo |
| Reserva cancelada | quién, cuándo, motivo, si se aplicó penalidad |
| Cobro registrado | quién, cuándo, monto, método |
| Cobro eliminado/editado | quién, cuándo, razón |
| Abonado creado/cancelado | quién, cuándo |
| Usuario de staff creado/eliminado | quién, cuándo |
| Cambio de precio de cancha | quién, cuándo, precio anterior, precio nuevo |
| Login de staff | cuándo, desde qué IP/dispositivo |

### Estructura de la tabla `audit_logs`

```
audit_logs
├── id (UUID)
├── tenant_id (UUID) — qué complejo
├── actor_id (UUID) — quién lo hizo (staff user o sistema)
├── actor_type (enum: staff, player, system)
├── action (string: 'booking.created', 'booking.canceled', etc.)
├── resource_type (string: 'booking', 'payment', 'court', etc.)
├── resource_id (UUID) — el ID del objeto afectado
├── before_state (JSONB) — estado antes del cambio
├── after_state (JSONB) — estado después del cambio
├── metadata (JSONB) — info adicional (IP, motivo, etc.)
└── created_at (timestamp UTC)
```

**Retención**: 12 meses mínimo (obligatorio para eventuales disputas de pago).
**Inmutabilidad**: Los registros de audit_logs son INSERT only. Nunca se editan ni eliminan.

---

## 7. Recuperación ante Desastres

| Parámetro | Definición | Target TurnoGol |
|---|---|---|
| **RTO** (Recovery Time Objective) | Tiempo máximo para volver a operar | < 4 horas |
| **RPO** (Recovery Point Objective) | Máxima pérdida de datos aceptable | < 24 horas |

### Estrategia de backup

- **Backup automático de DB**: cada 24 horas (mínimo), con snapshot a demanda antes de cada deploy
- **Retención de backups**: 30 días
- **Dónde se almacenan**: en una región diferente a donde corre la app (si la infra se cae, el backup sobrevive)
- **Test de restore**: al menos 1 vez por mes, restaurar el backup en un entorno de staging y verificar integridad

### Estrategia de deploy sin downtime

- **Zero-downtime deployments**: la nueva versión de la app se despliega antes de que la vieja se baje (blue-green o rolling)
- **Database migrations**: siempre backward-compatible (nunca eliminar columna en el mismo deploy que deja de usarla — hacerlo en 2 deploys)
- **Rollback en < 5 minutos**: el deploy anterior siempre disponible para revertir

---

## 8. Problemas Específicos de Argentina

> Estos son los que los tutoriales internacionales nunca mencionan.

### Timezone

- Argentina usa **ART (UTC-3)** y **NO tiene cambio de horario** (no hay daylight saving).
- Regla absoluta: **todos los timestamps se almacenan en UTC** en la base de datos.
- Se convierten a ART solo en el momento de mostrarse al usuario.
- Nunca almacenar "hora local" sin el offset.
- Por qué importa: si en algún momento expandimos a Chile (UTC-4/UTC-3), Perú (UTC-5), etc., los datos históricos tienen que ser correctos.

### Conectividad móvil variable

- El dueño y el recepcionista usan el panel desde el mostrador del complejo.
- La conexión puede ser 4G, 3G, o WiFi deficiente del local.
- **Implicancias**:
  - Bundle JavaScript del panel admin: < 250KB (gzipped). Paginar datos, no cargar todos.
  - Imágenes optimizadas (WebP, lazy loading).
  - Manejo de errores de red: el sistema no puede "quedar colgado" si la conexión falla — siempre hay un timeout y un mensaje claro.
  - El formulario de reserva guarda el estado en localStorage: si se corta la conexión a mitad, no pierde lo que escribió.

### MercadoPago: latencia y confiabilidad

- La API de MercadoPago puede tardar 1-3 segundos en procesar un pago.
- En momentos de alta demanda (12/12, Cyber Monday, Black Friday), puede tardar más o fallar.
- **Implicancias**:
  - La confirmación de reserva no debe bloquearse esperando a MP si el pago ya fue procesado (usar webhooks, no polling).
  - Timeout en llamadas a MP: 8 segundos máximo. Si supera, se muestra error claro y se sugiere reintentar.
  - Si MP está caído: el complejo puede seguir operando en modo "sin seña digital" (registra la reserva, cobro manual en el mostrador).

---

## 9. Concurrencia en Reservas — El Problema del Doble Booking

> Este es el bug más peligroso de un sistema de reservas. Si dos personas reservan la misma cancha al mismo tiempo, hay conflicto real (dos grupos llegan a la misma cancha).

### Escenario problemático

```
T=0: Usuario A consulta disponibilidad → cancha 4 a las 21hs LIBRE
T=0: Usuario B consulta disponibilidad → cancha 4 a las 21hs LIBRE
T=1: Usuario A confirma la reserva → se está procesando el pago en MP
T=1: Usuario B confirma la reserva → se está procesando el pago en MP
T=3: Ambas confirmaciones llegan → ¿cuál gana?
```

### Solución: Optimistic Locking + Transacción atómica

```sql
BEGIN;

-- 1. Lock exclusivo de la fila de la cancha en ese horario
SELECT id FROM courts WHERE id = $court_id FOR UPDATE;

-- 2. Verificar disponibilidad dentro de la transacción
SELECT COUNT(*) FROM bookings
WHERE court_id = $court_id
  AND date = $date
  AND time_start < $time_end
  AND time_end > $time_start
  AND status IN ('pending', 'confirmed');

-- 3. Si = 0: crear la reserva
-- Si > 0: rollback y devolver error "Este turno acaba de ser tomado"

COMMIT;
```

**La regla**: La verificación de disponibilidad y la creación de la reserva tienen que ser atómicas (mismo transaction). Si no, hay race condition.

**UX en caso de conflicto**: Mostrar mensaje amigable, no un error técnico. Sugerir horarios alternativos disponibles.

---

## 10. Graceful Degradation (Degradación Elegante)

> ¿Qué hace el sistema cuando un servicio externo falla? La respuesta no puede ser "se rompe todo".

| Servicio externo | Falla | Comportamiento del sistema |
|---|---|---|
| **Proveedor de email** (Resend/SendGrid) | No disponible | Las reservas siguen funcionando. Los emails se encolan. Se envían cuando el servicio vuelve. El usuario no ve error. |
| **MercadoPago** (checkout) | No disponible | La reserva puede hacerse "sin seña" (modo alternativo). El complejo la cobra presencialmente. Alerta al admin: "MP no disponible, reservas sin seña por ahora." |
| **MercadoPago** (webhooks) | Con demora | El sistema usa exponential backoff para reintentar. No pierde webhooks. |
| **Servicio de storage** (imágenes) | No disponible | El sistema funciona sin imágenes (placeholder), no hay error en el flujo de negocio. |

**Principio**: Ningún servicio externo puede causar que el flujo core (reserva + cobro) deje de funcionar. Siempre hay un fallback.

---

## 11. Accesibilidad y Performance Mobile-First

### Targets de performance (Lighthouse)

| Métrica | Target mínimo | Target ideal |
|---|---|---|
| First Contentful Paint | < 1.5s | < 800ms |
| Largest Contentful Paint | < 2.5s | < 1.5s |
| Time to Interactive | < 3.5s | < 2s |
| Cumulative Layout Shift | < 0.1 | < 0.05 |
| Bundle size (gzipped) | < 300KB | < 200KB |

### Dispositivos a soportar

**Panel Admin (B2B)**:
- Chrome/Safari en iPhone (iOS 15+) — prioritario (así usa el sistema el encargado)
- Chrome en Android (versión reciente) — prioritario
- Chrome/Firefox en desktop — importante (el dueño también lo usa)

**App del Jugador (B2C)**:
- Chrome/Safari en móvil — prioritario
- Progressive Web App (PWA) como estrategia inicial (antes de app nativa)

### No necesitamos en v1
- Internet Explorer (ya no existe relevante)
- Safari < iOS 14 (< 5% del mercado AR)
- Offline mode (complejidad innecesaria para v1)

---

## Resumen: Decisiones de Arquitectura que Generan Estos RNFs

| RNF | Implicancia de arquitectura |
|---|---|
| Monolito suficiente para Year 1 | No usar microservicios |
| RLS para multi-tenancy | PostgreSQL como DB (tiene RLS nativo) |
| Zero-downtime deploys | Containerización (Docker) |
| Background jobs para email/notificaciones | Sistema de queues (BullMQ, pg-boss, o similar) |
| Timestamps en UTC | Configuración del ORM y el servidor |
| Concurrencia en reservas | Transacciones con SELECT FOR UPDATE en PostgreSQL |
| Graceful degradation de MP | Webhook-first (no polling). Cola de retry. |
| Bundle < 300KB | Code splitting, lazy loading, tree shaking agresivo |
| Audit logs inmutables | INSERT-only table, sin UPDATE ni DELETE |
