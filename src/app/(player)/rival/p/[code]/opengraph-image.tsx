import { ImageResponse } from 'next/og'
import { capitalizeFirst, formatDayHeader } from '@/lib/format'
import { isRivalEnabled } from '@/modules/rival/rival.flags'
import { artTimeOf } from '@/modules/rival/rival-display'
import { getPublicMatch } from '@/modules/rival/rival.service'
import { sanitizeName } from '@/modules/tenants/story-summary'
import { artDateOf } from '@/shared/time/art-date'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'RIVAL — Armá el partido'

// Excepción documentada a DESIGN.md ("nada de hex inline"): satori no lee variables CSS ni tokens
// de Tailwind. Mismos verdes que `src/app/opengraph-image.tsx`.
const BACKGROUND = 'linear-gradient(135deg, #059669 0%, #047857 100%)'

/**
 * Vista previa del link de un partido (WhatsApp, etc.). Lleva SOLO complejo, día y hora (ART): ni
 * contador ni nombres, porque WhatsApp cachea la imagen y un "Faltan 3" quedaría viejo. Con el flag
 * apagado, partido inexistente/oculto/cancelado/vencido o la lectura caída: la imagen genérica de RIVAL, sin datos.
 * Fuentes por defecto de satori (sin red): el nombre del complejo es texto libre y se sanea igual
 * que en la placa de historias.
 */
export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const found = (await isRivalEnabled().catch(() => false))
    ? await getPublicMatch(code).catch(() => null)
    : null
  // Un partido cancelado o ya jugado no se anuncia: imagen genérica, igual que si no existiera.
  const match = found && found.status === 'open' && found.startsAt > new Date() ? found : null

  const headline = match ? sanitizeName(match.tenantName, 'Tu complejo') : 'Armá el partido'
  const detail = match
    ? `${capitalizeFirst(formatDayHeader(artDateOf(match.startsAt)))} · ${artTimeOf(match.startsAt)} hs`
    : 'Juntá a tus amigos y sumate a un partido cerca'

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
        color: 'white',
        padding: 80,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: 4, opacity: 0.9 }}>
        RIVAL powered by TurnoGol
      </div>
      <div style={{ fontSize: match ? 84 : 104, fontWeight: 800, marginTop: 28, lineHeight: 1.05 }}>
        {headline}
      </div>
      <div style={{ fontSize: 44, fontWeight: 500, marginTop: 28, opacity: 0.95 }}>{detail}</div>
      {match && (
        <div style={{ fontSize: 32, fontWeight: 500, marginTop: 40, opacity: 0.9 }}>
          Entrá al link y tocá Voy
        </div>
      )}
    </div>,
    size,
  )
}
