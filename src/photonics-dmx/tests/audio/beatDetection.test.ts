/**
 * Beat detection benchmark: run repeatable fixtures through BeatDetector
 * and compare precision, recall, and BPM error to ground truth.
 */

import { BeatDetector } from '../../listeners/Audio/BeatDetector'
import {
  buildSyntheticFixture,
  buildQuietFixture,
  type BeatDetectionFixture,
} from './beatDetectionFixtures'

/** Consider a detected beat correct if within this many ms of a ground-truth beat */
const BEAT_MATCH_MS = 80

function runFixture(
  fixture: BeatDetectionFixture,
  config?: { threshold?: number; minInterval?: number },
): { detectedTimesMs: number[]; finalBpm: number | null; finalConfidence: number } {
  const detector = new BeatDetector({
    threshold: config?.threshold ?? 0.3,
    minInterval: config?.minInterval ?? 100,
  })
  const detectedTimesMs: number[] = []

  for (const frame of fixture.frames) {
    const result = detector.processFrame(
      frame.analysisEnergy,
      frame.bassEnergy,
      frame.spectrumData,
      frame.binSize,
      frame.timeMs,
    )
    if (result.beatDetected) {
      detectedTimesMs.push(frame.timeMs)
    }
  }

  const lastResult = detector.processFrame(
    fixture.frames[fixture.frames.length - 1]!.analysisEnergy,
    fixture.frames[fixture.frames.length - 1]!.bassEnergy,
    fixture.frames[fixture.frames.length - 1]!.spectrumData,
    fixture.frames[fixture.frames.length - 1]!.binSize,
    fixture.frames[fixture.frames.length - 1]!.timeMs + 17,
  )

  return {
    detectedTimesMs,
    finalBpm: lastResult.bpm,
    finalConfidence: lastResult.bpmConfidence,
  }
}

function matchDetectedToExpected(
  detectedMs: number[],
  expectedMs: number[],
  windowMs: number,
): { truePositives: number; falsePositives: number; falseNegatives: number } {
  const matchedExpected = new Set<number>()
  let falsePositives = 0

  for (const d of detectedMs) {
    const found = expectedMs.findIndex((e) => Math.abs(d - e) <= windowMs)
    if (found >= 0) {
      matchedExpected.add(found)
    } else {
      falsePositives++
    }
  }

  const truePositives = matchedExpected.size
  const falseNegatives = expectedMs.length - truePositives

  return { truePositives, falsePositives, falseNegatives }
}

describe('BeatDetector', () => {
  describe('benchmark harness', () => {
    it('runs synthetic 120 BPM fixture and reports metrics', () => {
      const fixture = buildSyntheticFixture(120, 3000, 60)
      const { detectedTimesMs, finalBpm } = runFixture(fixture)

      const { truePositives, falsePositives, falseNegatives } = matchDetectedToExpected(
        detectedTimesMs,
        fixture.expectedBeatTimesMs,
        BEAT_MATCH_MS,
      )

      const precision =
        truePositives + falsePositives > 0 ? truePositives / (truePositives + falsePositives) : 0
      const recall =
        fixture.expectedBeatTimesMs.length > 0
          ? truePositives / (truePositives + falseNegatives)
          : 1

      expect(fixture.expectedBeatTimesMs.length).toBeGreaterThan(0)
      expect(detectedTimesMs.length).toBeGreaterThan(0)
      expect(precision).toBeGreaterThan(0.5)
      expect(recall).toBeGreaterThan(0.5)

      if (finalBpm !== null) {
        const bpmError = Math.abs(finalBpm - fixture.bpm)
        expect(bpmError).toBeLessThan(15)
      }
    })

    it('locks onto BPM with outlier rejection and confidence', () => {
      const fixture = buildSyntheticFixture(120, 4000, 60)
      const { finalBpm, finalConfidence } = runFixture(fixture)

      expect(finalBpm).not.toBeNull()
      expect(finalBpm).toBeGreaterThanOrEqual(100)
      expect(finalBpm).toBeLessThanOrEqual(140)
      expect(finalConfidence).toBeGreaterThanOrEqual(0)
      expect(finalConfidence).toBeLessThanOrEqual(1)
    })

    it('avoids false positives on quiet fixture', () => {
      const fixture = buildQuietFixture(2000, 60)
      const { detectedTimesMs } = runFixture(fixture)

      expect(fixture.expectedBeatTimesMs.length).toBe(0)
      expect(detectedTimesMs.length).toBeLessThanOrEqual(3)
    })

    it('respects minInterval debounce', () => {
      const fixture = buildSyntheticFixture(180, 2000, 60)
      const { detectedTimesMs } = runFixture(fixture, { minInterval: 150 })

      const intervals: number[] = []
      for (let i = 1; i < detectedTimesMs.length; i++) {
        intervals.push(detectedTimesMs[i]! - detectedTimesMs[i - 1]!)
      }
      const minInterval = intervals.length > 0 ? Math.min(...intervals) : 0
      expect(minInterval).toBeGreaterThanOrEqual(140)
    })
  })
})
