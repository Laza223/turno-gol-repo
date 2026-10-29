import type { ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SelectMenu } from '@/components/ui/select-menu'
import { PlayerPhotoField } from '@/components/rival/PlayerPhotoField'
import { initials } from '@/lib/format'
import {
  FIELD_ERROR,
  POSITION_OPTIONS,
  ZONE_OPTIONS,
  type WelcomeFieldErrors,
  type WelcomeNeeds,
  type WelcomePhoto,
} from './welcome-copy'

/** Un grupo de campos con título propio (solo cuando la tarjeta pide los dos). */
function FieldGroup({ id, title, children }: { id: string; title?: string; children: ReactNode }) {
  return (
    <div
      role={title ? 'group' : undefined}
      aria-labelledby={title ? id : undefined}
      className="space-y-3"
    >
      {title && (
        <h3 id={id} className="font-display text-lg font-extrabold leading-6 text-foreground">
          {title}
        </h3>
      )}
      {children}
    </div>
  )
}

function NameField({
  name,
  onChange,
  fe,
}: {
  name: string
  onChange: (value: string) => void
  fe: WelcomeFieldErrors
}) {
  const message = fe.message('firstName')
  return (
    <div className="space-y-1.5">
      <Label htmlFor="rival-nombre" className="text-base">
        Tu nombre
      </Label>
      <Input
        id="rival-nombre"
        name="firstName"
        autoComplete="given-name"
        maxLength={40}
        required
        value={name}
        onChange={(e) => {
          onChange(e.target.value)
          fe.clear('firstName')
        }}
        className="h-12 rounded-lg text-base md:h-12 md:text-base aria-invalid:border-destructive aria-invalid:focus-visible:border-destructive"
        aria-invalid={message ? true : undefined}
        aria-describedby={message ? 'rival-nombre-ayuda rival-nombre-error' : 'rival-nombre-ayuda'}
      />
      <p id="rival-nombre-ayuda" className="text-sm leading-5 text-muted-foreground">
        Los demás ven solo tu nombre y la inicial del apellido.
      </p>
      {message && (
        <p {...fe.messageProps('firstName')} className={FIELD_ERROR}>
          {message}
        </p>
      )}
    </div>
  )
}

/** Nombre y foto opcional (lo de `identity`). */
export function IdentityFields({
  needs,
  name,
  onNameChange,
  photo,
  fe,
}: {
  needs: WelcomeNeeds
  name: string
  onNameChange: (value: string) => void
  photo?: WelcomePhoto
  fe: WelcomeFieldErrors
}) {
  return (
    <FieldGroup id="rival-grupo-vos">
      {needs.identity && <NameField name={name} onChange={onNameChange} fe={fe} />}
      {needs.identity && photo && (
        <PlayerPhotoField
          compact
          url={photo.url}
          initials={initials(name, '')}
          uploadAction={photo.uploadAction}
          removeAction={photo.removeAction}
        />
      )}
    </FieldGroup>
  )
}

/** Posición (si corresponde) y zona (lo de `profile`). */
export function ProfileFields({
  needs,
  grouped,
  position,
  onPositionChange,
  zone,
  onZoneChange,
  fe,
}: {
  needs: WelcomeNeeds
  grouped: boolean
  position: string
  onPositionChange: (value: string) => void
  zone: string
  onZoneChange: (value: string) => void
  fe: WelcomeFieldErrors
}) {
  const zoneMessage = fe.message('zone')
  return (
    <FieldGroup id="rival-grupo-organizador" title={grouped ? 'Para el organizador' : undefined}>
      {needs.position && (
        <div className="space-y-1.5">
          <Label htmlFor="rival-posicion-select" className="text-base">
            Tu posición
          </Label>
          <SelectMenu
            id="rival-posicion-select"
            name="position"
            value={position}
            onChange={onPositionChange}
            options={POSITION_OPTIONS}
            placeholder="Elegí tu posición"
            className="rounded-lg bg-card md:text-base"
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="rival-zona" className="text-base">
          Tu zona
        </Label>
        <SelectMenu
          id="rival-zona"
          name="zone"
          value={zone}
          onChange={(v) => {
            onZoneChange(v)
            fe.clear('zone')
          }}
          options={ZONE_OPTIONS}
          placeholder="Elegí tu zona"
          className="rounded-lg bg-card md:text-base"
          aria-invalid={zoneMessage ? true : undefined}
          aria-describedby={zoneMessage ? 'rival-zona-error' : undefined}
        />
        {zoneMessage && (
          <p {...fe.messageProps('zone')} className={FIELD_ERROR}>
            {zoneMessage}
          </p>
        )}
      </div>
    </FieldGroup>
  )
}
