/**
 * The bundled RB3 motion cues must submit a motion pattern when executed (the same as YARG motion
 * cues), so simulating one actually drives the moving heads.
 */
import fs from 'fs'
import path from 'path'
import { describe, expect, it, jest } from '@jest/globals'
import { NodeCueCompiler } from '../../../../cues/node/compiler/NodeCueCompiler'
import { YargMotionNodeCue } from '../../../../cues/node/runtime/YargMotionNodeCue'
import { validateRb3NodeCueFile } from '../../../../cues/node/schema/validation'
import { DmxLightManager } from '../../../../controllers/DmxLightManager'
import { createMockLightingConfig } from '../../../helpers/testFixtures'
import { defaultCueData } from '../../../../cues/types/cueTypes'
import type { CueData } from '../../../../cues/types/cueTypes'
import type { ILightingController } from '../../../../controllers/sequencer/interfaces'

function mockSequencer() {
  return {
    addEffect: jest.fn(),
    setEffect: jest.fn(),
    removeEffect: jest.fn(),
    removeAllEffects: jest.fn(),
    removeEffectByLayer: jest.fn(),
    addEffectUnblockedName: jest.fn(),
    setEffectUnblockedName: jest.fn(),
    cancelPanTiltClear: jest.fn(),
    schedulePanTiltClear: jest.fn(),
    setPosition: jest.fn(),
    addMotionPattern: jest.fn(),
    removeMotionPattern: jest.fn(),
    getMotionPattern: jest.fn(),
    updateMotionPatternConfig: jest.fn(),
    onBeat: jest.fn(),
  } as unknown as ILightingController
}

function loadRb3MotionCues() {
  const filePath = path.join(
    __dirname,
    '../../../../../../resources/defaults/node-data/cues/rb3/rb3-motion-default.json',
  )
  const result = validateRb3NodeCueFile(JSON.parse(fs.readFileSync(filePath, 'utf8')))
  if (!result.valid) throw new Error('rb3-motion-default.json failed validation')
  return result.data.cues
}

const cueData: CueData = { ...defaultCueData, currentScene: 'Gameplay', trackMode: 'simulated' }

describe('bundled RB3 motion cues execute', () => {
  it('the Wave pattern cue adds a motion pattern on cue-started', () => {
    const wave = loadRb3MotionCues().find((c) => c.id === 'rb3-motion-wave')!
    const cue = new YargMotionNodeCue('rb3-motion-default', NodeCueCompiler.compileCue(wave, 'rb3'))
    const lightManager = new DmxLightManager(createMockLightingConfig())
    const sequencer = mockSequencer()

    cue.execute(cueData, sequencer, lightManager)

    expect(sequencer.addMotionPattern).toHaveBeenCalledTimes(1)
  })

  it('the Still cue executes without error (a static set-position hold, not a pattern)', () => {
    const still = loadRb3MotionCues().find((c) => c.id === 'rb3-motion-still')!
    const cue = new YargMotionNodeCue(
      'rb3-motion-default',
      NodeCueCompiler.compileCue(still, 'rb3'),
    )
    const lightManager = new DmxLightManager(createMockLightingConfig())
    const sequencer = mockSequencer()

    expect(() => cue.execute(cueData, sequencer, lightManager)).not.toThrow()
    expect(sequencer.addMotionPattern).not.toHaveBeenCalled()
  })

  it('every pattern cue adds a motion pattern', () => {
    const lightManager = new DmxLightManager(createMockLightingConfig())
    for (const def of loadRb3MotionCues()) {
      if (def.id === 'rb3-motion-still') continue
      const cue = new YargMotionNodeCue(
        'rb3-motion-default',
        NodeCueCompiler.compileCue(def, 'rb3'),
      )
      const sequencer = mockSequencer()
      cue.execute(cueData, sequencer, lightManager)
      expect(sequencer.addMotionPattern).toHaveBeenCalledTimes(1)
    }
  })
})
