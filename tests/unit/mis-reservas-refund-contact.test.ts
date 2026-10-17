import { describe, expect, it } from 'vitest'
import {
  refundContactFor,
  type RefundContactSource,
} from '@/app/(player)/mis-reservas/refund-contact'

const base: RefundContactSource = {
  id: '11111111-2222-4333-8444-555555555555',
  starts_on: '2026-03-15',
  time_start: '00:00:00',
  deposit_amount: 450000,
  refund_status: 'pending',
  refund_method: null,
  refund_processed_at: null,
  tenant_name: 'Complejo Demo',
  tenant_whatsapp: '5491122223333',
  tenant_phone: '01122223333',
  tenant_email: 'hola@demo.test',
}

describe('refundContactFor', () => {
  it('sin devolución en juego no arma nada', () => {
    expect(refundContactFor({ ...base, refund_status: null })).toBeUndefined()
  })

  it('el día del aviso es el físico (`starts_on`), no el operativo', () => {
    // Complejo que cierra pasada la medianoche: el 00:00 del día operativo 14 se juega el 15.
    expect(refundContactFor(base)).toMatchObject({ dateLabel: '15/03', timeLabel: '00:00' })
  })

  it('saldada: estado, medio y fecha de la fila que la saldó', () => {
    const r = refundContactFor({
      ...base,
      refund_status: 'approved',
      refund_method: 'transfer',
      refund_processed_at: '2026-03-16T15:00:00Z',
    })
    expect(r).toMatchObject({
      state: 'settled',
      settledMethod: 'transfer',
      settledAt: '2026-03-16T15:00:00.000Z',
      amountCents: 450000,
    })
  })
})
