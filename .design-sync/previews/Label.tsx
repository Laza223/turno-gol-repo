import { Label, Input } from 'turnogol'

export function ConInput() {
  return (
    <div className="grid w-80 gap-1.5">
      <Label htmlFor="email">Email</Label>
      <Input id="email" type="email" placeholder="jugador@email.com" />
    </div>
  )
}
