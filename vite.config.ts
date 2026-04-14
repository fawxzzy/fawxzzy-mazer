import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 1300,
    reportCompressedSize: false,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        'visual-proof': resolve(__dirname, 'visual-proof.html'),
        'future-phaser': resolve(__dirname, 'future-phaser.html'),
        planet3d: resolve(__dirname, 'planet3d.html')
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/phaser')) {
            return 'phaser';
          }

          if (id.includes('node_modules')) {
            return 'vendor';
          }
        }
      }
    }
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifestFilename: 'manifest.webmanifest',
      includeAssets: [
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/icon-192-maskable.png',
        'icons/icon-512-maskable.png'
      ],
      manifest: false,
      // Keep localhost development SW-free to prevent stale caches while iterating.
      devOptions: {
        enabled: false
      },
      workbox: {
        cacheId: 'mazer-v1',
        navigateFallbackDenylist: [/^\/__/, /^\/@vite\//],
        skipWaiting: true,
        clientsClaim: true
      }
    })
  ]
});
