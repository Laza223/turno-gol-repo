import { beforeEach, describe, expect, it, vi } from 'vitest'

// Server Actions del export de datos (`/settings/datos`). Mockeamos auth,
// tenant context, rate-limit, audit y las lecturas para testear el guard, el
// cursor y que cada descarga quede auditada, sin DB. Lo que lee de verdad lo
// cubre `tests/integration/settings-datos-export.test.ts`.
vi.mock('@/modules/staff/guards', () => ({ requireAdminStaffAction: vi.fn() }))
vi.mock('@/shared/db/client', () => ({ withTenantContext: vi.fn() }))
vi.mock('@/shared/rate-limit/server-action', () => ({ adminRateLimited: vi.fn() }))
vi.mock('@/shared/db/audit', () => ({ insertAuditLog: vi.fn() }))
vi.mock('@/app/(admin)/settings/datos/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/(admin)/settings/datos/queries')>()),
  listBookingsForExport: vi.fn(),
  listAbonadosForExport: vi.fn(),
  listClientsForExport: vi.fn(),
}))

import {
  exportAbonadosAction,
  exportBookingsAction,
  exportClientsAction,
} from '@/app/(admin)/settings/datos/actions'
import {
  listAbonadosForExport,
  listBookingsForExport,
  listClientsForExport,
} from '@/app/(admin)/settings/datos/queries'
import { parseBookingsCursor } from '@/app/(admin)/settings/datos/datos.schema'
import {
  ABONADOS_EXPORT_HEADER,
  BOOKINGS_EXPORT_HEADER,
  CLIENTS_EXPORT_HEADER,
  type BookingExportSource,
} from '@/modules/reports/data-export'
import { requireAdminStaffAction } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { insertAuditLog } from '@/shared/db/audit'

const AUTH_OK = { ok: true, user: { staffUserId: 'staff-1' }, tenant: { id: 'tenant-1' } }
const CURSOR = '2026-10-22T21:00:00.000000Z|3f2a9c1e-0000-4000-8000-000000000001'

const booking = (id: string): BookingExportSource => ({
  id,
  date: '2026-10-05',
  timeStart: '20:00:00',
  timeEnd: '21:00:00',
  courtName: 'Cancha 1',
  type: 'spontaneous',
  status: 'confirmed',
  depositStatus: 'not_required',
  viaWhatsapp: false,
  byStaff: true,
  clientName: 'Juan',
  phone: null,
  priceSnapshot: 4_500_000,
  depositAmount: 0,
  totalPaid: 0,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAdminStaffAction).mockResolvedValue(AUTH_OK as never)
  vi.mocked(adminRateLimited).mockResolvedValue(null)
  vi.mocked(insertAuditLog).mockResolvedValue(undefined)
  vi.mocked(withTenantContext).mockImplementation(
    async (_tenantId: string, cb: (tx: never) => unknown) => cb({} as never) as never,
  )
  vi.mocked(listBookingsForExport).mockResolvedValue({
    rows: [
      booking('aaaaaaaa-0000-4000-8000-000000000001'),
      booking('bbbbbbbb-0000-4000-8000-000000000002'),
    ],
    nextCursor: CURSOR,
  })
  vi.mocked(listAbonadosForExport).mockResolvedValue([])
  vi.mocked(listClientsForExport).mockResolvedValue([])
})

describe('export de datos — autorización', () => {
  it('rechaza a quien no es el dueño, sin leer nada', async () => {
    vi.mocked(requireAdminStaffAction).mockResolvedValue({
      ok: false,
      error: 'Solo el administrador puede modificar la configuración.',
    } as never)
    for (const res of [
      await exportBookingsAction(null),
      await exportAbonadosAction(),
      await exportClientsAction(),
    ]) {
      expect(res).toEqual({
        success: false,
        error: 'Solo el administrador puede modificar la configuración.',
      })
    }
    expect(withTenantContext).not.toHaveBeenCalled()
  })

  // Decisión 2026-10-22: en solo lectura el dueño puede llevarse sus datos. El
  // guard rechaza `suspended` por default; exportar lo pide explícito.
  it('las tres piden el guard con allowReadOnly', async () => {
    await exportBookingsAction(null)
    await exportAbonadosAction()
    await exportClientsAction()
    expect(vi.mocked(requireAdminStaffAction).mock.calls).toEqual([
      [{ allowReadOnly: true }],
      [{ allowReadOnly: true }],
      [{ allowReadOnly: true }],
    ])
  })

  it('respeta el rate-limit del complejo', async () => {
    vi.mocked(adminRateLimited).mockResolvedValue('Demasiadas operaciones.')
    expect(await exportBookingsAction(null)).toEqual({
      success: false,
      error: 'Demasiadas operaciones.',
    })
    expect(listBookingsForExport).not.toHaveBeenCalled()
  })
})

describe('exportBookingsAction', () => {
  it('la primera página arranca sin cursor y devuelve el de la siguiente', async () => {
    const res = await exportBookingsAction(null)
    expect(listBookingsForExport).toHaveBeenCalledWith('tenant-1', null, expect.anything())
    expect(res).toMatchObject({
      success: true,
      header: BOOKINGS_EXPORT_HEADER,
      rows: 2,
      nextCursor: CURSOR,
    })
    if (!res.success) throw new Error('unreachable')
    expect(res.body.split('\r\n')).toHaveLength(2)
    expect(res.body.startsWith('AAAAAAAA;2026-10-05;20:00;21:00;Cancha 1;Panel;Confirmada')).toBe(
      true,
    )
  })

  it('sigue desde el cursor que le devolvió la página anterior', async () => {
    await exportBookingsAction(CURSOR)
    expect(listBookingsForExport).toHaveBeenCalledWith(
      'tenant-1',
      { startsAt: '2026-10-22T21:00:00.000000Z', id: '3f2a9c1e-0000-4000-8000-000000000001' },
      expect.anything(),
    )
  })

  it('un cursor que no emitió el servidor no llega a la DB', async () => {
    const res = await exportBookingsAction("2026-10-22' OR 1=1 --|x")
    expect(res.success).toBe(false)
    expect(withTenantContext).not.toHaveBeenCalled()
  })

  it('cada página queda en audit_logs con el cursor del que salió', async () => {
    await exportBookingsAction(CURSOR)
    expect(insertAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: 'tenant-1',
        actorId: 'staff-1',
        actorType: 'staff',
        action: 'tenant.data_exported',
        resourceType: 'tenant',
        resourceId: 'tenant-1',
        metadata: { dataset: 'bookings', rows: 2, cursor: CURSOR },
      }),
    )
  })

  it('si el audit falla, el dato no sale', async () => {
    vi.mocked(insertAuditLog).mockRejectedValue(new Error('audit caído'))
    await expect(exportBookingsAction(null)).rejects.toThrow('audit caído')
  })
})

describe('turnos fijos y clientes', () => {
  it('salen en una sola vuelta, sin cursor, y quedan auditados', async () => {
    const abonados = await exportAbonadosAction()
    const clients = await exportClientsAction()
    expect(abonados).toMatchObject({
      success: true,
      header: ABONADOS_EXPORT_HEADER,
      rows: 0,
      nextCursor: null,
    })
    expect(clients).toMatchObject({
      success: true,
      header: CLIENTS_EXPORT_HEADER,
      rows: 0,
      nextCursor: null,
    })
    const datasets = vi
      .mocked(insertAuditLog)
      .mock.calls.map(([, entry]) => (entry.metadata as { dataset: string }).dataset)
    expect(datasets).toEqual(['abonados', 'clients'])
  })
})

describe('parseBookingsCursor', () => {
  it('lee el cursor que emite la query', () => {
    expect(parseBookingsCursor(CURSOR)).toEqual({
      startsAt: '2026-10-22T21:00:00.000000Z',
      id: '3f2a9c1e-0000-4000-8000-000000000001',
    })
  })
  it.each([
    '',
    '2026-10-22T21:00:00Z|3f2a9c1e-0000-4000-8000-000000000001',
    '2026-10-22 21:00:00+00|3f2a9c1e-0000-4000-8000-000000000001',
    '2026-10-22T21:00:00.000000Z|no-es-un-uuid',
    '2026-13-45T21:00:00.000000Z|3f2a9c1e-0000-4000-8000-000000000001',
    // JS lo corre al 3 de marzo; Postgres lo rechazaría con una excepción.
    '2026-02-31T21:00:00.000000Z|3f2a9c1e-0000-4000-8000-000000000001',
    `${CURSOR}|extra`,
    null,
    42,
  ])('rechaza %j', (cursor) => {
    expect(parseBookingsCursor(cursor)).toBeNull()
  })
})
