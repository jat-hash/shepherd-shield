import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import base44Plugin from '@base44/vite-plugin';

export default defineConfig({
  plugins: [
    react(),
    base44Plugin(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom', 'react-router-dom', '@radix-ui/react-select', '@radix-ui/react-popover'],
  },
  optimizeDeps: {
    exclude: ['@base44/sdk'],
    include: ['react', 'react-dom', 'react-router-dom'],
  },
});