import { Input } from 'turnogol'

export function Default() {
  return (
    <div className="w-80">
      <Input placeholder="Nombre del jugador" />
    </div>
  )
}

export function ConValor() {
  return (
    <div className="w-80">
      <Input defaultValue="Cancha 3 — Fútbol 5" />
    </div>
  )
}

export function Deshabilitado() {
  return (
    <div className="w-80">
      <Input placeholder="No disponible" disabled />
    </div>
  )
}
