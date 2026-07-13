// @ts-check
import tseslint from 'typescript-eslint'
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'

/**
 * Flat config (ESLint 9). Reemplaza al `.eslintrc.json` de ESLint 8.
 *
 * Paridad deliberada con el eslintrc viejo: las mismas dos bases
 * (next/core-web-vitals + @typescript-eslint/recommended), el mismo linting
 * type-aware, las mismas 5 reglas y el mismo override para stories. No se
 * agregó `js.configs.recommended` a propósito — el eslintrc no lo tenía y
 * meterlo acá cambiaría el conjunto de reglas por la ventana.
 */
export default tseslint.config(
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'storybook-static/**',
      'ds-bundle/**',
      '.design-sync/**',
      '.worktrees/**',
    ],
  },

  ...nextCoreWebVitals,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],

      // El repo es App Router puro: no existe `pages/`. Esta regla está para
      // atrapar un <a> que apunta a una page del Pages Router, así que acá todo
      // hit es falso positivo por construcción. Los 2 que marcaba
      // (settings/facturacion, onboarding/StepPayments) apuntan a
      // /api/mp/oauth-start, que es un route handler de OAuth: necesita
      // navegación completa del browser. Con <Link> el redirect a MercadoPago no
      // arrancaría nunca.
      '@next/next/no-html-link-for-pages': 'off',
    },
  },

  {
    // Reglas NUEVAS que trae eslint-config-next@16 vía react-hooks v6 (el linter
    // del React Compiler). No existían bajo eslint-config-next@14, así que el
    // código nunca se escribió contra ellas: 27 hallazgos de entrada.
    //
    // Quedan en `warn`, no `error`, A PROPÓSITO. La mayoría de los
    // `set-state-in-effect` son el patrón SSR-safe de siempre (leer localStorage
    // / window en un useEffect y setState para no romper la hidratación).
    // Reescribirlos a useSyncExternalStore o lazy-init es un refactor real que
    // toca hidratación — no es algo que corresponda meter adentro de un upgrade
    // de ESLint. Se paga aparte, con su propio gate.
    //
    // Estado: 19 set-state-in-effect, 6 purity, 2 use-memo.
    name: 'turnogol/react-compiler-rules-pendientes',
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/use-memo': 'warn',
    },
  },

  {
    files: ['src/**/*.stories.ts', 'src/**/*.stories.tsx', 'src/test/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'postgres',
                'drizzle-orm',
                'drizzle-orm/*',
                'pg-boss',
                'server-only',
                '@supabase/ssr',
              ],
              allowTypeImports: true,
              message:
                'Módulo server-only: importarlo como VALOR (incluso transitivamente) mete un driver de Node en el bundle de browser de Storybook. `import type` sí, se borra al compilar.',
            },
            {
              group: [
                '@/shared/db',
                '@/shared/db/*',
                '@/shared/jobs/*',
                '@/modules/*/*.service',
                '@/modules/*/queries',
              ],
              allowTypeImports: true,
              message:
                'La capa de DB/servicios es server-only. Importá los TIPOS de dominio desde @/modules/**/*.types.ts (esos archivos no tienen imports) y escribí el fixture a mano.',
            },
            {
              group: ['**/actions', '**/actions.ts'],
              allowTypeImports: true,
              message:
                'Las Server Actions se inyectan como PROP (ver ReservasPolicyForm / InviteStaffDialog). Importarlas como valor arrastra drizzle/postgres/node:async_hooks al bundle de browser y la story explota. `import type` sí está permitido: se borra al compilar.',
            },
          ],
        },
      ],
    },
  },
)
