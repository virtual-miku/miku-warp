import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ManualItemSelection } from '../domain/manual-item-selector'
import { ManualItemSelector } from './ManualItemSelector'

const selection: ManualItemSelection = {
  bannerType: 'character_event',
  id: 'selection-1',
  item: {
    id: 'character-1306',
    itemType: 'character',
    name: 'Sparkle',
    rarity: 5,
  },
  pity: 77,
  pulledAt: '2025-07-11T09:05:03',
}

describe('ManualItemSelector', () => {
  it('shows the add action and an editable selected result', () => {
    const html = renderToStaticMarkup(
      <ManualItemSelector
        fallbackBannerType="character_event"
        onChange={vi.fn()}
        selections={[selection]}
        timeZone="system"
      />,
    )

    expect(html).toContain('Add item')
    expect(html).toContain('Edit Sparkle, pity 77')
    expect(html).toContain('>77<')
  })
})
