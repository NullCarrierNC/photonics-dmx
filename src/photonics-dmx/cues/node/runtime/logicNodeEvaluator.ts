/**
 * Logic node evaluation for the node execution engine.
 * Handles all logic node types: variable, math, conditional, cue-data, config-data, loops.
 */

import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { TrackedLight } from '../../../types';
import {
  LogicNode,
  VariableDefinition
} from '../../types/nodeCueTypes';
import { ExecutionContext } from './ExecutionContext';
import { VariableValue } from './executionTypes';
import { Connection } from '../../types/nodeCueTypes';
import { resolveValue, inferType, getVariableStore } from './valueResolver';
import { extractCueDataValue, extractConfigDataValue } from './dataExtractors';

export interface LogicNodeEvaluatorContext {
  cueId: string;
  lightManager: DmxLightManager;
  cueLevelVarStore: Map<string, VariableValue>;
  groupLevelVarStore: Map<string, VariableValue>;
  variableDefinitions: VariableDefinition[];
  executeNode: (nodeId: string, context: ExecutionContext) => void;
}

/**
 * Evaluate a logic node and determine which nodes to execute next.
 * This is where runtime variable evaluation happens.
 */
export function evaluateLogicNode(
  logicNode: LogicNode,
  nodeId: string,
  edges: Connection[],
  context: ExecutionContext,
  evaluatorContext: LogicNodeEvaluatorContext
): string[] {
  const { cueId, lightManager, cueLevelVarStore, groupLevelVarStore, variableDefinitions, executeNode } = evaluatorContext;

  const getVarStore = (varName: string) => getVariableStore(
    varName,
    variableDefinitions,
    cueLevelVarStore,
    groupLevelVarStore
  );

  switch (logicNode.logicType) {
    case 'variable': {
      if (logicNode.mode !== 'get') {
        const value = resolveValue(logicNode.valueType, logicNode.value, context);
        const varStore = getVarStore(logicNode.varName);
        
        if (logicNode.mode === 'init') {
          if (!varStore.has(logicNode.varName)) {
            varStore.set(logicNode.varName, { type: logicNode.valueType, value });
          }
        } else {
          varStore.set(logicNode.varName, { type: logicNode.valueType, value });
        }
      }
      return edges.map(edge => edge.to);
    }

    case 'math': {
      const left = Number(resolveValue('number', logicNode.left, context));
      const right = Number(resolveValue('number', logicNode.right, context));
      let result = 0;
      
      switch (logicNode.operator) {
        case 'add':
          result = left + right;
          break;
        case 'subtract':
          result = left - right;
          break;
        case 'multiply':
          result = left * right;
          break;
        case 'divide':
          result = right === 0 ? 0 : left / right;
          break;
        case 'modulus':
          result = right === 0 ? 0 : left % right;
          break;
      }
      
      if (logicNode.assignTo) {
        const varStore = getVarStore(logicNode.assignTo);
        varStore.set(logicNode.assignTo, { type: 'number', value: result });
      }
      
      return edges.map(edge => edge.to);
    }

    case 'conditional': {
      const left = Number(resolveValue('number', logicNode.left, context));
      const right = Number(resolveValue('number', logicNode.right, context));
      let outcome = false;
      
      switch (logicNode.comparator) {
        case '>':
          outcome = left > right;
          break;
        case '>=':
          outcome = left >= right;
          break;
        case '<':
          outcome = left < right;
          break;
        case '<=':
          outcome = left <= right;
          break;
        case '==':
          outcome = left === right;
          break;
        case '!=':
          outcome = left !== right;
          break;
      }
      
      const branch = outcome ? 'true' : 'false';
      const targeted = edges.filter(edge => edge.fromPort === branch);
      
      if (targeted.length > 0) {
        return targeted.map(edge => edge.to);
      }
      
      return edges.map(edge => edge.to);
    }

    case 'cue-data': {
      const value = extractCueDataValue(logicNode.dataProperty, context.cueData, cueId);
      
      if (logicNode.assignTo) {
        const varStore = getVarStore(logicNode.assignTo);
        const type = inferType(value);
        varStore.set(logicNode.assignTo, { type, value });
      }
      
      return edges.map(edge => edge.to);
    }

    case 'config-data': {
      const value = extractConfigDataValue(logicNode.dataProperty, lightManager);
      
      if (logicNode.assignTo) {
        const varStore = getVarStore(logicNode.assignTo);
        const type = Array.isArray(value) ? 'light-array' : 'number';
        varStore.set(logicNode.assignTo, { type, value });
      }
      
      return edges.map(edge => edge.to);
    }

    case 'lights-from-index': {
      // Get the source light array variable
      const sourceVarStore = getVarStore(logicNode.sourceVariable);
      const sourceVar = sourceVarStore.get(logicNode.sourceVariable);
      
      if (!sourceVar || sourceVar.type !== 'light-array') {
        console.warn(`lights-from-index node ${nodeId}: source variable "${logicNode.sourceVariable}" is not a light-array`);
        return edges.map(edge => edge.to);
      }
      
      const lightsArray = sourceVar.value as TrackedLight[];
      
      if (lightsArray.length === 0) {
        console.warn(`lights-from-index node ${nodeId}: source array is empty`);
        return edges.map(edge => edge.to);
      }
      
      // Resolve the index
      const indexValue = resolveValue('number', logicNode.index, context);
      const index = Math.floor(Number(indexValue));
      
      // Apply wraparound (modulo)
      const wrappedIndex = ((index % lightsArray.length) + lightsArray.length) % lightsArray.length;
      const selectedLight = lightsArray[wrappedIndex];
      
      // Assign the single light to the target variable
      const targetVarStore = getVarStore(logicNode.assignTo);
      targetVarStore.set(logicNode.assignTo, { 
        type: 'light-array', 
        value: [selectedLight] 
      });
      
      return edges.map(edge => edge.to);
    }

    case 'for-loop': {
      const MAX_ITERATIONS = 1000;
      const start = Math.floor(Number(resolveValue('number', logicNode.start, context)));
      const end = Math.floor(Number(resolveValue('number', logicNode.end, context)));
      const step = Math.floor(Number(resolveValue('number', logicNode.step, context)));
      
      if (step === 0) {
        console.warn(`for-loop node ${nodeId}: step is 0, skipping loop`);
        return [];
      }
      
      const counterVarStore = getVarStore(logicNode.counterVariable);
      const downstreamNodes = edges.map(edge => edge.to);
      
      let iterations = 0;
      if (step > 0) {
        for (let i = start; i < end; i += step) {
          if (iterations++ >= MAX_ITERATIONS) {
            console.warn(`for-loop node ${nodeId}: exceeded max iterations (${MAX_ITERATIONS}), terminating loop`);
            break;
          }
          // Set counter variable
          counterVarStore.set(logicNode.counterVariable, { type: 'number', value: i });
          // Execute all downstream nodes synchronously for this iteration
          for (const nextNodeId of downstreamNodes) {
            executeNode(nextNodeId, context);
          }
        }
      } else {
        for (let i = start; i > end; i += step) {
          if (iterations++ >= MAX_ITERATIONS) {
            console.warn(`for-loop node ${nodeId}: exceeded max iterations (${MAX_ITERATIONS}), terminating loop`);
            break;
          }
          counterVarStore.set(logicNode.counterVariable, { type: 'number', value: i });
          for (const nextNodeId of downstreamNodes) {
            executeNode(nextNodeId, context);
          }
        }
      }
      
      // Don't return downstream nodes - we already executed them
      return [];
    }

    case 'while-loop': {
      const MAX_ITERATIONS = 1000;
      const maxIterations = Math.min(
        MAX_ITERATIONS,
        Math.floor(Number(resolveValue('number', logicNode.maxIterations, context)))
      );
      
      const downstreamNodes = edges.map(edge => edge.to);
      let iterations = 0;
      
      while (iterations < maxIterations) {
        // Evaluate condition
        const left = Number(resolveValue('number', logicNode.left, context));
        const right = Number(resolveValue('number', logicNode.right, context));
        let conditionMet = false;
        
        switch (logicNode.comparator) {
          case '>':
            conditionMet = left > right;
            break;
          case '>=':
            conditionMet = left >= right;
            break;
          case '<':
            conditionMet = left < right;
            break;
          case '<=':
            conditionMet = left <= right;
            break;
          case '==':
            conditionMet = left === right;
            break;
          case '!=':
            conditionMet = left !== right;
            break;
        }
        
        if (!conditionMet) {
          break; // Exit loop when condition is false
        }
        
        iterations++;
        
        // Execute all downstream nodes synchronously for this iteration
        for (const nextNodeId of downstreamNodes) {
          executeNode(nextNodeId, context);
        }
      }
      
      if (iterations >= maxIterations) {
        console.warn(`while-loop node ${nodeId}: reached max iterations (${maxIterations}), terminating loop`);
      }
      
      // Don't return downstream nodes - we already executed them
      return [];
    }

    case 'array-length': {
      // Get the source light array variable
      const sourceVarStore = getVarStore(logicNode.sourceVariable);
      const sourceVar = sourceVarStore.get(logicNode.sourceVariable);
      
      let length = 0;
      if (sourceVar && sourceVar.type === 'light-array') {
        const lightsArray = sourceVar.value as TrackedLight[];
        length = lightsArray.length;
      } else {
        console.warn(`array-length node ${nodeId}: source variable "${logicNode.sourceVariable}" is not a light-array`);
      }
      
      // Assign the length to the target variable
      const targetVarStore = getVarStore(logicNode.assignTo);
      targetVarStore.set(logicNode.assignTo, { type: 'number', value: length });
      
      return edges.map(edge => edge.to);
    }

    case 'reverse-lights': {
      // Get the source light array variable
      const sourceVarStore = getVarStore(logicNode.sourceVariable);
      const sourceVar = sourceVarStore.get(logicNode.sourceVariable);
      
      if (!sourceVar || sourceVar.type !== 'light-array') {
        console.warn(`reverse-lights node ${nodeId}: source variable "${logicNode.sourceVariable}" is not a light-array`);
        return edges.map(edge => edge.to);
      }
      
      const lightsArray = sourceVar.value as TrackedLight[];
      const reversedLights = [...lightsArray].reverse();
      
      // Assign the reversed array to the target variable
      const targetVarStore = getVarStore(logicNode.assignTo);
      targetVarStore.set(logicNode.assignTo, { type: 'light-array', value: reversedLights });
      
      return edges.map(edge => edge.to);
    }

    case 'create-pairs': {
      // Get the source light array variable
      const sourceVarStore = getVarStore(logicNode.sourceVariable);
      const sourceVar = sourceVarStore.get(logicNode.sourceVariable);
      
      if (!sourceVar || sourceVar.type !== 'light-array') {
        console.warn(`create-pairs node ${nodeId}: source variable "${logicNode.sourceVariable}" is not a light-array`);
        return edges.map(edge => edge.to);
      }
      
      const lightsArray = sourceVar.value as TrackedLight[];
      let pairedLights: TrackedLight[];
      
      if (logicNode.pairType === 'opposite') {
        // Create opposite pairs: [0,4], [1,5], [2,6], [3,7] -> flattened to [0,4,1,5,2,6,3,7]
        pairedLights = createOppositePairs(lightsArray);
      } else {
        // Create diagonal pairs: [6,2], [5,1], [4,0], [3,7] -> flattened
        pairedLights = createDiagonalPairs(lightsArray);
      }
      
      // Assign the paired lights to the target variable
      const targetVarStore = getVarStore(logicNode.assignTo);
      targetVarStore.set(logicNode.assignTo, { type: 'light-array', value: pairedLights });
      
      return edges.map(edge => edge.to);
    }

    case 'concat-lights': {
      // Concatenate multiple light arrays into one
      const concatResult: TrackedLight[] = [];
      
      for (const varName of logicNode.sourceVariables) {
        const sourceVarStore = getVarStore(varName);
        const sourceVar = sourceVarStore.get(varName);
        
        if (sourceVar && sourceVar.type === 'light-array') {
          concatResult.push(...(sourceVar.value as TrackedLight[]));
        } else {
          console.warn(`concat-lights node ${nodeId}: variable "${varName}" is not a light-array, skipping`);
        }
      }
      
      // Assign the concatenated array to the target variable
      const targetVarStore = getVarStore(logicNode.assignTo);
      targetVarStore.set(logicNode.assignTo, { type: 'light-array', value: concatResult });
      
      return edges.map(edge => edge.to);
    }

    case 'delay': {
      // Delay nodes are handled specially in the execution engine (they block).
      // This case just returns the next nodes - the actual delay happens in NodeExecutionEngine.
      return edges.map(edge => edge.to);
    }
  }

  return edges.map(edge => edge.to);
}

/**
 * Creates opposite pairs from a light array and flattens them.
 * For 8 lights: [0,4], [1,5], [2,6], [3,7] -> [0,4,1,5,2,6,3,7]
 * Pairs are interleaved so that indexing by 2 gives a pair.
 */
function createOppositePairs(lights: TrackedLight[]): TrackedLight[] {
  const result: TrackedLight[] = [];
  const halfLength = Math.floor(lights.length / 2);
  
  for (let i = 0; i < halfLength; i++) {
    result.push(lights[i]);
    result.push(lights[i + halfLength]);
  }
  
  // If odd number of lights, include the middle light at the end
  if (lights.length % 2 !== 0) {
    result.push(lights[halfLength]);
  }
  
  return result;
}

/**
 * Creates diagonal pairs for sweep patterns and flattens them.
 * For 8 lights: [6,2], [5,1], [4,0], [3,7] -> [6,2,5,1,4,0,3,7]
 * For 4 lights: [2], [1], [0], [3] -> [2,1,0,3]
 * Pairs are interleaved so that indexing by 2 gives a pair.
 */
function createDiagonalPairs(lights: TrackedLight[]): TrackedLight[] {
  const result: TrackedLight[] = [];
  
  if (lights.length >= 8) {
    // For 8+ lights: diagonal sweep pattern (6|2) → (5|1) → (4|0) → (3|7)
    result.push(lights[6], lights[2]);
    result.push(lights[5], lights[1]);
    result.push(lights[4], lights[0]);
    result.push(lights[3], lights[7]);
  } else if (lights.length >= 4) {
    // For 4-7 lights: single-light diagonal pattern
    result.push(lights[Math.min(2, lights.length - 1)]);
    result.push(lights[Math.min(1, lights.length - 1)]);
    result.push(lights[0]);
    result.push(lights[Math.min(3, lights.length - 1)]);
  } else {
    // For fewer lights, just return them in order
    result.push(...lights);
  }
  
  return result;
}
