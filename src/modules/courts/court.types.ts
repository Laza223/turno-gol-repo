export type PricingRule = {
  days: string[]
  from: string
  to: string
  price: number
}

export type CourtPricingData = {
  rules: PricingRule[]
}

export type SurfaceType = 'synthetic_grass' | 'natural_grass' | 'cement' | 'tile'

export type CourtRow = {
  id: string
  tenantId: string
  name: string
  description: string | null
  surfaceType: string
  isCovered: boolean
  hasLighting: boolean
  // Cambio #17: format = Fútbol N (4..11). capacity = jugadores totales = format × 2.
  format: number
  capacity: number
  photos: string[]
  status: 'online' | 'offline'
  pricing: CourtPricingData
  createdAt: Date
  updatedAt: Date
}

export type CreateCourtInput = {
  name: string
  description?: string
  surfaceType: SurfaceType
  // capacity NO se ingresa: se deriva (format × 2) en createCourt.
  format: number
  isCovered?: boolean
  hasLighting?: boolean
  pricing: CourtPricingData
}

export type UpdateCourtInput = Partial<CreateCourtInput>
