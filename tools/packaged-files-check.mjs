/**
 * Checks that a packaged build carries exactly what it is meant to carry.
 *
 * electron-builder takes its file list from electron-builder.yml, so a working copy holding
 * anything else has to pack the same app. This reads the archive electron-builder produced and
 * compares its top level to the list below, which names what ships and nothing else, then looks
 * inside out/ for the three files that make the difference between an app and a blank window.
 *
 * It also reads the Electron fuses from the binary each archive belongs to, and checks they are
 * set the way electron-builder.yml's electronFuses block sets them.
 *
 * Run it after `npm run build:unpack` or any of the per-platform builds.
 */
import { openSync, readSync, closeSync, existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import fuses from '@electron/fuses'

const { getCurrentFuseWire, FuseV1Options } = fuses

/** What a packaged build holds at the top level of its archive. */
const SHIPPED = ['LICENSE', 'THIRD-PARTY-LICENSES.md', 'node_modules', 'out', 'package.json']

/**
 * Files inside out/ without which the app starts and shows nothing.
 *
 * A build missing any of these still leaves out/ present, so the top-level comparison passes and
 * the first sign of trouble is a blank window on a released installer.
 */
const REQUIRED_IN_OUT = ['main/index.js', 'preload/index.js', 'renderer/index.html']

/** Names under out/ that ship. Anything else there is build state or a stray artifact. */
const ALLOWED_IN_OUT = ['main', 'preload', 'renderer']

const DIST = 'dist'

/**
 * The fuses a packaged build carries, as electron-builder.yml sets them. Off: running the binary
 * as plain Node, NODE_OPTIONS and --inspect. On: the archive integrity check and loading the app
 * from the archive alone.
 */
const EXPECTED_FUSES = {
  RunAsNode: false,
  EnableNodeOptionsEnvironmentVariable: false,
  EnableNodeCliInspectArguments: false,
  EnableEmbeddedAsarIntegrityValidation: true,
  OnlyLoadAppFromAsar: true,
}

/** How the fuse wire records a fuse: the characters '1' and '0'. */
const FUSE_ON = '1'.charCodeAt(0)
const FUSE_OFF = '0'.charCodeAt(0)

/**
 * The Electron binary an archive belongs to: the .app bundle on macOS, and the executable in the
 * folder above resources/ elsewhere.
 */
function binaryFor(archive) {
  const macApp = archive.match(/^(.*\.app)[\\/]Contents[\\/]Resources[\\/]app\.asar$/)
  if (macApp) {
    return macApp[1]
  }
  const buildDir = dirname(dirname(archive))
  for (const name of ['Photonics.exe', 'photonics-dmx', 'photonics', 'Photonics']) {
    const candidate = join(buildDir, name)
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate
    }
  }
  return null
}

/** What is wrong with a build's fuses, or nothing when they are set as expected. */
async function fuseProblems(archive) {
  const binary = binaryFor(archive)
  if (!binary) {
    return [`no Electron binary found beside the archive`]
  }
  const wire = await getCurrentFuseWire(binary)
  const problems = []
  for (const [name, wanted] of Object.entries(EXPECTED_FUSES)) {
    const state = wire[FuseV1Options[name]]
    if (state !== (wanted ? FUSE_ON : FUSE_OFF)) {
      problems.push(`${name} should be ${wanted ? 'on' : 'off'}`)
    }
  }
  return problems
}

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
function readIndex(archivePath) {
  const fd = openSync(archivePath, 'r')
  try {
    const preamble = Buffer.alloc(16)
    readSync(fd, preamble, 0, 16, 0)
    const jsonLength = preamble.readUInt32LE(12)
    const json = Buffer.alloc(jsonLength)
    readSync(fd, json, 0, jsonLength, 16)
    return JSON.parse(json.toString('utf8'))
  } finally {
    closeSync(fd)
  }
}

/**
 * An asar index is a tree of `{ files: { name: entry } }`, where a directory carries its own
 * `files` map and a file carries a size instead.
 */

/** The names at the top level of an archive. */
function topLevelNames(index) {
  return Object.keys(index?.files ?? {})
}

/**
 * Whether the archive holds a file at `path`, given as slash-separated segments. A directory at
 * that name does not count, so asking for out/renderer/index.html asks for the file.
 */
function hasFile(index, path) {
  let node = index
  for (const segment of path.split('/')) {
    node = node?.files?.[segment]
    if (!node) {
      return false
    }
  }
  return node.files === undefined
}

/** Names directly under a top-level directory, or an empty list when it is not there. */
function namesIn(index, dir) {
  return Object.keys(index?.files?.[dir]?.files ?? {})
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
  const fuseIssues = await fuseProblems(archive)
  if (fuseIssues.length > 0) {
    failed = true
    console.error(`${archive}: Electron fuses are not set as electron-builder.yml sets them`)
    for (const issue of fuseIssues) {
      console.error(`  ${issue}`)
    }
  }

  const index = readIndex(archive)
  const actual = topLevelNames(index).sort()
  const missing = expected.filter((name) => !actual.includes(name))
  const extra = actual.filter((name) => !expected.includes(name))
  const missingInOut = REQUIRED_IN_OUT.filter((path) => !hasFile(index, `out/${path}`))
  const extraInOut = namesIn(index, 'out').filter((name) => !ALLOWED_IN_OUT.includes(name))

  if (
    missing.length === 0 &&
    extra.length === 0 &&
    missingInOut.length === 0 &&
    extraInOut.length === 0
  ) {
    console.log(`${archive}: carries the ${expected.length} entries it should, out/ included`)
    if (fuseIssues.length === 0) {
      console.log(`${archive}: fuses set as electron-builder.yml sets them`)
    }
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
  if (missingInOut.length > 0) {
    console.error(`  missing inside out/: ${missingInOut.join(', ')}`)
  }
  if (extraInOut.length > 0) {
    console.error(`  unexpected inside out/: ${extraInOut.join(', ')}`)
  }
  console.error(`  expected exactly: ${expected.join(', ')}`)
  console.error(`  and inside out/: ${REQUIRED_IN_OUT.join(', ')}`)
}

if (failed) {
  console.error(
    'Update electron-builder.yml, or SHIPPED or EXPECTED_FUSES here, whichever is wrong.',
  )
  process.exit(1)
}
