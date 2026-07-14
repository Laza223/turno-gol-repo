/// <reference types="@vitest/browser/providers/playwright" />
import { defineConfig } from 'vitest/config'
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import path from 'node:path'

/**
 * Config SEPARADA a propósito. `vitest.config.ts` no crece una key `browser` y
 * `vitest run --dir tests/unit` nunca ve un `.stories.tsx`: los 207 archivos de
 * unit y los 85 de integración conservan su semántica exacta (node, pool threads,
 * singleThread).
 *
 * `storybookTest()` levanta el `viteFinal` del framework, así que dentro del
 * browser mode también aplican el transform SWC de Next y el alias
 * react-dom → next/dist/compiled/react-dom (el que hace que useFormState /
 * useFormStatus existan). Por eso tampoco hace falta @vitejs/plugin-react acá.
 *
 * Cada story corre como un test: se renderiza, corre su `play` si tiene, y el
 * addon-a11y (parameters.a11y.test = 'error' en el preview) la falla si axe
 * encuentra una violación.
 *
 * No hay `setupFiles`: desde Storybook 10.3 el addon aplica las annotations del
 * preview (tema, reloj congelado, Toaster, fetch mockeado) solo. Un
 * `setProjectAnnotations` a mano lo DESACTIVA y pasa a pisarlo.
 */
export default defineConfig({
  plugins: [storybookTest({ configDir: path.join(process.cwd(), '.storybook') })],
  test: {
    name: 'storybook',

    // El default de Vitest es 5000ms, y varias stories esperan un componente que
    // entra por `next/dynamic` (ConfirmDialog, AbonadoDialogs, CourtForm) con un
    // `findBy...({ timeout: 5000 })`. Un findBy de 5s adentro de un test de 5s es
    // una carrera perdida por definición: bajo la carga de las 793 stories el chunk
    // tarda 4-5s y el TEST se corta antes de que el findBy pueda cumplir.
    // No era flake: era esta config. El test tiene que poder esperar más que sus
    // propias assertions.
    testTimeout: 30_000,

    browser: {
      enabled: true,
      provider: 'playwright',
      headless: true,
      instances: [
        {
          browser: 'chromium',

          // `reducedMotion: 'reduce'` NO es cosmético: es lo que hace determinista el
          // scan de axe.
          //
          // El scan corre DESPUÉS del play, y Radix anima entradas y salidas
          // (`fade-in-0`, `fade-out-80`, `slide-in-*`). Si el scan pesca un nodo a
          // mitad de transición, ese nodo tiene `opacity < 1` — y la opacidad diluye el
          // fondo Y el texto a la vez, así que axe reporta un contraste que no existe en
          // ningún estado real de la app. Ejemplo medido: el toast "Caja cerrada" salía
          // 3.66:1 con fg #3d7e55 / bg #d7e2db — ninguno de los dos es un color del
          // sistema: son green-800 y green-50 diluidos por el fade.
          //
          // Se manifestaba como un flake que caía en una story distinta cada corrida,
          // según qué animación llegara a tiempo. Con reduced-motion, `globals.css` ya
          // tiene un bloque `@media (prefers-reduced-motion: reduce)` que pone
          // `animation-duration: .01ms !important` en todo: no hay estado transitorio
          // que pescar, y axe siempre ve el render final.
          //
          // La UI de dev sigue animando (el toggle de la toolbar la controla); esto
          // aplica solo al runner.
          context: { reducedMotion: 'reduce' },
        },
      ],
    },
  },
})
