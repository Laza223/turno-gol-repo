// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import {
  clearSignupDraft,
  firstIncompleteScreen,
  patchSignupDraft,
  useSignupDraft,
  type SignupDraftData,
} from '@/app/(auth)/register/signup-draft'
import { COMPLEX_ANSWERS } from '@/app/(auth)/register/signup-draft.fixture'

const KEY = 'tg_signup_draft'

beforeEach(() => clearSignupDraft())
afterEach(() => localStorage.clear())

describe('useSignupDraft', () => {
  it('arranca vacío y listo en el cliente', () => {
    const { result } = renderHook(() => useSignupDraft())
    expect(result.current.ready).toBe(true)
    expect(result.current.draft).toEqual({})
  })

  it('un patch se guarda en localStorage y re-renderiza', () => {
    const { result } = renderHook(() => useSignupDraft())
    act(() => patchSignupDraft({ courts: { '5': 2 } }))
    expect(result.current.draft.courts).toEqual({ '5': 2 })
    act(() => patchSignupDraft({ schedule: { openHour: 9, closeHour: 1 } }))
    expect(result.current.draft).toMatchObject({
      courts: { '5': 2 },
      schedule: { openHour: 9, closeHour: 1 },
    })
    expect(JSON.parse(localStorage.getItem(KEY) ?? '{}')).toMatchObject({ courts: { '5': 2 } })
  })

  it('clear borra el borrador', () => {
    const { result } = renderHook(() => useSignupDraft())
    act(() => patchSignupDraft({ courts: { '5': 1 } }))
    act(() => clearSignupDraft())
    expect(result.current.draft).toEqual({})
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('descarta JSON roto y los bloques inválidos sin tirar los válidos', () => {
    localStorage.setItem(KEY, '{no es json')
    expect(renderHook(() => useSignupDraft()).result.current.draft).toEqual({})

    localStorage.setItem(
      KEY,
      JSON.stringify({ courts: { '5': 2 }, schedule: { openHour: 'x' }, prices: 7 }),
    )
    const { result } = renderHook(() => useSignupDraft())
    expect(result.current.draft).toEqual({ courts: { '5': 2 } })
  })

  it('no guarda lo que no es parte del borrador (contraseña, mail)', () => {
    localStorage.setItem(KEY, JSON.stringify({ password: 'secreta', email: 'a@b.com' }))
    const { result } = renderHook(() => useSignupDraft())
    expect(result.current.draft).toEqual({})
    act(() => patchSignupDraft({ courts: { '5': 1 } }))
    expect(localStorage.getItem(KEY)).not.toContain('secreta')
  })
})

describe('firstIncompleteScreen', () => {
  const full: SignupDraftData = COMPLEX_ANSWERS

  it('retoma en la primera pantalla sin respuestas', () => {
    expect(firstIncompleteScreen({})).toBe('complejo')
    expect(firstIncompleteScreen({ complex: full.complex })).toBe('canchas')
    expect(firstIncompleteScreen({ complex: full.complex, courts: full.courts })).toBe('horarios')
    expect(
      firstIncompleteScreen({
        complex: full.complex,
        courts: full.courts,
        schedule: full.schedule,
      }),
    ).toBe('precios')
    expect(firstIncompleteScreen({ ...full, profile: undefined })).toBe('tu-complejo')
    expect(firstIncompleteScreen(full)).toBe('cuenta')
  })

  it('si cambiaron las canchas, los precios viejos no alcanzan', () => {
    expect(firstIncompleteScreen({ ...full, courts: { '5': 3 } })).toBe('precios')
    expect(firstIncompleteScreen({ ...full, courts: { '5': 2, '7': 1 } })).toBe('precios')
  })
})
