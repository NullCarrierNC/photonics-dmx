/**
 * Filesystem path payloads for shell open and reveal operations.
 */

import * as os from 'os'
import * as path from 'path'
import type { ValidationResult } from './primitives'
import { isNonEmptyString } from './primitives'

/**
 * Resolves `targetPath` and confirms it sits under one of `allowedRoots` after normalization,
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

  const resolvedTarget = path.resolve(path.normalize(targetPath))
  const resolvedRoots = allowedRoots.map((root) => path.resolve(root))

  const isWithinAllowedRoot = resolvedRoots.some((root) => {
    const relative = path.relative(root, resolvedTarget)
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
  })

  if (!isWithinAllowedRoot) {
    return { ok: false, error: 'Path is outside allowed directories' }
  }

  return { ok: true, value: resolvedTarget }
}
