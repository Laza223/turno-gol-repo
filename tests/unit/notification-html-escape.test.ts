import { describe, expect, it } from 'vitest'
import { escapeHtml } from '@/modules/notifications/templates/html-escape'
import { renderAdminNewBooking } from '@/modules/notifications/templates/admin-new-booking'
import { renderBookingCanceled } from '@/modules/notifications/templates/booking-canceled'
import { renderBookingConfirmed } from '@/modules/notifications/templates/booking-confirmed'
import { renderSubscriptionSuspended } from '@/modules/notifications/templates/subscription-suspended'

// Security scan F4/F7/F8: free-text player/tenant/staff-controlled fields were
// interpolated raw into HTML emails, enabling phishing content under the
// trusted no-reply@turnogol.app sender. escapeHtml() + its ~25 call sites
// across src/modules/notifications/templates/ closed this; these tests are
// the regression anchor — if a template reverts to raw interpolation, or a
// new template forgets escapeHtml, this fails instead of CI staying green.

const PAYLOAD = '<a href="https://evil.example">Reclamá tu reembolso</a><script>alert(1)</script>'

describe('escapeHtml', () => {
  it('escapes <, >, &, ", and \' so a payload cannot break out of an HTML attribute or tag', () => {
    expect(escapeHtml(PAYLOAD)).toBe(
      '&lt;a href=&quot;https://evil.example&quot;&gt;Reclamá tu reembolso&lt;/a&gt;&lt;script&gt;alert(1)&lt;/script&gt;',
    )
  })
  it('leaves ordinary text untouched', () => {
    expect(escapeHtml('Cancha Central')).toBe('Cancha Central')
  })
})

describe('email templates neutralize an HTML-injection payload in every free-text field (F4/F7/F8)', () => {
  it('renderAdminNewBooking — courtName, playerName, playerPhone (F4)', () => {
    const { html } = renderAdminNewBooking({
      courtName: PAYLOAD,
      date: '02/06/2027',
      timeStart: '10:00',
      timeEnd: '11:00',
      playerName: PAYLOAD,
      playerPhone: PAYLOAD,
    })
    expect(html).not.toContain(PAYLOAD)
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<a href="https://evil.example">')
  })

  it('renderBookingCanceled — nombres, motivo y contacto del complejo (F7)', () => {
    const { html } = renderBookingCanceled({
      playerFirstName: PAYLOAD,
      courtName: PAYLOAD,
      date: '02/06/2027',
      timeStart: '10:00',
      timeEnd: '11:00',
      tenantName: PAYLOAD,
      // El bloque de contacto es texto del complejo yendo al HTML de un mail:
      // se escapa igual que el resto. El WhatsApp no aparece acá porque
      // `buildWhatsappUrl` lo reduce a dígitos antes de llegar al href.
      tenantPhone: PAYLOAD,
      tenantWhatsapp: PAYLOAD,
      tenantEmail: PAYLOAD,
      bookingCode: PAYLOAD,
      canceledBy: 'admin',
      reason: PAYLOAD,
    })
    expect(html).not.toContain(PAYLOAD)
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<a href="https://evil.example">')
  })

  it('renderBookingConfirmed — playerFirstName, tenantName, courtName, tenantAddress (F8)', () => {
    const { html } = renderBookingConfirmed({
      playerFirstName: PAYLOAD,
      courtName: PAYLOAD,
      date: '02/06/2027',
      timeStart: '10:00',
      timeEnd: '11:00',
      tenantName: PAYLOAD,
      tenantAddress: PAYLOAD,
    })
    expect(html).not.toContain(PAYLOAD)
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<a href="https://evil.example">')
  })

  it('renderSubscriptionSuspended — ownerName, tenantName (class-wide fix, same helper)', () => {
    const { html } = renderSubscriptionSuspended({
      ownerName: PAYLOAD,
      tenantName: PAYLOAD,
    })
    expect(html).not.toContain(PAYLOAD)
    expect(html).not.toContain('<script>')
  })
})
