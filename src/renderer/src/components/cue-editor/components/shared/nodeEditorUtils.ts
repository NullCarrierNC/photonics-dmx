import type { ValueSource } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'

export const isVariableSource = (
  src: ValueSource,
): src is Extract<ValueSource, { source: 'variable' }> => src.source === 'variable'
