import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const projectRoot = path.resolve(__dirname, '..', '..')

describe('inputMode coverage (regression guard)', () => {
  it('PhoneInput component has inputMode="tel"', () => {
    const file = readFileSync(
      path.join(projectRoot, 'src/components/ui/phone-input.tsx'),
      'utf8',
    )
    const phoneTypeIdx = file.indexOf('type="tel"')
    expect(phoneTypeIdx).toBeGreaterThan(-1)
    const windowAround = file.slice(phoneTypeIdx, phoneTypeIdx + 200)
    expect(windowAround).toMatch(/inputMode="tel"/)
  })

  it('StepIdentity uses PhoneInput component', () => {
    const file = readFileSync(
      path.join(projectRoot, 'src/app/onboarding/components/StepIdentity.tsx'),
      'utf8',
    )
    expect(file).toMatch(/<PhoneInput/)
  })

  it('register page uses PhoneInput component', () => {
    const file = readFileSync(
      path.join(projectRoot, 'src/app/(auth)/register/page.tsx'),
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
