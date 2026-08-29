/**
 * Handlers for the light-array logic nodes: indexing, reversing, pairing, concatenating, shuffling,
 * and folding the whole rig into the virtual LED ring the Stage Kit chases run on.
 */

import type { TrackedLight } from '../../../../types'
import { shuffle } from '../../../../helpers/utils'
import { UninitializedVariableError } from '../valueResolver'
import { extractConfigDataValue } from '../dataExtractors'
import { log, warnOncePerNode, type LogicHandler } from './handlerContext'

export const lightsFromIndexHandler: LogicHandler<'lights-from-index'> = (logicNode, ctx) => {
  const { nodeId, context, getVarStore, degenerateKey, rigSuffix } = ctx
  // Get the source light array variable
  const sourceVarStore = getVarStore(logicNode.sourceVariable)
  const sourceVar = sourceVarStore.get(logicNode.sourceVariable)

  if (!sourceVar || sourceVar.type !== 'light-array') {
    warnOncePerNode(
      degenerateKey('source-type'),
      `lights-from-index node ${nodeId}: source variable "${logicNode.sourceVariable}" is not a light-array${rigSuffix}`,
    )
    return ctx.next()
  }

  const lightsArray = sourceVar.value as TrackedLight[]

  if (lightsArray.length === 0) {
    warnOncePerNode(
      degenerateKey('source-empty'),
      `lights-from-index node ${nodeId}: source array is empty${rigSuffix}`,
    )
    return ctx.next()
  }

  // Resolve the index value - could be a number, string (comma-separated), or variable
  let indices: number[] = []

  if (logicNode.index.source === 'literal') {
    // Handle literal value - could be a number or comma-separated string
    const indexValue = logicNode.index.value
    if (typeof indexValue === 'number') {
      indices = [Math.floor(indexValue)]
    } else if (typeof indexValue === 'string') {
      // Parse comma-separated list of integers
      indices = indexValue
        .split(',')
        .map((s) => s.trim())
        .map((s) => {
          const parsed = parseInt(s, 10)
          return isNaN(parsed) ? null : parsed
        })
        .filter((idx): idx is number => idx !== null)
    } else {
      // Try to parse as number
      const parsed = Number(indexValue)
      if (!isNaN(parsed)) {
        indices = [Math.floor(parsed)]
      }
    }
  } else {
    // Handle variable source
    const varName = logicNode.index.name
    const cueVar = context.cueLevelVarStore.get(varName)
    const groupVar = context.groupLevelVarStore.get(varName)
    const varValue = cueVar ?? groupVar

    if (varValue) {
      if (varValue.type === 'number') {
        // Single number variable
        indices = [Math.floor(Number(varValue.value))]
      } else if (varValue.type === 'string') {
        // String variable - could be a single number or comma-separated list
        const strValue = String(varValue.value)
        if (strValue.includes(',')) {
          // Comma-separated list
          indices = strValue
            .split(',')
            .map((s) => s.trim())
            .map((s) => {
              const parsed = parseInt(s, 10)
              return isNaN(parsed) ? null : parsed
            })
            .filter((idx): idx is number => idx !== null)
        } else {
          // Single number as string
          const parsed = parseInt(strValue, 10)
          if (!isNaN(parsed)) {
            indices = [parsed]
          }
        }
      } else if (Array.isArray(varValue.value)) {
        // Array variable - assume it's an array of numbers (for future support)
        indices = (varValue.value as unknown[])
          .map((v) => {
            const num = typeof v === 'number' ? v : Number(v)
            return isNaN(num) ? null : Math.floor(num)
          })
          .filter((idx): idx is number => idx !== null)
      } else {
        // Try to parse as number
        const parsed = Number(varValue.value)
        if (!isNaN(parsed)) {
          indices = [Math.floor(parsed)]
        }
      }
    } else {
      throw new UninitializedVariableError(logicNode.index.name)
    }
  }

  // If no valid indices found, return early
  if (indices.length === 0) {
    warnOncePerNode(
      degenerateKey('no-indices'),
      `lights-from-index node ${nodeId}: no valid indices found${rigSuffix}`,
    )
    return ctx.next()
  }

  // Apply wraparound (modulo) and extract lights
  const selectedLights = indices.map((index) => {
    const wrappedIndex = ((index % lightsArray.length) + lightsArray.length) % lightsArray.length
    return lightsArray[wrappedIndex]
  })

  // Assign the array of lights to the target variable
  const targetVarStore = getVarStore(logicNode.assignTo)
  targetVarStore.set(logicNode.assignTo, {
    type: 'light-array',
    value: selectedLights,
  })

  return ctx.next()
}

export const reverseLightsHandler: LogicHandler<'reverse-lights'> = (logicNode, ctx) => {
  const { nodeId, getVarStore } = ctx
  // Get the source light array variable
  const sourceVarStore = getVarStore(logicNode.sourceVariable)
  const sourceVar = sourceVarStore.get(logicNode.sourceVariable)

  if (!sourceVar || sourceVar.type !== 'light-array') {
    log.warn(
      `reverse-lights node ${nodeId}: source variable "${logicNode.sourceVariable}" is not a light-array`,
    )
    return ctx.next()
  }

  const lightsArray = sourceVar.value as TrackedLight[]
  const reversedLights = [...lightsArray].reverse()

  // Assign the reversed array to the target variable
  const targetVarStore = getVarStore(logicNode.assignTo)
  targetVarStore.set(logicNode.assignTo, { type: 'light-array', value: reversedLights })

  return ctx.next()
}

export const createPairsHandler: LogicHandler<'create-pairs'> = (logicNode, ctx) => {
  const { nodeId, getVarStore } = ctx
  // Get the source light array variable
  const sourceVarStore = getVarStore(logicNode.sourceVariable)
  const sourceVar = sourceVarStore.get(logicNode.sourceVariable)

  if (!sourceVar || sourceVar.type !== 'light-array') {
    log.warn(
      `create-pairs node ${nodeId}: source variable "${logicNode.sourceVariable}" is not a light-array`,
    )
    return ctx.next()
  }

  const lightsArray = sourceVar.value as TrackedLight[]
  let pairedLights: TrackedLight[]

  if (logicNode.pairType === 'opposite') {
    // Create opposite pairs: [0,4], [1,5], [2,6], [3,7] -> flattened to [0,4,1,5,2,6,3,7]
    pairedLights = createOppositePairs(lightsArray)
  } else {
    // Create diagonal pairs: [6,2], [5,1], [4,0], [3,7] -> flattened
    pairedLights = createDiagonalPairs(lightsArray)
  }

  // Assign the paired lights to the target variable
  const targetVarStore = getVarStore(logicNode.assignTo)
  targetVarStore.set(logicNode.assignTo, { type: 'light-array', value: pairedLights })

  return ctx.next()
}

export const concatLightsHandler: LogicHandler<'concat-lights'> = (logicNode, ctx) => {
  const { nodeId, getVarStore, degenerateKey, rigSuffix } = ctx
  // Concatenate multiple light arrays into one
  const concatResult: TrackedLight[] = []

  for (const varName of logicNode.sourceVariables) {
    const sourceVarStore = getVarStore(varName)
    const sourceVar = sourceVarStore.get(varName)

    if (sourceVar && sourceVar.type === 'light-array') {
      concatResult.push(...(sourceVar.value as TrackedLight[]))
    } else {
      warnOncePerNode(
        degenerateKey(`concat:${varName}`),
        `concat-lights node ${nodeId}: variable "${varName}" is not a light-array, skipping${rigSuffix}`,
      )
    }
  }

  // Assign the concatenated array to the target variable
  const targetVarStore = getVarStore(logicNode.assignTo)
  targetVarStore.set(logicNode.assignTo, { type: 'light-array', value: concatResult })

  return ctx.next()
}

export const buildRingHandler: LogicHandler<'build-ring'> = (logicNode, ctx) => {
  const { lightManager, getVarStore } = ctx
  // Build a virtual RING_STEPS-step (8) LED ring from the whole rig so every chase keeps
  // its authored 8-step shape and timing on any light count. Three rules keyed on
  // divisibility against the ring size:
  //   - n divides 8 (1,2,4,8): repeat the array 8/n times, group size 1.
  //   - n is a multiple of 8 (16,24,...): k-way interleave (k = n/8), step i drives
  //     lights[i], lights[i+8], ..., group size k.
  //   - anything else (3,5,6,10,12,...): resample to 8 steps (step i -> lights[floor(i*n/8)]),
  //     group size 1.
  // 4/8/16 are byte-identical to the prior special-cased folds (doubled / as-is /
  // front-back interleave); other counts intentionally change to hold the 8-step shape.
  if (!lightManager) {
    throw new Error('ring/all-lights logic is not supported without a light manager')
  }
  const allLights = extractConfigDataValue('all-lights-array', lightManager)
  const lights = Array.isArray(allLights) ? allLights : []
  const n = lights.length

  let ring: TrackedLight[]
  let groupSize = 1
  if (n === 0) {
    ring = []
  } else if (RING_STEPS % n === 0) {
    ring = repeatRing(lights, RING_STEPS / n)
  } else if (n % RING_STEPS === 0) {
    groupSize = n / RING_STEPS
    ring = interleaveRingGroups(lights, groupSize)
  } else {
    ring = resampleRing(lights)
  }

  getVarStore(logicNode.assignTo).set(logicNode.assignTo, {
    type: 'light-array',
    value: ring,
  })
  getVarStore(logicNode.assignGroupSize).set(logicNode.assignGroupSize, {
    type: 'number',
    value: groupSize,
  })

  return ctx.next()
}

export const shuffleLightsHandler: LogicHandler<'shuffle-lights'> = (logicNode, ctx) => {
  const { nodeId, getVarStore } = ctx
  const sourceVarStore = getVarStore(logicNode.sourceVariable)
  const sourceVar = sourceVarStore.get(logicNode.sourceVariable)

  if (!sourceVar || sourceVar.type !== 'light-array') {
    log.warn(
      `shuffle-lights node ${nodeId}: source variable "${logicNode.sourceVariable}" is not a light-array`,
    )
    return ctx.next()
  }

  const lightsArray = sourceVar.value as TrackedLight[]
  const shuffled = shuffle(lightsArray)
  const targetVarStore = getVarStore(logicNode.assignTo)
  targetVarStore.set(logicNode.assignTo, { type: 'light-array', value: shuffled })
  return ctx.next()
}

/** Number of steps in the virtual LED ring the Stage Kit cues chase around (build-ring node). */
const RING_STEPS = 8

/** Repeat a light array `times` times (build-ring fold for counts that divide RING_STEPS). */
function repeatRing(lights: TrackedLight[], times: number): TrackedLight[] {
  const result: TrackedLight[] = []
  for (let r = 0; r < times; r++) {
    result.push(...lights)
  }
  return result
}

/**
 * Interleave `k` equal slices of a light array into a RING_STEPS-step ring: step i drives
 * lights[i], lights[i + 8], ..., lights[i + 8*(k-1)] (build-ring fold for multiples of 8).
 * For 16 lights (k=2) this is the front/back interleave [0,8,1,9,...,7,15].
 */
function interleaveRingGroups(lights: TrackedLight[], k: number): TrackedLight[] {
  const result: TrackedLight[] = []
  for (let step = 0; step < RING_STEPS; step++) {
    for (let g = 0; g < k; g++) {
      result.push(lights[step + g * RING_STEPS])
    }
  }
  return result
}

/**
 * Resample a light array to RING_STEPS steps by nearest-floor mapping: step i -> lights[floor(i*n/8)]
 * (build-ring fold for counts that neither divide nor are a multiple of 8). Some lights serve two
 * adjacent steps or are skipped, but the chase keeps its 8-step shape and offset/gap geometry.
 */
function resampleRing(lights: TrackedLight[]): TrackedLight[] {
  const n = lights.length
  const result: TrackedLight[] = []
  for (let step = 0; step < RING_STEPS; step++) {
    result.push(lights[Math.floor((step * n) / RING_STEPS)])
  }
  return result
}

/**
 * Creates opposite pairs from a light array and flattens them.
 * For 8 lights: [0,4], [1,5], [2,6], [3,7] -> [0,4,1,5,2,6,3,7]
 * Pairs are interleaved so that indexing by 2 gives a pair.
 */
function createOppositePairs(lights: TrackedLight[]): TrackedLight[] {
  const result: TrackedLight[] = []
  const halfLength = Math.floor(lights.length / 2)

  for (let i = 0; i < halfLength; i++) {
    result.push(lights[i])
    result.push(lights[i + halfLength])
  }

  // If odd number of lights, include the middle light at the end
  if (lights.length % 2 !== 0) {
    result.push(lights[halfLength])
  }

  return result
}

/**
 * Creates diagonal pairs for sweep patterns and flattens them.
 * For 8 lights: [6,2], [5,1], [4,0], [3,7] -> [6,2,5,1,4,0,3,7]
 * For 4 lights: [2], [1], [0], [3] -> [2,1,0,3]
 * Pairs are interleaved so that indexing by 2 gives a pair.
 */
function createDiagonalPairs(lights: TrackedLight[]): TrackedLight[] {
  const result: TrackedLight[] = []

  if (lights.length >= 8) {
    // For 8+ lights: diagonal sweep pattern (6|2) → (5|1) → (4|0) → (3|7)
    result.push(lights[6], lights[2])
    result.push(lights[5], lights[1])
    result.push(lights[4], lights[0])
    result.push(lights[3], lights[7])
  } else if (lights.length >= 4) {
    // For 4-7 lights: single-light diagonal pattern
    result.push(lights[Math.min(2, lights.length - 1)])
    result.push(lights[Math.min(1, lights.length - 1)])
    result.push(lights[0])
    result.push(lights[Math.min(3, lights.length - 1)])
  } else {
    // For fewer lights, just return them in order
    result.push(...lights)
  }

  return result
}
