// Respuestas reales (recortadas) de Georef y Photon, con datos genéricos.

export const GEOREF_ADDRESSES = {
  cantidad: 1,
  direcciones: [
    {
      altura: { unidad: null, valor: 800 },
      calle: { categoria: 'CALLE', id: '0649702000355', nombre: 'BARTOLOME MITRE' },
      departamento: { id: '06497', nombre: 'Luján' },
      localidad_censal: { id: '06497020', nombre: 'Luján' },
      nomenclatura: 'BARTOLOME MITRE 800, Luján, Buenos Aires',
      provincia: { id: '06', nombre: 'Buenos Aires' },
      ubicacion: { lat: -34.5680547443743, lon: -59.1116388044861 },
    },
  ],
}

export const GEOREF_EMPTY = { cantidad: 0, direcciones: [] }

export const GEOREF_LOCATION = {
  ubicacion: {
    departamento: { id: '06497', nombre: 'Luján' },
    municipio: { id: '060497', nombre: 'Luján' },
    provincia: { id: '06', nombre: 'Buenos Aires' },
  },
}

export const PHOTON_JAUREGUI = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        osm_key: 'place',
        osm_value: 'village',
        name: 'Jaureguiberry',
        state: 'Canelones',
        country: 'Uruguay',
        countrycode: 'UY',
      },
      geometry: { type: 'Point', coordinates: [-55.4013317, -34.7828121] },
    },
    {
      type: 'Feature',
      properties: {
        osm_key: 'place',
        osm_value: 'village',
        name: 'Jáuregui',
        county: 'Partido de Luján',
        state: 'Buenos Aires',
        country: 'Argentina',
        postcode: '6706',
        countrycode: 'AR',
      },
      geometry: { type: 'Point', coordinates: [-59.1741206, -34.6001591] },
    },
  ],
}

export const PHOTON_MITRE_HOUSE = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        osm_key: 'place',
        osm_value: 'house',
        housenumber: '800',
        street: '17 - Bartolomé Mitre',
        city: 'Luján',
        county: 'Partido de Luján',
        state: 'Buenos Aires',
        countrycode: 'AR',
      },
      geometry: { type: 'Point', coordinates: [-59.1117603, -34.5679067] },
    },
  ],
}

// La calle sin altura: el caso en que se usa la que escribió el usuario.
export const PHOTON_MITRE_STREET = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        osm_key: 'highway',
        osm_value: 'residential',
        name: 'Bartolomé Mitre',
        city: 'Luján',
        state: 'Buenos Aires',
        countrycode: 'AR',
      },
      geometry: { type: 'Point', coordinates: [-59.11, -34.568] },
    },
  ],
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
