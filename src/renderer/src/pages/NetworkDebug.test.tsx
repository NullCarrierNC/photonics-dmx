/** @jest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { act, cleanup } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import { resetIpcListenerStub } from '@renderer/tests/helpers/ipcListenerStub'
import * as ipcApi from '../ipcApi'
import { rb3eListenerEnabledAtom, yargListenerEnabledAtom } from '../atoms'

jest.mock(
  '../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)
jest.mock(
  '@renderer/utils/ipcHelpers',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcListenerStub')>(
      '@renderer/tests/helpers/ipcListenerStub',
    ).ipcListenerStub,
)
jest.mock('@renderer/components/PhotonicsInputOutputToggles', () => ({
  __esModule: true,
  default: () => null,
}))

import NetworkDebug from './NetworkDebug'

const setListenCueData = jest.mocked(ipcApi.setListenCueData)

function renderPage(listeners: { yarg?: boolean; rb3?: boolean } = {}) {
  return renderWithProviders(<NetworkDebug />, {
    seed: (set) => {
      set(yargListenerEnabledAtom, listeners.yarg ?? false)
      set(rb3eListenerEnabledAtom, listeners.rb3 ?? false)
    },
  })
}

describe('NetworkDebug', () => {
  beforeEach(() => {
    resetIpcApiMock()
    resetIpcListenerStub()
    jest.useFakeTimers()
  })

  afterEach(() => {
    cleanup()
    jest.useRealTimers()
  })

  it('asks for the cue data again when a listener starts', () => {
    const { store } = renderPage()
    expect(setListenCueData).toHaveBeenLastCalledWith(true)
    setListenCueData.mockClear()

    act(() => store.set(rb3eListenerEnabledAtom, true))

    expect(setListenCueData).toHaveBeenCalledWith(true)
  })

  it('stops the cue data when the page closes', () => {
    const { unmount } = renderPage({ yarg: true })

    unmount()

    expect(setListenCueData).toHaveBeenLastCalledWith(false)
  })
})
