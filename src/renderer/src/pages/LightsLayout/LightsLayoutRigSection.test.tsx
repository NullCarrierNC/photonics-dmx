/** @jest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { randomUUID as nodeRandomUUID } from 'node:crypto'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../../ipcApi'
import LightsLayoutRigSection from './LightsLayoutRigSection'

jest.mock(
  '../../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

if (typeof (globalThis.crypto as Crypto | undefined)?.randomUUID !== 'function') {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: { ...(globalThis.crypto ?? {}), randomUUID: nodeRandomUUID },
  })
}

function renderSection() {
  const props = {
    rigs: [],
    activeRigId: null,
    setActiveRigId: jest.fn(),
    rigName: '',
    setRigName: jest.fn(),
    onRigsChange: jest.fn(),
    onBeforeDiscardingUnsaved: async () => true,
    onDuplicate: jest.fn(),
    onDelete: jest.fn(),
  }
  renderWithProviders(<LightsLayoutRigSection {...props} />)
  return props
}

beforeEach(() => resetIpcApiMock())
afterEach(() => cleanup())

describe('LightsLayoutRigSection New Rig', () => {
  it('adds and selects the new rig once its save is accepted', async () => {
    jest.mocked(ipcApi.saveDmxRig).mockResolvedValue({ success: true } as never)
    const props = renderSection()

    await act(async () => {
      fireEvent.click(screen.getByText('New Rig'))
    })

    expect(props.onRigsChange).toHaveBeenCalledTimes(1)
    expect(props.setActiveRigId).toHaveBeenCalledTimes(1)
  })

  it('adds nothing when the save is refused', async () => {
    jest
      .mocked(ipcApi.saveDmxRig)
      .mockResolvedValue({ success: false, error: 'disk full' } as never)
    const props = renderSection()

    await act(async () => {
      fireEvent.click(screen.getByText('New Rig'))
    })

    expect(props.onRigsChange).not.toHaveBeenCalled()
    expect(props.setActiveRigId).not.toHaveBeenCalled()
  })
})
