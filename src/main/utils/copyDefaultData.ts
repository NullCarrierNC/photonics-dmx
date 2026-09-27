import { app } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import { createLogger } from '../../shared/logger'
import { isPlainObject } from '../ipc/validation/primitives'
import { writeFileAtomic } from '../../photonics-dmx/helpers/atomicFileWrite'

const log = createLogger('copyDefaultData')

const COPYFILE_EXCL = fs.constants.COPYFILE_EXCL

/**
 * Copies bundled default cues/effects into the app data directory.
 * JSON: writes when the destination is missing. If it exists and `bundled` is true, overwrites when
 * the bundled `cueVersion` is greater than the on-disk value (missing `cueVersion` is treated as 0)
 * and keeps a copy of the file it replaces. JSON with `bundled` not true is never overwritten.
 * Non-JSON files copy only when missing. A seeded JSON file this build does not ship is set aside in
 * the folder it was seeded into, see retireUnshippedFiles.
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

/**
 * Writes a seeded JSON file whole or not at all. A truncated file would parse-fail on the next
 * launch and be skipped by the guard below every time after that, leaving the cue permanently dead.
 */
async function writeJsonAtomic(destPath: string, data: Record<string, unknown>): Promise<void> {
  await writeFileAtomic(destPath, JSON.stringify(data, null, 2))
}

/**
 * Rename a file that holds no JSON object out of the way, keeping a timestamped copy.
 *
 * The same shape ConfigFile uses when it recovers a corrupt config: the bytes are kept, so a file
 * the user had edited is recoverable rather than gone.
 */
async function quarantineCorruptFile(filePath: string): Promise<void> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const asideName = `${filePath}.corrupt-${stamp}`
  try {
    await fs.rename(filePath, asideName)
    log.error(`Seeded file ${filePath} held no JSON object, kept as ${asideName} and seeded again`)
  } catch (err) {
    log.error(`Could not move the unparsable ${filePath} aside, seeding over it:`, err)
  }
}

/**
 * Copy a seeded file aside before a newer shipped version replaces it, named
 * `<name>.v<version>-<time>`. A file edited by hand still carries the shipped marker, and the copy
 * keeps those edits. False when the copy could not be made, and the file then stays at its version.
 */
async function keepReplacedFile(filePath: string, version: number): Promise<boolean> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const keptName = `${filePath}.v${version}-${stamp}`
  try {
    await fs.copyFile(filePath, keptName, COPYFILE_EXCL)
    log.info(`Kept ${filePath} as ${keptName} before seeding a newer version`)
    return true
  } catch (err) {
    log.error(`Could not keep a copy of ${filePath}, leaving it at version ${version}:`, err)
    return false
  }
}

/**
 * Set aside each seeded JSON file in `destDir` that the build does not ship, named
 * `<name>.retired-<time>`. Only files still carrying the shipped marker go, so a file the user has
 * made theirs stays, and the copy keeps any hand edits to one that has not.
 */
async function retireUnshippedFiles(destDir: string, shipped: ReadonlySet<string>): Promise<void> {
  const entries = await fs.readdir(destDir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const name = entry.name
    if (!entry.isFile() || !name.toLowerCase().endsWith('.json') || shipped.has(name)) continue
    const filePath = path.join(destDir, name)
    let data: unknown
    try {
      data = JSON.parse(await fs.readFile(filePath, 'utf-8'))
    } catch {
      continue
    }
    if (
      typeof data !== 'object' ||
      data === null ||
      !('bundled' in data) ||
      data.bundled !== true
    ) {
      continue
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const retiredName = `${filePath}.retired-${stamp}`
    try {
      await fs.rename(filePath, retiredName)
      log.info(`Retired ${filePath}, which this build no longer ships, as ${retiredName}`)
    } catch (err) {
      log.error(`Could not retire ${filePath}, which this build no longer ships:`, err)
    }
  }
}

async function copyDirectory(sourceDir: string, destBase: string): Promise<void> {
  const entries = await fs.readdir(sourceDir, { withFileTypes: true })
  const shippedJson = new Set(
    entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
      .map((entry) => entry.name),
  )

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name)
    const destPath = path.join(destBase, entry.name)

    if (entry.isDirectory()) {
      await fs.mkdir(destPath, { recursive: true })
      await copyDirectory(sourcePath, destPath)
    } else if (entry.isFile()) {
      if (entry.name.toLowerCase().endsWith('.json')) {
        let sourceBody: unknown
        try {
          const sourceRaw = await fs.readFile(sourcePath, 'utf-8')
          sourceBody = JSON.parse(sourceRaw)
        } catch (error) {
          // One unreadable bundled file must not stop the rest from being seeded, which is what
          // an unguarded parse here did: it failed the whole controller init and left the engine
          // down rather than short one cue library.
          log.error(`Skipping unreadable bundled file ${sourcePath}:`, error)
          continue
        }
        if (!isPlainObject(sourceBody)) {
          log.error(`Skipping bundled file ${sourcePath}: its body is not a JSON object`)
          continue
        }
        const sourceObj = sourceBody
        if (sourceObj.bundled !== true) sourceObj.bundled = true

        const destExists = await fs
          .access(destPath)
          .then(() => true)
          .catch(() => false)

        if (!destExists) {
          await writeJsonAtomic(destPath, sourceObj)
        } else {
          let destBody: unknown
          try {
            const destRaw = await fs.readFile(destPath, 'utf-8')
            destBody = JSON.parse(destRaw)
          } catch (err) {
            // Unreadable is a different problem from unparsable. A permissions or IO failure will
            // fail the rewrite too, so leave it and say so.
            if ((err as NodeJS.ErrnoException)?.code) {
              log.error(`Cannot read seeded file ${destPath}, leaving it alone:`, err)
              continue
            }
            // Corrupt content. Move it aside and seed again, rather than skipping it on every
            // launch from here on, which left the cue dead for the life of the install. Kept
            // rather than overwritten, because the ownership marker is inside the body that would
            // not parse, so there is no telling whether the user had made it theirs.
            await quarantineCorruptFile(destPath)
            await writeJsonAtomic(destPath, sourceObj)
            continue
          }
          // A body that parses to something other than an object holds no cue and no ownership
          // marker either, so it is kept aside and seeded again like one that will not parse.
          if (!isPlainObject(destBody)) {
            await quarantineCorruptFile(destPath)
            await writeJsonAtomic(destPath, sourceObj)
            continue
          }
          const destObj = destBody
          if (destObj.bundled !== true) {
            continue
          }
          const sourceVersion = typeof sourceObj.cueVersion === 'number' ? sourceObj.cueVersion : 0
          const destVersion = typeof destObj.cueVersion === 'number' ? destObj.cueVersion : 0
          if (sourceVersion > destVersion && (await keepReplacedFile(destPath, destVersion))) {
            await writeJsonAtomic(destPath, sourceObj)
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

  // Retire only in a folder this build seeds files into. The app data root holds none, so the
  // settings files there are never read here.
  if (shippedJson.size > 0) {
    await retireUnshippedFiles(destBase, shippedJson)
  }
}
