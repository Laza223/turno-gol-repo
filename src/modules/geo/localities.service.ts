import data from './data/localities.json'
import { comparable } from './normalize'
import type { GeoLocality } from './geo.types'

type Entry = {
  locality: GeoLocality
  name: string
  nameWords: string[]
  haystack: string
  departmentId: string
  cabecera: boolean
}

const DEFAULT_LIMIT = 8
const MIN_QUERY_LENGTH = 2

let entries: Entry[] | null = null

// Se arma una vez por proceso: ~4.700 filas, unos pocos ms.
function load(): Entry[] {
  if (entries) return entries
  entries = data.rows.map((row) => {
    const [city, provinceIdx, department, lat, lng, , departmentId] = row as [
      string,
      number,
      string,
      number,
      number,
      string | null,
      string,
    ]
    const province = data.provinces[provinceIdx] ?? ''
    const name = comparable(city)
    const departmentKey = comparable(department)
    return {
      locality: { city, province, department, lat, lng, source: 'dataset' },
      name,
      nameWords: name.split(' '),
      haystack: `${name} ${comparable(province)} ${departmentKey}`,
      departmentId,
      cabecera: name === departmentKey,
    }
  })
  return entries
}

// 0 exacto · 1 el nombre empieza con la consulta · 2 alguna palabra empieza · 3 substring.
function tier(entry: Entry, nameQuery: string): number {
  if (entry.name === nameQuery) return 0
  if (entry.name.startsWith(nameQuery)) return 1
  if (entry.nameWords.some((w) => w.startsWith(nameQuery))) return 2
  return 3
}

/**
 * Busca en el dataset en memoria. Todos los tokens deben aparecer en
 * nombre + provincia + departamento ("lujan buenos aires"); el ranking mira
 * solo los tokens que caen en el nombre.
 */
export function searchLocalities(
  query: string,
  { limit = DEFAULT_LIMIT }: { limit?: number } = {},
): GeoLocality[] {
  const q = comparable(query)
  if (q.length < MIN_QUERY_LENGTH) return []
  const tokens = q.split(' ')

  const ranked: Array<{ entry: Entry; tier: number }> = []
  for (const entry of load()) {
    if (!tokens.every((t) => entry.haystack.includes(t))) continue
    const inName = tokens.filter((t) => entry.name.includes(t)).join(' ')
    ranked.push({ entry, tier: inName ? tier(entry, inName) : 4 })
  }

  ranked.sort(
    (a, b) =>
      a.tier - b.tier ||
      Number(b.entry.cabecera) - Number(a.entry.cabecera) ||
      a.entry.locality.province.localeCompare(b.entry.locality.province, 'es') ||
      a.entry.name.localeCompare(b.entry.name, 'es'),
  )
  return ranked.slice(0, Math.max(0, limit)).map((r) => r.entry.locality)
}

const EARTH_RADIUS_KM = 6371

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a))
}

/** La localidad del dataset más cercana al punto, a `maxKm` o menos y (opcional) del mismo departamento. */
export function nearestLocality(
  lat: number,
  lng: number,
  { departmentId, maxKm }: { departmentId?: string; maxKm: number },
): GeoLocality | null {
  let best: GeoLocality | null = null
  let bestKm = maxKm
  for (const entry of load()) {
    if (departmentId && entry.departmentId !== departmentId) continue
    const { lat: eLat, lng: eLng } = entry.locality
    if (eLat === null || eLng === null) continue
    const km = haversineKm(lat, lng, eLat, eLng)
    if (km <= bestKm) {
      best = entry.locality
      bestKm = km
    }
  }
  return best
}
