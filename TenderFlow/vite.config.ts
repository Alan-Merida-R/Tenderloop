import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  server: {
    port: 3003,
    // Tender Flow is a single-user local application, same as OpportunityOS.
    // Do not expose the development server to the local network.
    host: '127.0.0.1',
    allowedHosts: ['localhost', '127.0.0.1'],
    headers: { 'Cache-Control': 'no-store' },
  },
  plugins: [react()],
});
