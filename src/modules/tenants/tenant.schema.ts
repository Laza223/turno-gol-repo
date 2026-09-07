import { z } from 'zod'
import { phone } from '@/shared/validation/primitives'

export const createTenantSchema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres').max(100, 'Máximo 100 caracteres'),
  address: z.string().min(5, 'Dirección muy corta').max(200, 'Máximo 200 caracteres'),
  city: z.string().min(2, 'Ciudad muy corta').max(100, 'Máximo 100 caracteres'),
  province: z.string().min(2, 'Provincia muy corta').max(100, 'Máximo 100 caracteres'),
  phone,
  email: z.email('Email inválido'),
})

/**
 * Paso 1 en revisita (`updateWizardTenantAction`): el wizard ya no pide
 * teléfono/email ahí (se derivan de la cuenta staff al crear, doc10 §2 — "NO
 * pedir: teléfono del complejo, email del complejo"), así que editar ese paso
 * no puede tocar esas dos columnas — se editan aparte en `/settings/perfil`
 * (`tenantContactSchema` abajo). Sin este recorte, un update parcial de
 * verdad (`UpdateTenantInput` es `Partial<...>`) igual requeriría mandar
 * phone/email en el FormData para pasar `createTenantSchema` completo.
 */
// Sin `export`: ahora sólo lo consume `updateWizardIdentitySchema`, acá abajo.
// knip corre con `ignoreExportsUsedInFile` en falso y lo marcaría muerto.
const updateTenantIdentitySchema = createTenantSchema.pick({
  name: true,
  address: true,
  city: true,
  province: true,
})

/**
 * Contacto público del complejo, editable desde `/settings/perfil` (B15).
 *
 * `whatsapp` es opcional y NO está en `createTenantSchema`: al crear el
 * complejo no se pide (igual que teléfono y email, doc10 §2). La columna
 * existía desde la migración 003 y se leía en el perfil público, pero hasta
 * ahora no había NINGUNA pantalla para cargarla — o sea que en la práctica
 * estaba siempre en NULL. Vacío se guarda como NULL, no como cadena vacía, para
 * que la cascada `whatsapp ?? phone` de `resolveTenantContact` caiga al
 * teléfono en vez de quedarse con un dato que no sirve.
 */
export const tenantContactSchema = createTenantSchema.pick({ phone: true, email: true }).extend({
  whatsapp: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? null : v))
    .pipe(phone.nullable()),
})

/**
 * Coordenada opcional que viene de un FormData, o sea siempre string.
 *
 * El `transform` a null ANTES del coerce no es estilo: `Number('')` es `0`, así
 * que un campo vacío con `z.coerce.number()` a pelo guardaría el punto (0, 0)
 * — el Golfo de Guinea, a diez mil kilómetros de cualquier complejo argentino,
 * y sin ningún error visible. Mismo patrón que `whatsapp` acá arriba.
 */
function optionalCoordinate(min: number, max: number, label: string) {
  return (
    z
      .string()
      .trim()
      .optional()
      // Ausente y vacío son el mismo caso: "todavía no cargó el punto".
      .transform((v) => (!v ? null : Number(v)))
      .refine((v) => v === null || (Number.isFinite(v) && v >= min && v <= max), {
        // `Number.isFinite` cubre de una el texto no numérico: `Number('abc')`
        // es NaN, y NaN no pasa ninguna comparación de rango por sí solo.
        message: `${label} inválida`,
      })
  )
}

/** Campos de coordenada, para extender los schemas que las aceptan. */
const coordinateFields = {
  latitude: optionalCoordinate(-90, 90, 'Latitud'),
  longitude: optionalCoordinate(-180, 180, 'Longitud'),
}

/**
 * "Ambas o ninguna". Defiende un invariante que TODO el lado lector ya asume
 * (`ExplorarMap` exige las dos, el Haversine devuelve NULL si falta una):
 * media coordenada es un estado que nadie sabe renderizar.
 */
function bothOrNeither(v: { latitude: number | null; longitude: number | null }): boolean {
  return (v.latitude === null) === (v.longitude === null)
}

const COORDINATE_PAIR_MESSAGE = {
  message: 'Marcá el punto en el mapa o quitalo por completo',
  path: ['latitude'],
}

/** Alta del complejo en el paso 1 del wizard, con el punto opcional. */
export const createTenantWithLocationSchema = createTenantSchema
  .extend(coordinateFields)
  .refine(bothOrNeither, COORDINATE_PAIR_MESSAGE)

/** Revisita del paso 1: mismos campos que el alta, sin teléfono ni email. */
export const updateWizardIdentitySchema = updateTenantIdentitySchema
  .extend(coordinateFields)
  .refine(bothOrNeither, COORDINATE_PAIR_MESSAGE)

/**
 * Ubicación del complejo, editable desde `/settings/perfil`.
 *
 * Incluye dirección/ciudad/provincia porque hasta ahora NO existía ninguna
 * pantalla que las editara después del wizard (ver el comentario de
 * `updateWizardTenantAction`): una dirección mal tipeada quedaba así para
 * siempre, y como `city` se filtra con igualdad exacta en la búsqueda pública,
 * un tipeo ahí deja al complejo infindable — cargar el punto en el mapa no lo
 * arregla. `name` queda afuera a propósito: arrastra la decisión del slug.
 *
 * El `refine` de "ambas o ninguna" defiende un invariante que TODO el lado
 * lector ya asume (`ExplorarMap` exige las dos, el Haversine devuelve NULL si
 * falta una): media coordenada es un estado que nadie sabe renderizar.
 */
export const tenantLocationSchema = createTenantSchema
  .pick({ address: true, city: true, province: true })
  .extend(coordinateFields)
  .refine(bothOrNeither, COORDINATE_PAIR_MESSAGE)
