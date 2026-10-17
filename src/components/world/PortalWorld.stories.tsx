import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, waitFor, within } from 'storybook/test'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PortalWorld } from './PortalWorld'

/**
 * Los tokens del portal se prenden a nivel <html> cuando la página trae el marcador, así
 * que esta story mide VALORES COMPUTADOS en el navegador, no el texto del CSS. Corre en
 * claro y en oscuro según el tema del runner (`STORYBOOK_THEME=dark`).
 */
const meta = {
  title: 'Design System/PortalWorld',
  component: PortalWorld,
} satisfies Meta<typeof PortalWorld>

export default meta
type Story = StoryObj<typeof meta>

// Color CSS → [r, g, b] en sRGB, resuelto por el navegador (el `/80` del hover sale como
// `oklab(… / 0.8)`). Si trae alfa, lo compone sobre `under`.
const rgb = (css: string, under = [255, 255, 255]) => {
  const ctx = document.createElement('canvas').getContext('2d')!
  ctx.fillStyle = css
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
  return [r, g, b].map((c, i) => c * (a / 255) + under[i] * (1 - a / 255))
}

// Contraste WCAG 2.x. Copia mínima de `contrastRatio` (admin/canchas/pricing-grid/cell-utils.ts):
// `@/components` no puede importar de `@/app`.
const luminance = (color: number[]) => {
  const [r, g, b] = color.map((v) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: number[], b: number[]) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

export const Tokens: Story = {
  args: {
    // No hay `Card` en ui/: se arma a mano, como en el resto del repo.
    children: (
      <div
        data-testid="portal-card"
        className="w-80 space-y-3 rounded-lg border bg-card p-4 text-card-foreground"
      >
        <Label htmlFor="portal-email">Email</Label>
        <Input id="portal-email" type="email" />
        <Button className="w-full">Reservar</Button>
        <p data-testid="caption" className="rounded-md bg-muted p-2 text-sm text-muted-foreground">
          Pagás en el complejo
        </p>
        <div className="flex gap-2" aria-hidden>
          <i data-testid="secondary" className="size-6 rounded-sm border bg-secondary" />
          <i data-testid="muted" className="size-6 rounded-sm border bg-muted" />
          <i data-testid="accent" className="size-6 rounded-sm border bg-accent" />
        </div>
      </div>
    ),
  },
  play: async ({ canvasElement, globals }) => {
    const dark = globals['theme'] === 'dark'
    const doc = canvasElement.ownerDocument
    const { documentElement, body } = doc
    const canvas = within(canvasElement)
    const style = (el: Element) => getComputedStyle(el)
    const input = canvas.getByLabelText('Email')

    // Borde del campo (WCAG 1.4.11): 3:1 contra su relleno y contra el fondo de la página. Con
    // alfa (hover) se compone sobre el relleno, que es lo que se ve.
    const expectFieldBorder = async () => {
      const fill = rgb(style(input).backgroundColor)
      const border = rgb(style(input).borderTopColor, fill)
      for (const surface of [fill, rgb(style(body).backgroundColor)]) {
        await expect(contrast(border, surface)).toBeGreaterThanOrEqual(3)
      }
    }

    // Sin transiciones en curso: un color a mitad de camino no es el que se ve en reposo (y
    // difiere como string del final, así que un `not.toBe(reposo)` se deja engañar).
    const settled = () => expect(doc.getAnimations()).toHaveLength(0)

    // El preview prende el tema en un efecto y el Button transiciona el color: se espera.
    await waitFor(async () => {
      await expect(documentElement.classList.contains('dark')).toBe(dark)
      await settled()
      const card = canvas.getByTestId('portal-card')
      const page = rgb(style(body).backgroundColor)

      // Valores: en claro el portal los fija; en oscuro hereda los del panel y los cuida el hash.
      await expect(style(body).backgroundColor).toBe(dark ? 'rgb(3, 7, 17)' : 'rgb(255, 255, 255)')
      await expect(style(card).borderTopLeftRadius).toBe('12px')
      await expect(style(canvas.getByRole('button', { name: 'Reservar' })).backgroundColor).toBe(
        dark ? 'rgb(16, 183, 127)' : 'rgb(4, 119, 86)',
      )
      if (!dark) {
        await expect(style(card).borderTopColor).toBe('rgb(226, 232, 240)')
        for (const token of ['secondary', 'muted', 'accent']) {
          await expect(style(canvas.getByTestId(token)).backgroundColor).toBe('rgb(241, 245, 249)')
        }
      }
      // El marcador no ocupa lugar en el layout. (`toBe` y no `toHaveStyle`: este no imprime
      // el valor recibido y da el mismo mensaje para un nodo huérfano que para uno equivocado.)
      const marker = card.closest('[data-world="portal"]')
      await expect(marker && style(marker).display).toBe('contents')

      // Umbrales de contraste, en los dos temas. Texto secundario: 4,5:1 sobre bg-muted y sobre
      // el fondo. Borde del campo y anillo de foco (--ring): 3:1. El navegador resuelve --ring
      // en un <i> con `text-ring`.
      const caption = style(canvas.getByTestId('caption'))
      for (const surface of [rgb(caption.backgroundColor), page]) {
        await expect(contrast(rgb(caption.color), surface)).toBeGreaterThanOrEqual(4.5)
      }
      await expectFieldBorder()
      const probe = Object.assign(doc.createElement('i'), { className: 'text-ring' })
      body.append(probe)
      const ring = rgb(style(probe).color)
      probe.remove()
      for (const surface of [rgb(style(input).backgroundColor), page]) {
        await expect(contrast(ring, surface)).toBeGreaterThanOrEqual(3)
      }
    })

    // Hover: la página no puede forzar `:hover`. El `userEvent` de storybook/test es sintético y el
    // de Vitest (`@vitest/browser/context`) tarda de 8 s a más de 30 s en su primer comando con las
    // ~280 stories corriendo en paralelo. Se copian las reglas que usan `:hover` con un atributo.
    const hoverRules = (rules: CSSRuleList): string[] =>
      [...rules].flatMap((rule) => {
        if (rule instanceof CSSStyleRule)
          return rule.cssText.includes(':hover') ? [rule.cssText] : []
        return rule instanceof CSSGroupingRule ? hoverRules(rule.cssRules) : []
      })
    const resting = style(input).borderTopColor
    const emulation = doc.createElement('style')
    emulation.textContent = [...doc.styleSheets]
      .flatMap((sheet) => hoverRules(sheet.cssRules))
      .join('\n')
      .replaceAll(':hover', '[data-hover]')
    doc.head.append(emulation)
    input.setAttribute('data-hover', '')
    await waitFor(async () => {
      await settled()
      await expect(
        style(input).borderTopColor,
        'el hover no cambia el borde del Input: ¿falta hover:border-input/80 o la copia de :hover no pegó?',
      ).not.toBe(resting)
      await expectFieldBorder()
    })
    input.removeAttribute('data-hover')
    emulation.remove()
  },
}

/**
 * Fondo del cascarón: `PortalFrame` pinta `.player-shell-bg` (La Previa, la cancha) en todo el
 * portal. Con el marcador en la página, una regla de globals.css lo cambia por el fondo liso del
 * mundo; sin él, la cancha sigue. Se mide el fondo que resuelve el navegador (imagen, anclaje y
 * color), no el texto del CSS. La forma de la regla la cuida `portal-shell-bg.test.ts`.
 */
const shell = (world: boolean) => (
  <div data-testid="shell" className="player-shell-bg min-h-40 p-4">
    {world ? (
      <PortalWorld>
        <p>Reservar</p>
      </PortalWorld>
    ) : (
      <p>Mis reservas</p>
    )}
  </div>
)

export const ShellBackground: Story = {
  args: { children: null },
  render: () => shell(true),
  play: async ({ canvasElement, globals }) => {
    const dark = globals['theme'] === 'dark'
    const doc = canvasElement.ownerDocument
    const el = within(canvasElement).getByTestId('shell')
    await waitFor(async () => {
      await expect(doc.documentElement.classList.contains('dark')).toBe(dark)
      const style = getComputedStyle(el)
      await expect(style.backgroundImage).toBe('none')
      await expect(style.backgroundAttachment).toBe('scroll')
      await expect(style.backgroundColor).toBe(dark ? 'rgb(3, 7, 17)' : 'rgb(255, 255, 255)')
    })
  },
}

export const ShellBackgroundWithoutWorld: Story = {
  args: { children: null },
  render: () => shell(false),
  play: async ({ canvasElement, globals }) => {
    const dark = globals['theme'] === 'dark'
    const doc = canvasElement.ownerDocument
    const el = within(canvasElement).getByTestId('shell')
    await waitFor(async () => {
      await expect(doc.documentElement.classList.contains('dark')).toBe(dark)
      const style = getComputedStyle(el)
      await expect(style.backgroundImage).not.toBe('none')
      // Una entrada por capa de imagen ("fixed, fixed").
      await expect(style.backgroundAttachment).toContain('fixed')
      await expect(style.backgroundColor).toBe(dark ? 'rgb(2, 6, 23)' : 'rgb(236, 253, 245)')
    })
  },
}
