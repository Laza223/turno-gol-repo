/**
 * Contrato de las ubicaciones de Argentina (localidad, dirección, "dónde estoy").
 *
 * Solo TIPOS, sin imports de servidor: los Client Components pueden importar
 * este archivo sin arrastrar nada al bundle. Los produce `src/modules/geo/*`
 * (server) y los sirven los endpoints `GET /api/public/geo/*`.
 */

/** Una localidad elegible. `province` es siempre un nombre de `PROVINCES` (`src/shared/geo/argentina.ts`). */
export type GeoLocality = {
  /** Nombre canónico y limpio: "Luján", "General Rodríguez". */
  city: string
  province: string
  /** Partido o departamento, para desambiguar homónimos ("Mercedes", Buenos Aires vs Corrientes). */
  department?: string
  /** Centro de la localidad. `null` solo cuando la cargó el usuario a mano. */
  lat: number | null
  lng: number | null
  /** `dataset` = lista oficial propia (Georef); `osm` = OpenStreetMap, para pueblos que el dataset no trae. */
  source: 'dataset' | 'osm' | 'manual'
}

/** Una dirección con punto, lista para guardar en el complejo. */
export type GeoAddress = {
  /** Cómo se muestra en la lista: "Bartolomé Mitre 800, Luján, Buenos Aires". */
  label: string
  /** Calle y altura, en el formato que se guarda (`tenants.address`): "Bartolomé Mitre 800". */
  address: string
  city: string
  province: string
  lat: number
  lng: number
  source: 'georef' | 'osm'
}

/** Resultado de "usar mi ubicación": qué hay en ese punto. */
export type GeoReverse = {
  city: string
  province: string
  department?: string
  /** Solo con `precision=address` y si OpenStreetMap tiene la calle: "Bartolomé Mitre 800". */
  address?: string
  lat: number
  lng: number
}

/** Lo que el complejo guarda: el contrato del borrador del alta (`signupDraftSchema.complex`), sin cambios. */
export type PickedAddress = {
  address: string
  city: string
  province: string
  latitude: number | null
  longitude: number | null
}

/**
 * Respuestas de `GET /api/public/geo/*`.
 * `degraded: true` = los servicios externos fallaron (timeout, 5xx): `results` viene vacío
 * pero NO significa "no existe". La UI lo dice distinto y deja escribirla a mano.
 */
export type GeoLocalitiesResponse = { results: GeoLocality[]; degraded?: boolean }
export type GeoAddressesResponse = { results: GeoAddress[]; degraded?: boolean }
export type GeoReverseResponse = { result: GeoReverse | null; degraded?: boolean }
