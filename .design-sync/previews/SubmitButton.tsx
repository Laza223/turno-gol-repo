import { SubmitButton } from 'turnogol'

export function EnFormulario() {
  return (
    <form action={() => {}} className="w-72">
      <SubmitButton>Guardar cambios</SubmitButton>
    </form>
  )
}

export function Secundario() {
  return (
    <form action={() => {}} className="w-72">
      <SubmitButton variant="outline">Confirmar reserva</SubmitButton>
    </form>
  )
}
