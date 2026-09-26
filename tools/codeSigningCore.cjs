/**
 * The signing rules. No build is signed with a certificate: electron-builder.yml sets mac.identity
 * to null, and every script that packages turns identity discovery off.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- the tests require this core
const { createRequire } = require('node:module')

/** js-yaml as electron-builder resolves it, so the file reads here the way a build reads it. */
const yaml = createRequire(require.resolve('app-builder-lib'))('js-yaml')

const DISCOVERY_OFF = 'cross-env CSC_IDENTITY_AUTO_DISCOVERY=false electron-builder'

/**
 * @param {string} yamlText contents of electron-builder.yml
 * @returns {string[]} one line per way the config lets a macOS build pick up a certificate
 */
function signingConfigProblems(yamlText) {
  const mac = yaml.load(yamlText)?.mac
  if (mac === null || typeof mac !== 'object' || !Object.hasOwn(mac, 'identity')) {
    return [
      'mac.identity must be set to null, or electron-builder signs with any keychain identity',
    ]
  }
  if (mac.identity !== null) {
    return [`mac.identity must be null, not ${JSON.stringify(mac.identity)}`]
  }
  return []
}

/**
 * @param {Record<string, string>} scripts package.json scripts
 * @returns {string[]} one line per script command that runs electron-builder to package without
 *   turning identity discovery off. install-app-deps only rebuilds native modules, so it is exempt.
 */
function packagingScriptProblems(scripts) {
  const problems = []
  for (const [name, script] of Object.entries(scripts)) {
    for (const command of script.split('&&').map((part) => part.trim())) {
      if (!/\belectron-builder\b/.test(command) || /\binstall-app-deps\b/.test(command)) continue
      if (!command.startsWith(DISCOVERY_OFF)) {
        problems.push(`${name} runs "${command}" without CSC_IDENTITY_AUTO_DISCOVERY=false`)
      }
    }
  }
  return problems
}

module.exports = { signingConfigProblems, packagingScriptProblems }
