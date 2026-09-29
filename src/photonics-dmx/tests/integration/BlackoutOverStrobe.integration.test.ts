import fs from 'fs'
import path from 'path'
import { describe, expect, it, jest } from '@jest/globals'
import { validateYargNodeCueFile } from '../../cues/node/schema/validation'
import { NodeCueCompiler } from '../../cues/node/compiler/NodeCueCompiler'
import { LightingNodeCue } from '../../cues/node/runtime/LightingNodeCue'
import { UnknownValueWarnings } from '../../cues/node/runtime/valueResolver'
import { createMockCueData } from '../../../main/ipc/mockCueData'
import { CueType } from '../../cues/types/cueTypes'
import type { NetNodeCueDefinition } from '../../cues/types/nodeCueTypes'
import { getEffectSingleColor } from '../../effects/effectSingleColor'
import { createSequencerHarness } from '../helpers/sequencerHarness'
import { loadCoreEffectRegistry } from '../helpers/effectRegistry'
import { loadRb3CueFile } from '../helpers/rb3CueFile'

const NODE_DATA = path.join(__dirname, '../../../../resources/defaults/node-data')
const STROBES = [
  CueType.Strobe_Slow,
  CueType.Strobe_Medium,
  CueType.Strobe_Fast,
  CueType.Strobe_Fastest,
]

function yargCues(file: string): NetNodeCueDefinition[] {
  const result = validateYargNodeCueFile(
    JSON.parse(fs.readFileSync(path.join(NODE_DATA, 'cues/yarg', file), 'utf8')),
  )
  if (!result.valid) throw new Error(`${file} failed validation`)
  return result.data.cues
}

const LIBRARIES: Array<[string, 'yarg' | 'rb3', NetNodeCueDefinition[]]> = [
  ['yarg-stagekit', 'yarg', yargCues('yarg-stagekit.json')],
  ['yarg-alt1', 'yarg', yargCues('yarg-alt1.json')],
  ['rb3-stagekit', 'rb3', loadRb3CueFile('rb3-stagekit').cues],
]

const CASES = LIBRARIES.flatMap(([library, mode, cues]) =>
  STROBES.map((cueType) => {
    const def = cues.find((cue) => cue.kind === 'lighting' && cue.cueType === cueType)
    if (!def) throw new Error(`${library}: no ${cueType} cue`)
    return [library, cueType, mode, def] as const
  }),
)

describe('a bundled strobe cue under a timed blackout', () => {
  it.each(CASES)('%s %s leaves every light dark while the blackout fades', (_, __, mode, def) => {
    const h = createSequencerHarness({ frontCount: 2, backCount: 2, strobeCount: 2 })
    try {
      const everyLight = h.lightManager.getLights(['front', 'back', 'strobe'], ['all'])
      h.sequencer.setEffect(
        'look',
        getEffectSingleColor({
          color: { red: 0, green: 0, blue: 255, intensity: 255, opacity: 1, blendMode: 'replace' },
          duration: 0,
          lights: h.lightManager.getLights(['front', 'back'], ['all']),
          layer: 0,
        }),
        true,
      )
      h.advanceBy(50)
      const strobe = new LightingNodeCue(
        'library',
        NodeCueCompiler.compileCue(def, mode),
        loadCoreEffectRegistry(['effect-flash-color']),
        { emit: () => {} },
      )

      void h.sequencer.blackout(500)
      strobe.execute(
        { ...createMockCueData({ venueSize: 'Small', bpm: 120 }), cueStartTime: 0 },
        h.sequencer,
        h.lightManager,
      )
      const brightest: number[] = []
      for (let t = 0; t < 480; t += 10) {
        h.advanceBy(10)
        brightest.push(Math.max(...everyLight.map((light) => h.getLightState(light.id)?.red ?? 0)))
      }

      expect(h.sequencer.isBlackoutActive()).toBe(true)
      expect(Math.max(...brightest)).toBe(0)
    } finally {
      h.cleanup()
    }
  })

  it.each(CASES)('%s %s flashes the strobe lights white with no blackout', (_, __, mode, def) => {
    const h = createSequencerHarness({ frontCount: 2, backCount: 2, strobeCount: 2 })
    const report = jest.spyOn(UnknownValueWarnings.prototype, 'report')
    try {
      const strobeLights = h.lightManager.getLights(['strobe'], ['all'])
      const strobe = new LightingNodeCue(
        'library',
        NodeCueCompiler.compileCue(def, mode),
        loadCoreEffectRegistry(['effect-flash-color']),
        { emit: () => {} },
      )

      strobe.execute(
        { ...createMockCueData({ venueSize: 'Small', bpm: 120 }), cueStartTime: 0 },
        h.sequencer,
        h.lightManager,
      )
      let brightest = 0
      for (let t = 0; t < 100; t += 10) {
        h.advanceBy(10)
        for (const light of strobeLights) {
          brightest = Math.max(brightest, h.getLightState(light.id)?.red ?? 0)
        }
      }

      expect(brightest).toBe(255)
      expect(report).not.toHaveBeenCalled()
    } finally {
      report.mockRestore()
      h.cleanup()
    }
  })
})
