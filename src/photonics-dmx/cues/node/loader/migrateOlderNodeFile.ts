/**
 * Brings a parsed cue or effect file an older build wrote onto what this build accepts, before
 * validation: a cue with no kind reads as lighting, a retired blend mode as replace, an unknown
 * easing as the default, an unused wait count is dropped, a variable name the editor once accepted
 * is renamed with every use of it, an initial value other than a colour takes its type, and a light
 * array passed to an effect's group names passes the names of its groups. Values this build does
 * not know are noted apart from what an older build wrote.
 */
import { VARIABLE_NAME_PATTERN, VARIABLE_TYPES, isVariableName } from '../../types/nodeCueTypes'
import type { EffectDefinition, VariableType } from '../../types/nodeCueTypes'
import { LOCATION_OPTIONS } from '../../../types'
import { CONFIG_LIGHT_ARRAY_GROUPS } from '../../../constants/nodeConstants'
import { renameExpressionVariables } from '../runtime/expressionEvaluator'
import {
  DEFAULT_EASING,
  initialValueAsRead,
  initialValueIssue,
  literalIssue,
  parameterRules,
} from '../cueValueRules'

type JsonObject = Record<string, unknown>

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Blend modes the editor offered up to v0.5.5. Both blend as replace. */
const RETIRED_BLEND_MODES: ReadonlySet<unknown> = new Set(['multiply', 'overlay'])

/** Easing names outside every build's easing set that libraries older builds shipped stored. */
const OLDER_EASINGS: ReadonlySet<unknown> = new Set(['sin-out'])

/** What a load changed in a parsed file, one note per kind of change. */
export interface NodeFileChanges {
  /** Changes to what an older build wrote. */
  older: string[]
  /**
   * Values this build does not know, each read as what it plays as here or left for the compiler
   * to report. A newer build may have written them, so the file is left as it is on disk.
   */
  unknown: string[]
}

/** Logic node fields that hold one variable name. */
const NAME_FIELDS = [
  'varName',
  'assignTo',
  'anchorVar',
  'assignPhase',
  'assignBeatMs',
  'assignBarMs',
  'assignPhraseMs',
  'assignCycles',
  'assignGroupSize',
  'assignIndex',
  'assignColor',
  'assignEdge',
  'sourceVariable',
  'currentLightVariable',
  'currentIndexVariable',
] as const

/** Logic node fields that hold a list of variable names. */
const NAME_LIST_FIELDS = ['sourceVariables', 'variablesToLog'] as const

/** A cue file's cues, or an effect file's effects. */
function graphsOf(file: JsonObject): JsonObject[] {
  const list = Array.isArray(file.cues)
    ? file.cues
    : Array.isArray(file.effects)
      ? file.effects
      : []
  return list.filter(isObject)
}

const labelOf = (graph: JsonObject): string =>
  `'${typeof graph.name === 'string' ? graph.name : String(graph.id)}'`

/** The actions of every graph, each with the label of the graph it sits in. */
function actionsOf(graphs: readonly JsonObject[]): { action: JsonObject; graph: string }[] {
  return graphs.flatMap((graph) => {
    const actions = isObject(graph.nodes) ? graph.nodes.actions : undefined
    return Array.isArray(actions)
      ? actions.filter(isObject).map((action) => ({ action, graph: labelOf(graph) }))
      : []
  })
}

/** Builds before v0.5.3 stored a cue with no kind, and every cue they had was a lighting cue. */
function defaultCueKinds(file: JsonObject): string | null {
  const cues = Array.isArray(file.cues) ? file.cues.filter(isObject) : []
  const changed = cues.filter((cue) => !('kind' in cue))
  for (const cue of changed) cue.kind = 'lighting'
  return changed.length > 0 ? 'Cues stored with no kind now read as lighting cues.' : null
}

function retireBlendModes(graphs: readonly JsonObject[]): string | null {
  const changed = new Set<string>()
  for (const { action, graph } of actionsOf(graphs)) {
    const blendMode = isObject(action.color) ? action.color.blendMode : null
    if (
      isObject(blendMode) &&
      blendMode.source === 'literal' &&
      RETIRED_BLEND_MODES.has(blendMode.value)
    ) {
      blendMode.value = 'replace'
      changed.add(graph)
    }
  }
  return changed.size > 0
    ? `Retired blend mode multiply or overlay in ${[...changed].join(', ')} now reads replace.`
    : null
}

/**
 * An easing literal the runtime does not know plays as the default easing, so it reads as that.
 * Those `fromOlderBuild` picks out are the names older builds shipped, and the rest are names this
 * build does not know. The oldest files hold the easing as a bare string, which validation later
 * wraps.
 */
function replaceUnknownEasings(
  graphs: readonly JsonObject[],
  fromOlderBuild: boolean,
): string | null {
  const values = new Set<string>()
  const changed = new Set<string>()
  const replaces = (value: unknown): boolean =>
    literalIssue('easing', value) !== null && OLDER_EASINGS.has(value) === fromOlderBuild
  for (const { action, graph } of actionsOf(graphs)) {
    const timing = isObject(action.timing) ? action.timing : null
    if (!timing) continue
    const easing = timing.easing
    if (isObject(easing) && easing.source === 'literal') {
      if (!replaces(easing.value)) continue
      values.add(`'${String(easing.value)}'`)
      easing.value = DEFAULT_EASING
    } else if (typeof easing === 'string') {
      if (!replaces(easing)) continue
      values.add(`'${easing}'`)
      timing.easing = DEFAULT_EASING
    } else {
      continue
    }
    changed.add(graph)
  }
  if (changed.size === 0) return null
  const where = `${[...values].join(', ')} in ${[...changed].join(', ')}`
  return fromOlderBuild
    ? `Unknown easing ${where} now reads ${DEFAULT_EASING}.`
    : `Easing ${where} is not one this version knows and plays as ${DEFAULT_EASING}.`
}

/**
 * An action blend mode named in a literal this build does not know stays as it is, and the
 * compiler reports the action. The retired blend modes are older and read as replace.
 */
function findUnknownBlendModes(graphs: readonly JsonObject[]): string | null {
  const values = new Set<string>()
  const found = new Set<string>()
  for (const { action, graph } of actionsOf(graphs)) {
    const source = isObject(action.color) ? action.color.blendMode : null
    if (!isObject(source) || source.source !== 'literal') continue
    const { value } = source
    if (typeof value !== 'string' || value === '' || RETIRED_BLEND_MODES.has(value)) continue
    if (literalIssue('blend-mode', value) === null) continue
    values.add(`'${value}'`)
    found.add(graph)
  }
  return found.size > 0
    ? `Blend mode ${[...values].join(', ')} in ${[...found].join(', ')} is not one this version knows.`
    : null
}

/** Each wait condition field, with the field that counts how many times it must fire. */
const COUNTED_WAITS = [
  ['waitForCondition', 'waitForConditionCount'],
  ['waitUntilCondition', 'waitUntilConditionCount'],
] as const

/**
 * A wait with no condition never counts, so a count below one on it is dropped. The Stage Kit
 * library the v0.4 builds shipped stored a count of 0 there.
 */
function dropUncountedWaitCounts(graphs: readonly JsonObject[]): string | null {
  const changed = new Set<string>()
  for (const { action, graph } of actionsOf(graphs)) {
    const timing = isObject(action.timing) ? action.timing : null
    if (!timing) continue
    for (const [conditionField, countField] of COUNTED_WAITS) {
      const condition = timing[conditionField]
      const count = timing[countField]
      if (!isObject(condition) || condition.source !== 'literal' || condition.value !== 'none') {
        continue
      }
      if (!isObject(count) || count.source !== 'literal' || Number(count.value) >= 1) continue
      delete timing[countField]
      changed.add(graph)
    }
  }
  return changed.size > 0
    ? `A wait count below one on a wait with no condition in ${[...changed].join(', ')} is dropped.`
    : null
}

/**
 * A name that passes {@link isVariableName}: each other character becomes an underscore, a leading
 * digit gets an underscore before it, and a numbered suffix keeps it clear of names in `taken` and
 * of the built-in expression names.
 */
function conformingVariableName(name: string, taken: ReadonlySet<string>): string {
  const cleaned = name.replace(/[^a-zA-Z0-9_]/g, '_')
  const base = /^[a-zA-Z_]/.test(cleaned) ? cleaned : `_${cleaned}`
  let candidate = base
  for (let n = 2; taken.has(candidate) || !isVariableName(candidate); n++) {
    candidate = `${base}_${n}`
  }
  return candidate
}

/** Every variable declaration in the file: a cue file's group variables and each graph's own. */
function declarationsOf(file: JsonObject, graphs: readonly JsonObject[]): JsonObject[] {
  const lists = [isObject(file.group) ? file.group.variables : undefined]
  for (const graph of graphs) lists.push(graph.variables)
  return lists.flatMap((list) => (Array.isArray(list) ? list.filter(isObject) : []))
}

const isVariableType = (value: unknown): value is VariableType =>
  (VARIABLE_TYPES as readonly unknown[]).includes(value)

/**
 * Colour initial values are left to validation. Every build offered only the colours this one
 * knows, so another name comes from a hand edit.
 */
const COLOR_TYPES: ReadonlySet<unknown> = new Set(['color', 'color-array'])

/**
 * An initial value its variable's type cannot hold is read by the runtime as something else, so it
 * is stored as what the runtime reads, such as an unreadable number as 0.
 */
function conformInitialValues(declarations: readonly JsonObject[]): string | null {
  const changed: string[] = []
  for (const declaration of declarations) {
    const { type, initialValue, name } = declaration
    if (!isVariableType(type) || COLOR_TYPES.has(type)) continue
    if (initialValueIssue(type, initialValue) === null) continue
    declaration.initialValue = initialValueAsRead(type, initialValue)
    changed.push(`'${String(name)}' is now ${JSON.stringify(declaration.initialValue)}`)
  }
  return changed.length > 0
    ? `Initial values their type cannot hold now hold what the cue reads: ${changed.join(', ')}.`
    : null
}

/**
 * Renames every variable use under `node`: variable value sources, logic node name fields and the
 * identifiers an expression reads as variables.
 */
function renameUses(node: unknown, renames: ReadonlyMap<string, string>): void {
  if (Array.isArray(node)) {
    for (const item of node) renameUses(item, renames)
    return
  }
  if (!isObject(node)) return
  if (node.source === 'variable' && typeof node.name === 'string') {
    node.name = renames.get(node.name) ?? node.name
  }
  if (node.logicType === 'expression' && typeof node.expression === 'string') {
    node.expression = renameExpressionVariables(node.expression, renames)
  }
  for (const field of NAME_FIELDS) {
    const value = node[field]
    if (typeof value === 'string') node[field] = renames.get(value) ?? value
  }
  for (const field of NAME_LIST_FIELDS) {
    const value = node[field]
    if (Array.isArray(value)) {
      node[field] = value.map(
        (name) => (typeof name === 'string' ? renames.get(name) : name) ?? name,
      )
    }
  }
  for (const child of Object.values(node)) renameUses(child, renames)
}

/**
 * The renames an effect file's load gives its declared variable names, by the effect file's group
 * id. A raiser passes its parameters by those names.
 */
export type EffectFileRenames = (effectFileId: string) => ReadonlyMap<string, string> | undefined

/**
 * The renames of the effect file a cue's raiser raises from, found through the cue's references.
 */
function referencedRenames(
  graph: JsonObject,
  raiser: JsonObject,
  effectFileRenames: EffectFileRenames | undefined,
): ReadonlyMap<string, string> | undefined {
  const references = Array.isArray(graph.effects) ? graph.effects.filter(isObject) : []
  const reference = references.find((ref) => ref.effectId === raiser.effectId)
  return typeof reference?.effectFileId === 'string'
    ? effectFileRenames?.(reference.effectFileId)
    : undefined
}

/**
 * An effect raiser passes its parameters by the effect's variable names. The effect file renames a
 * non-conforming one on its own load, so the raiser's key takes the name `renamesFor` says the
 * effect gave it, and follows the same rule when the effect's renames are not known.
 */
function renameRaiserParameters(
  graph: JsonObject,
  renamesFor: (raiser: JsonObject) => ReadonlyMap<string, string> | undefined,
  renamed: Array<readonly [string, string]>,
): void {
  const raisers = isObject(graph.nodes) ? graph.nodes.effectRaisers : undefined
  if (!Array.isArray(raisers)) return
  for (const raiser of raisers) {
    if (!isObject(raiser) || !isObject(raiser.parameterValues)) continue
    const keys = Object.keys(raiser.parameterValues)
    if (keys.every(isVariableName)) continue
    const effectRenames = renamesFor(raiser)
    const taken = new Set(keys.filter(isVariableName))
    const next: JsonObject = {}
    for (const [key, value] of Object.entries(raiser.parameterValues)) {
      const name = isVariableName(key)
        ? key
        : effectRenames?.get(key) ?? conformingVariableName(key, taken)
      taken.add(name)
      if (name !== key) renamed.push([key, name])
      next[name] = value
    }
    raiser.parameterValues = next
  }
}

/** The name each declared variable a file's load renames takes, by its old name. */
function declaredRenames(declarations: readonly JsonObject[]): Map<string, string> {
  const names = declarations.flatMap((d) => (typeof d.name === 'string' ? [d.name] : []))
  const taken = new Set(names)
  const renames = new Map<string, string>()
  for (const name of names) {
    if (name === '' || isVariableName(name) || renames.has(name)) continue
    const next = conformingVariableName(name, taken)
    taken.add(next)
    renames.set(name, next)
  }
  return renames
}

/** The renames {@link migrateOlderNodeFile} gives a parsed file's declared variable names. */
export function variableRenamesOf(file: unknown): Map<string, string> {
  return isObject(file) ? declaredRenames(declarationsOf(file, graphsOf(file))) : new Map()
}

function renameVariables(
  file: JsonObject,
  graphs: readonly JsonObject[],
  effectFileRenames: EffectFileRenames | undefined,
): Array<string | null> {
  const declarations = declarationsOf(file, graphs)
  const renames = declaredRenames(declarations)

  if (renames.size > 0) {
    for (const declaration of declarations) {
      if (typeof declaration.name === 'string') {
        declaration.name = renames.get(declaration.name) ?? declaration.name
      }
    }
    for (const graph of graphs) renameUses(graph.nodes, renames)
  }

  // A raiser in an effect file that raises one of the file's own effects takes the file's renames.
  const ownEffectIds = new Set(Array.isArray(file.effects) ? graphs.map((effect) => effect.id) : [])
  const renamed: Array<readonly [string, string]> = [...renames]
  for (const graph of graphs) {
    renameRaiserParameters(
      graph,
      (raiser) =>
        ownEffectIds.has(raiser.effectId)
          ? renames
          : referencedRenames(graph, raiser, effectFileRenames),
      renamed,
    )
  }
  return [
    renameNote(
      'Variable names must use letters, digits and underscores',
      renamed.filter(([from]) => !VARIABLE_NAME_PATTERN.test(from)),
    ),
    renameNote(
      'Variable names cannot be built-in expression names',
      renamed.filter(([from]) => VARIABLE_NAME_PATTERN.test(from)),
    ),
  ]
}

/** The effect a cue's reference names, by effect file group id and effect id. */
export type EffectLookup = (effectFileId: string, effectId: string) => EffectDefinition | undefined

/** Logic node fields that read a variable without writing it. */
const READ_ONLY_NAME_FIELDS: ReadonlySet<string> = new Set(['sourceVariable'])

/** Whether a logic node can write variable `name`. */
function writesVariable(node: JsonObject, name: string): boolean {
  const named = NAME_FIELDS.some(
    (field) => !READ_ONLY_NAME_FIELDS.has(field) && node[field] === name,
  )
  const assigned =
    Array.isArray(node.assignments) &&
    node.assignments.some((assignment) => isObject(assignment) && assignment.varName === name)
  return named || assigned
}

/**
 * The groups every light of light-array variable `name` comes from, when each node in `graphs` that
 * writes it reads a whole-group array of the rig configuration. Null when any other node writes it,
 * or none does.
 */
function heldGroups(name: string, graphs: readonly JsonObject[]): string[] | null {
  const groups = new Set<string>()
  let written = false
  for (const graph of graphs) {
    const logic = isObject(graph.nodes) ? graph.nodes.logic : undefined
    for (const node of Array.isArray(logic) ? logic.filter(isObject) : []) {
      if (!writesVariable(node, name)) continue
      const held =
        node.logicType === 'config-data' && typeof node.dataProperty === 'string'
          ? CONFIG_LIGHT_ARRAY_GROUPS.get(node.dataProperty)
          : undefined
      if (!held) return null
      held.forEach((group) => groups.add(group))
      written = true
    }
  }
  return written ? LOCATION_OPTIONS.filter((group) => groups.has(group)) : null
}

/** The declared variables a cue reads, its own before the group's it shadows. */
function variablesOf(file: JsonObject, cue: JsonObject): JsonObject[] {
  const own = Array.isArray(cue.variables) ? cue.variables.filter(isObject) : []
  const group = isObject(file.group) ? file.group.variables : undefined
  return [...own, ...(Array.isArray(group) ? group.filter(isObject) : [])]
}

/**
 * Builds up to v0.7.0 shipped raisers passing a light-array variable to an effect parameter that
 * names the groups its actions target, which reads the lights as text naming no group. The raiser
 * passes the names of the groups the variable's lights come from, where every write of it says.
 */
function nameRaisedLightArrayGroups(file: JsonObject, effects: EffectLookup): string | null {
  const cues = Array.isArray(file.cues) ? file.cues.filter(isObject) : []
  const changed: string[] = []
  for (const cue of cues) {
    const raisers = isObject(cue.nodes) ? cue.nodes.effectRaisers : undefined
    const references = Array.isArray(cue.effects) ? cue.effects.filter(isObject) : []
    const variables = variablesOf(file, cue)
    for (const raiser of Array.isArray(raisers) ? raisers.filter(isObject) : []) {
      const reference = references.find((ref) => ref.effectId === raiser.effectId)
      const effect =
        reference &&
        typeof reference.effectFileId === 'string' &&
        typeof raiser.effectId === 'string'
          ? effects(reference.effectFileId, raiser.effectId)
          : undefined
      if (!effect || !isObject(raiser.parameterValues)) continue
      const effectActions = effect.nodes?.actions ?? []
      for (const [key, source] of Object.entries(raiser.parameterValues)) {
        if (!isObject(source) || source.source !== 'variable') continue
        const variable = variables.find((v) => v.name === source.name)
        const parameter = effect.variables?.find((v) => v.isParameter && v.name === key)
        if (variable?.type !== 'light-array' || !parameter || parameter.type === 'light-array') {
          continue
        }
        if (!parameterRules(parameter, effectActions).includes('groups')) continue
        // A group variable is shared by every cue in the file, so any of them may write it.
        const writers = variable.scope === 'cue' ? [cue] : cues
        const groups = heldGroups(String(source.name), writers)
        if (!groups) continue
        raiser.parameterValues[key] = { source: 'literal', value: groups.join(',') }
        changed.push(
          `${labelOf(cue)} raiser '${String(raiser.id)}' ${key} is now '${groups.join(',')}'`,
        )
      }
    }
  }
  return changed.length > 0
    ? `A light array passed where an effect takes group names now passes the names of its groups: ${changed.join(', ')}.`
    : null
}

/**
 * A note naming each rename once. A raiser key follows the effect it raises, so it can take
 * another name than a variable of the same name.
 */
function renameNote(
  rule: string,
  renamed: ReadonlyArray<readonly [string, string]>,
): string | null {
  if (renamed.length === 0) return null
  const pairs = new Set(renamed.map(([from, to]) => `'${from}' is now '${to}'`))
  return `${rule}: ${[...pairs].join(', ')}.`
}

const notesOf = (notes: ReadonlyArray<string | null>): string[] =>
  notes.filter((note): note is string => note !== null)

/**
 * Rewrites a parsed cue or effect file in place onto what this build reads: what an older build
 * wrote, and values this build does not know. `effectFileRenames` gives the renames of the effect
 * files a cue raises from, and with `effects` a cue file's raisers are also checked against the
 * effects they raise. Returns the notes for each, and none for a file already on the current rules.
 */
export function migrateOlderNodeFile(
  file: unknown,
  effectFileRenames?: EffectFileRenames,
  effects?: EffectLookup,
): NodeFileChanges {
  if (!isObject(file)) return { older: [], unknown: [] }
  const graphs = graphsOf(file)
  const unknown = notesOf([replaceUnknownEasings(graphs, false), findUnknownBlendModes(graphs)])
  const older = notesOf([
    defaultCueKinds(file),
    retireBlendModes(graphs),
    replaceUnknownEasings(graphs, true),
    dropUncountedWaitCounts(graphs),
    ...renameVariables(file, graphs, effectFileRenames),
    conformInitialValues(declarationsOf(file, graphs)),
    effects ? nameRaisedLightArrayGroups(file, effects) : null,
  ])
  return { older, unknown }
}
