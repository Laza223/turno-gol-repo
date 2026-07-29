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
      // El prefijo `_` ya era la convención para argumentos; se extiende a
      // variables y a `catch (_e)` para que sea UNA sola regla y no tres.
      // `ignoreRestSiblings` cubre el idiom de omitir una clave:
      // `const { secreto: _omit, ...resto } = obj`.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
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
    // `pnpm lint` cubre src/ + tests/ + scripts/. Los .mjs/.js de scripts/ no
    // están en el `include` del tsconfig (que sólo toma **/*.ts y **/*.tsx), así
    // que el parser type-aware falla con "file was not found in any of the
    // provided project(s)". No es un hallazgo: es que esos archivos no son parte
    // del programa de TS. Se lintean sin información de tipos.
    name: 'turnogol/scripts-sin-tipos',
    files: ['**/*.mjs', '**/*.js', '**/*.cjs'],
    ...tseslint.configs.disableTypeChecked,
  },

  {
    // `.js` acá significa CommonJS: `scripts/lhci-grilla-puppeteer.js` lo carga
    // Lighthouse CI con require(), así que require() adentro no es deuda, es el
    // formato del módulo. Los `.mjs` sí quedan con la regla puesta.
    name: 'turnogol/commonjs',
    files: ['**/*.js', '**/*.cjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  {
    // Los tests son otro contexto, no código de producción con la vara baja.
    // Se relaja UNA sola cosa, y es un choque de idioma real, no deuda:
    // `vi.mock<typeof import('@/x')>(...)` y `let x: typeof import('@/y')` son
    // LA forma de tipar un mock de vitest. `disallowTypeAnnotations` (que viene
    // prendido por default dentro de consistent-type-imports) las prohíbe.
    // Todo lo demás — dead code, promesas sueltas, `any` — sigue en `error`:
    // un import muerto en un test es cruft igual que en src/, y una promesa sin
    // await en un test es una fuente de flakiness.
    name: 'turnogol/tests',
    files: ['tests/**/*.ts', 'tests/**/*.tsx'],
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', disallowTypeAnnotations: false },
      ],
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

  // ─── Límites de capas ──────────────────────────────────────────────────────
  //
  // La dirección permitida es UNA: app → components/hooks → modules → shared/lib.
  // Nada apunta para atrás. Estos bloques son la barrera; el alias único
  // `@/*` del tsconfig no impone ninguna.
  //
  // `allowTypeImports: true` es lo que hace esto vivible: `import type` se borra
  // al compilar, así que un tipo cruzando una frontera no acopla nada en runtime.
  // Con `consistent-type-imports` en `error` (arriba), TODOS los imports de tipo
  // del repo ya están escritos como `import type` — la opción los reconoce a los
  // dos: `import type { X } from` y `import { type X } from`.
  //
  // Los imports relativos (`../../modules/x`) se le escapan a esta regla, que
  // matchea el string del import. Hoy no existe ninguno que cruce capas: los 27
  // `from '../../'` del repo viven todos adentro de src/app/.

  {
    // Frontera limpia hoy (0 violaciones): trinquete gratis, directo a `error`.
    // Que el dominio o la infraestructura importen una page/layout/Action del
    // App Router invierte el sentido del grafo y ata la lógica al ruteo.
    name: 'turnogol/capas-nadie-importa-app',
    files: ['src/modules/**/*.ts', 'src/shared/**/*.ts', 'src/lib/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/app/**'],
              allowTypeImports: true,
              message:
                'Capa de dominio/infra importando la capa de ruteo. La dirección es app → modules → shared, nunca al revés. Si necesitás algo de una page, ese algo no vive en la page: subilo a @/modules o @/lib.',
            },
          ],
        },
      ],
    },
  },

  {
    // `src/lib` son adapters de terceros y helpers puros. Las 4 aristas actuales
    // hacia @/modules son todas `import type`, así que esto pasa limpio hoy.
    name: 'turnogol/capas-lib',
    files: ['src/lib/**/*.ts', 'src/lib/**/*.tsx'],
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/modules/**'],
              allowTypeImports: true,
              message:
                '@/lib es la capa de adapters y helpers puros: no puede depender del dominio. Si el helper necesita lógica de negocio, el helper es lógica de negocio y va en @/modules.',
            },
          ],
        },
      ],
    },
  },

  {
    // `src/components` son componentes reusables. Si uno necesita una Server
    // Action o un service, no es reusable: es una pieza de una ruta concreta y
    // su lugar es src/app/<ruta>/_components/.
    name: 'turnogol/capas-components',
    files: ['src/components/**/*.ts', 'src/components/**/*.tsx'],
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/modules/**'],
              allowTypeImports: true,
              message:
                'Un componente reusable no puede depender del dominio como VALOR. Los TIPOS sí (`import type`). Si necesitás la función, inyectala como prop — es el mismo patrón que ya usan ReservasPolicyForm e InviteStaffDialog con las Server Actions.',
            },
            {
              group: ['@/app/**'],
              allowTypeImports: true,
              message:
                'Un componente en @/components importando de @/app está en el lugar equivocado: o el componente pertenece a esa ruta (movelo a src/app/<ruta>/_components/), o lo que importa es genérico y va a @/lib.',
            },
          ],
        },
      ],
    },
  },

  {
    // EXCEPCIÓN TEMPORAL, una sola arista.
    //
    // src/components/dashboard/DashboardCanteenButton.tsx importa
    // `TicketPanel` de src/app/(admin)/caja/cantina/. El fix correcto es mover
    // TicketPanel a src/components/canteen/ — es un componente reusable, no una
    // pieza de esa ruta, y la prueba es justamente que el dashboard lo usa.
    //
    // No se hizo acá porque los DOS archivos tenían cambios sin commitear
    // cuando se metió esta regla (esfuerzo mobile-ux en vuelo): mover un archivo
    // con un diff abierto encima arruina la revisión de ese diff.
    //
    // TODO: en cuanto el esfuerzo mobile-ux esté commiteado, mover TicketPanel
    // a src/components/canteen/TicketPanel.tsx, actualizar los 2 importadores y
    // BORRAR este bloque entero.
    name: 'turnogol/capas-components-excepcion-ticketpanel',
    files: ['src/components/dashboard/DashboardCanteenButton.tsx'],
    rules: {
      '@typescript-eslint/no-restricted-imports': 'off',
    },
  },

  {
    // DEUDA CONOCIDA, por eso `warn` y no `error`.
    //
    // `src/shared` es infraestructura: no debería conocer el dominio. Hoy lo
    // conoce en 6 lugares (imports de VALOR; los de tipo los deja pasar
    // allowTypeImports):
    //   · shared/middleware/** → extractAuthUser ×3, getStaffRole ×2
    //     Fix = inyectar el resolver como parámetro del middleware.
    //   · shared/db/audit.ts → @/modules/auth/impersonation
    //     La peor de todas: la capa de DB dependiendo de dominio de auth.
    //     También la más fácil, es un solo archivo.
    //
    // src/shared/jobs/** queda FUERA por diseño (26 aristas): los workers son el
    // composition root del runtime de background — orquestar dominio es su
    // función, igual que src/app/ lo hace para el runtime web. No es deuda.
    //
    // Pasa a `error` cuando los 6 imports de valor estén resueltos.
    name: 'turnogol/capas-shared',
    files: ['src/shared/**/*.ts', 'src/shared/**/*.tsx'],
    ignores: ['src/shared/jobs/**'],
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': [
        'warn',
        {
          patterns: [
            {
              group: ['@/modules/**'],
              allowTypeImports: true,
              message:
                'DEUDA: @/shared es infraestructura y no debería conocer el dominio. Fix = inyección de dependencias (pasar la función como parámetro) en vez de importarla. Los `import type` no son deuda: allowTypeImports los deja pasar.',
            },
          ],
        },
      ],
    },
  },
)
