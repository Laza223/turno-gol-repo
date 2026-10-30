import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'RIVAL powered by TurnoGol — Cada partido cuenta.'

// Excepción documentada a DESIGN.md ("nada de hex inline"): satori no lee variables CSS ni tokens
// de Tailwind. Es la pizarra oscura de la landing de RIVAL.
const BACKGROUND = '#0b1220'
const INK = '#f8fafc'
const EMERALD = '#34d399'

/**
 * Vista previa de `/rival` (WhatsApp, etc.): pizarra oscura, el logo y la tesis. Sin datos, sin
 * red y sin consultar el flag: es estática. Las subrutas sin imagen propia (`/rival/tablon`...) la
 * heredan; `/rival/p/[code]` define la suya. Fuentes por defecto de satori; el logo ya tiene el
 * texto pasado a curvas, así que entra como imagen `data:` y no necesita ninguna.
 */
export default async function Image() {
  const logo = await readFile(join(process.cwd(), 'public/brand-assets/rival/rival-logo.svg'))
  const logoSrc = `data:image/svg+xml;base64,${logo.toString('base64')}`

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        background: BACKGROUND,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 80,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- satori, no el router de Next */}
      <img src={logoSrc} alt="" width={900} height={180} />
      <div
        style={{
          display: 'flex',
          marginTop: 56,
          fontSize: 88,
          fontWeight: 800,
          lineHeight: 1.05,
          color: INK,
        }}
      >
        Cada partido <span style={{ color: EMERALD, marginLeft: 24 }}>cuenta.</span>
      </div>
    </div>,
    size,
  )
}
