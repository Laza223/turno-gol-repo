import { describe, expect, it, vi } from 'vitest'
import {
  createPushReceiptToken,
  verifyPushReceiptToken,
} from '@/modules/notifications/push-receipt.service'

describe('push receipt capability', () => {
  it('binds the capability to one delivery and expiry', () => {
    vi.stubEnv('PUSH_RECEIPT_SECRET', 'test-receipt-secret-at-least-thirty-two-bytes')
    const expiresAt = new Date(Date.now() + 60_000)
    const token = createPushReceiptToken('delivery-1', expiresAt)
    expect(verifyPushReceiptToken('delivery-1', token)).toBe(true)
    expect(verifyPushReceiptToken('delivery-2', token)).toBe(false)
    expect(verifyPushReceiptToken('delivery-1', `${token}x`)).toBe(false)
  })

  it('rejects an expired capability and missing configuration', () => {
    vi.stubEnv('PUSH_RECEIPT_SECRET', 'test-receipt-secret-at-least-thirty-two-bytes')
    const token = createPushReceiptToken('delivery-1', new Date(Date.now() - 1))
    expect(verifyPushReceiptToken('delivery-1', token)).toBe(false)
    vi.stubEnv('PUSH_RECEIPT_SECRET', undefined)
    expect(verifyPushReceiptToken('delivery-1', token)).toBe(false)
    expect(() => createPushReceiptToken('delivery-1', new Date())).toThrow()
  })
})
