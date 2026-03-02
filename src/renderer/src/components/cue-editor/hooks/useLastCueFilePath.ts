const STORAGE_PREFIX = 'photonics.nodeCueEditor'
const LAST_FILE_STORAGE_KEY = `${STORAGE_PREFIX}.lastFilePath`
const LAST_ACTIVE_MODE_KEY = `${STORAGE_PREFIX}.lastActiveMode`

export type EditorModeKey = 'yarg-cue' | 'audio-cue' | 'yarg-effect' | 'audio-effect'

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

const pathKeyForMode = (modeKey: EditorModeKey): string =>
  `${STORAGE_PREFIX}.lastFilePath.${modeKey}`

const itemIdKeyForMode = (modeKey: EditorModeKey): string =>
  `${STORAGE_PREFIX}.lastItemId.${modeKey}`

const getLastFilePathForMode = (modeKey: EditorModeKey): string | null => {
  const storage = getStorage()
  if (!storage) return null
  try {
    return storage.getItem(pathKeyForMode(modeKey))
  } catch {
    return null
  }
}

const setLastFilePathForMode = (modeKey: EditorModeKey, path: string): void => {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.setItem(pathKeyForMode(modeKey), path)
  } catch {
    // Storage might be unavailable
  }
}

const clearLastFilePathForMode = (modeKey: EditorModeKey): void => {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.removeItem(pathKeyForMode(modeKey))
  } catch {
    // Storage might be unavailable
  }
}

const getLastItemIdForMode = (modeKey: EditorModeKey): string | null => {
  const storage = getStorage()
  if (!storage) return null
  try {
    return storage.getItem(itemIdKeyForMode(modeKey))
  } catch {
    return null
  }
}

const setLastItemIdForMode = (modeKey: EditorModeKey, itemId: string): void => {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.setItem(itemIdKeyForMode(modeKey), itemId)
  } catch {
    // Storage might be unavailable
  }
}

const getLastActiveMode = (): EditorModeKey | null => {
  const storage = getStorage()
  if (!storage) return null
  try {
    const raw = storage.getItem(LAST_ACTIVE_MODE_KEY)
    if (
      raw !== 'yarg-cue' &&
      raw !== 'audio-cue' &&
      raw !== 'yarg-effect' &&
      raw !== 'audio-effect'
    )
      return null
    return raw
  } catch {
    return null
  }
}

const setLastActiveMode = (modeKey: EditorModeKey): void => {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.setItem(LAST_ACTIVE_MODE_KEY, modeKey)
  } catch {
    // Storage might be unavailable
  }
}

export {
  clearLastFilePathForMode,
  clearStoredLastFilePath,
  getLastActiveMode,
  getLastFilePathForMode,
  getLastItemIdForMode,
  getStoredLastFilePath,
  setLastActiveMode,
  setLastFilePathForMode,
  setLastItemIdForMode,
  setStoredLastFilePath,
}
