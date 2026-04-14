import {
  getColor,
  setGlobalBrightnessConfig,
  getGlobalBrightnessConfig,
  logicalPanDir,
  mirrorDmxForMovingHeadInvert,
  percentToDmx,
} from '../../helpers/dmxHelpers'

describe('logicalPanDir', () => {
  it('CW=true, invertPan=false → 1 (physical observation matches logical)', () => {
    expect(logicalPanDir({ panDirectionCW: true, invertPan: false })).toBe(1)
  })

  it('CW=true, invertPan=true → -1 (invert flips logical direction)', () => {
    expect(logicalPanDir({ panDirectionCW: true, invertPan: true })).toBe(-1)
  })

  it('CW=false, invertPan=false → -1 (CCW fixture)', () => {
    expect(logicalPanDir({ panDirectionCW: false, invertPan: false })).toBe(-1)
  })

  it('CW=false, invertPan=true → 1 (double negation restores CW logic)', () => {
    expect(logicalPanDir({ panDirectionCW: false, invertPan: true })).toBe(1)
  })
})

describe('mirrorDmxForMovingHeadInvert', () => {
  it('is an involution (double mirror returns original DMX)', () => {
    const min = 0
    const max = 255
    for (const d of [0, 64, 128, 255]) {
      const m = mirrorDmxForMovingHeadInvert(d, min, max)
      const back = mirrorDmxForMovingHeadInvert(m, min, max)
      expect(back).toBe(d)
    }
  })

  it('maps logical mid to complementary wire value and back', () => {
    const min = 0
    const max = 255
    const logical50 = percentToDmx(50, min, max)
    const onWire = mirrorDmxForMovingHeadInvert(logical50, min, max)
    expect(onWire).toBeGreaterThan(0)
    expect(mirrorDmxForMovingHeadInvert(onWire, min, max)).toBe(logical50)
  })

  it('boundary: dmx=min maps to max, dmx=max maps to min', () => {
    expect(mirrorDmxForMovingHeadInvert(0, 0, 255)).toBe(255)
    expect(mirrorDmxForMovingHeadInvert(255, 0, 255)).toBe(0)
  })

  it('non-standard range: min=10, max=200 preserves involution', () => {
    const min = 10
    const max = 200
    for (const d of [10, 50, 105, 150, 200]) {
      const m = mirrorDmxForMovingHeadInvert(d, min, max)
      expect(m).toBeGreaterThanOrEqual(min)
      expect(m).toBeLessThanOrEqual(max)
      expect(mirrorDmxForMovingHeadInvert(m, min, max)).toBe(d)
    }
  })

  it('asymmetric home: percentToDmx(25) mirrors to expected complement', () => {
    const min = 0
    const max = 255
    const logical25 = percentToDmx(25, min, max)
    const mirrored = mirrorDmxForMovingHeadInvert(logical25, min, max)
    const expected = max - (logical25 - min)
    expect(mirrored).toBe(expected)
  })
})

describe('dmxHelpers brightness configuration', () => {
  beforeEach(() => {
    // Reset global brightness config before each test
    setGlobalBrightnessConfig(null as any)
  })

  describe('getColor with global brightness config', () => {
    it('should use global brightness configuration when set', () => {
      const globalConfig = {
        low: 20,
        medium: 60,
        high: 120,
        max: 200,
      }

      setGlobalBrightnessConfig(globalConfig)
      const result = getColor('red', 'medium')

      expect(result.red).toBe(255)
      expect(result.green).toBe(0)
      expect(result.blue).toBe(0)
      expect(result.intensity).toBe(60) // Should use global medium value
    })

    it('should fall back to default values when no global config set', () => {
      const result = getColor('red', 'medium')

      expect(result.intensity).toBe(100) // Default medium value
    })
  })

  describe('global brightness configuration', () => {
    it('should set and get global brightness configuration', () => {
      const config = {
        low: 30,
        medium: 70,
        high: 150,
        max: 220,
      }

      setGlobalBrightnessConfig(config)
      const retrievedConfig = getGlobalBrightnessConfig()

      expect(retrievedConfig).toEqual(config)
    })

    it('should use global configuration in getColor', () => {
      const globalConfig = {
        low: 25,
        medium: 75,
        high: 125,
        max: 225,
      }

      setGlobalBrightnessConfig(globalConfig)
      const result = getColor('blue', 'high')

      expect(result.intensity).toBe(125) // Should use global high value
    })
  })

  describe('brightness level mapping', () => {
    it('should correctly map all brightness levels with global config', () => {
      const config = {
        low: 10,
        medium: 50,
        high: 100,
        max: 150,
      }

      setGlobalBrightnessConfig(config)

      const lowResult = getColor('red', 'low')
      const mediumResult = getColor('red', 'medium')
      const highResult = getColor('red', 'high')
      const maxResult = getColor('red', 'max')

      expect(lowResult.intensity).toBe(10)
      expect(mediumResult.intensity).toBe(50)
      expect(highResult.intensity).toBe(100)
      expect(maxResult.intensity).toBe(150)
    })

    it('should map linear to full intensity (255) regardless of global brightness config', () => {
      const config = {
        low: 10,
        medium: 50,
        high: 100,
        max: 150,
      }

      setGlobalBrightnessConfig(config)
      const linearResult = getColor('red', 'linear')

      expect(linearResult.intensity).toBe(255)
    })
  })
})
