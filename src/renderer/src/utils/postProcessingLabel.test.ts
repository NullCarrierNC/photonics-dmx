import { POST_PROCESSING_VALUES } from '../../../photonics-dmx/cues/types/cueTypes'
import { postProcessingLabel } from './postProcessingLabel'

describe('postProcessingLabel', () => {
  it('splits the compound names YARG reports', () => {
    expect(postProcessingLabel('BlackAndWhite')).toBe('Black And White')
    expect(postProcessingLabel('Scanlines_Blue')).toBe('Scanlines Blue')
    expect(postProcessingLabel('Choppy_BlackAndWhite')).toBe('Choppy Black And White')
    expect(postProcessingLabel('PhotoNegative_RedAndBlack')).toBe('Photo Negative Red And Black')
  })

  it('leaves a single-word state alone', () => {
    expect(postProcessingLabel('Default')).toBe('Default')
    expect(postProcessingLabel('Bloom')).toBe('Bloom')
  })

  it('reports a missing state rather than rendering blank', () => {
    expect(postProcessingLabel(undefined)).toBe('Unknown')
  })

  it('produces a readable label for every state', () => {
    for (const state of POST_PROCESSING_VALUES) {
      const label = postProcessingLabel(state)
      expect(label.length).toBeGreaterThan(0)
      expect(label).not.toContain('_')
    }
  })
})
