import { IpcMain, BrowserWindow } from 'electron';
import { ControllerManager } from '../controllers/ControllerManager';
import { SenderConfig } from '../../photonics-dmx/types';
import { ipcError } from './ipcResult';
import { LIGHT, RENDERER_RECEIVE } from '../../shared/ipcChannels';

/**
 * Set up sender-related IPC handlers (enable/disable, sACN config, network interfaces).
 */
export function setupSenderHandlers(ipcMain: IpcMain, controllerManager: ControllerManager): void {
  ipcMain.on(LIGHT.SENDER_ENABLE, async (_, data: SenderConfig) => {
    try {
      const { sender, port, host, universe, net, subnet, subuni, artNetPort } = data;

      if (!sender) {
        console.error('Sender name is required');
        return;
      }

      const senderManager = controllerManager.getSenderManager();

      if (senderManager.isSenderEnabled(sender)) {
        console.log(`Sender "${sender}" is already enabled`);
        return;
      }

      let config: Record<string, unknown> = {};

      if (sender === 'sacn') {
        const universeNum = (universe !== undefined && universe !== null) ? Number(universe) : 1;
        if (universeNum < 0 || universeNum > 63999) {
          console.error(`Invalid SACN universe: ${universeNum}. Must be between 0-63999`);
          return;
        }
        const networkInterface = data.networkInterface;
        const useUnicast = data.useUnicast;
        const unicastDestination = data.unicastDestination;
        config = {
          universe: universeNum,
          networkInterface: networkInterface,
          useUnicast: useUnicast,
          unicastDestination: unicastDestination,
        };
        console.log(`sACN config: universe=${universeNum}, networkInterface=${networkInterface}, useUnicast=${useUnicast}, unicastDestination=${unicastDestination}`);
      } else if (sender === 'ipc') {
        config = {};
      } else if (sender === 'enttecpro') {
        if (!port) {
          console.error('Port is required for EnttecPro sender');
          return;
        }
        const universeNum = (universe !== undefined && universe !== null) ? Number(universe) : 0;
        config = { devicePath: port, universe: universeNum };
      } else if (sender === 'opendmx') {
        if (!port) {
          console.error('Port is required for OpenDMX sender');
          return;
        }
        const dmxSpeed = typeof data.dmxSpeed === 'number' && data.dmxSpeed > 0 ? data.dmxSpeed : undefined;
        const universeNum = (universe !== undefined && universe !== null) ? Number(universe) : 0;
        config = { devicePath: port, dmxSpeed, universe: universeNum };
      } else if (sender === 'artnet') {
        config = {
          host: host || '127.0.0.1',
          options: {
            universe: universe !== undefined ? universe : 0,
            net: net !== undefined ? net : 0,
            subnet: subnet !== undefined ? subnet : 0,
            subuni: subuni !== undefined ? subuni : 0,
            port: artNetPort !== undefined ? artNetPort : 6454,
            base_refresh_interval: 1000
          }
        };
      }

      console.log(`Enabling ${sender} sender with config:`, config);
      try {
        await senderManager.enableSender(sender, sender as 'artnet' | 'sacn' | 'enttecpro' | 'opendmx' | 'ipc', config);
        console.log(`Successfully enabled ${sender} sender`);
      } catch (error) {
        console.error(`Failed to enable ${sender} sender:`, error);
        const mainWindow = BrowserWindow.getFocusedWindow();
        if (mainWindow) {
          mainWindow.webContents.send(RENDERER_RECEIVE.SENDER_START_FAILED, {
            sender: sender,
            error: ipcError(error).error
          });
        }
        throw error;
      }
    } catch (error) {
      console.error('Error enabling sender:', error);
    }
  });

  ipcMain.on(LIGHT.SENDER_DISABLE, (_, data: { sender: string }) => {
    try {
      const { sender } = data;
      if (!sender) {
        console.error('Sender name is required');
        return;
      }
      controllerManager.getSenderManager().disableSender(sender);
    } catch (error) {
      console.error('Error disabling sender:', error);
    }
  });

  ipcMain.handle(LIGHT.UPDATE_SACN_CONFIG, async (_, config: Record<string, unknown>) => {
    try {
      const senderManager = controllerManager.getSenderManager();
      if (senderManager.getEnabledSenders().includes('sacn')) {
        await senderManager.restartSender('sacn', {
          senderType: 'sacn',
          ...config
        });
        console.log('sACN configuration updated and sender restarted');
      } else {
        console.log('sACN not currently enabled, configuration saved for next enable');
      }
      return { success: true };
    } catch (error) {
      console.error('Error updating sACN configuration:', error);
      throw error;
    }
  });

  ipcMain.handle(LIGHT.GET_NETWORK_INTERFACES, async () => {
    try {
      const os = require('os');
      const networkInterfaces = os.networkInterfaces();
      const interfaces: Array<{ name: string; value: string; family: string }> = [];

      for (const [name, ifaceArray] of Object.entries(networkInterfaces)) {
        const interfaceList = Array.isArray(ifaceArray) ? ifaceArray : [];
        for (const iface of interfaceList) {
          if (!iface.internal && !iface.address.startsWith('127.')) {
            interfaces.push({
              name: `${name}: ${iface.address}`,
              value: iface.address,
              family: iface.family
            });
          }
        }
      }

      return {
        success: true,
        interfaces
      };
    } catch (error) {
      console.error('Error getting network interfaces:', error);
      return {
        ...ipcError(error),
        interfaces: []
      };
    }
  });
}
