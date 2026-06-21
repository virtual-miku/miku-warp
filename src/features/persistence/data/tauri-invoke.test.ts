import { describe, expect, it } from 'vitest'
import {
  getDesktopRuntimeUnavailableMessage,
  hasTauriInvoke,
  invokeTauri,
} from './tauri-invoke'

describe('tauri invoke adapter', () => {
  it('reports unavailable desktop runtime outside Tauri', async () => {
    expect(hasTauriInvoke()).toBe(false)

    await expect(invokeTauri('missing_command')).rejects.toThrow(
      getDesktopRuntimeUnavailableMessage(),
    )
  })
})
