import { app } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'

const COPYFILE_EXCL = fs.constants.COPYFILE_EXCL

/**
 * Copies bundled default cues/effects into the app data directory.
 * Only copies files that do not already exist (never overwrites user data).
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
      const destExists = await fs
        .access(destPath)
        .then(() => true)
        .catch(() => false)
      if (destExists) continue

      if (entry.name.toLowerCase().endsWith('.json')) {
        const raw = await fs.readFile(sourcePath, 'utf-8')
        const obj = JSON.parse(raw) as Record<string, unknown>
        if (obj.bundled !== true) obj.bundled = true
        await fs.writeFile(destPath, JSON.stringify(obj, null, 2), 'utf-8')
      } else {
        await fs.copyFile(sourcePath, destPath, COPYFILE_EXCL)
      }
    }
  }
}
