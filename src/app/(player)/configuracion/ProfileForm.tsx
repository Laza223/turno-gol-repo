'use client'

import { startTransition, useActionState, useState, type FormEvent } from 'react'
import type { UpdateProfileResult } from './actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PhoneInput } from '@/components/ui/phone-input'
import { Button } from '@/components/ui/button'

type DefaultValues = {
  firstName: string
  lastName: string
  phone: string
  preferredArea: string
}

/** Firma de la Server Action que consume el form. */
type UpdateProfileAction = (
  prevState: UpdateProfileResult,
  formData: FormData,
) => Promise<UpdateProfileResult>

type Props = {
  defaultValues: DefaultValues
  /**
   * La action llega por PROP, no por import: './actions' es `'use server'` y
   * arrastra drizzle/postgres + `node:async_hooks` (vía request-context), lo
   * que rompe cualquier bundle de browser (Storybook) si se importa como
   * valor. El type import de `UpdateProfileResult` sí es seguro: se borra en
   * compilación.
   */
  action: UpdateProfileAction
}

const INITIAL_STATE: UpdateProfileResult = { success: true }

/** Campo del portal: 44 px, 16 px en el celular, borde `input` y el placeholder con el color pleno del token. */
const FIELD = 'md:h-11 placeholder:text-muted-foreground aria-invalid:border-destructive'
/** 13 px es el piso del portal; red-700/red-300 son los que pasan AA sobre `background` en los dos temas. */
const FIELD_ERROR = 'text-[13px] leading-5 text-red-700 dark:text-red-300'

type FieldName = 'first_name' | 'last_name' | 'preferred_area' | 'phone'

export function ProfileForm({ defaultValues, action }: Props) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE)
  // "Guardado" vale hasta que se vuelve a tocar un campo: después ya no dice nada de lo que hay en pantalla.
  const [edited, setEdited] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  // La action se llama a mano y no con `<form action>`: React 19 resetea los campos no controlados
  // al terminar una action, y con un error de validación el jugador perdía lo que había escrito.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setSubmitted(true)
    setEdited(false)
    startTransition(() => formAction(data))
  }

  const fieldError = (name: FieldName) =>
    !state.success && state.field === name ? state.error : undefined
  const formError = !state.success && !state.field ? state.error : undefined

  return (
    <form
      onSubmit={handleSubmit}
      onChange={() => setEdited(true)}
      // `noValidate`: todo error —nombre vacío, largo máximo, teléfono corto— pasa por el mismo
      // camino (el mensaje de Zod, al lado de su campo) en vez de que el navegador bloquee el
      // submit con su tooltip. `required` se deja para `aria-required`.
      noValidate
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="first_name" className="text-base">
            Nombre
          </Label>
          <Input
            id="first_name"
            name="first_name"
            type="text"
            defaultValue={defaultValues.firstName}
            autoComplete="given-name"
            required
            className={FIELD}
            aria-invalid={fieldError('first_name') ? true : undefined}
            aria-describedby={fieldError('first_name') ? 'first_name-error' : undefined}
          />
          {fieldError('first_name') && (
            <p id="first_name-error" role="alert" className={FIELD_ERROR}>
              {fieldError('first_name')}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="last_name" className="text-base">
            Apellido <span className="font-normal text-muted-foreground">(opcional)</span>
          </Label>
          <Input
            id="last_name"
            name="last_name"
            type="text"
            defaultValue={defaultValues.lastName}
            autoComplete="family-name"
            className={FIELD}
            aria-invalid={fieldError('last_name') ? true : undefined}
            aria-describedby={fieldError('last_name') ? 'last_name-error' : undefined}
          />
          {fieldError('last_name') && (
            <p id="last_name-error" role="alert" className={FIELD_ERROR}>
              {fieldError('last_name')}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        {/* El error del teléfono lo dibujo acá y no con la prop `error` del PhoneInput: esa no es una alerta. */}
        <Label htmlFor="phone" className="text-base">
          Teléfono
        </Label>
        <PhoneInput
          id="phone"
          name="phone"
          defaultValue={defaultValues.phone}
          onChange={() => setEdited(true)}
          aria-invalid={fieldError('phone') ? true : undefined}
          aria-describedby={fieldError('phone') ? 'phone-error' : undefined}
          // 44 px también desde md, y el código de país (+54) en 14 px y no en los 12 del primitivo.
          className="md:[&_button]:h-11 [&_button>span.text-xs]:text-sm"
          inputClassName="md:h-11"
        />
        {fieldError('phone') && (
          <p id="phone-error" role="alert" className={FIELD_ERROR}>
            {fieldError('phone')}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="preferred_area" className="text-base">
          Zona preferida
        </Label>
        <Input
          id="preferred_area"
          name="preferred_area"
          type="text"
          defaultValue={defaultValues.preferredArea}
          placeholder="Ej: Palermo, Villa Crespo"
          className={FIELD}
          aria-invalid={fieldError('preferred_area') ? true : undefined}
          aria-describedby={fieldError('preferred_area') ? 'preferred_area-error' : undefined}
        />
        {fieldError('preferred_area') && (
          <p id="preferred_area-error" role="alert" className={FIELD_ERROR}>
            {fieldError('preferred_area')}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-2">
        <Button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="h-auto min-h-11 w-full px-5 shadow-none hover:translate-y-0 hover:shadow-none active:scale-100 focus-visible:ring-offset-background disabled:opacity-100 sm:w-auto md:h-auto"
        >
          {pending ? 'Guardando…' : 'Guardar cambios'}
        </Button>
        {/* Región viva siempre montada: un anuncio solo se lee si el contenedor ya estaba en el DOM. */}
        <p role="status" className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
          {submitted && state.success && !edited && !pending ? 'Guardado' : null}
        </p>
      </div>

      {formError && (
        <p role="alert" className={FIELD_ERROR}>
          {formError}
        </p>
      )}
    </form>
  )
}
