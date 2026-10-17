'use server'

import { z } from 'zod'
import { headers, cookies } from 'next/headers'
import { redirect, RedirectType } from 'next/navigation'
import { eq, sql } from 'drizzle-orm'
import { signInWithPlayerMagicLink, signInWithGooglePlayer } from '@/modules/auth/auth.service'
import {
  buildGoogleTermsCookie,
  GOOGLE_TERMS_COOKIE_NAME,
  GOOGLE_TERMS_COOKIE_TTL_MS,
} from '@/shared/security/google-terms-cookie'
import {
  BOOKING_INTENT_COOKIE_NAME,
  BOOKING_INTENT_COOKIE_TTL_MS,
  checkBookingIntent,
  signCookieBookingIntent,
  signEmailBookingIntent,
  type BookingIntentFields,
} from '@/shared/security/booking-intent'
import { isBookingPath } from '@/lib/auth-success'
import { sanitizeNext } from '@/lib/safe-redirect'
import { track } from '@/shared/observability'
import { captureMessage } from '@/lib/sentry'
import { getDb, withPlayerContext, withTenantContext } from '@/shared/db/client'
import { tenants, tenantSubscriptions } from '@/shared/db/schema'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { enforce, parseClientIp } from '@/shared/rate-limit'
import { createOnlineBooking } from '@/modules/bookings/booking.service'
import { findOwnLiveBookingOrNull } from './own-booking'
import { SLOT_DURATION_MINUTES } from '@/shared/constants'
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
import { isPublicPortalOpen, publicBookingAdvanceDays } from '@/modules/tenants/tenant.lifecycle'
import type { TenantSettings } from '@/modules/tenants/tenant.types'
import { bookingMinAdvanceHours } from '@/modules/tenants/tenant.utils'
import { isValidCalendarDate } from '@/shared/validation/calendar-date'
import { hhmm, isUuid, slug as slugSchema } from '@/shared/validation/primitives'
import { CURRENT_TERMS_VERSION, TERMS_REQUIRED_MESSAGE } from '@/shared/terms'
import { echoFields } from '@/shared/forms/echo'
import { FORMAT_OPTIONS } from '@/components/public/courtFacets'
import {
  BOOKING_INTENT_PARAM,
  PAY_METHODS,
  buildReservaHref,
  buildReservarHref,
  parseFormato,
  parsePay,
} from '@/lib/booking/reserve-url'
import { holdAllowsRetry } from '@/lib/booking/hold'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * De un `next` ya saneado a lo que se va a reservar, o `null` si no es una reserva completa y
 * válida (complejo, cancha UUID, día real, HH:MM, duración del turno). Es lo que se FIRMA en el
 * vínculo de intención y con lo que se REARMA el `next`: lo que sobre en la URL (utm, un
 * `booking_intent` forjado, un formato inventado) no viaja. Nunca lanza.
 */
function parseBookingNext(
  next: string,
): { fields: BookingIntentFields; formato: number | null } | null {
  if (!isBookingPath(next)) return null
  let url: URL
  try {
    url = new URL(next, 'http://localhost')
  } catch {
    return null
  }
  const slug = url.pathname.split('/')[1] ?? ''
  const q = url.searchParams
  const court = q.get('court') ?? ''
  const date = q.get('date') ?? ''
  const time = q.get('time') ?? ''
  const dur = Number(q.get('dur'))
  if (
    !slugSchema.safeParse(slug).success ||
    !isUuid(court) ||
    !isValidCalendarDate(date) ||
    !hhmm.safeParse(time).success ||
    dur !== SLOT_DURATION_MINUTES
  ) {
    return null
  }
  return {
    fields: { slug, court, date, time, dur, pay: parsePay(q.get('pay'), PAY_METHODS) },
    formato: parseFormato(q.get('formato'), FORMAT_OPTIONS),
  }
}

/**
 * El `next` del magic link con el vínculo de intención, ligado al email que se escribió. Si no es
 * una reserva válida, o no se puede firmar (sin secreto, y se avisa), el `next` va como siempre y
 * el jugador confirma a mano: degradar, nunca romper el ingreso.
 */
function nextWithBookingIntent(safeNext: string, email: string): string {
  const target = parseBookingNext(safeNext)
  if (!target) return safeNext
  try {
    const token = signEmailBookingIntent(target.fields, email)
    const { slug, court, date, time, pay } = target.fields
    const rebuilt = buildReservarHref(slug, {
      courtId: court,
      date,
      time,
      formato: target.formato,
      pay,
    })
    return `${rebuilt}&${BOOKING_INTENT_PARAM}=${encodeURIComponent(token)}`
  } catch {
    // Sin secreto la confirmación sola se apaga entera y la pantalla sigue prometiéndola: que se vea.
    captureMessage('reservar: no se pudo firmar el vínculo de la reserva', 'warning')
    return safeNext
  }
}

/** Atajo de las salidas de `createBookingAndCheckout`: ninguna deja esta pantalla en el historial. */
function replaceTo(url: string): never {
  return redirect(url, RedirectType.replace)
}

// Las claves van en el orden de la pantalla (casilla, nombre, email): `issues[0]` es el primer
// campo inválido que el jugador ve, y a ese se le marca el error y se le lleva el foco.
const gateSchema = z.object({
  terms: z.literal('on', { error: TERMS_REQUIRED_MESSAGE }),
  firstName: z.string().trim().min(1, 'Ingresá tu nombre').max(80, 'Máximo 80 caracteres'),
  // Zod 4: los validadores de formato son top-level (`z.email()`), y encadenarlos
  // DESPUÉS de las transformaciones invierte el orden — `z.email().trim()` valida
  // el formato ANTES de trimear, así que un email con un espacio de más falla.
  // `.pipe()` mantiene la semántica de v3: normalizar primero, validar después.
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ message: 'Ingresá un email válido' })),
  // La pantalla ya no lo pide; sigue acá para las pestañas abiertas de antes del deploy.
  lastName: z.string().trim().max(80, 'Máximo 80 caracteres').optional().default(''),
  next: z.string(),
})

/** Lo tipeado vuelve al form en cada error; sin esto se pierde (no hay defaultValue). */
const GATE_ECHO = ['email', 'firstName'] as const
type GateValues = Partial<Record<(typeof GATE_ECHO)[number], string>>

/** Los campos que un error puede marcar. */
type GateField = 'terms' | 'firstName' | 'email'
const isGateField = (path: unknown): path is GateField =>
  path === 'terms' || path === 'firstName' || path === 'email'

export type GateState =
  | { status: 'idle' }
  | { status: 'sent'; email: string; firstName: string }
  | { status: 'error'; message: string; field?: GateField; values?: GateValues }

export async function sendPlayerMagicLink(
  _prev: GateState,
  formData: FormData,
): Promise<GateState> {
  // El jugador que se equivoca en un campo perdía nombre y email.
  const values: GateValues = echoFields(formData, GATE_ECHO)
  const parsed = gateSchema.safeParse({
    email: formData.get('email'),
    firstName: formData.get('firstName'),
    // Ausente (la pantalla ya no lo manda): `null` no pasa por `.optional()`, `undefined` sí.
    lastName: formData.get('lastName') ?? undefined,
    terms: formData.get('terms'),
    next: formData.get('next'),
  })
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const field = issue?.path[0]
    return {
      status: 'error',
      message: issue?.message ?? 'Datos inválidos.',
      ...(isGateField(field) ? { field } : {}),
      values,
    }
  }

  // authMagicLink (5/60s per email): same defense as staff loginAction — stops
  // a player's inbox being flooded with magic-link emails.
  const rl = await enforce('authMagicLink', parsed.data.email)
  if (!rl.ok) {
    return {
      status: 'error',
      message: 'Demasiados intentos. Esperá un minuto y probá de nuevo.',
      values,
    }
  }

  const origin = (await headers()).get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
  const safeNext = sanitizeNext(parsed.data.next, '/mis-reservas')
  // Una reserva en curso viaja con su vínculo firmado: al tocar el enlace vuelve con la reserva
  // hecha. No mira si el complejo tiene seña: eso lo decide la pantalla al volver.
  const nextForLink = nextWithBookingIntent(safeNext, parsed.data.email)
  const redirectTo = `${origin}/api/auth/callback?next=${encodeURIComponent(nextForLink)}`

  const result = await signInWithPlayerMagicLink(parsed.data.email, redirectTo, {
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    agreedTerms: true,
    termsVersion: CURRENT_TERMS_VERSION,
  })
  if (!result.ok)
    return { status: 'error', message: 'No pudimos enviar el email. Probá de nuevo.', values }
  return { status: 'sent', email: parsed.data.email, firstName: parsed.data.firstName }
}

/**
 * Google desde el checkout: la casilla de términos vive en la MISMA pantalla que el ingreso por
 * email (`terms`, ver LoginGate). El botón de Google no se deshabilita: si falta la casilla, ESTA
 * action lo dice (el error va en la casilla) y no redirige. Con la casilla se setea una cookie
 * firmada de corta duración (`google-terms-cookie.ts`) ANTES de mandar a Google, así el alta nueva
 * por Google entra con el consentimiento ya resuelto y no ve la pantalla de `/aceptar-terminos`.
 * Este chequeo es la UX y también defensa en profundidad, no la única barrera: la real es
 * `hasAgreedTerms` en el callback.
 *
 * La cookie (no un query param en `redirectTo`) es a propósito: revisión
 * adversarial 2026-08-14 encontró que un query param reenviado por Supabase
 * junto al `code` viaja por una URL externa sin firma — se podía forzar
 * `agreed=1` sin haber tildado nada. Se borra siempre antes de decidir, para
 * que una cookie vieja de un intento anterior (tildado, abandonado, y vuelto
 * a intentar SIN tildar) no aplique a este envío.
 *
 * Acepta las dos firmas: `(prev, formData)` (la actual, con `useActionState`) y `(formData)` (la de
 * antes del deploy). Una pestaña abierta antes lo llama con la vieja y, sin esto, `formData.get`
 * reventaba con un 500.
 */
export async function startGoogleLoginFromReservar(
  prev: GateState | FormData,
  maybeFormData?: FormData,
): Promise<GateState> {
  const formData = prev instanceof FormData ? prev : maybeFormData!
  const nextRaw = formData.get('next')
  const safeNext = sanitizeNext(typeof nextRaw === 'string' ? nextRaw : null)

  const cookieStore = await cookies()
  if (formData.get('terms') !== 'on') {
    cookieStore.delete(GOOGLE_TERMS_COOKIE_NAME)
    cookieStore.delete(BOOKING_INTENT_COOKIE_NAME)
    return {
      status: 'error',
      message: TERMS_REQUIRED_MESSAGE,
      field: 'terms',
      values: echoFields(formData, GATE_ECHO),
    }
  }
  // Los flags van escritos en cada `.set` (no en un objeto compartido): `cookie-flags.test.ts` los
  // exige literales en el bloque.
  cookieStore.set({
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    name: GOOGLE_TERMS_COOKIE_NAME,
    value: buildGoogleTermsCookie(CURRENT_TERMS_VERSION),
    maxAge: Math.floor(GOOGLE_TERMS_COOKIE_TTL_MS / 1000),
  })
  // El vínculo de la reserva en curso viaja en una cookie (Google vuelve en el MISMO navegador y el
  // `next` pasa por una URL externa). Una cookie vieja de un intento anterior no sobrevive: o se
  // pisa con la de este turno o se borra.
  const intent = parseBookingNext(safeNext)
  if (intent) {
    cookieStore.set({
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      name: BOOKING_INTENT_COOKIE_NAME,
      value: signCookieBookingIntent(intent.fields),
      maxAge: Math.floor(BOOKING_INTENT_COOKIE_TTL_MS / 1000),
    })
  } else {
    cookieStore.delete(BOOKING_INTENT_COOKIE_NAME)
  }

  const origin = (await headers()).get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
  const redirectTo = `${origin}/api/auth/callback?next=${encodeURIComponent(safeNext)}`

  const result = await signInWithGooglePlayer(redirectTo)
  if (!result.url) redirect(safeNext)
  redirect(result.url)
}

function addMins(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = h! * 60 + (m ?? 0) + mins
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
  const payRaw = String(formData.get('pay') ?? '')
  // Lo que el jugador había elegido (filtro de formato y forma de pago) vuelve en cada rebote.
  const backTo = buildReservarHref(slug, {
    courtId: court,
    date,
    time,
    formato: parseFormato(String(formData.get('formato') ?? ''), FORMAT_OPTIONS),
    pay: parsePay(payRaw, PAY_METHODS),
  })

  // Basic format guard: the form should always send a valid date, but protect
  // against direct FormData manipulation before reaching the service validation.
  if (!isValidCalendarDate(date)) replaceTo(`${backTo}&error=invalid_date`)

  const user = await extractAuthUser()
  if (!user || user.type !== 'player') replaceTo(backTo)

  // publicBookingCreate (5/60s por ip+tenant): defensa de Denial-of-Inventory —
  // cubre el caso de múltiples cuentas de jugador desde el mismo origen contra
  // EL MISMO tenant, que playerBooking (por player_id) no ve. Key compuesta
  // (no solo IP) para no compartir bucket entre tenants distintos desde la
  // misma IP. INV-ABUSE-001 (hardening post security-review).
  const ip = parseClientIp(await headers())
  const ipRl = await enforce('publicBookingCreate', `${ip}:${slug}`)
  if (!ipRl.ok) replaceTo(`${backTo}&error=rate_limited`)

  // playerBooking (20/60s per player): caps online-booking + MP-preference spam
  // from a single authenticated player (the public booking path, separate from
  // the /api/player/bookings route which is already guarded).
  const rl = await enforce('playerBooking', user!.playerId)
  if (!rl.ok) replaceTo(`${backTo}&error=rate_limited`)

  const db = getDb()
  const tRows = await db
    .select({
      id: tenants.id,
      status: tenants.status,
      settings: tenants.settings,
      mpAccessToken: tenants.mpAccessToken,
    })
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1)
  const tenant = tRows[0]
  if (!tenant) replaceTo(`/${slug}`)

  // El portal público sigue abierto durante la baja voluntaria hasta el fin del
  // período ya pagado (doc4 §2, "acceso jugador: completo hasta fin período"),
  // así que este guard NO puede decidir por `status` a secas. Se lee el período
  // sólo cuando el estado lo pide y se resuelve con la MISMA función que usan
  // las pages — el camino de escritura no confía en lo que decidió la page.
  const canceledPeriodEnd =
    tenant!.status === 'canceled'
      ? await withTenantContext(tenant!.id, async (tx) =>
          tx
            .select({ currentPeriodEnd: tenantSubscriptions.currentPeriodEnd })
            .from(tenantSubscriptions)
            .where(eq(tenantSubscriptions.tenantId, tenant!.id))
            .limit(1)
            .then((r) => r[0]?.currentPeriodEnd ?? null),
        )
      : null
  if (!isPublicPortalOpen(tenant!.status, canceledPeriodEnd)) replaceTo(`/${slug}`)

  const settings = tenant!.settings as TenantSettings
  const timeEnd = addMins(time, dur)

  // Método de pago presencial elegido por el jugador. Solo aplica sin seña
  // (con seña el flujo MP setea payment_method='mercadopago' vía webhook P10)
  // y solo si el complejo lo acepta — re-validamos server-side: el form puede
  // venir manipulado.
  // 🔴 F-003 (QA de producción 2026-08-17): un complejo con "requerir seña"
  // prendido y MercadoPago SIN conectar no puede crear la preferencia de pago, así
  // que el booking nacía `pending_payment` y **expiraba solo por hold**: el jugador
  // creía que había reservado y el complejo perdía el turno sin enterarse.
  //
  // Acá la reserva se confirma SIN seña (decisión del dueño, 2026-08-18): el
  // complejo se queda con el turno y cobra en el mostrador, que es estrictamente
  // mejor que perder al cliente en silencio. El estado ya no se puede volver a
  // crear —la Server Action de Políticas de Reserva lo rechaza y el default de la
  // columna nace en `false` (migr. 077)—, así que llegar acá significa que quedó un
  // tenant inconsistente de antes: se reporta para poder encontrarlo.
  const depositUnpayable = settings.requires_deposit && !tenant!.mpAccessToken
  if (depositUnpayable) {
    captureMessage('checkout: requires_deposit sin MercadoPago conectado', 'warning')
  }
  const withDeposit =
    settings.requires_deposit && !depositUnpayable && settings.deposit_percentage > 0
  const paymentMethod: 'cash' | 'transfer' | undefined = withDeposit
    ? undefined
    : payRaw === 'cash' && (settings.accepts_cash ?? true)
      ? 'cash'
      : payRaw === 'transfer' && (settings.accepts_transfer ?? true)
        ? 'transfer'
        : undefined

  // Vínculo de intención: el de este envío viene en el form (enlace del mail) y/o en la cookie
  // (Google). Se RE-verifica acá contra lo que se va a reservar y la sesión; la page ya lo miró,
  // pero el camino de escritura no confía en lo que decidió ella. Válido y sin seña = la reserva
  // se confirmó sola. Con seña o inválido sigue IGUAL que un envío manual (el jugador puede estar
  // tocando el botón él mismo): solo se deja la señal. La cookie se gasta al usarla.
  const cookieStore = await cookies()
  const cookieToken = cookieStore.get(BOOKING_INTENT_COOKIE_NAME)?.value
  // Un auto-envío SIEMPRE lleva el campo oculto del vínculo (con la cookie de Google, el marcador),
  // y con seña nunca se manda solo: el jugador toca "Pagar la seña", y ese form no lleva el campo.
  // Se mira la PRESENCIA del campo, no su validez, para no trabar ese toque legítimo. Defensa en
  // profundidad: la page ya no arma el auto-envío con seña.
  if (withDeposit && formData.has(BOOKING_INTENT_PARAM)) {
    if (cookieToken) cookieStore.delete(BOOKING_INTENT_COOKIE_NAME)
    track.funnel('checkout.intent_degraded', { tenantId: tenant!.id, reason: 'deposit' })
    replaceTo(backTo)
  }
  const linkToken = formData.get(BOOKING_INTENT_PARAM)
  const intent = checkBookingIntent(
    {
      linkToken: typeof linkToken === 'string' ? linkToken : null,
      cookieToken,
      email: user!.email,
    },
    { slug, court, date, time, dur, pay: parsePay(payRaw, PAY_METHODS) },
  )
  if (cookieToken) cookieStore.delete(BOOKING_INTENT_COOKIE_NAME)
  const intentValid = intent?.ok === true && !withDeposit
  if (intent && !intentValid) {
    track.funnel('checkout.intent_degraded', {
      tenantId: tenant!.id,
      reason: intent.ok ? 'deposit' : intent.reason,
    })
  }

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
          // `&& !depositUnpayable` y no `withDeposit` a secas: `withDeposit`
          // suma la condición `deposit_percentage > 0`, que este parámetro nunca
          // tuvo. Se cambia solo lo que el hallazgo pide.
          requiresDeposit: settings.requires_deposit && !depositUnpayable,
          depositPercentage: settings.deposit_percentage,
          // Recortado por el fin del período pago si el complejo está dado
          // de baja: no puede vender turnos que caen después del corte, con la
          // seña ya cobrada y él sin acceso para atenderlos.
          maxAdvanceDays: publicBookingAdvanceDays(
            settings.booking_advance_days ?? 6,
            tenant!.status,
            canceledPeriodEnd,
          ),
          minLeadMinutes: bookingMinAdvanceHours(settings) * 60,
          ...(paymentMethod ? { paymentMethod } : {}),
        },
        tx,
      )
    })
    if (intentValid) track.funnel('checkout.intent_confirmed', { tenantId: tenant!.id })

    if (booking.status === 'confirmed') {
      redirectTo = buildReservaHref(booking.id, 'exito')
    } else {
      if (!tenant!.mpAccessToken) {
        redirectTo = buildReservaHref(booking.id, 'pendiente')
      } else {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
        const gateway = resolveTenantGateway(tenant!.id, tenant!.mpAccessToken)
        const pref = await createDepositPayment(booking.id, gateway, tenant!.id, appUrl)
        redirectTo = pref.initPoint
      }
    }
  } catch (err) {
    if (err instanceof BookingValidationError) replaceTo(`${backTo}&error=unavailable`)
    if (err instanceof BookingDateOutOfRangeError) {
      replaceTo(`${backTo}&error=${err.reason === 'lead_time' ? 'too_soon' : 'date_out_of_range'}`)
    }
    // El turno ocupado puede ser el PROPIO: el doble envío o la recarga chocan con la reserva que
    // acaba de crear el primer envío, y decirle "ya no está disponible" a quien lo acaba de
    // reservar es mentirle. Si es suyo, va a su pantalla (idempotente). Si es de otra persona:
    // sin código de error propio (decisión del dueño, 2026-08-14) el rebote vuelve al checkout
    // pelado y el guard de disponibilidad de `page.tsx` muestra "Ese turno ya no está
    // disponible"; con un vínculo válido (entró para confirmar y alguien se adelantó) lleva
    // `taken_on_return` y la page le dice que se ocupó mientras entraba.
    if (err instanceof SlotTakenError) {
      const own = await findOwnLiveBookingOrNull(user!.playerId, {
        courtId: court,
        date,
        timeStart: time,
      })
      if (own) {
        replaceTo(buildReservaHref(own.id, own.status === 'confirmed' ? 'exito' : 'pendiente'))
      }
      replaceTo(intentValid ? `${backTo}&error=taken_on_return` : backTo)
    }
    if (err instanceof PlayerBannedError) {
      const untilParam = err.until ? `&until=${encodeURIComponent(err.until.toISOString())}` : ''
      // R3-5: el `reason` YA NO viaja por la URL (antes permitía fabricar
      // URLs con texto arbitrario mostrado en un dominio legítimo —
      // ingeniería social — y lo filtraba a logs/analytics/referrers). El
      // query param solo lleva el flag; `page.tsx` relee el motivo real de
      // DB server-side vía `getActiveBanReason` cuando hay sesión de jugador
      // válida (ver CheckoutStates.tsx).
      replaceTo(`${backTo}&error=banned${untilParam}`)
    }
    if (err instanceof TooManyActiveHoldsError) replaceTo(`${backTo}&error=too_many_holds`)
    if (err instanceof CourtOfflineError || err instanceof PriceUnavailableError)
      replaceTo(`${backTo}&error=unavailable`)
    throw err
  }

  replaceTo(redirectTo)
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
      SELECT b.status, b.player_id AS "playerId", b.tenant_id AS "tenantId",
             b.created_at AS "createdAt"
      FROM bookings b
      WHERE b.id = ${bookingId} LIMIT 1
    `)) as unknown as Array<{
      status: string
      playerId: string | null
      tenantId: string
      createdAt: string
    }>
    return rows[0] ?? null
  })

  if (!bookingRow || bookingRow.playerId !== user.playerId) redirect('/')

  if (bookingRow.status !== 'pending_payment') {
    // Already resolved (webhook landed while player was on error page)
    redirect(`/reserva/${bookingId}/exito`)
  }

  // La página de error se cargó con hold de sobra y el jugador tocó tarde (sin cuenta regresiva
  // no ve cuánto queda): la preferencia nueva se comería el margen del webhook o sobreviviría al
  // hold, y el pago entraría tarde. Vuelve al error, que ya muestra que el turno no está guardado.
  if (!holdAllowsRetry(bookingRow.createdAt, Date.now())) {
    redirect(`/reserva/${bookingId}/error`)
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
