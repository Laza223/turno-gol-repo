// 2 roles fijos de staff (migración 029 quitó 'read_only'). NO es RBAC
// granular: cada rol mapea a un set cerrado de vistas, sin permisos configurables.
//   * admin   → acceso total (única que ve Configuración y gestiona Equipo)
//   * manager → Encargado: grilla + reservas + caja

export const STAFF_ROLES = ['admin', 'manager'] as const

export type StaffRole = (typeof STAFF_ROLES)[number]

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  admin: 'Administrador',
  manager: 'Encargado',
}

export const STAFF_ROLE_DESCRIPTIONS: Record<StaffRole, string> = {
  admin: 'Acceso total, incluida la configuración del complejo.',
  manager: 'Grilla, reservas y caja. Sin acceso a configuración.',
}

// Al invitar, el rol arranca en Encargado: sumar un admin con acceso total
// debe ser una decisión explícita, no el default.
export const DEFAULT_INVITE_ROLE: StaffRole = 'manager'
