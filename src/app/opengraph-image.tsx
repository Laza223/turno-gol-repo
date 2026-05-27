import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'TurnoGol — Reservá tu cancha de fútbol'

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          padding: 80,
        }}
      >
        <div style={{ fontSize: 96, fontWeight: 800, letterSpacing: -2 }}>TurnoGol</div>
        <div style={{ fontSize: 36, fontWeight: 500, marginTop: 24, opacity: 0.95 }}>
          Reservá tu cancha de fútbol
        </div>
        <div style={{ fontSize: 24, fontWeight: 400, marginTop: 12, opacity: 0.85 }}>
          Encontrá complejos en tu ciudad
        </div>
      </div>
    ),
    size,
  )
}
