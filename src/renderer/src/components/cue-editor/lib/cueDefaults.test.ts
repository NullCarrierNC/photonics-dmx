import { describe, expect, it } from '@jest/globals'
import { createDefaultCue, createDefaultFile } from './cueDefaults'
import type { NetNodeCueDefinition } from '../../../../../photonics-dmx/cues/types/nodeCueTypes'

describe('cueDefaults rb3 platform', () => {
  it('creates an rb3 motion cue with no cueType and a set-position action', () => {
    const cue = createDefaultCue('rb3', 'motion') as Extract<
      NetNodeCueDefinition,
      { kind: 'motion' }
    >
    expect(cue.kind).toBe('motion')
    expect(cue).not.toHaveProperty('cueType')
    expect(cue.nodes.actions[0].effectType).toBe('set-position')
    // rb3 motion uses the YARG event vocabulary, never an audio event node.
    expect(cue.nodes.events[0].eventType).not.toMatch(/^audio/)
  })

  it('creates an rb3 motion file stamped mode: rb3 with a motion group name', () => {
    const file = createDefaultFile('rb3', 'motion')
    expect(file.mode).toBe('rb3')
    expect(file.group.name).toBe('New RB3 Motion Group')
    expect(file.cues).toHaveLength(1)
    expect(file.cues[0].kind).toBe('motion')
  })
  it('creates a YARG-shaped lighting cue fixed to CueType.RB3', () => {
    const cue = createDefaultCue('rb3', 'lighting') as Extract<
      NetNodeCueDefinition,
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
    const cue = file.cues[0] as Extract<NetNodeCueDefinition, { kind: 'lighting' }>
    expect(cue.cueType).toBe('RB3')
    expect(cue.style).toBe('primary')
  })
})
