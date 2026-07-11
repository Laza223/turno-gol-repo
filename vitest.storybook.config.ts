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
    browser: {
      enabled: true,
      provider: 'playwright',
      headless: true,
      instances: [{ browser: 'chromium' }],
    },
  },
})
