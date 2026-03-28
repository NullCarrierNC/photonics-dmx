import type { ValueSource } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'

export const isVariableSource = (
  src: ValueSource,
): src is Extract<ValueSource, { source: 'variable' }> => src.source === 'variable'

export const extractLiteralValue = (
  valueSource: ValueSource | undefined,
  defaultValue: string | number = '',
): string | number => {
  if (!valueSource || valueSource.source !== 'literal') {
    return defaultValue
  }
  return typeof valueSource.value === 'number'
    ? valueSource.value
    : String(valueSource.value ?? defaultValue)
}
