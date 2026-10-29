// @vitest-environment happy-dom
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SelectMenu } from '@/components/ui/select-menu'
import { ChipGroup, DayChips } from '@/app/(public)/[slug]/components/ChipGroups'
import { MiniShirts } from '@/app/(player)/rival/MatchBits'
import { RIVAL_ACTION, RIVAL_GHOST } from '@/app/(player)/rival/rival-classes'
import { RivalCheckbox } from '@/app/(player)/rival/RivalCheckbox'
import { ShirtGrid } from '@/app/(player)/rival/p/[code]/ShirtGrid'

afterEach(cleanup)

const OPTIONS = [
  { value: 'a', label: 'Uno' },
  { value: 'b', label: 'Dos' },
]

describe('SelectMenu: props aria aditivas', () => {
  it('con aria-invalid y aria-describedby, el trigger los lleva', () => {
    render(
      <SelectMenu
        id="s"
        value=""
        onChange={() => {}}
        options={OPTIONS}
        aria-invalid
        aria-describedby="s-error"
      />,
    )
    const trigger = screen.getByRole('button')
    expect(trigger.getAttribute('aria-invalid')).toBe('true')
    expect(trigger.getAttribute('aria-describedby')).toBe('s-error')
  })

  it('sin esas props el DOM no suma atributos aria', () => {
    render(<SelectMenu id="s" value="" onChange={() => {}} options={OPTIONS} />)
    const trigger = screen.getByRole('button')
    expect(trigger.hasAttribute('aria-invalid')).toBe(false)
    expect(trigger.hasAttribute('aria-describedby')).toBe(false)
  })
})

describe('ChipGroup: props aditivas', () => {
  it('id, aria-invalid, aria-describedby y aria-required van al radiogroup', () => {
    render(
      <ChipGroup
        id="g"
        label="Formato"
        options={OPTIONS}
        value="a"
        onChange={() => {}}
        aria-invalid
        aria-describedby="g-error"
        aria-required
      />,
    )
    const group = screen.getByRole('radiogroup', { name: 'Formato' })
    expect(group.id).toBe('g')
    expect(group.getAttribute('aria-invalid')).toBe('true')
    expect(group.getAttribute('aria-describedby')).toBe('g-error')
    expect(group.getAttribute('aria-required')).toBe('true')
  })

  it('sin props nuevas el DOM queda como antes', () => {
    render(<ChipGroup label="Formato" options={OPTIONS} value="a" onChange={() => {}} />)
    const group = screen.getByRole('radiogroup', { name: 'Formato' })
    expect(group.hasAttribute('id')).toBe(false)
    expect(group.hasAttribute('aria-invalid')).toBe(false)
    expect(group.className).toBe('-m-1 flex gap-2 overflow-x-auto p-1 [scrollbar-width:none]')
    expect(screen.getByRole('radio', { name: 'Uno' }).className).not.toContain('tabular-nums')
  })

  it('className se suma al final y tabular pone tabular-nums en los chips', () => {
    render(
      <ChipGroup
        label="Hora"
        options={OPTIONS}
        value="a"
        onChange={() => {}}
        className="grid grid-cols-3 overflow-visible"
        tabular
      />,
    )
    const group = screen.getByRole('radiogroup', { name: 'Hora' })
    expect(group.className.endsWith('grid grid-cols-3 overflow-visible')).toBe(true)
    expect(screen.getByRole('radio', { name: 'Uno' }).className).toContain('tabular-nums')
  })

  it('elegir una opción sigue cambiando el valor', () => {
    function Harness() {
      const [v, setV] = useState('a')
      return <ChipGroup label="Formato" options={OPTIONS} value={v} onChange={setV} />
    }
    render(<Harness />)
    fireEvent.click(screen.getByRole('radio', { name: 'Dos' }))
    expect(screen.getByRole('radio', { name: 'Dos' }).getAttribute('aria-checked')).toBe('true')
  })
})

describe('DayChips: alwaysWrap', () => {
  const props = {
    days: ['2026-10-28', '2026-10-29'],
    today: '2026-10-28',
    value: '2026-10-28',
    isClosed: () => false,
    onChange: () => {},
  }

  it('por defecto es una fila que se desplaza; con alwaysWrap pasa a varias filas', () => {
    const { rerender } = render(<DayChips {...props} />)
    expect(screen.getByRole('radiogroup', { name: 'Día' }).className).not.toContain(
      'flex-wrap overflow-visible',
    )
    rerender(<DayChips {...props} alwaysWrap />)
    expect(screen.getByRole('radiogroup', { name: 'Día' }).className).toContain(
      'flex-wrap overflow-visible',
    )
  })
})

describe('RivalCheckbox', () => {
  function Harness({ invalid = false }: { invalid?: boolean }) {
    const [on, setOn] = useState(false)
    return (
      <form data-testid="f">
        <RivalCheckbox
          id="c"
          name="courtDeclared"
          checked={on}
          onChange={setOn}
          invalid={invalid}
          describedBy={invalid ? 'c-error' : undefined}
        >
          Ya tengo la cancha
        </RivalCheckbox>
      </form>
    )
  }

  it('se nombra por su texto, se tilda y manda "on" con su name', () => {
    render(<Harness />)
    const box = screen.getByRole('checkbox', { name: 'Ya tengo la cancha' }) as HTMLInputElement
    expect(box.checked).toBe(false)
    fireEvent.click(box)
    expect(box.checked).toBe(true)
    const data = new FormData(screen.getByTestId('f') as HTMLFormElement)
    expect(data.get('courtDeclared')).toBe('on')
  })

  it('con invalid lleva aria-invalid y aria-describedby; sin invalid no', () => {
    const { rerender } = render(<Harness />)
    const box = () => screen.getByRole('checkbox')
    expect(box().hasAttribute('aria-invalid')).toBe(false)
    rerender(<Harness invalid />)
    expect(box().getAttribute('aria-invalid')).toBe('true')
    expect(box().getAttribute('aria-describedby')).toBe('c-error')
    expect(box().id).toBe('c')
  })
})

describe('ShirtGrid: headline', () => {
  it('sin headline, equipo completo dice "¡Estamos los N! Se juega." como status', () => {
    render(<ShirtGrid capacity={5} confirmed={5} />)
    expect(screen.getByRole('status').textContent).toBe('¡Estamos los 5! Se juega.')
  })

  it('headline={null} saca el titular y deja el contador', () => {
    render(<ShirtGrid capacity={5} confirmed={5} headline={null} />)
    expect(screen.queryByText(/Se juega/)).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByText('5 de 5 confirmados')).toBeTruthy()
  })

  it('headline con texto reemplaza el titular, sin status', () => {
    render(<ShirtGrid capacity={5} confirmed={5} headline="Busca rival" />)
    expect(screen.getByText('Busca rival')).toBeTruthy()
    expect(screen.queryByText(/Se juega/)).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('el headline no toca el titular de un equipo que todavía no está completo', () => {
    render(<ShirtGrid capacity={5} confirmed={3} headline={null} />)
    expect(screen.getByText('Faltan 2')).toBeTruthy()
  })

  it('el contador visible usa la misma cifra que el nombre accesible (tope en el cupo)', () => {
    render(<ShirtGrid capacity={5} confirmed={7} />)
    expect(screen.getByText('5 de 5 confirmados')).toBeTruthy()
    expect(screen.getByRole('img', { name: '5 de 5 confirmados' })).toBeTruthy()
  })
})

describe('MiniShirts', () => {
  it('pinta capacity camisetas, rellenas hasta confirmed, y es decorativa', () => {
    const { container } = render(<MiniShirts capacity={10} confirmed={3} />)
    const root = container.firstElementChild as HTMLElement
    expect(root.getAttribute('aria-hidden')).toBe('true')
    const shirts = [...root.querySelectorAll('svg')]
    expect(shirts).toHaveLength(10)
    expect(shirts.filter((s) => s.getAttribute('class')?.includes('fill-emerald'))).toHaveLength(3)
  })

  it('con más confirmados que cupo no pasa del cupo', () => {
    const { container } = render(<MiniShirts capacity={4} confirmed={9} />)
    const shirts = [...container.querySelectorAll('svg')]
    expect(shirts).toHaveLength(4)
    expect(shirts.every((s) => s.getAttribute('class')?.includes('fill-emerald'))).toBe(true)
  })
})

describe('constantes de botón de RIVAL', () => {
  it('RIVAL_ACTION es el rectángulo del portal: sin píldora, a todo el ancho', () => {
    expect(RIVAL_ACTION).toContain('min-h-12')
    expect(RIVAL_ACTION).toContain('w-full')
    expect(RIVAL_ACTION).not.toContain('rounded-full')
  })

  it('RIVAL_GHOST separa el foco con el color del fondo y no fija ancho', () => {
    expect(RIVAL_GHOST).toContain('focus-visible:ring-offset-background')
    expect(RIVAL_GHOST).not.toContain('w-full')
  })
})
