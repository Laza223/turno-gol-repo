# DOC 11 — Decisiones Arquitectónicas (ADRs)
## TurnoGol: Decisiones Arquitectónicas (ADRs 001-013)

> **Propósito**: Documentar las decisiones de arquitectura con su contexto, alternativas evaluadas,
> decisión tomada y consecuencias. Una ADR no se edita: si la decisión cambia, se crea una nueva
> ADR que depreca la anterior.

> [!IMPORTANT]
> Cada ADR responde a una pregunta concreta que afecta la estructura del sistema.
> Las decisiones están tomadas en base a los RNFs de Doc 5, las entidades de Doc 6,
> los flujos de Doc 7 y los requerimientos de negocio de Doc 4.
> **Si cambia un supuesto base (escala, mercado, regulación), se revisa la ADR afectada.**

---

## Índice de ADRs

| ID | Decisión | Estado | Fecha |
|---|---|---|---|
| ADR-001 | Tenant Isolation Model: RLS con tenant_id | ✅ Decidido | 2026-04-17 |
| ADR-002 | Autenticación Jugadores: Magic Link + OAuth (Staff: Deprecado) | ✅ Decidido | 2026-04-17 |
| ADR-003 | Stack de Comunicaciones: Email con Resend | ✅ Decidido | 2026-04-17 |
| ADR-004 | Gateway de Pagos: MercadoPago Checkout Pro + Suscripciones | ✅ Decidido | 2026-04-17 |
| ADR-005 | Background Jobs / Queues: pg-boss sobre PostgreSQL | ✅ Decidido | 2026-04-17 |
| ADR-006 | Estrategia de Real-Time: Supabase Realtime con fallback a polling | ✅ Decidido | 2026-04-17 |
| ADR-007 | Arquitectura: Monolito Modular para v1 | ✅ Decidido | 2026-04-17 |
| ADR-008 | Framework Front-End: Next.js (App Router) | ✅ Decidido | 2026-04-17 |
| ADR-009 | Plataforma de Hosting: Vercel + Supabase | ✅ Decidido | 2026-04-17 |
| ADR-010 | Feature Flags para Planes SaaS: DB-driven | ✅ Decidido | 2026-04-17 |
| ADR-011 | Facturación electrónica (AFIP): Fuera de scope v1 | ✅ Decidido | 2026-04-18 |
| ADR-012 | Verificación de edad +18: Declaración jurada digital | ✅ Decidido | 2026-04-18 |
| ADR-013 | Autenticación de Staff: Email + Password (ADR-002 Deprecado) | ✅ Decidido | 2026-06-29 |

---

## ADR-001: Tenant Isolation Model

**Estado**: ✅ Decidido
**Fecha**: 2026-04-17

### Contexto

TurnoGol es un SaaS multi-tenant donde cada complejo deportivo es un tenant aislado. Un tenant NUNCA puede ver, modificar ni siquiera inferir la existencia de datos de otro tenant. La violación de este principio es una brecha catastrófica — legal (Ley 25.326), comercial (pérdida inmediata de confianza) y operativa.

Los datos que hay que aislar (Doc 6): canchas, reservas, abonados, movimientos de caja, productos, staff, notificaciones y audit logs. Los datos que son cross-tenant: jugadores (un jugador puede reservar en múltiples complejos) y planes de suscripción (globales).

La escala proyectada (Doc 5) es de 50-500 tenants en Year 1. Esto descarta soluciones diseñadas para 10.000+ tenants pero también descarta soluciones que no escalan más allá de 50.

### Opciones consideradas

**Opción A: Row-Level Security (RLS) con `tenant_id`**
- Todas las tablas de negocio tienen un campo `tenant_id UUID NOT NULL`.
- PostgreSQL aplica un policy RLS que filtra filas automáticamente según `current_setting('app.current_tenant_id')`.
- Una sola base de datos, un solo schema, un solo pool de conexiones.
- Pro: Costo mínimo de infra, migrations simples (un solo schema), queries normales.
- Pro: PostgreSQL tiene RLS nativo desde v9.5 (feature madura, battle-tested).
- Pro: Supabase lo soporta de primera clase con su auth y policies.
- Con: Si un endpoint olvida setear `app.current_tenant_id`, podría no filtrar.
- Con: Queries complejas (JOINs) deben incluir `tenant_id` en cada tabla o depender del policy.
- Con: Performance puede degradar marginalmente vs schema separado en queries con millones de filas.

**Opción B: Schema por tenant**
- Cada tenant tiene su propio schema PostgreSQL (`tenant_abc123.bookings`).
- Aislamiento más fuerte a nivel de DB.
- Pro: Ningún query puede accidentalmente cruzar datos entre tenants.
- Pro: Backup y restore selectivo por tenant.
- Con: Migrations se ejecutan N veces (una por schema). Con 500 tenants, una migration toma 500x.
- Con: El connection pooling se complica (cada schema es un contexto diferente).
- Con: Las tablas cross-tenant (players) requieren un schema compartido adicional.
- Con: Supabase no soporta schemas dinámicos con sus herramientas estándar.

**Opción C: Base de datos por tenant**
- Cada tenant tiene su propia instancia de PostgreSQL.
- Máximo aislamiento posible — equivalente a aplicaciones separadas.
- Pro: Aislamiento absoluto, backup individual, performance predecible.
- Con: Costo prohibitivo ($10-30 USD/mes por DB managed × 500 tenants = $5.000-15.000 USD/mes solo en DB).
- Con: Complejidad operacional extrema: deployments, monitoring, connection management.
- Con: Completamente desproporcionado para la escala de Year 1 (~2 ops/segundo en pico).

### Decisión

**Opción A: Row-Level Security (RLS) con `tenant_id`.**

Razones:
1. **Costo**: Una sola instancia de PostgreSQL. Para 500 tenants con ~24.000 turnos/día, un PostgreSQL con 2-4GB de RAM es más que suficiente.
2. **Simplicidad operacional**: Un solo schema = un solo lugar para migrations, un solo backup, un solo pool de conexiones.
3. **Compatibilidad**: Supabase tiene soporte nativo de RLS integrado con su auth. Los JWT de Supabase setean automáticamente el `request.jwt.claims` que podemos usar en policies.
4. **Madurez**: RLS de PostgreSQL es una feature estable con años de uso en producción por miles de empresas.
5. **Escala suficiente**: Con índices apropiados en `tenant_id`, la degradación de performance es imperceptible para la escala proyectada.

### Implementación concreta

```sql
-- 1. Todas las tablas de negocio llevan tenant_id
ALTER TABLE bookings ADD COLUMN tenant_id UUID NOT NULL REFERENCES tenants(id);
CREATE INDEX idx_bookings_tenant ON bookings(tenant_id);

-- 2. RLS activado
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- 3. Policy de aislamiento
CREATE POLICY tenant_isolation ON bookings
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- 4. Policy para operaciones de escritura
CREATE POLICY tenant_insert ON bookings
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::UUID);
```

**El middleware de la app, en cada request autenticado de staff:**
```
1. Extraer tenant_id del JWT del usuario
2. Ejecutar: SET LOCAL app.current_tenant_id = '{tenant_id}'
3. Todos los queries de la transacción quedan filtrados automáticamente
```

**Tablas sin `tenant_id` (cross-tenant):**
- `players` — un jugador reserva en N complejos
- `plans` — los planes de suscripción son globales
- `tenants` — la propia tabla
- `price_versions` — precios globales por plan

**Tablas con `tenant_id` (aisladas, 13 tablas):**
- `courts`, `bookings`, `abonados`, `payments`, `cash_flows`, `daily_cash_closes`, `tenant_staff_members`, `notifications`, `audit_logs`, `tenant_subscriptions`, `tenant_player_bans`, `push_subscriptions`

### Consecuencias

**Positivas:**
- Costo de infra mínimo y predecible.
- Un solo schema simplifica migrations, backups y deployments.
- Supabase lo soporta nativamente — menos código customizado.
- Los jugadores (cross-tenant) se modelan naturalmente sin hacks.

**Negativas / Riesgos a mitigar:**
- Un bug en el middleware que no setea `app.current_tenant_id` expondría datos de todos los tenants. **Mitigación**: test automatizado obligatorio pre-deploy que verifica isolation (Tenant A no ve datos de Tenant B). Si falla, el deploy no avanza.
- Los queries manuales (fuera del ORM) deben incluir `tenant_id` o depender del RLS. **Mitigación**: lint rule que detecta queries sin tenant_id. Code review obligatorio para todo acceso directo a DB.
- No hay backup selectivo por tenant (es toda la DB o nada). **Mitigación**: para v1 con 500 tenants, un backup completo es suficiente. Si un tenant necesita restore, se extrae con `WHERE tenant_id = X`.

### Revisión

Revisitar si se cumplen CUALQUIERA de estas condiciones:
- Se superan los 2.000 tenants activos (la contención en índices empieza a importar).
- Un cliente enterprise requiere aislamiento contractual de datos (schema dedicado como premium feature).
- Regulación argentina nueva exige aislamiento físico de datos entre clientes.

---

## ADR-002: Estrategia de Autenticación Jugadores (B2C)

**Estado**: ✅ Decidido (DEPRECADO para Staff - ver ADR-013)
**Fecha**: 2026-04-17

### Contexto

TurnoGol tiene dos tipos de usuarios con necesidades de autenticación radicalmente diferentes:

1. **Staff del complejo (B2B)**: Marcelo (tech literacy 2.5/5) y su recepcionista Rodrigo. Acceden al panel admin. *Nota: Este segmento fue migrado a Email + Password por razones de seguridad y RLS (ver ADR-013).*

2. **Jugadores (B2C)**: Agustín, Tomás (tech literacy 3.5-4/5). Reservan desde el celular. Esperan experiencia de app moderna. Sesión persistente (no quieren loguearse cada vez que reservan).

El Doc 5 define: "JWT con refresh tokens. No guardamos passwords (magic link o OAuth) para jugadores."

### Opciones consideradas

**Opción A: Magic Link por email (sin contraseña)**
- El usuario ingresa su email → recibe un link de un solo uso → click → autenticado.
- Pro: Zero fricción cognitiva. No hay "olvidé mi contraseña". No hay brute force de passwords.
- Con: Requiere acceso al email en el momento del login (puede ser lento si el email tarda).
- Con: Si el email del jugador no recibe el magic link (spam, email incorrecto), no puede entrar.

**Opción B: OAuth social (Google / Apple)**
- Login con un click usando la cuenta de Google o Apple del usuario.
- Pro: Máxima conveniencia para jugadores que ya tienen Google/Apple en su celular.
- Con: Apple Sign-In requiere Apple Developer account ($99 USD/año) y es obligatorio si se lanza app nativa en iOS.

**Opción C: Email + contraseña tradicional**
- El usuario elige un email y una contraseña, y la guarda.
- Pro: Patrón universalmente entendido.
- Con: Hay que gestionar hashing (bcrypt), reset de password, validación de fortaleza.

### Decisión

**Opción A + B combinadas: Magic Link como método primario para jugadores, OAuth (Google) como método secundario.**

**Distribución por tipo de usuario:**

| Tipo de usuario | Método primario | Método secundario |
|---|---|---|
| Staff (admin, recepcionista) | *Email + Contraseña (ver ADR-013)* | — |
| Jugador (B2C) | OAuth con Google | Magic link por email |

Razones:
1. **Jugadores con OAuth primario**: Agustín y Tomás tienen Google en su celular. Un tap y están dentro. Para los que no quieren OAuth, magic link como fallback.
2. **Sin contraseñas para jugadores**: Eliminamos por completo el almacenamiento de secrets de autenticación para la base B2C. Nuestro de jugador no maneja un password hash. Esto reduce la superficie de ataque y la complejidad operacional.

### Implementación concreta

**JWT:**
```
Access Token:
  - Lifetime: 1 hora
  - Payload: { user_id, user_type: 'staff' | 'player', tenant_id? (solo staff), role? }
  - Firmado con RS256

Refresh Token:
  - Lifetime: 30 días
  - Almacenado en httpOnly cookie (staff) o secure storage (jugador PWA)
  - Rotación en cada uso: al usar un refresh token, se invalida el anterior y se emite uno nuevo
  - Si un refresh token se usa 2 veces → se invalidan TODOS los tokens del usuario (posible robo)
```

**Magic link:**
```
1. Usuario ingresa email
2. Sistema genera token criptográfico de un solo uso (256 bits)
3. Token hasheado (SHA-256) se guarda en DB con expiración de 15 minutos
4. Email enviado con link: turnogol.app/auth/verify?token=abc123
5. Al hacer click:
   a. Se busca el hash del token en DB
   b. Si existe y no expiró: se genera JWT + refresh token
   c. El token se marca como usado (un solo uso)
   d. Se registra el login en audit_log
```

**OAuth (Google):**
```
1. Jugador toca "Continuar con Google"
2. OAuth 2.0 Authorization Code Flow con PKCE
3. Se recibe id_token de Google → se extrae email verificado
4. Si el email existe en `players`: login
5. Si no existe: registro automático (se crea Player con datos de Google)
6. Se genera JWT + refresh token propio de TurnoGol
```

**Supabase Auth**: Implementa ambos flows out-of-the-box (magic link + Google OAuth). Los JWT de Supabase se complementan o se usan directamente como nuestros access tokens. Las sesiones son manejadas por Supabase con refresh token rotation incluida.

### Consecuencias

**Positivas:**
- Zero passwords almacenados = zero riesgo de leak de contraseñas.
- UX optimizada por segmento: email+password para staff (ADR-013), magic link para jugadores.
- Supabase Auth maneja el 90% de la implementación (magic link, OAuth, JWT, refresh tokens).
- Refresh token rotation previene robos de sesión.

**Negativas / Riesgos:**
- Magic link depende de la entrega del email. Si el email tarda 2 minutos, la UX se degrada. **Mitigación**: usar un provider de email con SLA de entrega < 10 segundos (Resend, SendGrid). Mostrar "Revisá tu casilla de email (también spam)".
- Si el usuario no tiene acceso a su email en el celular (raro pero posible), no puede loguearse. **Mitigación**: para staff, Google OAuth como fallback secundario en v2 si se detecta demanda.
- Google OAuth requiere mantener la aplicación en Google Cloud Console y renovar API keys. **Mitigación**: automatizar la verificación de credenciales en el runbook.

### Revisión

Revisitar si:
- Se detecta que > 10% de los intentos de magic link fallan (cambiar a SMS OTP como alternativa).
- Se lanza app nativa iOS y Apple exige Apple Sign-In.
- Se detecta fricción de login en métricas de onboarding (time to first action > 3 minutos).

---

## ADR-003: Stack de Comunicaciones Email

**Estado**: ✅ Decidido
**Fecha**: 2026-04-17

### Contexto

El email es el canal principal de comunicación transaccional con dueños de complejos y jugadores. El sistema necesita enviar:

- **Confirmaciones de reserva** al jugador (inmediato)
- **Recordatorios de turno** al jugador (eliminados en v1 — cambio #18; se reconstruyen con WhatsApp en v1.5)
- **Alertas al admin** cuando entra una reserva online
- **Comunicaciones de dunning** al dueño del complejo (cobro fallido)
- **Notificaciones de trial/onboarding** (cadencia programada, Doc 4/10)
- **Cancelaciones y reembolsos** al jugador
- **Magic links** de autenticación (ADR-002)

El Doc 5 establece: "Los emails se envían de forma asincrónica (queue). No bloquean el flujo de reserva. Retry automático en caso de falla del servicio."

Volumen estimado con 200 complejos activos: ~2.000-5.000 emails/día.

### Opciones consideradas

**Opción A: Resend**
- API moderna de email transaccional con DX excelente.
- Pro: API simple y moderna, SDK para Node.js/TypeScript de primera clase.
- Pro: Soporte nativo de React Email para templates con componentes React.
- Pro: Pricing accesible: 3.000 emails/mes gratis, luego ~$20 USD/mes para 50.000 emails.
- Pro: Dashboard con métricas de delivery, opens, bounces.
- Con: Empresa más nueva, menos track record que SendGrid.

**Opción B: SendGrid (Twilio)**
- Servicio de email transaccional líder del mercado.
- Pro: Track record extenso, altamente confiable, SLA de delivery.
- Pro: Templates dinámicos con Handlebars.
- Pro: 100 emails/día gratis para siempre.
- Con: API más verbosa y menos moderna que Resend.
- Con: Setup más complejo (domain verification, API keys, sender identity).

**Opción C: Amazon SES**
- Servicio de email de AWS, el más barato a escala.
- Pro: Costo mínimo (~$0.10 USD por 1.000 emails).
- Con: API de bajo nivel, requiere más implementación.
- Con: Vendor lock-in con AWS.
- Con: No tiene dashboard de métricas integrado.

### Decisión

**Opción A: Resend como servicio de email transaccional.**

Razones:
1. **DX**: La API de Resend es la más simple del mercado. Un email se envía en 3 líneas de código.
2. **React Email**: Los templates se escriben como componentes React, reutilizando el mismo stack del frontend. Sin Handlebars ni lenguajes de template separados.
3. **Costo**: 3.000 emails/mes gratis. Para la escala de Year 1 (~5.000 emails/día = ~150.000/mes), el costo es ~$20-40 USD/mes.
4. **Confiabilidad**: Resend está construido sobre AWS SES, con la misma infraestructura de delivery pero mejor DX.
5. **Compatibilidad**: SDK nativo para Next.js y Vercel.

### Implementación concreta

**Arquitectura del messaging:**
```
Evento de negocio (booking.confirmed)
      ↓
  Application code crea registro en `notifications` (status: 'queued')
      ↓
  Job enqueued en pg-boss: { type: 'send_email', notification_id: UUID }
      ↓
  Worker procesa el job:
    1. Lee el template y variables del notification record
    2. Renderiza el template con React Email
    3. Llama a Resend API: POST https://api.resend.com/emails
    4. Si éxito: actualiza notification.status = 'sent'
    5. Si falla: retry con exponential backoff (3 reintentos, 1min / 5min / 30min)
    6. Si 3 fallos: notification.status = 'failed', alerta interna
```

**Templates de email (mínimos para v1):**

| Template | Variables | Trigger |
|---|---|---|
| `booking_confirmed` | `{player_name}`, `{court_name}`, `{date}`, `{time}`, `{complex_name}` | Reserva confirmada |
| `booking_canceled` | `{player_name}`, `{date}`, `{time}`, `{refund_status}` | Cancelación |
| `admin_new_booking` | `{player_name}`, `{court_name}`, `{date}`, `{time}` | Nueva reserva online |
| `dunning_payment_failed` | `{owner_name}`, `{plan_name}`, `{retry_date}` | Cobro SaaS fallido |
| `trial_welcome` | `{owner_name}`, `{complex_name}` | Registro |
| `trial_ending` | `{owner_name}`, `{days_left}` | Día 21, 28, 30 |
| `deposit_expired` | `{player_name}`, `{court_name}`, `{date}`, `{time}` | Timeout 6min sin seña |
| `magic_link` | `{user_name}`, `{login_url}`, `{expires_in}` | Login |

### Consecuencias

**Positivas:**
- Templates mantenibles con React Email (mismo stack que el frontend).
- API simple y moderna, bajo acoplamiento.
- Costo predecible y bajo.
- Resend abstrae la complejidad de deliverability (SPF, DKIM, DMARC configurados automáticamente).

**Negativas / Riesgos:**
- Resend es una empresa más joven que SendGrid. **Mitigación**: encapsular TODA la interacción con Resend en un módulo `email-provider.ts` con interfaz abstracta. Si necesitamos migrar a SendGrid, solo cambiamos la implementación, no el código de negocio.
- Los emails pueden ir a spam. **Mitigación**: configurar SPF, DKIM y DMARC correctamente. Usar dominio dedicado para envíos (notificaciones@turnogol.app).
- La latencia de entrega de email es variable (1-30 segundos típico). **Mitigación**: para magic links, mostrar "Revisá tu casilla de email (también spam)".

### Revisión

Revisitar si:
- Resend degrada su servicio o estabilidad (migrar a SendGrid).
- Se necesita un canal de comunicación instantáneo adicional (evaluar push notifications).
- El volumen supera 500.000 emails/mes (evaluar pricing y considerar SES directo).

---

## ADR-004: Gateway de Pagos

**Estado**: ✅ Decidido
**Fecha**: 2026-04-17

### Contexto

TurnoGol procesa pagos en dos contextos completamente separados:

1. **Señas de reservas (B2C)**: El jugador paga un porcentaje (default 30%) al reservar una cancha. Son pagos únicos, de montos variables ($2.400-4.500 ARS por seña típica). Necesitan checkout rápido, mobile-first.

2. **Suscripciones SaaS (B2B)**: El dueño del complejo paga $55.000-115.000 ARS/mes por usar TurnoGol. Son cobros recurrentes, automáticos, con necesidad de reintentos, dunning y cancelación.

El Doc 5 establece: timeout de 8 segundos en llamadas a MP, webhooks idempotentes, y modo fallback "sin seña digital" si MP está caído.

El mercado argentino tiene una particularidad: MercadoPago tiene un 70%+ de penetración en pagos digitales. No aceptar MP es perder la mayoría de las transacciones.

### Opciones consideradas

**Opción A: MercadoPago Checkout Pro (para señas) + MP Suscripciones (para SaaS)**
- Checkout Pro: redirecciona al jugador a la página de pago de MP. MP maneja tarjetas, CVU, transferencia.
- Suscripciones: débito automático mensual/anual gestionado por MP.
- Pro: El jugador ya tiene cuenta MP (70%+ penetración). 0 fricción para pagar.
- Pro: MP maneja PCI DSS — nosotros no almacenamos datos de tarjeta.
- Pro: Webhooks para cada evento de pago (approved, rejected, refunded).
- Pro: Comisión de 2.99% + IVA por transacción (comisión de MP Suscripciones sobre la cuota SaaS; distinta de la comisión de Checkout Pro sobre la seña —~5%— que absorbe el complejo) (estándar de mercado).
- Con: No tenemos control del UI de checkout (es la pantalla de MP).
- Con: MP Suscripciones tiene limitaciones en la API (no soporta prorrateo nativo, hay que calcularlo).
- Con: Los webhooks de MP pueden llegar duplicados, fuera de orden, o con demora.

**Opción B: Stripe (con Stripe para Argentina)**
- Pro: API superior a MP, documentación de primer nivel, dashboard excelente.
- Pro: Checkout embebido (el jugador paga sin salir de TurnoGol).
- Pro: Billing nativo con prorrateo, dunning, coupon codes.
- Con: Penetración en Argentina significativamente menor que MP.
- Con: Los jugadores necesitan agregar tarjeta (no tienen cuenta Stripe como tienen cuenta MP).
- Con: No soporta CVU, MercadoPago wallet, ni DEBIN (formas de pago locales argentinas).
- Con: Pricing: 3.6% + IVA por transacción (más caro que MP).

**Opción C: Dual (MP para señas B2C + Stripe para suscripciones B2B)**
- Pro: Lo mejor de cada mundo.
- Con: Duplicación de integraciones, webhooks, reconciliación. Complejidad operacional x2.
- Con: Las suscripciones SaaS en Stripe obligarían al dueño del complejo a tener tarjeta de crédito internacional (no todos la tienen en AMBA/interior).

### Decisión

**Opción A: MercadoPago Checkout Pro + Suscripciones, ambos flujos unificados en MP.**

Razones:
1. **Penetración**: El 70%+ de los jugadores argentinos ya tiene cuenta MP con saldo o tarjetas cargadas. Checkout Pro les permite pagar con 2 taps, sin ingresar datos.
2. **Pagos locales**: MP soporta CVU, tarjetas de débito locales, transferencias bancarias, y wallet. Stripe no soporta la mayoría.
3. **PCI DSS**: MP maneja toda la tokenización de tarjetas. Nosotros nunca vemos un número de tarjeta.
4. **Ecosistema unificado**: Un solo dashboard para reconciliar todos los pagos (señas + suscripciones SaaS). Una sola integración de webhooks.
5. **Costo**: 2.99% + IVA vs 3.6% + IVA de Stripe. A escala, la diferencia importa.

### Implementación concreta

**Señas de reservas (Checkout Pro):**
```
1. Jugador confirma reserva en TurnoGol
2. Backend crea una Preference en MP API:
   {
     items: [{ title: "Seña - Cancha 3, 21hs", unit_price: 3600, quantity: 1 }],
     back_urls: { success, failure, pending },
     notification_url: "https://api.turnogol.app/webhooks/mercadopago",
     external_reference: booking_uuid,
     expires: true,
     expiration_date_to: booking.created_at + 6 minutos
   }
3. Jugador es redirigido a MP → paga → MP redirige de vuelta
4. Webhook `payment.approved` → TurnoGol cambia booking a 'confirmed'
5. Si timeout 6min sin pago → booking pasa a 'expired', slot liberado
```

**Suscripciones SaaS (Preapproval / Suscripción):**
```
1. Dueño elige plan en TurnoGol
2. Backend crea un Preapproval en MP API:
   {
     reason: "TurnoGol Plan Pro",
     auto_recurring: {
       frequency: 1,
       frequency_type: "months",
       transaction_amount: 88000,
       currency_id: "ARS"
     },
     back_url: "https://app.turnogol.app/billing/success",
     payer_email: tenant.owner_email
   }
3. Dueño es redirigido a MP → autoriza débito automático
4. MP envía webhook `subscription.created` → tenant pasa a 'active'
5. Cada mes: MP cobra automáticamente y envía `payment.approved`
6. Si falla: MP reintenta 3 veces en 7 días + envía `payment.rejected`
```

**Idempotencia de webhooks:**
```sql
-- Antes de procesar cualquier webhook
INSERT INTO processed_webhooks (mp_event_id, event_type, received_at)
VALUES ($event_id, $type, NOW())
ON CONFLICT (mp_event_id) DO NOTHING
RETURNING id;

-- Si el INSERT devuelve NULL → ya fue procesado → ignorar
-- Si devuelve un id → procesar normalmente
```

**Graceful degradation (MP caído):**
Cuando MP está caído (timeout > 8 segundos o respuesta 5xx):
- Las reservas se crean como `confirmed` sin seña (`deposit_status: 'not_required'`).
- Banner visible para el admin: "⚠️ MercadoPago no disponible. Las reservas se crean sin seña."
- Cuando MP vuelve: el admin puede cobrar la seña manualmente desde el panel o presencialmente.

### Consecuencias

**Positivas:**
- Máxima compatibilidad con medios de pago argentinos.
- Un solo proveedor para todo = un solo set de webhooks, un solo dashboard.
- El jugador paga con 2 taps en la mayoría de los casos.

**Negativas / Riesgos:**
- Dependencia total de un solo proveedor de pagos. **Mitigación**: interfaz abstracta `PaymentGateway` en el código. Si necesitamos agregar Stripe en el futuro, se implementa como segundo provider sin cambiar el código de negocio.
- MP Suscripciones no soporta prorrateo nativo en upgrades. **Mitigación**: calcular el prorrateo en nuestro backend y generar un pago único por la diferencia usando Checkout Pro.
- Los webhooks de MP requieren manejo robusto de duplicados y orden. **Mitigación**: tabla `processed_webhooks` + lógica idempotente.

### Revisión

Revisitar si:
- Stripe lanza soporte completo para medios de pago locales argentinos (evaluar migración).
- MP sube las comisiones significativamente (> 5%).
- Se expande a un país donde MP no opera (Chile, Perú → considerar agregar Stripe como segundo gateway).

---

## ADR-005: Background Jobs / Queues

**Estado**: ✅ Decidido
**Fecha**: 2026-04-17

### Contexto

TurnoGol requiere procesamiento asincrónico para múltiples flujos críticos:

- **Emails**: Envío de confirmaciones, alertas de dunning, magic links (no pueden bloquear el request del usuario).
- **Cron jobs**: Expiración de trials (diario), generación de slots de abonados (diario), auto-completar reservas sin marcar (+30min), data retention cleanup (semanal), dunning retries (diario).
- **Webhooks de proceso**: Procesamiento de webhooks de MP (deben ser líderes en confiabilidad — si se pierde un webhook de pago, el tenant no se activa).
- **Notificaciones programadas**: Trial day 7/14/21/28/30. (Recordatorios de turnos eliminados en v1 — cambio #18).

El Doc 5 establece: "Background jobs para Email" como sistema de queues. La escala es modesta: ~5.000 emails/día en comunicaciones + ~24.000 booking-related events/día con 500 complejos.

### Opciones consideradas

**Opción A: pg-boss (job queue sobre PostgreSQL)**
- Cola de trabajos que usa PostgreSQL como backend. No requiere infra adicional.
- Pro: Sin dependencia nueva — usa la misma DB que ya tenemos (PostgreSQL).
- Pro: Transaccionalidad: se puede encolar un job en la misma transacción que crea la reserva.
- Pro: Retries con backoff, scheduling, prioridades, dead letter queue — todo incluido.
- Pro: Persistencia garantizada (los jobs sobreviven a un restart de la app).
- Con: No es el sistema de colas más performante (no es RabbitMQ ni Redis Streams).
- Con: Comparte recursos con la DB de negocio (los jobs compiten por conexiones y CPU).

**Opción B: BullMQ (queue sobre Redis)**
- Cola de trabajos que usa Redis como backend. Más performante que pg-boss.
- Pro: Muy rápido. Ecosistema maduro en Node.js. Dashboard (Bull Board).
- Pro: Separación de concerns: la cola no compite con la DB por recursos.
- Con: Requiere un servicio de Redis adicional ($10-20 USD/mes en managed).
- Con: Redis no es persistente por defecto (si se cae sin respaldo, se pierden los jobs encolados).
- Con: La transaccionalidad entre DB y Redis no es trivial (pattern outbox necesario).

**Opción C: SQS/CloudTasks (cloud-native queues)**
- Servicios de cola managed de AWS o Google Cloud.
- Pro: Escalabilidad infinita, zero operaciones.
- Con: Vendor lock-in extremo.
- Con: Latencia mayor (HTTP-based, no in-process).
- Con: Complica el desarrollo local (hay que mockear el servicio).

### Decisión

**Opción A: pg-boss sobre PostgreSQL.**

Razones:
1. **Cero infra adicional**: Usamos la misma instancia de PostgreSQL que ya tenemos. No hay que provisionar, monitorear ni pagar por Redis o SQS.
2. **Transaccionalidad atómica**: Podemos encolar un job de "enviar email de confirmación" en la MISMA transacción que confirma la reserva. Si la transacción falla, el job no se encola. Si la transacción commitea, el job existe garantizado. Esto es IMPOSIBLE con Redis/SQS sin un pattern outbox complejo.
3. **Escala suficiente**: pg-boss maneja cómodamente decenas de miles de jobs/día. Nuestra carga estimada (~30.000 jobs/día con 500 complejos) está dentro de sus capacidades probadas.
4. **Persistencia nativa**: Los jobs están en PostgreSQL = se backupean con la DB = sobreviven a restarts y crashes sin pérdida.
5. **Simplicidad operacional**: Un componente menos en el stack que puede fallar, que hay que monitorear y que hay que escalar.

### Implementación concreta

**Tipos de queues:**

```typescript
// Queue definitions
const QUEUES = {
  // Comunicaciones - prioridad alta
  'send-email':        { retryLimit: 3, retryDelay: 60,      retryBackoff: true },

  // Webhooks - prioridad crítica (pérdida = inconsistencia financiera)
  'process-mp-webhook': { retryLimit: 5, retryDelay: 30,     retryBackoff: true },

  // Cron-like scheduled jobs
  'expire-trials':       { cron: '0 8 * * *' },    // 08:00 ART diario
  'generate-abonado-slots': { cron: '0 3 * * *' },  // 03:00 ART diario
  'auto-complete-bookings': { cron: '*/30 * * * *' }, // cada 30 min
  'dunning-retry':       { cron: '0 10 * * *' },   // 10:00 ART diario
  'data-retention-cleanup': { cron: '0 4 * * 0' },  // domingos 04:00 ART

  // Notificaciones programadas
  'trial-notification':  { retryLimit: 2, retryDelay: 300 },
};
```

**Ejemplo de encolado transaccional:**
```typescript
// Al confirmar una reserva
await db.transaction(async (tx) => {
  // 1. Actualizar estado de la reserva
  await tx.update(bookings).set({ status: 'confirmed' }).where(eq(bookings.id, bookingId));

  // 2. Encolar el email de confirmación en la MISMA transacción
  await boss.send('send-email', {
    notification_type: 'booking_confirmed',
    booking_id: bookingId,
    player_id: playerId,
  }, { db: tx }); // usa la misma conexión transaccional

});
// Si algo falla → rollback de TODO (reserva + jobs)
```

### Consecuencias

**Positivas:**
- Simplicidad máxima — un solo componente de infra (PostgreSQL).
- Transaccionalidad atómica con los datos de negocio.
- Backup y recovery unified con la DB.
- Development local trivial (no hace falta correr Redis).

**Negativas / Riesgos:**
- pg-boss comparte conexiones con la app. Si hay muchos jobs, puede afectar la latencia de la app. **Mitigación**: configurar un pool de conexiones separado para pg-boss (máx 5 conexiones de un pool de 20).
- No es el sistema más rápido para colas de alta frecuencia. **Mitigación**: irrelevante para nuestra escala. Si algún día necesitamos 1M+ jobs/día, migramos a BullMQ + Redis.
- La tabla de jobs crece en PostgreSQL. **Mitigación**: pg-boss tiene cleanup automático de jobs completados (configurable, default 30 días).

### Revisión

Revisitar si:
- La latencia de la DB se degrada y se identifica pg-boss como causa (migrar a BullMQ).
- La escala supera 500.000 jobs/día de forma sostenida.
- Se necesita un dashboard avanzado de colas (BullMQ tiene Bull Board; pg-boss tiene monitoreo más limitado).

---

## ADR-006: Estrategia de Real-Time (Supabase Realtime + polling fallback)

**Estado**: ✅ Decidido
**Fecha**: 2026-04-17

### Contexto

TurnoGol necesita actualizaciones en tiempo real para dos escenarios concretos:

1. **Grilla de disponibilidad (crítico)**: Si el recepcionista está mirando la grilla y otro usuario reserva un slot, el recepcionista debe ver el cambio sin refrescar la página. Si no lo ve, puede intentar reservar un slot ya tomado → mala UX y conflicto potencial.

2. **Dashboard del admin**: Los contadores de "reservas hoy" y "facturado hoy" se benefician de actualizarse en vivo, pero NO es crítico (puede tolerar 30 segundos de delay).

3. **Notificaciones in-app para staff**: "Nueva reserva online" como toast/badge sin refresh.

El Doc 5 establece la concurrencia máxima: ~2 ops/segundo en pico con 500 complejos. Esto es bajo — no necesitamos un sistema de real-time de alta frecuencia.

### Opciones consideradas

**Opción A: WebSockets (conexión bidireccional persistente)**
- Conexión TCP persistente entre cliente y servidor. Permite push y pull en ambas direcciones.
- Pro: Latencia mínima (instantáneo). Bidireccional. Estándar maduro.
- Con: Cada conexión consume un socket en el servidor. Con 500 complejos × 2-3 pantallas abiertas = 1.000-1.500 conexiones permanentes.
- Con: Los load balancers necesitan configuración especial para WebSockets (sticky sessions o WS-aware).
- Con: Más complejo de implementar: heartbeats, reconexión, gestión de estado.
- Con: Vercel no soporta WebSockets en serverless functions.

**Opción B: Server-Sent Events (SSE)**
- Conexión HTTP unidireccional del servidor al cliente. El servidor pushea eventos; el cliente solo escucha.
- Pro: Más simple que WebSockets. Usa HTTP estándar (funciona con cualquier proxy/load balancer).
- Pro: Reconexión automática nativa del browser (si se corta, el browser reconecta solo).
- Pro: Supabase Realtime soporta SSE para cambios en la DB.
- Pro: Unidireccional es suficiente (los updates van del servidor al staff, no al revés).
- Con: Unidireccional: el cliente no puede enviar datos de vuelta por el mismo canal (usa HTTP normal para eso).
- Con: Límite de conexiones concurrentes por dominio en algunos browsers (6 por dominio en HTTP/1.1; ilimitado en HTTP/2).

**Opción C: Polling (el cliente pregunta periódicamente)**
- El frontend hace un request cada N segundos para ver si hay cambios.
- Pro: Extremadamente simple de implementar. Sin dependencias.
- Pro: Funciona con cualquier hosting, proxy, load balancer.
- Con: Latencia de N segundos (si poll cada 10s, el cambio tarda hasta 10s en aparecer).
- Con: Más requests al servidor (N requests por usuario por minuto, innecesarios si no hay cambios).
- Con: No escala elegantemente (1.500 usuarios × 6 polls/minuto = 9.000 requests/minuto innecesarios).

### Decisión

**Opción B: Server-Sent Events (SSE), con Supabase Realtime como implementación, y polling como fallback.**

Razones:
1. **Supabase Realtime**: Supabase tiene un sistema de realtime que emite eventos cuando cambian las filas de PostgreSQL. Se configura con una línea de código (`supabase.channel('bookings')...`). No hay que implementar nada del lado del servidor.
2. **Unidireccional es suficiente**: El staff solo necesita recibir updates ("nueva reserva", "reserva cancelada"). Para enviar, usa HTTP normal (crear/editar reserva via API).
3. **No necesita WebSockets**: La latencia de SSE (< 1 segundo) es más que suficiente para actualizar una grilla de canchas. No estamos haciendo un chat o un juego en tiempo real.
4. **Compatibilidad con Vercel**: SSE funciona en Vercel Edge Functions. WebSockets no.
5. **Fallback a polling**: Para browsers viejos o conexiones problemáticas, un simple polling cada 15 segundos como fallback garantiza que la grilla se actualice eventualmente.

### Implementación concreta

**Supabase Realtime para la grilla de canchas:**
```typescript
// En el frontend del panel admin
const channel = supabase
  .channel('bookings-realtime')
  .on(
    'postgres_changes',
    {
      event: '*',  // INSERT, UPDATE, DELETE
      schema: 'public',
      table: 'bookings',
      filter: `tenant_id=eq.${tenantId}`
    },
    (payload) => {
      // Actualizar la grilla local con el cambio
      updateGrid(payload.eventType, payload.new, payload.old);
    }
  )
  .subscribe();
```

**Fallback a polling:**
```typescript
// Si Supabase Realtime falla o no se conecta en 5 segundos
if (!realtimeConnected) {
  setInterval(async () => {
    const updated = await fetchGridData(date, tenantId);
    setGridData(updated);
  }, 15_000); // cada 15 segundos
}
```

**Eventos que se emiten en real-time:**

| Evento | Tabla | Qué hace en el frontend |
|---|---|---|
| Booking created | `bookings` | Slot ocupado en la grilla (se pone rojo) |
| Booking canceled | `bookings` | Slot liberado en la grilla (se pone verde) |
| Booking status changed | `bookings` | Actualiza color/estado del slot |
| Payment received | `payments` | Badge de "nueva reserva pagada" |

### Consecuencias

**Positivas:**
- Implementación trivial con Supabase Realtime (< 20 líneas de código).
- No hay servidor de WebSockets que mantener.
- Fallback a polling garantiza que funcione siempre.

**Negativas / Riesgos:**
- Supabase Realtime tiene límites en el plan free (200 conexiones concurrentes). **Mitigación**: el plan Pro de Supabase soporta 500+ conexiones, suficiente para Year 1.
- Si Supabase Realtime tiene un outage, dependemos del polling fallback. **Mitigación**: polling de 15 segundos es UX aceptable (el recepcionista no nota el delay).
- Los cambios en tablas con RLS requieren que Supabase Realtime respete los policies. **Mitigación**: Supabase Realtime sí respeta RLS si se configura con el JWT del usuario. Verificar en tests de integración.

### Revisión

Revisitar si:
- Se necesita comunicación bidireccional en tiempo real (chat entre admin y jugador → WebSockets).
- Supabase Realtime tiene problemas de confiabilidad recurrentes (evaluar implementación propia de SSE).
- Se superan los 2.000+ conexiones simultáneas de realtime.

---

## ADR-007: Monolito Modular vs Microservicios

**Estado**: ✅ Decidido
**Fecha**: 2026-04-17

### Contexto

Antes de escribir una línea de código, hay que decidir si TurnoGol se construye como una aplicación monolítica o como un conjunto de microservicios.

El Doc 5 establece explícitamente: "No necesitamos Kubernetes, microservicios ni sistemas distribuidos para Year 1. Un monolito bien estructurado con hosting managed es más que suficiente."

La escala proyectada: ~2 ops/segundo en pico con 500 complejos. Un equipo de desarrollo de 1-3 personas.

### Opciones consideradas

**Opción A: Monolito modular**
- Una sola aplicación deployable, organizada internamente en módulos con boundaries claros.
- Pro: Un solo deploy. Un solo proceso. Un solo log. Un solo debug. Un solo test suite.
- Pro: Comunicación entre módulos es una llamada de función (latencia = 0, fiabilidad = 100%).
- Pro: Un equipo de 1-3 personas puede mantener un monolito sin overhead de coordinación.
- Pro: Refactoring entre módulos es trivial (mover código, no mover servicios).
- Con: Si crece mucho, puede ser difícil de escalar horizontalmente en un módulo específico.
- Con: Un bug en un módulo puede crashear toda la app.

**Opción B: Microservicios desde el inicio**
- Servicios separados: BookingService, PaymentService, NotificationService, AuthService, etc.
- Pro: Cada servicio escala independientemente. Un bug en NotificationService no afecta BookingService.
- Pro: Equipos pueden trabajar en servicios diferentes con deploy independiente.
- Con: Comunicación entre servicios = HTTP/gRPC (latencia adicional, puntos de falla).
- Con: Distributed transactions: si BookingService confirma pero PaymentService falla, ¿qué pasa?
- Con: Monitoring de N servicios. Logging distribuido. Tracing distribuido. Deployment de N servicios.
- Con: Para 1-3 personas, el overhead operacional de microservicios consume > 40% del tiempo de desarrollo.

### Decisión

**Opción A: Monolito modular.**

Razones:
1. **Escala**: ~2 ops/segundo en pico. Un SOLO proceso Node.js en un servidor de $20/mes maneja esto sin sudar.
2. **Equipo**: 1-3 personas. Los microservicios requieren un equipo mínimo de 5-8 personas para ser productivos (según experiencia de la industria).
3. **Complejidad**: Una reserva toca booking + payment + notification + audit_log. En un monolito, eso es una transacción de DB y 3 llamadas a funciones. En microservicios, son 4 llamadas HTTP con retry, timeout, circuit breaker, saga pattern, y eventual consistency. No vale la pena.
4. **Velocidad de desarrollo**: El objetivo es lanzar el MVP en 8-12 semanas. Los microservicios agregan 3-5x de overhead en setup y plumbing.
5. **Migración futura**: Un monolito BIEN MODULARIZADO se puede extraer a microservicios cuando sea necesario. Un microservicio mal diseñado es mucho más difícil de consolidar.

### Estructura modular

```
src/
├── modules/
│   ├── auth/            # Autenticación, magic link, OAuth, JWT
│   │   ├── auth.service.ts
│   │   ├── auth.routes.ts
│   │   └── auth.middleware.ts
│   │
│   ├── tenants/         # CRUD de complejos, configuración, settings
│   │   ├── tenant.service.ts
│   │   ├── tenant.routes.ts
│   │   └── tenant.schema.ts
│   │
│   ├── courts/          # CRUD de canchas, pricing
│   │   ├── court.service.ts
│   │   ├── court.routes.ts
│   │   └── court.schema.ts
│   │
│   ├── bookings/        # Reservas, state machine, concurrencia
│   │   ├── booking.service.ts
│   │   ├── booking.state-machine.ts
│   │   ├── booking.routes.ts
│   │   └── booking.schema.ts
│   │
│   ├── abonados/        # Turnos fijos, generación de slots
│   │   ├── abonado.service.ts
│   │   └── abonado.routes.ts
│   │
│   ├── payments/        # MP Checkout Pro, webhooks, reembolsos
│   │   ├── payment.service.ts
│   │   ├── mp-gateway.ts        # Interfaz abstracta + implementación MP
│   │   └── webhook.handler.ts
│   │
│   ├── billing/         # Suscripciones SaaS, dunning, upgrades
│   │   ├── billing.service.ts
│   │   ├── dunning.service.ts
│   │   └── billing.routes.ts
│   │
│   ├── notifications/   # Email, templates, cola
│   │   ├── notification.service.ts
│   │   ├── email-provider.ts
│   │   └── templates/
│   │
│   ├── cashflow/        # Flujos de caja, productos, reportes
│   │   ├── cashflow.service.ts
│   │   └── cashflow.routes.ts
│   │
│   └── audit/           # Audit logs (INSERT only)
│       └── audit.service.ts
│
├── shared/              # Código compartido entre módulos
│   ├── db/              # Conexión, migrations, schema
│   ├── middleware/       # Auth, tenant context, rate limiting
│   ├── jobs/            # pg-boss config, job definitions
│   └── utils/           # Helpers, validators, types
│
└── app.ts               # Entry point
```

**Regla de módulos**: Un módulo puede importar de `shared/` y de sus propios archivos. Si un módulo necesita algo de otro módulo, lo accede a través de la interfaz pública del módulo (el `.service.ts`), nunca importando archivos internos directamente.

### Consecuencias

**Positivas:**
- Deploy de una sola unidad = operaciones mínimas.
- Debugging trivial (stack trace completo, sin saltos entre servicios).
- Transacciones de DB atómicas para flujos complejos.
- Desarrollo rápido — cero overhead de comunicación entre servicios.

**Negativas / Riesgos:**
- Si no se respetan los boundaries de módulos, degenera en un "big ball of mud". **Mitigación**: cada módulo expone un `.service.ts` con interfaz pública. Agregar lint rules que prohíban imports entre módulos que no sean a través del service. Code review riguroso.
- Un bug no manejado puede crashear todo el proceso. **Mitigación**: error boundaries en Express/Hono. Process manager (pm2 o similar) que reinicia automáticamente. Health checks cada 30 segundos.

### Revisión

Revisitar si:
- El equipo crece a más de 5 personas y los deployments se bloquean entre sí.
- Un módulo específico (ej: notifications) necesita escalar independientemente por volumen.
- La app supera los 100.000 líneas de código y las builds tardan más de 5 minutos.

---

## ADR-008: Framework Front-End

**Estado**: ✅ Decidido
**Fecha**: 2026-04-17

### Contexto

TurnoGol tiene dos superficies de UI:

1. **Panel Admin (B2B)**: Usado por staff del complejo. Desktop y mobile. Features: grilla de reservas, gestión de abonados, configuración, reportes, caja. Es una aplicación compleja con routing, estado, formularios, y real-time.

2. **Vista del Jugador (B2C)**: Mobile-first. Booking flow (buscar → seleccionar → pagar → confirmar), ver reservas. Necesita SEO para la página pública del complejo (Google indexa "cancha de fútbol 5 en Luján").

Ambas interfaces comparten la misma API. El Doc 5 establece targets de performance: FCP < 1.5s, LCP < 2.5s, bundle < 300KB gzipped.

### Opciones consideradas

**Opción A: Next.js (App Router)**
- Framework React de Vercel con SSR, SSG, API routes, y optimizaciones built-in.
- Pro: SSR para SEO (página pública del complejo). SSG para landing y documentación.
- Pro: API Routes o Route Handlers integrados (monolito fullstack en un solo deploy).
- Pro: Vercel lo deploya con zero-config (push → deploy en ~30 segundos).
- Pro: Image optimization, font optimization, bundle splitting — todo out of the box.
- Pro: Ecosistema masivo de componentes, templates, y recursos.
- Con: App Router tiene complejidad extra vs Pages Router (RSC, server/client boundary).
- Con: Build times pueden ser lentos en proyectos grandes.
- Con: React en sí tiene una curva de aprendizaje para patterns modernos (hooks, suspense, RSC).

**Opción B: Remix**
- Framework React alternativo, enfocado en web standards y progressive enhancement.
- Pro: Loader/action pattern es más intuitivo que el data fetching de Next.js.
- Pro: Formularios nativos de HTML, progressive enhancement real.
- Con: Ecosistema más chico que Next.js.
- Con: Menos recursos, templates y componentes disponibles.
- Con: Deploying a Vercel es posible pero no es la experiencia primaria (Remix prefiere su propio hosting).

**Opción C: Astro + React (islands)**
- Astro para las páginas estáticas (landing, booking público), React interactivo solo donde se necesita.
- Pro: Performance máxima para las páginas públicas (zero JS por defecto).
- Pro: El panel admin puede ser full React dentro de Astro.
- Con: Dos paradigmas en un mismo proyecto (Astro + React). Más complejidad mental.
- Con: Menos soporte para features full-stack (API routes, middleware, auth).

**Opción D: SvelteKit**
- Framework de Svelte con SSR, routing, y API endpoints.
- Pro: Bundle size mínimo (Svelte compila, no envía runtime).
- Pro: Sintaxis más simple que React.
- Con: Ecosistema más chico. Menos componentes UI disponibles.
- Con: Menos developers experimentados en Svelte en Argentina.
- Con: La IA (Claude, Copilot) genera código React más confiablemente que Svelte.

### Decisión

**Opción A: Next.js (App Router).**

Razones:
1. **Fullstack monolito**: Next.js con API Routes permite tener frontend + backend en un solo repositorio y un solo deploy. Esto es consistente con ADR-007 (monolito modular).
2. **SEO**: La página pública del complejo (`turnogol.app/[slug]`) necesita SSR para que Google indexe "cancha de fútbol 5 en [ciudad]". Next.js SSR es la solución más directa.
3. **Vercel**: Next.js en Vercel es zero-config deployment con preview per PR, edge functions, image optimization, y analytics. Reducción masiva de trabajo DevOps.
4. **Ecosistema**: La cantidad de componentes, UI libraries (shadcn/ui, Radix), y recursos para Next.js es incomparable. Acelera el desarrollo 2-3x.
5. **AI-assisted development**: Claude, Copilot y Cursor generan código Next.js de calidad probada. Menos iteraciones de fix = desarrollo más rápido.
6. **Bundle optimization**: Code splitting automático por ruta. Solo se carga el JS necesario para cada página. Compatible con el target de < 300KB gzipped de Doc 5.

### Estructura del frontend

```
app/
├── (public)/              # Rutas públicas (SSR, SEO)
│   ├── [slug]/            # Página pública del complejo
│   │   ├── page.tsx       # SSR: nombre, canchas, disponibilidad
│   │   └── booking/       # Booking flow del jugador
│   │       └── page.tsx
│   ├── login/
│   └── register/
│
├── (admin)/               # Panel admin (authenticated, client-side heavy)
│   ├── layout.tsx         # Auth guard + sidebar + tenant context
│   ├── dashboard/
│   ├── grid/              # Grilla de reservas (real-time)
│   ├── abonados/
│   ├── cash/
│   ├── settings/
│   └── reports/
│
├── api/                   # API Routes (backend)
│   ├── bookings/
│   ├── payments/
│   ├── webhooks/
│   │   └── mercadopago/
│   └── ...
│
└── components/            # Componentes compartidos
    ├── ui/                # Componentes primitivos (shadcn/ui, estilizados por design system)
    └── ...
```

### Consecuencias

**Positivas:**
- Un solo repo, un solo deploy, un solo equipo.
- SEO out of the box para la página pública.
- Deployment a Vercel con push → live en 30 segundos.
- Ecosistema masivo de herramientas y componentes.

**Negativas / Riesgos:**
- App Router de Next.js tiene complejidad (RSC, 'use client', server actions). **Mitigación**: definir convención clara — por defecto todo es Server Component. Solo se marca `'use client'` lo que necesita interactividad (formularios, grilla real-time, modals).
- Vendor coupling con Vercel. **Mitigación**: Next.js corre en cualquier hosting con Node.js (Railway, Fly.io, Docker). Vercel es la opción óptima pero no la única.

### Revisión

Revisitar si:
- Vercel sube los precios significativamente o degrada el servicio.
- Se necesita una app nativa móvil (evaluar React Native + API compartida, o capacitor).
- Next.js App Router demuestra problemas de estabilidad o performance en producción.

---

## ADR-009: Plataforma de Hosting / Infraestructura

**Estado**: ✅ Decidido
**Fecha**: 2026-04-17

### Contexto

TurnoGol necesita una plataforma de hosting que soporte:
- Una app Next.js (frontend + API)
- PostgreSQL con RLS
- Background jobs (pg-boss)
- Almacenamiento de archivos (logos, fotos de canchas)
- Auth (magic link + OAuth)

Los RNFs (Doc 5) definen: 99.5% uptime, < 500ms para la grilla, zero-downtime deploys, backups diarios con retención de 30 días, RTO < 4 horas.

El equipo es de 1-3 personas. El tiempo dedicado a operaciones/infra debe ser < 5% del total.

### Opciones consideradas

**Opción A: Vercel (frontend + API) + Supabase (DB + Auth + Realtime + Storage)**
- Vercel: hosting de Next.js con edge functions, preview deploys, CDN global.
- Supabase: PostgreSQL managed con RLS nativo, Auth built-in, Realtime, Storage.
- Pro: Ambos son managed — zero operaciones de servidor.
- Pro: Supabase tiene el stack exacto que necesitamos: PostgreSQL + RLS + Auth + Realtime + Storage.
- Pro: Free tier generoso para desarrollo y staging.
- Pro: Deploy de Vercel: push al repo → deploy en 30 segundos. Rollback en 1 click.
- Pro: Supabase tiene backups automáticos (punto 7 de DR en escalas Pro).
- Con: Dependencia de dos vendors (Vercel + Supabase).
- Con: Supabase tiene limitaciones en el plan free (500MB DB, 1GB storage).
- Con: El costo puede subir rápido en escala (pero para Year 1, es predecible).

**Opción B: Railway (monolito fullstack)**
- Railway: PaaS que deploya cualquier Docker container con PostgreSQL managed.
- Pro: Un solo vendor para todo (app + DB).
- Pro: Pricing predecible y más barato que Vercel + Supabase en algunos escenarios.
- Pro: Docker-based → portable a cualquier hosting.
- Con: No tiene Auth built-in (hay que implementar todo el magic link + OAuth manualmente).
- Con: No tiene Realtime built-in (hay que implementar SSE manualmente).
- Con: No tiene Storage built-in (hay que usar S3 o Cloudflare R2).
- Con: Deploy menos optimizado para Next.js que Vercel (no tiene edge functions ni ISR nativo).

**Opción C: AWS (EC2 + RDS + S3 + Cognito)**
- Todo en AWS: máximo control, máxima complejidad.
- Pro: Escalabilidad infinita. Feature set completo.
- Con: Requiere un DevOps dedicado (o ser DevOps además de developer).
- Con: 10-20x más tiempo en configuración, IAM, networking, security groups.
- Con: Overkill para ~2 ops/segundo.

### Decisión

**Opción A: Vercel + Supabase.**

Razones:
1. **Supabase = PostgreSQL + RLS + Auth + Realtime + Storage, todo managed**: Las ADRs 001 (RLS), 002 (Auth), y 006 (Real-time) se implementan con features nativas de Supabase. No es que Supabase sea "nice to have" — es que Supabase ya tiene exactamente lo que diseñamos.
2. **Vercel = deploy optimizado de Next.js**: Edge Functions, ISR, preview deploys, CDN. La ADR-008 (Next.js) se beneficia directamente.
3. **Zero operaciones**: No hay servidores que mantener, no hay Docker que buildear, no hay Nginx que configurar. Push → deploy → live.
4. **Costo predecible para Year 1**:

| Componente | Plan | Costo/mes |
|---|---|---|
| Vercel | Pro | $20 USD |
| Supabase | Pro | $25 USD |
| Dominio (.com.ar) | — | ~$5 USD |
| Email (Resend) | Starter | $20 USD |
| **Total** | | **~$70 USD/mes** |

Con 10-20 clientes activos de TurnoGol ($160-320 USD/mes en MRR al precio más bajo), la infra se paga sola.

5. **Migrations y backups**: Supabase maneja migrations con su CLI. Backups automatizados diarios en el plan Pro, con point-in-time recovery.

### Arquitectura de despliegue

```
                           ┌──────────────┐
                           │   Vercel     │
                           │   CDN/Edge   │
                           └──────┬───────┘
                                  │
                     ┌────────────┴────────────┐
                     │                         │
              ┌──────▼──────┐          ┌───────▼──────┐
              │  Next.js    │          │  Next.js     │
              │  SSR/SSG    │          │  API Routes  │
              │  (Frontend) │          │  (Backend)   │
              └──────┬──────┘          └───────┬──────┘
                     │                         │
                     └────────────┬────────────┘
                                  │
                     ┌────────────▼────────────┐
                     │      Supabase           │
                     │                         │
                     │  ┌─────────────────┐    │
                     │  │  PostgreSQL     │    │
                     │  │  (+ RLS)        │    │
                     │  │  (+ pg-boss)    │    │
                     │  └─────────────────┘    │
                     │                         │
                     │  ┌─────────────────┐    │
                     │  │  Auth (GoTrue)  │    │
                     │  └─────────────────┘    │
                     │                         │
                     │  ┌─────────────────┐    │
                     │  │  Realtime       │    │
                     │  └─────────────────┘    │
                     │                         │
                     │  ┌─────────────────┐    │
                     │  │  Storage (S3)   │    │
                     │  └─────────────────┘    │
                     └─────────────────────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
      ┌───────▼──────┐   ┌───────▼──────┐
      │   Resend     │   │ MercadoPago  │
      │   (Email)    │   │ (Pagos)      │
      └──────────────┘   └──────────────┘
```

### Consecuencias

**Positivas:**
- Costo de infra mínimo y predecible (~$120-220 USD/mes para Year 1).
- Zero operaciones de servidor — todo managed.
- Deploy en 30 segundos con rollback instantáneo.
- Stack coherente: las ADRs 001-006 se implementan con features nativas de la plataforma.

**Negativas / Riesgos:**
- Dual vendor dependency (Vercel + Supabase). **Mitigación**: Next.js corre en cualquier hosting con Node.js. Supabase es PostgreSQL estándar — se puede migrar a cualquier PostgreSQL managed (RDS, Neon, etc.).
- pg-boss en Supabase: Supabase no tiene soporte oficial para pg-boss, pero pg-boss opera sobre PostgreSQL estándar, así que funciona. **Mitigación**: testear en staging que pg-boss funcione correctamente con la configuración de conexiones de Supabase. Alternativa: usar Supabase Edge Functions con cron para jobs simples.
- Supabase plan Pro tiene limitaciones: 8GB DB, 100GB storage, 500K auth users. **Mitigación**: para Year 1, esto es más que suficiente. Si se superan los límites, Supabase permite escalar o migrar a Supabase self-hosted.

### Revisión

Revisitar si:
- El costo de Vercel + Supabase supera los $500 USD/mes sin justificación de escala (evaluar Railway o self-hosted).
- Supabase tiene downtime que afecta nuestro SLA de 99.5%.
- Se necesita un worker de background jobs que no puede correr dentro de Vercel (mover backend a Railway o Fly.io, manteniendo Supabase DB).

---

## ADR-010: Estrategia de Feature Flags para Planes SaaS

**Estado**: ✅ Decidido
**Fecha**: 2026-04-17

### Contexto

TurnoGol tiene 3 planes (Predio, Complejo, Estadio) con diferentes límites y capacidades. El Doc 4 define la tabla de feature flags:

| Feature | Predio | Complejo | Estadio |
|---|:---:|:---:|:---:|
| Canchas máximas | 3 | 6 | Ilimitado |
| Historial de reservas | 6 meses | 12 meses | Ilimitado |
| Reportes | ✅ Completos | ✅ Completos | ✅ Completos |
| Exportación de datos | CSV | CSV + Excel | CSV + Excel |
| API access (futuro) | ❌ | ❌ | ✅ |

Estas restricciones deben ser:
- **Chequeadas en tiempo real** (si un admin intenta crear la cancha #4 estando en plan Predio, el sistema lo bloquea inmediatamente).
- **Actualizables sin deploy** (si decidimos agregar un feature al plan Predio, no queremos hacer un deploy para eso).
- **Con mensajes de upgrade claros** (nunca un error crudo; siempre "Tu plan permite X. Para más, actualizá a Y →").

### Opciones consideradas

**Opción A: Feature flags en la base de datos (DB-driven)**
- Tabla `plans` con un campo JSONB `features` que define los límites y capacidades de cada plan.
- La app lee los features del plan del tenant actual en cada request relevante.
- Pro: Se pueden cambiar sin deploy (UPDATE al JSON en DB).
- Pro: Los datos ya están en PostgreSQL, junto con todo lo demás.
- Pro: Las queries pueden usar los features directamente (ej: verificar max_courts antes de crear una cancha).
- Con: Requiere leer el plan en cada request que verifica un feature (solucionable con cache).
- Con: No tiene dashboard — hay que modificar directamente en DB.

**Opción B: Feature flags con servicio externo (LaunchDarkly, Unleash, Flagsmith)**
- Servicio dedicado para gestión de feature flags.
- Pro: Dashboard visual. Targeting avanzado (por tenant, por región, por porcentaje).
- Pro: Ideal para A/B testing y progressive rollouts.
- Con: Otra dependencia externa ($$$).
- Con: Overkill para 3 planes con 6 features.
- Con: Latencia adicional (HTTP call al servicio de flags para cada check).

**Opción C: Feature flags hardcodeados en el código**
- Un archivo de configuración en el repo que define qué puede cada plan.
- Pro: Máxima simplicidad. Zero dependencias.
- Con: Cambiar un feature requiere deploy.
- Con: No se puede hacer override por tenant (ej: un beta tester con features extra).

### Decisión

**Opción A: Feature flags DB-driven, almacenados en la tabla `plans` como JSONB.**

Razones:
1. **Simplicidad**: 3 planes con 6-8 features no requiere un servicio externo. Una columna JSONB en la tabla `plans` es suficiente.
2. **Sin deploy para cambios**: Un UPDATE al JSON cambia los límites instantáneamente para todos los tenants de ese plan.
3. **Override por tenant**: Si queremos darle a un beta tester o a un cliente premium un feature extra, agregamos un campo `feature_overrides` JSONB en la tabla `tenants` que sobreescribe los values del plan.
4. **Performance**: El plan del tenant se carga al inicio de cada request (ya forma parte del context de autenticación). No hay latencia adicional.
5. **Zero costo adicional**: Sin servicio externo, sin SDK, sin API keys.

### Implementación concreta

**Tabla `plans`:**
```sql
CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,             -- 'Predio', 'Complejo', 'Estadio'
  slug TEXT NOT NULL UNIQUE,      -- 'predio', 'complejo', 'estadio'
  max_courts INTEGER,             -- 3, 6, NULL (null = ilimitado)
  features JSONB NOT NULL DEFAULT '{}',
  price_monthly INTEGER NOT NULL, -- en centavos ARS
  price_annual INTEGER NOT NULL,  -- en centavos ARS (mensualizado)
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Campo `features` JSONB:**
```json
{
  "history_months": 6,
  "advanced_reports": false,
  "export_formats": ["csv_basic"],
  "api_access": false,
  "support_channels": ["email"],
  "auto_collect_abonados": true
}
```

**Override por tenant (para excepciones):**
```sql
-- En la tabla tenants
ALTER TABLE tenants ADD COLUMN feature_overrides JSONB DEFAULT '{}';

-- Ejemplo: darle reportes avanzados a un tenant que está en Predio (beta tester)
UPDATE tenants 
SET feature_overrides = '{"advanced_reports": true}'
WHERE id = 'tenant-uuid';
```

**Middleware de feature check:**
```typescript
// middleware/featureGate.ts
function checkFeature(featureName: string, tenantContext: TenantContext): boolean {
  // 1. Primero chequear override del tenant
  if (tenantContext.feature_overrides[featureName] !== undefined) {
    return tenantContext.feature_overrides[featureName];
  }
  // 2. Luego el plan del tenant
  return tenantContext.plan.features[featureName] ?? false;
}

// Uso en la capa de servicio:
function createCourt(courtData: CourtInput, ctx: TenantContext) {
  const currentCount = await countActiveCourts(ctx.tenant_id);
  const maxCourts = ctx.plan.max_courts; // null = ilimitado

  if (maxCourts !== null && currentCount >= maxCourts) {
    throw new PlanLimitError({
      feature: 'max_courts',
      current: currentCount,
      limit: maxCourts,
      upgrade_to: 'complejo',
      message: `Tu plan ${ctx.plan.name} permite hasta ${maxCourts} canchas. Actualizá a Complejo para agregar más.`
    });
  }

  // ... crear la cancha
}
```

**UX del error de límite (Doc 4 regla):**
```
┌──────────────────────────────────────────────┐
│  ⬆ Necesitás más canchas                     │
│                                              │
│  Tu plan Predio permite hasta 2 canchas.     │
│  Para agregar más canchas, actualizá a Complejo. │
│                                              │
│  Plan Complejo: hasta 5 canchas              │
│  $85.000/mes (ahorrá con plan anual)         │
│                                              │
│  [Actualizar a Complejo →]  [Ahora no]       │
└──────────────────────────────────────────────┘
```

### Consecuencias

**Positivas:**
- Zero dependencias adicionales.
- Cambios de features sin deploy (UPDATE en DB).
- Override por tenant para excepciones y beta testing.
- UX de upgrading centralizada y consistente.

**Negativas / Riesgos:**
- No hay dashboard visual para gestionar features. **Mitigación**: para 3 planes con 6-8 features, un admin panel interno simple es suficiente. O directamente SQL + Supabase Table Editor.
- No hay A/B testing nativo. **Mitigación**: en v1, no necesitamos A/B testing de features por plan. Si lo necesitamos en el futuro, se puede agregar un servicio de feature flags externo para los flags de "experiment" (no los de plan).
- El cache del plan debe invalidarse cuando se cambia. **Mitigación**: el plan se lee al inicio de cada request desde el JWT o desde una query con cache de 5 minutos. Un cambio de plan tarda como máximo 5 minutos en propagarse (aceptable).

### Revisión

Revisitar si:
- Se necesitan más de 15 feature flags o flags que cambian dinámicamente (A/B testing, progressive rollout).
- Se lanzan más de 5 planes con combinaciones complejas de features.
- Se necesita targeting avanzado (ej: feature habilitado solo para tenants de Buenos Aires).

---

## Matriz de Dependencias entre ADRs

```
ADR-001 (RLS) ────────────────────────▶ Requiere PostgreSQL
                                              │
ADR-005 (pg-boss) ────────────────────────────┤ Comparte la misma DB
                                              │
ADR-009 (Supabase) ◀──────────────────────────┘ Provee PostgreSQL

ADR-002 (Auth) ───────────────────────▶ Implementado por Supabase Auth (ADR-009)
ADR-006 (Real-time) ──────────────────▶ Implementado por Supabase Realtime (ADR-009)
ADR-010 (Feature Flags) ─────────────▶ Almacenado en PostgreSQL (ADR-001)
ADR-008 (Next.js) ────────────────────▶ Deployado en Vercel (ADR-009)
ADR-007 (Monolito) ───────────────────▶ Next.js como fullstack framework (ADR-008)
ADR-003 (Email/Resend) ────────────────▶ Procesado via pg-boss (ADR-005)
ADR-004 (MercadoPago) ────────────────▶ Webhooks procesados via pg-boss (ADR-005)
```

> [!IMPORTANT]
> Las ADRs están interconectadas. **ADR-009 (Vercel + Supabase) es la decisión pivote**: si cambia,
> se revisan las ADR-001, 002, 005 y 006 que dependen de Supabase features.
> **ADR-007 (monolito modular) es el principio rector**: si cambia a microservicios,
> se revisan las ADR-005, 008 y 009.

---

## Resumen Ejecutivo: Stack Completo de TurnoGol v1

| Capa | Tecnología | ADR |
|---|---|---|
| Frontend | Next.js (App Router) + React | ADR-008 |
| Backend | Next.js API Routes (monolito) | ADR-007, ADR-008 |
| Base de datos | PostgreSQL (Supabase) + RLS | ADR-001, ADR-009 |
| Autenticación | Supabase Auth (magic link + OAuth) | ADR-002 |
| Pagos | MercadoPago (Checkout Pro + Suscripciones) | ADR-004 |
| Email | Resend | ADR-003 |
| Monitoring | Sentry (errors) + Vercel Analytics | — |
| Facturación | Fuera de scope v1 (ADR-011) | ADR-011 |
| Verificación +18 | Declaración jurada digital (ADR-012) | ADR-012 |

---

## ADR-011: Facturación Electrónica (AFIP)

**Estado**: ✅ Decidido
**Fecha**: 2026-04-18

### Contexto

El sistema procesa pagos de señas entre jugadores y complejos. Desde el punto de vista legal
argentino, cuando un complejo recibe una seña, debería emitir un comprobante fiscal
(factura o recibo) al jugador. La integración con AFIP (Administración Federal de Ingresos
Públicos) para emisión de facturas electrónicas vía WSFEv1 requiere:

- Certificados digitales AFIP por empresa (el complejo debería obtener el suyo)
- Puntos de venta registrados ante AFIP por cada tenant
- Integración con el web service WSFEv1 (SOAP/XML) de AFIP
- Manejo de CAE (Código de Autorización Electrónico) por comprobante
- Complejidad adicional: cada complejo tiene su propia situación impositiva
  (responsable inscripto, monotributista, exento) que afecta el tipo de comprobante

La estimación de desarrollo es de 2-3 meses adicionales solo para esta integración,
más soporte legal especializado por cada tipo de contribuyente.

### Opciones consideradas

| Opción | Descripción | Esfuerzo |
|---|---|---|
| **A) Fuera de scope v1** | El complejo usa su propio sistema contable | Mínimo |
| **B) Integrar AFIP WSFEv1** | Integración directa con AFIP por cuenta de cada tenant | 2-3 meses |
| **C) Partner (Xubio/Tango)** | Integración vía API de software contable existente | 1-2 meses |

### Decisión

**Opción A: Facturación fuera de scope para v1.**

Razones:
1. **Complejidad**: AFIP WSFEv1 es un servicio SOAP/XML que requiere certificados, manejo de CAEs, y lógica impositiva compleja por tipo de contribuyente. Es trabajo de 2-3 meses para hacerlo bien.
2. **Responsabilidad legal**: La obligación impositiva recae sobre el **complejo** (el dueño del negocio), no sobre TurnoGol. TurnoGol es un software de gestión, no un procesador de pagos (el dinero va directo al complejo vía OAuth de MP).
3. **Mercado actual**: ATC Sports tampoco integra AFIP. Los complejos ya tienen su propio sistema contable (Tango, Xubio, Excel).
4. **Foco en MVP**: El objetivo es validar el producto y capturar clientes en los primeros 6 meses. La facturación no es un criterio de decisión para la adopción inicial.
5. **Validación de demanda**: Si los clientes piden esta feature en escala, se implementa en v1.5 via partner (Xubio API o similar).

### Implementación v1

- El Término y Condición del servicio especifica que **la emisión de comprobantes fiscales de los turnos es responsabilidad exclusiva del dueño del complejo**.
- **Facturación de suscripciones de TurnoGol**: Dado que TurnoGol mismo cobra la suscripción mensual/anual a los complejos (SaaS), TurnoGol emitirá manualmente la factura correspondiente (A/B/C) a cada complejo fuera de la plataforma (utilizando el portal de AFIP de TurnoGol) en la v1. No se construirá integración automática para la facturación propia del SaaS.
- TurnoGol provee **audit trail completo** (booking + timestamp + monto + datos del jugador)
  que el complejo puede usar como respaldo para su contabilidad.
- La documentación del onboarding (Doc 10) incluye una nota para el dueño:
  _"Los pagos de señas van directo a tu cuenta de MercadoPago. Recordá emitir los comprobantes
  fiscales correspondientes con tu sistema contable habitual."_

### Revisitar en v1.5 si

- Más del 20% de los clientes solicita facturación integrada.
- Hay cambios regulatorios que fuercen a las plataformas de gestión a ser agentes de retención.
- Se cierra una alianza con Xubio/Tango que haga viable la integración en < 3 semanas.

---

## ADR-012: Verificación de Edad +18

**Estado**: ✅ Decidido
**Fecha**: 2026-04-18

### Contexto

La Ley 26.061 de Protección Integral de los Derechos de Niñas, Niños y Adolescentes
establece que los servicios digitales deben tomar recaudos para no capturar datos de
menores sin consentimiento parental. TurnoGol captura datos de jugadores (nombre, email,
teléfono) y procesa transacciones económicas.

### Opciones consideradas

| Opción | Descripción | Fricción |
|---|---|---|
| **A) Declaración jurada digital** | Checkbox en registro: "Confirmo que soy mayor de 18 años" | Mínima |
| **B) Fecha de nacimiento obligatoria** | Campo requerido, validado en backend | Media |
| **C) Sin restricción v1** | No hacer nada | Ninguna (riesgo legal) |

### Decisión

**Opción A: Declaración jurada digital en el registro del jugador.**

Razones:
1. **Suficiencia legal**: En Argentina, la declaración jurada es un mecanismo legúlmente aceptado para este tipo de plataformas. La responsabilidad se traslada al usuario que declara falsamente.
2. **Fricción mínima**: Agregar un campo de fecha de nacimiento obligatorio aumenta el abandono del registro en ~15-25% (benchmark de industria). En nuestra fase de tracción, cada registro importa.
3. **Consistencia con el mercado**: Las plataformas similares en Argentina (MercadoLibre, Rappi, etc.) usan declaración jurada o simplemente fecha de nacimiento opcional.
4. **Auditabilidad**: Se registra `agreed_to_terms_at` y `terms_version` en la tabla `players`, lo que permite demostrar cuándo y con qué versión de los Términos aceptó el usuario.

### Implementación v1

**En el registro del jugador (UI):**
```
[ ] Soy mayor de 18 años y acepto los Términos y Condiciones
    [Ver Términos y Condiciones]
```

**En el backend:**
- El campo `agreed_to_terms_at` se popula con `NOW()` al momento del registro.
- El campo `terms_version` se popula con la versión vigente de los TyC (ej: `'2026-04'`).
- Si `agreed_to_terms_at` es NULL, el jugador no puede completar el registro.
- El schema está documentado en Doc 13 (tabla `players`).

**Actualización de Términos:**
- Cuando los Términos cambien, se incrementa `terms_version`.
- Los usuarios con versión anterior ven un modal de aceptación en su próxima visita.
- Si no aceptan, no pueden continuar usando la plataforma.

### Revisitar si

- La AAIP (Agencia de Acceso a la Información Pública) emite regulación específica que requiera verificación solución robusta (fecha de nacimiento con validación).
- Se lanza una sección para menores con tutores (no planeado para v1).

---

## ADR-013: Autenticación de Staff: Email + Password

**Estado**: ✅ Decidido (Reemplaza la estrategia de Magic Link para Staff definida en ADR-002)
**Fecha**: 2026-06-29

### Contexto

En el diseño inicial (ADR-002), se decidió utilizar Magic Link para toda autenticación por email (B2C y B2B) para evitar el soporte de contraseñas olvidadas. Sin embargo, al implementar el modelo multi-tenant con aislamiento relacional RLS en Supabase/PostgreSQL y auditoría inmutable, surgieron varios inconvenientes con el uso de Magic Links para el Staff:

1. **Seguridad y Control de Sesión**: Los Magic Links por email introducen dependencias externas que ralentizan el ingreso diario de los operarios en horas pico y exponen las cuentas a mayor riesgo si el email corporativo del complejo queda abierto en navegadores de mostrador.
2. **Roles y Autorización Gating**: Con la eliminación de PINs (decisión #8) y la definición clara de roles (`admin` y `manager`), la autenticación debe ser robusta, instantánea y controlable a nivel backend mediante credenciales estáticas que puedan ser revocadas e invalidadas inmediatamente de forma determinista.
3. **Fricción nula**: Para el staff del complejo, que trabaja 8-12 horas diarias frente a la grilla, ingresar una contraseña estática al inicio del turno es un flujo estándar y de nula fricción en comparación con tener que esperar el envío y apertura de un correo cada vez que expira la sesión en el mostrador.

### Opciones consideradas

**Opción A: Mantener Magic Link para todos (B2B y B2C)**
- Con: Alta latencia y dependencia del proveedor de email en el acceso al panel admin en horas pico.
- Con: Riesgo de seguridad en mostradores multi-usuario del complejo.
- Con: Dificultad para forzar re-autenticaciones urgentes sin volver a disparar correos.

**Opción B: Email + Contraseña tradicional para Staff, Magic Link para Jugadores**
- Pro: Entrada instantánea para Marcelo y Rodrigo sin dependencia de emails de verificación.
- Pro: Permite forzar el cierre de sesiones a nivel backend de forma determinista.
- Pro: Mantiene el funnel de reservas B2C limpio de fricciones con Magic Link/OAuth.
- Con: Requiere hashing (bcrypt) y gestión de restablecimiento de contraseñas para staff.

### Decisión

**Opción B: Implementar Email + Contraseña tradicional para Staff (B2B), manteniendo Magic Link/OAuth para Jugadores (B2C).**

Razones:
1. **Seguridad B2B**: Las contraseñas tradicionales permiten control estricto de sesiones simultáneas y políticas de expiración forzada requeridas por RLS.
2. **Operación instantánea**: El recepcionista puede loguearse en 3 segundos sin abrir el correo del predio.
3. **Separación de funnels**: El jugador sigue experimentando el flujo passwordless rápido, mientras que el administrador corporativo tiene un canal tradicional y seguro.

### Consecuencias

**Positivas:**
- Mayor seguridad y auditoría en el panel de administración.
- Mayor confiabilidad al no depender de la latencia de entrega de correos de Resend para el trabajo diario.
- Facilidad para dar de baja a miembros de staff con invalidación inmediata de tokens de sesión.

**Negativas:**
- Requiere implementar un flujo de restablecimiento de contraseña para el staff (envío de email con token de reset y pantalla de nueva contraseña). Esto es manejado nativamente por Supabase Auth.
