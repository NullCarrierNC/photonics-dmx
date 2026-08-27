import type { LogicNode, NodeCueMode } from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import {
  getAudioCueDataPropertyMeta,
  getNetCueDataPropertyMeta,
} from '../../../../../photonics-dmx/constants/cueDataPropertyMeta'

export type AvailableVariable = {
  name: string
  type: string
  scope: 'cue' | 'cue-group'
  validValues?: string[]
}

/**
 * Valid values a cue-data logic node pins onto the variable it assigns to. A variable fed from
 * `cue-data` can only ever hold the values that property defines, so the editor can offer those
 * rather than a free-text field.
 */
function deriveCueDataValidValues(
  logicNodes: LogicNode[] | undefined,
  mode: NodeCueMode,
): Map<string, string[]> {
  const derivedValidValues = new Map<string, string[]>()

  for (const node of logicNodes ?? []) {
    if (node.logicType !== 'cue-data' || !node.assignTo || !node.dataProperty) continue

    const meta =
      mode === 'audio'
        ? getAudioCueDataPropertyMeta(node.dataProperty)
        : getNetCueDataPropertyMeta(node.dataProperty)

    if (!meta?.validValues?.length) continue
    derivedValidValues.set(node.assignTo, [...meta.validValues])
  }

  return derivedValidValues
}

/** Fills in valid values for variables that declare none but are assigned from a cue-data node. */
export function enrichAvailableVariables(
  variables: AvailableVariable[],
  logicNodes: LogicNode[] | undefined,
  mode: NodeCueMode,
): AvailableVariable[] {
  const derivedValidValues = deriveCueDataValidValues(logicNodes, mode)
  if (derivedValidValues.size === 0) return variables

  return variables.map((variable) => {
    if (variable.validValues?.length) return variable

    const validValues = derivedValidValues.get(variable.name)
    return validValues ? { ...variable, validValues } : variable
  })
}
