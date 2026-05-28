'use server'

import { redirect, notFound } from 'next/navigation'
import { sql } from 'drizzle-orm'
import { getDb } from '@/shared/db/client'
import { buildMockPaymentId, buildMockEventId } from '@/modules/payments/mock-mp'
import { logger } from '@/shared/lib/logger'

// Defense-in-depth: actions are test-only and must 404 in production.
function guardMockMode(): void {
  if (process.env.MP_MOCK_MODE !== '1') {
    notFound()
  }
}

async function resolveTenantId(bookingId: string): Promise<string> {
  const db = getDb()
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
  const bookingId = String(formData.get('booking') ?? '')
  if (!bookingId) notFound()

  const tenantId = await resolveTenantId(bookingId)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const secret = process.env.MP_WEBHOOK_SECRET ?? ''

  const body = JSON.stringify({
    id: buildMockEventId(bookingId, 'approved'),
    type: 'payment',
    data: { id: buildMockPaymentId('approved', bookingId) },
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

  redirect(`/reserva/${bookingId}/exito`)
}

export async function mockReject(formData: FormData): Promise<void> {
  guardMockMode()
  const bookingId = String(formData.get('booking') ?? '')
  if (!bookingId) notFound()

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
  const bookingId = String(formData.get('booking') ?? '')
  if (!bookingId) notFound()

  redirect(`/reserva/${bookingId}/error`)
}
