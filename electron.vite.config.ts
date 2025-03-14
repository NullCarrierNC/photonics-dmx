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