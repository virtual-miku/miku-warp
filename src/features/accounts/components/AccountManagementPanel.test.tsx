import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { AccountManagementPanel } from './AccountManagementPanel'

describe('AccountManagementPanel', () => {
  it('shows account delete only for inactive accounts', () => {
    const html = renderToStaticMarkup(
      <AccountManagementPanel
        accounts={[
          {
            id: 'account-active',
            uid: '800000000',
            totalPulls: 12,
          },
          {
            id: 'account-inactive',
            uid: '800000001',
            totalPulls: 3,
          },
        ]}
        activeAccountId="account-active"
        onDeleteAccount={() => undefined}
        onOpenAccount={() => undefined}
        onOpenAvatarPicker={() => undefined}
      />,
    )

    expect(html).not.toContain('Move UID 800000000 to Trash')
    expect(html).toContain('Move UID 800000001 to Trash')
  })

  it('formats the last-pull time with colon separators', () => {
    const noop = vi.fn()
    const html = renderToStaticMarkup(
      <AccountManagementPanel
        accounts={[
          {
            id: 'account-1',
            lastPullAt: '2025-07-11T09:05:03',
            totalPulls: 1,
            uid: '800000000',
          },
        ]}
        activeAccountId="account-1"
        onDeleteAccount={noop}
        onOpenAccount={noop}
        onOpenAvatarPicker={noop}
      />,
    )

    expect(html).toContain('09:05:03')
    expect(html).not.toContain('09.05.03')
  })
})
