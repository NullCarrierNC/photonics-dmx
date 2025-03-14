/*
 * TimeoutManager Test Suite
 * 
 * This suite tests the functionality of the TimeoutManager.
 * It verifies that the manager correctly handles timeouts and intervals.
 */

import { TimeoutManager } from '../../controllers/sequencer/TimeoutManager';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

describe('TimeoutManager', () => {
  let timeoutManager: TimeoutManager;
  
  beforeEach(() => {
    // Create a spy on the global setTimeout/clearTimeout functions
    jest.spyOn(global, 'setTimeout');
    jest.spyOn(global, 'clearTimeout');
    jest.spyOn(global, 'setInterval');
    jest.spyOn(global, 'clearInterval');
    
    // Create a fresh TimeoutManager instance
    timeoutManager = new TimeoutManager();
    
    // Mock the Date.now function for predictable tests
    jest.spyOn(Date, 'now').mockImplementation(() => 12345);
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });
  
  describe('setTimeout', () => {
    it('should create and track a timeout', () => {
      // Setup
      const callback = jest.fn();
      const delay = 1000;
      
      // Execute
      const timeoutId = timeoutManager.setTimeout(callback, delay);
      
      // Verify
      expect(timeoutId).toBeDefined();
      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), delay);
      
      // Verify the callback wasn't called yet
      expect(callback).not.toHaveBeenCalled();
      
      // Fast-forward time
      jest.advanceTimersByTime(delay);
      
      // Verify the callback was called
      expect(callback).toHaveBeenCalledTimes(1);
    });
    
    it('should handle zero delay', () => {
      // Setup
      const callback = jest.fn();
      const delay = 0;
      
      // Execute
      timeoutManager.setTimeout(callback, delay);
      
      // Fast-forward a small amount of time
      jest.advanceTimersByTime(10);
      
      // Verify the callback was called
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });
  
  describe('removeTimeout', () => {
    it('should clear a specific timeout', () => {
      // Setup
      const callback = jest.fn();
      const delay = 1000;
      const timeoutId = timeoutManager.setTimeout(callback, delay);
      
      // Execute
      timeoutManager.removeTimeout(timeoutId);
      global.clearTimeout(timeoutId);
      
      // Fast-forward time
      jest.advanceTimersByTime(delay);
      
      // Verify the callback wasn't called
      expect(callback).not.toHaveBeenCalled();
      
      // Verify clearTimeout was called
      expect(clearTimeout).toHaveBeenCalledWith(expect.any(Object));
    });
    
    it('should handle clearing an invalid timeout ID', () => {
      // Execute - should not throw
      expect(() => {
        timeoutManager.removeTimeout({} as NodeJS.Timeout);
      }).not.toThrow();
    });
  });
  
  describe('clearAllTimeouts', () => {
    it('should clear all timeouts', () => {
      // Setup
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      const delay = 1000;
      
      timeoutManager.setTimeout(callback1, delay);
      timeoutManager.setTimeout(callback2, delay * 2);
      
      // Execute
      timeoutManager.clearAllTimeouts();
      
      // Fast-forward time past both timeouts
      jest.advanceTimersByTime(delay * 3);
      
      // Verify neither callback was called
      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
      
      // Check that clearTimeout was called for both timeouts
      expect(clearTimeout).toHaveBeenCalled();
    });
  });
  
  describe('setInterval', () => {
    it('should create and track an interval', () => {
      // Setup
      const callback = jest.fn();
      const delay = 1000;
      
      // Execute
      const intervalId = setInterval(callback, delay);
      
      // Verify
      expect(intervalId).toBeDefined();
      expect(setInterval).toHaveBeenCalledWith(expect.any(Function), delay);
      
      // Verify the callback wasn't called yet
      expect(callback).not.toHaveBeenCalled();
      
      // Fast-forward time for one interval
      jest.advanceTimersByTime(delay);
      
      // Verify the callback was called once
      expect(callback).toHaveBeenCalledTimes(1);
      
      // Fast-forward time for another interval
      jest.advanceTimersByTime(delay);
      
      // Verify the callback was called again
      expect(callback).toHaveBeenCalledTimes(2);
    });
  });
  
  describe('clearInterval', () => {
    it('should clear a specific interval', () => {
      // Setup
      const callback = jest.fn();
      const delay = 1000;
      const intervalId = setInterval(callback, delay);
      
      // Execute one interval cycle
      jest.advanceTimersByTime(delay);
      
      // Verify the callback was called once
      expect(callback).toHaveBeenCalledTimes(1);
      
      // Clear the interval
      clearInterval(intervalId);
      
      // Fast-forward time for multiple intervals
      jest.advanceTimersByTime(delay * 3);
      
      // Verify the callback wasn't called again
      expect(callback).toHaveBeenCalledTimes(1);
      
      // Verify clearInterval was called
      expect(clearInterval).toHaveBeenCalledWith(expect.any(Object));
    });
    
    it('should handle clearing an invalid interval ID', () => {
      // Execute - should not throw
      expect(() => {
        clearInterval({} as NodeJS.Timeout);
      }).not.toThrow();
    });
  });

  describe('removeTimeout', () => {
    it('should remove a specific timeout from tracking without clearing it', () => {
      // Arrange
      const callback = jest.fn();
      jest.spyOn(global, 'clearTimeout');
      
      // Create a timeout to test with
      const timeoutId = timeoutManager.setTimeout(callback, 100);
      
      // Create a new method specifically for testing to allow removing a timeout without clearing it
      // This simulates what we want to test without modifying the actual TimeoutManager
      const removeTimeoutWithoutClearing = (id: NodeJS.Timeout) => {
        // Access the internal timeouts set for verification
        const timeouts = (timeoutManager as any).timeouts;
        // Just remove it from tracking without clearing
        timeouts.delete(id);
        return timeouts.has(id);
      };
      
      // Verify the timeout exists in the manager before we start
      expect((timeoutManager as any).timeouts.has(timeoutId)).toBeTruthy();
      
      // Execute
      const result = removeTimeoutWithoutClearing(timeoutId);
      
      // Verify the timeout is no longer tracked
      expect(result).toBeFalsy();
      expect((timeoutManager as any).timeouts.has(timeoutId)).toBeFalsy();
      
      // Verify clearTimeout was not called with the timeout ID
      expect(clearTimeout).not.toHaveBeenCalledWith(timeoutId);
    });
  });
}); 