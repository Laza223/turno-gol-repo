// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import Combobox, { type ComboboxOption } from '@/components/ui/combobox'

const OPTIONS: ComboboxOption[] = [
  { value: 'Buenos Aires||CABA', label: 'Buenos Aires, CABA', hint: '12' },
  { value: 'Córdoba||Córdoba', label: 'Córdoba, Córdoba', hint: '8' },
  { value: 'Rosario||Santa Fe', label: 'Rosario, Santa Fe' },
]

function setup(props: Partial<React.ComponentProps<typeof Combobox>> = {}) {
  const onChange = vi.fn()
  const utils = render(
    <Combobox
      id="city"
      options={OPTIONS}
      value=""
      onChange={onChange}
      placeholder="Todas las ciudades"
      emptyMessage="No encontramos esa localidad"
      {...props}
    />,
  )
  const input = screen.getByRole('combobox') as HTMLInputElement
  return { ...utils, input, onChange }
}

describe('Combobox — render y ARIA', () => {
  it('renderiza un input role=combobox cerrado con los atributos ARIA del patrón', () => {
    const { input } = setup()
    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(input.getAttribute('aria-autocomplete')).toBe('list')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('al abrir, el listbox tiene el id apuntado por aria-controls y opciones role=option', () => {
    const { input } = setup()
    fireEvent.click(input)
    const listbox = screen.getByRole('listbox')
    expect(listbox.id).toBe('city-listbox')
    expect(input.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getAllByRole('option')).toHaveLength(3)
  })

  it('muestra el label de la opción seleccionada cuando value viene de afuera', () => {
    const { input } = setup({ value: 'Rosario||Santa Fe' })
    expect(input.value).toBe('Rosario, Santa Fe')
  })
})

describe('Combobox — filtrado', () => {
  it('filtra al tipear, insensible a acentos ("cor" matchea Córdoba)', () => {
    const { input } = setup()
    fireEvent.change(input, { target: { value: 'cor' } })
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(1)
    expect(options[0]?.textContent).toContain('Córdoba')
  })

  it('muestra el mensaje de vacío cuando no hay coincidencias, sin opciones', () => {
    const { input } = setup()
    fireEvent.change(input, { target: { value: 'zzz' } })
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(screen.getAllByText('No encontramos esa localidad').length).toBeGreaterThan(0)
  })
})

describe('Combobox — teclado', () => {
  it('ArrowDown abre la lista y activa la primera opción (aria-activedescendant)', () => {
    const { input } = setup()
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input.getAttribute('aria-expanded')).toBe('true')
    const options = screen.getAllByRole('option')
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0]?.id)
    expect(options[0]?.getAttribute('aria-selected')).toBe('true')
  })

  it('ArrowDown mueve la opción activa y Enter la selecciona', () => {
    const { input, onChange } = setup()
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    const options = screen.getAllByRole('option')
    expect(input.getAttribute('aria-activedescendant')).toBe(options[1]?.id)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('Córdoba||Córdoba')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(input.getAttribute('aria-expanded')).toBe('false')
  })

  it('Enter selecciona la única opción filtrada', () => {
    const { input, onChange } = setup()
    fireEvent.change(input, { target: { value: 'rosa' } })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('Rosario||Santa Fe')
  })

  it('Escape cierra la lista sin seleccionar', () => {
    const { input, onChange } = setup()
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(screen.getByRole('listbox')).toBeTruthy()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('Combobox — mouse y blur', () => {
  it('click en una opción la selecciona', () => {
    const { input, onChange } = setup()
    fireEvent.click(input)
    const option = screen.getAllByRole('option')[2]
    expect(option).toBeTruthy()
    fireEvent.mouseDown(option as HTMLElement)
    expect(onChange).toHaveBeenCalledWith('Rosario||Santa Fe')
  })

  it('blur con texto que no matchea revierte al label del value actual', () => {
    const { input } = setup({ value: 'Córdoba||Córdoba' })
    fireEvent.change(input, { target: { value: 'qwerty' } })
    fireEvent.blur(input)
    expect(input.value).toBe('Córdoba, Córdoba')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('blur con texto que matchea exacto (sin acentos) selecciona esa opción', () => {
    const { input, onChange } = setup()
    fireEvent.change(input, { target: { value: 'cordoba, cordoba' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith('Córdoba||Córdoba')
  })

  it('vaciar el input y salir limpia la selección (onChange(""))', () => {
    const { input, onChange } = setup({ value: 'Córdoba||Córdoba' })
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('un click simple (sin mousedown, como los sintetizados por AT) también selecciona', () => {
    const { input, onChange } = setup()
    fireEvent.click(input)
    const option = screen.getAllByRole('option')[1]
    fireEvent.click(option as HTMLElement)
    expect(onChange).toHaveBeenCalledWith('Córdoba||Córdoba')
  })

  it('mousedown sobre el panel (scrollbar/padding) no roba el foco ni selecciona', () => {
    const { input, onChange } = setup()
    fireEvent.click(input)
    const listbox = screen.getByRole('listbox')
    // preventDefault en el ul: agarrar el scrollbar no debe blurear el input ni cerrar la lista.
    const notPrevented = fireEvent.mouseDown(listbox)
    expect(notPrevented).toBe(false)
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('listbox')).toBeTruthy()
  })

  it('click derecho sobre una opción no la selecciona', () => {
    const { input, onChange } = setup()
    fireEvent.click(input)
    const option = screen.getAllByRole('option')[1]
    fireEvent.mouseDown(option as HTMLElement, { button: 2 })
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('listbox')).toBeTruthy()
  })

  it('el mouse activa opciones solo con movimiento real (no con hover sintético del scroll)', () => {
    const { input } = setup()
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    const options = screen.getAllByRole('option')
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0]?.id)
    // Movimiento real sobre la opción 2 → la activa.
    fireEvent.mouseMove(options[2] as HTMLElement, { clientX: 10, clientY: 40 })
    expect(input.getAttribute('aria-activedescendant')).toBe(options[2]?.id)
    // El teclado retoma el control…
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input.getAttribute('aria-activedescendant')).toBe(options[1]?.id)
    // …y un mousemove sintético (mismas coordenadas, disparado por el scroll) NO lo pisa.
    fireEvent.mouseMove(options[2] as HTMLElement, { clientX: 10, clientY: 40 })
    expect(input.getAttribute('aria-activedescendant')).toBe(options[1]?.id)
  })
})

describe('Combobox — opción de limpieza ("Todas las ciudades")', () => {
  it('con clearOptionLabel, la primera opción al abrir limpia la selección', () => {
    const { input, onChange } = setup({
      clearOptionLabel: 'Todas las ciudades',
      value: 'Córdoba||Córdoba',
    })
    fireEvent.click(input)
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(4)
    expect(options[0]?.textContent).toContain('Todas las ciudades')
    fireEvent.click(options[0] as HTMLElement)
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('mientras se filtra, la opción de limpieza no aparece', () => {
    const { input } = setup({ clearOptionLabel: 'Todas las ciudades' })
    fireEvent.change(input, { target: { value: 'cor' } })
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(1)
    expect(options[0]?.textContent).toContain('Córdoba')
  })
})

describe('Combobox — anuncios y casos límite', () => {
  it('anuncia la cantidad de resultados en una región de status', () => {
    const { input } = setup()
    fireEvent.change(input, { target: { value: 'cor' } })
    expect(screen.getByRole('status').textContent).toContain('1 opción')
    fireEvent.change(input, { target: { value: 'a' } })
    expect(screen.getByRole('status').textContent).toContain('opciones')
  })

  it('anuncia el mensaje de vacío cuando no hay coincidencias', () => {
    const { input } = setup()
    fireEvent.change(input, { target: { value: 'zzz' } })
    expect(screen.getByRole('status').textContent).toContain('No encontramos esa localidad')
  })

  it('Enter con texto sin coincidencias no envía el form: revierte y cierra', () => {
    const { input, onChange } = setup({ value: 'Córdoba||Córdoba' })
    fireEvent.change(input, { target: { value: 'zzz' } })
    const notPrevented = fireEvent.keyDown(input, { key: 'Enter' })
    expect(notPrevented).toBe(false)
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(input.value).toBe('Córdoba, Córdoba')
  })

  it('sin lista abierta, aria-controls no apunta a un id inexistente', () => {
    const { input } = setup()
    expect(input.getAttribute('aria-controls')).toBeNull()
    fireEvent.click(input)
    expect(input.getAttribute('aria-controls')).toBe('city-listbox')
  })

  it('el listbox usa listboxLabel como nombre accesible, no el placeholder', () => {
    const { input } = setup({ listboxLabel: 'Localidades' })
    fireEvent.click(input)
    expect(screen.getByRole('listbox', { name: 'Localidades' })).toBeTruthy()
  })
})
