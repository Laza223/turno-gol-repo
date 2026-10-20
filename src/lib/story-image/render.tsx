/* eslint-disable @next/next/no-img-element -- satori dibuja <img>; acá no hay next/image */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { ImageResponse } from 'next/og'
import type { StoryHour, StoryModel } from './model'

const WIDTH = 1080
const HEIGHT = 1920

// Instagram tapa ~250 px arriba (avatar y nombre) y ~250 abajo (barra de
// respuesta): todo lo que se lee vive entre las dos franjas, el fondo sale a sangre.
const SAFE_TOP = 250
const SAFE_BOTTOM = 250
const PAD_X = 72
const CONTENT_WIDTH = WIDTH - PAD_X * 2

// Tamaños fijos a propósito: una historia se ve a un tercio de tamaño en el
// celu, así que con más horarios que lugar NO se achica nada (ver `MAX_HOURS`).
const ROW_HEIGHT = 108
const ROW_GAP = 16
const NUMERAL_SIZE = 92
const LABEL_SIZE = 40
const CTA_HEIGHT = 100
const LOGO_WIDTH = 285
const LOGO_HEIGHT = 65 // el PNG es 1156×264

// Excepción documentada a DESIGN.md ("nada de hex inline"): satori no lee
// variables CSS ni tokens de Tailwind, así que los valores de marca se repiten
// acá, en UN solo lugar. Son los de globals.css / DESIGN.md.
const NIGHT = '#020617'
const EMERALD = '#10b981'
const EMERALD_SOFT = '#34d399'
const EMERALD_TEXT = '#6ee7b7'
const TEXT = '#f8fafc'
const TEXT_MUTED = '#94a3b8'
const LINE = 'rgba(52,211,153,0.34)'
const BACKGROUND = 'linear-gradient(170deg, #062431 0%, #04121f 42%, #020617 100%)'

const DISPLAY = { fontFamily: 'Archivo', fontStyle: 'italic', fontWeight: 900 } as const

// Fondo en un solo SVG: haces de luz esmeralda en diagonal (arriba a la derecha
// y abajo a la izquierda, como en la referencia) y la cancha vertical en trazo
// finísimo (marco con arcos de córner, áreas y círculo central, el mismo
// recurso que `.player-shell-bg` del portal del jugador, girado a 9:16).
// Va como <img> y no como divs rotados con degradé: satori tardaba 3× en
// rasterizar esos y los bordes salían borrosos.
const BEAMS = [
  // [x0 arriba, x1 arriba, largo, alfa inicial], todos con la misma pendiente.
  { top: true, x0: 620, x1: 990, len: 1000, alpha: 0.24 },
  { top: true, x0: 540, x1: 580, len: 780, alpha: 0.32 },
  { top: true, x0: 1010, x1: 1050, len: 620, alpha: 0.3 },
  { top: false, x0: -80, x1: 280, len: 900, alpha: 0.22 },
  { top: false, x0: 330, x1: 365, len: 620, alpha: 0.28 },
]
const BEAM_SLOPE = 0.62 // px que se corre en x por cada px en y

function beamPolygon(index: number, beam: (typeof BEAMS)[number]): string {
  const dy = beam.top ? beam.len : -beam.len
  const dx = beam.top ? -BEAM_SLOPE * beam.len : BEAM_SLOPE * beam.len
  const y0 = beam.top ? 0 : HEIGHT
  const points = [
    [beam.x0, y0],
    [beam.x1, y0],
    [beam.x1 + dx, y0 + dy],
    [beam.x0 + dx, y0 + dy],
  ]
    .map(([x, y]) => `${x},${y}`)
    .join(' ')
  const cx = (beam.x0 + beam.x1) / 2
  return `<defs><linearGradient id="b${index}" gradientUnits="userSpaceOnUse" x1="${cx}" y1="${y0}" x2="${cx + dx}" y2="${y0 + dy}"><stop offset="0" stop-color="#34d399" stop-opacity="${beam.alpha}"/><stop offset="1" stop-color="#34d399" stop-opacity="0"/></linearGradient></defs><polygon points="${points}" fill="url(#b${index})" stroke="none"/>`
}

const BACKGROUND_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920" fill="none" stroke="#34d399" stroke-linecap="round"><defs><radialGradient id="glow" gradientUnits="userSpaceOnUse" cx="360" cy="520" r="620"><stop offset="0" stop-color="#10b981" stop-opacity="0.18"/><stop offset="1" stop-color="#10b981" stop-opacity="0"/></radialGradient></defs><rect width="1080" height="1920" fill="url(#glow)" stroke="none"/>${BEAMS.map((beam, i) => beamPolygon(i, beam)).join('')}<g stroke-opacity="0.30" stroke-width="3"><rect x="46" y="46" width="988" height="1828" rx="6"/><path d="M90 46 A44 44 0 0 1 46 90"/><path d="M990 46 A44 44 0 0 0 1034 90"/><path d="M46 1830 A44 44 0 0 0 90 1874"/><path d="M1034 1830 A44 44 0 0 1 990 1874"/></g><g stroke-opacity="0.17" stroke-width="3"><line x1="46" y1="960" x2="1034" y2="960"/><circle cx="540" cy="960" r="190"/><rect x="266" y="46" width="548" height="200"/><rect x="396" y="46" width="288" height="90"/><rect x="266" y="1674" width="548" height="200"/><rect x="396" y="1784" width="288" height="90"/></g><g fill="#34d399" fill-opacity="0.30" stroke="none"><circle cx="540" cy="960" r="6"/><circle cx="540" cy="112" r="5"/><circle cx="540" cy="1808" r="5"/></g></svg>`
const BACKGROUND_URI = `data:image/svg+xml;utf8,${encodeURIComponent(BACKGROUND_SVG)}`

// Flecha ↗ del botón. No es un glifo de la fuente (el subset latin no lo trae).
const ARROW_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#020617" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg>`
const ARROW_URI = `data:image/svg+xml;utf8,${encodeURIComponent(ARROW_SVG)}`

type LoadedFont = {
  name: string
  data: Buffer
  weight: 600 | 900
  style: 'normal' | 'italic'
}

type Assets = { fonts: LoadedFont[]; logoUri: string }

let assetsPromise: Promise<Assets> | null = null

// Literales a propósito: el tracing de Next sólo incluye en el deploy lo que ve
// como `path.join(process.cwd(), 'literal')`.
function loadAssets(): Promise<Assets> {
  assetsPromise ??= Promise.all([
    readFile(path.join(process.cwd(), 'src/lib/story-image/fonts/archivo-latin-900-italic.woff')),
    readFile(path.join(process.cwd(), 'src/lib/story-image/fonts/inter-latin-600-normal.woff')),
    readFile(path.join(process.cwd(), 'public/brand-assets/logo_principal.png')),
  ])
    .then(([archivo, inter, logo]): Assets => ({
      fonts: [
        { name: 'Archivo', data: archivo, weight: 900, style: 'italic' },
        { name: 'Inter', data: inter, weight: 600, style: 'normal' },
      ],
      logoUri: `data:image/png;base64,${logo.toString('base64')}`,
    }))
    .catch((err: unknown) => {
      assetsPromise = null
      throw err
    })
  return assetsPromise
}

/** Ancho aproximado, en "em", de un texto en Archivo 900 itálica mayúscula (las anchas M, C, O pesan ~0,8). */
function displayEm(text: string): number {
  let em = 0
  for (const char of text) em += char === ' ' ? 0.35 : char === '.' ? 0.3 : 0.8
  return em
}

function headlineSize(firstLine: string): number {
  return Math.min(
    160,
    Math.floor(CONTENT_WIDTH / Math.max(displayEm(firstLine), displayEm('JUEGA.'))),
  )
}

// Ancho estimado del nombre en em (Archivo 900 itálica): las mayúsculas y los
// dígitos pesan más que las minúsculas. Sobreestima un poco a propósito.
function nameEm(name: string): number {
  let em = 0
  for (const char of name) {
    em +=
      char === ' ' ? 0.34 : char === char.toLowerCase() && char !== char.toUpperCase() ? 0.6 : 0.85
  }
  return em
}

// Una sola línea si entra; si no, baja hasta un piso legible y recién ahí envuelve.
function nameSize(name: string): number {
  return Math.max(44, Math.min(88, Math.floor(CONTENT_WIDTH / nameEm(name))))
}

function urlSize(length: number): number {
  return Math.max(36, Math.min(64, Math.floor(CONTENT_WIDTH / (length * 0.62))))
}

function HourRow({ hour }: { hour: StoryHour }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        width: CONTENT_WIDTH,
        height: ROW_HEIGHT,
        borderRadius: 28,
        border: `2px solid ${LINE}`,
        backgroundColor: 'rgba(255,255,255,0.04)',
        backgroundImage: 'linear-gradient(90deg, rgba(16,185,129,0.12) 0%, rgba(16,185,129,0) 60%)',
      }}
    >
      <div
        style={{
          display: 'flex',
          width: 560,
          paddingLeft: 44,
          ...DISPLAY,
          fontSize: NUMERAL_SIZE,
          lineHeight: 1,
          color: TEXT,
        }}
      >
        {hour.time}
      </div>
      <div style={{ width: 2, height: 64, backgroundColor: LINE }} />
      <div
        style={{
          display: 'flex',
          flexGrow: 1,
          justifyContent: 'center',
          fontSize: LABEL_SIZE,
          color: EMERALD_TEXT,
        }}
      >
        {hour.freeCourts === 1 ? '1 cancha' : `${hour.freeCourts} canchas`}
      </div>
    </div>
  )
}

function StoryPlate({ model, logoUri }: { model: StoryModel; logoUri: string }) {
  const firstLine = `${model.dayWord} SE`

  return (
    <div
      style={{
        display: 'flex',
        position: 'relative',
        overflow: 'hidden',
        width: WIDTH,
        height: HEIGHT,
        backgroundColor: NIGHT,
        backgroundImage: BACKGROUND,
        fontFamily: 'Inter',
        fontWeight: 600,
        color: TEXT,
      }}
    >
      {/* Fondo a sangre: haces de luz y cancha. */}
      <img
        src={BACKGROUND_URI}
        width={WIDTH}
        height={HEIGHT}
        alt=""
        style={{ position: 'absolute', top: 0, left: 0 }}
      />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: WIDTH,
          height: HEIGHT,
          padding: `${SAFE_TOP}px ${PAD_X}px ${SAFE_BOTTOM}px ${PAD_X}px`,
        }}
      >
        {/* Fecha → titular → complejo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <div style={{ fontSize: 40, letterSpacing: '0.22em', color: EMERALD_SOFT }}>
            {model.kicker}
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              marginTop: 14,
              ...DISPLAY,
              fontSize: headlineSize(firstLine),
              lineHeight: 0.9,
              letterSpacing: '-0.02em',
              color: TEXT,
            }}
          >
            <div>{firstLine}</div>
            <div style={{ display: 'flex' }}>
              <div>JUEGA</div>
              <div style={{ color: EMERALD_SOFT }}>.</div>
            </div>
          </div>
          <div
            style={{
              ...DISPLAY,
              marginTop: 26,
              fontSize: nameSize(model.tenantName),
              lineHeight: 1.05,
              // Una palabra sola más ancha que la placa (sin espacios donde cortar)
              // se parte en vez de salirse por el borde.
              wordBreak: 'break-word',
              color: TEXT,
            }}
          >
            {model.tenantName}
          </div>
          <div
            style={{ display: 'flex', alignItems: 'center', width: CONTENT_WIDTH, marginTop: 26 }}
          >
            <div
              style={{
                display: 'flex',
                padding: '12px 28px',
                borderRadius: 999,
                border: `2px solid ${LINE}`,
                fontSize: 28,
                letterSpacing: '0.2em',
                color: EMERALD_SOFT,
              }}
            >
              TURNOS DISPONIBLES
            </div>
            <div
              style={{
                flexGrow: 1,
                height: 2,
                marginLeft: 24,
                backgroundImage:
                  'linear-gradient(90deg, rgba(52,211,153,0.34) 0%, rgba(52,211,153,0) 100%)',
              }}
            />
          </div>
        </div>

        {/* Horarios */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {model.hours.map((hour, index) => (
            <div key={hour.time} style={{ display: 'flex', marginTop: index === 0 ? 0 : ROW_GAP }}>
              <HourRow hour={hour} />
            </div>
          ))}
          {model.hiddenHours > 0 ? (
            <div style={{ fontSize: 32, color: TEXT_MUTED, marginTop: 20 }}>
              {model.hiddenHours === 1 ? 'y 1 horario más' : `y ${model.hiddenHours} horarios más`}
            </div>
          ) : null}
        </div>

        {/* Llamado a reservar → URL → logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: CONTENT_WIDTH,
              height: CTA_HEIGHT,
              borderRadius: 30,
              backgroundImage: `linear-gradient(180deg, ${EMERALD_SOFT} 0%, ${EMERALD} 100%)`,
              color: NIGHT,
            }}
          >
            <div style={{ ...DISPLAY, fontSize: 50, letterSpacing: '0.01em' }}>{model.cta}</div>
            <img src={ARROW_URI} width={44} height={44} alt="" style={{ marginLeft: 20 }} />
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 18,
              ...DISPLAY,
              fontSize: urlSize(model.portalHost.length),
              // Una URL larga se parte en varias líneas: que queden centradas.
              textAlign: 'center',
              color: TEXT,
            }}
          >
            {model.portalHost}
          </div>
          <img
            src={logoUri}
            width={LOGO_WIDTH}
            height={LOGO_HEIGHT}
            alt=""
            style={{ marginTop: 20 }}
          />
        </div>
      </div>
    </div>
  )
}

/**
 * Dibuja la placa y devuelve los bytes del PNG.
 *
 * Se materializa acá adentro (y no se devuelve el `ImageResponse`) a propósito:
 * el `ImageResponse` de Next es un stream, y si satori falla a mitad del render
 * el error llega cuando la respuesta ya salió con 200. Esperando el buffer, el
 * fallo salta dentro del try/catch de la ruta.
 */
export async function renderStoryPng(model: StoryModel): Promise<ArrayBuffer> {
  const { fonts, logoUri } = await loadAssets()
  return new ImageResponse(<StoryPlate model={model} logoUri={logoUri} />, {
    width: WIDTH,
    height: HEIGHT,
    fonts,
  }).arrayBuffer()
}
