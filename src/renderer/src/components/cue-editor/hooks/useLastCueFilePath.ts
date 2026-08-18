import type { NodeCueKind, NodeCueMode } from '../../../../../photonics-dmx/cues/types/nodeCueTypes'

const STORAGE_PREFIX = 'photonics.nodeCueEditor'
const LAST_FILE_STORAGE_KEY = `${STORAGE_PREFIX}.lastFilePath`
const LAST_ACTIVE_MODE_KEY = `${STORAGE_PREFIX}.lastActiveMode`

export type EditorModeKey =
  | 'yarg-cue'
  | 'audio-cue'
  | 'rb3-cue'
  | 'yarg-motion-cue'
  | 'rb3-motion-cue'
  | 'audio-motion-cue'
  | 'yarg-effect'
  | 'audio-effect'

/**
 * The storage key for one editor context. Effects exist only for yarg and audio, and rb3 cues
 * reference the YARG effects, so rb3 resolves to the yarg effect key.
 */
export const modeKeyFor = (
  mode: NodeCueMode,
  kind: NodeCueKind,
  isEffect: boolean,
): EditorModeKey => {
  if (isEffect) return mode === 'audio' ? 'audio-effect' : 'yarg-effect'
  if (mode === 'rb3') return kind === 'motion' ? 'rb3-motion-cue' : 'rb3-cue'
  if (mode === 'audio') return kind === 'motion' ? 'audio-motion-cue' : 'audio-cue'
  return kind === 'motion' ? 'yarg-motion-cue' : 'yarg-cue'
}

/**
 * The cue-file mode a stored key belongs to. Stored paths are checked against this before being
 * restored, so a path left behind by another platform is ignored rather than loaded.
 */
export const fileModeForModeKey = (modeKey: EditorModeKey): NodeCueMode =>
  modeKey.startsWith('rb3') ? 'rb3' : modeKey.startsWith('audio') ? 'audio' : 'yarg'

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
      raw !== 'rb3-cue' &&
      raw !== 'yarg-motion-cue' &&
      raw !== 'audio-motion-cue' &&
      raw !== 'rb3-motion-cue' &&
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
