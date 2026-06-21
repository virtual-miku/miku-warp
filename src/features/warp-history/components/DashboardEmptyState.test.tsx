import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DashboardEmptyState } from './DashboardEmptyState'

describe('DashboardEmptyState', () => {
  it('guides the user to import history when the account has no pulls', () => {
    const html = renderToStaticMarkup(
      <DashboardEmptyState isLoading={false} onOpenImport={() => undefined} />,
    )

    expect(html).toContain('No warp history yet')
    expect(html).toContain('Import your game history first')
    expect(html).toContain('Import history')
  })

  it('disables the import action while history is still being checked', () => {
    const html = renderToStaticMarkup(
      <DashboardEmptyState isLoading={true} onOpenImport={() => undefined} />,
    )

    expect(html).toContain('Checking warp history')
    expect(html).toContain('disabled=""')
  })
})
