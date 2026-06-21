import { invoke as invokeCommand } from '@tauri-apps/api/core'
import {
  loadLanguagePreference,
  translate,
} from '../../settings/domain/localization'

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: {
    invoke?: unknown
  }
}

export function createDesktopRuntimeUnavailableError(action: string) {
  const language = loadLanguagePreference()
  return new Error(translate(language, 'desktop.actionNeedsApp', {
    action,
    detail: translate(language, 'desktop.unavailable'),
  }))
}

export function getDesktopRuntimeUnavailableMessage() {
  const language = loadLanguagePreference()
  return translate(language, 'desktop.unavailable')
}

export function invokeTauri<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!hasTauriInvoke()) {
    return Promise.reject(
      createDesktopRuntimeUnavailableError(
        translate(loadLanguagePreference(), 'desktop.thisAction'),
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
