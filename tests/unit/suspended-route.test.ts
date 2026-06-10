import { describe, expect, it } from 'vitest'
import { isValidElement } from 'react'
import SuspendedPage, { metadata } from '@/app/(public)/suspended/page'

/**
 * BLOCKER (triage_fixes #3/#6): el kill-switch (redirectIfTenantSuspended) y los
 * settings redirigen a /suspended. El triage afirmaba que la ruta no existía
 * (404), pero sí existe en src/app/(public)/suspended/page.tsx — los hallazgos no
 * eran vigentes (ver docs/qa/decisiones_pendientes.md). Este test es la guarda de
 * regresión que evita que la ruta vuelva a desaparecer silenciosamente.
 */
describe('/suspended (destino del kill-switch)', () => {
  it('existe y renderiza un árbol de React válido', () => {
    expect(typeof SuspendedPage).toBe('function')
    expect(isValidElement(SuspendedPage())).toBe(true)
  })

  it('está excluida de la indexación de buscadores', () => {
    const robots = metadata.robots as { index?: boolean; follow?: boolean } | null
    expect(robots?.index).toBe(false)
    expect(robots?.follow).toBe(false)
  })
})
