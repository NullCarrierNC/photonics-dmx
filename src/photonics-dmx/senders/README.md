# Photonics DMX - Senders

This directory contains sender implementations that provide the bridge between the lighting system and physical DMX output devices. Most senders in this directory are **legacy implementations** that have been superseded by the worker thread architecture.

## Current vs Legacy Senders

**⚠️ Most senders in this directory are DEPRECATED and have been replaced by the worker thread architecture.**

| Sender | Status | Replacement |
|--------|--------|-------------|
| **IpcSender** | ✅ **Active** | N/A - Still in use |
| **WorkerSenderAdapter** | ✅ **Active** | N/A - Bridges worker senders to main thread |
| ArtNetSender | ❌ Deprecated | `workers/senders/ArtNetNetworkSender` |
| SacnSender | ❌ Deprecated | `workers/senders/SacnNetworkSender` |
| EnttecProSender | ❌ Deprecated | `workers/senders/EnttecProNetworkSender` |


## Active Senders

### IpcSender

The IPC sender is still actively used and runs in the main process. It sends DMX data to the frontend UI for the DMX preview feature, allowing the UI to display exactly what's being sent to physical devices.

```typescript
const ipcSender = new IpcSender();
await ipcSender.start();

// Send DMX data to renderer process for UI preview
await ipcSender.send(universeBuffer);
```

**Characteristics:**
- Runs in main process (not a worker thread)
- Uses Electron IPC to communicate with renderer
- No external network dependency
- Used for UI DMX preview synchronization

### WorkerSenderAdapter

The `WorkerSenderAdapter` provides a compatibility layer that makes worker-based senders compatible with the legacy `BaseSender` interface. It adapts the newer worker thread senders to work with code expecting the old sender pattern.

```typescript
import { NetworkWorkerManager } from '../workers/NetworkWorkerManager';

const manager = new NetworkWorkerManager();
await manager.initialize();

const adapter = new WorkerSenderAdapter(
  'artnet-main',
  'artnet',
  { host: '192.168.1.100', options: { universe: 1 } },
  manager
);

await adapter.start();
adapter.send(universeBuffer);
```

**How it works:**
1. Wraps a `WorkerSender` (from the worker architecture)
2. Implements the `BaseSender` interface
3. Forwards calls to the underlying worker thread sender
4. Handles both IPC and network senders

## BaseSender Interface

All senders (legacy and active) extend the `BaseSender` abstract class:

```typescript
export abstract class BaseSender {
  public abstract start(): Promise<void>;
  public abstract stop(): Promise<void>;
  public abstract send(universeBuffer: Record<number, number>): Promise<void>;
  protected abstract verifySenderStarted(): void;
  public abstract onSendError(listener: (error: SenderError) => void): void;
  public abstract removeSendError(listener: (error: SenderError) => void): void;
}
```

### Lifecycle

1. **Construction**: Create the sender instance with configuration
2. **Start**: Initialize the connection and prepare to send DMX data
3. **Send**: Transmit DMX data (can be called repeatedly)
4. **Stop**: Gracefully shutdown, sending blackout commands if needed

### Common Patterns

**Buffer Management:**
All senders use pre-allocated buffers for performance:

```typescript
// Pre-allocate payload buffer with 512 channels
for (let i = 0; i < 512; i++) {
  this.payloadBuffer[i] = 0;
}
```

**Change Detection:**
Only send when channel values actually change:

```typescript
// Only send if something changed
if (hasChanges) {
  this.universe.update(this.payloadBuffer);
}
```

**Blackout on Stop:**
All senders send a blackout command before shutting down:

```typescript
public async stop(): Promise<void> {
  // Send blackout before stopping
  this.sendBlackout();
  // ... cleanup
}
```

## Legacy Senders (Reference Only)

These senders are kept for reference but should not be used in new code.

### ArtNetSender

Legacy ArtNet implementation. **Use `workers/senders/ArtNetNetworkSender` instead.**

**Key features:**
- 0-based channel indexing (converts DMX 1-based to ArtNet 0-based)
- Configurable refresh interval
- Event-based error handling

### SacnSender

Legacy sACN implementation. **Use `workers/senders/SacnNetworkSender` instead.**

**Key features:**
- 1-based channel indexing (native DMX)
- Support for multicast and unicast
- Built-in refresh rate configuration

### EnttecProSender

Legacy Enttec Pro USB implementation. **Use `workers/senders/EnttecProNetworkSender` instead.**

**Key features:**
- Direct USB device access
- Configurable DMX speed
- Platform-specific device path handling

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│ Main Process                                                 │
│                                                              │
│  ┌──────────────────┐         ┌──────────────────┐          │
│  │ IpcSender        │         │ WorkerSender     │          │
│  │ (Active)         │         │ Adapter          │          │
│  │                  │         │ (Active)          │          │
│  │ Sends to UI      │         │ Proxies to       │          │
│  │ via IPC          │         │ worker thread    │          │
│  └──────────────────┘         └────────┬─────────┘          │
│                                        │                    │
│                                        │ Messages           │
└────────────────────────────────────────┼────────────────────┘
                                         │
                                         ↓
┌────────────────────────────────────────┼────────────────────┐
│ Worker Thread                          │                    │
│                                        ↓                    │
│                            ┌───────────────────────┐        │
│                            │ NetworkWorker         │        │
│                            └───────────┬───────────┘        │
│                                        │                    │
│                ┌───────────────────────┼───────────────────┤
│                │                       │                   │
│     ┌──────────▼──────────┐  ┌────────▼─────────┐          │
│     │ ArtNetNetworkSender │  │ SacnNetworkSender│          │
│     └─────────────────────┘  └──────────────────┘          │
│                                                             │
│     ┌────────────────────────────────────────┐             │
│     │ EnttecProNetworkSender                  │             │
│     └────────────────────────────────────────┘             │
└───────────────────────────────────────────────────────────┘
```

## Migration Guide

If you're maintaining old code that uses the legacy senders:

### Before (Legacy)
```typescript
import { ArtNetSender } from './senders/ArtNetSender';

const sender = new ArtNetSender('192.168.1.100', { universe: 1 });
await sender.start();
await sender.send(universeBuffer);
```

### After (Worker Thread)
```typescript
import { WorkerSenderAdapter } from './senders/WorkerSenderAdapter';
import { NetworkWorkerManager } from './workers/NetworkWorkerManager';

const manager = new NetworkWorkerManager();
await manager.initialize();

const sender = new WorkerSenderAdapter(
  'artnet-main',
  'artnet',
  { host: '192.168.1.100', options: { universe: 1 } },
  manager
);

await sender.start();
sender.send(universeBuffer);
```

## Error Handling

All senders implement event-based error handling:

```typescript
const errorListener = (error: SenderError) => {
  console.error('Sender error:', error.err);
};

sender.onSendError(errorListener);

// Later...
sender.removeSendError(errorListener);
```

Errors are emitted through the `SenderError` event and include the underlying error object for debugging.

## Best Practices

1. **Use worker senders** for all new network sender implementations
2. **Keep IPC sender** in main process for UI synchronization
3. **Always call stop()** to ensure proper blackout
4. **Handle errors** via the error event system
5. **Pre-allocate buffers** for performance
6. **Detect changes** before sending to reduce network traffic

