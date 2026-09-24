/**
 * The package check's fuse rules: reading electron-builder.yml's electronFuses block and holding it
 * to the hardened settings. The CLI in packaged-files-check.mjs reads the binary and owns the exit
 * code.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- the tests require this core
const { createRequire } = require('node:module')

/** js-yaml as electron-builder resolves it, so the file reads here the way a build reads it. */
const yaml = createRequire(require.resolve('app-builder-lib'))('js-yaml')

/**
 * Fuses every build sets. Off: running the binary as plain Node, NODE_OPTIONS, --inspect and the
 * extra privileges of file:// pages. On: the archive integrity check and loading the app from the
 * archive alone.
 */
const REQUIRED = {
  RunAsNode: false,
  EnableNodeOptionsEnvironmentVariable: false,
  EnableNodeCliInspectArguments: false,
  EnableEmbeddedAsarIntegrityValidation: true,
  OnlyLoadAppFromAsar: true,
  GrantFileProtocolExtraPrivileges: false,
}

/**
 * Fuses left at Electron's default until the config sets them, then held to these.
 * electron-builder.yml says why each is not set yet.
 */
const HARDENED_WHEN_SET = {
  EnableCookieEncryption: true,
}

/**
 * @param {string} yamlText contents of electron-builder.yml
 * @param {string[]} knownFuses the fuse-wire names, such as RunAsNode
 * @returns {Record<string, unknown>} each fuse the electronFuses block sets, by fuse-wire name,
 *   read from the camel-case key electron-builder reads, such as runAsNode. A key with no value is
 *   unset, as it is to electron-builder, and keys that are not fuses are left out.
 */
function readElectronFuses(yamlText, knownFuses) {
  const block = yaml.load(yamlText)?.electronFuses
  /** @type {Record<string, unknown>} */
  const fuses = {}
  if (block === null || typeof block !== 'object') return fuses
  for (const name of knownFuses) {
    const value = block[name[0].toLowerCase() + name.slice(1)]
    if (value !== null && value !== undefined) fuses[name] = value
  }
  return fuses
}

/**
 * @param {Record<string, unknown>} fuses what electron-builder.yml sets
 * @returns {string[]} one line per fuse the config leaves weaker than the hardened setting, and one
 *   per fuse set to something other than true or false, which electron-builder turns on or off by
 *   whether the value is truthy
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
  for (const [name, value] of Object.entries(fuses)) {
    if (typeof value !== 'boolean') {
      problems.push(
        `${name} must be true or false, and electron-builder reads ${JSON.stringify(value)} as ${value ? 'on' : 'off'}`,
      )
    }
  }
  return problems
}

module.exports = { readElectronFuses, fuseConfigProblems }
