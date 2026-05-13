
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        tailwindcss(),
        VitePWA({
          registerType: 'autoUpdate',
          manifest: false, // we use our own public/manifest.json
          workbox: {
            // Cache everything for offline use — TenderLoop is local-first
            globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
            // Don't precache large chunks — let the browser decide
            maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          },
          devOptions: {
            enabled: false, // disable SW in dev to avoid stale cache during development
          },
        }),
      ],
      resolve: {
        alias: {
          // Fix: Replace __dirname with path.resolve('.') for ESM compatibility
          '@': path.resolve('.'),
        }
      }
    };
});
