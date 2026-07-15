import { LOGIC_NODE_META, NODE_LOGIC_TYPES } from '../../../cues/types/nodeCueTypes'

describe('LOGIC_NODE_META registry', () => {
  it('lists every logic type in editor-palette order, each with a label', () => {
    expect(NODE_LOGIC_TYPES).toEqual([
      'config-data',
      'cue-data',
      'conditional',
      'delay',
      'lights-from-index',
      'color-from-index',
      'math',
      'expression',
      'clamp',
      'frame-gate',
      'tempo',
      'indexed-variable',
      'led-changed',
      'select-from-list',
      'pulse',
      'random',
      'variable',
      'array-length',
      'concat-lights',
      'create-pairs',
      'build-ring',
      'reverse-lights',
      'shuffle-lights',
      'for-each-light',
      'reverse-colors',
      'concat-colors',
      'shuffle-colors',
      'debugger',
    ])
    for (const t of NODE_LOGIC_TYPES) {
      expect(LOGIC_NODE_META[t].label.length).toBeGreaterThan(0)
    }
  })

  it('classifies the two-port, fan-out, and timing nodes', () => {
    const withPorts = (p: string) => NODE_LOGIC_TYPES.filter((t) => LOGIC_NODE_META[t].ports === p)
    expect(withPorts('true-false')).toEqual(['conditional', 'frame-gate'])
    expect(withPorts('each-done')).toEqual(['led-changed', 'for-each-light'])
    // Timing = needs an engine-stepped path (inert under level mode); the two fan-outs plus delay.
    expect(NODE_LOGIC_TYPES.filter((t) => LOGIC_NODE_META[t].timing)).toEqual([
      'delay',
      'led-changed',
      'for-each-light',
    ])
  })
})
