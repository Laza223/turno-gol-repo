export type ToggleFavoriteResult = {
  favorited: boolean
}

// Tarjeta de complejo favorito para el perfil del jugador. Enriquecida con datos
// públicos del tenant (tabla global sin RLS, legible desde contexto de jugador).
export type FavoriteCard = {
  tenantId: string
  slug: string
  name: string
  city: string
  province: string
  logoUrl: string | null
  coverUrl: string | null
  fromPriceCents: number | null
  createdAt: Date
}
