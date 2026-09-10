import { IpcMain, dialog } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import { ControllerManager } from '../controllers/ControllerManager'
import { EffectMode, EffectFile } from '../../photonics-dmx/cues/types/nodeCueTypes'
import { validateEffectFile } from '../../photonics-dmx/cues/node/schema/validation'
import { ipcError } from './ipcResult'
import { EFFECTS } from '../../shared/ipcChannels'
import { createLogger } from '../../shared/logger'
import { handleInvoke } from './handleInvoke'

const log = createLogger('effect-handlers')

const ensureLoader = (controllerManager: ControllerManager) => {
  const loader = controllerManager.getEffectLoader()
  if (!loader) {
    throw new Error('Effect loader is not initialized.')
  }
  return loader
}

interface SavePayload {
  mode: EffectMode
  filename: string
  content: EffectFile
}

interface ValidatePayload {
  path?: string
  content?: EffectFile
}

export function setupEffectHandlers(ipcMain: IpcMain, controllerManager: ControllerManager): void {
  handleInvoke(ipcMain, EFFECTS.LIST, log, async () => {
    const loader = ensureLoader(controllerManager)
    return loader.getSummary()
  })

  handleInvoke(ipcMain, EFFECTS.RELOAD, log, async () => {
    const loader = ensureLoader(controllerManager)
    return loader.reload()
  })

  handleInvoke(ipcMain, EFFECTS.READ, log, async (_event, filePath: string) => {
    const loader = ensureLoader(controllerManager)
    return loader.readFile(filePath)
  })

  handleInvoke(ipcMain, EFFECTS.SAVE, log, async (_event, payload: SavePayload) => {
    const loader = ensureLoader(controllerManager)
    return loader.saveFile(payload.mode, payload.filename, payload.content)
  })

  handleInvoke(ipcMain, EFFECTS.DELETE, log, async (_event, filePath: string) => {
    const loader = ensureLoader(controllerManager)
    return loader.deleteFile(filePath)
  })

  handleInvoke(ipcMain, EFFECTS.VALIDATE, log, async (_event, payload: ValidatePayload) => {
    const loader = ensureLoader(controllerManager)

    if (payload.content) {
      return validateEffectFile(payload.content)
    }

    if (payload.path) {
      try {
        const file = await loader.readFile(payload.path)
        // readFile rejects invalid JSON/schema; still run the canonical validator for parity with the content branch.
        return validateEffectFile(file)
      } catch (error) {
        return {
          valid: false,
          errors: [ipcError(error).error],
        }
      }
    }

    throw new Error('Validation payload must include either content or path.')
  })

  handleInvoke(ipcMain, EFFECTS.IMPORT_PICK, log, async (_event, preferredMode?: EffectMode) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Effect Files', extensions: ['json'] }],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: 'User cancelled import.' }
    }

    const sourcePath = result.filePaths[0]
    const raw = await fs.readFile(sourcePath, 'utf-8')
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return { success: false, error: 'That file is not valid JSON.' }
    }
    const validation = validateEffectFile(parsed)
    if (!validation.valid || !validation.data) {
      return { success: false, error: validation.errors.join(', ') || 'Invalid effect file' }
    }

    if (!validation.mode) {
      return { success: false, error: 'Effect file has no mode specified.' }
    }

    const mode = preferredMode ?? validation.mode
    return {
      success: true,
      sourceBasename: path.basename(sourcePath),
      mode,
      content: validation.data,
    }
  })

  handleInvoke(ipcMain, EFFECTS.EXPORT, log, async (_event, filePath: string) => {
    const loader = ensureLoader(controllerManager)
    // Resolve through the loader so the source path used for fs.copyFile is the same
    // rooted path the loader vetted; never copy from the raw IPC string.
    const resolvedSource = loader.resolveEffectFilePathForIpc(filePath)
    await loader.readFile(resolvedSource) // ensure file is valid/exists

    const result = await dialog.showSaveDialog({
      title: 'Export Effect File',
      defaultPath: path.basename(resolvedSource),
      filters: [{ name: 'Effect Files', extensions: ['json'] }],
    })

    if (result.canceled || !result.filePath) {
      return { success: false, error: 'User cancelled export.' }
    }

    await fs.copyFile(resolvedSource, result.filePath)
    return { success: true, path: result.filePath }
  })
}
