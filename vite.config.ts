import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifestFilename: 'manifest.webmanifest',
      includeAssets: [
        'favicon.svg',
        'apple-touch-icon.png',
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/icon-192-maskable.png',
        'icons/icon-512-maskable.png'
      ],
      manifest: false,
      devOptions: {
        enabled: false
      },
      workbox: {
        navigateFallbackDenylist: [/^\/__/, /^\/@vite\//],
        skipWaiting: true,
        clientsClaim: true
      }
    })
  ]
});
