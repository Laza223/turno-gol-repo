// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import * as Sentry from '@sentry/nextjs'

describe('ConfirmDialog', () => {
  it('type-to-confirm gates the confirm button', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    const onOpenChange = vi.fn()

    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Cerrar caja"
        confirmationPhrase="CERRAR"
        confirmLabel="Cerrar caja"
        onConfirm={onConfirm}
      />,
    )

    const confirmBtn = (await screen.findByRole('button', {
      name: 'Cerrar caja',
    })) as HTMLButtonElement
    expect(confirmBtn.disabled).toBe(true)

    const phraseInput = screen.getByLabelText(/Escribí/i, {
      exact: false,
    }) as HTMLInputElement
    fireEvent.change(phraseInput, { target: { value: 'CERRAR' } })

    await waitFor(() => {
      expect(confirmBtn.disabled).toBe(false)
    })
  })

  describe('phraseMatch', () => {
    function renderPhrase(phraseMatch?: 'exact' | 'email', variant?: 'destructive') {
      render(
        <ConfirmDialog
          open={true}
          onOpenChange={vi.fn()}
          title="Eliminar cuenta"
          confirmationPhrase="Ana@Example.com"
          phraseMatch={phraseMatch}
          variant={variant}
          confirmLabel="Eliminar"
          onConfirm={vi.fn().mockResolvedValue(undefined)}
        />,
      )
      return {
        input: screen.getByLabelText(/Escribí/i) as HTMLInputElement,
        confirm: screen.getByRole('button', { name: 'Eliminar' }) as HTMLButtonElement,
      }
    }

    it('por defecto es exacto: distingue mayúsculas (el panel no cambia)', async () => {
      const { input, confirm } = renderPhrase()
      fireEvent.change(input, { target: { value: 'ana@example.com' } })
      expect(confirm.disabled).toBe(true)
      fireEvent.change(input, { target: { value: '  Ana@Example.com ' } })
      await waitFor(() => expect(confirm.disabled).toBe(false))
    })

    it('por defecto el campo no se arma para un email', () => {
      const { input } = renderPhrase()
      expect(input.getAttribute('autocapitalize')).toBeNull()
      expect(input.getAttribute('inputmode')).toBeNull()
    })

    it('"email" compara sin mayúsculas ni espacios de más', async () => {
      const { input, confirm } = renderPhrase('email')
      fireEvent.change(input, { target: { value: '  ana@EXAMPLE.com ' } })
      await waitFor(() => expect(confirm.disabled).toBe(false))
      fireEvent.change(input, { target: { value: 'ana@example.co' } })
      await waitFor(() => expect(confirm.disabled).toBe(true))
    })

    it('en modo email el rótulo es de 14 px, el email parte de renglón y el confirmar deshabilitado no se desvanece', () => {
      const { confirm } = renderPhrase('email')
      const rotulo = document.querySelector('label[for="confirm-phrase"]')!
      expect(rotulo.className).toContain('text-sm')
      expect(rotulo.className).not.toContain('text-xs')
      expect(screen.getByText('Ana@Example.com').className).toContain('break-all')
      expect(confirm.disabled).toBe(true)
      expect(confirm.className).toContain('disabled:opacity-100')
      expect(confirm.className).toContain('disabled:cursor-not-allowed')
      // El estado se dice con texto, y se va cuando el email coincide.
      expect(screen.getByText(/se activa cuando escribís el email completo/i)).toBeTruthy()
      fireEvent.change(screen.getByLabelText(/Escribí/i), { target: { value: 'ana@example.com' } })
      expect(screen.queryByText(/se activa cuando escribís/i)).toBeNull()
    })

    it('modo email: la ayuda describe el campo solo mientras se ve; el pie se apila en mobile; el confirmar deshabilitado no cambia con el hover', () => {
      const { input, confirm } = renderPhrase('email', 'destructive')
      expect(input.getAttribute('aria-describedby')).toBe('confirm-phrase-help')
      expect(document.getElementById('confirm-phrase-help')).not.toBeNull()
      const pie = confirm.parentElement!
      expect(pie.className).toContain('flex-col-reverse')
      expect(pie.className).toContain('sm:flex-row')
      expect(confirm.className).toContain('w-full')
      expect(confirm.className).toContain('disabled:hover:bg-destructive')
      fireEvent.change(input, { target: { value: 'ana@example.com' } })
      expect(input.getAttribute('aria-describedby')).toBeNull()
    })

    it('modo exact: las clases del pie, del cancelar y del confirmar son las de siempre, byte a byte', () => {
      const { confirm } = renderPhrase()
      expect(confirm.parentElement!.className).toBe('flex justify-end gap-2 pt-2')
      expect(confirm.previousElementSibling!.className).toBe(
        'h-11 md:h-10 rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      )
      expect(confirm.className).toBe(
        'inline-flex h-11 md:h-10 items-center justify-center rounded-md px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-primary hover:bg-primary/90 text-primary-foreground',
      )
      expect(screen.getByLabelText(/Escribí/i).getAttribute('aria-describedby')).toBeNull()
    })

    it('el modo exact (panel) queda idéntico: rótulo de 12 px, opacity-50 y sin texto de ayuda', () => {
      const { confirm } = renderPhrase()
      expect(document.querySelector('label[for="confirm-phrase"]')!.className).toContain('text-xs')
      expect(screen.getByText('Ana@Example.com').className).not.toContain('break-all')
      expect(confirm.className).toContain('disabled:opacity-50')
      expect(confirm.className).not.toContain('disabled:opacity-100')
      expect(screen.queryByText(/se activa cuando escribís/i)).toBeNull()
    })

    it('"email" arma el campo para tipear un email', () => {
      const { input } = renderPhrase('email')
      expect(input.getAttribute('autocapitalize')).toBe('none')
      expect(input.getAttribute('autocorrect')).toBe('off')
      expect(input.getAttribute('spellcheck')).toBe('false')
      expect(input.getAttribute('inputmode')).toBe('email')
    })
  })

  it('onConfirm returning {success:false} keeps the dialog open and shows the error', async () => {
    const onConfirm = vi.fn().mockResolvedValue({ success: false, error: 'boom' })
    const onOpenChange = vi.fn()

    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Acción destructiva"
        confirmLabel="Confirmar"
        onConfirm={onConfirm}
      />,
    )

    const confirmBtn = await screen.findByRole('button', { name: 'Confirmar' })
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert.textContent).toContain('boom')
    })

    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('onConfirm success closes the dialog', async () => {
    const onConfirm = vi.fn().mockResolvedValue({ success: true })
    const onOpenChange = vi.fn()

    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Confirmar acción"
        confirmLabel="Confirmar"
        onConfirm={onConfirm}
      />,
    )

    const confirmBtn = await screen.findByRole('button', { name: 'Confirmar' })
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })

  it('onConfirm que lanza mantiene el dialog abierto, muestra error y reporta a Sentry (#17)', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('db down'))
    const onOpenChange = vi.fn()

    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Acción"
        confirmLabel="Confirmar"
        onConfirm={onConfirm}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar' }))

    await waitFor(() => {
      // No manda a reintentar a ciegas: la acción pudo haberse hecho igual.
      expect(screen.getByRole('alert').textContent).toContain('No pudimos confirmar si se hizo')
    })
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledTimes(1)
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('cancel closes the dialog', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    const onOpenChange = vi.fn()

    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Confirmar acción"
        cancelLabel="Cancelar"
        onConfirm={onConfirm}
      />,
    )

    const cancelBtn = await screen.findByRole('button', { name: 'Cancelar' })
    fireEvent.click(cancelBtn)

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('consequences renderiza cada ítem en una lista, sin que el caller arme el <ul> a mano', async () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title="Marcar como ausente"
        consequences={[
          'La seña pagada queda para el complejo.',
          'Queda bloqueado 14 días para reservar online.',
        ]}
        onConfirm={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    expect(screen.getByText('La seña pagada queda para el complejo.')).toBeTruthy()
    expect(screen.getByText('Queda bloqueado 14 días para reservar online.')).toBeTruthy()
  })
})
