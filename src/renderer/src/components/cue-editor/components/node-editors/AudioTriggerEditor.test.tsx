/** @jest-environment jsdom */
/**
 * The audio trigger's numbers reach the node when the author has finished with the field, so a
 * partly typed frequency is never written to the cue.
 */
import { describe, expect, it, jest } from '@jest/globals'
import { fireEvent, screen } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import type { AudioTriggerNode } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import AudioTriggerEditor, { AUDIO_TRIGGER_DEFAULTS } from './AudioTriggerEditor'

const trigger = {
  ...AUDIO_TRIGGER_DEFAULTS,
  id: 'trigger-1',
  type: 'event',
} as unknown as AudioTriggerNode

describe('AudioTriggerEditor', () => {
  it('writes a frequency when the author leaves the field, not per keystroke', () => {
    const updateAudioNode = jest.fn()
    renderWithProviders(<AudioTriggerEditor trigger={trigger} updateAudioNode={updateAudioNode} />)
    const field = screen.getByLabelText('Lowest frequency (Hz)')

    fireEvent.change(field, { target: { value: '2' } })
    fireEvent.change(field, { target: { value: '200' } })
    expect(updateAudioNode).not.toHaveBeenCalled()

    fireEvent.blur(field)
    expect(updateAudioNode).toHaveBeenCalledWith(
      expect.objectContaining({
        frequencyRange: { minHz: 200, maxHz: 500 },
      }),
    )
  })

  it('leaves the hold time alone when the field is cleared', () => {
    const updateAudioNode = jest.fn()
    renderWithProviders(
      <AudioTriggerEditor
        trigger={{ ...trigger, holdMs: 250 }}
        updateAudioNode={updateAudioNode}
      />,
    )
    const field = screen.getByLabelText('Hold time (ms)')

    fireEvent.change(field, { target: { value: '' } })
    fireEvent.blur(field)

    expect(updateAudioNode).not.toHaveBeenCalled()
    expect(field).toHaveValue(250)
  })
})
