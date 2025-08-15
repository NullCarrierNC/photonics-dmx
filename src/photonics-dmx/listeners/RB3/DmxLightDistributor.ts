/**
 * DMX Light Distributor - Maps StageKit LED positions to DMX lights
 * 
 * This class handles the distribution of StageKit's 8 LED positions to a varying
 * number of DMX lights (4 or 8) using different mapping algorithms.
 */
export class DmxLightDistributor {
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
   * Direct 1:1 mapping from 8 StageKit LEDs to 8 DMX lights
   */
  private map8to8(ledPositions: number[]): number[] {
    return ledPositions.map(ledPos => {
      if (ledPos >= 0 && ledPos < 8) {
        return ledPos;
      }
      return -1; // Invalid position
    }).filter(index => index !== -1);
  }
  
  /**
   * Map 8 StageKit LED positions to 4 DMX lights
   * Uses different mapping strategies for optimal light distribution
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
   * Uses a circular distribution pattern for even coverage
   */
  private mapSingleLedToDmx(ledPos: number): number {
    // StageKit LED layout (8 positions in a circle):
    //     0 (front)
    //   7     1
    //  6       2
    //   5     3
    //     4 (back)
    
    // Map to 4 DMX lights in a logical pattern:
    // DMX 0: Front (LEDs 0, 1)
    // DMX 1: Right (LEDs 2, 3) 
    // DMX 2: Back (LEDs 4, 5)
    // DMX 3: Left (LEDs 6, 7)
    
    if (ledPos === 0 || ledPos === 1) return 0;      // Front
    if (ledPos === 2 || ledPos === 3) return 1;      // Right
    if (ledPos === 4 || ledPos === 5) return 2;      // Back
    if (ledPos === 6 || ledPos === 7) return 3;      // Left
    
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
      return 'Direct 1:1 mapping (8 StageKit LEDs → 8 DMX lights)';
    } else {
      return 'Grouped mapping (8 StageKit LEDs → 4 DMX lights: Front, Right, Back, Left)';
    }
  }
  
  /**
   * Get the mapping details for each DMX light
   */
  getDmxLightMappingDetails(): Array<{ dmxIndex: number; stageKitLeds: number[]; description: string }> {
    if (this.dmxLightCount === 8) {
      // 1:1 mapping
      return Array.from({ length: 8 }, (_, i) => ({
        dmxIndex: i,
        stageKitLeds: [i],
        description: `StageKit LED ${i}`
      }));
    } else {
      // 4-light grouped mapping
      return [
        { dmxIndex: 0, stageKitLeds: [0, 1], description: 'Front (LEDs 0, 1)' },
        { dmxIndex: 1, stageKitLeds: [2, 3], description: 'Right (LEDs 2, 3)' },
        { dmxIndex: 2, stageKitLeds: [4, 5], description: 'Back (LEDs 4, 5)' },
        { dmxIndex: 3, stageKitLeds: [6, 7], description: 'Left (LEDs 6, 7)' }
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
   * Get all possible StageKit LED positions
   */
  static getAllStageKitLedPositions(): number[] {
    return [0, 1, 2, 3, 4, 5, 6, 7];
  }
  
  /**
   * Get the physical layout description of StageKit LEDs
   */
  static getStageKitLedLayout(): Array<{ position: number; location: string }> {
    return [
      { position: 0, location: 'Front' },
      { position: 1, location: 'Front-Right' },
      { position: 2, location: 'Right' },
      { position: 3, location: 'Back-Right' },
      { position: 4, location: 'Back' },
      { position: 5, location: 'Back-Left' },
      { position: 6, location: 'Left' },
      { position: 7, location: 'Front-Left' }
    ];
  }
}
