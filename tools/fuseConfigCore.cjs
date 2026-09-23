/**
 * The package check's fuse rules: reading electron-builder.yml's electronFuses block and holding it
 * to the hardened settings. The CLI in packaged-files-check.mjs reads the binary and owns the exit
 * code.
 */

/**
 * Fuses every build sets. Off: running the binary as plain Node, NODE_OPTIONS and --inspect. On:
 * the archive integrity check and loading the app from the archive alone.
 */
const REQUIRED = {
  RunAsNode: false,
  EnableNodeOptionsEnvironmentVariable: false,
  EnableNodeCliInspectArguments: false,
  EnableEmbeddedAsarIntegrityValidation: true,
  OnlyLoadAppFromAsar: true,
}

/**
 * Fuses left at Electron's default until the config sets them, then held to these.
 * electron-builder.yml says why each is not set yet.
 */
const HARDENED_WHEN_SET = {
  GrantFileProtocolExtraPrivileges: false,
  EnableCookieEncryption: true,
}

/**
 * @param {string} yamlText contents of electron-builder.yml
 * @param {string[]} knownFuses the fuse-wire names, such as RunAsNode
 * @returns {Record<string, boolean>} each fuse the electronFuses block sets, by fuse-wire name.
 *   Keys that are not fuses, such as resetAdHocDarwinSignature, are left out.
 */
function readElectronFuses(yamlText, knownFuses) {
  /** @type {Record<string, boolean>} */
  const fuses = {}
  let inBlock = false
  for (const line of yamlText.split(/\r?\n/)) {
    if (/^electronFuses:\s*(#.*)?$/.test(line)) {
      inBlock = true
      continue
    }
    if (!inBlock || /^\s*(#.*)?$/.test(line)) continue
    const entry = /^\s+([A-Za-z0-9]+):\s*(true|false)\s*(#.*)?$/.exec(line)
    if (!/^\s/.test(line)) break
    if (!entry) continue
    const name = entry[1][0].toUpperCase() + entry[1].slice(1)
    if (knownFuses.includes(name)) fuses[name] = entry[2] === 'true'
  }
  return fuses
}

/**
 * @param {Record<string, boolean>} fuses what electron-builder.yml sets
 * @returns {string[]} one line per fuse the config leaves weaker than the hardened setting
 */
function fuseConfigProblems(fuses) {
  const problems = []
  for (const [name, wanted] of Object.entries(REQUIRED)) {
    if (fuses[name] !== wanted) {
      problems.push(`${name} must be set ${wanted ? 'on' : 'off'} in electronFuses`)
    }
  }
  for (const [name, wanted] of Object.entries(HARDENED_WHEN_SET)) {
    if (name in fuses && fuses[name] !== wanted) {
      problems.push(`${name} may only be set ${wanted ? 'on' : 'off'} in electronFuses`)
    }
  }
  return problems
}

module.exports = { readElectronFuses, fuseConfigProblems }
