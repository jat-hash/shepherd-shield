import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import base44Plugin from '@base44/vite-plugin';

// Cache bust timestamp: 1774331500
export default defineConfig({
  plugins: [
    react(),
    base44Plugin(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'react': path.resolve(__dirname, './node_modules/react'),
      'react-dom': path.resolve(__dirname, './node_modules/react-dom'),
      'react-dom/client': path.resolve(__dirname, './node_modules/react-dom/client'),
    },
    dedupe: ['react', 'react-dom', 'react-router-dom'],
  },
  optimizeDeps: {
    force: true,
    exclude: ['@base44/sdk'],
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react-router-dom',
    ],
  },
});