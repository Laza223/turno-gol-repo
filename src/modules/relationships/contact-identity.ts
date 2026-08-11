/**
 * Identidad de una persona SIN CUENTA (B13).
 *
 * El complejo conoce gente que no tiene perfil: el titular de un turno fijo se
 * guarda en `abonados` como `contact_name` + `contact_phone`, con `player_id`
 * NULL. Esa persona existe, ocupa una cancha todas las semanas y hasta ahora no
 * aparecía en ninguna lista de personas. B13 la trae a la lista.
 *
 * No gana tabla propia a propósito: se DERIVA de `abonados` al leer. Una tabla
 * nueva aislada por tenant arrastra un costo fijo (RLS + FORCE + policies,
 * filtro explícito, DELETE en `data-retention-cleanup.worker.ts`, caso en
 * `isolation.test.ts`) y, peor, deja dos fuentes de verdad para el mismo
 * nombre y teléfono, que se separan al primer edit. Derivar mantiene
 * `abonados.contact_name` como el único lugar donde vive el dato.
 *
 * La contracara, explícita: una persona sin cuenta NO puede tener etiquetas de
 * cliente (B12) — viven en `player_tenant_relationships`, que exige un
 * `player_id`. Eso no es una limitación del atajo sino la decisión de producto:
 * la etiqueta es sobre una RELACIÓN, y la relación empieza cuando el staff
 * vincula a la persona con su cuenta. Vincularla la destraba.
 */

/** Mínimo de dígitos para que dos contactos se consideren la misma persona. */
const MIN_SIGNIFICANT_DIGITS = 6

/** Últimos N dígitos: descarta prefijos de país/celular que varían al tipear. */
const SIGNIFICANT_DIGITS = 10

/**
 * Cola corta, solo para SUGERIR una coincidencia (nunca para agrupar).
 *
 * La regla de agrupación tiene que ser estricta porque fusiona dos filas SIN
 * que nadie confirme: si se pasa de generosa, dos personas distintas aparecen
 * como una y nadie se entera. La sugerencia es al revés — un humano la mira y
 * la acepta o la ignora —, así que puede permitirse más recall.
 *
 * Y hace falta: `0 11 15 2233-4455` y `+54 9 11 2233-4455` son el MISMO celular
 * escrito como lo escribe medio país, y sus últimos 10 dígitos NO coinciden
 * (`1522334455` vs `1122334455`) porque el `15` corre la ventana. Los últimos 8
 * sí (`22334455`). Sacar el `15` "bien" exigiría saber si el código de área
 * tiene 2, 3 o 4 dígitos: eso es adivinar, y adivinar mal fusiona personas.
 */
const SUGGESTION_DIGITS = 8

/**
 * Clave de identidad de un contacto dentro de un complejo: los últimos 10
 * dígitos del teléfono.
 *
 * Por qué los últimos 10 y no el número entero: el mismo Diego se anota como
 * `+54 9 11 2233-4455` y como `11 2233 4455` según quién lo cargue, y ambas
 * formas comparten esa cola (área + abonado, el formato nacional de 10 dígitos
 * de Argentina). Comparar el string crudo lo mostraría como dos personas.
 *
 * Lo que esta regla NO agrupa, a propósito: la forma con `0` y `15`
 * (`0 11 15 2233-4455`), donde el `15` corre la ventana. De eso se ocupa la
 * SUGERENCIA (ver `SUGGESTION_DIGITS`), que un humano confirma. Acá se elige
 * precisión sobre recall porque agrupar de más fusiona dos personas en
 * silencio, y mostrar a Diego dos veces solo es molesto.
 *
 * Devuelve `''` cuando no hay suficientes dígitos para afirmar identidad —
 * quien llama debe caer al id de la fila como clave, para no fusionar en una
 * sola persona a todos los que tienen el teléfono mal cargado.
 */
export function normalizeContactPhone(phone: string | null | undefined): string {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (digits.length < MIN_SIGNIFICANT_DIGITS) return ''
  return digits.slice(-SIGNIFICANT_DIGITS)
}

/**
 * Espejo SQL de `normalizeContactPhone`, para agrupar del lado de Postgres sin
 * traer todas las filas a memoria. Los dos tienen que decir lo mismo, y el test
 * de integración `contact-identity.test.ts` corre los mismos casos por los dos
 * caminos y compara — si alguien toca uno solo, se pone rojo.
 *
 * Devuelve NULL (no `''`) cuando el teléfono no llega al mínimo de dígitos:
 * así el `GROUP BY` no fusiona en una sola persona a todos los que tienen el
 * teléfono mal cargado, y quien llama cae al id de la fila como clave.
 *
 * Es un fragmento de texto y no un `SQL` porque se interpola en varios lugares
 * de la misma query (CTE, GROUP BY, JOIN de sugerencia); el parámetro es
 * siempre un nombre de columna escrito acá adentro, nunca input del usuario.
 */
export function significantPhoneSql(column: string): string {
  const digits = `REGEXP_REPLACE(${column}, '\\D', '', 'g')`
  return `CASE WHEN LENGTH(${digits}) >= ${MIN_SIGNIFICANT_DIGITS}
    THEN RIGHT(${digits}, ${SIGNIFICANT_DIGITS}) END`
}

/**
 * Cola corta para el JOIN de sugerencia. Exige los 8 dígitos completos: con
 * menos, un fijo corto haría match con media agenda.
 */
export function suggestionPhoneSql(column: string): string {
  const digits = `REGEXP_REPLACE(${column}, '\\D', '', 'g')`
  return `CASE WHEN LENGTH(${digits}) >= ${SUGGESTION_DIGITS}
    THEN RIGHT(${digits}, ${SUGGESTION_DIGITS}) END`
}
