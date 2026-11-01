// @ts-check
/**
 * ESLint recortado para el lint híbrido (`pnpm lint:hybrid` = Oxlint + este).
 *
 * Es `eslint.config.mjs` MÁS un bloque final que apaga lo que Oxlint ya cubre
 * (`.oxlintrc.json`) y el lint con tipos: ninguna regla tipada queda activa acá,
 * así que ESLint no arma el programa de TypeScript.
 *
 * Lo que sigue corriendo en ESLint porque Oxlint no lo tiene o lo ve distinto:
 *  · `no-restricted-syntax` (UTC `toISOString().slice`, `bg-emerald-600`, spyOn de timers).
 *  · `react-hooks/purity`: ESLint atrapa `Date.now()` y NO `new Date()`; la regla de
 *    Oxlint marca los dos y daba 7 falsos positivos en Server Components.
 *  · `@next/next/no-location-assign-relative-destination` y `react/no-deprecated`.
 *
 * La lista de reglas apagadas es la intersección con Oxlint al 2026-11-01. Si
 * `eslint.config.mjs` suma una regla que Oxlint también tiene, hay que agregarla
 * acá: `docs/tech-debt.md` registra cambiar esto por `eslint-plugin-oxlint`.
 */
import base from './eslint.config.mjs'

const hybridConfig = [
  ...base,
  {
    name: 'turnogol/hybrid-sin-tipos',
    languageOptions: { parserOptions: { project: false, projectService: false } },
    // Las directivas que apuntan a reglas apagadas acá no son basura: las honra Oxlint.
    linterOptions: { reportUnusedDisableDirectives: false },
    rules: {
      '@next/next/google-font-display': 'off',
      '@next/next/google-font-preconnect': 'off',
      '@next/next/inline-script-id': 'off',
      '@next/next/next-script-for-ga': 'off',
      '@next/next/no-assign-module-variable': 'off',
      '@next/next/no-async-client-component': 'off',
      '@next/next/no-before-interactive-script-outside-document': 'off',
      '@next/next/no-css-tags': 'off',
      '@next/next/no-document-import-in-page': 'off',
      '@next/next/no-duplicate-head': 'off',
      '@next/next/no-head-element': 'off',
      '@next/next/no-head-import-in-document': 'off',
      '@next/next/no-img-element': 'off',
      '@next/next/no-page-custom-font': 'off',
      '@next/next/no-script-component-in-head': 'off',
      '@next/next/no-styled-jsx-in-document': 'off',
      '@next/next/no-sync-scripts': 'off',
      '@next/next/no-title-in-document-head': 'off',
      '@next/next/no-typos': 'off',
      '@next/next/no-unwanted-polyfillio': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/no-array-constructor': 'off',
      '@typescript-eslint/no-duplicate-enum-values': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-extra-non-null-assertion': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-misused-new': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-restricted-imports': 'off',
      '@typescript-eslint/no-this-alias': 'off',
      '@typescript-eslint/no-unnecessary-type-constraint': 'off',
      '@typescript-eslint/no-unsafe-declaration-merging': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-wrapper-object-types': 'off',
      '@typescript-eslint/prefer-as-const': 'off',
      '@typescript-eslint/prefer-namespace-keyword': 'off',
      '@typescript-eslint/triple-slash-reference': 'off',
      'import/no-anonymous-default-export': 'off',
      'jsx-a11y/alt-text': 'off',
      'jsx-a11y/aria-props': 'off',
      'jsx-a11y/aria-proptypes': 'off',
      'jsx-a11y/aria-unsupported-elements': 'off',
      'jsx-a11y/role-has-required-aria-props': 'off',
      'jsx-a11y/role-supports-aria-props': 'off',
      'no-var': 'off',
      'prefer-const': 'off',
      'prefer-rest-params': 'off',
      'prefer-spread': 'off',
      'react-hooks/error-boundaries': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'react-hooks/globals': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/incompatible-library': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/rules-of-hooks': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/set-state-in-render': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/unsupported-syntax': 'off',
      'react-hooks/use-memo': 'off',
      'react/display-name': 'off',
      'react/jsx-key': 'off',
      'react/jsx-no-comment-textnodes': 'off',
      'react/jsx-no-duplicate-props': 'off',
      'react/jsx-no-undef': 'off',
      'react/no-children-prop': 'off',
      'react/no-danger-with-children': 'off',
      'react/no-direct-mutation-state': 'off',
      'react/no-find-dom-node': 'off',
      'react/no-is-mounted': 'off',
      'react/no-render-return-value': 'off',
      'react/no-string-refs': 'off',
      'react/no-unescaped-entities': 'off',
      'react/require-render-return': 'off',
    },
  },
]

export default hybridConfig
