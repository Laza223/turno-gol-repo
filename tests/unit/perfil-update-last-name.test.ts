import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/sentry', () => ({ captureException: vi.fn() }))
vi.mock('@/modules/auth/auth.middleware', () => ({
  extractAuthUser: vi.fn(async () => ({ type: 'player', playerId: 'player-1' })),
}))
vi.mock('@/shared/db/client', () => ({ withPlayerContext: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirect llamado')
  }),
}))

import { withPlayerContext } from '@/shared/db/client'
import { updateProfileAction } from '@/app/(player)/configuracion/actions'

/** Un `tx` que se acuerda de lo que se le pasó a `.set()`. */
function captureSet() {
  const set = vi.fn()
  const tx = {
    update: () => ({
      set: (values: unknown) => {
        set(values)
        return { where: () => ({ returning: async () => [{ id: 'player-1' }] }) }
      },
    }),
  }
  vi.mocked(withPlayerContext).mockImplementationOnce((async (
    _playerId: string,
    fn: (t: typeof tx) => unknown,
  ) => fn(tx)) as never)
  return set
}

function form(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('updateProfileAction — apellido opcional', () => {
  it('guarda sin apellido: el campo vacío se guarda como "" (last_name es NOT NULL, igual que el checkout)', async () => {
    const set = captureSet()
    const res = await updateProfileAction(
      { success: true },
      form({ first_name: 'Lucía', last_name: '' }),
    )
    expect(res).toEqual({ success: true })
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ firstName: 'Lucía', lastName: '' }))
  })

  it('un apellido de solo espacios no se guarda como basura', async () => {
    const set = captureSet()
    await updateProfileAction({ success: true }, form({ first_name: 'Lucía', last_name: '     ' }))
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ lastName: '' }))
  })

  it('un formulario sin el campo apellido tampoco falla', async () => {
    const set = captureSet()
    const res = await updateProfileAction({ success: true }, form({ first_name: 'Lucía' }))
    expect(res).toEqual({ success: true })
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ lastName: '' }))
  })

  it('el nombre vacío sigue fallando, y el error dice de qué campo es', async () => {
    const res = await updateProfileAction(
      { success: true },
      form({ first_name: '   ', last_name: 'Pérez' }),
    )
    expect(res).toEqual({ success: false, error: 'Nombre requerido', field: 'first_name' })
    expect(withPlayerContext).not.toHaveBeenCalled()
  })

  it('el teléfono corto falla junto al campo del teléfono', async () => {
    const res = await updateProfileAction(
      { success: true },
      form({ first_name: 'Lucía', phone: '123' }),
    )
    expect(res).toEqual({ success: false, error: 'Teléfono muy corto', field: 'phone' })
  })

  it('un apellido de más de 100 caracteres sigue siendo error', async () => {
    const res = await updateProfileAction(
      { success: true },
      form({ first_name: 'Lucía', last_name: 'x'.repeat(101) }),
    )
    expect(res).toMatchObject({ success: false, field: 'last_name' })
  })
})
