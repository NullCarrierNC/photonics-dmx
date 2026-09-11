/**
 * Checks that a packaged build carries exactly what it is meant to carry.
 *
 * electron-builder takes its file list from electron-builder.yml, so a working copy holding
 * anything else has to pack the same app. This reads the archive electron-builder produced and
 * compares its top level to the list below, which names what ships and nothing else.
 *
 * Run it after `npm run build:unpack` or any of the per-platform builds.
 */
import { openSync, readSync, closeSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** What a packaged build holds at the top level of its archive. */
const SHIPPED = ['LICENSE', 'THIRD-PARTY-LICENSES.md', 'node_modules', 'out', 'package.json']

const DIST = 'dist'

/**
 * electron-builder writes each unpacked build into a dist/ directory named for its platform and
 * architecture, such as mac-arm64 or win-unpacked. Only those are searched, so installers and
 * app bundles kept in dist/ from earlier releases are left alone.
 */
const BUILD_OUTPUT_DIR = /^(mac|win|linux)(-|$)/

function findArchives(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (entry === 'app.asar') {
      found.push(full)
      continue
    }
    if (statSync(full).isDirectory()) {
      findArchives(full, found)
    }
  }
  return found
}

/** The archives the most recent builds produced, one per platform output directory. */
function findBuildArchives() {
  const found = []
  for (const entry of readdirSync(DIST)) {
    const full = join(DIST, entry)
    if (BUILD_OUTPUT_DIR.test(entry) && statSync(full).isDirectory()) {
      findArchives(full, found)
    }
  }
  return found
}

/**
 * The names at the top level of an asar.
 *
 * The archive opens with four little-endian uint32s, the last of which is the length of the JSON
 * index that follows, so the index can be read without unpacking anything.
 */
function topLevelNames(archivePath) {
  const fd = openSync(archivePath, 'r')
  try {
    const preamble = Buffer.alloc(16)
    readSync(fd, preamble, 0, 16, 0)
    const jsonLength = preamble.readUInt32LE(12)
    const json = Buffer.alloc(jsonLength)
    readSync(fd, json, 0, jsonLength, 16)
    return Object.keys(JSON.parse(json.toString('utf8')).files ?? {})
  } finally {
    closeSync(fd)
  }
}

if (!existsSync(DIST)) {
  console.error(`No ${DIST}/ directory. Build first, for example: npm run build:unpack`)
  process.exit(1)
}

const archives = findBuildArchives()
if (archives.length === 0) {
  console.error(
    `No packaged archive under ${DIST}/. Build first, for example: npm run build:unpack`,
  )
  process.exit(1)
}

const expected = [...SHIPPED].sort()
let failed = false

for (const archive of archives) {
  const actual = topLevelNames(archive).sort()
  const missing = expected.filter((name) => !actual.includes(name))
  const extra = actual.filter((name) => !expected.includes(name))

  if (missing.length === 0 && extra.length === 0) {
    console.log(`${archive}: carries the ${expected.length} entries it should`)
    continue
  }

  failed = true
  console.error(`${archive}: does not match what the build is meant to carry`)
  if (missing.length > 0) {
    console.error(`  missing: ${missing.join(', ')}`)
  }
  if (extra.length > 0) {
    console.error(`  unexpected: ${extra.length} entry(s) beyond the list`)
  }
  console.error(`  expected exactly: ${expected.join(', ')}`)
}

if (failed) {
  console.error(
    'Update the files list in electron-builder.yml, or SHIPPED here, whichever is wrong.',
  )
  process.exit(1)
}
