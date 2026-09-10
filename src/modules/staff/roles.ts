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

// H070: la descripción del manager listaba solo grilla/reservas/caja y omitía
// que también entra a Clientes, Torneos (tras su feature flag) y Métricas
// (reducidas) — settings/layout.tsx bloquea TODO /settings/* (incluida
// Equipo) con requireAdminStaff, así que "sin acceso a configuración" ya
// cubre Equipo, no hace falta nombrarla aparte.
export const STAFF_ROLE_DESCRIPTIONS: Record<StaffRole, string> = {
  admin: 'Acceso total, incluida la configuración del complejo.',
  manager: 'Grilla, reservas, caja, clientes, torneos y métricas. Sin acceso a configuración.',
}

// Al invitar, el rol arranca en Encargado: sumar un admin con acceso total
// debe ser una decisión explícita, no el default.
export const DEFAULT_INVITE_ROLE: StaffRole = 'manager'

// H163: el manager que entra a cualquier pestaña de /settings/* rebotaba a
// /grilla en silencio — "no pasó nada" parecía un bug de la app. El rebote
// (settings/layout.tsx) ahora agrega este código como `?notice=` al redirect
// y grilla/page.tsx lo traduce al toast de abajo. Un solo lugar para el
// código y el texto evita que layout.tsx y grilla/page.tsx diverjan.
export const SETTINGS_ADMIN_ONLY_NOTICE = 'settings-admin-only'
export const SETTINGS_ADMIN_ONLY_NOTICE_TITLE = 'No tenés acceso a Configuración'
export const SETTINGS_ADMIN_ONLY_NOTICE_DESCRIPTION = 'Es solo del dueño del complejo.'
