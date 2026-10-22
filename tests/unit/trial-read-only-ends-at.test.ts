import { describe, expect, it } from 'vitest'
import { trialReadOnlyEndsAt } from '@/modules/tenants/tenant.lifecycle'

// Decisión 2026-10-22: la prueba vencida queda 14 días en solo lectura antes
// de bloquearse; si el complejo ya tocó "Activar" (`mp_subscription_id`), se le
// suman los 3 días de margen del primer cobro. Es la fecha que ve el dueño en
// el aviso y la misma cuenta que hace `runExpireTrials` en SQL.
describe('trialReadOnlyEndsAt', () => {
  const TRIAL_END = new Date('2026-12-06T15:30:00.000Z')

  it('sin suscripción: trial_ends_at + 14 días, misma hora', () => {
    expect(trialReadOnlyEndsAt(TRIAL_END, false).toISOString()).toBe('2026-12-20T15:30:00.000Z')
  })

  it('con suscripción: trial_ends_at + 14 + 3 días', () => {
    expect(trialReadOnlyEndsAt(TRIAL_END, true).toISOString()).toBe('2026-12-23T15:30:00.000Z')
  })
})
