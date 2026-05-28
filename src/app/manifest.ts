import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'TurnoGol',
    short_name: 'TurnoGol',
    description: 'Reservá tu cancha de fútbol en Argentina. Encontrá complejos y horarios disponibles cerca tuyo.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    theme_color: '#059669',
    background_color: '#F8FAFC',
    lang: 'es-AR',
    icons: [
      { src: '/icon', sizes: '32x32', type: 'image/png' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  }
}
