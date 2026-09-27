import { describe, expect, it, jest } from '@jest/globals'
import { loopbackSender } from '../../wireCheck/loopbackSender'
import { ArtNetSender } from '../../../photonics-dmx/senders/ArtNetSender'
import { SacnSender } from '../../../photonics-dmx/senders/SacnSender'

jest.mock('../../../photonics-dmx/senders/SacnSender')
jest.mock('../../../photonics-dmx/senders/ArtNetSender')

describe('loopbackSender', () => {
  it('aims a unicast sACN sender at this machine on the port, at the default rate', () => {
    loopbackSender({ protocol: 'sacn', port: 5599 })
    expect(jest.mocked(SacnSender)).toHaveBeenCalledWith({
      universe: 1,
      useUnicast: true,
      unicastDestination: '127.0.0.1',
      port: 5599,
      maxOutputRate: 44,
      minRefreshRate: 44,
    })
  })

  it('aims an Art-Net sender at this machine on the port, resending as the app does', () => {
    loopbackSender({ protocol: 'artnet', port: 5600, universe: 3 })
    expect(jest.mocked(ArtNetSender)).toHaveBeenCalledWith('127.0.0.1', {
      universe: 3,
      net: 0,
      subnet: 0,
      subuni: 0,
      port: 5600,
      base_refresh_interval: 23,
      maxOutputRate: 44,
    })
  })
})
