import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AccountAvatar } from './AccountAvatar'

describe('AccountAvatar', () => {
  it('uses the anonymous contact avatar when no account avatar is selected', () => {
    const html = renderToStaticMarkup(<AccountAvatar />)

    expect(html).toContain('/icon/avatar/UI_Message_Contacts_Anonymous.png')
  })
})
