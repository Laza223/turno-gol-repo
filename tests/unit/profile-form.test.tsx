// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ProfileForm } from '@/app/(player)/configuracion/ProfileForm'
import type { UpdateProfileResult } from '@/app/(player)/configuracion/actions'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const defaults = {
  firstName: 'Tomás',
  lastName: 'Ibáñez',
  phone: '',
  preferredArea: 'Palermo',
}

function renderForm(result: UpdateProfileResult) {
  const action = vi.fn(async () => result)
  render(<ProfileForm defaultValues={defaults} action={action} />)
  return action
}

const guardar = () => fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

describe('ProfileForm', () => {
  it('el error de un campo va junto a ese campo, que queda marcado', async () => {
    renderForm({ success: false, error: 'Nombre requerido', field: 'first_name' })
    guardar()
    const alerta = await screen.findByRole('alert')
    expect(alerta.textContent).toBe('Nombre requerido')
    const campo = screen.getByLabelText('Nombre')
    expect(campo.getAttribute('aria-invalid')).toBe('true')
    expect(campo.getAttribute('aria-describedby')).toBe(alerta.id)
    // El otro campo no se marca.
    expect(screen.getByLabelText(/Apellido/).getAttribute('aria-invalid')).toBeNull()
  })

  it('el error del teléfono marca su campo y lo asocia al mensaje', async () => {
    renderForm({ success: false, error: 'Teléfono muy corto', field: 'phone' })
    guardar()
    const alerta = await screen.findByRole('alert')
    const campo = screen.getByLabelText('Teléfono')
    expect(campo.getAttribute('aria-invalid')).toBe('true')
    expect(campo.getAttribute('aria-describedby')).toBe(alerta.id)
  })

  it('un error sin campo va una vez, debajo, sin marcar ningún campo', async () => {
    renderForm({ success: false, error: 'No encontramos tu perfil.' })
    guardar()
    expect((await screen.findByRole('alert')).textContent).toBe('No encontramos tu perfil.')
    expect(screen.getByLabelText('Nombre').getAttribute('aria-invalid')).toBeNull()
  })

  it('"Guardado" aparece al guardar y desaparece en cuanto se vuelve a editar', async () => {
    renderForm({ success: true })
    expect(screen.getByRole('status').textContent).toBe('')
    guardar()
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Guardado'))
    fireEvent.change(screen.getByLabelText('Zona preferida'), { target: { value: 'Norte' } })
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(''))
  })

  it('al fallar no pisa lo que el jugador escribió', async () => {
    renderForm({ success: false, error: 'Nombre requerido', field: 'first_name' })
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Otro' } })
    guardar()
    await screen.findByRole('alert')
    expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe('Otro')
  })

  it('el apellido es opcional: sin required y rotulado', () => {
    renderForm({ success: true })
    const apellido = screen.getByLabelText(/Apellido/) as HTMLInputElement
    expect(apellido.required).toBe(false)
    expect(screen.getByText('(opcional)')).toBeTruthy()
    expect((screen.getByLabelText('Nombre') as HTMLInputElement).required).toBe(true)
  })

  it('manda a la action los valores del form, con el campo vacío incluido', async () => {
    const action = renderForm({ success: true })
    fireEvent.change(screen.getByLabelText(/Apellido/), { target: { value: '' } })
    guardar()
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    const calls = action.mock.calls as unknown as [UpdateProfileResult, FormData][]
    const data = calls[0]![1]
    expect(data.get('first_name')).toBe('Tomás')
    expect(data.get('last_name')).toBe('')
  })

  it('un texto viejo de la zona se muestra y se conserva hasta que elija otra localidad', async () => {
    const action = renderForm({ success: true })
    expect(screen.getByText('Tu zona actual: Palermo')).toBeTruthy()
    guardar()
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    const calls = action.mock.calls as unknown as [UpdateProfileResult, FormData][]
    expect(calls[0]![1].get('preferred_area')).toBe('Palermo')
  })

  it('una zona guardada como "Ciudad, Provincia" vuelve a mostrarse en el buscador', async () => {
    const action = vi.fn(async () => ({ success: true as const }))
    render(
      <ProfileForm
        defaultValues={{ ...defaults, preferredArea: 'Luján, Buenos Aires' }}
        action={action}
      />,
    )
    expect((screen.getByLabelText('Zona preferida') as HTMLInputElement).value).toBe(
      'Luján, Buenos Aires',
    )
    expect(screen.queryByText(/Tu zona actual/)).toBeNull()
    guardar()
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    const calls = action.mock.calls as unknown as [UpdateProfileResult, FormData][]
    expect(calls[0]![1].get('preferred_area')).toBe('Luján, Buenos Aires')
  })

  it('elegir una localidad del país reemplaza la zona: "Luján, Buenos Aires"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          results: [
            { city: 'Luján', province: 'Buenos Aires', lat: -34.57, lng: -59.1, source: 'dataset' },
          ],
        }),
      })),
    )
    const action = renderForm({ success: true })
    fireEvent.change(screen.getByLabelText('Zona preferida'), { target: { value: 'lujan' } })
    fireEvent.click(await screen.findByRole('option', { name: /Luján/ }))
    expect(screen.queryByText(/Tu zona actual/)).toBeNull()

    guardar()
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    const calls = action.mock.calls as unknown as [UpdateProfileResult, FormData][]
    expect(calls[0]![1].get('preferred_area')).toBe('Luján, Buenos Aires')
    vi.unstubAllGlobals()
  })

  it('al guardar el botón traza un tilde que se va a los 1,2 s; "Guardado" queda', async () => {
    renderForm({ success: true })
    const boton = screen.getByRole('button', { name: 'Guardar cambios' })
    expect(boton.querySelector('.pa-tick')).toBeNull()
    guardar()
    await waitFor(() => expect(boton.querySelector('.pa-tick')).not.toBeNull())
    await waitFor(() => expect(boton.querySelector('.pa-tick')).toBeNull(), { timeout: 2500 })
    expect(screen.getByRole('status').textContent).toBe('Guardado')
    // El tilde es decoración: el nombre del botón no cambia.
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBe(boton)
  })

  it('no dice "Guardado" mientras la action sigue pendiente', async () => {
    let release: (r: UpdateProfileResult) => void = () => {}
    const action = vi.fn(
      () =>
        new Promise<UpdateProfileResult>((resolve) => {
          release = resolve
        }),
    )
    render(<ProfileForm defaultValues={defaults} action={action} />)
    guardar()
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    await screen.findByRole('button', { name: 'Guardando…' })
    expect(screen.getByRole('status').textContent).toBe('')
    release({ success: true })
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Guardado'))
  })
})
