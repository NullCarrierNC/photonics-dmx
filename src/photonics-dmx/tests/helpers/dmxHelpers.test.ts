import { getColor, setGlobalBrightnessConfig, getGlobalBrightnessConfig } from '../../helpers/dmxHelpers';

describe('dmxHelpers brightness configuration', () => {
  beforeEach(() => {
    // Reset global brightness config before each test
    setGlobalBrightnessConfig(null as any);
  });

  describe('getColor with global brightness config', () => {
    it('should use global brightness configuration when set', () => {
      const globalConfig = {
        low: 20,
        medium: 60,
        high: 120,
        max: 200
      };

      setGlobalBrightnessConfig(globalConfig);
      const result = getColor('red', 'medium');
      
      expect(result.red).toBe(255);
      expect(result.green).toBe(0);
      expect(result.blue).toBe(0);
      expect(result.intensity).toBe(60); // Should use global medium value
    });

    it('should fall back to default values when no global config set', () => {
      const result = getColor('red', 'medium');
      
      expect(result.intensity).toBe(100); // Default medium value
    });
  });

  describe('global brightness configuration', () => {
    it('should set and get global brightness configuration', () => {
      const config = {
        low: 30,
        medium: 70,
        high: 150,
        max: 220
      };

      setGlobalBrightnessConfig(config);
      const retrievedConfig = getGlobalBrightnessConfig();

      expect(retrievedConfig).toEqual(config);
    });

    it('should use global configuration in getColor', () => {
      const globalConfig = {
        low: 25,
        medium: 75,
        high: 125,
        max: 225
      };

      setGlobalBrightnessConfig(globalConfig);
      const result = getColor('blue', 'high');

      expect(result.intensity).toBe(125); // Should use global high value
    });
  });


  describe('brightness level mapping', () => {
    it('should correctly map all brightness levels with global config', () => {
      const config = {
        low: 10,
        medium: 50,
        high: 100,
        max: 150
      };

      setGlobalBrightnessConfig(config);

      const lowResult = getColor('red', 'low');
      const mediumResult = getColor('red', 'medium');
      const highResult = getColor('red', 'high');
      const maxResult = getColor('red', 'max');

      expect(lowResult.intensity).toBe(10);
      expect(mediumResult.intensity).toBe(50);
      expect(highResult.intensity).toBe(100);
      expect(maxResult.intensity).toBe(150);
    });
  });
});
