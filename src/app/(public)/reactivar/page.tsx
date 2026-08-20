import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { asc, eq } from 'drizzle-orm'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { getStaffRole } from '@/modules/staff/staff.service'
import { getDb, withTenantContext } from '@/shared/db/client'
import { plans } from '@/shared/db/schema'
import { getBillingPayerEmail, getSubscriptionState } from '@/modules/billing/billing.service'
import { listCourts } from '@/modules/courts/court.service'
import {
  ActivatePlanSection,
  type ActivatePlanOption,
} from '@/app/(admin)/settings/facturacion/ActivatePlanSection'
import { CancelSubscriptionSection } from '@/app/(admin)/settings/facturacion/CancelSubscriptionSection'
import { CANCELABLE } from '@/modules/billing/cancelable-statuses'
import { MpPayerEmailSection } from '@/app/(admin)/settings/facturacion/MpPayerEmailSection'
import { updateMpPayerEmailAction } from '@/app/(admin)/settings/facturacion/actions'

// ENS-20: destino del "recovery por UI" del ciclo de dunning
// (past_due → suspended → blocked → churned). Vive fuera de (admin) para
// esquivar su gate (que es justo lo que manda acá a suspended/blocked/churned/
// canceled), pero requiere sesión de staff — no es una página pública.
export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  // Sin el sufijo "— TurnoGol": lo agrega el template `%s · TurnoGol` del layout
  // raíz, y quedaba duplicado (🟡 QA 2026-08-14, mismo caso que /suspended).
  title: 'Reactivar cuenta',
  robots: { index: false, follow: false },
}

/** Estados desde los que billing.service.reactivate() permite pedir un preapproval nuevo. */
const REACTIVATE_ELIGIBLE = new Set(['canceled', 'churned', 'suspended', 'blocked'])

const STATUS_COPY: Record<string, { title: string; description: string }> = {
  past_due: {
    title: 'Tu último pago falló',
    description:
      'Todavía tenés acceso completo al panel (gracia de 7 días). MercadoPago va a reintentar el cobro automáticamente — si el problema persiste, contactá a soporte.',
  },
  suspended: {
    title: 'Tu cuenta está suspendida',
    description:
      'El panel quedó en modo solo lectura por falta de pago: podés ver tus datos, pero no operar (crear reservas, cobrar, etc). Regularizá el pago para volver a operar.',
  },
  blocked: {
    title: 'Tu cuenta está bloqueada',
    description:
      'No tenés acceso al panel por falta de pago prolongada. Reactivá tu plan para recuperar el acceso.',
  },
  churned: {
    title: 'Tu cuenta fue dada de baja',
    description:
      'Por falta de pago prolongada, tu cuenta fue dada de baja. Todavía podés reactivarla y recuperar tus datos antes de que se eliminen.',
  },
  canceled: {
    title: 'Cancelaste tu suscripción',
    description: 'Podés reactivarla cuando quieras y seguir operando con tus datos intactos.',
  },
}

const DEFAULT_COPY = {
  title: 'Tu cuenta necesita atención',
  description: 'Contactá a soporte para regularizar tu cuenta.',
}

function formatDate(d: Date | string): string {
  return new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * Planes activos para el selector de reactivación. `plans` es tabla global sin
 * RLS (CLAUDE.md: "Tablas globales: tenants, players, staff_users, plans...")
 * — se lee del pool restringido sin necesitar `app.current_tenant_id`.
 */
async function loadActivePlans(): Promise<ActivatePlanOption[]> {
  const db = getDb()
  return db
    .select({
      id: plans.id,
      slug: plans.slug,
      name: plans.name,
      maxCourts: plans.maxCourts,
      priceMonthly: plans.priceMonthly,
      priceAnnual: plans.priceAnnual,
    })
    .from(plans)
    .where(eq(plans.isActive, true))
    .orderBy(asc(plans.sortOrder))
}

export default async function ReactivarPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  // Ya regularizado (o todavía en trial): no hay nada que reactivar acá.
  if (tenant.status === 'active' || tenant.status === 'trialing') redirect('/dashboard')

  // Rol SIEMPRE leído de la DB (nunca el claim del JWT — CLAUDE.md).
  const role = await getStaffRole(tenant.id, user.staffUserId)

  if (role !== 'admin') {
    return (
      <section className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-6 py-16 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Cuenta pausada</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Pedile al dueño del complejo que regularice el pago para volver a operar.
        </p>
      </section>
    )
  }

  let sub: Awaited<ReturnType<typeof getSubscriptionState>> | null = null
  try {
    sub = await withTenantContext(tenant.id, (tx) => getSubscriptionState(tenant.id, tx))
  } catch {
    sub = null
  }

  const courts = await withTenantContext(tenant.id, (tx) => listCourts(tenant.id, tx))
  const defaultCourts = courts.length || 3

  const copy = STATUS_COPY[tenant.status] ?? DEFAULT_COPY
  const deadline = sub?.scheduledDeletionAt ?? null
  // Server Component: el cuerpo corre UNA vez por request, en el servidor. La
  // regla del React Compiler apunta a renders de CLIENTE, que se pueden
  // re-ejecutar en cualquier momento — ahí sí una lectura del reloj da
  // resultados distintos entre renders del mismo componente. Acá no.
  // eslint-disable-next-line react-hooks/purity
  const deadlinePassed = deadline ? new Date(deadline).getTime() <= Date.now() : false
  const canReactivate = REACTIVATE_ELIGIBLE.has(tenant.status) && !deadlinePassed

  const activePlans = canReactivate ? await loadActivePlans() : []

  // Con qué cuenta de MercadoPago paga (migr. 078). Va acá y no solo en
  // /settings/facturacion porque el hard-lock del panel deja al dueño
  // suspendido/bloqueado con esta página como única superficie: si el cobro
  // rebota por el email, corregirlo tiene que ser posible SIN salir de acá.
  const payer = await withTenantContext(tenant.id, (tx) => getBillingPayerEmail(tenant.id, tx))

  return (
    <section className="mx-auto flex min-h-[70vh] max-w-4xl flex-col justify-center gap-6 px-6 py-16">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{copy.title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{copy.description}</p>

        {sub && (
          <p className="mt-4 text-sm text-muted-foreground">
            Plan: <span className="font-medium text-foreground">{sub.planName}</span>
          </p>
        )}

        {deadline && (
          <p className="mt-2 text-sm font-semibold text-red-600 dark:text-red-400">
            {deadlinePassed
              ? `El plazo para reactivar venció el ${formatDate(deadline)}.`
              : `Tenés hasta el ${formatDate(deadline)} para reactivar antes de que se eliminen tus datos.`}
          </p>
        )}
      </div>

      {canReactivate && activePlans.length > 0 && (
        <ActivatePlanSection
          plans={activePlans}
          defaultCourts={defaultCourts}
          endpoint="/api/billing/reactivate"
          title="Reactivar plan"
          description="Elegí tu plan para volver a operar."
          ctaLabel="Reactivar plan"
          ctaLoadingLabel="Reactivando…"
        />
      )}

      {canReactivate && activePlans.length > 0 && (
        <MpPayerEmailSection
          currentEmail={payer.override}
          ownerEmail={payer.ownerEmail}
          action={updateMpPayerEmailAction}
        />
      )}

      {(!canReactivate || activePlans.length === 0) && (
        <div className="flex flex-col items-center gap-3 text-center">
          <a
            href="mailto:soporte@turnogol.app"
            className="inline-flex h-11 items-center rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Contactar a soporte
          </a>
          {tenant.status === 'past_due' && (
            <Link
              href="/dashboard"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Volver al panel
            </Link>
          )}
        </div>
      )}

      {/*
        Fix 2 (R2-4 residual): el backend ya acepta `cancel()` para
        `suspended` (`withBillingTenant`, ver `/api/billing/cancel`), pero el
        hard-lock del layout de (admin) saca a TODO `suspended` fuera de
        `/settings/facturacion` — sin esto, un dueño suspendido no tenía
        NINGÚN camino de UI a la baja (Res. 424/2020: la baja debe ser tan
        fácil como el alta). `/reactivar` es la única página que un
        `suspended` sí ve, así que reutiliza `CancelSubscriptionSection` acá
        (gateado por el mismo `CANCELABLE` que usa `/settings/facturacion` —
        nunca se ofrece para `canceled`/`blocked`/`churned`, que no son
        transiciones válidas de `cancel()`).
      */}
      {sub && CANCELABLE.has(sub.status) && (
        <CancelSubscriptionSection
          status={sub.status}
          accessUntil={new Date(sub.currentPeriodEnd).toISOString()}
          context="reactivar"
        />
      )}
    </section>
  )
}
