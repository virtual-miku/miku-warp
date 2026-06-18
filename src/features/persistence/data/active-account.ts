import type { ManualImportAccountInput } from './manual-import-save'

const STORAGE_KEY = 'warp-tracker.active-account'

export function loadActiveAccount(fallbackAccount: ManualImportAccountInput) {
  try {
    const storedValue = window.localStorage.getItem(STORAGE_KEY)

    if (!storedValue) {
      return fallbackAccount
    }

    const parsedAccount = JSON.parse(storedValue) as Partial<ManualImportAccountInput>

    if (!parsedAccount.id?.trim() || !parsedAccount.uid?.trim()) {
      return fallbackAccount
    }

    return {
      ...fallbackAccount,
      ...parsedAccount,
      id: parsedAccount.id,
      uid: parsedAccount.uid,
    }
  } catch {
    return fallbackAccount
  }
}

export function saveActiveAccount(account: ManualImportAccountInput) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(account))
  } catch {
    // Losing this preference only means the next game import has to merge again.
  }
}
