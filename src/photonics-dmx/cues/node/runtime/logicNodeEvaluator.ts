/**
 * Logic node evaluation for the node execution engine.
 * Handles all logic node types: variable, math, conditional, cue-data, config-data, loops.
 */

import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { CueData } from '../../types/cueTypes';
import { AudioCueData } from '../../types/audioCueTypes';
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
  }

  return edges.map(edge => edge.to);
}
