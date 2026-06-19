export type PricingRule = {
  days: string[]
  from: string
  to: string
  price: number
}

export type CourtPricingData = {
  rules: PricingRule[]
}

export type CourtRow = {
  id: string
  tenantId: string
  name: string
  description: string | null
  surfaceType: string
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
  surfaceType: 'synthetic_grass' | 'natural_grass' | 'cement' | 'indoor'
  capacity: number
  pricing: CourtPricingData
}

export type UpdateCourtInput = Partial<CreateCourtInput>
