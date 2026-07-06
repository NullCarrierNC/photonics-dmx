import { describe, expect, it } from '@jest/globals'
import { createDefaultCue, createDefaultFile } from './cueDefaults'
import type { YargNodeCueDefinition } from '../../../../../photonics-dmx/cues/types/nodeCueTypes'

describe('cueDefaults rb3 platform', () => {
  it('creates a YARG-shaped lighting cue fixed to CueType.RB3', () => {
    const cue = createDefaultCue('rb3', 'lighting') as Extract<
      YargNodeCueDefinition,
      { kind: 'lighting' }
    >
    expect(cue.kind).toBe('lighting')
    expect(cue.cueType).toBe('RB3')
    expect(cue.style).toBe('primary')
    // rb3 uses the YARG event vocabulary, never an audio event node.
    expect(cue.nodes.events[0].eventType).not.toMatch(/^audio/)
  })

  it('creates an rb3 file stamped mode: rb3 with a single RB3 cue and RB3 group name', () => {
    const file = createDefaultFile('rb3', 'lighting')
    expect(file.mode).toBe('rb3')
    expect(file.group.name).toBe('New RB3 Group')
    expect(file.cues).toHaveLength(1)
    const cue = file.cues[0] as Extract<YargNodeCueDefinition, { kind: 'lighting' }>
    expect(cue.cueType).toBe('RB3')
    expect(cue.style).toBe('primary')
  })
})
