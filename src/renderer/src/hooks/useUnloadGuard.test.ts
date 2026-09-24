/** @jest-environment jsdom */
import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { renderHook } from '@testing-library/react'
import * as ipcApi from '../ipcApi'

jest.mock(
  '../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

import { useUnloadGuard } from './useUnloadGuard'

const reported = () =>
  jest.mocked(ipcApi.reportUnsavedChanges).mock.calls.map(([unsaved]) => unsaved)

describe('useUnloadGuard', () => {
  afterEach(() => {
    jest.mocked(ipcApi.reportUnsavedChanges).mockClear()
  })

  it('tells main when the page gains and loses unsaved changes', () => {
    const { rerender, unmount } = renderHook(({ dirty }) => useUnloadGuard(dirty), {
      initialProps: { dirty: false },
    })
    rerender({ dirty: true })
    rerender({ dirty: false })
    unmount()

    expect(reported()).toEqual([true, false])
  })

  it('reports the page clean only once every guard on it is clean', () => {
    const first = renderHook(({ dirty }) => useUnloadGuard(dirty), {
      initialProps: { dirty: true },
    })
    const second = renderHook(({ dirty }) => useUnloadGuard(dirty), {
      initialProps: { dirty: true },
    })

    first.rerender({ dirty: false })
    expect(reported()).toEqual([true])

    second.unmount()
    first.unmount()
    expect(reported()).toEqual([true, false])
  })
})
