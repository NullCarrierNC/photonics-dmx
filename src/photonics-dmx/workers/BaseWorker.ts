import { Worker, parentPort } from 'worker_threads';
import { EventEmitter } from 'events';

/**
 * Base worker class for handling common worker thread operations
 */
export abstract class BaseWorker extends EventEmitter {
  protected worker: Worker | null = null;
  protected isTerminating = false;

  constructor(protected workerPath: string) {
    super();
    // Handle different environments (development vs production)
    if (process.env.NODE_ENV === 'development') {
      // In development, use the source file
      if (workerPath.includes('.js') && !workerPath.includes('out/')) {
        // Already a .js file path, use as-is
      } else if (workerPath.includes('.ts')) {
        // Convert .ts to .js for worker loading
        this.workerPath = workerPath.replace('.ts', '.js');
      }
    }
  }

  /**
   * Start the worker thread
   */
  public async start(): Promise<void> {
    if (this.worker) {
      throw new Error('Worker already started');
    }

    return new Promise((resolve, reject) => {
      try {
        this.worker = new Worker(this.workerPath, {
          // Increase stack size for complex operations
          resourceLimits: {
            stackSizeMb: 8,
          },
        });

        this.worker.on('message', (message) => {
          this.handleMessage(message);
        });

        this.worker.on('error', (error) => {
          this.emit('error', error);
          reject(error);
        });

        this.worker.on('exit', (code) => {
          if (code !== 0 && !this.isTerminating) {
            this.emit('error', new Error(`Worker exited with code ${code}`));
          }
          this.worker = null;
        });

        // Wait for worker to signal it's ready
        this.once('ready', () => resolve());
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the worker thread
   */
  public async stop(): Promise<void> {
    if (!this.worker) {
      return;
    }

    this.isTerminating = true;

    return new Promise((resolve) => {
      this.sendMessage({ type: 'SHUTDOWN' });

      // Give worker time to cleanup
      const timeout = setTimeout(() => {
        if (this.worker) {
          this.worker.terminate();
          this.worker = null;
        }
        resolve();
      }, 2000);

      this.once('shutdown_complete', () => {
        clearTimeout(timeout);
        if (this.worker) {
          this.worker.terminate();
          this.worker = null;
        }
        resolve();
      });
    });
  }

  /**
   * Send a message to the worker thread
   */
  protected sendMessage(message: any): void {
    if (this.worker && !this.isTerminating) {
      this.worker.postMessage(message);
    }
  }

  /**
   * Send a message to the worker thread (public method for external access)
   */
  public sendMessageToWorker(message: any): void {
    this.sendMessage(message);
  }

  /**
   * Handle messages from the worker thread
   */
  protected abstract handleMessage(message: any): void;

  /**
   * Check if worker is running
   */
  public isRunning(): boolean {
    return this.worker !== null && !this.isTerminating;
  }
}

/**
 * Worker thread base class (runs in worker thread context)
 */
export abstract class WorkerThread {
  protected isShuttingDown = false;

  constructor() {
    // Signal that worker is ready
    this.sendToMain({ type: 'WORKER_READY' });

    // Handle shutdown messages
    parentPort?.on('message', (message) => {
      if (message.type === 'SHUTDOWN') {
        this.shutdown();
      } else {
        this.handleMainMessage(message);
      }
    });

    // Handle process termination
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  /**
   * Send message to main thread
   */
  protected sendToMain(message: any): void {
    if (parentPort && !this.isShuttingDown) {
      parentPort.postMessage(message);
    }
  }

  /**
   * Handle messages from main thread
   */
  protected abstract handleMainMessage(message: any): void;

  /**
   * Shutdown the worker
   */
  protected async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    await this.onShutdown();
    this.sendToMain({ type: 'SHUTDOWN_COMPLETE' });
    process.exit(0);
  }

  /**
   * Override this method for custom shutdown logic
   */
  protected abstract onShutdown(): Promise<void>;
}
