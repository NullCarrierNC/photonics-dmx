import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { dialog } from 'electron'
import { readFile } from 'fs/promises'
import { RIGS } from '../../../shared/ipcChannels'
import { registerLightsRigsConfigHandlers } from '../../ipc/config/lights-rigs-handlers'

jest.mock('electron', () => ({
  ipcMain: { handle: jest.fn(), on: jest.fn() },
  dialog: { showSaveDialog: jest.fn(), showOpenDialog: jest.fn() },
}))

jest.mock('fs/promises', () => ({
  writeFile: jest.fn(),
  readFile: jest.fn(),
}))

type AsyncMock = jest.Mock<(...args: unknown[]) => Promise<unknown>>
const mockShowOpenDialog = dialog.showOpenDialog as unknown as AsyncMock
const mockReadFile = readFile as unknown as AsyncMock

const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>()
const ipcMain = {
  handle: (channel: string, handler: (...args: unknown[]) => Promise<unknown>) =>
    handlers.set(channel, handler),
  on: jest.fn(),
}

const rigLight = {
  id: 'l1',
  fixtureId: 't1',
  position: 1,
  fixture: 'rgb',
  label: 'RGB',
  name: 'RGB',
  isStrobeEnabled: false,
  group: 'front',
  mount: 'floor',
  channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 },
}

const rigFile = (templates: unknown[]) => ({
  formatVersion: 1,
  type: 'photonics-rig',
  rig: {
    id: 'r1',
    name: 'My Rig',
    active: true,
    config: {
      numLights: 1,
      lightLayout: { id: 'front', label: 'Front only' },
      strobeType: 'None',
      frontLights: [rigLight],
      backLights: [],
      strobeLights: [],
    },
  },
  templates,
})

async function importFile(file: unknown): Promise<Record<string, unknown>> {
  mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/in/rig.json'] })
  mockReadFile.mockResolvedValue(JSON.stringify(file))
  const handler = handlers.get(RIGS.IMPORT_PICK)
  if (!handler) throw new Error('import handler not registered')
  return (await handler(null, undefined)) as Record<string, unknown>
}

describe('rig import', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    handlers.clear()
    registerLightsRigsConfigHandlers(ipcMain as never, {} as never)
  })

  it('repairs a template stored without a channel map', async () => {
    const result = await importFile(
      rigFile([
        {
          id: 't1',
          position: 0,
          fixture: 'rgb',
          label: 'RGB',
          name: 'RGB',
          isStrobeEnabled: false,
        },
      ]),
    )

    expect(result.success).toBe(true)
    expect(result.templates).toEqual([
      expect.objectContaining({
        id: 't1',
        channels: { masterDimmer: 0, red: 0, green: 0, blue: 0 },
      }),
    ])
    expect(result.repairs).toEqual([expect.stringContaining('templates[0].channels')])
  })

  it('upgrades a template of a retired fixture type', async () => {
    const result = await importFile(
      rigFile([
        {
          id: 't1',
          position: 0,
          fixture: 'rgbw',
          label: 'RGBW',
          name: 'RGBW',
          isStrobeEnabled: false,
          channels: { masterDimmer: 1, red: 2, green: 3, blue: 4, white: 5 },
        },
      ]),
    )

    expect(result.success).toBe(true)
    expect(result.templates).toEqual([
      expect.objectContaining({
        fixture: 'rgb',
        extraChannels: [{ type: 'white', channel: 5 }],
      }),
    ])
    expect(result.repairs).toEqual([])
  })

  it('refuses a template whose fixture type no build wrote', async () => {
    const result = await importFile(
      rigFile([
        {
          id: 't1',
          position: 0,
          fixture: 'laser',
          label: 'L',
          name: 'L',
          isStrobeEnabled: false,
          channels: { masterDimmer: 1 },
        },
      ]),
    )

    expect(result).toEqual({ success: false, error: expect.stringContaining('laser') })
  })
})
