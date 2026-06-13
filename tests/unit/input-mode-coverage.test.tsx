import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const projectRoot = path.resolve(__dirname, '..', '..')

describe('inputMode coverage (regression guard)', () => {
  it('StepIdentity phone input has inputMode="tel"', () => {
    const file = readFileSync(
      path.join(projectRoot, 'src/app/onboarding/components/StepIdentity.tsx'),
      'utf8',
    )
    // Look for the phone input block (type="tel" + inputMode="tel" within ~5 lines)
    const phoneTypeIdx = file.indexOf('type="tel"')
    expect(phoneTypeIdx).toBeGreaterThan(-1)
    const windowAround = file.slice(phoneTypeIdx, phoneTypeIdx + 200)
    expect(windowAround).toMatch(/inputMode="tel"/)
  })

  it('register page Field phone has inputMode="tel"', () => {
    const file = readFileSync(
      path.join(projectRoot, 'src/app/(auth)/register/page.tsx'),
      'utf8',
    )
    // The Field call site: type="tel" + inputMode="tel"
    expect(file).toMatch(/type="tel"\s*\n\s*inputMode="tel"/)
    // The Field component itself: forwards inputMode prop
    expect(file).toMatch(/inputMode\?:/)
    expect(file).toMatch(/inputMode=\{props\.inputMode\}/)
  })

  it('ProfileForm phone input has inputMode="tel"', () => {
    const file = readFileSync(
      path.join(projectRoot, 'src/app/(player)/perfil/ProfileForm.tsx'),
      'utf8',
    )
    const phoneTypeIdx = file.indexOf('type="tel"')
    expect(phoneTypeIdx).toBeGreaterThan(-1)
    const windowAround = file.slice(phoneTypeIdx, phoneTypeIdx + 200)
    expect(windowAround).toMatch(/inputMode="tel"/)
  })

  it('settings/reservas form: all type="number" inputs have inputMode', () => {
    // Los inputs numéricos viven en ReservasPolicyForm.tsx (la page los delega al form).
    const file = readFileSync(
      path.join(projectRoot, 'src/app/(admin)/settings/reservas/ReservasPolicyForm.tsx'),
      'utf8',
    )
    // Capture each block starting at type="number"
    const typeNumberMatches = Array.from(file.matchAll(/type="number"/g))
    expect(typeNumberMatches.length).toBeGreaterThanOrEqual(4)

    for (const match of typeNumberMatches) {
      const start = match.index ?? 0
      const block = file.slice(start, start + 250)
      expect(block, `block starting at index ${start} must have inputMode`).toMatch(
        /inputMode="numeric"/,
      )
    }
  })
})
