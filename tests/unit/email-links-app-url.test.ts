import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { renderTemplate, type TemplateName } from '@/modules/notifications/templates'

// Los mails de la cuota linkeaban a `https://app.turnogol.app/...`, un
// subdominio que no existe (NXDOMAIN, medido 2026-09-27): el botón "Activá tu
// suscripción" que recibe todo complejo al terminar la prueba no llevaba a
// ningún lado. Cada link tiene que salir de la URL de la app configurada.

const BASE = 'https://turnogol.app'
const owner = { ownerName: 'Ana', tenantName: 'El Complejo' }

const CASES: Array<[TemplateName, Record<string, unknown>, string]> = [
  ['trial_ending', { ...owner, daysLeft: 7 }, '/settings/facturacion'],
  ['trial_expired', owner, '/settings/facturacion'],
  ['dunning_payment_failed', { ...owner, retryDate: '15/10/2026' }, '/settings/facturacion'],
  ['subscription_suspended', owner, '/settings/facturacion'],
  ['subscription_blocked', owner, '/settings/facturacion'],
  [
    'tenant_deletion_warning',
    { ...owner, deletionDate: '15/12/2026', daysRemaining: 7 },
    '/settings/facturacion',
  ],
  ['onboarding_abandoned', { ...owner, lastStepLabel: 'Canchas' }, '/onboarding'],
]

let previous: string | undefined

beforeEach(() => {
  previous = process.env.NEXT_PUBLIC_APP_URL
  process.env.NEXT_PUBLIC_APP_URL = `${BASE}/`
})

afterEach(() => {
  if (previous === undefined) delete process.env.NEXT_PUBLIC_APP_URL
  else process.env.NEXT_PUBLIC_APP_URL = previous
})

describe('links de los mails al panel', () => {
  it.each(CASES)('%s linkea a la app configurada, en html y en texto', (name, data, path) => {
    const { html, text } = renderTemplate(name, data)

    expect(html).toContain(`href="${BASE}${path}"`)
    expect(text).toContain(`${BASE}${path}`)
    expect(html).not.toContain('app.turnogol.app')
    expect(text).not.toContain('app.turnogol.app')
  })
})
