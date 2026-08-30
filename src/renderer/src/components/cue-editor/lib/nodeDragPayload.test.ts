import { serializeNodeDrag, parseNodeDrag } from './nodeDragPayload'
import type { LogicNode } from '../../../../../photonics-dmx/cues/types/nodeCueTypes'

describe('nodeDragPayload logic round-trip', () => {
  // Every logic type must round-trip through drag serialize/parse, or dragging it from the palette parses
  // to null and produces no node on drop. Guard the whole logic-node vocabulary here.
  const logicTypes: LogicNode['logicType'][] = [
    'variable',
    'math',
    'clamp',
    'expression',
    'select-from-list',
    'pulse',
    'conditional',
    'frame-gate',
    'tempo',
    'indexed-variable',
    'led-changed',
    'cue-data',
    'config-data',
    'lights-from-index',
    'color-from-index',
    'reverse-colors',
    'concat-colors',
    'shuffle-colors',
    'array-length',
    'reverse-lights',
    'create-pairs',
    'concat-lights',
    'build-ring',
    'delay',
    'debugger',
    'random',
    'shuffle-lights',
    'for-each-light',
  ]

  it.each(logicTypes)('round-trips the %s logic node through drag serialize/parse', (logicType) => {
    const parsed = parseNodeDrag(serializeNodeDrag({ kind: 'logic', logicType }))
    expect(parsed).toEqual({ kind: 'logic', logicType })
  })

  it('rejects an unknown logic type rather than creating a broken node', () => {
    expect(
      parseNodeDrag(JSON.stringify({ kind: 'logic', logicType: 'not-a-real-node' })),
    ).toBeNull()
  })
})
