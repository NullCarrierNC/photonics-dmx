import { RGBIO } from '../../types';
import { LightTransitionController } from '../../controllers/sequencer/LightTransitionController';
import { LightStateManager } from '../../controllers/sequencer/LightStateManager';

/**
 * Test suite for testing replace blend mode with fading effects
 * This ensures that higher layers with replace blend mode properly reveal lower layers
 * instead of creating additive blends (e.g., blue + green should not = cyan)
 */
describe('Replace Blend Mode with Fading Effects', () => {
  let lightTransitionController: LightTransitionController;
  let mockLightStateManager: jest.Mocked<LightStateManager>;

  beforeEach(() => {
    // Create mock light state manager
    mockLightStateManager = {
      setLightState: jest.fn(),
      getLightState: jest.fn().mockReturnValue({
        red: 0, green: 0, blue: 0, intensity: 0,
        opacity: 1.0, blendMode: 'replace'
      }),
      publishLightStates: jest.fn(),
      getTrackedLightIds: jest.fn().mockReturnValue(['test-light'])
    } as any;

    lightTransitionController = new LightTransitionController(mockLightStateManager);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Replace Blend Mode - No Additive Blending', () => {
    it('should not create cyan when blue (layer 0) + green (layer 1) with replace blend', () => {
      const lightId = 'test-light';
      
      // Set up base layer: Blue
      const blueBase: RGBIO = {
        red: 0,
        green: 0,
        blue: 255,
        intensity: 255,
        opacity: 1.0,
        blendMode: 'replace'
      };

      // Set up higher layer: Green with replace blend
      const greenReplace: RGBIO = {
        red: 0,
        green: 255,
        blue: 0,
        intensity: 255,
        opacity: 1.0,
        blendMode: 'replace'
      };

      // Simulate the layers being active
      const layerStates = new Map<number, RGBIO>();
      layerStates.set(0, blueBase);    // Base layer: Blue
      layerStates.set(1, greenReplace); // Higher layer: Green (replace)

      // Set the layer states directly
      (lightTransitionController as any)._currentLayerStates.set(lightId, layerStates);

      // Calculate final color
      (lightTransitionController as any).calculateFinalColorForLight(lightId);

      // Get the result
      const finalState = mockLightStateManager.setLightState.mock.calls[0][1] as RGBIO;

      // Verify: Should be pure green, NOT cyan
      expect(finalState.red).toBe(0);
      expect(finalState.green).toBe(255);  // Green completely overrides blue
      expect(finalState.blue).toBe(0);     // Blue is hidden, not blended
      expect(finalState.intensity).toBe(255);
      expect(finalState.blendMode).toBe('replace');
      expect(finalState.opacity).toBe(1.0);

      // Critical: This should NOT be cyan (R:0, G:255, B:255)
      // If it were additive blending, we'd get cyan
      expect(finalState.blue).not.toBe(255);
    });

    it('should reveal blue below when green (layer 1) fades out with replace blend', () => {
      const lightId = 'test-light';
      
      // Set up base layer: Blue
      const blueBase: RGBIO = {
        red: 0,
        green: 0,
        blue: 255,
        intensity: 255,
        opacity: 1.0,
        blendMode: 'replace'
      };

      // Set up higher layer: Green with replace blend, but fading out (opacity 0.0)
      const greenFadingOut: RGBIO = {
        red: 0,
        green: 255,
        blue: 0,
        intensity: 255,
        opacity: 0.0,  // Fading out - transparent
        blendMode: 'replace'
      };

      // Simulate the layers being active
      const layerStates = new Map<number, RGBIO>();
      layerStates.set(0, blueBase);        // Base layer: Blue
      layerStates.set(1, greenFadingOut);  // Higher layer: Green (fading out)

      // Set the layer states directly
      (lightTransitionController as any)._currentLayerStates.set(lightId, layerStates);

      // Calculate final color
      (lightTransitionController as any).calculateFinalColorForLight(lightId);

      // Get the result
      const finalState = mockLightStateManager.setLightState.mock.calls[0][1] as RGBIO;

      // Verify: Should reveal blue below, NOT cyan
      expect(finalState.red).toBe(0);
      expect(finalState.green).toBe(0);    // Green is transparent
      expect(finalState.blue).toBe(255);   // Blue is revealed
      expect(finalState.intensity).toBe(255);
      expect(finalState.blendMode).toBe('replace');
      expect(finalState.opacity).toBe(1.0);

      // Critical: This should be pure blue, NOT cyan
      expect(finalState.green).not.toBe(255);
      expect(finalState.blue).toBe(255);
    });

    it('should demonstrate the difference between replace and add blend modes', () => {
      const lightId = 'test-light';
      
      // Test 1: Replace blend mode (should NOT create cyan)
      const blueBase: RGBIO = {
        red: 0, green: 0, blue: 255, intensity: 255,
        opacity: 1.0, blendMode: 'replace'
      };
      const greenReplace: RGBIO = {
        red: 0, green: 255, blue: 0, intensity: 255,
        opacity: 1.0, blendMode: 'replace'
      };

      let layerStates = new Map<number, RGBIO>();
      layerStates.set(0, blueBase);
      layerStates.set(1, greenReplace);
      (lightTransitionController as any)._currentLayerStates.set(lightId, layerStates);
      (lightTransitionController as any).calculateFinalColorForLight(lightId);
      
      const replaceResult = mockLightStateManager.setLightState.mock.calls[0][1] as RGBIO;
      jest.clearAllMocks();

      // Test 2: Add blend mode (SHOULD create cyan)
      const greenAdd: RGBIO = {
        red: 0, green: 255, blue: 0, intensity: 255,
        opacity: 1.0, blendMode: 'add'
      };

      layerStates = new Map<number, RGBIO>();
      layerStates.set(0, blueBase);
      layerStates.set(1, greenAdd);
      (lightTransitionController as any)._currentLayerStates.set(lightId, layerStates);
      (lightTransitionController as any).calculateFinalColorForLight(lightId);
      
      const addResult = mockLightStateManager.setLightState.mock.calls[0][1] as RGBIO;

      // Verify the difference:
      // Replace mode: Green completely overrides blue
      expect(replaceResult.red).toBe(0);
      expect(replaceResult.green).toBe(255);
      expect(replaceResult.blue).toBe(0);      // Blue is hidden

      // Add mode: Green adds to blue, creating cyan
      expect(addResult.red).toBe(0);
      expect(addResult.green).toBe(255);
      expect(addResult.blue).toBe(255);        // Blue is preserved, creating cyan

      // Critical assertion: Replace should NOT equal Add
      expect(replaceResult.blue).not.toBe(addResult.blue);
      expect(replaceResult.green).toBe(addResult.green);
    });
  });

  describe('Fade Out Behavior with Replace Blend', () => {
    it('should properly fade out green to reveal blue below', () => {
      const lightId = 'test-light';
      
      // Base layer: Blue
      const blueBase: RGBIO = {
        red: 0, green: 0, blue: 255, intensity: 255,
        opacity: 1.0, blendMode: 'replace'
      };

      // Test different fade levels
      const fadeLevels = [1.0, 0.75, 0.5, 0.25, 0.0];
      
      fadeLevels.forEach((fadeLevel, _index) => {
        const greenFading: RGBIO = {
          red: 0, green: 255, blue: 0, intensity: 255,
          opacity: fadeLevel,
          blendMode: 'replace'
        };

        const layerStates = new Map<number, RGBIO>();
        layerStates.set(0, blueBase);
        layerStates.set(1, greenFading);
        (lightTransitionController as any)._currentLayerStates.set(lightId, layerStates);
        
        jest.clearAllMocks();
        (lightTransitionController as any).calculateFinalColorForLight(lightId);
        
        const result = mockLightStateManager.setLightState.mock.calls[0][1] as RGBIO;

        if (fadeLevel === 0.0) {
          // Fully faded out: should reveal blue
          expect(result.green).toBe(0);
          expect(result.blue).toBe(255);
          expect(result.opacity).toBe(1.0);
        } else if (fadeLevel === 1.0) {
          // Fully visible: should be green
          expect(result.green).toBe(255);
          expect(result.blue).toBe(0);
          expect(result.opacity).toBe(1.0);
        } else {
          // Partially faded: should blend proportionally
          const expectedGreen = Math.round(255 * fadeLevel);
          expect(result.green).toBe(expectedGreen);
          expect(result.blue).toBe(0); // Still hidden by green layer
        }

        // Critical: Should never create cyan during fade
        expect(result.red).toBe(0);
        if (fadeLevel > 0) {
          expect(result.green).toBeGreaterThan(0);
          expect(result.blue).toBe(0); // Blue should remain hidden
        }
      });
    });
  });

  describe('Layer Order with Replace Blend', () => {
    it('should respect layer order with replace blend mode', () => {
      const lightId = 'test-light';
      
      // Layer 0: Blue
      const blueLayer: RGBIO = {
        red: 0, green: 0, blue: 255, intensity: 255,
        opacity: 1.0, blendMode: 'replace'
      };

      // Layer 1: Green
      const greenLayer: RGBIO = {
        red: 0, green: 255, blue: 0, intensity: 255,
        opacity: 1.0, blendMode: 'replace'
      };

      // Layer 2: Red (highest)
      const redLayer: RGBIO = {
        red: 255, green: 0, blue: 0, intensity: 255,
        opacity: 1.0, blendMode: 'replace'
      };

      // Test different layer combinations
      const testCases = [
        { layers: [0], expected: { red: 0, green: 0, blue: 255 }, description: 'Blue only' },
        { layers: [0, 1], expected: { red: 0, green: 255, blue: 0 }, description: 'Green overrides blue' },
        { layers: [0, 2], expected: { red: 255, green: 0, blue: 0 }, description: 'Red overrides blue' },
        { layers: [0, 1, 2], expected: { red: 255, green: 0, blue: 0 }, description: 'Red overrides all' },
        { layers: [1, 2], expected: { red: 255, green: 0, blue: 0 }, description: 'Red overrides green' }
      ];

      testCases.forEach(({ layers, expected, description }) => {
        const layerStates = new Map<number, RGBIO>();
        layers.forEach(layerNum => {
          const layerColor = [blueLayer, greenLayer, redLayer][layerNum];
          layerStates.set(layerNum, layerColor);
        });

        (lightTransitionController as any)._currentLayerStates.set(lightId, layerStates);
        jest.clearAllMocks();
        (lightTransitionController as any).calculateFinalColorForLight(lightId);
        
        const result = mockLightStateManager.setLightState.mock.calls[0][1] as RGBIO;

        // Use description in test output for better debugging
        console.log(`Testing: ${description}`);

        // Verify the highest layer wins
        expect(result.red).toBe(expected.red);
        expect(result.green).toBe(expected.green);
        expect(result.blue).toBe(expected.blue);
        expect(result.blendMode).toBe('replace');

        // Critical: Should never create additive blends
        if (expected.red > 0 && expected.green > 0) {
          // If we have both red and green, it should be because red is the highest layer
          // NOT because they're blending together
          expect(result.blue).toBe(0);
        }
      });
    });
  });
});
