/** @jest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { waitFor } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../ipcApi'
import { previewRigIdAtom } from '../atoms'
import { useActivePreviewRigs } from './useActivePreviewRigs'
import type { DmxRig } from '../../../photonics-dmx/types'
import { createMockLightingConfig } from '../../../photonics-dmx/tests/helpers/testFixtures'

jest.mock(
  '../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

const activeRig = (id: string): DmxRig => ({
  id,
  name: id,
  active: true,
  config: createMockLightingConfig(),
})

const Harness = () => {
  useActivePreviewRigs()
  return null
}

describe('useActivePreviewRigs', () => {
  beforeEach(() => {
    resetIpcApiMock()
    localStorage.clear()
    jest
      .mocked(ipcApi.getActiveRigs)
      .mockResolvedValue([activeRig('rig-a'), activeRig('rig-b')] as never)
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('moves a preview rig that is not active to the first active rig', async () => {
    const { store } = renderWithProviders(<Harness />, {
      seed: (set) => set(previewRigIdAtom, 'rig-inactive'),
    })

    await waitFor(() => expect(store.get(previewRigIdAtom)).toBe('rig-a'))
  })

  it('keeps a preview rig that is active', async () => {
    const { store } = renderWithProviders(<Harness />, {
      seed: (set) => set(previewRigIdAtom, 'rig-b'),
    })

    await waitFor(() => expect(ipcApi.getActiveRigs).toHaveBeenCalled())
    await Promise.resolve()
    expect(store.get(previewRigIdAtom)).toBe('rig-b')
  })
})
