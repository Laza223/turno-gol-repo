export type ReviewRow = {
  id: string
  tenantId: string
  playerId: string
  bookingId: string
  rating: number
  comment: string | null
  createdAt: Date
}

export type RatingSummary = {
  // Promedio de calificaciones, 0 si no hay reseñas. Redondeado a 2 decimales.
  average: number
  count: number
}

export type ReviewsPage = {
  reviews: ReviewRow[]
  total: number
}
