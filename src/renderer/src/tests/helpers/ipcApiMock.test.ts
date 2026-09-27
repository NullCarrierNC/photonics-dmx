import { describe, expect, it } from '@jest/globals'
import * as ipcApi from '../../ipcApi'
import { DEFAULT_PREFERENCES } from '../../../../services/configuration/configurationDefaults'
import { accepted, ipcApiMock, resetIpcApiMock } from './ipcApiMock'

/** Exports that send to main and return nothing. */
const SENDS = [
  'enableYarg',
  'disableYarg',
  'enableRb3',
  'disableRb3',
  'setCueStyle',
  'setListenCueData',
  'reportUnsavedChanges',
  'sendAudioData',
  'sendConsoleDmx',
]

/** Getters whose declared answer includes undefined. */
const MAY_ANSWER_UNDEFINED = ['getDmxRig']

describe('ipcApiMock default answers', () => {
  it.each([
    'simulateBeat',
    'simulateKeyframe',
    'simulateMeasure',
    'simulatePostProcessing',
    'stopTestEffect',
  ])('%s resolves true', async (name) => {
    await expect(ipcApiMock[name]()).resolves.toBe(true)
  })

  it.each(SENDS)('%s returns nothing at once', (name) => {
    expect(ipcApiMock[name]()).toBeUndefined()
  })

  it.each(['savePrefs', 'setClockRate', 'startTestEffect'])(
    '%s resolves an accepted write',
    async (name) => {
      await expect(ipcApiMock[name]()).resolves.toEqual(accepted)
    },
  )

  it('answers every other export with a value', async () => {
    const unanswered: string[] = []
    for (const name of Object.keys(ipcApi)) {
      if (SENDS.includes(name) || MAY_ANSWER_UNDEFINED.includes(name)) continue
      const answer = await Promise.resolve(ipcApiMock[name]('arg')).catch((error: unknown) => error)
      if (answer === undefined) unanswered.push(name)
    }

    expect(unanswered).toEqual([])
  })

  it.each([
    'openAudioPreviewWindow',
    'openCueEditorWindow',
    'openPath',
    'retryControllerInit',
    'showItemInFolder',
    'exportEffectFile',
    'exportNodeCueFile',
    'exportRig',
  ])('%s resolves a success', async (name) => {
    await expect(ipcApiMock[name]('arg')).resolves.toMatchObject({ success: true })
  })

  it.each(['pickEffectImportFile', 'pickNodeCueImportFile', 'pickRigImportFile'])(
    '%s resolves that the user dismissed the dialog',
    async (name) => {
      await expect(ipcApiMock[name]()).resolves.toMatchObject({ success: false, cancelled: true })
    },
  )

  it.each([
    ['getClockRate', { clockRate: DEFAULT_PREFERENCES.clockRate }],
    ['getCueConsistencyWindow', { windowMs: DEFAULT_PREFERENCES.cueConsistencyWindow }],
    ['getNetworkInterfaces', { interfaces: [] }],
  ])('%s resolves a success carrying its value', async (name, value) => {
    await expect(ipcApiMock[name]()).resolves.toEqual({ success: true, ...value })
  })

  it('echoes a setting back in its success', async () => {
    await expect(ipcApiMock.setMotionCueProbabilityPercent(30)).resolves.toEqual({
      success: true,
      percent: 30,
    })
  })

  it('resolves the default preferences for a preferences read', async () => {
    await expect(ipcApiMock.getPrefs()).resolves.toEqual(DEFAULT_PREFERENCES)
  })

  it('refuses a read of a file it does not hold', async () => {
    await expect(ipcApiMock.readEffectFile('missing.json')).rejects.toThrow('missing.json')
  })

  it('restores a boolean default after a suite overrides it', async () => {
    ipcApiMock.simulateBeat.mockImplementation(() => Promise.resolve(false))

    resetIpcApiMock()

    await expect(ipcApiMock.simulateBeat()).resolves.toBe(true)
  })
})
