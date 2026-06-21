import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DashboardEmptyState } from './DashboardEmptyState'
import { LocalizationProvider } from '../../settings/components/LocalizationProvider'

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

  it('renders Indonesian copy through the localization context', () => {
    const html = renderToStaticMarkup(
      <LocalizationProvider language="id">
        <DashboardEmptyState
          isLoading={false}
          onOpenImport={() => undefined}
        />
      </LocalizationProvider>,
    )

    expect(html).toContain('Belum ada riwayat warp')
    expect(html).toContain('Impor riwayat game terlebih dahulu')
    expect(html).not.toContain('No warp history yet')
  })
})
