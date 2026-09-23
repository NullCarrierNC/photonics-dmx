/** @jest-environment jsdom */
import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { DEFAULT_AUDIO_BANDS } from '../../../photonics-dmx/listeners/Audio/AudioConfig'
import type { AudioBandDefinition } from '../../../photonics-dmx/listeners/Audio/AudioTypes'

const mockSave = jest.fn(async (_values: { bands: AudioBandDefinition[] }) => {})

jest.mock('../hooks/useAudioConfigFields', () => ({
  useAudioConfigFields: () => ({
    values: { bands: DEFAULT_AUDIO_BANDS },
    loaded: true,
    isSaving: false,
    save: mockSave,
    set: () => {},
    commit: () => Promise.resolve(),
  }),
}))

import AudioBandSettings from './AudioBandSettings'

afterEach(() => {
  cleanup()
  mockSave.mockClear()
})

describe('AudioBandSettings gain box', () => {
  it('holds a gain below the floor while it is typed and saves it held to the floor', () => {
    renderWithProviders(<AudioBandSettings />)
    const box = screen.getAllByRole('spinbutton')[0] as HTMLInputElement

    fireEvent.change(box, { target: { value: '0' } })
    expect(box.value).toBe('0')
    fireEvent.blur(box)

    expect(mockSave).toHaveBeenCalledTimes(1)
    expect(mockSave.mock.calls[0][0].bands[0].gain).toBe(0.1)
  })
})
