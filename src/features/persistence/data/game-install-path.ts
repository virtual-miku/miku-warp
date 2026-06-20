import { open } from '@tauri-apps/plugin-dialog'
import {
  createDesktopRuntimeUnavailableError,
  hasTauriInvoke,
  invokeTauri,
} from './tauri-invoke'

export const DEFAULT_GAME_INSTALL_PATH =
  'C:\\Program Files\\HoYoPlay\\games\\Star Rail Games'

const STORAGE_KEY = 'warp-tracker.game-install-path'

export type GameInstallPathCandidate = {
  path: string
  source: string
}

export type FindGameInstallPathsResult = {
  candidates: GameInstallPathCandidate[]
  selectedPath?: string
  detail: string
}

export type ValidateGameInstallPathResult = {
  isValid: boolean
  path: string
  detail: string
}

export function loadGameInstallPath() {
  try {
    return window.localStorage.getItem(STORAGE_KEY)?.trim() || DEFAULT_GAME_INSTALL_PATH
  } catch {
    return DEFAULT_GAME_INSTALL_PATH
  }
}

export function saveGameInstallPath(path: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, path)
  } catch {
    // A blocked local store should not prevent the current session from using the path.
  }
}

export async function selectGameInstallPath(currentPath: string) {
  if (!hasTauriInvoke()) {
    throw createDesktopRuntimeUnavailableError('Folder browsing')
  }

  const selectedPath = await open({
    defaultPath: currentPath,
    directory: true,
    multiple: false,
    title: 'Select Honkai: Star Rail game folder',
  })

  return typeof selectedPath === 'string' ? selectedPath : undefined
}

export function findGameInstallPaths(currentPath: string) {
  return invokeTauri<FindGameInstallPathsResult>('find_game_install_paths', {
    input: { currentPath },
  })
}

export function validateGameInstallPath(gamePath: string) {
  return invokeTauri<ValidateGameInstallPathResult>(
    'validate_game_install_path',
    {
      input: { gamePath },
    },
  )
}
