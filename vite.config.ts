
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
          // Use public/manifest.json instead of auto-generating one
          manifest: false,
          // Include the manifest in the service worker precache list
          includeAssets: ['icon.svg', 'manifest.json'],
          workbox: {
            globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
            maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
            // Ensure the SW serves the app shell for all navigation requests
            navigateFallback: '/index.html',
            navigateFallbackDenylist: [/^\/api\//],
          },
          devOptions: {
            enabled: false,
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
