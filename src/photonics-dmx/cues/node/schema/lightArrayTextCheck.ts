import type {
  LogicNode,
  NodeCueFile,
  ValueSource,
  VariableDefinition,
  VariableType,
} from '../../types/nodeCueTypes'
import { actionLightArrayReads, literalIssue, variableIssue } from '../cueValueRules'

/** Each value a logic node writes into a variable, with the type it writes it as. */
function variableWrites(
  node: LogicNode,
): { varName: string; valueType: VariableType; value?: ValueSource }[] {
  if (node.logicType === 'indexed-variable') {
    return node.mode === 'set' ? [node] : []
  }
  if (node.logicType !== 'variable' || node.mode === 'get') return []
  return node.assignments && node.assignments.length > 0 ? node.assignments : [node]
}

/**
 * The non-empty texts a string variable can start as or be set to from a literal, by the logic of
 * the cues that can write it.
 */
function literalTexts(variable: VariableDefinition, writers: readonly LogicNode[]): string[] {
  const texts = new Set<string>()
  if (typeof variable.initialValue === 'string') texts.add(variable.initialValue)
  // An indexed-variable node writes a slot of the family, never the variable itself.
  for (const node of writers.filter((w) => w.logicType === 'variable')) {
    for (const { varName, value } of variableWrites(node)) {
      if (varName === variable.name && value?.source === 'literal') texts.add(String(value.value))
    }
  }
  texts.delete('')
  return [...texts]
}

/**
 * Warn about a light-array variable read where a cue takes text, which reads as no text, and about
 * a groups variable a literal can set to names of no group. The runtime reports either only to its
 * log, when the cue plays.
 */
export function checkLightArrayAndGroupTexts(
  file: NodeCueFile,
  _errors: string[],
  warnings: string[],
): void {
  const everyCuesLogic = file.cues.flatMap((cue) => cue.nodes.logic ?? [])
  for (const cue of file.cues) {
    const variables = [...(cue.variables ?? []), ...(file.group.variables ?? [])]
    const logic = cue.nodes.logic ?? []
    for (const action of cue.nodes.actions ?? []) {
      const label = `cue '${cue.name}': action '${action.label ?? action.id}'`
      for (const { field, issue } of actionLightArrayReads(action, variables)) {
        warnings.push(`${label} ${field}: ${issue.message}.`)
      }
      const groups = action.target?.groups
      const variable =
        groups?.source === 'variable' ? variables.find((v) => v.name === groups.name) : undefined
      if (variable?.type !== 'string') continue
      const writers = variable.scope === 'cue' ? logic : everyCuesLogic
      for (const text of literalTexts(variable, writers)) {
        const issue = literalIssue('groups', text)
        if (issue) {
          warnings.push(
            `${label} target.groups reads '${variable.name}', which can hold '${text}': ${issue.message}.`,
          )
        }
      }
    }
    for (const node of logic) {
      for (const { valueType, value } of variableWrites(node)) {
        if (value?.source !== 'variable' || valueType === 'light-array') continue
        const read = variables.find((v) => v.name === value.name)
        const issue =
          read?.type === 'light-array' ? variableIssue(value.name, valueType, variables) : null
        if (issue) warnings.push(`cue '${cue.name}': variable node '${node.id}': ${issue.message}.`)
      }
    }
  }
}
