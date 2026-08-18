import { describe, it, expect } from '@jest/globals'
import { CueSimulator } from '../../sim/CueSimulator'

/**
 * The simulator running an RB3 library: cues resolve against the RB3 registry and each frame carries
 * the StageKit LED bank masks rather than a YARG lighting cue. The Mirror library reflects the front
 * half of the ring onto the back, so a front-only red mask must light front and back alike.
 */

const LIBRARY = 'rb3-mirror'

/** Cell bits 0-3 are the front row, left to right. */
const FRONT_ROW_MASK = 0b00001111

describe('CueSimulator (RB3)', () => {
  it('renders a lit ring from the LED banks and goes dark when they clear', async () => {
    const sim = await CueSimulator.create({
      library: LIBRARY,
      domain: 'rb3',
      frontCount: 4,
      backCount: 4,
      bpm: 0,
    })
    try {
      sim.setCue('RB3')
      sim.setLedBanks({ red: FRONT_ROW_MASK, green: 0, blue: 0, yellow: 0 })
      const timeline = await sim.run(600)

      const allIds = [...timeline.lightOrder.front, ...timeline.lightOrder.back]
      // Mirror puts the front data on the back too, so every light is red.
      for (const id of allIds) {
        const state = sim.getLightState(id)
        expect(state).not.toBeNull()
        expect(state!.red).toBeGreaterThan(0)
        expect(state!.green).toBe(0)
        expect(state!.blue).toBe(0)
      }

      sim.setLedBanks({ red: 0, green: 0, blue: 0, yellow: 0 })
      await sim.run(600)

      for (const id of allIds) {
        expect(sim.getLightState(id)!.red).toBe(0)
      }
    } finally {
      sim.dispose()
    }
  })

  it('rejects a library that is not in the RB3 domain', async () => {
    await expect(
      CueSimulator.create({ library: 'yarg-stagekit', domain: 'rb3', bpm: 0 }),
    ).rejects.toThrow(/not found/)
  })
})
