import { randomBetween } from '../helpers/utils';
import {
  LightingConfiguration,
  TrackedLight,
  LocationGroup,
  LightTarget,
  DmxFixture, 
} from '../types';

/**
 * Requests lights based on groups and targets.
 * Groups: Locations like Front and Back.
 * Target: filter to a subset of lights in a group, like even, odd, half1 or half2, etc.
 */
export class DmxLightManager {
  private _frontLights: TrackedLight[] = [];
  private _backLights: TrackedLight[] = [];
  private _strobeLights: TrackedLight[] = [];

  private _dmxLights: Map<string, DmxFixture> = new Map<string, DmxFixture>();
  private _lightsCache: Map<string, TrackedLight[]> = new Map<string, TrackedLight[]>();


  constructor(private config: LightingConfiguration) {
    this.initializeLights();
    this.initializeDmxLights();
  }

  /**
   * Initializes the tracked light arrays based on the current configuration.
   */
  private initializeLights(): void {
  //  console.log("Init",  this.config.frontLights);

    this._frontLights = this.config.frontLights
      .filter((light) => light.id !== null)
      .map((light) => ({
        id: light.id as string,
        position: light.position,
        config: light.config,
      }))
      .sort((a, b) => a.position - b.position);

    this._backLights = this.config.backLights
      .filter((light) => light.id !== null)
      .map((light) => ({
        id: light.id as string,
        position: light.position,
        config: light.config,
      }))
      .sort((a, b) => a.position - b.position);

    this._strobeLights = this.config.strobeLights
      .filter((light) => light.id !== null)
      .map((light) => ({
        id: light.id as string,
        position: light.position,
        config: light.config,
      }))
      .sort((a, b) => a.position - b.position);
  }

  /**
   * Initializes the _dmxLights map by mapping each light's ID to its corresponding DmxLight object.
   */
  private initializeDmxLights(): void {
    const allDmxLights = [...this.config.frontLights, ...this.config.backLights, ...this.config.strobeLights];

    allDmxLights.forEach((light) => {
      this._dmxLights.set(light.id!, light);
    });
  }

  /**
   * Retrieves a DmxLight ID and returns the DmxLight object.
   * @param light  TrackedLight object
   * @returns Matching DmxLight object
   */
  public getDmxLight(id: string): DmxFixture | undefined {
    const dmxLight = this._dmxLights.get(id);
    return dmxLight;
  }

  /**
   * Retrieves lights based on group(s) and target(s).
   * Results are cached for performance optimization.
   * @param group Single or array of LocationGroup
   * @param target Single or array of LightTarget
   * @returns Array of TrackedLight
   */
  public getLights(
    group: LocationGroup | LocationGroup[],
    target: LightTarget | LightTarget[]
  ): TrackedLight[] {
    const groups = Array.isArray(group) ? group : [group];
    const targets = Array.isArray(target) ? target : [target];

    // Generate cache key by sorting groups and targets for consistency
    const cacheKey = `${[...groups].sort().join(',')}|${[...targets].sort().join(',')}`;
    
    // Check cache first
    if (this._lightsCache.has(cacheKey)) {
      return this._lightsCache.get(cacheKey)!;
    }

    // Cache miss - perform calculation
    const lightsSet = new Set<TrackedLight>();

    groups.forEach((g) => {
      const groupLights = this.getLightsInGroup(g);
      targets.forEach((t) => {
        const targetedLights = this.getLightsByTarget(groupLights, t);
        targetedLights.forEach((light) => lightsSet.add(light));
      });
    });

    const result = Array.from(lightsSet).sort((a, b) => a.position - b.position);
    
    // Cache the result
    this._lightsCache.set(cacheKey, result);
    
    return result;
  }

  /**
   * Retrieves lights based on group(s).
   * @param group Single or array of LocationGroup
   * @returns Array of TrackedLight
   */
  public getLightsInGroup(
    group: LocationGroup | LocationGroup[]
  ): TrackedLight[] {
    const groups = Array.isArray(group) ? group : [group];
    let result: TrackedLight[] = [];

    groups.forEach((g) => {
      switch (g) {
        case 'front':
          result = result.concat(this._frontLights);
          break;
        case 'back':
          result = result.concat(this._backLights);
          break;
        case 'strobe':
          result = result.concat(this._strobeLights);
          break;
        default:
          // Optionally handle unknown groups
          console.warn(`Unknown group: ${g}`);
          break;
      }
    });

    return result.sort((a, b) => a.position - b.position);
  }

  /**
   * Filters the provided lights based on the target criteria.
   * @param lights Array of TrackedLight to filter
   * @param target LightTarget criteria
   * @returns Array of TrackedLight matching the target
   */
  public getLightsByTarget(
    lights: TrackedLight[],
    target: LightTarget
  ): TrackedLight[] {
    switch (target) {
      case 'all':
        return [...lights];
      case 'even':
        return lights.filter((light) => light.position % 2 === 0);
      case 'odd':
        return lights.filter((light) => light.position % 2 !== 0);
      case 'half-1':
        return this.getHalf1(lights);
      case 'half-2':
        return this.getHalf2(lights);
      case 'outter-half-major':
        return this.getOutterHalfMajor(lights);
      case 'outter-half-minor':
        return this.getOutterHalfMinor(lights);
      case 'inner-half-major':
        return this.getInnerHalfMajor(lights);
      case 'inner-half-minor':
        return this.getInnerHalfMinor(lights);
      case 'third-1':
        return this.getThird(lights, 1);
      case 'third-2':
        return this.getThird(lights, 2);
      case 'third-3':
        return this.getThird(lights, 3);
      case 'quarter-1':
        return this.getQuarter(lights, 1);
      case 'quarter-2':
        return this.getQuarter(lights, 2);
      case 'quarter-3':
        return this.getQuarter(lights, 3);
      case 'quarter-4':
        return this.getQuarter(lights, 4);
      case 'linear':
        return [...lights].sort((a, b) => a.position - b.position);
      case 'inverse-linear':
        return [...lights].sort((a, b) => b.position - a.position);
      case 'random-1':
        return [lights[randomBetween(0, lights.length-1)]];
      case 'random-2':
        return [lights[randomBetween(0, lights.length-1)], lights[randomBetween(0, lights.length-1)]];
      case 'random-3':
        return [lights[randomBetween(0, lights.length-1)], lights[randomBetween(0, lights.length-1)], lights[randomBetween(0, lights.length-1)]];
      case 'random-4':
        return [lights[randomBetween(0, lights.length-1)], lights[randomBetween(0, lights.length-1)], lights[randomBetween(0, lights.length-1)], lights[randomBetween(0, lights.length-1)]];
      default:
        console.warn(`Unknown target: ${target}`);
        return [];
    }
  }

  /**
   * Retrieves the first half of the lights.
   * @param lights Array of TrackedLight
   * @returns Array of TrackedLight
   */
  private getHalf1(lights: TrackedLight[]): TrackedLight[] {
    const len = lights.length;
    const half = Math.floor(len / 2);
    return lights.slice(0, half);
  }

  /**
   * Retrieves the second half of the lights.
   * @param lights Array of TrackedLight
   * @returns Array of TrackedLight
   */
  private getHalf2(lights: TrackedLight[]): TrackedLight[] {
    const len = lights.length;
    const half = Math.floor(len / 2);
    if (len % 2 === 0) {
      return lights.slice(half);
    } else {
      return lights.slice(half + 1);
    }
  }

  /**
  * Divides the lights array into three parts and returns the specified third.
  * - If `thirdNumber = 2` and the number of lights is odd, returns the exact middle light.
  * - Otherwise, ensures that at least two lights are returned by including an adjacent light if necessary.
  *
  * @param lights - Array of TrackedLight objects.
  * @param thirdNumber - The third to retrieve (1, 2, or 3).
  * @returns An array of TrackedLight objects corresponding to the specified third.
  */
  private getThird(lights: TrackedLight[], thirdNumber: number): TrackedLight[] {
    const len = lights.length;

    if (thirdNumber < 1 || thirdNumber > 3) {
      throw new Error("thirdNumber must be 1, 2, or 3.");
    }

    if (len === 0) return [];

    if (len < 3) {
      // Handle cases with fewer than 3 lights
      if (thirdNumber === 1) return lights.slice(0, 1);
      if (thirdNumber === 2) return lights.slice(1, 2);
      if (thirdNumber === 3) return lights.slice(2, 3);
      return [];
    }

    // Special handling for thirdNumber = 2 with odd number of lights
    if (thirdNumber === 2 && len % 2 === 1) {
      const midIndex = Math.floor(len / 2);
      return lights.slice(midIndex, midIndex + 1);
    }

    const base = Math.floor(len / 3);
    const remainder = len % 3;
    let start = 0;
    let end = 0;

    if (thirdNumber === 1) {
      end = base + (remainder > 0 ? 1 : 0);
    } else if (thirdNumber === 2) {
      start = base + (remainder > 0 ? 1 : 0);
      end = start + base + (remainder > 1 ? 1 : 0);
    } else if (thirdNumber === 3) {
      start = 2 * base + (remainder > 0 ? 1 : 0) + (remainder > 1 ? 1 : 0);
      end = len;
    }

    // Ensure that at least two lights are returned by including an adjacent light if necessary
    if (!(thirdNumber === 2 && len % 2 === 1)) {
      if (end - start < 2) {
        if (thirdNumber > 1 && start > 0) {
          // Include the previous light
          start = start - 1;
          end = start + 2;
        } else if (thirdNumber < 3 && end < len) {
          // Include the next light
          end = end + 1;
        }
        // Handle boundary conditions
        start = Math.max(0, start);
        end = Math.min(len, end);
      }
    }

    return lights.slice(start, end);
  }


  /**
   * Retrieves the specified quarter of the lights.
   * @param lights Array of TrackedLight
   * @param quarterNumber Which quarter to retrieve (1, 2, 3, or 4)
   * @returns Array of TrackedLight
   */
  private getQuarter(lights: TrackedLight[], quarterNumber: number): TrackedLight[] {
    const len = lights.length;
    if (len < 4) {
      const quarterSize = Math.ceil(len / 4);
      const start = quarterSize * (quarterNumber - 1);
      const end = start + quarterSize;
      return lights.slice(start, end);
    }

    const base = Math.floor(len / 4);
    const remainder = len % 4;
    const quarters: [number, number][] = [];
    let start = 0;
    let end = 0;

    for (let i = 1; i <= 4; i++) {
      end += base + (i <= remainder ? 1 : 0);
      quarters.push([start, end]);
      start = end;
    }

    const quarter = quarters.find((_, index) => index + 1 === quarterNumber);
    return quarter ? lights.slice(quarter[0], quarter[1]) : [];
  }

  /**
   * Retrieves the outter half of lights. Major variant gives more lights to outter areas.
   * 
   * Examples:
   * - 4 lights: outter = [1,4], inner = [2,3] (50% outter, 50% inner)
   * - 6 lights: outter = [1,2,5,6], inner = [3,4] (67% outter, 33% inner)  
   * - 8 lights: outter = [1,2,7,8], inner = [3,4,5,6] (50% outter, 50% inner)
   * 
   * Note: Major/minor only differs when lights don't divide evenly into halves.
   * 
   * @param lights Array of TrackedLight
   * @returns Array of TrackedLight
   */
  private getOutterHalfMajor(lights: TrackedLight[]): TrackedLight[] {
    const len = lights.length;
    if (len <= 2) return [...lights];
    
    // For even numbers that divide nicely into halves
    if (len % 4 === 0) {
      const outterPerSide = len / 4; // 25% on each side = 50% total outter
      
      const leftOutter = lights.slice(0, outterPerSide);
      const rightOutter = lights.slice(len - outterPerSide);
      return [...leftOutter, ...rightOutter];
    } else {
      // For odd numbers or numbers that don't divide evenly, major gives more to outter
      const outterPerSide = Math.ceil(len / 4);
      const middleIndex = Math.floor(len / 2);
      
      const leftOutter = lights.slice(0, outterPerSide);
      const rightOutter = lights.slice(len - outterPerSide);
      
      // Include middle light in outter for major variant
      if (len % 2 === 1) {
        const middle = [lights[middleIndex]];
        return [...leftOutter, ...middle, ...rightOutter];
      }
      
      return [...leftOutter, ...rightOutter];
    }
  }

  /**
   * Retrieves the outter half of lights. Minor variant gives fewer lights to outter areas.
   * 
   * Examples:
   * - 4 lights: outter = [1,4], inner = [2,3] (50% outter, 50% inner)
   * - 6 lights: outter = [1,6], inner = [2,3,4,5] (33% outter, 67% inner)
   * - 8 lights: outter = [1,2,7,8], inner = [3,4,5,6] (50% outter, 50% inner)
   * 
   * Note: Major/minor only differs when lights don't divide evenly into halves.
   * 
   * @param lights Array of TrackedLight
   * @returns Array of TrackedLight
   */
  private getOutterHalfMinor(lights: TrackedLight[]): TrackedLight[] {
    const len = lights.length;
    if (len <= 2) return [...lights];
    
    // For even numbers that divide nicely into halves
    if (len % 4 === 0) {
      const outterPerSide = len / 4; // 25% on each side = 50% total outter
      
      const leftOutter = lights.slice(0, outterPerSide);
      const rightOutter = lights.slice(len - outterPerSide);
      return [...leftOutter, ...rightOutter];
    } else {
      // For odd numbers or numbers that don't divide evenly, minor gives less to outter
      const outterPerSide = Math.floor(len / 4);
      
      const leftOutter = lights.slice(0, outterPerSide);
      const rightOutter = lights.slice(len - outterPerSide);
      
      return [...leftOutter, ...rightOutter];
    }
  }

  /**
   * Retrieves the inner half of lights with more lights in inner area.
   * 
   * Examples:
   * - 4 lights: inner = [2,3], outter = [1,4] (50% inner, 50% outter)
   * - 6 lights: inner = [3,4], outter = [1,2,5,6] (33% inner, 67% outter)
   * - 8 lights: inner = [3,4,5,6], outter = [1,2,7,8] (50% inner, 50% outter)
   * 
   * @param lights Array of TrackedLight
   * @returns Array of TrackedLight
   */
  private getInnerHalfMajor(lights: TrackedLight[]): TrackedLight[] {
    const len = lights.length;
    if (len <= 2) return [...lights];
    
    const outterLights = this.getOutterHalfMinor(lights);
    const outterIds = new Set(outterLights.map(l => l.id));
    return lights.filter(light => !outterIds.has(light.id));
  }

  /**
   * Retrieves the inner half of lights with fewer lights in inner area.
   * 
   * Examples:
   * - 4 lights: inner = [2,3], outter = [1,4] (50% inner, 50% outter)
   * - 6 lights: inner = [2,3,4,5], outter = [1,6] (67% inner, 33% outter)
   * - 8 lights: inner = [3,4,5,6], outter = [1,2,7,8] (50% inner, 50% outter)
   * 
   * Note: Major/minor only differs when lights don't divide evenly into halves.
   * 
   * @param lights Array of TrackedLight
   * @returns Array of TrackedLight
   */
  private getInnerHalfMinor(lights: TrackedLight[]): TrackedLight[] {
    const len = lights.length;
    if (len <= 2) return [...lights];
    
    const outterLights = this.getOutterHalfMajor(lights);
    const outterIds = new Set(outterLights.map(l => l.id));
    return lights.filter(light => !outterIds.has(light.id));
  }

  /**
   * Get the total number of DMX lights in the configuration
   */
  public getTotalDmxLightCount(): number {
    return this.config.numLights;
  }

  /**
   * Sets a new lighting configuration.
   * Erases all existing data and initializes with the new configuration.
   * @param config New LightingConfiguration
   */
  public setConfiguration(config: LightingConfiguration): void {
    this.config = config;
    this.initializeLights();
    this.initializeDmxLights(); // Re-initialize the _dmxLights map with the new configuration
    this._lightsCache.clear(); // Clear cache when configuration changes
  }

  /**
   * Shuts down the LightController by clearing all local tracking data.
   */
  public shutdown(): void {
    this._frontLights = [];
    this._backLights = [];
    this._strobeLights = [];
    this._dmxLights.clear();
    this._lightsCache.clear(); // Clear cache during shutdown
    this.config = {} as LightingConfiguration;
  }
}