import { describe, expect, it } from 'vitest'
import { withContext } from '@/shared/db/client'

describe('withContext role allowlist', () => {
  it('rejects role outside the AppRole allowlist (SQL injection guard)', async () => {
    await expect(
      withContext(
        { role: 'malicious; DROP TABLE users; --' as never },
        async () => 'unreachable',
      ),
    ).rejects.toThrow(/Invalid AppRole/i)
  })

  it('accepts each allowed role without throwing on the guard', async () => {
    for (const role of ['authenticated', 'anon', 'service_role', 'turnogol_app'] as const) {
      const p = withContext({ role }, async () => 'ok')
      await p.catch((e: unknown) => {
        expect(String(e)).not.toMatch(/Invalid AppRole/i)
      })
    }
  })
})
