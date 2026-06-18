import { open } from '@tauri-apps/plugin-dialog'

export const DEFAULT_GAME_INSTALL_PATH =
  'C:\\Program Files\\HoYoPlay\\games\\Star Rail Games'

const STORAGE_KEY = 'warp-tracker.game-install-path'

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
  const selectedPath = await open({
    defaultPath: currentPath,
    directory: true,
    multiple: false,
    title: 'Select Honkai: Star Rail game folder',
  })

  return typeof selectedPath === 'string' ? selectedPath : undefined
}
