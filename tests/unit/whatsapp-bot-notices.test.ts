import { describe, expect, it, vi } from 'vitest'

// `renderNotice` es pura, pero vive junto a `notifyWhatsappGuest` (DB + Kapso).
// Se mockea lo que ese módulo importa para no abrir pools ni leer env.
vi.mock('@/shared/db/client', () => ({ withTenantContext: vi.fn() }))
vi.mock('@/lib/sentry', () => ({ captureException: vi.fn() }))
vi.mock('@/lib/kapso/client', () => ({ sendWhatsappText: vi.fn() }))

import { renderNotice } from '@/modules/whatsapp-bot/whatsapp-bot.notices'
import { WHATSAPP_NOTICES } from '@/shared/db/schema'

// 2026-10-23 es viernes y 2026-10-24 sábado. ART = UTC-3 fijo (sin DST).
const target = (startsAtIso: string, timeStart: string, courtName = 'Cancha 1') => ({
  courtName,
  startsAt: new Date(startsAtIso),
  timeStart,
})

describe('renderNotice — día FÍSICO del turno (starts_at en ART), no el operativo', () => {
  // Complejo que cierra pasada la medianoche: el turno de las 00:00 del día
  // operativo "viernes" se juega físicamente el sábado a las 00:00 ART
  // (= sábado 03:00Z). `bookings.date` diría viernes; el jugador tiene que leer sábado.
  const midnightTurn = target('2026-10-24T03:00:00Z', '00:00')

  it('deposit_confirmed: el turno de 00:00 del viernes operativo dice sábado', () => {
    const text = renderNotice('deposit_confirmed', midnightTurn)
    expect(text).toContain('sábado 24 de octubre a las 00:00')
    expect(text).not.toContain('viernes')
  })

  it('hold_expired: el turno de 00:00 del viernes operativo dice sábado', () => {
    const text = renderNotice('hold_expired', midnightTurn)
    expect(text).toContain('las 00:00 del sábado 24 de octubre')
    expect(text).not.toContain('viernes')
  })

  it('un turno normal de la noche (21:00 ART) cae en el mismo día calendario', () => {
    const text = renderNotice('deposit_confirmed', target('2026-10-24T00:00:00Z', '21:00'))
    expect(text).toContain('viernes 23 de octubre a las 21:00')
  })

  it('el límite de día es la medianoche ART: 23:59 ART sigue siendo viernes, 00:00 ART ya es sábado', () => {
    expect(renderNotice('deposit_confirmed', target('2026-10-24T02:59:59Z', '23:59'))).toContain(
      'viernes 23 de octubre',
    )
    expect(renderNotice('deposit_confirmed', target('2026-10-24T03:00:00Z', '00:00'))).toContain(
      'sábado 24 de octubre',
    )
  })

  it('no usa el día UTC: 21:00 ART del viernes es sábado en UTC y tiene que decir viernes', () => {
    // 2026-10-24T00:30Z es sábado en UTC pero viernes 21:30 ART.
    const text = renderNotice('hold_expired', target('2026-10-24T00:30:00Z', '21:30'))
    expect(text).toContain('viernes 23 de octubre')
    expect(text).not.toContain('sábado')
  })
})

describe('renderNotice — textos', () => {
  const turn = target('2026-10-24T00:00:00Z', '21:00:00', 'Cancha Techada')

  it('deposit_confirmed: confirma la seña con cancha, día y hora', () => {
    expect(renderNotice('deposit_confirmed', turn)).toBe(
      'Listo, recibimos la seña ✅ Tu turno quedó confirmado: *Cancha Techada*, viernes 23 de octubre a las 21:00. ¡Te esperamos!',
    )
  })

  it('hold_expired: avisa que el link venció y el turno se liberó', () => {
    expect(renderNotice('hold_expired', turn)).toBe(
      'El link de pago venció y el turno de las 21:00 del viernes 23 de octubre se liberó. Si todavía lo querés, escribime y vemos si sigue libre.',
    )
  })

  it('late_payment_refunded: el turno no quedó y la plata la devuelve el complejo', () => {
    expect(renderNotice('late_payment_refunded', turn)).toBe(
      'Tu seña entró cuando el turno de las 21:00 del viernes 23 de octubre ya se había liberado, así que no quedó reservado. El complejo te devuelve la plata al mismo medio de pago. Si querés otro horario, escribime y te busco uno.',
    )
  })

  it('la hora sale recortada a HH:MM aunque Postgres devuelva TIME con segundos', () => {
    expect(renderNotice('deposit_confirmed', turn)).not.toContain('21:00:00')
    expect(renderNotice('hold_expired', turn)).not.toContain('21:00:00')
  })

  it('el nombre de cancha va en negrita de WhatsApp (un asterisco) solo en deposit_confirmed', () => {
    expect(renderNotice('deposit_confirmed', turn)).toContain('*Cancha Techada*')
    expect(renderNotice('hold_expired', turn)).not.toContain('Cancha Techada')
  })

  it('no usa Markdown ni links: es un mensaje de WhatsApp', () => {
    for (const notice of WHATSAPP_NOTICES) {
      const text = renderNotice(notice, turn)
      expect(text).not.toMatch(/\*\*|\[.*\]\(|https?:\/\//)
    }
  })
})
