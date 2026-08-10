'use server'

import { z } from 'zod'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { eq, sql } from 'drizzle-orm'
import { signInWithPlayerMagicLink } from '@/modules/auth/auth.service'
import { sanitizeNext } from '@/lib/safe-redirect'
import { getDb, withPlayerContext } from '@/shared/db/client'
import { tenants } from '@/shared/db/schema'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { enforce, parseClientIp } from '@/shared/rate-limit'
import { createOnlineBooking } from '@/modules/bookings/booking.service'
import { endLabelFromMins } from '@/shared/time/operating-day'
import { createDepositPayment } from '@/modules/payments/payment.service'
import { resolveTenantGateway } from '@/modules/payments/mp-oauth'
import {
  BookingDateOutOfRangeError,
  BookingValidationError,
  CourtOfflineError,
  PlayerBannedError,
  PriceUnavailableError,
  SlotTakenError,
  TooManyActiveHoldsError,
} from '@/modules/bookings/booking.errors'
import type { TenantSettings } from '@/modules/tenants/tenant.types'
import { isValidCalendarDate } from '@/shared/validation/calendar-date'
import { CURRENT_TERMS_VERSION } from '@/shared/terms'
import { echoFields, echoChecked } from '@/shared/forms/echo'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const gateSchema = z.object({
  // Zod 4: los validadores de formato son top-level (`z.email()`), y encadenarlos
  // DESPUÉS de las transformaciones invierte el orden — `z.email().trim()` valida
  // el formato ANTES de trimear, así que un email con un espacio de más falla.
  // `.pipe()` mantiene la semántica de v3: normalizar primero, validar después.
  email: z.string().trim().toLowerCase().pipe(z.email({ message: 'Ingresá un email válido' })),
  firstName: z.string().trim().min(1, 'Ingresá tu nombre').max(80),
  lastName: z.string().trim().max(80).optional().default(''),
  terms: z.literal('on', { error: 'Tenés que aceptar los términos.' }),
  next: z.string(),
})

/** Lo tipeado vuelve al form en cada error; sin esto se pierde (no hay defaultValue). */
const GATE_ECHO = ['email', 'firstName', 'lastName'] as const
type GateValues = Partial<Record<(typeof GATE_ECHO)[number], string>> & { terms?: boolean }

export type GateState =
  | { status: 'idle' }
  | { status: 'sent'; email: string }
  | { status: 'error'; message: string; values?: GateValues }

export async function sendPlayerMagicLink(_prev: GateState, formData: FormData): Promise<GateState> {
  // El jugador que se olvida de tildar el +18 perdía nombre, apellido y email.
  const values: GateValues = {
    ...echoFields(formData, GATE_ECHO),
    terms: echoChecked(formData, 'terms'),
  }
  const parsed = gateSchema.safeParse({
    email: formData.get('email'),
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    terms: formData.get('terms'),
    next: formData.get('next'),
  })
  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Datos inválidos.', values }
  }

  // authMagicLink (5/60s per email): same defense as staff loginAction — stops
  // a player's inbox being flooded with magic-link emails.
  const rl = await enforce('authMagicLink', parsed.data.email)
  if (!rl.ok) {
    return { status: 'error', message: 'Demasiados intentos. Esperá un minuto y probá de nuevo.', values }
  }

  const origin = (await headers()).get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
  const safeNext = sanitizeNext(parsed.data.next, '/mis-reservas')
  const redirectTo = `${origin}/api/auth/callback?next=${encodeURIComponent(safeNext)}`

  const result = await signInWithPlayerMagicLink(parsed.data.email, redirectTo, {
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    agreedTerms: true,
    termsVersion: CURRENT_TERMS_VERSION,
  })
  if (!result.ok) return { status: 'error', message: 'No pudimos enviar el email. Probá de nuevo.', values }
  return { status: 'sent', email: parsed.data.email }
}

const BLOCKED = ['deleted', 'blocked', 'canceled', 'churned', 'suspended']

function addMins(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = (h! * 60 + (m ?? 0)) + mins
  // El slot que termina en la medianoche calendario se guarda '24:00' (> '23:00'
  // → pasa chk_time_valid); las madrugadas vuelven a 01:00, 02:00…
  return endLabelFromMins(total)
}

export async function createBookingAndCheckout(formData: FormData): Promise<void> {
  const slug = String(formData.get('slug') ?? '')
  const court = String(formData.get('court') ?? '')
  const date = String(formData.get('date') ?? '')
  const time = String(formData.get('time') ?? '')
  const dur = Number(formData.get('dur') ?? '60') as 60 | 120
  const backTo = `/${slug}/reservar?court=${court}&date=${date}&time=${time}&dur=${dur}`

  // Basic format guard: the form should always send a valid date, but protect
  // against direct FormData manipulation before reaching the service validation.
  if (!isValidCalendarDate(date)) redirect(`${backTo}&error=invalid_date`)

  const user = await extractAuthUser()
  if (!user || user.type !== 'player') redirect(`/${slug}/reservar?court=${court}&date=${date}&time=${time}&dur=${dur}`)

  // publicBookingCreate (5/60s por ip+tenant): defensa de Denial-of-Inventory —
  // cubre el caso de múltiples cuentas de jugador desde el mismo origen contra
  // EL MISMO tenant, que playerBooking (por player_id) no ve. Key compuesta
  // (no solo IP) para no compartir bucket entre tenants distintos desde la
  // misma IP. INV-ABUSE-001 (hardening post security-review).
  const ip = parseClientIp(await headers())
  const ipRl = await enforce('publicBookingCreate', `${ip}:${slug}`)
  if (!ipRl.ok) redirect(`${backTo}&error=rate_limited`)

  // playerBooking (20/60s per player): caps online-booking + MP-preference spam
  // from a single authenticated player (the public booking path, separate from
  // the /api/player/bookings route which is already guarded).
  const rl = await enforce('playerBooking', user!.playerId)
  if (!rl.ok) redirect(`${backTo}&error=rate_limited`)

  const db = getDb()
  const tRows = await db
    .select({ id: tenants.id, status: tenants.status, settings: tenants.settings, mpAccessToken: tenants.mpAccessToken })
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1)
  const tenant = tRows[0]
  if (!tenant || BLOCKED.includes(tenant.status)) redirect(`/${slug}`)

  const settings = tenant!.settings as TenantSettings
  const timeEnd = addMins(time, dur)

  // Método de pago presencial elegido por el jugador. Solo aplica sin seña
  // (con seña el flujo MP setea payment_method='mercadopago' vía webhook P10)
  // y solo si el complejo lo acepta — re-validamos server-side: el form puede
  // venir manipulado.
  const withDeposit = settings.requires_deposit && settings.deposit_percentage > 0
  const payRaw = String(formData.get('pay') ?? '')
  const paymentMethod: 'cash' | 'transfer' | undefined = withDeposit
    ? undefined
    : payRaw === 'cash' && (settings.accepts_cash ?? true)
      ? 'cash'
      : payRaw === 'transfer' && (settings.accepts_transfer ?? true)
        ? 'transfer'
        : undefined

  let redirectTo: string
  try {
    const booking = await withPlayerContext(user!.playerId, async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenant!.id}, true)`)
      return createOnlineBooking(
        tenant!.id,
        {
          playerId: user!.playerId,
          courtId: court,
          date,
          timeStart: time,
          timeEnd,
          requiresDeposit: settings.requires_deposit,
          depositPercentage: settings.deposit_percentage,
          maxAdvanceDays: settings.booking_advance_days ?? 6,
          ...(paymentMethod ? { paymentMethod } : {}),
        },
        tx,
      )
    })

    if (booking.status === 'confirmed') {
      redirectTo = `/reserva/${booking.id}/exito`
    } else {
      if (!tenant!.mpAccessToken) {
        redirectTo = `/reserva/${booking.id}/pendiente`
      } else {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
        const gateway = resolveTenantGateway(tenant!.id, tenant!.mpAccessToken)
        const pref = await createDepositPayment(booking.id, gateway, tenant!.id, appUrl)
        redirectTo = pref.initPoint
      }
    }
  } catch (err) {
    if (err instanceof BookingValidationError) redirect(`${backTo}&error=unavailable`)
    if (err instanceof BookingDateOutOfRangeError) redirect(`${backTo}&error=date_out_of_range`)
    if (err instanceof SlotTakenError) redirect(`${backTo}&error=slot_taken`)
    if (err instanceof PlayerBannedError) {
      const untilParam = err.until ? `&until=${encodeURIComponent(err.until.toISOString())}` : ''
      // R3-5: el `reason` YA NO viaja por la URL (antes permitía fabricar
      // URLs con texto arbitrario mostrado en un dominio legítimo —
      // ingeniería social — y lo filtraba a logs/analytics/referrers). El
      // query param solo lleva el flag; `page.tsx` relee el motivo real de
      // DB server-side vía `getActiveBanReason` cuando hay sesión de jugador
      // válida (ver CheckoutStates.tsx).
      redirect(`${backTo}&error=banned${untilParam}`)
    }
    if (err instanceof TooManyActiveHoldsError) redirect(`${backTo}&error=too_many_holds`)
    if (err instanceof CourtOfflineError || err instanceof PriceUnavailableError) redirect(`${backTo}&error=unavailable`)
    throw err
  }

  redirect(redirectTo)
}

export async function retryDepositPaymentAction(formData: FormData): Promise<void> {
  const bookingId = String(formData.get('bookingId') ?? '')
  if (!UUID_RE.test(bookingId)) redirect('/')

  const user = await extractAuthUser()
  if (!user || user.type !== 'player') redirect('/ingresar')

  const rl = await enforce('playerBooking', user.playerId)
  if (!rl.ok) redirect(`/reserva/${bookingId}/error`)

  // Load booking player-scoped to verify ownership
  const bookingRow = await withPlayerContext(user.playerId, async (tx) => {
    const rows = (await tx.execute(sql`
      SELECT b.status, b.player_id AS "playerId", b.tenant_id AS "tenantId"
      FROM bookings b
      WHERE b.id = ${bookingId} LIMIT 1
    `)) as unknown as Array<{ status: string; playerId: string | null; tenantId: string }>
    return rows[0] ?? null
  })

  if (!bookingRow || bookingRow.playerId !== user.playerId) redirect('/')

  if (bookingRow.status !== 'pending_payment') {
    // Already resolved (webhook landed while player was on error page)
    redirect(`/reserva/${bookingId}/exito`)
  }

  const tenantId = bookingRow.tenantId

  const db = getDb()
  const tRows = await db
    .select({ mpAccessToken: tenants.mpAccessToken })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)

  const mpAccessToken = tRows[0]?.mpAccessToken ?? null
  if (!mpAccessToken) {
    // No gateway configured — drop player to pending watcher
    redirect(`/reserva/${bookingId}/pendiente`)
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const gateway = resolveTenantGateway(tenantId, mpAccessToken)
  // Re-invoking createDepositPayment is safe: payments has no UNIQUE on
  // (booking_id, type); a second pending row is allowed and bookings.payment_id
  // will be updated to the newer payment row.
  const pref = await createDepositPayment(bookingId, gateway, tenantId, appUrl)

  redirect(pref.initPoint)
}
