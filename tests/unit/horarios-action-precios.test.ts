import { beforeEach, describe, expect, it, vi } from 'vitest'

// updateHorariosAction: un día abierto sin precio no se guarda. El Vagón abrió
// el domingo 17–22 sin tarifa (2026-10-24), el portal y el bot lo mostraban
// libre y la reserva explotaba con PriceUnavailableError. Sin DB: el guardado
// real de horario + precios va en la misma transacción que ya cubre
// withTenantContext; acá importa qué se escribe y qué no.

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/modules/staff/guards', () => ({ requireAdminStaffAction: vi.fn() }))
vi.mock('@/shared/rate-limit/server-action', () => ({ adminRateLimited: vi.fn() }))
vi.mock('@/shared/db/client', () => ({ withTenantContext: vi.fn() }))
vi.mock('@/modules/courts/court.service', () => ({ listCourts: vi.fn(), updateCourt: vi.fn() }))

import { updateHorariosAction } from '@/app/(admin)/settings/horarios/actions'
import { requireAdminStaffAction } from '@/modules/staff/guards'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { withTenantContext } from '@/shared/db/client'
import { listCourts, updateCourt } from '@/modules/courts/court.service'
import { priceForSlot } from '@/lib/booking/pricing'
import type { PricingRule } from '@/modules/courts/court.types'

const tenantUpdate = vi.fn()
const tx = {
  update: () => ({
    set: (values: unknown) => ({ where: async () => tenantUpdate(values) }),
  }),
}

const WEEKDAYS_AND_SAT = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const court = {
  id: 'c1',
  name: 'Cancha 1',
  pricing: {
    rules: [{ days: WEEKDAYS_AND_SAT, from: '08:00', to: '22:00', price: 8_400_000 }],
  },
}

/** Lunes a sábado 08–22 (con precio) y el domingo 17–22, que no tiene tarifa. */
function form(extra: Record<string, string> = {}): FormData {
  const fd = new FormData()
  for (const day of WEEKDAYS_AND_SAT) {
    fd.set(`${day}_open`, '08:00')
    fd.set(`${day}_close`, '22:00')
  }
  fd.set('sun_open', '17:00')
  fd.set('sun_close', '22:00')
  for (const [key, value] of Object.entries(extra)) fd.set(key, value)
  return fd
}

function savedRules(): PricingRule[] {
  const call = vi.mocked(updateCourt).mock.calls[0]
  if (!call) throw new Error('updateCourt no se llamó')
  return (call[2] as { pricing: { rules: PricingRule[] } }).pricing.rules
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAdminStaffAction).mockResolvedValue({ ok: true, tenant: { id: 't1' } } as never)
  vi.mocked(adminRateLimited).mockResolvedValue(null as never)
  vi.mocked(withTenantContext).mockImplementation((async (
    _id: string,
    cb: (t: unknown) => unknown,
  ) => cb(tx)) as never)
  vi.mocked(listCourts).mockResolvedValue([court] as never)
})

describe('updateHorariosAction — día abierto sin precio', () => {
  it('no guarda nada y pide el precio, sugiriendo la tarifa que más cobra la cancha', async () => {
    const result = await updateHorariosAction({ success: true }, form())

    expect(result).toMatchObject({
      success: false,
      needsPrices: {
        days: ['sun'],
        courts: [{ id: 'c1', name: 'Cancha 1', suggestedCents: 8_400_000 }],
      },
    })
    expect(tenantUpdate).not.toHaveBeenCalled()
    expect(updateCourt).not.toHaveBeenCalled()
  })

  it('un precio inválido cuenta como faltante', async () => {
    const result = await updateHorariosAction({ success: true }, form({ price_c1: '0' }))

    expect(result.success).toBe(false)
    expect(tenantUpdate).not.toHaveBeenCalled()
  })

  it('con el precio del dueño guarda el horario y tarifa el domingo con ese precio', async () => {
    const result = await updateHorariosAction({ success: true }, form({ price_c1: '9000000' }))

    expect(result).toEqual({ success: true })
    expect(tenantUpdate).toHaveBeenCalledTimes(1)
    const rules = savedRules()
    for (const hhmm of ['17:00', '19:00', '21:00']) {
      expect(priceForSlot({ rules }, 'sun', hhmm)).toBe(9_000_000)
    }
    // Los días que ya tenían precio no se tocan.
    expect(priceForSlot({ rules }, 'mon', '10:00')).toBe(8_400_000)
    expect(priceForSlot({ rules }, 'sat', '21:00')).toBe(8_400_000)
  })

  it('con el domingo cerrado no pide precio ni reescribe la cancha', async () => {
    const result = await updateHorariosAction({ success: true }, form({ sun_closed: 'on' }))

    expect(result).toEqual({ success: true })
    expect(tenantUpdate).toHaveBeenCalledTimes(1)
    expect(updateCourt).not.toHaveBeenCalled()
  })

  it('con cierre pasada la medianoche, el precio del dueño cubre también la madrugada', async () => {
    const result = await updateHorariosAction(
      { success: true },
      form({ sun_close: '01:00', price_c1: '9000000' }),
    )

    expect(result).toEqual({ success: true })
    const rules = savedRules()
    // La 00:00 del domingo operativo se tarifa con las reglas del domingo.
    expect(priceForSlot({ rules }, 'sun', '23:00')).toBe(9_000_000)
    expect(priceForSlot({ rules }, 'sun', '00:00')).toBe(9_000_000)
  })

  it('solo pide precio a las canchas que lo necesitan', async () => {
    vi.mocked(listCourts).mockResolvedValue([
      court,
      {
        id: 'c2',
        name: 'Cancha 2',
        pricing: {
          rules: [
            { days: [...WEEKDAYS_AND_SAT, 'sun'], from: '08:00', to: '22:00', price: 6_000_000 },
          ],
        },
      },
    ] as never)

    const result = await updateHorariosAction({ success: true }, form())

    expect(result).toMatchObject({
      success: false,
      needsPrices: { courts: [{ id: 'c1' }] },
    })
    expect(result.success === false && result.needsPrices?.courts).toHaveLength(1)
  })

  it('un precio mandado para una cancha que no lo necesita se ignora', async () => {
    const result = await updateHorariosAction(
      { success: true },
      form({ sun_closed: 'on', price_c1: '9000000' }),
    )

    expect(result).toEqual({ success: true })
    expect(updateCourt).not.toHaveBeenCalled()
  })
})
