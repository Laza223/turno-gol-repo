import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { ImageResponse } from 'next/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'TurnoGol — La plataforma de reservas para el fútbol argentino'

// Excepción documentada a DESIGN.md ("nada de hex inline"): satori no lee variables CSS ni tokens
// de Tailwind. Marca: logotipo en Archivo 900 itálica (la misma fuente de `<Logo />`) e isotipo
// de `LogoMark`, sobre el navy de la marca.
const NAVY = '#020617'
const MINT = '#1de9b0'

// Literal a propósito: el tracing de Next sólo incluye en el deploy lo que ve como
// `path.join(process.cwd(), 'literal')`.
const archivo = readFile(
  path.join(process.cwd(), 'src/lib/story-image/fonts/archivo-latin-900-italic.woff'),
)
const inter = readFile(
  path.join(process.cwd(), 'src/lib/story-image/fonts/inter-latin-600-normal.woff'),
)

export default async function OpenGraphImage() {
  const [archivoData, interData] = await Promise.all([archivo, inter])
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        background: NAVY,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        padding: 80,
        fontFamily: 'Inter',
      }}
    >
      <svg width="260" height="160" viewBox="240 385 795 490">
        <path
          fill="white"
          d="M345 389H967L871 499H590C570 503 556 515 545 535L430 780C415 818 395 830 372 834L245 870L425 499H246Z"
        />
        <path
          fill={MINT}
          d="M580 565C592 540 620 525 657 525H1030L953 621H710C690 621 675 632 665 650L605 755C600 768 608 777 622 777H765C775 777 780 772 784 764L788 744H667L740 655H965L877 822C862 850 835 866 800 866H388C428 855 452 832 462 805Z"
        />
      </svg>
      <div
        style={{
          display: 'flex',
          fontFamily: 'Archivo',
          fontStyle: 'italic',
          fontWeight: 900,
          fontSize: 120,
          letterSpacing: -4,
          marginTop: 24,
        }}
      >
        TURNO<span style={{ color: MINT }}>GOL</span>
      </div>
      <div style={{ fontSize: 36, marginTop: 24, color: '#cbd5e1' }}>
        La plataforma de reservas del fútbol argentino
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: 'Archivo', data: archivoData, weight: 900, style: 'italic' },
        { name: 'Inter', data: interData, weight: 600, style: 'normal' },
      ],
    },
  )
}
