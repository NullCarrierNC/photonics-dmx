import { IpcMain, dialog } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import { ControllerManager } from '../controllers/ControllerManager'
import { NodeCueMode, NodeCueFile } from '../../photonics-dmx/cues/types/nodeCueTypes'
import { validateNodeCueFile } from '../../photonics-dmx/cues/node/schema/validation'
import { NodeExecutionEngine } from '../../photonics-dmx/cues/node/runtime/NodeExecutionEngine'
import { ipcError } from './ipcResult'
import { NODE_CUES } from '../../shared/ipcChannels'

const ensureLoader = (controllerManager: ControllerManager) => {
  const loader = controllerManager.getNodeCueLoader()
  if (!loader) {
    throw new Error('Node cue loader is not initialized.')
  }
  return loader
}

interface SavePayload {
  mode: NodeCueMode
  filename: string
  content: NodeCueFile
}

interface ValidatePayload {
  path?: string
  content?: NodeCueFile
}

export function setupNodeCueHandlers(ipcMain: IpcMain, controllerManager: ControllerManager): void {
  ipcMain.handle(NODE_CUES.SET_DEBUG, async (_event, enabled: boolean) => {
    NodeExecutionEngine.setDebugEnabled(Boolean(enabled))
    return { success: true, enabled: NodeExecutionEngine.getDebugEnabled() }
  })

  ipcMain.handle(NODE_CUES.LIST, async () => {
    const loader = ensureLoader(controllerManager)
    return loader.getSummary()
  })

  ipcMain.handle(NODE_CUES.RELOAD, async () => {
    const loader = ensureLoader(controllerManager)
    return loader.reload()
  })

  ipcMain.handle(NODE_CUES.READ, async (_event, filePath: string) => {
    const loader = ensureLoader(controllerManager)
    return loader.readFile(filePath)
  })

  ipcMain.handle(NODE_CUES.SAVE, async (_event, payload: SavePayload) => {
    const loader = ensureLoader(controllerManager)
    return loader.saveFile(payload.mode, payload.filename, payload.content)
  })

  ipcMain.handle(NODE_CUES.DELETE, async (_event, filePath: string) => {
    const loader = ensureLoader(controllerManager)
    return loader.deleteFile(filePath)
  })

  ipcMain.handle(NODE_CUES.VALIDATE, async (_event, payload: ValidatePayload) => {
    const loader = ensureLoader(controllerManager)

    if (payload.content) {
      return validateNodeCueFile(payload.content)
    }

    if (payload.path) {
      try {
        const file = await loader.readFile(payload.path)
        return {
          valid: true,
          data: file,
          errors: [],
          mode: file.mode,
        }
      } catch (error) {
        return {
          valid: false,
          errors: [ipcError(error).error],
        }
      }
    }

    throw new Error('Validation payload must include either content or path.')
  })

  ipcMain.handle(NODE_CUES.GET_CUE_TYPES, async (_event, mode: NodeCueMode) => {
    const loader = ensureLoader(controllerManager)
    return loader.getAvailableCueTypes(mode)
  })

  ipcMain.handle(NODE_CUES.IMPORT, async (_event, preferredMode?: NodeCueMode) => {
    const loader = ensureLoader(controllerManager)
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Node Cue Files', extensions: ['json'] }],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: 'User cancelled import.' }
    }

    const sourcePath = result.filePaths[0]
    const raw = await fs.readFile(sourcePath, 'utf-8')
    const parsed = JSON.parse(raw)
    const validation = validateNodeCueFile(parsed)
    if (!validation.valid) {
      return { success: false, error: validation.errors.join(', ') }
    }

    const mode = preferredMode ?? validation.mode
    const filename = path.basename(sourcePath)
    const saveResult = await loader.saveFile(mode, filename, validation.data)
    return { success: true, path: saveResult.path }
  })

  ipcMain.handle(NODE_CUES.EXPORT, async (_event, filePath: string) => {
    const loader = ensureLoader(controllerManager)
    await loader.readFile(filePath) // ensure file is valid/exists

    const result = await dialog.showSaveDialog({
      title: 'Export Node Cue File',
      defaultPath: path.basename(filePath),
      filters: [{ name: 'Node Cue Files', extensions: ['json'] }],
    })

    if (result.canceled || !result.filePath) {
      return { success: false, error: 'User cancelled export.' }
    }

    await fs.copyFile(filePath, result.filePath)
    return { success: true, path: result.filePath }
  })
}
