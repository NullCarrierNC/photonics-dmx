import Ajv, { DefinedError, JSONSchemaType } from 'ajv';
import addFormats from 'ajv-formats';
import {
  ActionNode,
  ActionTimingConfig,
  AudioEventNode,
  AudioNodeCueDefinition,
  AudioNodeCueFile,
  AudioEventType,
  Connection,
  LogicComparator,
  LogicNode,
  MathOperator,
  NodeActionConfig,
  NodeActionTarget,
  NodeCueGroupMeta,
  NodeCueFile,
  NodeCueMode,
  NodeEffectType,
  NodeLayoutMetadata,
  YargEventNode,
  YargNodeCueDefinition,
  YargNodeCueFile
} from '../../types/nodeCueTypes';
import {
  BlendMode,
  Brightness,
  Color,
  LightTarget,
  LocationGroup,
  WaitCondition
} from '../../../types';
import {
  COLOR_OPTIONS,
  BRIGHTNESS_OPTIONS,
  BLEND_MODE_OPTIONS,
  LOCATION_OPTIONS,
  LIGHT_TARGET_OPTIONS,
  WAIT_CONDITIONS_WITH_NONE_DELAY,
  AUDIO_EVENT_OPTIONS_WITH_NONE_DELAY
} from '../../../constants/options';

const COLOR_VALUES: Color[] = [...COLOR_OPTIONS];
const BRIGHTNESS_VALUES: Brightness[] = [...BRIGHTNESS_OPTIONS];
const BLEND_MODES: BlendMode[] = [...BLEND_MODE_OPTIONS];
const LOCATION_GROUPS: LocationGroup[] = [...LOCATION_OPTIONS];
const LIGHT_TARGETS: LightTarget[] = [...LIGHT_TARGET_OPTIONS];

const WAIT_CONDITIONS: WaitCondition[] = [...WAIT_CONDITIONS_WITH_NONE_DELAY];

const AUDIO_EVENT_TYPES: AudioEventType[] = [...AUDIO_EVENT_OPTIONS_WITH_NONE_DELAY];

const NODE_EFFECT_TYPES: NodeEffectType[] = [
  'single-color', 'sweep', 'cycle', 'blackout'
] as const;

const LOGIC_COMPARATORS: LogicComparator[] = ['>', '>=', '<', '<=', '==', '!='];
const MATH_OPERATORS: MathOperator[] = ['add', 'subtract', 'multiply', 'divide', 'modulus'];

const ajv = new Ajv({
  allErrors: true,
  allowUnionTypes: true,
  strict: false
});
addFormats(ajv);

const stringIdSchema: JSONSchemaType<string> = {
  type: 'string',
  minLength: 1,
  maxLength: 128
};

const colorSchema: JSONSchemaType<{
  name: Color;
  brightness: Brightness;
  blendMode?: BlendMode;
}> = {
  type: 'object',
  required: ['name', 'brightness'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', enum: COLOR_VALUES },
    brightness: { type: 'string', enum: BRIGHTNESS_VALUES },
    blendMode: { type: 'string', enum: BLEND_MODES, nullable: true }
  }
};

const timingSchema: JSONSchemaType<ActionTimingConfig> = {
  type: 'object',
  required: ['waitForCondition', 'waitForTime', 'duration', 'waitUntilCondition', 'waitUntilTime'],
  additionalProperties: false,
  properties: {
    waitForCondition: { type: 'string', enum: WAIT_CONDITIONS },
    waitForTime: { type: 'number', minimum: 0 },
    waitForConditionCount: { type: 'number', nullable: true, minimum: 0 },
    duration: { type: 'number', minimum: 0 },
    waitUntilCondition: { type: 'string', enum: WAIT_CONDITIONS },
    waitUntilTime: { type: 'number', minimum: 0 },
    waitUntilConditionCount: { type: 'number', nullable: true, minimum: 0 },
    easing: { type: 'string', nullable: true },
    level: { type: 'number', nullable: true, minimum: 0, maximum: 1 }
  }
};

const sweepConfigSchema: JSONSchemaType<NonNullable<NodeActionConfig['sweep']>> = {
  type: 'object',
  additionalProperties: false,
  required: [],
  properties: {
    duration: { type: 'number', minimum: 50, nullable: true },
    fadeIn: { type: 'number', minimum: 0, nullable: true },
    fadeOut: { type: 'number', minimum: 0, nullable: true },
    overlap: { type: 'number', minimum: 0, maximum: 100, nullable: true },
    betweenDelay: { type: 'number', minimum: 0, nullable: true },
    lowColor: { ...colorSchema, nullable: true }
  }
};

const cycleConfigSchema: JSONSchemaType<NonNullable<NodeActionConfig['cycle']>> = {
  type: 'object',
  additionalProperties: false,
  required: [],
  properties: {
    baseColor: { ...colorSchema, nullable: true },
    transitionDuration: { type: 'number', minimum: 10, nullable: true },
    trigger: { type: 'string', enum: WAIT_CONDITIONS, nullable: true }
  }
};

const blackoutConfigSchema: JSONSchemaType<NonNullable<NodeActionConfig['blackout']>> = {
  type: 'object',
  additionalProperties: false,
  required: [],
  properties: {
    duration: { type: 'number', minimum: 10, nullable: true }
  }
};

const actionConfigSchema: JSONSchemaType<NodeActionConfig> = {
  type: 'object',
  additionalProperties: false,
  required: [],
  properties: {
    sweep: { ...sweepConfigSchema, nullable: true },
    cycle: { ...cycleConfigSchema, nullable: true },
    blackout: { ...blackoutConfigSchema, nullable: true },
    custom: { type: 'object', nullable: true, additionalProperties: true }
  }
};

const valueSourceSchema: JSONSchemaType<{
  source: 'literal' | 'variable';
  value?: number | boolean;
  name?: string;
  fallback?: number | boolean;
}> = {
  type: 'object',
  required: ['source'],
  additionalProperties: false,
  properties: {
    source: { type: 'string', enum: ['literal', 'variable'] },
    value: { type: ['number', 'boolean'], nullable: true },
    name: { type: 'string', nullable: true },
    fallback: { type: ['number', 'boolean'], nullable: true }
  },
  allOf: [
    {
      if: {
        properties: {
          source: { const: 'literal' }
        }
      },
      then: {
        required: ['value']
      }
    },
    {
      if: {
        properties: {
          source: { const: 'variable' }
        }
      },
      then: {
        required: ['name']
      }
    }
  ]
};

const variableLogicSchema: JSONSchemaType<LogicNode> = {
  type: 'object',
  required: ['id', 'type', 'logicType', 'mode', 'varName', 'valueType'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'logic' },
    logicType: { type: 'string', const: 'variable' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' }
    },
    mode: { type: 'string', enum: ['set', 'get', 'init'] as const },
    varName: { type: 'string' },
    valueType: { type: 'string', enum: ['number', 'boolean'] as const },
    value: { ...valueSourceSchema, nullable: true }
  }
} as any;

const mathLogicSchema: JSONSchemaType<LogicNode> = {
  type: 'object',
  required: ['id', 'type', 'logicType', 'operator', 'left', 'right'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'logic' },
    logicType: { type: 'string', const: 'math' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' }
    },
    operator: { type: 'string', enum: MATH_OPERATORS },
    left: valueSourceSchema,
    right: valueSourceSchema,
    assignTo: { type: 'string', nullable: true }
  }
} as any;

const conditionalLogicSchema: JSONSchemaType<LogicNode> = {
  type: 'object',
  required: ['id', 'type', 'logicType', 'comparator', 'left', 'right'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'logic' },
    logicType: { type: 'string', const: 'conditional' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' }
    },
    comparator: { type: 'string', enum: LOGIC_COMPARATORS },
    left: valueSourceSchema,
    right: valueSourceSchema
  }
} as any;

const logicNodeSchema: JSONSchemaType<LogicNode> = {
  oneOf: [variableLogicSchema, mathLogicSchema, conditionalLogicSchema]
} as any;

const targetSchema: JSONSchemaType<NodeActionTarget> = {
  type: 'object',
  required: ['groups', 'filter'],
  additionalProperties: false,
  properties: {
    groups: {
      type: 'array',
      items: { type: 'string', enum: LOCATION_GROUPS },
      minItems: 1
    },
    filter: { type: 'string', enum: LIGHT_TARGETS }
  }
};

const actionSchema: JSONSchemaType<ActionNode> = {
  type: 'object',
  required: ['id', 'type', 'effectType', 'target', 'color', 'timing'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'action' },
    effectType: { type: 'string', enum: NODE_EFFECT_TYPES },
    target: targetSchema,
    color: colorSchema,
    secondaryColor: { ...colorSchema, nullable: true },
    timing: timingSchema,
    layer: { type: 'integer', nullable: true, minimum: 0 },
    label: { type: 'string', nullable: true },
    inputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' }
    },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' }
    },
    config: { ...actionConfigSchema, nullable: true }
  },
  allOf: [
    {
      if: {
        properties: {
          effectType: { enum: ['cross-fade'] }
        }
      },
      then: {
        required: ['secondaryColor']
      }
    }
  ]
} as any; // eslint-disable-line @typescript-eslint/no-explicit-any

const yargEventSchema: JSONSchemaType<YargEventNode> = {
  type: 'object',
  required: ['id', 'type', 'eventType'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'event' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' }
    },
    eventType: { type: 'string', enum: WAIT_CONDITIONS }
  }
};

const audioEventSchema: JSONSchemaType<AudioEventNode> = {
  type: 'object',
  required: ['id', 'type', 'eventType', 'triggerMode'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'event' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' }
    },
    eventType: { type: 'string', enum: AUDIO_EVENT_TYPES },
    threshold: { type: 'number', nullable: true, minimum: 0, maximum: 1 },
    triggerMode: { type: 'string', enum: ['edge', 'level'] }
  }
};

const connectionSchema: JSONSchemaType<{
  from: string;
  to: string;
  fromPort?: string;
  toPort?: string;
}> = {
  type: 'object',
  required: ['from', 'to'],
  additionalProperties: false,
  properties: {
    from: stringIdSchema,
    to: stringIdSchema,
    fromPort: { type: 'string', nullable: true },
    toPort: { type: 'string', nullable: true }
  }
};

const layoutSchema: JSONSchemaType<NodeLayoutMetadata> = {
  type: 'object',
  additionalProperties: false,
  required: ['nodePositions'],
  properties: {
    nodePositions: {
      type: 'object',
      required: [] as const,
      additionalProperties: {
        type: 'object',
        required: ['x', 'y'],
        additionalProperties: false,
        properties: {
          x: { type: 'number' },
          y: { type: 'number' }
        }
      }
    },
    viewport: {
      type: 'object',
      nullable: true,
      additionalProperties: false,
      required: ['x', 'y', 'zoom'],
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        zoom: { type: 'number', minimum: 0.01 }
      }
    }
  }
};

const yargCueSchema: JSONSchemaType<YargNodeCueDefinition> = {
  type: 'object',
  required: ['id', 'name', 'nodes', 'connections', 'cueType', 'style'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    name: { type: 'string', minLength: 1 },
    description: { type: 'string', nullable: true },
    cueType: { type: 'string' },
    style: { type: 'string', enum: ['primary', 'secondary'] },
    nodes: {
      type: 'object',
      required: ['events', 'actions'],
      additionalProperties: false,
      properties: {
        events: {
          type: 'array',
          minItems: 1,
          items: yargEventSchema
        },
        actions: {
          type: 'array',
          minItems: 1,
          items: actionSchema
        },
        logic: {
          type: 'array',
          nullable: true,
          items: logicNodeSchema,
          default: []
        }
      }
    },
    connections: {
      type: 'array',
      items: connectionSchema
    },
    layout: { ...layoutSchema, nullable: true }
  }
};

const audioCueSchema: JSONSchemaType<AudioNodeCueDefinition> = {
  type: 'object',
  required: ['id', 'name', 'nodes', 'connections', 'cueTypeId'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    name: { type: 'string', minLength: 1 },
    description: { type: 'string', nullable: true },
    cueTypeId: { type: 'string', minLength: 1 },
    nodes: {
      type: 'object',
      required: ['events', 'actions'],
      additionalProperties: false,
      properties: {
        events: {
          type: 'array',
          minItems: 1,
          items: audioEventSchema
        },
        actions: {
          type: 'array',
          minItems: 1,
          items: actionSchema
        },
        logic: {
          type: 'array',
          nullable: true,
          items: logicNodeSchema,
          default: []
        }
      }
    },
    connections: {
      type: 'array',
      items: connectionSchema
    },
    layout: { ...layoutSchema, nullable: true }
  }
};

const groupSchema: JSONSchemaType<NodeCueGroupMeta> = {
  type: 'object',
  required: ['id', 'name'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    name: { type: 'string', minLength: 1 },
    description: { type: 'string', nullable: true }
  }
};

const yargFileSchema: JSONSchemaType<YargNodeCueFile> = {
  type: 'object',
  required: ['version', 'mode', 'group', 'cues'],
  additionalProperties: false,
  properties: {
    version: { type: 'integer', const: 1 },
    mode: { type: 'string', const: 'yarg' },
    group: groupSchema,
    cues: {
      type: 'array',
      minItems: 1,
      items: yargCueSchema
    }
  }
};

const audioFileSchema: JSONSchemaType<AudioNodeCueFile> = {
  type: 'object',
  required: ['version', 'mode', 'group', 'cues'],
  additionalProperties: false,
  properties: {
    version: { type: 'integer', const: 1 },
    mode: { type: 'string', const: 'audio' },
    group: groupSchema,
    cues: {
      type: 'array',
      minItems: 1,
      items: audioCueSchema
    }
  }
};

const validateYargSchema = ajv.compile<YargNodeCueFile>(yargFileSchema);
const validateAudioSchema = ajv.compile<AudioNodeCueFile>(audioFileSchema);

export interface NodeCueValidationSuccess<T extends NodeCueFile> {
  valid: true;
  data: T;
  errors: [];
  mode: NodeCueMode;
}

export interface NodeCueValidationFailure {
  valid: false;
  errors: string[];
}

export type NodeCueValidationResult<T extends NodeCueFile = NodeCueFile> =
  | NodeCueValidationSuccess<T>
  | NodeCueValidationFailure;

const formatErrors = (errors: DefinedError[] | null | undefined): string[] => {
  if (!errors || errors.length === 0) {
    return ['Unknown validation error'];
  }

  return errors.map(err => {
    const instancePath = err.instancePath || 'file';
    const message = err.message || 'Invalid value';
    if (err.params && 'allowedValues' in err.params) {
      return `${instancePath}: ${message} (${(err.params as any).allowedValues.join(', ')})`;
    }
    return `${instancePath}: ${message}`;
  });
};

/**
 * Detects circular dependencies in action node chains using depth-first search.
 * Returns an array of error messages describing any cycles found.
 */
const detectCycles = (
  connections: Connection[],
  nodeIds: Set<string>
): string[] => {
  const errors: string[] = [];

  const actionToAction = new Map<string, string[]>();
  for (const conn of connections) {
    if (nodeIds.has(conn.from) && nodeIds.has(conn.to)) {
      const existing = actionToAction.get(conn.from) ?? [];
      existing.push(conn.to);
      actionToAction.set(conn.from, existing);
    }
  }

  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  const dfs = (nodeId: string, path: string[]): boolean => {
    visited.add(nodeId);
    recursionStack.add(nodeId);

    const neighbours = actionToAction.get(nodeId) ?? [];
    for (const neighbour of neighbours) {
      if (!visited.has(neighbour)) {
        if (dfs(neighbour, [...path, neighbour])) {
          return true;
        }
      } else if (recursionStack.has(neighbour)) {
        const cycleStart = path.indexOf(neighbour);
        const cycle = cycleStart >= 0 ? path.slice(cycleStart) : path;
        cycle.push(neighbour);
        errors.push(`Circular dependency detected: ${cycle.join(' → ')}`);
        return true;
      }
    }

    recursionStack.delete(nodeId);
    return false;
  };

  for (const nodeId of nodeIds) {
    if (!visited.has(nodeId)) {
      dfs(nodeId, [nodeId]);
    }
  }

  return errors;
};

export const validateYargNodeCueFile = (value: unknown): NodeCueValidationResult<YargNodeCueFile> => {
  if (!validateYargSchema(value)) {
    return {
      valid: false,
      errors: formatErrors(validateYargSchema.errors as DefinedError[])
    };
  }

  const semanticErrors: string[] = [];
  for (const cue of value.cues) {
    const logicIds = new Set((cue.nodes.logic ?? []).map(node => node.id));
    const actionIds = new Set(cue.nodes.actions.map(a => a.id));
    const nonEventIds = new Set<string>([...logicIds, ...actionIds]);
    const cycleErrors = detectCycles(cue.connections, nonEventIds);
    semanticErrors.push(...cycleErrors.map(e => `cue '${cue.name}': ${e}`));
  }

  if (semanticErrors.length > 0) {
    return {
      valid: false,
      errors: semanticErrors
    };
  }

  return {
    valid: true,
    data: value,
    errors: [],
    mode: 'yarg'
  };
};

export const validateAudioNodeCueFile = (value: unknown): NodeCueValidationResult<AudioNodeCueFile> => {
  if (!validateAudioSchema(value)) {
    return {
      valid: false,
      errors: formatErrors(validateAudioSchema.errors as DefinedError[])
    };
  }

  const semanticErrors: string[] = [];
  for (const cue of value.cues) {
    const logicIds = new Set((cue.nodes.logic ?? []).map(node => node.id));
    const actionIds = new Set(cue.nodes.actions.map(a => a.id));
    const nonEventIds = new Set<string>([...logicIds, ...actionIds]);
    const cycleErrors = detectCycles(cue.connections, nonEventIds);
    semanticErrors.push(...cycleErrors.map(e => `cue '${cue.name}': ${e}`));
  }

  if (semanticErrors.length > 0) {
    return {
      valid: false,
      errors: semanticErrors
    };
  }

  return {
    valid: true,
    data: value,
    errors: [],
    mode: 'audio'
  };
};

export const validateNodeCueFile = (value: unknown): NodeCueValidationResult => {
  if (!value || typeof value !== 'object') {
    return {
      valid: false,
      errors: ['File must be a JSON object']
    };
  }

  const mode = (value as Partial<NodeCueFile>).mode;
  if (mode === 'audio') {
    return validateAudioNodeCueFile(value);
  }

  if (mode === 'yarg') {
    return validateYargNodeCueFile(value);
  }

  return {
    valid: false,
    errors: ['mode must be either "yarg" or "audio"']
  };
};

