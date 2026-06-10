import { describe, expect, it } from 'vitest'
import {
  isTenantPubliclyVisible,
  UNAVAILABLE_TENANT_STATUSES,
} from '@/modules/tenants/tenant-status'

describe('isTenantPubliclyVisible', () => {
  it('is visible for operating statuses', () => {
    expect(isTenantPubliclyVisible('active')).toBe(true)
    expect(isTenantPubliclyVisible('trialing')).toBe(true)
    expect(isTenantPubliclyVisible('past_due')).toBe(true)
  })

  it('is hidden for every unavailable status', () => {
    for (const status of ['suspended', 'blocked', 'canceled', 'churned', 'deleted']) {
      expect(isTenantPubliclyVisible(status)).toBe(false)
    }
  })

  it('exposes the canonical unavailable set', () => {
    expect(UNAVAILABLE_TENANT_STATUSES.has('suspended')).toBe(true)
    expect(UNAVAILABLE_TENANT_STATUSES.size).toBe(5)
  })
})
