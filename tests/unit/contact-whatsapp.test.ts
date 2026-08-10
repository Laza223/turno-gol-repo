import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  CONTACT_WHATSAPP_DIGITS,
  CONTACT_WHATSAPP_DISPLAY,
  contactWhatsappUrl,
} from '@/lib/contact'

/**
 * Candado de B1 — regresión "el CTA lleva a un número que no existe".
 *
 * El único CTA de contacto del sitio (`ArticleShell`, al pie de todas las
 * páginas editoriales) apuntó a `https://wa.me/5491100000000` desde que se
 * escribió. Un placeholder, publicado, en producción: el visitante que hacía
 * clic en "Contactanos por WhatsApp" — el único camino de conversión de esas
 * páginas — caía en un número inexistente.
 *
 * No alcanza con arreglar el número: lo que falló fue que nada lo miraba. Estos
 * dos candados cubren las dos formas de que vuelva a pasar.
 */

describe('el número de contacto no tiene pinta de placeholder', () => {
  it('son solo dígitos, con largo de número argentino con código de país', () => {
    expect(CONTACT_WHATSAPP_DIGITS).toMatch(/^\d+$/)
    // 54 + 9 + área + abonado. 12-13 dígitos cubre todas las áreas del país.
    expect(CONTACT_WHATSAPP_DIGITS.length).toBeGreaterThanOrEqual(12)
    expect(CONTACT_WHATSAPP_DIGITS.length).toBeLessThanOrEqual(13)
    expect(CONTACT_WHATSAPP_DIGITS.startsWith('54')).toBe(true)
  })

  it('no es una corrida de ceros ni de un dígito repetido', () => {
    // `5491100000000` (el placeholder real que estuvo publicado) muere acá:
    // termina en 8 ceros seguidos.
    expect(CONTACT_WHATSAPP_DIGITS).not.toMatch(/(\d)\1{5,}/)
  })

  it('el display y los dígitos son el mismo número', () => {
    expect(CONTACT_WHATSAPP_DISPLAY.replace(/\D/g, '')).toBe(CONTACT_WHATSAPP_DIGITS)
  })

  it('contactWhatsappUrl arma el link, con y sin mensaje', () => {
    expect(contactWhatsappUrl()).toBe(`https://wa.me/${CONTACT_WHATSAPP_DIGITS}`)
    expect(contactWhatsappUrl('hola, ¿cómo va?')).toBe(
      `https://wa.me/${CONTACT_WHATSAPP_DIGITS}?text=hola%2C%20%C2%BFc%C3%B3mo%20va%3F`,
    )
  })
})

/**
 * El segundo candado, que es el que importa: aunque el número de arriba esté
 * bien, un CTA nuevo con el número hardcodeado se desincroniza el día que
 * cambie. Solo `src/lib/contact.ts` puede escribir `wa.me/<dígitos>`.
 *
 * NO se prohíbe `wa.me/` a secas: `wa.me/?text=` (compartir, sin destinatario)
 * y `wa.me/${telefonoDelCliente}` (cobranza en Caja, CompleteBookingDialog) son
 * usos legítimos y dinámicos.
 */
describe('ningún archivo hardcodea un número de WhatsApp', () => {
  const ALLOWED = ['src/lib/contact.ts']
  const HARDCODED_WA = /wa\.me\/\d/

  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) return walk(full)
      return /\.(ts|tsx)$/.test(name) ? [full] : []
    })
  }

  it('src/ solo tiene el link literal en src/lib/contact.ts', () => {
    const root = process.cwd()
    const offenders = walk(join(root, 'src'))
      .map((full) => full.slice(root.length + 1).replace(/\\/g, '/'))
      .filter((rel) => !ALLOWED.includes(rel))
      .filter((rel) => HARDCODED_WA.test(readFileSync(join(root, rel), 'utf-8')))

    expect(
      offenders,
      `hardcodean un wa.me con número: usá contactWhatsappUrl() de @/lib/contact`,
    ).toEqual([])
  })
})
