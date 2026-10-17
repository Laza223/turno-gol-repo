/**
 * "Cómo llegar": búsqueda de Google Maps con las coordenadas del complejo o, si no las cargó, su
 * dirección. `null` sin ninguna de las dos: un link a una búsqueda vacía no lleva a ningún lado.
 */
export function buildDirectionsHref(place: {
  address: string
  city: string
  latitude: number | null
  longitude: number | null
}): string | null {
  const hasGeo = place.latitude != null && place.longitude != null
  if (!hasGeo && place.address.trim() === '') return null
  const query = hasGeo
    ? `${place.latitude},${place.longitude}`
    : encodeURIComponent(`${place.address}, ${place.city}`)
  return `https://www.google.com/maps/search/?api=1&query=${query}`
}
