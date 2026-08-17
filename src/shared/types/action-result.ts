/**
 * Contrato de retorno de las Server Actions que consume la UI.
 *
 * Es el shape que el repo ya usa en ~495 lugares (`{ success: false, error }`),
 * escrito UNA vez. Lo que arregla no es la duplicación sino la VERSIÓN LAXA que
 * se había copiado a mano en decenas de archivos:
 *
 *     { success: boolean; error?: string }   // ❌ no discrimina
 *
 * Con esa forma, `error` es opcional en las DOS ramas: TypeScript acepta
 * `{ success: false }` sin motivo, y después la UI muestra un modal vacío o un
 * "No se pudo completar la acción" genérico donde había un error real que
 * contar. La unión discriminada hace que el compilador exija el motivo justo
 * cuando la acción falla, y que `res.error` sea `string` (no `string |
 * undefined`) apenas se chequea `res.success === false`.
 *
 * El payload de la rama exitosa va INLINE, que es como ya lo escriben los
 * aliases del repo:
 *
 *     type UploadPhotoActionResult = ActionResult<{ url: string }>
 *     type SupportActionResult = ActionResult<{ message?: string }>
 *
 * Los aliases locales que ya son uniones discriminadas correctas no necesitan
 * migrarse: son estructuralmente compatibles. Re-expresarlos con este genérico
 * es oportunístico, al tocar el archivo por otro motivo.
 */
export type ActionResult<TExtra extends object = Record<never, never>> =
  ({ success: true } & TExtra) | { success: false; error: string }
