import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TenantRow } from '@/modules/tenants/tenant.types'

vi.mock('@/lib/sentry', () => ({ captureException: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: vi.fn() }))
vi.mock('@/modules/tenants/tenant.service', () => ({ getStaffTenant: vi.fn() }))

import { captureException } from '@/lib/sentry'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { parseGeorefResponse, searchAddress } from '@/modules/tenants/geocode.service'
import { requireAuthenticatedStaffAction } from '@/modules/staff/guards'

/** Respuesta real verificada contra Georef el 2026-09-15 (ver contrato). */
const RESPUESTA_REAL = {
  cantidad: 1,
  total: 1,
  results: [
    {
      nomenclatura: 'BV ORONO 1500, Rosario, Santa Fe',
      ubicacion: { lat: -32.9522688313066, lon: -60.6555845314547 },
    },
  ],
}

describe('parseGeorefResponse', () => {
  it('parsea la respuesta real de Georef en un candidato', () => {
    expect(parseGeorefResponse(RESPUESTA_REAL)).toEqual([
      {
        label: 'BV ORONO 1500, Rosario, Santa Fe',
        lat: -32.9522688313066,
        lng: -60.6555845314547,
      },
    ])
  })

  it('cantidad: 0 es un resultado normal, no un error', () => {
    expect(parseGeorefResponse({ cantidad: 0, total: 0, results: [] })).toEqual([])
  })

  it('descarta un resultado sin ubicación pero conserva los demás', () => {
    const conUnoRoto = {
      cantidad: 2,
      results: [
        { nomenclatura: 'Sin coordenadas 100, Rosario, Santa Fe' },
        {
          nomenclatura: 'BV ORONO 1500, Rosario, Santa Fe',
          ubicacion: { lat: -32.95, lon: -60.65 },
        },
      ],
    }
    expect(parseGeorefResponse(conUnoRoto)).toEqual([
      { label: 'BV ORONO 1500, Rosario, Santa Fe', lat: -32.95, lng: -60.65 },
    ])
  })

  it('JSON basura no tira: devuelve []', () => {
    expect(parseGeorefResponse('esto no es un objeto')).toEqual([])
    expect(parseGeorefResponse(null)).toEqual([])
    expect(parseGeorefResponse(42)).toEqual([])
    expect(parseGeorefResponse({ resultado: 'formato inventado' })).toEqual([])
  })
})

describe('searchAddress', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('devuelve los candidatos de una respuesta 200 válida', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(RESPUESTA_REAL), { status: 200 })),
    )
    const result = await searchAddress({
      address: 'Bv Orono 1500',
      city: 'Rosario',
      province: 'Santa Fe',
    })
    expect(result).toEqual([
      { label: 'BV ORONO 1500, Rosario, Santa Fe', lat: -32.9522688313066, lng: -60.6555845314547 },
    ])
    expect(captureException).not.toHaveBeenCalled()
  })

  it('un fetch que rechaza (red caída) reporta y devuelve []', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down')
      }),
    )
    const result = await searchAddress({ address: 'Cualquiera 123' })
    expect(result).toEqual([])
    expect(captureException).toHaveBeenCalled()
  })

  it('un status distinto de 200 reporta y devuelve []', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('boom', { status: 500 })),
    )
    const result = await searchAddress({ address: 'Cualquiera 123' })
    expect(result).toEqual([])
    expect(captureException).toHaveBeenCalled()
  })

  it('un cuerpo que no es JSON reporta y devuelve []', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>no soy json</html>', { status: 200 })),
    )
    const result = await searchAddress({ address: 'Cualquiera 123' })
    expect(result).toEqual([])
    expect(captureException).toHaveBeenCalled()
  })
})

// Hallazgo 🔴 2 (auditoría 2026-09-16): `geocodeAddressAction` corría detrás de
// `requireAdminStaffAction`, que exige un tenant ya creado — el paso 1 del
// wizard de onboarding llama esa MISMA action ANTES de que el tenant exista
// (alta nueva), así que el buscador de dirección tiraba "Tenant no
// encontrado" a todo dueño nuevo. `requireAuthenticatedStaffAction` es el
// guard que reemplaza esa dependencia: mismo chequeo de identidad que
// `createTenantAction` usa para el alta, pero sin exigir tenant.
describe('requireAuthenticatedStaffAction — guard pre-tenant del buscador de dirección', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  function staffUser(tenantId: string | null) {
    return {
      type: 'staff' as const,
      id: 'auth-1',
      email: 'nuevo@duenio.com',
      staffUserId: 'staff-1',
      tenantId,
      role: 'admin' as const,
    }
  }

  it('deja pasar a un staff autenticado SIN tenant todavía (alta nueva, wizard paso 1)', async () => {
    vi.mocked(extractAuthUser).mockResolvedValue(staffUser(null))
    vi.mocked(getStaffTenant).mockResolvedValue(null)

    const result = await requireAuthenticatedStaffAction()

    expect(result).toEqual({
      ok: true,
      user: expect.objectContaining({ staffUserId: 'staff-1' }),
      tenant: null,
    })
  })

  it('devuelve el tenant si ya existe (revisita de /settings/perfil o del paso 1)', async () => {
    const tenant = { id: 'tenant-1' } as unknown as TenantRow
    vi.mocked(extractAuthUser).mockResolvedValue(staffUser('tenant-1'))
    vi.mocked(getStaffTenant).mockResolvedValue(tenant)

    const result = await requireAuthenticatedStaffAction()

    expect(result.ok).toBe(true)
    expect(result.ok && result.tenant?.id).toBe('tenant-1')
  })

  it('redirige a /login si no hay sesión de staff (no es un open relay)', async () => {
    vi.mocked(extractAuthUser).mockResolvedValue(null)

    await expect(requireAuthenticatedStaffAction()).rejects.toThrow('REDIRECT:/login')
    expect(getStaffTenant).not.toHaveBeenCalled()
  })

  it('redirige a /login si la sesión es de un jugador, no de staff', async () => {
    vi.mocked(extractAuthUser).mockResolvedValue({
      type: 'player',
      id: 'auth-2',
      playerId: 'player-1',
      email: 'jugador@test.com',
    })

    await expect(requireAuthenticatedStaffAction()).rejects.toThrow('REDIRECT:/login')
    expect(getStaffTenant).not.toHaveBeenCalled()
  })
})
