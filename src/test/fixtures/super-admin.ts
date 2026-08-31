import { daysFromNow, hoursFromNow } from './clock'
import { uid } from './ids'
import { court, courtFutbol7 } from './court'
import { staffManager, staffMember } from './staff'
import { tenant, tenantSettings } from './tenant'

/**
 * Tipos del panel SuperAdmin, A MANO. `dashboard.service.ts` / `tenants.service.ts`
 * / `support.service.ts` son server-only (importan drizzle) y no tienen un
 * `*.types.ts` propio — ni siquiera `import type` de ahí es seguro para
 * `src/test/**\/*.ts` (el override de `.eslintrc.json` bloquea el módulo
 * completo, no solo los imports de VALOR). Mismo patrón que `staff.ts`: shape
 * copiado a mano de la fuente real, documentado por función.
 */

export type SaTenantStatus =
  'trialing' | 'active' | 'past_due' | 'suspended' | 'blocked' | 'canceled' | 'churned' | 'deleted'

/** Los 8 estados de `tenant_status`, en el orden del FSM (doc4 §2). */
export const SA_TENANT_STATUSES: readonly SaTenantStatus[] = [
  'trialing',
  'active',
  'past_due',
  'suspended',
  'blocked',
  'canceled',
  'churned',
  'deleted',
]

export type SaBillingCycle = 'monthly' | 'annual'
export type SaSubscriptionStatus = Exclude<SaTenantStatus, 'deleted'>

// ─── Dashboard global (dashboard.service.ts → DashboardData) ─────────────────

export type SaExpiringTrial = { id: string; name: string; slug: string; trialEndsAt: Date }
export type SaRecentSignup = {
  id: string
  name: string
  slug: string
  status: SaTenantStatus
  createdAt: Date
}
export type SaRecentWebhook = {
  id: string
  mpEventId: string
  eventType: string
  processedAt: Date
}
export type SaQueueDepthEntry = { queue: string; depth: number | null; error?: 'unavailable' }

/** Embudo de onboarding (Fase 7 del plan de refactor → `OnboardingFunnelData`). */
export type SaOnboardingFunnelData = {
  windowDays: number
  startedViews: number
  stepCompleted: { step: number; stepName: string; tenants: number }[]
  completedTenants: number
  firstBookingInWizard: number
  linkShared: number
  mpConnected: number
  activationEvents: number
  medianDaysToActivation: number | null
}

export type SaDashboardData = {
  mrrCents: number
  tenantsByStatus: Record<SaTenantStatus, number>
  expiringTrials: SaExpiringTrial[]
  recentSignups: SaRecentSignup[]
  signupsLast7Days: number
  queues: SaQueueDepthEntry[]
  recentWebhooks: SaRecentWebhook[]
  onboardingFunnel: SaOnboardingFunnelData
}

/** Las colas activas de pg-boss (`shared/jobs/dlq.ts` → ALL_QUEUES), copiadas a mano. */
export const SA_QUEUES: readonly string[] = [
  'process-mp-webhook',
  'generate-abonado-slots',
  'send-email',
  'expire-trials',
  'auto-complete-bookings',
  'dunning-retry',
  'data-retention-cleanup',
  'expire-pending-booking',
  'expire-pending-booking-sweep',
  'refresh-mp-tokens',
  'reconcile-pending-payments',
  'push-send',
  'health-ping',
  'onboarding-abandonment-sweep',
]

const ZERO_BY_STATUS: Record<SaTenantStatus, number> = {
  trialing: 0,
  active: 0,
  past_due: 0,
  suspended: 0,
  blocked: 0,
  canceled: 0,
  churned: 0,
  deleted: 0,
}

/** Embudo con caída típica: 1→2→3→4 decreciente, algo de activación. */
export const onboardingFunnelData = (
  overrides: Partial<SaOnboardingFunnelData> = {},
): SaOnboardingFunnelData => ({
  windowDays: 30,
  startedViews: 22,
  stepCompleted: [
    { step: 1, stepName: 'Tu complejo', tenants: 15 },
    { step: 2, stepName: 'Horarios', tenants: 13 },
    { step: 3, stepName: 'Canchas', tenants: 10 },
    { step: 4, stepName: 'Primera reserva', tenants: 9 },
  ],
  completedTenants: 9,
  firstBookingInWizard: 6,
  linkShared: 8,
  mpConnected: 4,
  activationEvents: 5,
  medianDaysToActivation: 1.5,
  ...overrides,
})

/** Sin actividad de onboarding en la ventana: cada paso en cero. */
export const onboardingFunnelDataEmpty = (): SaOnboardingFunnelData =>
  onboardingFunnelData({
    startedViews: 0,
    stepCompleted: [
      { step: 1, stepName: 'Tu complejo', tenants: 0 },
      { step: 2, stepName: 'Horarios', tenants: 0 },
      { step: 3, stepName: 'Canchas', tenants: 0 },
      { step: 4, stepName: 'Primera reserva', tenants: 0 },
    ],
    completedTenants: 0,
    firstBookingInWizard: 0,
    linkShared: 0,
    mpConnected: 0,
    activationEvents: 0,
    medianDaysToActivation: null,
  })

/** Dashboard con datos representativos: MRR real, colas OK, algo de todo. */
export const dashboardData = (overrides: Partial<SaDashboardData> = {}): SaDashboardData => ({
  mrrCents: 45_600_000,
  tenantsByStatus: {
    ...ZERO_BY_STATUS,
    trialing: 4,
    active: 18,
    past_due: 2,
    suspended: 1,
    canceled: 3,
    churned: 1,
  },
  expiringTrials: [
    {
      id: uid(7001),
      name: 'Canchas del Sur',
      slug: 'canchas-del-sur',
      trialEndsAt: daysFromNow(3),
    },
    {
      id: uid(7002),
      name: 'Polideportivo Once',
      slug: 'polideportivo-once',
      trialEndsAt: daysFromNow(6),
    },
  ],
  recentSignups: [
    {
      id: uid(7003),
      name: 'Fútbol Norte',
      slug: 'futbol-norte',
      status: 'trialing',
      createdAt: hoursFromNow(-20),
    },
    {
      id: uid(7004),
      name: 'La Redonda FC',
      slug: 'la-redonda-fc',
      status: 'active',
      createdAt: daysFromNow(-2),
    },
  ],
  signupsLast7Days: 6,
  queues: SA_QUEUES.map((queue, i) => ({ queue, depth: i % 5 === 0 ? 0 : i })),
  recentWebhooks: [
    {
      id: uid(7005),
      mpEventId: 'mp-evt-99231',
      eventType: 'payment.updated',
      processedAt: hoursFromNow(-1),
    },
    {
      id: uid(7006),
      mpEventId: 'mp-evt-99187',
      eventType: 'subscription_preapproval',
      processedAt: hoursFromNow(-5),
    },
  ],
  onboardingFunnel: onboardingFunnelData(),
  ...overrides,
})

/** Plataforma recién lanzada: todo en cero, ninguna sección tiene datos. */
export const dashboardDataEmpty = (): SaDashboardData =>
  dashboardData({
    mrrCents: 0,
    tenantsByStatus: { ...ZERO_BY_STATUS },
    expiringTrials: [],
    recentSignups: [],
    signupsLast7Days: 0,
    recentWebhooks: [],
    onboardingFunnel: onboardingFunnelDataEmpty(),
  })

/** pg-boss no pudo arrancar: `getQueueDepthsSafe` degrada cada cola a "no disponible". */
export const dashboardDataQueuesDown = (): SaDashboardData =>
  dashboardData({
    queues: SA_QUEUES.map((queue) => ({ queue, depth: null, error: 'unavailable' as const })),
  })

// ─── Lista de tenants (tenants.service.ts → TenantList / PlanSummary) ────────

export type SaTenantListRow = {
  id: string
  name: string
  slug: string
  email: string
  status: SaTenantStatus
  trialEndsAt: Date | null
  createdAt: Date
  planName: string | null
  planSlug: string | null
  billingCycle: SaBillingCycle | null
  subscriptionStatus: SaSubscriptionStatus | null
  mrrCents: number
}

export type SaTenantList = {
  rows: SaTenantListRow[]
  total: number
  page: number
  pageSize: number
}

export type SaPlanSummary = {
  id: string
  slug: string
  name: string
  maxCourts: number | null
  priceMonthly: number
  priceAnnual: number
}

/** Los 3 planes SaaS vigentes (migr. 043 / CLAUDE.md): Predio/Complejo/Estadio. */
export const planSummaries = (): SaPlanSummary[] => [
  {
    id: uid(7010),
    slug: 'predio',
    name: 'Predio',
    maxCourts: 2,
    priceMonthly: 5_500_000,
    priceAnnual: 52_800_000,
  },
  {
    id: uid(7011),
    slug: 'complejo',
    name: 'Complejo',
    maxCourts: 5,
    priceMonthly: 8_500_000,
    priceAnnual: 81_600_000,
  },
  {
    id: uid(7012),
    slug: 'estadio',
    name: 'Estadio',
    maxCourts: null,
    priceMonthly: 11_500_000,
    priceAnnual: 110_400_000,
  },
]

export const tenantListRow = (overrides: Partial<SaTenantListRow> = {}): SaTenantListRow => ({
  id: uid(7020),
  name: 'Complejo Fénix',
  slug: 'complejo-fenix',
  email: 'contacto@complejofenix.com.ar',
  status: 'active',
  trialEndsAt: null,
  createdAt: daysFromNow(-180),
  planName: 'Complejo',
  planSlug: 'complejo',
  billingCycle: 'monthly',
  subscriptionStatus: 'active',
  mrrCents: 8_500_000,
  ...overrides,
})

/** Fila de una lista variada: activo, trial, moroso y sin suscripción — cubre las 4 formas del badge/MRR. */
export const tenantListRows = (): SaTenantListRow[] => [
  tenantListRow(),
  tenantListRow({
    id: uid(7021),
    name: 'Canchas del Sur',
    slug: 'canchas-del-sur',
    email: 'hola@canchasdelsur.com.ar',
    status: 'trialing',
    trialEndsAt: daysFromNow(9),
    createdAt: daysFromNow(-5),
    planName: 'Predio',
    planSlug: 'predio',
    billingCycle: 'monthly',
    subscriptionStatus: 'trialing',
    mrrCents: 0,
  }),
  tenantListRow({
    id: uid(7022),
    name: 'Polideportivo Belgrano',
    slug: 'polideportivo-belgrano',
    email: 'admin@polideportivobelgrano.com.ar',
    status: 'past_due',
    createdAt: daysFromNow(-320),
    planName: 'Estadio',
    planSlug: 'estadio',
    billingCycle: 'annual',
    subscriptionStatus: 'past_due',
    mrrCents: 0,
  }),
  tenantListRow({
    id: uid(7023),
    name: 'Fútbol 5 La Loma',
    slug: 'futbol-5-la-loma',
    email: 'contacto@lalomafutbol5.com.ar',
    status: 'canceled',
    createdAt: daysFromNow(-500),
    planName: null,
    planSlug: null,
    billingCycle: null,
    subscriptionStatus: 'canceled',
    mrrCents: 0,
  }),
]

export const tenantList = (overrides: Partial<SaTenantList> = {}): SaTenantList => ({
  rows: tenantListRows(),
  total: tenantListRows().length,
  page: 1,
  pageSize: 20,
  ...overrides,
})

export const tenantListEmpty = (): SaTenantList => ({ rows: [], total: 0, page: 1, pageSize: 20 })

// ─── Detalle de tenant (tenants.service.ts → TenantDetail) ───────────────────

export type SaTenantDetail = {
  tenant: {
    id: string
    slug: string
    name: string
    description: string | null
    address: string
    city: string
    province: string
    phone: string
    email: string
    status: SaTenantStatus
    marketplaceVisible: boolean
    trialEndsAt: Date | null
    scheduledDeletionAt: Date | null
    mpConnectedAt: Date | null
    createdAt: Date
    /** Shape completo real: `tenantSettings()` de `./tenant` (mismo `TenantSettings` que usa el admin). */
    settings: ReturnType<typeof tenantSettings>
  }
  subscription: {
    status: SaSubscriptionStatus
    planId: string
    planName: string | null
    planSlug: string | null
    priceMonthly: number | null
    priceAnnual: number | null
    billingCycle: SaBillingCycle
    currentPeriodStart: Date
    currentPeriodEnd: Date
    mpSubscriptionId: string | null
    pendingPlanChange: string | null
    pendingChangeAt: Date | null
    canceledAt: Date | null
    cancellationReason: string | null
    scheduledDeletionAt: Date | null
    dunningStartedAt: Date | null
    lastPaymentAt: Date | null
    lastPaymentFailedAt: Date | null
  } | null
  courts: Array<{
    id: string
    name: string
    status: 'online' | 'offline'
    surfaceType: string
    format: number
    capacity: number
  }>
  staff: Array<{
    id: string
    email: string
    firstName: string
    lastName: string
    role: 'admin' | 'manager'
    isActive: boolean
    lastLoginAt: Date | null
  }>
}

const t = tenant()

type SaSubscription = NonNullable<SaTenantDetail['subscription']>

/** Suscripción activa por defecto, plan Complejo — base reusada por las variantes. */
const subscriptionDefault = (overrides: Partial<SaSubscription> = {}): SaSubscription => ({
  status: 'active',
  planId: uid(7011),
  planName: 'Complejo',
  planSlug: 'complejo',
  priceMonthly: 8_500_000,
  priceAnnual: 81_600_000,
  billingCycle: 'monthly',
  currentPeriodStart: daysFromNow(-10),
  currentPeriodEnd: daysFromNow(20),
  mpSubscriptionId: 'mp-preapproval-5544332211',
  pendingPlanChange: null,
  pendingChangeAt: null,
  canceledAt: null,
  cancellationReason: null,
  scheduledDeletionAt: null,
  dunningStartedAt: null,
  lastPaymentAt: daysFromNow(-10),
  lastPaymentFailedAt: null,
  ...overrides,
})

const tenantDefault = (): SaTenantDetail['tenant'] => ({
  id: t.id,
  slug: t.slug,
  name: t.name,
  description: t.description,
  address: t.address,
  city: t.city,
  province: t.province,
  phone: t.phone,
  email: t.email,
  status: 'active',
  marketplaceVisible: true,
  trialEndsAt: null,
  scheduledDeletionAt: null,
  mpConnectedAt: daysFromNow(-180),
  createdAt: daysFromNow(-200),
  settings: tenantSettings(),
})

/** Tenant activo, con suscripción al día, canchas y staff cargados. */
export const tenantDetail = (overrides: Partial<SaTenantDetail> = {}): SaTenantDetail => ({
  tenant: tenantDefault(),
  subscription: subscriptionDefault(),
  courts: [court(), courtFutbol7()].map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    surfaceType: c.surfaceType,
    format: c.format,
    capacity: c.capacity,
  })),
  staff: [staffMember(), staffManager()],
  ...overrides,
})

/** Complejo en trial, sin suscripción todavía (fila `tenant_subscriptions` no existe). */
export const tenantDetailTrialing = (): SaTenantDetail =>
  tenantDetail({
    tenant: {
      ...tenantDefault(),
      id: uid(7030),
      slug: 'canchas-del-sur',
      name: 'Canchas del Sur',
      status: 'trialing',
      trialEndsAt: daysFromNow(9),
      mpConnectedAt: null,
      createdAt: daysFromNow(-5),
      settings: tenantSettings({ onboarding_completed: false, onboarding_step: 2 }),
    },
    subscription: null,
    courts: [],
    staff: [staffMember({ id: uid(7031), staffUserId: uid(7031) })],
  })

/** Complejo moroso con dunning en curso y eliminación programada — estado destructivo cerca. */
export const tenantDetailPastDue = (): SaTenantDetail =>
  tenantDetail({
    tenant: {
      ...tenantDefault(),
      id: uid(7032),
      slug: 'polideportivo-belgrano',
      name: 'Polideportivo Belgrano',
      status: 'past_due',
    },
    subscription: subscriptionDefault({
      status: 'past_due',
      currentPeriodEnd: daysFromNow(-9),
      dunningStartedAt: daysFromNow(-9),
      lastPaymentFailedAt: daysFromNow(-9),
      lastPaymentAt: daysFromNow(-39),
    }),
  })

/** Complejo cancelado, con eliminación programada — cubre el aviso rojo del ResumenTab. */
export const tenantDetailScheduledForDeletion = (): SaTenantDetail =>
  tenantDetail({
    tenant: {
      ...tenantDefault(),
      id: uid(7033),
      slug: 'futbol-5-la-loma',
      name: 'Fútbol 5 La Loma',
      status: 'canceled',
      scheduledDeletionAt: daysFromNow(5),
    },
    subscription: subscriptionDefault({
      status: 'canceled',
      canceledAt: daysFromNow(-25),
      cancellationReason: 'El complejo cerró temporalmente por obras.',
      scheduledDeletionAt: daysFromNow(5),
    }),
  })

// ─── Actividad (tenants.service.ts → TenantActivity) ─────────────────────────

export type SaAuditLogRow = {
  id: string
  action: string
  actorType: 'staff' | 'player' | 'system'
  actorId: string
  resourceType: string
  resourceId: string
  metadata: Record<string, unknown> | null
  createdAt: Date
}

export type SaRecentBookingRow = {
  id: string
  date: Date
  timeStart: string
  timeEnd: string
  status: string
  courtName: string | null
  priceSnapshot: number
  createdAt: Date
}

export type SaTenantActivity = {
  logs: SaAuditLogRow[]
  totalLogs: number
  page: number
  pageSize: number
  recentBookings: SaRecentBookingRow[]
}

export const auditLogRow = (overrides: Partial<SaAuditLogRow> = {}): SaAuditLogRow => ({
  id: uid(7101),
  action: 'support.tenant.trial_extended',
  actorType: 'system',
  actorId: uid(7100),
  resourceType: 'tenant',
  resourceId: t.id,
  metadata: {
    days: 7,
    before: { trialEndsAt: null },
    after: { trialEndsAt: daysFromNow(9).toISOString() },
  },
  createdAt: hoursFromNow(-2),
  ...overrides,
})

export const tenantActivity = (overrides: Partial<SaTenantActivity> = {}): SaTenantActivity => ({
  logs: [
    auditLogRow(),
    auditLogRow({
      id: uid(7102),
      action: 'support.impersonation.started',
      createdAt: hoursFromNow(-26),
      metadata: { impersonated_tenant_id: t.id, system_admin_email: 'soporte@turnogol.app' },
    }),
    auditLogRow({
      id: uid(7103),
      action: 'booking.created',
      actorType: 'player',
      actorId: uid(7104),
      resourceType: 'booking',
      resourceId: uid(1001),
      metadata: null,
      createdAt: daysFromNow(-1),
    }),
  ],
  totalLogs: 3,
  page: 1,
  pageSize: 25,
  recentBookings: [
    {
      id: uid(1001),
      date: daysFromNow(-1),
      timeStart: '18:00',
      timeEnd: '19:00',
      status: 'completed',
      courtName: 'Cancha 1',
      priceSnapshot: 1_300_000,
      createdAt: daysFromNow(-3),
    },
    {
      id: uid(1002),
      date: daysFromNow(1),
      timeStart: '21:00',
      timeEnd: '22:00',
      status: 'confirmed',
      courtName: 'Cancha 2',
      priceSnapshot: 1_500_000,
      createdAt: hoursFromNow(-4),
    },
  ],
  ...overrides,
})

export const tenantActivityEmpty = (): SaTenantActivity => ({
  logs: [],
  totalLogs: 0,
  page: 1,
  pageSize: 25,
  recentBookings: [],
})

/** Segunda página del audit trail — para storear la paginación (page 2 de 2). */
export const tenantActivityPage2 = (): SaTenantActivity =>
  tenantActivity({
    logs: [
      auditLogRow({
        id: uid(7105),
        action: 'support.tenant.settings_updated',
        createdAt: daysFromNow(-40),
      }),
    ],
    totalLogs: 26,
    page: 2,
    pageSize: 25,
  })

// ─── Panel de acciones de soporte (support-actions/constants.ts → SupportPanelSettings) ──

export type SaSupportPanelSettings = {
  requires_deposit: boolean
  deposit_percentage: number
  accepts_cash: boolean
  accepts_transfer: boolean
  accepts_mercadopago: boolean
  allow_online_booking: boolean
  booking_advance_days: number
  auto_complete_minutes: number
}

export const supportPanelSettings = (
  overrides: Partial<SaSupportPanelSettings> = {},
): SaSupportPanelSettings => ({
  requires_deposit: true,
  deposit_percentage: 30,
  accepts_cash: true,
  accepts_transfer: true,
  accepts_mercadopago: true,
  allow_online_booking: true,
  booking_advance_days: 6,
  auto_complete_minutes: 90,
  ...overrides,
})
