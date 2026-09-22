/**
 * Filesystem path payloads for shell open and reveal operations.
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import type { ValidationResult } from './primitives'
import { isNonEmptyString } from './primitives'

/**
 * Resolves `targetPath`, following links, and confirms it sits under one of `allowedRoots`,
 * rejecting empty input, null bytes, and paths that escape the roots. The default roots include the
 * user's home directory by design: users import/export cue and effect libraries to arbitrary
 * locations they choose, so shell open/show operations are scoped to the home tree rather than a
 * single app directory.
 */
/**
 * Whether this process is a packaged build. Outside a real Electron runtime (e.g. tests) the answer
 * is unknowable, so this fails closed: unknown counts as packaged.
 */
function isPackagedBuild(): boolean {
  try {
    // Lazy require: this module is also loaded by tests without an Electron runtime.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron') as { app?: { isPackaged?: boolean } }
    return electron.app ? electron.app.isPackaged === true : true
  } catch {
    return true
  }
}

/**
 * Packaged apps launched from Finder/Dock run with cwd '/', under which EVERY absolute path is
 * "inside the root" — so the cwd root is only granted in dev runs, where it points at the project.
 */
function defaultAllowedRoots(): string[] {
  return [...(isPackagedBuild() ? [] : [process.cwd()]), os.homedir(), os.tmpdir()]
}

/**
 * The path with every link in it followed, or null when the filesystem will not say. A path that
 * does not exist yet follows its nearest existing ancestor and keeps the rest, so a file about to
 * be written is judged by where it will land.
 */
function realPathOf(target: string): string | null {
  const missing: string[] = []
  let existing = target
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing)
    if (parent === existing) return target
    missing.unshift(path.basename(existing))
    existing = parent
  }
  try {
    return path.join(fs.realpathSync(existing), ...missing)
  } catch {
    return null
  }
}

export function validatePathUnderAllowedRoots(
  targetPath: unknown,
  allowedRoots: string[] = defaultAllowedRoots(),
): ValidationResult<string> {
  if (!isNonEmptyString(targetPath)) {
    return { ok: false, error: 'Path must be a non-empty string' }
  }

  if (targetPath.includes('\0')) {
    return { ok: false, error: 'Path must not contain null bytes' }
  }

  // Links are followed on both sides, so a link under a root cannot lead out of it, and a root
  // that is itself a link (macOS tmpdir is one) still contains what it contains.
  const resolvedTarget = realPathOf(path.resolve(path.normalize(targetPath)))
  if (resolvedTarget === null) {
    return { ok: false, error: 'Path could not be resolved' }
  }
  const resolvedRoots = allowedRoots
    .map((root) => realPathOf(path.resolve(root)))
    .filter((root): root is string => root !== null)

  const isWithinAllowedRoot = resolvedRoots.some((root) => {
    const relative = path.relative(root, resolvedTarget)
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
  })

  if (!isWithinAllowedRoot) {
    return { ok: false, error: 'Path is outside allowed directories' }
  }

  return { ok: true, value: resolvedTarget }
}

/**
 * Extensions the system handler may be given.
 *
 * Opening a path hands it to whatever the OS has registered for that type, and for an executable
 * that means running it. Being under the home directory is no protection, since Downloads is under
 * it too. The app's own openable files are its libraries, its logs and plain documents.
 */
const OPENABLE_EXTENSIONS = new Set(['.json', '.txt', '.log', '.md', '.csv'])

/**
 * Resolves `targetPath` the way `validatePathUnderAllowedRoots` does, then confirms the system
 * handler should be given it: a plain directory, which opens a file manager, or a file whose
 * extension is on the list. A directory carrying an extension is rejected along with the files,
 * because a macOS application bundle is one.
 */
export function validateOpenablePath(
  targetPath: unknown,
  allowedRoots?: string[],
): ValidationResult<string> {
  const underRoot =
    allowedRoots === undefined
      ? validatePathUnderAllowedRoots(targetPath)
      : validatePathUnderAllowedRoots(targetPath, allowedRoots)
  if (!underRoot.ok) {
    return underRoot
  }

  const extension = path.extname(underRoot.value).toLowerCase()
  if (extension === '') {
    const stat = fs.statSync(underRoot.value, { throwIfNoEntry: false })
    if (stat?.isDirectory()) {
      return underRoot
    }
  }
  if (!OPENABLE_EXTENSIONS.has(extension)) {
    return { ok: false, error: 'Path is not a type this app opens' }
  }

  return underRoot
}
