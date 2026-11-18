import { PROVINCES } from '@/shared/geo/argentina'
import type {
  GeoAddress,
  GeoAddressesResponse,
  GeoLocalitiesResponse,
  GeoLocality,
  GeoReverseResponse,
} from './geo.types'
import {
  reverseGeorefLocation,
  searchGeorefAddresses,
  type GeorefAddressInput,
} from './georef.client'
import { nearestLocality, searchLocalities } from './localities.service'
import { comparable } from './normalize'
import {
  reversePhoton,
  reversePhotonPlace,
  searchPhotonAddresses,
  searchPhotonPlaces,
} from './photon.client'

const MAX_LOCALITIES = 8
// Debajo de esto el dataset "no alcanza" y se completa con OpenStreetMap.
const MIN_DATASET_RESULTS = 3
const MIN_OSM_QUERY_LENGTH = 3
// Si OpenStreetMap no sabe dónde es, la localidad del dataset a esta distancia o menos "es" donde está.
const NEAREST_LOCALITY_MAX_KM = 6
// Argentina continental, Tierra del Fuego e islas (sur, norte, oeste, este).
const AR_BOUNDS = { minLat: -55.1, maxLat: -21.7, minLng: -73.6, maxLng: -53.6 }

const KNOWN_PROVINCES: ReadonlySet<string> = new Set(PROVINCES)
const localityKey = (l: Pick<GeoLocality, 'city' | 'province'>) =>
  `${comparable(l.city)}|${comparable(l.province)}`

/** Localidades: el dataset primero; OpenStreetMap solo completa lo que el dataset no trae. */
export async function findLocalities(q: string): Promise<GeoLocalitiesResponse> {
  const results = searchLocalities(q, { limit: MAX_LOCALITIES })
  if (results.length >= MIN_DATASET_RESULTS || q.trim().length < MIN_OSM_QUERY_LENGTH) {
    return { results }
  }

  const osm = await searchPhotonPlaces(q)
  if (!osm.ok) return results.length === 0 ? { results, degraded: true } : { results }

  const seen = new Set(results.map(localityKey))
  for (const place of osm.data) {
    if (results.length >= MAX_LOCALITIES) break
    if (!KNOWN_PROVINCES.has(place.province) || seen.has(localityKey(place))) continue
    seen.add(localityKey(place))
    results.push(place)
  }
  return { results }
}

/** "Mitre 800" → "800". Solo si la calle termina en número. */
function trailingNumber(street: string): string | undefined {
  return /(?:^|\s)(\d{1,5})\s*$/.exec(street)?.[1]
}

/** Direcciones: Georef; OpenStreetMap solo si Georef no encontró nada. */
export async function findAddresses(input: GeorefAddressInput): Promise<GeoAddressesResponse> {
  const georef = await searchGeorefAddresses(input)
  if (georef.ok && georef.data.length > 0) return { results: georef.data }

  const query = [input.street, input.city ?? input.department, input.province]
    .filter(Boolean)
    .join(' ')
  const osm = await searchPhotonAddresses(query, { fallbackNumber: trailingNumber(input.street) })
  if (!osm.ok) return georef.ok ? { results: [] } : { results: [], degraded: true }

  // Provincia Y localidad: elegir un candidato pisa la ciudad del complejo, así que uno de
  // otro pueblo de la misma provincia dejaría la dirección en el lugar equivocado.
  const province = input.province ? comparable(input.province) : null
  const city = input.city ? comparable(input.city) : null
  const results: GeoAddress[] = osm.data.filter(
    (a) =>
      (!province || comparable(a.province) === province) && (!city || comparable(a.city) === city),
  )
  return { results }
}

function inArgentina(lat: number, lng: number): boolean {
  return (
    lat >= AR_BOUNDS.minLat &&
    lat <= AR_BOUNDS.maxLat &&
    lng >= AR_BOUNDS.minLng &&
    lng <= AR_BOUNDS.maxLng
  )
}

/**
 * "Usar mi ubicación". Georef pone la provincia y el partido; OpenStreetMap dice qué pueblo es
 * (Jáuregui, no el barrio vecino del dataset) y solo vale si coincide en provincia. Si OSM no
 * contesta, queda la localidad del dataset a ≤ 6 km o, si no, el partido. `address` además
 * pide la calle, y si falla igual devuelve la localidad. Las tres consultas van en paralelo.
 */
export async function locate(
  lat: number,
  lng: number,
  precision: 'locality' | 'address',
): Promise<GeoReverseResponse> {
  if (!inArgentina(lat, lng)) return { result: null }

  const [georef, osmPlace, osmAddress] = await Promise.all([
    reverseGeorefLocation(lat, lng),
    reversePhotonPlace(lat, lng),
    precision === 'address' ? reversePhoton(lat, lng) : null,
  ])
  if (!georef.ok) return { result: null, degraded: true }
  const place = georef.data
  if (!place) return { result: null }

  const osm =
    osmPlace.ok &&
    osmPlace.data &&
    comparable(osmPlace.data.province) === comparable(place.province)
      ? osmPlace.data
      : null
  const wide = osm
    ? null
    : nearestLocality(lat, lng, {
        departmentId: place.departmentId,
        maxKm: NEAREST_LOCALITY_MAX_KM,
      })
  const city = osm?.city ?? wide?.city ?? place.municipality ?? place.department
  if (!city) return { result: null }
  const department = place.department ?? wide?.department ?? osm?.department

  const result = {
    city,
    province: place.province,
    ...(department ? { department } : {}),
    lat,
    lng,
  }
  const street = osmAddress?.ok ? osmAddress.data?.address : undefined
  return { result: street ? { ...result, address: street } : result }
}
