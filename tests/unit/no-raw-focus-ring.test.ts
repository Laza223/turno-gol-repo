import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

const FILES = [
  'src/components/ui/button.tsx',
  'src/components/ui/dialog.tsx',
  'src/components/ui/confirm-dialog.tsx',
  'src/app/(admin)/abonados/AbonadosList.tsx',
  'src/app/(admin)/canchas/components/CourtForm.tsx',
  'src/app/(admin)/reservas/[id]/BookingActions.tsx',
  'src/app/(player)/mis-reservas/CancelBookingButton.tsx',
  'src/app/(player)/perfil/ProfileForm.tsx',
  'src/app/(public)/explorar/components/SearchBar.tsx',
  'src/app/(public)/[slug]/reservar/components/LoginGate.tsx',
  'src/app/onboarding/components/StepIdentity.tsx',
]

describe('No raw focus:ring in updated files (regression guard)', () => {
  for (const rel of FILES) {
    it(rel, () => {
      const src = readFileSync(resolve(__dirname, '../..', rel), 'utf8')
      // negative lookbehind: focus:ring- but NOT preceded by visible:
      const match = src.match(/(?<!visible:)focus:ring-/g)
      expect(match).toBeNull()
    })
  }
})
