
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    return {
      server: {
        port: 3000,
        // TenderLoop is a single-user local application. Do not expose the
        // development/PWA server to the local network.
        host: '127.0.0.1',
        allowedHosts: ['localhost', '127.0.0.1'],
        // The Windows launcher runs this development server as the local app.
        // Never let Chromium reuse an old HTML/module response after an update.
        headers: { 'Cache-Control': 'no-store' },
      },
      plugins: [
        react(),
        tailwindcss(),
        VitePWA({
          registerType: 'autoUpdate',
          manifest: {
            id: '/',
            name: 'TenderLoop',
            short_name: 'TenderLoop',
            description: 'Local-first tendering manager for Schneider Electric',
            start_url: '/',
            scope: '/',
            display: 'standalone',
            display_override: ['window-controls-overlay', 'standalone'],
            background_color: '#ffffff',
            theme_color: '#3DCD58',
            icons: [
              { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
              { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
            ],
          },
          includeAssets: ['icon.svg'],
          workbox: {
            globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
            maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
            // Ensure the SW serves the app shell for all navigation requests
            navigateFallback: '/index.html',
            navigateFallbackDenylist: [/^\/api\//],
          },
          devOptions: {
            // TenderLoop's Windows launcher uses Vite's development server.
            // A development service worker with autoUpdate causes repeated
            // reloads as Vite regenerates files. Keep it off here; production
            // builds still generate and register the PWA service worker.
            enabled: false,
            type: 'module',
          },
        }),
      ],
      resolve: {
        alias: {
          // Source now lives under src/ (ESM-safe path.resolve instead of __dirname).
          '@': path.resolve('./src'),
          // Browser polyfill for Node's `buffer` builtin. Required by
          // iconv-lite/safer-buffer (pulled in by @kenjiuno/msgreader when
          // reading classic-Outlook .msg files); without it Vite serves an
          // empty stub and safer-buffer crashes with
          // "Cannot read properties of undefined (reading 'prototype')".
          // The trailing slash forces resolution to the npm package.
          buffer: 'buffer/',
        }
      }
    };
});
