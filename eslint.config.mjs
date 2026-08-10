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

      // Fase 0 (visión v2 §6.1, jerarquía única de acciones): `bg-emerald-600`
      // con texto blanco fallaba WCAG AA en dark (emerald-600/slate-950 no es
      // el par pineado; `--primary` dark ES emerald-500+slate-950). Los 15
      // sitios que lo tenían migraron a `bg-primary`/`<Button>` — esto evita que
      // vuelva. Dos selectores: strings normales Y template literals (backtick).
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/bg-emerald-600/]',
          message:
            'bg-emerald-600 con texto blanco falla WCAG AA en dark mode (el token --primary dark es emerald-500+slate-950, no emerald-600+white). Usá <Button> o las clases bg-primary/text-primary-foreground.',
        },
        {
          selector: 'TemplateElement[value.raw=/bg-emerald-600/]',
          message:
            'bg-emerald-600 con texto blanco falla WCAG AA en dark mode (el token --primary dark es emerald-500+slate-950, no emerald-600+white). Usá <Button> o las clases bg-primary/text-primary-foreground.',
        },
      ],
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
  // `src/server` es la excepción declarada: NO es una capa más de esa cadena,
  // es el composition root del runtime web (los wrappers de route handler).
  // Importar dominio es su función, igual que en `src/shared/jobs` para el
  // runtime de background. Se ubica al lado de `app`, no adentro de `shared`.
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
    // `src/server` no está en `files`: lo cubre `turnogol/capas-server` más
    // abajo, que al ser posterior reemplaza esta regla entera para esos archivos.
    name: 'turnogol/capas-nadie-importa-app-ni-server',
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
                'Capa de dominio/infra importando la capa de ruteo. La dirección es app → server → modules → shared, nunca al revés. Si necesitás algo de una page, ese algo no vive en la page: subilo a @/modules o @/lib.',
            },
            {
              // El B6 introdujo exactamente esta arista sin querer: al mover
              // with-tenant.ts a @/server, `modules/staff/guards.ts` — que reusa
              // BLOCKED_TENANT_STATUSES — pasó a importar @/server desde
              // @/modules. Ningún gate lo atrapaba. Las constantes se mudaron a
              // `@/modules/tenants/tenant.lifecycle` (son estados de
              // `tenants.status`, o sea dominio) y esta regla es el trinquete.
              group: ['@/server/**'],
              allowTypeImports: true,
              message:
                '@/server es el composition root del runtime web: compone dominio, no lo provee. Si @/modules o @/shared necesita algo que hoy vive ahí, ese algo es dominio o infraestructura mal ubicada — bajalo a @/modules o @/shared y que @/server lo importe desde ahí.',
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
            {
              // Repetido a propósito: este bloque es posterior a
              // `capas-nadie-importa-app-ni-server` y matchea los mismos
              // archivos, así que lo REEMPLAZA en vez de sumarse.
              group: ['@/app/**', '@/server/**'],
              allowTypeImports: true,
              message:
                '@/lib es la capa de más abajo junto con @/shared: no importa hacia arriba. Si el adapter necesita algo de una ruta o de un wrapper de route handler, ese algo está mal ubicado.',
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
            {
              group: ['@/server/**'],
              allowTypeImports: true,
              message:
                '@/server es el composition root del runtime web (wrappers de route handler): nada de UI puede importarlo. Un componente que necesita eso está mezclando servidor y render.',
            },
          ],
        },
      ],
    },
  },

  {
    // Frontera limpia desde B6 (0 violaciones): trinquete en `error`.
    //
    // `src/shared` es infraestructura: no conoce el dominio. Las 6 aristas de
    // VALOR que existían eran dos problemas distintos, y ninguno se resolvió
    // inyectando funciones por parámetro:
    //   · shared/middleware/{with-auth,with-player,with-role,with-tenant} →
    //     extractAuthUser ×3, getStaffRole ×2. Esos 4 archivos no eran
    //     infraestructura: son el composition root del runtime web. Se movieron
    //     a `src/server/middleware/`. `observability.ts` sí es infra y se quedó.
    //   · shared/db/audit.ts → @/modules/auth/impersonation. El módulo importado
    //     es PURO (solo node:crypto): un códec de cookie firmada, no dominio.
    //     Estaba mal ubicado; se movió a `@/shared/security/impersonation-cookie`.
    //
    // src/shared/jobs/** queda FUERA por diseño (26 aristas): los workers son el
    // composition root del runtime de background — orquestar dominio es su
    // función, igual que src/app/ y src/server/ lo hacen para el runtime web.
    name: 'turnogol/capas-shared',
    files: ['src/shared/**/*.ts', 'src/shared/**/*.tsx'],
    ignores: ['src/shared/jobs/**'],
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
                '@/shared es infraestructura y no puede conocer el dominio. Si el archivo NECESITA orquestar dominio, no es infraestructura: su lugar es @/server (runtime web) o @/shared/jobs (runtime de background). Los `import type` sí pasan: allowTypeImports los deja.',
            },
            {
              // REPETIDO a propósito, no es copy-paste: este bloque es posterior
              // a `capas-nadie-importa-app-ni-server` y matchea los mismos
              // archivos, así que REEMPLAZA su config de la regla entera en vez
              // de sumarse. Sin esta copia, `src/shared/**` puede importar
              // `@/server/**` y `@/app/**` sin que nadie chille. Verificado con
              // archivo sonda: sin estos dos patterns, el import de @/server
              // desde shared/ pasa limpio.
              group: ['@/server/**', '@/app/**'],
              allowTypeImports: true,
              message:
                '@/shared es la capa de más abajo: no importa hacia arriba. @/server compone dominio, no lo provee; si @/shared necesita algo que vive ahí, ese algo está mal ubicado — bajalo a @/shared o @/modules.',
            },
          ],
        },
      ],
    },
  },

  {
    // `src/server` orquesta dominio a propósito (esa es su razón de existir),
    // pero sigue siendo código de servidor sin UI: importar un componente o un
    // hook de React desde un wrapper de route handler significa que la pieza
    // está en el lugar equivocado.
    name: 'turnogol/capas-server',
    files: ['src/server/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/components/**', '@/hooks/**'],
              allowTypeImports: true,
              message:
                '@/server es el composition root del runtime web: no renderiza nada. Un wrapper de route handler que necesita un componente o un hook está mezclando dos cosas.',
            },
            {
              group: ['@/app/**'],
              allowTypeImports: true,
              message:
                'Capa de composición importando la capa de ruteo. La dirección es app → server → modules → shared, nunca al revés.',
            },
          ],
        },
      ],
    },
  },
)
