/* eslint-disable @typescript-eslint/no-explicit-any -- schema validation works with unknown payloads */
import Ajv, { DefinedError, JSONSchemaType } from 'ajv'
import addFormats from 'ajv-formats'
import {
  ActionNode,
  ActionTimingConfig,
  AudioEventNode,
  AudioNodeCueDefinition,
  AudioNodeCueFile,
  AudioEventType,
  Connection,
  EventDefinition,
  EventRaiserNode,
  EventListenerNode,
  NotesNode,
  // Effect types - imported for future schema expansion
  EffectRaiserNode as _EffectRaiserNode,
  EffectEventListenerNode as _EffectEventListenerNode,
  EffectReference,
  YargEffectDefinition as _YargEffectDefinition,
  AudioEffectDefinition as _AudioEffectDefinition,
  YargEffectFile,
  AudioEffectFile,
  EffectFile,
  EffectMode,
  LogicComparator,
  LogicNode,
  MathOperator,
  NodeActionConfig,
  NodeActionTarget,
  NodeCueGroupMeta,
  NodeCueFile,
  NodeCueMode,
  NODE_EFFECT_TYPES,
  NodeLayoutMetadata,
  ValueSource,
  VariableDefinition,
  YargEventNode,
  YargNodeCueDefinition,
  YargNodeCueFile,
} from '../../types/nodeCueTypes'
import {
  WaitCondition,
  YargEventType,
  YARG_EVENT_TYPES as YARG_EVENT_TYPES_SOURCE,
} from '../../../types'
import {
  WAIT_CONDITIONS_WITH_NONE_DELAY,
  AUDIO_EVENT_OPTIONS_WITH_NONE_DELAY,
} from '../../../constants/options'

// Song-based wait conditions for action timing (excludes system events)
const WAIT_CONDITIONS: WaitCondition[] = [...WAIT_CONDITIONS_WITH_NONE_DELAY]

// All event types for YARG event nodes (includes system events + song events)
const YARG_EVENT_TYPES: YargEventType[] = [...YARG_EVENT_TYPES_SOURCE]

const AUDIO_EVENT_TYPES: AudioEventType[] = [...AUDIO_EVENT_OPTIONS_WITH_NONE_DELAY]

const LOGIC_COMPARATORS: LogicComparator[] = ['>', '>=', '<', '<=', '==', '!=']
const MATH_OPERATORS: MathOperator[] = ['add', 'subtract', 'multiply', 'divide', 'modulus']

const ajv = new Ajv({
  allErrors: true,
  allowUnionTypes: true,
  strict: false,
})
addFormats(ajv)

const stringIdSchema: JSONSchemaType<string> = {
  type: 'string',
  minLength: 1,
  maxLength: 128,
}

// Define ValueSource schema first so it can be reused
const valueSourceSchema: JSONSchemaType<ValueSource> = {
  type: 'object',
  required: ['source'],
  additionalProperties: false,
  properties: {
    source: { type: 'string', enum: ['literal', 'variable'] },
    value: { type: ['number', 'boolean', 'string'], nullable: true },
    name: { type: 'string', nullable: true },
    fallback: { type: ['number', 'boolean', 'string'], nullable: true },
  },
  allOf: [
    {
      if: {
        properties: {
          source: { const: 'literal' },
        },
      },
      then: {
        required: ['value'],
      },
    },
    {
      if: {
        properties: {
          source: { const: 'variable' },
        },
      },
      then: {
        required: ['name'],
      },
    },
  ],
} as any

const colorSchema: JSONSchemaType<{
  name: ValueSource
  brightness: ValueSource
  blendMode?: ValueSource
  opacity?: ValueSource
}> = {
  type: 'object',
  required: ['name', 'brightness'],
  additionalProperties: false,
  properties: {
    name: valueSourceSchema,
    brightness: valueSourceSchema,
    blendMode: { ...valueSourceSchema, nullable: true },
    opacity: { ...valueSourceSchema, nullable: true },
  },
} as any

const timingSchema: JSONSchemaType<ActionTimingConfig> = {
  type: 'object',
  required: ['waitForCondition', 'waitForTime', 'duration', 'waitUntilCondition', 'waitUntilTime'],
  additionalProperties: false,
  properties: {
    waitForCondition: { type: 'string', enum: WAIT_CONDITIONS },
    waitForTime: valueSourceSchema,
    waitForConditionCount: { ...valueSourceSchema, nullable: true },
    duration: valueSourceSchema,
    waitUntilCondition: { type: 'string', enum: WAIT_CONDITIONS },
    waitUntilTime: valueSourceSchema,
    waitUntilConditionCount: { ...valueSourceSchema, nullable: true },
    easing: { type: 'string', nullable: true },
    level: { ...valueSourceSchema, nullable: true },
  },
} as any

const actionConfigSchema: JSONSchemaType<NodeActionConfig> = {
  type: 'object',
  additionalProperties: false,
  required: [],
  properties: {
    perLightOffsetMs: { type: 'number', nullable: true, minimum: 0 },
    order: { type: 'string', enum: ['linear', 'inverse-linear'], nullable: true },
    loop: { type: 'boolean', nullable: true },
    sweepTime: { type: 'number', nullable: true, minimum: 0 },
    sweepFadeInDuration: { type: 'number', nullable: true, minimum: 0 },
    sweepFadeOutDuration: { type: 'number', nullable: true, minimum: 0 },
    sweepLightOverlap: { type: 'number', nullable: true, minimum: 0, maximum: 100 },
    sweepBetweenDelay: { type: 'number', nullable: true, minimum: 0 },
    sweepDirection: { type: 'string', enum: ['forward', 'reverse'], nullable: true },
    rotationDirection: { type: 'string', enum: ['clockwise', 'counter-clockwise'], nullable: true },
    beatsPerCycle: { type: 'number', nullable: true, minimum: 1 },
    startOffset: {
      oneOf: [{ type: 'number', minimum: 0 }, valueSourceSchema, { type: 'null' }],
    } as any,
    holdTime: { type: 'number', nullable: true, minimum: 0 },
    flashDurationIn: { type: 'number', nullable: true, minimum: 0 },
    flashDurationOut: { type: 'number', nullable: true, minimum: 0 },
    cycleTransitionDuration: { type: 'number', nullable: true, minimum: 0 },
    cycleStepTrigger: { type: 'string', nullable: true },
    cycleBaseColor: { type: 'string', nullable: true },
    cycleBaseBrightness: { type: 'string', nullable: true },
    dualModeEnabled: { type: 'boolean', nullable: true },
    dualModeSolidColor: { type: 'string', nullable: true },
    dualModeSwitchCondition: { type: 'string', nullable: true },
    dualModeIsLargeVenue: { type: 'boolean', nullable: true },
    patternBTarget: {
      type: 'object',
      nullable: true,
      required: ['groups', 'filter'],
      additionalProperties: false,
      properties: { groups: valueSourceSchema, filter: valueSourceSchema },
    } as any,
    switchCondition: { type: 'string', nullable: true },
    completeCondition: { type: 'string', nullable: true },
    custom: { type: 'object', nullable: true, additionalProperties: true },
  },
}

const variableDefinitionSchema: JSONSchemaType<VariableDefinition> = {
  type: 'object',
  required: ['name', 'type', 'scope', 'initialValue'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, pattern: '^[a-zA-Z_][a-zA-Z0-9_]*$' },
    type: {
      type: 'string',
      enum: ['number', 'boolean', 'string', 'color', 'light-array', 'cue-type', 'event'],
    },
    scope: { type: 'string', enum: ['cue', 'cue-group'] },
    initialValue: { type: ['number', 'boolean', 'string', 'array'] } as any,
    description: { type: 'string', nullable: true },
    isParameter: { type: 'boolean', nullable: true },
  },
}

const eventDefinitionSchema: JSONSchemaType<EventDefinition> = {
  type: 'object',
  required: ['name'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, pattern: '^[a-zA-Z_][a-zA-Z0-9_]*$' },
    description: { type: 'string', nullable: true },
  },
}

const effectReferenceSchema: JSONSchemaType<EffectReference> = {
  type: 'object',
  required: ['effectId', 'effectFileId', 'name'],
  additionalProperties: false,
  properties: {
    effectId: { type: 'string', minLength: 1 },
    effectFileId: { type: 'string', minLength: 1 },
    name: { type: 'string', minLength: 1 },
  },
}

const eventRaiserNodeSchema: JSONSchemaType<EventRaiserNode> = {
  type: 'object',
  required: ['id', 'type', 'eventName'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'event-raiser' },
    eventName: { type: 'string' },
    label: { type: 'string', nullable: true },
    inputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
  },
}

const eventListenerNodeSchema: JSONSchemaType<EventListenerNode> = {
  type: 'object',
  required: ['id', 'type', 'eventName'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'event-listener' },
    eventName: { type: 'string' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
  },
}

const notesNodeSchema: JSONSchemaType<NotesNode> = {
  type: 'object',
  required: ['id', 'type', 'note'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'notes' },
    label: { type: 'string', nullable: true },
    title: { type: 'string', nullable: true },
    style: { type: 'string', enum: ['notes', 'info', 'important'], nullable: true },
    note: { type: 'string' },
  },
}

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
      items: { type: 'string' },
    },
    mode: { type: 'string', enum: ['set', 'get', 'init'] as const },
    varName: { type: 'string' },
    valueType: {
      type: 'string',
      enum: ['number', 'boolean', 'string', 'color', 'light-array', 'cue-type', 'event'] as const,
    },
    value: { ...valueSourceSchema, nullable: true },
  },
} as any

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
      items: { type: 'string' },
    },
    operator: { type: 'string', enum: MATH_OPERATORS },
    left: valueSourceSchema,
    right: valueSourceSchema,
    assignTo: { type: 'string', nullable: true },
  },
} as any

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
      items: { type: 'string' },
    },
    comparator: { type: 'string', enum: LOGIC_COMPARATORS },
    left: valueSourceSchema,
    right: valueSourceSchema,
  },
} as any

// Import shared constants for DRY compliance
import {
  YARG_CUE_DATA_PROPERTIES,
  AUDIO_CUE_DATA_PROPERTIES,
  ALL_CONFIG_DATA_PROPERTIES,
} from '../../../constants/nodeConstants'

// Combine cue data properties without duplicates (dedupe overlapping properties like 'cue-name', 'bpm', 'execution-count')
const CUE_DATA_PROPERTIES = [
  ...new Set([...YARG_CUE_DATA_PROPERTIES, ...AUDIO_CUE_DATA_PROPERTIES]),
]

// Use shared config data properties
const CONFIG_DATA_PROPERTIES = ALL_CONFIG_DATA_PROPERTIES

const cueDataLogicSchema: JSONSchemaType<LogicNode> = {
  type: 'object',
  required: ['id', 'type', 'logicType', 'dataProperty'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'logic' },
    logicType: { type: 'string', const: 'cue-data' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    dataProperty: { type: 'string', enum: CUE_DATA_PROPERTIES },
    assignTo: { type: 'string', nullable: true },
  },
} as any

const configDataLogicSchema: JSONSchemaType<LogicNode> = {
  type: 'object',
  required: ['id', 'type', 'logicType', 'dataProperty'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'logic' },
    logicType: { type: 'string', const: 'config-data' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    dataProperty: { type: 'string', enum: CONFIG_DATA_PROPERTIES },
    assignTo: { type: 'string', nullable: true },
  },
} as any

const lightsFromIndexLogicSchema: JSONSchemaType<LogicNode> = {
  type: 'object',
  required: ['id', 'type', 'logicType', 'sourceVariable', 'index', 'assignTo'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'logic' },
    logicType: { type: 'string', const: 'lights-from-index' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    sourceVariable: { type: 'string' },
    index: valueSourceSchema,
    assignTo: { type: 'string' },
  },
} as any

const arrayLengthLogicSchema: JSONSchemaType<LogicNode> = {
  type: 'object',
  required: ['id', 'type', 'logicType', 'sourceVariable', 'assignTo'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'logic' },
    logicType: { type: 'string', const: 'array-length' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    sourceVariable: { type: 'string' },
    assignTo: { type: 'string' },
  },
} as any

const reverseLightsLogicSchema: JSONSchemaType<LogicNode> = {
  type: 'object',
  required: ['id', 'type', 'logicType', 'sourceVariable', 'assignTo'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'logic' },
    logicType: { type: 'string', const: 'reverse-lights' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    sourceVariable: { type: 'string' },
    assignTo: { type: 'string' },
  },
} as any

const createPairsLogicSchema: JSONSchemaType<LogicNode> = {
  type: 'object',
  required: ['id', 'type', 'logicType', 'pairType', 'sourceVariable', 'assignTo'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'logic' },
    logicType: { type: 'string', const: 'create-pairs' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    pairType: { type: 'string', enum: ['opposite', 'diagonal'] as const },
    sourceVariable: { type: 'string' },
    assignTo: { type: 'string' },
  },
} as any

const concatLightsLogicSchema: JSONSchemaType<LogicNode> = {
  type: 'object',
  required: ['id', 'type', 'logicType', 'sourceVariables', 'assignTo'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'logic' },
    logicType: { type: 'string', const: 'concat-lights' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    sourceVariables: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
    },
    assignTo: { type: 'string' },
  },
} as any

const delayLogicSchema: JSONSchemaType<LogicNode> = {
  type: 'object',
  required: ['id', 'type', 'logicType', 'delayTime'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'logic' },
    logicType: { type: 'string', const: 'delay' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    delayTime: valueSourceSchema,
  },
} as any

const debuggerLogicSchema: JSONSchemaType<LogicNode> = {
  type: 'object',
  required: ['id', 'type', 'logicType', 'message', 'variablesToLog'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'logic' },
    logicType: { type: 'string', const: 'debugger' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    message: valueSourceSchema,
    variablesToLog: {
      type: 'array',
      items: { type: 'string' },
    },
  },
} as any

const randomLogicSchema: JSONSchemaType<LogicNode> = {
  type: 'object',
  required: ['id', 'type', 'logicType', 'mode', 'assignTo'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'logic' },
    logicType: { type: 'string', const: 'random' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    mode: { type: 'string', enum: ['random-integer', 'random-choice', 'random-light'] },
    min: { ...valueSourceSchema, nullable: true },
    max: { ...valueSourceSchema, nullable: true },
    choices: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    sourceVariable: { type: 'string', nullable: true },
    count: { ...valueSourceSchema, nullable: true },
    assignTo: { type: 'string' },
  },
} as any

const shuffleLightsLogicSchema: JSONSchemaType<LogicNode> = {
  type: 'object',
  required: ['id', 'type', 'logicType', 'sourceVariable', 'assignTo'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'logic' },
    logicType: { type: 'string', const: 'shuffle-lights' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    sourceVariable: { type: 'string' },
    assignTo: { type: 'string' },
  },
} as any

const forEachLightLogicSchema: JSONSchemaType<LogicNode> = {
  type: 'object',
  required: [
    'id',
    'type',
    'logicType',
    'sourceVariable',
    'currentLightVariable',
    'currentIndexVariable',
  ],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'logic' },
    logicType: { type: 'string', const: 'for-each-light' },
    label: { type: 'string', nullable: true },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    sourceVariable: { type: 'string' },
    currentLightVariable: { type: 'string' },
    currentIndexVariable: { type: 'string' },
  },
} as any

const logicNodeSchema: JSONSchemaType<LogicNode> = {
  oneOf: [
    variableLogicSchema,
    mathLogicSchema,
    conditionalLogicSchema,
    cueDataLogicSchema,
    configDataLogicSchema,
    lightsFromIndexLogicSchema,
    arrayLengthLogicSchema,
    reverseLightsLogicSchema,
    createPairsLogicSchema,
    concatLightsLogicSchema,
    delayLogicSchema,
    debuggerLogicSchema,
    randomLogicSchema,
    shuffleLightsLogicSchema,
    forEachLightLogicSchema,
  ],
} as any

const targetSchema: JSONSchemaType<NodeActionTarget> = {
  type: 'object',
  required: ['groups', 'filter'],
  additionalProperties: false,
  properties: {
    groups: valueSourceSchema,
    filter: valueSourceSchema,
  },
} as any

const actionSchema: JSONSchemaType<ActionNode> = {
  type: 'object',
  required: ['id', 'type', 'effectType', 'target', 'color', 'timing'],
  additionalProperties: true, // Allow editor/backup metadata (e.g. position) to be ignored
  properties: {
    id: stringIdSchema,
    type: { type: 'string', const: 'action' },
    effectType: { type: 'string', enum: NODE_EFFECT_TYPES },
    target: targetSchema,
    color: colorSchema,
    timing: timingSchema,
    layer: { ...valueSourceSchema, nullable: true },
    label: { type: 'string', nullable: true },
    inputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    outputs: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    config: { ...actionConfigSchema, nullable: true },
  },
} as any // eslint-disable-line @typescript-eslint/no-explicit-any

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
      items: { type: 'string' },
    },
    // Uses YARG_EVENT_TYPES which includes both system events (cue-started, cue-called)
    // and song events (beat, measure, keyframe, instruments, etc.)
    eventType: { type: 'string', enum: YARG_EVENT_TYPES },
  },
}

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
      items: { type: 'string' },
    },
    eventType: { type: 'string', enum: AUDIO_EVENT_TYPES },
    threshold: { type: 'number', nullable: true, minimum: 0, maximum: 1 },
    triggerMode: { type: 'string', enum: ['edge', 'level'] },
  },
}

const connectionSchema: JSONSchemaType<{
  from: string
  to: string
  fromPort?: string
  toPort?: string
}> = {
  type: 'object',
  required: ['from', 'to'],
  additionalProperties: false,
  properties: {
    from: stringIdSchema,
    to: stringIdSchema,
    fromPort: { type: 'string', nullable: true },
    toPort: { type: 'string', nullable: true },
  },
}

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
          y: { type: 'number' },
        },
      },
    },
    viewport: {
      type: 'object',
      nullable: true,
      additionalProperties: false,
      required: ['x', 'y', 'zoom'],
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        zoom: { type: 'number', minimum: 0.01 },
      },
    },
  },
}

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
          items: yargEventSchema,
        },
        actions: {
          type: 'array',
          items: actionSchema,
        },
        logic: {
          type: 'array',
          nullable: true,
          items: logicNodeSchema,
          default: [],
        },
        eventRaisers: {
          type: 'array',
          nullable: true,
          items: eventRaiserNodeSchema,
          default: [],
        },
        eventListeners: {
          type: 'array',
          nullable: true,
          items: eventListenerNodeSchema,
          default: [],
        },
        effectRaisers: {
          type: 'array',
          nullable: true,
          items: { type: 'object' } as any, // Simplified schema for now
          default: [],
        },
        effectListeners: {
          type: 'array',
          nullable: true,
          items: { type: 'object' } as any, // Not used in cues, only in effects
          default: [],
        },
        notes: {
          type: 'array',
          nullable: true,
          items: notesNodeSchema,
          default: [],
        },
      },
    },
    connections: {
      type: 'array',
      items: connectionSchema,
    },
    layout: { ...layoutSchema, nullable: true },
    variables: {
      type: 'array',
      nullable: true,
      items: variableDefinitionSchema,
      default: [],
    },
    events: {
      type: 'array',
      nullable: true,
      items: eventDefinitionSchema,
      default: [],
    },
    effects: {
      type: 'array',
      nullable: true,
      items: effectReferenceSchema,
      default: [],
    },
  },
}

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
          items: audioEventSchema,
        },
        actions: {
          type: 'array',
          items: actionSchema,
        },
        logic: {
          type: 'array',
          nullable: true,
          items: logicNodeSchema,
          default: [],
        },
        eventRaisers: {
          type: 'array',
          nullable: true,
          items: eventRaiserNodeSchema,
          default: [],
        },
        eventListeners: {
          type: 'array',
          nullable: true,
          items: eventListenerNodeSchema,
          default: [],
        },
        effectRaisers: {
          type: 'array',
          nullable: true,
          items: { type: 'object' } as any, // Simplified schema for now
          default: [],
        },
        effectListeners: {
          type: 'array',
          nullable: true,
          items: { type: 'object' } as any, // Not used in cues, only in effects
          default: [],
        },
        notes: {
          type: 'array',
          nullable: true,
          items: notesNodeSchema,
          default: [],
        },
      },
    },
    connections: {
      type: 'array',
      items: connectionSchema,
    },
    layout: { ...layoutSchema, nullable: true },
    variables: {
      type: 'array',
      nullable: true,
      items: variableDefinitionSchema,
      default: [],
    },
    events: {
      type: 'array',
      nullable: true,
      items: eventDefinitionSchema,
      default: [],
    },
    effects: {
      type: 'array',
      nullable: true,
      items: effectReferenceSchema,
      default: [],
    },
  },
}

const groupSchema: JSONSchemaType<NodeCueGroupMeta> = {
  type: 'object',
  required: ['id', 'name'],
  additionalProperties: false,
  properties: {
    id: stringIdSchema,
    name: { type: 'string', minLength: 1 },
    description: { type: 'string', nullable: true },
    variables: {
      type: 'array',
      nullable: true,
      items: variableDefinitionSchema,
      default: [],
    },
  },
}

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
      items: yargCueSchema,
    },
  },
}

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
      items: audioCueSchema,
    },
  },
}

const validateYargSchema = ajv.compile<YargNodeCueFile>(yargFileSchema)
const validateAudioSchema = ajv.compile<AudioNodeCueFile>(audioFileSchema)

export interface NodeCueValidationSuccess<T extends NodeCueFile> {
  valid: true
  data: T
  errors: []
  mode: NodeCueMode
}

export interface NodeCueValidationFailure {
  valid: false
  errors: string[]
}

export type NodeCueValidationResult<T extends NodeCueFile = NodeCueFile> =
  | NodeCueValidationSuccess<T>
  | NodeCueValidationFailure

const formatErrors = (errors: DefinedError[] | null | undefined): string[] => {
  if (!errors || errors.length === 0) {
    return ['Unknown validation error']
  }

  return errors.map((err) => {
    const instancePath = err.instancePath || 'file'
    const message = err.message || 'Invalid value'
    if (err.params && 'allowedValues' in err.params) {
      return `${instancePath}: ${message} (${(err.params as any).allowedValues.join(', ')})`
    }
    return `${instancePath}: ${message}`
  })
}

/**
 * Detects circular dependencies that would cause infinite synchronous execution.
 * Only logic-only cycles are reported; cycles that include at least one action node
 * are allowed because the runtime advances phase on action completion, so the loop
 * breaks across async boundaries.
 */
const detectCycles = (
  connections: Connection[],
  nodeIds: Set<string>,
  actionIds: Set<string>,
): string[] => {
  const errors: string[] = []

  const actionToAction = new Map<string, string[]>()
  for (const conn of connections) {
    if (nodeIds.has(conn.from) && nodeIds.has(conn.to)) {
      const existing = actionToAction.get(conn.from) ?? []
      existing.push(conn.to)
      actionToAction.set(conn.from, existing)
    }
  }

  const visited = new Set<string>()
  const recursionStack = new Set<string>()

  const dfs = (nodeId: string, path: string[]): boolean => {
    visited.add(nodeId)
    recursionStack.add(nodeId)

    const neighbours = actionToAction.get(nodeId) ?? []
    for (const neighbour of neighbours) {
      if (!visited.has(neighbour)) {
        if (dfs(neighbour, [...path, neighbour])) {
          return true
        }
      } else if (recursionStack.has(neighbour)) {
        const cycleStart = path.indexOf(neighbour)
        const cycle = cycleStart >= 0 ? path.slice(cycleStart) : path
        cycle.push(neighbour)
        const cycleHasAction = cycle.some((id) => actionIds.has(id))
        if (!cycleHasAction) {
          errors.push(`Circular dependency detected: ${cycle.join(' → ')}`)
        }
        return true
      }
    }

    recursionStack.delete(nodeId)
    return false
  }

  for (const nodeId of nodeIds) {
    if (!visited.has(nodeId)) {
      dfs(nodeId, [nodeId])
    }
  }

  return errors
}

export const validateYargNodeCueFile = (
  value: unknown,
): NodeCueValidationResult<YargNodeCueFile> => {
  if (!validateYargSchema(value)) {
    return {
      valid: false,
      errors: formatErrors(validateYargSchema.errors as DefinedError[]),
    }
  }

  const semanticErrors: string[] = []

  // Check for duplicate group-level variable names
  const groupVariables = value.group.variables ?? []
  const groupVarNames = new Set<string>()
  for (const varDef of groupVariables) {
    if (groupVarNames.has(varDef.name)) {
      semanticErrors.push(`Duplicate group-level variable name: '${varDef.name}'`)
    }
    groupVarNames.add(varDef.name)
  }

  for (const cue of value.cues) {
    // Check for duplicate cue-level variable names
    const cueVariables = cue.variables ?? []
    const cueVarNames = new Set<string>()
    for (const varDef of cueVariables) {
      if (cueVarNames.has(varDef.name)) {
        semanticErrors.push(
          `cue '${cue.name}': Duplicate cue-level variable name: '${varDef.name}'`,
        )
      }
      cueVarNames.add(varDef.name)
    }

    // Check for circular dependencies (only logic-only cycles are invalid)
    const logicIds = new Set((cue.nodes.logic ?? []).map((node) => node.id))
    const actionIds = new Set(cue.nodes.actions.map((a) => a.id))
    const nonEventIds = new Set<string>([...logicIds, ...actionIds])
    const cycleErrors = detectCycles(cue.connections, nonEventIds, actionIds)
    semanticErrors.push(...cycleErrors.map((e) => `cue '${cue.name}': ${e}`))
  }

  if (semanticErrors.length > 0) {
    return {
      valid: false,
      errors: semanticErrors,
    }
  }

  return {
    valid: true,
    data: value,
    errors: [],
    mode: 'yarg',
  }
}

export const validateAudioNodeCueFile = (
  value: unknown,
): NodeCueValidationResult<AudioNodeCueFile> => {
  if (!validateAudioSchema(value)) {
    return {
      valid: false,
      errors: formatErrors(validateAudioSchema.errors as DefinedError[]),
    }
  }

  const semanticErrors: string[] = []

  // Check for duplicate group-level variable names
  const groupVariables = value.group.variables ?? []
  const groupVarNames = new Set<string>()
  for (const varDef of groupVariables) {
    if (groupVarNames.has(varDef.name)) {
      semanticErrors.push(`Duplicate group-level variable name: '${varDef.name}'`)
    }
    groupVarNames.add(varDef.name)
  }

  for (const cue of value.cues) {
    // Check for duplicate cue-level variable names
    const cueVariables = cue.variables ?? []
    const cueVarNames = new Set<string>()
    for (const varDef of cueVariables) {
      if (cueVarNames.has(varDef.name)) {
        semanticErrors.push(
          `cue '${cue.name}': Duplicate cue-level variable name: '${varDef.name}'`,
        )
      }
      cueVarNames.add(varDef.name)
    }

    // Check for circular dependencies (only logic-only cycles are invalid)
    const logicIds = new Set((cue.nodes.logic ?? []).map((node) => node.id))
    const actionIds = new Set(cue.nodes.actions.map((a) => a.id))
    const nonEventIds = new Set<string>([...logicIds, ...actionIds])
    const cycleErrors = detectCycles(cue.connections, nonEventIds, actionIds)
    semanticErrors.push(...cycleErrors.map((e) => `cue '${cue.name}': ${e}`))
  }

  if (semanticErrors.length > 0) {
    return {
      valid: false,
      errors: semanticErrors,
    }
  }

  return {
    valid: true,
    data: value,
    errors: [],
    mode: 'audio',
  }
}

export const validateNodeCueFile = (value: unknown): NodeCueValidationResult => {
  if (!value || typeof value !== 'object') {
    return {
      valid: false,
      errors: ['File must be a JSON object'],
    }
  }

  const mode = (value as Partial<NodeCueFile>).mode
  if (mode === 'audio') {
    return validateAudioNodeCueFile(value)
  }

  if (mode === 'yarg') {
    return validateYargNodeCueFile(value)
  }

  return {
    valid: false,
    errors: ['mode must be either "yarg" or "audio"'],
  }
}

// ============================================================================
// Effect File Validation
// ============================================================================

export interface EffectValidationResult<T = EffectFile> {
  valid: boolean
  data?: T
  errors: string[]
  mode?: EffectMode
}

/**
 * Validate YARG Effect File
 * Note: Simplified validation - expand schemas as needed
 */
export const validateYargEffectFile = (value: unknown): EffectValidationResult<YargEffectFile> => {
  // Basic validation
  if (!value || typeof value !== 'object') {
    return {
      valid: false,
      errors: ['Effect file must be a JSON object'],
    }
  }

  const file = value as any

  // Check required fields
  if (file.version !== 1) {
    return {
      valid: false,
      errors: ['version must be 1'],
    }
  }

  if (file.mode !== 'yarg') {
    return {
      valid: false,
      errors: ['mode must be "yarg"'],
    }
  }

  if (!file.group || !file.group.id || !file.group.name) {
    return {
      valid: false,
      errors: ['group must have id and name'],
    }
  }

  if (!Array.isArray(file.effects)) {
    return {
      valid: false,
      errors: ['effects must be an array'],
    }
  }

  // Basic effect validation
  for (const effect of file.effects) {
    if (!effect.id || !effect.name || !effect.mode) {
      return {
        valid: false,
        errors: ['Each effect must have id, name, and mode'],
      }
    }

    if (effect.mode !== 'yarg') {
      return {
        valid: false,
        errors: [`Effect ${effect.name} mode must be "yarg"`],
      }
    }
  }

  return {
    valid: true,
    data: file as YargEffectFile,
    errors: [],
    mode: 'yarg',
  }
}

/**
 * Validate Audio Effect File
 * Note: Simplified validation - expand schemas as needed
 */
export const validateAudioEffectFile = (
  value: unknown,
): EffectValidationResult<AudioEffectFile> => {
  // Basic validation
  if (!value || typeof value !== 'object') {
    return {
      valid: false,
      errors: ['Effect file must be a JSON object'],
    }
  }

  const file = value as any

  // Check required fields
  if (file.version !== 1) {
    return {
      valid: false,
      errors: ['version must be 1'],
    }
  }

  if (file.mode !== 'audio') {
    return {
      valid: false,
      errors: ['mode must be "audio"'],
    }
  }

  if (!file.group || !file.group.id || !file.group.name) {
    return {
      valid: false,
      errors: ['group must have id and name'],
    }
  }

  if (!Array.isArray(file.effects)) {
    return {
      valid: false,
      errors: ['effects must be an array'],
    }
  }

  // Basic effect validation
  for (const effect of file.effects) {
    if (!effect.id || !effect.name || !effect.mode) {
      return {
        valid: false,
        errors: ['Each effect must have id, name, and mode'],
      }
    }

    if (effect.mode !== 'audio') {
      return {
        valid: false,
        errors: [`Effect ${effect.name} mode must be "audio"`],
      }
    }
  }

  return {
    valid: true,
    data: file as AudioEffectFile,
    errors: [],
    mode: 'audio',
  }
}

/**
 * Validate Effect File (auto-detects mode)
 */
export const validateEffectFile = (value: unknown): EffectValidationResult => {
  if (!value || typeof value !== 'object') {
    return {
      valid: false,
      errors: ['File must be a JSON object'],
    }
  }

  const mode = (value as Partial<EffectFile>).mode
  if (mode === 'audio') {
    return validateAudioEffectFile(value)
  }

  if (mode === 'yarg') {
    return validateYargEffectFile(value)
  }

  return {
    valid: false,
    errors: ['mode must be either "yarg" or "audio"'],
  }
}
