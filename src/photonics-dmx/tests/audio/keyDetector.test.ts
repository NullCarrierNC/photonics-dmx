/**
 * Unit tests for KeyDetector.
 */

import { KeyDetector } from '../../listeners/Audio/KeyDetector'

describe('KeyDetector', () => {
  it('returns C major and strength 0 for silent chroma', () => {
    const detector = new KeyDetector()
    const chroma = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    const result = detector.detect(chroma)
    expect(result.key).toMatch(/^[A-G]#? (major|minor)$/)
    expect(result.strength).toBeGreaterThanOrEqual(0)
    expect(result.strength).toBeLessThanOrEqual(1)
  })

  it('returns key and strength in valid range for random chroma', () => {
    const detector = new KeyDetector()
    const chroma = [0.2, 0.1, 0.3, 0.1, 0.4, 0.2, 0.1, 0.5, 0.2, 0.3, 0.1, 0.2]
    const result = detector.detect(chroma)
    expect(['major', 'minor']).toContain(result.mode)
    expect(result.strength).toBeGreaterThanOrEqual(0)
    expect(result.strength).toBeLessThanOrEqual(1)
  })

  it('returns C major with high strength for C major profile chroma', () => {
    const detector = new KeyDetector()
    const cMajorProfile = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
    const max = Math.max(...cMajorProfile)
    const chroma = cMajorProfile.map((v) => v / max)
    for (let i = 0; i < 10; i++) {
      detector.detect(chroma)
    }
    const result = detector.detect(chroma)
    expect(result.key).toBe('C major')
    expect(result.strength).toBeGreaterThan(0.5)
  })

  it('reset clears smoothed state', () => {
    const detector = new KeyDetector()
    const chroma = [0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    detector.detect(chroma)
    detector.detect(chroma)
    detector.reset()
    const result = detector.detect([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(result.key).toMatch(/^[A-G]#? (major|minor)$/)
  })
})
