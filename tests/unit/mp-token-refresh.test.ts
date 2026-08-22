import { describe, expect, it, vi } from 'vitest'
import {
  isMpUnauthorized,
  isMpInvalidPayerError,
  isMpAlreadyCancelledPreapprovalError,
  withTokenRefresh,
  describeMpError,
} from '@/modules/payments/mp-token-refresh'

describe('isMpUnauthorized', () => {
  it('detects 401 across shapes', () => {
    expect(isMpUnauthorized({ status: 401 })).toBe(true)
    expect(isMpUnauthorized({ statusCode: 401 })).toBe(true)
    expect(isMpUnauthorized({ cause: { status: 401 } })).toBe(true)
    expect(isMpUnauthorized(new Error('Request failed with status 401'))).toBe(true)
    expect(isMpUnauthorized(new Error('unauthorized'))).toBe(true)
  })

  it('is false for non-401 / non-error inputs', () => {
    expect(isMpUnauthorized({ status: 500 })).toBe(false)
    expect(isMpUnauthorized(new Error('boom'))).toBe(false)
    expect(isMpUnauthorized(null)).toBe(false)
    expect(isMpUnauthorized('401')).toBe(false)
    expect(isMpUnauthorized({ status: 4010 })).toBe(false)
  })
})

// ENS-23: MP rechaza un preapproval cuando payer_email no tiene cuenta de MP
// ("Both payer and collector must be real or test users"). El SDK lanza el
// body crudo de la respuesta (objeto plano con `.message`, ver
// RestClient.fetch); `MercadoPagoGateway.createPreapproval` lo envuelve en
// `MpGatewayError(msg, cause=err original)` — así es como llega a
// billing.service.ts en la práctica.
describe('isMpInvalidPayerError', () => {
  it('detecta el mensaje exacto de MP anidado en .cause.message (forma real via MpGatewayError)', () => {
    const mpRawError = {
      message: 'Both payer and collector must be real or test users',
      status: 400,
    }
    const wrapped = {
      name: 'MpGatewayError',
      message: 'Failed to create MP preapproval',
      cause: mpRawError,
    }
    expect(isMpInvalidPayerError(wrapped)).toBe(true)
  })

  it('detecta el mensaje cuando viene directo en .message (sin wrapper)', () => {
    expect(
      isMpInvalidPayerError({ message: 'Both payer and collector must be real or test users' }),
    ).toBe(true)
  })

  it('es case-insensitive', () => {
    expect(
      isMpInvalidPayerError({ message: 'BOTH PAYER AND COLLECTOR MUST BE REAL OR TEST USERS' }),
    ).toBe(true)
  })

  it('es false para otros errores de MP (no enmascara errores no relacionados)', () => {
    expect(isMpInvalidPayerError({ message: '500 server error' })).toBe(false)
    expect(
      isMpInvalidPayerError({
        name: 'MpGatewayError',
        message: 'boom',
        cause: { message: 'timeout' },
      }),
    ).toBe(false)
    expect(isMpInvalidPayerError(new Error('unrelated'))).toBe(false)
    expect(isMpInvalidPayerError(null)).toBe(false)
    expect(isMpInvalidPayerError('Both payer and collector must be real or test users')).toBe(false)
  })
})

// Fix 1 (R2-2 residual — reactivate() sigue trabado si el reintento cancela
// un preapproval que MP YA marcó cancelled). MP responde HTTP 400 "You can
// not modify a cancelled preapproval." — verificado contra MP real
// (ENSAYO_GENERAL.md, preapproval e00ea2c8… cancelado por K5). Mismo shape
// que ENS-23: `MercadoPagoGateway.cancelPreapproval` envuelve el body crudo
// de MP en `MpGatewayError(msg, cause=rawErr)`.
describe('isMpAlreadyCancelledPreapprovalError', () => {
  it('detecta el mensaje exacto de MP anidado en .cause.message (forma real via MpGatewayError)', () => {
    const mpRawError = { message: 'You can not modify a cancelled preapproval.', status: 400 }
    const wrapped = {
      name: 'MpGatewayError',
      message: 'Failed to cancel MP preapproval x',
      cause: mpRawError,
    }
    expect(isMpAlreadyCancelledPreapprovalError(wrapped)).toBe(true)
  })

  it('detecta el mensaje cuando viene directo en .message (sin wrapper)', () => {
    expect(
      isMpAlreadyCancelledPreapprovalError({
        message: 'You can not modify a cancelled preapproval.',
      }),
    ).toBe(true)
  })

  it('es case-insensitive', () => {
    expect(
      isMpAlreadyCancelledPreapprovalError({
        message: 'YOU CAN NOT MODIFY A CANCELLED PREAPPROVAL.',
      }),
    ).toBe(true)
  })

  it('es false para otros errores de MP (no enmascara errores no relacionados, ej. un 500 real)', () => {
    expect(isMpAlreadyCancelledPreapprovalError({ message: '500 server error' })).toBe(false)
    expect(
      isMpAlreadyCancelledPreapprovalError({
        name: 'MpGatewayError',
        message: 'boom',
        cause: { message: 'timeout' },
      }),
    ).toBe(false)
    expect(isMpAlreadyCancelledPreapprovalError(new Error('unrelated'))).toBe(false)
    expect(isMpAlreadyCancelledPreapprovalError(null)).toBe(false)
    expect(
      isMpAlreadyCancelledPreapprovalError('You can not modify a cancelled preapproval.'),
    ).toBe(false)
  })
})

describe('withTokenRefresh', () => {
  it('returns the result without refreshing when op succeeds', async () => {
    const refresh = vi.fn(async () => {})
    const op = vi.fn(async () => 'ok')

    await expect(withTokenRefresh(op, refresh)).resolves.toBe('ok')
    expect(refresh).not.toHaveBeenCalled()
    expect(op).toHaveBeenCalledTimes(1)
  })

  it('refreshes and retries once on a 401, then succeeds', async () => {
    const refresh = vi.fn(async () => {})
    const op = vi
      // Vitest 3: vi.fn toma UN genérico con la firma entera, no <TArgs, TReturn>.
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce({ status: 401 })
      .mockResolvedValueOnce('recovered')

    await expect(withTokenRefresh(op, refresh)).resolves.toBe('recovered')
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(op).toHaveBeenCalledTimes(2)
  })

  it('does not retry on a non-401 error', async () => {
    const refresh = vi.fn(async () => {})
    const op = vi.fn(async () => {
      throw new Error('500 server error')
    })

    await expect(withTokenRefresh(op, refresh)).rejects.toThrow('500 server error')
    expect(refresh).not.toHaveBeenCalled()
    expect(op).toHaveBeenCalledTimes(1)
  })

  it('propagates a second 401 after refreshing', async () => {
    const refresh = vi.fn(async () => {})
    const op = vi.fn(async () => {
      throw { status: 401 }
    })

    await expect(withTokenRefresh(op, refresh)).rejects.toEqual({ status: 401 })
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(op).toHaveBeenCalledTimes(2)
  })
})

/**
 * 2026-08-21, producción: un reembolso de $100 falló y los tres catches del
 * camino loguearon `err.message`, que es la frase que escribimos nosotros
 * ("Failed to refund MP payment 175029618908"). El motivo real de MercadoPago
 * se descartaba entero, así que no había forma de distinguir una cuenta sin
 * saldo de un token vencido de un pago no reembolsable.
 */
describe('describeMpError', () => {
  it('rescata el motivo real del cause anidado que arma el gateway', () => {
    // Forma exacta: MpGatewayError(msg, cause = error crudo del SDK de MP).
    const err = Object.assign(new Error('Failed to refund MP payment 175029618908'), {
      cause: {
        message: 'Bad Request',
        status: 400,
        cause: [{ code: 2062, description: 'Refund is not available for this payment' }],
      },
    })

    const out = describeMpError(err)
    expect(out).toContain('mp_status=400')
    expect(out).toContain('mp_code=2062')
    expect(out).toContain('Refund is not available for this payment')
  })

  it('no se queda mudo cuando el error no tiene la forma esperada', () => {
    expect(describeMpError(new Error('boom'))).toContain('boom')
    expect(describeMpError('texto pelado')).toBe('texto pelado')
    expect(describeMpError(null)).toBe('null')
  })

  it('recorta un cause gigante en vez de volcarlo entero al log', () => {
    const err = Object.assign(new Error('x'), {
      cause: { message: 'y'.repeat(5_000) },
    })
    expect(describeMpError(err).length).toBeLessThanOrEqual(401)
  })

  it('toma varios detalles pero no más de tres', () => {
    const err = Object.assign(new Error('x'), {
      cause: {
        cause: [
          { code: 1, description: 'uno' },
          { code: 2, description: 'dos' },
          { code: 3, description: 'tres' },
          { code: 4, description: 'cuatro' },
        ],
      },
    })
    const out = describeMpError(err)
    expect(out).toContain('tres')
    expect(out).not.toContain('cuatro')
  })
})
