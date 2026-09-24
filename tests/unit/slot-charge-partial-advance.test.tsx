// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }))

import { HoyChargeModal } from '@/app/(admin)/dashboard/_components/HoyChargeModal'
import type { SlotPanelActions } from '@/components/booking/slot-panel/actions'
import { booking, toGridBooking } from '@/test/fixtures/booking'
import { player } from '@/test/fixtures/player'

/**
 * Repro + fix Stream D/A — "no se puede hacer pago parcial en un cobro
 * adelantado desde la grilla seleccionando un turno que no se jugó".
 *
 * Turno confirmado, `hasEnded=false` ⇒ `chargeMode` = 'advance'. Con D3 el
 * monto queda A LA VISTA (ya no hay "Cobrar otro monto"): el campo arranca
 * precargado con el pendiente completo, "para corregir, no para escribir de
 * cero".
 *
 * Causa raíz confirmada por Stream D (money.ts:27 `splitPesosInput` +
 * money-input.tsx `handleChange`): el parser decide "separador de miles" vs
 * "coma decimal" mirando sólo los ÚLTIMOS 0-2 dígitos después del ÚLTIMO
 * separador. Sirve para tipear un decimal nuevo, pero EDITAR EN EL SITIO un
 * valor ya agrupado en miles (el pendiente precargado, ej. "24.000")
 * corrompe el monto en cuanto se toca una tecla al final — el único lugar
 * donde el caret puede estar.
 *
 * Fix aplicado en `SplitPaymentFields`/`money-input.tsx`: seleccionar todo el
 * texto al enfocar el campo. La PRIMERA tecla después de eso reemplaza el
 * valor entero en vez de editarlo en el sitio.
 *
 * Mudado de BookingSlotPanel.tsx a HoyChargeModal (paso 3, docs/decisions/
 * 2026-09-24-navegacion-panel.md): el panel de la Grilla se borró.
 */
function makeActions(overrides: Partial<SlotPanelActions> = {}): SlotPanelActions {
  return {
    chargeDebtAction: vi.fn(async () => ({ success: true as const })),
    completeAndChargeBookingAction: vi.fn(async () => ({ success: true as const })),
    addBookingChargeAction: vi.fn(async () => ({ success: true as const })),
    markNoShowAction: vi.fn(async () => ({ success: true as const })),
    ...overrides,
  }
}

const COURTS = [
  {
    id: 'court-1',
    name: 'Cancha 1',
    status: 'online' as const,
    capacity: 10,
    pricing: { rules: [] } as never,
  },
]

afterEach(cleanup)

describe('Cobro parcial en modo "advance" (turno confirmado, todavía no jugado)', () => {
  it('el monto queda a la vista, precargado con el pendiente', async () => {
    render(
      <HoyChargeModal
        booking={{
          ...toGridBooking(booking(), player()),
          priceSnapshot: 2_400_000,
          totalPaid: 0,
          pending: 2_400_000,
        }}
        courtName="Cancha 1"
        courts={COURTS}
        dayBookings={[]}
        daySlots={[]}
        nowMs={Date.now()}
        isRefreshing={false}
        onClose={vi.fn()}
        onMutated={vi.fn()}
        hasEnded={false}
        actions={makeActions()}
      />,
    )

    const amountInput = (await screen.findByPlaceholderText('Monto')) as HTMLInputElement
    expect(amountInput.value).toBe('24.000')
  })

  it('enfocar el monto precargado selecciona todo el texto (fix del diagnóstico)', async () => {
    render(
      <HoyChargeModal
        booking={{
          ...toGridBooking(booking(), player()),
          priceSnapshot: 2_400_000,
          totalPaid: 0,
          pending: 2_400_000,
        }}
        courtName="Cancha 1"
        courts={COURTS}
        dayBookings={[]}
        daySlots={[]}
        nowMs={Date.now()}
        isRefreshing={false}
        onClose={vi.fn()}
        onMutated={vi.fn()}
        hasEnded={false}
        actions={makeActions()}
      />,
    )

    const amountInput = (await screen.findByPlaceholderText('Monto')) as HTMLInputElement
    fireEvent.focus(amountInput)

    // Todo el texto seleccionado: la PRIMERA tecla que venga reemplaza el
    // valor entero en vez de editarlo en el sitio (que es lo que corrompía el
    // monto — ver el bloque de comentarios de arriba).
    expect(amountInput.selectionStart).toBe(0)
    expect(amountInput.selectionEnd).toBe(amountInput.value.length)
  })

  it('reemplazar el monto precargado por uno menor cobra el adelanto parcial correcto', async () => {
    const addBookingChargeAction = vi.fn(async () => ({ success: true as const }))
    const actions = makeActions({ addBookingChargeAction })

    render(
      <HoyChargeModal
        booking={{
          ...toGridBooking(booking(), player()),
          priceSnapshot: 2_400_000,
          totalPaid: 0,
          pending: 2_400_000, // $24.000 pendientes
        }}
        courtName="Cancha 1"
        courts={COURTS}
        dayBookings={[]}
        daySlots={[]}
        nowMs={Date.now()}
        isRefreshing={false}
        onClose={vi.fn()}
        onMutated={vi.fn()}
        hasEnded={false} // turno todavía no jugado ⇒ mode 'advance'
        actions={actions}
      />,
    )

    const amountInput = (await screen.findByPlaceholderText('Monto')) as HTMLInputElement
    expect(amountInput.value).toBe('24.000')

    // Enfocar selecciona todo (test de arriba); tipear ENCIMA de una
    // selección la REEMPLAZA — el admin no "corrige hacia abajo" el número
    // agrupado, lo vuelve a escribir de cero. Acá se simula ese reemplazo
    // directo (fireEvent.change no reproduce selección real de teclado).
    fireEvent.focus(amountInput)
    fireEvent.change(amountInput, { target: { value: '6000' } })
    expect(amountInput.value).toBe('6.000')

    fireEvent.click(
      screen.getByRole('button', {
        name: /^Cobrar \$.?6\.000 por adelantado · quedan \$.?18\.000$/,
      }),
    )

    await waitFor(() =>
      expect(addBookingChargeAction).toHaveBeenCalledWith(
        expect.objectContaining({ charges: [{ amount: 600_000, method: 'cash' }] }),
      ),
    )
  })

  // Auditoría 2026-09-16, hallazgo 🟡 5: el fix de seleccionar todo al enfocar
  // resuelve editar EN EL SITIO un monto precargado, pero no cubre pegar/tipear
  // un DECIMAL sobre la selección completa — "50,75" pegado sobre "24.000"
  // precargado caía en la rama que borra separadores y cobraba $5.075 en vez
  // de $50. Este test cubre el circuito completo, con el mismo precargado real
  // que usan los casos de arriba.
  it('reemplazar el monto precargado por uno pegado con separador decimal no lo infla ×100', async () => {
    const addBookingChargeAction = vi.fn(async () => ({ success: true as const }))
    const actions = makeActions({ addBookingChargeAction })

    render(
      <HoyChargeModal
        booking={{
          ...toGridBooking(booking(), player()),
          priceSnapshot: 2_400_000,
          totalPaid: 0,
          pending: 2_400_000, // $24.000 pendientes
        }}
        courtName="Cancha 1"
        courts={COURTS}
        dayBookings={[]}
        daySlots={[]}
        nowMs={Date.now()}
        isRefreshing={false}
        onClose={vi.fn()}
        onMutated={vi.fn()}
        hasEnded={false} // turno todavía no jugado ⇒ mode 'advance'
        actions={actions}
      />,
    )

    const amountInput = (await screen.findByPlaceholderText('Monto')) as HTMLInputElement
    expect(amountInput.value).toBe('24.000')

    // Pegado atómico sobre el campo YA precargado (seleccionar todo + pegar):
    // el string nuevo no continúa "24.000" ni lo acorta por el final.
    fireEvent.focus(amountInput)
    fireEvent.change(amountInput, { target: { value: '50,75' } })
    // La cola ",75" no queda a la vista en este salto puntual (mismo matiz
    // visual ya documentado para el pegado atómico en money-input.test.tsx) —
    // lo que importa es el monto: $50, no $5.075.
    expect(amountInput.value).toBe('50')

    fireEvent.click(
      screen.getByRole('button', {
        name: /^Cobrar \$.?50 por adelantado · quedan \$.?23\.950$/,
      }),
    )

    await waitFor(() =>
      expect(addBookingChargeAction).toHaveBeenCalledWith(
        expect.objectContaining({ charges: [{ amount: 5_000, method: 'cash' }] }),
      ),
    )
  })
})
