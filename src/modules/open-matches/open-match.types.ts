export type OpenMatchStatus = 'open' | 'full' | 'canceled' | 'completed'

// Restricciones libres del partido. Todas opcionales.
export type OpenMatchRestrictions = {
  gender?: 'male' | 'female' | 'mixed'
  level?: 'beginner' | 'intermediate' | 'advanced'
  minAge?: number
  notes?: string
}

export type OpenMatchRow = {
  id: string
  bookingId: string
  creatorPlayerId: string
  tenantId: string
  slotsTotal: number
  slotsFilled: number
  restrictions: OpenMatchRestrictions
  status: OpenMatchStatus
  createdAt: Date
  expiresAt: Date | null
}

// Datos públicos del complejo (tabla global, joinable sin RLS) para la vitrina.
export type OpenMatchTenantInfo = {
  slug: string
  name: string
  city: string
  province: string
  logoUrl: string | null
}

// Tarjeta pública de "Falta Uno". expiresAt = horario de inicio del partido.
// NO expone creatorPlayerId/bookingId (UUIDs internos — Ley 25.326); el detalle
// de cancha/booking requiere una consulta autenticada aparte (bookings es
// tenant-isolated por RLS y no se expone públicamente).
export type OpenMatchCard = {
  id: string
  tenantId: string
  slotsTotal: number
  slotsFilled: number
  slotsRemaining: number
  restrictions: OpenMatchRestrictions
  status: OpenMatchStatus
  createdAt: Date
  expiresAt: Date | null
  tenant: OpenMatchTenantInfo
}

export type OpenMatchFilters = {
  tenantId?: string
  city?: string
  province?: string
  status?: OpenMatchStatus
  limit?: number
  offset?: number
}

export type OpenMatchesPage = {
  matches: OpenMatchCard[]
  total: number
}
