import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: vi.fn() }))
vi.mock('@/modules/staff/staff.service', () => ({ getStaffRole: vi.fn() }))
vi.mock('@/modules/staff/guards', () => ({ lifecycleGateForStaff: vi.fn() }))
vi.mock('@/modules/tenants/tenant.service', () => ({ getStaffTenant: vi.fn() }))
vi.mock('@/modules/whatsapp-bot/whatsapp-bot.connection', () => ({
  getWhatsappPlusState: vi.fn(),
  registerWhatsappConnection: vi.fn(),
}))

import { GET } from '@/app/api/whatsapp/connect/callback/route'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { lifecycleGateForStaff } from '@/modules/staff/guards'
import { getStaffRole } from '@/modules/staff/staff.service'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import {
  getWhatsappPlusState,
  registerWhatsappConnection,
} from '@/modules/whatsapp-bot/whatsapp-bot.connection'

const APP_URL = 'https://app.test.local'

function get(qs: string) {
  // El host del request es otro a propósito: las redirecciones no pueden salir de ahí.
  return GET(new NextRequest(`https://evil.test/api/whatsapp/connect/callback${qs}`))
}

function location(res: Response): string {
  return res.headers.get('location') ?? ''
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('NEXT_PUBLIC_APP_URL', APP_URL)
  vi.mocked(extractAuthUser).mockResolvedValue({
    type: 'staff',
    id: 'u1',
    email: 'a@test.local',
    staffUserId: 'staff-1',
    tenantId: 'tenant-1',
    role: 'admin',
  } as never)
  vi.mocked(getStaffTenant).mockResolvedValue({ id: 'tenant-1', name: 'Uno' } as never)
  vi.mocked(getStaffRole).mockResolvedValue('admin')
  vi.mocked(lifecycleGateForStaff).mockResolvedValue('open')
  vi.mocked(getWhatsappPlusState).mockResolvedValue({ connection: null })
  vi.mocked(registerWhatsappConnection).mockResolvedValue({ ok: true })
})

describe('GET /api/whatsapp/connect/callback', () => {
  it('sin sesión de staff manda al login', async () => {
    vi.mocked(extractAuthUser).mockResolvedValue(null)
    expect(location(await get('?phone_number_id=pn-1'))).toBe(`${APP_URL}/login`)
    expect(registerWhatsappConnection).not.toHaveBeenCalled()
  })

  it.each([
    ['blocked', '/suspended'],
    ['read_only', '/reactivar'],
  ] as const)('un complejo %s no registra nada y va a %s', async (gate, path) => {
    vi.mocked(lifecycleGateForStaff).mockResolvedValue(gate)
    expect(location(await get('?phone_number_id=pn-1'))).toBe(`${APP_URL}${path}`)
    expect(registerWhatsappConnection).not.toHaveBeenCalled()
  })

  it('un encargado (no admin) no registra nada y ve el aviso de Ajustes', async () => {
    vi.mocked(getStaffRole).mockResolvedValue('manager')
    expect(location(await get('?phone_number_id=pn-1'))).toBe(
      `${APP_URL}/grilla?notice=settings-admin-only`,
    )
    expect(registerWhatsappConnection).not.toHaveBeenCalled()
  })

  it('con Plus apagado no registra nada', async () => {
    vi.mocked(getWhatsappPlusState).mockResolvedValue(null)
    expect(location(await get('?phone_number_id=pn-1'))).toBe(`${APP_URL}/settings`)
    expect(registerWhatsappConnection).not.toHaveBeenCalled()
  })

  it.each([
    '?fallo=1',
    '?error_code=access_denied&phone_number_id=pn-1',
    '',
    '?phone_number_id=..',
    '?phone_number_id=pn-1%2F..%2Fwebhooks',
  ])('si Kapso volvió con fallo o sin número (%s) es conexion_incompleta', async (qs) => {
    expect(location(await get(qs))).toBe(`${APP_URL}/settings/whatsapp?error=conexion_incompleta`)
    expect(registerWhatsappConnection).not.toHaveBeenCalled()
  })

  it('éxito: registra a nombre del admin y vuelve con conectado=1', async () => {
    const res = await get('?setup_link_id=s1&status=completed&phone_number_id=pn-1')
    expect(location(res)).toBe(`${APP_URL}/settings/whatsapp?conectado=1`)
    expect(registerWhatsappConnection).toHaveBeenCalledWith(
      { id: 'tenant-1', name: 'Uno' },
      'pn-1',
      'staff-1',
    )
  })

  it('un error del servicio vuelve con su código', async () => {
    vi.mocked(registerWhatsappConnection).mockResolvedValue({
      ok: false,
      error: 'numero_de_otro_complejo',
    })
    expect(location(await get('?phone_number_id=pn-1'))).toBe(
      `${APP_URL}/settings/whatsapp?error=numero_de_otro_complejo`,
    )
  })
})
