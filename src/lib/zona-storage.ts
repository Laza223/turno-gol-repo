/**
 * Zona del jugador (la localidad desde la que busca canchas), guardada en el dispositivo
 * para no volver a pedirle la ubicación en cada visita. Mismo criterio que
 * `referral-storage.ts`: client-safe (sin drizzle ni `next/server`) y localStorage
 * best-effort — en modo privado o con el storage bloqueado seguimos sin persistir.
 *
 * Por qué localStorage y no cookie: la home es estática (`revalidate`), y leer una cookie en el
 * server la volvería dinámica. Además así no se toca la política de cookies de /privacidad.
 *
 * Privacidad: la ciudad es un dato grueso; lo que se GUARDA y va en la URL de "Más cercano" son
 * coordenadas redondeadas a ~1 km. La consulta puntual de "Usar mi ubicación" sí manda la posición
 * exacta a nuestro propio API (`/api/public/search`) para hallar el complejo más cercano; no se guarda.
 */
export const ZONA_STORAGE_KEY = 'turnogol:zona'

/** Marca de pestaña: la zona ya se aplicó (o se descartó a propósito) al entrar a /explorar. */
const ZONA_APPLIED_KEY = 'turnogol:zona-aplicada'

export type SavedZona = {
  /** Para pre-llenar el buscador. */
  city?: string
  province?: string
  /** ~1 km de precisión (ver `roundCoord`); solo sirven para ordenar por cercanía. */
  lat?: number
  lng?: number
}

const COORD_DECIMALS = 2

/** ~1.1 km en latitud: alcanza para "Más cercano" y no revela dónde vive la persona. */
export function roundCoord(value: number): number {
  return Number(value.toFixed(COORD_DECIMALS))
}

function isCoord(value: unknown, limit: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit
}

/** `null` ante cualquier cosa que no sea una zona válida (JSON roto, versión vieja, vacío). */
export function parseZona(raw: string | null): SavedZona | null {
  if (!raw) return null
  try {
    const data: unknown = JSON.parse(raw)
    if (typeof data !== 'object' || data === null) return null
    const record = data as Record<string, unknown>
    const zona: SavedZona = {}
    if (typeof record.city === 'string' && record.city) {
      zona.city = record.city
      if (typeof record.province === 'string' && record.province) zona.province = record.province
    }
    if (isCoord(record.lat, 90) && isCoord(record.lng, 180)) {
      zona.lat = record.lat
      zona.lng = record.lng
    }
    return zona.city !== undefined || zona.lat !== undefined ? zona : null
  } catch {
    return null
  }
}

export function serializeZona(zona: SavedZona): string {
  return JSON.stringify(zona)
}

/**
 * Aplica `patch` sobre la zona vigente. Si el patch trae OTRA ciudad, las coordenadas
 * viejas se descartan (a menos que el patch traiga las suyas): "Más cercano" ordenaría
 * desde un lugar que ya no es el de la ciudad elegida.
 */
export function mergeZona(prev: SavedZona | null, patch: SavedZona): SavedZona {
  const hasCityPatch = patch.city !== undefined
  const cityChanged =
    hasCityPatch && (patch.city !== prev?.city || (patch.province ?? '') !== (prev?.province ?? ''))

  const city = hasCityPatch ? patch.city : prev?.city
  const province = hasCityPatch ? patch.province : prev?.province
  const lat = patch.lat ?? (cityChanged ? undefined : prev?.lat)
  const lng = patch.lng ?? (cityChanged ? undefined : prev?.lng)

  const next: SavedZona = {}
  if (city) {
    next.city = city
    if (province) next.province = province
  }
  if (lat !== undefined && lng !== undefined) {
    next.lat = lat
    next.lng = lng
  }
  return next
}

/** Respaldo cuando sessionStorage está bloqueado: sin esto el filtro de ciudad no se podría sacar. */
let appliedInMemory = false

export function wasZonaApplied(): boolean {
  if (appliedInMemory) return true
  try {
    return sessionStorage.getItem(ZONA_APPLIED_KEY) !== null
  } catch {
    return false
  }
}

export function markZonaApplied(): void {
  appliedInMemory = true
  try {
    sessionStorage.setItem(ZONA_APPLIED_KEY, '1')
  } catch {
    // Storage bloqueado: queda solo la marca en memoria (vale mientras no se recargue la página).
  }
}
