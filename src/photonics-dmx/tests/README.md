# Photonics DMX Tests

This directory contains the test suites for the Photonics DMX lighting system. The tests are organized by module type, with each suite focusing on testing specific functionality.

## Structure

- `controllers/`: Tests for the controller components that manage lighting effects and transitions
- `cueHandlers/`: Tests for the cue handler components that process lighting cues from games
- `helpers/`: Utility functions and fixtures for testing
- `jest.setup.ts`: Jest setup configuration

## Controller Tests

### Sequencer.test.ts

Tests the Sequencer facade, which serves as the primary API for the lighting system. The Sequencer delegates to appropriate controllers to handle specific tasks.

- **addEffect**: Verifies that the Sequencer correctly delegates to the EffectManager
- **setEffect**: Ensures proper delegation to the EffectManager when setting effects
- **setState**: Confirms that the Sequencer properly delegates to the EffectManager for state changes
- **blackout**: Tests that the Sequencer correctly delegates to the SystemEffectsController
- **cancelBlackout**: Verifies delegation to the SystemEffectsController when cancelling blackouts
- **onBeat/onMeasure/onKeyframe**: Tests proper event handling delegation to the SongEventHandler
- **shutdown**: Ensures the animation loop is stopped and resources are cleaned up

### EffectManager.test.ts

Tests the EffectManager which manages lighting effects, including adding, setting, and removing effects.

- **addEffect**: Tests that effects are added correctly and layer management works as expected
- **setEffect**: Verifies that existing effects on target layers are removed before adding new ones
- **addEffectUnblockedName**: Confirms that effects with duplicate names are handled correctly
- **setEffectUnblockedName**: Tests proper replacement behavior when name conflicts exist
- **removeEffect**: Verifies that effects can be correctly removed by name and layer
- **removeAllEffects**: Tests that all active effects can be removed
- **blackout handling**: Verifies proper interaction with SystemEffectsController

### LayerManager.test.ts

Tests the LayerManager which manages effect layers and their priorities.

- **Active Effects Management**: Tests adding, retrieving, and removing active effects
- **Queued Effects Management**: Verifies proper handling of queued effects
- **Layer Cleanup**: Ensures unused layers are cleaned up after the grace period
- **Blackout Layer Management**: Tests layer threshold handling for blackout effects

### TransitionEngine.test.ts

Tests the TransitionEngine which handles animations, state transitions, and timing of effects.

- **startAnimationLoop/stopAnimationLoop**: Tests animation loop initialization and cleanup
- **updateTransitions**: Verifies proper processing of active effects and transitions
- **Transition State Management**: Tests handling of various transition states (waitingFor, transitioning, waitingUntil)
- **getFinalState/clearFinalStates**: Validates state retrieval and management for specific layers

### SystemEffectsController.test.ts

Tests the SystemEffectsController which manages system-wide effects like blackouts.

- **blackout**: Verifies that blackout transitions are correctly applied to all lights
- **cancelBlackout**: Tests that existing blackouts can be cancelled
- **getBlackoutLayersUnder**: Validates that the correct blackout layer threshold is returned

### LightTransitionController.test.ts

Tests the LightTransitionController which manages light transitions at the lowest level.

- **setTransition**: Tests that transitions are added and updated correctly
- **getLightState**: Verifies correct light state retrieval
- **removeTransitionsByLayer**: Tests removal of transitions by layer
- **applyTransition**: Validates that transition objects are set up correctly
- **calculateLayeredState**: Tests proper prioritization of higher layer states
- **independent channel priority blending**: Verifies that each RGB and intensity channel blends according to its own priority value
- **multi-layer blending**: Tests blending of multiple layers with different priorities for each channel
- **full priority override**: Confirms that a higher layer with all priorities of 255 completely overrides the lower layer

### EffectTransformer.test.ts

Tests the EffectTransformer which processes and transforms lighting effects.

- **groupTransitionsByLayer**: Tests correct grouping of transitions by their layer property

### TimeoutManager.test.ts

Tests the TimeoutManager which handles timeouts and intervals for effects.

- **setTimeout/clearTimeout**: Tests creation and clearing of timeouts
- **setInterval/clearInterval**: Verifies interval creation and management
- **clearAllTimeouts**: Tests that all timeouts can be cleared at once
- **removeTimeout**: Verifies that timeouts can be removed from tracking without clearing

## Cue Handler Tests

### AbstractCueHandler.test.ts

Tests the AbstractCueHandler base class which provides common functionality for all cue handlers.

- **handleCue**: Tests that rapid cue calls are debounced to prevent issues from quick successive calls


## Helpers

### testFixtures.ts

Provides utility functions to create test fixtures for use in tests.

- **createMockRGBIP**: Creates a mock RGBIP object with customizable properties
- **createMockTrackedLight**: Creates a mock TrackedLight object
- **createMockLightingConfig**: Creates a mock lighting configuration

## Note on Architecture

All controller components should be accessed through the Sequencer facade which acts as a central point for interacting with the lighting system. The individual controller tests validate the internal implementation that is used by the Sequencer.
