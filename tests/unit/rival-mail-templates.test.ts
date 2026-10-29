import { describe, expect, it } from 'vitest'
import { isTemplateName, renderTemplate } from '@/modules/notifications/templates'

// Los 4 mails de RIVAL: escapan lo que viene de personas/complejos, no traen teléfono ni email,
// y el de alertas lleva el link de baja.

const EVIL = '<script>alert(1)</script>'
const BASE = {
  tenantName: `Complejo ${EVIL}`,
  dateLabel: 'Sábado 24 · 21:00',
  url: 'https://turnogol.app/rival/partido/abc',
}

const CASES = [
  ['rival_join_request', { ...BASE, requesterFirstName: EVIL }],
  ['rival_accepted', { ...BASE }],
  ['rival_canceled', { ...BASE }],
  ['rival_alert', { ...BASE, unsubscribeUrl: 'https://turnogol.app/rival/baja?t=tok.sig' }],
] as const

describe('templates de RIVAL', () => {
  it.each(CASES)('%s está dado de alta', (name) => {
    expect(isTemplateName(name)).toBe(true)
  })

  it.each(CASES)('%s escapa el HTML de los datos', (name, data) => {
    const out = renderTemplate(name, data)
    expect(out.html).not.toContain(EVIL)
    expect(out.html).toContain('&lt;script&gt;')
    expect(out.subject.length).toBeGreaterThan(0)
  })

  it.each(CASES)('%s no trae teléfono ni email', (name, data) => {
    const out = renderTemplate(name, data)
    const all = `${out.subject}\n${out.html}\n${out.text ?? ''}`
    expect(all).not.toMatch(/wa\.me|whatsapp_digits|\b\d{8,15}\b/i)
    expect(all).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/)
  })

  it.each(CASES)('%s lleva el link a la app', (name, data) => {
    const out = renderTemplate(name, data)
    expect(out.html).toContain(BASE.url)
    expect(out.text).toContain(BASE.url)
  })

  it('la alerta trae el link de baja (html y texto)', () => {
    const out = renderTemplate('rival_alert', CASES[3][1])
    expect(out.html).toContain('/rival/baja?t=tok.sig')
    expect(out.text).toContain('/rival/baja?t=tok.sig')
  })

  it('el pedido nombra a quien pide con su nombre de pila', () => {
    const out = renderTemplate('rival_join_request', { ...BASE, requesterFirstName: 'Beto' })
    expect(out.html).toContain('Beto')
    expect(out.subject).toContain('Beto')
  })

  it('el título del pedido nombra a quien pide y el de la alerta, el complejo', () => {
    const join = renderTemplate('rival_join_request', { ...BASE, requesterFirstName: 'Beto' })
    expect(join.html).toContain('<h2>Alguien quiere sumarse</h2>')
    const alert = renderTemplate('rival_alert', {
      ...BASE,
      tenantName: 'Los Pinos',
      unsubscribeUrl: 'https://turnogol.app/rival/baja?t=tok.sig',
    })
    expect(alert.html).toContain('<h2>Hay un partido nuevo en Los Pinos</h2>')
  })

  it('sin requesterRole (jobs viejos) sale el mail de jugador; con captain, el de equipo', () => {
    const base = { ...BASE, requesterFirstName: 'Beto' }
    const legacy = renderTemplate('rival_join_request', base)
    const player = renderTemplate('rival_join_request', { ...base, requesterRole: 'player' })
    expect(legacy).toEqual(player)
    expect(legacy.subject).toBe('Beto quiere sumarse a tu partido')

    const captain = renderTemplate('rival_join_request', { ...base, requesterRole: 'captain' })
    expect(captain.subject).toBe('Beto quiere jugarle a tu equipo')
    expect(captain.html).toContain('<h2>Beto trae un equipo para jugarte</h2>')
    expect(captain.html).toContain('Ver el desafío')
    expect(captain.html).not.toContain('quiere sumarse')
  })

  it('el botón usa el verde de marca medido (blanco sobre #047857), no el 600', () => {
    const out = renderTemplate('rival_accepted', { ...BASE })
    expect(out.html).toContain('background:#047857')
    expect(out.html).not.toContain('#16a34a')
  })
})
