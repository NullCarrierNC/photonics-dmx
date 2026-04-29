import { spawn } from 'child_process'
import { IpcMain, app, shell } from 'electron'
import { SHELL } from '../../shared/ipcChannels'
import type { IpcErrorResult } from '../../shared/ipcTypes'
import { validateNodeScriptPath, validatePathUnderAllowedRoots } from './inputValidation'
import { ipcError, ipcSuccess } from './ipcResult'

/**
 * Set up shell-related IPC handlers
 */
export function setupShellHandlers(ipcMain: IpcMain): void {
  /**
   * Show a file in the system file explorer
   */
  ipcMain.handle(SHELL.SHOW_ITEM_IN_FOLDER, async (_event, filePath: string) => {
    const validatedPath = validatePathUnderAllowedRoots(filePath)
    if (!validatedPath.ok) {
      return ipcError(validatedPath.error)
    }
    shell.showItemInFolder(validatedPath.value)
    return ipcSuccess()
  })

  /**
   * Open a path with the default system application
   */
  ipcMain.handle(SHELL.OPEN_PATH, async (_event, filePath: string) => {
    const validatedPath = validatePathUnderAllowedRoots(filePath)
    if (!validatedPath.ok) {
      return ipcError(validatedPath.error)
    }
    const result = await shell.openPath(validatedPath.value)
    return { success: true, result } as const
  })

  /**
   * Run a Node.js script from the app's scripts directory.
   * Payload: { scriptName: string; args: string[] }
   */
  ipcMain.handle(
    SHELL.RUN_NODE_SCRIPT,
    async (_event, payload: { scriptName: string; args: string[] }) => {
      const { scriptName, args } = payload
      if (!Array.isArray(args) || !args.every((a) => typeof a === 'string')) {
        return ipcError(new Error('args must be an array of strings'))
      }
      const appPath = app.getAppPath()
      const pathCheck = validateNodeScriptPath(appPath, scriptName)
      if (!pathCheck.ok) {
        return ipcError(new Error(pathCheck.error))
      }
      const scriptPath = pathCheck.value
      return new Promise<{ success: true; stdout: string; stderr: string } | IpcErrorResult>(
        (resolve) => {
          const proc = spawn('node', [scriptPath, ...args])
          let stdout = ''
          let stderr = ''
          proc.stdout?.on('data', (d: Buffer) => {
            stdout += d.toString()
          })
          proc.stderr?.on('data', (d: Buffer) => {
            stderr += d.toString()
          })
          proc.on('close', (code) => {
            if (code === 0) {
              resolve({ success: true, stdout, stderr })
            } else {
              resolve(ipcError(new Error(stderr.trim() || `Process exited with code ${code}`)))
            }
          })
          proc.on('error', (err) => resolve(ipcError(err)))
        },
      )
    },
  )
}
