# Photonics DMX - Worker Thread Architecture

The worker thread architecture isolates network I/O operations from the main UI thread, preventing network activity from causing UI freezes or blocking the lighting sequencer.

## Why Worker Threads?

Network operations like sending DMX data over ArtNet or sACN are inherently I/O-bound and can take time to complete. When these operations run on the main thread, they can:
- Freeze the UI during network operations
- Block the lighting sequencer's central clock
- Cause stuttering or dropped frames in lighting transitions

By moving network operations to a separate worker thread, the main application remains responsive and lighting updates continue smoothly regardless of network latency or connection issues.

## Architecture Overview

The worker architecture consists of several key components:

1. **NetworkWorkerManager**: Manages the worker thread lifecycle from the main thread. Handles message routing and provides a clean API for creating and managing senders.
2. **BaseWorker**: Abstract base class that provides common worker thread management functionality for both main and worker contexts.
3. **NetworkWorker**: The actual worker thread that runs in isolation. Handles message processing and manages sender lifecycle.
4. **NetworkSender Implementations**: Protocol-specific sender implementations (ArtNet, sACN, Enttec Pro) that run inside the worker thread.

## Communication Architecture

The worker architecture uses Node.js's built-in `worker_threads` for inter-process communication:

```
Main Thread                     Worker Thread
============                    =============

NetworkWorkerManager    ←→      NetworkWorker
       │                              │
       ↓                              ↓
  WorkerSender                NetworkSender(s)
```

### Message Flow

Messages flow between threads using a simple type-based protocol:

**Main to Worker:**
- `CREATE_SENDER`: Create a new sender instance
- `START_SENDER`: Start an existing sender
- `STOP_SENDER`: Stop a sender
- `SEND_DMX`: Send DMX data to a sender
- `SEND_BLACKOUT`: Send blackout command to a sender
- `SHUTDOWN`: Gracefully shutdown the worker

**Worker to Main:**
- `WORKER_READY`: Worker has initialized and is ready
- `SENDER_CREATED`: A sender was successfully created
- `SENDER_STARTED`: A sender has been started
- `SENDER_STOPPED`: A sender has been stopped
- `SENDER_ERROR`: An error occurred during sender operation
- `SEND_ERROR`: An error occurred while sending DMX data
- `WORKER_ERROR`: An unhandled error occurred in the worker
- `SHUTDOWN_COMPLETE`: Worker has completed shutdown

### Example: Creating and Using a Sender

```typescript
// In main thread
import { NetworkWorkerManager } from './workers/NetworkWorkerManager';

const manager = new NetworkWorkerManager();
await manager.initialize();

// Create an ArtNet sender
const sender = await manager.createSender(
  'artnet-main',
  'artnet',
  {
    host: '192.168.1.100',
    options: {
      universe: 1,
      net: 0,
      subnet: 0,
      base_refresh_interval: 1000
    }
  }
);

// Start the sender
await sender.start();

// Send DMX data
const universeBuffer: Record<number, number> = {
  1: 255,  // Channel 1 at full intensity
  2: 128,  // Channel 2 at half intensity
  3: 64    // Channel 3 at quarter intensity
};

sender.send(universeBuffer);

// Cleanup
await sender.stop();
await manager.shutdown();
```

## Sender Implementations

Each network protocol has its own sender implementation that runs within the worker thread:

### ArtNet Sender

```typescript
// ArtNetNetworkSender configuration
{
  host: '192.168.1.100',
  options: {
    universe: 1,
    net: 0,
    subnet: 0,
    base_refresh_interval: 1000  // Refresh rate for unchanged frames
  }
}
```

**Features:**
- 0-based channel indexing (DMX channels mapped to 0-511)
- Automatic refresh interval for maintaining connection
- 10-second connection timeout to prevent hanging
- Blackout command sent automatically on stop

### sACN (Streaming ACN) Sender

```typescript
// SacnNetworkSender configuration
{
  universe: 1,
  networkInterface: '192.168.1.50',  // Optional: specific interface
  useUnicast: true,
  unicastDestination: '192.168.1.100'
}
```

**Features:**
- 1-based channel indexing (DMX channels mapped to 1-512)
- Support for broadcast and unicast modes
- Network interface selection (auto-detect or specific interface)
- Universe validation (1-63999)
- Initial blackout packet to establish connection
- Fire-and-forget sending with error handling

### Enttec Pro Sender

```typescript
// EnttecProNetworkSender configuration
{
  devicePath: '/dev/ttyUSB0'  // Unix/Mac
  // or
  devicePath: 'COM3'          // Windows
}
```

**Features:**
- 0-based channel indexing
- Direct USB device access
- Automatic blackout on stop
- Pre-allocated buffers for performance

## Thread Lifecycle

### Startup Sequence

1. **Main thread** calls `NetworkWorkerManager.initialize()`
2. Manager spawns the worker thread
3. Worker thread loads and instantiates `NetworkWorker`
4. Worker sends `WORKER_READY` message
5. Main thread receives ready signal and completes initialization

### Sender Creation and Usage

1. Main thread requests sender creation via `createSender()`
2. Manager sends `CREATE_SENDER` message to worker
3. Worker instantiates appropriate sender class
4. Worker sends `SENDER_CREATED` confirmation
5. Main thread returns `WorkerSender` wrapper
6. Calling code uses `start()` to activate the sender
7. Worker sends `SENDER_STARTED` confirmation
8. DMX data flows via `SEND_DMX` messages

### Shutdown Sequence

1. Main thread calls `shutdown()` on manager
2. All senders are stopped individually
3. Manager sends `SHUTDOWN` message to worker
4. Worker stops all senders and sends blackout commands
5. Worker sends `SHUTDOWN_COMPLETE` confirmation
6. Main thread terminates worker process

## Performance Optimizations

The worker implementations include several performance optimizations:

### Change Detection

Senders only transmit when channel values actually change:

```typescript
// Only sends if something changed
if (hasChanges) {
  this.universe.update(this.payloadBuffer);
}
```

This prevents unnecessary network traffic when lighting states remain unchanged.

### Pre-allocated Buffers

Each sender pre-allocates a 512-channel buffer on construction to avoid memory allocation during runtime:

```typescript
// Pre-allocate payload buffer with 512 channels
for (let i = 0; i < 512; i++) {
  this.payloadBuffer[i] = 0;
}
```

### Index Mapping

Each protocol handles the DMX 1-based vs protocol-specific indexing:

- **ArtNet/Enttec**: Converts DMX channels (1-512) to protocol channels (0-511)
- **sACN**: Uses native 1-based indexing (1-512)

### Fire-and-Forget Sending

sACN uses fire-and-forget sending with error callbacks to avoid blocking:

```typescript
this.sender.send({ payload: this.payloadBuffer }).catch((error: Error) => {
  console.error(`sACN send error: ${error.message}`);
  this.sendError(`sACN send error: ${error.message}`);
});
```

## Error Handling

The worker thread includes comprehensive error handling:

### Global Error Handlers

```typescript
process.on('uncaughtException', (error) => {
  console.error('NetworkWorker: Uncaught exception:', error);
  this.sendToMain({
    type: 'WORKER_ERROR',
    error: `Uncaught exception: ${error.message}`,
    stack: error.stack
  });
});

process.on('unhandledRejection', (reason) => {
  console.error('NetworkWorker: Unhandled rejection:', reason);
  this.sendToMain({
    type: 'WORKER_ERROR',
    error: `Unhandled rejection: ${reason}`
  });
});
```

### Sender-Level Error Handling

Each sender operation is wrapped in try-catch blocks that forward errors to the main thread:

```typescript
try {
  sender.send(universeBuffer);
} catch (error) {
  this.sendToMain({
    type: 'SEND_ERROR',
    senderId,
    error: error instanceof Error ? error.message : String(error)
  });
}
```

## Extending the Worker

To add a new sender type:

1. Create a new sender class extending `NetworkSender` in `workers/senders/`
2. Implement the required abstract methods: `start()`, `stop()`, `send()`, `sendBlackout()`
3. Add a case in `NetworkWorker.createSender()` to instantiate the new sender
4. Export the new sender from the senders directory

Example:

```typescript
// workers/senders/MyProtocolNetworkSender.ts
import { NetworkSender } from './NetworkSender';

export class MyProtocolNetworkSender extends NetworkSender {
  constructor(private config: any) {
    super();
  }

  public async start(): Promise<void> {
    // Initialize your protocol
  }

  public async stop(): Promise<void> {
    // Cleanup your protocol
  }

  public send(universeBuffer: Record<number, number>): void {
    // Send DMX data
  }

  public sendBlackout(): void {
    // Send blackout command
  }
}
```

Then add to `NetworkWorker.ts`:

```typescript
case 'myprotocol':
  sender = new MyProtocolNetworkSender(config);
  break;
```

## Best Practices

1. **Always stop senders** before shutting down the worker to ensure proper blackout
2. **Handle errors gracefully** - network errors shouldn't crash the application
3. **Pre-allocate buffers** for performance-critical operations
4. **Use change detection** to avoid unnecessary network traffic
5. **Implement blackout commands** to prevent lights from staying on when the application exits
6. **Log errors** for debugging network issues

