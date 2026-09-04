import { describe, expect, it } from 'vitest'
import { resolveStaffPanelPath } from '@/modules/auth/staff-panel-path'
import type { PlayerUser, StaffUser, SystemAdminUser } from '@/modules/auth/types'

const STAFF: StaffUser = {
  type: 'staff',
  id: 'auth-1',
  email: 'duenio@complejo.test',
  staffUserId: 'staff-1',
  tenantId: 'tenant-1',
  role: 'admin',
}

describe('resolveStaffPanelPath', () => {
  it('staff con complejo asignado va al panel', () => {
    expect(resolveStaffPanelPath(STAFF)).toBe('/dashboard')
  })

  it('staff sin complejo asignado va al selector', () => {
    // Cubre tanto "tiene varios complejos y todavía no eligió" como "tiene
    // cero": /select-tenant ya es el router y manda a /onboarding en ese caso.
    expect(resolveStaffPanelPath({ ...STAFF, tenantId: null })).toBe('/select-tenant')
  })

  it('staff sin staffUserId no muestra acceso', () => {
    // `staff` es el tipo POR DEFECTO en extractAuthUser: una cuenta a medio
    // aprovisionar cae acá. Mostrarle un botón la mandaría de vuelta a /login.
    expect(resolveStaffPanelPath({ ...STAFF, staffUserId: null, tenantId: null })).toBeNull()
    expect(resolveStaffPanelPath({ ...STAFF, staffUserId: null })).toBeNull()
  })

  it('jugador no muestra acceso: el portal ya tiene el suyo', () => {
    const player: PlayerUser = {
      type: 'player',
      id: 'auth-2',
      playerId: 'player-1',
      email: 'jugador@test.com',
    }
    expect(resolveStaffPanelPath(player)).toBeNull()
  })

  it('superadmin va a su panel interno', () => {
    const sa: SystemAdminUser = {
      type: 'system_admin',
      id: 'auth-3',
      email: 'admin@turnogol.test',
      systemAdminId: 'sa-1',
    }
    expect(resolveStaffPanelPath(sa)).toBe('/super-admin')
  })

  it('sin sesión no muestra acceso', () => {
    expect(resolveStaffPanelPath(null)).toBeNull()
  })
})
