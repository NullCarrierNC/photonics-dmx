import { describe, expect, it } from '@jest/globals'
import { accepted, ipcApiMock, resetIpcApiMock } from './ipcApiMock'

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

  it.each([
    'enableYarg',
    'disableYarg',
    'enableRb3',
    'disableRb3',
    'setCueStyle',
    'setListenCueData',
  ])('%s returns nothing', (name) => {
    expect(ipcApiMock[name]()).toBeUndefined()
  })

  it.each(['savePrefs', 'setClockRate', 'startTestEffect'])(
    '%s resolves an accepted write',
    async (name) => {
      await expect(ipcApiMock[name]()).resolves.toEqual(accepted)
    },
  )

  it('resolves undefined for a read', async () => {
    await expect(ipcApiMock.getPrefs()).resolves.toBeUndefined()
  })

  it('restores a boolean default after a suite overrides it', async () => {
    ipcApiMock.simulateBeat.mockImplementation((() => Promise.resolve(false)) as never)

    resetIpcApiMock()

    await expect(ipcApiMock.simulateBeat()).resolves.toBe(true)
  })
})
