import { describe, expect, it, jest } from '@jest/globals'

jest.mock('electron', () => ({ dialog: {}, ipcMain: {} }))
jest.mock('../../utils/windowUtils', () => ({ sendToAllWindows: jest.fn() }))

import type { IpcMain } from 'electron'
import { setupNodeCueHandlers } from '../../ipc/node-cue-handlers'
import { setupEffectHandlers } from '../../ipc/effect-handlers'
import { registerLightsRigsConfigHandlers } from '../../ipc/config/lights-rigs-handlers'
import type { ControllerManager } from '../../controllers/ControllerManager'
import { CONFIG, EFFECTS, NODE_CUES } from '../../../shared/ipcChannels'

type Setup = (ipcMain: IpcMain, manager: ControllerManager) => void

/** Registers one handler module against stub loaders and configuration, and invokes by channel. */
function registered(setup: Setup) {
  let debug = false
  const fileOps = () => ({
    readFile: jest.fn(),
    deleteFile: jest.fn(),
    resolveNodeCueFilePathForIpc: jest.fn(),
    resolveEffectFilePathForIpc: jest.fn(),
  })
  const nodeCueLoader = {
    saveFile: jest.fn(),
    getAvailableCueTypes: jest.fn(),
    getModes: () => ['yarg', 'audio', 'rb3'],
    setDebugEnabled: (on: boolean) => {
      debug = on
    },
    isDebugEnabled: () => debug,
    ...fileOps(),
  }
  const effectLoader = { saveFile: jest.fn(), getModes: () => ['yarg', 'audio'], ...fileOps() }
  const config = { getDmxRig: jest.fn(), deleteDmxRig: jest.fn() }
  const manager = {
    getNodeCueLoader: () => nodeCueLoader,
    getEffectLoader: () => effectLoader,
    getConfig: () => config,
  }
  const handlers = new Map<string, (event: unknown, payload: unknown) => Promise<unknown>>()
  const ipcMain = {
    handle: (channel: string, fn: (event: unknown, payload: unknown) => Promise<unknown>) =>
      handlers.set(channel, fn),
    on: jest.fn(),
  }
  setup(ipcMain as never, manager as never)
  const invoke = (channel: string, payload: unknown) => handlers.get(channel)!({}, payload)
  return { invoke, nodeCueLoader, effectLoader, config }
}

/** A refusal the page can show: a failure with a message, not a property read on a bad value. */
const refusal = {
  success: false,
  error: expect.not.stringMatching(/Cannot read|is not a function|undefined/),
}

describe('invoke payloads the handlers refuse before acting', () => {
  it.each([
    null,
    'cue.json',
    { mode: 'constructor', filename: 'f.json', content: {} },
    { mode: 'yarg', filename: 42, content: {} },
    { mode: 'yarg', filename: 'f.json', content: 'not a file' },
  ])('node cue save refuses %p', async (payload) => {
    const { invoke, nodeCueLoader } = registered(setupNodeCueHandlers)

    await expect(invoke(NODE_CUES.SAVE, payload)).resolves.toEqual(refusal)
    expect(nodeCueLoader.saveFile).not.toHaveBeenCalled()
  })

  it.each([undefined, { mode: '__proto__' }, { mode: 'yarg', kind: 'sparkle' }])(
    'cue type lookup refuses %p',
    async (payload) => {
      const { invoke, nodeCueLoader } = registered(setupNodeCueHandlers)

      await expect(invoke(NODE_CUES.GET_CUE_TYPES, payload)).resolves.toEqual(refusal)
      expect(nodeCueLoader.getAvailableCueTypes).not.toHaveBeenCalled()
    },
  )

  it('cue type lookup passes a well-formed request through', async () => {
    const { invoke, nodeCueLoader } = registered(setupNodeCueHandlers)
    nodeCueLoader.getAvailableCueTypes.mockReturnValue(['Default'])

    await expect(invoke(NODE_CUES.GET_CUE_TYPES, { mode: 'rb3', kind: 'motion' })).resolves.toEqual(
      ['Default'],
    )
    expect(nodeCueLoader.getAvailableCueTypes).toHaveBeenCalledWith('rb3', 'motion')
  })

  it.each([
    null,
    { mode: 'rb3', filename: 'f.json', content: {} },
    { mode: 'yarg', filename: '', content: {} },
    { mode: 'audio', filename: 'f.json', content: null },
  ])('effect save refuses %p', async (payload) => {
    const { invoke, effectLoader } = registered(setupEffectHandlers)

    await expect(invoke(EFFECTS.SAVE, payload)).resolves.toEqual(refusal)
    expect(effectLoader.saveFile).not.toHaveBeenCalled()
  })

  it.each([{ id: 'rig-1' }, 42, ''])('rig read refuses %p', async (payload) => {
    const { invoke, config } = registered(registerLightsRigsConfigHandlers)

    await expect(invoke(CONFIG.GET_DMX_RIG, payload)).resolves.toEqual(refusal)
    expect(config.getDmxRig).not.toHaveBeenCalled()
  })

  it.each([{ id: 'rig-1' }, 42, ''])('rig delete refuses %p', async (payload) => {
    const { invoke, config } = registered(registerLightsRigsConfigHandlers)

    await expect(invoke(CONFIG.DELETE_DMX_RIG, payload)).resolves.toEqual(refusal)
    expect(config.deleteDmxRig).not.toHaveBeenCalled()
  })

  it.each([NODE_CUES.READ, NODE_CUES.DELETE, NODE_CUES.EXPORT])(
    '%s refuses a path that is not a string',
    async (channel) => {
      const { invoke, nodeCueLoader } = registered(setupNodeCueHandlers)

      for (const payload of [null, 42, { path: 'cue.json' }, '']) {
        await expect(invoke(channel, payload)).resolves.toEqual(refusal)
      }
      expect(nodeCueLoader.readFile).not.toHaveBeenCalled()
      expect(nodeCueLoader.deleteFile).not.toHaveBeenCalled()
    },
  )

  it.each([EFFECTS.READ, EFFECTS.DELETE, EFFECTS.EXPORT])(
    '%s refuses a path that is not a string',
    async (channel) => {
      const { invoke, effectLoader } = registered(setupEffectHandlers)

      for (const payload of [null, 42, { path: 'effect.json' }, '']) {
        await expect(invoke(channel, payload)).resolves.toEqual(refusal)
      }
      expect(effectLoader.readFile).not.toHaveBeenCalled()
      expect(effectLoader.deleteFile).not.toHaveBeenCalled()
    },
  )

  it.each([
    [NODE_CUES.VALIDATE, setupNodeCueHandlers],
    [EFFECTS.VALIDATE, setupEffectHandlers],
  ])('%s answers a malformed request with a verdict naming it', async (channel, setup) => {
    const { invoke } = registered(setup)

    for (const payload of [null, 'cue.json', { path: 42 }, { content: 'not a file' }]) {
      await expect(invoke(channel, payload)).resolves.toEqual({
        valid: false,
        errors: [expect.not.stringMatching(/Cannot read|is not a function|undefined/)],
      })
    }
  })

  it.each(['false', 0, null])('node cue debug refuses %p and leaves debug as it was', async (p) => {
    const { invoke, nodeCueLoader } = registered(setupNodeCueHandlers)

    await expect(invoke(NODE_CUES.SET_DEBUG, p)).resolves.toEqual(refusal)
    expect(nodeCueLoader.isDebugEnabled()).toBe(false)
  })
})
