/**
 * Faltantes de configuración que el sistema no exige pero que el jugador SÍ ve:
 * una cancha sin foto sale como un fondo verde vacío, un complejo sin portada
 * arranca el perfil sin imagen y sin coordenadas no aparece en el mapa de
 * Explorar. Como nada bloquea el alta, el dueño no se entera — por eso el aviso
 * vive donde se arregla y no en la checklist del Inicio, que se descarta para
 * siempre. Fuente única: cada pantalla que avisa lee de acá, así un faltante
 * nuevo se agrega en un solo lugar.
 */

type ProfileGapKey = 'cover' | 'logo' | 'map_location'

export interface ProfileGap {
  key: ProfileGapKey
  label: string
  /** Qué se pierde, dicho desde el lado del jugador. */
  impact: string
}

export function getProfileGaps(tenant: {
  coverUrl: string | null
  logoUrl: string | null
  latitude: number | null
  longitude: number | null
}): ProfileGap[] {
  const gaps: ProfileGap[] = []
  if (!tenant.coverUrl) {
    gaps.push({
      key: 'cover',
      label: 'Portada',
      impact: 'Tu página arranca sin imagen.',
    })
  }
  if (!tenant.logoUrl) {
    gaps.push({
      key: 'logo',
      label: 'Logo',
      impact: 'Tu página sale sin tu logo.',
    })
  }
  if (tenant.latitude == null || tenant.longitude == null) {
    gaps.push({
      key: 'map_location',
      label: 'Ubicación en el mapa',
      impact: 'No aparecés en el mapa de Explorar.',
    })
  }
  return gaps
}

/** Cantidad de canchas sin ninguna foto. */
export function countCourtsWithoutPhoto(courts: readonly { photos: readonly string[] }[]): number {
  return courts.filter((c) => c.photos.length === 0).length
}
