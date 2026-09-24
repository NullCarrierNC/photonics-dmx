import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'

let mockIsPackaged = true
let mockSwitches: string[] = []
const showErrorBox = jest.fn()

jest.mock('electron', () => ({
  app: {
    get isPackaged() {
      return mockIsPackaged
    },
    commandLine: { hasSwitch: (name: string) => mockSwitches.includes(name) },
  },
  dialog: { showErrorBox: (...args: unknown[]) => showErrorBox(...args) },
}))

import { debuggingSwitchesIn, refuseDebuggingSwitches } from '../debuggingSwitches'

describe('debugging switches', () => {
  let exit: ReturnType<typeof jest.spyOn>

  beforeEach(() => {
    mockIsPackaged = true
    mockSwitches = []
    showErrorBox.mockReset()
    exit = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
  })

  afterEach(() => {
    exit.mockRestore()
  })

  it('stops a packaged build launched with --remote-debugging-port', () => {
    mockSwitches = ['remote-debugging-port']

    refuseDebuggingSwitches()

    expect(exit).toHaveBeenCalledWith(1)
    expect(showErrorBox).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('--remote-debugging-port'),
    )
  })

  it('names the DevTools pipe and the Node inspector switches', () => {
    mockSwitches = ['remote-debugging-pipe', 'inspect', 'inspect-brk', 'inspect-port', 'js-flags']

    expect(debuggingSwitchesIn({ hasSwitch: (name) => mockSwitches.includes(name) })).toEqual([
      'remote-debugging-pipe',
      'inspect',
      'inspect-brk',
      'inspect-port',
    ])
  })

  it('starts a packaged build launched without one', () => {
    mockSwitches = ['disable-gpu']

    refuseDebuggingSwitches()

    expect(exit).not.toHaveBeenCalled()
    expect(showErrorBox).not.toHaveBeenCalled()
  })

  it('leaves a development build free to debug', () => {
    mockIsPackaged = false
    mockSwitches = ['remote-debugging-port', 'inspect']

    refuseDebuggingSwitches()

    expect(exit).not.toHaveBeenCalled()
  })
})
