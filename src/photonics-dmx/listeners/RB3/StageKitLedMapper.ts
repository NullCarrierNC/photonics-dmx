/**
 * StageKit LED Mapper - Maps RB3E channel values to StageKit LED positions and colors
 * 
 * This class translates the RB3E network protocol data into specific StageKit LED
 * positions and colors based on the analysis of the RB3E log data.
 */
export class StageKitLedMapper {
  
  /**
   * Map left channel value to specific StageKit LED positions
   * Based on analysis of RB3E log data showing which LEDs are controlled by each value
   */
  mapLeftChannelToLedPositions(leftChannel: number): number[] {
    switch (leftChannel) {
      // Cue triggers - these control specific LED patterns
      case 1: // Dischord
        return [0, 1, 2, 3, 4, 5, 6, 7]; // All LEDs
      
      case 2: // Chorus
        return [0, 2, 4, 6]; // Even positions (front, back, left, right)
      
      case 4: // Stomp
        return [1, 3, 5, 7]; // Odd positions (diagonal positions)
      
      case 8: // Blackout_Fast
        return []; // No LEDs (blackout)
      
      case 16: // Harmony
        return [0, 1, 2, 3]; // Front half
      
      case 17: // Silhouettes
        return [1, 3, 5, 7]; // Back half (diagonal)
      
      // Direct LED control values - these control specific LED rings
      case 34: // Blue LEDs with low brightness
        return [0, 2, 4, 6]; // Alternating positions
      
      case 68: // Green LEDs with medium brightness
        return [4, 5, 6, 7]; // Back ring
      
      case 128: // Red LEDs with medium brightness
        return [0, 1, 2, 3]; // Front ring
      
      case 136: // Red LEDs with high brightness
        return [0, 1, 2, 3]; // Front ring (high intensity)
      
      // Combined LED patterns
      case 160: // Combined colors
        return [0, 1, 2, 3, 4, 5, 6, 7]; // All LEDs
      
      case 192: // Combined colors
        return [0, 1, 2, 3, 4, 5, 6, 7]; // All LEDs
      
      case 224: // Combined colors
        return [0, 1, 2, 3, 4, 5, 6, 7]; // All LEDs
      
      // Special values
      case 255: // Disable all
        return []; // No LEDs
      
      case 170: // Undocumented value
        return [0, 1, 2, 3, 4, 5, 6, 7]; // All LEDs (fallback)
      
      case 64: // Orange/undocumented
        return [2, 3, 6, 7]; // Side positions
      
      // Default case - no LEDs
      case 0:
      default:
        return []; // No LEDs
    }
  }
  
  /**
   * Map right channel value to color
   * Based on RB3E protocol analysis showing color bit patterns
   */
  mapRightChannelToColor(rightChannel: number): string {
    // Handle special control values first
    if (rightChannel === 0) return 'off';
    if (rightChannel === 1) return 'off';
    if (rightChannel === 2) return 'off'; // Strobe control off
    if (rightChannel === 3) return 'off';
    if (rightChannel === 7) return 'off';
    
    // Handle fog and strobe controls
    if (rightChannel === 4) return 'off'; // Fog control
    if (rightChannel === 8) return 'off'; // White control
    if (rightChannel === 16) return 'off'; // Yellow control
    
    // Handle color combinations based on bit patterns
    // 0x80 (128) = Red, 0x40 (64) = Green, 0x20 (32) = Blue
    
    const redBit = (rightChannel & 0x80) !== 0;    // 0x80 = 128 (bit 7)
    const greenBit = (rightChannel & 0x40) !== 0;  // 0x40 = 64 (bit 6)
    const blueBit = (rightChannel & 0x20) !== 0;   // 0x20 = 32 (bit 5)
    
    // Determine color based on bits (color mixing)
    if (redBit && greenBit && blueBit) {
      return 'white';
    } else if (redBit && greenBit) {
      return 'yellow'; // Red + Green = Yellow/Amber
    } else if (redBit && blueBit) {
      return 'purple'; // Red + Blue = Purple/Magenta
    } else if (greenBit && blueBit) {
      return 'teal';   // Green + Blue = Cyan/Teal
    } else if (redBit) {
      return 'red';
    } else if (greenBit) {
      return 'green';
    } else if (blueBit) {
      return 'blue';
    } else {
      return 'off';
    }
  }
  
  /**
   * Get description of what a left channel value controls
   */
  getLeftChannelDescription(leftChannel: number): string {
    switch (leftChannel) {
      case 0: return 'No cue / All off';
      case 1: return 'Dischord - All LEDs';
      case 2: return 'Chorus - Even positions (front, back, left, right)';
      case 4: return 'Stomp - Odd positions (diagonal)';
      case 8: return 'Blackout_Fast - No LEDs';
      case 16: return 'Harmony - Front half';
      case 17: return 'Silhouettes - Back half (diagonal)';
      case 34: return 'Blue LEDs - Alternating positions (low brightness)';
      case 68: return 'Green LEDs - Back ring (medium brightness)';
      case 128: return 'Red LEDs - Front ring (medium brightness)';
      case 136: return 'Red LEDs - Front ring (high brightness)';
      case 160: return 'Combined colors - All LEDs';
      case 192: return 'Combined colors - All LEDs';
      case 224: return 'Combined colors - All LEDs';
      case 255: return 'Disable all - No LEDs';
      case 170: return 'Undocumented - All LEDs (fallback)';
      case 64: return 'Orange/Undocumented - Side positions';
      default: return `Unknown value ${leftChannel}`;
    }
  }
  
  /**
   * Get description of what a right channel value controls
   */
  getRightChannelDescription(rightChannel: number): string {
    if (rightChannel === 0) return 'No color / Off';
    if (rightChannel === 1) return 'No color / Off';
    if (rightChannel === 2) return 'Strobe control off';
    if (rightChannel === 3) return 'No color / Off';
    if (rightChannel === 4) return 'Fog control';
    if (rightChannel === 7) return 'No color / Off';
    if (rightChannel === 8) return 'White control';
    if (rightChannel === 16) return 'Yellow control';
    
    const redBit = (rightChannel & 0x80) !== 0;
    const greenBit = (rightChannel & 0x40) !== 0;
    const blueBit = (rightChannel & 0x20) !== 0;
    
    if (redBit && greenBit && blueBit) {
      return 'White (Red + Green + Blue)';
    } else if (redBit && greenBit) {
      return 'Yellow (Red + Green)';
    } else if (redBit && blueBit) {
      return 'Purple (Red + Blue)';
    } else if (greenBit && blueBit) {
      return 'Teal (Green + Blue)';
    } else if (redBit) {
      return 'Red';
    } else if (greenBit) {
      return 'Green';
    } else if (blueBit) {
      return 'Blue';
    } else {
      return `Unknown color value ${rightChannel}`;
    }
  }
  
  /**
   * Get all valid left channel values and their descriptions
   */
  getAllLeftChannelMappings(): Array<{ value: number; description: string; ledPositions: number[] }> {
    const values = [0, 1, 2, 4, 8, 16, 17, 34, 68, 128, 136, 160, 192, 224, 255, 170, 64];
    
    return values.map(value => ({
      value,
      description: this.getLeftChannelDescription(value),
      ledPositions: this.mapLeftChannelToLedPositions(value)
    }));
  }
  
  /**
   * Get all valid right channel values and their descriptions
   */
  getAllRightChannelMappings(): Array<{ value: number; description: string; color: string }> {
    const values = [0, 1, 2, 3, 4, 7, 8, 16, 32, 64, 96, 128, 160, 192, 224];
    
    return values.map(value => ({
      value,
      description: this.getRightChannelDescription(value),
      color: this.mapRightChannelToColor(value)
    }));
  }
}
