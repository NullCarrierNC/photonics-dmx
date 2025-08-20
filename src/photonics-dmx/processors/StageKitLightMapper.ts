/**
 * StageKitLightMapper - Maps StageKit LED positions to DMX lights
 * 
 * This class handles the mapping of StageKit's 8 LED positions to a varying
 * number of DMX lights (4 or 8) using different mapping algorithms.
 * 
 *     0 (front)
 *   7     1
 *  6       2
 *   5     3
 *     4 (back)
 */
export class StageKitLightMapper {
  private dmxLightCount: number;
  
  constructor(dmxLightCount: 4 | 8) {
    this.dmxLightCount = dmxLightCount;
  }

  
  /**
   * Map StageKit LED positions to DMX light indices
   * @param ledPositions Array of StageKit LED positions (0-7)
   * @returns Array of DMX light indices to control
   */
  mapLedPositionsToDmxLights(ledPositions: number[]): number[] {
    if (ledPositions.length === 0) {
      return [];
    }
    
    if (this.dmxLightCount === 8) {
      return this.map8to8(ledPositions);
    } else {
      return this.map8to4(ledPositions);
    }
  }

  /**
   * Map StageKit color groups to DMX light indices
   * @param color The color group to light (red, yellow, green, blue)
   * @returns Array of DMX light indices to control
   */
  mapColorToDmxLights(color: string): number[] {
    if (!color || color === 'off') {
      return [];
    }
    
    if (this.dmxLightCount === 8) {
      return this.mapColorTo8Lights(color);
    } else {
      return this.mapColorTo4Lights(color);
    }
  }
  
  /**
   * Map color to 8 DMX lights using the color-based layout
   */
  private mapColorTo8Lights(color: string): number[] {
    switch (color.toLowerCase()) {
      case 'red':
      case 'yellow':
        // Red/Yellow lights: Front and back rings
        return [0, 1, 2, 3, 4, 5, 6, 7]; // All 8 DMX lights
      case 'green':
      case 'blue':
        // Green/Blue lights: All positions
        return [0, 1, 2, 3, 4, 5, 6, 7]; // All 8 DMX lights
      default:
        return [];
    }
  }

  /**
   * Map color to 4 DMX lights using the color-based layout
   */
  private mapColorTo4Lights(color: string): number[] {
    switch (color.toLowerCase()) {
      case 'red':
      case 'yellow':
        // Red/Yellow lights: Front and Back
        return [0, 2]; // DMX lights 1 and 5
      case 'green':
      case 'blue':
        // Green/Blue lights: Left and Right
        return [1, 3]; // DMX lights 3 and 7
      default:
        return [];
    }
  }

  /**
   * Direct 1:1 mapping from 8 StageKit LEDs to 8 DMX lights
   * Accounts for DMX light configuration: front: 1,2,3,4, back: 5,6,7,8
   * But RB3E expects back lights in reverse order: 8,7,6,5
   */
  private map8to8(ledPositions: number[]): number[] {
    return ledPositions.map(ledPos => {
      if (ledPos >= 0 && ledPos < 8) {
        // Front lights (0,1,2,3) map directly to DMX 0,1,2,3
        if (ledPos <= 3) {
          return ledPos;
        }
        // Back lights (4,5,6,7) need to be reversed for DMX 4,5,6,7
        // StageKit LED 4 (back) -> DMX 7 (back-right)
        // StageKit LED 5 (back-left) -> DMX 6 (back-left) 
        // StageKit LED 6 (left) -> DMX 5 (left)
        // StageKit LED 7 (front-left) -> DMX 4 (front-left)
        else {
          return 7 - ledPos + 4; // This maps 4->7, 5->6, 6->5, 7->4
        }
      }
      return -1; // Invalid position
    }).filter(index => index !== -1);
  }
  
  /**
   * Map 8 StageKit LED positions to 4 DMX lights
   */
  private map8to4(ledPositions: number[]): number[] {
    const dmxIndices = new Set<number>();
    
    ledPositions.forEach(ledPos => {
      if (ledPos >= 0 && ledPos < 8) {
        const dmxIndex = this.mapSingleLedToDmx(ledPos);
        if (dmxIndex >= 0 && dmxIndex < 4) {
          dmxIndices.add(dmxIndex);
        }
      }
    });
    
    return Array.from(dmxIndices).sort((a, b) => a - b);
  }
  
  /**
   * Map a single StageKit LED position to a DMX light index
   */
  public mapSingleLedToDmx(ledPos: number): number {
    //     0 (front)
    //   7     1
    //  6       2
    //   5     3
    //     4 (back)
    
    // Map to 4 DMX lights in a logical pattern:
    // DMX 0: Front (LEDs 0, 1, 7)
    // DMX 1: Right (LEDs 2, 3) 
    // DMX 2: Back (LEDs 4, 5)
    // DMX 3: Left (LEDs 6)
    
    if (ledPos === 0 || ledPos === 1 || ledPos === 7) return 0;      // Front
    if (ledPos === 2 || ledPos === 3) return 1;      // Right
    if (ledPos === 4 || ledPos === 5) return 2;      // Back
    if (ledPos === 6) return 3;      // Left
    
    return -1; // Invalid position
  }
  
  /**
   * Get the current DMX light count configuration
   */
  getDmxLightCount(): number {
    return this.dmxLightCount;
  }
  
  /**
   * Update the DMX light count configuration
   */
  updateDmxLightCount(newCount: 4 | 8): void {
    this.dmxLightCount = newCount;
  }
  
  /**
   * Get a description of the current mapping strategy
   */
  getMappingDescription(): string {
    if (this.dmxLightCount === 8) {
      return 'Direct 1:1 mapping with reversed back lights (8 StageKit LEDs → 8 DMX lights: Front:1-4, Back:8-5)';
    } else {
      return 'Grouped mapping (8 StageKit LEDs → 4 DMX lights: Front, Right, Back, Left)';
    }
  }
  
  /**
   * Get the mapping details for each DMX light
   */
  getDmxLightMappingDetails(): Array<{ dmxIndex: number; stageKitLeds: number[]; description: string }> {
    if (this.dmxLightCount === 8) {
      // 1:1 mapping with reversed back lights
      return [
        { dmxIndex: 0, stageKitLeds: [0], description: 'Front (StageKit LED 0)' },
        { dmxIndex: 1, stageKitLeds: [1], description: 'Front-Right (StageKit LED 1)' },
        { dmxIndex: 2, stageKitLeds: [2], description: 'Right (StageKit LED 2)' },
        { dmxIndex: 3, stageKitLeds: [3], description: 'Back-Right (StageKit LED 3)' },
        { dmxIndex: 4, stageKitLeds: [7], description: 'Front-Left (StageKit LED 7)' },
        { dmxIndex: 5, stageKitLeds: [6], description: 'Left (StageKit LED 6)' },
        { dmxIndex: 6, stageKitLeds: [5], description: 'Back-Left (StageKit LED 5)' },
        { dmxIndex: 7, stageKitLeds: [4], description: 'Back (StageKit LED 4)' }
      ];
    } else {
      // 4-light grouped mapping
      return [
        { dmxIndex: 0, stageKitLeds: [0, 1, 7], description: 'Front (LEDs 0, 1, 7)' },
        { dmxIndex: 1, stageKitLeds: [2, 3], description: 'Right (LEDs 2, 3)' },
        { dmxIndex: 2, stageKitLeds: [4, 5], description: 'Back (LEDs 4, 5)' },
        { dmxIndex: 3, stageKitLeds: [6], description: 'Left (LED 6)' }
      ];
    }
  }
  
  /**
   * Test the mapping with sample LED positions
   */
  testMapping(ledPositions: number[]): {
    input: number[];
    output: number[];
    description: string;
  } {
    const output = this.mapLedPositionsToDmxLights(ledPositions);
    return {
      input: ledPositions,
      output,
      description: this.getMappingDescription()
    };
  }
  
  /**
   * Debug method to show detailed mapping for LED positions
   */
  debugMapping(ledPositions: number[]): Array<{ ledPos: number; ledName: string; dmxIndex: number; dmxDescription: string }> {
    const layout = [
      'Front', 'Front-Right', 'Right', 'Back-Right', 'Back', 'Back-Left', 'Left', 'Front-Left'
    ];
    
    return ledPositions.map(ledPos => {
      const dmxIndex = this.mapSingleLedToDmx(ledPos);
      const ledName = layout[ledPos] || `Unknown(${ledPos})`;
      
      let dmxDescription = '';
      if (this.dmxLightCount === 8) {
        // For 8-light configuration, show the actual DMX index and position
        const dmxPositions = [
          'Front (1)', 'Front-Right (2)', 'Right (3)', 'Back-Right (4)', 
          'Front-Left (5)', 'Left (6)', 'Back-Left (7)', 'Back (8)'
        ];
        dmxDescription = dmxPositions[dmxIndex] || `Unknown DMX ${dmxIndex}`;
      } else {
        const descriptions = ['Front', 'Right', 'Back', 'Left'];
        dmxDescription = descriptions[dmxIndex] || `Unknown DMX ${dmxIndex}`;
      }
      
      return { ledPos, ledName, dmxIndex, dmxDescription };
    });
  }
  
  /**
   * Get all possible StageKit LED positions
   */
  static getAllStageKitLedPositions(): number[] {
    return [0, 1, 2, 3, 4, 5, 6, 7];
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
}
