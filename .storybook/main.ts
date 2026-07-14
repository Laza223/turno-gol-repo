import { resolve } from 'node:path'
import type { StorybookConfig } from '@storybook/nextjs-vite'

// Storybook 10 carga este archivo como ESM: `__dirname` no existe. Los scripts
// `storybook` / `build-storybook` corren desde la raíz del repo, así que cwd sirve.
const repoRoot = process.cwd()

const config: StorybookConfig = {
  // Stories colocadas junto al componente: es el único lugar donde `eslint src/`
  // (type-aware), el `content` de Tailwind y `prettier --write src/` ya aplican.
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(ts|tsx)'],

  addons: ['@storybook/addon-docs', '@storybook/addon-a11y', '@storybook/addon-vitest'],

  framework: {
    name: '@storybook/nextjs-vite',
    options: {
      // .ts, no .js: el config de Next se migró a TypeScript al pasar a Next 16 y
      // esto quedó apuntando a un archivo que ya no existe. Storybook no falla
      // ruidosamente ante un nextConfigPath colgado — arranca igual, así que el
      // desfasaje pasa desapercibido.
      nextConfigPath: resolve(repoRoot, 'next.config.ts'),
    },
  },

  // /sb-fonts sirve los woff2 ya commiteados en .design-sync/fonts, que
  // preview-head.html carga. Evita que next/font salga a fonts.googleapis.com
  // en build time y vuelva el build no determinista.
  staticDirs: ['../public', { from: '../.design-sync/fonts', to: '/sb-fonts' }],

  typescript: {
    reactDocgen: 'react-docgen-typescript',
    reactDocgenTypescriptOptions: {
      shouldExtractLiteralValuesFromEnum: true,
      shouldRemoveUndefinedFromOptional: true,
      propFilter: (prop) => (prop.parent ? !/node_modules/.test(prop.parent.fileName) : true),
    },
  },

  core: { disableTelemetry: true },
}

export default config
