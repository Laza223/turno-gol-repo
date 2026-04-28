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
