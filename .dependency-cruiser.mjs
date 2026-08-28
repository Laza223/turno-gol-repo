// Dependency Cruiser — resuelve el grafo REAL de imports (alias @/* y
// relativos) y valida contra las mismas 6 zonas de capas que ya impone
// `eslint.config.mjs` (turnogol/capas-*), más detección de ciclos.
//
// Por qué esto no es redundante con ESLint: `no-restricted-imports` matchea
// por STRING del specifier (`@/modules/**`), así que un import relativo que
// cruce capas (`../../modules/x`) se le escapa — es una limitación que el
// propio eslint.config.mjs documenta (comentario en "Límites de capas", hoy
// dice "0 imports relativos cruzan capas" pero nada lo vuelve a chequear).
// dependency-cruiser resuelve el módulo real post-alias, así que cierra ese
// hueco y además detecta ciclos de import, que ESLint no cubre acá.
//
// Lo que ESLint SÍ hace y esto no puede replicar: distinguir `import type`
// (permitido cruzando capas, `allowTypeImports: true`) de un import de VALOR.
// dependency-cruiser ve el grafo de módulos, no la anotación TS — así que un
// `import type { X } from '@/modules/...'` legítimo también va a aparecer acá
// como violación. Por eso todas las reglas arrancan en severity 'warn': el
// primer scan real necesita el mismo triage que ya se le hizo a
// doctor.config.mjs (falso positivo verificado leyendo el archivo vs. gap
// real) antes de subir una regla puntual a 'error'.
//
// Docs: https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md

export default {
  forbidden: [
    {
      name: 'no-domain-infra-to-app-or-server',
      comment:
        'Espejo de turnogol/capas-nadie-importa-app-ni-server: modules/shared/lib no importan la capa de ruteo (@/app) ni el composition root (@/server). shared/jobs SÍ puede — lo cubre no-jobs-to-app-server aparte con las mismas rutas.',
      severity: 'warn',
      from: { path: '^src/(modules|shared|lib)/', pathNot: '^src/shared/jobs/' },
      to: { path: '^src/(app|server)/' },
    },
    {
      name: 'no-lib-to-modules',
      comment:
        'Espejo de turnogol/capas-lib: @/lib son adapters y helpers puros, no pueden depender del dominio.',
      severity: 'warn',
      from: { path: '^src/lib/' },
      to: { path: '^src/modules/' },
    },
    {
      name: 'no-components-to-modules-app-server',
      comment:
        'Espejo de turnogol/capas-components: un componente reusable no depende del dominio, la capa de ruteo ni el composition root — si necesita una Server Action, se inyecta como prop.',
      severity: 'warn',
      from: { path: '^src/components/' },
      to: { path: '^src/(modules|app|server)/' },
    },
    {
      name: 'no-shared-to-domain-server-app',
      comment:
        'Espejo de turnogol/capas-shared: @/shared es infraestructura, no conoce el dominio ni compone runtime. shared/jobs queda afuera por diseño (composition root del runtime de background).',
      severity: 'warn',
      from: { path: '^src/shared/', pathNot: '^src/shared/jobs/' },
      to: { path: '^src/(modules|server|app)/' },
    },
    {
      name: 'no-server-to-ui-or-app',
      comment:
        'Espejo de turnogol/capas-server: @/server orquesta dominio pero no renderiza — nada de components/hooks, y tampoco la capa de ruteo.',
      severity: 'warn',
      from: { path: '^src/server/' },
      to: { path: '^src/(components|hooks|app)/' },
    },
    {
      name: 'no-jobs-to-app-server',
      comment:
        'Espejo de turnogol/jobs-worker-pool (mitad de import): src/shared/jobs es el composition root del runtime de background, no importa la capa de ruteo web ni el composition root del runtime web.',
      severity: 'warn',
      from: { path: '^src/shared/jobs/' },
      to: { path: '^src/(app|server)/' },
    },
    {
      name: 'no-circular',
      comment: 'Ciclo de imports — ESLint no lo cubre en este repo.',
      severity: 'warn',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require', 'node', 'default'] },
    doNotFollow: { path: 'node_modules' },
  },
}
