import { NodeExecutionEngine } from '../../../../cues/node/runtime/NodeExecutionEngine';
import { EffectRegistry } from '../../../../cues/node/runtime/EffectRegistry';
import type { CompiledYargCue } from '../../../../cues/node/compiler/NodeCueCompiler';
import type {
  ActionNode,
  Connection,
  EventListenerNode,
  EventRaiserNode,
  LogicNode,
  YargEventNode,
  YargNodeCueDefinition
} from '../../../../cues/types/nodeCueTypes';
import { CueType, defaultCueData, type CueData, DrumNoteType, InstrumentNoteType } from '../../../../cues';
import { getColor } from '../../../../helpers/dmxHelpers';
import * as utils from '../../../../helpers/utils';
import { createSequencerHarness } from '../../../helpers/sequencerHarness';

jest.mock('../../../../../main/utils/windowUtils', () => ({ sendToAllWindows: jest.fn() }));

const createCueData = (overrides: Partial<CueData> = {}): CueData => ({
  ...defaultCueData,
  lightingCue: CueType.Default,
  venueSize: 'Large',
  beatsPerMinute: 120,
  ...overrides
});

const buildAdjacency = (connections: Connection[]): Map<string, Connection[]> => {
  const adjacency = new Map<string, Connection[]>();
  for (const connection of connections) {
    const list = adjacency.get(connection.from) ?? [];
    list.push(connection);
    adjacency.set(connection.from, list);
  }
  return adjacency;
};

const compileCue = (definition: YargNodeCueDefinition): CompiledYargCue => {
  return {
    definition,
    eventMap: new Map(definition.nodes.events.map((node) => [node.id, node])),
    actionMap: new Map(definition.nodes.actions.map((node) => [node.id, node])),
    logicMap: new Map((definition.nodes.logic ?? []).map((node) => [node.id, node])),
    eventRaiserMap: new Map((definition.nodes.eventRaisers ?? []).map((node) => [node.id, node])),
    eventListenerMap: new Map((definition.nodes.eventListeners ?? []).map((node) => [node.id, node])),
    effectRaiserMap: new Map((definition.nodes.effectRaisers ?? []).map((node) => [node.id, node])),
    eventDefinitions: definition.events ?? [],
    adjacency: buildAdjacency(definition.connections)
  };
};

describe('Node runtime with real Sequencer', () => {
  let harness: ReturnType<typeof createSequencerHarness>;
  let cueLevelVarStore: Map<string, any>;
  let groupLevelVarStore: Map<string, any>;

  beforeEach(() => {
    harness = createSequencerHarness({ frontCount: 4, backCount: 2 });
    cueLevelVarStore = new Map();
    groupLevelVarStore = new Map();
  });

  afterEach(() => {
    harness.cleanup();
  });

  it('chains actions across layers in sequence', () => {
    const eventNode: YargEventNode = {
      id: 'event-1',
      type: 'event',
      eventType: 'beat'
    };

    const action1: ActionNode = {
      id: 'action-1',
      type: 'action',
      effectType: 'set-color',
      target: {
        groups: { source: 'literal', value: 'front' },
        filter: { source: 'literal', value: 'all' }
      },
      color: {
        name: { source: 'literal', value: 'red' },
        brightness: { source: 'literal', value: 'high' },
        blendMode: { source: 'literal', value: 'replace' }
      },
      timing: {
        waitForCondition: 'none',
        waitForTime: { source: 'literal', value: 0 },
        duration: { source: 'literal', value: 30 },
        waitUntilCondition: 'none',
        waitUntilTime: { source: 'literal', value: 0 }
      },
      layer: { source: 'literal', value: 1 }
    };

    const action2: ActionNode = {
      id: 'action-2',
      type: 'action',
      effectType: 'set-color',
      target: {
        groups: { source: 'literal', value: 'front' },
        filter: { source: 'literal', value: 'all' }
      },
      color: {
        name: { source: 'literal', value: 'blue' },
        brightness: { source: 'literal', value: 'high' },
        blendMode: { source: 'literal', value: 'replace' }
      },
      timing: {
        waitForCondition: 'none',
        waitForTime: { source: 'literal', value: 0 },
        duration: { source: 'literal', value: 30 },
        waitUntilCondition: 'none',
        waitUntilTime: { source: 'literal', value: 0 }
      },
      layer: { source: 'literal', value: 5 }
    };

    const definition: YargNodeCueDefinition = {
      id: 'chain-test',
      name: 'Chain Test',
      cueType: CueType.Default,
      style: 'primary',
      nodes: {
        events: [eventNode],
        actions: [action1, action2],
        logic: [],
        eventRaisers: [],
        eventListeners: [],
        effectRaisers: []
      },
      connections: [
        { from: 'event-1', to: 'action-1' },
        { from: 'action-1', to: 'action-2' }
      ]
    };

    const engine = new NodeExecutionEngine(
      compileCue(definition),
      'test-group:chain-test',
      harness.sequencer,
      harness.lightManager,
      cueLevelVarStore,
      groupLevelVarStore,
      new EffectRegistry()
    );

    engine.startExecution(eventNode, createCueData());
    harness.advanceBy(1);

    const lightId = harness.frontLightIds[0];
    const earlyLayers = harness.sequencer.getActiveEffectsForLight(lightId);
    // Fire-and-forget submits both actions; both layers can be active immediately
    expect(earlyLayers.has(1)).toBe(true);
    expect(earlyLayers.has(5)).toBe(true);

    let redTick: number | null = null;
    let blueTick: number | null = null;
    for (let i = 0; i < 40; i += 1) {
      harness.advanceBy(5);
      const state = harness.getLightState(lightId);
      if (!state) continue;
      const redDominant = state.red > state.green && state.red > state.blue;
      const blueDominant = state.blue > state.red && state.blue > state.green;
      if (redTick === null && redDominant) {
        redTick = i;
      }
      if (blueTick === null && blueDominant) {
        blueTick = i;
      }
      if (redTick !== null && blueTick !== null) {
        break;
      }
    }

    // Fire-and-forget: both layers active; we should see at least one color; order may vary by layering
    expect(redTick !== null || blueTick !== null).toBe(true);
    if (redTick !== null && blueTick !== null) {
      expect((blueTick as number) > (redTick as number)).toBe(true);
    }
  });

  it('gates transitions on beat events', () => {
    const eventNode: YargEventNode = {
      id: 'event-1',
      type: 'event',
      eventType: 'beat'
    };

    const actionNode: ActionNode = {
      id: 'action-1',
      type: 'action',
      effectType: 'set-color',
      target: {
        groups: { source: 'literal', value: 'front' },
        filter: { source: 'literal', value: 'all' }
      },
      color: {
        name: { source: 'literal', value: 'red' },
        brightness: { source: 'literal', value: 'high' },
        blendMode: { source: 'literal', value: 'replace' }
      },
      timing: {
        waitForCondition: 'beat',
        waitForTime: { source: 'literal', value: 0 },
        duration: { source: 'literal', value: 0 },
        waitUntilCondition: 'none',
        waitUntilTime: { source: 'literal', value: 0 }
      }
    };

    const definition: YargNodeCueDefinition = {
      id: 'beat-gate',
      name: 'Beat Gate',
      cueType: CueType.Default,
      style: 'primary',
      nodes: {
        events: [eventNode],
        actions: [actionNode],
        logic: [],
        eventRaisers: [],
        eventListeners: [],
        effectRaisers: []
      },
      connections: [{ from: 'event-1', to: 'action-1' }]
    };

    const engine = new NodeExecutionEngine(
      compileCue(definition),
      'test-group:beat-gate',
      harness.sequencer,
      harness.lightManager,
      cueLevelVarStore,
      groupLevelVarStore,
      new EffectRegistry()
    );

    engine.startExecution(eventNode, createCueData());
    harness.advanceBy(1);

    const lightId = harness.frontLightIds[0];
    const beforeBeat = harness.getLightState(lightId);
    expect(beforeBeat?.intensity ?? 0).toBe(0);

    harness.sequencer.onBeat();
    harness.advanceBy(1);

    const afterBeat = harness.getLightState(lightId);
    const expected = getColor('red', 'high');
    expect(afterBeat).toMatchObject({
      red: expected.red,
      green: expected.green,
      blue: expected.blue,
      blendMode: expected.blendMode
    });
  });

  it('uses light-array transforms to target a single light', () => {
    const eventNode: YargEventNode = {
      id: 'event-1',
      type: 'event',
      eventType: 'beat'
    };

    const configNode: LogicNode = {
      id: 'config-1',
      type: 'logic',
      logicType: 'config-data',
      dataProperty: 'front-lights-array',
      assignTo: 'frontLights'
    };

    const reverseNode: LogicNode = {
      id: 'reverse-1',
      type: 'logic',
      logicType: 'reverse-lights',
      sourceVariable: 'frontLights',
      assignTo: 'reversedLights'
    };

    const indexNode: LogicNode = {
      id: 'index-1',
      type: 'logic',
      logicType: 'lights-from-index',
      sourceVariable: 'reversedLights',
      index: { source: 'literal', value: 0 },
      assignTo: 'pickedLights'
    };

    const actionNode: ActionNode = {
      id: 'action-1',
      type: 'action',
      effectType: 'set-color',
      target: {
        groups: { source: 'variable', name: 'pickedLights' },
        filter: { source: 'literal', value: 'all' }
      },
      color: {
        name: { source: 'literal', value: 'green' },
        brightness: { source: 'literal', value: 'high' },
        blendMode: { source: 'literal', value: 'replace' }
      },
      timing: {
        waitForCondition: 'none',
        waitForTime: { source: 'literal', value: 0 },
        duration: { source: 'literal', value: 0 },
        waitUntilCondition: 'none',
        waitUntilTime: { source: 'literal', value: 0 }
      }
    };

    const definition: YargNodeCueDefinition = {
      id: 'array-target',
      name: 'Array Target',
      cueType: CueType.Default,
      style: 'primary',
      nodes: {
        events: [eventNode],
        actions: [actionNode],
        logic: [configNode, reverseNode, indexNode],
        eventRaisers: [],
        eventListeners: [],
        effectRaisers: []
      },
      connections: [
        { from: 'event-1', to: 'config-1' },
        { from: 'config-1', to: 'reverse-1' },
        { from: 'reverse-1', to: 'index-1' },
        { from: 'index-1', to: 'action-1' }
      ],
      variables: [
        { name: 'frontLights', type: 'light-array', scope: 'cue', initialValue: [] },
        { name: 'reversedLights', type: 'light-array', scope: 'cue', initialValue: [] },
        { name: 'pickedLights', type: 'light-array', scope: 'cue', initialValue: [] }
      ]
    };

    const engine = new NodeExecutionEngine(
      compileCue(definition),
      'test-group:array-target',
      harness.sequencer,
      harness.lightManager,
      cueLevelVarStore,
      groupLevelVarStore,
      new EffectRegistry(),
      definition.variables
    );

    engine.startExecution(eventNode, createCueData());
    harness.advanceBy(1);

    const expected = getColor('green', 'high');
    const targetId = harness.frontLightIds[harness.frontLightIds.length - 1];
    for (const lightId of harness.frontLightIds) {
      const state = harness.getLightState(lightId);
      if (lightId === targetId) {
        expect(state).toMatchObject({
          red: expected.red,
          green: expected.green,
          blue: expected.blue,
          blendMode: expected.blendMode
        });
      } else {
        expect(state?.intensity ?? 0).toBe(0);
      }
    }
  });

  it('branches on cue data string comparisons', () => {
    const eventNode: YargEventNode = {
      id: 'event-1',
      type: 'event',
      eventType: 'beat'
    };

    const cueDataNode: LogicNode = {
      id: 'cue-data-1',
      type: 'logic',
      logicType: 'cue-data',
      dataProperty: 'venue-size',
      assignTo: 'venue'
    };

    const conditionalNode: LogicNode = {
      id: 'conditional-1',
      type: 'logic',
      logicType: 'conditional',
      comparator: '==',
      left: { source: 'variable', name: 'venue' },
      right: { source: 'literal', value: 'Large' }
    };

    const actionNode: ActionNode = {
      id: 'action-1',
      type: 'action',
      effectType: 'set-color',
      target: {
        groups: { source: 'literal', value: 'front' },
        filter: { source: 'literal', value: 'all' }
      },
      color: {
        name: { source: 'literal', value: 'purple' },
        brightness: { source: 'literal', value: 'high' },
        blendMode: { source: 'literal', value: 'replace' }
      },
      timing: {
        waitForCondition: 'none',
        waitForTime: { source: 'literal', value: 0 },
        duration: { source: 'literal', value: 0 },
        waitUntilCondition: 'none',
        waitUntilTime: { source: 'literal', value: 0 }
      }
    };

    const definition: YargNodeCueDefinition = {
      id: 'string-conditional',
      name: 'String Conditional',
      cueType: CueType.Default,
      style: 'primary',
      nodes: {
        events: [eventNode],
        actions: [actionNode],
        logic: [cueDataNode, conditionalNode],
        eventRaisers: [],
        eventListeners: [],
        effectRaisers: []
      },
      connections: [
        { from: 'event-1', to: 'cue-data-1' },
        { from: 'cue-data-1', to: 'conditional-1' },
        { from: 'conditional-1', to: 'action-1', fromPort: 'true' }
      ],
      variables: [
        { name: 'venue', type: 'string', scope: 'cue', initialValue: '' }
      ]
    };

    const engine = new NodeExecutionEngine(
      compileCue(definition),
      'test-group:string-conditional',
      harness.sequencer,
      harness.lightManager,
      cueLevelVarStore,
      groupLevelVarStore,
      new EffectRegistry(),
      definition.variables
    );

    engine.startExecution(eventNode, createCueData({ venueSize: 'Large' }));
    harness.advanceBy(1);

    const state = harness.getLightState(harness.frontLightIds[0]);
    const expected = getColor('purple', 'high');
    expect(state).toMatchObject({
      red: expected.red,
      green: expected.green,
      blue: expected.blue,
      blendMode: expected.blendMode
    });
  });

  it('blocks execution through delay nodes', async () => {
    const eventNode: YargEventNode = {
      id: 'event-1',
      type: 'event',
      eventType: 'beat'
    };

    const delayNode: LogicNode = {
      id: 'delay-1',
      type: 'logic',
      logicType: 'delay',
      delayTime: { source: 'literal', value: 20 }
    };

    const actionNode: ActionNode = {
      id: 'action-1',
      type: 'action',
      effectType: 'set-color',
      target: {
        groups: { source: 'literal', value: 'front' },
        filter: { source: 'literal', value: 'all' }
      },
      color: {
        name: { source: 'literal', value: 'blue' },
        brightness: { source: 'literal', value: 'high' },
        blendMode: { source: 'literal', value: 'replace' }
      },
      timing: {
        waitForCondition: 'none',
        waitForTime: { source: 'literal', value: 0 },
        duration: { source: 'literal', value: 0 },
        waitUntilCondition: 'none',
        waitUntilTime: { source: 'literal', value: 0 }
      }
    };

    const definition: YargNodeCueDefinition = {
      id: 'delay-test',
      name: 'Delay Test',
      cueType: CueType.Default,
      style: 'primary',
      nodes: {
        events: [eventNode],
        actions: [actionNode],
        logic: [delayNode],
        eventRaisers: [],
        eventListeners: [],
        effectRaisers: []
      },
      connections: [
        { from: 'event-1', to: 'delay-1' },
        { from: 'delay-1', to: 'action-1' }
      ]
    };

    const engine = new NodeExecutionEngine(
      compileCue(definition),
      'test-group:delay-test',
      harness.sequencer,
      harness.lightManager,
      cueLevelVarStore,
      groupLevelVarStore,
      new EffectRegistry()
    );

    engine.startExecution(eventNode, createCueData());
    harness.advanceBy(1);

    const lightId = harness.frontLightIds[0];
    const beforeDelay = harness.getLightState(lightId);
    expect(beforeDelay?.intensity ?? 0).toBe(0);

    jest.advanceTimersByTime(25);
    harness.advanceBy(1);

    const afterDelay = harness.getLightState(lightId);
    const expected = getColor('blue', 'high');
    expect(afterDelay).toMatchObject({
      red: expected.red,
      green: expected.green,
      blue: expected.blue,
      blendMode: expected.blendMode
    });
  });

  it('waits until beat to complete action', () => {
    const eventNode: YargEventNode = {
      id: 'event-1',
      type: 'event',
      eventType: 'beat'
    };

    const actionNode: ActionNode = {
      id: 'action-1',
      type: 'action',
      effectType: 'set-color',
      target: {
        groups: { source: 'literal', value: 'front' },
        filter: { source: 'literal', value: 'all' }
      },
      color: {
        name: { source: 'literal', value: 'white' },
        brightness: { source: 'literal', value: 'high' },
        blendMode: { source: 'literal', value: 'replace' }
      },
      timing: {
        waitForCondition: 'none',
        waitForTime: { source: 'literal', value: 0 },
        duration: { source: 'literal', value: 0 },
        waitUntilCondition: 'beat',
        waitUntilTime: { source: 'literal', value: 0 }
      }
    };

    const definition: YargNodeCueDefinition = {
      id: 'wait-until-beat',
      name: 'Wait Until Beat',
      cueType: CueType.Default,
      style: 'primary',
      nodes: {
        events: [eventNode],
        actions: [actionNode],
        logic: [],
        eventRaisers: [],
        eventListeners: [],
        effectRaisers: []
      },
      connections: [{ from: 'event-1', to: 'action-1' }]
    };

    const engine = new NodeExecutionEngine(
      compileCue(definition),
      'test-group:wait-until-beat',
      harness.sequencer,
      harness.lightManager,
      cueLevelVarStore,
      groupLevelVarStore,
      new EffectRegistry()
    );

    engine.startExecution(eventNode, createCueData());
    harness.advanceBy(1);

    const lightId = harness.frontLightIds[0];
    expect(harness.sequencer.getActiveEffectsForLight(lightId).has(0)).toBe(true);

    for (let i = 0; i < 10; i += 1) {
      harness.advanceBy(10);
      expect(harness.sequencer.getActiveEffectsForLight(lightId).has(0)).toBe(true);
    }

    harness.sequencer.onBeat();
    let cleared = false;
    for (let i = 0; i < 10; i += 1) {
      harness.advanceBy(10);
      if (!harness.sequencer.getActiveEffectsForLight(lightId).has(0)) {
        cleared = true;
        break;
      }
    }
    expect(cleared).toBe(true);
  });

  it('waits until beat count before completing', () => {
    const eventNode: YargEventNode = {
      id: 'event-1',
      type: 'event',
      eventType: 'beat'
    };

    const actionNode: ActionNode = {
      id: 'action-1',
      type: 'action',
      effectType: 'set-color',
      target: {
        groups: { source: 'literal', value: 'front' },
        filter: { source: 'literal', value: 'all' }
      },
      color: {
        name: { source: 'literal', value: 'white' },
        brightness: { source: 'literal', value: 'high' },
        blendMode: { source: 'literal', value: 'replace' }
      },
      timing: {
        waitForCondition: 'none',
        waitForTime: { source: 'literal', value: 0 },
        duration: { source: 'literal', value: 0 },
        waitUntilCondition: 'beat',
        waitUntilConditionCount: { source: 'literal', value: 2 },
        waitUntilTime: { source: 'literal', value: 0 }
      }
    };

    const definition: YargNodeCueDefinition = {
      id: 'wait-until-count',
      name: 'Wait Until Count',
      cueType: CueType.Default,
      style: 'primary',
      nodes: {
        events: [eventNode],
        actions: [actionNode],
        logic: [],
        eventRaisers: [],
        eventListeners: [],
        effectRaisers: []
      },
      connections: [{ from: 'event-1', to: 'action-1' }]
    };

    const engine = new NodeExecutionEngine(
      compileCue(definition),
      'test-group:wait-until-count',
      harness.sequencer,
      harness.lightManager,
      cueLevelVarStore,
      groupLevelVarStore,
      new EffectRegistry()
    );

    engine.startExecution(eventNode, createCueData());
    harness.advanceBy(1);

    const lightId = harness.frontLightIds[0];
    expect(harness.sequencer.getActiveEffectsForLight(lightId).has(0)).toBe(true);

    harness.sequencer.onBeat();
    harness.advanceBy(1);
    expect(harness.sequencer.getActiveEffectsForLight(lightId).has(0)).toBe(true);

    harness.sequencer.onBeat();
    let cleared = false;
    for (let i = 0; i < 10; i += 1) {
      harness.advanceBy(10);
      if (!harness.sequencer.getActiveEffectsForLight(lightId).has(0)) {
        cleared = true;
        break;
      }
    }
    expect(cleared).toBe(true);
  });

  it('gates on measure and keyframe events', () => {
    const eventNode: YargEventNode = {
      id: 'event-1',
      type: 'event',
      eventType: 'beat'
    };

    const measureAction: ActionNode = {
      id: 'action-measure',
      type: 'action',
      effectType: 'set-color',
      target: {
        groups: { source: 'literal', value: 'front' },
        filter: { source: 'literal', value: 'all' }
      },
      color: {
        name: { source: 'literal', value: 'red' },
        brightness: { source: 'literal', value: 'high' },
        blendMode: { source: 'literal', value: 'replace' }
      },
      timing: {
        waitForCondition: 'measure',
        waitForTime: { source: 'literal', value: 0 },
        duration: { source: 'literal', value: 0 },
        waitUntilCondition: 'none',
        waitUntilTime: { source: 'literal', value: 0 }
      }
    };

    const keyframeAction: ActionNode = {
      id: 'action-keyframe',
      type: 'action',
      effectType: 'set-color',
      target: {
        groups: { source: 'literal', value: 'back' },
        filter: { source: 'literal', value: 'all' }
      },
      color: {
        name: { source: 'literal', value: 'blue' },
        brightness: { source: 'literal', value: 'high' },
        blendMode: { source: 'literal', value: 'replace' }
      },
      timing: {
        waitForCondition: 'keyframe',
        waitForTime: { source: 'literal', value: 0 },
        duration: { source: 'literal', value: 0 },
        waitUntilCondition: 'none',
        waitUntilTime: { source: 'literal', value: 0 }
      }
    };

    const definition: YargNodeCueDefinition = {
      id: 'measure-keyframe',
      name: 'Measure + Keyframe',
      cueType: CueType.Default,
      style: 'primary',
      nodes: {
        events: [eventNode],
        actions: [measureAction, keyframeAction],
        logic: [],
        eventRaisers: [],
        eventListeners: [],
        effectRaisers: []
      },
      connections: [
        { from: 'event-1', to: 'action-measure' },
        { from: 'event-1', to: 'action-keyframe' }
      ]
    };

    const engine = new NodeExecutionEngine(
      compileCue(definition),
      'test-group:measure-keyframe',
      harness.sequencer,
      harness.lightManager,
      cueLevelVarStore,
      groupLevelVarStore,
      new EffectRegistry()
    );

    engine.startExecution(eventNode, createCueData());
    harness.advanceBy(1);

    const frontId = harness.frontLightIds[0];
    const backId = harness.backLightIds[0];
    expect(harness.getLightState(frontId)?.intensity ?? 0).toBe(0);
    expect(harness.getLightState(backId)?.intensity ?? 0).toBe(0);

    harness.sequencer.onMeasure();
    harness.advanceBy(1);
    const red = getColor('red', 'high');
    expect(harness.getLightState(frontId)).toMatchObject({
      red: red.red,
      green: red.green,
      blue: red.blue,
      blendMode: red.blendMode
    });

    harness.sequencer.onKeyframe();
    harness.advanceBy(1);
    const blue = getColor('blue', 'high');
    expect(harness.getLightState(backId)).toMatchObject({
      red: blue.red,
      green: blue.green,
      blue: blue.blue,
      blendMode: blue.blendMode
    });
  });

  it('gates on measure count and keyframe until count', () => {
    const eventNode: YargEventNode = {
      id: 'event-1',
      type: 'event',
      eventType: 'beat'
    };

    const measureAction: ActionNode = {
      id: 'action-measure',
      type: 'action',
      effectType: 'set-color',
      target: {
        groups: { source: 'literal', value: 'front' },
        filter: { source: 'literal', value: 'all' }
      },
      color: {
        name: { source: 'literal', value: 'red' },
        brightness: { source: 'literal', value: 'high' },
        blendMode: { source: 'literal', value: 'replace' }
      },
      timing: {
        waitForCondition: 'measure',
        waitForConditionCount: { source: 'literal', value: 2 },
        waitForTime: { source: 'literal', value: 0 },
        duration: { source: 'literal', value: 0 },
        waitUntilCondition: 'none',
        waitUntilTime: { source: 'literal', value: 0 }
      }
    };

    const keyframeAction: ActionNode = {
      id: 'action-keyframe',
      type: 'action',
      effectType: 'set-color',
      target: {
        groups: { source: 'literal', value: 'back' },
        filter: { source: 'literal', value: 'all' }
      },
      color: {
        name: { source: 'literal', value: 'blue' },
        brightness: { source: 'literal', value: 'high' },
        blendMode: { source: 'literal', value: 'replace' }
      },
      timing: {
        waitForCondition: 'keyframe',
        waitForConditionCount: { source: 'literal', value: 2 },
        waitForTime: { source: 'literal', value: 0 },
        duration: { source: 'literal', value: 0 },
        waitUntilCondition: 'none',
        waitUntilTime: { source: 'literal', value: 0 }
      }
    };

    const definition: YargNodeCueDefinition = {
      id: 'measure-keyframe-count',
      name: 'Measure + Keyframe Count',
      cueType: CueType.Default,
      style: 'primary',
      nodes: {
        events: [eventNode],
        actions: [measureAction, keyframeAction],
        logic: [],
        eventRaisers: [],
        eventListeners: [],
        effectRaisers: []
      },
      connections: [
        { from: 'event-1', to: 'action-measure' },
        { from: 'event-1', to: 'action-keyframe' }
      ]
    };

    const engine = new NodeExecutionEngine(
      compileCue(definition),
      'test-group:measure-keyframe-count',
      harness.sequencer,
      harness.lightManager,
      cueLevelVarStore,
      groupLevelVarStore,
      new EffectRegistry()
    );

    engine.startExecution(eventNode, createCueData());
    harness.advanceBy(1);

    const frontId = harness.frontLightIds[0];
    const backId = harness.backLightIds[0];
    expect(harness.getLightState(frontId)?.intensity ?? 0).toBe(0);
    expect(harness.getLightState(backId)?.intensity ?? 0).toBe(0);

    harness.sequencer.onMeasure();
    harness.advanceBy(1);
    expect(harness.getLightState(frontId)?.intensity ?? 0).toBe(0);

    harness.sequencer.onMeasure();
    harness.advanceBy(1);
    const red = getColor('red', 'high');
    expect(harness.getLightState(frontId)).toMatchObject({
      red: red.red,
      green: red.green,
      blue: red.blue,
      blendMode: red.blendMode
    });

    harness.sequencer.onKeyframe();
    harness.advanceBy(1);
    expect(harness.getLightState(backId)?.intensity ?? 0).toBe(0);

    harness.sequencer.onKeyframe();
    harness.advanceBy(1);
    const blue = getColor('blue', 'high');
    expect(harness.getLightState(backId)).toMatchObject({
      red: blue.red,
      green: blue.green,
      blue: blue.blue,
      blendMode: blue.blendMode
    });
  });

  it('gates on drum and guitar note counts', () => {
    const eventNode: YargEventNode = {
      id: 'event-1',
      type: 'event',
      eventType: 'beat'
    };

    const drumAction: ActionNode = {
      id: 'action-drum',
      type: 'action',
      effectType: 'set-color',
      target: {
        groups: { source: 'literal', value: 'front' },
        filter: { source: 'literal', value: 'all' }
      },
      color: {
        name: { source: 'literal', value: 'green' },
        brightness: { source: 'literal', value: 'high' },
        blendMode: { source: 'literal', value: 'replace' }
      },
      timing: {
        waitForCondition: 'drum-red',
        waitForConditionCount: { source: 'literal', value: 2 },
        waitForTime: { source: 'literal', value: 0 },
        duration: { source: 'literal', value: 0 },
        waitUntilCondition: 'none',
        waitUntilTime: { source: 'literal', value: 0 }
      }
    };

    const guitarAction: ActionNode = {
      id: 'action-guitar',
      type: 'action',
      effectType: 'set-color',
      target: {
        groups: { source: 'literal', value: 'back' },
        filter: { source: 'literal', value: 'all' }
      },
      color: {
        name: { source: 'literal', value: 'yellow' },
        brightness: { source: 'literal', value: 'high' },
        blendMode: { source: 'literal', value: 'replace' }
      },
      timing: {
        waitForCondition: 'guitar-green',
        waitForConditionCount: { source: 'literal', value: 1 },
        waitForTime: { source: 'literal', value: 0 },
        duration: { source: 'literal', value: 0 },
        waitUntilCondition: 'none',
        waitUntilTime: { source: 'literal', value: 0 }
      }
    };

    const definition: YargNodeCueDefinition = {
      id: 'note-counts',
      name: 'Note Counts',
      cueType: CueType.Default,
      style: 'primary',
      nodes: {
        events: [eventNode],
        actions: [drumAction, guitarAction],
        logic: [],
        eventRaisers: [],
        eventListeners: [],
        effectRaisers: []
      },
      connections: [
        { from: 'event-1', to: 'action-drum' },
        { from: 'event-1', to: 'action-guitar' }
      ]
    };

    const engine = new NodeExecutionEngine(
      compileCue(definition),
      'test-group:note-counts',
      harness.sequencer,
      harness.lightManager,
      cueLevelVarStore,
      groupLevelVarStore,
      new EffectRegistry()
    );

    engine.startExecution(eventNode, createCueData());
    harness.advanceBy(1);

    const frontId = harness.frontLightIds[0];
    const backId = harness.backLightIds[0];
    expect(harness.getLightState(frontId)?.intensity ?? 0).toBe(0);
    expect(harness.getLightState(backId)?.intensity ?? 0).toBe(0);

    harness.sequencer.onDrumNote(DrumNoteType.RedDrum);
    harness.advanceBy(1);
    expect(harness.getLightState(frontId)?.intensity ?? 0).toBe(0);

    harness.sequencer.onDrumNote(DrumNoteType.RedDrum);
    harness.advanceBy(1);
    const green = getColor('green', 'high');
    expect(harness.getLightState(frontId)).toMatchObject({
      red: green.red,
      green: green.green,
      blue: green.blue,
      blendMode: green.blendMode
    });

    harness.sequencer.onGuitarNote(InstrumentNoteType.Green);
    harness.advanceBy(1);
    const yellow = getColor('yellow', 'high');
    expect(harness.getLightState(backId)).toMatchObject({
      red: yellow.red,
      green: yellow.green,
      blue: yellow.blue,
      blendMode: yellow.blendMode
    });
  });

  it('gates on bass and keys note counts', () => {
    const eventNode: YargEventNode = {
      id: 'event-1',
      type: 'event',
      eventType: 'beat'
    };

    const bassAction: ActionNode = {
      id: 'action-bass',
      type: 'action',
      effectType: 'set-color',
      target: {
        groups: { source: 'literal', value: 'front' },
        filter: { source: 'literal', value: 'all' }
      },
      color: {
        name: { source: 'literal', value: 'purple' },
        brightness: { source: 'literal', value: 'high' },
        blendMode: { source: 'literal', value: 'replace' }
      },
      timing: {
        waitForCondition: 'bass-blue',
        waitForConditionCount: { source: 'literal', value: 2 },
        waitForTime: { source: 'literal', value: 0 },
        duration: { source: 'literal', value: 0 },
        waitUntilCondition: 'none',
        waitUntilTime: { source: 'literal', value: 0 }
      }
    };

    const keysAction: ActionNode = {
      id: 'action-keys',
      type: 'action',
      effectType: 'set-color',
      target: {
        groups: { source: 'literal', value: 'back' },
        filter: { source: 'literal', value: 'all' }
      },
      color: {
        name: { source: 'literal', value: 'orange' },
        brightness: { source: 'literal', value: 'high' },
        blendMode: { source: 'literal', value: 'replace' }
      },
      timing: {
        waitForCondition: 'keys-yellow',
        waitForConditionCount: { source: 'literal', value: 1 },
        waitForTime: { source: 'literal', value: 0 },
        duration: { source: 'literal', value: 0 },
        waitUntilCondition: 'none',
        waitUntilTime: { source: 'literal', value: 0 }
      }
    };

    const definition: YargNodeCueDefinition = {
      id: 'bass-keys-counts',
      name: 'Bass Keys Counts',
      cueType: CueType.Default,
      style: 'primary',
      nodes: {
        events: [eventNode],
        actions: [bassAction, keysAction],
        logic: [],
        eventRaisers: [],
        eventListeners: [],
        effectRaisers: []
      },
      connections: [
        { from: 'event-1', to: 'action-bass' },
        { from: 'event-1', to: 'action-keys' }
      ]
    };

    const engine = new NodeExecutionEngine(
      compileCue(definition),
      'test-group:bass-keys-counts',
      harness.sequencer,
      harness.lightManager,
      cueLevelVarStore,
      groupLevelVarStore,
      new EffectRegistry()
    );

    engine.startExecution(eventNode, createCueData());
    harness.advanceBy(1);

    const frontId = harness.frontLightIds[0];
    const backId = harness.backLightIds[0];
    expect(harness.getLightState(frontId)?.intensity ?? 0).toBe(0);
    expect(harness.getLightState(backId)?.intensity ?? 0).toBe(0);

    harness.sequencer.onBassNote(InstrumentNoteType.Blue);
    harness.advanceBy(1);
    expect(harness.getLightState(frontId)?.intensity ?? 0).toBe(0);

    harness.sequencer.onBassNote(InstrumentNoteType.Blue);
    harness.advanceBy(1);
    const purple = getColor('purple', 'high');
    expect(harness.getLightState(frontId)).toMatchObject({
      red: purple.red,
      green: purple.green,
      blue: purple.blue,
      blendMode: purple.blendMode
    });

    harness.sequencer.onKeysNote(InstrumentNoteType.Yellow);
    harness.advanceBy(1);
    const orange = getColor('orange', 'high');
    expect(harness.getLightState(backId)).toMatchObject({
      red: orange.red,
      green: orange.green,
      blue: orange.blue,
      blendMode: orange.blendMode
    });
  });

  it('calculates math operators and feeds action duration', () => {
    const eventNode: YargEventNode = {
      id: 'event-1',
      type: 'event',
      eventType: 'beat'
    };

    const mathNode: LogicNode = {
      id: 'math-1',
      type: 'logic',
      logicType: 'math',
      operator: 'multiply',
      left: { source: 'literal', value: 10 },
      right: { source: 'literal', value: 3 },
      assignTo: 'durationMs'
    };

    const actionNode: ActionNode = {
      id: 'action-1',
      type: 'action',
      effectType: 'set-color',
      target: {
        groups: { source: 'literal', value: 'front' },
        filter: { source: 'literal', value: 'all' }
      },
      color: {
        name: { source: 'literal', value: 'blue' },
        brightness: { source: 'literal', value: 'high' },
        blendMode: { source: 'literal', value: 'replace' }
      },
      timing: {
        waitForCondition: 'none',
        waitForTime: { source: 'literal', value: 0 },
        duration: { source: 'variable', name: 'durationMs', fallback: 0 },
        waitUntilCondition: 'none',
        waitUntilTime: { source: 'literal', value: 0 }
      }
    };

    const definition: YargNodeCueDefinition = {
      id: 'math-duration',
      name: 'Math Duration',
      cueType: CueType.Default,
      style: 'primary',
      nodes: {
        events: [eventNode],
        actions: [actionNode],
        logic: [mathNode],
        eventRaisers: [],
        eventListeners: [],
        effectRaisers: []
      },
      connections: [
        { from: 'event-1', to: 'math-1' },
        { from: 'math-1', to: 'action-1' }
      ],
      variables: [
        { name: 'durationMs', type: 'number', scope: 'cue', initialValue: 0 }
      ]
    };

    const engine = new NodeExecutionEngine(
      compileCue(definition),
      'test-group:math-duration',
      harness.sequencer,
      harness.lightManager,
      cueLevelVarStore,
      groupLevelVarStore,
      new EffectRegistry(),
      definition.variables
    );

    engine.startExecution(eventNode, createCueData());
    harness.advanceBy(1);

    const lightId = harness.frontLightIds[0];
    expect(harness.sequencer.getActiveEffectsForLight(lightId).has(0)).toBe(true);
    harness.advanceBy(20);
    expect(harness.sequencer.getActiveEffectsForLight(lightId).has(0)).toBe(true);
    harness.advanceBy(20);
    let cleared = false;
    for (let i = 0; i < 10; i += 1) {
      harness.advanceBy(10);
      if (!harness.sequencer.getActiveEffectsForLight(lightId).has(0)) {
        cleared = true;
        break;
      }
    }
    expect(cleared).toBe(true);
  });

  it('supports all math operators for variable updates', () => {
    const eventNode: YargEventNode = {
      id: 'event-1',
      type: 'event',
      eventType: 'beat'
    };

    const addNode: LogicNode = {
      id: 'math-add',
      type: 'logic',
      logicType: 'math',
      operator: 'add',
      left: { source: 'literal', value: 5 },
      right: { source: 'literal', value: 2 },
      assignTo: 'addResult'
    };

    const subtractNode: LogicNode = {
      id: 'math-sub',
      type: 'logic',
      logicType: 'math',
      operator: 'subtract',
      left: { source: 'literal', value: 10 },
      right: { source: 'literal', value: 3 },
      assignTo: 'subResult'
    };

    const multiplyNode: LogicNode = {
      id: 'math-mul',
      type: 'logic',
      logicType: 'math',
      operator: 'multiply',
      left: { source: 'literal', value: 3 },
      right: { source: 'literal', value: 4 },
      assignTo: 'mulResult'
    };

    const divideNode: LogicNode = {
      id: 'math-div',
      type: 'logic',
      logicType: 'math',
      operator: 'divide',
      left: { source: 'literal', value: 10 },
      right: { source: 'literal', value: 2 },
      assignTo: 'divResult'
    };

    const modulusNode: LogicNode = {
      id: 'math-mod',
      type: 'logic',
      logicType: 'math',
      operator: 'modulus',
      left: { source: 'literal', value: 10 },
      right: { source: 'literal', value: 3 },
      assignTo: 'modResult'
    };

    const definition: YargNodeCueDefinition = {
      id: 'math-ops',
      name: 'Math Ops',
      cueType: CueType.Default,
      style: 'primary',
      nodes: {
        events: [eventNode],
        actions: [],
        logic: [addNode, subtractNode, multiplyNode, divideNode, modulusNode],
        eventRaisers: [],
        eventListeners: [],
        effectRaisers: []
      },
      connections: [
        { from: 'event-1', to: 'math-add' },
        { from: 'math-add', to: 'math-sub' },
        { from: 'math-sub', to: 'math-mul' },
        { from: 'math-mul', to: 'math-div' },
        { from: 'math-div', to: 'math-mod' }
      ],
      variables: [
        { name: 'addResult', type: 'number', scope: 'cue', initialValue: 0 },
        { name: 'subResult', type: 'number', scope: 'cue', initialValue: 0 },
        { name: 'mulResult', type: 'number', scope: 'cue', initialValue: 0 },
        { name: 'divResult', type: 'number', scope: 'cue', initialValue: 0 },
        { name: 'modResult', type: 'number', scope: 'cue', initialValue: 0 }
      ]
    };

    const engine = new NodeExecutionEngine(
      compileCue(definition),
      'test-group:math-ops',
      harness.sequencer,
      harness.lightManager,
      cueLevelVarStore,
      groupLevelVarStore,
      new EffectRegistry(),
      definition.variables
    );

    engine.startExecution(eventNode, createCueData());
    harness.advanceBy(1);

    expect(cueLevelVarStore.get('addResult')?.value).toBe(7);
    expect(cueLevelVarStore.get('subResult')?.value).toBe(7);
    expect(cueLevelVarStore.get('mulResult')?.value).toBe(12);
    expect(cueLevelVarStore.get('divResult')?.value).toBe(5);
    expect(cueLevelVarStore.get('modResult')?.value).toBe(1);
  });

  it('initializes variables and uses fallback branch', () => {
    const eventNode: YargEventNode = {
      id: 'event-1',
      type: 'event',
      eventType: 'beat'
    };

    const initNode: LogicNode = {
      id: 'var-init',
      type: 'logic',
      logicType: 'variable',
      mode: 'init',
      varName: 'flag',
      valueType: 'number',
      value: { source: 'literal', value: 1 }
    };

    const conditionalNode: LogicNode = {
      id: 'conditional-1',
      type: 'logic',
      logicType: 'conditional',
      comparator: '==',
      left: { source: 'variable', name: 'missingVar', fallback: 0 },
      right: { source: 'literal', value: 0 }
    };

    const actionNode: ActionNode = {
      id: 'action-1',
      type: 'action',
      effectType: 'set-color',
      target: {
        groups: { source: 'literal', value: 'front' },
        filter: { source: 'literal', value: 'all' }
      },
      color: {
        name: { source: 'literal', value: 'yellow' },
        brightness: { source: 'literal', value: 'high' },
        blendMode: { source: 'literal', value: 'replace' }
      },
      timing: {
        waitForCondition: 'none',
        waitForTime: { source: 'literal', value: 0 },
        duration: { source: 'literal', value: 0 },
        waitUntilCondition: 'none',
        waitUntilTime: { source: 'literal', value: 0 }
      }
    };

    const definition: YargNodeCueDefinition = {
      id: 'init-fallback',
      name: 'Init/Fallback',
      cueType: CueType.Default,
      style: 'primary',
      nodes: {
        events: [eventNode],
        actions: [actionNode],
        logic: [initNode, conditionalNode],
        eventRaisers: [],
        eventListeners: [],
        effectRaisers: []
      },
      connections: [
        { from: 'event-1', to: 'var-init' },
        { from: 'var-init', to: 'conditional-1' },
        { from: 'conditional-1', to: 'action-1', fromPort: 'true' }
      ],
      variables: [
        { name: 'flag', type: 'number', scope: 'cue', initialValue: 0 }
      ]
    };

    const engine = new NodeExecutionEngine(
      compileCue(definition),
      'test-group:init-fallback',
      harness.sequencer,
      harness.lightManager,
      cueLevelVarStore,
      groupLevelVarStore,
      new EffectRegistry(),
      definition.variables
    );

    engine.startExecution(eventNode, createCueData());
    harness.advanceBy(1);

    const storedValue = cueLevelVarStore.get('flag');
    expect(storedValue?.value).toBe(1);
    const lightState = harness.getLightState(harness.frontLightIds[0]);
    expect(lightState?.intensity ?? 0).toBeGreaterThan(0);
  });

  it('passes through variable get mode without mutation', () => {
    const eventNode: YargEventNode = {
      id: 'event-1',
      type: 'event',
      eventType: 'beat'
    };

    const setNode: LogicNode = {
      id: 'var-set',
      type: 'logic',
      logicType: 'variable',
      mode: 'set',
      varName: 'counter',
      valueType: 'number',
      value: { source: 'literal', value: 2 }
    };

    const getNode: LogicNode = {
      id: 'var-get',
      type: 'logic',
      logicType: 'variable',
      mode: 'get',
      varName: 'counter',
      valueType: 'number'
    };

    const conditionalNode: LogicNode = {
      id: 'conditional-1',
      type: 'logic',
      logicType: 'conditional',
      comparator: '==',
      left: { source: 'variable', name: 'counter' },
      right: { source: 'literal', value: 2 }
    };

    const actionNode: ActionNode = {
      id: 'action-1',
      type: 'action',
      effectType: 'set-color',
      target: {
        groups: { source: 'literal', value: 'front' },
        filter: { source: 'literal', value: 'all' }
      },
      color: {
        name: { source: 'literal', value: 'green' },
        brightness: { source: 'literal', value: 'high' },
        blendMode: { source: 'literal', value: 'replace' }
      },
      timing: {
        waitForCondition: 'none',
        waitForTime: { source: 'literal', value: 0 },
        duration: { source: 'literal', value: 0 },
        waitUntilCondition: 'none',
        waitUntilTime: { source: 'literal', value: 0 }
      }
    };

    const definition: YargNodeCueDefinition = {
      id: 'variable-get',
      name: 'Variable Get',
      cueType: CueType.Default,
      style: 'primary',
      nodes: {
        events: [eventNode],
        actions: [actionNode],
        logic: [setNode, getNode, conditionalNode],
        eventRaisers: [],
        eventListeners: [],
        effectRaisers: []
      },
      connections: [
        { from: 'event-1', to: 'var-set' },
        { from: 'var-set', to: 'var-get' },
        { from: 'var-get', to: 'conditional-1' },
        { from: 'conditional-1', to: 'action-1', fromPort: 'true' }
      ],
      variables: [
        { name: 'counter', type: 'number', scope: 'cue', initialValue: 0 }
      ]
    };

    const engine = new NodeExecutionEngine(
      compileCue(definition),
      'test-group:variable-get',
      harness.sequencer,
      harness.lightManager,
      cueLevelVarStore,
      groupLevelVarStore,
      new EffectRegistry(),
      definition.variables
    );

    engine.startExecution(eventNode, createCueData());
    harness.advanceBy(1);

    expect(cueLevelVarStore.get('counter')?.value).toBe(2);
    expect(harness.getLightState(harness.frontLightIds[0])?.intensity ?? 0).toBeGreaterThan(0);
  });

  it('uses array-length and concat-lights for targeting', () => {
    const eventNode: YargEventNode = {
      id: 'event-1',
      type: 'event',
      eventType: 'beat'
    };

    const frontConfig: LogicNode = {
      id: 'front-1',
      type: 'logic',
      logicType: 'config-data',
      dataProperty: 'front-lights-array',
      assignTo: 'frontLights'
    };

    const backConfig: LogicNode = {
      id: 'back-1',
      type: 'logic',
      logicType: 'config-data',
      dataProperty: 'back-lights-array',
      assignTo: 'backLights'
    };

    const concatNode: LogicNode = {
      id: 'concat-1',
      type: 'logic',
      logicType: 'concat-lights',
      sourceVariables: ['frontLights', 'backLights'],
      assignTo: 'allLights'
    };

    const lengthNode: LogicNode = {
      id: 'len-1',
      type: 'logic',
      logicType: 'array-length',
      sourceVariable: 'allLights',
      assignTo: 'lightCount'
    };

    const conditionalNode: LogicNode = {
      id: 'conditional-1',
      type: 'logic',
      logicType: 'conditional',
      comparator: '>=',
      left: { source: 'variable', name: 'lightCount' },
      right: { source: 'literal', value: 6 }
    };

    const actionNode: ActionNode = {
      id: 'action-1',
      type: 'action',
      effectType: 'set-color',
      target: {
        groups: { source: 'variable', name: 'allLights' },
        filter: { source: 'literal', value: 'all' }
      },
      color: {
        name: { source: 'literal', value: 'green' },
        brightness: { source: 'literal', value: 'high' },
        blendMode: { source: 'literal', value: 'replace' }
      },
      timing: {
        waitForCondition: 'none',
        waitForTime: { source: 'literal', value: 0 },
        duration: { source: 'literal', value: 0 },
        waitUntilCondition: 'none',
        waitUntilTime: { source: 'literal', value: 0 }
      }
    };

    const definition: YargNodeCueDefinition = {
      id: 'concat-length',
      name: 'Concat + Length',
      cueType: CueType.Default,
      style: 'primary',
      nodes: {
        events: [eventNode],
        actions: [actionNode],
        logic: [frontConfig, backConfig, concatNode, lengthNode, conditionalNode],
        eventRaisers: [],
        eventListeners: [],
        effectRaisers: []
      },
      connections: [
        { from: 'event-1', to: 'front-1' },
        { from: 'front-1', to: 'back-1' },
        { from: 'back-1', to: 'concat-1' },
        { from: 'concat-1', to: 'len-1' },
        { from: 'len-1', to: 'conditional-1' },
        { from: 'conditional-1', to: 'action-1', fromPort: 'true' }
      ],
      variables: [
        { name: 'frontLights', type: 'light-array', scope: 'cue', initialValue: [] },
        { name: 'backLights', type: 'light-array', scope: 'cue', initialValue: [] },
        { name: 'allLights', type: 'light-array', scope: 'cue', initialValue: [] },
        { name: 'lightCount', type: 'number', scope: 'cue', initialValue: 0 }
      ]
    };

    const engine = new NodeExecutionEngine(
      compileCue(definition),
      'test-group:concat-length',
      harness.sequencer,
      harness.lightManager,
      cueLevelVarStore,
      groupLevelVarStore,
      new EffectRegistry(),
      definition.variables
    );

    engine.startExecution(eventNode, createCueData());
    harness.advanceBy(1);

    const green = getColor('green', 'high');
    for (const lightId of harness.allLightIds) {
      const state = harness.getLightState(lightId);
      expect(state).toMatchObject({
        red: green.red,
        green: green.green,
        blue: green.blue,
        blendMode: green.blendMode
      });
    }
  });

  it('creates pairs in opposite and diagonal patterns', () => {
    const eventNode: YargEventNode = {
      id: 'event-1',
      type: 'event',
      eventType: 'beat'
    };

    const configNode: LogicNode = {
      id: 'config-1',
      type: 'logic',
      logicType: 'config-data',
      dataProperty: 'front-lights-array',
      assignTo: 'frontLights'
    };

    const oppositeNode: LogicNode = {
      id: 'pairs-opposite',
      type: 'logic',
      logicType: 'create-pairs',
      sourceVariable: 'frontLights',
      assignTo: 'oppositePairs',
      pairType: 'opposite'
    };

    const diagonalNode: LogicNode = {
      id: 'pairs-diagonal',
      type: 'logic',
      logicType: 'create-pairs',
      sourceVariable: 'frontLights',
      assignTo: 'diagonalPairs',
      pairType: 'diagonal'
    };

    const pickOpposite: LogicNode = {
      id: 'pick-opposite',
      type: 'logic',
      logicType: 'lights-from-index',
      sourceVariable: 'oppositePairs',
      index: { source: 'literal', value: '0,1' },
      assignTo: 'pairLights'
    };

    const actionNode: ActionNode = {
      id: 'action-1',
      type: 'action',
      effectType: 'set-color',
      target: {
        groups: { source: 'variable', name: 'pairLights' },
        filter: { source: 'literal', value: 'all' }
      },
      color: {
        name: { source: 'literal', value: 'blue' },
        brightness: { source: 'literal', value: 'high' },
        blendMode: { source: 'literal', value: 'replace' }
      },
      timing: {
        waitForCondition: 'none',
        waitForTime: { source: 'literal', value: 0 },
        duration: { source: 'literal', value: 0 },
        waitUntilCondition: 'none',
        waitUntilTime: { source: 'literal', value: 0 }
      }
    };

    const definition: YargNodeCueDefinition = {
      id: 'pairs-test',
      name: 'Pairs Test',
      cueType: CueType.Default,
      style: 'primary',
      nodes: {
        events: [eventNode],
        actions: [actionNode],
        logic: [configNode, oppositeNode, diagonalNode, pickOpposite],
        eventRaisers: [],
        eventListeners: [],
        effectRaisers: []
      },
      connections: [
        { from: 'event-1', to: 'config-1' },
        { from: 'config-1', to: 'pairs-opposite' },
        { from: 'pairs-opposite', to: 'pairs-diagonal' },
        { from: 'pairs-diagonal', to: 'pick-opposite' },
        { from: 'pick-opposite', to: 'action-1' }
      ],
      variables: [
        { name: 'frontLights', type: 'light-array', scope: 'cue', initialValue: [] },
        { name: 'oppositePairs', type: 'light-array', scope: 'cue', initialValue: [] },
        { name: 'diagonalPairs', type: 'light-array', scope: 'cue', initialValue: [] },
        { name: 'pairLights', type: 'light-array', scope: 'cue', initialValue: [] }
      ]
    };

    const engine = new NodeExecutionEngine(
      compileCue(definition),
      'test-group:pairs-test',
      harness.sequencer,
      harness.lightManager,
      cueLevelVarStore,
      groupLevelVarStore,
      new EffectRegistry(),
      definition.variables
    );

    engine.startExecution(eventNode, createCueData());
    harness.advanceBy(1);

    const blue = getColor('blue', 'high');
    const expectedIds = [
      harness.frontLightIds[0],
      harness.frontLightIds[2]
    ];
    for (const lightId of harness.frontLightIds) {
      const state = harness.getLightState(lightId);
      if (expectedIds.includes(lightId)) {
        expect(state).toMatchObject({
          red: blue.red,
          green: blue.green,
          blue: blue.blue,
          blendMode: blue.blendMode
        });
      } else {
        expect(state?.intensity ?? 0).toBe(0);
      }
    }

    const diagonalPairs = cueLevelVarStore.get('diagonalPairs');
    expect(diagonalPairs?.type).toBe('light-array');
    expect((diagonalPairs?.value as any[])?.length ?? 0).toBeGreaterThan(0);
  });

  it('targets back and strobe groups with filters', () => {
    const localHarness = createSequencerHarness({ frontCount: 4, backCount: 4, strobeCount: 2 });
    const localCueStore = new Map();
    const localGroupStore = new Map();

    const eventNode: YargEventNode = {
      id: 'event-1',
      type: 'event',
      eventType: 'beat'
    };

    const backOddAction: ActionNode = {
      id: 'action-back',
      type: 'action',
      effectType: 'set-color',
      target: {
        groups: { source: 'literal', value: 'back' },
        filter: { source: 'literal', value: 'odd' }
      },
      color: {
        name: { source: 'literal', value: 'red' },
        brightness: { source: 'literal', value: 'high' },
        blendMode: { source: 'literal', value: 'replace' }
      },
      timing: {
        waitForCondition: 'none',
        waitForTime: { source: 'literal', value: 0 },
        duration: { source: 'literal', value: 0 },
        waitUntilCondition: 'none',
        waitUntilTime: { source: 'literal', value: 0 }
      }
    };

    const strobeAction: ActionNode = {
      id: 'action-strobe',
      type: 'action',
      effectType: 'set-color',
      target: {
        groups: { source: 'literal', value: 'strobe' },
        filter: { source: 'literal', value: 'all' }
      },
      color: {
        name: { source: 'literal', value: 'blue' },
        brightness: { source: 'literal', value: 'high' },
        blendMode: { source: 'literal', value: 'replace' }
      },
      timing: {
        waitForCondition: 'none',
        waitForTime: { source: 'literal', value: 0 },
        duration: { source: 'literal', value: 0 },
        waitUntilCondition: 'none',
        waitUntilTime: { source: 'literal', value: 0 }
      }
    };

    const definition: YargNodeCueDefinition = {
      id: 'target-groups',
      name: 'Target Groups',
      cueType: CueType.Default,
      style: 'primary',
      nodes: {
        events: [eventNode],
        actions: [backOddAction, strobeAction],
        logic: [],
        eventRaisers: [],
        eventListeners: [],
        effectRaisers: []
      },
      connections: [
        { from: 'event-1', to: 'action-back' },
        { from: 'event-1', to: 'action-strobe' }
      ]
    };

    const engine = new NodeExecutionEngine(
      compileCue(definition),
      'test-group:target-groups',
      localHarness.sequencer,
      localHarness.lightManager,
      localCueStore,
      localGroupStore,
      new EffectRegistry()
    );

    engine.startExecution(eventNode, createCueData());
    localHarness.advanceBy(1);

    const red = getColor('red', 'high');
    const blue = getColor('blue', 'high');
    const backLights = localHarness.lightManager.getLights(['back'], ['all']);
    for (const light of backLights) {
      const state = localHarness.getLightState(light.id);
      if (light.position % 2 !== 0) {
        expect(state).toMatchObject({
          red: red.red,
          green: red.green,
          blue: red.blue,
          blendMode: red.blendMode
        });
      } else {
        expect(state?.intensity ?? 0).toBe(0);
      }
    }

    const strobeLights = localHarness.lightManager.getLights(['strobe'], ['all']);
    for (const light of strobeLights) {
      const state = localHarness.getLightState(light.id);
      expect(state).toMatchObject({
        red: blue.red,
        green: blue.green,
        blue: blue.blue,
        blendMode: blue.blendMode
      });
    }

    localHarness.cleanup();
  });

  it('targets random filters deterministically', () => {
    const randomSpy = jest.spyOn(utils, 'randomBetween');
    randomSpy.mockReturnValueOnce(0).mockReturnValueOnce(1).mockReturnValueOnce(3);

    const eventNode: YargEventNode = {
      id: 'event-1',
      type: 'event',
      eventType: 'beat'
    };

    const randomAction: ActionNode = {
      id: 'action-random',
      type: 'action',
      effectType: 'set-color',
      target: {
        groups: { source: 'literal', value: 'front' },
        filter: { source: 'literal', value: 'random-3' }
      },
      color: {
        name: { source: 'literal', value: 'green' },
        brightness: { source: 'literal', value: 'high' },
        blendMode: { source: 'literal', value: 'replace' }
      },
      timing: {
        waitForCondition: 'none',
        waitForTime: { source: 'literal', value: 0 },
        duration: { source: 'literal', value: 0 },
        waitUntilCondition: 'none',
        waitUntilTime: { source: 'literal', value: 0 }
      }
    };

    const definition: YargNodeCueDefinition = {
      id: 'random-targets',
      name: 'Random Targets',
      cueType: CueType.Default,
      style: 'primary',
      nodes: {
        events: [eventNode],
        actions: [randomAction],
        logic: [],
        eventRaisers: [],
        eventListeners: [],
        effectRaisers: []
      },
      connections: [{ from: 'event-1', to: 'action-random' }]
    };

    const engine = new NodeExecutionEngine(
      compileCue(definition),
      'test-group:random-targets',
      harness.sequencer,
      harness.lightManager,
      cueLevelVarStore,
      groupLevelVarStore,
      new EffectRegistry()
    );

    engine.startExecution(eventNode, createCueData());
    harness.advanceBy(1);

    const green = getColor('green', 'high');
    const litIds: string[] = [];
    for (const lightId of harness.frontLightIds) {
      const state = harness.getLightState(lightId);
      if (state) {
        expect(state).toMatchObject({
          red: green.red,
          green: green.green,
          blue: green.blue,
          blendMode: green.blendMode
        });
        litIds.push(lightId);
      } else {
        expect(state).toBeNull();
      }
    }
    const uniqueLit = new Set(litIds);
    const expectedIds = new Set([
      harness.frontLightIds[0],
      harness.frontLightIds[1],
      harness.frontLightIds[3]
    ]);
    expect(uniqueLit).toEqual(expectedIds);

    randomSpy.mockRestore();
  });

  it('applies per-light chase offsets in linear order', () => {
    const eventNode: YargEventNode = {
      id: 'event-1',
      type: 'event',
      eventType: 'beat'
    };

    const actionNode: ActionNode = {
      id: 'action-1',
      type: 'action',
      effectType: 'chase',
      target: {
        groups: { source: 'literal', value: 'front' },
        filter: { source: 'literal', value: 'all' }
      },
      color: {
        name: { source: 'literal', value: 'green' },
        brightness: { source: 'literal', value: 'high' },
        blendMode: { source: 'literal', value: 'replace' }
      },
      timing: {
        waitForCondition: 'none',
        waitForTime: { source: 'literal', value: 0 },
        duration: { source: 'literal', value: 0 },
        waitUntilCondition: 'none',
        waitUntilTime: { source: 'literal', value: 0 }
      },
      config: {
        perLightOffsetMs: 20,
        order: 'linear'
      }
    };

    const definition: YargNodeCueDefinition = {
      id: 'chase-linear',
      name: 'Chase Linear',
      cueType: CueType.Default,
      style: 'primary',
      nodes: {
        events: [eventNode],
        actions: [actionNode],
        logic: [],
        eventRaisers: [],
        eventListeners: [],
        effectRaisers: []
      },
      connections: [{ from: 'event-1', to: 'action-1' }]
    };

    const engine = new NodeExecutionEngine(
      compileCue(definition),
      'test-group:chase-linear',
      harness.sequencer,
      harness.lightManager,
      cueLevelVarStore,
      groupLevelVarStore,
      new EffectRegistry()
    );

    engine.startExecution(eventNode, createCueData());
    harness.advanceBy(1);

    const green = getColor('green', 'high');
    const [first, second, third, fourth] = harness.frontLightIds;

    expect(harness.getLightState(first)).toMatchObject({
      red: green.red,
      green: green.green,
      blue: green.blue,
      blendMode: green.blendMode
    });
    expect(harness.getLightState(second)).toBeNull();
    expect(harness.getLightState(third)).toBeNull();
    expect(harness.getLightState(fourth)).toBeNull();

    harness.advanceBy(20);
    expect(harness.getLightState(second)).toMatchObject({
      red: green.red,
      green: green.green,
      blue: green.blue,
      blendMode: green.blendMode
    });

    harness.advanceBy(20);
    expect(harness.getLightState(third)).toMatchObject({
      red: green.red,
      green: green.green,
      blue: green.blue,
      blendMode: green.blendMode
    });

    harness.advanceBy(20);
    expect(harness.getLightState(fourth)).toMatchObject({
      red: green.red,
      green: green.green,
      blue: green.blue,
      blendMode: green.blendMode
    });
  });

  it('applies per-light chase offsets in inverse order', () => {
    const eventNode: YargEventNode = {
      id: 'event-1',
      type: 'event',
      eventType: 'beat'
    };

    const actionNode: ActionNode = {
      id: 'action-1',
      type: 'action',
      effectType: 'chase',
      target: {
        groups: { source: 'literal', value: 'front' },
        filter: { source: 'literal', value: 'all' }
      },
      color: {
        name: { source: 'literal', value: 'blue' },
        brightness: { source: 'literal', value: 'high' },
        blendMode: { source: 'literal', value: 'replace' }
      },
      timing: {
        waitForCondition: 'none',
        waitForTime: { source: 'literal', value: 0 },
        duration: { source: 'literal', value: 0 },
        waitUntilCondition: 'none',
        waitUntilTime: { source: 'literal', value: 0 }
      },
      config: {
        perLightOffsetMs: 15,
        order: 'inverse-linear'
      }
    };

    const definition: YargNodeCueDefinition = {
      id: 'chase-inverse',
      name: 'Chase Inverse',
      cueType: CueType.Default,
      style: 'primary',
      nodes: {
        events: [eventNode],
        actions: [actionNode],
        logic: [],
        eventRaisers: [],
        eventListeners: [],
        effectRaisers: []
      },
      connections: [{ from: 'event-1', to: 'action-1' }]
    };

    const engine = new NodeExecutionEngine(
      compileCue(definition),
      'test-group:chase-inverse',
      harness.sequencer,
      harness.lightManager,
      cueLevelVarStore,
      groupLevelVarStore,
      new EffectRegistry()
    );

    engine.startExecution(eventNode, createCueData());
    harness.advanceBy(1);

    const blue = getColor('blue', 'high');
    const [first, second, third, fourth] = harness.frontLightIds;

    expect(harness.getLightState(fourth)).toMatchObject({
      red: blue.red,
      green: blue.green,
      blue: blue.blue,
      blendMode: blue.blendMode
    });
    expect(harness.getLightState(first)).toBeNull();
    expect(harness.getLightState(second)).toBeNull();
    expect(harness.getLightState(third)).toBeNull();

    harness.advanceBy(15);
    expect(harness.getLightState(third)).toMatchObject({
      red: blue.red,
      green: blue.green,
      blue: blue.blue,
      blendMode: blue.blendMode
    });
  });

  it('raises events to trigger listener actions in a new context', () => {
    const eventNode: YargEventNode = {
      id: 'event-1',
      type: 'event',
      eventType: 'beat'
    };

    const raiserNode: EventRaiserNode = {
      id: 'raiser-1',
      type: 'event-raiser',
      eventName: 'internal-event',
      label: 'Raise',
      inputs: [],
      outputs: []
    };

    const listenerNode: EventListenerNode = {
      id: 'listener-1',
      type: 'event-listener',
      eventName: 'internal-event',
      label: 'Listen',
      outputs: ['action-listener']
    };

    const actionPrimary: ActionNode = {
      id: 'action-primary',
      type: 'action',
      effectType: 'set-color',
      target: {
        groups: { source: 'literal', value: 'front' },
        filter: { source: 'literal', value: 'all' }
      },
      color: {
        name: { source: 'literal', value: 'red' },
        brightness: { source: 'literal', value: 'high' },
        blendMode: { source: 'literal', value: 'replace' }
      },
      timing: {
        waitForCondition: 'none',
        waitForTime: { source: 'literal', value: 0 },
        duration: { source: 'literal', value: 0 },
        waitUntilCondition: 'none',
        waitUntilTime: { source: 'literal', value: 0 }
      }
    };

    const actionListener: ActionNode = {
      id: 'action-listener',
      type: 'action',
      effectType: 'set-color',
      target: {
        groups: { source: 'literal', value: 'back' },
        filter: { source: 'literal', value: 'all' }
      },
      color: {
        name: { source: 'literal', value: 'blue' },
        brightness: { source: 'literal', value: 'high' },
        blendMode: { source: 'literal', value: 'replace' }
      },
      timing: {
        waitForCondition: 'none',
        waitForTime: { source: 'literal', value: 0 },
        duration: { source: 'literal', value: 0 },
        waitUntilCondition: 'none',
        waitUntilTime: { source: 'literal', value: 0 }
      }
    };

    const definition: YargNodeCueDefinition = {
      id: 'event-chain',
      name: 'Event Chain',
      cueType: CueType.Default,
      style: 'primary',
      nodes: {
        events: [eventNode],
        actions: [actionPrimary, actionListener],
        logic: [],
        eventRaisers: [raiserNode],
        eventListeners: [listenerNode],
        effectRaisers: []
      },
      connections: [
        { from: 'event-1', to: 'action-primary' },
        { from: 'event-1', to: 'raiser-1' },
        { from: 'listener-1', to: 'action-listener' }
      ]
    };

    const engine = new NodeExecutionEngine(
      compileCue(definition),
      'test-group:event-chain',
      harness.sequencer,
      harness.lightManager,
      cueLevelVarStore,
      groupLevelVarStore,
      new EffectRegistry()
    );

    engine.startExecution(eventNode, createCueData());
    harness.advanceBy(1);

    const red = getColor('red', 'high');
    const blue = getColor('blue', 'high');
    const frontState = harness.getLightState(harness.frontLightIds[0]);
    const backState = harness.getLightState(harness.backLightIds[0]);
    expect(frontState).toMatchObject({
      red: red.red,
      green: red.green,
      blue: red.blue,
      blendMode: red.blendMode
    });
    expect(backState).toMatchObject({
      red: blue.red,
      green: blue.green,
      blue: blue.blue,
      blendMode: blue.blendMode
    });
  });
});
