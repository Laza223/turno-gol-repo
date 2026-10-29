// @vitest-environment happy-dom
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SelectMenu } from '@/components/ui/select-menu'
import { ChipGroup } from '@/app/(public)/[slug]/components/ChipGroups'
import { useFieldErrors } from '@/app/(player)/rival/use-field-errors'

afterEach(cleanup)

const IDS = { tenantId: 'f-complejo', format: 'f-formato', level: 'f-nivel' }
const ORDER = ['tenantId', 'format', 'level'] as const
type Field = (typeof ORDER)[number]

const MESSAGES = {
  tenantId: 'Elegí el complejo.',
  format: 'Elegí el formato.',
  level: 'Elegí el nivel.',
}

/** Un form mínimo que usa el hook como lo hará NewMatchForm: `state` es la respuesta del server. */
function Harness({ initial }: { initial: Partial<Record<Field, string>> | undefined }) {
  const [state, setState] = useState({ errors: initial })
  const [tenant, setTenant] = useState('')
  const fe = useFieldErrors<Field>({
    errors: state.errors,
    order: ORDER,
    ids: IDS,
    resetKey: state,
  })
  return (
    <div>
      <SelectMenu
        {...fe.controlProps('tenantId')}
        value={tenant}
        onChange={(v) => {
          setTenant(v)
          fe.clear('tenantId')
        }}
        options={[{ value: 'a', label: 'Complejo A' }]}
        placeholder="Elegí el complejo"
      />
      {fe.message('tenantId') && <p {...fe.messageProps('tenantId')}>{fe.message('tenantId')}</p>}
      <ChipGroup
        {...fe.controlProps('format')}
        label="Formato"
        options={[{ value: '5', label: 'Fútbol 5' }]}
        value=""
        onChange={() => fe.clear('format')}
      />
      {fe.message('format') && <p {...fe.messageProps('format')}>{fe.message('format')}</p>}
      <ChipGroup
        {...fe.controlProps('level')}
        label="Nivel"
        options={[{ value: 'p', label: 'Parejo' }]}
        value="p"
        onChange={() => fe.clear('level')}
      />
      {fe.message('level') && <p {...fe.messageProps('level')}>{fe.message('level')}</p>}
      <button type="button" onClick={() => setState({ errors: MESSAGES })}>
        Enviar
      </button>
    </div>
  )
}

async function send() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
  })
}

describe('useFieldErrors', () => {
  it('sin errores no marca ningún control ni mueve el foco', () => {
    render(<Harness initial={undefined} />)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(document.getElementById(IDS.tenantId)?.hasAttribute('aria-invalid')).toBe(false)
    expect(document.activeElement).toBe(document.body)
  })

  it('con 3 errores: un solo alert (el primer campo), los demás <p> comunes, foco al primero', async () => {
    render(<Harness initial={undefined} />)
    await send()
    const alerts = screen.getAllByRole('alert')
    expect(alerts).toHaveLength(1)
    expect(alerts[0].textContent).toBe('Elegí el complejo.')
    expect(screen.getByText('Elegí el formato.').id).toBe('f-formato-error')
    expect(screen.getByText('Elegí el nivel.').hasAttribute('role')).toBe(false)
    const trigger = document.getElementById(IDS.tenantId)
    expect(document.activeElement).toBe(trigger)
    expect(trigger?.getAttribute('aria-invalid')).toBe('true')
    expect(trigger?.getAttribute('aria-describedby')).toBe('f-complejo-error')
    expect(document.getElementById(IDS.format)?.getAttribute('aria-describedby')).toBe(
      'f-formato-error',
    )
  })

  it('si el primer campo con error es un radiogroup, el foco va a su primera opción', async () => {
    // El complejo ya está bien: solo falla el formato.
    function OnlyFormat() {
      const [state] = useState({ errors: { format: 'Elegí el formato.' } })
      const fe = useFieldErrors<Field>({
        errors: state.errors,
        order: ORDER,
        ids: IDS,
        resetKey: state,
      })
      return (
        <ChipGroup
          {...fe.controlProps('format')}
          label="Formato"
          options={[{ value: '5', label: 'Fútbol 5' }]}
          value=""
          onChange={() => {}}
        />
      )
    }
    render(<OnlyFormat />)
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Fútbol 5' }))
  })

  it('editar un campo limpia su mensaje; el alert pasa al siguiente y el foco no se mueve', async () => {
    render(<Harness initial={undefined} />)
    await send()
    const trigger = screen.getByRole('button', { name: /Elegí el complejo/ })
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Complejo A' }))
    expect(screen.queryByText('Elegí el complejo.')).toBeNull()
    expect(document.getElementById(IDS.tenantId)?.hasAttribute('aria-invalid')).toBe(false)
    const alerts = screen.getAllByRole('alert')
    expect(alerts).toHaveLength(1)
    expect(alerts[0].textContent).toBe('Elegí el formato.')
    expect(document.activeElement).not.toBe(screen.getByRole('radio', { name: 'Fútbol 5' }))
  })

  it('una respuesta nueva trae de vuelta los mensajes limpiados y vuelve a enfocar', async () => {
    render(<Harness initial={undefined} />)
    await send()
    fireEvent.click(screen.getByRole('radio', { name: 'Fútbol 5' }))
    expect(screen.queryByText('Elegí el formato.')).toBeNull()
    await send()
    expect(screen.getByText('Elegí el formato.')).toBeTruthy()
    expect(document.activeElement).toBe(document.getElementById(IDS.tenantId))
  })
})
