# Reglas Semgrep de TurnoGol

Análisis estático de los invariantes del dominio — los que ESLint y el compilador
no pueden ver porque viven adentro de strings SQL, de nombres de columna, o del
contrato entre capas.

## Correr

```bash
pnpm semgrep        # solo estas reglas
pnpm semgrep:all    # + packs del registry (p/nextjs, p/github-actions, p/docker)
pnpm semgrep:test   # tests de las reglas contra sus fixtures
pnpm semgrep:diff   # solo hallazgos nuevos contra origin/main
```

Corre en Docker (Semgrep no tiene binario nativo de Windows). Requiere Docker
Desktop andando. La imagen está pinneada y es la misma que usa CI.

## Las reglas

| id | Severity | Invariante | Qué pasa si se rompe |
|---|---|---|---|
| `turnogol-set-config-session-scope` | ERROR | `SET LOCAL` / `set_config(..., true)` | Fuga cross-tenant silenciosa: la conexión vuelve al pool con el tenant del request anterior |
| `turnogol-enum-cancelled-doble-l` | ERROR | `canceled`, una L | Explota contra el enum de Postgres, o el WHERE filtra 0 filas sin avisar |
| `turnogol-money-not-integer` | ERROR | Montos = centavos en `integer` | Redondeo float: la conciliación contra MercadoPago deja de cerrar |
| `turnogol-jsonb-stringify-en-sql` | ERROR | JSONB serializado UNA vez | `->>'campo'` devuelve NULL para siempre, y la lectura por el ORM lo enmascara |

Las cuatro reportan **0 hallazgos** contra el repo actual. Son trinquetes: no
están para limpiar deuda, están para que la deuda no vuelva a entrar.

## Packs del registry

`p/nextjs`, `p/github-actions`, `p/docker`. Medidos contra este repo:
**0, 23 y 0** hallazgos respectivamente.

Los 23 son todos **la misma regla** (`github-actions-mutable-action-tag`): cada
`uses: actions/checkout@v4` usa un tag mutable en vez de un SHA pinneado. Es un
hallazgo de supply chain legítimo — quien controle ese tag puede repuntarlo — pero
pinnear a SHA vuelve manual todo upgrade de action. Queda como **deuda conocida y
consciente**, no como ruido a ignorar: en los PRs no aparece porque
`--baseline-commit` filtra lo preexistente, y sí aparecería si mañana se agrega
una action nueva sin pinnear.

Packs descartados a propósito, con el motivo:

| Pack | Por qué NO |
|---|---|
| `p/sql-injection` | Marca todo template literal con `${}` que llegue a un ejecutor SQL. Hay **252 sitios `.execute(sql\`...\`)`**, todos parametrizados por drizzle. 150-250 falsos positivos: mata la herramienta el día 1 |
| `p/typescript` | Solapa con `tseslint.configs.recommended` + las 5 reglas `error` que ya corren |
| `p/react` | Solapa con `eslint-config-next/core-web-vitals` + react-hooks v6 + react-doctor. Triple señal duplicada |
| `p/secrets` | gitleaks ya corre en `security.yml` y es mejor: escanea la historia, no el working tree |
| `p/security-audit` | Semgrep lo documenta como "requiere revisión manual de cada hallazgo por diseño" |
| `p/owasp-top-ten`, `p/javascript`, `p/xss` | Superconjuntos ruidosos de lo anterior |

Criterio: un pack entra solo si (a) no lo cubre una herramienta que ya corre, y
(b) el ruido estimado contra ESTE repo es menor a 5 hallazgos.

## Agregar una regla

1. `.semgrep/rules/<nombre>.yml` con **una** regla (o una familia bien acotada).
2. `.semgrep/rules/<nombre>.ts` al lado, con casos anotados `// ruleid: <id>`
   (debe matchear) y `// ok: <id>` (no debe). Semgrep parea por nombre de archivo.
3. `pnpm semgrep:test` tiene que dar verde antes de commitear.
4. `pnpm semgrep` sobre el repo tiene que seguir dando **0 hallazgos**. Si tu
   regla nueva reporta algo preexistente, o encontraste un bug real (arreglalo),
   o la regla está mal calibrada (acotala). No se mergea una regla ruidosa.

### Criterio de severity

- **ERROR**: romper el invariante corrompe datos, pierde plata, o filtra entre
  tenants. Cero falsos positivos tolerados — estas son las que van a bloquear
  el CI cuando la fase advisory termine.
- **WARNING**: patrón sospechoso que a veces es legítimo. Convive con
  `--baseline-commit`, que borra del reporte todo lo preexistente.

Si una regla necesita saber qué pasó ANTES en la ejecución (que el guard sea la
primera sentencia, que la query esté adentro de `withTenantContext`), no la
escribas: semgrep OSS no hace análisis de flujo interprocedural y vas a producir
decenas de falsos positivos. Eso se testea en `tests/integration/`.

## Fase actual: advisory

El workflow no bloquea todavía. Pasa a bloqueante (solo las `ERROR` propias)
después de **2 semanas consecutivas sin un solo falso positivo**. El criterio es
ese, no "cuando me sienta cómodo".

Lo que **sí** es bloqueante desde el día 1 es `semgrep --test`: una regla rota es
un bug de tooling, no un hallazgo de código.
