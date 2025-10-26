import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@photonics-dmx': resolve('src/photonics-dmx'), // Ensure this alias exists for the main process
      },
    },
    build: {
      watch: {}, // Enable watch mode for hot reload,
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: false,
        },
        mangle: true,
      },
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
          // Include worker files as separate entry points
          'workers/NetworkWorker': resolve('src/photonics-dmx/workers/NetworkWorker.ts'),
        },
        output: {
          entryFileNames: (chunkInfo) => {
            // Main entry should be index.js for electron-vite
            if (chunkInfo.name === 'index') {
              return 'index.js';
            }
            // Put worker files in a workers subdirectory
            if (chunkInfo.name.startsWith('workers/')) {
              return `workers/${chunkInfo.name.replace('workers/', '')}.js`;
            }
            return '[name].js';
          },
        },
      },
    },
    publicDir: 'static',
    assetsInclude: ['**/*.json']
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@photonics-dmx': resolve('src/photonics-dmx'),
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@photonics-dmx': resolve('src/photonics-dmx'),
      },
    },
    plugins: [react()],
  },
});