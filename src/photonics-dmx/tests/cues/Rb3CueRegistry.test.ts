import { YargCueRegistry } from '../../cues/registries/YargCueRegistry'
import { getRb3CueRegistry } from '../../cues/registries/Rb3CueRegistry'
import { INetCue, CueStyle } from '../../cues/interfaces/INetCue'
import { ICueGroup } from '../../cues/interfaces/INetCueGroup'
import { CueData, CueType } from '../../cues/types/cueTypes'
import { ILightingController } from '../../controllers/sequencer/interfaces'
import { DmxLightManager } from '../../controllers/DmxLightManager'
import { beforeEach, describe, it, expect } from '@jest/globals'

class MockCue implements INetCue {
  constructor(private _name: string) {}
  get cueId(): string {
    return this._name
  }
  get id(): string {
    return `mock-${this._name}`
  }
  description = 'Mock cue'
  style = CueStyle.Primary
  async execute(
    _data: CueData,
    _controller: ILightingController,
    _lightManager: DmxLightManager,
  ): Promise<void> {}
  onStop(): void {}
  onPause(): void {}
}

const groupWith = (id: string, name: string): ICueGroup => ({
  id,
  name,
  cues: new Map([[CueType.RB3, new MockCue(`${id}-rb3`)]]),
})

describe('Rb3CueRegistry', () => {
  let yarg: YargCueRegistry
  let rb3: YargCueRegistry

  beforeEach(() => {
    yarg = YargCueRegistry.getInstance()
    yarg.reset()
    rb3 = getRb3CueRegistry()
    rb3.reset()
  })

  it('is a distinct instance from the YARG singleton', () => {
    expect(rb3).not.toBe(yarg)
    expect(getRb3CueRegistry()).toBe(rb3)
  })

  it('keeps group registration and enablement isolated from YARG', () => {
    rb3.registerGroup(groupWith('rb3-only', 'RB3 Only'))
    rb3.setEnabledGroups(['rb3-only'])

    expect(rb3.getGroup('rb3-only')).toBeDefined()
    expect(yarg.getGroup('rb3-only')).toBeUndefined()

    yarg.registerGroup(groupWith('yarg-only', 'YARG Only'))
    expect(rb3.getGroup('yarg-only')).toBeUndefined()
  })

  it('keeps selection-mode and consistency-window state isolated', () => {
    rb3.setCueGroupSelectionMode('oncePerSong')
    rb3.setCueConsistencyWindow(9999)

    expect(rb3.getCueGroupSelectionMode()).toBe('oncePerSong')
    expect(yarg.getCueGroupSelectionMode()).toBe('withinSong')
    expect(yarg.getCueConsistencyWindow()).not.toBe(9999)
  })
})
