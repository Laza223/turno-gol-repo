# DOC 16 — Testing Strategy
## TurnoGol: Qué Testeamos, Qué No, y Por Qué

> **Propósito**: Definir la estrategia de testing completa antes de escribir una línea de código.
> El testing se planifica con la arquitectura, no después. Cada tipo de test tiene un costo
> de mantenimiento — los seleccionamos con la misma disciplina que seleccionamos las tecnologías.

> [!IMPORTANT]
> Principio rector: **testear lo que puede romperse y generar impacto de negocio**.
> Un test que no protege contra un escenario real de fallo es overhead puro.
> Un escenario de fallo sin test es una bomba de tiempo.

---

## 1. Filosofía de Testing

### 1.1 La realidad de un equipo de 1-3 personas

TurnoGol no es Google. No podemos tener 95% de coverage ni una suite de 10.000 tests. Pero tampoco podemos lanzar sin tests: un doble booking, un data leak entre tenants, o un cobro duplicado destruye la confianza del cliente sin remedio.

**Principios:**
- Testear lo que **afecta dinero, datos o confianza**. El resto es negociable.
- Preferir **pocos tests de alta fidelidad** a muchos tests frágiles de baja señal.
- Los tests tienen que ser **rápidos** (< 2 minutos la suite completa de unit + integration, < 5 minutos con e2e).
- Si un test falla, tiene que ser **obvio por qué falló** (buen naming, assertions claras, setup explícito).
- **Zero tolerance** para los tests de aislamiento de tenant: si falla uno, el deploy no avanza.

### 1.2 Pirámide de testing de TurnoGol

```
                ┌──────────┐
                │   E2E    │  ~10% del esfuerzo
                │ (Playwright)│  5-10 tests de happy path
                ├──────────┤
                │          │
            ┌───┤Integration├───┐  ~25% del esfuerzo
            │   │(Vitest+DB)│   │  30-50 tests con DB real
            │   ├──────────┤   │
            │   │          │   │
        ┌───┤   │   Unit   │   ├───┐  ~65% del esfuerzo
        │   │   │ (Vitest) │   │   │  100-200 tests de lógica pura
        └───┴───┴──────────┴───┴───┘
```

| Capa | Framework | DB | Red | Velocidad | Cuántos |
|---|---|---|---|---|---|
| **Unit** | Vitest | ❌ No | ❌ No | < 50ms/test | 100-200 |
| **Integration** | Vitest | ✅ PostgreSQL real (Supabase local) | ❌ No (mocks) | < 500ms/test | 30-50 |
| **E2E** | Playwright | ✅ Sí (app completa) | ✅ Sí | 5-15s/test | 5-10 |

---

## 2. Unit Tests — La Base (65% del esfuerzo)

### 2.1 Qué se testea con unit tests

Business logic pura que no toca base de datos, red ni servicios externos.

| Módulo | Qué se testea | Cantidad estimada |
|---|---|---|
| `booking.state-machine.ts` | Todas las transiciones válidas e inválidas de la state machine de reservas | 20-25 tests |
| `booking.concurrency.ts` | Lógica de resolución de conflictos, detección de overlap | 8-10 tests |
| `slot-generator.ts` | Generación de instancias de turno fijo (abonados) | 12-15 tests |
| `mp-gateway.ts` | Construcción de preferences, validación de webhooks, cálculo de prorrateo | 10-12 tests |
| `currency.ts` | Conversión centavos ↔ ARS, formateo, redondeo | 5-8 tests |
| `dates.ts` | Conversión UTC ↔ ART, manejo de DST (Argentina no tiene, pero validar), rango de horas | 8-10 tests |
| `billing.service.ts` | Lógica de dunning: cuándo reintentar, cuánto cobrar, transiciones de estado | 10-12 tests |
| `pricing` | Cálculo de precio por franja horaria, descuentos de abonado, prorrateo | 8-10 tests |
| `cancellation-policy` | ¿Se reembolsa? ¿Cuánto? ¿Se aplica penalidad? Según horas_before y settings | 6-8 tests |
| `feature-gate` | Feature flag check, override por tenant, límites de plan | 6-8 tests |
| `zod schemas` | Validación de inputs: boundaries, tipos inválidos, campos requeridos | 10-15 tests |
| `slug.ts` | Generación y sanitización de slugs | 3-5 tests |

**Total estimado: 100-140 unit tests.**

### 2.2 Patrón de test unitario

```typescript
// tests/unit/bookings/state-machine.test.ts
import { describe, it, expect } from 'vitest';
import { transitionBookingStatus } from '@/modules/bookings/booking.state-machine';

describe('Booking State Machine', () => {
  describe('Transiciones válidas', () => {
    it('pending_payment → confirmed (pago exitoso)', () => {
      const result = transitionBookingStatus('pending_payment', 'PAYMENT_APPROVED');
      expect(result.status).toBe('confirmed');
      expect(result.sideEffects).toContain('SEND_EMAIL_CONFIRMATION');
    });

    it('pending_payment → expired (timeout 6 min)', () => {
      const result = transitionBookingStatus('pending_payment', 'PAYMENT_TIMEOUT');
      expect(result.status).toBe('expired');
      expect(result.sideEffects).toContain('RELEASE_SLOT');
      expect(result.sideEffects).toContain('SEND_EMAIL_EXPIRED');
    });

    it('confirmed → completed (turno jugado)', () => {
      const result = transitionBookingStatus('confirmed', 'MARK_COMPLETED');
      expect(result.status).toBe('completed');
    });

    it('confirmed → no_show (no se presentó)', () => {
      const result = transitionBookingStatus('confirmed', 'MARK_NO_SHOW');
      expect(result.status).toBe('no_show');
      expect(result.sideEffects).toContain('APPLY_NO_SHOW_PENALTY');
    });
  });

  describe('Transiciones inválidas', () => {
    it('completed → cualquier estado (estado final inmutable)', () => {
      expect(() =>
        transitionBookingStatus('completed', 'CANCEL')
      ).toThrow('completed es un estado final');
    });

    it('expired → confirmed (no se puede revivir)', () => {
      expect(() =>
        transitionBookingStatus('expired', 'PAYMENT_APPROVED')
      ).toThrow('expired es un estado final');
    });

    it('no_show → completed (no se puede retroactivamente)', () => {
      expect(() =>
        transitionBookingStatus('no_show', 'MARK_COMPLETED')
      ).toThrow('no_show es un estado final');
    });
  });
});
```

### 2.3 Convenciones de unit tests

```
tests/unit/
├── bookings/
│   ├── state-machine.test.ts       # State machine transitions
│   ├── concurrency.test.ts         # Overlap detection logic (pure)
│   └── pricing.test.ts             # Price calculation
├── abonados/
│   └── slot-generator.test.ts      # Slot generation logic
├── payments/
│   ├── mp-gateway.test.ts          # MP preference/webhook building
│   └── cancellation-policy.test.ts # Refund/penalty logic
├── billing/
│   ├── dunning.test.ts             # Dunning state machine
│   └── proration.test.ts           # Upgrade proration logic
├── notifications/
│   └── template-builder.test.ts    # Email template variable substitution
├── shared/
│   ├── currency.test.ts
│   ├── dates.test.ts
│   ├── slug.test.ts
│   └── feature-gate.test.ts
└── schemas/
    ├── booking.schema.test.ts      # Zod validation boundaries
    ├── court.schema.test.ts
    └── payment.schema.test.ts
```

**Regla**: Los unit tests **nunca** importan de `shared/db/`, nunca hacen `fetch()`, nunca tocan el filesystem. Si un service necesita DB, se mockea la dependencia. Si un test requiere DB para ser válido, es un integration test.

---

## 3. Integration Tests — Lógica con DB Real (25% del esfuerzo)

### 3.1 Qué se testea con integration tests

Flujos que involucran la base de datos, incluyendo transacciones, RLS, constraints, triggers y la interacción entre múltiples módulos.

> [!IMPORTANT]
> Los integration tests usan una instancia **real** de PostgreSQL (Supabase local vía Docker).
> No se mockea la base de datos. El schema es idéntico a producción (mismas migrations, mismos
> policies RLS, mismos triggers). Los servicios externos (MP, Resend) sí se mockean.

| Test suite | Qué valida | Criticidad |
|---|---|---|
| `isolation.test.ts` | Aislamiento cross-tenant (Doc 12 §10) | 🔴 BLOQUEANTE |
| `booking-flow.test.ts` | Flujo completo: crear → confirmar → completar/cancelar | 🔴 BLOQUEANTE |
| `booking-concurrency.test.ts` | Doble booking simultáneo → exclusion constraint + SELECT FOR UPDATE | 🔴 BLOQUEANTE |
| `abonado-flow.test.ts` | Crear abonado → genera slots → cancela → elimina futuros | 🟡 Alto |
| `payment-webhook.test.ts` | Webhook MP → actualiza booking → idempotencia | 🟡 Alto |
| `billing-lifecycle.test.ts` | Trial → active → past_due → suspended → active | 🟡 Alto |
| `rls-policies.test.ts` | Cada tabla aislada rechaza cross-tenant CRUD | 🔴 BLOQUEANTE |

**Total estimado: 35-50 integration tests.**

### 3.2 Tests de aislamiento — El guardián (BLOQUEANTE)

Expandido de Doc 12 §10. Estos tests verifican las 6 capas de protección.

```typescript
// tests/integration/isolation.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestTenant, setTenantContext, resetTenantContext } from '../helpers/tenant';
import { db } from '@/shared/db/client';

// Las 13 tablas aisladas
const ISOLATED_TABLES = [
  'courts', 'bookings', 'abonados', 'payments', 'cash_flows',
  'tenant_staff_members', 'daily_cash_closes',
  'notifications', 'audit_logs', 'tenant_subscriptions', 'tenant_player_bans',
  'push_subscriptions',
];

describe('Cross-Tenant Isolation (BLOQUEANTE)', () => {
  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    tenantA = await createTestTenant('Complejo Test A');
    tenantB = await createTestTenant('Complejo Test B');
    // Seed: crear al menos 1 fila en cada tabla para ambos tenants
    await seedIsolationData(tenantA);
    await seedIsolationData(tenantB);
  });

  // Test automatizado para CADA tabla
  for (const table of ISOLATED_TABLES) {
    describe(`Tabla: ${table}`, () => {
      it(`Tenant A no puede leer datos de Tenant B`, async () => {
        await setTenantContext(tenantA);
        const rows = await db.query(`SELECT * FROM ${table}`);
        for (const row of rows.rows) {
          expect(row.tenant_id).toBe(tenantA);
        }
      });

      it(`Tenant B no puede leer datos de Tenant A`, async () => {
        await setTenantContext(tenantB);
        const rows = await db.query(`SELECT * FROM ${table}`);
        for (const row of rows.rows) {
          expect(row.tenant_id).toBe(tenantB);
        }
      });

      it(`Tenant A no puede insertar con tenant_id de Tenant B`, async () => {
        await setTenantContext(tenantA);
        await expect(
          insertWithTenantId(table, tenantB)
        ).rejects.toThrow();
      });

      it(`Sin contexto de tenant, SELECT devuelve 0 filas`, async () => {
        await resetTenantContext();
        const rows = await db.query(`SELECT * FROM ${table}`);
        expect(rows.rows.length).toBe(0);
      });
    });
  }
});
```

**Integración con CI/CD:**
```yaml
# Este test es un JOB SEPARADO que BLOQUEA el deploy
test-isolation:
  stage: test
  script:
    - pnpm test:isolation
  allow_failure: false  # ← Si falla, el pipeline MUERE
```

### 3.3 Test de concurrencia en reservas — El antidoble-booking

```typescript
// tests/integration/booking-concurrency.test.ts
describe('Booking Concurrency (Double Booking Prevention)', () => {
  it('Dos reservas simultáneas en el mismo slot: solo una gana', async () => {
    await setTenantContext(tenantA);
    const courtId = testCourt.id;
    const date = '2026-04-17';
    const timeStart = '21:00';
    const timeEnd = '22:00';

    // Simular dos transacciones concurrentes
    const [resultA, resultB] = await Promise.allSettled([
      bookingService.createManualBooking({
        courtId, date, timeStart, timeEnd, playerId: playerA.id,
      }),
      bookingService.createManualBooking({
        courtId, date, timeStart, timeEnd, playerId: playerB.id,
      }),
    ]);

    // Exactamente una debe tener éxito, la otra falla
    const successes = [resultA, resultB].filter(r => r.status === 'fulfilled');
    const failures = [resultA, resultB].filter(r => r.status === 'rejected');

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);

    // La que falló debe tener un error descriptivo
    const error = (failures[0] as PromiseRejectedResult).reason;
    expect(error.code).toBe('SLOT_UNAVAILABLE');
  });

  it('Reservas en el mismo horario pero diferente cancha: ambas ganan', async () => {
    const [resultA, resultB] = await Promise.allSettled([
      bookingService.createManualBooking({
        courtId: court1.id, date: '2026-04-17', timeStart: '21:00', timeEnd: '22:00',
      }),
      bookingService.createManualBooking({
        courtId: court2.id, date: '2026-04-17', timeStart: '21:00', timeEnd: '22:00',
      }),
    ]);

    expect(resultA.status).toBe('fulfilled');
    expect(resultB.status).toBe('fulfilled');
  });

  it('Exclusion constraint previene overlap parcial', async () => {
    // Booking existente: 21:00 - 22:00
    await bookingService.createManualBooking({
      courtId: court1.id, date: '2026-04-17', timeStart: '21:00', timeEnd: '22:00',
    });

    // Intentar booking solapado: 21:30 - 22:30
    await expect(
      bookingService.createManualBooking({
        courtId: court1.id, date: '2026-04-17', timeStart: '21:30', timeEnd: '22:30',
      })
    ).rejects.toThrow();
  });

  it('Booking expirado libera el slot para otra reserva', async () => {
    // Crear booking pending_payment
    const booking = await bookingService.createOnlineBooking({
      courtId: court1.id, date: '2026-04-18', timeStart: '21:00', timeEnd: '22:00',
    });

    // Expirar el booking (simular timeout)
    await bookingService.expireBooking(booking.id);

    // Otro jugador puede reservar el mismo slot
    const newBooking = await bookingService.createManualBooking({
      courtId: court1.id, date: '2026-04-18', timeStart: '21:00', timeEnd: '22:00',
    });
    expect(newBooking.status).toBe('confirmed');
  });
});
```

### 3.5 Test de idempotencia de webhooks MP

```typescript
// tests/integration/payment-webhook.test.ts
describe('MercadoPago Webhook Idempotency', () => {
  it('Procesar el mismo webhook dos veces: solo se aplica una vez', async () => {
    const webhookPayload = {
      id: 'event-12345',
      type: 'payment',
      data: { id: 'mp-payment-67890' },
    };

    // Primera vez: procesa normalmente
    const result1 = await webhookHandler.process(webhookPayload);
    expect(result1.action).toBe('processed');

    // Segunda vez: ignora (ya procesado)
    const result2 = await webhookHandler.process(webhookPayload);
    expect(result2.action).toBe('ignored');

    // Verificar que la reserva solo se actualizó una vez
    const booking = await db.query(
      'SELECT status FROM bookings WHERE id = $1', [testBookingId]
    );
    expect(booking.rows[0].status).toBe('confirmed');
  });

  it('Webhook de pago aprobado → booking cambia a confirmed', async () => {
    const booking = await createPendingBooking();
    await simulateWebhook({
      type: 'payment',
      data: { id: booking.mpPreferenceId },
      action: 'payment.approved',
    });

    const updated = await getBooking(booking.id);
    expect(updated.status).toBe('confirmed');
    expect(updated.deposit_status).toBe('paid');
  });
});
```

### 3.6 Setup y teardown del entorno de test

```typescript
// tests/helpers/setup.ts
import { beforeAll, afterAll, afterEach } from 'vitest';
import { db } from '@/shared/db/client';

// Antes de todos los tests de integration: asegurar que la DB esté migrada
beforeAll(async () => {
  // Verificar que las migrations corrieron (la DB de test se crea en CI con `pnpm db:migrate:test`)
  const tables = await db.query(`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `);
  expect(tables.rows.length).toBeGreaterThan(10); // Al menos nuestras 22 tablas de negocio (+ system_admins)
});

// Después de cada test: limpiar datos sin droppear tablas
afterEach(async () => {
  // Truncar tablas de datos, mantener estructura
  // El orden importa por foreign keys
  await db.query(`
    TRUNCATE TABLE
      audit_logs, notifications, daily_cash_closes,
      cash_flows, payments, bookings, abonados,
      tenant_player_bans, player_tenant_relationships,
      tenant_staff_members, tenant_subscriptions,
      courts, staff_users, players, tenants, plans,
      price_versions, processed_webhooks
    CASCADE;
  `);
});

// Después de todos los tests: cerrar la conexión
afterAll(async () => {
  await db.end();
});
```

### 3.7 Convenciones de integration tests

```
tests/integration/
├── isolation.test.ts              # Cross-tenant isolation (BLOQUEANTE)
├── rls-policies.test.ts           # RLS para cada tabla individual
├── booking-flow.test.ts           # Crear → confirmar → completar/cancelar
├── booking-concurrency.test.ts    # Double booking, race conditions
├── abonado-flow.test.ts           # Crear → genera slots → pausar → cancelar
├── payment-webhook.test.ts        # MP webhook processing + idempotencia
├── billing-lifecycle.test.ts      # Trial → active → past_due → ...
├── audit-log.test.ts              # Verificar que las acciones generan logs
├── feature-gate-integration.test.ts # Límites de plan en DB
└── helpers/
    ├── setup.ts                   # Global setup/teardown
    ├── tenant.ts                  # createTestTenant(), setTenantContext()
    ├── booking.ts                 # createTestBooking(), seedBookings()
    └── factories.ts               # Factories para generar datos de test
```

---

## 4. E2E Tests — Happy Paths Críticos (10% del esfuerzo)

### 4.1 Qué se testea con E2E

Solo los flujos críticos de negocio, end-to-end, desde el browser hasta la DB. No se testea styling, layout, ni UX — eso es revisión manual. Se testea que **la funcionalidad core funcione de punta a punta**.

| Test | Flujo | Importancia |
|---|---|---|
| `onboarding.spec.ts` | Registro completo → onboarding wizard → complejo live | 🔴 Crítico |
| `booking-admin.spec.ts` | Admin crea reserva manual → aparece en grilla | 🔴 Crítico |
| `booking-online.spec.ts` | Jugador reserva online → checkout MP (mock) → confirmación | 🔴 Crítico |
| `cancellation.spec.ts` | Admin cancela reserva → slot se libera → aparece disponible | 🟡 Alto |
| `abonado.spec.ts` | Admin crea abonado → se generan bookings futuros en la grilla | 🟡 Alto |
| `auth-flow.spec.ts` | Login staff (email+password) → dashboard visible → logout | 🟡 Alto |
| `billing.spec.ts` | Trial → pantalla de upgrade → (mock MP) → plan activo | 🟢 Medio |

**Total estimado: 7-10 e2e tests.**

### 4.2 Configuración de Playwright

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,              // 30s por test (incluye navegación)
  retries: 1,                   // 1 retry para tests flaky (red, timing)
  workers: 1,                   // Secuencial: los tests pueden compartir estado de DB

  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',  // Trace files para debugging
    video: 'retain-on-failure',
  },

  // Levantar la app antes de los tests
  webServer: {
    command: 'pnpm dev',
    port: 3000,
    reuseExistingServer: true,
    timeout: 60_000,
  },

  projects: [
    // Solo Chrome — mobile-first pero testeamos en desktop
    // (los tests e2e validan funcionalidad, no responsive design)
    {
      name: 'chromium',
      use: { browserName: 'chromium', viewport: { width: 1280, height: 720 } },
    },
  ],
});
```

### 4.3 Ejemplo: test E2E del flujo de reserva del admin

```typescript
// tests/e2e/booking-admin.spec.ts
import { test, expect } from '@playwright/test';
import { loginAsAdmin, seedTestData } from './helpers';

test.describe('Admin: Reserva Manual', () => {
  test.beforeEach(async ({ page }) => {
    await seedTestData(); // Crear tenant + canchas + jugadores de test
    await loginAsAdmin(page, 'admin-test@turnogol.app');
  });

  test('crear reserva manual y verla en la grilla', async ({ page }) => {
    // 1. Ir a la grilla
    await page.goto('/grilla');
    await expect(page.getByText('Grilla de Reservas')).toBeVisible();

    // 2. Click en un slot libre (cancha 1, 21:00)
    await page.click('[data-testid="slot-court1-2100"]');

    // 3. Completar formulario de reserva
    await page.fill('[data-testid="booking-player-name"]', 'Agustín López');
    await page.fill('[data-testid="booking-player-phone"]', '+5491198765432');

    // 4. Confirmar
    await page.click('[data-testid="booking-submit"]');

    // 5. Verificar que la reserva aparece en la grilla
    await expect(page.getByTestId('slot-court1-2100')).toHaveAttribute('data-status', 'confirmed');
    await expect(page.getByText('Agustín López')).toBeVisible();
  });

  test('no se puede reservar un slot ocupado', async ({ page }) => {
    // Crear una reserva previa
    await seedBooking({ courtId: 'court-1', date: '2026-04-17', timeStart: '21:00' });

    await page.goto('/grilla');

    // El slot debe estar marcado como ocupado
    await expect(page.getByTestId('slot-court1-2100')).toHaveAttribute('data-status', 'confirmed');

    // Intentar hacer click → no abre el formulario o muestra error
    await page.click('[data-testid="slot-court1-2100"]');
    await expect(page.getByText('Este turno ya está reservado')).toBeVisible();
  });
});
```

### 4.4 Mock de servicios externos en E2E

```typescript
// tests/e2e/helpers/mocks.ts

// MercadoPago: interceptar requests al checkout
test.beforeEach(async ({ page }) => {
  // Interceptar la redirección a MP y simular retorno exitoso
  await page.route('**/api/webhooks/mercadopago', async (route) => {
    await route.fulfill({ status: 200, body: '{}' });
  });

  // Mock de la API de MP: devolver preference válida
  await page.route('**/api.mercadopago.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      body: JSON.stringify({
        id: 'mock-preference-id',
        init_point: 'http://localhost:3000/test/mp-success',
      }),
    });
  });
});

// Email (Resend): no enviar emails reales
// (El mock se aplica a nivel de service en el backend, no en el browser)
```

---

## 5. Tests Especializados

### 5.1 Tests de aislamiento de jugador

```typescript
// tests/integration/player-isolation.test.ts
describe('Player Data Isolation', () => {
  it('Jugador A no puede ver reservas de Jugador B', async () => {
    const playerA = await createTestPlayer('Player A');
    const playerB = await createTestPlayer('Player B');

    await setTenantContext(tenantA);
    await createBookingForPlayer(playerA.id, tenantA);
    await createBookingForPlayer(playerB.id, tenantA);

    // Consultar como Player A
    const bookings = await playerService.getMyBookings(playerA.id);
    expect(bookings.every(b => b.player_id === playerA.id)).toBe(true);
    expect(bookings.some(b => b.player_id === playerB.id)).toBe(false);
  });

  it('Jugador ve sus reservas en múltiples complejos', async () => {
    const player = await createTestPlayer('Cross-Tenant Player');

    await setTenantContext(tenantA);
    await createBookingForPlayer(player.id, tenantA);
    await setTenantContext(tenantB);
    await createBookingForPlayer(player.id, tenantB);

    // Sin contexto de tenant — jugador es cross-tenant
    const bookings = await playerService.getMyBookings(player.id);
    expect(bookings.length).toBe(2);
    const tenantIds = bookings.map(b => b.tenant_id);
    expect(tenantIds).toContain(tenantA);
    expect(tenantIds).toContain(tenantB);
  });
});
```

### 5.2 Tests de graceful degradation

```typescript
// tests/integration/graceful-degradation.test.ts
describe('Graceful Degradation', () => {
  it('Si MP está caído → reserva se crea sin seña', async () => {
    // Mock: MP devuelve timeout
    mpGateway.mock.rejectWith(new TimeoutError('MP unavailable'));

    const booking = await bookingService.createOnlineBooking({
      courtId: court1.id,
      date: '2026-04-18',
      timeStart: '21:00',
      timeEnd: '22:00',
      playerId: player.id,
    });

    // La reserva se crea pero sin seña
    expect(booking.status).toBe('confirmed');
    expect(booking.deposit_status).toBe('not_required');
    expect(booking.flags?.mp_unavailable).toBe(true);
  });

  it('Si Resend API falla → la reserva se confirma, email se encola para retry', async () => {
    // Mock: Email devuelve error
    emailProvider.mock.rejectWith(new Error('Resend API down'));

    const booking = await bookingService.createManualBooking({
      courtId: court1.id, date: '2026-04-18', timeStart: '21:00', timeEnd: '22:00',
    });

    // La reserva se confirma OK
    expect(booking.status).toBe('confirmed');

    // El email se encoló pero con status 'queued' (no 'sent')
    const notifications = await db.query(
      'SELECT * FROM notifications WHERE booking_id = $1',
      [booking.id]
    );
    expect(notifications.rows[0].status).toBe('queued');
  });
});
```

### 5.3 Tests de SaaS lifecycle

```typescript
// tests/integration/billing-lifecycle.test.ts
describe('SaaS Billing Lifecycle', () => {
  it('Trial expira → tenant pasa a blocked → acceso bloqueado', async () => {
    const tenant = await createTestTenant({
      status: 'trialing',
      trial_ends_at: new Date(Date.now() - 1000), // ya expiró
    });

    // Correr el cron de expiración
    await expireTrialsJob.execute();

    const updated = await getTenant(tenant.id);
    expect(updated.status).toBe('blocked');
  });

  it('Cobro fallido → 3 reintentos → suspended', async () => {
    const tenant = await createTestTenantWithActiveSub();

    // Simular 3 pagos fallidos
    for (let i = 0; i < 3; i++) {
      await simulatePaymentFailed(tenant.id);
    }

    // Después del 3er fallo + grace period
    await dunningJob.execute();

    const updated = await getTenant(tenant.id);
    expect(updated.status).toBe('past_due');

    // Simular que pasan 7 días sin pago
    await advanceTime(7, 'days');
    await suspensionJob.execute();

    const final = await getTenant(tenant.id);
    expect(final.status).toBe('suspended');
  });

  it('Upgrade de plan: prorrateo calculado correctamente', async () => {
    const tenant = await createTestTenantWithPlan('predio', {
      period_start: subDays(new Date(), 16),  // 16 días del ciclo consumidos
      period_end: addDays(new Date(), 14),     // 14 días restantes
    });

    const proration = await billingService.calculateProration(
      tenant.id, 'complejo'
    );

    // 14 días × (precio_complejo_diario - precio_predio_diario)
    expect(proration.days_remaining).toBe(14);
    expect(proration.charge_amount).toBeGreaterThan(0);
  });
});
```

---

## 6. Qué NO Testeamos (y por qué)

> [!NOTE]
> Decir explícitamente qué NO testeamos es tan importante como decir qué sí.
> Previene que alguien gaste 2 días escribiendo tests de bajo valor.

| Cosa que NO testeamos | Por qué |
|---|---|
| **UI pixel-perfect** | Los tests de snapshot visual son frágiles. Un cambio de padding rompe 20 tests sin bug real. Revisión visual manual. |
| **shadcn/ui components internos** | Los testean ellos. Si el `<Dialog>` se abre, funciona. |
| **Edge cases internos de MercadoPago** | MP testea su checkout. Nosotros testeamos que nuestro webhook handler procesa correctamente lo que MP nos envía. |
| **Edge cases internos de Supabase Auth** | Supabase testea que el magic link llega. Nosotros testeamos que al verificar el token, nuestro sistema genera el JWT correcto. |
| **CSS responsive** | Se valida manualmente en 3 dispositivos (iPhone, Android, desktop). No hay tests automatizados de responsive en v1. |
| **Performance benchmarks** | Se miden con Lighthouse y Sentry en producción, no en tests automatizados en v1. Los targets están en Doc 5. |
| **Emails de marketing** | Se testea que el email se encola (integration test). No se testea el rendering del HTML del email. |
| **Flujos de error de red del frontend** | Se valida manualmente (offline, timeout). Los tests e2e asumen red estable. |
| **Supabase Realtime (actualizaciones en vivo)** | Demasiado frágil testear con Playwright. Se valida manualmente que la grilla se actualiza. |
| **Drizzle ORM internals** | Si Drizzle genera el SQL correcto, no es nuestro problema. Testeamos que nuestro service devuelve los datos correctos. |

---

## 7. Strategy de Mocking

### 7.1 Qué se mockea y cuándo

| Dependencia | Unit Tests | Integration Tests | E2E Tests |
|---|---|---|---|
| **Base de datos** | 🟡 Mock del service | ✅ DB real (Supabase local) | ✅ DB real |
| **MercadoPago API** | 🟡 Mock del gateway | 🟡 Mock del gateway | 🟡 Route intercept |
| **Email (Resend)** | 🟡 Mock del provider | 🟡 Mock del provider | 🟡 Mock en backend |
| **Supabase Auth** | 🟡 Mock | 🟡 Mock para login, real para JWT | ✅ Real |
| **pg-boss** | 🟡 Mock del enqueue | ✅ Real (cola en DB de test) | ✅ Real |
| **Date/Time** | ✅ `vi.useFakeTimers()` para expiración | ✅ `vi.useFakeTimers()` | ❌ Tiempo real |

### 7.2 Patrón de mock: dependency injection

```typescript
// modules/payments/mp-gateway.ts
export interface PaymentGateway {
  createPreference(input: PreferenceInput): Promise<PreferenceResult>;
  processWebhook(payload: WebhookPayload): Promise<WebhookResult>;
  createRefund(paymentId: string, amount: number): Promise<RefundResult>;
}

// modules/payments/mp-gateway.implementation.ts
export class MercadoPagoGateway implements PaymentGateway {
  // Implementación real que llama a MP API
}

// tests/mocks/mock-payment-gateway.ts
export class MockPaymentGateway implements PaymentGateway {
  private responses: Map<string, any> = new Map();

  mockCreatePreference(response: PreferenceResult) {
    this.responses.set('createPreference', response);
  }

  async createPreference(input: PreferenceInput): Promise<PreferenceResult> {
    return this.responses.get('createPreference') ?? {
      id: 'mock-preference-id',
      init_point: 'https://mock.mercadopago.com/checkout',
    };
  }

  // ...
}
```

**Regla**: Todos los servicios externos (MP, Resend, Supabase Auth) se acceden mediante **interfaces**. En test, se inyecta la implementación mock. En producción, la real. Esto garantiza que los tests de lógica no dependan de servicios externos.

---

## 8. Datos de Test

### 8.1 Factories

```typescript
// tests/helpers/factories.ts
import { faker } from '@faker-js/faker';

export function buildTenantInput(overrides?: Partial<TenantInput>): TenantInput {
  return {
    name: faker.company.name(),
    slug: faker.helpers.slugify(faker.company.name()).toLowerCase(),
    address: faker.location.streetAddress(),
    city: faker.helpers.arrayElement(['Luján', 'Morón', 'Quilmes', 'La Plata']),
    province: 'Buenos Aires',
    email: faker.internet.email(),
    ...overrides,
  };
}

export function buildBookingInput(overrides?: Partial<BookingInput>): BookingInput {
  return {
    courtId: overrides?.courtId ?? 'test-court-uuid',
    date: overrides?.date ?? '2026-04-17',
    timeStart: overrides?.timeStart ?? '21:00',
    timeEnd: overrides?.timeEnd ?? '22:00',
    type: 'spontaneous',
    ...overrides,
  };
}

export function buildPlayerInput(overrides?: Partial<PlayerInput>): PlayerInput {
  return {
    email: faker.internet.email(),
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    phone: `+549${faker.string.numeric(10)}`,
    ...overrides,
  };
}
```

### 8.2 Seed de datos de test

```typescript
// tests/helpers/seed.ts

export async function seedIsolationData(tenantId: string) {
  await setTenantContext(tenantId);

  // Crear una cancha
  const court = await db.query(`
    INSERT INTO courts (tenant_id, name, surface_type, capacity, status, pricing)
    VALUES ($1, 'Cancha Test', 'synthetic_grass', 10, 'online', $2)
    RETURNING id
  `, [tenantId, JSON.stringify(defaultPricing)]);

  // Crear un booking
  await db.query(`
    INSERT INTO bookings (tenant_id, court_id, date, time_start, time_end, type, status, price_snapshot)
    VALUES ($1, $2, '2026-04-17', '21:00', '22:00', 'spontaneous', 'confirmed', 1200000)
  `, [tenantId, court.rows[0].id]);

  // Crear registros mínimos en las 13 tablas aisladas
  // (necesario para que los tests de isolation verifiquen CADA tabla)
  // ...
}
```

---

## 9. Configuración de Vitest

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',                // No necesitamos DOM
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**'],          // Playwright se corre aparte

    // Coverage (se genera en CI, no en dev local)
    coverage: {
      provider: 'v8',
      include: ['src/modules/**', 'src/shared/**'],
      exclude: [
        'src/modules/**/schema.ts',     // Schemas de Drizzle (no tienen lógica)
        'src/shared/db/migrations/**',  // SQL migrations
        'src/components/**',            // UI components
      ],
      thresholds: {
        // Umbrales pragmáticos — no aspiracionales
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60,
      },
    },

    // Pool: tests de integration corren en secuencia (comparten DB)
    poolOptions: {
      threads: {
        // Unit tests: paralelos
        // Integration tests: secuenciales (comparten state)
      },
    },
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

---

## 10. Pipeline de Testing en CI/CD

### 10.1 Workflow completo

```yaml
# .github/workflows/ci.yml
name: CI
on: [pull_request]

jobs:
  # JOB 1: Checks rápidos (< 30 segundos)
  lint-and-types:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm type-check              # tsc --noEmit

  # JOB 2: Unit tests (< 1 minuto)
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:unit
      - uses: actions/upload-artifact@v4   # Coverage report
        with:
          name: coverage
          path: coverage/

  # JOB 3: Integration tests + Isolation (< 3 minutos)
  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: supabase/postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: turnogol_test
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - run: pnpm install --frozen-lockfile
      - run: pnpm db:migrate:test          # Migrations en DB de test
      - run: pnpm test:integration         # Tests de integration
      - run: pnpm test:isolation           # Tests de isolation (BLOQUEANTE)

  # JOB 4: E2E tests (< 5 minutos) — Solo en PRs a main
  e2e-tests:
    runs-on: ubuntu-latest
    if: github.base_ref == 'main'
    needs: [unit-tests, integration-tests]  # Solo si los anteriores pasaron
    services:
      postgres:
        image: supabase/postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: turnogol_test
        ports: ['5432:5432']
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - run: pnpm install --frozen-lockfile
      - run: npx playwright install --with-deps chromium
      - run: pnpm db:migrate:test
      - run: pnpm db:seed:test
      - run: pnpm test:e2e
      - uses: actions/upload-artifact@v4   # Screenshots/traces de failures
        if: failure()
        with:
          name: e2e-results
          path: test-results/
```

### 10.2 Scripts de package.json

```json
{
  "scripts": {
    "test:unit": "vitest run --dir tests/unit",
    "test:integration": "vitest run --dir tests/integration --exclude tests/integration/isolation.test.ts",
    "test:isolation": "vitest run tests/integration/isolation.test.ts",
    "test:e2e": "playwright test",
    "test": "pnpm test:unit && pnpm test:integration && pnpm test:isolation",
    "test:watch": "vitest --dir tests/unit",
    "test:coverage": "vitest run --coverage"
  }
}
```

### 10.3 Reglas de deploy

```
┌──────────────────────────────────────────────────────┐
│              DEPLOY DECISION MATRIX                   │
│                                                      │
│  lint ✅ + types ✅ + unit ✅ + integration ✅        │
│  + isolation ✅ + e2e ✅                              │
│  ──────────────────────────────────────               │
│  → ✅ DEPLOY PERMITIDO                                │
│                                                      │
│  Cualquier check fallido:                            │
│  → ❌ DEPLOY BLOQUEADO                                │
│                                                      │
│  Especial:                                           │
│  isolation ❌ → 🚨 ALERTA CRÍTICA + DEPLOY BLOQUEADO │
│                  (posible data leak entre tenants)    │
└──────────────────────────────────────────────────────┘
```

---

## 11. Testing en Desarrollo Local

### 11.1 Workflow del developer

```bash
# 1. Escribiendo código nuevo
pnpm test:watch                    # Unit tests en modo watch (instant feedback)

# 2. Antes de hacer push
pnpm test                          # Unit + Integration + Isolation

# 3. Si tocó algo de UI
pnpm test:e2e                     # E2E con Playwright (requiere app corriendo)

# 4. Para ver coverage
pnpm test:coverage                # Genera reporte HTML en coverage/
```

### 11.2 Requisitos para correr tests localmente

```
Unit tests:          pnpm install (solo Node.js)
Integration tests:   pnpm install + Supabase local (Docker)
E2E tests:           pnpm install + Supabase local + app levantada + Playwright browsers

Requisitos de infra local:
  - Docker Desktop (para Supabase local)
  - Node.js 20+
  - pnpm 8+
```

---

## 12. Coverage: Pragmatismo sobre Perfección

### 12.1 Targets de coverage

| Capa | Target | Justificación |
|---|---|---|
| `src/modules/bookings/` | **80%+** | Es el core. Un bug acá afecta dinero y confianza. |
| `src/modules/payments/` | **75%+** | Maneja dinero real (señas, suscripciones). |
| `src/modules/billing/` | **75%+** | Dunning, prorrateo — errores = churn. |
| `src/modules/auth/` | **60%+** | Supabase maneja el grueso; nosotros validamos JWT y permisos. |
| `src/shared/utils/` | **80%+** | Funciones puras reutilizadas por todo el sistema. |
| `src/shared/middleware/` | **60%+** | Tenant context, auth guard — críticos pero simples. |
| `src/modules/notifications/` | **50%+** | Templates y encolado; la API externa se mockea. |
| `src/modules/cashflow/` | **50%+** | CRUD relativamente simple. |
| `src/components/**` | **0%** | No se testean components de UI con Vitest. |

**Coverage global target: 60-70%.** No es aspiracional — es pragmático. Con 1-3 personas, cada hora de testing tiene costo de oportunidad. Los módulos críticos tienen coverage alto; los módulos CRUD tienen coverage moderado; la UI tiene coverage cero.

### 12.2 Lo que coverage NO mide

- Coverage del 100% no garantiza que el software funcione.
- Un test sin assertions no protege nada pero sube el coverage.
- Un test que verifica `expect(result).toBeDefined()` no protege contra un resultado incorrecto.

**Regla**: Cada test debe tener **al menos una assertion que verifique un valor de negocio**, no solo que algo se ejecutó sin error.

---

## 13. Resumen: Mapa Completo de Testing

```
┌────────────────────────────────────────────────────────────────┐
│                  TESTING MAP - TURNOGOL                        │
│                                                                │
│  ┌────────────────────┐                                        │
│  │    UNIT TESTS       │  100-200 tests · Vitest · < 30s      │
│  │                     │                                        │
│  │  • State machines   │  Sin DB, sin red, sin filesystem      │
│  │  • Pricing logic    │  Mocks para dependencias externas     │
│  │  • Date/currency    │  Corren en watch mode en desarrollo   │
│  │  • Zod schemas      │                                        │
│  │  • Cancellation     │                                        │
│  │  • Dunning logic    │                                        │
│  │  • Feature gates    │                                        │
│  └────────────────────┘                                        │
│           │                                                    │
│           ▼                                                    │
│  ┌────────────────────┐                                        │
│  │ INTEGRATION TESTS   │  35-50 tests · Vitest + DB · < 2min  │
│  │                     │                                        │
│  │  🔴 ISOLATION TESTS │  11 tablas × 4 ops = 44 assertions   │
│  │  🔴 CONCURRENCY     │  Double booking, exclusion constraint │
│  │  🟡 BOOKING FLOW    │  Crear → confirmar → completar        │
│  │  🟡 WEBHOOK IDEMP.  │  MP webhook idempotencia              │
│  │  🟡 BILLING CYCLE   │  Trial → active → past_due            │
│  │  🟡 FEATURE GATES   │  Plan limits enforcement               │
│  └────────────────────┘                                        │
│           │                                                    │
│           ▼                                                    │
│  ┌────────────────────┐                                        │
│  │    E2E TESTS        │  7-10 tests · Playwright · < 5min    │
│  │                     │                                        │
│  │  • Onboarding flow  │  Solo happy paths críticos            │
│  │  • Booking (admin)  │  Browser → API → DB → response       │
│  │  • Booking (online) │  MP mock via route intercept          │
│  │  • Auth flow        │  Solo en PRs a main                   │
│  │  • Billing upgrade  │                                        │
│  └────────────────────┘                                        │
│                                                                │
│  ┌────────────────────┐                                        │
│  │  NO TESTEAMOS       │                                        │
│  │                     │                                        │
│  │  ✗ UI pixel-perfect │  Revisión manual                      │
│  │  ✗ MP internals     │  Lo testea MercadoPago                │
│  │  ✗ CSS responsive   │  Validación manual en 3 devices       │
│  │  ✗ Email rendering  │  Se testea que se encola, no cómo ve  │
│  │  ✗ Realtime updates │  Supabase Realtime, validación manual │
│  └────────────────────┘                                        │
│                                                                │
│  PIPELINE CI/CD:                                               │
│  PR → lint ✅ → types ✅ → unit ✅ → integration ✅             │
│  → isolation ✅ (BLOQUEANTE) → e2e ✅ (solo PRs a main)        │
│  → ✅ DEPLOY                                                   │
└────────────────────────────────────────────────────────────────┘
```

> [!CAUTION]
> **Si los tests de isolation fallan, es un incidente de seguridad, no un bug normal.**
> El deploy se bloquea automáticamente y se escala al equipo inmediatamente.
> No se silencia, no se skipea, no se retryea sin investigar la causa.
