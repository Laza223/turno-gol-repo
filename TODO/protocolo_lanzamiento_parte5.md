# 🏆 Protocolo de Lanzamiento TurnoGol — Parte 5

## FASE 7: Hallazgos Concretos del Código — Lo que Vi con Mis Propios Ojos

> Esto no es teoría. Leí cada archivo. Estos son problemas reales que encontré.

---

### 🔴 Hallazgo 1 — El Job de Expiración de 15 Min NO Está Programado al Crear Booking

**Archivo**: `src/modules/bookings/booking.service.ts` (createOnlineBooking, línea 198-323)

**El problema**: Cuando `createOnlineBooking()` crea un booking con `status: 'pending_payment'` (línea 251), **no programa ningún job de pg-boss para expirarlo en 15 minutos**. 

El doc7 dice explícitamente:
> "Al crear un Booking con status='pending_payment': → Se programa un job que se ejecuta en 15 minutos"

Pero en el código de `createOnlineBooking()`, después del INSERT no hay ningún `boss.send()` con delay de 15 minutos. Solo encola notificaciones.

**Existe** `expirePendingBooking()` (línea 380) y el worker `auto-complete-bookings.worker.ts`, pero este último solo hace `confirmed → completed`, NO `pending_payment → expired`.

**Prompt para Claude:**

```
HALLAZGO CRÍTICO: createOnlineBooking() en booking.service.ts
NO programa un job de expiración cuando crea un booking con
status='pending_payment'.

1. Verificá si existe en ALGUNA parte del código un job que expire
   bookings pending_payment después de 15 minutos.
   Buscá: "pending_payment" en src/shared/jobs/ y en src/app/api/

2. Si NO existe, CREALO:
   - En createOnlineBooking(), después de crear el booking,
     si status es pending_payment:
     await boss.send('expire-pending-booking', 
       { bookingId: booking.id },
       { startAfter: 15 * 60 }  // 15 minutos
     )
   - Creá el worker expire-pending-booking.worker.ts que llame
     a expirePendingBooking(bookingId, tx)

3. ADEMÁS, creá un cron de barrido (safety net):
   Un job que corra cada 5 minutos y busque:
   SELECT id FROM bookings
   WHERE status = 'pending_payment'
   AND created_at < NOW() - INTERVAL '15 minutes'
   Y los expire uno por uno.
   
   EXCEPCIÓN (ver Hallazgo 2): si el booking tiene un payment
   con status='in_process', usar 48h en vez de 15min.
```

---

### 🟡 Hallazgo 2 — Pagos por Transferencia (in_process): El TODO Está en el Código

**Archivo**: `src/modules/payments/payment.service.ts` (línea 237-251)

**El código dice literalmente**:
```typescript
/**
 * In-process path (Fix #1, Fase 1 audit).
 *
 * MP returns `in_process` for CBU/transferencia (24-48h). The booking stays in
 * `pending_payment`; the payment row reflects the limbo. The future expiry job
 * (background-jobs phase, currently unwired) MUST check
 *   `WHERE EXISTS (SELECT 1 FROM payments p WHERE p.booking_id = b.id AND p.status = 'in_process')`
 * to choose 48h cutoff vs the default 15min.
 */
```

"**Currently unwired**" — el propio código admite que esta lógica no está conectada.

**Prompt para Claude:**

```
HALLAZGO: payment.service.ts línea 237 tiene un comentario que dice
"currently unwired" sobre el manejo de pagos in_process (transferencia bancaria).

El escenario: un jugador paga por CBU/transferencia. MP devuelve 'in_process'.
El booking queda en pending_payment. Si el job de expiración usa 15 minutos,
VA A EXPIRAR UN BOOKING QUE YA ESTÁ SIENDO PAGADO.

SOLUCIÓN: El job de expiración (que creaste en Hallazgo 1) debe:
1. ANTES de expirar un booking, verificar:
   SELECT 1 FROM payments p
   WHERE p.booking_id = booking.id AND p.status = 'in_process'
2. Si existe un payment in_process → NO expirar. Extender a 48h.
3. Si después de 48h sigue in_process → SÍ expirar y notificar al admin.

Implementá esta lógica en el worker de expiración.
```

---

### 🟡 Hallazgo 3 — Late Payment: Se Loguea pero No Se Reembolsa

**Archivo**: `src/modules/payments/payment.service.ts` (handleApproved, línea 196-234)

**Lo bueno**: El código ya maneja el caso donde un pago llega después de que el booking expiró. Crea un audit log `booking.late_payment_attempt` (línea 221).

**Lo faltante**: Solo loguea. No genera un refund automático ni notifica al admin de forma prominente. El admin tiene que buscar en audit_logs para descubrir que un jugador pagó por un turno que ya no existe.

**Prompt para Claude:**

```
HALLAZGO: payment.service.ts handleApproved() (línea 196-234)
detecta pagos tardíos (booking ya expirado) pero solo crea un audit log.

El jugador PAGÓ pero no tiene turno. Si nadie revisa audit_logs,
esa plata queda en el limbo.

OPCIONES (elegí una):
A) Refund automático: si booking está en estado terminal y pago approved,
   crear refund via gateway.createRefund() inmediatamente.
B) Notificación al admin: además del audit log, encolar una notificación
   email/push al admin: "Pago tardío de $X para turno ya expirado.
   Requiere acción: reembolsar al jugador."
C) Ambas: intentar refund, si falla notificar al admin.

La opción B es la más segura para v1 (no hacer refund automático
sin validar que el complejo está de acuerdo).

Implementá la opción elegida.
```

---

### 🟡 Hallazgo 4 — MercadoPagoGateway Sin Refresh de Token

**Archivo**: `src/modules/payments/mp-gateway.implementation.ts` (línea 42-47)

```typescript
export class MercadoPagoGateway implements PaymentGateway {
  private readonly config: ReturnType<typeof mpClient>

  constructor(encryptedAccessToken: string) {
    this.config = mpClient(encryptedAccessToken)
  }
```

El constructor recibe el access_token y crea el client. No hay ninguna lógica para:
- Detectar que el token expiró (401 de MP)
- Refrescar usando el refresh_token
- Guardar el nuevo token en la DB

**Prompt para Claude:**

```
HALLAZGO: MercadoPagoGateway se instancia con un access_token fijo.
No tiene lógica de refresh.

Verificá:
1. ¿Cuánto dura un access_token de MP OAuth? (tipicamente 6h)
2. ¿El campo tenants.mp_refresh_token existe y se guarda durante OAuth?
3. ¿Hay algún lugar del código que refresque el token?

Si no hay refresh:
- Opción rápida: en cada método del gateway, catchear errores 401 de MP,
  refrescar el token usando refresh_token, reintentar la operación,
  y guardar el nuevo access_token en la DB.
- Opción robusta: cron job cada 4 horas que refresque todos los tokens
  de tenants que tengan MP conectado.

Documentá cuál implementaste y por qué.
```

---

### 🟢 Hallazgo 5 — centsToPesos Puede Perder Precisión

**Archivo**: `src/modules/payments/mp-gateway.implementation.ts` (línea 38-40)

```typescript
function centsToPesos(cents: number): number {
  return Math.round(cents) / 100
}
```

Para la mayoría de valores esto funciona. Pero `Math.round(cents) / 100` puede dar floating point impreciso. Ejemplo: `Math.round(1999) / 100 = 19.99` ✅ pero hay edge cases con JavaScript floats.

**Más preocupante es pesosToCents** (línea 33-36):
```typescript
function pesosToCents(amount: number | undefined | null): number {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return 0
  return Math.round(amount * 100)
}
```

Si MP devuelve `19.99`, `19.99 * 100 = 1998.9999999999998`, y `Math.round()` da `1999` ✅. Pero si devuelve `19.995` (improbable pero posible con 3 decimales), `Math.round(19.995 * 100) = 2000` en vez de `1999`.

**Prompt para Claude:**

```
HALLAZGO MENOR: Revisar las funciones centsToPesos y pesosToCents
en mp-gateway.implementation.ts.

Verificar que:
1. En TODOS los usos de centsToPesos (envío a MP), el resultado es correcto
2. En TODOS los usos de pesosToCents (recepción de MP), el resultado es correcto
3. No hay ningún lugar donde se haga amount * 100 o amount / 100
   FUERA de estas funciones helper

Buscar en todo src/: Math.round.*100, /100, *100
para encontrar conversiones sueltas que no usen los helpers.
```

---

### 🔴 Hallazgo 6 — Tests E2E Completamente Vacíos

**Directorio**: `tests/e2e/` contiene solo `.gitkeep`

No hay un solo test E2E. El `playwright.config.ts` está configurado pero no hay tests. Esto significa que **ningún flujo de usuario ha sido validado end-to-end de forma automatizada**.

**Prompt para Claude:**

```
Los tests E2E están completamente vacíos (tests/e2e/ solo tiene .gitkeep).

MÍNIMO VIABLE antes de lanzar — creá estos 3 tests E2E:

1. tests/e2e/auth.spec.ts:
   - Navegar a /login
   - Verificar que la página carga
   - Verificar que el formulario de login existe y es funcional

2. tests/e2e/public-page.spec.ts:
   - Navegar a /{slug} de un tenant de test
   - Verificar que la grilla pública carga
   - Verificar que los slots se muestran (libres y ocupados)

3. tests/e2e/admin-booking.spec.ts:
   - Loguearse como admin
   - Navegar a /grilla
   - Crear una reserva manual
   - Verificar que aparece en la grilla

Estos 3 tests cubren los caminos más críticos.
No necesitan ser perfectos, pero deben EXISTIR.
```

---

### 🟢 Hallazgo 7 — Connection Pool Hardcodeado a 10

**Archivo**: `src/shared/db/client.ts` (línea 23-28)

```typescript
_sql = postgres(url, {
  max: 10,
  prepare: false,
  onnotice: () => {},
})
```

Con `max: 10` conexiones y Vercel Serverless (que puede tener muchas funciones concurrentes), podrías agotar el pool rápidamente durante picos. Supabase Free/Pro tiene un límite de conexiones directas.

**Prompt para Claude:**

```
HALLAZGO MENOR: DB connection pool está hardcodeado a max=10.

Verificá:
1. ¿Cuántas conexiones directas permite el plan de Supabase que usa TurnoGol?
   - Free: ~60 directas
   - Pro: ~200 directas
2. Con Vercel Serverless, cada invocación de función puede crear un pool.
   Si hay 20 funciones concurrentes × 10 pool = 200 conexiones potenciales.

RECOMENDACIONES:
- Usar Supabase connection pooler (PgBouncer) en vez de conexión directa
- O reducir max a 3-5 para serverless
- O usar DATABASE_URL apuntando al pooler de Supabase (puerto 6543)
  en vez de la conexión directa (puerto 5432)

Verificá qué URL está en .env.example y .env.local.
Si usa el puerto directo (5432), documentá que en prod debe
usar el pooler (6543).
```

---

### 🟡 Hallazgo 8 — cancelByPlayer No Verifica Estado del Tenant

**Archivo**: `src/modules/bookings/booking.cancellation.ts` (línea 75-128)

`cancelByPlayer()` recibe `bookingId` y `playerId` y opera. Pero no verifica si el tenant del booking está en un estado que permita operaciones. Si un tenant está `deleted`, un jugador teóricamente podría cancelar un booking de un complejo que ya no existe (y triggerear un refund).

Esto probablemente está protegido por el middleware (`withPlayer` o `withPublicTenant`), pero vale verificar.

**Prompt para Claude:**

```
HALLAZGO: cancelByPlayer() en booking.cancellation.ts no verifica
el status del tenant del booking.

Verificá:
1. ¿El endpoint de cancelación del jugador pasa por algún middleware
   que verifique el status del tenant? (withPlayer, withPublicTenant)
2. ¿Qué pasa si un jugador intenta cancelar una reserva en un
   complejo que fue eliminado (status=deleted)?
3. ¿El refund se ejecuta contra un tenant que ya no tiene MP conectado?

Si el middleware NO protege este caso, agregá una verificación en
cancelByPlayer(): leer el tenant status y rechazar si es deleted/blocked.
```

---

## Resumen de Hallazgos por Severidad

| # | Severidad | Hallazgo | Impacto |
|---|-----------|----------|---------|
| 1 | 🔴 CRÍTICO | No hay job de expiración para pending_payment | Slots bloqueados para siempre |
| 2 | 🟡 ALTO | Pagos por transferencia (in_process) sin lógica | Booking expira mientras el pago se procesa |
| 3 | 🟡 ALTO | Late payment: se loguea pero nadie se entera | Jugador pagó, no tiene turno, nadie lo sabe |
| 4 | 🟡 ALTO | Sin refresh de token OAuth de MP | Pagos fallan después de 6h para cada complejo |
| 5 | 🟢 MENOR | Potencial imprecisión en conversión centavos/pesos | Edge case raro pero posible |
| 6 | 🔴 CRÍTICO | Tests E2E vacíos | Ningún flujo validado end-to-end |
| 7 | 🟢 MENOR | Pool de 10 conexiones en serverless | Posible agotamiento en picos |
| 8 | 🟡 MEDIO | cancelByPlayer sin verificar tenant status | Refund a tenant eliminado |

---

> **ORDEN DE EJECUCIÓN SUGERIDO PARA TODA LA AUDITORÍA:**
>
> ```
> FASE 0 (Parte 1)     → Build/Typecheck/Tests existentes
> FASE 1 (Parte 1)     → Docs vs código
> HALLAZGO 1 + 2       → Timer de expiración (CRÍTICO)
> HALLAZGO 4           → Refresh de MP tokens (ALTO)
> FASE 2 (Parte 2)     → Tests de seguridad/isolation
> HALLAZGO 3           → Late payment handling
> HALLAZGO 6           → Crear E2E tests mínimos
> FASE 3 (Parte 2)     → E2E con Playwright
> FASE 4 (Parte 3)     → Error boundary + UI
> HALLAZGO 8           → cancelByPlayer tenant check
> FASE 5 (Parte 3)     → Sentry, jobs, env vars
> FASE 6 (Parte 4)     → Rate limiting, email, compliance
> HALLAZGOS 5 + 7      → Menores, post-launch OK
> ```
