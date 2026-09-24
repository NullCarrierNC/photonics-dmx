import { app, dialog } from 'electron'

/**
 * Command-line switches that open a debugging endpoint onto the app: the Chromium DevTools protocol
 * and the Node inspector.
 */
const DEBUGGING_SWITCHES = [
  'remote-debugging-port',
  'remote-debugging-pipe',
  'remote-debugging-address',
  'remote-allow-origins',
  'inspect',
  'inspect-brk',
  'inspect-brk-node',
  'inspect-port',
  'inspect-publish-uid',
  'inspect-wait',
]

interface CommandLine {
  hasSwitch(name: string): boolean
}

/** The debugging switches on the command line Chromium parsed. */
export function debuggingSwitchesIn(commandLine: CommandLine): string[] {
  return DEBUGGING_SWITCHES.filter((name) => commandLine.hasSwitch(name))
}

/**
 * Stops a packaged build launched with a debugging switch, before anything opens.
 *
 * It runs before `ready`, while Chromium has yet to start the DevTools endpoint. The Node
 * inspector is already listening by then when the fuse is missing, so the process exits.
 */
export function refuseDebuggingSwitches(): void {
  if (!app.isPackaged) {
    return
  }
  const found = debuggingSwitchesIn(app.commandLine)
  if (found.length === 0) {
    return
  }
  const named = found.map((name) => `--${name}`).join(', ')
  dialog.showErrorBox(
    'Photonics will not start with debugging switches',
    `Photonics was launched with ${named}, which would let another program control it. Launch it without ${found.length === 1 ? 'that switch' : 'those switches'}.`,
  )
  process.exit(1)
}
