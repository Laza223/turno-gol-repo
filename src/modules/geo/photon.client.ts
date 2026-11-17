import { z } from 'zod'
import { fetchWithTimeout } from '@/shared/utils/async'
import { captureException } from '@/lib/sentry'
import { cleanPlaceName, dedupeByLabel, normalizeProvince } from './normalize'
import type { GeoAddress, GeoLocality } from './geo.types'

// OpenStreetMap vía Photon. Proveedor intercambiable: cambiar esta constante alcanza.
const PHOTON_BASE = 'https://photon.komoot.io'
const TIMEOUT_MS = 3500
const USER_AGENT = 'TurnoGol/1.0 (+https://turnogol.app)'
// Argentina continental + Tierra del Fuego (oeste, sur, este, norte).
const AR_BBOX = '-73.6,-55.1,-53.6,-21.7'
const LIMIT = 8

export type PhotonResult<T> = { ok: true; data: T } | { ok: false }

const featureSchema = z.object({
  properties: z
    .object({
      name: z.string().nullish(),
      street: z.string().nullish(),
      housenumber: z.string().nullish(),
      city: z.string().nullish(),
      town: z.string().nullish(),
      village: z.string().nullish(),
      county: z.string().nullish(),
      state: z.string().nullish(),
      countrycode: z.string().nullish(),
      osm_key: z.string().nullish(),
    })
    .partial(),
  geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]).rest(z.number()) }),
})
const collectionSchema = z.object({ features: z.array(z.unknown()) })

type Feature = z.infer<typeof featureSchema>

function features(json: unknown): Feature[] {
  const c = collectionSchema.safeParse(json)
  if (!c.success) return []
  return c.data.features.flatMap((f) => {
    const r = featureSchema.safeParse(f)
    // Photon no respeta el bbox del todo (devuelve Uruguay o Chile): se filtra por país.
    return r.success && r.data.properties.countrycode === 'AR' ? [r.data] : []
  })
}

const clean = (v: string | null | undefined) => (v ? cleanPlaceName(v) : '')

// "Partido de Luján" / "Departamento Rosario" → "Luján" / "Rosario".
const stripAdminPrefix = (s: string) => s.replace(/^(partido|departamento)\s+(de\s+)?/i, '')

/** Calles numeradas de OSM ("17 - Bartolomé Mitre") → "Bartolomé Mitre". */
const cleanStreet = (s: string) => s.replace(/^\d+\s*-\s*/, '')

/** Parser puro de localidades. Pueblos como Jáuregui (village) que el dataset no trae. */
export function parsePhotonPlaces(json: unknown): GeoLocality[] {
  const parsed = features(json).flatMap((f) => {
    const p = f.properties
    // Una calle o un comercio no es una localidad: solo `place=*` (city, town, village…).
    if (p.osm_key !== 'place') return []
    const city = clean(p.name) || clean(p.city) || clean(p.town) || clean(p.village)
    const state = clean(p.state)
    const [lng, lat] = f.geometry.coordinates
    if (!city || !state) return []
    const department = stripAdminPrefix(clean(p.county))
    return [
      {
        city,
        province: normalizeProvince(state),
        ...(department ? { department } : {}),
        lat,
        lng,
        source: 'osm' as const,
      },
    ]
  })
  const seen = new Set<string>()
  return parsed.filter((place) => {
    const key = `${place.city}|${place.province}|${place.department ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Parser puro de direcciones. Sin `housenumber` usa `fallbackNumber` (lo que escribió el usuario). */
export function parsePhotonAddresses(json: unknown, fallbackNumber?: string): GeoAddress[] {
  const parsed = features(json).flatMap((f) => {
    const p = f.properties
    const street = cleanStreet(clean(p.street) || (p.osm_key === 'highway' ? clean(p.name) : ''))
    const city =
      clean(p.city) || clean(p.town) || clean(p.village) || stripAdminPrefix(clean(p.county))
    const state = clean(p.state)
    const [lng, lat] = f.geometry.coordinates
    if (!street || !city || !state) return []
    const address = [street, clean(p.housenumber) || fallbackNumber].filter(Boolean).join(' ')
    const province = normalizeProvince(state)
    return [
      {
        label: `${address}, ${city}, ${province}`,
        address,
        city,
        province,
        lat,
        lng,
        source: 'osm' as const,
      },
    ]
  })
  return dedupeByLabel(parsed)
}

async function photonGet(path: string, params: URLSearchParams): Promise<PhotonResult<unknown>> {
  try {
    const res = await fetchWithTimeout(
      `${PHOTON_BASE}${path}?${params.toString()}`,
      { headers: { 'User-Agent': USER_AGENT } },
      TIMEOUT_MS,
    )
    if (!res.ok) {
      // Sin la URL: lleva lo que escribió el usuario o sus coordenadas.
      captureException(new Error(`Photon respondió ${res.status}`))
      return { ok: false }
    }
    return { ok: true, data: await res.json() }
  } catch (err) {
    captureException(new Error(err instanceof Error ? `Photon: ${err.name}` : 'Photon falló'))
    return { ok: false }
  }
}

type Bias = { lat: number; lng: number }

function searchParams(q: string, bias?: Bias): URLSearchParams {
  const params = new URLSearchParams({ q, limit: String(LIMIT), lang: 'default', bbox: AR_BBOX })
  if (bias) {
    params.set('lat', String(bias.lat))
    params.set('lon', String(bias.lng))
  }
  return params
}

export async function searchPhotonPlaces(
  q: string,
  { bias }: { bias?: Bias } = {},
): Promise<PhotonResult<GeoLocality[]>> {
  const params = searchParams(q, bias)
  params.append('osm_tag', 'place')
  const res = await photonGet('/api/', params)
  return res.ok ? { ok: true, data: parsePhotonPlaces(res.data) } : { ok: false }
}

export async function searchPhotonAddresses(
  q: string,
  { bias, fallbackNumber }: { bias?: Bias; fallbackNumber?: string } = {},
): Promise<PhotonResult<GeoAddress[]>> {
  const res = await photonGet('/api/', searchParams(q, bias))
  return res.ok ? { ok: true, data: parsePhotonAddresses(res.data, fallbackNumber) } : { ok: false }
}

/**
 * Localidad de un punto (pueblos que el dataset no trae). Manda las coordenadas a OSM: el
 * llamador las pasa ya redondeadas y solo la pide cuando Georef + dataset no resolvieron.
 */
export async function reversePhotonPlace(
  lat: number,
  lng: number,
): Promise<PhotonResult<GeoLocality | null>> {
  const res = await photonGet(
    '/reverse',
    new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
      lang: 'default',
      layer: 'city',
      // Por defecto busca a ~1 km: un pueblo a 3 km del centro quedaba sin resolver.
      radius: '5',
    }),
  )
  return res.ok ? { ok: true, data: parsePhotonPlaces(res.data)[0] ?? null } : { ok: false }
}

/** Calle y altura de un punto (`precision=address`: el dueño marca SU complejo). */
export async function reversePhoton(
  lat: number,
  lng: number,
): Promise<PhotonResult<GeoAddress | null>> {
  const res = await photonGet(
    '/reverse',
    new URLSearchParams({ lat: String(lat), lon: String(lng), lang: 'default' }),
  )
  return res.ok ? { ok: true, data: parsePhotonAddresses(res.data)[0] ?? null } : { ok: false }
}
