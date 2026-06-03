import { invoke as invokeCommand } from '@tauri-apps/api/core'

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: {
    invoke?: unknown
  }
}

export function invokeTauri<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!hasTauriInvoke()) {
    return Promise.reject(
      new Error(
        'Desktop runtime is not available. Run the app through Tauri before importing or saving history.',
      ),
    )
  }

  return invokeCommand<T>(command, args)
}

export function hasTauriInvoke() {
  if (typeof window === 'undefined') {
    return false
  }

  return typeof (window as TauriWindow).__TAURI_INTERNALS__?.invoke === 'function'
}
