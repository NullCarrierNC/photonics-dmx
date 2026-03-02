import { spawn } from 'child_process'
import { IpcMain, app, shell } from 'electron'
import path from 'path'
import { SHELL } from '../../shared/ipcChannels'
import { validatePathUnderAllowedRoots } from './inputValidation'

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
      return validatedPath.error
    }
    shell.showItemInFolder(validatedPath.value)
    return ''
  })

  /**
   * Open a path with the default system application
   */
  ipcMain.handle(SHELL.OPEN_PATH, async (_event, filePath: string) => {
    const validatedPath = validatePathUnderAllowedRoots(filePath)
    if (!validatedPath.ok) {
      return validatedPath.error
    }
    return shell.openPath(validatedPath.value)
  })

  /**
   * Run a Node.js script from the app's scripts directory.
   * Payload: { scriptName: string; args: string[] }
   * Returns: { stdout: string; stderr: string } on success; rejects on non-zero exit.
   */
  ipcMain.handle(
    SHELL.RUN_NODE_SCRIPT,
    async (
      _event,
      payload: { scriptName: string; args: string[] },
    ): Promise<{ stdout: string; stderr: string }> => {
      const { scriptName, args } = payload
      const appPath = app.getAppPath()
      const scriptPath = path.join(appPath, 'scripts', scriptName)
      const resolved = path.resolve(scriptPath)
      if (!resolved.startsWith(path.resolve(appPath))) {
        throw new Error('Script path must be under app scripts directory')
      }
      return new Promise((resolve, reject) => {
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
            resolve({ stdout, stderr })
          } else {
            reject(new Error(stderr || `exit ${code}`))
          }
        })
        proc.on('error', (err) => reject(err))
      })
    },
  )
}
