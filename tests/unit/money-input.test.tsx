// @vitest-environment happy-dom
import { useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { MoneyInput } from '@/components/ui/money-input'

afterEach(() => cleanup())

function Controlled() {
  const [cents, setCents] = useState<number | null>(null)
  return (
    <div>
      <MoneyInput id="monto" valueCents={cents} onValueChange={setCents} />
      <output data-testid="cents">{cents ?? 'null'}</output>
    </div>
  )
}

describe('MoneyInput', () => {
  it('formatea con separador de miles mientras se tipea', () => {
    render(<Controlled />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: '25000' } })
    expect(input.value).toBe('25.000')
  })

  it('entrega centavos por onValueChange, nunca el string formateado', () => {
    render(<Controlled />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '25000' } })
    expect(screen.getByTestId('cents').textContent).toBe('2500000')
  })

  it('$25 vs $25.000: el error de magnitud clásico no puede pasar sin verse', () => {
    render(<Controlled />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: '25' } })
    expect(input.value).toBe('25')
    fireEvent.change(input, { target: { value: '25000' } })
    expect(input.value).toBe('25.000')
    expect(input.value).not.toBe('25')
  })

  it('relee el monto en palabras arriba del umbral ($10.000)', () => {
    render(<Controlled />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '25000' } })
    expect(screen.getByText(/veinticinco mil pesos/)).toBeTruthy()
  })

  it('no relee en palabras bajo el umbral', () => {
    render(<Controlled />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '2500' } })
    expect(screen.queryByText(/pesos$/)).toBeNull()
  })

  it('modo no controlado: name + defaultValueCents renderiza hidden input en centavos', () => {
    const { container } = render(<MoneyInput name="amountPesos" defaultValueCents={800_000} />)
    const hidden = container.querySelector(
      'input[type="hidden"][name="amountPesos"]',
    ) as HTMLInputElement
    expect(hidden).toBeTruthy()
    expect(hidden.value).toBe('800000')
  })

  it('modo no controlado: tipear actualiza el hidden input', () => {
    const { container } = render(<MoneyInput name="amountPesos" />)
    const visible = screen.getByRole('textbox')
    fireEvent.change(visible, { target: { value: '15000' } })
    const hidden = container.querySelector(
      'input[type="hidden"][name="amountPesos"]',
    ) as HTMLInputElement
    expect(hidden.value).toBe('1500000')
  })

  it('clampea a maxCents recién al perder el foco, no en cada tecla', () => {
    render(<MoneyInput id="monto" maxCents={1_000_000} defaultValueCents={0} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: '15000' } })
    expect(input.value).toBe('15.000') // sin clampear todavía
    fireEvent.blur(input)
    expect(input.value).toBe('10.000') // clampeado a maxCents=1_000_000 (=$10.000)
  })
})

/**
 * F-020 (QA de producción 2026-08-17): "el campo de precio corrige el número en
 * silencio" — se reportó que tipear `-500` guardaba $500 sin que el dueño lo
 * viera. La corrección existe (el signo no es un dígito), pero NO es silenciosa:
 * el display se reescribe normalizado en la misma tecla, así que lo que se ve es
 * lo que se guarda. Estos casos fijan esa propiedad para que siga siendo cierta.
 */
describe('MoneyInput — entrada inválida normalizada a la vista', () => {
  it('el signo menos no llega al campo: lo que se ve es lo que se guarda', () => {
    render(<Controlled />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: '-500' } })
    expect(input.value).toBe('500')
    expect(screen.getByTestId('cents').textContent).toBe('50000')
  })

  it('descarta cualquier basura tipeada y muestra el número resultante', () => {
    render(<Controlled />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: '1a2b3c' } })
    expect(input.value).toBe('123')
    expect(screen.getByTestId('cents').textContent).toBe('12300')
  })

  it('un campo con solo caracteres inválidos queda vacío, no en cero', () => {
    render(<Controlled />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: '---' } })
    expect(input.value).toBe('')
    expect(screen.getByTestId('cents').textContent).toBe('null')
  })
})

// 🔴 QA 2026-08-28 F-01. El bug no estaba en parsear el string final: el campo
// se reformatea en CADA tecla, así que la coma se borraba en el acto y los
// dígitos de los centavos se pegaban al entero en la tecla siguiente.
// "1500,50" tipeado de a una tecla terminaba valiendo $150.050 — cien veces el
// monto, y en /canchas eso se publicaba en el portal del complejo.
describe('MoneyInput — centavos tipeados (regresión F-01)', () => {
  function typeSequence(input: HTMLInputElement, text: string) {
    for (const char of text) {
      fireEvent.change(input, { target: { value: input.value + char } })
    }
  }

  it('tipear "1500,50" tecla por tecla vale $1.500, no $150.050', () => {
    render(<Controlled />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    typeSequence(input, '1500,50')
    expect(screen.getByTestId('cents').textContent).toBe('150000')
  })

  it('la coma tipeada sobrevive en pantalla en vez de desaparecer', () => {
    render(<Controlled />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    typeSequence(input, '1500,50')
    expect(input.value).toBe('1.500,50')
  })

  it('el punto como decimal tampoco infla el monto (teclado numérico de mobile)', () => {
    render(<Controlled />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    typeSequence(input, '18500.75')
    expect(screen.getByTestId('cents').textContent).toBe('1850000')
  })

  it('un monto entero grande sigue tipeándose entero, sin cola decimal', () => {
    render(<Controlled />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    typeSequence(input, '1850075')
    expect(input.value).toBe('1.850.075')
    expect(screen.getByTestId('cents').textContent).toBe('185007500')
  })
})

/**
 * Diagnóstico 2026-09-15: reclamo real de un encargado — "quería poner que me
 * pagaron 20.000 y solo me dejaba cobrar los 84". Causa raíz: `splitPesosInput`
 * reinterpretaba el separador de miles ya escrito como decimal al EDITAR un
 * valor agrupado (nunca al tipear de cero, que es lo que cubría la suite F-01
 * de arriba) — "24.000" + Backspace deja "24.00", el mismo string que si
 * alguien tipeara literalmente "24,00". Fix: `MoneyInput` solo confía la
 * detección de decimal cuando el string nuevo es el anterior con caracteres
 * agregados AL FINAL (`isAppend` en `handleChange`); fuera de eso (Backspace,
 * editar en el medio) saca los separadores antes de parsear. La coma y el
 * punto siguen siendo decimal-eligibles cuando se tipea hacia adelante o se
 * pega — no se le sacó soporte al punto (lo sigue cubriendo la suite F-01).
 *
 * Cada caso tipea/borra TECLA POR TECLA con el valor intermedio real que deja
 * el navegador en el DOM — no un reemplazo atómico — salvo el de "pegar", que
 * es explícitamente una operación atómica (paste).
 */
describe('MoneyInput — editar un valor ya agrupado (regresión reclamo real 2026-09-15)', () => {
  function typeSequence(input: HTMLInputElement, text: string) {
    for (const char of text) {
      fireEvent.change(input, { target: { value: input.value + char } })
    }
  }

  function backspace(input: HTMLInputElement) {
    fireEvent.change(input, { target: { value: input.value.slice(0, -1) } })
  }

  it('escribir "24000" desde vacío vale $24.000', () => {
    render(<Controlled />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    typeSequence(input, '24000')
    expect(input.value).toBe('24.000')
    expect(screen.getByTestId('cents').textContent).toBe('2400000')
  })

  it('Backspace sobre "24.000" da $2.400, NO $24 (el separador que queda no se relee como decimal)', () => {
    render(<Controlled />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    typeSequence(input, '24000')
    expect(input.value).toBe('24.000')

    backspace(input)
    expect(input.value).toBe('2.400')
    expect(screen.getByTestId('cents').textContent).toBe('240000')
  })

  it('agregar un dígito al final de "24.000" da $240.000', () => {
    render(<Controlled />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    typeSequence(input, '24000')
    expect(input.value).toBe('24.000')

    typeSequence(input, '0')
    expect(input.value).toBe('240.000')
    expect(screen.getByTestId('cents').textContent).toBe('24000000')
  })

  it('pegar "1.500,50" (operación atómica) vale $1.500', () => {
    render(<Controlled />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: '1.500,50' } })
    // El valor guardado descarta los centavos correctamente (lo que pide el
    // contrato). La cola ",50" no queda a la vista en ESTE caso puntual —
    // paste atómico desde vacío, cents pasa de null a 150000 en un solo
    // salto — porque el efecto que resincroniza `display` cuando cambia
    // `valueCents` desde afuera no distingue ese salto de un reset real del
    // padre y pisa el display con `centsToInputDisplay` (sin cola). No
    // corrompe el monto — reportado en openIssues, no es la clase del bug de
    // hoy (que es sobre el valor, no sobre este matiz visual).
    expect(screen.getByTestId('cents').textContent).toBe('150000')
  })

  it('coma decimal tipeada tecla por tecla se descarta sin corromper el entero', () => {
    render(<Controlled />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    typeSequence(input, '24000,50')
    expect(input.value).toBe('24.000,50')
    expect(screen.getByTestId('cents').textContent).toBe('2400000')
  })

  it('montos de 7 dígitos: editar "1.234.567" ya agrupado no lo corrompe', () => {
    render(<Controlled />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    typeSequence(input, '1234567')
    expect(input.value).toBe('1.234.567')
    expect(screen.getByTestId('cents').textContent).toBe('123456700')

    backspace(input)
    expect(input.value).toBe('123.456')
    expect(screen.getByTestId('cents').textContent).toBe('12345600')

    typeSequence(input, '9')
    expect(input.value).toBe('1.234.569')
    expect(screen.getByTestId('cents').textContent).toBe('123456900')
  })

  // El propio `setSelectionRange(n, n)` explícito de este componente es la
  // única llamada con exactamente 2 argumentos (React restaura la selección
  // del input controlado con una llamada de 3, incluyendo la dirección) — así
  // se aísla nuestra llamada de la del framework. Ver openIssues del informe:
  // en happy-dom el estado FINAL del caret puede terminar en el final de
  // todos modos por ese mecanismo interno de React, ajeno a este componente;
  // lo que este test fija es que NOSOTROS ya no somos quienes lo empujan ahí.
  it('el caret se fuerza al final (llamada propia) solo cuando el tipeo ya estaba en el final', async () => {
    render(<Controlled />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    const spy = vi.spyOn(input, 'setSelectionRange')

    // Corrigiendo en el medio (caret en la posición 3 de "249000"): nuestro
    // código no debe forzar nada.
    fireEvent.change(input, { target: { value: '249000', selectionStart: 3 } })
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(spy.mock.calls.filter((call) => call.length === 2)).toHaveLength(0)

    spy.mockClear()

    // Tipeando al final (caret == largo del string tras la tecla): sí forzamos.
    fireEvent.change(input, { target: { value: '2490005', selectionStart: 7 } })
    await new Promise((resolve) => requestAnimationFrame(resolve))
    const ownCalls = spy.mock.calls.filter((call) => call.length === 2)
    expect(ownCalls).toEqual([[input.value.length, input.value.length]])
  })
})
