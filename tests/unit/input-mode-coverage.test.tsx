import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const projectRoot = path.resolve(__dirname, '..', '..')

describe('inputMode coverage (regression guard)', () => {
  it('PhoneInput component has inputMode="tel"', () => {
    const file = readFileSync(path.join(projectRoot, 'src/components/ui/phone-input.tsx'), 'utf8')
    const phoneTypeIdx = file.indexOf('type="tel"')
    expect(phoneTypeIdx).toBeGreaterThan(-1)
    const windowAround = file.slice(phoneTypeIdx, phoneTypeIdx + 200)
    expect(windowAround).toMatch(/inputMode="tel"/)
  })

  // Fase 4 del refactor de onboarding: el paso 1 dejó de pedir teléfono (se
  // deriva de la cuenta staff, doc10 §2) — el campo se mudó a
  // TenantContactForm.tsx (/settings/perfil, B15), no desapareció.
  it('TenantContactForm uses PhoneInput component', () => {
    const file = readFileSync(
      path.join(projectRoot, 'src/app/(admin)/settings/perfil/TenantContactForm.tsx'),
      'utf8',
    )
    expect(file).toMatch(/<PhoneInput/)
  })

  // El form de registro se extrajo de page.tsx a RegisterCard.tsx (la page quedó
  // como shell que le inyecta la Server Action). El markup del teléfono vive ahí.
  it('register form uses PhoneInput component', () => {
    const file = readFileSync(
      path.join(projectRoot, 'src/app/(auth)/register/RegisterCard.tsx'),
      'utf8',
    )
    expect(file).toMatch(/<PhoneInput/)
  })

  it('ProfileForm uses PhoneInput component', () => {
    const file = readFileSync(
      path.join(projectRoot, 'src/app/(player)/perfil/ProfileForm.tsx'),
      'utf8',
    )
    expect(file).toMatch(/<PhoneInput/)
  })

  it('settings/reservas form: all type="number" inputs have inputMode', () => {
    // Los inputs numéricos viven en ReservasPolicyForm.tsx (la page los delega al form).
    const file = readFileSync(
      path.join(projectRoot, 'src/app/(admin)/settings/reservas/ReservasPolicyForm.tsx'),
      'utf8',
    )
    const typeNumberMatches = Array.from(file.matchAll(/type="number"/g))
    expect(typeNumberMatches.length).toBeGreaterThanOrEqual(2)

    for (const match of typeNumberMatches) {
      const start = match.index ?? 0
      const block = file.slice(start, start + 250)
      expect(block, `block starting at index ${start} must have inputMode`).toMatch(
        /inputMode="numeric"/,
      )
    }
  })
})
