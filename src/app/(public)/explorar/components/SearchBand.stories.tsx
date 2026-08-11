import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { cityCounts } from '@/test/fixtures/tenant'
import SearchBand from './SearchBand'

/** Vive como hero de `/explorar`, full-width — reproducimos el padding real de la página. */
const meta = {
  title: 'Player/Explorar/SearchBand',
  component: SearchBand,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/explorar' } },
  },
  args: { cities: cityCounts() },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SearchBand>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: /encontrá tu cancha/i })).toBeInTheDocument()
    await expect(canvas.getByRole('form', { name: /buscar canchas/i })).toBeInTheDocument()
  },
}
