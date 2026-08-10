// @vitest-environment happy-dom
/**
 * Guard rail del piso de 16px en campos de entrada (MASTER §3.1).
 *
 * Por qué existe: iOS WebKit —el motor de TODOS los navegadores del iPhone,
 * Chrome iOS incluido— hace zoom automático al enfocar cualquier campo con
 * font-size computado < 16px, y ese zoom arrastra scroll horizontal. La app
 * llegó a producción con `text-sm` (14px) en el primitivo `ui/input` y en ~15
 * constantes de campo, y ninguna suite lo detectó: la fase F10 de la auditoría
 * validó mobile emulando Pixel 5 en Chromium, motor que no reproduce el zoom.
 *
 * Este test corre en el job `unit-tests` (cada push, sin browser ni DB), así que
 * protege la regresión más probable —alguien escribe `text-sm` en un campo
 * nuevo— a costo cero. La verificación con el DOM real vive en
 * `tests/e2e/mobile/field-font-size.spec.ts`.
 */
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { Input } from '@/components/ui/input'

const projectRoot = path.resolve(__dirname, '..', '..')
const read = (rel: string) => readFileSync(path.join(projectRoot, rel), 'utf8')

/**
 * Los asserts negativos ("esta clase NO debe aparecer") tienen que mirar código,
 * no prosa: un comentario que documenta por qué se sacó `text-[15px]` no puede
 * hacer fallar el test que verifica que se sacó.
 */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

/** `text-base` (16px) en mobile con cascada `md:` que recupera densidad desktop. */
const MOBILE_FIRST_FIELD = /\btext-base\b[\s\S]{0,40}?\bmd:text-(sm|xs|\[15px\])\b/

describe('Piso de 16px en campos — primitivos', () => {
  it('Input renderiza text-base + md:text-sm', () => {
    const { container } = render(<Input placeholder="x" />)
    const input = container.querySelector('input')!
    expect(input.className).toMatch(/\btext-base\b/)
    expect(input.className).toMatch(/\bmd:text-sm\b/)
    // El 14px plano es exactamente lo que disparaba el zoom.
    expect(input.className).not.toMatch(/(^|\s)text-sm(\s|$)/)
  })

  it('PhoneInput: el input del número y el buscador de país arrancan en 16px', () => {
    const file = read('src/components/ui/phone-input.tsx')
    // Input del número nacional.
    expect(file).toMatch(/rounded-r-lg[\s\S]{0,120}?\btext-base md:text-sm\b/)
    // Buscador de país dentro del popover: estaba en text-xs (12px), el peor caso.
    expect(file).toMatch(/\btext-base md:text-xs\b/)
  })

  it('Combobox aplica una base propia aunque el caller no pase inputClassName', () => {
    const file = read('src/components/ui/combobox.tsx')
    expect(file).toMatch(/COMBOBOX_INPUT_BASE\s*=\s*'text-base md:text-sm'/)
    // El agujero original: `className={inputClassName}` crudo heredaba lo que
    // viniera del caller (o el default del user-agent, ~13px, si no venía nada).
    expect(file).toMatch(/className=\{cn\(COMBOBOX_INPUT_BASE, inputClassName\)\}/)
    expect(file).not.toMatch(/className=\{inputClassName\}/)
  })
})

describe('Piso de 16px en campos — constantes compartidas', () => {
  // Allowlist explícita: cada entrada es una const que alimenta uno o más
  // <input>/<textarea>. Preferimos enumerar a heurísticas sobre todo src/,
  // que darían falsos positivos con className dinámico.
  const SHARED_FIELD_CONSTS: Array<{ file: string; needle: string; what: string }> = [
    {
      file: 'src/app/onboarding/components/wizard-styles.ts',
      needle: 'export const fieldClass',
      what: 'campos de los 4 pasos del wizard',
    },
    {
      file: 'src/app/(public)/[slug]/reservar/components/LoginGate.tsx',
      // Sin `export`: B5 le sacó el export (solo se usa dentro del archivo).
      // Lo que este test cuida es el piso de 16px, no la visibilidad del símbolo.
      needle: 'const inputClass',
      what: 'nombre/apellido/email en el flujo de reserva',
    },
    {
      file: 'src/app/(auth)/ingresar/IngresarForm.tsx',
      // Sin `export`: B5 le sacó el export (solo se usa dentro del archivo).
      // Lo que este test cuida es el piso de 16px, no la visibilidad del símbolo.
      needle: 'const inputClass',
      what: 'email del login de jugador',
    },
    {
      file: 'src/app/(public)/explorar/components/SearchBar.tsx',
      needle: 'const fieldClass',
      what: 'los 4 campos del buscador de /explorar',
    },
  ]

  for (const { file, needle, what } of SHARED_FIELD_CONSTS) {
    it(`${file} — ${what}`, () => {
      const source = read(file)
      const start = source.indexOf(needle)
      expect(start, `no se encontró \`${needle}\` en ${file}`).toBeGreaterThan(-1)
      // La declaración entera (puede ocupar varias líneas).
      const declaration = source.slice(start, source.indexOf('\n\n', start))
      expect(declaration, `\`${needle}\` debe declarar text-base + md:text-*`).toMatch(
        MOBILE_FIRST_FIELD,
      )
    })
  }

  it('HeroSearch: la clase de fecha no baja de 16px ni se deriva por .replace()', () => {
    const file = read('src/components/site/HeroSearch.tsx')
    const code = stripComments(file)
    // Era `text-[15px]`, bajado a propósito para ganar ancho. 15 < 16 → zoom.
    expect(code).not.toMatch(/text-\[15px\]/)
    // Derivarla con .replace() sobre un literal de clases fallaba en silencio
    // si alguien reordenaba `fieldClass`: devolvía el original sin error.
    expect(code).not.toMatch(/fieldClass\.replace\(/)
    expect(code).toMatch(/const dateFieldClass\s*=\s*\n?\s*'[^']*\btext-base\b/)
  })
})

describe('Piso de 16px en campos — red de seguridad CSS', () => {
  const css = read('src/app/globals.css')

  it('globals.css declara el piso de 16px para campos en mobile', () => {
    expect(css).toMatch(/@media \(width < 48rem\)/)
    expect(css).toMatch(/font-size:\s*16px/)
    expect(css).toMatch(/\[contenteditable\]:not\(\[contenteditable='false'\]\)/)
  })

  it('html fija -webkit-text-size-adjust (iOS infla el texto al rotar)', () => {
    expect(css).toMatch(/-webkit-text-size-adjust:\s*100%/)
  })

  it('la regla vive FUERA de todo @layer', () => {
    // El modo de falla silenciosa: dentro de `@layer base`, las utilities de
    // Tailwind v4 (que viven en `@layer utilities`) le ganan por cascada de
    // capas sin importar la especificidad, y el piso deja de aplicar sin que
    // nada falle. CSS sin capa le gana a CSS en capa, siempre.
    const ruleIdx = css.indexOf('@media (width < 48rem)')
    expect(ruleIdx).toBeGreaterThan(-1)

    // Contamos llaves desde el arranque del archivo hasta la regla: si estuviera
    // dentro de un @layer, habría al menos un bloque sin cerrar.
    const before = css.slice(0, ruleIdx)
    const opens = (before.match(/\{/g) ?? []).length
    const closes = (before.match(/\}/g) ?? []).length
    expect(
      opens,
      'la regla del piso de 16px quedó dentro de un bloque (probablemente @layer): ' +
        'ahí las utilities de Tailwind le ganan y el fix no hace nada',
    ).toBe(closes)
  })
})
