// Discriminated union de los 3 tipos de usuario auteticado.
// `id` siempre es el supabase auth.users.id.
// `staffUserId` / `playerId` apuntan a nuestras tablas globales.

export type StaffUser = {
  type: 'staff'
  id: string
  email: string
  staffUserId: string | null
  tenantId: string | null
  role: 'admin'
  // app_metadata.force_password_change: tras un reset del SuperAdmin el staff
  // entra con contraseña temporal y debe cambiarla. El layout del admin lo
  // empuja a /reset-password mientras el flag esté. Ausente en impersonación.
  forcePasswordChange?: boolean
}

export type PlayerUser = {
  type: 'player'
  id: string
  playerId: string
  email: string
}

export type SystemAdminUser = {
  type: 'system_admin'
  id: string
  email: string
  systemAdminId: string
}

export type AuthUser = StaffUser | PlayerUser | SystemAdminUser
