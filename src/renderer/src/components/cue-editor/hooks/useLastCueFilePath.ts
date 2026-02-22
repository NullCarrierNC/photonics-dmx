const LAST_FILE_STORAGE_KEY = 'photonics.nodeCueEditor.lastFilePath'

const getStorage = (): Storage | null => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null
  }
  return window.localStorage
}

const getStoredLastFilePath = (): string | null => {
  const storage = getStorage()
  if (!storage) {
    return null
  }
  try {
    return storage.getItem(LAST_FILE_STORAGE_KEY)
  } catch {
    return null
  }
}

const setStoredLastFilePath = (path: string): void => {
  const storage = getStorage()
  if (!storage) {
    return
  }
  try {
    storage.setItem(LAST_FILE_STORAGE_KEY, path)
  } catch {
    // Storage might be unavailable (e.g., privacy mode)
  }
}

const clearStoredLastFilePath = (): void => {
  const storage = getStorage()
  if (!storage) {
    return
  }
  try {
    storage.removeItem(LAST_FILE_STORAGE_KEY)
  } catch {
    // Storage might be unavailable
  }
}

export { clearStoredLastFilePath, getStoredLastFilePath, setStoredLastFilePath }
