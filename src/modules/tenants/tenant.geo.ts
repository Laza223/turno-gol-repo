/**
 * Geografía del complejo: la lista de provincias que ofrece el formulario y el
 * centro con el que abre el mapa cuando el punto todavía no está cargado.
 *
 * Deliberadamente SIN geocodificador (Google Places, Mapbox, Nominatim): doc10
 * §82 ya decidió que la dirección es texto libre y el punto es opcional y
 * manual, para que el interior y las zonas rurales no queden bloqueados por un
 * proveedor que no los encuentra. Esta tabla de 24 filas es lo único que hace
 * falta para que el mapa no abra en medio del océano.
 */

export const PROVINCES = [
  'Buenos Aires',
  'CABA',
  'Catamarca',
  'Chaco',
  'Chubut',
  'Córdoba',
  'Corrientes',
  'Entre Ríos',
  'Formosa',
  'Jujuy',
  'La Pampa',
  'La Rioja',
  'Mendoza',
  'Misiones',
  'Neuquén',
  'Río Negro',
  'Salta',
  'San Juan',
  'San Luis',
  'Santa Cruz',
  'Santa Fe',
  'Santiago del Estero',
  'Tierra del Fuego',
  'Tucumán',
] as const

/** Centro del país. Último recurso: provincia vacía o escrita distinto. */
const COUNTRY_CENTER: [number, number] = [-38.4161, -63.6167]

/**
 * Capital de cada provincia, NO su centroide geométrico: el complejo está
 * muchísimo más cerca de la capital que del medio del desierto o de la meseta.
 *
 * Sin `export` a propósito: la consume sólo `resolveMapCenter`, en este mismo
 * archivo, y `knip` corre con `ignoreExportsUsedInFile` en falso — exportarla
 * la marcaría como código muerto y pondría el job en rojo.
 */
const PROVINCE_CENTERS: Record<string, [number, number]> = {
  'Buenos Aires': [-34.9215, -57.9545],
  CABA: [-34.6037, -58.3816],
  Catamarca: [-28.4696, -65.7852],
  Chaco: [-27.4514, -58.9867],
  Chubut: [-43.3002, -65.1023],
  Córdoba: [-31.4201, -64.1888],
  Corrientes: [-27.4692, -58.8306],
  'Entre Ríos': [-31.7333, -60.5297],
  Formosa: [-26.1849, -58.1731],
  Jujuy: [-24.1858, -65.2995],
  'La Pampa': [-36.6167, -64.2833],
  'La Rioja': [-29.4135, -66.8558],
  Mendoza: [-32.8895, -68.8458],
  Misiones: [-27.3621, -55.9008],
  Neuquén: [-38.9516, -68.0591],
  'Río Negro': [-40.8135, -62.9967],
  Salta: [-24.7859, -65.4117],
  'San Juan': [-31.5375, -68.5364],
  'San Luis': [-33.2951, -66.3356],
  'Santa Cruz': [-51.6226, -69.2181],
  'Santa Fe': [-31.6333, -60.7],
  'Santiago del Estero': [-27.7951, -64.2615],
  'Tierra del Fuego': [-54.8019, -68.303],
  Tucumán: [-26.8083, -65.2176],
}

/** Acercamiento del mapa según qué tan preciso es lo que sabemos. */
const ZOOM = { point: 16, province: 8, country: 4 } as const

export type MapCenter = { center: [number, number]; zoom: number }

/**
 * Dónde abrir el mapa: sobre el punto si ya está cargado, si no sobre la
 * provincia, y si la provincia no matchea, sobre el país.
 *
 * El último respaldo no es cosmético: los complejos existentes cargaron la
 * provincia como texto antes de que hubiera lista cerrada, así que en la base
 * puede haber `'Ciudad Autónoma de Buenos Aires'` donde acá dice `'CABA'`.
 */
export function resolveMapCenter(
  province: string | null | undefined,
  latitude: number | null,
  longitude: number | null,
): MapCenter {
  if (latitude !== null && longitude !== null) {
    return { center: [latitude, longitude], zoom: ZOOM.point }
  }
  const provinceCenter = province ? PROVINCE_CENTERS[province.trim()] : undefined
  if (provinceCenter) return { center: provinceCenter, zoom: ZOOM.province }
  return { center: COUNTRY_CENTER, zoom: ZOOM.country }
}
