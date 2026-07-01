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

// Proyección pública: NO expone UUIDs internos (playerId/bookingId) — Ley 25.326.
type PublicReviewItem = {
  id: string
  rating: number
  comment: string | null
  createdAt: Date
}

export type ReviewsPage = {
  reviews: PublicReviewItem[]
  total: number
}
