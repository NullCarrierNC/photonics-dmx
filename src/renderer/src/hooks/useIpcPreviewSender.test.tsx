/** @jest-environment jsdom */
/**
 * The preview stream is shared by several views, so it is counted rather than owned by whichever
 * one mounted last.
 */
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals'
import { render, cleanup, act } from '@testing-library/react'
import { resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../ipcApi'

jest.mock(
  '../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

const enableSender = jest.mocked(ipcApi.enableSender)
const disableSender = jest.mocked(ipcApi.disableSender)

import { useIpcPreviewSender, __resetIpcPreviewSenderForTests } from './useIpcPreviewSender'

function Viewer(): null {
  useIpcPreviewSender()
  return null
}

/** Past the grace period the last viewer leaving waits out. */
const settleRelease = (): void => {
  act(() => {
    jest.advanceTimersByTime(1000)
  })
}

describe('useIpcPreviewSender', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    resetIpcApiMock()
    __resetIpcPreviewSenderForTests()
  })

  afterEach(() => {
    cleanup()
    jest.useRealTimers()
  })

  it('starts the stream for the first viewer', () => {
    render(<Viewer />)

    expect(enableSender).toHaveBeenCalledTimes(1)
    expect(enableSender).toHaveBeenCalledWith({ sender: 'ipc' })
  })

  it('does not start it again for a second viewer', () => {
    render(<Viewer />)
    render(<Viewer />)

    expect(enableSender).toHaveBeenCalledTimes(1)
  })

  it('stops the stream once the last viewer has gone', () => {
    const first = render(<Viewer />)
    settleRelease()
    expect(disableSender).not.toHaveBeenCalled()

    first.unmount()
    settleRelease()

    expect(disableSender).toHaveBeenCalledWith({ sender: 'ipc' })
  })

  it('keeps the stream while another viewer is still mounted', () => {
    const first = render(<Viewer />)
    render(<Viewer />)

    first.unmount()
    settleRelease()

    expect(disableSender).not.toHaveBeenCalled()
  })

  it('does not stop when one view replaces another', () => {
    const leaving = render(<Viewer />)

    // A page change unmounts the old view before the new one mounts.
    leaving.unmount()
    render(<Viewer />)
    settleRelease()

    expect(disableSender).not.toHaveBeenCalled()
    expect(enableSender).toHaveBeenCalledTimes(1)
  })
})
