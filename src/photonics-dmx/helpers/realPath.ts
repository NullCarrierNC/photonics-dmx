import * as fs from 'fs'
import * as path from 'path'

/**
 * The path with every link in it followed, or null when the filesystem will not say. A path that
 * does not exist yet follows its nearest existing ancestor and keeps the rest, so a file about to
 * be written is judged by where it will land.
 */
export function realPathOf(target: string): string | null {
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
