import { describe, it, vi } from 'vitest'

vi.mock('@/modules/auth/auth.middleware', () => ({
  extractAuthUser: vi.fn(() => ({
    type: 'staff', staffUserId: 'staff-1', tenantId: 'tenant-1',
    email: 'owner@test.com',
  })),
}))

describe('deactivateStaffAction', () => {
  it.todo('prevents deactivating last active admin')
  it.todo('deactivates staff and invalidates sessions')
})

describe('inviteStaffAction', () => {
  it.todo('returns error if email already member of this tenant')
  it.todo('creates staff_users + tenant_staff_members + sends invite')
})
