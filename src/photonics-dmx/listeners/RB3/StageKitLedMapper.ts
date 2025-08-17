/**
 * StageKit LED Mapper - Maps RB3E channel values to StageKit LED positions and colors
 * 
 * This class translates the RB3E network protocol data into specific StageKit LED
 * positions and colors .
 * 
 * LED Layout (8 positions in a circle):
 *     0 (front)
 *   7     1
 *  6       2
 *   5     3
 *     4 (back)
 */
export class StageKitLedMapper {
  
  /**
   * Map left channel value to specific StageKit LED positions
   */
  mapLeftChannelToLedPositions(leftChannel: number): number[] {
    // Handle special control values first
    if (leftChannel === 0) return []; // No LEDs
    if (leftChannel === 255) return []; // DisableAll
    
    // Handle bit-based LED control (direct LED selection)
    if (leftChannel >= 1 && leftChannel <= 255) {
      return this.mapBitPatternToLedPositions(leftChannel);
    }
    
    // Default case - no LEDs
    return [];
  }
  
  
  /**
   * Map bit pattern to LED positions
   */
  private mapBitPatternToLedPositions(bitPattern: number): number[] {
    const ledPositions: number[] = [];
    
    // Zero = 0b00000001 (LED 0), One = 0b00000010 (LED 1), etc.
    if ((bitPattern & 0b00000001) !== 0) ledPositions.push(0);  // Front
    if ((bitPattern & 0b00000010) !== 0) ledPositions.push(1);  // Front-Right
    if ((bitPattern & 0b00000100) !== 0) ledPositions.push(2);  // Right
    if ((bitPattern & 0b00001000) !== 0) ledPositions.push(3);  // Back-Right
    if ((bitPattern & 0b00010000) !== 0) ledPositions.push(4);  // Back
    if ((bitPattern & 0b00100000) !== 0) ledPositions.push(5);  // Back-Left
    if ((bitPattern & 0b01000000) !== 0) ledPositions.push(6);  // Left
    if ((bitPattern & 0b10000000) !== 0) ledPositions.push(7);  // Front-Left
    
    return ledPositions;
  }
  
  /**
   * Map left channel value to color group
   */
  mapLeftChannelToColor(leftChannel: number): string {
    // Handle special control values first
    if (leftChannel === 0) return 'off';
    if (leftChannel === 255) return 'off'; // DisableAll
    
    // BlueLeds = 0x20 (32), GreenLeds = 0x40 (64), YellowLeds = 0x60 (96), RedLeds = 0x80 (128)
    if (leftChannel === 32) return 'blue';
    if (leftChannel === 64) return 'green';
    if (leftChannel === 96) return 'yellow';
    if (leftChannel === 128) return 'red';
    
    // Handle combined colors (bit patterns)
    if (leftChannel > 128) {
      // This might be a combined color pattern, not a single color
      return 'mixed';
    }
    
    // Default case
    return 'off';
  }

  /**
   * Map right channel value to color
   */
  mapRightChannelToColor(rightChannel: number): string {
    // Handle special control values first
    if (rightChannel === 0) return 'off';
    if (rightChannel === 255) return 'off'; // DisableAll
    
    // Handle special control values that might appear in RB3E data
    if (rightChannel === 1) return 'off'; // No color / Off
    if (rightChannel === 2) return 'off'; // Strobe control off / No color
    if (rightChannel === 3) return 'off'; // No color / Off
    if (rightChannel === 4) return 'off'; // Fog control / No color
    if (rightChannel === 7) return 'off'; // No color / Off
    if (rightChannel === 8) return 'off'; // White control / No color
    if (rightChannel === 16) return 'off'; // Yellow control / No color
    
    // BlueLeds = 0x20 (32), GreenLeds = 0x40 (64), YellowLeds = 0x60 (96), RedLeds = 0x80 (128)
    if (rightChannel === 32) return 'blue';
    if (rightChannel === 64) return 'green';
    if (rightChannel === 96) return 'yellow';
    if (rightChannel === 128) return 'red';
    
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
    if (leftChannel === 0) return 'No LEDs / All off';
    if (leftChannel === 255) return 'DisableAll - No LEDs';
    
    // Check if it's a color command
    if (leftChannel === 32) return 'Blue LEDs - All positions';
    if (leftChannel === 64) return 'Green LEDs - All positions';
    if (leftChannel === 96) return 'Yellow LEDs - All positions';
    if (leftChannel === 128) return 'Red LEDs - All positions';
    
    // Check if it's a bit pattern for specific LEDs
    const ledPositions = this.mapBitPatternToLedPositions(leftChannel);
    if (ledPositions.length > 0) {
      const positionNames = ledPositions.map(pos => this.getLedPositionName(pos)).join(', ');
      return `Specific LEDs: ${positionNames}`;
    }
    
    return `Unknown value ${leftChannel}`;
  }
  
  /**
   * Get description of what a right channel value controls
   */
  getRightChannelDescription(rightChannel: number): string {
    if (rightChannel === 0) return 'No color / Off';
    if (rightChannel === 255) return 'DisableAll - Off';
    
    // Handle special control values that might appear in RB3E data
    if (rightChannel === 1) return 'No color / Off';
    if (rightChannel === 2) return 'Strobe control off / No color';
    if (rightChannel === 3) return 'No color / Off';
    if (rightChannel === 4) return 'Fog control / No color';
    if (rightChannel === 7) return 'No color / Off';
    if (rightChannel === 8) return 'White control / No color';
    if (rightChannel === 16) return 'Yellow control / No color';
    
    // Check if it's a color command
    if (rightChannel === 32) return 'Blue LEDs';
    if (rightChannel === 64) return 'Green LEDs';
    if (rightChannel === 96) return 'Yellow LEDs';
    if (rightChannel === 128) return 'Red LEDs';
    
    // Handle color combinations
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
   * Get the name of a specific LED position
   */
  private getLedPositionName(position: number): string {
    const names = [
      'Front',        // 0
      'Front-Right',  // 1
      'Right',        // 2
      'Back-Right',   // 3
      'Back',         // 4
      'Back-Left',    // 5
      'Left',         // 6
      'Front-Left'    // 7
    ];
    return names[position] || `Unknown(${position})`;
  }
  
  /**
   * Get all valid left channel values and their descriptions
   */
  getAllLeftChannelMappings(): Array<{ value: number; description: string; ledPositions: number[] }> {
    const values = [0, 32, 64, 96, 128, 255];
    
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
    const values = [0, 32, 64, 96, 128, 255];
    
    return values.map(value => ({
      value,
      description: this.getRightChannelDescription(value),
      color: this.mapRightChannelToColor(value)
    }));
  }
  
  /**
   * Get the physical layout description of StageKit LEDs
   */
  static getStageKitLedLayout(): Array<{ position: number; location: string; coordinates: { x: number; y: number } }> {
    return [
      { position: 0, location: 'Front', coordinates: { x: 100, y: 32 } },
      { position: 1, location: 'Front-Right', coordinates: { x: 130, y: 67 } },
      { position: 2, location: 'Right', coordinates: { x: 166, y: 98 } },
      { position: 3, location: 'Back-Right', coordinates: { x: 130, y: 128 } },
      { position: 4, location: 'Back', coordinates: { x: 100, y: 164 } },
      { position: 5, location: 'Back-Left', coordinates: { x: 70, y: 128 } },
      { position: 6, location: 'Left', coordinates: { x: 33, y: 98 } },
      { position: 7, location: 'Front-Left', coordinates: { x: 70, y: 67 } }
    ];
  }

  /**
   * Test the LED mapping with common values
   */
  testCommonValues(): Array<{ leftChannel: number; rightChannel: number; ledPositions: number[]; leftColor: string; rightColor: string; description: string }> {
    const testCases = [
      { leftChannel: 0, rightChannel: 0, expectedLeds: [] },
      { leftChannel: 255, rightChannel: 255, expectedLeds: [] },
      { leftChannel: 32, rightChannel: 0, expectedLeds: [0, 1, 2, 3, 4, 5, 6, 7] }, // Blue LEDs, all positions
      { leftChannel: 64, rightChannel: 0, expectedLeds: [0, 1, 2, 3, 4, 5, 6, 7] }, // Green LEDs, all positions
      { leftChannel: 96, rightChannel: 0, expectedLeds: [0, 1, 2, 3, 4, 5, 6, 7] }, // Yellow LEDs, all positions
      { leftChannel: 128, rightChannel: 0, expectedLeds: [0, 1, 2, 3, 4, 5, 6, 7] }, // Red LEDs, all positions
      { leftChannel: 1, rightChannel: 128, expectedLeds: [0] }, // Front LED only, Red color
      { leftChannel: 3, rightChannel: 64, expectedLeds: [0, 1] }, // Front and Front-Right LEDs, Green color
      { leftChannel: 15, rightChannel: 32, expectedLeds: [0, 1, 2, 3] }, // Front half LEDs, Blue color
    ];
    
    return testCases.map(testCase => {
      const ledPositions = this.mapLeftChannelToLedPositions(testCase.leftChannel);
      const leftColor = this.mapLeftChannelToColor(testCase.leftChannel);
      const rightColor = this.mapRightChannelToColor(testCase.rightChannel);
      
      return {
        leftChannel: testCase.leftChannel,
        rightChannel: testCase.rightChannel,
        ledPositions,
        leftColor,
        rightColor,
        description: `Left: ${this.getLeftChannelDescription(testCase.leftChannel)}, Right: ${this.getRightChannelDescription(testCase.rightChannel)}`
      };
    });
  }
}
