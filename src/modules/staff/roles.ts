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

/**
 * "Espacios" del panel para la sección "Qué ve cada persona" de Equipo
 * (`StaffRosterView.tsx`, rediseño Configuración → Equipo). Copia manual del
 * mismo criterio `requiresAdmin` que ya aplica `NAV_ITEMS`/`CONFIG_ITEM` en
 * `src/components/layout/admin-sidebar.tsx` — ese archivo es 'use client'
 * (hooks de navegación) y no es importable desde un módulo de dominio, así
 * que esta lista NO se deriva de ahí. Si se agrega, saca o resignifica un
 * espacio del riel, actualizar esta lista a mano.
 */
export type StaffRoleSpace = {
  label: string
  /** Solo lo ve el rol admin (mismo criterio que `requiresAdmin` en admin-sidebar.tsx). */
  adminOnly: boolean
  /** Se omite del todo (ni check ni lock) si el feature flag 'tournaments' está apagado para el tenant. */
  requiresTournaments?: boolean
}

export const STAFF_ROLE_SPACES: StaffRoleSpace[] = [
  { label: 'Hoy', adminOnly: true },
  { label: 'Grilla', adminOnly: false },
  { label: 'Caja', adminOnly: false },
  { label: 'Clientes', adminOnly: false },
  { label: 'Canchas', adminOnly: true },
  { label: 'Torneos', adminOnly: false, requiresTournaments: true },
  { label: 'Métricas', adminOnly: false },
  { label: 'Configuración', adminOnly: true },
]

/** Taglines cortas de la misma sección — presentación, no autorización (la
 *  autorización real vive en requireAdminStaff/getStaffRole). */
export const STAFF_ROLE_TAGLINES: Record<StaffRole, string> = {
  admin: 'Todo el panel, incluida esta Configuración.',
  manager: 'Opera el día a día. No toca precios ni configuración.',
}
