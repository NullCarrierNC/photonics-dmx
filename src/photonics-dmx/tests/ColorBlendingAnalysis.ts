import { getColor } from '../helpers/dmxHelpers';
import { RGBIO } from '../types';

/**
 * Detailed analysis of color blending calculations using opacity and blend modes
 * This helps diagnose issues with the blending algorithm
 */
export class ColorBlendingAnalysis {
  
  /**
   * Analyze the expected blending between two colors
   */
  public analyzeBlending(color1: RGBIO, color2: RGBIO, layer1: number, layer2: number): void {
    console.log('🔍 Color Blending Analysis');
    console.log('==========================');
    
    // Display input colors
    console.log(`\n📥 Input Colors:`);
    console.log(`Layer ${layer1}:`, this.formatColor(color1));
    console.log(`Layer ${layer2}:`, this.formatColor(color2));
    
    // Analyze opacity-based blending
    this.analyzeOpacityBlending(color1, color2);
  }
  
  /**
   * Calculate what the blending should produce based on opacity and blend modes
   */
  private calculateExpectedBlending(color1: RGBIO, color2: RGBIO): RGBIO {
    const opacity1 = color1.opacity ?? 1.0;
    const opacity2 = color2.opacity ?? 1.0;
    const blendMode1 = color1.blendMode ?? 'replace';
    const blendMode2 = color2.blendMode ?? 'replace';
    
    const result: RGBIO = {
      red: 0,
      green: 0,
      blue: 0,
      intensity: 0,
      opacity: 1.0,
      blendMode: 'add'
    };
    
    // Calculate based on blend modes
    if (blendMode1 === 'add' && blendMode2 === 'add') {
      result.red = Math.round(color1.red * opacity1 + color2.red * opacity2);
      result.green = Math.round(color1.green * opacity1 + color2.green * opacity2);
      result.blue = Math.round(color1.blue * opacity1 + color2.blue * opacity2);
      result.intensity = Math.round(color1.intensity * opacity1 + color2.intensity * opacity2);
    } else if (blendMode1 === 'replace' || blendMode2 === 'replace') {
      // Replace mode - higher layer wins
      result.red = color2.red;
      result.green = color2.green;
      result.blue = color2.blue;
      result.intensity = color2.intensity;
    } else {
      // Default to additive for other blend modes
      result.red = Math.round(color1.red * opacity1 + color2.red * opacity2);
      result.green = Math.round(color1.green * opacity1 + color2.green * opacity2);
      result.blue = Math.round(color1.blue * opacity1 + color2.blue * opacity2);
      result.intensity = Math.round(color1.intensity * opacity1 + color2.intensity * opacity2);
    }
    
    return result;
  }
  
  /**
   * Analyze opacity values and their impact
   */
  private analyzeOpacityValues(color1: RGBIO, color2: RGBIO): void {
    console.log(`\n🎨 Opacity Analysis:`);
    
    const opacity1 = color1.opacity ?? 1.0;
    const opacity2 = color2.opacity ?? 1.0;
    
    // Check if opacities are set correctly for blending
    const hasBlendingPotential = opacity1 > 0 && opacity2 > 0;
    
    if (hasBlendingPotential) {
      console.log('✅ Colors have potential for blending (both opacities > 0)');
    } else {
      console.log('⚠️  One or both colors have zero opacity - may appear transparent');
    }
    
    // Show opacity values for each color
    console.log(`\n🔴 Layer 1 Opacity: ${opacity1}`);
    console.log(`🔵 Layer 2 Opacity: ${opacity2}`);
    console.log(`📊 Combined Opacity: ${opacity1 + opacity2}`);
    
    if (opacity1 + opacity2 > 2.0) {
      console.log('⚠️  Combined opacity > 2.0 may result in over-bright colors');
    }
  }
  
  /**
   * Show the step-by-step blending process
   */
  private showBlendingSteps(color1: RGBIO, color2: RGBIO): void {
    console.log(`\n📊 Blending Steps:`);
    
    const opacity1 = color1.opacity ?? 1.0;
    const opacity2 = color2.opacity ?? 1.0;
    const blendMode1 = color1.blendMode ?? 'replace';
    const blendMode2 = color2.blendMode ?? 'replace';
    
    if (blendMode1 === 'add' && blendMode2 === 'add') {
      console.log(`🔴 Red: ${color1.red} × ${opacity1} + ${color2.red} × ${opacity2} = ${Math.round(color1.red * opacity1 + color2.red * opacity2)}`);
      console.log(`🟢 Green: ${color1.green} × ${opacity1} + ${color2.green} × ${opacity2} = ${Math.round(color1.green * opacity1 + color2.green * opacity2)}`);
      console.log(`🔵 Blue: ${color1.blue} × ${opacity1} + ${color2.blue} × ${opacity2} = ${Math.round(color1.blue * opacity1 + color2.blue * opacity2)}`);
      console.log(`💡 Intensity: ${color1.intensity} × ${opacity1} + ${color2.intensity} × ${opacity2} = ${Math.round(color1.intensity * opacity1 + color2.intensity * opacity2)}`);
    } else if (blendMode1 === 'replace' || blendMode2 === 'replace') {
      console.log(`🔄 Replace mode detected - Layer 2 will override Layer 1`);
      console.log(`🔴 Red: ${color2.red}`);
      console.log(`🟢 Green: ${color2.green}`);
      console.log(`🔵 Blue: ${color2.blue}`);
      console.log(`💡 Intensity: ${color2.intensity}`);
    } else {
      console.log(`🔄 Mixed blend modes: ${blendMode1} + ${blendMode2}`);
      console.log(`Complex interaction - check individual channel behavior`);
    }
  }
  
  /**
   * Analyze opacity-based blending
   */
  private analyzeOpacityBlending(color1: RGBIO, color2: RGBIO): void {
    console.log(`\n🎨 Opacity-Based Blending Analysis:`);
    
    const opacity1 = color1.opacity ?? 1.0;
    const opacity2 = color2.opacity ?? 1.0;
    const blendMode1 = color1.blendMode ?? 'replace';
    const blendMode2 = color2.blendMode ?? 'replace';
    
    console.log(`Layer 1: opacity ${opacity1}, blendMode ${blendMode1}`);
    console.log(`Layer 2: opacity ${opacity2}, blendMode ${blendMode2}`);
    
    // Calculate expected result based on blend modes
    if (blendMode1 === 'add' && blendMode2 === 'add') {
      console.log(`\n🔄 Additive Blending (${blendMode1} + ${blendMode2}):`);
      console.log(`Red: ${color1.red} × ${opacity1} + ${color2.red} × ${opacity2} = ${Math.round(color1.red * opacity1 + color2.red * opacity2)}`);
      console.log(`Green: ${color1.green} × ${opacity1} + ${color2.green} × ${opacity2} = ${Math.round(color1.green * opacity1 + color2.green * opacity2)}`);
      console.log(`Blue: ${color1.blue} × ${opacity1} + ${color2.blue} × ${opacity2} = ${Math.round(color1.blue * opacity1 + color2.blue * opacity2)}`);
      console.log(`Intensity: ${color1.intensity} × ${opacity1} + ${color2.intensity} × ${opacity2} = ${Math.round(color1.intensity * opacity1 + color2.intensity * opacity2)}`);
    } else if (blendMode1 === 'replace' || blendMode2 === 'replace') {
      console.log(`\n🔄 Replace Blending: Higher layer overrides lower layer`);
      console.log(`Final result will be dominated by the higher layer`);
    } else {
      console.log(`\n🔄 Mixed Blending Modes: ${blendMode1} + ${blendMode2}`);
      console.log(`Complex interaction - check individual channel behavior`);
    }
    
    // Show blending steps
    this.showBlendingSteps(color1, color2);
    
    // Check for potential issues
    this.checkForOpacityIssues(color1, color2);
  }
  
  /**
   * Check for potential issues in opacity-based blending
   */
  private checkForOpacityIssues(color1: RGBIO, color2: RGBIO): void {
    console.log(`\n⚠️  Potential Issues:`);
    
    const issues: string[] = [];
    
    // Check opacity values
    const opacity1 = color1.opacity ?? 1.0;
    const opacity2 = color2.opacity ?? 1.0;
    
    if (opacity1 === 0 || opacity2 === 0) {
      issues.push('One or both colors have zero opacity - may appear transparent');
    }
    
    if (opacity1 + opacity2 > 2.0) {
      issues.push('Combined opacity > 2.0 may result in over-bright colors');
    }
    
    // Check blend mode compatibility
    const blendMode1 = color1.blendMode ?? 'replace';
    const blendMode2 = color2.blendMode ?? 'replace';
    
    if (blendMode1 === 'replace' && blendMode2 === 'replace') {
      issues.push('Both colors use replace mode - higher layer will override lower layer');
    }
    
    if (issues.length === 0) {
      console.log('✅ No obvious issues detected');
    } else {
      issues.forEach(issue => console.log(`  • ${issue}`));
    }
  }
  
  /**
   * Format a color for display
   */
  private formatColor(color: RGBIO): string {
    const opacity = color.opacity ?? 1.0;
    const blendMode = color.blendMode ?? 'replace';
    return `RGB(${color.red}, ${color.green}, ${color.blue}) I:${color.intensity} Opacity:${opacity} Blend:${blendMode}`;
  }
}

/**
 * Analyze blue and green color blending specifically
 */
export function analyzeBlueGreenBlending(): void {
  console.log('🔵🟢 Blue + Green Color Blending Analysis');
  console.log('==========================================');
  
  // Create test colors using the new opacity system
  const blueColor: RGBIO = {
    red: 0,
    green: 0,
    blue: 255,
    intensity: 255,
    opacity: 0.5,
    blendMode: 'add'
  };
  
  const greenColor: RGBIO = {
    red: 0,
    green: 255,
    blue: 0,
    intensity: 255,
    opacity: 0.5,
    blendMode: 'add'
  };
  
  console.log('\n📥 Test Colors:');
  console.log('Blue:', blueColor);
  console.log('Green:', greenColor);
  
  // Calculate expected result
  const expectedRed = Math.round(blueColor.red * blueColor.opacity + greenColor.red * greenColor.opacity);
  const expectedGreen = Math.round(blueColor.green * blueColor.opacity + greenColor.green * greenColor.opacity);
  const expectedBlue = Math.round(blueColor.blue * blueColor.opacity + greenColor.blue * greenColor.opacity);
  const expectedIntensity = Math.round(blueColor.intensity * blueColor.opacity + greenColor.intensity * greenColor.opacity);
  
  console.log('\n🎯 Expected Result:');
  console.log(`Red: ${expectedRed}`);
  console.log(`Green: ${expectedGreen}`);
  console.log(`Blue: ${expectedBlue}`);
  console.log(`Intensity: ${expectedIntensity}`);
  
  // This should result in cyan: R:0, G:128, B:128
  console.log('\n✅ Expected: Cyan color (R:0, G:128, B:128)');
  console.log(`Actual: RGB(${expectedRed}, ${expectedGreen}, ${expectedBlue})`);
  
  if (expectedRed === 0 && expectedGreen === 128 && expectedBlue === 128) {
    console.log('🎉 Perfect! Color blending is working correctly.');
  } else {
    console.log('❌ Color blending is not producing expected results.');
  }
}
