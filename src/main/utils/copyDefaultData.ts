import { app } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'

const COPYFILE_EXCL = fs.constants.COPYFILE_EXCL

/**
 * Copies bundled default cues/effects into the app data directory.
 * JSON: writes when the destination is missing. If it exists and `bundled` is true, overwrites when
 * the bundled `cueVersion` is greater than the on-disk value (missing `cueVersion` is treated as 0).
 * JSON with `bundled` not true is never overwritten. Non-JSON files copy only when missing.
 * In development, source is resources/defaults in the project;
 * in production, source is process.resourcesPath/defaults.
 */
export async function copyDefaultData(resourcesPath: string, appDataBase: string): Promise<void> {
  const sourceDir = app.isPackaged
    ? path.join(resourcesPath, 'defaults')
    : path.join(app.getAppPath(), 'resources', 'defaults')

  try {
    await fs.access(sourceDir)
  } catch {
    return
  }

  await copyDirectory(sourceDir, appDataBase)
}

async function copyDirectory(sourceDir: string, destBase: string): Promise<void> {
  const entries = await fs.readdir(sourceDir, { withFileTypes: true })

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name)
    const destPath = path.join(destBase, entry.name)

    if (entry.isDirectory()) {
      await fs.mkdir(destPath, { recursive: true })
      await copyDirectory(sourcePath, destPath)
    } else if (entry.isFile()) {
      if (entry.name.toLowerCase().endsWith('.json')) {
        const sourceRaw = await fs.readFile(sourcePath, 'utf-8')
        const sourceObj = JSON.parse(sourceRaw) as Record<string, unknown>
        if (sourceObj.bundled !== true) sourceObj.bundled = true

        const destExists = await fs
          .access(destPath)
          .then(() => true)
          .catch(() => false)

        if (!destExists) {
          await fs.writeFile(destPath, JSON.stringify(sourceObj, null, 2), 'utf-8')
        } else {
          let destObj: Record<string, unknown>
          try {
            const destRaw = await fs.readFile(destPath, 'utf-8')
            destObj = JSON.parse(destRaw) as Record<string, unknown>
          } catch {
            continue
          }
          if (destObj.bundled !== true) {
            continue
          }
          const sourceVersion = typeof sourceObj.cueVersion === 'number' ? sourceObj.cueVersion : 0
          const destVersion = typeof destObj.cueVersion === 'number' ? destObj.cueVersion : 0
          if (sourceVersion > destVersion) {
            await fs.writeFile(destPath, JSON.stringify(sourceObj, null, 2), 'utf-8')
          }
        }
      } else {
        const destExists = await fs
          .access(destPath)
          .then(() => true)
          .catch(() => false)
        if (!destExists) {
          await fs.copyFile(sourcePath, destPath, COPYFILE_EXCL)
        }
      }
    }
  }
}
