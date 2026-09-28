import { describe, it, expect, jest } from '@jest/globals'
import { CueSimulator, type CueSimulatorOptions } from '../../sim/CueSimulator'
import type { SimTimeline } from '../../sim/types'

jest.setTimeout(30000)

/** Each light's distinct pan values over the run, in the order they appear. */
function pans(timeline: SimTimeline, lightId: string): number[] {
  const seen: number[] = []
  for (const sample of timeline.samples) {
    const pan = sample.lights[lightId]?.pan
    if (pan !== undefined && seen.at(-1) !== pan) seen.push(pan)
  }
  return seen
}

async function run(options: CueSimulatorOptions, cue: string): Promise<SimTimeline> {
  const sim = await CueSimulator.create({ frontCount: 2, backCount: 2, ...options })
  try {
    sim.setCue(cue)
    return await sim.run(3000)
  } finally {
    sim.dispose()
  }
}

describe('CueSimulator with a manual motion cue', () => {
  it.each([
    ['yarg', 'yarg-stagekit', 'Cool_Automatic', 'yarg-motion-default', 'motion-pendulum-slow'],
    ['rb3', 'rb3-stagekit', 'RB3', 'rb3-motion-default', 'rb3-motion-pendulum'],
    [
      'audio',
      'audio-stagekit',
      'audio-sk-cool-auto',
      'audio-motion-default',
      'motion-pendulum-slow',
    ],
  ] as const)(
    'swings the %s heads beside the lighting cue',
    async (domain, library, cue, groupId, cueId) => {
      const timeline = await run({ domain, library, motion: { groupId, cueId } }, cue)

      expect(pans(timeline, 'front-1').length).toBeGreaterThan(2)
    },
  )

  it('leaves pan and tilt out of the samples with no motion cue', async () => {
    const timeline = await run({ library: 'yarg-stagekit' }, 'Cool_Automatic')

    const aimed = timeline.samples.filter((sample) =>
      Object.values(sample.lights).some((light) => light?.pan !== undefined),
    )
    expect(aimed).toEqual([])
  })
})
