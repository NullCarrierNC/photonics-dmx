import { NodeExecutionEngine } from '../../../../cues/node/runtime/NodeExecutionEngine';
import { EffectRegistry } from '../../../../cues/node/runtime/EffectRegistry';
import type { CompiledYargCue } from '../../../../cues/node/compiler/NodeCueCompiler';
import type {
  ActionNode,
  Connection,
  LogicNode,
  YargEventNode,
  YargNodeCueDefinition
} from '../../../../cues/types/nodeCueTypes';
import { CueType, defaultCueData, type CueData } from '../../../../cues';
import { getColor } from '../../../../helpers/dmxHelpers';
import { createSequencerHarness } from '../../../helpers/sequencerHarness';

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
    expect(earlyLayers.has(1)).toBe(true);
    expect(earlyLayers.has(5)).toBe(false);

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

    expect(redTick).not.toBeNull();
    expect(blueTick).not.toBeNull();
    expect((blueTick as number) > (redTick as number)).toBe(true);
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
});
