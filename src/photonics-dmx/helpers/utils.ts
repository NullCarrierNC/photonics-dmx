export function randomBetween(start:number, end:number): number {
    return Math.floor(Math.random() * (end - start + 1)) + start;
}

  /**
   * Generates a random number within the specified range.
   * @param start The start of the range.
   * @param end The end of the range.
   * @returns A random number within [start, end].
   */
  export function randomInRange(start: number, end: number): number {
    if (typeof start !== 'number' || typeof end !== 'number') {
      console.warn(`Invalid range values: start=${start}, end=${end}`);
      return 0;
    }
    const rand = start + Math.random() * (end - start);
    return Math.round(rand);
  }


  export function clampTo255(value: number): number {
    return Math.max(0, Math.min(255, value));
  }



  /**
 * Shifts an array by half. For even-length arrays, it splits the array into two equal halves.
 * For odd-length arrays, the first half will have one fewer element than the second half.
 *
 * @param array - The array to be shifted.
 * @returns A new array shifted by half.
 */
export function shiftArrayByHalf<T>(array: T[]): T[] {
  const len = array.length;
  if (len === 0) return [];

  const midpoint = Math.floor(len / 2);
  const firstHalf = array.slice(0, midpoint);
  const secondHalf = array.slice(midpoint);

  return secondHalf.concat(firstHalf);
}

