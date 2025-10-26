# Color Blending Tests

This directory contains tests to validate color blending behavior with layers in the photonics DMX system.

## Test Files

### ReplaceBlendModeFade.test.ts
Tests the interaction of `blendMode: 'replace'` with fading effects:
- Validates that higher layers properly reveal lower layers during fades
- Ensures no additive blending occurs when using replace mode
- Tests cross-fading behavior between colors

### ColorBlendingAnalysis.ts
A detailed analysis tool that:
- Calculates expected blending results using opacity and blend modes
- Shows step-by-step blending calculations
- Identifies potential issues with opacity values
- Helps diagnose why blending might not work as expected

## Running the Tests

### Quick Analysis (Recommended First)
Run just the analysis to see what should happen:
```bash
npm run test:color-analysis
```

This will show you:
- Expected blending calculations
- Opacity analysis
- Potential issues
- Step-by-step blending process

### Full Test Suite
Run the complete test suite:
```bash
npm test
```

This will:
- Run all tests including color blending validation
- Test opacity-based blending behavior
- Validate blend mode interactions
- Ensure proper layer behavior

## What to Look For

### Expected Result
Blue (R:0, G:0, B:100) + Green (R:0, G:100, B:0) with `blendMode: 'add'` should = Cyan (R:0, G:100, B:100)

### Key Behaviors to Validate
1. **Opacity Values**: 0.0 = transparent, 1.0 = fully opaque
2. **Layer Order**: Higher layers should blend on top of lower layers
3. **Blend Modes**: Each mode has distinct blending behavior

### Common Test Scenarios
- `blendMode: 'replace'` with fading - should reveal underlying colors
- `blendMode: 'add'` with partial opacity - should blend colors naturally
- Layer transitions - should respect opacity and blend mode settings

## Debugging Steps

1. **Run the analysis first** to see what should happen
2. **Check opacity values** - they control blending contribution
3. **Verify blend modes** - ensure correct blending algorithm is used
4. **Examine final states** - compare actual vs expected results
5. **Check individual layers** - verify each layer has correct color values

## Understanding the Blending

The system uses an opacity-based blending approach:

### Opacity-Based System
- **opacity**: 0.0 to 1.0, controls contribution strength
- **blendMode**: How colors interact ('replace', 'add', 'multiply', 'overlay')
- **Intuitive**: 0.5 opacity = 50% contribution
- **Predictable**: Colors blend naturally based on blend mode

## Blend Modes

- **replace**: Overwrites lower layer colors (default)
- **add**: Adds to lower layer colors (good for additive blending)
- **multiply**: Multiplies with lower layer colors (good for darkening)
- **overlay**: Combines multiply and screen blending (good for contrast)

## For Proper Additive Blending (Blue + Green = Cyan)

```typescript
blue.opacity = 1.0;      // Full contribution
blue.blendMode = 'add';  // Additive blending

green.opacity = 1.0;     // Full contribution  
green.blendMode = 'add'; // Additive blending
```

## Test Coverage

The test suite covers:
- Basic opacity blending behavior
- Blend mode interactions
- Layer order validation
- Fade effect behavior
- Cross-fading scenarios
- Edge cases and error conditions
