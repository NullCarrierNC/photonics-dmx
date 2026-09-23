/** @jest-environment jsdom */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { StrictMode, type ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../../ipcApi'
import { useLightsLayoutRig } from './useLightsLayoutRig'

jest.mock(
  '../../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

const strict = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>

describe('useLightsLayoutRig', () => {
  beforeEach(() => {
    resetIpcApiMock()
    jest.mocked(ipcApi.getDmxRigs).mockResolvedValue([] as never)
    jest.mocked(ipcApi.saveDmxRig).mockResolvedValue({ success: true } as never)
  })

  it('saves one default rig on an empty rig list, even when the effect runs twice', async () => {
    const setActiveRigId = jest.fn()
    renderHook(() => useLightsLayoutRig(null, jest.fn(), setActiveRigId, jest.fn()), {
      wrapper: strict,
    })

    await waitFor(() => expect(setActiveRigId).toHaveBeenCalled())
    await act(async () => {})

    expect(ipcApi.saveDmxRig).toHaveBeenCalledTimes(1)
  })

  it('leaves the rig list empty when the save of the default rig is refused', async () => {
    jest
      .mocked(ipcApi.saveDmxRig)
      .mockResolvedValue({ success: false, error: 'disk full' } as never)
    const setRigs = jest.fn()
    const setActiveRigId = jest.fn()
    renderHook(() => useLightsLayoutRig(null, setRigs, setActiveRigId, jest.fn()))

    await waitFor(() => expect(ipcApi.saveDmxRig).toHaveBeenCalled())
    await act(async () => {})

    expect(setRigs.mock.calls.every(([rigs]) => (rigs as unknown[]).length === 0)).toBe(true)
    expect(setActiveRigId).not.toHaveBeenCalled()
  })
})
