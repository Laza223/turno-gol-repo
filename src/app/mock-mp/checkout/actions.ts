'use server'

import { redirect, notFound } from 'next/navigation'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { getWorkerDb } from '@/shared/db/client'
import { buildMockPaymentId, buildMockEventId } from '@/modules/payments/mock-mp'
import { logger } from '@/shared/lib/logger'

const bookingFormSchema = z.object({ booking: z.string().uuid() })

function parseBookingId(formData: FormData): string {
  const parsed = bookingFormSchema.safeParse({ booking: formData.get('booking') })
  if (!parsed.success) notFound()
  return parsed.data.booking
}

// Defense-in-depth: actions are test-only and must 404 in production.
// NODE_ENV guard ensures mock endpoints are unreachable even if MP_MOCK_MODE
// leaks into a prod deployment (IDOR risk mitigated).
function guardMockMode(): void {
  if (process.env.NODE_ENV === 'production' || process.env.MP_MOCK_MODE !== '1') {
    notFound()
  }
}

async function resolveTenantId(bookingId: string): Promise<string> {
  // Test-only mock endpoint reading `bookings` (RLS-isolated, FORCE RLS)
  // cross-tenant with no SET LOCAL context — under the restricted
  // `turnogol_app` pool this would always return 0 rows (fail-closed 404),
  // breaking every mock-payment E2E run. Needs the bypass-capable worker pool.
  const db = getWorkerDb()
  const rows = (await db.execute(sql`
    SELECT tenant_id AS "tenantId" FROM bookings WHERE id = ${bookingId} LIMIT 1
  `)) as unknown as Array<{ tenantId: string }>
  const tenantId = rows[0]?.tenantId
  if (!tenantId) {
    notFound()
  }
  return tenantId
}

export async function mockPay(formData: FormData): Promise<void> {
  guardMockMode()
  const bookingId = parseBookingId(formData)

  const tenantId = await resolveTenantId(bookingId)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const secret = process.env.MP_WEBHOOK_SECRET ?? ''

  const body = JSON.stringify({
    id: buildMockEventId(bookingId, 'approved'),
    type: 'payment',
    data: { id: buildMockPaymentId('approved', bookingId) },
  })

  // Fix #60: si el webhook falla (red o non-2xx), redirigir a /error en lugar de
  // a /exito. Así el booking no queda atrapado en pending_payment con la UI
  // mostrando éxito. Reintenta hasta 2 veces antes de rendirse.
  let webhookOk = false
  for (let attempt = 0; attempt < 3 && !webhookOk; attempt++) {
    try {
      const res = await fetch(
        `${appUrl}/api/webhooks/mercadopago?tenant=${tenantId}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-webhook-secret': secret,
          },
          body,
        },
      )
      if (res.ok) {
        webhookOk = true
      } else {
        logger.warn('mock webhook POST returned non-2xx', {
          module: 'mock-mp',
          status: res.status,
          bookingId,
          attempt,
        })
      }
    } catch (err) {
      logger.warn('mock webhook POST failed', {
        module: 'mock-mp',
        error: err instanceof Error ? err.message : String(err),
        bookingId,
        attempt,
      })
    }
  }

  if (!webhookOk) {
    redirect(`/reserva/${bookingId}/error`)
  }
  redirect(`/reserva/${bookingId}/exito`)
}

export async function mockReject(formData: FormData): Promise<void> {
  guardMockMode()
  const bookingId = parseBookingId(formData)

  const tenantId = await resolveTenantId(bookingId)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const secret = process.env.MP_WEBHOOK_SECRET ?? ''

  const body = JSON.stringify({
    id: buildMockEventId(bookingId, 'rejected'),
    type: 'payment',
    data: { id: buildMockPaymentId('rejected', bookingId) },
  })

  try {
    const res = await fetch(
      `${appUrl}/api/webhooks/mercadopago?tenant=${tenantId}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-webhook-secret': secret,
        },
        body,
      },
    )
    if (!res.ok) {
      logger.warn('mock webhook POST returned non-2xx', {
        module: 'mock-mp',
        status: res.status,
        bookingId,
      })
    }
  } catch (err) {
    logger.warn('mock webhook POST failed', {
      module: 'mock-mp',
      error: err instanceof Error ? err.message : String(err),
      bookingId,
    })
  }

  redirect(`/reserva/${bookingId}/error`)
}

export async function mockCancel(formData: FormData): Promise<void> {
  guardMockMode()
  const bookingId = parseBookingId(formData)

  redirect(`/reserva/${bookingId}/error`)
}
