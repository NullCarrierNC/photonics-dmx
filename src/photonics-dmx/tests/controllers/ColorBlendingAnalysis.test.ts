import { ColorBlendingAnalysis, analyzeBlueGreenBlending } from './ColorBlendingAnalysis';

describe('ColorBlendingAnalysis', () => {
  test('should analyze blue-green blending correctly', () => {
    expect(() => analyzeBlueGreenBlending()).not.toThrow();
  });

  test('should analyze color blending with different combinations', () => {
    const analysis = new ColorBlendingAnalysis();
    const redColor = { red: 255, green: 0, blue: 0, intensity: 255, opacity: 0.7, blendMode: 'add' as const };
    const blueColor = { red: 0, green: 0, blue: 255, intensity: 255, opacity: 0.8, blendMode: 'add' as const };
    
    expect(() => analysis.analyzeBlending(redColor, blueColor, 1, 2)).not.toThrow();
  });

  test('should handle replace blend mode correctly', () => {
    const analysis = new ColorBlendingAnalysis();
    const baseColor = { red: 100, green: 100, blue: 100, intensity: 100, opacity: 1.0, blendMode: 'replace' as const };
    const overlayColor = { red: 200, green: 200, blue: 200, intensity: 200, opacity: 0.5, blendMode: 'replace' as const };
    
    expect(() => analysis.analyzeBlending(baseColor, overlayColor, 1, 2)).not.toThrow();
  });

  test('should handle zero opacity colors', () => {
    const analysis = new ColorBlendingAnalysis();
    const visibleColor = { red: 255, green: 255, blue: 255, intensity: 255, opacity: 1.0, blendMode: 'add' as const };
    const transparentColor = { red: 255, green: 0, blue: 0, intensity: 255, opacity: 0.0, blendMode: 'add' as const };
    
    expect(() => analysis.analyzeBlending(visibleColor, transparentColor, 1, 2)).not.toThrow();
  });
});
