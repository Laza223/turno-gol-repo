import { describe, expect, it, vi } from 'vitest'

const { calls } = vi.hoisted(() => ({ calls: [] as { text: string; params: unknown[] }[] }))

vi.mock('@/shared/db/client', () => ({
  getWorkerSql:
    () =>
    async (strings: TemplateStringsArray, ...params: unknown[]) => {
      calls.push({ text: strings.join('?'), params })
      return []
    },
}))

import { syncStaffUserEmail } from '@/modules/auth/auth.service'

describe('syncStaffUserEmail', () => {
  it('el cambio confirmado prueba la casilla: marca verificado y borra el token pendiente', async () => {
    await syncStaffUserEmail('staff-1', '  Nuevo@Complejo.com ')
    const [call] = calls
    expect(call?.text).toContain('email_verified_at = now()')
    expect(call?.text).toContain('email_verify_token_hash = NULL')
    expect(call?.params).toEqual(['nuevo@complejo.com', 'staff-1'])
  })
})
