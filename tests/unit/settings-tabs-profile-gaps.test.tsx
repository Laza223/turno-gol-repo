// @vitest-environment happy-dom
//
// Punto en la pestaña Perfil cuando al perfil público le falta algo (portada,
// logo, ubicación). Lo calcula el layout del panel y lo lee SettingsTabs por
// contexto, porque cada página renderiza sus pestañas por su cuenta.
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { SettingsTabs } from '@/app/(admin)/settings/SettingsTabs'
import { SetupAlertsProvider } from '@/components/layout/setup-alerts-context'

beforeEach(() => {
  // Las pestañas se cuelgan por portal de la barra superior del panel.
  const host = document.createElement('div')
  host.id = 'admin-header-slot'
  document.body.appendChild(host)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('SettingsTabs — aviso de perfil incompleto', () => {
  it('con faltantes, la pestaña Perfil lo anuncia y las demás no', () => {
    render(
      <SetupAlertsProvider alerts={{ courts: 0, profile: 2 }}>
        <SettingsTabs active="/settings/reservas" />
      </SetupAlertsProvider>,
    )

    expect(screen.getByRole('link', { name: /Perfil.*2 cosas por completar/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Reservas' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Horarios' })).toBeInTheDocument()
  })

  it('con un solo faltante, habla en singular', () => {
    render(
      <SetupAlertsProvider alerts={{ courts: 0, profile: 1 }}>
        <SettingsTabs active="/settings/reservas" />
      </SetupAlertsProvider>,
    )

    expect(screen.getByRole('link', { name: /Perfil.*1 cosa por completar/ })).toBeInTheDocument()
  })

  it('perfil completo: la pestaña queda como siempre', () => {
    render(
      <SetupAlertsProvider alerts={{ courts: 0, profile: 0 }}>
        <SettingsTabs active="/settings/reservas" />
      </SetupAlertsProvider>,
    )

    expect(screen.getByRole('link', { name: 'Perfil' })).toBeInTheDocument()
  })

  it('sin provider (loading, stories) no muestra nada', () => {
    render(<SettingsTabs active="/settings/reservas" />)

    expect(screen.getByRole('link', { name: 'Perfil' })).toBeInTheDocument()
  })
})
