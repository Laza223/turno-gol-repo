import { describe, expect, it } from 'vitest'
import {
  confirmNameMatches,
  DESTRUCTIVE_TARGET_STATUSES,
  extendTrialInputSchema,
  forceStatusInputSchema,
  isDestructiveTargetStatus,
  settingsPatchSchema,
} from '@/modules/super-admin/support.schema'
import { FORCEABLE_TRANSITIONS } from '@/modules/super-admin/support.service'
import { TENANT_STATUSES } from '@/modules/super-admin/tenants.service'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'

describe('confirmNameMatches (confirmación tipo GitHub)', () => {
  it('acepta el nombre exacto', () => {
    expect(confirmNameMatches('Complejo El Potrero', 'Complejo El Potrero')).toBe(true)
  })

  it('tolera whitespace en los bordes del input', () => {
    expect(confirmNameMatches('Complejo El Potrero', '  Complejo El Potrero  ')).toBe(true)
  })

  it('rechaza diferencias de mayúsculas', () => {
    expect(confirmNameMatches('Complejo El Potrero', 'complejo el potrero')).toBe(false)
  })

  it('rechaza nombres parciales o distintos', () => {
    expect(confirmNameMatches('Complejo El Potrero', 'El Potrero')).toBe(false)
    expect(confirmNameMatches('Complejo El Potrero', '')).toBe(false)
  })
})

describe('settingsPatchSchema (whitelist de settings)', () => {
  it('acepta un patch válido con campos whitelisteados', () => {
    const result = settingsPatchSchema.safeParse({
      requires_deposit: true,
      deposit_percentage: 50,
      booking_advance_days: 10,
    })
    expect(result.success).toBe(true)
  })

  it('rechaza campos NO whitelisteados (strict)', () => {
    const result = settingsPatchSchema.safeParse({
      requires_deposit: true,
      onboarding_completed: true, // interno: jamás editable por el panel de soporte
    })
    expect(result.success).toBe(false)
  })

  it('rechaza booking_duration_minutes (fuera de UpdateTenantSettingsInput)', () => {
    const result = settingsPatchSchema.safeParse({ booking_duration_minutes: [60] })
    expect(result.success).toBe(false)
  })

  it('rechaza deposit_percentage fuera de rango', () => {
    expect(settingsPatchSchema.safeParse({ deposit_percentage: 150 }).success).toBe(false)
    expect(settingsPatchSchema.safeParse({ deposit_percentage: -1 }).success).toBe(false)
  })

  it('rechaza el patch vacío', () => {
    expect(settingsPatchSchema.safeParse({}).success).toBe(false)
  })

  it('acepta cancellation_policy completa y rechaza penalty_type inválido', () => {
    expect(
      settingsPatchSchema.safeParse({
        cancellation_policy: { hours_before: 12, penalty_type: 'deposit', penalty_amount: null },
      }).success,
    ).toBe(true)
    expect(
      settingsPatchSchema.safeParse({
        cancellation_policy: { hours_before: 12, penalty_type: 'doble', penalty_amount: null },
      }).success,
    ).toBe(false)
  })
})

describe('extendTrialInputSchema', () => {
  it('acepta días entre 1 y 90', () => {
    expect(extendTrialInputSchema.safeParse({ tenantId: TENANT_ID, days: 1 }).success).toBe(true)
    expect(extendTrialInputSchema.safeParse({ tenantId: TENANT_ID, days: 90 }).success).toBe(true)
  })

  it('rechaza 0, negativos, >90 y no enteros', () => {
    expect(extendTrialInputSchema.safeParse({ tenantId: TENANT_ID, days: 0 }).success).toBe(false)
    expect(extendTrialInputSchema.safeParse({ tenantId: TENANT_ID, days: -5 }).success).toBe(false)
    expect(extendTrialInputSchema.safeParse({ tenantId: TENANT_ID, days: 91 }).success).toBe(false)
    expect(extendTrialInputSchema.safeParse({ tenantId: TENANT_ID, days: 7.5 }).success).toBe(false)
  })

  it('rechaza tenantId no-UUID', () => {
    expect(extendTrialInputSchema.safeParse({ tenantId: 'nope', days: 7 }).success).toBe(false)
  })
})

describe('forceStatusInputSchema', () => {
  it('acepta un estado destino válido', () => {
    expect(
      forceStatusInputSchema.safeParse({ tenantId: TENANT_ID, targetStatus: 'active' }).success,
    ).toBe(true)
  })

  it('rechaza estados fuera del enum', () => {
    expect(
      forceStatusInputSchema.safeParse({ tenantId: TENANT_ID, targetStatus: 'cancelled' }).success,
    ).toBe(false)
  })
})

describe('FORCEABLE_TRANSITIONS (espejo del FSM de lifecycle.service)', () => {
  it('cubre los 8 estados como origen', () => {
    expect(Object.keys(FORCEABLE_TRANSITIONS).sort()).toEqual([...TENANT_STATUSES].sort())
  })

  it('deleted es terminal (sin destinos)', () => {
    expect(FORCEABLE_TRANSITIONS.deleted).toEqual([])
  })

  it('nunca ofrece trialing ni canceled como destino (canceled va por la action de cancelar)', () => {
    for (const targets of Object.values(FORCEABLE_TRANSITIONS)) {
      expect(targets).not.toContain('trialing')
      expect(targets).not.toContain('canceled')
    }
  })

  it('todos los destinos son estados válidos', () => {
    for (const targets of Object.values(FORCEABLE_TRANSITIONS)) {
      for (const t of targets) {
        expect(TENANT_STATUSES).toContain(t)
      }
    }
  })

  it('trialing solo puede forzarse a active (transitionTrialingToActive)', () => {
    expect(FORCEABLE_TRANSITIONS.trialing).toEqual(['active'])
  })

  it("'deleted' ya no es forzable manualmente desde ningún origen (el borrado real es exclusivo del cron de retención)", () => {
    for (const [from, targets] of Object.entries(FORCEABLE_TRANSITIONS)) {
      if (from === 'deleted') continue // terminal: ya cubierto arriba
      expect(targets).not.toContain('deleted')
    }
  })
})

describe('isDestructiveTargetStatus', () => {
  it('blocked y deleted son destructivos (piden confirmName)', () => {
    expect(DESTRUCTIVE_TARGET_STATUSES).toEqual(['blocked', 'deleted'])
    expect(isDestructiveTargetStatus('blocked')).toBe(true)
    expect(isDestructiveTargetStatus('deleted')).toBe(true)
    expect(isDestructiveTargetStatus('active')).toBe(false)
    expect(isDestructiveTargetStatus('past_due')).toBe(false)
  })
})
