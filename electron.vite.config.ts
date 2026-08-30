import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@photonics-dmx': resolve('src/photonics-dmx'), // Ensure this alias exists for the main process
      },
    },
    build: {
      // electron-vite's built-in version table stops at Electron 34 and falls back to its
      // oldest entry, so pin what Electron 43 actually ships: Chromium 150 / Node 24.18.
      target: 'node24.18',
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
        },
        output: {
          entryFileNames: (chunkInfo) => {
            // Main entry should be index.js for electron-vite
            if (chunkInfo.name === 'index') {
              return 'index.js'
            }
            // Put worker files in a workers subdirectory
            if (chunkInfo.name.startsWith('workers/')) {
              return `workers/${chunkInfo.name.replace('workers/', '')}.js`
            }
            return '[name].js'
          },
        },
      },
    },
    publicDir: 'static',
    assetsInclude: ['**/*.json'],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@photonics-dmx': resolve('src/photonics-dmx'),
      },
    },
    build: {
      target: 'node24.18',
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
    build: {
      target: 'chrome150',
    },
  },
})
