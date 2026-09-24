/** @jest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { randomUUID as nodeRandomUUID } from 'node:crypto'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../../ipcApi'
import { ConfigStrobeType, type DmxRig } from '../../../../photonics-dmx/types'
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

function rigNamed(name: string): DmxRig {
  return {
    id: name,
    name,
    active: false,
    config: {
      numLights: 0,
      lightLayout: { id: 'front', label: 'Front only' },
      strobeType: ConfigStrobeType.None,
      frontLights: [],
      backLights: [],
      strobeLights: [],
    },
  }
}

function renderSection(rigs: DmxRig[] = []) {
  const props = {
    rigs,
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

describe('LightsLayoutRigSection New Rig while a rig is being created', () => {
  it('creates one rig for a double click', async () => {
    let answerSave: (value: unknown) => void = () => {}
    jest.mocked(ipcApi.saveDmxRig).mockReturnValue(
      new Promise((resolve) => {
        answerSave = resolve
      }) as never,
    )
    const props = renderSection([rigNamed('Rig 1')])
    const newRig = screen.getByRole('button', { name: 'New Rig' })

    await act(async () => {
      fireEvent.click(newRig)
      fireEvent.click(newRig)
    })
    expect(newRig).toBeDisabled()
    await act(async () => {
      answerSave({ success: true })
    })

    expect(ipcApi.saveDmxRig).toHaveBeenCalledTimes(1)
    expect(props.onRigsChange).toHaveBeenCalledTimes(1)
    expect(newRig).toBeEnabled()
  })

  it('names the rig after the numbers already taken', async () => {
    renderSection([rigNamed('Rig 1'), rigNamed('rig 3')])

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'New Rig' }))
    })

    expect(ipcApi.saveDmxRig).toHaveBeenCalledWith(expect.objectContaining({ name: 'Rig 4' }))
  })
})
