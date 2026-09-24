/**
 * The package check's rules for what sits beside the archive: the files electron-builder unpacked
 * from it into app.asar.unpacked, and the bundled defaults it copies into the resources folder.
 * The CLI in packaged-files-check.mjs finds each build and owns the exit code.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- the tests require this core
const { createHash } = require('node:crypto')
// eslint-disable-next-line @typescript-eslint/no-require-imports -- the tests require this core
const { readdirSync, readFileSync } = require('node:fs')
// eslint-disable-next-line @typescript-eslint/no-require-imports -- the tests require this core
const { join } = require('node:path')

/**
 * Packages whose files the build unpacks, because they load a native module. The serial bindings
 * drive the USB DMX adapters and have to be there. fsevents is a macOS-only optional dependency
 * and may be.
 */
const UNPACKED_PACKAGES = { '@serialport/bindings-cpp': true, 'fsevents': false }

/** @typedef {{ size: number, sha256: string }} FileFacts */

/**
 * Every file under a directory, with its size and SHA-256.
 * @param {string} dir
 * @param {{ skipDotFiles?: boolean }} [options] `skipDotFiles` leaves out every name that starts
 *   with a dot, as electron-builder leaves them out of the extra resources it copies
 * @returns {Map<string, FileFacts>} by path under `dir`, with forward slashes
 */
function listFiles(dir, { skipDotFiles = false } = {}) {
  /** @type {Map<string, FileFacts>} */
  const files = new Map()
  const walk = (sub) => {
    for (const entry of readdirSync(join(dir, sub), { withFileTypes: true })) {
      if (skipDotFiles && entry.name.startsWith('.')) continue
      const rel = sub === '' ? entry.name : `${sub}/${entry.name}`
      if (entry.isDirectory()) {
        walk(rel)
      } else if (entry.isFile()) {
        const bytes = readFileSync(join(dir, rel))
        files.set(rel, {
          size: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        })
      }
    }
  }
  walk('')
  return new Map([...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
}

/**
 * The files an asar index marks as unpacked. The index is a tree of `{ files: { name: entry } }`,
 * and an unpacked file carries its size and, from asar 3 on, the SHA-256 of its content.
 * @param {Record<string, unknown>} index
 * @returns {Map<string, { size: number, sha256: string | null }>} by path, with forward slashes
 */
function unpackedInIndex(index) {
  /** @type {Map<string, { size: number, sha256: string | null }>} */
  const found = new Map()
  const walk = (node, prefix) => {
    for (const [name, entry] of Object.entries(node?.files ?? {})) {
      const path = prefix === '' ? name : `${prefix}/${name}`
      if (entry.files !== undefined) {
        walk(entry, path)
      } else if (entry.unpacked === true) {
        const hash = entry.integrity?.algorithm === 'SHA256' ? entry.integrity.hash : null
        found.set(path, { size: entry.size, sha256: hash ?? null })
      }
    }
  }
  walk(index, '')
  return found
}

/**
 * @param {string} path a path under app.asar.unpacked
 * @returns {{ name: string, root: string } | null} the package it belongs to, the innermost when
 *   packages nest, and the folder that package sits in
 */
function packageOf(path) {
  const at = path.lastIndexOf('node_modules/')
  if (at === -1 || (at > 0 && path[at - 1] !== '/')) return null
  const segments = path.slice(at + 'node_modules/'.length).split('/')
  const length = segments[0].startsWith('@') ? 2 : 1
  if (segments.length <= length) return null
  const name = segments.slice(0, length).join('/')
  return { name, root: `${path.slice(0, at)}node_modules/${name}` }
}

/**
 * @param {Map<string, { size: number, sha256: string | null }>} indexed what the archive's index
 *   says was unpacked
 * @param {Map<string, FileFacts>} onDisk what app.asar.unpacked holds
 * @returns {string[]} one line per file the index names that is missing or differs, per file the
 *   index does not name, per file outside the packages that are unpacked, and per required package
 *   with no native module
 */
function unpackedProblems(indexed, onDisk) {
  /** @type {string[]} */
  const problems = []
  for (const [path, expected] of indexed) {
    const actual = onDisk.get(path)
    if (!actual) {
      problems.push(`missing from app.asar.unpacked: ${path}`)
    } else if (actual.size !== expected.size) {
      problems.push(`${path} is ${actual.size} bytes, and the archive index says ${expected.size}`)
    } else if (expected.sha256 !== null && actual.sha256 !== expected.sha256) {
      problems.push(`${path} does not match the hash the archive index records`)
    }
  }
  /** @type {Map<string, boolean>} whether each required package's folder holds a native module */
  const requiredRoots = new Map()
  for (const path of onDisk.keys()) {
    if (!indexed.has(path)) problems.push(`not in the archive index: ${path}`)
    const pkg = packageOf(path)
    if (pkg === null || !Object.hasOwn(UNPACKED_PACKAGES, pkg.name)) {
      problems.push(`unexpected in app.asar.unpacked: ${path}`)
    } else if (UNPACKED_PACKAGES[pkg.name]) {
      requiredRoots.set(pkg.root, (requiredRoots.get(pkg.root) ?? false) || path.endsWith('.node'))
    }
  }
  for (const [name, required] of Object.entries(UNPACKED_PACKAGES)) {
    const roots = [...requiredRoots].filter(([root]) => root.endsWith(`node_modules/${name}`))
    if (required && roots.length === 0) problems.push(`no ${name} in app.asar.unpacked`)
  }
  for (const [root, native] of requiredRoots) {
    if (!native) problems.push(`no native module under ${root}`)
  }
  return problems
}

/**
 * @param {Map<string, FileFacts>} source resources/defaults in the working copy, dotfiles left out
 * @param {Map<string, FileFacts> | null} packaged the defaults folder in the build's resources, or
 *   null when there is none
 * @returns {string[]} one line per file missing, differing or unexpected
 */
function defaultsProblems(source, packaged) {
  if (packaged === null) return ['no defaults folder in the packaged resources']
  /** @type {string[]} */
  const problems = []
  for (const [path, facts] of source) {
    const copy = packaged.get(path)
    if (!copy) problems.push(`defaults/${path} is missing`)
    else if (copy.sha256 !== facts.sha256) problems.push(`defaults/${path} differs from resources/`)
  }
  for (const path of packaged.keys()) {
    if (!source.has(path)) problems.push(`defaults/${path} is not in resources/defaults`)
  }
  return problems
}

module.exports = { listFiles, unpackedInIndex, unpackedProblems, defaultsProblems }
