import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SQL } from 'drizzle-orm'

/**
 * QA en producción 2026-08-18: guardar `/settings/reservas` con el toggle en
 * "Sin seña" dejaba `deposit_percentage` en 0. El input hidden del porcentaje
 * solo se renderiza con la seña prendida, así que `Number(null)` entraba como 0
 * y el patch lo persistía — un valor fuera del rango válido (10-100) que al
 * volver a prender la seña arrancaba el campo "Otro" por debajo del mínimo.
 *
 * El patch se aplica con `settings || patch`, así que la clave ausente deja el
 * valor guardado intacto: con la seña apagada, `deposit_percentage` no viaja.
 */

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/modules/staff/guards', () => ({ requireAdminStaffAction: vi.fn() }))
vi.mock('@/shared/rate-limit/server-action', () => ({ adminRateLimited: vi.fn() }))
vi.mock('@/shared/db/client', () => ({ withTenantContext: vi.fn() }))

import { updateReservasPolicyAction } from '@/app/(admin)/settings/reservas/actions'
import { requireAdminStaffAction } from '@/modules/staff/guards'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { withTenantContext } from '@/shared/db/client'

/** Último patch jsonb que la action mandó a `settings || <patch>::jsonb`. */
let lastPatch: Record<string, unknown> | null = null

/**
 * El patch viaja interpolado en un template `sql`, así que no llega como
 * argumento suelto: hay que sacarlo de los chunks del SQL que arma drizzle.
 */
function extractPatch(value: SQL): Record<string, unknown> | null {
  const chunks = (value as unknown as { queryChunks?: unknown[] }).queryChunks ?? []
  for (const chunk of chunks) {
    if (chunk && typeof chunk === 'object' && 'requires_deposit' in chunk) {
      return chunk as Record<string, unknown>
    }
  }
  return null
}

const FAKE_TX = {
  update: () => ({
    set: (values: { settings: SQL }) => {
      lastPatch = extractPatch(values.settings)
      return { where: () => Promise.resolve() }
    },
  }),
}

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  return fd
}

const BASE_FIELDS = {
  allowOnlineBooking: 'true',
  cancellationHoursBefore: '12',
  bookingAdvanceDays: '6',
}

beforeEach(() => {
  vi.clearAllMocks()
  lastPatch = null
  vi.mocked(requireAdminStaffAction).mockResolvedValue({
    ok: true,
    user: { staffUserId: 'staff-1' },
    tenant: { id: 'tenant-1', mpConnectedAt: new Date() },
    role: 'admin',
  } as never)
  vi.mocked(adminRateLimited).mockResolvedValue(null as never)
  vi.mocked(withTenantContext).mockImplementation((async (
    _id: string,
    cb: (tx: never) => Promise<unknown>,
  ) => cb(FAKE_TX as never)) as never)
})

describe('updateReservasPolicyAction — deposit_percentage', () => {
  it('con la seña apagada NO toca el porcentaje configurado', async () => {
    // El form real no manda depositPercentage cuando está en "Sin seña".
    const result = await updateReservasPolicyAction(
      { success: true },
      formData({ ...BASE_FIELDS, requiresDeposit: 'false' }),
    )

    expect(result).toEqual({ success: true })
    expect(lastPatch).toMatchObject({ requires_deposit: false })
    expect(lastPatch).not.toHaveProperty('deposit_percentage')
  })

  it('con la seña prendida persiste el porcentaje elegido', async () => {
    const result = await updateReservasPolicyAction(
      { success: true },
      formData({ ...BASE_FIELDS, requiresDeposit: 'true', depositPercentage: '100' }),
    )

    expect(result).toEqual({ success: true })
    expect(lastPatch).toMatchObject({ requires_deposit: true, deposit_percentage: 100 })
  })
})

describe('updateReservasPolicyAction — booking_min_advance_hours', () => {
  it('persiste las horas mínimas de anticipación', async () => {
    const result = await updateReservasPolicyAction(
      { success: true },
      formData({ ...BASE_FIELDS, requiresDeposit: 'false', bookingMinAdvanceHours: '3' }),
    )

    expect(result).toEqual({ success: true })
    expect(lastPatch).toMatchObject({ booking_min_advance_hours: 3 })
  })

  it('rechaza más de 48 horas sin tocar settings', async () => {
    const result = await updateReservasPolicyAction(
      { success: true },
      formData({ ...BASE_FIELDS, requiresDeposit: 'false', bookingMinAdvanceHours: '49' }),
    )

    expect(result.success).toBe(false)
    expect(lastPatch).toBeNull()
  })
})

describe('updateReservasPolicyAction — cada rama toca solo lo suyo', () => {
  it('sin seña guarda late_cancel_hours y NO pisa cancellation_policy', async () => {
    const result = await updateReservasPolicyAction(
      { success: true },
      formData({
        allowOnlineBooking: 'true',
        bookingAdvanceDays: '6',
        requiresDeposit: 'false',
        lateCancelHours: '4',
      }),
    )

    expect(result).toEqual({ success: true })
    expect(lastPatch).toMatchObject({ late_cancel_hours: 4 })
    expect(lastPatch).not.toHaveProperty('cancellation_policy')
  })

  it('con seña guarda cancellation_policy y NO pisa late_cancel_hours', async () => {
    const result = await updateReservasPolicyAction(
      { success: true },
      formData({ ...BASE_FIELDS, requiresDeposit: 'true', depositPercentage: '30' }),
    )

    expect(result).toEqual({ success: true })
    expect(lastPatch).toMatchObject({ cancellation_policy: { hours_before: 12 } })
    expect(lastPatch).not.toHaveProperty('late_cancel_hours')
  })

  it('rechaza más de 24 horas', async () => {
    const result = await updateReservasPolicyAction(
      { success: true },
      formData({ ...BASE_FIELDS, requiresDeposit: 'false', lateCancelHours: '25' }),
    )

    expect(result.success).toBe(false)
    expect(lastPatch).toBeNull()
  })
})
