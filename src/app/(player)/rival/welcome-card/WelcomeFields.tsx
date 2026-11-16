import type { ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SelectMenu } from '@/components/ui/select-menu'
import { PlayerPhotoField } from '@/components/rival/PlayerPhotoField'
import { GLASS_INPUT } from '@/components/world/portal-auth-styles'
import { cn } from '@/lib/utils'
import { RIVAL_PICK, RIVAL_PICK_MENU } from '../rival-classes'
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
        <h3 id={id} className="text-lg font-semibold leading-6 text-portal-ink">
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
      <Label htmlFor="rival-nombre" className="text-sm font-semibold text-portal-ink">
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
        className={cn(
          GLASS_INPUT,
          'aria-invalid:border-portal-bad aria-invalid:focus-visible:outline-portal-bad',
        )}
        aria-invalid={message ? true : undefined}
        aria-describedby={message ? 'rival-nombre-ayuda rival-nombre-error' : 'rival-nombre-ayuda'}
      />
      <p id="rival-nombre-ayuda" className="rv-small">
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
          <Label htmlFor="rival-posicion-select" className="text-sm font-semibold text-portal-ink">
            Tu posición
          </Label>
          <SelectMenu
            id="rival-posicion-select"
            name="position"
            value={position}
            onChange={onPositionChange}
            options={POSITION_OPTIONS}
            placeholder="Elegí tu posición"
            className={RIVAL_PICK}
            contentClassName={RIVAL_PICK_MENU}
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="rival-zona" className="text-sm font-semibold text-portal-ink">
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
          className={RIVAL_PICK}
          contentClassName={RIVAL_PICK_MENU}
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
