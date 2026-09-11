import { ImageUploader } from 'turnogol'

/** El logo y la portada del complejo. El texto del recuadro vacío dice DÓNDE
 *  se va a ver la imagen: si se piden dos, las dos tienen que hacer algo
 *  visible que se pueda señalar (H067). */
export function Logo() {
  return (
    <div className="w-72">
      <ImageUploader
        preset="logo"
        value=""
        emptyLabel="Subí el logo de tu complejo"
        onUpload={async () => {}}
        onRemove={async () => {}}
      />
    </div>
  )
}
