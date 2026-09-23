import { IpcMain, dialog } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import { ControllerManager } from '../controllers/ControllerManager'
import { sendToAllWindows } from '../utils/windowUtils'
import { NodeCueMode, NodeCueFile, NodeCueKind } from '../../photonics-dmx/cues/types/nodeCueTypes'
import { validateNodeCueFile } from '../../photonics-dmx/cues/node/schema/validation'
import { cueDomainBinding, reconcileAndApplyGroups } from '../controllers/cueDomainBindings'
import { validationRefusal } from './ipcResult'
import { NODE_CUES, RENDERER_RECEIVE } from '../../shared/ipcChannels'
import { createLogger } from '../../shared/logger'
import { handleInvoke } from './handleInvoke'

const log = createLogger('node-cue-handlers')

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

async function persistGroupEnableAfterNodeCueSave(
  controllerManager: ControllerManager,
  mode: NodeCueMode,
  groupId: string,
): Promise<void> {
  const config = controllerManager.getConfig()
  const domain = mode === 'yarg' ? 'yarg' : mode === 'rb3' ? 'rb3' : 'audio'

  // Saving a group opts it in: seed it into the enabled set, then reconcile against the registry so
  // other newly-registered groups are auto-enabled, deregistered ids are dropped, and the known
  // baseline is refreshed.
  await reconcileAndApplyGroups(cueDomainBinding(domain), config, [groupId])

  if (domain === 'audio') {
    controllerManager.refreshAudioCueSelection()
    sendToAllWindows(RENDERER_RECEIVE.AUDIO_CUE_GROUPS_CHANGED, undefined)
  }
}

export function setupNodeCueHandlers(ipcMain: IpcMain, controllerManager: ControllerManager): void {
  handleInvoke(ipcMain, NODE_CUES.SET_DEBUG, log, async (_event, enabled: boolean) => {
    const loader = ensureLoader(controllerManager)
    loader.setDebugEnabled(Boolean(enabled))
    return { success: true, enabled: loader.isDebugEnabled() }
  })

  handleInvoke(ipcMain, NODE_CUES.LIST, log, async () => {
    const loader = ensureLoader(controllerManager)
    return loader.getSummary()
  })

  handleInvoke(ipcMain, NODE_CUES.RELOAD, log, async () => {
    const loader = ensureLoader(controllerManager)
    return loader.reload()
  })

  handleInvoke(ipcMain, NODE_CUES.READ, log, async (_event, filePath: string) => {
    const loader = ensureLoader(controllerManager)
    return loader.readFile(filePath)
  })

  handleInvoke(ipcMain, NODE_CUES.SAVE, log, async (_event, payload: SavePayload) => {
    const loader = ensureLoader(controllerManager)
    const result = await loader.saveFile(payload.mode, payload.filename, payload.content)
    await persistGroupEnableAfterNodeCueSave(
      controllerManager,
      payload.mode,
      payload.content.group.id,
    )
    return result
  })

  handleInvoke(ipcMain, NODE_CUES.DELETE, log, async (_event, filePath: string) => {
    const loader = ensureLoader(controllerManager)
    return loader.deleteFile(filePath)
  })

  handleInvoke(ipcMain, NODE_CUES.VALIDATE, log, async (_event, payload: ValidatePayload) => {
    try {
      const loader = ensureLoader(controllerManager)

      if (payload.content) {
        return validateNodeCueFile(payload.content)
      }

      if (payload.path) {
        // readFile rejects invalid JSON or schema, and the canonical validator runs on both
        // branches.
        return validateNodeCueFile(await loader.readFile(payload.path))
      }

      throw new Error('Validation payload must include either content or path.')
    } catch (error) {
      return validationRefusal(error)
    }
  })

  handleInvoke(
    ipcMain,
    NODE_CUES.GET_CUE_TYPES,
    log,
    async (_event, payload: { mode: NodeCueMode; kind?: NodeCueKind }) => {
      const loader = ensureLoader(controllerManager)
      return loader.getAvailableCueTypes(payload.mode, payload.kind)
    },
  )

  handleInvoke(ipcMain, NODE_CUES.IMPORT_PICK, log, async (_event, preferredMode?: NodeCueMode) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Node Cue Files', extensions: ['json'] }],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: 'User cancelled import.', cancelled: true }
    }

    const sourcePath = result.filePaths[0]
    const raw = await fs.readFile(sourcePath, 'utf-8')
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return { success: false, error: 'That file is not valid JSON.' }
    }
    const validation = validateNodeCueFile(parsed)
    if (!validation.valid) {
      return { success: false, error: validation.errors.join(', ') }
    }

    const mode = preferredMode ?? validation.mode
    return {
      success: true,
      sourceBasename: path.basename(sourcePath),
      mode,
      content: validation.data,
    }
  })

  handleInvoke(ipcMain, NODE_CUES.EXPORT, log, async (_event, filePath: string) => {
    const loader = ensureLoader(controllerManager)
    // Resolve through the loader so the source path used for fs.copyFile is the same
    // rooted path the loader vetted; never copy from the raw IPC string.
    const resolvedSource = loader.resolveCueFilePathForIpc(filePath)
    await loader.readFile(resolvedSource) // ensure file is valid/exists

    const result = await dialog.showSaveDialog({
      title: 'Export Node Cue File',
      defaultPath: path.basename(resolvedSource),
      filters: [{ name: 'Node Cue Files', extensions: ['json'] }],
    })

    if (result.canceled || !result.filePath) {
      return { success: false, error: 'User cancelled export.', cancelled: true }
    }

    await fs.copyFile(resolvedSource, result.filePath)
    return { success: true, path: result.filePath }
  })
}
