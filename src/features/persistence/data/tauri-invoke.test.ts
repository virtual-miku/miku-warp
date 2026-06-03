import { describe, expect, it } from 'vitest'
import { hasTauriInvoke, invokeTauri } from './tauri-invoke'

describe('tauri invoke adapter', () => {
  it('reports unavailable desktop runtime outside Tauri', async () => {
    expect(hasTauriInvoke()).toBe(false)

    await expect(invokeTauri('missing_command')).rejects.toThrow(
      'Desktop runtime is not available',
    )
  })
})
