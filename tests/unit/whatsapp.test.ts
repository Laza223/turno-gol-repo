import { describe, expect, it } from 'vitest'
import { buildWhatsappUrl, toWhatsappDigits } from '@/lib/whatsapp'

/**
 * La invariante: nunca se emite un `wa.me` que no sea marcable.
 *
 * Un link roto abre WhatsApp y muestra "el número no está en WhatsApp". El
 * jugador cree que escribió, el complejo nunca recibe nada, y la devolución de
 * la seña queda esperando a alguien que ya piensa que hizo su parte.
 */
describe('toWhatsappDigits — móviles argentinos', () => {
  it('nacional pelado de 10 dígitos → 549 + área + abonado', () => {
    expect(toWhatsappDigits('2323346976')).toBe('5492323346976')
  })

  /**
   * El caso que más importa: es EXACTAMENTE lo que deja guardado el formulario
   * de /settings/perfil. `parsePhoneNumber` borra el 9 al parsear y
   * `formatFullPhone` recompone "+54 <nacional>", así que un móvil guardado por
   * la propia app llega acá sin su marcador de móvil.
   */
  it('lo que guarda el propio formulario (+54 sin el 9) recupera el 9', () => {
    expect(toWhatsappDigits('+54 2323 346976')).toBe('5492323346976')
  })

  it('con el 9 ya puesto no lo duplica', () => {
    expect(toWhatsappDigits('+54 9 11 1234-5678')).toBe('5491112345678')
    expect(toWhatsappDigits('5491112345678')).toBe('5491112345678')
  })

  it('formato de marcación nacional: saca el 0 de área y el 15 de móvil', () => {
    expect(toWhatsappDigits('02323 15 346976')).toBe('5492323346976')
    expect(toWhatsappDigits('011 15 1234-5678')).toBe('5491112345678')
  })
})

describe('toWhatsappDigits — lo que NO tiene que tocar', () => {
  it('otro país declarado con + queda intacto: estas reglas son argentinas', () => {
    expect(toWhatsappDigits('+598 99 123456')).toBe('59899123456')
    expect(toWhatsappDigits('+55 11 91234-5678')).toBe('5511912345678')
  })

  /**
   * El país se decide por el + explícito, nunca por los dígitos: un teléfono
   * porteño escrito "11 1234-5678" empieza igual que uno de Estados Unidos.
   * Sin +, se asume Argentina — el mismo default que toma el selector de país
   * del formulario.
   */
  it('sin + asume Argentina aunque los dígitos parezcan de otro lado', () => {
    expect(toWhatsappDigits('11 1234-5678')).toBe('5491112345678')
  })

  it('sin nada marcable devuelve null, para que el botón se esconda', () => {
    expect(toWhatsappDigits('')).toBeNull()
    expect(toWhatsappDigits(null)).toBeNull()
    expect(toWhatsappDigits(undefined)).toBeNull()
    expect(toWhatsappDigits('sin número')).toBeNull()
    // Demasiado corto para ser un teléfono: preferimos no ofrecer WhatsApp
    // antes que mandar al jugador a un chat que no existe.
    expect(toWhatsappDigits('12')).toBeNull()
    expect(toWhatsappDigits('4455-6677')).toBeNull()
  })
})

describe('buildWhatsappUrl', () => {
  it('sin número devuelve null', () => {
    expect(buildWhatsappUrl(null)).toBeNull()
    expect(buildWhatsappUrl(undefined)).toBeNull()
    expect(buildWhatsappUrl('')).toBeNull()
    expect(buildWhatsappUrl('   ')).toBeNull()
    expect(buildWhatsappUrl('no-number')).toBeNull()
  })

  it('omite el parámetro text cuando el mensaje viene vacío', () => {
    expect(buildWhatsappUrl('5491112345678', '')).toBe('https://wa.me/5491112345678')
  })

  it('normaliza el número y adjunta el mensaje', () => {
    const url = buildWhatsappUrl('2323346976', 'Hola, cancelé la reserva A1B2C3D4')
    expect(url).toBe(
      'https://wa.me/5492323346976?text=Hola%2C%20cancel%C3%A9%20la%20reserva%20A1B2C3D4',
    )
  })

  it('sin mensaje abre la conversación vacía', () => {
    expect(buildWhatsappUrl('+54 9 2323 346976')).toBe('https://wa.me/5492323346976')
  })

  it('propaga el null en vez de devolver un link a la nada', () => {
    expect(buildWhatsappUrl('12', 'hola')).toBeNull()
  })
})
