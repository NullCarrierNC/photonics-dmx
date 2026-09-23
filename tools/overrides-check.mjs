/**
 * Fails when a package.json override narrows nothing: nothing in the lock depends on the
 * package, or every dependent already asks for a range inside the override. The comparison lives
 * in overridesCheckCore.cjs.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { unneededOverrides } = require('./overridesCheckCore.cjs')

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'))

const unneeded = unneededOverrides(manifest, lock)
if (unneeded.length > 0) {
  for (const line of unneeded) {
    console.error(line)
  }
  console.error('Remove the override from package.json, then run `npm install`.')
  process.exit(1)
}
console.log(`Overrides: ${Object.keys(manifest.overrides ?? {}).length} checked, each still needed`)
