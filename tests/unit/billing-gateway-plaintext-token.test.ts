/**
 * ENS-22 (ensayo general 2026-07-14): getBillingGateway construía
 * MercadoPagoGateway con el token PLAINTEXT del env (MP_TURNOGOL_ACCESS_TOKEN),
 * pero el constructor siempre desencripta (mpClient → decrypt) porque está
 * pensado para los tokens de tenant cifrados en DB. Resultado: 500 "Invalid
 * ciphertext format" en TODA operación de billing SaaS contra MP real —
 * invisible para la suite porque los tests usan MockGateway.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MercadoPagoGateway } from '@/modules/payments/mp-gateway.implementation'
import { getBillingGateway, setBillingGateway } from '@/modules/billing/billing.gateway'

const PLAINTEXT_TOKEN = 'APP_USR-1234567890-070618-abcdef-987654321'

describe('billing gateway — token master plaintext (ENS-22)', () => {
  beforeEach(() => {
    setBillingGateway(null)
    process.env.MP_TURNOGOL_ACCESS_TOKEN = PLAINTEXT_TOKEN
    // ENCRYPTION_KEY válida para que un decrypt accidental falle por FORMATO,
    // no por key ausente (reproduce el 500 real del ensayo).
    process.env.ENCRYPTION_KEY = 'a'.repeat(64)
  })

  afterEach(() => {
    setBillingGateway(null)
    delete process.env.MP_TURNOGOL_ACCESS_TOKEN
  })

  it('getBillingGateway no explota con el token plaintext del env', () => {
    expect(() => getBillingGateway()).not.toThrow()
  })

  it('MercadoPagoGateway con plaintextToken:true acepta un token sin cifrar', () => {
    expect(() => new MercadoPagoGateway(PLAINTEXT_TOKEN, { plaintextToken: true })).not.toThrow()
  })

  it('sin el flag, un token plaintext sigue rechazándose (contrato de tenants cifrados intacto)', () => {
    expect(() => new MercadoPagoGateway(PLAINTEXT_TOKEN)).toThrow(/ciphertext/i)
  })
})
