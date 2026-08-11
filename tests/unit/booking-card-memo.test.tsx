// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { BookingCard } from '@/components/booking/BookingCard'

describe('BookingCard — React.memo wrapping', () => {
  it('BookingCard is wrapped with React.memo ($$typeof === Symbol.for("react.memo"))', () => {
    // React.memo sets $$typeof on the wrapper object. This is a stable internal
    // contract React has maintained since 16.6; it is the recommended way to
    // assert memo wrapping without brittle render-count tests.
    expect((BookingCard as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'))
  })
})
