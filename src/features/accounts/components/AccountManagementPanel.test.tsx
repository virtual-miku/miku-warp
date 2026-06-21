import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
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
})
