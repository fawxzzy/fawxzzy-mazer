import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      devOptions: {
        enabled: false
      },
      manifest: {
        name: 'Mazer',
        short_name: 'Mazer',
        description: 'Mazer rebuild foundation',
        theme_color: '#101018',
        background_color: '#101018',
        display: 'standalone'
      }
    })
  ]
});
