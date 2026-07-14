import { daysFromNow, hoursFromNow } from './clock'
import { uid } from './ids'
import { tenant } from './tenant'

/**
 * `staff_users` + `tenant_staff_members` no tienen un `*.types.ts` propio.
 * Shape a mano en base a `StaffRosterMember` (`staff.service.ts`, server-only,
 * NO importable) y a `staff_role` de CLAUDE.md: solo `admin` | `manager`
 * (migr. 029 quitó `read_only`, sin sistema de PIN).
 */
export type StaffRole = 'admin' | 'manager'

export type StaffMember = {
  /** id de la fila en tenant_staff_members (la membresía, no el staff_user). */
  id: string
  staffUserId: string
  tenantId: string
  firstName: string
  lastName: string
  email: string
  role: StaffRole
  isActive: boolean
  createdAt: Date
  lastLoginAt: Date | null
}

export const staffMember = (overrides: Partial<StaffMember> = {}): StaffMember => ({
  id: uid(301),
  staffUserId: uid(301),
  tenantId: tenant().id,
  firstName: 'Marcelo',
  lastName: 'Gómez',
  email: 'marcelo@complejofenix.com.ar',
  role: 'admin',
  isActive: true,
  createdAt: daysFromNow(-400),
  lastLoginAt: hoursFromNow(-1),
  ...overrides,
})

/** Encargado (Rodrigo, persona doc3) — sin acceso a Configuración ni Equipo. */
export const staffManager = (): StaffMember =>
  staffMember({
    id: uid(302),
    staffUserId: uid(302),
    firstName: 'Rodrigo',
    lastName: 'Fernández',
    email: 'rodrigo@complejofenix.com.ar',
    role: 'manager',
    lastLoginAt: hoursFromNow(-26),
  })

/** Encargada con nombre largo + de baja (invitación revocada / ex-empleada). */
export const staffInactive = (): StaffMember =>
  staffMember({
    id: uid(303),
    staffUserId: uid(303),
    firstName: 'Julieta',
    lastName: 'Domínguez Belgrano',
    email: 'julieta.dominguez.belgrano@complejofenix.com.ar',
    role: 'manager',
    isActive: false,
    lastLoginAt: daysFromNow(-60),
  })

export const staffMembers = (): StaffMember[] => [staffMember(), staffManager(), staffInactive()]
