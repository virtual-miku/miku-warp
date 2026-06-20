import { invoke as invokeCommand } from '@tauri-apps/api/core'

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: {
    invoke?: unknown
  }
}

const DESKTOP_RUNTIME_UNAVAILABLE_MESSAGE =
  'Browser preview cannot access local files or game folders. Open Miku Warp in the desktop app, then try again.'

export function createDesktopRuntimeUnavailableError(action: string) {
  return new Error(
    `${action} needs the Miku Warp desktop app. ${DESKTOP_RUNTIME_UNAVAILABLE_MESSAGE}`,
  )
}

export function getDesktopRuntimeUnavailableMessage() {
  return DESKTOP_RUNTIME_UNAVAILABLE_MESSAGE
}

export function invokeTauri<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!hasTauriInvoke()) {
    return Promise.reject(
      createDesktopRuntimeUnavailableError('This action'),
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
